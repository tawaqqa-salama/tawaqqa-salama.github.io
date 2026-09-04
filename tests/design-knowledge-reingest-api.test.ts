import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const routeSource = readFileSync(
  new URL('../app/api/design/knowledge/reingest/route.ts', import.meta.url),
  'utf8'
);
const kbSource = readFileSync(
  new URL('../lib/design-intelligence/knowledge-base.ts', import.meta.url),
  'utf8'
);

describe('design knowledge reingest API', () => {
  it('is tenant-gated with design module and admin role', () => {
    expect(routeSource).toContain("withTenantApi(req, { module: 'design' })");
    expect(routeSource).toContain("requireRole(gated.ctx, ['tenant_admin', 'admin'])");
    expect(routeSource).toContain('gated.ctx.tenantId');
    expect(routeSource).toContain('// Ignore client-supplied company_id');
  });

  it('uses user-scoped JWT client — never exposes service role to browser', () => {
    expect(routeSource).toContain('createUserScopedSupabase(accessToken)');
    expect(routeSource).toContain('Bearer access token required');
    expect(routeSource).not.toContain('createServiceRoleSupabase');
    expect(routeSource).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
  });

  it('calls reingestKnowledgeDocumentFromStorage with session tenant', () => {
    expect(routeSource).toContain('reingestKnowledgeDocumentFromStorage(documentId');
    expect(routeSource).toContain('companyId: gated.ctx.tenantId');
    expect(routeSource).toContain('client: userClient');
  });

  it('validates UUID documentId only (single document, no bulk)', () => {
    expect(routeSource).toContain('documentId must be a valid UUID');
    expect(routeSource).not.toContain('documentIds');
    expect(routeSource).not.toContain('for (const');
  });

  it('hardening: reingest accepts companyId + client and preserves verification fields', () => {
    expect(kbSource).toContain('companyId?: string | null');
    expect(kbSource).toContain('client?: SupabaseClient');
    expect(kbSource).toContain("error: 'company_mismatch'");
    expect(kbSource).toContain('ingestion_version: updated.ingestion_version');
    expect(kbSource).toContain('verification_status: updated.verification_status');
    expect(kbSource).toContain('platform_verification_status: updated.platform_verification_status');
  });

  it('does not hardcode Production document IDs or secrets', () => {
    expect(routeSource).not.toContain('deb74a38-b94c-443a-831d-c8765a872809');
    expect(routeSource).not.toContain('SERVICE_ROLE');
    expect(routeSource).not.toContain('eyJ');
  });
});
