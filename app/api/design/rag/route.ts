import { NextResponse } from 'next/server';
import { ragQuery } from '@/lib/design-intelligence/knowledge-base';

/**
 * Offline RAG query endpoint — answers only from indexed company knowledge.
 * Note: full session auth should be enforced via middleware in production.
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { question?: string; topK?: number };
    const question = String(body.question || '').trim();
    if (!question) {
      return NextResponse.json(
        { ok: false, error: 'question required', answer: 'No reliable reference found.' },
        { status: 400 }
      );
    }
    const result = await ragQuery(question, body.topK || 5);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        error: e instanceof Error ? e.message : 'RAG failed',
        answer: 'No reliable reference found.',
      },
      { status: 500 }
    );
  }
}
