import { describe, expect, it } from 'vitest';
import {
  buildingPlanPatchFromInspection,
  clientFieldHintsFromInspection,
  detectDrawingType,
  extractBuildingMetrics,
  extractZoneDetails,
  inspectDrawing,
} from '@/lib/projects/design-center/vision/drawingInspector';
import { metersPerPixelFromScale } from '@/lib/projects/design-center/vision/drawingSanitizer';
import type { CADAnalysisResult, DetectedZone } from '@/lib/projects/design-center/vision/types';
import { buildProjectDesignStandardsContext } from '@/lib/projects/design-center/standards';
import { runKnowledgeBackedPlanAnalysis } from '@/lib/projects/design-center/knowledge-engine';
import { addDrawingVersion, mergeDesignCenterDefaults } from '@/lib/projects/design-center/state';
import {
  EMPTY_PROJECT_ENGINEERING_DATA,
  type ProjectEngineeringData,
} from '@/lib/types/project-reports';
import type { ClientRecord } from '@/lib/types/client';

function zone(partial: Partial<DetectedZone> & { id: string }): DetectedZone {
  return {
    label: null,
    polygon: [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ],
    area_px: 100,
    area_m2: 40,
    confidence: 0.7,
    bounds: { x: 0, y: 0, w: 10, h: 10 },
    ...partial,
  };
}

function sampleVision(partial?: Partial<CADAnalysisResult>): CADAnalysisResult {
  return {
    status: 'completed',
    engine: 'local_client',
    source_kind: 'pdf',
    file_name: 'A-101.pdf',
    processed_at: '2026-08-09T00:00:00.000Z',
    width_px: 2000,
    height_px: 1400,
    dpi: 300,
    scale: {
      ratio_text: '1:100',
      scale_denominator: 100,
      meters_per_pixel: metersPerPixelFromScale(100, 300),
      source: 'title_block',
      dpi: 300,
    },
    title_block: {
      project_name: 'Demo Mall',
      sheet_number: 'A-101',
      drawing_title: 'Ground Floor Plan',
      occupancy: 'Mercantile',
      area_m2: 1850,
      scale_text: '1:100',
      revision: 'A',
      raw_text:
        'TITLE: Architectural Floor Plan SCALE 1:100 Occupancy: Mercantile Area: 1850 m2 Sheet A-101 Ground Floor · Typical Floors x3 · Roof Floor',
      source: 'pdf_text',
    },
    zones: [
      zone({
        id: 'z1',
        label: 'Warehouse',
        label_ar: 'مستودع',
        classification: 'warehouse',
        area_m2: 400,
      }),
      zone({
        id: 'z2',
        label: 'Electrical Room',
        classification: 'electrical_room',
        area_m2: 28,
      }),
      zone({
        id: 'z3',
        label: 'Kitchen',
        classification: 'kitchen',
        area_m2: 55,
      }),
      zone({
        id: 'z4',
        label: 'Offices',
        classification: 'office',
        area_m2: 120,
      }),
    ],
    walls: [],
    text_anchors: [
      { text: 'Warehouse', x: 20, y: 20 },
      { text: 'EXIT', x: 5, y: 5 },
    ],
    preview_data_url: null,
    egress: null,
    zone_system_requirements: [],
    coverage: null,
    pre_calculations: null,
    compliance_report: null,
    gross_floor_area_m2: 1850,
    exits_count: 2,
    doors_count: 4,
    occupancy: 'Mercantile',
    extracted_text:
      'Architectural Floor Plan SCALE 1:100 Ground Floor Mezzanine Typical Floors x3 Roof Floor Area: 1850 m2',
    warnings_ar: [],
    warnings_en: [],
    error: null,
    error_code: null,
    privacy: 'local_only',
    ...partial,
  };
}

