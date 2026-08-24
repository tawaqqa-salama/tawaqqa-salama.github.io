type EgressMetricLike = { label?: string | null; value?: string | number | null; note?: string | null };

function compact(value: unknown): string {
  return String(value ?? '').trim();
}

/**
 * One priority rule for both report templates:
 * an explicit engineering design decision wins; otherwise use the first approved/
 * suggested space classification already present in the canonical Data Bridge.
 */
export function resolvePreferredHazard(
  engineeringHazard: unknown,
  spaceHazards: Iterable<unknown>
): string {
  const explicit = compact(engineeringHazard);
  if (explicit) return explicit;
  for (const hazard of spaceHazards) {
    const value = compact(hazard);
    if (value) return value;
  }
  return '';
}

/** Design egress metrics have one authoritative ordering in both templates. */
export function resolvePreferredEgressMetrics(metrics: readonly EgressMetricLike[] | null | undefined) {
  return (metrics || [])
    .map((metric) => ({
      label: compact(metric.label),
      value: compact(metric.value),
      note: compact(metric.note),
    }))
    .filter((metric) => metric.label && metric.value);
}
