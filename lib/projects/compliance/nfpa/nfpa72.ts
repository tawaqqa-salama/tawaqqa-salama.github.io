/** NFPA 72 architecture — fire alarm domain. No invented spacing/device counts. */

import type { Nfpa72Context, NfpaRuleFinding } from '@/lib/projects/compliance/nfpa/types';
import { evaluateConfiguredOrNeeds } from '@/lib/projects/compliance/nfpa/helpers';

export function evaluateNfpa72(ctx: Nfpa72Context): NfpaRuleFinding[] {
  const edition = ctx.nfpa72_edition;
  const defs = [
    {
      rule_id: 'NFPA72-SYSTEM-CATEGORY',
      field: 'alarm_provided',
      input: ctx.alarm_provided,
      label_ar: 'فئة/وجود نظام الإنذار',
      label_en: 'Fire alarm system category/presence',
    },
    {
      rule_id: 'NFPA72-INITIATING',
      field: 'initiating_devices',
      input: ctx.initiating_devices,
      label_ar: 'أجهزة البدء',
      label_en: 'Initiating devices',
    },
    {
      rule_id: 'NFPA72-NOTIFICATION',
      field: 'notification_appliances',
      input: ctx.notification_appliances,
      label_ar: 'أجهزة الإشعار',
      label_en: 'Notification appliances',
    },
    {
      rule_id: 'NFPA72-PANEL',
      field: 'control_panel',
      input: ctx.control_panel,
      label_ar: 'لوحة التحكم',
      label_en: 'Control panel',
    },
    {
      rule_id: 'NFPA72-SUPERVISION',
      field: 'supervision_documented',
      input: ctx.supervision_documented,
      label_ar: 'الإشراف',
      label_en: 'Supervision',
    },
    {
      rule_id: 'NFPA72-MONITORING',
      field: 'monitoring_documented',
      input: ctx.monitoring_documented,
      label_ar: 'المراقبة',
      label_en: 'Monitoring',
    },
    {
      rule_id: 'NFPA72-POWER',
      field: 'emergency_power',
      input: ctx.emergency_power,
      label_ar: 'متطلبات الطاقة',
      label_en: 'Power requirements',
    },
    {
      rule_id: 'NFPA72-INTERFACES',
      field: 'interfaces',
      input: ctx.interfaces,
      label_ar: 'الواجهات',
      label_en: 'Interfaces',
    },
  ] as const;

  return defs.map((d) =>
    evaluateConfiguredOrNeeds({
      code: 'NFPA-72',
      rule_id: d.rule_id,
      field: d.field,
      input: d.input,
      edition,
      label_ar: d.label_ar,
      label_en: d.label_en,
    })
  );
}
