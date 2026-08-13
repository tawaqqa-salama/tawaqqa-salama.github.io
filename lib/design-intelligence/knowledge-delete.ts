/**
 * Soft-delete Knowledge Base / Code Knowledge documents.
 *
 * Order:
 * 1) Guard: company isolation + in-use (adoptions / code editions)
 * 2) Hard-delete chunks (di_knowledge_chunks)
 * 3) Hard-delete indexing jobs by document_id
 * 4) Remove Storage object (storage_bucket + storage_path)
 * 5) Soft-delete document row (deleted_at = now, chunk_count = 0)
 *
 * Duplicate deletes never remove the canonical sibling automatically.
 */

import { isDemoMode, isSupabaseConfigured, supabase } from '@/lib/supabase';
import { getCodeKnowledgeStore, nowIso } from '@/lib/design-intelligence/code-knowledge/store';
import {
  getDefaultCodeKnowledgeStorage,
  type CodeKnowledgeStorageAdapter,
} from '@/lib/design-intelligence/code-knowledge/storage-client';
import { CODE_KNOWLEDGE_STORAGE_BUCKET } from '@/lib/design-intelligence/code-knowledge/storage-path';
import { isUuid } from '@/lib/design-intelligence/code-knowledge/persist';
import type { CodeKnowledgeDocumentMeta } from '@/lib/design-intelligence/code-knowledge/types';
import type { DiKnowledgeDocument } from '@/lib/design-intelligence/types';
import {
  applyLocalKnowledgeDocumentSoftDelete,
  findLocalKnowledgeDocument,
  listLocalKnowledgeDocumentsIncludingDeleted,
} from '@/lib/design-intelligence/knowledge-base';

export type KnowledgeDeleteFailureCode =
  | 'document_missing'
  | 'company_mismatch'
  | 'document_in_use'
  | 'canonical_protected'
  | 'not_a_duplicate'
  | 'storage_delete_failed'
  | 'chunks_delete_failed'
  | 'jobs_delete_failed'
  | 'soft_delete_failed';

export type KnowledgeDeleteResult =
  | {
      ok: true;
      documentId: string;
      softDeleted: true;
      chunksRemoved: number;
      jobsRemoved: number;
      storageRemoved: boolean;
      mode: 'duplicate' | 'standard';
    }
  | {
      ok: false;
      code: KnowledgeDeleteFailureCode;
      error: string;
      documentId?: string;
    };

export type KnowledgeDocumentRef = {
  id: string;
  company_id?: string | null;
  sha256?: string | null;
  content_sha256?: string | null;
  storage_bucket?: string | null;
  storage_path?: string | null;
  created_at?: string | null;
  indexed_at?: string | null;
  index_status?: string | null;
  chunk_count?: number | null;
  deleted_at?: string | null;
  code_edition_id?: string | null;
  edition_id?: string | null;
};

function contentHash(doc: KnowledgeDocumentRef): string | null {
  const h = (doc.sha256 || doc.content_sha256 || '').trim().toLowerCase();
  return h || null;
}

function sameCompany(
  a: string | null | undefined,
  b: string | null | undefined
): boolean {
  if (!a || !b) return false;
  return a === b;
}

/** In-memory + optional Supabase: document linked to adoption or code edition. */
export async function findKnowledgeDocumentUsage(
  documentId: string,
  companyId: string
): Promise<{ inUse: boolean; reasons: string[] }> {
  const reasons: string[] = [];
  const store = getCodeKnowledgeStore();

  for (const a of store.adoptions) {
    if (
      !a.deleted_at &&
      a.knowledge_document_id === documentId &&
      (!a.company_id || a.company_id === companyId)
    ) {
      reasons.push('di_project_code_adoptions');
      break;
    }
  }
  for (const e of store.editions) {
    if (
      !e.deleted_at &&
      e.knowledge_document_id === documentId &&
      (!e.company_id || e.company_id === companyId)
    ) {
      reasons.push('di_code_editions');
      break;
    }
  }

  if (isSupabaseConfigured && !isDemoMode && isUuid(documentId)) {
    const { data: adoptions } = await supabase
      .from('di_project_code_adoptions')
      .select('id')
      .eq('knowledge_document_id', documentId)
      .is('deleted_at', null)
      .limit(1);
    if (adoptions?.length) {
      if (!reasons.includes('di_project_code_adoptions')) {
        reasons.push('di_project_code_adoptions');
      }
    }
    const { data: editions } = await supabase
      .from('di_code_editions')
      .select('id')
      .eq('knowledge_document_id', documentId)
      .is('deleted_at', null)
      .limit(1);
    if (editions?.length) {
      if (!reasons.includes('di_code_editions')) {
        reasons.push('di_code_editions');
      }
    }
  }

  return { inUse: reasons.length > 0, reasons };
}

