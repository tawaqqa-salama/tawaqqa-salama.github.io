import type { ClientRecord } from '@/lib/types/client';
import type { ProjectEngineeringData } from '@/lib/types/project-reports';
import { EMPTY_FIRE_PROTECTION_DESIGN, VALUE_SOURCE_LABEL_AR, type ValueSource } from '@/lib/types/fire-protection-design';

/**
 * Project-stage engineering study for UNDER_CONSTRUCTION projects. This is not
 * an inspection model: it stores engineer decisions and references only while
 * project/design facts stay in their original canonical sources.
 */
export const UNDER_CONSTRUCTION_SYSTEMS = [
  'fire_truck_access',
  'entrances',
  'emergency_exits',
  'egress_routes',
  'exit_width',
  'travel_distance',
  'emergency_lighting',
  'exit_signs',
  'fire_water_source',
  'fire_tank',
  'electric_fire_pump',
  'diesel_fire_pump',
  'jockey_fire_pump',
  'standpipe',
  'hose_reel_hydrant',
  'sprinkler_system',
  'fdc',
  'special_suppression',
  'portable_extinguishers',
  'fire_alarm_system',
  'facp',
  'panel_locations',
  'smoke_detectors',
  'heat_detectors',
  'manual_call_points',
  'notification_devices',
  'voice_evacuation',
  'alarm_interfaces',
  'mechanical_ventilation',
  'smoke_control',
  'emergency_power',
  'grounding',
  'lightning_protection',
] as const;

export type UnderConstructionSystemKey = (typeof UNDER_CONSTRUCTION_SYSTEMS)[number];
export type UnderConstructionReferenceSource =
  | 'PROJECT'
  | 'BUILDING_PLAN'
  | 'DESIGN_CENTER'
  | 'HYDRAULIC_CALCULATION'
  | 'ENGINEER_INPUT'
  | 'DRAWING';

export interface UnderConstructionStudySystem {
  /** Explicit engineer decision; absent means applicability has not been decided. */
  applicable?: boolean;
  /** Required according to the selected code / approved design; no automatic wording. */
  code_requirement?: string;
  code_reference?: string;
  /** Selected engineering solution. It is not a duplicate of a canonical source value. */
  selected_solution?: string;
  /** Named drawing or approved-design reference entered by the engineer. */
  drawing_reference?: string;
  /** Named hydraulic calculation reference, if relevant. Never stores the calculation result. */
  calculation_reference?: string;
  /** Implementation instruction decided by the engineer. */
  implementation_note?: string;
}

export interface UnderConstructionCodeReference {
  id: string;
  title: string;
  reference: string;
  note?: string;
}

/** Optional, additive canonical live state. Absence remains valid for legacy projects. */
export interface UnderConstructionStudy {
  version: 1;
  /** Engineer wording about the scope; project facts are displayed from sources, not copied here. */
  project_description?: string;
  code_references?: UnderConstructionCodeReference[];
  systems: Partial<Record<UnderConstructionSystemKey, UnderConstructionStudySystem>>;
  general_implementation_notes?: string;
}

export type UnderConstructionSystemDefinition = {
  key: UnderConstructionSystemKey;
  label: string;
  group: 'project' | 'egress' | 'firefighting' | 'alarm' | 'mechanical_electrical';
};

