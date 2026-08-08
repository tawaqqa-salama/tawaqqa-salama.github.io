'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth/AuthProvider';
import { hasWhatsAppPermission } from '@/lib/whatsapp/permissions';
import { logActivity } from '@/lib/activity/logger';

type ConversationRow = {
  id: string;
  phone_number: string;
  status: string;
  assigned_user_id: string | null;
  last_message_at: string | null;
  last_message_preview: string | null;
  unread_count: number;
  customer: {
    id: string;
    name: string;
    lead_status: string | null;
    lead_source: string | null;
    pipeline_stage: string;
    phone: string | null;
  } | null;
};

type MessageRow = {
  id: string;
  direction: string;
  message_type: string;
  text: string | null;
  caption: string | null;
  status: string;
  timestamp: string;
  error_message: string | null;
  template_name: string | null;
};

type CustomerRow = {
  id: string;
  name: string;
  owner_name: string | null;
  phone: string | null;
  email: string | null;
  business_name: string | null;
  activity_type: string | null;
  city: string | null;
  district: string | null;
  street: string | null;
  building_area: number | null;
  floors_count: number | null;
  lead_status: string | null;
  lead_notes: string | null;
  lead_source: string | null;
  pipeline_stage: string;
};

type Extraction = {
  id: string;
  proposed: Record<string, unknown>;
  status: string;
};

const STATUS_AR: Record<string, string> = {
  open: 'مفتوحة',
  pending: 'قيد الانتظار',
  closed: 'مغلقة',
  received: 'مستلمة',
  queued: 'بالانتظار',
  sent: 'تم الإرسال',
  delivered: 'تم التسليم',
  read: 'تمت القراءة',
  failed: 'فشل الإرسال',
};

