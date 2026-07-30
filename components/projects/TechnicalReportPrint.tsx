import type { CompanyProfile } from '@/lib/company-profile';
import { TECH_REPORT_GENERAL_RECOMMENDATIONS, TECH_REPORT_ITEMS } from '@/lib/constants/technical-report';
import type { ClientRecord } from '@/lib/types/client';
import type { TechnicalReport, TechnicalReportSectionItem } from '@/lib/types/project-reports';
import { getTechnicalReportFacilitySnapshot } from '@/lib/projects/technical-report';
import {
  buildCodeProofCards,
  enrichZone,
  floorAreaBalance,
  zonesAreaSum,
} from '@/lib/projects/sbc-classification';

function esc(value: string | null | undefined) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function photoHtml(dataUrl?: string, caption?: string) {
  if (!dataUrl) return '';
  return `<div class="photo"><img src="${dataUrl}" alt="${esc(caption || '')}" />${
    caption ? `<div class="cap">${esc(caption)}</div>` : ''
  }</div>`;
}

function renderItems(title: string, items: TechnicalReportSectionItem[]) {
  const enabled = items.filter((item) => item.enabled);
  if (!enabled.length) return '';
  const blocks = enabled
    .map((item, index) => {
      const catalog = TECH_REPORT_ITEMS.find((c) => c.id === item.id);
      const options = item.selectedOptions.map((opt) => `<li>${esc(opt)}</li>`).join('');
      const photos = item.photos.map((p) => photoHtml(p.dataUrl, p.caption)).join('');
      return `
        <div class="item">
          <h4 class="item-title">${index + 1}. ${esc(catalog?.title || item.id)}</h4>
          ${item.notes ? `<p class="notes">${esc(item.notes)}</p>` : ''}
          ${options ? `<ul class="opts">${options}</ul>` : ''}
          ${photos ? `<div class="photos">${photos}</div>` : ''}
        </div>
      `;
    })
    .join('');
  return `<h2 class="chapter">${esc(title)}</h2>${blocks}`;
}

