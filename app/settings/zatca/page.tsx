'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import PageHeader from '@/components/shared/PageHeader';
import { DEFAULT_ZATCA_SETTINGS } from '@/lib/zatca/constants';
import { generateEgsKeyPair } from '@/lib/zatca/crypto';
import { loadZatcaSettings, saveZatcaSettings } from '@/lib/zatca/settings';
import type { ZatcaEnvironment, ZatcaInvoiceKind, ZatcaSettings } from '@/lib/zatca/types';

export default function ZatcaSettingsPage() {
  const [form, setForm] = useState<ZatcaSettings>(DEFAULT_ZATCA_SETTINGS);
  const [saving, setSaving] = useState(false);
  const [onboarding, setOnboarding] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadZatcaSettings().then(setForm);
  }, []);

  function update<K extends keyof ZatcaSettings>(key: K, value: ZatcaSettings[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);
    const result = await saveZatcaSettings(form);
    setSaving(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    if (result.warning) {
      setMessage(result.warning);
      return;
    }
    setMessage('تم حفظ إعدادات الربط مع هيئة الزكاة والضريبة والجمارك (ZATCA).');
  }

  function generateKeys() {
    const pair = generateEgsKeyPair();
    update('private_key_pem', pair.privateKeyPem);
    if (!form.egss_serial) {
      update('egss_serial', `EGS-${pair.publicKeyHex.slice(0, 12).toUpperCase()}`);
    }
    setMessage('تم توليد مفتاح EGS (secp256k1). احفظ الإعدادات ثم أرفق CSR من منصة فاتورة/OpenSSL.');
  }

  async function runOnboarding(mode: 'compliance' | 'production') {
    setOnboarding(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch('/api/zatca/onboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          mode === 'compliance'
            ? {
                mode,
                csr: form.csr_pem,
                otp: form.otp,
                environment: form.environment,
              }
            : {
                mode,
                settings: form,
                environment: form.environment,
              }
        ),
      });
      const data = (await response.json()) as {
        ok?: boolean;
        error?: string;
        binarySecurityToken?: string;
        secret?: string;
        requestID?: string;
      };

      if (!response.ok || !data.ok) {
        setError(
          data.error ||
            'فشل Onboarding. على النشر الثابت (GitHub Pages) يجب تشغيل السيرفر/API أو استخدام بيئة Node.'
        );
        return;
      }

      const next: ZatcaSettings = {
        ...form,
        csid: data.binarySecurityToken || form.csid,
        secret: data.secret || form.secret,
        compliance_request_id: data.requestID || form.compliance_request_id,
      };
      setForm(next);
      await saveZatcaSettings(next);
      setMessage(
        mode === 'compliance'
          ? 'تم استلام Compliance CSID بنجاح. يمكنك الآن اختبار الإرسال ثم طلب Production CSID.'
          : 'تم استلام Production CSID بنجاح.'
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر الاتصال بواجهة Onboarding');
    } finally {
      setOnboarding(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="إعدادات ZATCA (الفوترة الإلكترونية)"
        description="Phase 2 — Onboarding، CSID، Sandbox/Production، وإرسال الفواتير (Reporting/Clearance)."
        action={
          <Link href="/settings" className="text-sm font-semibold text-[#1f4d3a] hover:underline">
            ← رجوع للإعدادات
          </Link>
        }
      />

      <form onSubmit={onSubmit} className="space-y-4">
        <section className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm space-y-4">
          <h2 className="text-base font-bold text-[#1f4d3a]">الربط والبيئة</h2>
          <label className="flex items-center gap-2 text-sm font-semibold">
            <input
              type="checkbox"
              checked={form.enabled}
              onChange={(e) => update('enabled', e.target.checked)}
            />
            تفعيل الإرسال التلقائي إلى ZATCA عند اعتماد عرض السعر وتحويله لفاتورة
          </label>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="block text-sm">
              <span className="text-xs font-semibold text-gray-600 mb-1 block">بيئة العمل</span>
              <select
                value={form.environment}
                onChange={(e) => update('environment', e.target.value as ZatcaEnvironment)}
                className="w-full border rounded-xl px-3 py-2.5 text-sm bg-white"
              >
                <option value="sandbox">Sandbox (Developer Portal)</option>
                <option value="simulation">Simulation</option>
                <option value="production">Production</option>
              </select>
            </label>
            <label className="block text-sm">
              <span className="text-xs font-semibold text-gray-600 mb-1 block">نوع الفاتورة الافتراضي</span>
              <select
                value={form.invoice_kind}
                onChange={(e) => update('invoice_kind', e.target.value as ZatcaInvoiceKind)}
                className="w-full border rounded-xl px-3 py-2.5 text-sm bg-white"
              >
                <option value="simplified">مبسطة — Reporting (B2C)</option>
                <option value="standard">قياسية — Clearance (B2B)</option>
              </select>
            </label>
            <Field label="اسم الحل (Solution Name)" value={form.solution_name} onChange={(v) => update('solution_name', v)} />
            <Field label="الرقم التسلسلي للجهاز (EGS Serial)" value={form.egss_serial} onChange={(v) => update('egss_serial', v)} dir="ltr" />
          </div>
        </section>

        <section className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm space-y-4">
          <h2 className="text-base font-bold text-[#1f4d3a]">Onboarding — OTP و CSID</h2>
          <p className="text-xs text-gray-500">
            أدخل رمز OTP من منصة فاتورة، ثم الصق شهادة CSR، واضغط تسجيل الجهاز. تُحفظ CSID/Secret تلقائياً.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="رمز OTP (من منصة فاتورة)" value={form.otp} onChange={(v) => update('otp', v)} dir="ltr" />
            <Field label="Compliance Request ID" value={form.compliance_request_id} onChange={(v) => update('compliance_request_id', v)} dir="ltr" />
            <label className="block text-sm md:col-span-2">
              <span className="text-xs font-semibold text-gray-600 mb-1 block">CSR (Certificate Signing Request)</span>
              <textarea
                value={form.csr_pem}
                onChange={(e) => update('csr_pem', e.target.value)}
                rows={4}
                dir="ltr"
                className="w-full border rounded-xl px-3 py-2.5 text-xs font-mono"
                placeholder="-----BEGIN CERTIFICATE REQUEST-----"
              />
            </label>
            <label className="block text-sm md:col-span-2">
              <span className="text-xs font-semibold text-gray-600 mb-1 block">CSID / Binary Security Token</span>
              <textarea
                value={form.csid}
                onChange={(e) => update('csid', e.target.value)}
                rows={3}
                dir="ltr"
                className="w-full border rounded-xl px-3 py-2.5 text-xs font-mono"
              />
            </label>
            <Field label="Secret" value={form.secret} onChange={(v) => update('secret', v)} dir="ltr" />
            <label className="block text-sm md:col-span-2">
              <span className="text-xs font-semibold text-gray-600 mb-1 block">المفتاح الخاص للجهاز (Private Key)</span>
              <textarea
                value={form.private_key_pem}
                onChange={(e) => update('private_key_pem', e.target.value)}
                rows={3}
                dir="ltr"
                className="w-full border rounded-xl px-3 py-2.5 text-xs font-mono"
              />
            </label>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={generateKeys}
              className="px-3 py-2 rounded-xl border text-sm font-semibold"
            >
              توليد مفتاح EGS
            </button>
            <button
              type="button"
              disabled={onboarding || !form.otp || !form.csr_pem}
              onClick={() => void runOnboarding('compliance')}
              className="px-3 py-2 rounded-xl bg-[#1f4d3a] text-white text-sm font-semibold disabled:opacity-50"
            >
              {onboarding ? 'جاري التسجيل...' : 'تسجيل الجهاز (Compliance CSID)'}
            </button>
            <button
              type="button"
              disabled={onboarding || !form.csid || !form.secret}
              onClick={() => void runOnboarding('production')}
              className="px-3 py-2 rounded-xl bg-blue-700 text-white text-sm font-semibold disabled:opacity-50"
            >
              طلب Production CSID
            </button>
          </div>
        </section>

        {error ? <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}
        {message ? (
          <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</p>
        ) : null}

        <button
          type="submit"
          disabled={saving}
          className="px-4 py-2.5 rounded-xl bg-[#1f4d3a] text-white text-sm font-semibold disabled:opacity-60"
        >
          {saving ? 'جاري الحفظ...' : 'حفظ إعدادات ZATCA'}
        </button>
      </form>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  dir,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  dir?: 'ltr' | 'rtl';
}) {
  return (
    <label className="block text-sm">
      <span className="text-xs font-semibold text-gray-600 mb-1 block">{label}</span>
      <input
        dir={dir}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full border rounded-xl px-3 py-2.5 text-sm"
      />
    </label>
  );
}
