/**
 * Persist supervision reports without per-item UPDATE loops.
 * Batch-upserts report_items and uses timeout-tolerant RPCs for JSONB.
 */

import { supabase } from '@/lib/supabase';
import type { ProjectEngineeringData, SupervisionReport } from '@/lib/types/project-reports';
import { trimSupervisionTextFields } from '@/lib/projects/supervision-report';
import { sanitizeEngineeringDataForPersist } from '@/lib/projects/sanitize-engineering-files';
import { backupEngineeringDataLocally } from '@/lib/supabase/safe-client-write';

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

  const { error: rpcError } = await supabase.rpc('save_project_engineering_data', {
    p_client_id: clientId,
    p_data: data,
    p_pipeline_stage: pipelineStage,
  });
  if (!rpcError) return null;
  if (!isMissingRelation(rpcError.message) && !/function|Could not find/i.test(rpcError.message)) {
    if (isTimeout(rpcError.message)) {
      // Final attempt: direct update (may still timeout; caller keeps local backup)
    } else {
      // try direct update as fallback
    }
  }

  const payload: Record<string, unknown> = {
    project_engineering_data: data,
  };
  if (pipelineStage) payload.pipeline_stage = pipelineStage;

  const { error } = await supabase.from('clients').update(payload).eq('id', clientId);
  return error?.message || null;
}

/**
 * Save engineering payload with optimistic local backup first.
 * For supervision-heavy saves: batch upsert report_items, then lean JSONB merge.
 */
export async function saveReportData(
  clientId: string,
  nextData: ProjectEngineeringData,
  options?: {
    pipelineStage?: string | null;
    /** Prefer lean supervision merge + relational batch upsert */
    supervisionFocus?: boolean;
  }
): Promise<UpsertProjectReportResult> {
  const stamped = sanitizeEngineeringDataForPersist({
    ...nextData,
    supervision_report: nextData.supervision_report
      ? trimSupervisionTextFields(nextData.supervision_report)
      : nextData.supervision_report,
  });

  // Optimistic local persistence BEFORE network — UI retry keeps user input
  backupEngineeringDataLocally(clientId, stamped);

  let usedRelationalTables = false;
  if (options?.supervisionFocus && stamped.supervision_report) {
    const relational = await upsertProjectReport(clientId, stamped.supervision_report);
    if (relational.error) {
      return {
        error: relational.error,
        usedRelationalTables: !relational.skipped,
        localOnly: true,
      };
    }
    usedRelationalTables = !relational.skipped;
  }

  const pipelineStage = options?.pipelineStage ?? null;
  const mode = options?.supervisionFocus ? 'supervision-merge' : 'full';
  let error = await persistEngineeringJsonb(clientId, stamped, pipelineStage, mode);

  if (error && isTimeout(error) && options?.supervisionFocus && stamped.supervision_report) {
    // Retry lean merge only — avoids rewriting large design_center blobs
    error = await persistEngineeringJsonb(clientId, stamped, pipelineStage, 'supervision-merge');
  }

  if (error) {
    return { error, usedRelationalTables, localOnly: true };
  }

  return { error: null, usedRelationalTables };
}
