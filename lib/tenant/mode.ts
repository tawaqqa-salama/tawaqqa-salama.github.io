import { isDemoMode, isSupabaseConfigured } from '@/lib/supabase';

/** Prefer in-memory tenant store for tests/demo (not a React hook). */
export function isTenantMemoryMode(): boolean {
  if (process.env.TENANT_FORCE_MEMORY === 'true') return true;
  if (!isSupabaseConfigured || isDemoMode) return true;
  return false;
}
