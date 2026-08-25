import type {
  EngineeringStudyDocument,
  EngineeringStudySection,
  EngineeringStudySectionId,
} from '@/lib/projects/engineering-report-engine/types';
import {
  existingTechnicalReportStatusLabel,
  type ExistingTechnicalReportModel,
  type ExistingTechnicalReportStatus,
} from '@/lib/projects/existing-technical-report-model';

const TITLE = 'التقرير الفني لتقييم الموقع القائم';

function text(value: string | null | undefined): string {
  return value?.trim() || '';
}

function section(
  id: EngineeringStudySectionId,
  number: number,
  title: string,
  paragraphs: string[] = [],
  tables: EngineeringStudySection['tables'] = []
): EngineeringStudySection {
  return {
    id,
    number,
    title_ar: title,
    title_en: title,
    paragraphs: paragraphs.filter(Boolean).map((item) => ({ text: item, citations: [] })),
    ...(tables.length ? { tables } : {}),
  };
}

function table(caption: string, headers: string[], rows: string[][]) {
  return {
    caption_ar: caption,
    caption_en: caption,
    headers_ar: headers,
    headers_en: headers,
    rows,
  };
}

function twoColumn(caption: string, rows: Array<{ label: string; value: string }>) {
  return table(caption, ['البند', 'البيان'], rows.map((item) => [item.label, item.value]));
}

function status(status: ExistingTechnicalReportStatus): string {
  return existingTechnicalReportStatusLabel(status);
}

function assessmentTables(model: ExistingTechnicalReportModel): EngineeringStudySection['tables'] {
  return model.assessment_sections.flatMap((group) => group.systems.map((item) => table(
    `${group.label} — ${item.system_label}`,
    ['البند', 'البيان'],
    [
      ['الوضع الراهن', [text(item.existing_condition), text(item.notes)].filter(Boolean).join(' — ') || 'لم يكتمل تقييم هذا البند.'],
      ['المطلوب حسب الكود / التصميم', text(item.required_condition) || 'لم تُسجل قيمة.'],
      ['الفجوة', text(item.gap) || 'لم تُسجل فجوة.'],
      ['حالة المطابقة', status(item.compliance_status)],
      ['الإجراء المطلوب', text(item.required_action) || 'لم يُسجل إجراء مطلوب.'],
      ['المرجع / الدليل', [text(item.requirement_reference), item.evidence.length ? `أدلة مرتبطة: ${item.evidence.length}` : ''].filter(Boolean).join(' — ') || 'لم يُسجل مرجع أو دليل.'],
    ]
  )));
}

function summaryRows(model: ExistingTechnicalReportModel): string[][] {
  return [
    ['عدد البنود المقيمة', String(model.summary.total_assessed_systems)],
    ['مطابق', String(model.summary.compliant)],
    ['غير مطابق', String(model.summary.non_compliant)],
    ['يحتاج استكمال', String(model.summary.needs_completion)],
    ['لا ينطبق', String(model.summary.not_applicable)],
  ];
}

function conclusion(model: ExistingTechnicalReportModel): string {
  const { total_assessed_systems, compliant, non_compliant, needs_completion, not_applicable } = model.summary;
  if (!total_assessed_systems) return 'لا يتضمن الملف الحالي بنود تقييم مكتملة يمكن تلخيصها. لا تُستنتج حالة مطابقة عامة للمبنى من غياب التقييم.';
  return `يعرض هذا التقرير نتائج ${total_assessed_systems} بندًا مقيمًا كما سجلها المهندس: ${compliant} مطابق، ${non_compliant} غير مطابق، ${needs_completion} يحتاج استكمال، و${not_applicable} لا ينطبق. لا تمثل هذه الأرقام اعتمادًا عامًا للمبنى أو شهادة مطابقة.`;
}

