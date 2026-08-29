'use client';

import type { CompanyProfile } from '@/lib/company-profile';
import {
  buildExistingTechnicalReportModel,
  existingTechnicalReportStatusClass,
  existingTechnicalReportStatusLabel,
  type ExistingTechnicalReportSystemAssessment,
} from '@/lib/projects/existing-technical-report-model';
import type { ClientRecord } from '@/lib/types/client';
import type { ProjectEngineeringData } from '@/lib/types/project-reports';
import { userFacingSourceLabel } from '@/lib/projects/preview-display';

type ExistingTechnicalReportPreviewProps = {
  client: ClientRecord;
  data: ProjectEngineeringData;
  company?: Pick<CompanyProfile, 'name' | 'legal_name'> | null;
};

function ValueBlock({ label, value, tone = 'slate' }: { label: string; value: string | null; tone?: 'slate' | 'blue' | 'amber' | 'rose' }) {
  const toneClass = {
    slate: 'border-slate-200 bg-slate-50 text-slate-800',
    blue: 'border-blue-200 bg-blue-50 text-blue-950',
    amber: 'border-amber-200 bg-amber-50 text-amber-950',
    rose: 'border-rose-200 bg-rose-50 text-rose-950',
  }[tone];
  return (
    <div className={`min-w-0 border p-3 ${toneClass}`}>
      <p className="text-xs font-bold text-slate-600">{label}</p>
      <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-7">{value || 'لم تُسجل بيانات لهذا الحقل.'}</p>
    </div>
  );
}

