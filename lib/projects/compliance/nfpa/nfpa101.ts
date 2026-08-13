/**
 * NFPA 101 architecture — means of egress.
 *
 * Does NOT create a competing egress engine.
 * Consumes the SAME canonical egress measurements as SBC 201
 * (resolved.egress VALID-only). Separate rule findings; one authority.
 *
 * Soft lib/compliance 61/76 m and vision 45/60 m are ADVISORY — never used here.
 */

import type { Nfpa101Context, NfpaRuleFinding } from '@/lib/projects/compliance/nfpa/types';
import { evaluateConfiguredOrNeeds } from '@/lib/projects/compliance/nfpa/helpers';

export function evaluateNfpa101(ctx: Nfpa101Context): NfpaRuleFinding[] {
  const edition = ctx.nfpa101_edition;
  const defs = [
    {
      rule_id: 'NFPA101-TRAVEL-DISTANCE',
      field: 'travel_distance_m',
      input: ctx.travel_distance_m,
      unit: 'm',
      label_ar: 'مسافة السفر (NFPA 101) — نفس القيمة الكانونية لـ SBC 201',
      label_en: 'Travel distance (NFPA 101) — same canonical value as SBC 201',
    },
    {
      rule_id: 'NFPA101-COMMON-PATH',
      field: 'common_path_m',
      input: ctx.common_path_m,
      unit: 'm',
      label_ar: 'المسار المشترك',
      label_en: 'Common path',
    },
    {
      rule_id: 'NFPA101-DEAD-END',
      field: 'dead_end_m',
      input: ctx.dead_end_m,
      unit: 'm',
      label_ar: 'طريق مسدود',
      label_en: 'Dead end',
    },
    {
      rule_id: 'NFPA101-EXIT-COUNT',
      field: 'exits_count',
      input: ctx.exits_count,
      label_ar: 'عدد المخارج',
      label_en: 'Exit count',
    },
    {
      rule_id: 'NFPA101-CORRIDOR-WIDTH',
      field: 'corridor_width_m',
      input: ctx.corridor_width_m,
      unit: 'm',
      label_ar: 'عرض الممر',
      label_en: 'Corridor width',
    },
    {
      rule_id: 'NFPA101-DOOR-WIDTH',
      field: 'door_width_m',
      input: ctx.door_width_m,
      unit: 'm',
      label_ar: 'عرض الباب',
      label_en: 'Door width',
    },
    {
      rule_id: 'NFPA101-STAIR-WIDTH',
      field: 'stair_width_m',
      input: ctx.stair_width_m,
      unit: 'm',
      label_ar: 'عرض الدرج',
      label_en: 'Stair width',
    },
    {
      rule_id: 'NFPA101-OCCUPANT-LOAD',
      field: 'occupant_load',
      input: ctx.occupant_load,
      label_ar: 'حمل الشاغلين',
      label_en: 'Occupant load',
    },
  ] as const;

  return defs.map((d) =>
    evaluateConfiguredOrNeeds({
      code: 'NFPA-101',
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
