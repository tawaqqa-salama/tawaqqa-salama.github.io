'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { ACTIVITY_RULES } from '@/lib/constants/clients';
import { shouldShowInSales } from '@/lib/business/pipeline';
import { calculateTotalAmount, calculateVatAmount } from '@/lib/business/client-workflow';
import { generateReturnNumber, generateSalesDocNumber } from '@/lib/constants/modules';
import { nextClientCode } from '@/lib/business/document-numbers';
import AddClientModal from '@/components/clients/AddClientModal';
import ClientDetailModal from '@/components/clients/ClientDetailModal';
import ContractModal from '@/components/sales/ContractModal';
import PrintQuotationModal from '@/components/sales/PrintQuotationModal';
import { printContract } from '@/components/sales/ContractPrint';
import { printFinancialDocument } from '@/components/invoices/FinancialDocumentPrint';
import { clientToFinancialDocument } from '@/lib/invoices/document-mapper';
import { formatCurrency } from '@/lib/format/currency';
import { parseLocalizedInteger, parseLocalizedNumber } from '@/lib/validation/client';
import ResponsiveTable from '@/components/ui/ResponsiveTable';
import RowActionsMenu from '@/components/ui/RowActionsMenu';
import ModuleSubNavSlot from '@/components/layout/ModuleSubNavSlot';
import { insertClientSafe, mergeLocalClientOverrides } from '@/lib/supabase/safe-client-write';
import type { ClientFormData, ClientRecord, FinancialDocument } from '@/lib/types/client';
import type { SalesContract, SalesDocument, SalesReturn } from '@/lib/types/sales';

type TabId = 'clients' | 'documents' | 'credit' | 'contracts' | 'accounts';

function inDateRange(iso: string | undefined | null, from: string, to: string): boolean {
  if (!from && !to) return true;
  if (!iso) return false;
  const day = iso.slice(0, 10);
  if (from && day < from) return false;
  if (to && day > to) return false;
  return true;
}

