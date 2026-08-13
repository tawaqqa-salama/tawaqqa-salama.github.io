/**
 * Storage-backed Code Knowledge ingestion:
 * Storage → authenticated download → PDF parse → page extract → OCR fallback
 * → chunks → source refs → index → RAG
 *
 * Never invents NFPA numeric values. Never uses Cursor/ChatGPT/web PDFs.
 */

import { sha256HexFromBytes } from '@/lib/design-intelligence/code-knowledge/sha256';
import {
  applyOcrFallbackToPages,
  chunkPagesPreserving,
  extractPdfPagesFromBytes,
  pagesFromPlainText,
  type ExtractedPdfPage,
} from '@/lib/design-intelligence/code-knowledge/pdf-page-extract';
import {
  getDefaultCodeKnowledgeStorage,
  resolveCodeKnowledgeUploadPath,
  type CodeKnowledgeStorageAdapter,
} from '@/lib/design-intelligence/code-knowledge/storage-client';
import {
  assertWithinBucketLimit,
  shouldUseResumableUpload,
  uploadKnowledgeFileResumable,
} from '@/lib/design-intelligence/code-knowledge/resumable-upload';
import { CODE_KNOWLEDGE_STORAGE_BUCKET } from '@/lib/design-intelligence/code-knowledge/storage-path';
import {
  getCodeKnowledgeStore,
  nowIso,
  uid,
} from '@/lib/design-intelligence/code-knowledge/store';
import { getCodeEdition, registerCodeEdition } from '@/lib/design-intelligence/code-knowledge/registry';
import {
  listChunksForDocument,
  listKnowledgeDocumentsForCompany,
  registerKnowledgeDocument,
  runDocumentPipeline,
} from '@/lib/design-intelligence/code-knowledge/ingestion';
import { detectSourceRefsFromText } from '@/lib/design-intelligence/code-knowledge/source-refs';
import { embedText } from '@/lib/design-intelligence/embeddings';
import {
  isUuid,
  listPersistedCodeKnowledgeDocuments,
  newKnowledgeChunkId,
  newKnowledgeDocumentId,
  persistAndVerifyCodeKnowledgeIngestion,
  shouldPersistCodeKnowledgeToSupabase,
} from '@/lib/design-intelligence/code-knowledge/persist';
import type {
  CodeKnowledgeChunk,
  CodeKnowledgeDocumentMeta,
} from '@/lib/design-intelligence/code-knowledge/types';

export type UploadCodeKnowledgeInput = {
  companyId: string;
  code: string;
  edition: string;
  title?: string;
  fileName: string;
  mimeType?: string | null;
  bytes: Uint8Array;
  /**
   * Prefer passing the original File for large uploads so TUS can stream
   * chunks without a single Safari/iPhone PUT of the whole body.
   */
  file?: File | Blob | null;
  source_document_id?: string;
  source_type?: string;
  verification_status?: string;
  platform_verification_status?: string;
  adoption_status?: string;
  created_by?: string | null;
  /** When true and SHA differs, supersede prior active doc for same code/edition. */
  replaceIfChanged?: boolean;
  /** Optional OCR text keyed by page number (never invented by pipeline). */
  ocrPageText?: Record<number, string>;
  storage?: CodeKnowledgeStorageAdapter;
  /** Upload progress 0–100 (TUS or standard). */
  onUploadProgress?: (percent: number, bytesUploaded: number, bytesTotal: number) => void;
  /** High-level pipeline phase for UI status chips. */
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
  /** Receive pause/resume/abort handle for large TUS uploads. */
  registerUploadHandle?: (handle: {
    pause: () => void;
    resume: () => void;
    abort: () => void;
  }) => void;
};

export type UploadCodeKnowledgeResult =
  | {
      status: 'skipped_duplicate';
      document: CodeKnowledgeDocumentMeta;
      sha256: string;
      reason: 'identical_sha256';
    }
  | {
      status: 'indexed' | 'failed';
      document: CodeKnowledgeDocumentMeta;
      sha256: string;
      superseded?: CodeKnowledgeDocumentMeta | null;
      storage_path: string;
      chunk_count: number;
      page_count: number;
      error?: string;
      upload_method?: 'tus' | 'standard' | 'skipped';
    };

