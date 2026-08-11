/**
 * SBC 201-2024 Chapter 10 Means of Egress rule evaluators (SBC201-EGR-001..028).
 *
 * No invented thresholds. Verified rows live only in sbc201-egress-database.ts.
 * Attachments / bare inputs never produce PASS.
 */

import {
  getSbc201EgressRuleDef,
  resolveSbc201Threshold,
  SBC201_EGRESS_RULES,
  type Sbc201EgressRuleDef,
} from '@/lib/projects/compliance/sbc201-egress-database';
import {
  blockedEval,
  evidence,
  failEval,
  hasNonEmpty,
  needsData,
  passEval,
} from '@/lib/projects/compliance/evidence';
import type {
  ComplianceRule,
  ComplianceRuleContext,
  ComplianceRuleEvaluation,
  ProjectCodeMapping,
  Sbc201EgressInputs,
} from '@/lib/projects/compliance/types';

function moe(ctx: ComplianceRuleContext): Sbc201EgressInputs {
  return ctx.sbc201Egress || {};
}

function okNum(v: unknown): boolean {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0;
}

function okPos(v: unknown): boolean {
  return typeof v === 'number' && Number.isFinite(v) && v > 0;
}

function present(v: unknown): boolean {
  if (typeof v === 'boolean') return true;
  return hasNonEmpty(v);
}

function missingOf(checks: Array<{ key: string; ok: boolean }>): string[] {
  return checks.filter((c) => !c.ok).map((c) => c.key);
}

function codeRef(def: Sbc201EgressRuleDef): string {
  const table = def.table ? ` / ${def.table}` : '';
  return `SBC 201-2024 §${def.section}${table}`;
}

function blockedCodeTable(
  def: Sbc201EgressRuleDef,
  inputs: ComplianceRuleEvaluation['inputs'],
  extra: Partial<ComplianceRuleEvaluation> = {}
): ComplianceRuleEvaluation {
  return blockedEval(
    `CODE_TABLE_REQUIRED — ${def.blockedCondition}`,
    inputs,
    {
      code_reference: codeRef(def),
      source_code: 'SBC 201',
      source_edition: '2024',
      source_section: def.section,
      source_table: def.table,
      decision: 'BLOCKED',
      required_value_source: 'missing',
      ...extra,
    }
  );
}

function compareNumeric(params: {
  def: Sbc201EgressRuleDef;
  ctx: ComplianceRuleContext;
  missing: string[];
  inputs: Record<string, string | number | boolean | null | undefined>;
  measured: number | null;
  mode: 'lte' | 'gte' | 'eq';
  mapping?: ProjectCodeMapping | null;
  occupancy?: string | null;
  sprinkler?: 'sprinklered' | 'non_sprinklered' | null;
}): ComplianceRuleEvaluation {
  const { def } = params;
  if (params.missing.length) {
    return needsData(def.needsDataCondition, params.inputs, params.missing, {
      code_reference: codeRef(def),
      source_code: 'SBC 201',
      source_edition: '2024',
      source_section: def.section,
      source_table: def.table,
      decision: 'NEEDS_DATA',
      occupancy: params.occupancy ?? null,
    });
  }

  // Attachment alone never PASS
  if ((moe(params.ctx).attachmentCount || 0) > 0 && params.measured == null) {
    return needsData('وجود مرفقات لا يكفي للـ PASS دون قياس/مدخلات موثّقة.', params.inputs, ['measured_value'], {
      code_reference: codeRef(def),
      decision: 'NEEDS_DATA',
    });
  }

  const thr = resolveSbc201Threshold({
    ruleId: def.ruleId,
    occupancy: params.occupancy,
    sprinklerStatus: params.sprinkler,
    projectMapping: params.mapping,
  });

  if (!thr || thr.value == null || thr.status === 'CODE_TABLE_REQUIRED') {
    return blockedCodeTable(def, params.inputs, { actual_value: params.measured, measured_value: params.measured });
  }

  const a = params.measured as number;
  const r = thr.value;
  const ok =
    params.mode === 'lte'
      ? a - 1e-9 <= r
      : params.mode === 'gte'
        ? a + 1e-9 >= r
        : Math.abs(a - r) < 1e-9;

  const ref = `${thr.sourceCode} ${thr.edition} §${thr.section}${thr.table ? ` / ${thr.table}` : ''}`;
  const base: Partial<ComplianceRuleEvaluation> = {
    inputs: params.inputs,
    occupancy: params.occupancy ?? null,
    actual_value: a,
    required_value: r,
    unit: thr.unit,
    measured_value: a,
    code_reference: ref,
    source_code: thr.sourceCode,
    source_edition: thr.edition,
    source_section: thr.section,
    source_table: thr.table,
    condition: thr.rowCondition,
    required_value_source: thr.status === 'VERIFIED' ? 'platform_code_table' : 'documented_code_mapping',
    decision: ok ? 'PASS' : 'FAIL',
    evidence: [
      evidence('measurement', 'actual', a, 'project'),
      evidence('document', 'required', r, thr.status, ref),
    ],
  };

  return ok
    ? passEval(`${def.title}: ${a} ${params.mode} ${r} ${thr.unit || ''}`.trim(), base)
    : failEval(`${def.title}: ${a} لا يحقق المطلوب ${r} ${thr.unit || ''}`.trim(), base);
}

