'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { supabase } from '@/lib/supabase';
import { ACTIVITY_RULES } from '@/lib/constants/clients';
import { shouldShowInSales } from '@/lib/business/pipeline';
import { calculateTotalAmount, calculateVatAmount } from '@/lib/business/client-workflow';
import { generateReturnNumber, generateSalesDocNumber } from '@/lib/constants/modules';
import { nextClientCode } from '@/lib/business/document-numbers';
import ModuleSubNavSlot from '@/components/layout/ModuleSubNavSlot';
import ModuleTabBar from '@/components/layout/ModuleTabBar';
import ResponsiveTable from '@/components/ui/ResponsiveTable';
import RowActionsMenu from '@/components/ui/RowActionsMenu';
import { insertClientSafe, mergeLocalClientOverrides } from '@/lib/supabase/safe-client-write';
import { logActivity } from '@/lib/activity/logger';
import { formatCurrency } from '@/lib/format/currency';
import { parseLocalizedInteger, parseLocalizedNumber } from '@/lib/validation/client';
import { clientToFinancialDocument } from '@/lib/invoices/document-mapper';
import { printSavedQuotation, validateSavedQuotationForPrint } from '@/lib/invoices/quotation-print';
import { useSalesBundle, invalidateErpLists } from '@/lib/data/hooks';
import { LIST_PAGE_SIZE } from '@/lib/data/query-config';
import { markSalesLoadStage } from '@/lib/performance/sales-load';
import { markPageLoad } from '@/lib/performance/page-load-marks';
import { useLanguage } from '@/lib/i18n/LanguageProvider';
import type { ClientFormData, ClientRecord, FinancialDocument } from '@/lib/types/client';
import type { SalesReturn } from '@/lib/types/sales';

const AddClientModal = dynamic(() => import('@/components/clients/AddClientModal'), { ssr: false });
const ContractModal = dynamic(() => import('@/components/sales/ContractModal'), { ssr: false });
const TaxInvoicesPanel = dynamic(() => import('@/components/invoices/TaxInvoicesPanel'), {
  ssr: false,
  loading: () => (
    <div className="rounded-xl border bg-white p-8 text-center text-sm text-gray-400">
      جاري تحميل الفواتير الضريبية...
    </div>
  ),
});

type TabId = 'sales' | 'quotations' | 'documents' | 'credit' | 'contracts' | 'tax-invoices' | 'accounts';

function inDateRange(iso: string | undefined | null, from: string, to: string): boolean {
  if (!from && !to) return true;
  if (!iso) return false;
  const day = iso.slice(0, 10);
  if (from && day < from) return false;
  if (to && day > to) return false;
  return true;
}

async function printFinancialDocLazy(doc: FinancialDocument) {
  const { printFinancialDocument } = await import('@/components/invoices/FinancialDocumentPrint');
  await printFinancialDocument(doc);
}

async function printContractLazy(
  contract: Parameters<typeof import('@/components/sales/ContractPrint').printContract>[0],
  client: ClientRecord
) {
  const { printContract } = await import('@/components/sales/ContractPrint');
  await printContract(contract, client);
}

function ActionIcon({ kind }: { kind: 'folder' | 'tag' | 'file' }) {
  const paths = {
    folder: <><path d="M3.5 6.5h6l1.6 1.8h9.4v9.2a2 2 0 0 1-2 2h-15a2 2 0 0 1-2-2v-11a2 2 0 0 1 2-2Z" /><path d="M2.5 8.3h18" /></>,
    tag: <><path d="m3.5 4.5 7.7.2 8.1 8.1a2 2 0 0 1 0 2.8l-3.7 3.7a2 2 0 0 1-2.8 0L4.7 11.2l-1.2-6.7Z" /><circle cx="8" cy="8.2" r="1.2" /></>,
    file: <><path d="M6 2.8h8l4 4v14.4H6a2 2 0 0 1-2-2V4.8a2 2 0 0 1 2-2Z" /><path d="M14 2.8v4h4M8 12h8M8 16h6" /></>,
  }[kind];
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">{paths}</svg>;
}

