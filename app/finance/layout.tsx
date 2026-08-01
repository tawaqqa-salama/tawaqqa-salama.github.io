import { FinanceSubNav } from '@/components/finance/FinanceSubNav';

export default function FinanceLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-full min-w-0">
      <FinanceSubNav />
      {children}
    </div>
  );
}
