import type { CompanyProfile } from '@/lib/company-profile';
import { TECH_REPORT_GENERAL_RECOMMENDATIONS, TECH_REPORT_ITEMS } from '@/lib/constants/technical-report';
import type { ClientRecord } from '@/lib/types/client';
import type { TechnicalReport, TechnicalReportSectionItem } from '@/lib/types/project-reports';
import { getTechnicalReportFacilitySnapshot } from '@/lib/projects/technical-report';
import {
  buildCodeProofCards,
  buildOccupantEgressRows,
  buildZoneSystemNeeds,
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

/** ينظّف الملاحظات من السرد التلقائي المكرر ويحوّلها لنقاط */
function notesToBullets(notes: string | null | undefined): string[] {
  const cleaned = String(notes || '')
    .replace(/<<مدمج-من-المناطق>>[\s\S]*?(?=\n\n<<|$)/g, '')
    .replace(/بالنسبة لبند[\s\S]*?(?=\n\n|$)/g, '')
    .replace(/ملخص أنظمة الإطفاء حسب الأدوار والمناطق[\s\S]*?(?=\n\n|$)/g, '')
    .replace(/يُوصى[\s\S]*?وفق الاشتراطات[\s\S]*?(?=\n|$)/g, '')
    .replace(/مع الالتزام بمتطلبات كود البناء[\s\S]*?(?=\n|$)/g, '')
    .trim();

  if (!cleaned) return [];

  return cleaned
    .split(/\n+/)
    .map((line) => line.replace(/^[\s•\-–—*]+/, '').replace(/^\d+[\)\.\-]\s*/, '').trim())
    .filter((line) => line.length > 0)
    .filter((line) => !/^بالنسبة لبند/.test(line))
    .filter((line) => !/تغطية الرش\/الماء للمناطق/.test(line))
    .filter((line) => !/الأنظمة الخاصة المطلوبة/.test(line));
}

function uniqueBullets(...groups: string[][]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const group of groups) {
    for (const item of group) {
      const key = item.trim();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(key);
    }
  }
  return out;
}

