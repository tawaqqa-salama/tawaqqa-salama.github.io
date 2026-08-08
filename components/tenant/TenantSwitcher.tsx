'use client';

import { useEffect, useState } from 'react';
import { useLanguage } from '@/lib/i18n/LanguageProvider';

type TenantLite = { id: string; name: string; code?: string };

export default function TenantSwitcher() {
  const { t } = useLanguage();
  const [tenant, setTenant] = useState<TenantLite | null>(null);
  const [memberships, setMemberships] = useState<Array<{ company_id: string }>>([]);
  const [tenants, setTenants] = useState<TenantLite[]>([]);

  useEffect(() => {
    void fetch('/api/tenant/context')
      .then((r) => r.json())
      .then((j) => {
        if (!j.ok) return;
        setTenant(j.tenant);
        setMemberships(j.memberships || []);
        if (j.isPlatformAdmin) {
          void fetch('/api/platform/tenants')
            .then((r) => r.json())
            .then((p) => {
              if (p.ok) setTenants(p.tenants || []);
            });
        } else if (j.tenant) {
          setTenants([j.tenant]);
        }
      });
  }, []);

  if (!tenant) return null;

  const options =
    tenants.length > 0
      ? tenants
      : memberships.map((m) => ({ id: m.company_id, name: m.company_id }));

  return (
    <label className="flex items-center gap-2 text-[11px] text-gray-600">
      <span className="hidden sm:inline">{t('tenant.switcher')}</span>
      <select
        className="border rounded-lg px-2 py-1 max-w-[10rem] bg-white"
        value={tenant.id}
        onChange={(e) => {
          void fetch('/api/tenant/switch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ companyId: e.target.value }),
          }).then((r) => {
            if (r.ok) window.location.reload();
          });
        }}
      >
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
    </label>
  );
}
