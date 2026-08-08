/**
 * CODE / STANDARD APPLICABILITY ENGINE
 *
 * resolveApplicableStandards(projectContext, designSystem)
 * — never invents codes
 * — never marks Applicable unless conditions pass
 * — separates Primary / Saudi Code / Related / Conditional
 */

import { getStandardsCatalog } from '@/lib/projects/design-center/standards/catalog';
import type {
  ProjectDesignStandardsContext,
  ResolvedStandard,
  StandardCondition,
  StandardReference,
  StandardsApplicabilityResult,
  SystemStandardsSnapshot,
} from '@/lib/projects/design-center/standards/types';
import type { FireSystemKind } from '@/lib/projects/design-center/types';

function editionLabel(ref: StandardReference): string {
  if (ref.edition && ref.edition.trim()) return ref.edition;
  return 'Edition not verified';
}

function conditionHolds(
  condition: StandardCondition,
  ctx: ProjectDesignStandardsContext,
  designSystem: FireSystemKind
): boolean {
  switch (condition.type) {
    case 'always':
      return true;
    case 'system_is':
      return condition.systems.includes(designSystem);
    case 'project_has_system':
      return condition.systems.some(
        (s) =>
          ctx.selectedSystems.includes(s) ||
          (s === 'sprinkler' && ctx.hasSprinkler) ||
          (s === 'fire_alarm' && ctx.hasFireAlarm) ||
          (s === 'hose_reel' && ctx.hasStandpipe)
      );
    case 'has_fire_pump':
      return ctx.hasFirePump;
    case 'has_standpipe':
      return ctx.hasStandpipe;
    case 'has_underground_main':
      return ctx.hasUndergroundMain;
    case 'min_floors':
      return ctx.floorsCount != null && ctx.floorsCount >= condition.value;
    case 'min_height_m':
      return ctx.buildingHeightM != null && ctx.buildingHeightM >= condition.value;
    case 'min_area_m2':
      return ctx.buildingAreaM2 != null && ctx.buildingAreaM2 >= condition.value;
    case 'kitchen_activity':
      return ctx.kitchenActivity;
    case 'high_rise':
      return ctx.highRise;
    case 'occupancy_matches': {
      const hay = `${ctx.occupancy || ''} ${ctx.activityType || ''} ${ctx.buildingUse || ''}`.toLowerCase();
      return condition.patterns.some((p) => hay.includes(p.toLowerCase()));
    }
    default:
      return false;
  }
}

function allConditionsHold(
  ref: StandardReference,
  ctx: ProjectDesignStandardsContext,
  designSystem: FireSystemKind
): boolean {
  if (!ref.conditions.length) return false;
  return ref.conditions.every((c) => conditionHolds(c, ctx, designSystem));
}

function relevantToSystem(ref: StandardReference, designSystem: FireSystemKind): boolean {
  if (ref.applicableSystems.includes(designSystem)) return true;
  if (ref.relatedSystems?.includes(designSystem)) return true;
  return false;
}

function whyFor(
  ref: StandardReference,
  ctx: ProjectDesignStandardsContext,
  designSystem: FireSystemKind,
  met: boolean
): { ar: string; en: string } {
  if (!met) {
    return {
      ar: `غير منطبق على نظام ${designSystem} في سياق المشروع الحالي.`,
      en: `Not applicable to ${designSystem} for the current project context.`,
    };
  }
  const bitsAr: string[] = [];
  const bitsEn: string[] = [];
  if (ref.tier === 'primary') {
    bitsAr.push(`مرجع أساسي لنظام ${designSystem}`);
    bitsEn.push(`Primary standard for ${designSystem}`);
  }
  if (ref.tier === 'saudi_code' || ref.jurisdiction === 'saudi') {
    bitsAr.push('متطلب كود سعودي (SBC)');
    bitsEn.push('Saudi code requirement (SBC)');
  }
  if (ref.conditions.some((c) => c.type === 'has_fire_pump') && ctx.hasFirePump) {
    bitsAr.push('وُجدت مضخة حريق في سياق المشروع');
    bitsEn.push('Fire pump present in project context');
  }
  if (ref.conditions.some((c) => c.type === 'has_standpipe') && ctx.hasStandpipe) {
    bitsAr.push('وُجد Standpipe / Hose Reel');
    bitsEn.push('Standpipe / hose reel present');
  }
  if (ref.conditions.some((c) => c.type === 'kitchen_activity') && ctx.kitchenActivity) {
    bitsAr.push('نشاط المشروع يتضمن مطبخ/مطعم');
    bitsEn.push('Project activity includes kitchen/restaurant');
  }
  if (ctx.occupancy) {
    bitsAr.push(`إشغال: ${ctx.occupancy}`);
    bitsEn.push(`Occupancy: ${ctx.occupancy}`);
  }
  if (ctx.activityType) {
    bitsAr.push(`نشاط: ${ctx.activityType}`);
    bitsEn.push(`Activity: ${ctx.activityType}`);
  }
  return {
    ar: bitsAr.join(' · ') || 'ينطبق وفق قواعد الكتالوج وسياق المشروع.',
    en: bitsEn.join(' · ') || 'Applicable per catalog rules and project context.',
  };
}

