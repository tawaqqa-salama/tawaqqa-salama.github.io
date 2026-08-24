import type { ClientRecord } from '@/lib/types/client';
import type { ProjectEngineeringData, TechnicalReport } from '@/lib/types/project-reports';
import type {
  EngineeringStudyDocument,
  EngineeringStudyImage,
  EngineeringStudySection,
  EngineeringStudySectionId,
  ReportLocale,
} from '@/lib/projects/engineering-report-engine/types';
import type { EvidenceMediaPresentation } from '@/lib/projects/technical-report-media-presentation';
import {
  EMPTY_FIRE_PROTECTION_DESIGN,
  formatMeasured,
  type FireProtectionDesign,
  type YesNoUnknown,
} from '@/lib/types/fire-protection-design';
import { mergeFireProtectionDesign } from '@/lib/projects/admin-uc-report/design';
import { manualExtinguisherTypeLabel, technicalReportActivityLabel, technicalReportHazardLabel } from '@/lib/projects/technical-report-binding-registry';
import { resolvePreferredEgressMetrics, resolvePreferredHazard } from '@/lib/projects/technical-report-source-priority';
import { buildTechnicalReportSourceData, type TechnicalReportSourceField } from '@/lib/projects/technical-report-source-data';
import {
  codeEvidenceReferenceLines,
  selectTechnicalReportPdfContent,
  type TechnicalReportPdfEvidenceGroup,
} from '@/lib/projects/technical-report-pdf-content';

type Row = [string, string];

function compact(value: unknown): string {
  return String(value ?? '').trim();
}

function sourceValue(field: TechnicalReportSourceField | undefined): string {
  const raw = field?.final_value ?? field?.value;
  if (raw === null || raw === undefined || raw === '') return '';
  if (raw === true) return 'نعم';
  if (raw === false) return 'لا';
  return compact(raw);
}

function withUnit(value: string, unit: string): string {
  return value ? `${value} ${unit}` : '';
}

function row(label: string, value: unknown): Row | null {
  const normalized = compact(value);
  return normalized ? [label, normalized] : null;
}

function rows(...items: Array<Row | null>): Row[] {
  return items.filter((item): item is Row => Boolean(item));
}

function section(
  id: EngineeringStudySectionId,
  number: number,
  title: string,
  paragraphs: string[] = [],
  tables: EngineeringStudySection['tables'] = [],
  images: EngineeringStudyImage[] = []
): EngineeringStudySection {
  return {
    id,
    number,
    title_ar: title,
    title_en: title,
    paragraphs: paragraphs.filter(Boolean).map((text) => ({ text, citations: [] })),
    ...(tables.length ? { tables } : {}),
    ...(images.length ? { images } : {}),
  };
}

function twoColumnTable(caption: string, values: Row[]) {
  return {
    caption_ar: caption,
    caption_en: caption,
    headers_ar: ['البند', 'البيان'],
    headers_en: ['Item', 'Value'],
    rows: values,
  };
}

function dataTable(caption: string, headers: string[], values: string[][]) {
  return {
    caption_ar: caption,
    caption_en: caption,
    headers_ar: headers,
    headers_en: headers,
    rows: values,
  };
}

function yesNo(value: YesNoUnknown | undefined): string {
  if (value === 'yes') return 'متوفر';
  if (value === 'no') return 'غير متوفر';
  return '';
}

function supportingStatus(value: FireProtectionDesign['supporting_systems'][keyof FireProtectionDesign['supporting_systems']]) {
  if (value.status === 'required') return 'مطلوب';
  if (value.status === 'not_required') return 'غير مطلوب';
  if (value.status === 'by_design') return 'حسب التصميم المعتمد';
  return '';
}

function supportingDisplay(value: FireProtectionDesign['supporting_systems'][keyof FireProtectionDesign['supporting_systems']]) {
  return [supportingStatus(value), compact(value.note), compact(value.recommendation)]
    .filter(Boolean)
    .join(' — ');
}

