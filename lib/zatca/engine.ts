import {
  extractPrivateKeyHex,
  generateInvoiceUuid,
  getPublicKeyBase64FromPrivate,
  sha256Bytes,
  signHashDetached,
} from '@/lib/zatca/crypto';
import { computeInvoiceHash, getInitialPreviousInvoiceHash } from '@/lib/zatca/hash';
import { buildPhase2QrBase64 } from '@/lib/zatca/qr';
import { buildUblInvoiceXml, injectQrAndHash } from '@/lib/zatca/ubl-xml';
import type { ZatcaBuiltInvoice, ZatcaInvoiceInput } from '@/lib/zatca/types';

function moneyPlain(value: number): string {
  return (Math.round(Number(value || 0) * 100) / 100).toFixed(2);
}

export function createInvoiceUuid(): string {
  return generateInvoiceUuid();
}

export function resolvePreviousInvoiceHash(previousHash?: string | null): string {
  return previousHash && previousHash.trim() ? previousHash.trim() : getInitialPreviousInvoiceHash();
}

/**
 * محرك ZATCA: UUID + PIH + UBL XML + Hash + QR Phase 2 (+ توقيع إن توفر المفتاح).
 */
export function buildZatcaInvoice(
  input: Omit<ZatcaInvoiceInput, 'uuid' | 'previousInvoiceHash'> & {
    uuid?: string;
    previousInvoiceHash?: string | null;
    privateKeyPemOrHex?: string | null;
  }
): ZatcaBuiltInvoice {
  const uuid = input.uuid || createInvoiceUuid();
  const previousInvoiceHash = resolvePreviousInvoiceHash(input.previousInvoiceHash);

  const draftInput: ZatcaInvoiceInput = {
    ...input,
    uuid,
    previousInvoiceHash,
  };

  const draftXml = buildUblInvoiceXml(draftInput, {
    invoiceHashPlaceholder: '',
    qrBase64: '',
  });

  const invoiceHash = computeInvoiceHash(draftXml);
  const issueTimestamp = `${draftInput.issueDate}T${draftInput.issueTime}`;

  let signatureBase64: string | undefined;
  let publicKeyBase64: string | undefined;
  const keyHex = extractPrivateKeyHex(input.privateKeyPemOrHex || '');
  if (keyHex) {
    signatureBase64 = signHashDetached(keyHex, sha256Bytes(invoiceHash));
    publicKeyBase64 = getPublicKeyBase64FromPrivate(keyHex);
  }

  const qrBase64 = buildPhase2QrBase64({
    sellerName: draftInput.seller.name,
    vatNumber: draftInput.seller.vatNumber,
    timestamp: issueTimestamp,
    invoiceTotal: moneyPlain(draftInput.payableAmount),
    vatTotal: moneyPlain(draftInput.taxAmount),
    invoiceHash,
    signatureBase64,
    publicKeyBase64,
  });

  const xml = injectQrAndHash(draftXml, invoiceHash, qrBase64);

  return {
    uuid,
    invoiceNumber: draftInput.invoiceNumber,
    invoiceHash,
    previousInvoiceHash,
    qrBase64,
    xml,
    signedXml: xml,
  };
}
