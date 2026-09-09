/**
 * Code Knowledge / Knowledge Base UI consistency:
 * production-supabase must use persisted rows only (no stale local chunk counts).
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  canReingestKnowledgeRole,
  selectDocumentsForCodeKnowledgeUi,
} from '@/lib/design-intelligence/code-knowledge/presence';
import { resolveKnowledgeDocumentsForUiMode } from '@/lib/design-intelligence/knowledge-base';
import type { CodeKnowledgeDocumentMeta } from '@/lib/design-intelligence/code-knowledge/types';
import type { DiKnowledgeDocument } from '@/lib/design-intelligence/types';

const panelSource = readFileSync(
  new URL('../components/design/CodeKnowledgePanel.tsx', import.meta.url),
  'utf8'
);
const listUiSource = readFileSync(
  new URL(
    '../lib/design-intelligence/code-knowledge/storage-ingestion.ts',
    import.meta.url
  ),
  'utf8'
);
const kbListSource = readFileSync(
  new URL('../lib/design-intelligence/knowledge-base.ts', import.meta.url),
  'utf8'
);

function persistedNfpa(chunkCount: number): CodeKnowledgeDocumentMeta {
  return {
    id: 'deb74a38-b94c-443a-831d-c8765a872809',
    title: 'NFPA 13-2025',
    file_name: 'NFPA-13-2025.pdf',
    code: 'NFPA-13',
    edition: '2025',
    status: 'active',
    index_status: 'indexed',
    ingestion_status: 'indexed',
    storage_path: 'tenant/code-knowledge/NFPA-13/2025/doc/NFPA-13-2025.pdf',
    page_count: 595,
    chunk_count: chunkCount,
    ingestion_version: 1,
    persisted: true,
    deleted_at: null,
  };
}

function localStale(chunkCount: number): CodeKnowledgeDocumentMeta {
  return {
    ...persistedNfpa(chunkCount),
    id: 'local-stale-nfpa-id',
    persisted: false,
    storage_path: null,
  };
}

function diDoc(chunkCount: number, id: string): DiKnowledgeDocument {
  return {
    id,
    title: 'NFPA 13-2025',
    category: 'NFPA',
    status: 'active',
    index_status: 'indexed',
    ingestion_status: 'indexed',
    chunk_count: chunkCount,
    page_count: 595,
    ingestion_version: 1,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  } as DiKnowledgeDocument;
}

describe('production-supabase ignores stale local doc counts', () => {
  it('selectDocumentsForCodeKnowledgeUi drops local rows in persisted mode', () => {
    const selected = selectDocumentsForCodeKnowledgeUi({
      persistedMode: true,
      persistedDocuments: [persistedNfpa(3096)],
      localDocuments: [localStale(3745), persistedNfpa(3745)],
    });
    expect(selected).toHaveLength(1);
    expect(selected[0].chunk_count).toBe(3096);
    expect(selected.some((d) => d.chunk_count === 3745)).toBe(false);
  });

  it('persisted 3096-like server count wins over stale 3745-like local count', () => {
    const selected = resolveKnowledgeDocumentsForUiMode({
      productionSupabase: true,
      persistedDocuments: [diDoc(3096, 'deb74a38-b94c-443a-831d-c8765a872809')],
      localDocuments: [
        diDoc(3745, 'deb74a38-b94c-443a-831d-c8765a872809'),
        diDoc(3745, 'local-only-stale'),
      ],
    });
    expect(selected).toHaveLength(1);
    expect(selected[0].chunk_count).toBe(3096);
    expect(selected[0].id).toBe('deb74a38-b94c-443a-831d-c8765a872809');
  });

  it('demo mode still uses local documents', () => {
    const selected = selectDocumentsForCodeKnowledgeUi({
      persistedMode: false,
      persistedDocuments: [persistedNfpa(3096)],
      localDocuments: [localStale(3745)],
    });
    expect(selected).toHaveLength(1);
    expect(selected[0].chunk_count).toBe(3745);
  });

  it('listCodeKnowledgeDocumentsForUi production path has no local fallback', () => {
    expect(listUiSource).toMatch(/Canonical tenant rows only/);
    expect(listUiSource).toMatch(/no local fallback/);
    // When persistedMode, must not call session-memory list
    const fn = listUiSource.slice(
      listUiSource.indexOf('export async function listCodeKnowledgeDocumentsForUi')
    );
    const productionBranch = fn.slice(0, fn.indexOf('return {\n    documents: listKnowledgeDocumentsForCompany'));
    expect(productionBranch).not.toContain('listKnowledgeDocumentsForCompany');
  });

  it('listKnowledgeDocuments production path does not merge local docs', () => {
    expect(kbListSource).toMatch(/Never fall back to stale local chunk counts/);
    expect(kbListSource).toMatch(/no local merge/);
    expect(kbListSource).not.toMatch(
      /Merge into memory so UI stays consistent without bloating localStorage/
    );
  });
});

describe('reingest role gate matches API semantics', () => {
  it('platform/super admin authorized consistently with API', () => {
    expect(canReingestKnowledgeRole({ roleCode: 'super_admin', isPlatformAdmin: true })).toBe(
      true
    );
    // Platform admin bypass even if role_code is a non-admin tenant role
    expect(canReingestKnowledgeRole({ roleCode: 'engineer', isPlatformAdmin: true })).toBe(true);
    expect(canReingestKnowledgeRole({ roleCode: 'staff', isPlatformAdmin: true })).toBe(true);
  });

  it('tenant admin sees reingest', () => {
    expect(canReingestKnowledgeRole({ roleCode: 'tenant_admin' })).toBe(true);
    expect(canReingestKnowledgeRole({ roleCode: 'admin' })).toBe(true);
    expect(canReingestKnowledgeRole('tenant_admin')).toBe(true);
    expect(canReingestKnowledgeRole('admin')).toBe(true);
  });

  it('normal user does not', () => {
    expect(canReingestKnowledgeRole({ roleCode: 'engineer', isPlatformAdmin: false })).toBe(
      false
    );
    expect(canReingestKnowledgeRole({ roleCode: 'sales' })).toBe(false);
    expect(canReingestKnowledgeRole('viewer')).toBe(false);
    expect(canReingestKnowledgeRole(null)).toBe(false);
    expect(canReingestKnowledgeRole({ roleCode: null, isPlatformAdmin: false })).toBe(false);
  });
});

describe('Documents table renders ingestion_version and refreshes canonically', () => {
  it('ingestion_version rendered in Code Knowledge table', () => {
    expect(panelSource).toContain('Ingestion Ver.');
    expect(panelSource).toContain('d.ingestion_version ??');
    expect(panelSource).toContain('ingestion_version={existingNfpa13.ingestion_version');
  });

  it('refresh replaces stale state from canonical listing', () => {
    expect(panelSource).toContain('selectDocumentsForCodeKnowledgeUi');
    expect(panelSource).toContain('listCodeKnowledgeDocumentsForUi({ companyId: company })');
    expect(panelSource).toContain('setDocs(next)');
    expect(panelSource).toContain('await refresh()');
    expect(panelSource).toContain(
      'canReingestKnowledgeRole({\n    roleCode: session?.roleCode || profile?.role_code,\n    isPlatformAdmin: Boolean(session?.isPlatformAdmin),\n  })'
    );
  });
});
