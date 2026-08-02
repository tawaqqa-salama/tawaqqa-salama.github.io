import { supabase, isDemoMode } from '@/lib/supabase';
import { loadCompanyProfile } from '@/lib/company-profile';
import { generateSalesDocNumber } from '@/lib/constants/modules';
import { calculateVatAmount } from '@/lib/business/client-workflow';
import { getPreviousInvoiceHash, persistInvoiceHash } from '@/lib/zatca/chain';
import { buildZatcaInvoice } from '@/lib/zatca/engine';
import { loadZatcaSettings } from '@/lib/zatca/settings';
import { submitInvoiceToZatca } from '@/lib/zatca/api-client';
import { getQuotationServiceLabel, normalizeQuotationServices } from '@/lib/constants/quotation-services';
import {
  amountsForPercentage,
  buildDefaultPaymentSchedule,
  resolveContractBaseSubtotal,
  resolveInvoiceType,
} from '@/lib/invoices/payment-schedule';
import type { ClientRecord } from '@/lib/types/client';
import type { SalesContract } from '@/lib/types/sales';
import type {
  GenerateTaxInvoiceRequest,
  GenerateTaxInvoiceResult,
  InvoiceTriggerSource,
  PaymentMilestone,
  TaxInvoice,
  TaxInvoiceLineItem,
  TaxInvoiceType,
} from '@/lib/types/tax-invoice';
import type { ZatcaApiResponse, ZatcaInvoiceKind, ZatcaSubmissionStatus } from '@/lib/zatca/types';

function round2(value: number): number {
  return Math.round(Number(value || 0) * 100) / 100;
}

function splitIssueDateTime(iso?: string | null): { issueDate: string; issueTime: string } {
  const date = iso ? new Date(iso) : new Date();
  const safe = Number.isNaN(date.getTime()) ? new Date() : date;
  return {
    issueDate: safe.toISOString().slice(0, 10),
    issueTime: `${String(safe.getUTCHours()).padStart(2, '0')}:${String(safe.getUTCMinutes()).padStart(2, '0')}:${String(safe.getUTCSeconds()).padStart(2, '0')}`,
  };
}

function toZatcaKind(type: TaxInvoiceType): ZatcaInvoiceKind {
  return type === 'STANDARD' ? 'standard' : 'simplified';
}

