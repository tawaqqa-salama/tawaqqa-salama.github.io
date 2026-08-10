import { describe, expect, it } from 'vitest';
import {
  seedSupervisionReport,
  trimSupervisionTextFields,
} from '@/lib/projects/supervision-report';
import { EMPTY_PROJECT_ENGINEERING_DATA, EMPTY_SUPERVISION_REPORT } from '@/lib/types/project-reports';
import type { ClientRecord } from '@/lib/types/client';

const client = {
  id: 'c1',
  client_code: 'C-1',
  name: 'عميل',
  owner_name: 'فايز',
  business_name: 'مصنع كفرات',
  activity_type: 'مطعم / كافيه',
  building_area: 800,
} as ClientRecord;

describe('supervision report text fields', () => {
  it('preserves trailing spaces while typing contractor / branch manager names', () => {
    const seeded = seedSupervisionReport(client, EMPTY_PROJECT_ENGINEERING_DATA, null, {
      ...EMPTY_SUPERVISION_REPORT,
      contractor_name: 'شركة ',
      branch_manager_name: 'محمد ',
      tasks: EMPTY_PROJECT_ENGINEERING_DATA.supervision_report.tasks,
      months: EMPTY_PROJECT_ENGINEERING_DATA.supervision_report.months,
    });

    expect(seeded.contractor_name).toBe('شركة ');
    expect(seeded.branch_manager_name).toBe('محمد ');

    const next = seedSupervisionReport(client, EMPTY_PROJECT_ENGINEERING_DATA, null, {
      ...seeded,
      contractor_name: 'شركة ابو نور',
      branch_manager_name: 'محمد نور',
    });
    expect(next.contractor_name).toBe('شركة ابو نور');
    expect(next.branch_manager_name).toBe('محمد نور');
  });

  it('trims free-text fields only on persist helper', () => {
    const trimmed = trimSupervisionTextFields({
      ...EMPTY_SUPERVISION_REPORT,
      contractor_name: '  شركة ابو نور  ',
      branch_manager_name: ' محمد نور ',
      notes: ' ملاحظة ',
    });
    expect(trimmed.contractor_name).toBe('شركة ابو نور');
    expect(trimmed.branch_manager_name).toBe('محمد نور');
    expect(trimmed.notes).toBe('ملاحظة');
  });
});
