'use client';

import { useCallback, useEffect, useState } from 'react';
import { useLanguage } from '@/lib/i18n/LanguageProvider';
import type { TenantRecord } from '@/lib/tenant/types';

const MODULE_OPTIONS = [
  'crm',
  'marketing',
  'whatsapp',
  'social_media',
  'website',
  'projects',
  'documents',
  'reports',
  'finance',
  'finance_zatca',
  'procurement',
  'hr',
  'design',
  'settings',
];

export default function PlatformAdminPage() {
  const { t } = useLanguage();
  const [stats, setStats] = useState<Record<string, number> | null>(null);
  const [tenants, setTenants] = useState<TenantRecord[]>([]);
  const [audit, setAudit] = useState<Array<Record<string, unknown>>>([]);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: '',
    legalName: '',
    country: 'ID',
    city: 'Jakarta',
    defaultLanguage: 'en',
    secondaryLanguage: 'id',
    defaultCurrency: 'IDR',
    timezone: 'Asia/Jakarta',
    industry: 'real_estate',
    planCode: 'trial',
    modules: ['crm', 'marketing', 'projects', 'documents', 'reports', 'settings'] as string[],
  });

  const load = useCallback(async () => {
    setError(null);
    const [s, tList, a] = await Promise.all([
      fetch('/api/platform/stats').then((r) => r.json()),
      fetch('/api/platform/tenants').then((r) => r.json()),
      fetch('/api/platform/audit').then((r) => r.json()),
    ]);
    if (!s.ok || !tList.ok) {
      setError(s.error || tList.error || 'Platform admin required');
      return;
    }
    setStats(s.stats);
    setTenants(tList.tenants || []);
    if (a.ok) setAudit(a.events || []);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await load();
      if (cancelled) return;
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  const create = async () => {
    const res = await fetch('/api/platform/tenants', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    }).then((r) => r.json());
    if (!res.ok) {
      setError(res.error || 'Create failed');
      return;
    }
    setForm((f) => ({ ...f, name: '', legalName: '' }));
    void load();
  };

  const setStatus = async (id: string, status: string) => {
    await fetch(`/api/platform/tenants/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    void load();
  };

  const supportAccess = async (id: string) => {
    const res = await fetch('/api/platform/support', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ companyId: id, reason: 'support_console' }),
    }).then((r) => r.json());
    if (res.ok) window.location.href = '/';
    else setError(res.error || 'Support access failed');
  };

  return (
    <div className="space-y-5" dir="auto">
      <div>
        <h1 className="text-xl font-bold text-gray-900">{t('platform.title')}</h1>
        <p className="text-sm text-gray-500 mt-1">{t('platform.subtitle')}</p>
      </div>

      {error ? (
        <p className="text-sm rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-red-800">{error}</p>
      ) : null}

      {stats ? (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          {[
            ['Total', stats.total_tenants],
            ['Active', stats.active_tenants],
            ['Suspended', stats.suspended_tenants],
            ['Trial', stats.trial_tenants],
            ['Subscriptions', stats.active_subscriptions],
          ].map(([label, value]) => (
            <div key={String(label)} className="rounded-xl border bg-white p-3">
              <p className="text-[10px] text-gray-500">{label}</p>
              <p className="text-xl font-bold">{value}</p>
            </div>
          ))}
        </div>
      ) : null}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-xl border bg-white p-4 space-y-2">
          <h2 className="font-bold text-sm">{t('platform.createTenant')}</h2>
          {(
            [
              ['name', 'Company name'],
              ['legalName', 'Legal name'],
              ['country', 'Country'],
              ['city', 'City'],
              ['defaultCurrency', 'Currency'],
              ['timezone', 'Timezone'],
              ['industry', 'Industry'],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="block text-xs space-y-1">
              <span className="text-gray-500">{label}</span>
              <input
                className="w-full border rounded-lg px-3 py-2 text-sm"
                value={String(form[key] || '')}
                onChange={(e) => setForm((p) => ({ ...p, [key]: e.target.value }))}
              />
            </label>
          ))}
          <div className="flex flex-wrap gap-2">
            {MODULE_OPTIONS.map((m) => (
              <label key={m} className="text-[11px] border rounded px-2 py-1 flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={form.modules.includes(m)}
                  onChange={(e) =>
                    setForm((p) => ({
                      ...p,
                      modules: e.target.checked
                        ? [...p.modules, m]
                        : p.modules.filter((x) => x !== m),
                    }))
                  }
                />
                {m}
              </label>
            ))}
          </div>
          <button
            type="button"
            onClick={() => void create()}
            className="px-4 py-2 text-sm rounded-lg bg-slate-900 text-white"
          >
            {t('platform.createTenant')}
          </button>
        </div>

        <div className="rounded-xl border bg-white divide-y max-h-[32rem] overflow-auto">
          <div className="p-3 font-bold text-sm sticky top-0 bg-white">{t('platform.tenants')}</div>
          {tenants.map((tenant) => (
            <div key={tenant.id} className="p-3 text-sm space-y-1">
              <div className="flex justify-between gap-2">
                <p className="font-semibold">{tenant.name}</p>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100">{tenant.status}</span>
              </div>
              <p className="text-xs text-gray-500">
                {tenant.country} · {tenant.default_currency} · {tenant.default_language}/{tenant.secondary_language} ·{' '}
                {tenant.timezone}
              </p>
              <p className="text-[11px] text-gray-400">
                Plan: {tenant.subscription_plan} ({tenant.subscription_status}) · {tenant.industry}
              </p>
              <div className="flex flex-wrap gap-2 pt-1">
                <button type="button" className="text-[11px] underline" onClick={() => void setStatus(tenant.id, 'active')}>
                  Activate
                </button>
                <button type="button" className="text-[11px] underline" onClick={() => void setStatus(tenant.id, 'suspended')}>
                  Suspend
                </button>
                <button type="button" className="text-[11px] underline" onClick={() => void supportAccess(tenant.id)}>
                  {t('platform.supportAccess')}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-xl border bg-white p-4">
        <h2 className="font-bold text-sm mb-2">{t('platform.audit')}</h2>
        <ul className="space-y-1 text-xs max-h-48 overflow-auto">
          {audit.slice(0, 30).map((e) => (
            <li key={String(e.id)} className="border-b py-1 flex justify-between gap-2">
              <span>{String(e.action)}</span>
              <span className="text-gray-400">
                {e.created_at ? new Date(String(e.created_at)).toLocaleString() : '—'}
              </span>
            </li>
          ))}
          {!audit.length ? <li className="text-gray-400">No events yet</li> : null}
        </ul>
      </div>
    </div>
  );
}
