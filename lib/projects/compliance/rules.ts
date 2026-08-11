/**
 * Deterministic SBC 201 / SBC 801 compliance rules registry.
 * Missing required inputs → NEEDS_DATA (never PASS by assumption).
 * Threshold comparisons use in-repo documented sources only.
 */

import {
  compareToThreshold,
  evidence,
  failEval,
  hasNonEmpty,
  naEval,
  needsData,
  parseYesNoUnknown,
  passEval,
} from '@/lib/projects/compliance/evidence';
import { SBC_OCCUPANCIES, SBC_STRUCTURE_RULES, type SbcOccupancyCode } from '@/lib/constants/sbc801';
import {
  occupancyLabel,
  requiredExitsFromOccupantLoad,
  resolveCorridorMinWidthM,
  resolveDoorMinWidthM,
  resolveExitSeparationMinM,
  resolveFireAccessMinWidthM,
  resolveStairMinWidthM,
  resolveTravelDistanceLimitM,
} from '@/lib/projects/compliance/thresholds';
import { citationFor } from '@/lib/projects/compliance/code-refs';
import type {
  ComplianceRule,
  ComplianceRuleContext,
  ComplianceRuleEvaluation,
} from '@/lib/projects/compliance/types';

export { requiredExitsFromOccupantLoad } from '@/lib/projects/compliance/thresholds';

function ref(ruleId: string): string {
  return citationFor(ruleId);
}

// ─── Context helpers ─────────────────────────────────────────────────────────

function primaryOccupancyDef(ctx: ComplianceRuleContext) {
  const code = (ctx.building.primary_occupancy_code ||
    ctx.occupancyZones.find((z) => hasNonEmpty(z.occupancy_code))?.occupancy_code) as
    | SbcOccupancyCode
    | undefined;
  if (code && SBC_OCCUPANCIES[code]) return SBC_OCCUPANCIES[code];
  return null;
}

function occupancyContext(ctx: ComplianceRuleContext) {
  const zone = ctx.occupancyZones.find((z) => hasNonEmpty(z.occupancy_code));
  return {
    code: ctx.building.primary_occupancy_code || zone?.occupancy_code || null,
    group: ctx.building.group_letter || zone?.group_letter || null,
    classification: ctx.building.occupancy_classification || null,
  };
}

function occLabel(ctx: ComplianceRuleContext): string | null {
  return occupancyLabel(ctx);
}

function resolveSprinklerRequired(
  ctx: ComplianceRuleContext
): { required: boolean; code_reference: string; condition: string } | null {
  const def = primaryOccupancyDef(ctx);
  const area = ctx.building.building_area_m2;
  const explicit = ctx.fireProtection.sprinkler_required;
  const refs = def?.sbc_refs.filter((r) => r.includes('SPR') || r.includes('Ch')).join(', ') || ref('FP-01');

  if (explicit === 'yes') {
    return { required: true, code_reference: `${refs} / engineer_input`, condition: 'sprinkler_required=yes' };
  }
  if (explicit === 'no') {
    return { required: false, code_reference: `${refs} / engineer_input`, condition: 'sprinkler_required=no' };
  }
  if (def?.sprinkler_always) {
    return { required: true, code_reference: refs, condition: `occupancy=${def.code}; sprinkler_always=true` };
  }
  if (def?.sprinkler_total_area_m2 != null && area != null) {
    return {
      required: area >= def.sprinkler_total_area_m2,
      code_reference: refs,
      condition: `building_area_m2=${area} vs sprinkler_total_area_m2=${def.sprinkler_total_area_m2}`,
    };
  }
  if (def?.sprinkler_fire_area_m2 != null && area != null) {
    return {
      required: area >= def.sprinkler_fire_area_m2,
      code_reference: refs,
      condition: `building_area_m2=${area} vs sprinkler_fire_area_m2=${def.sprinkler_fire_area_m2}`,
    };
  }
  return null;
}

function sprinklerInScope(ctx: ComplianceRuleContext): boolean {
  const resolved = resolveSprinklerRequired(ctx);
  if (resolved?.required) return true;
  return ctx.fireProtection.sprinkler_required === 'yes' || ctx.fireProtection.sprinkler_provided === 'yes';
}

function resolveAlarmRequired(
  ctx: ComplianceRuleContext
): { required: boolean; code_reference: string; condition: string } | null {
  const def = primaryOccupancyDef(ctx);
  const load = ctx.egress.occupant_load_total;
  const plan = ctx.fireAlarm.building_plan_alarm;
  const refs =
    def?.sbc_refs.filter((r) => r.includes('ALM')).join(', ') || ref('FA-01');

  if (def?.alarm_always) {
    return { required: true, code_reference: refs, condition: `occupancy=${def.code}; alarm_always=true` };
  }
  if (def?.alarm_occupants_building != null && load != null) {
    return {
      required: load >= def.alarm_occupants_building,
      code_reference: refs,
      condition: `occupant_load=${load} vs alarm_occupants_building=${def.alarm_occupants_building}`,
    };
  }
  if (plan === 'yes') {
    return { required: true, code_reference: refs, condition: 'building_plan_alarm=yes' };
  }
  if (plan === 'no') {
    return { required: false, code_reference: refs, condition: 'building_plan_alarm=no' };
  }
  return null;
}

function alarmRequired(ctx: ComplianceRuleContext): boolean {
  const resolved = resolveAlarmRequired(ctx);
  return resolved?.required === true;
}

function egressNotesEvidence(ctx: ComplianceRuleContext, label: string) {
  const note = ctx.egress.notes;
  const metric = ctx.egress.metrics.find((m) => m.label.toLowerCase().includes(label.toLowerCase()));
  if (hasNonEmpty(note)) return evidence('document', 'egress_notes', note, 'project');
  if (metric) return evidence('measurement', metric.label, metric.value, 'egress.metrics');
  return evidence('document', label, true, 'project');
}

// ─── Occupancy & building classification ─────────────────────────────────────

