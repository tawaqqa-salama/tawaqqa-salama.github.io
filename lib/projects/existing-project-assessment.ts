import type { ProjectEngineeringData } from '@/lib/types/project-reports';
import { spaceSafetyTotals } from '@/lib/projects/design-space-safety-totals';
import { humanizeEngineeringDisplayValue } from '@/lib/projects/preview-display';

/**
 * Canonical, engineer-entered assessment for an EXISTING project. The observed
 * condition is deliberately separate from requirement-side data, which remains
 * read-only and is resolved from existing canonical plan/design sources.
 */
export const EXISTING_ASSESSMENT_SYSTEMS = [
  'fire_truck_access',
  'fdc',
  'fire_water_source',
  'fire_tank',
  'fire_pumps',
  'standpipe',
  'hose_reel_hydrant',
  'sprinkler_system',
  'special_suppression',
  'fire_extinguishers',
  'mechanical_ventilation',
  'smoke_control',
  'fire_alarm_control_panel',
  'smoke_detectors',
  'heat_detectors',
  'manual_call_points',
  'alarm_notification_devices',
  'voice_evacuation',
  'emergency_lighting',
  'exit_signs',
  'means_of_egress',
  'electrical_safety',
  'grounding',
  'lightning_protection',
  'emergency_power',
] as const;

export type ExistingAssessmentSystemKey = (typeof EXISTING_ASSESSMENT_SYSTEMS)[number];

export type ExistingAssessmentComplianceStatus =
  | 'COMPLIANT'
  | 'NON_COMPLIANT'
  | 'NEEDS_COMPLETION'
  | 'NOT_APPLICABLE';

export type ExistingAssessmentPresence = 'PRESENT' | 'ABSENT' | 'UNKNOWN';
export type ExistingAssessmentCondition = 'GOOD' | 'FAIR' | 'POOR' | 'UNKNOWN';
export type ExistingAssessmentPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface ExistingAssessmentObservedSpec {
  id: string;
  label: string;
  value: string;
}

export interface ExistingAssessmentSystem {
  /** Explicit engineer decision. Absence means applicability has not been assessed. */
  applicable?: boolean;
  existing_presence?: ExistingAssessmentPresence;
  observed_configuration?: string;
  observed_specs?: ExistingAssessmentObservedSpec[];
  condition?: ExistingAssessmentCondition;
  observation?: string;
  /** References only; this phase neither uploads nor manages evidence. */
  evidence_ids?: string[];
  /** Manual requirement text only when no canonical design/plan requirement is available. */
  required_text?: string;
  requirement_source?: string;
  requirement_reference?: string;
  gap_text?: string;
  /** Never inferred: the engineer must explicitly choose any conclusion. */
  compliance_status?: ExistingAssessmentComplianceStatus;
  action_text?: string;
  priority?: ExistingAssessmentPriority;
  responsible_party?: string;
  recommendation_id?: string | null;
}

/** Additive live-payload state. Its absence is valid for legacy and new projects. */
export interface ExistingProjectAssessment {
  version: 1;
  systems: Partial<Record<ExistingAssessmentSystemKey, ExistingAssessmentSystem>>;
}

export type ExistingAssessmentSystemDefinition = {
  key: ExistingAssessmentSystemKey;
  label: string;
  group: 'site' | 'firefighting' | 'alarm' | 'life_safety' | 'electrical';
};

