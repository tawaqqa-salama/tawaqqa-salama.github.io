/**
 * Save visit / supervision reports as fixed PDF attachments (append-only history).
 * Stage-5 persistence goes through dedicated tables (038) — never rewrites
 * clients.project_engineering_data.
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
import {
  buildFieldVisitReportHtml,
  resolveVisitEvidenceSources,
} from '@/components/projects/FieldVisitReportPrint';
import {
  buildSupervisionReportHtml,
  resolveSupervisionEvidenceSources,
} from '@/components/projects/SupervisionReportPrint';
import { trimSupervisionTextFields } from '@/lib/projects/supervision-report';
import { sanitizeEngineeringDataForPersist } from '@/lib/projects/sanitize-engineering-files';
import { persistFieldVisitEvidenceMetadata } from '@/lib/projects/field-visit-evidence-persistence';
import { persistStage5Metadata } from '@/lib/projects/stage5-persistence';

function isMissingRelation(message: string): boolean {
  return /relation|does not exist|Could not find the table|schema cache|function|Could not find/i.test(
    message
  );
}

function uid() {
  return `pdf-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

/** Lean merge of selected keys into clients.project_engineering_data (non–stage-5 use). */
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

  if (patch.supervision_report) {
    const { error: mergeError } = await supabase.rpc('merge_supervision_report_json', {
      p_client_id: clientId,
      p_supervision: patch.supervision_report,
      p_pipeline_stage: pipelineStage ?? null,
    });
    if (!mergeError) {
      if (patch.field_visits || patch.report_pdf_archive) {
        await supabase.rpc('merge_project_engineering_patch', {
          p_client_id: clientId,
          p_patch: {
            ...(patch.field_visits ? { field_visits: patch.field_visits } : {}),
            ...(patch.report_pdf_archive
              ? { report_pdf_archive: patch.report_pdf_archive }
              : {}),
          },
          p_pipeline_stage: pipelineStage ?? null,
        });
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
      'لحفظ الزيارات/الإشراف نفّذ scripts/sql/038_stage5_live_store.sql ثم أعد المحاولة.'
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
  data.field_visits[idx] = visit;
  backupEngineeringDataLocally(
    client.id,
    sanitizeEngineeringDataForPersist(data, { aggressive: true })
  );

  let snapshot: ReportPdfSnapshot | null = null;
  let warning: string | null = null;
  try {
    const evidenceSources = await resolveVisitEvidenceSources(client.id, visit);
    const html = buildFieldVisitReportHtml({
      client,
      visit,
      company,
      totalVisits: data.field_visits.length,
      evidenceSources,
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

    visit.pdf_snapshots = appendArchive(visit.pdf_snapshots, snapshot);
    visit.latest_pdf = snapshot;
    data.field_visits[idx] = visit;
    data.report_pdf_archive = appendArchive(data.report_pdf_archive, snapshot);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    warning = `بيانات الزيارة ستُحفظ لكن تعذر إنشاء PDF: ${msg}`;
  }

  const persisted = await persistFieldVisitEvidenceMetadata({
    clientId: client.id,
    data,
    visitNumber,
    nextVisit: data.field_visits[idx],
    pipelineStage,
  });
  data = persisted.data;
  if (persisted.error) {
    return {
      error: persisted.error,
      data,
      snapshot,
      warning: warning || 'تم حفظ نسخة محلية — تعذر اكتمال المزامنة الكانونية والمرآة للزيارة',
    };
  }

  backupEngineeringDataLocally(client.id, data);
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

  let snapshot: ReportPdfSnapshot | null = null;
  let warning: string | null = null;
  try {
    const evidenceSources = await resolveSupervisionEvidenceSources(client.id, data.field_visits || []);
    const html = buildSupervisionReportHtml({
      client,
      report: supervision,
      company: company || DEFAULT_COMPANY_PROFILE,
      fieldVisits: data.field_visits || [],
      technicalNotes: data.technical_notes,
      evidenceSources,
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
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    warning = `بيانات الإشراف ستُحفظ لكن تعذر إنشاء PDF: ${msg}`;
  }

  const persisted = await persistStage5Metadata({
    clientId: client.id,
    data,
    pipelineStage,
  });
  data = persisted.data;
  if (persisted.error) {
    return {
      error: persisted.error,
      data,
      snapshot,
      warning: warning || 'تم حفظ نسخة محلية — تعذر اكتمال المزامنة الكانونية والمرآة للإشراف',
      usedRelationalTables: true,
    };
  }
  backupEngineeringDataLocally(client.id, data);
  return {
    error: null,
    data,
    snapshot,
    warning,
    usedRelationalTables: true,
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
