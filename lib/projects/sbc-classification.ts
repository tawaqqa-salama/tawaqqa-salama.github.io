import { ACTIVITY_RULES } from '@/lib/constants/activity-rules';
import {
  RISK_LABEL_AR,
  SBC_OCCUPANCIES,
  type SbcOccupancyCode,
  type SbcRiskLevel,
} from '@/lib/constants/sbc801';
import { defaultZoneUseForActivity, getZoneUse } from '@/lib/constants/zone-uses';
import type {
  TechnicalReport,
  TechnicalReportComponentRow,
  TechnicalReportFloorUse,
  TechnicalReportZone,
} from '@/lib/types/project-reports';
import { ensureFloorLevels, labelForFloorKind } from '@/lib/business/floors';
import type { ClientRecord } from '@/lib/types/client';
import { deriveActivityRequirements } from '@/lib/business/sbc-requirements';

const RISK_RANK: Record<SbcRiskLevel, number> = {
  low: 1,
  moderate: 2,
  high: 3,
  very_high: 4,
};

function newId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

export function createZone(partial?: Partial<TechnicalReportZone>): TechnicalReportZone {
  const use = getZoneUse(partial?.use_code || 'offices');
  const occ = SBC_OCCUPANCIES[use.occupancy];
  return {
    id: partial?.id || newId('zone'),
    use_code: use.id,
    label: partial?.label ?? use.label,
    area_m2: partial?.area_m2 ?? '',
    occupancy_code: use.occupancy,
    group_letter: occ.group_letter,
    risk_level: occ.risk,
    risk_label: RISK_LABEL_AR[occ.risk],
  };
}

export function enrichZone(zone: TechnicalReportZone): TechnicalReportZone {
  const use = getZoneUse(zone.use_code);
  const occ = SBC_OCCUPANCIES[use.occupancy];
  return {
    ...zone,
    use_code: use.id,
    label: zone.label || use.label,
    occupancy_code: use.occupancy,
    group_letter: occ.group_letter,
    risk_level: occ.risk,
    risk_label: RISK_LABEL_AR[occ.risk],
  };
}

export function zonesAreaSum(zones: TechnicalReportZone[]): number {
  return zones.reduce((sum, z) => sum + (Number(z.area_m2) || 0), 0);
}

export function floorAreaBalance(floor: TechnicalReportFloorUse): {
  floorArea: number;
  zonesSum: number;
  diff: number;
  ok: boolean;
} {
  const floorArea = Number(floor.floor_area_m2) || 0;
  const zonesSum = Math.round(zonesAreaSum(floor.zones) * 100) / 100;
  const diff = Math.round((zonesSum - floorArea) * 100) / 100;
  const ok = floorArea <= 0 || Math.abs(diff) < 0.05;
  return { floorArea, zonesSum, diff, ok };
}

export function collectOccupancies(floors: TechnicalReportFloorUse[]): SbcOccupancyCode[] {
  const codes = new Set<SbcOccupancyCode>();
  for (const floor of floors) {
    for (const zone of floor.zones) {
      codes.add((enrichZone(zone).occupancy_code || 'business') as SbcOccupancyCode);
    }
  }
  return [...codes];
}

/** مثل GROUP B,M من مناطق الأدوار */
export function deriveBuildingClassification(floors: TechnicalReportFloorUse[], activityType?: string | null): string {
  const letters = new Set<string>();
  for (const code of collectOccupancies(floors)) {
    letters.add(SBC_OCCUPANCIES[code].group_letter);
  }
  if (letters.size === 0) {
    const rule = ACTIVITY_RULES[activityType || ''];
    if (rule) letters.add(SBC_OCCUPANCIES[rule.occupancy].group_letter);
  }
  if (letters.size === 0) return '';
  return `GROUP ${[...letters].sort().join(',')}`;
}

/** ملخص الخطورة حسب المناطق (مثل: متوسطة في التجاري، منخفضة في المكاتب) */
export function deriveRiskClass(floors: TechnicalReportFloorUse[], activityType?: string | null): string {
  const byRisk = new Map<SbcRiskLevel, Set<string>>();
  let maxRisk: SbcRiskLevel | null = null;

  for (const floor of floors) {
    for (const raw of floor.zones) {
      const zone = enrichZone(raw);
      const risk = (zone.risk_level || 'low') as SbcRiskLevel;
      if (!byRisk.has(risk)) byRisk.set(risk, new Set());
      byRisk.get(risk)!.add(zone.label || getZoneUse(zone.use_code).label);
      if (!maxRisk || RISK_RANK[risk] > RISK_RANK[maxRisk]) maxRisk = risk;
    }
  }

  if (!maxRisk) {
    const derived = deriveActivityRequirements({ activity_type: activityType });
    return derived ? `${derived.riskLabel}ة الخطورة` : '';
  }

  if (byRisk.size === 1) {
    return `مجموعة مشاريع ${RISK_LABEL_AR[maxRisk]}ة الخطورة`;
  }

  const parts = [...byRisk.entries()]
    .sort((a, b) => RISK_RANK[b[0]] - RISK_RANK[a[0]])
    .map(([risk, labels]) => `${RISK_LABEL_AR[risk]}ة في ${[...labels].slice(0, 3).join(' و')}`);
  return parts.join('، ');
}

