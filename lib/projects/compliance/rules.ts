/**
 * Deterministic SBC 201 / SBC 801 compliance rules registry.
 * Missing required inputs → NEEDS_DATA (never PASS by assumption).
 */

import { evidence, hasNonEmpty } from '@/lib/projects/compliance/evidence';
import { SBC_OCCUPANCIES, SBC_STRUCTURE_RULES, type SbcOccupancyCode } from '@/lib/constants/sbc801';
import type {
  ComplianceRule,
  ComplianceRuleContext,
  ComplianceRuleEvaluation,
} from '@/lib/projects/compliance/types';

function needs(
  message: string,
  inputs: ComplianceRuleEvaluation['inputs'] = {},
  missing: string[] = []
): ComplianceRuleEvaluation {
  return {
    status: 'NEEDS_DATA',
    message: missing.length ? `${message} (ناقص: ${missing.join('، ')})` : message,
    inputs,
    evidence: missing.map((m) => evidence('none', m, null)),
    remediation: 'أدخل البيانات الهندسية الموثّقة أو قدّم Engineer Override مع سبب ومرجع كودي.',
  };
}

function pass(message: string, inputs: ComplianceRuleEvaluation['inputs'] = {}, ev = evidence('measurement', 'verified', true)): ComplianceRuleEvaluation {
  return { status: 'PASS', message, inputs, evidence: [ev] };
}

function fail(message: string, inputs: ComplianceRuleEvaluation['inputs'] = {}, remediation?: string): ComplianceRuleEvaluation {
  return {
    status: 'FAIL',
    message,
    inputs,
    evidence: [evidence('measurement', 'check', false)],
    remediation,
  };
}

function na(message: string, inputs: ComplianceRuleEvaluation['inputs'] = {}): ComplianceRuleEvaluation {
  return { status: 'N/A', message, inputs, evidence: [evidence('none', 'not applicable')] };
}

/** Independent exit count from occupant load — not “exits = occupants”. */
export function requiredExitsFromOccupantLoad(occupants: number): number {
  if (occupants <= 49) return 1;
  if (occupants <= 500) return 2;
  return Math.max(3, Math.ceil(occupants / 500) + 1);
}

