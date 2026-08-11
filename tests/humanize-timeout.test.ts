import { describe, expect, it } from 'vitest';
import { humanizeFetchError, isStatementTimeoutError } from '@/lib/api/safe-json';

describe('statement timeout humanize', () => {
  it('detects postgres canceling statement timeout', () => {
    const raw = 'canceling statement due to statement timeout';
    expect(isStatementTimeoutError(raw)).toBe(true);
    const msg = humanizeFetchError(raw);
    expect(msg).toContain('مهلة قاعدة البيانات');
    expect(msg).toContain('039');
    expect(msg).toContain('038');
  });
});