const occupancyRules: ComplianceRule[] = [
  {
    id: 'OCC-01',
    code: 'SBC 201',
    section: 'Ch.3 / Occupancy Classification',
    title: 'Occupancy classification present',
    title_ar: 'تصنيف الإشغال موثّق',
    applicability: { description: 'Always — building must have occupancy classification' },
    requiredInputs: ['occupancy_classification OR zone occupancy_code'],
    severity: 'mandatory',
    evidenceRequired: ['document', 'drawing'],
    evaluate: (ctx) => {
      const occ = ctx.building.occupancy_classification;
      const zoneOcc = ctx.occupancyZones.some((z) => hasNonEmpty(z.occupancy_code));
      const inputs = {
        occupancy_classification: occ,
        zones_with_code: ctx.occupancyZones.filter((z) => z.occupancy_code).length,
      };
      if (!hasNonEmpty(occ) && !zoneOcc) {
        return needsData('تصنيف الإشغال غير موثّق (لا يعتمد على القائمة وحدها دون قيمة).', inputs, [
          'occupancy_classification',
        ]);
      }
      const actual = occ || ctx.occupancyZones.find((z) => z.occupancy_code)?.occupancy_code;
      return passEval('تصنيف الإشغال متوفر من المخطط/المناطق.', {
        inputs,
        actual_value: actual ?? null,
        required_value: 'occupancy_classification_documented',
        code_reference: ref('OCC-01'),
        occupancy: occLabel(ctx),
        required_value_source: 'documentation_completeness',
        evidence: [evidence('document', 'occupancy', actual, 'project', ref('OCC-01'))],
      });
    },
  },
  {
    id: 'OCC-02',
    code: 'SBC 201',
    section: 'Ch.3 Occupancy Groups',
    title: 'Occupancy group letter',
    title_ar: 'مجموعة الإشغال (Group)',
    applicability: { description: 'When occupancy is classified' },
    requiredInputs: ['group_letter'],
    severity: 'mandatory',
    evidenceRequired: ['document'],
    evaluate: (ctx) => {
      const g = ctx.building.group_letter || ctx.occupancyZones.find((z) => z.group_letter)?.group_letter;
      const inputs = { group_letter: g };
      if (!hasNonEmpty(g)) return needsData('حرف مجموعة الإشغال غير محدد.', inputs, ['group_letter'], { code_reference: ref('OCC-02') });
      return passEval(`مجموعة الإشغال: ${g}`, {
        inputs,
        actual_value: g,
        required_value: 'group_letter_documented',
        code_reference: ref('OCC-02'),
        occupancy: occLabel(ctx),
        required_value_source: 'documentation_completeness',
      });
    },
  },
  {
    id: 'OCC-03',
    code: 'SBC 201',
    section: 'Construction Type',
    title: 'Construction type',
    title_ar: 'نوع الإنشاء',
    applicability: { description: 'Always' },
    requiredInputs: ['construction_type'],
    severity: 'mandatory',
    evidenceRequired: ['document'],
    evaluate: (ctx) => {
      const t = ctx.building.construction_type;
      const inputs = { construction_type: t, building_type_code: ctx.building.building_type_code };
      if (!hasNonEmpty(t)) {
        return needsData('نوع الإنشاء غير موثّق — يُقبل construction_type فقط (لا يُستبدل بـ building_type_code).', inputs, [
          'construction_type',
        ]);
      }
      return passEval(`نوع الإنشاء: ${t}`, {
        inputs,
        actual_value: t,
        required_value: 'documented',
        code_reference: ref('OCC-03'),
        required_value_source: 'documentation_completeness',
        occupancy: occLabel(ctx),
      });
    },
  },
  {
    id: 'OCC-04',
    code: 'SBC 201',
    section: 'Building Area',
    title: 'Building area',
    title_ar: 'مساحة المبنى',
    applicability: { description: 'Always' },
    requiredInputs: ['building_area_m2'],
    severity: 'mandatory',
    evidenceRequired: ['measurement', 'drawing'],
    evaluate: (ctx) => {
      const a = ctx.building.building_area_m2;
      const site = ctx.building.total_site_area_m2;
      const inputs = { building_area_m2: a, total_site_area_m2: site };
      if (a == null || a <= 0) return needsData('مساحة المبنى غير موثّقة (building_area_m2 فقط — ليس مساحة الموقع).', inputs, ['building_area_m2']);
      const siteNote =
        site != null && site > 0 ? ` — مساحة الموقع ${site} م² منفصلة ولا تُستخدم كبديل لمساحة المبنى.` : '';
      return passEval(`مساحة المبنى ${a} م²${siteNote}`, {
        inputs,
        actual_value: a,
        required_value: '>0',
        unit: 'm²',
        code_reference: ref('OCC-04'),
        required_value_source: 'documentation_completeness',
        occupancy: occLabel(ctx),
      });
    },
  },
  {
    id: 'OCC-05',
    code: 'SBC 201',
    section: 'Building Height / Stories',
    title: 'Height and stories',
    title_ar: 'الارتفاع وعدد الأدوار',
    applicability: { description: 'Always' },
    requiredInputs: ['building_height_m OR stories'],
    severity: 'mandatory',
    evidenceRequired: ['measurement'],
    evaluate: (ctx) => {
      const h = ctx.building.building_height_m;
      const s = ctx.building.stories;
      const inputs = { building_height_m: h, stories: s, basement: ctx.building.basement_floors };
      if ((h == null || h <= 0) && (s == null || s <= 0)) {
        return needsData('يلزم توثيق الارتفاع أو عدد الأدوار.', inputs, ['building_height_m|stories']);
      }
      return passEval('بيانات الارتفاع/الأدوار متوفرة.', {
        inputs,
        actual_value: h ?? s ?? null,
        required_value: 'documented',
        unit: h != null ? 'm' : 'stories',
        code_reference: ref('OCC-05'),
        required_value_source: 'documentation_completeness',
        occupancy: occLabel(ctx),
      });
    },
  },
  {
    id: 'OCC-06',
    code: 'SBC 201',
    section: `High-rise (>${SBC_STRUCTURE_RULES.high_rise_floor_height_m} m)`,
    title: 'High-rise determination',
    title_ar: 'تحديد المبنى عالي الارتفاع',
    applicability: { description: 'Always — must be determined, not assumed' },
    requiredInputs: ['high_rise OR building_height_m'],
    severity: 'mandatory',
    evidenceRequired: ['measurement'],
    evaluate: (ctx) => {
      const inputs = { high_rise: ctx.building.high_rise, height_m: ctx.building.building_height_m };
      const codeRef = ref('OCC-06');
      if (ctx.building.high_rise == null && ctx.building.building_height_m == null) {
        return needsData('لم يُحدد إن كان المبنى عالي الارتفاع.', inputs, ['high_rise'], {
          code_reference: codeRef,
        });
      }
      const isHigh =
        ctx.building.high_rise === true ||
        (ctx.building.high_rise == null &&
          ctx.building.building_height_m != null &&
          ctx.building.building_height_m > SBC_STRUCTURE_RULES.high_rise_floor_height_m);
      return passEval(
        isHigh ? 'مبنى عالي الارتفاع وفق البيانات.' : 'ليس عالي الارتفاع وفق البيانات.',
        {
          inputs,
          actual_value: isHigh,
          required_value: `height>${SBC_STRUCTURE_RULES.high_rise_floor_height_m}m OR high_rise=true`,
          unit: 'boolean',
          code_reference: codeRef,
          condition: `threshold=${SBC_STRUCTURE_RULES.high_rise_floor_height_m}m`,
          occupancy: occLabel(ctx),
          required_value_source: 'platform_code_table',
        }
      );
    },
  },
  {
    id: 'OCC-07',
    code: 'SBC 201',
    section: 'Mixed Occupancy',
    title: 'Mixed occupancy documented',
    title_ar: 'توثيق الإشغال المختلط',
    applicability: { description: 'When multiple occupancy groups present' },
    requiredInputs: ['occupancyZones'],
    severity: 'advisory',
    evidenceRequired: ['document'],
    evaluate: (ctx) => {
      const inputs = { mixed: ctx.building.mixed_occupancy, zones: ctx.occupancyZones.length };
      if (!ctx.occupancyZones.length) return needsData('لا توجد مناطق إشغال للتقييم.', inputs, ['floor_uses.zones']);
      return passEval(
        ctx.building.mixed_occupancy ? 'إشغال مختلط موثّق من المناطق.' : 'إشغال غير مختلط وفق المناطق الحالية.',
        {
          inputs,
          actual_value: ctx.building.mixed_occupancy ?? false,
          required_value: 'documented',
          code_reference: ref('OCC-07'),
        required_value_source: 'documentation_completeness',
          occupancy: occLabel(ctx),
        }
      );
    },
  },
  {
    id: 'OCC-08',
    code: 'SBC 201',
    section: 'Special Conditions',
    title: 'Special conditions flags',
    title_ar: 'الظروف الخاصة (قبو/أتريوم/بدون نوافذ)',
    applicability: { description: 'Always — flags must be explicit yes/no when relevant' },
    requiredInputs: ['basement OR underground OR atrium OR windowless flags'],
    severity: 'advisory',
    evidenceRequired: ['document'],
    evaluate: (ctx) => {
      const inputs = {
        basement: ctx.building.basement_floors,
        underground: ctx.building.underground,
        atrium: ctx.building.atrium,
        windowless: ctx.building.windowless,
        special: ctx.building.special_conditions.join(',') || null,
      };
      const anyKnown =
        ctx.building.basement_floors != null ||
        ctx.building.underground != null ||
        ctx.building.atrium != null ||
        ctx.building.windowless != null;
      if (!anyKnown) return needsData('ظروف خاصة غير موثّقة (قبو/أتريوم/…).', inputs, ['special_conditions']);
      return passEval('تم تسجيل حالة الظروف الخاصة المتاحة.', {
        inputs,
        actual_value: true,
        required_value: 'documented',
        code_reference: ref('OCC-08'),
        required_value_source: 'documentation_completeness',
        occupancy: occLabel(ctx),
      });
    },
  },
];

// ─── Egress ──────────────────────────────────────────────────────────────────

