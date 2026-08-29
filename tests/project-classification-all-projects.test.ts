import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpcMock = vi.fn();

vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpcMock(...args),
  },
}));

import {
  backfillAllProjectClassificationsFromBasicData,
  countUnresolvedProjectClassifications,
  readBasicDataProjectClassification,
  syncProjectClassificationFromBasicData,
} from '@/lib/projects/basic-data-project-classification';
import { resolveStage4ProjectClassification } from '@/lib/projects/project-classification-resolution';
import { resolveTechnicalReportOutput } from '@/lib/projects/technical-report-output-router';

const root = resolve(__dirname, '..');
const read = (relative: string) => readFileSync(resolve(root, relative), 'utf8');
const migration067 = read('scripts/sql/067_project_classification_backfill_and_legacy_sync.sql');
const modal = read('components/projects/ProjectReportModal.tsx');
const printSource = read('components/projects/TechnicalReportPrint.tsx');

describe('all-project technical report classification coverage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('resolves explicit EXISTING classification from Basic Data', () => {
    expect(
      resolveStage4ProjectClassification({
        project_classification: 'EXISTING',
        project_status: null,
        primary_engineering_project_identity: null,
      })
    ).toMatchObject({ status: 'RESOLVED', classification: 'EXISTING' });
  });

  it('resolves explicit UNDER_CONSTRUCTION classification from Basic Data', () => {
    expect(
      resolveStage4ProjectClassification({
        project_classification: 'UNDER_CONSTRUCTION',
        project_status: null,
        primary_engineering_project_identity: null,
      })
    ).toMatchObject({ status: 'RESOLVED', classification: 'UNDER_CONSTRUCTION' });
  });

  it('resolves legacy existing project from unambiguous project_status', () => {
    expect(readBasicDataProjectClassification({ project_status: 'قائم - تحت المعاينة' })).toBe('EXISTING');
    expect(
      resolveStage4ProjectClassification({
        project_classification: null,
        project_status: 'قائم - تحت المعاينة',
        primary_engineering_project_identity: null,
      })
    ).toMatchObject({ status: 'RESOLVED', classification: 'EXISTING', sourceField: 'clients.project_status' });
  });

  it('resolves legacy under-construction project from unambiguous project_status', () => {
    expect(readBasicDataProjectClassification({ project_status: 'تحت الإنشاء' })).toBe('UNDER_CONSTRUCTION');
    expect(
      resolveStage4ProjectClassification({
        project_classification: null,
        project_status: 'تحت الإنشاء',
        primary_engineering_project_identity: null,
      })
    ).toMatchObject({
      status: 'RESOLVED',
      classification: 'UNDER_CONSTRUCTION',
      sourceField: 'clients.project_status',
    });
  });

  it('returns NEEDS_DATA for unresolved legacy project without guessing', () => {
    const gate = resolveStage4ProjectClassification({
      project_classification: null,
      project_status: 'طلب إصدار ترخيص جديدة',
      primary_engineering_project_identity: null,
    });
    expect(gate).toMatchObject({
      status: 'NEEDS_DATA',
      classification: null,
      sourceField: 'clients.project_classification',
      reason: 'CLASSIFICATION_REQUIRED',
    });
    expect(resolveTechnicalReportOutput(null)).toMatchObject({
      kind: 'BLOCKED',
      status: 'NEEDS_DATA',
      sourceField: 'clients.project_classification',
    });
  });

  it('prefers synced project identity over Basic Data when both exist', () => {
    expect(
      resolveStage4ProjectClassification({
        project_classification: 'EXISTING',
        project_status: 'تحت الإنشاء',
        primary_engineering_project_identity: {
          clientId: 'c1',
          projectId: 'p1',
          projectCode: 'PRJ-2026-000001',
          projectClassification: 'UNDER_CONSTRUCTION',
        },
      })
    ).toMatchObject({
      status: 'RESOLVED',
      classification: 'UNDER_CONSTRUCTION',
      sourceField: 'projects.project_classification',
    });
  });

  it('routes Stage 4 and PDF output by canonical classification only', () => {
    expect(resolveTechnicalReportOutput('EXISTING')).toMatchObject({ kind: 'EXISTING' });
    expect(resolveTechnicalReportOutput('UNDER_CONSTRUCTION')).toMatchObject({ kind: 'UNDER_CONSTRUCTION' });
    expect(printSource).toContain('resolveTechnicalReportOutput');
    expect(modal).toContain('resolveStage4ProjectClassification');
    expect(modal).toContain("projectClassification === 'EXISTING'");
    expect(modal).toContain("projectClassification === 'UNDER_CONSTRUCTION'");
  });

  it('syncs newly saved Basic Data classification into project identity path', async () => {
    rpcMock.mockResolvedValueOnce({
      data: [{
        project_id: 'project-1',
        client_id: 'client-1',
        project_code: 'PRJ-2026-000010',
        project_classification: 'EXISTING',
        synced: true,
      }],
      error: null,
    });

    await expect(syncProjectClassificationFromBasicData('client-1')).resolves.toEqual({
      projectClassification: 'EXISTING',
      synced: true,
      error: null,
    });
  });

  it('exposes one-shot backfill and unresolved count RPC bridges', async () => {
    rpcMock.mockResolvedValueOnce({
      data: [{
        total_candidates: 12,
        synced_count: 9,
        already_classified_count: 2,
        unresolved_count: 1,
      }],
      error: null,
    });
    rpcMock.mockResolvedValueOnce({ data: 1, error: null });

    await expect(backfillAllProjectClassificationsFromBasicData()).resolves.toEqual({
      totalCandidates: 12,
      syncedCount: 9,
      alreadyClassifiedCount: 2,
      unresolvedCount: 1,
      error: null,
    });
    await expect(countUnresolvedProjectClassifications()).resolves.toEqual({ count: 1, error: null });
    expect(rpcMock).toHaveBeenNthCalledWith(1, 'backfill_project_classifications_from_basic_data');
    expect(rpcMock).toHaveBeenNthCalledWith(2, 'count_unresolved_project_classifications');
  });

  it('defines legacy sync, backfill, and unresolved count in migration 067 without touching 065', () => {
    expect(migration067).toContain('resolve_basic_data_project_classification');
    expect(migration067).toContain('backfill_project_classifications_from_basic_data');
    expect(migration067).toContain('count_unresolved_project_classifications');
    expect(migration067).toContain("'قائم - تحت المعاينة'");
    expect(migration067).toContain("'تحت الإنشاء'");
    expect(migration067).not.toContain('065_pr_a1');
  });
});