export default function SalesPage() {
  const [tab, setTab] = useState<TabId>('clients');
  const [allClients, setAllClients] = useState<ClientRecord[]>([]);
  const [documents, setDocuments] = useState<SalesDocument[]>([]);
  const [contracts, setContracts] = useState<SalesContract[]>([]);
  const [returns, setReturns] = useState<SalesReturn[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [selected, setSelected] = useState<ClientRecord | null>(null);
  const [contractClient, setContractClient] = useState<ClientRecord | null>(null);
  const [printClient, setPrintClient] = useState<ClientRecord | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const fetchAll = async () => {
    setLoading(true);
    const [clientsRes, docsRes, contractsRes, returnsRes] = await Promise.all([
      supabase.from('clients').select('*').order('created_at', { ascending: false }),
      supabase.from('sales_documents').select('*').order('created_at', { ascending: false }),
      supabase.from('sales_contracts').select('*').order('created_at', { ascending: false }),
      supabase.from('sales_returns').select('*').order('created_at', { ascending: false }),
    ]);
    setAllClients(
      ((clientsRes.data || []) as ClientRecord[]).map((row) => mergeLocalClientOverrides(row))
    );
    setDocuments((docsRes.data || []) as SalesDocument[]);
    setContracts((contractsRes.data || []) as SalesContract[]);
    setReturns((returnsRes.data || []) as SalesReturn[]);
    setLoading(false);
  };

  useEffect(() => {
    fetchAll();
  }, []);

  const salesClients = useMemo(
    () => allClients.filter(shouldShowInSales),
    [allClients]
  );

  const clients = useMemo(
    () => salesClients.filter((c) => inDateRange(c.created_at, dateFrom, dateTo)),
    [salesClients, dateFrom, dateTo]
  );

  const filteredDocuments = useMemo(
    () => documents.filter((doc) => inDateRange(doc.created_at, dateFrom, dateTo)),
    [documents, dateFrom, dateTo]
  );

  const clientMap = useMemo(() => new Map(allClients.map((c) => [c.id, c])), [allClients]);

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
    if (error) { setErrorMessage(error); return; }
    setIsAddOpen(false);
    fetchAll();
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
    fetchAll();
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">إدارة المبيعات</h1>
          <p className="text-sm text-gray-500">عروض الأسعار، الفواتير، العقود، الآجل والمرتجعات</p>
        </div>
        <button onClick={() => setIsAddOpen(true)} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold">+ عميل / عرض</button>
      </div>

      <div className="bg-white border border-[#e5e7eb] rounded-xl p-3">
        <div className="date-range-bar">
          <label className="date-field">
            <span>من تاريخ</span>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
            />
          </label>
          <label className="date-field">
            <span>إلى تاريخ</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
            />
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

      <ModuleSubNavSlot label="تبويبات المبيعات">
        <div id="module-subnav" className="flex flex-wrap gap-2">
          {([
            { id: 'clients' as const, label: 'العملاء والعروض' },
            { id: 'documents' as const, label: 'أرشيف المستندات' },
            { id: 'credit' as const, label: 'الآجل والمرتجعات' },
            { id: 'contracts' as const, label: 'العقود' },
            { id: 'accounts' as const, label: 'حساب العميل الشامل' },
          ]).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`px-3 py-2 rounded-lg text-sm font-semibold ${tab === t.id ? 'bg-blue-600 text-white' : 'bg-white border'}`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </ModuleSubNavSlot>

      {tab === 'clients' && (
        <ResponsiveTable className="bg-white rounded-xl border">
          <table className="w-full text-right text-sm table-as-cards">
            <thead className="bg-gray-50 border-b text-gray-600"><tr><th className="p-4">العميل</th><th className="p-4">عرض السعر</th><th className="p-4">الحالة</th><th className="p-4">نوع البيع</th><th className="p-4">إجراء</th></tr></thead>
            <tbody>
              {loading ? <tr><td colSpan={5} className="p-8 text-center text-gray-400">...</td></tr> : clients.length === 0 ? (
                <tr><td colSpan={5} className="p-8 text-center text-gray-400">لا يوجد عملاء في هذه الفترة</td></tr>
              ) : clients.map((c) => (
                <tr key={c.id} className="border-b hover:bg-gray-50">
                  <td className="p-4" data-label="العميل"><div className="font-semibold">{c.business_name}</div><div className="text-xs text-gray-400">{ACTIVITY_RULES[c.activity_type || '']?.label}</div></td>
                  <td className="p-4 text-blue-600" data-label="عرض السعر">
                    <span className="doc-number font-mono">{c.quotation_number || '—'}</span>
                  </td>
                  <td className="p-4" data-label="الحالة">{c.quotation_status}</td>
                  <td className="p-4" data-label="نوع البيع">{c.sales_payment_type || 'نقدي'}</td>
                  <td className="p-4" data-label="إجراء">
                    <RowActionsMenu
                      items={[
                        { id: 'manage', label: 'إدارة', onClick: () => setSelected(c), tone: 'primary' },
                        { id: 'print', label: 'طباعة عرض', onClick: () => setPrintClient(c), tone: 'primary' },
                        { id: 'archive', label: 'أرشفة', onClick: () => void archiveDocument(c, 'quotation') },
                        { id: 'contract', label: 'عقد', onClick: () => setContractClient(c), tone: 'success' },
                      ]}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </ResponsiveTable>
      )}

      {tab === 'documents' && (
        <ResponsiveTable className="bg-white rounded-xl border">
          <table className="w-full text-right text-sm">
            <thead className="bg-gray-50 border-b text-xs text-gray-500"><tr><th className="p-3">رقم</th><th className="p-3">النوع</th><th className="p-3">الإجمالي</th><th className="p-3">الحالة</th><th className="p-3">طباعة</th></tr></thead>
            <tbody>
              {filteredDocuments.length === 0 ? (
                <tr><td colSpan={5} className="p-8 text-center text-gray-400">لا توجد مستندات في هذه الفترة</td></tr>
              ) : filteredDocuments.map((doc) => {
                const c = clientMap.get(doc.client_id);
                const finDoc: FinancialDocument | null = c ? {
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
                } : null;
                return (
                  <tr key={doc.id} className="border-b">
                    <td className="p-3"><span className="doc-number font-mono">{doc.doc_number}</span></td>
                    <td className="p-3">{doc.doc_type === 'quotation' ? 'عرض سعر' : 'فاتورة'}</td>
                    <td className="p-3 font-mono">{formatCurrency(doc.total_amount)}</td>
                    <td className="p-3">{doc.status}</td>
                    <td className="p-3">{finDoc && <button onClick={() => void printFinancialDocument(finDoc)} className="touch-target text-xs text-blue-600 px-2">طباعة</button>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </ResponsiveTable>
      )}

      {tab === 'credit' && (
        <CreditReturnsTab clients={clients} returns={returns} onRefresh={fetchAll} />
      )}

      {tab === 'contracts' && (
        <ResponsiveTable className="bg-white rounded-xl border">
          <table className="w-full text-right text-sm">
            <thead className="bg-gray-50 border-b text-xs"><tr><th className="p-3">رقم العقد</th><th className="p-3">عرض السعر</th><th className="p-3">الإجمالي</th><th className="p-3">الحالة</th><th className="p-3">طباعة</th></tr></thead>
            <tbody>
              {contracts.map((ct) => {
                const c = clientMap.get(ct.client_id);
                return (
                  <tr key={ct.id} className="border-b">
                    <td className="p-3"><span className="doc-number font-mono">{ct.contract_number}</span></td>
                    <td className="p-3"><span className="doc-number font-mono">{ct.quotation_number || '—'}</span></td>
                    <td className="p-3 font-mono">{formatCurrency(ct.total_amount)}</td>
                    <td className="p-3">{ct.status}</td>
                    <td className="p-3">{c && <button onClick={() => void printContract(ct, c)} className="touch-target text-xs text-blue-600 px-2">طباعة</button>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </ResponsiveTable>
      )}

      {tab === 'accounts' && (
        <div className="grid gap-4">
          {clients.map((c) => (
            <div key={c.id} className="bg-white border rounded-xl p-4">
              <div className="flex justify-between items-start">
                <div><p className="font-bold">{c.business_name || c.name}</p><p className="text-xs text-gray-500">{c.client_code}</p></div>
                <span className="text-sm font-mono">{formatCurrency(Number(c.total_amount || 0))}</span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3 text-sm">
                <div><span className="text-gray-400 text-xs">مدفوع</span><p className="font-mono">{formatCurrency(Number(c.paid_amount || 0))}</p></div>
                <div><span className="text-gray-400 text-xs">آجل</span><p>{c.sales_payment_type || 'نقدي'}</p></div>
                <div><span className="text-gray-400 text-xs">رصيد مستحق</span><p className="font-mono text-rose-600">{formatCurrency(Number(c.credit_balance || 0))}</p></div>
                <div><span className="text-gray-400 text-xs">المالية</span><p>{c.financial_status}</p></div>
              </div>
            </div>
          ))}
        </div>
      )}

      <AddClientModal isOpen={isAddOpen} isSubmitting={isSubmitting} errorMessage={errorMessage} onClose={() => setIsAddOpen(false)} onSubmit={handleAdd} />
      <ClientDetailModal client={selected} department="sales" onClose={() => setSelected(null)} onUpdated={fetchAll} />
      <ContractModal client={contractClient} onClose={() => setContractClient(null)} onCreated={fetchAll} />
      <PrintQuotationModal client={printClient} onClose={() => setPrintClient(null)} onSaved={fetchAll} />
    </div>
  );
}

function CreditReturnsTab({ clients, returns, onRefresh }: { clients: ClientRecord[]; returns: SalesReturn[]; onRefresh: () => void }) {
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
    await supabase.from('clients').update({ sales_payment_type: 'آجل', credit_balance: balance }).eq('id', client.id);
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
              <button onClick={() => setCredit(c)} className="text-xs px-2 py-1 bg-amber-100 text-amber-800 rounded-lg">تحويل لآجل</button>
            </div>
          ))}
        </div>
      </div>
      <div className="bg-white border rounded-xl p-4">
        <h3 className="font-bold mb-3">مرتجعات المبيعات</h3>
        <div className="space-y-2 mb-3">
          <select value={clientId} onChange={(e) => setClientId(e.target.value)} className="w-full p-2 border rounded-lg text-sm">
            <option value="">اختر العميل</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.business_name || c.name}</option>)}
          </select>
          <input placeholder="المبلغ" value={amount} onChange={(e) => setAmount(e.target.value)} className="w-full p-2 border rounded-lg text-sm font-mono" />
          <input placeholder="السبب" value={reason} onChange={(e) => setReason(e.target.value)} className="w-full p-2 border rounded-lg text-sm" />
          <button onClick={createReturn} className="w-full py-2 bg-rose-600 text-white rounded-lg text-sm">تسجيل مرتجع</button>
        </div>
        {returns.map((r) => (
          <div key={r.id} className="text-sm p-2 border-b">{r.return_number} — {formatCurrency(r.amount)} — {r.reason}</div>
        ))}
      </div>
    </div>
  );
}