const egressRules: ComplianceRule[] = [
  {
    id: 'EGR-01',
    code: 'SBC 201',
    section: '1004 Occupant Load',
    title: 'Occupant load calculated',
    title_ar: 'حمل الشاغلين',
    applicability: { description: 'Always for occupied buildings' },
    requiredInputs: ['zone areas + load factors'],
    severity: 'mandatory',
    evidenceRequired: ['calculation', 'drawing'],
    evaluate: (ctx) => {
      const total = ctx.egress.occupant_load_total;
      const inputs = { occupant_load_total: total, zones: ctx.occupancyZones.length };
      if (total == null || total <= 0) {
        return needsData('حمل الشاغلين غير محسوب — يلزم مساحات وعوامل تحميل.', inputs, ['occupant_load']);
      }
      return passEval(`إجمالي الشاغلين المحسوب: ${total}`, {
        inputs,
        actual_value: total,
        required_value: '>0',
        unit: 'persons',
        code_reference: ref('EGR-01'),
        required_value_source: 'documentation_completeness',
        occupancy: occLabel(ctx),
        evidence: [evidence('calculation', 'occupant_load', total, 'zones')],
      });
    },
  },
  {
    id: 'EGR-02',
    code: 'SBC 201',
    section: '1006 Number of Exits',
    title: 'Number of exits vs required',
    title_ar: 'عدد المخارج مقابل المطلوب',
    applicability: { description: 'When occupant load known' },
    requiredInputs: ['occupant_load_total', 'exits_count', 'occupancy classification'],
    severity: 'mandatory',
    evidenceRequired: ['drawing', 'measurement'],
    evaluate: (ctx) => {
      const load = ctx.egress.occupant_load_total;
      const exits = ctx.egress.exits_count;
      const occ = occupancyContext(ctx);
      const inputs: Record<string, string | number | boolean | null | undefined> = {
        occupant_load_total: load,
        exits_count: exits,
        occupancy_code: occ.code,
        occupancy_group: occ.group,
        occupancy_classification: occ.classification,
      };
      if (load == null) return needsData('لا يمكن تقييم عدد المخارج دون حمل شاغلين.', inputs, ['occupant_load']);
      if (exits == null) return needsData('عدد المخارج الفعلي غير موثّق.', inputs, ['exits_count']);

      const resolved = requiredExitsFromOccupantLoad(load, occ);
      if (!resolved) {
        return needsData('لا يمكن تحديد عدد المخارج المطلوب دون تصنيف إشغال موثّق.', inputs, ['occupancy']);
      }

      inputs.required_exits = resolved.required;
      const label = occLabel(ctx);
      const base = {
        inputs,
        occupancy: label,
        actual_value: exits,
        required_value: resolved.required,
        unit: 'exits',
        code_reference: resolved.code_reference,
        condition: resolved.condition,
        evidence: [
          evidence('measurement', 'exits_count', exits, 'project'),
          evidence('document', 'required_exits', resolved.required, 'threshold', resolved.code_reference),
        ],
      };

      if (exits < resolved.required) {
        return failEval(
          `المخارج المتوفرة (${exits}) أقل من المطلوب كوديًا (${resolved.required}) لـ ${load} شاغل — ليس معادلة مخارج=شاغلين.`,
          {
            ...base,
            remediation: 'زيادة المخارج أو إعادة توزيع الإشغال وفق SBC 201 §1006.',
          }
        );
      }
      return passEval(
        `المخارج ${exits} ≥ المطلوب ${resolved.required} (حسب حمل الشاغلين وليس معادلة مخارج=شاغلين).`,
        base
      );
    },
  },
  {
    id: 'EGR-03',
    code: 'SBC 201',
    section: '1005 Exit Capacity',
    title: 'Exit capacity',
    title_ar: 'سعة المخارج',
    applicability: { description: 'Always when exits evaluated' },
    requiredInputs: ['exit_capacity_persons', 'occupant_load_total'],
    severity: 'mandatory',
    evidenceRequired: ['calculation'],
    evaluate: (ctx) => {
      const cap = ctx.egress.exit_capacity_persons;
      const load = ctx.egress.occupant_load_total;
      const inputs = { exit_capacity_persons: cap, occupant_load_total: load };
      const codeRef = ref('EGR-03');
      if (cap == null) return needsData('سعة المخارج غير موثّقة.', inputs, ['exit_capacity_persons'], { code_reference: codeRef });
      if (load == null) return needsData('حمل الشاغلين ناقص لمقارنة السعة.', inputs, ['occupant_load'], { code_reference: codeRef });
      const base = {
        inputs,
        actual_value: cap,
        required_value: load,
        unit: 'persons',
        code_reference: codeRef,
        occupancy: occLabel(ctx),
        condition: `exit_capacity >= occupant_load (${load})`,
        required_value_source: 'explicit_code_condition' as const,
        evidence: [
          evidence('calculation', 'exit_capacity_persons', cap, 'project', codeRef),
          evidence('calculation', 'occupant_load_total', load, 'project', codeRef),
        ],
      };
      if (cap < load) return failEval(`سعة المخارج (${cap}) أقل من الحمل (${load}).`, base);
      return passEval('سعة المخارج كافية للحمل الموثّق.', base);
    },
  },
  {
    id: 'EGR-04',
    code: 'SBC 201',
    section: '1016 Exit Access',
    title: 'Exit access',
    title_ar: 'مسار الوصول للمخرج',
    applicability: { description: 'Always' },
    requiredInputs: ['exit_access_ok'],
    severity: 'mandatory',
    evidenceRequired: ['drawing'],
    evaluate: (ctx) => {
      const v = ctx.egress.exit_access_ok;
      const inputs = { exit_access_ok: v, notes: ctx.egress.notes };
      const codeRef = ref('EGR-04');
      if (v == null) return needsData('مسار الوصول للمخرج غير موثّق.', inputs, ['exit_access'], { code_reference: codeRef });
      const ev = egressNotesEvidence(ctx, 'exit access');
      const base = {
        inputs,
        actual_value: v,
        required_value: true,
        code_reference: codeRef,
        occupancy: occLabel(ctx),
        required_value_source: 'engineer_attested' as const,
        evidence: [ev],
      };
      return v
        ? passEval('مسار الوصول موثّق كمقبول (إقرار هندسي — ليس قياسًا آليًا).', base)
        : failEval('مسار الوصول غير مقبول وفق البيانات.', base);
    },
  },
  {
    id: 'EGR-05',
    code: 'SBC 201',
    section: '1007 Exit Separation',
    title: 'Exit separation',
    title_ar: 'تباعد المخارج',
    applicability: { description: 'When 2+ exits required' },
    requiredInputs: ['exit_separation_m', 'required_exit_separation_m'],
    severity: 'mandatory',
    evidenceRequired: ['measurement', 'drawing'],
    evaluate: (ctx) => {
      const load = ctx.egress.occupant_load_total;
      const occ = occupancyContext(ctx);
      const exitReq = load != null ? requiredExitsFromOccupantLoad(load, occ) : null;
      const inputs = { exit_separation_m: ctx.egress.exit_separation_m, occupant_load_total: load };
      if (exitReq && exitReq.required < 2) {
        return naEval('مخرج واحد مطلوب — تباعد المخارج غير منطبق.', {
          inputs,
          code_reference: exitReq.code_reference,
          occupancy: occLabel(ctx),
        });
      }
      return compareToThreshold({
        actual: ctx.egress.exit_separation_m,
        threshold: resolveExitSeparationMinM(ctx),
        mode: 'gte',
        occupancy: occLabel(ctx),
        missingActualLabel: 'exit_separation_m',
        missingThresholdMessage:
          'تباعد المخارج: لا توجد معادلة تباعد مرمّزة كجدول كود في المنصة. قيمة required_exit_separation_m المدخلة = تصميم مشروع وليست الكود تلقائيًا.',
        passMessage: (a, r) => `تباعد المخارج ${a} م ≥ المطلوب ${r} م.`,
        failMessage: (a, r) => `تباعد المخارج ${a} م < المطلوب ${r} م.`,
        extraInputs: inputs,
      });
    },
  },
  {
    id: 'EGR-06',
    code: 'SBC 201',
    section: '1017 Travel Distance',
    title: 'Travel distance',
    title_ar: 'مسافة السفر',
    applicability: { description: 'Always' },
    requiredInputs: ['travel_distance_m'],
    severity: 'mandatory',
    evidenceRequired: ['measurement', 'drawing'],
    evaluate: (ctx) =>
      compareToThreshold({
        actual: ctx.egress.travel_distance_m,
        threshold: resolveTravelDistanceLimitM(ctx),
        mode: 'lte',
        occupancy: occLabel(ctx),
        missingActualLabel: 'travel_distance_m',
        missingThresholdMessage:
          'مسافة السفر: جدول الحد الأقصى حسب الإشغال في الطبعة المعتمدة غير مرمّز في المنصة — لا استخدام عتبة 45/60 كممرّر آلي. أدخل القياس + Engineer Override أو جدول معتمد.',
        passMessage: (a, r) => `مسافة السفر ${a} م ≤ الحد ${r} م.`,
        failMessage: (a, r) => `مسافة السفر ${a} م تتجاوز الحد ${r} م.`,
        extraInputs: {
          travel_distance_m: ctx.egress.travel_distance_m,
          sprinkler_provided: ctx.fireProtection.sprinkler_provided,
        },
      }),
  },
  {
    id: 'EGR-07',
    code: 'SBC 201',
    section: '1016.2 Common Path',
    title: 'Common path of travel',
    title_ar: 'المسار المشترك',
    applicability: { description: 'Always' },
    requiredInputs: ['common_path_m', 'required_common_path_m (not in project)'],
    severity: 'mandatory',
    evidenceRequired: ['measurement'],
    evaluate: (ctx) => {
      const d = ctx.egress.common_path_m;
      const inputs = { common_path_m: d };
      const codeRef = ref('EGR-07');
      if (d == null) {
        return needsData('المسار المشترك غير موثّق.', inputs, ['common_path_m'], { code_reference: codeRef });
      }
      return needsData(
        'المسار المشترك مقاس لكن الحد الأقصى الكودي غير موثّق في المشروع — لا PASS على القياس وحده.',
        { ...inputs, actual: d },
        ['code_threshold'],
        {
          actual_value: d,
          required_value: null,
          unit: 'm',
          code_reference: codeRef,
          occupancy: occLabel(ctx),
        }
      );
    },
  },
  {
    id: 'EGR-08',
    code: 'SBC 201',
    section: '1020 Dead Ends',
    title: 'Dead-end corridors',
    title_ar: 'الطرق المسدودة',
    applicability: { description: 'Always' },
    requiredInputs: ['dead_end_m', 'required_dead_end_m (not in project)'],
    severity: 'mandatory',
    evidenceRequired: ['measurement'],
    evaluate: (ctx) => {
      const d = ctx.egress.dead_end_m;
      const inputs = { dead_end_m: d };
      const codeRef = ref('EGR-08');
      if (d == null) {
        return needsData('طول الطريق المسدود غير موثّق.', inputs, ['dead_end_m'], { code_reference: codeRef });
      }
      return needsData(
        'الطريق المسدود مقاس لكن الحد الأقصى الكودي غير موثّق في المشروع — لا PASS على القياس وحده.',
        { ...inputs, actual: d },
        ['code_threshold'],
        {
          actual_value: d,
          required_value: null,
          unit: 'm',
          code_reference: codeRef,
          occupancy: occLabel(ctx),
        }
      );
    },
  },
  {
    id: 'EGR-09',
    code: 'SBC 201',
    section: '1020 Corridors',
    title: 'Corridor width',
    title_ar: 'عرض الممرات',
    applicability: { description: 'Always' },
    requiredInputs: ['corridor_width_m', 'required_corridor_width_m'],
    severity: 'mandatory',
    evidenceRequired: ['measurement'],
    evaluate: (ctx) =>
      compareToThreshold({
        actual: ctx.egress.corridor_width_m,
        threshold: resolveCorridorMinWidthM(ctx),
        mode: 'gte',
        occupancy: occLabel(ctx),
        missingActualLabel: 'corridor_width_m',
        missingThresholdMessage: 'عرض الممرات غير موثّق أو الحد الأدنى (required_corridor_width_m) غير موثّق في المشروع.',
        passMessage: (a, r) => `عرض الممر ${a} م ≥ المطلوب ${r} م.`,
        failMessage: (a, r) => `عرض الممر ${a} م < المطلوب ${r} م.`,
        extraInputs: { corridor_width_m: ctx.egress.corridor_width_m },
      }),
  },
  {
    id: 'EGR-10',
    code: 'SBC 201',
    section: '1010 Doors',
    title: 'Egress door width',
    title_ar: 'عرض أبواب المخارج',
    applicability: { description: 'Always' },
    requiredInputs: ['door_width_m', 'required_door_width_m'],
    severity: 'mandatory',
    evidenceRequired: ['measurement'],
    evaluate: (ctx) => {
      const w = ctx.egress.door_width_m;
      const inputs = { door_width_m: w, emergency_exit_doors: ctx.egress.emergency_exit_doors };
      if (w == null && !hasNonEmpty(ctx.egress.emergency_exit_doors)) {
        return needsData('عرض/تفاصيل أبواب المخارج غير موثّقة.', inputs, ['door_width_m']);
      }
      if (w == null) {
        return needsData('عرض الباب غير مقاس رغم وجود وصف أبواب.', inputs, ['door_width_m']);
      }
      return compareToThreshold({
        actual: w,
        threshold: resolveDoorMinWidthM(ctx),
        mode: 'gte',
        occupancy: occLabel(ctx),
        missingActualLabel: 'door_width_m',
        missingThresholdMessage: 'الحد الأدنى لعرض الباب (required_door_width_m) غير موثّق في المشروع.',
        passMessage: (a, r) => `عرض الباب ${a} م ≥ المطلوب ${r} م.`,
        failMessage: (a, r) => `عرض الباب ${a} م < المطلوب ${r} م.`,
        extraInputs: inputs,
      });
    },
  },
  {
    id: 'EGR-11',
    code: 'SBC 201',
    section: '1011 Stairs',
    title: 'Egress stairs',
    title_ar: 'سلالم الهروب',
    applicability: { description: 'Multi-story buildings' },
    requiredInputs: ['stairs_count', 'stair_width_m', 'required_stair_width_m'],
    severity: 'mandatory',
    evidenceRequired: ['drawing', 'measurement'],
    evaluate: (ctx) => {
      const stories = ctx.building.stories;
      const stairs = ctx.egress.stairs_count;
      const width = ctx.egress.stair_width_m;
      const inputs = { stories, stairs_count: stairs, stair_width_m: width };
      const singleStory =
        stories != null && stories <= 1 && (ctx.building.basement_floors == null || ctx.building.basement_floors <= 0);
      if (singleStory) {
        return naEval('مبنى دور واحد دون قبو — سلالم الهروب غير منطبقة كمتطلب أدوار متعددة.', {
          inputs,
          code_reference: ref('EGR-11'),
          occupancy: occLabel(ctx),
        });
      }
      if (stairs == null) return needsData('عدد السلالم غير موثّق.', inputs, ['stairs_count']);
      if (stairs < 1) {
        return failEval('لا توجد سلالم موثّقة لمبنى متعدد الأدوار.', {
          inputs,
          actual_value: stairs,
          required_value: '>=1',
          code_reference: ref('EGR-11'),
          occupancy: occLabel(ctx),
        });
      }
      if (width == null) return needsData('عرض السلم غير موثّق.', inputs, ['stair_width_m']);
      return compareToThreshold({
        actual: width,
        threshold: resolveStairMinWidthM(ctx),
        mode: 'gte',
        occupancy: occLabel(ctx),
        missingActualLabel: 'stair_width_m',
        missingThresholdMessage: 'الحد الأدنى لعرض السلم (required_stair_width_m) غير موثّق في المشروع.',
        passMessage: (a, r) => `سلالم: ${stairs}، العرض ${a} م ≥ المطلوب ${r} م.`,
        failMessage: (a, r) => `عرض السلم ${a} م < المطلوب ${r} م.`,
        extraInputs: inputs,
      });
    },
  },
  {
    id: 'EGR-12',
    code: 'SBC 201',
    section: '1028 Exit Discharge',
    title: 'Exit discharge',
    title_ar: 'تصريف الخروج النهائي',
    applicability: { description: 'Always' },
    requiredInputs: ['exit_discharge_ok'],
    severity: 'mandatory',
    evidenceRequired: ['drawing'],
    evaluate: (ctx) => {
      const v = ctx.egress.exit_discharge_ok;
      const inputs = { exit_discharge_ok: v, notes: ctx.egress.notes };
      const codeRef = ref('EGR-12');
      if (v == null) return needsData('تصريف الخروج النهائي غير موثّق.', inputs, ['exit_discharge'], { code_reference: codeRef });
      const ev = egressNotesEvidence(ctx, 'discharge');
      const base = {
        inputs,
        actual_value: v,
        required_value: true,
        code_reference: codeRef,
        occupancy: occLabel(ctx),
        required_value_source: 'engineer_attested' as const,
        evidence: [ev],
      };
      return v ? passEval('تصريف الخروج موثّق كمقبول (إقرار هندسي).', base) : failEval('تصريف الخروج غير مقبول.', base);
    },
  },
];