export const UNDER_CONSTRUCTION_SYSTEM_DEFINITIONS: UnderConstructionSystemDefinition[] = [
  { key: 'fire_truck_access', label: 'وصول آليات الدفاع المدني', group: 'egress' },
  { key: 'entrances', label: 'المداخل والوصول إلى المبنى', group: 'egress' },
  { key: 'emergency_exits', label: 'مخارج الطوارئ', group: 'egress' },
  { key: 'egress_routes', label: 'مسالك الهروب', group: 'egress' },
  { key: 'exit_width', label: 'عرض المخارج عند الحاجة', group: 'egress' },
  { key: 'travel_distance', label: 'مسافات الانتقال عند الحاجة', group: 'egress' },
  { key: 'emergency_lighting', label: 'إنارة الطوارئ', group: 'egress' },
  { key: 'exit_signs', label: 'لوحات مخارج الطوارئ', group: 'egress' },
  { key: 'fire_water_source', label: 'مصدر مياه الحريق', group: 'firefighting' },
  { key: 'fire_tank', label: 'خزان الحريق', group: 'firefighting' },
  { key: 'electric_fire_pump', label: 'مضخة الحريق الكهربائية', group: 'firefighting' },
  { key: 'diesel_fire_pump', label: 'مضخة الحريق الديزل', group: 'firefighting' },
  { key: 'jockey_fire_pump', label: 'مضخة الجوكي', group: 'firefighting' },
  { key: 'standpipe', label: 'المواسير الرأسية', group: 'firefighting' },
  { key: 'hose_reel_hydrant', label: 'بكرات الحريق / صنابير الحريق', group: 'firefighting' },
  { key: 'sprinkler_system', label: 'نظام الرش الآلي', group: 'firefighting' },
  { key: 'fdc', label: 'وصلة الدفاع المدني (FDC)', group: 'firefighting' },
  { key: 'special_suppression', label: 'أنظمة الإطفاء الخاصة', group: 'firefighting' },
  { key: 'portable_extinguishers', label: 'الطفايات اليدوية', group: 'firefighting' },
  { key: 'fire_alarm_system', label: 'نظام إنذار الحريق', group: 'alarm' },
  { key: 'facp', label: 'لوحة التحكم FACP', group: 'alarm' },
  { key: 'panel_locations', label: 'مواقع لوحات الإنذار', group: 'alarm' },
  { key: 'smoke_detectors', label: 'كواشف الدخان', group: 'alarm' },
  { key: 'heat_detectors', label: 'كواشف الحرارة', group: 'alarm' },
  { key: 'manual_call_points', label: 'نقاط النداء اليدوية', group: 'alarm' },
  { key: 'notification_devices', label: 'أجهزة التنبيه', group: 'alarm' },
  { key: 'voice_evacuation', label: 'الإخلاء الصوتي عند الانطباق', group: 'alarm' },
  { key: 'alarm_interfaces', label: 'واجهات وربط الإنذار', group: 'alarm' },
  { key: 'mechanical_ventilation', label: 'التهوية الميكانيكية', group: 'mechanical_electrical' },
  { key: 'smoke_control', label: 'التحكم بالدخان عند الانطباق', group: 'mechanical_electrical' },
  { key: 'emergency_power', label: 'القدرة الاحتياطية', group: 'mechanical_electrical' },
  { key: 'grounding', label: 'التأريض الكهربائي', group: 'mechanical_electrical' },
  { key: 'lightning_protection', label: 'الحماية من الصواعق', group: 'mechanical_electrical' },
];

export const UNDER_CONSTRUCTION_STUDY_GROUPS = [
  { id: 'project', label: 'بيانات المشروع والمراجع' },
  { id: 'egress', label: 'الوصول والإخلاء' },
  { id: 'firefighting', label: 'أنظمة مكافحة الحريق' },
  { id: 'alarm', label: 'نظام إنذار الحريق' },
  { id: 'mechanical_electrical', label: 'السلامة الميكانيكية والكهربائية' },
].map((group) => ({
  ...group,
  systems: UNDER_CONSTRUCTION_SYSTEM_DEFINITIONS.filter((system) => system.group === group.id),
}));

export const UNDER_CONSTRUCTION_SOURCE_LABELS: Record<UnderConstructionReferenceSource, string> = {
  PROJECT: 'بيانات المشروع',
  BUILDING_PLAN: 'معلومات المخطط',
  DESIGN_CENTER: 'مركز التصاميم',
  HYDRAULIC_CALCULATION: 'الحساب الهيدروليكي',
  ENGINEER_INPUT: 'إدخال المهندس المعتمد',
  DRAWING: 'المخططات المرفقة',
};

export type UnderConstructionSourceReference = {
  label: string;
  value: string;
  source: UnderConstructionReferenceSource;
  reference?: string;
};

const SYSTEM_KEYS = new Set<string>(UNDER_CONSTRUCTION_SYSTEMS);

function cleanText(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function uniqueText(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(cleanText).filter((item): item is string => Boolean(item)))];
}

