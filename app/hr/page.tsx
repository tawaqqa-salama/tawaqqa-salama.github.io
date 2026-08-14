'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import PageHeader from '@/components/shared/PageHeader';
import { useAuth } from '@/lib/auth/AuthProvider';
import { listRoles, listUsers, updateEmployeeHr, upsertEmployee } from '@/lib/auth/service';
import type { AppRole, AppUser } from '@/lib/auth/types';
import { formatCurrency, formatDate } from '@/lib/format/currency';
import { supabase } from '@/lib/supabase';
import { shouldShowInProjects } from '@/lib/business/pipeline';
import { ENGINEERS } from '@/lib/constants/clients';
import ClientDetailModal from '@/components/clients/ClientDetailModal';
import ModuleSubNavSlot from '@/components/layout/ModuleSubNavSlot';
import ModuleTabBar from '@/components/layout/ModuleTabBar';
import { useLanguage } from '@/lib/i18n/LanguageProvider';
import type { ClientRecord } from '@/lib/types/client';

const CONTRACT_TYPES = ['دائم', 'محدد المدة', 'تجربة'] as const;

type HrForm = {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  username: string;
  role_code: string;
  job_title: string;
  password: string;
  salary: string;
  contract_type: string;
  contract_start_date: string;
  contract_end_date: string;
  hire_date: string;
  national_id: string;
  iban: string;
  hr_notes: string;
  is_active: boolean;
};

const EMPTY_FORM: HrForm = {
  id: '',
  full_name: '',
  email: '',
  phone: '',
  username: '',
  role_code: 'staff',
  job_title: '',
  password: '',
  salary: '',
  contract_type: 'دائم',
  contract_start_date: '',
  contract_end_date: '',
  hire_date: '',
  national_id: '',
  iban: '',
  hr_notes: '',
  is_active: true,
};

