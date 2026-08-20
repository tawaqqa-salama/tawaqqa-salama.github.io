import { isDemoMode, supabase } from '@/lib/supabase';
import {
  FORCE_STORAGE_MIN_BYTES,
  INLINE_PREVIEW_MAX_BYTES,
  PROJECT_FILES_BUCKET,
  buildStorageObjectPath,
  formatProjectFilesStorageError,
} from '@/lib/storage/project-files';
import type {
  TechnicalEvidenceCleanup,
  TechnicalEvidenceFile,
  TechnicalEvidenceItem,
  TechnicalEvidenceKind,
  TechnicalEvidenceState,
  TechnicalReport,
  TechnicalReportPhoto,
} from '@/lib/types/project-reports';

export const TECHNICAL_EVIDENCE_BUCKET = PROJECT_FILES_BUCKET;
export const TECHNICAL_EVIDENCE_FOLDER = 'technical-evidence';
export const TECHNICAL_EVIDENCE_VERSION = 1 as const;
/** Largest fallback preview that may safely persist only when Storage is unavailable. */
export const MAX_DURABLE_INLINE_EVIDENCE_CHARS = 180_000;

export const ALLOWED_TECHNICAL_EVIDENCE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'application/pdf',
] as const;

const MIME_BY_EXTENSION: Record<string, (typeof ALLOWED_TECHNICAL_EVIDENCE_MIME_TYPES)[number]> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  pdf: 'application/pdf',
};

const EVIDENCE_KINDS: readonly TechnicalEvidenceKind[] = [
  'site_general',
  'satellite_image',
  'civil_defense_map',
  'civil_defense_route',
  'existing_condition',
  'safety_system',
  'code_excerpt',
] as const;

export type TechnicalEvidenceFileLike = Pick<File, 'name' | 'type' | 'size'>;

export type TechnicalEvidenceUploadOutcome = {
  file: TechnicalEvidenceFile;
  cloudPersisted: boolean;
  warning?: string | null;
};

export type TechnicalEvidenceViewItem = TechnicalEvidenceItem & {
  source: 'evidence' | 'legacy';
};

export type PreparedTechnicalEvidenceDeletion = {
  nextState: TechnicalEvidenceState;
  cleanup: TechnicalEvidenceCleanup | null;
};

export type TechnicalEvidenceDeletionResult = {
  state: TechnicalEvidenceState;
  metadataPersisted: boolean;
  storageDeleteAttempted: boolean;
  storageDeleted: boolean;
  cleanupPending: boolean;
  error?: string | null;
};

function now() {
  return new Date().toISOString();
}

function evidenceId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `evidence-${crypto.randomUUID()}`;
  }
  return `evidence-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function cleanupId() {
  return `evidence-cleanup-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function extensionOf(name: string): string {
  const clean = String(name || '').trim().toLowerCase();
  const dot = clean.lastIndexOf('.');
  return dot >= 0 ? clean.slice(dot + 1).replace(/[^a-z0-9]/g, '') : '';
}

function validId(id: string | null | undefined): boolean {
  return Boolean(id && /^[A-Za-z0-9._-]{4,200}$/.test(id));
}

function safeEvidenceKinds(): Set<string> {
  return new Set(EVIDENCE_KINDS);
}

function cloneState(state: TechnicalEvidenceState): TechnicalEvidenceState {
  return {
    ...state,
    civil_defense: state.civil_defense ? { ...state.civil_defense } : null,
    items: state.items.map((item) => ({
      ...item,
      association: item.association ? { ...item.association } : null,
      code_reference: item.code_reference
        ? {
            ...item.code_reference,
            related_recommendation_ids: item.code_reference.related_recommendation_ids
              ? [...item.code_reference.related_recommendation_ids]
              : undefined,
          }
        : null,
      file: { ...item.file },
    })),
    cleanup_pending: (state.cleanup_pending || []).map((cleanup) => ({ ...cleanup })),
  };
}

export function emptyTechnicalEvidenceState(): TechnicalEvidenceState {
  return {
    version: TECHNICAL_EVIDENCE_VERSION,
    civil_defense: null,
    items: [],
  };
}

