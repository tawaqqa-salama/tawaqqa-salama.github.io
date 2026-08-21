/**
 * Keep project_engineering_data JSON lean for cross-device sync.
 * Prefer Supabase Storage paths; drop bulky inline dataUrls once cloud path exists.
 */

import type {
  PlanAttachmentFile,
  ProjectEngineeringData,
  SafetyBlueprintFile,
} from '@/lib/types/project-reports';
import { sanitizeTechnicalEvidenceStateForPersist } from '@/lib/projects/technical-report-evidence';
import {
  normalizeFieldVisitEvidenceForVisit,
  sanitizeFieldVisitEvidenceForPersist,
} from '@/lib/projects/field-visit-evidence';

/** Inline data URLs larger than this bloat JSONB and break multi-device sync */
export const MAX_PERSISTED_DATA_URL_CHARS = 180_000;

function slimPlanFile(file: PlanAttachmentFile): PlanAttachmentFile {
  if (file.storagePath) {
    return { ...file, dataUrl: null };
  }
  if (file.dataUrl && file.dataUrl.length > MAX_PERSISTED_DATA_URL_CHARS) {
    return { ...file, dataUrl: null };
  }
  return file;
}

function slimSafetyFile(file: SafetyBlueprintFile | null): SafetyBlueprintFile | null {
  if (!file) return null;
  if (file.dataUrl && file.dataUrl.length > MAX_PERSISTED_DATA_URL_CHARS) {
    return { ...file, dataUrl: null };
  }
  return file;
}

function dropDataUrl<T extends { dataUrl?: string | null }>(file: T): T {
  return { ...file, dataUrl: null };
}

/**
 * @param aggressive Drop ALL inline dataUrls (keep storagePath only).
 * Use for supervision/visit lean saves to avoid Postgres statement timeout.
 */
