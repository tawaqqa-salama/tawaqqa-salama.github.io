'use client';

import Link from 'next/link';
import { getVisibleSidebarNav, SYSTEM_MODULES } from '@/lib/constants/navigation';
import { PLATFORM_NAME, PLATFORM_SHORT_NAME } from '@/lib/constants/branding';
import { useAuth } from '@/lib/auth/AuthProvider';

export default function HomePage() {
  const { session, canAccess, canManageStaff } = useAuth();
  const visibleNav = getVisibleSidebarNav();

  const modules = SYSTEM_MODULES.filter((module) => {
    if (module.status !== 'active') return false;
    const nav = visibleNav.find((item) => item.href === module.href);
    if (!nav) return false;
    if (nav.department === 'settings') return canAccess('settings') || canManageStaff;
    return canAccess(nav.department);
  });

  return (
    <div className="space-y-6">
      <div className="rounded-xl bg-gradient-to-l from-[#a78bfa] to-[#8bc34a] p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <p className="font-bold text-[#0b1020] text-lg">{PLATFORM_NAME}</p>
          <p className="text-sm text-[#0b1020]/80 mt-1 max-w-2xl">
            مرحباً {session?.fullName || ''} — الأقسام أدناه حسب صلاحيات حسابك
          </p>
        </div>
        <Link href="/me" className="text-sm font-semibold text-[#635bdb] hover:underline shrink-0">
          صفحتي الخاصة ←
        </Link>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
        <InfoCell label="اسم المستخدم" value={session?.fullName || '—'} />
        <InfoCell label="اليوزر" value={session?.username ? `@${session.username}` : '—'} />
        <InfoCell label="الدور" value={session?.roleCode || '—'} />
        <InfoCell label="الأنظمة المتاحة" value={`${modules.length} قسم`} highlight />
      </div>

      <div>
        <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
          <span className="text-[#635bdb]">▦</span>
          أنظمة {PLATFORM_SHORT_NAME}
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {modules.map((module) => (
            <Link
              key={module.href}
              href={module.href}
              className="group bg-white rounded-xl border border-gray-200 shadow-sm p-5 hover:shadow-md hover:border-gray-300 transition flex items-start gap-4"
            >
              <div className={`h-14 w-14 rounded-full bg-gradient-to-br ${module.color} flex items-center justify-center text-2xl shrink-0 shadow-sm`}>
                {module.icon}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-bold text-gray-800 group-hover:text-[#635bdb] transition">{module.title}</h3>
                </div>
                <p className="text-sm text-gray-500 mt-1 leading-relaxed">{module.description}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

function InfoCell({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="border-l border-gray-100 first:border-0 pl-4 first:pl-0">
      <p className="text-xs text-gray-400 mb-1">{label}</p>
      <p className={`font-semibold ${highlight ? 'text-[#635bdb]' : 'text-gray-800'}`}>{value}</p>
    </div>
  );
}
