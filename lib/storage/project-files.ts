/**
 * Project engineering file uploads → Supabase Storage (bucket: project-files)
 * Cross-device sync requires a real storagePath. Inline dataUrl is a last resort
 * for tiny files only when Storage is unavailable.
 */

import { isDemoMode, supabase } from '@/lib/supabase';
import { humanizeFetchError, isHtmlAsJsonError } from '@/lib/api/safe-json';
import type { PlanAttachmentFile } from '@/lib/types/project-reports';

export const PROJECT_FILES_BUCKET = 'project-files';
/** Inline preview only under this size when Storage unavailable */
export const INLINE_PREVIEW_MAX_BYTES = 1_500_000;
/** Prefer Storage for anything above this; avoid embedding large PDFs in JSONB */
export const FORCE_STORAGE_MIN_BYTES = 350_000;

/** User-facing Arabic explanation when Storage upload fails (bucket may already exist). */
export function formatProjectFilesStorageError(fileName: string, storageMsg: string): string {
  const detail = String(storageMsg || '').trim();
  const lower = detail.toLowerCase();
  const mimeIssue = /mime|content.type|not supported|invalid.*type/i.test(detail);
  const rlsIssue = /row-level security|rls|policy|permission|unauthorized|jwt|403|401/i.test(
    lower
  );
  const missingBucket = /bucket not found|no such bucket|does not exist/i.test(lower);
  const invalidKey = /invalid key|invalid.*path|not a valid key/i.test(lower);

  const cause = missingBucket
    ? 'السبب: مجلد project-files غير موجود في هذا المشروع.'
    : invalidKey
      ? 'السبب: اسم الملف يحتوي حروفاً غير مسموحة في مفتاح التخزين (مثل العربية). يجب أن يكون مسار Storage بأحرف لاتينية فقط مع الإبقاء على الاسم الأصلي للعرض.'
    : rlsIssue
      ? 'السبب الأرجح: صلاحيات الرفع (Policies) تمنع المستخدم الحالي رغم وجود المجلد.'
      : mimeIssue
        ? 'السبب الأرجح: نوع الملف غير مسموح في إعدادات الـ bucket (MIME types).'
        : detail
          ? `تفاصيل الخطأ من Supabase: ${detail}`
          : 'السبب غير واضح من رسالة التخزين.';

  return [
    `تعذر حفظ الملف «${fileName}» في السحابة — لذلك لم يُسجَّل في «إدارة إصدارات المخططات».`,
    cause,
    missingBucket
      ? 'الحل: أنشئ bucket باسم project-files أو نفّذ سكربت إعداد التخزين 028.'
      : 'الحل: من Storage → project-files → Policies تأكد أن INSERT مسموح لـ anon و authenticated، ومن Settings اسمح بـ application/pdf و application/octet-stream (أو اترك قائمة الأنواع فارغة للسماح للكل)، ثم أعد الرفع.',
    'ملاحظة: ظهور اسم الملف في خانة الاختيار لا يعني أنه حُفظ — النجاح = ظهوره تحت إدارة الإصدارات.',
  ].join(' ');
}

function resolveUploadContentType(file: File): string {
  const name = file.name.toLowerCase();
  if (file.type && file.type !== 'application/octet-stream') return file.type;
  if (name.endsWith('.pdf')) return 'application/pdf';
  if (name.endsWith('.png')) return 'image/png';
  if (name.endsWith('.jpg') || name.endsWith('.jpeg')) return 'image/jpeg';
  if (name.endsWith('.dwg')) return 'application/acad';
  if (name.endsWith('.dxf')) return 'application/dxf';
  if (name.endsWith('.ifc')) return 'application/octet-stream';
  if (name.endsWith('.rvt') || name.endsWith('.rfa')) return 'application/octet-stream';
  return file.type || 'application/octet-stream';
}

