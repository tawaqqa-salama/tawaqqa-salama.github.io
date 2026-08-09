/**
 * Local drawing sanitizer — thresholding, contours, scale & title-block text parsers.
 * Pure / Canvas-backed; no network calls.
 */

import type {
  DetectedWallSegment,
  DetectedZone,
  Point2D,
  ScaleCalibration,
  TitleBlockMetadata,
} from '@/lib/projects/design-center/vision/types';

export function toGrayscale(src: ImageData): Uint8ClampedArray {
  const out = new Uint8ClampedArray(src.width * src.height);
  const d = src.data;
  for (let i = 0, p = 0; i < d.length; i += 4, p++) {
    out[p] = (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) | 0;
  }
  return out;
}

/** Otsu threshold on grayscale histogram */
export function otsuThreshold(gray: Uint8ClampedArray): number {
  const hist = new Array<number>(256).fill(0);
  for (let i = 0; i < gray.length; i++) hist[gray[i]]++;
  const total = gray.length;
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0;
  let wB = 0;
  let maxVar = 0;
  let threshold = 128;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > maxVar) {
      maxVar = between;
      threshold = t;
    }
  }
  return threshold;
}

/** Binary: 1 = ink/wall (dark), 0 = background */
export function thresholdBinary(
  gray: Uint8ClampedArray,
  threshold?: number
): Uint8Array {
  const t = threshold ?? otsuThreshold(gray);
  const out = new Uint8Array(gray.length);
  for (let i = 0; i < gray.length; i++) out[i] = gray[i] < t ? 1 : 0;
  return out;
}

/** 3×3 dilate on binary ink mask — closes small gaps in wall lines */
export function dilateBinary(bin: Uint8Array, w: number, h: number, passes = 1): Uint8Array {
  let cur = bin;
  for (let p = 0; p < passes; p++) {
    const next = new Uint8Array(cur.length);
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        let v = 0;
        for (let dy = -1; dy <= 1 && !v; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (cur[(y + dy) * w + (x + dx)]) {
              v = 1;
              break;
            }
          }
        }
        next[y * w + x] = v;
      }
    }
    cur = next;
  }
  return cur;
}

/**
 * Invert semantics: rooms are empty (white) regions enclosed by ink.
 * Flood-fill background from borders, then remaining white blobs ≈ rooms.
 */
