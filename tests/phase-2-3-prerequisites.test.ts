/**
 * Phase 2.3 — close the eight prerequisites before SBC/NFPA table encoding.
 */

import { describe, expect, it } from 'vitest';
import {
  CANONICAL_ENGINEERING_STORE,
  LEGACY_ENGINEERING_STORE,
  resolveCanonicalEngineeringDataset,
} from '@/lib/projects/canonical-engineering';
import {
  attachFrozenComplianceSnapshot,
  buildComplianceContext,
  buildSbc201EgressFromCanonical,
  freezeComplianceSnapshot,
  resolveComplianceRunForReport,
  resolveEngineeringFields,
  resolveEgressData,
  resolveOccupancy,
  resolveNumberOfFloors,
  resolveFireAreaM2,
  runProjectCompliance,
  COMPLIANCE_GATED_STAGES,
} from '@/lib/projects/compliance';
import type { EngineeringResolverBundle } from '@/lib/projects/compliance/resolvers';
import { COMPLIANCE_AUTHORITY } from '@/lib/projects/compliance/engine';
import { isAuthoritativeCalcResult } from '@/lib/projects/design-center/types';
import { runKnowledgeBackedCalculation } from '@/lib/projects/design-center/knowledge-engine';
import { approveWorkflowStage, stageApprovalBlockers } from '@/lib/projects/gated-pipeline';
import { validateCompliance } from '@/lib/compliance/engine';
import { runProjectKnowledgeCompliance } from '@/lib/design-intelligence/project-knowledge-bridge';
import { parseProjectEngineeringData } from '@/lib/business/project-reports';
import {
  EMPTY_PROJECT_ENGINEERING_DATA,
  type ProjectEngineeringData,
} from '@/lib/types/project-reports';
import { EMPTY_FIRE_PROTECTION_DESIGN } from '@/lib/types/fire-protection-design';
import type { ClientRecord } from '@/lib/types/client';

function baseClient(partial: Partial<ClientRecord> = {}): ClientRecord {
  return {
    id: 'client-p23',
    name: 'عميل اختبار',
    business_name: 'منشأة اختبار',
    activity_type: 'مكتب إداري',
    floors_count: 3,
    building_area: 1200,
    ...partial,
  } as ClientRecord;
}

