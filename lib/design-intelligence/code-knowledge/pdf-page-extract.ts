/**
 * Page-preserving PDF text extraction for Code Knowledge / Knowledge Base.
 * Reads bytes already obtained from Supabase Storage / File picker —
 * never fetches external PDFs. Uses local pdfjs worker (no CDN).
 *
 * Coordinate-aware reconstruction preserves line breaks and reading order.
 * Never reverses Unicode characters or Arabic presentation forms.
 */

import type { ExtractionMethod } from '@/lib/design-intelligence/code-knowledge/types';
import { openPdfDocumentFromBytes } from '@/lib/design-intelligence/pdfjs-runtime';

export type ExtractedPdfPage = {
  page: number;
  text: string;
  extraction_method: ExtractionMethod;
  quality_score?: number;
  quality_reasons?: string[];
  quality_usable?: boolean;
  extraction_diagnostic?: string | null;
};

export type PdfPageExtractResult = {
  pages: ExtractedPdfPage[];
  page_count: number;
  pages_extracted: number;
  pages_ocr: number;
  pages_rejected: number;
  combined_text: string;
  extraction_method: ExtractionMethod;
  ocr_used: boolean;
};

export type PositionedTextItem = {
  str: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  /** Original PDF.js item order — used when logical order already reads well. */
  order?: number;
  /** PDF.js TextItem.hasEOL — hard line break after this run. */
  hasEOL?: boolean;
  /** PDF.js TextItem.dir when present (`ttb` / `ltr` / `rtl`). */
  dir?: string;
};

const FORM_FEED = '\f';
const ARABIC_RE = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/g;
const ZERO_WIDTH_RE = /[\u200B-\u200D\uFEFF]/g;
const CODE_TOKEN_RE =
  /\b(?:NFPA|SBC|UL|ISO|EN)[\s-]?\d+(?:\.\d+)*\b|\b\d+(?:\.\d+){1,4}\b|§\s*\d+(?:\.\d+)*\b|Table\s+\d+(?:\.\d+)*\b/gi;

function countArabic(text: string): number {
  return (text.match(ARABIC_RE) || []).length;
}

function countLatin(text: string): number {
  return (text.match(/[A-Za-z]/g) || []).length;
}

function isArabicDominant(text: string): boolean {
  const ar = countArabic(text);
  const la = countLatin(text);
  if (ar === 0 && la === 0) return false;
  return ar >= la;
}

