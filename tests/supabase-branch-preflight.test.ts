import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8');
const VALIDATION_REF = 'njuekzqxdhxpucelvlgu';
const VALIDATION_DB_URL = `postgresql://postgres:secret@db.${VALIDATION_REF}.supabase.co:5432/postgres`;
const SESSION_POOLER_HOST = 'aws-0-ap-northeast-2.pooler.supabase.com';
const SESSION_POOLER_URL = `postgresql://postgres.${VALIDATION_REF}:secret@${SESSION_POOLER_HOST}:5432/postgres`;

function createMockClient(rowsByQuery: Array<{ rows: Record<string, unknown>[] }>) {
  let callIndex = 0;
  return {
    connect: vi.fn(async () => {}),
    end: vi.fn(async () => {}),
    query: vi.fn(async () => rowsByQuery[callIndex++] ?? { rows: [] }),
  };
}

describe('Supabase branch preflight-only safety contract', () => {
  it('defaults workflow dispatch mode to preflight-only', () => {
    const workflow = read('.github/workflows/supabase-branch-baseline.yml');
    expect(workflow).toContain("default: 'preflight-only'");
    expect(workflow).toContain('- preflight-only');
    expect(workflow).toContain('- apply-baseline');
    expect(workflow).toContain("inputs.mode == 'preflight-only'");
    expect(workflow).toContain("inputs.mode == 'apply-baseline'");
  });

  it('uses supabase-preview environment and required secrets for preflight-only', () => {
    const workflow = read('.github/workflows/supabase-branch-baseline.yml');
    const preflightBlock = workflow.split('preflight:')[1]?.split('baseline:')[0] ?? '';
    expect(preflightBlock).toContain('name: supabase-preview');
    expect(preflightBlock).toContain('SUPABASE_PROJECT_ID:');
    expect(preflightBlock).toContain('SUPABASE_BRANCH_DATABASE_URL:');
    expect(preflightBlock).toContain('SUPABASE_DB_PASSWORD:');
    expect(preflightBlock).toContain('SUPABASE_ACCESS_TOKEN:');
    expect(preflightBlock).toContain('BRANCH_BASELINE_PREFLIGHT:');
    expect(preflightBlock).not.toContain('BRANCH_BASELINE_APPLY:');
    expect(preflightBlock).not.toContain('SUPABASE_STORAGE_ADMIN_APPLY:');
    expect(preflightBlock).not.toContain('raise-design-knowledge-upload-limit.mjs');
    expect(preflightBlock).not.toContain('bootstrap-fresh-supabase-branch.mjs');
  });

  it('requires BRANCH_BASELINE_PREFLIGHT=1 and reuses target identity guards', async () => {
    const { assertSafePreflightTarget } = await import('../scripts/branch-baseline-policy.mjs');
    const base = {
      allowPreflight: '1',
      databaseUrl: VALIDATION_DB_URL,
      projectRef: VALIDATION_REF,
      targetRef: 'fix/branch',
    };
    expect(() => assertSafePreflightTarget({ ...base, allowPreflight: '0' })).toThrow(/BRANCH_BASELINE_PREFLIGHT/);
    expect(() => assertSafePreflightTarget({ ...base, projectRef: 'ezmdkwgziyencejfevso', databaseUrl: 'postgresql://postgres:secret@db.ezmdkwgziyencejfevso.supabase.co:5432/postgres' })).toThrow(/protected Supabase project ref/);
    expect(() => assertSafePreflightTarget({ ...base, projectRef: 'sgonaqeefshtdakmggvm', databaseUrl: 'postgresql://postgres:secret@db.sgonaqeefshtdakmggvm.supabase.co:5432/postgres' })).toThrow(/protected Supabase project ref/);
    expect(() => assertSafePreflightTarget({ ...base, projectRef: 'other-preview', databaseUrl: 'postgresql://postgres:secret@db.other-preview.supabase.co:5432/postgres' })).toThrow(/non-validation Supabase project ref/);
    expect(() => assertSafePreflightTarget({ ...base, databaseUrl: SESSION_POOLER_URL })).not.toThrow();
  });

  it('opens the database connection and executes only read-only SQL', async () => {
    const { runPreflight, PREFLIGHT_READ_ONLY_QUERIES } = await import('../scripts/preflight-supabase-branch.mjs');
    const client = createMockClient([
      { rows: [{ current_database: 'postgres' }] },
      { rows: [{ current_user: 'postgres' }] },
      { rows: [{ session_user: 'postgres' }] },
      { rows: [{ public_table_count: 0 }] },
      { rows: [{ schema_exists: false }] },
      { rows: [] },
    ]);
    const report = await runPreflight({
      NODE_ENV: 'test',
      SUPABASE_PROJECT_ID: VALIDATION_REF,
      SUPABASE_BRANCH_DATABASE_URL: VALIDATION_DB_URL,
      SUPABASE_DB_PASSWORD: 'secret',
      SUPABASE_ACCESS_TOKEN: 'token',
      GITHUB_REF_NAME: 'fix/branch',
      BRANCH_BASELINE_PREFLIGHT: '1',
    }, { ClientImpl: vi.fn(() => client) });

    expect(report.publicTableCount).toBe(0);
    expect(report.migrationHistory).toEqual([]);
    expect(client.connect).toHaveBeenCalledTimes(1);
    for (const query of PREFLIGHT_READ_ONLY_QUERIES) {
      expect(client.query).toHaveBeenCalledWith(expect.stringContaining(query.split('\n')[0].trim()));
    }
    const executedSql = (client.query.mock.calls as unknown[][]).map((call) => String(call[0])).join('\n');
    expect(executedSql).not.toMatch(/\b(?:insert|update|delete|create|alter|drop|grant|revoke)\b/i);
  });

  it('rejects non-empty public schema during preflight', async () => {
    const { runPreflight } = await import('../scripts/preflight-supabase-branch.mjs');
    const client = createMockClient([
      { rows: [{ current_database: 'postgres' }] },
      { rows: [{ current_user: 'postgres' }] },
      { rows: [{ session_user: 'postgres' }] },
      { rows: [{ public_table_count: 1 }] },
      { rows: [{ schema_exists: false }] },
      { rows: [{ table_name: 'clients' }] },
    ]);
    await expect(runPreflight({
      NODE_ENV: 'test',
      SUPABASE_PROJECT_ID: VALIDATION_REF,
      SUPABASE_BRANCH_DATABASE_URL: VALIDATION_DB_URL,
      SUPABASE_DB_PASSWORD: 'secret',
      SUPABASE_ACCESS_TOKEN: 'token',
      GITHUB_REF_NAME: 'fix/branch',
      BRANCH_BASELINE_PREFLIGHT: '1',
    }, { ClientImpl: vi.fn(() => client) })).rejects.toThrow(/unexpected public tables/);
  });

  it('does not invoke storage administration, baseline runner, or migrations', () => {
    const preflight = read('scripts/preflight-supabase-branch.mjs');
    const workflow = read('.github/workflows/supabase-branch-baseline.yml');
    const preflightBlock = workflow.split('preflight:')[1]?.split('baseline:')[0] ?? '';
    expect(preflight).not.toContain('raise-design-knowledge-upload-limit');
    expect(preflight).not.toContain('bootstrap-fresh-supabase-branch');
    expect(preflight).not.toContain('createBucket');
    expect(preflight).not.toContain('updateBucket');
    expect(preflight).not.toContain('api.supabase.com');
    expect(preflight).not.toMatch(/\b065\b/);
    expect(preflightBlock).not.toContain('scripts/sql/');
  });

  it('keeps apply-baseline protected by explicit confirmation and write gates', () => {
    const workflow = read('.github/workflows/supabase-branch-baseline.yml');
    const baselineBlock = workflow.split('baseline:')[1] ?? '';
    expect(baselineBlock).toContain('BRANCH_BASELINE_APPLY:');
    expect(baselineBlock).toContain('CREATE_FRESH_BRANCH_BASELINE');
    expect(baselineBlock).toContain('SUPABASE_STORAGE_ADMIN_APPLY:');
    expect(baselineBlock).toContain('CONFIGURE_DESIGN_KNOWLEDGE_STORAGE');
    expect(baselineBlock).toContain('raise-design-knowledge-upload-limit.mjs');
    expect(baselineBlock).toContain('bootstrap-fresh-supabase-branch.mjs');
  });

  it('never logs secrets, full DATABASE_URL, password, or token values', () => {
    const preflight = read('scripts/preflight-supabase-branch.mjs');
    expect(preflight).not.toMatch(/console\.(?:log|error)\([^)]*(PASSWORD|DATABASE_URL|TOKEN|SECRET|accessToken|dbPassword)/i);
    expect(preflight).not.toContain('SUPABASE_BRANCH_DATABASE_URL`');
  });

  it('reads migration history in a read-only way', async () => {
    const { readMigrationHistoryReadOnly } = await import('../scripts/preflight-supabase-branch.mjs');
    const client = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes('information_schema.schemata')) return { rows: [{ schema_exists: true }] };
        if (sql.includes("table_name = 'schema_migrations'")) return { rows: [{ table_exists: true }] };
        if (sql.includes('supabase_migrations.schema_migrations')) return { rows: [{ version: '20240101000000' }] };
        return { rows: [] };
      }),
    };
    const history = await readMigrationHistoryReadOnly(client as never);
    expect(history).toEqual(['20240101000000']);
    const executedSql = (client.query.mock.calls as unknown[][]).map((call) => String(call[0])).join('\n');
    expect(executedSql).not.toMatch(/\b(?:insert|update|delete|create|alter|drop)\b/i);
  });
});
