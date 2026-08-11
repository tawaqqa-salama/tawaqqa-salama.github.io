/**
 * Save visit / supervision reports as fixed PDF attachments (append-only history).
 * Lean JSONB patch — does not rewrite the entire engineering blob.
 */

import { supabase, isDemoMode } from '@/lib/supabase';
import { DEFAULT_COMPANY_PROFILE, type CompanyProfile } from '@/lib/company-profile';
import type { ClientRecord } from '@/lib/types/client';
import type {
  FieldVisitReport,
  ProjectEngineeringData,
  SupervisionReport,
} from '@/lib/types/project-reports';
import type { ReportPdfKind, ReportPdfSnapshot } from '@/lib/types/report-pdf-snapshot';
import { backupEngineeringDataLocally } from '@/lib/supabase/safe-client-write';
import {
  PROJECT_FILES_BUCKET,
  buildStorageObjectPath,
  formatProjectFilesStorageError,
} from '@/lib/storage/project-files';
import { htmlDocumentToPdfFile } from '@/lib/print/html-to-pdf';
import { buildFieldVisitReportHtml } from '@/components/projects/FieldVisitReportPrint';
import { buildSupervisionReportHtml } from '@/components/projects/SupervisionReportPrint';
import { trimSupervisionTextFields } from '@/lib/projects/supervision-report';
import { upsertProjectReport } from '@/lib/projects/save-supervision-report';
import { sanitizeEngineeringDataForPersist } from '@/lib/projects/sanitize-engineering-files';

function isMissingRelation(message: string): boolean {
  return /relation|does not exist|Could not find the table|schema cache|function|Could not find/i.test(
    message
  );
}

