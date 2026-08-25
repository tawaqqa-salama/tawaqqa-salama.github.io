import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { EMPTY_PROJECT_ENGINEERING_DATA, EMPTY_TECHNICAL_REPORT } from '@/lib/types/project-reports';
import type { ClientRecord } from '@/lib/types/client';
import {
  buildTechnicalReportUiModel,
  isFieldEditable,
  sourceBadge,
  TECHNICAL_REPORT_UI_SECTIONS,
} from '@/lib/projects/technical-report-ui';
import { applyTechnicalReportSourceOverride } from '@/lib/projects/technical-report-source-data';

const client: ClientRecord = { id: 'c-1', client_code: 'C-1', name: 'مشروع', business_name: 'مشروع', owner_name: 'مالك', city: 'الرياض', building_area: 100, floors_count: 1 };
const data = { ...EMPTY_PROJECT_ENGINEERING_DATA, technical_report: { ...EMPTY_TECHNICAL_REPORT }, design_center: { ...EMPTY_PROJECT_ENGINEERING_DATA.design_center, space_safety: null } };

describe('technical report UI reorganization', () => {
  it('defines the 13 required accordion sections with recommendation review after observations', () => {
    expect(TECHNICAL_REPORT_UI_SECTIONS.map((section) => section.id)).toEqual([
      'project_summary', 'occupancy_spaces', 'structural', 'egress', 'civil_defense', 'fire_fighting', 'alarm_evacuation', 'electrical', 'mechanical', 'evidence', 'observations', 'recommendation_review', 'approval',
    ]);
  });

  it('uses the normalized Data Bridge for source status, badges, and missing-state counters', () => {
    const model = buildTechnicalReportUiModel({ client, data });
    expect(model.source.project.project_name).toMatchObject({ value: 'مشروع', source_stage: 'basic_data', classification: 'AUTO_FILL_LOCKED' });
    expect(sourceBadge(model.source.project.project_name)).toBe('موروث تلقائيًا');
    expect(model.sections.project_summary.autoFilled).toBeGreaterThan(0);
    expect(model.sections.structural.missing).toBeGreaterThan(0);
    expect(model.sections.structural.status).toBe('MISSING_DATA');
  });

  it('marks locked fields readonly, editable inherited fields editable, and suggestions reviewable', () => {
    const model = buildTechnicalReportUiModel({ client, data });
    expect(isFieldEditable(model.source.project.project_name)).toBe(false);
    expect(isFieldEditable(model.source.project.building_status)).toBe(true);
    expect(sourceBadge(model.source.aggregates.total_occupants)).toMatch(/مقترح|يحتاج/);
  });

  it('keeps engineer overrides when the UI model is rebuilt and preserves legacy technical data', () => {
    const overridden = applyTechnicalReportSourceOverride({ report: data.technical_report, fieldKey: 'project.building_area_m2', value: 180 });
    const model = buildTechnicalReportUiModel({ client: { ...client, building_area: 250 }, data: { ...data, technical_report: overridden } });
    expect(model.source.project.building_area_m2).toMatchObject({ auto_value: 250, final_value: 180, engineer_override: true });

    const legacy = buildTechnicalReportUiModel({
      client,
      data: { ...data, technical_report: { ...EMPTY_TECHNICAL_REPORT, floor_uses: [{ id: 'f1', floor_name: 'أرضي', floor_area_m2: '100', structure: '', classification: '', zones: [{ id: 'z1', use_code: 'office', label: 'مكتب', area_m2: '100', occupancy_code: 'B' }] }] } },
    });
    expect(legacy.source.floors[0].spaces[0].occupancy.value).toBe('B');
  });

  it('keeps the legacy editable report component isolated while routing UNDER_CONSTRUCTION to its derived preview', () => {
    const component = readFileSync('components/projects/TechnicalReportSection.tsx', 'utf8');
    const modal = readFileSync('components/projects/ProjectReportModal.tsx', 'utf8');
    expect(component).toContain('grid-cols-1');
    expect(component).toContain('sm:grid-cols-2');
    expect(component).toContain("if (id === 'fire_fighting')");
    expect(component).toContain('<FireProtectionDesignSection');
    expect(component).toContain('fireProtectionDesign');
    expect(component).not.toContain('TechnicalReportPrint');
    expect(modal).not.toContain('<FireProtectionDesignSection');
    expect(modal).toContain("projectClassification === 'UNDER_CONSTRUCTION'");
    expect(modal).toContain('UnderConstructionTechnicalReportPreview');
    expect(modal).not.toContain('<TechnicalReportSection');
  });

  it('keeps legacy preview, print, and download controls out of the UNDER_CONSTRUCTION read-only route', () => {
    const component = readFileSync('components/projects/TechnicalReportSection.tsx', 'utf8');
    const modal = readFileSync('components/projects/ProjectReportModal.tsx', 'utf8');

    expect(component).toContain('onPreview: () => void');
    expect(component).toContain('onPrint: () => void');
    expect(component).toContain('onDownload: () => void');
    expect(component).toContain('>معاينة</button>');
    expect(component).toContain('>طباعة A4</button>');
    expect(component).toContain('>تحميل PDF</button>');
    expect(component).not.toContain('معاينة PDF / طباعة A4');
    expect(modal).toContain('UnderConstructionTechnicalReportPreview');
    expect(modal).not.toContain('onPreview={handlePreviewTechnical}');
    expect(modal).not.toContain('onPrint={handlePrintTechnical}');
    expect(modal).not.toContain('onDownload={handleDownloadTechnical}');
    expect(modal).not.toContain('const handlePreviewTechnical');
    expect(modal).not.toContain('const handlePrintTechnical');
    expect(modal).not.toContain('const handleDownloadTechnical');
  });
});
