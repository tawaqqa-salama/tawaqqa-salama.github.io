/** NFPA 20 architecture — fire pump domain. No invented churn/suction/controller thresholds. */

import type { Nfpa20Context, NfpaRuleFinding } from '@/lib/projects/compliance/nfpa/types';
import { evaluateConfiguredOrNeeds } from '@/lib/projects/compliance/nfpa/helpers';

export function evaluateNfpa20(ctx: Nfpa20Context): NfpaRuleFinding[] {
  const edition = ctx.nfpa20_edition;
  const defs = [
    {
      rule_id: 'NFPA20-PUMP-REQUIRED',
      field: 'pump_exists',
      input: ctx.pump_exists,
      label_ar: 'وجود/متطلب مضخة الحريق',
      label_en: 'Fire pump present/required',
    },
    {
      rule_id: 'NFPA20-PUMP-TYPE',
      field: 'pump_type',
      input: ctx.pump_type,
      label_ar: 'نوع المضخة / الشهادة',
      label_en: 'Pump type / listing',
    },
    {
      rule_id: 'NFPA20-RATED-FLOW',
      field: 'rated_flow_lpm',
      input: ctx.rated_flow_lpm,
      unit: 'L/min',
      label_ar: 'التدفق المقنن',
      label_en: 'Rated flow',
    },
    {
      rule_id: 'NFPA20-RATED-PRESSURE',
      field: 'rated_pressure_bar',
      input: ctx.rated_pressure_bar,
      unit: 'bar',
      label_ar: 'الضغط المقنن',
      label_en: 'Rated pressure',
    },
    {
      rule_id: 'NFPA20-SUCTION',
      field: 'suction_condition',
      input: ctx.suction_condition,
      label_ar: 'حالة السحب',
      label_en: 'Suction condition',
    },
    {
      rule_id: 'NFPA20-CHURN',
      field: 'churn_pressure',
      input: ctx.churn_pressure,
      unit: 'bar',
      label_ar: 'ضغط الخمول (churn)',
      label_en: 'Churn pressure',
    },
    {
      rule_id: 'NFPA20-CONTROLLER',
      field: 'controller_documented',
      input: ctx.controller_documented,
      label_ar: 'متطلبات المتحكم',
      label_en: 'Controller requirements',
    },
    {
      rule_id: 'NFPA20-TEST',
      field: 'test_requirements_documented',
      input: ctx.test_requirements_documented,
      label_ar: 'متطلبات الاختبار',
      label_en: 'Test requirements',
    },
  ] as const;

  return defs.map((d) =>
    evaluateConfiguredOrNeeds({
      code: 'NFPA-20',
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
