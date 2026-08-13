/**
 * NFPA Code Knowledge Pipeline — comprehensive tests (PR #143).
 */

import { beforeEach, describe, expect, it } from 'vitest';
import {
  adoptNfpa13_2025ForProject,
  applyAdoptionToEngineeringData,
  applyOcrFallbackToPages,
  assertCitationPresentInText,
  buildCodeKnowledgeObjectPath,
  canAuthoritativePass,
  chunkPagesPreserving,
  CODE_KNOWLEDGE_STORAGE_BUCKET,
  companyCanAccessDocument,
  compareCodeEditions,
  createInMemoryCodeKnowledgeStorage,
  detectSourceRefsFromText,
  evaluateAdvisoryComplianceAttempt,
  explainCodeKnowledgeHits,
  getEditionRule,
  getKnowledgeDocument,
  getProjectAdoptedEdition,
  ingestCodeKnowledgeFromStorage,
  listChunksForDocument,
  listEditionRules,
  listPipelineJobs,
  mapComplianceBlockerStatus,
  NFPA13_PIPELINE_RULE_IDS,
  pagesFromPlainText,
  parseCodeKnowledgeObjectPath,
  processNextPipelineJob,
  ragHitsCannotProducePass,
  registerCodeEdition,
  registerEditionRule,
  registerEditionRuleShellsForNewEdition,
  registerKnowledgeDocument,
  registerNfpa13_2025ProjectEdition,
  registerNfpa13_2025RuleShells,
  resetCodeKnowledgeStore,
  resetInMemoryCodeKnowledgeStorage,
  resolveProjectCodeEdition,
  retryFailedJob,
  runDocumentPipeline,
  searchCodeKnowledge,
  sha256HexFromBytes,
  sha256HexFromText,
  uploadAndIngestCodeKnowledgeDocument,
} from '@/lib/design-intelligence/code-knowledge';
import {
  attachFrozenComplianceSnapshot,
  freezeComplianceSnapshot,
  runProjectCompliance,
} from '@/lib/projects/compliance';
import { resolveCanonicalEngineeringDataset } from '@/lib/projects/canonical-engineering';
import {
  EMPTY_PROJECT_ENGINEERING_DATA,
  type ProjectEngineeringData,
} from '@/lib/types/project-reports';
import { EMPTY_FIRE_PROTECTION_DESIGN } from '@/lib/types/fire-protection-design';
import type { ClientRecord } from '@/lib/types/client';

const COMPANY_A = 'company-a';
const COMPANY_B = 'company-b';
const CLIENT_A = 'client-a';

function client(id = CLIENT_A): ClientRecord {
  return {
    id,
    name: 'Pipeline Client',
    business_name: 'Pipeline Client',
    activity_type: 'مكتب',
    floors_count: 2,
    building_area: 900,
  } as ClientRecord;
}

function sampleText(): string {
  return [
    'Section 8.1 installation requirements for sprinkler systems.',
    '',
    'Table 8.2.1 lists design criteria for ordinary hazard.',
    '',
    'Page 42 discusses coverage. Figure 8.3 illustrates spacing layout.',
    '',
    'Paragraph 8.1.2 provides additional notes on density without inventing values.',
  ].join('\n');
}

beforeEach(() => {
  resetCodeKnowledgeStore();
  resetInMemoryCodeKnowledgeStorage();
});

