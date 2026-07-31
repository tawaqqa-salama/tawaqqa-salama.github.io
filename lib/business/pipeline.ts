import type { ClientRecord, PipelineStage } from '@/lib/types/client';
import { isFinancialApproved } from '@/lib/business/workflow-stages';

export function hasQuotation(client: Pick<ClientRecord, 'quotation_number' | 'quotation_amount'>): boolean {
  return Boolean(client.quotation_number) && Number(client.quotation_amount || 0) > 0;
}

/** Derives the pipeline stage from business fields (single source of truth). */
export function resolvePipelineStage(client: Partial<ClientRecord>): PipelineStage {
  if (client.final_report_status === 'معتمد' && client.license_number) {
    return 'completed';
  }

  if (isFinancialApproved(client.financial_status)) {
    return 'projects';
  }

  if (
    client.quotation_status === 'معتمد' ||
    client.quotation_status === 'بانتظار السداد' ||
    (client.financial_status && client.financial_status !== 'بانتظار الدفعة' && !isFinancialApproved(client.financial_status))
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

export function shouldShowInProjects(client: Partial<ClientRecord>): boolean {
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
