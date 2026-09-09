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
  const mod = await import('@/lib/design-intelligence/knowledge-base');
  return mod.ragQuery(question, 5, { companyId });
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


describe('Saudi sprinkler hybrid retrieval regressions', () => {
  beforeEach(() => {
    installMemoryLocalStorage();
  });

  const SPRINKLER_Q =
    'ما متطلبات أنظمة الرش الآلي المذكورة في الكود السعودي للحماية من الحريق؟ اعرض الإجابة مع رقم الصفحة والمصدر فقط، ولا تستخدم أي معلومة غير موجودة في المصدر المفهرس';

  function sbcDoc(): DiKnowledgeDocument {
    return {
      id: 'd-sbc801',
      title: 'SBC 801A-FF-2018',
      status: 'active',
      index_status: 'indexed',
      ingestion_status: 'indexed',
      code: 'SBC-801',
      edition: '2018',
      applicable_codes: ['SBC 801'],
      company_id: 'company-a',
    };
  }

  function chunk(
    id: string,
    page: number,
    content: string,
    section?: string
  ): DiKnowledgeChunk {
    return {
      id,
      document_id: 'd-sbc801',
      chunk_index: page,
      page_number: page,
      content,
      embedding: embedText(content),
      code: 'SBC-801',
      edition: '2018',
      code_reference: 'SBC-801 / 2018',
      company_id: 'company-a',
      document_title: 'SBC 801A-FF-2018',
      section: section || null,
    };
  }

  it('does not return stair/exit page 286 or hazmat page 464 above sprinkler sections', async () => {
    const stairs =
      'أبعاد الدرج ومخارج الطوارئ ومتطلبات وسائل الهروب. Dimensional means of egress and exit stair width requirements for occupied floors.';
    const hazmat =
      'تخزين المواد الخطرة والمواد الكيميائية. Hazardous materials storage and control area limits for industrial occupancy.';
    const sprinkler =
      'متطلبات أنظمة الرش الآلي والرشاشات. Automatic sprinkler system requirements, sprinkler density, and coverage for fire protection per SBC 801.';
    const chunks = [
      chunk('c-286', 286, stairs, '10.5'),
      chunk('c-464', 464, hazmat, '27.1'),
      chunk('c-spr', 120, sprinkler, '9.2'),
    ];
    const result = await runRag(SPRINKLER_Q, chunks, [sbcDoc()]);
    expect(result.citations.length).toBeGreaterThan(0);
    expect(result.citations[0].pageNumber).toBe(120);
    expect(result.citations[0].pageNumber).not.toBe(286);
    expect(result.citations[0].pageNumber).not.toBe(464);
    expect(result.citations[0].code).toBe('SBC-801');
    expect(result.citations[0].edition).toBe('2018');
    for (const c of result.citations) {
      expect(c.pageNumber).not.toBe(286);
      expect(c.pageNumber).not.toBe(464);
      expect(String(c.paragraph || '')).toMatch(/رش|sprinkler/i);
    }
  });

  it('suppresses unrelated results and abstains when only weak off-topic evidence exists', async () => {
    const stairs =
      'متطلبات أبعاد السلالم ومخارج الطوارئ في المباني. Stair dimensional system and emergency exits.';
    const result = await runRag(SPRINKLER_Q, [chunk('c-only-stairs', 286, stairs)], [sbcDoc()]);
    expect(result.answer).toBe('NEEDS_DATA');
    expect(result.reliable).toBe(false);
    expect(result.citations).toEqual([]);
    expect(result.message || '').toContain('لا يوجد مرجع مفهرس ذو صلة كافية للإجابة على هذا السؤال.');
  });

  it('preserves Arabic source order and SBC-801 / 2018 metadata on citations', async () => {
    const content =
      'متطلبات نظام الرش الآلي حسب SBC-801 طبعة 2018. Automatic sprinkler protection criteria and water supply.';
    const result = await runRag(SPRINKLER_Q, [chunk('c-ar', 95, content, '9.1')], [sbcDoc()]);
    expect(result.citations.length).toBeGreaterThan(0);
    const c = result.citations[0];
    expect(c.paragraph).toContain('متطلبات نظام الرش الآلي');
    expect(c.paragraph).not.toBe([...content].reverse().join(''));
    expect(c.code).toBe('SBC-801');
    expect(c.edition).toBe('2018');
    expect(c.documentTitle).toContain('SBC 801');
  });

  it('does not introduce NFPA knowledge for an SBC-only sprinkler corpus', async () => {
    const sprinkler =
      'أنظمة الرش الآلي في الكود السعودي SBC-801 / 2018. Automatic sprinkler installation criteria.';
    const result = await runRag(SPRINKLER_Q, [chunk('c-sbc-only', 88, sprinkler)], [sbcDoc()]);
    expect(result.citations.length).toBeGreaterThan(0);
    for (const c of result.citations) {
      expect(String(c.code || c.codeReference || '')).toMatch(/SBC/i);
      expect(String(c.code || c.codeReference || '')).not.toMatch(/NFPA/i);
      expect(String(c.paragraph || '')).not.toMatch(/NFPA/i);
    }
  });
});

