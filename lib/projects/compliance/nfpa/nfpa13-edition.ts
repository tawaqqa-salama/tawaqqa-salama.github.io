/**
 * NFPA 13 edition adoption metadata — traceability only.
 *
 * A project may adopt an edition when the cover/identity of a
 * PROJECT_PROVIDED_DOCUMENT is recorded. This does NOT:
 * - mark platform rules VERIFIED_OFFICIAL
 * - store the copyrighted NFPA document body
 * - invent numeric table cells
 *
 * Cover identification alone → tables remain RULE_NOT_CONFIGURED until
 * exact section/table/applicability are verified from the source.
 */

export const NFPA13_CODE = 'NFPA-13' as const;

export type Nfpa13AdoptionStatus = 'PROJECT_ADOPTED' | 'NOT_ADOPTED';

export type Nfpa13SourceType =
  | 'PROJECT_PROVIDED_DOCUMENT'
  | 'PLATFORM_CATALOG'
  | 'UNKNOWN';

/**
 * Project-level verification of edition identity (cover).
 * Never equals VERIFIED_OFFICIAL for platform table encoding.
 */
export type Nfpa13VerificationStatus =
  | 'PROJECT_COVER_IDENTIFIED'
  | 'TABLES_NOT_VERIFIED'
  | 'UNVERIFIED';

/** Platform catalog status — remains non-official until maintainers encode tables. */
export type Nfpa13PlatformVerificationStatus =
  | 'NOT_VERIFIED_OFFICIAL'
  | 'VERIFIED_OFFICIAL';

export type Nfpa13EditionAdoption = {
  code: typeof NFPA13_CODE;
  edition: string;
  /** Cover title when recorded — metadata only */
  title?: string | null;
  adoption_status: Nfpa13AdoptionStatus;
  source_type: Nfpa13SourceType;
  /** Reference / document ID only — never the PDF body */
  source_document_id: string;
  verification_status: Nfpa13VerificationStatus;
  /**
   * Explicit: platform numeric encoding is NOT verified from this adoption alone.
   * Must remain NOT_VERIFIED_OFFICIAL unless maintainers encode verified cells.
   */
  platform_verification_status: Nfpa13PlatformVerificationStatus;
  recorded_at?: string | null;
  notes_ar?: string | null;
  notes_en?: string | null;
};

/**
 * Recorded when a project-provided NFPA 13 document cover identifies
 * Code NFPA 13 / Edition 2025 / Installation of Sprinkler Systems.
 * Metadata only — copyrighted text is not stored.
 */
export const NFPA13_2025_PROJECT_ADOPTION_TEMPLATE: Nfpa13EditionAdoption = {
  code: 'NFPA-13',
  edition: '2025',
  title: 'Standard for the Installation of Sprinkler Systems',
  adoption_status: 'PROJECT_ADOPTED',
  source_type: 'PROJECT_PROVIDED_DOCUMENT',
  source_document_id: 'project_provided:NFPA-13-2025-cover',
  verification_status: 'PROJECT_COVER_IDENTIFIED',
  platform_verification_status: 'NOT_VERIFIED_OFFICIAL',
  notes_ar:
    'تم تبني الطبعة 2025 من غلاف وثيقة مقدمة للمشروع فقط. جداول المنصة غير مرمّزة رسميًا — RULE_NOT_CONFIGURED حتى التحقق من القسم/الجدول.',
  notes_en:
    'Edition 2025 adopted from project-provided document cover only. Platform tables are NOT VERIFIED_OFFICIAL — RULE_NOT_CONFIGURED until section/table cells are verified.',
};

export function isValidNfpa13EditionAdoption(
  meta: Nfpa13EditionAdoption | null | undefined
): meta is Nfpa13EditionAdoption {
  if (!meta) return false;
  if (meta.code !== NFPA13_CODE) return false;
  if (!String(meta.edition || '').trim()) return false;
  if (meta.adoption_status !== 'PROJECT_ADOPTED') return false;
  if (!String(meta.source_type || '').trim()) return false;
  if (!String(meta.source_document_id || '').trim()) return false;
  if (!String(meta.verification_status || '').trim()) return false;
  if (meta.platform_verification_status === 'VERIFIED_OFFICIAL') {
    // Cover-only adoption must never claim platform official verification
    return false;
  }
  return true;
}

/**
 * Build project-adopted 2025 metadata from cover identification.
 * Does not embed or copy document bytes.
 */
export function buildNfpa13_2025ProjectAdoption(params?: {
  source_document_id?: string;
  recorded_at?: string | null;
}): Nfpa13EditionAdoption {
  return {
    ...NFPA13_2025_PROJECT_ADOPTION_TEMPLATE,
    source_document_id:
      String(params?.source_document_id || '').trim() ||
      NFPA13_2025_PROJECT_ADOPTION_TEMPLATE.source_document_id,
    recorded_at: params?.recorded_at ?? new Date().toISOString(),
    platform_verification_status: 'NOT_VERIFIED_OFFICIAL',
    verification_status: 'PROJECT_COVER_IDENTIFIED',
    adoption_status: 'PROJECT_ADOPTED',
    source_type: 'PROJECT_PROVIDED_DOCUMENT',
  };
}

export function parseNfpa13EditionAdoption(
  raw: unknown
): Nfpa13EditionAdoption | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const meta: Nfpa13EditionAdoption = {
    code: 'NFPA-13',
    edition: String(o.edition || '').trim(),
    title: o.title != null ? String(o.title) : null,
    adoption_status: o.adoption_status as Nfpa13AdoptionStatus,
    source_type: o.source_type as Nfpa13SourceType,
    source_document_id: String(o.source_document_id || '').trim(),
    verification_status: o.verification_status as Nfpa13VerificationStatus,
    platform_verification_status:
      (o.platform_verification_status as Nfpa13PlatformVerificationStatus) ||
      'NOT_VERIFIED_OFFICIAL',
    recorded_at: o.recorded_at != null ? String(o.recorded_at) : null,
    notes_ar: o.notes_ar != null ? String(o.notes_ar) : null,
    notes_en: o.notes_en != null ? String(o.notes_en) : null,
  };
  return isValidNfpa13EditionAdoption(meta) ? meta : null;
}