function normalizeSystem(value: unknown): UnderConstructionStudySystem | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const source = value as Record<string, unknown>;
  const normalized: UnderConstructionStudySystem = {
    ...(typeof source.applicable === 'boolean' ? { applicable: source.applicable } : {}),
    ...(cleanText(source.code_requirement) ? { code_requirement: cleanText(source.code_requirement) } : {}),
    ...(cleanText(source.code_reference) ? { code_reference: cleanText(source.code_reference) } : {}),
    ...(cleanText(source.selected_solution) ? { selected_solution: cleanText(source.selected_solution) } : {}),
    ...(cleanText(source.drawing_reference) ? { drawing_reference: cleanText(source.drawing_reference) } : {}),
    ...(cleanText(source.calculation_reference) ? { calculation_reference: cleanText(source.calculation_reference) } : {}),
    ...(cleanText(source.implementation_note) ? { implementation_note: cleanText(source.implementation_note) } : {}),
  };
  return Object.keys(normalized).length ? normalized : undefined;
}

function normalizeCodeReferences(value: unknown): UnderConstructionCodeReference[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const normalized = value.flatMap((candidate, index) => {
    if (!candidate || typeof candidate !== 'object') return [];
    const source = candidate as Record<string, unknown>;
    const title = cleanText(source.title);
    const reference = cleanText(source.reference);
    if (!title && !reference) return [];
    return [{
      id: cleanText(source.id) || `code-ref-${index + 1}`,
      title: title || 'مرجع كودي',
      reference: reference || '',
      ...(cleanText(source.note) ? { note: cleanText(source.note) } : {}),
    }];
  });
  return normalized.length ? normalized : undefined;
}

/** Safe additive normalization; never seeds systems, requirements, solutions, or conclusions. */
export function normalizeUnderConstructionStudy(value: unknown): UnderConstructionStudy | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const source = value as Record<string, unknown>;
  const rawSystems = source.systems;
  const systems: UnderConstructionStudy['systems'] = {};
  if (rawSystems && typeof rawSystems === 'object' && !Array.isArray(rawSystems)) {
    for (const [key, item] of Object.entries(rawSystems as Record<string, unknown>)) {
      if (!SYSTEM_KEYS.has(key)) continue;
      const normalized = normalizeSystem(item);
      if (normalized) systems[key as UnderConstructionSystemKey] = normalized;
    }
  }
  const code_references = normalizeCodeReferences(source.code_references);
  const project_description = cleanText(source.project_description);
  const general_implementation_notes = cleanText(source.general_implementation_notes);
  if (!Object.keys(systems).length && !code_references && !project_description && !general_implementation_notes) {
    return undefined;
  }
  return {
    version: 1,
    systems,
    ...(project_description ? { project_description } : {}),
    ...(code_references ? { code_references } : {}),
    ...(general_implementation_notes ? { general_implementation_notes } : {}),
  };
}

function textValue(value: unknown): string | null {
  if (typeof value === 'string') return value.trim() || null;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
}

function yesNo(value: unknown): string | null {
  if (value === 'yes' || value === 'نعم') return 'نعم';
  if (value === 'no' || value === 'لا') return 'لا';
  return null;
}

function measured(value: { value: number | null; unit: string; source: ValueSource } | null | undefined): string | null {
  return value?.value == null || !Number.isFinite(value.value) ? null : `${value.value} ${value.unit}`;
}

function sourceFromValueSource(value: ValueSource | undefined): UnderConstructionReferenceSource {
  if (value === 'hydraulic_calc' || value === 'calculated') return 'HYDRAULIC_CALCULATION';
  if (value === 'project_drawings') return 'DRAWING';
  return 'ENGINEER_INPUT';
}

function reference(
  label: string,
  value: unknown,
  source: UnderConstructionReferenceSource,
  detail?: string
): UnderConstructionSourceReference[] {
  const normalized = textValue(value);
  return normalized ? [{ label, value: normalized, source, ...(detail ? { reference: detail } : {}) }] : [];
}

function supportingReference(
  label: string,
  state: { status: string; note?: string; source?: ValueSource }
): UnderConstructionSourceReference[] {
  if (state.status === 'unknown') return [];
  return reference(
    label,
    [state.status, state.note].filter(Boolean).join(' · '),
    sourceFromValueSource(state.source),
    state.source ? VALUE_SOURCE_LABEL_AR[state.source] : undefined
  );
}

