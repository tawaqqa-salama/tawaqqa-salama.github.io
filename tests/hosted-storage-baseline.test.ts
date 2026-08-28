import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8');
const validationRef = 'njuekzqxdhxpucelvlgu';

function assertNoManagedBucketDml(sql: string) {
  expect(sql).not.toMatch(/\b(?:insert\s+into|update|delete\s+from|alter\s+table)\s+storage\.buckets\b/i);
  expect(sql).not.toMatch(/comment\s+on\s+column\s+storage\.buckets\b/i);
}

function storageClient({ exists }: { exists: boolean }) {
  const state = {
    exists,
    bucket: exists
      ? { id: 'design-knowledge', name: 'design-knowledge', public: false, file_size_limit: 1_073_741_824 }
      : null,
  };
  const createBucket = vi.fn(async (id: string, options: Record<string, unknown>) => {
    state.exists = true;
    state.bucket = {
      id,
      name: id,
      public: options.public as boolean,
      file_size_limit: options.fileSizeLimit as number,
    };
    return { data: { name: id }, error: null };
  });
  const updateBucket = vi.fn(async (id: string, options: Record<string, unknown>) => {
    state.bucket = {
      id,
      name: id,
      public: options.public as boolean,
      file_size_limit: options.fileSizeLimit as number,
    };
    return { data: { message: 'Successfully updated' }, error: null };
  });
  return {
    client: {
      storage: {
        listBuckets: vi.fn(async () => ({ data: state.exists ? [state.bucket] : [], error: null })),
        createBucket,
        updateBucket,
        getBucket: vi.fn(async () => ({ data: state.bucket, error: null })),
      },
    },
    createBucket,
    updateBucket,
  };
}

describe('Hosted Supabase Storage baseline contract', () => {
  it('keeps 047/048 free of direct DML and ownership changes on storage.buckets', () => {
    const m047 = read('scripts/sql/047_design_knowledge_storage_bucket.sql');
    const m048 = read('scripts/sql/048_design_knowledge_large_upload.sql');
    assertNoManagedBucketDml(m047);
    assertNoManagedBucketDml(m048);
    expect(`${m047}\n${m048}`).not.toMatch(/alter\s+(?:table\s+)?storage\.buckets\s+owner/i);
    expect(m048).toContain('NEEDS CONFIGURATION');
    expect(m048).toContain('1073741824');
  });

  it('preserves authenticated tenant policies on storage.objects', () => {
    const m047 = read('scripts/sql/047_design_knowledge_storage_bucket.sql');
    for (const operation of ['select', 'insert', 'update', 'delete']) {
      expect(m047).toContain(`design_knowledge_tenant_${operation}`);
    }
    expect(m047).toContain('ON storage.objects');
    expect(m047).toContain('TO authenticated');
    expect(m047).toContain('current_app_company_id()');
    expect(m047).toContain('is_platform_admin()');
    expect(m047).not.toMatch(/TO\s+anon/i);
  });

  it('uses the supported Storage API idempotently for a private 1 GiB bucket', async () => {
    const {
      DESIGN_KNOWLEDGE_FILE_SIZE_LIMIT,
      ensureDesignKnowledgeBucket,
    } = await import('../scripts/raise-design-knowledge-upload-limit.mjs');

    const missing = storageClient({ exists: false });
    const created = await ensureDesignKnowledgeBucket(missing.client);
    expect(created.created).toBe(true);
    expect(missing.createBucket).toHaveBeenCalledWith('design-knowledge', expect.objectContaining({
      public: false,
      fileSizeLimit: DESIGN_KNOWLEDGE_FILE_SIZE_LIMIT,
    }));

    const existing = storageClient({ exists: true });
    const updated = await ensureDesignKnowledgeBucket(existing.client);
    expect(updated.created).toBe(false);
    expect(existing.updateBucket).toHaveBeenCalledWith('design-knowledge', expect.objectContaining({
      public: false,
      fileSizeLimit: 1_073_741_824,
    }));
  });

  it('reports NEEDS CONFIGURATION before bucket mutation when the global limit is below 1 GiB', async () => {
    const { runStorageAdmin } = await import('../scripts/raise-design-knowledge-upload-limit.mjs');
    const createClientImpl = vi.fn();
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ fileSizeLimit: 50 * 1024 * 1024 }),
    }));
    await expect(runStorageAdmin({
      NODE_ENV: 'test',
      SUPABASE_PROJECT_ID: validationRef,
      SUPABASE_ACCESS_TOKEN: 'test-management-token',
      GITHUB_REF_NAME: 'fix/supabase-branch-baseline',
      SUPABASE_STORAGE_ADMIN_APPLY: '1',
      SUPABASE_STORAGE_ADMIN_CONFIRM: 'CONFIGURE_DESIGN_KNOWLEDGE_STORAGE',
    }, { fetchImpl, createClientImpl })).rejects.toThrow(/NEEDS CONFIGURATION.*Global Storage/i);
    expect(createClientImpl).not.toHaveBeenCalled();
  });

  it('rejects Production, diagnostic Staging, and missing validation targets', async () => {
    const { assertStorageAdminTarget } = await import('../scripts/raise-design-knowledge-upload-limit.mjs');
    const base = {
      targetRef: 'fix/supabase-branch-baseline',
      accessToken: 'test-management-token',
      allowApply: '1',
      confirmation: 'CONFIGURE_DESIGN_KNOWLEDGE_STORAGE',
    };
    expect(() => assertStorageAdminTarget({ ...base, projectRef: 'ezmdkwgziyencejfevso' })).toThrow(/protected/);
    expect(() => assertStorageAdminTarget({ ...base, projectRef: 'sgonaqeefshtdakmggvm' })).toThrow(/protected/);
    expect(() => assertStorageAdminTarget({ ...base, projectRef: '' })).toThrow(/non-validation/);
  });

  it('makes local compatibility reject migration DML on the managed bucket', () => {
    const local = read('scripts/local-supabase-compatibility-bootstrap.sql');
    expect(local).toContain('reject_design_knowledge_bucket_dml');
    expect(local).toContain("Hosted parity: migrations must not write storage.buckets for design-knowledge");
    expect(local).toContain('1073741824');
    expect(local).toMatch(/BEFORE INSERT OR UPDATE OR DELETE ON storage\.buckets/i);
  });

  it('keeps secrets out of logs and Migration 065 out of the baseline', () => {
    const admin = read('scripts/raise-design-knowledge-upload-limit.mjs');
    const policy = read('scripts/branch-baseline-policy.mjs');
    expect(admin).not.toMatch(/console\.(?:log|error)\([^)]*(accessToken|adminKey|api_key)/i);
    expect(admin).not.toContain('SUPABASE_BRANCH_DATABASE_URL');
    expect(policy).toContain("/065/.test(file)");
    expect(policy).not.toContain('065_pr_a1_security_remediation.sql');
  });
});
