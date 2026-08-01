import { supabase, isDemoMode } from '@/lib/supabase';
import { ZATCA_LOCAL_CHAIN_KEY, ZATCA_FIRST_PIH } from '@/lib/zatca/constants';

type ChainState = {
  lastInvoiceHash: string;
  lastUuid: string | null;
  count: number;
};

function loadLocalChain(): ChainState {
  if (typeof window === 'undefined') {
    return { lastInvoiceHash: ZATCA_FIRST_PIH, lastUuid: null, count: 0 };
  }
  try {
    const raw = localStorage.getItem(ZATCA_LOCAL_CHAIN_KEY);
    if (!raw) return { lastInvoiceHash: ZATCA_FIRST_PIH, lastUuid: null, count: 0 };
    return { lastInvoiceHash: ZATCA_FIRST_PIH, lastUuid: null, count: 0, ...JSON.parse(raw) };
  } catch {
    return { lastInvoiceHash: ZATCA_FIRST_PIH, lastUuid: null, count: 0 };
  }
}

function saveLocalChain(state: ChainState) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(ZATCA_LOCAL_CHAIN_KEY, JSON.stringify(state));
}

export async function getPreviousInvoiceHash(): Promise<string> {
  const local = loadLocalChain();
  if (isDemoMode) return local.lastInvoiceHash || ZATCA_FIRST_PIH;

  const { data } = await supabase
    .from('zatca_invoices')
    .select('invoice_hash')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (data?.invoice_hash) return String(data.invoice_hash);
  return local.lastInvoiceHash || ZATCA_FIRST_PIH;
}

export async function persistInvoiceHash(invoiceHash: string, uuid: string): Promise<void> {
  const prev = loadLocalChain();
  saveLocalChain({
    lastInvoiceHash: invoiceHash,
    lastUuid: uuid,
    count: (prev.count || 0) + 1,
  });
}