export const EXISTING_ASSESSMENT_SYSTEM_DEFINITIONS: ExistingAssessmentSystemDefinition[] = [
  { key: 'fire_truck_access', label: 'وصول سيارات الإطفاء والموقع', group: 'site' },
  { key: 'fdc', label: 'وصلة الدفاع المدني (FDC)', group: 'site' },
  { key: 'fire_water_source', label: 'مصدر مياه الحريق', group: 'firefighting' },
  { key: 'fire_tank', label: 'خزان مياه الحريق', group: 'firefighting' },
  { key: 'fire_pumps', label: 'مضخات الحريق', group: 'firefighting' },
  { key: 'standpipe', label: 'المواسير الرأسية', group: 'firefighting' },
  { key: 'hose_reel_hydrant', label: 'بكرات الحريق / صنابير الحريق', group: 'firefighting' },
  { key: 'sprinkler_system', label: 'نظام الرش الآلي', group: 'firefighting' },
  { key: 'special_suppression', label: 'أنظمة الإطفاء الخاصة', group: 'firefighting' },
  { key: 'fire_extinguishers', label: 'الطفايات اليدوية', group: 'firefighting' },
  { key: 'mechanical_ventilation', label: 'التهوية الميكانيكية', group: 'life_safety' },
  { key: 'smoke_control', label: 'التحكم بالدخان', group: 'life_safety' },
  { key: 'fire_alarm_control_panel', label: 'لوحة التحكم بإنذار الحريق', group: 'alarm' },
  { key: 'smoke_detectors', label: 'كواشف الدخان', group: 'alarm' },
  { key: 'heat_detectors', label: 'كواشف الحرارة', group: 'alarm' },
  { key: 'manual_call_points', label: 'نقاط النداء اليدوية', group: 'alarm' },
  { key: 'alarm_notification_devices', label: 'أجهزة التنبيه والإنذار', group: 'alarm' },
  { key: 'voice_evacuation', label: 'الإخلاء الصوتي عند الانطباق', group: 'alarm' },
  { key: 'emergency_lighting', label: 'إنارة الطوارئ', group: 'life_safety' },
  { key: 'exit_signs', label: 'لوحات مخارج الطوارئ', group: 'life_safety' },
  { key: 'means_of_egress', label: 'وسائل ومخارج الهروب', group: 'life_safety' },
  { key: 'electrical_safety', label: 'السلامة الكهربائية', group: 'electrical' },
  { key: 'grounding', label: 'التأريض الكهربائي', group: 'electrical' },
  { key: 'lightning_protection', label: 'الحماية من الصواعق', group: 'electrical' },
  { key: 'emergency_power', label: 'مصدر القدرة الاحتياطي', group: 'electrical' },
];

export const EXISTING_ASSESSMENT_COMPLIANCE_STATUS_VALUES: ExistingAssessmentComplianceStatus[] = [
  'COMPLIANT',
  'NON_COMPLIANT',
  'NEEDS_COMPLETION',
  'NOT_APPLICABLE',
];

export const EXISTING_ASSESSMENT_STATUS_LABELS: Record<ExistingAssessmentComplianceStatus, string> = {
  COMPLIANT: 'مطابق',
  NON_COMPLIANT: 'غير مطابق',
  NEEDS_COMPLETION: 'يحتاج استكمال',
  NOT_APPLICABLE: 'غير منطبق',
};

export const EXISTING_ASSESSMENT_PRESENCE_LABELS: Record<ExistingAssessmentPresence, string> = {
  PRESENT: 'موجود',
  ABSENT: 'غير موجود',
  UNKNOWN: 'غير متحقق',
};

export const EXISTING_ASSESSMENT_CONDITION_LABELS: Record<ExistingAssessmentCondition, string> = {
  GOOD: 'جيدة',
  FAIR: 'متوسطة',
  POOR: 'ضعيفة',
  UNKNOWN: 'لم تُقيّم',
};

export const EXISTING_ASSESSMENT_PRIORITY_LABELS: Record<ExistingAssessmentPriority, string> = {
  LOW: 'منخفضة',
  MEDIUM: 'متوسطة',
  HIGH: 'عالية',
  CRITICAL: 'حرجة',
};

export const EXISTING_ASSESSMENT_GROUPS = [
  { id: 'site', label: 'الموقع والوصول' },
  { id: 'firefighting', label: 'أنظمة مكافحة الحريق' },
  { id: 'alarm', label: 'أنظمة الإنذار والإخلاء الصوتي' },
  { id: 'life_safety', label: 'سلامة الحياة والإخلاء' },
  { id: 'electrical', label: 'السلامة الكهربائية والقدرة' },
].map((group) => ({
  ...group,
  systems: EXISTING_ASSESSMENT_SYSTEM_DEFINITIONS.filter((system) => system.group === group.id),
}));

const PRESENCE_VALUES = new Set<ExistingAssessmentPresence>(['PRESENT', 'ABSENT', 'UNKNOWN']);
const CONDITION_VALUES = new Set<ExistingAssessmentCondition>(['GOOD', 'FAIR', 'POOR', 'UNKNOWN']);
const COMPLIANCE_VALUES = new Set<ExistingAssessmentComplianceStatus>([
  'COMPLIANT',
  'NON_COMPLIANT',
  'NEEDS_COMPLETION',
  'NOT_APPLICABLE',
]);
const PRIORITY_VALUES = new Set<ExistingAssessmentPriority>(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);
const SYSTEM_KEYS = new Set<string>(EXISTING_ASSESSMENT_SYSTEMS);

