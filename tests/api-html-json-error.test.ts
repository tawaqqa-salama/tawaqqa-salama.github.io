import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  humanizeFetchError,
  isHtmlAsJsonError,
  looksLikeHtmlBody,
  readResponseJson,
} from '@/lib/api/safe-json';
import { startDesignAnalysis } from '@/lib/projects/design-center/api-client';
import { mergeDesignCenterDefaults } from '@/lib/projects/design-center/state';

describe('safe-json', () => {
  it('detects HTML-as-JSON parse errors', () => {
    expect(isHtmlAsJsonError(`Unexpected token '<', "<html>... is not valid JSON`)).toBe(true);
    expect(isHtmlAsJsonError('bucket missing')).toBe(false);
    expect(looksLikeHtmlBody('<!DOCTYPE html><html>')).toBe(true);
  });

  it('humanizes the cryptic parse error into Arabic guidance', () => {
    const msg = humanizeFetchError(`Unexpected token '<', "<html>... is not valid JSON`);
    expect(msg).toMatch(/GitHub Pages|\/api/);
    expect(msg).not.toMatch(/Unexpected token/);
  });

  it('readResponseJson rejects HTML bodies without throwing', async () => {
    const res = new Response('<!DOCTYPE html><html><body>404</body></html>', {
      status: 404,
      headers: { 'Content-Type': 'text/html' },
    });
    const parsed = await readResponseJson(res);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.isHtml).toBe(true);
      expect(parsed.error).not.toMatch(/Unexpected token/);
    }
  });
});

describe('design-center api-client on static host', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response('<!DOCTYPE html><html>not found</html>', {
          status: 404,
          headers: { 'Content-Type': 'text/html' },
        })
      )
    );
  });

  afterEach(() => {
    vi.stubGlobal('fetch', originalFetch);
    vi.unstubAllGlobals();
  });

  it('does not surface Unexpected token HTML JSON errors', async () => {
    // Force API-available path so fetch is attempted, then HTML fallback kicks in
    vi.stubEnv('NEXT_PUBLIC_STATIC_EXPORT', '');
    const result = await startDesignAnalysis({ projectId: 'proj-1' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).not.toMatch(/Unexpected token/);
      expect(result.data?.analysis?.error).not.toMatch(/Unexpected token/);
      expect(result.code).toBeTruthy();
    }
  });
});

describe('mergeDesignCenterDefaults scrubs persisted HTML errors', () => {
  it('replaces stored Unexpected token errors', () => {
    const merged = mergeDesignCenterDefaults({
      analysis: {
        id: 'a1',
        status: 'failed',
        progress: 0,
        steps: [],
        error: `Unexpected token '<', "<html>... is not valid JSON`,
        error_code: 'NETWORK_ERROR',
        result: null,
      },
    });
    expect(merged.analysis?.error).toBeTruthy();
    expect(merged.analysis?.error).not.toMatch(/Unexpected token/);
  });
});
