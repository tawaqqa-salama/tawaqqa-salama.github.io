/**
 * Phase 3 — MEP symbol coverage & spacing auditor (local heuristic).
 * Devices are inferred from drawing text anchors / labels — not a full CAD symbol library.
 */

import type {
  CoverageAuditResult,
  CoverageIssue,
  DetectedMepDevice,
  DetectedZone,
  HazardClass,
  MepDeviceKind,
  Point2D,
  TextAnchor,
  ZoneClassification,
} from '@/lib/projects/design-center/vision/types';

/** NFPA 13 typical max spacing (m) — engineer must verify hazard/ceiling tables */
export function sprinklerMaxSpacingM(hazard: HazardClass): number {
  if (hazard === 'extra') return 3.7; // ~12 ft
  if (hazard === 'ordinary') return 4.6; // ~15 ft upper ordinary / common check
  return 4.6; // light ~15 ft
}

/** NFPA 72 smooth-ceiling typical max detector spacing (m) ≈ 30 ft */
export function smokeMaxSpacingM(): number {
  return 9.1;
}

export function inferHazardClass(
  zones: DetectedZone[],
  occupancy?: string | null
): HazardClass {
  if (zones.some((z) => z.classification === 'warehouse')) return 'extra';
  if (zones.some((z) => z.classification === 'kitchen' || z.classification === 'electrical_room')) {
    return 'ordinary';
  }
  const occ = String(occupancy || '').toLowerCase();
  if (/storage|warehouse|مستودع|industrial|صناع/.test(occ)) return 'extra';
  if (/mercantile|تجاري|assembly|تجمع/.test(occ)) return 'ordinary';
  return 'light';
}

const DEVICE_RULES: Array<{ kind: MepDeviceKind; re: RegExp }> = [
  {
    kind: 'sprinkler',
    re: /\b(spk|sprinkler|spr|head|مرش|رشاش)\b/i,
  },
  {
    kind: 'smoke_detector',
    re: /\b(sd|smd|smoke|detector|كاشف|دخان)\b/i,
  },
  {
    kind: 'manual_call_point',
    re: /\b(mcp|manual\s*call|break\s*glass|pull\s*station|نقطة\s*نداء|جرس\s*إنذار)\b/i,
  },
];

export function detectDevicesFromAnchors(anchors: TextAnchor[]): DetectedMepDevice[] {
  const out: DetectedMepDevice[] = [];
  let i = 0;
  for (const a of anchors) {
    const text = String(a.text || '').trim();
    if (!text) continue;
    for (const rule of DEVICE_RULES) {
      if (!rule.re.test(text)) continue;
      out.push({
        id: `dev-${rule.kind}-${++i}`,
        kind: rule.kind,
        x: a.x,
        y: a.y,
        label: text.slice(0, 40),
        source: 'text_anchor',
        confidence: 0.65,
      });
      break;
    }
  }
  return out;
}

function dist(a: Point2D, b: Point2D): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function devicesOf(devices: DetectedMepDevice[], kind: MepDeviceKind) {
  return devices.filter((d) => d.kind === kind);
}

/** Flag pairs exceeding max spacing */
export function findOverspacedPairs(
  devices: DetectedMepDevice[],
  kind: MepDeviceKind,
  maxSpacingM: number,
  metersPerPixel: number | null
): CoverageIssue[] {
  const list = devicesOf(devices, kind);
  if (list.length < 2) return [];
  if (metersPerPixel == null || !(metersPerPixel > 0)) {
    return [
      {
        id: `scale-${kind}`,
        kind: 'scale_unknown',
        device_kind: kind,
        zone_id: null,
        message_ar: `لا يمكن تدقيق تباعد ${kind} — المقياس غير معروف`,
        message_en: `Cannot audit ${kind} spacing — scale unknown`,
        points: [],
        distance_m: null,
        limit_m: maxSpacingM,
      },
    ];
  }

  const issues: CoverageIssue[] = [];
  // Check nearest-neighbor spacing (not all pairs) for performance
  for (let i = 0; i < list.length; i++) {
    let nearest = Infinity;
    let neighbor: DetectedMepDevice | null = null;
    for (let j = 0; j < list.length; j++) {
      if (i === j) continue;
      const d = dist(list[i], list[j]);
      if (d < nearest) {
        nearest = d;
        neighbor = list[j];
      }
    }
    if (!neighbor) continue;
    const distance_m = nearest * metersPerPixel;
    if (distance_m > maxSpacingM * 1.05) {
      issues.push({
        id: `space-${kind}-${list[i].id}`,
        kind: 'over_spaced',
        device_kind: kind,
        zone_id: null,
        message_ar: `تباعد ${kind} تقديري ${distance_m.toFixed(1)} م يتجاوز الحد ${maxSpacingM} م`,
        message_en: `${kind} spacing ~${distance_m.toFixed(1)} m exceeds ${maxSpacingM} m limit`,
        points: [
          { x: list[i].x, y: list[i].y },
          { x: neighbor.x, y: neighbor.y },
        ],
        distance_m: Math.round(distance_m * 100) / 100,
        limit_m: maxSpacingM,
      });
    }
  }
  return issues.slice(0, 40);
}

function pointInBounds(
  p: Point2D,
  b: { x: number; y: number; w: number; h: number }
): boolean {
  return p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;
}