function findActiveDuplicateBySha(input: {
  companyId: string;
  code: string;
  edition: string;
  sha256: string;
}): CodeKnowledgeDocumentMeta | null {
  return (
    getCodeKnowledgeStore().documents.find(
      (d) =>
        !d.deleted_at &&
        d.company_id === input.companyId &&
        d.code === input.code &&
        d.edition === input.edition &&
        d.sha256 === input.sha256 &&
        d.ingestion_status !== 'superseded' &&
        d.status !== 'superseded'
    ) || null
  );
}

function findActiveDocsForEdition(input: {
  companyId: string;
  code: string;
  edition: string;
}): CodeKnowledgeDocumentMeta[] {
  return getCodeKnowledgeStore().documents.filter(
    (d) =>
      !d.deleted_at &&
      d.company_id === input.companyId &&
      d.code === input.code &&
      d.edition === input.edition &&
      d.ingestion_status !== 'superseded' &&
      d.status !== 'superseded'
  );
}

function supersedeDocument(doc: CodeKnowledgeDocumentMeta): void {
  doc.status = 'superseded';
  doc.ingestion_status = 'superseded';
  doc.index_status = 'superseded';
  doc.updated_at = nowIso();
}

function linkEdition(input: {
  companyId: string;
  code: string;
  edition: string;
  title?: string;
  source_document_id: string;
  source_type?: string;
  verification_status?: string;
  platform_verification_status?: string;
  adoption_status?: string;
}): string {
  const reg = registerCodeEdition({
    companyId: input.companyId,
    code: input.code,
    edition: input.edition,
    title: input.title,
    source_document_id: input.source_document_id,
    source_type: input.source_type,
    verification_status: input.verification_status,
    platform_verification_status:
      input.platform_verification_status || 'NOT_VERIFIED_OFFICIAL',
    adoption_status: input.adoption_status,
    status: 'draft',
    idempotent: true,
  });
  if (reg.ok) return reg.edition.id;
  const existing = getCodeEdition(input.code, input.edition, input.companyId);
  return existing?.id || uid('ced');
}

/**
 * Upload bytes to private design-knowledge bucket and ingest from Storage.
 *
 * When Supabase is configured (Production): Storage + DB persistence is required.
 * Session-memory alone is never a final success — failures surface as FAILED.
 */
