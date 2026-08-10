import { describe, expect, it } from 'vitest';
import {
  ENGINEERING_STUDY_SECTIONS,
  generateEngineeringStudy,
  MISSING_SECTION_AR,
  MISSING_SECTION_EN,
  buildEngineeringStudyHtml,
} from '@/lib/projects/engineering-report-engine';
import { EMPTY_TECHNICAL_REPORT } from '@/lib/types/project-reports';
import { DEFAULT_COMPANY_PROFILE } from '@/lib/company-profile';
import type { ClientRecord } from '@/lib/types/client';

function demoClient(overrides: Partial<ClientRecord> = {}): ClientRecord {
  return {
    id: 'c1',
    client_code: 'CL-100',
    name: 'مالك تجريبي',
    business_name: 'قاعة نسائم',
    activity_type: 'hall',
    owner_name: 'مالك القاعة',
    city: 'الرياض',
    region: 'الرياض',
    district: 'العليا',
    street: 'طريق الملك',
    building_area: 1200,
    floors_count: 2,
    land_area: 2000,
    project_status: 'تحت الإنشاء',
    ...overrides,
  } as ClientRecord;
}

describe('Engineering Report Generation Engine', () => {
  it('defines the full 31-section consultancy structure', () => {
    expect(ENGINEERING_STUDY_SECTIONS).toHaveLength(31);
    expect(ENGINEERING_STUDY_SECTIONS[0].id).toBe('cover');
    expect(ENGINEERING_STUDY_SECTIONS[30].id).toBe('conclusion');
  });

  it('generates professional sections without inventing missing engineering values', () => {
    const doc = generateEngineeringStudy({
      client: demoClient({ building_area: null as unknown as number, floors_count: null as unknown as number }),
      report: { ...EMPTY_TECHNICAL_REPORT, overview_text: '' },
      locale: 'ar',
    });

    expect(doc.sections.length).toBe(31);
    const building = doc.sections.find((s) => s.id === 'building_information');
    expect(building?.paragraphs.some((p) => p.incomplete || p.text === MISSING_SECTION_AR)).toBe(true);
  });

  it('generates English incomplete message when locale is en', () => {
    const doc = generateEngineeringStudy({
      client: demoClient({ business_name: '', name: '', owner_name: '' }),
      report: { ...EMPTY_TECHNICAL_REPORT },
      locale: 'en',
    });
    const intro = doc.sections.find((s) => s.id === 'introduction');
    expect(intro?.paragraphs[0]?.text).toBe(MISSING_SECTION_EN);
  });

  it('produces A4 HTML with cover, TOC, headers and citations from known codes', () => {
    const doc = generateEngineeringStudy({
      client: demoClient(),
      report: {
        ...EMPTY_TECHNICAL_REPORT,
        outgoing_number: 'OUT-77',
        report_date: '2026-08-01',
        building_classification: 'Group A',
        risk_class: 'Ordinary Hazard',
        building_status: 'تحت الإنشاء',
        firefighting_items: [
          {
            id: 'ff_pumps',
            enabled: true,
            notes: 'مضخة رئيسية وفق الحساب',
            selectedOptions: ['مضخة جوكي'],
            photos: [],
          },
          {
            id: 'ff_piping',
            enabled: true,
            notes: '',
            selectedOptions: ['مرشات حريق'],
            photos: [],
          },
        ],
        alarm_items: [
          {
            id: 'al_panel',
            enabled: true,
            notes: 'لوحة إنذار معتمدة',
            selectedOptions: [],
            photos: [],
          },
        ],
      },
      engineeringData: {
        building_plan: {
          status: 'مسودة',
          building_height_m: '12',
          sprinkler_system: 'نعم',
          fire_alarm_system: 'نعم',
          exits_count: '4',
          backup_generator: 'نعم',
          electrical_grounding: 'نعم',
          lightning_protection: 'لا',
        },
      } as never,
      locale: 'ar',
    });

    expect(doc.project_name).toBe('قاعة نسائم');
    const html = buildEngineeringStudyHtml({ document: doc, company: DEFAULT_COMPANY_PROFILE });
    expect(html).toContain('@page');
    expect(html).toContain('فهرس المحتويات');
    expect(html).toContain('قاعة نسائم');
    expect(html).toContain('class="rh"');
    expect(html).toContain('SBC');
    const sprinkler = doc.sections.find((s) => s.id === 'sprinkler_system');
    expect(sprinkler?.paragraphs[0]?.incomplete).not.toBe(true);
  });
});
