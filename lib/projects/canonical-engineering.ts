/**
 * Canonical Engineering Single Source of Truth (Phase 2.2 / 2.3)
 *
 * PHYSICAL WRITE STORE (verified in engineering-live-store.ts + SQL 040):
 *   project_engineering_live.payload  ← all stage saves go here
 *
 * LOGICAL SHAPE:
 *   ProjectEngineeringData (lib/types/project-reports.ts)
 *
 * LEGACY (compatibility only — NOT a second compliance authority):
 *   clients.project_engineering_data  ← read fallback when live row missing
 *
 * Combined hydrate is a compatibility projection for the UI. Compliance inputs
 * must resolve through resolvers that treat conflicting multi-source values as
 * CONFLICT (→ NEEDS_DATA), never “pick whichever is available”.
 */

import type { ProjectEngineeringData } from '@/lib/types/project-reports';
import { parseProjectEngineeringData } from '@/lib/business/project-reports';
import { preferTechnicalReportPhoto } from '@/lib/projects/technical-report-photos';

/** Where the working dataset was loaded from. */
export type CanonicalEngineeringSource =
  | 'project_engineering_live'
  | 'legacy_project_engineering_data'
  | 'combined_with_conflicts';

export type EngineeringFieldConflict = {
  field: string;
  sources: string[];
  live_value: string;
  legacy_value: string;
  message: string;
};

export type EngineeringMeta = {
  /** Always document the physical/logical SoT for this payload. */
  canonical_source: CanonicalEngineeringSource;
  /** Monotonic-ish revision stamp (ISO or opaque). */
  revision?: string | null;
  updated_at?: string | null;
  conflicts?: EngineeringFieldConflict[];
};

export const CANONICAL_ENGINEERING_STORE =
  'project_engineering_live.payload' as const;

export const LEGACY_ENGINEERING_STORE =
  'clients.project_engineering_data' as const;

export const AUTHORITATIVE_COMPLIANCE_MODULE =
  'lib/projects/compliance' as const;

function isBlank(v: unknown): boolean {
  if (v == null) return true;
  if (typeof v === 'string') return v.trim() === '';
  if (typeof v === 'number') return !Number.isFinite(v);
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === 'object') return Object.keys(v as object).length === 0;
  return false;
}

function scalarKey(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
    return String(v).trim();
  }
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

/**
 * Prefer live (canonical) value when present; use legacy only when live is blank.
 * If both present and disagree → keep live for display, record CONFLICT.
 */
function pickScalarWithConflict(params: {
  field: string;
  live: unknown;
  legacy: unknown;
  conflicts: EngineeringFieldConflict[];
}): unknown {
  const liveBlank = isBlank(params.live);
  const legacyBlank = isBlank(params.legacy);
  if (!liveBlank && !legacyBlank) {
    const a = scalarKey(params.live);
    const b = scalarKey(params.legacy);
    if (a !== b) {
      params.conflicts.push({
        field: params.field,
        sources: [CANONICAL_ENGINEERING_STORE, LEGACY_ENGINEERING_STORE],
        live_value: a,
        legacy_value: b,
        message: `Conflict between live and legacy for ${params.field} — compliance must treat as CONFLICT/NEEDS_DATA`,
      });
    }
    return params.live;
  }
  if (!liveBlank) return params.live;
  if (!legacyBlank) return params.legacy;
  return params.live ?? params.legacy;
}

function mergeBuildingPlan(
  live: ProjectEngineeringData['building_plan'],
  legacy: ProjectEngineeringData['building_plan'],
  conflicts: EngineeringFieldConflict[]
): ProjectEngineeringData['building_plan'] {
  const keys = new Set([
    ...Object.keys(legacy || {}),
    ...Object.keys(live || {}),
  ]) as Set<keyof ProjectEngineeringData['building_plan']>;
  const out: ProjectEngineeringData['building_plan'] = {
    ...legacy,
    ...live,
    status: live?.status || legacy?.status || 'مسودة',
  };
  for (const key of keys) {
    if (key === 'status' || key === 'updated_at') continue;
    const picked = pickScalarWithConflict({
      field: `building_plan.${String(key)}`,
      live: live?.[key],
      legacy: legacy?.[key],
      conflicts,
    });
    (out as unknown as Record<string, unknown>)[String(key)] = picked;
  }
  return out;
}

/**
 * Build the working ProjectEngineeringData from live (canonical) + legacy fallback.
 * Does not invent values. Records conflicts instead of silently choosing.
 */
