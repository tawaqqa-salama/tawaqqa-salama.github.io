import { supabase } from '@/lib/supabase';
import type { CanonicalProjectIdentity } from '@/lib/types/client';
import type {
  CdCoverLetterReport,
  EngineeringDeliveryReport,
  ProjectEngineeringData,
} from '@/lib/types/project-reports';

export type Stage6SingletonDocumentType = 'engineering_delivery' | 'cd_cover_letter';

type BridgeRow = {
  lock_version?: unknown;
};

type BridgeErrorCode =
  | 'IDENTITY_UNAVAILABLE'
  | 'TENANT_ACCESS_DENIED'
  | 'PROJECT_PERMISSION_DENIED'
  | 'PROJECT_CLIENT_MISMATCH'
  | 'STAGE6_NOT_ACTIVE'
  | 'CANONICAL_ENGINEERING_STATE_REQUIRED'
  | 'CANONICAL_STAGE6_DOCUMENT_REQUIRED'
  | 'CORRESPONDENCE_STALE_VERSION'
  | 'CORRESPONDENCE_SINGLETON_CONFLICT'
  | 'CORRESPONDENCE_NOT_EDITABLE'
  | 'CORRESPONDENCE_INCOMPLETE'
  | 'INVALID_CORRESPONDENCE_TYPE'
  | 'INVALID_CORRESPONDENCE_STATUS'
  | 'INVALID_DOCUMENT_PAYLOAD'
  | 'NETWORK_OR_RPC_FAILURE';

export type Stage6BridgeSaveResult =
  | { ok: true; lockVersion: number }
  | { ok: false; code: BridgeErrorCode };

const DELIVERY_KEYS = [
  'status',
  'delivery_date',
  'delivered_to',
  'copy_to',
  'study_summary',
  'notes',
  'attachments_note',
  'attachments_count',
  'outgoing_number',
  'hijri_date',
  'civil_defense_city',
  'building_permit_number',
  'safety_engineer_name',
  'safety_engineer_title',
  'safety_engineer_phone',
  'manager_name',
  'manager_title',
  'manager_phone',
  'safety_scope',
] as const satisfies readonly (keyof EngineeringDeliveryReport)[];

const COVER_KEYS = [
  'status',
  'letter_date',
  'outgoing_number',
  'addressee',
  'copy_to',
  'building_status',
  'manager_name',
  'manager_title',
  'safety_engineer_name',
  'safety_engineer_title',
] as const satisfies readonly (keyof CdCoverLetterReport)[];

function pickDocument(source: object, keys: readonly string[]): Record<string, unknown> {
  const record = source as Record<string, unknown>;
  return keys.reduce<Record<string, unknown>>((document, key) => {
    if (Object.prototype.hasOwnProperty.call(record, key)) {
      document[key] = record[key];
    }
    return document;
  }, {});
}

/**
 * Produces only the exact Migration 060 whitelist for the selected approved
 * singleton. It never serializes the parent payload or another stage section.
 */
export function stage6BridgeDocumentPayload(
  type: 'engineering_delivery',
  document: EngineeringDeliveryReport
): Record<string, unknown>;
export function stage6BridgeDocumentPayload(
  type: 'cd_cover_letter',
  document: CdCoverLetterReport
): Record<string, unknown>;
export function stage6BridgeDocumentPayload(
  type: Stage6SingletonDocumentType,
  document: EngineeringDeliveryReport | CdCoverLetterReport
): Record<string, unknown>;
export function stage6BridgeDocumentPayload(
  type: Stage6SingletonDocumentType,
  document: EngineeringDeliveryReport | CdCoverLetterReport
): Record<string, unknown> {
  if (type === 'engineering_delivery') {
    return pickDocument(document as EngineeringDeliveryReport, DELIVERY_KEYS);
  }
  return pickDocument(document as CdCoverLetterReport, COVER_KEYS);
}

function bridgeErrorCode(error: unknown): BridgeErrorCode {
  const raw =
    typeof error === 'object' && error && 'message' in error
      ? String((error as { message?: unknown }).message || '')
      : error instanceof Error
        ? error.message
        : '';

  const codes: BridgeErrorCode[] = [
    'TENANT_ACCESS_DENIED',
    'PROJECT_PERMISSION_DENIED',
    'PROJECT_CLIENT_MISMATCH',
    'STAGE6_NOT_ACTIVE',
    'CANONICAL_ENGINEERING_STATE_REQUIRED',
    'CANONICAL_STAGE6_DOCUMENT_REQUIRED',
    'CORRESPONDENCE_STALE_VERSION',
    'CORRESPONDENCE_SINGLETON_CONFLICT',
    'CORRESPONDENCE_NOT_EDITABLE',
    'CORRESPONDENCE_INCOMPLETE',
    'INVALID_CORRESPONDENCE_TYPE',
    'INVALID_CORRESPONDENCE_STATUS',
    'INVALID_DOCUMENT_PAYLOAD',
  ];

  return codes.find((code) => raw.includes(code)) || 'NETWORK_OR_RPC_FAILURE';
}