function SystemAssessmentCard({ assessment }: { assessment: ExistingTechnicalReportSystemAssessment }) {
  const status = assessment.compliance_status;
  if (status === 'NOT_APPLICABLE') {
    return (
      <article className="border border-slate-200 bg-white p-4 sm:p-5" aria-label={`تقييم ${assessment.system_label}`}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h4 className="text-base font-bold text-slate-950">{assessment.system_label}</h4>
            <p className="mt-1 text-sm leading-7 text-slate-700">الحالة: لا ينطبق بقرار صريح من المهندس.</p>
            {assessment.notes ? <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-7 text-slate-700">{assessment.notes}</p> : null}
          </div>
          <span className={`w-fit border px-2.5 py-1 text-xs font-bold ${existingTechnicalReportStatusClass(status)}`}>
            {existingTechnicalReportStatusLabel(status)}
          </span>
        </div>
        {assessment.evidence.length ? <p className="mt-3 text-xs text-slate-600">مراجع الأدلة: {assessment.evidence.map((evidence) => evidence.id).join('، ')}</p> : null}
      </article>
    );
  }
  return (
    <article className="border border-slate-200 bg-white p-4 sm:p-5" aria-label={`تقييم ${assessment.system_label}`}>
      <div className="flex flex-col gap-3 border-b border-slate-200 pb-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h4 className="text-base font-bold text-slate-950">{assessment.system_label}</h4>
          <p className="mt-1 text-xs text-slate-600">
            {assessment.applicable === false ? 'حالة الانطباق: غير منطبق بقرار مهندس' : assessment.applicable === true ? 'حالة الانطباق: منطبق' : 'حالة الانطباق: لم تُحدد'}
          </p>
        </div>
        <span className={`w-fit border px-2.5 py-1 text-xs font-bold ${existingTechnicalReportStatusClass(status)}`}>
          {existingTechnicalReportStatusLabel(status)}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
        <ValueBlock label="الوضع الراهن" value={assessment.existing_condition} tone="blue" />
        <ValueBlock label="المطلوب حسب الكود / التصميم" value={assessment.required_condition} tone="slate" />
        <ValueBlock label="الفجوة" value={assessment.gap} tone="amber" />
        <ValueBlock label="الإجراء المطلوب" value={assessment.required_action} tone="rose" />
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 text-sm md:grid-cols-2">
        <div className="border border-slate-200 px-3 py-2">
          <p className="text-xs font-bold text-slate-600">المرجع</p>
          <p className="mt-1 break-words leading-6">{assessment.requirement_reference || 'لا يوجد مرجع مسجل لهذا البند.'}</p>
          {assessment.requirement_source ? <p className="mt-1 text-xs text-slate-500">المصدر: {userFacingSourceLabel(assessment.requirement_source)}</p> : null}
        </div>
        <div className="border border-slate-200 px-3 py-2">
          <p className="text-xs font-bold text-slate-600">الملاحظات / الأدلة</p>
          <p className="mt-1 whitespace-pre-wrap break-words leading-6">{assessment.notes || 'لا توجد ملاحظات إضافية مسجلة.'}</p>
          {assessment.evidence.length ? (
            <p className="mt-2 text-xs text-slate-600">مراجع الأدلة: {assessment.evidence.map((evidence) => evidence.id).join('، ')}</p>
          ) : null}
        </div>
      </div>
    </article>
  );
}

export default function ExistingTechnicalReportPreview({ client, data, company }: ExistingTechnicalReportPreviewProps) {
  const report = buildExistingTechnicalReportModel(client, data, company);
  const hasAssessment = report.assessment_sections.length > 0;

  return (
    <section dir="rtl" className="space-y-6 text-right" aria-label="معاينة التقرير الفني لتقييم الموقع القائم">
      <header className="border border-emerald-200 bg-emerald-950 px-5 py-7 text-white sm:px-8">
        <p className="text-xs font-bold tracking-wide text-emerald-100">معاينة قراءة فقط</p>
        <h2 className="mt-2 text-2xl font-black sm:text-3xl">التقرير الفني لتقييم الموقع القائم</h2>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-emerald-50">
          يعرض هذا التقرير حالة الموقع كما وثقها المهندس، ويقارنها بالمتطلبات والمراجع المتاحة للمشروع. لا يمثل اعتمادًا أو شهادة مطابقة نهائية.
        </p>
        <div className="mt-5 grid grid-cols-1 gap-x-6 gap-y-2 border-t border-emerald-700 pt-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
          <p><span className="text-emerald-200">المشروع: </span>{report.project_information.project_name}</p>
          {report.project_identity.project_code ? <p><span className="text-emerald-200">رمز المشروع: </span>{report.project_identity.project_code}</p> : null}
          {report.project_information.owner ? <p><span className="text-emerald-200">المالك: </span>{report.project_information.owner}</p> : null}
          {report.project_information.location ? <p><span className="text-emerald-200">الموقع: </span>{report.project_information.location}</p> : null}
          {report.project_information.report_number ? <p><span className="text-emerald-200">رقم التقرير: </span>{report.project_information.report_number}</p> : null}
          {report.project_information.report_date ? <p><span className="text-emerald-200">التاريخ: </span>{report.project_information.report_date}</p> : null}
          {report.project_information.consulting_office ? <p><span className="text-emerald-200">المكتب الاستشاري: </span>{report.project_information.consulting_office}</p> : null}
        </div>
      </header>

      <section className="border border-slate-200 bg-white p-4 sm:p-6">
        <h3 className="text-lg font-bold text-slate-950">مقدمة ونطاق الدراسة</h3>
        <p className="mt-3 text-sm leading-8 text-slate-700">
          تقيم هذه المعاينة حالة أنظمة السلامة والوقاية من الحريق المسجلة للموقع القائم، وتعرض بصورة منفصلة الوضع الراهن والمتطلب المرجعي والفجوة وقرار المطابقة والإجراء المطلوب. يعتمد العرض على التقييمات الصريحة المدخلة من المهندس والمراجع المتاحة في بيانات المشروع، ولا يستنتج معاينة ميدانية أو مطابقة تلقائيًا.
        </p>
      </section>

      {(report.building_information.length || report.occupancy_and_classification.length) ? (
        <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="border border-slate-200 bg-white p-4">
            <h3 className="font-bold text-slate-950">بيانات المشروع والمبنى</h3>
            <dl className="mt-3 divide-y divide-slate-100 text-sm">
              {report.building_information.map((item) => <div key={item.label} className="grid grid-cols-1 gap-1 py-2 sm:grid-cols-2"><dt className="font-semibold text-slate-600">{item.label}</dt><dd className="break-words text-slate-900">{item.value}</dd></div>)}
            </dl>
          </div>
          <div className="border border-slate-200 bg-white p-4">
            <h3 className="font-bold text-slate-950">الإشغال والتصنيف</h3>
            {report.occupancy_and_classification.length ? (
              <dl className="mt-3 divide-y divide-slate-100 text-sm">
                {report.occupancy_and_classification.map((item) => <div key={item.label} className="grid grid-cols-1 gap-1 py-2 sm:grid-cols-2"><dt className="font-semibold text-slate-600">{item.label}</dt><dd className="break-words text-slate-900">{item.value}</dd></div>)}
              </dl>
            ) : <p className="mt-3 text-sm leading-7 text-slate-600">لم تسجل بيانات إشغال أو تصنيف كافية للعرض.</p>}
          </div>
        </section>
      ) : null}

      <section className="border border-slate-200 bg-white p-4 sm:p-6">
        <h3 className="text-lg font-bold text-slate-950">أساس التقييم والمراجع</h3>
        {report.assessment_basis.length ? (
          <ul className="mt-3 divide-y divide-slate-100 text-sm">
            {report.assessment_basis.map((item) => <li key={`${item.reference}:${item.source}`} className="py-3"><p className="font-semibold text-slate-900">{item.reference}</p><p className="mt-1 text-xs text-slate-600">المصدر: {userFacingSourceLabel(item.source)}</p></li>)}
          </ul>
        ) : <p className="mt-3 text-sm leading-7 text-slate-600">لا توجد مراجع تقييم مسجلة في البنود الحالية.</p>}
      </section>

      <section className="border border-slate-200 bg-white p-4 sm:p-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div><h3 className="text-lg font-bold text-slate-950">ملخص التقييم التنفيذي</h3><p className="mt-1 text-sm text-slate-600">تُحسب المؤشرات من حالات التقييم الصريحة فقط.</p></div>
          <p className="text-sm font-bold text-slate-800">إجمالي البنود المقيمة: {report.summary.total_assessed_systems}</p>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ['مطابق', report.summary.compliant, 'border-emerald-200 bg-emerald-50 text-emerald-950'],
            ['غير مطابق', report.summary.non_compliant, 'border-rose-200 bg-rose-50 text-rose-950'],
            ['يحتاج استكمال', report.summary.needs_completion, 'border-amber-200 bg-amber-50 text-amber-950'],
            ['لا ينطبق', report.summary.not_applicable, 'border-slate-200 bg-slate-50 text-slate-800'],
          ].map(([label, count, className]) => <div key={String(label)} className={`border p-3 ${className}`}><p className="text-xs font-bold">{label}</p><p className="mt-1 text-2xl font-black">{count}</p></div>)}
        </div>
      </section>

      <section className="space-y-4">
        <div><h3 className="text-xl font-black text-slate-950">التقييم التفصيلي للأنظمة</h3><p className="mt-1 text-sm text-slate-600">تعرض البنود التي لها تقييم أو بيانات صريحة فقط؛ لا تظهر الأنظمة لمجرد معرفة اسمها.</p></div>
        {hasAssessment ? report.assessment_sections.map((section) => (
          <section key={section.id} className="space-y-3" aria-labelledby={`existing-report-${section.id}`}>
            <h4 id={`existing-report-${section.id}`} className="border-r-4 border-emerald-700 bg-emerald-50 px-3 py-2 text-base font-bold text-emerald-950">{section.label}</h4>
            <div className="space-y-3">{section.systems.map((assessment) => <SystemAssessmentCard key={assessment.system_key} assessment={assessment} />)}</div>
          </section>
        )) : (
          <div className="border border-amber-200 bg-amber-50 p-4 text-sm leading-7 text-amber-950">لم يكتمل تقييم أي بند للموقع القائم بعد. لا تمثل هذه الحالة مطابقة أو عدم انطباق.</div>
        )}
      </section>

      <section className="border border-slate-200 bg-white p-4 sm:p-6">
        <h3 className="text-lg font-bold text-slate-950">التوصيات والإجراءات المسجلة</h3>
        {report.recommendations.length ? (
          <ol className="mt-3 space-y-2 text-sm">
            {report.recommendations.map((recommendation) => <li key={recommendation.id} className="border border-slate-200 p-3"><div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between"><p className="whitespace-pre-wrap break-words leading-7 text-slate-900">{recommendation.text}</p><span className="w-fit border border-slate-300 bg-slate-50 px-2 py-0.5 text-xs font-semibold text-slate-700">{recommendation.priority ? `أولوية صريحة: ${recommendation.priority}` : 'غير محددة من المهندس'}</span></div>{recommendation.system_label ? <p className="mt-2 text-xs text-slate-600">البند: {recommendation.system_label}</p> : null}</li>)}
          </ol>
        ) : <p className="mt-3 text-sm leading-7 text-slate-600">لا توجد إجراءات أو توصيات صريحة مسجلة ضمن التقييم الحالي.</p>}
      </section>

      {report.evidence_references.length ? (
        <section className="border border-slate-200 bg-white p-4 sm:p-6">
          <h3 className="text-lg font-bold text-slate-950">مراجع الأدلة</h3>
          <p className="mt-1 text-sm text-slate-600">تعرض هذه المعاينة معرفات الأدلة المرتبطة بالتقييم فقط، ولا ترفع ملفات أو تغير التخزين.</p>
          <ul className="mt-3 flex flex-wrap gap-2 text-xs">{report.evidence_references.map((evidence) => <li key={`${evidence.system_key}:${evidence.id}`} className="border border-slate-300 bg-slate-50 px-2 py-1">{evidence.system_label}: {evidence.id}</li>)}</ul>
        </section>
      ) : null}

      <section className="border border-slate-300 bg-slate-50 p-4 sm:p-6">
        <h3 className="text-lg font-bold text-slate-950">خلاصة وحدود المعاينة</h3>
        <p className="mt-3 text-sm leading-7 text-slate-700">يعرض الملخص عدد حالات التقييم المسجلة بصورة تحفظية ولا يصدر حكمًا عامًا بالمطابقة أو القبول النهائي للمبنى.</p>
        <ul className="mt-3 list-disc space-y-2 pr-5 text-sm leading-7 text-slate-700">{report.limitations.map((item) => <li key={item}>{item}</li>)}</ul>
      </section>
    </section>
  );
}
