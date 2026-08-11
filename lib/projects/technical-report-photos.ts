/**
 * Technical-report photos: upload to Storage so live-save can drop dataUrls
 * without losing print/UI images.
 */

import { isDemoMode, supabase } from '@/lib/supabase';
import {
  PROJECT_FILES_BUCKET,
  buildStorageObjectPath,
  formatProjectFilesStorageError,
} from '@/lib/storage/project-files';
import type {
  TechnicalReport,
  TechnicalReportPhoto,
  TechnicalReportSectionItem,
  TechnicalReportZone,
} from '@/lib/types/project-reports';

function uid() {
  return `tr-photo-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('تعذر قراءة الملف'));
    reader.readAsDataURL(file);
  });
}

function dataUrlToBlob(dataUrl: string): Blob | null {
  try {
    const m = /^data:([^;,]+)?(;base64)?,(.*)$/i.exec(dataUrl);
    if (!m) return null;
    const mime = m[1] || 'image/jpeg';
    const isBase64 = Boolean(m[2]);
    const data = m[3] || '';
    if (isBase64) {
      const bin = atob(data);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
      return new Blob([bytes], { type: mime });
    }
    return new Blob([decodeURIComponent(data)], { type: mime });
  } catch {
    return null;
  }
}

/** Upload a newly selected image for the technical report. */
export async function uploadTechnicalReportPhoto(params: {
  clientId: string;
  file: File;
  caption?: string;
}): Promise<TechnicalReportPhoto> {
  const id = uid();
  const dataUrl = await fileToDataUrl(params.file);
  const base: TechnicalReportPhoto = {
    id,
    caption: params.caption || params.file.name,
    dataUrl,
    fileName: params.file.name,
    mimeType: params.file.type || 'image/jpeg',
    storagePath: null,
    storageBucket: PROJECT_FILES_BUCKET,
  };

  if (isDemoMode) return base;

  const path = buildStorageObjectPath(
    [params.clientId, 'technical-report-photos'],
    id,
    params.file.name
  );
  const { error } = await supabase.storage.from(PROJECT_FILES_BUCKET).upload(path, params.file, {
    contentType: params.file.type || 'image/jpeg',
    upsert: false,
  });
  if (error) {
    // Keep local dataUrl so the engineer does not lose the image this session
    console.warn(formatProjectFilesStorageError(params.file.name, error.message));
    return base;
  }
  return {
    ...base,
    storagePath: path,
    storageBucket: PROJECT_FILES_BUCKET,
  };
}

/** Resolve a displayable src (dataUrl or signed/public Storage URL). */
export async function resolveTechnicalReportPhotoSrc(
  photo: TechnicalReportPhoto | null | undefined
): Promise<string | null> {
  if (!photo) return null;
  if (photo.dataUrl && photo.dataUrl.startsWith('data:')) return photo.dataUrl;
  if (!photo.storagePath) return photo.dataUrl || null;

  const bucket = photo.storageBucket || PROJECT_FILES_BUCKET;
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(photo.storagePath, 60 * 60 * 12);
  if (!error && data?.signedUrl) return data.signedUrl;

  const { data: pub } = supabase.storage.from(bucket).getPublicUrl(photo.storagePath);
  return pub?.publicUrl || photo.dataUrl || null;
}

async function ensurePhotoStored(
  clientId: string,
  photo: TechnicalReportPhoto | null | undefined
): Promise<TechnicalReportPhoto | null> {
  if (!photo) return null;
  if (photo.storagePath) {
    return { ...photo, dataUrl: undefined };
  }
  if (!photo.dataUrl?.startsWith('data:')) return photo;

  if (isDemoMode) return photo;

  const blob = dataUrlToBlob(photo.dataUrl);
  if (!blob) return photo;
  const fileName = photo.fileName || `${photo.id || 'photo'}.jpg`;
  const file = new File([blob], fileName, { type: photo.mimeType || blob.type || 'image/jpeg' });
  const path = buildStorageObjectPath(
    [clientId, 'technical-report-photos'],
    photo.id || uid(),
    fileName
  );
  const { error } = await supabase.storage.from(PROJECT_FILES_BUCKET).upload(path, file, {
    contentType: file.type,
    upsert: true,
  });
  if (error) {
    // Keep dataUrl if upload fails — better timeout risk than blank report
    return photo;
  }
  return {
    ...photo,
    storagePath: path,
    storageBucket: PROJECT_FILES_BUCKET,
    fileName,
    mimeType: file.type,
    dataUrl: undefined,
  };
}

async function mapSectionItems(
  clientId: string,
  items: TechnicalReportSectionItem[] | undefined
): Promise<TechnicalReportSectionItem[]> {
  return Promise.all(
    (items || []).map(async (item) => ({
      ...item,
      photos: (
        await Promise.all(item.photos.map((p) => ensurePhotoStored(clientId, p)))
      ).filter(Boolean) as TechnicalReportPhoto[],
    }))
  );
}

/**
 * Upload any inline-only photos to Storage before live save.
 * Returns a report safe for aggressive sanitize (storagePath kept, dataUrl dropped).
 */
export async function persistTechnicalReportPhotosToStorage(
  clientId: string,
  report: TechnicalReport
): Promise<TechnicalReport> {
  const proofs: TechnicalReport['code_proofs_by_key'] = {};
  for (const [key, list] of Object.entries(report.code_proofs_by_key || {})) {
    proofs[key] = (
      await Promise.all((list || []).map((p) => ensurePhotoStored(clientId, p)))
    ).filter(Boolean) as TechnicalReportPhoto[];
  }

  const floor_uses = await Promise.all(
    (report.floor_uses || []).map(async (floor) => ({
      ...floor,
      zones: await Promise.all(
        (floor.zones || []).map(async (zone: TechnicalReportZone) => ({
          ...zone,
          code_proof_photo: await ensurePhotoStored(clientId, zone.code_proof_photo),
        }))
      ),
    }))
  );

  return {
    ...report,
    earth_photo: await ensurePhotoStored(clientId, report.earth_photo),
    facade_photo: await ensurePhotoStored(clientId, report.facade_photo),
    site_photo: await ensurePhotoStored(clientId, report.site_photo),
    code_proof_photos: (
      await Promise.all((report.code_proof_photos || []).map((p) => ensurePhotoStored(clientId, p)))
    ).filter(Boolean) as TechnicalReportPhoto[],
    code_proofs_by_key: proofs,
    floor_uses,
    firefighting_items: await mapSectionItems(clientId, report.firefighting_items),
    ventilation_items: await mapSectionItems(clientId, report.ventilation_items),
    alarm_items: await mapSectionItems(clientId, report.alarm_items),
    exits_items: await mapSectionItems(clientId, report.exits_items),
  };
}

async function hydratePhoto(
  photo: TechnicalReportPhoto | null | undefined
): Promise<TechnicalReportPhoto | null> {
  if (!photo) return null;
  if (photo.dataUrl?.startsWith('data:')) return photo;
  const src = await resolveTechnicalReportPhotoSrc(photo);
  if (!src) return photo;
  // Use signed URL as dataUrl-compatible display src for print/UI helpers
  return { ...photo, dataUrl: src };
}

async function hydrateSectionItems(
  items: TechnicalReportSectionItem[] | undefined
): Promise<TechnicalReportSectionItem[]> {
  return Promise.all(
    (items || []).map(async (item) => ({
      ...item,
      photos: (
        await Promise.all(item.photos.map((p) => hydratePhoto(p)))
      ).filter(Boolean) as TechnicalReportPhoto[],
    }))
  );
}

/** Fill displayable srcs from Storage for UI + print. */
export async function hydrateTechnicalReportPhotosForDisplay(
  report: TechnicalReport
): Promise<TechnicalReport> {
  const proofs: TechnicalReport['code_proofs_by_key'] = {};
  for (const [key, list] of Object.entries(report.code_proofs_by_key || {})) {
    proofs[key] = (
      await Promise.all((list || []).map((p) => hydratePhoto(p)))
    ).filter(Boolean) as TechnicalReportPhoto[];
  }

  return {
    ...report,
    earth_photo: await hydratePhoto(report.earth_photo),
    facade_photo: await hydratePhoto(report.facade_photo),
    site_photo: await hydratePhoto(report.site_photo),
    code_proof_photos: (
      await Promise.all((report.code_proof_photos || []).map((p) => hydratePhoto(p)))
    ).filter(Boolean) as TechnicalReportPhoto[],
    code_proofs_by_key: proofs,
    floor_uses: await Promise.all(
      (report.floor_uses || []).map(async (floor) => ({
        ...floor,
        zones: await Promise.all(
          (floor.zones || []).map(async (zone) => ({
            ...zone,
            code_proof_photo: await hydratePhoto(zone.code_proof_photo),
          }))
        ),
      }))
    ),
    firefighting_items: await hydrateSectionItems(report.firefighting_items),
    ventilation_items: await hydrateSectionItems(report.ventilation_items),
    alarm_items: await hydrateSectionItems(report.alarm_items),
    exits_items: await hydrateSectionItems(report.exits_items),
  };
}

/** Prefer photo that still has display bytes or a storage path. */
export function preferTechnicalReportPhoto(
  local: TechnicalReportPhoto | null | undefined,
  remote: TechnicalReportPhoto | null | undefined
): TechnicalReportPhoto | null {
  if (remote?.dataUrl) return remote;
  if (local?.dataUrl) return { ...remote, ...local, storagePath: remote?.storagePath || local.storagePath };
  if (remote?.storagePath) return remote;
  if (local?.storagePath) return local;
  return remote || local || null;
}
