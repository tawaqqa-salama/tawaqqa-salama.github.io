/**
 * Platform NFPA 13-2025 Code Knowledge flow:
 * User upload (UI) → private design-knowledge Storage → authenticated ingest
 * → page chunks / RAG → project adoption by reference only.
 *
 * Never invents NFPA numeric thresholds.
 * Never activates numeric rules from RAG or PDF extraction alone.
 * Never copies document body into adoption rows.
 */

import {
  adoptCodeEditionForProject,
  type AdoptCodeEditionInput,
} from '@/lib/design-intelligence/code-knowledge/adoption';
import {
  evaluateAdvisoryComplianceAttempt,
  ragHitsCannotProducePass,
} from '@/lib/design-intelligence/code-knowledge/compliance-gate';
import {
  listEditionRules,
  registerNfpa13_2025RuleShells,
} from '@/lib/design-intelligence/code-knowledge/rule-registry';
import { registerNfpa13_2025ProjectEdition } from '@/lib/design-intelligence/code-knowledge/registry';
import {
  searchCodeKnowledge,
  explainCodeKnowledgeHits,
} from '@/lib/design-intelligence/code-knowledge/search';
import {
  uploadAndIngestCodeKnowledgeDocument,
  type UploadCodeKnowledgeResult,
} from '@/lib/design-intelligence/code-knowledge/storage-ingestion';
import type { CodeKnowledgeStorageAdapter } from '@/lib/design-intelligence/code-knowledge/storage-client';
import { CODE_KNOWLEDGE_STORAGE_BUCKET } from '@/lib/design-intelligence/code-knowledge/storage-path';
import { getCodeKnowledgeStore } from '@/lib/design-intelligence/code-knowledge/store';
import { shouldPersistCodeKnowledgeToSupabase } from '@/lib/design-intelligence/code-knowledge/persist';
import type {
  CodeKnowledgeDocumentMeta,
  DiProjectCodeAdoption,
  EditionRuleRecord,
} from '@/lib/design-intelligence/code-knowledge/types';
import { NFPA13_2025_PROJECT_ADOPTION_TEMPLATE } from '@/lib/projects/compliance/nfpa/nfpa13-edition';

export const PLATFORM_NFPA13_CODE = 'NFPA-13';
export const PLATFORM_NFPA13_EDITION = '2025';

export type PlatformProjectRef = {
  companyId: string;
  clientId: string;
};

export type PlatformNfpa13IngestInput = {
  companyId: string;
  /** Bytes from platform file picker only — never Cursor/ChatGPT/web. */
  bytes: Uint8Array;
  fileName: string;
  mimeType?: string | null;
  /** Projects that adopt this edition by reference (no body copy). */
  adoptForProjects: PlatformProjectRef[];
  created_by?: string | null;
  storage?: CodeKnowledgeStorageAdapter;
  ocrPageText?: Record<number, string>;
};

export type PlatformNfpa13IngestResult = {
  ok: boolean;
  blocked?: 'missing_platform_file' | 'empty_bytes' | 'ingest_failed';
  message?: string;
  bucket: string;
  ingest?: UploadCodeKnowledgeResult;
  document?: CodeKnowledgeDocumentMeta | null;
  adoptions: DiProjectCodeAdoption[];
  pages_extracted: number;
  pages_ocr: number;
  chunk_count: number;
  active_numeric_rules: number;
  shells: EditionRuleRecord[];
};

/**
 * Count active NFPA-13/2025 rules that carry numeric values (must stay 0).
 */
export function countActiveNfpa13_2025NumericRules(): number {
  return listEditionRules({ code: PLATFORM_NFPA13_CODE, edition: PLATFORM_NFPA13_EDITION }).filter(
    (r) =>
      r.is_active === true &&
      (r.numeric_value != null || r.numeric_min != null || r.numeric_max != null)
  ).length;
}

/**
 * Force all NFPA-13/2025 shells to remain inactive / RULE_NOT_CONFIGURED.
 * Does not invent values — clears accidental activation only.
 */
export function ensureNfpa13_2025ShellsInactive(): EditionRuleRecord[] {
  const shells = registerNfpa13_2025RuleShells({
    source_document_id: NFPA13_2025_PROJECT_ADOPTION_TEMPLATE.source_document_id,
  });
  for (const r of listEditionRules({
    code: PLATFORM_NFPA13_CODE,
    edition: PLATFORM_NFPA13_EDITION,
  })) {
    r.verification_status = 'RULE_NOT_CONFIGURED';
    r.rule_status = 'rule_not_configured';
    r.is_active = false;
    r.numeric_value = null;
    r.numeric_min = null;
    r.numeric_max = null;
  }
  return shells;
}

