import type {
  EngineeringStudyDocument,
  EngineeringStudyImage,
  EngineeringStudySection,
  EngineeringStudySectionId,
} from '@/lib/projects/engineering-report-engine/types';
import { EXISTING_ASSESSMENT_GROUPS } from '@/lib/projects/existing-project-assessment';
import {
  buildEngineeringActionsNarrative,
  buildEngineeringGroupNarrativeBlocks,
  buildEngineeringReferences,
} from '@/lib/projects/existing-report-engineering-narrative';
import {
  EXISTING_ASSESSMENT_SECTION_IDS,
  EXISTING_AERIAL_MISSING_LABEL,
  EXISTING_CD_ROUTE_MISSING_LABEL,
  EXISTING_FACADE_MISSING_LABEL,
  existingReportDisplayValue,
} from '@/lib/projects/existing-technical-report-profile';
import {
  buildCivilDefenseAccessNarrative,
  buildEngineeringPresentationBlocks,
  buildProjectComponentsNarrative,
  buildSitePresentationBlocks,
} from '@/lib/projects/existing-report-presentation';
import type { ExistingTechnicalReportModel } from '@/lib/projects/existing-technical-report-model';

const TITLE = 'التقرير الفني لتقييم الموقع القائم';

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
  images: EngineeringStudySection['images'] = [],
  presentation_blocks: EngineeringStudySection['presentation_blocks'] = []
): EngineeringStudySection {
  return {
    id,
    number,
    title_ar: title,
    title_en: title,
    paragraphs: paragraphs.filter(Boolean).map((item) => ({ text: item, citations: [] })),
    ...(tables.length ? { tables } : {}),
    ...(images.length ? { images } : {}),
    ...(presentation_blocks.length ? { presentation_blocks } : {}),
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
  const siteImages = site.aerial_src
    ? [imageBlock('site_information', site.aerial_src, 'الصورة الجوية للموقع', 'site_map')]
    : [placeholderImageBlock('site_information', 'الصورة الجوية للموقع', EXISTING_AERIAL_MISSING_LABEL, 'site_map')];
  sections.push(section(
    'site_information',
    ++sectionNumber,
    'الموقع',
    [],
    [],
    siteImages,
    buildSitePresentationBlocks(site, location)
  ));

  const cd = model.civil_defense_access;
  const cdImages = cd.map_src
    ? [imageBlock('fire_truck_access', cd.map_src, 'خريطة مسار الوصول', 'site_map')]
    : [placeholderImageBlock('fire_truck_access', 'خريطة مسار الوصول', EXISTING_CD_ROUTE_MISSING_LABEL, 'site_map')];
  sections.push(section(
    'fire_truck_access',
    ++sectionNumber,
    'إمكانية وصول آليات الدفاع المدني',
    [],
    [],
    cdImages,
    buildCivilDefenseAccessNarrative(cd)
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
  const componentsNarrative = buildProjectComponentsNarrative(model.project_components);
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
      : [],
    [],
    componentsNarrative ? [{ type: 'paragraph', text: componentsNarrative }] : []
  ));

  for (const groupDef of EXISTING_ASSESSMENT_GROUPS) {
    const group = model.assessment_sections.find((item) => item.id === groupDef.id);
    if (!group?.systems.length) continue;
    const sectionId = GROUP_SECTION_IDS[groupDef.id] || 'engineering_compliance_review';
    sections.push(section(
      sectionId,
      ++sectionNumber,
      group.label,
      [],
      [],
      [],
      buildEngineeringGroupNarrativeBlocks(groupDef.id, group.systems, model.engineering_sections)
    ));
  }

  if (model.engineering_sections.length) {
    sections.push(section(
      'building_requirements',
      ++sectionNumber,
      'البيانات الهندسية المرجعية',
      ['تُعرض هذه القيم كبيانات مرجعية داعمة للتقييم فقط. لا يعيد هذا التقرير حساب التدفقات أو الضغوط أو الكميات.'],
      [],
      [],
      buildEngineeringPresentationBlocks(model.engineering_sections)
    ));
  }

  sections.push(section(
    'existing_recommendations',
    ++sectionNumber,
    'الملاحظات والإجراءات المطلوبة',
    [],
    [],
    [],
    buildEngineeringActionsNarrative(model)
  ));

  const referenceBlocks = buildEngineeringReferences(model);
  if (referenceBlocks.length) {
    sections.push(section(
      'code_evidence_references',
      ++sectionNumber,
      'المراجع وأساس التقييم',
      [],
      [],
      [],
      referenceBlocks
    ));
  }

  sections.push(section(
    'conclusion',
    ++sectionNumber,
    'الملخص والخلاصة وحدود الدراسة',
    [conclusion(model), ...model.limitations]
  ));

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
