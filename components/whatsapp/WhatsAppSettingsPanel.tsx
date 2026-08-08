'use client';

import { startTransition, useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth/AuthProvider';
import { hasWhatsAppPermission } from '@/lib/whatsapp/permissions';
import NumericInput from '@/components/ui/NumericInput';

type FormState = {
  business_name: string;
  phone_number: string;
  phone_number_id: string;
  waba_id: string;
  webhook_verify_token: string;
  access_token: string;
  api_version: string;
};

const EMPTY: FormState = {
  business_name: 'توقع سلامة',
  phone_number: '',
  phone_number_id: '',
  waba_id: '',
  webhook_verify_token: '',
  access_token: '',
  api_version: 'v21.0',
};

export default function WhatsAppSettingsPanel() {
  const { session } = useAuth();
  const can = hasWhatsAppPermission(session?.permissions, 'whatsapp.settings');

  const [form, setForm] = useState<FormState>(EMPTY);
  const [hasAccessToken, setHasAccessToken] = useState(false);
  const [hasVerifyToken, setHasVerifyToken] = useState(false);
  const [envLocked, setEnvLocked] = useState(false);
  const [connection, setConnection] = useState<{
    connected?: boolean;
    provider?: string;
    webhookConfigured?: boolean;
    memoryMode?: boolean;
    source?: string;
  } | null>(null);
  const [webhookPath, setWebhookPath] = useState('/api/integrations/whatsapp/webhook');
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<string | null>(null);

  const load = async () => {
    const res = await fetch('/api/integrations/whatsapp/settings');
    const d = await res.json();
    if (!d.ok) return;
    setConnection(d.connection || null);
    setWebhookPath(d.webhookPath || webhookPath);
    setHasAccessToken(Boolean(d.form?.hasAccessToken));
    setHasVerifyToken(Boolean(d.form?.has_webhook_verify_token));
    setEnvLocked(Boolean(d.form?.access_token_set_via_env));
    setForm((prev) => ({
      ...prev,
      business_name: d.form?.business_name || prev.business_name,
      phone_number: d.form?.phone_number || '',
      phone_number_id: d.form?.phone_number_id || '',
      waba_id: d.form?.waba_id || '',
      webhook_verify_token: '',
      access_token: '',
      api_version: d.form?.api_version || 'v21.0',
    }));
  };

  useEffect(() => {
    if (!can) return;
    startTransition(() => {
      void load();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [can]);

  if (!can) {
    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800" dir="rtl">
        لا صلاحية لإعدادات واتساب. يلزم صلاحية <code className="font-mono">whatsapp.settings</code> أو
        قسم الإعدادات / مدير النظام.
      </div>
    );
  }

  const save = async () => {
    setBusy(true);
    setHint(null);
    const res = await fetch('/api/integrations/whatsapp/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'save',
        business_name: form.business_name,
        phone_number: form.phone_number,
        phone_number_id: form.phone_number_id,
        waba_id: form.waba_id,
        webhook_verify_token: form.webhook_verify_token || undefined,
        access_token: form.access_token || undefined,
        api_version: form.api_version,
      }),
    });
    const d = await res.json();
    setBusy(false);
    if (!d.ok) {
      setHint(d.error || 'تعذر الحفظ');
      return;
    }
    setHint(d.warning || 'تم حفظ الإعدادات. Access Token لا يُعرض بعد الحفظ.');
    setForm((p) => ({ ...p, access_token: '', webhook_verify_token: '' }));
    setConnection(d.connection || null);
    setHasAccessToken(Boolean(d.settings?.hasAccessToken || d.connection?.hasAccessToken));
    await load();
  };

  const test = async () => {
    setBusy(true);
    setTestResult(null);
    const res = await fetch('/api/integrations/whatsapp/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'test' }),
    });
    const d = await res.json();
    setBusy(false);
    setTestResult(d.ok ? `متصل: ${d.detail}` : `فشل: ${d.detail || d.error}`);
  };

  return (
    <div className="space-y-4" dir="rtl">
      <div className="rounded-xl border bg-white p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-bold text-gray-900">ربط واتساب / الضبط</h2>
            <p className="text-xs text-gray-500 mt-1">
              أدخل أرقام ومعرّفات Meta Cloud API هنا. التوكن يُحفظ في الخادم فقط ولا يُعاد للواجهة.
            </p>
          </div>
          <span
            className={`inline-flex px-3 py-1 rounded-full text-xs font-bold ${
              connection?.connected
                ? 'bg-emerald-50 text-emerald-800'
                : 'bg-amber-50 text-amber-900'
            }`}
          >
            {connection?.connected ? 'Connected' : 'Not Connected'}
          </span>
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          <label className="block text-xs space-y-1">
            <span className="font-semibold text-gray-700">اسم النشاط</span>
            <input
              className="w-full border rounded-lg px-3 py-2 text-sm"
              value={form.business_name}
              onChange={(e) => setForm({ ...form, business_name: e.target.value })}
              placeholder="توقع سلامة"
            />
          </label>

          <label className="block text-xs space-y-1">
            <span className="font-semibold text-gray-700">رقم واتساب الظاهر (اختياري)</span>
            <NumericInput
              className="w-full border rounded-lg px-3 py-2 text-sm dir-ltr text-left"
              value={form.phone_number}
              onChange={(phone_number) => setForm({ ...form, phone_number })}
              placeholder="9665XXXXXXXX"
              maxLength={15}
            />
          </label>

          <label className="block text-xs space-y-1 sm:col-span-2">
            <span className="font-semibold text-gray-700">Phone Number ID *</span>
            <input
              dir="ltr"
              className="w-full border rounded-lg px-3 py-2 text-sm font-mono text-left"
              value={form.phone_number_id}
              onChange={(e) => setForm({ ...form, phone_number_id: e.target.value.trim() })}
              placeholder="من Meta → WhatsApp → API Setup"
              required
            />
          </label>

          <label className="block text-xs space-y-1 sm:col-span-2">
            <span className="font-semibold text-gray-700">WhatsApp Business Account ID (WABA)</span>
            <input
              dir="ltr"
              className="w-full border rounded-lg px-3 py-2 text-sm font-mono text-left"
              value={form.waba_id}
              onChange={(e) => setForm({ ...form, waba_id: e.target.value.trim() })}
              placeholder="WABA ID"
            />
          </label>

          <label className="block text-xs space-y-1 sm:col-span-2">
            <span className="font-semibold text-gray-700">
              Access Token {hasAccessToken ? '(محفوظ — اتركه فارغًا للإبقاء)' : '*'}
            </span>
            <input
              type="password"
              autoComplete="new-password"
              dir="ltr"
              className="w-full border rounded-lg px-3 py-2 text-sm font-mono text-left"
              value={form.access_token}
              onChange={(e) => setForm({ ...form, access_token: e.target.value })}
              placeholder={
                envLocked
                  ? 'مضبوط عبر متغير البيئة — أدخل قيمة جديدة للاستبدال في هذه الجلسة'
                  : hasAccessToken
                    ? '•••••••• (أدخل لتحديث التوكن)'
                    : 'Permanent / System User token'
              }
            />
          </label>

          <label className="block text-xs space-y-1">
            <span className="font-semibold text-gray-700">
              Webhook Verify Token {hasVerifyToken ? '(محفوظ — أدخل للتحديث)' : ''}
            </span>
            <input
              dir="ltr"
              className="w-full border rounded-lg px-3 py-2 text-sm font-mono text-left"
              value={form.webhook_verify_token}
              onChange={(e) => setForm({ ...form, webhook_verify_token: e.target.value })}
              placeholder="نفس القيمة في Meta Callback"
            />
          </label>

          <label className="block text-xs space-y-1">
            <span className="font-semibold text-gray-700">API Version</span>
            <input
              dir="ltr"
              className="w-full border rounded-lg px-3 py-2 text-sm font-mono text-left"
              value={form.api_version}
              onChange={(e) => setForm({ ...form, api_version: e.target.value.trim() })}
              placeholder="v21.0"
            />
          </label>
        </div>

        <div className="rounded-lg bg-slate-50 border px-3 py-2 text-[11px] text-gray-600 space-y-1">
          <p>
            <span className="font-semibold">Webhook URL: </span>
            <code className="font-mono" dir="ltr">
              {typeof window !== 'undefined'
                ? `${window.location.origin}${webhookPath}`
                : webhookPath}
            </code>
          </p>
          <p>المزوّد: {connection?.provider || '—'} · المصدر: {connection?.source || '—'}</p>
          {connection?.memoryMode ? (
            <p className="text-amber-800">وضع العرض/الاختبار — احفظ ثم اختبر الاتصال على استضافة Node.</p>
          ) : null}
        </div>

        {hint ? (
          <p className="text-xs rounded-lg bg-amber-50 border border-amber-200 text-amber-950 px-3 py-2">
            {hint}
          </p>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy || !form.phone_number_id.trim()}
            onClick={() => void save()}
            className="rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold px-5 py-2.5 disabled:opacity-50"
          >
            حفظ الضبط
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void test()}
            className="rounded-lg border border-emerald-600 text-emerald-800 text-sm font-bold px-5 py-2.5 disabled:opacity-50"
          >
            اختبار الاتصال
          </button>
        </div>
        {testResult ? <p className="text-xs text-gray-700">{testResult}</p> : null}
      </div>
    </div>
  );
}