export function detectRoomZones(
  ink: Uint8Array,
  w: number,
  h: number,
  metersPerPixel: number | null
): DetectedZone[] {
  // empty = not ink
  const empty = new Uint8Array(ink.length);
  for (let i = 0; i < ink.length; i++) empty[i] = ink[i] ? 0 : 1;

  const visited = new Uint8Array(empty.length);
  const queue = new Int32Array(w * h);
  // Mark border-connected empty as exterior
  let qh = 0;
  let qt = 0;
  const push = (i: number) => {
    if (!empty[i] || visited[i]) return;
    visited[i] = 1;
    queue[qt++] = i;
  };
  for (let x = 0; x < w; x++) {
    push(x);
    push((h - 1) * w + x);
  }
  for (let y = 0; y < h; y++) {
    push(y * w);
    push(y * w + (w - 1));
  }
  while (qh < qt) {
    const i = queue[qh++];
    const x = i % w;
    const y = (i / w) | 0;
    if (x > 0) push(i - 1);
    if (x < w - 1) push(i + 1);
    if (y > 0) push(i - w);
    if (y < h - 1) push(i + w);
  }

  const pageArea = w * h;
  const zones: DetectedZone[] = [];
  let zoneIdx = 0;

  for (let i = 0; i < empty.length; i++) {
    if (!empty[i] || visited[i]) continue;
    // flood component
    qh = 0;
    qt = 0;
    queue[qt++] = i;
    visited[i] = 2;
    let minX = w;
    let minY = h;
    let maxX = 0;
    let maxY = 0;
    let area = 0;
    const edgePoints: Point2D[] = [];

    while (qh < qt) {
      const cur = queue[qh++];
      const x = cur % w;
      const y = (cur / w) | 0;
      area++;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;

      const isEdge =
        (x > 0 && ink[cur - 1]) ||
        (x < w - 1 && ink[cur + 1]) ||
        (y > 0 && ink[cur - w]) ||
        (y < h - 1 && ink[cur + w]);
      if (isEdge && edgePoints.length < 400) {
        edgePoints.push({ x, y });
      }

      const tryPush = (ni: number) => {
        if (ni < 0 || ni >= empty.length) return;
        if (!empty[ni] || visited[ni]) return;
        visited[ni] = 2;
        queue[qt++] = ni;
      };
      if (x > 0) tryPush(cur - 1);
      if (x < w - 1) tryPush(cur + 1);
      if (y > 0) tryPush(cur - w);
      if (y < h - 1) tryPush(cur + w);
    }

    const frac = area / pageArea;
    // Filter noise / whole-page leftovers
    if (frac < 0.002 || frac > 0.35) continue;
    if (area < 800) continue;

    const bw = maxX - minX + 1;
    const bh = maxY - minY + 1;
    if (bw < 20 || bh < 20) continue;

    const polygon = simplifyPolygon(
      edgePoints.length >= 8
        ? convexHull(edgePoints)
        : [
            { x: minX, y: minY },
            { x: maxX, y: minY },
            { x: maxX, y: maxY },
            { x: minX, y: maxY },
          ],
      6
    );

    const area_m2 =
      metersPerPixel != null && metersPerPixel > 0
        ? Math.round(area * metersPerPixel * metersPerPixel * 100) / 100
        : null;

    zones.push({
      id: `zone-${++zoneIdx}`,
      label: null,
      polygon,
      area_px: area,
      area_m2,
      confidence: Math.min(0.9, 0.4 + Math.min(frac * 4, 0.4)),
      bounds: { x: minX, y: minY, w: bw, h: bh },
    });

    if (zones.length >= 40) break;
  }

  return zones.sort((a, b) => b.area_px - a.area_px);
}

/** Extract long horizontal/vertical ink runs as wall segments */
export function detectWallSegments(
  ink: Uint8Array,
  w: number,
  h: number,
  metersPerPixel: number | null,
  minRun = 40
): DetectedWallSegment[] {
  const segments: DetectedWallSegment[] = [];
  let id = 0;

  // Horizontal runs (sample every 4 rows for speed)
  for (let y = 0; y < h; y += 4) {
    let run = 0;
    let start = 0;
    for (let x = 0; x <= w; x++) {
      const on = x < w && ink[y * w + x];
      if (on) {
        if (!run) start = x;
        run++;
      } else if (run >= minRun) {
        const length_px = run;
        segments.push({
          id: `wall-h-${++id}`,
          x1: start,
          y1: y,
          x2: start + run - 1,
          y2: y,
          length_px,
          length_m:
            metersPerPixel != null
              ? Math.round(length_px * metersPerPixel * 100) / 100
              : null,
        });
        run = 0;
      } else {
        run = 0;
      }
    }
  }

  // Vertical runs (sample every 4 cols)
  for (let x = 0; x < w; x += 4) {
    let run = 0;
    let start = 0;
    for (let y = 0; y <= h; y++) {
      const on = y < h && ink[y * w + x];
      if (on) {
        if (!run) start = y;
        run++;
      } else if (run >= minRun) {
        const length_px = run;
        segments.push({
          id: `wall-v-${++id}`,
          x1: x,
          y1: start,
          x2: x,
          y2: start + run - 1,
          length_px,
          length_m:
            metersPerPixel != null
              ? Math.round(length_px * metersPerPixel * 100) / 100
              : null,
        });
        run = 0;
      } else {
        run = 0;
      }
    }
  }

  return segments.slice(0, 200);
}

