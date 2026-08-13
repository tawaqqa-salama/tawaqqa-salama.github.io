import { EKB_TOPICS } from '@/lib/compliance/ekb-catalog';
import { cosineSimilarity, embedText, chunkText, extractTextFromFile } from '@/lib/design-intelligence/embeddings';
import { completeIndexingJob, enqueueIndexingJob } from '@/lib/design-intelligence/jobs';
import type {
  DiKnowledgeChunk,
  DiKnowledgeDocument,
  KnowledgeDocStatus,
  RagAnswer,
  RagCitation,
} from '@/lib/design-intelligence/types';
import { KNOWLEDGE_CATEGORIES } from '@/lib/design-intelligence/types';
import {
  getSupabaseRuntimeDiagnostics,
  isDemoMode,
  isSupabaseConfigured,
  SUPABASE_PERSISTENCE_UNAVAILABLE,
  supabase,
} from '@/lib/supabase';
import {
  chunkPagesPreserving,
  pagesFromPlainText,
} from '@/lib/design-intelligence/code-knowledge/pdf-page-extract';
import { detectSourceRefsFromText } from '@/lib/design-intelligence/code-knowledge/source-refs';
import { sha256HexFromBytes } from '@/lib/design-intelligence/code-knowledge/sha256';
import {
  CODE_KNOWLEDGE_STORAGE_BUCKET,
  sanitizeKnowledgeFileName,
} from '@/lib/design-intelligence/code-knowledge/storage-path';
import {
  isUuid,
  newKnowledgeChunkId,
  newKnowledgeDocumentId,
} from '@/lib/design-intelligence/code-knowledge/persist';

export type KnowledgeUploadDiagnostics = {
  runtime_mode: 'production-supabase' | 'demo-local' | 'misconfigured';
  project_ref: string | null;
  expected_project_ref: string;
  supabase_configured: boolean;
  authenticated: boolean;
  company_id_present: boolean;
  storage_upload_attempted: boolean;
  db_insert_attempted: boolean;
  chunks_insert_attempted: boolean;
  storage_path: string | null;
  document_id: string | null;
  chunk_count: number;
  handler_path: string;
  error?: string | null;
};

export function buildKnowledgeUploadDiagnostics(
  partial?: Partial<KnowledgeUploadDiagnostics>
): KnowledgeUploadDiagnostics {
  const rt = getSupabaseRuntimeDiagnostics();
  return {
    runtime_mode: rt.runtime_mode,
    project_ref: rt.project_ref,
    expected_project_ref: rt.expected_project_ref,
    supabase_configured: rt.supabase_configured,
    authenticated: Boolean(partial?.authenticated),
    company_id_present: Boolean(partial?.company_id_present),
    storage_upload_attempted: Boolean(partial?.storage_upload_attempted),
    db_insert_attempted: Boolean(partial?.db_insert_attempted),
    chunks_insert_attempted: Boolean(partial?.chunks_insert_attempted),
    storage_path: partial?.storage_path ?? null,
    document_id: partial?.document_id ?? null,
    chunk_count: partial?.chunk_count ?? 0,
    handler_path:
      partial?.handler_path ||
      'DesignIntelligenceModule.onUpload → uploadAndIndexKnowledgeFile',
    error: partial?.error ?? null,
  };
}

const LOCAL_DOCS_KEY = 'tawaqqa_di_knowledge_docs_v1';
const LOCAL_CHUNKS_KEY = 'tawaqqa_di_knowledge_chunks_v1';
const BUCKET = CODE_KNOWLEDGE_STORAGE_BUCKET;

/** Browser localStorage is ~5MB — never store PDF text / data URLs / embedding vectors there. */
const LOCAL_DOC_LIMIT = 80;
const LOCAL_CHUNK_LIMIT = 400;
const LOCAL_CONTENT_PREVIEW = 280;

function uid(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function isQuotaExceeded(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { name?: string; code?: number; message?: string };
  return (
    e.name === 'QuotaExceededError' ||
    e.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    e.code === 22 ||
    e.code === 1014 ||
    /exceeded the quota/i.test(String(e.message || ''))
  );
}

/** In-memory session cache (full text + embeddings) — survives quota issues */
let memoryDocs: DiKnowledgeDocument[] | null = null;
let memoryChunks: DiKnowledgeChunk[] | null = null;

function slimDocForLocal(doc: DiKnowledgeDocument): DiKnowledgeDocument {
  const preview =
    doc.extracted_text && doc.extracted_text.length > LOCAL_CONTENT_PREVIEW
      ? `${doc.extracted_text.slice(0, LOCAL_CONTENT_PREVIEW)}…`
      : doc.extracted_text || null;
  return {
    ...doc,
    extracted_text: preview,
    data_url: null,
  };
}

function slimChunkForLocal(chunk: DiKnowledgeChunk): DiKnowledgeChunk {
  return {
    id: chunk.id,
    document_id: chunk.document_id,
    chunk_index: chunk.chunk_index,
    page_number: chunk.page_number ?? null,
    paragraph_ref: chunk.paragraph_ref ?? null,
    code_reference: chunk.code_reference ?? null,
    content:
      chunk.content.length > 1200 ? `${chunk.content.slice(0, 1200)}…` : chunk.content,
    // embeddings recomputed on demand — 384 floats × thousands of chunks blows quota
    embedding: undefined,
    document_title: chunk.document_title,
  };
}

function safeSetItem(key: string, value: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (err) {
    if (!isQuotaExceeded(err)) throw err;
    try {
      localStorage.removeItem(LOCAL_CHUNKS_KEY);
      localStorage.removeItem(LOCAL_DOCS_KEY);
      localStorage.setItem(key, value);
      return true;
    } catch {
      // Browser storage full — Supabase / memory remain authoritative
      return false;
    }
  }
}

function readLocalDocs(): DiKnowledgeDocument[] {
  if (memoryDocs) return memoryDocs;
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem(LOCAL_DOCS_KEY) || '[]') as DiKnowledgeDocument[];
  } catch {
    return [];
  }
}

