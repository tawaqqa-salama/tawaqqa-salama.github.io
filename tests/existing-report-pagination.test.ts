import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEFAULT_COMPANY_PROFILE } from '@/lib/company-profile';
import { parseProjectEngineeringData } from '@/lib/business/project-reports';
import { buildExistingFinalTechnicalReportDocument } from '@/lib/projects/existing-final-technical-report-document';
import { buildExistingFinalTechnicalReportHtml } from '@/lib/projects/engineering-report-engine/renderer/existing-final-technical-template';
import {
  EXISTING_REPORT_IMAGE_FRAME,
  getExistingReportDesignSystemCss,
} from '@/lib/projects/engineering-report-engine/renderer/existing-report-design-system';
import { documentToFlowBlocks } from '@/lib/projects/engineering-report-engine/renderer/flow-document';
import { EXISTING_MANDATORY_PAGE_SECTIONS } from '@/lib/projects/existing-technical-report-profile';
import { buildExistingTechnicalReportModel } from '@/lib/projects/existing-technical-report-model';
import { EMPTY_FIRE_PROTECTION_DESIGN } from '@/lib/types/fire-protection-design';
import { EMPTY_PROJECT_ENGINEERING_DATA } from '@/lib/types/project-reports';
import type { ClientRecord } from '@/lib/types/client';

const root = resolve(__dirname, '..');
const read = (relative: string) => readFileSync(resolve(root, relative), 'utf8');
const templateCss = read('lib/projects/engineering-report-engine/renderer/existing-final-technical-template.ts');
const designCss = getExistingReportDesignSystemCss();

const client: ClientRecord = {
  id: 'pagination-test',
  client_code: 'LD-PAG-01',
  name: 'مشروع اختبار التقسيم',
  business_name: 'منشأة اختبار التقسيم',
  owner_name: 'مالك',
  city: 'الرياض',
  district: 'النرجس',
  street: 'شارع التقسيم',
  building_area: 920,
  floors_count: 2,
  primary_engineering_project_identity: {
    clientId: 'pagination-test',
    projectId: 'p-pagination',
    projectCode: 'PRJ-PAG-01',
    projectClassification: 'EXISTING',
  },
};

function svgDataUrl(width: number, height: number, label: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#cfe8ef"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-size="24" fill="#123d4c">${label}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function minimalPaginationFixture() {
  return parseProjectEngineeringData({
    ...EMPTY_PROJECT_ENGINEERING_DATA,
    technical_report: {
      ...EMPTY_PROJECT_ENGINEERING_DATA.technical_report,
      outgoing_number: 'TR-PAG-MIN',
      report_date: '2026-08-29',
      location_description: 'موقع اختبار pagination.',
      gps_lat: '24.8123',
      gps_lng: '46.7123',
      site_surroundings: { north: 'A', south: 'B', east: 'C', west: 'D' },
      facade_photo: { id: 'f-wide', dataUrl: svgDataUrl(2000, 500, 'WIDE-FACADE') },
      earth_photo: { id: 'f-tall', dataUrl: svgDataUrl(500, 1600, 'TALL-AERIAL') },
      components: [{
        id: 'c-1',
        part_name: 'المبنى الرئيسي',
        use: 'إداري',
        area_m2: '920',
        floors_count: '2',
        height: '12',
        capacity: '350',
        description: 'خرساني',
        structure: 'خرساني',
        classification: 'خطر عادي',
      }],
      evidence: {
        version: 1,
        civil_defense: {
          center_name: 'مركز الدفاع المدني',
          distance_value: 2.4,
          distance_unit: 'km',
          travel_time_minutes: 8,
          route_description: 'مسار',
          source_label: 'مهندس',
          engineer_confirmed_at: '2026-08-20',
          route_evidence_id: 'cd-route-01',
        },
        items: [{
          id: 'cd-route-01',
          kind: 'civil_defense_route',
          title: 'خريطة مسار الوصول',
          category: 'civil_defense_route',
          display_order: 1,
          include_in_report: true,
          created_at: '2026-08-20T00:00:00.000Z',
          file: {
            id: 'cd-file',
            dataUrl: svgDataUrl(1400, 900, 'ROUTE-WIDE'),
            mimeType: 'image/svg+xml',
            fileName: 'route.svg',
          },
        }],
      },
    },
    building_plan: {
      ...EMPTY_PROJECT_ENGINEERING_DATA.building_plan,
      building_use: 'مبنى إداري قائم',
      occupancy_classification: 'مكاتب إدارية',
      building_permit_number: 'BP-PAG-MIN',
    },
    fire_protection_design: { ...EMPTY_FIRE_PROTECTION_DESIGN },
    existing_assessment: {
      version: 1,
      systems: {
        sprinkler_system: {
          existing_presence: 'PRESENT',
          compliance_status: 'NON_COMPLIANT',
          action_text: 'إجراء.',
          priority: 'HIGH',
        },
      },
    },
  });
}