/**
 * Canonical among same-company same-sha256 siblings:
 * 1) Linked to adoption/edition
 * 2) Indexed with most chunks
 * 3) Earliest created_at
 */
export function resolveCanonicalDocumentId(
  candidates: KnowledgeDocumentRef[]
): string | null {
  const active = candidates.filter((d) => !d.deleted_at);
  if (!active.length) return null;

  const store = getCodeKnowledgeStore();
  const linked = active.find((d) => {
    const byAdoption = store.adoptions.some(
      (a) => !a.deleted_at && a.knowledge_document_id === d.id
    );
    const byEdition = store.editions.some(
      (e) => !e.deleted_at && e.knowledge_document_id === d.id
    );
    // Only real FK usage — code_edition_id alone is normal for all CK docs
    return byAdoption || byEdition;
  });
  if (linked) return linked.id;

  const indexed = [...active].sort((a, b) => {
    const ac = a.chunk_count || 0;
    const bc = b.chunk_count || 0;
    if (bc !== ac) return bc - ac;
    const ai = a.index_status === 'indexed' ? 1 : 0;
    const bi = b.index_status === 'indexed' ? 1 : 0;
    if (bi !== ai) return bi - ai;
    return String(a.created_at || '').localeCompare(String(b.created_at || ''));
  });
  return indexed[0]?.id || null;
}

export function listSha256Duplicates(
  document: KnowledgeDocumentRef,
  pool: KnowledgeDocumentRef[]
): KnowledgeDocumentRef[] {
  const hash = contentHash(document);
  if (!hash || !document.company_id) return [];
  return pool.filter(
    (d) =>
      !d.deleted_at &&
      d.id !== document.id &&
      sameCompany(d.company_id, document.company_id) &&
      contentHash(d) === hash
  );
}

export function isDeletableDuplicate(
  document: KnowledgeDocumentRef,
  pool: KnowledgeDocumentRef[]
): { ok: true; canonicalId: string } | { ok: false; code: KnowledgeDeleteFailureCode; error: string } {
  const siblings = listSha256Duplicates(document, pool);
  if (!siblings.length) {
    return {
      ok: false,
      code: 'not_a_duplicate',
      error: 'Document is not a sha256 duplicate of another company document',
    };
  }
  const group = [document, ...siblings];
  const canonicalId = resolveCanonicalDocumentId(group);
  if (!canonicalId) {
    return { ok: false, code: 'not_a_duplicate', error: 'No canonical sibling resolved' };
  }
  if (canonicalId === document.id) {
    return {
      ok: false,
      code: 'canonical_protected',
      error: 'Cannot delete canonical document; remove a duplicate instead',
    };
  }
  return { ok: true, canonicalId };
}

function collectDocumentPool(companyId: string): KnowledgeDocumentRef[] {
  const fromCk = getCodeKnowledgeStore().documents.filter(
    (d) => !d.deleted_at && d.company_id === companyId
  );
  const fromKb = listLocalKnowledgeDocumentsIncludingDeleted().filter(
    (d) => !d.deleted_at && d.company_id === companyId
  );
  const byId = new Map<string, KnowledgeDocumentRef>();
  for (const d of [...fromCk, ...fromKb]) byId.set(d.id, d);
  return [...byId.values()];
}

function findDocument(
  documentId: string
): KnowledgeDocumentRef | null {
  const ck = getCodeKnowledgeStore().documents.find((d) => d.id === documentId);
  if (ck) return ck;
  return findLocalKnowledgeDocument(documentId);
}

