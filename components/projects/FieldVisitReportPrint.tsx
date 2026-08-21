import type { CompanyProfile } from '@/lib/company-profile';
import type { ClientRecord } from '@/lib/types/client';
import type { FieldVisitEvidence, FieldVisitReport } from '@/lib/types/project-reports';
import {
  FIELD_VISIT_OBSERVATION_CATEGORIES,
  FIELD_VISIT_OBSERVATION_SEVERITIES,
  FIELD_VISIT_OBSERVATION_STATUSES,
  observationLabel,
} from '@/lib/projects/field-visit-observations';
import {
  evidenceLabel,
  FIELD_VISIT_EVIDENCE_CATEGORIES,
  FIELD_VISIT_EVIDENCE_TIMINGS,
  normalizeFieldVisitEvidenceForVisit,
  resolveFieldVisitEvidenceSrc,
} from '@/lib/projects/field-visit-evidence';

function esc(v: string | null | undefined) {
  return String(v || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function observationReference(visit: FieldVisitReport, observationId: string | null | undefined) {
  if (!observationId) return '';
  const index = (visit.observations || []).findIndex((item) => item.id === observationId);
  return index >= 0 ? `مرتبط بالملاحظة رقم ${index + 1}` : '';
}

function evidenceCaption(visit: FieldVisitReport, item: FieldVisitEvidence) {
  const fragments = [
    evidenceLabel(FIELD_VISIT_EVIDENCE_CATEGORIES, item.category),
    evidenceLabel(FIELD_VISIT_EVIDENCE_TIMINGS, item.timing),
    observationReference(visit, item.observation_id),
  ].filter(Boolean);
  const description = item.description ? `<div class="evidence-note">${esc(item.description)}</div>` : '';
  const engineerNote = item.engineer_note ? `<div class="evidence-note"><strong>ملاحظة المهندس:</strong> ${esc(item.engineer_note)}</div>` : '';
  return `<figcaption><strong>${esc(item.title || item.file.fileName)}</strong>${fragments.length ? `<span>${esc(fragments.join(' · '))}</span>` : ''}${description}${engineerNote}</figcaption>`;
}

function renderVisitEvidence(params: {
  visit: FieldVisitReport;
  evidenceSources?: Record<string, string | null>;
}) {
  const evidence = normalizeFieldVisitEvidenceForVisit(params.visit).evidence || [];
  const selected = evidence.filter((item) => item.include_in_visit_pdf);
  if (!selected.length) return '';

  let figureNumber = 0;
  const entries = selected.map((item) => {
    const source = params.evidenceSources?.[item.id] || null;
    const isImage = item.kind === 'photo' && /^image\/(jpeg|png)$/i.test(item.file.mimeType);
    if (isImage && source) {
      figureNumber += 1;
      return `<figure class="evidence-figure"><div class="evidence-media"><img src="${esc(source)}" alt="${esc(item.title || item.file.fileName)}" /></div>${evidenceCaption(params.visit, item)}<div class="figure-number">شكل (${figureNumber})</div></figure>`;
    }
    if (isImage) {
      return `<article class="attachment-ref"><strong>${esc(item.title || item.file.fileName)}</strong><span>صورة مختارة تعذر تحميل معاينتها في وقت إنشاء التقرير؛ لم تُدرج كصورة مرقمة.</span>${evidenceCaption(params.visit, item)}</article>`;
    }
    return `<article class="attachment-ref"><strong>مرفق PDF: ${esc(item.title || item.file.fileName)}</strong><span>${esc(item.file.fileName)} · ${evidenceLabel(FIELD_VISIT_EVIDENCE_CATEGORIES, item.category)}${observationReference(params.visit, item.observation_id) ? ` · ${esc(observationReference(params.visit, item.observation_id))}` : ''}</span>${item.engineer_note ? `<div class="evidence-note"><strong>ملاحظة المهندس:</strong> ${esc(item.engineer_note)}</div>` : ''}</article>`;
  }).join('');

  return `<section class="visit-evidence"><div class="lab">التوثيق المصور والمرفقات</div><div class="evidence-grid">${entries}</div></section>`;
}

export function buildFieldVisitReportHtml(params: {
  client: ClientRecord;
  visit: FieldVisitReport;
  company?: CompanyProfile | null;
  totalVisits?: number;
  evidenceSources?: Record<string, string | null>;
}): string {
  const { client, visit, company, totalVisits } = params;
  const brand = company?.legal_name || company?.name || 'منصة توقع سلامة';
  const project = client.business_name || client.name || '—';
  const checklist = (visit.checklist || [])
    .map((c) => `<tr><td>${esc(c.label)}</td><td>${c.checked ? '✓' : '—'}</td></tr>`)
    .join('');
  const observations = (visit.observations || [])
    .map((observation, index) => `
      <article class="observation">
        <div class="observation-title">ملاحظة ميدانية منظمة #${index + 1}</div>
        <div class="observation-meta">
          <div><strong>التصنيف:</strong> ${esc(observationLabel(FIELD_VISIT_OBSERVATION_CATEGORIES, observation.category))}</div>
          <div><strong>الموقع:</strong> ${esc(observation.location || '—')}</div>
          <div><strong>الخطورة:</strong> ${esc(observationLabel(FIELD_VISIT_OBSERVATION_SEVERITIES, observation.severity))}</div>
          <div><strong>الحالة:</strong> ${esc(observationLabel(FIELD_VISIT_OBSERVATION_STATUSES, observation.status))}</div>
        </div>
        <div class="observation-text"><strong>وصف الملاحظة:</strong><br />${esc(observation.description || '—')}</div>
        <div class="observation-text"><strong>الإجراء المطلوب:</strong><br />${esc(observation.required_action || '—')}</div>
        <div class="observation-meta observation-followup">
          <div><strong>الجهة المسؤولة:</strong> ${esc(observation.responsible_party || '—')}</div>
          <div><strong>تاريخ المعالجة المستهدف:</strong> ${esc(observation.due_date || '—')}</div>
        </div>
      </article>`)
    .join('');

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8" />
  <title>تقرير الزيارة الميدانية #${visit.visit_number}</title>
  <style>
    @page { size: A4; margin: 14mm; }
    body { font-family: 'Noto Naskh Arabic', Tahoma, Arial, sans-serif; color: #122018; font-size: 12pt; line-height: 1.65; margin: 0; background: #fff; }
    .wrap { padding: 8px; }
    .brand { color: #635bdb; font-weight: 700; font-size: 13pt; margin-bottom: 4px; }
    h1 { font-size: 16pt; margin: 8px 0 4px; color: #0f291f; }
    .sub { color: #4a6357; font-size: 10.5pt; margin-bottom: 14px; }
    table { width: 100%; border-collapse: collapse; margin: 10px 0; font-size: 11pt; }
    th, td { border: 1px solid #c5d5cc; padding: 8px 10px; vertical-align: top; }
    th { background: #e7f1eb; text-align: right; width: 32%; }
    .box { border: 1px solid #c5d5cc; border-radius: 8px; padding: 10px 12px; margin-top: 12px; background: #f7faf8; white-space: pre-wrap; }
    .lab { font-weight: 700; color: #635bdb; margin-bottom: 4px; font-size: 10.5pt; }
    .observations, .visit-evidence { margin-top: 12px; }
    /* Keep the evidence heading with the first meaningful evidence card; later cards may flow normally. */
    .visit-evidence > .lab { break-after: avoid-page; page-break-after: avoid; }
    .evidence-grid > :first-child { break-before: avoid-page; page-break-before: avoid; }
    .observation { border: 1px solid #e2d6b8; border-radius: 8px; padding: 9px 10px; margin-top: 8px; background: #fffdf7; break-inside: avoid; page-break-inside: avoid; }
    .observation-title { color: #6e4f08; font-weight: 700; margin-bottom: 7px; }
    .observation-meta { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 5px 12px; font-size: 10pt; }
    .observation-followup { margin-top: 7px; }
    .observation-text { margin-top: 7px; padding-top: 7px; border-top: 1px solid #eee4c8; white-space: pre-wrap; }
    .evidence-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin-top: 8px; }
    .evidence-figure, .attachment-ref { margin: 0; border: 1px solid #cbd9d1; border-radius: 8px; padding: 8px; background: #fbfdfc; break-inside: avoid; page-break-inside: avoid; min-width: 0; }
    .evidence-media { height: 185px; display: flex; align-items: center; justify-content: center; background: #f2f6f3; border-radius: 5px; overflow: hidden; }
    .evidence-media img { max-width: 100%; max-height: 185px; width: auto; height: auto; object-fit: contain; display: block; }
    figcaption { display: grid; gap: 2px; margin-top: 7px; font-size: 9.5pt; line-height: 1.45; }
    figcaption span, .attachment-ref span { color: #4a6357; font-size: 8.8pt; }
    .figure-number { color: #635bdb; font-size: 8.8pt; font-weight: 700; margin-top: 4px; }
    .evidence-note { font-size: 8.8pt; color: #31493d; white-space: pre-wrap; }
    .attachment-ref { display: grid; gap: 4px; font-size: 9.5pt; }
    .foot { margin-top: 18px; font-size: 9.5pt; color: #5a6f64; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="brand">${esc(brand)}</div>
    <h1>تقرير الزيارة الميدانية رقم ${visit.visit_number}</h1>
    <div class="sub">${esc(project)} — ${esc(client.client_code)}${totalVisits ? ` · إجمالي الزيارات المخططة: ${totalVisits}` : ''}</div>
    <table>
      <tr><th>رقم الزيارة</th><td>${visit.visit_number}</td></tr>
      <tr><th>تاريخ الزيارة</th><td>${esc(visit.visit_date || 'لم يتم إدخال القيمة')}</td></tr>
      <tr><th>المهندس</th><td>${esc(visit.engineer_name || 'لم يتم إدخال القيمة')}</td></tr>
      <tr><th>حالة التقرير</th><td>${esc(visit.status || 'مسودة')}</td></tr>
      <tr><th>الموقع</th><td>${esc(visit.location || client.city || 'غير متوفر')}</td></tr>
      <tr><th>اسم المالك</th><td>${esc(client.owner_name || 'غير متوفر')}</td></tr>
    </table>
    <div class="box"><div class="lab">النتائج والملاحظات</div>${esc(visit.findings || 'لم يتم إدخال القيمة')}</div>
    ${visit.recommendations?.trim() ? `<div class="box"><div class="lab">التوصيات</div>${esc(visit.recommendations)}</div>` : ''}
    ${observations ? `<section class="observations"><div class="lab">الملاحظات الميدانية المنظمة</div>${observations}</section>` : ''}
    ${renderVisitEvidence({ visit, evidenceSources: params.evidenceSources })}
    ${checklist ? `<table><thead><tr><th>بند الفحص</th><th>الحالة</th></tr></thead><tbody>${checklist}</tbody></table>` : ''}
    <div class="foot">مستند ثابت — يُحفظ كمرفق PDF لكل زيارة على حدة ولا يُستبدل بزيارات لاحقة.</div>
  </div>
</body>
</html>`;
}

async function resolveVisitEvidenceSources(clientId: string, visit: FieldVisitReport) {
  const normalized = normalizeFieldVisitEvidenceForVisit(visit);
  const selected = (normalized.evidence || []).filter((item) => item.include_in_visit_pdf && item.kind === 'photo');
  const entries = await Promise.all(selected.map(async (item) => [item.id, await resolveFieldVisitEvidenceSrc({ clientId, visitNumber: normalized.visit_number, item })] as const));
  return Object.fromEntries(entries);
}

export async function printFieldVisitReport(params: {
  client: ClientRecord;
  visit: FieldVisitReport;
  company?: CompanyProfile | null;
  totalVisits?: number;
}) {
  const { loadCompanyProfile } = await import('@/lib/company-profile');
  const profile = params.company || (await loadCompanyProfile());
  const evidenceSources = await resolveVisitEvidenceSources(params.client.id, params.visit);
  const html = buildFieldVisitReportHtml({ ...params, company: profile, evidenceSources });
  const { openDocumentPreview } = await import('@/lib/print/document-preview');
  openDocumentPreview({
    title: `تقرير الزيارة #${params.visit.visit_number} — ${params.client.business_name || params.client.name}`,
    html,
    fileName: `field-visit-${params.visit.visit_number}-${params.client.client_code || params.client.id}`,
  });
}

export { resolveVisitEvidenceSources };
