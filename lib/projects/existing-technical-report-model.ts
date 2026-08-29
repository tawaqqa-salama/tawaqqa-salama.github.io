import type { CompanyProfile } from '@/lib/company-profile';
import {
  EXISTING_ASSESSMENT_COMPLIANCE_STATUS_VALUES,
  EXISTING_ASSESSMENT_CONDITION_LABELS,
  EXISTING_ASSESSMENT_GROUPS,
  EXISTING_ASSESSMENT_PRESENCE_LABELS,
  EXISTING_ASSESSMENT_PRIORITY_LABELS,
  EXISTING_ASSESSMENT_STATUS_LABELS,
  resolveExistingAssessmentRequirement,
  type ExistingAssessmentComplianceStatus,
  type ExistingAssessmentSystem,
  type ExistingAssessmentSystemKey,
} from '@/lib/projects/existing-project-assessment';
import type { ClientRecord } from '@/lib/types/client';
import type { ProjectEngineeringData, TechnicalProjectRecommendation } from '@/lib/types/project-reports';
import {
  formatMeasured,
  type FireProtectionDesign,
  type MeasuredValue,
  type ValueSource,
} from '@/lib/types/fire-protection-design';
import { buildTechnicalReportSourceData } from '@/lib/projects/technical-report-source-data';
import { humanizeEngineeringDisplayValue } from '@/lib/projects/preview-display';

export type ExistingTechnicalReportStatus = ExistingAssessmentComplianceStatus | 'INCOMPLETE';

export type ExistingTechnicalReportEvidenceReference = {
  id: string;
  system_key: ExistingAssessmentSystemKey;
  system_label: string;
};

export type ExistingTechnicalReportSystemAssessment = {
  system_key: ExistingAssessmentSystemKey;
  system_label: string;
  applicable: boolean | null;
  existing_condition: string | null;
  required_condition: string | null;
  gap: string | null;
  compliance_status: ExistingTechnicalReportStatus;
  required_action: string | null;
  requirement_reference: string | null;
  requirement_source: string | null;
  evidence: ExistingTechnicalReportEvidenceReference[];
  notes: string | null;
  priority: string | null;
  recommendation_id: string | null;
};

export type ExistingTechnicalReportAssessmentSection = {
  id: string;
  label: string;
  systems: ExistingTechnicalReportSystemAssessment[];
};

export type ExistingTechnicalReportRecommendation = {
  id: string;
  text: string;
  system_key?: ExistingAssessmentSystemKey;
  system_label?: string;
  priority: string | null;
  source: 'ASSESSMENT_ACTION' | 'APPROVED_RECOMMENDATION';
};

export type ExistingTechnicalReportEngineeringSection = {
  id: string;
  label: string;
  rows: Array<{ label: string; value: string }>;
};

export type ExistingTechnicalReportApproval = {
  prepared_by: string | null;
  executive_director: string | null;
};

export type ExistingTechnicalReportModel = {
  project_identity: {
    project_code: string | null;
    project_classification: 'EXISTING';
  };
  approval: ExistingTechnicalReportApproval;
  project_information: {
    project_name: string;
    owner: string | null;
    location: string | null;
    report_number: string | null;
    report_date: string | null;
    consulting_office: string | null;
  };
  building_information: Array<{ label: string; value: string }>;
  occupancy_and_classification: Array<{ label: string; value: string }>;
  assessment_basis: Array<{ reference: string; source: string }>;
  engineering_sections: ExistingTechnicalReportEngineeringSection[];
  assessment_sections: ExistingTechnicalReportAssessmentSection[];
  summary: {
    total_assessed_systems: number;
    compliant: number;
    non_compliant: number;
    needs_completion: number;
    not_applicable: number;
  };
  recommendations: ExistingTechnicalReportRecommendation[];
  limitations: string[];
  evidence_references: ExistingTechnicalReportEvidenceReference[];
};

const INCOMPLETE_LABEL = 'لم يكتمل تقييم هذا البند.';

