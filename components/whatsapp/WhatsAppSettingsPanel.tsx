'use client';

import { startTransition, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/lib/auth/AuthProvider';
import { areApiRoutesAvailable } from '@/lib/runtime/mode';
import { hasWhatsAppPermission } from '@/lib/whatsapp/permissions';

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
  const apiOk = areApiRoutesAvailable();

  const [form, setForm] = useState<FormState>(EMPTY);
  const [hasAccessToken, setHasAccessToken] = useState(false);
  const [hasVerifyToken, setHasVerifyToken] = useState(false);
  const [envLocked, setEnvLocked] = useState(false);
  const [connection, setConnection] = useState<{
    connected?: boolean;
    provider?: string;
    memoryMode?: boolean;
    source?: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const webhookUrls = useMemo(() => {
    const origin =
      typeof window !== 'undefined' ? window.location.origin : 'https://YOUR_HOST';
    // Prefer Node/Vercel host for Meta — GitHub Pages cannot receive webhooks
    const nodeHint =
      origin.includes('github.io')
        ? 'https://tawaqqa-salama.vercel.app'
        : origin;
    return {
      primary: `${nodeHint}/api/whatsapp/webhook`,
      canonical: `${nodeHint}/api/integrations/whatsapp/webhook`,
      onPages: origin.includes('github.io'),
    };
  }, []);

  const load = async () => {
    if (!apiOk) return;
    const res = await fetch('/api/integrations/whatsapp/settings');
    const d = await res.json();
    if (!d.ok) return;
    setConnection(d.connection || null);
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
  }, [can, apiOk]);

  if (!can) {
    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800" dir="rtl">
        لا صلاحية لإعدادات واتساب.
      </div>
    );
  }

  const saveAndTest = async () => {
    if (!apiOk) {
      setHint(
        'هذه الصفحة على GitHub Pages لا تشغّل /api. افتح نفس الشاشة على استضافة Node (مثل Vercel) للحفظ والاختبار.'
      );
      return;
    }
    setBusy(true);
    setHint(null);
    setTestResult(null);

    const saveRes = await fetch('/api/integrations/whatsapp/settings', {
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
    const saved = await saveRes.json();
    if (!saved.ok) {
      setBusy(false);
      setHint(saved.error || 'تعذر الحفظ');
      return;
    }

    setForm((p) => ({ ...p, access_token: '', webhook_verify_token: '' }));
    setHasAccessToken(Boolean(saved.settings?.hasAccessToken || saved.connection?.hasAccessToken));
    setConnection(saved.connection || null);

    const testRes = await fetch('/api/integrations/whatsapp/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'test' }),
    });
    const tested = await testRes.json();
    setBusy(false);
    setHint(saved.warning || 'تم تحديث الإعدادات.');
    setTestResult(
      tested.ok
        ? `الاتصال ناجح: ${tested.detail}`
        : `الحفظ تم لكن الاختبار فشل: ${tested.detail || tested.error}`
    );
    await load();
  };

  const copyWebhook = async () => {
    try {
      await navigator.clipboard.writeText(webhookUrls.primary);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setHint(`انسخ يدويًا: ${webhookUrls.primary}`);
    }
  };

  return (
    <div className="space-y-4" dir="rtl">
      {!apiOk || webhookUrls.onPages ? (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-xs text-amber-950">
          أنت الآن على <strong>GitHub Pages</strong> — لا يعمل حفظ الضبط ولا Webhook هنا.
          <br />
          افتح الضبط على Node/Vercel (مثال:{' '}
          <code className="font-mono" dir="ltr">
            https://tawaqqa-salama.vercel.app/settings/integrations/whatsapp
          </code>
          ) ثم سجّل في Meta نفس رابط الـWebhook أدناه.
        </div>
      ) : null}

      <div className="rounded-xl border bg-white p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-bold text-gray-900">ربط واتساب</h2>
            <p className="text-xs text-gray-500 mt-1">
              WhatsApp Business Platform / Cloud API — بدون WhatsApp Web
            </p>
          </div>
          <span
            className={`inline-flex px-3 py-1 rounded-full text-xs font-bold ${
              connection?.connected
                ? 'bg-emerald-50 text-emerald-800'
                : 'bg-amber-50 text-amber-900'
            }`}
          >
            {connection?.connected ? 'متصل' : 'غير متصل'}
          </span>
        </div>

        <div className="space-y-3">
          <label className="block text-xs space-y-1">
            <span className="font-semibold text-gray-700">رقم التعريف للهاتف (Phone Number ID) *</span>
            <input
              dir="ltr"
              className="w-full border rounded-lg px-3 py-2.5 text-sm font-mono text-left"
              value={form.phone_number_id}
              onChange={(e) => setForm({ ...form, phone_number_id: e.target.value.trim() })}
              placeholder="380386…"
              inputMode="numeric"
            />
          </label>

          <label className="block text-xs space-y-1">
            <span className="font-semibold text-gray-700">Business Account ID (WABA)</span>
            <input
              dir="ltr"
              className="w-full border rounded-lg px-3 py-2.5 text-sm font-mono text-left"
              value={form.waba_id}
              onChange={(e) => setForm({ ...form, waba_id: e.target.value.trim() })}
              placeholder="105175…"
              inputMode="numeric"
            />
          </label>

          <label className="block text-xs space-y-1">
            <span className="font-semibold text-gray-700">
              الرمز (Access Token) {hasAccessToken ? '— محفوظ، أدخل للتحديث فقط' : '*'}
            </span>
            <input
              type="password"
              autoComplete="new-password"
              dir="ltr"
              className="w-full border rounded-lg px-3 py-2.5 text-sm font-mono text-left"
              value={form.access_token}
              onChange={(e) => setForm({ ...form, access_token: e.target.value })}
              placeholder={
                envLocked
                  ? 'مضبوط في البيئة — الصق توكن جديد للاستبدال'
                  : hasAccessToken
                    ? '••••••••'
                    : 'EAA…'
              }
            />
            <span className="text-[10px] text-gray-500">لا يُعرض التوكن بعد الحفظ لأسباب أمنية.</span>
          </label>

          <label className="block text-xs space-y-1">
            <span className="font-semibold text-gray-700">
              رمز التحقق (Verify Token) {hasVerifyToken ? '— محفوظ' : ''}
            </span>
            <input
              dir="ltr"
              className="w-full border rounded-lg px-3 py-2.5 text-sm font-mono text-left"
              value={form.webhook_verify_token}
              onChange={(e) => setForm({ ...form, webhook_verify_token: e.target.value })}
              placeholder="whatsapp_token_…"
            />
          </label>

          <label className="block text-xs space-y-1">
            <span className="font-semibold text-gray-700">رابط التنبيهات (Webhook URL)</span>
            <div className="flex gap-2">
              <input
                dir="ltr"
                readOnly
                className="flex-1 border rounded-lg px-3 py-2.5 text-sm font-mono text-left bg-slate-50"
                value={webhookUrls.primary}
              />
              <button
                type="button"
                onClick={() => void copyWebhook()}
                className="shrink-0 rounded-lg border px-3 text-xs font-bold text-gray-700"
              >
                {copied ? 'تم' : 'نسخ'}
              </button>
            </div>
            <p className="text-[10px] text-gray-500" dir="ltr">
              Alias أيضًا: {webhookUrls.canonical}
            </p>
          </label>
        </div>

        {hint ? (
          <p className="text-xs rounded-lg bg-amber-50 border border-amber-200 text-amber-950 px-3 py-2">
            {hint}
          </p>
        ) : null}
        {testResult ? (
          <p className="text-xs rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-950 px-3 py-2">
            {testResult}
          </p>
        ) : null}

        <button
          type="button"
          disabled={busy || !form.phone_number_id.trim()}
          onClick={() => void saveAndTest()}
          className="w-full rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold py-3 disabled:opacity-50"
        >
          {busy ? 'جارٍ التحديث…' : 'تحديث واختبار الاتصال'}
        </button>
      </div>
    </div>
  );
}
