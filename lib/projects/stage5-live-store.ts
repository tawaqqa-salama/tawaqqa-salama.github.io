/**
 * Stage 5 live store — visits + supervision + PDF archive.
 * NEVER reads/writes clients.project_engineering_data (avoids statement timeout).
 */

import { supabase } from '@/lib/supabase';
import type {
  FieldVisitReport,
  ProjectEngineeringData,
  SupervisionReport,
} from '@/lib/types/project-reports';
import type { ReportPdfSnapshot } from '@/lib/types/report-pdf-snapshot';
import { EMPTY_SUPERVISION_REPORT } from '@/lib/types/project-reports';
import { trimSupervisionTextFields } from '@/lib/projects/supervision-report';
import { backupEngineeringDataLocally } from '@/lib/supabase/safe-client-write';

export type Stage5Bundle = {
  field_visits: FieldVisitReport[];
  supervision_report: SupervisionReport;
  report_pdf_archive: ReportPdfSnapshot[];
};

function isMissing(message: string): boolean {
  return /relation|does not exist|Could not find|schema cache|function/i.test(message);
}

/** Drop inline dataUrls when storagePath exists — keeps stage-5 rows small. */
function slimSnapshot(snap: ReportPdfSnapshot): ReportPdfSnapshot {
  if (snap.storagePath && snap.dataUrl) {
    return { ...snap, dataUrl: null };
  }
  return snap;
}

function slimVisit(visit: FieldVisitReport): FieldVisitReport {
  const snaps = (visit.pdf_snapshots || []).map(slimSnapshot);
  return {
    ...visit,
    pdf_snapshots: snaps,
    latest_pdf: visit.latest_pdf ? slimSnapshot(visit.latest_pdf) : visit.latest_pdf,
  };
}

function slimSupervision(report: SupervisionReport): SupervisionReport {
  const snaps = (report.pdf_snapshots || []).map(slimSnapshot);
  return {
    ...trimSupervisionTextFields(report),
    pdf_snapshots: snaps,
    latest_pdf: report.latest_pdf ? slimSnapshot(report.latest_pdf) : report.latest_pdf,
  };
}

/** Persist stage 5 without touching the fat engineering JSONB column. */
export async function saveStage5LiveBundle(params: {
  clientId: string;
  fieldVisits: FieldVisitReport[];
  supervision: SupervisionReport;
  pdfArchive?: ReportPdfSnapshot[];
  pipelineStage?: string | null;
}): Promise<{ error: string | null; usedRpc: boolean }> {
  const supervision = slimSupervision(params.supervision);
  const visits = (params.fieldVisits || []).map(slimVisit);
  const archive = (params.pdfArchive || []).map(slimSnapshot);

  const { error: rpcError } = await supabase.rpc('save_stage5_live_bundle', {
    p_client_id: params.clientId,
    p_field_visits: visits,
    p_supervision: supervision,
    p_pdf_archive: archive,
    p_pipeline_stage: params.pipelineStage ?? null,
  });

  if (!rpcError) return { error: null, usedRpc: true };

  if (!isMissing(rpcError.message)) {
    return { error: rpcError.message, usedRpc: true };
  }

  // Fallback without RPC: direct table writes (still never touches project_engineering_data)
  const tableErr = await saveStage5ViaTables({
    clientId: params.clientId,
    fieldVisits: visits,
    supervision,
    pdfArchive: archive,
    pipelineStage: params.pipelineStage,
  });
  return { error: tableErr, usedRpc: false };
}

