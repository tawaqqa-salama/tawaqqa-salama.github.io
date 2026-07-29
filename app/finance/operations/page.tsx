import { redirect } from 'next/navigation';

export default function FinanceOperationsRedirect() {
  redirect('/finance/vouchers?tab=approvals');
}
