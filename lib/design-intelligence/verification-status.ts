/**
 * Explicit positive verification semantics for Design Intelligence knowledge sources.
 * Do NOT use substring regex matching — "NOT_VERIFIED" contains "VERIFIED".
 */

const VERIFIED_STATUSES = new Set([
  'VERIFIED',
  'VERIFIED_OFFICIAL',
  'OFFICIALLY_VERIFIED',
]);

export function isVerifiedKnowledgeStatus(value?: string | null): boolean {
  const normalized = String(value || '').trim().toUpperCase();
  if (!normalized) return false;
  return VERIFIED_STATUSES.has(normalized);
}

/**
 * Show "indexed but not engineering-verified" when metadata exists and
 * neither source nor document status is an explicit positive verified value.
 */
export function shouldWarnUnverifiedKnowledgeSource(input: {
  sourceVerificationStatus?: string | null;
  documentVerificationStatus?: string | null;
  platformVerificationStatus?: string | null;
}): boolean {
  const sourceVerified = isVerifiedKnowledgeStatus(input.sourceVerificationStatus);
  const documentVerified = isVerifiedKnowledgeStatus(input.documentVerificationStatus);
  const platformVerified = isVerifiedKnowledgeStatus(input.platformVerificationStatus);
  const hasVerificationMetadata =
    Boolean(input.sourceVerificationStatus) ||
    Boolean(input.documentVerificationStatus) ||
    Boolean(input.platformVerificationStatus);

  return (
    hasVerificationMetadata &&
    !(sourceVerified || documentVerified || platformVerified)
  );
}
