import { describe, expect, it } from 'vitest';
import {
  resolveApplicableStandards,
  buildProjectDesignStandardsContext,
  snapshotToArtifactRefs,
  toSystemStandardsSnapshot,
  getStandardsCatalog,
  bindingForCalc,
} from '@/lib/projects/design-center/standards';
import {
  runKnowledgeBackedCalculation,
  runKnowledgeBackedSystemDesign,
} from '@/lib/projects/design-center/knowledge-engine';
import { EMPTY_PROJECT_ENGINEERING_DATA, type ProjectEngineeringData } from '@/lib/types/project-reports';
import { mergeDesignCenterDefaults } from '@/lib/projects/design-center/state';
import type { ClientRecord } from '@/lib/types/client';
import type { FireSystemKind } from '@/lib/projects/design-center/types';
import type { ProjectDesignStandardsContext } from '@/lib/projects/design-center/standards/types';

function client(partial?: Partial<ClientRecord>): ClientRecord {
  return Object.assign(
    {
      id: 'proj-std-1',
      name: 'عميل اختبار',
      business_name: 'منشأة اختبار',
      activity_type: 'office',
      building_area: 2000,
      floors_count: 3,
      quotation_services: ['alarm_plans', 'firefighting_plans', 'hydraulic_calculations'],
    },
    partial
  ) as ClientRecord;
}

function data(partial?: Partial<ProjectEngineeringData>): ProjectEngineeringData {
  return {
    ...EMPTY_PROJECT_ENGINEERING_DATA,
    design_center: mergeDesignCenterDefaults(EMPTY_PROJECT_ENGINEERING_DATA.design_center),
    building_plan: {
      ...EMPTY_PROJECT_ENGINEERING_DATA.building_plan,
      occupancy_classification: 'تجاري',
      fire_alarm_system: 'نعم',
      sprinkler_system: 'نعم',
      floors_description: 'Lobby · Offices · Storage',
      stairs_count: '2',
      exits_count: '3',
      building_height_m: '15',
      total_site_area_m2: '2000',
    },
    plan_attachments: {
      engineering_drawings: [
        {
          id: 'd1',
          fileName: 'plan.pdf',
          format: 'pdf',
          sizeBytes: 10,
          uploadedAt: '2026-01-01',
          kind: 'engineering_drawing',
        },
      ],
      hydraulic_calculations: [],
    },
    ...partial,
  };
}

function codesOf(result: ReturnType<typeof resolveApplicableStandards>) {
  return {
    primary: result.primary.map((r) => r.reference.code),
    saudi: result.saudiCode.map((r) => r.reference.code),
    related: result.related.map((r) => r.reference.code),
    conditional: result.conditional.map((r) => r.reference.code),
  };
}

function baseCtx(overrides?: Partial<ProjectDesignStandardsContext>): ProjectDesignStandardsContext {
  return {
    ...buildProjectDesignStandardsContext(client(), data()),
    ...overrides,
  };
}

describe('standards catalog', () => {
  it('has no invented edition years', () => {
    for (const row of getStandardsCatalog()) {
      expect(row.edition).toBeNull();
    }
  });
});

