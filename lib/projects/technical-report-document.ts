import type { ClientRecord } from '@/lib/types/client';
import type { ProjectEngineeringData, TechnicalReport } from '@/lib/types/project-reports';
import type { EngineeringStudyDocument, EngineeringStudySection, ReportLocale } from '@/lib/projects/engineering-report-engine/types';
import { buildTechnicalReportSourceData, type TechnicalReportSourceField } from '@/lib/projects/technical-report-source-data';

const AR = 'ar' as const;
type Row = string[];

function missing(v: unknown): boolean { return v === null || v === undefined || v === ''; }
function value(field: TechnicalReportSourceField | undefined, fallback = '—'): string {
  const v = field?.final_value ?? field?.value;
  if (v === null || v === undefined || v === '') return fallback;
  if (v === true) return 'نعم';
  if (v === false) return 'لا';
  return String(v);
}
function n(field: TechnicalReportSourceField | undefined, unit = ''): string { const v = field?.final_value ?? field?.value; return v === null || v === undefined || v === '' ? '—' : `${v}${unit ? ` ${unit}` : ''}`; }
function section(id: EngineeringStudySection['id'], number: number, title: string, paragraphs: string[] = [], tables: EngineeringStudySection['tables'] = [], images: EngineeringStudySection['images'] = []): EngineeringStudySection {
  return { id, number, title_ar: title, title_en: title, paragraphs: paragraphs.filter(Boolean).map((text) => ({ text, citations: [] })), ...(tables.length ? { tables } : {}), ...(images.length ? { images } : {}) };
}
function table(caption: string, headers: string[], rows: Row[]) { return { caption_ar: caption, caption_en: caption, headers_ar: headers, headers_en: headers, rows }; }
function hasDetail(rows: Row[], start = 0) { return rows.some((row) => row.slice(start).some((cell) => cell !== '—' && cell !== 'غير مدخل' && cell !== '')); }
function conditionalTable(caption: string, headers: string[], rows: Row[], detailStart: number, missingMessage = 'لم تُسجل بيانات تفصيلية لهذا البند.') { return hasDetail(rows, detailStart) ? { paragraphs: [] as string[], tables: [table(caption, headers, rows)] } : { paragraphs: [missingMessage], tables: [] as NonNullable<EngineeringStudySection['tables']> }; }
function selected(report: TechnicalReport) { return report.general_recommendations.filter((r) => r.checked).map((r) => r.id); }
function notes(items: TechnicalReport['firefighting_items']) { return items.filter((i) => i.enabled && (i.notes || i.selectedOptions.length)).map((i) => i.notes || i.selectedOptions.join('، ')); }

