import type { SupabaseClient } from '@supabase/supabase-js';
import { EKB_TOPICS } from '@/lib/compliance/ekb-catalog';
import { cosineSimilarity, embedText, chunkText, extractTextFromFile, normalizeKnowledgeSearchText } from '@/lib/design-intelligence/embeddings';
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
import { detectSourceRefsFromText, toPgInt4, toSafePageNumber } from '@/lib/design-intelligence/code-knowledge/source-refs';
import { sha256HexFromBytes } from '@/lib/design-intelligence/code-knowledge/sha256';
import {
  CODE_KNOWLEDGE_STORAGE_BUCKET,
  sanitizeKnowledgeFileName,
} from '@/lib/design-intelligence/code-knowledge/storage-path';
import {
  isUuid,
  newKnowledgeChunkId,
  newKnowledgeDocumentId,
  updatePersistedCodeKnowledgeDocumentMetadata,
} from '@/lib/design-intelligence/code-knowledge/persist';

import {
  createReingestTimer,
  logReingest,
  sanitizeReingestErrorMessage,
} from '@/lib/design-intelligence/reingest-log';

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

/**
 * Production-supabase: return tenant-scoped Supabase rows only.
 * Do not merge stale localStorage/session docs (e.g. old chunk_count) into the list.
 * Demo: seed + local/session memory.
 */
export async function listKnowledgeDocuments(options?: {
  companyId?: string | null;
}): Promise<DiKnowledgeDocument[]> {
  if (!isDemoMode && isSupabaseConfigured) {
    let query = supabase
      .from('di_knowledge_documents')
      .select('*')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(200);
    if (options?.companyId && isUuid(options.companyId)) {
      query = query.eq('company_id', options.companyId);
    }
    const { data, error } = await query;
    if (error) {
      // Never fall back to stale local chunk counts in production.
      return [];
    }
    const remote = ((data || []) as DiKnowledgeDocument[]).filter((d) => !d.deleted_at);
    // Replace in-memory cache with canonical remote rows only (no local merge).
    writeLocalDocs(remote);
    return remote;
  }

  ensureSeedKnowledgeBase();
  return readLocalDocs().filter((d) => !d.deleted_at);
}

/**
 * Pure helper for tests / UI: in production-supabase mode, persisted counts win
 * and local-only rows are dropped. Demo keeps local list.
 */
