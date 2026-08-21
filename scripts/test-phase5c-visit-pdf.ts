import fs from 'node:fs';
import path from 'node:path';
import { buildFieldVisitReportHtml } from '@/components/projects/FieldVisitReportPrint';
import type { FieldVisitEvidence, FieldVisitReport } from '@/lib/types/project-reports';

const outputDir = process.env.PHASE5C_FIXTURE_DIR || '/tmp/phase5c-pdf-fixtures';
const assetDir = process.env.PHASE5C_ASSET_DIR || '/tmp/phase5c-pdf-assets';
fs.mkdirSync(outputDir, { recursive: true });

const client = {
  id: 'client-fixture-01', client_code: 'FV-QA', name: 'مشروع زيارة اختبارية', business_name: 'مشروع زيارة اختبارية', owner_name: 'مالك الاختبار', city: 'الرياض',
} as never;

const baseObservation = {
  id: 'obs-01', category: 'fire_alarm' as const, location: 'الممر الرئيسي', description: 'تم رصد حالة تستلزم المعالجة.', severity: 'high' as const, required_action: 'تنفيذ المعالجة والتحقق منها.', responsible_party: 'المقاول', status: 'open' as const,
};

function source(name: string) {
  return `file://${path.join(assetDir, name)}`;
}

function evidence(id: string, order: number, partial: Partial<FieldVisitEvidence> = {}): FieldVisitEvidence {
  const fileName = partial.file?.fileName || `${id}.png`;
  const mimeType = partial.file?.mimeType || 'image/png';
  return {
    id,
    kind: mimeType === 'application/pdf' ? 'document' : 'photo',
    title: `دليل ميداني ${order}`,
    description: 'وصف مختصر للدليل الميداني.',
    engineer_note: '',
    observation_id: null,
    timing: 'general',
    category: 'general_site',
    file: { fileName, mimeType, sizeBytes: 1200, storageBucket: 'project-files', storagePath: `fixture/field-visits/visit-1/evidence/${id}-${fileName}` },
    display_order: order,
    include_in_visit_pdf: true,
    captured_at: null,
    created_at: '2026-08-21T00:00:00.000Z',
    ...partial,
  };
}

function visit(evidenceItems: FieldVisitEvidence[]): FieldVisitReport {
  return {
    visit_number: 1,
    status: 'مسودة',
    visit_date: '2026-08-21',
    engineer_name: 'مهندس الاختبار',
    location: 'الموقع التجريبي',
    findings: 'نتائج الزيارة التجريبية لاختبار تنسيق أدلة الزيارة.',
    recommendations: 'التوصية التجريبية محفوظة لإظهار سياق التقرير فقط.',
    observations: [baseObservation],
    evidence: evidenceItems,
    checklist: [{ id: 'check-1', label: 'بند اختبار', checked: true }],
  };
}

const fixtures: Array<{ id: string; visit: FieldVisitReport; sources: Record<string, string | null> }> = [
  { id: 'A-no-evidence', visit: visit([]), sources: {} },
  { id: 'B-one-image', visit: visit([evidence('portrait', 1, { title: 'لوحة إنذار في الممر', category: 'fire_alarm' })]), sources: { portrait: source('portrait.png') } },
  { id: 'C-multiple-images', visit: visit([
    evidence('landscape-a', 1, { title: 'توثيق عام للموقع' }),
    evidence('portrait-a', 2, { title: 'جهاز إنذار قائم', category: 'fire_alarm' }),
    evidence('landscape-b', 3, { title: 'مسار الإخلاء', category: 'means_of_egress' }),
    evidence('portrait-b', 4, { title: 'طفاية الحريق', category: 'fire_fighting' }),
  ]), sources: { 'landscape-a': source('landscape.png'), 'portrait-a': source('portrait.png'), 'landscape-b': source('landscape2.png'), 'portrait-b': source('portrait2.png') } },
  { id: 'D-portrait-landscape', visit: visit([
    evidence('portrait', 1, { title: 'دليل رأسي', category: 'fire_alarm' }),
    evidence('landscape', 2, { title: 'دليل أفقي', category: 'general_site' }),
  ]), sources: { portrait: source('portrait.png'), landscape: source('landscape.png') } },
  { id: 'E-before-after-linked', visit: visit([
    evidence('before', 1, { title: 'قبل المعالجة', timing: 'before', observation_id: 'obs-01', category: 'deficiency' }),
    evidence('after', 2, { title: 'بعد المعالجة', timing: 'after', observation_id: 'obs-01', category: 'corrective_action' }),
  ]), sources: { before: source('portrait.png'), after: source('landscape.png') } },
  { id: 'F-image-pdf', visit: visit([
    evidence('photo', 1, { title: 'صورة التوثيق', category: 'installation_quality' }),
    evidence('attachment', 2, { title: 'محضر اختبار مرفق', file: { fileName: 'test-record.pdf', mimeType: 'application/pdf', sizeBytes: 2100, storageBucket: 'project-files', storagePath: 'fixture/doc.pdf' } }),
  ]), sources: { photo: source('landscape.png') } },
  { id: 'G-failed-media', visit: visit([evidence('missing', 1, { title: 'صورة تعذر تحميلها', category: 'deficiency' })]), sources: { missing: null } },
  { id: 'H-long-evidence', visit: visit(Array.from({ length: 16 }, (_, index) => evidence(`long-${index + 1}`, index + 1, {
    title: `دليل طويل رقم ${index + 1}`,
    observation_id: index % 2 === 0 ? 'obs-01' : null,
    timing: index % 3 === 0 ? 'before' : index % 3 === 1 ? 'after' : 'general',
    category: index % 2 === 0 ? 'fire_alarm' : 'fire_fighting',
    engineer_note: index === 4 ? 'ملاحظة هندسية أطول للتحقق من التفاف النص داخل تسمية الصورة دون فصلها.' : '',
  })).concat([evidence('long-document', 17, { title: 'مرفق PDF مرجعي', file: { fileName: 'reference.pdf', mimeType: 'application/pdf', sizeBytes: 3000, storageBucket: 'project-files', storagePath: 'fixture/reference.pdf' } })])), sources: Object.fromEntries(Array.from({ length: 16 }, (_, index) => [`long-${index + 1}`, source(index % 2 === 0 ? 'portrait.png' : 'landscape.png')])) },
];

const requestedFixture = process.env.PHASE5C_FIXTURE_ONLY || null;
const fixturesToWrite = requestedFixture
  ? fixtures.filter((fixture) => fixture.id === requestedFixture)
  : fixtures;
if (requestedFixture && fixturesToWrite.length !== 1) throw new Error(`Unknown fixture: ${requestedFixture}`);

for (const fixture of fixturesToWrite) {
  const html = buildFieldVisitReportHtml({ client, visit: fixture.visit, totalVisits: 1, evidenceSources: fixture.sources });
  fs.writeFileSync(path.join(outputDir, `${fixture.id}.html`), html);
}

console.log(JSON.stringify({ outputDir, fixtures: fixturesToWrite.map((fixture) => fixture.id) }));
