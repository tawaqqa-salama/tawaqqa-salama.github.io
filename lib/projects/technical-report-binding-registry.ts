import { ACTIVITY_RULES } from '@/lib/constants/clients';
import { hazardClassificationLabel } from '@/lib/projects/design-center/safety-rules';

export type TechnicalReportBindingDisposition = 'rendered' | 'intentionally_not_in_pdf';
export type TechnicalReportDisplayCondition = 'always' | 'when_available' | 'when_approved' | 'when_system_exists';

export type TechnicalReportBinding = {
  id: string;
  ui_field: string;
  canonical_path: string;
  display_condition: TechnicalReportDisplayCondition;
  official_report: string;
  administrative_report: string;
  disposition: TechnicalReportBindingDisposition;
  reason?: string;
};

type BindingTuple = [
  id: string,
  uiField: string,
  canonicalPath: string,
  condition: TechnicalReportDisplayCondition,
  official: string,
  administrative: string,
  disposition?: TechnicalReportBindingDisposition,
  reason?: string,
];

const bindings = (items: BindingTuple[]): TechnicalReportBinding[] =>
  items.map(([id, ui_field, canonical_path, display_condition, official_report, administrative_report, disposition = 'rendered', reason]) => ({
    id,
    ui_field,
    canonical_path,
    display_condition,
    official_report,
    administrative_report,
    disposition,
    ...(reason ? { reason } : {}),
  }));

/**
 * Contract for every persisted technical-report input family.
 * Repeating floor/space, note, evidence and recommendation inputs are described once
 * because each instance follows the same canonical path and rendering rule.
 */
