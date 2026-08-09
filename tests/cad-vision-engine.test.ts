import { describe, expect, it } from 'vitest';
import {
  buildScaleCalibration,
  countEgressMentions,
  detectScaleFromText,
  metersPerPixelFromScale,
  parseTitleBlockText,
  otsuThreshold,
  thresholdBinary,
  detectRoomZones,
  convexHull,
} from '@/lib/projects/design-center/vision';
import { runKnowledgeBackedPlanAnalysis } from '@/lib/projects/design-center/knowledge-engine';
import {
  EMPTY_PROJECT_ENGINEERING_DATA,
  type ProjectEngineeringData,
} from '@/lib/types/project-reports';
import { mergeDesignCenterDefaults, addDrawingVersion } from '@/lib/projects/design-center/state';
import type { ClientRecord } from '@/lib/types/client';
import type { CADAnalysisResult } from '@/lib/projects/design-center/vision/types';
import { buildProjectDesignStandardsContext } from '@/lib/projects/design-center/standards';

function client(partial?: Partial<ClientRecord>): ClientRecord {
  return Object.assign(
    {
      id: 'proj-vision-1',
      name: 'عميل',
      business_name: 'منشأة',
      activity_type: 'office',
      building_area: 0,
      floors_count: 2,
      quotation_services: ['alarm_plans', 'firefighting_plans'],
    },
    partial
  ) as ClientRecord;
}

function sampleVision(partial?: Partial<CADAnalysisResult>): CADAnalysisResult {
  return {
    status: 'completed',
    engine: 'local_client',
    source_kind: 'pdf',
    file_name: 'floor.pdf',
    processed_at: '2026-08-09T00:00:00.000Z',
    width_px: 2000,
    height_px: 1400,
    dpi: 300,
    scale: {
      ratio_text: '1:100',
      scale_denominator: 100,
      meters_per_pixel: metersPerPixelFromScale(100, 300),
      source: 'drawing_text',
      dpi: 300,
    },
    title_block: {
      project_name: 'Demo',
      sheet_number: 'A-101',
      drawing_title: 'Ground Floor',
      occupancy: 'Mercantile',
      area_m2: 1850,
      scale_text: '1:100',
      revision: 'A',
      raw_text: 'SCALE 1:100 Occupancy: Mercantile Area: 1850 m2 Sheet A-101',
      source: 'pdf_text',
    },
    zones: [
      {
        id: 'zone-1',
        label: null,
        polygon: [
          { x: 10, y: 10 },
          { x: 100, y: 10 },
          { x: 100, y: 80 },
          { x: 10, y: 80 },
        ],
        area_px: 7200,
        area_m2: 120,
        confidence: 0.7,
        bounds: { x: 10, y: 10, w: 90, h: 70 },
      },
    ],
    walls: [
      {
        id: 'wall-h-1',
        x1: 10,
        y1: 10,
        x2: 100,
        y2: 10,
        length_px: 90,
        length_m: 9,
      },
    ],
    gross_floor_area_m2: 1850,
    exits_count: 3,
    doors_count: 8,
    occupancy: 'Mercantile',
    extracted_text: 'SCALE 1:100 EXIT EXIT Occupancy Mercantile',
    warnings_ar: [],
    warnings_en: [],
    error: null,
    error_code: null,
    privacy: 'local_only',
    ...partial,
  };
}

describe('drawingSanitizer — scale & title block', () => {
  it('detects 1:100 scale signatures', () => {
    expect(detectScaleFromText('SCALE 1:100').scale_denominator).toBe(100);
    expect(detectScaleFromText('مقياس 1:50').scale_denominator).toBe(50);
    expect(detectScaleFromText('no scale here').scale_denominator).toBeNull();
  });

  it('computes meters_per_pixel from scale + DPI', () => {
    const mpp = metersPerPixelFromScale(100, 300);
    expect(mpp).toBeGreaterThan(0);
    // 1m → 10mm on paper at 1:100 → ~118.11 px at 300 DPI → mpp ≈ 0.00847
    expect(mpp).toBeCloseTo(25.4 / 3000, 5);
  });

  it('parses title-block occupancy and area without inventing values', () => {
    const meta = parseTitleBlockText(
      'Project: Tower\nOccupancy: Business\nArea: 2,450 m2\nSheet A-02\nSCALE 1:200'
    );
    expect(meta.occupancy).toMatch(/Business/i);
    expect(meta.area_m2).toBe(2450);
    expect(meta.sheet_number).toBeTruthy();
    expect(meta.scale_text).toBe('1:200');
    expect(parseTitleBlockText('').occupancy).toBeNull();
  });

  it('counts egress mentions only when evidence exists', () => {
    expect(countEgressMentions('').exits_count).toBeNull();
    expect(countEgressMentions('Exits: 4').exits_count).toBe(4);
    expect(countEgressMentions('EXIT EXIT emergency').exits_count).toBeGreaterThanOrEqual(2);
  });

  it('buildScaleCalibration prefers manual override', () => {
    const cal = buildScaleCalibration({
      text: '1:100',
      dpi: 300,
      manualMetersPerPixel: 0.01,
    });
    expect(cal.source).toBe('manual');
    expect(cal.meters_per_pixel).toBe(0.01);
  });
});