function uid() {
  return `pdf-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

/** Lean merge of selected keys into clients.project_engineering_data */
export async function mergeEngineeringPatch(
  clientId: string,
  patch: Record<string, unknown>,
  pipelineStage?: string | null
): Promise<string | null> {
  const { error: rpcError } = await supabase.rpc('merge_project_engineering_patch', {
    p_client_id: clientId,
    p_patch: patch,
    p_pipeline_stage: pipelineStage ?? null,
  });
  if (!rpcError) return null;

  // Timeout on lean patch → try server-side slim of bloated dataUrls then retry once
  if (/statement timeout|canceling statement|57014/i.test(rpcError.message)) {
    await supabase.rpc('slim_project_engineering_data_urls', { p_client_id: clientId });
    const { error: retryError } = await supabase.rpc('merge_project_engineering_patch', {
      p_client_id: clientId,
      p_patch: patch,
      p_pipeline_stage: pipelineStage ?? null,
    });
    if (!retryError) return null;
    return retryError.message;
  }

  // Supervision-only RPC (script 035) — still lean, no full-blob rewrite from the client
  if (patch.supervision_report) {
    const { error: mergeError } = await supabase.rpc('merge_supervision_report_json', {
      p_client_id: clientId,
      p_supervision: patch.supervision_report,
      p_pipeline_stage: pipelineStage ?? null,
    });
    if (!mergeError) {
      // Best-effort second patch for visits/archive if the multi-key RPC was only missing
      if (patch.field_visits || patch.report_pdf_archive) {
        const { error: patch2 } = await supabase.rpc('merge_project_engineering_patch', {
          p_client_id: clientId,
          p_patch: {
            ...(patch.field_visits ? { field_visits: patch.field_visits } : {}),
            ...(patch.report_pdf_archive
              ? { report_pdf_archive: patch.report_pdf_archive }
              : {}),
          },
          p_pipeline_stage: pipelineStage ?? null,
        });
        if (patch2 && !isMissingRelation(patch2.message)) {
          // supervision saved; visits may be local-only
        }
      }
      return null;
    }
    if (!isMissingRelation(mergeError.message)) {
      return mergeError.message;
    }
  }

  if (isMissingRelation(rpcError.message)) {
    return (
      'دوال الحفظ الخفيف غير موجودة في Supabase. ' +
      'نفّذ السكربتات scripts/sql/035 و 036 و 037 ثم أعد المحاولة. ' +
      '(تم تجنّب إعادة كتابة ملف المشروع كاملاً لأنها تسبب statement timeout)'
    );
  }

  return rpcError.message;
}

async function uploadReportPdfFile(
  clientId: string,
  kind: ReportPdfKind,
  file: File
): Promise<{ storagePath: string | null; dataUrl: string | null; warning?: string }> {
  if (isDemoMode) {
    const dataUrl = await fileToDataUrl(file);
    return { storagePath: null, dataUrl, warning: 'وضع تجريبي — المرفق محلي فقط' };
  }

  const id = uid();
  const folderKind = kind === 'field_visit' ? 'visit-reports' : 'supervision-reports';
  const path = buildStorageObjectPath([clientId, folderKind], id, file.name);
  const { error } = await supabase.storage.from(PROJECT_FILES_BUCKET).upload(path, file, {
    contentType: 'application/pdf',
    upsert: false,
  });
  if (error) {
    const dataUrl = file.size < 900_000 ? await fileToDataUrl(file) : null;
    if (!dataUrl) {
      throw new Error(formatProjectFilesStorageError(file.name, error.message));
    }
    return {
      storagePath: null,
      dataUrl,
      warning: `حُفظت نسخة محلية فقط (فشل الرفع السحابي: ${error.message})`,
    };
  }
  return { storagePath: path, dataUrl: null };
}

async function insertSnapshotRow(clientId: string, snap: ReportPdfSnapshot): Promise<void> {
  const row: Record<string, unknown> = {
    client_id: clientId,
    kind: snap.kind,
    visit_number: snap.visit_number ?? null,
    report_date: snap.report_date || null,
    title_ar: snap.title_ar,
    file_name: snap.fileName,
    size_bytes: snap.sizeBytes,
    mime_type: snap.mimeType,
    storage_bucket: snap.storageBucket || PROJECT_FILES_BUCKET,
    storage_path: snap.storagePath || null,
    created_at: snap.created_at,
  };
  const { error } = await supabase.from('report_pdf_snapshots').insert(row);
  if (error && !isMissingRelation(error.message)) {
    // Non-fatal — JSONB archive still holds the meta
    console.warn('report_pdf_snapshots insert:', error.message);
  }
}

async function fileToDataUrl(file: File): Promise<string | null> {
  if (typeof FileReader === 'undefined') {
    try {
      const buf = await file.arrayBuffer();
      const b64 = Buffer.from(buf).toString('base64');
      return `data:${file.type || 'application/pdf'};base64,${b64}`;
    } catch {
      return null;
    }
  }
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || '') || null);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}

function appendArchive(
  archive: ReportPdfSnapshot[] | undefined,
  snap: ReportPdfSnapshot
): ReportPdfSnapshot[] {
  return [...(archive || []), snap].slice(-80);
}

export type SaveVisitPdfResult = {
  error: string | null;
  data: ProjectEngineeringData;
  snapshot: ReportPdfSnapshot | null;
  warning?: string | null;
};

/** Persist one field visit + generate a fixed PDF attachment for that visit only. */
export async function saveFieldVisitAsPdfAttachment(params: {
  client: ClientRecord;
  data: ProjectEngineeringData;
  visitNumber: number;
  company?: CompanyProfile | null;
  pipelineStage?: string | null;
}): Promise<SaveVisitPdfResult> {
  const { client, visitNumber, company, pipelineStage } = params;
  let data = { ...params.data, field_visits: [...(params.data.field_visits || [])] };
  const idx = data.field_visits.findIndex((v) => v.visit_number === visitNumber);
  if (idx < 0) {
    return { error: 'الزيارة غير موجودة', data, snapshot: null };
  }

  const visit: FieldVisitReport = {
    ...data.field_visits[idx],
    updated_at: new Date().toISOString(),
  };

  // Optimistic local backup of visit text first
  data.field_visits[idx] = visit;
  // Keep local full copy; server patch is lean keys only
  backupEngineeringDataLocally(client.id, sanitizeEngineeringDataForPersist(data, { aggressive: true }));

  const mergeErr = await mergeEngineeringPatch(
    client.id,
    { field_visits: data.field_visits },
    pipelineStage
  );
  if (mergeErr) {
    return {
      error: mergeErr,
      data,
      snapshot: null,
      warning: 'تم حفظ نسخة محلية — تعذر المزامنة السحابية للزيارة',
    };
  }

  let snapshot: ReportPdfSnapshot | null = null;
  let warning: string | null = null;
  try {
    const html = buildFieldVisitReportHtml({
      client,
      visit,
      company,
      totalVisits: data.field_visits.length,
    });
    const fileName = `visit-${visit.visit_number}-${client.client_code || client.id}-${Date.now()}.pdf`;
    const file = await htmlDocumentToPdfFile(html, fileName);
    const uploaded = await uploadReportPdfFile(client.id, 'field_visit', file);
    warning = uploaded.warning || null;

    snapshot = {
      id: uid(),
      kind: 'field_visit',
      visit_number: visit.visit_number,
      report_date: visit.visit_date || null,
      title_ar: `تقرير الزيارة الميدانية #${visit.visit_number}`,
      fileName: file.name,
      sizeBytes: file.size,
      mimeType: 'application/pdf',
      storageBucket: PROJECT_FILES_BUCKET,
      storagePath: uploaded.storagePath,
      dataUrl: uploaded.dataUrl,
      created_at: new Date().toISOString(),
    };

    const snapshots = appendArchive(visit.pdf_snapshots, snapshot);
    visit.pdf_snapshots = snapshots;
    visit.latest_pdf = snapshot;
    data.field_visits[idx] = visit;
    data.report_pdf_archive = appendArchive(data.report_pdf_archive, snapshot);

    await insertSnapshotRow(client.id, snapshot);
    const metaErr = await mergeEngineeringPatch(
      client.id,
      {
        field_visits: data.field_visits,
        report_pdf_archive: data.report_pdf_archive,
      },
      pipelineStage
    );
    if (metaErr) {
      warning = `${warning || ''} · تعذر حفظ بيانات المرفق في السجل: ${metaErr}`.trim();
    }
    backupEngineeringDataLocally(client.id, data);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      error: null,
      data,
      snapshot: null,
      warning: `حُفظت بيانات الزيارة لكن تعذر إنشاء PDF: ${msg}`,
    };
  }

  return { error: null, data, snapshot, warning };
}