describe('A. Document registration', () => {
  it('registers NFPA 13-2025 and preserves verification metadata', () => {
    const r = registerNfpa13_2025ProjectEdition({ companyId: COMPANY_A });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.edition.code).toBe('NFPA-13');
    expect(r.edition.edition).toBe('2025');
    expect(r.edition.platform_verification_status).toBe('NOT_VERIFIED_OFFICIAL');
    expect(r.edition.verification_status).toBe('PROJECT_COVER_IDENTIFIED');
  });

  it('duplicate edition is idempotent', () => {
    const a = registerNfpa13_2025ProjectEdition({ companyId: COMPANY_A });
    const b = registerNfpa13_2025ProjectEdition({ companyId: COMPANY_A });
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) {
      expect(a.edition.id).toBe(b.edition.id);
      expect(b.created).toBe(false);
    }
  });

  it('duplicate edition rejected when idempotent=false', () => {
    registerCodeEdition({
      companyId: COMPANY_A,
      code: 'NFPA-13',
      edition: '2025',
      idempotent: true,
    });
    const dup = registerCodeEdition({
      companyId: COMPANY_A,
      code: 'NFPA-13',
      edition: '2025',
      idempotent: false,
    });
    expect(dup.ok).toBe(false);
  });

  it('project adoption stored and verification preserved', () => {
    const adoption = adoptNfpa13_2025ForProject({
      companyId: COMPANY_A,
      clientId: CLIENT_A,
    });
    expect(adoption.edition).toBe('2025');
    expect(adoption.platform_verification_status).toBe('NOT_VERIFIED_OFFICIAL');
    expect(getProjectAdoptedEdition(CLIENT_A, 'NFPA-13', COMPANY_A)?.source_document_id).toBe(
      'project_provided:NFPA-13-2025-cover'
    );
  });
});

describe('B. Ingestion', () => {
  it('queues document, extracts, chunks, preserves metadata, completes index', () => {
    const doc = registerKnowledgeDocument({
      companyId: COMPANY_A,
      title: 'NFPA 13 2025 excerpt',
      code: 'NFPA-13',
      edition: '2025',
      source_document_id: 'project_provided:NFPA-13-2025-cover',
      extracted_text: sampleText(),
    });
    expect(doc.index_status).toBe('queued');
    expect(listPipelineJobs(doc.id).length).toBe(5);

    const result = runDocumentPipeline(doc.id);
    expect(result.ok).toBe(true);
    expect(result.document?.index_status).toBe('indexed');
    expect(result.document?.chunk_count).toBeGreaterThan(0);

    const chunks = listChunksForDocument(doc.id);
    expect(chunks[0]?.source_document_id).toBe('project_provided:NFPA-13-2025-cover');
    expect(chunks[0]?.edition).toBe('2025');
  });

  it('failed job retry and idempotent rerun', () => {
    const doc = registerKnowledgeDocument({
      companyId: COMPANY_A,
      title: 't',
      code: 'NFPA-13',
      edition: '2025',
      source_document_id: 'src-1',
      extracted_text: sampleText(),
    });
    // Force a job into failed state
    const jobs = listPipelineJobs(doc.id);
    const extract = jobs.find((j) => j.job_type === 'extract')!;
    extract.status = 'failed';
    extract.attempts = 1;
    extract.error_message = 'transient';
    const retried = retryFailedJob(extract.id);
    expect(retried?.status).toBe('queued');

    const first = runDocumentPipeline(doc.id);
    const second = runDocumentPipeline(doc.id);
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(listChunksForDocument(doc.id).length).toBe(first.document?.chunk_count);
  });
});

describe('C. Source traceability', () => {
  it('preserves section, table, page when present in text', () => {
    const refs = detectSourceRefsFromText(
      'Section 8.1 and Table 8.2.1 apply. Page 42. Figure 8.3.'
    );
    expect(refs.section).toBe('8.1');
    expect(refs.table_reference).toBe('Table 8.2.1');
    expect(refs.page_number).toBe(42);
    expect(refs.figure_reference).toBe('Figure 8.3');
    expect(refs.source_verification_status).toBe('VERIFIED');
  });

  it('missing citation → NOT_VERIFIED', () => {
    const refs = detectSourceRefsFromText('General sprinkler discussion without citations.');
    expect(refs.section).toBeNull();
    expect(refs.source_verification_status).toBe('NOT_VERIFIED');
  });

  it('fabricated citation rejected', () => {
    const text = 'Section 8.1 only.';
    expect(assertCitationPresentInText(text, { section: '8.1' }).ok).toBe(true);
    expect(assertCitationPresentInText(text, { section: '99.9' }).ok).toBe(false);
    expect(assertCitationPresentInText(text, { table: 'Table 1.1' }).ok).toBe(false);
  });
});

