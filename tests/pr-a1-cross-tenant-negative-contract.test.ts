import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(__dirname, '..');
const read = (relative: string) => readFileSync(resolve(root, relative), 'utf8');
const storagePolicy = read('scripts/sql/052_fix_project_files_storage_rls.sql');
const remediation = read('scripts/sql/065_pr_a1_security_remediation.sql');
const broker = read('supabase/functions/project-correspondence-attachment-broker/index.ts');
const liveScript = read('scripts/live-rls-jwt-security-tests.mjs');

describe('PR-A1 cross-tenant negative-test contract', () => {
  it('keeps both company-prefix and client-prefix tenant checks in the project-files policy', () => {
    for (const operation of ['select', 'insert', 'update', 'delete']) {
      const lower = storagePolicy.toLowerCase();
      expect(lower).toContain(`project_files_tenant_${operation}`);
    }
    expect(storagePolicy).toContain('storage.foldername(storage.objects.name)');
    expect(storagePolicy).toContain('FROM public.clients AS c');
    expect(storagePolicy).toContain('c.company_id = public.current_app_company_id()');
    expect(storagePolicy).toContain("bucket_id = 'project-files'");
  });

  it('uses server-resolved attachment ownership and never accepts tenant/path authority from the caller', () => {
    expect(broker).toContain(".from('clients')");
    expect(broker).toContain(".from('project_correspondences')");
    expect(broker).toContain("attachment.storage_bucket !== 'project-files'");
    for (const forbidden of ['x-company-id', 'x-project-id', 'x-client-id', 'x-correspondence-id', 'x-storage-path']) {
      expect(broker).not.toContain(forbidden);
    }
  });

  it('keeps PR-A1 itself write-free and does not invoke live tenant tests', () => {
    expect(remediation).not.toContain('INSERT INTO');
    expect(remediation).not.toContain('UPDATE storage.objects');
    expect(remediation).not.toContain('DELETE FROM storage.objects');
    expect(remediation).not.toContain('CREATE TABLE public.technical_report');
    expect(liveScript).toContain('LIVE_RLS_BASE_URL');
    expect(liveScript).toContain('No Production data deleted');
  });
});
