import { describe, expect, it } from 'vitest';
import { buildBuildingPlanPrintHtml } from '@/components/projects/BuildingPlanPrint';
import { DEFAULT_COMPANY_PROFILE } from '@/lib/company-profile';
import { getBuildingPlanGeneralInfo, mergeBuildingPlanDefaults } from '@/lib/projects/building-plan';
import type { ClientRecord } from '@/lib/types/client';

describe('Building plan print template', () => {
  const client = {
    id: 'client-print',
    client_code: 'C-0001',
    name: 'مالك المشروع',
    business_name: 'مشروع تجريبي',
    owner_name: 'المالك التجريبي',
    activity_type: 'school',
    city: 'الرياض',
    district: 'العليا',
    street: 'الملك فهد',
    national_address: 'العليا — الرياض',
    plot_number: '123',
    land_area: 500,
    building_area: 1200,
    floors_count: 3,
    license_number: '4100000000',
    assigned_engineer: 'المهندس التجريبي',
  } as ClientRecord;

  const report = mergeBuildingPlanDefaults({
    status: 'معتمد',
    report_date: '2026-08-19',
    building_permit_number: '4100000000',
    building_permit_date: '2026-08-01',
    occupancy_classification: 'E',
    building_type_code: 'Type I',
    total_site_area_m2: '500',
    floors_description: '3',
    building_height_m: '12',
    basement_floors_count: '1',
    underground_depth_m: '4',
    exits_count: '2',
    stairs_count: '2',
    escalators_count: '0',
    elevators_count: '1',
    high_rise_building: 'لا',
    atrium_exists: 'لا',
    underground_building: 'نعم',
    windowless_building: 'لا',
    electrical_grounding: 'نعم',
    lightning_protection: 'نعم',
    backup_generator: 'نعم',
    sbc_code_exceptions: 'لا',
    special_rescue_team_required: 'لا',
    fire_alarm_system: 'نعم',
    sprinkler_system: 'نعم',
    sbc_requirements: 'متطلبات محفوظة',
    emergency_exits_doors: 'مخارج طوارئ محفوظة',
    plan_approval_status: 'معتمد',
    technical_inspection_notes: 'ملاحظات محفوظة',
  });

  const company = {
    ...DEFAULT_COMPANY_PROFILE,
    name: 'شركة السلامة الحالية',
    legal_name: 'شركة السلامة الحالية للاستشارات',
    commercial_register: '1010101010',
    membership_id: 'MEM-99',
    logo_url: 'https://example.test/logo.png',
    stamp_url: 'https://example.test/stamp.png',
  };

  it('uses a fixed single A4 print canvas without body viewport height or print margins', () => {
    const html = buildBuildingPlanPrintHtml(client, report, getBuildingPlanGeneralInfo(client), company);

    expect(html).toContain('@page { size: A4 portrait; margin: 0; }');
    expect(html).toContain('.sheet { width: 210mm; height: 297mm;');
    expect(html).toContain('body { margin: 0; padding: 0; }');
    expect(html).not.toContain('height: 100vh');
    expect(html).not.toContain('body { margin: 8mm; }');
  });

  it('renders the compact building, plan-information, requirements, and approval tables from dynamic values', () => {
    const html = buildBuildingPlanPrintHtml(client, report, getBuildingPlanGeneralInfo(client), company);

    expect(html).toContain('بيانات المنشأة');
    expect(html).toContain('معلومات المخطط');
    expect(html).toContain('أنظمة السلامة والاعتماد');
    expect(html).toContain('اعتماد المكتب الاستشاري');
    expect(html).toContain('شركة السلامة الحالية للاستشارات');
    expect(html).toContain('1010101010');
    expect(html).toContain('MEM-99');
    expect(html).toContain('https://example.test/logo.png');
    expect(html).toContain('https://example.test/stamp.png');
    expect(html).toContain('4100000000');
    expect(html).toContain('2026-08-01');
    expect(html).not.toContain('TEAM');
  });
});