const AUTHORITATIVE_VALUE_SOURCES: ReadonlySet<ValueSource> = new Set([
  'engineer_input',
  'hydraulic_calc',
  'approved_value',
  'project_drawings',
]);

function cleanText(value: string | null | undefined): string | null {
  const result = value?.trim();
  return result || null;
}

function unique<T>(items: T[], key: (item: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const value = key(item);
    if (seen.has(value)) return false;
    seen.add(value);
    return true;
  });
}

function joinLines(items: Array<string | null | undefined>): string | null {
  const values = items.map((item) => cleanText(item)).filter((item): item is string => Boolean(item));
  return values.length ? values.join(' — ') : null;
}

function locationFromClient(client: ClientRecord): string | null {
  return joinLines([client.city, client.district, client.street, client.plot_number ? `قطعة ${client.plot_number}` : null]);
}

function valueRow(label: string, value: string | number | null | undefined): { label: string; value: string } | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number' && value === 0) return null;
  return { label, value: String(value) };
}

function observedCondition(system: ExistingAssessmentSystem): string | null {
  const specs = (system.observed_specs || [])
    .map((item) => joinLines([item.label, item.value]))
    .filter((item): item is string => Boolean(item));
  return joinLines([
    system.existing_presence ? EXISTING_ASSESSMENT_PRESENCE_LABELS[system.existing_presence] : null,
    system.observed_configuration,
    system.condition ? `الحالة: ${EXISTING_ASSESSMENT_CONDITION_LABELS[system.condition]}` : null,
    ...specs,
  ]);
}

function approvedRecommendations(data: ProjectEngineeringData): TechnicalProjectRecommendation[] {
  return (data.technical_report.recommendations_v2?.items || []).filter(
    (item) => item.status === 'approved' || item.status === 'edited'
  );
}

function reportSystem(
  key: ExistingAssessmentSystemKey,
  label: string,
  system: ExistingAssessmentSystem,
  data: ProjectEngineeringData
): ExistingTechnicalReportSystemAssessment {
  const canonicalRequirement = resolveExistingAssessmentRequirement(data, key);
  const requiredCondition = canonicalRequirement?.text || system.required_text || null;
  const requirementReference = canonicalRequirement?.reference || system.requirement_reference || null;
  const requirementSource = canonicalRequirement?.source || system.requirement_source || null;
  const evidence = (system.evidence_ids || []).map((id) => ({ id, system_key: key, system_label: label }));

  return {
    system_key: key,
    system_label: label,
    applicable: typeof system.applicable === 'boolean' ? system.applicable : null,
    existing_condition: observedCondition(system),
    required_condition: requiredCondition,
    gap: system.gap_text || null,
    compliance_status: system.compliance_status || 'INCOMPLETE',
    required_action: system.action_text || null,
    requirement_reference: requirementReference,
    requirement_source: requirementSource,
    evidence,
    notes: system.observation || null,
    priority: system.priority ? EXISTING_ASSESSMENT_PRIORITY_LABELS[system.priority] : null,
    recommendation_id: system.recommendation_id || null,
  };
}

function isRenderableAssessment(system: ExistingAssessmentSystem): boolean {
  if (Object.keys(system).length === 0) return false;
  if (system.applicable === false && !system.compliance_status) return false;
  return true;
}

function assessmentSections(data: ProjectEngineeringData): ExistingTechnicalReportAssessmentSection[] {
  const systems = data.existing_assessment?.systems || {};
  return EXISTING_ASSESSMENT_GROUPS.map((group) => {
    const entries = group.systems.flatMap(({ key, label }) => {
      const assessment = systems[key];
      return assessment && isRenderableAssessment(assessment) ? [reportSystem(key, label, assessment, data)] : [];
    });
    return { id: group.id, label: group.label, systems: entries };
  }).filter((section) => section.systems.length > 0);
}

