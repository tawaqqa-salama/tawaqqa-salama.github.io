/**
 * Code Knowledge presence + reingest UI regression coverage.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  canReingestKnowledgeRole,
  findExistingNfpa13Document,
  isKnowledgeDocumentPresentInStorage,
  uploadMissingFileMessage,
} from '@/lib/design-intelligence/code-knowledge/presence';
import type { CodeKnowledgeDocumentMeta } from '@/lib/design-intelligence/code-knowledge/types';

const panelSource = readFileSync(
  new URL('../components/design/CodeKnowledgePanel.tsx', import.meta.url),
  'utf8'
);

function nfpaDoc(
  partial?: Partial<CodeKnowledgeDocumentMeta>
): CodeKnowledgeDocumentMeta {
  return {
    id: 'deb74a38-b94c-443a-831d-c8765a872809',
    title: 'NFPA 13-2025',
    file_name: 'NFPA 13-2025.pdf',
    code: 'NFPA-13',
    edition: '2025',
    status: 'active',
    index_status: 'indexed',
    ingestion_status: 'indexed',
    storage_bucket: 'design-knowledge',
    storage_path:
      '3580b47a-a57b-4b3c-8f0d-db72870c8a85/code-knowledge/NFPA-13/2025/deb74a38-b94c-443a-831d-c8765a872809/NFPA-13-2025.pdf',
    page_count: 595,
    chunk_count: 3096,
    ingestion_version: 1,
    platform_verification_status: 'NOT_VERIFIED_OFFICIAL',
    verification_status: 'UNVERIFIED',
    persisted: true,
    deleted_at: null,
    ...partial,
  };
}

describe('code knowledge presence detection', () => {
  it('treats indexed Storage-backed NFPA13 as present', () => {
    const doc = nfpaDoc();
    expect(isKnowledgeDocumentPresentInStorage(doc)).toBe(true);
    expect(findExistingNfpa13Document([doc])?.id).toBe(doc.id);
  });

  it('does not claim file absent when persisted NFPA13 exists', () => {
    const msg = uploadMissingFileMessage(nfpaDoc());
    expect(msg).not.toMatch(/file is not present/i);
    expect(msg).toMatch(/already present|إعادة الفهرسة/);
  });

  it('rejects soft-deleted or pathless rows', () => {
    expect(
      isKnowledgeDocumentPresentInStorage(nfpaDoc({ deleted_at: '2026-01-01', persisted: false }))
    ).toBe(false);
    expect(
      isKnowledgeDocumentPresentInStorage(
        nfpaDoc({ storage_path: null, persisted: false, index_status: 'failed', chunk_count: 0 })
      )
    ).toBe(false);
    expect(findExistingNfpa13Document([nfpaDoc({ code: 'SBC-801' })])).toBeNull();
  });
});

describe('reingest role gate', () => {
  it('allows tenant_admin/admin/super_admin only', () => {
    expect(canReingestKnowledgeRole('tenant_admin')).toBe(true);
    expect(canReingestKnowledgeRole('admin')).toBe(true);
    expect(canReingestKnowledgeRole('super_admin')).toBe(true);
    expect(canReingestKnowledgeRole('engineer')).toBe(false);
    expect(canReingestKnowledgeRole('sales')).toBe(false);
    expect(canReingestKnowledgeRole(null)).toBe(false);
  });
});

describe('CodeKnowledgePanel reingest UI wiring', () => {
  it('does not use the legacy false-absent upload message', () => {
    expect(panelSource).not.toContain(
      'NFPA 13-2025 file is not present. Upload the PDF from this panel'
    );
    expect(panelSource).toContain('uploadMissingFileMessage');
    expect(panelSource).toContain('findExistingNfpa13Document');
    expect(panelSource).toContain('NFPA 13-2025 موجود في التخزين');
  });

  it('shows Arabic reingest control and posts to the authenticated API', () => {
    expect(panelSource).toContain('إعادة الفهرسة');
    expect(panelSource).toContain('جاري إعادة الفهرسة...');
    expect(panelSource).toContain("fetch('/api/design/knowledge/reingest'");
    expect(panelSource).toContain('JSON.stringify({ documentId })');
    // Reingest body must not send company_id — tenant comes from session server-side
    expect(panelSource).toMatch(
      /fetch\('\/api\/design\/knowledge\/reingest'[\s\S]*?body:\s*JSON\.stringify\(\{\s*documentId\s*\}\)/
    );
    expect(panelSource).not.toMatch(
      /fetch\('\/api\/design\/knowledge\/reingest'[\s\S]*?company_id/
    );
    expect(panelSource).toContain('Authorization: `Bearer ${accessToken}`');
    expect(panelSource).toContain('supabase.auth.getSession()');
  });

  it('confirms before reingest and prevents double submission', () => {
    expect(panelSource).toContain(
      'سيتم إعادة فهرسة المستند الحالي من الملف الموجود في التخزين. لن يتم إنشاء مستند جديد.'
    );
    expect(panelSource).toContain('if (busy || reingestingId) return');
    expect(panelSource).toContain('setReingestingId(documentId)');
    expect(panelSource).toContain('disabled={busy || Boolean(reingestingId)}');
  });

  it('gates actionable reingest on admin role and does not call legacy client reingest', () => {
    expect(panelSource).toContain('canReingestKnowledgeRole');
    expect(panelSource).toContain('canReingest && isKnowledgeDocumentPresentInStorage(d)');
    expect(panelSource).not.toContain('reingestCodeKnowledgeDocument');
    expect(panelSource).not.toContain('uploadAndIngestCodeKnowledgeDocument({\n        companyId: company,\n        code: d.code');
  });

  it('does not expose JWT or service role in UI source', () => {
    expect(panelSource).not.toContain('SUPABASE_SERVICE_ROLE');
    expect(panelSource).not.toContain('service_role');
    expect(panelSource).not.toContain('access_token:');
    // Token used only in Authorization header variable — never logged
    expect(panelSource).not.toMatch(/setMessage\([^)]*accessToken/);
  });
});
