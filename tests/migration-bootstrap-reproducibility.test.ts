import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8');

describe('migration bootstrap reproducibility contract', () => {
  it('uses UUID-compatible project identity for the canonical client relation', () => {
    const migration = read('scripts/sql/003_project_hierarchy.sql');
    expect(migration).toContain('\n  client_id uuid,\n  project_code text NOT NULL,');
    expect(migration).not.toContain('\n  client_id text,\n  project_code text NOT NULL,');
  });

  it('never creates a company_id policy for zatca_retry_queue', () => {
    const migration = read('scripts/sql/042_role_level_rls.sql');
    expect(migration).toContain('IF t = \'zatca_retry_queue\' THEN');
    expect(migration).toContain("REVOKE ALL ON public.%I FROM authenticated");
    expect(migration).toContain('has_company_id boolean');
    const queueBranch = migration.match(/IF t = 'zatca_retry_queue' THEN([\s\S]*?)END IF;/)?.[1] ?? '';
    expect(queueBranch).not.toContain('CREATE POLICY');
  });

  it('makes the duplicate 045 policy names safe to rerun', () => {
    const migration = read('scripts/sql/045_nfpa_code_knowledge_pipeline.sql');
    for (const suffix of ['tenant_select', 'tenant_insert', 'tenant_update', 'tenant_delete']) {
      expect(migration).toContain(`t || '_${suffix}'`);
      expect(migration).toContain(`DROP POLICY IF EXISTS %I ON public.%I', t || '_${suffix}'`);
    }
  });

  it('keeps Supabase compatibility setup outside the production SQL manifest', () => {
    const compatibility = read('scripts/local-supabase-compatibility-bootstrap.sql');
    const runner = read('scripts/apply-full-dds-schema-local.mjs');
    expect(compatibility).toContain('LOCAL TEST ONLY');
    expect(compatibility).toContain('CREATE SCHEMA IF NOT EXISTS auth');
    expect(compatibility).toContain('CREATE SCHEMA IF NOT EXISTS storage');
    expect(runner).toContain("process.env.LOCAL_DDS_REBUILD !== '1'");
    expect(runner).toContain("['localhost', '127.0.0.1', '::1']");
    expect(runner).not.toContain('scripts/local-supabase-compatibility-bootstrap.sql\',\n  \'000_extensions.sql');
  });

  it('uses an explicit deterministic manifest through migration 066', () => {
    const runner = read('scripts/apply-full-dds-schema-local.mjs');
    for (const file of [
      '000_extensions.sql',
      '033_multi_tenant_saas.sql',
      '042_role_level_rls.sql',
      '045_design_intelligence_tenant_rls.sql',
      '045_nfpa_code_knowledge_pipeline.sql',
      '046_nfpa_code_knowledge_pipeline_repair.sql',
      '056_stage6b_project_correspondences_schema.sql',
      '064_project_classification_foundation.sql',
      '065_pr_a1_security_remediation.sql',
      '066_basic_data_project_classification_sync.sql',
    ]) {
      expect(runner).toContain(`'${file}'`);
    }
  });
});
