import type { CompanyProfile } from '@/lib/company-profile';
import { TECH_REPORT_GENERAL_RECOMMENDATIONS, TECH_REPORT_ITEMS } from '@/lib/constants/technical-report';
import type { ClientRecord } from '@/lib/types/client';
import type { TechnicalReport, TechnicalReportSectionItem } from '@/lib/types/project-reports';
import { getTechnicalReportFacilitySnapshot } from '@/lib/projects/technical-report';
import { buildOccupantEgressRows, buildZoneSystemNeeds } from '@/lib/projects/sbc-classification';

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

/** ينظّف السرد المكرر ويحوّله لنقاط مختصرة فقط */
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
    .filter((line) => line.length > 0 && line.length <= 140)
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
  const zoneNeeds = buildZoneSystemNeeds(report.floor_uses || []);
  const egressRows = buildOccupantEgressRows(report.floor_uses || []);

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
    ? `<h3 class="section">جدول مسالك الهروب وحصر الشاغلين</h3>
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
       </table>`
    : '';

  const reportTitle = 'تقرير معاينة وتدقيق فني لاشتراطات السلامة والوقاية من الحريق';
  const reportNumber = report.outgoing_number || '—';
  const reportDate = report.report_date || '';

  // فهرس: غلاف(1) · فهرس(2) · الباب الأول(3) · الباب الثاني(4) · التوصيات(5)
  const tocEntries = [
    {
      label: 'الباب الأول: بيانات المنشأة',
      page: 3,
      children: ['جدول بيانات المنشأة العامة', 'جدول مكونات المشروع والحالة الإنشائية'],
    },
    {
      label: 'الباب الثاني: أنظمة السلامة والوقاية',
      page: 4,
      children: [
        'مكافحة الحريق',
        'التهوية الميكانيكية',
        'وسائل الإنذار المبكر',
        'جدول مسالك الهروب وحصر الشاغلين',
      ],
    },
    { label: 'التوصيات العامة', page: 5, children: [] as string[] },
  ];

  const tocHtml = tocEntries
    .map((entry) => {
      const children = entry.children.length
        ? `<ul class="toc-sub">${entry.children.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>`
        : '';
      return `
        <div class="toc-row">
          <span class="toc-label">${esc(entry.label)}</span>
          <span class="toc-dots" aria-hidden="true"></span>
          <span class="toc-page">${entry.page}</span>
        </div>
        ${children}`;
    })
    .join('');

  const headerBlock = `
    <div class="header">
      <div class="logo">
        ${company.logo_url ? `<img src="${company.logo_url}" alt="logo" />` : ''}
        <div class="name">${esc(company.legal_name || company.name)}</div>
      </div>
      <div class="banner">${esc(company.tagline)}</div>
    </div>`;

  const pageMeta = `
    <div class="meta">
      <div>التاريخ: ${esc(reportDate)}</div>
      <div>رقم التقرير: ${esc(reportNumber)}</div>
    </div>`;

  const html = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8" />
  <title>تقرير فني — ${esc(facility.business_name)}</title>
  <style>
    /* مقاس ثابت قاطع — لا يتغير بين الصفحات */
    @page {
      size: A4 portrait;
      margin: 15mm 12mm;
    }

    html, body {
      width: 210mm;
      margin: 0;
      padding: 0;
      background: #fff;
    }

    body {
      font-family: "Tahoma","Segoe UI",Arial,sans-serif;
      color: #222;
      line-height: 1.5;
      max-width: 210mm;
      margin: 0 auto;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    .sheet {
      box-sizing: border-box;
      width: 210mm;
      min-height: 297mm;
      padding: 15mm 12mm;
      margin: 0 auto 12px;
      background: #fff;
      page-break-after: always;
      break-after: page;
    }

    .sheet:last-of-type {
      page-break-after: auto;
      break-after: auto;
    }

    .sheet-cover { display: flex; flex-direction: column; }

    .cover-frame {
      flex: 1;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      align-items: center;
      text-align: center;
      min-height: 255mm;
      padding: 16mm 8mm;
      border: 1.5px solid #1f4d3a;
      box-sizing: border-box;
    }

    .cover-brand {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 12px;
      margin-top: 14mm;
    }

    .cover-brand img {
      width: 112px;
      height: 112px;
      object-fit: contain;
    }

    .cover-brand-fallback {
      width: 112px;
      height: 112px;
      border: 2px solid #1f4d3a;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #1f4d3a;
      font-size: 13px;
      font-weight: 700;
      padding: 10px;
    }

    .cover-office {
      font-size: 15px;
      font-weight: 700;
      color: #1f4d3a;
    }

    .cover-title {
      margin: 0;
      max-width: 165mm;
      color: #c0392b;
      font-size: 26px;
      font-weight: 800;
      line-height: 1.45;
    }

    .cover-meta {
      width: 100%;
      max-width: 145mm;
      margin-bottom: 8mm;
      font-size: 14px;
    }

    .cover-meta .row {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      border-bottom: 1px solid #dbe3ea;
      padding: 8px 4px;
    }

    .cover-meta .label { color: #64748b; font-weight: 600; white-space: nowrap; }
    .cover-meta .value { font-weight: 700; color: #1f2937; text-align: left; }

    .toc-title {
      text-align: center;
      color: #c0392b;
      font-size: 20px;
      font-weight: 800;
      margin: 8px 0 22px;
    }

    .toc-row {
      display: flex;
      align-items: baseline;
      gap: 10px;
      margin: 16px 0 4px;
      font-size: 14px;
    }

    .toc-label { font-weight: 700; color: #1f2937; white-space: nowrap; }
    .toc-dots {
      flex: 1;
      border-bottom: 1px dotted #94a3b8;
      transform: translateY(-4px);
      min-width: 24px;
    }
    .toc-page { font-weight: 800; color: #1f4d3a; min-width: 18px; text-align: center; }
    .toc-sub {
      margin: 0 0 10px;
      padding-right: 22px;
      color: #475569;
      font-size: 12.5px;
      line-height: 1.8;
    }

    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 12px;
      border-bottom: 2px solid #1f4d3a;
      padding-bottom: 8px;
      margin-bottom: 10px;
    }

    .logo { display: flex; gap: 10px; align-items: center; max-width: 55%; }
    .logo img { width: 46px; height: 46px; object-fit: contain; }
    .logo .name { font-weight: 700; color: #1f4d3a; font-size: 12.5px; }
    .banner {
      background: #c0392b;
      color: #fff;
      padding: 7px 10px;
      border-radius: 4px;
      font-size: 10px;
      text-align: center;
      max-width: 42%;
    }

    .meta {
      display: flex;
      justify-content: space-between;
      font-size: 11px;
      margin: 0 0 10px;
      color: #444;
    }

    h2.chapter {
      color: #c0392b;
      text-align: center;
      margin: 6px 0 12px;
      font-size: 16px;
    }

    h3.section {
      color: #1f4d3a;
      margin: 12px 0 6px;
      font-size: 13px;
      border-right: 3px solid #1f4d3a;
      padding-right: 8px;
    }

    table.data {
      width: 100%;
      border-collapse: collapse;
      font-size: 11px;
      margin: 6px 0 12px;
    }

    table.data th,
    table.data td {
      border: 1px solid #999;
      padding: 5px 7px;
      vertical-align: top;
    }

    table.data th { background: #eef2f7; }
    table.data.compact th { width: 36%; }
    table.data tfoot th,
    table.data tfoot td { background: #f8fafc; font-weight: 700; }

    .item {
      margin: 6px 0 10px;
      page-break-inside: avoid;
      break-inside: avoid;
    }

    .item-title {
      color: #1f6b45;
      font-size: 12.5px;
      margin: 0 0 2px;
      font-weight: 700;
    }

    .opts { margin: 2px 0 4px; padding-right: 18px; font-size: 11.5px; }
    .opts li { margin: 2px 0; }
    .muted { font-size: 11px; color: #64748b; margin: 4px 0; }

    .photos { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 4px; }
    .photo { width: 48%; page-break-inside: avoid; break-inside: avoid; }
    .photo img {
      width: 100%;
      max-height: 170px;
      object-fit: contain;
      border: 1px solid #ddd;
      background: #fafafa;
    }
    .cap { font-size: 10px; color: #666; text-align: center; }

    .signs {
      display: flex;
      justify-content: space-between;
      margin: 28px 6% 6px;
      text-align: center;
      font-size: 12px;
    }

    .stamp {
      width: 80px;
      height: 80px;
      border: 2px dashed #1f4d3a;
      border-radius: 50%;
      margin: 0 auto 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #1f4d3a;
      font-size: 10px;
      text-align: center;
      padding: 8px;
    }

    .recs { font-size: 13px; padding-right: 20px; line-height: 1.7; }
    .recs li { margin: 8px 0; }

    .page-foot {
      margin-top: 14px;
      padding-top: 6px;
      border-top: 1px solid #cbd5e1;
      font-size: 10px;
      color: #64748b;
      text-align: center;
    }

    @media print {
      .no-print { display: none !important; }
      html, body {
        width: auto;
        max-width: none;
        margin: 0;
        background: #fff;
      }
      .sheet {
        width: auto;
        min-height: auto;
        margin: 0;
        padding: 0;
        box-shadow: none;
        page-break-after: always;
        break-after: page;
      }
      .sheet:last-of-type {
        page-break-after: auto;
        break-after: auto;
      }
      .cover-frame { min-height: calc(297mm - 30mm); }
    }

    @media screen {
      body { background: #e5e7eb; padding: 16px 0 32px; }
      .sheet { box-shadow: 0 8px 24px rgba(0,0,0,.12); }
    }
  </style>
</head>
<body>
  <div class="no-print" style="margin-bottom:12px;text-align:center">
    <button onclick="window.print()" style="padding:8px 16px;font-size:14px">طباعة / حفظ PDF (A4 عمودي)</button>
    <div style="margin-top:6px;font-size:12px;color:#475569">1 غلاف · 2 فهرس · 3 الباب الأول · 4 الباب الثاني · 5 التوصيات</div>
  </div>

  <!-- الصفحة 1: الغلاف -->
  <section class="sheet sheet-cover">
    <div class="cover-frame">
      <div class="cover-brand">
        ${
          company.logo_url
            ? `<img src="${company.logo_url}" alt="شعار المكتب" />`
            : `<div class="cover-brand-fallback">${esc(company.stamp_text || company.name || 'الشعار')}</div>`
        }
        <div class="cover-office">${esc(company.legal_name || company.name)}</div>
      </div>
      <h1 class="cover-title">${esc(reportTitle)}</h1>
      <div class="cover-meta">
        <div class="row"><span class="label">اسم المشروع</span><span class="value">${esc(facility.business_name)}</span></div>
        <div class="row"><span class="label">التاريخ</span><span class="value">${esc(reportDate || '—')}</span></div>
        <div class="row"><span class="label">رقم التقرير</span><span class="value">${esc(reportNumber)}</span></div>
      </div>
    </div>
  </section>

  <!-- الصفحة 2: الفهرس -->
  <section class="sheet">
    ${headerBlock}
    ${pageMeta}
    <h2 class="toc-title">جدول المحتويات</h2>
    ${tocHtml}
  </section>

  <!-- الصفحة 3: الباب الأول -->
  <section class="sheet">
    ${headerBlock}
    ${pageMeta}
    <h2 class="chapter">الباب الأول: بيانات المنشأة</h2>

    <h3 class="section">جدول بيانات المنشأة العامة</h3>
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

    <h3 class="section">جدول مكونات المشروع والحالة الإنشائية</h3>
    <table class="data">
      <thead>
        <tr>
          <th>#</th>
          <th>المبنى / الدور</th>
          <th>الهيكل الإنشائي</th>
          <th>التصنيف الإنشائي</th>
          <th>المساحة</th>
        </tr>
      </thead>
      <tbody>${componentsRows || '<tr><td colspan="5">لا توجد بيانات</td></tr>'}</tbody>
    </table>
    <div class="page-foot">${esc(company.legal_name || company.name)}</div>
  </section>

  <!-- الصفحة 4: الباب الثاني -->
  <section class="sheet">
    ${headerBlock}
    ${pageMeta}
    <h2 class="chapter">الباب الثاني: أنظمة السلامة والوقاية</h2>
    ${systemsPlanHtml}
    ${renderSystemItems('أنظمة مكافحة الحريق', report.firefighting_items)}
    ${renderSystemItems('أنظمة التهوية الميكانيكية', report.ventilation_items)}
    ${renderSystemItems('وسائل الإنذار المبكر عن الحريق', report.alarm_items)}
    ${egressHtml}
    ${renderSystemItems('اشتراطات مخارج ومسالك الهروب', report.exits_items)}
    <div class="page-foot">${esc(company.legal_name || company.name)}</div>
  </section>

  <!-- الصفحة 5: التوصيات -->
  <section class="sheet">
    ${headerBlock}
    ${pageMeta}
    <h2 class="chapter">التوصيات العامة</h2>
    <ol class="recs">
      ${
        recommendations.length
          ? recommendations.map((r) => `<li>${esc(r.label)}</li>`).join('')
          : '<li>لم يتم اختيار توصيات بعد</li>'
      }
    </ol>
    <div class="signs">
      <div>
        <div>مهندس السلامة</div>
        <div style="margin-top:36px">${esc(report.safety_engineer_name || '................')}</div>
      </div>
      <div><div class="stamp">${esc(company.stamp_text || company.name)}</div></div>
      <div>
        <div>المدير التنفيذي</div>
        <div style="margin-top:36px">${esc(report.executive_director_name || '................')}</div>
      </div>
    </div>
    <div class="page-foot">
      ${esc(company.address)}${company.city ? ` — ${esc(company.city)}` : ''}
      ${company.phone ? ` | هاتف: ${esc(company.phone)}` : ''}
    </div>
  </section>
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
