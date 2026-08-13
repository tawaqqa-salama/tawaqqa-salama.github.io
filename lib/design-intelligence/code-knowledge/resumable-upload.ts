/**
 * Browser resumable uploads to Supabase Storage via TUS protocol.
 * Used for large files (≥ 6MB) so iPhone/Safari do not rely on a single PUT.
 *
 * Does not change PDF extraction / RAG — upload-only hardening.
 */

import * as tus from 'tus-js-client';
import { getSupabaseProjectRef, isSupabaseConfigured, supabase } from '@/lib/supabase';
import { CODE_KNOWLEDGE_STORAGE_BUCKET } from '@/lib/design-intelligence/code-knowledge/storage-path';

/** Bucket max object size after 048 migration (500 MiB). */
export const DESIGN_KNOWLEDGE_FILE_SIZE_LIMIT_BYTES = 500 * 1024 * 1024;

/** Switch to TUS at/above this size (Supabase recommends ≥ 6MB). */
export const RESUMABLE_UPLOAD_THRESHOLD_BYTES = 6 * 1024 * 1024;

/** Required by current Supabase TUS implementation — do not change. */
export const TUS_CHUNK_SIZE_BYTES = 6 * 1024 * 1024;

export type UploadPhase =
  | 'uploading'
  | 'upload_paused'
  | 'uploaded'
  | 'extracting'
  | 'chunking'
  | 'indexing'
  | 'indexed'
  | 'failed';

export type ResumableUploadProgress = {
  bytesUploaded: number;
  bytesTotal: number;
  percent: number;
};

export type ResumableUploadHandle = {
  pause: () => void;
  resume: () => void;
  abort: () => void;
};

export type ResumableUploadResult =
  | { ok: true; bucket: string; path: string; method: 'tus' | 'standard' }
  | { ok: false; error: string; method: 'tus' | 'standard' };

function tusEndpoint(): string {
  const ref = getSupabaseProjectRef();
  if (ref) {
    // Direct storage hostname — better for large uploads
    return `https://${ref}.storage.supabase.co/storage/v1/upload/resumable`;
  }
  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '');
  return `${base}/storage/v1/upload/resumable`;
}

export function shouldUseResumableUpload(byteLength: number): boolean {
  return byteLength >= RESUMABLE_UPLOAD_THRESHOLD_BYTES;
}

export function assertWithinBucketLimit(byteLength: number): string | null {
  if (byteLength > DESIGN_KNOWLEDGE_FILE_SIZE_LIMIT_BYTES) {
    return `file_too_large: ${byteLength} bytes exceeds bucket limit ${DESIGN_KNOWLEDGE_FILE_SIZE_LIMIT_BYTES}`;
  }
  return null;
}

/**
 * Resumable TUS upload of a browser File/Blob to design-knowledge.
 * Call only in browser with an authenticated session.
 */
export async function uploadKnowledgeFileResumable(input: {
  file: File | Blob;
  path: string;
  bucket?: string;
  contentType?: string;
  upsert?: boolean;
  onProgress?: (p: ResumableUploadProgress) => void;
  onPhase?: (phase: UploadPhase) => void;
  registerHandle?: (handle: ResumableUploadHandle) => void;
}): Promise<ResumableUploadResult> {
  if (typeof window === 'undefined') {
    return {
      ok: false,
      error: 'resumable_upload_browser_only',
      method: 'tus',
    };
  }
  if (!isSupabaseConfigured) {
    return { ok: false, error: 'supabase_not_configured', method: 'tus' };
  }

  const size =
    typeof input.file.size === 'number' ? input.file.size : 0;
  const limitErr = assertWithinBucketLimit(size);
  if (limitErr) return { ok: false, error: limitErr, method: 'tus' };

  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) {
    return { ok: false, error: 'auth_session_required_for_upload', method: 'tus' };
  }

  const bucket = input.bucket || CODE_KNOWLEDGE_STORAGE_BUCKET;
  const contentType =
    input.contentType ||
    (input.file instanceof File ? input.file.type : '') ||
    'application/octet-stream';

  input.onPhase?.('uploading');

  return new Promise<ResumableUploadResult>((resolve) => {
    let settled = false;
    const finish = (result: ResumableUploadResult) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    const upload = new tus.Upload(input.file, {
      endpoint: tusEndpoint(),
      retryDelays: [0, 1000, 3000, 5000, 10000, 20000],
      headers: {
        authorization: `Bearer ${token}`,
        apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
        'x-upsert': input.upsert === false ? 'false' : 'true',
      },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      chunkSize: TUS_CHUNK_SIZE_BYTES,
      metadata: {
        bucketName: bucket,
        objectName: input.path,
        contentType,
        cacheControl: '3600',
      },
      onError(error) {
        input.onPhase?.('failed');
        finish({
          ok: false,
          error: error?.message || String(error) || 'tus_upload_failed',
          method: 'tus',
        });
      },
      onProgress(bytesUploaded, bytesTotal) {
        const total = bytesTotal || size || 1;
        const percent = Math.min(100, Math.round((bytesUploaded / total) * 100));
        input.onProgress?.({
          bytesUploaded,
          bytesTotal: total,
          percent,
        });
      },
      onSuccess() {
        input.onProgress?.({
          bytesUploaded: size,
          bytesTotal: size || 1,
          percent: 100,
        });
        input.onPhase?.('uploaded');
        finish({ ok: true, bucket, path: input.path, method: 'tus' });
      },
    });

    input.registerHandle?.({
      pause: () => {
        // Do NOT terminate — keep upload URL for resume
        void upload.abort(false);
        input.onPhase?.('upload_paused');
      },
      resume: () => {
        input.onPhase?.('uploading');
        void upload.findPreviousUploads().then((prev) => {
          if (prev.length) upload.resumeFromPreviousUpload(prev[0]);
          upload.start();
        });
      },
      abort: () => {
        void upload.abort(true);
        input.onPhase?.('failed');
        finish({ ok: false, error: 'upload_aborted', method: 'tus' });
      },
    });

    void upload.findPreviousUploads().then((previousUploads) => {
      if (previousUploads.length) {
        upload.resumeFromPreviousUpload(previousUploads[0]);
      }
      upload.start();
    });
  });
}
