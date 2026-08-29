import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEFAULT_COMPANY_PROFILE } from '@/lib/company-profile';
import { parseProjectEngineeringData } from '@/lib/business/project-reports';
import { buildExistingFinalTechnicalReportDocument } from '@/lib/projects/existing-final-technical-report-document';
import { buildExistingFinalTechnicalReportHtml } from '@/lib/projects/engineering-report-engine/renderer/existing-final-technical-template';
import { esc } from '@/lib/projects/engineering-report-engine/renderer/html-utils';
import {
  EXISTING_REPORT_IMAGE_FRAME,
  getExistingReportDesignSystemCss,
} from '@/lib/projects/engineering-report-engine/renderer/existing-report-design-system';
import { documentToFlowBlocks } from '@/lib/projects/engineering-report-engine/renderer/flow-document';
import {
  EXISTING_REPORT_MAPS_LINK_LABEL,
  EXISTING_REPORT_MAPS_UNREGISTERED,
  buildExistingReportCoordinatePresentationRows,
  formatExistingReportMapsTableRow,
} from '@/lib/projects/existing-report-presentation';
import { buildExistingReportFacilityRows } from '@/lib/projects/existing-technical-report-profile';
import { buildExistingTechnicalReportModel } from '@/lib/projects/existing-technical-report-model';
import { EMPTY_FIRE_PROTECTION_DESIGN } from '@/lib/types/fire-protection-design';
import { EMPTY_PROJECT_ENGINEERING_DATA } from '@/lib/types/project-reports';
import type { ClientRecord } from '@/lib/types/client';

const root = resolve(__dirname, '..');
const read = (relative: string) => readFileSync(resolve(root, relative), 'utf8');
const templateCss = read('lib/projects/engineering-report-engine/renderer/existing-final-technical-template.ts');
const designCss = getExistingReportDesignSystemCss();

const client: ClientRecord = {
  id: 'final-polish-test',
  client_code: 'LD-POL-01',
  name: 'مشروع Final Polish',
  business_name: 'منشأة Final Polish',
  owner_name: 'مالك',
  city: 'الرياض',
  district: 'النرجس',
  street: 'شارع Polish',
  building_area: 920,
  floors_count: 2,
  primary_engineering_project_identity: {
    clientId: 'final-polish-test',
    projectId: 'p-polish',
    projectCode: 'PRJ-POL-01',
    projectClassification: 'EXISTING',
  },
};

const LONG_MAPS_URL = 'https://maps.google.com/?q=24.8123,46.7123&entry=ttu&g_ep=EgoyMDI2MDgyOS4wIKXMDSoASAFQAw%3D%3D';