function summary(sections: ExistingTechnicalReportAssessmentSection[]): ExistingTechnicalReportModel['summary'] {
  const statuses = sections.flatMap((section) => section.systems.map((system) => system.compliance_status));
  const count = (status: ExistingAssessmentComplianceStatus) => statuses.filter((item) => item === status).length;
  return {
    total_assessed_systems: statuses.filter((status) => EXISTING_ASSESSMENT_COMPLIANCE_STATUS_VALUES.includes(status as ExistingAssessmentComplianceStatus)).length,
    compliant: count('COMPLIANT'),
    non_compliant: count('NON_COMPLIANT'),
    needs_completion: count('NEEDS_COMPLETION'),
    not_applicable: count('NOT_APPLICABLE'),
  };
}

function recommendations(
  sections: ExistingTechnicalReportAssessmentSection[],
  data: ProjectEngineeringData
): ExistingTechnicalReportRecommendation[] {
  const approved = approvedRecommendations(data);
  const approvedById = new Map(approved.map((item) => [item.id, item]));
  const actions = sections.flatMap((section) => section.systems.flatMap((system) => {
    const result: ExistingTechnicalReportRecommendation[] = [];
    if (system.required_action) {
      result.push({
        id: `action:${system.system_key}`,
        text: system.required_action,
        system_key: system.system_key,
        system_label: system.system_label,
        priority: system.priority,
        source: 'ASSESSMENT_ACTION',
      });
    }
    const approvedItem = system.recommendation_id ? approvedById.get(system.recommendation_id) : undefined;
    if (approvedItem?.effective_text_ar && system.priority) {
      result.push({
        id: `approved:${approvedItem.id}`,
        text: approvedItem.effective_text_ar,
        system_key: system.system_key,
        system_label: system.system_label,
        priority: system.priority,
        source: 'APPROVED_RECOMMENDATION',
      });
    }
    return result;
  }));

  return unique(actions, (item) => `${item.source}:${item.text}`);
}

function assessmentSourceLabel(source: string | null): string {
  const labels: Record<string, string> = {
    'fire_protection_design.fire_truck_access': 'بيانات الوصول ضمن التصميم الفني',
    'fire_protection_design.water_supply': 'بيانات مصدر المياه ضمن التصميم الفني',
    'fire_protection_design.water_tank': 'بيانات الخزان ضمن التصميم الفني',
    'fire_protection_design.pump': 'بيانات المضخات ضمن التصميم الفني',
    'fire_protection_design.standpipe': 'بيانات المواسير الرأسية ضمن التصميم الفني',
    'fire_protection_design.sprinkler': 'بيانات الرش ضمن التصميم الفني ومركز التصاميم',
    'fire_protection_design.extinguishers': 'بيانات الطفايات ضمن التصميم الفني',
    'fire_protection_design.fire_alarm': 'بيانات إنذار الحريق ضمن التصميم الفني ومركز التصاميم',
    'fire_protection_design.supporting_systems': 'متطلبات الأنظمة المساندة في التصميم الفني',
  };
  return (source && labels[source]) || (source?.includes('fire_protection_design') ? 'بيانات التصميم الفني' : source || 'مرجع تقييم مدخل من المهندس');
}

function assessmentBasis(sections: ExistingTechnicalReportAssessmentSection[]): Array<{ reference: string; source: string }> {
  return unique(
    sections.flatMap((section) => section.systems.flatMap((system) =>
      system.requirement_reference
        ? [{ reference: system.requirement_reference, source: assessmentSourceLabel(system.requirement_source) }]
        : []
    )),
    (item) => `${item.reference}:${item.source}`
  );
}

function displayValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '';
  if (typeof value === 'boolean') return value ? 'نعم' : 'لا';
  return humanizeEngineeringDisplayValue(String(value).trim()) || String(value).trim();
}

export function isAuthoritativeExistingReportMeasuredValue(
  value: MeasuredValue<string> | null | undefined
): value is MeasuredValue<string> {
  if (!value || value.value == null || value.value === 0 || Number.isNaN(value.value)) return false;
  return AUTHORITATIVE_VALUE_SOURCES.has(value.source);
}