function spaceSafetyTotals(data: ProjectEngineeringData) {
  const floors = data.design_center.space_safety?.floors || [];
  return floors.reduce(
    (acc, floor) => {
      for (const area of floor.areas || []) {
        acc.area_m2 += Number(area.area_m2) || 0;
        acc.sprinklers += Number(area.quantities.sprinklers) || 0;
        acc.smoke_detectors += Number(area.quantities.smoke_detectors) || 0;
        acc.heat_detectors += Number(area.quantities.heat_detectors) || 0;
        acc.fire_alarm_panels += Number(area.quantities.fire_alarm_panels) || 0;
        acc.alarm_bells += Number(area.quantities.alarm_bells) || 0;
        acc.emergency_lights += Number(area.quantities.emergency_lights) || 0;
        acc.exit_signs += Number(area.quantities.signs) || 0;
        acc.emergency_exits += Number(area.quantities.emergency_exits) || 0;
        acc.manual_extinguishers += Number(area.quantities.manual_extinguishers) || 0;
        acc.max_travel_distance_m = Math.max(acc.max_travel_distance_m, Number(area.max_travel_distance_m) || 0);
      }
      return acc;
    },
    {
      area_m2: 0,
      sprinklers: 0,
      smoke_detectors: 0,
      heat_detectors: 0,
      fire_alarm_panels: 0,
      alarm_bells: 0,
      emergency_lights: 0,
      exit_signs: 0,
      emergency_exits: 0,
      manual_extinguishers: 0,
      max_travel_distance_m: 0,
    }
  );
}

/** Project/design facts read from canonical sources only. Nothing returned here is persisted into the study. */
export function resolveUnderConstructionProjectReferences(
  client: Pick<ClientRecord, 'name' | 'business_name' | 'owner_name' | 'city' | 'district' | 'activity_type' | 'building_area' | 'floors_count'>,
  data: ProjectEngineeringData
): UnderConstructionSourceReference[] {
  const plan = data.building_plan;
  const design = data.fire_protection_design || EMPTY_FIRE_PROTECTION_DESIGN;
  const totals = spaceSafetyTotals(data);
  return [
    ...reference('اسم المشروع / المنشأة', client.business_name || client.name, 'PROJECT'),
    ...reference('المالك', client.owner_name, 'PROJECT'),
    ...reference('الموقع', [client.city, client.district].filter(Boolean).join(' · '), 'PROJECT'),
    ...reference('الاستخدام / الإشغال', plan.occupancy_classification || plan.building_use || client.activity_type, 'BUILDING_PLAN'),
    ...reference('عدد الأدوار', plan.licensed_floor_count ?? client.floors_count, 'BUILDING_PLAN'),
    ...reference('مساحة البناء', totals.area_m2 || plan.total_site_area_m2 || client.building_area, totals.area_m2 ? 'DESIGN_CENTER' : 'BUILDING_PLAN'),
    ...reference('وصف الأدوار', plan.floors_description, 'BUILDING_PLAN'),
    ...reference('نوع البناء', plan.building_type_code, 'BUILDING_PLAN'),
    ...reference('الأكواد والمراجع المتاحة', design.applicable_codes.join(' · '), 'ENGINEER_INPUT', 'fire_protection_design.applicable_codes'),
  ];
}

/**
 * Source-side values for a single study system. The study may cite them, but
 * never writes them back or stores duplicate hydraulic/design values.
 */
