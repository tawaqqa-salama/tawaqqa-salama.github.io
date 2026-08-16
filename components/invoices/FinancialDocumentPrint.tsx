import { formatCurrency, formatDate } from '@/lib/format/currency';
import { amountToArabicWords } from '@/lib/format/arabic-amount';
import { getQuotationServiceLabel } from '@/lib/constants/quotation-services';
import {
  DEFAULT_COMPANY_PROFILE,
  loadCompanyProfile,
  type CompanyProfile,
} from '@/lib/company-profile';
import { getEmbeddedArabicFontCss } from '@/lib/projects/engineering-report-engine/renderer/embedded-fonts';
import type { FinancialDocument } from '@/lib/types/client';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function addDays(iso: string, days: number): string {
  const date = new Date(iso || Date.now());
  if (Number.isNaN(date.getTime())) return formatDate(new Date().toISOString());
  date.setDate(date.getDate() + days);
  return formatDate(date.toISOString());
}

const SERVICE_SCOPE: Record<string, string> = {
  site_visits: 'زيارات ميدانية ومتابعة نطاق الأعمال حسب العدد المعتمد.',
  firefighting_plans: 'إعداد مخططات أنظمة الإطفاء وفق متطلبات المشروع والجهات ذات العلاقة.',
  alarm_plans: 'إعداد مخططات أنظمة الإنذار والسلامة ذات الصلة.',
  life_safety_plans: 'إعداد مخططات سلامة الأرواح ومسارات الإخلاء.',
  hydraulic_calculations: 'إعداد الحسابات الهيدروليكية والبيانات الفنية اللازمة.',
  technical_study_report: 'إعداد الدراسة والتقرير الفني ضمن نطاق الأعمال المعتمد.',
  bill_of_quantities: 'إعداد جدول الكميات وفق المستندات والمخططات المعتمدة.',
  building_plan_info_report: 'إعداد تقرير معلومات المخطط والبيانات المرتبطة به.',
  study_delivery_report: 'تقرير تسليم الدراسة والمخرجات النهائية المتفق عليها.',
  completion_certificate: 'إعداد شهادة إنهاء الأعمال عند تحقق متطلبات المشروع.',
};

function buildServiceRows(document: FinancialDocument): string {
  const services = Array.isArray(document.quotationServices) ? document.quotationServices : [];
  return services
    .map((id, index) => {
      const label = getQuotationServiceLabel(id);
      const quantity = id === 'site_visits'
        ? `${Math.max(1, Number(document.quotationVisitsCount || 1))} زيارة`
        : '—';
      const price = index === 0 ? escapeHtml(formatCurrency(document.subtotal)) : 'مشمول ضمن إجمالي العرض';
      return `<tr>
        <td class="num">${index + 1}</td>
        <td class="service-name">${escapeHtml(label)}</td>
        <td>${escapeHtml(SERVICE_SCOPE[id] || 'مشمول ضمن نطاق الأعمال المعتمد.')}</td>
        <td class="qty">${escapeHtml(quantity)}</td>
        <td class="price">${price}</td>
      </tr>`;
    })
    .join('');
}

function buildPaymentItems(company: CompanyProfile): string[] {
  const defaults = [
    'الدفعة الأولى: 50% من قيمة العرض عند اعتماد عرض السعر.',
    'الدفعة الثانية: 30% عند تسليم الدراسة والمخططات الأولية.',
    'الدفعة النهائية: 20% عند الاعتماد النهائي وتسليم الأعمال المتفق عليها.',
  ];
  const configured = [company.payment_first, company.payment_second, company.payment_final].filter(
    (item): item is string => Boolean(item && item.trim())
  );
  return configured.length ? configured : defaults;
}

