/**
 * Design Intelligence RAG: code-family ranking, confidence, tenant, traceability.
 * @vitest-environment node
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase', () => ({
  isDemoMode: true,
  isSupabaseConfigured: false,
  SUPABASE_PERSISTENCE_UNAVAILABLE: 'supabase_unavailable',
  supabase: {
    from: () => ({
      select: () => ({
        limit: async () => ({ data: [], error: null }),
        eq: () => ({
          limit: async () => ({ data: [], error: null }),
          in: async () => ({ data: [], error: null }),
          maybeSingle: async () => ({ data: null, error: null }),
        }),
        in: async () => ({ data: [], error: null }),
      }),
    }),
  },
  getSupabaseRuntimeDiagnostics: () => ({
    runtime_mode: 'demo-local',
    project_ref: null,
    expected_project_ref: 'x',
    supabase_configured: false,
  }),
}));

import { embedText } from '@/lib/design-intelligence/embeddings';
import type { DiKnowledgeChunk, DiKnowledgeDocument } from '@/lib/design-intelligence/types';
import {
  inferRequestedCodeFamilies,
  MIN_RESULT_SCORE,
  RELIABLE_SCORE,
} from '@/lib/design-intelligence/knowledge-base';

function installMemoryLocalStorage() {
  const store = new Map<string, string>();
  const api = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => {
      store.set(k, String(v));
    },
    removeItem: (k: string) => {
      store.delete(k);
    },
    clear: () => store.clear(),
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    get length() {
      return store.size;
    },
  };
  Object.defineProperty(globalThis, 'localStorage', { value: api, configurable: true });
  Object.defineProperty(globalThis, 'window', {
    value: { localStorage: api },
    configurable: true,
  });
}

function seedStub(): DiKnowledgeDocument {
  return {
    id: 'ekb-stub',
    title: 'EKB stub',
    status: 'active',
    index_status: 'indexed',
    source_kind: 'ekb-seed',
    company_id: 'company-a',
  };
}

async function runRag(
  question: string,
  chunks: DiKnowledgeChunk[],
  docs: DiKnowledgeDocument[],
  companyId = 'company-a'
) {
  vi.resetModules();
  installMemoryLocalStorage();
  localStorage.setItem(
    'tawaqqa_di_knowledge_docs_v1',
    JSON.stringify([seedStub(), ...docs])
  );
  localStorage.setItem('tawaqqa_di_knowledge_chunks_v1', JSON.stringify(chunks));
  const { ragQuery } = await import('@/lib/design-intelligence/knowledge-base');
  return ragQuery(question, 5, { companyId });
}

describe('inferRequestedCodeFamilies', () => {
  it('detects NFPA and SBC intent', () => {
    expect(inferRequestedCodeFamilies('ما متطلبات NFPA المذكورة؟')).toContain('NFPA');
    expect(inferRequestedCodeFamilies('What does SBC 801 say?')).toContain('SBC');
    expect(inferRequestedCodeFamilies('الكود السعودي للحماية من الحريق')).toContain('SBC');
    expect(inferRequestedCodeFamilies('general sprinkler spacing')).toEqual([]);
  });
});

describe('ragQuery ranking and confidence', () => {
  beforeEach(() => {
    installMemoryLocalStorage();
  });

  it('ranks NFPA above SBC for explicit NFPA question when scores are similar', async () => {
    const nfpaContent =
      'متطلبات NFPA 13 للرشاشات. NFPA 13 requirements for sprinkler system installation and water supply. Automatic sprinkler protection criteria.';
    const sbcContent =
      'اشتراطات SBC 801. SBC 801 requirements for fire protection and building occupancy classification in Saudi code.';
    const chunks: DiKnowledgeChunk[] = [
      {
        id: 'c-sbc',
        document_id: 'd-sbc',
        chunk_index: 0,
        page_number: 2,
        content: sbcContent,
        embedding: embedText(sbcContent),
        code: 'SBC-801',
        code_reference: 'SBC 801',
        company_id: 'company-a',
        document_title: 'SBC 801 Fire',
        edition: '2024',
        section: '4.1',
      },
      {
        id: 'c-nfpa',
        document_id: 'd-nfpa',
        chunk_index: 0,
        page_number: 5,
        content: nfpaContent,
        embedding: embedText(nfpaContent),
        code: 'NFPA-13',
        code_reference: 'NFPA 13',
        company_id: 'company-a',
        document_title: 'NFPA 13 Standard',
        edition: '2025',
        section: '8.1',
      },
    ];
    const docs: DiKnowledgeDocument[] = [
      {
        id: 'd-sbc',
        title: 'SBC 801 Fire',
        status: 'active',
        index_status: 'indexed',
        code: 'SBC-801',
        applicable_codes: ['SBC 801'],
        company_id: 'company-a',
      },
      {
        id: 'd-nfpa',
        title: 'NFPA 13 Standard',
        status: 'active',
        index_status: 'indexed',
        code: 'NFPA-13',
        applicable_codes: ['NFPA 13'],
        company_id: 'company-a',
        edition: '2025',
      },
    ];

    const result = await runRag('ما متطلبات NFPA المذكورة في الملفات؟', chunks, docs);

    expect(result.citations.length).toBeGreaterThan(0);
    expect(result.citations[0].code || result.citations[0].codeReference || '').toMatch(/NFPA/i);
    expect(result.citations[0].documentId).toBe('d-nfpa');
  });

  it('returns unreliable NEEDS_DATA when only wrong family exists for explicit NFPA', async () => {
    const sbcContent =
      'SBC 801 vegetation and landscaping setbacks near buildings for fire apparatus access.';
    const chunks: DiKnowledgeChunk[] = [
      {
        id: 'c-sbc-only',
        document_id: 'd-sbc-only',
        chunk_index: 0,
        page_number: 1,
        content: sbcContent,
        embedding: embedText(sbcContent),
        code: 'SBC-801',
        code_reference: 'SBC 801',
        company_id: 'company-a',
        document_title: 'SBC only',
      },
    ];
    const docs: DiKnowledgeDocument[] = [
      {
        id: 'd-sbc-only',
        title: 'SBC only',
        status: 'active',
        index_status: 'indexed',
        code: 'SBC-801',
        applicable_codes: ['SBC 801'],
        company_id: 'company-a',
      },
    ];

    const result = await runRag('ما متطلبات NFPA المذكورة في الملفات؟', chunks, docs);

    expect(result.reliable).toBe(false);
    expect(result.answer).toBe('NEEDS_DATA');
    expect(result.citations).toEqual([]);
    expect(result.message || '').toMatch(/NFPA|sufficiently relevant/i);
  });

  it('does not mark weak scores as reliable', async () => {
    const content = 'Landscaping irrigation schedule for garden vegetation maintenance.';
    const chunks: DiKnowledgeChunk[] = [
      {
        id: 'c-weak',
        document_id: 'd-weak',
        chunk_index: 0,
        page_number: 1,
        content,
        embedding: embedText(content),
        company_id: 'company-a',
        document_title: 'Garden notes',
        code: 'SBC-801',
      },
    ];
    const result = await runRag(
      'ما متطلبات مضخة الحريق المذكورة في الملفات المفهرسة؟',
      chunks,
      [
        {
          id: 'd-weak',
          title: 'Garden notes',
          status: 'active',
          index_status: 'indexed',
          company_id: 'company-a',
        },
      ]
    );
    expect(result.reliable).toBe(false);
    expect(result.confidence).toBeLessThan(Math.round(RELIABLE_SCORE * 100));
    expect(MIN_RESULT_SCORE).toBeGreaterThan(0.2);
    expect(RELIABLE_SCORE).toBeGreaterThan(MIN_RESULT_SCORE);
  });

  it('never returns company B chunks for company A query', async () => {
    const contentA = 'NFPA 13 fire pump suction and discharge requirements for company A.';
    const contentB = 'NFPA 13 fire pump suction and discharge requirements for company B secret.';
    const chunks: DiKnowledgeChunk[] = [
      {
        id: 'c-a',
        document_id: 'd-a',
        chunk_index: 0,
        page_number: 1,
        content: contentA,
        embedding: embedText(contentA),
        company_id: 'company-a',
        code: 'NFPA-13',
        document_title: 'A NFPA',
      },
      {
        id: 'c-b',
        document_id: 'd-b',
        chunk_index: 0,
        page_number: 1,
        content: contentB,
        embedding: embedText(contentB),
        company_id: 'company-b',
        code: 'NFPA-13',
        document_title: 'B NFPA secret',
      },
    ];
    const result = await runRag('NFPA 13 fire pump requirements', chunks, [
      {
        id: 'd-a',
        title: 'A NFPA',
        status: 'active',
        index_status: 'indexed',
        company_id: 'company-a',
      },
      {
        id: 'd-b',
        title: 'B NFPA secret',
        status: 'active',
        index_status: 'indexed',
        company_id: 'company-b',
      },
    ]);
    for (const c of result.citations) {
      expect(c.documentId).not.toBe('d-b');
      expect(c.documentTitle).not.toMatch(/secret/i);
    }
  });

  it('populates traceability fields when available', async () => {
    const content =
      'NFPA 13 section 9.3.2.1 fire pump room ventilation and drainage requirements detailed.';
    const chunks: DiKnowledgeChunk[] = [
      {
        id: 'c-trace',
        document_id: 'd-trace',
        chunk_index: 0,
        page_number: 17,
        content,
        embedding: embedText(content),
        company_id: 'company-a',
        code: 'NFPA-13',
        edition: '2025',
        section: '9.3.2.1',
        code_reference: 'NFPA 13 §9.3.2.1',
        document_title: 'NFPA 13 2025',
        source_verification_status: 'NOT_VERIFIED_OFFICIAL',
        source_document_id: 'src-1',
      },
    ];
    const result = await runRag('NFPA 13 fire pump room ventilation', chunks, [
      {
        id: 'd-trace',
        title: 'NFPA 13 2025',
        status: 'active',
        index_status: 'indexed',
        company_id: 'company-a',
        code: 'NFPA-13',
        edition: '2025',
        platform_verification_status: 'NOT_VERIFIED_OFFICIAL',
      },
    ]);
    expect(result.citations.length).toBeGreaterThan(0);
    const c = result.citations[0];
    expect(c.documentId).toBe('d-trace');
    expect(c.chunkId).toBe('c-trace');
    expect(c.pageNumber).toBe(17);
    expect(c.code).toBe('NFPA-13');
    expect(c.edition).toBe('2025');
    expect(c.section).toBe('9.3.2.1');
  });
});