function toView(r: ResolvedStandard) {
  return {
    code: r.reference.code,
    title: r.reference.title,
    title_ar: r.reference.title_ar,
    editionLabel: r.editionLabel,
    source: r.reference.source,
    status: r.reference.status,
    why_ar: r.why_ar,
    why_en: r.why_en,
  };
}

function dedupeByCodeKeepBest(rows: ResolvedStandard[]): ResolvedStandard[] {
  const map = new Map<string, ResolvedStandard>();
  for (const row of rows) {
    const key = `${row.tier}:${row.reference.code}`;
    const prev = map.get(key);
    if (!prev || row.reference.priority < prev.reference.priority) {
      map.set(key, row);
    }
  }
  return Array.from(map.values()).sort((a, b) => a.reference.priority - b.reference.priority);
}

/**
 * Core API — resolve standards for one design system against project context.
 */
export function resolveApplicableStandards(
  projectContext: ProjectDesignStandardsContext,
  designSystem: FireSystemKind
): StandardsApplicabilityResult {
  const catalog = getStandardsCatalog();
  const applicable: ResolvedStandard[] = [];
  const conditional: ResolvedStandard[] = [];
  const notApplicable: ResolvedStandard[] = [];
  const warnings: string[] = [];

  for (const ref of catalog) {
    if (!relevantToSystem(ref, designSystem)) {
      // Catalog entry for another system entirely — audit only
      if (ref.applicableSystems.length && !ref.applicableSystems.includes(designSystem)) {
        const why = whyFor(ref, projectContext, designSystem, false);
        notApplicable.push({
          reference: ref,
          tier: 'not_applicable',
          why_ar: why.ar,
          why_en: why.en,
          editionLabel: editionLabel(ref),
          conditionMet: false,
        });
      }
      continue;
    }

    const met = allConditionsHold(ref, projectContext, designSystem);
    const why = whyFor(ref, projectContext, designSystem, met);

    if (ref.status === 'not_verified') {
      warnings.push(
        `${ref.code}: لم يتم التحقق من هذا المرجع في مكتبة EKB — Needs Engineer Review`
      );
    }
    if (!ref.edition) {
      warnings.push(`${ref.code}: Edition not verified`);
    }

    const resolved: ResolvedStandard = {
      reference: ref,
      tier: met ? ref.tier : 'not_applicable',
      why_ar: why.ar,
      why_en: why.en,
      editionLabel: editionLabel(ref),
      conditionMet: met,
    };

    if (!met) {
      notApplicable.push(resolved);
      continue;
    }

    if (ref.tier === 'conditional') {
      conditional.push(resolved);
    } else {
      applicable.push(resolved);
    }
  }

  const primary = dedupeByCodeKeepBest(applicable.filter((r) => r.tier === 'primary'));
  const saudiCode = dedupeByCodeKeepBest(applicable.filter((r) => r.tier === 'saudi_code'));
  const related = dedupeByCodeKeepBest(applicable.filter((r) => r.tier === 'related'));
  const primaryCodes = new Set(primary.map((r) => r.reference.code));
  const conditionalDeduped = dedupeByCodeKeepBest(conditional).filter(
    (r) => !primaryCodes.has(r.reference.code)
  );

  // Guard: never let other-system primaries leak into this system's applicable set
  for (const row of [...primary, ...related, ...conditionalDeduped]) {
    if (
      row.reference.tier === 'primary' &&
      !row.reference.applicableSystems.includes(designSystem)
    ) {
      warnings.push(`Blocked leak of ${row.reference.code} into ${designSystem}`);
    }
  }

  const shown = [...primary, ...saudiCode, ...related, ...conditionalDeduped];
  const verified = shown.filter((r) => r.reference.status === 'verified').length;
  const notes = shown.filter(
    (r) =>
      r.reference.status === 'edition_not_verified' ||
      r.reference.status === 'not_verified' ||
      r.reference.status === 'needs_engineer_review'
  ).length;

  let reviewStatus: StandardsApplicabilityResult['requirementsSummary']['reviewStatus'] =
    'needs_engineer_review';
  if (shown.length === 0) reviewStatus = 'not_verified';
  else if (verified > 0 && notes === 0) reviewStatus = 'partially_verified';
  else reviewStatus = 'needs_engineer_review';

  const whyApplicable_ar = [
    `النظام: ${designSystem}`,
    projectContext.occupancy ? `الإشغال: ${projectContext.occupancy}` : null,
    projectContext.activityType ? `النشاط: ${projectContext.activityType}` : null,
    projectContext.hasFirePump ? 'مضخة حريق: نعم' : null,
    projectContext.hasStandpipe ? 'Standpipe: نعم' : null,
    `${primary.length} أساسي · ${saudiCode.length} SBC · ${related.length} مرتبط · ${conditionalDeduped.length} مشروط`,
  ]
    .filter(Boolean)
    .join(' · ');

  const whyApplicable_en = [
    `System: ${designSystem}`,
    projectContext.occupancy ? `Occupancy: ${projectContext.occupancy}` : null,
    projectContext.activityType ? `Activity: ${projectContext.activityType}` : null,
    projectContext.hasFirePump ? 'Fire pump: yes' : null,
    projectContext.hasStandpipe ? 'Standpipe: yes' : null,
    `${primary.length} primary · ${saudiCode.length} SBC · ${related.length} related · ${conditionalDeduped.length} conditional`,
  ]
    .filter(Boolean)
    .join(' · ');

  return {
    applicable: dedupeByCodeKeepBest(applicable),
    conditional: conditionalDeduped,
    notApplicable: dedupeByCodeKeepBest(notApplicable),
    warnings: Array.from(new Set(warnings)),
    primary,
    saudiCode,
    related,
    whyApplicable_ar,
    whyApplicable_en,
    requirementsSummary: {
      total: shown.length,
      verified,
      notes,
      reviewStatus,
    },
  };
}

