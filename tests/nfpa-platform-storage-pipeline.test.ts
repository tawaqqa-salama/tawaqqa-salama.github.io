/**
 * Platform NFPA 13-2025 Storage → ingest → adopt (no numeric activation).
 */

import { beforeEach, describe, expect, it } from 'vitest';
import {
  assertDocumentTenantIsolation,
  assertRagCannotActivateNfpaNumericRules,
  CODE_KNOWLEDGE_STORAGE_BUCKET,
  countActiveNfpa13_2025NumericRules,
  createInMemoryCodeKnowledgeStorage,
  getProjectAdoptedEdition,
  ingestPlatformNfpa13_2025AndAdopt,
  listChunksForDocument,
  listEditionRules,
  resetCodeKnowledgeStore,
  resetInMemoryCodeKnowledgeStorage,
  searchCodeKnowledge,
  uploadAndIngestCodeKnowledgeDocument,
} from '@/lib/design-intelligence/code-knowledge';

const COMPANY_A = 'company-a';
const COMPANY_B = 'company-b';
const CLIENT_1 = 'client-1';
const CLIENT_2 = 'client-2';
const CLIENT_B = 'client-b';

/** Platform-uploaded source text only — not an invented NFPA numeric table. */
function platformSourceBytes(): Uint8Array {
  const text = [
    'Section 8.1 installation narrative for indexing tests.',
    '',
    'Table 8.2.1 is referenced in the source text without encoding platform numeric cells.',
    '',
    'Page 3 discusses spacing layout. Figure 8.3 is cited.',
  ].join('\f');
  return new TextEncoder().encode(text);
}

beforeEach(() => {
  resetCodeKnowledgeStore();
  resetInMemoryCodeKnowledgeStorage();
});

