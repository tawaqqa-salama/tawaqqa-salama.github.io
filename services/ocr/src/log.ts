/**
 * Safe structured logs for the OCR service.
 * Never log bearer tokens, base64 payloads, or full OCR text.
 */

export type OcrLogFields = {
  event: string;
  pageNumber?: number;
  inputType?: 'image' | 'pdf' | 'none' | 'unknown';
  durationMs?: number;
  byteSize?: number;
  ok?: boolean;
  reason?: string;
  status?: number;
};

const SECRETISH =
  /(bearer\s+\S+|eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9._-]+|[A-Za-z0-9+/]{80,}={0,2})/gi;

export function sanitizeLogReason(message: unknown): string {
  const raw = message instanceof Error ? message.message : String(message || 'unknown');
  return raw.slice(0, 200).replace(SECRETISH, '[redacted]');
}

export function logOcr(fields: OcrLogFields): void {
  const payload: Record<string, unknown> = {
    service: 'saudi-code-ocr',
    event: fields.event,
  };
  if (fields.pageNumber != null) payload.pageNumber = fields.pageNumber;
  if (fields.inputType) payload.inputType = fields.inputType;
  if (fields.durationMs != null) payload.durationMs = fields.durationMs;
  if (fields.byteSize != null) payload.byteSize = fields.byteSize;
  if (fields.ok != null) payload.ok = fields.ok;
  if (fields.reason) payload.reason = sanitizeLogReason(fields.reason);
  if (fields.status != null) payload.status = fields.status;
  // eslint-disable-next-line no-console
  console.info(JSON.stringify(payload));
}
