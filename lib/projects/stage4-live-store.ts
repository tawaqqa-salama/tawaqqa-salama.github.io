/**
 * Stage 4 live store — technical report + fire protection design + workflow.
 * NEVER reads/writes clients.project_engineering_data (avoids statement timeout).
 */

import { supabase } from '@/lib/supabase';
import type {
  FireProtectionDesign,
} from '@/lib/types/fire-protection-design';
import type {
  ProjectEngineeringData,
  TechnicalReport,
  TechnicalReportPhoto,
  TechnicalReportSectionItem,
  TechnicalReportZone,
} from '@/lib/types/project-reports';
import { mergeFireProtectionDesign } from '@/lib/projects/admin-uc-report/design';

export type Stage4Bundle = {
  technical_report: TechnicalReport;
  fire_protection_design: FireProtectionDesign;
  workflow: ProjectEngineeringData['workflow'];
};

function isMissing(message: string): boolean {
  return /relation|does not exist|Could not find|schema cache|function/i.test(message);
}

function slimPhoto(photo: TechnicalReportPhoto | null | undefined): TechnicalReportPhoto | null {
  if (!photo) return null;
  // Keep Storage path; drop inline bytes only
  if (photo.storagePath) return { ...photo, dataUrl: undefined };
  return { ...photo, dataUrl: undefined };
}

function slimZones(zones: TechnicalReportZone[] | undefined): TechnicalReportZone[] {
  return (zones || []).map((z) => ({
    ...z,
    code_proof_photo: slimPhoto(z.code_proof_photo) || null,
  }));
}

function slimSectionItems(
  items: TechnicalReportSectionItem[] | undefined
): TechnicalReportSectionItem[] {
  return (items || []).map((item) => ({
    ...item,
    photos: (item.photos || []).map((p) => ({ ...p, dataUrl: undefined })),
  }));
}

/** Drop inline photo dataUrls from technical report before cloud live save. */
function slimTechnicalReport(report: TechnicalReport): TechnicalReport {
  const proofs: TechnicalReport['code_proofs_by_key'] = {};
  for (const [key, photos] of Object.entries(report.code_proofs_by_key || {})) {
    proofs[key] = (photos || []).map((p) => ({ ...p, dataUrl: undefined }));
  }
  return {
    ...report,
    earth_photo: slimPhoto(report.earth_photo),
    facade_photo: slimPhoto(report.facade_photo),
    site_photo: slimPhoto(report.site_photo),
    code_proof_photos: (report.code_proof_photos || []).map((p) => ({
      ...p,
      dataUrl: undefined,
    })),
    code_proofs_by_key: proofs,
    floor_uses: (report.floor_uses || []).map((f) => ({
      ...f,
      zones: slimZones(f.zones),
    })),
    firefighting_items: slimSectionItems(report.firefighting_items),
    ventilation_items: slimSectionItems(report.ventilation_items),
    alarm_items: slimSectionItems(report.alarm_items),
    exits_items: slimSectionItems(report.exits_items),
  };
}

/** Drop inline attachment dataUrls from fire protection design (keep labels/paths). */
function slimFireProtection(design: FireProtectionDesign | undefined | null): FireProtectionDesign {
  const merged = mergeFireProtectionDesign(design || undefined);
  return {
    ...merged,
    attachments: (merged.attachments || []).map((a) => ({
      ...a,
      dataUrl: null,
    })),
  };
}

/** Persist stage 4 without touching the fat engineering JSONB column. */
export async function saveStage4LiveBundle(params: {
  clientId: string;
  technicalReport: TechnicalReport;
  fireProtectionDesign?: FireProtectionDesign | null;
  workflow?: ProjectEngineeringData['workflow'];
  pipelineStage?: string | null;
}): Promise<{ error: string | null; usedRpc: boolean }> {
  const technical = slimTechnicalReport(params.technicalReport);
  const fire = slimFireProtection(params.fireProtectionDesign);
  const workflow = params.workflow || {};

  const { error: rpcError } = await supabase.rpc('save_stage4_live_bundle', {
    p_client_id: params.clientId,
    p_technical_report: technical,
    p_fire_protection_design: fire,
    p_workflow: workflow,
    p_pipeline_stage: params.pipelineStage ?? null,
  });

  if (!rpcError) return { error: null, usedRpc: true };

  if (!isMissing(rpcError.message)) {
    return { error: rpcError.message, usedRpc: true };
  }

  const tableErr = await saveStage4ViaTables({
    clientId: params.clientId,
    technicalReport: technical,
    fireProtectionDesign: fire,
    workflow,
    pipelineStage: params.pipelineStage,
  });
  return { error: tableErr, usedRpc: false };
}