function writeLocalDocs(docs: DiKnowledgeDocument[]) {
  memoryDocs = docs;
  if (typeof window === 'undefined') return;
  const slim = docs.slice(0, LOCAL_DOC_LIMIT).map(slimDocForLocal);
  safeSetItem(LOCAL_DOCS_KEY, JSON.stringify(slim));
}

function readLocalChunks(): DiKnowledgeChunk[] {
  if (memoryChunks) return memoryChunks;
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem(LOCAL_CHUNKS_KEY) || '[]') as DiKnowledgeChunk[];
  } catch {
    return [];
  }
}

function writeLocalChunks(chunks: DiKnowledgeChunk[]) {
  memoryChunks = chunks;
  if (typeof window === 'undefined') return;
  const slim = chunks.slice(0, LOCAL_CHUNK_LIMIT).map(slimChunkForLocal);
  safeSetItem(LOCAL_CHUNKS_KEY, JSON.stringify(slim));
}

/** Clear bloated legacy local caches (full embeddings / PDF data URLs). */
export function pruneKnowledgeLocalCache(): void {
  if (typeof window === 'undefined') return;
  try {
    const docs = (JSON.parse(localStorage.getItem(LOCAL_DOCS_KEY) || '[]') as DiKnowledgeDocument[]).map(
      slimDocForLocal
    );
    const chunks = (JSON.parse(localStorage.getItem(LOCAL_CHUNKS_KEY) || '[]') as DiKnowledgeChunk[])
      .slice(0, LOCAL_CHUNK_LIMIT)
      .map(slimChunkForLocal);
    localStorage.removeItem(LOCAL_DOCS_KEY);
    localStorage.removeItem(LOCAL_CHUNKS_KEY);
    safeSetItem(LOCAL_DOCS_KEY, JSON.stringify(docs.slice(0, LOCAL_DOC_LIMIT)));
    safeSetItem(LOCAL_CHUNKS_KEY, JSON.stringify(chunks));
  } catch {
    try {
      localStorage.removeItem(LOCAL_DOCS_KEY);
      localStorage.removeItem(LOCAL_CHUNKS_KEY);
    } catch {
      /* ignore */
    }
  }
}

/** Seed built-in EKB topics as indexed knowledge (offline, no internet). */
export function ensureSeedKnowledgeBase(): { docs: DiKnowledgeDocument[]; chunks: DiKnowledgeChunk[] } {
  // One-time migration: shrink any quota-busting legacy payload
  if (typeof window !== 'undefined') {
    try {
      const rawChunks = localStorage.getItem(LOCAL_CHUNKS_KEY);
      if (rawChunks && rawChunks.length > 1_500_000) {
        pruneKnowledgeLocalCache();
      }
    } catch {
      pruneKnowledgeLocalCache();
    }
  }

  const existing = readLocalDocs();
  if (existing.some((d) => d.source_kind === 'ekb-seed')) {
    return { docs: existing, chunks: readLocalChunks() };
  }

  const now = new Date().toISOString();
  const docs: DiKnowledgeDocument[] = [];
  const chunks: DiKnowledgeChunk[] = [];

  for (const topic of EKB_TOPICS) {
    const id = uid('ekb');
    const text = [
      topic.title,
      topic.summary,
      `Standards: ${topic.standard}`,
      `Tags: ${(topic.tags || []).join(', ')}`,
    ].join('\n\n');
    const parts = chunkText(text, 700);
    docs.push({
      id,
      title: topic.title,
      category: 'SBC',
      discipline: 'Fire Protection',
      revision: '1',
      author_name: 'EKB Catalog',
      version_label: '1.0',
      tags: topic.tags || [],
      keywords: topic.tags || [],
      applicable_codes: topic.standard === 'BOTH' ? ['SBC', 'NFPA'] : [topic.standard],
      status: 'active',
      notes: 'Seeded from Engineering Knowledge Base catalog',
      file_name: `${topic.id}.md`,
      source_kind: 'ekb-seed',
      index_status: 'indexed',
      indexed_at: now,
      chunk_count: parts.length,
      ocr_used: false,
      extracted_text: text,
      created_at: now,
      updated_at: now,
    });
    parts.forEach((part, i) => {
      chunks.push({
        id: uid('chk'),
        document_id: id,
        chunk_index: i,
        page_number: part.pageGuess,
        paragraph_ref: `§${i + 1}`,
        code_reference: topic.standard === 'BOTH' ? 'SBC/NFPA' : topic.standard,
        content: part.content,
        // Keep embeddings in memory only via writeLocalChunks → memoryChunks
        embedding: embedText(part.content),
        document_title: topic.title,
      });
    });
  }

  const mergedDocs = [...docs, ...existing];
  const mergedChunks = [
    ...chunks,
    ...readLocalChunks().filter((c) => !docs.some((d) => d.id === c.document_id)),
  ];
  writeLocalDocs(mergedDocs);
  writeLocalChunks(mergedChunks);
  return { docs: mergedDocs, chunks: mergedChunks };
}

export function listKnowledgeDocumentsSync(): DiKnowledgeDocument[] {
  ensureSeedKnowledgeBase();
  return readLocalDocs().filter((d) => !d.deleted_at);
}

export async function listKnowledgeDocuments(): Promise<DiKnowledgeDocument[]> {
  ensureSeedKnowledgeBase();
  if (!isDemoMode) {
    const { data, error } = await supabase
      .from('di_knowledge_documents')
      .select('*')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(200);
    if (!error && data?.length) {
      const remote = data as DiKnowledgeDocument[];
      // Merge into memory so UI stays consistent without bloating localStorage
      const local = readLocalDocs().filter(
        (d) => !d.deleted_at && !remote.some((r) => r.id === d.id)
      );
      writeLocalDocs([
        ...remote,
        ...local,
        ...readLocalDocs().filter((d) => Boolean(d.deleted_at)),
      ]);
      return readLocalDocs().filter((d) => !d.deleted_at);
    }
  }
  return readLocalDocs().filter((d) => !d.deleted_at);
}

