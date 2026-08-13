/**
 * SHA-256 helpers for Code Knowledge deduplication / versioning.
 * Browser + Node compatible. Large Blobs/Files are hashed in chunks so
 * Safari/iPhone do not need a second full-file ArrayBuffer before TUS.
 */

import { sha256 as nobleSha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';

/** Chunk size for streaming Blob/File digests (~1 MiB). */
export const SHA256_STREAM_CHUNK_BYTES = 1024 * 1024;

export async function sha256HexFromBytes(bytes: ArrayBuffer | Uint8Array): Promise<string> {
  const data =
    bytes instanceof Uint8Array
      ? bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
      : bytes;

  if (typeof globalThis.crypto?.subtle?.digest === 'function') {
    const digest = await globalThis.crypto.subtle.digest('SHA-256', data as ArrayBuffer);
    return bufferToHex(new Uint8Array(digest));
  }

  const { createHash } = await import('node:crypto');
  const hash = createHash('sha256');
  hash.update(Buffer.from(data as ArrayBuffer));
  return hash.digest('hex');
}

export async function sha256HexFromText(text: string): Promise<string> {
  return sha256HexFromBytes(new TextEncoder().encode(text));
}

/**
 * Incremental SHA-256 over a Blob/File without loading the entire body at once.
 * Prefer this for large PDFs before TUS upload.
 */
export async function sha256HexFromBlob(
  blob: Blob,
  chunkSize: number = SHA256_STREAM_CHUNK_BYTES
): Promise<string> {
  const size = typeof blob.size === 'number' ? blob.size : 0;
  if (size <= 0) {
    return sha256HexFromBytes(new Uint8Array(0));
  }

  // Small bodies: one shot (matches existing path / tests).
  if (size <= chunkSize) {
    const buf = await blob.arrayBuffer();
    return sha256HexFromBytes(buf);
  }

  const hasher = nobleSha256.create();
  let offset = 0;
  while (offset < size) {
    const end = Math.min(offset + chunkSize, size);
    const part = blob.slice(offset, end);
    const ab = await part.arrayBuffer();
    hasher.update(new Uint8Array(ab));
    offset = end;
  }
  return bytesToHex(hasher.digest());
}

function bufferToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
