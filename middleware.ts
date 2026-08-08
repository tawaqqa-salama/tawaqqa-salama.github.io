import { NextResponse, type NextRequest } from 'next/server';
import { AUTH_COOKIE_NAME, decodeCookiePayload } from '@/lib/auth/session-cookie';

/**
 * Edge gate for Node/Vercel hosting.
 * Static GitHub Pages export does not run this middleware for app routes.
 */

const PUBLIC_PREFIXES = [
  '/login',
  '/_next',
  '/favicon',
  '/icons',
  '/assets',
  '/api/auth/session', // allow establishing cookie
  '/api/integrations/whatsapp/webhook', // Meta Cloud API webhook (verified by token/signature)
  '/api/whatsapp/webhook', // alias used by Meta/Vercel callback URLs
  '/api/social/webhook', // Meta Instagram/Facebook messaging webhooks
  '/api/public/website', // public website lead forms
  '/api/integrations/social/oauth', // OAuth redirects (callback completes without cookie)
  '/api/onboarding', // tenant self-serve onboarding (token-gated when configured)
  '/onboarding',
  '/sitemap.xml',
  '/robots.txt',
];

const PUBLIC_EXACT = new Set(['/', '/login', '/onboarding']);

function isPublic(pathname: string): boolean {
  if (PUBLIC_EXACT.has(pathname)) return true;
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`) || pathname.startsWith(p));
}

function isApi(pathname: string): boolean {
  return pathname.startsWith('/api/');
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Always allow static/public
  if (isPublic(pathname)) {
    return NextResponse.next();
  }

  const raw = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  const session = decodeCookiePayload(raw || null);

  if (!session) {
    if (isApi(pathname)) {
      if (pathname.startsWith('/api/auth/')) {
        return NextResponse.next();
      }
      return NextResponse.json(
        { ok: false, error: 'غير مصرح — يلزم تسجيل الدخول' },
        { status: 401 }
      );
    }
    // Allow login recovery when localStorage session exists but cookie not yet synced
    if (pathname === '/login') {
      return NextResponse.next();
    }
    const login = new URL('/login', request.url);
    login.searchParams.set('next', pathname);
    return NextResponse.redirect(login);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Skip Next internals and common static files.
     * Pages export builds may ignore middleware — Node host uses it.
     */
    '/((?!_next/static|_next/image|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map)$).*)',
  ],
};
