'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { formatCurrency } from '@/lib/format/currency';
import ModuleSubNavSlot from '@/components/layout/ModuleSubNavSlot';
import ModuleTabBar from '@/components/layout/ModuleTabBar';
import ResponsiveTable from '@/components/ui/ResponsiveTable';
import NumericInput from '@/components/ui/NumericInput';
import { useLanguage } from '@/lib/i18n/LanguageProvider';
import {
  createRfqFromProjectBoq,
  listPurchaseOrders,
  listRfqs,
  listVendors,
  upsertPurchaseOrder,
  upsertRfq,
  upsertVendor,
} from '@/lib/procurement/service';
import {
  PO_STATUS_LABELS,
  PURCHASE_CATEGORY_LABELS,
  RFQ_STATUS_LABELS,
  VENDOR_TYPE_LABELS,
  type ProcurementLineItem,
  type ProcurementRfq,
  type ProcurementVendor,
  type PurchaseCategory,
  type PurchaseOrder,
  type VendorType,
} from '@/lib/types/procurement';
import type { ClientRecord } from '@/lib/types/client';
import { parseProjectEngineeringData } from '@/lib/business/project-reports';

type TabId = 'dashboard' | 'vendors' | 'subcontractors' | 'orders' | 'boq-rfq';

const emptyVendor = (type: VendorType): Partial<ProcurementVendor> & { name: string; vendor_type: VendorType } => ({
  name: '',
  vendor_type: type,
  specialty: '',
  phone: '',
  city: '',
  commercial_register: '',
  tax_number: '',
  certification_notes: '',
  status: 'active',
  notes: '',
});

