import { NextResponse } from 'next/server';
import {
  buildDefaultChartOfAccounts,
  validateJournalEntry,
  type JournalEntryDraft,
} from '@/lib/enterprise-accounting';

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      entry?: JournalEntryDraft;
      intent?: 'draft' | 'post' | 'suggest';
      fromAi?: boolean;
      approved?: boolean;
    };

    if (!body.entry?.lines?.length) {
      return NextResponse.json(
        { error: 'entry.lines required' },
        { status: 400 }
      );
    }

    const result = validateJournalEntry(body.entry, {
      accounts: buildDefaultChartOfAccounts(),
      intent: body.intent || 'post',
      fromAi: body.fromAi === true,
      approved: body.approved === true,
    });

    return NextResponse.json({ result });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Validation failed' },
      { status: 500 }
    );
  }
}