/** Includes soft-deleted rows (delete / duplicate helpers). */
export function listLocalKnowledgeDocumentsIncludingDeleted(): DiKnowledgeDocument[] {
  return readLocalDocs();
}

export function findLocalKnowledgeDocument(
  documentId: string
): DiKnowledgeDocument | null {
  return readLocalDocs().find((d) => d.id === documentId) || null;
}

/**
 * Soft-delete a Knowledge Base local/session document and optionally only strip chunks.
 */
export function applyLocalKnowledgeDocumentSoftDelete(
  documentId: string,
  opts?: {
    companyId?: string;
    deletedAt?: string;
    removeChunksOnly?: boolean;
  }
): { chunksRemoved: number; softDeleted: boolean } {
  const docs = readLocalDocs();
  const chunks = readLocalChunks();
  const nextChunks = chunks.filter((c) => c.document_id !== documentId);
  const chunksRemoved = chunks.length - nextChunks.length;
  writeLocalChunks(nextChunks);

  if (opts?.removeChunksOnly) {
    return { chunksRemoved, softDeleted: false };
  }

  const now = opts?.deletedAt || new Date().toISOString();
  let softDeleted = false;
  const nextDocs = docs.map((d) => {
    if (d.id !== documentId) return d;
    if (opts?.companyId && d.company_id && d.company_id !== opts.companyId) {
      throw new Error('company_mismatch');
    }
    softDeleted = true;
    return {
      ...d,
      deleted_at: now,
      chunk_count: 0,
      index_status: 'failed',
      ingestion_status: 'failed',
      extracted_text: null,
      updated_at: now,
    };
  });
  writeLocalDocs(nextDocs);
  return { chunksRemoved, softDeleted };
}

