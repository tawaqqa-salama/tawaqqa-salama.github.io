import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DEFAULT_COMPANY_PROFILE } from '../lib/company-profile';
import { parseProjectEngineeringData } from '../lib/business/project-reports';
import { buildExistingFinalTechnicalReportDocument } from '../lib/projects/existing-final-technical-report-document';
import { documentToFlowBlocks } from '../lib/projects/engineering-report-engine/renderer/flow-document';
import { buildExistingTechnicalReportModel } from '../lib/projects/existing-technical-report-model';
import {
  extractExistingReportPdfPages,
  renderExistingFinalTechnicalReportPdf,
  tocPageNumbersMatch,
} from '../lib/print/existing-report-pdf-pagination.server';
import {
  assertExistingReportArabicExactPhrases,
  extractExistingReportPdfText,
  pdftotextAvailable,
} from '../lib/print/existing-report-pdf-text';
import { EXISTING_REPORT_IMAGE_FRAME } from '../lib/projects/engineering-report-engine/renderer/existing-report-design-system';
import { EMPTY_FIRE_PROTECTION_DESIGN } from '../lib/types/fire-protection-design';
import { EMPTY_PROJECT_ENGINEERING_DATA } from '../lib/types/project-reports';
import type { ClientRecord } from '../lib/types/client';

const outDir = join(process.cwd(), 'artifacts/existing-report-final-professional');
mkdirSync(outDir, { recursive: true });

const client: ClientRecord = {
  id: 'final-professional-artifact',
  client_code: 'LD-FP-ART',
  name: 'Final Professional Artifact',
  business_name: 'منشأة Final Professional',
  owner_name: 'مالك',
  city: 'الرياض',
  district: 'النرجس',
  street: '1',
  building_area: 920,
  floors_count: 2,
  primary_engineering_project_identity: {
    clientId: 'final-professional-artifact',
    projectId: 'p1',
    projectCode: 'PRJ-FP-ART',
    projectClassification: 'EXISTING',
  },
};

