import { ACTIVITY_RULES } from '@/lib/constants/activity-rules';
import {
  RISK_LABEL_AR,
  SBC_OCCUPANCIES,
  type SbcOccupancyCode,
  type SbcRiskLevel,
} from '@/lib/constants/sbc801';
import {
  defaultZoneUseForActivity,
  getSuppression,
  getZoneSubtype,
  getZoneUse,
  zoneOptionChoices,
} from '@/lib/constants/zone-uses';
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
  const subtype = getZoneSubtype(use.id, partial?.subtype_code || use.subtypes[0]?.id);
  const occupancyCode = (subtype?.occupancy || use.occupancy) as SbcOccupancyCode;
  const occ = SBC_OCCUPANCIES[occupancyCode];
  const risk = (subtype?.risk || occ.risk) as SbcRiskLevel;
  const suppressionId = partial?.suppression_code || subtype?.default_suppression || use.default_suppression;
  const suppression = getSuppression(suppressionId);
  const label =
    partial?.label ||
    (subtype ? `${use.label} — ${subtype.label}` : use.label);

  return {
    id: partial?.id || newId('zone'),
    use_code: use.id,
    label,
    area_m2: partial?.area_m2 ?? '',
    subtype_code: subtype?.id,
    subtype_label: subtype?.label,
    suppression_code: suppression.id,
    suppression_label: suppression.label,
    selected_options: partial?.selected_options || [],
    code_proof_photo: partial?.code_proof_photo ?? null,
    occupancy_code: occupancyCode,
    group_letter: occ.group_letter,
    risk_level: risk,
    risk_label: RISK_LABEL_AR[risk],
  };
}

export function enrichZone(zone: TechnicalReportZone, opts?: { keepSuppression?: boolean }): TechnicalReportZone {
  const use = getZoneUse(zone.use_code);
  const subtype = getZoneSubtype(use.id, zone.subtype_code || use.subtypes[0]?.id);
  const occupancyCode = (subtype?.occupancy || use.occupancy) as SbcOccupancyCode;
  const occ = SBC_OCCUPANCIES[occupancyCode];
  const risk = (subtype?.risk || occ.risk) as SbcRiskLevel;
  const autoSuppressionId = subtype?.default_suppression || use.default_suppression;
  const suppressionId = opts?.keepSuppression && zone.suppression_code ? zone.suppression_code : autoSuppressionId;
  const suppression = getSuppression(suppressionId);

  return {
    ...zone,
    use_code: use.id,
    label: zone.label || (subtype ? `${use.label} — ${subtype.label}` : use.label),
    subtype_code: subtype?.id,
    subtype_label: subtype?.label,
    suppression_code: suppression.id,
    suppression_label: suppression.label,
    selected_options: zone.selected_options || [],
    occupancy_code: occupancyCode,
    group_letter: occ.group_letter,
    risk_level: risk,
    risk_label: RISK_LABEL_AR[risk],
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
      codes.add((enrichZone(zone, { keepSuppression: true }).occupancy_code || 'business') as SbcOccupancyCode);
    }
  }
  return [...codes];
}

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

