import { supabase } from '@/lib/supabase';
import type { CanonicalProjectIdentity } from '@/lib/types/client';

const STAGE6_TYPES = ['engineering_delivery', 'cd_cover_letter'] as const;
type Stage6Type = (typeof STAGE6_TYPES)[number];

type CorrespondenceRow = {
  correspondence_type?: unknown;
  lock_version?: unknown;
};

type CanonicalLiveRow = {
  updated_at?: unknown;
};

export type Stage6ApprovalErrorCode =
  | 'IDENTITY_UNAVAILABLE'
  | 'CANONICAL_REVISION_UNAVAILABLE'
  | 'TENANT_ACCESS_DENIED'
  | 'PROJECT_PERMISSION_DENIED'
  | 'PROJECT_CLIENT_MISMATCH'
  | 'PROJECT_IDENTITY_UNAVAILABLE'
  | 'CANONICAL_ENGINEERING_STATE_REQUIRED'
  | 'CANONICAL_STALE_REVISION'
  | 'CORRESPONDENCE_STALE_VERSION'
  | 'CORRESPONDENCE_SINGLETON_CONFLICT'
  | 'STAGE6_APPROVAL_BLOCKED'
  | 'WORKFLOW_STATE_CONFLICT'
  | 'CORRESPONDENCE_STATE_DIVERGENCE'
  | 'NETWORK_OR_RPC_FAILURE';

export type Stage6ApprovalResult =
  | {
      ok: true;
      approvedAt: string | null;
      engineeringDeliveryLockVersion: number;
      cdCoverLetterLockVersion: number;
    }
  | { ok: false; code: Stage6ApprovalErrorCode };

type ApprovalSnapshot = {
  canonicalUpdatedAt: string;
  engineeringDeliveryLockVersion: number | null;
  cdCoverLetterLockVersion: number | null;
};

function knownApprovalErrorCode(error: unknown): Stage6ApprovalErrorCode {
  const raw =
    typeof error === 'object' && error && 'message' in error
      ? String((error as { message?: unknown }).message || '')
      : error instanceof Error
        ? error.message
        : '';

  const codes: Stage6ApprovalErrorCode[] = [
    'TENANT_ACCESS_DENIED',
    'PROJECT_PERMISSION_DENIED',
    'PROJECT_CLIENT_MISMATCH',
    'PROJECT_IDENTITY_UNAVAILABLE',
    'CANONICAL_ENGINEERING_STATE_REQUIRED',
    'CANONICAL_STALE_REVISION',
    'CORRESPONDENCE_STALE_VERSION',
    'CORRESPONDENCE_SINGLETON_CONFLICT',
    'STAGE6_APPROVAL_BLOCKED',
    'WORKFLOW_STATE_CONFLICT',
    'CORRESPONDENCE_STATE_DIVERGENCE',
  ];

  return codes.find((code) => raw.includes(code)) || 'NETWORK_OR_RPC_FAILURE';
}

function exactLockVersion(row: CorrespondenceRow | undefined): number | null | undefined {
  if (!row) return null;
  const value = Number(row.lock_version);
  return Number.isInteger(value) && value >= 0 ? value : undefined;
}

async function readApprovalSnapshot(params: {
  clientId: string;
  projectId: string;
}): Promise<{ ok: true; snapshot: ApprovalSnapshot } | { ok: false; code: Stage6ApprovalErrorCode }> {
  try {
    const { data: live, error: liveError } = await supabase
      .from('project_engineering_live')
      .select('updated_at')
      .eq('client_id', params.clientId)
      .maybeSingle();

    if (liveError) return { ok: false, code: 'NETWORK_OR_RPC_FAILURE' };
    const canonicalUpdatedAt = String((live as CanonicalLiveRow | null)?.updated_at || '').trim();
    if (!canonicalUpdatedAt) return { ok: false, code: 'CANONICAL_REVISION_UNAVAILABLE' };

    const { data: correspondences, error: correspondenceError } = await supabase
      .from('project_correspondences')
      .select('correspondence_type, lock_version')
      .eq('project_id', params.projectId)
      .eq('client_id', params.clientId)
      .eq('direction', 'outgoing')
      .in('correspondence_type', [...STAGE6_TYPES]);

    if (correspondenceError || !Array.isArray(correspondences)) {
      return { ok: false, code: 'NETWORK_OR_RPC_FAILURE' };
    }

    const rowsByType = new Map<Stage6Type, CorrespondenceRow>();
    for (const row of correspondences as CorrespondenceRow[]) {
      const type = row.correspondence_type;
      if (type !== 'engineering_delivery' && type !== 'cd_cover_letter') {
        return { ok: false, code: 'CORRESPONDENCE_SINGLETON_CONFLICT' };
      }
      if (rowsByType.has(type)) return { ok: false, code: 'CORRESPONDENCE_SINGLETON_CONFLICT' };
      rowsByType.set(type, row);
    }

    const engineeringDeliveryLockVersion = exactLockVersion(rowsByType.get('engineering_delivery'));
    const cdCoverLetterLockVersion = exactLockVersion(rowsByType.get('cd_cover_letter'));
    if (engineeringDeliveryLockVersion === undefined || cdCoverLetterLockVersion === undefined) {
      return { ok: false, code: 'CORRESPONDENCE_SINGLETON_CONFLICT' };
    }

    return {
      ok: true,
      snapshot: {
        canonicalUpdatedAt,
        engineeringDeliveryLockVersion,
        cdCoverLetterLockVersion,
      },
    };
  } catch {
    return { ok: false, code: 'NETWORK_OR_RPC_FAILURE' };
  }
}

