'use client';

import { useState } from 'react';
import { useLanguage } from '@/lib/i18n/LanguageProvider';
import { SUPPORTED_LOCALES, localeLabel } from '@/lib/i18n/types';

export default function OnboardingPage() {
  const { t, lang, setLang } = useLanguage();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    companyName: '',
    legalName: '',
    country: 'ID',
    city: 'Jakarta',
    address: '',
    phone: '',
    email: '',
    website: '',
    defaultLanguage: 'en',
    secondaryLanguage: 'id',
    defaultCurrency: 'IDR',
    timezone: 'Asia/Jakarta',
    industry: 'real_estate',
    adminName: '',
    adminEmail: '',
    adminPassword: '',
    inviteToken: '',
  });

  const submit = async () => {
    setBusy(true);
    setError(null);
    setMessage(null);
    const res = await fetch('/api/onboarding', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    }).then((r) => r.json());
    setBusy(false);
    if (!res.ok) {
      setError(res.error || 'Failed');
      return;
    }
    setMessage(res.message || 'Created');
    if (form.defaultLanguage === 'en' || form.defaultLanguage === 'id' || form.defaultLanguage === 'ar') {
      setLang(form.defaultLanguage);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-8" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      <div className="max-w-2xl mx-auto space-y-4">
        <div className="flex justify-between items-start gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{t('onboarding.title')}</h1>
            <p className="text-sm text-gray-500 mt-1">{t('onboarding.subtitle')}</p>
          </div>
          <select
            className="border rounded-lg text-xs px-2 py-1"
            value={lang}
            onChange={(e) => setLang(e.target.value as 'ar' | 'en' | 'id')}
          >
            {SUPPORTED_LOCALES.map((l) => (
              <option key={l} value={l}>
                {localeLabel(l)}
              </option>
            ))}
          </select>
        </div>

        <div className="rounded-2xl border bg-white p-5 space-y-3 shadow-sm">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Company</p>
          {(
            [
              ['companyName', 'Company name'],
              ['legalName', 'Legal company name'],
              ['country', 'Country'],
              ['city', 'City'],
              ['address', 'Address'],
              ['phone', 'Phone'],
              ['email', 'Email'],
              ['website', 'Website'],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="block text-xs space-y-1">
              <span className="text-gray-500">{label}</span>
              <input
                className="w-full border rounded-lg px-3 py-2 text-sm"
                value={form[key]}
                onChange={(e) => setForm((p) => ({ ...p, [key]: e.target.value }))}
              />
            </label>
          ))}

          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide pt-2">Regional</p>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs space-y-1">
              <span className="text-gray-500">Language</span>
              <select
                className="w-full border rounded-lg px-3 py-2 text-sm"
                value={form.defaultLanguage}
                onChange={(e) => setForm((p) => ({ ...p, defaultLanguage: e.target.value }))}
              >
                <option value="en">English</option>
                <option value="id">Bahasa Indonesia</option>
                <option value="ar">العربية</option>
              </select>
            </label>
            <label className="text-xs space-y-1">
              <span className="text-gray-500">Currency</span>
              <input
                className="w-full border rounded-lg px-3 py-2 text-sm"
                value={form.defaultCurrency}
                onChange={(e) => setForm((p) => ({ ...p, defaultCurrency: e.target.value }))}
              />
            </label>
            <label className="text-xs space-y-1 col-span-2">
              <span className="text-gray-500">Timezone</span>
              <input
                className="w-full border rounded-lg px-3 py-2 text-sm"
                value={form.timezone}
                onChange={(e) => setForm((p) => ({ ...p, timezone: e.target.value }))}
              />
            </label>
          </div>

          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide pt-2">Admin</p>
          {(
            [
              ['adminName', 'Full name'],
              ['adminEmail', 'Email'],
              ['adminPassword', 'Password'],
              ['inviteToken', 'Invite token (if required)'],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="block text-xs space-y-1">
              <span className="text-gray-500">{label}</span>
              <input
                type={key === 'adminPassword' ? 'password' : 'text'}
                className="w-full border rounded-lg px-3 py-2 text-sm"
                value={form[key]}
                onChange={(e) => setForm((p) => ({ ...p, [key]: e.target.value }))}
              />
            </label>
          ))}

          {error ? <p className="text-xs text-red-600">{error}</p> : null}
          {message ? <p className="text-xs text-emerald-700">{message}</p> : null}

          <button
            type="button"
            disabled={busy}
            onClick={() => void submit()}
            className="w-full py-2.5 rounded-lg bg-teal-700 text-white text-sm font-semibold"
          >
            {busy ? '...' : t('onboarding.title')}
          </button>
        </div>
      </div>
    </div>
  );
}
