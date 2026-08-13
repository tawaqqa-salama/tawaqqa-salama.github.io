/**
 * Production ops: re-ingest NFPA 13-2025 from an EXISTING Storage object.
 *
 * Does NOT upload. Uses service role for Storage download + DB upsert.
 *
 * Required env:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Canonical (newest) object:
 *   3580b47a-…/code-knowledge/NFPA-13/2025/4880c356-…/document.pdf
 *
 * Older duplicate is marked for safe cleanup only AFTER successful indexing.
 *
 * Usage:
 *   npx tsx scripts/reingest-nfpa13-canonical-from-storage.ts
 */

import { createHash } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  applyOcrFallbackToPages,
  chunkPagesPreserving,
  extractPdfPagesFromBytes,
} from '../lib/design-intelligence/code-knowledge/pdf-page-extract';
import { detectSourceRefsFromText } from '../lib/design-intelligence/code-knowledge/source-refs';
import { embedText } from '../lib/design-intelligence/embeddings';

const COMPANY_ID = '3580b47a-a57b-4b3c-8f0d-db72870c8a85';
const CANONICAL_DOC_ID = '4880c356-3b81-453f-9ddd-b023544e7cc1';
const OLDER_DUP_DOC_ID = '5f69deb0-a4da-4afb-973a-93a9f14f3324';
const BUCKET = 'design-knowledge';
const CANONICAL_PATH = `${COMPANY_ID}/code-knowledge/NFPA-13/2025/${CANONICAL_DOC_ID}/document.pdf`;
const OLDER_PATH = `${COMPANY_ID}/code-knowledge/NFPA-13/2025/${OLDER_DUP_DOC_ID}/document.pdf`;
const CODE = 'NFPA-13';
const EDITION = '2025';
const EXPECTED_ETAG = 'da3458a03cef983296575aeb8641a404';

function requireEnv(name: string): string {
  const v = (process.env[name] || '').trim();
  if (!v) throw new Error(`Missing required env: ${name}`);
  return v;
}

function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function newUuid(): string {
  return globalThis.crypto.randomUUID();
}

async function downloadObject(
  sb: SupabaseClient,
  path: string
): Promise<{ bytes: Uint8Array; size: number }> {
  const { data, error } = await sb.storage.from(BUCKET).download(path);
  if (error || !data) {
    throw new Error(`storage_download_failed: ${error?.message || 'no data'} path=${path}`);
  }
  const buf = new Uint8Array(await data.arrayBuffer());
  return { bytes: buf, size: buf.byteLength };
}

async function objectExists(sb: SupabaseClient, path: string): Promise<boolean> {
  const folder = path.slice(0, path.lastIndexOf('/'));
  const name = path.slice(path.lastIndexOf('/') + 1);
  const { data, error } = await sb.storage.from(BUCKET).list(folder, {
    limit: 50,
    search: name,
  });
  if (error || !data) return false;
  return data.some((f) => f.name === name);
}

async function upsertDocument(
  sb: SupabaseClient,
  row: Record<string, unknown>
): Promise<void> {
  const { error } = await sb.from('di_knowledge_documents').upsert(row, {
    onConflict: 'id',
  });
  if (error) throw new Error(`di_knowledge_documents upsert failed: ${error.message}`);
}

async function replaceChunks(
  sb: SupabaseClient,
  documentId: string,
  companyId: string,
  chunks: Array<Record<string, unknown>>
): Promise<number> {
  const { error: delErr } = await sb
    .from('di_knowledge_chunks')
    .delete()
    .eq('document_id', documentId);
  if (delErr) throw new Error(`chunks delete failed: ${delErr.message}`);

  const batchSize = 40;
  for (let i = 0; i < chunks.length; i += batchSize) {
    const batch = chunks.slice(i, i + batchSize);
    const { error } = await sb.from('di_knowledge_chunks').insert(batch);
    if (error) throw new Error(`chunks insert failed: ${error.message}`);
  }
  return chunks.length;
}

async function verifyPersisted(
  sb: SupabaseClient,
  documentId: string,
  storagePath: string
): Promise<{
  storage_ok: boolean;
  doc: Record<string, unknown> | null;
  chunk_count: number;
}> {
  const storage_ok = await objectExists(sb, storagePath);
  const { data: doc, error: docErr } = await sb
    .from('di_knowledge_documents')
    .select(
      'id, page_count, pages_extracted, pages_ocr, chunk_count, ingestion_status, index_status, deleted_at, storage_path, sha256'
    )
    .eq('id', documentId)
    .maybeSingle();
  if (docErr) throw new Error(`verify doc failed: ${docErr.message}`);

  const { count, error: cErr } = await sb
    .from('di_knowledge_chunks')
    .select('id', { count: 'exact', head: true })
    .eq('document_id', documentId);
  if (cErr) throw new Error(`verify chunks failed: ${cErr.message}`);

  return {
    storage_ok,
    doc: (doc as Record<string, unknown> | null) || null,
    chunk_count: count || 0,
  };
}

