import { describe, expect, it } from 'vitest';
import {
  assertEngineeringDecision,
  commitEngineeringDecision,
  decideEngineeringForm,
  explainEngineeringDecisions,
} from '@/lib/design-intelligence/decision-engine';
import { applyEngineeringChange } from '@/lib/design-intelligence/rules-engine';

describe('Engineering Decision Engine', () => {
  it('auto-fills / locks dependent fields from rules after building type', () => {
    const form = decideEngineeringForm({ building_type: 'high_rise' });
    const occupancy = form.fields.find((f) => f.field_key === 'occupancy');
    expect(occupancy?.visible).toBe(true);
    expect(occupancy?.options.length).toBeGreaterThan(0);

    const withOcc = decideEngineeringForm({
      building_type: 'high_rise',
      occupancy: occupancy!.options[0].value,
    });
    const lockedOrAuto = withOcc.fields.filter(
      (f) => f.visible && (f.locked || f.auto_selected || f.control_mode === 'computed')
    );
    expect(lockedOrAuto.length).toBeGreaterThan(0);
    for (const f of lockedOrAuto) {
      expect(f.decision_reason_en.length).toBeGreaterThan(0);
    }
  });

  it('rejects edits to locked fields', () => {
    let form = decideEngineeringForm({ building_type: 'commercial' });
    const occupancyOpt = form.fields.find((f) => f.field_key === 'occupancy')?.options[0]?.value;
    expect(occupancyOpt).toBeTruthy();

    form = commitEngineeringDecision(form.selection, 'occupancy', occupancyOpt!);
    const riskOpt = form.fields.find((f) => f.field_key === 'risk_classification')?.options[0]?.value;
    if (riskOpt) {
      form = commitEngineeringDecision(form.selection, 'risk_classification', riskOpt);
    }

    const locked = form.fields.find((f) => f.locked && f.visible && f.value != null);
    expect(locked).toBeTruthy();
    const before = locked!.value;
    const rejected = commitEngineeringDecision(form.selection, locked!.field_key, 'ILLEGAL_OVERRIDE');
    expect(rejected.selection[locked!.field_key as 'building_type']).toEqual(before);
    expect(rejected.violations.some((v) => v.field_key === locked!.field_key)).toBe(true);
  });

  it('blocks illegal option combinations via applyEngineeringChange', () => {
    const base = decideEngineeringForm({ building_type: 'residential' });
    const rejected = applyEngineeringChange(base.selection, 'occupancy', 'business');
    expect(rejected.violations.some((v) => /Blocked|violates|not a compliant/i.test(v.message))).toBe(
      true
    );
    expect(rejected.selection.occupancy).not.toBe('business');
  });

  it('recalculates downstream when upstream changes', () => {
    let form = decideEngineeringForm({ building_type: 'commercial' });
    const occ = form.fields.find((f) => f.field_key === 'occupancy')!.options[0].value;
    form = commitEngineeringDecision(form.selection, 'occupancy', occ);
    const mid = { ...form.selection };

    form = commitEngineeringDecision(form.selection, 'building_type', 'industrial');
    // Downstream cleared / re-evaluated — commercial occupancy must not stick
    expect(form.selection.occupancy).not.toBe(occ);
    expect(form.selection.building_type).toBe('industrial');
    // Previous mid selection is no longer the evaluated cascade
    expect(form.selection).not.toEqual(mid);
  });

  it('assert blocks incomplete cascade and explain returns reasons', () => {
    const empty = assertEngineeringDecision({});
    expect(empty.ok).toBe(false);

    const explained = explainEngineeringDecisions({ building_type: 'warehouse' });
    expect(explained.decisions.length).toBeGreaterThan(0);
    expect(explained.note_en).toMatch(/Decision Engine/i);
    expect(explained.assertion.ok).toBe(false);
  });
});
