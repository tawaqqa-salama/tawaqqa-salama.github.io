import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'scripts/sql/051_platform_audit_tenant_hardening.sql'),
  'utf8'
);

describe('platform audit tenant hardening migration', () => {
  it('is atomic, idempotent, and leaves data rows and stored objects intact', () => {
    expect(migration).toMatch(/^BEGIN;/m);
    expect(migration).toMatch(/COMMIT;/);
    expect(migration).toMatch(/DROP POLICY IF EXISTS clients_select_own_company/);
    expect(migration).toMatch(/DROP POLICY IF EXISTS "project_files_tenant_select"/);
    expect(migration).not.toMatch(/\bDELETE\s+FROM\s+(public\.)?(clients|users)/i);
    expect(migration).not.toMatch(/\bDROP\s+TABLE/i);
    expect(migration).not.toMatch(/\bDELETE\s+FROM\s+storage\.objects/i);
  });

  it('enforces one canonical clients policy using the active, non-deleted tenant resolver', () => {
    expect(migration).toMatch(/CREATE POLICY clients_tenant_isolation[\s\S]*FOR ALL[\s\S]*TO authenticated/);
    expect(migration).toMatch(/company_id = public\.current_app_company_id\(\)/);
    expect(migration).toMatch(/public\.is_platform_admin\(\)/);
    expect(migration).toMatch(/DROP POLICY IF EXISTS clients_(select|insert|update|delete)_own_company/);
  });

  it('matches both supported project-files path shapes while denying arbitrary tenant paths', () => {
    expect(migration).toMatch(/\(storage\.foldername\(name\)\)\[1\] = public\.current_app_company_id\(\)::text/);
    expect(migration).toMatch(/c\.id::text = \(storage\.foldername\(name\)\)\[1\]/);
    expect(migration).toMatch(/c\.company_id = public\.current_app_company_id\(\)/);
    expect(migration).not.toContain('storage.foldername(c.name)');
    expect(migration).toMatch(/ON storage\.objects FOR SELECT/);
    expect(migration).toMatch(/ON storage\.objects FOR INSERT/);
    expect(migration).toMatch(/ON storage\.objects FOR UPDATE/);
    expect(migration).toMatch(/ON storage\.objects FOR DELETE/);
  });
});