export function detectScaleFromText(text: string): {
  ratio_text: string | null;
  scale_denominator: number | null;
} {
  const src = String(text || '');
  const patterns = [
    /(?:scale|مقياس|SCALE)\s*[:\s]*1\s*[:/]\s*(\d{1,4})/i,
    /\b1\s*[:/]\s*(\d{2,4})\b/,
    /1\s*:\s*(\d{2,4})/,
  ];
  for (const re of patterns) {
    const m = src.match(re);
    if (m) {
      const den = Number(m[1]);
      if (Number.isFinite(den) && den >= 10 && den <= 5000) {
        return { ratio_text: `1:${den}`, scale_denominator: den };
      }
    }
  }
  return { ratio_text: null, scale_denominator: null };
}

/**
 * meters_per_pixel at given render DPI for scale 1:S
 * 1 m real → (1000/S) mm on paper → inches → * DPI
 */
export function metersPerPixelFromScale(scaleDenominator: number, dpi: number): number {
  if (!(scaleDenominator > 0) || !(dpi > 0)) return 0;
  const mmOnPaperPerMeter = 1000 / scaleDenominator;
  const inchesOnPaper = mmOnPaperPerMeter / 25.4;
  const pixelsPerMeter = inchesOnPaper * dpi;
  return pixelsPerMeter > 0 ? 1 / pixelsPerMeter : 0;
}

export function buildScaleCalibration(params: {
  text: string;
  dpi: number;
  manualMetersPerPixel?: number | null;
}): ScaleCalibration {
  if (params.manualMetersPerPixel != null && params.manualMetersPerPixel > 0) {
    return {
      ratio_text: null,
      scale_denominator: null,
      meters_per_pixel: params.manualMetersPerPixel,
      source: 'manual',
      dpi: params.dpi,
    };
  }
  const { ratio_text, scale_denominator } = detectScaleFromText(params.text);
  if (scale_denominator) {
    return {
      ratio_text,
      scale_denominator,
      meters_per_pixel: metersPerPixelFromScale(scale_denominator, params.dpi),
      source: /مقياس|scale/i.test(params.text) ? 'title_block' : 'drawing_text',
      dpi: params.dpi,
    };
  }
  return {
    ratio_text: null,
    scale_denominator: null,
    meters_per_pixel: null,
    source: 'unknown',
    dpi: params.dpi,
  };
}

