import { NextResponse } from 'next/server';
import { ragQuery } from '@/lib/design-intelligence/knowledge-base';

/**
 * Offline RAG query endpoint — answers only from indexed company knowledge.
 * No outbound LLM / internet calls. Client RBAC gates the /design UI (dept.design).
 */
export async function POST(req: Request) {
  try {
    const contentType = req.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      return NextResponse.json({ ok: false, error: 'Expected application/json' }, { status: 415 });
    }

    const body = (await req.json()) as { question?: string; topK?: number };
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

    const topK = Math.min(Math.max(Number(body.topK) || 5, 1), 12);
    const result = await ragQuery(question, topK);
    return NextResponse.json({
      ok: true,
      offline: true,
      internet: false,
      ...result,
    });
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        error: e instanceof Error ? e.message : 'RAG failed',
        answer: 'No reliable reference found.',
        reliable: false,
      },
      { status: 500 }
    );
  }
}
