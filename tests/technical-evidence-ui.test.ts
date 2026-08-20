import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import TechnicalEvidenceManager, {
  groupForTechnicalEvidenceKind,
  reorderTechnicalEvidenceItems,
} from '@/components/projects/TechnicalEvidenceManager';
import {
  EMPTY_PROJECT_ENGINEERING_DATA,
  EMPTY_TECHNICAL_REPORT,
  type TechnicalEvidenceItem,
} from '@/lib/types/project-reports';

const evidence = (id: string, kind: TechnicalEvidenceItem['kind'], order: number): TechnicalEvidenceItem => ({
  id,
  kind,
  category: kind,
  title: `دليل ${id}`,
  caption: null,
  engineering_observation: null,
  display_order: order,
  include_in_report: false,
  association: null,
  file: {
    id,
    fileName: `${id}.jpg`,
    mimeType: 'image/jpeg',
    sizeBytes: 1024,
    storageBucket: 'project-files',
    storagePath: `client-123/technical-evidence/${kind}/${id}-${id}.jpg`,
    dataUrl: null,
  },
  code_reference: kind === 'code_excerpt' ? {} : null,
  created_at: '2026-08-20T00:00:00.000Z',
});

function renderEvidence(report = EMPTY_TECHNICAL_REPORT) {
  const data = {
    ...EMPTY_PROJECT_ENGINEERING_DATA,
    technical_report: report,
    design_center: {
      ...EMPTY_PROJECT_ENGINEERING_DATA.design_center,
      space_safety: {
        source: 'project_engineering' as const,
        floors: [{
          id: 'floor-1',
          label: 'الأرضي',
          repeat_count: 1,
          areas: [{
            id: 'space-1',
            label: 'الاستقبال',
            area_m2: 40,
            hazard_suggested: '',
            suppression_suggested: [],
            quantities: {
              sprinklers: 0, smoke_detectors: 0, heat_detectors: 0, fire_alarm_panels: 0,
              alarm_panel_locations: [], signs: 0, emergency_lights: 0, emergency_exits: 0,
              alarm_bells: 0, emergency_stairs: 0, manual_extinguishers: 0,
              manual_extinguisher_type: null, manual_extinguisher_size: null, elevators: 0, public_facilities: 0,
            },
          }],
        }],
      },
    },
  };
  return renderToStaticMarkup(createElement(TechnicalEvidenceManager, {
    clientId: 'client-123',
    data,
    report,
    saving: false,
    onChange: vi.fn(),
    onPersistEvidenceMetadata: vi.fn().mockResolvedValue(undefined),
  }));
}

describe('technical evidence Phase 4B UI', () => {
  it('renders the separated evidence UI with its four Arabic groups and safe upload affordance', () => {
    const html = renderEvidence();
    expect(html).toContain('التوثيق والمراجع الفنية');
    expect(html).toContain('الموقع والدفاع المدني');
    expect(html).toContain('صور الوضع الراهن');
    expect(html).toContain('صور أنظمة السلامة');
    expect(html).toContain('مقتطفات الكود والمراجع');
    expect(html).toContain('اسحب الملفات هنا أو اختر للرفع');
    expect(html).toContain('SVG وHTML والملفات غير المعروفة غير مقبولة');
    expect(html).toContain('dir="rtl"');
  });

  it('keeps legacy evidence visible and clearly read-only without converting it to persisted evidence', () => {
    const report = {
      ...EMPTY_TECHNICAL_REPORT,
      facade_photo: {
        id: 'legacy-facade',
        fileName: 'old.jpg',
        mimeType: 'image/jpeg',
        dataUrl: 'data:image/jpeg;base64,AAAA',
      },
      evidence: { version: 1 as const, civil_defense: null, items: [] },
    };
    const html = renderEvidence(report);
    expect(html).toContain('مرفق سابق');
    expect(html).toContain('للعرض فقط');
    expect(html).not.toContain('حذف المرفق السابق');
  });

  it('groups evidence by the Phase 4A kinds and persists display_order through safe move controls', () => {
    expect(groupForTechnicalEvidenceKind('site_general')).toBe('site');
    expect(groupForTechnicalEvidenceKind('satellite_image')).toBe('site');
    expect(groupForTechnicalEvidenceKind('existing_condition')).toBe('existing');
    expect(groupForTechnicalEvidenceKind('safety_system')).toBe('systems');
    expect(groupForTechnicalEvidenceKind('code_excerpt')).toBe('code');

    const ordered = reorderTechnicalEvidenceItems([
      evidence('one', 'existing_condition', 1),
      evidence('two', 'safety_system', 2),
      evidence('three', 'code_excerpt', 3),
    ], 'two', -1);
    expect(ordered.map((item) => item.id)).toEqual(['two', 'one', 'three']);
    expect(ordered.map((item) => item.display_order)).toEqual([1, 2, 3]);
  });

  it('keeps the future-only report-inclusion preference explicit and does not claim PDF integration', () => {
    const html = renderEvidence({
      ...EMPTY_TECHNICAL_REPORT,
      evidence: { version: 1 as const, civil_defense: null, items: [evidence('code-1', 'code_excerpt', 1)] },
    });
    expect(html).toContain('إدراج في التقرير');
    expect(html).toContain('لن يتغير ملف PDF أو الفهرس في هذه المرحلة');
    expect(html).toContain('لا تظهر في PDF الحالي');
  });
});
