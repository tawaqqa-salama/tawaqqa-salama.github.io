export const QUOTATION_SERVICE_IDS = [
  'site_visits',
  'firefighting_plans',
  'alarm_plans',
  'life_safety_plans',
  'hydraulic_calculations',
  'technical_study_report',
  'bill_of_quantities',
  'building_plan_info_report',
  'study_delivery_report',
  'completion_certificate',
] as const;

export type QuotationServiceId = (typeof QUOTATION_SERVICE_IDS)[number];

export const QUOTATION_SERVICE_OPTIONS: { id: QuotationServiceId; label: string }[] = [
  { id: 'site_visits', label: 'عدد الزيارات' },
  { id: 'firefighting_plans', label: 'مخططات الإطفاء' },
  { id: 'alarm_plans', label: 'مخططات الإنذار' },
  { id: 'life_safety_plans', label: 'مخططات سلامة الأرواح' },
  { id: 'hydraulic_calculations', label: 'الحسابات الهيدروليكية' },
  { id: 'technical_study_report', label: 'الدراسة و تقرير فني' },
  { id: 'bill_of_quantities', label: 'جدول الكميات' },
  { id: 'building_plan_info_report', label: 'تقرير معلومات المخطط' },
  { id: 'study_delivery_report', label: 'تقرير تسليم دراسة' },
  { id: 'completion_certificate', label: 'شهادة انهاء اعمال' },
];

export function normalizeQuotationServices(value: unknown): QuotationServiceId[] {
  if (!Array.isArray(value)) return [];
  const allowed = new Set<string>(QUOTATION_SERVICE_IDS);
  return value.filter((item): item is QuotationServiceId => typeof item === 'string' && allowed.has(item));
}

export function getQuotationServiceLabel(id: string): string {
  return QUOTATION_SERVICE_OPTIONS.find((option) => option.id === id)?.label || id;
}
