/**
 * One-time Saudi-only knowledge cleanup constants + server executor.
 *
 * Document IDs are server-controlled — never accept client overrides.
 * Service-role client is used only after Platform Admin JWT gate (server-side).
 * Does not reingest, alter RLS, or delete the Saudi Storage object.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export const SAUDI_ONLY_CLEANUP_COMPANY_ID = '3580b47a-a57b-4b3c-8f0d-db72870c8a85';
export const SAUDI_ONLY_CLEANUP_NFPA_DOC_ID = 'deb74a38-b94c-443a-831d-c8765a872809';
export const SAUDI_ONLY_CLEANUP_SAUDI_DOC_ID = 'ab0ed7b4-f2c8-442c-8278-a9906c9c6f57';
export const SAUDI_ONLY_CLEANUP_BUCKET = 'design-knowledge';
export const SAUDI_ONLY_CLEANUP_NFPA_STORAGE_PATH =
  '3580b47a-a57b-4b3c-8f0d-db72870c8a85/code-knowledge/NFPA-13/2025/deb74a38-b94c-443a-831d-c8765a872809/NFPA-13-2025.pdf';
export const SAUDI_ONLY_CLEANUP_EXPECTED_NFPA_CHUNKS = 2768;
export const SAUDI_ONLY_CLEANUP_EXPECTED_SAUDI_CHUNKS = 1246;
export const SAUDI_ONLY_CLEANUP_SAUDI_SOURCE_DOCUMENT_ID =
  'storage:SBC-801/2018/ab0ed7b4-f2c8-442c-8278-a9906c9c6f57';
export const SAUDI_ONLY_CLEANUP_CONFIRM_PHRASE =
  'حذف المراجع غير السعودية والإبقاء على الكود السعودي فقط';

export type SaudiOnlyCleanupVerification = {
  active_nfpa_document_count: number;
  nfpa_chunk_count: number;
  nfpa_storage_exists: boolean;
  saudi_exists: boolean;
  saudi_code: string | null;
  saudi_edition: string | null;
  saudi_category: string | null;
  saudi_chunk_count: number;
  saudi_chunk_code_mismatch: number;
  saudi_chunk_edition_mismatch: number;
  saudi_chunk_source_mismatch: number;
  active_non_saudi_document_count: number;
  final_active_document_count: number;
  final_active_chunk_count: number;
};

export type SaudiOnlyCleanupResult = {
  ok: boolean;
  alreadyCompleted: boolean;
  nfpaDocumentDeleted: boolean;
  nfpaChunksDeleted: number;
  nfpaJobsDeleted: number;
  nfpaStorageDeleted: boolean;
  saudiDocumentPreserved: boolean;
  saudiMetadataCorrected: boolean;
  saudiChunksCorrected: boolean;
  storageError: string | null;
  verification: SaudiOnlyCleanupVerification;
  messageAr: string;
};

async function countChunks(sb: SupabaseClient, documentId: string): Promise<number> {
  const { count, error } = await sb
    .from('di_knowledge_chunks')
    .select('id', { count: 'exact', head: true })
    .eq('document_id', documentId);
  if (error) throw new Error(`count chunks failed (${documentId}): ${error.message}`);
  return count || 0;
}

async function countChunkMismatches(
  sb: SupabaseClient,
  documentId: string
): Promise<{ code_mismatch: number; edition_mismatch: number; source_mismatch: number }> {
  const pageSize = 1000;
  let from = 0;
  let code_mismatch = 0;
  let edition_mismatch = 0;
  let source_mismatch = 0;
  while (true) {
    const { data, error } = await sb
      .from('di_knowledge_chunks')
      .select('id, code, edition, source_document_id')
      .eq('document_id', documentId)
      .range(from, from + pageSize - 1);
    if (error) throw new Error(`chunk scan failed: ${error.message}`);
    if (!data?.length) break;
    for (const row of data) {
      if (String(row.code || '') !== 'SBC-801') code_mismatch += 1;
      if (String(row.edition || '') !== '2018') edition_mismatch += 1;
      if (String(row.source_document_id || '') !== SAUDI_ONLY_CLEANUP_SAUDI_SOURCE_DOCUMENT_ID) {
        source_mismatch += 1;
      }
    }
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return { code_mismatch, edition_mismatch, source_mismatch };
}

export async function storageObjectExists(
  sb: SupabaseClient,
  path: string,
  bucket = SAUDI_ONLY_CLEANUP_BUCKET
): Promise<boolean> {
  const folder = path.slice(0, path.lastIndexOf('/'));
  const name = path.slice(path.lastIndexOf('/') + 1);
  const { data, error } = await sb.storage.from(bucket).list(folder, {
    limit: 100,
    search: name,
  });
  if (error) {
    if (/not found|404/i.test(error.message)) return false;
    throw new Error(`storage list failed: ${error.message}`);
  }
  return Boolean(data?.some((f) => f.name === name));
}

async function deleteChunksInBatches(
  sb: SupabaseClient,
  documentId: string
): Promise<number> {
  let deleted = 0;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const before = await countChunks(sb, documentId);
    if (before === 0) return deleted;
    const { error } = await sb
      .from('di_knowledge_chunks')
      .delete()
      .eq('document_id', documentId);
    if (error) throw new Error(`chunk delete failed: ${error.message}`);
    const after = await countChunks(sb, documentId);
    deleted += Math.max(0, before - after);
    if (after === 0) return deleted;
  }
  throw new Error('chunk delete did not converge to zero');
}

function isSaudiMetadataCorrect(doc: {
  code?: string | null;
  edition?: string | null;
  category?: string | null;
  applicable_codes?: string[] | null;
  source_document_id?: string | null;
}): boolean {
  const codes = Array.isArray(doc.applicable_codes) ? doc.applicable_codes : [];
  return (
    doc.code === 'SBC-801' &&
    doc.edition === '2018' &&
    doc.category === 'SBC' &&
    codes.length === 1 &&
    codes[0] === 'SBC-801' &&
    String(doc.source_document_id || '') === SAUDI_ONLY_CLEANUP_SAUDI_SOURCE_DOCUMENT_ID
  );
}

export async function verifySaudiOnlyCleanupState(
  sb: SupabaseClient
): Promise<SaudiOnlyCleanupVerification> {
  const { count: activeNfpaDocs } = await sb
    .from('di_knowledge_documents')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', SAUDI_ONLY_CLEANUP_COMPANY_ID)
    .is('deleted_at', null)
    .or('code.ilike.%NFPA%,title.ilike.%NFPA%,file_name.ilike.%NFPA%');

  const nfpaChunkCount = await countChunks(sb, SAUDI_ONLY_CLEANUP_NFPA_DOC_ID);
  const nfpaStorageExists = await storageObjectExists(sb, SAUDI_ONLY_CLEANUP_NFPA_STORAGE_PATH);

  const { data: saudiAfter, error: saudiAfterErr } = await sb
    .from('di_knowledge_documents')
    .select(
      'id, title, file_name, code, edition, category, applicable_codes, source_document_id, deleted_at'
    )
    .eq('id', SAUDI_ONLY_CLEANUP_SAUDI_DOC_ID)
    .maybeSingle();
  if (saudiAfterErr) throw new Error(`Saudi verify failed: ${saudiAfterErr.message}`);

  const saudiChunkCount = await countChunks(sb, SAUDI_ONLY_CLEANUP_SAUDI_DOC_ID);
  const mismatches = saudiAfter
    ? await countChunkMismatches(sb, SAUDI_ONLY_CLEANUP_SAUDI_DOC_ID)
    : { code_mismatch: 0, edition_mismatch: 0, source_mismatch: 0 };

  const { data: activeDocs, error: activeDocsErr } = await sb
    .from('di_knowledge_documents')
    .select('id, title, code, edition, file_name')
    .eq('company_id', SAUDI_ONLY_CLEANUP_COMPANY_ID)
    .is('deleted_at', null);
  if (activeDocsErr) throw new Error(`active docs list failed: ${activeDocsErr.message}`);

  const nonSaudiRemaining = (activeDocs || []).filter((d) => {
    const blob = `${d.title || ''} ${d.file_name || ''} ${d.code || ''}`;
    return /\bnfpa\b/i.test(blob) || /\bibc\b/i.test(blob) || /\bifc\b/i.test(blob);
  });

  let finalChunkCount = 0;
  for (const d of activeDocs || []) {
    finalChunkCount += await countChunks(sb, String(d.id));
  }

  return {
    active_nfpa_document_count: activeNfpaDocs || 0,
    nfpa_chunk_count: nfpaChunkCount,
    nfpa_storage_exists: nfpaStorageExists,
    saudi_exists: Boolean(saudiAfter && !saudiAfter.deleted_at),
    saudi_code: saudiAfter?.code ?? null,
    saudi_edition: saudiAfter?.edition ?? null,
    saudi_category: saudiAfter?.category ?? null,
    saudi_chunk_count: saudiChunkCount,
    saudi_chunk_code_mismatch: mismatches.code_mismatch,
    saudi_chunk_edition_mismatch: mismatches.edition_mismatch,
    saudi_chunk_source_mismatch: mismatches.source_mismatch,
    active_non_saudi_document_count: nonSaudiRemaining.length,
    final_active_document_count: (activeDocs || []).length,
    final_active_chunk_count: finalChunkCount,
  };
}

export function isCleanupAlreadyComplete(
  verification: SaudiOnlyCleanupVerification,
  saudiDoc?: {
    code?: string | null;
    edition?: string | null;
    category?: string | null;
    applicable_codes?: string[] | null;
    source_document_id?: string | null;
  } | null
): boolean {
  const saudiOk = saudiDoc ? isSaudiMetadataCorrect(saudiDoc) : verification.saudi_code === 'SBC-801';
  return (
    verification.active_nfpa_document_count === 0 &&
    verification.nfpa_chunk_count === 0 &&
    !verification.nfpa_storage_exists &&
    verification.saudi_exists &&
    verification.saudi_code === 'SBC-801' &&
    verification.saudi_edition === '2018' &&
    verification.saudi_chunk_count === SAUDI_ONLY_CLEANUP_EXPECTED_SAUDI_CHUNKS &&
    verification.saudi_chunk_code_mismatch === 0 &&
    verification.saudi_chunk_edition_mismatch === 0 &&
    verification.saudi_chunk_source_mismatch === 0 &&
    verification.active_non_saudi_document_count === 0 &&
    saudiOk
  );
}

/**
 * Execute the approved one-time cleanup. Idempotent: safe to retry.
 * Uses the provided server Supabase client (must be service-role after auth gate).
 */