describe('active indexed document count', () => {
  beforeEach(() => {
    installMemoryLocalStorage();
  });

  it('counts only current-company active indexed docs (soft-deleted excluded) = 1', async () => {
    vi.resetModules();
    installMemoryLocalStorage();
    const docs: DiKnowledgeDocument[] = [
      {
        id: 'active-sbc',
        title: 'SBC 801 2018',
        status: 'active',
        index_status: 'indexed',
        ingestion_status: 'indexed',
        chunk_count: 1246,
        company_id: 'company-a',
        code: 'SBC-801',
        edition: '2018',
        deleted_at: null,
      },
      {
        id: 'soft-deleted-1',
        title: 'Old NFPA',
        status: 'active',
        index_status: 'indexed',
        ingestion_status: 'indexed',
        chunk_count: 100,
        company_id: 'company-a',
        deleted_at: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 'soft-deleted-2',
        title: 'Old SBC draft',
        status: 'active',
        index_status: 'indexed',
        ingestion_status: 'indexed',
        chunk_count: 50,
        company_id: 'company-a',
        deleted_at: '2026-02-01T00:00:00.000Z',
      },
      {
        id: 'other-company',
        title: 'Other company doc',
        status: 'active',
        index_status: 'indexed',
        ingestion_status: 'indexed',
        chunk_count: 10,
        company_id: 'company-b',
        deleted_at: null,
      },
      {
        id: 'not-ingestion-indexed',
        title: 'Pending ingest',
        status: 'active',
        index_status: 'indexed',
        ingestion_status: 'uploaded',
        chunk_count: 10,
        company_id: 'company-a',
        deleted_at: null,
      },
      {
        id: 'failed-index',
        title: 'Failed',
        status: 'active',
        index_status: 'failed',
        ingestion_status: 'indexed',
        chunk_count: 10,
        company_id: 'company-a',
        deleted_at: null,
      },
    ];
    localStorage.setItem('tawaqqa_di_knowledge_docs_v1', JSON.stringify(docs));
    localStorage.setItem('tawaqqa_di_knowledge_chunks_v1', JSON.stringify([]));
    const {
      isActiveIndexedKnowledgeDocument,
      listKnowledgeDocumentsSync,
      SBC_ARABIC_EXTRACTION_REINGEST_REQUIRED,
    } = await import('@/lib/design-intelligence/knowledge-base');
    const listed = listKnowledgeDocumentsSync('company-a');
    // Soft-deleted excluded from list; non-indexed statuses may still appear until filtered.
    expect(listed.some((d) => d.id === 'active-sbc')).toBe(true);
    expect(listed.every((d) => !d.deleted_at)).toBe(true);
    expect(listed.every((d) => d.company_id === 'company-a')).toBe(true);
    const active = listed.filter((d) => isActiveIndexedKnowledgeDocument(d, 'company-a'));
    expect(active).toHaveLength(1);
    expect(active[0].id).toBe('active-sbc');
    expect(SBC_ARABIC_EXTRACTION_REINGEST_REQUIRED).toBe(true);
  });
});
