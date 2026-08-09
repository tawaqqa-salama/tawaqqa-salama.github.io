/**
 * Phase 2 — egress / travel distance engine (local, heuristic).
 * Conservative estimate: longest diagonal within a room polygon as max travel
 * distance toward the nearest detected exit (or within-room worst case).
 *
 * SBC 801 limits used here are common published travel-distance caps for many
 * occupancies (45 m without sprinklers / 60 m with). Engineer must verify the
 * exact occupancy table in the authority-adopted edition.
 */

import type {
  DetectedZone,
  EgressComplianceStatus,
  EgressZoneAssessment,
  Point2D,
  TextAnchor,
  TravelDistanceLimit,
} from '@/lib/projects/design-center/vision/types';

export function longestDiagonal(polygon: Point2D[]): {
  p1: Point2D;
  p2: Point2D;
  length_px: number;
} | null {
  if (!polygon || polygon.length < 2) return null;
  let best = { p1: polygon[0], p2: polygon[1], length_px: 0 };
  for (let i = 0; i < polygon.length; i++) {
    for (let j = i + 1; j < polygon.length; j++) {
      const dx = polygon[j].x - polygon[i].x;
      const dy = polygon[j].y - polygon[i].y;
      const len = Math.hypot(dx, dy);
      if (len > best.length_px) {
        best = { p1: polygon[i], p2: polygon[j], length_px: len };
      }
    }
  }
  return best.length_px > 0 ? best : null;
}

export function distancePx(a: Point2D, b: Point2D): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/** SBC 801 typical common-path / travel distance caps (engineer-verify edition) */
export function sbc801TravelDistanceLimit(params: {
  hasSprinkler: boolean;
  occupancy?: string | null;
}): TravelDistanceLimit {
  const occ = String(params.occupancy || '').toLowerCase();
  // Slightly tighter for assembly / high-density public; still documented as heuristic
  const assembly = /assembly|تجمع|mosque|theatre|mall|mercantile|تجاري/.test(occ);
  const without = assembly ? 45 : 45;
  const withSp = assembly ? 60 : 60;
  return {
    code: 'SBC-801',
    max_m_without_sprinkler: without,
    max_m_with_sprinkler: withSp,
    applied_max_m: params.hasSprinkler ? withSp : without,
    has_sprinkler: params.hasSprinkler,
    note_ar:
      'حد مسافة الانتقال التقريبي وفق SBC 801 الشائع (45م بدون مرشات / 60م مع مرشات) — يتحقق المهندس من جدول الإشغال المعتمد',
    note_en:
      'Approximate SBC 801 travel-distance cap (45 m without / 60 m with sprinklers) — engineer must verify the adopted occupancy table',
  };
}

export function extractExitPoints(
  anchors: TextAnchor[],
  pageW: number,
  pageH: number
): Point2D[] {
  const exits = anchors
    .filter((a) => /\b(exit|مخرج|طوارئ|emergency)\b/i.test(a.text))
    .map((a) => ({ x: a.x, y: a.y }));
  if (exits.length) return exits;
  // No labeled exits — empty; assessments will use within-room diagonal only
  void pageW;
  void pageH;
  return [];
}

function nearestExit(
  from: Point2D,
  exits: Point2D[]
): { point: Point2D; dist_px: number } | null {
  if (!exits.length) return null;
  let best = { point: exits[0], dist_px: distancePx(from, exits[0]) };
  for (let i = 1; i < exits.length; i++) {
    const d = distancePx(from, exits[i]);
    if (d < best.dist_px) best = { point: exits[i], dist_px: d };
  }
  return best;
}

