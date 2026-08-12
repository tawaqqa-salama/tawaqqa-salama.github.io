/**
 * Project-level code edition adoption.
 * A project keeps its adopted edition even when newer editions are registered.
 */

import {
  getCodeKnowledgeStore,
  nowIso,
  uid,
} from '@/lib/design-intelligence/code-knowledge/store';
import { getCodeEdition, registerCodeEdition } from '@/lib/design-intelligence/code-knowledge/registry';
import type { DiProjectCodeAdoption } from '@/lib/design-intelligence/code-knowledge/types';
import {
  buildNfpa13_2025ProjectAdoption,
  type Nfpa13EditionAdoption,
} from '@/lib/projects/compliance/nfpa/nfpa13-edition';
import type { ProjectEngineeringData } from '@/lib/types/project-reports';

export type AdoptCodeEditionInput = {
  companyId?: string | null;
  clientId: string;
  code: string;
  edition: string;
  title?: string | null;
  source_type?: string;
  source_document_id: string;
  verification_status?: string;
  platform_verification_status?: string;
  knowledge_document_id?: string | null;
  notes?: string | null;
};

/**
 * Store / replace project adoption for a code family.
 * Does not change other projects. Does not upgrade platform verification.
 */
export function adoptCodeEditionForProject(
  input: AdoptCodeEditionInput
): DiProjectCodeAdoption {
  const store = getCodeKnowledgeStore();
  const now = nowIso();
  const platformStatus =
    input.platform_verification_status === 'VERIFIED_OFFICIAL'
      ? 'NOT_VERIFIED_OFFICIAL' // cover / project source alone must not claim official
      : input.platform_verification_status || 'NOT_VERIFIED_OFFICIAL';

  // Ensure edition exists in registry (idempotent)
  const reg = registerCodeEdition({
    companyId: input.companyId ?? null,
    code: input.code,
    edition: input.edition,
    title: input.title,
    adoption_status: 'PROJECT_ADOPTED',
    verification_status: input.verification_status || 'PROJECT_COVER_IDENTIFIED',
    platform_verification_status: platformStatus,
    source_type: input.source_type || 'PROJECT_PROVIDED_DOCUMENT',
    source_document_id: input.source_document_id,
    status: 'available',
    idempotent: true,
  });
  const editionRow = reg.ok ? reg.edition : getCodeEdition(input.code, input.edition, input.companyId);

  const existing = store.adoptions.find(
    (a) =>
      !a.deleted_at &&
      a.client_id === input.clientId &&
      a.code === input.code &&
      a.adoption_status === 'PROJECT_ADOPTED'
  );

  if (existing) {
    // Same edition → idempotent update of metadata; different edition → explicit replace
    existing.edition = input.edition;
    existing.title = input.title ?? existing.title;
    existing.source_type = input.source_type || existing.source_type;
    existing.source_document_id = input.source_document_id;
    existing.verification_status =
      input.verification_status || existing.verification_status;
    existing.platform_verification_status = platformStatus;
    existing.knowledge_document_id =
      input.knowledge_document_id ?? existing.knowledge_document_id;
    existing.code_edition_id = editionRow?.id ?? existing.code_edition_id;
    existing.notes = input.notes ?? existing.notes;
    existing.updated_at = now;
    return existing;
  }

  const row: DiProjectCodeAdoption = {
    id: uid('pca'),
    company_id: input.companyId ?? null,
    client_id: input.clientId,
    code: input.code,
    edition: input.edition,
    code_edition_id: editionRow?.id ?? null,
    title: input.title ?? null,
    adoption_status: 'PROJECT_ADOPTED',
    source_type: input.source_type || 'PROJECT_PROVIDED_DOCUMENT',
    source_document_id: input.source_document_id,
    verification_status: input.verification_status || 'PROJECT_COVER_IDENTIFIED',
    platform_verification_status: platformStatus,
    knowledge_document_id: input.knowledge_document_id ?? null,
    adopted_at: now,
    notes: input.notes ?? null,
    created_at: now,
    updated_at: now,
    deleted_at: null,
  };
  store.adoptions.push(row);
  return row;
}