describe('resolveApplicableStandards — per system isolation', () => {
  const systems: FireSystemKind[] = [
    'fire_alarm',
    'sprinkler',
    'hose_reel',
    'fire_extinguisher',
    'fm200',
    'co2',
    'clean_agent',
    'kitchen_hood',
  ];

  it('resolves all eight design systems without throwing', () => {
    const ctx = baseCtx();
    for (const kind of systems) {
      const result = resolveApplicableStandards(ctx, kind);
      expect(result.primary.length + result.saudiCode.length).toBeGreaterThan(0);
      expect(result.requirementsSummary.reviewStatus).toMatch(
        /needs_engineer_review|partially_verified|not_verified/
      );
    }
  });

  it('Fire Alarm primary is NFPA-72 and does NOT include NFPA-13/14/20', () => {
    const ctx = baseCtx({
      hasFirePump: true,
      hasStandpipe: true,
      hasSprinkler: true,
      quotationServices: ['alarm_plans', 'firefighting_plans', 'hydraulic_calculations'],
    });
    const codes = codesOf(resolveApplicableStandards(ctx, 'fire_alarm'));
    expect(codes.primary).toContain('NFPA-72');
    expect(codes.primary).not.toContain('NFPA-13');
    expect(codes.primary).not.toContain('NFPA-14');
    expect(codes.primary).not.toContain('NFPA-20');
    expect(codes.conditional).not.toContain('NFPA-13');
    expect(codes.conditional).not.toContain('NFPA-20');
    expect(codes.saudi).toContain('SBC-801');
  });

  it('Sprinkler primary is NFPA-13; NFPA-20 only when fire pump present', () => {
    const withoutPump = codesOf(
      resolveApplicableStandards(baseCtx({ hasFirePump: false, hasStandpipe: false }), 'sprinkler')
    );
    expect(withoutPump.primary).toContain('NFPA-13');
    expect(withoutPump.conditional).not.toContain('NFPA-20');

    const withPump = codesOf(
      resolveApplicableStandards(baseCtx({ hasFirePump: true, hasStandpipe: false }), 'sprinkler')
    );
    expect(withPump.primary).toContain('NFPA-13');
    expect(withPump.conditional).toContain('NFPA-20');
  });

  it('Hose Reel primary is NFPA-14', () => {
    const codes = codesOf(resolveApplicableStandards(baseCtx({ hasStandpipe: true }), 'hose_reel'));
    expect(codes.primary).toContain('NFPA-14');
    expect(codes.primary).not.toContain('NFPA-72');
  });

  it('Fire Extinguisher primary is NFPA-10', () => {
    const codes = codesOf(resolveApplicableStandards(baseCtx(), 'fire_extinguisher'));
    expect(codes.primary).toContain('NFPA-10');
  });

  it('FM200 and Clean Agent primary is NFPA-2001', () => {
    expect(codesOf(resolveApplicableStandards(baseCtx(), 'fm200')).primary).toContain('NFPA-2001');
    expect(codesOf(resolveApplicableStandards(baseCtx(), 'clean_agent')).primary).toContain(
      'NFPA-2001'
    );
  });

  it('CO2 primary is NFPA-12 and marked not_verified', () => {
    const result = resolveApplicableStandards(baseCtx(), 'co2');
    expect(codesOf(result).primary).toContain('NFPA-12');
    expect(result.primary[0]?.reference.status).toBe('not_verified');
    expect(result.warnings.some((w) => /NFPA-12/.test(w))).toBe(true);
  });

  it('Kitchen Hood primary is NFPA-96', () => {
    const codes = codesOf(resolveApplicableStandards(baseCtx({ kitchenActivity: true }), 'kitchen_hood'));
    expect(codes.primary).toContain('NFPA-96');
  });
});

describe('occupancy / activity effects', () => {
  it('restaurant kitchen activity adds conditional NFPA-96 on fire_alarm', () => {
    const office = codesOf(
      resolveApplicableStandards(baseCtx({ kitchenActivity: false, activityType: 'office' }), 'fire_alarm')
    );
    expect(office.conditional).not.toContain('NFPA-96');

    const kitchen = codesOf(
      resolveApplicableStandards(
        baseCtx({ kitchenActivity: true, activityType: 'restaurant' }),
        'fire_alarm'
      )
    );
    expect(kitchen.conditional).toContain('NFPA-96');
    expect(kitchen.primary).toContain('NFPA-72');
  });

  it('changing system clears previous system primaries', () => {
    const ctx = baseCtx({ hasFirePump: true });
    const alarm = codesOf(resolveApplicableStandards(ctx, 'fire_alarm'));
    const spr = codesOf(resolveApplicableStandards(ctx, 'sprinkler'));
    expect(alarm.primary).toContain('NFPA-72');
    expect(alarm.primary).not.toContain('NFPA-13');
    expect(spr.primary).toContain('NFPA-13');
    expect(spr.primary).not.toContain('NFPA-72');
  });
});

describe('multi-system project context builder', () => {
  it('detects fire pump from completed pump calculation', () => {
    const eng = data({
      design_center: mergeDesignCenterDefaults({
        ...EMPTY_PROJECT_ENGINEERING_DATA.design_center,
        calculations: [
          {
            kind: 'pump',
            status: 'completed',
            updatedAt: new Date().toISOString(),
            values: { note: 'declared' },
          },
        ],
      }),
    });
    const ctx = buildProjectDesignStandardsContext(client(), eng);
    expect(ctx.hasFirePump).toBe(true);
  });

  it('warehouse / factory / residential contexts still isolate Fire Alarm codes', () => {
    for (const activity of ['warehouse', 'factory', 'residential', 'restaurant']) {
      const ctx = buildProjectDesignStandardsContext(
        client({ activity_type: activity }),
        data()
      );
      const alarm = codesOf(resolveApplicableStandards(ctx, 'fire_alarm'));
      expect(alarm.primary).toContain('NFPA-72');
      expect(alarm.primary).not.toContain('NFPA-13');
      expect(alarm.primary).not.toContain('NFPA-20');
      expect(alarm.conditional).not.toContain('NFPA-13');
    }
  });
});

