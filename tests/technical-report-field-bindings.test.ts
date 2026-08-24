import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { ClientRecord } from '@/lib/types/client';
import { parseProjectEngineeringData } from '@/lib/business/project-reports';
import { EMPTY_PROJECT_ENGINEERING_DATA, EMPTY_TECHNICAL_REPORT } from '@/lib/types/project-reports';
import { EMPTY_FIRE_PROTECTION_DESIGN } from '@/lib/types/fire-protection-design';
import { mergeFireProtectionDesign } from '@/lib/projects/admin-uc-report/design';
import { generateAdminUcReport } from '@/lib/projects/admin-uc-report';
import { generateOfficialTechnicalReportDocument } from '@/lib/projects/official-technical-report-document';
import { emptySafetyQuantities } from '@/lib/projects/design-center/space-safety';

const client: ClientRecord = {
  id: 'technical-field-binding-client',
  client_code: 'FIELD-BIND-1',
  name: 'مشروع ربط الحقول',
  business_name: 'مشروع ربط الحقول',
  owner_name: 'مالك الاختبار',
  activity_type: 'administrative',
  project_status: 'تحت الإنشاء',
  city: 'الرياض',
  building_area: 300,
  floors_count: 1,
};

function allDocumentText(document: ReturnType<typeof generateOfficialTechnicalReportDocument>) {
  return document.sections
    .flatMap((section) => [
      section.title_ar,
      ...section.paragraphs.map((paragraph) => paragraph.text),
      ...(section.tables || []).flatMap((table) => [table.caption_ar, ...table.rows.flat()]),
    ])
    .join('\n');
}

function fixture() {
  const report = {
    ...EMPTY_TECHNICAL_REPORT,
    building_status: 'تحت الإنشاء',
    report_date: '2026-08-24',
  };
  const quantities = {
    ...emptySafetyQuantities(),
    sprinklers: 12,
    fire_alarm_panels: 2,
    smoke_detectors: 17,
    heat_detectors: 5,
    alarm_bells: 4,
    emergency_lights: 9,
    signs: 6,
  };

  return {
    ...EMPTY_PROJECT_ENGINEERING_DATA,
    technical_report: report,
    design_center: {
      ...EMPTY_PROJECT_ENGINEERING_DATA.design_center,
      space_safety: {
        source: 'project_engineering' as const,
        floors: [
          {
            id: 'floor-1',
            label: 'الدور الأرضي',
            repeat_count: 1,
            areas: [
              {
                id: 'area-1',
                label: 'قاعة الاختبار',
                activity_type: 'assembly',
                area_m2: 300,
                hazard_suggested: 'ordinary_hazard_group_1',
                suppression_suggested: ['رش آلي'],
                quantities,
              },
            ],
          },
        ],
      },
    },
    fire_protection_design: mergeFireProtectionDesign({
      ...EMPTY_FIRE_PROTECTION_DESIGN,
      sprinkler: {
        required: 'yes',
        zones_count: '3',
        system_type: 'نظام رطب',
        sprinkler_type: 'Quick Response',
        k_factor: 'K-5.6',
        design_pressure: '1.2 bar',
        design_flow: '450 L/min',
        source: 'engineer_input',
      },
      fire_alarm: {
        control_panel: 'لوحة عنوانية Addressable',
        smoke_detectors: 'قيمة قديمة لا يجب أن تطغى على كميات المساحات',
        heat_detectors: 'قيمة قديمة لا يجب أن تطغى على كميات المساحات',
        manual_call_points: 'عند كل مخرج رئيسي',
        bells: 'قيمة قديمة لا يجب أن تطغى على كميات المساحات',
        voice_alarm: 'نظام إخلاء صوتي مركزي',
        integration: 'ربط مع نظام التحكم بالدخان',
        notes: 'ملاحظة إنذار فنية موثقة',
        source: 'engineer_input',
      },
      supporting_systems: {
        emergency_lighting: {
          status: 'required',
          note: 'تغطية إنارة الطوارئ معتمدة للمسارات',
          recommendation: 'التحقق من استقلالية التغذية',
          source: 'engineer_input',
        },
        exit_signs: {
          status: 'by_design',
          note: 'لوحات مضيئة على المسار',
          recommendation: 'مطابقة اتجاه الحركة',
          source: 'engineer_input',
        },
        smoke_control: {
          status: 'required',
          note: 'تشغيل متكامل مع اللوحة',
          recommendation: 'اختبار سبب وأثر',
          source: 'engineer_input',
        },
        ventilation: {
          status: 'by_design',
          note: 'تنسيق ميكانيكي مطلوب',
          recommendation: 'اعتماد مخططات MEP',
          source: 'engineer_input',
        },
        electrical_safety: {
          status: 'required',
          note: 'دوائر مخصصة للأنظمة',
          recommendation: 'التأكد من الحماية',
          source: 'engineer_input',
        },
        emergency_power: {
          status: 'required',
          note: 'مصدر احتياطي موثق',
          recommendation: 'اختبار التحويل',
          source: 'engineer_input',
        },
      },
      occupancy: {
        ...EMPTY_FIRE_PROTECTION_DESIGN.occupancy,
        hazard_class: 'Ordinary Hazard Group 1',
        source: 'engineer_input',
      },
      egress: {
        metrics: [
          {
            label: 'عدد المخارج',
            value: '2',
            note: 'مطابق للمخطط',
            source: 'engineer_input',
          },
        ],
      },
    }),
  };
}

