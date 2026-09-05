/**
 * Structured, secret-safe server logs for Design RAG query stages.
 * Never log JWTs, keys, question text, or chunk/document contents.
 */

export type RagLogStage =
  | 'RAG_START'
  | 'AUTH_OK'
  | 'TENANT_OK'
  | 'CLIENT_OK'
  | 'CHUNKS_QUERY_START'
  | 'CHUNKS_QUERY_OK'
  | 'DOCS_QUERY_START'
  | 'DOCS_QUERY_OK'
  | 'RANK_OK'
  | 'RAG_DONE'
  | 'RAG_FAILED';

export type RagLogFields = {
  stage: RagLogStage;
  companyId?: string | null;
  chunkCount?: number | null;
  documentCount?: number | null;
  resultCount?: number | null;
  elapsedMs?: number | null;
  error?: string | null;
  errorCode?: string | null;
};

const SECRETISH =
  /(bearer\s+\S+|eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9._-]+|service_role\S*|supabase_service_role\S*|apikey\S*|access_token\S*|refresh_token\S*)/gi;

export function sanitizeRagErrorMessage(message: unknown): string {
  const raw = message instanceof Error ? message.message : String(message || 'unknown_error');
  return raw.slice(0, 300).replace(SECRETISH, '[redacted]');
}

export function logRag(fields: RagLogFields): void {
  const payload: Record<string, unknown> = {
    event: 'kb_rag',
    stage: fields.stage,
  };
  if (fields.companyId) payload.companyId = fields.companyId;
  if (fields.chunkCount != null) payload.chunkCount = fields.chunkCount;
  if (fields.documentCount != null) payload.documentCount = fields.documentCount;
  if (fields.resultCount != null) payload.resultCount = fields.resultCount;
  if (fields.elapsedMs != null) payload.elapsedMs = fields.elapsedMs;
  if (fields.error) payload.error = sanitizeRagErrorMessage(fields.error);
  if (fields.errorCode) payload.errorCode = fields.errorCode;
  // eslint-disable-next-line no-console
  console.info(JSON.stringify(payload));
}

export function createRagTimer(): { elapsedMs: () => number } {
  const started = Date.now();
  return { elapsedMs: () => Date.now() - started };
}

export class RagQueryError extends Error {
  code: string;
  status: number;
  constructor(message: string, code: string, status = 500) {
    super(message);
    this.code = code;
    this.status = status;
  }
}
