'use client';

import type { CompanyProfile } from '@/lib/company-profile';
import {
  buildUnderConstructionTechnicalReportModel,
  type UnderConstructionTechnicalReportSystem,
  type UnderConstructionTechnicalReportValue,
} from '@/lib/projects/under-construction-technical-report-model';
import type { ClientRecord } from '@/lib/types/client';
import type { ProjectEngineeringData } from '@/lib/types/project-reports';

type UnderConstructionTechnicalReportPreviewProps = {
  client: ClientRecord;
  data: ProjectEngineeringData;
  company?: Pick<CompanyProfile, 'name' | 'legal_name'> | null;
};

function ValueBlock({
  label,
  value,
  tone = 'slate',
}: {
  label: string;
  value: string | null;
  tone?: 'slate' | 'indigo' | 'sky' | 'amber';
}) {
  const toneClass = {
    slate: 'border-slate-200 bg-slate-50 text-slate-800',
    indigo: 'border-indigo-200 bg-indigo-50 text-indigo-950',
    sky: 'border-sky-200 bg-sky-50 text-sky-950',
    amber: 'border-amber-200 bg-amber-50 text-amber-950',
  }[tone];
  return (
    <div className={`min-w-0 border p-3 ${toneClass}`}>
      <p className="text-xs font-bold text-slate-600">{label}</p>
      <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-7">
        {value || 'لم تُسجل بيانات صريحة لهذا الحقل ضمن الدراسة الحالية.'}
      </p>
    </div>
  );
}

function CanonicalReferences({ references }: { references: UnderConstructionTechnicalReportValue[] }) {
  if (!references.length) {
    return <p className="border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-sm leading-7 text-slate-600">لا توجد قيمة مصدرية موثقة لهذا البند في البيانات الكانونية الحالية.</p>;
  }
  return (
    <dl className="divide-y divide-slate-100 text-sm">
      {references.map((item, index) => (
        <div key={`${item.label}:${index}`} className="grid grid-cols-1 gap-1 py-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
          <dt className="font-semibold text-slate-600">{item.label}</dt>
          <dd className="min-w-0 break-words text-slate-900">
            <p>{item.value}</p>
            <p className="mt-1 text-xs text-slate-500">المصدر: {item.source_label}{item.reference ? ` — ${item.reference}` : ''}</p>
          </dd>
        </div>
      ))}
    </dl>
  );
}

function StudySystemCard({ system }: { system: UnderConstructionTechnicalReportSystem }) {
  return (
    <article className="border border-slate-200 bg-white p-4 sm:p-5" aria-label={`متطلبات ${system.system_label}`}>
      <div className="flex flex-col gap-2 border-b border-slate-200 pb-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h4 className="text-base font-bold text-slate-950">{system.system_label}</h4>
          <p className="mt-1 text-xs text-slate-600">
            {system.applicable === true ? 'حالة الانطباق: منطبق بقرار صريح من المهندس.' : 'حالة الانطباق: لم يُحدد القرار صراحةً.'}
          </p>
        </div>
        <span className="w-fit border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-xs font-bold text-indigo-950">دراسة تصميمية</span>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
        <ValueBlock label="المتطلب حسب الكود / التصميم" value={system.code_requirement} tone="indigo" />
        <ValueBlock label="الحل التصميمي المختار" value={system.selected_solution} tone="sky" />
        <ValueBlock label="مرجع الكود" value={system.code_reference} />
        <ValueBlock label="مرجع المخطط / التصميم" value={system.drawing_reference} />
        <ValueBlock label="مرجع الحساب عند الحاجة" value={system.calculation_reference} />
        <ValueBlock label="ملاحظات التنفيذ" value={system.implementation_note} tone="amber" />
      </div>

      <section className="mt-4 border border-slate-200 bg-slate-50 p-3" aria-label={`قيم مصدرية لـ${system.system_label}`}>
        <h5 className="text-sm font-bold text-slate-950">القيم التصميمية المرجعية</h5>
        <p className="mt-1 text-xs leading-6 text-slate-600">تُقرأ من مصادرها الكانونية للعرض فقط، ولا تُنسخ إلى الدراسة أو التقرير.</p>
        <div className="mt-2"><CanonicalReferences references={system.canonical_references} /></div>
      </section>
    </article>
  );
}

