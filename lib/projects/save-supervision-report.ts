/**
 * Persist supervision reports without per-item UPDATE loops.
 * Batch-upserts report_items and uses timeout-tolerant RPCs for JSONB.
 */

import { supabase } from '@/lib/supabase';
import type { ProjectEngineeringData, SupervisionReport } from '@/lib/types/project-reports';
import { trimSupervisionTextFields } from '@/lib/projects/supervision-report';
import { sanitizeEngineeringDataForPersist } from '@/lib/projects/sanitize-engineering-files';
import { backupEngineeringDataLocally } from '@/lib/supabase/safe-client-write';
import { saveStage5LiveBundle } from '@/lib/projects/stage5-live-store';
import { saveEngineeringLive } from '@/lib/projects/engineering-live-store';

export type UpsertProjectReportResult = {
  error: string | null;
  /** True when relational tables were written (script 035 applied) */
  usedRelationalTables: boolean;
  /** True when only local backup succeeded */
  localOnly?: boolean;
};

function isMissingRelation(message: string): boolean {
  return /relation|does not exist|Could not find the table|schema cache/i.test(message);
}

function isTimeout(message: string): boolean {
  return /statement timeout|canceling statement|57014/i.test(message);
}

/** Map UI supervision report → header row for project_supervision_reports */
function toReportHeaderRow(clientId: string, report: SupervisionReport) {
  const trimmed = trimSupervisionTextFields(report);
  return {
    client_id: clientId,
    status: trimmed.status || 'مسودة',
    report_date: trimmed.report_date || null,
    contractor_name: trimmed.contractor_name || null,
    branch_manager_name: trimmed.branch_manager_name || null,
    supervising_office: trimmed.supervising_office || null,
    safety_engineer_name: trimmed.safety_engineer_name || null,
    inspection_form_number: trimmed.inspection_form_number || null,
    study_number: trimmed.study_number || null,
    total_duration: trimmed.total_duration || null,
    start_date: trimmed.start_date || null,
    overall_progress_percent: trimmed.overall_progress_percent ?? null,
    overall_progress_manual: Boolean(trimmed.overall_progress_manual),
    notes: trimmed.notes || null,
    months: trimmed.months || [],
    header: {
      owner_name: trimmed.owner_name || null,
      project_name: trimmed.project_name || null,
      building_type: trimmed.building_type || null,
      area_m2: trimmed.area_m2 || null,
    },
    updated_at: new Date().toISOString(),
  };
}

/** Single-batch rows for report_items (no per-task loop of network round-trips) */
function toReportItemRows(
  clientId: string,
  reportId: string,
  report: SupervisionReport
): Record<string, unknown>[] {
  return (report.tasks || []).map((task, index) => ({
    id: task.id,
    report_id: reportId,
    client_id: clientId,
    sort_order: index,
    category_id: task.category_id || null,
    category_label: task.category_label || null,
    description: task.description || null,
    work_type: task.work_type || null,
    total_percent: task.total_percent ?? null,
    month_progress: task.month_progress || {},
    updated_at: new Date().toISOString(),
  }));
}

/**
 * Batch upsert supervision header + all progress items in two round-trips
 * (1 upsert header, 1 upsert all items) — never N individual UPDATEs.
 */
export async function upsertProjectReport(
  clientId: string,
  report: SupervisionReport
): Promise<{ reportId: string | null; error: string | null; skipped?: boolean }> {
  const header = toReportHeaderRow(clientId, report);

  const { data: upserted, error: headerError } = await supabase
    .from('project_supervision_reports')
    .upsert(header, { onConflict: 'client_id' })
    .select('id')
    .maybeSingle();

  if (headerError) {
    if (isMissingRelation(headerError.message)) {
      return { reportId: null, error: null, skipped: true };
    }
    return { reportId: null, error: headerError.message };
  }

  const reportId = upserted?.id as string | undefined;
  if (!reportId) {
    return { reportId: null, error: 'تعذر الحصول على معرف تقرير الإشراف' };
  }

  const itemRows = toReportItemRows(clientId, reportId, trimSupervisionTextFields(report));

  if (itemRows.length) {
    const { error: itemsError } = await supabase
      .from('report_items')
      .upsert(itemRows, { onConflict: 'report_id,id' });

    if (itemsError) {
      if (isMissingRelation(itemsError.message)) {
        return { reportId, error: null, skipped: true };
      }
      return { reportId, error: itemsError.message };
    }

    // Drop stale items in one batched delete (not a per-row UPDATE loop)
    const keepIds = itemRows.map((r) => String(r.id));
    const { data: existing } = await supabase
      .from('report_items')
      .select('id')
      .eq('report_id', reportId);
    const orphanIds = (existing || [])
      .map((r) => String((r as { id: string }).id))
      .filter((id) => !keepIds.includes(id));
    if (orphanIds.length) {
      await supabase.from('report_items').delete().eq('report_id', reportId).in('id', orphanIds);
    }
  } else {
    await supabase.from('report_items').delete().eq('report_id', reportId);
  }

  return { reportId, error: null };
}

