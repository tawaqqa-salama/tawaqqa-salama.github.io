'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { formatCurrency } from '@/lib/format/currency';
import ModuleSubNavSlot from '@/components/layout/ModuleSubNavSlot';
import ResponsiveTable from '@/components/ui/ResponsiveTable';
import NumericInput from '@/components/ui/NumericInput';
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

type TabId = 'vendors' | 'subcontractors' | 'orders' | 'boq-rfq';

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
  const searchParams = useSearchParams();
  const initialTab = (searchParams.get('tab') as TabId | null) || 'vendors';
  const [tab, setTab] = useState<TabId>(
    ['vendors', 'subcontractors', 'orders', 'boq-rfq'].includes(initialTab) ? initialTab : 'vendors'
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
    if (t && ['vendors', 'subcontractors', 'orders', 'boq-rfq'].includes(t)) {
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
        <h1 className="text-xl font-bold text-gray-900">إدارة المشتريات والتعاقدات</h1>
        <p className="text-sm text-gray-500 mt-1">
          دليل الموردين المعتمدين، العقود الخارجية، أوامر الشراء، وتحويل BOQ إلى طلبات تسعير — لأنظمة السلامة وفق SBC/NFPA
        </p>
      </div>

      <ModuleSubNavSlot label="تبويبات المشتريات">
        <div id="module-subnav" className="flex flex-wrap gap-2">
          {(
            [
              { id: 'vendors' as const, label: 'دليل الموردين المعتمدين' },
              { id: 'subcontractors' as const, label: 'العقود الخارجية' },
              { id: 'orders' as const, label: 'أوامر الشراء' },
              { id: 'boq-rfq' as const, label: 'BOQ → RFQ' },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                setTab(t.id);
                if (t.id === 'vendors') setVendorForm((f) => ({ ...f, vendor_type: 'supplier' }));
                if (t.id === 'subcontractors') setVendorForm((f) => ({ ...f, vendor_type: 'subcontractor' }));
              }}
              className={`px-3 py-2 rounded-lg text-sm font-semibold ${
                tab === t.id ? 'bg-[#1f4d3a] text-white' : 'bg-white border'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </ModuleSubNavSlot>

      {message && (
        <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          {message}
        </div>
      )}

      {(tab === 'vendors' || tab === 'subcontractors') && (
        <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">
          <div className="xl:col-span-2 rounded-xl border bg-white p-4 space-y-3">
            <h2 className="font-bold text-gray-900">
              {tab === 'vendors' ? 'إضافة / تعديل مورد معتمد' : 'إضافة / تعديل مقاول أو استشاري خارجي'}
            </h2>
            <Field
              label="الاسم"
              value={vendorForm.name}
              onChange={(v) => setVendorForm({ ...vendorForm, name: v })}
            />
            <Field
              label="التخصص (إطفاء / إنذار / اختبارات…)"
              value={vendorForm.specialty || ''}
              onChange={(v) => setVendorForm({ ...vendorForm, specialty: v })}
            />
            <div className="grid grid-cols-2 gap-2">
              <Field
                label="الجوال"
                value={vendorForm.phone || ''}
                onChange={(v) => setVendorForm({ ...vendorForm, phone: v })}
              />
              <Field
                label="المدينة"
                value={vendorForm.city || ''}
                onChange={(v) => setVendorForm({ ...vendorForm, city: v })}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Field
                label="السجل التجاري"
                value={vendorForm.commercial_register || ''}
                onChange={(v) => setVendorForm({ ...vendorForm, commercial_register: v })}
              />
              <Field
                label="الرقم الضريبي"
                value={vendorForm.tax_number || ''}
                onChange={(v) => setVendorForm({ ...vendorForm, tax_number: v })}
              />
            </div>
            <Field
              label="شهادات / اعتمادات"
              value={vendorForm.certification_notes || ''}
              onChange={(v) => setVendorForm({ ...vendorForm, certification_notes: v })}
            />
            <button
              type="button"
              disabled={busy}
              onClick={() => void saveVendor()}
              className="w-full px-4 py-2.5 rounded-xl bg-[#1f4d3a] text-white text-sm font-semibold disabled:opacity-50"
            >
              حفظ
            </button>
          </div>

          <div className="xl:col-span-3">
            <ResponsiveTable className="bg-white rounded-xl border">
              <table className="w-full text-right text-sm table-as-cards">
                <thead className="bg-gray-50 border-b text-gray-600">
                  <tr>
                    <th className="p-3">الاسم</th>
                    <th className="p-3">التخصص</th>
                    <th className="p-3">المدينة</th>
                    <th className="p-3">الحالة</th>
                    <th className="p-3">إجراء</th>
                  </tr>
                </thead>
                <tbody>
                  {(tab === 'vendors' ? suppliers : subcontractors).map((v) => (
                    <tr key={v.id} className="border-b hover:bg-gray-50">
                      <td className="p-3" data-label="الاسم">
                        <div className="font-semibold">{v.name}</div>
                        <div className="text-xs text-gray-400">{v.phone || '—'}</div>
                      </td>
                      <td className="p-3" data-label="التخصص">
                        {v.specialty || '—'}
                      </td>
                      <td className="p-3" data-label="المدينة">
                        {v.city || '—'}
                      </td>
                      <td className="p-3" data-label="الحالة">
                        {v.status === 'active' ? 'نشط' : v.status}
                      </td>
                      <td className="p-3" data-label="إجراء">
                        <button
                          type="button"
                          className="text-xs font-semibold text-[#1f4d3a] underline"
                          onClick={() => openVendorEditor(v.vendor_type, v)}
                        >
                          تعديل
                        </button>
                      </td>
                    </tr>
                  ))}
                  {(tab === 'vendors' ? suppliers : subcontractors).length === 0 && (
                    <tr>
                      <td colSpan={5} className="p-8 text-center text-gray-400">
                        لا توجد سجلات بعد
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
            <h2 className="font-bold text-gray-900">أمر شراء جديد</h2>
            <Field label="العنوان" value={poForm.title} onChange={(v) => setPoForm({ ...poForm, title: v })} />
            <label className="block text-sm">
              <span className="text-xs font-semibold text-gray-600 mb-1 block">التصنيف</span>
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
              <span className="text-xs font-semibold text-gray-600 mb-1 block">المورد</span>
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
              label="وصف البند"
              value={poForm.description}
              onChange={(v) => setPoForm({ ...poForm, description: v })}
            />
            <div className="grid grid-cols-2 gap-2">
              <label className="text-sm">
                <span className="text-xs font-semibold text-gray-600 mb-1 block">الكمية</span>
                <NumericInput
                  mode="decimal"
                  value={poForm.quantity}
                  onChange={(v) => setPoForm({ ...poForm, quantity: v })}
                  className="w-full border rounded-xl px-3 py-2.5 text-sm"
                />
              </label>
              <label className="text-sm">
                <span className="text-xs font-semibold text-gray-600 mb-1 block">سعر الوحدة</span>
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
              className="w-full px-4 py-2.5 rounded-xl bg-[#1f4d3a] text-white text-sm font-semibold disabled:opacity-50"
            >
              إنشاء أمر الشراء
            </button>
          </div>

          <div className="xl:col-span-3">
            <ResponsiveTable className="bg-white rounded-xl border">
              <table className="w-full text-right text-sm table-as-cards">
                <thead className="bg-gray-50 border-b text-gray-600">
                  <tr>
                    <th className="p-3">رقم الأمر</th>
                    <th className="p-3">العنوان</th>
                    <th className="p-3">المورد</th>
                    <th className="p-3">الإجمالي</th>
                    <th className="p-3">الحالة</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-8 text-center text-gray-400">
                        لا توجد أوامر شراء بعد
                      </td>
                    </tr>
                  ) : (
                    orders.map((o) => (
                      <tr key={o.id} className="border-b">
                        <td className="p-3 font-mono" data-label="رقم الأمر">
                          {o.po_number}
                        </td>
                        <td className="p-3" data-label="العنوان">
                          <div className="font-semibold">{o.title}</div>
                          <div className="text-xs text-gray-400">
                            {PURCHASE_CATEGORY_LABELS[o.category] || o.category}
                          </div>
                        </td>
                        <td className="p-3" data-label="المورد">
                          {(o.vendor_id && vendorMap.get(o.vendor_id)?.name) || '—'}
                        </td>
                        <td className="p-3 font-mono" data-label="الإجمالي">
                          {formatCurrency(o.total_amount)}
                        </td>
                        <td className="p-3" data-label="الحالة">
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
            حوّل بنود جدول الكميات (BOQ) من مشروع هندسي إلى طلب تسعير (RFQ) يُرسل للموردين المعتمدين.
          </div>
          <div className="rounded-xl border bg-white p-4 grid grid-cols-1 md:grid-cols-3 gap-3">
            <label className="text-sm md:col-span-1">
              <span className="text-xs font-semibold text-gray-600 mb-1 block">المشروع</span>
              <select
                value={rfqProjectId}
                onChange={(e) => setRfqProjectId(e.target.value)}
                className="w-full border rounded-xl px-3 py-2.5 text-sm"
              >
                <option value="">اختر مشروعاً</option>
                {projects.map((p) => {
                  const boqCount = parseProjectEngineeringData(p.project_engineering_data).boq.items?.length || 0;
                  return (
                    <option key={p.id} value={p.id}>
                      {p.business_name || p.name} — BOQ: {boqCount} بند
                    </option>
                  );
                })}
              </select>
            </label>
            <label className="text-sm">
              <span className="text-xs font-semibold text-gray-600 mb-1 block">المورد (اختياري)</span>
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
                className="w-full px-4 py-2.5 rounded-xl bg-[#1f4d3a] text-white text-sm font-semibold disabled:opacity-50"
              >
                تحويل BOQ إلى RFQ
              </button>
            </div>
          </div>

          <ResponsiveTable className="bg-white rounded-xl border">
            <table className="w-full text-right text-sm table-as-cards">
              <thead className="bg-gray-50 border-b text-gray-600">
                <tr>
                  <th className="p-3">رقم RFQ</th>
                  <th className="p-3">العنوان</th>
                  <th className="p-3">البنود</th>
                  <th className="p-3">المورد</th>
                  <th className="p-3">الحالة</th>
                  <th className="p-3">إجراء</th>
                </tr>
              </thead>
              <tbody>
                {rfqs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-gray-400">
                      لا توجد طلبات تسعير بعد
                    </td>
                  </tr>
                ) : (
                  rfqs.map((r) => (
                    <tr key={r.id} className="border-b">
                      <td className="p-3 font-mono" data-label="رقم RFQ">
                        {r.rfq_number}
                      </td>
                      <td className="p-3" data-label="العنوان">
                        {r.title}
                        {r.source_boq ? (
                          <span className="ml-2 text-[10px] font-bold text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded">
                            من BOQ
                          </span>
                        ) : null}
                      </td>
                      <td className="p-3" data-label="البنود">
                        {r.line_items?.length || 0}
                      </td>
                      <td className="p-3" data-label="المورد">
                        {(r.vendor_id && vendorMap.get(r.vendor_id)?.name) || '—'}
                      </td>
                      <td className="p-3" data-label="الحالة">
                        {RFQ_STATUS_LABELS[r.status] || r.status}
                      </td>
                      <td className="p-3" data-label="إجراء">
                        <button
                          type="button"
                          className="text-xs font-semibold text-[#1f4d3a] underline"
                          onClick={() => {
                            void upsertRfq({ ...r, status: 'sent' }).then(() => {
                              setMessage(`تم تعليم ${r.rfq_number} كـ مُرسل`);
                              void refresh();
                            });
                          }}
                        >
                          تعليم كمرسل
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