export default function ProcurementModule() {
  const { t } = useLanguage();
  const searchParams = useSearchParams();
  const initialTab = (searchParams.get('tab') as TabId | null) || 'vendors';
  const [tab, setTab] = useState<TabId>(
    ['dashboard', 'vendors', 'subcontractors', 'orders', 'boq-rfq'].includes(initialTab) ? initialTab : 'dashboard'
  );
  const [vendors, setVendors] = useState<ProcurementVendor[]>([]);
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [rfqs, setRfqs] = useState<ProcurementRfq[]>([]);
  const [projects, setProjects] = useState<ClientRecord[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [vendorForm, setVendorForm] = useState(
    emptyVendor(initialTab === 'subcontractors' ? 'subcontractor' : 'supplier')
  );
  const [poForm, setPoForm] = useState({
    title: '',
    vendor_id: '',
    category: 'equipment' as PurchaseCategory,
    description: '',
    quantity: '1',
    unit_price: '0',
    notes: '',
  });
  const [rfqProjectId, setRfqProjectId] = useState('');
  const [rfqVendorId, setRfqVendorId] = useState('');

  useEffect(() => {
    const t = searchParams.get('tab') as TabId | null;
    if (t && ['dashboard', 'vendors', 'subcontractors', 'orders', 'boq-rfq'].includes(t)) {
      setTab(t);
      if (t === 'vendors') setVendorForm((f) => ({ ...f, vendor_type: 'supplier' }));
      if (t === 'subcontractors') setVendorForm((f) => ({ ...f, vendor_type: 'subcontractor' }));
    }
  }, [searchParams]);

  const refresh = useCallback(async (activeTab: TabId = tab) => {
    const tasks: Promise<unknown>[] = [];

    if (
      activeTab === 'vendors' ||
      activeTab === 'subcontractors' ||
      activeTab === 'orders' ||
      activeTab === 'boq-rfq'
    ) {
      tasks.push(listVendors('all').then((v) => setVendors(v)));
    }
    if (activeTab === 'orders') {
      tasks.push(listPurchaseOrders().then((o) => setOrders(o)));
    }
    if (activeTab === 'boq-rfq') {
      tasks.push(listRfqs().then((r) => setRfqs(r)));
      tasks.push(
        (async () => {
          const clientsRes = await supabase
            .from('clients')
            .select('id, business_name, name, client_code, project_engineering_data')
            .order('created_at', { ascending: false })
            .limit(20);
          setProjects((clientsRes.data || []) as ClientRecord[]);
        })()
      );
    }

    await Promise.all(tasks);
  }, [tab]);

  useEffect(() => {
    void refresh(tab);
  }, [refresh, tab]);

  const suppliers = useMemo(() => vendors.filter((v) => v.vendor_type === 'supplier'), [vendors]);
  const subcontractors = useMemo(
    () => vendors.filter((v) => v.vendor_type === 'subcontractor'),
    [vendors]
  );
  const vendorMap = useMemo(() => new Map(vendors.map((v) => [v.id, v])), [vendors]);

  const saveVendor = async () => {
    if (!vendorForm.name.trim()) {
      setMessage('اسم المورد / المقاول مطلوب');
      return;
    }
    setBusy(true);
    const result = await upsertVendor(vendorForm);
    setBusy(false);
    if (result.error) {
      setMessage(result.error);
      return;
    }
    setMessage(`تم حفظ ${VENDOR_TYPE_LABELS[vendorForm.vendor_type]}: ${result.vendor?.name}`);
    setVendorForm(emptyVendor(vendorForm.vendor_type));
    await refresh();
  };

  const saveOrder = async () => {
    if (!poForm.title.trim()) {
      setMessage('عنوان أمر الشراء مطلوب');
      return;
    }
    const qty = Number(poForm.quantity || 0);
    const price = Number(poForm.unit_price || 0);
    const line: ProcurementLineItem = {
      id: `li-${Date.now()}`,
      description: poForm.description || poForm.title,
      unit: 'وحدة',
      quantity: qty,
      unit_price: price,
      total: Math.round(qty * price * 100) / 100,
    };
    setBusy(true);
    const result = await upsertPurchaseOrder({
      title: poForm.title,
      vendor_id: poForm.vendor_id || null,
      category: poForm.category,
      status: 'submitted',
      line_items: [line],
      notes: poForm.notes || null,
    });
    setBusy(false);
    if (result.error) {
      setMessage(result.error);
      return;
    }
    setMessage(`تم إنشاء أمر الشراء ${result.order?.po_number}`);
    setPoForm({
      title: '',
      vendor_id: '',
      category: 'equipment',
      description: '',
      quantity: '1',
      unit_price: '0',
      notes: '',
    });
    await refresh();
  };

  const createBoqRfq = async () => {
    const project = projects.find((p) => p.id === rfqProjectId);
    if (!project) {
      setMessage('اختر مشروعاً يحتوي جدول كميات');
      return;
    }
    setBusy(true);
    const result = await createRfqFromProjectBoq(project, rfqVendorId || null);
    setBusy(false);
    if (result.error || !result.rfq) {
      setMessage(result.error || 'تعذر إنشاء RFQ');
      return;
    }
    setMessage(`تم إنشاء طلب تسعير ${result.rfq.rfq_number} من BOQ`);
    await refresh();
  };

  const openVendorEditor = (type: VendorType, vendor?: ProcurementVendor) => {
    setVendorForm(
      vendor
        ? { ...vendor }
        : emptyVendor(type)
    );
    setTab(type === 'supplier' ? 'vendors' : 'subcontractors');
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-900">{t('procurement.title')}</h1>
        <p className="text-sm text-gray-500 mt-1">{t('procurement.subtitle')}</p>
      </div>

      <ModuleSubNavSlot label={t('subnav.procurement')}>
        <ModuleTabBar
          ariaLabel={t('subnav.procurement')}
          activeId={tab}
          onChange={(id) => {
            const next = id as TabId;
            setTab(next);
            if (next === 'vendors') setVendorForm((f) => ({ ...f, vendor_type: 'supplier' }));
            if (next === 'subcontractors') setVendorForm((f) => ({ ...f, vendor_type: 'subcontractor' }));
          }}
          activeClassName="bg-[#635bdb] text-white shadow-sm"
          idleClassName="bg-white border border-gray-200 text-gray-800"
          items={[
            { id: 'dashboard', label: t('subnav.dashboard') },
            { id: 'vendors', label: t('procurement.tab.vendors') },
            { id: 'subcontractors', label: t('procurement.tab.subcontractors') },
            { id: 'orders', label: t('procurement.tab.orders') },
            { id: 'boq-rfq', label: t('procurement.tab.boqRfq') },
          ]}
        />
      </ModuleSubNavSlot>

      {tab === 'dashboard' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="rounded-xl border bg-white p-4">
            <p className="text-xs text-gray-500">{t('procurement.dashboard.vendors')}</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{vendors.length}</p>
          </div>
          <div className="rounded-xl border bg-white p-4">
            <p className="text-xs text-gray-500">{t('procurement.dashboard.orders')}</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{orders.length}</p>
          </div>
          <div className="rounded-xl border bg-white p-4">
            <p className="text-xs text-gray-500">{t('procurement.dashboard.rfqs')}</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{rfqs.length}</p>
          </div>
        </div>
      )}

      {message && (
        <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          {message}
        </div>
      )}

      {(tab === 'vendors' || tab === 'subcontractors') && (
        <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">
          <div className="xl:col-span-2 rounded-xl border bg-white p-4 space-y-3">
            <h2 className="font-bold text-gray-900">
              {tab === 'vendors' ? t('procurement.vendor.formTitle') : t('procurement.sub.formTitle')}
            </h2>
            <Field
              label={t('procurement.vendor.name')}
              value={vendorForm.name}
              onChange={(v) => setVendorForm({ ...vendorForm, name: v })}
            />
            <Field
              label={t('procurement.vendor.specialty')}
              value={vendorForm.specialty || ''}
              onChange={(v) => setVendorForm({ ...vendorForm, specialty: v })}
            />
            <div className="grid grid-cols-2 gap-2">
              <Field
                label={t('procurement.vendor.phone')}
                value={vendorForm.phone || ''}
                onChange={(v) => setVendorForm({ ...vendorForm, phone: v })}
              />
              <Field
                label={t('procurement.vendor.city')}
                value={vendorForm.city || ''}
                onChange={(v) => setVendorForm({ ...vendorForm, city: v })}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Field
                label={t('procurement.vendor.cr')}
                value={vendorForm.commercial_register || ''}
                onChange={(v) => setVendorForm({ ...vendorForm, commercial_register: v })}
              />
              <Field
                label={t('procurement.vendor.tax')}
                value={vendorForm.tax_number || ''}
                onChange={(v) => setVendorForm({ ...vendorForm, tax_number: v })}
              />
            </div>
            <Field
              label={t('procurement.vendor.certs')}
              value={vendorForm.certification_notes || ''}
              onChange={(v) => setVendorForm({ ...vendorForm, certification_notes: v })}
            />
            <button
              type="button"
              disabled={busy}
              onClick={() => void saveVendor()}
              className="w-full px-4 py-2.5 rounded-xl bg-[#635bdb] text-white text-sm font-semibold disabled:opacity-50"
            >
              {t('procurement.vendor.save')}
            </button>
          </div>

          <div className="xl:col-span-3">
            <ResponsiveTable className="bg-white rounded-xl border">
              <table className="w-full text-right text-sm table-as-cards">
                <thead className="bg-gray-50 border-b text-gray-600">
                  <tr>
                    <th className="p-3">{t('procurement.col.name')}</th>
                    <th className="p-3">{t('procurement.col.specialty')}</th>
                    <th className="p-3">{t('procurement.col.city')}</th>
                    <th className="p-3">{t('procurement.col.status')}</th>
                    <th className="p-3">{t('procurement.col.action')}</th>
                  </tr>
                </thead>
                <tbody>
                  {(tab === 'vendors' ? suppliers : subcontractors).map((v) => (
                    <tr key={v.id} className="border-b hover:bg-gray-50">
                      <td className="p-3" data-label={t('procurement.col.name')}>
                        <div className="font-semibold">{v.name}</div>
                        <div className="text-xs text-gray-400">{v.phone || '—'}</div>
                      </td>
                      <td className="p-3" data-label={t('procurement.col.specialty')}>
                        {v.specialty || '—'}
                      </td>
                      <td className="p-3" data-label={t('procurement.col.city')}>
                        {v.city || '—'}
                      </td>
                      <td className="p-3" data-label={t('procurement.col.status')}>
                        {v.status === 'active' ? t('procurement.status.active') : v.status}
                      </td>
                      <td className="p-3" data-label={t('procurement.col.action')}>
                        <button
                          type="button"
                          className="text-xs font-semibold text-[#635bdb] underline"
                          onClick={() => openVendorEditor(v.vendor_type, v)}
                        >
                          {t('procurement.action.edit')}
                        </button>
                      </td>
                    </tr>
                  ))}
                  {(tab === 'vendors' ? suppliers : subcontractors).length === 0 && (
                    <tr>
                      <td colSpan={5} className="p-8 text-center text-gray-400">
                        {t('procurement.empty.vendors')}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </ResponsiveTable>
          </div>
        </div>
      )}

      {tab === 'orders' && (
        <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">
          <div className="xl:col-span-2 rounded-xl border bg-white p-4 space-y-3">
            <h2 className="font-bold text-gray-900">{t('procurement.po.formTitle')}</h2>
            <Field
              label={t('procurement.po.title')}
              value={poForm.title}
              onChange={(v) => setPoForm({ ...poForm, title: v })}
            />
            <label className="block text-sm">
              <span className="text-xs font-semibold text-gray-600 mb-1 block">
                {t('procurement.po.category')}
              </span>
              <select
                value={poForm.category}
                onChange={(e) => setPoForm({ ...poForm, category: e.target.value as PurchaseCategory })}
                className="w-full border rounded-xl px-3 py-2.5 text-sm"
              >
                {Object.entries(PURCHASE_CATEGORY_LABELS).map(([id, label]) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="text-xs font-semibold text-gray-600 mb-1 block">
                {t('procurement.po.vendor')}
              </span>
              <select
                value={poForm.vendor_id}
                onChange={(e) => setPoForm({ ...poForm, vendor_id: e.target.value })}
                className="w-full border rounded-xl px-3 py-2.5 text-sm"
              >
                <option value="">—</option>
                {vendors.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
            </label>
            <Field
              label={t('procurement.po.itemDesc')}
              value={poForm.description}
              onChange={(v) => setPoForm({ ...poForm, description: v })}
            />
            <div className="grid grid-cols-2 gap-2">
              <label className="text-sm">
                <span className="text-xs font-semibold text-gray-600 mb-1 block">
                  {t('procurement.po.qty')}
                </span>
                <NumericInput
                  mode="decimal"
                  value={poForm.quantity}
                  onChange={(v) => setPoForm({ ...poForm, quantity: v })}
                  className="w-full border rounded-xl px-3 py-2.5 text-sm"
                />
              </label>
              <label className="text-sm">
                <span className="text-xs font-semibold text-gray-600 mb-1 block">
                  {t('procurement.po.unitPrice')}
                </span>
                <NumericInput
                  mode="decimal"
                  value={poForm.unit_price}
                  onChange={(v) => setPoForm({ ...poForm, unit_price: v })}
                  className="w-full border rounded-xl px-3 py-2.5 text-sm"
                />
              </label>
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={() => void saveOrder()}
              className="w-full px-4 py-2.5 rounded-xl bg-[#635bdb] text-white text-sm font-semibold disabled:opacity-50"
            >
              {t('procurement.po.create')}
            </button>
          </div>

          <div className="xl:col-span-3">
            <ResponsiveTable className="bg-white rounded-xl border">
              <table className="w-full text-right text-sm table-as-cards">
                <thead className="bg-gray-50 border-b text-gray-600">
                  <tr>
                    <th className="p-3">{t('procurement.po.col.number')}</th>
                    <th className="p-3">{t('procurement.po.col.title')}</th>
                    <th className="p-3">{t('procurement.po.col.vendor')}</th>
                    <th className="p-3">{t('procurement.po.col.total')}</th>
                    <th className="p-3">{t('procurement.po.col.status')}</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-8 text-center text-gray-400">
                        {t('procurement.po.empty')}
                      </td>
                    </tr>
                  ) : (
                    orders.map((o) => (
                      <tr key={o.id} className="border-b">
                        <td className="p-3 font-mono" data-label={t('procurement.po.col.number')}>
                          {o.po_number}
                        </td>
                        <td className="p-3" data-label={t('procurement.po.col.title')}>
                          <div className="font-semibold">{o.title}</div>
                          <div className="text-xs text-gray-400">
                            {PURCHASE_CATEGORY_LABELS[o.category] || o.category}
                          </div>
                        </td>
                        <td className="p-3" data-label={t('procurement.po.col.vendor')}>
                          {(o.vendor_id && vendorMap.get(o.vendor_id)?.name) || '—'}
                        </td>
                        <td className="p-3 font-mono" data-label={t('procurement.po.col.total')}>
                          {formatCurrency(o.total_amount)}
                        </td>
                        <td className="p-3" data-label={t('procurement.po.col.status')}>
                          {PO_STATUS_LABELS[o.status] || o.status}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </ResponsiveTable>
          </div>
        </div>
      )}

      {tab === 'boq-rfq' && (
        <div className="space-y-4">
          <div className="rounded-xl border border-indigo-100 bg-indigo-50 px-3 py-2 text-sm text-indigo-900">
            {t('procurement.rfq.hint')}
          </div>
          <div className="rounded-xl border bg-white p-4 grid grid-cols-1 md:grid-cols-3 gap-3">
            <label className="text-sm md:col-span-1">
              <span className="text-xs font-semibold text-gray-600 mb-1 block">
                {t('procurement.rfq.project')}
              </span>
              <select
                value={rfqProjectId}
                onChange={(e) => setRfqProjectId(e.target.value)}
                className="w-full border rounded-xl px-3 py-2.5 text-sm"
              >
                <option value="">{t('procurement.rfq.selectProject')}</option>
                {projects.map((p) => {
                  const boqCount = parseProjectEngineeringData(p.project_engineering_data).boq.items?.length || 0;
                  return (
                    <option key={p.id} value={p.id}>
                      {p.business_name || p.name} — BOQ: {boqCount} {t('procurement.rfq.boqItems')}
                    </option>
                  );
                })}
              </select>
            </label>
            <label className="text-sm">
              <span className="text-xs font-semibold text-gray-600 mb-1 block">
                {t('procurement.rfq.vendorOptional')}
              </span>
              <select
                value={rfqVendorId}
                onChange={(e) => setRfqVendorId(e.target.value)}
                className="w-full border rounded-xl px-3 py-2.5 text-sm"
              >
                <option value="">—</option>
                {vendors.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex items-end">
              <button
                type="button"
                disabled={busy}
                onClick={() => void createBoqRfq()}
                className="w-full px-4 py-2.5 rounded-xl bg-[#635bdb] text-white text-sm font-semibold disabled:opacity-50"
              >
                {t('procurement.rfq.convert')}
              </button>
            </div>
          </div>

          <ResponsiveTable className="bg-white rounded-xl border">
            <table className="w-full text-right text-sm table-as-cards">
              <thead className="bg-gray-50 border-b text-gray-600">
                <tr>
                  <th className="p-3">{t('procurement.rfq.col.number')}</th>
                  <th className="p-3">{t('procurement.rfq.col.title')}</th>
                  <th className="p-3">{t('procurement.rfq.col.items')}</th>
                  <th className="p-3">{t('procurement.rfq.col.vendor')}</th>
                  <th className="p-3">{t('procurement.rfq.col.status')}</th>
                  <th className="p-3">{t('procurement.rfq.col.action')}</th>
                </tr>
              </thead>
              <tbody>
                {rfqs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-gray-400">
                      {t('procurement.rfq.empty')}
                    </td>
                  </tr>
                ) : (
                  rfqs.map((r) => (
                    <tr key={r.id} className="border-b">
                      <td className="p-3 font-mono" data-label={t('procurement.rfq.col.number')}>
                        {r.rfq_number}
                      </td>
                      <td className="p-3" data-label={t('procurement.rfq.col.title')}>
                        {r.title}
                        {r.source_boq ? (
                          <span className="ml-2 text-[10px] font-bold text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded">
                            {t('procurement.rfq.fromBoq')}
                          </span>
                        ) : null}
                      </td>
                      <td className="p-3" data-label={t('procurement.rfq.col.items')}>
                        {r.line_items?.length || 0}
                      </td>
                      <td className="p-3" data-label={t('procurement.rfq.col.vendor')}>
                        {(r.vendor_id && vendorMap.get(r.vendor_id)?.name) || '—'}
                      </td>
                      <td className="p-3" data-label={t('procurement.rfq.col.status')}>
                        {RFQ_STATUS_LABELS[r.status] || r.status}
                      </td>
                      <td className="p-3" data-label={t('procurement.rfq.col.action')}>
                        <button
                          type="button"
                          className="text-xs font-semibold text-[#635bdb] underline"
                          onClick={() => {
                            void upsertRfq({ ...r, status: 'sent' }).then(() => {
                              setMessage(t('procurement.rfq.markedSent', { number: r.rfq_number }));
                              void refresh();
                            });
                          }}
                        >
                          {t('procurement.rfq.markSent')}
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </ResponsiveTable>
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block text-sm">
      <span className="text-xs font-semibold text-gray-600 mb-1 block">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full border rounded-xl px-3 py-2.5 text-sm"
      />
    </label>
  );
}
