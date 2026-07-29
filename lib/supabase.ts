import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createDemoSupabaseClient } from '@/lib/demo/memory-client';

function normalizeSupabaseUrl(url: string): string {
  return url.replace(/\/rest\/v1\/?$/, '').replace(/\/$/, '');
}

const supabaseUrl = normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '');
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

/** True when the app is running on local demo data (no Supabase credentials). */
export const isDemoMode = !isSupabaseConfigured;

export const SUPABASE_CONFIG_ERROR =
  'إعدادات Supabase غير موجودة. أضف NEXT_PUBLIC_SUPABASE_URL و NEXT_PUBLIC_SUPABASE_ANON_KEY إلى ملف .env.local';

/**
 * Uses real Supabase when credentials exist; otherwise an in-memory Arabic demo dataset
 * so the site stays usable without knowing project keys.
 */
export const supabase: SupabaseClient = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : (createDemoSupabaseClient() as unknown as SupabaseClient);
