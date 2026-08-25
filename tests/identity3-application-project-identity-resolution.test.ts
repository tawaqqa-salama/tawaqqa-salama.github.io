import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fromMock = vi.fn();

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (...args: unknown[]) => fromMock(...args),
  },
}));

import { resolvePrimaryEngineeringProjectIdentity } from '@/lib/projects/primary-engineering-project-identity';

const root = resolve(__dirname, '..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

function queryResult(result: { data: unknown; error: unknown }) {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue(result),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  return query;
}

describe('IDENTITY-3 application project identity resolution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    ['client-1', 'project-1', 'PRJ-2026-000001', 'EXISTING'],
    ['client-2', 'project-2', 'PRJ-2026-000002', 'UNDER_CONSTRUCTION'],
  ])('resolves the canonical mapped identity for %s', async (clientId, projectId, projectCode, projectClassification) => {
    const mappingQuery = queryResult({ data: { client_id: clientId, project_id: projectId }, error: null });
    const projectQuery = queryResult({
      data: { id: projectId, client_id: clientId, project_code: projectCode, project_classification: projectClassification },
      error: null,
    });
    fromMock.mockReturnValueOnce(mappingQuery).mockReturnValueOnce(projectQuery);

    await expect(resolvePrimaryEngineeringProjectIdentity(clientId)).resolves.toEqual({
      clientId,
      projectId,
      projectCode,
      projectClassification,
    });
    expect(fromMock).toHaveBeenNthCalledWith(1, 'primary_engineering_project_mappings');
    expect(mappingQuery.eq).toHaveBeenCalledWith('client_id', clientId);
    expect(fromMock).toHaveBeenNthCalledWith(2, 'projects');
    expect(projectQuery.eq).toHaveBeenCalledWith('id', projectId);
    expect(projectQuery.eq).toHaveBeenCalledWith('client_id', clientId);
  });

  it('preserves a legacy NULL classification without inferring from client status or payload state', async () => {
    const mappingQuery = queryResult({ data: { client_id: 'legacy-client', project_id: 'legacy-project' }, error: null });
    const projectQuery = queryResult({
      data: {
        id: 'legacy-project',
        client_id: 'legacy-client',
        project_code: 'PRJ-2026-000099',
        project_classification: null,
      },
      error: null,
    });
    fromMock.mockReturnValueOnce(mappingQuery).mockReturnValueOnce(projectQuery);

    await expect(resolvePrimaryEngineeringProjectIdentity('legacy-client')).resolves.toEqual({
      clientId: 'legacy-client',
      projectId: 'legacy-project',
      projectCode: 'PRJ-2026-000099',
      projectClassification: null,
    });
  });

  it('keeps client-centric loading safe if the identity read throws unexpectedly', async () => {
    fromMock.mockImplementationOnce(() => {
      throw new Error('network unavailable');
    });

    await expect(resolvePrimaryEngineeringProjectIdentity('client-network-failure')).resolves.toBeNull();
  });

  it('handles a missing or tenant-hidden mapping safely without a project fallback', async () => {
    const mappingQuery = queryResult({ data: null, error: null });
    fromMock.mockReturnValueOnce(mappingQuery);

    await expect(resolvePrimaryEngineeringProjectIdentity('client-without-mapping')).resolves.toBeNull();
    expect(fromMock).toHaveBeenCalledTimes(1);
    expect(mappingQuery.eq).toHaveBeenCalledWith('client_id', 'client-without-mapping');
  });

  it('fails closed when RLS hides a cross-tenant mapping', async () => {
    const mappingQuery = queryResult({ data: null, error: { code: 'PGRST116' } });
    fromMock.mockReturnValueOnce(mappingQuery);

    await expect(resolvePrimaryEngineeringProjectIdentity('cross-tenant-client')).resolves.toBeNull();
    expect(fromMock).toHaveBeenCalledTimes(1);
  });

  it('rejects a malformed mapping or mismatched project/client pair', async () => {
    const mappingQuery = queryResult({ data: { client_id: 'client-1', project_id: 'project-1' }, error: null });
    const projectQuery = queryResult({
      data: { id: 'project-1', client_id: 'another-client', project_code: 'PRJ-2026-000001' },
      error: null,
    });
    fromMock.mockReturnValueOnce(mappingQuery).mockReturnValueOnce(projectQuery);

    await expect(resolvePrimaryEngineeringProjectIdentity('client-1')).resolves.toBeNull();
  });

  it('never calls the creation-capable ensure resolver or derives an identity from clientId', () => {
    const identityReader = read('lib/projects/primary-engineering-project-identity.ts');
    expect(identityReader).not.toContain('ensure_or_resolve_engineering_project_for_client');
    expect(identityReader).not.toContain('.rpc(');
    expect(identityReader).not.toContain('crypto.randomUUID');
    expect(identityReader).not.toContain('projectId: normalizedClientId');
    expect(identityReader).toContain(".from('primary_engineering_project_mappings')");
    expect(identityReader).toContain(".eq('client_id', normalizedClientId)");
    expect(identityReader).toContain(".from('projects')");
    expect(identityReader).toContain('project_classification');
    expect(identityReader).not.toContain('project_status');
    expect(identityReader).not.toContain('building_status');
    expect(identityReader).not.toContain('lifecycle_mode');
    expect(identityReader).toContain(".eq('id', mapping.project_id)");
  });

  it('keeps the project-file route client-centric and stores an optional read-only identity context', () => {
    const route = read('app/projects/file/page.tsx');
    const clientType = read('lib/types/client.ts');
    expect(route).toContain("const id = (searchParams.get('id') || '').trim();");
    expect(route).toContain('fetchClientById(id)');
    expect(route).toContain('resolvePrimaryEngineeringProjectIdentity(merged.id)');
    expect(route).toContain('primary_engineering_project_identity: identity');
    expect(route).not.toContain('searchParams.get(\'projectId\')');
    expect(route).not.toContain('ensure_or_resolve_engineering_project_for_client');
    expect(clientType).toContain('export interface CanonicalProjectIdentity');
    expect(clientType).toContain('primary_engineering_project_identity?: CanonicalProjectIdentity | null;');
  });

  it('keeps canonical engineering persistence client_id keyed and the Stage 6 contracts frozen', () => {
    const engineeringLiveStore = read('lib/projects/engineering-live-store.ts');
    const stage6aGate = read('scripts/sql/055_stage6_transmittal_contract_gate.sql');
    const stage6b1Schema = read('scripts/sql/056_stage6b_project_correspondences_schema.sql');
    const stage6b2Rpcs = read('scripts/sql/057_stage6b_correspondence_persistence_rpcs.sql');
    const identityMigration = read('scripts/sql/058_project_identity_foundation.sql');
    expect(engineeringLiveStore).toContain('loadEngineeringLive(client.id)');
    expect(stage6aGate).toContain("v_target NOT IN ('supervision_visits', 'transmittals', 'final_report')");
    expect(stage6b1Schema).toContain('FOREIGN KEY (project_id, client_id)');
    expect(stage6b2Rpcs).toContain('CREATE OR REPLACE FUNCTION public.create_project_correspondence_draft(');
    expect(identityMigration).toContain('CREATE POLICY primary_engineering_project_mappings_tenant_select');
    expect(identityMigration).toContain('c.company_id = public.current_app_company_id()');
  });
});
