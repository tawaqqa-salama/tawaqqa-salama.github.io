import { describe, expect, it, beforeEach } from 'vitest';
import {
  ensureSeedKnowledgeBase,
  indexDocumentText,
  pruneKnowledgeLocalCache,
} from '@/lib/design-intelligence/knowledge-base';
import type { DiKnowledgeDocument } from '@/lib/design-intelligence/types';

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

describe('design intelligence localStorage quota safety', () => {
  beforeEach(() => {
    installMemoryLocalStorage();
  });

  it('does not store embedding vectors or full PDF payloads in localStorage', async () => {
    ensureSeedKnowledgeBase();
    const draft: DiKnowledgeDocument = {
      id: 'doc-quota-test',
      title: 'Large safety PDF',
      status: 'active',
      index_status: 'processing',
      source_kind: 'upload',
      file_name: 'big.pdf',
      file_size_bytes: 5_000_000,
    };

    const hugeText = 'سلامة وحماية من الحريق '.repeat(8000);
    await indexDocumentText(draft, hugeText, false);

    const rawDocs = localStorage.getItem('tawaqqa_di_knowledge_docs_v1') || '';
    const rawChunks = localStorage.getItem('tawaqqa_di_knowledge_chunks_v1') || '';
    expect(rawDocs.length).toBeLessThan(800_000);
    expect(rawChunks.length).toBeLessThan(1_500_000);
    expect(rawDocs).not.toContain(hugeText.slice(0, 500));
    expect(rawChunks.includes('"embedding":[')).toBe(false);
  });

  it('pruneKnowledgeLocalCache shrinks legacy bloated keys', () => {
    localStorage.setItem(
      'tawaqqa_di_knowledge_docs_v1',
      JSON.stringify([
        {
          id: 'x',
          title: 't',
          status: 'active',
          index_status: 'indexed',
          extracted_text: 'abc'.repeat(10000),
          data_url: `data:application/pdf;base64,${'A'.repeat(20000)}`,
        },
      ])
    );
    pruneKnowledgeLocalCache();
    const raw = localStorage.getItem('tawaqqa_di_knowledge_docs_v1') || '';
    expect(raw.includes('data:application/pdf')).toBe(false);
    expect(raw.length).toBeLessThan(5000);
  });
});