export async function uploadAndIngestCodeKnowledgeDocument(
  input: UploadCodeKnowledgeInput
): Promise<UploadCodeKnowledgeResult> {
  const mustPersist = shouldPersistCodeKnowledgeToSupabase();
  const storage = input.storage || getDefaultCodeKnowledgeStorage();
  const sha256 = await sha256HexFromBytes(input.bytes);
  const mime =
    input.mimeType ||
    (input.fileName.toLowerCase().endsWith('.pdf')
      ? 'application/pdf'
      : 'application/octet-stream');

  if (mustPersist && !isUuid(input.companyId)) {
    const failedId = newKnowledgeDocumentId();
    const failed = registerKnowledgeDocument({
      id: failedId,
      companyId: input.companyId,
      title: input.title || `${input.code} ${input.edition}`,
      code: input.code,
      edition: input.edition,
      source_document_id:
        input.source_document_id || `storage:${input.code}/${input.edition}/${failedId}`,
      file_name: input.fileName,
      file_mime: mime,
      mime_type: mime,
      file_size_bytes: input.bytes.byteLength,
      storage_bucket: CODE_KNOWLEDGE_STORAGE_BUCKET,
      sha256,
      created_by: input.created_by,
    });
    failed.ingestion_status = 'failed';
    failed.index_status = 'failed';
    failed.persisted = false;
    failed.persist_error =
      'company_id must be a UUID for Production Supabase Storage/DB persistence';
    return {
      status: 'failed',
      document: failed,
      sha256,
      storage_path: '',
      chunk_count: 0,
      page_count: 0,
      error: failed.persist_error,
    };
  }

  const dup = findActiveDuplicateBySha({
    companyId: input.companyId,
    code: input.code,
    edition: input.edition,
    sha256,
  });
  if (dup) {
    // Production: only skip when prior row was actually persisted
    if (!mustPersist || dup.persisted) {
      return {
        status: 'skipped_duplicate',
        document: dup,
        sha256,
        reason: 'identical_sha256',
      };
    }
  }

  let superseded: CodeKnowledgeDocumentMeta | null = null;
  const prior = findActiveDocsForEdition({
    companyId: input.companyId,
    code: input.code,
    edition: input.edition,
  });
  const parent = prior[0] || null;
  if (input.replaceIfChanged !== false && prior.length) {
    for (const p of prior) {
      // Historical rows kept; only mark superseded — never mutate extracted body of history
      supersedeDocument(p);
      superseded = p;
    }
  }

  const documentId = mustPersist ? newKnowledgeDocumentId() : uid('kdoc');
  const source_document_id =
    input.source_document_id ||
    `storage:${input.code}/${input.edition}/${documentId}`;
  const editionId = linkEdition({
    companyId: input.companyId,
    code: input.code,
    edition: input.edition,
    title: input.title,
    source_document_id,
    source_type: input.source_type,
    verification_status: input.verification_status,
    platform_verification_status: input.platform_verification_status,
    adoption_status: input.adoption_status,
  });

  const { bucket, path } = resolveCodeKnowledgeUploadPath({
    companyId: input.companyId,
    code: input.code,
    edition: input.edition,
    documentId,
    fileName: input.fileName,
  });

  const sizeLimitErr = assertWithinBucketLimit(input.bytes.byteLength);
  if (sizeLimitErr) {
    const failed = registerKnowledgeDocument({
      id: documentId,
      companyId: input.companyId,
      title: input.title || `${input.code} ${input.edition}`,
      code: input.code,
      edition: input.edition,
      source_document_id,
      file_name: input.fileName,
      file_mime: mime,
      mime_type: mime,
      file_size_bytes: input.bytes.byteLength,
      storage_bucket: bucket,
      storage_path: path,
      sha256,
      created_by: input.created_by,
      code_edition_id: editionId,
      edition_id: editionId,
      parent_document_id: parent?.id ?? null,
    });
    failed.ingestion_status = 'failed';
    failed.index_status = 'failed';
    failed.persisted = false;
    failed.persist_error = sizeLimitErr;
    input.onPhase?.('failed');
    return {
      status: 'failed',
      document: failed,
      sha256,
      storage_path: path,
      chunk_count: 0,
      page_count: 0,
      error: sizeLimitErr,
      superseded,
      upload_method: 'skipped',
    };
  }

  let uploadMethod: 'tus' | 'standard' = 'standard';
  let uploadedPath: string | null = null;
  let uploadError: string | undefined;

  const useTus =
    Boolean(input.file) &&
    typeof window !== 'undefined' &&
    mustPersist &&
    shouldUseResumableUpload(input.bytes.byteLength) &&
    !input.storage; // injectable test adapters stay on standard upload

  input.onPhase?.('uploading');

  if (useTus && input.file) {
    uploadMethod = 'tus';
    const tusResult = await uploadKnowledgeFileResumable({
      file: input.file,
      path,
      bucket,
      contentType: mime,
      upsert: true,
      onProgress: (p) =>
        input.onUploadProgress?.(p.percent, p.bytesUploaded, p.bytesTotal),
      onPhase: (phase) => input.onPhase?.(phase),
      registerHandle: input.registerUploadHandle,
    });
    if (!tusResult.ok) {
      uploadError = tusResult.error;
    } else {
      uploadedPath = tusResult.path;
      input.onUploadProgress?.(100, input.bytes.byteLength, input.bytes.byteLength);
    }
  } else {
    input.onUploadProgress?.(0, 0, input.bytes.byteLength);
    const uploaded = await storage.upload(bucket, path, input.bytes, {
      contentType: mime,
      upsert: false,
    });
    if (!uploaded.ok || !uploaded.path) {
      uploadError = uploaded.error || 'upload_failed';
    } else {
      uploadedPath = uploaded.path;
      input.onUploadProgress?.(100, input.bytes.byteLength, input.bytes.byteLength);
      input.onPhase?.('uploaded');
    }
  }

  if (!uploadedPath) {
    const failed = registerKnowledgeDocument({
      id: documentId,
      companyId: input.companyId,
      title: input.title || `${input.code} ${input.edition}`,
      code: input.code,
      edition: input.edition,
      source_document_id,
      file_name: input.fileName,
      file_mime: mime,
      mime_type: mime,
      file_size_bytes: input.bytes.byteLength,
      storage_bucket: bucket,
      storage_path: path,
      sha256,
      created_by: input.created_by,
      code_edition_id: editionId,
      edition_id: editionId,
      parent_document_id: parent?.id ?? null,
    });
    failed.ingestion_status = 'failed';
    failed.index_status = 'failed';
    failed.persisted = false;
    failed.persist_error = uploadError || 'upload_failed';
    failed.ingestion_version = (parent?.ingestion_version || 0) + 1;
    input.onPhase?.('failed');
    return {
      status: 'failed',
      document: failed,
      sha256,
      storage_path: path,
      chunk_count: 0,
      page_count: 0,
      error: uploadError || 'upload_failed',
      superseded,
      upload_method: uploadMethod,
    };
  }

  // Ingestion starts only after Storage upload is 100% complete
  input.onPhase?.('extracting');

  const ingest = await ingestCodeKnowledgeFromStorage({
    companyId: input.companyId,
    code: input.code,
    edition: input.edition,
    editionId,
    documentId,
    title: input.title || `${input.code} ${input.edition}`,
    fileName: input.fileName,
    mimeType: mime,
    sha256,
    fileSize: input.bytes.byteLength,
    storagePath: uploadedPath,
    storageBucket: bucket,
    source_document_id,
    source_type: input.source_type || 'PROJECT_PROVIDED_DOCUMENT',
    verification_status: input.verification_status || 'UNVERIFIED',
    platform_verification_status:
      input.platform_verification_status || 'NOT_VERIFIED_OFFICIAL',
    adoption_status: input.adoption_status,
    parent_document_id: parent?.id ?? null,
    ingestion_version: (parent?.ingestion_version || 0) + 1,
    created_by: input.created_by,
    ocrPageText: input.ocrPageText,
    storage,
    /** Prefer already-held bytes to avoid a second round-trip in tests */
    preloadedBytes: input.bytes,
    onPhase: input.onPhase,
  });

  if (ingest.status === 'indexed') input.onPhase?.('indexed');
  else input.onPhase?.('failed');

  return { ...ingest, superseded, upload_method: uploadMethod };
}

