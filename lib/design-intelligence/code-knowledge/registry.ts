/**
 * Code / edition registry — multi-edition, no special-case hardcoding.
 * Does not auto-activate editions for projects.
 */

import {
  getCodeKnowledgeStore,
  nowIso,
  uid,
} from '@/lib/design-intelligence/code-knowledge/store';
import type {
  CodeEditionStatus,
  DiCodeEdition,
} from '@/lib/design-intelligence/code-knowledge/types';

export type RegisterCodeEditionInput = {
  companyId?: string | null;
  code: string;
  edition: string;
  title?: string | null;
  adoption_status?: string;
  verification_status?: string;
  platform_verification_status?: string;
  source_type?: string | null;
  source_document_id?: string | null;
  status?: CodeEditionStatus | string;
  notes?: string | null;
  /** When true, return existing row instead of rejecting duplicate */
  idempotent?: boolean;
};

export function listCodeEditions(filters?: {
  companyId?: string | null;
  code?: string;
  includeDeleted?: boolean;
}): DiCodeEdition[] {
  const store = getCodeKnowledgeStore();
  return store.editions.filter((e) => {
    if (!filters?.includeDeleted && e.deleted_at) return false;
    if (filters?.code && e.code !== filters.code) return false;
    if (filters?.companyId != null) {
      // Tenant isolation: company rows + optional platform (null)
      if (e.company_id != null && e.company_id !== filters.companyId) return false;
    }
    return true;
  });
}

export function getCodeEdition(
  code: string,
  edition: string,
  companyId?: string | null
): DiCodeEdition | null {
  return (
    listCodeEditions({ companyId: companyId ?? undefined, code }).find(
      (e) => e.edition === edition
    ) || null
  );
}

/**
 * Register a code edition. Duplicate (company, code, edition) is rejected
 * unless idempotent=true (returns existing).
 */
export function registerCodeEdition(
  input: RegisterCodeEditionInput
): { ok: true; edition: DiCodeEdition; created: boolean } | { ok: false; error: string; edition?: DiCodeEdition } {
  const code = String(input.code || '').trim();
  const edition = String(input.edition || '').trim();
  if (!code || !edition) {
    return { ok: false, error: 'code_and_edition_required' };
  }

  const companyId = input.companyId ?? null;
  const existing = getCodeKnowledgeStore().editions.find(
    (e) =>
      !e.deleted_at &&
      e.code === code &&
      e.edition === edition &&
      (e.company_id ?? null) === companyId
  );

  if (existing) {
    if (input.idempotent !== false) {
      return { ok: true, edition: existing, created: false };
    }
    return { ok: false, error: 'duplicate_edition', edition: existing };
  }

  const now = nowIso();
  const row: DiCodeEdition = {
    id: uid('ced'),
    company_id: companyId,
    code,
    edition,
    title: input.title ?? null,
    adoption_status: input.adoption_status || 'NOT_ADOPTED',
    verification_status: input.verification_status || 'UNVERIFIED',
    platform_verification_status:
      input.platform_verification_status || 'NOT_VERIFIED_OFFICIAL',
    source_type: input.source_type ?? null,
    source_document_id: input.source_document_id ?? null,
    status: input.status || 'draft',
    notes: input.notes ?? null,
    created_at: now,
    updated_at: now,
    deleted_at: null,
  };

  // Never silently claim official platform verification from registration alone
  if (row.platform_verification_status === 'VERIFIED_OFFICIAL' && !input.platform_verification_status) {
    row.platform_verification_status = 'NOT_VERIFIED_OFFICIAL';
  }

  getCodeKnowledgeStore().editions.push(row);
  return { ok: true, edition: row, created: true };
}

/**
 * Advance edition through Code Update Manager workflow.
 * Never auto-changes project adoptions.
 */
export function advanceCodeEditionStatus(
  editionId: string,
  next: CodeEditionStatus
): DiCodeEdition | null {
  const row = getCodeKnowledgeStore().editions.find((e) => e.id === editionId && !e.deleted_at);
  if (!row) return null;
  const allowed: Record<string, CodeEditionStatus[]> = {
    draft: ['indexed', 'superseded'],
    indexed: ['pending_engineer_review', 'draft', 'superseded'],
    pending_engineer_review: ['approved', 'indexed', 'superseded'],
    approved: ['available', 'superseded'],
    available: ['active', 'superseded'],
    active: ['superseded'],
    superseded: [],
  };
  const from = String(row.status);
  if (!(allowed[from] || []).includes(next) && from !== next) {
    return null;
  }
  row.status = next;
  row.updated_at = nowIso();
  return row;
}

/**
 * Register NFPA 13-2025 from project cover metadata — does NOT upgrade platform verification.
 */
export function registerNfpa13_2025ProjectEdition(params?: {
  companyId?: string | null;
  source_document_id?: string;
}): { ok: true; edition: DiCodeEdition; created: boolean } | { ok: false; error: string } {
  return registerCodeEdition({
    companyId: params?.companyId ?? null,
    code: 'NFPA-13',
    edition: '2025',
    title: 'Standard for the Installation of Sprinkler Systems',
    adoption_status: 'PROJECT_ADOPTED',
    verification_status: 'PROJECT_COVER_IDENTIFIED',
    platform_verification_status: 'NOT_VERIFIED_OFFICIAL',
    source_type: 'PROJECT_PROVIDED_DOCUMENT',
    source_document_id:
      params?.source_document_id || 'project_provided:NFPA-13-2025-cover',
    status: 'available',
    idempotent: true,
  });
}

export function listAvailableCodes(companyId?: string | null): string[] {
  const set = new Set(
    listCodeEditions({ companyId: companyId ?? undefined }).map((e) => e.code)
  );
  return [...set].sort();
}
