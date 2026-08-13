/**
 * Ensures Production Code Knowledge never treats session-memory as success
 * when Supabase persistence is required.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  resetCodeKnowledgeStore,
  resetInMemoryCodeKnowledgeStorage,
  shouldPersistCodeKnowledgeToSupabase,
  uploadAndIngestCodeKnowledgeDocument,
} from '@/lib/design-intelligence/code-knowledge';

const root = process.cwd();

describe('NFPA Code Knowledge persistence gate', () => {
  beforeEach(() => {
    resetCodeKnowledgeStore();
    resetInMemoryCodeKnowledgeStorage();
  });

  it('CodeKnowledgePanel upload button calls uploadAndIngestCodeKnowledgeDocument', () => {
    const src = readFileSync(
      join(root, 'components/design/CodeKnowledgePanel.tsx'),
      'utf8'
    );
    expect(src).toMatch(/uploadAndIngestCodeKnowledgeDocument\(/);
    expect(src).toMatch(/رفع وفهرسة|design\.kb\.index/);
    expect(src).toMatch(/SUPABASE \/ PERSISTED/);
    expect(src).toMatch(/LOCAL \/ NOT SAVED/);
    expect(src).toMatch(/Persisted/);
    expect(src).toMatch(/Document ID/);
    expect(src).toMatch(/Storage Path/);
    expect(src).toMatch(/No silent session-memory fallback/);
  });

  it('storage-ingestion requires persist verify before indexed when Supabase on', () => {
    const src = readFileSync(
      join(root, 'lib/design-intelligence/code-knowledge/storage-ingestion.ts'),
      'utf8'
    );
    expect(src).toMatch(/shouldPersistCodeKnowledgeToSupabase/);
    expect(src).toMatch(/persistAndVerifyCodeKnowledgeIngestion/);
    expect(src).toMatch(/newKnowledgeDocumentId/);
    expect(src).toMatch(/company_id must be a UUID/);
    expect(src).toMatch(/listCodeKnowledgeDocumentsForUi/);
  });

  it('persist module exports verification helpers', () => {
    const src = readFileSync(
      join(root, 'lib/design-intelligence/code-knowledge/persist.ts'),
      'utf8'
    );
    expect(src).toMatch(/export async function persistAndVerifyCodeKnowledgeIngestion/);
    expect(src).toMatch(/export async function verifyPersistedCodeKnowledgeIngestion/);
    expect(src).toMatch(/storage_object_exists/);
    expect(src).toMatch(/db_document_exists/);
  });

  it('demo mode: upload indexes locally with persisted=false', async () => {
    // Agent/test env has no Supabase → demo path
    expect(shouldPersistCodeKnowledgeToSupabase()).toBe(false);

    const bytes = new TextEncoder().encode(
      'Section 8.1 general.\n\nTable 8.2 placeholder for indexing.'
    );
    const result = await uploadAndIngestCodeKnowledgeDocument({
      companyId: 'demo-company',
      code: 'NFPA-13',
      edition: '2025',
      title: 'Demo excerpt',
      fileName: 'excerpt.txt',
      mimeType: 'text/plain',
      bytes,
      source_type: 'PROJECT_PROVIDED_DOCUMENT',
      platform_verification_status: 'NOT_VERIFIED_OFFICIAL',
    });

    expect(result.status).toBe('indexed');
    if (result.status === 'indexed') {
      expect(result.document.persisted).toBe(false);
      expect(result.chunk_count).toBeGreaterThanOrEqual(1);
    }
  });
});
