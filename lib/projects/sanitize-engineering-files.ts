/**
 * Keep project_engineering_data JSON lean for cross-device sync.
 * Prefer Supabase Storage paths; drop bulky inline dataUrls once cloud path exists.
 */

import type {
  PlanAttachmentFile,
  ProjectEngineeringData,
  SafetyBlueprintFile,
} from '@/lib/types/project-reports';

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

export function sanitizeEngineeringDataForPersist(
  data: ProjectEngineeringData
): ProjectEngineeringData {
  const design = data.design_center;
  const sheets = (design?.sheets || []).map((sheet) => ({
    ...sheet,
    versions: (sheet.versions || []).map((v) => ({
      ...v,
      file: slimPlanFile(v.file),
    })),
  }));

  const plan_attachments = {
    engineering_drawings: (data.plan_attachments?.engineering_drawings || []).map(slimPlanFile),
    hydraulic_calculations: (data.plan_attachments?.hydraulic_calculations || []).map(slimPlanFile),
  };

  const bp = data.safety_blueprints;
  const safety_blueprints = {
    architectural_base: slimSafetyFile(bp?.architectural_base || null),
    fire_fighting_file: slimSafetyFile(bp?.fire_fighting_file || null),
    fire_alarm_file: slimSafetyFile(bp?.fire_alarm_file || null),
    life_safety_file: slimSafetyFile(bp?.life_safety_file || null),
  };

  const building_plan = {
    ...data.building_plan,
    building_permit_file: data.building_plan.building_permit_file
      ? slimPlanFile(data.building_plan.building_permit_file)
      : data.building_plan.building_permit_file,
  };

  const slimSnap = <T extends { dataUrl?: string | null; storagePath?: string | null }>(
    snap: T
  ): T => {
    if (snap.storagePath && snap.dataUrl && snap.dataUrl.length > 8_000) {
      return { ...snap, dataUrl: null };
    }
    if (snap.dataUrl && snap.dataUrl.length > MAX_PERSISTED_DATA_URL_CHARS) {
      return { ...snap, dataUrl: null };
    }
    return snap;
  };

  const report_pdf_archive = (data.report_pdf_archive || []).map(slimSnap);
  const field_visits = (data.field_visits || []).map((v) => ({
    ...v,
    pdf_snapshots: (v.pdf_snapshots || []).map(slimSnap),
    latest_pdf: v.latest_pdf ? slimSnap(v.latest_pdf) : v.latest_pdf,
  }));
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