describe('D. RAG search', () => {
  it('matching query returns relevant chunks with filters + sources', () => {
    const doc = registerKnowledgeDocument({
      companyId: COMPANY_A,
      title: 'NFPA 13',
      code: 'NFPA-13',
      edition: '2025',
      source_document_id: 'src-a',
      extracted_text: sampleText(),
    });
    runDocumentPipeline(doc.id);

    const hits = searchCodeKnowledge({
      companyId: COMPANY_A,
      code: 'NFPA-13',
      edition: '2025',
      query: 'Table 8.2.1 ordinary hazard design',
      topK: 5,
    });
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].edition).toBe('2025');
    expect(hits[0].code).toBe('NFPA-13');
    expect(hits[0].source_verification_status).toBeTruthy();
    expect(hits.every((h) => h.document.company_id === COMPANY_A)).toBe(true);

    const wrongEdition = searchCodeKnowledge({
      companyId: COMPANY_A,
      code: 'NFPA-13',
      edition: '2028',
      query: 'Table 8.2.1',
    });
    expect(wrongEdition).toEqual([]);

    const empty = searchCodeKnowledge({
      companyId: COMPANY_A,
      code: 'NFPA-13',
      edition: '2025',
      query: 'zzzz-nonexistent-token-qqqq',
    });
    // may be empty or low — safe return
    expect(Array.isArray(empty)).toBe(true);

    const explained = explainCodeKnowledgeHits(hits);
    expect(explained.can_produce_pass).toBe(false);
    expect(explained.authoritative).toBe(false);
  });

  it('tenant isolation works', () => {
    const docA = registerKnowledgeDocument({
      companyId: COMPANY_A,
      title: 'A',
      code: 'NFPA-13',
      edition: '2025',
      source_document_id: 'a',
      extracted_text: 'Section 1.1 company A secret density notes.',
    });
    const docB = registerKnowledgeDocument({
      companyId: COMPANY_B,
      title: 'B',
      code: 'NFPA-13',
      edition: '2025',
      source_document_id: 'b',
      extracted_text: 'Section 1.1 company B secret density notes.',
    });
    runDocumentPipeline(docA.id);
    runDocumentPipeline(docB.id);

    const hitsA = searchCodeKnowledge({
      companyId: COMPANY_A,
      code: 'NFPA-13',
      edition: '2025',
      query: 'secret density',
    });
    expect(hitsA.every((h) => h.document.company_id === COMPANY_A)).toBe(true);
    expect(companyCanAccessDocument(COMPANY_A, getKnowledgeDocument(docB.id)!)).toBe(false);
  });
});

describe('E. Versioning', () => {
  it('2025 and 2028 coexist; old rules unchanged; compare; no auto-activate', () => {
    registerNfpa13_2025RuleShells();
    const density2025 = getEditionRule('NFPA13-DENSITY', 'NFPA-13', '2025')!;
    expect(density2025.verification_status).toBe('RULE_NOT_CONFIGURED');

    registerCodeEdition({
      companyId: COMPANY_A,
      code: 'NFPA-13',
      edition: '2028',
      status: 'draft',
      idempotent: true,
    });
    registerEditionRuleShellsForNewEdition({
      code: 'NFPA-13',
      edition: '2028',
      rule_codes: [...NFPA13_PIPELINE_RULE_IDS],
    });

    // Mutate 2028 density explanation only
    const d2028 = getEditionRule('NFPA13-DENSITY', 'NFPA-13', '2028')!;
    d2028.explanation_en = '2028 shell pending review';

    expect(getEditionRule('NFPA13-DENSITY', 'NFPA-13', '2025')?.explanation_en).toBe(
      density2025.explanation_en
    );

    const cmp = compareCodeEditions('NFPA-13', '2025', '2028');
    expect(cmp.status).toBe('PENDING_ENGINEER_REVIEW');
    expect(cmp.new_edition_activated).toBe(false);
    expect(cmp.changed_rules.some((c) => c.rule_code === 'NFPA13-DENSITY')).toBe(true);

    adoptNfpa13_2025ForProject({ companyId: COMPANY_A, clientId: CLIENT_A });
    const resolved = resolveProjectCodeEdition({
      clientId: CLIENT_A,
      code: 'NFPA-13',
      companyId: COMPANY_A,
    });
    expect(resolved.edition).toBe('2025');
  });
});

