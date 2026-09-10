import { OcrHttpError } from './types.js';
import { getMaxDecodedBytes } from './limits.js';

export function decodeBase64Payload(
  value: unknown,
  label: 'image' | 'pdf'
): Buffer {
  if (typeof value !== 'string' || !value.trim()) {
    throw new OcrHttpError(400, `${label}_base64_missing`);
  }
  let raw = value.trim();
  // Strip data-URL prefix if present
  const dataUrl = /^data:[^;]+;base64,(.+)$/i.exec(raw);
  if (dataUrl) raw = dataUrl[1];

  let buf: Buffer;
  try {
    buf = Buffer.from(raw, 'base64');
  } catch {
    throw new OcrHttpError(400, `${label}_base64_invalid`);
  }
  if (!buf.byteLength) {
    throw new OcrHttpError(400, `${label}_base64_empty`);
  }
  // Detect obviously invalid base64 (Node silently ignores bad chars)
  const reencoded = buf.toString('base64').replace(/=+$/, '');
  const normalized = raw.replace(/\s+/g, '').replace(/=+$/, '');
  if (normalized.length > 32 && Math.abs(normalized.length - reencoded.length) > 8) {
    throw new OcrHttpError(400, `${label}_base64_invalid`);
  }

  const max = getMaxDecodedBytes();
  if (buf.byteLength > max) {
    throw new OcrHttpError(413, `${label}_payload_too_large`);
  }
  return buf;
}

export function parsePageNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 1) {
    return value;
  }
  if (typeof value === 'string' && /^\d+$/.test(value.trim())) {
    const n = Number(value.trim());
    if (Number.isInteger(n) && n >= 1) return n;
  }
  throw new OcrHttpError(400, 'invalid_page_number');
}

export function sniffImageExtension(buf: Buffer, mimeHint?: string | null): string {
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'png';
  if (buf[0] === 0xff && buf[1] === 0xd8) return 'jpg';
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return 'gif';
  if (buf[0] === 0x42 && buf[1] === 0x4d) return 'bmp';
  if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46) return 'webp';
  const mime = String(mimeHint || '').toLowerCase();
  if (mime.includes('png')) return 'png';
  if (mime.includes('jpeg') || mime.includes('jpg')) return 'jpg';
  if (mime.includes('webp')) return 'webp';
  return 'png';
}

export function assertPdfMagic(buf: Buffer): void {
  const head = buf.subarray(0, 5).toString('utf8');
  if (!head.startsWith('%PDF')) {
    throw new OcrHttpError(400, 'pdf_magic_invalid');
  }
}