async function callServerSubmit(payload: Record<string, unknown>): Promise<ZatcaApiResponse | null> {
  try {
    const response = await fetch('/api/zatca/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (response.status === 404) return null;
    return (await response.json()) as ZatcaApiResponse;
  } catch {
    return null;
  }
}

function buildLineItems(
  client: ClientRecord,
  subtotal: number,
  vatAmount: number,
  milestoneTitle: string
): TaxInvoiceLineItem[] {
  const services = normalizeQuotationServices(client.quotation_services);
  const labels =
    services.length > 0
      ? services.map((id) => {
          const label = getQuotationServiceLabel(id);
          return id === 'site_visits'
            ? `${label} (${Math.max(1, Number(client.quotation_visits_count || 1))} زيارة)`
            : label;
        })
      : ['خدمات استشارات السلامة والوقاية من الحريق'];

  const description = `${milestoneTitle} — ${labels.join('، ')}`;
  return [
    {
      id: '1',
      description,
      quantity: 1,
      unitPrice: subtotal,
      lineSubtotal: subtotal,
      vatAmount,
      lineTotal: round2(subtotal + vatAmount),
    },
  ];
}

export async function listPaymentMilestones(clientId: string): Promise<PaymentMilestone[]> {
  const { data, error } = await supabase
    .from('payment_milestones')
    .select('*')
    .eq('client_id', clientId)
    .order('sort_order', { ascending: true });
  if (error || !data) return [];
  return data as PaymentMilestone[];
}

export async function listTaxInvoices(options?: {
  clientId?: string;
  limit?: number;
}): Promise<TaxInvoice[]> {
  let query = supabase.from('zatca_invoices').select('*').order('created_at', { ascending: false });
  if (options?.clientId) query = query.eq('client_id', options.clientId);
  if (options?.limit) query = query.limit(options.limit);
  const { data, error } = await query;
  if (error || !data) return [];
  return data as TaxInvoice[];
}

export async function ensurePaymentMilestonesForClient(
  client: ClientRecord,
  contract?: SalesContract | null
): Promise<PaymentMilestone[]> {
  const existing = await listPaymentMilestones(client.id);
  if (existing.length > 0) return existing;

  const company = await loadCompanyProfile();
  const schedule = buildDefaultPaymentSchedule(company);
  const base = resolveContractBaseSubtotal(client, contract);
  const rows = schedule.map((item) => {
    const money = amountsForPercentage(base, item.percentage);
    return {
      client_id: client.id,
      contract_id: contract?.id || null,
      title: item.title,
      percentage: item.percentage,
      amount: money.amount,
      vat_amount: money.vatAmount,
      total_amount: money.totalAmount,
      sort_order: item.sort_order,
      status: item.sort_order === 1 ? 'ready' : 'pending',
      is_invoiced: false,
    };
  });

  if (isDemoMode) {
    return rows.map((row, index) => ({
      id: `demo-ms-${client.id}-${index + 1}`,
      created_at: new Date().toISOString(),
      ...row,
      tax_invoice_id: null,
      due_date: null,
      completed_at: null,
    })) as PaymentMilestone[];
  }

  const { data, error } = await supabase.from('payment_milestones').insert(rows).select('*');
  if (error || !data) {
    // جدول غير موجود بعد — أعد مسودات محلية
    return rows.map((row, index) => ({
      id: `local-ms-${client.id}-${index + 1}`,
      created_at: new Date().toISOString(),
      ...row,
      tax_invoice_id: null,
      due_date: null,
      completed_at: null,
    })) as PaymentMilestone[];
  }
  return data as PaymentMilestone[];
}

async function ensureSalesInvoiceDocument(
  client: ClientRecord,
  invoiceNumber: string,
  subtotal: number,
  vatAmount: number,
  totalAmount: number,
  notes: string
) {
  const { data, error } = await supabase
    .from('sales_documents')
    .insert({
      client_id: client.id,
      doc_type: 'invoice',
      doc_number: invoiceNumber,
      subtotal,
      vat_amount: vatAmount,
      total_amount: totalAmount,
      status: 'صادرة',
      archived: true,
      notes,
    })
    .select('id, doc_number')
    .maybeSingle();

  if (error) {
    return { id: null as string | null, docNumber: invoiceNumber };
  }
  return { id: (data?.id as string) || null, docNumber: String(data?.doc_number || invoiceNumber) };
}

async function markMilestoneInvoiced(milestoneId: string, invoiceId: string) {
  if (milestoneId.startsWith('demo-') || milestoneId.startsWith('local-')) return;
  await supabase
    .from('payment_milestones')
    .update({
      is_invoiced: true,
      status: 'invoiced',
      tax_invoice_id: invoiceId,
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', milestoneId);
}

/**
 * إصدار فاتورة ضريبية من دفعة / مرحلة / يدوياً + بناء QR/XML ZATCA.
 */
export async function generateTaxInvoiceFromMilestone(
  request: GenerateTaxInvoiceRequest
): Promise<GenerateTaxInvoiceResult> {
  const messages: string[] = [];
  const { data: clientRow, error: clientError } = await supabase
    .from('clients')
    .select('*')
    .eq('id', request.clientId)
    .maybeSingle();

  if (clientError || !clientRow) {
    return {
      ok: false,
      invoice: null,
      milestone: null,
      messages,
      error: clientError?.message || 'العميل غير موجود',
      promptPreview: false,
    };
  }

  const client = clientRow as ClientRecord;
  let contract: SalesContract | null = null;
  if (request.contractId) {
    const { data } = await supabase.from('sales_contracts').select('*').eq('id', request.contractId).maybeSingle();
    contract = (data as SalesContract) || null;
  } else {
    const { data } = await supabase
      .from('sales_contracts')
      .select('*')
      .eq('client_id', client.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    contract = (data as SalesContract) || null;
  }

  const milestones = await ensurePaymentMilestonesForClient(client, contract);
  let milestone: PaymentMilestone | null = null;

  if (request.milestoneId) {
    milestone = milestones.find((m) => m.id === request.milestoneId) || null;
    if (!milestone) {
      const { data } = await supabase
        .from('payment_milestones')
        .select('*')
        .eq('id', request.milestoneId)
        .maybeSingle();
      milestone = (data as PaymentMilestone) || null;
    }
  } else if (request.percentage != null && Number(request.percentage) > 0) {
    const money = amountsForPercentage(
      resolveContractBaseSubtotal(client, contract),
      Number(request.percentage)
    );
    milestone = {
      id: `adhoc-${Date.now()}`,
      client_id: client.id,
      contract_id: contract?.id || null,
      title: request.title || `فاتورة بنسبة ${request.percentage}%`,
      percentage: Number(request.percentage),
      amount: money.amount,
      vat_amount: money.vatAmount,
      total_amount: money.totalAmount,
      sort_order: 99,
      status: 'ready',
      is_invoiced: false,
    };
  } else {
    milestone = milestones.find((m) => !m.is_invoiced) || milestones[0] || null;
  }

  if (!milestone) {
    return {
      ok: false,
      invoice: null,
      milestone: null,
      messages,
      error: 'لا توجد دفعة مالية قابلة للفوترة',
      promptPreview: false,
    };
  }

  if (milestone.is_invoiced && milestone.tax_invoice_id) {
    const { data: existing } = await supabase
      .from('zatca_invoices')
      .select('*')
      .eq('id', milestone.tax_invoice_id)
      .maybeSingle();
    if (existing) {
      return {
        ok: true,
        invoice: existing as TaxInvoice,
        milestone,
        messages: ['هذه الدفعة مُفوترة مسبقاً — تم فتح الفاتورة الحالية.'],
        error: null,
        promptPreview: true,
      };
    }
  }

  const company = await loadCompanyProfile();
  if (!company.tax_number) {
    return {
      ok: false,
      invoice: null,
      milestone,
      messages,
      error: 'الرقم الضريبي للمنشأة غير معرّف في معلومات الشركة — مطلوب لـ ZATCA.',
      promptPreview: false,
    };
  }

  let invoiceType = resolveInvoiceType(client);
  if (request.forceStandard) invoiceType = 'STANDARD';
  if (request.forceSimplified) invoiceType = 'SIMPLIFIED';

  const settings = await loadZatcaSettings();
  const invoiceKind = toZatcaKind(invoiceType);
  const subtotal = round2(Number(milestone.amount));
  const vatAmount = round2(Number(milestone.vat_amount || calculateVatAmount(subtotal)));
  const totalAmount = round2(Number(milestone.total_amount || subtotal + vatAmount));
  const lineItems = buildLineItems(client, subtotal, vatAmount, milestone.title);
  const invoiceNumber = await generateSalesDocNumber('invoice');
  const previousInvoiceHash = await getPreviousInvoiceHash();
  const { issueDate, issueTime } = splitIssueDateTime();
  const triggerSource: InvoiceTriggerSource = request.triggerSource || 'manual';

  const built = buildZatcaInvoice({
    invoiceNumber,
    issueDate,
    issueTime,
    invoiceKind,
    previousInvoiceHash,
    privateKeyPemOrHex: settings.private_key_pem,
    seller: {
      name: company.legal_name || company.name,
      vatNumber: company.tax_number,
      crNumber: company.commercial_register || '',
      street: company.address || company.city || 'Riyadh',
      city: company.city || 'Riyadh',
      district: company.city || 'Riyadh',
      countryCode: 'SA',
    },
    buyer: {
      name: client.business_name || client.name,
      vatNumber: client.tax_number || undefined,
      street: client.street || client.district || undefined,
      city: client.city || undefined,
      countryCode: 'SA',
    },
    lines: lineItems.map((line) => ({
      id: line.id,
      name: line.description,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      lineExtensionAmount: line.lineSubtotal,
      taxAmount: line.vatAmount,
      taxPercent: 15,
    })),
    lineExtensionAmount: subtotal,
    taxExclusiveAmount: subtotal,
    taxAmount: vatAmount,
    payableAmount: totalAmount,
    currency: 'SAR',
  });

  const doc = await ensureSalesInvoiceDocument(
    client,
    invoiceNumber,
    subtotal,
    vatAmount,
    totalAmount,
    `${milestone.title} — ${triggerSource}`
  );

  let zatcaStatus: ZatcaSubmissionStatus = settings.enabled ? 'pending' : 'disabled';
  let zatcaResponse: unknown = null;

  const shouldSubmit = request.submitToZatca !== false && settings.enabled;
  if (shouldSubmit) {
    const serverResult = await callServerSubmit({
      uuid: built.uuid,
      invoiceHash: built.invoiceHash,
      invoiceXml: built.signedXml,
      invoiceKind,
      settings,
    });
    const apiResult =
      serverResult ||
      (await submitInvoiceToZatca({
        settings,
        invoiceKind,
        uuid: built.uuid,
        invoiceHash: built.invoiceHash,
        invoiceXml: built.signedXml,
      }));
    zatcaStatus = apiResult.status;
    zatcaResponse = apiResult.raw ?? { error: apiResult.error };
    if (apiResult.ok) {
      messages.push(
        invoiceKind === 'standard'
          ? 'تم إرسال الفاتورة إلى ZATCA Clearance.'
          : 'تم إرسال الفاتورة إلى ZATCA Reporting.'
      );
    } else {
      messages.push(`ZATCA: ${apiResult.error || 'فشل الإرسال'} — الحالة: ${apiResult.status}`);
    }
  } else if (!settings.enabled) {
    messages.push('ZATCA غير مفعّل — حُفظت الفاتورة محلياً مع QR Phase 2.');
  }

  await persistInvoiceHash(built.invoiceHash, built.uuid);

  const insertRow: Omit<TaxInvoice, 'id' | 'created_at' | 'updated_at'> = {
    client_id: client.id,
    sales_document_id: doc.id,
    invoice_number: built.invoiceNumber,
    uuid: built.uuid,
    invoice_hash: built.invoiceHash,
    previous_invoice_hash: built.previousInvoiceHash,
    qr_base64: built.qrBase64,
    xml: built.signedXml,
    status: zatcaStatus,
    environment: settings.environment,
    invoice_kind: invoiceKind,
    invoice_type: invoiceType,
    business_status: 'ISSUED',
    subtotal,
    vat_amount: vatAmount,
    total_amount: totalAmount,
    issue_date: issueDate,
    milestone_id: milestone.id.startsWith('adhoc-') || milestone.id.startsWith('demo-') || milestone.id.startsWith('local-')
      ? null
      : milestone.id,
    contract_id: contract?.id || null,
    buyer_name: client.business_name || client.name,
    buyer_cr: client.commercial_register || null,
    buyer_vat: client.tax_number || null,
    line_items: lineItems,
    notes: milestone.title,
    trigger_source: triggerSource,
    zatca_response: zatcaResponse,
  };

  let saved: TaxInvoice | null = null;
  if (isDemoMode) {
    saved = {
      id: `demo-inv-${Date.now()}`,
      created_at: new Date().toISOString(),
      ...insertRow,
    } as TaxInvoice;
  } else {
    const { data, error } = await supabase.from('zatca_invoices').insert(insertRow).select('*').maybeSingle();
    if (error) {
      // أعمدة 021 غير مطبّقة — احفظ الحد الأدنى
      const basic = {
        client_id: insertRow.client_id,
        sales_document_id: insertRow.sales_document_id,
        invoice_number: insertRow.invoice_number,
        uuid: insertRow.uuid,
        invoice_hash: insertRow.invoice_hash,
        previous_invoice_hash: insertRow.previous_invoice_hash,
        qr_base64: insertRow.qr_base64,
        xml: insertRow.xml,
        status: insertRow.status,
        environment: insertRow.environment,
        invoice_kind: insertRow.invoice_kind,
        zatca_response: insertRow.zatca_response,
      };
      const retry = await supabase.from('zatca_invoices').insert(basic).select('*').maybeSingle();
      if (retry.error) {
        return {
          ok: false,
          invoice: null,
          milestone,
          messages,
          error: retry.error.message,
          promptPreview: false,
        };
      }
      saved = {
        ...(retry.data as TaxInvoice),
        ...insertRow,
        id: (retry.data as TaxInvoice).id,
      };
      messages.push('حُفظت الفاتورة. نفّذ SQL 021 لتفعيل حقول المراحل بالكامل.');
    } else {
      saved = data as TaxInvoice;
    }
  }

  if (saved?.id && !milestone.id.startsWith('adhoc-')) {
    await markMilestoneInvoiced(milestone.id, saved.id);
    milestone = {
      ...milestone,
      is_invoiced: true,
      status: 'invoiced',
      tax_invoice_id: saved.id,
    };
  }

  messages.unshift(
    invoiceType === 'STANDARD'
      ? `تم إصدار فاتورة ضريبية قياسية ${built.invoiceNumber}.`
      : `تم إصدار فاتورة ضريبية مبسطة ${built.invoiceNumber}.`
  );

  return {
    ok: true,
    invoice: saved,
    milestone,
    messages,
    error: null,
    promptPreview: true,
  };
}

/** عند توقيع/اعتماد العقد — جهّز الدفعات وأصدر الدفعة المقدمة */
export async function generateUpfrontInvoiceOnContract(
  client: ClientRecord,
  contract?: SalesContract | null
): Promise<GenerateTaxInvoiceResult> {
  const milestones = await ensurePaymentMilestonesForClient(client, contract);
  const upfront = milestones.find((m) => m.sort_order === 1) || milestones[0];
  if (!upfront) {
    return {
      ok: false,
      invoice: null,
      milestone: null,
      messages: [],
      error: 'تعذر تجهيز جدول الدفعات',
      promptPreview: false,
    };
  }
  return generateTaxInvoiceFromMilestone({
    clientId: client.id,
    milestoneId: upfront.id.startsWith('local-') || upfront.id.startsWith('demo-') ? undefined : upfront.id,
    contractId: contract?.id,
    percentage: upfront.id.startsWith('local-') || upfront.id.startsWith('demo-') ? upfront.percentage : undefined,
    title: upfront.title,
    triggerSource: 'contract_upfront',
  });
}

/** عند اكتمال مرحلة مشروع — أصدر الدفعة المرتبطة إن لم تُفوتر */
export async function generateInvoiceForEngineeringEvent(
  client: ClientRecord,
  event: 'engineering_delivery' | 'field_visit' | 'final_inspection' | 'completion'
): Promise<GenerateTaxInvoiceResult> {
  const milestones = await ensurePaymentMilestonesForClient(client, null);
  const index =
    event === 'field_visit' || event === 'engineering_delivery'
      ? 1
      : event === 'final_inspection' || event === 'completion'
        ? 2
        : 1;
  const target = milestones[index] || milestones.find((m) => !m.is_invoiced);
  if (!target) {
    return {
      ok: false,
      invoice: null,
      milestone: null,
      messages: [],
      error: 'لا توجد دفعة مرتبطة بهذه المرحلة',
      promptPreview: false,
    };
  }
  if (target.is_invoiced) {
    return {
      ok: true,
      invoice: null,
      milestone: target,
      messages: ['الدفعة المرتبطة بهذه المرحلة مُفوترة مسبقاً.'],
      error: null,
      promptPreview: false,
    };
  }

  // حدّث الحالة إلى جاهزة قبل الإصدار
  if (!target.id.startsWith('local-') && !target.id.startsWith('demo-')) {
    await supabase
      .from('payment_milestones')
      .update({ status: 'ready', updated_at: new Date().toISOString() })
      .eq('id', target.id);
  }

  return generateTaxInvoiceFromMilestone({
    clientId: client.id,
    milestoneId:
      target.id.startsWith('local-') || target.id.startsWith('demo-') ? undefined : target.id,
    percentage:
      target.id.startsWith('local-') || target.id.startsWith('demo-') ? target.percentage : undefined,
    title: target.title,
    triggerSource: 'milestone',
  });
}
