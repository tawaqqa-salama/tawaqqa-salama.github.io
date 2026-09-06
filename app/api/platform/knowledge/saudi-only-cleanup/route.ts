/**
 * Platform Admin — one-time Saudi-only knowledge cleanup.
 *
 * Security:
 * - Bearer JWT required
 * - Live platform_admin from JWT (cookie role alone is insufficient)
 * - Cleanup document IDs are server-controlled (client overrides rejected)
 * - Service role used only on server after auth gate; never returned to client
 * - Does not weaken RLS, reingest, or delete Saudi Storage
 */

import { NextResponse } from 'next/server';
import { getBearerAccessToken } from '@/lib/auth/bearer';
import { requireLivePlatformAdmin } from '@/lib/auth/platform-gate';
import {
  createServiceRoleSupabase,
  hasServiceRoleKey,
} from '@/lib/supabase/server';
import {
  SAUDI_ONLY_CLEANUP_CONFIRM_PHRASE,
  SAUDI_ONLY_CLEANUP_EXPECTED_NFPA_CHUNKS,
  SAUDI_ONLY_CLEANUP_EXPECTED_SAUDI_CHUNKS,
  SAUDI_ONLY_CLEANUP_NFPA_DOC_ID,
  SAUDI_ONLY_CLEANUP_SAUDI_DOC_ID,
  executeSaudiOnlyKnowledgeCleanup,
  rejectClientIdOverrides,
  verifySaudiOnlyCleanupState,
} from '@/lib/design-intelligence/saudi-only-knowledge-cleanup';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

let inFlight: Promise<unknown> | null = null;

function jsonError(status: number, error: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ ok: false, error, ...extra }, { status });
}

/** Preview / status — does not mutate. */
export async function GET(request: Request) {
  const accessToken = getBearerAccessToken(request);
  if (!accessToken) {
    return jsonError(401, 'Bearer access token required');
  }

  const gate = await requireLivePlatformAdmin(request);
  if (!gate.ok) return gate.response;

  if (!hasServiceRoleKey()) {
    return jsonError(503, 'Server service role is not configured for maintenance operations');
  }
  const sb = createServiceRoleSupabase();
  if (!sb) {
    return jsonError(503, 'Server service role client unavailable');
  }

  try {
    const verification = await verifySaudiOnlyCleanupState(sb);
    return NextResponse.json({
      ok: true,
      preview: {
        will_delete: {
          document_id: SAUDI_ONLY_CLEANUP_NFPA_DOC_ID,
          title: 'NFPA 13-2025',
          expected_chunks: SAUDI_ONLY_CLEANUP_EXPECTED_NFPA_CHUNKS,
        },
        will_keep: {
          document_id: SAUDI_ONLY_CLEANUP_SAUDI_DOC_ID,
          title: 'الكود السعودي للحماية من الحريق',
          expected_chunks: SAUDI_ONLY_CLEANUP_EXPECTED_SAUDI_CHUNKS,
          code: 'SBC-801',
          edition: '2018',
        },
        confirm_phrase: SAUDI_ONLY_CLEANUP_CONFIRM_PHRASE,
      },
      verification,
      actorUserId: gate.actor.user.id,
    });
  } catch (e) {
    return jsonError(500, e instanceof Error ? e.message : 'status failed');
  }
}

/** Execute one-time cleanup. Idempotent. */
export async function POST(request: Request) {
  const accessToken = getBearerAccessToken(request);
  if (!accessToken) {
    return jsonError(401, 'Bearer access token required');
  }

  const gate = await requireLivePlatformAdmin(request);
  if (!gate.ok) return gate.response;

  let body: Record<string, unknown> = {};
  try {
    const contentType = request.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      body = (await request.json()) as Record<string, unknown>;
    }
  } catch {
    return jsonError(400, 'Invalid JSON body');
  }

  const overrideError = rejectClientIdOverrides(body);
  if (overrideError) {
    return jsonError(400, overrideError);
  }

  const confirm = body.confirm === true;
  const confirmTwice = body.confirmTwice === true;
  const phrase = String(body.confirmPhrase || '').trim();
  if (!confirm || !confirmTwice || phrase !== SAUDI_ONLY_CLEANUP_CONFIRM_PHRASE) {
    return jsonError(400, 'Double confirmation with exact phrase is required', {
      requiredPhrase: SAUDI_ONLY_CLEANUP_CONFIRM_PHRASE,
    });
  }

  if (!hasServiceRoleKey()) {
    return jsonError(503, 'Server service role is not configured for maintenance operations');
  }
  const sb = createServiceRoleSupabase();
  if (!sb) {
    return jsonError(503, 'Server service role client unavailable');
  }

  if (inFlight) {
    return jsonError(409, 'Cleanup already in progress');
  }

  const run = (async () => {
    const result = await executeSaudiOnlyKnowledgeCleanup(sb);
    return {
      ok: result.ok,
      alreadyCompleted: result.alreadyCompleted,
      messageAr: result.messageAr,
      nfpaDocumentDeleted: result.nfpaDocumentDeleted,
      nfpaChunksDeleted: result.nfpaChunksDeleted,
      nfpaJobsDeleted: result.nfpaJobsDeleted,
      nfpaStorageDeleted: result.nfpaStorageDeleted,
      saudiDocumentPreserved: result.saudiDocumentPreserved,
      saudiMetadataCorrected: result.saudiMetadataCorrected,
      saudiChunksCorrected: result.saudiChunksCorrected,
      storageError: result.storageError,
      verification: result.verification,
      actorUserId: gate.actor.user.id,
    };
  })();

  inFlight = run;
  try {
    const payload = await run;
    return NextResponse.json(payload, { status: payload.ok ? 200 : 500 });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'cleanup failed';
    const safe = message.replace(/service[_-]?role|eyJ[a-zA-Z0-9_-]+/gi, '[redacted]');
    return jsonError(500, safe);
  } finally {
    inFlight = null;
  }
}
