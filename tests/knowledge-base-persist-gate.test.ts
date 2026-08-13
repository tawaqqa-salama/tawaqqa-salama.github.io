/**
 * Knowledge Base upload must not succeed via session-memory in Production.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  EXPECTED_PRODUCTION_SUPABASE_REF,
  getSupabaseProjectRef,
  isSupabaseConfigured,
  SUPABASE_PERSISTENCE_UNAVAILABLE,
} from '@/lib/supabase';
import { uploadAndIndexKnowledgeFile } from '@/lib/design-intelligence/knowledge-base';

const root = process.cwd();

describe('Knowledge Base Production persistence gate', () => {
  it('removes session-memory success copy from DesignIntelligenceModule', () => {
    const src = readFileSync(
      join(root, 'components/design/DesignIntelligenceModule.tsx'),
      'utf8'
    );
    expect(src).not.toMatch(/تمت الفهرسة في ذاكرة الجلسة/);
    expect(src).not.toMatch(/Document indexed in session memory/);
    expect(src).toMatch(/SUPABASE_PERSISTENCE_UNAVAILABLE/);
    expect(src).toMatch(/uploadAndIndexKnowledgeFile\(/);
    expect(src).toMatch(/companyId:\s*companyUuid/);
  });

  it('uploadAndIndexKnowledgeFile routes NFPA via uploadAndIngestCodeKnowledgeDocument', () => {
    const src = readFileSync(
      join(root, 'lib/design-intelligence/knowledge-base.ts'),
      'utf8'
    );
    expect(src).toMatch(/uploadAndIngestCodeKnowledgeDocument/);
    expect(src).toMatch(/SUPABASE_PERSISTENCE_UNAVAILABLE/);
    expect(src).toMatch(/document_id must be a UUID/);
    expect(src).toMatch(/no local indexed fallback/);
    expect(src).toMatch(/verifyPersistedKnowledgeRows/);
    // Non-UUID doc-* ids must not be used for Production inserts
    expect(src).not.toMatch(/const id = uid\('doc'\)/);
  });

  it('throws Supabase persistence unavailable when client not configured', async () => {
    expect(isSupabaseConfigured).toBe(false);
    const file = new File(['Section 8.1'], 'nfpa-13-2025.txt', { type: 'text/plain' });
    await expect(
      uploadAndIndexKnowledgeFile({
        file,
        companyId: '00000000-0000-4000-8000-000000000001',
        meta: { title: 'NFPA 13-2025', applicable_codes: ['NFPA 13'] },
      })
    ).rejects.toThrow(SUPABASE_PERSISTENCE_UNAVAILABLE);
  });

  it('exposes project ref helper without leaking keys', () => {
    expect(EXPECTED_PRODUCTION_SUPABASE_REF).toBe('ezmdkwgziyencejfevso');
    const ref = getSupabaseProjectRef();
    // Agent env typically has no URL → null; never a JWT-looking key
    if (ref) {
      expect(ref).toMatch(/^[a-z0-9]+$/i);
      expect(ref.length).toBeLessThan(40);
    }
  });
});