export function isTechnicalEvidenceKind(value: unknown): value is TechnicalEvidenceKind {
  return typeof value === 'string' && safeEvidenceKinds().has(value);
}

/**
 * Normalizes only evidence-owned state. It is deliberately read-only and never
 * imports legacy technical-report images into persisted evidence.items.
 */
export function normalizeTechnicalEvidenceState(raw: unknown): TechnicalEvidenceState {
  const empty = emptyTechnicalEvidenceState();
  if (!raw || typeof raw !== 'object') return empty;
  const candidate = raw as Partial<TechnicalEvidenceState>;
  const items = Array.isArray(candidate.items)
    ? candidate.items
        .filter((item): item is TechnicalEvidenceItem => Boolean(item && typeof item === 'object'))
        .map((item, index) => ({
          ...item,
          id: String(item.id || `evidence-legacy-${index + 1}`),
          kind: isTechnicalEvidenceKind(item.kind) ? item.kind : 'existing_condition',
          category: String(item.category || 'other'),
          title: String(item.title || item.file?.fileName || 'دليل فني'),
          display_order:
            Number.isFinite(Number(item.display_order)) && Number(item.display_order) > 0
              ? Math.trunc(Number(item.display_order))
              : index + 1,
          include_in_report: Boolean(item.include_in_report),
          association: item.association && typeof item.association === 'object'
            ? { ...item.association }
            : null,
          file: {
            id: String(item.file?.id || item.id || `evidence-file-${index + 1}`),
            fileName: item.file?.fileName || null,
            mimeType: item.file?.mimeType || null,
            sizeBytes:
              item.file?.sizeBytes != null && Number.isFinite(Number(item.file.sizeBytes))
                ? Number(item.file.sizeBytes)
                : null,
            storagePath: item.file?.storagePath || null,
            storageBucket: item.file?.storageBucket || null,
            dataUrl: item.file?.dataUrl || null,
          },
          code_reference: item.code_reference && typeof item.code_reference === 'object'
            ? {
                ...item.code_reference,
                related_recommendation_ids: Array.isArray(item.code_reference.related_recommendation_ids)
                  ? item.code_reference.related_recommendation_ids.map(String)
                  : undefined,
              }
            : null,
          created_at: item.created_at || '',
          updated_at: item.updated_at || undefined,
        }))
    : [];

  return {
    version: TECHNICAL_EVIDENCE_VERSION,
    civil_defense:
      candidate.civil_defense && typeof candidate.civil_defense === 'object'
        ? { ...candidate.civil_defense }
        : null,
    items,
    cleanup_pending: Array.isArray(candidate.cleanup_pending)
      ? candidate.cleanup_pending
          .filter((cleanup): cleanup is TechnicalEvidenceCleanup => Boolean(cleanup && typeof cleanup === 'object'))
          .map((cleanup) => ({
            ...cleanup,
            id: String(cleanup.id || cleanupId()),
            evidence_id: String(cleanup.evidence_id || ''),
            kind: isTechnicalEvidenceKind(cleanup.kind) ? cleanup.kind : 'existing_condition',
            storage_bucket: String(cleanup.storage_bucket || ''),
            storage_path: String(cleanup.storage_path || ''),
            attempts: Math.max(0, Number(cleanup.attempts) || 0),
            created_at: cleanup.created_at || '',
          }))
      : undefined,
  };
}

export function validateTechnicalEvidenceUpload(
  file: TechnicalEvidenceFileLike
): { ok: true; mimeType: (typeof ALLOWED_TECHNICAL_EVIDENCE_MIME_TYPES)[number] } | { ok: false; error: string } {
  const ext = extensionOf(file.name);
  const inferred = MIME_BY_EXTENSION[ext];
  const supplied = String(file.type || '').trim().toLowerCase();
  const allowed = new Set<string>(ALLOWED_TECHNICAL_EVIDENCE_MIME_TYPES);

  if (!inferred) {
    return { ok: false, error: 'نوع ملف الدليل غير مسموح. استخدم JPEG أو PNG أو PDF فقط.' };
  }
  if (supplied && !allowed.has(supplied)) {
    return { ok: false, error: 'نوع MIME لملف الدليل غير مسموح. استخدم JPEG أو PNG أو PDF فقط.' };
  }
  if (supplied && supplied !== inferred) {
    return { ok: false, error: 'امتداد الملف لا يطابق نوعه المعلن.' };
  }
  return { ok: true, mimeType: inferred };
}

