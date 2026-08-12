/**
 * NFPA 13 architecture rules — sprinkler / density / hydraulic domain.
 * No invented density, spacing, hose, or demand thresholds.
 */

import type { Nfpa13Context, NfpaRuleFinding } from '@/lib/projects/compliance/nfpa/types';
import { evaluateConfiguredOrNeeds } from '@/lib/projects/compliance/nfpa/helpers';

export function evaluateNfpa13(ctx: Nfpa13Context): NfpaRuleFinding[] {
  const edition = ctx.nfpa13_edition;
  const rules: Array<{
    rule_id: string;
    field: string;
    input: { state: typeof ctx.occupancy.state; value: unknown };
    unit?: string | null;
    label_ar: string;
    label_en: string;
  }> = [
    {
      rule_id: 'NFPA13-OCC-HAZARD',
      field: 'hazard_class',
      input: ctx.hazard_class,
      label_ar: 'تصنيف الخطورة (NFPA 13)',
      label_en: 'Hazard classification (NFPA 13)',
    },
    {
      rule_id: 'NFPA13-SPRINKLER-TYPE',
      field: 'sprinkler_type',
      input: ctx.sprinkler_type,
      label_ar: 'نوع الرشاش',
      label_en: 'Sprinkler type',
    },
    {
      rule_id: 'NFPA13-SYSTEM-TYPE',
      field: 'sprinkler_system_type',
      input: ctx.sprinkler_system_type,
      label_ar: 'نوع نظام المرشات',
      label_en: 'Sprinkler system type',
    },
    {
      rule_id: 'NFPA13-DESIGN-AREA',
      field: 'design_area_m2',
      input: ctx.design_area_m2,
      unit: 'm²',
      label_ar: 'مساحة التصميم',
      label_en: 'Design area',
    },
    {
      rule_id: 'NFPA13-DENSITY',
      field: 'density_lpm_m2',
      input: ctx.density_lpm_m2,
      unit: 'L/min·m²',
      label_ar: 'كثافة التصميم',
      label_en: 'Design density',
    },
    {
      rule_id: 'NFPA13-SPACING',
      field: 'sprinkler_spacing_m',
      input: ctx.sprinkler_spacing_m,
      unit: 'm',
      label_ar: 'تباعد الرشاشات',
      label_en: 'Sprinkler spacing',
    },
    {
      rule_id: 'NFPA13-WATER-DEMAND',
      field: 'water_demand_lpm',
      input: ctx.water_demand_lpm,
      unit: 'L/min',
      label_ar: 'طلب الماء',
      label_en: 'Water demand',
    },
    {
      rule_id: 'NFPA13-HOSE-ALLOWANCE',
      field: 'hose_allowance_lpm',
      input: ctx.hose_allowance_lpm,
      unit: 'L/min',
      label_ar: 'بدل الخراطيم',
      label_en: 'Hose stream allowance',
    },
    {
      rule_id: 'NFPA13-REMOTE-AREA',
      field: 'remote_area_m2',
      input: ctx.remote_area_m2,
      unit: 'm²',
      label_ar: 'المنطقة النائية',
      label_en: 'Remote area',
    },
    {
      rule_id: 'NFPA13-HYDRAULIC-INPUTS',
      field: 'hydraulic_network_complete',
      input: ctx.hydraulic_network_complete,
      label_ar: 'مدخلات الحساب الهيدروليكي',
      label_en: 'Hydraulic calculation inputs',
    },
    {
      rule_id: 'NFPA13-WATER-SUPPLY',
      field: 'available_water_supply',
      input: ctx.available_water_supply,
      label_ar: 'مصدر المياه المتاح',
      label_en: 'Available water supply',
    },
    {
      rule_id: 'NFPA13-K-FACTOR',
      field: 'k_factor',
      input: ctx.k_factor,
      label_ar: 'معامل K',
      label_en: 'K-factor',
    },
  ];

  // If sprinkler not required → N/A for system-specific rules (keep occupancy/hazard)
  const sprinklerNeeded =
    ctx.sprinkler_required.state === 'VALID' && ctx.sprinkler_required.value === 'yes';
  const sprinklerUnknown =
    ctx.sprinkler_required.state !== 'VALID' || ctx.sprinkler_required.value !== 'no';

  return rules.map((r) => {
    if (
      !sprinklerNeeded &&
      !sprinklerUnknown &&
      r.rule_id !== 'NFPA13-OCC-HAZARD' &&
      r.field !== 'hazard_class'
    ) {
      return {
        code: 'NFPA-13' as const,
        edition: edition.value,
        rule_id: r.rule_id,
        field: r.field,
        status: 'N/A' as const,
        actual_value: null,
        required_value: null,
        unit: r.unit ?? null,
        explanation_ar: 'نظام المرشات غير مطلوب وفق بيان المشروع — N/A.',
        explanation_en: 'Sprinkler system not required per project record — N/A.',
        source: 'lib/projects/compliance/nfpa',
        authoritative: true as const,
        input_state: ctx.sprinkler_required.state,
      };
    }
    return evaluateConfiguredOrNeeds({
      code: 'NFPA-13',
      rule_id: r.rule_id,
      field: r.field,
      input: r.input,
      edition,
      unit: r.unit,
      label_ar: r.label_ar,
      label_en: r.label_en,
    });
  });
}
