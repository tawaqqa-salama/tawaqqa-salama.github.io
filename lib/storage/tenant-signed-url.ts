/**
 * Tenant-scoped storage signed URL helpers.
 * Never mint a signed URL from storagePath / document id alone.
 */

import { NextResponse } from 'next/server';
import { isDemoMode, supabase } from '@/lib/supabase';
import { PROJECT_FILES_BUCKET } from '@/lib/storage/project-files';
import type { TenantContext } from '@/lib/tenant/context';
import { notFoundTenantResource } from '@/lib/tenant/resource-scope';

export type StorageAccessResult =
  | { ok: true; clientId: string; companyId: string; storagePath: string }
  | { ok: false; reason: 'missing_tenant' | 'invalid_path' | 'not_found' };

/** First path segment is clientId (legacy) or companyId (041-compatible). */
export function parseStoragePathOwnerSegment(storagePath: string): string | null {
  const path = String(storagePath || '').replace(/^\/+/, '').trim();
  if (!path || path.includes('..') || path.includes('\\')) return null;
  const first = path.split('/')[0];
  if (!first || first.length < 4) return null;
  return first;
}

/**
 * Verify session tenant owns the storage object path via clients.company_id
 * (or path prefix === company id).
 */
export async function assertStoragePathTenantAccess(
  ctx: TenantContext,
  storagePath: string
): Promise<StorageAccessResult> {
  if (!ctx.tenantId) return { ok: false, reason: 'missing_tenant' };
  const owner = parseStoragePathOwnerSegment(storagePath);
  if (!owner) return { ok: false, reason: 'invalid_path' };

  // Direct company-prefix paths (041)
  if (owner === ctx.tenantId) {
    return {
      ok: true,
      clientId: owner,
      companyId: ctx.tenantId,
      storagePath: String(storagePath).replace(/^\/+/, ''),
    };
  }

  if (isDemoMode) {
    // Demo: only allow when path is explicitly tagged in tests via company match helpers
    return { ok: false, reason: 'not_found' };
  }

  const { data: client, error } = await supabase
    .from('clients')
    .select('id, company_id')
    .eq('id', owner)
    .maybeSingle();

  if (error || !client) return { ok: false, reason: 'not_found' };
  const companyId = (client as { company_id?: string }).company_id;
  if (!companyId || companyId !== ctx.tenantId) {
    return { ok: false, reason: 'not_found' };
  }

  return {
    ok: true,
    clientId: String(client.id),
    companyId,
    storagePath: String(storagePath).replace(/^\/+/, ''),
  };
}

export async function createTenantScopedSignedUrl(input: {
  ctx: TenantContext;
  storagePath: string;
  bucket?: string;
  expiresIn?: number;
}): Promise<
  | { ok: true; signedUrl: string; expiresIn: number }
  | { ok: false; response: NextResponse }
> {
  const access = await assertStoragePathTenantAccess(input.ctx, input.storagePath);
  if (!access.ok) {
    if (access.reason === 'missing_tenant') {
      return {
        ok: false,
        response: NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 }),
      };
    }
    return { ok: false, response: notFoundTenantResource('document') };
  }

  if (isDemoMode) {
    return {
      ok: true,
      signedUrl: `demo://signed/${access.storagePath}`,
      expiresIn: input.expiresIn ?? 3600,
    };
  }

  const bucket = input.bucket || PROJECT_FILES_BUCKET;
  const expiresIn = input.expiresIn ?? 3600;
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(access.storagePath, expiresIn);

  if (error || !data?.signedUrl) {
    return {
      ok: false,
      response: NextResponse.json({ ok: false, error: 'signed_url_failed' }, { status: 400 }),
    };
  }

  return { ok: true, signedUrl: data.signedUrl, expiresIn };
}

/**
 * Pure ownership check used by unit tests (no DB) when companyId of the
 * path owner is already known.
 */
export function storagePathBelongsToTenant(
  storagePath: string,
  tenantId: string,
  ownerCompanyId: string | null | undefined
): boolean {
  const owner = parseStoragePathOwnerSegment(storagePath);
  if (!owner || !tenantId) return false;
  if (owner === tenantId) return true;
  return Boolean(ownerCompanyId && ownerCompanyId === tenantId);
}
