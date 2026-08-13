/**
 * Static safety checks for 047 design-knowledge Storage bucket migration.
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CODE_KNOWLEDGE_STORAGE_BUCKET } from '@/lib/design-intelligence/code-knowledge';

const ROOT = resolve(__dirname, '..');
const M047 = resolve(ROOT, 'scripts/sql/047_design_knowledge_storage_bucket.sql');

describe('047 design-knowledge Storage bucket migration', () => {
  it('exists and reuses design-knowledge bucket (no duplicate bucket invent)', () => {
    expect(existsSync(M047)).toBe(true);
    expect(CODE_KNOWLEDGE_STORAGE_BUCKET).toBe('design-knowledge');
    const sql = readFileSync(M047, 'utf8');
    expect(sql).toContain("id = 'design-knowledge'");
    expect(sql).toContain('IF EXISTS (SELECT 1 FROM storage.buckets WHERE id = ');
    expect(sql).toContain('public = false');
    expect(sql).toMatch(/no anon|anon denied/i);
  });

  it('applies authenticated tenant RLS and additive document/chunk columns', () => {
    const sql = readFileSync(M047, 'utf8');
    expect(sql).toContain('TO authenticated');
    expect(sql).toContain('current_app_company_id()');
    expect(sql).toContain('is_platform_admin()');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS sha256');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS ingestion_status');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS extraction_status');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS mime_type');
    expect(sql).toContain('page_start');
    expect(sql).toContain('page_end');
    expect(sql).toContain('extraction_method');
    expect(sql).toContain('edition_id');
    expect(sql).toContain('{company_id}/code-knowledge/{code}/{edition}/{document_id}');
    expect(sql).not.toMatch(/public\s*=\s*true/);
  });
});