export function deriveRiskClass(floors: TechnicalReportFloorUse[], activityType?: string | null): string {
  const byRisk = new Map<SbcRiskLevel, Set<string>>();
  let maxRisk: SbcRiskLevel | null = null;

  for (const floor of floors) {
    for (const raw of floor.zones) {
      const zone = enrichZone(raw, { keepSuppression: true });
      const risk = (zone.risk_level || 'low') as SbcRiskLevel;
      if (!byRisk.has(risk)) byRisk.set(risk, new Set());
      byRisk.get(risk)!.add(zone.subtype_label || zone.label || getZoneUse(zone.use_code).label);
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

export type ZoneSystemNeed = {
  floor_name: string;
  zone_label: string;
  subtype_label?: string;
  area_m2: string;
  group_letter?: string;
  risk_label?: string;
  suppression_code: string;
  suppression_label: string;
  is_special: boolean;
  selected_options: string[];
  occupancy_code?: string;
};

/** خطة أنظمة الإطفاء المدمجة من كل منطقة وكل دور */
export function buildZoneSystemNeeds(floors: TechnicalReportFloorUse[]): ZoneSystemNeed[] {
  return floors.flatMap((floor) =>
    floor.zones.map((raw) => {
      const zone = enrichZone(raw, { keepSuppression: true });
      const suppression = getSuppression(zone.suppression_code);
      return {
        floor_name: floor.floor_name,
        zone_label: zone.label,
        subtype_label: zone.subtype_label,
        area_m2: zone.area_m2,
        group_letter: zone.group_letter,
        risk_label: zone.risk_label,
        suppression_code: suppression.id,
        suppression_label: suppression.label,
        is_special: suppression.is_special,
        selected_options: zone.selected_options || [],
        occupancy_code: zone.occupancy_code,
      };
    })
  );
}

export function buildIntegratedFireNarrative(_floors: TechnicalReportFloorUse[]): string {
  // أوقف السرد الطويل المكرر — العرض يتم عبر الجداول والنقاط فقط
  return '';
}

function stripAutoMergedNotes(notes: string | null | undefined): string {
  return String(notes || '')
    .replace(/<<مدمج-من-المناطق>>[\s\S]*?(?=\n\n<<|$)/g, '')
    .replace(/بالنسبة لبند[\s\S]*?(?=\n\n|$)/g, '')
    .replace(/ملخص أنظمة الإطفاء حسب الأدوار والمناطق[\s\S]*?(?=\n\n|$)/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** يزامن احتياجات المناطق كخيارات قصيرة فقط — بدون سرد مكرر داخل الملاحظات */
export function syncFirefightingFromZones(report: TechnicalReport): TechnicalReport {
  const floors = report.floor_uses || [];
  const needs = buildZoneSystemNeeds(floors);
  if (!needs.length) {
    return {
      ...report,
      firefighting_items: report.firefighting_items.map((item) => ({
        ...item,
        notes: stripAutoMergedNotes(item.notes),
      })),
    };
  }

  const specialLines = needs
    .filter((n) => n.is_special)
    .map((n) => `${n.suppression_label} — ${n.floor_name} / ${n.zone_label}`);
  const sprinklerZones = needs.filter(
    (n) => !n.is_special || n.suppression_code === 'esfr' || n.suppression_code === 'wet_sprinkler'
  );

  const firefighting_items = report.firefighting_items.map((item) => {
    const cleanedNotes = stripAutoMergedNotes(item.notes);

    if (item.id === 'ff_special') {
      const options = [...item.selectedOptions];
      for (const line of specialLines) {
        if (!options.includes(line)) options.push(line);
      }
      if (
        specialLines.length &&
        !options.includes('تنفيذ أنظمة الإطفاء الخاصة وفق المناطق المحددة في التقرير')
      ) {
        options.push('تنفيذ أنظمة الإطفاء الخاصة وفق المناطق المحددة في التقرير');
      }
      return { ...item, enabled: true, selectedOptions: options, notes: cleanedNotes };
    }

    if (item.id === 'ff_piping') {
      const options = [...item.selectedOptions];
      const autoOpts = [
        'تركيب مرشات حريق (Sprinklers) في الفراغات المطلوبة',
        'تنفيذ شبكة أنابيب حسب التصاميم الهيدروليكية',
      ];
      if (sprinklerZones.length) {
        for (const opt of autoOpts) {
          if (!options.includes(opt)) options.push(opt);
        }
      }
      return { ...item, enabled: true, selectedOptions: options, notes: cleanedNotes };
    }

    return { ...item, notes: cleanedNotes };
  });

  return { ...report, firefighting_items };
}

export type OccupantEgressRow = {
  floor_name: string;
  zone_label: string;
  occupancy_label: string;
  area_m2: number;
  factor: number | null;
  occupants: number | null;
  required_exits: number | null;
};

/** جدول حصر الشاغلين والأبواب المطلوبة حسب الدور والإشغال */
export function buildOccupantEgressRows(floors: TechnicalReportFloorUse[]): OccupantEgressRow[] {
  return floors.flatMap((floor) =>
    floor.zones.map((raw) => {
      const zone = enrichZone(raw, { keepSuppression: true });
      const use = getZoneUse(zone.use_code);
      const occ = zone.occupancy_code ? SBC_OCCUPANCIES[zone.occupancy_code as SbcOccupancyCode] : null;
      const area = Number(zone.area_m2) || 0;
      const factor = use.occupant_load_factor_m2 ?? null;
      const occupants = factor && area > 0 ? Math.ceil(area / factor) : null;
      let required_exits: number | null = null;
      if (occupants != null) {
        if (occupants <= 49) required_exits = 1;
        else if (occupants <= 500) required_exits = 2;
        else required_exits = Math.max(3, Math.ceil(occupants / 500) + 1);
      }
      return {
        floor_name: floor.floor_name,
        zone_label: zone.subtype_label ? `${zone.label}` : zone.label,
        occupancy_label: occ ? `GROUP ${occ.group_letter} — ${occ.label_ar}` : zone.group_letter || '—',
        area_m2: area,
        factor,
        occupants,
        required_exits,
      };
    })
  );
}

export type CodeProofCard = {
  id: string;
  title: string;
  subtitle: string;
  rows: { label: string; value: string }[];
  highlight?: string;
  refs: string[];
};

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
    highlight: 'أرفق صورة مقصوصة حقيقية من جدول الإشغال في الكود أسفل هذا الإثبات.',
    refs: codes.flatMap((c) => SBC_OCCUPANCIES[c].sbc_refs).slice(0, 6),
  });

  cards.push({
    id: 'risk-class',
    title: 'إثبات تصنيف الخطورة',
    subtitle: report.risk_class || deriveRiskClass(floors, client.activity_type),
    rows: floors.flatMap((floor) =>
      floor.zones.map((z) => {
        const zone = enrichZone(z, { keepSuppression: true });
        return {
          label: `${floor.floor_name} — ${zone.label}`,
          value: `${zone.risk_label} | GROUP ${zone.group_letter} | ${zone.suppression_label || '—'} | ${zone.area_m2 || '—'} م²`,
        };
      })
    ),
    highlight: 'أرفق صورة من الكود تدعم مستوى الخطورة المعتمد.',
    refs: ['SBC-801-OCC', 'EKB-RISKS'],
  });

  for (const code of codes) {
    const occ = SBC_OCCUPANCIES[code];
    const areaForOcc = floors.reduce(
      (sum, floor) =>
        sum +
        floor.zones
          .filter((z) => enrichZone(z, { keepSuppression: true }).occupancy_code === code)
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
          { label: 'رشاشات دائماً', value: occ.sprinkler_always ? 'نعم' : 'لا' },
          {
            label: 'عتبة قسم الحريق',
            value: occ.sprinkler_fire_area_m2 ? `${occ.sprinkler_fire_area_m2.toLocaleString('ar-SA')} م²` : '—',
          },
          { label: 'مساحة هذا الإشغال في المشروع', value: `${areaForOcc.toLocaleString('ar-SA')} م²` },
          {
            label: 'النتيجة',
            value: needsSprinkler
              ? 'يلزم نظام إطفاء بالماء (مرشات) لهذا الإشغال/المبنى'
              : 'لم تُستوفَ عتبة الإلزام بعد — يُوثَّق للمراجعة',
          },
        ],
        highlight: 'أرفق صورة مقصوصة من جدول/بند المرشات في SBC 801.',
        refs: ['SBC-801-SPR', ...occ.sbc_refs],
      });
    }
  }

  const suppressionGroups = new Map<string, ZoneSystemNeed[]>();
  for (const need of buildZoneSystemNeeds(floors)) {
    if (!suppressionGroups.has(need.suppression_code)) suppressionGroups.set(need.suppression_code, []);
    suppressionGroups.get(need.suppression_code)!.push(need);
  }
  for (const [code, group] of suppressionGroups) {
    const suppression = getSuppression(code);
    cards.push({
      id: `sup-${code}`,
      title: `إثبات نظام الإطفاء — ${suppression.short}`,
      subtitle: suppression.label,
      rows: group.map((n) => ({
        label: `${n.floor_name} / ${n.zone_label}`,
        value: `${n.subtype_label || '—'} · ${n.area_m2 || '—'} م² · ${n.risk_label || ''}`,
      })),
      highlight: 'أرفق صورة من الكود/المرجع المعتمد لنوع نظام الإطفاء المحدد.',
      refs: ['SBC-801-SPR', 'EKB-SUPPRESSION'],
    });
  }

  const loadRows = floors.flatMap((floor) =>
    floor.zones.map((raw) => {
      const zone = enrichZone(raw, { keepSuppression: true });
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
      highlight: 'أرفق صورة مقصوصة من جدول الشاغلين في الكود.',
      refs: ['SBC-201-1004', 'SBC-801-OCC'],
    });
  }

  return cards;
}

export function floorsFromClient(client: ClientRecord, existing?: TechnicalReportFloorUse[]): TechnicalReportFloorUse[] {
  if (existing && existing.length > 0) {
    return existing.map((floor) => ({
      ...floor,
      zones: (floor.zones || []).map((z) => enrichZone(z, { keepSuppression: true })),
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
    const useCode = level.kind === 'basement' ? 'parking' : defaultUse;
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
  const floors = (report.floor_uses || []).map((floor) => ({
    ...floor,
    zones: floor.zones.map((z) => enrichZone(z, { keepSuppression: true })),
  }));
  const classified: TechnicalReport = {
    ...report,
    floor_uses: floors,
    building_classification: deriveBuildingClassification(floors, client.activity_type),
    risk_class: deriveRiskClass(floors, client.activity_type),
    components: componentsFromFloors(floors),
    floors_description: floors.map((f) => f.floor_name).join(' + '),
  };
  return syncFirefightingFromZones(classified);
}

export { zoneOptionChoices };
