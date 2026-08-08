import { NextResponse } from 'next/server';
import { memoryStore } from '@/lib/whatsapp/store/memory';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const conversation = memoryStore.getConversation(id);
  if (!conversation) {
    return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
  }
  const client = memoryStore.getClient(conversation.customer_id);
  const messages = memoryStore.listMessages(id);
  const opportunities = memoryStore.listOpportunities(conversation.customer_id);
  const extractions = memoryStore.listExtractions(id);
  const attachments = memoryStore.listAttachments(conversation.customer_id);
  return NextResponse.json({
    ok: true,
    conversation,
    customer: client,
    messages,
    opportunities,
    extractions,
    attachments,
  });
}

export async function PATCH(request: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const body = (await request.json()) as {
    status?: 'open' | 'pending' | 'closed';
    assigned_user_id?: string | null;
    markRead?: boolean;
    userId?: string;
  };
  if (body.markRead) memoryStore.markConversationRead(id, body.userId);
  const conversation = memoryStore.updateConversation(
    id,
    {
      ...(body.status ? { status: body.status } : {}),
      ...(body.assigned_user_id !== undefined
        ? { assigned_user_id: body.assigned_user_id }
        : {}),
    },
    body.userId
  );
  if (!conversation) {
    return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
  }
  return NextResponse.json({ ok: true, conversation });
}
