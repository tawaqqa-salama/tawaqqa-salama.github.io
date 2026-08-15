export const REGION_DATA: Record<string, Record<string, string[]>> = {
  'مكة المكرمة': {
    جدة: [
      'الصفا',
      'الروضة',
      'الزهراء',
      'الفيصلية',
      'أبحر الشمالية',
      'أبحر الجنوبية',
      'النهضة',
      'الشاطئ',
      'الحمراء',
      'السلامة',
      'الجامعة',
      'الربوة',
    ],
    'مكة المكرمة': ['العزيزية', 'الشوقية', 'النوارية', 'الزاهر'],
    الطائف: ['الحوية', 'شهار', 'السلامة'],
  },
  الرياض: {
    الرياض: ['النرجس', 'الملقا', 'العارض', 'الصحافة', 'العليا'],
    الخرج: ['الخزامى', 'الخالدية'],
  },
  'المنطقة الشرقية': {
    الدمام: ['الفيصلية', 'الشاطئ', 'الزهور'],
    الخبر: ['الحزام الذهبي', 'الكرنيش', 'الجسر'],
  },
  'المدينة المنورة': {},
  القصيم: {},
  عسير: {},
  'تبوك': {},
  حائل: {},
  'جازان': {},
  'نجران': {},
  الباحة: {},
  الجوف: {},
  'الحدود الشمالية': {},
};

export { ACTIVITY_RULES, FLOOR_KIND_OPTIONS } from '@/lib/constants/activity-rules';

export const ENGINEERS = [
  'م. أحمد العتيبي',
  'م. سارة القحطاني',
  'م. خالد الدوسري',
  'م. نورة الشمري',
];

export const FINANCIAL_STATUSES = [
  'بانتظار الدفعة',
  'تم السداد',
  'معتمد مالياً',
  'مرفوض',
] as const;

export const QUOTATION_STATUSES = ['مسودة', 'معتمد', 'بانتظار السداد', 'ملغي'] as const;

export const ENGINEERING_STATUSES = ['جديد', 'قيد المعاينة', 'مكتمل'] as const;

export const VISIT_STATUSES = ['لم تُجدول', 'مجدولة', 'منفذة', 'ملغاة'] as const;

export const FINAL_REPORT_STATUSES = ['قيد الإعداد', 'مكتمل', 'معتمد'] as const;

export const PROJECT_STATUSES = [
  'قائم - تحت المعاينة',
  'تحت الإنشاء',
  'طلب إصدار ترخيص جديدة',
  'تجديد رخصة سلامة',
] as const;

export const DEFAULT_INSPECTION_CHECKLIST = [
  { id: 'fire_equipment', label: 'أجهزة السلامة (طفايات وخراطيم)', checked: false },
  { id: 'sprinkler', label: 'نظام الرش الآلي', checked: false },
  { id: 'emergency_exits', label: 'مخارج الطوارئ', checked: false },
] as const;

export const VAT_RATE = 0.15;
