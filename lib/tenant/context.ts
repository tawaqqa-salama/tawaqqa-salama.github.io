/**
 * Server-side tenant context helpers.
 * Tenant is resolved from authenticated session membership — never trust client IDs alone.
 */

import { cookies } from 'next/headers';
import {
  AUTH_COOKIE_NAME,
  decodeCookiePayload,
  type CookieSessionPayload,
} from '@/lib/auth/session-cookie';
import { hasPermission } from '@/lib/auth/permissions';
import type { PermissionCode } from '@/lib/auth/types';
import { hasModule as checkModule, getTenant, getUserMemberships } from '@/lib/tenant/service';
import type { PlatformModuleCode, TenantRecord } from '@/lib/tenant/types';
import { isTenantAdminRole, isSuperAdminRole } from '@/lib/tenant/rbac';

export type TenantContext = {
  session: CookieSessionPayload;
  tenantId: string;
  tenant: TenantRecord;
  roleCode: string;
  isPlatformAdmin: boolean;
  supportMode: boolean;
};

export class TenantAccessError extends Error {
  status: number;
  constructor(message: string, status = 403) {
    super(message);
    this.status = status;
  }
}

export async function getSessionFromCookies(): Promise<CookieSessionPayload | null> {
  const jar = await cookies();
  return decodeCookiePayload(jar.get(AUTH_COOKIE_NAME)?.value || null);
}

/** Parse session from a Request cookie header (API route handlers / tests). */
export function getSessionFromRequest(request: Request): CookieSessionPayload | null {
  const cookie = request.headers.get('cookie') || '';
  const match = cookie.match(new RegExp(`${AUTH_COOKIE_NAME}=([^;]+)`));
  return decodeCookiePayload(match?.[1] ? decodeURIComponent(match[1]) : null);
}

/**
 * Resolve tenant from an incoming Request (preferred for Route Handlers).
 * Never trusts client-supplied companyId unless the actor is a platform admin in support mode.
 */
export async function requireTenantFromRequest(
  request: Request,
  opts?: { companyIdFromRequest?: string | null; allowSupport?: boolean }
): Promise<TenantContext> {
  const session = getSessionFromRequest(request);
  if (!session) throw new TenantAccessError('Authentication required', 401);

  const isPlatform = isSuperAdminRole(session.roleCode);
  let tenantId = session.companyId || null;

  if (!tenantId) {
    const memberships = await getUserMemberships(session.userId);
    const def =
      memberships.find((m) => (m as { is_default?: boolean }).is_default) || memberships[0];
    tenantId = def ? String((def as { company_id: string }).company_id) : null;
  }

  const requested = opts?.companyIdFromRequest;
  if (requested) {
    if (isPlatform && opts?.allowSupport !== false) {
      tenantId = requested;
    } else if (tenantId && requested !== tenantId) {
      throw new TenantAccessError('Cross-tenant access denied');
    }
  }

  if (!tenantId) throw new TenantAccessError('No tenant context', 400);

  if (!isPlatform) {
    const memberships = await getUserMemberships(session.userId);
    const ok =
      memberships.some((m) => String((m as { company_id: string }).company_id) === tenantId) ||
      session.companyId === tenantId;
    if (!ok) throw new TenantAccessError('Not a member of this tenant');
  }

  const tenant = await getTenant(tenantId);
  if (!tenant || !tenant.is_active || tenant.status === 'suspended') {
    throw new TenantAccessError('Tenant inactive or suspended', 403);
  }

  return {
    session,
    tenantId,
    tenant,
    roleCode: session.roleCode,
    isPlatformAdmin: isPlatform,
    supportMode: Boolean(
      isPlatform && requested && requested !== session.companyId
    ),
  };
}

export async function getCurrentTenantId(
  session?: CookieSessionPayload | null
): Promise<string | null> {
  const s = session ?? (await getSessionFromCookies());
  if (!s) return null;
  if (s.companyId) return s.companyId;
  const memberships = await getUserMemberships(s.userId);
  const def = memberships.find((m) => (m as { is_default?: boolean }).is_default) || memberships[0];
  return def ? String((def as { company_id: string }).company_id) : null;
}

export async function requireTenant(opts?: {
  companyIdFromRequest?: string | null;
  allowSupport?: boolean;
}): Promise<TenantContext> {
  const session = await getSessionFromCookies();
  if (!session) throw new TenantAccessError('Authentication required', 401);

  const isPlatform = isSuperAdminRole(session.roleCode);
  let tenantId = session.companyId || (await getCurrentTenantId(session));

  // Super admin may pass an explicit tenant for support — must still be intentional
  if (opts?.companyIdFromRequest) {
    if (isPlatform && opts.allowSupport !== false) {
      tenantId = opts.companyIdFromRequest;
    } else if (tenantId && opts.companyIdFromRequest !== tenantId) {
      throw new TenantAccessError('Cross-tenant access denied');
    }
  }

  if (!tenantId) throw new TenantAccessError('No tenant context', 400);

  // Non-platform users must have membership
  if (!isPlatform) {
    const memberships = await getUserMemberships(session.userId);
    const ok = memberships.some(
      (m) => String((m as { company_id: string }).company_id) === tenantId
    );
    if (!ok && session.companyId !== tenantId) {
      throw new TenantAccessError('Not a member of this tenant');
    }
  }

  const tenant = await getTenant(tenantId);
  if (!tenant || !tenant.is_active || tenant.status === 'suspended') {
    throw new TenantAccessError('Tenant inactive or suspended', 403);
  }

  return {
    session,
    tenantId,
    tenant,
    roleCode: session.roleCode,
    isPlatformAdmin: isPlatform,
    supportMode: Boolean(isPlatform && opts?.companyIdFromRequest && opts.companyIdFromRequest !== session.companyId),
  };
}

export async function requireRole(
  ctx: TenantContext,
  roles: string[]
): Promise<void> {
  if (ctx.isPlatformAdmin) return;
  const normalized = ctx.roleCode === 'admin' ? 'tenant_admin' : ctx.roleCode;
  if (!roles.includes(normalized) && !roles.includes(ctx.roleCode)) {
    throw new TenantAccessError('Insufficient role');
  }
}

export async function requirePermission(
  ctx: TenantContext,
  permissions: PermissionCode[],
  userPermissions?: PermissionCode[]
): Promise<void> {
  if (ctx.isPlatformAdmin) return;
  if (isTenantAdminRole(ctx.roleCode)) return;
  const list = userPermissions || [];
  const ok = permissions.some((p) => hasPermission(list, p));
  if (!ok && list.includes('*')) return;
  if (!ok) throw new TenantAccessError('Permission denied');
}

export async function requireModule(ctx: TenantContext, module: PlatformModuleCode) {
  if (ctx.isPlatformAdmin) return;
  const ok = await checkModule(ctx.tenantId, module);
  if (!ok) throw new TenantAccessError(`Module disabled: ${module}`, 403);
}

/** Assert a row belongs to the current tenant (IDOR protection). */
export function assertTenantRow(
  ctx: TenantContext,
  rowCompanyId: string | null | undefined,
  label = 'resource'
) {
  if (!rowCompanyId || rowCompanyId !== ctx.tenantId) {
    throw new TenantAccessError(`Cannot access ${label} from another tenant`);
  }
}

export function tenantFilter(companyId: string) {
  return { company_id: companyId };
}