export function toSystemStandardsSnapshot(
  designSystem: FireSystemKind,
  result: StandardsApplicabilityResult
): SystemStandardsSnapshot {
  return {
    system: designSystem,
    resolvedAt: new Date().toISOString(),
    primary: result.primary.map(toView),
    saudiCode: result.saudiCode.map(toView),
    related: result.related.map(toView),
    conditional: result.conditional.map(toView),
    warnings: result.warnings,
    whyApplicable_ar: result.whyApplicable_ar,
    whyApplicable_en: result.whyApplicable_en,
    requirementsSummary: result.requirementsSummary,
  };
}

/** Flatten for legacy artifactRefs consumers — structured tiers only, no project-wide dump */
export function snapshotToArtifactRefs(snapshot: SystemStandardsSnapshot): string[] {
  const lines: string[] = [];
  for (const r of snapshot.primary) {
    lines.push(`PRIMARY: ${r.code} · ${r.editionLabel}`);
  }
  for (const r of snapshot.saudiCode) {
    lines.push(`SAUDI CODE: ${r.code} · ${r.editionLabel}`);
  }
  for (const r of snapshot.related) {
    lines.push(`RELATED: ${r.code} · ${r.editionLabel}`);
  }
  for (const r of snapshot.conditional) {
    lines.push(`CONDITIONAL: ${r.code} · ${r.editionLabel}`);
  }
  return lines;
}

/**
 * Filter RAG citations so AI cannot inject unrelated system codes into a card.
 */
export function filterCitationsToApplicableCodes(
  citations: Array<{ codeReference?: string | null; documentTitle: string; paragraph: string }>,
  snapshot: SystemStandardsSnapshot
): string[] {
  const allowed = new Set(
    [...snapshot.primary, ...snapshot.saudiCode, ...snapshot.related, ...snapshot.conditional].map(
      (r) => r.code.toUpperCase().replace(/\s+/g, '-')
    )
  );
  const out: string[] = [];
  for (const c of citations) {
    const raw = (c.codeReference || '').toUpperCase().replace(/\s+/g, '-');
    if (!raw) continue;
    const hit = [...allowed].some((a) => raw.includes(a) || a.includes(raw));
    if (!hit) continue;
    out.push(`${c.documentTitle} (${c.codeReference}): ${c.paragraph.slice(0, 140)}`);
  }
  return out;
}