export type IngestFromStorageInput = {
  companyId: string;
  code: string;
  edition: string;
  editionId?: string;
  documentId?: string;
  title: string;
  fileName: string;
  mimeType?: string | null;
  sha256: string;
  fileSize?: number;
  storagePath: string;
  storageBucket?: string;
  source_document_id: string;
  source_type?: string;
  verification_status?: string;
  platform_verification_status?: string;
  adoption_status?: string;
  parent_document_id?: string | null;
  ingestion_version?: number;
  created_by?: string | null;
  ocrPageText?: Record<number, string>;
  storage?: CodeKnowledgeStorageAdapter;
  preloadedBytes?: Uint8Array;
  onPhase?: UploadCodeKnowledgeInput['onPhase'];
};

/**
 * Download (or use preloaded bytes) from Storage and run page-preserving pipeline.
 */
export async function ingestCodeKnowledgeFromStorage(
  input: IngestFromStorageInput
): Promise<{
  status: 'indexed' | 'failed';
  document: CodeKnowledgeDocumentMeta;
  sha256: string;
  storage_path: string;
  chunk_count: number;
  page_count: number;
  error?: string;
}> {
  const storage = input.storage || getDefaultCodeKnowledgeStorage();
  const bucket = input.storageBucket || CODE_KNOWLEDGE_STORAGE_BUCKET;

  let bytes = input.preloadedBytes || null;
  if (!bytes) {
    const dl = await storage.download(bucket, input.storagePath);
    if (!dl.ok || !dl.bytes) {
      const doc = registerKnowledgeDocument({
        companyId: input.companyId,
        title: input.title,
        code: input.code,
        edition: input.edition,
        source_document_id: input.source_document_id,
        file_name: input.fileName,
        file_mime: input.mimeType,
        file_size_bytes: input.fileSize ?? null,
        storage_path: input.storagePath,
        created_by: input.created_by,
        parent_document_id: input.parent_document_id,
      });
      applyStorageMeta(doc, input, bucket);
      doc.ingestion_status = 'failed';
      return {
        status: 'failed',
        document: doc,
        sha256: input.sha256,
        storage_path: input.storagePath,
        chunk_count: 0,
        page_count: 0,
        error: dl.error || 'download_failed',
      };
    }
    bytes = dl.bytes;
  }

  // Authenticated signed URL availability check (never use public URL)
  await storage.createSignedUrl(bucket, input.storagePath, 600);

  const editionId =
    input.editionId ||
    linkEdition({
      companyId: input.companyId,
      code: input.code,
      edition: input.edition,
      title: input.title,
      source_document_id: input.source_document_id,
      source_type: input.source_type,
      verification_status: input.verification_status,
      platform_verification_status: input.platform_verification_status,
      adoption_status: input.adoption_status,
    });

  let pages: ExtractedPdfPage[] = [];
  let extractError: string | undefined;
  const isPdf =
    (input.mimeType || '').includes('pdf') ||
    input.fileName.toLowerCase().endsWith('.pdf');

  input.onPhase?.('extracting');
  try {
    if (isPdf) {
      const extracted = await extractPdfPagesFromBytes(bytes);
      pages = extracted.pages;
    } else {
      const text = new TextDecoder('utf-8').decode(bytes);
      pages = pagesFromPlainText(text).pages;
    }
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err);
    // Keep PDF stage distinct from chunks_missing / no_chunks_produced
    extractError = raw.startsWith('pdf_extraction_failed')
      ? raw
      : `pdf_extraction_failed: ${raw}`;
    pages = [];
  }

  const needsOcr = pages.length === 0 || pages.every((p) => !p.text.trim());
  const afterOcr = applyOcrFallbackToPages(
    pages.length
      ? pages
      : [{ page: 1, text: '', extraction_method: 'empty' }],
    input.ocrPageText
  );

  input.onPhase?.('chunking');
  const pageParts = chunkPagesPreserving(afterOcr.pages, 700);
  const mustPersist = shouldPersistCodeKnowledgeToSupabase();
  const doc = registerKnowledgeDocument({
    id: input.documentId,
    companyId: input.companyId,
    title: input.title,
    code: input.code,
    edition: input.edition,
    source_document_id: input.source_document_id,
    source_type: input.source_type,
    verification_status: input.verification_status,
    platform_verification_status: input.platform_verification_status,
    adoption_status: input.adoption_status,
    file_name: input.fileName,
    file_mime: input.mimeType,
    mime_type: input.mimeType,
    file_size_bytes: input.fileSize ?? bytes.byteLength,
    storage_bucket: bucket,
    storage_path: input.storagePath,
    sha256: input.sha256,
    extracted_text: afterOcr.combined_text,
    parent_document_id: input.parent_document_id,
    created_by: input.created_by,
    code_edition_id: editionId,
    edition_id: editionId,
  });

  applyStorageMeta(doc, input, bucket, editionId);
  doc.page_count = afterOcr.page_count;
  doc.pages_extracted = afterOcr.pages_extracted;
  doc.pages_ocr = afterOcr.pages_ocr;
  doc.page_texts = afterOcr.pages.map((p) => p.text);
  doc.ocr_used = afterOcr.ocr_used || needsOcr;
  doc.extract_status = extractError ? 'failed' : 'indexed';
  doc.extraction_status = doc.extract_status;
  doc.ocr_status = afterOcr.ocr_used || needsOcr ? 'indexed' : 'indexed';
  doc.ingestion_status = 'chunking';
  doc.last_ingestion_at = nowIso();
  doc.persisted = false;
  doc.persist_error = null;

  // Replace default text chunker with page-preserving chunks
  const store = getCodeKnowledgeStore();
  store.chunks = store.chunks.filter((c) => c.document_id !== doc.id);
  const chunks: CodeKnowledgeChunk[] = pageParts.map((p) => {
    const refs = detectSourceRefsFromText(p.content, {
      pageGuess: p.page_start,
      allowPageGuess: true,
    });
    return {
      id: mustPersist ? newKnowledgeChunkId() : uid('kchk'),
      company_id: doc.company_id,
      document_id: doc.id,
      edition_id: editionId,
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
      embedding: embedText(p.content),
      document_title: doc.title,
    };
  });
  store.chunks.push(...chunks);
  doc.chunk_count = chunks.length;
  doc.embedding_status = chunks.length ? 'indexed' : 'pending';
  doc.ingestion_status = 'indexing';
  input.onPhase?.('indexing');

  if (extractError && chunks.length === 0 && !input.ocrPageText) {
    doc.ingestion_status = 'failed';
    doc.index_status = 'failed';
    doc.persisted = false;
    doc.persist_error = extractError;
    return {
      status: 'failed',
      document: doc,
      sha256: input.sha256,
      storage_path: input.storagePath,
      chunk_count: 0,
      page_count: afterOcr.page_count,
      error: extractError,
    };
  }

  if (chunks.length === 0) {
    doc.ingestion_status = 'failed';
    doc.index_status = 'failed';
    doc.persisted = false;
    doc.persist_error = 'no_chunks_produced';
    return {
      status: 'failed',
      document: doc,
      sha256: input.sha256,
      storage_path: input.storagePath,
      chunk_count: 0,
      page_count: afterOcr.page_count,
      error: 'no_chunks_produced',
    };
  }

  // —— Production: require Storage + DB persistence before indexed ——
  if (mustPersist) {
    const persisted = await persistAndVerifyCodeKnowledgeIngestion({
      document: doc,
      chunks,
    });
    if (!persisted.ok || !persisted.persisted) {
      doc.ingestion_status = 'failed';
      doc.index_status = 'failed';
      doc.persisted = false;
      doc.persist_error = persisted.error || 'persist_failed';
      doc.updated_at = nowIso();
      return {
        status: 'failed',
        document: doc,
        sha256: input.sha256,
        storage_path: input.storagePath,
        chunk_count: persisted.chunk_count,
        page_count: afterOcr.page_count,
        error: doc.persist_error,
      };
    }
  } else {
    doc.persisted = false;
    doc.persist_error = null;
  }

  // Mark pipeline jobs complete for this document (storage path already extracted)
  for (const job of store.jobs.filter((j) => j.document_id === doc.id)) {
    job.status = 'indexed';
    job.finished_at = nowIso();
    job.updated_at = nowIso();
  }
  doc.index_status = 'indexed';
  doc.status = 'active';
  doc.indexed_at = nowIso();
  doc.ingestion_status = 'indexed';
  doc.updated_at = nowIso();

  // Link edition → knowledge document
  const edition = getCodeEdition(doc.code, doc.edition, input.companyId);
  if (edition) {
    edition.knowledge_document_id = doc.id;
    edition.source_document_id = doc.source_document_id;
    edition.status = edition.status === 'draft' ? 'indexed' : edition.status;
    edition.updated_at = nowIso();
  }

  return {
    status: 'indexed',
    document: doc,
    sha256: input.sha256,
    storage_path: input.storagePath,
    chunk_count: chunks.length,
    page_count: afterOcr.page_count,
  };
}