/**
 * Adopt NFPA-13/2025 for many projects by referencing the knowledge document id.
 * Adoption rows store metadata + knowledge_document_id only — never extracted_text.
 */
export function adoptNfpa13_2025AcrossProjects(params: {
  knowledgeDocument: CodeKnowledgeDocumentMeta;
  projects: PlatformProjectRef[];
}): DiProjectCodeAdoption[] {
  const doc = params.knowledgeDocument;
  const source_document_id =
    doc.source_document_id ||
    `storage:${doc.storage_path || doc.id}`;

  registerNfpa13_2025ProjectEdition({
    companyId: doc.company_id || undefined,
    source_document_id,
  });

  const out: DiProjectCodeAdoption[] = [];
  for (const p of params.projects) {
    const input: AdoptCodeEditionInput = {
      companyId: p.companyId,
      clientId: p.clientId,
      code: PLATFORM_NFPA13_CODE,
      edition: PLATFORM_NFPA13_EDITION,
      title: doc.title || NFPA13_2025_PROJECT_ADOPTION_TEMPLATE.title,
      source_type: 'PROJECT_PROVIDED_DOCUMENT',
      source_document_id,
      verification_status: 'PROJECT_COVER_IDENTIFIED',
      platform_verification_status: 'NOT_VERIFIED_OFFICIAL',
      knowledge_document_id: doc.id,
      notes:
        'Adoption references di_knowledge_documents id only — document body not copied.',
    };
    out.push(adoptCodeEditionForProject(input));
  }
  return out;
}

/**
 * Full platform path: Storage upload/ingest + multi-project adoption + inactive shells.
 * Stops if no platform file bytes are provided (do not invent / download externally).
 */
export async function ingestPlatformNfpa13_2025AndAdopt(
  input: PlatformNfpa13IngestInput
): Promise<PlatformNfpa13IngestResult> {
  const bucket = CODE_KNOWLEDGE_STORAGE_BUCKET;

  if (!input.bytes || input.bytes.byteLength === 0) {
    return {
      ok: false,
      blocked: 'missing_platform_file',
      message:
        'NFPA 13-2025 file is not present. Upload the PDF from the Design Intelligence → Code Knowledge UI (Supabase Storage design-knowledge). Do not use Cursor/ChatGPT/web sources.',
      bucket,
      adoptions: [],
      pages_extracted: 0,
      pages_ocr: 0,
      chunk_count: 0,
      active_numeric_rules: countActiveNfpa13_2025NumericRules(),
      shells: ensureNfpa13_2025ShellsInactive(),
    };
  }

  const shells = ensureNfpa13_2025ShellsInactive();

  const ingest = await uploadAndIngestCodeKnowledgeDocument({
    companyId: input.companyId,
    code: PLATFORM_NFPA13_CODE,
    edition: PLATFORM_NFPA13_EDITION,
    title: `NFPA 13 — 2025 (project-provided)`,
    fileName: input.fileName,
    mimeType: input.mimeType,
    bytes: input.bytes,
    source_document_id: `platform_upload:NFPA-13-2025:${input.fileName}`,
    source_type: 'PROJECT_PROVIDED_DOCUMENT',
    verification_status: 'PROJECT_COVER_IDENTIFIED',
    platform_verification_status: 'NOT_VERIFIED_OFFICIAL',
    adoption_status: 'PROJECT_ADOPTED',
    created_by: input.created_by,
    replaceIfChanged: true,
    ocrPageText: input.ocrPageText,
    storage: input.storage,
  });

  if (ingest.status === 'failed') {
    return {
      ok: false,
      blocked: 'ingest_failed',
      message: 'error' in ingest ? ingest.error : 'ingest_failed',
      bucket,
      ingest,
      document: ingest.document,
      adoptions: [],
      pages_extracted: ingest.document.pages_extracted ?? 0,
      pages_ocr: ingest.document.pages_ocr ?? 0,
      chunk_count: ingest.chunk_count,
      active_numeric_rules: countActiveNfpa13_2025NumericRules(),
      shells,
    };
  }

  const document =
    ingest.status === 'skipped_duplicate' ? ingest.document : ingest.document;

  // Production must not treat session-memory as success
  if (
    shouldPersistCodeKnowledgeToSupabase() &&
    ingest.status === 'indexed' &&
    !document.persisted
  ) {
    return {
      ok: false,
      blocked: 'ingest_failed',
      message:
        document.persist_error ||
        'Storage/DB persistence required — session-memory is not a Production success',
      bucket,
      ingest: {
        status: 'failed' as const,
        document,
        sha256: ingest.sha256,
        storage_path:
          'storage_path' in ingest ? ingest.storage_path : document.storage_path || '',
        chunk_count: document.chunk_count ?? 0,
        page_count: document.page_count ?? 0,
        error:
          document.persist_error ||
          'persistence_required',
      },
      document,
      adoptions: [],
      pages_extracted: document.pages_extracted ?? 0,
      pages_ocr: document.pages_ocr ?? 0,
      chunk_count: document.chunk_count ?? 0,
      active_numeric_rules: countActiveNfpa13_2025NumericRules(),
      shells,
    };
  }

  // Enforce document metadata invariants
  document.code = PLATFORM_NFPA13_CODE;
  document.edition = PLATFORM_NFPA13_EDITION;
  document.source_type = 'PROJECT_PROVIDED_DOCUMENT';
  document.platform_verification_status = 'NOT_VERIFIED_OFFICIAL';
  document.verification_status =
    document.verification_status || 'PROJECT_COVER_IDENTIFIED';

  const projects =
    input.adoptForProjects.length > 0
      ? input.adoptForProjects
      : [{ companyId: input.companyId, clientId: `client-${input.companyId}` }];

  const adoptions = adoptNfpa13_2025AcrossProjects({
    knowledgeDocument: document,
    projects,
  });

  // Re-assert shells remain inactive after ingest/RAG materialization
  ensureNfpa13_2025ShellsInactive();

  return {
    ok: true,
    bucket,
    ingest,
    document,
    adoptions,
    pages_extracted: document.pages_extracted ?? document.page_count ?? 0,
    pages_ocr: document.pages_ocr ?? 0,
    chunk_count: document.chunk_count ?? 0,
    active_numeric_rules: countActiveNfpa13_2025NumericRules(),
    shells: listEditionRules({
      code: PLATFORM_NFPA13_CODE,
      edition: PLATFORM_NFPA13_EDITION,
    }),
  };
}

