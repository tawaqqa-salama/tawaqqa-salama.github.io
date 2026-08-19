import { defaultZoneUseForActivity, getZoneUse } from '@/lib/constants/zone-uses';
import { createZone } from '@/lib/projects/sbc-classification';
import type {
  DesignSpaceSafetyQuantities,
  ManualExtinguisherType,
} from '@/lib/projects/design-center/types';

/**
 * Seven engineering selection choices for the sprinkler-design hazard context.
 * They are a guided SBC 801 / NFPA 13 reference aid, not an automatic compliance decision.
 */
export const HAZARD_CLASSIFICATION_OPTIONS = [
  { id: 'light_hazard', label: 'خطر خفيف (Light Hazard)' },
  { id: 'ordinary_hazard_group_1', label: 'خطر عادي — المجموعة 1 (Ordinary Hazard Group 1)' },
  { id: 'ordinary_hazard_group_2', label: 'خطر عادي — المجموعة 2 (Ordinary Hazard Group 2)' },
  { id: 'extra_hazard_group_1', label: 'خطر إضافي — المجموعة 1 (Extra Hazard Group 1)' },
  { id: 'extra_hazard_group_2', label: 'خطر إضافي — المجموعة 2 (Extra Hazard Group 2)' },
  { id: 'high_piled_storage', label: 'تخزين مرتفع (High-Piled Storage) — مراجعة هندسية' },
  { id: 'special_hazard', label: 'خطر / إشغال خاص (Special Hazard) — مراجعة هندسية' },
] as const;

export type HazardClassificationId = (typeof HAZARD_CLASSIFICATION_OPTIONS)[number]['id'];

export const MANUAL_EXTINGUISHER_TYPES: Array<{ id: ManualExtinguisherType; label: string }> = [
  { id: 'dry_powder_abc', label: 'بودرة جافة ABC' },
  { id: 'carbon_dioxide', label: 'ثاني أكسيد الكربون CO₂' },
  { id: 'foam', label: 'رغوية (Foam)' },
  { id: 'wet_chemical', label: 'كيميائية رطبة للمطابخ' },
  { id: 'clean_agent', label: 'عامل نظيف (Clean Agent)' },
  { id: 'water', label: 'مائية' },
];

export const MANUAL_EXTINGUISHER_SIZE_OPTIONS = ['2 كجم', '4 كجم', '6 كجم', '9 كجم', '6 لتر', '9 لتر'];

const HAZARD_BY_RISK: Record<string, HazardClassificationId> = {
  low: 'light_hazard',
  moderate: 'ordinary_hazard_group_1',
  high: 'ordinary_hazard_group_2',
  very_high: 'extra_hazard_group_1',
};

const HAZARD_FACTORS: Record<HazardClassificationId, { sprinkler_m2: number; detector_m2: number }> = {
  light_hazard: { sprinkler_m2: 12, detector_m2: 75 },
  ordinary_hazard_group_1: { sprinkler_m2: 10, detector_m2: 65 },
  ordinary_hazard_group_2: { sprinkler_m2: 9, detector_m2: 60 },
  extra_hazard_group_1: { sprinkler_m2: 7, detector_m2: 50 },
  extra_hazard_group_2: { sprinkler_m2: 6, detector_m2: 45 },
  high_piled_storage: { sprinkler_m2: 6, detector_m2: 50 },
  special_hazard: { sprinkler_m2: 0, detector_m2: 0 },
};

function ceilBy(areaM2: number, coverageM2: number): number {
  if (!Number.isFinite(areaM2) || areaM2 <= 0 || coverageM2 <= 0) return 0;
  return Math.ceil(areaM2 / coverageM2);
}

function zoneUseForActivity(activityType?: string | null): string {
  const activity = String(activityType || '');
  const direct: Record<string, string> = {
    retail: 'retail',
    showroom: 'showroom',
    storage: 'storage',
    warehouse: 'storage',
    industrial: 'factory',
    factory: 'factory',
    educational: 'educational',
    school: 'educational',
    residential: 'residential',
    hotel: 'residential',
    parking: 'parking',
    restaurant: 'restaurant',
    seating: 'seating',
    office: 'offices',
    offices: 'offices',
  };
  return direct[activity] || defaultZoneUseForActivity(activityType);
}

