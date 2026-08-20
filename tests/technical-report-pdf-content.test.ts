import { describe, expect, it } from 'vitest';
import { EMPTY_PROJECT_ENGINEERING_DATA, EMPTY_TECHNICAL_REPORT } from '@/lib/types/project-reports';
import type { ClientRecord } from '@/lib/types/client';
import { generateTechnicalReportDocument } from '@/lib/projects/technical-report-document';
import {
  codeEvidenceReferenceLines,
  selectTechnicalReportPdfContent,
  selectTechnicalReportPdfEvidence,
  selectTechnicalReportPdfRecommendations,
} from '@/lib/projects/technical-report-pdf-content';
import { documentToFlowBlocks } from '@/lib/projects/engineering-report-engine/renderer/flow-document';
import { buildEngineeringStudyHtml } from '@/lib/projects/engineering-report-engine/print-html';
import {
  EVIDENCE_MEDIA_FALLBACK_AR,
  inspectEvidenceMediaPresentation,
} from '@/lib/projects/technical-report-media-presentation';

const TINY_IMAGE = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl3bx0AAAAASUVORK5CYII=';
function pngWithDimensions(width: number, height: number): string {
  const bytes = new Uint8Array(24);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return `data:image/png;base64,${Buffer.from(bytes).toString('base64')}`;
}
const LARGE_IMAGE = pngWithDimensions(1600, 900);
const client: ClientRecord = {
  id: 'client-phase4e',
  client_code: 'P4E-01',
  name: 'منشأة اختبار التكامل',
  business_name: 'منشأة اختبار التكامل',
  owner_name: 'مالك الاختبار',
  city: 'الرياض',
  building_area: 100,
  floors_count: 1,
};

