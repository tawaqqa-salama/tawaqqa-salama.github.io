'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth/AuthProvider';
import type { AppUser } from '@/lib/auth/types';
import { SIDEBAR_NAV, SYSTEM_MODULES } from '@/lib/constants/navigation';
import { departmentsFromPermissions, resolveUserPermissions } from '@/lib/auth/permissions';
import { listRoles } from '@/lib/auth/service';

export default function EmployeePageByUsername() {
  const searchParams = useSearchParams();
  const username = (searchParams.get('username') || '').toLowerCase();
  const { session, canManageStaff } = useAuth();
  const [user, setUser] = useState<AppUser | null>(null);
  const [modules, setModules] = useState<Array<(typeof SYSTEM_MODULES)[number]>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      if (!username) {
        setUser(null);
        setLoading(false);
        return;
      }
      setLoading(true);
      const { data } = await supabase.from('users').select('*').eq('username', username).maybeSingle();
      const found = (data as AppUser | null) ?? null;
      setUser(found);
      if (found) {
        const roles = await listRoles();
        const role = roles.find((item) => item.code === found.role_code) || null;
        const permissions = resolveUserPermissions(found, role);
        const allowed = found.page_modules?.length
          ? found.page_modules
          : departmentsFromPermissions(permissions);
        setModules(
          SYSTEM_MODULES.filter((module) => {
            const nav = SIDEBAR_NAV.find((item) => item.href === module.href);
            return nav ? allowed.includes(nav.department) : false;
          })
        );
      } else {
        setModules([]);
      }
      setLoading(false);
    };
    void load();
  }, [username]);

  if (!username) {
    return <p className="text-gray-500">حدد اسم المستخدم عبر ?username=</p>;
  }
  if (loading) return <p className="text-gray-500">جاري التحميل...</p>;
  if (!user) return <p className="text-gray-500">الموظف غير موجود</p>;

  const isSelf = session?.userId === user.id;
  if (!isSelf && !canManageStaff) {
    return <p className="text-rose-700">لا تملك صلاحية عرض صفحة هذا الموظف</p>;
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-gray-200 bg-white p-6">
        <p className="text-sm text-gray-500">صفحة موظف مخصصة</p>
        <h1 className="text-2xl font-bold text-gray-900 mt-1">{user.page_title || user.full_name}</h1>
        <p className="text-gray-600 mt-2">{user.page_bio || user.job_title || '—'}</p>
        <div className="mt-4 flex flex-wrap gap-2 text-sm text-gray-600">
          <span className="bg-gray-50 border rounded-lg px-3 py-1">@{user.username}</span>
          <span className="bg-gray-50 border rounded-lg px-3 py-1">{user.role_code}</span>
          <span className="bg-gray-50 border rounded-lg px-3 py-1">{user.email}</span>
        </div>
      </section>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {modules.map((module) => (
          <Link
            key={module.href}
            href={module.href}
            className="bg-white border rounded-xl p-5 hover:shadow-sm transition"
          >
            <div className="flex gap-3">
              <span className="text-2xl">{module.icon}</span>
              <div>
                <h3 className="font-bold">{module.title}</h3>
                <p className="text-sm text-gray-500 mt-1">{module.description}</p>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
