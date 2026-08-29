import type {
  EngineeringStudyDocument,
  EngineeringStudyImage,
  EngineeringStudySection,
  EngineeringStudySectionId,
} from '@/lib/projects/engineering-report-engine/types';
import { EXISTING_ASSESSMENT_GROUPS } from '@/lib/projects/existing-project-assessment';
import {
  EXISTING_ASSESSMENT_SECTION_IDS,
  EXISTING_AERIAL_MISSING_LABEL,
  EXISTING_CD_ROUTE_MISSING_LABEL,
  EXISTING_FACADE_MISSING_LABEL,
  existingReportDisplayValue,
} from '@/lib/projects/existing-technical-report-profile';
import { formatExistingReportMapsTableRow } from '@/lib/projects/existing-report-presentation';
import {
  existingFinalReportRecommendations,
  existingTechnicalReportStatusLabel,
  type ExistingTechnicalReportAssessmentSection,
  type ExistingTechnicalReportModel,
  type ExistingTechnicalReportRecommendation,
  type ExistingTechnicalReportStatus,
} from '@/lib/projects/existing-technical-report-model';

const TITLE = 'التقرير الفني لتقييم الموقع القائم';
const UNSET_ENGINEER_PRIORITY_LABEL = 'غير محددة من المهندس';

const GROUP_SECTION_IDS: Record<string, EngineeringStudySectionId> = {
  site: EXISTING_ASSESSMENT_SECTION_IDS.site,
  firefighting: EXISTING_ASSESSMENT_SECTION_IDS.firefighting,
  alarm: EXISTING_ASSESSMENT_SECTION_IDS.alarm,
  life_safety: EXISTING_ASSESSMENT_SECTION_IDS.life_safety,
  electrical: EXISTING_ASSESSMENT_SECTION_IDS.electrical,
};

function text(value: string | null | undefined): string {
  return value?.trim() || '';
}