export type CodeProofCard = {
  id: string;
  title: string;
  subtitle: string;
  rows: { label: string; value: string }[];
  highlight?: string;
  refs: string[];
};

/** بطاقات إثبات من الكود (تصنيف، خطورة، رشاشات…) */
export function buildCodeProofCards(
  report: Pick<TechnicalReport, 'floor_uses' | 'building_classification' | 'risk_class'>,
  client: Pick<ClientRecord, 'activity_type' | 'building_area' | 'floors_count' | 'land_area'>
): CodeProofCard[] {
  const floors = report.floor_uses || [];
  const cards: CodeProofCard[] = [];
  const occupancyCodes = collectOccupancies(floors);
  const fallback = deriveActivityRequirements({
    activity_type: client.activity_type,
    floors_count: client.floors_count,
    building_area: client.building_area,
    land_area: client.land_area,
  });

  const codes = occupancyCodes.length
    ? occupancyCodes
    : fallback
      ? [fallback.occupancy.code]
      : (['business'] as SbcOccupancyCode[]);

  cards.push({
    id: 'occ-class',
    title: 'إثبات تصنيف المبنى (SBC 801 / مجموعات الإشغال)',
    subtitle: report.building_classification || deriveBuildingClassification(floors, client.activity_type),
    rows: codes.map((code) => {
      const occ = SBC_OCCUPANCIES[code];
      return {
        label: `مجموعة ${occ.group_letter} — ${occ.label_ar}`,
        value: `أمثلة: ${occ.examples.slice(0, 3).join('، ')} | خطر: ${RISK_LABEL_AR[occ.risk]}`,
      };
    }),
    highlight: 'التصنيف يُستنتج من استخدامات المناطق داخل الأدوار وفق جداول الإشغال في كود البناء السعودي.',
    refs: codes.flatMap((c) => SBC_OCCUPANCIES[c].sbc_refs).slice(0, 6),
  });

  cards.push({
    id: 'risk-class',
    title: 'إثبات تصنيف الخطورة',
    subtitle: report.risk_class || deriveRiskClass(floors, client.activity_type),
    rows: floors.flatMap((floor) =>
      floor.zones.map((z) => {
        const zone = enrichZone(z);
        return {
          label: `${floor.floor_name} — ${zone.label}`,
          value: `${zone.risk_label} | GROUP ${zone.group_letter} | ${zone.area_m2 || '—'} م²`,
        };
      })
    ),
    highlight: 'يُعتمد أعلى مستوى خطورة مؤثر على أنظمة الحماية، مع توثيق اختلاف المناطق.',
    refs: ['SBC-801-OCC', 'EKB-RISKS'],
  });

  for (const code of codes) {
    const occ = SBC_OCCUPANCIES[code];
    const areaForOcc = floors.reduce(
      (sum, floor) =>
        sum +
        floor.zones
          .filter((z) => enrichZone(z).occupancy_code === code)
          .reduce((s, z) => s + (Number(z.area_m2) || 0), 0),
      0
    );
    const needsSprinkler =
      Boolean(occ.sprinkler_always) ||
      (occ.sprinkler_fire_area_m2 != null &&
        (areaForOcc >= occ.sprinkler_fire_area_m2 ||
          (Number(client.building_area) || 0) >= occ.sprinkler_fire_area_m2));

    if (needsSprinkler || occ.sprinkler_fire_area_m2 || occ.sprinkler_always) {
      cards.push({
        id: `spr-${code}`,
        title: `اشتراط نظام إطفاء بالماء / مرشات — ${occ.label_ar}`,
        subtitle: needsSprinkler ? 'مطلوب وفق الكود' : 'يُراجع عند تجاوز العتبة',
        rows: [
          {
            label: 'رشاشات دائماً',
            value: occ.sprinkler_always ? 'نعم' : 'لا',
          },
          {
            label: 'عتبة قسم الحريق',
            value: occ.sprinkler_fire_area_m2
              ? `${occ.sprinkler_fire_area_m2.toLocaleString('ar-SA')} م²`
              : '—',
          },
          {
            label: 'مساحة هذا الإشغال في المشروع',
            value: `${areaForOcc.toLocaleString('ar-SA')} م²`,
          },
          {
            label: 'النتيجة',
            value: needsSprinkler
              ? 'يلزم نظام إطفاء بالماء (مرشات) لهذا الإشغال/المبنى'
              : 'لم تُستوفَ عتبة الإلزام بعد — يُوثَّق للمراجعة',
          },
        ],
        highlight: needsSprinkler
          ? 'صورة الكود / الجدول أعلاه تُثبت الحاجة لنظام إطفاء بالماء.'
          : undefined,
        refs: ['SBC-801-SPR', ...occ.sbc_refs],
      });
    }

    if (code === 'parking' || code === 'high_hazard' || code === 'special_fuel') {
      cards.push({
        id: `special-${code}`,
        title: `اشتراط خاص — ${occ.label_ar}`,
        subtitle: occ.notes?.[0] || 'متطلبات خاصة من SBC 801',
        rows: (occ.notes || ['راجع متطلبات الإشغال الخاصة']).map((n) => ({
          label: 'ملاحظة الكود',
          value: n,
        })),
        refs: occ.sbc_refs,
      });
    }
  }

  // Occupant load factors proof table from zones
  const loadRows = floors.flatMap((floor) =>
    floor.zones.map((raw) => {
      const zone = enrichZone(raw);
      const use = getZoneUse(zone.use_code);
      const area = Number(zone.area_m2) || 0;
      const factor = use.occupant_load_factor_m2;
      const occupants = factor && area > 0 ? Math.ceil(area / factor) : null;
      return {
        label: `${floor.floor_name} / ${zone.label}`,
        value: factor
          ? `عامل ${factor} م²/شخص → شاغلون تقريبيون: ${occupants}`
          : 'عامل حمل غير محدد لهذه المنطقة',
      };
    })
  );
  if (loadRows.length) {
    cards.push({
      id: 'occupant-load',
      title: 'إثبات عوامل حمل الإشغال (مرجع جداول الكود)',
      subtitle: 'حساب إرشادي للشاغلين من مساحة كل منطقة',
      rows: loadRows,
      highlight: 'يُرفق عادةً مقطع من جدول الشاغلين في الكود كتوثيق بصري.',
      refs: ['SBC-201-1004', 'SBC-801-OCC'],
    });
  }

  return cards;
}

