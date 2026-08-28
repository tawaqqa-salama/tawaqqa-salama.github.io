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
  PROJECT_CLASSIFICATIONS,
  isProjectClassification,
  normalizeProjectClassification,
} from '@/lib/projects/project-classification';
import { createOrResolveClassifiedEngineeringProject } from '@/lib/projects/classified-engineering-project-identity';
import { validateClientForm } from '@/lib/validation/client';

const root = resolve(__dirname, '..');
const read = (relative: string) => readFileSync(resolve(root, relative), 'utf8');
const migration = read('scripts/sql/064_project_classification_foundation.sql');
const salesPage = read('app/sales/page.tsx');
const salesModal = read('components/clients/AddClientModal.tsx');
const projectReader = read('lib/projects/primary-engineering-project-identity.ts');

const validSalesDraft = {
  owner_name: 'مالك المشروع',
  phone: '0512345678',
  region: 'الرياض',
  city: 'الرياض',
  district: 'الملز',
  street: 'شارع الاختبار',
  plot_number: '',
  national_address: '',
  business_name: 'منشأة الاختبار',
  activity_type: '',
  land_area: '200',
  building_area: '100',
  floors_count: '1',
  project_status: 'جديد',
  project_classification: 'EXISTING' as const,
  floor_levels: [],
};

function rpcRow(classification: 'EXISTING' | 'UNDER_CONSTRUCTION') {
  return {
    data: [{
      project_id: 'project-1',
      client_id: 'client-1',
      project_code: 'PRJ-2026-000001',
      project_classification: classification,
    }],
    error: null,
  };
}

