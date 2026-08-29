import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEFAULT_COMPANY_PROFILE } from '@/lib/company-profile';
import { parseProjectEngineeringData } from '@/lib/business/project-reports';
import { buildExistingFinalTechnicalReportDocument } from '@/lib/projects/existing-final-technical-report-document';
import { buildExistingFinalTechnicalReportHtml } from '@/lib/projects/engineering-report-engine/renderer/existing-final-technical-template';
import { documentToFlowBlocks } from '@/lib/projects/engineering-report-engine/renderer/flow-document';
import {
  buildExistingTechnicalReportModel,
  existingFinalReportRecommendations,
  EXISTING_REPORT_UNSPECIFIED_VALUE,
} from '@/lib/projects/existing-technical-report-model';
import {
  EXISTING_FACADE_MISSING_LABEL,
  EXISTING_MANDATORY_PAGE_SECTIONS,
} from '@/lib/projects/existing-technical-report-profile';
import { EMPTY_FIRE_PROTECTION_DESIGN } from '@/lib/types/fire-protection-design';
import { EMPTY_PROJECT_ENGINEERING_DATA } from '@/lib/types/project-reports';
import type { ClientRecord } from '@/lib/types/client';

const client: ClientRecord = {
  id: 'existing-rebuild-test',
  client_code: 'LD-2026-014',
  name: 'مشروع LD-2026-014',
  business_name: 'منشأة LD-2026-014',
  owner_name: 'مالك LD-2026-014',
  city: 'الرياض',
  district: 'النرجس',
  street: 'شارع التقييم',
  building_area: 920,
  floors_count: 2,
  primary_engineering_project_identity: {
    clientId: 'existing-rebuild-test',
    projectId: 'project-ld-2026-014',
    projectCode: 'PRJ-LD-2026-014',
    projectClassification: 'EXISTING',
  },
};

const root = resolve(__dirname, '..');
const read = (relative: string) => readFileSync(resolve(root, relative), 'utf8');

function baseData() {
  return parseProjectEngineeringData({
    ...EMPTY_PROJECT_ENGINEERING_DATA,
    technical_report: {
      ...EMPTY_PROJECT_ENGINEERING_DATA.technical_report,
      outgoing_number: 'TR-LD-2026-014',
      report_date: '2026-08-29',
      location_description: 'موقع المشروع ضمن حي النرجس بالرياض.',
      gps_lat: '24.8123',
      gps_lng: '46.7123',
      risk_class: 'خطر عادي — المجموعة الأولى',
      facade_photo: {
        id: 'facade-01',
        caption: 'واجهة المشروع',
        dataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      },
      earth_photo: {
        id: 'earth-01',
        caption: 'صورة جوية',
        dataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      },
      evidence: {
        version: 1,
        civil_defense: {
          center_name: 'مركز الدفاع المدني — النرجس',
          distance_value: 2.4,
          distance_unit: 'km',
          travel_time_minutes: 8,
          source_label: 'سجل المهندس',
          engineer_confirmed_at: '2026-08-20',
          map_evidence_id: 'cd-map-01',
        },
        items: [{
          id: 'cd-map-01',
          kind: 'civil_defense_map',
          title: 'خريطة مسار الوصول',
          category: 'civil_defense',
          display_order: 1,
          include_in_report: true,
          created_at: '2026-08-20T00:00:00.000Z',
          file: {
            id: 'cd-map-file-01',
            dataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
            mimeType: 'image/png',
            fileName: 'cd-map.png',
          },
        }],
      },
    },
    building_plan: {
      ...EMPTY_PROJECT_ENGINEERING_DATA.building_plan,
      building_use: 'مبنى إداري قائم',
      occupancy_classification: 'مكاتب إدارية',
      floors_description: 'دوران',
      building_permit_number: 'BP-LD-014',
      building_permit_date: '2024-06-01',
    },
    fire_protection_design: {
      ...EMPTY_FIRE_PROTECTION_DESIGN,
      fire_truck_access: {
        ...EMPTY_FIRE_PROTECTION_DESIGN.fire_truck_access,
        site_entrance: 'مدخل شمالي',
        fire_road: 'طريق خدمة شرقي',
      },
      pump: {
        ...EMPTY_FIRE_PROTECTION_DESIGN.pump,
        rated_flow: { value: 1403, unit: 'GPM', source: 'hydraulic_calc' },
        rated_pressure: { value: 14, unit: 'bar', source: 'hydraulic_calc' },
      },
      sprinkler: {
        ...EMPTY_FIRE_PROTECTION_DESIGN.sprinkler,
        design_pressure: '14',
        design_flow: '1403',
      },
      water_tank: {
        ...EMPTY_FIRE_PROTECTION_DESIGN.water_tank,
        water_demand_lpm: { value: 1324.89, unit: 'L/min', source: 'calculated' },
        duration_min: { value: 60, unit: 'min', source: 'rule_requirement' },
        calculated_required_volume_m3: 79.493,
      },
    },
    existing_assessment: {
      version: 1,
      systems: {
        sprinkler_system: {
          existing_presence: 'PRESENT',
          compliance_status: 'NON_COMPLIANT',
          action_text: 'إجراء بأولوية.',
          priority: 'HIGH',
        },
        fire_pumps: {
          existing_presence: 'PRESENT',
          compliance_status: 'NON_COMPLIANT',
          action_text: 'إجراء بدون أولوية.',
        },
      },
    },
  });
}

