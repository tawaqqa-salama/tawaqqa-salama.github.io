/**
 * Knowledge Base PDF / page-preserving ingestion (no invented NFPA numerics).
 */

import { describe, expect, it } from 'vitest';
import { extractTextFromFile } from '@/lib/design-intelligence/embeddings';
import {
  chunkPagesPreserving,
  pagesFromPlainText,
} from '@/lib/design-intelligence/code-knowledge/pdf-page-extract';
import { indexDocumentText } from '@/lib/design-intelligence/knowledge-base';
import type { DiKnowledgeDocument } from '@/lib/design-intelligence/types';

describe('Knowledge PDF page extraction completeness', () => {
  it('page-preserving chunker yields multiple chunks for multi-page source text', async () => {
    const text = [
      'Section 1.1 page one narrative for indexing.',
      'Table 1.2 referenced without numeric activation.',
      'Page 3 spacing discussion. Figure 1.3 cited.',
    ].join('\f');
    const file = new File([text], 'sample-multi-page.txt', { type: 'text/plain' });
    const extracted = await extractTextFromFile(file);
    expect(extracted.page_count).toBeGreaterThan(1);
    expect(extracted.pages_extracted).toBeGreaterThan(1);

    const pages = pagesFromPlainText(extracted.text);
    const parts = chunkPagesPreserving(pages.pages, 900);
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.every((p) => p.page_start != null && p.page_end != null)).toBe(true);

    const draft: DiKnowledgeDocument = {
      id: 'doc-test-1',
      title: 'Sample multi-page',
      status: 'active',
      index_status: 'processing',
      applicable_codes: ['NFPA 13'],
      code: 'NFPA-13',
      edition: '2025',
      source_type: 'PROJECT_PROVIDED_DOCUMENT',
      platform_verification_status: 'NOT_VERIFIED_OFFICIAL',
    };
    const { doc, chunks } = await indexDocumentText(draft, extracted.text, false, {
      page_count: extracted.page_count,
      pages_extracted: extracted.pages_extracted,
      pages_ocr: 0,
      page_texts: extracted.page_texts,
      extraction_method: 'text',
      sha256: 'abc',
    });
    expect(doc.chunk_count).toBeGreaterThan(1);
    expect(chunks.length).toBeGreaterThan(1);
    expect(doc.page_count).toBeGreaterThan(1);
    expect(doc.ingestion_status).toBe('indexed');
    // indexed alone is not enough — pages/chunks must reflect multi-page body
    expect((doc.chunk_count || 0) > 1 || (doc.page_count || 0) > 1).toBe(true);
  });
});
