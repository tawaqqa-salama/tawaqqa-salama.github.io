/** Hard limits for the OCR HTTP service. */

export const DEFAULT_PORT = 8080;
export const DEFAULT_OCR_TIMEOUT_MS = 40_000;
/** Max JSON request body (raw HTTP). */
export const MAX_BODY_BYTES = 18 * 1024 * 1024;
/** Max decoded image or PDF bytes after base64 decode. */
export const MAX_DECODED_BYTES = 12 * 1024 * 1024;
/** Raster DPI for PDF pages (200–300). */
export const PDF_RASTER_DPI = 250;

export function getOcrTimeoutMs(): number {
  const raw = Number(process.env.OCR_TIMEOUT_MS || DEFAULT_OCR_TIMEOUT_MS);
  if (!Number.isFinite(raw) || raw < 1_000) return DEFAULT_OCR_TIMEOUT_MS;
  return Math.min(60_000, Math.floor(raw));
}

export function getMaxBodyBytes(): number {
  const raw = Number(process.env.OCR_MAX_BODY_BYTES || MAX_BODY_BYTES);
  if (!Number.isFinite(raw) || raw < 1_024) return MAX_BODY_BYTES;
  return Math.min(32 * 1024 * 1024, Math.floor(raw));
}

export function getMaxDecodedBytes(): number {
  const raw = Number(process.env.OCR_MAX_DECODED_BYTES || MAX_DECODED_BYTES);
  if (!Number.isFinite(raw) || raw < 1_024) return MAX_DECODED_BYTES;
  return Math.min(24 * 1024 * 1024, Math.floor(raw));
}
