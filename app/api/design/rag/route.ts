import { NextResponse } from 'next/server';
import { getBearerAccessToken } from '@/lib/auth/bearer';
import { ragQuery } from '@/lib/design-intelligence/knowledge-base';
import {
  createRagTimer,
  logRag,
  RagQueryError,
  sanitizeRagErrorMessage,
} from '@/lib/design-intelligence/rag-log';
import { isDemoMode, isSupabaseConfigured } from '@/lib/supabase';
import { createUserScopedSupabase } from '@/lib/supabase/server';
import { withTenantApi } from '@/lib/tenant/api-guard';
import { TenantAccessError } from '@/lib/tenant/context';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_FAMILIES = 8;
const MAX_DOC_IDS = 40;
const MAX_STRING = 120;

function parseStringArray(value: unknown, maxLen: number): string[] | null {
  if (value == null) return [];
  if (!Array.isArray(value)) return null;
  if (value.length > maxLen) return null;
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string') return null;
    const s = item.trim();
    if (!s || s.length > MAX_STRING) return null;
    out.push(s);
  }
  return out;
}

function requiresBearerForRag(): boolean {
  return isSupabaseConfigured && !isDemoMode;
}

function jsonError(
  status: number,
  error: string,
  opts?: { errorCode?: string; stage?: string; answer?: string }
) {
  return NextResponse.json(
    {
      ok: false,
      error,
      errorCode: opts?.errorCode || error,
      stage: opts?.stage || 'RAG_FAILED',
      answer: opts?.answer || 'No reliable reference found.',
      reliable: false,
      citations: [],
      confidence: 0,
    },
    { status }
  );
}

/**
 * Offline RAG query — answers only from indexed company knowledge.
 * No outbound LLM / internet calls.
 *
 * Auth (Production Node):
 * - Authorization: Bearer required (same pattern as reingest / tenant context)
 * - Live actor + tenant from JWT via withTenantApi
 * - User-scoped Supabase client so di_knowledge_* RLS sees auth.uid()
 * - Client company_id ignored
 */
