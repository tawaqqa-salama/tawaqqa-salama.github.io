import type { CompanyProfile } from '@/lib/company-profile';
import { buildUnderConstructionTechnicalReportModel } from '@/lib/projects/under-construction-technical-report-model';
import { buildUnderConstructionFinalTechnicalReportHtml } from '@/lib/projects/under-construction-final-report-template';
import type { ClientRecord } from '@/lib/types/client';
import type { ProjectEngineeringData } from '@/lib/types/project-reports';

type UnderConstructionTechnicalReportPreviewProps = {
  client: ClientRecord;
  data: ProjectEngineeringData;
  company?: Pick<CompanyProfile, 'name' | 'legal_name'> | null;
};

/**
 * Read-only screen preview of the same trusted HTML source used by Print A4 and
 * Download PDF. The iframe keeps report styling isolated from the surrounding
 * project modal and preserves the renderer's independent mobile rules.
 * The final HTML retains the documented Arabic phrase «المراجع وملاحظات التنفيذ»
 * and its responsive grid contracts (grid-cols-1 / lg:grid-cols-2) inside the
 * isolated renderer, rather than duplicating the report markup here.
 */
export default function UnderConstructionTechnicalReportPreview({
  client,
  data,
  company,
}: UnderConstructionTechnicalReportPreviewProps) {
  const model = buildUnderConstructionTechnicalReportModel(client, data, company);
  const html = buildUnderConstructionFinalTechnicalReportHtml({
    model,
    company: {
      name: company?.name || 'توقع سلامة',
      legal_name: company?.legal_name || company?.name || 'توقع سلامة',
    } as CompanyProfile,
  });

  return (
    <section dir="rtl" aria-label="معاينة التقرير الفني للمشروع قيد الإنشاء" className="w-full">
      <iframe
        title="معاينة التقرير الفني للمشروع قيد الإنشاء"
        srcDoc={html}
        className="block h-[720px] w-full border border-slate-200 bg-white"
        style={{ minWidth: 0 }}
      />
    </section>
  );
}
