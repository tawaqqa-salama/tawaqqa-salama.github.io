/**
 * Design Center engine boundary.
 * Prefer external DESIGN_AI_ENGINE_* when configured; otherwise run the
 * knowledge-backed local engine (real project fields + company KB / RAG).
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
import {
  runKnowledgeBackedCalculation,
  runKnowledgeBackedExport,
  runKnowledgeBackedPlanAnalysis,
  runKnowledgeBackedSystemDesign,
  type KnowledgeEngineContext,
} from '@/lib/projects/design-center/knowledge-engine';
import type { ClientRecord } from '@/lib/types/client';
import type { ProjectEngineeringData } from '@/lib/types/project-reports';

const MSG_AR =
  'مرّر بيانات المشروع (العميل + التصاميم) لتشغيل التحليل من قاعدة المعرفة الفعلية.';
const MSG_EN =
  'Pass project context (client + engineering data) to run knowledge-backed analysis.';

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

export type ComplianceEngineContext = {
  client: ClientRecord;
  data: ProjectEngineeringData;
};

export async function runPlanAnalysis(params: {
  projectId: string;
  sheetId?: string | null;
  versionId?: string | null;
  previous?: DesignAnalysisJob | null;
  context?: KnowledgeEngineContext | null;
}): Promise<DesignAnalysisJob> {
  if (isDesignEngineConfigured()) {
    throw new Error('Design AI engine URL is set but adapter is not implemented yet');
  }

  if (params.context?.client && params.context?.data) {
    return runKnowledgeBackedPlanAnalysis({
      projectId: params.projectId,
      sheetId: params.sheetId,
      versionId: params.versionId,
      previous: params.previous,
      context: params.context,
    });
  }

  return createEmptyAnalysisJob({
    id: params.previous?.id || createEmptyAnalysisJob().id,
    status: 'unavailable',
    progress: 0,
    steps: emptyAnalysisSteps().map((s) => ({ ...s, status: 'unavailable' })),
    sourceSheetId: params.sheetId ?? null,
    sourceVersionId: params.versionId ?? null,
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    error: MSG_AR,
    error_code: 'PROJECT_CONTEXT_REQUIRED',
    result: null,
  });
}

export async function generateSystemDesign(params: {
  projectId: string;
  kind: FireSystemKind;
  analysisId?: string | null;
  context?: KnowledgeEngineContext | null;
}): Promise<DesignSystemGeneration> {
  if (isDesignEngineConfigured()) {
    throw new Error('Design AI engine URL is set but adapter is not implemented yet');
  }
  return runKnowledgeBackedSystemDesign({
    projectId: params.projectId,
    kind: params.kind,
    context: params.context,
  });
}

export async function runCalculation(params: {
  projectId: string;
  kind: EngineeringCalcKind;
  context?: KnowledgeEngineContext | null;
}): Promise<EngineeringCalcResult> {
  if (isDesignEngineConfigured()) {
    throw new Error('Design calculation engine adapter is not implemented yet');
  }
  return runKnowledgeBackedCalculation(params);
}

/**
 * Compliance is always runnable locally via SBC/NFPA + company knowledge RAG.
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
  context?: KnowledgeEngineContext | null;
}): Promise<DesignExportJob> {
  if (isDesignEngineConfigured()) {
    throw new Error('Design export engine adapter is not implemented yet');
  }
  return runKnowledgeBackedExport(params);
}
