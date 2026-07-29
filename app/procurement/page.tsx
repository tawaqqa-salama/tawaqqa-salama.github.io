import UnderDevelopment from '@/components/shared/UnderDevelopment';
import PageHeader from '@/components/shared/PageHeader';

export default function ProcurementPage() {
  return (
    <div>
      <PageHeader title="إدارة المشتريات" description="قسم المشتريات والتوريد — قيد التطوير" />
      <UnderDevelopment
        title="إدارة المشتريات"
        description="سيتم إطلاق إدارة طلبات الشراء والموردين وعقود التوريد في الإصدار القادم."
      />
    </div>
  );
}