export function resolveKnowledgeDocumentsForUiMode(input: {
  productionSupabase: boolean;
  persistedDocuments: DiKnowledgeDocument[];
  localDocuments: DiKnowledgeDocument[];
}): DiKnowledgeDocument[] {
  if (input.productionSupabase) {
    return input.persistedDocuments;
  }
  return input.localDocuments;
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

async function verifyPersistedKnowledgeRows(
  documentId: string,
  client?: SupabaseClient
): Promise<{
  ok: boolean;
  chunkCount: number;
  error?: string;
}> {
  const db = client || supabase;
  const { data: doc, error: docErr } = await db
    .from('di_knowledge_documents')
    .select('id, index_status, chunk_count')
    .eq('id', documentId)
    .is('deleted_at', null)
    .maybeSingle();
  if (docErr) return { ok: false, chunkCount: 0, error: docErr.message };
  if (!doc) return { ok: false, chunkCount: 0, error: 'db_document_missing' };

  const { count, error: chunkErr } = await db
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
    /** Optional user-scoped / server client so RLS applies (never browser service role). */
    client?: SupabaseClient;
    /** Optional structured reingest stage logger context (safe metadata only). */
    reingestTrace?: {
      documentId: string;
      companyId?: string | null;
      elapsedMs: () => number;
    };
  }
): Promise<{ doc: DiKnowledgeDocument; chunks: DiKnowledgeChunk[]; persistedToCloud: boolean }> {
  const requireCloud = Boolean(opts?.requireCloudPersist) || isSupabaseConfigured;
  const db = opts?.client || supabase;
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
          const safePage = toSafePageNumber(
            refs.page_number ?? part.page_start,
            toSafePageNumber(part.page_start, 1)
          );
          return {
            id: useUuidIds ? newKnowledgeChunkId() : uid('chk'),
            document_id: doc.id,
            company_id: doc.company_id ?? null,
            chunk_index: toPgInt4(part.index, 0) ?? 0,
            page_number: safePage,
            page_start: toSafePageNumber(part.page_start, safePage),
            page_end: toSafePageNumber(part.page_end, safePage),
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

    const { error: docErr } = await db.from('di_knowledge_documents').upsert({
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
      ingestion_version: updated.ingestion_version ?? null,
      extraction_status: updated.extraction_status,
      extract_status: updated.extract_status,
      ocr_status: updated.ocr_status,
      embedding_status: updated.embedding_status,
      last_ingestion_at: updated.last_ingestion_at,
      code: updated.code,
      edition: updated.edition,
      source_type: updated.source_type,
      verification_status: updated.verification_status ?? null,
      platform_verification_status: updated.platform_verification_status,
      updated_at: updated.updated_at,
      created_at: updated.created_at || now,
    });
    if (docErr) {
      updated.index_status = 'failed';
      updated.ingestion_status = 'failed';
      throw new Error(`di_knowledge_documents insert failed: ${docErr.message}`);
    }

    const trace = opts?.reingestTrace;
    if (trace) {
      logReingest({
        stage: 'OLD_CHUNKS_DELETE_START',
        documentId: trace.documentId,
        companyId: trace.companyId,
        chunkCount: chunks.length,
        elapsedMs: trace.elapsedMs(),
      });
    }
    await db.from('di_knowledge_chunks').delete().eq('document_id', doc.id);
    if (trace) {
      logReingest({
        stage: 'OLD_CHUNKS_DELETE_OK',
        documentId: trace.documentId,
        companyId: trace.companyId,
        elapsedMs: trace.elapsedMs(),
      });
    }
    const batchSize = 50;
    const batchTotal = Math.ceil(chunks.length / batchSize) || 0;
    if (trace) {
      logReingest({
        stage: 'CHUNK_INSERT_START',
        documentId: trace.documentId,
        companyId: trace.companyId,
        chunkCount: chunks.length,
        batchTotal,
        elapsedMs: trace.elapsedMs(),
      });
    }
    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize);
      const batchIndex = Math.floor(i / batchSize) + 1;
      const { error: chunkErr } = await db.from('di_knowledge_chunks').insert(
        batch.map((c) => ({
          id: c.id,
          company_id: companyId,
          document_id: c.document_id,
          chunk_index: toPgInt4(c.chunk_index, 0) ?? 0,
          page_number: toSafePageNumber(c.page_number ?? c.page_start, null),
          page_start: toSafePageNumber(c.page_start, null),
          page_end: toSafePageNumber(c.page_end, null),
          extraction_method: c.extraction_method,
          paragraph_ref: c.paragraph_ref,
          code_reference: c.code_reference,
          content: c.content,
          section: c.section,
          subsection: c.subsection,
          table_reference: c.table_reference,
          figure_reference: c.figure_reference,
          source_verification_status: c.source_verification_status,
          token_estimate: toPgInt4(Math.ceil(c.content.length / 4), 0),
          embedding_json: c.embedding,
        }))
      );
      if (chunkErr) {
        updated.index_status = 'failed';
        updated.ingestion_status = 'failed';
        throw new Error(`di_knowledge_chunks insert failed: ${chunkErr.message}`);
      }
      if (trace) {
        logReingest({
          stage: 'CHUNK_INSERT_PROGRESS',
          documentId: trace.documentId,
          companyId: trace.companyId,
          chunkCount: Math.min(i + batchSize, chunks.length),
          batchIndex,
          batchTotal,
          elapsedMs: trace.elapsedMs(),
        });
      }
    }
    if (trace) {
      logReingest({
        stage: 'CHUNK_INSERT_OK',
        documentId: trace.documentId,
        companyId: trace.companyId,
        chunkCount: chunks.length,
        elapsedMs: trace.elapsedMs(),
      });
    }

    const verified = await verifyPersistedKnowledgeRows(updated.id, db);
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
    const { shouldUseResumableUpload } = await import(
      '@/lib/design-intelligence/code-knowledge/resumable-upload'
    );
    const { uploadAndIngestCodeKnowledgeDocument } = await import(
      '@/lib/design-intelligence/code-knowledge/storage-ingestion'
    );
    const large = shouldUseResumableUpload(input.file.size);
    // Large: do not arrayBuffer() before TUS (Safari/iPhone memory).
    const bytes = large ? null : new Uint8Array(await input.file.arrayBuffer());
    const resumeKey = `ck-resume:${companyId}:NFPA-13:2025:${input.file.name}:${input.file.size}:${input.file.lastModified}`;
    let resumeDocumentId: string | null = null;
    try {
      resumeDocumentId =
        typeof sessionStorage !== 'undefined'
          ? sessionStorage.getItem(resumeKey)
          : null;
    } catch {
      resumeDocumentId = null;
    }
    if (!resumeDocumentId) {
      resumeDocumentId =
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : `00000000-0000-4000-8000-${Date.now().toString(16).padStart(12, '0').slice(-12)}`;
      try {
        sessionStorage.setItem(resumeKey, resumeDocumentId);
      } catch {
        /* ignore */
      }
    }

    const result = await uploadAndIngestCodeKnowledgeDocument({
      companyId,
      code: 'NFPA-13',
      edition: '2025',
      title: input.meta.title,
      fileName: input.file.name,
      mimeType: input.file.type || 'application/pdf',
      bytes,
      file: input.file,
      resumeDocumentId,
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

    if (
      (result.status === 'skipped_duplicate' || result.status === 'indexed') &&
      result.document.persisted
    ) {
      try {
        sessionStorage.removeItem(resumeKey);
      } catch {
        /* ignore */
      }
    }

    if (result.status === 'skipped_duplicate' && result.document.persisted) {
      const metadataUpdate = await updatePersistedCodeKnowledgeDocumentMetadata({
        companyId,
        documentId: result.document.id,
        title: input.meta.title,
        category: input.meta.category ?? 'NFPA',
        discipline: input.meta.discipline ?? 'Fire Protection',
        revision: input.meta.revision,
        issueDate: input.meta.issue_date,
        authorName: input.meta.author_name,
        versionLabel: input.meta.version_label,
        versionNo: input.meta.version_no,
        tags: input.meta.tags,
        keywords: input.meta.keywords,
        projectType: input.meta.project_type,
        buildingType: input.meta.building_type,
        hazardClassification: input.meta.hazard_classification,
        applicableCodes: input.meta.applicable_codes,
        notes: input.meta.notes,
      });
      if (!metadataUpdate.ok) {
        throw new KnowledgePersistError(
          `duplicate_metadata_update_failed: ${metadataUpdate.error || 'unknown_error'}`,
          buildKnowledgeUploadDiagnostics({
            authenticated,
            company_id_present: true,
            storage_upload_attempted: false,
            db_insert_attempted: false,
            chunks_insert_attempted: false,
            storage_path: result.document.storage_path || null,
            document_id: result.document.id,
            chunk_count: result.document.chunk_count || 0,
            handler_path:
              'onUpload → uploadAndIndexKnowledgeFile → duplicate metadata update',
            error: metadataUpdate.error || 'duplicate_metadata_update_failed',
          })
        );
      }
    }

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
          : result.status === 'skipped_duplicate' && result.document.persisted
            ? null
            : !result.document.persisted
              ? 'not_persisted'
              : null,
    });

    if (
      result.status === 'failed' ||
      (result.status !== 'skipped_duplicate' && !result.document.persisted) ||
      (result.status === 'skipped_duplicate' && !result.document.persisted)
    ) {
      throw new KnowledgePersistError(
        diag.error || SUPABASE_PERSISTENCE_UNAVAILABLE,
        diag
      );
    }

    const d = {
      ...result.document,
      ...(result.status === 'skipped_duplicate'
        ? {
            title: input.meta.title,
            category: input.meta.category || 'NFPA',
            discipline: input.meta.discipline || 'Fire Protection',
            revision: input.meta.revision || null,
            issue_date: input.meta.issue_date || null,
            author_name: input.meta.author_name || null,
            version_label: input.meta.version_label || null,
            version_no: input.meta.version_no,
            tags: input.meta.tags || [],
            keywords: input.meta.keywords || [],
            project_type: input.meta.project_type || null,
            building_type: input.meta.building_type || null,
            hazard_classification: input.meta.hazard_classification || null,
            applicable_codes: input.meta.applicable_codes || (codes.length ? codes : ['NFPA 13']),
            notes: input.meta.notes || null,
          }
        : {}),
    };
    const mapped: DiKnowledgeDocument & {
      persistedToCloud: boolean;
      diagnostics: KnowledgeUploadDiagnostics;
    } = {
      id: d.id,
      company_id: d.company_id,
      title: d.title,
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
      source_type: input.meta.source_kind || 'PROJECT_PROVIDED_DOCUMENT',
      platform_verification_status: input.meta.platform_verification_status || 'NOT_VERIFIED_OFFICIAL',
      applicable_codes: input.meta.applicable_codes || (codes.length ? codes : ['NFPA 13']),
      category: input.meta.category || 'NFPA',
      discipline: input.meta.discipline || 'Fire Protection',
      revision: input.meta.revision || null,
      issue_date: input.meta.issue_date || null,
      author_name: input.meta.author_name || null,
      version_label: input.meta.version_label || null,
      version_no: input.meta.version_no,
      tags: input.meta.tags || [],
      keywords: input.meta.keywords || [],
      project_type: input.meta.project_type || null,
      building_type: input.meta.building_type || null,
      hazard_classification: input.meta.hazard_classification || null,
      notes: input.meta.notes || null,
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
 *
 * Pass `companyId` (and preferably a user-scoped `client`) from authenticated
 * server routes so tenant isolation is enforced before any Storage/DB write.
 */
export async function reingestKnowledgeDocumentFromStorage(
  documentId: string,
  opts?: {
    companyId?: string | null;
    client?: SupabaseClient;
  }
): Promise<{
  ok: boolean;
  doc?: DiKnowledgeDocument;
  chunks_before: number;
  chunks_after: number;
  page_count?: number | null;
  error?: string;
}> {
  if (!isUuid(documentId)) {
    return { ok: false, chunks_before: 0, chunks_after: 0, error: 'invalid_document_id' };
  }

  const db = opts?.client || supabase;
  const companyId = opts?.companyId && isUuid(opts.companyId) ? opts.companyId : null;
  const timer = createReingestTimer();
  logReingest({
    stage: 'REINGEST_START',
    documentId,
    companyId,
    elapsedMs: timer.elapsedMs(),
  });

  let existing: DiKnowledgeDocument | undefined;

  if (!isDemoMode && companyId) {
    const { data, error } = await db
      .from('di_knowledge_documents')
      .select('*')
      .eq('id', documentId)
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .maybeSingle();
    if (error) {
      return { ok: false, chunks_before: 0, chunks_after: 0, error: error.message };
    }
    existing = (data as DiKnowledgeDocument | null) || undefined;
  } else {
    existing =
      readLocalDocs().find((d) => d.id === documentId) ||
      (await listKnowledgeDocuments(companyId ? { companyId } : undefined)).find(
        (d) => d.id === documentId
      );
  }

  if (!existing || existing.deleted_at) {
    return { ok: false, chunks_before: 0, chunks_after: 0, error: 'document_missing' };
  }

  if (companyId && existing.company_id && existing.company_id !== companyId) {
    return { ok: false, chunks_before: 0, chunks_after: 0, error: 'company_mismatch' };
  }
  if (companyId && !existing.company_id) {
    return { ok: false, chunks_before: 0, chunks_after: 0, error: 'company_mismatch' };
  }

  if (!existing.storage_path) {
    return {
      ok: false,
      chunks_before: existing.chunk_count || 0,
      chunks_after: existing.chunk_count || 0,
      error: 'storage_path_missing',
    };
  }

  logReingest({
    stage: 'DOCUMENT_LOADED',
    documentId,
    companyId,
    pageCount: existing.page_count ?? null,
    chunkCount: existing.chunk_count ?? null,
    elapsedMs: timer.elapsedMs(),
  });

  // Record original counts before any write
  let chunks_before = existing.chunk_count || 0;
  if (!isDemoMode && companyId) {
    const { count } = await db
      .from('di_knowledge_chunks')
      .select('id', { count: 'exact', head: true })
      .eq('document_id', documentId)
      .eq('company_id', companyId);
    if (typeof count === 'number') chunks_before = count;
  } else {
    const localCount = readLocalChunks().filter((c) => c.document_id === documentId).length;
    if (localCount) chunks_before = localCount;
  }

  if (isDemoMode) {
    return {
      ok: false,
      chunks_before,
      chunks_after: chunks_before,
      error: 'supabase_not_configured',
    };
  }

  const bucket = existing.storage_bucket || CODE_KNOWLEDGE_STORAGE_BUCKET;
  logReingest({
    stage: 'STORAGE_DOWNLOAD_START',
    documentId,
    companyId,
    chunksBefore: chunks_before,
    elapsedMs: timer.elapsedMs(),
  });
  const { data, error } = await db.storage.from(bucket).download(existing.storage_path);
  if (error || !data) {
    logReingest({
      stage: 'REINGEST_FAILED',
      documentId,
      companyId,
      chunksBefore: chunks_before,
      error: error?.message || 'storage_download_failed',
      errorCode: 'storage_download_failed',
      elapsedMs: timer.elapsedMs(),
    });
    return {
      ok: false,
      chunks_before,
      chunks_after: chunks_before,
      error: error?.message || 'storage_download_failed',
    };
  }
  logReingest({
    stage: 'STORAGE_DOWNLOAD_OK',
    documentId,
    companyId,
    elapsedMs: timer.elapsedMs(),
  });

  // Preserve identity + verification metadata; only bump ingestion_version
  const preserved: DiKnowledgeDocument = {
    ...existing,
    company_id: existing.company_id || companyId,
    code: existing.code,
    edition: existing.edition,
    storage_path: existing.storage_path,
    storage_bucket: existing.storage_bucket,
    platform_verification_status: existing.platform_verification_status,
    verification_status: existing.verification_status,
    source_type: existing.source_type,
    source_document_id: existing.source_document_id,
    ingestion_status: 'extracting',
    ingestion_version: (existing.ingestion_version || 1) + 1,
  };

  try {
    const bytes = new Uint8Array(await data.arrayBuffer());
    const sha256 = await sha256HexFromBytes(bytes);
    const file = new File([bytes], preserved.file_name || 'document.pdf', {
      type: preserved.file_mime || preserved.mime_type || 'application/pdf',
    });
    logReingest({
      stage: 'PDF_EXTRACT_START',
      documentId,
      companyId,
      elapsedMs: timer.elapsedMs(),
    });
    const extracted = await extractTextFromFile(file);
    logReingest({
      stage: 'PDF_EXTRACT_OK',
      documentId,
      companyId,
      pageCount: extracted.page_count ?? null,
      elapsedMs: timer.elapsedMs(),
    });

    logReingest({
      stage: 'CHUNK_BUILD_START',
      documentId,
      companyId,
      pageCount: extracted.page_count ?? null,
      elapsedMs: timer.elapsedMs(),
    });
    const { doc, chunks } = await indexDocumentText(
      preserved,
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
      {
        client: opts?.client,
        requireCloudPersist: true,
        reingestTrace: {
          documentId,
          companyId,
          elapsedMs: () => timer.elapsedMs(),
        },
      }
    );
    logReingest({
      stage: 'CHUNK_BUILD_OK',
      documentId,
      companyId,
      pageCount: doc.page_count ?? null,
      chunkCount: chunks.length,
      elapsedMs: timer.elapsedMs(),
    });
    logReingest({
      stage: 'DOCUMENT_UPDATE_OK',
      documentId,
      companyId,
      pageCount: doc.page_count ?? null,
      chunkCount: chunks.length,
      chunksBefore: chunks_before,
      chunksAfter: chunks.length,
      elapsedMs: timer.elapsedMs(),
    });
    logReingest({
      stage: 'REINGEST_DONE',
      documentId,
      companyId,
      pageCount: doc.page_count ?? null,
      chunkCount: chunks.length,
      chunksBefore: chunks_before,
      chunksAfter: chunks.length,
      elapsedMs: timer.elapsedMs(),
    });

    return {
      ok: true,
      doc,
      chunks_before,
      chunks_after: chunks.length,
      page_count: doc.page_count,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logReingest({
      stage: 'REINGEST_FAILED',
      documentId,
      companyId,
      chunksBefore: chunks_before,
      error: sanitizeReingestErrorMessage(message),
      errorCode: 'reingest_failed',
      elapsedMs: timer.elapsedMs(),
    });
    // Do not leave as indexed if persistence failed — best-effort mark failed
    try {
      if (companyId || preserved.company_id) {
        let failQ = db
          .from('di_knowledge_documents')
          .update({
            index_status: 'failed',
            ingestion_status: 'failed',
            updated_at: new Date().toISOString(),
          })
          .eq('id', documentId);
        const tenant = companyId || preserved.company_id;
        if (tenant) failQ = failQ.eq('company_id', tenant);
        await failQ;
      }
    } catch {
      /* ignore secondary failure */
    }
    return {
      ok: false,
      chunks_before,
      chunks_after: chunks_before,
      error: message,
    };
  }
}

/** Below this score: no citations (NEEDS_DATA). */
export const MIN_RESULT_SCORE = 0.28;
/** At or above: reliable = true. Between MIN and this: weak / needs review. */
export const RELIABLE_SCORE = 0.45;

export type RagQueryOptions = {
  companyId?: string | null;
  codeFamilies?: string[];
  documentIds?: string[];
  projectId?: string | null;
  minimumConfidence?: number;
};

export type CodeFamily = 'NFPA' | 'SBC' | 'CIVIL_DEFENSE' | 'OTHER';

/** Infer requested code families from the user question (intent parsing). */
export function inferRequestedCodeFamilies(question: string): CodeFamily[] {
  const q = String(question || '');
  const families = new Set<CodeFamily>();
  if (/\bNFPA\b/i.test(q) || /نفبا/i.test(q)) families.add('NFPA');
  if (
    /\bSBC\b/i.test(q) ||
    /الكود\s*السعودي/i.test(q) ||
    /الكود السعودي للحماية من الحريق/i.test(q)
  ) {
    families.add('SBC');
  }
  if (/الدفاع\s*المدني/i.test(q) || /civil\s*defense/i.test(q)) {
    families.add('CIVIL_DEFENSE');
  }
  return [...families];
}

function detectChunkCodeFamilies(chunk: DiKnowledgeChunk, doc?: DiKnowledgeDocument | null): CodeFamily[] {
  const hay = [
    chunk.code,
    chunk.code_reference,
    chunk.content?.slice(0, 400),
    doc?.code,
    doc?.title,
    ...(doc?.applicable_codes || []),
  ]
    .filter(Boolean)
    .join(' ');
  const out = new Set<CodeFamily>();
  if (/\bNFPA\b/i.test(hay)) out.add('NFPA');
  if (/\bSBC\b/i.test(hay) || /سعودي/i.test(hay)) out.add('SBC');
  if (/دفاع\s*مدني|civil\s*defense/i.test(hay)) out.add('CIVIL_DEFENSE');
  if (!out.size) out.add('OTHER');
  return [...out];
}

function lexicalOverlapBoost(question: string, content: string): number {
  const qTokens = new Set(
    normalizeKnowledgeSearchText(question)
      .split(/\s+/)
      .filter((t) => t.length > 2)
  );
  if (!qTokens.size) return 0;
  const cNorm = normalizeKnowledgeSearchText(content);
  let hits = 0;
  for (const t of qTokens) {
    if (cNorm.includes(t)) hits += 1;
  }
  const ratio = hits / qTokens.size;
  return Math.min(0.1, 0.03 + ratio * 0.07);
}

function exactCodeBoost(question: string, chunk: DiKnowledgeChunk, doc?: DiKnowledgeDocument | null): number {
  const q = question.toUpperCase();
  const qCompact = q.replace(/[\s-]+/g, '');
  const refs = [chunk.code, chunk.code_reference, doc?.code, ...(doc?.applicable_codes || [])]
    .filter(Boolean)
    .map((s) => String(s).toUpperCase());
  for (const ref of refs) {
    const compact = ref.replace(/[\s-]+/g, '');
    if (compact.length >= 4 && qCompact.includes(compact)) return 0.15;
    if (/\bNFPA[\s-]?13\b/i.test(question) && /NFPA[\s-]?13/i.test(ref)) return 0.15;
    if (/\bSBC[\s-]?801\b/i.test(question) && /SBC[\s-]?801/i.test(ref)) return 0.15;
    // Family-level exact mention (question says NFPA, chunk is NFPA-*)
    if (/\bNFPA\b/i.test(question) && /^NFPA/.test(compact)) return 0.15;
    if (/\bSBC\b/i.test(question) && /^SBC/.test(compact)) return 0.15;
  }
  // Content-level exact family token
  const contentU = String(chunk.content || '').toUpperCase();
  if (/\bNFPA\b/i.test(question) && /\bNFPA\b/.test(contentU)) return 0.12;
  if (/\bSBC\b/i.test(question) && /\bSBC\b/.test(contentU)) return 0.12;
  return 0;
}

function titleBoost(question: string, title: string): number {
  if (!title) return 0;
  const qn = normalizeKnowledgeSearchText(question);
  const tn = normalizeKnowledgeSearchText(title);
  if (!tn) return 0;
  const parts = tn.split(/\s+/).filter((t) => t.length > 2);
  let hits = 0;
  for (const p of parts) {
    if (qn.includes(p)) hits += 1;
  }
  if (!parts.length) return 0;
  return Math.min(0.05, (hits / parts.length) * 0.05);
}

function clampScore(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function needsDataAnswer(message?: string): RagAnswer {
  return {
    answer: 'NEEDS_DATA',
    citations: [],
    confidence: 0,
    reliable: false,
    matchStrength: 'none',
    message: message || 'No sufficiently relevant indexed source was found.',
  };
}

export async function ragQuery(
  question: string,
  topK = 5,
  opts?: RagQueryOptions
): Promise<RagAnswer> {
  ensureSeedKnowledgeBase();
  const q = question.trim();
  if (!q) {
    return {
      answer: 'No reliable reference found.',
      citations: [],
      confidence: 0,
      reliable: false,
      matchStrength: 'none',
      message: 'Empty question',
    };
  }

  const requestedFamilies =
    opts?.codeFamilies?.length
      ? (opts.codeFamilies
          .map((f) => {
            const u = String(f).toUpperCase();
            if (u.startsWith('NFPA')) return 'NFPA' as CodeFamily;
            if (u.startsWith('SBC')) return 'SBC' as CodeFamily;
            if (u.includes('CIVIL') || u.includes('دفاع')) return 'CIVIL_DEFENSE' as CodeFamily;
            return null;
          })
          .filter(Boolean) as CodeFamily[])
      : inferRequestedCodeFamilies(q);

  const explicitFamily = requestedFamilies.filter((f) => f === 'NFPA' || f === 'SBC');
  const minScore = opts?.minimumConfidence ?? MIN_RESULT_SCORE;
  const docIdFilter =
    opts?.documentIds?.length
      ? new Set(opts.documentIds.map(String).filter(Boolean))
      : null;

  let chunks = readLocalChunks();
  let remoteDocsById = new Map<string, DiKnowledgeDocument>();

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
          id: row.id as string,
          document_id: row.document_id as string,
          chunk_index: row.chunk_index as number,
          page_number: (row.page_number as number | null) ?? null,
          page_start: (row.page_start as number | null) ?? null,
          page_end: (row.page_end as number | null) ?? null,
          paragraph_ref: (row.paragraph_ref as string | null) ?? null,
          code_reference: (row.code_reference as string | null) ?? null,
          content: row.content as string,
          embedding: (row.embedding_json as number[]) || undefined,
          document_title: undefined as string | undefined,
          company_id: (row.company_id as string | null) ?? null,
          code: (row.code as string | null) ?? null,
          edition: (row.edition as string | null) ?? null,
          section: (row.section as string | null) ?? null,
          subsection: (row.subsection as string | null) ?? null,
          table_reference: (row.table_reference as string | null) ?? null,
          figure_reference: (row.figure_reference as string | null) ?? null,
          paragraph_reference: (row.paragraph_reference as string | null) ?? null,
          source_document_id: (row.source_document_id as string | null) ?? null,
          source_verification_status: (row.source_verification_status as string | null) ?? null,
        })) as DiKnowledgeChunk[];
        const localOnly = chunks.filter((c) => !remote.some((r) => r.id === c.id));
        chunks = [...remote, ...localOnly];
        memoryChunks = chunks;

        const docIds = [...new Set(remote.map((r) => r.document_id).filter(Boolean))];
        if (docIds.length) {
          let docsQuery = supabase
            .from('di_knowledge_documents')
            .select(
              'id,title,code,edition,applicable_codes,platform_verification_status,verification_status,source_document_id,company_id'
            )
            .in('id', docIds.slice(0, 200));
          if (opts.companyId) {
            docsQuery = docsQuery.eq('company_id', opts.companyId);
          }
          const { data: docRows } = await docsQuery;
          for (const row of docRows || []) {
            remoteDocsById.set(row.id as string, {
              id: row.id as string,
              title: (row.title as string) || 'Document',
              status: 'active',
              index_status: 'indexed',
              code: (row.code as string | null) ?? null,
              edition: (row.edition as string | null) ?? null,
              applicable_codes: (row.applicable_codes as string[]) || [],
              platform_verification_status:
                (row.platform_verification_status as string | null) ?? null,
              verification_status: (row.verification_status as string | null) ?? null,
              source_document_id: (row.source_document_id as string | null) ?? null,
              company_id: (row.company_id as string | null) ?? null,
            });
          }
        }
      }
    }
  }

  if (docIdFilter) {
    chunks = chunks.filter((c) => docIdFilter.has(c.document_id));
  }

  // Tenant isolation for local/demo chunks when companyId is set
  if (opts?.companyId) {
    chunks = chunks.filter(
      (c) => !c.company_id || c.company_id === opts.companyId
    );
  }

  const docs = readLocalDocs();
  const resolveDoc = (documentId: string): DiKnowledgeDocument | undefined =>
    remoteDocsById.get(documentId) || docs.find((d) => d.id === documentId);

  const qVec = embedText(q);
  type Scored = { chunk: DiKnowledgeChunk; sim: number; finalScore: number; families: CodeFamily[] };
  const scoredAll: Scored[] = chunks.map((chunk) => {
    const doc = resolveDoc(chunk.document_id);
    const emb = chunk.embedding?.length ? chunk.embedding : embedText(chunk.content);
    const sim = cosineSimilarity(qVec, emb);
    const families = detectChunkCodeFamilies(chunk, doc);
    let score = sim;
    score += lexicalOverlapBoost(q, chunk.content);
    score += exactCodeBoost(q, chunk, doc);
    score += titleBoost(q, chunk.document_title || doc?.title || '');

    if (explicitFamily.length) {
      const matchesFamily = explicitFamily.some((f) => families.includes(f));
      if (matchesFamily) {
        score += 0.08;
      } else {
        // Wrong explicit family — strong penalty (may exclude below)
        score -= 0.2;
      }
    }

    return { chunk, sim, finalScore: clampScore(score), families };
  });

  scoredAll.sort((a, b) => b.finalScore - a.finalScore || b.sim - a.sim);

  // If explicit code family requested, prefer matching family; wrong-family-only → NEEDS_DATA
  let ranked = scoredAll;
  if (explicitFamily.length) {
    const matching = scoredAll.filter((s) =>
      explicitFamily.some((f) => s.families.includes(f))
    );
    const strongMatch = matching.filter((s) => s.finalScore >= minScore);
    if (strongMatch.length) {
      ranked = matching;
    } else if (matching.length === 0) {
      return needsDataAnswer(
        `No sufficiently relevant indexed source was found for ${explicitFamily.join('/')}.`
      );
    } else {
      // Matching family exists but all weak — still prefer them over wrong family
      ranked = matching;
    }
  }

  const scored = ranked.slice(0, topK);
  const best = scored[0]?.finalScore ?? 0;
  const second = scored[1]?.finalScore ?? 0;

  // Relevance-gap: all nearly random / weak
  if (!scored.length || best < minScore) {
    return {
      ...needsDataAnswer('No sufficiently relevant indexed source was found.'),
      confidence: Math.round(best * 100),
    };
  }

  // Top result wrong family after penalty still winning → NEEDS_DATA for explicit request
  if (explicitFamily.length && scored[0]) {
    const topOk = explicitFamily.some((f) => scored[0].families.includes(f));
    if (!topOk) {
      return needsDataAnswer(
        `No sufficiently relevant indexed source was found for ${explicitFamily.join('/')}.`
      );
    }
  }

  // Near-random cluster: best is weak and peers are within noise
  if (best < RELIABLE_SCORE && second > 0 && best - second < 0.02 && best < 0.35) {
    return {
      ...needsDataAnswer('No sufficiently relevant indexed source was found.'),
      confidence: Math.round(best * 100),
    };
  }

  const citations: RagCitation[] = scored.map(({ chunk, finalScore }) => {
    const doc = resolveDoc(chunk.document_id);
    const pageNumber =
      chunk.page_number ?? chunk.page_start ?? null;
    return {
      documentId: chunk.document_id,
      documentTitle: chunk.document_title || doc?.title || 'Document',
      pageNumber,
      paragraph: chunk.content.slice(0, 420),
      codeReference: chunk.code_reference || chunk.code || doc?.applicable_codes?.[0] || doc?.code || null,
      confidence: Math.round(finalScore * 100),
      chunkId: chunk.id,
      code: chunk.code ?? doc?.code ?? null,
      edition: chunk.edition ?? doc?.edition ?? null,
      section: chunk.section ?? null,
      subsection: chunk.subsection ?? null,
      tableReference: chunk.table_reference ?? null,
      figureReference: chunk.figure_reference ?? null,
      paragraphReference: chunk.paragraph_reference ?? chunk.paragraph_ref ?? null,
      sourceDocumentId: chunk.source_document_id ?? doc?.source_document_id ?? null,
      sourceVerificationStatus: chunk.source_verification_status ?? null,
      documentVerificationStatus: doc?.verification_status ?? null,
      platformVerificationStatus: doc?.platform_verification_status ?? null,
    };
  });

  const top = citations[0];
  const reliable = best >= RELIABLE_SCORE;
  const matchStrength: RagAnswer['matchStrength'] = reliable ? 'strong' : 'weak';

  const answer = reliable
    ? [
        `Based on indexed company knowledge (offline RAG):`,
        '',
        top.paragraph,
        '',
        `Reference: ${top.documentTitle}${top.pageNumber != null ? ` · p.${top.pageNumber}` : ''}${
          top.codeReference ? ` · ${top.codeReference}` : ''
        }`,
        `Confidence: ${top.confidence}%`,
      ].join('\n')
    : [
        'Weak match — engineer review required.',
        '',
        top.paragraph,
        '',
        `Indexed reference: ${top.documentTitle}${top.pageNumber != null ? ` · p.${top.pageNumber}` : ''}${
          top.codeReference ? ` · ${top.codeReference}` : ''
        }`,
        `Confidence: ${top.confidence}% (not reliable)`,
      ].join('\n');

  return {
    answer,
    citations,
    confidence: top.confidence,
    reliable,
    matchStrength,
    message: reliable
      ? undefined
      : 'مطابقة ضعيفة — تحتاج مراجعة',
  };
}

export function knowledgeCategories(): readonly string[] {
  return KNOWLEDGE_CATEGORIES;
}
