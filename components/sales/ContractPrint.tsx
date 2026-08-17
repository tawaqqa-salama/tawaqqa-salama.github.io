'use client';

import { formatCurrency, formatDate } from '@/lib/format/currency';
import { amountToArabicWords } from '@/lib/format/arabic-amount';
import {
  CONTRACT_GENERAL_TERMS,
  CONTRACT_PREAMBLE,
  buildDurationClause,
} from '@/lib/constants/contract-terms';
import {
  DEFAULT_COMPANY_PROFILE,
  loadCompanyProfile,
  type CompanyProfile,
} from '@/lib/company-profile';
import type { SalesContract } from '@/lib/types/sales';
import type { ClientRecord } from '@/lib/types/client';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function nl2br(value: string): string {
  return escapeHtml(value).replace(/\n/g, '<br/>');
}

/** يتجاهل القيم الفارغة والشرطات والنقطتين الشائعتين في العقود القديمة */
function coalesceText(...values: Array<string | null | undefined>): string {
  for (const value of values) {
    if (value == null) continue;
    const trimmed = String(value).trim();
    if (!trimmed) continue;
    if (/^[\-–—:٫،.\s]+$/.test(trimmed)) continue;
    return trimmed;
  }
  return '';
}

function displayOrDash(...values: Array<string | null | undefined>): string {
  return coalesceText(...values) || '—';
}

function stripLeadingNumber(line: string): string {
  return line
    .replace(/^(?:[\d\u0660-\u0669]+)[\.\-\)\u060C:]?\s+/u, '')
    .replace(/^(?:[\d\u0660-\u0669]+)\s+/u, '')
    .trim();
}

function scopeItems(contract: SalesContract): string[] {
  const raw = (contract.service_scope || '').trim();
  if (!raw) return ['خدمات استشارية وفق عرض السعر المرتبط'];
  return raw
    .split(/\n+/)
    .map((line) => stripLeadingNumber(line))
    .filter(Boolean);
}