// ─── Fire apparatus access ───────────────────────────────────────────────────

const fireAccessRules: ComplianceRule[] = [
  {
    id: 'FAC-01',
    code: 'SBC 801',
    section: 'Fire Apparatus Access',
    title: 'Fire apparatus access',
    title_ar: 'وصول آليات الدفاع المدني',
    applicability: { description: 'Always' },
    requiredInputs: ['site_entrance OR fire_road OR building_access'],
    severity: 'mandatory',
    evidenceRequired: ['drawing', 'document'],
    evaluate: (ctx) => {
      const a = ctx.fireAccess;
      const inputs = {
        site_entrance: a.site_entrance,
        fire_road: a.fire_road,
        building_access: a.building_access,
        road_width_m: a.road_width_m,
        required_road_width_m: a.required_road_width_m,
        required_road_width_code_ref: a.required_road_width_code_ref,
      };
      const hasNarrative =
        hasNonEmpty(a.site_entrance) || hasNonEmpty(a.fire_road) || hasNonEmpty(a.building_access);
      const threshold = resolveFireAccessMinWidthM(ctx);
      // Narrative text / attachment alone never PASS — require measurable width vs documented threshold.
      if (a.road_width_m == null && !hasNarrative) {
        return needsData('وصول آليات الإطفاء غير موثّق.', inputs, ['fire_apparatus_access']);
      }
      if (a.road_width_m == null) {
        return needsData(
          'وُجد وصف نصي لوصول الآليات، لكن لا PASS على النص وحده — يلزم قياس عرض الطريق ومقارنته بحد كودي موثّق (FAC-02).',
          inputs,
          ['road_width_m'],
          { code_reference: ref('FAC-01'), occupancy: occLabel(ctx) }
        );
      }
      if (!threshold) {
        return needsData(
          'عرض طريق الوصول مقاس لكن الحد الأدنى الكودي غير موثّق في المشروع — لا افتراض عتبة عامة.',
          inputs,
          ['required_road_width_m', 'required_road_width_code_ref'],
          { code_reference: ref('FAC-01'), actual_value: a.road_width_m, occupancy: occLabel(ctx) }
        );
      }
      return compareToThreshold({
        actual: a.road_width_m,
        threshold,
        mode: 'gte',
        occupancy: occLabel(ctx),
        missingActualLabel: 'road_width_m',
        missingThresholdMessage: 'حد عرض وصول الآليات غير موثّق.',
        passMessage: (act, req) => `وصول الآليات: العرض ${act} م ≥ المطلوب ${req} م.`,
        failMessage: (act, req) => `وصول الآليات: العرض ${act} م < المطلوب ${req} م.`,
        extraInputs: inputs,
      });
    },
  },
  {
    id: 'FAC-02',
    code: 'SBC 801',
    section: 'Access Width',
    title: 'Access road width',
    title_ar: 'عرض طريق الوصول',
    applicability: { description: 'Always' },
    requiredInputs: ['road_width_m', 'required_road_width_m', 'required_road_width_code_ref'],
    severity: 'mandatory',
    evidenceRequired: ['measurement'],
    evaluate: (ctx) =>
      compareToThreshold({
        actual: ctx.fireAccess.road_width_m,
        threshold: resolveFireAccessMinWidthM(ctx),
        mode: 'gte',
        occupancy: occLabel(ctx),
        missingActualLabel: 'road_width_m',
        missingThresholdMessage:
          'عرض طريق الوصول غير موثّق أو الحد الأدنى الكودي غير موثّق في المشروع (required_road_width_m + code_ref) — لا افتراض 6 م.',
        passMessage: (a, r) => `عرض الطريق ${a} م ≥ المطلوب ${r} م.`,
        failMessage: (a, r) => `عرض الطريق ${a} م < المطلوب ${r} م.`,
        extraInputs: {
          road_width_m: ctx.fireAccess.road_width_m,
          required_road_width_m: ctx.fireAccess.required_road_width_m,
          required_road_width_code_ref: ctx.fireAccess.required_road_width_code_ref,
        },
      }),
  },
  {
    id: 'FAC-03',
    code: 'SBC 801',
    section: 'Access Clearance',
    title: 'Access clearance / staging',
    title_ar: 'خلو المسار ومنطقة التمركز',
    applicability: { description: 'Always' },
    requiredInputs: ['staging_area OR notes'],
    severity: 'mandatory',
    evidenceRequired: ['drawing'],
    evaluate: (ctx) => {
      const inputs = { staging_area: ctx.fireAccess.staging_area, notes: ctx.fireAccess.notes };
      // Free-text notes alone never produce automated code PASS.
      if (!hasNonEmpty(ctx.fireAccess.staging_area) && !hasNonEmpty(ctx.fireAccess.notes)) {
        return needsData('خلو المسار/منطقة التمركز غير موثّقة.', inputs, ['staging_area']);
      }
      return needsData(
        'وُجد وصف لمنطقة التمركز/الملاحظات، لكن لا يوجد حد كودي موثّق للمقارنة الآلية — NEEDS_DATA (ليس PASS على النص).',
        inputs,
        ['staging_clearance_required_m|engineer_verified_clearance'],
        {
          code_reference: ref('FAC-03'),
          actual_value: ctx.fireAccess.staging_area || ctx.fireAccess.notes,
          required_value: 'documented_clearance_threshold',
          occupancy: occLabel(ctx),
        }
      );
    },
  },
  {
    id: 'FAC-04',
    code: 'SBC 801',
    section: 'Turning / Access Condition',
    title: 'Turning and access condition',
    title_ar: 'مناورة الالتفاف وظروف الوصول',
    applicability: { description: 'Always' },
    requiredInputs: ['fire_road OR building_access'],
    severity: 'mandatory',
    evidenceRequired: ['drawing'],
    evaluate: (ctx) => {
      const inputs = { fire_road: ctx.fireAccess.fire_road, building_access: ctx.fireAccess.building_access };
      if (!hasNonEmpty(ctx.fireAccess.fire_road) && !hasNonEmpty(ctx.fireAccess.building_access)) {
        return needsData('ظروف الالتفاف/الوصول غير موثّقة.', inputs, ['turning_access']);
      }
      return needsData(
        'وُجد وصف لظروف الالتفاف/الوصول، لكن لا يوجد تحقق كودي آلي بحد موثّق — NEEDS_DATA (ليس PASS على النص).',
        inputs,
        ['turning_radius_m|required_turning_radius_m'],
        {
          code_reference: ref('FAC-04'),
          actual_value: ctx.fireAccess.fire_road || ctx.fireAccess.building_access,
          required_value: 'documented_turning_threshold',
          occupancy: occLabel(ctx),
        }
      );
    },
  },
  {
    id: 'FAC-05',
    code: 'SBC 801',
    section: 'FDC Accessibility',
    title: 'FDC accessibility',
    title_ar: 'إمكانية الوصول لوصلة الدفاع المدني (FDC)',
    applicability: { description: 'Always for protected buildings' },
    requiredInputs: ['fdc_present', 'fdc_location'],
    severity: 'mandatory',
    evidenceRequired: ['drawing', 'photo'],
    evaluate: (ctx) => {
      const inputs = { fdc: ctx.fireAccess.fdc_present, location: ctx.fireAccess.fdc_location };
      const yn = parseYesNoUnknown(ctx.fireAccess.fdc_present);
      if (yn === 'unknown' || !hasNonEmpty(ctx.fireAccess.fdc_present)) {
        return needsData('حالة FDC غير موثّقة كـ نعم/لا.', inputs, ['civil_defense_connection']);
      }
      if (!hasNonEmpty(ctx.fireAccess.fdc_location)) {
        return needsData('موقع FDC غير موثّق.', inputs, ['connection_location']);
      }
      const base = {
        inputs,
        actual_value: yn,
        required_value: true,
        code_reference: ref('FAC-05'),
        occupancy: occLabel(ctx),
        condition: 'fdc_present===yes && fdc_location documented',
      };
      if (yn === 'no') {
        return failEval('FDC غير موجود مع توثيق الموقع فقط — الوصول غير متحقق.', base);
      }
      return passEval('FDC موجود وموقعه موثّق.', base);
    },
  },
];

