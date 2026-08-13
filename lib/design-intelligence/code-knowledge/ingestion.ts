/**
 * Document ingestion pipeline:
 * register → validate → extract → OCR → section detect → chunk → enrich → embed → index → READY
 *
 * Uses di_indexing_jobs conceptually (in-memory for tests). Idempotent. No uncontrolled loop.
 */

import { chunkText, embedText } from '@/lib/design-intelligence/embeddings';
import {
  getCodeKnowledgeStore,
  nowIso,
  uid,
} from '@/lib/design-intelligence/code-knowledge/store';
import { detectSourceRefsFromText } from '@/lib/design-intelligence/code-knowledge/source-refs';
import { registerCodeEdition } from '@/lib/design-intelligence/code-knowledge/registry';
import {
  chunkPagesPreserving,
  pagesFromPlainText,
} from '@/lib/design-intelligence/code-knowledge/pdf-page-extract';
import { CODE_KNOWLEDGE_STORAGE_BUCKET } from '@/lib/design-intelligence/code-knowledge/storage-path';
import type {
  CodeKnowledgeChunk,
  CodeKnowledgeDocumentMeta,
  PipelineJob,
  PipelineJobType,
} from '@/lib/design-intelligence/code-knowledge/types';

export type RegisterKnowledgeDocumentInput = {
  companyId: string;
  title: string;
  code: string;
  edition: string;
  /** Optional stable id (e.g. already used in Storage object path). */
  id?: string;
  version?: string | null;
  revision?: string | null;
  source_type?: string;
  adoption_status?: string;
  verification_status?: string;
  platform_verification_status?: string;
  source_document_id: string;
  file_name?: string | null;
  file_mime?: string | null;
  mime_type?: string | null;
  file_size_bytes?: number | null;
  storage_bucket?: string | null;
  storage_path?: string | null;
  sha256?: string | null;
  extracted_text?: string | null;
  parent_document_id?: string | null;
  created_by?: string | null;
  code_edition_id?: string | null;
  edition_id?: string | null;
};

const PIPELINE_STAGES: PipelineJobType[] = ['extract', 'ocr', 'chunk', 'embed', 'index'];

function enqueueJob(
  documentId: string,
  jobType: PipelineJobType,
  companyId: string | null
): PipelineJob {
  const now = nowIso();
  const job: PipelineJob = {
    id: uid('pjob'),
    company_id: companyId,
    document_id: documentId,
    job_type: jobType,
    status: 'queued',
    attempts: 0,
    max_attempts: 3,
    payload: {},
    created_at: now,
    updated_at: now,
  };
  getCodeKnowledgeStore().jobs.push(job);
  return job;
}

