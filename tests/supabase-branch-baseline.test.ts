import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8');
const VALIDATION_REF = 'jxbzuezrymhxwvdejohw';
const VALIDATION_DB_URL = `postgresql://postgres:secret@db.${VALIDATION_REF}.supabase.co:5432/postgres`;

describe('Supabase fresh branch baseline safety contract', () => {
  it('keeps the historical manifest explicit, ordered, and limited to 000–064', async () => {
    const policy = await import('../scripts/branch-baseline-policy.mjs');
    expect(policy.VALIDATION_SUPABASE_REF).toBe(VALIDATION_REF);
    expect(policy.HISTORICAL_BASELINE_MANIFEST.at(-1)).toBe('064_project_classification_foundation.sql');
    expect(policy.HISTORICAL_BASELINE_MANIFEST).not.toContain('065_pr_a1_security_remediation.sql');
    expect(policy.HISTORICAL_BASELINE_MANIFEST.some((file: string) => /^202\d+_/.test(file))).toBe(false);
    expect(new Set(policy.HISTORICAL_BASELINE_MANIFEST).size).toBe(policy.HISTORICAL_BASELINE_MANIFEST.length);
  });

  it('pins the database project and rejects protected refs explicitly', async () => {
    const { assertSafeTarget } = await import('../scripts/branch-baseline-policy.mjs');
    const base = {
      allowApply: '1',
      databaseUrl: VALIDATION_DB_URL,
      projectRef: VALIDATION_REF,
      targetRef: 'fix/branch',
    };
    expect(() => assertSafeTarget({ ...base, projectRef: 'ezmdkwgziyencejfevso', databaseUrl: 'postgresql://postgres:secret@db.ezmdkwgziyencejfevso.supabase.co:5432/postgres' })).toThrow(/protected Supabase project ref/);
    expect(() => assertSafeTarget({ ...base, projectRef: 'sgonaqeefshtdakmggvm', databaseUrl: 'postgresql://postgres:secret@db.sgonaqeefshtdakmggvm.supabase.co:5432/postgres' })).toThrow(/protected Supabase project ref/);
    expect(() => assertSafeTarget({ ...base, projectRef: 'other-preview', databaseUrl: 'postgresql://postgres:secret@db.other-preview.supabase.co:5432/postgres' })).toThrow(/non-validation Supabase project ref/);
    expect(() => assertSafeTarget({ ...base, databaseUrl: 'postgresql://postgres:secret@db.other-preview.supabase.co:5432/postgres' })).toThrow(/does not match validation/);
  });

  it('refuses default, protected, and non-feature Git refs', async () => {
    const { assertSafeTarget } = await import('../scripts/branch-baseline-policy.mjs');
    const base = { allowApply: '1', databaseUrl: VALIDATION_DB_URL, projectRef: VALIDATION_REF };
    expect(() => assertSafeTarget({ ...base, targetRef: 'main' })).toThrow(/protected Git ref/);
    expect(() => assertSafeTarget({ ...base, targetRef: 'develop' })).toThrow(/non-feature Git ref/);
  });

  it('refuses execution unless explicit apply and confirmation gates are present', async () => {
    const { assertSafeTarget } = await import('../scripts/branch-baseline-policy.mjs');
    const base = { targetRef: 'fix/branch', databaseUrl: VALIDATION_DB_URL, projectRef: VALIDATION_REF };
    expect(() => assertSafeTarget({ ...base, allowApply: '0' })).toThrow(/BRANCH_BASELINE_APPLY/);
    const runner = read('scripts/bootstrap-fresh-supabase-branch.mjs');
    expect(runner).toContain('CREATE_FRESH_BRANCH_BASELINE');
    expect(runner).toContain('assertNoUnexpectedPublicTables');
  });

  it('refuses unexpected public tables and existing business data', async () => {
    const { assertNoBusinessData, assertNoUnexpectedPublicTables } = await import('../scripts/branch-baseline-policy.mjs');
    expect(() => assertNoUnexpectedPublicTables(['clients'])).toThrow(/unexpected public tables/);
    expect(() => assertNoUnexpectedPublicTables([])).not.toThrow();
    expect(() => assertNoBusinessData([{ table_name: 'clients', row_count: 1 }])).toThrow(/non-empty business database/);
    expect(() => assertNoBusinessData([{ table_name: 'clients', row_count: 0 }, { table_name: 'projects', row_count: '0' }])).not.toThrow();
  });

  it('keeps PR validation secret-free and excludes Production/065 execution', () => {
    const runner = read('scripts/bootstrap-fresh-supabase-branch.mjs');
    const workflow = read('.github/workflows/supabase-branch-baseline.yml');
    expect(runner).not.toMatch(/console\.log\([^)]*(PASSWORD|DATABASE_URL|TOKEN|SECRET)/i);
    expect(runner).not.toMatch(/supabase_migrations|migration repair/i);
    expect(runner).not.toContain('065_pr_a1_security_remediation.sql');
    expect(runner).not.toMatch(/20260811_add_client_company_ownership/);
    expect(workflow).toContain('pull_request:');
    expect(workflow).toContain('Baseline contract (no secrets)');
    expect(workflow).toContain('workflow_dispatch:');
    expect(workflow).toContain('SUPABASE_PROJECT_ID');
    expect(workflow).toContain('SUPABASE_ACCESS_TOKEN');
    expect(workflow).toContain('SUPABASE_DB_PASSWORD');
    expect(workflow).toContain('SUPABASE_BRANCH_DATABASE_URL');
    expect(workflow).toContain('environment:');
    expect(workflow).toContain('github.ref != \'refs/heads/main\'');
  });
});
