import { readFileSync } from 'node:fs';
import { describe, expect, it, vi, afterEach } from 'vitest';

const routeSource = readFileSync(
  new URL('../app/api/health/route.ts', import.meta.url),
  'utf8'
);
const middlewareSource = readFileSync(
  new URL('../middleware.ts', import.meta.url),
  'utf8'
);

describe('GET /api/health', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('is public in middleware and nodejs runtime', () => {
    expect(middlewareSource).toContain("'/api/health'");
    expect(routeSource).toContain("export const runtime = 'nodejs'");
    expect(routeSource).toContain("dynamic = 'force-dynamic'");
  });

  it('does not expose secrets or credentials', () => {
    expect(routeSource).not.toContain('SUPABASE_SERVICE_ROLE');
    expect(routeSource).not.toContain('AUTH_SESSION_SECRET');
    expect(routeSource).not.toContain('service_role');
    expect(routeSource).not.toContain('process.env.SUPABASE');
    expect(routeSource).toContain('supabaseConfigured');
  });

  it('returns minimal ok/runtime/supabaseConfigured payload', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://ezmdkwgziyencejfevso.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'test-anon-key');
    vi.stubEnv('USER_PAGES', '');
    vi.stubEnv('GITHUB_PAGES', '');
    vi.stubEnv('NEXT_PUBLIC_STATIC_EXPORT', '');

    const { GET } = await import('@/app/api/health/route');
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      ok: true,
      runtime: 'node',
      supabaseConfigured: true,
    });
  });

  it('reports supabaseConfigured false when public keys missing', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '');
    vi.stubEnv('USER_PAGES', '');
    vi.stubEnv('GITHUB_PAGES', '');
    vi.stubEnv('NEXT_PUBLIC_STATIC_EXPORT', '');

    const { GET } = await import('@/app/api/health/route');
    const body = await (await GET()).json();
    expect(body.ok).toBe(true);
    expect(body.runtime).toBe('node');
    expect(body.supabaseConfigured).toBe(false);
  });
});
