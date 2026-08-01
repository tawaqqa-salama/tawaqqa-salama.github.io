import { supabase, isDemoMode } from '@/lib/supabase';
import { calculateTotalAmount, calculateVatAmount } from '@/lib/business/client-workflow';
import { generateContractNumber } from '@/lib/constants/modules';
import {
  getQuotationServiceLabel,
  normalizeQuotationServices,
} from '@/lib/constants/quotation-services';
import {
  CONTRACT_GENERAL_TERMS,
  CONTRACT_PREAMBLE,
  buildDurationClause,
} from '@/lib/constants/contract-terms';
import { amountToArabicWords } from '@/lib/format/arabic-amount';
import { loadCompanyProfile, type CompanyProfile } from '@/lib/company-profile';
import { isFinancialApproved } from '@/lib/business/workflow-stages';
import type { ClientRecord } from '@/lib/types/client';
import type { SalesContract } from '@/lib/types/sales';

function round2(value: number): number {
  return Math.round(Number(value || 0) * 100) / 100;
}

function clientAddress(client: ClientRecord): string {
  return [client.street, client.district, client.city, client.region, client.national_address]
    .filter(Boolean)
    .join(' — ');
}

export function buildServiceScopeFromQuotation(client: ClientRecord): string {
  const services = normalizeQuotationServices(client.quotation_services);
  if (services.length === 0) {
    return `خدمات استشارية وتراخيص سلامة — ${client.business_name || client.name}`;
  }

  return services
    .map((id) => {
      const label = getQuotationServiceLabel(id);
      if (id === 'site_visits') {
        return `${label} (${Math.max(1, Number(client.quotation_visits_count || 1))} زيارة)`;
      }
      return label;
    })
    .join('\n');
}

export function buildContractTermsText(company: CompanyProfile): string {
  const payment = [
    company.payment_first,
    company.payment_second,
    company.payment_final,
    company.payment_terms,
  ]
    .filter(Boolean)
    .join('\n');

  const general = CONTRACT_GENERAL_TERMS.map((term, index) => `${index + 1}. ${term}`).join('\n');
  return `خطة السداد:\n${payment || 'حسب الاتفاق'}\n\nالشروط العامة:\n${general}`;
}

export function shouldAutoGenerateContract(
  previous: Partial<ClientRecord>,
  next: Partial<ClientRecord>
): boolean {
  const amount = Number(next.quotation_amount || previous.quotation_amount || 0);
  if (amount <= 0) return false;
  if (!next.quotation_number && !previous.quotation_number) return false;

  const prevQuote = previous.quotation_status || '';
  const nextQuote = next.quotation_status || '';
  const quoteApproved =
    ['معتمد', 'بانتظار السداد'].includes(nextQuote) && prevQuote !== nextQuote;

  const prevPaid = isFinancialApproved(previous.financial_status);
  const nextPaid = isFinancialApproved(next.financial_status);
  const justPaid = nextPaid && !prevPaid;

  // أيضاً عند الحفظ بحالة معتمدة حتى لو كانت مسبقاً (أول مرة بعد إضافة الأتمتة) — يُعالج عبر idempotency
  const quoteAlreadyApproved = ['معتمد', 'بانتظار السداد'].includes(nextQuote);
  const paidStatusLabel = next.financial_status === 'تم السداد' || nextPaid;

  return Boolean(quoteApproved || justPaid || (quoteAlreadyApproved && paidStatusLabel && !prevPaid));
}

export async function findExistingContractForQuote(
  clientId: string,
  quotationNumber: string | null | undefined
): Promise<SalesContract | null> {
  if (!quotationNumber) return null;
  const { data } = await supabase
    .from('sales_contracts')
    .select('*')
    .eq('client_id', clientId)
    .eq('quotation_number', quotationNumber)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as SalesContract | null) || null;
}

export function mapQuotationToContractPayload(
  client: ClientRecord,
  company: CompanyProfile,
  contractNumber: string
): Omit<SalesContract, 'id' | 'created_at'> {
  const amount = round2(Number(client.quotation_amount || 0));
  const vatAmount = round2(Number(client.vat_amount || calculateVatAmount(amount)));
  const totalAmount = round2(Number(client.total_amount || calculateTotalAmount(amount)));
  const services = normalizeQuotationServices(client.quotation_services);
  const durationDays = Math.max(14, Number(company.quotation_validity_days) || 30);

  return {
    client_id: client.id,
    contract_number: contractNumber,
    quotation_number: client.quotation_number || null,
    contract_date: new Date().toISOString().slice(0, 10),
    service_scope: buildServiceScopeFromQuotation(client),
    terms: buildContractTermsText(company),
    amount,
    vat_amount: vatAmount,
    total_amount: totalAmount,
    status: 'معتمد',
    auto_generated: true,
    amount_words: amountToArabicWords(totalAmount),
    duration_days: durationDays,
    duration_text: buildDurationClause(durationDays),
    preamble: CONTRACT_PREAMBLE,
    party2_name: client.business_name || client.name,
    party2_cr: client.commercial_register || null,
    party2_address: clientAddress(client) || null,
    party2_phone: client.phone || null,
    party1_name: company.legal_name || company.name,
    party1_cr: company.commercial_register || null,
    party1_tax: company.tax_number || null,
    party1_phone: company.phone || null,
    party1_address: [company.address, company.city].filter(Boolean).join(' — ') || null,
    party1_license: company.membership_id || null,
    bank_name: company.bank_name || null,
    bank_account: company.bank_account || null,
    iban: company.iban || null,
    payment_first: company.payment_first || null,
    payment_second: company.payment_second || null,
    payment_final: company.payment_final || null,
    payment_terms: company.payment_terms || null,
    sales_payment_type: client.sales_payment_type || 'نقدي',
    quotation_services: services,
  };
}

