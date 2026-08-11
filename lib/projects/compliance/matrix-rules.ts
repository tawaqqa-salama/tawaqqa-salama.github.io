/**
 * Rule-matrix evaluators (EGR travel/common-path/dead-end/widths, FAC clearance/turning,
 * FP density/hose/tank/extinguisher).
 *
 * Numbers never come from engine hard-codes — only from code-database encoded rows
 * or complete project_adopted_mapping (edition + section + value).
 */

import {
  formatCodeMapping,
  getRuleMatrixDefinition,
  resolveMatrixThreshold,
  type DocumentedCodeLimit,
  type FireClass,
  type SprinklerStatus,
} from '@/lib/projects/compliance/code-database';
import { citationFor } from '@/lib/projects/compliance/code-refs';
import {
  blockedEval,
  evidence,
  failEval,
  hasNonEmpty,
  needsData,
  passEval,
} from '@/lib/projects/compliance/evidence';
import { occupancyLabel } from '@/lib/projects/compliance/thresholds';
import type {
  ComplianceRule,
  ComplianceRuleContext,
  ComplianceRuleEvaluation,
  ProjectCodeMapping,
} from '@/lib/projects/compliance/types';

function occ(ctx: ComplianceRuleContext): string | null {
  return (
    ctx.building.occupancy_classification ||
    ctx.building.primary_occupancy_code ||
    (ctx.building.group_letter ? `GROUP ${ctx.building.group_letter}` : null) ||
    occupancyLabel(ctx)
  );
}

function sprinklerStatus(ctx: ComplianceRuleContext): SprinklerStatus | null {
  if (ctx.egress.sprinkler_status === 'sprinklered' || ctx.egress.sprinkler_status === 'non_sprinklered') {
    return ctx.egress.sprinkler_status;
  }
  // Explicit sprinkler_provided only — never “FP system exists”
  if (ctx.fireProtection.sprinkler_provided === 'yes') return 'sprinklered';
  if (ctx.fireProtection.sprinkler_provided === 'no') return 'non_sprinklered';
  return null;
}

function toDocLimit(m: ProjectCodeMapping | null | undefined): DocumentedCodeLimit | null {
  if (!m) return null;
  return {
    value: m.value,
    unit: m.unit,
    source_code: m.source_code,
    source_edition: m.source_edition,
    source_section: m.source_section,
    source_table: m.source_table ?? null,
    applicability: m.applicability ?? null,
    occupancy: m.occupancy ?? null,
    sprinkler_status: m.sprinkler_status ?? null,
    hazard: m.hazard ?? null,
    fire_class: m.fire_class ?? null,
    encoding_source: 'project_adopted_mapping',
  };
}

function matrixTrace(
  limit: DocumentedCodeLimit,
  measured: number,
  decision: 'PASS' | 'FAIL'
): Partial<ComplianceRuleEvaluation> {
  const ref = formatCodeMapping(limit);
  return {
    code_reference: ref,
    source_code: limit.source_code,
    source_edition: limit.source_edition,
    source_section: limit.source_section,
    source_table: limit.source_table ?? null,
    measured_value: measured,
    required_value: limit.value,
    unit: limit.unit,
    decision,
    required_value_source:
      limit.encoding_source === 'platform_code_table' ? 'platform_code_table' : 'documented_code_mapping',
    evidence: [
      evidence('measurement', 'measured', measured, 'project'),
      evidence('document', 'required', limit.value, limit.encoding_source, ref),
    ],
  };
}

