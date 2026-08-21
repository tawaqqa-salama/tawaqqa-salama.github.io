import { isDemoMode, supabase } from '@/lib/supabase';
import {
  PROJECT_FILES_BUCKET,
  buildStorageObjectPath,
  formatProjectFilesStorageError,
} from '@/lib/storage/project-files';
import { validateTechnicalEvidenceFile } from '@/lib/projects/technical-report-evidence';
import { normalizeFieldVisitObservations } from '@/lib/projects/field-visit-observations';
import type {
  FieldVisitEvidence,
  FieldVisitEvidenceCategory,
  FieldVisitEvidenceCleanup,
  FieldVisitEvidenceKind,
  FieldVisitEvidenceTiming,
  FieldVisitReport,
} from '@/lib/types/project-reports';

export const FIELD_VISIT_EVIDENCE_BUCKET = PROJECT_FILES_BUCKET;
export const FIELD_VISIT_EVIDENCE_FOLDER = 'field-visits';
export const FIELD_VISIT_EVIDENCE_LEAF = 'evidence';

export const FIELD_VISIT_EVIDENCE_CATEGORIES: Array<{ value: FieldVisitEvidenceCategory; label: string }> = [
  { value: 'general_site', label: 'الموقع العام' },
  { value: 'fire_fighting', label: 'أنظمة مكافحة الحريق' },
  { value: 'fire_alarm', label: 'نظام إنذار الحريق' },
  { value: 'emergency_lighting', label: 'الإنارة والطوارئ' },
  { value: 'exit_signage', label: 'لوحات ومخارج الطوارئ' },
  { value: 'means_of_egress', label: 'مسارات الإخلاء' },
  { value: 'electrical_safety', label: 'السلامة الكهربائية' },
  { value: 'mechanical_safety', label: 'السلامة الميكانيكية' },
  { value: 'architectural', label: 'معماري' },
  { value: 'civil_defense_requirement', label: 'متطلب الدفاع المدني' },
  { value: 'installation_quality', label: 'جودة التركيب' },
  { value: 'testing_commissioning', label: 'الاختبار والتشغيل' },
  { value: 'deficiency', label: 'ملاحظة أو قصور' },
  { value: 'corrective_action', label: 'إجراء تصحيحي' },
  { value: 'other', label: 'أخرى' },
];

export const FIELD_VISIT_EVIDENCE_TIMINGS: Array<{ value: FieldVisitEvidenceTiming; label: string }> = [
  { value: 'general', label: 'عام' },
  { value: 'before', label: 'قبل المعالجة' },
  { value: 'after', label: 'بعد المعالجة' },
];

const categoryValues = new Set(FIELD_VISIT_EVIDENCE_CATEGORIES.map((item) => item.value));
const timingValues = new Set(FIELD_VISIT_EVIDENCE_TIMINGS.map((item) => item.value));
const allowedMimeTypes = new Set(['image/jpeg', 'image/png', 'application/pdf']);

function now() {
  return new Date().toISOString();
}

function evidenceId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `visit-evidence-${crypto.randomUUID()}`;
  }
  return `visit-evidence-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function cleanupId() {
  return `visit-evidence-cleanup-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function validId(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9._-]{4,200}$/.test(value);
}

function validVisitNumber(value: unknown) {
  return Number.isInteger(Number(value)) && Number(value) > 0 && Number(value) < 10_000;
}

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function nullableText(value: unknown) {
  const result = text(value);
  return result || null;
}

function safeTimestamp(value: unknown) {
  const valueText = text(value);
  return valueText && !Number.isNaN(Date.parse(valueText)) ? valueText : null;
}

function kindForMime(mimeType: string): FieldVisitEvidenceKind {
  return mimeType.startsWith('image/') ? 'photo' : 'document';
}

function normalizeOrders(items: FieldVisitEvidence[]): FieldVisitEvidence[] {
  return [...items]
    .sort((a, b) => a.display_order - b.display_order || a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))
    .map((item, index) => ({ ...item, display_order: index + 1 }));
}

function normalizedFile(value: unknown): FieldVisitEvidence['file'] | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const mimeType = text(raw.mimeType).toLowerCase();
  if (!allowedMimeTypes.has(mimeType)) return null;
  const size = Number(raw.sizeBytes);
  return {
    fileName: text(raw.fileName) || 'مرفق ميداني',
    mimeType: mimeType as FieldVisitEvidence['file']['mimeType'],
    sizeBytes: Number.isFinite(size) && size >= 0 ? size : 0,
    storageBucket: text(raw.storageBucket) === FIELD_VISIT_EVIDENCE_BUCKET
      ? FIELD_VISIT_EVIDENCE_BUCKET
      : FIELD_VISIT_EVIDENCE_BUCKET,
    storagePath: nullableText(raw.storagePath),
  };
}