// ─── Fire protection ─────────────────────────────────────────────────────────

const fireProtectionRules: ComplianceRule[] = [
  {
    id: 'FP-01',
    code: 'SBC 801',
    section: 'Sprinkler Requirement',
    title: 'Sprinkler required determination',
    title_ar: 'تحديد إلزامية المرشات',
    applicability: { description: 'Always' },
    requiredInputs: ['occupancy thresholds OR sprinkler_required', 'sprinkler_provided', 'sprinkler_verified'],
    severity: 'mandatory',
    evidenceRequired: ['document', 'calculation'],
    evaluate: (ctx) => {
      const resolved = resolveSprinklerRequired(ctx);
      const provided = ctx.fireProtection.sprinkler_provided;
      const verified = ctx.fireProtection.sprinkler_verified;
      const inputs = {
        sprinkler_required: ctx.fireProtection.sprinkler_required,
        sprinkler_provided: provided,
        sprinkler_verified: verified,
        building_area_m2: ctx.building.building_area_m2,
        occupancy: primaryOccupancyDef(ctx)?.code ?? null,
      };

      if (!resolved) {
        return needsData('لا يمكن الجزم بإلزامية المرشات دون إشغال/مساحة مبنى/إدخال مهندس.', inputs, [
          'sprinkler_required|occupancy|building_area_m2',
        ]);
      }

      const base = {
        inputs,
        required_value: resolved.required,
        occupancy: occLabel(ctx),
        code_reference: resolved.code_reference,
        condition: resolved.condition,
      };

      if (!resolved.required) {
        return passEval('المرشات غير إلزامية وفق العتبات الموثّقة / إدخال المهندس.', {
          ...base,
          actual_value: provided ?? 'not_required',
        });
      }

      if (provided === 'no') {
        return failEval('المرشات مطلوبة كوديًا وغير متوفرة وفق البيانات.', {
          ...base,
          actual_value: 'no',
        });
      }
      if (provided == null || provided === 'unknown') {
        return needsData('المرشات مطلوبة كوديًا لكن وجودها غير مؤكد في البيانات.', inputs, ['sprinkler_provided'], base);
      }
      if (provided === 'yes' && !verified) {
        return needsData(
          'المرشات مُعلَن توفرها دون تحقق هندسي (sprinkler_verified=false) — لا PASS على الادعاء وحده.',
          { ...inputs, sprinkler_verified: verified },
          ['sprinkler_verified'],
          { ...base, actual_value: 'yes_unverified' }
        );
      }
      return passEval('المرشات مطلوبة وتم توثيق التوفير والتحقق.', {
        ...base,
        actual_value: 'yes_verified',
        evidence: [evidence('document', 'sprinkler_verified', true, 'fireProtection')],
      });
    },
  },
  {
    id: 'FP-02',
    code: 'SBC 801',
    section: 'Hazard Classification',
    title: 'Hazard classification',
    title_ar: 'تصنيف الخطورة',
    applicability: { description: 'Always for FP design' },
    requiredInputs: ['hazard_class'],
    severity: 'mandatory',
    evidenceRequired: ['document'],
    evaluate: (ctx) => {
      const h = ctx.fireProtection.hazard_class;
      const inputs = { hazard_class: h };
      if (!hasNonEmpty(h)) return needsData('تصنيف الخطورة غير موثّق.', inputs, ['hazard_class']);
      const normalized = String(h).trim().toLowerCase().replace(/\s+/g, '_');
      const known = /^(light|ordinary(_?[12])?|extra(_?[12])?|high|light_hazard|ordinary_hazard)/i.test(
        normalized
      ) || /خطورة|ordinary|light|extra/i.test(String(h));
      if (!known) {
        return needsData(
          `تصنيف الخطورة «${h}» غير مُعرّف ضمن فئات الخطورة المعتمدة في المنصة — NEEDS_DATA.`,
          inputs,
          ['hazard_class'],
          { actual_value: h, required_value: 'light|ordinary|extra (documented class)', occupancy: occLabel(ctx) }
        );
      }
      return passEval(`تصنيف الخطورة موثّق ضمن فئات معتمدة: ${h}`, {
        inputs,
        actual_value: h,
        required_value: 'documented_hazard_class',
        code_reference: ref('FP-02'),
        occupancy: occLabel(ctx),
        condition: 'hazard_class ∈ documented platform hazard categories',
      });
    },
  },
  {
    id: 'FP-03',
    code: 'SBC 801',
    section: 'Design Area / Density',
    title: 'Sprinkler design area and density',
    title_ar: 'منطقة التصميم والكثافة',
    applicability: { description: 'When sprinklers required or provided' },
    requiredInputs: ['design_area_m2', 'density_lpm_m2'],
    severity: 'mandatory',
    evidenceRequired: ['calculation'],
    evaluate: (ctx) => {
      const needed = sprinklerInScope(ctx);
      const inputs = {
        design_area_m2: ctx.fireProtection.design_area_m2,
        density: ctx.fireProtection.density_lpm_m2,
      };
      if (!needed) {
        return naEval('المرشات غير مطلوبة/غير مفعّلة — منطقة التصميم غير منطبقة.', {
          inputs,
          code_reference: ref('FP-03'),
        });
      }
      if (ctx.fireProtection.design_area_m2 == null || ctx.fireProtection.density_lpm_m2 == null) {
        return needsData('منطقة التصميم و/أو الكثافة غير موثّقتين.', inputs, ['design_area', 'density'], {
          code_reference: ref('FP-03'),
        });
      }
      return needsData(
        'منطقة التصميم والكثافة موثّقتان، لكن لا يوجد حد كثافة كودي موثّق في المشروع للمقارنة — لا PASS على القيم المدخلة وحدها.',
        inputs,
        ['required_density_lpm_m2|hazard_density_table'],
        {
          code_reference: ref('FP-03'),
          actual_value: `${ctx.fireProtection.design_area_m2} m² @ ${ctx.fireProtection.density_lpm_m2}`,
          required_value: 'documented_density_threshold',
          occupancy: occLabel(ctx),
        }
      );
    },
  },
  {
    id: 'FP-04',
    code: 'SBC 801',
    section: 'Sprinkler Demand',
    title: 'Sprinkler demand (not pump flow)',
    title_ar: 'الطلب التصميمي للمرشات (ليس تدفق المضخة)',
    applicability: { description: 'When sprinklers required/provided' },
    requiredInputs: ['sprinkler_demand_lpm'],
    severity: 'mandatory',
    evidenceRequired: ['calculation'],
    evaluate: (ctx) => {
      const needed = sprinklerInScope(ctx);
      const demand = ctx.fireProtection.sprinkler_demand_lpm;
      const pump = ctx.fireProtection.pump_flow_lpm;
      const inputs = { sprinkler_demand_lpm: demand, pump_flow_lpm: pump };
      if (!needed) return naEval('لا ينطبق دون نظام مرشات.', { inputs, code_reference: ref('FP-04') });
      if (demand == null) {
        return needsData(
          'طلب المرشات التصميمي (sprinkler_demand_lpm) غير موثّق — Pump Flow لا يُعدّ Required Fire Demand.',
          inputs,
          ['sprinkler_demand_lpm'],
          { code_reference: ref('FP-04'), actual_value: pump ?? null }
        );
      }
      return passEval(`طلب المرشات الموثّق: ${demand} لتر/د`, {
        inputs,
        actual_value: demand,
        required_value: 'documented',
        unit: 'lpm',
        code_reference: ref('FP-04'),
        occupancy: occLabel(ctx),
        evidence: [evidence('calculation', 'sprinkler_demand', demand)],
      });
    },
  },
  {
    id: 'FP-05',
    code: 'SBC 801',
    section: 'Hose Allowance',
    title: 'Hose stream allowance',
    title_ar: 'بدل خراطيم الإطفاء',
    applicability: { description: 'When sprinkler demand evaluated' },
    requiredInputs: ['hose_allowance_lpm'],
    severity: 'mandatory',
    evidenceRequired: ['calculation'],
    evaluate: (ctx) => {
      const needed = sprinklerInScope(ctx);
      const inputs = { hose_allowance_lpm: ctx.fireProtection.hose_allowance_lpm };
      if (!needed) return naEval('غير منطبق.', { inputs, code_reference: ref('FP-05') });
      if (ctx.fireProtection.hose_allowance_lpm == null) {
        return needsData('بدل الخراطيم غير موثّق.', inputs, ['hose_allowance'], { code_reference: ref('FP-05') });
      }
      return needsData(
        'بدل الخراطيم موثّق رقميًا، لكن لا يوجد بدل مطلوب كودي موثّق للمقارنة في المشروع — لا PASS على القيمة وحدها.',
        inputs,
        ['required_hose_allowance_lpm'],
        {
          code_reference: ref('FP-05'),
          actual_value: ctx.fireProtection.hose_allowance_lpm,
          required_value: 'documented_hose_threshold',
          unit: 'lpm',
          occupancy: occLabel(ctx),
        }
      );
    },
  },
  {
    id: 'FP-06',
    code: 'SBC 801',
    section: `Standpipe (height ≥ ${SBC_STRUCTURE_RULES.standpipe_height_m} m)`,
    title: 'Standpipe requirement',
    title_ar: 'متطلب نظام المواسير الرأسية',
    applicability: { description: 'Height / stories based' },
    requiredInputs: ['building_height_m OR standpipe.required'],
    severity: 'mandatory',
    evidenceRequired: ['document'],
    evaluate: (ctx) => {
      const h = ctx.building.building_height_m;
      const explicit = ctx.fireProtection.standpipe_required;
      const provided = ctx.fireProtection.standpipe_provided;
      const inputs = { height_m: h, standpipe_required: explicit, standpipe_provided: provided };
      const codeRef = ref('FP-06');

      let required: boolean | null = null;
      if (explicit === 'yes') required = true;
      else if (explicit === 'no') required = false;
      else if (h != null) required = h >= SBC_STRUCTURE_RULES.standpipe_height_m;

      if (required == null) {
        return needsData('لا يمكن تحديد متطلب Standpipe.', inputs, ['standpipe_required|height'], { code_reference: codeRef });
      }
      if (!required) {
        return passEval('Standpipe غير مطلوب وفق الارتفاع/الإدخال.', {
          inputs,
          actual_value: false,
          required_value: false,
          code_reference: codeRef,
          condition: `height < ${SBC_STRUCTURE_RULES.standpipe_height_m}m`,
          occupancy: occLabel(ctx),
        });
      }
      if (provided === 'yes' || explicit === 'yes') {
        return passEval('Standpipe مطلوب وتم توثيقه.', {
          inputs,
          actual_value: provided ?? explicit,
          required_value: true,
          code_reference: codeRef,
          occupancy: occLabel(ctx),
        });
      }
      return needsData('Standpipe مطلوب — يلزم توثيق التوفير.', inputs, ['standpipe'], {
        code_reference: codeRef,
        required_value: true,
      });
    },
  },
  {
    id: 'FP-07',
    code: 'SBC 801',
    section: 'Fire Pump',
    title: 'Fire pump requirement and duty',
    title_ar: 'مضخة الحريق والواجب التشغيلي',
    applicability: { description: 'When sprinkler/standpipe water supply needs pump' },
    requiredInputs: ['pump_exists', 'pump_flow_lpm', 'sprinkler_demand_lpm'],
    severity: 'mandatory',
    evidenceRequired: ['calculation', 'document'],
    evaluate: (ctx) => {
      const demand = ctx.fireProtection.sprinkler_demand_lpm;
      const pump = ctx.fireProtection.pump_flow_lpm;
      const exists = ctx.fireProtection.pump_exists;
      const inputs = { pump_exists: exists, pump_flow_lpm: pump, sprinkler_demand_lpm: demand };
      const codeRef = ref('FP-07');
      const systemNeeded =
        sprinklerInScope(ctx) || ctx.fireProtection.standpipe_required === 'yes';

      if (!systemNeeded) {
        return naEval('لا يوجد نظام يتطلب مضخة وفق البيانات الحالية.', { inputs, code_reference: codeRef });
      }
      if (exists == null) return needsData('وجود مضخة الحريق غير موثّق.', inputs, ['pump.exists'], { code_reference: codeRef });
      if (exists === 'no') {
        return failEval('المضخة غير موجودة رغم احتياج النظام.', {
          inputs,
          actual_value: 'no',
          required_value: 'yes',
          code_reference: codeRef,
        });
      }
      if (pump == null) return needsData('تدفق المضخة غير موثّق.', inputs, ['pump.capacity'], { code_reference: codeRef });
      if (demand == null) {
        return needsData(
          'لا يمكن مطابقة واجب المضخة دون طلب مرشات تصميمي مستقل (Pump Flow ≠ Demand).',
          inputs,
          ['sprinkler_demand_lpm'],
          { code_reference: codeRef, actual_value: pump }
        );
      }
      const base = {
        inputs,
        actual_value: pump,
        required_value: demand,
        unit: 'lpm',
        code_reference: codeRef,
        condition: 'pump_flow_lpm >= sprinkler_demand_lpm (design consistency; NFPA 20 complementary)',
        occupancy: occLabel(ctx),
        required_value_source: 'explicit_code_condition' as const,
        evidence: [
          evidence('calculation', 'pump_flow_lpm', pump, 'project', codeRef),
          evidence('calculation', 'sprinkler_demand_lpm', demand, 'project', codeRef),
        ],
      };
      if (pump < demand) return failEval(`تدفق المضخة ${pump} < طلب المرشات ${demand}.`, base);
      return passEval('المضخة موثّقة وتدفقها لا يقل عن طلب المرشات الموثّق (تحقق تصميمي).', base);
    },
  },
  {
    id: 'FP-08',
    code: 'SBC 801',
    section: 'Fire Tank',
    title: 'Tank volume and duration',
    title_ar: 'خزان الإطفاء والمدة',
    applicability: { description: 'When pump/sprinkler water supply required' },
    requiredInputs: ['tank_exists', 'tank_volume_m3', 'tank_duration_min'],
    severity: 'mandatory',
    evidenceRequired: ['calculation'],
    evaluate: (ctx) => {
      const systemNeeded =
        sprinklerInScope(ctx) || ctx.fireProtection.pump_exists === 'yes';
      const inputs = {
        tank_exists: ctx.fireProtection.tank_exists,
        volume: ctx.fireProtection.tank_volume_m3,
        duration: ctx.fireProtection.tank_duration_min,
        required: ctx.fireProtection.tank_required_m3,
      };
      const codeRef = ref('FP-08');
      if (!systemNeeded) return naEval('خزان الإطفاء غير منطبق وفق البيانات.', { inputs, code_reference: codeRef });
      if (ctx.fireProtection.tank_exists == null) {
        return needsData('وجود الخزان غير موثّق.', inputs, ['tank.exists'], { code_reference: codeRef });
      }
      if (ctx.fireProtection.tank_exists === 'no') {
        return failEval('الخزان غير موجود رغم احتياج النظام.', {
          inputs,
          actual_value: 'no',
          required_value: 'yes',
          code_reference: codeRef,
        });
      }
      if (ctx.fireProtection.tank_volume_m3 == null || ctx.fireProtection.tank_duration_min == null) {
        return needsData('سعة و/أو مدة الخزان غير موثّقة.', inputs, ['tank_volume', 'duration'], { code_reference: codeRef });
      }
      if (ctx.fireProtection.tank_required_m3 == null) {
        return needsData(
          'سعة الخزان الفعلية موثّقة لكن الحجم المطلوب المحسوب غير موثّق للمقارنة — لا PASS على القيمة وحدها.',
          inputs,
          ['tank_required_m3'],
          {
            code_reference: codeRef,
            actual_value: ctx.fireProtection.tank_volume_m3,
            required_value_source: 'missing',
            occupancy: occLabel(ctx),
          }
        );
      }
      const vol = ctx.fireProtection.tank_volume_m3;
      const req = ctx.fireProtection.tank_required_m3;
      const provisional = vol + 1e-6 >= req ? 'meets_project_calc' : 'below_project_calc';
      return needsData(
        `حجم الخزان المطلوب (${req} م³) ناتج حساب تصميم مشروع وليس جدول كود مرمّز كاملًا (NFPA 22 مكمل). المقارنة المبدئية: ${provisional}. NEEDS_DATA حتى اعتماد مهندس/جدول معتمد.`,
        inputs,
        ['platform_code_table_tank_duration'],
        {
          code_reference: codeRef,
          actual_value: vol,
          required_value: req,
          unit: 'm³',
          occupancy: occLabel(ctx),
          condition: `project_design tank_volume>=tank_required; provisional=${provisional}`,
          required_value_source: 'project_design',
          evidence: [
            evidence('calculation', 'tank_volume_m3', vol, 'project', codeRef),
            evidence('calculation', 'tank_required_m3', req, 'project_calc', codeRef),
          ],
        }
      );
    },
  },
  {
    id: 'FP-09',
    code: 'SBC 801',
    section: 'FDC Requirement',
    title: 'Fire department connection requirement',
    title_ar: 'متطلب وصلة الدفاع المدني',
    applicability: { description: 'When sprinkler or standpipe present' },
    requiredInputs: ['fdc_present'],
    severity: 'mandatory',
    evidenceRequired: ['drawing'],
    evaluate: (ctx) => {
      const systemNeeded =
        ctx.fireProtection.sprinkler_provided === 'yes' ||
        sprinklerInScope(ctx) ||
        ctx.fireProtection.standpipe_required === 'yes';
      const inputs = { fdc: ctx.fireAccess.fdc_present };
      const codeRef = ref('FP-09');
      if (!systemNeeded) return naEval('FDC غير منطبق دون نظام مرشات/مواسير.', { inputs, code_reference: codeRef });
      const yn = parseYesNoUnknown(ctx.fireAccess.fdc_present);
      if (yn === 'unknown' || !hasNonEmpty(ctx.fireAccess.fdc_present)) {
        return needsData('متطلب/وجود FDC غير موثّق كـ نعم/لا.', inputs, ['FDC'], { code_reference: codeRef });
      }
      const base = {
        inputs,
        actual_value: yn,
        required_value: true,
        code_reference: codeRef,
        occupancy: occLabel(ctx),
        condition: 'system_needs_FDC → fdc_present===yes',
      };
      if (yn === 'no') return failEval('FDC مطلوب للنظام وغير موجود وفق البيانات.', base);
      return passEval('FDC مطلوب وموجود وفق البيانات.', base);
    },
  },
  {
    id: 'FP-10',
    code: 'SBC 801',
    section: 'Portable Extinguishers',
    title: 'Fire extinguishers',
    title_ar: 'طفايات الحريق',
    applicability: { description: 'Always' },
    requiredInputs: ['extinguisher_count'],
    severity: 'advisory',
    evidenceRequired: ['document'],
    evaluate: (ctx) => {
      const n = ctx.fireProtection.extinguisher_count;
      const inputs = { extinguisher_count: n };
      if (n == null || n <= 0) return needsData('طفايات الحريق غير موثّقة.', inputs, ['extinguishers']);
      return needsData(
        'عدد الطفايات موثّق، لكن الحد الأدنى الكودي المطلوب غير موثّق للمقارنة — لا PASS على العدد وحده.',
        inputs,
        ['required_extinguisher_count'],
        {
          actual_value: n,
          required_value: 'documented_min_count',
          unit: 'count',
          code_reference: ref('FP-10'),
          occupancy: occLabel(ctx),
        }
      );
    },
  },
];

