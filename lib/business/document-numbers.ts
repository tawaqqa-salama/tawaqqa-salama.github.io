import { supabase } from '@/lib/supabase';

/**
 * ترقيم مستندات احترافي: PREFIX-YYYY-NNN
 * مثال: Q-2026-023 ، CT-2026-005 ، OUT-2026-0001 ، INV-2026-001
 */

export const DOCUMENT_KINDS = [
  'quotation',
  'contract',
  'invoice',
  'outgoing',
  'return',
  'journal',
  'receipt',
  'payment',
  'certificate',
  'client',
  'lead',
] as const;

export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

type SequenceSpec = {
  prefix: string;
  pad: number;
  /** إن كان false يُستخدم year_key = 0 (تسلسل مستمر مثل C-1006) */
  yearly: boolean;
};

export const DOCUMENT_SEQUENCE_SPECS: Record<DocumentKind, SequenceSpec> = {
  quotation: { prefix: 'Q', pad: 3, yearly: true },
  contract: { prefix: 'CT', pad: 3, yearly: true },
  invoice: { prefix: 'INV', pad: 3, yearly: true },
  outgoing: { prefix: 'OUT', pad: 4, yearly: true },
  return: { prefix: 'RET', pad: 3, yearly: true },
  journal: { prefix: 'JE', pad: 4, yearly: true },
  receipt: { prefix: 'RV', pad: 4, yearly: true },
  payment: { prefix: 'PV', pad: 4, yearly: true },
  certificate: { prefix: 'CERT', pad: 3, yearly: true },
  client: { prefix: 'C', pad: 4, yearly: false },
  lead: { prefix: 'LD', pad: 3, yearly: true },
};

const DEFAULT_COMPANY_ID = '00000000-0000-0000-0000-000000000000';

/** عدّادات احتياطية في الذاكرة (وضع العرض / عند غياب RPC) */
const localCounters = new Map<string, number>();
let localBootstrapped = false;

export function currentSequenceYear(date = new Date()): number {
  return date.getFullYear();
}

export function formatDocumentNumber(
  kind: DocumentKind,
  sequence: number,
  year = currentSequenceYear()
): string {
  const spec = DOCUMENT_SEQUENCE_SPECS[kind];
  const padded = String(Math.max(0, sequence)).padStart(spec.pad, '0');
  if (!spec.yearly) {
    return `${spec.prefix}-${padded}`;
  }
  return `${spec.prefix}-${year}-${padded}`;
}

export function parseDocumentSequence(
  value: string | null | undefined,
  kind: DocumentKind
): { year: number; sequence: number } | null {
  if (!value) return null;
  const spec = DOCUMENT_SEQUENCE_SPECS[kind];
  const escaped = spec.prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  if (!spec.yearly) {
    const match = value.trim().match(new RegExp(`^${escaped}-(\\d+)$`, 'i'));
    if (!match) return null;
    return { year: 0, sequence: Number(match[1]) };
  }

  const match = value.trim().match(new RegExp(`^${escaped}-(\\d{4})-(\\d+)$`, 'i'));
  if (!match) return null;
  return { year: Number(match[1]), sequence: Number(match[2]) };
}

function counterKey(kind: DocumentKind, yearKey: number): string {
  return `${kind}:${yearKey}`;
}

function yearKeyFor(kind: DocumentKind, year = currentSequenceYear()): number {
  return DOCUMENT_SEQUENCE_SPECS[kind].yearly ? year : 0;
}

function bumpLocal(kind: DocumentKind, yearKey: number, atLeast: number): number {
  const key = counterKey(kind, yearKey);
  const current = localCounters.get(key) ?? 0;
  const next = Math.max(current, atLeast) + 1;
  localCounters.set(key, next);
  return next;
}

function considerExisting(kind: DocumentKind, raw: string | null | undefined) {
  const parsed = parseDocumentSequence(raw, kind);
  if (!parsed) return;
  const key = counterKey(kind, parsed.year);
  const current = localCounters.get(key) ?? 0;
  if (parsed.sequence > current) {
    localCounters.set(key, parsed.sequence);
  }
}

function extractOutgoingFromEngineering(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null;
  const report = (data as { technical_report?: { outgoing_number?: string } }).technical_report;
  return report?.outgoing_number || null;
}

function extractCertificateFromEngineering(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null;
  const cert = (data as { completion_certificate?: { certificate_number?: string } }).completion_certificate;
  return cert?.certificate_number || null;
}