/**
 * Normalizes persisted visit evidence only. It strips transient or unknown metadata
 * by rebuilding the contract instead of spreading the raw object.
 */
export function normalizeFieldVisitEvidence(value: unknown): FieldVisitEvidence[] {
  if (!Array.isArray(value)) return [];
  const items: FieldVisitEvidence[] = [];
  for (const [index, candidate] of value.entries()) {
    if (!candidate || typeof candidate !== 'object') continue;
    const raw = candidate as Record<string, unknown>;
    const file = normalizedFile(raw.file);
    if (!file) continue;
    const id = validId(raw.id) ? raw.id : `legacy-visit-evidence-${index + 1}`;
    const category = categoryValues.has(raw.category as FieldVisitEvidenceCategory)
      ? (raw.category as FieldVisitEvidenceCategory)
      : 'other';
    const timing = timingValues.has(raw.timing as FieldVisitEvidenceTiming)
      ? (raw.timing as FieldVisitEvidenceTiming)
      : 'general';
    const createdAt = safeTimestamp(raw.created_at) || '';
    items.push({
      id,
      kind: kindForMime(file.mimeType),
      title: text(raw.title) || file.fileName,
      description: text(raw.description),
      engineer_note: text(raw.engineer_note),
      observation_id: nullableText(raw.observation_id),
      timing,
      category,
      file,
      display_order: Number.isFinite(Number(raw.display_order)) && Number(raw.display_order) > 0
        ? Math.trunc(Number(raw.display_order))
        : index + 1,
      include_in_visit_pdf: Boolean(raw.include_in_visit_pdf),
      captured_at: safeTimestamp(raw.captured_at),
      created_at: createdAt,
      ...(safeTimestamp(raw.updated_at) ? { updated_at: safeTimestamp(raw.updated_at)! } : {}),
    });
  }
  return normalizeOrders(items);
}

export function normalizeFieldVisitEvidenceLinks(
  evidence: FieldVisitEvidence[],
  observationIds: Iterable<string>
): FieldVisitEvidence[] {
  const ids = new Set(observationIds);
  return evidence.map((item) =>
    item.observation_id && !ids.has(item.observation_id)
      ? { ...item, observation_id: null }
      : item
  );
}

export function normalizeFieldVisitEvidenceCleanup(value: unknown): FieldVisitEvidenceCleanup[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((candidate) => {
    if (!candidate || typeof candidate !== 'object') return [];
    const raw = candidate as Record<string, unknown>;
    const id = validId(raw.id) ? raw.id : null;
    const evidenceId = validId(raw.evidence_id) ? raw.evidence_id : null;
    const storagePath = text(raw.storage_path);
    if (!id || !evidenceId || !storagePath || text(raw.storage_bucket) !== FIELD_VISIT_EVIDENCE_BUCKET) return [];
    return [{
      id,
      evidence_id: evidenceId,
      storage_bucket: FIELD_VISIT_EVIDENCE_BUCKET,
      storage_path: storagePath,
      attempts: Math.max(0, Math.trunc(Number(raw.attempts) || 0)),
      created_at: safeTimestamp(raw.created_at) || '',
      ...(text(raw.last_error) ? { last_error: text(raw.last_error) } : {}),
    }];
  });
}

export function normalizeFieldVisitEvidenceForVisit(visit: FieldVisitReport): FieldVisitReport {
  const observations = normalizeFieldVisitObservations(visit.observations);
  const evidence = normalizeFieldVisitEvidenceLinks(
    normalizeFieldVisitEvidence(visit.evidence),
    observations.map((observation) => observation.id)
  );
  return {
    ...visit,
    observations,
    evidence,
    evidence_cleanup_pending: normalizeFieldVisitEvidenceCleanup(visit.evidence_cleanup_pending),
  };
}

export function sanitizeFieldVisitEvidenceForPersist(params: {
  clientId: string;
  visit: FieldVisitReport;
}): FieldVisitReport {
  const normalized = normalizeFieldVisitEvidenceForVisit(params.visit);
  const evidence = (normalized.evidence || []).map((item) => {
    const storagePath = item.file.storagePath;
    if (!storagePath) return { ...item, file: { ...item.file, storagePath: null } };
    const permitted = isFieldVisitEvidenceStoragePath({
      clientId: params.clientId,
      visitNumber: normalized.visit_number,
      evidenceId: item.id,
      storageBucket: item.file.storageBucket,
      storagePath,
    });
    return permitted
      ? { ...item, file: { ...item.file, storageBucket: FIELD_VISIT_EVIDENCE_BUCKET } }
      : { ...item, file: { ...item.file, storageBucket: FIELD_VISIT_EVIDENCE_BUCKET, storagePath: null } };
  });
  return { ...normalized, evidence };
}

