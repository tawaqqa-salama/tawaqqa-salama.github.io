import { describe, expect, it } from 'vitest';
import {
  detectDevicesFromAnchors,
  runCoverageAudit,
  sprinklerMaxSpacingM,
  inferHazardClass,
  estimateHydraulicDemand,
  estimateAlarmBattery,
  runPreCalculations,
  buildComplianceReport,
  buildPreDesignAuditHtml,
  metersPerPixelFromScale,
} from '@/lib/projects/design-center/vision';
import type { DetectedZone } from '@/lib/projects/design-center/vision/types';

function zone(partial?: Partial<DetectedZone>): DetectedZone {
  return {
    id: 'z1',
    label: 'Warehouse',
    classification: 'warehouse',
    polygon: [
      { x: 0, y: 0 },
      { x: 200, y: 0 },
      { x: 200, y: 160 },
      { x: 0, y: 160 },
    ],
    area_px: 32000,
    area_m2: 400,
    confidence: 0.7,
    bounds: { x: 0, y: 0, w: 200, h: 160 },
    ...partial,
  };
}

describe('coverageAuditor', () => {
  it('detects sprinkler / smoke / MCP from text anchors', () => {
    const devices = detectDevicesFromAnchors([
      { text: 'SPK-01', x: 10, y: 10 },
      { text: 'Smoke Detector', x: 40, y: 40 },
      { text: 'MCP', x: 80, y: 20 },
      { text: 'ROOM', x: 5, y: 5 },
    ]);
    expect(devices.map((d) => d.kind)).toEqual(
      expect.arrayContaining(['sprinkler', 'smoke_detector', 'manual_call_point'])
    );
  });

  it('uses tighter sprinkler spacing for extra hazard', () => {
    expect(sprinklerMaxSpacingM('extra')).toBeLessThanOrEqual(3.7);
    expect(inferHazardClass([zone()], 'Storage')).toBe('extra');
  });

  it('flags over-spaced sprinklers when scale known', () => {
    const mpp = 0.1; // 10px = 1m → 50px between devices = 5m > 4.6m light max
    const audit = runCoverageAudit({
      zones: [zone({ classification: 'office', label: 'Office', area_m2: 100 })],
      textAnchors: [
        { text: 'SPK', x: 10, y: 10 },
        { text: 'SPK', x: 60, y: 10 },
      ],
      metersPerPixel: mpp,
      occupancy: 'Business',
    });
    expect(audit.issues.some((i) => i.kind === 'over_spaced')).toBe(true);
  });

  it('does not invent coverage compliance when no devices', () => {
    const audit = runCoverageAudit({
      zones: [zone()],
      textAnchors: [],
      metersPerPixel: metersPerPixelFromScale(100, 300),
      occupancy: 'Warehouse',
    });
    expect(audit.devices).toHaveLength(0);
    expect(audit.issues.some((i) => i.kind === 'no_devices')).toBe(true);
  });
});

describe('preCalculations', () => {
  it('estimates hydraulic demand for remote high-hazard zone', () => {
    const hyd = estimateHydraulicDemand({
      zones: [zone()],
      hazard: 'extra',
      zoneRequirements: [
        {
          zone_id: 'z1',
          zone_label: 'Warehouse',
          classification: 'warehouse',
          systems: ['sprinkler'],
          primary_codes: ['NFPA-13'],
          related_codes: [],
          note_ar: '',
          note_en: '',
          sprinkler_density_hint: 'ESFR_OR_HIGH_DENSITY',
        },
      ],
      hasSprinklerDeclared: true,
    });
    expect(hyd.status).toBe('estimated');
    expect(hyd.estimated_flow_gpm).toBeGreaterThan(0);
    expect(hyd.estimated_duration_min).toBe(90);
  });

  it('estimates battery only when detectors exist', () => {
    const empty = estimateAlarmBattery({ coverage: null });
    expect(empty.status).toBe('not_available');

    const withDev = estimateAlarmBattery({
      coverage: {
        devices: [
          {
            id: 'd1',
            kind: 'smoke_detector',
            x: 1,
            y: 1,
            label: 'SD',
            source: 'text_anchor',
            confidence: 0.6,
          },
          {
            id: 'd2',
            kind: 'manual_call_point',
            x: 2,
            y: 2,
            label: 'MCP',
            source: 'text_anchor',
            confidence: 0.6,
          },
        ],
        hazard_class: 'light',
        sprinkler_max_spacing_m: 4.6,
        smoke_max_spacing_m: 9.1,
        issues: [],
        uncovered_samples: [],
        summary_ar: '',
        summary_en: '',
      },
    });
    expect(withDev.status).toBe('estimated');
    expect(withDev.estimated_ah).toBeGreaterThan(0);
  });
});

