import { loadSession } from '@/lib/auth/session';
import { supabase } from '@/lib/supabase';
import { mergeLocalClientOverrides } from '@/lib/supabase/safe-client-write';
import { attachEngineeringLiveToClient } from '@/lib/projects/engineering-live-store';
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
import { measureRequest } from '@/lib/performance/measure-request';
import { markSalesLoadStage } from '@/lib/performance/sales-load';

export type ListFetchOptions = {
  limit?: number;
  offset?: number;
  /** عند true يُجلب project_engineering_data (أثقل) */
  includeEngineering?: boolean;
  /** Tenant scope — defaults to session.companyId when available */
  companyId?: string | null;
};

/** Resolve company_id for client-side queries (never trust arbitrary IDs from UI alone). */
export function resolveFetchCompanyId(explicit?: string | null): string | null {
  if (explicit) return explicit;
  return loadSession()?.companyId || null;
}

function applyCompanyFilter<T extends { eq: (col: string, val: string) => T }>(
  query: T,
  companyId: string | null
): T {
  // Fail closed: never run an unscoped list/query when tenant is unknown
  if (!companyId) {
    throw new Error('company_id_required');
  }
  return query.eq('company_id', companyId);
}

export async function fetchClientsList(options: ListFetchOptions = {}): Promise<ClientRecord[]> {
  const limit = options.limit ?? LIST_PAGE_SIZE;
  const offset = options.offset ?? 0;
  const columns = options.includeEngineering ? PROJECT_LIST_COLUMNS : CLIENT_LIST_COLUMNS;
  const companyId = resolveFetchCompanyId(options.companyId);
  if (!companyId) return [];

  let query = supabase
    .from('clients')
    .select(columns)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);
  query = applyCompanyFilter(query, companyId);

  const { data, error } = await measureRequest(
    `clients:list:${options.includeEngineering ? 'engineering' : 'standard'}`,
    query,
            { cacheStatus: 'miss', route: '/data/clients', includePayloadMetrics: true }

  );

  if (error) {
    console.warn('[fetchClientsList]', error.message);
    // إن فشل جلب أعمدة معيّنة (مثل JSON الهندسي) جرّب * 
    let fallback = supabase
      .from('clients')
      .select('*')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    fallback = applyCompanyFilter(fallback, companyId);
          const { data: allData, error: allError } = await measureRequest(
        'clients:list:fallback',
        fallback,
        { cacheStatus: 'miss', route: '/data/clients/fallback', includePayloadMetrics: true }
      );

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

export async function fetchClientById(
  id: string,
  companyId?: string | null
): Promise<ClientRecord | null> {
  if (!id) return null;
  const tenantId = resolveFetchCompanyId(companyId);
  // Fail closed without tenant — do not load by id alone (IDOR)
  if (!tenantId) return null;
  let query = supabase.from('clients').select('*').eq('id', id);
  query = applyCompanyFilter(query, tenantId);
  const { data, error } = await query.maybeSingle();
  if (error || !data) {
    // Local override only when it already belongs to this tenant (or has no company)
    const local = mergeLocalClientOverrides({ id } as ClientRecord);
    const localCompany = (local as ClientRecord & { company_id?: string }).company_id;
    if (
      (local as ClientRecord).project_engineering_data &&
      (!localCompany || localCompany === tenantId)
    ) {
      return local as ClientRecord;
    }
    return null;
  }
  if ((data as { company_id?: string }).company_id && (data as { company_id: string }).company_id !== tenantId) {
    return null;
  }
  const merged = mergeLocalClientOverrides(data as ClientRecord);
  return attachEngineeringLiveToClient(merged);
}

export async function fetchSalesDocuments(limit = ARCHIVE_PAGE_SIZE): Promise<SalesDocument[]> {
  const companyId = resolveFetchCompanyId();
  if (!companyId) return [];
  let query = supabase
    .from('sales_documents')
    .select('id, client_id, doc_type, doc_number, subtotal, vat_amount, total_amount, status, archived, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);
  query = applyCompanyFilter(query, companyId);
  const { data } = await measureRequest(
    'sales:documents',
    query,
    { cacheStatus: 'miss', route: '/data/sales/documents', includePayloadMetrics: true }
  );
  return (data || []) as SalesDocument[];
}

export async function fetchSalesContracts(limit = ARCHIVE_PAGE_SIZE): Promise<SalesContract[]> {
  const companyId = resolveFetchCompanyId();
  if (!companyId) return [];
  let query = supabase
    .from('sales_contracts')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  query = applyCompanyFilter(query, companyId);
  const { data } = await measureRequest(
    'sales:contracts',
    query,
    { cacheStatus: 'miss', route: '/data/sales/contracts', includePayloadMetrics: true }
  );
  return (data || []) as SalesContract[];
}

export async function fetchSalesReturns(limit = LIST_PAGE_SIZE): Promise<SalesReturn[]> {
  const companyId = resolveFetchCompanyId();
  if (!companyId) return [];
  let query = supabase
    .from('sales_returns')
    .select('id, client_id, return_number, amount, reason, status, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);
  query = applyCompanyFilter(query, companyId);
  const { data } = await measureRequest(
    'sales:returns',
    query,
    { cacheStatus: 'miss', route: '/data/sales/returns', includePayloadMetrics: true }
  );
  return (data || []) as SalesReturn[];
}

export type SalesBundle = {
  clients: ClientRecord[];
  documents: SalesDocument[];
  contracts: SalesContract[];
  returns: SalesReturn[];
};

export async function fetchSalesBundle(
  limit = LIST_PAGE_SIZE,
  options: { includeRelated?: boolean } = {}
): Promise<SalesBundle> {
  const includeRelated = options.includeRelated !== false;
  const companyId = resolveFetchCompanyId();
  if (!companyId) return { clients: [], documents: [], contracts: [], returns: [] };
  markSalesLoadStage('auth-company-ready');
  markSalesLoadStage('first-request-begin');
  markSalesLoadStage('detail-data-deferred');

  const clientsPromise = fetchClientsList({ limit, includeEngineering: false }).then((value) => {
    markSalesLoadStage('clients-loaded');
    return value;
  });
  const documentsPromise = includeRelated
    ? fetchSalesDocuments().then((value) => {
        markSalesLoadStage('quotations-loaded');
        return value;
      })
    : Promise.resolve([] as SalesDocument[]);
  const contractsPromise = includeRelated ? fetchSalesContracts() : Promise.resolve([] as SalesContract[]);
  const returnsPromise = includeRelated ? fetchSalesReturns() : Promise.resolve([] as SalesReturn[]);
  const [clients, documents, contracts, returns] = await Promise.all([
    clientsPromise,
    documentsPromise,
    contractsPromise,
    returnsPromise,
  ]);
  markSalesLoadStage('contracts-invoices-loaded');
  return { clients, documents, contracts, returns };
}

/**
 * يجلب كل العملاء المحتملين كمشاريع بدون الاعتماد على فلتر SQL هشّ للنصوص العربية.
 * التصفية تتم محلياً عبر shouldShowInProjects (يشمل العمل الهندسي المحفوظ).
 */
export type ProjectsPage = {
  projects: ClientRecord[];
  hasMore: boolean;
};

export async function fetchProjectsPage(
  limit = PROJECTS_PAGE_SIZE,
  offset = 0
): Promise<ProjectsPage> {
  const fetchLimit = Math.max(limit, 1);
  // نطلب صفًا إضافيًا لمعرفة وجود صفحة لاحقة دون جلب مئات السجلات.
  const rows = await fetchClientsList({
    limit: fetchLimit + 1,
    offset,
    includeEngineering: true,
  });
  const hasMore = rows.length > fetchLimit;
  const visibleRows = rows.slice(0, fetchLimit);
  const projects = visibleRows.filter(shouldShowInProjects);

  if (projects.length === 0 && visibleRows.length > 0) {
    console.warn(
      '[fetchProjectsPage] no rows matched shouldShowInProjects; returning current page for recovery UI'
    );
    return { projects: visibleRows, hasMore };
  }

  return { projects, hasMore };
}

export async function fetchProjectsList(
  limit = PROJECTS_PAGE_SIZE,
  offset = 0
): Promise<ClientRecord[]> {
  const page = await fetchProjectsPage(limit, offset);
  return page.projects;
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
