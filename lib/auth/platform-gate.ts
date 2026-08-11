/**
 * Platform routes must re-check live DB role — never trust cookie roleCode alone.
 */

import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/tenant/context';
import {
  ActorValidationError,
  resolveLiveActor,
} from '@/lib/auth/session-actor';
import type { CookieSessionPayload } from '@/lib/auth/session-cookie';
import type { LiveActor } from '@/lib/auth/session-actor';

export type PlatformGate =
  | { ok: true; session: CookieSessionPayload; actor: LiveActor }
  | { ok: false; response: NextResponse };

export async function requireLivePlatformAdmin(request: Request): Promise<PlatformGate> {
  const session = getSessionFromRequest(request);
  if (!session) {
    return {
      ok: false,
      response: NextResponse.json({ ok: false, error: 'Authentication required' }, { status: 401 }),
    };
  }
  try {
    const actor = await resolveLiveActor(session);
    if (!actor.isPlatformAdmin) {
      return {
        ok: false,
        response: NextResponse.json({ ok: false, error: 'Platform admin required' }, { status: 403 }),
      };
    }
    return { ok: true, session, actor };
  } catch (e) {
    if (e instanceof ActorValidationError) {
      return {
        ok: false,
        response: NextResponse.json({ ok: false, error: e.message }, { status: e.status }),
      };
    }
    return {
      ok: false,
      response: NextResponse.json({ ok: false, error: 'Authorization failed' }, { status: 403 }),
    };
  }
}
