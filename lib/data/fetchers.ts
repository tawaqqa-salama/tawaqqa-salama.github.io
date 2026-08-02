import { supabase } from '@/lib/supabase';
import { mergeLocalClientOverrides } from '@/lib/supabase/safe-client-write';
import { shouldShowInProjects } from '@/lib/business/pipeline';
import { APPROVED_FINANCIAL_STATUSES } from '@/lib/business/workflow-stages';
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

/**
 * يجلب مشاريع إدارة المشاريع مباشرة من قاعدة البيانات.
 * لا يعتمد على «أحدث N عميل» ثم التصفية — ذلك كان يُخفي المشاريع القديمة
 * عندما تمتلئ الدفعة بعملاء التسويق/المبيعات.
 */
export async function fetchProjectsList(limit = PROJECTS_PAGE_SIZE): Promise<ClientRecord[]> {
  const financialFilter = APPROVED_FINANCIAL_STATUSES.map((status) => `"${status}"`).join(',');
  const orFilter = [
    'pipeline_stage.in.(projects,completed)',
    `financial_status.in.(${financialFilter})`,
  ].join(',');

  const { data, error } = await supabase
    .from('clients')
    .select(PROJECT_LIST_COLUMNS)
    .or(orFilter)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.warn('[fetchProjectsList] filtered query failed, falling back:', error.message);
    // احتياطي: دفعة أكبر ثم تصفية محلية — أفضل من قائمة فارغة خاطئة
    const fallback = await fetchClientsList({
      limit: Math.max(limit * 3, 200),
      includeEngineering: true,
    });
    return fallback.filter(shouldShowInProjects);
  }

  const rows = ((data || []) as unknown as ClientRecord[]).map((row) =>
    mergeLocalClientOverrides(row)
  );

  // تأكيد الاتساق مع منطق الواجهة (resolvePipelineStage)
  return rows.filter(shouldShowInProjects);
}

/** مشاريع خفيفة لـ RFQ */
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