function compareBoolean(params: {
  def: Sbc201EgressRuleDef;
  missing: string[];
  inputs: Record<string, string | number | boolean | null | undefined>;
  compliantFlag: boolean | null;
  mapping?: ProjectCodeMapping | null;
  occupancy?: string | null;
  sprinkler?: 'sprinklered' | 'non_sprinklered' | null;
}): ComplianceRuleEvaluation {
  const { def } = params;
  if (params.missing.length) {
    return needsData(def.needsDataCondition, params.inputs, params.missing, {
      code_reference: codeRef(def),
      source_code: 'SBC 201',
      source_edition: '2024',
      source_section: def.section,
      decision: 'NEEDS_DATA',
    });
  }

  const thr = resolveSbc201Threshold({
    ruleId: def.ruleId,
    occupancy: params.occupancy,
    sprinklerStatus: params.sprinkler,
    projectMapping: params.mapping,
  });

  // Boolean rules still need verified applicability mapping (value used as 1=required compliant path documented)
  if (!thr || thr.value == null || thr.status === 'CODE_TABLE_REQUIRED') {
    return blockedCodeTable(def, params.inputs);
  }

  if (params.compliantFlag == null) {
    return needsData('حالة الامتثال/التوثيق غير محددة رغم وجود مرجع.', params.inputs, ['compliance_flag'], {
      code_reference: codeRef(def),
      decision: 'NEEDS_DATA',
    });
  }

  const ref = `${thr.sourceCode} ${thr.edition} §${thr.section}`;
  const base: Partial<ComplianceRuleEvaluation> = {
    inputs: params.inputs,
    actual_value: params.compliantFlag,
    required_value: true,
    code_reference: ref,
    source_code: thr.sourceCode,
    source_edition: thr.edition,
    source_section: thr.section,
    source_table: thr.table,
    required_value_source: thr.status === 'VERIFIED' ? 'platform_code_table' : 'documented_code_mapping',
    decision: params.compliantFlag ? 'PASS' : 'FAIL',
    evidence: [evidence('document', 'applicability', thr.rowCondition, thr.status, ref)],
  };

  return params.compliantFlag
    ? passEval(`${def.title}: موثّق وفق SBC 201-2024.`, base)
    : failEval(`${def.title}: غير محقق وفق المرجع الموثّق.`, base);
}

function eval001(ctx: ComplianceRuleContext): ComplianceRuleEvaluation {
  const def = getSbc201EgressRuleDef('SBC201-EGR-001')!;
  const m = moe(ctx);
  const inputs = {
    occupancyGroup: m.occupancyGroup ?? null,
    spaceUse: m.spaceUse ?? null,
    grossArea: m.grossArea ?? null,
    netArea: m.netArea ?? null,
    applicableAreaBasis: m.applicableAreaBasis ?? null,
    occupantLoadFactor: m.occupantLoadFactor ?? null,
    calculatedOccupantLoad: m.calculatedOccupantLoad ?? null,
    designOccupantLoad: m.designOccupantLoad ?? null,
    storyOccupantLoad: m.storyOccupantLoad ?? null,
    buildingOccupantLoad: m.buildingOccupantLoad ?? null,
    attachmentCount: m.attachmentCount ?? null,
  };

  // Manual design load alone (or attachment) is never code PASS
  if ((m.attachmentCount || 0) > 0 && !okPos(m.occupantLoadFactor)) {
    return needsData(
      'المرفقات/إدخال حمل يدوي لا يُعتبر كودًا دون factor مربوط بجدول SBC 201-2024.',
      inputs,
      ['occupantLoadFactor', 'occupantLoadFactorMapping'],
      { code_reference: codeRef(def), decision: 'NEEDS_DATA' }
    );
  }

  const missing = missingOf([
    { key: 'occupancyGroup', ok: present(m.occupancyGroup) },
    { key: 'spaceUse', ok: present(m.spaceUse) },
    { key: 'applicableAreaBasis', ok: m.applicableAreaBasis === 'gross' || m.applicableAreaBasis === 'net' },
    {
      key: 'grossArea|netArea',
      ok:
        (m.applicableAreaBasis === 'gross' && okPos(m.grossArea)) ||
        (m.applicableAreaBasis === 'net' && okPos(m.netArea)) ||
        (m.applicableAreaBasis == null && (okPos(m.grossArea) || okPos(m.netArea))),
    },
    { key: 'designOccupantLoad', ok: okPos(m.designOccupantLoad) },
    { key: 'storyOccupantLoad', ok: okPos(m.storyOccupantLoad) },
    { key: 'buildingOccupantLoad', ok: okPos(m.buildingOccupantLoad) },
  ]);
  if (missing.length) {
    return needsData(def.needsDataCondition, inputs, missing, {
      code_reference: codeRef(def),
      source_edition: '2024',
      decision: 'NEEDS_DATA',
    });
  }

  const thr = resolveSbc201Threshold({
    ruleId: def.ruleId,
    occupancy: m.occupancyGroup,
    projectMapping: m.occupantLoadFactorMapping,
  });

  // Factor must come from verified/project 2024 mapping — raw number without mapping is not code
  if (!thr || thr.value == null || thr.status === 'CODE_TABLE_REQUIRED') {
    return blockedCodeTable(def, inputs);
  }

  const area =
    m.applicableAreaBasis === 'net' ? (m.netArea as number) : (m.grossArea as number) || (m.netArea as number);
  const factor = thr.value;
  const calculated = area / factor;
  const design = m.designOccupantLoad as number;
  const storedCalc = m.calculatedOccupantLoad;
  const calcOk = storedCalc == null || Math.abs(storedCalc - calculated) < 0.51;
  if (!calcOk) {
    return failEval(
      `حمل محسوب مخزّن (${storedCalc}) لا يطابق area/factor (${calculated.toFixed(2)}).`,
      {
        inputs: { ...inputs, engineCalculated: calculated, factor },
        actual_value: storedCalc,
        required_value: calculated,
        source_code: 'SBC 201',
        source_edition: '2024',
        source_section: '1004',
        decision: 'FAIL',
        code_reference: `${thr.sourceCode} ${thr.edition} §${thr.section}`,
      }
    );
  }

  const ok = design + 1e-9 >= calculated;
  const ref = `${thr.sourceCode} ${thr.edition} §${thr.section}${thr.table ? ` / ${thr.table}` : ''}`;
  const base: Partial<ComplianceRuleEvaluation> = {
    inputs: { ...inputs, factor, engineCalculated: Number(calculated.toFixed(4)) },
    actual_value: design,
    required_value: Number(calculated.toFixed(4)),
    unit: 'persons',
    measured_value: design,
    code_reference: ref,
    source_code: thr.sourceCode,
    source_edition: thr.edition,
    source_section: thr.section,
    source_table: thr.table,
    required_value_source: thr.status === 'VERIFIED' ? 'platform_code_table' : 'documented_code_mapping',
    decision: ok ? 'PASS' : 'FAIL',
    evidence: [
      evidence('calculation', 'area', area, 'project'),
      evidence('document', 'factor', factor, thr.status, ref),
      evidence('calculation', 'calculatedOccupantLoad', Number(calculated.toFixed(4)), 'engine'),
      evidence('document', 'designOccupantLoad', design, 'project'),
    ],
  };
  return ok
    ? passEval(`حمل تصميمي ${design} ≥ المحسوب ${calculated.toFixed(2)} (factor من SBC 201-2024).`, base)
    : failEval(`حمل تصميمي ${design} < المحسوب ${calculated.toFixed(2)}.`, base);
}