export function isFieldVisitEvidenceStoragePath(params: {
  clientId: string;
  visitNumber: number;
  evidenceId: string;
  storageBucket?: string | null;
  storagePath?: string | null;
}): boolean {
  const path = String(params.storagePath || '').trim();
  if (!validId(params.clientId) || !validVisitNumber(params.visitNumber) || !validId(params.evidenceId)) return false;
  if (params.storageBucket !== FIELD_VISIT_EVIDENCE_BUCKET) return false;
  if (!path || path.startsWith('/') || path.includes('..') || path.includes('\\') || /%(2e|2f|5c)/i.test(path)) return false;
  const segments = path.split('/');
  if (segments.length !== 5) return false;
  return segments[0] === params.clientId &&
    segments[1] === FIELD_VISIT_EVIDENCE_FOLDER &&
    segments[2] === `visit-${params.visitNumber}` &&
    segments[3] === FIELD_VISIT_EVIDENCE_LEAF &&
    segments[4].startsWith(`${params.evidenceId}-`);
}

export async function uploadFieldVisitEvidenceFile(params: {
  clientId: string;
  visitNumber: number;
  evidenceId?: string;
  file: File;
}): Promise<FieldVisitEvidence> {
  const validation = await validateTechnicalEvidenceFile(params.file);
  if (!validation.ok) throw new Error(validation.error);
  const id = params.evidenceId || evidenceId();
  if (!validId(params.clientId) || !validId(id) || !validVisitNumber(params.visitNumber)) {
    throw new Error('معرّف المشروع أو الزيارة أو الدليل غير صالح لمسار التخزين.');
  }
  if (isDemoMode) {
    throw new Error('يتطلب رفع الأدلة الميدانية تخزين المشروع الآمن؛ لا يمكن حفظ قاعدة64 أو معاينة محلية داخل بيانات الزيارة.');
  }
  const path = buildStorageObjectPath(
    [params.clientId, FIELD_VISIT_EVIDENCE_FOLDER, `visit-${params.visitNumber}`, FIELD_VISIT_EVIDENCE_LEAF],
    id,
    params.file.name
  );
  const { error } = await supabase.storage.from(FIELD_VISIT_EVIDENCE_BUCKET).upload(path, params.file, {
    contentType: validation.mimeType,
    upsert: false,
  });
  if (error) {
    const message = String(error.message || '');
    if (/file.*too.*large|payload.*too.*large|maximum.*file.*size|size.*exceed/i.test(message)) {
      throw new Error(`حجم الملف «${params.file.name}» يتجاوز الحد المسموح به في تخزين المشروع.`);
    }
    throw new Error(formatProjectFilesStorageError(params.file.name, message));
  }

  const created = now();
  return {
    id,
    kind: kindForMime(validation.mimeType),
    title: params.file.name,
    description: '',
    engineer_note: '',
    observation_id: null,
    timing: 'general',
    category: 'general_site',
    file: {
      fileName: params.file.name,
      mimeType: validation.mimeType,
      sizeBytes: params.file.size,
      storageBucket: FIELD_VISIT_EVIDENCE_BUCKET,
      storagePath: path,
    },
    display_order: 0,
    include_in_visit_pdf: false,
    captured_at: null,
    created_at: created,
  };
}

/** Create a signed URL only after the evidence path has passed exact visit ownership validation. */
export async function resolveFieldVisitEvidenceSrc(params: {
  clientId: string;
  visitNumber: number;
  item: FieldVisitEvidence;
}): Promise<string | null> {
  if (!params.item.file.storagePath) return null;
  if (!isFieldVisitEvidenceStoragePath({
    clientId: params.clientId,
    visitNumber: params.visitNumber,
    evidenceId: params.item.id,
    storageBucket: params.item.file.storageBucket,
    storagePath: params.item.file.storagePath,
  })) return null;
  if (isDemoMode) return null;
  const { data, error } = await supabase.storage
    .from(FIELD_VISIT_EVIDENCE_BUCKET)
    .createSignedUrl(params.item.file.storagePath, 60 * 60);
  return !error && data?.signedUrl ? data.signedUrl : null;
}

export function reorderFieldVisitEvidence(
  raw: FieldVisitEvidence[] | undefined,
  evidenceIdValue: string,
  direction: -1 | 1
): FieldVisitEvidence[] {
  const ordered = normalizeFieldVisitEvidence(raw);
  const index = ordered.findIndex((item) => item.id === evidenceIdValue);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= ordered.length) return ordered;
  [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
  return ordered.map((item, order) => ({
    ...item,
    display_order: order + 1,
    updated_at: now(),
  }));
}

export type PreparedFieldVisitEvidenceDeletion = {
  nextVisit: FieldVisitReport;
  cleanup: FieldVisitEvidenceCleanup | null;
};

