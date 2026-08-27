import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8');

describe('Supabase fresh branch baseline safety contract', () => {
  it('keeps the historical manifest explicit, ordered, and limited to 000–064', async () => {
    const policy = await import('../scripts/branch-baseline-policy.mjs');
    expect(policy.HISTORICAL_BASELINE_MANIFEST.at(-1)).toBe('064_project_classification_foundation.sql');
    expect(policy.HISTORICAL_BASELINE_MANIFEST).not.toContain('065_pr_a1_security_remediation.sql');
    expect(policy.HISTORICAL_BASELINE_MANIFEST.some((file: string) => /^202\d+_/.test(file))).toBe(false);
    expect(new Set(policy.HISTORICAL_BASELINE_MANIFEST).size).toBe(policy.HISTORICAL_BASELINE_MANIFEST.length);
  });

  it('refuses default, protected, and non-feature Git refs', async () => {
    const { assertSafeTarget } = await import('../scripts/branch-baseline-policy.mjs');
    const base = {
      allowApply: '1',
      databaseUrl: 'postgresql://postgres:secret@db.preview123.supabase.co:5432/postgres',
      projectRef: 'preview123',
    };
    expect(() => assertSafeTarget({ ...base, targetRef: 'main' })).toThrow(/protected Git ref/);
    expect(() => assertSafeTarget({ ...base, targetRef: 'develop' })).toThrow(/non-feature Git ref/);
    expect(() => assertSafeTarget({ ...base, targetRef: 'fix/branch', projectRef: 'ezmdkwgziyencejfevso' })).toThrow(/protected Supabase project ref/);
    expect(() => assertSafeTarget({ ...base, targetRef: 'fix/branch', projectRef: 'sgonaqeefshtdakmggvm' })).toThrow(/protected Supabase project ref/);
  });

  it('refuses execution unless the explicit apply and confirmation gates are present', async () => {
    const { assertSafeTarget } = await import('../scripts/branch-baseline-policy.mjs');
    const base = {
      targetRef: 'fix/branch',
      databaseUrl: 'postgresql://postgres:secret@db.preview123.supabase.co:5432/postgres',
      projectRef: 'preview123',
    };
    expect(() => assertSafeTarget({ ...base, allowApply: '0' })).toThrow(/BRANCH_BASELINE_APPLY/);
    const runner = read('scripts/bootstrap-fresh-supabase-branch.mjs');
    expect(runner).toContain('CREATE_FRESH_BRANCH_BASELINE');
  });

  it('refuses any existing business data and allows only absent or empty tables', async () => {
    const { assertNoBusinessData } = await import('../scripts/branch-baseline-policy.mjs');
    expect(() => assertNoBusinessData([{ table_name: 'clients', row_count: 1 }])).toThrow(/non-empty business database/);
    expect(() => assertNoBusinessData([{ table_name: 'clients', row_count: 0 }, { table_name: 'projects', row_count: '0' }])).not.toThrow();
  });

  it('does not edit Supabase migration history or execute PR-A1/Production migrations', () => {
    const runner = read('scripts/bootstrap-fresh-supabase-branch.mjs');
    const workflow = read('.github/workflows/supabase-branch-baseline.yml');
    expect(runner).not.toMatch(/supabase_migrations|migration repair/i);
    expect(runner).not.toContain('065_pr_a1_security_remediation.sql');
    expect(runner).not.toMatch(/20260811_add_client_company_ownership/);
    expect(workflow).toContain('workflow_dispatch:');
    expect(workflow).not.toContain('pull_request:');
    expect(workflow).toContain('SUPABASE_BRANCH_DATABASE_URL');
    expect(workflow).toContain("github.ref != 'refs/heads/main'");
  });
});
