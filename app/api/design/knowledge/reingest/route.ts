import { NextResponse } from 'next/server';
import { reingestKnowledgeDocumentFromStorage } from '@/lib/design-intelligence/knowledge-base';
import { isUuid } from '@/lib/design-intelligence/code-knowledge/persist';
import { getBearerAccessToken } from '@/lib/auth/bearer';
import { createUserScopedSupabase } from '@/lib/supabase/server';
import { withTenantApi } from '@/lib/tenant/api-guard';
import { requireRole } from '@/lib/tenant/context';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
/** Large NFPA PDFs (hundreds of pages) need a long server budget. */
export const maxDuration = 300;

/**
 * Authenticated single-document Knowledge Base re-ingest.
 *
 * - Live actor from verified Bearer JWT + auth_user_id (cookie role/company ignored)
 * - Session tenant only (client company_id ignored)
 * - Requires design module + tenant admin role (or platform admin)
 * - Uses user-scoped Supabase JWT so RLS applies — service role not required
 * - Same document_id / Storage object; replaces chunks only
 * - Does NOT auto-run from development; caller must POST deliberately
 */
export async function POST(req: Request) {
  // Bearer required up-front so withTenantApi can validate live actor under RLS
  // on Vercel hosts that do not configure a service-role key.
  const accessToken = getBearerAccessToken(req);
  if (!accessToken) {
    return NextResponse.json(
      {
        ok: false,
        error: 'Bearer access token required for Storage/RLS-scoped re-ingest',
      },
      { status: 401 }
    );
  }

  const gated = await withTenantApi(req, { module: 'design' });
  if ('response' in gated) return gated.response;

  try {
    await requireRole(gated.ctx, ['tenant_admin', 'admin']);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Insufficient role';
    return NextResponse.json({ ok: false, error: message }, { status: 403 });
  }

  try {
    const contentType = req.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      return NextResponse.json({ ok: false, error: 'Expected application/json' }, { status: 415 });
    }

    const body = (await req.json()) as {
      documentId?: string;
      company_id?: string;
      companyId?: string;
    };
    // Ignore client-supplied company_id — session tenant only
    void body.company_id;
    void body.companyId;

    const documentId = String(body.documentId || '').trim();
    if (!documentId || !isUuid(documentId)) {
      return NextResponse.json(
        { ok: false, error: 'documentId must be a valid UUID' },
        { status: 400 }
      );
    }

    const userClient = createUserScopedSupabase(accessToken);
    if (!userClient) {
      return NextResponse.json(
        { ok: false, error: 'supabase_not_configured' },
        { status: 503 }
      );
    }

    const result = await reingestKnowledgeDocumentFromStorage(documentId, {
      companyId: gated.ctx.tenantId,
      client: userClient,
    });

    if (!result.ok) {
      const status =
        result.error === 'document_missing' || result.error === 'company_mismatch'
          ? 404
          : result.error === 'invalid_document_id'
            ? 400
            : result.error === 'supabase_not_configured'
              ? 503
              : 500;
      return NextResponse.json(
        {
          ok: false,
          error: result.error || 'reingest_failed',
          documentId,
          companyId: gated.ctx.tenantId,
          chunks_before: result.chunks_before,
          chunks_after: result.chunks_after,
        },
        { status }
      );
    }

    return NextResponse.json({
      ok: true,
      documentId,
      companyId: gated.ctx.tenantId,
      storage_path: result.doc?.storage_path || null,
      code: result.doc?.code || null,
      edition: result.doc?.edition || null,
      platform_verification_status: result.doc?.platform_verification_status || null,
      verification_status: result.doc?.verification_status || null,
      ingestion_version: result.doc?.ingestion_version ?? null,
      index_status: result.doc?.index_status || null,
      ingestion_status: result.doc?.ingestion_status || null,
      page_count: result.page_count ?? result.doc?.page_count ?? null,
      chunks_before: result.chunks_before,
      chunks_after: result.chunks_after,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'reingest_failed',
      },
      { status: 500 }
    );
  }
}