function primaryOccupancyDef(ctx: ComplianceRuleContext) {
  const code = ctx.occupancyZones.find((z) => z.occupancy_code)?.occupancy_code as SbcOccupancyCode | undefined;
  if (code && SBC_OCCUPANCIES[code]) return SBC_OCCUPANCIES[code];
  return null;
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
      const inputs = { occupancy_classification: occ, zones_with_code: ctx.occupancyZones.filter((z) => z.occupancy_code).length };
      if (!hasNonEmpty(occ) && !zoneOcc) {
        return needs('تصنيف الإشغال غير موثّق (لا يعتمد على القائمة وحدها دون قيمة).', inputs, ['occupancy_classification']);
      }
      return pass('تصنيف الإشغال متوفر من المخطط/المناطق.', inputs, evidence('document', 'occupancy', occ || 'zones'));
    },
  },
  {
    id: 'OCC-02',
    code: 'SBC 201',
    section: 'Occupancy Group',
    title: 'Occupancy group letter',
    title_ar: 'مجموعة الإشغال (Group)',
    applicability: { description: 'When occupancy is classified' },
    requiredInputs: ['group_letter'],
    severity: 'mandatory',
    evidenceRequired: ['document'],
    evaluate: (ctx) => {
      const g = ctx.building.group_letter || ctx.occupancyZones.find((z) => z.group_letter)?.group_letter;
      const inputs = { group_letter: g };
      if (!hasNonEmpty(g)) return needs('حرف مجموعة الإشغال غير محدد.', inputs, ['group_letter']);
      return pass(`مجموعة الإشغال: ${g}`, inputs);
    },
  },
  {
    id: 'OCC-03',
    code: 'SBC 201',
    section: 'Construction Type',
    title: 'Construction type',
    title_ar: 'نوع الإنشاء',
    applicability: { description: 'Always' },
    requiredInputs: ['construction_type / building_type_code'],
    severity: 'mandatory',
    evidenceRequired: ['document'],
    evaluate: (ctx) => {
      const t = ctx.building.construction_type || ctx.building.building_type_code;
      const inputs = { construction_type: t };
      if (!hasNonEmpty(t)) return needs('نوع الإنشاء غير موثّق.', inputs, ['building_type_code']);
      return pass(`نوع الإنشاء: ${t}`, inputs);
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
      const inputs = { building_area_m2: a };
      if (a == null || a <= 0) return needs('مساحة المبنى غير موثّقة.', inputs, ['building_area_m2']);
      return pass(`المساحة ${a} م²`, inputs);
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
        return needs('يلزم توثيق الارتفاع أو عدد الأدوار.', inputs, ['building_height_m|stories']);
      }
      return pass('بيانات الارتفاع/الأدوار متوفرة.', inputs);
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
      if (ctx.building.high_rise == null && ctx.building.building_height_m == null) {
        return needs('لم يُحدد إن كان المبنى عالي الارتفاع.', inputs, ['high_rise']);
      }
      return pass(
        ctx.building.high_rise ? 'مبنى عالي الارتفاع وفق البيانات.' : 'ليس عالي الارتفاع وفق البيانات.',
        inputs
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
      if (!ctx.occupancyZones.length) return needs('لا توجد مناطق إشغال للتقييم.', inputs, ['floor_uses.zones']);
      if (ctx.building.mixed_occupancy) {
        return pass('إشغال مختلط موثّق من المناطق.', inputs);
      }
      return pass('إشغال غير مختلط وفق المناطق الحالية.', inputs);
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
      if (!anyKnown) return needs('ظروف خاصة غير موثّقة (قبو/أتريوم/…).', inputs, ['special_conditions']);
      return pass('تم تسجيل حالة الظروف الخاصة المتاحة.', inputs);
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
        return needs('حمل الشاغلين غير محسوب — يلزم مساحات وعوامل تحميل.', inputs, ['occupant_load']);
      }
      return pass(`إجمالي الشاغلين المحسوب: ${total}`, inputs, evidence('calculation', 'occupant_load', total, 'zones'));
    },
  },
  {
    id: 'EGR-02',
    code: 'SBC 201',
    section: '1006 Number of Exits',
    title: 'Number of exits vs required',
    title_ar: 'عدد المخارج مقابل المطلوب',
    applicability: { description: 'When occupant load known' },
    requiredInputs: ['occupant_load_total', 'exits_count'],
    severity: 'mandatory',
    evidenceRequired: ['drawing', 'measurement'],
    evaluate: (ctx) => {
      const load = ctx.egress.occupant_load_total;
      const exits = ctx.egress.exits_count;
      const inputs: Record<string, string | number | boolean | null | undefined> = {
        occupant_load_total: load,
        exits_count: exits,
      };
      if (load == null) return needs('لا يمكن تقييم عدد المخارج دون حمل شاغلين.', inputs, ['occupant_load']);
      if (exits == null) return needs('عدد المخارج الفعلي غير موثّق.', inputs, ['exits_count']);
      const required = requiredExitsFromOccupantLoad(load);
      inputs.required_exits = required;
      // Explicitly NOT using exits === occupants
      if (exits < required) {
        return fail(
          `المخارج المتوفرة (${exits}) أقل من المطلوب كوديًا (${required}) لـ ${load} شاغل.`,
          inputs,
          'زيادة المخارج أو إعادة توزيع الإشغال وفق SBC 201 §1006.'
        );
      }
      return pass(`المخارج ${exits} ≥ المطلوب ${required} (حسب حمل الشاغلين وليس معادلة مخارج=شاغلين).`, inputs);
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
      if (cap == null) return needs('سعة المخارج غير موثّقة.', inputs, ['exit_capacity_persons']);
      if (load == null) return needs('حمل الشاغلين ناقص لمقارنة السعة.', inputs, ['occupant_load']);
      if (cap < load) return fail(`سعة المخارج (${cap}) أقل من الحمل (${load}).`, inputs);
      return pass('سعة المخارج كافية للحمل الموثّق.', inputs);
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
      const inputs = { exit_access_ok: v };
      if (v == null) return needs('مسار الوصول للمخرج غير موثّق.', inputs, ['exit_access']);
      return v ? pass('مسار الوصول موثّق كمقبول.', inputs) : fail('مسار الوصول غير مقبول وفق البيانات.', inputs);
    },
  },
  {
    id: 'EGR-05',
    code: 'SBC 201',
    section: '1007 Exit Separation',
    title: 'Exit separation',
    title_ar: 'تباعد المخارج',
    applicability: { description: 'When 2+ exits required' },
    requiredInputs: ['exit_separation_m'],
    severity: 'mandatory',
    evidenceRequired: ['measurement', 'drawing'],
    evaluate: (ctx) => {
      const load = ctx.egress.occupant_load_total;
      const sep = ctx.egress.exit_separation_m;
      const inputs = { exit_separation_m: sep, occupant_load_total: load };
      if (load != null && requiredExitsFromOccupantLoad(load) < 2) {
        return na('مخرج واحد مطلوب — تباعد المخارج غير منطبق.', inputs);
      }
      if (sep == null) return needs('تباعد المخارج غير مقاس/موثّق.', inputs, ['exit_separation_m']);
      return pass(`تباعد المخارج الموثّق: ${sep} م`, inputs);
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
    evaluate: (ctx) => {
      const d = ctx.egress.travel_distance_m;
      const inputs = { travel_distance_m: d };
      if (d == null) return needs('مسافة السفر غير موثّقة — لا افتراض.', inputs, ['travel_distance_m']);
      // Soft advisory limits from SBC 801 summary (sprinklered 60 / unsprinklered 45) when sprinkler known
      const spr = ctx.fireProtection.sprinkler_provided;
      if (spr === 'yes' || spr === 'no') {
        const limit = spr === 'yes' ? 60 : 45;
        if (d > limit) return fail(`مسافة السفر ${d} م تتجاوز الحد الاسترشادي ${limit} م.`, inputs);
      }
      return pass(`مسافة السفر الموثّقة: ${d} م`, inputs);
    },
  },
  {
    id: 'EGR-07',
    code: 'SBC 201',
    section: '1016.2 Common Path',
    title: 'Common path of travel',
    title_ar: 'المسار المشترك',
    applicability: { description: 'Always' },
    requiredInputs: ['common_path_m'],
    severity: 'mandatory',
    evidenceRequired: ['measurement'],
    evaluate: (ctx) => {
      const d = ctx.egress.common_path_m;
      const inputs = { common_path_m: d };
      if (d == null) return needs('المسار المشترك غير موثّق.', inputs, ['common_path_m']);
      return pass(`المسار المشترك: ${d} م`, inputs);
    },
  },
  {
    id: 'EGR-08',
    code: 'SBC 201',
    section: '1020 Dead Ends',
    title: 'Dead-end corridors',
    title_ar: 'الطرق المسدودة',
    applicability: { description: 'Always' },
    requiredInputs: ['dead_end_m'],
    severity: 'mandatory',
    evidenceRequired: ['measurement'],
    evaluate: (ctx) => {
      const d = ctx.egress.dead_end_m;
      const inputs = { dead_end_m: d };
      if (d == null) return needs('طول الطريق المسدود غير موثّق.', inputs, ['dead_end_m']);
      return pass(`الطريق المسدود الموثّق: ${d} م`, inputs);
    },
  },
  {
    id: 'EGR-09',
    code: 'SBC 201',
    section: '1020 Corridors',
    title: 'Corridor width',
    title_ar: 'عرض الممرات',
    applicability: { description: 'Always' },
    requiredInputs: ['corridor_width_m'],
    severity: 'mandatory',
    evidenceRequired: ['measurement'],
    evaluate: (ctx) => {
      const w = ctx.egress.corridor_width_m;
      const inputs = { corridor_width_m: w };
      if (w == null) return needs('عرض الممرات غير موثّق.', inputs, ['corridor_width_m']);
      return pass(`عرض الممر: ${w} م`, inputs);
    },
  },
  {
    id: 'EGR-10',
    code: 'SBC 201',
    section: '1010 Doors',
    title: 'Egress door width',
    title_ar: 'عرض أبواب المخارج',
    applicability: { description: 'Always' },
    requiredInputs: ['door_width_m'],
    severity: 'mandatory',
    evidenceRequired: ['measurement'],
    evaluate: (ctx) => {
      const w = ctx.egress.door_width_m;
      const inputs = { door_width_m: w, emergency_exit_doors: ctx.egress.emergency_exit_doors };
      if (w == null && !hasNonEmpty(ctx.egress.emergency_exit_doors)) {
        return needs('عرض/تفاصيل أبواب المخارج غير موثّقة.', inputs, ['door_width_m']);
      }
      if (w == null) return needs('عرض الباب غير مقاس رغم وجود وصف أبواب.', inputs, ['door_width_m']);
      return pass(`عرض الباب: ${w} م`, inputs);
    },
  },
  {
    id: 'EGR-11',
    code: 'SBC 201',
    section: '1011 Stairs',
    title: 'Egress stairs',
    title_ar: 'سلالم الهروب',
    applicability: { description: 'Multi-story buildings' },
    requiredInputs: ['stairs_count', 'stair_width_m'],
    severity: 'mandatory',
    evidenceRequired: ['drawing', 'measurement'],
    evaluate: (ctx) => {
      const stories = ctx.building.stories;
      const stairs = ctx.egress.stairs_count;
      const width = ctx.egress.stair_width_m;
      const inputs = { stories, stairs_count: stairs, stair_width_m: width };
      if (stories != null && stories <= 1 && (ctx.building.basement_floors == null || ctx.building.basement_floors <= 0)) {
        return na('مبنى دور واحد دون قبو — سلالم الهروب غير منطبقة كمتطلب أدوار متعددة.', inputs);
      }
      if (stairs == null) return needs('عدد السلالم غير موثّق.', inputs, ['stairs_count']);
      if (width == null) return needs('عرض السلم غير موثّق.', inputs, ['stair_width_m']);
      if (stairs < 1) return fail('لا توجد سلالم موثّقة لمبنى متعدد الأدوار.', inputs);
      return pass(`سلالم: ${stairs}، العرض: ${width} م`, inputs);
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
      const inputs = { exit_discharge_ok: v };
      if (v == null) return needs('تصريف الخروج النهائي غير موثّق.', inputs, ['exit_discharge']);
      return v ? pass('تصريف الخروج موثّق كمقبول.', inputs) : fail('تصريف الخروج غير مقبول.', inputs);
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
      const inputs = { site_entrance: a.site_entrance, fire_road: a.fire_road, building_access: a.building_access };
      if (!hasNonEmpty(a.site_entrance) && !hasNonEmpty(a.fire_road) && !hasNonEmpty(a.building_access)) {
        return needs('وصول آليات الإطفاء غير موثّق.', inputs, ['fire_apparatus_access']);
      }
      return pass('بيانات وصول الآليات موثّقة جزئيًا/كليًا.', inputs);
    },
  },
  {
    id: 'FAC-02',
    code: 'SBC 801',
    section: 'Access Width',
    title: 'Access road width',
    title_ar: 'عرض طريق الوصول',
    applicability: { description: 'Always' },
    requiredInputs: ['road_width_m'],
    severity: 'mandatory',
    evidenceRequired: ['measurement'],
    evaluate: (ctx) => {
      const w = ctx.fireAccess.road_width_m;
      const inputs = { road_width_m: w };
      if (w == null) return needs('عرض طريق الوصول غير موثّق — لا افتراض PASS.', inputs, ['road_width_m']);
      if (w < 6) return fail(`عرض الطريق ${w} م أقل من الحد الأدنى الشائع 6 م — يلزم تحقق مهندس/مرجع.`, inputs);
      return pass(`عرض الطريق: ${w} م`, inputs);
    },
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
      if (!hasNonEmpty(ctx.fireAccess.staging_area) && !hasNonEmpty(ctx.fireAccess.notes)) {
        return needs('خلو المسار/منطقة التمركز غير موثّقة.', inputs, ['staging_area']);
      }
      return pass('تم توثيق منطقة التمركز أو ملاحظات الوصول.', inputs);
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
        return needs('ظروف الالتفاف/الوصول غير موثّقة.', inputs, ['turning_access']);
      }
      return pass('ظروف الوصول موثّقة.', inputs);
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
      if (!hasNonEmpty(ctx.fireAccess.fdc_present)) {
        return needs('حالة FDC غير موثّقة.', inputs, ['civil_defense_connection']);
      }
      if (!hasNonEmpty(ctx.fireAccess.fdc_location)) {
        return needs('موقع FDC غير موثّق.', inputs, ['connection_location']);
      }
      return pass('FDC وموقعه موثّقان.', inputs);
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
    requiredInputs: ['occupancy thresholds OR sprinkler.required'],
    severity: 'mandatory',
    evidenceRequired: ['document', 'calculation'],
    evaluate: (ctx) => {
      const def = primaryOccupancyDef(ctx);
      const area = ctx.building.building_area_m2;
      const explicit = ctx.fireProtection.sprinkler_required;
      const inputs = {
        sprinkler_required: explicit,
        occupancy: def?.code,
        area_m2: area,
        sprinkler_always: def?.sprinkler_always ?? null,
      };
      let required: boolean | null = null;
      if (explicit === 'yes') required = true;
      else if (explicit === 'no') required = false;
      else if (def?.sprinkler_always) required = true;
      else if (def?.sprinkler_total_area_m2 != null && area != null) {
        required = area >= def.sprinkler_total_area_m2;
      } else if (def?.sprinkler_fire_area_m2 != null && area != null) {
        required = area >= def.sprinkler_fire_area_m2;
      }
      if (required == null) {
        return needs('لا يمكن الجزم بإلزامية المرشات دون إشغال/مساحة/إدخال مهندس.', inputs, ['sprinkler_required']);
      }
      const provided = ctx.fireProtection.sprinkler_provided;
      if (required && provided !== 'yes' && explicit !== 'yes') {
        // If engineer marked required but building plan not yes → still needs confirmation of provision
        if (provided == null) {
          return needs('المرشات مطلوبة كوديًا لكن وجودها غير مؤكد في البيانات.', { ...inputs, provided }, [
            'sprinkler_system',
          ]);
        }
        if (provided === 'no') return fail('المرشات مطلوبة وغير متوفرة وفق البيانات.', { ...inputs, provided });
      }
      if (!required) return pass('المرشات غير إلزامية وفق العتبات المتاحة / إدخال المهندس.', inputs);
      if (provided === 'yes' || explicit === 'yes') return pass('المرشات مطلوبة وتم توثيق التوفير/التصميم.', inputs);
      return needs('المرشات مطلوبة — يلزم تأكيد التوفير.', { ...inputs, provided }, ['sprinkler_provided']);
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
      if (!hasNonEmpty(h)) return needs('تصنيف الخطورة غير موثّق.', inputs, ['hazard_class']);
      return pass(`تصنيف الخطورة: ${h}`, inputs);
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
      const needed =
        ctx.fireProtection.sprinkler_required === 'yes' ||
        ctx.fireProtection.sprinkler_provided === 'yes';
      const inputs = {
        design_area_m2: ctx.fireProtection.design_area_m2,
        density: ctx.fireProtection.density_lpm_m2,
      };
      if (!needed) return na('المرشات غير مطلوبة/غير مفعّلة — منطقة التصميم غير منطبقة.', inputs);
      if (ctx.fireProtection.design_area_m2 == null || ctx.fireProtection.density_lpm_m2 == null) {
        return needs('منطقة التصميم و/أو الكثافة غير موثّقتين.', inputs, ['design_area', 'density']);
      }
      return pass('منطقة التصميم والكثافة موثّقتان.', inputs);
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
      const needed =
        ctx.fireProtection.sprinkler_required === 'yes' ||
        ctx.fireProtection.sprinkler_provided === 'yes';
      const demand = ctx.fireProtection.sprinkler_demand_lpm;
      const pump = ctx.fireProtection.pump_flow_lpm;
      const inputs = { sprinkler_demand_lpm: demand, pump_flow_lpm: pump };
      if (!needed) return na('لا ينطبق دون نظام مرشات.', inputs);
      if (demand == null) {
        return needs(
          'طلب المرشات التصميمي غير موثّق. تدفق المضخة لا يُعدّ تلقائيًا Required Fire Demand.',
          inputs,
          ['sprinkler.design_flow']
        );
      }
      // If only pump equals demand with no separate demand field historically — still OK if design_flow set
      return pass(`طلب المرشات الموثّق: ${demand} لتر/د`, inputs, evidence('calculation', 'sprinkler_demand', demand));
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
      const needed =
        ctx.fireProtection.sprinkler_required === 'yes' ||
        ctx.fireProtection.sprinkler_provided === 'yes';
      const inputs = { hose_allowance_lpm: ctx.fireProtection.hose_allowance_lpm };
      if (!needed) return na('غير منطبق.', inputs);
      if (ctx.fireProtection.hose_allowance_lpm == null) {
        return needs('بدل الخراطيم غير موثّق.', inputs, ['hose_allowance']);
      }
      return pass(`بدل الخراطيم: ${ctx.fireProtection.hose_allowance_lpm} لتر/د`, inputs);
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
      const inputs = { height_m: h, standpipe_required: explicit };
      let required: boolean | null = null;
      if (explicit === 'yes') required = true;
      else if (explicit === 'no') required = false;
      else if (h != null) required = h >= SBC_STRUCTURE_RULES.standpipe_height_m;
      if (required == null) return needs('لا يمكن تحديد متطلب Standpipe.', inputs, ['standpipe_required|height']);
      if (!required) return pass('Standpipe غير مطلوب وفق الارتفاع/الإدخال.', inputs);
      if (ctx.fireProtection.standpipe_provided === 'yes' || hasNonEmpty(ctx.fireProtection.standpipe_required)) {
        if (explicit === 'yes' || ctx.fireProtection.standpipe_provided === 'yes') {
          return pass('Standpipe مطلوب وتم توثيقه.', inputs);
        }
      }
      return needs('Standpipe مطلوب — يلزم توثيق التوفير.', inputs, ['standpipe']);
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
      const systemNeeded =
        ctx.fireProtection.sprinkler_required === 'yes' ||
        ctx.fireProtection.sprinkler_provided === 'yes' ||
        ctx.fireProtection.standpipe_required === 'yes';
      if (!systemNeeded) return na('لا يوجد نظام يتطلب مضخة وفق البيانات الحالية.', inputs);
      if (exists == null) return needs('وجود مضخة الحريق غير موثّق.', inputs, ['pump.exists']);
      if (exists === 'no') return fail('المضخة غير موجودة رغم احتياج النظام.', inputs);
      if (pump == null) return needs('تدفق المضخة غير موثّق.', inputs, ['pump.capacity']);
      if (demand == null) {
        return needs(
          'لا يمكن مطابقة واجب المضخة دون طلب مرشات تصميمي مستقل (Pump Flow ≠ Demand).',
          inputs,
          ['sprinkler_demand']
        );
      }
      if (pump < demand) return fail(`تدفق المضخة ${pump} < طلب المرشات ${demand}.`, inputs);
      return pass('المضخة موثّقة وتدفقها لا يقل عن طلب المرشات الموثّق.', inputs);
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
        ctx.fireProtection.sprinkler_required === 'yes' ||
        ctx.fireProtection.sprinkler_provided === 'yes' ||
        ctx.fireProtection.pump_exists === 'yes';
      const inputs = {
        tank_exists: ctx.fireProtection.tank_exists,
        volume: ctx.fireProtection.tank_volume_m3,
        duration: ctx.fireProtection.tank_duration_min,
        required: ctx.fireProtection.tank_required_m3,
      };
      if (!systemNeeded) return na('خزان الإطفاء غير منطبق وفق البيانات.', inputs);
      if (ctx.fireProtection.tank_exists == null) return needs('وجود الخزان غير موثّق.', inputs, ['tank.exists']);
      if (ctx.fireProtection.tank_exists === 'no') return fail('الخزان غير موجود رغم احتياج النظام.', inputs);
      if (ctx.fireProtection.tank_volume_m3 == null || ctx.fireProtection.tank_duration_min == null) {
        return needs('سعة و/أو مدة الخزان غير موثّقة.', inputs, ['tank_volume', 'duration']);
      }
      if (
        ctx.fireProtection.tank_required_m3 != null &&
        ctx.fireProtection.tank_volume_m3 + 1e-6 < ctx.fireProtection.tank_required_m3
      ) {
        return fail(
          `سعة الخزان ${ctx.fireProtection.tank_volume_m3} م³ أقل من المحسوب ${ctx.fireProtection.tank_required_m3} م³.`,
          inputs
        );
      }
      return pass('بيانات الخزان موثّقة.', inputs);
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
        ctx.fireProtection.sprinkler_required === 'yes' ||
        ctx.fireProtection.standpipe_required === 'yes';
      const inputs = { fdc: ctx.fireAccess.fdc_present };
      if (!systemNeeded) return na('FDC غير منطبق دون نظام مرشات/مواسير.', inputs);
      if (!hasNonEmpty(ctx.fireAccess.fdc_present)) return needs('متطلب/وجود FDC غير موثّق.', inputs, ['FDC']);
      return pass('FDC موثّق.', inputs);
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
      if (n == null || n <= 0) return needs('طفايات الحريق غير موثّقة.', inputs, ['extinguishers']);
      return pass(`عدد الطفايات الموثّق: ${n}`, inputs);
    },
  },
];

