/**
 * Detect section / table / figure references from extracted text.
 * Never fabricates citations — missing → NOT_VERIFIED.
 */

import type { SourceVerificationStatus } from '@/lib/design-intelligence/code-knowledge/types';

export type DetectedSourceRefs = {
  section: string | null;
  subsection: string | null;
  table_reference: string | null;
  figure_reference: string | null;
  page_number: number | null;
  paragraph_reference: string | null;
  code_reference: string | null;
  source_verification_status: SourceVerificationStatus;
};

const SECTION_RE =
  /\b(?:Section|Sec\.?|§)\s*(\d+(?:\.\d+){0,4})\b/i;
const TABLE_RE = /\b(?:Table)\s+([\dA-Za-z]+(?:\.[\dA-Za-z]+)*)\b/i;
const FIGURE_RE = /\b(?:Figure|Fig\.?)\s+([\dA-Za-z]+(?:\.[\dA-Za-z]+)*)\b/i;
const PAGE_RE = /\b(?:Page|p\.?)\s*(\d+)\b/i;
const PARA_RE = /\b(?:Paragraph|Para\.?)\s*([\d.]+)\b/i;

/**
 * Extract references only when patterns appear in the chunk text.
 * Does not invent section/table/page from document title or memory.
 */
export function detectSourceRefsFromText(
  content: string,
  opts?: { pageGuess?: number | null; allowPageGuess?: boolean }
): DetectedSourceRefs {
  const text = String(content || '');
  const sectionMatch = text.match(SECTION_RE);
  const tableMatch = text.match(TABLE_RE);
  const figureMatch = text.match(FIGURE_RE);
  const pageMatch = text.match(PAGE_RE);
  const paraMatch = text.match(PARA_RE);

  const section = sectionMatch?.[1] ? String(sectionMatch[1]) : null;
  const table_reference = tableMatch?.[1] ? `Table ${tableMatch[1]}` : null;
  const figure_reference = figureMatch?.[1] ? `Figure ${figureMatch[1]}` : null;
  const page_number = pageMatch?.[1]
    ? Number(pageMatch[1])
    : opts?.allowPageGuess && opts.pageGuess != null
      ? opts.pageGuess
      : null;
  const paragraph_reference = paraMatch?.[1] ? String(paraMatch[1]) : null;

  const subsection =
    section && section.includes('.')
      ? section.split('.').slice(0, 3).join('.')
      : null;

  const code_reference = [section && `§${section}`, table_reference, figure_reference]
    .filter(Boolean)
    .join(' · ') || null;

  const hasVerifiedCitation = Boolean(section || table_reference || figure_reference);

  return {
    section,
    subsection,
    table_reference,
    figure_reference,
    page_number,
    paragraph_reference,
    code_reference,
    source_verification_status: hasVerifiedCitation ? 'VERIFIED' : 'NOT_VERIFIED',
  };
}

/**
 * Reject fabricated citations that do not appear in the source text.
 */
export function assertCitationPresentInText(
  content: string,
  citation: { section?: string | null; table?: string | null; page?: number | null }
): { ok: boolean; reason?: string } {
  const text = String(content || '');
  if (citation.section) {
    const needle = citation.section.replace(/^§/, '');
    if (!new RegExp(`\\b${escapeRe(needle)}\\b`).test(text)) {
      return { ok: false, reason: 'section_not_in_text' };
    }
  }
  if (citation.table) {
    const t = citation.table.replace(/^Table\s+/i, '');
    if (!new RegExp(`Table\\s+${escapeRe(t)}`, 'i').test(text)) {
      return { ok: false, reason: 'table_not_in_text' };
    }
  }
  if (citation.page != null) {
    if (!new RegExp(`\\b(?:Page|p\\.?)\\s*${citation.page}\\b`, 'i').test(text)) {
      return { ok: false, reason: 'page_not_in_text' };
    }
  }
  return { ok: true };
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
