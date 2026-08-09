/**
 * Map Balady permit usage text → ERP activity_type,
 * and build floor_levels from OCR floor rows / totals.
 */

import { ACTIVITY_RULES } from '@/lib/constants/clients';
import { buildDefaultFloorLevels, labelForFloorKind } from '@/lib/business/floors';
import type { FloorLevel, FloorLevelKind } from '@/lib/types/client';

export type PermitFloorRow = {
  label: string;
  kind: FloorLevelKind;
  area_m2: number;
  repeat_count: number;
};

const USAGE_ACTIVITY_PATTERNS: { re: RegExp; activity: string }[] = [
  { re: /محطة\s*وقود|وقود/, activity: 'gas_station' },
  { re: /مطعم|مقهى|كافيه|مطبخ/, activity: 'restaurant' },
  { re: /مستودع|مخزن|تخزين/, activity: 'warehouse' },
  { re: /مصنع|صناع[يى]|ورش[ةه]?/, activity: 'factory' },
  // Serviced apartments / hospitality before generic "شقق" and before "مكتب هندسي" noise
  { re: /شقق\s*مخدوم|شقق\s*مفروطة|فندق|إيواء|ايواء/, activity: 'hotel' },
  { re: /سكن[يى]|عمائر|شقق|فيلا/, activity: 'residential_building' },
  { re: /مكتب|إدار[يى]|ادار[يى]/, activity: 'office' },
  { re: /مدرس[ةه]|تعليم|جامع[ةه]|روضة/, activity: 'school' },
  { re: /مواقف|موقف\s*سيارات/, activity: 'parking' },
  { re: /مجمع\s*تجار|مول|سوق|تجار[يى]ة?|تجارى/, activity: 'commercial_complex' },
];

export function mapPermitUsageToActivityType(
  usageLabel: string | null | undefined,
  fallbackText?: string | null
): string | null {
  const tryMatch = (blob: string): string | null => {
    if (!blob.trim()) return null;
    // Never treat engineering-office mentions alone as the activity
    const cleaned = blob
      .replace(/المكتب\s*(?:الهندسي|المشرف)[^\n]*/gu, ' ')
      .replace(/مكتب\s+[^\n]*هندس[^\n]*/gu, ' ');
    for (const { re, activity } of USAGE_ACTIVITY_PATTERNS) {
      if (re.test(cleaned) && ACTIVITY_RULES[activity]) return activity;
    }
    return null;
  };

  // Prefer explicit usage/title line over full OCR (avoids "مكتب هندسي" false positives)
  const fromUsage = tryMatch(String(usageLabel || ''));
  if (fromUsage) return fromUsage;

  const titled =
    String(fallbackText || '').match(
      /رخصة\s*بناء\s*شقق\s*\S*|رخصة\s*بناء\s*مبنى\s*\S+|إصدار\s*رخصة\s*بناء\s*\S+/u
    )?.[0] || '';
  const fromTitle = tryMatch(titled);
  if (fromTitle) return fromTitle;

  // Do not scan the entire OCR blob for "مكتب" — too many false positives
  return null;
}

export function activityLabelForType(activityType: string | null | undefined): string {
  if (!activityType) return '';
  return ACTIVITY_RULES[activityType]?.label || activityType;
}

const FLOOR_NAME_PATTERNS: { re: RegExp; kind: FloorLevelKind; label: string }[] = [
  { re: /بدروم|قبو|سرداب/, kind: 'basement', label: 'بدروم' },
  { re: /أرض[يى]|ارضي|الدور\s*الأرض[يى]/, kind: 'ground', label: 'أرضي' },
  { re: /روف|سطح|ملحق\s*سطح|دور\s*الروف/, kind: 'roof', label: 'دور الروف' },
  { re: /متكرر/, kind: 'typical', label: 'متكرر' },
  { re: /الأول|الاول|أول|اول/, kind: 'custom', label: 'أول' },
  { re: /الثاني|الثانى|ثاني/, kind: 'custom', label: 'ثاني' },
  { re: /الثالث|ثالث/, kind: 'custom', label: 'ثالث' },
  { re: /الرابع|رابع/, kind: 'custom', label: 'رابع' },
  { re: /الخامس|خامس/, kind: 'custom', label: 'خامس' },
  { re: /السادس|سادس/, kind: 'custom', label: 'سادس' },
  { re: /السابع|سابع/, kind: 'custom', label: 'سابع' },
  { re: /الثامن|ثامن/, kind: 'custom', label: 'ثامن' },
  { re: /التاسع|تاسع/, kind: 'custom', label: 'تاسع' },
  { re: /العاشر|عاشر/, kind: 'custom', label: 'عاشر' },
];

export function classifyFloorName(raw: string): { kind: FloorLevelKind; label: string } | null {
  const text = String(raw || '')
    .replace(/[\u200e\u200f\u202a-\u202e]/g, '')
    .replace(/\d+(?:[.,]\d+)?/g, ' ')
    .replace(/م²|م2|متر|المربع|الدور/gi, ' ')
    .replace(/[:：\-|/]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return null;
  for (const row of FLOOR_NAME_PATTERNS) {
    if (row.re.test(text)) return { kind: row.kind, label: row.label };
  }
  // Reject noisy OCR lines; only short pure Arabic labels
  if (/^[\u0600-\u06FF][\u0600-\u06FF\s]{0,14}$/.test(text) && text.length <= 14) {
    return { kind: 'custom', label: text };
  }
  return null;
}

function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `fl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function permitFloorsToFloorLevels(rows: PermitFloorRow[]): FloorLevel[] {
  return rows
    .filter((r) => r.area_m2 > 0 || r.label)
    .map((r) => ({
      id: newId(),
      kind: r.kind,
      label: r.label || labelForFloorKind(r.kind),
      area_m2: Math.max(0, Number(r.area_m2) || 0),
      repeat_count: Math.max(1, Math.floor(Number(r.repeat_count) || 1)),
    }));
}

/** Prefer explicit floor rows; else synthesize from count + total area. */
export function resolveFloorLevelsFromPermit(input: {
  floors?: PermitFloorRow[] | null;
  floorsCount?: number | null;
  buildingAreaM2?: number | null;
}): FloorLevel[] {
  const count = Math.max(0, Math.floor(Number(input.floorsCount) || 0));
  let explicit = permitFloorsToFloorLevels(input.floors || []);
  if (count > 0 && explicit.length > count) {
    explicit = explicit.slice(0, count);
  }
  if (explicit.length > 0) return explicit;

  const area = Math.max(0, Number(input.buildingAreaM2) || 0);
  if (count > 0) return buildDefaultFloorLevels(count, area || null);
  if (area > 0) return buildDefaultFloorLevels(1, area);
  return [];
}