function reportFixture() {
  return {
    ...EMPTY_TECHNICAL_REPORT,
    general_recommendations: [
      { id: 'rec_follow_design', checked: true },
      { id: 'rec_training', checked: true },
    ],
    recommendations_v2: {
      version: 1 as const,
      items: [
        {
          id: 'approved-1', library_item_id: 'rec_follow_design', library_version: 'test', status: 'approved' as const,
          effective_text_ar: 'الالتزام بالتنفيذ وفق التصاميم والمخططات المعتمدة بالكامل', manual_override: false,
          sort_order: 2, fingerprint: 'approved-1', affected_scopes: [], evidence_ids: [], code_evidence_ids: [],
          source: 'office_template' as const, approved_at: '2026-08-20T00:00:00.000Z',
        },
        {
          id: 'edited-1', library_item_id: 'rec-link', library_version: 'test', status: 'edited' as const,
          effective_text_ar: 'نص مهندس نهائي معدل لا يُستبدل بنص المكتبة', manual_override: true,
          sort_order: 1, fingerprint: 'edited-1', affected_scopes: [], evidence_ids: [], code_evidence_ids: [],
          source: 'engineer_manual' as const, approved_at: '2026-08-20T00:00:00.000Z',
        },
        {
          id: 'suggested-1', library_item_id: 'suggested', library_version: 'test', status: 'suggested' as const,
          effective_text_ar: 'توصية مقترحة لا يجب أن تظهر', manual_override: false,
          sort_order: 3, fingerprint: 'suggested-1', affected_scopes: [], evidence_ids: [], code_evidence_ids: [],
          source: 'office_template' as const,
        },
        {
          id: 'rejected-1', library_item_id: 'rejected', library_version: 'test', status: 'rejected' as const,
          effective_text_ar: 'توصية مرفوضة لا يجب أن تظهر', manual_override: false,
          sort_order: 4, fingerprint: 'rejected-1', affected_scopes: [], evidence_ids: [], code_evidence_ids: [],
          source: 'office_template' as const,
        },
        {
          id: 'manual-unapproved', library_item_id: 'manual-unapproved', library_version: 'test', status: 'suggested' as const,
          effective_text_ar: 'توصية يدوية غير معتمدة لا يجب أن تظهر', manual_override: true,
          sort_order: 5, fingerprint: 'manual:unapproved', affected_scopes: [], evidence_ids: [], code_evidence_ids: [],
          source: 'engineer_manual' as const,
        },
      ],
    },
    evidence: {
      version: 1 as const,
      civil_defense: {
        center_name: 'مركز الدفاع المدني المرتبط بالدراسة',
        distance_value: 2.5,
        distance_unit: 'km' as const,
        travel_time_minutes: 6,
        source_label: 'بيانات أدخلها المهندس',
      },
      items: [
        {
          id: 'site-1', kind: 'site_general' as const, category: 'site_general', title: 'الموقع العام', caption: 'صورة الموقع العام', engineering_observation: 'وصف مهندس للموقع.', display_order: 1, include_in_report: true,
          association: null, file: { id: 'site-1', fileName: 'site.png', mimeType: 'image/png', dataUrl: LARGE_IMAGE, storagePath: 'private/path-must-not-print.png' }, code_reference: null, created_at: '2026-08-20T00:00:00.000Z',
        },
        {
          id: 'map-1', kind: 'satellite_image' as const, category: 'satellite_image', title: 'صورة جوية', caption: 'صورة جوية للموقع', engineering_observation: null, display_order: 2, include_in_report: true,
          association: null, file: { id: 'map-1', fileName: 'map.png', mimeType: 'image/png', dataUrl: LARGE_IMAGE }, code_reference: null, created_at: '2026-08-20T00:00:00.000Z',
        },
        {
          id: 'existing-1', kind: 'existing_condition' as const, category: 'المخارج', title: 'مخرج الدور الأرضي', caption: 'الوضع الراهن — مخرج الدور الأرضي', engineering_observation: 'ملاحظة محفوظة فقط.', display_order: 3, include_in_report: true,
          association: { floor_id: 'floor-1', space_id: 'space-1' }, file: { id: 'existing-1', fileName: 'existing.png', mimeType: 'image/png', dataUrl: LARGE_IMAGE }, code_reference: null, created_at: '2026-08-20T00:00:00.000Z',
        },
        {
          id: 'system-1', kind: 'safety_system' as const, category: 'fire_alarm_panel', title: 'لوحة إنذار الحريق', caption: 'نظام إنذار الحريق', engineering_observation: null, display_order: 4, include_in_report: true,
          association: { system_key: 'fire_alarm_panel' }, file: { id: 'system-1', fileName: 'alarm.png', mimeType: 'image/png', dataUrl: LARGE_IMAGE }, code_reference: null, created_at: '2026-08-20T00:00:00.000Z',
        },
        {
          id: 'code-1', kind: 'code_excerpt' as const, category: 'code_reference', title: 'مقتطف SBC', caption: 'مقتطف مرجعي مرفق', engineering_observation: 'يرتبط بقسم الإنذار.', display_order: 5, include_in_report: true,
          association: { report_section_id: 'alarm' }, file: { id: 'code-1', fileName: 'sbc.png', mimeType: 'image/png', dataUrl: LARGE_IMAGE },
          code_reference: { source_standard: 'SBC 801', edition: '2024', chapter: '8', clause: '8.2.1', page_number: 12, related_report_section: 'الإنذار' }, created_at: '2026-08-20T00:00:00.000Z',
        },
        {
          id: 'pdf-1', kind: 'code_excerpt' as const, category: 'code_reference', title: 'مرفق PDF مرجعي', caption: 'ملف PDF مرجعي', engineering_observation: null, display_order: 6, include_in_report: true,
          association: null, file: { id: 'pdf-1', fileName: 'reference.pdf', mimeType: 'application/pdf', storagePath: 'client/technical-evidence/code_excerpt/reference.pdf' },
          code_reference: { source_standard: 'NFPA 72', clause: '10.5' }, created_at: '2026-08-20T00:00:00.000Z',
        },
        {
          id: 'failed-1', kind: 'existing_condition' as const, category: 'المداخل', title: 'دليل تعذر تحميله', caption: 'مرفق مفقود', engineering_observation: null, display_order: 7, include_in_report: true,
          association: null, file: { id: 'failed-1', fileName: 'missing.png', mimeType: 'image/png', storagePath: 'client/technical-evidence/existing_condition/missing.png' }, code_reference: null, created_at: '2026-08-20T00:00:00.000Z',
        },
        {
          id: 'excluded-1', kind: 'safety_system' as const, category: 'sprinkler', title: 'دليل غير مختار', caption: 'لا يجب أن يظهر', engineering_observation: null, display_order: 8, include_in_report: false,
          association: null, file: { id: 'excluded-1', fileName: 'excluded.png', mimeType: 'image/png', dataUrl: LARGE_IMAGE }, code_reference: null, created_at: '2026-08-20T00:00:00.000Z',
        },
      ],
    },
  };
}

