import type { FloorLevel, FloorLevelKind } from '@/lib/types/client';
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

export function normalizeFloorLevels(value: unknown): FloorLevel[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((raw) => {
      const item = raw as Partial<FloorLevel>;
      const kind = (item.kind || 'custom') as FloorLevelKind;
      const repeat = Math.max(1, Math.floor(Number(item.repeat_count) || 1));
      const area = Math.max(0, Number(item.area_m2) || 0);
      return {
        id: String(item.id || newId()),
        kind,
        label: String(item.label || labelForFloorKind(kind)),
        area_m2: area,
        repeat_count: kind === 'typical' ? repeat : Math.max(1, repeat),
        activity_type: item.activity_type ? String(item.activity_type) : null,
        floor_use: item.floor_use ? String(item.floor_use) : null,
      } satisfies FloorLevel;
    })
    .filter(Boolean);
}

export function calcFloorsCount(levels: FloorLevel[]): number {
  return levels.reduce((sum, level) => sum + Math.max(1, level.repeat_count || 1), 0);
}

export function calcBuildingArea(levels: FloorLevel[]): number {
  return levels.reduce(
    (sum, level) => sum + Math.max(0, level.area_m2 || 0) * Math.max(1, level.repeat_count || 1),
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
    },
    {
      id: newId(),
      kind: 'typical',
      label: 'متكرر',
      area_m2: perFloor,
      repeat_count: typicalCount,
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

export function createEmptyFloorLevel(kind: FloorLevelKind = 'ground'): FloorLevel {
  return {
    id: newId(),
    kind,
    label: labelForFloorKind(kind),
    area_m2: 0,
    repeat_count: kind === 'typical' ? 2 : 1,
  };
}