async function saveStage5ViaTables(params: {
  clientId: string;
  fieldVisits: FieldVisitReport[];
  supervision: SupervisionReport;
  pdfArchive: ReportPdfSnapshot[];
  pipelineStage?: string | null;
}): Promise<string | null> {
  if (params.pipelineStage) {
    const { error } = await supabase
      .from('clients')
      .update({ pipeline_stage: params.pipelineStage })
      .eq('id', params.clientId);
    if (error && !/pipeline_stage/i.test(error.message)) {
      // ignore missing pipeline_stage; continue
    }
  }

  // Visits
  const { error: delVisits } = await supabase
    .from('field_visit_reports')
    .delete()
    .eq('client_id', params.clientId);
  if (delVisits && isMissing(delVisits.message)) {
    return (
      'جداول حفظ المرحلة 5 غير موجودة في Supabase. ' +
      'نفّذ السكربت scripts/sql/038_stage5_live_store.sql مرة واحدة ثم أعد الحفظ. ' +
      'هذا الحفظ لا يلمس العمود الثقيل project_engineering_data.'
    );
  }
  if (delVisits) return delVisits.message;

  if (params.fieldVisits.length) {
    const rows = params.fieldVisits.map((v) => ({
      client_id: params.clientId,
      visit_number: v.visit_number,
      payload: v,
      updated_at: new Date().toISOString(),
    }));
    const { error } = await supabase.from('field_visit_reports').upsert(rows, {
      onConflict: 'client_id,visit_number',
    });
    if (error) return error.message;
  }

  // Supervision header + live payload
  const header = {
    client_id: params.clientId,
    status: params.supervision.status || 'مسودة',
    report_date: params.supervision.report_date || null,
    contractor_name: params.supervision.contractor_name || null,
    branch_manager_name: params.supervision.branch_manager_name || null,
    supervising_office: params.supervision.supervising_office || null,
    safety_engineer_name: params.supervision.safety_engineer_name || null,
    inspection_form_number: params.supervision.inspection_form_number || null,
    study_number: params.supervision.study_number || null,
    total_duration: params.supervision.total_duration || null,
    start_date: params.supervision.start_date || null,
    overall_progress_percent: params.supervision.overall_progress_percent ?? null,
    overall_progress_manual: Boolean(params.supervision.overall_progress_manual),
    notes: params.supervision.notes || null,
    months: params.supervision.months || [],
    header: {
      owner_name: params.supervision.owner_name || null,
      project_name: params.supervision.project_name || null,
      building_type: params.supervision.building_type || null,
      area_m2: params.supervision.area_m2 || null,
    },
    live_payload: params.supervision,
    pdf_snapshots: params.supervision.pdf_snapshots || [],
    updated_at: new Date().toISOString(),
  };

  const { data: upserted, error: supErr } = await supabase
    .from('project_supervision_reports')
    .upsert(header, { onConflict: 'client_id' })
    .select('id')
    .maybeSingle();
  if (supErr) {
    if (isMissing(supErr.message)) {
      return (
        'جدول project_supervision_reports غير موجود. نفّذ scripts/sql/038_stage5_live_store.sql'
      );
    }
    return supErr.message;
  }

  const reportId = upserted?.id as string | undefined;
  if (reportId) {
    await supabase.from('report_items').delete().eq('report_id', reportId);
    const tasks = params.supervision.tasks || [];
    if (tasks.length) {
      const itemRows = tasks.map((task, index) => ({
        id: task.id,
        report_id: reportId,
        client_id: params.clientId,
        sort_order: index,
        category_id: task.category_id || null,
        category_label: task.category_label || null,
        description: task.description || null,
        work_type: task.work_type || null,
        total_percent: task.total_percent ?? null,
        month_progress: task.month_progress || {},
        updated_at: new Date().toISOString(),
      }));
      const { error: itemsErr } = await supabase.from('report_items').upsert(itemRows, {
        onConflict: 'report_id,id',
      });
      if (itemsErr && !isMissing(itemsErr.message)) return itemsErr.message;
    }
  }

  // PDF archive rows (best-effort)
  for (const snap of params.pdfArchive) {
    await supabase.from('report_pdf_snapshots').insert({
      client_id: params.clientId,
      kind: snap.kind,
      visit_number: snap.visit_number ?? null,
      report_date: snap.report_date || null,
      title_ar: snap.title_ar,
      file_name: snap.fileName,
      size_bytes: snap.sizeBytes,
      mime_type: snap.mimeType,
      storage_bucket: snap.storageBucket || 'project-files',
      storage_path: snap.storagePath || null,
      created_at: snap.created_at,
    });
  }

  return null;
}

