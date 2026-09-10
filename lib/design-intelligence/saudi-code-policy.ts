/**
 * Saudi-code-only eligibility for Design Intelligence knowledge retrieval.
 *
 * Application-level policy — does not delete Production rows.
 * Prefer verified document identity / corrected metadata over historical
 * mislabels (Saudi PDFs were previously labeled NFPA in some rows).
 */

import {
  SAUDI_ONLY_CLEANUP_COMPANY_ID,
  SAUDI_ONLY_CLEANUP_NFPA_DOC_ID,
  SAUDI_ONLY_CLEANUP_SAUDI_DOC_ID,
} from '@/lib/design-intelligence/saudi-only-knowledge-cleanup';

/** Production retained Saudi source (SBC-801 / 2018). */
export const SAUDI_POLICY_RETAINED_DOCUMENT_ID = SAUDI_ONLY_CLEANUP_SAUDI_DOC_ID;
export const SAUDI_POLICY_RETAINED_COMPANY_ID = SAUDI_ONLY_CLEANUP_COMPANY_ID;
export const SAUDI_POLICY_RETAINED_CODE = 'SBC-801';
export const SAUDI_POLICY_RETAINED_EDITION = '2018';
export const SAUDI_POLICY_EXCLUDED_NFPA_DOCUMENT_ID = SAUDI_ONLY_CLEANUP_NFPA_DOC_ID;

export type SaudiPolicyDocumentView = {
  id?: string | null;
  company_id?: string | null;
  title?: string | null;
  code?: string | null;
  edition?: string | null;
  applicable_codes?: string[] | null;
  category?: string | null;
  source_kind?: string | null;
  source_type?: string | null;
  source_document_id?: string | null;
  storage_path?: string | null;
  file_name?: string | null;
  deleted_at?: string | null;
  status?: string | null;
  index_status?: string | null;
  ingestion_status?: string | null;
};

function norm(value: unknown): string {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[_ ]+/g, '-');
}

function haystack(doc: SaudiPolicyDocumentView): string {
  return [
    doc.id,
    doc.title,
    doc.code,
    doc.edition,
    doc.category,
    doc.source_kind,
    doc.source_type,
    doc.source_document_id,
    doc.storage_path,
    doc.file_name,
    ...(doc.applicable_codes || []),
  ]
    .filter(Boolean)
    .join(' ');
}

export function isSaudiBuildingCodeToken(value: unknown): boolean {
  const c = norm(value);
  if (!c) return false;
  if (c === 'SBC' || c.startsWith('SBC-') || c.startsWith('SBC/')) return true;
  if (/^SBC\d/.test(c)) return true;
  const raw = String(value || '');
  if (/الكود\s*السعودي/i.test(raw) || /Saudi\s*Building\s*Code/i.test(raw)) return true;
  return false;
}

export function isNfpaCodeToken(value: unknown): boolean {
  const c = norm(value);
  if (!c) return false;
  return c === 'NFPA' || c.startsWith('NFPA-') || c.startsWith('NFPA/') || /^NFPA\d/.test(c);
}

/**
 * True when the document is an allowed Saudi engineering authority source.
 * Known retained SBC-801 identity wins even if historical rows were mislabeled NFPA.
 */
export function isSaudiPolicyEligibleDocument(
  doc: SaudiPolicyDocumentView | null | undefined
): boolean {
  if (!doc) return false;
  if (doc.deleted_at) return false;
  if (String(doc.status || '').toLowerCase() === 'superseded') return false;

  const id = String(doc.id || '');
  if (id === SAUDI_POLICY_EXCLUDED_NFPA_DOCUMENT_ID) return false;
  if (id === SAUDI_POLICY_RETAINED_DOCUMENT_ID) return true;

  const code = doc.code;
  const applicable = doc.applicable_codes || [];
  const hay = haystack(doc);

  if (isSaudiBuildingCodeToken(code)) return true;
  if (applicable.some((c) => isSaudiBuildingCodeToken(c))) {
    if (isNfpaCodeToken(code) && !isSaudiBuildingCodeToken(code)) return false;
    return true;
  }

  if (/SBC-?801/i.test(hay) || /SBC\s*801/i.test(hay)) {
    if (
      /code-knowledge\/NFPA/i.test(String(doc.storage_path || '')) &&
      !/SBC/i.test(String(doc.storage_path || ''))
    ) {
      return false;
    }
    return true;
  }

  if (isNfpaCodeToken(code)) return false;
  if (/code-knowledge\/NFPA/i.test(String(doc.storage_path || ''))) return false;
  if (/\bNFPA\b/i.test(hay) && !/\bSBC\b/i.test(hay) && !/سعودي/i.test(hay)) return false;

  return false;
}

export function isSaudiPolicyEligibleChunk(
  chunk: { code?: string | null; document_id?: string | null },
  doc?: SaudiPolicyDocumentView | null
): boolean {
  if (doc) return isSaudiPolicyEligibleDocument(doc);
  if (chunk.document_id === SAUDI_POLICY_RETAINED_DOCUMENT_ID) return true;
  if (isSaudiBuildingCodeToken(chunk.code)) return true;
  if (isNfpaCodeToken(chunk.code)) return false;
  return false;
}

export type SaudiPolicyAuditFinding = {
  documentId: string;
  title?: string | null;
  code?: string | null;
  edition?: string | null;
  eligible: boolean;
  reason: string;
};

/** Audit helper for remaining non-Saudi records (no DB mutation). */
export function buildSaudiPolicyAuditReport(docs: SaudiPolicyDocumentView[]): {
  eligible: SaudiPolicyAuditFinding[];
  excluded: SaudiPolicyAuditFinding[];
  retainedProductionTarget: {
    documentId: string;
    companyId: string;
    code: string;
    edition: string;
  };
} {
  const eligible: SaudiPolicyAuditFinding[] = [];
  const excluded: SaudiPolicyAuditFinding[] = [];
  for (const doc of docs) {
    const id = String(doc.id || '');
    if (!id) continue;
    const ok = isSaudiPolicyEligibleDocument(doc);
    const finding: SaudiPolicyAuditFinding = {
      documentId: id,
      title: doc.title,
      code: doc.code,
      edition: doc.edition,
      eligible: ok,
      reason: ok
        ? id === SAUDI_POLICY_RETAINED_DOCUMENT_ID
          ? 'verified_retained_sbc801_identity'
          : isSaudiBuildingCodeToken(doc.code)
            ? 'saudi_code_metadata'
            : 'saudi_identity_signals'
        : isNfpaCodeToken(doc.code) || id === SAUDI_POLICY_EXCLUDED_NFPA_DOCUMENT_ID
          ? 'nfpa_or_non_saudi_excluded'
          : doc.deleted_at
            ? 'soft_deleted'
            : 'default_deny_not_saudi',
    };
    (ok ? eligible : excluded).push(finding);
  }
  return {
    eligible,
    excluded,
    retainedProductionTarget: {
      documentId: SAUDI_POLICY_RETAINED_DOCUMENT_ID,
      companyId: SAUDI_POLICY_RETAINED_COMPANY_ID,
      code: SAUDI_POLICY_RETAINED_CODE,
      edition: SAUDI_POLICY_RETAINED_EDITION,
    },
  };
}