export function formatAuthoritativeExistingReportMeasured(
  value: MeasuredValue<string> | null | undefined
): string {
  return isAuthoritativeExistingReportMeasuredValue(value)
    ? formatMeasured(value, { empty: '' })
    : '';
}

export function formatExistingReportSprinklerEngineeringValue(
  value: string | null | undefined,
  kind: 'k_factor' | 'pressure' | 'flow'
): string {
  const raw = cleanText(value);
  if (!raw) return '';
  if (kind === 'k_factor') {
    if (/^k\s*[=:]/i.test(raw)) return raw.replace(/^k/i, 'K');
    if (/^k\d/i.test(raw)) return raw;
    if (/^\d+(\.\d+)?$/.test(raw)) return `K = ${raw}`;
    return raw;
  }
  if (kind === 'pressure') {
    if (/bar|psi|kpa|بار/i.test(raw)) return raw;
    if (/^\d+(\.\d+)?$/.test(raw)) return `${raw} bar`;
    return raw;
  }
  if (/gpm|l\/min|lpm|ل\/د|لتر/i.test(raw)) return raw;
  if (/^\d+(\.\d+)?$/.test(raw)) return `${raw} GPM`;
  return raw;
}

function authoritativeProjectText(value: string | null | undefined): string {
  return cleanText(value) || '';
}

function approvedAggregateCount(value: number | null | undefined, status: string): number | null {
  if (status === 'missing' || value == null || value <= 0) return null;
  return value;
}

function storedCalculatedTankVolume(
  tank: Partial<FireProtectionDesign['water_tank']> | null | undefined
): string {
  const volume = tank?.calculated_required_volume_m3;
  if (volume == null || volume === 0) return '';
  if (
    !isAuthoritativeExistingReportMeasuredValue(tank?.water_demand_lpm) &&
    !isAuthoritativeExistingReportMeasuredValue(tank?.capacity_m3)
  ) {
    return '';
  }
  return `${volume} m³`;
}

function engineeringRows(items: Array<{ label: string; value: unknown }>) {
  return items
    .map(({ label, value }) => ({ label, value: displayValue(value) }))
    .filter((item): item is { label: string; value: string } => Boolean(item.value) && item.value !== '0');
}