async function saveStage4ViaTables(params: {
  clientId: string;
  technicalReport: TechnicalReport;
  fireProtectionDesign: FireProtectionDesign;
  workflow: ProjectEngineeringData['workflow'];
  pipelineStage?: string | null;
}): Promise<string | null> {
  if (params.pipelineStage) {
    const { error } = await supabase
      .from('clients')
      .update({ pipeline_stage: params.pipelineStage })
      .eq('id', params.clientId);
    if (error && !/pipeline_stage/i.test(error.message) && !isMissing(error.message)) {
      // continue — stage4 row is the critical write
    }
  }

  const { error } = await supabase.from('project_stage4_live').upsert(
    {
      client_id: params.clientId,
      technical_report: params.technicalReport,
      fire_protection_design: params.fireProtectionDesign,
      workflow: params.workflow || {},
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'client_id' }
  );

  if (error) {
    if (isMissing(error.message)) {
      return (
        'جدول حفظ المرحلة 4 غير موجود في Supabase. ' +
        'نفّذ السكربت scripts/sql/039_stage4_tech_live_store.sql مرة واحدة ثم أعد الحفظ. ' +
        'هذا الحفظ لا يلمس العمود الثقيل project_engineering_data.'
      );
    }
    return error.message;
  }
  return null;
}

/** Load stage-4 live data from dedicated table (not from fat JSONB). */
export async function loadStage4LiveBundle(clientId: string): Promise<Stage4Bundle | null> {
  const { data, error } = await supabase
    .from('project_stage4_live')
    .select('technical_report, fire_protection_design, workflow')
    .eq('client_id', clientId)
    .maybeSingle();

  if (error) {
    if (isMissing(error.message)) return null;
    return null;
  }
  if (!data) return null;

  const technical_report = (data.technical_report && typeof data.technical_report === 'object'
    ? data.technical_report
    : {}) as TechnicalReport;
  const fire_protection_design = mergeFireProtectionDesign(
    data.fire_protection_design && typeof data.fire_protection_design === 'object'
      ? (data.fire_protection_design as Partial<FireProtectionDesign>)
      : null
  );
  const workflow = (
    data.workflow && typeof data.workflow === 'object' ? data.workflow : {}
  ) as ProjectEngineeringData['workflow'];

  const hasTech = Object.keys(technical_report || {}).length > 0;
  const hasFire =
    fire_protection_design.pump?.capacity?.value != null ||
    fire_protection_design.pump?.type ||
    (fire_protection_design.water_tank?.capacity_m3?.value != null);
  const hasWorkflow = Boolean(workflow && Object.keys(workflow).length);

  if (!hasTech && !hasFire && !hasWorkflow) return null;

  return { technical_report, fire_protection_design, workflow };
}

function preferPhoto(
  local: TechnicalReportPhoto | null | undefined,
  remote: TechnicalReportPhoto | null | undefined
): TechnicalReportPhoto | null {
  if (remote?.dataUrl) return remote;
  if (local?.dataUrl) return local;
  return remote || local || null;
}

/** Overlay stage-4 live bundle onto in-memory engineering data. */
export function hydrateEngineeringWithStage4(
  data: ProjectEngineeringData,
  bundle: Stage4Bundle | null
): ProjectEngineeringData {
  if (!bundle) return data;
  const localTr = data.technical_report;
  const remoteTr = bundle.technical_report;
  return {
    ...data,
    technical_report: {
      ...localTr,
      ...remoteTr,
      // Live store strips dataUrls — keep local preview bytes when present
      earth_photo: preferPhoto(localTr.earth_photo, remoteTr.earth_photo),
      facade_photo: preferPhoto(localTr.facade_photo, remoteTr.facade_photo),
      site_photo: preferPhoto(localTr.site_photo, remoteTr.site_photo),
      code_proof_photos:
        (localTr.code_proof_photos || []).some((p) => p.dataUrl)
          ? localTr.code_proof_photos
          : remoteTr.code_proof_photos || localTr.code_proof_photos,
      code_proofs_by_key: {
        ...(remoteTr.code_proofs_by_key || {}),
        ...(localTr.code_proofs_by_key || {}),
      },
    },
    fire_protection_design: bundle.fire_protection_design
      ? mergeFireProtectionDesign({
          ...data.fire_protection_design,
          ...bundle.fire_protection_design,
        })
      : data.fire_protection_design,
    workflow: {
      ...(data.workflow || {}),
      ...(bundle.workflow || {}),
    },
  };
}
