import { getSupabaseProjectRef, isSupabaseConfigured, supabase } from '@/lib/supabase';

export const CORRESPONDENCE_ATTACHMENT_MAX_BYTES = 20 * 1024 * 1024;
export const CORRESPONDENCE_ATTACHMENT_DOWNLOAD_TTL_SECONDS = 5 * 60;
export const CORRESPONDENCE_ATTACHMENT_BROKER = 'project-correspondence-attachment-broker';

export type CorrespondenceAttachmentState =
  | 'pending_upload'
  | 'available'
  | 'pending_delete'
  | 'cleanup_required';

export type CorrespondenceAttachmentMetadata = {
  id: string;
  displayFileName: string;
  mimeType: 'application/pdf' | 'image/jpeg' | 'image/png';
  sizeBytes: number;
  state: CorrespondenceAttachmentState;
  createdAt: string | null;
  cleanupRequestedAt: string | null;
};

type RpcAttachmentRow = {
  id: unknown;
  display_file_name: unknown;
  mime_type: unknown;
  size_bytes: unknown;
  state: unknown;
  created_at: unknown;
  cleanup_requested_at: unknown;
};

type PreparedAttachment = {
  id: string;
  state: CorrespondenceAttachmentState;
  displayFileName: string;
  mimeType: 'application/pdf' | 'image/jpeg' | 'image/png';
  sizeBytes: number;
  idempotentReplay: boolean;
};

type BrokerFailureCode =
  | 'DOCUMENT_PERMISSION_DENIED'
  | 'CORRESPONDENCE_APPROVED_IMMUTABLE'
  | 'ATTACHMENT_BYTE_VALIDATION_FAILED'
  | 'ATTACHMENT_LIMIT_REACHED'
  | 'ATTACHMENT_OBJECT_CONFLICT'
  | 'ATTACHMENT_CLEANUP_REQUIRED'
  | 'SIGNED_URL_FAILED'
  | 'ATTACHMENT_NOT_FOUND_OR_FORBIDDEN'
  | 'ATTACHMENT_INVALID_STATE'
  | 'UNAUTHORIZED'
  | 'NETWORK_UNCERTAINTY'
  | 'UNKNOWN';

export class CorrespondenceAttachmentError extends Error {
  constructor(public readonly code: BrokerFailureCode, message?: string) {
    super(message || code);
    this.name = 'CorrespondenceAttachmentError';
  }
}

const MIME_BY_EXTENSION: Array<{ mimeType: CorrespondenceAttachmentMetadata['mimeType']; extension: RegExp }> = [
  { mimeType: 'application/pdf', extension: /\.pdf$/i },
  { mimeType: 'image/jpeg', extension: /\.jpe?g$/i },
  { mimeType: 'image/png', extension: /\.png$/i },
];

const safeStates = new Set<CorrespondenceAttachmentState>([
  'pending_upload',
  'available',
  'pending_delete',
  'cleanup_required',
]);

function string(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function attachmentId(value: unknown): string | null {
  const normalized = string(value);
  return normalized && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalized)
    ? normalized
    : null;
}

function finiteSize(value: unknown): number | null {
  const size = typeof value === 'number' ? value : Number(value);
  return Number.isSafeInteger(size) && size > 0 && size <= CORRESPONDENCE_ATTACHMENT_MAX_BYTES ? size : null;
}

function safeMime(value: unknown): CorrespondenceAttachmentMetadata['mimeType'] | null {
  return value === 'application/pdf' || value === 'image/jpeg' || value === 'image/png' ? value : null;
}

function safeState(value: unknown): CorrespondenceAttachmentState | null {
  return typeof value === 'string' && safeStates.has(value as CorrespondenceAttachmentState)
    ? value as CorrespondenceAttachmentState
    : null;
}

