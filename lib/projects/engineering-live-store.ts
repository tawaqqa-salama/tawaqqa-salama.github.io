/**
 * All-stages engineering live store.
 * NEVER reads/writes clients.project_engineering_data (avoids statement timeout).
 */

import { supabase } from '@/lib/supabase';
import type { ProjectEngineeringData } from '@/lib/types/project-reports';
import { parseProjectEngineeringData } from '@/lib/business/project-reports';
import { sanitizeEngineeringDataForPersist } from '@/lib/projects/sanitize-engineering-files';

function isMissing(message: string): boolean {
  return /relation|does not exist|Could not find|schema cache|function/i.test(message);
}

const MISSING_SQL_HINT =
  'جدول الحفظ الحي لجميع المراحل غير موجود. ' +
  'نفّذ مرة واحدة فقط في Supabase SQL Editor الملف: scripts/sql/040_all_stages_engineering_live.sql ' +
  'ثم أعد الحفظ. لا حاجة لسكربتات 035–039.';

/** Persist full (sanitized) engineering payload without touching the fat JSONB column. */
export async function saveEngineeringLive(params: {
  clientId: string;
  data: ProjectEngineeringData;
  pipelineStage?: string | null;
}): Promise<{ error: string | null; usedRpc: boolean }> {
  const payload = sanitizeEngineeringDataForPersist(params.data, { aggressive: true });

  const { error: rpcError } = await supabase.rpc('save_project_engineering_live', {
    p_client_id: params.clientId,
    p_payload: payload,
    p_pipeline_stage: params.pipelineStage ?? null,
  });

  if (!rpcError) return { error: null, usedRpc: true };

  if (!isMissing(rpcError.message)) {
    return { error: rpcError.message, usedRpc: true };
  }

  // Fallback: direct upsert (still never touches project_engineering_data)
  if (params.pipelineStage) {
    await supabase
      .from('clients')
      .update({ pipeline_stage: params.pipelineStage })
      .eq('id', params.clientId);
  }

  const { error } = await supabase.from('project_engineering_live').upsert(
    {
      client_id: params.clientId,
      payload,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'client_id' }
  );

  if (error) {
    if (isMissing(error.message)) return { error: MISSING_SQL_HINT, usedRpc: false };
    return { error: error.message, usedRpc: false };
  }
  return { error: null, usedRpc: false };
}

/** Load live engineering payload (null if table missing / empty). */
export async function loadEngineeringLive(
  clientId: string
): Promise<ProjectEngineeringData | null> {
  const { data, error } = await supabase
    .from('project_engineering_live')
    .select('payload')
    .eq('client_id', clientId)
    .maybeSingle();

  if (error) return null;
  if (!data?.payload || typeof data.payload !== 'object') return null;
  return parseProjectEngineeringData(data.payload);
}

/**
 * Prefer live payload (current saves) over legacy fat column.
 * Live wins key-by-key where it has content; base fills gaps.
 */
export function hydrateEngineeringWithLive(
  base: ProjectEngineeringData,
  live: ProjectEngineeringData | null
): ProjectEngineeringData {
  if (!live) return base;
  return {
    ...base,
    ...live,
    // Deep-ish merge for nested blobs that may be partially filled
    technical_report: { ...base.technical_report, ...live.technical_report },
    building_plan: { ...base.building_plan, ...live.building_plan },
    fire_protection_design: live.fire_protection_design || base.fire_protection_design,
    design_center: live.design_center || base.design_center,
    plan_attachments: live.plan_attachments || base.plan_attachments,
    safety_blueprints: live.safety_blueprints || base.safety_blueprints,
    field_visits: live.field_visits?.length ? live.field_visits : base.field_visits,
    supervision_report: live.supervision_report || base.supervision_report,
    report_pdf_archive: live.report_pdf_archive?.length
      ? live.report_pdf_archive
      : base.report_pdf_archive,
    workflow: { ...(base.workflow || {}), ...(live.workflow || {}) },
    contract_onboarding: live.contract_onboarding || base.contract_onboarding,
    boq: live.boq || base.boq,
    timeline: live.timeline || base.timeline,
    engineering_delivery: live.engineering_delivery || base.engineering_delivery,
    cd_cover_letter: live.cd_cover_letter || base.cd_cover_letter,
    final_inspection: live.final_inspection || base.final_inspection,
    completion_certificate: live.completion_certificate || base.completion_certificate,
    technical_notes: live.technical_notes || base.technical_notes,
  };
}

/** Attach live engineering onto a client record (for fetchers / modals). */
export async function attachEngineeringLiveToClient<
  T extends { id: string; project_engineering_data?: unknown },
>(client: T): Promise<T> {
  const live = await loadEngineeringLive(client.id);
  if (!live) return client;
  const base = parseProjectEngineeringData(
    client.project_engineering_data as ProjectEngineeringData | null | undefined
  );
  return {
    ...client,
    project_engineering_data: hydrateEngineeringWithLive(base, live),
  };
}