/**
 * UI document list: Production reads Supabase only; Demo uses session-memory.
 */
export async function listCodeKnowledgeDocumentsForUi(options?: {
  companyId?: string | null;
}): Promise<{
  documents: CodeKnowledgeDocumentMeta[];
  source: 'supabase' | 'session-memory';
  persistedMode: boolean;
}> {
  if (shouldPersistCodeKnowledgeToSupabase()) {
    const listed = await listPersistedCodeKnowledgeDocuments({
      companyId: options?.companyId,
    });
    return {
      documents: listed.ok ? listed.documents : [],
      source: 'supabase',
      persistedMode: true,
    };
  }

  return {
    documents: listKnowledgeDocumentsForCompany(options?.companyId || '').map((d) => ({
      ...d,
      persisted: false,
    })),
    source: 'session-memory',
    persistedMode: false,
  };
}

/**
 * Re-ingest existing Storage object (same path). Does not replace historical versions.
 */
export async function reingestCodeKnowledgeDocument(
  documentId: string,
  opts?: {
    storage?: CodeKnowledgeStorageAdapter;
    ocrPageText?: Record<number, string>;
  }
): Promise<UploadCodeKnowledgeResult | { status: 'failed'; error: string }> {
  const doc = getCodeKnowledgeStore().documents.find(
    (d) => d.id === documentId && !d.deleted_at
  );
  if (!doc) return { status: 'failed', error: 'document_missing' };
  if (!doc.storage_path || !doc.company_id || !doc.sha256) {
    return { status: 'failed', error: 'storage_metadata_missing' };
  }

  const storage = opts?.storage || getDefaultCodeKnowledgeStorage();
  const dl = await storage.download(
    doc.storage_bucket || CODE_KNOWLEDGE_STORAGE_BUCKET,
    doc.storage_path
  );
  if (!dl.ok || !dl.bytes) {
    return { status: 'failed', error: dl.error || 'download_failed' };
  }

  const sha = await sha256HexFromBytes(dl.bytes);
  if (sha === doc.sha256 && doc.index_status === 'indexed' && (doc.chunk_count || 0) > 0) {
    return {
      status: 'skipped_duplicate',
      document: doc,
      sha256: sha,
      reason: 'identical_sha256',
    };
  }

  // Content changed at same path → new ingestion version (do not mutate history body of old)
  return uploadAndIngestCodeKnowledgeDocument({
    companyId: doc.company_id,
    code: doc.code,
    edition: doc.edition,
    title: doc.title,
    fileName: doc.file_name || 'document.pdf',
    mimeType: doc.mime_type || doc.file_mime,
    bytes: dl.bytes,
    source_document_id: doc.source_document_id || undefined,
    source_type: doc.source_type || undefined,
    verification_status: doc.verification_status || undefined,
    platform_verification_status: doc.platform_verification_status || undefined,
    adoption_status: doc.adoption_status || undefined,
    created_by: doc.created_by,
    replaceIfChanged: true,
    ocrPageText: opts?.ocrPageText,
    storage,
  });
}

