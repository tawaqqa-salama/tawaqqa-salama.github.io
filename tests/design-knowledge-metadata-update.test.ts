import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const persist = readFileSync(
  new URL('../lib/design-intelligence/code-knowledge/persist.ts', import.meta.url),
  'utf8'
);
const knowledgeBase = readFileSync(
  new URL('../lib/design-intelligence/knowledge-base.ts', import.meta.url),
  'utf8'
);


describe('duplicate knowledge metadata update', () => {
  it('updates the existing document with tenant and canonical document guards', () => {
    expect(persist).toContain('updatePersistedCodeKnowledgeDocumentMetadata');
    expect(persist).toContain(".eq('id', input.documentId)");
    expect(persist).toContain(".eq('company_id', input.companyId)");
    expect(persist).toContain(".is('deleted_at', null)");
    expect(persist).toContain(".neq('status', 'superseded')");
  });

  it('updates metadata only and never changes file identity or chunks', () => {
    const helper = persist.slice(
      persist.indexOf('export async function updatePersistedCodeKnowledgeDocumentMetadata'),
      persist.indexOf('export async function listPersistedCodeKnowledgeDocuments')
    );
    expect(helper).toContain('.update(patch)');
    expect(helper).not.toContain('sha256');
    expect(helper).not.toContain('storage_path');
    expect(helper).not.toContain('di_knowledge_chunks');
  });

  it('invokes metadata update only for a persisted identical duplicate', () => {
    expect(knowledgeBase).toContain(
      "if (result.status === 'skipped_duplicate' && result.document.persisted)"
    );
    expect(knowledgeBase).toContain('updatePersistedCodeKnowledgeDocumentMetadata({');
    expect(knowledgeBase).toContain('duplicate_metadata_update_failed');
  });
});