async function markOlderDuplicateForCleanup(
  sb: SupabaseClient,
  olderId: string,
  canonicalId: string,
  sha256: string
): Promise<void> {
  const now = new Date().toISOString();
  const note = `SAFE_CLEANUP_CANDIDATE duplicate_of=${canonicalId} identical_content sha256=${sha256} etag=${EXPECTED_ETAG} marked_at=${now} DO_NOT_DELETE_STORAGE_UNTIL_OPERATOR_APPROVES`;

  // Soft metadata only — keep Storage object; do not deleted_at yet
  const { data: existing } = await sb
    .from('di_knowledge_documents')
    .select('id, notes, status')
    .eq('id', olderId)
    .maybeSingle();

  if (existing?.id) {
    const { error } = await sb
      .from('di_knowledge_documents')
      .update({
        status: 'superseded',
        notes: note,
        updated_at: now,
        // keep deleted_at null — cleanup later
      })
      .eq('id', olderId);
    if (error) throw new Error(`mark duplicate failed: ${error.message}`);
    console.log(
      JSON.stringify({
        older_duplicate_marked: true,
        older_document_id: olderId,
        action: 'status=superseded + SAFE_CLEANUP_CANDIDATE note',
        storage_deleted: false,
      })
    );
    return;
  }

  // No DB row yet — create a stub marker row pointing at older Storage path
  await upsertDocument(sb, {
    id: olderId,
    company_id: COMPANY_ID,
    title: `NFPA 13-2025 (duplicate — cleanup candidate)`,
    category: 'NFPA',
    discipline: 'Fire Protection',
    status: 'superseded',
    file_name: 'document.pdf',
    file_mime: 'application/pdf',
    mime_type: 'application/pdf',
    storage_bucket: BUCKET,
    storage_path: OLDER_PATH,
    source_kind: 'upload',
    index_status: 'failed',
    ingestion_status: 'skipped_duplicate',
    chunk_count: 0,
    code: CODE,
    edition: EDITION,
    sha256,
    content_sha256: sha256,
    notes: note,
    deleted_at: null,
    created_at: now,
    updated_at: now,
  });
  console.log(
    JSON.stringify({
      older_duplicate_marked: true,
      older_document_id: olderId,
      action: 'created superseded stub + SAFE_CLEANUP_CANDIDATE note',
      storage_deleted: false,
    })
  );
}

