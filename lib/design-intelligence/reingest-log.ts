/**
 * Structured, secret-safe server logs for Knowledge Base reingest stages.
 * Never log JWTs, keys, document text, or file contents.
 */

export type ReingestLogStage =
  | 'REINGEST_START'
  | 'AUTH_OK'
  | 'TENANT_OK'
  | 'DOCUMENT_LOADED'
  | 'STORAGE_DOWNLOAD_START'
  | 'STORAGE_DOWNLOAD_OK'
  | 'PDF_EXTRACT_START'
  | 'PDF_EXTRACT_OK'
  | 'CHUNK_BUILD_START'
  | 'CHUNK_BUILD_OK'
  | 'OLD_CHUNKS_DELETE_START'
  | 'OLD_CHUNKS_DELETE_OK'
  | 'CHUNK_INSERT_START'
  | 'CHUNK_INSERT_PROGRESS'
  | 'CHUNK_INSERT_OK'
  | 'DOCUMENT_UPDATE_OK'
  | 'REINGEST_DONE'
  | 'REINGEST_FAILED';

export type ReingestLogFields = {
  stage: ReingestLogStage;
  documentId?: string | null;
  companyId?: string | null;
  pageCount?: number | null;
  chunkCount?: number | null;
  chunksBefore?: number | null;
  chunksAfter?: number | null;
  batchIndex?: number | null;
  batchTotal?: number | null;
  elapsedMs?: number | null;
  error?: string | null;
  errorCode?: string | null;
};

const SECRETISH =
  /(bearer\s+\S+|eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9._-]+|service_role\S*|supabase_service_role\S*|apikey\S*|access_token\S*|refresh_token\S*)/gi;

/** Strip anything that looks like a secret from error messages. */
export function sanitizeReingestErrorMessage(message: unknown): string {
  const raw = message instanceof Error ? message.message : String(message || 'unknown_error');
  const clipped = raw.slice(0, 300);
  return clipped.replace(SECRETISH, '[redacted]');
}

export function logReingest(fields: ReingestLogFields): void {
  const payload: Record<string, unknown> = {
    event: 'kb_reingest',
    stage: fields.stage,
  };
  if (fields.documentId) payload.documentId = fields.documentId;
  if (fields.companyId) payload.companyId = fields.companyId;
  if (fields.pageCount != null) payload.pageCount = fields.pageCount;
  if (fields.chunkCount != null) payload.chunkCount = fields.chunkCount;
  if (fields.chunksBefore != null) payload.chunksBefore = fields.chunksBefore;
  if (fields.chunksAfter != null) payload.chunksAfter = fields.chunksAfter;
  if (fields.batchIndex != null) payload.batchIndex = fields.batchIndex;
  if (fields.batchTotal != null) payload.batchTotal = fields.batchTotal;
  if (fields.elapsedMs != null) payload.elapsedMs = fields.elapsedMs;
  if (fields.error) payload.error = sanitizeReingestErrorMessage(fields.error);
  if (fields.errorCode) payload.errorCode = fields.errorCode;

  // Structured single-line JSON for Vercel log search
  // eslint-disable-next-line no-console
  console.info(JSON.stringify(payload));
}

export function createReingestTimer(): { elapsedMs: () => number } {
  const started = Date.now();
  return { elapsedMs: () => Date.now() - started };
}
