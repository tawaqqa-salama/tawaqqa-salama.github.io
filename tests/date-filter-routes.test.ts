import { describe, expect, it } from 'vitest';
import { shouldShowDateFilterBar } from '@/lib/constants/date-filter-routes';

describe('shouldShowDateFilterBar', () => {
  it('shows on list and report pages', () => {
    expect(shouldShowDateFilterBar('/projects')).toBe(true);
    expect(shouldShowDateFilterBar('/sales')).toBe(true);
    expect(shouldShowDateFilterBar('/clients')).toBe(true);
    expect(shouldShowDateFilterBar('/finance/invoices')).toBe(true);
    expect(shouldShowDateFilterBar('/finance/journal')).toBe(true);
    expect(shouldShowDateFilterBar('/settings/activity')).toBe(true);
  });

  it('hides on entry and workflow pages', () => {
    expect(shouldShowDateFilterBar('/projects/file')).toBe(false);
    expect(shouldShowDateFilterBar('/projects/file?id=abc')).toBe(false);
    expect(shouldShowDateFilterBar('/sales/client-basic-data')).toBe(false);
    expect(shouldShowDateFilterBar('/sales/client-quotation')).toBe(false);
    expect(shouldShowDateFilterBar('/finance/enterprise')).toBe(false);
    expect(shouldShowDateFilterBar('/settings/company')).toBe(false);
    expect(shouldShowDateFilterBar('/design')).toBe(false);
  });
});
