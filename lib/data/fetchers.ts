import { supabase } from '@/lib/supabase';
import { mergeLocalClientOverrides } from '@/lib/supabase/safe-client-write';
import {
  ARCHIVE_PAGE_SIZE,
  CLIENT_LIST_COLUMNS,
  LIST_PAGE_SIZE,
  PROJECT_LIST_COLUMNS,
} from '@/lib/data/query-config';
import type { ClientRecord } from '@/lib/types/client';
import type { SalesContract, SalesDocument, SalesReturn } from '@/lib/types/sales';

export type ListFetchOptions = {
  limit?: number;
  offset?: number;
  /** عند true يُجلب project_engineering_data (أثقل) */
  includeEngineering?: boolean;
};

export async function fetchClientsList(options: ListFetchOptions = {}): Promise<ClientRecord[]> {
  const limit = options.limit ?? LIST_PAGE_SIZE;
  const offset = options.offset ?? 0;
  const columns = options.includeEngineering ? PROJECT_LIST_COLUMNS : CLIENT_LIST_COLUMNS;

  const { data, error } = await supabase
    .from('clients')
    .select(columns)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    console.warn('[fetchClientsList]', error.message);
    return [];
  }

  return ((data || []) as unknown as ClientRecord[]).map((row) => mergeLocalClientOverrides(row));
}

export async function fetchClientById(id: string): Promise<ClientRecord | null> {
  if (!id) return null;
  const { data, error } = await supabase.from('clients').select('*').eq('id', id).maybeSingle();
  if (error || !data) return null;
  return mergeLocalClientOverrides(data as ClientRecord);
}

export async function fetchSalesDocuments(limit = ARCHIVE_PAGE_SIZE): Promise<SalesDocument[]> {
  const { data } = await supabase
    .from('sales_documents')
    .select('id, client_id, doc_type, doc_number, subtotal, vat_amount, total_amount, status, archived, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);
  return (data || []) as SalesDocument[];
}

export async function fetchSalesContracts(limit = ARCHIVE_PAGE_SIZE): Promise<SalesContract[]> {
  // * مطلوب لطباعة العقد (بنود الأطراف والدفع)
  const { data } = await supabase
    .from('sales_contracts')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  return (data || []) as SalesContract[];
}

export async function fetchSalesReturns(limit = LIST_PAGE_SIZE): Promise<SalesReturn[]> {
  const { data } = await supabase
    .from('sales_returns')
    .select('id, client_id, return_number, amount, reason, status, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);
  return (data || []) as SalesReturn[];
}

export type SalesBundle = {
  clients: ClientRecord[];
  documents: SalesDocument[];
  contracts: SalesContract[];
  returns: SalesReturn[];
};

export async function fetchSalesBundle(limit = LIST_PAGE_SIZE): Promise<SalesBundle> {
  const [clients, documents, contracts, returns] = await Promise.all([
    fetchClientsList({ limit, includeEngineering: false }),
    fetchSalesDocuments(),
    fetchSalesContracts(),
    fetchSalesReturns(),
  ]);
  return { clients, documents, contracts, returns };
}

export async function fetchProjectsList(limit = LIST_PAGE_SIZE): Promise<ClientRecord[]> {
  return fetchClientsList({ limit, includeEngineering: true });
}

/** مشاريع خفيفة لـ RFQ بدون JSON الهندسي الكامل */
export async function fetchProjectOptions(limit = LIST_PAGE_SIZE): Promise<
  Pick<ClientRecord, 'id' | 'business_name' | 'name' | 'client_code' | 'project_engineering_data'>[]
> {
  const { data } = await supabase
    .from('clients')
    .select('id, business_name, name, client_code, project_engineering_data')
    .order('created_at', { ascending: false })
    .limit(limit);
  return (data || []) as ClientRecord[];
}
