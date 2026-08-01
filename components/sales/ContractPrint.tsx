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

function scopeItems(contract: SalesContract): string[] {
  const raw = (contract.service_scope || '').trim();
  if (!raw) return ['خدمات استشارية وفق عرض السعر المرتبط'];
  return raw
    .split(/\n+/)
    .map((line) => line.replace(/^\d+\.\s*/, '').trim())
    .filter(Boolean);
}

export function buildContractPrintHtml(
  contract: SalesContract,
  client: ClientRecord,
  company: CompanyProfile = DEFAULT_COMPANY_PROFILE
): string {
  const party1Name = contract.party1_name || company.legal_name || company.name;
  const party2Name = contract.party2_name || client.business_name || client.name;
  const party2Cr = contract.party2_cr || client.commercial_register || '—';
  const party2Phone = contract.party2_phone || client.phone || '—';
  const party2Address =
    contract.party2_address ||
    [client.street, client.district, client.city, client.region, client.national_address]
      .filter(Boolean)
      .join(' — ') ||
    '—';

  const amount = Number(contract.amount || 0);
  const vat = Number(contract.vat_amount || 0);
  const total = Number(contract.total_amount || 0);
  const words = contract.amount_words || amountToArabicWords(total);
  const durationText = contract.duration_text || buildDurationClause(contract.duration_days || 30);
  const preamble = contract.preamble || CONTRACT_PREAMBLE;
  const license = contract.party1_license || company.membership_id || '—';
  const logo = company.logo_url
    ? `<img class="logo" src="${company.logo_url}" alt="شعار" />`
    : `<div class="logo-fallback">${escapeHtml(company.name)}</div>`;
  const stamp = company.stamp_url
    ? `<img class="stamp" src="${company.stamp_url}" alt="ختم" />`
    : `<div class="stamp-box">${escapeHtml(company.stamp_text || company.name)}</div>`;

  const scopeHtml = scopeItems(contract)
    .map((item, index) => `<li><span class="n">${index + 1}</span>${escapeHtml(item)}</li>`)
    .join('');

  const termsHtml = CONTRACT_GENERAL_TERMS.map(
    (term, index) => `<li><strong>${index + 1}.</strong> ${escapeHtml(term)}</li>`
  ).join('');

  const paymentFirst = contract.payment_first || company.payment_first;
  const paymentSecond = contract.payment_second || company.payment_second;
  const paymentFinal = contract.payment_final || company.payment_final;
  const paymentTerms = contract.payment_terms || company.payment_terms;

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <title>عقد اتفاق — ${escapeHtml(contract.contract_number)}</title>
  <style>
    @page { size: A4 portrait; margin: 12mm 12mm 14mm; }
    * { box-sizing: border-box; }
    html, body {
      margin: 0; padding: 0; background: #fff; color: #111827;
      font-family: "Tahoma", "Segoe UI", Arial, sans-serif;
      font-size: 11px; line-height: 1.55;
      -webkit-print-color-adjust: exact; print-color-adjust: exact;
    }
    .sheet { width: 186mm; margin: 0 auto; }
    .header {
      display: grid; grid-template-columns: 70px 1fr 70px; gap: 8px;
      align-items: center; border-bottom: 2.5px solid #1f4d3a;
      padding-bottom: 8px; margin-bottom: 10px;
    }
    .logo, .logo-fallback { width: 64px; height: 64px; object-fit: contain; }
    .logo-fallback {
      border: 1px solid #cbd5e1; border-radius: 8px; display: flex; align-items: center;
      justify-content: center; text-align: center; font-size: 9px; font-weight: 700; color: #1f4d3a; padding: 4px;
    }
    .head-center { text-align: center; }
    .brand { margin: 0; font-size: 15px; font-weight: 800; color: #1f4d3a; }
    .doc-title { margin: 4px 0 0; font-size: 22px; font-weight: 900; color: #0f172a; }
    .license {
      text-align: left; font-size: 9.5px; color: #334155; line-height: 1.45;
    }
    .meta {
      display: grid; grid-template-columns: 1fr 1fr; gap: 6px 12px;
      background: #f8fafc; border: 1px solid #dbe3ea; border-radius: 8px;
      padding: 8px 10px; margin-bottom: 10px; font-size: 11px;
    }
    .section { margin: 0 0 10px; page-break-inside: avoid; }
    .section h3 {
      margin: 0 0 6px; font-size: 12.5px; color: #1f4d3a;
      border-right: 3px solid #1f4d3a; padding-right: 8px;
    }
    .party-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .card {
      border: 1px solid #cbd5e1; border-radius: 8px; padding: 8px 10px; background: #fff;
    }
    .card .t { font-weight: 800; margin-bottom: 4px; color: #0f172a; }
    .card p { margin: 0 0 3px; }
    .muted { color: #64748b; }
    ol.scope, ol.terms { margin: 0; padding: 0 18px 0 0; }
    ol.scope li, ol.terms li { margin: 0 0 4px; }
    ol.scope .n {
      display: inline-block; min-width: 18px; margin-left: 4px; font-weight: 700; color: #1f4d3a;
    }
    .money-table { width: 100%; border-collapse: collapse; margin-top: 4px; }
    .money-table th, .money-table td {
      border: 1px solid #94a3b8; padding: 6px 8px; text-align: right;
    }
    .money-table th { background: #1f4d3a; color: #fff; }
    .money-table .due { background: #e8f5ef; font-weight: 800; }
    .words {
      margin-top: 6px; padding: 7px 10px; border-radius: 8px;
      background: #fffbeb; border: 1px solid #fcd34d; font-weight: 700;
    }
    .bank {
      margin-top: 6px; padding: 8px 10px; border: 1px solid #cbd5e1; border-radius: 8px; background: #f8fafc;
    }
    .signs {
      display: grid; grid-template-columns: 1fr 1fr; gap: 18px;
      margin-top: 16px; page-break-inside: avoid;
    }
    .sign { text-align: center; min-height: 90px; }
    .sign .title { font-weight: 800; margin-bottom: 6px; }
    .stamp { width: 70px; height: 70px; object-fit: contain; margin: 0 auto 4px; display: block; }
    .stamp-box {
      width: 70px; height: 70px; margin: 0 auto 4px; border: 2px dashed #94a3b8; border-radius: 999px;
      display: flex; align-items: center; justify-content: center; text-align: center;
      font-size: 9px; font-weight: 700; color: #475569; padding: 6px;
    }
    .sign-line {
      margin-top: 28px; border-top: 1px solid #64748b; padding-top: 4px; font-size: 10px; color: #475569;
    }
    .page-break { break-before: page; page-break-before: always; }
    @media print {
      a[href]::after { content: none !important; }
      .sheet { width: auto; }
      .section, .signs { break-inside: avoid; page-break-inside: avoid; }
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
        <div>${escapeHtml(license)}</div>
        ${company.commercial_register ? `<div>س.ت: ${escapeHtml(company.commercial_register)}</div>` : ''}
        ${company.tax_number ? `<div>ضريبي: ${escapeHtml(company.tax_number)}</div>` : ''}
      </div>
    </div>

    <div class="meta">
      <div>رقم العقد: <strong>${escapeHtml(contract.contract_number)}</strong></div>
      <div>التاريخ: <strong>${escapeHtml(formatDate(contract.contract_date))}</strong></div>
      <div>عرض السعر المرتبط: <strong>${escapeHtml(contract.quotation_number || '—')}</strong></div>
      <div>الحالة: <strong>${escapeHtml(contract.status)}</strong></div>
    </div>

    <div class="section">
      <h3>أولاً: أطراف العقد</h3>
      <div class="party-grid">
        <div class="card">
          <div class="t">الطرف الأول</div>
          <p>${escapeHtml(party1Name)}</p>
          <p class="muted">س.ت: ${escapeHtml(contract.party1_cr || company.commercial_register || '—')}</p>
          <p class="muted">الرقم الضريبي: ${escapeHtml(contract.party1_tax || company.tax_number || '—')}</p>
          <p class="muted">الجوال: ${escapeHtml(contract.party1_phone || company.phone || '—')}</p>
          <p class="muted">العنوان: ${escapeHtml(contract.party1_address || [company.address, company.city].filter(Boolean).join(' — ') || '—')}</p>
        </div>
        <div class="card">
          <div class="t">الطرف الثاني</div>
          <p>${escapeHtml(party2Name)}</p>
          <p class="muted">س.ت: ${escapeHtml(party2Cr)}</p>
          <p class="muted">الجوال: ${escapeHtml(party2Phone)}</p>
          <p class="muted">العنوان: ${escapeHtml(party2Address)}</p>
          <p class="muted">كود العميل: ${escapeHtml(client.client_code || '—')}</p>
        </div>
      </div>
    </div>

    <div class="section">
      <h3>ثانياً: التمهيد</h3>
      <p>${nl2br(preamble)}</p>
    </div>

    <div class="section">
      <h3>ثالثاً: نطاق الأعمال</h3>
      <ol class="scope">${scopeHtml}</ol>
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
        <div>البنك: ${escapeHtml(contract.bank_name || company.bank_name || '—')}</div>
        <div>رقم الحساب: ${escapeHtml(contract.bank_account || company.bank_account || '—')}</div>
        <div>IBAN: <span dir="ltr">${escapeHtml(contract.iban || company.iban || '—')}</span></div>
        <div>الرقم الضريبي: ${escapeHtml(contract.party1_tax || company.tax_number || '—')}</div>
      </div>
    </div>

    <div class="section">
      <h3>سادساً: طريقة السداد</h3>
      <p class="muted">نوع البيع: ${escapeHtml(contract.sales_payment_type || client.sales_payment_type || 'نقدي')}</p>
      <ol class="scope">
        ${paymentFirst ? `<li>${escapeHtml(paymentFirst)}</li>` : ''}
        ${paymentSecond ? `<li>${escapeHtml(paymentSecond)}</li>` : ''}
        ${paymentFinal ? `<li>${escapeHtml(paymentFinal)}</li>` : ''}
      </ol>
      ${paymentTerms ? `<p>${escapeHtml(paymentTerms)}</p>` : ''}
    </div>

    <div class="section page-break">
      <h3>سابعاً: الشروط العامة</h3>
      <ol class="terms">${termsHtml}</ol>
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
</body>
</html>`;
}

export async function printContract(contract: SalesContract, client: ClientRecord) {
  const company = await loadCompanyProfile();
  const html = buildContractPrintHtml(contract, client, company);
  const w = window.open('', '_blank', 'width=900,height=700');
  if (!w) {
    alert('تعذّر فتح نافذة الطباعة. اسمح بالنوافذ المنبثقة ثم أعد المحاولة.');
    return;
  }
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 300);
}
