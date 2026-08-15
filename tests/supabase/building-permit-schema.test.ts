import { describe, expect, it } from 'vitest';
import {
  hasReviewRequired,
  normalizeOcrFields,
  validateOcrFields,
} from '../../supabase/functions/_shared/building-permit-schema';

describe('building permit Supabase OCR contract', () => {
  it('normalizes the requested permit fields and marks low confidence for review', () => {
    const fields = normalizeOcrFields({
      permitNumber: {
        value: '4500260099',
        confidence: 0.96,
        source: { page: 1, text: 'رقم الرخصة 4500260099' },
        needs_review: false,
      },
      ownerName: {
        value: 'أحمد بن عمر بن سعيد بافيل',
        confidence: 0.62,
        source: { page: 1, text: 'اسم صاحب الرخصة أحمد بن عمر...' },
        needs_review: false,
      },
      landAreaM2: {
        value: 595.5,
        confidence: 0.91,
        source: { page: 2, text: 'مساحة الأرض 595.50' },
        needs_review: false,
      },
      floors: {
        value: [{
          label: { value: 'أرضي', confidence: 0.94, source: { page: 3 }, needs_review: false },
          area_m2: { value: 429.33, confidence: 0.91, source: { page: 3 }, needs_review: false },
          activity_type: { value: 'تجاري', confidence: 0.88, source: { page: 3 }, needs_review: false },
        }],
        confidence: 0.9,
        source: { page: 3 },
        needs_review: false,
      },
    });

    expect(fields.permitNumber.value).toBe('4500260099');
    expect(fields.ownerName.needs_review).toBe(true);
    expect(fields.ownerName.source?.page).toBe(1);
    expect(fields.landAreaM2.value).toBe(595.5);
    expect(fields.floors.value?.[0].area_m2.value).toBe(429.33);
    expect(hasReviewRequired(fields)).toBe(true);
  });

  it('rejects invalid numeric values and emits validation warnings', () => {
    const fields = normalizeOcrFields({
      landAreaM2: { value: -10, confidence: 0.99, needs_review: false },
      buildingAreaM2: { value: 5, confidence: 0.99, needs_review: false },
      floorsCount: { value: 250, confidence: 0.99, needs_review: false },
    });

    expect(fields.landAreaM2.value).toBeNull();
    expect(fields.floorsCount.value).toBe(250);
    expect(validateOcrFields(fields)).toEqual(expect.arrayContaining([
      'floorsCount is impossible or not an integer',
    ]));
  });

  it('keeps absent fields explicit and review-required instead of inventing values', () => {
    const fields = normalizeOcrFields({});
    expect(fields.permitNumber.value).toBeNull();
    expect(fields.ownerName.value).toBeNull();
    expect(fields.floors.value).toBeNull();
    expect(hasReviewRequired(fields)).toBe(true);
  });
});
