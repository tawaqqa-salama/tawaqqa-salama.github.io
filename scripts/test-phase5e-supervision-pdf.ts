import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildSupervisionReportHtml } from '@/components/projects/SupervisionReportPrint';
import { EMPTY_SUPERVISION_REPORT } from '@/lib/types/project-reports';
import type {
  FieldVisitEvidence,
  FieldVisitObservation,
  FieldVisitReport,
  SupervisionReport,
  TechnicalNotesReport,
} from '@/lib/types/project-reports';

const outputDir = process.env.PHASE5E_FIXTURE_DIR || '/tmp/phase5e-supervision-pdf-fixtures';
const assetDir = process.env.PHASE5E_ASSET_DIR || '/tmp/phase5c-pdf-assets';
fs.mkdirSync(outputDir, { recursive: true });

const client = {
  id: 'phase5e-fixture-client',
  client_code: 'S5E-QA',
  name: 'مشروع اختبار تقرير الإشراف',
  business_name: 'مشروع اختبار تقرير الإشراف',
  owner_name: 'مالك الاختبار',
  city: 'الرياض',
} as never;

const company = {
  name: 'توقع سلامة',
  legal_name: 'توقع سلامة للاستشارات',
  tagline: 'Fixture Phase 5E',
} as never;

function source(name: string) {
  return pathToFileURL(path.join(assetDir, name)).href;
}

function report(partial: Partial<SupervisionReport> = {}): SupervisionReport {
  return {
    ...EMPTY_SUPERVISION_REPORT,
    status: 'معتمد',
    report_date: '2026-08-21',
    owner_name: 'مالك Fixture',
    project_name: 'مشروع Fixture للإشراف',
    building_type: 'مبنى تجاري',
    area_m2: '1200',
    contractor_name: 'مقاول Fixture',
    supervising_office: 'توقع سلامة',
    safety_engineer_name: 'م. اختبار',
    branch_manager_name: 'مدير الاختبار',
    inspection_form_number: 'S5E-01',
    study_number: 'ST-2026-01',
    total_duration: '6 أشهر',
    start_date: '2026-06-01',
    months: [{ id: 'm1', label: 'الشهر الأول' }, { id: 'm2', label: 'الشهر الثاني' }],
    tasks: [
      {
        id: 'task-alarm',
        category_id: 'alarm',
        category_label: 'نظام الإنذار',
        description: 'توريد وتركيب أجهزة الإنذار',
        work_type: 'توريد وتركيب',
        month_progress: { m1: { percent: 50, status: 'on_time' }, m2: { percent: null, status: 'not_due' } },
        total_percent: 50,
        related_observation_refs: [{ visit_number: 1, observation_id: 'obs-1' }],
      },
    ],
    ...partial,
  };
}

function observation(id: string, partial: Partial<FieldVisitObservation> = {}): FieldVisitObservation {
  return {
    id,
    category: 'fire_alarm',
    location: 'الممر الرئيسي',
    description: 'ملاحظة اختبارية تتطلب معالجة وتحققاً هندسياً.',
    severity: 'high',
    required_action: 'تصحيح التركيب ثم طلب التحقق.',
    responsible_party: 'المقاول',
    due_date: '2026-09-01',
    status: 'open',
    ...partial,
  };
}

function evidence(id: string, order: number, partial: Partial<FieldVisitEvidence> = {}): FieldVisitEvidence {
  const mimeType = partial.file?.mimeType || 'image/png';
  const fileName = partial.file?.fileName || `${id}.png`;
  return {
    id,
    kind: mimeType === 'application/pdf' ? 'document' : 'photo',
    title: `دليل ${id}`,
    description: 'وصف Fixture آمن للدليل في تقرير الإشراف.',
    engineer_note: '',
    observation_id: 'obs-1',
    timing: 'general',
    category: 'fire_alarm',
    file: {
      fileName,
      mimeType,
      sizeBytes: 1200,
      storageBucket: 'project-files',
      storagePath: `phase5e-fixture-client/field-visits/visit-1/evidence/${id}-${fileName}`,
    },
    display_order: order,
    include_in_visit_pdf: true,
    captured_at: '2026-08-21',
    created_at: '2026-08-21T00:00:00.000Z',
    ...partial,
  };
}