describe('technical report field bindings', () => {
  it('keeps detailed design properties and space-safety quantities isolated across reload', () => {
    const reloaded = parseProjectEngineeringData(fixture());
    expect(reloaded.fire_protection_design).toBeDefined();
    const reloadedDesign = reloaded.fire_protection_design!;

    expect(reloadedDesign.sprinkler).toMatchObject({
      required: 'yes',
      zones_count: '3',
      system_type: 'نظام رطب',
      sprinkler_type: 'Quick Response',
      k_factor: 'K-5.6',
      design_pressure: '1.2 bar',
      design_flow: '450 L/min',
    });
    expect(reloadedDesign.fire_alarm).toMatchObject({
      control_panel: 'لوحة عنوانية Addressable',
      manual_call_points: 'عند كل مخرج رئيسي',
      voice_alarm: 'نظام إخلاء صوتي مركزي',
      integration: 'ربط مع نظام التحكم بالدخان',
    });
    expect(reloaded.design_center.space_safety?.floors[0].areas[0].quantities).toMatchObject({
      fire_alarm_panels: 2,
      smoke_detectors: 17,
      heat_detectors: 5,
      alarm_bells: 4,
      emergency_lights: 9,
      signs: 6,
    });
  });

  it('renders detailed properties from fire_protection_design and device quantities from space_safety in both PDF models', () => {
    const data = fixture();
    const official = generateOfficialTechnicalReportDocument({
      client,
      report: data.technical_report,
      engineeringData: data,
    });
    const officialText = allDocumentText(official);

    for (const expected of [
      'نظام الرش الآلي',
      'متوفر',
      'نظام رطب',
      'Quick Response',
      'K-5.6',
      '1.2 bar',
      '450 L/min',
      'لوحة عنوانية Addressable',
      '17',
      '5',
      '4',
      'عند كل مخرج رئيسي',
      'نظام إخلاء صوتي مركزي',
      'ربط مع نظام التحكم بالدخان',
      'ملاحظة إنذار فنية موثقة',
      'تغطية إنارة الطوارئ معتمدة للمسارات',
      'لوحات مضيئة على المسار',
      'تشغيل متكامل مع اللوحة',
      'تنسيق ميكانيكي مطلوب',
      'دوائر مخصصة للأنظمة',
      'مصدر احتياطي موثق',
      '9',
      '6',
    ]) {
      expect(officialText).toContain(expected);
    }
    expect(officialText).not.toContain('قيمة قديمة لا يجب أن تطغى على كميات المساحات');

    const admin = generateAdminUcReport({
      client,
      report: data.technical_report,
      engineeringData: data,
    });
    const adminSuppressionText = JSON.stringify(admin.chapters.find((chapter) => chapter.id === 'suppression'));
    const adminAlarmText = JSON.stringify(admin.chapters.find((chapter) => chapter.id === 'alarm'));
    const adminSupportingText = JSON.stringify(admin.chapters.find((chapter) => chapter.id === 'supporting'));
    for (const expected of ['نظام رطب', 'Quick Response', 'K-5.6', '450 L/min']) {
      expect(adminSuppressionText).toContain(expected);
    }
    for (const expected of ['لوحة عنوانية Addressable', '17', '5', '4', 'نظام إخلاء صوتي مركزي']) {
      expect(adminAlarmText).toContain(expected);
    }
    expect(adminAlarmText).not.toContain('قيمة قديمة لا يجب أن تطغى على كميات المساحات');
    for (const expected of [
      'إنارة الطوارئ',
      'لوحات مخارج الطوارئ',
      '9',
      '6',
      'تغطية إنارة الطوارئ معتمدة للمسارات',
      'مصدر احتياطي موثق',
    ]) {
      expect(adminSupportingText).toContain(expected);
    }
  });

  it('keeps UI fields connected to fire_protection_design and moves hazard and exit inputs outside the hydraulic section', () => {
    const hydraulicUi = readFileSync('components/projects/FireProtectionDesignSection.tsx', 'utf8');
    const reportUi = readFileSync('components/projects/TechnicalReportSection.tsx', 'utf8');
    const alarmUi = readFileSync('components/projects/FireAlarmAndSupportingSystemsSection.tsx', 'utf8');
    const modal = readFileSync('components/projects/ProjectReportModal.tsx', 'utf8');
    const savePath = readFileSync('lib/projects/save-supervision-report.ts', 'utf8');
    const reloadPath = readFileSync('lib/projects/engineering-live-store.ts', 'utf8');

    for (const expected of [
      'design.sprinkler.required',
      'design.sprinkler.zones_count',
      'design.sprinkler.system_type',
      'design.sprinkler.sprinkler_type',
      'design.sprinkler.k_factor',
      'design.sprinkler.design_pressure',
      'design.sprinkler.design_flow',
    ]) {
      expect(hydraulicUi).toContain(expected);
    }
    expect(hydraulicUi).not.toContain('درجة الخطورة (قابلة للتعديل)');
    expect(hydraulicUi).not.toContain('عدد مخارج الطوارئ (اختياري)');
    expect(reportUi).toContain('درجة الخطورة للتصميم الفني');
    expect(reportUi).toContain('عدد مخارج الطوارئ للتصميم الفني');

    for (const expected of [
      'design.fire_alarm.control_panel',
      'design.fire_alarm.manual_call_points',
      'design.fire_alarm.voice_alarm',
      'design.fire_alarm.integration',
      'design.supporting_systems',
    ]) {
      expect(alarmUi).toContain(expected);
    }
    expect(modal).toContain('onFireProtectionDesignChange={(fire_protection_design) => patch({ fire_protection_design })}');
    expect(savePath).toContain('saveEngineeringLive');
    expect(reloadPath).toContain(".from('project_engineering_live')");
  });
});