function applyStorageMeta(
  doc: CodeKnowledgeDocumentMeta,
  input: {
    sha256: string;
    mimeType?: string | null;
    ingestion_version?: number;
    source_type?: string;
  },
  bucket: string,
  editionId?: string
): void {
  doc.sha256 = input.sha256;
  doc.content_sha256 = input.sha256;
  doc.mime_type = input.mimeType || doc.file_mime || null;
  doc.file_mime = doc.mime_type;
  doc.storage_bucket = bucket;
  doc.ingestion_version = input.ingestion_version ?? 1;
  doc.ingestion_status = 'uploaded';
  if (editionId) {
    doc.code_edition_id = editionId;
    doc.edition_id = editionId;
  }
  if (input.source_type) doc.source_type = input.source_type;
}

/**
 * Re-ingest an EXISTING Storage object into di_knowledge_documents/chunks.
 * Never uploads. Uses the provided documentId + storagePath as canonical.
 */
export async function reingestExistingCodeKnowledgeStorageObject(input: {
  companyId: string;
  documentId: string;
  storagePath: string;
  storageBucket?: string;
  code: string;
  edition: string;
  title?: string;
  fileName?: string;
  mimeType?: string;
  source_document_id?: string;
  storage?: CodeKnowledgeStorageAdapter;
  ocrPageText?: Record<number, string>;
}): Promise<{
  status: 'indexed' | 'failed';
  document: CodeKnowledgeDocumentMeta;
  sha256: string;
  storage_path: string;
  chunk_count: number;
  page_count: number;
  error?: string;
}> {
  const failDoc = (error: string): CodeKnowledgeDocumentMeta => ({
    id: input.documentId,
    company_id: input.companyId,
    title: input.title || `${input.code} ${input.edition}`,
    code: input.code,
    edition: input.edition,
    status: 'failed',
    index_status: 'failed',
    storage_path: input.storagePath,
    storage_bucket: input.storageBucket || CODE_KNOWLEDGE_STORAGE_BUCKET,
    source_document_id:
      input.source_document_id || `storage:${input.storagePath}`,
    persisted: false,
    persist_error: error,
  });

  if (!isUuid(input.documentId) || !isUuid(input.companyId)) {
    return {
      status: 'failed',
      document: failDoc('company_id and document_id must be UUIDs'),
      sha256: '',
      storage_path: input.storagePath,
      chunk_count: 0,
      page_count: 0,
      error: 'company_id and document_id must be UUIDs',
    };
  }

  const storage = input.storage || getDefaultCodeKnowledgeStorage();
  const bucket = input.storageBucket || CODE_KNOWLEDGE_STORAGE_BUCKET;
  const dl = await storage.download(bucket, input.storagePath);
  if (!dl.ok || !dl.bytes) {
    return {
      status: 'failed',
      document: failDoc(dl.error || 'download_failed'),
      sha256: '',
      storage_path: input.storagePath,
      chunk_count: 0,
      page_count: 0,
      error: dl.error || 'download_failed',
    };
  }

  const sha256 = await sha256HexFromBytes(dl.bytes);
  return ingestCodeKnowledgeFromStorage({
    companyId: input.companyId,
    code: input.code,
    edition: input.edition,
    documentId: input.documentId,
    title: input.title || `${input.code} ${input.edition}`,
    fileName: input.fileName || 'document.pdf',
    mimeType: input.mimeType || 'application/pdf',
    sha256,
    fileSize: dl.bytes.byteLength,
    storagePath: input.storagePath,
    storageBucket: bucket,
    source_document_id:
      input.source_document_id ||
      `storage:${input.code}/${input.edition}/${input.documentId}`,
    source_type: 'PROJECT_PROVIDED_DOCUMENT',
    verification_status: 'UNVERIFIED',
    platform_verification_status: 'NOT_VERIFIED_OFFICIAL',
    storage,
    preloadedBytes: dl.bytes,
    ocrPageText: input.ocrPageText,
  });
}