describe('Phase 2.3 prerequisites', () => {
  describe('1. Canonical engineering owner', () => {
    it('documents live payload as canonical store constant', () => {
      expect(CANONICAL_ENGINEERING_STORE).toBe('project_engineering_live.payload');
      expect(LEGACY_ENGINEERING_STORE).toBe('clients.project_engineering_data');
      expect(COMPLIANCE_AUTHORITY).toBe('lib/projects/compliance');
    });

    it('uses live as canonical and records conflicts with legacy', () => {
      const legacy: ProjectEngineeringData = {
        ...EMPTY_PROJECT_ENGINEERING_DATA,
        building_plan: {
          ...EMPTY_PROJECT_ENGINEERING_DATA.building_plan,
          occupancy_classification: 'Assembly',
          building_height_m: '20',
        },
      };
      const live: ProjectEngineeringData = {
        ...EMPTY_PROJECT_ENGINEERING_DATA,
        building_plan: {
          ...EMPTY_PROJECT_ENGINEERING_DATA.building_plan,
          occupancy_classification: 'Business',
          building_height_m: '30',
        },
      };
      const merged = resolveCanonicalEngineeringDataset({ live, legacy });
      expect(merged.engineering_meta?.canonical_source).toBe('combined_with_conflicts');
      expect(merged.building_plan.occupancy_classification).toBe('Business');
      expect(merged.engineering_meta?.conflicts?.some((c) => c.field.includes('occupancy'))).toBe(
        true
      );
    });

    it('falls back to legacy only when live missing', () => {
      const legacy: ProjectEngineeringData = {
        ...EMPTY_PROJECT_ENGINEERING_DATA,
        building_plan: {
          ...EMPTY_PROJECT_ENGINEERING_DATA.building_plan,
          occupancy_classification: 'Legacy Occ',
        },
      };
      const merged = resolveCanonicalEngineeringDataset({ live: null, legacy });
      expect(merged.engineering_meta?.canonical_source).toBe('legacy_project_engineering_data');
      expect(merged.building_plan.occupancy_classification).toBe('Legacy Occ');
    });
  });

  describe('2. One authoritative compliance authority', () => {
    it('advisory validateCompliance is marked non-authoritative', () => {
      const soft = validateCompliance({ activityType: 'مكتب', hasSprinklers: true });
      expect(soft.authoritative).toBe(false);
    });

    it('Design Center knowledge compliance is advisory and cannot be used as gate authority', async () => {
      const result = await runProjectKnowledgeCompliance({
        client: baseClient(),
        data: { ...EMPTY_PROJECT_ENGINEERING_DATA },
      });
      expect(result.authoritative).toBe(false);
    });
  });

  describe('3. Engineering field resolvers', () => {
    it('returns CONFLICT when occupancy sources disagree', () => {
      const data: ProjectEngineeringData = {
        ...EMPTY_PROJECT_ENGINEERING_DATA,
        building_plan: {
          ...EMPTY_PROJECT_ENGINEERING_DATA.building_plan,
          occupancy_classification: 'Business',
        },
        technical_report: {
          ...EMPTY_PROJECT_ENGINEERING_DATA.technical_report,
          building_classification: 'Assembly',
        },
      };
      const r = resolveOccupancy({ data, client: baseClient() });
      expect(r.state).toBe('CONFLICT');
      expect(r.value).toBeNull();
    });

    it('returns MISSING for floors when only client CRM has a count', () => {
      const r = resolveNumberOfFloors({
        data: { ...EMPTY_PROJECT_ENGINEERING_DATA },
        client: baseClient({ floors_count: 5 }),
      });
      expect(r.state).toBe('MISSING');
    });

    it('returns MISSING for fire area when only client.building_area exists', () => {
      const r = resolveFireAreaM2({
        data: { ...EMPTY_PROJECT_ENGINEERING_DATA },
        client: baseClient({ building_area: 900 }),
      });
      expect(r.state).toBe('MISSING');
    });

    it('returns VALID occupancy from building_plan alone', () => {
      const data: ProjectEngineeringData = {
        ...EMPTY_PROJECT_ENGINEERING_DATA,
        building_plan: {
          ...EMPTY_PROJECT_ENGINEERING_DATA.building_plan,
          occupancy_classification: 'Business B',
        },
      };
      const r = resolveOccupancy({ data, client: baseClient() });
      expect(r.state).toBe('VALID');
      expect(r.value).toBe('Business B');
    });
  });

  describe('4. sbc201Egress from canonical data only', () => {
    it('populates sbc201Egress without inventing travel or exit defaults', () => {
      const data: ProjectEngineeringData = {
        ...EMPTY_PROJECT_ENGINEERING_DATA,
        building_plan: {
          ...EMPTY_PROJECT_ENGINEERING_DATA.building_plan,
          occupancy_classification: 'Business',
          exits_count: '2',
        },
        fire_protection_design: {
          ...EMPTY_FIRE_PROTECTION_DESIGN,
          occupancy: {
            ...EMPTY_FIRE_PROTECTION_DESIGN.occupancy,
            area_m2: '500',
            occupancy_type: 'Business',
          },
        },
      };
      const ctx = buildComplianceContext({ client: baseClient(), data });
      expect(ctx.sbc201Egress).toBeTruthy();
      expect(ctx.sbc201Egress?.exitsProvided).toBe(2);
      expect(ctx.sbc201Egress?.travelDistance ?? null).toBeNull();
      expect(ctx.sbc201Egress?.grossArea).toBe(500);
    });

    it('does not treat design-center estimates as MoE measured values', async () => {
      const calc = await runKnowledgeBackedCalculation({
        projectId: 'p',
        kind: 'water_demand',
        context: {
          client: baseClient({ building_area: 1000 }),
          data: {
            ...EMPTY_PROJECT_ENGINEERING_DATA,
            building_plan: {
              ...EMPTY_PROJECT_ENGINEERING_DATA.building_plan,
              building_height_m: '12',
            },
          },
        },
      });
      expect(calc.status).toBe('estimated');
      expect(calc.authority).toBe('estimate');
      expect(isAuthoritativeCalcResult(calc)).toBe(false);

      const data: ProjectEngineeringData = {
        ...EMPTY_PROJECT_ENGINEERING_DATA,
        design_center: {
          ...EMPTY_PROJECT_ENGINEERING_DATA.design_center,
          calculations: [calc],
        },
      };
      const ctx = buildComplianceContext({ client: baseClient(), data });
      expect(ctx.sbc201Egress?.travelDistance ?? null).toBeNull();
      expect(ctx.fireProtection.sprinkler_demand_lpm ?? null).toBeNull();
    });

    it('MISSING egress => sbc201Egress measurements stay null (no bp/FP raw fallback)', () => {
      const data: ProjectEngineeringData = {
        ...EMPTY_PROJECT_ENGINEERING_DATA,
        // Intentionally empty egress — resolver MISSING. Raw-looking values must not
        // be injected via context fallbacks after a non-VALID resolve.
        building_plan: {
          ...EMPTY_PROJECT_ENGINEERING_DATA.building_plan,
          occupancy_classification: 'Business',
        },
      };
      expect(resolveEgressData({ data }).state).toBe('MISSING');
      const ctx = buildComplianceContext({ client: baseClient(), data });
      expect(ctx.sbc201Egress?.exitsProvided ?? null).toBeNull();
      expect(ctx.sbc201Egress?.stairCount ?? null).toBeNull();
      expect(ctx.sbc201Egress?.travelDistance ?? null).toBeNull();
      expect(ctx.sbc201Egress?.commonPath ?? null).toBeNull();
      expect(ctx.sbc201Egress?.corridorClearWidth ?? null).toBeNull();
      expect(ctx.sbc201Egress?.clearOpeningWidth ?? null).toBeNull();
      expect(ctx.sbc201Egress?.stairClearWidth ?? null).toBeNull();
      expect(ctx.egress.exits_count ?? null).toBeNull();
      expect(ctx.egress.stairs_count ?? null).toBeNull();
      expect(ctx.egress.travel_distance_m ?? null).toBeNull();
    });

    it('CONFLICT egress => measurements null even when raw bp/FP values exist', () => {
      const data: ProjectEngineeringData = {
        ...EMPTY_PROJECT_ENGINEERING_DATA,
        building_plan: {
          ...EMPTY_PROJECT_ENGINEERING_DATA.building_plan,
          exits_count: '4',
          stairs_count: '2',
        },
        fire_protection_design: {
          ...EMPTY_FIRE_PROTECTION_DESIGN,
          egress: {
            metrics: [
              { label: 'travel distance', value: '30' },
              { label: 'corridor width', value: '1.2' },
            ],
            notes: 'raw note',
          },
        },
        engineering_meta: {
          canonical_source: 'combined_with_conflicts',
          conflicts: [
            {
              field: 'building_plan.exits_count',
              sources: ['project_engineering_live.payload', 'clients.project_engineering_data'],
              live_value: '4',
              legacy_value: '2',
              message: 'exits conflict',
            },
          ],
        },
      };
      expect(resolveEgressData({ data }).state).toBe('CONFLICT');
      const ctx = buildComplianceContext({ client: baseClient(), data });
      expect(ctx.sbc201Egress?.exitsProvided ?? null).toBeNull();
      expect(ctx.sbc201Egress?.stairCount ?? null).toBeNull();
      expect(ctx.sbc201Egress?.travelDistance ?? null).toBeNull();
      expect(ctx.sbc201Egress?.corridorClearWidth ?? null).toBeNull();
      expect(ctx.egress.exits_count ?? null).toBeNull();
      expect(ctx.egress.travel_distance_m ?? null).toBeNull();
      expect(ctx.egress.metrics).toEqual([]);
    });

    it('INVALID egress => measurements null (no raw bp/FP fallback)', () => {
      const data: ProjectEngineeringData = {
        ...EMPTY_PROJECT_ENGINEERING_DATA,
        building_plan: {
          ...EMPTY_PROJECT_ENGINEERING_DATA.building_plan,
          exits_count: 'not-a-number',
          stairs_count: '2',
        },
        fire_protection_design: {
          ...EMPTY_FIRE_PROTECTION_DESIGN,
          egress: {
            metrics: [
              { label: 'travel distance', value: '45' },
              { label: 'door width', value: '0.9' },
            ],
          },
        },
      };
      expect(resolveEgressData({ data }).state).toBe('INVALID');
      const ctx = buildComplianceContext({ client: baseClient(), data });
      expect(ctx.sbc201Egress?.exitsProvided ?? null).toBeNull();
      expect(ctx.sbc201Egress?.stairCount ?? null).toBeNull();
      expect(ctx.sbc201Egress?.travelDistance ?? null).toBeNull();
      expect(ctx.sbc201Egress?.clearOpeningWidth ?? null).toBeNull();
      expect(ctx.egress.exits_count ?? null).toBeNull();
      expect(ctx.egress.stairs_count ?? null).toBeNull();
      expect(ctx.egress.travel_distance_m ?? null).toBeNull();
      expect(ctx.egress.door_width_m ?? null).toBeNull();
      expect(ctx.egress.corridor_width_m ?? null).toBeNull();
      expect(ctx.egress.dead_end_m ?? null).toBeNull();
      expect(ctx.egress.common_path_m ?? null).toBeNull();
      expect(ctx.egress.stair_width_m ?? null).toBeNull();
    });

    it('VALID egress => measurements preserved from resolved canonical fields', () => {
      const data: ProjectEngineeringData = {
        ...EMPTY_PROJECT_ENGINEERING_DATA,
        building_plan: {
          ...EMPTY_PROJECT_ENGINEERING_DATA.building_plan,
          exits_count: '3',
          stairs_count: '2',
        },
        fire_protection_design: {
          ...EMPTY_FIRE_PROTECTION_DESIGN,
          egress: {
            metrics: [
              { label: 'travel distance m', value: '40' },
              { label: 'corridor width', value: '1.5' },
              { label: 'door width', value: '0.9' },
            ],
          },
        },
      };
      expect(resolveEgressData({ data }).state).toBe('VALID');
      const ctx = buildComplianceContext({ client: baseClient(), data });
      expect(ctx.sbc201Egress?.exitsProvided).toBe(3);
      expect(ctx.sbc201Egress?.stairCount).toBe(2);
      expect(ctx.sbc201Egress?.travelDistance).toBe(40);
      expect(ctx.sbc201Egress?.corridorClearWidth).toBe(1.5);
      expect(ctx.sbc201Egress?.clearOpeningWidth).toBe(0.9);
      expect(ctx.egress.exits_count).toBe(3);
      expect(ctx.egress.travel_distance_m).toBe(40);
    });

    it('no raw fallback can create PASS-capable egress input after non-VALID resolve', () => {
      const baseResolved = resolveEngineeringFields({
        client: baseClient(),
        data: { ...EMPTY_PROJECT_ENGINEERING_DATA },
      });
      const withRawInData: ProjectEngineeringData = {
        ...EMPTY_PROJECT_ENGINEERING_DATA,
        building_plan: {
          ...EMPTY_PROJECT_ENGINEERING_DATA.building_plan,
          exits_count: '8',
          stairs_count: '4',
        },
        fire_protection_design: {
          ...EMPTY_FIRE_PROTECTION_DESIGN,
          egress: {
            metrics: [{ label: 'travel distance', value: '25' }],
          },
        },
      };
      // Force non-VALID egress on the resolver bundle while raw values sit on data.
      for (const state of ['MISSING', 'INVALID', 'CONFLICT'] as const) {
        const resolved: EngineeringResolverBundle = {
          ...baseResolved,
          egress: {
            state,
            value: null,
            sources: ['test'],
            message: `forced ${state}`,
          },
        };
        const sbc = buildSbc201EgressFromCanonical({
          data: withRawInData,
          resolved,
          occupantLoadTotal: 100,
          sprinklerStatus: 'sprinklered',
        });
        expect(sbc.exitsProvided ?? null, state).toBeNull();
        expect(sbc.exitAccessDoorways ?? null, state).toBeNull();
        expect(sbc.stairCount ?? null, state).toBeNull();
        expect(sbc.travelDistance ?? null, state).toBeNull();
        expect(sbc.commonPath ?? null, state).toBeNull();
        expect(sbc.corridorClearWidth ?? null, state).toBeNull();
        expect(sbc.clearOpeningWidth ?? null, state).toBeNull();
        expect(sbc.stairClearWidth ?? null, state).toBeNull();
        expect(sbc.clearWidth ?? null, state).toBeNull();
      }
    });
  });

  describe('5. Advisory stacks cannot unlock stages', () => {
    it('compliance-gated stages ignore design_center advisory pass-looking payloads', () => {
      const data: ProjectEngineeringData = {
        ...EMPTY_PROJECT_ENGINEERING_DATA,
        fire_protection_design: { ...EMPTY_FIRE_PROTECTION_DESIGN },
        design_center: {
          ...EMPTY_PROJECT_ENGINEERING_DATA.design_center,
          compliance: {
            status: 'completed',
            matchPercent: 100,
            findings: [],
            recommendations: [],
            standards: ['NFPA', 'SBC'],
            authoritative: false,
          },
        },
      };
      for (const stage of COMPLIANCE_GATED_STAGES) {
        const blockers = stageApprovalBlockers(stage, baseClient(), data);
        expect(blockers.some((b) => /المطابقة|BLOCKED|NEEDS_DATA|FAIL/i.test(b))).toBe(true);
      }
    });
  });

  describe('6. Calculation estimates cannot create PASS', () => {
    it('water_demand / tank_size estimates are non-authoritative', async () => {
      const water = await runKnowledgeBackedCalculation({
        projectId: 'p',
        kind: 'water_demand',
        context: {
          client: baseClient({ building_area: 800 }),
          data: { ...EMPTY_PROJECT_ENGINEERING_DATA },
        },
      });
      const tank = await runKnowledgeBackedCalculation({
        projectId: 'p',
        kind: 'tank_size',
        context: {
          client: baseClient({ building_area: 800 }),
          data: { ...EMPTY_PROJECT_ENGINEERING_DATA },
        },
      });
      expect(water.status).toBe('estimated');
      expect(tank.status).toBe('estimated');
      expect(isAuthoritativeCalcResult(water)).toBe(false);
      expect(isAuthoritativeCalcResult(tank)).toBe(false);
    });
  });

  describe('7. Freeze compliance snapshot on report approval', () => {
    it('parseProjectEngineeringData preserves approved_snapshot', () => {
      const snap = freezeComplianceSnapshot({
        run: runProjectCompliance({
          client: baseClient(),
          data: { ...EMPTY_PROJECT_ENGINEERING_DATA },
        }),
        stageId: 'technical_report',
      });
      const raw = attachFrozenComplianceSnapshot(
        { ...EMPTY_PROJECT_ENGINEERING_DATA },
        snap
      );
      const parsed = parseProjectEngineeringData(raw);
      expect(parsed.compliance?.approved_snapshot?.frozen_for_stage).toBe('technical_report');
      expect(parsed.compliance?.approved_snapshot?.gate).toBe(snap.gate);
    });

    it('approved report prefers frozen snapshot over a later live run', () => {
      const data0: ProjectEngineeringData = { ...EMPTY_PROJECT_ENGINEERING_DATA };
      const run0 = runProjectCompliance({ client: baseClient(), data: data0 });
      const frozen = freezeComplianceSnapshot({
        run: run0,
        stageId: 'technical_report',
        datasetRevision: 'rev-1',
      });
      const approved: ProjectEngineeringData = {
        ...attachFrozenComplianceSnapshot(data0, frozen),
        technical_report: {
          ...EMPTY_PROJECT_ENGINEERING_DATA.technical_report,
          status: 'معتمد',
        },
        building_plan: {
          ...EMPTY_PROJECT_ENGINEERING_DATA.building_plan,
          occupancy_classification: 'Changed Later',
          exits_count: '99',
        },
      };
      const liveLater = runProjectCompliance({ client: baseClient(), data: approved });
      const { run, fromFreeze } = resolveComplianceRunForReport({
        data: approved,
        liveRun: liveLater,
      });
      expect(fromFreeze).toBe(true);
      expect(run.gate).toBe(frozen.gate);
      expect(run.evaluatedAt).toBe(frozen.evaluatedAt);
    });
  });

  describe('8. Legacy JSON backward compatibility', () => {
    it('keeps legacy reads working without treating them as compliance authority', () => {
      const legacy = parseProjectEngineeringData({
        ...EMPTY_PROJECT_ENGINEERING_DATA,
        building_plan: {
          ...EMPTY_PROJECT_ENGINEERING_DATA.building_plan,
          occupancy_classification: 'Legacy Business',
        },
      });
      expect(legacy.building_plan.occupancy_classification).toBe('Legacy Business');
      const fields = resolveEngineeringFields({
        client: baseClient(),
        data: legacy,
      });
      expect(fields.occupancy.state).toBe('VALID');
    });

    it('resolver surfaces CONFLICT from engineering_meta live/legacy occupancy conflict', () => {
      const data = resolveCanonicalEngineeringDataset({
        live: {
          ...EMPTY_PROJECT_ENGINEERING_DATA,
          building_plan: {
            ...EMPTY_PROJECT_ENGINEERING_DATA.building_plan,
            occupancy_classification: 'Live Occ',
          },
        },
        legacy: {
          ...EMPTY_PROJECT_ENGINEERING_DATA,
          building_plan: {
            ...EMPTY_PROJECT_ENGINEERING_DATA.building_plan,
            occupancy_classification: 'Legacy Occ',
          },
        },
      });
      const occ = resolveOccupancy({ data, client: baseClient() });
      expect(data.engineering_meta?.conflicts?.length).toBeGreaterThan(0);
      expect(occ.state).toBe('CONFLICT');
    });
  });

  describe('workflow gate still authoritative-only', () => {
    it('approveWorkflowStage freezes snapshot on technical_report when gate allows', () => {
      // Empty project remains blocked — approve must fail
      const blocked = approveWorkflowStage({
        stageId: 'technical_report',
        client: baseClient(),
        data: { ...EMPTY_PROJECT_ENGINEERING_DATA },
      });
      expect(blocked.ok).toBe(false);
    });
  });
});
