/**
 * Selective OCR / alternate extraction boundary for Design Intelligence.
 *
 * Native PDF.js extraction remains primary. OCR runs only when
 * assessExtractionTextQuality rejects the page. OCR results are re-gated;
 * failures/timeouts mark the page unusable — never keep corrupted CID text.
 *
 * Production OCR is configured via DI_OCR_* (server-only). No fake success.
 */

import {
  assessExtractionTextQuality,
  pickBetterExtractionCandidate,
  type ExtractionQualityAssessment,
} from '@/lib/design-intelligence/code-knowledge/extraction-quality';
import { logReingest } from '@/lib/design-intelligence/reingest-log';

/** Page-level provenance persisted on chunks / citations. */
export type PageExtractionMethod = 'native_pdf' | 'ocr' | 'alternate' | 'unusable';

export type PageOcrFallbackResult = {
  text: string;
  method: PageExtractionMethod;
  quality: ExtractionQualityAssessment;
  ocrAttempted: boolean;
  ocrAvailable: boolean;
  diagnostic: string | null;
  nativeQualityScore: number;
  ocrQualityScore: number | null;
};

export type OcrPageProvider = (input: {
  pageNumber: number;
  pdfText: string;
  pageImageBytes?: Uint8Array | null;
  pdfBytes?: Uint8Array | null;
}) => Promise<{ text: string; engine: 'ocr' | 'alternate' } | null>;

let injectedProvider: OcrPageProvider | null = null;

export function setOcrPageProviderForTests(provider: OcrPageProvider | null): void {
  injectedProvider = provider;
}

function isBrowserRuntime(): boolean {
  return typeof window !== 'undefined';
}

/** True when an OCR provider can be invoked on this runtime (never in browser). */
export function isRuntimeOcrAvailable(): boolean {
  if (injectedProvider) return true;
  if (isBrowserRuntime()) return false;
  if (process.env.DI_OCR_ENABLED !== '1') return false;
  const mode = String(process.env.DI_OCR_PROVIDER || 'auto').toLowerCase();
  if (mode === 'http' || mode === 'auto') return Boolean(process.env.DI_OCR_ENDPOINT);
  if (mode === 'tesseract') return true;
  return false;
}

function logOcrStage(
  stage:
    | 'OCR_REQUIRED'
    | 'OCR_START'
    | 'OCR_OK'
    | 'OCR_REJECTED'
    | 'OCR_FAILED'
    | 'QUALITY_GATE_NATIVE_OK'
    | 'QUALITY_GATE_NATIVE_REJECTED'
    | 'QUALITY_GATE_OCR_OK'
    | 'QUALITY_GATE_OCR_REJECTED',
  fields: {
    documentId?: string | null;
    companyId?: string | null;
    pageNumber: number;
    nativeQualityScore?: number | null;
    ocrQualityScore?: number | null;
    reason?: string | null;
    elapsedMs?: number | null;
  }
): void {
  logReingest({
    stage,
    documentId: fields.documentId,
    companyId: fields.companyId,
    pageNumber: fields.pageNumber,
    nativeQualityScore: fields.nativeQualityScore,
    ocrQualityScore: fields.ocrQualityScore,
    reason: fields.reason,
    elapsedMs: fields.elapsedMs,
  });
}

async function runOcrProvider(input: {
  pageNumber: number;
  pdfText: string;
  pageImageBytes?: Uint8Array | null;
  pdfBytes?: Uint8Array | null;
}): Promise<{ text: string; engine: 'ocr' | 'alternate'; error?: string } | null> {
  if (injectedProvider) {
    const provided = await injectedProvider(input);
    if (!provided?.text.trim()) return null;
    return provided;
  }
  if (isBrowserRuntime()) return null;
  if (!isRuntimeOcrAvailable()) return null;

  const { invokeConfiguredOcrProvider } = await import(
    '@/lib/design-intelligence/code-knowledge/ocr-provider'
  );
  const result = await invokeConfiguredOcrProvider({
    pageNumber: input.pageNumber,
    pdfText: input.pdfText,
    pageImageBytes: input.pageImageBytes,
    pdfBytes: input.pdfBytes,
  });

  if (result.text) {
    return { text: result.text, engine: 'ocr' };
  }
  return {
    text: '',
    engine: 'ocr',
    error: ('error' in result && result.error) || 'ocr_provider_failed',
  };
}

/**
 * Decide page text after PDF.js + geometry reconstruction.
 * OCR only when quality fails; never OCR all pages by default.
 */
