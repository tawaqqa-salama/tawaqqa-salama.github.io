import { supabase } from '@/lib/supabase';
import { getStage6ApprovalBlockers } from '@/lib/projects/stage6-contract';
import type { CanonicalProjectIdentity } from '@/lib/types/client';
import type { ProjectEngineeringData } from '@/lib/types/project-reports';

export const RELATIONAL_CORRESPONDENCE_STATUS_LABELS = {
  draft: 'مسودة',
  preparing: 'قيد الإعداد',
  ready: 'جاهز للاعتماد',
  approved: 'معتمد',
} as const;

export const RELATIONAL_CORRESPONDENCE_TYPE_LABELS = {
  engineering_delivery: 'تسليم الأعمال الهندسية',
  cd_cover_letter: 'خطاب الدفاع المدني',
} as const;

export type RelationalCorrespondenceStatus = keyof typeof RELATIONAL_CORRESPONDENCE_STATUS_LABELS;
export type RelationalCorrespondenceType = keyof typeof RELATIONAL_CORRESPONDENCE_TYPE_LABELS;

export type ReadOnlyCorrespondenceRecord = {
  /** Internal correspondence handle for attachment metadata RPCs; never render it. */
  id: string;
  correspondenceType: RelationalCorrespondenceType;
  documentStatus: RelationalCorrespondenceStatus;
  subject: string;
  referenceNumber: string | null;
  correspondenceDate: string | null;
  recipientName: string | null;
  responsibleEngineerName: string | null;
  responsibleManagerName: string | null;
  approvedAt: string | null;
  updatedAt: string | null;
};

export type ReadOnlyCorrespondenceWorkspaceLoad =
  | {
      kind: 'ready';
      records: ReadOnlyCorrespondenceRecord[];
    }
  | {
      kind: 'identity-unavailable';
      records: [];
    }
  | {
      kind: 'load-error';
      records: [];
    };

export type LegacyStage6DocumentKey = 'engineering_delivery' | 'cd_cover_letter';

export type LegacyStage6DocumentSummary = {
  key: LegacyStage6DocumentKey;
  label: string;
  provenanceLabel: 'النموذج الحالي';
  available: boolean;
  status: string | null;
  complete: boolean;
  referenceNumber: string | null;
  documentDate: string | null;
};

type CorrespondenceRow = {
  id: string;
  correspondence_type: string;
  document_status: string;
  subject: string;
  reference_number: string | null;
  correspondence_date: string | null;
  recipient_name: string | null;
  responsible_engineer_name: string | null;
  responsible_manager_name: string | null;
  approved_at: string | null;
  updated_at: string | null;
};

function text(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized || null;
}

function isCorrespondenceType(value: string): value is RelationalCorrespondenceType {
  return value === 'engineering_delivery' || value === 'cd_cover_letter';
}

function isCorrespondenceStatus(value: string): value is RelationalCorrespondenceStatus {
  return value === 'draft' || value === 'preparing' || value === 'ready' || value === 'approved';
}

function normalizeRecord(row: CorrespondenceRow): ReadOnlyCorrespondenceRecord | null {
  if (!isCorrespondenceType(row.correspondence_type) || !isCorrespondenceStatus(row.document_status)) {
    return null;
  }

  const id = text(row.id);
  if (!id) return null;

  return {
    id,
    correspondenceType: row.correspondence_type,
    documentStatus: row.document_status,
    subject: text(row.subject) || '—',
    referenceNumber: text(row.reference_number),
    correspondenceDate: text(row.correspondence_date),
    recipientName: text(row.recipient_name),
    responsibleEngineerName: text(row.responsible_engineer_name),
    responsibleManagerName: text(row.responsible_manager_name),
    approvedAt: text(row.approved_at),
    updatedAt: text(row.updated_at),
  };
}

/**
 * Reads the existing relational correspondence projection for the canonical
 * client/project pair. This function is intentionally read-only: page viewing
 * never creates, adopts, updates, approves, or synchronizes correspondence.
 */
export async function loadReadOnlyCorrespondenceWorkspace(
  clientId: string,
  identity: CanonicalProjectIdentity | null | undefined
): Promise<ReadOnlyCorrespondenceWorkspaceLoad> {
  const normalizedClientId = clientId.trim();
  if (
    !normalizedClientId ||
    !identity ||
    identity.clientId !== normalizedClientId ||
    !identity.projectId
  ) {
    return { kind: 'identity-unavailable', records: [] };
  }

  try {
    const { data, error } = await supabase
      .from('project_correspondences')
      .select(
        'id, correspondence_type, document_status, subject, reference_number, correspondence_date, recipient_name, responsible_engineer_name, responsible_manager_name, approved_at, updated_at'
      )
      .eq('project_id', identity.projectId)
      .eq('client_id', normalizedClientId)
      .order('correspondence_date', { ascending: false, nullsFirst: false })
      .order('updated_at', { ascending: false, nullsFirst: false });

    if (error || !Array.isArray(data)) {
      return { kind: 'load-error', records: [] };
    }

    return {
      kind: 'ready',
      records: (data as CorrespondenceRow[])
        .map(normalizeRecord)
        .filter((record): record is ReadOnlyCorrespondenceRecord => record !== null),
    };
  } catch {
    return { kind: 'load-error', records: [] };
  }
}

function legacySummary(params: {
  key: LegacyStage6DocumentKey;
  label: string;
  document: unknown;
  complete: boolean;
  referenceNumber: unknown;
  documentDate: unknown;
}): LegacyStage6DocumentSummary {
  const document = params.document && typeof params.document === 'object'
    ? (params.document as Record<string, unknown>)
    : null;

  return {
    key: params.key,
    label: params.label,
    provenanceLabel: 'النموذج الحالي',
    available: document !== null,
    status: text(document?.status),
    complete: document !== null && params.complete,
    referenceNumber: text(params.referenceNumber),
    documentDate: text(params.documentDate),
  };
}

/**
 * Derives display-only legacy status from the already-loaded canonical payload.
 * It deliberately does not write, adopt, merge, or map a legacy document to a
 * relational row.
 */
export function buildLegacyStage6DocumentSummaries(
  data: Pick<ProjectEngineeringData, 'engineering_delivery' | 'cd_cover_letter'>
): LegacyStage6DocumentSummary[] {
  const incompleteCodes = new Set(getStage6ApprovalBlockers(data).map((blocker) => blocker.code));
  const delivery = data.engineering_delivery;
  const cover = data.cd_cover_letter;

  return [
    legacySummary({
      key: 'engineering_delivery',
      label: 'تسليم الأعمال الهندسية',
      document: delivery,
      complete: !incompleteCodes.has('STAGE6_ENGINEERING_DELIVERY_INCOMPLETE'),
      referenceNumber: delivery?.outgoing_number,
      documentDate: delivery?.delivery_date,
    }),
    legacySummary({
      key: 'cd_cover_letter',
      label: 'خطاب الدفاع المدني',
      document: cover,
      complete: !incompleteCodes.has('STAGE6_CD_COVER_LETTER_INCOMPLETE'),
      referenceNumber: cover?.outgoing_number,
      documentDate: cover?.letter_date,
    }),
  ];
}