function normalizeAttachment(row: RpcAttachmentRow): CorrespondenceAttachmentMetadata | null {
  const id = attachmentId(row.id);
  const displayFileName = string(row.display_file_name);
  const mimeType = safeMime(row.mime_type);
  const sizeBytes = finiteSize(row.size_bytes);
  const state = safeState(row.state);
  if (!id || !displayFileName || !mimeType || !sizeBytes || !state) return null;
  return {
    id,
    displayFileName,
    mimeType,
    sizeBytes,
    state,
    createdAt: string(row.created_at),
    cleanupRequestedAt: string(row.cleanup_requested_at),
  };
}

function rpcCode(error: unknown): BrokerFailureCode {
  const text = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  if (text.includes('DOCUMENT_PERMISSION_DENIED')) return 'DOCUMENT_PERMISSION_DENIED';
  if (text.includes('CORRESPONDENCE_APPROVED_IMMUTABLE')) return 'CORRESPONDENCE_APPROVED_IMMUTABLE';
  if (text.includes('ATTACHMENT_LIMIT_REACHED')) return 'ATTACHMENT_LIMIT_REACHED';
  if (text.includes('ATTACHMENT_NOT_FOUND_OR_FORBIDDEN')) return 'ATTACHMENT_NOT_FOUND_OR_FORBIDDEN';
  if (text.includes('ATTACHMENT_INVALID_STATE')) return 'ATTACHMENT_INVALID_STATE';
  return 'UNKNOWN';
}

export function attachmentErrorMessage(code: BrokerFailureCode): string {
  switch (code) {
    case 'DOCUMENT_PERMISSION_DENIED': return 'لا تملك صلاحية رفع أو تنزيل هذا المرفق.';
    case 'CORRESPONDENCE_APPROVED_IMMUTABLE': return 'المراسلة معتمدة، والمرفقات متاحة للعرض والتنزيل فقط.';
    case 'ATTACHMENT_BYTE_VALIDATION_FAILED': return 'الملف لا يطابق النوع أو الحجم أو سلامة المحتوى المطلوبة.';
    case 'ATTACHMENT_LIMIT_REACHED': return 'تم الوصول إلى الحد الأقصى للمرفقات.';
    case 'ATTACHMENT_OBJECT_CONFLICT': return 'تعذر إتمام الرفع بأمان. أعد تحميل حالة المرفقات ثم حاول مرة أخرى.';
    case 'ATTACHMENT_CLEANUP_REQUIRED': return 'تعذر إتمام الرفع ويتطلب معالجة من مسؤول النظام.';
    case 'SIGNED_URL_FAILED': return 'تعذر تجهيز رابط تنزيل مؤقت.';
    case 'NETWORK_UNCERTAINTY': return 'تعذر تأكيد نتيجة الرفع. تم تحديث حالة المرفقات الحالية.';
    default: return 'تعذر إتمام عملية المرفق حاليًا.';
  }
}

export function validateAttachmentForUpload(file: Pick<File, 'name' | 'type' | 'size'>): CorrespondenceAttachmentMetadata['mimeType'] {
  const name = file.name.trim();
  if (!name || file.size <= 0 || file.size > CORRESPONDENCE_ATTACHMENT_MAX_BYTES) {
    throw new CorrespondenceAttachmentError('ATTACHMENT_BYTE_VALIDATION_FAILED');
  }
  const match = MIME_BY_EXTENSION.find((item) => item.mimeType === file.type && item.extension.test(name));
  if (!match) throw new CorrespondenceAttachmentError('ATTACHMENT_BYTE_VALIDATION_FAILED');
  return match.mimeType;
}

export function matchingRetryFile(
  attachment: CorrespondenceAttachmentMetadata,
  file: Pick<File, 'name' | 'type' | 'size'>
): boolean {
  return attachment.state === 'pending_upload'
    && attachment.displayFileName === file.name.trim()
    && attachment.mimeType === file.type
    && attachment.sizeBytes === file.size;
}

export function createUploadIdempotencyKey(): string {
  const random = globalThis.crypto?.randomUUID?.();
  if (random) return `stage6b4c-${random}`;
  return `stage6b4c-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function brokerEndpoint(): string {
  const ref = getSupabaseProjectRef();
  if (!isSupabaseConfigured || !ref) throw new CorrespondenceAttachmentError('UNAUTHORIZED');
  return `https://${ref}.supabase.co/functions/v1/${CORRESPONDENCE_ATTACHMENT_BROKER}`;
}