async function removeChunks(documentId: string, companyId: string): Promise<number> {
  const store = getCodeKnowledgeStore();
  const before = store.chunks.length;
  store.chunks = store.chunks.filter((c) => c.document_id !== documentId);
  const localRemoved = before - store.chunks.length;

  // Knowledge Base local chunks
  const kbRemoved = applyLocalKnowledgeDocumentSoftDelete(documentId, {
    removeChunksOnly: true,
  }).chunksRemoved;

  let remoteRemoved = 0;
  if (isSupabaseConfigured && !isDemoMode && isUuid(documentId)) {
    let q = supabase.from('di_knowledge_chunks').delete().eq('document_id', documentId);
    if (isUuid(companyId)) q = q.eq('company_id', companyId);
    const { data, error } = await q.select('id');
    if (error) throw new Error(`chunks_delete_failed: ${error.message}`);
    remoteRemoved = data?.length || 0;
  }
  return Math.max(localRemoved + kbRemoved, remoteRemoved);
}

async function removeJobs(documentId: string): Promise<number> {
  const store = getCodeKnowledgeStore();
  const before = store.jobs.length;
  store.jobs = store.jobs.filter((j) => j.document_id !== documentId);
  let removed = before - store.jobs.length;

  if (typeof window !== 'undefined') {
    try {
      const key = 'tawaqqa_di_indexing_jobs_v1';
      const jobs = JSON.parse(localStorage.getItem(key) || '[]') as Array<{
        document_id: string;
      }>;
      const next = jobs.filter((j) => j.document_id !== documentId);
      removed += jobs.length - next.length;
      localStorage.setItem(key, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }

  if (isSupabaseConfigured && !isDemoMode && isUuid(documentId)) {
    const { data, error } = await supabase
      .from('di_indexing_jobs')
      .delete()
      .eq('document_id', documentId)
      .select('id');
    if (error) throw new Error(`jobs_delete_failed: ${error.message}`);
    removed = Math.max(removed, data?.length || 0);
  }
  return removed;
}

async function removeStorageObject(
  doc: KnowledgeDocumentRef,
  storage: CodeKnowledgeStorageAdapter
): Promise<boolean> {
  if (!doc.storage_path) return false;
  const bucket = doc.storage_bucket || CODE_KNOWLEDGE_STORAGE_BUCKET;
  const result = await storage.remove(bucket, doc.storage_path);
  if (!result.ok && result.error && result.error !== 'not_found') {
    throw new Error(`storage_delete_failed: ${result.error}`);
  }
  return result.ok || result.error === 'not_found';
}

async function softDeleteDocumentRow(
  documentId: string,
  companyId: string
): Promise<void> {
  const now = nowIso();
  const store = getCodeKnowledgeStore();
  const ck = store.documents.find((d) => d.id === documentId);
  if (ck) {
    if (ck.company_id && ck.company_id !== companyId) {
      throw new Error('company_mismatch');
    }
    ck.deleted_at = now;
    ck.chunk_count = 0;
    ck.index_status = 'failed';
    ck.ingestion_status = 'failed';
    ck.updated_at = now;
    ck.extracted_text = null;
    ck.page_texts = null;
  }

  applyLocalKnowledgeDocumentSoftDelete(documentId, {
    companyId,
    deletedAt: now,
  });

  if (isSupabaseConfigured && !isDemoMode && isUuid(documentId)) {
    let q = supabase
      .from('di_knowledge_documents')
      .update({
        deleted_at: now,
        chunk_count: 0,
        updated_at: now,
        index_status: 'failed',
        ingestion_status: 'failed',
      })
      .eq('id', documentId)
      .is('deleted_at', null);
    if (isUuid(companyId)) q = q.eq('company_id', companyId);
    const { data, error } = await q.select('id');
    if (error) throw new Error(`soft_delete_failed: ${error.message}`);
    if (!data?.length && !ck) {
      // May already be soft-deleted or RLS blocked
      const existing = await supabase
        .from('di_knowledge_documents')
        .select('id, company_id, deleted_at')
        .eq('id', documentId)
        .maybeSingle();
      if (existing.data?.deleted_at) return;
      if (existing.data && existing.data.company_id && existing.data.company_id !== companyId) {
        throw new Error('company_mismatch');
      }
      if (!existing.data && !ck) throw new Error('document_missing');
    }
  }
}

export type DeleteKnowledgeDocumentInput = {
  documentId: string;
  companyId: string;
  /** When true, only allow if sha256 duplicate of another company doc and not canonical. */
  duplicateOnly?: boolean;
  storage?: CodeKnowledgeStorageAdapter;
  /** Skip confirmation — UI must confirm before calling. */
  confirmed: boolean;
};

/**
 * Soft-delete a knowledge document after caller confirmation.
 */
export async function deleteKnowledgeDocument(
  input: DeleteKnowledgeDocumentInput
): Promise<KnowledgeDeleteResult> {
  if (!input.confirmed) {
    return {
      ok: false,
      code: 'document_missing',
      error: 'Delete requires explicit confirmation',
      documentId: input.documentId,
    };
  }
  if (!input.companyId) {
    return {
      ok: false,
      code: 'company_mismatch',
      error: 'company_id required',
      documentId: input.documentId,
    };
  }

  const doc = findDocument(input.documentId);
  if (!doc || doc.deleted_at) {
    return {
      ok: false,
      code: 'document_missing',
      error: 'Document not found',
      documentId: input.documentId,
    };
  }

  if (!sameCompany(doc.company_id, input.companyId)) {
    return {
      ok: false,
      code: 'company_mismatch',
      error: 'Document belongs to another company',
      documentId: input.documentId,
    };
  }

  const usage = await findKnowledgeDocumentUsage(input.documentId, input.companyId);
  if (usage.inUse) {
    return {
      ok: false,
      code: 'document_in_use',
      error: `Document is in use — unlink from ${usage.reasons.join(', ')} first`,
      documentId: input.documentId,
    };
  }

  const pool = collectDocumentPool(input.companyId);
  if (input.duplicateOnly) {
    const dup = isDeletableDuplicate(doc, pool);
    if (!dup.ok) {
      return { ok: false, code: dup.code, error: dup.error, documentId: input.documentId };
    }
  }

  const storage = input.storage || getDefaultCodeKnowledgeStorage();

  try {
    const chunksRemoved = await removeChunks(input.documentId, input.companyId);
    const jobsRemoved = await removeJobs(input.documentId);
    const storageRemoved = await removeStorageObject(doc, storage);
    await softDeleteDocumentRow(input.documentId, input.companyId);

    return {
      ok: true,
      documentId: input.documentId,
      softDeleted: true,
      chunksRemoved,
      jobsRemoved,
      storageRemoved,
      mode: input.duplicateOnly ? 'duplicate' : 'standard',
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const code: KnowledgeDeleteFailureCode = message.startsWith('storage_delete_failed')
      ? 'storage_delete_failed'
      : message.startsWith('chunks_delete_failed')
        ? 'chunks_delete_failed'
        : message.startsWith('jobs_delete_failed')
          ? 'jobs_delete_failed'
          : message.startsWith('soft_delete_failed') || message === 'company_mismatch'
            ? message === 'company_mismatch'
              ? 'company_mismatch'
              : 'soft_delete_failed'
            : 'soft_delete_failed';
    return {
      ok: false,
      code,
      error: message,
      documentId: input.documentId,
    };
  }
}

/** UI helper: whether Delete duplicate should be enabled. */
export function documentHasSha256Duplicate(
  document: KnowledgeDocumentRef,
  companyId: string
): boolean {
  if (!sameCompany(document.company_id, companyId)) return false;
  const pool = collectDocumentPool(companyId);
  const check = isDeletableDuplicate(document, pool);
  return check.ok;
}

export function toKnowledgeDocumentRef(
  doc: CodeKnowledgeDocumentMeta | DiKnowledgeDocument
): KnowledgeDocumentRef {
  return {
    id: doc.id,
    company_id: doc.company_id,
    sha256: doc.sha256,
    content_sha256: 'content_sha256' in doc ? doc.content_sha256 : doc.sha256,
    storage_bucket: doc.storage_bucket,
    storage_path: doc.storage_path,
    created_at: doc.created_at,
    indexed_at: doc.indexed_at,
    index_status: doc.index_status,
    chunk_count: doc.chunk_count,
    deleted_at: doc.deleted_at,
    code_edition_id:
      'code_edition_id' in doc ? (doc as CodeKnowledgeDocumentMeta).code_edition_id : null,
    edition_id: 'edition_id' in doc ? (doc as CodeKnowledgeDocumentMeta).edition_id : null,
  };
}
