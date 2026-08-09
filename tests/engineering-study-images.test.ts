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
});
