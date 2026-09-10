/**
 * Selective Arabic OCR fallback — production-grade regressions (PR #271).
 * A–K deterministic coverage; no Production reingest / data mutation.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  assessExtractionTextQuality,
} from '@/lib/design-intelligence/code-knowledge/extraction-quality';
import {
  applyExtractionQualityGateToPages,
  chunkPagesPreserving,
} from '@/lib/design-intelligence/code-knowledge/pdf-page-extract';
import {
  resolvePageTextWithQualityGate,
  setOcrPageProviderForTests,
} from '@/lib/design-intelligence/code-knowledge/ocr-page-fallback';
import {
  isConfiguredOcrProviderAvailable,
  resolveOcrProviderMode,
} from '@/lib/design-intelligence/code-knowledge/ocr-provider';
import {
  isSaudiPolicyEligibleDocument,
  SAUDI_POLICY_EXCLUDED_NFPA_DOCUMENT_ID,
  SAUDI_POLICY_RETAINED_DOCUMENT_ID,
} from '@/lib/design-intelligence/saudi-code-policy';
import { logReingest } from '@/lib/design-intelligence/reingest-log';

const CLEAN_AR =
  'يجب توفير أنظمة الرش الآلي وفق متطلبات الكود السعودي SBC-801 طبعة 2018 في المباني العالية.';
const CORRUPT_CID = 'ال ب ر ش ا ش ا ت ف ي ال م ب ا ن ي اااااااااااااااااااا';
const MIXED =
  'Automatic Sprinkler Systems (أنظمة الرش الآلي) — Section 903.3.1.1 / SBC-801 / 2018 — 7 bar.';

describe('selective Arabic OCR fallback (PR #271)', () => {
  const logs: Array<Record<string, unknown>> = [];
  const originalInfo = console.info;
  let prevEnabled: string | undefined;
  let prevEndpoint: string | undefined;
  let prevProvider: string | undefined;

  beforeEach(() => {
    logs.length = 0;
    console.info = ((...args: unknown[]) => {
      const line = args.map(String).join(' ');
      try {
        logs.push(JSON.parse(line) as Record<string, unknown>);
      } catch {
        /* ignore non-json */
      }
    }) as typeof console.info;
    prevEnabled = process.env.DI_OCR_ENABLED;
    prevEndpoint = process.env.DI_OCR_ENDPOINT;
    prevProvider = process.env.DI_OCR_PROVIDER;
    delete process.env.DI_OCR_ENABLED;
    delete process.env.DI_OCR_ENDPOINT;
    delete process.env.DI_OCR_PROVIDER;
    setOcrPageProviderForTests(null);
  });

  afterEach(() => {
    console.info = originalInfo;
    setOcrPageProviderForTests(null);
    if (prevEnabled === undefined) delete process.env.DI_OCR_ENABLED;
    else process.env.DI_OCR_ENABLED = prevEnabled;
    if (prevEndpoint === undefined) delete process.env.DI_OCR_ENDPOINT;
    else process.env.DI_OCR_ENDPOINT = prevEndpoint;
    if (prevProvider === undefined) delete process.env.DI_OCR_PROVIDER;
    else process.env.DI_OCR_PROVIDER = prevProvider;
  });

  it('A: clean Arabic native extraction → no OCR', async () => {
    let ocrCalls = 0;
    setOcrPageProviderForTests(async () => {
      ocrCalls += 1;
      return { text: 'should-not-run', engine: 'ocr' };
    });
    const result = await resolvePageTextWithQualityGate({
      pageNumber: 12,
      pdfText: CLEAN_AR,
      documentId: SAUDI_POLICY_RETAINED_DOCUMENT_ID,
    });
    expect(result.method).toBe('native_pdf');
    expect(result.ocrAttempted).toBe(false);
    expect(result.text).toContain('أنظمة الرش');
    expect(ocrCalls).toBe(0);
    expect(logs.some((l) => l.stage === 'QUALITY_GATE_NATIVE_OK')).toBe(true);
    expect(logs.some((l) => l.stage === 'OCR_REQUIRED')).toBe(false);
  });

  it('B: corrupted CID Arabic → OCR invoked', async () => {
    let ocrCalls = 0;
    setOcrPageProviderForTests(async ({ pageNumber }) => {
      ocrCalls += 1;
      expect(pageNumber).toBe(365);
      return {
        text: CLEAN_AR,
        engine: 'ocr',
      };
    });
    const result = await resolvePageTextWithQualityGate({
      pageNumber: 365,
      pdfText: CORRUPT_CID,
      documentId: SAUDI_POLICY_RETAINED_DOCUMENT_ID,
    });
    expect(ocrCalls).toBe(1);
    expect(result.method).toBe('ocr');
    expect(logs.some((l) => l.stage === 'QUALITY_GATE_NATIVE_REJECTED')).toBe(true);
    expect(logs.some((l) => l.stage === 'OCR_REQUIRED')).toBe(true);
    expect(logs.some((l) => l.stage === 'OCR_START')).toBe(true);
  });

  it('C: good Arabic OCR → accepted', async () => {
    setOcrPageProviderForTests(async () => ({ text: CLEAN_AR, engine: 'ocr' }));
    const result = await resolvePageTextWithQualityGate({
      pageNumber: 120,
      pdfText: CORRUPT_CID,
    });
    expect(result.method).toBe('ocr');
    expect(result.quality.usable).toBe(true);
    expect(result.text).toContain('SBC-801');
    expect(logs.some((l) => l.stage === 'OCR_OK')).toBe(true);
    expect(logs.some((l) => l.stage === 'QUALITY_GATE_OCR_OK')).toBe(true);
  });

  it('D: corrupted OCR → rejected', async () => {
    setOcrPageProviderForTests(async () => ({
      text: 'اااااااااااااااا ال ب ت ث ج ح',
      engine: 'ocr',
    }));
    const result = await resolvePageTextWithQualityGate({
      pageNumber: 477,
      pdfText: CORRUPT_CID,
    });
    expect(result.method).toBe('unusable');
    expect(result.text).toBe('');
    expect(logs.some((l) => l.stage === 'QUALITY_GATE_OCR_REJECTED')).toBe(true);
    expect(logs.some((l) => l.stage === 'OCR_REJECTED')).toBe(true);
  });

  it('E: OCR timeout/error → page unusable (native corruption not kept)', async () => {
    setOcrPageProviderForTests(async () => {
      throw new Error('ocr_http_timeout_after_45000ms');
    });
    const result = await resolvePageTextWithQualityGate({
      pageNumber: 88,
      pdfText: CORRUPT_CID,
    });
    expect(result.method).toBe('unusable');
    expect(result.text).toBe('');
    expect(result.text).not.toContain('ال ب ر');
    expect(String(result.diagnostic || '')).toMatch(/ocr_failed|timeout/i);
    expect(logs.some((l) => l.stage === 'OCR_FAILED')).toBe(true);
  });

  it('F: mixed Arabic/English/numbers/section identifiers preserved', async () => {
    expect(assessExtractionTextQuality(MIXED).usable).toBe(true);
    const result = await resolvePageTextWithQualityGate({
      pageNumber: 9,
      pdfText: MIXED,
    });
    expect(result.method).toBe('native_pdf');
    expect(result.text).toContain('903.3.1.1');
    expect(result.text).toContain('أنظمة الرش');
    expect(result.text).toContain('7 bar');
  });

  it('G: unusable page cannot become RAG evidence', async () => {
    setOcrPageProviderForTests(async () => null);
    const gated = await applyExtractionQualityGateToPages([
      { page: 1, text: CORRUPT_CID, extraction_method: 'text' },
      { page: 2, text: CLEAN_AR, extraction_method: 'text' },
    ]);
    expect(gated.pages[0].extraction_method).toBe('unusable');
    expect(gated.pages[0].text).toBe('');
    expect(gated.pages[1].extraction_method).toBe('native_pdf');
    const chunks = chunkPagesPreserving(gated.pages, 900);
    expect(chunks.every((c) => c.page_start !== 1)).toBe(true);
    expect(chunks.some((c) => c.page_start === 2)).toBe(true);
    expect(chunks.every((c) => c.extraction_method !== 'unusable')).toBe(true);
  });

  it('H: OCR-derived evidence cannot receive strong confidence unless quality passes', async () => {
    const badOcr = 'ال ب ر ش ا ش ا ت اااااااااااااااااااااااا';
    const q = assessExtractionTextQuality(badOcr);
    expect(q.usable).toBe(false);
    const retrievalScore = 0.99;
    const capped =
      q.score < 0.85 ? Math.min(Math.min(retrievalScore, q.score), 0.7) : Math.min(retrievalScore, q.score);
    expect(Math.round(capped * 100)).toBeLessThan(70);
    // Accepted OCR must still clear usable threshold for any evidence path
    setOcrPageProviderForTests(async () => ({ text: badOcr, engine: 'ocr' }));
    const rejected = await resolvePageTextWithQualityGate({
      pageNumber: 3,
      pdfText: CORRUPT_CID,
    });
    expect(rejected.method).toBe('unusable');
    setOcrPageProviderForTests(async () => ({ text: CLEAN_AR, engine: 'ocr' }));
    const accepted = await resolvePageTextWithQualityGate({
      pageNumber: 4,
      pdfText: CORRUPT_CID,
    });
    expect(accepted.method).toBe('ocr');
    expect(accepted.quality.usable).toBe(true);
    expect(accepted.quality.score).toBeGreaterThanOrEqual(0.55);
  });

  it('I: page/citation/provenance remains correct', async () => {
    setOcrPageProviderForTests(async ({ pageNumber }) => ({
      text: `${CLEAN_AR} (page ${pageNumber})`,
      engine: 'ocr',
    }));
    const gated = await applyExtractionQualityGateToPages(
      [
        { page: 201, text: CORRUPT_CID, extraction_method: 'text' },
        { page: 202, text: CLEAN_AR, extraction_method: 'text' },
      ],
      undefined,
      { documentId: SAUDI_POLICY_RETAINED_DOCUMENT_ID }
    );
    expect(gated.pages[0].page).toBe(201);
    expect(gated.pages[0].extraction_method).toBe('ocr');
    expect(gated.pages[0].text).toContain('(page 201)');
    expect(gated.pages[1].page).toBe(202);
    expect(gated.pages[1].extraction_method).toBe('native_pdf');
    const chunks = chunkPagesPreserving(gated.pages, 900);
    const ocrChunk = chunks.find((c) => c.extraction_method === 'ocr');
    const nativeChunk = chunks.find((c) => c.extraction_method === 'native_pdf');
    expect(ocrChunk?.page_start).toBe(201);
    expect(nativeChunk?.page_start).toBe(202);
    expect(['native_pdf', 'ocr', 'unusable']).toContain(gated.pages[0].extraction_method);
  });

  it('J: Saudi-only policy remains enforced', () => {
    expect(
      isSaudiPolicyEligibleDocument({
        id: SAUDI_POLICY_RETAINED_DOCUMENT_ID,
        code: 'SBC-801',
        edition: '2018',
        title: 'SBC 801A-FF-2018',
      })
    ).toBe(true);
    expect(
      isSaudiPolicyEligibleDocument({
        id: SAUDI_POLICY_EXCLUDED_NFPA_DOCUMENT_ID,
        code: 'NFPA-13',
        edition: '2025',
        title: 'NFPA 13',
      })
    ).toBe(false);
  });

  it('K: canonical compliance path unchanged', () => {
    const compliance = readFileSync(
      join(process.cwd(), 'lib/projects/compliance/index.ts'),
      'utf8'
    );
    expect(compliance.length).toBeGreaterThan(10);
    expect(compliance).not.toMatch(/DI_OCR_ENABLED|selective Arabic OCR/);
  });

  it('provider config: no fake Production OCR without enablement', () => {
    expect(isConfiguredOcrProviderAvailable()).toBe(false);
    expect(resolveOcrProviderMode()).toBe('none');
    process.env.DI_OCR_ENABLED = '1';
    process.env.DI_OCR_ENDPOINT = 'https://ocr.example.internal/v1';
    expect(resolveOcrProviderMode()).toBe('http');
    expect(isConfiguredOcrProviderAvailable()).toBe(true);
  });

  it('observability fields never include document body or secrets', () => {
    logReingest({
      stage: 'OCR_OK',
      documentId: SAUDI_POLICY_RETAINED_DOCUMENT_ID,
      pageNumber: 12,
      nativeQualityScore: 0.12,
      ocrQualityScore: 0.91,
      reason: 'ocr',
      elapsedMs: 42,
      error: 'Bearer eyJhbGciOiJIUzI1NiJ9.abc.def',
    });
    const line = JSON.stringify(logs[logs.length - 1]);
    expect(line).not.toMatch(/eyJhbGci/);
    expect(line).not.toContain(CLEAN_AR);
    expect(line).not.toContain('service_role');
    expect(logs[logs.length - 1].pageNumber).toBe(12);
  });

  it('never silently substitutes guessed engineering text on OCR outage', async () => {
    process.env.DI_OCR_ENABLED = '1';
    process.env.DI_OCR_ENDPOINT = 'https://ocr.example.internal/v1';
    // No injected provider and no real network — HTTP will fail; page must be unusable
    setOcrPageProviderForTests(null);
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network_down'));
    const { invokeConfiguredOcrProvider } = await import(
      '@/lib/design-intelligence/code-knowledge/ocr-provider'
    );
    const provider = await invokeConfiguredOcrProvider({
      pageNumber: 1,
      pdfText: CORRUPT_CID,
    });
    expect(provider.text).toBeNull();
    const result = await resolvePageTextWithQualityGate({
      pageNumber: 1,
      pdfText: CORRUPT_CID,
    });
    expect(result.method).toBe('unusable');
    expect(result.text).toBe('');
    fetchSpy.mockRestore();
  });
});
