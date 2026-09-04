import { NextResponse } from 'next/server';
import { ragQuery } from '@/lib/design-intelligence/knowledge-base';
import { withTenantApi } from '@/lib/tenant/api-guard';

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

/**
 * Offline RAG query endpoint — answers only from indexed company knowledge.
 * No outbound LLM / internet calls. Requires authenticated tenant + design module.
 */
export async function POST(req: Request) {
  const gated = await withTenantApi(req, { module: 'design' });
  if ('response' in gated) return gated.response;

  try {
    const contentType = req.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      return NextResponse.json({ ok: false, error: 'Expected application/json' }, { status: 415 });
    }

    const body = (await req.json()) as {
      question?: string;
      topK?: number;
      company_id?: string;
      projectId?: string;
      codeFamilies?: unknown;
      documentIds?: unknown;
    };
    // Ignore client-supplied company_id — session tenant only
    const question = String(body.question || '').trim();
    if (!question) {
      return NextResponse.json(
        { ok: false, error: 'question required', answer: 'No reliable reference found.', reliable: false },
        { status: 400 }
      );
    }
    if (question.length > 4000) {
      return NextResponse.json(
        { ok: false, error: 'question too long', answer: 'No reliable reference found.', reliable: false },
        { status: 400 }
      );
    }

    const codeFamilies = parseStringArray(body.codeFamilies, MAX_FAMILIES);
    const documentIds = parseStringArray(body.documentIds, MAX_DOC_IDS);
    if (codeFamilies == null || documentIds == null) {
      return NextResponse.json(
        { ok: false, error: 'invalid codeFamilies or documentIds', reliable: false },
        { status: 400 }
      );
    }

    const projectId =
      typeof body.projectId === 'string' && body.projectId.trim().length <= MAX_STRING
        ? body.projectId.trim() || null
        : body.projectId == null
          ? null
          : undefined;
    if (projectId === undefined) {
      return NextResponse.json(
        { ok: false, error: 'invalid projectId', reliable: false },
        { status: 400 }
      );
    }

    const topK = Math.min(Math.max(Number(body.topK) || 5, 1), 12);
    const result = await ragQuery(question, topK, {
      companyId: gated.ctx.tenantId,
      codeFamilies: codeFamilies.length ? codeFamilies : undefined,
      documentIds: documentIds.length ? documentIds : undefined,
      projectId,
    });
    return NextResponse.json({
      ok: true,
      offline: true,
      internet: false,
      ...result,
    });
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error: 'RAG failed',
        answer: 'No reliable reference found.',
        reliable: false,
      },
      { status: 500 }
    );
  }
}