export function sanitizeEngineeringDataForPersist(
  data: ProjectEngineeringData,
  opts?: { aggressive?: boolean; clientId?: string }
): ProjectEngineeringData {
  const aggressive = Boolean(opts?.aggressive);
  const slimPlan = aggressive
    ? (f: PlanAttachmentFile) => dropDataUrl(slimPlanFile(f))
    : slimPlanFile;
  const slimSafety = aggressive
    ? (f: SafetyBlueprintFile | null) => (f ? dropDataUrl(slimSafetyFile(f) || f) : null)
    : slimSafetyFile;

  const design = data.design_center;
  const sheets = (design?.sheets || []).map((sheet) => ({
    ...sheet,
    versions: (sheet.versions || []).map((v) => ({
      ...v,
      file: slimPlan(v.file),
    })),
  }));

  const plan_attachments = {
    engineering_drawings: (data.plan_attachments?.engineering_drawings || []).map(slimPlan),
    hydraulic_calculations: (data.plan_attachments?.hydraulic_calculations || []).map(slimPlan),
  };

  const bp = data.safety_blueprints;
  const safety_blueprints = {
    architectural_base: slimSafety(bp?.architectural_base || null),
    fire_fighting_file: slimSafety(bp?.fire_fighting_file || null),
    fire_alarm_file: slimSafety(bp?.fire_alarm_file || null),
    life_safety_file: slimSafety(bp?.life_safety_file || null),
  };

  const building_plan = {
    ...data.building_plan,
    building_permit_file: data.building_plan.building_permit_file
      ? slimPlan(data.building_plan.building_permit_file)
      : data.building_plan.building_permit_file,
  };

  const slimSnap = <T extends { dataUrl?: string | null; storagePath?: string | null }>(
    snap: T
  ): T => {
    if (aggressive) return { ...snap, dataUrl: null };
    if (snap.storagePath && snap.dataUrl && snap.dataUrl.length > 8_000) {
      return { ...snap, dataUrl: null };
    }
    if (snap.dataUrl && snap.dataUrl.length > MAX_PERSISTED_DATA_URL_CHARS) {
      return { ...snap, dataUrl: null };
    }
    return snap;
  };

  const report_pdf_archive = (data.report_pdf_archive || []).map(slimSnap);
  const field_visits = (data.field_visits || []).map((v) => {
    const safeVisit = opts?.clientId
      ? sanitizeFieldVisitEvidenceForPersist({ clientId: opts.clientId, visit: v })
      : normalizeFieldVisitEvidenceForVisit(v);
    return {
      ...safeVisit,
      pdf_snapshots: (safeVisit.pdf_snapshots || []).map(slimSnap),
      latest_pdf: safeVisit.latest_pdf ? slimSnap(safeVisit.latest_pdf) : safeVisit.latest_pdf,
    };
  });
  const tech = data.technical_report;
  /** TechnicalReportPhoto.dataUrl is `string | undefined` (not null). */
  const stripTechPhoto = <T extends { dataUrl?: string; storagePath?: string | null }>(
    p: T
  ): T => {
    // Keep Storage-backed photos; only drop inline bytes
    if (p.storagePath) return { ...p, dataUrl: undefined };
    // No storage yet — keep a short dataUrl rather than blank the report
    if (p.dataUrl && p.dataUrl.length > 400_000) {
      return { ...p, dataUrl: undefined };
    }
    return p;
  };
  const technical_report: ProjectEngineeringData['technical_report'] = {
    ...(aggressive
      ? {
          ...tech,
          earth_photo: tech.earth_photo ? stripTechPhoto(tech.earth_photo) : tech.earth_photo,
          facade_photo: tech.facade_photo ? stripTechPhoto(tech.facade_photo) : tech.facade_photo,
          site_photo: tech.site_photo ? stripTechPhoto(tech.site_photo) : tech.site_photo,
          code_proof_photos: (tech.code_proof_photos || []).map(stripTechPhoto),
          code_proofs_by_key: Object.fromEntries(
            Object.entries(tech.code_proofs_by_key || {}).map(([k, list]) => [
              k,
              (list || []).map(stripTechPhoto),
            ])
          ),
          firefighting_items: (tech.firefighting_items || []).map((item) => ({
            ...item,
            photos: (item.photos || []).map(stripTechPhoto),
          })),
          ventilation_items: (tech.ventilation_items || []).map((item) => ({
            ...item,
            photos: (item.photos || []).map(stripTechPhoto),
          })),
          alarm_items: (tech.alarm_items || []).map((item) => ({
            ...item,
            photos: (item.photos || []).map(stripTechPhoto),
          })),
          exits_items: (tech.exits_items || []).map((item) => ({
            ...item,
            photos: (item.photos || []).map(stripTechPhoto),
          })),
        }
      : tech),
    // Evidence URLs are transient presentation state. Do not backfill absent legacy state.
    ...(tech.evidence !== undefined
      ? { evidence: sanitizeTechnicalEvidenceStateForPersist(tech.evidence) }
      : {}),
  };

  const supervision_report = data.supervision_report
    ? {
        ...data.supervision_report,
        pdf_snapshots: (data.supervision_report.pdf_snapshots || []).map(slimSnap),
        latest_pdf: data.supervision_report.latest_pdf
          ? slimSnap(data.supervision_report.latest_pdf)
          : data.supervision_report.latest_pdf,
      }
    : data.supervision_report;

  return {
    ...data,
    technical_report,
    building_plan,
    plan_attachments,
    safety_blueprints,
    design_center: {
      ...design,
      sheets,
    },
    report_pdf_archive,
    field_visits,
    supervision_report,
  };
}

export function countCloudBackedDrawings(data: ProjectEngineeringData): {
  total: number;
  cloud: number;
  localOnly: number;
} {
  const files: PlanAttachmentFile[] = [];
  for (const sheet of data.design_center?.sheets || []) {
    for (const v of sheet.versions || []) files.push(v.file);
  }
  for (const f of data.plan_attachments?.engineering_drawings || []) files.push(f);
  for (const f of data.plan_attachments?.hydraulic_calculations || []) files.push(f);

  const cloud = files.filter((f) => Boolean(f.storagePath)).length;
  const localOnly = files.filter((f) => !f.storagePath && Boolean(f.dataUrl)).length;
  return { total: files.length, cloud, localOnly };
}
