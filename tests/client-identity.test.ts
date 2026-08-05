import { describe, expect, it } from 'vitest';
import {
  applyClientIdentityToCompletion,
  applyClientIdentityToSupervision,
  getClientIdentitySnapshot,
} from '@/lib/projects/client-identity';
import { seedCompletionCertificate } from '@/lib/projects/completion-certificate';
import { seedSupervisionReport } from '@/lib/projects/supervision-report';
import { applyPipelineInheritance } from '@/lib/projects/gated-pipeline';
import type { ClientRecord } from '@/lib/types/client';
import { EMPTY_PROJECT_ENGINEERING_DATA } from '@/lib/types/project-reports';

const client = {
  id: 'c1',
  client_code: 'C-0001',
  name: 'مصنع كفرات',
  owner_name: 'فايز صالح مسعود الحارثي',
  business_name: 'مصنع كفرات',
  activity_type: 'factory',
  city: 'جدة',
  district: 'النهضة',
  street: 'غير مسمى',
  plot_number: '139',
  land_area: 595.5,
  building_area: 800,
  floors_count: 1,
  phone: '0500000000',
  license_number: '4100097644',
} as ClientRecord;

describe('client identity single-entry', () => {
  it('snapshots owner, facility, activity, and location from sales', () => {
    const snap = getClientIdentitySnapshot(client);
    expect(snap.owner_name).toBe('فايز صالح مسعود الحارثي');
    expect(snap.facility_name).toBe('مصنع كفرات');
    expect(snap.activity_label).toBeTruthy();
    expect(snap.city).toBe('جدة');
    expect(snap.district).toBe('النهضة');
    expect(snap.land_area).toBe('595.5');
    expect(snap.building_area).toBe('800');
  });

  it('overwrites stale completion identity with live client data', () => {
    const seeded = seedCompletionCertificate(client, EMPTY_PROJECT_ENGINEERING_DATA, null, {
      ...EMPTY_PROJECT_ENGINEERING_DATA.completion_certificate,
      owner_name: 'اسم قديم خاطئ',
      facility_name: 'منشأة قديمة',
      activity_label: 'نشاط قديم',
      district: 'حي قديم',
    });
    expect(seeded.owner_name).toBe(client.owner_name);
    expect(seeded.facility_name).toBe(client.business_name);
    expect(seeded.district).toBe(client.district);
    expect(seeded.land_area).toBe(String(client.land_area));
  });

  it('overwrites stale supervision identity with live client data', () => {
    const seeded = seedSupervisionReport(client, EMPTY_PROJECT_ENGINEERING_DATA, null, {
      ...EMPTY_PROJECT_ENGINEERING_DATA.supervision_report,
      owner_name: 'مالك قديم',
      project_name: 'مشروع قديم',
      building_type: 'نوع قديم',
      area_m2: '1',
    });
    expect(seeded.owner_name).toBe(client.owner_name);
    expect(seeded.project_name).toContain('مصنع كفرات');
    expect(seeded.area_m2).toBe('800');
  });

  it('apply helpers force identity fields', () => {
    const cert = applyClientIdentityToCompletion(client, {
      owner_name: 'x',
      facility_name: 'y',
    });
    expect(cert.owner_name).toBe(client.owner_name);
    expect(cert.facility_name).toBe(client.business_name);

    const sup = applyClientIdentityToSupervision(client, { owner_name: 'z', area_m2: '9' });
    expect(sup.owner_name).toBe(client.owner_name);
    expect(sup.area_m2).toBe('800');
  });

  it('pipeline inheritance refreshes contract snapshots and completion', () => {
    const data = applyPipelineInheritance(
      client,
      {
        ...EMPTY_PROJECT_ENGINEERING_DATA,
        contract_onboarding: {
          ...EMPTY_PROJECT_ENGINEERING_DATA.contract_onboarding,
          client_name_snapshot: 'قديم',
          project_name_snapshot: 'قديم',
        },
        completion_certificate: {
          ...EMPTY_PROJECT_ENGINEERING_DATA.completion_certificate,
          owner_name: 'قديم',
        },
        building_plan: {
          ...EMPTY_PROJECT_ENGINEERING_DATA.building_plan,
          building_permit_number: '4100097644',
        },
      },
      null
    );
    expect(data.contract_onboarding.client_name_snapshot).toBe(client.name);
    expect(data.contract_onboarding.project_name_snapshot).toBe(client.business_name);
    expect(data.completion_certificate.owner_name).toBe(client.owner_name);
    expect(data.engineering_delivery.building_permit_number).toBe('4100097644');
    expect(data.engineering_delivery.civil_defense_city).toBe('جدة');
  });
});
