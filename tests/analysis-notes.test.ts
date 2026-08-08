import { describe, expect, it } from 'vitest';
import {
  extractAnalysisNotes,
  jobStatusLabel,
} from '@/lib/projects/design-center/analysis-notes';
import type { DesignBuildingModel } from '@/lib/projects/design-center/types';

describe('extractAnalysisNotes', () => {
  it('surfaces observations and citations from raw', () => {
    const result: DesignBuildingModel = {
      occupancy: 'office',
      space_names: ['Lobby', 'Office'],
      raw: {
        note_ar: 'ملخص عربي',
        note_en: 'English summary',
        observations_ar: ['ملاحظة 1'],
        observations_en: ['Note 1'],
        applicable_codes: ['SBC-801'],
        drawings_count: 2,
        knowledge_citations: [
          {
            documentTitle: 'SBC Fire',
            codeReference: 'SBC-801',
            paragraph: 'Sprinkler required…',
          },
        ],
      },
    };
    const ar = extractAnalysisNotes(result, true);
    expect(ar.summary).toBe('ملخص عربي');
    expect(ar.observations).toEqual(['ملاحظة 1']);
    expect(ar.citations).toHaveLength(1);
    expect(ar.citations[0].codeReference).toBe('SBC-801');
    expect(ar.applicableCodes).toContain('SBC-801');
    expect(ar.drawingsCount).toBe(2);
  });

  it('falls back to step-based notes when observations missing', () => {
    const result: DesignBuildingModel = {
      raw: {
        knowledge_citations: [],
      },
    };
    const notes = extractAnalysisNotes(result, true, [
      {
        id: 'detect_rooms',
        status: 'unavailable',
        label_ar: 'التعرف على الغرف',
        label_en: 'Detect rooms',
      },
      {
        id: 'detect_stairs',
        status: 'unavailable',
        label_ar: 'اكتشاف السلالم',
        label_en: 'Detect stairs',
      },
    ]);
    expect(notes.observations.some((o) => /محرك رؤية|vision/i.test(o))).toBe(true);
    expect(notes.observations.some((o) => o.includes('السلالم'))).toBe(true);
  });
});

describe('jobStatusLabel', () => {
  it('localizes unavailable', () => {
    expect(jobStatusLabel('unavailable', true)).toBe('غير متاح');
    expect(jobStatusLabel('completed', true)).toBe('مكتمل');
  });
});