function svgDataUrl(width: number, height: number, label: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#cfe8ef"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-size="24" fill="#123d4c">${label}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function polishFixture() {
  return parseProjectEngineeringData({
    ...EMPTY_PROJECT_ENGINEERING_DATA,
    technical_report: {
      ...EMPTY_PROJECT_ENGINEERING_DATA.technical_report,
      outgoing_number: 'TR-POL-01',
      report_date: '2026-08-29',
      location_description: 'موقع Final Polish.',
      maps_url: LONG_MAPS_URL,
      gps_lat: '46262.26',
      gps_lng: '654546.455',
      site_surroundings: { north: 'A', south: 'B', east: 'C', west: 'D' },
      facade_photo: { id: 'f-wide', dataUrl: svgDataUrl(2000, 500, 'FACADE') },
      earth_photo: { id: 'f-tall', dataUrl: svgDataUrl(500, 1600, 'AERIAL') },
      components: Array.from({ length: 8 }, (_, index) => ({
        id: `c-${index}`,
        part_name: `مكون ${index + 1}`,
        use: 'إداري',
        area_m2: '100',
        floors_count: '2',
        height: '10',
        capacity: '50',
        description: 'خرساني',
        structure: 'خرساني',
        classification: 'عادي',
      })),
      evidence: {
        version: 1,
        civil_defense: {
          center_name: 'مركز الدفاع المدني',
          distance_value: 2,
          distance_unit: 'km',
          travel_time_minutes: 7,
          route_description: 'مسار',
          source_label: 'مهندس',
          engineer_confirmed_at: '2026-08-20',
          route_evidence_id: 'r1',
        },
        items: [{
          id: 'r1',
          kind: 'civil_defense_route',
          title: 'مسار',
          category: 'civil_defense_route',
          display_order: 1,
          include_in_report: true,
          created_at: '2026-08-20T00:00:00.000Z',
          file: { id: 'f', dataUrl: svgDataUrl(1400, 900, 'ROUTE'), mimeType: 'image/svg+xml', fileName: 'route.svg' },
        }],
      },
    },
    building_plan: {
      ...EMPTY_PROJECT_ENGINEERING_DATA.building_plan,
      northing: '2391979.9527',
      easting: '513415.8874',
      building_permit_number: 'BP-POL-01',
      occupancy_classification: 'مكاتب',
    },
    fire_protection_design: { ...EMPTY_FIRE_PROTECTION_DESIGN },
    existing_assessment: {
      version: 1,
      systems: {
        fire_truck_access: { applicable: true, existing_presence: 'PRESENT', compliance_status: 'NEEDS_COMPLETION', action_text: 'إجراء.' },
        sprinkler_system: { applicable: true, existing_presence: 'PRESENT', compliance_status: 'NON_COMPLIANT', action_text: 'إجراء رش.' },
      },
    },
  });
}

function buildReport(data = polishFixture()) {
  const model = buildExistingTechnicalReportModel(client, data, DEFAULT_COMPANY_PROFILE);
  const document = buildExistingFinalTechnicalReportDocument(model);
  const html = buildExistingFinalTechnicalReportHtml({ document, company: DEFAULT_COMPANY_PROFILE });
  return { model, document, html, data };
}

