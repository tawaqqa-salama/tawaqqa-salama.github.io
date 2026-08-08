/**
 * Map engineering calculation kinds → the fire-protection system whose
 * standards apply. Prevents every calc card from showing the same project-wide
 * code dump.
 */

import type { EngineeringCalcKind, FireSystemKind } from '@/lib/projects/design-center/types';

export type CalcSystemBinding = {
  system: FireSystemKind;
  /** Force fire-pump context when resolving (e.g. pump calc) */
  forceFirePump?: boolean;
  /** Force standpipe context when resolving */
  forceStandpipe?: boolean;
  query_ar: string;
};

export const CALC_SYSTEM_BINDING: Record<EngineeringCalcKind, CalcSystemBinding> = {
  hydraulic: {
    system: 'sprinkler',
    query_ar: 'الحسابات الهيدروليكية للمرشات NFPA-13',
  },
  pipe_sizing: {
    system: 'sprinkler',
    forceStandpipe: true,
    query_ar: 'أقطار أنابيب الإطفاء NFPA-13 NFPA-14',
  },
  water_demand: {
    system: 'sprinkler',
    query_ar: 'طلب المياه لأنظمة المرشات NFPA-13',
  },
  pressure_loss: {
    system: 'sprinkler',
    query_ar: 'فاقد الضغط في شبكات الإطفاء NFPA-13',
  },
  tank_size: {
    system: 'sprinkler',
    forceFirePump: true,
    query_ar: 'خزانات مياه الإطفاء NFPA-20 SBC-801',
  },
  pump: {
    system: 'sprinkler',
    forceFirePump: true,
    query_ar: 'مضخات الإطفاء NFPA-20',
  },
  battery: {
    system: 'fire_alarm',
    query_ar: 'بطاريات أنظمة الإنذار NFPA-72 مدة الاحتياطي',
  },
  voltage_drop: {
    system: 'fire_alarm',
    query_ar: 'هبوط الجهد دوائر الإنذار NFPA-72',
  },
};

export function bindingForCalc(kind: EngineeringCalcKind): CalcSystemBinding {
  return CALC_SYSTEM_BINDING[kind];
}
