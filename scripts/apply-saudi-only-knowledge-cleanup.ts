/**
 * APPROVED Production cleanup: Saudi-only Design Intelligence knowledge.
 *
 * Owner-approved actions only:
 * 1) Delete NFPA 13-2025 document deb74a38-b94c-443a-831d-c8765a872809
 *    (chunks → indexing jobs → document row → Storage API)
 * 2) Repair Saudi Fire Code document ab0ed7b4-f2c8-442c-8278-a9906c9c6f57
 *    (parent metadata + all child chunks)
 *
 * Does NOT reingest. Does NOT alter RLS. Does NOT touch Saudi Storage object.
 * Does NOT change canonical compliance logic.
 * Storage deletion uses Supabase Storage API only (never SQL on storage.objects).
 *
 * Required env:
 *   NEXT_PUBLIC_SUPABASE_URL=https://ezmdkwgziyencejfevso.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY=<service_role>
 *
 * Usage:
 *   npm run cleanup:saudi-only-knowledge
 *   npx tsx scripts/apply-saudi-only-knowledge-cleanup.ts
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const COMPANY_ID = '3580b47a-a57b-4b3c-8f0d-db72870c8a85';
const NFPA_DOC_ID = 'deb74a38-b94c-443a-831d-c8765a872809';
const SAUDI_DOC_ID = 'ab0ed7b4-f2c8-442c-8278-a9906c9c6f57';
const BUCKET = 'design-knowledge';
const NFPA_STORAGE_PATH = '3580b47a-a57b-4b3c-8f0d-db72870c8a85/code-knowledge/NFPA-13/2025/deb74a38-b94c-443a-831d-c8765a872809/NFPA-13-2025.pdf';
const EXPECTED_NFPA_CHUNKS = 2768;
const EXPECTED_SAUDI_CHUNKS = 1246;
const SAUDI_SOURCE_DOCUMENT_ID = 'storage:SBC-801/2018/ab0ed7b4-f2c8-442c-8278-a9906c9c6f57';
const EXPECTED_PROJECT_REF = 'ezmdkwgziyencejfevso';
const OUT = 'artifacts/saudi-only-knowledge-cleanup-result.json';

function requireEnv(name: string): string {
  const v = (process.env[name] || '').trim();
  if (!v) throw new Error(`Missing required env: ${name}`);
  return v;
}

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
      if (String(row.source_document_id || '') !== SAUDI_SOURCE_DOCUMENT_ID) {
        source_mismatch += 1;
      }
    }
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return { code_mismatch, edition_mismatch, source_mismatch };
}

async function storageExists(sb: SupabaseClient, path: string): Promise<boolean> {
  const folder = path.slice(0, path.lastIndexOf('/'));
  const name = path.slice(path.lastIndexOf('/') + 1);
  const { data, error } = await sb.storage.from(BUCKET).list(folder, {
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

async function main(): Promise<void> {
  const url = requireEnv('NEXT_PUBLIC_SUPABASE_URL');
  const key = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  if (!url.includes(EXPECTED_PROJECT_REF)) {
    console.warn(
      `WARNING: URL does not contain expected Production ref ${EXPECTED_PROJECT_REF} — got ${url}`
    );
  }

  const sb = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // ─── Preflight ───────────────────────────────────────────────────────────
  const { data: nfpaDoc, error: nfpaErr } = await sb
    .from('di_knowledge_documents')
    .select(
      'id, title, file_name, code, edition, category, company_id, storage_bucket, storage_path, chunk_count, page_count, deleted_at'
    )
    .eq('id', NFPA_DOC_ID)
    .maybeSingle();
  if (nfpaErr) throw new Error(`NFPA preflight failed: ${nfpaErr.message}`);

  const { data: saudiDocBefore, error: saudiErr } = await sb
    .from('di_knowledge_documents')
    .select(
      'id, title, file_name, code, edition, category, applicable_codes, source_document_id, company_id, storage_bucket, storage_path, chunk_count, page_count, index_status, ingestion_status, verification_status, platform_verification_status, deleted_at'
    )
    .eq('id', SAUDI_DOC_ID)
    .maybeSingle();
  if (saudiErr) throw new Error(`Saudi preflight failed: ${saudiErr.message}`);
  if (!saudiDocBefore || saudiDocBefore.deleted_at) {
    throw new Error('REFUSING: Saudi document missing or soft-deleted — aborting');
  }
  if (String(saudiDocBefore.company_id) !== COMPANY_ID) {
    throw new Error(
      `REFUSING: Saudi company_id mismatch (${saudiDocBefore.company_id} !== ${COMPANY_ID})`
    );
  }

  const nfpaChunksBefore = nfpaDoc ? await countChunks(sb, NFPA_DOC_ID) : 0;
  const saudiChunksBefore = await countChunks(sb, SAUDI_DOC_ID);
  const nfpaStorageBefore = await storageExists(sb, NFPA_STORAGE_PATH);

  if (saudiChunksBefore !== EXPECTED_SAUDI_CHUNKS) {
    console.warn(
      `WARNING: Saudi chunk count before repair is ${saudiChunksBefore}, expected ${EXPECTED_SAUDI_CHUNKS}`
    );
  }
  if (nfpaDoc && nfpaChunksBefore !== EXPECTED_NFPA_CHUNKS) {
    console.warn(
      `WARNING: NFPA chunk count before delete is ${nfpaChunksBefore}, expected ${EXPECTED_NFPA_CHUNKS}`
    );
  }

  // ─── 1) Delete NFPA document completely ──────────────────────────────────
  let nfpaChunksDeleted = 0;
  let nfpaJobsDeleted = 0;
  let nfpaDocumentDeleted = false;
  let nfpaStorageDeleted = false;

  if (nfpaDoc) {
    if (String(nfpaDoc.company_id) !== COMPANY_ID) {
      throw new Error(
        `REFUSING: NFPA company_id mismatch (${nfpaDoc.company_id} !== ${COMPANY_ID})`
      );
    }

    nfpaChunksDeleted = await deleteChunksInBatches(sb, NFPA_DOC_ID);

    const { count: jobsBefore } = await sb
      .from('di_indexing_jobs')
      .select('id', { count: 'exact', head: true })
      .eq('document_id', NFPA_DOC_ID);
    const { error: jobDelErr } = await sb
      .from('di_indexing_jobs')
      .delete()
      .eq('document_id', NFPA_DOC_ID);
    if (jobDelErr) throw new Error(`indexing job delete failed: ${jobDelErr.message}`);
    nfpaJobsDeleted = jobsBefore || 0;

    await sb
      .from('di_code_editions')
      .update({ knowledge_document_id: null })
      .eq('knowledge_document_id', NFPA_DOC_ID);
    await sb
      .from('di_project_code_adoptions')
      .update({ knowledge_document_id: null })
      .eq('knowledge_document_id', NFPA_DOC_ID);

    const { error: docDelErr } = await sb
      .from('di_knowledge_documents')
      .delete()
      .eq('id', NFPA_DOC_ID)
      .eq('company_id', COMPANY_ID);
    if (docDelErr) throw new Error(`NFPA document delete failed: ${docDelErr.message}`);
    nfpaDocumentDeleted = true;
  }

  // Storage API delete (never SQL on storage.objects).
  const { error: storageErr } = await sb.storage.from(BUCKET).remove([NFPA_STORAGE_PATH]);
  if (storageErr && !/not found|404|No such file/i.test(storageErr.message)) {
    throw new Error(`Storage API delete failed: ${storageErr.message}`);
  }
  nfpaStorageDeleted = !(await storageExists(sb, NFPA_STORAGE_PATH));

  // ─── 2) Repair Saudi parent metadata (preserve content/status fields) ────
  const { data: saudiUpdated, error: saudiUpdErr } = await sb
    .from('di_knowledge_documents')
    .update({
      code: 'SBC-801',
      edition: '2018',
      category: 'SBC',
      applicable_codes: ['SBC-801'],
      source_document_id: SAUDI_SOURCE_DOCUMENT_ID,
      updated_at: new Date().toISOString(),
    })
    .eq('id', SAUDI_DOC_ID)
    .eq('company_id', COMPANY_ID)
    .select(
      'id, title, file_name, code, edition, category, applicable_codes, source_document_id, storage_path, page_count, chunk_count, index_status, ingestion_status, verification_status, platform_verification_status, deleted_at'
    )
    .single();
  if (saudiUpdErr) throw new Error(`Saudi metadata update failed: ${saudiUpdErr.message}`);

  // ─── 3) Repair all Saudi child chunks ────────────────────────────────────
  const { error: chunkUpdErr } = await sb
    .from('di_knowledge_chunks')
    .update({
      code: 'SBC-801',
      edition: '2018',
      source_document_id: SAUDI_SOURCE_DOCUMENT_ID,
    })
    .eq('document_id', SAUDI_DOC_ID);
  if (chunkUpdErr) throw new Error(`Saudi chunk update failed: ${chunkUpdErr.message}`);

  // ─── 4) Verify ───────────────────────────────────────────────────────────
  const { count: activeNfpaDocs } = await sb
    .from('di_knowledge_documents')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', COMPANY_ID)
    .is('deleted_at', null)
    .or('code.ilike.%NFPA%,title.ilike.%NFPA%,file_name.ilike.%NFPA%');

  const nfpaChunksAfter = await countChunks(sb, NFPA_DOC_ID);
  const nfpaStorageAfter = await storageExists(sb, NFPA_STORAGE_PATH);

  const { data: saudiAfter, error: saudiAfterErr } = await sb
    .from('di_knowledge_documents')
    .select(
      'id, title, file_name, code, edition, category, applicable_codes, source_document_id, storage_path, page_count, chunk_count, index_status, ingestion_status, verification_status, deleted_at'
    )
    .eq('id', SAUDI_DOC_ID)
    .maybeSingle();
  if (saudiAfterErr) throw new Error(`Saudi verify failed: ${saudiAfterErr.message}`);

  const saudiChunksAfter = await countChunks(sb, SAUDI_DOC_ID);
  const mismatches = await countChunkMismatches(sb, SAUDI_DOC_ID);

  const { data: activeDocs, error: activeDocsErr } = await sb
    .from('di_knowledge_documents')
    .select('id, title, code, edition, file_name, chunk_count, index_status')
    .eq('company_id', COMPANY_ID)
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

  const result = {
    STATUS:
      nfpaChunksAfter === 0 &&
      !nfpaStorageAfter &&
      saudiAfter &&
      saudiAfter.code === 'SBC-801' &&
      saudiAfter.edition === '2018' &&
      saudiChunksAfter === EXPECTED_SAUDI_CHUNKS &&
      mismatches.code_mismatch === 0 &&
      mismatches.edition_mismatch === 0 &&
      nonSaudiRemaining.length === 0
        ? 'SUCCESS'
        : 'PARTIAL_OR_FAILED',
    NFPA_DOCUMENT_DELETED: nfpaDocumentDeleted || !nfpaDoc,
    NFPA_CHUNKS_DELETED: nfpaChunksDeleted || nfpaChunksBefore,
    NFPA_STORAGE_DELETED: nfpaStorageDeleted,
    SAUDI_DOCUMENT_PRESERVED: Boolean(saudiAfter && !saudiAfter.deleted_at),
    SAUDI_METADATA_CORRECTED:
      saudiAfter?.code === 'SBC-801' &&
      saudiAfter?.edition === '2018' &&
      saudiAfter?.category === 'SBC' &&
      String(saudiAfter?.source_document_id) === SAUDI_SOURCE_DOCUMENT_ID,
    SAUDI_CHUNKS_CORRECTED:
      mismatches.code_mismatch === 0 &&
      mismatches.edition_mismatch === 0 &&
      mismatches.source_mismatch === 0,
    ACTIVE_NON_SAUDI_DOCUMENTS_REMAINING: nonSaudiRemaining.length,
    FINAL_ACTIVE_DOCUMENT_COUNT: (activeDocs || []).length,
    FINAL_ACTIVE_CHUNK_COUNT: finalChunkCount,
    verification: {
      active_nfpa13_document_count: activeNfpaDocs || 0,
      chunks_for_deleted_nfpa: nfpaChunksAfter,
      nfpa_storage_exists: nfpaStorageAfter,
      saudi_exists: Boolean(saudiAfter),
      saudi_code: saudiAfter?.code ?? null,
      saudi_edition: saudiAfter?.edition ?? null,
      saudi_chunk_count: saudiChunksAfter,
      saudi_chunk_mismatches: mismatches,
      saudi_title: saudiAfter?.title ?? null,
      saudi_file_name: saudiAfter?.file_name ?? null,
      saudi_storage_path: saudiAfter?.storage_path ?? null,
      active_documents: activeDocs,
      non_saudi_remaining: nonSaudiRemaining,
      nfpa_preflight: nfpaDoc,
      saudi_before: {
        code: saudiDocBefore.code,
        edition: saudiDocBefore.edition,
        category: saudiDocBefore.category,
        applicable_codes: saudiDocBefore.applicable_codes,
        source_document_id: saudiDocBefore.source_document_id,
        index_status: saudiDocBefore.index_status,
        ingestion_status: saudiDocBefore.ingestion_status,
      },
      saudi_updated: saudiUpdated,
      nfpa_jobs_deleted: nfpaJobsDeleted,
      nfpa_storage_before: nfpaStorageBefore,
      saudi_chunks_before: saudiChunksBefore,
    },
  };

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(result, null, 2), 'utf8');
  console.log(JSON.stringify(result, null, 2));

  if (result.STATUS !== 'SUCCESS') {
    process.exitCode = 2;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
