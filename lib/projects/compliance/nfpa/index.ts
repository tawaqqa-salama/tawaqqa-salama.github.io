/**
 * NFPA module public API — findings feed the authoritative compliance engine.
 *
 * Architecture phase: rules return NEEDS_DATA / CONFLICT / RULE_NOT_CONFIGURED.
 * No invented numeric PASS. Advisory stacks cannot create PASS.
 */

import type {
  ComplianceRule,
  ComplianceRuleContext,
  ComplianceRuleEvaluation,
  ComplianceResultStatus,
} from '@/lib/projects/compliance/types';
import type { ClientRecord } from '@/lib/types/client';
import type { ProjectEngineeringData } from '@/lib/types/project-reports';
import { buildNfpaEngineeringContext } from '@/lib/projects/compliance/nfpa/context';
import { evaluateNfpa13 } from '@/lib/projects/compliance/nfpa/nfpa13';
import { evaluateNfpa20 } from '@/lib/projects/compliance/nfpa/nfpa20';
import { evaluateNfpa22 } from '@/lib/projects/compliance/nfpa/nfpa22';
import { evaluateNfpa72 } from '@/lib/projects/compliance/nfpa/nfpa72';
import { evaluateNfpa101 } from '@/lib/projects/compliance/nfpa/nfpa101';
import { rejectAdvisoryPassAttempt } from '@/lib/projects/compliance/nfpa/helpers';
import type {
  NfpaEngineeringContext,
  NfpaRuleFinding,
  NfpaRuleStatus,
  NfpaStandardCode,
} from '@/lib/projects/compliance/nfpa/types';
import { NFPA_ADVISORY_SOURCES, NFPA_AUTHORITY } from '@/lib/projects/compliance/nfpa/types';

export type {
  NfpaEngineeringContext,
  NfpaRuleFinding,
  NfpaRuleStatus,
  NfpaStandardCode,
  Nfpa13Context,
  Nfpa20Context,
  Nfpa22Context,
  Nfpa72Context,
  Nfpa101Context,
} from '@/lib/projects/compliance/nfpa/types';
export { NFPA_ADVISORY_SOURCES, NFPA_AUTHORITY } from '@/lib/projects/compliance/nfpa/types';
export { buildNfpaEngineeringContext } from '@/lib/projects/compliance/nfpa/context';
export { rejectAdvisoryPassAttempt } from '@/lib/projects/compliance/nfpa/helpers';
export { evaluateNfpa13 } from '@/lib/projects/compliance/nfpa/nfpa13';
export { evaluateNfpa20 } from '@/lib/projects/compliance/nfpa/nfpa20';
export { evaluateNfpa22 } from '@/lib/projects/compliance/nfpa/nfpa22';
export { evaluateNfpa72 } from '@/lib/projects/compliance/nfpa/nfpa72';
export { evaluateNfpa101 } from '@/lib/projects/compliance/nfpa/nfpa101';

export function mapNfpaStatusToCompliance(status: NfpaRuleStatus): ComplianceResultStatus {
  if (status === 'CONFLICT') return 'CONFLICT';
  if (status === 'RULE_NOT_CONFIGURED') return 'RULE_NOT_CONFIGURED';
  return status;
}

export function runNfpaArchitectureFindings(params: {
  client: ClientRecord;
  data: ProjectEngineeringData;
}): { context: NfpaEngineeringContext; findings: NfpaRuleFinding[] } {
  const context = buildNfpaEngineeringContext(params);
  const findings = [
    ...evaluateNfpa13(context.nfpa13),
    ...evaluateNfpa20(context.nfpa20),
    ...evaluateNfpa22(context.nfpa22),
    ...evaluateNfpa72(context.nfpa72),
    ...evaluateNfpa101(context.nfpa101),
  ];
  return { context, findings };
}