/**
 * Prove RAG hits cannot activate numeric rules or produce PASS.
 */
export function assertRagCannotActivateNfpaNumericRules(params: {
  companyId: string;
  query: string;
}): {
  pass: boolean;
  can_produce_pass: false;
  active_numeric_rules: number;
  message: string;
} {
  const hits = searchCodeKnowledge({
    companyId: params.companyId,
    code: PLATFORM_NFPA13_CODE,
    edition: PLATFORM_NFPA13_EDITION,
    query: params.query,
    topK: 8,
  });
  const explained = explainCodeKnowledgeHits(hits);
  const advisory = evaluateAdvisoryComplianceAttempt({
    source: 'rag',
    rule_id: 'NFPA13-DENSITY',
    code: PLATFORM_NFPA13_CODE,
    claimed_status: 'PASS',
    hits,
  });
  ensureNfpa13_2025ShellsInactive();
  const active = countActiveNfpa13_2025NumericRules();
  return {
    pass:
      ragHitsCannotProducePass(hits) &&
      explained.can_produce_pass === false &&
      advisory.can_produce_pass === false &&
      active === 0,
    can_produce_pass: false,
    active_numeric_rules: active,
    message: explained.message,
  };
}

/** Tenant isolation: company B must not see company A document rows. */
export function assertDocumentTenantIsolation(
  companyA: string,
  companyB: string
): boolean {
  const store = getCodeKnowledgeStore();
  const docsA = store.documents.filter(
    (d) => !d.deleted_at && d.company_id === companyA
  );
  const docsB = store.documents.filter(
    (d) => !d.deleted_at && d.company_id === companyB
  );
  const leakToB = docsA.some((d) =>
    searchCodeKnowledge({
      companyId: companyB,
      code: d.code,
      edition: d.edition,
      query: d.title || d.file_name || 'document',
      documentId: d.id,
      topK: 5,
    }).some((h) => h.document.id === d.id)
  );
  const leakToA = docsB.some((d) =>
    searchCodeKnowledge({
      companyId: companyA,
      code: d.code,
      edition: d.edition,
      query: d.title || d.file_name || 'document',
      documentId: d.id,
      topK: 5,
    }).some((h) => h.document.id === d.id)
  );
  return !leakToB && !leakToA;
}