export function registerKnowledgeDocument(
  input: RegisterKnowledgeDocumentInput
): CodeKnowledgeDocumentMeta {
  const store = getCodeKnowledgeStore();
  registerCodeEdition({
    companyId: input.companyId,
    code: input.code,
    edition: input.edition,
    title: input.title,
    source_type: input.source_type,
    source_document_id: input.source_document_id,
    verification_status: input.verification_status,
    platform_verification_status:
      input.platform_verification_status || 'NOT_VERIFIED_OFFICIAL',
    adoption_status: input.adoption_status,
    status: 'draft',
    idempotent: true,
  });

  const editionRow = getCodeKnowledgeStore().editions.find(
    (e) =>
      !e.deleted_at &&
      e.code === input.code &&
      e.edition === input.edition &&
      (e.company_id ?? null) === input.companyId
  );
  const editionId =
    input.edition_id || input.code_edition_id || editionRow?.id || null;

  const now = nowIso();
  const mime = input.mime_type ?? input.file_mime ?? null;
  const doc: CodeKnowledgeDocumentMeta = {
    id: input.id || uid('kdoc'),
    company_id: input.companyId,
    title: input.title,
    code: input.code,
    edition: input.edition,
    code_edition_id: editionId,
    edition_id: editionId,
    version: input.version ?? '1',
    revision: input.revision ?? null,
    source_type: input.source_type || 'PROJECT_PROVIDED_DOCUMENT',
    adoption_status: input.adoption_status || null,
    verification_status: input.verification_status || 'UNVERIFIED',
    platform_verification_status:
      input.platform_verification_status || 'NOT_VERIFIED_OFFICIAL',
    source_document_id: input.source_document_id,
    status: 'draft',
    index_status: 'pending',
    extract_status: 'pending',
    extraction_status: 'pending',
    ocr_status: 'pending',
    embedding_status: 'pending',
    ingestion_status: 'pending',
    chunk_count: 0,
    page_count: null,
    pages_extracted: null,
    pages_ocr: null,
    ingestion_version: 1,
    parent_document_id: input.parent_document_id ?? null,
    file_name: input.file_name ?? null,
    file_mime: mime,
    mime_type: mime,
    file_size_bytes: input.file_size_bytes ?? null,
    storage_bucket: input.storage_bucket ?? CODE_KNOWLEDGE_STORAGE_BUCKET,
    storage_path: input.storage_path ?? null,
    sha256: input.sha256 ?? null,
    content_sha256: input.sha256 ?? null,
    extracted_text: input.extracted_text ?? null,
    ocr_used: false,
    created_by: input.created_by ?? null,
    created_at: now,
    updated_at: now,
    deleted_at: null,
  };
  store.documents.push(doc);
  if (editionRow) {
    editionRow.knowledge_document_id = doc.id;
  }

  for (const stage of PIPELINE_STAGES) {
    enqueueJob(doc.id, stage, input.companyId);
  }
  doc.index_status = 'queued';
  doc.updated_at = nowIso();
  return doc;
}

export function listPipelineJobs(documentId?: string): PipelineJob[] {
  const jobs = getCodeKnowledgeStore().jobs;
  return documentId ? jobs.filter((j) => j.document_id === documentId) : [...jobs];
}

export function getKnowledgeDocument(id: string): CodeKnowledgeDocumentMeta | null {
  return getCodeKnowledgeStore().documents.find((d) => d.id === id && !d.deleted_at) || null;
}

export function listKnowledgeDocumentsForCompany(
  companyId: string
): CodeKnowledgeDocumentMeta[] {
  return getCodeKnowledgeStore().documents.filter(
    (d) => !d.deleted_at && d.company_id === companyId
  );
}

/**
 * Process one queued job idempotently. Safe to re-run.
 * Does not spin forever — caller invokes explicitly.
 */
export function processNextPipelineJob(documentId?: string): {
  processed: boolean;
  job?: PipelineJob;
  error?: string;
} {
  const store = getCodeKnowledgeStore();
  const job = store.jobs.find(
    (j) =>
      (j.status === 'queued' || j.status === 'pending') &&
      (!documentId || j.document_id === documentId) &&
      j.attempts < j.max_attempts
  );
  if (!job) return { processed: false };

  const doc = getKnowledgeDocument(job.document_id);
  if (!doc) {
    job.status = 'failed';
    job.error_message = 'document_missing';
    job.attempts += 1;
    job.updated_at = nowIso();
    return { processed: true, job, error: 'document_missing' };
  }

  job.status = 'processing';
  job.attempts += 1;
  job.started_at = nowIso();
  job.updated_at = nowIso();
  doc.index_status = 'processing';

  try {
    switch (job.job_type) {
      case 'extract':
        runExtract(doc);
        break;
      case 'ocr':
        runOcr(doc);
        break;
      case 'chunk':
        runChunk(doc);
        break;
      case 'embed':
        runEmbed(doc);
        break;
      case 'index':
        runIndex(doc);
        break;
      default:
        throw new Error(`unknown_job_type:${job.job_type}`);
    }
    job.status = 'indexed';
    job.finished_at = nowIso();
    job.error_message = null;
    job.updated_at = nowIso();
    return { processed: true, job };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    job.status = job.attempts >= job.max_attempts ? 'failed' : 'queued';
    job.error_message = msg;
    job.finished_at = job.status === 'failed' ? nowIso() : null;
    job.updated_at = nowIso();
    if (job.status === 'failed') {
      doc.index_status = 'failed';
      doc.updated_at = nowIso();
    }
    return { processed: true, job, error: msg };
  }
}