function buildRule(def: Sbc201EgressRuleDef): ComplianceRule {
  return {
    id: def.ruleId,
    code: 'SBC 201',
    section: `SBC 201-2024 §${def.section}`,
    title: def.title,
    title_ar: def.title_ar,
    applicability: { description: `${def.sourceCode}-${def.edition} §${def.section}` },
    requiredInputs: def.requiredInputs,
    severity: 'mandatory',
    evidenceRequired: def.evidenceRequired as ComplianceRule['evidenceRequired'],
    evaluate: (ctx) => evaluateById(def.ruleId, ctx),
  };
}

function evaluateById(ruleId: string, ctx: ComplianceRuleContext): ComplianceRuleEvaluation {
  const def = getSbc201EgressRuleDef(ruleId)!;
  const m = moe(ctx);

  switch (ruleId) {
    case 'SBC201-EGR-001':
      return eval001(ctx);

    case 'SBC201-EGR-002':
      return compareNumeric({
        def,
        ctx,
        missing: missingOf([
          { key: 'storyOccupantLoad', ok: okPos(m.storyOccupantLoad) },
          { key: 'occupancyGroup', ok: present(m.occupancyGroup) },
          { key: 'storyLevel', ok: present(m.storyLevel) },
          { key: 'sprinklerStatus', ok: m.sprinklerStatus === 'sprinklered' || m.sprinklerStatus === 'non_sprinklered' },
          { key: 'exitsProvided', ok: okNum(m.exitsProvided) },
          { key: 'exitAccessDoorways', ok: okNum(m.exitAccessDoorways) },
          { key: 'specialOccupancyCondition', ok: present(m.specialOccupancyCondition) },
        ]),
        inputs: {
          storyOccupantLoad: m.storyOccupantLoad ?? null,
          occupancyGroup: m.occupancyGroup ?? null,
          storyLevel: m.storyLevel ?? null,
          sprinklerStatus: m.sprinklerStatus ?? null,
          exitsProvided: m.exitsProvided ?? null,
          exitAccessDoorways: m.exitAccessDoorways ?? null,
          specialOccupancyCondition: m.specialOccupancyCondition ?? null,
        },
        measured: m.exitsProvided ?? null,
        mode: 'gte',
        mapping: m.numberOfExitsMapping,
        occupancy: m.occupancyGroup,
        sprinkler: m.sprinklerStatus,
      });

    case 'SBC201-EGR-003':
      return compareNumeric({
        def,
        ctx,
        missing: missingOf([
          { key: 'occupancy', ok: present(m.occupancy || m.occupancyGroup) },
          { key: 'story', ok: present(m.story || m.storyLevel) },
          { key: 'occupantLoad', ok: okPos(m.occupantLoad || m.storyOccupantLoad) },
          { key: 'sprinklerStatus', ok: m.sprinklerStatus === 'sprinklered' || m.sprinklerStatus === 'non_sprinklered' },
          { key: 'travelDistance', ok: okNum(m.travelDistance) },
          { key: 'commonPath', ok: okNum(m.commonPath) },
          { key: 'applicableTableException', ok: present(m.applicableTableException) },
        ]),
        inputs: {
          occupancy: m.occupancy || m.occupancyGroup || null,
          story: m.story || m.storyLevel || null,
          occupantLoad: m.occupantLoad ?? m.storyOccupantLoad ?? null,
          sprinklerStatus: m.sprinklerStatus ?? null,
          travelDistance: m.travelDistance ?? null,
          commonPath: m.commonPath ?? null,
          applicableTableException: m.applicableTableException ?? null,
        },
        // Use travel distance against exception limit when mapped
        measured: m.travelDistance ?? null,
        mode: 'lte',
        mapping: m.singleExitMapping,
        occupancy: m.occupancy || m.occupancyGroup,
        sprinkler: m.sprinklerStatus,
      });

    case 'SBC201-EGR-004': {
      const missing = missingOf([
        { key: 'occupantLoadServed', ok: okPos(m.occupantLoadServed) },
        { key: 'exitComponentType', ok: present(m.exitComponentType) },
        { key: 'clearWidth', ok: okPos(m.clearWidth) },
        { key: 'applicableCapacityFactor', ok: okPos(m.applicableCapacityFactor) },
        { key: 'sprinklerCondition', ok: present(m.sprinklerCondition) },
        { key: 'applicableTableSection', ok: present(m.applicableTableSection) },
      ]);
      const inputs = {
        occupantLoadServed: m.occupantLoadServed ?? null,
        exitComponentType: m.exitComponentType ?? null,
        clearWidth: m.clearWidth ?? null,
        applicableCapacityFactor: m.applicableCapacityFactor ?? null,
        sprinklerCondition: m.sprinklerCondition ?? null,
        applicableTableSection: m.applicableTableSection ?? null,
      };
      if (missing.length) {
        return needsData(def.needsDataCondition, inputs, missing, {
          code_reference: codeRef(def),
          source_edition: '2024',
          decision: 'NEEDS_DATA',
        });
      }
      // Factor must be verified via mapping — raw factor without 2024 mapping → BLOCKED
      const thr = resolveSbc201Threshold({
        ruleId: def.ruleId,
        projectMapping: m.capacityMapping,
        sprinklerStatus: m.sprinklerStatus,
      });
      if (!thr || thr.value == null || thr.status === 'CODE_TABLE_REQUIRED') {
        return blockedCodeTable(def, inputs);
      }
      // Mapping value = capacity factor; provided capacity = clearWidth / factor
      const factor = thr.value;
      const provided = (m.clearWidth as number) / factor;
      const required = m.occupantLoadServed as number;
      const ok = provided + 1e-9 >= required;
      const ref = `${thr.sourceCode} ${thr.edition} §${thr.section}`;
      const base: Partial<ComplianceRuleEvaluation> = {
        inputs: { ...inputs, providedEgressCapacity: provided, requiredEgressCapacity: required, factor },
        actual_value: provided,
        required_value: required,
        unit: 'persons',
        code_reference: ref,
        source_code: thr.sourceCode,
        source_edition: thr.edition,
        source_section: thr.section,
        decision: ok ? 'PASS' : 'FAIL',
        required_value_source: thr.status === 'VERIFIED' ? 'platform_code_table' : 'documented_code_mapping',
        evidence: [
          evidence('measurement', 'clearWidth', m.clearWidth, 'project'),
          evidence('document', 'capacityFactor', factor, thr.status, ref),
          evidence('calculation', 'providedCapacity', provided, 'engine'),
        ],
      };
      return ok
        ? passEval(`سعة متوفرة ${provided.toFixed(2)} ≥ المطلوب ${required}.`, base)
        : failEval(`سعة متوفرة ${provided.toFixed(2)} < المطلوب ${required}.`, base);
    }

    case 'SBC201-EGR-005':
      return compareNumeric({
        def,
        ctx,
        missing: missingOf([
          { key: 'requiredExitCount', ok: okPos(m.requiredExitCount) },
          { key: 'areaDimensions', ok: present(m.areaDimensions) },
          { key: 'diagonalDimension', ok: okPos(m.diagonalDimension) },
          { key: 'exitToExitDistance', ok: okPos(m.exitToExitDistance) },
          { key: 'sprinklerStatus', ok: m.sprinklerStatus === 'sprinklered' || m.sprinklerStatus === 'non_sprinklered' },
          { key: 'applicableException', ok: present(m.applicableException) },
        ]),
        inputs: {
          requiredExitCount: m.requiredExitCount ?? null,
          areaDimensions: m.areaDimensions ?? null,
          diagonalDimension: m.diagonalDimension ?? null,
          exitToExitDistance: m.exitToExitDistance ?? null,
          sprinklerStatus: m.sprinklerStatus ?? null,
          applicableException: m.applicableException ?? null,
        },
        measured: m.exitToExitDistance ?? null,
        mode: 'gte',
        mapping: m.separationMapping,
        sprinkler: m.sprinklerStatus,
      });

    case 'SBC201-EGR-006':
      return compareNumeric({
        def,
        ctx,
        missing: missingOf([
          { key: 'occupancy', ok: present(m.occupancy || m.occupancyGroup) },
          { key: 'occupantLoad', ok: okPos(m.occupantLoad || m.storyOccupantLoad) },
          { key: 'sprinklerStatus', ok: m.sprinklerStatus === 'sprinklered' || m.sprinklerStatus === 'non_sprinklered' },
          { key: 'commonPathDistance', ok: okNum(m.commonPathDistance ?? m.commonPath) },
          { key: 'applicableTableSection', ok: present(m.applicableTableSection) },
        ]),
        inputs: {
          occupancy: m.occupancy || m.occupancyGroup || null,
          occupantLoad: m.occupantLoad ?? m.storyOccupantLoad ?? null,
          sprinklerStatus: m.sprinklerStatus ?? null,
          commonPathDistance: m.commonPathDistance ?? m.commonPath ?? null,
          applicableTableSection: m.applicableTableSection ?? null,
        },
        measured: m.commonPathDistance ?? m.commonPath ?? null,
        mode: 'lte',
        mapping: m.commonPathMapping,
        occupancy: m.occupancy || m.occupancyGroup,
        sprinkler: m.sprinklerStatus,
      });

    case 'SBC201-EGR-007':
      return compareNumeric({
        def,
        ctx,
        missing: missingOf([
          { key: 'occupancy', ok: present(m.occupancy || m.occupancyGroup) },
          { key: 'sprinklerStatus', ok: m.sprinklerStatus === 'sprinklered' || m.sprinklerStatus === 'non_sprinklered' },
          { key: 'travelDistance', ok: okPos(m.travelDistance) },
          { key: 'specialCondition', ok: present(m.specialCondition) },
          { key: 'applicableException', ok: present(m.applicableException) },
        ]),
        inputs: {
          occupancy: m.occupancy || m.occupancyGroup || null,
          sprinklerStatus: m.sprinklerStatus ?? null,
          travelDistance: m.travelDistance ?? null,
          specialCondition: m.specialCondition ?? null,
          applicableException: m.applicableException ?? null,
        },
        measured: m.travelDistance ?? null,
        mode: 'lte',
        mapping: m.travelDistanceMapping,
        occupancy: m.occupancy || m.occupancyGroup,
        sprinkler: m.sprinklerStatus,
      });

    case 'SBC201-EGR-008':
      return compareNumeric({
        def,
        ctx,
        missing: missingOf([
          { key: 'occupancy', ok: present(m.occupancy || m.occupancyGroup) },
          { key: 'occupantLoadServed', ok: okPos(m.occupantLoadServed) },
          { key: 'corridorType', ok: present(m.corridorType) },
          { key: 'clearWidth', ok: okPos(m.corridorClearWidth ?? m.clearWidth) },
          { key: 'applicableTableSection', ok: present(m.applicableTableSection) },
        ]),
        inputs: {
          occupancy: m.occupancy || m.occupancyGroup || null,
          occupantLoadServed: m.occupantLoadServed ?? null,
          corridorType: m.corridorType ?? null,
          clearWidth: m.corridorClearWidth ?? m.clearWidth ?? null,
          applicableTableSection: m.applicableTableSection ?? null,
        },
        measured: m.corridorClearWidth ?? m.clearWidth ?? null,
        mode: 'gte',
        mapping: m.corridorMapping,
        occupancy: m.occupancy || m.occupancyGroup,
      });

    case 'SBC201-EGR-009':
      return compareNumeric({
        def,
        ctx,
        missing: missingOf([
          { key: 'occupancy', ok: present(m.occupancy || m.occupancyGroup) },
          { key: 'sprinklerStatus', ok: m.sprinklerStatus === 'sprinklered' || m.sprinklerStatus === 'non_sprinklered' },
          { key: 'deadEndLength', ok: okNum(m.deadEndLength) },
          { key: 'corridorConfiguration', ok: present(m.corridorConfiguration) },
          { key: 'applicableException', ok: present(m.applicableException) },
        ]),
        inputs: {
          occupancy: m.occupancy || m.occupancyGroup || null,
          sprinklerStatus: m.sprinklerStatus ?? null,
          deadEndLength: m.deadEndLength ?? null,
          corridorConfiguration: m.corridorConfiguration ?? null,
          applicableException: m.applicableException ?? null,
        },
        measured: m.deadEndLength ?? null,
        mode: 'lte',
        mapping: m.deadEndMapping,
        occupancy: m.occupancy || m.occupancyGroup,
        sprinkler: m.sprinklerStatus,
      });

    case 'SBC201-EGR-010':
      return compareNumeric({
        def,
        ctx,
        missing: missingOf([
          { key: 'doorType', ok: present(m.doorType) },
          { key: 'clearOpeningWidth', ok: okPos(m.clearOpeningWidth) },
          { key: 'leafWidth', ok: okPos(m.leafWidth) },
          { key: 'occupantLoadServed', ok: okPos(m.occupantLoadServed) },
          { key: 'egressDirection', ok: present(m.egressDirection) },
          { key: 'doorLocation', ok: present(m.doorLocation) },
        ]),
        inputs: {
          doorType: m.doorType ?? null,
          clearOpeningWidth: m.clearOpeningWidth ?? null,
          leafWidth: m.leafWidth ?? null,
          occupantLoadServed: m.occupantLoadServed ?? null,
          egressDirection: m.egressDirection ?? null,
          doorLocation: m.doorLocation ?? null,
        },
        measured: m.clearOpeningWidth ?? null,
        mode: 'gte',
        mapping: m.doorClearMapping,
      });

    case 'SBC201-EGR-011':
      return compareBoolean({
        def,
        missing: missingOf([
          { key: 'occupantLoad', ok: okPos(m.occupantLoad || m.occupantLoadServed) },
          { key: 'occupancy', ok: present(m.occupancy || m.occupancyGroup) },
          { key: 'doorLocation', ok: present(m.doorLocation) },
          { key: 'doorSwingDirection', ok: present(m.doorSwingDirection) },
          { key: 'egressCondition', ok: present(m.egressCondition) },
          { key: 'applicableSection', ok: present(m.applicableSection) },
        ]),
        inputs: {
          occupantLoad: m.occupantLoad ?? m.occupantLoadServed ?? null,
          occupancy: m.occupancy || m.occupancyGroup || null,
          doorLocation: m.doorLocation ?? null,
          doorSwingDirection: m.doorSwingDirection ?? null,
          egressCondition: m.egressCondition ?? null,
          applicableSection: m.applicableSection ?? null,
        },
        // Mapping value 1 = requirement documented; compliant when swing matches documented requirement text
        compliantFlag: m.doorSwingMapping ? present(m.doorSwingDirection) && m.doorSwingMapping.value > 0 : null,
        mapping: m.doorSwingMapping,
        occupancy: m.occupancy || m.occupancyGroup,
      });

    case 'SBC201-EGR-012':
      return compareBoolean({
        def,
        missing: missingOf([
          { key: 'occupancy', ok: present(m.occupancy || m.occupancyGroup) },
          { key: 'occupantLoad', ok: okPos(m.occupantLoad || m.storyOccupantLoad) },
          { key: 'doorType', ok: present(m.doorType) },
          { key: 'lockingType', ok: present(m.lockingType) },
          { key: 'panicHardware', ok: m.panicHardware != null },
          { key: 'fireExitHardware', ok: m.fireExitHardware != null },
          { key: 'applicableSection', ok: present(m.applicableSection) },
        ]),
        inputs: {
          occupancy: m.occupancy || m.occupancyGroup || null,
          occupantLoad: m.occupantLoad ?? m.storyOccupantLoad ?? null,
          doorType: m.doorType ?? null,
          lockingType: m.lockingType ?? null,
          panicHardware: m.panicHardware ?? null,
          fireExitHardware: m.fireExitHardware ?? null,
          applicableSection: m.applicableSection ?? null,
        },
        compliantFlag:
          m.panicHardwareMapping == null
            ? null
            : Boolean(m.panicHardware || m.fireExitHardware),
        mapping: m.panicHardwareMapping,
        occupancy: m.occupancy || m.occupancyGroup,
      });

    case 'SBC201-EGR-013':
      return compareNumeric({
        def,
        ctx,
        missing: missingOf([
          { key: 'occupantLoadServed', ok: okPos(m.occupantLoadServed) },
          { key: 'stairCount', ok: okPos(m.stairCount) },
          { key: 'clearWidth', ok: okPos(m.stairClearWidth ?? m.clearWidth) },
          { key: 'occupancy', ok: present(m.occupancy || m.occupancyGroup) },
          { key: 'sprinklerStatus', ok: m.sprinklerStatus === 'sprinklered' || m.sprinklerStatus === 'non_sprinklered' },
          { key: 'applicableSectionTable', ok: present(m.applicableSectionTable) },
        ]),
        inputs: {
          occupantLoadServed: m.occupantLoadServed ?? null,
          stairCount: m.stairCount ?? null,
          clearWidth: m.stairClearWidth ?? m.clearWidth ?? null,
          occupancy: m.occupancy || m.occupancyGroup || null,
          sprinklerStatus: m.sprinklerStatus ?? null,
          applicableSectionTable: m.applicableSectionTable ?? null,
        },
        measured: m.stairClearWidth ?? m.clearWidth ?? null,
        mode: 'gte',
        mapping: m.stairWidthMapping,
        occupancy: m.occupancy || m.occupancyGroup,
        sprinkler: m.sprinklerStatus,
      });

    case 'SBC201-EGR-014':
      return compareNumeric({
        def,
        ctx,
        missing: missingOf([
          { key: 'riserHeight', ok: okPos(m.riserHeight) },
          { key: 'stairType', ok: present(m.stairType) },
          { key: 'applicableSectionTable', ok: present(m.applicableSectionTable) },
        ]),
        inputs: {
          riserHeight: m.riserHeight ?? null,
          stairType: m.stairType ?? null,
          applicableSectionTable: m.applicableSectionTable ?? null,
        },
        measured: m.riserHeight ?? null,
        mode: 'lte',
        mapping: m.riserMapping,
      });

    case 'SBC201-EGR-015':
      return compareNumeric({
        def,
        ctx,
        missing: missingOf([
          { key: 'treadDepth', ok: okPos(m.treadDepth) },
          { key: 'stairType', ok: present(m.stairType) },
          { key: 'applicableSectionTable', ok: present(m.applicableSectionTable) },
        ]),
        inputs: {
          treadDepth: m.treadDepth ?? null,
          stairType: m.stairType ?? null,
          applicableSectionTable: m.applicableSectionTable ?? null,
        },
        measured: m.treadDepth ?? null,
        mode: 'gte',
        mapping: m.treadMapping,
      });

    case 'SBC201-EGR-016':
      return compareNumeric({
        def,
        ctx,
        missing: missingOf([
          { key: 'headroom', ok: okPos(m.headroom) },
          { key: 'stairType', ok: present(m.stairType) },
          { key: 'applicableSectionTable', ok: present(m.applicableSectionTable) },
        ]),
        inputs: {
          headroom: m.headroom ?? null,
          stairType: m.stairType ?? null,
          applicableSectionTable: m.applicableSectionTable ?? null,
        },
        measured: m.headroom ?? null,
        mode: 'gte',
        mapping: m.headroomMapping,
      });

    case 'SBC201-EGR-017':
      return compareNumeric({
        def,
        ctx,
        missing: missingOf([
          { key: 'landingWidth', ok: okPos(m.landingWidth) },
          { key: 'landingDepth', ok: okPos(m.landingDepth) },
          { key: 'stairWidth', ok: okPos(m.stairWidth ?? m.stairClearWidth) },
          { key: 'doorSwing', ok: present(m.doorSwing) },
          { key: 'applicableSectionTable', ok: present(m.applicableSectionTable) },
        ]),
        inputs: {
          landingWidth: m.landingWidth ?? null,
          landingDepth: m.landingDepth ?? null,
          stairWidth: m.stairWidth ?? m.stairClearWidth ?? null,
          doorSwing: m.doorSwing ?? null,
          applicableSectionTable: m.applicableSectionTable ?? null,
        },
        measured: Math.min(m.landingWidth || 0, m.landingDepth || 0) || null,
        mode: 'gte',
        mapping: m.landingMapping,
      });

    case 'SBC201-EGR-018':
      return compareNumeric({
        def,
        ctx,
        missing: missingOf([
          { key: 'rampWidth', ok: okPos(m.rampWidth) },
          { key: 'slope', ok: okPos(m.slope) },
          { key: 'rise', ok: okNum(m.rise) },
          { key: 'run', ok: okPos(m.run) },
          { key: 'landing', ok: present(m.landing) },
          { key: 'handrail', ok: present(m.handrail) },
          { key: 'occupancy', ok: present(m.occupancy || m.occupancyGroup) },
          { key: 'egressUse', ok: present(m.egressUse) },
          { key: 'applicableSectionTable', ok: present(m.applicableSectionTable) },
        ]),
        inputs: {
          rampWidth: m.rampWidth ?? null,
          slope: m.slope ?? null,
          rise: m.rise ?? null,
          run: m.run ?? null,
          landing: m.landing ?? null,
          handrail: m.handrail ?? null,
          occupancy: m.occupancy || m.occupancyGroup || null,
          egressUse: m.egressUse ?? null,
          applicableSectionTable: m.applicableSectionTable ?? null,
        },
        measured: m.slope ?? null,
        mode: 'lte',
        mapping: m.rampMapping,
        occupancy: m.occupancy || m.occupancyGroup,
      });

    case 'SBC201-EGR-019':
      return compareBoolean({
        def,
        missing: missingOf([
          { key: 'exitSignRequired', ok: m.exitSignRequired != null },
          { key: 'signProvided', ok: m.signProvided != null },
          { key: 'visibility', ok: present(m.visibility) },
          { key: 'directionalSign', ok: m.directionalSign != null },
          { key: 'emergencyPower', ok: m.emergencyPower != null },
          { key: 'applicableCondition', ok: present(m.applicableCondition) },
        ]),
        inputs: {
          exitSignRequired: m.exitSignRequired ?? null,
          signProvided: m.signProvided ?? null,
          visibility: m.visibility ?? null,
          directionalSign: m.directionalSign ?? null,
          emergencyPower: m.emergencyPower ?? null,
          applicableCondition: m.applicableCondition ?? null,
        },
        compliantFlag:
          m.exitSignMapping == null
            ? null
            : m.exitSignRequired === false
              ? true
              : Boolean(m.signProvided && m.emergencyPower),
        mapping: m.exitSignMapping,
      });

    case 'SBC201-EGR-020':
      return compareNumeric({
        def,
        ctx,
        missing: missingOf([
          { key: 'handrailRequired', ok: m.handrailRequired != null },
          { key: 'height', ok: okPos(m.height) },
          { key: 'continuity', ok: m.continuity != null },
          { key: 'extensions', ok: m.extensions != null },
          { key: 'clearance', ok: okPos(m.clearance) },
          { key: 'sides', ok: present(m.sides) },
          { key: 'stairOrRampType', ok: present(m.stairOrRampType) },
        ]),
        inputs: {
          handrailRequired: m.handrailRequired ?? null,
          height: m.height ?? null,
          continuity: m.continuity ?? null,
          extensions: m.extensions ?? null,
          clearance: m.clearance ?? null,
          sides: m.sides ?? null,
          stairOrRampType: m.stairOrRampType ?? null,
        },
        measured: m.height ?? null,
        mode: 'gte',
        mapping: m.handrailMapping,
      });

    case 'SBC201-EGR-021':
      return compareNumeric({
        def,
        ctx,
        missing: missingOf([
          { key: 'guardRequired', ok: m.guardRequired != null },
          { key: 'height', ok: okPos(m.height) },
          { key: 'openingSize', ok: okNum(m.openingSize) },
          { key: 'location', ok: present(m.location) },
          { key: 'occupancyUse', ok: present(m.occupancyUse || m.occupancy) },
          { key: 'applicableCondition', ok: present(m.applicableCondition) },
        ]),
        inputs: {
          guardRequired: m.guardRequired ?? null,
          height: m.height ?? null,
          openingSize: m.openingSize ?? null,
          location: m.location ?? null,
          occupancyUse: m.occupancyUse || m.occupancy || null,
          applicableCondition: m.applicableCondition ?? null,
        },
        measured: m.height ?? null,
        mode: 'gte',
        mapping: m.guardMapping,
        occupancy: m.occupancyUse || m.occupancy,
      });

    case 'SBC201-EGR-022':
      return compareBoolean({
        def,
        missing: missingOf([
          { key: 'pathGeometry', ok: present(m.pathGeometry) },
          { key: 'interveningRooms', ok: present(m.interveningRooms) },
          { key: 'accessPath', ok: present(m.accessPath) },
          { key: 'exitAccessCondition', ok: present(m.exitAccessCondition) },
          { key: 'applicableExceptions', ok: present(m.applicableExceptions) },
        ]),
        inputs: {
          pathGeometry: m.pathGeometry ?? null,
          interveningRooms: m.interveningRooms ?? null,
          accessPath: m.accessPath ?? null,
          exitAccessCondition: m.exitAccessCondition ?? null,
          applicableExceptions: m.applicableExceptions ?? null,
        },
        compliantFlag: m.exitAccessMapping == null ? null : present(m.exitAccessCondition),
        mapping: m.exitAccessMapping,
      });

    case 'SBC201-EGR-023':
      return compareBoolean({
        def,
        missing: missingOf([
          { key: 'componentType', ok: present(m.componentType) },
          { key: 'storiesConnected', ok: okPos(m.storiesConnected) },
          { key: 'enclosureCondition', ok: present(m.enclosureCondition) },
          { key: 'sprinklerStatus', ok: m.sprinklerStatus === 'sprinklered' || m.sprinklerStatus === 'non_sprinklered' },
          { key: 'occupancy', ok: present(m.occupancy || m.occupancyGroup) },
          { key: 'applicableSection', ok: present(m.applicableSection) },
        ]),
        inputs: {
          componentType: m.componentType ?? null,
          storiesConnected: m.storiesConnected ?? null,
          enclosureCondition: m.enclosureCondition ?? null,
          sprinklerStatus: m.sprinklerStatus ?? null,
          occupancy: m.occupancy || m.occupancyGroup || null,
          applicableSection: m.applicableSection ?? null,
        },
        compliantFlag: m.exitAccessStairMapping == null ? null : present(m.enclosureCondition),
        mapping: m.exitAccessStairMapping,
        occupancy: m.occupancy || m.occupancyGroup,
        sprinkler: m.sprinklerStatus,
      });

    case 'SBC201-EGR-024':
      return compareBoolean({
        def,
        missing: missingOf([
          { key: 'enclosure', ok: present(m.enclosure) },
          { key: 'fireResistance', ok: okPos(m.fireResistance) },
          { key: 'openingProtection', ok: present(m.openingProtection) },
          { key: 'penetrations', ok: present(m.penetrations) },
          { key: 'continuity', ok: present(m.continuityStr) },
          { key: 'discharge', ok: present(m.discharge) },
          { key: 'smokeProtectionIfRequired', ok: present(m.smokeProtectionIfRequired) },
        ]),
        inputs: {
          enclosure: m.enclosure ?? null,
          fireResistance: m.fireResistance ?? null,
          openingProtection: m.openingProtection ?? null,
          penetrations: m.penetrations ?? null,
          continuity: m.continuityStr ?? null,
          discharge: m.discharge ?? null,
          smokeProtectionIfRequired: m.smokeProtectionIfRequired ?? null,
        },
        compliantFlag: m.interiorExitStairMapping == null ? null : present(m.enclosure),
        mapping: m.interiorExitStairMapping,
      });

    case 'SBC201-EGR-025':
      return compareNumeric({
        def,
        ctx,
        missing: missingOf([
          { key: 'width', ok: okPos(m.width) },
          { key: 'occupantLoad', ok: okPos(m.occupantLoad) },
          { key: 'fireResistance', ok: okPos(m.fireResistance) },
          { key: 'openingProtection', ok: present(m.openingProtection) },
          { key: 'continuity', ok: present(m.continuityStr) },
          { key: 'discharge', ok: present(m.discharge) },
        ]),
        inputs: {
          width: m.width ?? null,
          occupantLoad: m.occupantLoad ?? null,
          fireResistance: m.fireResistance ?? null,
          openingProtection: m.openingProtection ?? null,
          continuity: m.continuityStr ?? null,
          discharge: m.discharge ?? null,
        },
        measured: m.width ?? null,
        mode: 'gte',
        mapping: m.exitPassagewayMapping,
      });

    case 'SBC201-EGR-026':
      return compareNumeric({
        def,
        ctx,
        missing: missingOf([
          { key: 'horizontalExit', ok: m.horizontalExit != null },
          { key: 'occupancy', ok: present(m.occupancy || m.occupancyGroup) },
          { key: 'occupantLoad', ok: okPos(m.occupantLoad) },
          { key: 'refugeArea', ok: okPos(m.refugeArea) },
          { key: 'fireBarrier', ok: present(m.fireBarrier) },
          { key: 'openingProtection', ok: present(m.openingProtection) },
          { key: 'capacity', ok: okPos(m.capacity) },
        ]),
        inputs: {
          horizontalExit: m.horizontalExit ?? null,
          occupancy: m.occupancy || m.occupancyGroup || null,
          occupantLoad: m.occupantLoad ?? null,
          refugeArea: m.refugeArea ?? null,
          fireBarrier: m.fireBarrier ?? null,
          openingProtection: m.openingProtection ?? null,
          capacity: m.capacity ?? null,
        },
        measured: m.capacity ?? null,
        mode: 'gte',
        mapping: m.horizontalExitMapping,
        occupancy: m.occupancy || m.occupancyGroup,
      });

    case 'SBC201-EGR-027':
      return compareBoolean({
        def,
        missing: missingOf([
          { key: 'exitDischarge', ok: present(m.exitDischarge) },
          { key: 'dischargePath', ok: present(m.dischargePath) },
          { key: 'width', ok: okPos(m.width) },
          { key: 'publicWay', ok: present(m.publicWay) },
          { key: 'obstruction', ok: present(m.obstruction) },
          { key: 'levelChange', ok: present(m.levelChange) },
          { key: 'doorCondition', ok: present(m.doorCondition) },
        ]),
        inputs: {
          exitDischarge: m.exitDischarge ?? null,
          dischargePath: m.dischargePath ?? null,
          width: m.width ?? null,
          publicWay: m.publicWay ?? null,
          obstruction: m.obstruction ?? null,
          levelChange: m.levelChange ?? null,
          doorCondition: m.doorCondition ?? null,
        },
        compliantFlag: m.exitDischargeMapping == null ? null : present(m.publicWay),
        mapping: m.exitDischargeMapping,
      });

    case 'SBC201-EGR-028':
      return compareNumeric({
        def,
        ctx,
        missing: missingOf([
          { key: 'courtWidth', ok: okPos(m.courtWidth) },
          { key: 'courtLength', ok: okPos(m.courtLength) },
          { key: 'obstruction', ok: present(m.obstruction) },
          { key: 'exitAccess', ok: present(m.exitAccess) },
          { key: 'dischargeRelationship', ok: present(m.dischargeRelationship) },
        ]),
        inputs: {
          courtWidth: m.courtWidth ?? null,
          courtLength: m.courtLength ?? null,
          obstruction: m.obstruction ?? null,
          exitAccess: m.exitAccess ?? null,
          dischargeRelationship: m.dischargeRelationship ?? null,
        },
        measured: m.courtWidth ?? null,
        mode: 'gte',
        mapping: m.egressCourtMapping,
      });

    default:
      return needsData(`قاعدة غير معرّفة: ${ruleId}`, {}, ['ruleId']);
  }
}

export const SBC201_EGRESS_COMPLIANCE_RULES: ComplianceRule[] = SBC201_EGRESS_RULES.map(buildRule);