async function bootstrapLocalCountersFromData() {
  if (localBootstrapped) return;
  localBootstrapped = true;

  try {
    // لا نجلب project_engineering_data كاملاً (قد يحتوي صوراً base64) — نكتفي بأرقام المستندات الظاهرة
    const [clients, docs, contracts, returns, journals, vouchers, techLite] = await Promise.all([
      supabase.from('clients').select('client_code, quotation_number').limit(500),
      supabase.from('sales_documents').select('doc_type, doc_number').limit(500),
      supabase.from('sales_contracts').select('contract_number').limit(500),
      supabase.from('sales_returns').select('return_number').limit(200),
      supabase.from('journal_entries').select('entry_number').limit(500),
      supabase.from('vouchers').select('voucher_type, voucher_number').limit(500),
      // مسار خفيف اختياري: أعمدة الرقم الصادر/الشهادة إن وُجدت كحقول مسطّحة مستقبلاً
      supabase
        .from('clients')
        .select('project_engineering_data')
        .not('project_engineering_data', 'is', null)
        .limit(50),
    ]);

    for (const row of clients.data || []) {
      considerExisting('client', row.client_code as string);
      considerExisting('lead', row.client_code as string);
      considerExisting('quotation', row.quotation_number as string);
    }

    // عيّنة محدودة فقط لاستخراج أرقام الصادر/الشهادة دون تحميل كل السجلات
    for (const row of techLite.data || []) {
      considerExisting('outgoing', extractOutgoingFromEngineering(row.project_engineering_data));
      considerExisting('certificate', extractCertificateFromEngineering(row.project_engineering_data));
    }

    for (const row of docs.data || []) {
      const kind = row.doc_type === 'invoice' ? 'invoice' : 'quotation';
      considerExisting(kind, row.doc_number as string);
    }

    for (const row of contracts.data || []) {
      considerExisting('contract', row.contract_number as string);
    }

    for (const row of returns.data || []) {
      considerExisting('return', row.return_number as string);
    }

    for (const row of journals.data || []) {
      considerExisting('journal', row.entry_number as string);
    }

    for (const row of vouchers.data || []) {
      const kind = row.voucher_type === 'payment' ? 'payment' : 'receipt';
      considerExisting(kind, row.voucher_number as string);
    }
  } catch {
    // الوضع الاحتياطي يبقى صالحاً حتى لو فشل الجلب
  }
}

async function nextDocumentNumberLocal(kind: DocumentKind): Promise<string> {
  await bootstrapLocalCountersFromData();
  const year = currentSequenceYear();
  const yk = yearKeyFor(kind, year);
  const sequence = bumpLocal(kind, yk, 0);
  return formatDocumentNumber(kind, sequence, DOCUMENT_SEQUENCE_SPECS[kind].yearly ? year : 0);
}

/**
 * يصدر الرقم التالي ذرياً عبر RPC عند توفره، وإلا عبر عدّاد محلي مهيأ من البيانات الحالية.
 */
export async function nextDocumentNumber(
  kind: DocumentKind,
  companyId?: string | null
): Promise<string> {
  try {
    const { data, error } = await supabase.rpc('next_document_number', {
      p_doc_kind: kind,
      p_company_id: companyId || null,
    });

    if (!error && typeof data === 'string' && data.length > 0) {
      const parsed = parseDocumentSequence(data, kind);
      if (parsed) {
        const key = counterKey(kind, parsed.year);
        const current = localCounters.get(key) ?? 0;
        if (parsed.sequence > current) localCounters.set(key, parsed.sequence);
      }
      return data;
    }
  } catch {
    // متابعة للوضع الاحتياطي
  }

  return nextDocumentNumberLocal(kind);
}

export async function nextQuotationNumber(companyId?: string | null) {
  return nextDocumentNumber('quotation', companyId);
}

export async function nextContractNumber(companyId?: string | null) {
  return nextDocumentNumber('contract', companyId);
}

export async function nextInvoiceNumber(companyId?: string | null) {
  return nextDocumentNumber('invoice', companyId);
}

export async function nextOutgoingNumber(companyId?: string | null) {
  return nextDocumentNumber('outgoing', companyId);
}

export async function nextReturnNumber(companyId?: string | null) {
  return nextDocumentNumber('return', companyId);
}

export async function nextJournalNumber(companyId?: string | null) {
  return nextDocumentNumber('journal', companyId);
}

export async function nextVoucherNumber(type: 'receipt' | 'payment', companyId?: string | null) {
  return nextDocumentNumber(type === 'receipt' ? 'receipt' : 'payment', companyId);
}

export async function nextCertificateNumber(companyId?: string | null) {
  return nextDocumentNumber('certificate', companyId);
}

export async function nextClientCode(companyId?: string | null) {
  return nextDocumentNumber('client', companyId);
}

export async function nextLeadCode(companyId?: string | null) {
  return nextDocumentNumber('lead', companyId);
}

export async function nextSalesDocNumber(
  type: 'quotation' | 'invoice',
  companyId?: string | null
) {
  return nextDocumentNumber(type === 'quotation' ? 'quotation' : 'invoice', companyId);
}

/** يضمن وجود رقم صادر؛ لا يغيّر الرقم إن وُجد مسبقاً */
export async function ensureOutgoingNumber(
  current: string | null | undefined,
  companyId?: string | null
): Promise<string> {
  if (current?.trim()) return current.trim();
  return nextOutgoingNumber(companyId);
}

/** يضمن وجود رقم شهادة إنهاء */
export async function ensureCertificateNumber(
  current: string | null | undefined,
  companyId?: string | null
): Promise<string> {
  if (current?.trim()) return current.trim();
  return nextCertificateNumber(companyId);
}

/** للاختبارات / إعادة تهيئة وضع العرض */
export function __resetLocalDocumentCountersForTests() {
  localCounters.clear();
  localBootstrapped = false;
}

export { DEFAULT_COMPANY_ID };