export async function executeSaudiOnlyKnowledgeCleanup(
  sb: SupabaseClient
): Promise<SaudiOnlyCleanupResult> {
  const { data: nfpaDoc, error: nfpaErr } = await sb
    .from('di_knowledge_documents')
    .select(
      'id, title, file_name, code, edition, category, company_id, storage_bucket, storage_path, chunk_count, deleted_at'
    )
    .eq('id', SAUDI_ONLY_CLEANUP_NFPA_DOC_ID)
    .maybeSingle();
  if (nfpaErr) throw new Error(`NFPA preflight failed: ${nfpaErr.message}`);

  const { data: saudiDocBefore, error: saudiErr } = await sb
    .from('di_knowledge_documents')
    .select(
      'id, title, file_name, code, edition, category, applicable_codes, source_document_id, company_id, storage_path, chunk_count, deleted_at'
    )
    .eq('id', SAUDI_ONLY_CLEANUP_SAUDI_DOC_ID)
    .maybeSingle();
  if (saudiErr) throw new Error(`Saudi preflight failed: ${saudiErr.message}`);
  if (!saudiDocBefore || saudiDocBefore.deleted_at) {
    throw new Error('REFUSING: Saudi document missing or soft-deleted');
  }
  if (String(saudiDocBefore.company_id) !== SAUDI_ONLY_CLEANUP_COMPANY_ID) {
    throw new Error('REFUSING: Saudi company_id mismatch');
  }

  const preVerify = await verifySaudiOnlyCleanupState(sb);
  if (isCleanupAlreadyComplete(preVerify, saudiDocBefore)) {
    return {
      ok: true,
      alreadyCompleted: true,
      nfpaDocumentDeleted: true,
      nfpaChunksDeleted: 0,
      nfpaJobsDeleted: 0,
      nfpaStorageDeleted: true,
      saudiDocumentPreserved: true,
      saudiMetadataCorrected: true,
      saudiChunksCorrected: true,
      storageError: null,
      verification: preVerify,
      messageAr: 'تم تنظيف قاعدة المعرفة بنجاح',
    };
  }

  let nfpaChunksDeleted = 0;
  let nfpaJobsDeleted = 0;
  let nfpaDocumentDeleted = false;
  let storageError: string | null = null;

  if (nfpaDoc) {
    if (String(nfpaDoc.company_id) !== SAUDI_ONLY_CLEANUP_COMPANY_ID) {
      throw new Error('REFUSING: NFPA company_id mismatch');
    }

    nfpaChunksDeleted = await deleteChunksInBatches(sb, SAUDI_ONLY_CLEANUP_NFPA_DOC_ID);

    const { count: jobsBefore } = await sb
      .from('di_indexing_jobs')
      .select('id', { count: 'exact', head: true })
      .eq('document_id', SAUDI_ONLY_CLEANUP_NFPA_DOC_ID);
    const { error: jobDelErr } = await sb
      .from('di_indexing_jobs')
      .delete()
      .eq('document_id', SAUDI_ONLY_CLEANUP_NFPA_DOC_ID);
    if (jobDelErr) throw new Error(`indexing job delete failed: ${jobDelErr.message}`);
    nfpaJobsDeleted = jobsBefore || 0;

    await sb
      .from('di_code_editions')
      .update({ knowledge_document_id: null })
      .eq('knowledge_document_id', SAUDI_ONLY_CLEANUP_NFPA_DOC_ID);
    await sb
      .from('di_project_code_adoptions')
      .update({ knowledge_document_id: null })
      .eq('knowledge_document_id', SAUDI_ONLY_CLEANUP_NFPA_DOC_ID);

    const { error: docDelErr } = await sb
      .from('di_knowledge_documents')
      .delete()
      .eq('id', SAUDI_ONLY_CLEANUP_NFPA_DOC_ID)
      .eq('company_id', SAUDI_ONLY_CLEANUP_COMPANY_ID);
    if (docDelErr) throw new Error(`NFPA document delete failed: ${docDelErr.message}`);
    nfpaDocumentDeleted = true;
  } else {
    nfpaDocumentDeleted = true;
  }

  const { error: storageErr } = await sb.storage
    .from(SAUDI_ONLY_CLEANUP_BUCKET)
    .remove([SAUDI_ONLY_CLEANUP_NFPA_STORAGE_PATH]);
  if (storageErr && !/not found|404|No such file/i.test(storageErr.message)) {
    storageError = storageErr.message;
  }
  const nfpaStorageDeleted = !(await storageObjectExists(
    sb,
    SAUDI_ONLY_CLEANUP_NFPA_STORAGE_PATH
  ));
  if (!nfpaStorageDeleted && !storageError) {
    storageError = 'NFPA Storage object still present after remove()';
  }

  const { error: saudiUpdErr } = await sb
    .from('di_knowledge_documents')
    .update({
      code: 'SBC-801',
      edition: '2018',
      category: 'SBC',
      applicable_codes: ['SBC-801'],
      source_document_id: SAUDI_ONLY_CLEANUP_SAUDI_SOURCE_DOCUMENT_ID,
      updated_at: new Date().toISOString(),
    })
    .eq('id', SAUDI_ONLY_CLEANUP_SAUDI_DOC_ID)
    .eq('company_id', SAUDI_ONLY_CLEANUP_COMPANY_ID);
  if (saudiUpdErr) throw new Error(`Saudi metadata update failed: ${saudiUpdErr.message}`);

  const { error: chunkUpdErr } = await sb
    .from('di_knowledge_chunks')
    .update({
      code: 'SBC-801',
      edition: '2018',
      source_document_id: SAUDI_ONLY_CLEANUP_SAUDI_SOURCE_DOCUMENT_ID,
    })
    .eq('document_id', SAUDI_ONLY_CLEANUP_SAUDI_DOC_ID);
  if (chunkUpdErr) throw new Error(`Saudi chunk update failed: ${chunkUpdErr.message}`);

  const verification = await verifySaudiOnlyCleanupState(sb);
  const saudiMetadataCorrected =
    verification.saudi_code === 'SBC-801' &&
    verification.saudi_edition === '2018' &&
    verification.saudi_category === 'SBC';
  const saudiChunksCorrected =
    verification.saudi_chunk_code_mismatch === 0 &&
    verification.saudi_chunk_edition_mismatch === 0 &&
    verification.saudi_chunk_source_mismatch === 0;

  const ok =
    verification.active_nfpa_document_count === 0 &&
    verification.nfpa_chunk_count === 0 &&
    nfpaStorageDeleted &&
    verification.saudi_exists &&
    saudiMetadataCorrected &&
    verification.saudi_chunk_count === SAUDI_ONLY_CLEANUP_EXPECTED_SAUDI_CHUNKS &&
    saudiChunksCorrected &&
    verification.active_non_saudi_document_count === 0 &&
    !storageError;

  return {
    ok,
    alreadyCompleted: false,
    nfpaDocumentDeleted,
    nfpaChunksDeleted,
    nfpaJobsDeleted,
    nfpaStorageDeleted,
    saudiDocumentPreserved: verification.saudi_exists,
    saudiMetadataCorrected,
    saudiChunksCorrected,
    storageError,
    verification,
    messageAr: ok
      ? 'تم تنظيف قاعدة المعرفة بنجاح'
      : storageError
        ? `فشل حذف ملف التخزين: ${storageError}`
        : 'فشل التحقق بعد التنظيف',
  };
}

/** Reject any client attempt to override server-controlled IDs. */
export function rejectClientIdOverrides(
  body: Record<string, unknown> | null | undefined
): string | null {
  if (!body || typeof body !== 'object') return null;
  const forbidden = [
    'document_id',
    'documentId',
    'nfpa_document_id',
    'nfpaDocumentId',
    'saudi_document_id',
    'saudiDocumentId',
    'company_id',
    'companyId',
    'storage_path',
    'storagePath',
  ];
  for (const key of forbidden) {
    if (key in body && body[key] != null && String(body[key]).trim() !== '') {
      return `Client may not supply ${key}; cleanup IDs are server-controlled`;
    }
  }
  return null;
}
