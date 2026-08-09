/**
 * Phase 3 — local pre-hydraulic & fire-alarm battery estimators.
 * Indicative only — not a substitute for listed calculation software.
 */

import type {
  AlarmBatteryPreCalculation,
  CoverageAuditResult,
  DetectedZone,
  HazardClass,
  HydraulicPreCalculation,
  PreCalculationBundle,
  ZoneSystemRequirement,
} from '@/lib/projects/design-center/vision/types';

const M2_TO_FT2 = 10.7639;

/** NFPA 13 density examples (gpm/ft²) — verify with project hazard tables */
export function densityForHazard(hazard: HazardClass): number {
  if (hazard === 'extra') return 0.3;
  if (hazard === 'ordinary') return 0.15;
  return 0.1;
}

export function durationForHazard(hazard: HazardClass): number {
  if (hazard === 'extra') return 90;
  if (hazard === 'ordinary') return 60;
  return 30;
}

function hazardRank(h: HazardClass): number {
  return h === 'extra' ? 3 : h === 'ordinary' ? 2 : 1;
}

export function pickHydraulicallyRemoteZone(
  zones: DetectedZone[],
  hazard: HazardClass,
  zoneReqs: ZoneSystemRequirement[]
): DetectedZone | null {
  if (!zones.length) return null;
  const highIds = new Set(
    zoneReqs
      .filter(
        (r) =>
          r.classification === 'warehouse' ||
          r.sprinkler_density_hint === 'ESFR_OR_HIGH_DENSITY' ||
          r.classification === 'kitchen'
      )
      .map((r) => r.zone_id)
  );

  const scored = [...zones].map((z) => {
    let score = z.area_m2 || z.area_px / 1000;
    if (highIds.has(z.id) || z.classification === 'warehouse') score *= 3;
    if (z.classification === 'kitchen') score *= 2;
    if (hazard === 'extra') score *= 1.2;
    return { z, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.z || null;
}

export function estimateHydraulicDemand(params: {
  zones: DetectedZone[];
  hazard: HazardClass;
  zoneRequirements: ZoneSystemRequirement[];
  hasSprinklerDeclared: boolean;
}): HydraulicPreCalculation {
  const remote = pickHydraulicallyRemoteZone(
    params.zones,
    params.hazard,
    params.zoneRequirements
  );
  const area_m2 = remote?.area_m2 ?? null;
  const density = densityForHazard(params.hazard);
  const duration = durationForHazard(params.hazard);

  if (area_m2 == null || !(area_m2 > 0)) {
    return {
      remote_zone_id: remote?.id || null,
      remote_zone_label: remote?.label || null,
      remote_area_m2: null,
      hazard_class: params.hazard,
      density_gpm_per_ft2: density,
      estimated_flow_gpm: null,
      estimated_duration_min: duration,
      estimated_volume_gal: null,
      note_ar:
        'لا يمكن تقدير الطلب الهيدروليكي — مساحة الفراغ الأبعد غير معروفة (Needs Engineer Input)',
      note_en:
        'Cannot estimate hydraulic demand — most-remote zone area unknown (Needs Engineer Input)',
      status: 'not_available',
    };
  }

  if (!params.hasSprinklerDeclared && !params.zones.some((z) => z.classification === 'warehouse')) {
    // Still estimate but mark for review
  }

  const area_ft2 = area_m2 * M2_TO_FT2;
  // Cap remote area to common design area windows (e.g. 1500–3000 ft²) for indication
  const design_ft2 = Math.min(Math.max(area_ft2, 1), hazardRank(params.hazard) >= 3 ? 3000 : 1500);
  const flow = Math.round(design_ft2 * density * 10) / 10;
  const volume = Math.round(flow * duration * 10) / 10;

  return {
    remote_zone_id: remote?.id || null,
    remote_zone_label: remote?.label || null,
    remote_area_m2: area_m2,
    hazard_class: params.hazard,
    density_gpm_per_ft2: density,
    estimated_flow_gpm: flow,
    estimated_duration_min: duration,
    estimated_volume_gal: volume,
    note_ar: `تقدير أولي: كثافة ${density} gpm/ft² · مدة ${duration} د · تدفق ~${flow} GPM — ليس بديلاً عن حساب معتمد NFPA-13/SBC`,
    note_en: `Preliminary: density ${density} gpm/ft² · ${duration} min · ~${flow} GPM — not a substitute for listed NFPA-13/SBC calcs`,
    status: 'estimated',
  };
}

/**
 * Battery Ah estimate (standby + alarm) using typical device currents.
 * Values are planning defaults — manufacturer datasheets required for design.
 */
export function estimateAlarmBattery(params: {
  coverage: CoverageAuditResult | null;
}): AlarmBatteryPreCalculation {
  const devices = params.coverage?.devices || [];
  const smoke_count = devices.filter((d) => d.kind === 'smoke_detector').length;
  const mcp_count = devices.filter((d) => d.kind === 'manual_call_point').length;
  // Assume some notification appliances if detectors exist
  const other_notification_estimate =
    smoke_count + mcp_count > 0 ? Math.max(2, Math.ceil((smoke_count + mcp_count) / 4)) : 0;

  if (!smoke_count && !mcp_count) {
    return {
      smoke_count: 0,
      mcp_count: 0,
      other_notification_estimate: 0,
      standby_current_a: null,
      alarm_current_a: null,
      standby_hours: 24,
      alarm_hours: 5 / 60,
      estimated_ah: null,
      note_ar:
        'لا كواشف/MCP مكتشفة نصيًا — تقدير البطارية غير متاح (Needs Engineer Input)',
      note_en:
        'No smoke/MCP text-detected — battery estimate not available (Needs Engineer Input)',
      status: 'not_available',
    };
  }

  // Typical standby mA defaults (indicative)
  const standby_a =
    (smoke_count * 0.00005 + mcp_count * 0.00002 + other_notification_estimate * 0.0005) +
    0.05; // panel base
  const alarm_a =
    smoke_count * 0.00005 +
    mcp_count * 0.00005 +
    other_notification_estimate * 0.035 +
    0.15;

  const standby_hours = 24;
  const alarm_hours = 5 / 60;
  const ah = Math.round((standby_a * standby_hours + alarm_a * alarm_hours) * 1.25 * 100) / 100;

  return {
    smoke_count,
    mcp_count,
    other_notification_estimate,
    standby_current_a: Math.round(standby_a * 1000) / 1000,
    alarm_current_a: Math.round(alarm_a * 1000) / 1000,
    standby_hours,
    alarm_hours,
    estimated_ah: ah,
    note_ar: `تقدير بطارية إنذار ~${ah} Ah (24س استعداد + 5د إنذار × 1.25) — يُراجع ببيانات المصنّع NFPA-72`,
    note_en: `Alarm battery estimate ~${ah} Ah (24h standby + 5min alarm × 1.25) — verify with manufacturer NFPA-72 data`,
    status: 'estimated',
  };
}

export function runPreCalculations(params: {
  zones: DetectedZone[];
  hazard: HazardClass;
  zoneRequirements: ZoneSystemRequirement[];
  coverage: CoverageAuditResult | null;
  hasSprinklerDeclared: boolean;
}): PreCalculationBundle {
  return {
    hydraulic: estimateHydraulicDemand({
      zones: params.zones,
      hazard: params.hazard,
      zoneRequirements: params.zoneRequirements,
      hasSprinklerDeclared: params.hasSprinklerDeclared,
    }),
    alarm_battery: estimateAlarmBattery({ coverage: params.coverage }),
  };
}
