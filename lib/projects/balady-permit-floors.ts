/**
 * OCR cleanup + Balady "محتويات المبنى / المساحات" table heuristics.
 * Real scanned permits often garble labels (عدد الأدوان) and drop floor names.
 *
 * Critical: never invent more floors than «عدد الأدوار», and never treat
 * GPS/coordinate fragments (e.g. 2391979.9527 → 9527) as floor areas.
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
  { label: 'سابع', kind: 'custom' },
  { label: 'ثامن', kind: 'custom' },
  { label: 'تاسع', kind: 'custom' },
  { label: 'عاشر', kind: 'custom' },
];

/** Plausible single-floor built area on typical Balady commercial permits (م²) */
const MIN_FLOOR_AREA = 30;
const MAX_FLOOR_AREA = 5_000;

function parseAreaNumber(raw: string): number | null {
  const cleaned = String(raw)
    .replace(/[^\d.,]/g, '')
    .replace(/,/g, '');
  if (!cleaned) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n < MIN_FLOOR_AREA || n > MAX_FLOOR_AREA) return null;
  return Math.round(n * 100) / 100;
}

/**
 * Extract area-like numbers from a table block without pulling decimal
 * fragments out of GPS coordinates (2391979.9527 → must NOT yield 9527).
 */
export function extractPlausibleAreaTokens(block: string): number[] {
  const normalized = normalizePermitOcrText(block);
  // Match standalone measures: not preceded by digit or '.', not part of 6+ digit IDs
  const matches = [
    ...normalized.matchAll(/(?<![\d.])(\d{2,4}(?:\.\d{1,2})?)(?![\d.])/g),
  ];
  const out: number[] = [];
  for (const m of matches) {
    const n = parseAreaNumber(m[1]);
    if (n == null) continue;
    out.push(n);
  }
  return out;
}

function dedupeConsecutive(areas: number[]): { paired: number[]; singles: number[] } {
  const paired: number[] = [];
  const singles: number[] = [];
  for (let i = 0; i < areas.length; i++) {
    const cur = areas[i];
    const next = areas[i + 1];
    if (next != null && Math.abs(cur - next) < 0.05) {
      paired.push(cur);
      i += 1;
      continue;
    }
    singles.push(cur);
  }
  return { paired, singles };
}

function dedupePreserveOrder(areas: number[]): number[] {
  const out: number[] = [];
  for (const area of areas) {
    if (out.some((x) => Math.abs(x - area) < 0.05)) continue;
    out.push(area);
  }
  return out;
}

/** Drop extreme outliers vs the median (e.g. coordinate scraps). */
export function filterAreaOutliers(areas: number[]): number[] {
  if (areas.length <= 1) return areas;
  const sorted = [...areas].sort((a, b) => a - b);
  const mid = sorted[Math.floor(sorted.length / 2)];
  if (mid <= 0) return areas;
  return areas.filter((a) => a <= mid * 6 && a >= mid / 8);
}

/**
 * From Balady sparse OCR of the areas table, recover per-floor إجمالي areas
 * when floor names were not recognized.
 *
 * When `floorsCount` is known, returns at most that many high-confidence areas.
 * When unknown, returns ONLY paired duplicates (تجاري≈إجمالي) — never invents
 * a long list of scrap column numbers.
 */
