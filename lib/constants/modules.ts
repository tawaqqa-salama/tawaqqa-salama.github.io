export function generateContractNumber(): string {
  return `CNT-${Date.now().toString().slice(-8)}`;
}

export function generateReturnNumber(): string {
  return `RET-${Date.now().toString().slice(-8)}`;
}

export function generateSalesDocNumber(type: 'quotation' | 'invoice'): string {
  const prefix = type === 'quotation' ? 'QT' : 'INV';
  return `${prefix}-${Date.now().toString().slice(-8)}`;
}

export const PROJECT_REPORT_SECTIONS = [
  { id: 'technical_report', label: 'التقرير الفني' },
  { id: 'building_plan', label: 'معلومات المخطط' },
  { id: 'boq', label: 'جدول الكميات BOQ' },
  { id: 'timeline', label: 'الجدول الزمني' },
  { id: 'field_visits', label: 'الزيارات الميدانية' },
  { id: 'technical_notes', label: 'الملاحظات الفنية' },
  { id: 'engineering_delivery', label: 'تسليم الدراسة الهندسية' },
  { id: 'final_inspection', label: 'التقرير النهائي' },
  { id: 'completion_certificate', label: 'شهادة إنهاء الأعمال' },
] as const;

export type ProjectReportSectionId = (typeof PROJECT_REPORT_SECTIONS)[number]['id'];

export const PIPELINE_STAGE_LABELS: Record<string, string> = {
  marketing: 'التسويق',
  sales: 'المبيعات',
  finance: 'المالية',
  projects: 'المشاريع',
  completed: 'مكتمل',
};
