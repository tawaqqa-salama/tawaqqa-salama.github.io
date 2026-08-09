/**
 * Phase 2 — multi-zone architectural segmentation & classification.
 * Pure geometry + text-anchor labeling (no invented rooms).
 */

import type { FireSystemKind } from '@/lib/projects/design-center/types';
import type {
  DetectedZone,
  Point2D,
  TextAnchor,
  ZoneClassification,
  ZoneSystemRequirement,
} from '@/lib/projects/design-center/vision/types';

const LABEL_RULES: Array<{
  class: ZoneClassification;
  re: RegExp;
  label_en: string;
  label_ar: string;
}> = [
  {
    class: 'electrical_room',
    re: /\b(mdb|msb|electrical|elec\.?|lv\s*room|transformer|لوح|كهرب|محول)\b/i,
    label_en: 'Electrical / MDB Room',
    label_ar: 'غرفة كهرباء / لوحة رئيسية',
  },
  {
    class: 'server_room',
    re: /\b(server|data\s*center|it\s*room|ups|telecom|غرفة\s*خوادم|اتصالات)\b/i,
    label_en: 'Server / IT Room',
    label_ar: 'غرفة خوادم / اتصالات',
  },
  {
    class: 'kitchen',
    re: /\b(kitchen|cooking|غرفة\s*طبخ|مطبخ|canteen)\b/i,
    label_en: 'Commercial Kitchen',
    label_ar: 'مطبخ تجاري',
  },
  {
    class: 'warehouse',
    re: /\b(warehouse|storage|store|مستودع|تخزين|high\s*piled)\b/i,
    label_en: 'Warehouse / Storage',
    label_ar: 'مستودع / تخزين',
  },
  {
    class: 'stairwell',
    re: /\b(stair|staircase|stairwell|exit\s*stair|سلم|درج)\b/i,
    label_en: 'Stairwell',
    label_ar: 'بئر درج',
  },
  {
    class: 'corridor',
    re: /\b(corridor|hallway|passage|ممر|دهليز)\b/i,
    label_en: 'Corridor',
    label_ar: 'ممر',
  },
  {
    class: 'office',
    re: /\b(office|meeting|admin|مكتب|إداري)\b/i,
    label_en: 'Office',
    label_ar: 'مكتب',
  },
  {
    class: 'assembly',
    re: /\b(lobby|hall|mosque|theatre|assembly|صالة|ردهة|مسجد)\b/i,
    label_en: 'Assembly / Lobby',
    label_ar: 'تجمع / ردهة',
  },
];

export function classifyLabelText(text: string | null | undefined): {
  classification: ZoneClassification;
  label: string | null;
  label_ar: string | null;
  confidence: number;
} {
  const src = String(text || '').trim();
  if (!src) {
    return { classification: 'unknown', label: null, label_ar: null, confidence: 0 };
  }
  for (const rule of LABEL_RULES) {
    if (rule.re.test(src)) {
      return {
        classification: rule.class,
        label: rule.label_en,
        label_ar: rule.label_ar,
        confidence: 0.75,
      };
    }
  }
  return {
    classification: 'unknown',
    label: src.slice(0, 48),
    label_ar: null,
    confidence: 0.35,
  };
}

export function polygonAreaPx(polygon: Point2D[]): number {
  if (polygon.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) / 2;
}

export function zoneAreaM2(
  zone: Pick<DetectedZone, 'polygon' | 'area_px'>,
  metersPerPixel: number | null
): number | null {
  if (metersPerPixel == null || !(metersPerPixel > 0)) return null;
  const px = polygonAreaPx(zone.polygon) || zone.area_px;
  return Math.round(px * metersPerPixel * metersPerPixel * 100) / 100;
}

function pointInBounds(
  p: Point2D,
  b: { x: number; y: number; w: number; h: number },
  pad = 24
): boolean {
  return (
    p.x >= b.x - pad &&
    p.x <= b.x + b.w + pad &&
    p.y >= b.y - pad &&
    p.y <= b.y + b.h + pad
  );
}

function boundsOverlap(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number }
): number {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.w, b.x + b.w);
  const y2 = Math.min(a.y + a.h, b.y + b.h);
  const w = Math.max(0, x2 - x1);
  const h = Math.max(0, y2 - y1);
  const inter = w * h;
  const union = a.w * a.h + b.w * b.h - inter;
  return union > 0 ? inter / union : 0;
}

/** Drop nested/duplicate perimeters — keep larger distinct rooms */
export function partitionDistinctZones(zones: DetectedZone[]): DetectedZone[] {
  const sorted = [...zones].sort((a, b) => b.area_px - a.area_px);
  const kept: DetectedZone[] = [];
  for (const z of sorted) {
    const dup = kept.some((k) => boundsOverlap(k.bounds, z.bounds) > 0.65);
    if (dup) continue;
    kept.push(z);
    if (kept.length >= 48) break;
  }
  return kept;
}

