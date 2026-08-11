/**
 * Central API authorization helpers.
 * Prefer these over reading companyId / roleCode from request bodies.
 */

import { NextResponse } from 'next/server';
import { requireApiSession, type ApiSessionResult } from '@/lib/api/require-session';
import {
  assertTenantRow,
  requirePermission,
  requireRole,
  TenantAccessError,
  type TenantContext,
} from '@/lib/tenant/context';
import { withTenantApi, tenantErrorResponse } from '@/lib/tenant/api-guard';
import { isSuperAdminRole } from '@/lib/tenant/rbac';
import type { CookieSessionPayload } from '@/lib/auth/session-cookie';
import type { PermissionCode } from '@/lib/auth/types';
import type { PlatformModuleCode } from '@/lib/tenant/types';

export {
  requireApiSession,
  withTenantApi,
  tenantErrorResponse,
  assertTenantRow,
  requirePermission,
  requireRole,
  TenantAccessError,
};

export type { TenantContext, CookieSessionPayload, ApiSessionResult };

/** Reject if not authenticated (signed cookie). */
export function requireAuth(request: Request): ApiSessionResult {
  return requireApiSession(request);
}

/** Platform super-admin only — role comes from signed cookie (minted from DB). */
export function requirePlatformAdmin(session: CookieSessionPayload): NextResponse | null {
  if (!isSuperAdminRole(session.roleCode)) {
    return NextResponse.json({ ok: false, error: 'Super admin required' }, { status: 403 });
  }
  return null;
}

/**
 * Authenticate + resolve tenant. Ignores untrusted client companyId unless
 * the actor is a platform admin in support mode (explicit allowSupport).
 */
export async function requireAuthorizedTenant(
  request: Request,
  opts?: {
    module?: PlatformModuleCode;
    companyIdFromRequest?: string | null;
    allowSupport?: boolean;
    roles?: string[];
    permissions?: PermissionCode[];
  }
): Promise<{ ctx: TenantContext } | { response: NextResponse }> {
  const gated = await withTenantApi(request, {
    module: opts?.module,
    companyIdFromRequest: opts?.companyIdFromRequest,
    allowSupport: opts?.allowSupport,
  });
  if ('response' in gated) return gated;

  try {
    if (opts?.roles?.length) {
      await requireRole(gated.ctx, opts.roles);
    }
    if (opts?.permissions?.length) {
      await requirePermission(gated.ctx, opts.permissions);
    }
    return gated;
  } catch (error) {
    return { response: tenantErrorResponse(error) };
  }
}

/**
 * Ensure a client-supplied resource company id matches the session tenant.
 * Use after loading a row — never authorize from the request companyId alone.
 */
export function denyCrossTenant(
  ctx: TenantContext,
  rowCompanyId: string | null | undefined,
  label = 'resource'
): NextResponse | null {
  try {
    assertTenantRow(ctx, rowCompanyId, label);
    return null;
  } catch (error) {
    return tenantErrorResponse(error);
  }
}
