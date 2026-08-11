import { NextResponse } from 'next/server';
import {
  AUTH_COOKIE_MAX_AGE,
  AUTH_COOKIE_NAME,
  decodeCookiePayload,
} from '@/lib/auth/session-cookie';
import { mintTrustedSession, type SessionMintRequest } from '@/lib/auth/mint-session';

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

/**
 * Establish httpOnly signed session cookie after client login.
 * roleCode / companyId from the body are ignored — loaded from trusted Auth/DB.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as SessionMintRequest;
    const authHeader = request.headers.get('authorization') || '';
    const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    if (!body.accessToken && bearer) {
      body.accessToken = bearer;
    }

    const minted = await mintTrustedSession(body);
    if (!minted.ok) {
      return NextResponse.json({ ok: false, error: minted.error }, { status: minted.status });
    }

    const res = NextResponse.json({
      ok: true,
      userId: minted.payload.userId,
      roleCode: minted.payload.roleCode,
      companyId: minted.payload.companyId || null,
    });
    res.cookies.set(AUTH_COOKIE_NAME, minted.cookieValue, cookieOptions(AUTH_COOKIE_MAX_AGE));
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

/** Inspect session (for diagnostics) — verifies signature */
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
    companyId: session.companyId || null,
  });
}
