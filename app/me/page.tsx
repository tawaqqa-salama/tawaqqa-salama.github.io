'use client';

import Link from 'next/link';
import { useAuth } from '@/lib/auth/AuthProvider';
import { getVisibleSidebarNav, SYSTEM_MODULES } from '@/lib/constants/navigation';
import { ALL_DEPARTMENTS, departmentsFromPermissions } from '@/lib/auth/permissions';

export default function MyPage() {
  const { session, profile, permissions, canManageStaff } = useAuth();

  if (!session || !profile) return null;

  // المدير (*) يرى كل الأقسام المفعّلة حتى لو page_modules قديمة بدون المشتريات
  const allowedDepartments = permissions.includes('*')
    ? ALL_DEPARTMENTS
    : profile.page_modules?.length
      ? profile.page_modules
      : departmentsFromPermissions(permissions);

  const visibleNav = getVisibleSidebarNav();
  const modules = SYSTEM_MODULES.filter((module) => {
    if (module.status !== 'active') return false;
    const nav = visibleNav.find((item) => item.href === module.href);
    return nav ? allowedDepartments.includes(nav.department) : false;
  });

  return (
    <div className="space-y-6">
      <section className="rounded-2xl bg-gradient-to-l from-[#1f4d3a] to-[#2f6b4f] text-white p-6 md:p-8">
        <p className="text-sm text-white/70">صفحتي الخاصة</p>
        <h1 className="text-2xl md:text-3xl font-bold mt-1">
          {profile.page_title || `مرحباً، ${profile.full_name}`}
        </h1>
        <p className="mt-2 text-white/85 max-w-2xl">
          {profile.page_bio || 'هذه مساحتك الشخصية حسب صلاحياتك في المنصة.'}
        </p>
        <div className="mt-5 flex flex-wrap gap-3 text-sm">
          <span className="bg-white/10 rounded-lg px-3 py-1.5">@{profile.username}</span>
          <span className="bg-white/10 rounded-lg px-3 py-1.5">{profile.job_title || profile.role_code}</span>
          <span className="bg-white/10 rounded-lg px-3 py-1.5">{profile.email}</span>
          {profile.phone && <span className="bg-white/10 rounded-lg px-3 py-1.5">{profile.phone}</span>}
        </div>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <InfoCard title="الدور" value={profile.role_code} />
        <InfoCard title="عدد الصلاحيات" value={String(permissions.includes('*') ? 'كاملة' : permissions.length)} />
        <InfoCard title="آخر دخول" value={session.loggedInAt.slice(0, 16).replace('T', ' ')} />
      </section>

      <section>
        <div className="flex items-center justify-between mb-3 gap-3">
          <h2 className="text-lg font-bold text-gray-800">أقسام صفحتي</h2>
          {canManageStaff && (
            <Link href="/settings/users" className="text-sm font-semibold text-[#1f4d3a] hover:underline">
              إدارة الموظفين ←
            </Link>
          )}
        </div>
        {modules.length === 0 ? (
          <p className="bg-white border rounded-xl p-6 text-sm text-gray-500">
            لا توجد أقسام مفعّلة لحسابك بعد. تواصل مع المدير لإضافة صلاحيات.
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {modules.map((module) => (
              <Link
                key={module.href}
                href={module.href}
                className="bg-white border border-gray-200 rounded-xl p-5 hover:border-[#1f4d3a]/40 hover:shadow-sm transition"
              >
                <div className="flex items-start gap-3">
                  <span className="text-2xl">{module.icon}</span>
                  <div>
                    <h3 className="font-bold text-gray-800">{module.title}</h3>
                    <p className="text-sm text-gray-500 mt-1">{module.description}</p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="bg-white border border-gray-200 rounded-xl p-5">
        <h2 className="font-bold text-gray-800 mb-3">رابط الصفحة المخصصة</h2>
        <p className="text-sm text-gray-600">
          يمكنك مشاركة صفحتك الداخلية عبر:{' '}
          <Link
            href={`/u/?username=${profile.username}`}
            className="font-mono text-[#1f4d3a] hover:underline"
          >
            /u/?username={profile.username}
          </Link>
        </p>
      </section>
    </div>
  );
}

function InfoCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <p className="text-xs text-gray-400 mb-1">{title}</p>
      <p className="font-semibold text-gray-800">{value}</p>
    </div>
  );
}