function compareMapped(params: {
  ruleId: string;
  ctx: ComplianceRuleContext;
  missingChecks: Array<{ key: string; ok: boolean }>;
  measured: number | null;
  mode: 'lte' | 'gte';
  projectMapping?: ProjectCodeMapping | null;
  occupancy?: string | null;
  sprinkler?: SprinklerStatus | null;
  hazard?: string | null;
  fire_class?: FireClass | null;
  inputs: Record<string, string | number | boolean | null | undefined>;
  passMsg: (a: number, r: number) => string;
  failMsg: (a: number, r: number) => string;
}): ComplianceRuleEvaluation {
  const def = getRuleMatrixDefinition(params.ruleId)!;
  const missing = params.missingChecks.filter((c) => !c.ok).map((c) => c.key);
  if (missing.length) {
    return needsData(def.needs_data_condition, params.inputs, missing, {
      code_reference: citationFor(params.ruleId),
      occupancy: params.occupancy ?? occ(params.ctx),
      decision: 'NEEDS_DATA',
      source_code: def.source_code,
      source_edition: def.source_edition,
      source_section: def.source_section,
      source_table: def.source_table,
    });
  }

  const resolved = resolveMatrixThreshold({
    ruleId: params.ruleId,
    occupancy: params.occupancy ?? null,
    sprinkler_status: params.sprinkler ?? null,
    hazard: params.hazard ?? null,
    fire_class: params.fire_class ?? null,
    projectMapping: toDocLimit(params.projectMapping),
  });

  if (!resolved.limit || params.measured == null) {
    return blockedEval(def.blocked_condition, params.inputs, {
      code_reference: citationFor(params.ruleId),
      occupancy: params.occupancy ?? occ(params.ctx),
      actual_value: params.measured,
      source_code: def.source_code,
      source_edition: def.source_edition,
      source_section: def.source_section,
      source_table: def.source_table,
      measured_value: params.measured,
      decision: 'BLOCKED',
    });
  }

  const a = params.measured;
  const r = resolved.limit.value;
  const ok = params.mode === 'lte' ? a - 1e-9 <= r : a + 1e-9 >= r;
  const base = {
    inputs: params.inputs,
    occupancy: params.occupancy ?? occ(params.ctx),
    condition: `${params.mode} ${r} ${resolved.limit.unit}`,
    ...matrixTrace(resolved.limit, a, ok ? 'PASS' : 'FAIL'),
  };
  return ok ? passEval(params.passMsg(a, r), base) : failEval(params.failMsg(a, r), base);
}

