import { describe, expect, it } from 'vitest';
import { EMPTY_PROJECT_ENGINEERING_DATA, EMPTY_TECHNICAL_REPORT } from '@/lib/types/project-reports';
import type { ClientRecord } from '@/lib/types/client';
import { applyTechnicalReportSourceOverride } from '@/lib/projects/technical-report-source-data';
import { generateTechnicalReportDocument } from '@/lib/projects/technical-report-document';

const client: ClientRecord = { id: 'client-pdf', client_code: 'PDF-1', name: 'منشأة الاختبار', business_name: 'منشأة الاختبار', owner_name: 'المالك', city: 'الرياض', building_area: 100, floors_count: 1 };
const floor = (id: string, name: string, activity: string, occupancy: string, area: string, sprinklers = 0) => ({ id, floor_name: name, floor_area_m2: area, structure: '', classification: occupancy, zones: [{ id: `${id}-z`, label: activity, use_code: activity, area_m2: area, occupancy_code: occupancy, }] });
const data = (report = { ...EMPTY_TECHNICAL_REPORT }) => ({ ...EMPTY_PROJECT_ENGINEERING_DATA, technical_report: report });
const text = (doc: ReturnType<typeof generateTechnicalReportDocument>) => doc.sections.flatMap((s) => [...s.paragraphs.map((p) => p.text), ...(s.tables || []).flatMap((t) => t.rows.flat())]).join('\n');

describe('dedicated technical report PDF document', () => {
  it('renders basic data, floors, spaces, occupants, egress and safety quantities from the Data Bridge', () => {
    const report = { ...EMPTY_TECHNICAL_REPORT, floor_uses: [floor('f1', 'الأرضي', 'مكاتب', 'B', '100', 8)], electrical_grounding: undefined };
    const doc = generateTechnicalReportDocument({ client, report, engineeringData: data(report) });
    const all = text(doc);
    expect(doc.title_ar).toContain('التقرير الفني');
    expect(all).toContain('منشأة الاختبار');
    expect(all).toContain('الأرضي');
    expect(all).toContain('مكاتب');
    expect(doc.sections.some((s) => s.title_ar === 'أنظمة مكافحة الحريق')).toBe(true);
    expect(doc.sections.some((section) => ['fire_pump_analysis', 'water_tank_analysis'].includes(section.id))).toBe(false);
  });

  it('preserves mixed occupancy, real zero values and missing values without converting missing to zero', () => {
    const report = { ...EMPTY_TECHNICAL_REPORT, floor_uses: [floor('f1', 'الأرضي', 'مكاتب', 'B', '100'), floor('f2', 'الأول', 'تخزين', 'S', '0')] };
    const doc = generateTechnicalReportDocument({ client, report, engineeringData: data(report) });
    const all = text(doc);
    expect(all).toContain('مكاتب');
    expect(all).toContain('تخزين');
    expect(all).toContain('0 م²');
    expect(all).toContain('—');
  });

  it('uses engineer override as the final PDF value over later inherited client data', () => {
    const overridden = applyTechnicalReportSourceOverride({ report: { ...EMPTY_TECHNICAL_REPORT }, fieldKey: 'project.building_area_m2', value: 180 });
    const doc = generateTechnicalReportDocument({ client: { ...client, building_area: 250 }, report: overridden, engineeringData: data(overridden) });
    expect(text(doc)).toContain('180 م²');
    expect(text(doc)).not.toContain('250 م²');
  });

  it('uses legacy report floor data if upstream stages have no spaces', () => {
    const report = { ...EMPTY_TECHNICAL_REPORT, floor_uses: [floor('legacy', 'دور قديم', 'نشاط قديم', 'A', '60')] };
    const doc = generateTechnicalReportDocument({ client, report, engineeringData: data(report) });
    expect(text(doc)).toContain('دور قديم');
    expect(text(doc)).toContain('نشاط قديم');
  });

  it('keeps optional mechanical, images, and recommendations conditional', () => {
    const empty = generateTechnicalReportDocument({ client, report: { ...EMPTY_TECHNICAL_REPORT }, engineeringData: data() });
    expect(empty.sections.some((s) => s.title_ar === 'متطلبات السلامة الميكانيكية')).toBe(false);
    expect(empty.sections.some((s) => s.title_ar === 'الصور والأدلة')).toBe(false);
    expect(empty.sections.some((s) => s.title_ar === 'التوصيات')).toBe(false);
  });

  it('creates a long document fixture with unique ordered sections and no hydraulic section', () => {
    const report = { ...EMPTY_TECHNICAL_REPORT, floor_uses: Array.from({ length: 18 }, (_, index) => floor(`f${index}`, `الدور ${index + 1}`, index % 2 ? 'مكاتب' : 'تخزين', index % 2 ? 'B' : 'S', '100', 8)), ventilation_items: [{ id: 'vent_main', enabled: true, notes: 'تهوية ميكانيكية مطلوبة', selectedOptions: [], photos: [] }] };
    const doc = generateTechnicalReportDocument({ client, report, engineeringData: data(report) });
    expect(doc.sections.length).toBeGreaterThan(15);
    expect(new Set(doc.sections.map((s) => s.id)).size).toBe(doc.sections.length);
    expect(doc.sections.some((s) => s.title_ar.includes('هيدرولي'))).toBe(false);
  });
});
