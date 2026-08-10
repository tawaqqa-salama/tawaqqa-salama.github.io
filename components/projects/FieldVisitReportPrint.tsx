import type { CompanyProfile } from '@/lib/company-profile';
import type { ClientRecord } from '@/lib/types/client';
import type { FieldVisitReport } from '@/lib/types/project-reports';

function esc(v: string | null | undefined) {
  return String(v || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function buildFieldVisitReportHtml(params: {
  client: ClientRecord;
  visit: FieldVisitReport;
  company?: CompanyProfile | null;
  totalVisits?: number;
}): string {
  const { client, visit, company, totalVisits } = params;
  const brand = company?.legal_name || company?.name || 'منصة توقع سلامة';
  const project = client.business_name || client.name || '—';
  const checklist = (visit.checklist || [])
    .map(
      (c) =>
        `<tr><td>${esc(c.label)}</td><td>${c.checked ? '✓' : '—'}</td></tr>`
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8" />
  <title>تقرير الزيارة الميدانية #${visit.visit_number}</title>
  <style>
    @page { size: A4; margin: 14mm; }
    body {
      font-family: 'Noto Naskh Arabic', Tahoma, Arial, sans-serif;
      color: #122018; font-size: 12pt; line-height: 1.65; margin: 0; background: #fff;
    }
    .wrap { padding: 8px; }
    .brand { color: #1f4d3a; font-weight: 700; font-size: 13pt; margin-bottom: 4px; }
    h1 { font-size: 16pt; margin: 8px 0 4px; color: #0f291f; }
    .sub { color: #4a6357; font-size: 10.5pt; margin-bottom: 14px; }
    table { width: 100%; border-collapse: collapse; margin: 10px 0; font-size: 11pt; }
    th, td { border: 1px solid #c5d5cc; padding: 8px 10px; vertical-align: top; }
    th { background: #e7f1eb; text-align: right; width: 32%; }
    .box {
      border: 1px solid #c5d5cc; border-radius: 8px; padding: 10px 12px; margin-top: 12px;
      background: #f7faf8; white-space: pre-wrap;
    }
    .lab { font-weight: 700; color: #1f4d3a; margin-bottom: 4px; font-size: 10.5pt; }
    .foot { margin-top: 18px; font-size: 9.5pt; color: #5a6f64; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="brand">${esc(brand)}</div>
    <h1>تقرير الزيارة الميدانية رقم ${visit.visit_number}</h1>
    <div class="sub">
      ${esc(project)} — ${esc(client.client_code)}
      ${totalVisits ? ` · إجمالي الزيارات المخططة: ${totalVisits}` : ''}
    </div>
    <table>
      <tr><th>رقم الزيارة</th><td>${visit.visit_number}</td></tr>
      <tr><th>تاريخ الزيارة</th><td>${esc(visit.visit_date || 'لم يتم إدخال القيمة')}</td></tr>
      <tr><th>المهندس</th><td>${esc(visit.engineer_name || 'لم يتم إدخال القيمة')}</td></tr>
      <tr><th>حالة التقرير</th><td>${esc(visit.status || 'مسودة')}</td></tr>
      <tr><th>الموقع</th><td>${esc(visit.location || client.city || 'غير متوفر')}</td></tr>
      <tr><th>اسم المالك</th><td>${esc(client.owner_name || 'غير متوفر')}</td></tr>
    </table>
    <div class="box">
      <div class="lab">النتائج والملاحظات</div>
      ${esc(visit.findings || 'لم يتم إدخال القيمة')}
    </div>
    ${
      visit.recommendations?.trim()
        ? `<div class="box"><div class="lab">التوصيات</div>${esc(visit.recommendations)}</div>`
        : ''
    }
    ${
      checklist
        ? `<table><thead><tr><th>بند الفحص</th><th>الحالة</th></tr></thead><tbody>${checklist}</tbody></table>`
        : ''
    }
    <div class="foot">مستند ثابت — يُحفظ كمرفق PDF لكل زيارة على حدة ولا يُستبدل بزيارات لاحقة.</div>
  </div>
</body>
</html>`;
}

export async function printFieldVisitReport(params: {
  client: ClientRecord;
  visit: FieldVisitReport;
  company?: CompanyProfile | null;
  totalVisits?: number;
}) {
  const { loadCompanyProfile } = await import('@/lib/company-profile');
  const profile = params.company || (await loadCompanyProfile());
  const html = buildFieldVisitReportHtml({ ...params, company: profile });
  const { openDocumentPreview } = await import('@/lib/print/document-preview');
  openDocumentPreview({
    title: `تقرير الزيارة #${params.visit.visit_number} — ${params.client.business_name || params.client.name}`,
    html,
    fileName: `field-visit-${params.visit.visit_number}-${params.client.client_code || params.client.id}`,
  });
}
