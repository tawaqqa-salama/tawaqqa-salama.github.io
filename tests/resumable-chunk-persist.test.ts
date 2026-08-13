/**
 * Resumable chunk persistence: preserve existing rows, insert missing pages,
 * smaller batches + retry. Does not change NFPA numeric rules.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  chunkPagesPreserving,
  chunkContentFingerprint,
  CHUNK_PERSIST_BATCH_SIZE,
} from '@/lib/design-intelligence/code-knowledge';
import type { ExtractedPdfPage } from '@/lib/design-intelligence/code-knowledge/pdf-page-extract';

const root = process.cwd();

describe('Resumable chunk persistence', () => {
  it('uses small batch size with retry/backoff helpers', () => {
    expect(CHUNK_PERSIST_BATCH_SIZE).toBeLessThanOrEqual(8);
    const src = readFileSync(
      join(root, 'lib/design-intelligence/code-knowledge/persist.ts'),
      'utf8'
    );
    expect(src).toMatch(/mode\?:\s*'replace'\s*\|\s*'resume'/);
    expect(src).toMatch(/CHUNK_PERSIST_BATCH_SIZE\s*=\s*8/);
    expect(src).toMatch(/isTransientPersistError/);
    expect(src).toMatch(/listPersistedChunkFingerprints/);
    expect(src).toMatch(/analyzePersistedChunkCoverage/);
    // Resume must NOT delete-all by default when mode=resume
    expect(src).toMatch(/if \(mode === 'replace'\)/);
  });

  it('chunkContentFingerprint is stable and page-scoped', () => {
    const a = chunkContentFingerprint(12, 'Section 8.1 sprinkler density');
    const b = chunkContentFingerprint(12, 'Section 8.1 sprinkler density');
    const c = chunkContentFingerprint(13, 'Section 8.1 sprinkler density');
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it('empty page placeholders cover page 1 without empty content', () => {
    const pages: ExtractedPdfPage[] = [
      { page: 1, text: '', extraction_method: 'ocr' },
      { page: 2, text: 'Section 5.1 density criteria.', extraction_method: 'text' },
      { page: 3, text: '', extraction_method: 'empty' },
    ];
    const without = chunkPagesPreserving(pages, 700);
    expect(without.every((c) => c.page_start !== 1)).toBe(true);

    const withPlaceholders = chunkPagesPreserving(pages, 700, {
      includeEmptyPagePlaceholders: true,
    });
    expect(withPlaceholders.some((c) => c.page_start === 1)).toBe(true);
    expect(withPlaceholders.some((c) => c.page_start === 3)).toBe(true);
    expect(withPlaceholders.every((c) => c.content.trim().length > 0)).toBe(true);
    expect(withPlaceholders.find((c) => c.page_start === 1)?.extraction_method).toBe(
      'ocr'
    );
  });

  it('ingest path enables empty placeholders and resume mode wiring', () => {
    const src = readFileSync(
      join(root, 'lib/design-intelligence/code-knowledge/storage-ingestion.ts'),
      'utf8'
    );
    expect(src).toMatch(/includeEmptyPagePlaceholders:\s*true/);
    expect(src).toMatch(/resumeIncompleteCodeKnowledgeIngestion/);
    expect(src).toMatch(/chunkPersistMode:\s*'resume'/);
    expect(src).toMatch(/chunkPersistMode:\s*input\.chunkPersistMode/);
  });

  it('ops resume script targets production document without re-upload', () => {
    const src = readFileSync(
      join(root, 'scripts/resume-nfpa13-chunk-persist.ts'),
      'utf8'
    );
    expect(src).toMatch(/f2cb639d-ea72-4322-b851-d04a38ef930d/);
    expect(src).toMatch(/Does NOT upload/);
    expect(src).toMatch(/BATCH_SIZE = 8/);
    expect(src).toMatch(/includeEmptyPagePlaceholders:\s*true/);
    expect(src).not.toMatch(/\.upload\(/);
    expect(src).not.toMatch(/numeric_value|NFPA.?13.*density/i);
  });

  it('package.json exposes resume:nfpa13-chunks', () => {
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
    expect(pkg.scripts['resume:nfpa13-chunks']).toMatch(
      /resume-nfpa13-chunk-persist/
    );
  });
});
