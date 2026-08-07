/**
 * Server-side Design Center engine boundary.
 * Plan analysis / system generation / calcs / export stay engine-gated.
 * Compliance uses local SBC/NFPA + company Design Intelligence knowledge bridge.
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
import { runProjectKnowledgeCompliance } from '@/lib/design-intelligence/project-knowledge-bridge';
import type { ClientRecord } from '@/lib/types/client';
import type { ProjectEngineeringData } from '@/lib/types/project-reports';

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

export type ComplianceEngineContext = {
  client: ClientRecord;
  data: ProjectEngineeringData;
};

/**
 * Compliance is always runnable locally via SBC/NFPA + company knowledge RAG.
 * External DESIGN_AI_ENGINE_URL can replace this later.
 */
export async function runCompliance(params: {
  projectId: string;
  context?: ComplianceEngineContext | null;
}): Promise<DesignComplianceState> {
  if (isDesignEngineConfigured()) {
    throw new Error('Compliance engine adapter is not implemented yet');
  }

  if (!params.context?.client || !params.context?.data) {
    return {
      status: 'failed',
      matchPercent: null,
      findings: [],
      recommendations: [
        {
          id: 'context-required',
          text_ar: 'مطلوب سياق المشروع (العميل + بيانات هندسية) لتشغيل فحص الامتثال المرتبط بالمعرفة.',
          text_en: 'Project context (client + engineering data) is required for knowledge-linked compliance.',
        },
      ],
      standards: ['NFPA', 'SBC'],
      checkedAt: new Date().toISOString(),
      error: 'PROJECT_CONTEXT_REQUIRED',
      error_code: 'PROJECT_CONTEXT_REQUIRED',
      knowledge_citations: [],
    };
  }

  return runProjectKnowledgeCompliance({
    client: params.context.client,
    data: params.context.data,
  });
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
