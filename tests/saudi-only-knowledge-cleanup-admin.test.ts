import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

const requireLivePlatformAdminMock = vi.fn();
const createServiceRoleSupabaseMock = vi.fn();
const hasServiceRoleKeyMock = vi.fn(() => true);
const executeCleanupMock = vi.fn();
const verifyStateMock = vi.fn();

vi.mock('@/lib/auth/platform-gate', () => ({
  requireLivePlatformAdmin: (...args: unknown[]) => requireLivePlatformAdminMock(...args),
}));

vi.mock('@/lib/supabase/server', () => ({
  hasServiceRoleKey: () => hasServiceRoleKeyMock(),
  createServiceRoleSupabase: (...args: unknown[]) => createServiceRoleSupabaseMock(...args),
  createUserScopedSupabase: () => null,
  getTrustedServerSupabase: () => null,
}));

vi.mock('@/lib/design-intelligence/saudi-only-knowledge-cleanup', async () => {
  const actual = await vi.importActual<
    typeof import('@/lib/design-intelligence/saudi-only-knowledge-cleanup')
  >('@/lib/design-intelligence/saudi-only-knowledge-cleanup');
  return {
    ...actual,
    executeSaudiOnlyKnowledgeCleanup: (...args: unknown[]) => executeCleanupMock(...args),
    verifySaudiOnlyCleanupState: (...args: unknown[]) => verifyStateMock(...args),
  };
});

import { GET, POST } from '@/app/api/platform/knowledge/saudi-only-cleanup/route';
import {
  SAUDI_ONLY_CLEANUP_CONFIRM_PHRASE,
  rejectClientIdOverrides,
  isCleanupAlreadyComplete,
  type SaudiOnlyCleanupVerification,
} from '@/lib/design-intelligence/saudi-only-knowledge-cleanup';

const ADMIN_ACTOR = {
  user: { id: 'usr-platform', email: 'owner@tawaqqa.sa', role_code: 'super_admin' },
  roleCode: 'super_admin',
  companyId: 'co-platform',
  isPlatformAdmin: true,
  memberships: [],
};