describe('Platform NFPA 13-2025 Storage pipeline', () => {
  it('blocks when no platform file bytes are provided', async () => {
    const blocked = await ingestPlatformNfpa13_2025AndAdopt({
      companyId: COMPANY_A,
      bytes: new Uint8Array(),
      fileName: 'missing.pdf',
      adoptForProjects: [{ companyId: COMPANY_A, clientId: CLIENT_1 }],
      storage: createInMemoryCodeKnowledgeStorage(),
    });
    expect(blocked.ok).toBe(false);
    expect(blocked.blocked).toBe('missing_platform_file');
    expect(blocked.active_numeric_rules).toBe(0);
  });

  it('Upload → Storage → extract → chunks → RAG + multi-project adoption without copying body', async () => {
    const storage = createInMemoryCodeKnowledgeStorage();
    const bytes = platformSourceBytes();

    const result = await ingestPlatformNfpa13_2025AndAdopt({
      companyId: COMPANY_A,
      bytes,
      fileName: 'nfpa13-2025-platform.txt',
      mimeType: 'text/plain',
      adoptForProjects: [
        { companyId: COMPANY_A, clientId: CLIENT_1 },
        { companyId: COMPANY_A, clientId: CLIENT_2 },
      ],
      storage,
    });

    expect(result.ok).toBe(true);
    expect(result.bucket).toBe(CODE_KNOWLEDGE_STORAGE_BUCKET);
    expect(result.document?.code).toBe('NFPA-13');
    expect(result.document?.edition).toBe('2025');
    expect(result.document?.source_type).toBe('PROJECT_PROVIDED_DOCUMENT');
    expect(result.document?.platform_verification_status).toBe('NOT_VERIFIED_OFFICIAL');
    expect(result.document?.storage_bucket).toBe('design-knowledge');
    expect(result.document?.storage_path).toContain('/code-knowledge/NFPA-13/2025/');
    expect(result.pages_extracted).toBeGreaterThan(0);
    expect(result.chunk_count).toBeGreaterThan(0);

    const chunks = listChunksForDocument(result.document!.id);
    expect(chunks.every((c) => c.page_start != null && c.page_end != null)).toBe(true);
    expect(chunks.every((c) => c.extraction_method)).toBeTruthy();
    expect(chunks.every((c) => c.document_id === result.document!.id)).toBe(true);

    // Adoption by reference — no extracted body on adoption rows
    expect(result.adoptions).toHaveLength(2);
    expect(result.adoptions.every((a) => a.knowledge_document_id === result.document!.id)).toBe(
      true
    );
    expect(result.adoptions.every((a) => a.edition === '2025')).toBe(true);
    expect(result.adoptions.every((a) => a.platform_verification_status === 'NOT_VERIFIED_OFFICIAL')).toBe(
      true
    );
    expect(getProjectAdoptedEdition(CLIENT_1, 'NFPA-13', COMPANY_A)?.knowledge_document_id).toBe(
      result.document!.id
    );
    expect(getProjectAdoptedEdition(CLIENT_2, 'NFPA-13', COMPANY_A)?.knowledge_document_id).toBe(
      result.document!.id
    );

    // Numeric shells remain inactive
    const shells = listEditionRules({ code: 'NFPA-13', edition: '2025' });
    expect(shells).toHaveLength(8);
    expect(shells.every((r) => r.verification_status === 'RULE_NOT_CONFIGURED')).toBe(true);
    expect(shells.every((r) => r.is_active === false)).toBe(true);
    expect(shells.every((r) => r.numeric_value == null && r.numeric_min == null && r.numeric_max == null)).toBe(
      true
    );
    expect(countActiveNfpa13_2025NumericRules()).toBe(0);
    expect(result.active_numeric_rules).toBe(0);

    // RAG indexes and cannot activate numeric / PASS
    const hits = searchCodeKnowledge({
      companyId: COMPANY_A,
      code: 'NFPA-13',
      edition: '2025',
      query: 'Section 8.1 Table spacing',
      topK: 5,
    });
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every((h) => h.edition === '2025')).toBe(true);
    const ragGuard = assertRagCannotActivateNfpaNumericRules({
      companyId: COMPANY_A,
      query: 'density Table 8.2.1',
    });
    expect(ragGuard.pass).toBe(true);
    expect(ragGuard.active_numeric_rules).toBe(0);
  });

  it('OCR fallback pages do not invent numeric rules', async () => {
    const storage = createInMemoryCodeKnowledgeStorage();
    const result = await ingestPlatformNfpa13_2025AndAdopt({
      companyId: COMPANY_A,
      bytes: new TextEncoder().encode('\f\f'), // empty pages → OCR path
      fileName: 'scanned.txt',
      mimeType: 'text/plain',
      adoptForProjects: [{ companyId: COMPANY_A, clientId: CLIENT_1 }],
      ocrPageText: { 1: 'Section 1.1 OCR recovered narrative only.' },
      storage,
    });
    expect(result.ok).toBe(true);
    expect((result.pages_ocr || 0) + (result.document?.ocr_used ? 1 : 0)).toBeGreaterThan(0);
    expect(countActiveNfpa13_2025NumericRules()).toBe(0);
  });

  it('tenant isolation + edition isolation', async () => {
    const storage = createInMemoryCodeKnowledgeStorage();
    await ingestPlatformNfpa13_2025AndAdopt({
      companyId: COMPANY_A,
      bytes: platformSourceBytes(),
      fileName: 'a.txt',
      mimeType: 'text/plain',
      adoptForProjects: [{ companyId: COMPANY_A, clientId: CLIENT_1 }],
      storage,
    });
    await ingestPlatformNfpa13_2025AndAdopt({
      companyId: COMPANY_B,
      bytes: new TextEncoder().encode('Section 9.9 company-B-only-token'),
      fileName: 'b.txt',
      mimeType: 'text/plain',
      adoptForProjects: [{ companyId: COMPANY_B, clientId: CLIENT_B }],
      storage,
    });

    // Separate edition for isolation check
    await uploadAndIngestCodeKnowledgeDocument({
      companyId: COMPANY_A,
      code: 'NFPA-13',
      edition: '2028',
      fileName: '2028.txt',
      mimeType: 'text/plain',
      bytes: new TextEncoder().encode('Section 9.9 unique-token-2028-only'),
      storage,
      replaceIfChanged: true,
    });

    expect(assertDocumentTenantIsolation(COMPANY_A, COMPANY_B)).toBe(true);

    const hitsB = searchCodeKnowledge({
      companyId: COMPANY_B,
      code: 'NFPA-13',
      edition: '2025',
      query: 'company-B-only-token',
    });
    expect(hitsB.every((h) => h.document.company_id === COMPANY_B)).toBe(true);

    const hits2025 = searchCodeKnowledge({
      companyId: COMPANY_A,
      code: 'NFPA-13',
      edition: '2025',
      query: 'unique-token-2028-only Section',
    });
    expect(hits2025.every((h) => h.edition === '2025')).toBe(true);
    expect(hits2025.every((h) => !h.chunk.content.includes('2028-only'))).toBe(true);
  });
});
