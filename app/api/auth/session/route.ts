import { NextResponse } from 'next/server';
import {
  AUTH_COOKIE_MAX_AGE,
  AUTH_COOKIE_NAME,
  decodeCookiePayload,
  encodeCookiePayload,
  type CookieSessionPayload,
} from '@/lib/auth/session-cookie';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function cookieOptions(maxAge: number) {
  const secure = process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    secure,
    sameSite: 'lax' as const,
    path: '/',
    maxAge,
  };
}

/** Establish httpOnly session cookie after client login */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as CookieSessionPayload;
    if (!body?.userId || !body?.email) {
      return NextResponse.json({ ok: false, error: 'session payload required' }, { status: 400 });
    }
    const value = encodeCookiePayload({
      userId: body.userId,
      email: body.email,
      fullName: body.fullName || body.email,
      roleCode: body.roleCode || 'staff',
      companyId: body.companyId,
      loggedInAt: body.loggedInAt || new Date().toISOString(),
      method: body.method || 'email',
    });
    const res = NextResponse.json({ ok: true });
    res.cookies.set(AUTH_COOKIE_NAME, value, cookieOptions(AUTH_COOKIE_MAX_AGE));
    return res;
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'failed' },
      { status: 500 }
    );
  }
}

/** Clear session cookie */
export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(AUTH_COOKIE_NAME, '', cookieOptions(0));
  return res;
}

/** Inspect session (for diagnostics) */
export async function GET(request: Request) {
  const cookie = request.headers.get('cookie') || '';
  const match = cookie
    .split(';')
    .map((p) => p.trim())
    .find((p) => p.startsWith(`${AUTH_COOKIE_NAME}=`));
  const raw = match ? decodeURIComponent(match.slice(AUTH_COOKIE_NAME.length + 1)) : null;
  const session = decodeCookiePayload(raw);
  if (!session) {
    return NextResponse.json({ ok: false, authenticated: false }, { status: 401 });
  }
  return NextResponse.json({
    ok: true,
    authenticated: true,
    userId: session.userId,
    email: session.email,
    roleCode: session.roleCode,
  });
}