function engineeringSections(client: ClientRecord, data: ProjectEngineeringData): ExistingTechnicalReportEngineeringSection[] {
  const source = buildTechnicalReportSourceData({ client, engineeringData: data });
  const raw = data.fire_protection_design;
  const waterSupply = raw?.water_supply;
  const tank = raw?.water_tank;
  const pump = raw?.pump;
  const dieselPump = raw?.diesel_pump;
  const jockeyPump = raw?.jockey_pump;
  const sprinkler = raw?.sprinkler;
  const fireAlarm = raw?.fire_alarm;
  const sections = [
    {
      id: 'egress',
      label: 'مقاييس الإخلاء',
      rows: engineeringRows([
        {
          label: 'إجمالي الشاغلين',
          value: approvedAggregateCount(
            source.aggregates.total_occupants.value,
            source.aggregates.total_occupants.status
          ),
        },
        {
          label: 'إجمالي المخارج',
          value: approvedAggregateCount(
            source.aggregates.total_exits.value,
            source.aggregates.total_exits.status
          ),
        },
        {
          label: 'أقصى مسافة سفر',
          value:
            source.aggregates.maximum_travel_distance_m.status !== 'missing' &&
            source.aggregates.maximum_travel_distance_m.value
              ? `${source.aggregates.maximum_travel_distance_m.value} م`
              : '',
        },
      ]),
    },
    {
      id: 'water',
      label: 'إمداد مياه الإطفاء والخزان',
      rows: engineeringRows([
        { label: 'مصدر مياه الإطفاء', value: authoritativeProjectText(waterSupply?.water_source) },
        { label: 'نوع الخزان', value: authoritativeProjectText(waterSupply?.tank_type) },
        { label: 'السعة المركبة', value: formatAuthoritativeExistingReportMeasured(tank?.capacity_m3) },
        { label: 'معدل الطلب المائي', value: formatAuthoritativeExistingReportMeasured(tank?.water_demand_lpm) },
        { label: 'مدة التخزين', value: formatAuthoritativeExistingReportMeasured(tank?.duration_min) },
        { label: 'الحجم المطلوب المحسوب', value: storedCalculatedTankVolume(tank) },
      ]),
    },
    {
      id: 'pumps',
      label: 'مضخات الحريق',
      rows: engineeringRows([
        { label: 'نوع مجموعة المضخات', value: authoritativeProjectText(pump?.type) },
        { label: 'تدفق المضخة المقنن', value: formatAuthoritativeExistingReportMeasured(pump?.rated_flow) },
        { label: 'ضغط المضخة المقنن', value: formatAuthoritativeExistingReportMeasured(pump?.rated_pressure) },
        { label: 'تدفق المضخة الكهربائية', value: formatAuthoritativeExistingReportMeasured(pump?.capacity) },
        { label: 'ضغط المضخة الكهربائية', value: formatAuthoritativeExistingReportMeasured(pump?.pressure) },
        { label: 'تدفق مضخة الديزل', value: formatAuthoritativeExistingReportMeasured(dieselPump?.capacity) },
        { label: 'ضغط مضخة الديزل', value: formatAuthoritativeExistingReportMeasured(dieselPump?.pressure) },
        { label: 'تدفق مضخة الجوكي', value: formatAuthoritativeExistingReportMeasured(jockeyPump?.capacity) },
        { label: 'ضغط مضخة الجوكي', value: formatAuthoritativeExistingReportMeasured(jockeyPump?.pressure) },
      ]),
    },
    {
      id: 'sprinkler',
      label: 'نظام الرش الآلي',
      rows: engineeringRows([
        {
          label: 'عدد المرشات',
          value: approvedAggregateCount(
            source.aggregates.total_sprinklers.value,
            source.aggregates.total_sprinklers.status
          ),
        },
        { label: 'نوع النظام', value: authoritativeProjectText(sprinkler?.system_type) },
        { label: 'نوع المرشات', value: authoritativeProjectText(sprinkler?.sprinkler_type) },
        { label: 'معامل K', value: formatExistingReportSprinklerEngineeringValue(sprinkler?.k_factor, 'k_factor') },
        {
          label: 'ضغط التصميم',
          value: formatExistingReportSprinklerEngineeringValue(sprinkler?.design_pressure, 'pressure'),
        },
        { label: 'تصرف التصميم', value: formatExistingReportSprinklerEngineeringValue(sprinkler?.design_flow, 'flow') },
      ]),
    },
    {
      id: 'alarm',
      label: 'نظام إنذار وكشف الحريق',
      rows: engineeringRows([
        {
          label: 'عدد لوحات الإنذار',
          value: approvedAggregateCount(
            source.aggregates.total_fire_alarm_panels.value,
            source.aggregates.total_fire_alarm_panels.status
          ),
        },
        {
          label: 'كواشف الدخان',
          value: approvedAggregateCount(
            source.aggregates.total_smoke_detectors.value,
            source.aggregates.total_smoke_detectors.status
          ),
        },
        {
          label: 'كواشف الحرارة',
          value: approvedAggregateCount(
            source.aggregates.total_heat_detectors.value,
            source.aggregates.total_heat_detectors.status
          ),
        },
        {
          label: 'أجهزة التنبيه',
          value: approvedAggregateCount(
            source.aggregates.total_alarm_bells.value,
            source.aggregates.total_alarm_bells.status
          ),
        },
        { label: 'لوحات التحكم', value: authoritativeProjectText(fireAlarm?.control_panel) },
        { label: 'نقاط النداء اليدوية', value: authoritativeProjectText(fireAlarm?.manual_call_points) },
        { label: 'الإخلاء الصوتي', value: authoritativeProjectText(fireAlarm?.voice_alarm) },
      ]),
    },
  ];
  return sections.filter((section) => section.rows.length > 0);
}