/** Dedicated formal Technical Report document. It consumes only the Phase 1 final-value bridge plus explicit report fields. */
export function generateTechnicalReportDocument(params: { client: ClientRecord; report: TechnicalReport; engineeringData?: ProjectEngineeringData | null; locale?: ReportLocale }): EngineeringStudyDocument {
  const locale = params.locale || AR;
  const engineeringData: ProjectEngineeringData = params.engineeringData ? { ...params.engineeringData, technical_report: params.report } : ({ technical_report: params.report } as ProjectEngineeringData);
  const source = buildTechnicalReportSourceData({ client: params.client, engineeringData });
  const report = params.report;
  const p = source.project;
  const plan = source.plan;
  const floors = source.floors;
  const aggregates = source.aggregates;
  const floorRows = floors.flatMap((floor) => floor.spaces.map((space) => [value(floor.name), value(space.name), value(space.activity_use), n(space.area_m2, 'م²'), n(space.occupants), n(space.exits), n(space.travel_distance_m, 'م')]));
  const occupancyRows = floors.flatMap((floor) => floor.spaces.map((space) => [value(floor.name), value(space.name), value(space.activity_use), value(space.occupancy), value(space.hazard_classification)]));
  const occupantRows = floors.flatMap((floor) => floor.spaces.map((space) => [value(floor.name), `${value(space.name)} / ${value(space.activity_use)}`, n(space.area_m2, 'م²'), n(space.occupants)]));
  const egressRows = floors.map((floor) => [value(floor.name), n(floor.occupants), n(floor.exits), n(plan.stairs_count), n(floor.travel_distance_m, 'م')]);
  const extinguisherRows = floors.flatMap((floor) => floor.spaces.map((space) => [value(floor.name), value(space.name), n(space.quantities.manual_extinguishers), value(space.quantities.manual_extinguisher_type), value(space.quantities.manual_extinguisher_size)]));
  const alarmRows = floors.flatMap((floor) => floor.spaces.map((space) => [value(floor.name), value(space.name), n(space.quantities.fire_alarm_panels), n(space.quantities.smoke_detectors), n(space.quantities.heat_detectors), n(space.quantities.alarm_bells)]));
  const emergencyRows = floors.flatMap((floor) => floor.spaces.map((space) => [value(floor.name), value(space.name), n(space.quantities.emergency_lights), n(space.quantities.signs)]));
  const electricalRows: Row[] = [['التأريض', value(plan.electrical_grounding, 'غير مدخل')], ['الحماية من الصواعق', value(plan.lightning_protection, 'غير مدخل')], ['المولد الاحتياطي', value(plan.backup_generator, 'غير مدخل')], ['ملاحظات المهندس', report.overview_text || '—']];
  const firefightingNotes = notes(report.firefighting_items).join(' — ');
  const alarmNotes = notes(report.alarm_items).join(' — ');
  const systemsRows: Row[] = [
    ['الرش الآلي', n(aggregates.total_sprinklers), firefightingNotes || '—'],
    ['الطفايات اليدوية', n(aggregates.total_extinguishers), firefightingNotes || '—'],
    ['نظام الإنذار المبكر', n(aggregates.total_alarm_devices), alarmNotes || '—'],
    ['إنارة الطوارئ', n(aggregates.total_emergency_lights), alarmNotes || '—'],
    ['اللوحات الإرشادية', n(aggregates.total_signs), alarmNotes || '—'],
  ].filter((row) => row[1] !== '—' || row[2] !== '—');
  const images = [report.facade_photo, report.earth_photo, report.site_photo].filter((image): image is NonNullable<typeof image> => Boolean(image?.dataUrl)).map((image, index) => ({ src: image.dataUrl || '', caption_ar: image.caption || 'صورة مرتبطة بالتقرير', caption_en: image.caption || 'Report image', image_id: image.id || `report-image-${index + 1}`, image_type: 'site' as const, layout_type: 'single' as const }));
  const observations = [
    ...notes(report.firefighting_items).map((text) => ['أنظمة مكافحة الحريق', text, 'قيد مراجعة']),
    ...notes(report.alarm_items).map((text) => ['نظام الإنذار والإخلاء', text, 'قيد مراجعة']),
    ...notes(report.exits_items).map((text) => ['المخارج ومسارات الهروب', text, 'قيد مراجعة']),
    ...notes(report.ventilation_items).map((text) => ['السلامة الميكانيكية', text, 'قيد مراجعة']),
  ];
  const recommendationLabels = selected(report).map((id) => id.replace(/[-_]/g, ' '));
  const applicableCodes = Object.keys(report.code_proofs_by_key || {}).length ? ['SBC / NFPA — مراجع مثبتة داخل التقرير'] : [];
  const hasMechanical = Boolean(notes(report.ventilation_items).length);
  const hasSprinklers = aggregates.total_sprinklers.final_value !== null && aggregates.total_sprinklers.final_value !== undefined;
  const sections: EngineeringStudySection[] = [
    section('introduction', 1, 'المقدمة', [`أُعد هذا التقرير الفني لأنظمة السلامة والوقاية من الحريق لمشروع «${value(p.project_name)}» بهدف توثيق البيانات والأنظمة المتاحة في ملف المشروع ونتائج المراجعة الهندسية. لا يمثل التقرير إقرار مطابقة نهائيًا ما لم تسجل حالة اعتماد صريحة من المهندس.`]),
    section('project_description', 2, 'نطاق التقرير', [`يغطي التقرير الأقسام التي تتوفر لها بيانات موثقة ضمن الدراسة، بما في ذلك الإشغال والمساحات والمخارج وأنظمة الحماية والإنذار والملاحظات الفنية. لا يتضمن التقرير الحسابات الهيدروليكية أو معادلات المضخات والخزانات.`]),
    section('applicable_codes', 3, 'الأكواد والمراجع', applicableCodes.length ? [`المراجع المتاحة في ملف المشروع: ${applicableCodes.join('، ')}.`] : ['لا تتوفر مراجع كودية محفوظة ضمن ملف المشروع.'], []),
    section('building_information', 4, 'بيانات المشروع', [], [table('البيانات الأساسية للمشروع', ['البند', 'القيمة'], [
      ['اسم المشروع', value(p.project_name)], ['المالك / المستثمر', value(p.owner_name)], ['النشاط', value(p.activity)], ['حالة المبنى', value(p.building_status)], ['المدينة', value(p.city)], ['الحي', value(p.district)], ['الشارع', value(p.street)], ['العنوان الوطني', value(p.national_address)], ['رقم القطعة', value(p.plot_number)], ['رقم رخصة البناء', value(p.building_permit_number)], ['تاريخ الرخصة', value(p.building_permit_date)], ['مساحة الأرض', n(p.land_area_m2, 'م²')], ['مساحة البناء', n(p.building_area_m2, 'م²')], ['عدد الأدوار', n(p.floors_count)], ['ارتفاع المبنى', n(plan.building_height_m, 'م')],
    ])]),
    section('site_information', 5, 'موقع المشروع', [`المدينة: ${value(p.city)}. الحي: ${value(p.district)}. الشارع: ${value(p.street)}. العنوان: ${value(p.national_address)}. الإحداثيات: ${report.gps_lat && report.gps_lng ? `${report.gps_lat}، ${report.gps_lng}` : '—'}. ${report.location_description || ''}`], [], images.filter((image) => image.caption_ar.includes('خريطة') || image.caption_ar.includes('موقع'))),
    section('owner_information', 6, 'وصف المشروع ومكوناته', [`يتكون المشروع من ${floors.length || '—'} أدوار موثقة، وبمساحة إجمالية ${n(aggregates.total_floor_area_m2, 'م²')}.`], [table('الأدوار والمساحات', ['الدور', 'المساحة', 'النشاط', 'المساحة م²', 'المخارج', 'مسافة السفر'], floorRows)]),
    section('occupancy_classification', 7, 'تصنيف الإشغال', [`${occupancyRows.length > 1 ? 'يحتوي المشروع على إشغالات متعددة، وتظهر أدناه حسب الدور والمساحة.' : 'يعرض الجدول أدناه تصنيف الإشغال المسجل.'}`], [table('تصنيف الإشغال والخطورة', ['الدور', 'المساحة', 'النشاط', 'تصنيف الإشغال', 'تصنيف الخطورة'], occupancyRows)]),
    section('hazard_classification', 8, 'الهيكل الإنشائي ومتطلبات مقاومة الحريق', conditionalTable('الخصائص الإنشائية المتاحة', ['البند', 'القيمة'], [['نوع البناء', value(plan.construction_type)], ['التصنيف الإنشائي', value(plan.occupancy_classification)], ['مبنى مرتفع', value(plan.high_rise_building)], ['أتريوم', value(plan.atrium_exists)], ['عدد الأقبية', n(plan.basement_floors_count)], ['العمق تحت الأرض', n(plan.underground_depth_m, 'م')], ['مبنى بلا نوافذ', value(plan.windowless_building)]], 1).paragraphs, conditionalTable('الخصائص الإنشائية المتاحة', ['البند', 'القيمة'], [['نوع البناء', value(plan.construction_type)], ['التصنيف الإنشائي', value(plan.occupancy_classification)], ['مبنى مرتفع', value(plan.high_rise_building)], ['أتريوم', value(plan.atrium_exists)], ['عدد الأقبية', n(plan.basement_floors_count)], ['العمق تحت الأرض', n(plan.underground_depth_m, 'م')], ['مبنى بلا نوافذ', value(plan.windowless_building)]], 1).tables),
    section('means_of_egress', 9, 'دراسة الطاقة الاستيعابية', [`إجمالي عدد الشاغلين المسجل: ${n(aggregates.total_occupants)}. لا تُحوّل القيم غير المدخلة إلى صفر.`, ...conditionalTable('حصر الشاغلين', ['الدور', 'المساحة / الاستخدام', 'المساحة', 'عدد الشاغلين'], occupantRows, 3).paragraphs], conditionalTable('حصر الشاغلين', ['الدور', 'المساحة / الاستخدام', 'المساحة', 'عدد الشاغلين'], occupantRows, 3).tables),
    section('fire_truck_access', 10, 'مخارج ومسارات الهروب', conditionalTable('المخارج ومسارات الهروب', ['الدور', 'الشاغلون', 'المخارج', 'السلالم', 'أقصى مسافة سفر'], egressRows, 1).paragraphs, conditionalTable('المخارج ومسارات الهروب', ['الدور', 'الشاغلون', 'المخارج', 'السلالم', 'أقصى مسافة سفر'], egressRows, 1).tables),
    section('civil_defense_requirements', 11, 'متطلبات وصول فرق وآليات الدفاع المدني', [`قسم الدفاع المدني المختص: ${value(plan.civil_defense_branch)}. فريق إنقاذ خاص: ${value(plan.special_rescue_team_required)}. ${report.civil_defense_branch ? `ملاحظة المهندس: ${report.civil_defense_branch}.` : ''}`]),
    section('sprinkler_system', 12, 'أنظمة مكافحة الحريق', conditionalTable('ملخص أنظمة مكافحة الحريق', ['النظام', 'الكمية', 'الملاحظات'], systemsRows, 1, 'لم تُسجل بيانات تفصيلية لأنظمة مكافحة الحريق.').paragraphs, conditionalTable('ملخص أنظمة مكافحة الحريق', ['النظام', 'الكمية', 'الملاحظات'], systemsRows, 1, 'لم تُسجل بيانات تفصيلية لأنظمة مكافحة الحريق.').tables),
    ...(hasSprinklers ? [section('fire_water_supply', 12.1, 'نظام الرش الآلي', [`عدد المرشات المسجل: ${n(aggregates.total_sprinklers)}. يعرض هذا القسم بيانات الحماية المسجلة ولا يتضمن أي حسابات هيدروليكية.`], [table('توزيع المرشات', ['الدور', 'المساحة', 'عدد المرشات'], floors.flatMap((floor) => floor.spaces.map((space) => [value(floor.name), value(space.name), n(space.quantities.sprinklers)])))] )] : []),
    section('portable_extinguishers', 12.2, 'الطفايات اليدوية', conditionalTable('حصر الطفايات اليدوية', ['الدور', 'المساحة', 'العدد', 'النوع', 'السعة'], extinguisherRows, 2).paragraphs, conditionalTable('حصر الطفايات اليدوية', ['الدور', 'المساحة', 'العدد', 'النوع', 'السعة'], extinguisherRows, 2).tables),
    section('fire_alarm_study', 13, 'نظام الإنذار المبكر من الحريق', conditionalTable('ملخص الإنذار والكواشف', ['الدور', 'المساحة', 'لوحات الإنذار', 'كواشف الدخان', 'كواشف الحرارة', 'أجهزة التنبيه'], alarmRows, 2).paragraphs, conditionalTable('ملخص الإنذار والكواشف', ['الدور', 'المساحة', 'لوحات الإنذار', 'كواشف الدخان', 'كواشف الحرارة', 'أجهزة التنبيه'], alarmRows, 2).tables),
    section('emergency_lighting', 13.1, 'إنارة الطوارئ واللوحات الإرشادية', conditionalTable('حصر إنارة الطوارئ واللوحات الإرشادية', ['الدور', 'المساحة', 'إنارة الطوارئ', 'اللوحات الإرشادية'], emergencyRows, 2).paragraphs, conditionalTable('حصر إنارة الطوارئ واللوحات الإرشادية', ['الدور', 'المساحة', 'إنارة الطوارئ', 'اللوحات الإرشادية'], emergencyRows, 2).tables),
    section('electrical_safety', 14, 'متطلبات السلامة الكهربائية', conditionalTable('السلامة الكهربائية', ['البند', 'القيمة'], electricalRows, 1).paragraphs, conditionalTable('السلامة الكهربائية', ['البند', 'القيمة'], electricalRows, 1).tables),
    ...(hasMechanical ? [section('mechanical_ventilation', 15, 'متطلبات السلامة الميكانيكية', notes(report.ventilation_items))] : []),
    ...(images.length ? [section('engineering_compliance_review', 16, 'الصور والأدلة', [], [], images)] : []),
    section('summary', 17, 'الملاحظات الفنية', [], observations.length ? [table('سجل الملاحظات الفنية', ['القسم', 'الملاحظة', 'الحالة'], observations)] : []),
    ...(recommendationLabels.length ? [section('engineering_recommendations', 18, 'التوصيات', recommendationLabels.map((label) => `التوصية المعتمدة: ${label}.`))] : []),
    section('conclusion', 19, 'ملخص الدراسة', [`يعرض هذا التقرير بيانات المشروع والأنظمة والملاحظات الفنية المتاحة وقت الإصدار. حالة التقرير: ${report.status || 'مسودة'}. لا يتضمن هذا الملخص حكم مطابقة نهائيًا دون اعتماد صريح من المهندس.`]),
  ];
  return { locale, title_ar: 'التقرير الفني لأنظمة السلامة والوقاية من الحريق', title_en: 'Fire Safety Technical Report', generated_at: new Date().toISOString(), report_number: report.outgoing_number || '—', report_date: report.report_date || '—', project_name: value(p.project_name, params.client.business_name || params.client.name || '—'), client_code: params.client.client_code || '', owner_name: value(p.owner_name, params.client.owner_name || params.client.name || '—'), cover_image: report.facade_photo?.dataUrl ? { src: report.facade_photo.dataUrl, caption_ar: report.facade_photo.caption || 'واجهة المشروع', caption_en: report.facade_photo.caption || 'Project facade', image_type: 'facade', layout_type: 'full_width' } : null, sections, rules_gate_ok: true, rules_summary_ar: '', rules_summary_en: '', missing_inputs: [] };
}