export type SaveSupervisionPdfResult = {
  error: string | null;
  data: ProjectEngineeringData;
  snapshot: ReportPdfSnapshot | null;
  warning?: string | null;
  usedRelationalTables?: boolean;
};

/** Persist supervision report + append a fixed PDF snapshot (does not replace older visit PDFs). */
export async function saveSupervisionAsPdfAttachment(params: {
  client: ClientRecord;
  data: ProjectEngineeringData;
  company?: CompanyProfile | null;
  pipelineStage?: string | null;
}): Promise<SaveSupervisionPdfResult> {
  const { client, company, pipelineStage } = params;
  const supervision = trimSupervisionTextFields({
    ...params.data.supervision_report,
    updated_at: new Date().toISOString(),
  });
  let data: ProjectEngineeringData = {
    ...params.data,
    supervision_report: supervision,
  };

  backupEngineeringDataLocally(
    client.id,
    sanitizeEngineeringDataForPersist(data, { aggressive: true })
  );

  const relational = await upsertProjectReport(client.id, supervision);
  if (relational.error) {
    return {
      error: relational.error,
      data,
      snapshot: null,
      usedRelationalTables: !relational.skipped,
    };
  }

  const mergeErr = await mergeEngineeringPatch(
    client.id,
    {
      supervision_report: supervision,
      field_visits: data.field_visits,
    },
    pipelineStage
  );
  if (mergeErr) {
    return {
      error: mergeErr,
      data,
      snapshot: null,
      warning: 'تم حفظ نسخة محلية — تعذر مزامنة تقرير الإشراف',
      usedRelationalTables: !relational.skipped,
    };
  }

  let snapshot: ReportPdfSnapshot | null = null;
  let warning: string | null = null;
  try {
    const html = buildSupervisionReportHtml({
      client,
      report: supervision,
      company: company || DEFAULT_COMPANY_PROFILE,
    });
    const stamp = supervision.report_date || new Date().toISOString().slice(0, 10);
    const fileName = `supervision-${client.client_code || client.id}-${stamp}-${Date.now()}.pdf`;
    const file = await htmlDocumentToPdfFile(html, fileName);
    const uploaded = await uploadReportPdfFile(client.id, 'supervision', file);
    warning = uploaded.warning || null;

    snapshot = {
      id: uid(),
      kind: 'supervision',
      visit_number: null,
      report_date: supervision.report_date || stamp,
      title_ar: `تقرير الإشراف الدوري — ${stamp}`,
      fileName: file.name,
      sizeBytes: file.size,
      mimeType: 'application/pdf',
      storageBucket: PROJECT_FILES_BUCKET,
      storagePath: uploaded.storagePath,
      dataUrl: uploaded.dataUrl,
      created_at: new Date().toISOString(),
    };

    const snaps = appendArchive(supervision.pdf_snapshots, snapshot);
    data = {
      ...data,
      supervision_report: {
        ...supervision,
        pdf_snapshots: snaps,
        latest_pdf: snapshot,
      },
      report_pdf_archive: appendArchive(data.report_pdf_archive, snapshot),
    };

    await insertSnapshotRow(client.id, snapshot);
    const metaErr = await mergeEngineeringPatch(
      client.id,
      {
        supervision_report: data.supervision_report,
        report_pdf_archive: data.report_pdf_archive,
      },
      pipelineStage
    );
    if (metaErr) {
      warning = `${warning || ''} · تعذر حفظ بيانات مرفق الإشراف: ${metaErr}`.trim();
    }
    backupEngineeringDataLocally(client.id, data);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      error: null,
      data,
      snapshot: null,
      warning: `حُفظ تقرير الإشراف لكن تعذر إنشاء PDF: ${msg}`,
      usedRelationalTables: !relational.skipped,
    };
  }

  return {
    error: null,
    data,
    snapshot,
    warning,
    usedRelationalTables: !relational.skipped,
  };
}

/** Open a stored snapshot (signed URL or dataUrl). */
export async function openReportPdfSnapshot(snap: ReportPdfSnapshot): Promise<void> {
  if (snap.dataUrl) {
    window.open(snap.dataUrl, '_blank', 'noopener,noreferrer');
    return;
  }
  if (!snap.storagePath) {
    throw new Error('لا يوجد مسار ملف لهذا المرفق');
  }
  const { data, error } = await supabase.storage
    .from(snap.storageBucket || PROJECT_FILES_BUCKET)
    .createSignedUrl(snap.storagePath, 60 * 30);
  if (error || !data?.signedUrl) {
    const { data: pub } = supabase.storage
      .from(snap.storageBucket || PROJECT_FILES_BUCKET)
      .getPublicUrl(snap.storagePath);
    if (pub?.publicUrl) {
      window.open(pub.publicUrl, '_blank', 'noopener,noreferrer');
      return;
    }
    throw new Error(error?.message || 'تعذر فتح المرفق');
  }
  window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
}