// ─── Hydraulic foundation ────────────────────────────────────────────────────

const hydraulicRules: ComplianceRule[] = [
  {
    id: 'HYD-01',
    code: 'SBC 801',
    section: 'Hydraulic Calculation Foundation',
    title: 'Pipe network hydraulic data',
    title_ar: 'أساس الحساب الهيدروليكي لشبكة الأنابيب',
    applicability: { description: 'When sprinkler system is required/provided' },
    requiredInputs: [
      'k_factor',
      'flow',
      'pressure',
      'pipe_diameter',
      'pipe_length',
      'elevation',
      'friction_loss',
      'remote_area',
      'node_demand',
    ],
    severity: 'mandatory',
    evidenceRequired: ['calculation', 'document'],
    evaluate: (ctx) => {
      const needed =
        ctx.fireProtection.sprinkler_required === 'yes' ||
        ctx.fireProtection.sprinkler_provided === 'yes';
      const h = ctx.hydraulic;
      const inputs = {
        has_network_data: h.has_network_data,
        k_factor: h.k_factor,
        flow: h.flow_lpm,
        pressure: h.pressure_bar,
        pipe_diameter_mm: h.pipe_diameter_mm,
        pipe_length_m: h.pipe_length_m,
        elevation_m: h.elevation_m,
        friction_loss_bar: h.friction_loss_bar,
        remote_area_m2: h.remote_area_m2,
        node_demand_lpm: h.node_demand_lpm,
      };
      if (!needed) return na('لا يوجد نظام مرشات يتطلب هيدروليك شبكة.', inputs);
      const missing: string[] = [];
      if (h.k_factor == null) missing.push('K-factor');
      if (h.flow_lpm == null) missing.push('flow');
      if (h.pressure_bar == null) missing.push('pressure');
      if (h.pipe_diameter_mm == null) missing.push('pipe_diameter');
      if (h.pipe_length_m == null) missing.push('pipe_length');
      if (h.elevation_m == null) missing.push('elevation');
      if (h.friction_loss_bar == null) missing.push('friction_loss');
      if (h.remote_area_m2 == null) missing.push('remote_area');
      if (h.node_demand_lpm == null) missing.push('node_demand');
      if (missing.length) {
        return needs(
          'بيانات شبكة الأنابيب الهيدروليكية ناقصة — النتيجة NEEDS_DATA وليس PASS.',
          inputs,
          missing
        );
      }
      return pass('أساس الحساب الهيدروليكي مكتمل الحقول.', inputs);
    },
  },
];