function paginationFixture() {
  const components = Array.from({ length: 28 }, (_, index) => ({
    id: `c-${index + 1}`,
    part_name: `مكون ${index + 1}`,
    use: 'إداري',
    area_m2: String(120 + index * 15),
    floors_count: String((index % 3) + 1),
    height: String(8 + index),
    capacity: String(80 + index * 5),
    description: `وصف مكون ${index + 1} — نص عربي طويل للتحقق من اللف داخل الخلية دون قص`.repeat(2),
    structure: 'خرساني',
    classification: 'خطر عادي',
  }));

  return parseProjectEngineeringData({
    ...EMPTY_PROJECT_ENGINEERING_DATA,
    technical_report: {
      ...EMPTY_PROJECT_ENGINEERING_DATA.technical_report,
      outgoing_number: 'TR-PAG-01',
      report_date: '2026-08-29',
      location_description: 'موقع اختبار pagination للتقرير الفني.',
      maps_url: 'https://maps.google.com/example',
      gps_lat: '24.8123',
      gps_lng: '46.7123',
      site_surroundings: { north: 'شارع A', south: 'مبنى B', east: 'موقف C', west: 'حديقة D' },
      facade_photo: { id: 'f-wide', caption: 'واجهة', dataUrl: svgDataUrl(2000, 500, 'WIDE-FACADE') },
      earth_photo: { id: 'f-tall', caption: 'جوية', dataUrl: svgDataUrl(500, 1600, 'TALL-AERIAL') },
      components,
      evidence: {
        version: 1,
        civil_defense: {
          center_name: 'مركز الدفاع المدني — النرجس',
          distance_value: 2.4,
          distance_unit: 'km',
          travel_time_minutes: 8,
          route_description: 'طريق خدمة ثم شارع رئيسي',
          source_label: 'سجل المهندس',
          engineer_confirmed_at: '2026-08-20',
          route_evidence_id: 'cd-route-01',
        },
        items: [{
          id: 'cd-route-01',
          kind: 'civil_defense_route',
          title: 'خريطة مسار الوصول',
          category: 'civil_defense_route',
          display_order: 1,
          include_in_report: true,
          created_at: '2026-08-20T00:00:00.000Z',
          file: {
            id: 'cd-file',
            dataUrl: svgDataUrl(1400, 900, 'ROUTE-WIDE'),
            mimeType: 'image/svg+xml',
            fileName: 'route.svg',
          },
        }],
      },
    },
    building_plan: {
      ...EMPTY_PROJECT_ENGINEERING_DATA.building_plan,
      building_use: 'مبنى إداري قائم',
      occupancy_classification: 'مكاتب إدارية',
      building_permit_number: 'BP-PAG-01',
    },
    fire_protection_design: { ...EMPTY_FIRE_PROTECTION_DESIGN },
    existing_assessment: {
      version: 1,
      systems: Object.fromEntries(
        Array.from({ length: 12 }, (_, index) => [
          `system_${index + 1}`,
          {
            applicable: true,
            existing_presence: 'PRESENT',
            observed_configuration: `وضع راهن ${index + 1}`,
            required_text: `مطلوب ${index + 1}`,
            gap_text: `فجوة ${index + 1}`,
            compliance_status: index % 2 === 0 ? 'NON_COMPLIANT' : 'NEEDS_COMPLETION',
            action_text: `إجراء ${index + 1}`,
            requirement_reference: `مرجع ${index + 1}`,
            observation: `ملاحظة ${index + 1} `.repeat(8),
          },
        ])
      ),
    },
  });
}

function buildReport(data = paginationFixture()) {
  const model = buildExistingTechnicalReportModel(client, data, DEFAULT_COMPANY_PROFILE);
  const document = buildExistingFinalTechnicalReportDocument(model);
  const html = buildExistingFinalTechnicalReportHtml({ document, company: DEFAULT_COMPANY_PROFILE });
  return { model, document, html };
}

