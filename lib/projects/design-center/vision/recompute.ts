/**
 * Recompute zone labels / egress after engineer manual overrides (local).
 */

import { buildComplianceReport } from '@/lib/projects/design-center/vision/complianceReport';
import { runCoverageAudit } from '@/lib/projects/design-center/vision/coverageAuditor';
import { runEgressAnalysis } from '@/lib/projects/design-center/vision/egressEngine';
import { runPreCalculations } from '@/lib/projects/design-center/vision/preCalculations';
import {
  applyManualZoneOverride,
  collectZoneSystemRequirements,
} from '@/lib/projects/design-center/vision/zoneAnalyzer';
import type { DesignAnalysisJob } from '@/lib/projects/design-center/types';
import type {
  CADAnalysisResult,
  ComplianceReport,
  CoverageAuditResult,
  DetectedZone,
  EgressAnalysisSummary,
  PreCalculationBundle,
  ScaleCalibration,
  ZoneManualOverride,
  ZoneSystemRequirement,
} from '@/lib/projects/design-center/vision/types';

/** Rebuild a CADAnalysisResult snapshot from a persisted analysis job (for overlay edits). */
export function cadResultFromAnalysisJob(
  analysis: DesignAnalysisJob | null | undefined
): CADAnalysisResult | null {
  const raw = analysis?.result?.raw as
    | {
        cad_vision?: string;
        cad_vision_result?: {
          status?: CADAnalysisResult['status'];
          scale?: ScaleCalibration;
          preview_data_url?: string | null;
          egress?: EgressAnalysisSummary | null;
          zone_system_requirements?: ZoneSystemRequirement[];
          coverage?: CoverageAuditResult | null;
          pre_calculations?: PreCalculationBundle | null;
          compliance_report?: ComplianceReport | null;
          title_block?: CADAnalysisResult['title_block'];
          gross_floor_area_m2?: number | null;
          occupancy?: string | null;
          exits_count?: number | null;
          doors_count?: number | null;
          warnings_ar?: string[];
          warnings_en?: string[];
          width_px?: number;
          height_px?: number;
        } | null;
      }
    | undefined;
  if (!analysis?.result || raw?.cad_vision !== 'local_client') return null;
  const meta = raw.cad_vision_result;
  const zones = (analysis.result.rooms || []) as DetectedZone[];
  const walls = (analysis.result.walls || []) as CADAnalysisResult['walls'];
  const dims = analysis.result.dimensions as
    | { scale_ratio?: string | null; meters_per_pixel?: number | null }
    | undefined;
  return {
    status: meta?.status || 'completed',
    engine: 'local_client',
    source_kind: 'pdf',
    file_name: null,
    processed_at: analysis.finishedAt || new Date().toISOString(),
    width_px:
      meta?.width_px ||
      Math.max(...zones.map((z) => z.bounds.x + z.bounds.w), 1),
    height_px:
      meta?.height_px ||
      Math.max(...zones.map((z) => z.bounds.y + z.bounds.h), 1),
    dpi: meta?.scale?.dpi || 300,
    scale: meta?.scale || {
      ratio_text: dims?.scale_ratio || null,
      scale_denominator: null,
      meters_per_pixel: dims?.meters_per_pixel ?? null,
      source: 'unknown',
      dpi: 300,
    },
    title_block: meta?.title_block || {
      project_name: null,
      sheet_number: null,
      drawing_title: null,
      occupancy: meta?.occupancy || null,
      area_m2: meta?.gross_floor_area_m2 ?? null,
      scale_text: null,
      revision: null,
      raw_text: '',
      source: 'none',
    },
    zones,
    walls,
    // Reconstruct exit anchors from last egress run (full text corpus not persisted)
    text_anchors: (meta?.egress?.exits || []).map((p) => ({
      text: 'EXIT',
      x: p.x,
      y: p.y,
      w: 8,
      h: 8,
    })),
    preview_data_url: meta?.preview_data_url || null,
    egress: meta?.egress || null,
    zone_system_requirements: meta?.zone_system_requirements || [],
    coverage: meta?.coverage || null,
    pre_calculations: meta?.pre_calculations || null,
    compliance_report: meta?.compliance_report || null,
    gross_floor_area_m2: meta?.gross_floor_area_m2 ?? null,
    exits_count: meta?.exits_count ?? null,
    doors_count: meta?.doors_count ?? null,
    occupancy: meta?.occupancy || analysis.result.occupancy || null,
    extracted_text: '',
    warnings_ar: meta?.warnings_ar || [],
    warnings_en: meta?.warnings_en || [],
    error: null,
    error_code: null,
    privacy: 'local_only',
  };
}

export function applyZoneOverridesToCadResult(
  result: CADAnalysisResult,
  overrides: ZoneManualOverride[],
  opts?: { hasSprinkler?: boolean; hasFireAlarm?: boolean }
): CADAnalysisResult {
  if (!result || !overrides.length) return result;
  let zones: DetectedZone[] = result.zones.map((z) => {
    const ov = overrides.find((o) => o.zone_id === z.id);
    if (!ov) return z;
    return applyManualZoneOverride(z, ov, result.scale.meters_per_pixel);
  });

  const egress = runEgressAnalysis({
    zones,
    textAnchors: result.text_anchors || [],
    width_px: result.width_px,
    height_px: result.height_px,
    metersPerPixel: result.scale.meters_per_pixel,
    hasSprinkler: Boolean(opts?.hasSprinkler),
    occupancy: result.occupancy || result.title_block.occupancy,
  });

  zones = zones.map((z) => {
    const a = egress.assessments.find((x) => x.zone_id === z.id);
    return {
      ...z,
      travel_distance_m: a?.travel_distance_m ?? null,
      egress_status: a?.status ?? null,
    };
  });

  const zone_system_requirements = collectZoneSystemRequirements(zones);
  const coverage = runCoverageAudit({
    zones,
    textAnchors: result.text_anchors || [],
    metersPerPixel: result.scale.meters_per_pixel,
    occupancy: result.occupancy || result.title_block.occupancy,
  });
  const pre_calculations = runPreCalculations({
    zones,
    hazard: coverage.hazard_class,
    zoneRequirements: zone_system_requirements,
    coverage,
    hasSprinklerDeclared: Boolean(opts?.hasSprinkler),
  });
  const compliance_report = buildComplianceReport({
    egress,
    coverage,
    zoneRequirements: zone_system_requirements,
    preCalculations: pre_calculations,
    hasSprinklerDeclared: Boolean(opts?.hasSprinkler),
    hasFireAlarmDeclared: Boolean(opts?.hasFireAlarm),
    scaleKnown: result.scale.meters_per_pixel != null,
  });

  const zoneAreaSum = zones.reduce((s, z) => s + (z.area_m2 || 0), 0);

  return {
    ...result,
    zones,
    egress,
    zone_system_requirements,
    coverage,
    pre_calculations,
    compliance_report,
    gross_floor_area_m2:
      result.title_block.area_m2 != null && result.title_block.area_m2 > 0
        ? result.title_block.area_m2
        : zoneAreaSum > 0
          ? Math.round(zoneAreaSum * 100) / 100
          : result.gross_floor_area_m2,
    processed_at: new Date().toISOString(),
  };
}
