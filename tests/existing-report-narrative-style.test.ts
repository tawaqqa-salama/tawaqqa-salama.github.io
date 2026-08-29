import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEFAULT_COMPANY_PROFILE } from '@/lib/company-profile';
import { parseProjectEngineeringData } from '@/lib/business/project-reports';
import { buildExistingFinalTechnicalReportDocument } from '@/lib/projects/existing-final-technical-report-document';
import { buildExistingFinalTechnicalReportHtml } from '@/lib/projects/engineering-report-engine/renderer/existing-final-technical-template';
import { documentToFlowBlocks } from '@/lib/projects/engineering-report-engine/renderer/flow-document';
import {
  EXISTING_REPORT_IMAGE_FRAME,
  getExistingReportDesignSystemCss,
} from '@/lib/projects/engineering-report-engine/renderer/existing-report-design-system';
import {
  EXISTING_REPORT_SITE_MAPS_LINK_LABEL,
  buildCivilDefenseAccessNarrative,
  buildProjectComponentsNarrative,
  buildSiteBoundariesNarrative,
  buildSiteCoordinatesLine,
  buildSiteIntroNarrative,
} from '@/lib/projects/existing-report-presentation';
import { buildExistingReportSiteProfile } from '@/lib/projects/existing-technical-report-profile';
import { buildExistingTechnicalReportModel } from '@/lib/projects/existing-technical-report-model';
import { EMPTY_FIRE_PROTECTION_DESIGN } from '@/lib/types/fire-protection-design';
import { EMPTY_PROJECT_ENGINEERING_DATA } from '@/lib/types/project-reports';
import type { ClientRecord } from '@/lib/types/client';

const root = resolve(__dirname, '..');
const read = (relative: string) => readFileSync(resolve(root, relative), 'utf8');
const designCss = getExistingReportDesignSystemCss();

const client: ClientRecord = {
  id: 'narrative-style-test',
  client_code: 'LD-NAR-01',
  name: 'مشروع Narrative Style',
  business_name: 'منشأة Narrative Style',
  owner_name: 'مالك',
  city: 'الرياض',
  district: 'النرجس',
  street: 'شارع Narrative',
  building_area: 920,
  floors_count: 2,
  primary_engineering_project_identity: {
    clientId: 'narrative-style-test',
    projectId: 'p-narrative',
    projectCode: 'PRJ-NAR-01',
    projectClassification: 'EXISTING',
  },
};

const LONG_MAPS_URL = 'https://maps.google.com/?q=24.8123,46.7123&entry=ttu&g_ep=EgoyMDI2MDgyOS4wIKXMDSoASAFQAw%3D%3D';

