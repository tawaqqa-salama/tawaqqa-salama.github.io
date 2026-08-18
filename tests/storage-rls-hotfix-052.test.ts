import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const migrationPath = resolve(
  process.cwd(),
  'scripts/sql/052_fix_project_files_storage_rls.sql',
);
const sql = readFileSync(migrationPath, 'utf8');

describe('Migration 052 project-files Storage RLS hotfix', () => {
  it('is atomic and changes only the four affected Storage policies', () => {
    expect(sql).toMatch(/^\s*BEGIN;/m);
    expect(sql).toMatch(/COMMIT;\s*$/m);
    expect(sql).toMatch(/DROP POLICY IF EXISTS "project_files_tenant_select" ON storage\.objects;/);
    expect(sql).toMatch(/DROP POLICY IF EXISTS "project_files_tenant_insert" ON storage\.objects;/);
    expect(sql).toMatch(/DROP POLICY IF EXISTS "project_files_tenant_update" ON storage\.objects;/);
    expect(sql).toMatch(/DROP POLICY IF EXISTS "project_files_tenant_delete" ON storage\.objects;/);
    expect(sql).not.toMatch(/\b(?:DELETE|UPDATE|INSERT|TRUNCATE)\s+(?:FROM\s+)?storage\.objects\b/i);
    expect(sql).not.toMatch(/ALTER\s+(?:TABLE|BUCKET)|UPDATE\s+storage\.buckets/i);
    expect(sql).not.toMatch(/(?:ALTER|DROP|TRUNCATE)\s+(?:TABLE\s+)?public\.clients\b/i);
    expect(sql).not.toMatch(/(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+public\.clients\b/i);
    expect(sql).not.toMatch(/public\.users|chart_of_accounts|journal/i);
  });

  it('uses the outer Storage object path explicitly in every client-path predicate', () => {
    const clientPathPredicates = sql.match(/c\.id::text\s*=\s*\(storage\.foldername\(storage\.objects\.name\)\)\[1\]/g) ?? [];
    expect(clientPathPredicates).toHaveLength(5);
    expect(sql).not.toContain('storage.foldername(c.name)');
    expect(sql).not.toMatch(/storage\.foldername\(name\)/);
  });

  it('preserves authenticated tenant scope and denies broad bypasses', () => {
    expect(sql).toContain('TO authenticated');
    expect(sql).toContain("bucket_id = 'project-files'");
    expect(sql).toContain('public.current_app_company_id()');
    expect(sql).toContain('public.is_platform_admin()');
    expect(sql).not.toMatch(/USING\s*\(\s*true\s*\)/i);
    expect(sql).not.toMatch(/WITH CHECK\s*\(\s*true\s*\)/i);
    expect(sql).not.toMatch(/hardcoded|3580b47a|service_role/i);
  });

  it('supports company and client prefixes while binding clients to the current tenant', () => {
    expect(sql).toContain('(storage.foldername(storage.objects.name))[1] = public.current_app_company_id()::text');
    expect(sql).toContain('c.company_id = public.current_app_company_id()');
  });
});