/** Drain all queued jobs for a document (bounded by job count). Idempotent. */
export function runDocumentPipeline(documentId: string): {
  ok: boolean;
  document: CodeKnowledgeDocumentMeta | null;
  jobs: PipelineJob[];
} {
  let guard = 0;
  while (guard < 50) {
    const r = processNextPipelineJob(documentId);
    if (!r.processed) break;
    guard += 1;
  }
  const document = getKnowledgeDocument(documentId);
  const jobs = listPipelineJobs(documentId);
  const failed = jobs.some((j) => j.status === 'failed');
  return { ok: !failed && document?.index_status === 'indexed', document, jobs };
}

function runExtract(doc: CodeKnowledgeDocumentMeta): void {
  if (doc.extract_status === 'indexed' && doc.extracted_text) return;
  doc.ingestion_status = 'extracting';
  const text = String(doc.extracted_text || '').trim();
  if (!text) {
    // No body available — mark extract complete with empty (OCR may fill later)
    doc.extracted_text = '';
    doc.extract_status = 'indexed';
    doc.extraction_status = 'indexed';
    doc.updated_at = nowIso();
    return;
  }
  if (!doc.page_texts?.length) {
    const pages = pagesFromPlainText(text);
    doc.page_texts = pages.pages.map((p) => p.text);
    doc.page_count = pages.page_count;
    doc.pages_extracted = pages.pages_extracted;
  }
  doc.extract_status = 'indexed';
  doc.extraction_status = 'indexed';
  doc.updated_at = nowIso();
}

function runOcr(doc: CodeKnowledgeDocumentMeta): void {
  if (doc.ocr_status === 'indexed') return;
  doc.ingestion_status = 'ocr';
  const text = String(doc.extracted_text || '').trim();
  // Heuristic: binary-ish / empty → OCR required flag; we do not invent body text
  if (!text) {
    doc.ocr_used = true;
    doc.ocr_status = 'indexed';
    doc.pages_ocr = doc.page_count || 0;
    doc.updated_at = nowIso();
    return;
  }
  doc.ocr_used = false;
  doc.ocr_status = 'indexed';
  doc.updated_at = nowIso();
}