function contractStatus(user: AppUser): { label: string; className: string } {
  if (!user.contract_end_date) {
    return { label: user.contract_type || 'بدون نهاية', className: 'bg-emerald-50 text-emerald-700' };
  }
  const end = new Date(user.contract_end_date);
  const today = new Date();
  const days = Math.ceil((end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (days < 0) return { label: 'منتهي', className: 'bg-rose-50 text-rose-700' };
  if (days <= 30) return { label: `ينتهي خلال ${days} يوم`, className: 'bg-amber-50 text-amber-800' };
  return { label: user.contract_type || 'ساري', className: 'bg-emerald-50 text-emerald-700' };
}

export default function HRPage() {
  const { canManageStaff } = useAuth();
  const { t } = useLanguage();
  const [tab, setTab] = useState<'employees' | 'assignments'>('employees');
  const [users, setUsers] = useState<AppUser[]>([]);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [form, setForm] = useState<HrForm>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [clientsLoading, setClientsLoading] = useState(false);
  const [selectedClient, setSelectedClient] = useState<ClientRecord | null>(null);

  const loadEmployees = async () => {
    setLoading(true);
    setUsers(await listUsers());
    setRoles(await listRoles());
    setLoading(false);
  };

  const loadAssignments = async () => {
    setClientsLoading(true);
    const { data } = await supabase.from('clients').select('*').order('created_at', { ascending: false });
    setClients(((data || []) as ClientRecord[]).filter(shouldShowInProjects));
    setClientsLoading(false);
  };

  useEffect(() => {
    void loadEmployees();
  }, []);

  useEffect(() => {
    if (tab === 'assignments') void loadAssignments();
  }, [tab]);

  const roleOptions = useMemo(
    () =>
      roles.length
        ? roles
        : [
            { code: 'admin', name: 'مدير النظام' },
            { code: 'engineer', name: 'مهندس' },
            { code: 'sales', name: 'مبيعات' },
            { code: 'accountant', name: 'محاسب' },
            { code: 'staff', name: 'موظف' },
          ],
    [roles]
  );

  const editEmployee = (user: AppUser) => {
    setForm({
      id: user.id,
      full_name: user.full_name,
      email: user.email,
      phone: user.phone || '',
      username: user.username,
      role_code: user.role_code,
      job_title: user.job_title || '',
      password: '',
      salary: user.salary != null ? String(user.salary) : '',
      contract_type: user.contract_type || 'دائم',
      contract_start_date: user.contract_start_date || '',
      contract_end_date: user.contract_end_date || '',
      hire_date: user.hire_date || '',
      national_id: user.national_id || '',
      iban: user.iban || '',
      hr_notes: user.hr_notes || '',
      is_active: user.is_active,
    });
    setError(null);
    setMessage(null);
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!canManageStaff) {
      setError('ليس لديك صلاحية إدارة الموظفين');
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);

    const salaryValue = form.salary.trim() === '' ? null : Number(form.salary);
    if (salaryValue != null && Number.isNaN(salaryValue)) {
      setBusy(false);
      setError('الراتب يجب أن يكون رقماً صحيحاً');
      return;
    }

    if (form.id) {
      const hrResult = await updateEmployeeHr(form.id, {
        salary: salaryValue,
        contract_type: form.contract_type,
        contract_start_date: form.contract_start_date,
        contract_end_date: form.contract_end_date,
        hire_date: form.hire_date,
        national_id: form.national_id,
        iban: form.iban,
        hr_notes: form.hr_notes,
        job_title: form.job_title,
        is_active: form.is_active,
      });
      if (hrResult.error) {
        setBusy(false);
        setError(hrResult.error);
        return;
      }
      const profileResult = await upsertEmployee({
        id: form.id,
        full_name: form.full_name,
        email: form.email,
        phone: form.phone,
        username: form.username,
        role_code: form.role_code,
        job_title: form.job_title,
        password: form.password || undefined,
        is_active: form.is_active,
        salary: salaryValue,
        contract_type: form.contract_type,
        contract_start_date: form.contract_start_date,
        contract_end_date: form.contract_end_date,
        hire_date: form.hire_date,
        national_id: form.national_id,
        iban: form.iban,
        hr_notes: form.hr_notes,
      });
      setBusy(false);
      if (profileResult.error) {
        setError(profileResult.error);
        return;
      }
      setMessage('تم تحديث بيانات الموظف');
    } else {
      const result = await upsertEmployee({
        full_name: form.full_name,
        email: form.email,
        phone: form.phone,
        username: form.username,
        role_code: form.role_code,
        job_title: form.job_title,
        password: form.password,
        is_active: form.is_active,
        salary: salaryValue,
        contract_type: form.contract_type,
        contract_start_date: form.contract_start_date,
        contract_end_date: form.contract_end_date,
        hire_date: form.hire_date,
        national_id: form.national_id,
        iban: form.iban,
        hr_notes: form.hr_notes,
      });
      setBusy(false);
      if (result.error) {
        setError(result.error);
        return;
      }
      setMessage('تم إضافة الموظف');
    }

    setForm(EMPTY_FORM);
    await loadEmployees();
  };

  const quickAssign = async (clientId: string, engineer: string) => {
    const { error: assignError } = await supabase
      .from('clients')
      .update({ assigned_engineer: engineer })
      .eq('id', clientId);
    if (assignError) alert(assignError.message);
    else loadAssignments();
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('hr.title')}
        description={t('hr.subtitle')}
      />

      <ModuleSubNavSlot label={t('subnav.hr')}>
        <ModuleTabBar
          ariaLabel={t('subnav.hr')}
          activeId={tab}
          onChange={(id) => setTab(id as 'employees' | 'assignments')}
          activeClassName="bg-[#635bdb] text-white shadow-sm"
          idleClassName="bg-white border border-gray-200 text-gray-700"
          items={[
            { id: 'employees', label: t('hr.tab.employees') },
            { id: 'assignments', label: t('hr.tab.assignments') },
            ...(canManageStaff
              ? [{ id: 'permissions', label: t('hr.permissionsLink'), href: '/settings/users' }]
              : []),
          ]}
        />
      </ModuleSubNavSlot>

      {tab === 'employees' ? (
        <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
          <form onSubmit={onSubmit} className="xl:col-span-2 bg-white border rounded-2xl p-5 space-y-3">
            <h2 className="font-bold text-gray-800">{form.id ? 'تعديل بيانات موظف' : 'إضافة موظف جديد'}</h2>
            {!canManageStaff && (
              <p className="text-sm text-rose-700 bg-rose-50 rounded-lg px-3 py-2">عرض فقط — لا توجد صلاحية تعديل.</p>
            )}
            <Field label="الاسم الكامل" value={form.full_name} onChange={(v) => setForm({ ...form, full_name: v })} disabled={!canManageStaff} />
            <Field label="اسم المستخدم" value={form.username} onChange={(v) => setForm({ ...form, username: v })} disabled={!canManageStaff || !!form.id} />
            <Field label="البريد" value={form.email} onChange={(v) => setForm({ ...form, email: v })} type="email" disabled={!canManageStaff} />
            <Field label="الجوال" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} placeholder={form.id ? '05xxxxxxxx (اختياري)' : '05xxxxxxxx'} disabled={!canManageStaff} />
            <Field label="المسمى الوظيفي" value={form.job_title} onChange={(v) => setForm({ ...form, job_title: v })} disabled={!canManageStaff} />
            <label className="block text-sm">
              <span className="text-gray-600 mb-1 block">الدور</span>
              <select
                value={form.role_code}
                disabled={!canManageStaff}
                onChange={(e) => setForm({ ...form, role_code: e.target.value })}
                className="w-full border rounded-xl px-3 py-2.5"
              >
                {roleOptions.map((role) => (
                  <option key={role.code} value={role.code}>
                    {role.name}
                  </option>
                ))}
              </select>
            </label>
            {!form.id && (
              <Field
                label="كلمة المرور"
                value={form.password}
                onChange={(v) => setForm({ ...form, password: v })}
                type="password"
                disabled={!canManageStaff}
              />
            )}

            <div className="border-t pt-3 space-y-3">
              <p className="text-sm font-semibold text-gray-800">تفاصيل العقد والراتب</p>
              <Field label="الراتب الشهري (ر.س)" value={form.salary} onChange={(v) => setForm({ ...form, salary: v })} type="number" disabled={!canManageStaff} />
              <label className="block text-sm">
                <span className="text-gray-600 mb-1 block">نوع العقد</span>
                <select
                  value={form.contract_type}
                  disabled={!canManageStaff}
                  onChange={(e) => setForm({ ...form, contract_type: e.target.value })}
                  className="w-full border rounded-xl px-3 py-2.5"
                >
                  {CONTRACT_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </label>
              <Field label="تاريخ التعيين" value={form.hire_date} onChange={(v) => setForm({ ...form, hire_date: v })} type="date" disabled={!canManageStaff} />
              <Field label="بداية العقد" value={form.contract_start_date} onChange={(v) => setForm({ ...form, contract_start_date: v })} type="date" disabled={!canManageStaff} />
              <Field label="نهاية العقد" value={form.contract_end_date} onChange={(v) => setForm({ ...form, contract_end_date: v })} type="date" disabled={!canManageStaff} />
              <Field label="رقم الهوية" value={form.national_id} onChange={(v) => setForm({ ...form, national_id: v })} disabled={!canManageStaff} />
              <Field label="الآيبان" value={form.iban} onChange={(v) => setForm({ ...form, iban: v })} disabled={!canManageStaff} />
              <label className="block text-sm">
                <span className="text-gray-600 mb-1 block">ملاحظات</span>
                <textarea
                  value={form.hr_notes}
                  disabled={!canManageStaff}
                  onChange={(e) => setForm({ ...form, hr_notes: e.target.value })}
                  className="w-full border rounded-xl px-3 py-2.5 min-h-20"
                />
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={form.is_active}
                  disabled={!canManageStaff}
                  onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                />
                الموظف نشط
              </label>
            </div>

            {error && <p className="text-sm text-rose-700 bg-rose-50 rounded-lg px-3 py-2">{error}</p>}
            {message && <p className="text-sm text-emerald-700 bg-emerald-50 rounded-lg px-3 py-2">{message}</p>}

            {canManageStaff && (
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={busy}
                  className="flex-1 bg-[#635bdb] text-white rounded-xl py-2.5 font-semibold disabled:opacity-60"
                >
                  {busy ? 'جاري الحفظ...' : form.id ? 'حفظ التعديل' : 'إضافة الموظف'}
                </button>
                {form.id && (
                  <button type="button" onClick={() => setForm(EMPTY_FORM)} className="px-4 rounded-xl border text-gray-600">
                    إلغاء
                  </button>
                )}
              </div>
            )}
          </form>

          <div className="xl:col-span-3 bg-white border rounded-2xl overflow-hidden">
            <div className="p-4 border-b flex items-center justify-between gap-3">
              <h2 className="font-bold text-gray-800">سجل الموظفين ({users.length})</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-right">
                <thead className="bg-gray-50 text-gray-600">
                  <tr>
                    <th className="p-3">الموظف</th>
                    <th className="p-3">المسمى</th>
                    <th className="p-3">الراتب</th>
                    <th className="p-3">العقد</th>
                    <th className="p-3">المدة</th>
                    <th className="p-3">حالة</th>
                    <th className="p-3">إجراء</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-gray-400">
                        جاري التحميل...
                      </td>
                    </tr>
                  ) : users.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-gray-400">
                        لا يوجد موظفون بعد
                      </td>
                    </tr>
                  ) : (
                    users.map((user) => {
                      const status = contractStatus(user);
                      return (
                        <tr key={user.id} className="border-t hover:bg-gray-50">
                          <td className="p-3">
                            <p className="font-semibold text-gray-800">{user.full_name}</p>
                            <p className="text-xs text-gray-500">{user.email}</p>
                            <p className="text-xs text-gray-500">{user.phone || '—'}</p>
                          </td>
                          <td className="p-3">
                            <p>{user.job_title || '—'}</p>
                            <p className="text-xs text-gray-500">{user.role_code}</p>
                          </td>
                          <td className="p-3 font-semibold text-[#635bdb]">
                            {user.salary != null ? formatCurrency(user.salary) : '—'}
                          </td>
                          <td className="p-3">
                            <span className={`text-xs px-2 py-1 rounded-full ${status.className}`}>{status.label}</span>
                          </td>
                          <td className="p-3 text-xs text-gray-600">
                            <p>من: {formatDate(user.contract_start_date || user.hire_date)}</p>
                            <p>إلى: {formatDate(user.contract_end_date)}</p>
                          </td>
                          <td className="p-3">
                            <span
                              className={`text-xs px-2 py-1 rounded-full ${
                                user.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'
                              }`}
                            >
                              {user.is_active ? 'نشط' : 'موقوف'}
                            </span>
                          </td>
                          <td className="p-3">
                            <button
                              type="button"
                              onClick={() => editEmployee(user)}
                              className="text-[#635bdb] font-semibold hover:underline"
                            >
                              تفاصيل
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
          <table className="w-full text-right text-sm">
            <thead className="bg-gray-50 border-b text-gray-600">
              <tr>
                <th className="p-4">المشروع / العميل</th>
                <th className="p-4">المدينة</th>
                <th className="p-4">المهندس الحالي</th>
                <th className="p-4">تعيين سريع</th>
                <th className="p-4">تفاصيل</th>
              </tr>
            </thead>
            <tbody>
              {clientsLoading ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-gray-400">
                    جاري التحميل...
                  </td>
                </tr>
              ) : clients.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-gray-400">
                    لا توجد معاملات جاهزة للتعيين (تحتاج اعتماد مالي أولاً)
                  </td>
                </tr>
              ) : (
                clients.map((client) => (
                  <tr key={client.id} className="border-b hover:bg-gray-50">
                    <td className="p-4 font-semibold">{client.business_name || client.name}</td>
                    <td className="p-4">{client.city || '—'}</td>
                    <td className="p-4">{client.assigned_engineer || '— غير معيّن —'}</td>
                    <td className="p-4">
                      <select
                        className="border rounded-lg text-xs p-2 bg-white"
                        value=""
                        onChange={(e) => e.target.value && quickAssign(client.id, e.target.value)}
                      >
                        <option value="">اختر مهندس...</option>
                        {ENGINEERS.map((eng) => (
                          <option key={eng} value={eng}>
                            {eng}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="p-4">
                      <button
                        onClick={() => setSelectedClient(client)}
                        className="px-3 py-1.5 bg-indigo-50 text-indigo-700 rounded-lg text-xs font-semibold"
                      >
                        إدارة المهمة
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          <ClientDetailModal
            client={selectedClient}
            department="hr"
            onClose={() => setSelectedClient(null)}
            onUpdated={loadAssignments}
          />
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <label className="block text-sm">
      <span className="text-gray-600 mb-1 block">{label}</span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="w-full border rounded-xl px-3 py-2.5 disabled:bg-gray-50"
      />
    </label>
  );
}
