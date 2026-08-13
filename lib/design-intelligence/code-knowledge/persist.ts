/**
 * Persist Code Knowledge documents/chunks to Supabase (Production path).
 * Session-memory alone is never a success when Supabase is configured.
 */

import { isDemoMode, isSupabaseConfigured, supabase } from '@/lib/supabase';
import { CODE_KNOWLEDGE_STORAGE_BUCKET } from '@/lib/design-intelligence/code-knowledge/storage-path';
import type {
  CodeKnowledgeChunk,
  CodeKnowledgeDocumentMeta,
} from '@/lib/design-intelligence/code-knowledge/types';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: string | null | undefined): boolean {
  return Boolean(value && UUID_RE.test(value));
}

export function newKnowledgeDocumentId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return '00000000-0000-4000-8000-' + Date.now().toString(16).padStart(12, '0').slice(-12);
}

export function newKnowledgeChunkId(): string {
  return newKnowledgeDocumentId();
}

export type PersistVerification = {
  ok: boolean;
  persisted: boolean;
  storage_object_exists: boolean;
  db_document_exists: boolean;
  chunk_count: number;
  error?: string;
};

export function shouldPersistCodeKnowledgeToSupabase(): boolean {
  return isSupabaseConfigured && !isDemoMode;
}

export async function verifyStorageObjectExists(
  bucket: string,
  path: string
): Promise<boolean> {
  if (!shouldPersistCodeKnowledgeToSupabase()) return false;
  const folder = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
  const name = path.includes('/') ? path.slice(path.lastIndexOf('/') + 1) : path;
  const { data, error } = await supabase.storage.from(bucket).list(folder || undefined, {
    limit: 100,
    search: name,
  });
  if (error || !data) return false;
  return data.some((f) => f.name === name);
}

/**
 * Production SHA-256 dedup against di_knowledge_documents (not session-memory).
 * Returns an indexed+persisted row when an identical body already exists.
 */