export function extractBaladyContentsFloorAreas(
  text: string,
  floorsCount?: number | null
): number[] {
  const normalized = normalizePermitOcrText(text);
  const blockMatch = normalized.match(
    /المساحات\s*وعدد\s*الوحدات([\s\S]{20,2500}?)(?:المكتب\s*الهند|قيمة\s*رسوم|عدد\s*المواقف|عدد\s*غرف)/u
  );
  const block = blockMatch?.[1] || '';
  if (!block) return [];

  const rawNums = extractPlausibleAreaTokens(block);
  const { paired, singles } = dedupeConsecutive(rawNums);
  const largeSingles = singles.filter((a) => a >= 80);

  // High confidence first: consecutive duplicate totals
  let ordered = dedupePreserveOrder([...paired, ...largeSingles]);
  ordered = filterAreaOutliers(ordered);

  const declared =
    floorsCount != null && floorsCount > 0 ? Math.floor(floorsCount) : null;

  if (declared != null) {
    // 1) Paired totals first (highest confidence)
    const selected = dedupePreserveOrder([...paired]);
    // 2) Fill remaining slots with the largest remaining plausible singles
    //    (avoids tiny column scraps like 107.32 when 353.69 is the real next floor)
    const remaining = largeSingles
      .filter((a) => !selected.some((p) => Math.abs(p - a) < 0.05))
      .sort((a, b) => b - a);
    const anchor = selected[0] || remaining[0] || 0;
    for (const area of remaining) {
      if (selected.length >= declared) break;
      // Keep areas in a plausible band vs the first floor total
      if (anchor > 0 && (area > anchor * 4 || area < anchor * 0.15)) continue;
      selected.push(area);
    }
    // Keep presentation order: paired order first, then filled by descending size
    // Re-sort selected so ground (largest / first paired) stays first when possible
    const orderedSelected = dedupePreserveOrder([
      ...paired.filter((p) => selected.some((s) => Math.abs(s - p) < 0.05)),
      ...selected
        .filter((s) => !paired.some((p) => Math.abs(p - s) < 0.05))
        .sort((a, b) => b - a),
    ]);
    return filterAreaOutliers(orderedSelected).slice(0, declared);
  }

  // No declared floor count → only trust paired totals (usually one row per floor)
  return filterAreaOutliers(paired).slice(0, 6);
}

export function buildFloorsFromAreaList(
  areas: number[],
  floorsCount?: number | null
): PermitFloorRow[] {
  if (!areas.length && !(floorsCount && floorsCount > 0)) return [];

  const declared =
    floorsCount != null && floorsCount > 0 ? Math.floor(floorsCount) : null;

  // Strict: never invent more floors than the permit's عدد الأدوار
  const count = declared != null
    ? declared
    : Math.min(areas.length, 6);

  if (count <= 0) return [];

  const rows: PermitFloorRow[] = [];
  for (let i = 0; i < count; i++) {
    const meta = DEFAULT_FLOOR_SEQUENCE[i] || {
      label: `دور ${i + 1}`,
      kind: 'custom' as FloorLevelKind,
    };
    const area = areas[i];
    // If we know floor count but lack a row area, still create the floor with 0
    // so the UI shows the correct عدد الأدوار (user can fill area).
    // Prefer splitting a single known total across floors when only one area exists.
    let area_m2 = typeof area === 'number' ? area : 0;
    if (area_m2 <= 0 && areas.length === 1 && count > 1) {
      area_m2 = Math.round((areas[0] / count) * 100) / 100;
    } else if (area_m2 <= 0 && areas.length > 0 && i === 0) {
      // fall through — leave 0
    }
    rows.push({
      label: meta.label,
      kind: meta.kind,
      area_m2: area_m2 > 0 ? area_m2 : i < areas.length ? areas[i] || 0 : 0,
      repeat_count: 1,
    });
  }

  // If we have exactly one solid total and declared count > 1, distribute evenly
  if (declared != null && declared > 1 && areas.length === 1 && areas[0] > 0) {
    const per = Math.round((areas[0] / declared) * 100) / 100;
    return rows.map((r) => ({ ...r, area_m2: per }));
  }

  // If we have fewer areas than declared floors but ≥1, put known areas on the
  // first floors and leave the rest empty (0) rather than inventing scrap numbers.
  return rows;
}

/** Merge named floor rows with heuristic area rows; named source rows always remain intact. */
export function mergeFloorRows(
  named: PermitFloorRow[],
  heuristic: PermitFloorRow[],
  floorsCount?: number | null
): PermitFloorRow[] {
  const declared =
    floorsCount != null && floorsCount > 0 ? Math.floor(floorsCount) : null;
  const rows = named.length > 0 ? named : heuristic;
  // licensedFloorCount is not the number of printed table rows. Keep every
  // explicit row, including basement and roof annex, without synthetic labels.
  if (rows.length > 0) return rows;
  if (declared != null) return buildFloorsFromAreaList([], declared);
  return rows;
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
    // Reject obviously wrong OCR near labels (0) and keep sane building heights
    if (n >= 1 && n <= 40) return n;
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
