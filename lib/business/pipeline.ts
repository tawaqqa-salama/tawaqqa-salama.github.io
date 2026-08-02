import type { ClientRecord, PipelineStage } from '@/lib/types/client';
import { isFinancialApproved } from '@/lib/business/workflow-stages';

export function hasQuotation(client: Pick<ClientRecord, 'quotation_number' | 'quotation_amount'>): boolean {
  return Boolean(client.quotation_number) && Number(client.quotation_amount || 0) > 0;
}

/** هل يوجد عمل تقارير/هندسة محفوظ فعلياً على السجل؟ */
export function hasEngineeringWork(client: Partial<ClientRecord>): boolean {
  if (client.engineering_status && client.engineering_status !== 'جديد') return true;
  if (client.final_report_status && client.final_report_status !== 'قيد الإعداد') return true;
  if (client.license_number) return true;

  const raw = client.project_engineering_data;
  if (!raw || typeof raw !== 'object') return false;
  const data = raw as unknown as Record<string, unknown>;

  const plan = data.building_plan as { status?: string; updated_at?: string } | undefined;
  if (plan?.status && plan.status !== 'مسودة') return true;
  if (plan?.updated_at) return true;

  const tech = data.technical_report as { updated_at?: string; outgoing_number?: string } | undefined;
  if (tech?.updated_at || tech?.outgoing_number) return true;

  const delivery = data.engineering_delivery as { status?: string; delivery_date?: string } | undefined;
  if (delivery?.delivery_date || (delivery?.status && delivery.status !== 'مسودة')) return true;

  const visits = data.field_visits;
  if (Array.isArray(visits) && visits.length > 0) return true;

  const blueprints = data.safety_blueprints as { files?: unknown[] } | undefined;
  if (Array.isArray(blueprints?.files) && blueprints.files.length > 0) return true;

  const cert = data.completion_certificate as { certificate_number?: string } | undefined;
  if (cert?.certificate_number) return true;

  const finalInsp = data.final_inspection as { status?: string; inspection_date?: string } | undefined;
  if (finalInsp?.inspection_date || (finalInsp?.status && finalInsp.status !== 'مسودة')) return true;

  return false;
}

/** Derives the pipeline stage from business fields (single source of truth). */
export function resolvePipelineStage(client: Partial<ClientRecord>): PipelineStage {
  if (client.final_report_status === 'معتمد' && client.license_number) {
    return 'completed';
  }

  if (isFinancialApproved(client.financial_status)) {
    return 'projects';
  }

  // احترم المرحلة المخزّنة / العمل الهندسي حتى لو نص الاعتماد المالي مختلف
  if (client.pipeline_stage === 'completed') return 'completed';
  if (client.pipeline_stage === 'projects' || hasEngineeringWork(client)) {
    return 'projects';
  }

  if (
    client.quotation_status === 'معتمد' ||
    client.quotation_status === 'بانتظار السداد' ||
    (client.financial_status &&
      client.financial_status !== 'بانتظار الدفعة' &&
      !isFinancialApproved(client.financial_status))
  ) {
    return 'finance';
  }

  if (client.pipeline_stage === 'sales' || hasQuotation(client)) {
    return 'sales';
  }

  if (client.pipeline_stage === 'marketing' || !client.business_name) {
    return 'marketing';
  }

  return client.pipeline_stage || 'marketing';
}

export function withResolvedPipeline<T extends Partial<ClientRecord>>(client: T): T & { pipeline_stage: PipelineStage } {
  return {
    ...client,
    pipeline_stage: resolvePipelineStage(client),
  };
}

export function getPipelineStageLabel(stage: PipelineStage): string {
  const labels: Record<PipelineStage, string> = {
    marketing: 'التسويق',
    sales: 'المبيعات',
    finance: 'المالية',
    projects: 'المشاريع',
    completed: 'مكتمل',
  };
  return labels[stage];
}

export function getNextDepartmentRoute(stage: PipelineStage): string {
  const routes: Record<PipelineStage, string> = {
    marketing: '/marketing',
    sales: '/sales',
    finance: '/finance',
    projects: '/projects',
    completed: '/projects',
  };
  return routes[stage];
}

/** Payload fields that may trigger an automatic pipeline transition. */
export function mergePipelineStage(
  current: Partial<ClientRecord>,
  updates: Partial<ClientRecord>
): Partial<ClientRecord> {
  const merged = { ...current, ...updates };
  return {
    ...updates,
    pipeline_stage: resolvePipelineStage(merged),
  };
}

export function shouldShowInFinance(client: Partial<ClientRecord>): boolean {
  const stage = resolvePipelineStage(client);
  return stage === 'finance';
}

/**
 * يظهر في إدارة المشاريع إذا:
 * - الاعتماد المالي مكتمل، أو
 * - المرحلة المخزّنة مشاريع/مكتمل، أو
 * - يوجد عمل تقارير/هندسة محفوظ
 */
export function shouldShowInProjects(client: Partial<ClientRecord>): boolean {
  if (isFinancialApproved(client.financial_status)) return true;
  if (client.pipeline_stage === 'projects' || client.pipeline_stage === 'completed') return true;
  if (hasEngineeringWork(client)) return true;
  const stage = resolvePipelineStage(client);
  return stage === 'projects' || stage === 'completed';
}

/** يبقى العميل ظاهراً في المبيعات بعد اعتماد العرض أو الانتقال للمالية/المشاريع. */
export function shouldShowInSales(client: Partial<ClientRecord>): boolean {
  const stage = resolvePipelineStage(client);
  if (stage === 'sales' || stage === 'finance' || stage === 'projects' || stage === 'completed') {
    return true;
  }
  if (hasQuotation(client)) return true;
  return client.pipeline_stage === 'sales';
}

export function shouldShowInMarketing(client: Partial<ClientRecord>): boolean {
  return resolvePipelineStage(client) === 'marketing';
}