function SalesTableSkeleton({ columns = 5 }: { columns?: number }) {
  return (
    <tr aria-label="جاري تحميل بيانات المبيعات">
      <td colSpan={columns} className="p-4">
        <div className="space-y-3 animate-pulse" aria-hidden="true">
          {[0, 1, 2].map((row) => (
            <div key={row} className="grid grid-cols-5 gap-3">
              {[0, 1, 2, 3, 4].map((cell) => (
                <span key={cell} className="h-4 rounded bg-gray-200" />
              ))}
            </div>
          ))}
        </div>
      </td>
    </tr>
  );
}

export default function SalesPage() {
  const { t } = useLanguage();
  useEffect(() => {
    markSalesLoadStage('route-mounted');
    // Same opt-in instrumentation used by the other initial-load paths.
    // It neither awaits nor changes the sales query lifecycle.
    markPageLoad('page-data-start');
  }, []);
  const router = useRouter();
  const [tab, setTab] = useState<TabId>('sales');
  const [limit, setLimit] = useState(LIST_PAGE_SIZE);
  const includeRelatedData = tab === 'documents' || tab === 'contracts' || tab === 'credit';
  const { clients: allClients, documents, contracts, returns, loading, refresh, mutate: mutateSalesBundle } =
    useSalesBundle(limit, includeRelatedData);

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [contractClient, setContractClient] = useState<ClientRecord | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [printError, setPrintError] = useState<string | null>(null);

  const handlePrintQuotation = useCallback(async (client: ClientRecord) => {
    const hydrated = mergeLocalClientOverrides(client);
    const validationError = validateSavedQuotationForPrint(hydrated);
    if (validationError) {
      setPrintError(validationError);
      return;
    }
    setPrintError(null);
    const result = await printSavedQuotation(hydrated);
    if (result.error) setPrintError(result.error);
  }, []);

  const handleRefresh = useCallback(async () => {
    await invalidateErpLists();
    await refresh();
  }, [refresh]);

  const handleClientUpdated = useCallback(async (updatedClient?: ClientRecord) => {
    if (!updatedClient) {
      await handleRefresh();
      return;
    }
    await mutateSalesBundle((current) => {
      if (!current) return current;
      return {
        ...current,
        clients: current.clients.map((client) =>
          client.id === updatedClient.id ? { ...client, ...updatedClient } : client
        ),
      };
    }, { revalidate: false });
  }, [handleRefresh, mutateSalesBundle]);

  // The list query can return a stale row immediately after a modal save. Merge the
  // durable local fallback fields before deriving rows, maps, or reopening modals.
  const hydratedClients = useMemo(
    () => allClients.map((client) => mergeLocalClientOverrides(client)),
    [allClients]
  );

  const salesClients = useMemo(() => hydratedClients.filter(shouldShowInSales), [hydratedClients]);

  useEffect(() => {
    markSalesLoadStage('local-overrides-merged');
  }, [hydratedClients]);

  const clients = useMemo(
    () => salesClients.filter((c) => inDateRange(c.created_at, dateFrom, dateTo)),
    [salesClients, dateFrom, dateTo]
  );

  useEffect(() => {
    // `loading` becomes false only after the initial sales list has resolved.
    // Mark after the derived list is available, never for the shell or skeleton.
    if (tab !== 'sales' || loading) return;
    markPageLoad('page-data-ready');
    markPageLoad('first-usable');
  }, [tab, loading, clients]);

  const filteredDocuments = useMemo(
    () => documents.filter((doc) => inDateRange(doc.created_at, dateFrom, dateTo)),
    [documents, dateFrom, dateTo]
  );

  useEffect(() => {
    markSalesLoadStage('derived-lists-ready');
  }, [clients, filteredDocuments]);

  useEffect(() => {
    if (!loading) {
      markSalesLoadStage('first-usable-table');
      markSalesLoadStage('fully-interactive');
    }
  }, [loading]);

  const clientMap = useMemo(() => new Map(hydratedClients.map((c) => [c.id, c])), [hydratedClients]);

  const handleAdd = async (formData: ClientFormData) => {
    setIsSubmitting(true);
    setErrorMessage(null);
    const clientCode = await nextClientCode();
    const { error } = await insertClientSafe({
      client_code: clientCode,
      name: formData.business_name || formData.owner_name,
      owner_name: formData.owner_name,
      phone: formData.phone,
      region: formData.region,
      city: formData.city,
      district: formData.district,
      street: formData.street,
      plot_number: formData.plot_number || null,
      national_address: formData.national_address || null,
      business_name: formData.business_name,
      activity_type: formData.activity_type,
      land_area: parseLocalizedNumber(formData.land_area),
      building_area: parseLocalizedNumber(formData.building_area),
      floors_count: parseLocalizedInteger(formData.floors_count),
      floor_levels: formData.floor_levels || [],
      project_status: formData.project_status,
      pipeline_stage: 'sales',
      sales_payment_type: 'نقدي',
      financial_status: 'بانتظار الدفعة',
      engineering_status: 'جديد',
      quotation_status: 'مسودة',
      quotation_visits_count: 1,
      quotation_services: [],
      visit_status: 'لم تُجدول',
      final_report_status: 'قيد الإعداد',
    });
    setIsSubmitting(false);
    if (error) {
      setErrorMessage(error);
      return;
    }
    void logActivity({
      actionType: 'CREATE',
      module: 'sales',
      pageUrl: '/sales',
      details: `تم إنشاء عميل/عرض: ${formData.business_name || formData.owner_name}`,
    });
    setIsAddOpen(false);
    await handleRefresh();
  };

  const archiveDocument = async (client: ClientRecord, type: 'quotation' | 'invoice') => {
    const subtotal = Number(client.quotation_amount || 0);
    if (subtotal <= 0) return alert('لا يوجد مبلغ للأرشفة');
    const docNumber =
      type === 'quotation'
        ? client.quotation_number || (await generateSalesDocNumber('quotation'))
        : await generateSalesDocNumber('invoice');
    await supabase.from('sales_documents').insert({
      client_id: client.id,
      doc_type: type,
      doc_number: docNumber,
      subtotal,
      vat_amount: Number(client.vat_amount || calculateVatAmount(subtotal)),
      total_amount: Number(client.total_amount || calculateTotalAmount(subtotal)),
      status: client.quotation_status || 'مسودة',
      archived: true,
    });
    void logActivity({
      actionType: 'ARCHIVE',
      module: 'sales',
      pageUrl: '/sales',
      details:
        type === 'quotation'
          ? `تم أرشفة عرض سعر رقم ${docNumber}`
          : `تم أرشفة فاتورة رقم ${docNumber}`,
      metadata: { docNumber, clientId: client.id, type },
    });
    await handleRefresh();
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">{t('sales.title')}</h1>
          <p className="text-sm text-gray-500">{t('sales.subtitle')}</p>
        </div>
        <button
          type="button"
          onClick={() => setIsAddOpen(true)}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold"
        >
          {t('sales.create')}
        </button>
      </div>

      <div className="bg-white border border-[#e5e7eb] rounded-xl p-3">
        <div className="date-range-bar">
          <label className="date-field">
            <span>من تاريخ</span>
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </label>
          <label className="date-field">
            <span>إلى تاريخ</span>
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </label>
          {(dateFrom || dateTo) && (
            <button
              type="button"
              onClick={() => {
                setDateFrom('');
                setDateTo('');
              }}
              className="date-clear"
            >
              مسح الفترة
            </button>
          )}
        </div>
      </div>

      <ModuleSubNavSlot label={t('subnav.sales')}>
        <ModuleTabBar
          ariaLabel={t('subnav.sales')}
          activeId={tab}
          onChange={(id) => setTab(id as TabId)}
          activeClassName="bg-blue-600 text-white shadow-sm"
          idleClassName="bg-white border border-gray-200 text-gray-800"
          items={[
            { id: 'sales', label: t('sales.tab.sales') },
            { id: 'quotations', label: t('sales.tab.quotations') },
            { id: 'documents', label: t('sales.tab.documents') },
            { id: 'credit', label: t('sales.tab.credit') },
            { id: 'contracts', label: t('sales.tab.contracts') },
            { id: 'tax-invoices', label: t('sales.tab.taxInvoices') },
            { id: 'accounts', label: t('sales.tab.accounts') },
          ]}
        />
      </ModuleSubNavSlot>

      {tab === 'sales' && (
        <ResponsiveTable className="bg-white rounded-xl border">
          <table className="w-full text-right text-sm table-as-cards">
            <thead className="bg-gray-50 border-b text-gray-600">
              <tr>
                <th className="p-4">العميل</th>
                <th className="p-4">الحالة</th>
                <th className="p-4">نوع البيع</th>
                <th className="p-4">المبلغ</th>
                <th className="p-4">إجراء</th>
              </tr>
            </thead>
            <tbody>
              {loading ? <SalesTableSkeleton /> : clients.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-gray-400">
                    لا يوجد عملاء في هذه الفترة
                  </td>
                </tr>
              ) : (
                clients.map((c) => (
                  <tr key={c.id} className="border-b hover:bg-gray-50">
                    <td className="p-4" data-label="العميل">
                      <div className="font-semibold">{c.business_name}</div>
                      <div className="text-xs text-gray-400">
                        {ACTIVITY_RULES[c.activity_type || '']?.label}
                      </div>
                    </td>
                    <td className="p-4" data-label="الحالة">
                      {c.quotation_status || c.financial_status || '—'}
                    </td>
                    <td className="p-4" data-label="نوع البيع">
                      {c.sales_payment_type || 'نقدي'}
                    </td>
                    <td className="p-4 font-mono" data-label="المبلغ">
                      {formatCurrency(Number(c.total_amount || 0))}
                    </td>
                    <td className="p-4" data-label="إجراء">
                      <RowActionsMenu
                        items={[
                          {
                            id: 'basic-data',
                            label: 'البيانات الأساسية',
                            onClick: () => router.push(`/sales/client-basic-data?clientId=${encodeURIComponent(c.id)}`),
                            tone: 'primary',
                            icon: <ActionIcon kind="folder" />,
                          },
                          {
                            id: 'quotation',
                            label: 'عرض السعر',
                            onClick: () => router.push(`/sales/client-quotation?clientId=${encodeURIComponent(c.id)}`),
                            tone: 'primary',
                            icon: <ActionIcon kind="tag" />,
                          },
                          {
                            id: 'contract',
                            label: 'عقد',
                            onClick: () => setContractClient(c),
                            tone: 'success',
                            icon: <ActionIcon kind="file" />,
                          },
                        ]}
                      />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </ResponsiveTable>
      )}

      {tab === 'quotations' && (
        <ResponsiveTable className="bg-white rounded-xl border">
          <table className="w-full text-right text-sm table-as-cards">
            <thead className="bg-gray-50 border-b text-gray-600">
              <tr>
                <th className="p-4">العميل</th>
                <th className="p-4">رقم العرض</th>
                <th className="p-4">حالة العرض</th>
                <th className="p-4">الإجمالي</th>
                <th className="p-4">إجراء</th>
              </tr>
            </thead>
            <tbody>
              {loading ? <SalesTableSkeleton /> : clients.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-gray-400">
                    لا توجد عروض في هذه الفترة
                  </td>
                </tr>
              ) : (
                clients.map((c) => (
                  <tr key={c.id} className="border-b hover:bg-gray-50">
                    <td className="p-4" data-label="العميل">
                      <div className="font-semibold">{c.business_name}</div>
                      <div className="text-xs text-gray-400">{c.phone}</div>
                    </td>
                    <td className="p-4 text-blue-600" data-label="رقم العرض">
                      <span className="doc-number font-mono">{c.quotation_number || '—'}</span>
                    </td>
                    <td className="p-4" data-label="حالة العرض">
                      {c.quotation_status || 'مسودة'}
                    </td>
                    <td className="p-4 font-mono" data-label="الإجمالي">
                      {formatCurrency(Number(c.total_amount || 0))}
                    </td>
                    <td className="p-4" data-label="إجراء">
                      <RowActionsMenu
                        items={[
                          {
                            id: 'quotation',
                            label: 'تحرير العرض',
                            onClick: () => router.push(`/sales/client-quotation?clientId=${encodeURIComponent(c.id)}`),
                            tone: 'primary',
                          },
                          {
                            id: 'basic-data',
                            label: 'البيانات الأساسية',
                            onClick: () => router.push(`/sales/client-basic-data?clientId=${encodeURIComponent(c.id)}`),
                            tone: 'primary',
                          },
                          {
                            id: 'print',
                            label: 'طباعة عرض',
                            onClick: () => void handlePrintQuotation(c),
                            tone: 'primary',
                          },
                          {
                            id: 'archive',
                            label: 'أرشفة',
                            onClick: () => void archiveDocument(c, 'quotation'),
                          },
                        ]}
                      />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </ResponsiveTable>
      )}

      {tab === 'documents' && (
        <ResponsiveTable className="bg-white rounded-xl border">
          <table className="w-full text-right text-sm">
            <thead className="bg-gray-50 border-b text-xs text-gray-500">
              <tr>
                <th className="p-3">رقم</th>
                <th className="p-3">النوع</th>
                <th className="p-3">الإجمالي</th>
                <th className="p-3">الحالة</th>
                <th className="p-3">طباعة</th>
              </tr>
            </thead>
            <tbody>
              {filteredDocuments.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-gray-400">
                    لا توجد مستندات في هذه الفترة
                  </td>
                </tr>
              ) : (
                filteredDocuments.map((doc) => {
                  const c = clientMap.get(doc.client_id);
                  const finDoc: FinancialDocument | null = c
                    ? {
                        ...clientToFinancialDocument(c, {
                          documentType: doc.doc_type,
                          documentNumber: doc.doc_number,
                          createdAt: doc.created_at || c.created_at,
                        }),
                        id: doc.id,
                        subtotal: doc.subtotal,
                        vatAmount: doc.vat_amount,
                        totalAmount: doc.total_amount,
                        status: doc.status,
                        paidAmount: Number(c.paid_amount || 0),
                      }
                    : null;
                  return (
                    <tr key={doc.id} className="border-b">
                      <td className="p-3">
                        <span className="doc-number font-mono">{doc.doc_number}</span>
                      </td>
                      <td className="p-3">{doc.doc_type === 'quotation' ? 'عرض سعر' : 'فاتورة'}</td>
                      <td className="p-3 font-mono">{formatCurrency(doc.total_amount)}</td>
                      <td className="p-3">{doc.status}</td>
                      <td className="p-3">
                        {finDoc && (
                          <button
                            type="button"
                            onClick={() => void printFinancialDocLazy(finDoc)}
                            className="touch-target text-xs text-blue-600 px-2"
                          >
                            طباعة
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </ResponsiveTable>
      )}

      {tab === 'credit' && (
        <CreditReturnsTab clients={clients} returns={returns} onRefresh={() => void handleRefresh()} />
      )}

      {tab === 'contracts' && (
        <ResponsiveTable className="bg-white rounded-xl border">
          <table className="w-full text-right text-sm">
            <thead className="bg-gray-50 border-b text-xs">
              <tr>
                <th className="p-3">رقم العقد</th>
                <th className="p-3">عرض السعر</th>
                <th className="p-3">الإجمالي</th>
                <th className="p-3">الحالة</th>
                <th className="p-3">طباعة</th>
              </tr>
            </thead>
            <tbody>
              {contracts.map((ct) => {
                const c = clientMap.get(ct.client_id);
                return (
                  <tr key={ct.id} className="border-b">
                    <td className="p-3">
                      <span className="doc-number font-mono">{ct.contract_number}</span>
                    </td>
                    <td className="p-3">
                      <span className="doc-number font-mono">{ct.quotation_number || '—'}</span>
                    </td>
                    <td className="p-3 font-mono">{formatCurrency(ct.total_amount)}</td>
                    <td className="p-3">{ct.status}</td>
                    <td className="p-3">
                      {c && (
                        <button
                          type="button"
                          onClick={() => void printContractLazy(ct, c)}
                          className="touch-target text-xs text-blue-600 px-2"
                        >
                          طباعة
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </ResponsiveTable>
      )}

      {tab === 'tax-invoices' && <TaxInvoicesPanel clients={hydratedClients} />}

      {tab === 'accounts' && (
        <div className="grid gap-4">
          {clients.map((c) => (
            <div key={c.id} className="bg-white border rounded-xl p-4">
              <div className="flex justify-between items-start">
                <div>
                  <p className="font-bold">{c.business_name || c.name}</p>
                  <p className="text-xs text-gray-500">{c.client_code}</p>
                </div>
                <span className="text-sm font-mono">{formatCurrency(Number(c.total_amount || 0))}</span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3 text-sm">
                <div>
                  <span className="text-gray-400 text-xs">مدفوع</span>
                  <p className="font-mono">{formatCurrency(Number(c.paid_amount || 0))}</p>
                </div>
                <div>
                  <span className="text-gray-400 text-xs">آجل</span>
                  <p>{c.sales_payment_type || 'نقدي'}</p>
                </div>
                <div>
                  <span className="text-gray-400 text-xs">رصيد مستحق</span>
                  <p className="font-mono text-rose-600">
                    {formatCurrency(Number(c.credit_balance || 0))}
                  </p>
                </div>
                <div>
                  <span className="text-gray-400 text-xs">المالية</span>
                  <p>{c.financial_status}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {(tab === 'sales' || tab === 'quotations' || tab === 'accounts') &&
        allClients.length >= limit && (
          <button
            type="button"
            onClick={() => setLimit((n) => n + LIST_PAGE_SIZE)}
            className="w-full py-2.5 rounded-xl border text-sm font-semibold text-blue-700 bg-white hover:bg-blue-50"
          >
            تحميل المزيد ({LIST_PAGE_SIZE})
          </button>
        )}

      {printError ? (
        <div role="alert" className="fixed bottom-4 right-4 z-50 max-w-md rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 shadow-lg">
          {printError}
          <button type="button" onClick={() => setPrintError(null)} className="mr-3 font-semibold underline">إغلاق</button>
        </div>
      ) : null}

      {isAddOpen ? (
        <AddClientModal
          isOpen={isAddOpen}
          isSubmitting={isSubmitting}
          errorMessage={errorMessage}
          onClose={() => setIsAddOpen(false)}
          onSubmit={handleAdd}
        />
      ) : null}
      {contractClient ? (
        <ContractModal
          client={contractClient}
          onClose={() => setContractClient(null)}
          onCreated={() => void handleRefresh()}
        />
      ) : null}
    </div>
  );
}

function CreditReturnsTab({
  clients,
  returns,
  onRefresh,
}: {
  clients: ClientRecord[];
  returns: SalesReturn[];
  onRefresh: () => void;
}) {
  const [clientId, setClientId] = useState('');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');

  const createReturn = async () => {
    if (!clientId || parseLocalizedNumber(amount) <= 0) return;
    const returnNumber = await generateReturnNumber();
    await supabase.from('sales_returns').insert({
      client_id: clientId,
      return_number: returnNumber,
      amount: parseLocalizedNumber(amount),
      reason,
      status: 'معتمد',
    });
    setAmount('');
    setReason('');
    onRefresh();
  };

  const setCredit = async (client: ClientRecord) => {
    const balance = Math.max(0, Number(client.total_amount || 0) - Number(client.paid_amount || 0));
    await supabase
      .from('clients')
      .update({ sales_payment_type: 'آجل', credit_balance: balance })
      .eq('id', client.id);
    onRefresh();
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
      <div className="bg-white border rounded-xl p-4">
        <h3 className="font-bold mb-3">مبيعات آجلة</h3>
        <div className="space-y-2">
          {clients.map((c) => (
            <div key={c.id} className="flex justify-between items-center p-2 bg-gray-50 rounded-lg text-sm">
              <span>{c.business_name || c.name}</span>
              <button
                type="button"
                onClick={() => void setCredit(c)}
                className="text-xs px-2 py-1 bg-amber-100 text-amber-800 rounded-lg"
              >
                تحويل لآجل
              </button>
            </div>
          ))}
        </div>
      </div>
      <div className="bg-white border rounded-xl p-4">
        <h3 className="font-bold mb-3">مرتجعات المبيعات</h3>
        <div className="space-y-2 mb-3">
          <select
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            className="w-full p-2 border rounded-lg text-sm"
          >
            <option value="">اختر العميل</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.business_name || c.name}
              </option>
            ))}
          </select>
          <input
            placeholder="المبلغ"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full p-2 border rounded-lg text-sm font-mono"
          />
          <input
            placeholder="السبب"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="w-full p-2 border rounded-lg text-sm"
          />
          <button
            type="button"
            onClick={() => void createReturn()}
            className="w-full py-2 bg-rose-600 text-white rounded-lg text-sm"
          >
            تسجيل مرتجع
          </button>
        </div>
        {returns.map((r) => (
          <div key={r.id} className="text-sm p-2 border-b">
            {r.return_number} — {formatCurrency(r.amount)} — {r.reason}
          </div>
        ))}
      </div>
    </div>
  );
}
