import type { SystemStandardsSnapshot } from '@/lib/projects/design-center/standards/types';

type SnapshotRef = SystemStandardsSnapshot['primary'][number];

/**
 * Build human-readable observation lines for Design Center cards.
 * Prefer engine `warnings`; fall back to per-code verification status so
 * older snapshots still show something when the count is non-zero.
 */
export function standardsObservationLines(
  std: Pick<
    SystemStandardsSnapshot,
    'warnings' | 'primary' | 'saudiCode' | 'related' | 'conditional'
  >,
  preferAr: boolean
): string[] {
  const lines: string[] = [];
  const seen = new Set<string>();
  const push = (raw: string | null | undefined) => {
    const t = (raw || '').trim();
    if (!t || seen.has(t)) return;
    seen.add(t);
    lines.push(t);
  };

  for (const w of std.warnings || []) push(w);

  const tiers: SnapshotRef[] = [
    ...std.primary,
    ...std.saudiCode,
    ...std.related,
    ...std.conditional,
  ];
  for (const r of tiers) {
    if (r.status === 'not_verified' || r.status === 'needs_engineer_review') {
      push(
        preferAr
          ? `${r.code}: لم يتم التحقق من هذا المرجع — يحتاج مراجعة المهندس`
          : `${r.code}: not verified — Needs Engineer Review`
      );
    }
    if (
      r.status === 'edition_not_verified' ||
      /edition not verified/i.test(r.editionLabel || '')
    ) {
      push(
        preferAr
          ? `${r.code}: الإصدار غير موثّق (Edition not verified)`
          : `${r.code}: Edition not verified`
      );
    }
  }

  return lines;
}

export function reviewStatusLabel(
  status: string | undefined,
  preferAr: boolean
): string {
  if (status === 'partially_verified') {
    return preferAr ? 'تحقق جزئي' : 'Partially verified';
  }
  if (status === 'not_verified') {
    return preferAr ? 'غير موثّق' : 'Not Verified';
  }
  return preferAr ? 'يحتاج مراجعة المهندس' : 'Needs Engineer Review';
}
