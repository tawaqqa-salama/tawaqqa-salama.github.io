/** NFPA 22 architecture — water tank domain. No default tank size. */

import type { Nfpa22Context, NfpaRuleFinding } from '@/lib/projects/compliance/nfpa/types';
import { evaluateConfiguredOrNeeds } from '@/lib/projects/compliance/nfpa/helpers';

export function evaluateNfpa22(ctx: Nfpa22Context): NfpaRuleFinding[] {
  const edition = ctx.nfpa22_edition;
  const defs = [
    {
      rule_id: 'NFPA22-TANK-REQUIRED',
      field: 'tank_exists',
      input: ctx.tank_exists,
      label_ar: 'وجود/متطلب الخزان',
      label_en: 'Tank present/required',
    },
    {
      rule_id: 'NFPA22-CAPACITY',
      field: 'tank_capacity_m3',
      input: ctx.tank_capacity_m3,
      unit: 'm³',
      label_ar: 'سعة الخزان',
      label_en: 'Tank capacity',
    },
    {
      rule_id: 'NFPA22-USABLE-VOLUME',
      field: 'usable_volume_m3',
      input: ctx.usable_volume_m3,
      unit: 'm³',
      label_ar: 'الحجم القابل للاستخدام',
      label_en: 'Usable water volume',
    },
    {
      rule_id: 'NFPA22-TANK-TYPE',
      field: 'tank_type',
      input: ctx.tank_type,
      label_ar: 'نوع الخزان',
      label_en: 'Tank type',
    },
    {
      rule_id: 'NFPA22-DURATION',
      field: 'duration_min',
      input: ctx.duration_min,
      unit: 'min',
      label_ar: 'أساس مدة التشغيل',
      label_en: 'Duration basis',
    },
    {
      rule_id: 'NFPA22-FIRE-DEMAND',
      field: 'fire_demand_lpm',
      input: ctx.fire_demand_lpm,
      unit: 'L/min',
      label_ar: 'طلب الحريق المرتبط',
      label_en: 'Fire demand dependency',
    },
  ] as const;

  return defs.map((d) =>
    evaluateConfiguredOrNeeds({
      code: 'NFPA-22',
      rule_id: d.rule_id,
      field: d.field,
      input: d.input,
      edition,
      unit: 'unit' in d ? d.unit : null,
      label_ar: d.label_ar,
      label_en: d.label_en,
    })
  );
}
