import { NextResponse } from 'next/server';
import {
  applyEngineeringChange,
  evaluateEngineeringForm,
  recommendFromRules,
} from '@/lib/design-intelligence/rules-engine';
import type { EngineeringFieldKey, EngineeringSelection } from '@/lib/design-intelligence/rules-types';

/**
 * Engineering Rules Engine API — evaluates cascade / applies a field change.
 * No free-form AI values; response is always rules-derived.
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      action?: 'evaluate' | 'change' | 'recommend';
      selection?: EngineeringSelection;
      fieldKey?: string;
      value?: string | string[] | null;
    };
    const selection = body.selection || {};
    const action = body.action || 'evaluate';

    if (action === 'change') {
      if (!body.fieldKey) {
        return NextResponse.json({ ok: false, error: 'fieldKey required' }, { status: 400 });
      }
      const form = applyEngineeringChange(
        selection,
        body.fieldKey as EngineeringFieldKey,
        body.value ?? null
      );
      return NextResponse.json({ ok: true, ...form });
    }

    if (action === 'recommend') {
      return NextResponse.json({ ok: true, ...recommendFromRules(selection) });
    }

    const form = evaluateEngineeringForm(selection);
    return NextResponse.json({ ok: true, ...form });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'Rules evaluation failed' },
      { status: 500 }
    );
  }
}
