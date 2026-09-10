/**
 * Deterministic PDF extraction text-quality assessment for Design Intelligence.
 * Detects CID/ToUnicode garbage and fragmented Arabic without guessing spelling.
 * Never autocorrects engineering text — only scores usability.
 */

export type ExtractionQualityReason =
  | 'empty_text'
  | 'replacement_or_control_chars'
  | 'private_use_chars'
  | 'repeated_character_runs'
  | 'isolated_arabic_fragments'
  | 'fragmented_arabic_words'
  | 'low_useful_letter_ratio'
  | 'cid_garbage_pattern'
  | 'pathological_punctuation'
  | 'too_short_for_engineering_body';

export type ExtractionQualityAssessment = {
  usable: boolean;
  score: number;
  reasons: ExtractionQualityReason[];
  corruptionRatio: number;
  suspiciousRuns: number;
};

const ARABIC_LETTER_RE = /[\u0600-\u06FF]/g;
const LATIN_LETTER_RE = /[A-Za-z]/g;
const DIGIT_RE = /[0-9]/g;
const USEFUL_RE = /[\u0600-\u06FFA-Za-z0-9]/g;
const REPLACEMENT_OR_CONTROL_RE =
  /[\uFFFD\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g;
const PRIVATE_USE_RE = /[\uE000-\uF8FF]/g;
const REPEATED_CHAR_RUN_RE = /(.)\1{7,}/gu;
const PATHOLOGICAL_PUNCT_RE = /([^\w\u0600-\u06FF\s])\1{5,}/gu;
const CODE_OR_SECTION_RE =
  /\b(?:SBC|NFPA|UL|ISO|EN)[\s-]?\d+(?:\.\d+)*\b|\b\d+(?:\.\d+){1,4}\b/gi;

export const EXTRACTION_QUALITY_MIN_USABLE_SCORE = 0.55;

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function countMatches(text: string, re: RegExp): number {
  const flags = re.flags.includes('g') ? re.flags : `${re.flags}g`;
  const copy = new RegExp(re.source, flags);
  return (text.match(copy) || []).length;
}

/**
 * Assess whether extracted PDF/OCR text is usable as engineering evidence.
 * Mixed Arabic/English/section numbers/tables are allowed when structurally sane.
 */
export function assessExtractionTextQuality(
  text: string,
  opts?: { minChars?: number }
): ExtractionQualityAssessment {
  const trimmed = String(text || '').trim();
  const reasons: ExtractionQualityReason[] = [];
  let suspiciousRuns = 0;
  let penalty = 0;

  if (!trimmed) {
    return {
      usable: false,
      score: 0,
      reasons: ['empty_text'],
      corruptionRatio: 1,
      suspiciousRuns: 0,
    };
  }

  const len = trimmed.length;
  const useful = countMatches(trimmed, USEFUL_RE);
  const arabic = countMatches(trimmed, ARABIC_LETTER_RE);
  const latin = countMatches(trimmed, LATIN_LETTER_RE);
  const digits = countMatches(trimmed, DIGIT_RE);
  const usefulRatio = useful / Math.max(1, len);

  const replacement = countMatches(trimmed, REPLACEMENT_OR_CONTROL_RE);
  const privateUse = countMatches(trimmed, PRIVATE_USE_RE);
  const repeatedRuns = countMatches(trimmed, REPEATED_CHAR_RUN_RE);
  const punctSpam = countMatches(trimmed, PATHOLOGICAL_PUNCT_RE);
  suspiciousRuns += repeatedRuns + punctSpam;

  if (replacement > 0) {
    reasons.push('replacement_or_control_chars');
    penalty += Math.min(0.45, replacement / Math.max(20, len / 40));
  }
  if (privateUse > 0) {
    reasons.push('private_use_chars');
    penalty += Math.min(0.5, privateUse / Math.max(10, len / 50));
  }
  if (repeatedRuns > 0) {
    reasons.push('repeated_character_runs');
    // Long elongations are strong CID/garbage signals (e.g. اااااااا / xxxxxxxx)
    const longRunChars = (trimmed.match(/(.)\1{7,}/gu) || []).reduce((n, s) => n + s.length, 0);
    penalty += Math.min(0.7, repeatedRuns * 0.18 + longRunChars / Math.max(40, len));
  }
  if (punctSpam > 0) {
    reasons.push('pathological_punctuation');
    penalty += Math.min(0.25, punctSpam * 0.08);
  }

  const isoRe = /(?:^|[\s\u00A0])([\u0600-\u06FF]{1,2})(?=[\s\u00A0]|$)/gm;
  const isolated: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = isoRe.exec(trimmed))) isolated.push(m[1]);
  const shortArabicTokens = isolated.filter((t) => t.length <= 2);
  const arabicTokenDensity = shortArabicTokens.length / Math.max(1, Math.ceil(len / 40));
  if (arabic > 8 && shortArabicTokens.length >= 6 && arabicTokenDensity >= 0.35) {
    reasons.push('isolated_arabic_fragments');
    penalty += Math.min(0.45, shortArabicTokens.length * 0.04);
    suspiciousRuns += shortArabicTokens.length;
  }

  const arabicWords = trimmed.match(/[\u0600-\u06FF]{3,}/g) || [];
  const tinyArabic = trimmed.match(/(?:^|[\s])[\u0600-\u06FF]{1,2}(?=[\s]|$)/g) || [];
  // Broken CID often yields many 1–2 letter tokens with few/no real words
  if (arabic >= 12 && tinyArabic.length >= 5) {
    const tinyRatio =
      tinyArabic.length / Math.max(1, tinyArabic.length + arabicWords.length);
    if (arabicWords.length === 0 || tinyRatio >= 0.55) {
      reasons.push('fragmented_arabic_words');
      penalty += Math.min(0.5, 0.2 + tinyRatio * 0.35);
      suspiciousRuns += tinyArabic.length;
    }
  }

  const letterLike = arabic + latin + digits;
  const corruptionChars = replacement + privateUse;
  const benignPunct = (trimmed.match(/[\s.,;:()/%\-–—،؛؟\[\]{}'"`+*=]/g) || []).length;
  const unexplained = Math.max(0, len - useful - benignPunct);
  const corruptionRatio = clamp01(
    (corruptionChars + unexplained * 0.5 + repeatedRuns * 8) / Math.max(1, len)
  );

  if (corruptionRatio >= 0.22 && letterLike > 0) {
    reasons.push('cid_garbage_pattern');
    penalty += Math.min(0.4, corruptionRatio);
  }

  if (usefulRatio < 0.35 && len >= 40) {
    reasons.push('low_useful_letter_ratio');
    penalty += Math.min(0.35, 0.35 - usefulRatio);
  }

  const minChars = opts?.minChars ?? 12;
  const hasCodeToken = CODE_OR_SECTION_RE.test(trimmed);
  CODE_OR_SECTION_RE.lastIndex = 0;
  if (len < minChars && !hasCodeToken && letterLike < 6) {
    reasons.push('too_short_for_engineering_body');
    penalty += 0.25;
  }

  if (hasCodeToken || digits >= 4) penalty = Math.max(0, penalty - 0.08);
  if (arabicWords.length >= 4 && tinyArabic.length <= 2 && corruptionRatio < 0.12) {
    penalty = Math.max(0, penalty - 0.1);
  }

  const score = clamp01(1 - penalty);
  const usable =
    score >= EXTRACTION_QUALITY_MIN_USABLE_SCORE && !reasons.includes('empty_text');

  return {
    usable,
    score,
    reasons: [...new Set(reasons)],
    corruptionRatio,
    suspiciousRuns,
  };
}

export function pickBetterExtractionCandidate(
  a: { text: string; quality: ExtractionQualityAssessment; method: string },
  b: { text: string; quality: ExtractionQualityAssessment; method: string }
): { text: string; quality: ExtractionQualityAssessment; method: string } {
  if (a.quality.usable && !b.quality.usable) return a;
  if (b.quality.usable && !a.quality.usable) return b;
  if (b.quality.score !== a.quality.score) {
    return b.quality.score > a.quality.score ? b : a;
  }
  return b.text.trim().length > a.text.trim().length ? b : a;
}