export async function createContractFromQuotation(
  client: ClientRecord,
  options?: { force?: boolean }
): Promise<{
  contract: SalesContract | null;
  created: boolean;
  messages: string[];
  error: string | null;
}> {
  const quotationNumber = client.quotation_number || null;
  if (!quotationNumber) {
    return { contract: null, created: false, messages: [], error: 'لا يوجد رقم عرض سعر لربط العقد.' };
  }
  if (Number(client.quotation_amount || 0) <= 0) {
    return { contract: null, created: false, messages: [], error: 'مبلغ عرض السعر غير صالح لإنشاء العقد.' };
  }

  if (!options?.force) {
    const existing = await findExistingContractForQuote(client.id, quotationNumber);
    if (existing) {
      return {
        contract: existing,
        created: false,
        messages: [`العقد مرتبط مسبقاً بعرض السعر (${existing.contract_number}).`],
        error: null,
      };
    }
  }

  const company = await loadCompanyProfile();
  const contractNumber = await generateContractNumber();
  const payload = mapQuotationToContractPayload(client, company, contractNumber);

  if (isDemoMode) {
    const demoContract = {
      id: `demo-ct-${Date.now()}`,
      created_at: new Date().toISOString(),
      ...payload,
    } as SalesContract;
    // محاولة الإدراج في الذاكرة التجريبية
    const { data, error } = await supabase.from('sales_contracts').insert(payload).select('*').single();
    if (!error && data) {
      return {
        contract: data as SalesContract,
        created: true,
        messages: [`تم إنشاء العقد تلقائياً رقم ${payload.contract_number}.`],
        error: null,
      };
    }
    return {
      contract: demoContract,
      created: true,
      messages: [`تم إنشاء العقد تلقائياً رقم ${payload.contract_number}.`],
      error: null,
    };
  }

  const { data, error } = await supabase.from('sales_contracts').insert(payload).select('*').single();
  if (error) {
    // إن فشلت الأعمدة الإضافية، أعد المحاولة بالحقول الأساسية فقط
    if (/column|schema cache/i.test(error.message)) {
      const basic = {
        client_id: payload.client_id,
        contract_number: payload.contract_number,
        quotation_number: payload.quotation_number,
        contract_date: payload.contract_date,
        service_scope: payload.service_scope,
        terms: payload.terms,
        amount: payload.amount,
        vat_amount: payload.vat_amount,
        total_amount: payload.total_amount,
        status: payload.status,
      };
      const retry = await supabase.from('sales_contracts').insert(basic).select('*').single();
      if (retry.error) {
        return { contract: null, created: false, messages: [], error: retry.error.message };
      }
      return {
        contract: { ...payload, ...(retry.data as SalesContract) },
        created: true,
        messages: [
          `تم إنشاء العقد تلقائياً رقم ${payload.contract_number}. (نفّذ SQL 019 لمزامنة حقول العقد الكاملة)`,
        ],
        error: null,
      };
    }
    return { contract: null, created: false, messages: [], error: error.message };
  }

  return {
    contract: data as SalesContract,
    created: true,
    messages: [`تم إنشاء العقد تلقائياً رقم ${payload.contract_number} وربطه بعرض ${quotationNumber}.`],
    error: null,
  };
}

/** يُستدعى بعد اعتماد العرض أو تأكيد السداد */
export async function processAutoContractOnApproval(
  previous: ClientRecord,
  next: ClientRecord
): Promise<{ messages: string[]; error: string | null; contract: SalesContract | null }> {
  if (Number(next.quotation_amount || 0) <= 0 || !next.quotation_number) {
    return { messages: [], error: null, contract: null };
  }

  const quoteOk = ['معتمد', 'بانتظار السداد'].includes(next.quotation_status || '');
  const paidOk = isFinancialApproved(next.financial_status) || next.financial_status === 'تم السداد';
  if (!quoteOk && !paidOk) {
    return { messages: [], error: null, contract: null };
  }

  const statusJustChanged = shouldAutoGenerateContract(previous, next);
  const existing = await findExistingContractForQuote(next.id, next.quotation_number);

  // لا تكرر الرسائل إذا العقد موجود مسبقاً ولم تتغير الحالة
  if (existing && !statusJustChanged) {
    return { messages: [], error: null, contract: existing };
  }
  if (existing) {
    return {
      messages: [`العقد مرتبط بعرض السعر (${existing.contract_number}).`],
      error: null,
      contract: existing,
    };
  }

  const result = await createContractFromQuotation(next);
  return {
    messages: result.messages,
    error: result.error,
    contract: result.contract,
  };
}
