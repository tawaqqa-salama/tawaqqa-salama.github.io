import { supabase } from '@/lib/supabase';
import { mergeLocalClientOverrides } from '@/lib/supabase/safe-client-write';
import { shouldShowInProjects } from '@/lib/business/pipeline';
import {
  ARCHIVE_PAGE_SIZE,
  CLIENT_LIST_COLUMNS,
  LIST_PAGE_SIZE,
  PROJECT_LIST_COLUMNS,
  PROJECTS_PAGE_SIZE,
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
    // إن فشل جلب أعمدة معيّنة (مثل JSON الهندسي) جرّب * 
    const { data: allData, error: allError } = await supabase
      .from('clients')
      .select('*')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    if (allError) {
      console.warn('[fetchClientsList] * fallback failed:', allError.message);
      return [];
    }
    return ((allData || []) as unknown as ClientRecord[]).map((row) =>
      mergeLocalClientOverrides(row)
    );
  }

  return ((data || []) as unknown as ClientRecord[]).map((row) => mergeLocalClientOverrides(row));
}

export async function fetchClientById(id: string): Promise<ClientRecord | null> {
  if (!id) return null;
  const { data, error } = await supabase.from('clients').select('*').eq('id', id).maybeSingle();
  if (error || !data) {
    // محاولة استعادة من النسخة المحلية للتقارير إن وُجدت
    const local = mergeLocalClientOverrides({ id } as ClientRecord);
    if ((local as ClientRecord).project_engineering_data) {
      return local as ClientRecord;
    }
    return null;
  }
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
    fetchClientsList({ limit: Math.max(limit, 100), includeEngineering: false }),
    fetchSalesDocuments(),
    fetchSalesContracts(),
    fetchSalesReturns(),
  ]);
  return { clients, documents, contracts, returns };
}

/**
 * يجلب كل العملاء المحتملين كمشاريع بدون الاعتماد على فلتر SQL هشّ للنصوص العربية.
 * التصفية تتم محلياً عبر shouldShowInProjects (يشمل العمل الهندسي المحفوظ).
 */
export async function fetchProjectsList(limit = PROJECTS_PAGE_SIZE): Promise<ClientRecord[]> {
  const fetchLimit = Math.max(limit, 500);

  // 1) محاولة بالأعمدة المختارة + JSON التقارير
  let rows = await fetchClientsList({ limit: fetchLimit, includeEngineering: true });

  // 2) إن رجعت قائمة قصيرة بشكل مريب، أعد الجلب بـ *
  if (rows.length === 0) {
    const { data, error } = await supabase
      .from('clients')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(fetchLimit);
    if (!error && data?.length) {
      rows = (data as ClientRecord[]).map((row) => mergeLocalClientOverrides(row));
    }
  }

  const projects = rows.filter(shouldShowInProjects);

  // 3) إن بقيت فارغة رغم وجود عملاء — أرجع كل الصفوف ليظهرها وضع «كل السجلات»
  //    (الواجهة تفرّق بين الفلاتر؛ لا نخفي البيانات هنا)
  if (projects.length === 0 && rows.length > 0) {
    console.warn(
      '[fetchProjectsList] no rows matched shouldShowInProjects; returning all fetched clients for recovery UI'
    );
    return rows;
  }

  return projects;
}

export async function fetchProjectOptions(limit = PROJECTS_PAGE_SIZE): Promise<
  Pick<ClientRecord, 'id' | 'business_name' | 'name' | 'client_code' | 'project_engineering_data'>[]
> {
  const projects = await fetchProjectsList(limit);
  return projects.map((p) => ({
    id: p.id,
    business_name: p.business_name,
    name: p.name,
    client_code: p.client_code,
    project_engineering_data: p.project_engineering_data,
  }));
}