function normalizeSafeWhitespace(text: string): string {
  return text
    .replace(ZERO_WIDTH_RE, '')
    .replace(/[^\S\n]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Reconstruct logical page text from positioned PDF.js items.
 * Preserves line breaks; never reverses string content or numeric tokens.
 */
export function reconstructPageText(
  items: Array<
    | PositionedTextItem
    | {
        str?: string;
        transform?: number[];
        width?: number;
        height?: number;
        hasEOL?: boolean;
        dir?: string;
      }
  >
): string {
  const positioned: PositionedTextItem[] = [];
  items.forEach((raw, order) => {
    if (!raw || typeof raw !== 'object') return;
    const str =
      'str' in raw && raw.str != null
        ? String(raw.str)
        : '';
    // Keep empty strings that only signal EOL so line breaks survive.
    const hasEOL = Boolean((raw as { hasEOL?: boolean }).hasEOL);
    if (!str && !hasEOL) return;
    let x = 0;
    let y = 0;
    let width = typeof (raw as PositionedTextItem).width === 'number' ? (raw as PositionedTextItem).width : undefined;
    let height =
      typeof (raw as PositionedTextItem).height === 'number' ? (raw as PositionedTextItem).height : undefined;
    if ('x' in raw && typeof (raw as PositionedTextItem).x === 'number') {
      x = (raw as PositionedTextItem).x;
      y = (raw as PositionedTextItem).y;
    } else if ('transform' in raw && Array.isArray((raw as { transform?: number[] }).transform)) {
      const tr = (raw as { transform: number[] }).transform;
      x = Number(tr[4]) || 0;
      y = Number(tr[5]) || 0;
      if (height == null && tr.length >= 4) {
        height = Math.abs(Number(tr[3]) || 0) || undefined;
      }
    }
    if (width == null && 'width' in raw) width = Number((raw as { width?: number }).width) || undefined;
    if (height == null && 'height' in raw) height = Number((raw as { height?: number }).height) || undefined;
    const dir =
      'dir' in raw && typeof (raw as { dir?: string }).dir === 'string'
        ? (raw as { dir: string }).dir
        : undefined;
    positioned.push({ str, x, y, width, height, order, hasEOL, dir });
  });

  if (!positioned.length) return '';

  const heights = positioned
    .map((p) => p.height)
    .filter((h): h is number => typeof h === 'number' && h > 0);
  const medH = median(heights) || 10;
  const yTol = Math.max(2, Math.min(4, medH * 0.35));

  // Group into lines by Y (PDF Y often increases upward — we still cluster by proximity)
  const sortedByY = [...positioned].sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: PositionedTextItem[][] = [];
  for (const item of sortedByY) {
    const last = lines[lines.length - 1];
    if (last && Math.abs(last[0].y - item.y) <= yTol) {
      last.push(item);
    } else {
      lines.push([item]);
    }
  }

  // Top → bottom visually (higher Y first in PDF user space)
  lines.sort((a, b) => {
    const ya = median(a.map((i) => i.y));
    const yb = median(b.map((i) => i.y));
    return yb - ya;
  });

  const lineYs = lines.map((line) => median(line.map((i) => i.y)));
  const gaps: number[] = [];
  for (let i = 1; i < lineYs.length; i += 1) {
    gaps.push(Math.abs(lineYs[i - 1] - lineYs[i]));
  }
  const normalGap = median(gaps.filter((g) => g > 0)) || medH * 1.2;
  // Paragraph when gap clearly exceeds typical line spacing
  const paraGap = Math.max(normalGap * 1.55, medH * 1.6);

  const lineTexts: string[] = [];
  for (let li = 0; li < lines.length; li += 1) {
    if (li > 0) {
      const gap = Math.abs(lineYs[li - 1] - lineYs[li]);
      if (gap > paraGap) lineTexts.push(''); // blank line → paragraph break
    }
    lineTexts.push(orderLineItems(lines[li]));
  }

  return normalizeSafeWhitespace(lineTexts.join('\n'));
}

/**
 * Direction-agnostic horizontal gap between two axis-aligned text runs.
 * Critical for RTL Arabic: logical next item is often to the LEFT of the previous,
 * so `next.x - (prev.x + prev.width)` is meaningless; box-to-box distance is correct.
 */
export function horizontalGapBetweenRuns(
  a: { x: number; width?: number },
  b: { x: number; width?: number }
): number {
  const aLeft = a.x;
  const aRight = a.x + (typeof a.width === 'number' && a.width > 0 ? a.width : 0);
  const bLeft = b.x;
  const bRight = b.x + (typeof b.width === 'number' && b.width > 0 ? b.width : 0);
  if (aRight < bLeft) return bLeft - aRight;
  if (bRight < aLeft) return aLeft - bRight;
  return 0; // overlap or touching
}

function estimateEm(a: PositionedTextItem, b: PositionedTextItem): number {
  const fromHeight = Math.max(a.height || 0, b.height || 0);
  if (fromHeight > 0) return fromHeight;
  return 10;
}

/** Typical SBC Arabic inter-word gap is ~0.25–0.30em; intra-glyph gaps are ~0–0.05em. */
function wordGapThreshold(em: number): number {
  return Math.max(1.0, em * 0.15);
}

/** Large geometric gaps are treated as column / cell breaks, not sentence spaces. */
function columnGapThreshold(em: number): number {
  return Math.max(em * 3.0, wordGapThreshold(em) * 10);
}

function shouldGlueCodeOrDecimal(prev: string, next: string): boolean {
  // "903" "." "3" "." "1" "." "1" / "NFPA" "13"
  if (/[\d.]$/.test(prev) && /^[\d.]/.test(next)) return true;
  if (/[A-Za-z]$/.test(prev) && /^[A-Za-z]$/.test(next) && next.length === 1) return true;
  // Section id stuck to open paren: "903.3.1.1" "(" 
  if (/[\dA-Za-z.]$/.test(prev) && /^[)\].,;:%]/.test(next)) return true;
  if (/[(\[]$/.test(prev) && /^[\dA-Za-z\u0600-\u06FF]/.test(next)) return true;
  return false;
}

/**
 * Join PDF text runs using geometry-aware word boundaries.
 * - Preserve Unicode characters exactly (never reverse Arabic).
 * - Insert spaces only when the box-to-box gap is a word boundary.
 * - Glue glyph fragments of the same word (tiny / zero gap).
 * - Preserve spaces already present in TextItem.str.
 * - Large gaps → separate logical lines (tables/columns) rather than fake sentences.
 * - Honor hasEOL.
 */
function orderLineItems(items: PositionedTextItem[]): string {
  const lineBlob = items.map((i) => i.str).join('');
  const arabicDom = isArabicDominant(lineBlob);

  // Prefer PDF logical item sequence for Arabic/mixed (never reverse characters).
  // X-sort is a fallback only when logical join is empty.
  let ordered: PositionedTextItem[];
  if (arabicDom || countArabic(lineBlob) > 0) {
    ordered = [...items].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const logical = joinRunsGeometryAware(ordered);
    if (logical.trim()) return logical;
    ordered = [...items].sort((a, b) => b.x - a.x || (a.order ?? 0) - (b.order ?? 0));
    return joinRunsGeometryAware(ordered);
  }

  ordered = [...items].sort((a, b) => a.x - b.x || (a.order ?? 0) - (b.order ?? 0));
  return joinRunsGeometryAware(ordered);
}

function joinRunsGeometryAware(items: PositionedTextItem[]): string {
  const parts: string[] = [];
  let lastGeom: PositionedTextItem | null = null;

  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    const t = String(item.str ?? '');
    if (!t) {
      if (item.hasEOL) {
        parts.push('\n');
        lastGeom = null;
      }
      continue;
    }

    if (!parts.length || parts[parts.length - 1] === '\n' || lastGeom == null) {
      parts.push(t);
      lastGeom = item;
      if (item.hasEOL) {
        parts.push('\n');
        lastGeom = null;
      }
      continue;
    }

    const prevPart = parts[parts.length - 1];

    // Preserve spaces already present in PDF strings — do not invent more.
    if (/\s$/.test(prevPart) || /^\s/.test(t)) {
      parts[parts.length - 1] = prevPart + t;
      lastGeom = item;
      if (item.hasEOL) {
        parts.push('\n');
        lastGeom = null;
      }
      continue;
    }

    const em = estimateEm(lastGeom, item);
    const gap = horizontalGapBetweenRuns(lastGeom, item);
    const wordThr = wordGapThreshold(em);
    const colThr = columnGapThreshold(em);

    if (shouldGlueCodeOrDecimal(prevPart, t) && gap < colThr) {
      parts[parts.length - 1] = prevPart + t;
    } else if (gap <= wordThr) {
      // Same word / adjacent glyphs — glue with no space
      parts[parts.length - 1] = prevPart + t;
    } else if (gap >= colThr) {
      // Distinct column / cell — keep as separate logical lines (do not fabricate a sentence)
      parts.push('\n');
      parts.push(t);
    } else {
      // Genuine word boundary
      parts[parts.length - 1] = `${prevPart} ${t}`;
    }

    lastGeom = item;
    if (item.hasEOL) {
      parts.push('\n');
      lastGeom = null;
    }
  }

  return normalizeSafeWhitespace(parts.join('').replace(/\n+/g, '\n'));
}

/**
 * Extract per-page text from PDF bytes via pdfjs (legacy + local worker).
 * Empty pages are marked for OCR fallback by the caller — this function does not invent NFPA text.
 */
export async function extractPdfPagesFromBytes(
  bytes: ArrayBuffer | Uint8Array
): Promise<PdfPageExtractResult> {
  let pdf;
  try {
    ({ pdf } = await openPdfDocumentFromBytes(bytes));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.startsWith('pdf_extraction_failed:')) throw err;
    throw new Error(`pdf_extraction_failed: ${message}`);
  }

  const pages: ExtractedPdfPage[] = [];

  try {
    for (let i = 1; i <= pdf.numPages; i += 1) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const items = (content.items || []).filter(
        (it) => typeof it === 'object' && it && 'str' in it
      ) as Array<{
        str: string;
        transform?: number[];
        width?: number;
        height?: number;
        hasEOL?: boolean;
        dir?: string;
      }>;
      const text = reconstructPageText(items);
      pages.push({
        page: i,
        text,
        extraction_method: text ? 'text' : 'empty',
      });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`pdf_extraction_failed: ${message}`);
  } finally {
    try {
      await pdf.destroy();
    } catch {
      /* ignore */
    }
  }

  return summarizePages(pages);
}

