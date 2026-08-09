import { describe, expect, it } from 'vitest';
import {
  classifyLabelText,
  enrichZonesWithLabels,
  bindZoneToSystems,
  collectZoneSystemRequirements,
  applyManualZoneOverride,
  longestDiagonal,
  sbc801TravelDistanceLimit,
  runEgressAnalysis,
  applyZoneOverridesToCadResult,
  metersPerPixelFromScale,
} from '@/lib/projects/design-center/vision';
import type { CADAnalysisResult, DetectedZone } from '@/lib/projects/design-center/vision/types';
import { buildProjectDesignStandardsContext } from '@/lib/projects/design-center/standards';
import {
  EMPTY_PROJECT_ENGINEERING_DATA,
  type ProjectEngineeringData,
} from '@/lib/types/project-reports';
import { mergeDesignCenterDefaults } from '@/lib/projects/design-center/state';
import type { ClientRecord } from '@/lib/types/client';

function zone(partial?: Partial<DetectedZone>): DetectedZone {
  return {
    id: 'zone-1',
    label: null,
    polygon: [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 60 },
      { x: 0, y: 60 },
    ],
    area_px: 6000,
    area_m2: null,
    confidence: 0.6,
    bounds: { x: 0, y: 0, w: 100, h: 60 },
    ...partial,
  };
}

describe('zoneAnalyzer', () => {
  it('classifies kitchen / electrical / warehouse labels', () => {
    expect(classifyLabelText('Commercial Kitchen').classification).toBe('kitchen');
    expect(classifyLabelText('MDB Room').classification).toBe('electrical_room');
    expect(classifyLabelText('High Piled Warehouse').classification).toBe('warehouse');
    expect(classifyLabelText('').classification).toBe('unknown');
  });

  it('binds zones to specialized systems and codes', () => {
    const kitchen = bindZoneToSystems(zone({ classification: 'kitchen', label: 'Kitchen' }));
    expect(kitchen?.systems).toContain('kitchen_hood');
    expect(kitchen?.primary_codes).toContain('NFPA-96');

    const elec = bindZoneToSystems(
      zone({ classification: 'electrical_room', label: 'MDB' })
    );
    expect(elec?.systems).toEqual(expect.arrayContaining(['fm200', 'clean_agent', 'co2']));
    expect(elec?.primary_codes).toContain('NFPA-2001');

    const wh = bindZoneToSystems(zone({ classification: 'warehouse', label: 'Storage' }));
    expect(wh?.sprinkler_density_hint).toBe('ESFR_OR_HIGH_DENSITY');
    expect(wh?.primary_codes).toContain('NFPA-13');
  });

  it('labels zones from nearby text anchors and computes m² with scale', () => {
    const mpp = metersPerPixelFromScale(100, 300);
    const zones = enrichZonesWithLabels(
      [zone()],
      [{ text: 'Kitchen', x: 40, y: 30 }],
      mpp
    );
    expect(zones[0].classification).toBe('kitchen');
    expect(zones[0].area_m2).toBeGreaterThan(0);
    expect(zones[0].needs_engineer_label).toBe(false);
  });

  it('applies manual override without inventing classification from empty text', () => {
    const next = applyManualZoneOverride(
      zone({ classification: 'unknown', needs_engineer_label: true }),
      { label: 'Server Room', classification: 'server_room', area_m2: 42 },
      null
    );
    expect(next.label_source).toBe('manual');
    expect(next.classification).toBe('server_room');
    expect(next.area_m2).toBe(42);
    expect(next.needs_engineer_label).toBe(false);
  });
});