async function persistEngineeringJsonb(
  clientId: string,
  data: ProjectEngineeringData,
  pipelineStage: string | null,
  mode: 'full' | 'supervision-merge'
): Promise<string | null> {
  if (mode === 'supervision-merge' && data.supervision_report) {
    const supervision = trimSupervisionTextFields(data.supervision_report);
    // Prefer multi-key patch so field_visits are not dropped on lean supervision saves
    const { error: patchError } = await supabase.rpc('merge_project_engineering_patch', {
      p_client_id: clientId,
      p_patch: {
        supervision_report: supervision,
        field_visits: data.field_visits || [],
        report_pdf_archive: data.report_pdf_archive || [],
      },
      p_pipeline_stage: pipelineStage,
    });
    if (!patchError) return null;

    const { error: mergeError } = await supabase.rpc('merge_supervision_report_json', {
      p_client_id: clientId,
      p_supervision: supervision,
      p_pipeline_stage: pipelineStage,
    });
    if (!mergeError) return null;
    if (!isMissingRelation(mergeError.message) && !/function|Could not find/i.test(mergeError.message)) {
      // fall through to full paths on real errors (including timeout → retry full RPC)
      if (!isTimeout(mergeError.message)) {
        // try full RPC next
      }
    }
  }

  // Slim bloated inline images server-side, then retry lean/full RPC
  if (mode === 'supervision-merge') {
    await supabase.rpc('slim_project_engineering_data_urls', { p_client_id: clientId });
    const { error: patchRetry } = await supabase.rpc('merge_project_engineering_patch', {
      p_client_id: clientId,
      p_patch: {
        supervision_report: trimSupervisionTextFields(data.supervision_report),
        field_visits: data.field_visits || [],
        report_pdf_archive: data.report_pdf_archive || [],
      },
      p_pipeline_stage: pipelineStage,
    });
    if (!patchRetry) return null;
  }

  const slimmed = sanitizeEngineeringDataForPersist(data, { aggressive: true });
  const { error: rpcError } = await supabase.rpc('save_project_engineering_data', {
    p_client_id: clientId,
    p_data: slimmed,
    p_pipeline_stage: pipelineStage,
  });
  if (!rpcError) return null;
  if (isTimeout(rpcError.message)) {
    return rpcError.message;
  }
  if (isMissingRelation(rpcError.message) || /function|Could not find/i.test(rpcError.message)) {
    return (
      'دوال الحفظ (save_project_engineering_data / merge_*) غير موجودة. ' +
      'نفّذ سكربتات 035 و 036 و 037 في Supabase. ' +
      'تم تجنّب UPDATE الكامل لأنه يسبب statement timeout على الملفات الكبيرة.'
    );
  }

  // Last resort — only for non-timeout errors when RPC exists but rejected payload shape
  const payload: Record<string, unknown> = {
    project_engineering_data: slimmed,
  };
  if (pipelineStage) payload.pipeline_stage = pipelineStage;

  const { error } = await supabase.from('clients').update(payload).eq('id', clientId);
  return error?.message || null;
}

/**
 * Save engineering payload with optimistic local backup first.
 * ALL stages use project_engineering_live — never rewrite fat JSONB.
 */
export async function saveReportData(
  clientId: string,
  nextData: ProjectEngineeringData,
  options?: {
    pipelineStage?: string | null;
    /** Also mirror visits/supervision into relational stage-5 tables when available */
    supervisionFocus?: boolean;
    /** Stage 4 technical report — dedicated live table, no fat JSONB rewrite */
    techReportFocus?: boolean;
  }
): Promise<UpsertProjectReportResult> {
  const stamped = sanitizeEngineeringDataForPersist(
    {
      ...nextData,
      supervision_report: nextData.supervision_report
        ? trimSupervisionTextFields(nextData.supervision_report)
        : nextData.supervision_report,
    },
    { aggressive: true }
  );

  // Optimistic local persistence BEFORE network — UI retry keeps user input
  backupEngineeringDataLocally(clientId, stamped);

  // Universal path: all stages → live table (never project_engineering_data)
  const live = await saveEngineeringLive({
    clientId,
    data: stamped,
    pipelineStage: options?.pipelineStage ?? null,
  });
  if (live.error) {
    return { error: live.error, usedRelationalTables: true, localOnly: true };
  }

  // Best-effort stage-5 relational mirror for PDF index / report_items
  if (options?.supervisionFocus && stamped.supervision_report) {
    await saveStage5LiveBundle({
      clientId,
      fieldVisits: stamped.field_visits || [],
      supervision: stamped.supervision_report,
      pdfArchive: stamped.report_pdf_archive || [],
      pipelineStage: options?.pipelineStage ?? null,
    });
  }

  return { error: null, usedRelationalTables: true };
}
