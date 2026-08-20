import type { ClientRecord } from '@/lib/types/client';
import type { ProjectEngineeringData } from '@/lib/types/project-reports';
import {
  buildTechnicalReportSourceData,
  type TechnicalReportFieldClassification,
  type TechnicalReportSourceData,
  type TechnicalReportSourceField,
} from '@/lib/projects/technical-report-source-data';

export type TechnicalReportUiSectionId =
  | 'project_summary'
  | 'occupancy_spaces'
  | 'structural'
  | 'egress'
  | 'civil_defense'
  | 'fire_fighting'
  | 'alarm_evacuation'
  | 'electrical'
  | 'mechanical'
  | 'evidence'
  | 'observations'
  | 'approval';

export type TechnicalReportUiSection = {
  id: TechnicalReportUiSectionId;
  title: string;
  description: string;
};

export type TechnicalReportUiSectionStatus = 'COMPLETE' | 'NEEDS_REVIEW' | 'MISSING_DATA';

export type TechnicalReportUiCounters = {
  autoFilled: number;
  engineerReview: number;
  missing: number;
  manual: number;
  status: TechnicalReportUiSectionStatus;
};

export const TECHNICAL_REPORT_UI_SECTIONS: readonly TechnicalReportUiSection[] = [
  { id: 'project_summary', title: 'ملخص المشروع', description: 'البيانات الموروثة من البيانات الأساسية ومعلومات المخطط.' },
  { id: 'occupancy_spaces', title: 'الإشغال والمساحات', description: 'الأدوار والمساحات والأنشطة والشاغلون والمخارج ومسافات السفر.' },
  { id: 'structural', title: 'الهيكل الإنشائي', description: 'نوع البناء والارتفاع والقبو والخصائص الإنشائية المتاحة.' },
  { id: 'egress', title: 'الإخلاء والمخارج', description: 'الشاغلون والمخارج والسلالم ومسارات الهروب وملاحظات المهندس.' },
  { id: 'civil_defense', title: 'الدفاع المدني', description: 'بيانات الجهة المختصة والوصول والملاحظات المرتبطة بها.' },
  { id: 'fire_fighting', title: 'أنظمة مكافحة الحريق', description: 'الرش والخراطيم والطفايات والأنظمة الخاصة حسب بيانات المساحات.' },
  { id: 'alarm_evacuation', title: 'الإنذار والإخلاء', description: 'لوحات الإنذار والكواشف والتنبيه والإنارة واللوحات الإرشادية.' },
  { id: 'electrical', title: 'السلامة الكهربائية', description: 'التأريض ومانع الصواعق والمولد الاحتياطي وملاحظات المهندس.' },
  { id: 'mechanical', title: 'السلامة الميكانيكية', description: 'التهوية والتحكم بالدخان عند توفر متطلبات أو ملاحظات.' },
  { id: 'evidence', title: 'التوثيق والمراجع الفنية', description: 'إدارة أدلة الموقع والحالة القائمة وأنظمة السلامة ومقتطفات الكود؛ لا تدخل PDF في هذه المرحلة.' },
  { id: 'observations', title: 'الملاحظات والتوصيات', description: 'سجل منظم للبنود الفنية والتوصيات العامة.' },
  { id: 'approval', title: 'الاعتماد والمعاينة', description: 'حالة التقرير وبيانات المهندس والإصدار والمعاينة.' },
] as const;

export function sourceBadge(field: TechnicalReportSourceField): string {
  if (field.engineer_override) return 'معتمد يدويًا';
  if (field.status === 'missing') return field.classification === 'MANUAL' ? 'إدخال يدوي' : 'يحتاج مراجعة';
  if (field.classification === 'AUTO_SUGGEST') return 'مقترح تلقائيًا';
  return 'موروث تلقائيًا';
}

export function sourceLabel(field: TechnicalReportSourceField): string {
  const labels: Record<TechnicalReportSourceField['source_stage'], string> = {
    technical_report_override: 'قرار المهندس',
    design_center_approved: 'مركز التصاميم المعتمد',
    space_safety: 'بيانات المساحات وأنظمة السلامة',
    plan_information: 'معلومات المخطط',
    basic_data: 'البيانات الأساسية',
    legacy_technical_report: 'بيانات التقرير المحفوظة',
    derived: 'قيمة مشتقة',
    missing: 'لا يوجد مصدر موثوق',
  };
  return labels[field.source_stage];
}

export function isFieldEditable(field: TechnicalReportSourceField): boolean {
  return field.classification === 'AUTO_FILL_EDITABLE' || field.classification === 'MANUAL' || field.classification === 'AUTO_SUGGEST';
}