/** Assign labels from nearby drawing text anchors; mark unknowns for engineer input */
export function enrichZonesWithLabels(
  zones: DetectedZone[],
  anchors: TextAnchor[],
  metersPerPixel: number | null
): DetectedZone[] {
  const partitioned = partitionDistinctZones(zones);
  return partitioned.map((z, idx) => {
    const near = anchors
      .filter((a) => pointInBounds({ x: a.x, y: a.y }, z.bounds, 36))
      .sort((a, b) => {
        const acx = z.bounds.x + z.bounds.w / 2;
        const acy = z.bounds.y + z.bounds.h / 2;
        const da = (a.x - acx) ** 2 + (a.y - acy) ** 2;
        const db = (b.x - acx) ** 2 + (b.y - acy) ** 2;
        return da - db;
      });
    const textBlob = near
      .slice(0, 6)
      .map((a) => a.text)
      .join(' ');
    const classified = classifyLabelText(textBlob);
    const area_m2 = zoneAreaM2(z, metersPerPixel);
    const needsLabel = classified.classification === 'unknown' || !classified.label;
    return {
      ...z,
      id: z.id || `zone-${idx + 1}`,
      label: classified.label || z.label,
      label_ar: classified.label_ar,
      classification: classified.classification,
      label_source: classified.classification !== 'unknown' ? 'text_anchor' : 'unknown',
      label_confidence: classified.confidence,
      area_m2,
      needs_engineer_label: needsLabel,
      nearby_text: textBlob.slice(0, 120) || null,
    };
  });
}

export function applyManualZoneOverride(
  zone: DetectedZone,
  override: {
    label?: string | null;
    classification?: ZoneClassification;
    /** Scale bounds width/height by factor (1 = unchanged) */
    dimensionScale?: number;
    area_m2?: number | null;
  },
  metersPerPixel: number | null
): DetectedZone {
  const scale = override.dimensionScale && override.dimensionScale > 0 ? override.dimensionScale : 1;
  const cx = zone.bounds.x + zone.bounds.w / 2;
  const cy = zone.bounds.y + zone.bounds.h / 2;
  const polygon =
    scale === 1
      ? zone.polygon
      : zone.polygon.map((p) => ({
          x: cx + (p.x - cx) * scale,
          y: cy + (p.y - cy) * scale,
        }));
  const bounds =
    scale === 1
      ? zone.bounds
      : {
          x: cx - (zone.bounds.w * scale) / 2,
          y: cy - (zone.bounds.h * scale) / 2,
          w: zone.bounds.w * scale,
          h: zone.bounds.h * scale,
        };
  const area_px = polygonAreaPx(polygon) || zone.area_px * scale * scale;
  const classified = override.classification
    ? {
        classification: override.classification,
        label: override.label ?? zone.label,
        label_ar: zone.label_ar ?? null,
      }
    : classifyLabelText(override.label ?? zone.label);

  return {
    ...zone,
    polygon,
    bounds,
    area_px,
    area_m2:
      override.area_m2 != null
        ? override.area_m2
        : zoneAreaM2({ polygon, area_px }, metersPerPixel),
    label: override.label ?? classified.label ?? zone.label,
    label_ar: classified.label_ar ?? zone.label_ar,
    classification: classified.classification,
    label_source: 'manual',
    label_confidence: 1,
    needs_engineer_label: false,
    manual_override: true,
  };
}

/** Map zone class → specialized suppression / design systems + codes */
export function bindZoneToSystems(zone: DetectedZone): ZoneSystemRequirement | null {
  const c = zone.classification || 'unknown';
  if (c === 'electrical_room' || c === 'server_room') {
    const systems: FireSystemKind[] = ['clean_agent', 'fm200', 'co2'];
    return {
      zone_id: zone.id,
      zone_label: zone.label,
      classification: c,
      systems,
      primary_codes: ['NFPA-2001'],
      related_codes: c === 'electrical_room' ? ['NFPA-12'] : ['NFPA-2001'],
      note_ar:
        'غرفة كهرباء/خوادم — يُقترح نظام عامل نظيف / FM200 / CO2 (NFPA 2001) بعد تحقق المهندس',
      note_en:
        'Electrical/server room — Clean Agent / FM200 / CO2 (NFPA 2001) suggested pending engineer verification',
      sprinkler_density_hint: null,
    };
  }
  if (c === 'kitchen') {
    return {
      zone_id: zone.id,
      zone_label: zone.label,
      classification: c,
      systems: ['kitchen_hood'],
      primary_codes: ['NFPA-96'],
      related_codes: ['NFPA-10'],
      note_ar: 'مطبخ تجاري — نظام شفاط / مواد رطبة (NFPA 96) بعد تحقق المهندس',
      note_en:
        'Commercial kitchen — wet-chemical hood system (NFPA 96) suggested pending engineer verification',
      sprinkler_density_hint: null,
    };
  }
  if (c === 'warehouse') {
    return {
      zone_id: zone.id,
      zone_label: zone.label,
      classification: c,
      systems: ['sprinkler'],
      primary_codes: ['NFPA-13'],
      related_codes: ['SBC-801'],
      note_ar:
        'مستودع — يُراجع كثافة المرشات / ESFR وفق NFPA-13 وخطر التخزين (تحقق المهندس)',
      note_en:
        'Warehouse — review ESFR / high-density sprinklers per NFPA-13 storage hazard (engineer verification)',
      sprinkler_density_hint: 'ESFR_OR_HIGH_DENSITY',
    };
  }
  return null;
}

export function collectZoneSystemRequirements(zones: DetectedZone[]): ZoneSystemRequirement[] {
  const out: ZoneSystemRequirement[] = [];
  for (const z of zones) {
    const req = bindZoneToSystems(z);
    if (req) out.push(req);
  }
  return out;
}

export function zonesImplyKitchen(zones: DetectedZone[]): boolean {
  return zones.some((z) => z.classification === 'kitchen');
}

export function zonesImplySpecialSuppression(zones: DetectedZone[]): FireSystemKind[] {
  const set = new Set<FireSystemKind>();
  for (const z of zones) {
    const req = bindZoneToSystems(z);
    if (!req) continue;
    for (const s of req.systems) {
      if (s === 'fm200' || s === 'co2' || s === 'clean_agent' || s === 'kitchen_hood') {
        set.add(s);
      }
    }
  }
  return Array.from(set);
}
