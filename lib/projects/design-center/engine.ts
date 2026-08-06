/**
 * Server-side Design Center engine boundary.
 * Returns structured "not configured" responses — never mock engineering output.
 * Swap implementations here when a real AI / calc engine is connected.
 */

import { createEmptyAnalysisJob, emptyAnalysisSteps } from '@/lib/projects/design-center/state';
import {
  ENGINE_NOT_CONFIGURED,
  type DesignAnalysisJob,
  type DesignComplianceState,
  type DesignExportJob,
  type DesignExportKind,
  type DesignSystemGeneration,
  type EngineeringCalcKind,
  type EngineeringCalcResult,
  type FireSystemKind,
} from '@/lib/projects/design-center/types';

const MSG_AR =
  'محرك الذكاء التصميمي غير مُعدّ بعد. البنية جاهزة للربط عبر API دون بيانات وهمية.';
const MSG_EN =
  'Design intelligence engine is not configured yet. The API boundary is ready — no fabricated results.';

export function engineUnavailablePayload() {
  return {
    code: ENGINE_NOT_CONFIGURED,
    message: MSG_EN,
    message_ar: MSG_AR,
    message_en: MSG_EN,
  };
}

export function isDesignEngineConfigured(): boolean {
  return Boolean(
    process.env.DESIGN_AI_ENGINE_URL ||
      process.env.DESIGN_AI_ENGINE_ENABLED === '1' ||
      process.env.DESIGN_AI_ENGINE_ENABLED === 'true'
  );
}

/**
 * Placeholder for future HTTP call to DESIGN_AI_ENGINE_URL.
 * Until configured, marks the job unavailable without inventing model data.
 */
export async function runPlanAnalysis(params: {
  projectId: string;
  sheetId?: string | null;
  versionId?: string | null;
  previous?: DesignAnalysisJob | null;
}): Promise<DesignAnalysisJob> {
  if (!isDesignEngineConfigured()) {
    const job = createEmptyAnalysisJob({
      id: params.previous?.id || createEmptyAnalysisJob().id,
      status: 'unavailable',
      progress: 0,
      steps: emptyAnalysisSteps().map((s) => ({ ...s, status: 'unavailable' })),
      sourceSheetId: params.sheetId ?? null,
      sourceVersionId: params.versionId ?? null,
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      error: MSG_AR,
      error_code: ENGINE_NOT_CONFIGURED,
      result: null,
    });
    return job;
  }

  // Future: POST to DESIGN_AI_ENGINE_URL and map real progress/results.
  throw new Error('Design AI engine URL is set but adapter is not implemented yet');
}

export async function generateSystemDesign(params: {
  projectId: string;
  kind: FireSystemKind;
  analysisId?: string | null;
}): Promise<DesignSystemGeneration> {
  if (!isDesignEngineConfigured()) {
    return {
      kind: params.kind,
      status: 'unavailable',
      generatedAt: new Date().toISOString(),
      designId: null,
      error: MSG_AR,
      error_code: ENGINE_NOT_CONFIGURED,
      artifactRefs: [],
    };
  }
  throw new Error('Design AI engine URL is set but adapter is not implemented yet');
}

export async function runCalculation(params: {
  projectId: string;
  kind: EngineeringCalcKind;
}): Promise<EngineeringCalcResult> {
  if (!isDesignEngineConfigured()) {
    return {
      kind: params.kind,
      status: 'unavailable',
      updatedAt: new Date().toISOString(),
      error: MSG_AR,
      error_code: ENGINE_NOT_CONFIGURED,
      values: null,
    };
  }
  throw new Error('Design calculation engine adapter is not implemented yet');
}

export async function runCompliance(params: {
  projectId: string;
}): Promise<DesignComplianceState> {
  void params;
  if (!isDesignEngineConfigured()) {
    return {
      status: 'unavailable',
      matchPercent: null,
      findings: [],
      recommendations: [],
      standards: ['NFPA', 'SBC'],
      checkedAt: new Date().toISOString(),
      error: MSG_AR,
      error_code: ENGINE_NOT_CONFIGURED,
    };
  }
  throw new Error('Compliance engine adapter is not implemented yet');
}

export async function runExport(params: {
  projectId: string;
  kind: DesignExportKind;
}): Promise<DesignExportJob> {
  if (!isDesignEngineConfigured()) {
    return {
      kind: params.kind,
      status: 'unavailable',
      file: null,
      error: MSG_AR,
      error_code: ENGINE_NOT_CONFIGURED,
      updatedAt: new Date().toISOString(),
    };
  }
  throw new Error('Design export engine adapter is not implemented yet');
}