export function resolveCanonicalEngineeringDataset(params: {
  live: ProjectEngineeringData | null | undefined;
  legacy: ProjectEngineeringData | null | undefined;
  revision?: string | null;
}): ProjectEngineeringData {
  const conflicts: EngineeringFieldConflict[] = [];
  const live = params.live
    ? parseProjectEngineeringData(params.live)
    : null;
  const legacy = params.legacy
    ? parseProjectEngineeringData(params.legacy)
    : parseProjectEngineeringData(null);

  if (!live) {
    return {
      ...legacy,
      engineering_meta: {
        canonical_source: 'legacy_project_engineering_data',
        revision: params.revision ?? null,
        updated_at: new Date().toISOString(),
        conflicts: [],
      },
    };
  }

  const baseTr = legacy.technical_report;
  const liveTr = live.technical_report;

  const floorUsesLive = liveTr.floor_uses?.length ? liveTr.floor_uses : null;
  const floorUsesLegacy = baseTr.floor_uses?.length ? baseTr.floor_uses : null;
  if (floorUsesLive && floorUsesLegacy) {
    const a = scalarKey(floorUsesLive.map((f) => ({ n: f.floor_name, a: f.floor_area_m2, z: f.zones?.length })));
    const b = scalarKey(floorUsesLegacy.map((f) => ({ n: f.floor_name, a: f.floor_area_m2, z: f.zones?.length })));
    if (a !== b) {
      conflicts.push({
        field: 'technical_report.floor_uses',
        sources: [CANONICAL_ENGINEERING_STORE, LEGACY_ENGINEERING_STORE],
        live_value: a.slice(0, 200),
        legacy_value: b.slice(0, 200),
        message:
          'Live and legacy floor/zone structures differ — canonical live retained; compliance resolvers must not invent a merge',
      });
    }
  }

  const fpLive = live.fire_protection_design;
  const fpLegacy = legacy.fire_protection_design;
  if (fpLive && fpLegacy) {
    const fields: Array<[string, unknown, unknown]> = [
      ['fire_protection_design.occupancy.occupancy_type', fpLive.occupancy?.occupancy_type, fpLegacy.occupancy?.occupancy_type],
      ['fire_protection_design.occupancy.area_m2', fpLive.occupancy?.area_m2, fpLegacy.occupancy?.area_m2],
      ['fire_protection_design.occupancy.hazard_class', fpLive.occupancy?.hazard_class, fpLegacy.occupancy?.hazard_class],
      ['fire_protection_design.pump.capacity', fpLive.pump?.capacity?.value, fpLegacy.pump?.capacity?.value],
      ['fire_protection_design.water_tank.capacity_m3', fpLive.water_tank?.capacity_m3?.value, fpLegacy.water_tank?.capacity_m3?.value],
    ];
    for (const [field, lv, leg] of fields) {
      pickScalarWithConflict({ field, live: lv, legacy: leg, conflicts });
    }
  }

  const merged: ProjectEngineeringData = {
    ...legacy,
    ...live,
    technical_report: {
      ...baseTr,
      ...liveTr,
      earth_photo: preferTechnicalReportPhoto(baseTr.earth_photo, liveTr.earth_photo),
      facade_photo: preferTechnicalReportPhoto(baseTr.facade_photo, liveTr.facade_photo),
      site_photo: preferTechnicalReportPhoto(baseTr.site_photo, liveTr.site_photo),
      code_proof_photos:
        (liveTr.code_proof_photos || []).length > 0
          ? liveTr.code_proof_photos
          : baseTr.code_proof_photos,
      code_proofs_by_key: {
        ...(baseTr.code_proofs_by_key || {}),
        ...(liveTr.code_proofs_by_key || {}),
      },
      floor_uses: floorUsesLive || floorUsesLegacy || [],
      firefighting_items: liveTr.firefighting_items?.length
        ? liveTr.firefighting_items
        : baseTr.firefighting_items,
      ventilation_items: liveTr.ventilation_items?.length
        ? liveTr.ventilation_items
        : baseTr.ventilation_items,
      alarm_items: liveTr.alarm_items?.length ? liveTr.alarm_items : baseTr.alarm_items,
      exits_items: liveTr.exits_items?.length ? liveTr.exits_items : baseTr.exits_items,
    },
    building_plan: mergeBuildingPlan(live.building_plan, legacy.building_plan, conflicts),
    fire_protection_design: fpLive || fpLegacy,
    design_center: live.design_center || legacy.design_center,
    // PR 2: existing assessments are canonical-live only. Explicitly overwrite
    // the legacy spread even when live is undefined, so no fallback authority
    // can leak into a canonical-live project.
    existing_assessment: live.existing_assessment,
    // PR 3: under-construction study is canonical-live only. Do not leak a
    // legacy client JSON value into a project whose live payload exists.
    under_construction_study: live.under_construction_study,
    plan_attachments: live.plan_attachments || legacy.plan_attachments,
    safety_blueprints: live.safety_blueprints || legacy.safety_blueprints,
    field_visits: live.field_visits?.length ? live.field_visits : legacy.field_visits,
    supervision_report: live.supervision_report || legacy.supervision_report,
    report_pdf_archive: live.report_pdf_archive?.length
      ? live.report_pdf_archive
      : legacy.report_pdf_archive,
    workflow: { ...(legacy.workflow || {}), ...(live.workflow || {}) },
    contract_onboarding: live.contract_onboarding || legacy.contract_onboarding,
    boq: live.boq || legacy.boq,
    timeline: live.timeline || legacy.timeline,
    engineering_delivery: live.engineering_delivery || legacy.engineering_delivery,
    cd_cover_letter: live.cd_cover_letter || legacy.cd_cover_letter,
    final_inspection: live.final_inspection || legacy.final_inspection,
    completion_certificate: live.completion_certificate || legacy.completion_certificate,
    technical_notes: live.technical_notes || legacy.technical_notes,
    compliance: live.compliance || legacy.compliance,
    engineering_meta: {
      canonical_source: conflicts.length ? 'combined_with_conflicts' : 'project_engineering_live',
      revision: params.revision ?? live.engineering_meta?.revision ?? null,
      updated_at: new Date().toISOString(),
      conflicts,
    },
  };

  return merged;
}

/** True when advisory Design Center / DI / vision findings must be ignored for gates. */
export function isAdvisoryCompliancePayload(payload: {
  authoritative?: boolean | null;
} | null | undefined): boolean {
  if (!payload) return true;
  return payload.authoritative !== true;
}
