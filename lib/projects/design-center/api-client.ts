/**
 * Client for Design Center AI / calculation / export APIs.
 * On GitHub Pages (no /api), falls back to the local knowledge-backed engine.
 */

import { readResponseJson, humanizeFetchError } from '@/lib/api/safe-json';
import { areApiRoutesAvailable } from '@/lib/runtime/mode';
import {
  generateSystemDesign,
  runCalculation,
  runCompliance,
  runExport,
  runPlanAnalysis,
} from '@/lib/projects/design-center/engine';
import type {
  DesignAnalysisJob,
  DesignComplianceState,
  DesignExportJob,
  DesignExportKind,
  DesignSystemGeneration,
  EngineeringCalcKind,
  EngineeringCalcResult,
  FireSystemKind,
} from '@/lib/projects/design-center/types';
import type { CADAnalysisResult } from '@/lib/projects/design-center/vision/types';
import type { ClientRecord } from '@/lib/types/client';
import type { ProjectEngineeringData } from '@/lib/types/project-reports';

export type DesignCenterApiError<T = unknown> = {
  ok: false;
  code: string;
  message: string;
  message_ar?: string;
  message_en?: string;
  data?: T;
};

export type DesignCenterApiOk<T> = {
  ok: true;
  data: T;
};

export type DesignCenterApiResult<T> = DesignCenterApiOk<T> | DesignCenterApiError<T>;

type AnalyzeBody = {
  projectId: string;
  sheetId?: string | null;
  versionId?: string | null;
  analysis?: DesignAnalysisJob | null;
  client?: ClientRecord;
  data?: ProjectEngineeringData;
  /** Browser-only local CAD vision result */
  cadVision?: CADAnalysisResult | null;
};

type SystemBody = {
  projectId: string;
  kind: FireSystemKind;
  analysisId?: string | null;
  client?: ClientRecord;
  data?: ProjectEngineeringData;
};

type CalcBody = {
  projectId: string;
  kind: EngineeringCalcKind;
  client?: ClientRecord;
  data?: ProjectEngineeringData;
};

type ComplianceBody = {
  projectId: string;
  client?: ClientRecord;
  data?: ProjectEngineeringData;
};

type ExportBody = {
  projectId: string;
  kind: DesignExportKind;
  client?: ClientRecord;
  data?: ProjectEngineeringData;
};

function ctxOf(body: {
  client?: ClientRecord;
  data?: ProjectEngineeringData;
  cadVision?: CADAnalysisResult | null;
}) {
  return body.client && body.data
    ? { client: body.client, data: body.data, cadVision: body.cadVision ?? null }
    : null;
}

async function runLocalAnalyze(
  body: AnalyzeBody
): Promise<DesignCenterApiResult<{ analysis: DesignAnalysisJob }>> {
  const analysis = await runPlanAnalysis({
    projectId: body.projectId,
    sheetId: body.sheetId,
    versionId: body.versionId,
    previous: body.analysis,
    context: ctxOf(body),
  });
  if (analysis.status === 'completed' || analysis.status === 'needs_engineer_review') {
    return { ok: true, data: { analysis } };
  }
  return {
    ok: false,
    code: analysis.error_code || 'ANALYZE_FAILED',
    message: analysis.error || 'Analysis incomplete',
    message_ar: analysis.error || undefined,
    data: { analysis },
  };
}

async function runLocalSystem(
  body: SystemBody
): Promise<DesignCenterApiResult<{ system: DesignSystemGeneration }>> {
  const system = await generateSystemDesign({
    projectId: body.projectId,
    kind: body.kind,
    analysisId: body.analysisId,
    context: ctxOf(body),
  });
  if (system.status === 'completed') {
    return { ok: true, data: { system } };
  }
  return {
    ok: false,
    code: system.error_code || 'SYSTEM_FAILED',
    message: system.error || 'System generation incomplete',
    message_ar: system.error || undefined,
    data: { system },
  };
}

async function runLocalCalc(
  body: CalcBody
): Promise<DesignCenterApiResult<{ calculation: EngineeringCalcResult }>> {
  const calculation = await runCalculation({
    projectId: body.projectId,
    kind: body.kind,
    context: ctxOf(body),
  });
  if (calculation.status === 'completed') {
    return { ok: true, data: { calculation } };
  }
  return {
    ok: false,
    code: calculation.error_code || 'CALC_FAILED',
    message: calculation.error || 'Calculation incomplete',
    message_ar: calculation.error || undefined,
    data: { calculation },
  };
}

