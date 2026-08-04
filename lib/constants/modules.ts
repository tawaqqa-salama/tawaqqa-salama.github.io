export {
  nextContractNumber as generateContractNumber,
  nextReturnNumber as generateReturnNumber,
  nextSalesDocNumber as generateSalesDocNumber,
} from '@/lib/business/document-numbers';

/** @deprecated Prefer WORKFLOW_STAGES from gated-pipeline — kept for legacy labels */
export const PROJECT_REPORT_SECTIONS = [
  { id: 'technical_report', label: 'التقرير الفني' },
  { id: 'building_plan', label: 'معلومات المخطط' },
  { id: 'boq', label: 'جدول الكميات BOQ' },
  { id: 'timeline', label: 'الجدول الزمني' },
  { id: 'field_visits', label: 'الزيارات الميدانية' },
  { id: 'supervision_report', label: 'تقرير الإشراف' },
  { id: 'technical_notes', label: 'الملاحظات الفنية' },
  { id: 'engineering_delivery', label: 'خطاب تسليم الدراسة' },
  { id: 'cd_cover_letter', label: 'خطاب تسليم الدفاع المدني (CD)' },
  { id: 'final_inspection', label: 'التقرير النهائي' },
  { id: 'completion_certificate', label: 'شهادة إنهاء الأعمال' },
] as const;

export type ProjectReportSectionId = (typeof PROJECT_REPORT_SECTIONS)[number]['id'];

export {
  WORKFLOW_STAGES,
  WORKFLOW_STAGE_IDS,
  LOCK_TOOLTIP_AR,
} from '@/lib/projects/gated-pipeline';
export type { WorkflowStageId } from '@/lib/projects/gated-pipeline';

export const PIPELINE_STAGE_LABELS: Record<string, string> = {
  marketing: 'التسويق',
  sales: 'المبيعات',
  finance: 'المالية',
  projects: 'المشاريع',
  completed: 'مكتمل',
};
