import { sha256Base64 } from '@/lib/zatca/crypto';
import { ZATCA_FIRST_PIH } from '@/lib/zatca/constants';

/**
 * تجهيز XML لاحتساب الـ Hash وفق إرشادات ZATCA المبسّطة:
 * إزالة UBLExtensions و Signature و مرجع QR ثم SHA-256 + Base64.
 */
export function prepareXmlForHash(xml: string): string {
  let cleaned = xml
    .replace(/<\?xml[^>]*\?>/gi, '')
    .replace(/<ext:UBLExtensions[\s\S]*?<\/ext:UBLExtensions>/gi, '')
    .replace(/<cac:Signature[\s\S]*?<\/cac:Signature>/gi, '')
    .replace(
      /<cac:AdditionalDocumentReference>[\s\S]*?<cbc:ID>\s*QR\s*<\/cbc:ID>[\s\S]*?<\/cac:AdditionalDocumentReference>/gi,
      ''
    )
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .trim();

  return cleaned;
}

export function computeInvoiceHash(xml: string): string {
  return sha256Base64(prepareXmlForHash(xml));
}

export function getInitialPreviousInvoiceHash(): string {
  return ZATCA_FIRST_PIH;
}