/**
 * Mark an older Storage duplicate for safe cleanup AFTER canonical is indexed.
 * Does NOT delete the Storage object.
 */
export async function markCodeKnowledgeDuplicateForCleanup(input: {
  olderDocumentId: string;
  canonicalDocumentId: string;
  companyId: string;
  storagePath?: string | null;
  sha256?: string | null;
  noteExtra?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const now = nowIso();
  const note = [
    'SAFE_CLEANUP_CANDIDATE',
    `duplicate_of=${input.canonicalDocumentId}`,
    input.sha256 ? `sha256=${input.sha256}` : null,
    `marked_at=${now}`,
    'DO_NOT_DELETE_STORAGE_UNTIL_OPERATOR_APPROVES',
    input.noteExtra || null,
  ]
    .filter(Boolean)
    .join(' ');

  const store = getCodeKnowledgeStore();
  const local = store.documents.find((d) => d.id === input.olderDocumentId);
  if (local) {
    if (local.company_id && local.company_id !== input.companyId) {
      return { ok: false, error: 'company_mismatch' };
    }
    local.status = 'superseded';
    local.notes = note;
    local.updated_at = now;
  }

  if (shouldPersistCodeKnowledgeToSupabase() && isUuid(input.olderDocumentId)) {
    const { supabase } = await import('@/lib/supabase');
    const { data: existing } = await supabase
      .from('di_knowledge_documents')
      .select('id')
      .eq('id', input.olderDocumentId)
      .maybeSingle();

    if (existing?.id) {
      const { error } = await supabase
        .from('di_knowledge_documents')
        .update({
          status: 'superseded',
          notes: note,
          updated_at: now,
        })
        .eq('id', input.olderDocumentId)
        .eq('company_id', input.companyId);
      if (error) return { ok: false, error: error.message };
    } else if (input.storagePath) {
      const { error } = await supabase.from('di_knowledge_documents').upsert({
        id: input.olderDocumentId,
        company_id: input.companyId,
        title: 'Duplicate — cleanup candidate',
        status: 'superseded',
        index_status: 'failed',
        ingestion_status: 'skipped_duplicate',
        chunk_count: 0,
        storage_bucket: CODE_KNOWLEDGE_STORAGE_BUCKET,
        storage_path: input.storagePath,
        sha256: input.sha256 || null,
        content_sha256: input.sha256 || null,
        notes: note,
        deleted_at: null,
        updated_at: now,
        created_at: now,
      });
      if (error) return { ok: false, error: error.message };
    }
  }

  return { ok: true };
}

/** Test helper: run text-only register pipeline still available. */
export { runDocumentPipeline, listChunksForDocument };
