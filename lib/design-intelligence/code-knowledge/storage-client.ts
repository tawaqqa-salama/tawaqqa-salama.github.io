/**
 * Authenticated Supabase Storage access for Code Knowledge.
 * Private bucket only — signed / authenticated download. No public URLs. No anon.
 */

import { isDemoMode, supabase } from '@/lib/supabase';
import {
  CODE_KNOWLEDGE_STORAGE_BUCKET,
  buildCodeKnowledgeObjectPath,
} from '@/lib/design-intelligence/code-knowledge/storage-path';

export type StorageUploadResult = {
  ok: boolean;
  bucket: string;
  path: string | null;
  error?: string;
};

export type StorageDownloadResult = {
  ok: boolean;
  bytes: Uint8Array | null;
  error?: string;
};

export type StorageSignedUrlResult = {
  ok: boolean;
  signedUrl: string | null;
  error?: string;
};

export type StorageRemoveResult = {
  ok: boolean;
  error?: string;
};

/** Injectable for unit tests (in-memory fake). */
export type CodeKnowledgeStorageAdapter = {
  upload: (
    bucket: string,
    path: string,
    bytes: Uint8Array,
    opts?: { contentType?: string; upsert?: boolean }
  ) => Promise<StorageUploadResult>;
  download: (bucket: string, path: string) => Promise<StorageDownloadResult>;
  createSignedUrl: (
    bucket: string,
    path: string,
    expiresInSeconds?: number
  ) => Promise<StorageSignedUrlResult>;
  remove: (bucket: string, path: string) => Promise<StorageRemoveResult>;
};

const memoryBuckets = new Map<string, Map<string, Uint8Array>>();

let sharedMemoryAdapter: CodeKnowledgeStorageAdapter | null = null;

export function createInMemoryCodeKnowledgeStorage(): CodeKnowledgeStorageAdapter {
  return {
    async upload(bucket, path, bytes) {
      if (!memoryBuckets.has(bucket)) memoryBuckets.set(bucket, new Map());
      memoryBuckets.get(bucket)!.set(path, new Uint8Array(bytes));
      return { ok: true, bucket, path };
    },
    async download(bucket, path) {
      const bytes = memoryBuckets.get(bucket)?.get(path) ?? null;
      if (!bytes) return { ok: false, bytes: null, error: 'not_found' };
      return { ok: true, bytes: new Uint8Array(bytes) };
    },
    async createSignedUrl(bucket, path, expiresInSeconds = 3600) {
      const exists = memoryBuckets.get(bucket)?.has(path);
      if (!exists) return { ok: false, signedUrl: null, error: 'not_found' };
      return {
        ok: true,
        signedUrl: `memory://${bucket}/${path}?exp=${expiresInSeconds}`,
      };
    },
    async remove(bucket, path) {
      const bucketMap = memoryBuckets.get(bucket);
      if (!bucketMap?.has(path)) return { ok: false, error: 'not_found' };
      bucketMap.delete(path);
      return { ok: true };
    },
  };
}

export function getSharedInMemoryCodeKnowledgeStorage(): CodeKnowledgeStorageAdapter {
  if (!sharedMemoryAdapter) {
    sharedMemoryAdapter = createInMemoryCodeKnowledgeStorage();
  }
  return sharedMemoryAdapter;
}

export function resetInMemoryCodeKnowledgeStorage(): void {
  memoryBuckets.clear();
  sharedMemoryAdapter = createInMemoryCodeKnowledgeStorage();
}

export function getDefaultCodeKnowledgeStorage(): CodeKnowledgeStorageAdapter {
  if (isDemoMode) {
    return getSharedInMemoryCodeKnowledgeStorage();
  }
  return {
    async upload(bucket, path, bytes, opts) {
      const ab = bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength
      ) as ArrayBuffer;
      const blob = new Blob([ab], {
        type: opts?.contentType || 'application/octet-stream',
      });
      const { error } = await supabase.storage.from(bucket).upload(path, blob, {
        upsert: opts?.upsert !== false,
        contentType: opts?.contentType || undefined,
      });
      if (error) return { ok: false, bucket, path: null, error: error.message };
      return { ok: true, bucket, path };
    },
    async download(bucket, path) {
      const { data, error } = await supabase.storage.from(bucket).download(path);
      if (error || !data) {
        return { ok: false, bytes: null, error: error?.message || 'download_failed' };
      }
      const buf = await data.arrayBuffer();
      return { ok: true, bytes: new Uint8Array(buf) };
    },
    async createSignedUrl(bucket, path, expiresInSeconds = 3600) {
      const { data, error } = await supabase.storage
        .from(bucket)
        .createSignedUrl(path, expiresInSeconds);
      if (error || !data?.signedUrl) {
        return {
          ok: false,
          signedUrl: null,
          error: error?.message || 'signed_url_failed',
        };
      }
      return { ok: true, signedUrl: data.signedUrl };
    },
    async remove(bucket, path) {
      const { error } = await supabase.storage.from(bucket).remove([path]);
      if (error) return { ok: false, error: error.message };
      return { ok: true };
    },
  };
}

export function resolveCodeKnowledgeUploadPath(input: {
  companyId: string;
  code: string;
  edition: string;
  documentId: string;
  fileName: string;
}): { bucket: string; path: string } {
  return {
    bucket: CODE_KNOWLEDGE_STORAGE_BUCKET,
    path: buildCodeKnowledgeObjectPath(input),
  };
}