export async function resolvePageTextWithQualityGate(input: {
  pageNumber: number;
  pdfText: string;
  ocrText?: string | null;
  pageImageBytes?: Uint8Array | null;
  pdfBytes?: Uint8Array | null;
  documentId?: string | null;
  companyId?: string | null;
}): Promise<PageOcrFallbackResult> {
  const pdfText = String(input.pdfText || '');
  const pdfQuality = assessExtractionTextQuality(pdfText);
  const pageNumber = input.pageNumber;
  const documentId = input.documentId;
  const companyId = input.companyId;

  if (pdfQuality.usable) {
    logOcrStage('QUALITY_GATE_NATIVE_OK', {
      documentId,
      companyId,
      pageNumber,
      nativeQualityScore: pdfQuality.score,
      reason: 'native_extraction_usable',
    });
    return {
      text: pdfText,
      method: 'native_pdf',
      quality: pdfQuality,
      ocrAttempted: false,
      ocrAvailable: isRuntimeOcrAvailable() || Boolean(input.ocrText?.trim()),
      diagnostic: null,
      nativeQualityScore: pdfQuality.score,
      ocrQualityScore: null,
    };
  }

  logOcrStage('QUALITY_GATE_NATIVE_REJECTED', {
    documentId,
    companyId,
    pageNumber,
    nativeQualityScore: pdfQuality.score,
    reason: pdfQuality.reasons.join(',') || 'native_unusable',
  });

  logOcrStage('OCR_REQUIRED', {
    documentId,
    companyId,
    pageNumber,
    nativeQualityScore: pdfQuality.score,
    reason: pdfQuality.reasons.join(',') || 'native_unusable',
  });

  let ocrText = String(input.ocrText || '').trim();
  let ocrAvailable = Boolean(ocrText) || isRuntimeOcrAvailable();
  let diagnostic: string | null = null;
  let ocrQualityScore: number | null = null;
  let providerError: string | null = null;

  if (!ocrText) {
    logOcrStage('OCR_START', {
      documentId,
      companyId,
      pageNumber,
      nativeQualityScore: pdfQuality.score,
      reason: 'selective_page_ocr',
    });
    const started = Date.now();
    try {
      const provided = await runOcrProvider({
        pageNumber,
        pdfText,
        pageImageBytes: input.pageImageBytes,
        pdfBytes: input.pdfBytes,
      });
      const elapsedMs = Date.now() - started;
      if (provided?.text.trim()) {
        ocrText = provided.text.trim();
        ocrAvailable = true;
        logOcrStage('OCR_OK', {
          documentId,
          companyId,
          pageNumber,
          nativeQualityScore: pdfQuality.score,
          reason: provided.engine,
          elapsedMs,
        });
      } else if (provided?.error) {
        providerError = provided.error;
        ocrAvailable = isRuntimeOcrAvailable();
        logOcrStage('OCR_FAILED', {
          documentId,
          companyId,
          pageNumber,
          nativeQualityScore: pdfQuality.score,
          reason: providerError,
          elapsedMs,
        });
        diagnostic = `ocr_failed: ${providerError}`;
      } else if (!isRuntimeOcrAvailable() && !input.ocrText) {
        diagnostic =
          'ocr_unavailable_on_runtime: selective OCR required but no DI_OCR_ENABLED worker/endpoint is configured for this deployment';
        ocrAvailable = false;
        logOcrStage('OCR_FAILED', {
          documentId,
          companyId,
          pageNumber,
          nativeQualityScore: pdfQuality.score,
          reason: 'ocr_unavailable_on_runtime',
          elapsedMs,
        });
      } else {
        diagnostic = 'ocr_attempted_but_empty: OCR/alternate provider returned no usable text';
        logOcrStage('OCR_FAILED', {
          documentId,
          companyId,
          pageNumber,
          nativeQualityScore: pdfQuality.score,
          reason: 'ocr_empty',
          elapsedMs,
        });
      }
    } catch (err) {
      const elapsedMs = Date.now() - started;
      providerError = err instanceof Error ? err.message : String(err || 'ocr_threw');
      diagnostic = `ocr_failed: ${providerError.slice(0, 180)}`;
      logOcrStage('OCR_FAILED', {
        documentId,
        companyId,
        pageNumber,
        nativeQualityScore: pdfQuality.score,
        reason: providerError.slice(0, 180),
        elapsedMs,
      });
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
      nativeQualityScore: pdfQuality.score,
      ocrQualityScore: null,
    };
  }

  const ocrQuality = assessExtractionTextQuality(ocrText);
  ocrQualityScore = ocrQuality.score;

  if (ocrQuality.usable) {
    logOcrStage('QUALITY_GATE_OCR_OK', {
      documentId,
      companyId,
      pageNumber,
      nativeQualityScore: pdfQuality.score,
      ocrQualityScore,
      reason: 'ocr_extraction_usable',
    });
  } else {
    logOcrStage('QUALITY_GATE_OCR_REJECTED', {
      documentId,
      companyId,
      pageNumber,
      nativeQualityScore: pdfQuality.score,
      ocrQualityScore,
      reason: ocrQuality.reasons.join(',') || 'ocr_unusable',
    });
    logOcrStage('OCR_REJECTED', {
      documentId,
      companyId,
      pageNumber,
      nativeQualityScore: pdfQuality.score,
      ocrQualityScore,
      reason: ocrQuality.reasons.join(',') || 'ocr_unusable',
    });
  }

  const best = pickBetterExtractionCandidate(
    { text: pdfText, quality: pdfQuality, method: 'native_pdf' },
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
      nativeQualityScore: pdfQuality.score,
      ocrQualityScore,
    };
  }

  // Never accept rejected native text even if pickBetter ties oddly
  const method: PageExtractionMethod =
    best.method === 'ocr' || !pdfQuality.usable ? 'ocr' : 'native_pdf';
  const acceptedText = method === 'ocr' ? ocrText : pdfText;
  const acceptedQuality = method === 'ocr' ? ocrQuality : pdfQuality;

  if (!acceptedQuality.usable) {
    return {
      text: '',
      method: 'unusable',
      quality: acceptedQuality,
      ocrAttempted: true,
      ocrAvailable: true,
      diagnostic: 'accepted_candidate_failed_quality_gate',
      nativeQualityScore: pdfQuality.score,
      ocrQualityScore,
    };
  }

  return {
    text: acceptedText,
    method,
    quality: acceptedQuality,
    ocrAttempted: true,
    ocrAvailable: true,
    diagnostic: null,
    nativeQualityScore: pdfQuality.score,
    ocrQualityScore,
  };
}