// ─── Hydraulic foundation ────────────────────────────────────────────────────

const HYDRAULIC_FIELDS: Array<{ key: keyof ComplianceRuleContext['hydraulic']; label: string }> = [
  { key: 'k_factor', label: 'k_factor' },
  { key: 'flow_lpm', label: 'flow_lpm' },
  { key: 'pressure_bar', label: 'pressure_bar' },
  { key: 'required_residual_pressure_bar', label: 'required_residual_pressure_bar' },
  { key: 'pipe_diameter_mm', label: 'pipe_diameter_mm' },
  { key: 'pipe_length_m', label: 'pipe_length_m' },
  { key: 'elevation_m', label: 'elevation_m' },
  { key: 'friction_loss_bar', label: 'friction_loss_bar' },
  { key: 'remote_area_m2', label: 'remote_area_m2' },
  { key: 'node_demand_lpm', label: 'node_demand_lpm' },
  { key: 'pump_flow_lpm', label: 'pump_flow_lpm' },
  { key: 'pump_pressure_bar', label: 'pump_pressure_bar' },
  { key: 'tank_volume_m3', label: 'tank_volume_m3' },
];

const hydraulicRules: ComplianceRule[] = [
  {
    id: 'HYD-01',
    code: 'SBC 801',
    section: 'Hydraulic Calculation Foundation',
    title: 'Pipe network hydraulic data',
    title_ar: 'أساس الحساب الهيدروليكي لشبكة الأنابيب',
    applicability: { description: 'When sprinkler system is required/provided' },
    requiredInputs: HYDRAULIC_FIELDS.map((f) => f.label),
    severity: 'mandatory',
    evidenceRequired: ['calculation', 'document'],
    evaluate: (ctx) => {
      const needed = sprinklerInScope(ctx);
      const h = ctx.hydraulic;
      const inputs: Record<string, string | number | boolean | null | undefined> = {
        attachment_count: h.attachment_count,
        has_network_data: h.has_network_data,
      };
      for (const f of HYDRAULIC_FIELDS) {
        inputs[f.label] = h[f.key] as number | null | undefined;
      }

      if (!needed) {
        return naEval('لا يوجد نظام مرشات يتطلب هيدروليك شبكة.', {
          inputs,
          code_reference: ref('HYD-01'),
        });
      }

      const missing: string[] = [];
      for (const f of HYDRAULIC_FIELDS) {
        const v = h[f.key];
        if (v == null || (typeof v === 'number' && !Number.isFinite(v))) missing.push(f.label);
      }

      const codeRef = ref('HYD-01');
      if (missing.length) {
        return needsData(
          'بيانات شبكة الأنابيب الهيدروليكية ناقصة — attachment_count وحدها لا تكفي للـ PASS.',
          inputs,
          missing,
          { code_reference: codeRef, missing_data: missing }
        );
      }

      return passEval('أساس الحساب الهيدروليكي مكتمل الحقول (توثيق شبكة — ليس اعتماد كثافة/جدول NFPA 13).', {
        inputs,
        actual_value: true,
        required_value: 'all_fields_present',
        code_reference: codeRef,
        occupancy: occLabel(ctx),
        required_value_source: 'documentation_completeness',
        evidence: [evidence('calculation', 'hydraulic_network', true, 'hydraulic', codeRef)],
      });
    },
  },
];

