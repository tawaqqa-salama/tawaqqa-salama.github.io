import { describe, it, expect } from 'vitest';
import {
  TECH_REPORT_CHAPTER_FLOW,
  isLastTechReportChapter,
  nextTechReportChapter,
  techReportChapterTitle,
} from '@/lib/projects/technical-report-chapters';

describe('technical report chapter flow', () => {
  it('orders chapters facility → engineering_study → firefighting → … → recommendations', () => {
    expect(TECH_REPORT_CHAPTER_FLOW).toEqual([
      'facility',
      'engineering_study',
      'firefighting',
      'ventilation',
      'alarm',
      'exits',
      'recommendations',
    ]);
  });

  it('advances from facility to engineering_study then firefighting', () => {
    expect(nextTechReportChapter('facility')).toBe('engineering_study');
    expect(nextTechReportChapter('engineering_study')).toBe('firefighting');
    expect(techReportChapterTitle('engineering_study')).toContain('الدراسة الهندسية');
  });

  it('ends at recommendations then yields null (ready for inspections stage)', () => {
    expect(nextTechReportChapter('exits')).toBe('recommendations');
    expect(nextTechReportChapter('recommendations')).toBeNull();
    expect(isLastTechReportChapter('recommendations')).toBe(true);
    expect(isLastTechReportChapter('facility')).toBe(false);
  });
});
