import { NextResponse } from 'next/server';
import {
  assertEngineeringDecision,
  commitEngineeringDecision,
  decideEngineeringForm,
  explainEngineeringDecisions,
} from '@/lib/design-intelligence/decision-engine';
import type { EngineeringFieldKey, EngineeringSelection } from '@/lib/design-intelligence/rules-types';

/**
 * Engineering Decision Engine API.
 * Controls cascade / commits field changes / asserts compliance / explains decisions.
 * No free-form AI values — Rules Engine is the only source of truth.
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      action?: 'evaluate' | 'decide' | 'change' | 'commit' | 'recommend' | 'explain' | 'assert';
      selection?: EngineeringSelection;
      fieldKey?: string;
      value?: string | string[] | null;
    };
    const selection = body.selection || {};
    const action = body.action || 'decide';

    if (action === 'change' || action === 'commit') {
      if (!body.fieldKey) {
        return NextResponse.json({ ok: false, error: 'fieldKey required' }, { status: 400 });
      }
      const form = commitEngineeringDecision(
        selection,
        body.fieldKey as EngineeringFieldKey,
        body.value ?? null
      );
      const assertion = assertEngineeringDecision(form);
      return NextResponse.json({ ok: true, assertion, ...form });
    }

    if (action === 'recommend' || action === 'explain') {
      return NextResponse.json({ ok: true, ...explainEngineeringDecisions(selection) });
    }

    if (action === 'assert') {
      const form = decideEngineeringForm(selection);
      return NextResponse.json({ ok: true, form, assertion: assertEngineeringDecision(form) });
    }

    const form = decideEngineeringForm(selection);
    return NextResponse.json({
      ok: true,
      assertion: assertEngineeringDecision(form),
      ...form,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'Decision evaluation failed' },
      { status: 500 }
    );
  }
}
