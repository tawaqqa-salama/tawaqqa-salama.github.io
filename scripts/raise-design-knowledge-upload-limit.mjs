#!/usr/bin/env node
/**
 * Hosted Supabase Storage administration for the design-knowledge bucket.
 *
 * This script deliberately uses the supported Storage API rather than direct
 * DML against Supabase-managed storage.buckets. It requires a Management API
 * access token only to read the target project's global Storage limit and a
 * server-side project secret key at runtime. No secret value is logged.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import {
  DIAGNOSTIC_STAGING_SUPABASE_REF,
  PRODUCTION_SUPABASE_REF,
  VALIDATION_SUPABASE_REF,
  normalizeRef,
} from './branch-baseline-policy.mjs';

dotenv.config({ path: '.env.local' });
dotenv.config();

const SCRIPT_PATH = fileURLToPath(import.meta.url);

export const DESIGN_KNOWLEDGE_BUCKET_ID = 'design-knowledge';
export const DESIGN_KNOWLEDGE_FILE_SIZE_LIMIT = 1_073_741_824;
export const DESIGN_KNOWLEDGE_ALLOWED_MIME_TYPES = Object.freeze([
  'application/pdf',
  'application/octet-stream',
  'text/plain',
  'text/markdown',
  'image/png',
  'image/jpeg',
  'image/webp',
]);

export function getStorageAdminConfig(env = process.env) {
  return {
    projectRef: env.SUPABASE_PROJECT_ID ?? '',
    targetRef: env.GITHUB_REF_NAME ?? env.SUPABASE_TARGET_GIT_REF ?? '',
    accessToken: env.SUPABASE_ACCESS_TOKEN ?? '',
    allowApply: env.SUPABASE_STORAGE_ADMIN_APPLY,
    confirmation: env.SUPABASE_STORAGE_ADMIN_CONFIRM,
  };
}

export function assertStorageAdminTarget({
  projectRef,
  targetRef,
  accessToken,
  allowApply,
  confirmation,
}) {
  if (allowApply !== '1') {
    throw new Error('SUPABASE_STORAGE_ADMIN_APPLY=1 is required; Storage administration is disabled by default.');
  }
  if (confirmation !== 'CONFIGURE_DESIGN_KNOWLEDGE_STORAGE') {
    throw new Error('SUPABASE_STORAGE_ADMIN_CONFIRM=CONFIGURE_DESIGN_KNOWLEDGE_STORAGE is required.');
  }

  const normalizedProjectRef = normalizeRef(projectRef);
  if ([PRODUCTION_SUPABASE_REF, DIAGNOSTIC_STAGING_SUPABASE_REF].includes(normalizedProjectRef)) {
    throw new Error(`Refusing protected Supabase project ref: ${normalizedProjectRef}`);
  }
  if (normalizedProjectRef !== VALIDATION_SUPABASE_REF) {
    throw new Error(`Refusing non-validation Supabase project ref: ${projectRef || '<empty>'}`);
  }

  const normalizedTargetRef = normalizeRef(targetRef);
  if (!normalizedTargetRef.startsWith('fix/') && !normalizedTargetRef.startsWith('feat/')) {
    throw new Error(`Refusing Storage administration on non-feature Git ref: ${targetRef || '<empty>'}`);
  }
  if (!accessToken) {
    throw new Error('SUPABASE_ACCESS_TOKEN is required for hosted Storage administration.');
  }
}

async function managementApiGet(pathname, accessToken, fetchImpl) {
  const response = await fetchImpl(`https://api.supabase.com${pathname}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  });
  if (!response.ok) {
    throw new Error(`Supabase Management API request failed with HTTP ${response.status}.`);
  }
  return response.json();
}

export async function readGlobalStorageLimit({ projectRef, accessToken, fetchImpl = fetch }) {
  const config = await managementApiGet(`/v1/projects/${projectRef}/config/storage`, accessToken, fetchImpl);
  const fileSizeLimit = Number(config?.fileSizeLimit);
  if (!Number.isFinite(fileSizeLimit) || fileSizeLimit < 0) {
    throw new Error('Supabase Management API returned an invalid global Storage file size limit.');
  }
  return fileSizeLimit;
}

export async function readProjectStorageAdminKey({ projectRef, accessToken, fetchImpl = fetch }) {
  const keys = await managementApiGet(`/v1/projects/${projectRef}/api-keys?reveal=true`, accessToken, fetchImpl);
  if (!Array.isArray(keys)) {
    throw new Error('Supabase Management API returned an invalid project API-key response.');
  }
  const selected = keys.find((key) => key?.type === 'secret' && key?.api_key)
    ?? keys.find((key) => key?.type === 'legacy' && key?.name === 'service_role' && key?.api_key);
  if (!selected?.api_key) {
    throw new Error('NEEDS CONFIGURATION: the validation project requires a server-side secret API key for Storage administration.');
  }
  return selected.api_key;
}

export async function ensureDesignKnowledgeBucket(storageClient) {
  const options = {
    public: false,
    fileSizeLimit: DESIGN_KNOWLEDGE_FILE_SIZE_LIMIT,
    allowedMimeTypes: [...DESIGN_KNOWLEDGE_ALLOWED_MIME_TYPES],
  };
  const listed = await storageClient.storage.listBuckets();
  if (listed.error) throw listed.error;
  const exists = (listed.data ?? []).some((bucket) => bucket.id === DESIGN_KNOWLEDGE_BUCKET_ID || bucket.name === DESIGN_KNOWLEDGE_BUCKET_ID);
  const mutation = exists
    ? await storageClient.storage.updateBucket(DESIGN_KNOWLEDGE_BUCKET_ID, options)
    : await storageClient.storage.createBucket(DESIGN_KNOWLEDGE_BUCKET_ID, options);
  if (mutation.error) throw mutation.error;

  const verified = await storageClient.storage.getBucket(DESIGN_KNOWLEDGE_BUCKET_ID);
  if (verified.error) throw verified.error;
  const bucket = verified.data;
  if (!bucket || bucket.public !== false || Number(bucket.file_size_limit) !== DESIGN_KNOWLEDGE_FILE_SIZE_LIMIT) {
    throw new Error('Hosted Storage API verification failed for the design-knowledge bucket contract.');
  }
  return { created: !exists, bucket };
}

export async function runStorageAdmin(env = process.env, dependencies = {}) {
  const config = getStorageAdminConfig(env);
  assertStorageAdminTarget(config);
  const fetchImpl = dependencies.fetchImpl ?? fetch;
  const createClientImpl = dependencies.createClientImpl ?? createClient;

  const globalLimit = await readGlobalStorageLimit({
    projectRef: config.projectRef,
    accessToken: config.accessToken,
    fetchImpl,
  });
  if (globalLimit < DESIGN_KNOWLEDGE_FILE_SIZE_LIMIT) {
    throw new Error(`NEEDS CONFIGURATION: Global Storage file size limit is ${globalLimit} bytes; configure at least ${DESIGN_KNOWLEDGE_FILE_SIZE_LIMIT} bytes before baseline.`);
  }

  const adminKey = await readProjectStorageAdminKey({
    projectRef: config.projectRef,
    accessToken: config.accessToken,
    fetchImpl,
  });
  const supabaseUrl = `https://${config.projectRef}.supabase.co`;
  const client = createClientImpl(supabaseUrl, adminKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const result = await ensureDesignKnowledgeBucket(client);
  console.log(`Hosted Storage API verified ${DESIGN_KNOWLEDGE_BUCKET_ID}: private=true, file_size_limit=${DESIGN_KNOWLEDGE_FILE_SIZE_LIMIT}, global_limit=${globalLimit}.`);
  return { ...result, globalLimit };
}

if (path.resolve(process.argv[1] ?? '') === SCRIPT_PATH) {
  await runStorageAdmin();
}