const svg = (w: number, h: number, label: string) =>
  `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%" fill="#cfe8ef"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-size="22">${label}</text></svg>`)}`;

const data = parseProjectEngineeringData({
  ...EMPTY_PROJECT_ENGINEERING_DATA,
  technical_report: {
    ...EMPTY_PROJECT_ENGINEERING_DATA.technical_report,
    outgoing_number: 'TR-FP-ART',
    report_date: '2026-08-29',
    location_description: 'artifact final professional',
    maps_url: 'https://maps.google.com/?q=24.8123,46.7123',
    gps_lat: '46262.26',
    gps_lng: '654546.455',
    site_surroundings: { north: 'A', south: 'B', east: 'C', west: 'D' },
    facade_photo: { id: 'f1', dataUrl: svg(2000, 500, 'FACADE-WIDE') },
    earth_photo: { id: 'e1', dataUrl: svg(500, 1400, 'AERIAL-TALL') },
    components: [{
      id: 'c1', part_name: 'المبنى الرئيسي', use: 'إداري', area_m2: '920', floors_count: '2', height: '12', capacity: '350', description: 'خرساني', structure: 'خرساني', classification: 'عادي',
    }],
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
        id: 'r1', kind: 'civil_defense_route', title: 'مسار', category: 'civil_defense_route', display_order: 1, include_in_report: true, created_at: '2026-08-20T00:00:00.000Z',
        file: { id: 'f', dataUrl: svg(1400, 900, 'ROUTE'), mimeType: 'image/svg+xml', fileName: 'route.svg' },
      }],
    },
  },
  building_plan: {
    ...EMPTY_PROJECT_ENGINEERING_DATA.building_plan,
    northing: '2391979.9527',
    easting: '513415.8874',
    building_permit_number: 'BP-1',
    occupancy_classification: 'مكاتب',
  },
  design_center: {
    ...EMPTY_PROJECT_ENGINEERING_DATA.design_center,
    space_safety: {
      source: 'project_engineering',
      floors: [{
        id: 'floor-1',
        label: 'الدور الأرضي',
        repeat_count: 1,
        areas: [{
          id: 'area-1',
          label: 'مكاتب إدارية',
          area_m2: 850,
          hazard_suggested: 'ordinary_hazard_group_1',
          suppression_suggested: ['رش آلي'],
          quantities: {
            sprinklers: 147,
            smoke_detectors: 18,
            heat_detectors: 4,
            fire_alarm_panels: 2,
            alarm_panel_locations: ['المدخل الرئيسي'],
            signs: 6,
            emergency_lights: 8,
            emergency_exits: 4,
            alarm_bells: 5,
            emergency_stairs: 2,
            manual_extinguishers: 8,
            elevators: 0,
            public_facilities: 0,
          },
        }],
      }],
    },
  },
  fire_protection_design: {
    ...EMPTY_FIRE_PROTECTION_DESIGN,
    pump: {
      ...EMPTY_FIRE_PROTECTION_DESIGN.pump,
      type: 'UL',
      capacity: { value: 350, unit: 'GPM', source: 'engineer_input' },
      pressure: { value: 7, unit: 'bar', source: 'engineer_input' },
    },
    diesel_pump: {
      ...EMPTY_FIRE_PROTECTION_DESIGN.diesel_pump,
      capacity: { value: 350, unit: 'GPM', source: 'engineer_input' },
      pressure: { value: 7, unit: 'bar', source: 'engineer_input' },
    },
    jockey_pump: {
      ...EMPTY_FIRE_PROTECTION_DESIGN.jockey_pump,
      capacity: { value: 35, unit: 'GPM', source: 'engineer_input' },
      pressure: { value: 12, unit: 'bar', source: 'engineer_input' },
    },
    sprinkler: {
      ...EMPTY_FIRE_PROTECTION_DESIGN.sprinkler,
      k_factor: '6.5',
      system_type: 'Wet Pipe',
    },
    fire_alarm: {
      ...EMPTY_FIRE_PROTECTION_DESIGN.fire_alarm,
      control_panel: '2 لوحات',
      manual_call_points: '8',
      voice_alarm: 'متوفر',
    },
  },
  existing_assessment: {
    version: 1,
    systems: {
      fire_truck_access: { applicable: true, existing_presence: 'PRESENT', compliance_status: 'NEEDS_COMPLETION', action_text: 'إجراء وصول.', requirement_reference: 'متطلبات الدفاع المدني' },
      fire_tank: {
        applicable: true,
        existing_presence: 'PRESENT',
        observed_specs: [{ id: 'v', label: 'السعة', value: '79.493 m³' }],
        compliance_status: 'COMPLIANT',
        requirement_reference: 'SBC 801',
      },
      sprinkler_system: { applicable: true, existing_presence: 'PRESENT', compliance_status: 'NON_COMPLIANT', action_text: 'إجراء رش.', priority: 'HIGH', requirement_reference: 'SBC 801' },
      smoke_detectors: { applicable: true, existing_presence: 'PRESENT', compliance_status: 'COMPLIANT', requirement_reference: 'SBC 801' },
      emergency_lighting: { applicable: true, existing_presence: 'PRESENT', compliance_status: 'COMPLIANT' },
      means_of_egress: { applicable: true, existing_presence: 'PRESENT', compliance_status: 'COMPLIANT' },
      electrical_safety: { applicable: true, existing_presence: 'PRESENT', compliance_status: 'NEEDS_COMPLETION', action_text: 'استكمال الفحص.' },
    },
  },
});

function captionCount(html: string, caption: string): number {
  return (html.match(new RegExp(`\\[ ${caption.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\]`, 'g')) || []).length;
}

async function main() {
  if (!existsSync('/usr/bin/google-chrome') && !existsSync('/usr/local/bin/google-chrome') && !existsSync('/usr/bin/chromium')) {
    throw new Error('Chromium غير متاح — لا يمكن توليد PDF artifact.');
  }

  const model = buildExistingTechnicalReportModel(client, data, DEFAULT_COMPANY_PROFILE);
  const document = buildExistingFinalTechnicalReportDocument(model);
  const { chapters } = documentToFlowBlocks(document);
  const { pdfBuffer, pageMap, html } = await renderExistingFinalTechnicalReportPdf({ document, company: DEFAULT_COMPANY_PROFILE });

  writeFileSync(join(outDir, 'official-technical-report.html'), html, 'utf8');
  writeFileSync(join(outDir, 'official-technical-report.pdf'), pdfBuffer);

  const pages = await extractExistingReportPdfPages(pdfBuffer);
  const extraction = await extractExistingReportPdfText(pdfBuffer);
  const arabicExtraction = assertExistingReportArabicExactPhrases(extraction);

  const duplicateCaptions = ['مضخات الحريق', 'ملخص نظام الإنذار', 'نظام الرش الآلي']
    .filter((caption) => captionCount(html, caption) > 1);

  const tocPageNumbersMatchResult = tocPageNumbersMatch(pageMap, chapters)
    && Object.entries(pageMap).every(([id, pageNo]) => html.includes(`data-toc-target="sec-${id}">${pageNo}<`));

  const result = {
    pageCount: pages.length,
    pageMap,
    tocPageNumbersMatch: tocPageNumbersMatchResult,
    pages1To6Structure: pageMap.facility_data === 3
      && pageMap.site_information === 4
      && pageMap.fire_truck_access === 5
      && pageMap.project_components === 6,
    page6OnlyComponents: pageMap.project_components === 6 && (pageMap.existing_assessment_site || pageMap.existing_assessment_firefighting || 99) >= 7,
    duplicateEngineeringBlocks: duplicateCaptions,
    blankPages: pages.flatMap((page, index) => (page ? [] : [index + 1])),
    imageFrame: {
      height: EXISTING_REPORT_IMAGE_FRAME.height,
      objectFit: 'cover',
    },
    arabicExtraction: {
      ...arabicExtraction,
      engine: extraction.engine,
      arabicCharCount: extraction.arabicCharCount,
      pdftotextAvailable: pdftotextAvailable(),
    },
    bytes: pdfBuffer.length,
  };

  if (!result.pages1To6Structure) throw new Error('Pages 1–6 structure mismatch');
  if (duplicateCaptions.length) throw new Error(`Duplicate engineering blocks: ${duplicateCaptions.join(', ')}`);
  if ((result.blankPages || []).length) throw new Error(`Blank pages: ${result.blankPages.join(', ')}`);
  if (!tocPageNumbersMatchResult) throw new Error('TOC page numbers do not match rendered pagination');
  if (!arabicExtraction.ok) throw new Error(`Arabic exact phrase extraction failed: ${arabicExtraction.missing.join(', ')}`);

  writeFileSync(join(outDir, 'result.json'), JSON.stringify(result, null, 2), 'utf8');
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
