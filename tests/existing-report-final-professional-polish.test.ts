import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEFAULT_COMPANY_PROFILE } from '@/lib/company-profile';
import { parseProjectEngineeringData } from '@/lib/business/project-reports';
import { buildExistingFinalTechnicalReportDocument } from '@/lib/projects/existing-final-technical-report-document';
import {
  buildFireAlarmNarrative,
  buildFireProtectionNarrative,
  buildElectricalSafetyNarrative,
  buildLifeSafetyNarrative,
  collectPresentedEngineeringCaptions,
} from '@/lib/projects/existing-report-engineering-narrative';
import { buildEngineeringReferencePresentationBlocks } from '@/lib/projects/existing-report-presentation';
import { documentToFlowBlocks } from '@/lib/projects/engineering-report-engine/renderer/flow-document';
import { buildExistingTechnicalReportModel } from '@/lib/projects/existing-technical-report-model';
import { estimateExistingReportPageMap } from '@/lib/print/existing-report-page-map';
import { EMPTY_FIRE_PROTECTION_DESIGN } from '@/lib/types/fire-protection-design';
import { EMPTY_PROJECT_ENGINEERING_DATA } from '@/lib/types/project-reports';
import type { ClientRecord } from '@/lib/types/client';

const root = resolve(__dirname, '..');
const read = (relative: string) => readFileSync(resolve(root, relative), 'utf8');

const client: ClientRecord = {
  id: 'final-professional-test',
  client_code: 'LD-FP-01',
  name: 'Final Professional Test',
  business_name: 'منشأة Final Professional',
  owner_name: 'مالك',
  city: 'الرياض',
  district: 'النرجس',
  street: '1',
  building_area: 920,
  floors_count: 2,
  primary_engineering_project_identity: {
    clientId: 'final-professional-test',
    projectId: 'p-fp',
    projectCode: 'PRJ-FP-01',
    projectClassification: 'EXISTING',
  },
};

