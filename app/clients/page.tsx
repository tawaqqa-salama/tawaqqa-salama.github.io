import { redirect } from 'next/navigation';

export default function ClientsPage() {
  redirect('/marketing?tab=leads');
}
