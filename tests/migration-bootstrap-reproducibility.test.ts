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
});