function fixture() {
  return parseProjectEngineeringData({
    ...EMPTY_PROJECT_ENGINEERING_DATA,
    technical_report: {
      ...EMPTY_PROJECT_ENGINEERING_DATA.technical_report,
      outgoing_number: 'TR-FP-01',
      report_date: '2026-08-29',
      location_description: 'موقع Final Professional.',
      site_surroundings: { north: 'A', east: 'B' },
      components: [{
        id: 'c1', part_name: 'مبنى', use: 'إداري', area_m2: '920', floors_count: '2', height: '12', capacity: '350', description: 'خرساني', structure: 'خرساني', classification: 'عادي',
      }],
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
            label: 'مكاتب',
            area_m2: 850,
            hazard_suggested: 'ordinary_hazard_group_1',
            suppression_suggested: ['رش آلي'],
            quantities: {
              sprinklers: 147,
              smoke_detectors: 18,
              heat_detectors: 4,
              fire_alarm_panels: 2,
              alarm_panel_locations: ['المدخل'],
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
      pump: { ...EMPTY_FIRE_PROTECTION_DESIGN.pump, capacity: { value: 350, unit: 'GPM', source: 'engineer_input' }, pressure: { value: 7, unit: 'bar', source: 'engineer_input' } },
      diesel_pump: { ...EMPTY_FIRE_PROTECTION_DESIGN.diesel_pump, capacity: { value: 350, unit: 'GPM', source: 'engineer_input' }, pressure: { value: 7, unit: 'bar', source: 'engineer_input' } },
      jockey_pump: { ...EMPTY_FIRE_PROTECTION_DESIGN.jockey_pump, capacity: { value: 35, unit: 'GPM', source: 'engineer_input' }, pressure: { value: 12, unit: 'bar', source: 'engineer_input' } },
      sprinkler: { ...EMPTY_FIRE_PROTECTION_DESIGN.sprinkler, k_factor: '6.5', system_type: 'Wet Pipe' },
      fire_alarm: { ...EMPTY_FIRE_PROTECTION_DESIGN.fire_alarm, control_panel: '2 لوحات' },
    },
    existing_assessment: {
      version: 1,
      systems: {
        fire_tank: { applicable: true, existing_presence: 'PRESENT', observed_specs: [{ id: 'v', label: 'السعة', value: '79.493 m³' }], compliance_status: 'COMPLIANT' },
        sprinkler_system: { applicable: true, existing_presence: 'PRESENT', compliance_status: 'NON_COMPLIANT', action_text: 'إجراء.' },
        smoke_detectors: { applicable: true, existing_presence: 'PRESENT', compliance_status: 'COMPLIANT' },
        emergency_lighting: { applicable: true, existing_presence: 'PRESENT', compliance_status: 'COMPLIANT' },
        electrical_safety: { applicable: true, existing_presence: 'PRESENT', compliance_status: 'NEEDS_COMPLETION', action_text: 'فحص.' },
      },
    },
  });
}

describe('EXISTING report final professional polish', () => {
  it('TOC_REAL_PAGE_NUMBERS uses detected page map in artifact when present', () => {
    const resultPath = resolve(root, 'artifacts/existing-report-final-professional/result.json');
    if (!existsSync(resultPath)) return;
    const result = JSON.parse(readFileSync(resultPath, 'utf8')) as { tocPageNumbersMatch?: boolean; pageMap?: Record<string, number> };
    expect(result.tocPageNumbersMatch).toBe(true);
    expect(result.pageMap?.facility_data).toBe(3);
    expect(result.pageMap?.project_components).toBe(6);
  });

  it('PAGES_1_TO_6_STRUCTURE and PAGE_6_COMPONENTS_ONLY', () => {
    const model = buildExistingTechnicalReportModel(client, fixture(), DEFAULT_COMPANY_PROFILE);
    const pageMap = estimateExistingReportPageMap(buildExistingFinalTechnicalReportDocument(model));
    expect(pageMap.facility_data).toBe(3);
    expect(pageMap.site_information).toBe(4);
    expect(pageMap.fire_truck_access).toBe(5);
    expect(pageMap.project_components).toBe(6);
    const { blocks } = documentToFlowBlocks(buildExistingFinalTechnicalReportDocument(model));
    const componentsIndex = blocks.findIndex((block) => block.kind === 'chapter' && block.id === 'project_components');
    const breakIndex = blocks.findIndex((block) => block.kind === 'page_break');
    const assessmentIndex = blocks.findIndex((block) => block.kind === 'chapter' && block.id.startsWith('existing_assessment_'));
    expect(breakIndex).toBeGreaterThan(componentsIndex);
    expect(assessmentIndex).toBeGreaterThan(breakIndex);
  });

  it('FIRE_PROTECTION_NARRATIVE and TABLE_REDUCTION', () => {
    const model = buildExistingTechnicalReportModel(client, fixture(), DEFAULT_COMPANY_PROFILE);
    const group = model.assessment_sections.find((section) => section.id === 'firefighting');
    const blocks = buildFireProtectionNarrative(group!.systems, model.engineering_sections);
    const text = JSON.stringify(blocks);
    expect(text).toContain('تمت مراجعة أنظمة الإطفاء ومكافحة الحريق');
    expect(text).toContain('79.493');
    expect(text).toContain('engineering_narrative_item');
    expect(text).not.toContain('الوضع الراهن:');
  });

  it('FIRE_ALARM_NARRATIVE and LIFE_SAFETY_NARRATIVE', () => {
    const model = buildExistingTechnicalReportModel(client, fixture(), DEFAULT_COMPANY_PROFILE);
    const alarm = model.assessment_sections.find((section) => section.id === 'alarm');
    const life = model.assessment_sections.find((section) => section.id === 'life_safety');
    expect(JSON.stringify(buildFireAlarmNarrative(alarm?.systems || [], model.engineering_sections))).toContain('منظومة إنذار حريق');
    expect(JSON.stringify(buildLifeSafetyNarrative(life?.systems || [], model.engineering_sections))).toContain('سلامة الحياة');
  });

  it('ELECTRICAL_SAFETY_NARRATIVE', () => {
    const model = buildExistingTechnicalReportModel(client, fixture(), DEFAULT_COMPANY_PROFILE);
    const electrical = model.assessment_sections.find((section) => section.id === 'electrical');
    expect(JSON.stringify(buildElectricalSafetyNarrative(electrical?.systems || []))).toContain('السلامة الكهربائية');
  });

  it('DUPLICATE_ENGINEERING_TABLES_REMOVED in reference section', () => {
    const model = buildExistingTechnicalReportModel(client, fixture(), DEFAULT_COMPANY_PROFILE);
    const presented = collectPresentedEngineeringCaptions(model);
    expect(presented.has('مضخات الحريق') || presented.has('نظام الرش الآلي')).toBe(true);
    const referenceBlocks = buildEngineeringReferencePresentationBlocks(model.engineering_sections, presented);
    const referenceText = JSON.stringify(referenceBlocks);
    if (presented.has('مضخات الحريق')) expect(referenceText).not.toContain('[ مضخات الحريق ]');
    if (presented.has('ملخص نظام الإنذار')) expect(referenceText).not.toContain('[ ملخص نظام الإنذار ]');
  });

  it('NO_INVENTED_DATA in site boundaries builder import path preserved', () => {
    const data = fixture();
    data.technical_report.site_surroundings = { north: 'A' };
    const model = buildExistingTechnicalReportModel(client, data);
    const document = buildExistingFinalTechnicalReportDocument(model);
    expect(JSON.stringify(document)).not.toContain('من جهة الجنوب');
  });

  it('PREVIEW_PRINT_PDF_PARITY single renderer', () => {
    expect(read('components/projects/TechnicalReportPrint.tsx')).toContain('estimateExistingReportPageMap');
    expect(read('lib/print/chromium-html-to-pdf.server.ts')).toContain('materializeEmbeddedFontsForPrint');
  });

  it('ARABIC_UNICODE_EXTRACTION artifact strict phrases when generated', () => {
    const resultPath = resolve(root, 'artifacts/existing-report-final-professional/result.json');
    if (!existsSync(resultPath)) return;
    const result = JSON.parse(readFileSync(resultPath, 'utf8')) as { arabicExtraction?: { ok?: boolean; exactPhrases?: Record<string, boolean> } };
    expect(result.arabicExtraction?.ok).toBe(true);
    expect(result.arabicExtraction?.exactPhrases?.['بيانات المنشأة']).toBe(true);
  });
});