/**
 * Legacy empty-page OCR marker (no invented body). Prefer
 * `applyExtractionQualityGateToPages` which runs selective OCR only on
 * failed/suspicious pages and rejects unusable text.
 */
export function applyOcrFallbackToPages(
  pages: ExtractedPdfPage[],
  ocrPageText?: Record<number, string>
): PdfPageExtractResult {
  const next = pages.map((p) => {
    if (p.text.trim()) {
      return {
        ...p,
        extraction_method: (p.extraction_method || 'text') as ExtractionMethod,
      };
    }
    const ocr = ocrPageText?.[p.page]?.trim() || '';
    if (ocr) {
      return { page: p.page, text: ocr, extraction_method: 'ocr' as ExtractionMethod };
    }
    return { page: p.page, text: '', extraction_method: 'ocr' as ExtractionMethod };
  });
  return summarizePages(next);
}

/**
 * PDF.js text → geometry reconstruction (already applied) → quality assessment →
 * selective OCR only for failed pages → choose better candidate deterministically.
 * Unusable pages are marked and excluded from combined/indexable text.
 */
export async function applyExtractionQualityGateToPages(
  pages: ExtractedPdfPage[],
  ocrPageText?: Record<number, string>
): Promise<PdfPageExtractResult> {
  const { resolvePageTextWithQualityGate } = await import(
    '@/lib/design-intelligence/code-knowledge/ocr-page-fallback'
  );

  const next: ExtractedPdfPage[] = [];
  for (const page of pages) {
    const resolved = await resolvePageTextWithQualityGate({
      pageNumber: page.page,
      pdfText: page.text,
      ocrText: ocrPageText?.[page.page] ?? null,
    });

    let method: ExtractionMethod = 'text';
    if (resolved.method === 'ocr') method = 'ocr';
    else if (resolved.method === 'alternate') method = 'alternate';
    else if (resolved.method === 'unusable') method = 'unusable';
    else if (!resolved.text.trim()) method = 'empty';
    else method = 'text';

    next.push({
      page: page.page,
      text: method === 'unusable' ? '' : resolved.text,
      extraction_method: method,
      quality_score: resolved.quality.score,
      quality_reasons: resolved.quality.reasons,
      quality_usable: resolved.quality.usable,
      extraction_diagnostic: resolved.diagnostic,
    });
  }

  return summarizePages(next);
}