describe('egressEngine', () => {
  it('computes longest diagonal of a rectangle', () => {
    const d = longestDiagonal([
      { x: 0, y: 0 },
      { x: 30, y: 0 },
      { x: 30, y: 40 },
      { x: 0, y: 40 },
    ]);
    expect(d?.length_px).toBeCloseTo(50, 5);
  });

  it('applies SBC 801 45/60 m caps', () => {
    expect(sbc801TravelDistanceLimit({ hasSprinkler: false }).applied_max_m).toBe(45);
    expect(sbc801TravelDistanceLimit({ hasSprinkler: true }).applied_max_m).toBe(60);
  });

  it('flags travel distance exceeding limit when scale known', () => {
    // Large polygon in meters via mpp=1 → diagonal huge
    const big = zone({
      id: 'z-big',
      polygon: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 80 },
        { x: 0, y: 80 },
      ],
      bounds: { x: 0, y: 0, w: 100, h: 80 },
    });
    const result = runEgressAnalysis({
      zones: [big],
      textAnchors: [{ text: 'EXIT', x: 0, y: 0 }],
      width_px: 200,
      height_px: 200,
      metersPerPixel: 1,
      hasSprinkler: false,
      occupancy: 'Mercantile',
    });
    expect(result.overall_status).toBe('exceeds_limit');
    expect(result.assessments[0].travel_distance_m).toBeGreaterThan(45);
  });

  it('returns scale_unknown when meters_per_pixel missing', () => {
    const result = runEgressAnalysis({
      zones: [zone()],
      textAnchors: [],
      width_px: 200,
      height_px: 200,
      metersPerPixel: null,
      hasSprinkler: true,
    });
    expect(result.overall_status).toBe('scale_unknown');
  });
});

describe('zone requirements → applicability context', () => {
  it('marks kitchen activity and special suppression from detected zones', () => {
    const data: ProjectEngineeringData = {
      ...EMPTY_PROJECT_ENGINEERING_DATA,
      design_center: mergeDesignCenterDefaults({
        analysis: {
          id: 'a1',
          status: 'needs_engineer_review',
          progress: 40,
          steps: [],
          result: {
            rooms: [],
            raw: {
              cad_vision: 'local_client',
              cad_vision_result: {
                occupancy: 'Mercantile',
                gross_floor_area_m2: 2000,
                zone_system_requirements: collectZoneSystemRequirements([
                  zone({ id: 'k1', classification: 'kitchen', label: 'Kitchen' }),
                  zone({ id: 'e1', classification: 'electrical_room', label: 'MDB' }),
                ]),
              },
            },
          },
        },
      }),
    };
    const ctx = buildProjectDesignStandardsContext(
      {
        id: 'p1',
        name: 'c',
        business_name: 'b',
        activity_type: 'office',
        building_area: 2000,
        floors_count: 2,
        quotation_services: ['alarm_plans'],
      } as ClientRecord,
      data
    );
    expect(ctx.kitchenActivity).toBe(true);
    expect(ctx.specialSuppression).toEqual(
      expect.arrayContaining(['kitchen_hood', 'fm200', 'clean_agent', 'co2'])
    );
    expect(ctx.selectedSystems).toEqual(
      expect.arrayContaining(['kitchen_hood', 'fm200'])
    );
  });
});

describe('applyZoneOverridesToCadResult', () => {
  it('recomputes egress after manual label change', () => {
    const base: CADAnalysisResult = {
      status: 'completed',
      engine: 'local_client',
      source_kind: 'pdf',
      file_name: 'a.pdf',
      processed_at: '2026-08-09T00:00:00.000Z',
      width_px: 400,
      height_px: 300,
      dpi: 300,
      scale: {
        ratio_text: '1:100',
        scale_denominator: 100,
        meters_per_pixel: metersPerPixelFromScale(100, 300),
        source: 'drawing_text',
        dpi: 300,
      },
      title_block: {
        project_name: null,
        sheet_number: null,
        drawing_title: null,
        occupancy: 'Business',
        area_m2: null,
        scale_text: '1:100',
        revision: null,
        raw_text: '',
        source: 'pdf_text',
      },
      zones: [zone({ id: 'z1', classification: 'unknown', needs_engineer_label: true })],
      walls: [],
      text_anchors: [{ text: 'EXIT', x: 5, y: 5 }],
      preview_data_url: null,
      egress: null,
      zone_system_requirements: [],
      coverage: null,
      pre_calculations: null,
      compliance_report: null,
      gross_floor_area_m2: null,
      exits_count: 1,
      doors_count: null,
      occupancy: 'Business',
      extracted_text: '',
      warnings_ar: [],
      warnings_en: [],
      error: null,
      error_code: null,
      privacy: 'local_only',
    };
    const next = applyZoneOverridesToCadResult(
      base,
      [{ zone_id: 'z1', label: 'Kitchen', classification: 'kitchen' }],
      { hasSprinkler: true }
    );
    expect(next.zones[0].classification).toBe('kitchen');
    expect(next.zone_system_requirements.some((r) => r.systems.includes('kitchen_hood'))).toBe(
      true
    );
    expect(next.egress?.assessments.length).toBe(1);
    expect(next.egress?.limit.applied_max_m).toBe(60);
  });
});
