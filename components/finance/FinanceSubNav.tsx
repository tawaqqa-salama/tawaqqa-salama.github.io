'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { FINANCE_NAV } from '@/lib/constants/accounting';

export function FinanceMobileNav() {
  const pathname = usePathname();

  return (
    <div className="lg:hidden bg-[#243030] rounded-xl p-2 mb-4 overflow-x-auto">
      <div className="flex gap-1 min-w-max">
        {FINANCE_NAV.map((item) => {
          const isActive =
            item.href === '/finance'
              ? pathname === '/finance'
              : pathname === item.href || pathname.startsWith(`${item.href}/`);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap ${
                isActive ? 'bg-[#b8e986] text-[#2c3333]' : 'text-white/80'
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
