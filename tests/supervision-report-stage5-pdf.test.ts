import { describe, expect, it } from 'vitest';
import { buildSupervisionReportHtml } from '@/components/projects/SupervisionReportPrint';
import { EMPTY_SUPERVISION_REPORT } from '@/lib/types/project-reports';
import type {
  FieldVisitEvidence,
  FieldVisitObservation,
  FieldVisitReport,
  SupervisionReport,
  TechnicalNotesReport,
} from '@/lib/types/project-reports';

const client = {
  id: 'supervision-pdf-client',
  client_code: 'SUP-PDF-01',
  name: 'مشروع اختبار الإشراف',
  business_name: 'مشروع اختبار الإشراف',
  owner_name: 'مالك الاختبار',
} as never;

const company = {
  name: 'توقع سلامة',
  legal_name: 'توقع سلامة للاستشارات',
} as never;

function report(partial: Partial<SupervisionReport> = {}): SupervisionReport {
  return {
    ...EMPTY_SUPERVISION_REPORT,
    status: 'معتمد',
    project_name: 'مشروع اختبار الإشراف',
    report_date: '2026-08-21',
    months: [{ id: 'm1', label: 'الشهر الأول' }],
    tasks: [
      {
        id: 'task-alarm',
        category_id: 'alarm',
        category_label: 'نظام الإنذار',
        description: 'اختبار بند إنذار مرتبط',
        work_type: 'توريد وتركيب',
        month_progress: { m1: { percent: 45, status: 'on_time' } },
        total_percent: 45,
        related_observation_refs: [{ visit_number: 1, observation_id: 'obs-high' }],
      },
    ],
    ...partial,
  };
}

function observation(partial: Partial<FieldVisitObservation> = {}): FieldVisitObservation {
  return {
    id: 'obs-high',
    category: 'fire_alarm',
    location: 'الممر الرئيسي',
    description: 'كاشف دخان يحتاج معالجة',
    severity: 'high',
    required_action: 'تثبيت الكاشف واختباره',
    responsible_party: 'المقاول',
    status: 'open',
    ...partial,
  };
}

function evidence(id: string, order: number, partial: Partial<FieldVisitEvidence> = {}): FieldVisitEvidence {
  return {
    id,
    kind: 'photo',
    title: `دليل ${id}`,
    description: 'وصف آمن للدليل',
    engineer_note: '',
    observation_id: 'obs-high',
    timing: 'general',
    category: 'fire_alarm',
    file: {
      fileName: `${id}.png`,
      mimeType: 'image/png',
      sizeBytes: 1200,
      storageBucket: 'project-files',
      storagePath: `supervision-pdf-client/field-visits/visit-1/evidence/${id}-${id}.png`,
    },
    display_order: order,
    include_in_visit_pdf: true,
    captured_at: null,
    created_at: '2026-08-21T00:00:00.000Z',
    ...partial,
  };
}

function visit(partial: Partial<FieldVisitReport> = {}): FieldVisitReport {
  return {
    visit_number: 1,
    status: 'معتمد',
    visit_date: '2026-08-21',
    engineer_name: 'م. اختبار',
    location: 'الموقع التجريبي',
    findings: 'نتائج الزيارة',
    recommendations: 'توصية الزيارة',
    observations: [observation()],
    evidence: [],
    ...partial,
  };
}

function technicalNotes(partial: Partial<TechnicalNotesReport> = {}): TechnicalNotesReport {
  return {
    status: 'معتمد',
    deficiencies: [
      {
        id: 'def-1',
        description: 'عجز فني مرتبط بالملاحظة',
        severity: 'high',
        resolved: false,
        source_visit_ref: { visit_number: 1, observation_id: 'obs-high' },
      },
    ],
    ...partial,
  };
}

