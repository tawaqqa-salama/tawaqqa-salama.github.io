/**
 * Guard: NFPA canonical re-ingest must never upload; older duplicate is cleanup-only.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, beforeEach } from 'vitest';
import {
  createInMemoryCodeKnowledgeStorage,
  markCodeKnowledgeDuplicateForCleanup,
  reingestExistingCodeKnowledgeStorageObject,
  resetCodeKnowledgeStore,
  getKnowledgeDocument,
  listChunksForDocument,
} from '@/lib/design-intelligence/code-knowledge';

const root = process.cwd();
const COMPANY = '3580b47a-a57b-4b3c-8f0d-db72870c8a85';
const CANONICAL = '4880c356-3b81-453f-9ddd-b023544e7cc1';
const OLDER = '5f69deb0-a4da-4afb-973a-93a9f14f3324';

describe('NFPA canonical Storage re-ingest (no upload)', () => {
  beforeEach(() => {
    resetCodeKnowledgeStore();
  });

  it('ops script targets canonical path and never uploads', () => {
    const src = readFileSync(
      join(root, 'scripts/reingest-nfpa13-canonical-from-storage.ts'),
      'utf8'
    );
    expect(src).toContain(CANONICAL);
    expect(src).toContain(OLDER);
    expect(src).toContain(COMPANY);
    expect(src).toContain('code-knowledge/NFPA-13/2025/');
    expect(src).toContain('document.pdf');
    expect(src).toMatch(/CANONICAL_PATH/);
    expect(src).toMatch(/upload:\s*false|Does NOT upload|Never uploads/);
    expect(src).not.toMatch(/\.upload\(/);
    expect(src).toMatch(/SAFE_CLEANUP_CANDIDATE/);
    expect(src).toMatch(/storage_deleted:\s*false/);
  });

  it('reingestExistingCodeKnowledgeStorageObject indexes from existing bytes', async () => {
    const storage = createInMemoryCodeKnowledgeStorage();
    const path = `${COMPANY}/code-knowledge/NFPA-13/2025/${CANONICAL}/document.txt`;
    const body = new TextEncoder().encode(
      'Section 8.1 sprinkler requirements.\n\nTable 8.2.1 design criteria for NFPA 13 2025.'
    );
    await storage.upload('design-knowledge', path, body);

    const result = await reingestExistingCodeKnowledgeStorageObject({
      companyId: COMPANY,
      documentId: CANONICAL,
      storagePath: path,
      code: 'NFPA-13',
      edition: '2025',
      title: 'NFPA 13-2025 canonical',
      fileName: 'document.txt',
      mimeType: 'text/plain',
      storage,
    });

    // Demo mode (no Supabase): session-memory indexed path
    expect(result.status).toBe('indexed');
    expect(result.document.id).toBe(CANONICAL);
    expect(result.storage_path).toBe(path);
    expect(result.sha256.length).toBe(64);
    expect(result.chunk_count).toBeGreaterThan(0);
    expect(listChunksForDocument(CANONICAL).length).toBeGreaterThan(0);
    expect(getKnowledgeDocument(CANONICAL)?.storage_path).toBe(path);
  });

  it('marks older duplicate for cleanup without deleting Storage', async () => {
    const storage = createInMemoryCodeKnowledgeStorage();
    const olderPath = `${COMPANY}/code-knowledge/NFPA-13/2025/${OLDER}/document.pdf`;
    await storage.upload(
      'design-knowledge',
      olderPath,
      new TextEncoder().encode('dup')
    );

    const marked = await markCodeKnowledgeDuplicateForCleanup({
      olderDocumentId: OLDER,
      canonicalDocumentId: CANONICAL,
      companyId: COMPANY,
      storagePath: olderPath,
      sha256: 'abc',
    });
    expect(marked.ok).toBe(true);

    // Storage object still present
    const dl = await storage.download('design-knowledge', olderPath);
    expect(dl.ok).toBe(true);
  });
});