function hazardForActivity(activityType?: string | null): HazardClassificationId {
  const zone = createZone({
    id: 'space-safety-rule',
    label: 'space-safety-rule',
    area_m2: '0',
    use_code: zoneUseForActivity(activityType),
  });
  return HAZARD_BY_RISK[String(zone.risk_level || '')] || 'light_hazard';
}

function defaultExtinguisherType(activityType?: string | null): ManualExtinguisherType {
  if (activityType === 'restaurant') return 'wet_chemical';
  if (activityType === 'gas_station') return 'foam';
  if (activityType === 'office' || activityType === 'school' || activityType === 'hotel') return 'carbon_dioxide';
  return 'dry_powder_abc';
}

function defaultExtinguisherSize(type: ManualExtinguisherType): string {
  return type === 'wet_chemical' ? '6 لتر' : '6 كجم';
}

export function hazardClassificationLabel(value?: string | null): string {
  return HAZARD_CLASSIFICATION_OPTIONS.find((option) => option.id === value)?.label || String(value || 'تتطلب مراجعة مهندس');
}

export function isHazardClassificationId(value: unknown): value is HazardClassificationId {
  return HAZARD_CLASSIFICATION_OPTIONS.some((option) => option.id === value);
}

export function isManualExtinguisherType(value: unknown): value is ManualExtinguisherType {
  return MANUAL_EXTINGUISHER_TYPES.some((option) => option.id === value);
}

export type SpaceSafetyAutoSuggestion = Pick<
  DesignSpaceSafetyQuantities,
  | 'sprinklers'
  | 'smoke_detectors'
  | 'heat_detectors'
  | 'fire_alarm_panels'
  | 'signs'
  | 'emergency_lights'
  | 'emergency_exits'
  | 'alarm_bells'
  | 'emergency_stairs'
  | 'manual_extinguishers'
  | 'manual_extinguisher_type'
  | 'manual_extinguisher_size'
> & {
  hazard: HazardClassificationId;
  estimated_occupants: number | null;
};

/**
 * Transparent preliminary quantities for editing. The values assist early design only and never declare SBC/NFPA compliance.
 */
export function suggestSpaceSafetyInputs(input: {
  activity_type?: string | null;
  area_m2: number;
}): SpaceSafetyAutoSuggestion {
  const areaM2 = Math.max(0, Number(input.area_m2) || 0);
  const use = getZoneUse(zoneUseForActivity(input.activity_type));
  const occupantFactor = Number(use.occupant_load_factor_m2) || 0;
  const estimatedOccupants = occupantFactor > 0 && areaM2 > 0 ? Math.ceil(areaM2 / occupantFactor) : null;
  const hazard = hazardForActivity(input.activity_type);
  const factors = HAZARD_FACTORS[hazard];
  const needsHeatDetection = ['factory', 'warehouse', 'restaurant', 'parking', 'gas_station'].includes(
    String(input.activity_type || '')
  );
  const extinguisherType = defaultExtinguisherType(input.activity_type);

  return {
    hazard,
    estimated_occupants: estimatedOccupants,
    sprinklers: ceilBy(areaM2, factors.sprinkler_m2),
    smoke_detectors: ceilBy(areaM2, factors.detector_m2),
    heat_detectors: needsHeatDetection ? ceilBy(areaM2, 50) : 0,
    fire_alarm_panels: areaM2 >= 1000 || (estimatedOccupants || 0) >= 300 ? 1 : 0,
    signs: estimatedOccupants ? Math.max(1, Math.ceil(estimatedOccupants / 50)) : 0,
    emergency_lights: ceilBy(areaM2, 40),
    emergency_exits: areaM2 > 0 ? ((estimatedOccupants || 0) >= 50 ? 2 : 1) : 0,
    alarm_bells: estimatedOccupants ? Math.max(1, Math.ceil(estimatedOccupants / 100)) : 0,
    emergency_stairs: 0,
    manual_extinguishers: ceilBy(areaM2, 200),
    manual_extinguisher_type: extinguisherType,
    manual_extinguisher_size: defaultExtinguisherSize(extinguisherType),
  };
}

export const SPACE_SAFETY_AUTOFILL_NOTE =
  'تقديرات تخطيطية أولية بحسب النشاط والمساحة، قابلة للتعديل ولا تمثل اعتمادًا تلقائيًا لمطابقة SBC 801 أو NFPA.';
