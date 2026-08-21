'use client';

/**
 * تقرير الإشراف الدوري ومتابعة الإنجاز — طباعة A4 أفقية متعددة الصفحات.
 */

import type { CompanyProfile } from '@/lib/company-profile';
import type { ClientRecord } from '@/lib/types/client';
import type {
  FieldVisitEvidence,
  FieldVisitReport,
  SupervisionReport,
  SupervisionTaskRow,
  TechnicalNotesReport,
} from '@/lib/types/project-reports';
import {
  SUPERVISION_LEGEND,
  calcTaskTotalPercent,
  resolveOverallProgress,
  statusCellColor,
} from '@/lib/projects/supervision-report';
import { formatGregorianDate } from '@/lib/projects/safety-delivery-letter';
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
import {
  buildRemediationCases,
  hasEngineerVerifiedRemediation,
  observationRefKey,
} from '@/lib/projects/field-visit-remediation';

function esc(value: string | number | null | undefined): string {
  return String(value ?? '—')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function displayDate(isoOrText: string | undefined | null): string {
  const raw = String(isoOrText ?? '').trim();
  if (!raw) return '—';
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return formatGregorianDate(raw);
  return raw;
}

function percentText(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return '—';
  return `${Math.round(value)}%`;
}

function categoryRowSpans(tasks: SupervisionTaskRow[]): Map<string, number> {
  const spans = new Map<string, number>();
  for (const task of tasks) {
    spans.set(task.category_id, (spans.get(task.category_id) || 0) + 1);
  }
  return spans;
}

const SUPERVISION_EVIDENCE_SELECTION_NOTE =
  'تظهر الأدلة المحددة للطباعة في بيانات الزيارة فقط؛ لا ينشئ هذا التقرير اختياراً جديداً ولا يغيّر حالة الدليل.';

function selectedEvidence(visits: FieldVisitReport[]) {
  return (visits || []).flatMap((visit) =>
    (normalizeFieldVisitEvidenceForVisit(visit).evidence || [])
      .filter((item) => item.include_in_visit_pdf)
      .map((item) => ({ visit, item }))
  );
}

function observationReference(visit: FieldVisitReport, observationId: string | null | undefined) {
  if (!observationId) return 'غير مرتبط بملاحظة منظمة';
  const index = (visit.observations || []).findIndex((item) => item.id === observationId);
  return index >= 0
    ? `الزيارة ${visit.visit_number} — الملاحظة ${index + 1}`
    : `الزيارة ${visit.visit_number} — مرجع ملاحظة غير متاح`;
}

function evidenceCaption(visit: FieldVisitReport, item: FieldVisitEvidence) {
  const meta = [
    `الزيارة ${visit.visit_number}`,
    evidenceLabel(FIELD_VISIT_EVIDENCE_CATEGORIES, item.category),
    evidenceLabel(FIELD_VISIT_EVIDENCE_TIMINGS, item.timing),
    observationReference(visit, item.observation_id),
  ].filter(Boolean);
  return `<figcaption><strong>${esc(item.title || item.file.fileName)}</strong><span>${esc(meta.join(' · '))}</span>${item.description ? `<span>${esc(item.description)}</span>` : ''}${item.engineer_note ? `<span><strong>ملاحظة المهندس:</strong> ${esc(item.engineer_note)}</span>` : ''}</figcaption>`;
}

async function resolveSupervisionEvidenceSources(clientId: string, visits: FieldVisitReport[]) {
  const entries = await Promise.all(
    selectedEvidence(visits)
      .filter(({ item }) => item.kind === 'photo')
      .map(async ({ visit, item }) => [
        `${visit.visit_number}:${item.id}`,
        await resolveFieldVisitEvidenceSrc({ clientId, visitNumber: visit.visit_number, item }),
      ] as const)
  );
  return Object.fromEntries(entries);
}

export function buildSupervisionReportHtml(params: {
  client: ClientRecord;
  report: SupervisionReport;
  company: CompanyProfile;
  fieldVisits?: FieldVisitReport[];
  technicalNotes?: TechnicalNotesReport;
  evidenceSources?: Record<string, string | null>;
}): string {
  const { client, report, company } = params;
  const fieldVisits = params.fieldVisits || [];
  const technicalNotes: TechnicalNotesReport = params.technicalNotes || {
    status: 'مسودة',
    deficiencies: [],
  };
  const months = report.months || [];
  const tasks = report.tasks || [];
  const overall = resolveOverallProgress(report);
  const spans = categoryRowSpans(tasks);
  const seenCategory = new Set<string>();

  const logo = company.logo_url
    ? `<img class="logo" src="${esc(company.logo_url)}" alt="شعار" />`
    : `<div class="logo-fallback">${esc(company.name)}</div>`;

  const monthHeaders = months
    .map((m) => `<th class="month">${esc(m.label)}</th>`)
    .join('');

  const bodyRows = tasks
    .map((task) => {
      let categoryCell = '';
      if (!seenCategory.has(task.category_id)) {
        seenCategory.add(task.category_id);
        const rowspan = spans.get(task.category_id) || 1;
        categoryCell = `<td class="cat" rowspan="${rowspan}">${esc(task.category_label)}</td>`;
      }
      const monthCells = months
        .map((m) => {
          const cell = task.month_progress?.[m.id];
          const bg = statusCellColor(cell?.status || '');
          return `<td class="pct" style="background:${bg}">${esc(percentText(cell?.percent))}</td>`;
        })
        .join('');
      return `<tr>
        ${categoryCell}
        <td class="desc">${esc(task.description)}</td>
        <td class="type">${esc(task.work_type || '—')}</td>
        ${monthCells}
        <td class="pct total">${esc(percentText(calcTaskTotalPercent(task)))}</td>
      </tr>`;
    })
    .join('');

  const legend = SUPERVISION_LEGEND.map(
    (item) =>
      `<div class="legend-item"><span class="swatch" style="background:${item.color}"></span><span>${esc(item.label)}</span></div>`
  ).join('');

  const area = report.area_m2?.trim()
    ? `${report.area_m2.trim()}${/م/.test(report.area_m2) ? '' : ' م²'}`
    : '—';

  const orderedVisits = [...fieldVisits].sort((left, right) => left.visit_number - right.visit_number);
  const remediationCases = buildRemediationCases({
    visits: orderedVisits,
    supervision: report,
    technicalNotes,
  });
  const taskById = new Map(tasks.map((task) => [task.id, task]));
  const visitRows = orderedVisits
    .map((visit) => `<tr>
      <td>${esc(visit.visit_number)}</td>
      <td>${esc(displayDate(visit.visit_date))}</td>
      <td>${esc(visit.engineer_name || '—')}</td>
      <td>${esc(visit.location || '—')}</td>
      <td>${esc(visit.status || 'مسودة')}</td>
      <td>${esc((visit.observations || []).length)}</td>
      <td>${esc(selectedEvidence([visit]).length)}</td>
    </tr>`)
    .join('');
  const observationRows = orderedVisits
    .flatMap((visit) =>
      (visit.observations || []).map((observation, index) => `<tr class="severity-${esc(observation.severity)}">
        <td>${esc(`V${visit.visit_number}-${index + 1}`)}</td>
        <td>${esc(observationLabel(FIELD_VISIT_OBSERVATION_CATEGORIES, observation.category))}</td>
        <td>${esc(observation.location || '—')}</td>
        <td>${esc(observation.description || '—')}</td>
        <td>${esc(observationLabel(FIELD_VISIT_OBSERVATION_SEVERITIES, observation.severity))}</td>
        <td>${esc(observationLabel(FIELD_VISIT_OBSERVATION_STATUSES, observation.status))}</td>
        <td>${esc(observation.required_action || '—')}</td>
      </tr>`)
    )
    .join('');
  const remediationRows = remediationCases
    .map((remediationCase) => {
      const current = remediationCase.current.observation;
      const taskLabels = remediationCase.linkedSupervisionTaskIds
        .map((id) => taskById.get(id)?.description || id)
        .filter(Boolean);
      const deficiencyLabels = remediationCase.linkedDeficiencies.map((deficiency) =>
        `${deficiency.description || deficiency.id} (${deficiency.resolved ? 'محلولة' : 'مفتوحة'})`
      );
      const rootLabel = `V${remediationCase.root.ref.visit_number}-${remediationCase.root.observation.id}`;
      const verified = hasEngineerVerifiedRemediation(current);
      return `<tr>
        <td>${esc(rootLabel)}</td>
        <td>${esc(observationLabel(FIELD_VISIT_OBSERVATION_SEVERITIES, remediationCase.root.observation.severity))}</td>
        <td>${esc(observationLabel(FIELD_VISIT_OBSERVATION_STATUSES, current.status))}</td>
        <td>${verified ? 'تم التحقق هندسياً' : 'لم يكتمل التحقق الهندسي'}</td>
        <td>${esc(displayDate(current.resolved_at))}</td>
        <td>${esc(current.verified_by || current.resolved_by || '—')}</td>
        <td>${esc(taskLabels.join('؛ ') || '—')}</td>
        <td>${esc(deficiencyLabels.join('؛ ') || '—')}</td>
      </tr>`;
    })
    .join('');
  const selectedEvidenceEntries = selectedEvidence(orderedVisits);
  let figureNumber = 0;
  const evidenceCards = selectedEvidenceEntries.map(({ visit, item }) => {
    const source = params.evidenceSources?.[`${visit.visit_number}:${item.id}`] || null;
    const isImage = item.kind === 'photo' && /^image\/(jpeg|png)$/i.test(item.file.mimeType);
    if (isImage && source) {
      figureNumber += 1;
      return `<figure class="supervision-evidence-card"><div class="supervision-evidence-media"><img src="${esc(source)}" alt="${esc(item.title || item.file.fileName)}" /></div>${evidenceCaption(visit, item)}<div class="figure-number">شكل (${figureNumber})</div></figure>`;
    }
    if (isImage) {
      return `<article class="supervision-attachment-ref"><strong>${esc(item.title || item.file.fileName)}</strong><span>صورة محددة تعذر تحميل معاينتها في وقت إنشاء التقرير؛ لم تُدرج كصورة مرقمة.</span>${evidenceCaption(visit, item)}</article>`;
    }
    return `<article class="supervision-attachment-ref"><strong>مرفق PDF: ${esc(item.title || item.file.fileName)}</strong><span>${esc(item.file.fileName)} · ${esc(observationReference(visit, item.observation_id))}</span>${item.engineer_note ? `<span><strong>ملاحظة المهندس:</strong> ${esc(item.engineer_note)}</span>` : ''}</article>`;
  });
  const [firstEvidenceCard, secondEvidenceCard, thirdEvidenceCard, ...remainingEvidenceCards] = evidenceCards;
  const firstEvidenceRow = [firstEvidenceCard, secondEvidenceCard, thirdEvidenceCard].filter(Boolean).join('');
  const hasStage5Content = Boolean(orderedVisits.length || remediationCases.length || selectedEvidenceEntries.length);

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <title>تقرير الإشراف الدوري ومتابعة الإنجاز — ${esc(report.project_name || client.business_name || client.name)}</title>
  <style>
    @page {
      size: A4 landscape;
      margin: 8mm;
    }
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      padding: 0;
      background: #e8eef2;
      color: #111;
      font-family: "Tahoma", "Segoe UI", Arial, sans-serif;
      font-size: 10px;
      line-height: 1.35;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    header, footer, .no-print { display: none !important; }

    .report-page-container {
      width: 297mm;
      min-height: 210mm;
      padding: 8mm 10mm;
      margin: 0 auto;
      background: #fff;
      color: #111;
      direction: rtl;
      page-break-after: always;
    }
    .report-page-container:last-child { page-break-after: auto; }

    .top {
      display: grid;
      grid-template-columns: 1fr auto 1fr;
      gap: 8px;
      align-items: center;
      border-bottom: 2px solid #635bdb;
      padding-bottom: 6px;
      margin-bottom: 8px;
    }
    .logo, .logo-fallback {
      width: 42px; height: 42px; object-fit: contain;
      display: block;
    }
    .logo-fallback {
      border: 1px solid #635bdb;
      display: flex; align-items: center; justify-content: center;
      font-size: 8px; text-align: center; padding: 2px;
    }
    .title-block { text-align: center; }
    .title-block h1 {
      margin: 0;
      font-size: 14px;
      color: #635bdb;
    }
    .title-block p { margin: 2px 0 0; font-size: 9px; color: #444; }
    .office { text-align: left; font-size: 9px; }

    .meta {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 4px 14px;
      margin-bottom: 8px;
      border: 1px solid #cbd5e1;
      padding: 6px 8px;
      background: #f8fafc;
    }
    .meta .row {
      display: flex;
      gap: 6px;
      font-size: 9.5px;
    }
    .meta .label { font-weight: 700; color: #635bdb; white-space: nowrap; }
    .meta .value { flex: 1; border-bottom: 1px dotted #94a3b8; min-height: 14px; }

    .legend {
      display: flex;
      flex-wrap: wrap;
      gap: 10px 18px;
      margin: 0 0 8px;
      font-size: 9px;
    }
    .legend-item { display: flex; align-items: center; gap: 6px; }
    .swatch {
      width: 14px; height: 14px;
      border: 1px solid #64748b;
      display: inline-block;
    }

    table.progress {
      width: 100%;
      border-collapse: collapse;
      page-break-inside: auto;
      font-size: 9px;
    }
    table.progress thead { display: table-header-group; }
    table.progress tfoot { display: table-footer-group; }
    table.progress tr {
      page-break-inside: avoid;
      page-break-after: auto;
    }
    table.progress th, table.progress td {
      border: 1px solid #334155;
      padding: 4px 5px;
      vertical-align: middle;
      text-align: center;
    }
    table.progress th {
      background: #635bdb;
      color: #fff;
      font-weight: 700;
    }
    table.progress th.month { min-width: 52px; }
    table.progress td.cat {
      background: #ecfdf5;
      font-weight: 700;
      writing-mode: horizontal-tb;
      max-width: 90px;
    }
    table.progress td.desc { text-align: right; min-width: 120px; }
    table.progress td.type { white-space: nowrap; }
    table.progress td.pct { font-weight: 600; }
    table.progress td.total { background: #f1f5f9; }

    .overall {
      margin-top: 8px;
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      font-size: 11px;
      font-weight: 700;
    }
    .overall span {
      border: 1.5px solid #635bdb;
      padding: 4px 12px;
      background: #ecfdf5;
    }

    .sign {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 12px;
      margin-top: 14px;
      font-size: 9px;
      text-align: center;
    }
    .sign .box {
      border-top: 1px solid #64748b;
      padding-top: 4px;
      margin-top: 28px;
    }

    .stage5-section {
      margin-top: 14px;
      break-before: auto;
      page-break-before: auto;
    }
    .stage5-section + .stage5-section {
      break-before: auto;
      page-break-before: auto;
    }
    .stage5-section h2 {
      margin: 0 0 7px;
      padding-bottom: 4px;
      border-bottom: 2px solid #635bdb;
      color: #3f3a9d;
      font-size: 12px;
      break-after: avoid-page;
      page-break-after: avoid;
    }
    .stage5-section .section-note {
      margin: -2px 0 8px;
      color: #475569;
      font-size: 8.5px;
      line-height: 1.45;
    }
    table.stage5-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 8.6px;
      table-layout: fixed;
      page-break-inside: auto;
    }
    table.stage5-table thead { display: table-header-group; }
    table.stage5-table tr { page-break-inside: avoid; break-inside: avoid; }
    table.stage5-table th, table.stage5-table td {
      border: 1px solid #94a3b8;
      padding: 4px 5px;
      text-align: right;
      vertical-align: top;
      overflow-wrap: anywhere;
    }
    table.stage5-table th { background: #e9e7ff; color: #312e81; font-weight: 700; }
    table.stage5-table .severity-high td { background: #fff7ed; }
    table.stage5-table .severity-critical td { background: #fef2f2; }
    .stage5-empty {
      border: 1px dashed #94a3b8;
      background: #f8fafc;
      color: #475569;
      padding: 8px;
      font-size: 9px;
    }
    .stage5-evidence-section,
    .supervision-evidence-grid {
      break-inside: auto;
      page-break-inside: auto;
    }
    .supervision-evidence-lead {
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .supervision-evidence-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 8px;
      margin-top: 8px;
    }
    .supervision-evidence-grid > :only-child { grid-column: 1 / -1; }
    .supervision-evidence-grid > :only-child .supervision-evidence-media { height: 220px; }
    .supervision-evidence-grid > :only-child .supervision-evidence-media img { max-height: 218px; }
    .supervision-evidence-grid-first.has-following-evidence > :only-child { grid-column: auto; }
    .supervision-evidence-grid-first.has-following-evidence > :only-child .supervision-evidence-media { height: 138px; }
    .supervision-evidence-grid-first.has-following-evidence > :only-child .supervision-evidence-media img { max-height: 136px; }
    .supervision-evidence-card, .supervision-attachment-ref {
      min-width: 0;
      margin: 0;
      padding: 7px;
      border: 1px solid #cbd5e1;
      background: #fbfdff;
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .supervision-evidence-media {
      height: 138px;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      background: #f1f5f9;
      border: 1px solid #e2e8f0;
    }
    .supervision-evidence-media img {
      display: block;
      width: auto;
      height: auto;
      max-width: 100%;
      max-height: 136px;
      object-fit: contain;
    }
    .supervision-evidence-card figcaption, .supervision-attachment-ref {
      display: grid;
      gap: 2px;
      margin-top: 6px;
      font-size: 8.2px;
      line-height: 1.4;
    }
    .supervision-evidence-card figcaption span, .supervision-attachment-ref span { color: #475569; }
    .supervision-attachment-ref { font-size: 8.5px; align-content: start; }
    .figure-number { margin-top: 4px; color: #4f46e5; font-size: 8px; font-weight: 700; }

    @media print {
      @page {
        size: A4 landscape;
        margin: 8mm;
      }
      html, body { background: #fff; }
      .report-page-container {
        width: 100%;
        min-height: auto;
        padding: 0;
        margin: 0;
        page-break-after: always;
      }
      .report-page-container:last-child { page-break-after: auto; }
      table.progress {
        width: 100%;
        border-collapse: collapse;
        page-break-inside: auto;
      }
      table.progress tr {
        page-break-inside: avoid;
        page-break-after: auto;
      }
      table.progress thead, table.stage5-table thead { display: table-header-group; }
      table.stage5-table tr, .supervision-evidence-card, .supervision-attachment-ref {
        page-break-inside: avoid;
        break-inside: avoid;
      }
      .no-print { display: none !important; }
    }
  </style>
</head>
<body>
  <div class="report-page-container">
    <div class="top">
      <div>${logo}</div>
      <div class="title-block">
        <h1>تقرير الإشراف الدوري ومتابعة الإنجاز</h1>
        <p>${esc(company.legal_name || company.name)} — ${esc(company.tagline || '')}</p>
      </div>
      <div class="office">
        <div>تاريخ التقرير: <strong>${esc(displayDate(report.report_date))}</strong></div>
        <div>رقم الاستمارة: <strong dir="ltr">${esc(report.inspection_form_number || '—')}</strong></div>
        <div>رقم الدراسة: <strong dir="ltr">${esc(report.study_number || '—')}</strong></div>
      </div>
    </div>

    <div class="meta">
      <div class="row"><span class="label">المستثمر / المالك:</span><span class="value">${esc(report.owner_name)}</span></div>
      <div class="row"><span class="label">المشروع:</span><span class="value">${esc(report.project_name)}</span></div>
      <div class="row"><span class="label">نوع المبنى:</span><span class="value">${esc(report.building_type)}</span></div>
      <div class="row"><span class="label">المساحة:</span><span class="value">${esc(area)}</span></div>
      <div class="row"><span class="label">المؤسسة / الشركة القائمة بأعمال التنفيذ:</span><span class="value">${esc(report.contractor_name)}</span></div>
      <div class="row"><span class="label">المكتب المشرف:</span><span class="value">${esc(report.supervising_office)}</span></div>
      <div class="row"><span class="label">اسم مدير الفرع:</span><span class="value">${esc(report.branch_manager_name)}</span></div>
      <div class="row"><span class="label">مهندس السلامة:</span><span class="value">${esc(report.safety_engineer_name)}</span></div>
      <div class="row"><span class="label">مدة التنفيذ الكلية:</span><span class="value">${esc(report.total_duration || '—')}</span></div>
      <div class="row"><span class="label">تاريخ البدء:</span><span class="value">${esc(displayDate(report.start_date))}</span></div>
    </div>

    <div class="legend">${legend}</div>

    <table class="progress">
      <thead>
        <tr>
          <th>الأعمال</th>
          <th>الملاحظات والتفاصيل</th>
          <th>نوع العمل (توريد / تركيب)</th>
          ${monthHeaders}
          <th>نسبة الإنجاز %</th>
        </tr>
      </thead>
      <tbody>
        ${bodyRows || `<tr><td colspan="${4 + months.length}">لا توجد بنود متابعة</td></tr>`}
      </tbody>
    </table>

    <div class="overall">
      <span>نسبة الإنجاز الكلي: ${esc(percentText(overall))}</span>
    </div>

    ${report.notes?.trim() ? `<p style="margin-top:8px;font-size:9px"><strong>ملاحظات:</strong> ${esc(report.notes)}</p>` : ''}

    ${hasStage5Content ? `<section class="stage5-section">
      <h2>سجل الزيارات والملاحظات والمعالجات</h2>
      ${orderedVisits.length ? `<h3>الزيارات الميدانية</h3><table class="stage5-table"><thead><tr><th>الزيارة</th><th>التاريخ</th><th>المهندس</th><th>الموقع</th><th>الحالة</th><th>ملاحظات منظمة</th><th>أدلة مختارة</th></tr></thead><tbody>${visitRows}</tbody></table>` : ''}
      ${observationRows ? `<h3>الملاحظات الميدانية المنظمة</h3><table class="stage5-table"><thead><tr><th>المرجع</th><th>التصنيف</th><th>الموقع</th><th>الوصف</th><th>الخطورة</th><th>الحالة</th><th>الإجراء المطلوب</th></tr></thead><tbody>${observationRows}</tbody></table>` : ''}
      ${remediationRows ? `<h3>متابعة المعالجات والتحقق</h3><table class="stage5-table"><thead><tr><th>مرجع الحالة</th><th>الخطورة الأصلية</th><th>الحالة الحالية</th><th>التحقق</th><th>تاريخ المعالجة</th><th>المهندس</th><th>بنود الإشراف المرتبطة</th><th>العجوزات الفنية المرتبطة</th></tr></thead><tbody>${remediationRows}</tbody></table>` : ''}
      ${!orderedVisits.length ? `<div class="stage5-empty">لا توجد زيارات ميدانية مسجلة ضمن بيانات المشروع الحالية.</div>` : ''}
    </section>` : ''}

    ${selectedEvidenceEntries.length ? `<section class="stage5-section stage5-evidence-section">
      <div class="supervision-evidence-lead">
        <h2>التوثيق المصور والمرفقات المختارة</h2>
        <p class="section-note">${esc(SUPERVISION_EVIDENCE_SELECTION_NOTE)}</p>
        <div class="supervision-evidence-grid supervision-evidence-grid-first${remainingEvidenceCards.length ? ' has-following-evidence' : ''}">${firstEvidenceRow}</div>
      </div>
      ${remainingEvidenceCards.length ? `<div class="supervision-evidence-grid">${remainingEvidenceCards.join('')}</div>` : ''}
    </section>` : ''}

    <div class="sign">
      <div class="box">مهندس السلامة<br/>${esc(report.safety_engineer_name || '')}</div>
      <div class="box">مدير الفرع<br/>${esc(report.branch_manager_name || '')}</div>
      <div class="box">المكتب المشرف<br/>${esc(report.supervising_office || '')}</div>
    </div>
  </div>
</body>
</html>`;
}

export function printSupervisionReport(
  client: ClientRecord,
  report: SupervisionReport,
  company?: CompanyProfile | null,
  stage5?: { fieldVisits?: FieldVisitReport[]; technicalNotes?: TechnicalNotesReport }
) {
  const run = async () => {
    const { loadCompanyProfile } = await import('@/lib/company-profile');
    const profile = company || (await loadCompanyProfile());
    const fieldVisits = stage5?.fieldVisits || [];
    const evidenceSources = await resolveSupervisionEvidenceSources(client.id, fieldVisits);
    const html = buildSupervisionReportHtml({
      client,
      report,
      company: profile,
      fieldVisits,
      technicalNotes: stage5?.technicalNotes,
      evidenceSources,
    });
    const { openDocumentPreview } = await import('@/lib/print/document-preview');
    openDocumentPreview({
      title: `تقرير الإشراف — ${client.business_name || client.name}`,
      html,
      fileName: `supervision-report-${report.inspection_form_number || client.client_code || client.id}`,
    });
  };

  const schedule =
    typeof window !== 'undefined' &&
    typeof (window as Window & { requestIdleCallback?: Function }).requestIdleCallback === 'function'
      ? (cb: () => void) =>
          (
            window as Window & {
              requestIdleCallback: (fn: () => void, opts?: { timeout: number }) => number;
            }
          ).requestIdleCallback(cb, { timeout: 400 })
      : (cb: () => void) => setTimeout(cb, 0);

  schedule(() => {
    void run();
  });
}

export { resolveSupervisionEvidenceSources };