export function assessZoneTravelDistance(
  zone: DetectedZone,
  exits: Point2D[],
  metersPerPixel: number | null,
  limit: TravelDistanceLimit
): EgressZoneAssessment {
  const diag = longestDiagonal(zone.polygon);
  const centroid = {
    x: zone.bounds.x + zone.bounds.w / 2,
    y: zone.bounds.y + zone.bounds.h / 2,
  };
  const exitHit = nearestExit(centroid, exits);

  // Conservative: max(longest diagonal, centroid→nearest exit)
  let travel_px = diag?.length_px ?? 0;
  let vector = diag
    ? { from: diag.p1, to: diag.p2 }
    : { from: centroid, to: centroid };
  let method: EgressZoneAssessment['method'] = 'longest_diagonal';

  if (exitHit) {
    if (exitHit.dist_px > travel_px) {
      travel_px = exitHit.dist_px;
      vector = { from: centroid, to: exitHit.point };
      method = 'centroid_to_exit';
    } else {
      method = 'longest_diagonal_vs_exit';
    }
  }

  const travel_m =
    metersPerPixel != null && metersPerPixel > 0
      ? Math.round(travel_px * metersPerPixel * 100) / 100
      : null;

  let status: EgressComplianceStatus = 'needs_engineer_review';
  if (travel_m == null) {
    status = 'scale_unknown';
  } else if (travel_m <= limit.applied_max_m) {
    status = 'within_limit';
  } else {
    status = 'exceeds_limit';
  }

  return {
    zone_id: zone.id,
    zone_label: zone.label,
    travel_distance_px: travel_px,
    travel_distance_m: travel_m,
    limit_m: limit.applied_max_m,
    status,
    method,
    vector,
    diagonal: diag
      ? { from: diag.p1, to: diag.p2, length_px: diag.length_px }
      : null,
    nearest_exit: exitHit
      ? { x: exitHit.point.x, y: exitHit.point.y, dist_px: exitHit.dist_px }
      : null,
    note_ar:
      travel_m == null
        ? 'مسافة الانتقال غير محسوبة بالمتر — المقياس غير معروف (Needs Engineer Input)'
        : status === 'exceeds_limit'
          ? `مسافة انتقال تقديرية ${travel_m} م تتجاوز الحد ${limit.applied_max_m} م — مراجعة المهندس`
          : `مسافة انتقال تقديرية ${travel_m} م ضمن حد ${limit.applied_max_m} م (تقديري)`,
    note_en:
      travel_m == null
        ? 'Travel distance not computed in meters — scale unknown (Needs Engineer Input)'
        : status === 'exceeds_limit'
          ? `Estimated travel ${travel_m} m exceeds ${limit.applied_max_m} m limit — engineer review`
          : `Estimated travel ${travel_m} m within ${limit.applied_max_m} m limit (approximate)`,
  };
}

export function runEgressAnalysis(params: {
  zones: DetectedZone[];
  textAnchors: TextAnchor[];
  width_px: number;
  height_px: number;
  metersPerPixel: number | null;
  hasSprinkler: boolean;
  occupancy?: string | null;
}): {
  limit: TravelDistanceLimit;
  exits: Point2D[];
  assessments: EgressZoneAssessment[];
  max_travel_m: number | null;
  overall_status: EgressComplianceStatus;
} {
  const limit = sbc801TravelDistanceLimit({
    hasSprinkler: params.hasSprinkler,
    occupancy: params.occupancy,
  });
  const exits = extractExitPoints(
    params.textAnchors,
    params.width_px,
    params.height_px
  );
  const assessments = params.zones.map((z) =>
    assessZoneTravelDistance(z, exits, params.metersPerPixel, limit)
  );

  const measured = assessments
    .map((a) => a.travel_distance_m)
    .filter((v): v is number => v != null);
  const max_travel_m = measured.length ? Math.max(...measured) : null;

  let overall_status: EgressComplianceStatus = 'needs_engineer_review';
  if (!params.zones.length) {
    overall_status = 'needs_engineer_review';
  } else if (assessments.some((a) => a.status === 'scale_unknown')) {
    overall_status = 'scale_unknown';
  } else if (assessments.some((a) => a.status === 'exceeds_limit')) {
    overall_status = 'exceeds_limit';
  } else if (assessments.every((a) => a.status === 'within_limit')) {
    overall_status = 'within_limit';
  }

  return { limit, exits, assessments, max_travel_m, overall_status };
}
