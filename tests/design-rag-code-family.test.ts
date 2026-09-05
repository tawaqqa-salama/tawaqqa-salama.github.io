/**
 * RAG code-family separation, citation source fidelity, topic gating.
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
  assertChunkDocumentCodeConsistency,
  ChunkDocumentCodeConflictError,
  chunkMatchesQueryTopic,
  inferRequestedBroadFamilies,
  reconcileChunkCodeWithDocument,
  resolveSourceCodeFamily,
  shouldRouteAsNfpa13Document,
} from '@/lib/design-intelligence/code-family';
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

describe('code-family helpers', () => {
  it('does not route Saudi Fire Code titles to NFPA-13 when codes also list NFPA 13', () => {
    expect(
      shouldRouteAsNfpa13Document({
        fileName: 'saudi-fire-code.pdf',
        title: 'الكود السعودي للحماية من الحريق',
        codes: ['SBC 801', 'NFPA 13'],
      })
    ).toBe(false);
  });

  it('routes true NFPA-13 titles to the NFPA-13 pipeline', () => {
    expect(
      shouldRouteAsNfpa13Document({
        fileName: 'nfpa-13-2025.pdf',
        title: 'NFPA 13 Standard for the Installation of Sprinkler Systems',
        codes: ['NFPA 13'],
      })
    ).toBe(true);
  });

  it('resolves mislabeled NFPA-13 code on Saudi title to SBC for citations', () => {
    const resolved = resolveSourceCodeFamily({
      code: 'NFPA-13',
      edition: '2025',
      title: 'الكود السعودي للحماية من الحريق',
      applicableCodes: ['SBC 801', 'NFPA 13'],
    });
    expect(resolved.broad).toBe('SBC');
    expect(resolved.conflict).toBe(true);
    expect(resolved.displayCode).not.toMatch(/NFPA/i);
    expect(resolved.displayEdition).toBeNull();
  });

  it('rejects chunk code that conflicts with parent document family', () => {
    expect(() =>
      assertChunkDocumentCodeConsistency({
        documentCode: 'SBC-801',
        documentTitle: 'الكود السعودي للحماية من الحريق',
        chunkCode: 'NFPA-13',
      })
    ).toThrow(ChunkDocumentCodeConflictError);
  });

  it('reconciles blank chunk code from parent document', () => {
    expect(
      reconcileChunkCodeWithDocument({
        documentCode: 'NFPA-13',
        documentTitle: 'NFPA 13 2025',
        chunkCode: null,
      })
    ).toBe('NFPA-13');
  });

  it('fails stair content for sprinkler-spacing topic queries', () => {
    expect(
      chunkMatchesQueryTopic(
        'اعرض مراجع تباعد وتغطية الرشاشات المذكورة.',
        'اشتراطات الدرج الخارجي ووسائل الهروب في الكود السعودي.'
      )
    ).toBe(false);
    expect(
      chunkMatchesQueryTopic(
        'اعرض مراجع تباعد وتغطية الرشاشات المذكورة.',
        'NFPA 13 sprinkler spacing and coverage area requirements for light hazard.'
      )
    ).toBe(true);
  });
});

describe('ragQuery code-family hard exclusion', () => {
  beforeEach(() => {
    installMemoryLocalStorage();
  });

  it('excludes SBC documents from NFPA queries even when chunk.code was mislabeled NFPA-13', async () => {
    const sbcStair =
      'الكود السعودي للحماية من الحريق — اشتراطات الدرج الخارجي ووسائل الهروب والسلالم.';
    const nfpaSprinkler =
      'NFPA 13 sprinkler spacing and coverage. Maximum area of coverage and distance between sprinklers.';
    const chunks: DiKnowledgeChunk[] = [
      {
        id: 'c-sbc',
        document_id: 'd-sbc',
        chunk_index: 0,
        page_number: 77,
        content: sbcStair,
        embedding: embedText(sbcStair),
        code: 'NFPA-13',
        edition: '2025',
        company_id: 'company-a',
        document_title: 'الكود السعودي للحماية من الحريق',
      },
      {
        id: 'c-nfpa',
        document_id: 'd-nfpa',
        chunk_index: 0,
        page_number: 10,
        content: nfpaSprinkler,
        embedding: embedText(nfpaSprinkler),
        code: 'NFPA-13',
        edition: '2025',
        company_id: 'company-a',
        document_title: 'NFPA 13 Standard 2025',
      },
    ];
    const docs: DiKnowledgeDocument[] = [
      {
        id: 'd-sbc',
        title: 'الكود السعودي للحماية من الحريق',
        status: 'active',
        index_status: 'indexed',
        code: 'NFPA-13',
        edition: '2025',
        applicable_codes: ['SBC 801', 'NFPA 13'],
        company_id: 'company-a',
      },
      {
        id: 'd-nfpa',
        title: 'NFPA 13 Standard 2025',
        status: 'active',
        index_status: 'indexed',
        code: 'NFPA-13',
        edition: '2025',
        applicable_codes: ['NFPA 13'],
        company_id: 'company-a',
      },
    ];

    const result = await runRag('ما متطلبات NFPA 13 للرشاشات؟', chunks, docs);
    expect(result.citations.length).toBeGreaterThan(0);
    expect(result.citations.every((c) => c.documentId === 'd-nfpa')).toBe(true);
    expect(result.citations[0].code).toMatch(/NFPA/i);
  });

  it('excludes NFPA documents from SBC / Saudi code queries', async () => {
    const sbcText =
      'الكود السعودي للحماية من الحريق SBC 801 متطلبات الوقاية من الحريق للمباني.';
    const nfpaText =
      'NFPA 13 automatic sprinkler system installation requirements and water supply.';
    const chunks: DiKnowledgeChunk[] = [
      {
        id: 'c-sbc2',
        document_id: 'd-sbc2',
        chunk_index: 0,
        page_number: 5,
        content: sbcText,
        embedding: embedText(sbcText),
        code: 'SBC-801',
        company_id: 'company-a',
        document_title: 'الكود السعودي للحماية من الحريق',
      },
      {
        id: 'c-nfpa2',
        document_id: 'd-nfpa2',
        chunk_index: 0,
        page_number: 3,
        content: nfpaText,
        embedding: embedText(nfpaText),
        code: 'NFPA-13',
        edition: '2025',
        company_id: 'company-a',
        document_title: 'NFPA 13 Standard 2025',
      },
    ];
    const docs: DiKnowledgeDocument[] = [
      {
        id: 'd-sbc2',
        title: 'الكود السعودي للحماية من الحريق',
        status: 'active',
        index_status: 'indexed',
        code: 'SBC-801',
        company_id: 'company-a',
      },
      {
        id: 'd-nfpa2',
        title: 'NFPA 13 Standard 2025',
        status: 'active',
        index_status: 'indexed',
        code: 'NFPA-13',
        edition: '2025',
        company_id: 'company-a',
      },
    ];

    const result = await runRag('ما متطلبات الكود السعودي للحماية من الحريق؟', chunks, docs);
    expect(result.citations.length).toBeGreaterThan(0);
    expect(result.citations.every((c) => c.documentId === 'd-sbc2')).toBe(true);
    expect(String(result.citations[0].code || '')).not.toMatch(/NFPA/i);
  });

  it('allows cross-code retrieval for generic queries but keeps source labels', async () => {
    const sbcText =
      'SBC 801 fire protection occupancy classification and means of egress overview.';
    const nfpaText =
      'NFPA 13 sprinkler system design density and area of coverage requirements.';
    const chunks: DiKnowledgeChunk[] = [
      {
        id: 'c-sbc3',
        document_id: 'd-sbc3',
        chunk_index: 0,
        page_number: 2,
        content: sbcText,
        embedding: embedText(sbcText),
        code: 'SBC-801',
        company_id: 'company-a',
        document_title: 'الكود السعودي للحماية من الحريق',
      },
      {
        id: 'c-nfpa3',
        document_id: 'd-nfpa3',
        chunk_index: 0,
        page_number: 8,
        content: nfpaText,
        embedding: embedText(nfpaText),
        code: 'NFPA-13',
        edition: '2025',
        company_id: 'company-a',
        document_title: 'NFPA 13 Standard 2025',
      },
    ];
    const docs: DiKnowledgeDocument[] = [
      {
        id: 'd-sbc3',
        title: 'الكود السعودي للحماية من الحريق',
        status: 'active',
        index_status: 'indexed',
        code: 'SBC-801',
        company_id: 'company-a',
      },
      {
        id: 'd-nfpa3',
        title: 'NFPA 13 Standard 2025',
        status: 'active',
        index_status: 'indexed',
        code: 'NFPA-13',
        edition: '2025',
        company_id: 'company-a',
      },
    ];

    expect(inferRequestedCodeFamilies('general fire protection overview')).toEqual([]);
    expect(inferRequestedBroadFamilies('general fire protection overview')).toEqual([]);

    const result = await runRag('general fire protection overview', chunks, docs);
    for (const c of result.citations) {
      if (c.documentId === 'd-sbc3') {
        expect(String(c.code || '')).not.toMatch(/NFPA/i);
        expect(c.documentTitle).toContain('السعودي');
      }
      if (c.documentId === 'd-nfpa3') {
        expect(String(c.code || '')).toMatch(/NFPA/i);
      }
    }
  });

  it('Arabic sprinkler-spacing query retrieves NFPA sprinkler chunks and rejects stair chunks', async () => {
    const stair =
      'الكود السعودي للحماية من الحريق — الدرج الخارجي ووسائل الهروب والسلالم في المباني العالية.';
    const sprinkler =
      'NFPA 13 sprinkler spacing and coverage. تباعد وتغطية الرشاشات. Maximum distance between sprinklers and protection area.';
    const chunks: DiKnowledgeChunk[] = [
      {
        id: 'c-stair',
        document_id: 'd-sbc-stair',
        chunk_index: 0,
        page_number: 285,
        content: stair,
        embedding: embedText(stair),
        code: 'NFPA-13',
        edition: '2025',
        company_id: 'company-a',
        document_title: 'الكود السعودي للحماية من الحريق',
      },
      {
        id: 'c-spr',
        document_id: 'd-nfpa-spr',
        chunk_index: 0,
        page_number: 12,
        content: sprinkler,
        embedding: embedText(sprinkler),
        code: 'NFPA-13',
        edition: '2025',
        company_id: 'company-a',
        document_title: 'NFPA 13 Standard 2025',
      },
    ];
    const docs: DiKnowledgeDocument[] = [
      {
        id: 'd-sbc-stair',
        title: 'الكود السعودي للحماية من الحريق',
        status: 'active',
        index_status: 'indexed',
        code: 'NFPA-13',
        edition: '2025',
        company_id: 'company-a',
      },
      {
        id: 'd-nfpa-spr',
        title: 'NFPA 13 Standard 2025',
        status: 'active',
        index_status: 'indexed',
        code: 'NFPA-13',
        edition: '2025',
        company_id: 'company-a',
      },
    ];

    const result = await runRag(
      'اعرض مراجع تباعد وتغطية الرشاشات المذكورة.',
      chunks,
      docs
    );
    expect(result.citations.some((c) => c.documentId === 'd-nfpa-spr')).toBe(true);
    expect(result.citations.every((c) => c.documentId !== 'd-sbc-stair')).toBe(true);
  });

  it('fire-pump Arabic query returns NEEDS_DATA when no pump material is indexed', async () => {
    const stair =
      'اشتراطات الدرج ووسائل الهروب في الكود السعودي للحماية من الحريق.';
    const chunks: DiKnowledgeChunk[] = [
      {
        id: 'c-only-stair',
        document_id: 'd-only',
        chunk_index: 0,
        page_number: 1,
        content: stair,
        embedding: embedText(stair),
        code: 'SBC-801',
        company_id: 'company-a',
        document_title: 'الكود السعودي للحماية من الحريق',
      },
    ];
    const result = await runRag(
      'ما متطلبات مضخة الحريق المذكورة في الملفات المفهرسة؟',
      chunks,
      [
        {
          id: 'd-only',
          title: 'الكود السعودي للحماية من الحريق',
          status: 'active',
          index_status: 'indexed',
          code: 'SBC-801',
          company_id: 'company-a',
        },
      ]
    );
    expect(result.reliable).toBe(false);
    expect(result.answer).toBe('NEEDS_DATA');
    expect(result.citations).toEqual([]);
    expect(MIN_RESULT_SCORE).toBeGreaterThanOrEqual(0.32);
    expect(RELIABLE_SCORE).toBeGreaterThan(MIN_RESULT_SCORE);
  });

  it('fire-pump Arabic query can retrieve NFPA-20 / pump material when indexed', async () => {
    const pump =
      'NFPA 20 fire pump suction and discharge requirements, pump room arrangement and rated flow.';
    const chunks: DiKnowledgeChunk[] = [
      {
        id: 'c-pump',
        document_id: 'd-pump',
        chunk_index: 0,
        page_number: 4,
        content: pump,
        embedding: embedText(pump),
        code: 'NFPA-20',
        edition: '2022',
        company_id: 'company-a',
        document_title: 'NFPA 20 Standard for Fire Pumps',
      },
    ];
    const result = await runRag(
      'ما متطلبات مضخة الحريق المذكورة في الملفات المفهرسة؟',
      chunks,
      [
        {
          id: 'd-pump',
          title: 'NFPA 20 Standard for Fire Pumps',
          status: 'active',
          index_status: 'indexed',
          code: 'NFPA-20',
          edition: '2022',
          company_id: 'company-a',
        },
      ]
    );
    expect(result.citations.length).toBeGreaterThan(0);
    expect(result.citations[0].documentId).toBe('d-pump');
    expect(String(result.citations[0].code || '')).toMatch(/NFPA-?20/i);
  });
});