function renderSystemItems(title: string, items: TechnicalReportSectionItem[]) {
  const enabled = items.filter((item) => item.enabled);
  if (!enabled.length) return '';

  const blocks = enabled
    .map((item) => {
      const catalog = TECH_REPORT_ITEMS.find((c) => c.id === item.id);
      const bullets = uniqueBullets(item.selectedOptions, notesToBullets(item.notes));
      const photos = item.photos.map((p) => photoHtml(p.dataUrl, p.caption)).join('');
      const list = bullets.length
        ? `<ul class="opts">${bullets.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>`
        : `<p class="muted">لا توجد مواصفات محددة لهذا البند بعد.</p>`;

      return `
        <div class="item">
          <h4 class="item-title">${esc(catalog?.title || item.id)}</h4>
          ${list}
          ${photos ? `<div class="photos">${photos}</div>` : ''}
        </div>
      `;
    })
    .join('');

  return `<h3 class="section">${esc(title)}</h3>${blocks}`;
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
  const zoneNeeds = buildZoneSystemNeeds(report.floor_uses || []);
  const egressRows = buildOccupantEgressRows(report.floor_uses || []);
  const proofsByKey = report.code_proofs_by_key || {};

  const floors = report.floor_uses || [];
  const floorBlocks = floors
    .map((floor) => {
      const balance = floorAreaBalance(floor);
      const zoneRows = floor.zones
        .map((raw) => {
          const zone = enrichZone(raw, { keepSuppression: true });
          return `<tr>
            <td>${esc(zone.label)}${zone.subtype_label ? `<div class="sub">${esc(zone.subtype_label)}</div>` : ''}</td>
            <td>GROUP ${esc(zone.group_letter)}</td>
            <td>${esc(zone.risk_label)}</td>
            <td>${esc(zone.suppression_label || '—')}</td>
            <td>${esc(zone.area_m2)}${zone.area_m2 ? ' م²' : ''}</td>
          </tr>`;
        })
        .join('');
      return `
        <h4 class="floor-title">${esc(floor.floor_name)} — ${esc(floor.floor_area_m2 || String(zonesAreaSum(floor.zones)))} م² · ${esc(floor.structure)} · ${esc(floor.classification)}</h4>
        <table class="data">
          <thead><tr><th>المنطقة / النوع</th><th>مجموعة الإشغال</th><th>الخطورة</th><th>نظام الإطفاء</th><th>المساحة</th></tr></thead>
          <tbody>${zoneRows || '<tr><td colspan="5">لا مناطق</td></tr>'}</tbody>
        </table>
        <p class="balance ${balance.ok ? 'ok' : 'warn'}">مجموع المناطق: ${balance.zonesSum} م² ${balance.ok ? '(متطابق)' : `(فرق ${balance.diff})`}</p>
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
    .map((card) => {
      const photos = [
        ...(proofsByKey[card.id] || []),
        ...((report.code_proof_photos || []).filter((p) => (p.caption || '').includes(card.id))),
      ];
      const photosBlock = photos.map((p) => photoHtml(p.dataUrl, p.caption || 'صورة مقصوصة من الكود')).join('');
      return `
      <div class="proof">
        <div class="proof-title">${esc(card.title)}</div>
        <div class="proof-sub">${esc(card.subtitle)}</div>
        <table class="data compact">
          ${card.rows
            .map((row) => `<tr><th>${esc(row.label)}</th><td>${esc(row.value)}</td></tr>`)
            .join('')}
        </table>
        <p class="refs">مراجع: ${esc(card.refs.join(' · '))}</p>
        ${photosBlock ? `<div class="photos">${photosBlock}</div>` : ''}
      </div>`;
    })
    .join('');

  const zoneProofPhotos = (report.floor_uses || [])
    .flatMap((floor) =>
      floor.zones
        .filter((z) => z.code_proof_photo?.dataUrl)
        .map((z) => photoHtml(z.code_proof_photo?.dataUrl, `${floor.floor_name} / ${z.label}`))
    )
    .join('');

  const systemsPlanHtml = zoneNeeds.length
    ? `<h3 class="section">توزيع أنظمة الإطفاء حسب الأدوار والمناطق</h3>
       <table class="data">
         <thead><tr><th>#</th><th>الدور</th><th>المنطقة</th><th>النوع</th><th>النظام المطلوب</th><th>المساحة</th></tr></thead>
         <tbody>
           ${zoneNeeds
             .map(
               (n, i) => `<tr>
                 <td>${i + 1}</td>
                 <td>${esc(n.floor_name)}</td>
                 <td>${esc(n.zone_label)}</td>
                 <td>${esc(n.subtype_label || '—')}</td>
                 <td>${esc(n.suppression_label)}</td>
                 <td>${esc(n.area_m2 || '—')}${n.area_m2 ? ' م²' : ''}</td>
               </tr>`
             )
             .join('')}
         </tbody>
       </table>`
    : '';

  const egressTotal = egressRows.reduce((sum, row) => sum + (row.occupants || 0), 0);
  const egressHtml = egressRows.length
    ? `<h3 class="section">حصر الشاغلين ومخارج الهروب</h3>
       <table class="data">
         <thead>
           <tr>
             <th>الدور</th>
             <th>المنطقة / الإشغال</th>
             <th>التصنيف</th>
             <th>المساحة</th>
             <th>عامل الحمل</th>
             <th>الشاغلون</th>
             <th>أبواب مطلوبة</th>
             <th>أبواب موجودة</th>
           </tr>
         </thead>
         <tbody>
           ${egressRows
             .map(
               (row) => `<tr>
                 <td>${esc(row.floor_name)}</td>
                 <td>${esc(row.zone_label)}</td>
                 <td>${esc(row.occupancy_label)}</td>
                 <td>${row.area_m2 ? `${row.area_m2} م²` : '—'}</td>
                 <td>${row.factor != null ? `${row.factor} م²/شخص` : '—'}</td>
                 <td>${row.occupants != null ? row.occupants : '—'}</td>
                 <td>${row.required_exits != null ? row.required_exits : '—'}</td>
                 <td>—</td>
               </tr>`
             )
             .join('')}
         </tbody>
         <tfoot>
           <tr>
             <th colspan="5">إجمالي الشاغلين التقريبي</th>
             <th>${egressTotal}</th>
             <th colspan="2"></th>
           </tr>
         </tfoot>
       </table>
       <p class="muted">عدد الأبواب المطلوبة تقديري وفق حمل الإشغال؛ يُراجع مع مخططات المسارات المعتمدة.</p>`
    : '';

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
    body { font-family: "Tahoma","Segoe UI",Arial,sans-serif; color:#222; line-height:1.55; margin:0 auto; max-width:210mm; }
    .header { display:flex; justify-content:space-between; align-items:flex-start; gap:12px; border-bottom:2px solid #1f4d3a; padding-bottom:10px; margin-bottom:14px; }
    .logo { display:flex; gap:10px; align-items:center; max-width:55%; }
    .logo img { width:54px; height:54px; object-fit:contain; }
    .logo .name { font-weight:700; color:#1f4d3a; font-size:14px; }
    .banner { background:#c0392b; color:#fff; padding:8px 12px; border-radius:4px; font-size:11px; text-align:center; max-width:42%; }
    .meta { display:flex; justify-content:space-between; font-size:12px; margin:8px 0 16px; color:#444; }
    .cover-title { text-align:center; color:#c0392b; font-size:20px; font-weight:800; margin:28px 0 18px; }
    .cover-fields { width:72%; margin:0 auto 24px; font-size:14px; }
    .cover-fields div { margin:8px 0; }
    .signs { display:flex; justify-content:space-between; margin:40px 12% 20px; text-align:center; font-size:13px; }
    .stamp { width:90px; height:90px; border:2px dashed #1f4d3a; border-radius:50%; margin:0 auto 8px; display:flex; align-items:center; justify-content:center; color:#1f4d3a; font-size:10px; text-align:center; padding:8px; }
    h2.chapter { color:#c0392b; text-align:center; margin:18px 0 10px; font-size:16px; }
    h3.section { color:#1f4d3a; margin:14px 0 6px; font-size:13px; border-right:3px solid #1f4d3a; padding-right:8px; }
    h4.floor-title { margin:10px 0 6px; color:#1f4d3a; font-size:12px; }
    table.data { width:100%; border-collapse:collapse; font-size:11px; margin:6px 0 10px; }
    table.data th, table.data td { border:1px solid #999; padding:5px 7px; vertical-align:top; }
    table.data th { background:#eef2f7; }
    table.data.compact th { width:36%; }
    table.data tfoot th, table.data tfoot td { background:#f8fafc; font-weight:700; }
    .item { margin:8px 0 12px; page-break-inside: avoid; }
    .item-title { color:#1f6b45; font-size:12.5px; margin:0 0 2px; font-weight:700; }
    .opts { margin:2px 0 6px; padding-right:18px; font-size:11.5px; }
    .opts li { margin:2px 0; }
    .muted { font-size:11px; color:#64748b; margin:4px 0; }
    .sub { font-size:10px; color:#666; }
    .balance { font-size:10px; margin:0 0 8px; }
    .balance.ok { color:#166534; }
    .balance.warn { color:#92400e; }
    .photos { display:flex; flex-wrap:wrap; gap:8px; margin-top:6px; }
    .photo { width:48%; page-break-inside: avoid; }
    .photo img { width:100%; max-height:200px; object-fit:contain; border:1px solid #ddd; background:#fafafa; }
    .cap { font-size:10px; color:#666; text-align:center; }
    .proof { border:1px solid #cbd5e1; border-radius:6px; margin:8px 0 12px; overflow:hidden; page-break-inside: avoid; }
    .proof-title { background:#1f4d3a; color:#fff; padding:7px 10px; font-size:11.5px; font-weight:700; }
    .proof-sub { background:#f8fafc; color:#334155; padding:5px 10px; font-size:11px; font-weight:600; }
    .refs { padding:4px 10px 8px; font-size:10px; color:#64748b; margin:0; }
    .footer { position:fixed; bottom:0; left:0; right:0; border-top:1px solid #1f4d3a; padding-top:6px; font-size:10px; color:#444; text-align:center; background:#fff; }
    .page { page-break-after: always; padding-bottom:36px; }
    .page:last-child { page-break-after: auto; }
    .toc ol { font-size:13px; line-height:1.9; padding-right:22px; }
    .toc ul { padding-right:18px; list-style:disc; }
    .recs { font-size:12.5px; padding-right:18px; }
    .recs li { margin:6px 0; }
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
  </section>

  <section class="page toc">
    ${headerBlock}
    <h2 class="chapter">جدول المحتويات</h2>
    <ol>
      <li><strong>الباب الأول: عن المنشأة</strong>
        <ul>
          <li>بيانات المنشأة العامة</li>
          <li>مكونات المشروع والحالة الإنشائية</li>
          <li>الأدوار والمناطق</li>
          <li>إثباتات التصنيف من الكود</li>
        </ul>
      </li>
      <li><strong>الباب الثاني: أنظمة السلامة</strong>
        <ul>
          <li>توزيع أنظمة الإطفاء</li>
          <li>مكافحة الحريق (مضخات، ماء، شبكة، أنظمة خاصة...)</li>
          <li>التهوية الميكانيكية</li>
          <li>وسائل الإنذار المبكر</li>
          <li>حصر الشاغلين ومخارج الهروب</li>
        </ul>
      </li>
      <li><strong>التوصيات العامة</strong></li>
    </ol>
  </section>

  <section class="page">
    ${headerBlock}
    <h2 class="chapter">الباب الأول: عن المنشأة</h2>

    <h3 class="section">بيانات المنشأة العامة</h3>
    <table class="data compact">
      <tr><th>اسم المنشأة</th><td>${esc(facility.business_name)}</td></tr>
      <tr><th>النشاط</th><td>${esc(facility.activity_label)}</td></tr>
      <tr><th>المالك / المستثمر</th><td>${esc(facility.owner_name)}</td></tr>
      <tr><th>رخصة البناء</th><td>رقم: ${esc(report.building_permit_number || '—')} — تاريخ: ${esc(report.building_permit_date || '—')}</td></tr>
      <tr><th>الصك</th><td>رقم: ${esc(report.deed_number || '—')} — تاريخ: ${esc(report.deed_date || '—')}</td></tr>
      <tr><th>مساحة الموقع</th><td>${esc(facility.land_area ? facility.land_area + ' م²' : '—')}</td></tr>
      <tr><th>مساحة البناء</th><td>${esc(facility.building_area ? facility.building_area + ' م²' : '—')}</td></tr>
      <tr><th>عدد الأدوار</th><td>${esc(report.floors_description || facility.floors_count || '—')}</td></tr>
      <tr><th>الموقع</th><td>${esc(facility.location_summary)}</td></tr>
      <tr><th>تصنيف المبنى (SBC)</th><td>${esc(report.building_classification || '—')}</td></tr>
      <tr><th>تصنيف الخطورة</th><td>${esc(report.risk_class || '—')}</td></tr>
      <tr><th>حالة المبنى</th><td>${esc(report.building_status || '—')}</td></tr>
    </table>
    ${photoHtml(report.earth_photo?.dataUrl, 'Google Earth')}
    ${photoHtml(report.facade_photo?.dataUrl, 'واجهة المشروع')}

    <h3 class="section">مكونات المشروع والحالة الإنشائية</h3>
    <table class="data">
      <thead>
        <tr>
          <th>#</th><th>المبنى / الدور</th><th>الهيكل الإنشائي</th><th>التصنيف الإنشائي</th><th>المساحة</th>
        </tr>
      </thead>
      <tbody>${componentsRows || '<tr><td colspan="5">لا توجد بيانات</td></tr>'}</tbody>
    </table>

    <h3 class="section">الأدوار والمناطق</h3>
    ${floorBlocks || '<p class="muted">لا توجد أدوار بعد</p>'}
  </section>

  <section class="page">
    ${headerBlock}
    <h2 class="chapter">الباب الأول — إثباتات التصنيف</h2>
    ${proofHtml || '<p class="muted">لا توجد إثباتات بعد</p>'}
    ${zoneProofPhotos ? `<h3 class="section">صور الكود حسب المناطق</h3><div class="photos">${zoneProofPhotos}</div>` : ''}
  </section>

  <section class="page">
    ${headerBlock}
    <h2 class="chapter">الباب الثاني: أنظمة السلامة</h2>
    ${systemsPlanHtml}
    ${renderSystemItems('أنظمة مكافحة الحريق', report.firefighting_items)}
    ${renderSystemItems('أنظمة التهوية الميكانيكية', report.ventilation_items)}
    ${renderSystemItems('وسائل الإنذار المبكر عن الحريق', report.alarm_items)}
    ${egressHtml}
    ${renderSystemItems('اشتراطات مخارج ومسالك الهروب', report.exits_items)}
  </section>

  <section class="page">
    ${headerBlock}
    <h2 class="chapter">التوصيات العامة</h2>
    <ol class="recs">
      ${
        recommendations.length
          ? recommendations.map((r) => `<li>${esc(r.label)}</li>`).join('')
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