function findingToEvaluation(f: NfpaRuleFinding): ComplianceRuleEvaluation {
  return {
    status: mapNfpaStatusToCompliance(f.status),
    message: f.explanation_ar,
    reason: f.explanation_en,
    inputs: {
      field: f.field,
      input_state: f.input_state ?? null,
      edition: f.edition,
      code: f.code,
    },
    actual_value: f.actual_value,
    required_value: f.required_value,
    unit: f.unit,
    code_reference: `${f.code}${f.edition ? ` (${f.edition})` : ''} / ${f.rule_id}`,
    required_value_source: 'missing',
    missing_data:
      f.status === 'NEEDS_DATA' || f.status === 'CONFLICT'
        ? [f.field]
        : f.status === 'RULE_NOT_CONFIGURED'
          ? [`${f.code}_edition_or_table`]
          : undefined,
    source_code: f.code,
    source_edition: f.edition,
    decision: f.status,
  };
}

type NfpaRuleDef = {
  rule_id: string;
  code: NfpaStandardCode;
  field: string;
  title_ar: string;
  title_en: string;
};

/** Static rule registry — architecture phase (no invented PASS thresholds). */
export const NFPA_RULE_DEFS: NfpaRuleDef[] = [
  // NFPA 13
  { rule_id: 'NFPA13-OCC-HAZARD', code: 'NFPA-13', field: 'hazard_class', title_ar: 'تصنيف الخطورة', title_en: 'Hazard class' },
  { rule_id: 'NFPA13-SPRINKLER-TYPE', code: 'NFPA-13', field: 'sprinkler_type', title_ar: 'نوع الرشاش', title_en: 'Sprinkler type' },
  { rule_id: 'NFPA13-SYSTEM-TYPE', code: 'NFPA-13', field: 'sprinkler_system_type', title_ar: 'نوع النظام', title_en: 'System type' },
  { rule_id: 'NFPA13-DESIGN-AREA', code: 'NFPA-13', field: 'design_area_m2', title_ar: 'مساحة التصميم', title_en: 'Design area' },
  { rule_id: 'NFPA13-DENSITY', code: 'NFPA-13', field: 'density_lpm_m2', title_ar: 'الكثافة', title_en: 'Density' },
  { rule_id: 'NFPA13-SPACING', code: 'NFPA-13', field: 'sprinkler_spacing_m', title_ar: 'التباعد', title_en: 'Spacing' },
  { rule_id: 'NFPA13-WATER-DEMAND', code: 'NFPA-13', field: 'water_demand_lpm', title_ar: 'طلب الماء', title_en: 'Water demand' },
  { rule_id: 'NFPA13-HOSE-ALLOWANCE', code: 'NFPA-13', field: 'hose_allowance_lpm', title_ar: 'بدل الخراطيم', title_en: 'Hose allowance' },
  { rule_id: 'NFPA13-REMOTE-AREA', code: 'NFPA-13', field: 'remote_area_m2', title_ar: 'المنطقة النائية', title_en: 'Remote area' },
  { rule_id: 'NFPA13-HYDRAULIC-INPUTS', code: 'NFPA-13', field: 'hydraulic_network_complete', title_ar: 'مدخلات هيدروليكية', title_en: 'Hydraulic inputs' },
  { rule_id: 'NFPA13-WATER-SUPPLY', code: 'NFPA-13', field: 'available_water_supply', title_ar: 'مصدر المياه', title_en: 'Water supply' },
  { rule_id: 'NFPA13-K-FACTOR', code: 'NFPA-13', field: 'k_factor', title_ar: 'معامل K', title_en: 'K-factor' },
  // NFPA 20
  { rule_id: 'NFPA20-PUMP-REQUIRED', code: 'NFPA-20', field: 'pump_exists', title_ar: 'مضخة الحريق', title_en: 'Fire pump' },
  { rule_id: 'NFPA20-PUMP-TYPE', code: 'NFPA-20', field: 'pump_type', title_ar: 'نوع المضخة', title_en: 'Pump type' },
  { rule_id: 'NFPA20-RATED-FLOW', code: 'NFPA-20', field: 'rated_flow_lpm', title_ar: 'تدفق مقنن', title_en: 'Rated flow' },
  { rule_id: 'NFPA20-RATED-PRESSURE', code: 'NFPA-20', field: 'rated_pressure_bar', title_ar: 'ضغط مقنن', title_en: 'Rated pressure' },
  { rule_id: 'NFPA20-SUCTION', code: 'NFPA-20', field: 'suction_condition', title_ar: 'السحب', title_en: 'Suction' },
  { rule_id: 'NFPA20-CHURN', code: 'NFPA-20', field: 'churn_pressure', title_ar: 'ضغط الخمول', title_en: 'Churn' },
  { rule_id: 'NFPA20-CONTROLLER', code: 'NFPA-20', field: 'controller_documented', title_ar: 'المتحكم', title_en: 'Controller' },
  { rule_id: 'NFPA20-TEST', code: 'NFPA-20', field: 'test_requirements_documented', title_ar: 'الاختبار', title_en: 'Test' },
  // NFPA 22
  { rule_id: 'NFPA22-TANK-REQUIRED', code: 'NFPA-22', field: 'tank_exists', title_ar: 'الخزان', title_en: 'Tank' },
  { rule_id: 'NFPA22-CAPACITY', code: 'NFPA-22', field: 'tank_capacity_m3', title_ar: 'السعة', title_en: 'Capacity' },
  { rule_id: 'NFPA22-USABLE-VOLUME', code: 'NFPA-22', field: 'usable_volume_m3', title_ar: 'الحجم الصالح', title_en: 'Usable volume' },
  { rule_id: 'NFPA22-TANK-TYPE', code: 'NFPA-22', field: 'tank_type', title_ar: 'نوع الخزان', title_en: 'Tank type' },
  { rule_id: 'NFPA22-DURATION', code: 'NFPA-22', field: 'duration_min', title_ar: 'المدة', title_en: 'Duration' },
  { rule_id: 'NFPA22-FIRE-DEMAND', code: 'NFPA-22', field: 'fire_demand_lpm', title_ar: 'طلب الحريق', title_en: 'Fire demand' },
  // NFPA 72
  { rule_id: 'NFPA72-SYSTEM-CATEGORY', code: 'NFPA-72', field: 'alarm_provided', title_ar: 'فئة الإنذار', title_en: 'Alarm category' },
  { rule_id: 'NFPA72-INITIATING', code: 'NFPA-72', field: 'initiating_devices', title_ar: 'أجهزة البدء', title_en: 'Initiating' },
  { rule_id: 'NFPA72-NOTIFICATION', code: 'NFPA-72', field: 'notification_appliances', title_ar: 'الإشعار', title_en: 'Notification' },
  { rule_id: 'NFPA72-PANEL', code: 'NFPA-72', field: 'control_panel', title_ar: 'اللوحة', title_en: 'Panel' },
  { rule_id: 'NFPA72-SUPERVISION', code: 'NFPA-72', field: 'supervision_documented', title_ar: 'الإشراف', title_en: 'Supervision' },
  { rule_id: 'NFPA72-MONITORING', code: 'NFPA-72', field: 'monitoring_documented', title_ar: 'المراقبة', title_en: 'Monitoring' },
  { rule_id: 'NFPA72-POWER', code: 'NFPA-72', field: 'emergency_power', title_ar: 'الطاقة', title_en: 'Power' },
  { rule_id: 'NFPA72-INTERFACES', code: 'NFPA-72', field: 'interfaces', title_ar: 'الواجهات', title_en: 'Interfaces' },
  // NFPA 101 — same canonical egress as SBC 201
  { rule_id: 'NFPA101-TRAVEL-DISTANCE', code: 'NFPA-101', field: 'travel_distance_m', title_ar: 'مسافة السفر', title_en: 'Travel distance' },
  { rule_id: 'NFPA101-COMMON-PATH', code: 'NFPA-101', field: 'common_path_m', title_ar: 'مسار مشترك', title_en: 'Common path' },
  { rule_id: 'NFPA101-DEAD-END', code: 'NFPA-101', field: 'dead_end_m', title_ar: 'طريق مسدود', title_en: 'Dead end' },
  { rule_id: 'NFPA101-EXIT-COUNT', code: 'NFPA-101', field: 'exits_count', title_ar: 'عدد المخارج', title_en: 'Exit count' },
  { rule_id: 'NFPA101-CORRIDOR-WIDTH', code: 'NFPA-101', field: 'corridor_width_m', title_ar: 'عرض الممر', title_en: 'Corridor width' },
  { rule_id: 'NFPA101-DOOR-WIDTH', code: 'NFPA-101', field: 'door_width_m', title_ar: 'عرض الباب', title_en: 'Door width' },
  { rule_id: 'NFPA101-STAIR-WIDTH', code: 'NFPA-101', field: 'stair_width_m', title_ar: 'عرض الدرج', title_en: 'Stair width' },
  { rule_id: 'NFPA101-OCCUPANT-LOAD', code: 'NFPA-101', field: 'occupant_load', title_ar: 'حمل الشاغلين', title_en: 'Occupant load' },
];

