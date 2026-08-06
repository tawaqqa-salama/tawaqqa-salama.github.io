import type { PlanAttachmentFile } from '@/lib/types/project-reports';
import {
  DESIGN_ANALYSIS_STEPS,
  DESIGN_EXPORT_DEFS,
  ENGINEERING_CALC_DEFS,
  FIRE_SYSTEM_DEFS,
  type DesignAnalysisJob,
  type DesignCenterState,
  type DesignDrawingFormat,
  type DesignDrawingSheet,
  type DesignDrawingVersion,
  type DesignExportJob,
  type DesignSystemGeneration,
  type EngineeringCalcResult,
} from '@/lib/projects/design-center/types';

function uid(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function emptyAnalysisSteps() {
  return DESIGN_ANALYSIS_STEPS.map((s) => ({ ...s, status: 'idle' as const }));
}

export function createEmptyAnalysisJob(partial?: Partial<DesignAnalysisJob>): DesignAnalysisJob {
  return {
    id: uid('analysis'),
    status: 'idle',
    progress: 0,
    steps: emptyAnalysisSteps(),
    sourceSheetId: null,
    sourceVersionId: null,
    startedAt: null,
    finishedAt: null,
    error: null,
    error_code: null,
    result: null,
    ...partial,
  };
}

export function emptySystems(): DesignSystemGeneration[] {
  return FIRE_SYSTEM_DEFS.map((d) => ({
    kind: d.kind,
    status: 'idle',
    generatedAt: null,
    designId: null,
    error: null,
    error_code: null,
    artifactRefs: [],
  }));
}

export function emptyCalculations(): EngineeringCalcResult[] {
  return ENGINEERING_CALC_DEFS.map((d) => ({
    kind: d.kind,
    status: 'idle',
    updatedAt: null,
    error: null,
    error_code: null,
    values: null,
  }));
}

export function emptyExports(): DesignExportJob[] {
  return DESIGN_EXPORT_DEFS.map((d) => ({
    kind: d.kind,
    status: 'idle',
    file: null,
    error: null,
    error_code: null,
    updatedAt: null,
  }));
}

export const EMPTY_DESIGN_CENTER: DesignCenterState = {
  status: 'مسودة',
  sheets: [],
  analysis: null,
  systems: emptySystems(),
  calculations: emptyCalculations(),
  compliance: {
    status: 'idle',
    matchPercent: null,
    findings: [],
    recommendations: [],
    standards: ['NFPA', 'SBC'],
    checkedAt: null,
    error: null,
    error_code: null,
  },
  exports: emptyExports(),
  ui: {
    dark_mode: false,
    active_tab: 'drawings',
    compare_version_a: null,
    compare_version_b: null,
    viewer_sheet_id: null,
  },
};

export function mergeDesignCenterDefaults(
  raw?: Partial<DesignCenterState> | null
): DesignCenterState {
  const base = { ...EMPTY_DESIGN_CENTER, ...(raw || {}) };
  const systemsByKind = new Map((base.systems || []).map((s) => [s.kind, s]));
  const calcsByKind = new Map((base.calculations || []).map((c) => [c.kind, c]));
  const exportsByKind = new Map((base.exports || []).map((e) => [e.kind, e]));

  return {
    ...EMPTY_DESIGN_CENTER,
    ...base,
    status: base.status || 'مسودة',
    sheets: Array.isArray(base.sheets) ? base.sheets : [],
    analysis: base.analysis
      ? {
          ...createEmptyAnalysisJob(),
          ...base.analysis,
          steps:
            Array.isArray(base.analysis.steps) && base.analysis.steps.length
              ? base.analysis.steps
              : emptyAnalysisSteps(),
        }
      : null,
    systems: emptySystems().map((s) => ({ ...s, ...(systemsByKind.get(s.kind) || {}) })),
    calculations: emptyCalculations().map((c) => ({
      ...c,
      ...(calcsByKind.get(c.kind) || {}),
    })),
    compliance: {
      ...EMPTY_DESIGN_CENTER.compliance,
      ...(base.compliance || {}),
      findings: Array.isArray(base.compliance?.findings) ? base.compliance!.findings : [],
      recommendations: Array.isArray(base.compliance?.recommendations)
        ? base.compliance!.recommendations
        : [],
      standards: base.compliance?.standards?.length
        ? base.compliance.standards
        : (['NFPA', 'SBC'] as const),
    },
    exports: emptyExports().map((e) => ({ ...e, ...(exportsByKind.get(e.kind) || {}) })),
    ui: { ...EMPTY_DESIGN_CENTER.ui, ...(base.ui || {}) },
  };
}

export function detectDrawingFormat(fileName: string): DesignDrawingFormat {
  const ext = fileName.toLowerCase().split('.').pop() || '';
  if (ext === 'pdf') return 'pdf';
  if (ext === 'dwg') return 'dwg';
  if (ext === 'dxf') return 'dxf';
  if (ext === 'ifc') return 'ifc';
  if (ext === 'rvt' || ext === 'rfa') return 'rvt';
  return 'other';
}

export function addDrawingVersion(
  state: DesignCenterState,
  file: PlanAttachmentFile,
  opts?: { sheetId?: string | null; title?: string; notes?: string }
): DesignCenterState {
  const format = detectDrawingFormat(file.fileName);
  const now = new Date().toISOString();
  const sheets = [...(state.sheets || [])];

  let sheet: DesignDrawingSheet | undefined = opts?.sheetId
    ? sheets.find((s) => s.id === opts.sheetId)
    : undefined;

  if (!sheet) {
    sheet = {
      id: uid('sheet'),
      title: opts?.title || file.fileName.replace(/\.[^.]+$/, '') || file.fileName,
      format,
      versions: [],
      activeVersionId: null,
      createdAt: now,
    };
    sheets.unshift(sheet);
  }

  const versionNumber = (sheet.versions?.length || 0) + 1;
  const version: DesignDrawingVersion = {
    id: uid('ver'),
    version: versionNumber,
    label: `v${versionNumber}`,
    file,
    uploadedAt: now,
    notes: opts?.notes,
  };

  const updatedSheet: DesignDrawingSheet = {
    ...sheet,
    format: sheet.format || format,
    versions: [...(sheet.versions || []), version],
    activeVersionId: version.id,
  };

  const nextSheets = sheets.map((s) => (s.id === updatedSheet.id ? updatedSheet : s));
  if (!sheets.some((s) => s.id === updatedSheet.id)) nextSheets.unshift(updatedSheet);

  return {
    ...state,
    sheets: nextSheets,
    updated_at: now,
    ui: {
      ...state.ui,
      viewer_sheet_id: updatedSheet.id,
    },
  };
}

export function setActiveDrawingVersion(
  state: DesignCenterState,
  sheetId: string,
  versionId: string
): DesignCenterState {
  return {
    ...state,
    sheets: state.sheets.map((s) =>
      s.id === sheetId ? { ...s, activeVersionId: versionId } : s
    ),
    updated_at: new Date().toISOString(),
  };
}

export function removeDrawingSheet(state: DesignCenterState, sheetId: string): DesignCenterState {
  return {
    ...state,
    sheets: state.sheets.filter((s) => s.id !== sheetId),
    updated_at: new Date().toISOString(),
  };
}

export function getActiveVersion(sheet: DesignDrawingSheet): DesignDrawingVersion | null {
  if (!sheet.versions?.length) return null;
  if (sheet.activeVersionId) {
    return sheet.versions.find((v) => v.id === sheet.activeVersionId) || sheet.versions.at(-1)!;
  }
  return sheet.versions.at(-1) || null;
}

export function hasDesignCenterDrawings(state: DesignCenterState | null | undefined): boolean {
  return !!(state?.sheets || []).some((s) => (s.versions || []).length > 0);
}
