import { ensureFloorLevels } from '@/lib/business/floors';
import { defaultZoneUseForActivity } from '@/lib/constants/zone-uses';
import { createZone } from '@/lib/projects/sbc-classification';
import {
  isManualExtinguisherType,
  suggestSpaceSafetyInputs,
} from '@/lib/projects/design-center/safety-rules';
import type { ClientRecord, FloorUsage } from '@/lib/types/client';
import type {
  DesignSpaceSafetyArea,
  DesignSpaceSafetyAutoField,
  DesignSpaceSafetyFloor,
  DesignSpaceSafetyQuantities,
  DesignSpaceSafetySuggestionOverrides,
  DesignSpaceSafetyWorkingCopy,
} from '@/lib/projects/design-center/types';

const AUTO_SUGGESTED_QUANTITY_FIELDS: DesignSpaceSafetyAutoField[] = [
  'sprinklers',
  'smoke_detectors',
  'heat_detectors',
  'fire_alarm_panels',
  'signs',
  'emergency_lights',
  'emergency_exits',
  'alarm_bells',
  'emergency_stairs',
  'manual_extinguishers',
  'manual_extinguisher_type',
  'manual_extinguisher_size',
];

function id(prefix: string): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return `${prefix}-${crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeSuggestionOverrides(
  raw?: DesignSpaceSafetySuggestionOverrides | null
): DesignSpaceSafetySuggestionOverrides | null {
  if (!raw) return null;
  const quantityFields = Array.isArray(raw.quantity_fields)
    ? raw.quantity_fields.filter((field): field is DesignSpaceSafetyAutoField =>
        AUTO_SUGGESTED_QUANTITY_FIELDS.includes(field as DesignSpaceSafetyAutoField)
      )
    : [];
  if (!raw.estimated_occupants && !quantityFields.length) return null;
  return {
    estimated_occupants: raw.estimated_occupants === true || undefined,
    quantity_fields: quantityFields.length ? [...new Set(quantityFields)] : undefined,
  };
}

export function emptySafetyQuantities(): DesignSpaceSafetyQuantities {
  return {
    sprinklers: 0,
    smoke_detectors: 0,
    heat_detectors: 0,
    fire_alarm_panels: 0,
    alarm_panel_locations: [],
    signs: 0,
    emergency_lights: 0,
    emergency_exits: 0,
    alarm_bells: 0,
    emergency_stairs: 0,
    manual_extinguishers: 0,
    manual_extinguisher_type: null,
    manual_extinguisher_size: null,
    elevators: 0,
    public_facilities: 0,
  };
}

export function nonNegativeInteger(value: unknown): number {
  return Math.max(0, Math.floor(Number(value) || 0));
}

/** Preserve an absent engineering metric as null instead of silently turning it into zero. */
export function optionalNonNegativeNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, numeric) : null;
}

function normalizeQuantities(raw?: Partial<DesignSpaceSafetyQuantities> | null): DesignSpaceSafetyQuantities {
  return {
    sprinklers: nonNegativeInteger(raw?.sprinklers),
    smoke_detectors: nonNegativeInteger(raw?.smoke_detectors),
    heat_detectors: nonNegativeInteger(raw?.heat_detectors),
    fire_alarm_panels: nonNegativeInteger(raw?.fire_alarm_panels),
    alarm_panel_locations: Array.isArray(raw?.alarm_panel_locations)
      ? raw!.alarm_panel_locations.map((item) => String(item || '').trim()).filter(Boolean)
      : [],
    signs: nonNegativeInteger(raw?.signs),
    emergency_lights: nonNegativeInteger(raw?.emergency_lights),
    emergency_exits: nonNegativeInteger(raw?.emergency_exits),
    alarm_bells: nonNegativeInteger(raw?.alarm_bells),
    emergency_stairs: nonNegativeInteger(raw?.emergency_stairs),
    manual_extinguishers: nonNegativeInteger(raw?.manual_extinguishers),
    manual_extinguisher_type: isManualExtinguisherType(raw?.manual_extinguisher_type)
      ? raw!.manual_extinguisher_type
      : null,
    manual_extinguisher_size:
      typeof raw?.manual_extinguisher_size === 'string' && raw.manual_extinguisher_size.trim()
        ? raw.manual_extinguisher_size.trim()
        : null,
    elevators: nonNegativeInteger(raw?.elevators),
    public_facilities: nonNegativeInteger(raw?.public_facilities),
  };
}

function suggestedArea(
  usage: Pick<FloorUsage, 'id' | 'label' | 'activity_type' | 'area_m2'>
): DesignSpaceSafetyArea {
  const activity = usage.activity_type || null;
  const areaM2 = Math.max(0, Number(usage.area_m2) || 0);
  const zone = createZone({
    id: usage.id || id('area'),
    label: usage.label || 'مساحة غير مسماة',
    area_m2: String(areaM2),
    use_code: defaultZoneUseForActivity(activity),
  });
  const suggestion = suggestSpaceSafetyInputs({ activity_type: activity, area_m2: areaM2 });
  const suppression = zone.suppression_label ? [zone.suppression_label] : [];
  return {
    id: usage.id || id('area'),
    source_usage_id: usage.id || null,
    label: usage.label || 'مساحة غير مسماة',
    activity_type: activity,
    area_m2: areaM2,
    estimated_occupants: suggestion.estimated_occupants,
    max_travel_distance_m: null,
    hazard_suggested: suggestion.hazard,
    hazard_approved: null,
    hazard_source: 'مرجع تصنيفي SBC 801 / NFPA 13 — يتطلب اعتماد المهندس لكل مساحة.',
    suppression_suggested: suppression,
    suppression_approved: null,
    suppression_source: 'قواعد استخدام المنطقة الحالية — اقتراح قابل للمراجعة',
    quantities: { ...emptySafetyQuantities(), ...suggestion },
    suggestion_overrides: null,
  };
}

export function suggestAreaSafety(
  area: Pick<DesignSpaceSafetyArea, 'id' | 'label' | 'activity_type' | 'area_m2'>
): Pick<
  DesignSpaceSafetyArea,
  | 'hazard_suggested'
  | 'hazard_source'
  | 'suppression_suggested'
  | 'suppression_source'
  | 'estimated_occupants'
  | 'quantities'
> {
  const suggested = suggestedArea({
    id: area.id,
    label: area.label,
    activity_type: area.activity_type,
    area_m2: area.area_m2,
  });
  return {
    hazard_suggested: suggested.hazard_suggested,
    hazard_source: suggested.hazard_source,
    suppression_suggested: suggested.suppression_suggested,
    suppression_source: suggested.suppression_source,
    estimated_occupants: suggested.estimated_occupants,
    quantities: suggested.quantities,
  };
}

export function recomputeAreaSafetySuggestions(
  area: DesignSpaceSafetyArea
): Pick<
  DesignSpaceSafetyArea,
  | 'hazard_suggested'
  | 'hazard_source'
  | 'suppression_suggested'
  | 'suppression_source'
  | 'estimated_occupants'
  | 'quantities'
  | 'suggestion_overrides'
> {
  const suggested = suggestAreaSafety(area);
  const overrides = normalizeSuggestionOverrides(area.suggestion_overrides);
  const quantities: DesignSpaceSafetyQuantities = { ...suggested.quantities };

  for (const field of overrides?.quantity_fields || []) {
    (quantities as Record<string, unknown>)[field] = (area.quantities as Record<string, unknown>)[field];
  }

  return {
    ...suggested,
    estimated_occupants: overrides?.estimated_occupants ? area.estimated_occupants : suggested.estimated_occupants,
    quantities,
    suggestion_overrides: overrides,
  };
}

export function markAreaSuggestionOverrides(
  area: DesignSpaceSafetyArea,
  fields: { estimated_occupants?: boolean; quantity_fields?: DesignSpaceSafetyAutoField[] }
): DesignSpaceSafetySuggestionOverrides | null {
  const current = normalizeSuggestionOverrides(area.suggestion_overrides);
  return normalizeSuggestionOverrides({
    estimated_occupants: fields.estimated_occupants || current?.estimated_occupants,
    quantity_fields: [...(current?.quantity_fields || []), ...(fields.quantity_fields || [])],
  });
}

function hasLegacyZeroSuggestions(area: DesignSpaceSafetyArea): boolean {
  if (area.area_m2 <= 0 || area.suggestion_overrides) return false;
  const quantitiesAreZero = AUTO_SUGGESTED_QUANTITY_FIELDS.every(
    (field) => Number((area.quantities as Record<string, unknown>)[field]) === 0 || (area.quantities as Record<string, unknown>)[field] === null
  );
  return (area.estimated_occupants === null || area.estimated_occupants === 0) && quantitiesAreZero;
}

function normalizeArea(raw: Partial<DesignSpaceSafetyArea>, fallback?: DesignSpaceSafetyArea): DesignSpaceSafetyArea {
  const area: DesignSpaceSafetyArea = {
    id: String(raw.id || fallback?.id || id('area')),
    source_usage_id: raw.source_usage_id ?? fallback?.source_usage_id ?? null,
    label: String(raw.label || fallback?.label || 'مساحة غير مسماة'),
    activity_type: raw.activity_type ?? fallback?.activity_type ?? null,
    area_m2: Math.max(0, Number(raw.area_m2 ?? fallback?.area_m2) || 0),
    estimated_occupants: optionalNonNegativeNumber(raw.estimated_occupants ?? fallback?.estimated_occupants),
    max_travel_distance_m: optionalNonNegativeNumber(raw.max_travel_distance_m ?? fallback?.max_travel_distance_m),
    hazard_suggested: String(raw.hazard_suggested || fallback?.hazard_suggested || 'تتطلب مراجعة مهندس'),
    hazard_approved: raw.hazard_approved ?? fallback?.hazard_approved ?? null,
    hazard_source: raw.hazard_source ?? fallback?.hazard_source ?? null,
    suppression_suggested: Array.isArray(raw.suppression_suggested)
      ? raw.suppression_suggested.map(String)
      : fallback?.suppression_suggested || [],
    suppression_approved: Array.isArray(raw.suppression_approved)
      ? raw.suppression_approved.map(String)
      : fallback?.suppression_approved ?? null,
    suppression_source: raw.suppression_source ?? fallback?.suppression_source ?? null,
    quantities: normalizeQuantities(raw.quantities ?? fallback?.quantities),
    suggestion_overrides: normalizeSuggestionOverrides(raw.suggestion_overrides ?? fallback?.suggestion_overrides),
  };

  // Only migrate clearly unconfigured legacy zeros. Any user edit from the new UI sets an override and is never replaced.
  return hasLegacyZeroSuggestions(area) ? { ...area, ...recomputeAreaSafetySuggestions(area) } : area;
}

export function normalizeSpaceSafetyWorkingCopy(
  raw?: Partial<DesignSpaceSafetyWorkingCopy> | null
): DesignSpaceSafetyWorkingCopy | null {
  if (!raw || !Array.isArray(raw.floors)) return null;
  return {
    source: raw.source === 'project_engineering' ? 'project_engineering' : 'sales_basic_data',
    inherited_from_sales_at: raw.inherited_from_sales_at ?? null,
    updated_at: raw.updated_at ?? null,
    floors: raw.floors.map((floor, floorIndex) => ({
      id: String(floor.id || `floor-${floorIndex}`),
      source_floor_id: floor.source_floor_id ?? null,
      label: String(floor.label || 'دور غير مسمى'),
      kind: floor.kind ?? null,
      repeat_count: Math.max(1, nonNegativeInteger(floor.repeat_count) || 1),
      estimated_occupants: optionalNonNegativeNumber(floor.estimated_occupants),
      max_travel_distance_m: optionalNonNegativeNumber(floor.max_travel_distance_m),
      areas: Array.isArray(floor.areas) ? floor.areas.map((area) => normalizeArea(area)) : [],
    })),
  };
}

/** One-way initial inheritance. Existing project copy always wins over later Sales edits. */
export function seedSpaceSafetyFromClient(
  client: ClientRecord,
  existing?: Partial<DesignSpaceSafetyWorkingCopy> | null
): DesignSpaceSafetyWorkingCopy {
  const normalized = normalizeSpaceSafetyWorkingCopy(existing);
  if (normalized?.floors.length) return normalized;

  const floors = ensureFloorLevels(client.floor_levels, client.floors_count, client.building_area);
  return {
    source: 'sales_basic_data',
    inherited_from_sales_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    floors: floors.map((floor): DesignSpaceSafetyFloor => ({
      id: floor.id,
      source_floor_id: floor.id,
      label: floor.label,
      kind: floor.kind,
      repeat_count: Math.max(1, floor.repeat_count || 1),
      estimated_occupants: null,
      max_travel_distance_m: null,
      areas: (floor.usages || []).map((usage) => suggestedArea(usage)),
    })),
  };
}

export function createProjectArea(): DesignSpaceSafetyArea {
  return {
    id: id('area'),
    source_usage_id: null,
    label: 'مساحة جديدة',
    activity_type: null,
    area_m2: 0,
    estimated_occupants: null,
    max_travel_distance_m: null,
    hazard_suggested: 'تتطلب مراجعة مهندس',
    hazard_approved: null,
    hazard_source: null,
    suppression_suggested: [],
    suppression_approved: null,
    suppression_source: null,
    quantities: emptySafetyQuantities(),
    suggestion_overrides: null,
  };
}

export function createProjectFloor(): DesignSpaceSafetyFloor {
  return {
    id: id('floor'),
    source_floor_id: null,
    label: 'دور / منطقة جديدة',
    kind: 'custom',
    repeat_count: 1,
    estimated_occupants: null,
    max_travel_distance_m: null,
    areas: [createProjectArea()],
  };
}

export type SafetyQuantityTotals = Omit<
  DesignSpaceSafetyQuantities,
  'alarm_panel_locations' | 'manual_extinguisher_type' | 'manual_extinguisher_size'
> & {
  alarm_panel_locations: string[];
  total_area_m2: number;
  areas_count: number;
  estimated_occupants: number;
  max_travel_distance_m: number | null;
};

export function safetyTotals(areas: DesignSpaceSafetyArea[]): SafetyQuantityTotals {
  return areas.reduce<SafetyQuantityTotals>(
    (total, area) => ({
      sprinklers: total.sprinklers + nonNegativeInteger(area.quantities.sprinklers),
      smoke_detectors: total.smoke_detectors + nonNegativeInteger(area.quantities.smoke_detectors),
      heat_detectors: total.heat_detectors + nonNegativeInteger(area.quantities.heat_detectors),
      fire_alarm_panels: total.fire_alarm_panels + nonNegativeInteger(area.quantities.fire_alarm_panels),
      alarm_panel_locations: [...total.alarm_panel_locations, ...area.quantities.alarm_panel_locations],
      signs: total.signs + nonNegativeInteger(area.quantities.signs),
      emergency_lights: total.emergency_lights + nonNegativeInteger(area.quantities.emergency_lights),
      emergency_exits: total.emergency_exits + nonNegativeInteger(area.quantities.emergency_exits),
      alarm_bells: total.alarm_bells + nonNegativeInteger(area.quantities.alarm_bells),
      emergency_stairs: total.emergency_stairs + nonNegativeInteger(area.quantities.emergency_stairs),
      manual_extinguishers: total.manual_extinguishers + nonNegativeInteger(area.quantities.manual_extinguishers),
      elevators: total.elevators + nonNegativeInteger(area.quantities.elevators),
      public_facilities: total.public_facilities + nonNegativeInteger(area.quantities.public_facilities),
      total_area_m2: total.total_area_m2 + Math.max(0, Number(area.area_m2) || 0),
      areas_count: total.areas_count + 1,
      estimated_occupants: total.estimated_occupants + nonNegativeInteger(area.estimated_occupants),
      max_travel_distance_m: Math.max(
        total.max_travel_distance_m ?? 0,
        optionalNonNegativeNumber(area.max_travel_distance_m) ?? 0
      ) || null,
    }),
    {
      ...emptySafetyQuantities(),
      alarm_panel_locations: [],
      total_area_m2: 0,
      areas_count: 0,
      estimated_occupants: 0,
      max_travel_distance_m: null,
    }
  );
}

/** Floor inputs override derived values from the floor's individual spaces when present. */
export function floorSafetyTotals(floor: DesignSpaceSafetyFloor): SafetyQuantityTotals {
  const areaTotals = safetyTotals(floor.areas);
  return {
    ...areaTotals,
    estimated_occupants:
      optionalNonNegativeNumber(floor.estimated_occupants) ?? areaTotals.estimated_occupants,
    max_travel_distance_m:
      optionalNonNegativeNumber(floor.max_travel_distance_m) ?? areaTotals.max_travel_distance_m,
  };
}

export function projectSafetyTotals(copy: DesignSpaceSafetyWorkingCopy): SafetyQuantityTotals {
  const allAreas = safetyTotals(copy.floors.flatMap((floor) => floor.areas));
  const floorTotals = copy.floors.map(floorSafetyTotals);
  return {
    ...allAreas,
    estimated_occupants: floorTotals.reduce((sum, floor) => sum + floor.estimated_occupants, 0),
    max_travel_distance_m:
      floorTotals.reduce<number | null>(
        (maximum, floor) => Math.max(maximum ?? 0, floor.max_travel_distance_m ?? 0) || null,
        null
      ),
  };
}
