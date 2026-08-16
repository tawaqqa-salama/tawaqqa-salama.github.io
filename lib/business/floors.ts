import type { FloorLevel, FloorLevelKind, FloorUsage } from '@/lib/types/client';
import { FLOOR_KIND_OPTIONS } from '@/lib/constants/clients';

function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `fl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function labelForFloorKind(kind: FloorLevelKind): string {
  return FLOOR_KIND_OPTIONS.find((item) => item.kind === kind)?.label || 'مخصص';
}

function normalizeUsage(raw: unknown, index: number, fallback?: Partial<FloorUsage>): FloorUsage {
  const item = (raw || {}) as Partial<FloorUsage>;
  return {
    id: String(item.id || fallback?.id || `usage-${index}-${newId()}`),
    area_m2: Math.max(0, Number(item.area_m2 ?? fallback?.area_m2) || 0),
    activity_type: item.activity_type ? String(item.activity_type) : fallback?.activity_type || null,
    label: item.label ? String(item.label) : fallback?.label || null,
  };
}

export function normalizeFloorLevels(value: unknown): FloorLevel[] {
  if (!Array.isArray(value)) return [];
  return value.map((raw, index) => {
    const item = raw as Partial<FloorLevel> & { usages?: unknown };
    const kind = (item.kind || 'custom') as FloorLevelKind;
    const repeat = Math.max(1, Math.floor(Number(item.repeat_count) || 1));
    const legacyArea = Math.max(0, Number(item.area_m2) || 0);
    const rawUsages = Array.isArray(item.usages) ? item.usages : [];
    const usages = rawUsages.length
      ? rawUsages.map((usage, usageIndex) => normalizeUsage(usage, usageIndex))
      : [
          normalizeUsage(
            {
              id: `${String(item.id || `floor-${index}`)}-usage-1`,
              area_m2: legacyArea,
              activity_type: item.activity_type,
              label: item.floor_use,
            },
            0
          ),
        ];

    return {
      id: String(item.id || newId()),
      kind,
      label: String(item.label || labelForFloorKind(kind)),
      area_m2: usages.reduce((sum, usage) => sum + usage.area_m2, 0),
      repeat_count: repeat,
      activity_type: item.activity_type ? String(item.activity_type) : null,
      floor_use: item.floor_use ? String(item.floor_use) : null,
      usages,
    } satisfies FloorLevel;
  });
}

export function floorUsageArea(level: FloorLevel): number {
  const usages = Array.isArray(level.usages) && level.usages.length
    ? level.usages
    : [{ area_m2: level.area_m2 }];
  return usages.reduce((sum, usage) => sum + Math.max(0, Number(usage.area_m2) || 0), 0);
}

export function calcFloorsCount(levels: FloorLevel[]): number {
  return levels.reduce((sum, level) => sum + Math.max(1, level.repeat_count || 1), 0);
}

export function calcBuildingArea(levels: FloorLevel[]): number {
  return levels.reduce(
    (sum, level) => sum + floorUsageArea(level) * Math.max(1, level.repeat_count || 1),
    0
  );
}

/** يولّد أرضي + متكرر عند الحاجة من إجمالي الأدوار والمساحة */
export function buildDefaultFloorLevels(
  floorsCount: number,
  buildingArea?: number | null
): FloorLevel[] {
  const count = Math.max(0, Math.floor(floorsCount || 0));
  if (count <= 0) return [];

  const totalArea = Math.max(0, Number(buildingArea) || 0);
  const perFloor = count > 0 && totalArea > 0 ? Math.round((totalArea / count) * 100) / 100 : 0;

  if (count === 1) {
    return [
      {
        id: newId(),
        kind: 'ground',
        label: 'أرضي',
        area_m2: perFloor,
        repeat_count: 1,
        usages: [{ id: newId(), area_m2: perFloor, activity_type: null, label: null }],
      },
    ];
  }

  const typicalCount = count - 1;
  return [
    {
      id: newId(),
      kind: 'ground',
      label: 'أرضي',
      area_m2: perFloor,
      repeat_count: 1,
      usages: [{ id: newId(), area_m2: perFloor, activity_type: null, label: null }],
    },
    {
      id: newId(),
      kind: 'typical',
      label: 'متكرر',
      area_m2: perFloor,
      repeat_count: typicalCount,
      usages: [{ id: newId(), area_m2: perFloor, activity_type: null, label: null }],
    },
  ];
}

export function ensureFloorLevels(
  levels: FloorLevel[] | null | undefined,
  floorsCount?: number | null,
  buildingArea?: number | null
): FloorLevel[] {
  const normalized = normalizeFloorLevels(levels);
  if (normalized.length > 0) return normalized;
  if (floorsCount && floorsCount > 0) {
    return buildDefaultFloorLevels(floorsCount, buildingArea);
  }
  return [];
}

export function createEmptyFloorUsage(): FloorUsage {
  return { id: newId(), area_m2: 0, activity_type: null, label: null };
}

export function createEmptyFloorLevel(kind: FloorLevelKind = 'ground'): FloorLevel {
  const usage = createEmptyFloorUsage();
  return {
    id: newId(),
    kind,
    label: labelForFloorKind(kind),
    area_m2: 0,
    repeat_count: kind === 'typical' ? 2 : 1,
    usages: [usage],
  };
}