export const TECHNICAL_REPORT_BINDING_REGISTRY: readonly TechnicalReportBinding[] = bindings([
  ['project.name', 'اسم المشروع / المنشأة', 'client + technical_report.source_overrides.project.project_name', 'when_available', 'بيانات المشروع والغلاف', 'وصف المشروع'],
  ['project.owner', 'المالك', 'client.owner_name + technical_report.source_overrides.project.owner_name', 'when_available', 'بيانات المشروع والغلاف', 'وصف المشروع'],
  ['project.activity', 'النشاط', 'client.activity_type + technical_report.source_overrides.project.activity', 'when_available', 'بيانات المشروع', 'وصف المشروع'],
  ['project.location', 'المدينة والحي والشارع والعنوان الوطني والقطعة', 'client/building_plan + technical_report.source_overrides.project.*', 'when_available', 'بيانات المشروع والغلاف', 'وصف المشروع'],
  ['project.permit.number', 'رقم رخصة البناء', 'building_plan.building_permit_number', 'when_available', 'بيانات المشروع', 'وصف المشروع'],
  ['project.permit.date', 'تاريخ رخصة البناء', 'building_plan.building_permit_date', 'when_available', 'بيانات المشروع', 'وصف المشروع'],
  ['project.dimensions', 'مساحة الأرض ومساحة البناء وعدد الأدوار', 'building_plan.{land_area_m2,building_area_m2,floors_count}', 'when_available', 'بيانات المشروع', 'وصف المشروع'],
  ['plan.construction', 'نوع البناء وتصنيف الإشغال والارتفاع والخصائص الخاصة', 'building_plan.{construction_type,occupancy_classification,building_height_m,high_rise_building,atrium_exists,basement_floors_count,underground_depth_m,windowless_building}', 'when_available', 'تصنيف الإشغال ونوع البناء', 'الأكواد وتصنيف الإشغال'],
  ['plan.floors_description', 'وصف الأدوار', 'building_plan.floors_description', 'when_available', 'المساحات والأدوار والارتفاعات', 'وصف المشروع'],
  ['plan.fire_alarm_system', 'نظام إنذار الحريق من بيانات المخطط', 'building_plan.fire_alarm_system', 'when_available', 'نظام الإنذار والكشف', 'نظام الإنذار'],
  ['plan.sprinkler_system', 'نظام الرش من بيانات المخطط', 'building_plan.sprinkler_system', 'when_available', 'نظام الرش الآلي', 'أنظمة مكافحة الحريق'],
  ['plan.electrical', 'التأريض ومانع الصواعق والمولد الاحتياطي', 'building_plan.{electrical_grounding,lightning_protection,backup_generator}', 'when_available', 'أنظمة السلامة الكهربائية', 'أنظمة السلامة المساندة'],
  ['plan.civil_defense', 'قسم الدفاع المدني وفريق الإنقاذ', 'building_plan.{civil_defense_branch,special_rescue_team_required}', 'when_available', 'وصول آليات الدفاع المدني', 'وصول آليات الدفاع المدني'],
  ['space.identity', 'الدور والمساحة والنشاط والإشغال والمساحة', 'design_center.space_safety.floors[].areas[].{label,activity_type,area_m2}', 'when_available', 'تصنيف الإشغال والمساحات', 'الأكواد وتصنيف الإشغال'],
  ['space.egress', 'الشاغلون والمخارج ومسافة السفر', 'design_center.space_safety.floors[].areas[].{estimated_occupants,quantities.emergency_exits,max_travel_distance_m}', 'when_available', 'وسائل الخروج وسعة المخارج', 'المخارج ومسالك الهروب'],
  ['space.hazard', 'درجة الخطورة لكل مساحة', 'design_center.space_safety.floors[].areas[].hazard_approved|hazard_suggested', 'when_available', 'تصنيف الإشغال والخطورة', 'الأكواد وتصنيف الإشغال'],
  ['space.sprinklers', 'عدد المرشات حسب المساحة', 'design_center.space_safety.floors[].areas[].quantities.sprinklers', 'when_available', 'نظام الرش الآلي', 'أنظمة مكافحة الحريق'],
  ['space.extinguishers', 'عدد ونوع وسعة الطفايات اليدوية', 'design_center.space_safety.floors[].areas[].quantities.{manual_extinguishers,manual_extinguisher_type,manual_extinguisher_size}', 'when_available', 'الطفايات اليدوية', 'أنظمة مكافحة الحريق'],
  ['space.alarm_devices', 'لوحات الإنذار والكواشف والأجراس ومواقع اللوحات', 'design_center.space_safety.floors[].areas[].quantities.{fire_alarm_panels,alarm_panel_locations,smoke_detectors,heat_detectors,alarm_bells}', 'when_available', 'نظام الإنذار والكشف', 'نظام الإنذار'],
  ['space.emergency_devices', 'إنارة الطوارئ واللوحات الإرشادية والسلالم', 'design_center.space_safety.floors[].areas[].quantities.{emergency_lights,signs,emergency_stairs}', 'when_available', 'إنارة الطوارئ واللوحات الإرشادية', 'أنظمة السلامة المساندة'],
  ['design.occupancy', 'تصنيف الخطورة العام', 'fire_protection_design.occupancy.hazard_class', 'when_available', 'ملخص تصميمي عند غياب تصنيف المساحات', 'ملخص تصميمي عند غياب تصنيف المساحات'],
  ['design.egress', 'مقاييس الإخلاء الهندسية', 'fire_protection_design.egress.metrics[]', 'when_available', 'وسائل الخروج ومقاييس الإخلاء', 'المخارج ومسالك الهروب'],
  ['design.fire_truck_access', 'وصول آليات الدفاع المدني وFDC', 'fire_protection_design.fire_truck_access.*', 'when_available', 'وصول آليات الدفاع المدني — مصدر موروث/قراءة فقط', 'وصول آليات الدفاع المدني — مصدر موروث/قراءة فقط'],
  ['design.water', 'مصدر المياه والخزان', 'fire_protection_design.{water_supply,water_tank}', 'when_system_exists', 'إمداد مياه الإطفاء', 'إمداد مياه الإطفاء'],
  ['design.pumps', 'المضخات والتدفق والضغط المقنن', 'fire_protection_design.{pump,diesel_pump,jockey_pump}', 'when_system_exists', 'مضخات الحريق', 'أنظمة مكافحة الحريق'],
  ['design.standpipe', 'Standpipe / Hose Reel', 'fire_protection_design.standpipe.*', 'when_available', 'نظام Standpipe — مصدر موروث/قراءة فقط', 'أنظمة مكافحة الحريق — مصدر موروث/قراءة فقط'],
  ['design.sprinkler', 'مواصفات الرش الفنية', 'fire_protection_design.sprinkler.*', 'when_system_exists', 'نظام الرش الآلي', 'أنظمة مكافحة الحريق'],
  ['design.extinguishers', 'تفاصيل الطفايات التصميمية', 'fire_protection_design.extinguishers[]', 'when_available', 'الطفايات اليدوية — مصدر موروث/قراءة فقط', 'أنظمة مكافحة الحريق — مصدر موروث/قراءة فقط'],
  ['design.alarm', 'مكونات نظام الإنذار', 'fire_protection_design.fire_alarm.*', 'when_available', 'نظام الإنذار والكشف', 'نظام الإنذار'],
  ['design.supporting', 'الأنظمة الداعمة', 'fire_protection_design.supporting_systems.*', 'when_available', 'التهوية والتحكم بالدخان والأنظمة الداعمة', 'أنظمة السلامة المساندة'],
  ['report.fire_notes', 'ملاحظات مكافحة الحريق', 'technical_report.firefighting_items[]', 'when_approved', 'أنظمة إطفاء خاصة', 'مراجعة المتطلبات والتوصيات'],
  ['report.alarm_notes', 'ملاحظات الإنذار', 'technical_report.alarm_items[]', 'when_approved', 'نظام الإنذار والكشف', 'مراجعة المتطلبات والتوصيات'],
  ['report.exits_notes', 'ملاحظات المخارج', 'technical_report.exits_items[]', 'when_approved', 'وسائل الخروج', 'المخارج ومسالك الهروب'],
  ['report.ventilation_notes', 'ملاحظات التهوية', 'technical_report.ventilation_items[]', 'when_approved', 'التهوية والتحكم بالدخان', 'أنظمة السلامة المساندة'],
  ['report.electrical_notes', 'ملاحظات السلامة الكهربائية', 'technical_report.overview_text', 'when_available', 'أنظمة السلامة الكهربائية', 'أنظمة السلامة المساندة'],
  ['report.summary', 'الخلاصة الفنية', 'fire_protection_design.summary_text + technical_report.overview_text', 'when_available', 'الخلاصة الفنية', 'الملخص والخلاصة'],
  ['report.approval', 'تاريخ ورقم التقرير واسم المهندس والمدير', 'technical_report.{report_date,outgoing_number,safety_engineer_name,executive_director_name}', 'when_available', 'الغلاف والاعتماد والتوقيعات', 'الغلاف والاعتماد'],
  ['report.evidence', 'الأدلة والصور ومقتطفات الكود', 'technical_report.evidence + legacy evidence', 'when_approved', 'المرفقات', 'المرفقات'],
  ['report.recommendations', 'التوصيات الهندسية', 'technical_report.recommendations_v2 + general_recommendations', 'when_approved', 'التوصيات الهندسية المعتمدة', 'مراجعة المتطلبات والتوصيات'],
]);