describe('drawingInspector', () => {
  it('detectDrawingType classifies architectural / fire / HVAC / site', () => {
    expect(detectDrawingType('Architectural Floor Plan Sheet A-102').type).toBe('architectural');
    expect(detectDrawingType('Fire Alarm System FAS smoke detectors', null, [
      { text: 'SMOKE DETECTOR' },
    ]).type).toBe('fire_alarm');
    expect(detectDrawingType('Sprinkler Fire Fighting Layout FF-01').type).toBe('fire_fighting');
    expect(detectDrawingType('HVAC Mechanical Duct Layout تكييف').type).toBe('mechanical_hvac');
    expect(detectDrawingType('Overall Site Plan مخطط عام').type).toBe('combined_site');
    expect(detectDrawingType('إنذار حريق', { sheet_number: 'FA-03' } as never).type).toBe(
      'fire_alarm'
    );
  });

  it('extractBuildingMetrics reads floors, GFA, and scale', () => {
    const metrics = extractBuildingMetrics({
      text: 'Ground Floor · Mezzanine · Typical Floors x3 · Roof Floor · عدد الأدوار: 6 · SCALE 1:50 · Area: 2400 m2',
      titleBlock: {
        project_name: null,
        sheet_number: 'A-1',
        drawing_title: 'Floor plans',
        occupancy: 'Business',
        area_m2: 2400,
        scale_text: '1:50',
        revision: null,
        raw_text: '',
        source: 'pdf_text',
      },
    });
    expect(metrics.scale.ratio_text).toBe('1:50');
    expect(metrics.total_area_m2).toBe(2400);
    expect(metrics.floors_count).toBe(6);
    expect(metrics.floors.some((f) => f.kind === 'ground')).toBe(true);
    expect(metrics.floors.some((f) => f.kind === 'mezzanine')).toBe(true);
    expect(metrics.floors.some((f) => f.kind === 'typical' && f.count_hint === 3)).toBe(true);
    expect(metrics.floors.some((f) => f.kind === 'roof')).toBe(true);
  });

  it('extractZoneDetails lists use and area without mutating input', () => {
    const zones = [
      zone({ id: 'a', label: 'Warehouse', classification: 'warehouse', area_m2: 90 }),
      zone({ id: 'b', label: null, nearby_text: 'Kitchen', area_m2: 30 }),
    ];
    const snapshot = zones.map((z) => ({ ...z, polygon: z.polygon.map((p) => ({ ...p })) }));
    const details = extractZoneDetails(zones);
    expect(details).toHaveLength(2);
    expect(details[0].use).toBe('warehouse');
    expect(details[0].area_m2).toBe(90);
    expect(details[1].use).toBe('kitchen');
    expect(zones).toEqual(snapshot);
  });

  it('inspectDrawing builds a full inspection-only report', () => {
    const report = inspectDrawing(sampleVision());
    expect(report.mode).toBe('inspection_only');
    expect(report.drawing_type.type).toBe('architectural');
    expect(report.building.total_area_m2).toBe(1850);
    expect(report.building.scale.ratio_text).toBe('1:100');
    expect(report.building.floors_count).toBeGreaterThanOrEqual(4);
    expect(report.zones.length).toBe(4);
    expect(report.zones.some((z) => z.use === 'warehouse')).toBe(true);
  });

  it('feeds building_plan patch + client hints for applicability', () => {
    const report = inspectDrawing(
      sampleVision({
        extracted_text: 'Fire Alarm System FA-02 Ground Floor SCALE 1:100 Area: 900 m2',
        title_block: {
          project_name: 'X',
          sheet_number: 'FA-02',
          drawing_title: 'Fire Alarm',
          occupancy: 'Business',
          area_m2: 900,
          scale_text: '1:100',
          revision: null,
          raw_text: 'Fire Alarm System FA-02',
          source: 'pdf_text',
        },
        gross_floor_area_m2: 900,
      })
    );
    expect(report.drawing_type.type).toBe('fire_alarm');
    const patch = buildingPlanPatchFromInspection(report);
    expect(patch.total_site_area_m2).toBe('900');
    expect(patch.fire_alarm_system).toBe('نعم');
    expect(String(patch.floors_description || '')).toMatch(/أرضي/);
    const hints = clientFieldHintsFromInspection(report);
    expect(hints.building_area).toBe(900);
    expect(hints.floors_count).toBeGreaterThanOrEqual(1);
  });

  it('persists drawing_inspection on knowledge-backed analysis and feeds standards context', async () => {
    const client = {
      id: 'insp-1',
      client_code: 'INS-1',
      name: 'عميل',
      business_name: 'منشأة',
      activity_type: 'office',
      building_area: 0,
      floors_count: 0,
      quotation_services: [],
    } as ClientRecord;

    const data: ProjectEngineeringData = {
      ...EMPTY_PROJECT_ENGINEERING_DATA,
      design_center: addDrawingVersion(mergeDesignCenterDefaults(null), {
        id: 'f-insp',
        fileName: 'a.pdf',
        format: 'pdf',
        sizeBytes: 1000,
        uploadedAt: '2026-01-01T00:00:00.000Z',
        kind: 'engineering_drawing',
      }),
      building_plan: { ...EMPTY_PROJECT_ENGINEERING_DATA.building_plan },
    };

    const analysis = await runKnowledgeBackedPlanAnalysis({
      projectId: client.id,
      sheetId: data.design_center.sheets[0]?.id,
      context: { client, data, cadVision: sampleVision() },
    });

    const raw = analysis.result?.raw as {
      cad_vision_result?: { drawing_inspection?: { building?: { floors_count?: number } } };
    };
    expect(raw.cad_vision_result?.drawing_inspection?.building?.floors_count).toBeGreaterThan(0);

    const fed = {
      ...data,
      design_center: {
        ...data.design_center,
        analysis,
      },
      building_plan: {
        ...data.building_plan,
        ...buildingPlanPatchFromInspection(
          inspectDrawing(sampleVision())
        ),
      },
    };

    const ctx = buildProjectDesignStandardsContext(client, fed);
    expect(ctx.buildingAreaM2).toBe(1850);
    expect(ctx.floorsCount).toBeGreaterThan(0);
    expect(ctx.occupancy).toBeTruthy();
  });
});