describe('EXISTING report pagination / print layout', () => {
  it('does not stack TOC break-after with first mandatory break-before', () => {
    expect(templateCss).toContain('.official-toc-page { min-height:0; padding:0; }');
    expect(templateCss).not.toMatch(/\.official-toc-page[^}]*break-after:page/);
    expect(templateCss).toContain('.official-mandatory-page { break-before:page; page-break-before:always; min-height:0; }');
  });

  it('uses dynamic pagination for assessment sections after page 6', () => {
    expect(templateCss).toContain('.official-assessment-section { break-before:auto; page-break-before:auto; }');
    expect(templateCss).not.toMatch(/\.official-assessment-section[^}]*break-before:page/);
  });

  it('allows long tables to split while keeping rows intact and repeating thead', () => {
    expect(templateCss).not.toMatch(/\.official-mandatory-page \+ \.existing-report-table-wrap[^}]*break-inside:avoid/);
    expect(designCss).toContain('display:table-header-group');
    expect(designCss).toContain('display:table-footer-group');
    expect(designCss).toContain('tbody tr { break-inside:avoid; page-break-inside:avoid; }');
    expect(designCss).toContain('vertical-align:middle');
    expect(designCss).toContain('overflow-wrap:anywhere');
  });

  it('keeps unified image frame dimensions and cover crop without stretch', () => {
    expect(designCss).toContain(`height:${EXISTING_REPORT_IMAGE_FRAME.height}`);
    expect(designCss).toContain(`max-width:${EXISTING_REPORT_IMAGE_FRAME.maxWidth}`);
    expect(designCss).toContain('object-fit:cover');
    expect(designCss).toContain('object-position:center');
  });

  it('keeps section headings with following content and table captions with tables', () => {
    expect(templateCss).toContain('.keep-next { page-break-after:avoid; break-after:avoid-page; }');
    expect(designCss).toContain('.official-table-caption { break-after:avoid-page; page-break-after:avoid;');
  });

  it('writes pagination HTML artifact with realistic mixed-aspect images and long tables', () => {
    const { html } = buildReport();
    const outDir = resolve(root, 'artifacts/existing-report-pagination');
    mkdirSync(outDir, { recursive: true });
    writeFileSync(resolve(outDir, 'official-technical-report.html'), html, 'utf8');
    expect(html).toContain('existing-report-image-slot');
    expect(html).toContain('existing-report-table--components');
    expect((html.match(/<tr class="/g) || []).length).toBeGreaterThan(20);
  });

  it('renders mandatory sections in fixed order for pages 3-6', () => {
    const { document, html } = buildReport(minimalPaginationFixture());
    const { chapters } = documentToFlowBlocks(document);
    expect(chapters.slice(0, EXISTING_MANDATORY_PAGE_SECTIONS.length).map((item) => item.id)).toEqual([
      ...EXISTING_MANDATORY_PAGE_SECTIONS,
    ]);
    const mandatoryIndexes = EXISTING_MANDATORY_PAGE_SECTIONS.map((id) => html.indexOf(`id="sec-${id}"`));
    expect(mandatoryIndexes.every((index) => index >= 0)).toBe(true);
    for (let i = 1; i < mandatoryIndexes.length; i += 1) {
      expect(mandatoryIndexes[i]).toBeGreaterThan(mandatoryIndexes[i - 1]);
    }
  });

  it('isolates project components on page 6 before the next technical section', () => {
    expect(templateCss).toContain('.official-post-project-components-break { break-after:page; page-break-after:always;');
    const { document } = buildReport(minimalPaginationFixture());
    const { blocks } = documentToFlowBlocks(document);
    const breakIndex = blocks.findIndex((block) => block.kind === 'page_break');
    const nextAssessmentIndex = blocks.findIndex((block) => block.kind === 'chapter' && block.id.startsWith('existing_assessment_'));
    expect(breakIndex).toBeGreaterThan(0);
    expect(nextAssessmentIndex).toBeGreaterThan(breakIndex);
  });

  it('validates Chromium PDF page map artifact when generated locally', () => {
    const resultPath = resolve(root, 'artifacts/existing-report-pagination/result.json');
    if (!existsSync(resultPath)) return;
    const result = JSON.parse(readFileSync(resultPath, 'utf8')) as {
      pageMap?: Record<string, number>;
      blankPages?: number[];
    };
    expect(result.blankPages || []).not.toContain(3);
    expect(result.pageMap?.facility_data).toBe(3);
    expect(result.pageMap?.site_information).toBe(4);
    expect(result.pageMap?.fire_truck_access).toBe(5);
    expect(result.pageMap?.project_components).toBe(6);
  });
});