export function floorsFromClient(client: ClientRecord, existing?: TechnicalReportFloorUse[]): TechnicalReportFloorUse[] {
  if (existing && existing.length > 0) {
    return existing.map((floor) => ({
      ...floor,
      zones: (floor.zones || []).map(enrichZone),
    }));
  }

  const levels = ensureFloorLevels(client.floor_levels, client.floors_count, client.building_area);
  const defaultUse = defaultZoneUseForActivity(client.activity_type);

  if (levels.length === 0) {
    return [
      {
        id: newId('floor'),
        floor_name: 'الأرضي',
        floor_area_m2: client.building_area ? String(client.building_area) : '',
        structure: 'خرسانة + بلوك',
        classification: 'TYPE I A',
        zones: [
          createZone({
            use_code: defaultUse,
            area_m2: client.building_area ? String(client.building_area) : '',
          }),
        ],
      },
    ];
  }

  return levels.map((level) => {
    const area = level.area_m2 ? String(level.area_m2) : '';
    const useCode =
      level.kind === 'basement' ? 'parking' : defaultUse;
    return {
      id: level.id || newId('floor'),
      floor_name: level.label || labelForFloorKind(level.kind),
      floor_area_m2: area,
      structure: 'خرسانة + بلوك',
      classification: 'TYPE I A',
      zones: [createZone({ use_code: useCode, area_m2: area })],
    };
  });
}

export function componentsFromFloors(floors: TechnicalReportFloorUse[]): TechnicalReportComponentRow[] {
  return floors.map((floor) => ({
    id: floor.id,
    part_name: floor.floor_name,
    structure: floor.structure || 'خرسانة + بلوك',
    classification: floor.classification || 'TYPE I A',
    area_m2: floor.floor_area_m2 || String(zonesAreaSum(floor.zones) || ''),
  }));
}

export function applyAutoClassification(
  report: TechnicalReport,
  client: Pick<ClientRecord, 'activity_type'>
): TechnicalReport {
  const floors = report.floor_uses || [];
  return {
    ...report,
    building_classification: deriveBuildingClassification(floors, client.activity_type),
    risk_class: deriveRiskClass(floors, client.activity_type),
    components: componentsFromFloors(floors),
    floors_description: floors.map((f) => f.floor_name).join(' + '),
  };
}