export function parseTitleBlockText(text: string): TitleBlockMetadata {
  const raw = String(text || '').trim();
  if (!raw) {
    return {
      project_name: null,
      sheet_number: null,
      drawing_title: null,
      occupancy: null,
      area_m2: null,
      scale_text: null,
      revision: null,
      raw_text: '',
      source: 'none',
    };
  }

  const sheet =
    raw.match(/(?:sheet|لوحة|رقم\s*اللوحة)\s*[#.:\s-]*([A-Z0-9][\w./-]{0,20})/i)?.[1] ||
    raw.match(/\b([A-Z]{1,3}[-_]?\d{1,4})\b/)?.[1] ||
    null;

  const areaMatch =
    raw.match(
      /(?:area|مساحة|GFA|gross\s*floor)\s*[=:]?\s*([\d,.]+)\s*(?:m2|m²|متر|sq\.?\s*m)?/i
    ) || raw.match(/([\d,.]+)\s*(?:m2|m²)\b/i);
  const area_m2 = areaMatch
    ? Number(String(areaMatch[1]).replace(/,/g, ''))
    : null;

  const occupancy =
    raw.match(
      /(?:occupancy|إشغال|classification|تصنيف)\s*[=:]?\s*([^\n|;]{2,40})/i
    )?.[1]?.trim() ||
    pickOccupancyKeyword(raw);

  const scale = detectScaleFromText(raw);

  const project_name =
    raw.match(/(?:project|مشروع)\s*[=:]?\s*([^\n]{3,80})/i)?.[1]?.trim() || null;

  const drawing_title =
    raw.match(/(?:title|عنوان)\s*[=:]?\s*([^\n]{3,80})/i)?.[1]?.trim() || null;

  const revision =
    raw.match(/(?:rev(?:ision)?|مراجعة)\s*[.:\s-]*([A-Z0-9]+)/i)?.[1] || null;

  return {
    project_name,
    sheet_number: sheet,
    drawing_title,
    occupancy: occupancy || null,
    area_m2: Number.isFinite(area_m2 as number) ? (area_m2 as number) : null,
    scale_text: scale.ratio_text,
    revision,
    raw_text: raw.slice(0, 4000),
    source: 'pdf_text',
  };
}

function pickOccupancyKeyword(text: string): string | null {
  const map: Array<[RegExp, string]> = [
    [/mercantile|تجاري|retail|mall/i, 'Mercantile'],
    [/business|مكتبي|office/i, 'Business'],
    [/residential|سكني|apartment/i, 'Residential'],
    [/assembly|تجمع|mosque|مسرح/i, 'Assembly'],
    [/storage|مستودع|warehouse/i, 'Storage'],
    [/industrial|صناعي|factory/i, 'Industrial'],
    [/educational|تعليمي|school/i, 'Educational'],
    [/healthcare|صحي|hospital/i, 'Healthcare'],
  ];
  for (const [re, label] of map) {
    if (re.test(text)) return label;
  }
  return null;
}

/** Count door/exit mentions in extracted text (heuristic, not geometry) */
export function countEgressMentions(text: string): {
  exits_count: number | null;
  doors_count: number | null;
} {
  const src = String(text || '');
  if (!src.trim()) return { exits_count: null, doors_count: null };

  const exitLabeled = src.match(
    /(?:exits?|مخارج|emergency\s*exit)\s*[=:]?\s*(\d{1,3})/i
  );
  const doorLabeled = src.match(/(?:doors?|أبواب)\s*[=:]?\s*(\d{1,3})/i);

  const exitWordHits = (src.match(/\bEXIT\b|مخرج|طوارئ/gi) || []).length;
  const doorWordHits = (src.match(/\bDOOR\b|باب/gi) || []).length;

  const exits_count = exitLabeled
    ? Number(exitLabeled[1])
    : exitWordHits >= 2
      ? exitWordHits
      : null;
  const doors_count = doorLabeled
    ? Number(doorLabeled[1])
    : doorWordHits >= 3
      ? doorWordHits
      : null;

  return {
    exits_count: Number.isFinite(exits_count as number) ? exits_count : null,
    doors_count: Number.isFinite(doors_count as number) ? doors_count : null,
  };
}

export function cropImageData(
  src: ImageData,
  x: number,
  y: number,
  cw: number,
  ch: number
): ImageData {
  const sx = Math.max(0, Math.floor(x));
  const sy = Math.max(0, Math.floor(y));
  const w = Math.min(cw, src.width - sx);
  const h = Math.min(ch, src.height - sy);
  const out = new ImageData(w, h);
  for (let row = 0; row < h; row++) {
    const srcOff = ((sy + row) * src.width + sx) * 4;
    const dstOff = row * w * 4;
    out.data.set(src.data.subarray(srcOff, srcOff + w * 4), dstOff);
  }
  return out;
}

function cross(o: Point2D, a: Point2D, b: Point2D) {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

export function convexHull(points: Point2D[]): Point2D[] {
  const pts = [...points].sort((a, b) => (a.x === b.x ? a.y - b.y : a.x - b.x));
  if (pts.length <= 2) return pts;
  const lower: Point2D[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
      lower.pop();
    }
    lower.push(p);
  }
  const upper: Point2D[] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
      upper.pop();
    }
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

export function simplifyPolygon(points: Point2D[], maxPoints: number): Point2D[] {
  if (points.length <= maxPoints) return points;
  const step = Math.ceil(points.length / maxPoints);
  const out: Point2D[] = [];
  for (let i = 0; i < points.length; i += step) out.push(points[i]);
  if (out.length && points.length) {
    const last = points[points.length - 1];
    const ol = out[out.length - 1];
    if (ol.x !== last.x || ol.y !== last.y) out.push(last);
  }
  return out;
}