export function buildExistingFinalTechnicalReportDocument(
  model: ExistingTechnicalReportModel
): EngineeringStudyDocument {
  const sections: EngineeringStudySection[] = [
    section('introduction', 1, 'مقدمة ونطاق الدراسة', [
      'يقيّم هذا التقرير حالة السلامة والوقاية من الحريق في الموقع القائم بناءً على الوضع الراهن المسجل، والمتطلبات أو المراجع المتاحة، والفجوات والإجراءات التي أدخلها أو اعتمدها المهندس. لا يثبت التقرير إجراء معاينة ميدانية ما لم تدعم ذلك ملاحظات أو أدلة صريحة في التقييم.',
    ]),
    section('project_description', 2, 'بيانات المشروع والمبنى', [], [
      twoColumn('بيانات المشروع', [
        { label: 'اسم المشروع', value: model.project_information.project_name },
        { label: 'المالك', value: text(model.project_information.owner) || 'لم تُسجل قيمة.' },
        { label: 'الموقع', value: text(model.project_information.location) || 'لم تُسجل قيمة.' },
        { label: 'رقم التقرير', value: text(model.project_information.report_number) || 'لم تُسجل قيمة.' },
        { label: 'تاريخ التقرير', value: text(model.project_information.report_date) || 'لم تُسجل قيمة.' },
        { label: 'المكتب الاستشاري', value: text(model.project_information.consulting_office) || 'لم تُسجل قيمة.' },
      ]),
      ...(model.building_information.length ? [twoColumn('معلومات المبنى', model.building_information)] : []),
      ...(model.occupancy_and_classification.length ? [twoColumn('الإشغال والتصنيف', model.occupancy_and_classification)] : []),
    ]),
    ...(model.assessment_basis.length ? [section('applicable_codes', 3, 'أساس التقييم والمراجع', [
      'تُعرض المراجع التالية كما ارتبطت ببنود التقييم، دون إضافة مراجع أو استنتاجات كودية جديدة داخل طبقة التقرير.',
    ], [table('المراجع المرتبطة بالتقييم', ['المرجع', 'المصدر'], model.assessment_basis.map((item) => [item.reference, item.source]))])] : []),
    section('summary', 4, 'الملخص التنفيذي للتقييم', [
      model.summary.total_assessed_systems
        ? 'يعرض الملخص أعداد الحالات الصريحة المسجلة في تقييم المهندس فقط. لا يحول التقرير هذه الأعداد إلى نتيجة مطابقة عامة للمبنى.'
        : 'لم يكتمل تقييم بنود الموقع القائم بعد. لا تُستنتج حالة مطابقة عامة للمبنى من غياب التقييم.',
    ], model.summary.total_assessed_systems ? [table('ملخص حالات التقييم', ['البند', 'العدد'], summaryRows(model))] : []),
    ...(model.assessment_sections.length ? [section('engineering_compliance_review', 5, 'التقييم التفصيلي للأنظمة', [
      'تُعرض كل منظومة في بطاقة مستقلة وفق التسلسل: الوضع الراهن، المطلوب حسب الكود أو التصميم، الفجوة، حالة المطابقة، الإجراء المطلوب، المرجع أو الدليل، والملاحظات. لا تُنشأ بطاقات للأنظمة التي لا تتوفر لها بيانات تقييم قابلة للعرض.',
    ], assessmentTables(model))] : []),
    ...(model.engineering_sections.length ? [section('building_requirements', 6, 'البيانات الهندسية المرجعية', [
      'تُعرض هذه القيم كبيانات مرجعية داعمة للتقييم فقط، كما يوردها نموذج التقرير للقراءة فقط. لا يعيد هذا التقرير حساب التدفقات أو الضغوط أو الكميات.',
    ], model.engineering_sections.map((item) => twoColumn(item.label, item.rows)))] : []),
    section('existing_recommendations', 7, 'التوصيات والإجراءات المطلوبة', [
      model.recommendations.length
        ? 'تتضمن هذه القائمة الإجراءات والتوصيات الصريحة المرتبطة بتقييم المهندس أو التوصيات المحفوظة والمعتمدة فقط.'
        : 'لا توجد إجراءات أو توصيات معتمدة مسجلة حتى الآن.',
    ], model.recommendations.length ? [table('الإجراءات والتوصيات الصريحة', ['المنظومة', 'الأولوية', 'النص', 'المصدر'], model.recommendations.map((item) => [item.system_label || 'عام', item.priority || 'لم تُحدد أولوية.', item.text, item.source === 'ASSESSMENT_ACTION' ? 'إجراء التقييم' : 'توصية معتمدة']))] : []),

    section('conclusion', 8, 'الملخص والخلاصة وحدود الدراسة', [conclusion(model), ...model.limitations]),
  ];

  return {
    locale: 'ar',
    title_ar: TITLE,
    title_en: TITLE,
    generated_at: model.project_information.report_date || '',
    report_number: model.project_information.report_number || '',
    report_date: model.project_information.report_date || '',
    project_name: model.project_information.project_name,
    client_code: model.project_identity.project_code || '',
    owner_name: model.project_information.owner || undefined,
    prepared_by: undefined,
    executive_director: undefined,
    cover_image: null,
    sections,
    rules_gate_ok: true,
    rules_summary_ar: '',
    rules_summary_en: '',
    missing_inputs: [],
  };
}

export { TITLE as EXISTING_FINAL_TECHNICAL_REPORT_TITLE };