function text(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function optionalEnum<T extends string>(value: unknown, allowed: Set<T>): T | undefined {
  return typeof value === 'string' && allowed.has(value as T) ? (value as T) : undefined;
}

function referenceList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const unique = [...new Set(value.map(text).filter((item): item is string => Boolean(item)))];
  return unique.length ? unique : undefined;
}

function normalizeObservedSpecs(value: unknown): ExistingAssessmentObservedSpec[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items = value.flatMap((candidate, index) => {
    if (!candidate || typeof candidate !== 'object') return [];
    const source = candidate as Record<string, unknown>;
    const label = text(source.label);
    const specValue = text(source.value);
    if (!label && !specValue) return [];
    return [{ id: text(source.id) || `spec-${index + 1}`, label: label || 'مواصفة مرصودة', value: specValue || '' }];
  });
  return items.length ? items : undefined;
}

function normalizeSystem(value: unknown): ExistingAssessmentSystem | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const source = value as Record<string, unknown>;
  const normalized: ExistingAssessmentSystem = {
    ...(typeof source.applicable === 'boolean' ? { applicable: source.applicable } : {}),
    ...(optionalEnum(source.existing_presence, PRESENCE_VALUES)
      ? { existing_presence: optionalEnum(source.existing_presence, PRESENCE_VALUES) }
      : {}),
    ...(text(source.observed_configuration) ? { observed_configuration: text(source.observed_configuration) } : {}),
    ...(normalizeObservedSpecs(source.observed_specs) ? { observed_specs: normalizeObservedSpecs(source.observed_specs) } : {}),
    ...(optionalEnum(source.condition, CONDITION_VALUES)
      ? { condition: optionalEnum(source.condition, CONDITION_VALUES) }
      : {}),
    ...(text(source.observation) ? { observation: text(source.observation) } : {}),
    ...(referenceList(source.evidence_ids) ? { evidence_ids: referenceList(source.evidence_ids) } : {}),
    ...(text(source.required_text) ? { required_text: text(source.required_text) } : {}),
    ...(text(source.requirement_source) ? { requirement_source: text(source.requirement_source) } : {}),
    ...(text(source.requirement_reference) ? { requirement_reference: text(source.requirement_reference) } : {}),
    ...(text(source.gap_text) ? { gap_text: text(source.gap_text) } : {}),
    ...(optionalEnum(source.compliance_status, COMPLIANCE_VALUES)
      ? { compliance_status: optionalEnum(source.compliance_status, COMPLIANCE_VALUES) }
      : {}),
    ...(text(source.action_text) ? { action_text: text(source.action_text) } : {}),
    ...(optionalEnum(source.priority, PRIORITY_VALUES)
      ? { priority: optionalEnum(source.priority, PRIORITY_VALUES) }
      : {}),
    ...(text(source.responsible_party) ? { responsible_party: text(source.responsible_party) } : {}),
    ...(source.recommendation_id === null || text(source.recommendation_id)
      ? { recommendation_id: source.recommendation_id === null ? null : text(source.recommendation_id) }
      : {}),
  };
  return Object.keys(normalized).length ? normalized : undefined;
}

/** Normalizes additive persisted state only; it never supplies defaults or conclusions. */
export function normalizeExistingProjectAssessment(value: unknown): ExistingProjectAssessment | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const rawSystems = (value as { systems?: unknown }).systems;
  if (!rawSystems || typeof rawSystems !== 'object' || Array.isArray(rawSystems)) return undefined;
  const systems: ExistingProjectAssessment['systems'] = {};
  for (const [key, system] of Object.entries(rawSystems as Record<string, unknown>)) {
    if (!SYSTEM_KEYS.has(key)) continue;
    const normalized = normalizeSystem(system);
    if (normalized) systems[key as ExistingAssessmentSystemKey] = normalized;
  }
  return Object.keys(systems).length ? { version: 1, systems } : undefined;
}

export type ExistingAssessmentRequirement = {
  text: string;
  source: string;
  reference: string;
};

function joined(parts: Array<string | null | undefined>): string | null {
  const clean = parts
    .map((value) => humanizeEngineeringDisplayValue(value) || null)
    .filter((value): value is string => Boolean(value));
  return clean.length ? clean.join(' · ') : null;
}

