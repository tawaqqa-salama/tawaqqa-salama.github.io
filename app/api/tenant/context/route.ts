import { NextResponse } from 'next/server';
import { getBearerAccessToken } from '@/lib/auth/bearer';
import { createUserScopedSupabase } from '@/lib/supabase/server';
import { isDemoMode, isSupabaseConfigured } from '@/lib/supabase';
import { tenantErrorResponse } from '@/lib/tenant/api-guard';
import {
  requireTenantFromRequest,
  TenantAccessError,
} from '@/lib/tenant/context';
import { isTenantMemoryMode } from '@/lib/tenant/mode';
import { getTenantModules, getUserMemberships } from '@/lib/tenant/service';

export const runtime = 'nodejs';

/**
 * Production Node (Supabase configured, not demo/memory): Bearer JWT is required.
 * Cookie alone is not enough — companies RLS needs auth.uid() from the user JWT.
 * Demo / in-memory tenant mode may omit Bearer.
 */
function requiresBearerForTenantContext(): boolean {
  return isSupabaseConfigured && !isDemoMode && !isTenantMemoryMode();
}

/**
 * Authenticated tenant context for AppShell / TenantSwitcher.
 * Uses live actor + user-scoped Supabase when Bearer is present.
 * Never falls back to the anonymous client on authenticated Production paths.
 */
export async function GET(request: Request) {
  const accessToken = getBearerAccessToken(request);

  if (requiresBearerForTenantContext() && !accessToken) {
    return NextResponse.json(
      {
        ok: false,
        error: 'Bearer access token required for tenant context',
      },
      { status: 401 }
    );
  }

  try {
    // When Bearer is present, requireTenantFromRequest uses createUserScopedSupabase
    // and requireClient — never the anon client for companies lookup.
    const ctx = await requireTenantFromRequest(request);

    if (accessToken) {
      const scoped = createUserScopedSupabase(accessToken);
      if (!scoped) {
        throw new TenantAccessError(
          'User-scoped Supabase client unavailable for tenant context',
          503
        );
      }
      const modules = await getTenantModules(ctx.tenantId, scoped);
      const memberships = await getUserMemberships(ctx.session.userId, scoped);
      return NextResponse.json({
        ok: true,
        tenant: ctx.tenant,
        modules,
        memberships,
        isPlatformAdmin: ctx.isPlatformAdmin,
        roleCode: ctx.roleCode,
      });
    }

    // Demo / memory only — cookie session without Bearer
    const modules = await getTenantModules(ctx.tenantId);
    const memberships = await getUserMemberships(ctx.session.userId);
    return NextResponse.json({
      ok: true,
      tenant: ctx.tenant,
      modules,
      memberships,
      isPlatformAdmin: ctx.isPlatformAdmin,
      roleCode: ctx.roleCode,
    });
  } catch (error) {
    return tenantErrorResponse(error);
  }
}