// ─── Fire alarm ──────────────────────────────────────────────────────────────

function evalAlarmField(
  ctx: ComplianceRuleContext,
  key: string,
  value: string | null | undefined,
  labelAr: string,
  ruleId: string
): ComplianceRuleEvaluation {
  const inputs = { [key]: value, alarm_verified: ctx.fireAlarm.verified };
  const codeRef = ref(ruleId);
  if (!alarmRequired(ctx)) {
    return naEval(`${labelAr} غير منطبق.`, { inputs, code_reference: codeRef });
  }
  if (!hasNonEmpty(value)) return needsData(`${labelAr} غير موثّق.`, inputs, [key], { code_reference: codeRef });
  // Component text alone is not automated code PASS — require FA-01 verified system.
  if (!ctx.fireAlarm.verified) {
    return needsData(
      `${labelAr} مُدخل نصيًا دون تحقق هندسي للنظام (fire_alarm.verified) — لا PASS على الإدخال وحده.`,
      inputs,
      ['fire_alarm.verified'],
      {
        code_reference: codeRef,
        actual_value: value,
        required_value: 'documented_and_system_verified',
        occupancy: occLabel(ctx),
        required_value_source: 'missing',
      }
    );
  }
  return passEval(`${labelAr} موثّق مع تحقق النظام.`, {
    inputs,
    actual_value: value,
    required_value: 'documented_and_system_verified',
    code_reference: codeRef,
    occupancy: occLabel(ctx),
    condition: 'field_present && fire_alarm.verified===true',
    required_value_source: 'engineer_attested',
  });
}