const findingsCache = new WeakMap<object, NfpaRuleFinding[]>();

function allFindingsFor(nfpa: NfpaEngineeringContext): NfpaRuleFinding[] {
  const cached = findingsCache.get(nfpa);
  if (cached) return cached;
  const all = [
    ...evaluateNfpa13(nfpa.nfpa13),
    ...evaluateNfpa20(nfpa.nfpa20),
    ...evaluateNfpa22(nfpa.nfpa22),
    ...evaluateNfpa72(nfpa.nfpa72),
    ...evaluateNfpa101(nfpa.nfpa101),
  ];
  findingsCache.set(nfpa, all);
  return all;
}

function pickFinding(
  ctx: ComplianceRuleContext,
  def: NfpaRuleDef
): NfpaRuleFinding {
  const nfpa = ctx.nfpa;
  if (!nfpa) {
    return {
      code: def.code,
      edition: null,
      rule_id: def.rule_id,
      field: def.field,
      status: 'NEEDS_DATA',
      actual_value: null,
      required_value: null,
      unit: null,
      explanation_ar: `${def.code}: سياق NFPA الكانوني غير مبني — NEEDS_DATA.`,
      explanation_en: `${def.code}: NFPA canonical context not built — NEEDS_DATA.`,
      source: NFPA_AUTHORITY,
      authoritative: true,
      input_state: 'MISSING',
    };
  }

  const hit = allFindingsFor(nfpa).find((f) => f.rule_id === def.rule_id);
  if (hit) return hit;

  return {
    code: def.code,
    edition: null,
    rule_id: def.rule_id,
    field: def.field,
    status: 'RULE_NOT_CONFIGURED',
    actual_value: null,
    required_value: null,
    unit: null,
    explanation_ar: `${def.rule_id}: غير مكوّن.`,
    explanation_en: `${def.rule_id}: not configured.`,
    source: NFPA_AUTHORITY,
    authoritative: true,
  };
}

/** ComplianceRule wrappers — same gate/snapshot path as SBC rules. */
export function buildNfpaComplianceRules(): ComplianceRule[] {
  return NFPA_RULE_DEFS.map((def) => ({
    id: def.rule_id,
    code: def.code,
    section: def.field,
    title: def.title_en,
    title_ar: def.title_ar,
    severity: 'mandatory' as const,
    applicability: {
      description: `${def.code} architecture rule via ${NFPA_AUTHORITY}`,
    },
    requiredInputs: [def.field],
    evidenceRequired: ['document' as const],
    evaluate: (ctx: ComplianceRuleContext): ComplianceRuleEvaluation =>
      findingToEvaluation(pickFinding(ctx, def)),
  }));
}

export function isNfpaAdvisorySource(source: string): boolean {
  return (NFPA_ADVISORY_SOURCES as readonly string[]).some((s) => source.includes(s));
}
