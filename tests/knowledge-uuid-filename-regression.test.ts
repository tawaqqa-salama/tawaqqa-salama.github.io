/**
 * Regression: Knowledge Base UUID persistence + storage filename safety.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  isUuid,
  newKnowledgeChunkId,
  newKnowledgeDocumentId,
} from '@/lib/design-intelligence/code-knowledge/persist';
import { sanitizeKnowledgeFileName } from '@/lib/design-intelligence/code-knowledge/storage-path';
import { enqueueIndexingJob } from '@/lib/design-intelligence/jobs';
import { isSupabaseConfigured } from '@/lib/supabase';

const root = process.cwd();
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe('Knowledge UUID + filename regressions', () => {
  it('A: persistent Knowledge ID generators return valid UUIDs', () => {
    for (let i = 0; i < 5; i++) {
      expect(newKnowledgeDocumentId()).toMatch(UUID_RE);
      expect(newKnowledgeChunkId()).toMatch(UUID_RE);
      expect(isUuid(newKnowledgeDocumentId())).toBe(true);
    }
  });

  it('B: jobs.ts never generates legacy job-* for DB ids', () => {
    const src = readFileSync(join(root, 'lib/design-intelligence/jobs.ts'), 'utf8');
    expect(src).not.toMatch(/uid\('job'\)/);
    expect(src).not.toMatch(/`job-\$/);
    expect(src).toMatch(/newKnowledgeDocumentId\(\)/);
    expect(src).toMatch(/indexing_job_create_failed/);
    expect(src).toMatch(/never PATCH eq\.job-\*/);
  });

  it('C: indexing job UUID from enqueue is reused by complete updates', async () => {
    expect(isSupabaseConfigured).toBe(false);
    const documentId = newKnowledgeDocumentId();
    const queued = await enqueueIndexingJob({ documentId, jobType: 'index' });
    expect(queued.ok).toBe(true);
    if (!queued.ok) return;
    expect(queued.job.id).toMatch(UUID_RE);
    expect(queued.job.id.startsWith('job-')).toBe(false);
    expect(queued.job.document_id).toBe(documentId);

    const jobsSrc = readFileSync(join(root, 'lib/design-intelligence/jobs.ts'), 'utf8');
    expect(jobsSrc).toMatch(/\.eq\('id',\s*j\.id\)/);
    expect(jobsSrc).toMatch(/if \(!isUuid\(j\.id\)\) continue/);
  });

  it('D: document filename never becomes only ".pdf"', () => {
    expect(sanitizeKnowledgeFileName('ثوابت حسابات الاطفاء.pdf')).toBe('document.pdf');
    expect(sanitizeKnowledgeFileName('.pdf')).toBe('document.pdf');
    expect(sanitizeKnowledgeFileName('')).toBe('document.pdf');
    expect(sanitizeKnowledgeFileName('///')).toBe('document.pdf');
    expect(sanitizeKnowledgeFileName('NFPA-13-2025.pdf')).toBe('NFPA-13-2025.pdf');
    expect(sanitizeKnowledgeFileName('My Report (final).PDF')).toMatch(/^My-Report-final\.pdf$/i);
    const arabicPath = sanitizeKnowledgeFileName('ثوابت حسابات الاطفاء.pdf');
    expect(arabicPath.endsWith('.pdf')).toBe(true);
    expect(arabicPath).not.toBe('.pdf');
    expect(arabicPath.split('/').pop()).not.toBe('.pdf');
  });

  it('E: Storage success + job failure does NOT report chunks_missing as primary', () => {
    const kb = readFileSync(join(root, 'lib/design-intelligence/knowledge-base.ts'), 'utf8');
    expect(kb).toMatch(/indexing_job_create_failed/);
    expect(kb).toMatch(/upsertKnowledgeDocumentStub/);
    expect(kb).toMatch(/queued\.error \|\| 'FAILED: indexing_job_create_failed'/);
    // Order inside uploadAndIndexKnowledgeFile success path
    const uploadFn = kb.slice(kb.indexOf('export async function uploadAndIndexKnowledgeFile'));
    const stubAt = uploadFn.indexOf('await upsertKnowledgeDocumentStub');
    const jobAt = uploadFn.indexOf('await enqueueIndexingJob');
    const indexAt = uploadFn.indexOf('await indexDocumentText');
    expect(stubAt).toBeGreaterThan(0);
    expect(jobAt).toBeGreaterThan(stubAt);
    expect(indexAt).toBeGreaterThan(jobAt);
  });

  it('F: successful cloud path requires UUID chunks and >0 chunk verification', () => {
    const kb = readFileSync(join(root, 'lib/design-intelligence/knowledge-base.ts'), 'utf8');
    expect(kb).toMatch(/newKnowledgeChunkId\(\)/);
    expect(kb).toMatch(/newKnowledgeDocumentId\(\)/);
    expect(kb).toMatch(/verifyPersistedKnowledgeRows/);
    expect(kb).toMatch(/chunks_missing/);
    expect(kb).toMatch(/sanitizeKnowledgeFileName/);
    // Non-UUID doc-* generation removed from upload path
    expect(kb).not.toMatch(/const id = uid\('doc'\)/);
  });
});