export default function UnderConstructionTechnicalReportPreview({
  client,
  data,
  company,
}: UnderConstructionTechnicalReportPreviewProps) {
  const report = buildUnderConstructionTechnicalReportModel(client, data, company);
  const hasStudy = report.report_sections.length > 0;

  return (
    <section dir="rtl" className="space-y-6 text-right" aria-label="معاينة التقرير الفني للمشروع قيد الإنشاء">
      <header className="border border-indigo-200 bg-indigo-950 px-5 py-7 text-white sm:px-8">
        <p className="text-xs font-bold tracking-wide text-indigo-100">معاينة قراءة فقط</p>
        <h2 className="mt-2 text-2xl font-black sm:text-3xl">التقرير الفني للمشروع قيد الإنشاء</h2>
        <p className="mt-3 max-w-4xl text-sm leading-7 text-indigo-50">
          يعرض التقرير متطلبات المشروع والحلول التصميمية ومراجع المخططات والحسابات وتعليمات التنفيذ المسجلة ضمن الدراسة. لا يعرض تقييم وضع قائم ولا يستنتج مطابقة أو توصية تلقائية.
        </p>
        <div className="mt-5 grid grid-cols-1 gap-x-6 gap-y-2 border-t border-indigo-700 pt-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
          <p><span className="text-indigo-200">المشروع: </span>{report.project_information.project_name}</p>
          {report.project_identity.project_code ? <p><span className="text-indigo-200">رمز المشروع: </span>{report.project_identity.project_code}</p> : null}
          {report.project_information.owner ? <p><span className="text-indigo-200">المالك: </span>{report.project_information.owner}</p> : null}
          {report.project_information.location ? <p><span className="text-indigo-200">الموقع: </span>{report.project_information.location}</p> : null}
          {report.project_information.report_number ? <p><span className="text-indigo-200">رقم التقرير: </span>{report.project_information.report_number}</p> : null}
          {report.project_information.report_date ? <p><span className="text-indigo-200">التاريخ: </span>{report.project_information.report_date}</p> : null}
          {report.project_information.consulting_office ? <p><span className="text-indigo-200">المكتب الاستشاري: </span>{report.project_information.consulting_office}</p> : null}
        </div>
      </header>

      <section className="border border-slate-200 bg-white p-4 sm:p-6">
        <h3 className="text-lg font-bold text-slate-950">مقدمة ونطاق الدراسة</h3>
        <p className="mt-3 text-sm leading-8 text-slate-700">{report.introduction}</p>
        <div className="mt-4 border-r-4 border-indigo-700 bg-indigo-50 px-4 py-3 text-sm leading-7 text-indigo-950">
          <p className="font-bold">وصف الدراسة ونطاقها</p>
          <p className="mt-1 whitespace-pre-wrap break-words">{report.study_scope || 'لم يُسجل وصف دراسة صريح بعد. تبقى حقائق المشروع والمراجع المتاحة معروضة من مصادرها الكانونية فقط.'}</p>
        </div>
      </section>

      <section className="border border-slate-200 bg-white p-4 sm:p-6">
        <h3 className="text-lg font-bold text-slate-950">بيانات المشروع والمنشأة والتصنيف</h3>
        <p className="mt-1 text-sm leading-7 text-slate-600">تغطي هذه البيانات المنشأة والموقع والاستخدام والأدوار والمساحات حسب ما هو موثق في ملف المشروع والتصميم.</p>
        <div className="mt-3"><CanonicalReferences references={report.project_references} /></div>
      </section>

      <section className="border border-slate-200 bg-white p-4 sm:p-6">
        <h3 className="text-lg font-bold text-slate-950">الأكواد والمراجع</h3>
        {report.code_references.length ? (
          <ul className="mt-3 divide-y divide-slate-100 text-sm">
            {report.code_references.map((item) => (
              <li key={item.id} className="py-3">
                <p className="font-semibold text-slate-900">{item.title}{item.reference ? ` — ${item.reference}` : ''}</p>
                {item.note ? <p className="mt-1 whitespace-pre-wrap break-words leading-7 text-slate-700">{item.note}</p> : null}
                <p className="mt-1 text-xs text-slate-500">المصدر: {item.source_label}</p>
              </li>
            ))}
          </ul>
        ) : <p className="mt-3 text-sm leading-7 text-slate-600">لم تُسجل مراجع كودية أو تصميمية صريحة للعرض بعد.</p>}
      </section>

      <section className="space-y-4">
        <div>
          <h3 className="text-xl font-black text-slate-950">متطلبات التصميم والتنفيذ</h3>
          <p className="mt-1 text-sm text-slate-600">يعرض التقرير البنود ذات القرارات الصريحة فقط. الأنظمة غير المنطبقة لا تُنشئ أقسامًا فارغة، والبيانات الناقصة لا تتحول إلى افتراض هندسي.</p>
        </div>
        {hasStudy ? report.report_sections.map((section) => (
          <section key={section.id} className="space-y-3" aria-labelledby={`under-construction-report-${section.id}`}>
            <h4 id={`under-construction-report-${section.id}`} className="border-r-4 border-indigo-700 bg-indigo-50 px-3 py-2 text-base font-bold text-indigo-950">{section.label}</h4>
            <div className="space-y-3">{section.systems.map((system) => <StudySystemCard key={system.system_key} system={system} />)}</div>
          </section>
        )) : (
          <div className="border border-amber-200 bg-amber-50 p-4 text-sm leading-7 text-amber-950">لم تُسجل قرارات دراسة صريحة للأنظمة بعد. لا يعني ذلك عدم الحاجة إلى الأنظمة أو اكتمال متطلبات المشروع.</div>
        )}
      </section>

      <section className="border border-slate-200 bg-white p-4 sm:p-6">
        <h3 className="text-lg font-bold text-slate-950">ملاحظات التنفيذ المعتمدة</h3>
        {report.implementation_notes.length ? (
          <ol className="mt-3 space-y-2 text-sm">
            {report.implementation_notes.map((note) => (
              <li key={note.id} className="border border-slate-200 p-3">
                <p className="whitespace-pre-wrap break-words leading-7 text-slate-900">{note.text}</p>
                {note.system_label ? <p className="mt-2 text-xs text-slate-600">البند: {note.system_label}</p> : null}
              </li>
            ))}
          </ol>
        ) : <p className="mt-3 text-sm leading-7 text-slate-600">لا توجد ملاحظات تنفيذ صريحة مسجلة ضمن الدراسة الحالية.</p>}
      </section>

      <section className="border border-slate-300 bg-slate-50 p-4 sm:p-6">
        <h3 className="text-lg font-bold text-slate-950">حدود الدراسة</h3>
        <ul className="mt-3 list-disc space-y-2 pr-5 text-sm leading-7 text-slate-700">{report.limitations.map((item) => <li key={item}>{item}</li>)}</ul>
      </section>
    </section>
  );
}
