import { buildRemediationCases, observationRefKey } from '@/lib/projects/field-visit-remediation';
import type {
  FieldVisitEvidence,
  FieldVisitObservationRef,
  FieldVisitReport,
  ProjectEngineeringData,
  SupervisionReport,
  TechnicalNotesReport,
} from '@/lib/types/project-reports';
import type { ReportPdfSnapshot } from '@/lib/types/report-pdf-snapshot';

export type TraceabilityDueState = 'not_set' | 'upcoming' | 'overdue' | 'verified';
export type TraceabilityVerificationState = 'verified' | 'pending';

export type Stage5TraceabilitySnapshot = Pick<
  ReportPdfSnapshot,
  'id' | 'kind' | 'visit_number' | 'report_date' | 'title_ar' | 'fileName' | 'sizeBytes' | 'mimeType' | 'storageBucket' | 'storagePath' | 'dataUrl' | 'created_at'
> & {
  storageAvailable: boolean;
};

export type Stage5TraceabilityItem = {
  key: string;
  observationRef: FieldVisitObservationRef;
  visitNumber: number;
  visitDate: string | null;
  firstVisitNumber: number;
  firstVisitDate: string | null;
  firstVisitLocation: string | null;
  latestFollowUp: FieldVisitObservationRef | null;
  followUpCount: number;
  /** All visits in the explicit root → follow-up chain, for read-only filtering. */
  chainVisitNumbers: number[];
  currentStatus: string;
  severity: string;
  responsibleParty: string;
  dueDate: string | null;
  dueState: TraceabilityDueState;
  verificationState: TraceabilityVerificationState;
  resolvedAt: string | null;
  verifiedAt: string | null;
  verifiedBy: string | null;
  beforeEvidenceCount: number;
  afterEvidenceCount: number;
  generalEvidenceCount: number;
  selectedEvidenceCount: number;
  excludedEvidenceCount: number;
  supervisionTaskIds: string[];
  technicalDeficiencyIds: string[];
  pdfSnapshots: Stage5TraceabilitySnapshot[];
  observationDescription: string;
  observationLocation: string;
  requiredAction: string;
};

export type Stage5TraceabilityVisitSummary = {
  visitNumber: number;
  visitDate: string | null;
  location: string | null;
  observationCount: number;
  evidenceCount: number;
  pdfSnapshots: Stage5TraceabilitySnapshot[];
};

export type Stage5TraceabilityWorkspace = {
  items: Stage5TraceabilityItem[];
  visitSummaries: Stage5TraceabilityVisitSummary[];
  supervisionPdfSnapshots: Stage5TraceabilitySnapshot[];
  unassignedPdfSnapshots: Stage5TraceabilitySnapshot[];
};

export type DeriveStage5TraceabilityParams = {
  fieldVisits?: FieldVisitReport[];
  supervision?: SupervisionReport | null;
  technicalNotes?: TechnicalNotesReport | null;
  reportPdfArchive?: ReportPdfSnapshot[];
  /** ISO date (YYYY-MM-DD) used only to classify due-state deterministically in tests and UI. */
  today?: string;
};

function stableSnapshotKey(snapshot: ReportPdfSnapshot): string {
  return snapshot.id || `${snapshot.kind}:${snapshot.visit_number ?? 'project'}:${snapshot.fileName}:${snapshot.created_at}`;
}

function toSnapshot(snapshot: ReportPdfSnapshot): Stage5TraceabilitySnapshot {
  return {
    id: snapshot.id,
    kind: snapshot.kind,
    visit_number: snapshot.visit_number ?? null,
    report_date: snapshot.report_date ?? null,
    title_ar: snapshot.title_ar,
    fileName: snapshot.fileName,
    sizeBytes: snapshot.sizeBytes,
    mimeType: snapshot.mimeType,
    storageBucket: snapshot.storageBucket ?? null,
    storagePath: snapshot.storagePath ?? null,
    dataUrl: snapshot.dataUrl ?? null,
    created_at: snapshot.created_at,
    storageAvailable: Boolean(snapshot.storagePath || snapshot.dataUrl),
  };
}

function uniqueSnapshots(snapshots: ReportPdfSnapshot[]): Stage5TraceabilitySnapshot[] {
  const byKey = new Map<string, ReportPdfSnapshot>();
  for (const snapshot of snapshots) {
    if (!snapshot || typeof snapshot !== 'object') continue;
    byKey.set(stableSnapshotKey(snapshot), snapshot);
  }
  return [...byKey.values()]
    .slice()
    .sort((left, right) => left.created_at.localeCompare(right.created_at) || stableSnapshotKey(left).localeCompare(stableSnapshotKey(right)))
    .map(toSnapshot);
}

function visitSnapshots(visit: FieldVisitReport, archive: ReportPdfSnapshot[]): ReportPdfSnapshot[] {
  const attached = [
    ...(visit.pdf_snapshots || []),
    ...(visit.latest_pdf ? [visit.latest_pdf] : []),
  ];
  const archived = archive.filter(
    (snapshot) => snapshot.kind === 'field_visit' && snapshot.visit_number === visit.visit_number
  );
  return [...attached, ...archived];
}

function dueState(params: { dueDate: string | null; status: string; today: string }): TraceabilityDueState {
  if (params.status === 'verified') return 'verified';
  if (!params.dueDate) return 'not_set';
  return params.dueDate < params.today ? 'overdue' : 'upcoming';
}

