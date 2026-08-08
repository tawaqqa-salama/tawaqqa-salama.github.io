'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth/AuthProvider';
import { hasWhatsAppPermission } from '@/lib/whatsapp/permissions';

export default function WhatsAppSettingsPanel() {
  const { session } = useAuth();
  const can = hasWhatsAppPermission(session?.permissions, 'whatsapp.settings');
  const [data, setData] = useState<{
    connection?: {
      connected: boolean;
      provider: string;
      phoneNumberId: string | null;
      wabaId: string | null;
      apiVersion: string;
      webhookConfigured: boolean;
      hasAppSecret: boolean;
    };
    accounts?: Array<{
      phone_number_id: string;
      business_name: string | null;
      status: string;
      last_webhook_at: string | null;
    }>;
    webhookPath?: string;
  } | null>(null);
  const [testResult, setTestResult] = useState<string | null>(null);

  useEffect(() => {
    if (!can) return;
    void fetch('/api/integrations/whatsapp/settings')
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) setData(d);
      });
  }, [can]);

  if (!can) {
    return <p className="text-sm text-rose-700">لا صلاحية لإعدادات واتساب.</p>;
  }

  const test = async () => {
    const res = await fetch('/api/integrations/whatsapp/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'test' }),
    });
    const d = await res.json();
    setTestResult(d.ok ? `متصل: ${d.detail}` : `فشل: ${d.detail || d.error}`);
  };

  const c = data?.connection;

  return (
    <div className="space-y-4" dir="rtl">
      <div className="rounded-xl border bg-white p-5 space-y-3">
        <h2 className="font-bold text-gray-900">ربط واتساب</h2>
        <p className="text-xs text-gray-500">
          التكامل عبر WhatsApp Business Platform / Cloud API فقط — بدون WhatsApp Web أو QR.
        </p>
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex px-3 py-1 rounded-full text-xs font-bold ${
              c?.connected ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-900'
            }`}
          >
            {c?.connected ? 'Connected' : 'Not Connected'}
          </span>
          <span className="text-xs text-gray-500">المزوّد: {c?.provider || '—'}</span>
        </div>
        <dl className="grid sm:grid-cols-2 gap-2 text-xs">
          <div className="rounded-lg bg-gray-50 p-2">
            <dt className="text-gray-500">Phone Number ID</dt>
            <dd className="font-mono" dir="ltr">
              {c?.phoneNumberId || '—'}
            </dd>
          </div>
          <div className="rounded-lg bg-gray-50 p-2">
            <dt className="text-gray-500">Business Account (WABA)</dt>
            <dd className="font-mono" dir="ltr">
              {c?.wabaId || '—'}
            </dd>
          </div>
          <div className="rounded-lg bg-gray-50 p-2">
            <dt className="text-gray-500">Webhook</dt>
            <dd className="font-mono break-all" dir="ltr">
              {data?.webhookPath || '/api/integrations/whatsapp/webhook'}
            </dd>
          </div>
          <div className="rounded-lg bg-gray-50 p-2">
            <dt className="text-gray-500">Webhook / App Secret</dt>
            <dd>
              {c?.webhookConfigured ? 'Verify token مضبوط' : 'Verify token غير مضبوط'} ·{' '}
              {c?.hasAppSecret ? 'Signature مفعّل' : 'Signature اختياري (تطوير)'}
            </dd>
          </div>
          <div className="rounded-lg bg-gray-50 p-2">
            <dt className="text-gray-500">API Version</dt>
            <dd dir="ltr">{c?.apiVersion || '—'}</dd>
          </div>
          <div className="rounded-lg bg-gray-50 p-2">
            <dt className="text-gray-500">آخر Webhook</dt>
            <dd dir="ltr">
              {data?.accounts?.[0]?.last_webhook_at
                ? new Date(data.accounts[0].last_webhook_at).toLocaleString('ar-SA')
                : '—'}
            </dd>
          </div>
        </dl>
        <p className="text-[11px] text-gray-500">
          Access Token لا يُعرض في الواجهة أبدًا — يُضبط عبر متغيرات البيئة فقط.
        </p>
        <button
          type="button"
          onClick={() => void test()}
          className="rounded-lg bg-emerald-600 text-white text-sm font-bold px-4 py-2"
        >
          Connect / Test Connection
        </button>
        {testResult ? <p className="text-xs text-gray-700">{testResult}</p> : null}
      </div>
    </div>
  );
}