/** Sample zone grid; flag samples farther than coverage radius from nearest device */
export function findUncoveredSamples(
  zones: DetectedZone[],
  devices: DetectedMepDevice[],
  kind: MepDeviceKind,
  maxSpacingM: number,
  metersPerPixel: number | null
): {
  samples: CoverageAuditResult['uncovered_samples'];
  issues: CoverageIssue[];
} {
  const list = devicesOf(devices, kind);
  const samples: CoverageAuditResult['uncovered_samples'] = [];
  const issues: CoverageIssue[] = [];

  if (!zones.length) return { samples, issues };

  if (!list.length) {
    for (const z of zones.slice(0, 12)) {
      if (z.classification === 'stairwell') continue;
      issues.push({
        id: `nodev-${kind}-${z.id}`,
        kind: 'no_devices',
        device_kind: kind,
        zone_id: z.id,
        message_ar: `لا أجهزة ${kind} مكتشفة نصيًا في/قرب الفراغ ${z.label || z.id}`,
        message_en: `No ${kind} devices text-detected in/near zone ${z.label || z.id}`,
        points: [
          {
            x: z.bounds.x + z.bounds.w / 2,
            y: z.bounds.y + z.bounds.h / 2,
          },
        ],
        distance_m: null,
        limit_m: maxSpacingM,
      });
    }
    return { samples, issues: issues.slice(0, 20) };
  }

  if (metersPerPixel == null || !(metersPerPixel > 0)) {
    return {
      samples,
      issues: [
        {
          id: `uncov-scale-${kind}`,
          kind: 'scale_unknown',
          device_kind: kind,
          zone_id: null,
          message_ar: 'لا يمكن تحديد المناطق غير المغطاة — المقياس غير معروف',
          message_en: 'Cannot flag uncovered zones — scale unknown',
          points: [],
          distance_m: null,
          limit_m: maxSpacingM,
        },
      ],
    };
  }

  const radiusM = maxSpacingM / 2; // conservative half-spacing coverage radius
  const radiusPx = radiusM / metersPerPixel;

  for (const z of zones) {
    if (z.classification === 'stairwell') continue;
    const stepX = Math.max(20, z.bounds.w / 4);
    const stepY = Math.max(20, z.bounds.h / 4);
    let uncoveredInZone = 0;
    for (let x = z.bounds.x + stepX / 2; x < z.bounds.x + z.bounds.w; x += stepX) {
      for (let y = z.bounds.y + stepY / 2; y < z.bounds.y + z.bounds.h; y += stepY) {
        const p = { x, y };
        if (!pointInBounds(p, z.bounds)) continue;
        const nearest = list.reduce(
          (min, d) => Math.min(min, dist(p, d)),
          Infinity
        );
        if (nearest > radiusPx) {
          uncoveredInZone++;
          if (samples.length < 80) {
            samples.push({ zone_id: z.id, x, y, device_kind: kind });
          }
        }
      }
    }
    if (uncoveredInZone > 0) {
      issues.push({
        id: `uncov-${kind}-${z.id}`,
        kind: 'uncovered_zone',
        device_kind: kind,
        zone_id: z.id,
        message_ar: `فراغ ${z.label || z.id}: عينات غير مغطاة بـ ${kind} (نصف تباعد ${radiusM.toFixed(1)} م)`,
        message_en: `Zone ${z.label || z.id}: uncovered ${kind} samples (½-spacing radius ${radiusM.toFixed(1)} m)`,
        points: samples.filter((s) => s.zone_id === z.id).slice(0, 6).map((s) => ({ x: s.x, y: s.y })),
        distance_m: null,
        limit_m: radiusM,
      });
    }
  }

  return { samples, issues: issues.slice(0, 30) };
}

export function runCoverageAudit(params: {
  zones: DetectedZone[];
  textAnchors: TextAnchor[];
  metersPerPixel: number | null;
  occupancy?: string | null;
}): CoverageAuditResult {
  const hazard_class = inferHazardClass(params.zones, params.occupancy);
  const sprinkler_max_spacing_m = sprinklerMaxSpacingM(hazard_class);
  const smoke_max_spacing_m = smokeMaxSpacingM();
  const devices = detectDevicesFromAnchors(params.textAnchors);

  const issues: CoverageIssue[] = [];
  issues.push(
    ...findOverspacedPairs(
      devices,
      'sprinkler',
      sprinkler_max_spacing_m,
      params.metersPerPixel
    )
  );
  issues.push(
    ...findOverspacedPairs(
      devices,
      'smoke_detector',
      smoke_max_spacing_m,
      params.metersPerPixel
    )
  );

  const sprUnc = findUncoveredSamples(
    params.zones,
    devices,
    'sprinkler',
    sprinkler_max_spacing_m,
    params.metersPerPixel
  );
  const smkUnc = findUncoveredSamples(
    params.zones,
    devices,
    'smoke_detector',
    smoke_max_spacing_m,
    params.metersPerPixel
  );
  issues.push(...sprUnc.issues, ...smkUnc.issues);

  const spk = devices.filter((d) => d.kind === 'sprinkler').length;
  const sd = devices.filter((d) => d.kind === 'smoke_detector').length;
  const mcp = devices.filter((d) => d.kind === 'manual_call_point').length;

  return {
    devices,
    hazard_class,
    sprinkler_max_spacing_m,
    smoke_max_spacing_m,
    issues,
    uncovered_samples: [...sprUnc.samples, ...smkUnc.samples].slice(0, 100),
    summary_ar: `أجهزة مكتشفة نصيًا: مرشات ${spk} · كواشف ${sd} · MCP ${mcp} · ملاحظات تغطية ${issues.length} (تصنيف خطر تقريبي: ${hazard_class})`,
    summary_en: `Text-detected devices: sprinklers ${spk} · smoke ${sd} · MCP ${mcp} · coverage notes ${issues.length} (approx hazard: ${hazard_class})`,
  };
}

export function zoneNeedsSpecialSuppression(c?: ZoneClassification | null): boolean {
  return c === 'electrical_room' || c === 'server_room';
}
