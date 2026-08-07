/**
 * Client for Design Center AI / calculation / export APIs.
 * On GitHub Pages (no /api), falls back to the local engine boundary instead of
 * crashing with: Unexpected token '<', "<html>... is not valid JSON
 */

import { readResponseJson, humanizeFetchError } from '@/lib/api/safe-json';
import { areApiRoutesAvailable } from '@/lib/runtime/mode';
import {
  engineUnavailablePayload,
  generateSystemDesign,
  isDesignEngineConfigured,
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

export type DesignCenterApiError<T = unknown> = {
  ok: false;
  code: string;
  message: string;
  message_ar?: string;
  message_en?: string;
  /** Partial structured state when engine is unavailable but boundary returned a job shell */
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
};

type SystemBody = {
  projectId: string;
  kind: FireSystemKind;
  analysisId?: string | null;
};

type CalcBody = {
  projectId: string;
  kind: EngineeringCalcKind;
};

type ComplianceBody = {
  projectId: string;
  client?: import('@/lib/types/client').ClientRecord;
  data?: import('@/lib/types/project-reports').ProjectEngineeringData;
};

type ExportBody = {
  projectId: string;
  kind: DesignExportKind;
};

async function runLocalAnalyze(body: AnalyzeBody): Promise<DesignCenterApiResult<{ analysis: DesignAnalysisJob }>> {
  const analysis = await runPlanAnalysis({
    projectId: body.projectId,
    sheetId: body.sheetId,
    versionId: body.versionId,
    previous: body.analysis,
  });
  if (!isDesignEngineConfigured()) {
    return {
      ok: false,
      ...engineUnavailablePayload(),
      data: { analysis },
    };
  }
  return { ok: true, data: { analysis } };
}

async function runLocalSystem(
  body: SystemBody
): Promise<DesignCenterApiResult<{ system: DesignSystemGeneration }>> {
  const system = await generateSystemDesign(body);
  if (!isDesignEngineConfigured()) {
    return { ok: false, ...engineUnavailablePayload(), data: { system } };
  }
  return { ok: true, data: { system } };
}

async function runLocalCalc(
  body: CalcBody
): Promise<DesignCenterApiResult<{ calculation: EngineeringCalcResult }>> {
  const calculation = await runCalculation(body);
  if (!isDesignEngineConfigured()) {
    return { ok: false, ...engineUnavailablePayload(), data: { calculation } };
  }
  return { ok: true, data: { calculation } };
}

async function runLocalCompliance(
  body: ComplianceBody
): Promise<DesignCenterApiResult<{ compliance: DesignComplianceState }>> {
  const compliance = await runCompliance({
    projectId: body.projectId,
    context: body.client && body.data ? { client: body.client, data: body.data } : null,
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
  const exportJob = await runExport(body);
  if (!isDesignEngineConfigured()) {
    return { ok: false, ...engineUnavailablePayload(), data: { exportJob } };
  }
  return { ok: true, data: { exportJob } };
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
      // Static host or proxy returned HTML — use local engine instead of raw parse error
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
    if (raw.includes("Unexpected token") || raw.includes('Failed to fetch') || raw.includes('NetworkError')) {
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
