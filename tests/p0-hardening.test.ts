import { describe, expect, it } from 'vitest';
import {
  decodeCookiePayload,
  encodeCookiePayload,
  sessionToCookiePayload,
} from '@/lib/auth/session-cookie';
import { isDemoAllowed, isZatcaServerOnly, assertLiveOrDemoAllowed } from '@/lib/runtime/mode';

describe('P0 — session cookie codec', () => {
  it('round-trips signed payload', () => {
    process.env.AUTH_SESSION_SECRET = 'test-auth-session-secret-32chars!!';
    const payload = sessionToCookiePayload({
      userId: 'u1',
      email: 'a@b.c',
      fullName: 'Admin',
      username: 'admin',
      roleCode: 'admin',
      permissions: ['*'],
      loggedInAt: '2026-08-04T00:00:00.000Z',
      method: 'email',
    });
    const encoded = encodeCookiePayload(payload);
    expect(encoded).toContain('.');
    const decoded = decodeCookiePayload(encoded);
    expect(decoded?.userId).toBe('u1');
    expect(decoded?.email).toBe('a@b.c');
    delete process.env.AUTH_SESSION_SECRET;
  });
});

describe('P0 — runtime mode guards', () => {
  it('allows demo when ALLOW_DEMO_MODE is set', () => {
    process.env.ALLOW_DEMO_MODE = 'true';
    expect(isDemoAllowed()).toBe(true);
    delete process.env.ALLOW_DEMO_MODE;
  });

  it('assertLive allows when demo permitted', () => {
    process.env.ALLOW_DEMO_MODE = 'true';
    const r = assertLiveOrDemoAllowed('finance');
    expect(r.ok).toBe(true);
    delete process.env.ALLOW_DEMO_MODE;
  });

  it('zatca server-only flag', () => {
    process.env.ZATCA_SERVER_ONLY = 'true';
    expect(isZatcaServerOnly()).toBe(true);
    delete process.env.ZATCA_SERVER_ONLY;
  });
});