function egressMatrixRules(): ComplianceRule[] {
  return [
    {
      id: 'EGR-TRAVEL-DISTANCE',
      code: 'SBC 201',
      section: '1017 Travel Distance (matrix)',
      title: 'Exit access travel distance',
      title_ar: 'مسافة السفر — مصفوفة',
      applicability: { description: 'Means of egress — SBC 201:2024 §1017' },
      requiredInputs: getRuleMatrixDefinition('EGR-TRAVEL-DISTANCE')!.required_inputs,
      severity: 'mandatory',
      evidenceRequired: ['measurement', 'drawing', 'document'],
      evaluate: (ctx) => {
        const occupancy = occ(ctx);
        const sprinkler = sprinklerStatus(ctx);
        const measured = ctx.egress.travel_distance_m ?? null;
        const pathOk = ctx.egress.path_geometry_documented === true;
        return compareMapped({
          ruleId: 'EGR-TRAVEL-DISTANCE',
          ctx,
          missingChecks: [
            { key: 'occupancy_classification', ok: hasNonEmpty(occupancy) },
            { key: 'sprinkler_status', ok: sprinkler != null },
            { key: 'travel_distance_m', ok: measured != null && measured > 0 },
            { key: 'path_geometry_documented', ok: pathOk },
          ],
          measured,
          mode: 'lte',
          projectMapping: ctx.egress.travel_distance_mapping,
          occupancy,
          sprinkler,
          inputs: {
            occupancy,
            sprinkler_status: sprinkler,
            travel_distance_m: measured,
            path_geometry_documented: pathOk,
          },
          passMsg: (a, r) => `مسافة السفر ${a} م ≤ الحد الموثّق ${r} م.`,
          failMsg: (a, r) => `مسافة السفر ${a} م > الحد الموثّق ${r} م.`,
        });
      },
    },
    {
      id: 'EGR-COMMON-PATH',
      code: 'SBC 201',
      section: '1016.2 Common Path (matrix)',
      title: 'Common path of egress travel',
      title_ar: 'المسار المشترك — مصفوفة',
      applicability: { description: 'SBC 201:2024 §1016.2' },
      requiredInputs: getRuleMatrixDefinition('EGR-COMMON-PATH')!.required_inputs,
      severity: 'mandatory',
      evidenceRequired: ['measurement', 'drawing'],
      evaluate: (ctx) => {
        const occupancy = occ(ctx);
        const sprinkler = sprinklerStatus(ctx);
        const measured = ctx.egress.common_path_m ?? null;
        return compareMapped({
          ruleId: 'EGR-COMMON-PATH',
          ctx,
          missingChecks: [
            { key: 'occupancy_classification', ok: hasNonEmpty(occupancy) },
            { key: 'sprinkler_status', ok: sprinkler != null },
            { key: 'common_path_m', ok: measured != null && measured >= 0 },
          ],
          measured,
          mode: 'lte',
          projectMapping: ctx.egress.common_path_mapping,
          occupancy,
          sprinkler,
          inputs: { occupancy, sprinkler_status: sprinkler, common_path_m: measured },
          passMsg: (a, r) => `المسار المشترك ${a} م ≤ الحد ${r} م.`,
          failMsg: (a, r) => `المسار المشترك ${a} م > الحد ${r} م.`,
        });
      },
    },
    {
      id: 'EGR-DEAD-END',
      code: 'SBC 201',
      section: '1020.4 Dead Ends (matrix)',
      title: 'Dead-end corridor length',
      title_ar: 'الطرق المسدودة — مصفوفة',
      applicability: { description: 'SBC 201:2024 §1020.4 — occupancy-specific; no universal value' },
      requiredInputs: getRuleMatrixDefinition('EGR-DEAD-END')!.required_inputs,
      severity: 'mandatory',
      evidenceRequired: ['measurement', 'drawing'],
      evaluate: (ctx) => {
        const occupancy = occ(ctx);
        const sprinkler = sprinklerStatus(ctx);
        const measured = ctx.egress.dead_end_m ?? null;
        return compareMapped({
          ruleId: 'EGR-DEAD-END',
          ctx,
          missingChecks: [
            { key: 'occupancy_classification', ok: hasNonEmpty(occupancy) },
            { key: 'sprinkler_status', ok: sprinkler != null },
            { key: 'dead_end_m', ok: measured != null && measured >= 0 },
          ],
          measured,
          mode: 'lte',
          projectMapping: ctx.egress.dead_end_mapping,
          occupancy,
          sprinkler,
          inputs: { occupancy, sprinkler_status: sprinkler, dead_end_m: measured },
          passMsg: (a, r) => `الطريق المسدود ${a} م ≤ الحد الخاص بالإشغال ${r} م.`,
          failMsg: (a, r) => `الطريق المسدود ${a} م > الحد الخاص بالإشغال ${r} م.`,
        });
      },
    },
    {
      id: 'EGR-CORRIDOR-WIDTH',
      code: 'SBC 201',
      section: '1020.2 Corridor Width (matrix)',
      title: 'Corridor clear width',
      title_ar: 'عرض الممر الصافي — مصفوفة',
      applicability: { description: 'SBC 201:2024 §1020.2 — net clear width' },
      requiredInputs: getRuleMatrixDefinition('EGR-CORRIDOR-WIDTH')!.required_inputs,
      severity: 'mandatory',
      evidenceRequired: ['measurement', 'drawing'],
      evaluate: (ctx) => {
        const occupancy = occ(ctx);
        const load = ctx.egress.occupant_load_served ?? ctx.egress.occupant_load_total ?? null;
        const clear = ctx.egress.corridor_clear_width_m ?? null;
        const type = ctx.egress.corridor_type;
        // Nominal corridor_width_m alone is insufficient when clear width is the code metric
        return compareMapped({
          ruleId: 'EGR-CORRIDOR-WIDTH',
          ctx,
          missingChecks: [
            { key: 'occupant_load_served', ok: load != null && load > 0 },
            { key: 'occupancy_classification', ok: hasNonEmpty(occupancy) },
            { key: 'corridor_type', ok: hasNonEmpty(type) },
            { key: 'corridor_clear_width_m', ok: clear != null && clear > 0 },
          ],
          measured: clear,
          mode: 'gte',
          projectMapping: ctx.egress.corridor_width_mapping,
          occupancy,
          inputs: {
            occupant_load_served: load,
            occupancy,
            corridor_type: type ?? null,
            corridor_clear_width_m: clear,
            nominal_corridor_width_m: ctx.egress.corridor_width_m ?? null,
          },
          passMsg: (a, r) => `عرض الممر الصافي ${a} م ≥ المطلوب ${r} م.`,
          failMsg: (a, r) => `عرض الممر الصافي ${a} م < المطلوب ${r} م.`,
        });
      },
    },
    {
      id: 'EGR-DOOR-WIDTH',
      code: 'SBC 201',
      section: '1010.1.1 Door Clear Opening (matrix)',
      title: 'Egress door clear opening width',
      title_ar: 'عرض فتحة الباب الصافية — مصفوفة',
      applicability: { description: 'SBC 201:2024 §1010.1.1 — clear opening, not leaf alone' },
      requiredInputs: getRuleMatrixDefinition('EGR-DOOR-WIDTH')!.required_inputs,
      severity: 'mandatory',
      evidenceRequired: ['measurement', 'drawing'],
      evaluate: (ctx) => {
        const load = ctx.egress.occupant_load_served ?? ctx.egress.occupant_load_total ?? null;
        const clear = ctx.egress.door_clear_opening_width_m ?? null;
        return compareMapped({
          ruleId: 'EGR-DOOR-WIDTH',
          ctx,
          missingChecks: [
            { key: 'occupant_load_served', ok: load != null && load > 0 },
            { key: 'door_type', ok: hasNonEmpty(ctx.egress.door_type) },
            { key: 'door_clear_opening_width_m', ok: clear != null && clear > 0 },
            { key: 'door_egress_direction', ok: hasNonEmpty(ctx.egress.door_egress_direction) },
          ],
          measured: clear,
          mode: 'gte',
          projectMapping: ctx.egress.door_width_mapping,
          occupancy: occ(ctx),
          inputs: {
            occupant_load_served: load,
            door_type: ctx.egress.door_type ?? null,
            door_clear_opening_width_m: clear,
            door_egress_direction: ctx.egress.door_egress_direction ?? null,
            nominal_door_leaf_width_m: ctx.egress.door_width_m ?? null,
          },
          passMsg: (a, r) => `فتحة الباب الصافية ${a} م ≥ المطلوب ${r} م.`,
          failMsg: (a, r) => `فتحة الباب الصافية ${a} م < المطلوب ${r} م.`,
        });
      },
    },
    {
      id: 'EGR-STAIR-WIDTH',
      code: 'SBC 201',
      section: '1011.2 Stair Width (matrix)',
      title: 'Egress stair clear width',
      title_ar: 'عرض السلم الصافي — مصفوفة',
      applicability: { description: 'SBC 201:2024 §1011.2 — occupancy-specific' },
      requiredInputs: getRuleMatrixDefinition('EGR-STAIR-WIDTH')!.required_inputs,
      severity: 'mandatory',
      evidenceRequired: ['measurement', 'drawing'],
      evaluate: (ctx) => {
        const occupancy = occ(ctx);
        const load = ctx.egress.occupant_load_served ?? ctx.egress.occupant_load_total ?? null;
        const stairs = ctx.egress.stairs_count ?? null;
        const clear = ctx.egress.stair_clear_width_m ?? null;
        return compareMapped({
          ruleId: 'EGR-STAIR-WIDTH',
          ctx,
          missingChecks: [
            { key: 'occupant_load_served', ok: load != null && load > 0 },
            { key: 'stairs_count', ok: stairs != null && stairs >= 1 },
            { key: 'stair_clear_width_m', ok: clear != null && clear > 0 },
            { key: 'occupancy_classification', ok: hasNonEmpty(occupancy) },
          ],
          measured: clear,
          mode: 'gte',
          projectMapping: ctx.egress.stair_width_mapping,
          occupancy,
          inputs: {
            occupant_load_served: load,
            stairs_count: stairs,
            stair_clear_width_m: clear,
            occupancy,
            nominal_stair_width_m: ctx.egress.stair_width_m ?? null,
          },
          passMsg: (a, r) => `عرض السلم الصافي ${a} م ≥ المطلوب ${r} م.`,
          failMsg: (a, r) => `عرض السلم الصافي ${a} م < المطلوب ${r} م.`,
        });
      },
    },
  ];
}