function hasExpectedFileSignature(mimeType: string, bytes: Uint8Array): boolean {
  if (mimeType === 'image/jpeg') {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (mimeType === 'image/png') {
    return bytes.length >= 8 &&
      bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
      bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a;
  }
  return bytes.length >= 5 &&
    bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46 && bytes[4] === 0x2d;
}

/** Validates extension, browser MIME, and the first bytes before a Storage upload. */
export async function validateTechnicalEvidenceFile(
  file: File
): Promise<{ ok: true; mimeType: (typeof ALLOWED_TECHNICAL_EVIDENCE_MIME_TYPES)[number] } | { ok: false; error: string }> {
  const metadata = validateTechnicalEvidenceUpload(file);
  if (!metadata.ok) return metadata;
  try {
    const header = new Uint8Array(await file.slice(0, 16).arrayBuffer());
    if (!hasExpectedFileSignature(metadata.mimeType, header)) {
      return { ok: false, error: 'محتوى ملف الدليل لا يطابق نوعه المسموح.' };
    }
  } catch {
    return { ok: false, error: 'تعذر التحقق من محتوى ملف الدليل.' };
  }
  return metadata;
}

/** A path is usable only for its owning client and the Phase 4A evidence namespace. */
export function isTechnicalEvidenceStoragePath(params: {
  clientId: string;
  evidenceId: string;
  kind: TechnicalEvidenceKind;
  storageBucket?: string | null;
  storagePath?: string | null;
}): boolean {
  const clientId = String(params.clientId || '').trim();
  const evidenceIdValue = String(params.evidenceId || '').trim();
  const path = String(params.storagePath || '').replace(/^\/+/, '').trim();
  if (!validId(clientId) || !validId(evidenceIdValue)) return false;
  if (params.storageBucket !== TECHNICAL_EVIDENCE_BUCKET) return false;
  if (!path || String(params.storagePath || '').startsWith('/') || path.includes('..') || path.includes('\\') || /%(2e|2f|5c)/i.test(path)) return false;
  const segments = path.split('/');
  if (segments.length !== 4) return false;
  if (segments[0] !== clientId || segments[1] !== TECHNICAL_EVIDENCE_FOLDER) return false;
  if (segments[2] !== params.kind || !isTechnicalEvidenceKind(segments[2])) return false;
  return segments[3].startsWith(`${evidenceIdValue}-`);
}

function evidenceFileBase(params: {
  evidenceId: string;
  file: TechnicalEvidenceFileLike;
  mimeType: string;
}): TechnicalEvidenceFile {
  return {
    id: params.evidenceId,
    fileName: params.file.name,
    mimeType: params.mimeType,
    sizeBytes: params.file.size,
    storageBucket: TECHNICAL_EVIDENCE_BUCKET,
    storagePath: null,
    dataUrl: null,
  };
}

async function fileToDataUrl(file: File): Promise<string | null> {
  if (file.size >= INLINE_PREVIEW_MAX_BYTES || typeof FileReader === 'undefined') return null;
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || '') || null);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}

function dataUrlToBlob(dataUrl: string): Blob | null {
  try {
    const result = /^data:([^;,]+)?(;base64)?,(.*)$/i.exec(dataUrl);
    if (!result) return null;
    const mimeType = result[1] || 'application/octet-stream';
    const bytes = result[2]
      ? Uint8Array.from(atob(result[3] || ''), (char) => char.charCodeAt(0))
      : new TextEncoder().encode(decodeURIComponent(result[3] || ''));
    return new Blob([bytes], { type: mimeType });
  } catch {
    return null;
  }
}

