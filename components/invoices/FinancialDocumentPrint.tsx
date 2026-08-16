'use client';

import { amountToArabicWords } from '@/lib/format/arabic-amount';
import { formatCurrency } from '@/lib/format/currency';
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

function formatValidityDate(iso: string, days: number): string {
  const date = new Date(iso || Date.now());
  if (Number.isNaN(date.getTime())) return '';
  date.setDate(date.getDate() + days);
  return date.toLocaleDateString('en-GB');
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
      const price = index === 0 ? escapeHtml(formatCurrency(document.subtotal)) : 'مشمول';
      return `<tr>
        <td class="service-name">${escapeHtml(label)}</td>
        <td>${escapeHtml(SERVICE_SCOPE[id] || 'مشمول ضمن نطاق الأعمال المعتمد.')}</td>
        <td class="qty">${escapeHtml(quantity)}</td>
        <td class="price">${price}</td>
      </tr>`;
    })
    .join('');
}

function buildPaymentItems(company: CompanyProfile): string[] {
  const configured = [company.payment_first, company.payment_second, company.payment_final].filter(
    (item): item is string => Boolean(item && item.trim())
  );
  return configured.length ? configured : [
    'الدفعة الأولى عند اعتماد عرض السعر.',
    'الدفعة الثانية عند تسليم الدراسة والمخططات الأولية.',
    'الدفعة النهائية عند الاعتماد النهائي وتسليم الأعمال.',
  ];
}

