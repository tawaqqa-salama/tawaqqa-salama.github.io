/**
 * Canonical code-family helpers for Design Intelligence RAG.
 * Used for ingest routing, retrieval hard-filters, and citation display.
 * Never derive citation labels from the query alone.
 */

export type CanonicalCodeFamily =
  | 'NFPA-13'
  | 'NFPA-20'
  | 'NFPA'
  | 'SBC-801'
  | 'SBC-201'
  | 'SBC'
  | 'CIVIL_DEFENSE'
  | 'OTHER';

/** Broad families used for hard retrieval exclusion. */
export type BroadCodeFamily = 'NFPA' | 'SBC' | 'CIVIL_DEFENSE' | 'OTHER';

export type ResolvedSourceCode = {
  family: CanonicalCodeFamily;
  broad: BroadCodeFamily;
  /** Label safe to show in citations (never query-inferred). */
  displayCode: string | null;
  displayEdition: string | null;
  conflict: boolean;
  resolvedFrom: 'title' | 'code' | 'applicable_codes' | 'content' | 'unknown';
};

const SAUDI_TITLE_RE =
  /الكود\s*السعودي|الكود السعودي للحماية من الحريق|saudi\s*building\s*code|saudi\s*fire\s*code|\bSBC\b/i;

const NFPA13_RE = /nfpa\s*-?\s*13\b/i;
const NFPA20_RE = /nfpa\s*-?\s*20\b/i;
const SBC801_RE = /sbc\s*-?\s*801\b/i;
const SBC201_RE = /sbc\s*-?\s*201\b/i;

export function looksLikeSaudiFireCodeTitle(title: string | null | undefined): boolean {
  return SAUDI_TITLE_RE.test(String(title || ''));
}

export function normalizeCanonicalCodeFamily(
  raw: string | null | undefined
): CanonicalCodeFamily | null {
  const s = String(raw || '').trim();
  if (!s) return null;
  if (NFPA13_RE.test(s) || /^NFPA[\s-]*13$/i.test(s)) return 'NFPA-13';
  if (NFPA20_RE.test(s) || /^NFPA[\s-]*20$/i.test(s)) return 'NFPA-20';
  if (SBC801_RE.test(s) || /^SBC[\s-]*801$/i.test(s)) return 'SBC-801';
  if (SBC201_RE.test(s) || /^SBC[\s-]*201$/i.test(s)) return 'SBC-201';
  if (/\bNFPA\b/i.test(s) || /نفبا/i.test(s)) return 'NFPA';
  if (/\bSBC\b/i.test(s) || /سعودي/i.test(s) || /الكود\s*السعودي/i.test(s)) return 'SBC';
  if (/دفاع\s*مدني|civil\s*defense/i.test(s)) return 'CIVIL_DEFENSE';
  return null;
}

export function broadCodeFamily(family: CanonicalCodeFamily): BroadCodeFamily {
  if (family === 'NFPA-13' || family === 'NFPA-20' || family === 'NFPA') return 'NFPA';
  if (family === 'SBC-801' || family === 'SBC-201' || family === 'SBC') return 'SBC';
  if (family === 'CIVIL_DEFENSE') return 'CIVIL_DEFENSE';
  return 'OTHER';
}

export function familiesCompatible(
  requested: BroadCodeFamily,
  source: BroadCodeFamily
): boolean {
  if (requested === 'OTHER' || source === 'OTHER') return true;
  return requested === source;
}

/**
 * Infer requested broad families from the user question.
 * Used only for retrieval filtering — never for citation labels.
 */
export function inferRequestedBroadFamilies(question: string): BroadCodeFamily[] {
  const q = String(question || '');
  const families = new Set<BroadCodeFamily>();
  if (/\bNFPA\b/i.test(q) || /نفبا/i.test(q)) families.add('NFPA');
  if (
    /\bSBC\b/i.test(q) ||
    /الكود\s*السعودي/i.test(q) ||
    /الكود السعودي للحماية من الحريق/i.test(q)
  ) {
    families.add('SBC');
  }
  if (/الدفاع\s*المدني/i.test(q) || /civil\s*defense/i.test(q)) {
    families.add('CIVIL_DEFENSE');
  }
  return [...families];
}