function uid() {
  return `att-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function extOf(name: string): string {
  const n = name.toLowerCase();
  const ext = n.includes('.') ? n.split('.').pop() || 'bin' : 'bin';
  const safe = ext.replace(/[^a-z0-9]/g, '');
  return safe || 'bin';
}

/**
 * Supabase Storage object keys must be ASCII-safe.
 * Arabic filenames (e.g. الفندق.pdf) cause: Invalid key.
 * Keep the original name in metadata (`fileName`) for UI; only sanitize the Storage path.
 */
export function sanitizeStorageFileName(originalName: string): string {
  const raw = String(originalName || 'file').trim() || 'file';
  const lastDot = raw.lastIndexOf('.');
  const base = lastDot > 0 ? raw.slice(0, lastDot) : raw;
  const ext = lastDot > 0 ? extOf(raw) : '';

  const asciiBase = base
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    // Drop Arabic and any other non-ASCII — Storage rejects them
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[._-]+|[._-]+$/g, '')
    .slice(0, 80);

  const stem = asciiBase || 'file';
  return ext ? `${stem}.${ext}` : stem;
}

/** `{folder}/.../{id}-{safeAsciiName}` — never puts Arabic in the object key */
export function buildStorageObjectPath(
  parts: string[],
  id: string,
  originalFileName: string
): string {
  const safeName = sanitizeStorageFileName(originalFileName);
  const safeId = String(id || 'id')
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '') || 'id';
  const safeParts = parts
    .map((p) => {
      const cleaned = String(p || 'x')
        .replace(/[^A-Za-z0-9._-]+/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_|_$/g, '');
      return cleaned || 'x';
    })
    .filter(Boolean);
  return [...safeParts, `${safeId}-${safeName}`].join('/');
}

async function readDataUrl(file: File): Promise<string | null> {
  if (file.size >= INLINE_PREVIEW_MAX_BYTES) return null;
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}

export type PlanUploadOutcome = {
  file: PlanAttachmentFile;
  /** True when object lives in Supabase Storage (visible from other devices) */
  cloudPersisted: boolean;
  warning?: string | null;
};

/**
 * Upload a plan attachment. Prefer Storage path; keep small dataUrl for preview when possible.
 */
export async function uploadPlanAttachment(
  file: File,
  kind: PlanAttachmentFile['kind'],
  opts?: { clientId?: string | null }
): Promise<PlanAttachmentFile> {
  const outcome = await uploadPlanAttachmentDetailed(file, kind, opts);
  return outcome.file;
}

export async function uploadPlanAttachmentDetailed(
  file: File,
  kind: PlanAttachmentFile['kind'],
  opts?: { clientId?: string | null }
): Promise<PlanUploadOutcome> {
  const id = uid();
  const format = extOf(file.name);
  const base: PlanAttachmentFile = {
    id,
    fileName: file.name,
    format,
    sizeBytes: file.size,
    mimeType: file.type || null,
    dataUrl: null,
    uploadedAt: new Date().toISOString(),
    kind,
    storageBucket: PROJECT_FILES_BUCKET,
    storagePath: null,
  };

  if (isDemoMode) {
    base.dataUrl = await readDataUrl(file);
    if (!base.dataUrl && file.size >= INLINE_PREVIEW_MAX_BYTES) {
      throw new Error(
        `الوضع التجريبي لا يدعم ملفات أكبر من ${(INLINE_PREVIEW_MAX_BYTES / 1e6).toFixed(1)}MB بدون Supabase Storage.`
      );
    }
    return {
      file: base,
      cloudPersisted: false,
      warning: 'وضع تجريبي — الملف لن يظهر من جهاز/متصفح آخر حتى يُضبط Supabase.',
    };
  }

  const folder = opts?.clientId || 'general';
  // Keep original Arabic name in base.fileName for UI; Storage key is ASCII-only
  const path = buildStorageObjectPath([folder, kind], id, file.name);

  const { error } = await supabase.storage.from(PROJECT_FILES_BUCKET).upload(path, file, {
    contentType: resolveUploadContentType(file),
    upsert: false,
  });

  if (error) {
    const inline = await readDataUrl(file);
    const storageMsg = isHtmlAsJsonError(error.message)
      ? humanizeFetchError(error.message)
      : error.message;
    if (!inline || file.size >= FORCE_STORAGE_MIN_BYTES) {
      throw new Error(formatProjectFilesStorageError(file.name, storageMsg));
    }
    base.dataUrl = inline;
    base.storagePath = null;
    return {
      file: base,
      cloudPersisted: false,
      warning:
        `حُفظت معاينة محلية فقط (رفع السحابة فشل: ${storageMsg}). ` +
        `تحقق من Policies وأنواع الملفات المسموحة على bucket project-files — المجلد قد يكون موجوداً لكن الرفع مرفوض.`,
    };
  }

  const { data: pub } = supabase.storage.from(PROJECT_FILES_BUCKET).getPublicUrl(path);
  base.storagePath = path;
  base.storageBucket = PROJECT_FILES_BUCKET;
  // Do not embed large PDFs into project_engineering_data — other devices use signed URLs
  if (file.size < 120_000) {
    base.dataUrl = await readDataUrl(file);
  } else {
    base.dataUrl = null;
  }

  return {
    file: base,
    cloudPersisted: true,
    warning: pub?.publicUrl
      ? null
      : 'تم الرفع إلى Storage — المعاينة عبر رابط موقّع عند الفتح.',
  };
}

/** Upload completion-certificate supporting document */
export async function uploadCompletionAttachment(
  file: File,
  kind: import('@/lib/projects/completion-certificate-attachments').CompletionAttachmentKind,
  opts?: { clientId?: string | null }
): Promise<import('@/lib/projects/completion-certificate-attachments').CompletionAttachmentFile> {
  const id = uid();
  const format = extOf(file.name);
  const base: import('@/lib/projects/completion-certificate-attachments').CompletionAttachmentFile = {
    id,
    fileName: file.name,
    format,
    sizeBytes: file.size,
    mimeType: file.type || null,
    dataUrl: null,
    uploadedAt: new Date().toISOString(),
    kind,
    storageBucket: PROJECT_FILES_BUCKET,
    storagePath: null,
  };

  if (isDemoMode) {
    base.dataUrl = await readDataUrl(file);
    return base;
  }

  const folder = opts?.clientId || 'general';
  const path = buildStorageObjectPath([folder, 'completion', kind], id, file.name);

  const { error } = await supabase.storage.from(PROJECT_FILES_BUCKET).upload(path, file, {
    contentType: resolveUploadContentType(file),
    upsert: false,
  });

  if (error) {
    base.dataUrl = await readDataUrl(file);
    if (!base.dataUrl) {
      throw new Error(
        `تعذر رفع مرفق الشهادة إلى Storage: ${error.message}. أنشئ bucket project-files (سكربت 028).`
      );
    }
    base.storagePath = null;
    return base;
  }

  const { data: pub } = supabase.storage.from(PROJECT_FILES_BUCKET).getPublicUrl(path);
  base.storagePath = path;
  if (file.size < 120_000) {
    base.dataUrl = await readDataUrl(file);
  } else if (pub?.publicUrl) {
    base.dataUrl = null;
  }

  return base;
}

export async function getPlanFileUrl(
  file: PlanAttachmentFile,
  opts?: { companyId?: string | null; ownerCompanyId?: string | null }
): Promise<string | null> {
  if (file.dataUrl && !file.dataUrl.startsWith('http')) return file.dataUrl;
  if (file.dataUrl?.startsWith('http') && !file.storagePath) return file.dataUrl;
  if (!file.storagePath || isDemoMode) {
    return file.dataUrl || null;
  }
  // Defense-in-depth: refuse minting when caller provides tenant context that does not own the path
  if (opts?.companyId) {
    const { storagePathBelongsToTenant } = await import('@/lib/storage/tenant-signed-url');
    if (!storagePathBelongsToTenant(file.storagePath, opts.companyId, opts.ownerCompanyId)) {
      return null;
    }
  }
  const bucket = file.storageBucket || PROJECT_FILES_BUCKET;
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(file.storagePath, 3600);
  if (error || !data?.signedUrl) {
    const pub = supabase.storage.from(bucket).getPublicUrl(file.storagePath);
    return pub.data.publicUrl || file.dataUrl || null;
  }
  return data.signedUrl;
}