function optionalLine(label: string, value: string | null | undefined, className = ''): string {
  return value?.trim()
    ? `<div class="compact-line ${className}"><strong>${escapeHtml(label)}:</strong> ${escapeHtml(value.trim())}</div>`
    : '';
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
    : '<div class="logo-fallback" aria-label="اسم الشركة">' + escapeHtml(companyName.slice(0, 2)) + '</div>';
  const paymentItems = buildPaymentItems(company);
  const generalTerms = document.generalTerms?.length
    ? document.generalTerms
    : [
        'العرض يشمل الخدمات المحددة أعلاه فقط.',
        'أي أعمال إضافية خارج نطاق العرض يتم تسعيرها بشكل مستقل.',
        'يبدأ التنفيذ بعد اعتماد العرض واستلام الدفعة المتفق عليها.',
        'الرسوم الحكومية ورسوم الجهات الخارجية غير مشمولة ما لم يذكر خلاف ذلك.',
        'التنفيذ وفق الأنظمة والاشتراطات المعمول بها لدى الجهات ذات العلاقة.',
      ];
  const location = [document.region, document.city, document.district, document.street]
    .filter(Boolean)
    .join(' — ');
  const companyContacts = [
    optionalLine('الجوال', company.phone),
    optionalLine('البريد', company.email || company.email_alt),
    optionalLine('الرقم الضريبي', company.tax_number),
    optionalLine('السجل التجاري', company.commercial_register),
  ].filter(Boolean).join('');
  const bankDetails = [
    optionalLine('البنك', company.bank_name),
    optionalLine('اسم المستفيد', company.legal_name || company.name),
    optionalLine('IBAN', company.iban, 'ltr'),
    optionalLine('رقم الحساب', company.bank_account, 'ltr'),
    optionalLine('الرقم الضريبي', company.tax_number, 'ltr'),
  ].filter(Boolean).join('');

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)} - ${escapeHtml(document.documentNumber)}</title>
  <style>
    ${getEmbeddedArabicFontCss()}
    @page { size: A4 portrait; margin: 5mm; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: #fff; color: #172033; }
    body { font-family: 'Noto Naskh Arabic', Tahoma, Arial, sans-serif; font-size: 8.8px; line-height: 1.18; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .sheet { width: 194mm; max-width: 100%; min-height: 0; margin: 0 auto; }
    .header { display: flex; align-items: center; justify-content: space-between; gap: 7mm; border-bottom: 1.5px solid #1c6b63; padding-bottom: 3mm; margin-bottom: 3mm; }
    .brand { display: flex; align-items: center; gap: 3mm; min-width: 0; }
    .logo, .logo-fallback { width: 18mm; height: 18mm; flex: 0 0 18mm; object-fit: contain; }
    .logo-fallback { display: grid; place-items: center; border: 1px solid #b9d5cf; background: #f1f8f6; color: #1c6b63; font-size: 15px; font-weight: 900; line-height: 1; }
    .brand-name { margin: 0; color: #1c6b63; font-size: 15px; font-weight: 900; line-height: 1.15; }
    .tagline { margin: 1mm 0 0; color: #61727a; font-size: 8.4px; }
    .doc-heading { text-align: left; flex: 0 0 auto; }
    .doc-title { margin: 0; color: #172033; font-size: 21px; line-height: 1; font-weight: 900; }
    .doc-en { margin: 1mm 0 0; color: #1c6b63; font-size: 8px; letter-spacing: .12em; direction: ltr; }
    .company-meta { min-width: 42mm; color: #394b53; font-size: 8.4px; line-height: 1.45; text-align: left; direction: rtl; }
    .compact-line { margin: 0 0 .8mm; }
    .compact-line strong { color: #172033; }
    .compact-line.ltr { direction: ltr; text-align: right; }
    .metadata { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1.4mm; margin-bottom: 2.5mm; }
    .meta-item { border: 1px solid #d6e1df; background: #f5faf8; padding: 1.4mm 2mm; min-height: 10mm; }
    .meta-label { display: block; color: #63737a; font-size: 7.8px; }
    .meta-value { display: block; margin-top: .5mm; color: #172033; font-size: 9.5px; font-weight: 800; }
    .client-box { border: 1px solid #d6e1df; background: #fbfdfc; padding: 2mm 2.5mm; margin-bottom: 2.5mm; }
    .salutation { margin: 0 0 1mm; font-weight: 800; }
    .intro-line { margin: 0 0 1.5mm; }
    .client-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1.5mm; border-top: 1px solid #e2ebe9; padding-top: 1.3mm; }
    .client-grid strong { display: block; color: #63737a; font-size: 7.8px; }
    .client-grid span { display: block; margin-top: .4mm; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .section-title { margin: 2.5mm 0 1.2mm; padding-right: 2mm; border-right: 2px solid #1c6b63; color: #1c6b63; font-size: 11px; font-weight: 900; }
    table.services { width: 100%; border-collapse: collapse; table-layout: fixed; margin: 0 0 2.5mm; }
    table.services th, table.services td { border: 1px solid #b8c9c6; padding: 1.25mm 1.5mm; vertical-align: top; text-align: right; word-break: normal; }
    table.services th { background: #1c6b63; color: #fff; font-size: 8.8px; font-weight: 800; }
    table.services td { font-size: 8.5px; }
    table.services th:nth-child(1) { width: 31mm; }
    table.services th:nth-child(2) { width: auto; }
    table.services th:nth-child(3) { width: 20mm; text-align: center; }
    table.services th:nth-child(4) { width: 29mm; }
    .service-name { font-weight: 800; }
    .qty { text-align: center !important; white-space: nowrap; }
    .price { text-align: left !important; direction: ltr; font-weight: 800; white-space: nowrap; }
    .totals-wrap { display: grid; grid-template-columns: 1fr 70mm; gap: 3mm; align-items: stretch; margin-bottom: 2.5mm; }
    .words { display: flex; align-items: center; border: 1px solid #d6e1df; background: #f8fbfa; padding: 2mm 2.5mm; font-weight: 700; }
    .words strong { color: #1c6b63; margin-left: 1mm; }
    .totals { border: 1px solid #b8c9c6; }
    .total-row { display: flex; justify-content: space-between; gap: 3mm; padding: 1.35mm 2.2mm; border-bottom: 1px solid #d6e1df; }
    .total-row:last-child { border-bottom: 0; }
    .total-row.final { background: #1c6b63; color: #fff; font-size: 11px; font-weight: 900; }
    .total-number { direction: ltr; white-space: nowrap; font-weight: 800; }
    .bottom-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 3mm; margin-top: 2.5mm; align-items: start; }
    .bottom-col { display: grid; gap: 2mm; align-content: start; }
    .panel { border: 1px solid #d6e1df; padding: 2mm 2.5mm; break-inside: avoid; page-break-inside: avoid; }
    .panel h3 { margin: 0 0 1.2mm; color: #1c6b63; font-size: 9.8px; font-weight: 900; border-bottom: 1px solid #d6e1df; padding-bottom: .8mm; }
    .panel ul, .terms { margin: 0; padding: 0 4mm 0 0; }
    .panel li, .terms li { margin: 0 0 .65mm; }
    .terms-panel { margin-top: 0; }
    .terms { columns: 2; column-gap: 8mm; font-size: 7.8px; line-height: 1.12; }
    .terms li { break-inside: avoid; margin-bottom: .3mm; }
    .approval-panel { padding-bottom: 1.5mm; }
    .approval { display: grid; grid-template-columns: 1fr 1fr; gap: 4mm; margin-top: 1mm; break-inside: avoid; page-break-inside: avoid; }
    .approval-box { min-height: 7mm; text-align: center; border-top: 1px solid #8aa29d; padding-top: .35mm; }
    .approval-box h3 { display: inline; margin: 0 2mm 0 0; color: #172033; font-size: 8px; }
    .approval-line { display: inline-block; width: 43%; margin: .3mm 0 0 1mm; border-bottom: 1px solid #8aa29d; padding-bottom: .1mm; color: #63737a; font-size: 6.8px; }
    .footer { margin-top: .7mm; padding-top: .4mm; border-top: 1px solid #d6e1df; color: #69797e; font-size: 6.5px; text-align: center; }
    @media (max-width: 760px) {
      .sheet { width: 100%; padding: 4mm; }
      .header, .metadata, .client-grid, .totals-wrap, .bottom-grid, .approval { grid-template-columns: 1fr; }
      .header { align-items: flex-start; flex-wrap: wrap; }
      .doc-heading, .company-meta { text-align: right; }
      .terms { columns: 1; }
      table.services { min-width: 0; }
    }
    @media print {
      html, body { width: auto; height: auto; overflow: visible; }
      body { font-size: 8.5px; line-height: 1.14; }
      .sheet { width: auto; max-width: none; }
      .no-print, button, .close, nav, header, footer { display: none !important; }
      .print-header { display: flex !important; }
      .metadata { grid-template-columns: repeat(4, 1fr) !important; }
      .client-grid { grid-template-columns: repeat(4, 1fr) !important; }
      .totals-wrap { grid-template-columns: 1fr 70mm !important; }
      .bottom-grid { grid-template-columns: 1fr 1fr !important; }
      .terms { columns: 2 !important; }
      a[href]::after { content: none !important; }
      .client-box, .metadata, .totals-wrap, .bottom-grid, .terms-panel, .approval, table.services { break-inside: avoid; page-break-inside: avoid; }
    }
  </style>
</head>
<body>
  <main class="sheet">
    <header class="header print-header">
      <div class="brand">
        ${logo}
        <div>
          <p class="brand-name">${escapeHtml(companyName)}</p>
          <p class="tagline">${escapeHtml(company.tagline || companyName)}</p>
        </div>
      </div>
      <div class="doc-heading">
        <h1 class="doc-title">${escapeHtml(title)}</h1>
        <p class="doc-en">${isQuotation ? 'QUOTATION' : 'TAX INVOICE'}</p>
      </div>
      <div class="company-meta">${companyContacts}</div>
    </header>

    <section class="metadata" aria-label="بيانات العرض">
      <div class="meta-item"><span class="meta-label">رقم العرض</span><span class="meta-value">${escapeHtml(document.documentNumber)}</span></div>
      <div class="meta-item"><span class="meta-label">التاريخ</span><span class="meta-value">${escapeHtml(new Date(document.createdAt || Date.now()).toLocaleDateString('en-GB'))}</span></div>
      <div class="meta-item"><span class="meta-label">صلاحية العرض</span><span class="meta-value">${validityDays} يوم · حتى ${escapeHtml(formatValidityDate(document.createdAt, validityDays))}</span></div>
      <div class="meta-item"><span class="meta-label">كود العميل</span><span class="meta-value">${escapeHtml(document.clientCode || '—')}</span></div>
    </section>

    <section class="client-box">
      <p class="salutation">السادة/ ${escapeHtml(clientLabel)} المحترمين،</p>
      <p class="intro-line">تحية طيبة وبعد، يسرنا أن نقدم لكم عرض السعر الخاص بالخدمات الهندسية والاستشارية الموضحة أدناه، وفق نطاق الأعمال والأسعار والشروط المبينة في هذا العرض.</p>
      <div class="client-grid">
        <div><strong>اسم العميل</strong><span>${escapeHtml(clientLabel)}</span></div>
        <div><strong>الجوال</strong><span>${escapeHtml(document.phone || '—')}</span></div>
        <div><strong>المشروع / النشاط</strong><span>${escapeHtml(document.projectName || document.activityTypeLabel || '—')}</span></div>
        <div><strong>الموقع</strong><span>${escapeHtml(location || '—')}</span></div>
      </div>
    </section>

    <h2 class="section-title">الخدمات ونطاق العمل</h2>
    <table class="services">
      <thead><tr><th>الخدمة</th><th>نطاق العمل</th><th>الكمية</th><th>السعر</th></tr></thead>
      <tbody>${buildServiceRows(document)}</tbody>
    </table>

    <div class="totals-wrap">
      <div class="words"><strong>المبلغ كتابة:</strong> ${escapeHtml(words)} ريال سعودي فقط لا غير.</div>
      <div class="totals">
        <div class="total-row"><span>الإجمالي قبل الضريبة</span><span class="total-number">${escapeHtml(formatCurrency(document.subtotal))}</span></div>
        <div class="total-row"><span>ضريبة القيمة المضافة 15%</span><span class="total-number">${escapeHtml(formatCurrency(document.vatAmount))}</span></div>
        <div class="total-row final"><span>الإجمالي شامل الضريبة</span><span class="total-number">${escapeHtml(formatCurrency(document.totalAmount))}</span></div>
      </div>
    </div>

    <div class="bottom-grid">
      <div class="bottom-col">
        <section class="panel">
          <h3>شروط وآلية السداد</h3>
          <ul>${paymentItems.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
          ${company.payment_terms ? `<p>${escapeHtml(company.payment_terms)}</p>` : ''}
        </section>
        <section class="panel terms-panel">
          <h3>الشروط العامة</h3>
          <ol class="terms">${generalTerms.map((term) => `<li>${escapeHtml(term)}</li>`).join('')}</ol>
        </section>
      </div>
      <div class="bottom-col">
        <section class="panel">
          <h3>البيانات البنكية</h3>
          ${bankDetails || '<p>لا توجد بيانات بنكية محفوظة.</p>'}
        </section>
        <section class="panel approval-panel">
          <h3>الاعتمادات</h3>
          <div class="approval">
            <div class="approval-box"><h3>اعتماد العميل</h3><div class="approval-line">الاسم:</div><div class="approval-line">التوقيع والختم:</div></div>
            <div class="approval-box"><h3>اعتماد الشركة</h3><div class="approval-line">الاسم والصفة:</div><div class="approval-line">التوقيع والختم:</div></div>
          </div>
        </section>
      </div>
    </div>

    <div class="footer">${escapeHtml(companyName)}${company.phone ? ` | ${escapeHtml(company.phone)}` : ''}${company.email ? ` | ${escapeHtml(company.email)}` : ''}</div>
  </main>
</body>
</html>`;
}

export async function printFinancialDocument(document: FinancialDocument) {
  const company = await loadCompanyProfile();
  const html = buildPrintHtml(document, company);
  const { openDocumentPreview } = await import('@/lib/print/document-preview');
  const documentLabel = document.documentType === 'quotation'
    ? `عرض سعر - ${document.documentNumber}`
    : `فاتورة - ${document.documentNumber}`;
  openDocumentPreview({
    title: documentLabel,
    html,
    fileName: documentLabel,
  });
}

export async function exportFinancialDocument(document: FinancialDocument) {
  const company = await loadCompanyProfile();
  const html = buildPrintHtml(document, company);
  const { downloadHtmlDocument } = await import('@/lib/print/document-preview');
  downloadHtmlDocument(html, document.documentNumber);
}
