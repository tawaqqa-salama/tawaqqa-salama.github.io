import { NextResponse } from 'next/server';
import {
  AUTH_COOKIE_NAME,
  decodeCookiePayload,
  type CookieSessionPayload,
} from '@/lib/auth/session-cookie';

export type ApiSessionResult =
  | { ok: true; session: CookieSessionPayload }
  | { ok: false; response: NextResponse };

export function requireApiSession(request: Request): ApiSessionResult {
  const cookieHeader = request.headers.get('cookie') || '';
  const match = cookieHeader
    .split(';')
    .map((p) => p.trim())
    .find((p) => p.startsWith(`${AUTH_COOKIE_NAME}=`));
  const raw = match ? decodeURIComponent(match.slice(AUTH_COOKIE_NAME.length + 1)) : null;
  const session = decodeCookiePayload(raw);
  if (!session) {
    return {
      ok: false,
      response: NextResponse.json(
        { ok: false, error: 'غير مصرح — يلزم تسجيل الدخول' },
        { status: 401 }
      ),
    };
  }
  return { ok: true, session };
}