export function pagesFromPlainText(text: string): PdfPageExtractResult {
  const clean = String(text || '').replace(/\r/g, '');
  if (!clean.trim()) {
    return {
      pages: [],
      page_count: 0,
      pages_extracted: 0,
      pages_ocr: 0,
      pages_rejected: 0,
      combined_text: '',
      extraction_method: 'empty',
      ocr_used: false,
    };
  }
  // Explicit form-feed page breaks, else single logical page
  const parts = clean.includes(FORM_FEED)
    ? clean.split(FORM_FEED)
    : [clean];
  const pages: ExtractedPdfPage[] = parts.map((t, i) => ({
    page: i + 1,
    text: t.trim(),
    extraction_method: t.trim() ? 'text' : 'empty',
  }));
  return summarizePages(pages);
}

const TARGET_MIN = 700;
const TARGET_MAX = 1200;
const OVERLAP_CHARS = 100;

function isProtectedCodeSpan(text: string, index: number): boolean {
  CODE_TOKEN_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = CODE_TOKEN_RE.exec(text))) {
    if (index > m.index && index < m.index + m[0].length) return true;
  }
  return false;
}

function findSplitIndex(text: string, ideal: number, hardMax: number): number {
  const limit = Math.min(text.length, hardMax);
  if (text.length <= ideal) return text.length;

  // Prefer blank-line paragraph boundary
  const paraWindow = text.slice(0, limit);
  let best = -1;
  const paraRe = /\n\n+/g;
  let pm: RegExpExecArray | null;
  while ((pm = paraRe.exec(paraWindow))) {
    const idx = pm.index + pm[0].length;
    if (idx >= TARGET_MIN && idx <= limit && !isProtectedCodeSpan(text, idx)) {
      best = idx;
    }
  }
  if (best > 0) return best;

  // Line boundary
  const lineWindow = text.slice(0, limit);
  let lineBest = -1;
  for (let i = Math.min(ideal, lineWindow.length - 1); i >= TARGET_MIN; i -= 1) {
    if (lineWindow[i] === '\n' && !isProtectedCodeSpan(text, i + 1)) {
      lineBest = i + 1;
      break;
    }
  }
  if (lineBest > 0) return lineBest;

  // Sentence punctuation (Arabic + English)
  const sentenceRe = /[.!?؟؛;:](\s+|$)/g;
  let sentBest = -1;
  let sm: RegExpExecArray | null;
  while ((sm = sentenceRe.exec(paraWindow))) {
    const idx = sm.index + sm[0].length;
    if (idx >= TARGET_MIN && idx <= limit && !isProtectedCodeSpan(text, idx)) {
      sentBest = idx;
    }
  }
  if (sentBest > 0) return sentBest;

  // Fallback: hard split, but nudge away from mid-code-token
  let hard = Math.min(ideal, limit);
  while (hard > TARGET_MIN && isProtectedCodeSpan(text, hard)) hard -= 1;
  // Prefer nearby whitespace
  for (let i = hard; i >= Math.max(TARGET_MIN, hard - 80); i -= 1) {
    if (/\s/.test(text[i]) && !isProtectedCodeSpan(text, i + 1)) return i + 1;
  }
  return hard;
}