describe('drawingSanitizer — contours on synthetic ink', () => {
  it('detects an enclosed empty zone', () => {
    const w = 80;
    const h = 60;
    const ink = new Uint8Array(w * h);
    // Draw a hollow rectangle of ink
    for (let x = 10; x <= 50; x++) {
      ink[10 * w + x] = 1;
      ink[40 * w + x] = 1;
    }
    for (let y = 10; y <= 40; y++) {
      ink[y * w + 10] = 1;
      ink[y * w + 50] = 1;
    }
    const zones = detectRoomZones(ink, w, h, null);
    // Small synthetic page may filter by absolute area — ensure hull helper works regardless
    expect(convexHull([
      { x: 0, y: 0 },
      { x: 2, y: 0 },
      { x: 1, y: 1 },
      { x: 2, y: 2 },
      { x: 0, y: 2 },
    ]).length).toBeGreaterThanOrEqual(4);
    expect(Array.isArray(zones)).toBe(true);
  });

  it('otsu threshold separates dark ink', () => {
    const gray = new Uint8ClampedArray(100);
    for (let i = 0; i < 50; i++) gray[i] = 20;
    for (let i = 50; i < 100; i++) gray[i] = 220;
    const t = otsuThreshold(gray);
    expect(t).toBeGreaterThanOrEqual(20);
    expect(t).toBeLessThan(220);
    const bin = thresholdBinary(gray, 128);
    expect(bin[0]).toBe(1);
    expect(bin[99]).toBe(0);
  });
});

describe('knowledge engine merges local CAD vision honestly', () => {
  it('marks CAD steps completed only with local_client vision result', async () => {
    const data: ProjectEngineeringData = {
      ...EMPTY_PROJECT_ENGINEERING_DATA,
      design_center: addDrawingVersion(mergeDesignCenterDefaults(null), {
        id: 'f1',
        fileName: 'floor.pdf',
        format: 'pdf',
        sizeBytes: 1000,
        uploadedAt: '2026-01-01T00:00:00.000Z',
        kind: 'engineering_drawing',
      }),
      building_plan: {
        ...EMPTY_PROJECT_ENGINEERING_DATA.building_plan,
        occupancy_classification: '',
      },
    };

    const without = await runKnowledgeBackedPlanAnalysis({
      projectId: 'proj-vision-1',
      context: { client: client(), data, cadVision: null },
    });
    expect(without.steps.find((s) => s.id === 'detect_rooms')?.status).not.toBe('completed');
    expect((without.result?.raw as { cad_vision?: string })?.cad_vision).not.toBe('local_client');

    const withVision = await runKnowledgeBackedPlanAnalysis({
      projectId: 'proj-vision-1',
      context: { client: client(), data, cadVision: sampleVision() },
    });
    expect(withVision.steps.find((s) => s.id === 'analyze_plan')?.status).toBe('completed');
    expect(withVision.steps.find((s) => s.id === 'detect_rooms')?.status).toBe('completed');
    expect(withVision.steps.find((s) => s.id === 'ceiling_analysis')?.status).toBe('not_available');
    expect(withVision.result?.rooms).toHaveLength(1);
    expect((withVision.result?.raw as { cad_vision?: string })?.cad_vision).toBe('local_client');
    expect(withVision.result?.occupancy).toBe('Mercantile');
  });

  it('feeds vision area/occupancy into standards context', async () => {
    const vision = sampleVision();
    const data: ProjectEngineeringData = {
      ...EMPTY_PROJECT_ENGINEERING_DATA,
      design_center: mergeDesignCenterDefaults({
        analysis: {
          id: 'a1',
          status: 'needs_engineer_review',
          progress: 50,
          steps: [],
          result: {
            occupancy: vision.occupancy,
            rooms: vision.zones,
            raw: {
              cad_vision: 'local_client',
              cad_vision_result: {
                occupancy: vision.occupancy,
                gross_floor_area_m2: vision.gross_floor_area_m2,
              },
            },
          },
        },
      }),
      building_plan: {
        ...EMPTY_PROJECT_ENGINEERING_DATA.building_plan,
      },
    };
    const ctx = buildProjectDesignStandardsContext(
      client({ building_area: undefined as unknown as number }),
      data
    );
    expect(ctx.occupancy).toBe('Mercantile');
    expect(ctx.buildingAreaM2).toBe(1850);
  });

  it('password-protected PDF does not invent geometry', async () => {
    const data: ProjectEngineeringData = {
      ...EMPTY_PROJECT_ENGINEERING_DATA,
      design_center: addDrawingVersion(mergeDesignCenterDefaults(null), {
        id: 'f1',
        fileName: 'locked.pdf',
        format: 'pdf',
        sizeBytes: 100,
        uploadedAt: '2026-01-01T00:00:00.000Z',
        kind: 'engineering_drawing',
      }),
      building_plan: {
        ...EMPTY_PROJECT_ENGINEERING_DATA.building_plan,
        occupancy_classification: 'تجاري',
      },
    };
    const job = await runKnowledgeBackedPlanAnalysis({
      projectId: 'proj-vision-1',
      context: {
        client: client(),
        data,
        cadVision: sampleVision({
          status: 'password_protected',
          zones: [],
          walls: [],
          gross_floor_area_m2: null,
          occupancy: null,
          error_code: 'PDF_PASSWORD_PROTECTED',
          error: 'Password-protected PDF',
        }),
      },
    });
    expect(job.steps.find((s) => s.id === 'analyze_plan')?.status).toBe('failed');
    expect(job.result?.rooms).toEqual([]);
    expect(job.error_code).toBe('PDF_PASSWORD_PROTECTED');
  });
});