export function printTechnicalReport(params: {
  client: ClientRecord;
  report: TechnicalReport;
  company: CompanyProfile;
}) {
  const { client, report, company } = params;
  const facility = getTechnicalReportFacilitySnapshot(client);
  const recommendations = TECH_REPORT_GENERAL_RECOMMENDATIONS.filter((item) =>
    report.general_recommendations.some((r) => r.id === item.id && r.checked)
  );
  const proofCards = buildCodeProofCards(report, client);

  const floors = report.floor_uses || [];
  const floorBlocks = floors
    .map((floor) => {
      const balance = floorAreaBalance(floor);
      const zoneRows = floor.zones
        .map((raw) => {
          const zone = enrichZone(raw);
          return `<tr>
            <td>${esc(zone.label)}</td>
            <td>GROUP ${esc(zone.group_letter)}</td>
            <td>${esc(zone.risk_label)}</td>
            <td>${esc(zone.area_m2)}${zone.area_m2 ? ' م²' : ''}</td>
          </tr>`;
        })
        .join('');
      return `
        <h4 style="margin:12px 0 6px;color:#1f4d3a;font-size:13px">${esc(floor.floor_name)} — مساحة الدور ${esc(floor.floor_area_m2 || String(zonesAreaSum(floor.zones)))} م² · ${esc(floor.structure)} · ${esc(floor.classification)}</h4>
        <table class="data">
          <thead><tr><th>المنطقة</th><th>مجموعة الإشغال</th><th>الخطورة</th><th>المساحة</th></tr></thead>
          <tbody>${zoneRows || '<tr><td colspan="4">لا مناطق</td></tr>'}</tbody>
        </table>
        <p style="font-size:11px;color:${balance.ok ? '#166534' : '#92400e'}">مجموع المناطق: ${balance.zonesSum} م² ${balance.ok ? '(متطابق مع مساحة الدور)' : `(فرق ${balance.diff})`}</p>
      `;
    })
    .join('');

  const componentsRows = (report.components || [])
    .map(
      (row, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>${esc(row.part_name)}</td>
        <td>${esc(row.structure)}</td>
        <td>${esc(row.classification)}</td>
        <td>${esc(row.area_m2)}${row.area_m2 ? ' م²' : ''}</td>
      </tr>`
    )
    .join('');

  const proofHtml = proofCards
    .map(
      (card) => `
      <div class="proof">
        <div class="proof-title">${esc(card.title)}</div>
        <div class="proof-sub">${esc(card.subtitle)}</div>
        <table class="data">
          ${card.rows
            .map((row) => `<tr><th style="width:36%">${esc(row.label)}</th><td>${esc(row.value)}</td></tr>`)
            .join('')}
        </table>
        ${card.highlight ? `<p class="proof-note">${esc(card.highlight)}</p>` : ''}
        <p class="refs">مراجع: ${esc(card.refs.join(' · '))}</p>
      </div>`
    )
    .join('');

  const codePhotos = (report.code_proof_photos || [])
    .map((p) => photoHtml(p.dataUrl, p.caption || 'مقطع من الكود'))
    .join('');

  const headerBlock = `
    <div class="header">
      <div class="logo">
        ${company.logo_url ? `<img src="${company.logo_url}" alt="logo" />` : ''}
        <div class="name">${esc(company.legal_name || company.name)}</div>
      </div>
      <div class="banner">${esc(company.tagline)}</div>
    </div>`;

  const html = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8" />
  <title>تقرير فني — ${esc(facility.business_name)}</title>
  <style>
    @page { size: A4 portrait; margin: 14mm 12mm 18mm; }
    html, body { width: 210mm; }
    body { font-family: "Tahoma","Segoe UI",Arial,sans-serif; color:#222; line-height:1.7; margin:0 auto; max-width:210mm; }
    .header { display:flex; justify-content:space-between; align-items:flex-start; gap:12px; border-bottom:2px solid #1f4d3a; padding-bottom:10px; margin-bottom:16px; }
    .logo { display:flex; gap:10px; align-items:center; max-width:55%; }
    .logo img { width:54px; height:54px; object-fit:contain; }
    .logo .name { font-weight:700; color:#1f4d3a; font-size:14px; }
    .banner { background:#c0392b; color:#fff; padding:8px 12px; border-radius:4px; font-size:11px; text-align:center; max-width:42%; }
    .meta { display:flex; justify-content:space-between; font-size:12px; margin:8px 0 18px; color:#444; }
    .cover-title { text-align:center; color:#c0392b; font-size:20px; font-weight:800; margin:28px 0 18px; }
    .cover-fields { width:70%; margin:0 auto 24px; font-size:14px; }
    .cover-fields div { margin:8px 0; }
    .signs { display:flex; justify-content:space-between; margin:40px 12% 20px; text-align:center; font-size:13px; }
    .stamp { width:90px; height:90px; border:2px dashed #1f4d3a; border-radius:50%; margin:0 auto 8px; display:flex; align-items:center; justify-content:center; color:#1f4d3a; font-size:10px; text-align:center; padding:8px; }
    h2.chapter { color:#c0392b; text-align:center; margin:22px 0 12px; font-size:16px; }
    h3.section { color:#1f4d3a; margin:16px 0 8px; font-size:14px; }
    table.data { width:100%; border-collapse:collapse; font-size:12px; margin:8px 0 14px; }
    table.data th, table.data td { border:1px solid #999; padding:6px 8px; vertical-align:top; }
    table.data th { background:#eef2f7; }
    .item { margin:10px 0 14px; }
    .item-title { color:#1f6b45; font-size:13px; margin:0 0 4px; }
    .notes { font-size:12px; margin:4px 0; }
    .opts { margin:4px 0 8px 0; padding-right:18px; font-size:12px; }
    .photos { display:flex; flex-wrap:wrap; gap:8px; margin-top:6px; }
    .photo { width:48%; page-break-inside: avoid; }
    .photo img { width:100%; max-height:220px; object-fit:contain; border:1px solid #ddd; background:#fafafa; }
    .cap { font-size:10px; color:#666; text-align:center; }
    .proof { border:1px solid #cbd5e1; border-radius:6px; margin:10px 0 14px; overflow:hidden; page-break-inside: avoid; }
    .proof-title { background:#1f4d3a; color:#fff; padding:8px 10px; font-size:12px; font-weight:700; }
    .proof-sub { background:#fef2f2; color:#c0392b; padding:6px 10px; font-size:12px; font-weight:700; }
    .proof-note { padding:6px 10px; font-size:11px; color:#92400e; background:#fffbeb; margin:0; }
    .refs { padding:4px 10px 8px; font-size:10px; color:#64748b; margin:0; }
    .footer { position:fixed; bottom:0; left:0; right:0; border-top:1px solid #1f4d3a; padding-top:6px; font-size:10px; color:#444; text-align:center; background:#fff; }
    .page { page-break-after: always; padding-bottom:36px; }
    .page:last-child { page-break-after: auto; }
    @media print {
      .no-print { display:none !important; }
      body { max-width:none; }
    }
  </style>
</head>
<body>
  <div class="no-print" style="margin-bottom:12px;text-align:center">
    <button onclick="window.print()" style="padding:8px 16px;font-size:14px">طباعة / حفظ PDF (A4 عمودي)</button>
  </div>

  <section class="page">
    ${headerBlock}
    <div class="meta">
      <div>التاريخ: ${esc(report.report_date || '')}</div>
      <div>الصادر: ${esc(report.outgoing_number || '')}</div>
    </div>
    <div class="cover-title">تقرير فني لأنظمة السلامة والوقاية من الحريق</div>
    <div class="cover-fields">
      <div><strong>مشروع:</strong> ${esc(facility.business_name)}</div>
      <div><strong>الموقع:</strong> ${esc(facility.location_summary)}</div>
      <div><strong>قسم الدفاع المدني المختص:</strong> ${esc(report.civil_defense_branch || '—')}</div>
      <div><strong>المالك:</strong> ${esc(facility.owner_name)}</div>
      <div><strong>تصنيف المبنى:</strong> ${esc(report.building_classification || '—')}</div>
      <div><strong>تصنيف الخطورة:</strong> ${esc(report.risk_class || '—')}</div>
    </div>
    <div class="signs">
      <div>
        <div>مهندس السلامة</div>
        <div style="margin-top:36px">${esc(report.safety_engineer_name || '................')}</div>
      </div>
      <div>
        <div class="stamp">${esc(company.stamp_text || company.name)}</div>
      </div>
      <div>
        <div>المدير التنفيذي</div>
        <div style="margin-top:36px">${esc(report.executive_director_name || '................')}</div>
      </div>
    </div>
  </section>

  <section class="page">
    ${headerBlock}
    <h2 class="chapter">نبذة</h2>
    <p style="font-size:13px">${esc(report.overview_text || '')}</p>
    ${photoHtml(report.site_photo?.dataUrl, 'صورة المشروع')}
    <div class="stamp" style="margin:24px auto 0">${esc(company.stamp_text || company.name)}</div>
  </section>

  <section class="page">
    ${headerBlock}
    <h2 class="chapter">جدول المحتويات</h2>
    <ol style="font-size:14px; line-height:2.1; padding-right:22px">
      <li><strong>الباب الأول: عن المنشأة</strong>
        <ul style="padding-right:18px; list-style:disc">
          <li>بيانات المنشأة العامة</li>
          <li>الموقع</li>
          <li>الأدوار والمناطق</li>
          <li>مكونات المشروع والحالة الإنشائية</li>
          <li>إثباتات التصنيف من الكود</li>
        </ul>
      </li>
      <li><strong>الباب الثاني: أنظمة السلامة</strong>
        <ul style="padding-right:18px; list-style:disc">
          <li>أنظمة مكافحة الحريق</li>
          <li>أنظمة التهوية الميكانيكية</li>
          <li>وسائل الإنذار المبكر عن الحريق</li>
          <li>مخارج ومسالك الهروب</li>
        </ul>
      </li>
      <li><strong>التوصيات العامة</strong></li>
    </ol>
  </section>

  <section class="page">
    ${headerBlock}
    <h2 class="chapter">الباب الأول: عن المنشأة</h2>
    <h3 class="section">بيانات المنشأة العامة</h3>
    <table class="data">
      <tr><th>اسم المنشأة</th><td>${esc(facility.business_name)}</td></tr>
      <tr><th>النشاط</th><td>${esc(facility.activity_label)}</td></tr>
      <tr><th>المالك / المستثمر</th><td>${esc(facility.owner_name)}</td></tr>
      <tr><th>قسم الدفاع المدني</th><td>${esc(report.civil_defense_branch || '—')}</td></tr>
      <tr><th>الصك</th><td>رقم: ${esc(report.deed_number || '—')} — تاريخ: ${esc(report.deed_date || '—')}</td></tr>
      <tr><th>رخصة البناء</th><td>رقم: ${esc(report.building_permit_number || '—')} — تاريخ: ${esc(report.building_permit_date || '—')}</td></tr>
      <tr><th>مساحة الموقع العام</th><td>${esc(facility.land_area ? facility.land_area + ' م²' : '—')}</td></tr>
      <tr><th>عدد الأدوار</th><td>${esc(report.floors_description || facility.floors_count || '—')}</td></tr>
      <tr><th>مساحة البناء</th><td>${esc(facility.building_area ? facility.building_area + ' م²' : '—')}</td></tr>
      <tr><th>الموقع</th><td>${esc(facility.location_summary)}</td></tr>
      <tr><th>تصنيف المبنى (SBC)</th><td>${esc(report.building_classification || '—')}</td></tr>
      <tr><th>تصنيف الخطورة</th><td>${esc(report.risk_class || '—')}</td></tr>
      <tr><th>حالة المبنى</th><td>${esc(report.building_status || '—')}</td></tr>
    </table>

    <h3 class="section">الموقع</h3>
    <p style="font-size:12px">${esc(report.location_description || '')}</p>
    ${photoHtml(report.earth_photo?.dataUrl, 'صورة Google Earth')}
    ${photoHtml(report.facade_photo?.dataUrl, 'واجهة المشروع')}

    <h3 class="section">الأدوار والمناطق</h3>
    ${floorBlocks || '<p style="font-size:12px">لا توجد أدوار بعد</p>'}

    <h3 class="section">مكونات المشروع والحالة الإنشائية</h3>
    <table class="data">
      <thead>
        <tr>
          <th>#</th><th>المبنى / الدور</th><th>الهيكل الإنشائي</th><th>التصنيف الإنشائي</th><th>المساحة طبقاً للواقع</th>
        </tr>
      </thead>
      <tbody>${componentsRows || '<tr><td colspan="5">لا توجد بيانات</td></tr>'}</tbody>
    </table>
    ${report.risk_class ? `<p style="font-size:12px">• تم تصنيف المشروع: ${esc(report.risk_class)}</p>` : ''}
  </section>

  <section class="page">
    ${headerBlock}
    <h2 class="chapter">إثباتات التصنيف من الكود السعودي</h2>
    ${proofHtml}
    ${codePhotos ? `<h3 class="section">صور مقاطع من الكود</h3><div class="photos">${codePhotos}</div>` : ''}
  </section>

  <section class="page">
    ${headerBlock}
    <h2 class="chapter">الباب الثاني: أنظمة السلامة</h2>
    ${renderItems('أنظمة مكافحة الحريق', report.firefighting_items)}
    ${renderItems('أنظمة التهوية الميكانيكية', report.ventilation_items)}
    ${renderItems('وسائل الإنذار المبكر عن الحريق', report.alarm_items)}
    ${renderItems('مخارج ومسالك الهروب', report.exits_items)}
  </section>

  <section class="page">
    ${headerBlock}
    <h2 class="chapter">التوصيات العامة</h2>
    <ol style="font-size:13px; padding-right:18px">
      ${
        recommendations.length
          ? recommendations.map((r) => `<li style="margin:8px 0">${esc(r.label)}</li>`).join('')
          : '<li>لم يتم اختيار توصيات بعد</li>'
      }
    </ol>
  </section>

  <div class="footer">
    ${esc(company.address)}${company.city ? ` — ${esc(company.city)}` : ''}
    ${company.commercial_register ? ` | س.ت: ${esc(company.commercial_register)}` : ''}
    ${company.membership_id ? ` | عضوية: ${esc(company.membership_id)}` : ''}
    ${company.phone ? ` | هاتف: ${esc(company.phone)}` : ''}
    ${company.tax_number ? ` | ضريبة: ${esc(company.tax_number)}` : ''}
    <br/>
    ${[company.email, company.email_alt].filter(Boolean).map(esc).join(' / ')}
  </div>
</body>
</html>`;

  const win = window.open('', '_blank');
  if (!win) {
    alert('تعذر فتح نافذة الطباعة. اسمح بالنوافذ المنبثقة ثم أعد المحاولة.');
    return;
  }
  win.document.open();
  win.document.write(html);
  win.document.close();
}