export default function WhatsAppInbox() {
  const { session } = useAuth();
  const perms = session?.permissions;
  const canView = hasWhatsAppPermission(perms, 'whatsapp.view');
  const canSend = hasWhatsAppPermission(perms, 'whatsapp.send');

  const [conversations, setConversations] = useState<ConversationRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [customer, setCustomer] = useState<CustomerRow | null>(null);
  const [extractions, setExtractions] = useState<Extraction[]>([]);
  const [opportunities, setOpportunities] = useState<Array<{ id: string; title: string | null; status: string }>>([]);
  const [filter, setFilter] = useState<'all' | 'unassigned' | 'open'>('all');
  const [composer, setComposer] = useState('');
  const [sendMode, setSendMode] = useState<'text' | 'template'>('text');
  const [templateName, setTemplateName] = useState('welcome');
  const [templates, setTemplates] = useState<Array<{ name: string; display_name_ar: string | null }>>([]);
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState<Record<string, string>>({});

  const loadConversations = useCallback(async () => {
    const q =
      filter === 'unassigned' ? '?unassigned=1' : filter === 'open' ? '?status=open' : '';
    const res = await fetch(`/api/integrations/whatsapp/conversations${q}`);
    const data = await res.json();
    if (data.ok) setConversations(data.conversations || []);
  }, [filter]);

  const loadThread = useCallback(async (id: string) => {
    const res = await fetch(`/api/integrations/whatsapp/conversations/${id}`);
    const data = await res.json();
    if (!data.ok) return;
    setMessages(data.messages || []);
    setCustomer(data.customer || null);
    setExtractions((data.extractions || []).filter((e: Extraction) => e.status === 'pending'));
    setOpportunities(data.opportunities || []);
    await fetch(`/api/integrations/whatsapp/conversations/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ markRead: true, userId: session?.userId }),
    });
    void logActivity({
      actionType: 'VIEW_PAGE',
      module: 'marketing',
      details: `فتح محادثة واتساب ${id}`,
      metadata: { conversationId: id },
    });
  }, [session?.userId]);

  useEffect(() => {
    if (!canView) return;
    void loadConversations();
    void fetch('/api/integrations/whatsapp/templates')
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) setTemplates(d.templates || []);
      });
  }, [canView, loadConversations]);

  useEffect(() => {
    if (selectedId) void loadThread(selectedId);
  }, [selectedId, loadThread]);

  if (!canView) {
    return (
      <div className="rounded-xl border bg-white p-6 text-sm text-rose-700">
        لا صلاحية لعرض صندوق واتساب.
      </div>
    );
  }

  const send = async () => {
    if (!selectedId || !canSend) return;
    setBusy(true);
    setHint(null);
    const res = await fetch('/api/integrations/whatsapp/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        conversationId: selectedId,
        userId: session?.userId,
        kind: sendMode,
        text: composer,
        templateName: sendMode === 'template' ? templateName : undefined,
      }),
    });
    const data = await res.json();
    setBusy(false);
    if (!data.ok) {
      setHint(data.error === 'service_window_closed_use_template'
        ? 'انتهت نافذة الـ 24 ساعة — استخدم قالب رسالة معتمد.'
        : data.error || 'فشل الإرسال');
      return;
    }
    setComposer('');
    await loadThread(selectedId);
    await loadConversations();
  };

  const retry = async (messageId: string) => {
    if (!selectedId) return;
    setBusy(true);
    await fetch('/api/integrations/whatsapp/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        conversationId: selectedId,
        userId: session?.userId,
        retryMessageId: messageId,
        kind: 'text',
      }),
    });
    setBusy(false);
    await loadThread(selectedId);
  };

  const createOpportunity = async () => {
    if (!customer || !selectedId) return;
    setBusy(true);
    const res = await fetch('/api/integrations/whatsapp/opportunities', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customerId: customer.id,
        conversationId: selectedId,
        title: `فرصة — ${customer.business_name || customer.owner_name || customer.name}`,
        assigned_user_id: session?.userId,
      }),
    });
    const data = await res.json();
    setBusy(false);
    if (data.ok) {
      setHint('تم إنشاء فرصة البيع — يمكنك إنشاء عرض السعر من المبيعات.');
      await loadThread(selectedId);
    } else setHint(data.error || 'تعذر إنشاء الفرصة');
  };

  const reviewExtraction = async (id: string, action: 'confirm' | 'ignore') => {
    await fetch('/api/integrations/whatsapp/extract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ extractionId: id, action, userId: session?.userId }),
    });
    if (selectedId) await loadThread(selectedId);
  };

  const saveCustomer = async () => {
    if (!customer) return;
    setBusy(true);
    const res = await fetch('/api/integrations/whatsapp/customer', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customerId: customer.id,
        userId: session?.userId,
        owner_name: editForm.owner_name,
        phone: editForm.phone,
        email: editForm.email,
        business_name: editForm.business_name,
        activity_type: editForm.activity_type,
        city: editForm.city,
        district: editForm.district,
        street: editForm.street,
        building_area: editForm.building_area ? Number(editForm.building_area) : null,
        floors_count: editForm.floors_count ? Number(editForm.floors_count) : null,
        lead_notes: editForm.lead_notes,
        project_type: editForm.project_type,
        project_stage: editForm.project_stage,
      }),
    });
    setBusy(false);
    if (res.ok) {
      setEditOpen(false);
      if (selectedId) await loadThread(selectedId);
      await loadConversations();
    }
  };

  return (
    <div className="space-y-3" dir="rtl">
      <div className="flex flex-wrap gap-2">
        {(
          [
            ['all', 'كل المحادثات'],
            ['open', 'مفتوحة'],
            ['unassigned', 'غير معيّنة'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setFilter(id)}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold border ${
              filter === id ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-gray-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {hint ? (
        <p className="text-xs rounded-lg bg-amber-50 border border-amber-200 text-amber-900 px-3 py-2">
          {hint}
        </p>
      ) : null}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 min-h-[520px]">
        {/* List */}
        <aside className="lg:col-span-3 rounded-xl border bg-white overflow-hidden flex flex-col">
          <div className="px-3 py-2 border-b font-bold text-sm bg-gray-50">المحادثات</div>
          <ul className="flex-1 overflow-y-auto divide-y">
            {conversations.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(c.id)}
                  className={`w-full text-right px-3 py-3 text-xs hover:bg-emerald-50 ${
                    selectedId === c.id ? 'bg-emerald-50' : ''
                  }`}
                >
                  <div className="flex justify-between gap-2">
                    <span className="font-bold text-gray-900 truncate">
                      {c.customer?.name || c.phone_number}
                    </span>
                    {c.unread_count > 0 ? (
                      <span className="bg-rose-600 text-white rounded-full min-w-[1.25rem] px-1.5 text-[10px] font-bold">
                        {c.unread_count}
                      </span>
                    ) : null}
                  </div>
                  <p className="text-gray-500 truncate mt-0.5">{c.last_message_preview || '—'}</p>
                  <div className="flex justify-between mt-1 text-[10px] text-gray-400">
                    <span>{STATUS_AR[c.status] || c.status}</span>
                    <span dir="ltr">
                      {c.last_message_at
                        ? new Date(c.last_message_at).toLocaleString('ar-SA')
                        : ''}
                    </span>
                  </div>
                </button>
              </li>
            ))}
            {!conversations.length ? (
              <li className="p-4 text-xs text-gray-500">لا محادثات بعد — انتظر Webhook أو اختبر الاستقبال.</li>
            ) : null}
          </ul>
        </aside>

        {/* Thread */}
        <section className="lg:col-span-5 rounded-xl border bg-white flex flex-col overflow-hidden">
          <div className="px-3 py-2 border-b font-bold text-sm bg-gray-50">المحادثة</div>
          {!selectedId ? (
            <p className="p-4 text-xs text-gray-500">اختر محادثة من القائمة.</p>
          ) : (
            <>
              <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-slate-50">
                {messages.map((m) => (
                  <div
                    key={m.id}
                    className={`max-w-[85%] rounded-2xl px-3 py-2 text-xs shadow-sm ${
                      m.direction === 'outbound'
                        ? 'ms-auto bg-emerald-600 text-white'
                        : 'me-auto bg-white border text-gray-800'
                    }`}
                  >
                    <p className="whitespace-pre-wrap">{m.text || m.caption || m.message_type}</p>
                    <div
                      className={`mt-1 text-[10px] flex gap-2 ${
                        m.direction === 'outbound' ? 'text-emerald-100' : 'text-gray-400'
                      }`}
                    >
                      <span dir="ltr">{new Date(m.timestamp).toLocaleString('ar-SA')}</span>
                      <span>{STATUS_AR[m.status] || m.status}</span>
                      {m.status === 'failed' ? (
                        <button
                          type="button"
                          className="underline"
                          onClick={() => void retry(m.id)}
                        >
                          إعادة المحاولة
                        </button>
                      ) : null}
                    </div>
                    {m.error_message ? (
                      <p className="text-[10px] mt-1 text-rose-200">{m.error_message}</p>
                    ) : null}
                  </div>
                ))}
              </div>

              {extractions.map((ex) => (
                <div
                  key={ex.id}
                  className="mx-3 mb-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs"
                >
                  <p className="font-bold text-amber-950 mb-1">تم استخراج معلومات جديدة من المحادثة</p>
                  <pre className="text-[11px] whitespace-pre-wrap text-amber-900 mb-2">
                    {JSON.stringify(ex.proposed, null, 2)}
                  </pre>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="px-2 py-1 rounded bg-emerald-600 text-white font-semibold"
                      onClick={() => void reviewExtraction(ex.id, 'confirm')}
                    >
                      تأكيد
                    </button>
                    <button
                      type="button"
                      className="px-2 py-1 rounded border bg-white"
                      onClick={() => {
                        setEditForm({
                          activity_type: String(ex.proposed.activity || ''),
                          city: String(ex.proposed.city || ''),
                          building_area: String(ex.proposed.area || ''),
                          lead_notes: String(ex.proposed.requested_service || ''),
                        });
                        setEditOpen(true);
                      }}
                    >
                      تعديل
                    </button>
                    <button
                      type="button"
                      className="px-2 py-1 rounded border bg-white text-gray-600"
                      onClick={() => void reviewExtraction(ex.id, 'ignore')}
                    >
                      تجاهل
                    </button>
                  </div>
                </div>
              ))}

              <div className="border-t p-3 space-y-2">
                <div className="flex gap-2 text-[11px]">
                  <button
                    type="button"
                    className={`px-2 py-1 rounded ${sendMode === 'text' ? 'bg-gray-900 text-white' : 'border'}`}
                    onClick={() => setSendMode('text')}
                  >
                    نص
                  </button>
                  <button
                    type="button"
                    className={`px-2 py-1 rounded ${sendMode === 'template' ? 'bg-gray-900 text-white' : 'border'}`}
                    onClick={() => setSendMode('template')}
                  >
                    قالب
                  </button>
                  {sendMode === 'template' ? (
                    <select
                      className="border rounded px-2 py-1 flex-1"
                      value={templateName}
                      onChange={(e) => setTemplateName(e.target.value)}
                    >
                      {templates.map((t) => (
                        <option key={t.name} value={t.name}>
                          {t.display_name_ar || t.name}
                        </option>
                      ))}
                    </select>
                  ) : null}
                </div>
                {sendMode === 'text' ? (
                  <textarea
                    className="w-full border rounded-lg px-3 py-2 text-sm min-h-[72px]"
                    placeholder="اكتب ردك…"
                    value={composer}
                    onChange={(e) => setComposer(e.target.value)}
                    disabled={!canSend || busy}
                  />
                ) : (
                  <p className="text-[11px] text-gray-500">
                    سيُرسل القالب المعتمد عبر WhatsApp Cloud API (خارج نافذة 24 ساعة يُلزم القالب).
                  </p>
                )}
                <button
                  type="button"
                  disabled={!canSend || busy || (sendMode === 'text' && !composer.trim())}
                  onClick={() => void send()}
                  className="w-full rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold py-2.5 disabled:opacity-50"
                >
                  إرسال
                </button>
              </div>
            </>
          )}
        </section>

        {/* CRM card */}
        <aside className="lg:col-span-4 rounded-xl border bg-white overflow-y-auto">
          <div className="px-3 py-2 border-b font-bold text-sm bg-gray-50">بطاقة CRM</div>
          {!customer ? (
            <p className="p-4 text-xs text-gray-500">لا بيانات عميل.</p>
          ) : (
            <div className="p-3 space-y-3 text-xs">
              <div>
                <p className="text-gray-500">العميل / العميل المحتمل</p>
                <p className="font-bold text-sm text-gray-900">
                  {customer.business_name || customer.owner_name || customer.name}
                </p>
                <p dir="ltr" className="text-gray-600">
                  {customer.phone}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-lg bg-gray-50 p-2">
                  <p className="text-gray-500">المصدر</p>
                  <p className="font-semibold">{customer.lead_source || '—'}</p>
                </div>
                <div className="rounded-lg bg-gray-50 p-2">
                  <p className="text-gray-500">الحالة</p>
                  <p className="font-semibold">{customer.lead_status || '—'}</p>
                </div>
                <div className="rounded-lg bg-gray-50 p-2">
                  <p className="text-gray-500">المرحلة</p>
                  <p className="font-semibold">{customer.pipeline_stage}</p>
                </div>
                <div className="rounded-lg bg-gray-50 p-2">
                  <p className="text-gray-500">النشاط</p>
                  <p className="font-semibold">{customer.activity_type || '—'}</p>
                </div>
              </div>
              <p>
                <span className="text-gray-500">المدينة: </span>
                {customer.city || '—'}
              </p>
              <p>
                <span className="text-gray-500">الملاحظات: </span>
                {customer.lead_notes || '—'}
              </p>

              {opportunities.length ? (
                <div>
                  <p className="font-bold mb-1">الفرص</p>
                  <ul className="space-y-1">
                    {opportunities.map((o) => (
                      <li key={o.id} className="rounded border px-2 py-1">
                        {o.title || o.id} · {o.status}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <div className="flex flex-col gap-2 pt-2">
                <button
                  type="button"
                  className="rounded-lg border px-3 py-2 font-semibold hover:bg-gray-50"
                  onClick={() => {
                    setEditForm({
                      owner_name: customer.owner_name || '',
                      phone: customer.phone || '',
                      email: customer.email || '',
                      business_name: customer.business_name || '',
                      activity_type: customer.activity_type || '',
                      city: customer.city || '',
                      district: customer.district || '',
                      street: customer.street || '',
                      building_area: customer.building_area != null ? String(customer.building_area) : '',
                      floors_count: customer.floors_count != null ? String(customer.floors_count) : '',
                      lead_notes: customer.lead_notes || '',
                      project_type: '',
                      project_stage: '',
                    });
                    setEditOpen(true);
                  }}
                >
                  إنشاء / تحديث بيانات العميل
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void createOpportunity()}
                  className="rounded-lg bg-indigo-600 text-white px-3 py-2 font-semibold disabled:opacity-50"
                >
                  إنشاء فرصة بيع
                </button>
                <Link
                  href={`/sales?client=${customer.id}`}
                  className="rounded-lg bg-purple-600 text-white px-3 py-2 font-semibold text-center"
                >
                  إنشاء عرض سعر
                </Link>
                <Link
                  href={`/projects?client=${customer.id}`}
                  className="rounded-lg border px-3 py-2 font-semibold text-center"
                >
                  فتح المشروع / العميل
                </Link>
              </div>
            </div>
          )}
        </aside>
      </div>

      {editOpen ? (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-3">
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-4 space-y-3">
            <h3 className="font-bold text-sm">بيانات العميل والمشروع</h3>
            {(
              [
                ['owner_name', 'الاسم'],
                ['phone', 'رقم الجوال'],
                ['email', 'البريد الإلكتروني'],
                ['business_name', 'اسم المنشأة'],
                ['activity_type', 'النشاط'],
                ['city', 'المدينة'],
                ['district', 'الحي'],
                ['street', 'العنوان'],
                ['building_area', 'مساحة المشروع'],
                ['floors_count', 'عدد الأدوار'],
                ['project_type', 'نوع المشروع'],
                ['project_stage', 'مرحلة المشروع'],
                ['lead_notes', 'الملاحظات / المتطلبات'],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="block text-xs">
                <span className="text-gray-600">{label}</span>
                <input
                  className="mt-1 w-full border rounded-lg px-3 py-2"
                  value={editForm[key] || ''}
                  onChange={(e) => setEditForm({ ...editForm, [key]: e.target.value })}
                />
              </label>
            ))}
            <div className="flex gap-2 justify-end pt-2">
              <button type="button" className="px-3 py-2 border rounded-lg" onClick={() => setEditOpen(false)}>
                إلغاء
              </button>
              <button
                type="button"
                className="px-3 py-2 bg-emerald-600 text-white rounded-lg font-semibold"
                onClick={() => void saveCustomer()}
              >
                حفظ
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