async function main() {
  const url = requireEnv('NEXT_PUBLIC_SUPABASE_URL');
  const serviceKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  if (!url.includes('ezmdkwgziyencejfevso')) {
    console.warn(
      `WARNING: URL ref may not be Production expected ezmdkwgziyencejfevso — got ${url}`
    );
  }

  const sb = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  console.log(
    JSON.stringify({
      step: 'download_canonical',
      path: CANONICAL_PATH,
      upload: false,
    })
  );

  const { bytes, size } = await downloadObject(sb, CANONICAL_PATH);
  if (size !== 3418197) {
    console.warn(`WARNING: unexpected size ${size} (expected 3418197)`);
  }
  const sha256 = sha256Hex(bytes);
  console.log(JSON.stringify({ step: 'sha256', sha256, size }));

  console.log(JSON.stringify({ step: 'pdf_extract' }));
  let extracted;
  try {
    extracted = await extractPdfPagesFromBytes(bytes);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(
      message.startsWith('pdf_extraction_failed')
        ? message
        : `pdf_extraction_failed: ${message}`
    );
  }

  const needsOcr =
    extracted.page_count === 0 || extracted.pages.every((p) => !p.text.trim());
  const afterOcr = applyOcrFallbackToPages(extracted.pages);
  const pageParts = chunkPagesPreserving(afterOcr.pages, 700);

  console.log(
    JSON.stringify({
      step: 'extract_summary',
      page_count: afterOcr.page_count,
      pages_extracted: afterOcr.pages_extracted,
      pages_ocr: afterOcr.pages_ocr,
      ocr_used: afterOcr.ocr_used || needsOcr,
      chunk_candidates: pageParts.length,
    })
  );

  if (!pageParts.length) {
    throw new Error('no_chunks_produced — extraction yielded zero text chunks');
  }

  const now = new Date().toISOString();
  const source_document_id = `storage:${CODE}/${EDITION}/${CANONICAL_DOC_ID}`;

  await upsertDocument(sb, {
    id: CANONICAL_DOC_ID,
    company_id: COMPANY_ID,
    title: 'NFPA 13 — 2025 (canonical Storage re-ingest)',
    category: 'NFPA',
    discipline: 'Fire Protection',
    status: 'active',
    file_name: 'document.pdf',
    file_mime: 'application/pdf',
    mime_type: 'application/pdf',
    file_size_bytes: size,
    storage_bucket: BUCKET,
    storage_path: CANONICAL_PATH,
    source_kind: 'upload',
    index_status: 'processing',
    ingestion_status: 'indexing',
    chunk_count: 0,
    ocr_used: Boolean(afterOcr.ocr_used || needsOcr),
    code: CODE,
    edition: EDITION,
    source_type: 'PROJECT_PROVIDED_DOCUMENT',
    verification_status: 'UNVERIFIED',
    platform_verification_status: 'NOT_VERIFIED_OFFICIAL',
    source_document_id,
    extract_status: 'indexed',
    extraction_status: 'indexed',
    ocr_status: afterOcr.ocr_used || needsOcr ? 'indexed' : 'indexed',
    embedding_status: 'pending',
    sha256,
    content_sha256: sha256,
    page_count: afterOcr.page_count,
    pages_extracted: afterOcr.pages_extracted,
    pages_ocr: afterOcr.pages_ocr,
    last_ingestion_at: now,
    ingestion_version: 1,
    deleted_at: null,
    updated_at: now,
    created_at: now,
    notes: `canonical_reingest_from_storage etag=${EXPECTED_ETAG}`,
  });

  const chunkRows = pageParts.map((p) => {
    const refs = detectSourceRefsFromText(p.content, {
      pageGuess: p.page_start,
      allowPageGuess: true,
    });
    const embedding = embedText(p.content);
    return {
      id: newUuid(),
      company_id: COMPANY_ID,
      document_id: CANONICAL_DOC_ID,
      chunk_index: p.index,
      page_number: refs.page_number ?? p.page_start,
      page_start: p.page_start,
      page_end: p.page_end,
      extraction_method: p.extraction_method,
      paragraph_ref: refs.paragraph_reference || null,
      code_reference: refs.code_reference || null,
      content: p.content,
      code: CODE,
      edition: EDITION,
      section: refs.section,
      subsection: refs.subsection,
      table_reference: refs.table_reference,
      figure_reference: refs.figure_reference,
      source_document_id,
      source_verification_status: refs.source_verification_status,
      token_estimate: Math.ceil(p.content.length / 4),
      embedding_json: embedding,
    };
  });

  const inserted = await replaceChunks(sb, CANONICAL_DOC_ID, COMPANY_ID, chunkRows);

  await upsertDocument(sb, {
    id: CANONICAL_DOC_ID,
    company_id: COMPANY_ID,
    title: 'NFPA 13 — 2025 (canonical Storage re-ingest)',
    category: 'NFPA',
    discipline: 'Fire Protection',
    status: 'active',
    file_name: 'document.pdf',
    file_mime: 'application/pdf',
    mime_type: 'application/pdf',
    file_size_bytes: size,
    storage_bucket: BUCKET,
    storage_path: CANONICAL_PATH,
    source_kind: 'upload',
    index_status: 'indexed',
    ingestion_status: 'indexed',
    indexed_at: now,
    chunk_count: inserted,
    ocr_used: Boolean(afterOcr.ocr_used || needsOcr),
    code: CODE,
    edition: EDITION,
    source_type: 'PROJECT_PROVIDED_DOCUMENT',
    verification_status: 'UNVERIFIED',
    platform_verification_status: 'NOT_VERIFIED_OFFICIAL',
    source_document_id,
    extract_status: 'indexed',
    extraction_status: 'indexed',
    ocr_status: 'indexed',
    embedding_status: 'indexed',
    sha256,
    content_sha256: sha256,
    page_count: afterOcr.page_count,
    pages_extracted: afterOcr.pages_extracted,
    pages_ocr: afterOcr.pages_ocr,
    last_ingestion_at: now,
    ingestion_version: 1,
    deleted_at: null,
    updated_at: now,
    notes: `canonical_reingest_from_storage etag=${EXPECTED_ETAG}`,
  });

  const verified = await verifyPersisted(sb, CANONICAL_DOC_ID, CANONICAL_PATH);
  if (
    !verified.storage_ok ||
    !verified.doc ||
    verified.doc.deleted_at ||
    verified.doc.index_status !== 'indexed' ||
    verified.chunk_count <= 0
  ) {
    throw new Error(
      `verify_failed storage_ok=${verified.storage_ok} chunks=${verified.chunk_count} doc=${JSON.stringify(verified.doc)}`
    );
  }

  const report = {
    document_id: CANONICAL_DOC_ID,
    page_count: verified.doc.page_count,
    pages_extracted: verified.doc.pages_extracted,
    pages_ocr: verified.doc.pages_ocr,
    chunks: verified.chunk_count,
    ingestion_status: verified.doc.ingestion_status,
    index_status: verified.doc.index_status,
    storage_path: CANONICAL_PATH,
    sha256,
    uploaded: false,
  };
  console.log(JSON.stringify({ step: 'canonical_indexed', ...report }, null, 2));

  // Only after successful indexing — mark older duplicate for cleanup (no Storage delete)
  const olderExists = await objectExists(sb, OLDER_PATH);
  console.log(JSON.stringify({ older_storage_exists: olderExists, older_path: OLDER_PATH }));
  await markOlderDuplicateForCleanup(sb, OLDER_DUP_DOC_ID, CANONICAL_DOC_ID, sha256);

  console.log(JSON.stringify({ done: true, report }));
}

main().catch((err) => {
  console.error(
    JSON.stringify({
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    })
  );
  process.exit(1);
});
