'use client';

import Link from 'next/link';
import PageHeader from '@/components/shared/PageHeader';
import { useAuth } from '@/lib/auth/AuthProvider';

export default function SettingsPage() {
  const { canManageStaff, canAccess } = useAuth();

  const cards = [
    {
      title: 'المستخدمون والصلاحيات',
      desc: 'إدارة حسابات الموظفين وصلاحيات الأقسام والصفحات الخاصة',
      href: '/settings/users',
      enabled: canManageStaff,
    },
    {
      title: 'إعدادات الشركة',
      desc: 'بيانات المنشأة، الشعار، الرقم الضريبي',
      href: null,
      enabled: canAccess('settings'),
    },
    {
      title: 'قوالب المستندات',
      desc: 'تخصيص عروض الأسعار والفواتير',
      href: null,
      enabled: canAccess('settings'),
    },
    {
      title: 'كود البناء',
      desc: 'اشتراطات الأنشطة والمساحات',
      href: null,
      enabled: canAccess('settings'),
    },
  ];

  return (
    <div>
      <PageHeader title="الإعدادات" description="إعدادات النظام والمستخدمين والصلاحيات" />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {cards.map((item) => (
          <div key={item.title} className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
            <h3 className="font-bold text-gray-800 mb-2">{item.title}</h3>
            <p className="text-sm text-gray-500 mb-4">{item.desc}</p>
            {item.enabled && item.href ? (
              <Link
                href={item.href}
                className="inline-flex text-sm font-semibold text-[#1f4d3a] hover:underline"
              >
                فتح ←
              </Link>
            ) : (
              <span className="text-xs font-semibold text-amber-700 bg-amber-50 px-3 py-1 rounded-full">
                {item.enabled ? 'قريباً' : 'لا صلاحية'}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