export async function findPersistedDuplicateBySha256(input: {
  companyId: string;
  code: string;
  edition: string;
  sha256: string;
}): Promise<CodeKnowledgeDocumentMeta | null> {
  if (!shouldPersistCodeKnowledgeToSupabase()) return null;
  if (!isUuid(input.companyId) || !input.sha256) return null;

  const { data, error } = await supabase
    .from('di_knowledge_documents')
    .select('*')
    .eq('company_id', input.companyId)
    .eq('code', input.code)
    .eq('edition', input.edition)
    .eq('sha256', input.sha256)
    .is('deleted_at', null)
    .neq('status', 'superseded')
    .order('created_at', { ascending: false })
    .limit(5);

  if (error || !data?.length) return null;

  const row = data.find(
    (r) =>
      r.index_status === 'indexed' &&
      r.storage_path &&
      (r.chunk_count || 0) > 0 &&
      r.ingestion_status !== 'superseded'
  );
  if (!row) return null;

  return {
    id: row.id,
    company_id: row.company_id,
    title: row.title,
    code: row.code || input.code,
    edition: row.edition || input.edition,
    status: row.status,
    index_status: row.index_status,
    ingestion_status: row.ingestion_status,
    chunk_count: row.chunk_count,
    page_count: row.page_count,
    file_name: row.file_name,
    file_mime: row.file_mime || row.mime_type,
    mime_type: row.mime_type || row.file_mime,
    file_size_bytes: row.file_size_bytes,
    storage_bucket: row.storage_bucket,
    storage_path: row.storage_path,
    sha256: row.sha256,
    content_sha256: row.content_sha256 || row.sha256,
    source_document_id: row.source_document_id,
    persisted: true,
    persist_error: null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export async function persistCodeKnowledgeDocument(
  doc: CodeKnowledgeDocumentMeta
): Promise<{ ok: boolean; error?: string }> {
  if (!shouldPersistCodeKnowledgeToSupabase()) {
    return { ok: false, error: 'supabase_not_configured' };
  }
  if (!isUuid(doc.id)) {
    return { ok: false, error: 'document_id_must_be_uuid' };
  }

  const companyId = doc.company_id && isUuid(doc.company_id) ? doc.company_id : null;
  const row = {
    id: doc.id,
    company_id: companyId,
    title: doc.title,
    category: 'NFPA',
    discipline: 'Fire Protection',
    status: doc.status === 'superseded' ? 'superseded' : 'active',
    file_name: doc.file_name,
    file_mime: doc.mime_type || doc.file_mime,
    mime_type: doc.mime_type || doc.file_mime,
    file_size_bytes: doc.file_size_bytes,
    storage_bucket: doc.storage_bucket || CODE_KNOWLEDGE_STORAGE_BUCKET,
    storage_path: doc.storage_path,
    source_kind: 'upload',
    index_status: doc.index_status,
    indexed_at: doc.indexed_at,
    chunk_count: doc.chunk_count || 0,
    ocr_used: Boolean(doc.ocr_used),
    code: doc.code,
    edition: doc.edition,
    version: doc.version,
    source_type: doc.source_type,
    adoption_status: doc.adoption_status,
    verification_status: doc.verification_status,
    platform_verification_status: doc.platform_verification_status,
    source_document_id: doc.source_document_id,
    code_edition_id: isUuid(doc.code_edition_id || undefined) ? doc.code_edition_id : null,
    extract_status: doc.extract_status || doc.extraction_status,
    extraction_status: doc.extraction_status || doc.extract_status,
    ocr_status: doc.ocr_status,
    embedding_status: doc.embedding_status,
    ingestion_status: doc.ingestion_status,
    sha256: doc.sha256,
    content_sha256: doc.content_sha256 || doc.sha256,
    page_count: doc.page_count,
    pages_extracted: doc.pages_extracted,
    pages_ocr: doc.pages_ocr,
    last_ingestion_at: doc.last_ingestion_at,
    ingestion_version: doc.ingestion_version || 1,
    applicable_codes: doc.code ? [doc.code] : [],
    updated_at: doc.updated_at || new Date().toISOString(),
    created_at: doc.created_at || new Date().toISOString(),
    deleted_at: doc.deleted_at || null,
  };

  const { error } = await supabase.from('di_knowledge_documents').upsert(row);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function persistCodeKnowledgeChunks(
  documentId: string,
  chunks: CodeKnowledgeChunk[]
): Promise<{ ok: boolean; error?: string }> {
  if (!shouldPersistCodeKnowledgeToSupabase()) {
    return { ok: false, error: 'supabase_not_configured' };
  }
  if (!isUuid(documentId)) {
    return { ok: false, error: 'document_id_must_be_uuid' };
  }

  const { error: delErr } = await supabase
    .from('di_knowledge_chunks')
    .delete()
    .eq('document_id', documentId);
  if (delErr) return { ok: false, error: delErr.message };

  if (!chunks.length) return { ok: true };

  const companyId =
    chunks[0]?.company_id && isUuid(chunks[0].company_id) ? chunks[0].company_id : null;

  const batchSize = 40;
  for (let i = 0; i < chunks.length; i += batchSize) {
    const batch = chunks.slice(i, i + batchSize);
    const { error } = await supabase.from('di_knowledge_chunks').insert(
      batch.map((c) => ({
        id: isUuid(c.id) ? c.id : newKnowledgeDocumentId(),
        company_id: companyId,
        document_id: documentId,
        chunk_index: c.chunk_index,
        page_number: c.page_number ?? c.page_start ?? null,
        page_start: c.page_start ?? null,
        page_end: c.page_end ?? null,
        extraction_method: c.extraction_method ?? null,
        paragraph_ref: c.paragraph_reference || null,
        code_reference: c.code_reference || null,
        content: c.content,
        code: c.code,
        edition: c.edition,
        section: c.section,
        subsection: c.subsection,
        table_reference: c.table_reference,
        figure_reference: c.figure_reference,
        source_document_id: c.source_document_id,
        source_verification_status: c.source_verification_status,
        edition_id: isUuid(c.edition_id || undefined) ? c.edition_id : null,
        token_estimate: Math.ceil(c.content.length / 4),
        embedding_json: c.embedding || null,
      }))
    );
    if (error) return { ok: false, error: error.message };
  }
  return { ok: true };
}

export async function verifyPersistedCodeKnowledgeIngestion(input: {
  documentId: string;
  storageBucket: string;
  storagePath: string;
}): Promise<PersistVerification> {
  if (!shouldPersistCodeKnowledgeToSupabase()) {
    return {
      ok: false,
      persisted: false,
      storage_object_exists: false,
      db_document_exists: false,
      chunk_count: 0,
      error: 'supabase_not_configured',
    };
  }

  const storage_object_exists = await verifyStorageObjectExists(
    input.storageBucket,
    input.storagePath
  );

  const { data: doc, error: docErr } = await supabase
    .from('di_knowledge_documents')
    .select('id, index_status, ingestion_status, chunk_count')
    .eq('id', input.documentId)
    .is('deleted_at', null)
    .maybeSingle();

  if (docErr) {
    return {
      ok: false,
      persisted: false,
      storage_object_exists,
      db_document_exists: false,
      chunk_count: 0,
      error: docErr.message,
    };
  }

  const { count, error: chunkErr } = await supabase
    .from('di_knowledge_chunks')
    .select('id', { count: 'exact', head: true })
    .eq('document_id', input.documentId);

  if (chunkErr) {
    return {
      ok: false,
      persisted: false,
      storage_object_exists,
      db_document_exists: Boolean(doc),
      chunk_count: 0,
      error: chunkErr.message,
    };
  }

  const chunk_count = count || 0;
  const db_document_exists = Boolean(doc);
  const ingestOk =
    doc &&
    String(doc.index_status || '').toLowerCase() === 'indexed' &&
    ['indexed', 'INDEXED'].includes(String(doc.ingestion_status || '')) &&
    chunk_count > 0;
  const ok = storage_object_exists && db_document_exists && Boolean(ingestOk);

  return {
    ok,
    persisted: ok,
    storage_object_exists,
    db_document_exists,
    chunk_count,
    error: ok
      ? undefined
      : !storage_object_exists
        ? 'storage_object_missing'
        : !db_document_exists
          ? 'db_document_missing'
          : chunk_count <= 0
            ? 'chunks_missing'
            : 'index_incomplete',
  };
}

export async function listPersistedCodeKnowledgeDocuments(opts?: {
  companyId?: string | null;
  code?: string;
  edition?: string;
}): Promise<{ ok: boolean; documents: CodeKnowledgeDocumentMeta[]; error?: string }> {
  if (!shouldPersistCodeKnowledgeToSupabase()) {
    return { ok: false, documents: [], error: 'supabase_not_configured' };
  }

  let q = supabase
    .from('di_knowledge_documents')
    .select('*')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(200);

  if (opts?.companyId && isUuid(opts.companyId)) {
    q = q.eq('company_id', opts.companyId);
  }
  if (opts?.code) q = q.eq('code', opts.code);
  if (opts?.edition) q = q.eq('edition', opts.edition);

  const { data, error } = await q;
  if (error) return { ok: false, documents: [], error: error.message };
  if (!data) return { ok: true, documents: [] };

  return {
    ok: true,
    documents: data.map((row) => ({
      id: row.id,
      company_id: row.company_id,
      title: row.title,
      code: row.code || '',
      edition: row.edition || '',
      code_edition_id: row.code_edition_id,
      version: row.version,
      source_type: row.source_type,
      adoption_status: row.adoption_status,
      verification_status: row.verification_status,
      platform_verification_status: row.platform_verification_status,
      source_document_id: row.source_document_id,
      status: row.status,
      index_status: row.index_status,
      extract_status: row.extract_status,
      extraction_status: row.extraction_status || row.extract_status,
      ocr_status: row.ocr_status,
      embedding_status: row.embedding_status,
      ingestion_status: row.ingestion_status,
      indexed_at: row.indexed_at,
      last_ingestion_at: row.last_ingestion_at,
      chunk_count: row.chunk_count,
      page_count: row.page_count,
      pages_extracted: row.pages_extracted,
      pages_ocr: row.pages_ocr,
      ingestion_version: row.ingestion_version,
      file_name: row.file_name,
      file_mime: row.file_mime || row.mime_type,
      mime_type: row.mime_type || row.file_mime,
      file_size_bytes: row.file_size_bytes,
      storage_bucket: row.storage_bucket,
      storage_path: row.storage_path,
      sha256: row.sha256,
      content_sha256: row.content_sha256,
      ocr_used: row.ocr_used,
      created_at: row.created_at,
      updated_at: row.updated_at,
      deleted_at: row.deleted_at,
      persisted: Boolean(
        row.storage_path &&
          row.index_status === 'indexed' &&
          (row.chunk_count || 0) > 0
      ),
      persist_error: null,
    })),
  };
}

/**
 * Persist document + chunks then verify Storage object + DB rows before
 * allowing status=indexed. On any failure, marks the in-memory doc FAILED.
 */
export async function persistAndVerifyCodeKnowledgeIngestion(input: {
  document: CodeKnowledgeDocumentMeta;
  chunks: CodeKnowledgeChunk[];
}): Promise<{
  ok: boolean;
  persisted: boolean;
  chunk_count: number;
  error?: string;
  verification?: PersistVerification;
}> {
  const doc = input.document;
  if (!shouldPersistCodeKnowledgeToSupabase()) {
    doc.persisted = false;
    return { ok: true, persisted: false, chunk_count: input.chunks.length };
  }

  if (!isUuid(doc.id)) {
    doc.persisted = false;
    doc.persist_error = 'document_id_must_be_uuid';
    doc.index_status = 'failed';
    doc.ingestion_status = 'failed';
    return { ok: false, persisted: false, chunk_count: 0, error: doc.persist_error };
  }

  if (!doc.storage_path) {
    doc.persisted = false;
    doc.persist_error = 'storage_path_missing';
    doc.index_status = 'failed';
    doc.ingestion_status = 'failed';
    return { ok: false, persisted: false, chunk_count: 0, error: doc.persist_error };
  }

  if (!input.chunks.length) {
    doc.persisted = false;
    doc.persist_error = 'chunks_missing';
    doc.index_status = 'failed';
    doc.ingestion_status = 'failed';
    return { ok: false, persisted: false, chunk_count: 0, error: doc.persist_error };
  }

  // Write statuses that verification requires
  doc.index_status = 'indexed';
  doc.ingestion_status = 'indexed';
  doc.chunk_count = input.chunks.length;
  doc.updated_at = new Date().toISOString();

  const docPersist = await persistCodeKnowledgeDocument(doc);
  if (!docPersist.ok) {
    doc.persisted = false;
    doc.persist_error = docPersist.error || 'document_persist_failed';
    doc.index_status = 'failed';
    doc.ingestion_status = 'failed';
    return { ok: false, persisted: false, chunk_count: 0, error: doc.persist_error };
  }

  const chunkPersist = await persistCodeKnowledgeChunks(doc.id, input.chunks);
  if (!chunkPersist.ok) {
    doc.persisted = false;
    doc.persist_error = chunkPersist.error || 'chunk_persist_failed';
    doc.index_status = 'failed';
    doc.ingestion_status = 'failed';
    await persistCodeKnowledgeDocument(doc);
    return { ok: false, persisted: false, chunk_count: 0, error: doc.persist_error };
  }

  const verification = await verifyPersistedCodeKnowledgeIngestion({
    documentId: doc.id,
    storageBucket: doc.storage_bucket || CODE_KNOWLEDGE_STORAGE_BUCKET,
    storagePath: doc.storage_path,
  });

  if (!verification.ok || !verification.persisted) {
    doc.persisted = false;
    doc.persist_error = verification.error || 'persistence_verification_failed';
    doc.index_status = 'failed';
    doc.ingestion_status = 'failed';
    await persistCodeKnowledgeDocument(doc);
    return {
      ok: false,
      persisted: false,
      chunk_count: verification.chunk_count,
      error: doc.persist_error,
      verification,
    };
  }

  doc.persisted = true;
  doc.persist_error = null;
  doc.chunk_count = verification.chunk_count;
  return {
    ok: true,
    persisted: true,
    chunk_count: verification.chunk_count,
    verification,
  };
}
