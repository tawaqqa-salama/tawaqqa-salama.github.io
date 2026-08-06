/**
 * Client for Design Center AI / calculation / export APIs.
 * Separates UI from engines — responses never invent engineering data.
 */

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

async function postJson<T>(url: string, body: unknown): Promise<DesignCenterApiResult<T>> {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = (await res.json()) as DesignCenterApiResult<T> & { error?: string };
    if (!res.ok || !json.ok) {
      const err = json as DesignCenterApiError<T>;
      return {
        ok: false,
        code: err.code || 'REQUEST_FAILED',
        message: err.message || json.error || `Request failed (${res.status})`,
        message_ar: err.message_ar,
        message_en: err.message_en,
        data: err.data,
      };
    }
    return json;
  } catch (e) {
    return {
      ok: false,
      code: 'NETWORK_ERROR',
      message: e instanceof Error ? e.message : 'Network error',
    };
  }
}

export function startDesignAnalysis(params: {
  projectId: string;
  sheetId?: string | null;
  versionId?: string | null;
  analysis?: DesignAnalysisJob | null;
}) {
  return postJson<{ analysis: DesignAnalysisJob }>('/api/design-center/analyze', params);
}

export function generateFireSystemDesign(params: {
  projectId: string;
  kind: FireSystemKind;
  analysisId?: string | null;
}) {
  return postJson<{ system: DesignSystemGeneration }>('/api/design-center/generate-system', params);
}

export function runEngineeringCalculation(params: {
  projectId: string;
  kind: EngineeringCalcKind;
}) {
  return postJson<{ calculation: EngineeringCalcResult }>('/api/design-center/calculate', params);
}

export function runComplianceCheck(params: { projectId: string }) {
  return postJson<{ compliance: DesignComplianceState }>('/api/design-center/compliance', params);
}

export function requestDesignExport(params: {
  projectId: string;
  kind: DesignExportKind;
}) {
  return postJson<{ exportJob: DesignExportJob }>('/api/design-center/export', params);
}