describe('knowledge-backed system design uses applicability engine', () => {
  it('Fire Alarm artifactRefs do not dump project-wide NFPA-13/20', async () => {
    const result = await runKnowledgeBackedSystemDesign({
      projectId: 'proj-std-1',
      kind: 'fire_alarm',
      context: { client: client(), data: data() },
    });
    expect(result.status).toBe('completed');
    expect(result.standards?.primary.some((p) => p.code === 'NFPA-72')).toBe(true);
    expect(result.standards?.primary.some((p) => p.code === 'NFPA-13')).toBe(false);
    const flat = (result.artifactRefs || []).join(' | ');
    expect(flat).toMatch(/PRIMARY: NFPA-72/);
    expect(flat).not.toMatch(/PRIMARY: NFPA-13/);
    expect(flat).not.toMatch(/أكواد:.*NFPA-13/);
  });

  it('Sprinkler snapshot includes conditional NFPA-20 when pump declared', async () => {
    const eng = data({
      design_center: mergeDesignCenterDefaults({
        calculations: [
          {
            kind: 'pump',
            status: 'completed',
            updatedAt: '2026-08-08T00:00:00.000Z',
            values: {},
          },
        ],
      }),
      building_plan: {
        ...EMPTY_PROJECT_ENGINEERING_DATA.building_plan,
        sprinkler_system: 'نعم',
        occupancy_classification: 'مستودع',
      },
    });
    const result = await runKnowledgeBackedSystemDesign({
      projectId: 'proj-std-1',
      kind: 'sprinkler',
      context: {
        client: client({ activity_type: 'warehouse', quotation_services: ['firefighting_plans'] }),
        data: eng,
      },
    });
    expect(result.standards?.primary.some((p) => p.code === 'NFPA-13')).toBe(true);
    expect(result.standards?.conditional.some((p) => p.code === 'NFPA-20')).toBe(true);
    expect(result.standards?.requirementsSummary.reviewStatus).toBe('needs_engineer_review');
  });

  it('snapshotToArtifactRefs never invents editions', () => {
    const snap = toSystemStandardsSnapshot(
      'fire_alarm',
      resolveApplicableStandards(baseCtx(), 'fire_alarm')
    );
    const lines = snapshotToArtifactRefs(snap);
    expect(lines.every((l) => l.includes('Edition not verified') || l.includes('SAUDI'))).toBe(true);
  });
});

describe('calculation cards use per-calc system binding (not one shared dump)', () => {
  it('maps battery/voltage to fire_alarm and hydraulic/pump to sprinkler', () => {
    expect(bindingForCalc('battery').system).toBe('fire_alarm');
    expect(bindingForCalc('voltage_drop').system).toBe('fire_alarm');
    expect(bindingForCalc('hydraulic').system).toBe('sprinkler');
    expect(bindingForCalc('pump').system).toBe('sprinkler');
    expect(bindingForCalc('pump').forceFirePump).toBe(true);
  });

  it('Battery calc shows NFPA-72 and not NFPA-13/20', async () => {
    const result = await runKnowledgeBackedCalculation({
      projectId: 'proj-std-1',
      kind: 'battery',
      context: { client: client(), data: data() },
    });
    expect(result.status).toBe('needs_engineer_review');
    expect(result.authority).toBe('advisory');
    expect(result.standards?.system).toBe('fire_alarm');
    expect(result.standards?.primary.some((p) => p.code === 'NFPA-72')).toBe(true);
    expect(result.standards?.primary.some((p) => p.code === 'NFPA-13')).toBe(false);
    expect(String(result.values?.codes || '')).toContain('NFPA-72');
    expect(String(result.values?.codes || '')).not.toContain('NFPA-13');
  });

  it('Hydraulic and Battery do not share the same primary codes', async () => {
    const hyd = await runKnowledgeBackedCalculation({
      projectId: 'proj-std-1',
      kind: 'hydraulic',
      context: { client: client(), data: data() },
    });
    const bat = await runKnowledgeBackedCalculation({
      projectId: 'proj-std-1',
      kind: 'battery',
      context: { client: client(), data: data() },
    });
    const hydPrimary = hyd.standards?.primary.map((p) => p.code) || [];
    const batPrimary = bat.standards?.primary.map((p) => p.code) || [];
    expect(hydPrimary).toContain('NFPA-13');
    expect(batPrimary).toContain('NFPA-72');
    expect(hydPrimary).not.toEqual(batPrimary);
  });

  it('Pump calc includes conditional NFPA-20', async () => {
    const result = await runKnowledgeBackedCalculation({
      projectId: 'proj-std-1',
      kind: 'pump',
      context: { client: client(), data: data() },
    });
    expect(result.standards?.conditional.some((p) => p.code === 'NFPA-20')).toBe(true);
  });
});
