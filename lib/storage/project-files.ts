/**
 * Project engineering file uploads → Supabase Storage (bucket: project-files)
 * Falls back to inline dataUrl for small files in demo mode.
 */

import { isDemoMode, supabase } from '@/lib/supabase';
import type { PlanAttachmentFile } from '@/lib/types/project-reports';

export const PROJECT_FILES_BUCKET = 'project-files';
/** Inline preview only under this size when Storage unavailable */
export const INLINE_PREVIEW_MAX_BYTES = 1_500_000;

function uid() {
  return `att-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function extOf(name: string): string {
  const n = name.toLowerCase();
  return n.includes('.') ? n.split('.').pop() || 'bin' : 'bin';
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

/**
 * Upload a plan attachment. Prefer Storage path; keep small dataUrl for preview when possible.
 */
export async function uploadPlanAttachment(
  file: File,
  kind: PlanAttachmentFile['kind'],
  opts?: { clientId?: string | null }
): Promise<PlanAttachmentFile> {
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
    return base;
  }

  const folder = opts?.clientId || 'general';
  const path = `${folder}/${kind}/${id}-${file.name.replace(/[^\w.\u0600-\u06FF-]+/g, '_')}`;

  const { error } = await supabase.storage.from(PROJECT_FILES_BUCKET).upload(path, file, {
    contentType: file.type || 'application/octet-stream',
    upsert: false,
  });

  if (error) {
    // Bucket missing or storage unavailable — fall back to inline for small files
    base.dataUrl = await readDataUrl(file);
    base.storagePath = null;
    return base;
  }

  const { data: pub } = supabase.storage.from(PROJECT_FILES_BUCKET).getPublicUrl(path);
  base.storagePath = path;
  base.storageBucket = PROJECT_FILES_BUCKET;
  // Prefer signed/public URL for preview; also keep tiny inline for offline print if small
  if (file.size < 400_000) {
    base.dataUrl = await readDataUrl(file);
  } else if (pub?.publicUrl) {
    base.dataUrl = pub.publicUrl;
  }

  return base;
}

export async function getPlanFileUrl(file: PlanAttachmentFile): Promise<string | null> {
  if (file.dataUrl) return file.dataUrl;
  if (!file.storagePath || isDemoMode) return null;
  const bucket = file.storageBucket || PROJECT_FILES_BUCKET;
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(file.storagePath, 3600);
  if (error || !data?.signedUrl) {
    const pub = supabase.storage.from(bucket).getPublicUrl(file.storagePath);
    return pub.data.publicUrl || null;
  }
  return data.signedUrl;
}