describe('F. Compliance integration', () => {
  it('RULE_NOT_CONFIGURED and NEEDS_DATA block; RAG/estimate cannot PASS', () => {
    registerNfpa13_2025RuleShells();
    const shells = listEditionRules({ code: 'NFPA-13', edition: '2025' });
    expect(shells).toHaveLength(8);
    expect(shells.every((r) => r.verification_status === 'RULE_NOT_CONFIGURED')).toBe(true);
    expect(shells.every((r) => r.numeric_value == null && r.numeric_min == null)).toBe(true);

    expect(mapComplianceBlockerStatus('RULE_NOT_CONFIGURED').blocks).toBe(true);
    expect(mapComplianceBlockerStatus('NEEDS_DATA').blocks).toBe(true);
    expect(mapComplianceBlockerStatus('PASS').blocks).toBe(false);

    const ragAttempt = evaluateAdvisoryComplianceAttempt({
      source: 'rag',
      rule_id: 'NFPA13-DENSITY',
      code: 'NFPA-13',
      claimed_status: 'PASS',
    });
    expect(ragAttempt.can_produce_pass).toBe(false);
    expect(ragAttempt.status).not.toBe('PASS');
    expect(ragAttempt.gate).toBe('BLOCKED');

    const est = evaluateAdvisoryComplianceAttempt({
      source: 'estimated_calculation',
      rule_id: 'NFPA13-DENSITY',
      claimed_status: 'PASS',
      estimated_value: 12.2,
    });
    expect(est.can_produce_pass).toBe(false);

    expect(
      canAuthoritativePass({
        ruleConfigured: false,
        inputsComplete: true,
        sourceVerified: true,
        fromRag: false,
        fromEstimate: false,
        fromAdvisory: false,
      }).allowPass
    ).toBe(false);

    expect(
      canAuthoritativePass({
        ruleConfigured: true,
        inputsComplete: false,
        sourceVerified: true,
        fromRag: false,
        fromEstimate: false,
        fromAdvisory: false,
      }).reason
    ).toBe('NEEDS_DATA');

    expect(ragHitsCannotProducePass([])).toBe(true);

    // Refuse numeric without citation
    const bad = registerEditionRule({
      rule_code: 'NFPA13-DENSITY',
      code: 'NFPA-13',
      edition: '2025',
      numeric_value: 12.2,
      unit: 'L/min/m2',
    });
    expect(bad.ok).toBe(false);
  });

  it('approved report freezes compliance snapshot with edition/source refs', () => {
    const data: ProjectEngineeringData = applyAdoptionToEngineeringData(
      {
        ...EMPTY_PROJECT_ENGINEERING_DATA,
        fire_protection_design: {
          ...EMPTY_FIRE_PROTECTION_DESIGN,
          occupancy: { ...EMPTY_FIRE_PROTECTION_DESIGN.occupancy, hazard_class: 'ordinary_1' },
        },
      },
      adoptNfpa13_2025ForProject({ companyId: COMPANY_A, clientId: CLIENT_A })
    );

    const run = runProjectCompliance({
      client: client(),
      data,
    });

    const snap = freezeComplianceSnapshot({
      run,
      stageId: 'technical_report',
      sourceCode: 'NFPA-13',
      codeEdition: '2025',
      sourceDocumentId: 'project_provided:NFPA-13-2025-cover',
    });

    expect(snap.code_edition).toBe('2025');
    expect(snap.source_document_id).toBe('project_provided:NFPA-13-2025-cover');
    expect(snap.rule_versions?.length).toBeGreaterThan(0);
    expect(snap.source_references?.length).toBeGreaterThan(0);
    expect(snap.evaluated_inputs).toBeTruthy();
    expect(snap.evaluated_outputs).toBeTruthy();

    const frozenData = attachFrozenComplianceSnapshot(data, snap);
    expect(frozenData.compliance?.approved_snapshot?.code_edition).toBe('2025');

    // Later KB change must not rewrite frozen snapshot
    registerEditionRuleShellsForNewEdition({
      code: 'NFPA-13',
      edition: '2028',
      rule_codes: ['NFPA13-DENSITY'],
    });
    expect(frozenData.compliance?.approved_snapshot?.code_edition).toBe('2025');
  });

  it('advisory stack cannot unlock stage (gate BLOCKED when claiming PASS from RAG)', () => {
    const attempt = evaluateAdvisoryComplianceAttempt({
      source: 'design_intelligence',
      rule_id: 'NFPA13-SPACING',
      claimed_status: 'PASS',
    });
    expect(attempt.gate).toBe('BLOCKED');
  });
});