function counters(fields: TechnicalReportSourceField[]): TechnicalReportUiCounters {
  const result = fields.reduce(
    (acc, field) => {
      if (field.status === 'missing') acc.missing += 1;
      else if (field.engineer_override || field.classification === 'AUTO_SUGGEST') acc.engineerReview += 1;
      else if (field.classification === 'MANUAL') acc.manual += 1;
      else acc.autoFilled += 1;
      return acc;
    },
    { autoFilled: 0, engineerReview: 0, missing: 0, manual: 0 }
  );
  return {
    ...result,
    status: result.missing > 0 ? 'MISSING_DATA' : result.engineerReview > 0 || result.manual > 0 ? 'NEEDS_REVIEW' : 'COMPLETE',
  };
}

function allSpaceFields(source: TechnicalReportSourceData): TechnicalReportSourceField[] {
  return source.floors.flatMap((floor) => [
    floor.name,
    floor.base_area_m2,
    floor.occupants,
    floor.exits,
    floor.travel_distance_m,
    ...floor.spaces.flatMap((space) => [
      space.name,
      space.activity_use,
      space.area_m2,
      space.occupancy,
      space.hazard_classification,
      space.occupants,
      space.exits,
      space.travel_distance_m,
      ...Object.values(space.quantities),
    ]),
  ]);
}

export function buildTechnicalReportUiModel(params: {
  client: ClientRecord;
  data: ProjectEngineeringData;
}): {
  source: TechnicalReportSourceData;
  sections: Record<TechnicalReportUiSectionId, TechnicalReportUiCounters>;
} {
  const source = buildTechnicalReportSourceData({
    client: params.client,
    engineeringData: params.data,
  });
  const report = params.data.technical_report;
  const manualField = (value: unknown): TechnicalReportSourceField<string | null> => ({
    value: typeof value === 'string' && value.trim() ? value : null,
    final_value: typeof value === 'string' && value.trim() ? value : null,
    auto_value: null,
    source: typeof value === 'string' && value.trim() ? 'legacy_technical_report' : 'missing',
    source_stage: typeof value === 'string' && value.trim() ? 'legacy_technical_report' : 'missing',
    source_key: null,
    status: typeof value === 'string' && value.trim() ? 'legacy' : 'missing',
    classification: 'MANUAL' as TechnicalReportFieldClassification,
    engineer_override: false,
  });
  const spaces = allSpaceFields(source);
  const safetyFields = source.floors.flatMap((floor) => floor.spaces.flatMap((space) => Object.values(space.quantities)));
  const plan = source.plan;

  return {
    source,
    sections: {
      project_summary: counters(Object.values(source.project)),
      occupancy_spaces: counters(spaces),
      structural: counters([
        plan.construction_type,
        plan.occupancy_classification,
        plan.building_height_m,
        plan.basement_floors_count,
        plan.underground_depth_m,
        plan.high_rise_building,
        plan.atrium_exists,
        plan.windowless_building,
      ]),
      egress: counters([
        source.aggregates.total_occupants,
        source.aggregates.total_exits,
        source.aggregates.maximum_travel_distance_m,
        plan.exits_count,
        plan.stairs_count,
        manualField(report.exits_items?.map((item) => item.notes).filter(Boolean).join('\n')),
      ]),
      civil_defense: counters([plan.civil_defense_branch, plan.special_rescue_team_required, manualField(report.civil_defense_branch)]),
      fire_fighting: counters(safetyFields.filter((field, index) => index % 13 === 0 || index % 13 === 7 || index % 13 === 9 || index % 13 === 10 || index % 13 === 11 || index % 13 === 12)),
      alarm_evacuation: counters(safetyFields.filter((field, index) => [1, 2, 3, 4, 5, 6, 8].includes(index % 13))),
      electrical: counters([plan.electrical_grounding, plan.lightning_protection, plan.backup_generator]),
      mechanical: counters([manualField(report.ventilation_items?.map((item) => item.notes).filter(Boolean).join('\n'))]),
      evidence: counters([manualField(report.facade_photo?.id), manualField(report.earth_photo?.id), manualField(report.site_photo?.id)]),
      observations: counters([
        manualField(report.firefighting_items?.map((item) => item.notes).filter(Boolean).join('\n')),
        manualField(report.alarm_items?.map((item) => item.notes).filter(Boolean).join('\n')),
        manualField(report.general_recommendations?.some((item) => item.checked) ? 'selected' : null),
      ]),
      approval: counters([
        manualField(report.safety_engineer_name),
        manualField(report.executive_director_name),
        manualField(report.outgoing_number),
        manualField(report.status),
      ]),
    },
  };
}

export function sectionStatusLabel(status: TechnicalReportUiSectionStatus): string {
  if (status === 'COMPLETE') return 'مكتمل';
  if (status === 'NEEDS_REVIEW') return 'يحتاج مراجعة';
  return 'بيانات ناقصة';
}
