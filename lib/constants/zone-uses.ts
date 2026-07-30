import type { SbcOccupancyCode } from '@/lib/constants/sbc801';

/** استخدامات المناطق داخل الأدوار — مربوطة بتصنيف SBC */
export type ZoneUseDef = {
  id: string;
  label: string;
  occupancy: SbcOccupancyCode;
  /** عامل حمل إشغال إرشادي م²/شخص (للعرض في إثبات الكود) */
  occupant_load_factor_m2?: number;
  notes?: string;
};

export const ZONE_USE_OPTIONS: ZoneUseDef[] = [
  { id: 'offices', label: 'مكاتب / إداري', occupancy: 'business', occupant_load_factor_m2: 9.3 },
  { id: 'retail', label: 'محلات / تجاري', occupancy: 'mercantile', occupant_load_factor_m2: 5.6 },
  { id: 'showroom', label: 'معرض / صالة عرض', occupancy: 'mercantile', occupant_load_factor_m2: 5.6 },
  { id: 'seating', label: 'منطقة جلوس / استقبال', occupancy: 'assembly', occupant_load_factor_m2: 1.4 },
  { id: 'restaurant', label: 'مطعم / مقهى', occupancy: 'assembly', occupant_load_factor_m2: 1.4 },
  { id: 'storage', label: 'مخزن', occupancy: 'storage_moderate', occupant_load_factor_m2: 27.9 },
  { id: 'parking', label: 'مواقف سيارات', occupancy: 'parking', occupant_load_factor_m2: 19 },
  {
    id: 'electrical',
    label: 'غرفة كهرباء',
    occupancy: 'high_hazard',
    notes: 'غالباً تتطلب نظام إطفاء خاص (نظيف/غاز) حسب حجم الغرفة والمعدات',
  },
  {
    id: 'data_room',
    label: 'غرفة بيانات / سيرفر',
    occupancy: 'high_hazard',
    notes: 'نظام إطفاء خاص (نظيف) غالباً مطلوب',
  },
  { id: 'kitchen', label: 'مطبخ', occupancy: 'assembly', notes: 'نظام إطفاء خاص لشفاط المطبخ عند اللزوم' },
  { id: 'clinic', label: 'عيادة / صحي', occupancy: 'business', occupant_load_factor_m2: 9.3 },
  { id: 'club', label: 'نادي / رياضي', occupancy: 'assembly', occupant_load_factor_m2: 1.4 },
  { id: 'residential', label: 'سكني / غرف', occupancy: 'residential', occupant_load_factor_m2: 18.6 },
  { id: 'educational', label: 'تعليمي / فصول', occupancy: 'educational', occupant_load_factor_m2: 1.9 },
  { id: 'industrial', label: 'صناعي / ورشة', occupancy: 'industrial_moderate', occupant_load_factor_m2: 9.3 },
  { id: 'corridor', label: 'ممرات / خدمات', occupancy: 'business', occupant_load_factor_m2: 9.3 },
  { id: 'custom', label: 'أخرى (مخصص)', occupancy: 'business' },
];

export function getZoneUse(id: string | undefined | null): ZoneUseDef {
  return ZONE_USE_OPTIONS.find((z) => z.id === id) || ZONE_USE_OPTIONS[ZONE_USE_OPTIONS.length - 1];
}

/** استخدام افتراضي من نشاط العميل */
export function defaultZoneUseForActivity(activityType?: string | null): string {
  switch (activityType) {
    case 'gas_station':
      return 'parking';
    case 'restaurant':
      return 'restaurant';
    case 'warehouse':
      return 'storage';
    case 'factory':
      return 'industrial';
    case 'office':
      return 'offices';
    case 'school':
      return 'educational';
    case 'parking':
      return 'parking';
    case 'residential_building':
    case 'hotel':
      return 'residential';
    case 'commercial_complex':
      return 'retail';
    default:
      return 'offices';
  }
}
