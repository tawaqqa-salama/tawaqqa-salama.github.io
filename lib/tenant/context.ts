/**
 * Server-side tenant context helpers.
 * Tenant is resolved from live DB actor state — never trust cookie role/company alone.
 */

import { cookies } from 'next/headers';
import {
  AUTH_COOKIE_NAME,
  decodeCookiePayload,
  type CookieSessionPayload,
} from '@/lib/auth/session-cookie';
import {
  ActorValidationError,
  applyLiveActorToSession,
  resolveLiveActor,
} from '@/lib/auth/session-actor';
import { hasPermission } from '@/lib/auth/permissions';
import type { PermissionCode } from '@/lib/auth/types';
import { hasModule as checkModule, getTenant, getUserMemberships } from '@/lib/tenant/service';
import type { PlatformModuleCode, TenantMembership, TenantRecord } from '@/lib/tenant/types';
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

async function buildTenantContext(
  session: CookieSessionPayload,
  opts?: { companyIdFromRequest?: string | null; allowSupport?: boolean }
): Promise<TenantContext> {
  let actor;
  try {
    actor = await resolveLiveActor(session);
  } catch (e) {
    if (e instanceof ActorValidationError) {
      throw new TenantAccessError(e.message, e.status);
    }
    throw e;
  }

  const liveSession = applyLiveActorToSession(session, actor);
  const isPlatform = actor.isPlatformAdmin || isSuperAdminRole(actor.roleCode);

  let tenantId = actor.companyId || null;

  if (!tenantId) {
    const memberships: TenantMembership[] = actor.memberships.length
      ? (actor.memberships as TenantMembership[])
      : await getUserMemberships(actor.user.id);
    const def = memberships.find((m) => m.is_default) || memberships[0];
    tenantId = def ? String(def.company_id) : null;
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
    const memberships: TenantMembership[] = actor.memberships.length
      ? (actor.memberships as TenantMembership[])
      : await getUserMemberships(actor.user.id);
    const ok =
      memberships.some((m) => String(m.company_id) === tenantId) ||
      actor.user.company_id === tenantId;
    if (!ok) throw new TenantAccessError('Not a member of this tenant');
  }

  const tenant = await getTenant(tenantId);
  if (!tenant || !tenant.is_active || tenant.status === 'suspended') {
    throw new TenantAccessError('Tenant inactive or suspended', 403);
  }

  return {
    session: { ...liveSession, companyId: tenantId },
    tenantId,
    tenant,
    roleCode: actor.roleCode,
    isPlatformAdmin: isPlatform,
    supportMode: Boolean(isPlatform && requested && requested !== actor.companyId),
  };
}

/**
 * Resolve tenant from an incoming Request (preferred for Route Handlers).
 * Revalidates is_active / deleted_at / role_code / company_id / memberships every call.
 */
export async function requireTenantFromRequest(
  request: Request,
  opts?: { companyIdFromRequest?: string | null; allowSupport?: boolean }
): Promise<TenantContext> {
  const session = getSessionFromRequest(request);
  if (!session) throw new TenantAccessError('Authentication required', 401);
  return buildTenantContext(session, opts);
}

export async function getCurrentTenantId(
  session?: CookieSessionPayload | null
): Promise<string | null> {
  const s = session ?? (await getSessionFromCookies());
  if (!s) return null;
  try {
    const actor = await resolveLiveActor(s);
    return actor.companyId || null;
  } catch {
    return null;
  }
}

export async function requireTenant(opts?: {
  companyIdFromRequest?: string | null;
  allowSupport?: boolean;
}): Promise<TenantContext> {
  const session = await getSessionFromCookies();
  if (!session) throw new TenantAccessError('Authentication required', 401);
  return buildTenantContext(session, opts);
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