async function tryUploadToStorage(input: {
  file: File;
  docId: string;
  companyId: string;
}): Promise<{ path: string | null; bucket: string; error?: string }> {
  if (!isSupabaseConfigured) {
    return { path: null, bucket: BUCKET, error: SUPABASE_PERSISTENCE_UNAVAILABLE };
  }
  if (typeof window === 'undefined') {
    return { path: null, bucket: BUCKET, error: 'browser_only_upload' };
  }
  if (!isUuid(input.companyId)) {
    return {
      path: null,
      bucket: BUCKET,
      error: 'company_id must be a UUID for design-knowledge Storage RLS',
    };
  }
  if (!isUuid(input.docId)) {
    return { path: null, bucket: BUCKET, error: 'document_id must be a UUID' };
  }

  try {
    const safeName = sanitizeKnowledgeFileName(input.file.name);
    // Tenant RLS: first path segment must equal current_app_company_id()
    const path = `${input.companyId}/knowledge/${input.docId}/${safeName}`;
    const { error } = await supabase.storage.from(BUCKET).upload(path, input.file, {
      upsert: true,
      contentType: input.file.type || undefined,
    });
    if (error) return { path: null, bucket: BUCKET, error: error.message };
    return { path, bucket: BUCKET };
  } catch (err) {
    return {
      path: null,
      bucket: BUCKET,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/** Insert / upsert a processing stub so di_indexing_jobs FK can reference the document. */
async function upsertKnowledgeDocumentStub(
  doc: DiKnowledgeDocument
): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseConfigured) {
    return { ok: false, error: SUPABASE_PERSISTENCE_UNAVAILABLE };
  }
  if (!isUuid(doc.id)) {
    return { ok: false, error: 'document_id must be a UUID' };
  }
  const companyId = doc.company_id && isUuid(doc.company_id) ? doc.company_id : null;
  const now = new Date().toISOString();
  const { error } = await supabase.from('di_knowledge_documents').upsert({
    id: doc.id,
    company_id: companyId,
    title: doc.title,
    category: doc.category,
    discipline: doc.discipline,
    revision: doc.revision,
    issue_date: doc.issue_date,
    author_name: doc.author_name,
    version_label: doc.version_label,
    version_no: doc.version_no || 1,
    tags: doc.tags || [],
    keywords: doc.keywords || [],
    applicable_codes: doc.applicable_codes || [],
    status: doc.status || 'active',
    notes: doc.notes,
    file_name: doc.file_name,
    file_mime: doc.file_mime,
    mime_type: doc.mime_type || doc.file_mime,
    file_size_bytes: doc.file_size_bytes,
    storage_bucket: doc.storage_bucket || BUCKET,
    storage_path: doc.storage_path,
    source_kind: doc.source_kind || 'upload',
    index_status: 'processing',
    ingestion_status: doc.ingestion_status || 'uploaded',
    chunk_count: 0,
    ocr_used: Boolean(doc.ocr_used),
    sha256: doc.sha256,
    content_sha256: doc.content_sha256 || doc.sha256,
    page_count: doc.page_count,
    pages_extracted: doc.pages_extracted,
    pages_ocr: doc.pages_ocr,
    code: doc.code,
    edition: doc.edition,
    source_type: doc.source_type,
    platform_verification_status: doc.platform_verification_status,
    created_at: doc.created_at || now,
    updated_at: now,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

async function verifyPersistedKnowledgeRows(documentId: string): Promise<{
  ok: boolean;
  chunkCount: number;
  error?: string;
}> {
  const { data: doc, error: docErr } = await supabase
    .from('di_knowledge_documents')
    .select('id, index_status, chunk_count')
    .eq('id', documentId)
    .is('deleted_at', null)
    .maybeSingle();
  if (docErr) return { ok: false, chunkCount: 0, error: docErr.message };
  if (!doc) return { ok: false, chunkCount: 0, error: 'db_document_missing' };

  const { count, error: chunkErr } = await supabase
    .from('di_knowledge_chunks')
    .select('id', { count: 'exact', head: true })
    .eq('document_id', documentId);
  if (chunkErr) return { ok: false, chunkCount: 0, error: chunkErr.message };
  const chunkCount = count || 0;
  if (chunkCount <= 0) return { ok: false, chunkCount: 0, error: 'chunks_missing' };
  return { ok: true, chunkCount };
}

export async function indexDocumentText(
  doc: DiKnowledgeDocument,
  text: string,
  ocrUsed = false,
  pageMeta?: {
    page_count?: number | null;
    pages_extracted?: number | null;
    pages_ocr?: number | null;
    page_texts?: string[];
    extraction_method?: string;
    sha256?: string | null;
  },
  opts?: {
    /** When true (Production Knowledge upload), DB+chunk persistence is required. */
    requireCloudPersist?: boolean;
  }
): Promise<{ doc: DiKnowledgeDocument; chunks: DiKnowledgeChunk[]; persistedToCloud: boolean }> {
  const requireCloud = Boolean(opts?.requireCloudPersist) || isSupabaseConfigured;
  const pageTexts = pageMeta?.page_texts?.length
    ? pageMeta.page_texts.map((t, i) => ({
        page: i + 1,
        text: t,
        extraction_method: (t.trim()
          ? 'text'
          : ocrUsed
            ? 'ocr'
            : 'empty') as 'text' | 'ocr' | 'empty',
      }))
    : pagesFromPlainText(text).pages;

  const pageParts = chunkPagesPreserving(pageTexts, 900);
  const useUuidIds = requireCloud || isUuid(doc.id);
  const chunks: DiKnowledgeChunk[] =
    pageParts.length > 0
      ? pageParts.map((part) => {
          const refs = detectSourceRefsFromText(part.content, {
            pageGuess: part.page_start,
            allowPageGuess: true,
          });
          return {
            id: useUuidIds ? newKnowledgeChunkId() : uid('chk'),
            document_id: doc.id,
            company_id: doc.company_id ?? null,
            chunk_index: part.index,
            page_number: refs.page_number ?? part.page_start,
            page_start: part.page_start,
            page_end: part.page_end,
            extraction_method: part.extraction_method,
            paragraph_ref: refs.paragraph_reference || `§${part.index + 1}`,
            code_reference: doc.applicable_codes?.[0] || refs.code_reference || null,
            content: part.content,
            embedding: embedText(part.content),
            document_title: doc.title,
            section: refs.section,
            subsection: refs.subsection,
            table_reference: refs.table_reference,
            figure_reference: refs.figure_reference,
            source_verification_status: refs.source_verification_status,
          };
        })
      : chunkText(text).map((part, i) => ({
          id: useUuidIds ? newKnowledgeChunkId() : uid('chk'),
          document_id: doc.id,
          company_id: doc.company_id ?? null,
          chunk_index: i,
          page_number: part.pageGuess,
          page_start: part.pageGuess,
          page_end: part.pageGuess,
          extraction_method: ocrUsed ? 'ocr' : 'text',
          paragraph_ref: `§${i + 1}`,
          code_reference: doc.applicable_codes?.[0] || null,
          content: part.content,
          embedding: embedText(part.content),
          document_title: doc.title,
        }));

  const now = new Date().toISOString();
  const updated: DiKnowledgeDocument = {
    ...doc,
    extracted_text: text,
    data_url: null,
    ocr_used: ocrUsed,
    index_status: 'processing',
    indexed_at: null,
    chunk_count: chunks.length,
    page_count: pageMeta?.page_count ?? pageTexts.length ?? doc.page_count ?? null,
    pages_extracted: pageMeta?.pages_extracted ?? pageTexts.filter((p) => p.text.trim()).length,
    pages_ocr: pageMeta?.pages_ocr ?? (ocrUsed ? pageTexts.filter((p) => !p.text.trim()).length : 0),
    extract_status: 'indexed',
    extraction_status: 'indexed',
    ocr_status: ocrUsed ? 'indexed' : 'indexed',
    embedding_status: chunks.length ? 'indexed' : 'pending',
    ingestion_status: 'indexing',
    last_ingestion_at: now,
    sha256: pageMeta?.sha256 ?? doc.sha256 ?? null,
    content_sha256: pageMeta?.sha256 ?? doc.content_sha256 ?? null,
    status: (doc.status || 'active') as KnowledgeDocStatus,
    updated_at: now,
  };

  let persistedToCloud = false;

  if (isSupabaseConfigured) {
    if (!isUuid(updated.id)) {
      updated.index_status = 'failed';
      updated.ingestion_status = 'failed';
      throw new Error('document_id must be a UUID for di_knowledge_documents');
    }
    if (!updated.storage_path) {
      updated.index_status = 'failed';
      updated.ingestion_status = 'failed';
      throw new Error('storage_path required before DB persist');
    }
    if (!chunks.length) {
      updated.index_status = 'failed';
      updated.ingestion_status = 'failed';
      throw new Error('chunks_missing');
    }

    updated.index_status = 'indexed';
    updated.ingestion_status = 'indexed';
    updated.indexed_at = now;

    const companyId =
      updated.company_id && isUuid(updated.company_id) ? updated.company_id : null;

    const { error: docErr } = await supabase.from('di_knowledge_documents').upsert({
      id: updated.id,
      company_id: companyId,
      title: updated.title,
      category: updated.category,
      discipline: updated.discipline,
      revision: updated.revision,
      issue_date: updated.issue_date,
      author_name: updated.author_name,
      version_label: updated.version_label,
      version_no: updated.version_no || 1,
      parent_document_id: updated.parent_document_id || null,
      tags: updated.tags,
      keywords: updated.keywords,
      project_type: updated.project_type,
      building_type: updated.building_type,
      hazard_classification: updated.hazard_classification,
      applicable_codes: updated.applicable_codes,
      status: updated.status,
      notes: updated.notes,
      file_name: updated.file_name,
      file_mime: updated.file_mime,
      mime_type: updated.mime_type || updated.file_mime,
      file_size_bytes: updated.file_size_bytes,
      storage_bucket: updated.storage_bucket || BUCKET,
      storage_path: updated.storage_path,
      source_kind: updated.source_kind,
      index_status: updated.index_status,
      indexed_at: updated.indexed_at,
      chunk_count: updated.chunk_count,
      ocr_used: updated.ocr_used,
      sha256: updated.sha256,
      content_sha256: updated.content_sha256,
      page_count: updated.page_count,
      pages_extracted: updated.pages_extracted,
      pages_ocr: updated.pages_ocr,
      ingestion_status: updated.ingestion_status,
      extraction_status: updated.extraction_status,
      extract_status: updated.extract_status,
      ocr_status: updated.ocr_status,
      embedding_status: updated.embedding_status,
      last_ingestion_at: updated.last_ingestion_at,
      code: updated.code,
      edition: updated.edition,
      source_type: updated.source_type,
      platform_verification_status: updated.platform_verification_status,
      updated_at: updated.updated_at,
      created_at: updated.created_at || now,
    });
    if (docErr) {
      updated.index_status = 'failed';
      updated.ingestion_status = 'failed';
      throw new Error(`di_knowledge_documents insert failed: ${docErr.message}`);
    }

    await supabase.from('di_knowledge_chunks').delete().eq('document_id', doc.id);
    const batchSize = 50;
    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize);
      const { error: chunkErr } = await supabase.from('di_knowledge_chunks').insert(
        batch.map((c) => ({
          id: c.id,
          company_id: companyId,
          document_id: c.document_id,
          chunk_index: c.chunk_index,
          page_number: c.page_number,
          page_start: c.page_start,
          page_end: c.page_end,
          extraction_method: c.extraction_method,
          paragraph_ref: c.paragraph_ref,
          code_reference: c.code_reference,
          content: c.content,
          section: c.section,
          subsection: c.subsection,
          table_reference: c.table_reference,
          figure_reference: c.figure_reference,
          source_verification_status: c.source_verification_status,
          token_estimate: Math.ceil(c.content.length / 4),
          embedding_json: c.embedding,
        }))
      );
      if (chunkErr) {
        updated.index_status = 'failed';
        updated.ingestion_status = 'failed';
        throw new Error(`di_knowledge_chunks insert failed: ${chunkErr.message}`);
      }
    }

    const verified = await verifyPersistedKnowledgeRows(updated.id);
    if (!verified.ok) {
      updated.index_status = 'failed';
      updated.ingestion_status = 'failed';
      throw new Error(`persistence verification failed: ${verified.error}`);
    }
    updated.chunk_count = verified.chunkCount;
    persistedToCloud = true;
  } else if (requireCloud) {
    updated.index_status = 'failed';
    updated.ingestion_status = 'failed';
    throw new Error(SUPABASE_PERSISTENCE_UNAVAILABLE);
  } else {
    // Demo / unit-test only — never a Production success path
    updated.index_status = 'indexed';
    updated.ingestion_status = 'indexed';
    updated.indexed_at = now;
    persistedToCloud = false;
  }

  // Mirror metadata locally only after successful cloud persist (or explicit demo mode)
  if (persistedToCloud || !isSupabaseConfigured) {
    const docs = readLocalDocs().filter((d) => d.id !== doc.id);
    docs.unshift(updated);
    writeLocalDocs(docs);
    const otherChunks = readLocalChunks().filter((c) => c.document_id !== doc.id);
    writeLocalChunks([...chunks, ...otherChunks]);
  }

  await completeIndexingJob(doc.id, persistedToCloud || !isSupabaseConfigured);
  return { doc: updated, chunks, persistedToCloud };
}

function looksLikeNfpa13_2025(input: {
  fileName: string;
  title: string;
  codes: string[];
}): boolean {
  return (
    /nfpa\s*-?\s*13/i.test(input.fileName) ||
    /nfpa\s*-?\s*13/i.test(input.title) ||
    input.codes.some((c) => /nfpa\s*-?\s*13/i.test(c))
  );
}

export class KnowledgePersistError extends Error {
  diagnostics: KnowledgeUploadDiagnostics;
  constructor(message: string, diagnostics: KnowledgeUploadDiagnostics) {
    super(message);
    this.name = 'KnowledgePersistError';
    this.diagnostics = diagnostics;
  }
}

export async function uploadAndIndexKnowledgeFile(input: {
  file: File;
  meta: Partial<DiKnowledgeDocument> & { title: string };
  companyId?: string | null;
  /** True when caller has an authenticated session (never a secret). */
  authenticated?: boolean;
  onUploadProgress?: (percent: number, bytesUploaded: number, bytesTotal: number) => void;
  onPhase?: (
    phase:
      | 'uploading'
      | 'upload_paused'
      | 'uploaded'
      | 'extracting'
      | 'chunking'
      | 'indexing'
      | 'indexed'
      | 'failed'
  ) => void;
  registerUploadHandle?: (handle: {
    pause: () => void;
    resume: () => void;
    abort: () => void;
  }) => void;
}): Promise<
  DiKnowledgeDocument & {
    persistedToCloud: boolean;
    diagnostics: KnowledgeUploadDiagnostics;
  }
> {
  // Free space before large uploads if legacy cache is bloated
  pruneKnowledgeLocalCache();

  const authenticated = Boolean(input.authenticated);
  const companyId = input.companyId || input.meta.company_id || null;
  const companyOk = Boolean(companyId && isUuid(companyId));

  const baseDiag = (): KnowledgeUploadDiagnostics =>
    buildKnowledgeUploadDiagnostics({
      authenticated,
      company_id_present: companyOk,
      handler_path:
        'DesignIntelligenceModule.onUpload → uploadAndIndexKnowledgeFile',
    });

  // Production / any live host: never succeed via session-memory alone
  if (!isSupabaseConfigured) {
    throw new KnowledgePersistError(
      SUPABASE_PERSISTENCE_UNAVAILABLE,
      buildKnowledgeUploadDiagnostics({
        ...baseDiag(),
        error: SUPABASE_PERSISTENCE_UNAVAILABLE,
      })
    );
  }

  if (!companyOk || !companyId) {
    throw new KnowledgePersistError(
      'Supabase persistence unavailable: authenticated company UUID required for Storage RLS',
      buildKnowledgeUploadDiagnostics({
        authenticated,
        company_id_present: false,
        error: 'company_uuid_missing',
      })
    );
  }

  const codes = input.meta.applicable_codes || [];
  const nfpa = looksLikeNfpa13_2025({
    fileName: input.file.name,
    title: input.meta.title,
    codes,
  });

  // NFPA 13 / code documents must use the Code Knowledge Storage ingest path
  if (nfpa) {
    const bytes = new Uint8Array(await input.file.arrayBuffer());
    const { uploadAndIngestCodeKnowledgeDocument } = await import(
      '@/lib/design-intelligence/code-knowledge/storage-ingestion'
    );
    const result = await uploadAndIngestCodeKnowledgeDocument({
      companyId,
      code: 'NFPA-13',
      edition: '2025',
      title: input.meta.title,
      fileName: input.file.name,
      mimeType: input.file.type || 'application/pdf',
      bytes,
      file: input.file,
      source_document_id: `kb_upload:NFPA-13-2025:${input.file.name}`,
      source_type: 'PROJECT_PROVIDED_DOCUMENT',
      verification_status: 'PROJECT_COVER_IDENTIFIED',
      platform_verification_status: 'NOT_VERIFIED_OFFICIAL',
      adoption_status: 'PROJECT_ADOPTED',
      replaceIfChanged: true,
      onUploadProgress: input.onUploadProgress,
      onPhase: input.onPhase,
      registerUploadHandle: input.registerUploadHandle,
    });

    const diag = buildKnowledgeUploadDiagnostics({
      authenticated,
      company_id_present: true,
      storage_upload_attempted: true,
      db_insert_attempted: true,
      chunks_insert_attempted: true,
      storage_path: result.document.storage_path || null,
      document_id: result.document.id,
      chunk_count: result.document.chunk_count || 0,
      handler_path:
        'onUpload → uploadAndIndexKnowledgeFile → uploadAndIngestCodeKnowledgeDocument',
      error:
        result.status === 'failed'
          ? ('error' in result ? result.error : 'ingest_failed') || 'ingest_failed'
          : !result.document.persisted
            ? 'not_persisted'
            : null,
    });

    if (result.status === 'failed' || !result.document.persisted) {
      throw new KnowledgePersistError(
        diag.error || SUPABASE_PERSISTENCE_UNAVAILABLE,
        diag
      );
    }

    const d = result.document;
    const mapped: DiKnowledgeDocument & {
      persistedToCloud: boolean;
      diagnostics: KnowledgeUploadDiagnostics;
    } = {
      id: d.id,
      company_id: d.company_id,
      title: d.title,
      category: input.meta.category || 'NFPA',
      discipline: input.meta.discipline || 'Fire Protection',
      status: 'active',
      file_name: d.file_name,
      file_mime: d.file_mime || d.mime_type,
      mime_type: d.mime_type || d.file_mime,
      file_size_bytes: d.file_size_bytes,
      storage_bucket: d.storage_bucket || BUCKET,
      storage_path: d.storage_path,
      source_kind: 'upload',
      index_status: 'indexed',
      indexed_at: d.indexed_at,
      chunk_count: d.chunk_count,
      ocr_used: d.ocr_used,
      sha256: d.sha256,
      content_sha256: d.content_sha256,
      page_count: d.page_count,
      pages_extracted: d.pages_extracted,
      pages_ocr: d.pages_ocr,
      ingestion_status: d.ingestion_status,
      extraction_status: d.extraction_status,
      extract_status: d.extract_status,
      ocr_status: d.ocr_status,
      embedding_status: d.embedding_status,
      last_ingestion_at: d.last_ingestion_at,
      code: 'NFPA-13',
      edition: '2025',
      source_type: 'PROJECT_PROVIDED_DOCUMENT',
      platform_verification_status: 'NOT_VERIFIED_OFFICIAL',
      applicable_codes: codes.length ? codes : ['NFPA 13'],
      created_at: d.created_at,
      updated_at: d.updated_at,
      persistedToCloud: true,
      diagnostics: diag,
    };

    const docs = readLocalDocs().filter((x) => x.id !== mapped.id);
    docs.unshift(mapped);
    writeLocalDocs(docs);

    return mapped;
  }

  const id = newKnowledgeDocumentId();
  const bytes = new Uint8Array(await input.file.arrayBuffer());
  const sha256 = await sha256HexFromBytes(bytes);
  let extracted: Awaited<ReturnType<typeof extractTextFromFile>>;
  try {
    extracted = await extractTextFromFile(input.file);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new KnowledgePersistError(
      message.startsWith('pdf_extraction_failed')
        ? `FAILED: ${message}`
        : `FAILED: pdf_extraction_failed: ${message}`,
      buildKnowledgeUploadDiagnostics({
        authenticated,
        company_id_present: true,
        storage_upload_attempted: false,
        db_insert_attempted: false,
        chunks_insert_attempted: false,
        document_id: id,
        error: message,
        handler_path:
          'onUpload → uploadAndIndexKnowledgeFile → extractTextFromFile',
      })
    );
  }
  const storage = await tryUploadToStorage({
    file: input.file,
    docId: id,
    companyId,
  });

  if (!storage.path) {
    throw new KnowledgePersistError(
      `Storage upload failed: ${storage.error || 'no_path'} — no local indexed fallback`,
      buildKnowledgeUploadDiagnostics({
        authenticated,
        company_id_present: true,
        storage_upload_attempted: true,
        db_insert_attempted: false,
        chunks_insert_attempted: false,
        document_id: id,
        error: storage.error || 'storage_upload_failed',
        handler_path:
          'onUpload → uploadAndIndexKnowledgeFile → design-knowledge Storage',
      })
    );
  }

  const draft: DiKnowledgeDocument = {
    id,
    company_id: companyId,
    title: input.meta.title,
    category: input.meta.category || KNOWLEDGE_CATEGORIES[0],
    discipline: input.meta.discipline || 'Fire Protection',
    revision: input.meta.revision || 'A',
    issue_date: input.meta.issue_date || new Date().toISOString().slice(0, 10),
    author_name: input.meta.author_name || '',
    version_label: input.meta.version_label || '1.0',
    version_no: input.meta.version_no || 1,
    parent_document_id: input.meta.parent_document_id || null,
    tags: input.meta.tags || [],
    keywords: input.meta.keywords || [],
    project_type: input.meta.project_type || '',
    building_type: input.meta.building_type || '',
    hazard_classification: input.meta.hazard_classification || '',
    applicable_codes: codes,
    status: 'active',
    notes: input.meta.notes || '',
    file_name: input.file.name,
    file_mime: input.file.type,
    mime_type: input.file.type || null,
    file_size_bytes: input.file.size,
    storage_bucket: storage.bucket || BUCKET,
    storage_path: storage.path,
    data_url: null,
    source_kind: 'upload',
    index_status: 'processing',
    ingestion_status: 'uploaded',
    chunk_count: 0,
    ocr_used: extracted.ocrUsed,
    sha256,
    content_sha256: sha256,
    page_count: extracted.page_count ?? null,
    pages_extracted: extracted.pages_extracted ?? null,
    pages_ocr: extracted.pages_ocr ?? null,
    code: input.meta.code || null,
    edition: input.meta.edition || null,
    source_type: input.meta.source_type || 'upload',
    platform_verification_status: input.meta.platform_verification_status || null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  // 1) Document row MUST exist before indexing job (FK + correct error surfacing)
  const stub = await upsertKnowledgeDocumentStub(draft);
  if (!stub.ok) {
    throw new KnowledgePersistError(
      `document_insert_failed: ${stub.error || 'unknown'}`,
      buildKnowledgeUploadDiagnostics({
        authenticated,
        company_id_present: true,
        storage_upload_attempted: true,
        db_insert_attempted: true,
        chunks_insert_attempted: false,
        storage_path: storage.path,
        document_id: id,
        error: stub.error || 'document_insert_failed',
        handler_path:
          'onUpload → uploadAndIndexKnowledgeFile → di_knowledge_documents stub',
      })
    );
  }

  // 2) Indexing job with real UUID (never job-*)
  const queued = await enqueueIndexingJob({
    documentId: id,
    jobType: 'index',
    companyId,
  });
  if (!queued.ok) {
    throw new KnowledgePersistError(
      queued.error || 'FAILED: indexing_job_create_failed',
      buildKnowledgeUploadDiagnostics({
        authenticated,
        company_id_present: true,
        storage_upload_attempted: true,
        db_insert_attempted: true,
        chunks_insert_attempted: false,
        storage_path: storage.path,
        document_id: id,
        error: queued.error || 'indexing_job_create_failed',
        handler_path:
          'onUpload → uploadAndIndexKnowledgeFile → di_indexing_jobs',
      })
    );
  }

  try {
    draft.ingestion_status = 'extracting';
    const { doc, persistedToCloud } = await indexDocumentText(
      draft,
      extracted.text,
      extracted.ocrUsed,
      {
        page_count: extracted.page_count,
        pages_extracted: extracted.pages_extracted,
        pages_ocr: extracted.pages_ocr,
        page_texts: extracted.page_texts,
        extraction_method: extracted.extraction_method,
        sha256,
      },
      { requireCloudPersist: true }
    );

    if (!persistedToCloud) {
      await completeIndexingJob(id, false, SUPABASE_PERSISTENCE_UNAVAILABLE, queued.job.id);
      throw new KnowledgePersistError(
        SUPABASE_PERSISTENCE_UNAVAILABLE,
        buildKnowledgeUploadDiagnostics({
          authenticated,
          company_id_present: true,
          storage_upload_attempted: true,
          db_insert_attempted: true,
          chunks_insert_attempted: true,
          storage_path: storage.path,
          document_id: id,
          error: SUPABASE_PERSISTENCE_UNAVAILABLE,
        })
      );
    }

    await completeIndexingJob(id, true, undefined, queued.job.id);

    const diagnostics = buildKnowledgeUploadDiagnostics({
      authenticated,
      company_id_present: true,
      storage_upload_attempted: true,
      db_insert_attempted: true,
      chunks_insert_attempted: true,
      storage_path: doc.storage_path || storage.path,
      document_id: doc.id,
      chunk_count: doc.chunk_count || 0,
      handler_path:
        'onUpload → uploadAndIndexKnowledgeFile → Storage + di_knowledge_documents/chunks',
    });

    void import('@/lib/activity/logger').then(({ logActivity }) =>
      logActivity({
        actionType: 'CREATE',
        module: 'design',
        details: `Knowledge document indexed: ${doc.title}`,
        metadata: {
          documentId: doc.id,
          chunkCount: doc.chunk_count,
          category: doc.category,
          ocrUsed: doc.ocr_used,
          pageCount: doc.page_count,
          pagesExtracted: doc.pages_extracted,
          persistedToCloud,
          storagePath: doc.storage_path,
          sha256: doc.sha256,
          indexingJobId: queued.job.id,
        },
      })
    );

    return { ...doc, persistedToCloud: true, diagnostics };
  } catch (err) {
    if (err instanceof KnowledgePersistError) {
      await completeIndexingJob(id, false, err.message, queued.job.id);
      throw err;
    }
    const msg = err instanceof Error ? err.message : String(err);
    // Prefer real upstream failure over generic chunks_missing when job/doc failed earlier
    const primary =
      /pdf_extraction_failed/i.test(msg)
        ? msg.startsWith('FAILED:')
          ? msg
          : `FAILED: ${msg}`
        : /indexing_job_create_failed/i.test(msg)
          ? msg
          : /invalid input syntax for type uuid/i.test(msg)
            ? `indexing_job_create_failed: ${msg}`
            : msg;
    await completeIndexingJob(id, false, primary, queued.job.id);
    throw new KnowledgePersistError(
      primary,
      buildKnowledgeUploadDiagnostics({
        authenticated,
        company_id_present: true,
        storage_upload_attempted: true,
        db_insert_attempted: true,
        chunks_insert_attempted: true,
        storage_path: storage.path,
        document_id: id,
        error: primary,
      })
    );
  }
}

/**
 * Re-ingest an existing knowledge document from its private Storage object.
 * Does NOT create a new document row. Replaces chunks for the same document_id.
 */
export async function reingestKnowledgeDocumentFromStorage(
  documentId: string
): Promise<{
  ok: boolean;
  doc?: DiKnowledgeDocument;
  chunks_before: number;
  chunks_after: number;
  page_count?: number | null;
  error?: string;
}> {
  const existing =
    readLocalDocs().find((d) => d.id === documentId) ||
    (await listKnowledgeDocuments()).find((d) => d.id === documentId);
  if (!existing) {
    return { ok: false, chunks_before: 0, chunks_after: 0, error: 'document_missing' };
  }
  if (!existing.storage_path) {
    return {
      ok: false,
      chunks_before: existing.chunk_count || 0,
      chunks_after: existing.chunk_count || 0,
      error: 'storage_path_missing',
    };
  }

  const chunks_before =
    readLocalChunks().filter((c) => c.document_id === documentId).length ||
    existing.chunk_count ||
    0;

  if (isDemoMode) {
    return {
      ok: false,
      chunks_before,
      chunks_after: chunks_before,
      error: 'supabase_not_configured',
    };
  }

  const bucket = existing.storage_bucket || CODE_KNOWLEDGE_STORAGE_BUCKET;
  const { data, error } = await supabase.storage.from(bucket).download(existing.storage_path);
  if (error || !data) {
    return {
      ok: false,
      chunks_before,
      chunks_after: chunks_before,
      error: error?.message || 'storage_download_failed',
    };
  }

  const bytes = new Uint8Array(await data.arrayBuffer());
  const sha256 = await sha256HexFromBytes(bytes);
  const file = new File([bytes], existing.file_name || 'document.pdf', {
    type: existing.file_mime || existing.mime_type || 'application/pdf',
  });
  const extracted = await extractTextFromFile(file);

  existing.ingestion_status = 'extracting';
  existing.ingestion_version = (existing.ingestion_version || 1) + 1;
  const { doc, chunks } = await indexDocumentText(existing, extracted.text, extracted.ocrUsed, {
    page_count: extracted.page_count,
    pages_extracted: extracted.pages_extracted,
    pages_ocr: extracted.pages_ocr,
    page_texts: extracted.page_texts,
    extraction_method: extracted.extraction_method,
    sha256,
  });

  return {
    ok: true,
    doc,
    chunks_before,
    chunks_after: chunks.length,
    page_count: doc.page_count,
  };
}

const CONFIDENCE_FLOOR = 0.18;

export async function ragQuery(
  question: string,
  topK = 5,
  opts?: { companyId?: string | null }
): Promise<RagAnswer> {
  ensureSeedKnowledgeBase();
  const q = question.trim();
  if (!q) {
    return {
      answer: 'No reliable reference found.',
      citations: [],
      confidence: 0,
      reliable: false,
      message: 'Empty question',
    };
  }

  let chunks = readLocalChunks();
  if (!isDemoMode) {
    let query = supabase.from('di_knowledge_chunks').select('*').limit(2000);
    if (opts?.companyId) {
      query = query.eq('company_id', opts.companyId);
    } else {
      // Fail closed without tenant — do not return cross-tenant chunks
      chunks = [];
    }
    if (opts?.companyId) {
      const { data } = await query;
      if (data?.length) {
        const remote = data.map((row) => ({
          id: row.id,
          document_id: row.document_id,
          chunk_index: row.chunk_index,
          page_number: row.page_number,
          paragraph_ref: row.paragraph_ref,
          code_reference: row.code_reference,
          content: row.content,
          embedding: (row.embedding_json as number[]) || undefined,
          document_title: undefined as string | undefined,
        }));
        const localOnly = chunks.filter((c) => !remote.some((r) => r.id === c.id));
        chunks = [...remote, ...localOnly];
        memoryChunks = chunks;
      }
    }
  }

  const docs = readLocalDocs();
  const qVec = embedText(q);
  const scored = chunks
    .map((chunk) => {
      const emb = chunk.embedding?.length ? chunk.embedding : embedText(chunk.content);
      const sim = cosineSimilarity(qVec, emb);
      return { chunk, sim };
    })
    .sort((a, b) => b.sim - a.sim)
    .slice(0, topK);

  const best = scored[0]?.sim ?? 0;
  if (best < CONFIDENCE_FLOOR || !scored.length) {
    return {
      answer: 'No reliable reference found.',
      citations: [],
      confidence: Math.round(best * 100),
      reliable: false,
      message: 'No reliable reference found.',
    };
  }

  const citations: RagCitation[] = scored.map(({ chunk, sim }) => {
    const doc = docs.find((d) => d.id === chunk.document_id);
    return {
      documentId: chunk.document_id,
      documentTitle: chunk.document_title || doc?.title || 'Document',
      pageNumber: chunk.page_number ?? null,
      paragraph: chunk.content.slice(0, 420),
      codeReference: chunk.code_reference || doc?.applicable_codes?.[0] || null,
      confidence: Math.round(sim * 100),
      chunkId: chunk.id,
    };
  });

  const top = citations[0];
  const answer = [
    `Based on indexed company knowledge (offline RAG):`,
    '',
    top.paragraph,
    '',
    `Reference: ${top.documentTitle}${top.pageNumber != null ? ` · p.${top.pageNumber}` : ''}${
      top.codeReference ? ` · ${top.codeReference}` : ''
    }`,
    `Confidence: ${top.confidence}%`,
  ].join('\n');

  return {
    answer,
    citations,
    confidence: top.confidence,
    reliable: true,
  };
}

export function knowledgeCategories(): readonly string[] {
  return KNOWLEDGE_CATEGORIES;
}
