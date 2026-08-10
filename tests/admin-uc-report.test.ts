import { describe, expect, it } from 'vitest';
import {
  calcRequiredTankVolumeM3,
  compareTankVolume,
  EMPTY_FIRE_PROTECTION_DESIGN,
  NOT_ENTERED_AR,
  formatMeasured,
} from '@/lib/types/fire-protection-design';
import {
  generateAdminUcReport,
  mergeFireProtectionDesign,
  shouldUseAdminUcReport,
  buildAdminUcReportHtml,
} from '@/lib/projects/admin-uc-report';
import { EMPTY_PROJECT_ENGINEERING_DATA, EMPTY_TECHNICAL_REPORT } from '@/lib/types/project-reports';
import type { ClientRecord } from '@/lib/types/client';
import { DEFAULT_COMPANY_PROFILE } from '@/lib/company-profile';

const client = {
  id: 'admin-uc-1',
  client_code: 'ADM-UC-001',
  name: 'مشروع إداري تجريبي',
  business_name: 'المبنى الإداري — اختبار',
  owner_name: 'مالك الاختبار',
  activity_type: 'administrative',
  project_status: 'تحت الإنشاء',
  floors_count: 8,
  land_area: 2000,
  building_area: 6500,
  city: 'الرياض',
  district: 'العليا',
} as ClientRecord;

function designFixture() {
  return mergeFireProtectionDesign({
    ...EMPTY_FIRE_PROTECTION_DESIGN,
    lifecycle_mode: 'under_construction',
    building_kind: 'administrative',
    pump: {
      ...EMPTY_FIRE_PROTECTION_DESIGN.pump,
      exists: 'yes',
      type: 'Electric',
      capacity: { value: 1000, unit: 'GPM', input_unit: 'GPM', source: 'engineer_input' },
      pressure: { value: 8, unit: 'bar', input_unit: 'bar', source: 'engineer_input' },
      source: 'engineer_input',
    },
    water_tank: {
      ...EMPTY_FIRE_PROTECTION_DESIGN.water_tank,
      exists: 'yes',
      capacity_m3: { value: 100, unit: 'm³', source: 'engineer_input' },
      water_demand_lpm: { value: 1000, unit: 'L/min', source: 'engineer_input' },
      duration_min: { value: 120, unit: 'min', source: 'engineer_input' },
      calculated_required_volume_m3: null,
      source: 'engineer_input',
    },
  });
}

describe('admin UC fire protection design', () => {
  it('calculates theoretical tank volume Q×T/1000', () => {
    expect(calcRequiredTankVolumeM3(1000, 120)).toBe(120);
    const check = compareTankVolume(100, 120);
    expect(check.status).toBe('needs_review');
    expect(check.label_ar).toBe('يحتاج مراجعة هندسية');
  });

  it('selects admin UC template for administrative + under construction', () => {
    expect(
      shouldUseAdminUcReport({
        client,
        report: { ...EMPTY_TECHNICAL_REPORT, building_status: 'تحت الإنشاء' },
      })
    ).toBe(true);
    expect(
      shouldUseAdminUcReport({
        client: { ...client, activity_type: 'hotel', project_status: 'قائم' },
        report: { ...EMPTY_TECHNICAL_REPORT, building_status: 'قائم' },
      })
    ).toBe(false);
  });

  it('acceptance: pump/tank inputs appear verbatim in generated report', () => {
    const design = designFixture();
    expect(design.water_tank.calculated_required_volume_m3).toBe(120);

    const doc = generateAdminUcReport({
      client,
      report: {
        ...EMPTY_TECHNICAL_REPORT,
        building_status: 'تحت الإنشاء',
        outgoing_number: 'TR-100',
        report_date: '2026-08-10',
      },
      engineeringData: {
        ...EMPTY_PROJECT_ENGINEERING_DATA,
        fire_protection_design: design,
      },
      company: DEFAULT_COMPANY_PROFILE,
    });

    expect(doc.template_id).toBe('admin_uc');
    expect(doc.chapters).toHaveLength(11);
    expect(doc.toc).toHaveLength(11);
    expect(doc.acceptance.pump_capacity).toBe('1000 GPM');
    expect(doc.acceptance.pump_pressure).toBe('8 bar');
    expect(doc.acceptance.tank_capacity).toBe('100 m³');
    expect(doc.acceptance.water_demand).toBe('1000 L/min');
    expect(doc.acceptance.duration).toBe('120 min');
    expect(doc.acceptance.theoretical_volume).toBe('120 m³');
    expect(doc.acceptance.tank_check_label).toBe('يحتاج مراجعة هندسية');

    const waterChapter = doc.chapters.find((c) => c.id === 'water');
    const htmlChunk = JSON.stringify(waterChapter);
    expect(htmlChunk).toContain('1000 GPM');
    expect(htmlChunk).toContain('8 bar');
    expect(htmlChunk).toContain('100 m³');
    expect(htmlChunk).toContain('يحتاج مراجعة هندسية');
    expect(htmlChunk).not.toContain('غير محدد');
    expect(htmlChunk).toContain('Preliminary Engineering Check');

    // Re-issue after pump change updates all linked places
    const updated = mergeFireProtectionDesign({
      ...design,
      pump: {
        ...design.pump,
        capacity: { value: 1250, unit: 'GPM', input_unit: 'GPM', source: 'engineer_input' },
      },
    });
    const doc2 = generateAdminUcReport({
      client,
      report: { ...EMPTY_TECHNICAL_REPORT, building_status: 'تحت الإنشاء' },
      engineeringData: { ...EMPTY_PROJECT_ENGINEERING_DATA, fire_protection_design: updated },
    });
    expect(doc2.acceptance.pump_capacity).toBe('1250 GPM');
  });

  it('uses under-construction wording (not installed)', () => {
    const doc = generateAdminUcReport({
      client,
      report: { ...EMPTY_TECHNICAL_REPORT, building_status: 'تحت الإنشاء' },
      engineeringData: {
        ...EMPTY_PROJECT_ENGINEERING_DATA,
        fire_protection_design: designFixture(),
      },
    });
    const access = doc.chapters.find((c) => c.id === 'fire_access');
    const text = JSON.stringify(access);
    expect(text).toContain('يجب مراعاة توفير متطلبات وصول آليات الدفاع المدني');
    expect(text).not.toContain('تم تركيب مضخة الحريق');
  });

  it('HTML separates attachments from core report', () => {
    const doc = generateAdminUcReport({
      client,
      report: { ...EMPTY_TECHNICAL_REPORT, building_status: 'تحت الإنشاء' },
      engineeringData: {
        ...EMPTY_PROJECT_ENGINEERING_DATA,
        fire_protection_design: {
          ...designFixture(),
          attachments: [{ id: 'a1', label: 'مرفق 1 — مخطط الموقع' }],
        },
      },
    });
    const html = buildAdminUcReportHtml({
      document: doc,
      company: DEFAULT_COMPANY_PROFILE,
    });
    expect(html).toContain('المبنى الإداري تحت الإنشاء');
    expect(html).toContain('attachments-section');
    expect(html).toContain('page-break-before: always');
    expect(html).toContain('1000 GPM');
    expect(html).toContain('مرفق 1 — مخطط الموقع');
    expect(formatMeasured({ value: null, unit: 'GPM', source: 'engineer_input' })).toBe(
      NOT_ENTERED_AR
    );
  });
});