/**
 * Pure read-only view for the EXISTING-project preview. It never persists a report
 * copy, does not infer compliance, and does not select a project route.
 */
export function buildExistingTechnicalReportModel(
  client: ClientRecord,
  data: ProjectEngineeringData,
  company?: Pick<CompanyProfile, 'name' | 'legal_name'> | null
): ExistingTechnicalReportModel {
  const sections = assessmentSections(data);
  const evidence = sections.flatMap((section) => section.systems.flatMap((system) => system.evidence));
  const building = data.building_plan;
  const technical = data.technical_report;
  const projectName = cleanText(client.business_name) || cleanText(client.name) || 'مشروع غير مسمى';

  return {
    project_identity: {
      project_code: client.primary_engineering_project_identity?.projectCode || null,
      project_classification: 'EXISTING',
    },
    approval: {
      prepared_by: cleanText(technical.safety_engineer_name) || cleanText(client.assigned_engineer),
      executive_director: cleanText(technical.executive_director_name),
    },
    project_information: {
      project_name: projectName,
      owner: cleanText(client.owner_name),
      location: locationFromClient(client),
      report_number: cleanText(technical.outgoing_number),
      report_date: cleanText(technical.report_date) || cleanText(building.report_date),
      consulting_office: cleanText(company?.legal_name) || cleanText(company?.name),
    },
    building_information: [
      valueRow('نوع المبنى / النشاط', building.building_use || client.activity_type),
      valueRow('المساحة المبنية', client.building_area ? `${client.building_area} م²` : null),
      valueRow('عدد الأدوار', building.licensed_floor_count ?? client.floors_count),
      valueRow('وصف الأدوار', building.floors_description),
      valueRow('رقم رخصة البناء', building.building_permit_number),
      valueRow('تاريخ الرخصة', building.building_permit_date || building.building_permit_date_hijri),
    ].filter((row): row is { label: string; value: string } => Boolean(row)),
    occupancy_and_classification: [
      valueRow('تصنيف الإشغال', building.occupancy_classification || technical.building_classification),
      valueRow('درجة الخطورة', technical.risk_class),
      valueRow('متطلبات SBC', building.sbc_requirements),
      valueRow('عدد المخارج', building.exits_count),
      valueRow('السلالم', building.stairs_count),
    ].filter((row): row is { label: string; value: string } => Boolean(row)),
    assessment_basis: assessmentBasis(sections),
    engineering_sections: engineeringSections(client, data),
    assessment_sections: sections,
    summary: summary(sections),
    recommendations: recommendations(sections, data),
    limitations: [
      'هذه المعاينة قراءة فقط ومشتقة من تقييمات المهندس والبيانات الكانونية المتاحة للمشروع.',
      'لا تشكل المعاينة اعتمادًا من الدفاع المدني أو شهادة مطابقة أو قبولًا نهائيًا للموقع.',
      'لا يثبت هذا العرض تنفيذ معاينة ميدانية ما لم تسجل ملاحظات أو أدلة صريحة في التقييم.',
    ],
    evidence_references: unique(evidence, (item) => `${item.system_key}:${item.id}`),
  };
}

export function existingTechnicalReportStatusLabel(status: ExistingTechnicalReportStatus): string {
  return status === 'INCOMPLETE' ? INCOMPLETE_LABEL : EXISTING_ASSESSMENT_STATUS_LABELS[status];
}

export function existingTechnicalReportStatusClass(status: ExistingTechnicalReportStatus): string {
  return {
    COMPLIANT: 'bg-emerald-100 text-emerald-900 border-emerald-200',
    NON_COMPLIANT: 'bg-rose-100 text-rose-900 border-rose-200',
    NEEDS_COMPLETION: 'bg-amber-100 text-amber-950 border-amber-200',
    NOT_APPLICABLE: 'bg-slate-100 text-slate-700 border-slate-200',
    INCOMPLETE: 'bg-slate-100 text-slate-700 border-slate-200',
  }[status];
}
