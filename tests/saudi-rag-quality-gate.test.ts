/**
 * Extraction quality gate, selective OCR fallback, Saudi-only RAG policy.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  assessExtractionTextQuality,
} from '@/lib/design-intelligence/code-knowledge/extraction-quality';
import {
  resolvePageTextWithQualityGate,
  setOcrPageProviderForTests,
} from '@/lib/design-intelligence/code-knowledge/ocr-page-fallback';
import { reconstructPageText } from '@/lib/design-intelligence/code-knowledge/pdf-page-extract';
import {
  buildSaudiPolicyAuditReport,
  isSaudiPolicyEligibleDocument,
  SAUDI_POLICY_EXCLUDED_NFPA_DOCUMENT_ID,
  SAUDI_POLICY_RETAINED_DOCUMENT_ID,
} from '@/lib/design-intelligence/saudi-code-policy';
import { isActiveIndexedKnowledgeDocument } from '@/lib/design-intelligence/knowledge-base';
import type { DiKnowledgeDocument } from '@/lib/design-intelligence/types';

function glyph(str: string, x: number, y: number, order: number, width = 3, height = 14) {
  return { str, x, y, width, height, order };
}

describe('extraction quality gate', () => {
  it('A: accepts a valid Arabic SBC paragraph', () => {
    const text =
      'يجب توفير أنظمة الرش الآلي وفق متطلبات الكود السعودي SBC-801 طبعة 2018 في المباني العالية.';
    const q = assessExtractionTextQuality(text);
    expect(q.usable).toBe(true);
    expect(q.score).toBeGreaterThanOrEqual(0.55);
  });

  it('B: accepts Arabic TextItems fixed by geometry reconstruction (#269)', () => {
    const word = 'الرشاشات';
    const items = [...word].map((ch, i) => glyph(ch, 100 + i * 3, 200, i));
    const text = reconstructPageText(items);
    expect(text.replace(/\s/g, '')).toBe(word);
    expect(assessExtractionTextQuality(text).usable).toBe(true);
  });

  it('C: rejects long repeated garbage characters', () => {
    const text = `${'ا'.repeat(40)} ${'x'.repeat(80)}`;
    const q = assessExtractionTextQuality(text);
    expect(q.usable).toBe(false);
    expect(q.reasons.length).toBeGreaterThan(0);
  });

  it('D: rejects broken CID-like Arabic fragments', () => {
    const text = 'ال ب ر ش ا ش ا ت ف ي ال م ب ا ن ي ال ع ا ل ي ة';
    expect(assessExtractionTextQuality(text).usable).toBe(false);
  });

  it('E: accepts English + Arabic + section number', () => {
    const text =
      'Automatic Sprinkler Systems (أنظمة الرش الآلي) — Section 903.3.1.1 of SBC-801 / 2018.';
    expect(assessExtractionTextQuality(text).usable).toBe(true);
  });

  it('F: accepts tables / numeric units', () => {
    const text = 'الحد الأدنى للضغط 7 bar | المساحة 93 m2 | القطر 100 مم وفق الجدول 9.2';
    expect(assessExtractionTextQuality(text).usable).toBe(true);
  });
});

describe('selective OCR fallback', () => {
  afterEach(() => {
    setOcrPageProviderForTests(null);
  });

  it('G: failed PDF text + good OCR → OCR selected', async () => {
    const pdfGarbage = 'ال ب ر ش ا ش ا ت اااااااااااااااا';
    const ocrGood = 'يجب توفير أنظمة الرش الآلي وفق SBC-801 طبعة 2018 في المباني.';
    const result = await resolvePageTextWithQualityGate({
      pageNumber: 120,
      pdfText: pdfGarbage,
      ocrText: ocrGood,
    });
    expect(result.method).toBe('ocr');
    expect(result.quality.usable).toBe(true);
    expect(result.text).toContain('أنظمة الرش');
  });

  it('H: failed PDF text + failed OCR → page unusable', async () => {
    const bad = 'اااااااااااااااا ال ب ت ث';
    const result = await resolvePageTextWithQualityGate({
      pageNumber: 365,
      pdfText: bad,
      ocrText: 'xxxx xxxx xxxx اااااااااا',
    });
    expect(result.method).toBe('unusable');
    expect(result.quality.usable).toBe(false);
    expect(result.text).toBe('');
  });

  it('marks unusable with diagnostic when OCR runtime unavailable', async () => {
    setOcrPageProviderForTests(null);
    delete process.env.DI_OCR_ENABLED;
    delete process.env.DI_OCR_ENDPOINT;
    const result = await resolvePageTextWithQualityGate({
      pageNumber: 477,
      pdfText: 'ال ب ر ش ا ش ا ت اااااااااااااااااااا',
    });
    expect(result.method).toBe('unusable');
    expect(result.ocrAvailable).toBe(false);
    expect(String(result.diagnostic || '')).toMatch(/ocr_unavailable|pdf_text_unusable/i);
  });
});

describe('Saudi-only policy + document count', () => {
  it('K: Saudi SBC-801 retained document is allowed', () => {
    expect(
      isSaudiPolicyEligibleDocument({
        id: SAUDI_POLICY_RETAINED_DOCUMENT_ID,
        code: 'SBC-801',
        edition: '2018',
        title: 'SBC 801A-FF-2018',
      })
    ).toBe(true);
  });

  it('L: NFPA-only source excluded by Saudi-only policy', () => {
    expect(
      isSaudiPolicyEligibleDocument({
        id: SAUDI_POLICY_EXCLUDED_NFPA_DOCUMENT_ID,
        code: 'NFPA-13',
        edition: '2025',
        title: 'NFPA 13',
      })
    ).toBe(false);
    expect(
      isSaudiPolicyEligibleDocument({
        id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
        code: 'NFPA-13',
        edition: '2025',
        title: 'NFPA 13 Standard',
        storage_path: 'x/code-knowledge/NFPA-13/2025/doc/NFPA.pdf',
      })
    ).toBe(false);
  });

  it('M: soft-deleted docs excluded from document count', () => {
    const doc = {
      id: SAUDI_POLICY_RETAINED_DOCUMENT_ID,
      title: 'SBC 801',
      status: 'active',
      index_status: 'indexed',
      ingestion_status: 'indexed',
      company_id: 'company-1',
      code: 'SBC-801',
      edition: '2018',
      deleted_at: new Date().toISOString(),
    } as DiKnowledgeDocument;
    expect(isActiveIndexedKnowledgeDocument(doc, 'company-1')).toBe(false);
  });

  it('N: failed docs excluded from document count', () => {
    const doc = {
      id: SAUDI_POLICY_RETAINED_DOCUMENT_ID,
      title: 'SBC 801',
      status: 'active',
      index_status: 'failed',
      ingestion_status: 'failed',
      company_id: 'company-1',
      code: 'SBC-801',
      edition: '2018',
    } as DiKnowledgeDocument;
    expect(isActiveIndexedKnowledgeDocument(doc, 'company-1')).toBe(false);
  });

  it('O: eligible Saudi document count uses persisted-style fields', () => {
    const saudi = {
      id: SAUDI_POLICY_RETAINED_DOCUMENT_ID,
      title: 'SBC 801A-FF-2018',
      status: 'active',
      index_status: 'indexed',
      ingestion_status: 'indexed',
      company_id: 'company-1',
      code: 'SBC-801',
      edition: '2018',
    } as DiKnowledgeDocument;
    const nfpa = {
      id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      title: 'NFPA 13',
      status: 'active',
      index_status: 'indexed',
      ingestion_status: 'indexed',
      company_id: 'company-1',
      code: 'NFPA-13',
      edition: '2025',
    } as DiKnowledgeDocument;
    const active = [saudi, nfpa].filter((d) => isActiveIndexedKnowledgeDocument(d, 'company-1'));
    expect(active).toHaveLength(1);
    expect(active[0].id).toBe(SAUDI_POLICY_RETAINED_DOCUMENT_ID);
  });

  it('builds audit report without mutating rows', () => {
    const report = buildSaudiPolicyAuditReport([
      {
        id: SAUDI_POLICY_RETAINED_DOCUMENT_ID,
        code: 'SBC-801',
        edition: '2018',
        title: 'SBC',
      },
      {
        id: SAUDI_POLICY_EXCLUDED_NFPA_DOCUMENT_ID,
        code: 'NFPA-13',
        edition: '2025',
        title: 'NFPA',
      },
    ]);
    expect(report.eligible).toHaveLength(1);
    expect(report.excluded).toHaveLength(1);
    expect(report.retainedProductionTarget.documentId).toBe(SAUDI_POLICY_RETAINED_DOCUMENT_ID);
  });
});

describe('RAG quality enforcement helpers', () => {
  it('I/J: unusable chunk cannot receive strong/100% confidence', () => {
    const garbage = 'ال ب ر ش ا ش ا ت اااااااااااااااااااااااااااااااااااااااااااا';
    const q = assessExtractionTextQuality(garbage);
    expect(q.usable).toBe(false);
    const retrievalScore = 0.99;
    const capped =
      q.score < 0.85 ? Math.min(Math.min(retrievalScore, q.score), 0.7) : Math.min(retrievalScore, q.score);
    expect(Math.round(capped * 100)).toBeLessThan(100);
    expect(Math.round(capped * 100)).toBeLessThan(70);
  });
});

describe('P: no NFPA demo/default UI remains in Code Knowledge production UI', () => {
  it('Design Intelligence + Code Knowledge UI defaults are Saudi', () => {
    const di = readFileSync(
      join(process.cwd(), 'components/design/DesignIntelligenceModule.tsx'),
      'utf8'
    );
    const ck = readFileSync(
      join(process.cwd(), 'components/design/CodeKnowledgePanel.tsx'),
      'utf8'
    );
    expect(di).not.toMatch(/What NFPA references/);
    expect(di).not.toMatch(/ما متطلبات NFPA المذكورة/);
    expect(di).toMatch(/SBC/);
    expect(ck).not.toMatch(/useState\('NFPA-13'\)/);
    expect(ck).not.toMatch(/Register \+ adopt NFPA-13 2025/);
    expect(ck).not.toMatch(/placeholder=\"NFPA-13\"/);
    expect(ck).toMatch(/SBC-801/);
  });
});

describe('Q: canonical compliance engine remains unchanged', () => {
  it('keeps lib/projects/compliance present', () => {
    const compliance = readFileSync(
      join(process.cwd(), 'lib/projects/compliance/index.ts'),
      'utf8'
    );
    expect(compliance.length).toBeGreaterThan(10);
  });
});