export function resolveUnderConstructionSystemReferences(
  data: ProjectEngineeringData,
  key: UnderConstructionSystemKey
): UnderConstructionSourceReference[] {
  const plan = data.building_plan;
  const design = data.fire_protection_design || EMPTY_FIRE_PROTECTION_DESIGN;
  const totals = spaceSafetyTotals(data);
  const designRef = (label: string, value: unknown, source: ValueSource | undefined) =>
    reference(label, value, sourceFromValueSource(source), source ? VALUE_SOURCE_LABEL_AR[source] : undefined);
  const quantityRef = (label: string, value: number) => value ? reference(label, value, 'DESIGN_CENTER') : [];

  switch (key) {
    case 'fire_truck_access':
      return [
        ...designRef('مدخل الموقع', design.fire_truck_access.site_entrance, design.fire_truck_access.source),
        ...designRef('طريق مركبات الإطفاء', design.fire_truck_access.fire_road, design.fire_truck_access.source),
        ...designRef('عرض الطريق (م)', design.fire_truck_access.road_width_m, design.fire_truck_access.source),
        ...designRef('الوصول إلى المبنى', design.fire_truck_access.building_access, design.fire_truck_access.source),
      ];
    case 'entrances':
      return designRef('مدخل الموقع', design.fire_truck_access.site_entrance, design.fire_truck_access.source);
    case 'emergency_exits':
      return [
        ...reference('عدد المخارج بالمخطط', plan.exits_count || plan.emergency_exits_doors, 'BUILDING_PLAN'),
        ...quantityRef('مخارج الطوارئ حسب مركز التصاميم', totals.emergency_exits),
      ];
    case 'egress_routes':
      return designRef('ملاحظات الإخلاء', design.egress.notes, 'engineer_input');
    case 'exit_width':
      return design.egress.metrics
        .filter((metric) => /عرض/i.test(metric.label))
        .flatMap((metric) => designRef(metric.label, metric.value, metric.source));
    case 'travel_distance':
      return [
        ...design.egress.metrics
          .filter((metric) => /مسافة|travel/i.test(metric.label))
          .flatMap((metric) => designRef(metric.label, metric.value, metric.source)),
        ...quantityRef('أقصى مسافة انتقال بالمركز (م)', totals.max_travel_distance_m),
      ];
    case 'emergency_lighting':
      return [
        ...supportingReference('حالة إنارة الطوارئ في التصميم', design.supporting_systems.emergency_lighting),
        ...quantityRef('إنارة الطوارئ حسب مركز التصاميم', totals.emergency_lights),
      ];
    case 'exit_signs':
      return [
        ...supportingReference('حالة لوحات المخارج في التصميم', design.supporting_systems.exit_signs),
        ...quantityRef('لوحات المخارج حسب مركز التصاميم', totals.exit_signs),
      ];
    case 'fire_water_source':
      return [
        ...designRef('مصدر المياه', design.water_supply.water_source, 'engineer_input'),
        ...designRef('نوع الخزان', design.water_supply.tank_type, 'engineer_input'),
      ];
    case 'fire_tank':
      return [
        ...designRef('وجود الخزان', yesNo(design.water_tank.exists), design.water_tank.source),
        ...designRef('سعة الخزان', measured(design.water_tank.capacity_m3), design.water_tank.capacity_m3.source),
        ...designRef('حجم الخزان النظري', design.water_tank.calculated_required_volume_m3 == null ? null : `${design.water_tank.calculated_required_volume_m3} م³`, design.water_tank.source),
      ];
    case 'electric_fire_pump':
      return [
        ...designRef('وجود المضخة الكهربائية', yesNo(design.pump.exists), design.pump.source),
        ...designRef('التدفق المقنن', measured(design.pump.rated_flow), design.pump.rated_flow.source),
        ...designRef('الضغط المقنن', measured(design.pump.rated_pressure), design.pump.rated_pressure.source),
      ];
    case 'diesel_fire_pump':
      return [
        ...designRef('وجود مضخة الديزل', yesNo(design.diesel_pump.exists), design.diesel_pump.source),
        ...designRef('التدفق', measured(design.diesel_pump.capacity), design.diesel_pump.capacity.source),
        ...designRef('الضغط', measured(design.diesel_pump.pressure), design.diesel_pump.pressure.source),
      ];
    case 'jockey_fire_pump':
      return [
        ...designRef('وجود مضخة الجوكي', yesNo(design.jockey_pump.exists), design.jockey_pump.source),
        ...designRef('التدفق', measured(design.jockey_pump.capacity), design.jockey_pump.capacity.source),
        ...designRef('الضغط', measured(design.jockey_pump.pressure), design.jockey_pump.pressure.source),
      ];
    case 'standpipe':
      return [
        ...designRef('المطلوب حسب التصميم', yesNo(design.standpipe.required), design.standpipe.source),
        ...designRef('ملاحظات التصميم', design.standpipe.notes, design.standpipe.source),
      ];
    case 'sprinkler_system':
      return [
        ...designRef('النظام مطلوب', yesNo(design.sprinkler.required), design.sprinkler.source),
        ...designRef('نوع النظام', design.sprinkler.system_type, design.sprinkler.source),
        ...designRef('تصنيف الخطورة', design.occupancy.hazard_class, design.occupancy.source),
        ...designRef('نوع المرشات', design.sprinkler.sprinkler_type, design.sprinkler.source),
        ...designRef('K-Factor', design.sprinkler.k_factor, design.sprinkler.source),
        ...designRef('ضغط التصميم', design.sprinkler.design_pressure, design.sprinkler.source),
        ...designRef('تدفق التصميم', design.sprinkler.design_flow, design.sprinkler.source),
        ...designRef('عدد المناطق', design.sprinkler.zones_count, design.sprinkler.source),
        ...quantityRef('عدد المرشات حسب مركز التصاميم', totals.sprinklers),
      ];
    case 'fdc':
      return [
        ...designRef('وصلة الدفاع المدني', design.fire_truck_access.civil_defense_connection, design.fire_truck_access.source),
        ...designRef('موقع الوصلة', design.fire_truck_access.connection_location, design.fire_truck_access.source),
      ];
    case 'portable_extinguishers':
      return [
        ...quantityRef('عدد الطفايات حسب مركز التصاميم', totals.manual_extinguishers),
        ...design.extinguishers.flatMap((item) => designRef('طفاية مصممة', [item.type, item.count, item.location, item.rating].filter(Boolean).join(' · '), 'engineer_input')),
      ];
    case 'fire_alarm_system':
      return reference('النظام حسب معلومات المخطط', yesNo(plan.fire_alarm_system), 'BUILDING_PLAN');
    case 'facp':
      return designRef('لوحة التحكم', design.fire_alarm.control_panel, design.fire_alarm.source);
    case 'panel_locations':
      return [
        ...designRef('مواقع اللوحات', design.fire_alarm.notes, design.fire_alarm.source),
        ...quantityRef('لوحات الإنذار حسب مركز التصاميم', totals.fire_alarm_panels),
      ];
    case 'smoke_detectors':
      return [
        ...designRef('مواصفات كواشف الدخان', design.fire_alarm.smoke_detectors, design.fire_alarm.source),
        ...quantityRef('كواشف الدخان حسب مركز التصاميم', totals.smoke_detectors),
      ];
    case 'heat_detectors':
      return [
        ...designRef('مواصفات كواشف الحرارة', design.fire_alarm.heat_detectors, design.fire_alarm.source),
        ...quantityRef('كواشف الحرارة حسب مركز التصاميم', totals.heat_detectors),
      ];
    case 'manual_call_points':
      return designRef('نقاط النداء اليدوية', design.fire_alarm.manual_call_points, design.fire_alarm.source);
    case 'notification_devices':
      return [
        ...designRef('أجهزة التنبيه', design.fire_alarm.bells, design.fire_alarm.source),
        ...quantityRef('أجهزة التنبيه حسب مركز التصاميم', totals.alarm_bells),
      ];
    case 'voice_evacuation':
      return designRef('الإخلاء الصوتي', design.fire_alarm.voice_alarm, design.fire_alarm.source);
    case 'alarm_interfaces':
      return designRef('واجهات الربط', design.fire_alarm.integration, design.fire_alarm.source);
    case 'mechanical_ventilation':
      return supportingReference('التهوية الميكانيكية', design.supporting_systems.ventilation);
    case 'smoke_control':
      return supportingReference('التحكم بالدخان', design.supporting_systems.smoke_control);
    case 'emergency_power':
      return [
        ...supportingReference('القدرة الاحتياطية في التصميم', design.supporting_systems.emergency_power),
        ...reference('المولد الاحتياطي بالمخطط', yesNo(plan.backup_generator), 'BUILDING_PLAN'),
      ];
    case 'grounding':
      return reference('التأريض بالمخطط', yesNo(plan.electrical_grounding), 'BUILDING_PLAN');
    case 'lightning_protection':
      return reference('الحماية من الصواعق بالمخطط', yesNo(plan.lightning_protection), 'BUILDING_PLAN');
    default:
      return [];
  }
}

export function underConstructionGroupLabel(group: UnderConstructionSystemDefinition['group']): string {
  return {
    project: 'بيانات المشروع والمراجع',
    egress: 'الوصول والإخلاء',
    firefighting: 'أنظمة مكافحة الحريق',
    alarm: 'نظام إنذار الحريق',
    mechanical_electrical: 'السلامة الميكانيكية والكهربائية',
  }[group];
}

/** Mentioned to make clear that this payload accepts manual drawing identifiers only. */
export function normalizeUnderConstructionDrawingReferences(value: unknown): string[] {
  return uniqueText(value);
}
