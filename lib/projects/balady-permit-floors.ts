/**
 * OCR cleanup + Balady "محتويات المبنى / المساحات" table heuristics.
 * Real scanned permits often garble labels (عدد الأدوان) and drop floor names.
 */

import { classifyFloorName, type PermitFloorRow } from '@/lib/projects/permit-floors-activity';
import type { FloorLevelKind } from '@/lib/types/client';

/** Fix common Arabic OCR misreads before field parsing */
export function normalizePermitOcrText(input: string): string {
  return String(input || '')
    .replace(/[\u200e\u200f\u202a-\u202e]/g, '')
    .replace(/\u00a0/g, ' ')
    // عدد الأدوار variants seen on Balady scans
    .replace(/عدد\s*الأدوان/g, 'عدد الأدوار')
    .replace(/عدد\s*الاودار/g, 'عدد الأدوار')
    .replace(/عدد\s*الادوار/g, 'عدد الأدوار')
    .replace(/عدد\s*الأدوارر/g, 'عدد الأدوار')
    // محتويات المبنى
    .replace(/محتويات\s*المينى/g, 'محتويات المبنى')
    .replace(/محتويات\s*المباني/g, 'محتويات المبنى')
    .replace(/إحمالي|احمالي/g, 'إجمالي')
    .replace(/املحق|الملحق/g, 'ملحق')
    .replace(/تجارى/g, 'تجاري')
    .replace(/التهضة|تهضة|نهضه/g, 'النهضة')
    // مساحة الأرض label noise
    .replace(/UI\s*مساحة/g, 'مساحة الار')
    .replace(/مساحة\s*الار(?!\w)/g, 'مساحة الار')
    // decimal comma → dot for area tokens (429,33)
    .replace(/(\d),(\d{2})\b/g, '$1.$2')
    // spaced decimals: 246. 37 → 246.37
    .replace(/(\d+)\.\s+(\d{1,2})\b/g, '$1.$2');
}

const DEFAULT_FLOOR_SEQUENCE: { label: string; kind: FloorLevelKind }[] = [
  { label: 'أرضي', kind: 'ground' },
  { label: 'أول', kind: 'custom' },
  { label: 'ثاني', kind: 'custom' },
  { label: 'ثالث', kind: 'custom' },
  { label: 'رابع', kind: 'custom' },
  { label: 'خامس', kind: 'custom' },
  { label: 'سادس', kind: 'custom' },
];

function parseAreaNumber(raw: string): number | null {
  const cleaned = String(raw)
    .replace(/[^\d.,]/g, '')
    .replace(/,/g, '');
  if (!cleaned) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n < 10 || n > 50_000) return null;
  return Math.round(n * 100) / 100;
}

/**
 * From Balady sparse OCR of the areas table, recover per-floor إجمالي areas
 * when floor names were not recognized.
 */
export function extractBaladyContentsFloorAreas(text: string): number[] {
  const normalized = normalizePermitOcrText(text);
  const blockMatch = normalized.match(
    /المساحات\s*وعدد\s*الوحدات([\s\S]{20,2500}?)(?:المكتب\s*الهند|قيمة\s*رسوم|عدد\s*المواقف|عدد\s*غرف)/u
  );
  const block = blockMatch?.[1] || '';
  if (!block) return [];

  const rawNums = [...block.matchAll(/\b(\d{1,5}(?:\.\d{1,2})?)\b/g)]
    .map((m) => parseAreaNumber(m[1]))
    .filter((n): n is number => n != null && n >= 20 && n <= 20_000);

  // Consecutive duplicates (تجاري ≈ إجمالي) are the strongest floor-total signal
  const paired: number[] = [];
  const singles: number[] = [];
  for (let i = 0; i < rawNums.length; i++) {
    const cur = rawNums[i];
    const next = rawNums[i + 1];
    if (next != null && Math.abs(cur - next) < 0.05) {
      paired.push(cur);
      i += 1;
      continue;
    }
    singles.push(cur);
  }

  // Prefer sizable singles (>= 100) after paired totals — skip tiny column scraps
  const largeSingles = singles.filter((a) => a >= 100);
  const ordered = [...paired, ...largeSingles];

  // Dedupe while preserving order
  const out: number[] = [];
  for (const area of ordered) {
    if (out.some((x) => Math.abs(x - area) < 0.05)) continue;
    out.push(area);
  }
  return out;
}

export function buildFloorsFromAreaList(
  areas: number[],
  floorsCount?: number | null
): PermitFloorRow[] {
  if (!areas.length) return [];
  const count = Math.max(
    1,
    Math.min(
      floorsCount && floorsCount > 0 ? floorsCount : areas.length,
      DEFAULT_FLOOR_SEQUENCE.length,
      areas.length
    )
  );
  const rows: PermitFloorRow[] = [];
  for (let i = 0; i < count; i++) {
    const meta = DEFAULT_FLOOR_SEQUENCE[i] || {
      label: `دور ${i + 1}`,
      kind: 'custom' as FloorLevelKind,
    };
    rows.push({
      label: meta.label,
      kind: meta.kind,
      area_m2: areas[i],
      repeat_count: 1,
    });
  }
  return rows;
}

/** Merge named floor rows with heuristic area rows; named wins. */
export function mergeFloorRows(
  named: PermitFloorRow[],
  heuristic: PermitFloorRow[]
): PermitFloorRow[] {
  if (named.length > 0) return named;
  return heuristic;
}

export function floorsCountFromFuzzyLabel(text: string): number | null {
  const normalized = normalizePermitOcrText(text);
  const matches = [
    ...normalized.matchAll(
      /عدد\s*الأ?[دذ]وا[رن]\s*[:：]?\s*(?:\n+\s*)?(\d{1,2})\b/gu
    ),
    ...normalized.matchAll(/عدد\s*الطوابق\s*[:：]?\s*(?:\n+\s*)?(\d{1,2})\b/gu),
  ];
  for (let i = matches.length - 1; i >= 0; i--) {
    const n = Number(matches[i][1]);
    if (n >= 1 && n <= 60) return n;
  }
  return null;
}

export function landAreaFromLooseBlock(text: string): string | null {
  const normalized = normalizePermitOcrText(text);
  // After street / before الجهة — typical Balady value column ends with land area
  const m =
    normalized.match(
      /اسم\s*الشارع[\s\S]{0,120}?(\d{2,5}(?:\.\d{1,2})?)\s*(?:\n+\s*الجهة|\n+\s*الحدود)/u
    ) ||
    normalized.match(/مساحة\s*الار[ض]?[\s\S]{0,80}?(\d{2,5}(?:\.\d{1,2})?)/u) ||
    normalized.match(/\n(595\.50|\d{3,4}\.\d{2})\s*\n+\s*الجهة/u);
  return m?.[1] || null;
}

/** Ensure classified labels stay consistent when synthesizing rows */
export function ensureFloorRowLabels(rows: PermitFloorRow[]): PermitFloorRow[] {
  return rows.map((row) => {
    const classified = classifyFloorName(row.label);
    if (!classified) return row;
    return { ...row, label: classified.label, kind: classified.kind };
  });
}