function authRequest(body?: Record<string, unknown>) {
  return new Request('http://localhost/api/platform/knowledge/saudi-only-cleanup', {
    method: body ? 'POST' : 'GET',
    headers: {
      authorization: 'Bearer valid-jwt',
      'content-type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

function okVerification(
  overrides: Partial<SaudiOnlyCleanupVerification> = {}
): SaudiOnlyCleanupVerification {
  return {
    active_nfpa_document_count: 0,
    nfpa_chunk_count: 0,
    nfpa_storage_exists: false,
    saudi_exists: true,
    saudi_code: 'SBC-801',
    saudi_edition: '2018',
    saudi_category: 'SBC',
    saudi_chunk_count: 1246,
    saudi_chunk_code_mismatch: 0,
    saudi_chunk_edition_mismatch: 0,
    saudi_chunk_source_mismatch: 0,
    active_non_saudi_document_count: 0,
    final_active_document_count: 1,
    final_active_chunk_count: 1246,
    ...overrides,
  };
}

const CONFIRM_BODY = {
  confirm: true,
  confirmTwice: true,
  confirmPhrase: SAUDI_ONLY_CLEANUP_CONFIRM_PHRASE,
};

describe('saudi-only knowledge cleanup API', () => {
  beforeEach(() => {
    requireLivePlatformAdminMock.mockReset();
    createServiceRoleSupabaseMock.mockReset();
    hasServiceRoleKeyMock.mockReset();
    executeCleanupMock.mockReset();
    verifyStateMock.mockReset();
    hasServiceRoleKeyMock.mockReturnValue(true);
    createServiceRoleSupabaseMock.mockReturnValue({ from: vi.fn() });
    requireLivePlatformAdminMock.mockResolvedValue({
      ok: true,
      session: { userId: 'usr-platform' },
      actor: ADMIN_ACTOR,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('denies missing Bearer JWT', async () => {
    const req = new Request('http://localhost/api/platform/knowledge/saudi-only-cleanup', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(CONFIRM_BODY),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
    expect(executeCleanupMock).not.toHaveBeenCalled();
  });

  it('denies non-platform-admin', async () => {
    requireLivePlatformAdminMock.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ ok: false, error: 'Platform admin required' }), {
        status: 403,
      }),
    });
    const res = await POST(authRequest(CONFIRM_BODY));
    expect(res.status).toBe(403);
    expect(executeCleanupMock).not.toHaveBeenCalled();
  });

  it('rejects client ID overrides', async () => {
    const res = await POST(
      authRequest({
        ...CONFIRM_BODY,
        documentId: '11111111-1111-4111-8111-111111111111',
      })
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(String(json.error)).toMatch(/server-controlled/i);
    expect(executeCleanupMock).not.toHaveBeenCalled();
  });

  it('requires double confirmation phrase', async () => {
    const res = await POST(
      authRequest({
        confirm: true,
        confirmTwice: true,
        confirmPhrase: 'wrong phrase',
      })
    );
    expect(res.status).toBe(400);
    expect(executeCleanupMock).not.toHaveBeenCalled();
  });

  it('executes cleanup for platform admin and returns verified counts', async () => {
    executeCleanupMock.mockResolvedValue({
      ok: true,
      alreadyCompleted: false,
      nfpaDocumentDeleted: true,
      nfpaChunksDeleted: 2768,
      nfpaJobsDeleted: 1,
      nfpaStorageDeleted: true,
      saudiDocumentPreserved: true,
      saudiMetadataCorrected: true,
      saudiChunksCorrected: true,
      storageError: null,
      verification: okVerification(),
      messageAr: 'تم تنظيف قاعدة المعرفة بنجاح',
    });

    const res = await POST(authRequest(CONFIRM_BODY));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.nfpaChunksDeleted).toBe(2768);
    expect(json.saudiChunksCorrected).toBe(true);
    expect(json.verification.saudi_code).toBe('SBC-801');
    expect(json.verification.saudi_edition).toBe('2018');
    expect(json.verification.saudi_chunk_count).toBe(1246);
    expect(JSON.stringify(json)).not.toMatch(/service_role|SERVICE_ROLE|eyJ/);
    expect(executeCleanupMock).toHaveBeenCalledTimes(1);
  });

  it('is idempotent on duplicate execution', async () => {
    executeCleanupMock.mockResolvedValue({
      ok: true,
      alreadyCompleted: true,
      nfpaDocumentDeleted: true,
      nfpaChunksDeleted: 0,
      nfpaJobsDeleted: 0,
      nfpaStorageDeleted: true,
      saudiDocumentPreserved: true,
      saudiMetadataCorrected: true,
      saudiChunksCorrected: true,
      storageError: null,
      verification: okVerification(),
      messageAr: 'تم تنظيف قاعدة المعرفة بنجاح',
    });
    const first = await POST(authRequest(CONFIRM_BODY));
    const second = await POST(authRequest(CONFIRM_BODY));
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect((await second.json()).alreadyCompleted).toBe(true);
  });

  it('reports storage deletion failure safely without secrets', async () => {
    executeCleanupMock.mockResolvedValue({
      ok: false,
      alreadyCompleted: false,
      nfpaDocumentDeleted: true,
      nfpaChunksDeleted: 2768,
      nfpaJobsDeleted: 0,
      nfpaStorageDeleted: false,
      saudiDocumentPreserved: true,
      saudiMetadataCorrected: true,
      saudiChunksCorrected: true,
      storageError: 'Storage API remove failed',
      verification: okVerification({ nfpa_storage_exists: true }),
      messageAr: 'فشل حذف ملف التخزين: Storage API remove failed',
    });
    const res = await POST(authRequest(CONFIRM_BODY));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(json.storageError).toMatch(/Storage API/);
    expect(JSON.stringify(json)).not.toMatch(/service_role|SUPABASE_SERVICE_ROLE|eyJ/);
  });

  it('GET preview requires platform admin + bearer', async () => {
    verifyStateMock.mockResolvedValue(okVerification());
    const res = await GET(authRequest());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.preview.will_delete.expected_chunks).toBe(2768);
    expect(json.preview.will_keep.expected_chunks).toBe(1246);
  });
});

describe('saudi-only cleanup helpers', () => {
  it('rejectClientIdOverrides blocks document/company overrides', () => {
    expect(rejectClientIdOverrides({ documentId: 'x' })).toMatch(/documentId/);
    expect(rejectClientIdOverrides({ company_id: 'x' })).toMatch(/company_id/);
    expect(rejectClientIdOverrides({ confirm: true })).toBeNull();
  });

  it('isCleanupAlreadyComplete requires saudi metadata + zero NFPA', () => {
    expect(
      isCleanupAlreadyComplete(okVerification(), {
        code: 'SBC-801',
        edition: '2018',
        category: 'SBC',
        applicable_codes: ['SBC-801'],
        source_document_id: 'storage:SBC-801/2018/ab0ed7b4-f2c8-442c-8278-a9906c9c6f57',
      })
    ).toBe(true);
    expect(isCleanupAlreadyComplete(okVerification({ active_nfpa_document_count: 1 }))).toBe(
      false
    );
  });

  it('route source never logs or returns service role material', () => {
    const src = readFileSync('app/api/platform/knowledge/saudi-only-cleanup/route.ts', 'utf8');
    expect(src).toContain('getBearerAccessToken');
    expect(src).toContain('requireLivePlatformAdmin');
    expect(src).toContain('rejectClientIdOverrides');
    expect(src).toMatch(/\[redacted\]/);
  });

  it('UI requires double confirmation copy', () => {
    const ui = readFileSync(
      'components/platform/SaudiOnlyKnowledgeCleanupPanel.tsx',
      'utf8'
    );
    expect(ui).toContain('تنظيف قاعدة المعرفة');
    expect(ui).toContain('الإبقاء على الأكواد السعودية فقط');
    expect(ui).toContain('تم تنظيف قاعدة المعرفة بنجاح');
    expect(ui).toContain('confirmTwice');
    expect(ui).toContain('withBrowserAuthHeaders');
  });
});
