import { FinanceSidebarNav } from '@/components/layout/AppSidebar';
import { FinanceMobileNav } from '@/components/finance/FinanceSubNav';

export default function FinanceLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-5">
      <FinanceSidebarNav />
      <div className="flex-1 min-w-0">
        <FinanceMobileNav />
        {children}
      </div>
    </div>
  );
}