export function getProjectAdoptedEdition(
  clientId: string,
  code: string,
  companyId?: string | null
): DiProjectCodeAdoption | null {
  return (
    getCodeKnowledgeStore().adoptions.find((a) => {
      if (a.deleted_at) return false;
      if (a.client_id !== clientId || a.code !== code) return false;
      if (a.adoption_status !== 'PROJECT_ADOPTED') return false;
      if (
        companyId != null &&
        a.company_id != null &&
        a.company_id !== companyId
      ) {
        return false;
      }
      return true;
    }) || null
  );
}

/**
 * Adopt NFPA 13-2025 from project cover — preserves NOT_VERIFIED_OFFICIAL.
 */
export function adoptNfpa13_2025ForProject(params: {
  companyId?: string | null;
  clientId: string;
  source_document_id?: string;
}): DiProjectCodeAdoption {
  const meta = buildNfpa13_2025ProjectAdoption({
    source_document_id: params.source_document_id,
  });
  return adoptCodeEditionForProject({
    companyId: params.companyId,
    clientId: params.clientId,
    code: meta.code,
    edition: meta.edition,
    title: meta.title,
    source_type: meta.source_type,
    source_document_id: meta.source_document_id,
    verification_status: meta.verification_status,
    platform_verification_status: meta.platform_verification_status,
  });
}

/**
 * Resolve adopted code/edition into ProjectEngineeringData.compliance.nfpa13_numeric.
 * Canonical live data remains ProjectEngineeringData — this writes adoption metadata only.
 */
export function applyAdoptionToEngineeringData(
  data: ProjectEngineeringData,
  adoption: DiProjectCodeAdoption | Nfpa13EditionAdoption
): ProjectEngineeringData {
  const edition_adoption: Nfpa13EditionAdoption = {
    code: 'NFPA-13',
    edition: String(adoption.edition),
    title: adoption.title ?? null,
    adoption_status: 'PROJECT_ADOPTED',
    source_type: (adoption.source_type as Nfpa13EditionAdoption['source_type']) ||
      'PROJECT_PROVIDED_DOCUMENT',
    source_document_id: adoption.source_document_id,
    verification_status:
      (adoption.verification_status as Nfpa13EditionAdoption['verification_status']) ||
      'PROJECT_COVER_IDENTIFIED',
    platform_verification_status: 'NOT_VERIFIED_OFFICIAL',
    recorded_at: nowIso(),
  };

  const prev = data.compliance || {};
  const prevNum = prev.nfpa13_numeric || {};
  return {
    ...data,
    compliance: {
      ...prev,
      nfpa13_numeric: {
        ...prevNum,
        edition_adoption,
      },
    },
  };
}

/**
 * Resolve project's adopted edition for a code — never assumes newest available.
 */
export function resolveProjectCodeEdition(params: {
  clientId: string;
  code: string;
  companyId?: string | null;
  engineeringData?: ProjectEngineeringData | null;
}): { code: string; edition: string | null; source: string } {
  const fromStore = getProjectAdoptedEdition(
    params.clientId,
    params.code,
    params.companyId
  );
  if (fromStore) {
    return { code: fromStore.code, edition: fromStore.edition, source: 'di_project_code_adoptions' };
  }

  if (params.code === 'NFPA-13' && params.engineeringData?.compliance?.nfpa13_numeric?.edition_adoption) {
    const a = params.engineeringData.compliance.nfpa13_numeric.edition_adoption;
    if (a.adoption_status === 'PROJECT_ADOPTED' && a.edition) {
      return { code: a.code, edition: a.edition, source: 'project_engineering_data' };
    }
  }

  return { code: params.code, edition: null, source: 'none' };
}