function pumpRows(label: string, pump: FireProtectionDesign['pump'] | FireProtectionDesign['diesel_pump'] | FireProtectionDesign['jockey_pump']): Row[] {
  const output: Row[] = [];
  const status = yesNo(pump.exists);
  const capacity = formatMeasured(pump.capacity, { empty: '' });
  const pressure = formatMeasured(pump.pressure, { empty: '' });
  if (status) output.push([`حالة ${label}`, status]);
  if (capacity) output.push([`سعة ${label}`, capacity]);
  if (pressure) output.push([`ضغط ${label}`, pressure]);
  return output;
}

function selectedSystemNotes(items: TechnicalReport['firefighting_items']): string[] {
  return items
    .filter((item) => item.enabled)
    .flatMap((item) => [compact(item.notes), ...item.selectedOptions.map(compact)])
    .filter(Boolean);
}

/**
 * Formal client-facing technical report document.
 * It consumes the same read-only Data Bridge and canonical fire-protection design,
 * but deliberately excludes value provenance, validation state, workflow text, and
 * calculation/debug labels from the PDF output.
 */
export function generateOfficialTechnicalReportDocument(params: {
  client: ClientRecord;
  report: TechnicalReport;
  engineeringData?: ProjectEngineeringData | null;
  locale?: ReportLocale;
  evidenceMediaPresentation?: Readonly<Record<string, EvidenceMediaPresentation>>;
}): EngineeringStudyDocument {
  const locale = params.locale || 'ar';
  const engineeringData: ProjectEngineeringData = params.engineeringData
    ? { ...params.engineeringData, technical_report: params.report }
    : ({ technical_report: params.report } as ProjectEngineeringData);
  const source = buildTechnicalReportSourceData({ client: params.client, engineeringData });
  const report = params.report;
  const project = source.project;
  const plan = source.plan;
  const floors = source.floors;
  const rawDesign = engineeringData.fire_protection_design;
  const design = mergeFireProtectionDesign(rawDesign || EMPTY_FIRE_PROTECTION_DESIGN);
  const pdfContent = selectTechnicalReportPdfContent(report, params.evidenceMediaPresentation);

  const projectName =
    sourceValue(project.project_name) || params.client.business_name || params.client.name || 'مشروع هندسي';
  const ownerName = sourceValue(project.owner_name) || params.client.owner_name || params.client.name || '';
  const buildingArea = withUnit(sourceValue(project.building_area_m2), 'م²');
  const buildingHeight = withUnit(sourceValue(plan.building_height_m), 'م');
  const preferredHazard = resolvePreferredHazard(
    design.occupancy.hazard_class || report.risk_class,
    floors.flatMap((floor) => floor.spaces.map((space) => sourceValue(space.hazard_classification)))
  );
  const preferredEgressMetrics = resolvePreferredEgressMetrics(design.egress.metrics);

  const basicRows = rows(
    row('اسم المشروع', projectName),
    row('المالك / المستثمر', ownerName),
    row('النشاط', sourceValue(project.activity)),
    row('حالة المبنى', sourceValue(project.building_status)),
    row('المدينة', sourceValue(project.city)),
    row('الحي', sourceValue(project.district)),
    row('الشارع', sourceValue(project.street)),
    row('العنوان الوطني', sourceValue(project.national_address)),
    row('رقم القطعة', sourceValue(project.plot_number)),
    row('رقم رخصة البناء', sourceValue(project.building_permit_number)),
    row('تاريخ رخصة البناء', sourceValue(project.building_permit_date)),
    row('مساحة الأرض', withUnit(sourceValue(project.land_area_m2), 'م²')),
    row('مساحة البناء', buildingArea),
    row('عدد الأدوار', sourceValue(project.floors_count)),
    row('ارتفاع المبنى', buildingHeight)
  );

  const floorRows = floors.flatMap((floor) =>
    floor.spaces.map((space) => [
      sourceValue(floor.name) || '—',
      sourceValue(space.name) || '—',
      technicalReportActivityLabel(sourceValue(space.activity_use)) || '—',
      withUnit(sourceValue(space.area_m2), 'م²') || '—',
      sourceValue(space.occupants) || '—',
      withUnit(sourceValue(space.travel_distance_m), 'م') || '—',
    ])
  );
  const occupancyRows = floors.flatMap((floor) =>
    floor.spaces.map((space) => [
      sourceValue(floor.name) || '—',
      sourceValue(space.name) || '—',
      technicalReportActivityLabel(sourceValue(space.activity_use)) || '—',
      sourceValue(space.occupancy) || '—',
      technicalReportHazardLabel(sourceValue(space.hazard_classification)) || '—',
    ])
  );
  const occupantRows = floors.flatMap((floor) =>
    floor.spaces
      .filter((space) => sourceValue(space.occupants))
      .map((space) => [
        sourceValue(floor.name) || '—',
        sourceValue(space.name) || sourceValue(space.activity_use) || '—',
        withUnit(sourceValue(space.area_m2), 'م²') || '—',
        sourceValue(space.occupants),
      ])
  );
  const egressRows = floors
    .filter((floor) => sourceValue(floor.exits) || sourceValue(floor.travel_distance_m) || sourceValue(floor.occupants))
    .map((floor) => [
      sourceValue(floor.name) || '—',
      sourceValue(floor.occupants) || '—',
      sourceValue(floor.exits) || '—',
      sourceValue(plan.stairs_count) || '—',
      withUnit(sourceValue(floor.travel_distance_m), 'م') || '—',
    ]);
  const extinguisherRows = floors.flatMap((floor) =>
    floor.spaces
      .filter((space) => sourceValue(space.quantities.manual_extinguishers))
      .map((space) => [
        sourceValue(floor.name) || '—',
        sourceValue(space.name) || '—',
        sourceValue(space.quantities.manual_extinguishers),
        manualExtinguisherTypeLabel(sourceValue(space.quantities.manual_extinguisher_type)) || '—',
        sourceValue(space.quantities.manual_extinguisher_size) || '—',
      ])
  );
  const alarmRows = floors.flatMap((floor) =>
    floor.spaces
      .filter((space) =>
        [
          sourceValue(space.quantities.fire_alarm_panels),
          sourceValue(space.quantities.smoke_detectors),
          sourceValue(space.quantities.heat_detectors),
          sourceValue(space.quantities.alarm_bells),
        ].some(Boolean)
      )
      .map((space) => [
        sourceValue(floor.name) || '—',
        sourceValue(space.name) || '—',
        sourceValue(space.quantities.fire_alarm_panels) || '—',
        sourceValue(space.quantities.smoke_detectors) || '—',
        sourceValue(space.quantities.heat_detectors) || '—',
        sourceValue(space.quantities.alarm_bells) || '—',
        sourceValue(space.quantities.alarm_panel_locations) || '—',
      ])
  );
  const emergencyRows = floors.flatMap((floor) =>
    floor.spaces
      .filter((space) => sourceValue(space.quantities.emergency_lights) || sourceValue(space.quantities.signs))
      .map((space) => [
        sourceValue(floor.name) || '—',
        sourceValue(space.name) || '—',
        sourceValue(space.quantities.emergency_lights) || '—',
        sourceValue(space.quantities.signs) || '—',
      ])
  );

  const constructionRows = rows(
    row('نوع البناء', sourceValue(plan.construction_type)),
    row('تصنيف الإشغال', sourceValue(plan.occupancy_classification)),
    row('مبنى مرتفع', sourceValue(plan.high_rise_building)),
    row('أتريوم', sourceValue(plan.atrium_exists)),
    row('عدد الأقبية', sourceValue(plan.basement_floors_count)),
    row('العمق تحت الأرض', withUnit(sourceValue(plan.underground_depth_m), 'م')),
    row('مبنى بلا نوافذ', sourceValue(plan.windowless_building)),
    row('وصف الأدوار', sourceValue(plan.floors_description)),
    row('درجة الخطورة المعتمدة', preferredHazard)
  );

  const hasWaterDesign = Boolean(rawDesign) && [
    design.water_supply.water_source,
    design.water_supply.tank_type,
    design.water_supply.tank_material,
    design.water_tank.capacity_m3.value,
    design.water_tank.water_demand_lpm.value,
    design.water_tank.duration_min.value,
    design.water_tank.calculated_required_volume_m3,
  ].some((value) => value !== null && value !== undefined && String(value).trim() !== '');
  const hasPumpDesign = Boolean(rawDesign) && [
    design.pump.type,
    design.pump.capacity.value,
    design.pump.pressure.value,
    design.pump.rated_flow.value,
    design.pump.rated_pressure.value,
    design.diesel_pump.capacity.value,
    design.diesel_pump.pressure.value,
    design.jockey_pump.capacity.value,
    design.jockey_pump.pressure.value,
  ].some((value) => value !== null && value !== undefined && String(value).trim() !== '');
  const hasSprinklerDesign = Boolean(rawDesign) && [
    yesNo(design.sprinkler.required),
    design.sprinkler.system_type,
    design.sprinkler.zones_count,
    design.sprinkler.sprinkler_type,
    design.sprinkler.k_factor,
    design.sprinkler.design_pressure,
    design.sprinkler.design_flow,
  ].some((value) => compact(value));
  const hasStandpipeDesign = Boolean(rawDesign) && Boolean(compact(design.standpipe.notes));

  const civilDefenseRows = rows(
    row('جهة الدفاع المدني المختصة', sourceValue(plan.civil_defense_branch)),
    row('فريق إنقاذ خاص', sourceValue(plan.special_rescue_team_required)),
    row('مدخل الموقع', design.fire_truck_access.site_entrance),
    row('طريق سيارات الإطفاء', design.fire_truck_access.fire_road),
    row('عرض الطريق', withUnit(compact(design.fire_truck_access.road_width_m), 'م')),
    row('وصول مركبات الدفاع المدني', design.fire_truck_access.building_access),
    row('منطقة التموضع', design.fire_truck_access.staging_area),
    row('وصلة الدفاع المدني', design.fire_truck_access.civil_defense_connection),
    row('موقع الوصلة', design.fire_truck_access.connection_location)
  );

  const waterRows = rows(
    row('مصدر مياه الإطفاء', design.water_supply.water_source),
    row('نوع خزان مياه الإطفاء', design.water_supply.tank_type),
    row('مادة الخزان', design.water_supply.tank_material),
    row('حالة الخزان', yesNo(design.water_tank.exists)),
    row('السعة المركبة للخزان', formatMeasured(design.water_tank.capacity_m3, { empty: '' })),
    row('معدل الطلب المائي', formatMeasured(design.water_tank.water_demand_lpm, { empty: '' })),
    row('مدة التخزين', formatMeasured(design.water_tank.duration_min, { empty: '' })),
    row(
      'حجم الخزان المحسوب',
      design.water_tank.calculated_required_volume_m3 == null
        ? ''
        : `${design.water_tank.calculated_required_volume_m3} م³`
    )
  );

  const pumps = [
    ...pumpRows('مضخة الحريق الكهربائية', design.pump),
    ...pumpRows('مضخة الحريق الديزل', design.diesel_pump),
    ...pumpRows('مضخة الجوكي', design.jockey_pump),
    ...rows(
      row('اعتماد مجموعة المضخات', design.pump.type),
      row('التدفق المقنن للمضخة الكهربائية', formatMeasured(design.pump.rated_flow, { empty: '' })),
      row('الضغط المقنن للمضخة الكهربائية', formatMeasured(design.pump.rated_pressure, { empty: '' }))
    ),
  ];

  const sprinklerRows = rows(
    row('نظام الرش وفق بيانات المخطط', sourceValue(plan.sprinkler_system)),
    row('إجمالي عدد المرشات', sourceValue(source.aggregates.total_sprinklers)),
    row('حالة نظام الرش الآلي', yesNo(design.sprinkler.required)),
    row('نوع النظام', design.sprinkler.system_type),
    row('عدد المناطق', design.sprinkler.zones_count),
    row('نوع الرشاشات', design.sprinkler.sprinkler_type),
    row('معامل K', design.sprinkler.k_factor),
    row('ضغط التصميم', design.sprinkler.design_pressure),
    row('تصرف التصميم', design.sprinkler.design_flow)
  );

  const standpipeRows = rows(
    row('حالة نظام الـ Standpipe / Hose Reel', yesNo(design.standpipe.required)),
    row('وصف النظام', design.standpipe.notes)
  );

  const alarmRowsFromDesign = rows(
    row('نظام الإنذار وفق بيانات المخطط', sourceValue(plan.fire_alarm_system)),
    row('لوحة التحكم', design.fire_alarm.control_panel),
    row('عدد لوحات الإنذار', sourceValue(source.aggregates.total_fire_alarm_panels)),
    row('كواشف الدخان', sourceValue(source.aggregates.total_smoke_detectors)),
    row('كواشف الحرارة', sourceValue(source.aggregates.total_heat_detectors)),
    row('نقاط النداء اليدوية', design.fire_alarm.manual_call_points),
    row('أجهزة التنبيه', sourceValue(source.aggregates.total_alarm_bells)),
    row('نظام الإخلاء الصوتي', design.fire_alarm.voice_alarm),
    row('تكامل الأنظمة', design.fire_alarm.integration),
    row('ملاحظات فنية', design.fire_alarm.notes)
  );

  const supportingRows = rows(
    row('إنارة الطوارئ', supportingDisplay(design.supporting_systems.emergency_lighting)),
    row('اللوحات الإرشادية', supportingDisplay(design.supporting_systems.exit_signs)),
    row('التحكم بالدخان', supportingDisplay(design.supporting_systems.smoke_control)),
    row('التهوية', supportingDisplay(design.supporting_systems.ventilation)),
    row('السلامة الكهربائية', supportingDisplay(design.supporting_systems.electrical_safety)),
    row('القدرة الاحتياطية', supportingDisplay(design.supporting_systems.emergency_power))
  );

  const firefightingNotes = selectedSystemNotes(report.firefighting_items);
  const alarmNotes = selectedSystemNotes(report.alarm_items);
  const exitsNotes = selectedSystemNotes(report.exits_items);
  const ventilationNotes = selectedSystemNotes(report.ventilation_items);
  const electricalRows = rows(
    row('التأريض', sourceValue(plan.electrical_grounding)),
    row('مانع الصواعق', sourceValue(plan.lightning_protection)),
    row('المولد الاحتياطي', sourceValue(plan.backup_generator)),
    row('ملاحظات السلامة الكهربائية', compact(report.overview_text))
  );
  const egressMetricRows = preferredEgressMetrics
    .map((metric) => [metric.label, metric.value, metric.note || '—']);
  const evidenceSectionIds: Record<TechnicalReportPdfEvidenceGroup, EngineeringStudySectionId> = {
    site_access: 'site_access_evidence',
    existing_condition: 'existing_condition_evidence',
    safety_system: 'safety_system_evidence',
    code_evidence: 'code_evidence_references',
  };
  const evidenceSections = pdfContent.evidence_groups
    .filter((group) => group.items.some((item) => Boolean(item.image_src)))
    .map((group, index) => {
      const images = group.items
        .filter((item) => Boolean(item.image_src))
        .map((item) => ({
          src: item.image_src!,
          caption_ar: item.caption,
          caption_en: item.caption,
          image_id: item.id,
          image_type:
            item.kind === 'code_excerpt'
              ? ('code_proof' as const)
              : item.kind === 'civil_defense_map' || item.kind === 'civil_defense_route' || item.kind === 'satellite_image'
                ? ('site_map' as const)
                : item.kind === 'safety_system'
                  ? ('system' as const)
                  : ('site' as const),
          layout_type:
            item.kind === 'code_excerpt' || item.kind === 'civil_defense_map' || item.kind === 'civil_defense_route' || item.kind === 'satellite_image'
              ? ('full_width' as const)
              : ('double' as const),
          intrinsic_width: item.media_presentation.intrinsic_width,
          intrinsic_height: item.media_presentation.intrinsic_height,
          aspect_ratio: item.media_presentation.aspect_ratio,
          presentation_state: item.media_presentation.state,
          subsection_ar: item.title,
          subsection_en: item.title,
          description_ar: item.kind === 'code_excerpt' ? codeEvidenceReferenceLines(item.code_reference).join(' — ') : item.engineering_note,
          description_en: item.engineering_note,
        }));
      return section(evidenceSectionIds[group.group], 29 + index, `المرفقات — ${group.title_ar}`, [], [], images);
    });

  const sections: EngineeringStudySection[] = [
    section('introduction', 1, 'المقدمة', [
      `أُعد هذا التقرير الفني لأنظمة السلامة والوقاية من الحريق لمشروع «${projectName}» لعرض البيانات الهندسية والمستندات المتاحة للمشروع بصياغة تقريرية رسمية.`,
    ]),
    section('applicable_codes', 2, 'نطاق الدراسة والأكواد والمراجع', [
      design.applicable_codes.length
        ? `تُعرض الدراسة في ضوء المراجع والاشتراطات المسجلة للمشروع، ومنها: ${design.applicable_codes.join('، ')}.`
        : 'تُعرض الدراسة في ضوء الأنظمة والاشتراطات الفنية المعتمدة للمشروع.',
    ]),
    section('project_description', 3, 'وصف المشروع', [
      `يتناول التقرير بيانات المنشأة ووصف الإشغال وعناصر السلامة والوقاية من الحريق المتوفرة ضمن ملف المشروع وقت إصدار التقرير.`
    ], basicRows.length ? [twoColumnTable('بيانات المشروع', basicRows)] : []),
    section('occupancy_classification', 4, 'تصنيف الإشغال ونوع البناء', [], [
      ...(occupancyRows.length ? [dataTable('تصنيف الإشغال والخطورة', ['الدور', 'المساحة', 'النشاط', 'تصنيف الإشغال', 'تصنيف الخطورة'], occupancyRows)] : []),
      ...(constructionRows.length ? [twoColumnTable('نوع البناء والخصائص العامة', constructionRows)] : []),
    ]),
    section('building_information', 5, 'المساحات والأدوار والارتفاعات', [], floorRows.length ? [
      dataTable('بيانات الأدوار والمساحات', ['الدور', 'المساحة', 'النشاط', 'المساحة م²', 'عدد الشاغلين', 'مسافة السفر'], floorRows),
    ] : []),
    section('fire_resistance', 6, 'مقاومة عناصر المبنى', [
      'تُراجع عناصر الحماية السلبية ومقاومة الحريق للعناصر الإنشائية وفق نوع البناء والإشغال والمخططات والمواصفات المعتمدة للمشروع.'
    ]),
    section('exterior_wall_protection', 7, 'حماية الجدران الخارجية', [
      'تُراجع حماية الجدران الخارجية والفتحات ذات العلاقة وفق موقع المبنى ومتطلبات الكود والمخططات المعتمدة.'
    ]),
    ...(sourceValue(plan.atrium_exists) || sourceValue(plan.basement_floors_count) || sourceValue(plan.windowless_building)
      ? [section('special_hazard_areas', 8, 'المناطق الخاصة ومخاطرها', [], [twoColumnTable('خصائص خاصة مسجلة للمشروع', rows(
          row('الأتريوم', sourceValue(plan.atrium_exists)),
          row('الأقبية', sourceValue(plan.basement_floors_count)),
          row('مبنى بلا نوافذ', sourceValue(plan.windowless_building))
        ))])]
      : []),
    section('means_of_egress', 9, 'وسائل الخروج', [
      'تُراجع مسارات الخروج وسعة المخارج ومسافات السفر وفق الإشغال الفعلي والتوزيع المعماري المسجل للمشروع.',
      ...exitsNotes,
    ], egressMetricRows.length ? [dataTable('مقاييس الإخلاء المعتمدة', ['البند', 'القيمة', 'الملاحظة'], egressMetricRows)] : []),
    ...(occupantRows.length ? [section('occupant_load', 10, 'حمل الإشغال', [], [dataTable('حمل الإشغال', ['الدور', 'المساحة / الاستخدام', 'المساحة', 'عدد الشاغلين'], occupantRows)])] : []),
    ...(egressRows.length ? [
      section('exit_capacity', 11, 'سعة المخارج', [], [dataTable('سعة المخارج', ['الدور', 'الشاغلون', 'المخارج', 'السلالم', 'أقصى مسافة سفر'], egressRows)]),
      section('travel_distance', 12, 'مسافة السفر', ['تُقرأ مسافات السفر المسجلة ضمن جدول وسائل الخروج أعلاه.']),
    ] : []),
    section('building_requirements', 13, 'متطلبات المبنى وفق الكود', [
      'تُعرض متطلبات السلامة ذات الصلة بالمبنى وفق نوع الإشغال والخصائص المعمارية والمستندات المعتمدة للمشروع.'
    ]),
    section('fire_compartments', 14, 'تقسيمات ومقصورات الحريق', [
      'تُراجع المقصورات والفواصل ووسائل الحماية المرتبطة بها وفق المخططات والمواصفات المعتمدة للمشروع.'
    ]),
    ...(civilDefenseRows.length ? [section('fire_truck_access', 15, 'وصول آليات الدفاع المدني', ['تُعرض بيانات الوصول ووصلة الدفاع المدني هنا كمعلومات موروثة من مصدر التصميم الفني، ولا تُنشأ قيم افتراضية داخل التقرير.'], [
      twoColumnTable('بيانات الوصول والجهات ذات الصلة — مصدر موروث', civilDefenseRows),
    ])] : []),
    ...(hasWaterDesign || hasPumpDesign || hasStandpipeDesign || hasSprinklerDesign || extinguisherRows.length || design.extinguishers.length || firefightingNotes.length || supportingRows.length ? [section('mechanical_fire_safety', 16, 'أنظمة السلامة الميكانيكية ومكافحة الحريق', ['تُعرض الأنظمة الميكانيكية المسجلة للمشروع في الأقسام التالية.'])] : []),
    ...(hasWaterDesign && waterRows.length ? [section('fire_water_supply', 17, 'إمداد مياه الإطفاء', [], [twoColumnTable('إمداد مياه الإطفاء والخزان', waterRows)])] : []),
    ...(hasPumpDesign && pumps.length ? [section('fire_pump_analysis', 18, 'مضخات الحريق', [], [twoColumnTable('مجموعة مضخات الحريق', pumps)])] : []),
    ...(hasStandpipeDesign && standpipeRows.length ? [section('hose_reel_study', 19, 'نظام Hose Reel / Standpipe', ['تُعرض هذه البيانات من مصدر التصميم الفني الموروث للقراءة فقط.'], [twoColumnTable('بيانات النظام — مصدر موروث', standpipeRows)])] : []),
    ...(hasSprinklerDesign && sprinklerRows.length ? [section('sprinkler_system', 20, 'نظام الرش الآلي', [], [twoColumnTable('بيانات نظام الرش الآلي', sprinklerRows)])] : []),
    ...(extinguisherRows.length || design.extinguishers.length ? [section('portable_extinguishers', 21, 'الطفايات اليدوية', [], [
      ...(extinguisherRows.length ? [dataTable('حصر الطفايات اليدوية', ['الدور', 'المساحة', 'العدد', 'النوع', 'السعة'], extinguisherRows)] : []),
      ...(design.extinguishers.length ? [dataTable('تفاصيل الطفايات المسجلة — مصدر موروث', ['النوع', 'العدد', 'الموقع', 'التصنيف'], design.extinguishers.map((item) => [manualExtinguisherTypeLabel(item.type) || '—', item.count || '—', item.location || '—', item.rating || '—']))] : []),
    ])] : []),
    ...(firefightingNotes.length ? [section('special_suppression', 22, 'أنظمة إطفاء خاصة', firefightingNotes)] : []),
    ...(supportingRows.length || ventilationNotes.length ? [section('mechanical_ventilation', 23, 'التهوية والتحكم بالدخان والأنظمة الداعمة', ventilationNotes, supportingRows.length ? [twoColumnTable('الأنظمة الداعمة', supportingRows)] : [])] : []),
    ...(alarmRowsFromDesign.length || alarmRows.length || alarmNotes.length || emergencyRows.length || electricalRows.length ? [section('electrical_fire_safety', 24, 'أنظمة السلامة الكهربائية', ['تُعرض أنظمة الإنذار والكشف والإنارة الإرشادية المسجلة للمشروع في الأقسام التالية.'], electricalRows.length ? [twoColumnTable('بيانات السلامة الكهربائية', electricalRows)] : [])] : []),
    ...(alarmRowsFromDesign.length || alarmRows.length || alarmNotes.length ? [section('fire_alarm_study', 25, 'نظام إنذار وكشف الحريق', [...alarmNotes], [
      ...(alarmRowsFromDesign.length ? [twoColumnTable('مكونات نظام الإنذار', alarmRowsFromDesign)] : []),
      ...(alarmRows.length ? [dataTable('توزيع أجهزة الإنذار والكشف', ['الدور', 'المساحة', 'لوحات الإنذار', 'كواشف الدخان', 'كواشف الحرارة', 'أجهزة التنبيه', 'مواقع اللوحات'], alarmRows)] : []),
    ])] : []),
    ...(emergencyRows.length ? [section('emergency_lighting', 26, 'إنارة الطوارئ واللوحات الإرشادية', [], [dataTable('إنارة الطوارئ واللوحات الإرشادية', ['الدور', 'المساحة', 'إنارة الطوارئ', 'اللوحات الإرشادية'], emergencyRows)])] : []),
    section('conclusion', 27, 'الخلاصة الفنية', [
      compact(design.summary_text) || compact(report.overview_text) || `يلخص هذا التقرير البيانات الهندسية والأنظمة المسجلة للمشروع «${projectName}» وقت إصداره، ويُقرأ مع المخططات والمستندات المعتمدة ذات الصلة.`
    ]),
    ...(pdfContent.recommendations.length ? [section('engineering_recommendations', 28, 'التوصيات الهندسية المعتمدة', pdfContent.recommendations.map((item) => item.text))] : []),
    ...evidenceSections,
  ];

  return {
    locale,
    title_ar: 'التقرير الفني لأنظمة السلامة والوقاية من الحريق',
    title_en: 'Fire Safety Technical Report',
    generated_at: new Date().toISOString(),
    report_number: report.outgoing_number || '',
    report_date: report.report_date || '',
    project_name: projectName,
    client_code: params.client.client_code || '',
    owner_name: ownerName,
    prepared_by: compact(report.safety_engineer_name),
    executive_director: compact(report.executive_director_name),
    cover_image: report.facade_photo?.dataUrl
      ? {
          src: report.facade_photo.dataUrl,
          caption_ar: report.facade_photo.caption || 'واجهة المشروع',
          caption_en: report.facade_photo.caption || 'Project facade',
          image_type: 'facade',
          layout_type: 'full_width',
        }
      : null,
    sections,
    rules_gate_ok: true,
    rules_summary_ar: '',
    rules_summary_en: '',
    missing_inputs: [],
  };
}