/**
 * The sole browser approval mutation boundary for Stage 6.
 *
 * It performs only read queries for the current canonical revision and exact
 * outgoing lock versions, then invokes Migration 061 exactly once. It never
 * calls 055, 057, 060, generic report saves, or direct table DML.
 */
export async function approveStage6DocumentsAndTransition(params: {
  clientId: string;
  identity: CanonicalProjectIdentity | null | undefined;
}): Promise<Stage6ApprovalResult> {
  const clientId = params.clientId.trim();
  const identity = params.identity;
  if (!clientId || !identity || identity.clientId !== clientId || !identity.projectId) {
    return { ok: false, code: 'IDENTITY_UNAVAILABLE' };
  }

  const snapshot = await readApprovalSnapshot({ clientId, projectId: identity.projectId });
  if (!snapshot.ok) return snapshot;

  try {
    const { data, error } = await supabase.rpc('approve_stage6_documents_and_transition', {
      p_client_id: clientId,
      p_project_id: identity.projectId,
      p_expected_canonical_updated_at: snapshot.snapshot.canonicalUpdatedAt,
      p_expected_engineering_delivery_lock_version: snapshot.snapshot.engineeringDeliveryLockVersion,
      p_expected_cd_cover_letter_lock_version: snapshot.snapshot.cdCoverLetterLockVersion,
    });

    if (error) return { ok: false, code: knownApprovalErrorCode(error) };
    const response = (data || {}) as Record<string, unknown>;
    if (response.ok !== true || response.target_stage !== 'final_report') {
      return { ok: false, code: 'STAGE6_APPROVAL_BLOCKED' };
    }

    const engineeringDeliveryLockVersion = Number(response.engineering_delivery_lock_version);
    const cdCoverLetterLockVersion = Number(response.cd_cover_letter_lock_version);
    if (
      !Number.isInteger(engineeringDeliveryLockVersion) ||
      engineeringDeliveryLockVersion < 0 ||
      !Number.isInteger(cdCoverLetterLockVersion) ||
      cdCoverLetterLockVersion < 0
    ) {
      return { ok: false, code: 'STAGE6_APPROVAL_BLOCKED' };
    }

    return {
      ok: true,
      approvedAt: typeof response.approved_at === 'string' ? response.approved_at : null,
      engineeringDeliveryLockVersion,
      cdCoverLetterLockVersion,
    };
  } catch (error) {
    return { ok: false, code: knownApprovalErrorCode(error) };
  }
}

export function stage6ApprovalErrorMessage(code: Stage6ApprovalErrorCode): string {
  switch (code) {
    case 'IDENTITY_UNAVAILABLE':
    case 'PROJECT_IDENTITY_UNAVAILABLE':
    case 'PROJECT_CLIENT_MISMATCH':
      return 'لا تتوفر هوية المشروع الكانونية للاعتماد الآمن. أعد تحميل ملف المشروع قبل المحاولة.';
    case 'CANONICAL_REVISION_UNAVAILABLE':
    case 'CANONICAL_ENGINEERING_STATE_REQUIRED':
      return 'تعذر تحميل النسخة الكانونية الحالية للمرحلة. أعد تحميل ملف المشروع وراجع البيانات قبل الاعتماد.';
    case 'CANONICAL_STALE_REVISION':
      return 'تم تحديث بيانات المرحلة منذ آخر تحميل. أعد تحميل البيانات وراجعها قبل الاعتماد.';
    case 'CORRESPONDENCE_STALE_VERSION':
      return 'تغيّرت حالة إحدى المراسلتين منذ آخر تحميل. أعد تحميل المرحلة وسجل المراسلات وراجعها قبل الاعتماد.';
    case 'CORRESPONDENCE_SINGLETON_CONFLICT':
      return 'تعذر اعتماد المرحلة بسبب تعارض في سجل المراسلات. أعد تحميل البيانات وراجعها قبل المحاولة.';
    case 'WORKFLOW_STATE_CONFLICT':
      return 'حالة Workflow الحالية لا تسمح باعتماد هذه المرحلة. لم تُجر أي عملية إصلاح تلقائي.';
    case 'CORRESPONDENCE_STATE_DIVERGENCE':
      return 'توجد حالة غير متسقة بين الوثائق الكانونية وسجل المراسلات. لم تُغيّر البيانات؛ تواصل مع مسؤول النظام للمراجعة.';
    case 'TENANT_ACCESS_DENIED':
    case 'PROJECT_PERMISSION_DENIED':
      return 'لا تملك صلاحية اعتماد هذه المرحلة في المشروع الحالي.';
    case 'STAGE6_APPROVAL_BLOCKED':
      return 'تعذر اعتماد المرحلة لعدم اكتمال متطلبات الوثائق الكانونية. راجع الحقول الإلزامية قبل المحاولة.';
    default:
      return 'تعذر تأكيد نتيجة الاتصال بخدمة الاعتماد. أعد تحميل ملف المشروع وراجع الحالة الكانونية قبل المحاولة مرة أخرى.';
  }
}