function visit(number: number, partial: Partial<FieldVisitReport> = {}): FieldVisitReport {
  return {
    visit_number: number,
    status: 'معتمد',
    visit_date: `2026-08-${String(20 + number).padStart(2, '0')}`,
    engineer_name: 'م. الاختبار',
    location: `الموقع التجريبي ${number}`,
    findings: `نتائج الزيارة ${number}`,
    recommendations: `توصيات الزيارة ${number}`,
    observations: [observation('obs-1')],
    evidence: [],
    ...partial,
  };
}

function notes(partial: Partial<TechnicalNotesReport> = {}): TechnicalNotesReport {
  return {
    status: 'معتمد',
    deficiencies: [
      {
        id: 'def-1',
        description: 'عجز فني Fixture مرتبط بالملاحظة',
        severity: 'high',
        resolved: false,
        source_visit_ref: { visit_number: 1, observation_id: 'obs-1' },
      },
    ],
    ...partial,
  };
}

function selectedSources(visits: FieldVisitReport[], available: Record<string, string | null>) {
  return Object.fromEntries(
    visits.flatMap((entry) =>
      (entry.evidence || [])
        .filter((item) => item.include_in_visit_pdf && item.kind === 'photo')
        .map((item) => [`${entry.visit_number}:${item.id}`, available[item.id] ?? null])
    )
  );
}