export const TECHNICAL_REPORT_BINDING_REGISTRY_BY_ID = Object.fromEntries(
  TECHNICAL_REPORT_BINDING_REGISTRY.map((binding) => [binding.id, binding])
) as Readonly<Record<string, TechnicalReportBinding>>;

export const MANUAL_EXTINGUISHER_TYPE_LABELS: Readonly<Record<string, string>> = {
  dry_powder_abc: 'بودرة جافة ABC',
  carbon_dioxide: 'ثاني أكسيد الكربون CO₂',
  foam: 'رغوية (Foam)',
  wet_chemical: 'كيميائية رطبة للمطابخ',
  clean_agent: 'عامل نظيف (Clean Agent)',
  water: 'مائية',
};

export function manualExtinguisherTypeLabel(value: unknown): string {
  const normalized = String(value ?? '').trim();
  return MANUAL_EXTINGUISHER_TYPE_LABELS[normalized] || normalized;
}

export function technicalReportActivityLabel(value: unknown): string {
  const normalized = String(value ?? '').trim();
  return ACTIVITY_RULES[normalized]?.label || normalized;
}

const TECHNICAL_REPORT_HAZARD_LABELS: Readonly<Record<string, string>> = {
  light_hazard: 'خطورة خفيفة',
  ordinary_hazard_group_1: 'خطورة عادية — المجموعة الأولى',
  ordinary_hazard_group_2: 'خطورة عادية — المجموعة الثانية',
  extra_hazard_group_1: 'خطورة إضافية — المجموعة الأولى',
  extra_hazard_group_2: 'خطورة إضافية — المجموعة الثانية',
  high_piled_storage: 'تخزين مرتفع — يتطلب مراجعة هندسية',
  special_hazard: 'خطورة أو إشغال خاص — يتطلب مراجعة هندسية',
};

export function technicalReportHazardLabel(value: unknown): string {
  const normalized = String(value ?? '').trim();
  return TECHNICAL_REPORT_HAZARD_LABELS[normalized] || hazardClassificationLabel(normalized);
}

export function hasBinding(id: string): boolean {
  return Boolean(TECHNICAL_REPORT_BINDING_REGISTRY_BY_ID[id]);
}