async function sessionToken(): Promise<string> {
  const { data, error } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (error || !token) throw new CorrespondenceAttachmentError('UNAUTHORIZED');
  return token;
}

async function brokerJson(response: Response): Promise<Record<string, unknown>> {
  let body: Record<string, unknown> = {};
  try {
    const parsed: unknown = await response.json();
    if (parsed && typeof parsed === 'object') body = parsed as Record<string, unknown>;
  } catch {
    // A non-JSON response is still normalized to a safe UI error below.
  }
  if (!response.ok || body.ok !== true) {
    const code = typeof body.code === 'string' ? body.code as BrokerFailureCode : 'UNKNOWN';
    throw new CorrespondenceAttachmentError(code);
  }
  return body;
}

export async function listCorrespondenceAttachments(correspondenceId: string): Promise<CorrespondenceAttachmentMetadata[]> {
  const { data, error } = await supabase.rpc('list_project_correspondence_attachments', {
    p_correspondence_id: correspondenceId,
  });
  if (error) throw new CorrespondenceAttachmentError(rpcCode(error));
  if (!Array.isArray(data)) return [];
  return (data as RpcAttachmentRow[])
    .map(normalizeAttachment)
    .filter((attachment): attachment is CorrespondenceAttachmentMetadata => attachment !== null);
}

export async function prepareCorrespondenceAttachment(params: {
  correspondenceId: string;
  file: Pick<File, 'name' | 'type' | 'size'>;
  idempotencyKey: string;
}): Promise<PreparedAttachment> {
  const mimeType = validateAttachmentForUpload(params.file);
  const { data, error } = await supabase.rpc('prepare_project_correspondence_attachment', {
    p_correspondence_id: params.correspondenceId,
    p_display_file_name: params.file.name.trim(),
    p_mime_type: mimeType,
    p_size_bytes: params.file.size,
    p_idempotency_key: params.idempotencyKey,
  });
  if (error || !data || typeof data !== 'object') throw new CorrespondenceAttachmentError(rpcCode(error));
  const result = data as Record<string, unknown>;
  const id = attachmentId(result.id);
  const state = safeState(result.state);
  const displayFileName = string(result.display_file_name);
  const resultMime = safeMime(result.mime_type);
  const sizeBytes = finiteSize(result.size_bytes);
  if (!id || !state || !displayFileName || !resultMime || !sizeBytes) throw new CorrespondenceAttachmentError('UNKNOWN');
  return {
    id,
    state,
    displayFileName,
    mimeType: resultMime,
    sizeBytes,
    idempotentReplay: result.idempotent_replay === true,
  };
}

export async function uploadRawCorrespondenceAttachment(file: File, attachmentIdValue: string): Promise<void> {
  const token = await sessionToken();
  let response: Response;
  try {
    response = await fetch(brokerEndpoint(), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': file.type,
        'x-attachment-id': attachmentIdValue,
      },
      body: file,
    });
  } catch {
    throw new CorrespondenceAttachmentError('NETWORK_UNCERTAINTY');
  }
  await brokerJson(response);
}

export async function requestCorrespondenceAttachmentDownload(attachmentIdValue: string): Promise<string> {
  const token = await sessionToken();
  let response: Response;
  try {
    response = await fetch(`${brokerEndpoint()}?attachment_id=${encodeURIComponent(attachmentIdValue)}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    throw new CorrespondenceAttachmentError('NETWORK_UNCERTAINTY');
  }
  const body = await brokerJson(response);
  const signedUrl = string(body.signed_url);
  if (!signedUrl || body.expires_in_seconds !== CORRESPONDENCE_ATTACHMENT_DOWNLOAD_TTL_SECONDS) {
    throw new CorrespondenceAttachmentError('SIGNED_URL_FAILED');
  }
  return signedUrl;
}