const data = (report: ReturnType<typeof reportFixture>) => ({
  ...EMPTY_PROJECT_ENGINEERING_DATA,
  technical_report: report,
});

function allDocumentText(document: ReturnType<typeof generateTechnicalReportDocument>) {
  return document.sections
    .flatMap((section) => [
      section.title_ar,
      ...section.paragraphs.map((paragraph) => paragraph.text),
      ...(section.tables || []).flatMap((table) => table.rows.flat()),
      ...(section.images || []).flatMap((image) => [image.caption_ar, image.src]),
    ])
    .join('\n');
}

function allFigures(blocks: ReturnType<typeof documentToFlowBlocks>['blocks']) {
  const figures: Array<{ figureNo: number }> = [];
  const walk = (items: typeof blocks) => {
    for (const item of items) {
      if (item.kind === 'figure') figures.push(item);
      if (item.kind === 'figure_row') figures.push(...item.figures);
      if (item.kind === 'unit') walk(item.blocks);
    }
  };
  walk(blocks);
  return figures;
}

describe('Phase 4E PDF content selection', () => {
  it('includes only final engineer decisions in stable order and preserves safe legacy compatibility', () => {
    const report = reportFixture();
    const selected = selectTechnicalReportPdfRecommendations(report);
    expect(selected.map((item) => item.text)).toEqual([
      'نص مهندس نهائي معدل لا يُستبدل بنص المكتبة',
      'الالتزام بالتنفيذ وفق التصاميم والمخططات المعتمدة بالكامل',
      'تدريب العاملين على خطة الإخلاء واستخدام معدات الإطفاء الأولية',
    ]);
    expect(selected.map((item) => item.text).join(' ')).not.toContain('مقترحة');
    expect(selected.map((item) => item.text).join(' ')).not.toContain('مرفوضة');
    expect(selected.map((item) => item.text).join(' ')).not.toContain('غير معتمدة');
  });

  it('detects tiny and unavailable raster media before visual layout without mutating evidence selection', () => {
    expect(inspectEvidenceMediaPresentation(TINY_IMAGE, 'image/png')).toMatchObject({
      state: 'tiny', intrinsic_width: 1, intrinsic_height: 1,
    });
    expect(inspectEvidenceMediaPresentation(null, 'image/png')).toMatchObject({ state: 'unavailable' });

    const report = reportFixture();
    report.evidence.items[3].file.dataUrl = TINY_IMAGE;
    const groups = selectTechnicalReportPdfEvidence(report);
    const system = groups.find((group) => group.group === 'safety_system');
    expect(system?.items.find((item) => item.id === 'system-1')?.image_src).toBeNull();
    expect(system?.paragraphs.join(' ')).toContain(EVIDENCE_MEDIA_FALLBACK_AR);
    expect(groups.flatMap((group) => group.items).map((item) => item.id)).not.toContain('excluded-1');
  });

  it('selects only explicitly included evidence and classifies it without persisting display URLs', () => {
    const report = reportFixture();
    const groups = selectTechnicalReportPdfEvidence(report);
    expect(groups.map((group) => group.group)).toEqual([
      'site_access',
      'existing_condition',
      'safety_system',
      'code_evidence',
    ]);
    expect(groups.flatMap((group) => group.items).map((item) => item.id)).not.toContain('excluded-1');
    expect(groups.find((group) => group.group === 'site_access')?.paragraphs.join(' ')).toContain('مركز الدفاع المدني المرتبط بالدراسة');
    expect(groups.find((group) => group.group === 'code_evidence')?.items.find((item) => item.id === 'pdf-1')?.image_src).toBeNull();
    expect(report.evidence.items[0].file.dataUrl).toBe(LARGE_IMAGE);
    expect(report.evidence.items[0].file.storagePath).toContain('private/path');
  });

  it('keeps structured code metadata literal and does not fabricate missing references', () => {
    expect(codeEvidenceReferenceLines({ source_standard: 'SBC 801', clause: '8.2.1', page_number: 12 })).toEqual([
      'المرجع: SBC 801',
      'البند: 8.2.1',
      'الصفحة: 12',
    ]);
    expect(codeEvidenceReferenceLines({})).toEqual([]);
  });

  it('builds conditional evidence chapters, a dynamic TOC, unique figures, and no raw storage paths', () => {
    const report = reportFixture();
    const document = generateTechnicalReportDocument({ client, report, engineeringData: data(report) });
    const sections = document.sections.map((section) => section.id);
    expect(sections).toContain('site_access_evidence');
    expect(sections).toContain('existing_condition_evidence');
    expect(sections).toContain('safety_system_evidence');
    expect(sections).toContain('code_evidence_references');
    expect(sections).toContain('engineering_recommendations');
    expect(allDocumentText(document)).not.toContain('private/path-must-not-print');
    expect(allDocumentText(document)).not.toContain('excluded.png');

    const flow = documentToFlowBlocks(document);
    const tocIds = flow.chapters.map((chapter) => chapter.id);
    expect(tocIds).toContain('site_access_evidence');
    expect(tocIds).toContain('existing_condition_evidence');
    expect(tocIds).toContain('safety_system_evidence');
    expect(tocIds).toContain('code_evidence_references');
    expect(tocIds).toContain('engineering_recommendations');
    expect(tocIds.every((id) => (sections as string[]).includes(id))).toBe(true);
    const figures = allFigures(flow.blocks);
    expect(new Set(figures.map((figure) => figure.figureNo)).size).toBe(figures.length);

    const html = buildEngineeringStudyHtml({ document, company: { name: 'مكتب اختبار', stamp_text: 'ختم اختبار' } as never });
    expect(html).toContain('الموقع العام والوصول');
    expect(html).toContain('المراجع والمقتطفات الفنية');
    expect(html).toContain('شكل (1)');
    expect(html).not.toContain('private/path-must-not-print');
    expect(html).not.toContain('client/technical-evidence');
  });

  it('omits every Phase 4E section when there are no final decisions or selected evidence', () => {
    const report = { ...EMPTY_TECHNICAL_REPORT, evidence: { version: 1 as const, civil_defense: null, items: [] } };
    const document = generateTechnicalReportDocument({
      client,
      report,
      engineeringData: { ...EMPTY_PROJECT_ENGINEERING_DATA, technical_report: report },
    });
    expect(document.sections.some((section) => section.id === 'site_access_evidence')).toBe(false);
    expect(document.sections.some((section) => section.id === 'existing_condition_evidence')).toBe(false);
    expect(document.sections.some((section) => section.id === 'safety_system_evidence')).toBe(false);
    expect(document.sections.some((section) => section.id === 'code_evidence_references')).toBe(false);
    expect(document.sections.some((section) => section.id === 'engineering_recommendations')).toBe(false);
  });
});
