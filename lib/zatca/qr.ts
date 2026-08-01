import { bytesToBase64 } from '@/lib/zatca/crypto';

/**
 * Phase 2 QR — TLV (Tag-Length-Value) ثم Base64.
 * Tags: 1 اسم المنشأة، 2 الرقم الضريبي، 3 التاريخ، 4 الإجمالي، 5 الضريبة، 6 Hash
 *         7 التوقيع، 8 المفتاح العام، 9 ختم ZATCA (اختياري حتى Clearance)
 */
export function encodeTlv(tag: number, value: string | Uint8Array): Uint8Array {
  const valueBytes = typeof value === 'string' ? new TextEncoder().encode(value) : value;
  if (valueBytes.length > 255) {
    throw new Error(`قيمة QR tag ${tag} أطول من 255 بايت`);
  }
  const out = new Uint8Array(2 + valueBytes.length);
  out[0] = tag;
  out[1] = valueBytes.length;
  out.set(valueBytes, 2);
  return out;
}

export function concatBytes(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

export type ZatcaQrPayload = {
  sellerName: string;
  vatNumber: string;
  timestamp: string;
  invoiceTotal: string;
  vatTotal: string;
  invoiceHash: string;
  signatureBase64?: string;
  publicKeyBase64?: string;
  cryptographicStampBase64?: string;
};

export function buildPhase2QrBase64(payload: ZatcaQrPayload): string {
  const parts = [
    encodeTlv(1, payload.sellerName),
    encodeTlv(2, payload.vatNumber),
    encodeTlv(3, payload.timestamp),
    encodeTlv(4, payload.invoiceTotal),
    encodeTlv(5, payload.vatTotal),
    encodeTlv(6, payload.invoiceHash),
  ];

  if (payload.signatureBase64) parts.push(encodeTlv(7, payload.signatureBase64));
  if (payload.publicKeyBase64) parts.push(encodeTlv(8, payload.publicKeyBase64));
  if (payload.cryptographicStampBase64) parts.push(encodeTlv(9, payload.cryptographicStampBase64));

  return bytesToBase64(concatBytes(parts));
}
