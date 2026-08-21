import type {
  FieldVisitEvidence,
  FieldVisitObservation,
  FieldVisitObservationRef,
  FieldVisitReport,
  SupervisionReport,
  TechnicalDeficiency,
  TechnicalNotesReport,
} from '@/lib/types/project-reports';

export type VisitObservationItem = {
  ref: FieldVisitObservationRef;
  visit: FieldVisitReport;
  observation: FieldVisitObservation;
};

export type RemediationCase = {
  root: VisitObservationItem;
  followUps: VisitObservationItem[];
  current: VisitObservationItem;
  evidence: FieldVisitEvidence[];
  beforeEvidenceCount: number;
  afterEvidenceCount: number;
  linkedSupervisionTaskIds: string[];
  linkedDeficiencies: TechnicalDeficiency[];
};

export type StructuredObservationBlockerSeverity = 'high' | 'critical';

/**
 * A B1 blocker is derived from an explicit remediation case, not from an
 * individual photo, supervision link, technical-deficiency link, or a raw UI
 * selection. A high/critical condition remains blocking until the latest valid
 * observation in the chain has an engineer-verified lifecycle state and a
 * recorded remediation timestamp.
 */
export type StructuredObservationBlockerCase = {
  case: RemediationCase;
  severity: StructuredObservationBlockerSeverity;
};

export function observationRefKey(ref: FieldVisitObservationRef): string {
  return `${ref.visit_number}:${ref.observation_id}`;
}

export function sameObservationRef(
  left: FieldVisitObservationRef | null | undefined,
  right: FieldVisitObservationRef | null | undefined
): boolean {
  return Boolean(
    left &&
      right &&
      left.visit_number === right.visit_number &&
      left.observation_id === right.observation_id
  );
}

export function getVisitObservationItems(visits: FieldVisitReport[]): VisitObservationItem[] {
  return (visits || []).flatMap((visit) =>
    (visit.observations || []).map((observation) => ({
      ref: { visit_number: visit.visit_number, observation_id: observation.id },
      visit,
      observation,
    }))
  );
}

/**
 * A valid follow-up always points to an existing observation in a prior visit.
 * This deliberately rejects same-visit, future-visit, and dangling references
 * rather than trying to infer or repair them.
 */
export function isValidFollowUpReference(
  item: VisitObservationItem,
  candidate: FieldVisitObservationRef | null | undefined,
  items: VisitObservationItem[]
): boolean {
  if (!candidate || candidate.visit_number >= item.ref.visit_number) return false;
  return items.some((other) => sameObservationRef(other.ref, candidate));
}

export function observationCanBeVerified(observation: FieldVisitObservation): boolean {
  return observation.status === 'resolved' && Boolean(observation.resolved_at);
}

/** Matches the Phase 5D-1 lifecycle contract without inventing new metadata requirements. */
export function hasEngineerVerifiedRemediation(observation: FieldVisitObservation): boolean {
  return observation.status === 'verified' && Boolean(observation.resolved_at);
}

export function addObservationRefToTask(
  refs: FieldVisitObservationRef[] | null | undefined,
  ref: FieldVisitObservationRef
): FieldVisitObservationRef[] {
  const next = (refs || []).filter((item) => Number.isInteger(item.visit_number) && Boolean(item.observation_id));
  return next.some((item) => sameObservationRef(item, ref)) ? next : [...next, ref];
}

export function removeObservationRefFromTask(
  refs: FieldVisitObservationRef[] | null | undefined,
  ref: FieldVisitObservationRef
): FieldVisitObservationRef[] {
  return (refs || []).filter((item) => !sameObservationRef(item, ref));
}

/**
 * Derives case rows without persisting data, mutating a visit, or resolving any
 * Storage object. The newest explicit follow-up controls the displayed status.
 */
export function buildRemediationCases(params: {
  visits: FieldVisitReport[];
  supervision: SupervisionReport;
  technicalNotes: TechnicalNotesReport;
}): RemediationCase[] {
  const items = getVisitObservationItems(params.visits);
  const byKey = new Map(items.map((item) => [observationRefKey(item.ref), item]));
  const children = new Map<string, VisitObservationItem[]>();

  for (const item of items) {
    const parent = item.observation.follow_up_of;
    if (!isValidFollowUpReference(item, parent, items)) continue;
    const parentKey = observationRefKey(parent!);
    if (!byKey.has(parentKey)) continue;
    const list = children.get(parentKey) || [];
    list.push(item);
    children.set(parentKey, list);
  }

  const childKeys = new Set([...children.values()].flat().map((item) => observationRefKey(item.ref)));
  const roots = items.filter((item) => !childKeys.has(observationRefKey(item.ref)));

  return roots
    .map((root) => {
      const chain: VisitObservationItem[] = [];
      const visited = new Set<string>();
      const collect = (item: VisitObservationItem) => {
        const key = observationRefKey(item.ref);
        if (visited.has(key)) return;
        visited.add(key);
        chain.push(item);
        for (const child of children.get(key) || []) collect(child);
      };
      collect(root);
      chain.sort((a, b) => a.ref.visit_number - b.ref.visit_number || a.observation.id.localeCompare(b.observation.id));
      const current = chain[chain.length - 1] || root;
      const refs = chain.map((item) => item.ref);
      const evidence = chain.flatMap((item) =>
        (item.visit.evidence || []).filter((entry) => entry.observation_id === item.observation.id)
      );
      const linkedSupervisionTaskIds = (params.supervision.tasks || [])
        .filter((task) => (task.related_observation_refs || []).some((ref) => refs.some((candidate) => sameObservationRef(candidate, ref))))
        .map((task) => task.id);
      const linkedDeficiencies = (params.technicalNotes.deficiencies || []).filter((deficiency) =>
        refs.some((candidate) => sameObservationRef(candidate, deficiency.source_visit_ref))
      );

      return {
        root,
        followUps: chain.slice(1),
        current,
        evidence,
        beforeEvidenceCount: evidence.filter((entry) => entry.timing === 'before').length,
        afterEvidenceCount: evidence.filter((entry) => entry.timing === 'after').length,
        linkedSupervisionTaskIds,
        linkedDeficiencies,
      };
    })
    .sort((a, b) => a.root.ref.visit_number - b.root.ref.visit_number || a.root.observation.id.localeCompare(b.root.observation.id));
}

/**
 * B1 gate predicate. Severity is assessed across the root and every valid
 * explicit follow-up, while verification is assessed only from the latest
 * valid follow-up shown by the remediation case. Critical takes precedence
 * when a chain contains both blocking severities.
 */
export function getBlockingStructuredObservationCases(params: {
  visits: FieldVisitReport[];
  supervision: SupervisionReport;
  technicalNotes: TechnicalNotesReport;
}): StructuredObservationBlockerCase[] {
  return buildRemediationCases(params).flatMap((remediationCase) => {
    const chain = [remediationCase.root, ...remediationCase.followUps];
    const severity: StructuredObservationBlockerSeverity | null = chain.some(
      (item) => item.observation.severity === 'critical'
    )
      ? 'critical'
      : chain.some((item) => item.observation.severity === 'high')
        ? 'high'
        : null;

    if (!severity || hasEngineerVerifiedRemediation(remediationCase.current.observation)) {
      return [];
    }

    return [{ case: remediationCase, severity }];
  });
}
