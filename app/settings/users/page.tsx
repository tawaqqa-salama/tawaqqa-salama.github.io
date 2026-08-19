'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import PageHeader from '@/components/shared/PageHeader';
import { useAuth } from '@/lib/auth/AuthProvider';
import {
  ALL_DEPARTMENTS,
  DEPARTMENT_PERMISSIONS,
} from '@/lib/auth/permissions';
import { listRoles, listUsers, upsertEmployee } from '@/lib/auth/service';
import type { AppRole, AppUser, PermissionCode } from '@/lib/auth/types';
import type { DepartmentId } from '@/lib/constants/navigation';

const EMPTY_FORM = {
  id: '',
  full_name: '',
  email: '',
  phone: '',
  username: '',
  role_code: 'staff',
  job_title: '',
  password: '',
  page_title: '',
  page_bio: '',
  is_active: true,
  deptPermissions: [] as DepartmentId[],
  page_modules: [] as DepartmentId[],
};

export default function UsersSettingsPage() {
  const { canManageStaff, refreshProfile } = useAuth();
  const [users, setUsers] = useState<AppUser[]>([]);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setUsers(await listUsers());
    setRoles(await listRoles());
  };

  useEffect(() => {
    void load();
  }, []);

  const roleOptions = useMemo(
    () =>
      roles.length
        ? roles
        : [
            { id: '1', company_id: null, code: 'admin', name: 'مدير النظام', permissions: ['*'] as PermissionCode[] },
            { id: '2', company_id: null, code: 'engineer', name: 'مهندس', permissions: [] },
            { id: '3', company_id: null, code: 'sales', name: 'مبيعات', permissions: [] },
            { id: '4', company_id: null, code: 'accountant', name: 'محاسب', permissions: [] },
            { id: '5', company_id: null, code: 'staff', name: 'موظف', permissions: [] },
          ],
    [roles]
  );

  if (!canManageStaff) {
    return (
      <div className="bg-white border rounded-xl p-6 text-sm text-rose-700">
        ليس لديك صلاحية إدارة الموظفين.{' '}
        <Link href="/me" className="underline">
          العودة لصفحتي
        </Link>
      </div>
    );
  }

  const editUser = (user: AppUser) => {
    const extraDepts = ALL_DEPARTMENTS.filter((dept) =>
      (user.extra_permissions || []).includes(`dept.${dept}`)
    );
    setForm({
      id: user.id,
      full_name: user.full_name,
      email: user.email,
      phone: user.phone || '',
      username: user.username,
      role_code: user.role_code,
      job_title: user.job_title || '',
      password: '',
      page_title: user.page_title || '',
      page_bio: user.page_bio || '',
      is_active: user.is_active,
      deptPermissions: extraDepts,
      page_modules: user.page_modules || [],
    });
    setError(null);
    setMessage(null);
  };

  const toggleDept = (dept: DepartmentId, key: 'deptPermissions' | 'page_modules') => {
    setForm((prev) => {
      const exists = prev[key].includes(dept);
      return {
        ...prev,
        [key]: exists ? prev[key].filter((item) => item !== dept) : [...prev[key], dept],
      };
    });
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    const extra_permissions = form.deptPermissions.map(
      (dept) => `dept.${dept}` as PermissionCode
    );
    const result = await upsertEmployee({
      id: form.id || undefined,
      full_name: form.full_name,
      email: form.email,
      phone: form.phone,
      username: form.username,
      role_code: form.role_code,
      job_title: form.job_title,
      password: form.password || undefined,
      extra_permissions,
      page_modules: form.page_modules,
      page_title: form.page_title,
      page_bio: form.page_bio,
      is_active: form.is_active,
    });
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setMessage(form.id ? 'تم تحديث الموظف.' : result.message || 'تمت إضافة الموظف بنجاح.');
    setForm(EMPTY_FORM);
    await load();
    await refreshProfile();
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="المستخدمون والصلاحيات"
        description="إنشاء يوزر لكل موظف، تحديد الصلاحيات، وتخصيص صفحته"
      />

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
        <form onSubmit={onSubmit} className="xl:col-span-2 bg-white border rounded-2xl p-5 space-y-3">
          <h2 className="font-bold text-gray-800">{form.id ? 'تعديل موظف' : 'إضافة موظف جديد'}</h2>
          <Field label="الاسم الكامل" value={form.full_name} onChange={(v) => setForm({ ...form, full_name: v })} />
          <Field label="اسم المستخدم (للصفحة)" value={form.username} onChange={(v) => setForm({ ...form, username: v })} />
          <Field label="البريد" value={form.email} onChange={(v) => setForm({ ...form, email: v })} type="email" />
          <Field label="الجوال" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} placeholder={form.id ? '05xxxxxxxx (اختياري)' : '05xxxxxxxx'} />
          <Field label="المسمى الوظيفي" value={form.job_title} onChange={(v) => setForm({ ...form, job_title: v })} />
          <label className="block text-sm">
            <span className="text-gray-600 mb-1 block">الدور</span>
            <select
              value={form.role_code}
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
          <Field
            label={form.id ? 'كلمة مرور جديدة (اختياري)' : 'كلمة المرور'}
            value={form.password}
            onChange={(v) => setForm({ ...form, password: v })}
            type="password"
          />
          <Field label="عنوان الصفحة الخاصة" value={form.page_title} onChange={(v) => setForm({ ...form, page_title: v })} />
          <label className="block text-sm">
            <span className="text-gray-600 mb-1 block">وصف الصفحة الخاصة</span>
            <textarea
              value={form.page_bio}
              onChange={(e) => setForm({ ...form, page_bio: e.target.value })}
              className="w-full border rounded-xl px-3 py-2.5 min-h-20"
            />
          </label>

          <div>
            <p className="text-sm font-semibold text-gray-700 mb-2">صلاحيات أقسام إضافية</p>
            <div className="grid grid-cols-2 gap-2">
              {DEPARTMENT_PERMISSIONS.map((item) => (
                <label key={item.code} className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={form.deptPermissions.includes(item.department)}
                    onChange={() => toggleDept(item.department, 'deptPermissions')}
                  />
                  {item.label}
                </label>
              ))}
            </div>
          </div>

          <div>
            <p className="text-sm font-semibold text-gray-700 mb-2">أقسام الصفحة المخصصة</p>
            <div className="grid grid-cols-2 gap-2">
              {DEPARTMENT_PERMISSIONS.map((item) => (
                <label key={`page-${item.code}`} className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={form.page_modules.includes(item.department)}
                    onChange={() => toggleDept(item.department, 'page_modules')}
                  />
                  {item.label}
                </label>
              ))}
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
            />
            الحساب نشط
          </label>

          {error && <p className="text-sm text-rose-700 bg-rose-50 rounded-lg px-3 py-2">{error}</p>}
          {message && <p className="text-sm text-emerald-700 bg-emerald-50 rounded-lg px-3 py-2">{message}</p>}

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={busy}
              className="flex-1 bg-[#635bdb] text-white rounded-xl py-2.5 font-semibold disabled:opacity-60"
            >
              {busy ? 'جاري الحفظ...' : form.id ? 'حفظ التعديل' : 'إضافة الموظف'}
            </button>
            {form.id && (
              <button
                type="button"
                onClick={() => setForm(EMPTY_FORM)}
                className="px-4 rounded-xl border text-gray-600"
              >
                إلغاء
              </button>
            )}
          </div>
        </form>

        <div className="xl:col-span-3 bg-white border rounded-2xl overflow-hidden">
          <div className="p-4 border-b">
            <h2 className="font-bold text-gray-800">الموظفون ({users.length})</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-right">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="p-3">الموظف</th>
                  <th className="p-3">الدور</th>
                  <th className="p-3">التواصل</th>
                  <th className="p-3">الصفحة</th>
                  <th className="p-3">حالة</th>
                  <th className="p-3">إجراء</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id} className="border-t">
                    <td className="p-3">
                      <p className="font-semibold text-gray-800">{user.full_name}</p>
                      <p className="text-xs text-gray-500">@{user.username}</p>
                    </td>
                    <td className="p-3">{user.role_code}</td>
                    <td className="p-3">
                      <p>{user.email}</p>
                      <p className="text-xs text-gray-500">{user.phone}</p>
                    </td>
                    <td className="p-3">
                      <Link
                        href={`/u/?username=${user.username}`}
                        className="text-[#635bdb] hover:underline"
                      >
                        /u/?username={user.username}
                      </Link>
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
                        onClick={() => editUser(user)}
                        className="text-[#635bdb] font-semibold hover:underline"
                      >
                        تعديل
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <label className="block text-sm">
      <span className="text-gray-600 mb-1 block">{label}</span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full border rounded-xl px-3 py-2.5"
      />
    </label>
  );
}
