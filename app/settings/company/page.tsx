'use client';

import { FormEvent, useEffect, useState, type ReactNode } from 'react';
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

  function onImageChange(file: File | null, key: 'logo_url' | 'stamp_url') {
    if (!file) return;
    if (file.size > 1.5 * 1024 * 1024) {
      setError('حجم الصورة كبير. اختر صورة أصغر من 1.5MB');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      update(key, typeof reader.result === 'string' ? reader.result : '');
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
      setError(result.error);
      return;
    }
    if (result.warning) {
      setMessage(result.warning);
      return;
    }
    setMessage('تم حفظ معلومات الشركة. تُستخدم تلقائياً في عروض الأسعار والفواتير.');
  }

  return (
    <div>
      <PageHeader
        title="معلومات الشركة"
        description="بيانات المكتب والبنك وخطة السداد والشعار والختم — تغذي عروض الأسعار والفواتير وعقود الاتفاق تلقائياً."
        action={
          <Link href="/settings" className="text-sm font-semibold text-[#1f4d3a] hover:underline">
            ← رجوع للإعدادات
          </Link>
        }
      />

      <form onSubmit={onSubmit} className="space-y-4">
        <Section title="بيانات المنشأة">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="اسم الشركة / المكتب الرئيسي" value={form.name} onChange={(v) => update('name', v)} required />
            <Field label="الاسم القانوني" value={form.legal_name} onChange={(v) => update('legal_name', v)} />
            <Field label="الرقم الضريبي (VAT)" value={form.tax_number} onChange={(v) => update('tax_number', v)} dir="ltr" />
            <Field label="السجل التجاري (CR)" value={form.commercial_register} onChange={(v) => update('commercial_register', v)} dir="ltr" />
            <Field label="رقم العضوية" value={form.membership_id} onChange={(v) => update('membership_id', v)} dir="ltr" />
            <Field label="المدينة" value={form.city} onChange={(v) => update('city', v)} />
            <Field label="العنوان" value={form.address} onChange={(v) => update('address', v)} />
            <Field label="الجوال / الهاتف" value={form.phone} onChange={(v) => update('phone', v)} dir="ltr" />
            <Field label="البريد الإلكتروني" value={form.email} onChange={(v) => update('email', v)} dir="ltr" />
            <Field label="بريد بديل" value={form.email_alt} onChange={(v) => update('email_alt', v)} dir="ltr" />
            <Field label="العبارة التعريفية" value={form.tagline} onChange={(v) => update('tagline', v)} />
            <label className="block text-sm">
              <span className="text-xs font-semibold text-gray-600 mb-1 block">سعر المتر المربع (ر.س)</span>
              <input
                type="number"
                min={0}
                step="0.01"
                dir="ltr"
                value={form.price_per_m2 || ''}
                onChange={(e) => update('price_per_m2', Number(e.target.value) || 0)}
                className="w-full border rounded-xl px-3 py-2.5 text-sm font-mono"
              />
            </label>
            <label className="block text-sm">
              <span className="text-xs font-semibold text-gray-600 mb-1 block">صلاحية عرض السعر (بالأيام)</span>
              <input
                type="number"
                min={1}
                max={180}
                dir="ltr"
                value={form.quotation_validity_days || 14}
                onChange={(e) => update('quotation_validity_days', Math.max(1, Number(e.target.value) || 14))}
                className="w-full border rounded-xl px-3 py-2.5 text-sm font-mono"
              />
            </label>
          </div>
        </Section>

        <Section title="الحساب البنكي">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="اسم البنك" value={form.bank_name} onChange={(v) => update('bank_name', v)} />
            <Field label="رقم الحساب" value={form.bank_account} onChange={(v) => update('bank_account', v)} dir="ltr" />
            <Field label="رقم الآيبان (IBAN)" value={form.iban} onChange={(v) => update('iban', v)} dir="ltr" />
          </div>
        </Section>

        <Section title="خطة السداد الافتراضية">
          <div className="grid grid-cols-1 gap-3">
            <Field label="الدفعة الأولى" value={form.payment_first} onChange={(v) => update('payment_first', v)} />
            <Field label="الدفعة الثانية" value={form.payment_second} onChange={(v) => update('payment_second', v)} />
            <Field label="الدفعة الأخيرة" value={form.payment_final} onChange={(v) => update('payment_final', v)} />
            <label className="block text-sm">
              <span className="text-xs font-semibold text-gray-600 mb-1 block">شروط إضافية للوفاء بالدفعات</span>
              <textarea
                value={form.payment_terms}
                onChange={(e) => update('payment_terms', e.target.value)}
                rows={3}
                className="w-full border rounded-xl px-3 py-2.5 text-sm"
              />
            </label>
          </div>
        </Section>

        <Section title="الشعار والختم الرسمي">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold mb-1">شعار الشركة</label>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => onImageChange(e.target.files?.[0] || null, 'logo_url')}
                className="block w-full text-sm text-gray-600"
              />
              {form.logo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={form.logo_url} alt="شعار الشركة" className="mt-3 h-20 w-auto rounded-lg border bg-white p-2" />
              ) : null}
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">الختم الرسمي (صورة)</label>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => onImageChange(e.target.files?.[0] || null, 'stamp_url')}
                className="block w-full text-sm text-gray-600"
              />
              {form.stamp_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={form.stamp_url} alt="ختم الشركة" className="mt-3 h-20 w-auto rounded-lg border bg-white p-2" />
              ) : null}
              <div className="mt-3">
                <Field label="نص الختم (بديل إن لم تُرفع صورة)" value={form.stamp_text} onChange={(v) => update('stamp_text', v)} />
              </div>
            </div>
          </div>
        </Section>

        {error ? <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}
        {message ? (
          <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</p>
        ) : null}

        <button
          type="submit"
          disabled={saving}
          className="px-4 py-2.5 rounded-xl bg-[#1f4d3a] text-white text-sm font-semibold disabled:opacity-60"
        >
          {saving ? 'جاري الحفظ...' : 'حفظ معلومات الشركة'}
        </button>
      </form>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm space-y-4">
      <h2 className="text-base font-bold text-[#1f4d3a]">{title}</h2>
      {children}
    </section>
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