async function runLocalCompliance(
  body: ComplianceBody
): Promise<DesignCenterApiResult<{ compliance: DesignComplianceState }>> {
  const compliance = await runCompliance({
    projectId: body.projectId,
    context: ctxOf(body),
  });
  if (compliance.status === 'failed' && compliance.error_code === 'PROJECT_CONTEXT_REQUIRED') {
    return {
      ok: false,
      code: 'PROJECT_CONTEXT_REQUIRED',
      message: compliance.error || 'Project context required',
      message_ar: compliance.recommendations[0]?.text_ar,
      message_en: compliance.recommendations[0]?.text_en,
      data: { compliance },
    };
  }
  return { ok: true, data: { compliance } };
}

async function runLocalExport(
  body: ExportBody
): Promise<DesignCenterApiResult<{ exportJob: DesignExportJob }>> {
  const exportJob = await runExport({
    projectId: body.projectId,
    kind: body.kind,
    context: ctxOf(body),
  });
  if (exportJob.status === 'completed') {
    return { ok: true, data: { exportJob } };
  }
  return {
    ok: false,
    code: exportJob.error_code || 'EXPORT_FAILED',
    message: exportJob.error || 'Export incomplete',
    message_ar: exportJob.error || undefined,
    data: { exportJob },
  };
}

async function localFallback<T>(url: string, body: unknown): Promise<DesignCenterApiResult<T>> {
  if (url.includes('/analyze')) {
    return (await runLocalAnalyze(body as AnalyzeBody)) as DesignCenterApiResult<T>;
  }
  if (url.includes('/generate-system')) {
    return (await runLocalSystem(body as SystemBody)) as DesignCenterApiResult<T>;
  }
  if (url.includes('/calculate')) {
    return (await runLocalCalc(body as CalcBody)) as DesignCenterApiResult<T>;
  }
  if (url.includes('/compliance')) {
    return (await runLocalCompliance(body as ComplianceBody)) as DesignCenterApiResult<T>;
  }
  if (url.includes('/export')) {
    return (await runLocalExport(body as ExportBody)) as DesignCenterApiResult<T>;
  }
  return {
    ok: false,
    code: 'API_UNAVAILABLE',
    message: 'API route is not available on this host',
    message_ar:
      'واجهة /api غير متاحة على هذا المضيف. انشر على Node/Vercel لتفعيل محركات الخادم.',
    message_en: 'API routes are not available on this host. Deploy on Node/Vercel for server engines.',
  };
}

async function postJson<T>(url: string, body: unknown): Promise<DesignCenterApiResult<T>> {
  if (!areApiRoutesAvailable()) {
    return localFallback<T>(url, body);
  }

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
    });
    const parsed = await readResponseJson<DesignCenterApiResult<T> & { error?: string }>(res);
    if (!parsed.ok) {
      if (parsed.isHtml) {
        return localFallback<T>(url, body);
      }
      return {
        ok: false,
        code: 'NETWORK_ERROR',
        message: parsed.error,
        message_ar: parsed.error,
      };
    }

    const json = parsed.data;
    if (!json || typeof json !== 'object') {
      return localFallback<T>(url, body);
    }

    if (!res.ok || !json.ok) {
      const err = json as DesignCenterApiError<T>;
      return {
        ok: false,
        code: err.code || 'REQUEST_FAILED',
        message: humanizeFetchError(err.message || json.error || `Request failed (${res.status})`),
        message_ar: err.message_ar ? humanizeFetchError(err.message_ar) : err.message_ar,
        message_en: err.message_en,
        data: err.data,
      };
    }
    return json;
  } catch (e) {
    const raw = e instanceof Error ? e.message : 'Network error';
    if (raw.includes('Unexpected token') || raw.includes('Failed to fetch') || raw.includes('NetworkError')) {
      return localFallback<T>(url, body);
    }
    return {
      ok: false,
      code: 'NETWORK_ERROR',
      message: humanizeFetchError(raw),
      message_ar: humanizeFetchError(raw),
    };
  }
}

export function startDesignAnalysis(params: AnalyzeBody) {
  return postJson<{ analysis: DesignAnalysisJob }>('/api/design-center/analyze', params);
}

export function generateFireSystemDesign(params: SystemBody) {
  return postJson<{ system: DesignSystemGeneration }>('/api/design-center/generate-system', params);
}

export function runEngineeringCalculation(params: CalcBody) {
  return postJson<{ calculation: EngineeringCalcResult }>('/api/design-center/calculate', params);
}

export function runComplianceCheck(params: ComplianceBody) {
  return postJson<{ compliance: DesignComplianceState }>('/api/design-center/compliance', params);
}

export function requestDesignExport(params: ExportBody) {
  return postJson<{ exportJob: DesignExportJob }>('/api/design-center/export', params);
}
