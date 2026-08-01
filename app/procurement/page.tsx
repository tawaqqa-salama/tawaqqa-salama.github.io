import UnderDevelopment from '@/components/shared/UnderDevelopment';
import PageHeader from '@/components/shared/PageHeader';

export default function ProcurementPage() {
  return (
    <div>
      <PageHeader
        title="إدارة المشتريات"
        description="قسم المشتريات والتوريد"
        action={
          <span className="inline-flex items-center rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-800">
            قيد التطوير — Under Development
          </span>
        }
      />
      <UnderDevelopment
        title="إدارة المشتريات"
        description="سيتم إطلاق إدارة طلبات الشراء والموردين وعقود التوريد وربطها بالمحاسبة في الإصدار القادم."
        badge="قيد التطوير"
      />
    </div>
  );
}
