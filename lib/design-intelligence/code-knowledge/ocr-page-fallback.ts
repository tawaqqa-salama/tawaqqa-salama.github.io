/**
 * Selective OCR / alternate extraction boundary for Design Intelligence.
 *
 * Vercel Node runtimes do not ship a safe native OCR stack by default.
 * This module never fakes OCR success: when runtime OCR is unavailable it
 * returns a precise diagnostic so the page can be marked unusable.
 *
 * Required for real OCR (ops note — not auto-installed):
 * - Tesseract (ara+eng) or a managed OCR API reachable from the region
 * - Memory/time budget for selective page rasterization of large SBC PDFs
 * - Do NOT add Chromium solely for OCR without proving Vercel build fit
 */

import {
  assessExtractionTextQuality,
  pickBetterExtractionCandidate,
  type ExtractionQualityAssessment,
} from '@/lib/design-intelligence/code-knowledge/extraction-quality';

export type PageExtractionMethod = 'pdf_text' | 'ocr' | 'alternate' | 'unusable';

export type PageOcrFallbackResult = {
  text: string;
  method: PageExtractionMethod;
  quality: ExtractionQualityAssessment;
  ocrAttempted: boolean;
  ocrAvailable: boolean;
  diagnostic: string | null;
};

export type OcrPageProvider = (input: {
  pageNumber: number;
  pdfText: string;
  pageImageBytes?: Uint8Array | null;
}) => Promise<{ text: string; engine: 'ocr' | 'alternate' } | null>;

let injectedProvider: OcrPageProvider | null = null;

export function setOcrPageProviderForTests(provider: OcrPageProvider | null): void {
  injectedProvider = provider;
}

export function isRuntimeOcrAvailable(): boolean {
  if (injectedProvider) return true;
  return Boolean(process.env.DI_OCR_ENDPOINT && process.env.DI_OCR_ENABLED === '1');
}

async function runOcrProvider(input: {
  pageNumber: number;
  pdfText: string;
}): Promise<{ text: string; engine: 'ocr' | 'alternate' } | null> {
  if (injectedProvider) return injectedProvider(input);
  if (!isRuntimeOcrAvailable()) return null;
  return null;
}

/**
 * Decide page text after PDF.js + geometry reconstruction.
 * OCR only when quality fails; never OCR all pages by default.
 */
export async function resolvePageTextWithQualityGate(input: {
  pageNumber: number;
  pdfText: string;
  ocrText?: string | null;
}): Promise<PageOcrFallbackResult> {
  const pdfText = String(input.pdfText || '');
  const pdfQuality = assessExtractionTextQuality(pdfText);

  if (pdfQuality.usable) {
    return {
      text: pdfText,
      method: 'pdf_text',
      quality: pdfQuality,
      ocrAttempted: false,
      ocrAvailable: isRuntimeOcrAvailable() || Boolean(input.ocrText?.trim()),
      diagnostic: null,
    };
  }

  let ocrText = String(input.ocrText || '').trim();
  let ocrAvailable = Boolean(ocrText) || isRuntimeOcrAvailable();
  let diagnostic: string | null = null;

  if (!ocrText) {
    const provided = await runOcrProvider({
      pageNumber: input.pageNumber,
      pdfText,
    });
    if (provided?.text.trim()) {
      ocrText = provided.text.trim();
      ocrAvailable = true;
    } else if (!isRuntimeOcrAvailable() && !input.ocrText) {
      diagnostic =
        'ocr_unavailable_on_runtime: selective OCR required but no DI_OCR_ENABLED worker/endpoint is configured for this Vercel Node deployment';
      ocrAvailable = false;
    } else {
      diagnostic = 'ocr_attempted_but_empty: OCR/alternate provider returned no usable text';
    }
  }

  if (!ocrText) {
    return {
      text: '',
      method: 'unusable',
      quality: {
        usable: false,
        score: 0,
        reasons: pdfQuality.reasons.length ? pdfQuality.reasons : ['empty_text'],
        corruptionRatio: Math.max(pdfQuality.corruptionRatio, 1),
        suspiciousRuns: pdfQuality.suspiciousRuns,
      },
      ocrAttempted: true,
      ocrAvailable,
      diagnostic:
        diagnostic ||
        `pdf_text_unusable: ${pdfQuality.reasons.join(',') || 'low_quality'}`,
    };
  }

  const ocrQuality = assessExtractionTextQuality(ocrText);
  const best = pickBetterExtractionCandidate(
    { text: pdfText, quality: pdfQuality, method: 'pdf_text' },
    { text: ocrText, quality: ocrQuality, method: 'ocr' }
  );

  if (!best.quality.usable) {
    return {
      text: '',
      method: 'unusable',
      quality: best.quality,
      ocrAttempted: true,
      ocrAvailable: true,
      diagnostic: `pdf_and_ocr_unusable: pdf=[${pdfQuality.reasons.join(',')}] ocr=[${ocrQuality.reasons.join(',')}]`,
    };
  }

  return {
    text: best.text,
    method: best.method === 'pdf_text' ? 'pdf_text' : 'ocr',
    quality: best.quality,
    ocrAttempted: true,
    ocrAvailable: true,
    diagnostic: null,
  };
}
