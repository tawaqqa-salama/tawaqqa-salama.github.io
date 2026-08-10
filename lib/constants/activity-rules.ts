import type { SbcOccupancyCode } from '@/lib/constants/sbc801';

export type ActivityRule = {
  minLandArea: number;
  maxFloors: number;
  label: string;
  /** تصنيف الإشغال حسب SBC 801 */
  occupancy: SbcOccupancyCode;
  /** فصل حريق تقريبي بين الوحدات/المساحات (ساعات) */
  fire_separation_hours?: number;
  ekb_activity_code?: string;
};

export const ACTIVITY_RULES: Record<string, ActivityRule> = {
  gas_station: {
    minLandArea: 500,
    maxFloors: 2,
    label: 'محطة وقود',
    occupancy: 'special_fuel',
    ekb_activity_code: 'ACT-FUEL',
  },
  restaurant: {
    minLandArea: 100,
    maxFloors: 4,
    label: 'مطعم / مقهى',
    occupancy: 'assembly',
    ekb_activity_code: 'ACT-COMM',
  },
  warehouse: {
    minLandArea: 300,
    maxFloors: 2,
    label: 'مستودع / مخزن',
    occupancy: 'storage_moderate',
    fire_separation_hours: 3,
    ekb_activity_code: 'ACT-WH',
  },
  factory: {
    minLandArea: 500,
    maxFloors: 4,
    label: 'مصنع / صناعي',
    occupancy: 'industrial_moderate',
    fire_separation_hours: 3,
    ekb_activity_code: 'ACT-IND',
  },
  office: {
    minLandArea: 150,
    maxFloors: 20,
    label: 'مكاتب / إداري',
    occupancy: 'business',
    ekb_activity_code: 'ACT-COMM',
  },
  /** Alias used by admin-UC technical report template */
  administrative: {
    minLandArea: 150,
    maxFloors: 20,
    label: 'مبنى إداري',
    occupancy: 'business',
    ekb_activity_code: 'ACT-COMM',
  },
  school: {
    minLandArea: 400,
    maxFloors: 4,
    label: 'تعليمي / مدرسة',
    occupancy: 'educational',
    ekb_activity_code: 'ACT-EDU',
  },
  parking: {
    minLandArea: 300,
    maxFloors: 6,
    label: 'مواقف سيارات',
    occupancy: 'parking',
    fire_separation_hours: 2,
  },
  residential_building: {
    minLandArea: 200,
    maxFloors: 12,
    label: 'عمائر سكنية',
    occupancy: 'residential',
    fire_separation_hours: 2,
    ekb_activity_code: 'ACT-RES',
  },
  commercial_complex: {
    minLandArea: 1000,
    maxFloors: 20,
    label: 'مجمع تجاري',
    occupancy: 'mercantile',
    ekb_activity_code: 'ACT-COMM',
  },
  hotel: {
    minLandArea: 400,
    maxFloors: 15,
    label: 'فندق / إيواء سياحي',
    occupancy: 'residential',
    fire_separation_hours: 0.5,
    ekb_activity_code: 'ACT-HOT',
  },
};

export const FLOOR_KIND_OPTIONS: { kind: 'ground' | 'typical' | 'basement' | 'roof' | 'custom'; label: string }[] = [
  { kind: 'ground', label: 'أرضي' },
  { kind: 'typical', label: 'متكرر' },
  { kind: 'basement', label: 'بدروم' },
  { kind: 'roof', label: 'دور الروف' },
  { kind: 'custom', label: 'مخصص' },
];