export function buildContractPrintHtml(
  contract: SalesContract,
  client: ClientRecord,
  company: CompanyProfile = DEFAULT_COMPANY_PROFILE
): string {
  const companyAddress = coalesceText(
    [company.address, company.city].filter(Boolean).join(' — '),
    company.address,
    company.city
  );

  const party1Name = coalesceText(contract.party1_name, company.legal_name, company.name) || company.name;
  const party1Cr = coalesceText(contract.party1_cr, company.commercial_register);
  const party1Tax = coalesceText(contract.party1_tax, company.tax_number);
  const party1Phone = coalesceText(contract.party1_phone, company.phone);
  const party1Address = coalesceText(contract.party1_address, companyAddress);
  const license = coalesceText(contract.party1_license, company.membership_id);

  const party2Name =
    coalesceText(contract.party2_name, client.business_name, client.name) || client.name;
  const party2Cr = coalesceText(contract.party2_cr, client.commercial_register);
  const party2Phone = coalesceText(contract.party2_phone, client.phone);
  const party2Address = coalesceText(
    contract.party2_address,
    [client.street, client.district, client.city, client.region, client.national_address]
      .filter(Boolean)
      .join(' — ')
  );

  const bankName = coalesceText(contract.bank_name, company.bank_name);
  const bankAccount = coalesceText(contract.bank_account, company.bank_account);
  const iban = coalesceText(contract.iban, company.iban);

  const amount = Number(contract.amount || 0);
  const vat = Number(contract.vat_amount || 0);
  const total = Number(contract.total_amount || 0);
  const words = coalesceText(contract.amount_words, amountToArabicWords(total)) || amountToArabicWords(total);
  const durationText =
    coalesceText(contract.duration_text, buildDurationClause(contract.duration_days || 30)) ||
    buildDurationClause(30);
  const preamble = coalesceText(contract.preamble, CONTRACT_PREAMBLE) || CONTRACT_PREAMBLE;

  const logo = company.logo_url
    ? `<img class="logo" src="${company.logo_url}" alt="شعار" />`
    : `<div class="logo-fallback">${escapeHtml(company.name)}</div>`;
  const stamp = company.stamp_url
    ? `<img class="stamp" src="${company.stamp_url}" alt="ختم" />`
    : `<div class="stamp-box">${escapeHtml(coalesceText(company.stamp_text, company.name) || company.name)}</div>`;

  // ترقيم تلقائي فقط عبر <ol>/<li> — بدون أرقام يدوية مدمجة
  const scopeHtml = scopeItems(contract)
    .map((item) => `<li>${escapeHtml(item)}</li>`)
    .join('');

  const termsHtml = CONTRACT_GENERAL_TERMS.map((term) => `<li>${escapeHtml(term)}</li>`).join('');

  const paymentFirst = coalesceText(contract.payment_first, company.payment_first);
  const paymentSecond = coalesceText(contract.payment_second, company.payment_second);
  const paymentFinal = coalesceText(contract.payment_final, company.payment_final);
  const paymentTerms = coalesceText(contract.payment_terms, company.payment_terms);
  const paymentItems = [paymentFirst, paymentSecond, paymentFinal]
    .filter(Boolean)
    .map((item) => `<li>${escapeHtml(stripLeadingNumber(item!))}</li>`)
    .join('');

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <title>عقد اتفاق — ${escapeHtml(contract.contract_number)}</title>
  <style>
    @page { size: A4 portrait; margin: 10mm; }
    * { box-sizing: border-box; }
    html, body {
      margin: 0; padding: 0; background: #fff; color: #111827;
      font-family: "Tahoma", "Segoe UI", Arial, sans-serif;
      font-size: 9.2px; line-height: 1.28;
      -webkit-print-color-adjust: exact; print-color-adjust: exact;
    }
    header, footer { display: none !important; }
    .sheet { width: 100%; max-width: 190mm; margin: 0 auto; }
    .header {
      display: grid; grid-template-columns: 58px 1fr 72px; gap: 6px;
      align-items: center; border-bottom: 2px solid #635bdb;
      padding-bottom: 4px; margin-bottom: 5px;
    }
    .logo, .logo-fallback { width: 50px; height: 50px; object-fit: contain; }
    .logo-fallback {
      border: 1px solid #cbd5e1; border-radius: 6px; display: flex; align-items: center;
      justify-content: center; text-align: center; font-size: 8px; font-weight: 700; color: #635bdb; padding: 3px;
    }
    .head-center { text-align: center; }
    .brand { margin: 0; font-size: 12px; font-weight: 800; color: #635bdb; }
    .doc-title { margin: 2px 0 0; font-size: 17px; font-weight: 900; color: #0f172a; }
    .license { text-align: left; font-size: 8.5px; color: #334155; line-height: 1.35; }
    .meta {
      display: grid; grid-template-columns: 1fr 1fr; gap: 3px 10px;
      background: #f8fafc; border: 1px solid #dbe3ea; border-radius: 6px;
      padding: 4px 7px; margin-bottom: 5px; font-size: 9.2px;
    }
    .section { margin: 0 0 4px; }
    .section h3 {
      margin: 0 0 2px; font-size: 10.5px; color: #635bdb;
      border-right: 3px solid #635bdb; padding-right: 5px; }
    .section p { margin: 0; }
    .party-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 5px; }
    .card {
      border: 1px solid #cbd5e1; border-radius: 6px; padding: 4px 6px; background: #fff;
    }
    .card .t { font-weight: 800; margin-bottom: 2px; color: #0f172a; }
    .card p { margin: 0 0 1px; }
    .muted { color: #64748b; }
    ol.clean {
      margin: 0;
      padding: 0 1.15em 0 0;
      list-style-type: decimal;
      list-style-position: outside;
    }
    ol.clean li { margin: 0 0 1px; padding: 0; }
    ol.terms li { margin: 0 0 2px; }
    .money-table { width: 100%; border-collapse: collapse; margin-top: 2px; }
    .money-table th, .money-table td {
      border: 1px solid #94a3b8; padding: 2.5px 5px; text-align: right;
    }
    .money-table th { background: #635bdb; color: #fff; }
    .money-table .due { background: #e8f5ef; font-weight: 800; }
    .words {
      margin-top: 3px; padding: 3px 6px; border-radius: 6px;
      background: #fffbeb; border: 1px solid #fcd34d; font-weight: 700;
    }
    .bank {
      margin-top: 3px; padding: 4px 6px; border: 1px solid #cbd5e1; border-radius: 6px; background: #f8fafc;
    }
    .bank div { margin: 0 0 1px; }
    .page-two { break-before: page; page-break-before: always; }
    .signs {
      display: grid; grid-template-columns: 1fr 1fr; gap: 14px;
      margin-top: 8px; padding-top: 4px;
      page-break-inside: avoid; break-inside: avoid;
    }
    .sign { text-align: center; min-height: 0; }
    .sign .title { font-weight: 800; margin-bottom: 3px; font-size: 11px; }
    .stamp { width: 58px; height: 58px; object-fit: contain; margin: 0 auto 2px; display: block; }
    .stamp-box {
      width: 58px; height: 58px; margin: 0 auto 2px; border: 1.5px dashed #94a3b8; border-radius: 999px;
      display: flex; align-items: center; justify-content: center; text-align: center;
      font-size: 8px; font-weight: 700; color: #475569; padding: 4px;
    }
    .sign-line {
      margin-top: 16px; border-top: 1px solid #64748b; padding-top: 3px; font-size: 9px; color: #475569;
    }
    @media print {
      @page { size: A4 portrait; margin: 10mm; }
      html, body { margin: 0 !important; padding: 0 !important; }
      header, footer { display: none !important; }
      a[href]::after { content: none !important; }
      .sheet { width: auto; max-width: none; }
    .payment-section { break-inside: avoid; page-break-inside: avoid; }
    .payment-section h3 { break-after: avoid; page-break-after: avoid; }
    .payment-list { break-inside: avoid; page-break-inside: avoid; }
    .page-two { break-before: page; page-break-before: always; }
    .signs { break-inside: avoid; page-break-inside: avoid; }
    }
  </style>
</head>
<body>
  <div class="sheet">
    <div class="header">
      <div>${logo}</div>
      <div class="head-center">
        <p class="brand">${escapeHtml(party1Name)}</p>
        <h1 class="doc-title">عقد اتفاق</h1>
      </div>
      <div class="license">
        <div><strong>ترخيص الدفاع المدني</strong></div>
        <div>${escapeHtml(displayOrDash(license))}</div>
        ${party1Cr ? `<div>س.ت: ${escapeHtml(party1Cr)}</div>` : ''}
        ${party1Tax ? `<div>ضريبي: ${escapeHtml(party1Tax)}</div>` : ''}
      </div>
    </div>

    <div class="meta">
      <div>رقم العقد: <strong>${escapeHtml(contract.contract_number)}</strong></div>
      <div>التاريخ: <strong>${escapeHtml(formatDate(contract.contract_date))}</strong></div>
      <div>عرض السعر المرتبط: <strong>${escapeHtml(displayOrDash(contract.quotation_number))}</strong></div>
      <div>الحالة: <strong>${escapeHtml(contract.status)}</strong></div>
    </div>

    <div class="section">
      <h3>أولاً: أطراف العقد</h3>
      <div class="party-grid">
        <div class="card">
          <div class="t">الطرف الأول</div>
          <p>${escapeHtml(party1Name)}</p>
          <p class="muted">س.ت: ${escapeHtml(displayOrDash(party1Cr))}</p>
          <p class="muted">الرقم الضريبي: ${escapeHtml(displayOrDash(party1Tax))}</p>
          <p class="muted">الجوال: ${escapeHtml(displayOrDash(party1Phone))}</p>
          <p class="muted">العنوان: ${escapeHtml(displayOrDash(party1Address))}</p>
        </div>
        <div class="card">
          <div class="t">الطرف الثاني</div>
          <p>${escapeHtml(party2Name)}</p>
          <p class="muted">س.ت: ${escapeHtml(displayOrDash(party2Cr))}</p>
          <p class="muted">الجوال: ${escapeHtml(displayOrDash(party2Phone))}</p>
          <p class="muted">العنوان: ${escapeHtml(displayOrDash(party2Address))}</p>
          <p class="muted">كود العميل: ${escapeHtml(displayOrDash(client.client_code))}</p>
        </div>
      </div>
    </div>

    <div class="section">
      <h3>ثانياً: التمهيد</h3>
      <p>${nl2br(preamble)}</p>
    </div>

    <div class="section">
      <h3>ثالثاً: نطاق الأعمال</h3>
      <ol class="clean">${scopeHtml}</ol>
    </div>

    <div class="section">
      <h3>رابعاً: المدة الزمنية</h3>
      <p>${escapeHtml(durationText)}</p>
    </div>

    <div class="section">
      <h3>خامساً: القيمة المالية</h3>
      <table class="money-table">
        <thead><tr><th>البيان</th><th>المبلغ</th></tr></thead>
        <tbody>
          <tr><td>المبلغ الأساسي</td><td>${escapeHtml(formatCurrency(amount))}</td></tr>
          <tr><td>ضريبة القيمة المضافة 15%</td><td>${escapeHtml(formatCurrency(vat))}</td></tr>
          <tr class="due"><td>الإجمالي المستحق</td><td>${escapeHtml(formatCurrency(total))}</td></tr>
        </tbody>
      </table>
      <div class="words">التفقيط: ${escapeHtml(words)}</div>
      <div class="bank">
        <div><strong>الحساب البنكي للتحويل:</strong></div>
        <div>البنك: ${escapeHtml(displayOrDash(bankName))}</div>
        <div>رقم الحساب: ${escapeHtml(displayOrDash(bankAccount))}</div>
        <div>IBAN: <span dir="ltr">${escapeHtml(displayOrDash(iban))}</span></div>
        <div>الرقم الضريبي: ${escapeHtml(displayOrDash(party1Tax))}</div>
        <div>السجل التجاري: ${escapeHtml(displayOrDash(party1Cr))}</div>
        <div>الجوال: ${escapeHtml(displayOrDash(party1Phone))}</div>
      </div>
    </div>

    <div class="section payment-section">
      <h3>سادساً: طريقة السداد</h3>
      <p class="muted">نوع البيع: ${escapeHtml(displayOrDash(contract.sales_payment_type, client.sales_payment_type, 'نقدي'))}</p>
      ${paymentItems ? `<ol class="clean payment-list">${paymentItems}</ol>` : '<p class="payment-list">حسب الاتفاق بين الطرفين.</p>'}
      ${paymentTerms ? `<p>${escapeHtml(stripLeadingNumber(paymentTerms))}</p>` : ''}
    </div>

    <div class="page-two">
      <div class="section">
        <h3>سابعاً: الشروط العامة</h3>
        <ol class="clean terms">${termsHtml}</ol>
      </div>

      <div class="signs">
        <div class="sign">
          <div class="title">الطرف الثاني</div>
          <div class="sign-line">التوقيع / الختم</div>
        </div>
        <div class="sign">
          <div class="title">الطرف الأول</div>
          ${stamp}
          <div class="sign-line">التوقيع والختم الرسمي</div>
        </div>
      </div>
    </div>
  </div>
</body>
</html>`;
}

export async function printContract(contract: SalesContract, client: ClientRecord) {
  // دائماً اسحب أحدث إعدادات الشركة وقت الطباعة (وليس نسخة قديمة فارغة من العقد)
  const company = await loadCompanyProfile();
  const html = buildContractPrintHtml(contract, client, company);
  const { openDocumentPreview } = await import('@/lib/print/document-preview');
  openDocumentPreview({
    title: `عقد ${contract.contract_number}`,
    html,
    fileName: contract.contract_number,
  });
}
