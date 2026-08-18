import { isDemoMode } from '@/lib/supabase';

/** Prefer in-memory tenant store for tests/local demo, never for production. */
export function isTenantMemoryMode(): boolean {
  if (process.env.NODE_ENV === 'production') return false;
  return process.env.TENANT_FORCE_MEMORY === 'true' || isDemoMode;
}