export function buildPrintHtml(
  document: FinancialDocument,
  company: CompanyProfile = DEFAULT_COMPANY_PROFILE
): string {
  const isQuotation = document.documentType === 'quotation';
  const title = isQuotation ? 'عرض سعر' : 'فاتورة ضريبية';
  const companyName = company.legal_name || company.name || 'منصة توقع سلامة';
  const clientLabel = document.businessName || document.clientName || '—';
  const validityDays = Math.max(1, Number(company.quotation_validity_days) || 14);
  const words = amountToArabicWords(document.totalAmount);
  const logo = company.logo_url
    ? `<img class="logo" src="${escapeHtml(company.logo_url)}" alt="شعار الشركة" />`
    : `<div class="logo-fallback">توقع<br />سلامة</div>`;
  const paymentItems = buildPaymentItems(company);
  const generalTerms = document.generalTerms?.length
    ? document.generalTerms
    : [
        'الأسعار الموضحة لا تشمل أي أعمال إضافية خارج نطاق الخدمات المذكورة.',
        'أي أعمال أو زيارات إضافية يتم الاتفاق عليها بعرض مستقل أو أمر تغيير.',
        'يبدأ تنفيذ الأعمال بعد اعتماد عرض السعر واستلام الدفعة المستحقة.',
        'مدة التنفيذ تحدد وفق نطاق المشروع واستلام جميع المستندات والمعلومات المطلوبة من العميل.',
        'الرسوم الحكومية ورسوم الجهات الخارجية غير مشمولة ما لم يُذكر خلاف ذلك صراحة.',
        'يكون الاعتماد النهائي للأعمال وفق الأنظمة والاشتراطات المعمول بها والجهات ذات العلاقة.',
      ];

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <title>${escapeHtml(title)} - ${escapeHtml(document.documentNumber)}</title>
  <style>
    ${getEmbeddedArabicFontCss()}
    @page { size: A4 portrait; margin: 12mm; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: #fff; color: #172033; }
    body { font-family: 'Noto Naskh Arabic', 'Noto Sans Arabic', Tahoma, Arial, sans-serif; font-size: 11px; line-height: 1.55; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .sheet { width: 186mm; max-width: 100%; margin: 0 auto; }
    .header { display: grid; grid-template-columns: 26mm 1fr 64mm; gap: 7mm; align-items: center; border-bottom: 2px solid #1c6b63; padding-bottom: 5mm; margin-bottom: 5mm; }
    .logo, .logo-fallback { width: 23mm; height: 23mm; object-fit: contain; }
    .logo-fallback { display: grid; place-items: center; border: 1px solid #b9d5cf; background: #f1f8f6; color: #1c6b63; font-weight: 800; text-align: center; line-height: 1.1; border-radius: 50%; }
    .brand-name { margin: 0; color: #1c6b63; font-size: 16px; font-weight: 800; line-height: 1.35; }
    .tagline { margin: 2mm 0 0; color: #61727a; font-size: 10px; }
    .doc-title { margin: 2mm 0 0; font-size: 25px; line-height: 1.15; font-weight: 900; color: #172033; }
    .company-meta { font-size: 9px; line-height: 1.65; color: #394b53; }
    .company-meta strong { color: #172033; }
    .section-title { margin: 4mm 0 2mm; padding-right: 3mm; border-right: 3px solid #1c6b63; color: #1c6b63; font-size: 13px; font-weight: 800; }
    .metadata { display: grid; grid-template-columns: repeat(5, 1fr); gap: 2mm; margin-bottom: 4mm; }
    .meta-item { border: 1px solid #d6e1df; background: #f5faf8; padding: 2mm 2.5mm; min-height: 13mm; }
    .meta-label { display: block; color: #63737a; font-size: 9px; }
    .meta-value { display: block; margin-top: 1mm; color: #172033; font-size: 11px; font-weight: 800; }
    .intro { border: 1px solid #d6e1df; background: #fbfdfc; padding: 3mm 4mm; margin-bottom: 4mm; }
    .intro p { margin: 0 0 1.5mm; }
    .intro p:last-child { margin-bottom: 0; }
    .client-summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 2mm; margin-top: 2mm; }
    .client-summary div { padding: 2mm; border-top: 1px solid #e2ebe9; }
    .client-summary strong { display: block; color: #63737a; font-size: 9px; }
    .client-summary span { display: block; margin-top: 1mm; font-weight: 700; }
    table.services { width: 100%; border-collapse: collapse; table-layout: fixed; margin: 2mm 0 4mm; }
    table.services th, table.services td { border: 1px solid #b8c9c6; padding: 2.2mm 2mm; vertical-align: top; text-align: right; word-break: normal; }
    table.services th { background: #1c6b63; color: #fff; font-weight: 800; }
    table.services th.num, table.services td.num { width: 9mm; text-align: center; }
    table.services th:nth-child(2) { width: 32mm; }
    table.services th:nth-child(4) { width: 22mm; }
    table.services th:nth-child(5) { width: 31mm; }
    .service-name { font-weight: 800; }
    .qty { text-align: center !important; white-space: nowrap; }
    .price { text-align: left !important; direction: ltr; font-family: 'Noto Sans Arabic', Tahoma, Arial, sans-serif; font-weight: 800; white-space: nowrap; }
    .totals-wrap { display: grid; grid-template-columns: 1fr 78mm; gap: 5mm; align-items: start; margin-bottom: 4mm; }
    .words { border: 1px solid #d6e1df; background: #f8fbfa; padding: 3mm; font-weight: 700; }
    .words strong { color: #1c6b63; }
    .totals { border: 1px solid #b8c9c6; }
    .total-row { display: flex; justify-content: space-between; gap: 4mm; padding: 2.5mm 3mm; border-bottom: 1px solid #d6e1df; }
    .total-row:last-child { border-bottom: 0; }
    .total-row.final { background: #1c6b63; color: #fff; font-size: 14px; font-weight: 900; }
    .total-number { direction: ltr; white-space: nowrap; font-weight: 800; }
    .two-column { display: grid; grid-template-columns: 1fr 1fr; gap: 5mm; margin-top: 4mm; }
    .panel { border: 1px solid #d6e1df; padding: 3mm; break-inside: avoid; page-break-inside: avoid; }
    .panel h3 { margin: 0 0 2mm; color: #1c6b63; font-size: 12px; font-weight: 800; border-bottom: 1px solid #d6e1df; padding-bottom: 1.5mm; }
    .panel p { margin: 0 0 1.2mm; }
    .panel ul, .terms { margin: 0; padding: 0 5mm 0 0; }
    .panel li, .terms li { margin: 0 0 1mm; }
    .approval { display: grid; grid-template-columns: 1fr 1fr; gap: 14mm; margin-top: 7mm; break-inside: avoid; page-break-inside: avoid; }
    .approval-box { min-height: 35mm; text-align: center; border-top: 1px solid #8aa29d; padding-top: 2mm; }
    .approval-box h3 { margin: 0 0 10mm; color: #172033; font-size: 12px; }
    .approval-line { margin-top: 5mm; border-bottom: 1px solid #8aa29d; padding-bottom: 1mm; color: #63737a; font-size: 10px; }
    .footer { margin-top: 5mm; padding-top: 2mm; border-top: 1px solid #d6e1df; display: flex; justify-content: space-between; gap: 4mm; color: #69797e; font-size: 8.5px; }
    .page-counter::after { content: 'صفحة ' counter(page) ' من ' counter(pages); }
    @media (max-width: 760px) {
      .sheet { width: 100%; padding: 4mm; }
      .header, .metadata, .client-summary, .totals-wrap, .two-column, .approval { grid-template-columns: 1fr; }
      table.services { min-width: 700px; }
      .table-scroll { overflow-x: auto; }
    }
    @media print {
      html, body { width: auto; height: auto; overflow: visible; }
      .sheet { width: auto; max-width: none; }
      .no-print, button, .close, nav, header, footer { display: none !important; }
      a[href]::after { content: none !important; }
      .section-title, .intro, .metadata, .totals-wrap, .two-column, .approval, table.services { break-inside: avoid; page-break-inside: avoid; }
      .footer { display: flex !important; }
    }
  </style>
</head>
<body>
  <main class="sheet">
    <header class="header">
      <div>${logo}</div>
      <div>
        <p class="brand-name">${escapeHtml(companyName)}</p>
        <p class="tagline">خدمات هندسية واستشارية في مجال السلامة والوقاية من الحريق</p>
        <h1 class="doc-title">${escapeHtml(title)}</h1>
      </div>
      <div class="company-meta">
        ${company.commercial_register ? `<div><strong>السجل التجاري:</strong> ${escapeHtml(company.commercial_register)}</div>` : ''}
        ${company.tax_number ? `<div><strong>الرقم الضريبي:</strong> ${escapeHtml(company.tax_number)}</div>` : ''}
        ${company.phone ? `<div><strong>الجوال:</strong> ${escapeHtml(company.phone)}</div>` : ''}
        ${company.email ? `<div><strong>البريد الإلكتروني:</strong> ${escapeHtml(company.email)}</div>` : ''}
        ${company.address ? `<div><strong>العنوان:</strong> ${escapeHtml(company.address)}${company.city ? ` — ${escapeHtml(company.city)}` : ''}</div>` : ''}
      </div>
    </header>

    <section class="metadata" aria-label="بيانات العرض">
      <div class="meta-item"><span class="meta-label">رقم العرض</span><span class="meta-value">${escapeHtml(document.documentNumber)}</span></div>
      <div class="meta-item"><span class="meta-label">التاريخ</span><span class="meta-value">${escapeHtml(formatDate(document.createdAt))}</span></div>
      <div class="meta-item"><span class="meta-label">صلاحية العرض</span><span class="meta-value">${validityDays} يوم</span></div>
      <div class="meta-item"><span class="meta-label">كود العميل</span><span class="meta-value">${escapeHtml(document.clientCode || '—')}</span></div>
      <div class="meta-item"><span class="meta-label">نوع البيع</span><span class="meta-value">${escapeHtml(document.saleType || '—')}</span></div>
    </section>

    <section class="intro">
      <p><strong>السادة/ ${escapeHtml(clientLabel)} المحترمين</strong></p>
      <p>تحية طيبة وبعد،</p>
      <p>يسرنا أن نتقدم لكم بعرض السعر التالي الخاص بالخدمات الهندسية والاستشارية المطلوبة، وذلك وفق نطاق الأعمال والأسعار والشروط الموضحة أدناه.</p>
      <div class="client-summary">
        <div><strong>اسم العميل</strong><span>${escapeHtml(clientLabel)}</span></div>
        <div><strong>رقم الجوال</strong><span>${escapeHtml(document.phone || '—')}</span></div>
        <div><strong>اسم المشروع / النشاط</strong><span>${escapeHtml(document.projectName || document.activityTypeLabel || '—')}</span></div>
        <div><strong>الموقع</strong><span>${escapeHtml([document.region, document.city, document.district, document.street].filter(Boolean).join(' — ') || '—')}</span></div>
      </div>
    </section>

    <h2 class="section-title">نطاق الخدمات والأسعار</h2>
    <div class="table-scroll">
      <table class="services">
        <thead><tr><th class="num">م</th><th>الخدمة</th><th>الوصف / نطاق العمل</th><th>الكمية</th><th>السعر</th></tr></thead>
        <tbody>
          ${buildServiceRows(document)}
        </tbody>
      </table>
    </div>

    <div class="totals-wrap">
      <div class="words"><strong>المبلغ كتابة:</strong> ${escapeHtml(words)}</div>
      <div class="totals">
        <div class="total-row"><span>الإجمالي قبل الضريبة</span><span class="total-number">${escapeHtml(formatCurrency(document.subtotal))}</span></div>
        <div class="total-row"><span>ضريبة القيمة المضافة 15%</span><span class="total-number">${escapeHtml(formatCurrency(document.vatAmount))}</span></div>
        <div class="total-row final"><span>الإجمالي شامل الضريبة</span><span class="total-number">${escapeHtml(formatCurrency(document.totalAmount))}</span></div>
      </div>
    </div>

    <div class="two-column">
      <section class="panel">
        <h3>شروط وآلية السداد</h3>
        <ul>${paymentItems.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
        <p>${escapeHtml(company.payment_terms || 'يتم السداد عن طريق التحويل البنكي إلى الحساب الموضح أدناه، ويُعد هذا العرض ساريًا خلال مدة الصلاحية المحددة أعلاه.')}</p>
      </section>
      <section class="panel">
        <h3>البيانات البنكية والضريبية</h3>
        <p><strong>البنك:</strong> ${escapeHtml(company.bank_name || '—')}</p>
        <p><strong>اسم المستفيد:</strong> ${escapeHtml(company.legal_name || company.name || '—')}</p>
        <p><strong>رقم الحساب:</strong> ${escapeHtml(company.bank_account || '—')}</p>
        <p><strong>IBAN:</strong> <span dir="ltr">${escapeHtml(company.iban || '—')}</span></p>
        <p><strong>الرقم الضريبي:</strong> ${escapeHtml(company.tax_number || '—')}</p>
        <p><strong>السجل التجاري:</strong> ${escapeHtml(company.commercial_register || '—')}</p>
      </section>
    </div>

    <section class="panel" style="margin-top: 4mm;">
      <h3>الشروط والأحكام</h3>
      <ol class="terms">${generalTerms.map((term) => `<li>${escapeHtml(term)}</li>`).join('')}</ol>
    </section>

    <section class="approval">
      <div class="approval-box"><h3>اعتماد العميل</h3><div class="approval-line">الاسم:</div><div class="approval-line">التوقيع والختم:</div><div class="approval-line">التاريخ:</div></div>
      <div class="approval-box"><h3>اعتماد الشركة</h3><div class="approval-line">الاسم والصفة:</div><div class="approval-line">التوقيع والختم الرسمي:</div><div class="approval-line">التاريخ:</div></div>
    </section>

    <div class="footer"><span>هذا العرض صادر إلكترونيًا من ${escapeHtml(companyName)}.</span><span class="page-counter"></span></div>
  </main>
</body>
</html>`;
}

export async function printFinancialDocument(document: FinancialDocument) {
  const company = await loadCompanyProfile();
  const html = buildPrintHtml(document, company);
  const { openDocumentPreview } = await import('@/lib/print/document-preview');
  openDocumentPreview({
    title: document.documentType === 'quotation' ? `عرض سعر ${document.documentNumber}` : `فاتورة ${document.documentNumber}`,
    html,
    fileName: document.documentNumber,
  });
}

export async function exportFinancialDocument(document: FinancialDocument) {
  const company = await loadCompanyProfile();
  const html = buildPrintHtml(document, company);
  const { downloadHtmlDocument } = await import('@/lib/print/document-preview');
  downloadHtmlDocument(html, document.documentNumber);
}
