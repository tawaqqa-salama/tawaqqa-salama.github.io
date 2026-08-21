import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import Stage5TraceabilityPanel from '@/components/projects/Stage5TraceabilityPanel';
import type { ProjectEngineeringData } from '@/lib/types/project-reports';

const fixtureData: Pick<ProjectEngineeringData, 'field_visits' | 'supervision_report' | 'technical_notes' | 'report_pdf_archive'> = {
  field_visits: [
    {
      visit_number: 1,
      visit_date: '2026-08-01',
      location: 'المبنى الرئيسي — الطابق الأرضي',
      status: 'معتمد',
      observations: [
        {
          id: 'obs-long', category: 'fire_alarm', location: 'غرفة المضخات والمنطقة المجاورة للمدخل الرئيسي',
          description: 'لوحة إنذار الحريق تحتاج إلى معالجة شاملة وإعادة اختبار لجميع نقاط الربط ومراقبة الإشارات المتصلة بالنظام.',
          severity: 'critical', required_action: 'تنفيذ المعالجة من المقاول ثم تقديم ما يثبت الاختبار وإعادة الفحص الميداني من مهندس السلامة.',
          responsible_party: 'مقاول أنظمة الإنذار', due_date: '2026-08-05', status: 'open',
        },
        {
          id: 'obs-verified', category: 'firefighting', location: 'ممر المخارج', description: 'إشارة مخرج بحاجة تثبيت.', severity: 'high',
          required_action: 'إعادة تثبيت الإشارة.', responsible_party: 'المقاول', status: 'verified', resolved_at: '2026-08-02T08:00:00.000Z', verified_at: '2026-08-03T08:00:00.000Z', verified_by: 'م. خالد',
        },
      ],
      evidence: [
        { id: 'before', kind: 'photo', title: 'قبل', description: '', engineer_note: '', observation_id: 'obs-long', timing: 'before', category: 'fire_alarm', file: { fileName: 'before.jpg', mimeType: 'image/jpeg', sizeBytes: 1, storageBucket: 'project-files', storagePath: 'x/before.jpg' }, display_order: 1, include_in_visit_pdf: true, created_at: '2026-08-01T08:00:00.000Z' },
        { id: 'general', kind: 'photo', title: 'عام', description: '', engineer_note: '', observation_id: 'obs-long', timing: 'general', category: 'fire_alarm', file: { fileName: 'general.jpg', mimeType: 'image/jpeg', sizeBytes: 1, storageBucket: 'project-files', storagePath: 'x/general.jpg' }, display_order: 2, include_in_visit_pdf: false, created_at: '2026-08-01T08:01:00.000Z' },
      ],
      pdf_snapshots: [{ id: 'visit-pdf', kind: 'field_visit', visit_number: 1, report_date: '2026-08-01', title_ar: 'تقرير زيارة #1', fileName: 'visit-1.pdf', sizeBytes: 200, mimeType: 'application/pdf', storageBucket: 'project-files', storagePath: 'x/visit-1.pdf', dataUrl: null, created_at: '2026-08-01T10:00:00.000Z' }],
    },
    {
      visit_number: 2, visit_date: '2026-08-08', location: 'المبنى الرئيسي — الطابق الأرضي', status: 'معتمد',
      observations: [{ id: 'obs-follow', category: 'fire_alarm', location: 'غرفة المضخات', description: 'تمت المعالجة ويجري انتظار تحقق المهندس.', severity: 'critical', required_action: 'تحقق نهائي.', responsible_party: 'مقاول أنظمة الإنذار', due_date: '2026-08-10', status: 'resolved', resolved_at: '2026-08-08T09:00:00.000Z', follow_up_of: { visit_number: 1, observation_id: 'obs-long' } }],
      evidence: [{ id: 'after', kind: 'photo', title: 'بعد', description: '', engineer_note: '', observation_id: 'obs-follow', timing: 'after', category: 'corrective_action', file: { fileName: 'after.jpg', mimeType: 'image/jpeg', sizeBytes: 1, storageBucket: 'project-files', storagePath: 'x/after.jpg' }, display_order: 1, include_in_visit_pdf: true, created_at: '2026-08-08T09:00:00.000Z' }],
    },
  ],
  supervision_report: {
    status: 'مسودة', months: [],
    tasks: [{ id: 'task-1', category_id: 'manual', category_label: 'إنذار', description: 'متابعة لوحة الإنذار', work_type: 'تركيب', month_progress: {}, total_percent: null, related_observation_refs: [{ visit_number: 1, observation_id: 'obs-long' }] }],
    pdf_snapshots: [{ id: 'supervision-pdf', kind: 'supervision', title_ar: 'تقرير الإشراف', fileName: 'supervision.pdf', sizeBytes: 300, mimeType: 'application/pdf', storageBucket: 'project-files', storagePath: 'x/supervision.pdf', dataUrl: null, created_at: '2026-08-09T10:00:00.000Z' }],
  },
  technical_notes: { status: 'مسودة', deficiencies: [{ id: 'def-1', description: 'ربط اختبار', severity: 'critical', resolved: false, source_visit_ref: { visit_number: 1, observation_id: 'obs-long' } }] },
  report_pdf_archive: [],
};

describe('Phase 5F visual fixture', () => {
  it('renders the read-only traceability workspace to a local HTML fixture', () => {
    const markup = renderToStaticMarkup(createElement(Stage5TraceabilityPanel, { data: fixtureData, onOpenSnapshot: () => undefined }));
    const target = '/tmp/phase5f-traceability-fixture.html';
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="__PHASE5F_CSS__"></head><body class="bg-slate-50 p-3 sm:p-6"><main class="mx-auto max-w-6xl">${markup}</main></body></html>`, 'utf8');

    expect(markup).toContain('مساحة مراجعة التتبع والأرشيف');
    expect(markup).toContain('هذا ليس سجل تدقيق غير قابل للتعديل');
    expect(markup).toContain('فتح PDF');
    expect(markup).not.toContain('حفظ المرحلة');
  });
});