/** Upload a new evidence file to the existing private project-files bucket. */
export async function uploadTechnicalEvidenceFile(params: {
  clientId: string;
  evidenceId?: string;
  kind: TechnicalEvidenceKind;
  file: File;
}): Promise<TechnicalEvidenceUploadOutcome> {
  if (!isTechnicalEvidenceKind(params.kind)) {
    throw new Error('نوع الدليل غير صالح لمسار التخزين.');
  }
  const validation = await validateTechnicalEvidenceFile(params.file);
  if (!validation.ok) throw new Error(validation.error);
  const id = params.evidenceId || evidenceId();
  if (!validId(params.clientId) || !validId(id)) {
    throw new Error('معرّف المشروع أو الدليل غير صالح لمسار التخزين.');
  }

  const base = evidenceFileBase({ evidenceId: id, file: params.file, mimeType: validation.mimeType });
  if (isDemoMode) {
    return {
      file: { ...base, dataUrl: await fileToDataUrl(params.file) },
      cloudPersisted: false,
      warning: 'وضع تجريبي — الدليل لن يتزامن بين الأجهزة حتى يتوفر التخزين السحابي.',
    };
  }

  const path = buildStorageObjectPath(
    [params.clientId, TECHNICAL_EVIDENCE_FOLDER, params.kind],
    id,
    params.file.name
  );
  const { error } = await supabase.storage.from(TECHNICAL_EVIDENCE_BUCKET).upload(path, params.file, {
    contentType: validation.mimeType,
    upsert: false,
  });

  if (error) {
    const preview = await fileToDataUrl(params.file);
    if (!preview) {
      throw new Error(formatProjectFilesStorageError(params.file.name, error.message));
    }
    return {
      file: { ...base, dataUrl: preview },
      cloudPersisted: false,
      warning: `تعذر رفع الدليل إلى التخزين. احتُفظت المعاينة المحلية مؤقتًا: ${error.message}`,
    };
  }

  return {
    file: {
      ...base,
      storagePath: path,
      storageBucket: TECHNICAL_EVIDENCE_BUCKET,
      dataUrl: null,
    },
    cloudPersisted: true,
    warning: null,
  };
}

/** Rejects an untrusted item before any Storage operation. */
export function canOperateOnTechnicalEvidenceFile(
  clientId: string,
  item: Pick<TechnicalEvidenceItem, 'id' | 'kind' | 'file'>
): boolean {
  return isTechnicalEvidenceStoragePath({
    clientId,
    evidenceId: item.id,
    kind: item.kind,
    storageBucket: item.file.storageBucket,
    storagePath: item.file.storagePath,
  });
}

/** Resolve a transient display URL. It is never suitable for direct persistence. */
export async function resolveTechnicalEvidenceFileSrc(params: {
  clientId: string;
  item: Pick<TechnicalEvidenceItem, 'id' | 'kind' | 'file'>;
}): Promise<string | null> {
  const { item } = params;
  if (!item.file.storagePath) {
    return item.file.dataUrl?.startsWith('data:') ? item.file.dataUrl : null;
  }
  if (!canOperateOnTechnicalEvidenceFile(params.clientId, item)) return null;
  if (isDemoMode) return item.file.dataUrl?.startsWith('data:') ? item.file.dataUrl : null;

  const { data, error } = await supabase.storage
    .from(TECHNICAL_EVIDENCE_BUCKET)
    .createSignedUrl(item.file.storagePath, 60 * 60);
  return !error && data?.signedUrl ? data.signedUrl : null;
}

/** Hydrates presentation URLs in memory without rewriting the canonical storage metadata. */
export async function hydrateTechnicalEvidenceForDisplay(
  clientId: string,
  raw: TechnicalEvidenceState | null | undefined
): Promise<TechnicalEvidenceState> {
  const state = normalizeTechnicalEvidenceState(raw);
  const items = await Promise.all(
    state.items.map(async (item) => {
      const src = await resolveTechnicalEvidenceFileSrc({ clientId, item });
      return {
        ...item,
        file: {
          ...item.file,
          dataUrl: src,
        },
      };
    })
  );
  return { ...state, items };
}

