import { supabase, isDemoMode } from '@/lib/supabase';
import { loadCompanyProfile } from '@/lib/company-profile';
import { generateSalesDocNumber } from '@/lib/constants/modules';
import { calculateTotalAmount, calculateVatAmount } from '@/lib/business/client-workflow';
import { getPreviousInvoiceHash, persistInvoiceHash } from '@/lib/zatca/chain';
import { buildZatcaInvoice } from '@/lib/zatca/engine';
import { mapClientToZatcaInput } from '@/lib/zatca/mapper';
import { loadZatcaSettings } from '@/lib/zatca/settings';
import { submitInvoiceToZatca } from '@/lib/zatca/api-client';
import { resolveInvoiceType } from '@/lib/invoices/payment-schedule';
import type { ClientRecord } from '@/lib/types/client';
import type { ZatcaApiResponse, ZatcaSubmissionStatus } from '@/lib/zatca/types';

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

async function ensureSalesInvoiceDocument(client: ClientRecord, invoiceNumber: string) {
  const subtotal = Number(client.quotation_amount || 0);
  const vatAmount = Number(client.vat_amount || calculateVatAmount(subtotal));
  const totalAmount = Number(client.total_amount || calculateTotalAmount(subtotal));

  const { data: existing } = await supabase
    .from('sales_documents')
    .select('id, doc_number')
    .eq('client_id', client.id)
    .eq('doc_type', 'invoice')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing?.id) {
    return { id: existing.id as string, docNumber: String(existing.doc_number || invoiceNumber) };
  }

  const { data, error } = await supabase
    .from('sales_documents')
    .insert({
      client_id: client.id,
      doc_type: 'invoice',
      doc_number: invoiceNumber,
      subtotal,
      vat_amount: vatAmount,
      total_amount: totalAmount,
      status: 'معتمدة',
      archived: true,
      notes: 'فاتورة نهائية من اعتماد عرض السعر — ZATCA',
    })
    .select('id, doc_number')
    .maybeSingle();

  if (error) {
    return { id: null as string | null, docNumber: invoiceNumber, error: error.message };
  }
  return { id: (data?.id as string) || null, docNumber: String(data?.doc_number || invoiceNumber) };
}

async function saveZatcaInvoiceRow(row: {
  clientId: string;
  salesDocumentId: string | null;
  invoiceNumber: string;
  uuid: string;
  invoiceHash: string;
  previousInvoiceHash: string;
  qrBase64: string;
  xml: string;
  status: ZatcaSubmissionStatus;
  environment: string;
  invoiceKind: string;
  response: unknown;
}) {
  if (isDemoMode) return;

  await supabase.from('zatca_invoices').insert({
    client_id: row.clientId,
    sales_document_id: row.salesDocumentId,
    invoice_number: row.invoiceNumber,
    uuid: row.uuid,
    invoice_hash: row.invoiceHash,
    previous_invoice_hash: row.previousInvoiceHash,
    qr_base64: row.qrBase64,
    xml: row.xml,
    status: row.status,
    environment: row.environment,
    invoice_kind: row.invoiceKind,
    zatca_response: row.response ?? null,
  });
}

/**
 * عند اعتماد عرض السعر وتحويله لفاتورة نهائية:
 * يبني XML/Hash/QR ويرسل إلى ZATCA (Reporting أو Clearance) ويحفظ الحالة.
 */
export async function processZatcaOnQuotationApproval(
  client: ClientRecord
): Promise<{ messages: string[]; error: string | null; status: ZatcaSubmissionStatus }> {
  const settings = await loadZatcaSettings();
  if (!settings.enabled) {
    return { messages: [], error: null, status: 'disabled' };
  }

  const company = await loadCompanyProfile();
  if (!company.tax_number) {
    return {
      messages: [],
      error: 'الرقم الضريبي للمنشأة غير معرّف في معلومات الشركة — مطلوب لـ ZATCA.',
      status: 'error',
    };
  }

  const invoiceNumber =
    client.quotation_number?.replace(/^Q-/i, 'INV-') || (await generateSalesDocNumber('invoice'));
  const previousInvoiceHash = await getPreviousInvoiceHash();
  const detected = resolveInvoiceType(client);
  const invoiceKind =
    detected === 'STANDARD'
      ? 'standard'
      : detected === 'SIMPLIFIED'
        ? 'simplified'
        : settings.invoice_kind;

  const mapped = mapClientToZatcaInput({
    client,
    company,
    invoiceNumber,
    invoiceKind,
    previousInvoiceHash,
  });

  const built = buildZatcaInvoice({
    ...mapped,
    privateKeyPemOrHex: settings.private_key_pem,
  });

  const doc = await ensureSalesInvoiceDocument(
    { ...client, quotation_number: invoiceNumber },
    invoiceNumber
  );

  // تفضيل مسار السيرفر (يتجاوز CORS) ثم الرجوع للاستدعاء المباشر
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

  await persistInvoiceHash(built.invoiceHash, built.uuid);
  await saveZatcaInvoiceRow({
    clientId: client.id,
    salesDocumentId: doc.id,
    invoiceNumber: built.invoiceNumber,
    uuid: built.uuid,
    invoiceHash: built.invoiceHash,
    previousInvoiceHash: built.previousInvoiceHash,
    qrBase64: built.qrBase64,
    xml: built.signedXml,
    status: apiResult.status,
    environment: settings.environment,
    invoiceKind,
    response: apiResult.raw ?? { error: apiResult.error },
  });

  if (!apiResult.ok) {
    return {
      messages: [`ZATCA: ${apiResult.error || 'فشل الإرسال'} — الحالة: ${apiResult.status}`],
      error: null,
      status: apiResult.status,
    };
  }

  return {
    messages: [
      invoiceKind === 'standard'
        ? 'تم إرسال الفاتورة إلى ZATCA Clearance بنجاح.'
        : 'تم إرسال الفاتورة إلى ZATCA Reporting بنجاح.',
    ],
    error: null,
    status: apiResult.status,
  };
}