export function inferCanonicalFamiliesFromQuery(question: string): CanonicalCodeFamily[] {
  const q = String(question || '');
  const out = new Set<CanonicalCodeFamily>();
  if (NFPA13_RE.test(q)) out.add('NFPA-13');
  else if (NFPA20_RE.test(q)) out.add('NFPA-20');
  else if (/\bNFPA\b/i.test(q) || /نفبا/i.test(q)) out.add('NFPA');
  if (SBC801_RE.test(q)) out.add('SBC-801');
  else if (SBC201_RE.test(q)) out.add('SBC-201');
  else if (
    /\bSBC\b/i.test(q) ||
    /الكود\s*السعودي/i.test(q) ||
    /الكود السعودي للحماية من الحريق/i.test(q)
  ) {
    out.add('SBC');
  }
  if (/الدفاع\s*المدني/i.test(q) || /civil\s*defense/i.test(q)) out.add('CIVIL_DEFENSE');
  return [...out];
}

function firstCanonical(
  values: Array<string | null | undefined>
): CanonicalCodeFamily | null {
  for (const v of values) {
    const n = normalizeCanonicalCodeFamily(v);
    if (n) return n;
  }
  return null;
}

/**
 * Resolve authoritative code family from persisted source metadata.
 * Title / Saudi Fire Code signals win over a conflicting NFPA-* code field
 * (common Production mislabel from workspace applicable_codes defaults).
 * Never uses the query text.
 */
export function resolveSourceCodeFamily(input: {
  code?: string | null;
  edition?: string | null;
  title?: string | null;
  applicableCodes?: string[] | null;
  contentSample?: string | null;
}): ResolvedSourceCode {
  const title = String(input.title || '');
  const codeField = String(input.code || '');
  const applicable = input.applicableCodes || [];
  const content = String(input.contentSample || '');

  const fromTitle = looksLikeSaudiFireCodeTitle(title)
    ? normalizeCanonicalCodeFamily(title) || ('SBC' as CanonicalCodeFamily)
    : normalizeCanonicalCodeFamily(title);
  const fromCode = normalizeCanonicalCodeFamily(codeField);
  const fromApplicable = firstCanonical(applicable);
  const fromContent = normalizeCanonicalCodeFamily(content.slice(0, 500));

  let family: CanonicalCodeFamily = 'OTHER';
  let resolvedFrom: ResolvedSourceCode['resolvedFrom'] = 'unknown';

  // Authoritative order: clear Saudi/SBC title > code field > applicable_codes > content
  if (fromTitle && broadCodeFamily(fromTitle) === 'SBC') {
    family = fromTitle;
    resolvedFrom = 'title';
  } else if (fromCode) {
    family = fromCode;
    resolvedFrom = 'code';
  } else if (fromTitle) {
    family = fromTitle;
    resolvedFrom = 'title';
  } else if (fromApplicable) {
    family = fromApplicable;
    resolvedFrom = 'applicable_codes';
  } else if (fromContent) {
    family = fromContent;
    resolvedFrom = 'content';
  }

  const conflict =
    Boolean(fromTitle && fromCode) &&
    broadCodeFamily(fromTitle!) !== broadCodeFamily(fromCode!);

  // Citation display: never show NFPA-* when the source title is clearly SBC/Saudi.
  let displayCode: string | null = codeField || null;
  let displayEdition: string | null = input.edition ? String(input.edition) : null;
  if (conflict && broadCodeFamily(family) === 'SBC') {
    displayCode =
      fromTitle === 'SBC-801'
        ? 'SBC-801'
        : fromTitle === 'SBC-201'
          ? 'SBC-201'
          : applicable.find((c) => /SBC/i.test(c)) || 'SBC';
    // Do not keep a conflicting NFPA edition on an SBC-titled document.
    if (fromCode && broadCodeFamily(fromCode) === 'NFPA') {
      displayEdition = null;
    }
  } else if (!displayCode && family !== 'OTHER') {
    displayCode = family;
  }

  return {
    family,
    broad: broadCodeFamily(family),
    displayCode,
    displayEdition,
    conflict,
    resolvedFrom,
  };
}