/** Removes only evidence metadata. Storage is deliberately untouched until the next visit payload persists. */
export function prepareFieldVisitEvidenceDeletion(
  visit: FieldVisitReport,
  evidenceIdValue: string
): PreparedFieldVisitEvidenceDeletion | null {
  const normalized = normalizeFieldVisitEvidenceForVisit(visit);
  const item = (normalized.evidence || []).find((candidate) => candidate.id === evidenceIdValue);
  if (!item) return null;
  const cleanup = item.file.storagePath
    ? {
        id: cleanupId(),
        evidence_id: item.id,
        storage_bucket: item.file.storageBucket,
        storage_path: item.file.storagePath,
        attempts: 0,
        created_at: now(),
      }
    : null;
  return {
    nextVisit: {
      ...normalized,
      evidence: (normalized.evidence || []).filter((candidate) => candidate.id !== item.id),
    },
    cleanup,
  };
}

async function deleteStoredEvidenceAfterMetadata(params: {
  clientId: string;
  visitNumber: number;
  evidenceId: string;
  cleanup: FieldVisitEvidenceCleanup;
}): Promise<{ ok: boolean; error?: string }> {
  const permitted = isFieldVisitEvidenceStoragePath({
    clientId: params.clientId,
    visitNumber: params.visitNumber,
    evidenceId: params.evidenceId,
    storageBucket: params.cleanup.storage_bucket,
    storagePath: params.cleanup.storage_path,
  });
  if (!permitted) return { ok: false, error: 'مسار دليل الزيارة غير مصرح به للحذف.' };
  if (isDemoMode) return { ok: true };
  const { error } = await supabase.storage.from(FIELD_VISIT_EVIDENCE_BUCKET).remove([params.cleanup.storage_path]);
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function deleteFieldVisitEvidenceSafely(params: {
  clientId: string;
  visitNumber: number;
  visit: FieldVisitReport;
  evidenceId: string;
  persistVisitMetadata: (nextVisit: FieldVisitReport) => Promise<void>;
}): Promise<{ visit: FieldVisitReport; metadataPersisted: boolean; cleanupPending: boolean; error?: string }> {
  const prepared = prepareFieldVisitEvidenceDeletion(params.visit, params.evidenceId);
  if (!prepared) return { visit: normalizeFieldVisitEvidenceForVisit(params.visit), metadataPersisted: false, cleanupPending: false, error: 'الدليل غير موجود.' };
  try {
    await params.persistVisitMetadata(prepared.nextVisit);
  } catch (error) {
    return {
      visit: normalizeFieldVisitEvidenceForVisit(params.visit),
      metadataPersisted: false,
      cleanupPending: false,
      error: error instanceof Error ? error.message : 'تعذر حفظ إزالة بيانات الدليل.',
    };
  }
  if (!prepared.cleanup) return { visit: prepared.nextVisit, metadataPersisted: true, cleanupPending: false };
  const result = await deleteStoredEvidenceAfterMetadata({
    clientId: params.clientId,
    visitNumber: params.visitNumber,
    evidenceId: params.evidenceId,
    cleanup: prepared.cleanup,
  });
  if (result.ok) return { visit: prepared.nextVisit, metadataPersisted: true, cleanupPending: false };

  const retryVisit: FieldVisitReport = {
    ...prepared.nextVisit,
    evidence_cleanup_pending: [
      ...(prepared.nextVisit.evidence_cleanup_pending || []),
      { ...prepared.cleanup, attempts: 1, last_error: result.error || 'storage_delete_failed' },
    ],
  };
  try {
    await params.persistVisitMetadata(retryVisit);
  } catch {
    // Metadata removal already succeeded. Never restore a stale evidence reference.
  }
  return {
    visit: retryVisit,
    metadataPersisted: true,
    cleanupPending: true,
    error: result.error || 'تعذر حذف الملف من Storage؛ سيسجل للتنظيف الآمن لاحقًا.',
  };
}

export async function retryPendingFieldVisitEvidenceCleanup(params: {
  clientId: string;
  visitNumber: number;
  visit: FieldVisitReport;
}): Promise<FieldVisitReport> {
  const normalized = normalizeFieldVisitEvidenceForVisit(params.visit);
  const remaining: FieldVisitEvidenceCleanup[] = [];
  for (const cleanup of normalized.evidence_cleanup_pending || []) {
    const result = await deleteStoredEvidenceAfterMetadata({
      clientId: params.clientId,
      visitNumber: params.visitNumber,
      evidenceId: cleanup.evidence_id,
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
  return { ...normalized, evidence_cleanup_pending: remaining };
}

export function evidenceLabel<T extends string>(items: Array<{ value: T; label: string }>, value: T | null | undefined) {
  return items.find((item) => item.value === value)?.label || '—';
}
