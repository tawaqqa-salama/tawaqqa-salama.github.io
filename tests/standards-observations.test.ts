import { describe, expect, it } from 'vitest';
import {
  reviewStatusLabel,
  standardsObservationLines,
} from '@/lib/projects/design-center/standards/observations';

const ref = (
  code: string,
  status: 'verified' | 'edition_not_verified' | 'not_verified' | 'needs_engineer_review',
  editionLabel = 'Edition not verified'
) => ({
  code,
  title: code,
  title_ar: code,
  editionLabel,
  source: 'official_standard' as const,
  status,
  why_ar: 'سبب',
  why_en: 'why',
});

describe('standardsObservationLines', () => {
  it('surfaces engine warnings first', () => {
    const lines = standardsObservationLines(
      {
        warnings: ['NFPA-72: Edition not verified'],
        primary: [ref('NFPA-72', 'edition_not_verified')],
        saudiCode: [],
        related: [],
        conditional: [],
      },
      true
    );
    expect(lines[0]).toContain('NFPA-72');
    expect(lines.length).toBeGreaterThanOrEqual(1);
  });

  it('derives notes from status when warnings empty', () => {
    const lines = standardsObservationLines(
      {
        warnings: [],
        primary: [ref('NFPA-13', 'edition_not_verified')],
        saudiCode: [ref('SBC-801', 'not_verified', '—')],
        related: [],
        conditional: [],
      },
      false
    );
    expect(lines.some((l) => l.includes('NFPA-13') && /Edition not verified/i.test(l))).toBe(true);
    expect(lines.some((l) => l.includes('SBC-801') && /Needs Engineer Review/i.test(l))).toBe(true);
  });

  it('dedupes identical lines', () => {
    const lines = standardsObservationLines(
      {
        warnings: ['NFPA-72: Edition not verified'],
        primary: [ref('NFPA-72', 'edition_not_verified')],
        saudiCode: [],
        related: [],
        conditional: [],
      },
      false
    );
    expect(lines.filter((l) => l === 'NFPA-72: Edition not verified')).toHaveLength(1);
  });
});

describe('reviewStatusLabel', () => {
  it('localizes engineer review', () => {
    expect(reviewStatusLabel('needs_engineer_review', true)).toContain('مراجعة');
    expect(reviewStatusLabel('needs_engineer_review', false)).toContain('Engineer');
  });
});
