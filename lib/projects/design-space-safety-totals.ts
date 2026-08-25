import type { DesignSpaceSafetyWorkingCopy } from '@/lib/projects/design-center/types';

export type DesignSpaceSafetyTotals = {
  area_m2: number;
  sprinklers: number;
  smoke_detectors: number;
  heat_detectors: number;
  fire_alarm_panels: number;
  alarm_bells: number;
  emergency_lights: number;
  exit_signs: number;
  emergency_exits: number;
  manual_extinguishers: number;
  max_travel_distance_m: number;
};

const EMPTY_TOTALS: DesignSpaceSafetyTotals = {
  area_m2: 0,
  sprinklers: 0,
  smoke_detectors: 0,
  heat_detectors: 0,
  fire_alarm_panels: 0,
  alarm_bells: 0,
  emergency_lights: 0,
  exit_signs: 0,
  emergency_exits: 0,
  manual_extinguishers: 0,
  max_travel_distance_m: 0,
};

function finiteNumber(value: unknown): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

/**
 * A DesignSpaceSafetyFloor represents one floor instance plus its repeats.
 * The editor and persisted contract normalize invalid/missing repeat counts to one.
 */
export function normalizedSpaceSafetyRepeatCount(value: unknown): number {
  const numeric = Number(value);
  return Number.isInteger(numeric) && numeric > 0 ? numeric : 1;
}

/**
 * Totals from Design Center's per-floor/per-space working copy.
 *
 * Area and DesignSpaceSafetyQuantities are recorded for one represented floor,
 * so they multiply by the floor's repeat count. A travel distance is a maximum
 * physical path length, therefore it is never multiplied. Project-wide facts
 * are intentionally not consumed here; callers retain their canonical priority.
 */
export function spaceSafetyTotals(spaceSafety: DesignSpaceSafetyWorkingCopy | null | undefined): DesignSpaceSafetyTotals {
  const totals = { ...EMPTY_TOTALS };

  for (const floor of spaceSafety?.floors || []) {
    const repeat = normalizedSpaceSafetyRepeatCount(floor.repeat_count);
    for (const area of floor.areas || []) {
      totals.area_m2 += finiteNumber(area.area_m2) * repeat;
      totals.sprinklers += finiteNumber(area.quantities.sprinklers) * repeat;
      totals.smoke_detectors += finiteNumber(area.quantities.smoke_detectors) * repeat;
      totals.heat_detectors += finiteNumber(area.quantities.heat_detectors) * repeat;
      totals.fire_alarm_panels += finiteNumber(area.quantities.fire_alarm_panels) * repeat;
      totals.alarm_bells += finiteNumber(area.quantities.alarm_bells) * repeat;
      totals.emergency_lights += finiteNumber(area.quantities.emergency_lights) * repeat;
      totals.exit_signs += finiteNumber(area.quantities.signs) * repeat;
      totals.emergency_exits += finiteNumber(area.quantities.emergency_exits) * repeat;
      totals.manual_extinguishers += finiteNumber(area.quantities.manual_extinguishers) * repeat;
      totals.max_travel_distance_m = Math.max(totals.max_travel_distance_m, finiteNumber(area.max_travel_distance_m));
    }
  }

  return totals;
}
