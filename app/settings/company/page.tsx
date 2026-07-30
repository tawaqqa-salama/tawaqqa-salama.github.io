'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import PageHeader from '@/components/shared/PageHeader';
import {
  DEFAULT_COMPANY_PROFILE,
  loadCompanyProfile,
  saveCompanyProfile,
  type CompanyProfile,
} from '@/lib/company-profile';

export default function CompanySettingsPage() {
  const [form, setForm] = useState<CompanyProfile>(DEFAULT_COMPANY_PROFILE);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadCompanyProfile().then(setForm);
  }, []);

  function update<K extends keyof CompanyProfile>(key: K, value: CompanyProfile[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function onLogoChange(file: File | null) {
    if (!file) return;
    if (file.size > 1.5 * 1024 * 1024) {
      setError('حجم الشعار كبير. اختر صورة أصغر من 1.5MB');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      update('logo_url', typeof reader.result === 'string' ? reader.result : '');
    };
    reader.readAsDataURL(file);
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);
    const result = await saveCompanyProfile(form);
    setSaving(false);
    if (result.error) {
      setMessage('حُفظ محلياً. لتفعيل الحفظ في قاعدة البيانات نفّذ SQL الحقول الإضافية أولاً.');
      setError(result.error);
      return;
    }
    setMessage('تم حفظ بيانات المكتب الهندسي. تُستخدم في ترويسة التقرير الفني وملف PDF.');
  }

  return (
    <div>
      <PageHeader
        title="إعدادات الشركة"
        description="شعار المكتب ومعلومات الترويسة والتذييل المستخدمة في التقرير الفني وملفات PDF."
        action={
          <Link href="/settings" className="text-sm font-semibold text-[#1f4d3a] hover:underline">
            ← رجوع للإعدادات
          </Link>
        }
      />

      <form onSubmit={onSubmit} className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="اسم المكتب (مختصر)" value={form.name} onChange={(v) => update('name', v)} required />
          <Field label="الاسم القانوني" value={form.legal_name} onChange={(v) => update('legal_name', v)} />
          <Field label="الشعار / العبارة الإعلانية" value={form.tagline} onChange={(v) => update('tagline', v)} />
          <Field label="المدينة" value={form.city} onChange={(v) => update('city', v)} />
          <Field label="العنوان" value={form.address} onChange={(v) => update('address', v)} />
          <Field label="السجل التجاري" value={form.commercial_register} onChange={(v) => update('commercial_register', v)} />
          <Field label="رقم العضوية" value={form.membership_id} onChange={(v) => update('membership_id', v)} />
          <Field label="الرقم الضريبي" value={form.tax_number} onChange={(v) => update('tax_number', v)} />
          <Field label="الهاتف" value={form.phone} onChange={(v) => update('phone', v)} dir="ltr" />
          <Field label="الفاكس / التحويلة" value={form.fax} onChange={(v) => update('fax', v)} dir="ltr" />
          <Field label="البريد" value={form.email} onChange={(v) => update('email', v)} dir="ltr" />
          <Field label="بريد بديل" value={form.email_alt} onChange={(v) => update('email_alt', v)} dir="ltr" />
          <Field label="نص الختم" value={form.stamp_text} onChange={(v) => update('stamp_text', v)} />
        </div>

        <div>
          <label className="block text-xs font-semibold mb-1">شعار المكتب</label>
          <input
            type="file"
            accept="image/*"
            onChange={(e) => onLogoChange(e.target.files?.[0] || null)}
            className="block w-full text-sm text-gray-600"
          />
          {form.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={form.logo_url} alt="شعار الشركة" className="mt-3 h-20 w-auto rounded-lg border bg-white p-2" />
          ) : null}
        </div>

        {error ? <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}
        {message ? (
          <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</p>
        ) : null}

        <button
          type="submit"
          disabled={saving}
          className="px-4 py-2.5 rounded-xl bg-[#1f4d3a] text-white text-sm font-semibold disabled:opacity-60"
        >
          {saving ? 'جاري الحفظ...' : 'حفظ بيانات الشركة'}
        </button>
      </form>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  required,
  dir,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  dir?: 'ltr' | 'rtl';
}) {
  return (
    <label className="block text-sm">
      <span className="text-xs font-semibold text-gray-600 mb-1 block">{label}</span>
      <input
        required={required}
        dir={dir}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full border rounded-xl px-3 py-2.5 text-sm"
      />
    </label>
  );
}