const fireAlarmRules: ComplianceRule[] = [
  {
    id: 'FA-01',
    code: 'SBC 801',
    section: 'Fire Alarm — Required System',
    title: 'Fire alarm required',
    title_ar: 'إلزامية نظام الإنذار',
    applicability: { description: 'Occupancy-based' },
    requiredInputs: ['occupancy alarm thresholds OR building_plan_alarm', 'provided', 'verified'],
    severity: 'mandatory',
    evidenceRequired: ['document'],
    evaluate: (ctx) => {
      const resolved = resolveAlarmRequired(ctx);
      const provided = ctx.fireAlarm.provided;
      const verified = ctx.fireAlarm.verified;
      const inputs = {
        alarm_always: primaryOccupancyDef(ctx)?.alarm_always ?? null,
        threshold: primaryOccupancyDef(ctx)?.alarm_occupants_building ?? null,
        occupant_load: ctx.egress.occupant_load_total,
        plan_alarm: ctx.fireAlarm.building_plan_alarm,
        provided,
        verified,
      };

      if (!resolved) {
        return needsData('لا يمكن تحديد إلزامية الإنذار.', inputs, ['alarm_required|occupancy|occupant_load']);
      }

      const base = {
        inputs,
        required_value: resolved.required,
        occupancy: occLabel(ctx),
        code_reference: resolved.code_reference,
        condition: resolved.condition,
      };

      if (!resolved.required) {
        return passEval('نظام الإنذار غير إلزامي وفق العتبات الموثّقة.', {
          ...base,
          actual_value: provided ?? 'not_required',
        });
      }

      if (provided === 'no') {
        return failEval('نظام الإنذار مطلوب كوديًا وغير متوفر وفق البيانات.', {
          ...base,
          actual_value: 'no',
        });
      }
      if (provided == null || provided === 'unknown') {
        return needsData('نظام الإنذار مطلوب — وجوده غير مؤكد.', inputs, ['fire_alarm.provided'], base);
      }
      if (provided === 'yes' && !verified) {
        return needsData(
          'نظام الإنذار مُعلَن توفره دون تحقق (verified=false) — لا PASS على الادعاء وحده.',
          { ...inputs, verified },
          ['fire_alarm.verified'],
          { ...base, actual_value: 'yes_unverified' }
        );
      }
      return passEval('نظام الإنذار إلزامي وتم توثيق التوفير والتحقق.', {
        ...base,
        actual_value: 'yes_verified',
        evidence: [evidence('document', 'alarm_verified', true, 'fireAlarm')],
      });
    },
  },
  {
    id: 'FA-02',
    code: 'SBC 801',
    section: 'Fire Alarm Panel',
    title: 'Control panel',
    title_ar: 'لوحة التحكم بالإنذار',
    applicability: { description: 'When alarm required' },
    requiredInputs: ['panel'],
    severity: 'mandatory',
    evidenceRequired: ['document'],
    evaluate: (ctx) => evalAlarmField(ctx, 'panel', ctx.fireAlarm.panel, 'لوحة التحكم', 'FA-02'),
  },
  {
    id: 'FA-03',
    code: 'SBC 801',
    section: 'Detection',
    title: 'Detection devices',
    title_ar: 'أجهزة الكشف',
    applicability: { description: 'When alarm required' },
    requiredInputs: ['detection'],
    severity: 'mandatory',
    evidenceRequired: ['drawing'],
    evaluate: (ctx) => evalAlarmField(ctx, 'detection', ctx.fireAlarm.detection, 'الكشف', 'FA-03'),
  },
  {
    id: 'FA-04',
    code: 'SBC 801',
    section: 'Manual Call Points',
    title: 'Manual call points',
    title_ar: 'نقاط الإنذار اليدوي',
    applicability: { description: 'When alarm required' },
    requiredInputs: ['manual_call_points'],
    severity: 'mandatory',
    evidenceRequired: ['drawing'],
    evaluate: (ctx) =>
      evalAlarmField(ctx, 'manual_call_points', ctx.fireAlarm.manual_call_points, 'نقاط النداء اليدوي', 'FA-04'),
  },
  {
    id: 'FA-05',
    code: 'SBC 801',
    section: 'Notification',
    title: 'Notification appliances',
    title_ar: 'أجهزة التنبيه',
    applicability: { description: 'When alarm required' },
    requiredInputs: ['notification'],
    severity: 'mandatory',
    evidenceRequired: ['drawing'],
    evaluate: (ctx) => evalAlarmField(ctx, 'notification', ctx.fireAlarm.notification, 'التنبيه', 'FA-05'),
  },
  {
    id: 'FA-06',
    code: 'SBC 801',
    section: 'Emergency Power',
    title: 'Alarm emergency power',
    title_ar: 'تغذية الطوارئ لنظام الإنذار',
    applicability: { description: 'When alarm required' },
    requiredInputs: ['emergency_power'],
    severity: 'mandatory',
    evidenceRequired: ['document'],
    evaluate: (ctx) =>
      evalAlarmField(ctx, 'emergency_power', ctx.fireAlarm.emergency_power, 'تغذية الطوارئ', 'FA-06'),
  },
  {
    id: 'FA-07',
    code: 'SBC 801',
    section: 'Coverage / Interfaces / C&E',
    title: 'Coverage, interfaces, cause & effect',
    title_ar: 'التغطية والربط وسبب-أثر',
    applicability: { description: 'When alarm required' },
    requiredInputs: ['coverage', 'interfaces', 'cause_and_effect'],
    severity: 'mandatory',
    evidenceRequired: ['document'],
    evaluate: (ctx) => {
      const codeRef = ref('FA-07');
      if (!alarmRequired(ctx)) {
        return naEval('غير منطبق دون إلزام إنذار.', {
          inputs: {
            coverage: ctx.fireAlarm.coverage,
            interfaces: ctx.fireAlarm.interfaces,
            ce: ctx.fireAlarm.cause_and_effect,
          },
          code_reference: codeRef,
        });
      }
      const missing: string[] = [];
      if (!hasNonEmpty(ctx.fireAlarm.coverage)) missing.push('coverage');
      if (!hasNonEmpty(ctx.fireAlarm.interfaces)) missing.push('interfaces');
      if (!hasNonEmpty(ctx.fireAlarm.cause_and_effect)) missing.push('cause_and_effect');
      const inputs = {
        coverage: ctx.fireAlarm.coverage,
        interfaces: ctx.fireAlarm.interfaces,
        cause_and_effect: ctx.fireAlarm.cause_and_effect,
      };
      if (missing.length) {
        return needsData('تغطية/ربط/سبب-أثر غير مكتملة.', inputs, missing, { code_reference: codeRef });
      }
      return passEval('توثيق التغطية والربط وسبب-أثر مكتمل.', {
        inputs,
        actual_value: true,
        required_value: 'documented',
        code_reference: codeRef,
        occupancy: occLabel(ctx),
      });
    },
  },
];

// ─── Smoke control ───────────────────────────────────────────────────────────

const smokeRules: ComplianceRule[] = [
  {
    id: 'SMK-01',
    code: 'SBC 801',
    section: 'Smoke Control',
    title: 'Smoke control when required',
    title_ar: 'التحكم بالدخان عند الإلزام',
    applicability: { description: 'High-rise, atrium, parking, high-hazard, etc.' },
    requiredInputs: ['smoke_control.status', 'not ventilation-only'],
    severity: 'mandatory',
    evidenceRequired: ['document', 'drawing'],
    evaluate: (ctx) => {
      const required = ctx.smokeControl.required === true;
      const status = ctx.smokeControl.status;
      const inputs = {
        required,
        status,
        ventilation_only: ctx.smokeControl.ventilation_only,
        note: ctx.smokeControl.note,
      };
      const codeRef = ref('SMK-01');

      if (!required) {
        if (status === 'not_required') {
          return passEval('التحكم بالدخان غير مطلوب وفق التصنيف.', {
            inputs,
            actual_value: 'not_required',
            required_value: false,
            code_reference: codeRef,
          });
        }
        if (status === 'unknown' && ctx.smokeControl.ventilation_only) {
          return needsData(
            'وجود تهوية فقط لا يعني PASS للتحكم بالدخان — يلزم تحديد المتطلب.',
            inputs,
            ['smoke_control'],
            { code_reference: codeRef }
          );
        }
        if (status === 'unknown') {
          return needsData('متطلب التحكم بالدخان غير محدد.', inputs, ['smoke_control'], { code_reference: codeRef });
        }
        return passEval('حالة التحكم بالدخان موثّقة.', {
          inputs,
          actual_value: status,
          required_value: 'documented',
          code_reference: codeRef,
        });
      }

      if (status === 'required' || status === 'by_design') {
        if (!hasNonEmpty(ctx.smokeControl.note) && status === 'required') {
          return needsData('التحكم بالدخان مطلوب دون تفاصيل تصميم.', inputs, ['smoke_control.note'], {
            code_reference: codeRef,
            required_value: true,
          });
        }
        return passEval('التحكم بالدخان مطلوب وتم توثيق الحالة التصميمية.', {
          inputs,
          actual_value: status,
          required_value: true,
          code_reference: codeRef,
        });
      }
      if (ctx.smokeControl.ventilation_only) {
        return failEval('لا يُقبل اعتبار خانة التهوية وحدها مطابقة للتحكم بالدخان.', {
          inputs,
          actual_value: 'ventilation_only',
          required_value: 'smoke_control_system',
          code_reference: codeRef,
        });
      }
      return needsData('التحكم بالدخان مطلوب — الحالة غير موثّقة.', inputs, ['smoke_control.status'], {
        code_reference: codeRef,
        required_value: true,
      });
    },
  },
];

export const COMPLIANCE_RULES: ComplianceRule[] = [
  ...occupancyRules,
  ...egressRules,
  ...fireAccessRules,
  ...fireProtectionRules,
  ...hydraulicRules,
  ...fireAlarmRules,
  ...smokeRules,
];

export function getComplianceRuleById(id: string): ComplianceRule | undefined {
  return COMPLIANCE_RULES.find((r) => r.id === id);
}