function section(
  id: EngineeringStudySectionId,
  number: number,
  title: string,
  paragraphs: string[] = [],
  tables: EngineeringStudySection['tables'] = [],
  images: EngineeringStudySection['images'] = []
): EngineeringStudySection {
  return {
    id,
    number,
    title_ar: title,
    title_en: title,
    paragraphs: paragraphs.filter(Boolean).map((item) => ({ text: item, citations: [] })),
    ...(tables.length ? { tables } : {}),
    ...(images.length ? { images } : {}),
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

function recommendationSourceLabel(item: ExistingTechnicalReportRecommendation): string {
  if (item.source === 'ASSESSMENT_ACTION') return 'إجراء التقييم';
  return item.priority ? 'توصية معتمدة' : UNSET_ENGINEER_PRIORITY_LABEL;
}

function imageBlock(
  sectionId: EngineeringStudySectionId,
  src: string,
  caption: string,
  imageType: EngineeringStudyImage['image_type'] = 'site'
): EngineeringStudyImage {
  return {
    src,
    caption_ar: caption,
    caption_en: caption,
    section_id: sectionId,
    image_type: imageType,
    layout_type: imageType === 'site_map' ? 'full_width' : 'single',
  };
}

function placeholderImageBlock(
  sectionId: EngineeringStudySectionId,
  caption: string,
  placeholder: string,
  imageType: EngineeringStudyImage['image_type'] = 'site'
): EngineeringStudyImage {
  return {
    src: '',
    caption_ar: caption,
    caption_en: caption,
    section_id: sectionId,
    image_type: imageType,
    layout_type: 'single',
    placeholder_ar: placeholder,
    placeholder_en: placeholder,
    presentation_state: 'unavailable',
  };
}

function assessmentTables(group: ExistingTechnicalReportAssessmentSection): EngineeringStudySection['tables'] {
  return group.systems.map((item) => table(
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
  ));
}

function conclusion(model: ExistingTechnicalReportModel): string {
  const { total_assessed_systems, compliant, non_compliant, needs_completion, not_applicable } = model.summary;
  if (!total_assessed_systems) return 'لا يتضمن الملف الحالي بنود تقييم مكتملة يمكن تلخيصها. لا تُستنتج حالة مطابقة عامة للمبنى من غياب التقييم.';
  return `يعرض هذا التقرير نتائج ${total_assessed_systems} بندًا مقيمًا كما سجلها المهندس: ${compliant} مطابق، ${non_compliant} غير مطابق، ${needs_completion} يحتاج استكمال، و${not_applicable} لا ينطبق. لا تمثل هذه الأرقام اعتمادًا عامًا للمبنى أو شهادة مطابقة.`;
}

export function buildExistingFinalTechnicalReportDocument(
  model: ExistingTechnicalReportModel
): EngineeringStudyDocument {
  const sections: EngineeringStudySection[] = [];
  let sectionNumber = 0;
  const location = text(model.project_information.location);

  const facilityImages = model.media.facade_src
    ? [imageBlock('facility_data', model.media.facade_src, 'صورة واجهة المشروع', 'facade')]
    : [placeholderImageBlock('facility_data', 'صورة واجهة المشروع', EXISTING_FACADE_MISSING_LABEL, 'facade')];

  sections.push(section(
    'facility_data',
    ++sectionNumber,
    'بيانات المنشأة',
    [],
    model.facility_rows.length ? [twoColumn('بيانات المنشأة', model.facility_rows)] : [],
    facilityImages
  ));

  const site = model.site_profile;
  const siteIntro = site.location_text
    ? [`تعريف الموقع: ${site.location_text}`]
    : ['يُعرض في هذه الصفحة العنوان المسجل وبيانات الموقع كما وردت في ملف المشروع دون استنتاج موقع جديد.'];
  const boundaryRows = [
    site.surroundings?.north ? { label: 'شمالاً', value: site.surroundings.north } : null,
    site.surroundings?.south ? { label: 'جنوباً', value: site.surroundings.south } : null,
    site.surroundings?.east ? { label: 'شرقاً', value: site.surroundings.east } : null,
    site.surroundings?.west ? { label: 'غرباً', value: site.surroundings.west } : null,
  ].filter((row): row is { label: string; value: string } => Boolean(row));
  const mapsRow = formatExistingReportMapsTableRow(site.maps_url);
  const siteRows = [
    { label: 'الشارع', value: existingReportDisplayValue(site.street) },
    { label: 'الحي', value: existingReportDisplayValue(site.district) },
    { label: 'المدينة', value: existingReportDisplayValue(site.city) },
    { label: 'الموقع', value: existingReportDisplayValue(location) },
    ...site.coordinate_rows.map((row) => ({ label: row.label, value: existingReportDisplayValue(row.value) })),
    { label: mapsRow.label, value: mapsRow.value },
    ...boundaryRows,
  ];
  if (!boundaryRows.length && site.surrounding_roads) {
    siteRows.push({ label: 'الحدود / المحيط', value: site.surrounding_roads });
  }
  const siteTables = [twoColumn('بيانات الموقع', siteRows)];
  const siteImages = site.aerial_src
    ? [imageBlock('site_information', site.aerial_src, 'الصورة الجوية للموقع', 'site_map')]
    : [placeholderImageBlock('site_information', 'الصورة الجوية للموقع', EXISTING_AERIAL_MISSING_LABEL, 'site_map')];
  sections.push(section(
    'site_information',
    ++sectionNumber,
    'الموقع',
    siteIntro,
    siteTables,
    siteImages
  ));

  const cd = model.civil_defense_access;
  const cdImages = cd.map_src
    ? [imageBlock('fire_truck_access', cd.map_src, 'خريطة مسار الوصول', 'site_map')]
    : [placeholderImageBlock('fire_truck_access', 'خريطة مسار الوصول', EXISTING_CD_ROUTE_MISSING_LABEL, 'site_map')];
  sections.push(section(
    'fire_truck_access',
    ++sectionNumber,
    'إمكانية وصول آليات الدفاع المدني',
    [
      'تُعرض بيانات الوصول كما سجلها المهندس أو كما وردت في الأدلة المرفقة. لا يحسب التقرير مسافة أو زمن وصول تلقائيًا.',
      cd.route_description ? `وصف مسار الوصول: ${cd.route_description}` : '',
    ].filter(Boolean),
    [twoColumn('بيانات الوصول', [
      { label: 'أقرب مركز دفاع مدني', value: existingReportDisplayValue(cd.center_name) },
      { label: 'المسافة', value: existingReportDisplayValue(cd.distance) },
      { label: 'زمن الوصول', value: existingReportDisplayValue(cd.travel_time) },
      { label: 'وصف مسار الوصول', value: existingReportDisplayValue(cd.route_description) },
      { label: 'مصدر البيانات', value: existingReportDisplayValue(cd.source_label) },
      { label: 'رابط الخرائط', value: existingReportDisplayValue(cd.maps_source_url) },
      { label: 'تاريخ التحقق', value: existingReportDisplayValue(cd.verified_at) },
    ])],
    cdImages
  ));

  const componentRows = model.project_components.map((item, index) => [
    String(index + 1),
    item.name,
    existingReportDisplayValue(item.use),
    existingReportDisplayValue(item.area),
    existingReportDisplayValue(item.floors),
    existingReportDisplayValue(item.height),
    existingReportDisplayValue(item.capacity),
    existingReportDisplayValue(item.description),
    existingReportDisplayValue(item.hazard),
  ]);
  sections.push(section(
    'project_components',
    ++sectionNumber,
    'مكونات المشروع',
    componentRows.length
      ? ['تُعرض مكونات المشروع كما سجلت في ملف المشروع دون افتراض تفاصيل غير موجودة.']
      : ['لم تُسجل مكونات مشروع تفصيلية في الملف الحالي.'],
    componentRows.length
      ? [table(
          'مكونات المشروع',
          ['م', 'اسم المكون', 'الاستخدام', 'المساحة', 'عدد الأدوار', 'الارتفاع', 'السعة/الحمولة', 'نوع الإنشاء', 'تصنيف الخطورة'],
          componentRows
        )]
      : []
  ));

  for (const groupDef of EXISTING_ASSESSMENT_GROUPS) {
    const group = model.assessment_sections.find((item) => item.id === groupDef.id);
    if (!group?.systems.length) continue;
    const sectionId = GROUP_SECTION_IDS[groupDef.id] || 'engineering_compliance_review';
    sections.push(section(
      sectionId,
      ++sectionNumber,
      group.label,
      ['تُعرض كل منظومة في بطاقة مستقلة: الوضع الراهن، المطلوب، الفجوة، حالة المطابقة، الإجراء المطلوب، والمرجع.'],
      assessmentTables(group)
    ));
  }

  if (model.engineering_sections.length) {
    sections.push(section('building_requirements', ++sectionNumber, 'البيانات الهندسية المرجعية', [
      'تُعرض هذه القيم كبيانات مرجعية داعمة للتقييم فقط. لا يعيد هذا التقرير حساب التدفقات أو الضغوط أو الكميات.',
    ], model.engineering_sections.map((item) => twoColumn(item.label, item.rows))));
  }

  const finalRecommendations = existingFinalReportRecommendations(model);
  sections.push(section('existing_recommendations', ++sectionNumber, 'التوصيات والإجراءات المطلوبة', [
    finalRecommendations.length
      ? 'تتضمن هذه القائمة الإجراءات والتوصيات الصريحة المرتبطة بتقييم المهندس أو التوصيات المحفوظة والمعتمدة فقط.'
      : 'لا توجد إجراءات أو توصيات معتمدة مسجلة حتى الآن.',
  ], finalRecommendations.length ? [table('الإجراءات والتوصيات الصريحة', ['المنظومة', 'الأولوية', 'النص', 'المصدر'], finalRecommendations.map((item) => [
    item.system_label || 'عام',
    item.priority!,
    item.text,
    recommendationSourceLabel(item),
  ]))] : []));

  sections.push(section('conclusion', ++sectionNumber, 'الملخص والخلاصة وحدود الدراسة', [conclusion(model), ...model.limitations]));

  const coverImage = model.media.facade_src
    ? imageBlock('cover', model.media.facade_src, model.media.facade_caption || 'صورة واجهة المشروع', 'facade')
    : null;

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
    prepared_by: model.approval.prepared_by || undefined,
    executive_director: model.approval.executive_director || undefined,
    location_display: location || undefined,
    cover_image: coverImage,
    sections,
    rules_gate_ok: true,
    rules_summary_ar: '',
    rules_summary_en: '',
    missing_inputs: [],
  };
}

export { TITLE as EXISTING_FINAL_TECHNICAL_REPORT_TITLE };
