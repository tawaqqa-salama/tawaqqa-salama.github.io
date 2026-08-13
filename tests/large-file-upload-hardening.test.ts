/**
 * Large-file upload hardening: TUS threshold, bucket limit, progress, no ingest before 100%.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, beforeEach } from 'vitest';
import {
  assertWithinBucketLimit,
  DESIGN_KNOWLEDGE_FILE_SIZE_LIMIT_BYTES,
  RESUMABLE_UPLOAD_THRESHOLD_BYTES,
  TUS_CHUNK_SIZE_BYTES,
  shouldUseResumableUpload,
  createInMemoryCodeKnowledgeStorage,
  resetCodeKnowledgeStore,
  resetInMemoryCodeKnowledgeStorage,
  uploadAndIngestCodeKnowledgeDocument,
} from '@/lib/design-intelligence/code-knowledge';

const root = process.cwd();

describe('Large file upload hardening', () => {
  beforeEach(() => {
    resetCodeKnowledgeStore();
    resetInMemoryCodeKnowledgeStorage();
  });

  it('bucket limit is 500 MiB and TUS threshold is 6 MiB', () => {
    expect(DESIGN_KNOWLEDGE_FILE_SIZE_LIMIT_BYTES).toBe(500 * 1024 * 1024);
    expect(RESUMABLE_UPLOAD_THRESHOLD_BYTES).toBe(6 * 1024 * 1024);
    expect(TUS_CHUNK_SIZE_BYTES).toBe(6 * 1024 * 1024);
    expect(shouldUseResumableUpload(6 * 1024 * 1024 - 1)).toBe(false);
    expect(shouldUseResumableUpload(6 * 1024 * 1024)).toBe(true);
    expect(assertWithinBucketLimit(DESIGN_KNOWLEDGE_FILE_SIZE_LIMIT_BYTES)).toBeNull();
    expect(assertWithinBucketLimit(DESIGN_KNOWLEDGE_FILE_SIZE_LIMIT_BYTES + 1)).toMatch(
      /file_too_large/
    );
  });

  it('048 SQL raises design-knowledge file_size_limit to 500 MiB', () => {
    const sql = readFileSync(
      join(root, 'scripts/sql/048_design_knowledge_large_upload.sql'),
      'utf8'
    );
    expect(sql).toMatch(/524288000/);
    expect(sql).toMatch(/design-knowledge/);
    expect(sql).not.toMatch(/numeric_value|NFPA.?13.*density/i);
  });

  it('resumable module uses tus-js-client and storage hostname', () => {
    const src = readFileSync(
      join(root, 'lib/design-intelligence/code-knowledge/resumable-upload.ts'),
      'utf8'
    );
    expect(src).toMatch(/tus-js-client/);
    expect(src).toMatch(/upload\/resumable/);
    expect(src).toMatch(/storage\.supabase\.co/);
    expect(src).toMatch(/retryDelays/);
    expect(src).toMatch(/findPreviousUploads/);
    expect(src).toMatch(/resumeFromPreviousUpload/);
    expect(src).toMatch(/onProgress/);
  });

  it('ingestion does not start until upload completes — phases ordered in source', () => {
    const src = readFileSync(
      join(root, 'lib/design-intelligence/code-knowledge/storage-ingestion.ts'),
      'utf8'
    );
    const uploadIdx = src.indexOf("input.onPhase?.('uploading')");
    const extractIdx = src.indexOf("input.onPhase?.('extracting')");
    const commentIdx = src.indexOf(
      'Ingestion starts only after Storage upload is 100% complete'
    );
    expect(uploadIdx).toBeGreaterThan(-1);
    expect(extractIdx).toBeGreaterThan(uploadIdx);
    expect(commentIdx).toBeGreaterThan(uploadIdx);
    expect(commentIdx).toBeLessThan(extractIdx);
    expect(src).toMatch(/shouldUseResumableUpload/);
    expect(src).toMatch(/uploadKnowledgeFileResumable/);
  });

  it('UI shows Uploading N% progress and pause/resume', () => {
    const ck = readFileSync(
      join(root, 'components/design/CodeKnowledgePanel.tsx'),
      'utf8'
    );
    const kb = readFileSync(
      join(root, 'components/design/DesignIntelligenceModule.tsx'),
      'utf8'
    );
    expect(ck).toMatch(/Uploading \$\{uploadPercent\}%/);
    expect(ck).toMatch(/Pause upload/);
    expect(ck).toMatch(/Resume upload/);
    expect(ck).toMatch(/role="progressbar"/);
    expect(kb).toMatch(/Uploading \$\{kbUploadPercent\}%/);
    expect(kb).toMatch(/Pause upload/);
  });

  it('small upload still indexes via standard path (extraction unchanged)', async () => {
    const storage = createInMemoryCodeKnowledgeStorage();
    const phases: string[] = [];
    const progress: number[] = [];
    const text = 'Section 8.1 sprinkler density requirements for NFPA 13 tests.';
    const bytes = new TextEncoder().encode(text);

    const result = await uploadAndIngestCodeKnowledgeDocument({
      companyId: '00000000-0000-4000-8000-0000000000a1',
      code: 'NFPA-13',
      edition: '2025',
      title: 'small test',
      fileName: 'small.txt',
      mimeType: 'text/plain',
      bytes,
      source_document_id: 'test:small',
      storage,
      onPhase: (p) => phases.push(p),
      onUploadProgress: (pct) => progress.push(pct),
    });

    expect(result.status).toBe('indexed');
    if (result.status !== 'indexed') return;
    expect(result.chunk_count).toBeGreaterThan(0);
    expect(progress).toContain(100);
    expect(phases).toContain('uploading');
    expect(phases).toContain('uploaded');
    expect(phases).toContain('extracting');
    expect(phases.indexOf('uploading')).toBeLessThan(phases.indexOf('extracting'));
    expect(result.upload_method).toBe('standard');
  });

  it('identical SHA-256 skips re-upload', async () => {
    const storage = createInMemoryCodeKnowledgeStorage();
    const bytes = new TextEncoder().encode('identical body for sha test NFPA section.');
    const first = await uploadAndIngestCodeKnowledgeDocument({
      companyId: '00000000-0000-4000-8000-0000000000a1',
      code: 'NFPA-13',
      edition: '2025',
      title: 'first',
      fileName: 'a.txt',
      mimeType: 'text/plain',
      bytes,
      source_document_id: 'test:dup-a',
      storage,
    });
    expect(first.status).toBe('indexed');
    // Mark persisted so Production-style skip applies even without Supabase
    if (first.status === 'indexed') {
      first.document.persisted = true;
    }

    const second = await uploadAndIngestCodeKnowledgeDocument({
      companyId: '00000000-0000-4000-8000-0000000000a1',
      code: 'NFPA-13',
      edition: '2025',
      title: 'second',
      fileName: 'b.txt',
      mimeType: 'text/plain',
      bytes,
      source_document_id: 'test:dup-b',
      storage,
    });
    expect(second.status).toBe('skipped_duplicate');
  });
});