export async function POST(req: Request) {
  const timer = createRagTimer();
  logRag({ stage: 'RAG_START', elapsedMs: timer.elapsedMs() });

  const accessToken = getBearerAccessToken(req);
  if (requiresBearerForRag() && !accessToken) {
    logRag({
      stage: 'RAG_FAILED',
      errorCode: 'missing_bearer',
      error: 'Bearer access token required for RAG',
      elapsedMs: timer.elapsedMs(),
    });
    return jsonError(401, 'Bearer access token required for RAG', {
      errorCode: 'missing_bearer',
      stage: 'AUTH',
    });
  }

  const gated = await withTenantApi(req, { module: 'design' });
  if ('response' in gated) {
    const status = gated.response.status;
    const errorCode =
      status === 401 ? 'auth_required' : status === 403 ? 'tenant_or_module_forbidden' : 'tenant_gate_failed';
    logRag({
      stage: 'RAG_FAILED',
      errorCode,
      error: 'tenant_or_module_gate_failed',
      elapsedMs: timer.elapsedMs(),
    });
    // Preserve status; attach safe diagnostic codes without rewriting body secrets.
    try {
      const body = (await gated.response.clone().json()) as { ok?: boolean; error?: string };
      return NextResponse.json(
        {
          ok: false,
          error: body.error || 'tenant_or_module_gate_failed',
          errorCode,
          stage: 'TENANT',
          answer: 'No reliable reference found.',
          reliable: false,
          citations: [],
          confidence: 0,
        },
        { status }
      );
    } catch {
      return gated.response;
    }
  }

  logRag({
    stage: 'AUTH_OK',
    companyId: gated.ctx.tenantId,
    elapsedMs: timer.elapsedMs(),
  });
  logRag({
    stage: 'TENANT_OK',
    companyId: gated.ctx.tenantId,
    elapsedMs: timer.elapsedMs(),
  });

  try {
    const contentType = req.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      return jsonError(415, 'Expected application/json', {
        errorCode: 'invalid_content_type',
        stage: 'VALIDATE',
      });
    }

    const body = (await req.json()) as {
      question?: string;
      topK?: number;
      company_id?: string;
      companyId?: string;
      projectId?: string;
      codeFamilies?: unknown;
      documentIds?: unknown;
    };
    // Ignore client-supplied company_id — authenticated tenant only
    void body.company_id;
    void body.companyId;

    const question = String(body.question || '').trim();
    if (!question) {
      return jsonError(400, 'question required', {
        errorCode: 'question_required',
        stage: 'VALIDATE',
      });
    }
    if (question.length > 4000) {
      return jsonError(400, 'question too long', {
        errorCode: 'question_too_long',
        stage: 'VALIDATE',
      });
    }

    const codeFamilies = parseStringArray(body.codeFamilies, MAX_FAMILIES);
    const documentIds = parseStringArray(body.documentIds, MAX_DOC_IDS);
    if (codeFamilies == null || documentIds == null) {
      return jsonError(400, 'invalid codeFamilies or documentIds', {
        errorCode: 'invalid_filters',
        stage: 'VALIDATE',
      });
    }

    const projectId =
      typeof body.projectId === 'string' && body.projectId.trim().length <= MAX_STRING
        ? body.projectId.trim() || null
        : body.projectId == null
          ? null
          : undefined;
    if (projectId === undefined) {
      return jsonError(400, 'invalid projectId', {
        errorCode: 'invalid_project_id',
        stage: 'VALIDATE',
      });
    }

    let userClient = null as ReturnType<typeof createUserScopedSupabase>;
    if (accessToken) {
      userClient = createUserScopedSupabase(accessToken);
      if (!userClient && requiresBearerForRag()) {
        logRag({
          stage: 'RAG_FAILED',
          companyId: gated.ctx.tenantId,
          errorCode: 'scoped_client_unavailable',
          error: 'User-scoped Supabase client unavailable',
          elapsedMs: timer.elapsedMs(),
        });
        return jsonError(503, 'User-scoped Supabase client unavailable for RAG', {
          errorCode: 'scoped_client_unavailable',
          stage: 'CLIENT',
        });
      }
      logRag({
        stage: 'CLIENT_OK',
        companyId: gated.ctx.tenantId,
        elapsedMs: timer.elapsedMs(),
      });
    }

    const topK = Math.min(Math.max(Number(body.topK) || 5, 1), 12);
    const result = await ragQuery(question, topK, {
      companyId: gated.ctx.tenantId,
      codeFamilies: codeFamilies.length ? codeFamilies : undefined,
      documentIds: documentIds.length ? documentIds : undefined,
      projectId,
      client: userClient,
    });

    logRag({
      stage: 'RAG_DONE',
      companyId: gated.ctx.tenantId,
      resultCount: Array.isArray(result.citations) ? result.citations.length : null,
      elapsedMs: timer.elapsedMs(),
    });

    return NextResponse.json({
      ok: true,
      offline: true,
      internet: false,
      stage: 'RAG_DONE',
      ...result,
    });
  } catch (error) {
    if (error instanceof TenantAccessError) {
      logRag({
        stage: 'RAG_FAILED',
        companyId: gated.ctx.tenantId,
        errorCode: 'tenant_access',
        error: sanitizeRagErrorMessage(error.message),
        elapsedMs: timer.elapsedMs(),
      });
      return jsonError(error.status, error.message, {
        errorCode: 'tenant_access',
        stage: 'TENANT',
      });
    }
    if (error instanceof RagQueryError) {
      logRag({
        stage: 'RAG_FAILED',
        companyId: gated.ctx.tenantId,
        errorCode: error.code,
        error: sanitizeRagErrorMessage(error.message),
        elapsedMs: timer.elapsedMs(),
      });
      return jsonError(error.status, error.message, {
        errorCode: error.code,
        stage: 'SEARCH',
      });
    }
    logRag({
      stage: 'RAG_FAILED',
      companyId: gated.ctx.tenantId,
      errorCode: 'rag_exception',
      error: sanitizeRagErrorMessage(error),
      elapsedMs: timer.elapsedMs(),
    });
    return jsonError(500, sanitizeRagErrorMessage(error), {
      errorCode: 'rag_exception',
      stage: 'RAG_FAILED',
    });
  }
}
