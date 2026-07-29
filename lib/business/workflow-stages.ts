import type { ClientRecord } from '@/lib/types/client';

export const APPROVED_FINANCIAL_STATUSES = ['تم السداد', 'معتمد مالياً'] as const;
export const RESTRICTED_ENGINEERING_STATUSES = ['قيد المعاينة', 'مكتمل'] as const;

export type WorkflowStageId = 'sales' | 'finance' | 'engineering' | 'reports';

export const WORKFLOW_STAGES: { id: WorkflowStageId; label: string }[] = [
  { id: 'sales', label: 'المبيعات وعرض السعر' },
  { id: 'finance', label: 'الاعتماد المالي' },
  { id: 'engineering', label: 'المعاينة الهندسية' },
  { id: 'reports', label: 'التقرير والترخيص' },
];

export function isFinancialApproved(financialStatus: string | null | undefined): boolean {
  return APPROVED_FINANCIAL_STATUSES.includes(
    (financialStatus || '') as (typeof APPROVED_FINANCIAL_STATUSES)[number]
  );
}

export function isEngineeringComplete(engineeringStatus: string | null | undefined): boolean {
  return engineeringStatus === 'مكتمل';
}

export function hasQuotation(client: Pick<ClientRecord, 'quotation_number' | 'quotation_amount'>): boolean {
  return Boolean(client.quotation_number) && Number(client.quotation_amount || 0) > 0;
}

export function getWorkflowStage(client: ClientRecord): WorkflowStageId {
  if (!hasQuotation(client)) return 'sales';
  if (!isFinancialApproved(client.financial_status)) return 'finance';
  if (!isEngineeringComplete(client.engineering_status)) return 'engineering';
  return 'reports';
}

export function getWorkflowStageIndex(stage: WorkflowStageId): number {
  return WORKFLOW_STAGES.findIndex((item) => item.id === stage);
}

export function canAccessEngineeringWorkflow(financialStatus: string | null | undefined): boolean {
  return isFinancialApproved(financialStatus);
}

export function canAccessReportsWorkflow(engineeringStatus: string | null | undefined): boolean {
  return isEngineeringComplete(engineeringStatus);
}

export function canScheduleFieldVisit(
  financialStatus: string | null | undefined,
  visitStatus: string
): string | null {
  if (canAccessEngineeringWorkflow(financialStatus)) return null;

  if (visitStatus !== 'لم تُجدول' && visitStatus !== 'ملغاة') {
    return 'لا يمكن جدولة الزيارة الميدانية أو تنفيذ المعاينة قبل اعتماد المالية (تم السداد / معتمد مالياً).';
  }

  return null;
}