function splitPageTextSemantically(text: string, maxChars: number): string[] {
  const clean = text.replace(/\r/g, '').trim();
  if (!clean) return [];
  const hardMax = Math.max(maxChars, TARGET_MAX);
  const target = Math.min(Math.max(maxChars, TARGET_MIN), TARGET_MAX);

  if (clean.length <= hardMax) return [clean];

  const parts: string[] = [];
  let remaining = clean;
  while (remaining.length > hardMax) {
    const cut = findSplitIndex(remaining, target, hardMax);
    const slice = remaining.slice(0, cut).trim();
    if (slice) parts.push(slice);
    let nextStart = cut;
    // Small overlap for continuity — avoid duplicating huge passages
    if (parts.length && OVERLAP_CHARS > 0) {
      const overlapStart = Math.max(0, cut - OVERLAP_CHARS);
      // Only overlap if we are not re-emitting almost the whole previous chunk
      if (cut - overlapStart <= OVERLAP_CHARS && cut - overlapStart < slice.length * 0.25) {
        nextStart = overlapStart;
        // Skip leading partial whitespace
        while (nextStart < remaining.length && /\s/.test(remaining[nextStart])) nextStart += 1;
        // If overlap would restart mid-token of a code ref, skip to cut
        if (isProtectedCodeSpan(remaining, nextStart)) nextStart = cut;
      }
    }
    remaining = remaining.slice(Math.max(nextStart, cut)).trim();
    if (!remaining) break;
    // Safety: ensure progress
    if (parts.length > 0 && remaining.length >= clean.length) {
      parts.push(remaining);
      remaining = '';
      break;
    }
  }
  if (remaining.trim()) parts.push(remaining.trim());
  return parts.filter((p) => p.length > 0);
}