async function ensureStoredEvidenceItem(
  clientId: string,
  item: TechnicalEvidenceItem
): Promise<TechnicalEvidenceItem> {
  if (item.file.storagePath) {
    if (!canOperateOnTechnicalEvidenceFile(clientId, item)) {
      return {
        ...item,
        file: { ...item.file, storagePath: null, storageBucket: null },
      };
    }
    return { ...item, file: { ...item.file, dataUrl: null } };
  }

  const inline = item.file.dataUrl || '';
  if (!inline.startsWith('data:')) return { ...item, file: { ...item.file, dataUrl: null } };
  if (isDemoMode) return item;

  const blob = dataUrlToBlob(inline);
  const fallbackName = item.file.fileName || `${item.id}.jpg`;
  const fallbackFile = blob
    ? new File([blob], fallbackName, { type: item.file.mimeType || blob.type || 'image/jpeg' })
    : null;
  if (!fallbackFile) return item;

  try {
    const outcome = await uploadTechnicalEvidenceFile({
      clientId,
      evidenceId: item.id,
      kind: item.kind,
      file: fallbackFile,
    });
    if (!outcome.cloudPersisted && (outcome.file.dataUrl?.length || 0) > MAX_DURABLE_INLINE_EVIDENCE_CHARS) {
      throw new Error('تعذر حفظ الدليل محليًا بأمان بعد فشل التخزين؛ أعد المحاولة بعد معالجة خطأ التخزين.');
    }
    return { ...item, file: outcome.file };
  } catch (error) {
    // Never let the save path silently strip a large local fallback after a failed upload.
    if ((item.file.dataUrl?.length || 0) > MAX_DURABLE_INLINE_EVIDENCE_CHARS) throw error;
    return item;
  }
}

/** Moves inline evidence previews to Storage before the live JSONB payload is sanitized. */
export async function persistTechnicalEvidenceToStorage(
  clientId: string,
  raw: TechnicalEvidenceState | null | undefined
): Promise<TechnicalEvidenceState> {
  const state = normalizeTechnicalEvidenceState(raw);
  const items = await Promise.all(
    state.items.map((item) => ensureStoredEvidenceItem(clientId, item))
  );
  return { ...state, items };
}

/** Removes transient URLs and large inline bytes while retaining file metadata and storage paths. */
export function sanitizeTechnicalEvidenceStateForPersist(
  raw: TechnicalEvidenceState | null | undefined
): TechnicalEvidenceState {
  const state = cloneState(normalizeTechnicalEvidenceState(raw));
  return {
    ...state,
    items: state.items.map((item) => {
      const file = { ...item.file };
      if (file.storagePath) {
        file.dataUrl = null;
      } else if (file.dataUrl && file.dataUrl.length > MAX_DURABLE_INLINE_EVIDENCE_CHARS) {
        file.dataUrl = null;
      } else if (file.dataUrl?.startsWith('http') || file.dataUrl?.startsWith('blob:')) {
        file.dataUrl = null;
      }
      return { ...item, file };
    }),
  };
}

function legacyPhotoToEvidence(params: {
  photo: TechnicalReportPhoto;
  id: string;
  kind: TechnicalEvidenceKind;
  category: string;
  title: string;
  order: number;
  reportSection?: string;
}): TechnicalEvidenceViewItem {
  return {
    id: params.id,
    kind: params.kind,
    category: params.category,
    title: params.title,
    caption: params.photo.caption || null,
    engineering_observation: null,
    display_order: params.order,
    include_in_report: false,
    association: params.reportSection ? { report_section_id: params.reportSection } : null,
    file: {
      id: params.photo.id || params.id,
      fileName: params.photo.fileName || null,
      mimeType: params.photo.mimeType || null,
      storagePath: params.photo.storagePath || null,
      storageBucket: params.photo.storageBucket || null,
      dataUrl: params.photo.dataUrl || null,
    },
    code_reference: null,
    created_at: '',
    source: 'legacy',
  };
}

/**
 * Read-only legacy adapter. It exposes old fields in the evidence view but
 * never persists a conversion, changes inclusion, or modifies legacy metadata.
 */
