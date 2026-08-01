import { sha256 } from '@noble/hashes/sha2.js';
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';

function getWebCrypto(): Crypto {
  if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto.subtle) {
    return globalThis.crypto;
  }
  throw new Error('Web Crypto API غير متوفر في هذه البيئة');
}

export function generateInvoiceUuid(): string {
  return getWebCrypto().randomUUID();
}

export function bytesToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }
  let binary = '';
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary);
}

export function base64ToBytes(value: string): Uint8Array {
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(value, 'base64'));
  }
  const binary = atob(value);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

export function sha256Bytes(data: Uint8Array | string): Uint8Array {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  return sha256(bytes);
}

export function sha256Base64(data: Uint8Array | string): string {
  return bytesToBase64(sha256Bytes(data));
}

export function sha256Hex(data: Uint8Array | string): string {
  return bytesToHex(sha256Bytes(data));
}

/** توليد زوج مفاتيح ECDSA secp256k1 لجهاز EGS */
export function generateEgsKeyPair(): { privateKeyHex: string; publicKeyHex: string; privateKeyPem: string } {
  const privateKey = secp256k1.utils.randomSecretKey();
  const publicKey = secp256k1.getPublicKey(privateKey, true);
  const privateKeyHex = bytesToHex(privateKey);
  const publicKeyHex = bytesToHex(publicKey);
  const privateKeyPem = [
    '-----BEGIN EC PRIVATE KEY-----',
    ...chunkBase64(bytesToBase64(privateKey)),
    '-----END EC PRIVATE KEY-----',
  ].join('\n');
  return { privateKeyHex, publicKeyHex, privateKeyPem };
}

function chunkBase64(value: string, size = 64): string[] {
  const rows: string[] = [];
  for (let i = 0; i < value.length; i += size) rows.push(value.slice(i, i + size));
  return rows;
}

export function extractPrivateKeyHex(privateKeyPemOrHex: string): string | null {
  const trimmed = privateKeyPemOrHex.trim();
  if (!trimmed) return null;
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) return trimmed.toLowerCase();
  const match = trimmed.match(/-----BEGIN [^-]+-----([\s\S]+?)-----END [^-]+-----/);
  if (!match) return null;
  const body = match[1].replace(/\s+/g, '');
  try {
    const bytes = base64ToBytes(body);
    // مفتاح خام 32 بايت أو DER أطول — نأخذ آخر 32 بايت كمفتاح إن لزم
    if (bytes.length === 32) return bytesToHex(bytes);
    if (bytes.length > 32) return bytesToHex(bytes.slice(bytes.length - 32));
  } catch {
    return null;
  }
  return null;
}

export function signHashDetached(privateKeyHex: string, hashBytes: Uint8Array): string {
  const key = hexToBytes(privateKeyHex);
  const signature = secp256k1.sign(hashBytes, key);
  const bytes =
    signature instanceof Uint8Array
      ? signature
      : typeof (signature as { toBytes?: (fmt?: string) => Uint8Array }).toBytes === 'function'
        ? (signature as { toBytes: (fmt?: string) => Uint8Array }).toBytes('compact')
        : new Uint8Array(signature as ArrayLike<number>);
  return bytesToBase64(bytes);
}

export function getPublicKeyBase64FromPrivate(privateKeyHex: string): string {
  const pub = secp256k1.getPublicKey(hexToBytes(privateKeyHex), false);
  return bytesToBase64(pub);
}