function sourceRequirement(textValue: string | null, source: string, reference: string): ExistingAssessmentRequirement | null {
  return textValue ? { text: textValue, source, reference } : null;
}

function measured(value: number | null | undefined, unit: string): string | null {
  return value == null || !Number.isFinite(value) ? null : `${value} ${unit}`;
}

/**
 * Requirement-side display only. No value from this function is ever persisted
 * back into existing_assessment, and none of these sources determines project
 * classification or compliance status.
 */
export function resolveExistingAssessmentRequirement(
  data: ProjectEngineeringData,
  key: ExistingAssessmentSystemKey
): ExistingAssessmentRequirement | null {
  const design = data.fire_protection_design;
  const plan = data.building_plan;
  const spaceSafety = spaceSafetyTotals(data.design_center.space_safety);
  if (!design) return null;

  const fromSupporting = (field: keyof typeof design.supporting_systems, label: string) => {
    const state = design.supporting_systems[field];
    const value = state.status === 'unknown' ? null : joined([label, state.note]);
    return sourceRequirement(value, 'fire_protection_design.supporting_systems', 'متطلبات التصميم الفني');
  };

  switch (key) {
    case 'fire_truck_access':
      return sourceRequirement(
        joined([design.fire_truck_access.site_entrance, design.fire_truck_access.fire_road, design.fire_truck_access.road_width_m ? `عرض الطريق ${design.fire_truck_access.road_width_m} م` : null, design.fire_truck_access.building_access]),
        'fire_protection_design.fire_truck_access',
        'بيانات الوصول ضمن التصميم الفني'
      );
    case 'fdc':
      return sourceRequirement(
        joined([design.fire_truck_access.civil_defense_connection, design.fire_truck_access.connection_location]),
        'fire_protection_design.fire_truck_access',
        'بيانات وصلة الدفاع المدني ضمن التصميم الفني'
      );
    case 'fire_water_source':
      return sourceRequirement(
        joined([design.water_supply.water_source, design.water_supply.tank_type, design.water_supply.tank_material]),
        'fire_protection_design.water_supply',
        'بيانات مصدر المياه ضمن التصميم الفني'
      );
    case 'fire_tank':
      return sourceRequirement(
        joined([
          design.water_tank.exists === 'unknown' ? null : design.water_tank.exists === 'yes' ? 'خزان حريق مطلوب/موجود في التصميم' : 'الخزان غير مطلوب في التصميم',
          measured(design.water_tank.capacity_m3.value, design.water_tank.capacity_m3.unit),
        ]),
        'fire_protection_design.water_tank',
        'بيانات الخزان ضمن التصميم الفني'
      );
    case 'fire_pumps':
      return sourceRequirement(
        joined([
          design.pump.exists === 'unknown' ? null : design.pump.exists === 'yes' ? 'مجموعة مضخات ضمن التصميم' : 'مجموعة المضخات غير مطلوبة في التصميم',
          measured(design.pump.rated_flow.value, design.pump.rated_flow.unit),
          measured(design.pump.rated_pressure.value, design.pump.rated_pressure.unit),
        ]),
        'fire_protection_design.pump',
        'بيانات المضخات ضمن التصميم الفني'
      );
    case 'standpipe':
      return sourceRequirement(
        joined([design.standpipe.required === 'unknown' ? null : design.standpipe.required === 'yes' ? 'المواسير الرأسية مطلوبة' : 'المواسير الرأسية غير مطلوبة', design.standpipe.notes]),
        'fire_protection_design.standpipe',
        'بيانات المواسير الرأسية ضمن التصميم الفني'
      );
    case 'sprinkler_system':
      return sourceRequirement(
        joined([
          design.sprinkler.required === 'unknown' ? null : design.sprinkler.required === 'yes' ? 'نظام رش آلي مطلوب' : 'نظام الرش غير مطلوب',
          design.sprinkler.system_type,
          design.sprinkler.sprinkler_type,
          design.sprinkler.k_factor ? `K-Factor ${design.sprinkler.k_factor}` : null,
          design.sprinkler.design_flow,
          design.sprinkler.design_pressure,
          design.sprinkler.zones_count ? `${design.sprinkler.zones_count} منطقة` : null,
          spaceSafety.sprinklers ? `عدد المرشات حسب مركز التصاميم ${spaceSafety.sprinklers}` : null,
        ]),
        'fire_protection_design.sprinkler',
        'بيانات الرش ضمن التصميم الفني ومركز التصاميم'
      );
    case 'fire_extinguishers':
      return sourceRequirement(
        design.extinguishers.length
          ? design.extinguishers.map((item) => joined([item.type, item.count ? `العدد ${item.count}` : null, item.location])).filter(Boolean).join('؛ ')
          : null,
        'fire_protection_design.extinguishers',
        'بيانات الطفايات ضمن التصميم الفني'
      );
    case 'fire_alarm_control_panel':
      return sourceRequirement(
        joined([design.fire_alarm.control_panel, spaceSafety.fire_alarm_panels ? `عدد لوحات الإنذار حسب مركز التصاميم ${spaceSafety.fire_alarm_panels}` : null]),
        'fire_protection_design.fire_alarm',
        'بيانات إنذار الحريق ضمن التصميم الفني ومركز التصاميم'
      );
    case 'smoke_detectors':
      return sourceRequirement(
        joined([design.fire_alarm.smoke_detectors, spaceSafety.smoke_detectors ? `عدد كواشف الدخان حسب مركز التصاميم ${spaceSafety.smoke_detectors}` : null]),
        'fire_protection_design.fire_alarm',
        'بيانات إنذار الحريق ضمن التصميم الفني ومركز التصاميم'
      );
    case 'heat_detectors':
      return sourceRequirement(
        joined([design.fire_alarm.heat_detectors, spaceSafety.heat_detectors ? `عدد كواشف الحرارة حسب مركز التصاميم ${spaceSafety.heat_detectors}` : null]),
        'fire_protection_design.fire_alarm',
        'بيانات إنذار الحريق ضمن التصميم الفني ومركز التصاميم'
      );
    case 'manual_call_points':
      return sourceRequirement(text(design.fire_alarm.manual_call_points) || null, 'fire_protection_design.fire_alarm', 'بيانات إنذار الحريق ضمن التصميم الفني');
    case 'alarm_notification_devices':
      return sourceRequirement(
        joined([design.fire_alarm.bells, spaceSafety.alarm_bells ? `عدد أجهزة التنبيه حسب مركز التصاميم ${spaceSafety.alarm_bells}` : null]),
        'fire_protection_design.fire_alarm',
        'بيانات إنذار الحريق ضمن التصميم الفني ومركز التصاميم'
      );
    case 'voice_evacuation':
      return sourceRequirement(text(design.fire_alarm.voice_alarm) || null, 'fire_protection_design.fire_alarm', 'بيانات إنذار الحريق ضمن التصميم الفني');
    case 'mechanical_ventilation':
      return fromSupporting('ventilation', 'التهوية الميكانيكية حسب التصميم');
    case 'smoke_control':
      return fromSupporting('smoke_control', 'التحكم بالدخان حسب التصميم');
    case 'emergency_lighting':
      return fromSupporting('emergency_lighting', 'إنارة الطوارئ حسب التصميم');
    case 'exit_signs':
      return fromSupporting('exit_signs', 'لوحات المخارج حسب التصميم');
    case 'electrical_safety':
      return fromSupporting('electrical_safety', 'السلامة الكهربائية حسب التصميم');
    case 'emergency_power':
      return fromSupporting('emergency_power', 'القدرة الاحتياطية حسب التصميم');
    case 'means_of_egress':
      return sourceRequirement(
        joined([design.egress.metrics.map((item) => joined([item.label, item.value, item.note])).filter(Boolean).join('؛ '), design.egress.notes]),
        'fire_protection_design.egress',
        'بيانات الإخلاء ضمن التصميم الفني'
      );
    case 'grounding':
      return sourceRequirement(text(plan.electrical_grounding) || null, 'building_plan.electrical_grounding', 'معلومة مخطط/بيانات المشروع');
    case 'lightning_protection':
      return sourceRequirement(text(plan.lightning_protection) || null, 'building_plan.lightning_protection', 'معلومة مخطط/بيانات المشروع');
    default:
      return null;
  }
}

export function existingAssessmentGroupLabel(group: ExistingAssessmentSystemDefinition['group']): string {
  return {
    site: 'الموقع والوصول',
    firefighting: 'أنظمة مكافحة الحريق',
    alarm: 'أنظمة الإنذار والإخلاء الصوتي',
    life_safety: 'سلامة الحياة والإخلاء',
    electrical: 'السلامة الكهربائية والقدرة',
  }[group];
}