export function buildLegacyTechnicalEvidenceView(
  report: Pick<
    TechnicalReport,
    | 'facade_photo'
    | 'earth_photo'
    | 'site_photo'
    | 'code_proof_photos'
    | 'code_proofs_by_key'
    | 'firefighting_items'
    | 'ventilation_items'
    | 'alarm_items'
    | 'exits_items'
  >
): TechnicalEvidenceViewItem[] {
  const result: TechnicalEvidenceViewItem[] = [];
  let order = 1;
  const push = (
    photo: TechnicalReportPhoto | null | undefined,
    id: string,
    kind: TechnicalEvidenceKind,
    category: string,
    title: string,
    reportSection?: string
  ) => {
    if (!photo) return;
    result.push(
      legacyPhotoToEvidence({ photo, id, kind, category, title, order, reportSection })
    );
    order += 1;
  };

  push(report.facade_photo, 'legacy-facade', 'site_general', 'facade', 'واجهة المشروع');
  push(report.earth_photo, 'legacy-earth', 'site_general', 'site-map', 'صورة الموقع / الخريطة');
  push(report.site_photo, 'legacy-site', 'site_general', 'site', 'صورة عامة من الموقع');

  for (const photo of report.code_proof_photos || []) {
    push(photo, `legacy-code-${photo.id || order}`, 'code_excerpt', 'code-proof', 'إثبات كود');
  }
  for (const [key, photos] of Object.entries(report.code_proofs_by_key || {})) {
    for (const photo of photos || []) {
      push(photo, `legacy-code-key-${key}-${photo.id || order}`, 'code_excerpt', 'code-proof', 'إثبات كود', key);
    }
  }
  for (const [section, items] of [
    ['firefighting', report.firefighting_items],
    ['ventilation', report.ventilation_items],
    ['alarm', report.alarm_items],
    ['exits', report.exits_items],
  ] as const) {
    for (const item of items || []) {
      for (const photo of item.photos || []) {
        push(
          photo,
          `legacy-system-${section}-${item.id}-${photo.id || order}`,
          'safety_system',
          'system-photo',
          `صورة نظام: ${item.id}`,
          section
        );
      }
    }
  }
  return result;
}

/** Pure, ordered presentation view that combines persisted Phase 4A and legacy evidence. */
export function buildTechnicalReportEvidenceView(
  report: TechnicalReport
): TechnicalEvidenceViewItem[] {
  const current = normalizeTechnicalEvidenceState(report.evidence).items.map((item) => ({
    ...item,
    source: 'evidence' as const,
  }));
  const legacy = buildLegacyTechnicalEvidenceView(report);
  return [...current, ...legacy].sort(
    (a, b) =>
      a.display_order - b.display_order ||
      a.created_at.localeCompare(b.created_at) ||
      a.id.localeCompare(b.id)
  );
}

/** Creates the metadata-first deletion payload. It does not touch Storage. */
export function prepareTechnicalEvidenceDeletion(
  raw: TechnicalEvidenceState | null | undefined,
  evidenceIdValue: string
): PreparedTechnicalEvidenceDeletion | null {
  const state = normalizeTechnicalEvidenceState(raw);
  const item = state.items.find((candidate) => candidate.id === evidenceIdValue);
  if (!item) return null;
  const cleanup = item.file.storagePath && item.file.storageBucket
    ? {
        id: cleanupId(),
        evidence_id: item.id,
        kind: item.kind,
        storage_bucket: item.file.storageBucket,
        storage_path: item.file.storagePath,
        attempts: 0,
        created_at: now(),
      }
    : null;
  return {
    nextState: {
      ...state,
      items: state.items.filter((candidate) => candidate.id !== evidenceIdValue),
    },
    cleanup,
  };
}

async function deleteStoredEvidenceAfterMetadata(params: {
  clientId: string;
  evidenceId: string;
  kind: TechnicalEvidenceKind;
  cleanup: TechnicalEvidenceCleanup;
}): Promise<{ ok: boolean; error?: string }> {
  const permitted = isTechnicalEvidenceStoragePath({
    clientId: params.clientId,
    evidenceId: params.evidenceId,
    kind: params.kind,
    storageBucket: params.cleanup.storage_bucket,
    storagePath: params.cleanup.storage_path,
  });
  if (!permitted) return { ok: false, error: 'مسار دليل غير مصرح به للحذف.' };
  if (isDemoMode) return { ok: true };
  const { error } = await supabase.storage
    .from(TECHNICAL_EVIDENCE_BUCKET)
    .remove([params.cleanup.storage_path]);
  return error ? { ok: false, error: error.message } : { ok: true };
}