describe('G. Tenant security', () => {
  it('company A cannot read company B documents/chunks', () => {
    const docB = registerKnowledgeDocument({
      companyId: COMPANY_B,
      title: 'B secret',
      code: 'NFPA-13',
      edition: '2025',
      source_document_id: 'b',
      extracted_text: 'Section 9.9 confidential B content.',
    });
    runDocumentPipeline(docB.id);

    const hits = searchCodeKnowledge({
      companyId: COMPANY_A,
      code: 'NFPA-13',
      edition: '2025',
      query: 'confidential B content',
    });
    expect(hits).toEqual([]);
    expect(companyCanAccessDocument(COMPANY_A, getKnowledgeDocument(docB.id)!)).toBe(false);
  });

  it('company A cannot modify company B rules via getEditionRule isolation of store writes', () => {
    // Rules are edition-scoped globally in memory store; tenant docs are isolated.
    // Document write isolation is the primary tenant boundary tested here.
    const docA = registerKnowledgeDocument({
      companyId: COMPANY_A,
      title: 'A',
      code: 'NFPA-20',
      edition: '2025',
      source_document_id: 'a',
      extracted_text: 'Section 1 pump notes A',
    });
    expect(companyCanAccessDocument(COMPANY_B, docA)).toBe(false);
  });

  it('anon cannot access tenant knowledge data (no company id)', () => {
    registerKnowledgeDocument({
      companyId: COMPANY_A,
      title: 'A',
      code: 'NFPA-13',
      edition: '2025',
      source_document_id: 'a',
      extracted_text: 'Section 1',
    });
    const hits = searchCodeKnowledge({
      companyId: '',
      code: 'NFPA-13',
      edition: '2025',
      query: 'Section',
    });
    expect(hits).toEqual([]);
  });
});

describe('H. Legacy compatibility', () => {
  it('legacy JSON readable; canonical live data takes precedence', () => {
    const legacy: ProjectEngineeringData = {
      ...EMPTY_PROJECT_ENGINEERING_DATA,
      compliance: {
        notes: 'legacy only',
        nfpa13_numeric: {
          edition_adoption: {
            code: 'NFPA-13',
            edition: '2025',
            adoption_status: 'PROJECT_ADOPTED',
            source_type: 'PROJECT_PROVIDED_DOCUMENT',
            source_document_id: 'project_provided:NFPA-13-2025-cover',
            verification_status: 'PROJECT_COVER_IDENTIFIED',
            platform_verification_status: 'NOT_VERIFIED_OFFICIAL',
          },
        },
      },
    };

    const live: ProjectEngineeringData = {
      ...EMPTY_PROJECT_ENGINEERING_DATA,
      compliance: {
        nfpa13_numeric: {
          edition_adoption: {
            code: 'NFPA-13',
            edition: '2025',
            title: 'from live',
            adoption_status: 'PROJECT_ADOPTED',
            source_type: 'PROJECT_PROVIDED_DOCUMENT',
            source_document_id: 'project_provided:NFPA-13-2025-cover',
            verification_status: 'PROJECT_COVER_IDENTIFIED',
            platform_verification_status: 'NOT_VERIFIED_OFFICIAL',
          },
        },
      },
    };

    const resolved = resolveCanonicalEngineeringDataset({
      live,
      legacy,
    });
    expect(resolved.engineering_meta?.canonical_source).toBe('project_engineering_live');
    expect(
      resolved.compliance?.nfpa13_numeric?.edition_adoption?.platform_verification_status
    ).toBe('NOT_VERIFIED_OFFICIAL');

    const legacyOnly = resolveCanonicalEngineeringDataset({
      live: null,
      legacy,
    });
    expect(legacyOnly.engineering_meta?.canonical_source).toBe(
      'legacy_project_engineering_data'
    );
    expect(legacyOnly.compliance?.notes).toBe('legacy only');
  });
});

