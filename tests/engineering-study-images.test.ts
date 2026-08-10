import { describe, expect, it } from 'vitest';
import { generateEngineeringStudy } from '@/lib/projects/engineering-report-engine';
import { buildEngineeringStudyHtml } from '@/lib/projects/engineering-report-engine/print-html';
import { EMPTY_TECHNICAL_REPORT } from '@/lib/types/project-reports';
import type { ClientRecord } from '@/lib/types/client';
import type { CompanyProfile } from '@/lib/company-profile';

const client = {
  id: 'c1',
  client_code: '0001-C',
  name: 'مصنع كفرات',
  business_name: 'مصنع كفرات',
  city: 'جدة',
  district: 'النهضة',
  region: 'مكة',
  activity_type: 'restaurant',
} as unknown as ClientRecord;

const company = {
  name: 'توقع',
  legal_name: 'مكتب توقع',
  logo_url: '',
  tagline: '',
  address: 'جدة',
  city: 'جدة',
  phone: '',
  stamp_text: 'توقع',
} as CompanyProfile;

describe('engineering study print images', () => {
  it('embeds facade on cover and map/coords on site page (print page 5)', () => {
    const facade = 'data:image/jpeg;base64,/9j/facade';
    const earth = 'data:image/jpeg;base64,/9j/earth';
    const report = {
      ...EMPTY_TECHNICAL_REPORT,
      outgoing_number: 'OUT-1',
      report_date: '2026-08-09',
      location_description: 'جدة — النهضة',
      gps_lat: '21.5433',
      gps_lng: '39.1728',
      facade_photo: { id: 'f1', caption: 'واجهة', dataUrl: facade },
      earth_photo: { id: 'e1', caption: 'خريطة', dataUrl: earth },
    };

    const doc = generateEngineeringStudy({ client, report, locale: 'ar' });
    expect(doc.cover_image?.src).toBe(facade);

    const site = doc.sections.find((s) => s.id === 'site_information');
    expect(site?.number).toBe(5);
    expect(site?.images?.some((img) => img.src === earth)).toBe(true);
    expect(site?.tables?.[0].rows.some((row) => row.includes('21.5433'))).toBe(true);

    const html = buildEngineeringStudyHtml({ document: doc, company });
    expect(html).toContain(facade);
    expect(html).toContain(earth);
    expect(html).toContain('cover-facade');
    expect(html).toContain('بيانات الموقع والإحداثيات');
  });

  it('embeds system and subsection item photos into matching study sections', () => {
    const pumpPhoto = 'data:image/jpeg;base64,/9j/pump';
    const panelPhoto = 'data:image/jpeg;base64,/9j/panel';
    const pipePhoto = 'data:image/jpeg;base64,/9j/pipe';
    const zoneProof = 'data:image/jpeg;base64,/9j/zoneproof';
    const occProof = 'data:image/jpeg;base64,/9j/occ';

    const report = {
      ...EMPTY_TECHNICAL_REPORT,
      outgoing_number: 'OUT-2',
      report_date: '2026-08-10',
      firefighting_items: [
        {
          id: 'ff_pumps',
          enabled: true,
          notes: 'مضخة رئيسية',
          selectedOptions: ['مضخة رئيسية: قدرة وضغط وفق الحساب الهيدروليكي'],
          photos: [{ id: 'p1', caption: 'غرفة المضخات', dataUrl: pumpPhoto }],
        },
        {
          id: 'ff_piping',
          enabled: true,
          notes: 'شبكة رش',
          selectedOptions: [],
          photos: [{ id: 'p2', caption: 'شبكة الأنابيب', dataUrl: pipePhoto }],
        },
      ],
      alarm_items: [
        {
          id: 'al_panel',
          enabled: true,
          notes: 'لوحة إنذار',
          selectedOptions: [],
          photos: [{ id: 'a1', caption: 'لوحة التحكم', dataUrl: panelPhoto }],
        },
      ],
      code_proofs_by_key: {
        'occ-class': [{ id: 'c1', caption: 'مقطع الإشغال', dataUrl: occProof }],
      },
      floor_uses: [
        {
          id: 'fl1',
          floor_name: 'أرضي',
          floor_area_m2: '400',
          structure: 'خرسانة',
          classification: 'TYPE I A',
          zones: [
            {
              id: 'z1',
              use_code: 'storage',
              label: 'مستودع',
              area_m2: '200',
              code_proof_photo: {
                id: 'zp1',
                caption: 'إثبات المستودع',
                dataUrl: zoneProof,
              },
            },
          ],
        },
      ],
    };

    const doc = generateEngineeringStudy({ client, report, locale: 'ar' });
    const pumps = doc.sections.find((s) => s.id === 'fire_pump_analysis');
    const alarm = doc.sections.find((s) => s.id === 'fire_alarm_study');
    const sprinkler = doc.sections.find((s) => s.id === 'sprinkler_system');
    const occupancy = doc.sections.find((s) => s.id === 'occupancy_classification');

    expect(pumps?.images?.some((img) => img.src === pumpPhoto)).toBe(true);
    expect(alarm?.images?.some((img) => img.src === panelPhoto)).toBe(true);
    expect(sprinkler?.images?.some((img) => img.src === pipePhoto)).toBe(true);
    expect(sprinkler?.images?.some((img) => img.src === zoneProof)).toBe(true);
    expect(occupancy?.images?.some((img) => img.src === occProof)).toBe(true);

    const html = buildEngineeringStudyHtml({ document: doc, company });
    expect(html).toContain(pumpPhoto);
    expect(html).toContain(panelPhoto);
    expect(html).toContain(pipePhoto);
    expect(html).toContain(zoneProof);
    expect(html).toContain(occProof);
    expect(html).toContain('غرفة المضخات');
    expect(html).toContain('لوحة التحكم');
  });
});