describe('PROJECT CLASSIFICATION foundation contract', () => {
  beforeEach(() => vi.clearAllMocks());

  it('accepts exactly the two approved canonical classifications and leaves legacy values null', () => {
    expect(PROJECT_CLASSIFICATIONS).toEqual(['EXISTING', 'UNDER_CONSTRUCTION']);
    expect(isProjectClassification('EXISTING')).toBe(true);
    expect(isProjectClassification('UNDER_CONSTRUCTION')).toBe(true);
    expect(isProjectClassification('UNCLASSIFIED')).toBe(false);
    expect(normalizeProjectClassification(null)).toBeNull();
    expect(normalizeProjectClassification('تحت الإنشاء')).toBeNull();
  });

  it('rejects a missing or invalid classification in the Sales draft before write', () => {
    expect(validateClientForm({ ...validSalesDraft, project_classification: '' })).toBe(
      'اختر تصنيف المشروع الهندسي: موقع قائم أو مشروع قيد الإنشاء.'
    );
    expect(validateClientForm({ ...validSalesDraft, project_classification: 'INVALID' as never })).toBe(
      'اختر تصنيف المشروع الهندسي: موقع قائم أو مشروع قيد الإنشاء.'
    );
    expect(validateClientForm({ ...validSalesDraft, project_classification: 'EXISTING' })).toBeNull();
    expect(validateClientForm({ ...validSalesDraft, project_classification: 'UNDER_CONSTRUCTION' })).toBeNull();
  });

  it.each(['EXISTING', 'UNDER_CONSTRUCTION'] as const)(
    'passes %s only through the classified server resolver',
    async (projectClassification) => {
      rpcMock.mockResolvedValueOnce(rpcRow(projectClassification));

      await expect(createOrResolveClassifiedEngineeringProject({
        clientId: 'client-1',
        projectClassification,
      })).resolves.toEqual({
        identity: {
          clientId: 'client-1',
          projectId: 'project-1',
          projectCode: 'PRJ-2026-000001',
          projectClassification,
        },
        error: null,
      });

      expect(rpcMock).toHaveBeenCalledWith(
        'create_or_resolve_classified_engineering_project_for_client',
        {
          p_client_id: 'client-1',
          p_project_classification: projectClassification,
        }
      );
    }
  );

  it('fails closed when the resolver response does not match the requested client or canonical enum', async () => {
    rpcMock.mockResolvedValueOnce({
      data: [{
        project_id: 'project-1',
        client_id: 'other-client',
        project_code: 'PRJ-2026-000001',
        project_classification: 'EXISTING',
      }],
      error: null,
    });

    await expect(createOrResolveClassifiedEngineeringProject({
      clientId: 'client-1',
      projectClassification: 'EXISTING',
    })).resolves.toEqual({ identity: null, error: 'PROJECT_CLASSIFICATION_RESOLUTION_INVALID' });
  });

  it('rejects an invalid browser value before an RPC can be called', async () => {
    await expect(createOrResolveClassifiedEngineeringProject({
      clientId: 'client-1',
      projectClassification: 'INVALID' as never,
    })).resolves.toEqual({ identity: null, error: 'PROJECT_CLASSIFICATION_INVALID' });
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('adds a nullable projects classification with only the approved values and no automatic backfill', () => {
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS project_classification text NULL');
    expect(migration).toContain("project_classification IN ('EXISTING', 'UNDER_CONSTRUCTION')");
    expect(migration).toContain('NULL is legacy unclassified');
    expect(migration).not.toMatch(/UPDATE\s+public\.projects\s+SET\s+project_classification/i);
    expect(migration).not.toContain('client.project_status');
    expect(migration).not.toContain('technical_report.building_status');
    expect(migration).not.toContain('fire_protection_design.lifecycle_mode');
  });

  it('uses a tenant-scoped SECURITY DEFINER resolver that creates the project with classification server-side only', () => {
    const start = migration.indexOf('CREATE OR REPLACE FUNCTION public.create_or_resolve_classified_engineering_project_for_client(');
    const resolver = migration.slice(start);
    expect(start).toBeGreaterThan(-1);
    expect(resolver).toContain('SECURITY DEFINER');
    expect(resolver).toContain('SET search_path = pg_catalog, public');
    expect(resolver).toContain("p_project_classification NOT IN ('EXISTING', 'UNDER_CONSTRUCTION')");
    expect(resolver).toContain("'PROJECT_CLASSIFICATION_INVALID'");
    expect(resolver).toContain('public.current_app_company_id()');
    expect(resolver).toContain('pg_advisory_xact_lock(hashtext(p_client_id::text))');
    expect(resolver).toContain('project_classification');
    expect(resolver).toContain('PROJECT_CLASSIFICATION_LEGACY_UNCLASSIFIED');
    expect(resolver).toContain('PROJECT_CLASSIFICATION_IMMUTABLE');
    expect(resolver).not.toContain('p_project_id');
    expect(resolver).not.toContain('p_project_code');
    expect(resolver).not.toMatch(/SELECT\s+MAX\s*\(/i);
    expect(migration).toContain('REVOKE ALL ON FUNCTION public.create_or_resolve_classified_engineering_project_for_client(uuid, text) FROM anon;');
    expect(migration).toContain('GRANT EXECUTE ON FUNCTION public.create_or_resolve_classified_engineering_project_for_client(uuid, text) TO authenticated;');
  });

  it('requires explicit Sales selection and creates classification after client creation without direct projects mutation', () => {
    expect(salesModal).toContain('تصنيف المشروع الهندسي');
    expect(salesModal).toContain('اختر تصنيف المشروع الهندسي...');
    expect(salesModal).toContain("project_classification: ''");
    expect(salesModal).toContain('projectClassificationLabel(classification)');
    expect(salesPage).toContain('createOrResolveClassifiedEngineeringProject');
    expect(salesPage).toContain('projectClassification,');
    expect(salesPage).toContain("if (!isProjectClassification(formData.project_classification))");
    expect(salesPage).not.toMatch(/from\(['"]projects['"]\)\.(insert|update)/);
    expect(salesPage.indexOf('insertClientSafe')).toBeLessThan(
      salesPage.indexOf('createOrResolveClassifiedEngineeringProject({')
    );
    expect(salesPage).toContain('لم تكتمل عملية إنشاء المشروع؛ لا تعِد إنشاء العميل');
    expect(salesPage).not.toContain('project_classification: formData.project_classification,\n      pipeline_stage');
  });

  it('keeps ProjectContext read-only and syncs legacy NULL projects only through explicit Basic Data RPC', () => {
    expect(projectReader).toContain(".select('id, client_id, project_code, project_classification')");
    expect(projectReader).toContain('normalizeProjectClassification(project.project_classification)');
    expect(projectReader).toContain('syncProjectClassificationFromBasicData');
    expect(projectReader).not.toContain('project_status');
    expect(projectReader).not.toContain('building_status');
    expect(projectReader).not.toContain('lifecycle_mode');
    expect(projectReader).not.toContain(".from('projects').update");
  });
});