describe('Phase 5E supervision PDF Stage 5 integration', () => {
  it('keeps the legacy supervision PDF free from empty Stage 5 sections', () => {
    const html = buildSupervisionReportHtml({ client, report: report(), company });

    expect(html).not.toContain('سجل الزيارات والملاحظات والمعالجات');
    expect(html).not.toContain('التوثيق المصور والمرفقات المختارة');
  });

  it('renders visits, structured observations, linked work items and unresolved remediation without changing B1 semantics', () => {
    const html = buildSupervisionReportHtml({
      client,
      report: report(),
      company,
      fieldVisits: [visit({ evidence: [evidence('before', 1, { timing: 'before' })] })],
      technicalNotes: technicalNotes(),
      evidenceSources: { '1:before': 'data:image/png;base64,fixture' },
    });

    expect(html).toContain('سجل الزيارات والملاحظات والمعالجات');
    expect(html).toContain('الزيارات الميدانية');
    expect(html).toContain('الملاحظات الميدانية المنظمة');
    expect(html).toContain('متابعة المعالجات والتحقق');
    expect(html).toContain('اختبار بند إنذار مرتبط');
    expect(html).toContain('عجز فني مرتبط بالملاحظة (مفتوحة)');
    expect(html).toContain('لم يكتمل التحقق الهندسي');
    expect(html).toContain('قبل المعالجة');
    expect(html).toContain('شكل (1)');
  });

  it('shows verified remediation only when the existing resolved_at contract is present', () => {
    const html = buildSupervisionReportHtml({
      client,
      report: report(),
      company,
      fieldVisits: [
        visit({
          observations: [
            observation({
              status: 'verified',
              resolved_at: '2026-08-22',
              verified_at: '2026-08-23',
              verified_by: 'م. المعتمد',
            }),
          ],
        }),
      ],
      technicalNotes: technicalNotes(),
    });

    expect(html).toContain('تم التحقق هندسياً');
    expect(html).toContain('م. المعتمد');
  });

  it('uses only evidence already selected for visit PDF, preserves before/after captions, and falls back safely for PDF and missing media', () => {
    const selectedBefore = evidence('before', 1, { timing: 'before' });
    const selectedAfter = evidence('after', 2, { timing: 'after' });
    const selectedAttachment = evidence('attachment', 3, {
      kind: 'document',
      title: 'محضر اختبار PDF',
      file: {
        fileName: 'test-record.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 2200,
        storageBucket: 'project-files',
        storagePath: 'supervision-pdf-client/field-visits/visit-1/evidence/attachment-test-record.pdf',
      },
    });
    const excluded = evidence('excluded', 4, { title: 'دليل مستبعد', include_in_visit_pdf: false });
    const missing = evidence('missing', 5, { title: 'دليل تعذر تحميله' });

    const html = buildSupervisionReportHtml({
      client,
      report: report(),
      company,
      fieldVisits: [visit({ evidence: [selectedBefore, selectedAfter, selectedAttachment, excluded, missing] })],
      technicalNotes: technicalNotes(),
      evidenceSources: {
        '1:before': 'data:image/png;base64,before',
        '1:after': 'data:image/png;base64,after',
        '1:missing': null,
      },
    });

    expect(html).toContain('التوثيق المصور والمرفقات المختارة');
    expect(html).toContain('قبل المعالجة');
    expect(html).toContain('بعد المعالجة');
    expect(html).toContain('محضر اختبار PDF');
    expect(html).toContain('مرفق PDF:');
    expect(html).toContain('صورة محددة تعذر تحميل معاينتها');
    expect(html).toContain('شكل (1)');
    expect(html).toContain('شكل (2)');
    expect(html).not.toContain('شكل (3)');
    expect(html).not.toContain('دليل مستبعد');
  });

  it('keeps the evidence heading with its first card while allowing the remaining evidence grid to paginate', () => {
    const html = buildSupervisionReportHtml({
      client,
      report: report(),
      company,
      fieldVisits: [
        visit({
          evidence: [
            evidence('first', 1),
            evidence('second', 2),
            evidence('third', 3),
            evidence('fourth', 4),
          ],
        }),
      ],
      evidenceSources: {
        '1:first': 'data:image/png;base64,first',
        '1:second': 'data:image/png;base64,second',
        '1:third': 'data:image/png;base64,third',
        '1:fourth': 'data:image/png;base64,fourth',
      },
    });

    const leadStart = html.indexOf('<div class="supervision-evidence-lead">');
    const trailingGridStart = html.indexOf('<div class="supervision-evidence-grid">', leadStart);
    const leadMarkup = html.slice(leadStart, trailingGridStart);

    expect(leadStart).toBeGreaterThan(-1);
    expect(trailingGridStart).toBeGreaterThan(leadStart);
    expect(leadMarkup).toContain('دليل first');
    expect(leadMarkup).toContain('دليل second');
    expect(leadMarkup).toContain('دليل third');
    expect(leadMarkup).not.toContain('دليل fourth');
    expect(html).toContain('supervision-evidence-grid-first has-following-evidence');
    expect(html).toContain('.stage5-evidence-section,\n    .supervision-evidence-grid {\n      break-inside: auto;');
    expect(html).toContain('.supervision-evidence-lead {\n      break-inside: avoid;');
    expect(html).not.toContain('.stage5-evidence-section {\n      break-inside: avoid;');
  });

  it('escapes all Stage 5 text before inserting it into the print HTML', () => {
    const html = buildSupervisionReportHtml({
      client,
      report: report(),
      company,
      fieldVisits: [
        visit({
          observations: [observation({ description: '<script>unsafe</script>' })],
          evidence: [evidence('unsafe', 1, { title: '<img src=x onerror=alert(1)>' })],
        }),
      ],
      technicalNotes: technicalNotes(),
      evidenceSources: { '1:unsafe': 'data:image/png;base64,safe' },
    });

    expect(html).toContain('&lt;script&gt;unsafe&lt;/script&gt;');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).not.toContain('<script>unsafe</script>');
    expect(html).not.toContain('<img src=x onerror=alert(1)>');
  });
});
