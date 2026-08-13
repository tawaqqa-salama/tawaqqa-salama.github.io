/**
 * Page-preserving PDF text extraction for Code Knowledge.
 * Reads bytes already obtained from Supabase Storage — never fetches external PDFs.
 */

import type { ExtractionMethod } from '@/lib/design-intelligence/code-knowledge/types';

export type ExtractedPdfPage = {
  page: number;
  text: string;
  extraction_method: ExtractionMethod;
};

export type PdfPageExtractResult = {
  pages: ExtractedPdfPage[];
  page_count: number;
  pages_extracted: number;
  pages_ocr: number;
  combined_text: string;
  extraction_method: ExtractionMethod;
  ocr_used: boolean;
};

const FORM_FEED = '\f';

/**
 * Extract per-page text from PDF bytes via pdfjs (legacy, no remote worker).
 * Empty pages are marked for OCR fallback by the caller — this function does not invent NFPA text.
 */
export async function extractPdfPagesFromBytes(
  bytes: ArrayBuffer | Uint8Array
): Promise<PdfPageExtractResult> {
  const data =
    bytes instanceof Uint8Array
      ? bytes
      : new Uint8Array(bytes);

  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const pdf = await pdfjs.getDocument({ data, useSystemFonts: true }).promise;
  const pages: ExtractedPdfPage[] = [];

  for (let i = 1; i <= pdf.numPages; i += 1) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const text = content.items
      .map((it) => (typeof it === 'object' && it && 'str' in it ? String((it as { str: string }).str) : ''))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    pages.push({
      page: i,
      text,
      extraction_method: text ? 'text' : 'empty',
    });
  }

  return summarizePages(pages);
}

/**
 * OCR fallback placeholder: marks empty pages as OCR-attempted without inventing body text.
 * A real OCR worker can replace empty strings later; we never fabricate NFPA content.
 */
export function applyOcrFallbackToPages(
  pages: ExtractedPdfPage[],
  ocrPageText?: Record<number, string>
): PdfPageExtractResult {
  const next = pages.map((p) => {
    if (p.text.trim()) return { ...p, extraction_method: 'text' as ExtractionMethod };
    const ocr = ocrPageText?.[p.page]?.trim() || '';
    if (ocr) {
      return { page: p.page, text: ocr, extraction_method: 'ocr' as ExtractionMethod };
    }
    return { page: p.page, text: '', extraction_method: 'ocr' as ExtractionMethod };
  });
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

export function chunkPagesPreserving(
  pages: ExtractedPdfPage[],
  maxChars = 700
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

  for (const page of pages) {
    const text = page.text.trim();
    if (!text) continue;
    if (text.length <= maxChars) {
      out.push({
        content: text,
        index,
        page_start: page.page,
        page_end: page.page,
        extraction_method: page.extraction_method,
      });
      index += 1;
      continue;
    }
    for (let i = 0; i < text.length; i += maxChars) {
      out.push({
        content: text.slice(i, i + maxChars).trim(),
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
  const pages_extracted = pages.filter((p) => p.text.trim() && p.extraction_method === 'text').length;
  const pages_ocr = pages.filter((p) => p.extraction_method === 'ocr').length;
  const hasText = pages.some((p) => p.extraction_method === 'text' && p.text.trim());
  const hasOcr = pages_ocr > 0;
  let extraction_method: ExtractionMethod = 'empty';
  if (hasText && hasOcr) extraction_method = 'mixed';
  else if (hasOcr && !hasText) extraction_method = 'ocr';
  else if (hasText) extraction_method = 'text';

  return {
    pages,
    page_count: pages.length,
    pages_extracted,
    pages_ocr,
    combined_text: pages.map((p) => p.text).join(FORM_FEED),
    extraction_method,
    ocr_used: hasOcr,
  };
}
