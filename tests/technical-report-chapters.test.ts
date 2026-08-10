import { describe, expect, it } from 'vitest';
import {
  TECH_REPORT_CHAPTER_FLOW,
  isLastTechReportChapter,
  nextTechReportChapter,
  techReportChapterTitle,
} from '@/lib/projects/technical-report-chapters';

describe('technical report chapter flow', () => {
  it('orders chapters facility → firefighting → … → recommendations', () => {
    expect(TECH_REPORT_CHAPTER_FLOW).toEqual([
      'facility',
      'firefighting',
      'ventilation',
      'alarm',
      'exits',
      'recommendations',
    ]);
  });

  it('advances from facility to firefighting (مكافحة الحريق)', () => {
    expect(nextTechReportChapter('facility')).toBe('firefighting');
    expect(techReportChapterTitle('firefighting')).toContain('مكافحة الحريق');
  });

  it('ends at recommendations then yields null (ready for inspections stage)', () => {
    expect(nextTechReportChapter('exits')).toBe('recommendations');
    expect(nextTechReportChapter('recommendations')).toBeNull();
    expect(isLastTechReportChapter('recommendations')).toBe(true);
    expect(isLastTechReportChapter('facility')).toBe(false);
  });
});
