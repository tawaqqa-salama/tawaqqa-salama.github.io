/**
 * page_number must fit PostgreSQL integer — reject bare P+digits overflows.
 */

import { describe, expect, it } from 'vitest';
import {
  detectSourceRefsFromText,
  toPgInt4,
  toSafePageNumber,
  PG_INT4_MAX,
} from '@/lib/design-intelligence/code-knowledge/source-refs';

describe('page_number integer overflow guard', () => {
  it('does not treat bare P7777777777 / phone-like tokens as page numbers', () => {
    const refs = detectSourceRefsFromText(
      'Contact P7777777777 or call p9999999999 for support. Section 8.1.'
    );
    expect(refs.page_number).toBeNull();
    expect(refs.section).toBe('8.1');
  });

  it('still detects Page 42 and p. 12', () => {
    expect(detectSourceRefsFromText('See Page 42 for density.').page_number).toBe(42);
    expect(detectSourceRefsFromText('Refer to p. 12 in the annex.').page_number).toBe(12);
  });

  it('rejects page numbers above int4 / unreasonable range', () => {
    expect(toPgInt4(7777777777)).toBeNull();
    expect(toPgInt4(PG_INT4_MAX)).toBe(PG_INT4_MAX);
    expect(toSafePageNumber(7777777777, 5)).toBe(5);
    expect(toSafePageNumber(595, null)).toBe(595);
    expect(
      detectSourceRefsFromText('Page 7777777777 appears in garbage OCR.', {
        pageGuess: 10,
        allowPageGuess: true,
      }).page_number
    ).toBe(10);
  });

  it('falls back to PDF pageGuess when text page is absurd', () => {
    const refs = detectSourceRefsFromText('P7777777777 Section 5.1', {
      pageGuess: 303,
      allowPageGuess: true,
    });
    expect(refs.page_number).toBe(303);
  });
});