function svgDataUrl(width: number, height: number, label: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#cfe8ef"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-size="24" fill="#123d4c">${label}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function narrativeFixture() {
  return parseProjectEngineeringData({
    ...EMPTY_PROJECT_ENGINEERING_DATA,
    technical_report: {
      ...EMPTY_PROJECT_ENGINEERING_DATA.technical_report,
      outgoing_number: 'TR-NAR-01',
      report_date: '2026-08-29',
      location_description: 'موقع Narrative Style.',
      maps_url: LONG_MAPS_URL,
      gps_lat: '46262.26',
      gps_lng: '654546.455',
      site_surroundings: { north: 'شارع الأمل', east: 'شارع بعرض 20 مترًا', west: 'مبنى قائم' },
      facade_photo: { id: 'f-wide', dataUrl: svgDataUrl(2000, 500, 'FACADE') },
      earth_photo: { id: 'f-tall', dataUrl: svgDataUrl(500, 1600, 'AERIAL') },
      components: [
        {
          id: 'c-basement',
          part_name: 'بدروم',
          use: 'مواقف سيارات',
          area_m2: '400',
          floors_count: '1',
          height: '4',
          capacity: '40',
          description: 'خرساني',
          structure: 'خرساني',
          classification: 'عادي',
        },
        {
          id: 'c-ground',
          part_name: 'دور أرضي',
          use: 'إداري',
          area_m2: '520',
          floors_count: '1',
          height: '5',
          capacity: '120',
          description: 'خرساني',
          structure: 'خرساني',
          classification: 'عادي',
        },
      ],
      evidence: {
        version: 1,
        civil_defense: {
          center_name: 'مركز الدفاع المدني',
          distance_value: 2,
          distance_unit: 'km',
          travel_time_minutes: 7,
          route_description: 'مسار الوصول من الشارع الرئيسي.',
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
      building_permit_number: 'BP-NAR-01',
      occupancy_classification: 'مكاتب',
    },
    fire_protection_design: {
      ...EMPTY_FIRE_PROTECTION_DESIGN,
      pump: { type: 'Electric + Diesel + Jockey', capacity: { value: 350, unit: 'GPM', source: 'engineer_input' }, pressure: { value: 7, unit: 'bar', source: 'engineer_input' } },
      diesel_pump: { capacity: { value: 350, unit: 'GPM', source: 'engineer_input' }, pressure: { value: 7, unit: 'bar', source: 'engineer_input' } },
      jockey_pump: { capacity: { value: 35, unit: 'GPM', source: 'engineer_input' }, pressure: { value: 12, unit: 'bar', source: 'engineer_input' } },
      fire_alarm: { control_panel: '4 لوحات', manual_call_points: '12', voice_alarm: 'متوفر' },
    },
    existing_assessment: {
      version: 1,
      systems: {
        fire_truck_access: {
          applicable: true,
          existing_presence: 'PRESENT',
          compliance_status: 'NEEDS_COMPLETION',
          action_text: 'استكمال بيانات الوصول.',
          requirement_reference: 'متطلبات الدفاع المدني',
        },
        fire_tank: {
          applicable: true,
          existing_presence: 'PRESENT',
          observed_configuration: 'خزان مياه حريق',
          observed_specs: [{ id: 'v', label: 'السعة', value: '79.493 m³' }],
          compliance_status: 'COMPLIANT',
          required_text: 'سعة خزان مطابقة.',
          requirement_reference: 'SBC 801',
        },
        sprinkler_system: {
          applicable: true,
          existing_presence: 'PRESENT',
          compliance_status: 'NON_COMPLIANT',
          action_text: 'إجراء رش.',
          priority: 'HIGH',
        },
      },
    },
  });
}

function buildReport(data = narrativeFixture()) {
  const model = buildExistingTechnicalReportModel(client, data, DEFAULT_COMPANY_PROFILE);
  const document = buildExistingFinalTechnicalReportDocument(model);
  const html = buildExistingFinalTechnicalReportHtml({ document, company: DEFAULT_COMPANY_PROFILE });
  const { blocks } = documentToFlowBlocks(document);
  return { model, document, html, blocks, data };
}

describe('EXISTING report narrative style', () => {
  it('PAGE_1_COVER = PASS', () => {
    const { html } = buildReport();
    expect(html).toContain('class="official-cover"');
    expect(html).toContain('التقرير الفني لتقييم الموقع القائم');
  });

  it('PAGE_2_TOC = PASS', () => {
    const { html } = buildReport();
    expect(html).toContain('class="official-toc-page"');
    expect(html).toContain('المحتويات');
  });

  it('PAGE_3_ESTABLISHMENT_DATA = PASS', () => {
    const { document, html } = buildReport();
    const facility = document.sections.find((section) => section.id === 'facility_data');
    expect(facility?.tables?.[0]?.caption_ar).toBe('بيانات المنشأة');
    expect(html).toContain('id="sec-facility_data"');
    expect(html).toContain('existing-report-image-block');
  });

  it('PAGE_4_SITE_NARRATIVE = PASS', () => {
    const { document, html } = buildReport();
    const site = document.sections.find((section) => section.id === 'site_information');
    expect(site?.tables?.length || 0).toBe(0);
    expect(site?.presentation_blocks?.some((block) => block.type === 'paragraph')).toBe(true);
    expect(html).toContain('id="sec-site_information"');
    expect(html).toContain('حدود الموقع');
  });

  it('PAGE_4_BOUNDARIES_NOT_TABLE = PASS', () => {
    const { html, blocks } = buildReport();
    const siteBlocks = blocks.filter((block) => block.kind === 'chapter' ? false : true);
    expect(siteBlocks.some((block) => block.kind === 'table' && block.caption.includes('بيانات الموقع'))).toBe(false);
    expect(html).not.toContain('<th>شمالاً</th>');
    expect(html).not.toContain('<td>شمالاً</td>');
    expect(html).toContain('يحد الموقع');
    expect(html).toContain('شارع الأمل');
  });

  it('SITE BOUNDARIES NARRATIVE deterministic builder ignores missing sides', () => {
    const data = narrativeFixture();
    const site = buildExistingReportSiteProfile(client, data, 'الرياض — النرجس');
    const narrative = buildSiteBoundariesNarrative(site);
    expect(narrative).toContain('من جهة الشمال');
    expect(narrative).toContain('من جهة الشرق');
    expect(narrative).not.toContain('من جهة الجنوب');
  });

  it('PAGE_5_CIVIL_DEFENSE_NARRATIVE = PASS', () => {
    const { document, html } = buildReport();
    const cd = document.sections.find((section) => section.id === 'fire_truck_access');
    expect(cd?.tables?.length || 0).toBe(0);
    expect(cd?.presentation_blocks?.[0]?.type).toBe('paragraph');
    expect(html).toContain('تمت دراسة إمكانية وصول آليات الدفاع المدني');
    expect(html).not.toContain('[ بيانات الوصول ]');
  });

  it('PAGE_5 civil defense narrative skips invented distance/time', () => {
    const data = narrativeFixture();
    data.technical_report.evidence!.civil_defense!.distance_value = undefined;
    data.technical_report.evidence!.civil_defense!.travel_time_minutes = undefined;
    const blocks = buildCivilDefenseAccessNarrative(buildExistingTechnicalReportModel(client, data).civil_defense_access);
    const text = blocks.map((block) => ('text' in block ? block.text : '')).join(' ');
    expect(text).not.toMatch(/2\s*كم|7\s*دقيقة/);
  });

  it('PAGE_6_COMPONENTS_TABLE = PASS', () => {
    const { document, html } = buildReport();
    const components = document.sections.find((section) => section.id === 'project_components');
    expect(components?.tables?.[0]?.caption_ar).toBe('مكونات المشروع');
    expect(html).toContain('اسم المكون');
    expect(html).toContain(buildProjectComponentsNarrative(buildExistingTechnicalReportModel(client, narrativeFixture()).project_components)!);
  });

  it('ASSESSMENT_TABLE_REDUCTION = PASS', () => {
    const { document, blocks } = buildReport();
    const assessmentTables = document.sections
      .filter((section) => section.id.startsWith('existing_assessment_'))
      .flatMap((section) => section.tables || []);
    expect(assessmentTables.length).toBe(0);
    const renderedAssessmentTables = blocks.filter((block) =>
      block.kind === 'table' && block.caption.includes(' — ')
    );
    expect(renderedAssessmentTables.length).toBe(0);
    expect(blocks.some((block) => block.kind === 'existing_assessment_unit')).toBe(true);
  });

  it('ENGINEERING_VALUES_PRESERVED = PASS', () => {
    const { html } = buildReport();
    expect(html).toContain('79.493');
    expect(html).toContain('513415.8874');
    expect(html).toContain('2391979.9527');
  });

  it('NO_INVENTED_DATA = PASS', () => {
    const data = narrativeFixture();
    data.technical_report.site_surroundings = { north: 'A' };
    const site = buildExistingReportSiteProfile(client, data, null);
    expect(buildSiteBoundariesNarrative(site)).toBe('يحد الموقع من جهة الشمال A.');
    expect(buildSiteIntroNarrative(site, null)).toBe('موقع Narrative Style.');
    expect(buildSiteCoordinatesLine(site.coordinate_rows)).toContain('Easting: 513415.8874');
  });

  it('IMAGE FRAME = PASS', () => {
    expect(designCss).toContain(`height:${EXISTING_REPORT_IMAGE_FRAME.height}`);
    expect(designCss).toContain('object-fit:cover');
  });

  it('IMAGE_ASPECT_RATIO = PASS', () => {
    const { html } = buildReport();
    expect(html).toContain('object-fit:cover');
    expect(html).toContain('existing-report-image-slot');
  });

  it('RTL_VISUAL = PASS', () => {
    const { html } = buildReport();
    expect(html).toContain('dir="rtl"');
    expect(html).toContain('Noto Naskh Arabic');
  });

  it('PAGINATION = PASS', () => {
    const { blocks } = buildReport();
    const componentsIndex = blocks.findIndex((block) => block.kind === 'chapter' && block.id === 'project_components');
    const breakIndex = blocks.findIndex((block) => block.kind === 'page_break');
    const nextAssessmentIndex = blocks.findIndex((block) => block.kind === 'chapter' && block.id.startsWith('existing_assessment_'));
    expect(componentsIndex).toBeGreaterThanOrEqual(0);
    expect(breakIndex).toBeGreaterThan(componentsIndex);
    expect(nextAssessmentIndex).toBeGreaterThan(breakIndex);
  });

  it('PREVIEW_PRINT_PDF_PARITY = PASS', () => {
    const template = read('lib/projects/engineering-report-engine/renderer/existing-final-technical-template.ts');
    expect(template).toContain('getEmbeddedArabicFontCss');
    expect(read('lib/print/chromium-html-to-pdf.server.ts')).toContain('materializeEmbeddedFontsForPrint');
  });

  it('uses site maps label link without printing long URL', () => {
    const { html } = buildReport();
    expect(html).toContain(EXISTING_REPORT_SITE_MAPS_LINK_LABEL);
    expect(html).not.toContain(`>${LONG_MAPS_URL}<`);
  });

  it('writes narrative style HTML artifact', () => {
    const { html } = buildReport();
    const outDir = resolve(root, 'artifacts/existing-report-narrative-style');
    mkdirSync(outDir, { recursive: true });
    writeFileSync(resolve(outDir, 'official-technical-report.html'), html, 'utf8');
    expect(html).toContain('existing-report-assessment-unit');
    expect(html).toContain('official-post-project-components-break');
  });

  it('validates narrative PDF artifact when generated locally', () => {
    const resultPath = resolve(root, 'artifacts/existing-report-narrative-style/result.json');
    if (!existsSync(resultPath)) return;
    const result = JSON.parse(readFileSync(resultPath, 'utf8')) as {
      pageMap?: Record<string, number>;
      siteBoundariesNotTable?: boolean;
      assessmentTableCount?: number;
      arabicExtraction?: { ok: boolean };
    };
    expect(result.pageMap?.facility_data).toBe(3);
    expect(result.pageMap?.site_information).toBe(4);
    expect(result.pageMap?.fire_truck_access).toBe(5);
    expect(result.pageMap?.project_components).toBe(6);
    expect(result.siteBoundariesNotTable).toBe(true);
    expect(result.assessmentTableCount).toBe(0);
    expect(result.arabicExtraction?.ok).toBe(true);
  });
});