function fireAccessMatrixRules(): ComplianceRule[] {
  return [
    {
      id: 'FAC-CLEARANCE',
      code: 'SBC 801',
      section: 'Access clearance (matrix → FAC-03)',
      title: 'Fire apparatus clearance',
      title_ar: 'خلوص وصول الآليات — مصفوفة',
      applicability: { description: 'Linked to existing FAC-03 citation — no invented FAC codes' },
      requiredInputs: getRuleMatrixDefinition('FAC-CLEARANCE')!.required_inputs,
      severity: 'mandatory',
      evidenceRequired: ['measurement', 'drawing'],
      evaluate: (ctx) => {
        const a = ctx.fireAccess;
        return compareMapped({
          ruleId: 'FAC-CLEARANCE',
          ctx,
          missingChecks: [
            { key: 'element_type', ok: hasNonEmpty(a.element_type) },
            { key: 'required_clearance_m', ok: a.required_clearance_m != null && a.required_clearance_m > 0 },
            { key: 'measured_clearance_m', ok: a.measured_clearance_m != null && a.measured_clearance_m >= 0 },
            { key: 'accessible_route_status', ok: hasNonEmpty(a.accessible_route_status) },
            { key: 'obstruction_geometry', ok: hasNonEmpty(a.obstruction_geometry) },
          ],
          measured: a.measured_clearance_m ?? null,
          mode: 'gte',
          // Required clearance must still come from a traced mapping — projectMapping carries edition/section
          projectMapping: a.clearance_mapping,
          occupancy: occ(ctx),
          inputs: {
            element_type: a.element_type ?? null,
            required_clearance_m: a.required_clearance_m ?? null,
            measured_clearance_m: a.measured_clearance_m ?? null,
            accessible_route_status: a.accessible_route_status ?? null,
            obstruction_geometry: a.obstruction_geometry ?? null,
            linked_fac: 'FAC-03',
          },
          passMsg: (m, r) => `الخلوص المقاس ${m} م ≥ المطلوب ${r} م.`,
          failMsg: (m, r) => `الخلوص المقاس ${m} م < المطلوب ${r} م.`,
        });
      },
    },
    {
      id: 'FAC-TURNING',
      code: 'SBC 801',
      section: 'Turning geometry (matrix → FAC-04)',
      title: 'Fire apparatus turning space',
      title_ar: 'فضاء الالتفاف — مصفوفة',
      applicability: { description: 'Linked to existing FAC-04 citation — no invented FAC codes' },
      requiredInputs: getRuleMatrixDefinition('FAC-TURNING')!.required_inputs,
      severity: 'mandatory',
      evidenceRequired: ['measurement', 'drawing'],
      evaluate: (ctx) => {
        const a = ctx.fireAccess;
        return compareMapped({
          ruleId: 'FAC-TURNING',
          ctx,
          missingChecks: [
            { key: 'element_type', ok: hasNonEmpty(a.element_type) },
            { key: 'turning_space_dimensions', ok: hasNonEmpty(a.turning_space_dimensions) },
            { key: 'measured_clearance_m', ok: a.measured_clearance_m != null && a.measured_clearance_m >= 0 },
            { key: 'required_clearance_m', ok: a.required_clearance_m != null && a.required_clearance_m > 0 },
            { key: 'obstruction_geometry', ok: hasNonEmpty(a.obstruction_geometry) },
          ],
          measured: a.measured_clearance_m ?? null,
          mode: 'gte',
          projectMapping: a.turning_mapping,
          occupancy: occ(ctx),
          inputs: {
            element_type: a.element_type ?? null,
            turning_space_dimensions: a.turning_space_dimensions ?? null,
            measured_clearance_m: a.measured_clearance_m ?? null,
            required_clearance_m: a.required_clearance_m ?? null,
            obstruction_geometry: a.obstruction_geometry ?? null,
            linked_fac: 'FAC-04',
          },
          passMsg: (m, r) => `هندسة الالتفاف المقاسة ${m} ≥ المطلوب ${r}.`,
          failMsg: (m, r) => `هندسة الالتفاف المقاسة ${m} < المطلوب ${r}.`,
        });
      },
    },
  ];
}

