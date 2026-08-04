/**
 * Upload quotation prerequisite documents → Supabase Storage (bucket: project-files)
 * Falls back to inline dataUrl for small files in demo mode.
 */

import { isDemoMode, supabase } from '@/lib/supabase';
import { INLINE_PREVIEW_MAX_BYTES, PROJECT_FILES_BUCKET } from '@/lib/storage/project-files';
import type { QuotationDocumentFile, QuotationDocumentKind } from '@/lib/types/quotation-documents';

function uid() {
  return `qdoc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
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

export async function uploadQuotationDocument(
  file: File,
  kind: QuotationDocumentKind,
  opts?: { clientId?: string | null }
): Promise<QuotationDocumentFile> {
  const id = uid();
  const format = extOf(file.name);
  const base: QuotationDocumentFile = {
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
  const path = `${folder}/quotation/${kind}/${id}-${file.name.replace(/[^\w.\u0600-\u06FF-]+/g, '_')}`;

  const { error } = await supabase.storage.from(PROJECT_FILES_BUCKET).upload(path, file, {
    contentType: file.type || 'application/octet-stream',
    upsert: false,
  });

  if (error) {
    base.dataUrl = await readDataUrl(file);
    base.storagePath = null;
    return base;
  }

  const { data: pub } = supabase.storage.from(PROJECT_FILES_BUCKET).getPublicUrl(path);
  base.storagePath = path;
  base.storageBucket = PROJECT_FILES_BUCKET;
  if (file.size < 400_000) {
    base.dataUrl = await readDataUrl(file);
  } else if (pub?.publicUrl) {
    base.dataUrl = pub.publicUrl;
  }

  return base;
}