describe('EXISTING report final polish', () => {
  it('renders Google Maps as label link without printing the long URL text', () => {
    const { html } = buildReport();
    expect(html).toContain('class="existing-report-maps-link"');
    expect(html).toContain(`href="${esc(LONG_MAPS_URL)}"`);
    expect(html).toContain(EXISTING_REPORT_MAPS_LINK_LABEL);
    expect(html).not.toMatch(new RegExp(`>${LONG_MAPS_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}<`));
  });

  it('shows غير مسجل when maps URL is missing', () => {
    const data = polishFixture();
    data.technical_report.maps_url = undefined;
    const { html } = buildReport(data);
    expect(html).toContain(EXISTING_REPORT_MAPS_UNREGISTERED);
    expect(html).not.toMatch(/<a class="existing-report-maps-link"/);
  });

  it('uses safe coordinate presentation without inventing UTM zone or lat/lng labels for unknown values', () => {
    const unknownOnly = parseProjectEngineeringData({
      ...EMPTY_PROJECT_ENGINEERING_DATA,
      technical_report: {
        ...EMPTY_PROJECT_ENGINEERING_DATA.technical_report,
        gps_lat: '46262.26',
        gps_lng: '654546.455',
      },
      building_plan: { ...EMPTY_PROJECT_ENGINEERING_DATA.building_plan },
    });
    expect(buildExistingReportCoordinatePresentationRows(unknownOnly)).toEqual([
      { label: 'الإحداثيات المسجلة', value: '46262.26 ، 654546.455' },
    ]);

    const data = polishFixture();
    const latLng = buildExistingReportCoordinatePresentationRows({
      ...data,
      technical_report: { ...data.technical_report, gps_lat: '24.8123', gps_lng: '46.7123' },
    });
    expect(latLng).toEqual([
      { label: 'Latitude', value: '24.8123' },
      { label: 'Longitude', value: '46.7123' },
    ]);

    const utm = buildExistingReportCoordinatePresentationRows(data);
    expect(utm).toEqual([
      { label: 'Easting', value: '513415.8874' },
      { label: 'Northing', value: '2391979.9527' },
    ]);
  });

  it('always includes maps row in facility table presentation', () => {
    const rows = buildExistingReportFacilityRows(client, polishFixture(), 'مشروع', 'الرياض');
    const maps = rows.find((row) => row.label === EXISTING_REPORT_MAPS_LINK_LABEL);
    expect(maps?.value).toBe(LONG_MAPS_URL);
    expect(formatExistingReportMapsTableRow(null).value).toBe(EXISTING_REPORT_MAPS_UNREGISTERED);
  });

  it('isolates page 6 to project components and starts next technical section after explicit break', () => {
    expect(templateCss).toContain('.official-post-project-components-break { break-after:page; page-break-after:always;');
    const { document } = buildReport();
    const { blocks } = documentToFlowBlocks(document);
    const componentsIndex = blocks.findIndex((block) => block.kind === 'chapter' && block.id === 'project_components');
    const breakIndex = blocks.findIndex((block) => block.kind === 'page_break');
    const nextAssessmentIndex = blocks.findIndex((block) => block.kind === 'chapter' && block.id.startsWith('existing_assessment_'));
    expect(componentsIndex).toBeGreaterThanOrEqual(0);
    expect(breakIndex).toBeGreaterThan(componentsIndex);
    expect(nextAssessmentIndex).toBeGreaterThan(breakIndex);
  });

  it('keeps unified image frame and cover crop without stretch regression', () => {
    expect(designCss).toContain(`height:${EXISTING_REPORT_IMAGE_FRAME.height}`);
    expect(designCss).toContain('object-fit:cover');
    expect(designCss).toContain('object-position:center');
  });

  it('materializes embedded Arabic fonts before Chromium PDF print', () => {
    expect(read('lib/print/chromium-html-to-pdf.server.ts')).toContain('materializeEmbeddedFontsForPrint');
    expect(read('lib/print/chromium-html-to-pdf.server.ts')).toContain('NotoNaskhArabic-Regular.ttf');
  });

  it('writes final polish HTML artifact with long components table', () => {
    const data = polishFixture();
    data.technical_report.components = Array.from({ length: 24 }, (_, index) => ({
      id: `c-${index}`,
      part_name: `مكون ${index + 1}`,
      use: 'إداري',
      area_m2: '100',
      floors_count: '2',
      height: '10',
      capacity: '50',
      description: 'وصف',
      structure: 'خرساني',
      classification: 'عادي',
    }));
    const { html } = buildReport(data);
    const outDir = resolve(root, 'artifacts/existing-report-final-polish');
    mkdirSync(outDir, { recursive: true });
    writeFileSync(resolve(outDir, 'official-technical-report.html'), html, 'utf8');
    expect(html).toContain('id="sec-project_components"');
    expect(html).toContain('official-post-project-components-break');
    expect((html.match(/<tr class="/g) || []).length).toBeGreaterThan(20);
  });

  it('validates polish PDF artifact page map and Arabic extraction when generated locally', () => {
    const resultPath = resolve(root, 'artifacts/existing-report-final-polish/result.json');
    if (!existsSync(resultPath)) return;
    const result = JSON.parse(readFileSync(resultPath, 'utf8')) as {
      pageMap?: Record<string, number>;
      page6OnlyComponents?: boolean;
      componentsSectionPage?: number;
      firstAssessmentPage?: number;
      arabicExtraction?: { ok: boolean; engine: string; notes?: string[] };
    };
    expect(result.pageMap?.facility_data).toBe(3);
    expect(result.pageMap?.site_information).toBe(4);
    expect(result.pageMap?.fire_truck_access).toBe(5);
    expect(result.pageMap?.project_components).toBe(6);
    expect((result.pageMap?.existing_assessment_site || 0)).toBeGreaterThanOrEqual(7);
    expect(result.page6OnlyComponents).toBe(true);
    expect(result.arabicExtraction?.ok).toBe(true);
  });
});