/**
 * Safe deletion protocol: persist metadata removal first, then delete Storage.
 * A failed Storage deletion leaves valid project state plus a retry token.
 */
export async function deleteTechnicalEvidenceSafely(params: {
  clientId: string;
  raw: TechnicalEvidenceState | null | undefined;
  evidenceId: string;
  persistMetadata: (state: TechnicalEvidenceState) => Promise<void>;
}): Promise<TechnicalEvidenceDeletionResult> {
  const prepared = prepareTechnicalEvidenceDeletion(params.raw, params.evidenceId);
  if (!prepared) {
    return {
      state: normalizeTechnicalEvidenceState(params.raw),
      metadataPersisted: false,
      storageDeleteAttempted: false,
      storageDeleted: false,
      cleanupPending: false,
      error: 'الدليل غير موجود.',
    };
  }

  try {
    await params.persistMetadata(prepared.nextState);
  } catch (error) {
    return {
      state: normalizeTechnicalEvidenceState(params.raw),
      metadataPersisted: false,
      storageDeleteAttempted: false,
      storageDeleted: false,
      cleanupPending: false,
      error: error instanceof Error ? error.message : 'تعذر حفظ إزالة الدليل.',
    };
  }

  const removed = prepared.nextState.items.find((item) => item.id === params.evidenceId);
  const original = normalizeTechnicalEvidenceState(params.raw).items.find(
    (item) => item.id === params.evidenceId
  );
  if (!prepared.cleanup || !original) {
    return {
      state: prepared.nextState,
      metadataPersisted: true,
      storageDeleteAttempted: false,
      storageDeleted: true,
      cleanupPending: false,
    };
  }
  void removed;

  const storage = await deleteStoredEvidenceAfterMetadata({
    clientId: params.clientId,
    evidenceId: original.id,
    kind: original.kind,
    cleanup: prepared.cleanup,
  });
  if (storage.ok) {
    return {
      state: prepared.nextState,
      metadataPersisted: true,
      storageDeleteAttempted: true,
      storageDeleted: true,
      cleanupPending: false,
    };
  }

  const retryState: TechnicalEvidenceState = {
    ...prepared.nextState,
    cleanup_pending: [
      ...(prepared.nextState.cleanup_pending || []),
      {
        ...prepared.cleanup,
        attempts: 1,
        last_error: storage.error || 'storage_delete_failed',
      },
    ],
  };
  try {
    await params.persistMetadata(retryState);
  } catch {
    // The authoritative metadata removal already succeeded; do not restore a stale reference.
  }
  return {
    state: retryState,
    metadataPersisted: true,
    storageDeleteAttempted: true,
    storageDeleted: false,
    cleanupPending: true,
    error: storage.error || 'تعذر حذف الملف من التخزين؛ سيسجل للتنظيف الآمن لاحقًا.',
  };
}

/** Retry previously recorded cleanup jobs only; metadata references are already absent. */
export async function retryPendingTechnicalEvidenceCleanup(params: {
  clientId: string;
  raw: TechnicalEvidenceState | null | undefined;
}): Promise<TechnicalEvidenceState> {
  const state = normalizeTechnicalEvidenceState(params.raw);
  const remaining: TechnicalEvidenceCleanup[] = [];
  for (const cleanup of state.cleanup_pending || []) {
    const result = await deleteStoredEvidenceAfterMetadata({
      clientId: params.clientId,
      evidenceId: cleanup.evidence_id,
      kind: cleanup.kind,
      cleanup,
    });
    if (!result.ok) {
      remaining.push({
        ...cleanup,
        attempts: cleanup.attempts + 1,
        last_error: result.error || 'storage_delete_failed',
      });
    }
  }
  return { ...state, cleanup_pending: remaining };
}