function runChunk(doc: CodeKnowledgeDocumentMeta): void {
  const store = getCodeKnowledgeStore();
  const existing = store.chunks.filter((c) => c.document_id === doc.id);
  if (existing.length > 0 && doc.chunk_count === existing.length) {
    // Idempotent re-run
    return;
  }
  // Replace prior chunks for this document on re-chunk
  store.chunks = store.chunks.filter((c) => c.document_id !== doc.id);
  doc.ingestion_status = 'chunking';

  const pageTexts = doc.page_texts?.length
    ? doc.page_texts.map((t, i) => ({
        page: i + 1,
        text: t,
        extraction_method: (t.trim()
          ? 'text'
          : doc.ocr_used
            ? 'ocr'
            : 'empty') as 'text' | 'ocr' | 'empty',
      }))
    : pagesFromPlainText(String(doc.extracted_text || '')).pages;

  const pageParts = chunkPagesPreserving(pageTexts, 700);
  const chunks: CodeKnowledgeChunk[] =
    pageParts.length > 0
      ? pageParts.map((p) => {
          const refs = detectSourceRefsFromText(p.content, {
            pageGuess: p.page_start,
            allowPageGuess: Boolean(doc.page_texts?.length),
          });
          return {
            id: uid('kchk'),
            company_id: doc.company_id,
            document_id: doc.id,
            edition_id: doc.edition_id || doc.code_edition_id || null,
            chunk_index: p.index,
            content: p.content,
            code: doc.code,
            edition: doc.edition,
            section: refs.section,
            subsection: refs.subsection,
            table_reference: refs.table_reference,
            figure_reference: refs.figure_reference,
            page_number: refs.page_number ?? p.page_start,
            page_start: p.page_start,
            page_end: p.page_end,
            extraction_method: p.extraction_method,
            paragraph_reference: refs.paragraph_reference,
            code_reference: refs.code_reference,
            source_document_id: doc.source_document_id,
            source_verification_status: refs.source_verification_status,
            document_title: doc.title,
          };
        })
      : (() => {
          const text = String(doc.extracted_text || '').trim();
          const parts = text ? chunkText(text, 700) : [];
          return parts.map((p) => {
            const refs = detectSourceRefsFromText(p.content, {
              pageGuess: p.pageGuess,
              allowPageGuess: false,
            });
            return {
              id: uid('kchk'),
              company_id: doc.company_id,
              document_id: doc.id,
              edition_id: doc.edition_id || doc.code_edition_id || null,
              chunk_index: p.index,
              content: p.content,
              code: doc.code,
              edition: doc.edition,
              section: refs.section,
              subsection: refs.subsection,
              table_reference: refs.table_reference,
              figure_reference: refs.figure_reference,
              page_number: refs.page_number,
              page_start: refs.page_number,
              page_end: refs.page_number,
              extraction_method: 'text' as const,
              paragraph_reference: refs.paragraph_reference,
              code_reference: refs.code_reference,
              source_document_id: doc.source_document_id,
              source_verification_status: refs.source_verification_status,
              document_title: doc.title,
            };
          });
        })();
  store.chunks.push(...chunks);
  doc.chunk_count = chunks.length;
  doc.updated_at = nowIso();
}

function runEmbed(doc: CodeKnowledgeDocumentMeta): void {
  const store = getCodeKnowledgeStore();
  const chunks = store.chunks.filter((c) => c.document_id === doc.id);
  // Offline hash embeddings always available — mark success only when vectors written
  let embedded = 0;
  for (const c of chunks) {
    if (!c.embedding || c.embedding.length === 0) {
      c.embedding = embedText(c.content);
    }
    if (c.embedding.length > 0) embedded += 1;
  }
  if (chunks.length === 0) {
    // Text indexed without embeddings is allowed; do not claim embed success falsely
    doc.embedding_status = 'pending';
  } else if (embedded === chunks.length) {
    doc.embedding_status = 'indexed';
  } else {
    doc.embedding_status = 'failed';
  }
  doc.updated_at = nowIso();
}

function runIndex(doc: CodeKnowledgeDocumentMeta): void {
  doc.index_status = 'indexed';
  doc.status = 'active';
  doc.ingestion_status = 'indexed';
  doc.indexed_at = nowIso();
  doc.last_ingestion_at = doc.last_ingestion_at || nowIso();
  doc.updated_at = nowIso();
}

/**
 * Force a failed job back to queued for retry (respects max_attempts).
 */
export function retryFailedJob(jobId: string): PipelineJob | null {
  const job = getCodeKnowledgeStore().jobs.find((j) => j.id === jobId);
  if (!job || job.status !== 'failed') return null;
  if (job.attempts >= job.max_attempts) return job;
  job.status = 'queued';
  job.error_message = null;
  job.updated_at = nowIso();
  return job;
}

export function listChunksForDocument(documentId: string): CodeKnowledgeChunk[] {
  return getCodeKnowledgeStore().chunks.filter((c) => c.document_id === documentId);
}

/** Tenant isolation helper used by tests and search. */
export function companyCanAccessDocument(
  companyId: string,
  document: CodeKnowledgeDocumentMeta,
  opts?: { includePlatform?: boolean }
): boolean {
  if (document.company_id === companyId) return true;
  if (opts?.includePlatform && document.company_id == null) return true;
  return false;
}