const caseA = { report: report(), visits: [] as FieldVisitReport[], technicalNotes: notes(), sources: {} };
const caseBVisits = [visit(1, { evidence: [evidence('open', 1, { timing: 'before' })] })];
const caseB = { report: report(), visits: caseBVisits, technicalNotes: notes(), sources: selectedSources(caseBVisits, { open: source('portrait.png') }) };
const verified = observation('obs-1', {
  status: 'verified',
  resolved_at: '2026-08-24',
  resolved_by: 'المقاول',
  verified_at: '2026-08-25',
  verified_by: 'م. المعتمد',
  verification_note: 'تمت المعاينة الميدانية.',
});
const caseCVisits = [visit(1, { observations: [verified], evidence: [evidence('verified-after', 1, { timing: 'after' })] })];
const caseC = { report: report(), visits: caseCVisits, technicalNotes: notes({ deficiencies: [{ id: 'def-1', description: 'عجز فني تم إغلاقه', severity: 'high', resolved: true, source_visit_ref: { visit_number: 1, observation_id: 'obs-1' } }] }), sources: selectedSources(caseCVisits, { 'verified-after': source('landscape.png') }) };
const caseDVisits = [visit(1, { evidence: [
  evidence('before', 1, { title: 'قبل المعالجة', timing: 'before' }),
  evidence('after', 2, { title: 'بعد المعالجة', timing: 'after' }),
  evidence('general', 3, { title: 'توثيق عام', observation_id: null, category: 'general_site' }),
] })];
const caseD = { report: report(), visits: caseDVisits, technicalNotes: notes(), sources: selectedSources(caseDVisits, { before: source('portrait.png'), after: source('landscape.png'), general: source('landscape2.png') }) };
const caseEVisits = [
  visit(1, { evidence: [evidence('v1-a', 1)] }),
  visit(2, { observations: [observation('obs-2', { severity: 'critical', description: 'ملاحظة حرجة في زيارة المتابعة.' })], evidence: [evidence('v2-a', 1, { observation_id: 'obs-2' }), evidence('v2-b', 2, { observation_id: null })] }),
  visit(3, { observations: [observation('obs-3', { severity: 'medium', description: 'ملاحظة متوسطة إضافية.' })], evidence: [evidence('v3-a', 1, { observation_id: 'obs-3' })] }),
];
const caseE = { report: report(), visits: caseEVisits, technicalNotes: notes(), sources: selectedSources(caseEVisits, { 'v1-a': source('portrait.png'), 'v2-a': source('landscape.png'), 'v2-b': source('portrait2.png'), 'v3-a': source('landscape2.png') }) };
const caseFVisits = [visit(1, { evidence: [
  evidence('photo', 1, { title: 'صورة صالحة' }),
  evidence('attachment', 2, { title: 'محضر اختبار PDF', file: { fileName: 'test-record.pdf', mimeType: 'application/pdf', sizeBytes: 2200, storageBucket: 'project-files', storagePath: 'phase5e-fixture-client/field-visits/visit-1/evidence/attachment-test-record.pdf' } }),
  evidence('missing', 3, { title: 'صورة تعذر تحميلها' }),
  evidence('excluded', 4, { title: 'دليل مستبعد', include_in_visit_pdf: false }),
] })];
const caseF = { report: report(), visits: caseFVisits, technicalNotes: notes(), sources: selectedSources(caseFVisits, { photo: source('landscape.png'), missing: null }) };
const longEvidence = Array.from({ length: 18 }, (_, index) => evidence(`long-${index + 1}`, index + 1, {
  title: `دليل طويل رقم ${index + 1} لاختبار تماسك التعليق مع الصورة وتدفق صفحات PDF`,
  description: `وصف طويل رقم ${index + 1} لتغطية اختبار التفاف العربية قبل وبعد المعالجة داخل التقرير الدوري دون فصل العنوان عن الوسيط.`,
  timing: index % 3 === 0 ? 'before' : index % 3 === 1 ? 'after' : 'general',
  observation_id: index % 2 === 0 ? 'obs-1' : null,
}));
const longTasks = Array.from({ length: 22 }, (_, index) => ({
  id: `task-long-${index + 1}`,
  category_id: `cat-${Math.floor(index / 3)}`,
  category_label: `مجموعة أعمال ${Math.floor(index / 3) + 1}`,
  description: `بند متابعة طويل رقم ${index + 1} لاختبار انتقال صفوف جدول الإشراف بين صفحات متعددة بصورة سليمة.`,
  work_type: 'توريد وتركيب' as const,
  month_progress: { m1: { percent: (index * 7) % 101, status: 'on_time' as const }, m2: { percent: null, status: 'not_due' as const } },
  total_percent: (index * 7) % 101,
}));
const caseGVisits = [visit(1, { evidence: longEvidence })];
const caseG = { report: report({ tasks: longTasks }), visits: caseGVisits, technicalNotes: notes(), sources: selectedSources(caseGVisits, Object.fromEntries(longEvidence.map((item, index) => [item.id, source(index % 2 ? 'landscape.png' : 'portrait.png')]))) };
const caseHVisits = [visit(1, { observations: [], evidence: [], findings: 'نص زيارة تاريخية حرة محفوظ للتوافق الخلفي.' })];
const caseH = { report: report(), visits: caseHVisits, technicalNotes: { status: 'مسودة' as const, deficiencies: [] }, sources: {} };

const fixtures = {
  'A-legacy-no-stage5': caseA,
  'B-open-high-b1': caseB,
  'C-verified-remediation': caseC,
  'D-before-after-selected': caseD,
  'E-multiple-visits-evidence': caseE,
  'F-pdf-missing-excluded': caseF,
  'G-long-content-pagination': caseG,
  'H-legacy-visit-compatibility': caseH,
};

const requestedFixture = process.env.PHASE5E_FIXTURE_ONLY || null;
const fixtureEntries = requestedFixture
  ? Object.entries(fixtures).filter(([name]) => name === requestedFixture)
  : Object.entries(fixtures);
if (requestedFixture && fixtureEntries.length !== 1) throw new Error(`Unknown fixture: ${requestedFixture}`);

for (const [name, fixture] of fixtureEntries) {
  const html = buildSupervisionReportHtml({
    client,
    report: fixture.report,
    company,
    fieldVisits: fixture.visits,
    technicalNotes: fixture.technicalNotes,
    evidenceSources: fixture.sources,
  });
  fs.writeFileSync(path.join(outputDir, `${name}.html`), html, 'utf8');
}

console.log(JSON.stringify({ outputDir, fixtures: fixtureEntries.map(([name]) => name) }));
