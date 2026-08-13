/**
 * Large-file upload hardening: TUS threshold, Safari/memory, verify-before-extract,
 * resume document id, SHA dedup. Does not change Storage bucket limits.
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
  tusFingerprint,
  createInMemoryCodeKnowledgeStorage,
  resetCodeKnowledgeStore,
  resetInMemoryCodeKnowledgeStorage,
  uploadAndIngestCodeKnowledgeDocument,
  sha256HexFromBlob,
  sha256HexFromBytes,
} from '@/lib/design-intelligence/code-knowledge';

const root = process.cwd();

describe('Large PDF upload production fix', () => {
  beforeEach(() => {
    resetCodeKnowledgeStore();
    resetInMemoryCodeKnowledgeStorage();
  });

  it('bucket limit is 1 GiB and TUS threshold is 6 MiB', () => {
    expect(DESIGN_KNOWLEDGE_FILE_SIZE_LIMIT_BYTES).toBe(1024 * 1024 * 1024);
    expect(RESUMABLE_UPLOAD_THRESHOLD_BYTES).toBe(6 * 1024 * 1024);
    expect(TUS_CHUNK_SIZE_BYTES).toBe(6 * 1024 * 1024);
    expect(shouldUseResumableUpload(6 * 1024 * 1024 - 1)).toBe(false);
    expect(shouldUseResumableUpload(6 * 1024 * 1024)).toBe(true);
    expect(assertWithinBucketLimit(DESIGN_KNOWLEDGE_FILE_SIZE_LIMIT_BYTES)).toBeNull();
    expect(assertWithinBucketLimit(DESIGN_KNOWLEDGE_FILE_SIZE_LIMIT_BYTES + 1)).toMatch(
      /file_too_large/
    );
  });

  it('resumable module uses tus-js-client with Safari resume hardening', () => {
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
    expect(src).toMatch(/uploadDataDuringCreation:\s*false/);
    expect(src).toMatch(/fingerprint/);
    expect(src).toMatch(/onShouldRetry/);
  });

  it('tusFingerprint is stable for same File + path', () => {
    const file = new File([new Uint8Array([1, 2, 3])], 'big.pdf', {
      type: 'application/pdf',
      lastModified: 1700000000000,
    });
    const a = tusFingerprint(file, 'co/code-knowledge/NFPA-13/2025/doc/document.pdf');
    const b = tusFingerprint(file, 'co/code-knowledge/NFPA-13/2025/doc/document.pdf');
    expect(a).toBe(b);
    expect(a).toContain('big.pdf');
  });

  it('sha256HexFromBlob matches sha256HexFromBytes (chunked)', async () => {
    const payload = new Uint8Array(2 * 1024 * 1024 + 17);
    for (let i = 0; i < payload.length; i++) payload[i] = i % 251;
    const fromBytes = await sha256HexFromBytes(payload);
    const blob = new Blob([payload]);
    const fromBlob = await sha256HexFromBlob(blob, 256 * 1024);
    expect(fromBlob).toBe(fromBytes);
  });

  it('ingestion does not start until upload completes — phases + verify gate', () => {
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
    expect(src).toMatch(/verifyStorageObjectExists/);
    expect(src).toMatch(/resumeDocumentId/);
    expect(src).toMatch(/findPersistedDuplicateBySha256/);
    expect(src).toMatch(/sha256HexFromBlob/);
    expect(src).toMatch(/useLargeTus \? undefined : input\.bytes/);
    // Supersede only after indexed — not before upload
    expect(src).toMatch(/if \(ingest\.status === 'indexed'\)/);
    expect(src).toMatch(/supersedeDocument\(p\)/);
  });

  it('UI: large path skips arrayBuffer; Retry/Resume; progress', () => {
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
    expect(ck).toMatch(/Retry \/ Resume/);
    expect(ck).toMatch(/role="progressbar"/);
    expect(ck).toMatch(/resumeDocumentId/);
    expect(ck).toMatch(/bytes = large[\s\S]*\? null/);
    expect(ck).not.toMatch(
      /const bytes = new Uint8Array\(await uploadFile\.arrayBuffer\(\)\);[\s\S]*shouldUseResumableUpload/
    );
    expect(kb).toMatch(/Uploading \$\{kbUploadPercent\}%/);
    expect(kb).toMatch(/Pause upload/);
    expect(kb).toMatch(/Retry \/ Resume/);
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

  it('resumeDocumentId reuses the same Storage path on retry', async () => {
    const storage = createInMemoryCodeKnowledgeStorage();
    const bytes = new TextEncoder().encode('resume path body for NFPA indexing path test.');
    const resumeId = '11111111-1111-4111-8111-111111111111';
    const first = await uploadAndIngestCodeKnowledgeDocument({
      companyId: '00000000-0000-4000-8000-0000000000a1',
      code: 'NFPA-13',
      edition: '2025',
      title: 'resume-a',
      fileName: 'document.txt',
      mimeType: 'text/plain',
      bytes,
      resumeDocumentId: resumeId,
      source_document_id: 'test:resume-a',
      storage,
      replaceIfChanged: false,
    });
    expect(first.status).toBe('indexed');
    if (first.status !== 'indexed') return;
    expect(first.document.id).toBe(resumeId);
    expect(first.storage_path).toContain(resumeId);

    const bytes2 = new TextEncoder().encode('resume path body TWO for NFPA indexing.');
    const second = await uploadAndIngestCodeKnowledgeDocument({
      companyId: '00000000-0000-4000-8000-0000000000a1',
      code: 'NFPA-13',
      edition: '2025',
      title: 'resume-b',
      fileName: 'document.txt',
      mimeType: 'text/plain',
      bytes: bytes2,
      resumeDocumentId: resumeId,
      source_document_id: 'test:resume-b',
      storage,
      replaceIfChanged: false,
    });
    expect(second.status).toBe('indexed');
    if (second.status !== 'indexed') return;
    expect(second.document.id).toBe(resumeId);
    expect(second.storage_path).toBe(first.storage_path);
  });

  it('failed upload does not supersede prior indexed document', async () => {
    const storage = createInMemoryCodeKnowledgeStorage();
    const okBytes = new TextEncoder().encode('prior indexed NFPA document body for supersede guard.');
    const first = await uploadAndIngestCodeKnowledgeDocument({
      companyId: '00000000-0000-4000-8000-0000000000a1',
      code: 'NFPA-13',
      edition: '2025',
      title: 'prior',
      fileName: 'prior.txt',
      mimeType: 'text/plain',
      bytes: okBytes,
      source_document_id: 'test:prior',
      storage,
    });
    expect(first.status).toBe('indexed');
    if (first.status !== 'indexed') return;
    expect(first.document.status).not.toBe('superseded');

    // Force upload failure by using a broken adapter
    const broken = {
      ...storage,
      upload: async () => ({
        ok: false as const,
        bucket: 'design-knowledge',
        path: null,
        error: 'forced_upload_fail',
      }),
      download: storage.download,
      createSignedUrl: storage.createSignedUrl,
      remove: storage.remove,
    };

    const failBytes = new TextEncoder().encode('different body that will fail upload.');
    const failed = await uploadAndIngestCodeKnowledgeDocument({
      companyId: '00000000-0000-4000-8000-0000000000a1',
      code: 'NFPA-13',
      edition: '2025',
      title: 'fail',
      fileName: 'fail.txt',
      mimeType: 'text/plain',
      bytes: failBytes,
      source_document_id: 'test:fail',
      storage: broken,
      replaceIfChanged: true,
    });
    expect(failed.status).toBe('failed');
    expect(first.document.status).not.toBe('superseded');
    expect(first.document.ingestion_status).not.toBe('superseded');
  });
});