/**
 * Ingest routing: true only when the document itself is NFPA-13, not merely
 * because workspace applicable_codes happen to list NFPA 13 alongside SBC.
 */
export function shouldRouteAsNfpa13Document(input: {
  fileName: string;
  title: string;
  codes: string[];
}): boolean {
  const fileName = String(input.fileName || '');
  const title = String(input.title || '');
  const codes = input.codes || [];

  // Saudi / SBC titled documents must never be forced into the NFPA-13 pipeline
  // even when the workspace default codes include "NFPA 13".
  if (looksLikeSaudiFireCodeTitle(title) || looksLikeSaudiFireCodeTitle(fileName)) {
    return false;
  }

  if (NFPA13_RE.test(fileName) || NFPA13_RE.test(title)) return true;

  const nfpa13Codes = codes.filter((c) => NFPA13_RE.test(c));
  const sbcCodes = codes.filter(
    (c) => /\bSBC\b/i.test(c) || /سعودي/i.test(c) || /الكود\s*السعودي/i.test(c)
  );
  // Only route via codes when NFPA-13 is present without competing SBC codes.
  if (nfpa13Codes.length && sbcCodes.length === 0) return true;
  return false;
}

export class ChunkDocumentCodeConflictError extends Error {
  code = 'chunk_document_code_conflict';
  constructor(message: string) {
    super(message);
    this.name = 'ChunkDocumentCodeConflictError';
  }
}

/**
 * Fail closed when a chunk's code family contradicts its parent document.
 * Call before indexing. Does not mutate Production rows.
 */
export function assertChunkDocumentCodeConsistency(input: {
  documentCode?: string | null;
  documentTitle?: string | null;
  chunkCode?: string | null;
}): void {
  const docResolved = resolveSourceCodeFamily({
    code: input.documentCode,
    title: input.documentTitle,
  });
  if (!input.chunkCode) return;
  const chunkFamily = normalizeCanonicalCodeFamily(input.chunkCode);
  if (!chunkFamily || docResolved.family === 'OTHER') return;
  if (broadCodeFamily(chunkFamily) !== docResolved.broad) {
    throw new ChunkDocumentCodeConflictError(
      `chunk code ${input.chunkCode} conflicts with document code family ${docResolved.family}`
    );
  }
}

/** Align chunk code to parent document when blank; reject hard conflicts. */
export function reconcileChunkCodeWithDocument(input: {
  documentCode?: string | null;
  documentTitle?: string | null;
  chunkCode?: string | null;
}): string | null {
  assertChunkDocumentCodeConsistency(input);
  if (input.chunkCode) return String(input.chunkCode);
  return input.documentCode ? String(input.documentCode) : null;
}

/** Sprinkler / coverage topic terms (Arabic + English). */
const SPRINKLER_TOPIC_RE =
  /رشاش|مرشات|sprinkler|coverage|تباعد|تغطية|spacing|density|k-factor|hydraulic/i;
const STAIR_TOPIC_RE = /درج|سلالم|stair|exit\s*stair|exterior\s*stair|means\s*of\s*egress/i;
const PUMP_TOPIC_RE = /مضخة|مضخات|fire\s*pump|pump\s*room|NFPA\s*-?\s*20|suction|discharge/i;

export type QueryTopic = 'sprinkler' | 'fire_pump' | 'general';

export function inferQueryTopic(question: string): QueryTopic {
  const q = String(question || '');
  if (PUMP_TOPIC_RE.test(q)) return 'fire_pump';
  if (SPRINKLER_TOPIC_RE.test(q)) return 'sprinkler';
  return 'general';
}

/**
 * Return true when chunk content is on-topic for the query.
 * Wrong-topic chunks (e.g. stairs for sprinkler spacing) fail closed.
 */
export function chunkMatchesQueryTopic(question: string, content: string): boolean {
  const topic = inferQueryTopic(question);
  const text = String(content || '');
  if (topic === 'general') return true;
  if (topic === 'sprinkler') {
    if (STAIR_TOPIC_RE.test(text) && !SPRINKLER_TOPIC_RE.test(text)) return false;
    return SPRINKLER_TOPIC_RE.test(text);
  }
  if (topic === 'fire_pump') {
    return PUMP_TOPIC_RE.test(text);
  }
  return true;
}