export function stage6BridgeErrorMessage(code: BridgeErrorCode): string {
  switch (code) {
    case 'IDENTITY_UNAVAILABLE':
    case 'PROJECT_CLIENT_MISMATCH':
      return 'لا تتوفر هوية المشروع الكانونية للحفظ الآمن حاليًا. أعد تحميل ملف المشروع قبل المحاولة مرة أخرى.';
    case 'TENANT_ACCESS_DENIED':
    case 'PROJECT_PERMISSION_DENIED':
      return 'لا تملك صلاحية حفظ هذا النموذج في المشروع الحالي.';
    case 'STAGE6_NOT_ACTIVE':
      return 'الحفظ عبر هذا النموذج متاح فقط أثناء مرحلة تسليم الأعمال الهندسية.';
    case 'CANONICAL_ENGINEERING_STATE_REQUIRED':
    case 'CANONICAL_STAGE6_DOCUMENT_REQUIRED':
      return 'تعذر العثور على الحالة الهندسية الكانونية للنموذج. أعد تحميل ملف المشروع قبل الحفظ.';
    case 'CORRESPONDENCE_STALE_VERSION':
      return 'تم تحديث هذه المراسلة من مستخدم آخر. أعد تحميل البيانات قبل الحفظ مرة أخرى.';
    case 'CORRESPONDENCE_SINGLETON_CONFLICT':
      return 'تعذر الحفظ لأن سجل المراسلة المقابل تغيّر. أعد تحميل البيانات قبل المحاولة مرة أخرى.';
    case 'CORRESPONDENCE_NOT_EDITABLE':
      return 'لا يمكن تعديل نموذج أو مراسلة معتمدة عبر مسار الحفظ الحالي.';
    case 'CORRESPONDENCE_INCOMPLETE':
      return 'لا يمكن حفظ النموذج بحالة مكتمل قبل استكمال الحقول الإلزامية.';
    case 'INVALID_CORRESPONDENCE_TYPE':
    case 'INVALID_CORRESPONDENCE_STATUS':
    case 'INVALID_DOCUMENT_PAYLOAD':
      return 'تعذر التحقق من بيانات النموذج قبل الحفظ. راجع الحقول المدخلة ثم أعد المحاولة.';
    default:
      return 'تعذر الاتصال بخدمة الحفظ. بقيت بيانات النموذج في الشاشة ولم يتم تأكيد حفظها.';
  }
}

async function expectedLockVersion(params: {
  clientId: string;
  projectId: string;
  type: Stage6SingletonDocumentType;
}): Promise<{ ok: true; value: number } | { ok: false; code: BridgeErrorCode }> {
  try {
    const { data, error } = await supabase
      .from('project_correspondences')
      .select('lock_version')
      .eq('project_id', params.projectId)
      .eq('client_id', params.clientId)
      .eq('correspondence_type', params.type)
      .eq('direction', 'outgoing');

    if (error || !Array.isArray(data)) return { ok: false, code: 'NETWORK_OR_RPC_FAILURE' };
    if (data.length > 1) return { ok: false, code: 'CORRESPONDENCE_SINGLETON_CONFLICT' };
    if (data.length === 0) return { ok: true, value: 0 };

    const value = Number((data[0] as BridgeRow).lock_version);
    return Number.isInteger(value) && value >= 0
      ? { ok: true, value }
      : { ok: false, code: 'CORRESPONDENCE_SINGLETON_CONFLICT' };
  } catch {
    return { ok: false, code: 'NETWORK_OR_RPC_FAILURE' };
  }
}

/**
 * The sole browser mutation boundary for the two approved Stage 6 singleton
 * forms. It reads an exact outgoing row for the expected lock, then invokes
 * Migration 060 once. It never calls legacy persistence or relational DML.
 */
export async function saveStage6SingletonDocument(params: {
  clientId: string;
  identity: CanonicalProjectIdentity | null | undefined;
  type: 'engineering_delivery';
  document: EngineeringDeliveryReport;
}): Promise<Stage6BridgeSaveResult>;
export async function saveStage6SingletonDocument(params: {
  clientId: string;
  identity: CanonicalProjectIdentity | null | undefined;
  type: 'cd_cover_letter';
  document: CdCoverLetterReport;
}): Promise<Stage6BridgeSaveResult>;
export async function saveStage6SingletonDocument(params: {
  clientId: string;
  identity: CanonicalProjectIdentity | null | undefined;
  type: Stage6SingletonDocumentType;
  document: EngineeringDeliveryReport | CdCoverLetterReport;
}): Promise<Stage6BridgeSaveResult> {
  const clientId = params.clientId.trim();
  const identity = params.identity;
  if (!clientId || !identity || identity.clientId !== clientId || !identity.projectId) {
    return { ok: false, code: 'IDENTITY_UNAVAILABLE' };
  }

  const lock = await expectedLockVersion({
    clientId,
    projectId: identity.projectId,
    type: params.type,
  });
  if (!lock.ok) return lock;

  try {
    const { data, error } = await supabase.rpc('save_stage6_singleton_document_bridge', {
      p_client_id: clientId,
      p_project_id: identity.projectId,
      p_correspondence_type: params.type,
      p_expected_lock_version: lock.value,
      p_document: stage6BridgeDocumentPayload(params.type, params.document),
    });

    if (error) return { ok: false, code: bridgeErrorCode(error) };
    const version = Number((data as BridgeRow | null)?.lock_version);
    return { ok: true, lockVersion: Number.isInteger(version) && version >= 0 ? version : lock.value + 1 };
  } catch (error) {
    return { ok: false, code: bridgeErrorCode(error) };
  }
}

export function stage6DocumentFromData(
  type: 'engineering_delivery',
  data: ProjectEngineeringData
): EngineeringDeliveryReport;
export function stage6DocumentFromData(
  type: 'cd_cover_letter',
  data: ProjectEngineeringData
): CdCoverLetterReport;
export function stage6DocumentFromData(
  type: Stage6SingletonDocumentType,
  data: ProjectEngineeringData
): EngineeringDeliveryReport | CdCoverLetterReport {
  return type === 'engineering_delivery' ? data.engineering_delivery : data.cd_cover_letter;
}