// ─── Fire alarm ──────────────────────────────────────────────────────────────

const fireAlarmRules: ComplianceRule[] = [
  {
    id: 'FA-01',
    code: 'SBC 801',
    section: 'Fire Alarm — Required System',
    title: 'Fire alarm required',
    title_ar: 'إلزامية نظام الإنذار',
    applicability: { description: 'Occupancy-based' },
    requiredInputs: ['occupancy alarm thresholds OR building_plan_alarm'],
    severity: 'mandatory',
    evidenceRequired: ['document'],
    evaluate: (ctx) => {
      const def = primaryOccupancyDef(ctx);
      const load = ctx.egress.occupant_load_total;
      const inputs = {
        alarm_always: def?.alarm_always ?? null,
        threshold: def?.alarm_occupants_building ?? null,
        occupant_load: load,
        plan_alarm: ctx.fireAlarm.building_plan_alarm,
      };
      let required: boolean | null = null;
      if (def?.alarm_always) required = true;
      else if (def?.alarm_occupants_building != null && load != null) {
        required = load >= def.alarm_occupants_building;
      } else if (ctx.fireAlarm.building_plan_alarm === 'yes') required = true;
      else if (ctx.fireAlarm.building_plan_alarm === 'no') required = false;
      if (required == null) return needs('لا يمكن تحديد إلزامية الإنذار.', inputs, ['alarm_required']);
      if (!required) return pass('نظام الإنذار غير إلزامي وفق العتبات المتاحة.', inputs);
      return pass('نظام الإنذار إلزامي وفق الإشغال/العتبة.', { ...inputs, required: true });
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
    evaluate: (ctx) => evalAlarmField(ctx, 'panel', ctx.fireAlarm.panel, 'لوحة التحكم'),
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
    evaluate: (ctx) => evalAlarmField(ctx, 'detection', ctx.fireAlarm.detection, 'الكشف'),
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
      evalAlarmField(ctx, 'manual_call_points', ctx.fireAlarm.manual_call_points, 'نقاط النداء اليدوي'),
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
    evaluate: (ctx) => evalAlarmField(ctx, 'notification', ctx.fireAlarm.notification, 'التنبيه'),
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
      evalAlarmField(ctx, 'emergency_power', ctx.fireAlarm.emergency_power, 'تغذية الطوارئ'),
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
      if (!alarmRequired(ctx)) {
        return na('غير منطبق دون إلزام إنذار.', {
          coverage: ctx.fireAlarm.coverage,
          interfaces: ctx.fireAlarm.interfaces,
          ce: ctx.fireAlarm.cause_and_effect,
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
      if (missing.length) return needs('تغطية/ربط/سبب-أثر غير مكتملة.', inputs, missing);
      return pass('توثيق التغطية والربط وسبب-أثر مكتمل.', inputs);
    },
  },
];

function alarmRequired(ctx: ComplianceRuleContext): boolean {
  const def = primaryOccupancyDef(ctx);
  const load = ctx.egress.occupant_load_total;
  if (def?.alarm_always) return true;
  if (def?.alarm_occupants_building != null && load != null && load >= def.alarm_occupants_building) return true;
  if (ctx.fireAlarm.building_plan_alarm === 'yes') return true;
  return false;
}

function evalAlarmField(
  ctx: ComplianceRuleContext,
  key: string,
  value: string | null | undefined,
  labelAr: string
): ComplianceRuleEvaluation {
  const inputs = { [key]: value };
  if (!alarmRequired(ctx)) return na(`${labelAr} غير منطبق.`, inputs);
  if (!hasNonEmpty(value)) return needs(`${labelAr} غير موثّق.`, inputs, [key]);
  return pass(`${labelAr} موثّق.`, inputs);
}

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
      if (!required) {
        if (status === 'not_required') return pass('التحكم بالدخان غير مطلوب وفق التصنيف.', inputs);
        if (status === 'unknown' && ctx.smokeControl.ventilation_only) {
          return needs(
            'وجود تهوية فقط لا يعني PASS للتحكم بالدخان — يلزم تحديد المتطلب.',
            inputs,
            ['smoke_control']
          );
        }
        if (status === 'unknown') return needs('متطلب التحكم بالدخان غير محدد.', inputs, ['smoke_control']);
        return pass('حالة التحكم بالدخان موثّقة.', inputs);
      }
      // required
      if (status === 'required' || status === 'by_design') {
        if (!hasNonEmpty(ctx.smokeControl.note) && status === 'required') {
          return needs('التحكم بالدخان مطلوب دون تفاصيل تصميم.', inputs, ['smoke_control.note']);
        }
        return pass('التحكم بالدخان مطلوب وتم توثيق الحالة التصميمية.', inputs);
      }
      if (ctx.smokeControl.ventilation_only) {
        return fail('لا يُقبل اعتبار خانة التهوية وحدها مطابقة للتحكم بالدخان.', inputs);
      }
      return needs('التحكم بالدخان مطلوب — الحالة غير موثّقة.', inputs, ['smoke_control.status']);
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