function buildHtml(data = baseData()) {
  const model = buildExistingTechnicalReportModel(client, data, DEFAULT_COMPANY_PROFILE);
  const document = buildExistingFinalTechnicalReportDocument(model);
  const html = buildExistingFinalTechnicalReportHtml({ document, company: DEFAULT_COMPANY_PROFILE });
  return { model, document, html };
}

describe('EXISTING report rebuild — pages 1-6, location, PDF Arabic', () => {
  it('keeps mandatory page sections in TOC order after cover and TOC', () => {
    const { document } = buildHtml();
    const { chapters } = documentToFlowBlocks(document);
    expect(chapters.slice(0, EXISTING_MANDATORY_PAGE_SECTIONS.length).map((item) => item.id)).toEqual([
      ...EXISTING_MANDATORY_PAGE_SECTIONS,
    ]);
  });

  it('shows unified location on cover, facility table, and site page', () => {
    const { document, html } = buildHtml();
    const location = document.location_display || '';
    expect(location).toContain('الرياض');
    expect(location).toContain('النرجس');
    expect(html).toContain(`<th>الموقع</th><td>${location.split(' — ')[0]}`);
    const facility = document.sections.find((section) => section.id === 'facility_data');
    const locationRow = facility?.tables?.[0]?.rows.find(([label]) => label === 'العنوان' || label === 'الموقع');
    expect(locationRow?.[1]).toBe(location);
    const site = document.sections.find((section) => section.id === 'site_information');
    const intro = site?.presentation_blocks?.find((block) => block.type === 'paragraph');
    expect(intro && intro.type === 'paragraph' ? intro.text : '').toContain('الرياض');
    expect(intro && intro.type === 'paragraph' ? intro.text : '').toContain('النرجس');
    expect(site?.presentation_blocks?.some((block) => block.type === 'paragraph')).toBe(true);
  });

  it('renders facade, aerial, and civil defense map when present and placeholder when facade missing', () => {
    const withMedia = buildHtml();
    expect(withMedia.html).toContain('existing-report-image-block');
    expect(withMedia.html).toContain('الصورة الجوية للموقع');

    const withoutFacade = buildHtml(parseProjectEngineeringData({
      ...baseData(),
      technical_report: {
        ...baseData().technical_report,
        facade_photo: undefined,
      },
    }));
    expect(withoutFacade.html).toContain(EXISTING_FACADE_MISSING_LABEL);
    expect(withoutFacade.html).toContain('existing-report-image-slot is-missing');
  });

  it('does not leak calculated defaults into engineering rows', () => {
    const { model } = buildHtml();
    const values = model.engineering_sections.flatMap((section) => section.rows.map((row) => `${row.label}:${row.value}`));
    expect(values).toContain(`ضغط التصميم:${EXISTING_REPORT_UNSPECIFIED_VALUE}`);
    expect(values).toContain(`تصرف التصميم:${EXISTING_REPORT_UNSPECIFIED_VALUE}`);
    expect(values.some((row) => row.includes('معدل الطلب المائي'))).toBe(false);
  });

  it('keeps final recommendations without explicit engineer priority out of the document table', () => {
    const { model, document } = buildHtml();
    expect(model.recommendations.length).toBeGreaterThan(1);
    expect(existingFinalReportRecommendations(model)).toHaveLength(1);
    const section = document.sections.find((item) => item.id === 'existing_recommendations');
    const content = JSON.stringify(section);
    expect(content).toContain('إجراء بأولوية.');
    expect(content).not.toContain('إجراء بدون أولوية.');
  });

  it('wires the Chromium PDF download path instead of canvas rasterization for EXISTING reports', () => {
    expect(read('components/projects/TechnicalReportPrint.tsx')).toContain("pdfEngine: 'chromium'");
    expect(read('lib/print/document-preview.ts')).toContain("pdfEngine === 'chromium'");
    expect(read('lib/print/document-preview.ts')).toContain("fetch('/api/reports/html-to-pdf'");
    expect(read('app/api/reports/html-to-pdf/route.ts')).toContain('renderHtmlToPdfBuffer');
    expect(read('lib/print/chromium-html-to-pdf.server.ts')).toContain('--print-to-pdf=');
    expect(read('lib/print/chromium-html-to-pdf.server.ts')).toContain('--user-data-dir=');
    expect(read('lib/projects/engineering-report-engine/renderer/existing-final-technical-template.ts')).toContain('Noto Naskh Arabic');
  });

  it('does not force page-break-after on mandatory section headings', () => {
    const css = read('lib/projects/engineering-report-engine/renderer/existing-final-technical-template.ts');
    expect(css).toContain('.official-mandatory-page { break-before:page; page-break-before:always; min-height:0; }');
    expect(css).not.toContain('break-after:page; page-break-after:always; min-height:0; }');
    expect(css).not.toMatch(/\.official-toc-page[^}]*break-after:page/);
  });
});