describe('complianceReport', () => {
  it('marks egress exceedance as CRITICAL_NON_COMPLIANCE', () => {
    const report = buildComplianceReport({
      egress: {
        limit: {
          code: 'SBC-801',
          max_m_without_sprinkler: 45,
          max_m_with_sprinkler: 60,
          applied_max_m: 45,
          has_sprinkler: false,
          note_ar: '',
          note_en: '',
        },
        exits: [],
        assessments: [],
        max_travel_m: 70,
        overall_status: 'exceeds_limit',
      },
      coverage: {
        devices: [],
        hazard_class: 'ordinary',
        sprinkler_max_spacing_m: 4.6,
        smoke_max_spacing_m: 9.1,
        issues: [],
        uncovered_samples: [],
        summary_ar: 'ok',
        summary_en: 'ok',
      },
      zoneRequirements: [],
      preCalculations: runPreCalculations({
        zones: [zone({ area_m2: 50, classification: 'office' })],
        hazard: 'light',
        zoneRequirements: [],
        coverage: null,
        hasSprinklerDeclared: true,
      }),
      hasSprinklerDeclared: false,
      hasFireAlarmDeclared: true,
      scaleKnown: true,
    });
    expect(report.overall_status).toBe('CRITICAL_NON_COMPLIANCE');
    expect(report.items.some((i) => i.id === 'egress-travel')).toBe(true);
  });

  it('builds printable HTML audit package with JSON embedded', () => {
    const html = buildPreDesignAuditHtml(
      {
        status: 'completed',
        engine: 'local_client',
        source_kind: 'pdf',
        file_name: 'a.pdf',
        processed_at: '2026-08-09T00:00:00.000Z',
        width_px: 100,
        height_px: 80,
        dpi: 300,
        scale: {
          ratio_text: '1:100',
          scale_denominator: 100,
          meters_per_pixel: 0.01,
          source: 'drawing_text',
          dpi: 300,
        },
        title_block: {
          project_name: null,
          sheet_number: null,
          drawing_title: null,
          occupancy: 'Business',
          area_m2: null,
          scale_text: null,
          revision: null,
          raw_text: '',
          source: 'none',
        },
        zones: [zone()],
        walls: [],
        text_anchors: [],
        preview_data_url: null,
        egress: null,
        zone_system_requirements: [],
        coverage: null,
        pre_calculations: null,
        compliance_report: {
          generated_at: '2026-08-09T00:00:00.000Z',
          overall_status: 'NEEDS_ENGINEER_REVIEW',
          items: [],
          counts: { compliant: 0, needs_engineer_review: 0, critical: 0 },
        },
        gross_floor_area_m2: 400,
        exits_count: null,
        doors_count: null,
        occupancy: 'Business',
        extracted_text: '',
        warnings_ar: [],
        warnings_en: [],
        error: null,
        error_code: null,
        privacy: 'local_only',
      },
      { projectName: 'Demo', projectId: 'p1', preferAr: true }
    );
    expect(html).toContain('تفريغ الحسابات والمطابقة');
    expect(html).toContain('compliance-json');
  });
});
