import { NextResponse } from 'next/server';
import { isStaticPagesBuild } from '@/lib/runtime/mode';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Unauthenticated liveness probe for Node hosts (Vercel / next start).
 * Does not expose secrets, project refs, or internal credentials.
 */
export async function GET() {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
  const anon = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim();

  return NextResponse.json({
    ok: true,
    runtime: isStaticPagesBuild() ? 'static' : 'node',
    supabaseConfigured: Boolean(url && anon),
  });
}