function fireProtectionMatrixRules(): ComplianceRule[] {
  return [
    {
      id: 'FP-SPRINKLER-DENSITY',
      code: 'NFPA 13',
      section: 'Density/Area (matrix)',
      title: 'Sprinkler design density',
      title_ar: 'كثافة تصميم المرشات — مصفوفة',
      applicability: { description: 'NFPA 13 complementary to SBC 801 — no generic density hard-code' },
      requiredInputs: getRuleMatrixDefinition('FP-SPRINKLER-DENSITY')!.required_inputs,
      severity: 'mandatory',
      evidenceRequired: ['calculation', 'document'],
      evaluate: (ctx) => {
        const fp = ctx.fireProtection;
        const h = fp.hazard_class;
        const density = fp.density_lpm_m2 ?? null;
        return compareMapped({
          ruleId: 'FP-SPRINKLER-DENSITY',
          ctx,
          missingChecks: [
            { key: 'hazard_classification', ok: hasNonEmpty(h) },
            { key: 'commodity', ok: hasNonEmpty(fp.commodity) },
            { key: 'sprinkler_type', ok: hasNonEmpty(fp.sprinkler_system_type) },
            { key: 'k_factor', ok: ctx.hydraulic.k_factor != null && ctx.hydraulic.k_factor > 0 },
            { key: 'design_density_lpm_m2', ok: density != null && density > 0 },
            { key: 'design_area_m2', ok: fp.design_area_m2 != null && fp.design_area_m2 > 0 },
            { key: 'sprinkler_count', ok: fp.sprinkler_count != null && fp.sprinkler_count > 0 },
            {
              key: 'ceiling_installation_conditions',
              ok: hasNonEmpty(fp.ceiling_installation_conditions),
            },
          ],
          measured: density,
          mode: 'gte',
          projectMapping: fp.density_mapping,
          hazard: h,
          occupancy: occ(ctx),
          inputs: {
            hazard_classification: h ?? null,
            commodity: fp.commodity ?? null,
            sprinkler_type: fp.sprinkler_system_type ?? null,
            k_factor: ctx.hydraulic.k_factor ?? null,
            design_density_lpm_m2: density,
            design_area_m2: fp.design_area_m2 ?? null,
            sprinkler_count: fp.sprinkler_count ?? null,
            ceiling_installation_conditions: fp.ceiling_installation_conditions ?? null,
          },
          passMsg: (a, r) => `كثافة التصميم ${a} ≥ الكثافة المطلوبة من المرجع ${r}.`,
          failMsg: (a, r) => `كثافة التصميم ${a} < الكثافة المطلوبة من المرجع ${r}.`,
        });
      },
    },
    {
      id: 'FP-HOSE-ALLOWANCE',
      code: 'NFPA 13',
      section: 'Hose stream allowance (matrix)',
      title: 'Hose stream allowance',
      title_ar: 'بدل خراطيم الإطفاء — مصفوفة',
      applicability: { description: 'Extract from applicable NFPA 13 table — never 250/500 gpm default' },
      requiredInputs: getRuleMatrixDefinition('FP-HOSE-ALLOWANCE')!.required_inputs,
      severity: 'mandatory',
      evidenceRequired: ['calculation', 'document'],
      evaluate: (ctx) => {
        const fp = ctx.fireProtection;
        const def = getRuleMatrixDefinition('FP-HOSE-ALLOWANCE')!;
        const missingChecks = [
          { key: 'sprinkler_design_method', ok: hasNonEmpty(fp.sprinkler_design_method) },
          { key: 'sprinkler_type', ok: hasNonEmpty(fp.sprinkler_system_type) },
          { key: 'design_area_m2', ok: fp.design_area_m2 != null && fp.design_area_m2 > 0 },
          { key: 'hazard_or_commodity', ok: hasNonEmpty(fp.hazard_class) || hasNonEmpty(fp.commodity) },
          { key: 'sprinkler_count', ok: fp.sprinkler_count != null && fp.sprinkler_count > 0 },
          { key: 'nfpa_edition', ok: hasNonEmpty(fp.nfpa_edition) },
          { key: 'applicable_hose_table', ok: hasNonEmpty(fp.hose_table_id) },
        ];
        const missing = missingChecks.filter((c) => !c.ok).map((c) => c.key);
        const inputs = {
          sprinkler_design_method: fp.sprinkler_design_method ?? null,
          sprinkler_type: fp.sprinkler_system_type ?? null,
          design_area_m2: fp.design_area_m2 ?? null,
          hazard_or_commodity: fp.hazard_class || fp.commodity || null,
          sprinkler_count: fp.sprinkler_count ?? null,
          nfpa_edition: fp.nfpa_edition ?? null,
          applicable_hose_table: fp.hose_table_id ?? null,
          hose_allowance_lpm: fp.hose_allowance_lpm ?? null,
        };
        if (missing.length) {
          return needsData(def.needs_data_condition, inputs, missing, {
            code_reference: citationFor('FP-HOSE-ALLOWANCE'),
            decision: 'NEEDS_DATA',
            source_code: def.source_code,
            source_section: def.source_section,
          });
        }
        const resolved = resolveMatrixThreshold({
          ruleId: 'FP-HOSE-ALLOWANCE',
          hazard: fp.hazard_class,
          projectMapping: toDocLimit(fp.hose_mapping),
        });
        if (!resolved.limit) {
          return blockedEval(def.blocked_condition, inputs, {
            code_reference: citationFor('FP-HOSE-ALLOWANCE'),
            decision: 'BLOCKED',
            source_code: 'NFPA 13',
            source_edition: fp.nfpa_edition,
            source_table: fp.hose_table_id,
          });
        }
        const documented = fp.hose_allowance_lpm;
        if (documented == null || !(documented > 0)) {
          return needsData('بدل الخراطيم الموثّق للمشروع ناقص رغم وجود صف جدول.', inputs, ['hose_allowance_lpm'], {
            code_reference: formatCodeMapping(resolved.limit),
            decision: 'NEEDS_DATA',
          });
        }
        const ok = Math.abs(documented - resolved.limit.value) < 1e-6;
        const base = {
          inputs,
          occupancy: occ(ctx),
          ...matrixTrace(resolved.limit, documented, ok ? 'PASS' : 'FAIL'),
        };
        return ok
          ? passEval(`بدل الخراطيم ${documented} يطابق صف الجدول الموثّق.`, base)
          : failEval(`بدل الخراطيم ${documented} لا يطابق صف الجدول ${resolved.limit.value}.`, base);
      },
    },
    {
      id: 'FP-FIRE-WATER-TANK',
      code: 'NFPA 22',
      section: 'Fire water tank volume (matrix)',
      title: 'Fire water tank usable volume',
      title_ar: 'حجم خزان الإطفاء — مصفوفة',
      applicability: { description: 'volume = applicable demand × duration — no fixed tank size' },
      requiredInputs: getRuleMatrixDefinition('FP-FIRE-WATER-TANK')!.required_inputs,
      severity: 'mandatory',
      evidenceRequired: ['calculation', 'document'],
      evaluate: (ctx) => {
        const fp = ctx.fireProtection;
        const def = getRuleMatrixDefinition('FP-FIRE-WATER-TANK')!;
        const hydraulic = fp.sprinkler_demand_lpm ?? ctx.hydraulic.flow_lpm ?? null;
        const hose = fp.hose_allowance_lpm ?? null;
        const standpipe = fp.standpipe_demand_lpm;
        const other = fp.other_required_fire_demand_lpm;
        const duration = fp.tank_duration_min ?? null;
        const usable =
          fp.tank_reserve_or_dedicated_fire_volume_m3 ?? fp.usable_tank_volume_m3 ?? fp.tank_volume_m3 ?? null;

        const missingChecks = [
          { key: 'hydraulic_demand_lpm', ok: hydraulic != null && hydraulic > 0 },
          { key: 'hose_allowance_lpm', ok: hose != null && hose > 0 },
          { key: 'duration_min', ok: duration != null && duration > 0 },
          {
            key: 'usable_tank_volume_m3',
            ok: usable != null && usable > 0,
          },
          // standpipe / other: required only when mapping says so — if null, treat as "not established"
          {
            key: 'standpipe_demand_applicability',
            ok: standpipe != null || fp.standpipe_required === 'no' || fp.standpipe_provided === 'no',
          },
          { key: 'other_required_fire_demand_lpm', ok: other != null && other >= 0 },
        ];
        const missing = missingChecks.filter((c) => !c.ok).map((c) => c.key);
        const inputs = {
          hydraulic_demand_lpm: hydraulic,
          hose_allowance_lpm: hose,
          standpipe_demand_lpm: standpipe ?? null,
          other_required_fire_demand_lpm: other ?? null,
          duration_min: duration,
          usable_tank_volume_m3: usable,
        };
        if (missing.length) {
          return needsData(def.needs_data_condition, inputs, missing, {
            code_reference: citationFor('FP-FIRE-WATER-TANK'),
            decision: 'NEEDS_DATA',
          });
        }

        const resolved = resolveMatrixThreshold({
          ruleId: 'FP-FIRE-WATER-TANK',
          projectMapping: toDocLimit(fp.tank_mapping),
        });
        // Duration must be from mapping when comparing — project mapping value = required duration (min)
        // OR mapping value = required volume m³. Prefer explicit tank_mapping.value as required volume m³.
        if (!resolved.limit) {
          return blockedEval(def.blocked_condition, inputs, {
            code_reference: citationFor('FP-FIRE-WATER-TANK'),
            decision: 'BLOCKED',
            actual_value: usable,
          });
        }

        const standpipeLpm = standpipe != null && standpipe > 0 ? standpipe : 0;
        const otherLpm = other != null && other > 0 ? other : 0;
        const demandSum = (hydraulic as number) + (hose as number) + standpipeLpm + otherLpm;
        const calculatedM3 = (demandSum * (duration as number)) / 1000;
        // Mapping value is the code-required volume (m³) when unit is m3; else use calculated vs usable with mapping as duration confirmation
        let requiredM3 = calculatedM3;
        if (String(resolved.limit.unit).toLowerCase().includes('m')) {
          requiredM3 = resolved.limit.value;
        }
        const ok = (usable as number) + 1e-9 >= requiredM3;
        const base = {
          inputs: { ...inputs, demand_sum_lpm: demandSum, calculated_required_m3: calculatedM3 },
          occupancy: occ(ctx),
          ...matrixTrace(resolved.limit, usable as number, ok ? 'PASS' : 'FAIL'),
          required_value: requiredM3,
          unit: 'm³',
          condition: `usable_volume >= demand_sum×duration/1000 (or mapped m³)`,
        };
        return ok
          ? passEval(`حجم الخزان الصالح ${usable} م³ ≥ المطلوب ${requiredM3} م³.`, base)
          : failEval(`حجم الخزان الصالح ${usable} م³ < المطلوب ${requiredM3} م³.`, base);
      },
    },
    {
      id: 'FP-EXTINGUISHER',
      code: 'NFPA 10',
      section: 'Portable extinguishers (matrix)',
      title: 'Fire extinguishers by class',
      title_ar: 'طفايات الحريق حسب الفئة — مصفوفة',
      applicability: {
        description: 'NFPA 10 class-specific — Class C not independent sizing; no universal 75 ft default',
      },
      requiredInputs: getRuleMatrixDefinition('FP-EXTINGUISHER')!.required_inputs,
      severity: 'mandatory',
      evidenceRequired: ['document', 'drawing'],
      evaluate: (ctx) => {
        const fp = ctx.fireProtection;
        const fireClass = fp.fire_class;
        const def = getRuleMatrixDefinition('FP-EXTINGUISHER')!;
        const missingChecks = [
          { key: 'fire_class', ok: fireClass === 'A' || fireClass === 'B' || fireClass === 'C' || fireClass === 'D' || fireClass === 'K' },
          { key: 'hazard_level', ok: hasNonEmpty(fp.extinguisher_hazard_level) },
          { key: 'extinguisher_rating', ok: hasNonEmpty(fp.extinguisher_rating) },
          { key: 'floor_area_m2', ok: fp.extinguisher_floor_area_m2 != null && fp.extinguisher_floor_area_m2 > 0 },
          {
            key: 'travel_distance_m',
            ok: fp.extinguisher_travel_distance_m != null && fp.extinguisher_travel_distance_m >= 0,
          },
          { key: 'extinguisher_count', ok: fp.extinguisher_count != null && fp.extinguisher_count > 0 },
          { key: 'special_hazards', ok: fp.special_hazards != null },
          { key: 'cooking_hazard', ok: fp.cooking_hazard != null },
        ];
        const missing = missingChecks.filter((c) => !c.ok).map((c) => c.key);
        const inputs = {
          fire_class: fireClass ?? null,
          hazard_level: fp.extinguisher_hazard_level ?? null,
          extinguisher_rating: fp.extinguisher_rating ?? null,
          floor_area_m2: fp.extinguisher_floor_area_m2 ?? null,
          travel_distance_m: fp.extinguisher_travel_distance_m ?? null,
          extinguisher_count: fp.extinguisher_count ?? null,
          special_hazards: fp.special_hazards ?? null,
          cooking_hazard: fp.cooking_hazard ?? null,
        };
        if (missing.length) {
          return needsData(def.needs_data_condition, inputs, missing, {
            code_reference: citationFor('FP-EXTINGUISHER'),
            decision: 'NEEDS_DATA',
          });
        }
        if (fireClass === 'C') {
          return needsData(
            'Class C ليست فئة تحجيم مستقلة — يلزم أساس Class A/B (أو فئة أخرى منطبقة) مع توثيق الخطر الكهربائي.',
            inputs,
            ['fire_class_sizing_basis'],
            { code_reference: citationFor('FP-EXTINGUISHER'), decision: 'NEEDS_DATA' }
          );
        }
        if (fireClass === 'K' && fp.cooking_hazard !== true) {
          return needsData('Class K تتطلب توثيق cooking hazard = true.', inputs, ['cooking_hazard'], {
            code_reference: citationFor('FP-EXTINGUISHER'),
            decision: 'NEEDS_DATA',
          });
        }
        const resolved = resolveMatrixThreshold({
          ruleId: 'FP-EXTINGUISHER',
          fire_class: fireClass as FireClass,
          hazard: fp.extinguisher_hazard_level,
          projectMapping: toDocLimit(fp.extinguisher_mapping),
        });
        if (!resolved.limit) {
          return blockedEval(def.blocked_condition, inputs, {
            code_reference: citationFor('FP-EXTINGUISHER'),
            decision: 'BLOCKED',
            source_code: 'NFPA 10',
            measured_value: fp.extinguisher_travel_distance_m,
          });
        }
        const travel = fp.extinguisher_travel_distance_m as number;
        // Mapping value = max travel distance (m) for the class/hazard row
        const ok = travel - 1e-9 <= resolved.limit.value;
        const base = {
          inputs,
          occupancy: occ(ctx),
          ...matrixTrace(resolved.limit, travel, ok ? 'PASS' : 'FAIL'),
        };
        return ok
          ? passEval(`مسافة الوصول للطفاية ${travel} ≤ الحد الطبقي الموثّق ${resolved.limit.value}.`, base)
          : failEval(`مسافة الوصول للطفاية ${travel} > الحد الطبقي الموثّق ${resolved.limit.value}.`, base);
      },
    },
  ];
}

export const MATRIX_COMPLIANCE_RULES: ComplianceRule[] = [
  ...egressMatrixRules(),
  ...fireAccessMatrixRules(),
  ...fireProtectionMatrixRules(),
];
