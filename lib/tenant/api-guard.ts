import { NextResponse } from 'next/server';
import {
  requireTenantFromRequest,
  TenantAccessError,
  type TenantContext,
} from '@/lib/tenant/context';
import type { PlatformModuleCode } from '@/lib/tenant/types';
import { requireModule } from '@/lib/tenant/context';

/** JSON error for tenant/auth failures — never leak stack traces. */
export function tenantErrorResponse(error: unknown) {
  if (error instanceof TenantAccessError) {
    return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
  }
  const message = error instanceof Error ? error.message : 'Request failed';
  return NextResponse.json({ ok: false, error: message }, { status: 400 });
}

/**
 * Resolve tenant context for an API route. Optionally require a module flag.
 */
export async function withTenantApi(
  request: Request,
  opts?: {
    module?: PlatformModuleCode;
    companyIdFromRequest?: string | null;
    allowSupport?: boolean;
  }
): Promise<{ ctx: TenantContext } | { response: NextResponse }> {
  try {
    const ctx = await requireTenantFromRequest(request, {
      companyIdFromRequest: opts?.companyIdFromRequest,
      allowSupport: opts?.allowSupport,
    });
    if (opts?.module) {
      await requireModule(ctx, opts.module);
    }
    return { ctx };
  } catch (error) {
    return { response: tenantErrorResponse(error) };
  }
}
