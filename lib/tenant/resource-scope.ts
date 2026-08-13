/**
 * Tenant resource ownership helpers for API handlers.
 * Cross-tenant access returns 404 (no existence leak).
 */

import { NextResponse } from 'next/server';
import type { TenantContext } from '@/lib/tenant/context';

/** Prefer 404 over 403 for IDOR so responses do not confirm another tenant's row. */
export function notFoundTenantResource(label = 'resource') {
  return NextResponse.json({ ok: false, error: 'not_found', resource: label }, { status: 404 });
}

/**
 * After loading a row by id, verify company_id matches the session tenant.
 * Missing company_id on the row is treated as inaccessible (fail closed).
 */
export function requireRowTenant(
  ctx: TenantContext,
  rowCompanyId: string | null | undefined,
  label = 'resource'
): NextResponse | null {
  if (!rowCompanyId || rowCompanyId !== ctx.tenantId) {
    return notFoundTenantResource(label);
  }
  return null;
}

/** Fail closed when a list/query would otherwise run without tenant scope. */
export function requireTenantId(companyId: string | null | undefined): companyId is string {
  return Boolean(companyId && String(companyId).trim());
}