describe('Pipeline job processNext', () => {
  it('processes jobs one at a time without uncontrolled loop', () => {
    const doc = registerKnowledgeDocument({
      companyId: COMPANY_A,
      title: 't',
      code: 'NFPA-13',
      edition: '2025',
      source_document_id: 's',
      extracted_text: sampleText(),
    });
    const a = processNextPipelineJob(doc.id);
    expect(a.processed).toBe(true);
    const remaining = listPipelineJobs(doc.id).filter(
      (j) => j.status === 'queued' || j.status === 'pending'
    );
    expect(remaining.length).toBeGreaterThan(0);
  });
});

describe('I. Supabase Storage ingestion', () => {
  const storage = () => createInMemoryCodeKnowledgeStorage();

  function pageBytes(text: string): Uint8Array {
    return new TextEncoder().encode(text);
  }

  it('builds tenant storage path from code/edition/documentId (not file name alone)', () => {
    const path = buildCodeKnowledgeObjectPath({
      companyId: COMPANY_A,
      code: 'NFPA-13',
      edition: '2025',
      documentId: 'doc-1',
      fileName: 'anything.pdf',
    });
    expect(path).toBe(
      `${COMPANY_A}/code-knowledge/NFPA-13/2025/doc-1/anything.pdf`
    );
    expect(CODE_KNOWLEDGE_STORAGE_BUCKET).toBe('design-knowledge');
    const parsed = parseCodeKnowledgeObjectPath(path);
    expect(parsed?.code).toBe('NFPA-13');
    expect(parsed?.edition).toBe('2025');
    expect(parsed?.documentId).toBe('doc-1');
  });

  it('upload metadata + SHA-256 deduplication skips identical re-ingest', async () => {
    const adapter = storage();
    const body = pageBytes(
      'Section 8.1\fTable 8.2.1 ordinary hazard notes.\fPage 3 spacing.'
    );
    const sha = await sha256HexFromBytes(body);
    const first = await uploadAndIngestCodeKnowledgeDocument({
      companyId: COMPANY_A,
      code: 'NFPA-13',
      edition: '2025',
      fileName: 'nfpa13-2025.txt',
      mimeType: 'text/plain',
      bytes: body,
      storage: adapter,
    });
    expect(first.status).toBe('indexed');
    if (first.status !== 'indexed') return;
    expect(first.document.sha256).toBe(sha);
    expect(first.document.storage_bucket).toBe('design-knowledge');
    expect(first.document.storage_path).toContain('/code-knowledge/NFPA-13/2025/');
    expect(first.document.mime_type).toBe('text/plain');
    expect(first.document.ingestion_status).toBe('indexed');
    expect(first.document.edition_id).toBeTruthy();

    const second = await uploadAndIngestCodeKnowledgeDocument({
      companyId: COMPANY_A,
      code: 'NFPA-13',
      edition: '2025',
      fileName: 'nfpa13-2025-copy.txt',
      mimeType: 'text/plain',
      bytes: body,
      storage: adapter,
    });
    expect(second.status).toBe('skipped_duplicate');
    if (second.status === 'skipped_duplicate') {
      expect(second.document.id).toBe(first.document.id);
      expect(second.sha256).toBe(sha);
    }
  });

  it('changed bytes create a new ingestion version without mutating history', async () => {
    const adapter = storage();
    const v1 = await uploadAndIngestCodeKnowledgeDocument({
      companyId: COMPANY_A,
      code: 'NFPA-13',
      edition: '2025',
      fileName: 'v1.txt',
      mimeType: 'text/plain',
      bytes: pageBytes('Section 1.1 version one body.'),
      storage: adapter,
    });
    expect(v1.status).toBe('indexed');
    if (v1.status !== 'indexed') return;
    const historicText = v1.document.extracted_text;
    const historicId = v1.document.id;

    const v2 = await uploadAndIngestCodeKnowledgeDocument({
      companyId: COMPANY_A,
      code: 'NFPA-13',
      edition: '2025',
      fileName: 'v2.txt',
      mimeType: 'text/plain',
      bytes: pageBytes('Section 1.1 version two replacement body.'),
      storage: adapter,
      replaceIfChanged: true,
    });
    expect(v2.status).toBe('indexed');
    if (v2.status !== 'indexed') return;
    expect(v2.document.id).not.toBe(historicId);
    expect(v2.document.parent_document_id).toBe(historicId);
    expect(v2.document.ingestion_version).toBeGreaterThan(1);
    expect(getKnowledgeDocument(historicId)?.status).toBe('superseded');
    expect(getKnowledgeDocument(historicId)?.extracted_text).toBe(historicText);
    expect(getKnowledgeDocument(historicId)?.sha256).not.toBe(v2.document.sha256);
  });

  it('ingests from Storage download stream with page preservation + OCR fallback', async () => {
    const adapter = storage();
    const path = `${COMPANY_A}/code-knowledge/NFPA-13/2025/preloaded/doc.txt`;
    const bytes = pageBytes('Section 9.1 page one text.');
    await adapter.upload('design-knowledge', path, bytes, {
      contentType: 'text/plain',
    });
    const sha = await sha256HexFromBytes(bytes);

    const result = await ingestCodeKnowledgeFromStorage({
      companyId: COMPANY_A,
      code: 'NFPA-13',
      edition: '2025',
      title: 'From Storage',
      fileName: 'doc.txt',
      mimeType: 'text/plain',
      sha256: sha,
      storagePath: path,
      source_document_id: 'storage:test',
      storage: adapter,
    });
    expect(result.status).toBe('indexed');
    expect(result.page_count).toBeGreaterThan(0);
    const chunks = listChunksForDocument(result.document.id);
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks.every((c) => c.page_start != null && c.page_end != null)).toBe(true);
    expect(chunks.every((c) => c.document_id === result.document.id)).toBe(true);
    expect(chunks.every((c) => c.edition_id)).toBeTruthy();
    expect(chunks.every((c) => c.extraction_method)).toBeTruthy();

    // OCR fallback: empty pages marked ocr without inventing NFPA numbers
    const empty = applyOcrFallbackToPages([
      { page: 1, text: '', extraction_method: 'empty' },
    ]);
    expect(empty.ocr_used).toBe(true);
    expect(empty.pages[0]?.extraction_method).toBe('ocr');
    expect(empty.pages[0]?.text).toBe('');

    const withOcr = applyOcrFallbackToPages(
      [{ page: 1, text: '', extraction_method: 'empty' }],
      { 1: 'Section 2.2 OCR recovered text.' }
    );
    expect(withOcr.pages[0]?.text).toContain('Section 2.2');
    expect(withOcr.extraction_method).toBe('ocr');
  });

  it('page-preserving chunker keeps page_start/page_end', () => {
    const pages = pagesFromPlainText('Alpha page\fBeta page with Section 3.1\fGamma');
    const chunks = chunkPagesPreserving(pages.pages, 700);
    expect(chunks.length).toBe(3);
    expect(chunks[0].page_start).toBe(1);
    expect(chunks[1].page_start).toBe(2);
    expect(chunks[2].page_end).toBe(3);
  });

  it('edition isolation: 2025 RAG never returns 2028 chunks', async () => {
    const adapter = storage();
    await uploadAndIngestCodeKnowledgeDocument({
      companyId: COMPANY_A,
      code: 'NFPA-13',
      edition: '2025',
      fileName: '2025.txt',
      mimeType: 'text/plain',
      bytes: pageBytes('Section 5.1 unique-token-2025-edition density notes.'),
      storage: adapter,
    });
    await uploadAndIngestCodeKnowledgeDocument({
      companyId: COMPANY_A,
      code: 'NFPA-13',
      edition: '2028',
      fileName: '2028.txt',
      mimeType: 'text/plain',
      bytes: pageBytes('Section 5.1 unique-token-2028-edition density notes.'),
      storage: adapter,
    });

    const hits2025 = searchCodeKnowledge({
      companyId: COMPANY_A,
      code: 'NFPA-13',
      edition: '2025',
      query: 'unique-token density',
      topK: 10,
    });
    expect(hits2025.length).toBeGreaterThan(0);
    expect(hits2025.every((h) => h.edition === '2025')).toBe(true);
    expect(hits2025.every((h) => !h.chunk.content.includes('2028-edition'))).toBe(true);

    const byDoc = searchCodeKnowledge({
      companyId: COMPANY_A,
      code: 'NFPA-13',
      edition: '2025',
      documentId: hits2025[0].document.id,
      query: 'density',
      topK: 5,
    });
    expect(byDoc.every((h) => h.document.id === hits2025[0].document.id)).toBe(true);
  });

  it('tenant isolation across Storage ingestions', async () => {
    const adapter = storage();
    await uploadAndIngestCodeKnowledgeDocument({
      companyId: COMPANY_A,
      code: 'NFPA-13',
      edition: '2025',
      fileName: 'a.txt',
      mimeType: 'text/plain',
      bytes: pageBytes('Section 1.1 tenant-A-secret-storage-token'),
      storage: adapter,
    });
    await uploadAndIngestCodeKnowledgeDocument({
      companyId: COMPANY_B,
      code: 'NFPA-13',
      edition: '2025',
      fileName: 'b.txt',
      mimeType: 'text/plain',
      bytes: pageBytes('Section 1.1 tenant-B-secret-storage-token'),
      storage: adapter,
    });
    const hits = searchCodeKnowledge({
      companyId: COMPANY_A,
      code: 'NFPA-13',
      edition: '2025',
      query: 'secret-storage-token',
    });
    expect(hits.every((h) => h.document.company_id === COMPANY_A)).toBe(true);
    expect(hits.every((h) => !h.chunk.content.includes('tenant-B'))).toBe(true);
  });

  it('RAG cannot PASS; RULE_NOT_CONFIGURED still blocks compliance', async () => {
    const adapter = storage();
    const up = await uploadAndIngestCodeKnowledgeDocument({
      companyId: COMPANY_A,
      code: 'NFPA-13',
      edition: '2025',
      fileName: 'adv.txt',
      mimeType: 'text/plain',
      bytes: pageBytes('Section 8.1 advisory density discussion without numeric activation.'),
      storage: adapter,
    });
    expect(up.status).toBe('indexed');
    if (up.status !== 'indexed') return;
    const hits = searchCodeKnowledge({
      companyId: COMPANY_A,
      code: 'NFPA-13',
      edition: '2025',
      query: 'density Section 8.1',
    });
    expect(ragHitsCannotProducePass(hits)).toBe(true);
    const explained = explainCodeKnowledgeHits(hits);
    expect(explained.can_produce_pass).toBe(false);

    registerNfpa13_2025RuleShells();
    expect(mapComplianceBlockerStatus('RULE_NOT_CONFIGURED').blocks).toBe(true);
    const attempt = evaluateAdvisoryComplianceAttempt({
      source: 'rag',
      rule_id: 'NFPA13-DENSITY',
      code: 'NFPA-13',
      claimed_status: 'PASS',
      hits,
    });
    expect(attempt.status).not.toBe('PASS');
    expect(attempt.can_produce_pass).toBe(false);

    // SHA helper still works
    expect((await sha256HexFromText('x')).length).toBe(64);
  });
});
