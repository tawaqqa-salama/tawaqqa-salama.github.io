import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpcMock = vi.fn();
const fromMock = vi.fn();

vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpcMock(...args),
    from: (...args: unknown[]) => fromMock(...args),
  },
}));

import {
  BASIC_DATA_PROJECT_CLASSIFICATION_LABELS,
  basicDataProjectClassificationOptions,
  readBasicDataProjectClassification,
  syncProjectClassificationFromBasicData,
} from '@/lib/projects/basic-data-project-classification';
import { resolvePrimaryEngineeringProjectIdentity } from '@/lib/projects/primary-engineering-project-identity';

const root = resolve(__dirname, '..');
const read = (relative: string) => readFileSync(resolve(root, relative), 'utf8');
const migration = read('scripts/sql/065_basic_data_project_classification_sync.sql');
const basicModal = read('components/clients/ClientDetailModal.tsx');
const identityReader = read('lib/projects/primary-engineering-project-identity.ts');

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

describe('Basic Data project classification sync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reads explicit canonical Basic Data classification from clients.project_classification', () => {
    expect(readBasicDataProjectClassification({ project_classification: 'EXISTING' })).toBe('EXISTING');
    expect(readBasicDataProjectClassification({ project_classification: 'UNDER_CONSTRUCTION' })).toBe(
      'UNDER_CONSTRUCTION'
    );
  });

  it('accepts only exact Arabic Basic Data labels stored in legacy project_status', () => {
    expect(
      readBasicDataProjectClassification({ project_status: BASIC_DATA_PROJECT_CLASSIFICATION_LABELS.EXISTING })
    ).toBe('EXISTING');
    expect(
      readBasicDataProjectClassification({
        project_status: BASIC_DATA_PROJECT_CLASSIFICATION_LABELS.UNDER_CONSTRUCTION,
      })
    ).toBe('UNDER_CONSTRUCTION');
  });

  it('never guesses from operational project_status values', () => {
    expect(readBasicDataProjectClassification({ project_status: 'تحت الإنشاء' })).toBeNull();
    expect(readBasicDataProjectClassification({ project_status: 'قائم - تحت المعاينة' })).toBeNull();
    expect(readBasicDataProjectClassification({ project_status: '', project_classification: null })).toBeNull();
  });

  it('prefers clients.project_classification over legacy project_status labels', () => {
    expect(
      readBasicDataProjectClassification({
        project_classification: 'UNDER_CONSTRUCTION',
        project_status: BASIC_DATA_PROJECT_CLASSIFICATION_LABELS.EXISTING,
      })
    ).toBe('UNDER_CONSTRUCTION');
  });

  it('exposes the approved Basic Data classification options', () => {
    expect(basicDataProjectClassificationOptions()).toEqual([
      { value: 'EXISTING', label: 'موقع قائم' },
      { value: 'UNDER_CONSTRUCTION', label: 'مشروع قيد الإنشاء' },
    ]);
  });

  it.each([
    ['EXISTING', 'موقع قائم'],
    ['UNDER_CONSTRUCTION', 'مشروع قيد الإنشاء'],
  ] as const)('syncs %s through the server RPC', async (projectClassification, label) => {
    rpcMock.mockResolvedValueOnce({
      data: [{
        project_id: 'project-1',
        client_id: 'client-1',
        project_code: 'PRJ-2026-000012',
        project_classification: projectClassification,
        synced: true,
      }],
      error: null,
    });

    await expect(syncProjectClassificationFromBasicData('client-1')).resolves.toEqual({
      projectClassification,
      synced: true,
      error: null,
    });

    expect(rpcMock).toHaveBeenCalledWith('sync_project_classification_from_basic_data', {
      p_client_id: 'client-1',
    });
    expect(label).toMatch(/موقع|مشروع/);
  });

  it('returns a neutral null result when Basic Data has no explicit classification', async () => {
    rpcMock.mockResolvedValueOnce({ data: [], error: null });

    await expect(syncProjectClassificationFromBasicData('client-empty')).resolves.toEqual({
      projectClassification: null,
      synced: false,
      error: null,
    });
  });

  it('adds clients.project_classification and a tenant-scoped sync RPC without operational-status backfill', () => {
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS project_classification text NULL');
    expect(migration).toContain("project_classification IN ('EXISTING', 'UNDER_CONSTRUCTION')");
    expect(migration).toContain('sync_project_classification_from_basic_data');
    expect(migration).toContain("btrim(coalesce(v_client_status, '')) = 'موقع قائم'");
    expect(migration).toContain("btrim(coalesce(v_client_status, '')) = 'مشروع قيد الإنشاء'");
    expect(migration).not.toContain("'تحت الإنشاء'");
    expect(migration).not.toContain("'قائم - تحت المعاينة'");
    expect(migration).not.toMatch(/UPDATE\s+public\.projects\s+SET\s+project_classification\s*=\s*'EXISTING'[\s\S]*WHERE[\s\S]*project_status/i);
  });

  it('persists Basic Data classification in ClientDetailModal and syncs after save', () => {
    expect(basicModal).toContain('تصنيف المشروع الهندسي');
    expect(basicModal).toContain('project_classification: projectClassification || null');
    expect(basicModal).toContain('syncProjectClassificationFromBasicData(client.id)');
    expect(basicModal).toContain('readBasicDataProjectClassification');
  });

  it('inherits legacy Basic Data label LD-2026-012-2 style rows into EXISTING on identity resolve', async () => {
    const clientId = 'ld-2026-012-2-client';
    const projectId = 'ld-2026-012-2-project';
    const mappingQuery = queryResult({ data: { client_id: clientId, project_id: projectId }, error: null });
    const projectQuery = queryResult({
      data: {
        id: projectId,
        client_id: clientId,
        project_code: 'PRJ-2026-000012',
        project_classification: null,
      },
      error: null,
    });

    fromMock.mockReturnValueOnce(mappingQuery).mockReturnValueOnce(projectQuery);
    rpcMock.mockResolvedValueOnce({
      data: [{
        project_id: projectId,
        client_id: clientId,
        project_code: 'PRJ-2026-000012',
        project_classification: 'EXISTING',
        synced: true,
      }],
      error: null,
    });

    await expect(resolvePrimaryEngineeringProjectIdentity(clientId)).resolves.toEqual({
      clientId,
      projectId,
      projectCode: 'PRJ-2026-000012',
      projectClassification: 'EXISTING',
    });

    expect(rpcMock).toHaveBeenCalledWith('sync_project_classification_from_basic_data', {
      p_client_id: clientId,
    });
    expect(identityReader).toContain('syncProjectClassificationFromBasicData');
  });

  it('keeps Stage 4 unclassified when Basic Data is actually empty', async () => {
    const clientId = 'legacy-client';
    const projectId = 'legacy-project';
    const mappingQuery = queryResult({ data: { client_id: clientId, project_id: projectId }, error: null });
    const projectQuery = queryResult({
      data: {
        id: projectId,
        client_id: clientId,
        project_code: 'PRJ-2026-000099',
        project_classification: null,
      },
      error: null,
    });

    fromMock.mockReturnValueOnce(mappingQuery).mockReturnValueOnce(projectQuery);
    rpcMock.mockResolvedValueOnce({ data: [], error: null });

    await expect(resolvePrimaryEngineeringProjectIdentity(clientId)).resolves.toEqual({
      clientId,
      projectId,
      projectCode: 'PRJ-2026-000099',
      projectClassification: null,
    });
  });
});