/** Load stage-5 live data from dedicated tables (not from fat JSONB). */
export async function loadStage5LiveBundle(clientId: string): Promise<Stage5Bundle | null> {
  const { data: visitRows, error: visitErr } = await supabase
    .from('field_visit_reports')
    .select('visit_number, payload')
    .eq('client_id', clientId)
    .order('visit_number', { ascending: true });

  if (visitErr && isMissing(visitErr.message)) return null;
  if (visitErr) return null;

  const { data: supRow, error: supErr } = await supabase
    .from('project_supervision_reports')
    .select('live_payload, pdf_snapshots, months')
    .eq('client_id', clientId)
    .maybeSingle();

  if (supErr && isMissing(supErr.message)) {
    // visits table may exist alone
  }

  const { data: archiveRows } = await supabase
    .from('report_pdf_snapshots')
    .select('*')
    .eq('client_id', clientId)
    .order('created_at', { ascending: true });

  const field_visits = (visitRows || [])
    .map((r) => (r.payload && typeof r.payload === 'object' ? (r.payload as FieldVisitReport) : null))
    .filter(Boolean) as FieldVisitReport[];

  let supervision_report: SupervisionReport = { ...EMPTY_SUPERVISION_REPORT, months: [], tasks: [] };
  const live = supRow?.live_payload;
  if (live && typeof live === 'object') {
    supervision_report = {
      ...EMPTY_SUPERVISION_REPORT,
      ...(live as SupervisionReport),
      pdf_snapshots: Array.isArray((live as SupervisionReport).pdf_snapshots)
        ? (live as SupervisionReport).pdf_snapshots
        : Array.isArray(supRow?.pdf_snapshots)
          ? (supRow!.pdf_snapshots as ReportPdfSnapshot[])
          : [],
    };
  }

  const report_pdf_archive: ReportPdfSnapshot[] = (archiveRows || []).map((r) => ({
    id: String(r.id),
    kind: (r.kind as ReportPdfSnapshot['kind']) || 'supervision',
    visit_number: r.visit_number ?? null,
    report_date: r.report_date || null,
    title_ar: r.title_ar || 'مرفق PDF',
    fileName: r.file_name || 'report.pdf',
    sizeBytes: Number(r.size_bytes || 0),
    mimeType: 'application/pdf',
    storageBucket: r.storage_bucket || 'project-files',
    storagePath: r.storage_path || null,
    dataUrl: null,
    created_at: r.created_at || new Date().toISOString(),
  }));

  if (!field_visits.length && !supervision_report.tasks?.length && !report_pdf_archive.length) {
    return null;
  }

  return { field_visits, supervision_report, report_pdf_archive };
}

/** Overlay stage-5 live bundle onto in-memory engineering data. */
export function hydrateEngineeringWithStage5(
  data: ProjectEngineeringData,
  bundle: Stage5Bundle | null
): ProjectEngineeringData {
  if (!bundle) return data;
  return {
    ...data,
    field_visits: bundle.field_visits.length ? bundle.field_visits : data.field_visits,
    supervision_report: bundle.supervision_report?.tasks?.length
      ? bundle.supervision_report
      : {
          ...data.supervision_report,
          ...bundle.supervision_report,
          tasks: bundle.supervision_report.tasks?.length
            ? bundle.supervision_report.tasks
            : data.supervision_report.tasks,
          months: bundle.supervision_report.months?.length
            ? bundle.supervision_report.months
            : data.supervision_report.months,
        },
    report_pdf_archive: bundle.report_pdf_archive.length
      ? bundle.report_pdf_archive
      : data.report_pdf_archive || [],
  };
}

/** Local backup of stage-5 only (small). */
export function backupStage5Locally(clientId: string, data: ProjectEngineeringData) {
  backupEngineeringDataLocally(clientId, {
    ...data,
    // keep backup useful but do not require fat rewrite on server
  });
}
