'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth/AuthProvider';
import { hasWhatsAppPermission } from '@/lib/whatsapp/permissions';

export default function WhatsAppCampaignsPanel() {
  const { session } = useAuth();
  const can = hasWhatsAppPermission(session?.permissions, 'whatsapp.campaigns');
  const [campaigns, setCampaigns] = useState<
    Array<{
      id: string;
      name: string;
      status: string;
      stats: Record<string, number>;
    }>
  >([]);
  const [templates, setTemplates] = useState<Array<{ id: string; name: string; display_name_ar: string | null }>>(
    []
  );
  const [name, setName] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [hint, setHint] = useState<string | null>(null);
  const [automations, setAutomations] = useState<
    Array<{ id: string; name: string; trigger: string; active: boolean }>
  >([]);

  const reload = async () => {
    const [c, t] = await Promise.all([
      fetch('/api/integrations/whatsapp/campaigns').then((r) => r.json()),
      fetch('/api/integrations/whatsapp/templates').then((r) => r.json()),
    ]);
    if (c.ok) {
      setCampaigns(c.campaigns || []);
      setAutomations(c.automations || []);
    }
    if (t.ok) {
      setTemplates(t.templates || []);
      if (!templateId && t.templates?.[0]?.id) setTemplateId(t.templates[0].id);
    }
  };

  useEffect(() => {
    if (can) void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [can]);

  if (!can) {
    return <p className="text-sm text-rose-700">لا صلاحية لإدارة حملات واتساب.</p>;
  }

  const create = async () => {
    setHint(null);
    const res = await fetch('/api/integrations/whatsapp/campaigns', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        template_id: templateId,
        created_by: session?.userId,
      }),
    });
    const data = await res.json();
    if (!data.ok) setHint(data.error);
    else {
      setName('');
      await reload();
    }
  };

  const send = async (campaignId: string) => {
    setHint(null);
    const res = await fetch('/api/integrations/whatsapp/campaigns', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'send',
        campaignId,
        created_by: session?.userId,
      }),
    });
    const data = await res.json();
    setHint(data.ok ? 'تم إرسال الحملة للمستلمين المؤهلين (واتساب / موافقة).' : data.error);
    await reload();
  };

  const addAutomation = async () => {
    await fetch('/api/integrations/whatsapp/campaigns', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'automation',
        name: 'متابعة بعد إنشاء Lead',
        trigger: 'lead_created',
        template_id: templateId,
        delay_minutes: 0,
        active: true,
      }),
    });
    await reload();
  };

  return (
    <div className="space-y-4" dir="rtl">
      <div className="rounded-xl border bg-white p-4 space-y-3">
        <h3 className="font-bold text-sm">حملات واتساب</h3>
        <p className="text-xs text-gray-500">
          الإرسال عبر قوالب معتمدة فقط، وللأرقام ذات أساس تشغيلي (مصدر واتساب / موافقة).
        </p>
        <div className="grid sm:grid-cols-3 gap-2">
          <input
            className="border rounded-lg px-3 py-2 text-sm"
            placeholder="اسم الحملة"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <select
            className="border rounded-lg px-3 py-2 text-sm"
            value={templateId}
            onChange={(e) => setTemplateId(e.target.value)}
          >
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.display_name_ar || t.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => void create()}
            disabled={!name.trim()}
            className="rounded-lg bg-emerald-600 text-white text-sm font-bold disabled:opacity-50"
          >
            إنشاء حملة
          </button>
        </div>
        {hint ? <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1">{hint}</p> : null}
      </div>

      <div className="rounded-xl border bg-white overflow-hidden">
        <table className="w-full text-xs">
          <thead className="bg-gray-50 text-gray-600">
            <tr>
              <th className="p-2 text-right">الحملة</th>
              <th className="p-2 text-right">الحالة</th>
              <th className="p-2 text-right">مرسل / فشل</th>
              <th className="p-2 text-right">إجراء</th>
            </tr>
          </thead>
          <tbody>
            {campaigns.map((c) => (
              <tr key={c.id} className="border-t">
                <td className="p-2 font-semibold">{c.name}</td>
                <td className="p-2">{c.status}</td>
                <td className="p-2">
                  {c.stats?.sent ?? 0} / {c.stats?.failed ?? 0}
                </td>
                <td className="p-2">
                  <button
                    type="button"
                    className="text-emerald-700 font-bold"
                    onClick={() => void send(c.id)}
                  >
                    إرسال
                  </button>
                </td>
              </tr>
            ))}
            {!campaigns.length ? (
              <tr>
                <td colSpan={4} className="p-4 text-gray-500">
                  لا حملات بعد.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="rounded-xl border bg-white p-4 space-y-2">
        <div className="flex justify-between items-center">
          <h3 className="font-bold text-sm">أتمتة التسويق</h3>
          <button type="button" className="text-xs font-bold text-indigo-700" onClick={() => void addAutomation()}>
            + قاعدة Lead Created
          </button>
        </div>
        <ul className="text-xs space-y-1">
          {automations.map((a) => (
            <li key={a.id} className="border rounded-lg px-2 py-1.5 flex justify-between">
              <span>
                {a.name} · {a.trigger}
              </span>
              <span>{a.active ? 'مفعّلة' : 'متوقفة'}</span>
            </li>
          ))}
          {!automations.length ? <li className="text-gray-500">لا قواعد أتمتة بعد.</li> : null}
        </ul>
        <p className="text-[11px] text-gray-500">
          المحفزات المدعومة: lead_created, quote_sent, no_response, customer_approved, project_started,
          project_completed
        </p>
      </div>
    </div>
  );
}
