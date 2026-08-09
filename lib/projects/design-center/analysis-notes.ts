import type {
  DesignAnalysisStep,
  DesignBuildingModel,
} from '@/lib/projects/design-center/types';

export type AnalysisCitationView = {
  documentTitle: string;
  codeReference: string;
  paragraph: string;
  confidence?: number;
};

export type AnalysisNotesView = {
  summary: string | null;
  observations: string[];
  citations: AnalysisCitationView[];
  applicableCodes: string[];
  spaceNames: string[];
  drawingsCount: number;
};

const CAD_STEP_IDS = new Set([
  'detect_rooms',
  'detect_walls',
  'ceiling_analysis',
  'mep_coordination',
]);

type AnalysisRaw = {
  note_ar?: string;
  note_en?: string;
  observations_ar?: string[];
  observations_en?: string[];
  knowledge_citations?: Array<{
    documentTitle?: string;
    codeReference?: string;
    paragraph?: string;
    confidence?: number;
  }>;
  applicable_codes?: string[];
  project_references?: string[];
  drawings_count?: number;
};

function asRaw(result: DesignBuildingModel | null | undefined): AnalysisRaw {
  const raw = result?.raw;
  if (!raw || typeof raw !== 'object') return {};
  return raw as AnalysisRaw;
}

function fallbackObservationsFromSteps(
  steps: DesignAnalysisStep[] | undefined,
  preferAr: boolean
): string[] {
  if (!steps?.length) return [];
  const lines: string[] = [];
  const unavailable = steps.filter(
    (s) => s.status === 'unavailable' || s.status === 'not_available'
  );
  const needsInput = steps.filter((s) => s.status === 'needs_engineer_review');
  const cad = unavailable.filter((s) => CAD_STEP_IDS.has(s.id));
  const dataGaps = [...unavailable.filter((s) => !CAD_STEP_IDS.has(s.id)), ...needsInput];

  if (cad.length) {
    lines.push(
      preferAr
        ? 'محرك تحليل CAD غير متاح حاليًا — ارفع/حدّث المخطط يدوياً.'
        : 'CAD analysis engine is not available — upload/update the drawing manually.'
    );
  }
  for (const s of dataGaps) {
    lines.push(
      preferAr
        ? `${s.label_ar}: ${s.status === 'needs_engineer_review' ? 'يحتاج إدخال المهندس' : 'غير متاح'} — أكمل الحقل ثم أعد التحليل.`
        : `${s.label_en}: ${s.status === 'needs_engineer_review' ? 'Needs Engineer Input' : 'Not Available'} — fill the field and re-run analysis.`
    );
  }
  return lines;
}

/** Pull human-readable analysis notes/citations from a completed analysis result. */
export function extractAnalysisNotes(
  result: DesignBuildingModel | null | undefined,
  preferAr: boolean,
  steps?: DesignAnalysisStep[]
): AnalysisNotesView {
  const raw = asRaw(result);
  const summary = (preferAr ? raw.note_ar : raw.note_en) || raw.note_ar || raw.note_en || null;
  let observations = preferAr
    ? Array.isArray(raw.observations_ar)
      ? raw.observations_ar
      : []
    : Array.isArray(raw.observations_en)
      ? raw.observations_en
      : Array.isArray(raw.observations_ar)
        ? raw.observations_ar
        : [];

  observations = observations.map((o) => String(o).trim()).filter(Boolean);
  if (!observations.length) {
    observations = fallbackObservationsFromSteps(steps, preferAr);
  }

  const citations: AnalysisCitationView[] = Array.isArray(raw.knowledge_citations)
    ? raw.knowledge_citations
        .map((c) => ({
          documentTitle: String(c.documentTitle || '').trim(),
          codeReference: String(c.codeReference || '').trim(),
          paragraph: String(c.paragraph || '').trim(),
          confidence: typeof c.confidence === 'number' ? c.confidence : undefined,
        }))
        .filter((c) => c.documentTitle || c.paragraph || c.codeReference)
    : [];

  const spaceNames = Array.isArray(result?.space_names)
    ? result!.space_names!.map((s) => String(s).trim()).filter(Boolean)
    : [];

  return {
    summary,
    observations,
    citations,
    applicableCodes: Array.isArray(raw.project_references)
      ? raw.project_references.map((c) => String(c).trim()).filter(Boolean)
      : Array.isArray(raw.applicable_codes)
        ? raw.applicable_codes.map((c) => String(c).trim()).filter(Boolean)
        : [],
    spaceNames,
    drawingsCount: typeof raw.drawings_count === 'number' ? raw.drawings_count : 0,
  };
}

export function jobStatusLabel(status: string | undefined, preferAr: boolean): string {
  switch (status) {
    case 'completed':
      return preferAr ? 'مكتمل' : 'completed';
    case 'unavailable':
    case 'not_available':
      return preferAr ? 'غير متاح' : 'not_available';
    case 'needs_engineer_review':
      return preferAr ? 'يحتاج مراجعة المهندس' : 'needs_engineer_review';
    case 'failed':
      return preferAr ? 'فشل' : 'failed';
    case 'pending':
      return preferAr ? 'معلّق' : 'pending';
    case 'running':
    case 'queued':
    case 'generating':
      return preferAr ? 'جارٍ' : status;
    case 'idle':
      return preferAr ? 'idle' : 'idle';
    default:
      return status || (preferAr ? '—' : '—');
  }
}