/**
 * Semantic page-preserving chunker.
 * Never combines different PDF pages into one chunk.
 * Splits by paragraphs → lines → sentences → hard char fallback.
 */
export function chunkPagesPreserving(
  pages: ExtractedPdfPage[],
  maxChars = 900,
  opts?: {
    /**
     * Emit a non-empty placeholder for pages with no extractable text so
     * coverage includes page 1 / OCR-empty pages without inventing NFPA body.
     */
    includeEmptyPagePlaceholders?: boolean;
  }
): Array<{
  content: string;
  index: number;
  page_start: number;
  page_end: number;
  extraction_method: ExtractionMethod;
}> {
  const out: Array<{
    content: string;
    index: number;
    page_start: number;
    page_end: number;
    extraction_method: ExtractionMethod;
  }> = [];
  let index = 0;
  const includeEmpty = Boolean(opts?.includeEmptyPagePlaceholders);
  const targetMax = Math.min(Math.max(maxChars, TARGET_MIN), TARGET_MAX);

  for (const page of pages) {
    // Never index unusable / failed-quality pages as engineering evidence
    if (
      page.extraction_method === 'unusable' ||
      page.quality_usable === false
    ) {
      continue;
    }
    const text = page.text.trim();
    if (!text) {
      if (includeEmpty) {
        out.push({
          content: `[Page ${page.page} — no extractable text]`,
          index,
          page_start: page.page,
          page_end: page.page,
          extraction_method:
            page.extraction_method === 'ocr' ? 'ocr' : 'empty',
        });
        index += 1;
      }
      continue;
    }
    const parts = splitPageTextSemantically(text, targetMax);
    for (const slice of parts) {
      out.push({
        content: slice,
        index,
        page_start: page.page,
        page_end: page.page,
        extraction_method: page.extraction_method,
      });
      index += 1;
    }
  }
  return out.filter((c) => c.content.length > 0);
}

function summarizePages(pages: ExtractedPdfPage[]): PdfPageExtractResult {
  const pages_extracted = pages.filter(
    (p) => p.text.trim() && (p.extraction_method === 'text' || p.quality_usable === true)
  ).length;
  const pages_ocr = pages.filter((p) => p.extraction_method === 'ocr').length;
  const pages_rejected = pages.filter(
    (p) => p.extraction_method === 'unusable' || p.quality_usable === false
  ).length;
  const hasText = pages.some((p) => p.extraction_method === 'text' && p.text.trim());
  const hasOcr = pages_ocr > 0;
  const hasAlternate = pages.some((p) => p.extraction_method === 'alternate' && p.text.trim());
  let extraction_method: ExtractionMethod = 'empty';
  if (pages.every((p) => p.extraction_method === 'unusable' || !p.text.trim()) && pages.length) {
    extraction_method = pages.some((p) => p.extraction_method === 'unusable') ? 'unusable' : 'empty';
  } else if ((hasText || hasAlternate) && hasOcr) extraction_method = 'mixed';
  else if (hasOcr && !hasText && !hasAlternate) extraction_method = 'ocr';
  else if (hasAlternate && !hasText) extraction_method = 'alternate';
  else if (hasText) extraction_method = 'text';

  return {
    pages,
    page_count: pages.length,
    pages_extracted,
    pages_ocr,
    pages_rejected,
    // Unusable pages must not enter the combined indexed body
    combined_text: pages
      .filter((p) => p.extraction_method !== 'unusable' && p.quality_usable !== false)
      .map((p) => p.text)
      .join(FORM_FEED),
    extraction_method,
    ocr_used: hasOcr,
  };
}