function evidenceCounters(evidence: FieldVisitEvidence[]) {
  const beforeEvidenceCount = evidence.filter((entry) => entry.timing === 'before').length;
  const afterEvidenceCount = evidence.filter((entry) => entry.timing === 'after').length;
  const generalEvidenceCount = evidence.filter((entry) => entry.timing === 'general').length;
  const selectedEvidenceCount = evidence.filter((entry) => entry.include_in_visit_pdf).length;
  return {
    beforeEvidenceCount,
    afterEvidenceCount,
    generalEvidenceCount,
    selectedEvidenceCount,
    excludedEvidenceCount: evidence.length - selectedEvidenceCount,
  };
}

/**
 * Current-state derived traceability only.
 *
 * This function reads canonical Stage 5 data, reuses the remediation-chain helper,
 * and returns a deterministic projection. It never persists a value, resolves a
 * storage URL, changes a lifecycle status, or claims immutable event history.
 */
export function deriveStage5Traceability(
  params: DeriveStage5TraceabilityParams
): Stage5TraceabilityWorkspace {
  const fieldVisits = [...(params.fieldVisits || [])].sort(
    (left, right) => left.visit_number - right.visit_number
  );
  const supervision: SupervisionReport = params.supervision || { status: 'مسودة', tasks: [], months: [] };
  const technicalNotes: TechnicalNotesReport = params.technicalNotes || { status: 'مسودة', deficiencies: [] };
  const archive = [...(params.reportPdfArchive || [])];
  const today = params.today || new Date().toISOString().slice(0, 10);

  const supervisionSnapshots = uniqueSnapshots([
    ...(supervision.pdf_snapshots || []),
    ...(supervision.latest_pdf ? [supervision.latest_pdf] : []),
    ...archive.filter((snapshot) => snapshot.kind === 'supervision'),
  ]);
  const summaries = fieldVisits.map((visit) => ({
    visitNumber: visit.visit_number,
    visitDate: visit.visit_date || null,
    location: visit.location || null,
    observationCount: (visit.observations || []).length,
    evidenceCount: (visit.evidence || []).length,
    pdfSnapshots: uniqueSnapshots(visitSnapshots(visit, archive)),
  }));
  const assignedSnapshotKeys = new Set<string>();
  for (const summary of summaries) {
    for (const snapshot of summary.pdfSnapshots) {
      assignedSnapshotKeys.add(stableSnapshotKey(snapshot));
    }
  }
  for (const snapshot of supervisionSnapshots) {
    assignedSnapshotKeys.add(stableSnapshotKey(snapshot));
  }

  const items = buildRemediationCases({
    visits: fieldVisits,
    supervision,
    technicalNotes,
  }).map((remediationCase) => {
    const chain = [remediationCase.root, ...remediationCase.followUps];
    const current = remediationCase.current;
    const relatedVisitNumbers = new Set(chain.map((item) => item.visit.visit_number));
    const relatedVisitSnapshots = fieldVisits.flatMap((visit) =>
      relatedVisitNumbers.has(visit.visit_number) ? visitSnapshots(visit, archive) : []
    );
    const currentObservation = current.observation;
    const verificationState: TraceabilityVerificationState = currentObservation.status === 'verified' ? 'verified' : 'pending';
    const counters = evidenceCounters(remediationCase.evidence);
    const root = remediationCase.root;

    return {
      key: observationRefKey(root.ref),
      observationRef: { ...root.ref },
      visitNumber: current.ref.visit_number,
      visitDate: current.visit.visit_date || null,
      firstVisitNumber: root.ref.visit_number,
      firstVisitDate: root.visit.visit_date || null,
      firstVisitLocation: root.visit.location || null,
      latestFollowUp:
        remediationCase.followUps.length > 0 ? { ...current.ref } : null,
      followUpCount: remediationCase.followUps.length,
      chainVisitNumbers: [...new Set(chain.map((item) => item.ref.visit_number))].sort((left, right) => left - right),
      currentStatus: currentObservation.status,
      severity: root.observation.severity,
      responsibleParty: currentObservation.responsible_party || '',
      dueDate: currentObservation.due_date || null,
      dueState: dueState({ dueDate: currentObservation.due_date || null, status: currentObservation.status, today }),
      verificationState,
      resolvedAt: currentObservation.resolved_at || null,
      verifiedAt: currentObservation.verified_at || null,
      verifiedBy: currentObservation.verified_by || null,
      ...counters,
      supervisionTaskIds: [...remediationCase.linkedSupervisionTaskIds].sort(),
      technicalDeficiencyIds: remediationCase.linkedDeficiencies.map((entry) => entry.id).sort(),
      pdfSnapshots: uniqueSnapshots([...relatedVisitSnapshots, ...supervisionSnapshots]),
      observationDescription: root.observation.description || '',
      observationLocation: root.observation.location || '',
      requiredAction: root.observation.required_action || '',
    };
  });

  const unassignedPdfSnapshots = uniqueSnapshots(
    archive.filter((snapshot) => !assignedSnapshotKeys.has(stableSnapshotKey(snapshot)))
  );

  return {
    items,
    visitSummaries: summaries,
    supervisionPdfSnapshots: supervisionSnapshots,
    unassignedPdfSnapshots,
  };
}

/** Convenience adapter for the canonical in-memory project model. */
export function deriveStage5TraceabilityFromProject(
  data: Pick<ProjectEngineeringData, 'field_visits' | 'supervision_report' | 'technical_notes' | 'report_pdf_archive'>,
  options?: Pick<DeriveStage5TraceabilityParams, 'today'>
): Stage5TraceabilityWorkspace {
  return deriveStage5Traceability({
    fieldVisits: data.field_visits,
    supervision: data.supervision_report,
    technicalNotes: data.technical_notes,
    reportPdfArchive: data.report_pdf_archive,
    today: options?.today,
  });
}
