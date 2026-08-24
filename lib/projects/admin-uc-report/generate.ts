import type { CompanyProfile } from '@/lib/company-profile';
import type { ClientRecord } from '@/lib/types/client';
import {
  EMPTY_PROJECT_ENGINEERING_DATA,
  type ProjectEngineeringData,
  type TechnicalReport,
} from '@/lib/types/project-reports';
import {
  NOT_AVAILABLE_AR,
  NOT_ENTERED_AR,
  VALUE_SOURCE_LABEL_AR,
  formatDisplayOrNotEntered,
  formatFactOrUnavailable,
  formatMeasured,
  type FireProtectionDesign,
} from '@/lib/types/fire-protection-design';
import {
  buildDefaultReviewRows,
  getTankVolumeCheck,
  mergeFireProtectionDesign,
} from '@/lib/projects/admin-uc-report/design';
import { resolveLifecycleMode } from '@/lib/projects/admin-uc-report/select';
import { lifecyclePhrases, supportingStatusLabel, yesNoLabel } from '@/lib/projects/admin-uc-report/tone';
import { getClientIdentitySnapshot } from '@/lib/projects/client-identity';
import { buildTechnicalReportSourceData, type TechnicalReportSourceField } from '@/lib/projects/technical-report-source-data';
import { resolvePreferredEgressMetrics, resolvePreferredHazard } from '@/lib/projects/technical-report-source-priority';
import { manualExtinguisherTypeLabel } from '@/lib/projects/technical-report-binding-registry';

export type AdminUcTocEntry = { id: string; title: string; number: number };

export type AdminUcBlock =
  | { kind: 'h2'; text: string }
  | { kind: 'h3'; text: string }
  | { kind: 'p'; text: string }
  | { kind: 'ul'; items: string[] }
  | { kind: 'ol'; items: string[] }
  | { kind: 'table'; caption?: string; headers: string[]; rows: string[][] }
  | { kind: 'note'; text: string };

export type AdminUcChapter = {
  id: string;
  number: number;
  title: string;
  blocks: AdminUcBlock[];
};

export type AdminUcAttachmentPage = {
  id: string;
  title: string;
  fileName?: string;
  note?: string;
  imageSrc?: string | null;
};

export type AdminUcDocument = {
  template_id: 'admin_uc';
  title_ar: string;
  project_name: string;
  owner_name: string;
  location: string;
  report_number: string;
  report_date: string;
  consultant: string;
  building_type_label: string;
  project_status_label: string;
  lifecycle_mode: FireProtectionDesign['lifecycle_mode'];
  design: FireProtectionDesign;
  toc: AdminUcTocEntry[];
  chapters: AdminUcChapter[];
  attachments: AdminUcAttachmentPage[];
  /** Acceptance / debug helpers */
  acceptance: {
    pump_capacity: string;
    pump_pressure: string;
    tank_capacity: string;
    water_demand: string;
    duration: string;
    theoretical_volume: string;
    tank_check_label: string;
  };
};

function sourceFieldDisplay(field: TechnicalReportSourceField | undefined): string {
  const value = field?.final_value ?? field?.value;
  if (value === null || value === undefined || value === '') return NOT_ENTERED_AR;
  return Array.isArray(value) ? value.map(String).filter(Boolean).join('، ') || NOT_ENTERED_AR : String(value);
}

function selectedNotes(items: TechnicalReport['firefighting_items']): string[] {
  return items
    .filter((item) => item.enabled)
    .flatMap((item) => [item.notes, ...item.selectedOptions])
    .map((item) => String(item || '').trim())
    .filter(Boolean);
}

const CORE_TOC: AdminUcTocEntry[] = [
  { id: 'intro', number: 1, title: 'المقدمة' },
  { id: 'project_desc', number: 2, title: 'وصف المشروع' },
  { id: 'codes_occ', number: 3, title: 'الأكواد وتصنيف الإشغال' },
  { id: 'egress', number: 4, title: 'المخارج ومسالك الهروب' },
  { id: 'fire_access', number: 5, title: 'وصول آليات الدفاع المدني' },
  { id: 'water', number: 6, title: 'إمداد مياه الإطفاء' },
  { id: 'suppression', number: 7, title: 'أنظمة مكافحة الحريق' },
  { id: 'alarm', number: 8, title: 'نظام الإنذار' },
  { id: 'supporting', number: 9, title: 'أنظمة السلامة المساندة' },
  { id: 'review', number: 10, title: 'مراجعة المتطلبات والتوصيات' },
  { id: 'summary', number: 11, title: 'الملخص والخلاصة' },
];

function collectAttachments(
  design: FireProtectionDesign,
  data?: ProjectEngineeringData | null
): AdminUcAttachmentPage[] {
  const pages: AdminUcAttachmentPage[] = [];
  let n = 1;
  for (const a of design.attachments || []) {
    pages.push({
      id: a.id || `att-${n}`,
      title: a.label || `مرفق ${n}`,
      fileName: a.fileName,
      imageSrc: a.dataUrl || null,
    });
    n += 1;
  }
  const drawings = data?.plan_attachments?.engineering_drawings || [];
  for (const f of drawings) {
    pages.push({
      id: f.id,
      title: `مرفق ${n} — مخطط هندسي`,
      fileName: f.fileName,
      imageSrc: f.dataUrl || null,
      note: 'مرفق من مخططات المشروع',
    });
    n += 1;
  }
  const hyd = data?.plan_attachments?.hydraulic_calculations || [];
  for (const f of hyd) {
    pages.push({
      id: f.id,
      title: `مرفق ${n} — حسابات هيدروليكية`,
      fileName: f.fileName,
      imageSrc: f.dataUrl || null,
    });
    n += 1;
  }
  const sitePhoto = data?.technical_report?.site_photo || data?.technical_report?.earth_photo;
  if (sitePhoto?.dataUrl) {
    pages.push({
      id: sitePhoto.id,
      title: `مرفق ${n} — صور الموقع`,
      note: 'صور الموقع تُعرض في المرفقات لمشاريع تحت الإنشاء',
      imageSrc: sitePhoto.dataUrl,
    });
  }
  return pages;
}

export function generateAdminUcReport(params: {
  client: ClientRecord;
  report: TechnicalReport;
  engineeringData?: ProjectEngineeringData | null;
  company?: CompanyProfile | null;
}): AdminUcDocument {
  const { client, report, engineeringData, company } = params;
  const identity = getClientIdentitySnapshot(client);
  const reportSource = buildTechnicalReportSourceData({
    client,
    engineeringData: engineeringData
      ? { ...engineeringData, technical_report: report }
      : { ...EMPTY_PROJECT_ENGINEERING_DATA, technical_report: report },
  });
  const lifecycle = resolveLifecycleMode({ client, report });
  const phrases = lifecyclePhrases(lifecycle);
  const spaceHazards = reportSource.floors.flatMap((floor) => floor.spaces.map((space) => sourceFieldDisplay(space.hazard_classification)));

  let design = mergeFireProtectionDesign(engineeringData?.fire_protection_design);
  design = {
    ...design,
    lifecycle_mode: lifecycle,
    building_kind: 'administrative',
    occupancy: {
      ...design.occupancy,
      occupancy_type: design.occupancy.occupancy_type || 'مبنى إداري',
      floors_count:
        design.occupancy.floors_count ||
        (client.floors_count != null ? String(client.floors_count) : ''),
      area_m2:
        design.occupancy.area_m2 ||
        identity.building_area ||
        identity.land_area ||
        '',
      hazard_class: resolvePreferredHazard(design.occupancy.hazard_class || report.risk_class, spaceHazards),
    },
  };
  if (!design.review_rows.length) {
    design = { ...design, review_rows: buildDefaultReviewRows(design) };
  } else {
    // Keep engineer rows but refresh pump/tank notes from live inputs
    design = {
      ...design,
      review_rows: design.review_rows.map((row) => {
        if (row.id === 'pump' || row.id === 'tank') {
          const fresh = buildDefaultReviewRows(design).find((r) => r.id === row.id);
          return fresh || row;
        }
        return row;
      }),
    };
  }

  const tankCheck = getTankVolumeCheck(design);
  const preferredEgressMetrics = resolvePreferredEgressMetrics(design.egress.metrics);
  const exitsNotes = selectedNotes(report.exits_items);
  const ventilationNotes = selectedNotes(report.ventilation_items);
  const alarmPanelLocations = reportSource.floors.flatMap((floor) =>
    floor.spaces.map((space) => sourceFieldDisplay(space.quantities.alarm_panel_locations)).filter((value) => value !== NOT_ENTERED_AR)
  );
  const brand =
    company?.legal_name ||
    company?.name ||
    'منصة توقع سلامة للاستشارات الهندسية واستشارات السلامة';
  const projectName =
    identity.facility_name || client.business_name || client.name || NOT_AVAILABLE_AR;
  const owner = identity.owner_name || client.owner_name || NOT_AVAILABLE_AR;
  const location = [
    client.region,
    client.city,
    client.district,
    client.street,
    client.national_address,
  ]
    .filter(Boolean)
    .join(' — ') || NOT_AVAILABLE_AR;

  const chapters: AdminUcChapter[] = [
    {
      id: 'intro',
      number: 1,
      title: 'المقدمة',
      blocks: [
        { kind: 'h2', text: 'المقدمة' },
        {
          kind: 'p',
          text: `تهدف هذه الدراسة إلى مراجعة متطلبات السلامة والوقاية من الحريق لمشروع مبنى إداري تحت الإنشاء، وتحديد نطاق أنظمة الحماية المطلوب توفيرها ضمن المخططات التنفيذية قبل التنفيذ والاستلام.`,
        },
        {
          kind: 'p',
          text: `نطاق الدراسة: تقييم متطلبات المخارج، وصول آليات الدفاع المدني، إمداد مياه الإطفاء، أنظمة المكافحة والإنذار، والأنظمة المساندة — مع إبراز المدخلات التصميمية (مضخة الحريق وخزان المياه) كـ Design Inputs تتطلب مطابقة هيدروليكية لاحقة.`,
        },
        {
          kind: 'p',
          text: `الهدف من الدراسة هو التحقق من ملاءمة متطلبات السلامة والوقاية من الحريق لطبيعة المبنى الإداري وحالة المشروع تحت الإنشاء، دون اختلاق قيم غير موثّقة في ملف المشروع.`,
        },
      ],
    },
    {
      id: 'project_desc',
      number: 2,
      title: 'وصف المشروع',
      blocks: [
        { kind: 'h2', text: 'وصف المشروع' },
        {
          kind: 'table',
          caption: 'بيانات المشروع',
          headers: ['البند', 'القيمة'],
          rows: [
            ['اسم المشروع', formatFactOrUnavailable(projectName)],
            ['اسم المالك', formatFactOrUnavailable(owner)],
            ['نوع المبنى', 'مبنى إداري'],
            ['حالة المشروع', 'تحت الإنشاء'],
            [
              'عدد الأدوار',
              formatFactOrUnavailable(
                design.occupancy.floors_count ||
                  (client.floors_count != null ? String(client.floors_count) : '')
              ),
            ],
            ['مساحة الأرض', formatFactOrUnavailable(identity.land_area || client.land_area)],
            [
              'إجمالي المساحة',
              formatFactOrUnavailable(identity.building_area || client.building_area),
            ],
            ['الموقع', formatFactOrUnavailable(location)],
            [
              'رقم رخصة البناء',
              formatFactOrUnavailable(
                report.building_permit_number ||
                  engineeringData?.building_plan?.building_permit_number
              ),
            ],
            ['تاريخ رخصة البناء', formatFactOrUnavailable(engineeringData?.building_plan?.building_permit_date)],
            ['وصف الأدوار', formatFactOrUnavailable(engineeringData?.building_plan?.floors_description)],
          ],
        },
      ],
    },
    {
      id: 'codes_occ',
      number: 3,
      title: 'الأكواد وتصنيف الإشغال',
      blocks: [
        { kind: 'h2', text: 'الكودات والمراجع' },
        {
          kind: 'p',
          text: 'تُعرض فقط الأكواد ذات العلاقة بنطاق تقرير المبنى الإداري تحت الإنشاء:',
        },
        { kind: 'ul', items: design.applicable_codes.length ? design.applicable_codes : [NOT_ENTERED_AR] },
        { kind: 'h2', text: 'تصنيف الإشغال' },
        {
          kind: 'table',
          headers: ['البند', 'القيمة', 'المصدر'],
          rows: [
            [
              'نوع الإشغال',
              formatDisplayOrNotEntered(design.occupancy.occupancy_type),
              VALUE_SOURCE_LABEL_AR[design.occupancy.source],
            ],
            [
              'درجة الخطورة',
              formatDisplayOrNotEntered(design.occupancy.hazard_class),
              VALUE_SOURCE_LABEL_AR[design.occupancy.source],
            ],
            [
              'عدد الأدوار',
              formatDisplayOrNotEntered(design.occupancy.floors_count),
              VALUE_SOURCE_LABEL_AR[design.occupancy.source],
            ],
            [
              'المساحة',
              formatDisplayOrNotEntered(design.occupancy.area_m2),
              VALUE_SOURCE_LABEL_AR[design.occupancy.source],
            ],
          ],
        },
      ],
    },
    {
      id: 'egress',
      number: 4,
      title: 'المخارج ومسالك الهروب',
      blocks: [
        { kind: 'h2', text: 'مسالك الهروب' },
        {
          kind: 'p',
          text: `يشمل القسم عدد المخارج، عروض المخارج، مسافات الهروب، اتجاه فتح الأبواب، السلالم، الممرات، والوصول إلى منطقة آمنة. ${phrases.providedVerb} هذه المتطلبات ضمن المخططات التنفيذية.`,
        },
        preferredEgressMetrics.length
          ? {
              kind: 'table' as const,
              caption: 'بيانات المخارج من المخطط / الإدخال',
              headers: ['البند', 'القيمة', 'الملاحظة'],
              rows: preferredEgressMetrics.map((m) => [
                m.label,
                formatDisplayOrNotEntered(m.value),
                m.note || '—',
              ]),
            }
          : {
              kind: 'note' as const,
              text: 'لم يتم إدخال قيم المخارج بعد — لا تُخترع أرقام. يُستكمل الجدول من المخططات عند توفرها.',
            },
        ...(design.egress.notes?.trim()
          ? [{ kind: 'p' as const, text: design.egress.notes.trim() }]
          : []),
        ...exitsNotes.map((text) => ({ kind: 'p' as const, text })),
      ],
    },
    {
      id: 'fire_access',
      number: 5,
      title: 'وصول آليات الدفاع المدني',
      blocks: [
        { kind: 'h2', text: 'وصول آليات الإطفاء' },
        { kind: 'p', text: `${phrases.accessLead} البيانات التالية موروثة من مصدر التصميم الفني للقراءة فقط، ولا ينشئ التقرير قيمًا افتراضية لها.` },
        {
          kind: 'table',
          headers: ['البند', 'القيمة'],
          rows: [
            ['مدخل الموقع', formatDisplayOrNotEntered(design.fire_truck_access.site_entrance)],
            ['طريق سيارات الإطفاء', formatDisplayOrNotEntered(design.fire_truck_access.fire_road)],
            ['عرض الطريق', formatDisplayOrNotEntered(design.fire_truck_access.road_width_m)],
            [
              'إمكانية الوصول للمبنى',
              formatDisplayOrNotEntered(design.fire_truck_access.building_access),
            ],
            [
              'منطقة تمركز الآليات',
              formatDisplayOrNotEntered(design.fire_truck_access.staging_area),
            ],
            [
              'وصلة الدفاع المدني',
              formatDisplayOrNotEntered(design.fire_truck_access.civil_defense_connection),
            ],
            [
              'موقع الوصلة المقترح',
              formatDisplayOrNotEntered(design.fire_truck_access.connection_location),
            ],
          ],
        },
        ...(design.fire_truck_access.notes?.trim()
          ? [{ kind: 'p' as const, text: design.fire_truck_access.notes.trim() }]
          : []),
      ],
    },
    {
      id: 'water',
      number: 6,
      title: 'إمداد مياه الإطفاء',
      blocks: [
        { kind: 'h2', text: 'إمداد مياه الإطفاء' },
        {
          kind: 'table',
          headers: ['البند', 'القيمة', 'المصدر'],
          rows: [
            [
              'مصدر المياه',
              formatDisplayOrNotEntered(design.water_supply.water_source),
              VALUE_SOURCE_LABEL_AR[design.water_tank.source],
            ],
            [
              'نوع الخزان',
              formatDisplayOrNotEntered(design.water_supply.tank_type),
              VALUE_SOURCE_LABEL_AR[design.water_tank.source],
            ],
            [
              'مادة الخزان',
              formatDisplayOrNotEntered(design.water_supply.tank_material),
              VALUE_SOURCE_LABEL_AR[design.water_tank.source],
            ],
            [
              'سعة خزان مياه الإطفاء التصميمية (تلقائي)',
              formatMeasured(design.water_tank.capacity_m3),
              VALUE_SOURCE_LABEL_AR[design.water_tank.capacity_m3.source],
            ],
            [
              'الطلب المائي Q',
              formatMeasured(design.water_tank.water_demand_lpm),
              VALUE_SOURCE_LABEL_AR[design.water_tank.water_demand_lpm.source],
            ],
            [
              'مدة التشغيل T',
              formatMeasured(design.water_tank.duration_min),
              VALUE_SOURCE_LABEL_AR[design.water_tank.duration_min.source],
            ],
            [
              'معادلة الدفاع المدني',
              design.water_tank.formula_ar ||
                'V (م³) = Q (لتر/دقيقة) × T (دقيقة) ÷ 1000',
              VALUE_SOURCE_LABEL_AR.rule_requirement,
            ],
          ],
        },
        { kind: 'h2', text: 'مجموعة مضخات الحريق الثلاثية (مدخلات تصميمية)' },
        {
          kind: 'p',
          text: 'المجموعة قياسية ثلاثية: كهرباء + ديزل + جوكي. نوع الاعتماد UL أو non UL فقط. القيم Design Input وليست اعتماداً تلقائياً وتحتاج مطابقة مع الحسابات الهيدروليكية المعتمدة.',
        },
        {
          kind: 'table',
          headers: ['البند', 'القيمة المدخلة', 'المصدر'],
          rows: [
            ['هل توجد مجموعة مضخات؟', yesNoLabel(design.pump.exists), VALUE_SOURCE_LABEL_AR[design.pump.source]],
            [
              'نوع المضخة (الاعتماد)',
              formatDisplayOrNotEntered(design.pump.type),
              VALUE_SOURCE_LABEL_AR[design.pump.source],
            ],
            [
              'سعة مضخة الكهرباء',
              formatMeasured(design.pump.capacity),
              VALUE_SOURCE_LABEL_AR[design.pump.capacity.source],
            ],
            [
              'ضغط مضخة الكهرباء',
              formatMeasured(design.pump.pressure),
              VALUE_SOURCE_LABEL_AR[design.pump.pressure.source],
            ],
            [
              'التدفق المقنن للمضخة الكهربائية',
              formatMeasured(design.pump.rated_flow),
              VALUE_SOURCE_LABEL_AR[design.pump.rated_flow.source],
            ],
            [
              'ضغط التشغيل المطلوب',
              formatMeasured(design.pump.rated_pressure),
              VALUE_SOURCE_LABEL_AR[design.pump.rated_pressure.source],
            ],
            [
              'سعة مضخة الديزل',
              formatMeasured(design.diesel_pump.capacity),
              VALUE_SOURCE_LABEL_AR[design.diesel_pump.capacity.source],
            ],
            [
              'ضغط مضخة الديزل',
              formatMeasured(design.diesel_pump.pressure),
              VALUE_SOURCE_LABEL_AR[design.diesel_pump.pressure.source],
            ],
            [
              'مضخة الجوكي',
              yesNoLabel(design.jockey_pump.exists),
              VALUE_SOURCE_LABEL_AR[design.jockey_pump.source],
            ],
            [
              'سعة الجوكي',
              formatMeasured(design.jockey_pump.capacity),
              VALUE_SOURCE_LABEL_AR[design.jockey_pump.capacity.source],
            ],
            [
              'ضغط الجوكي',
              formatMeasured(design.jockey_pump.pressure),
              VALUE_SOURCE_LABEL_AR[design.jockey_pump.pressure.source],
            ],
          ],
        },
        { kind: 'h3', text: 'النتيجة الهندسية — حجم الخزان (اشتراطات الدفاع المدني)' },
        {
          kind: 'table',
          headers: ['البند', 'القيمة'],
          rows: [
            [
              'المعادلة',
              design.water_tank.formula_ar ||
                'V (م³) = Q (لتر/دقيقة) × T (دقيقة) ÷ 1000',
            ],
            [
              'الحجم النظري المطلوب V = Q × T / 1000',
              design.water_tank.calculated_required_volume_m3 != null
                ? `${design.water_tank.calculated_required_volume_m3} m³`
                : NOT_ENTERED_AR,
            ],
            [
              'سعة الخزان المعتمدة في التقرير',
              formatMeasured(design.water_tank.capacity_m3),
            ],
            ['الحالة', tankCheck.label_ar],
          ],
        },
        {
          kind: 'note',
          text: 'الحساب تلقائي وفق معادلة الدفاع المدني V=Q×T/1000 وهو Preliminary Engineering Check وليس اعتماداً نهائياً لـ NFPA إلى أن يُربط بالحساب الهيدروليكي المعتمد.',
        },
      ],
    },
    {
      id: 'suppression',
      number: 7,
      title: 'أنظمة مكافحة الحريق',
      blocks: [
        { kind: 'h2', text: 'نظام الرش الآلي' },
        {
          kind: 'table',
          headers: ['البند', 'القيمة'],
          rows: [
            ['نظام الرش وفق بيانات المخطط', formatDisplayOrNotEntered(engineeringData?.building_plan?.sprinkler_system)],
            ['إجمالي عدد المرشات حسب المساحات', sourceFieldDisplay(reportSource.aggregates.total_sprinklers)],
            ['هل النظام مطلوب؟', yesNoLabel(design.sprinkler.required)],
            ['نوع النظام', formatDisplayOrNotEntered(design.sprinkler.system_type)],
            ['عدد المناطق', formatDisplayOrNotEntered(design.sprinkler.zones_count)],
            ['نوع الرشاش', formatDisplayOrNotEntered(design.sprinkler.sprinkler_type)],
            ['K-Factor', formatDisplayOrNotEntered(design.sprinkler.k_factor)],
            ['الضغط التصميمي', formatDisplayOrNotEntered(design.sprinkler.design_pressure)],
            ['التدفق التصميمي', formatDisplayOrNotEntered(design.sprinkler.design_flow)],
          ],
        },
        { kind: 'h2', text: 'Standpipe / Hose Reel' },
        {
          kind: 'p',
          text: `مصدر موروث/قراءة فقط — ${yesNoLabel(design.standpipe.required)} — ${formatDisplayOrNotEntered(design.standpipe.notes)}`,
        },
        { kind: 'h2', text: 'الطفايات' },
        design.extinguishers.length
          ? {
              kind: 'table' as const,
              headers: ['نوع الطفاية', 'العدد', 'الموقع', 'القدرة'],
              rows: design.extinguishers.map((e) => [
                formatDisplayOrNotEntered(manualExtinguisherTypeLabel(e.type)),
                formatDisplayOrNotEntered(e.count),
                formatDisplayOrNotEntered(e.location),
                formatDisplayOrNotEntered(e.rating),
              ]),
            }
          : {
              kind: 'note' as const,
              text: 'لم يتم إدخال بيانات الطفايات — تُستكمل وفق NFPA 10 ضمن المخططات.',
            },
      ],
    },
    {
      id: 'alarm',
      number: 8,
      title: 'نظام الإنذار',
      blocks: [
        { kind: 'h2', text: 'نظام الكشف والإنذار' },
        {
          kind: 'p',
          text: 'لا تُطبع صورة لكل عنصر هنا؛ الصور في قسم المرفقات عند الحاجة.',
        },
        {
          kind: 'table',
          headers: ['العنصر', 'البيان'],
          rows: [
            ['نظام الإنذار وفق بيانات المخطط', formatDisplayOrNotEntered(engineeringData?.building_plan?.fire_alarm_system)],
            ['لوحة التحكم', formatDisplayOrNotEntered(design.fire_alarm.control_panel)],
            ['عدد لوحات الإنذار', sourceFieldDisplay(reportSource.aggregates.total_fire_alarm_panels)],
            ['كواشف الدخان', sourceFieldDisplay(reportSource.aggregates.total_smoke_detectors)],
            ['كواشف الحرارة', sourceFieldDisplay(reportSource.aggregates.total_heat_detectors)],
            ['نقاط النداء اليدوي', formatDisplayOrNotEntered(design.fire_alarm.manual_call_points)],
            ['أجراس الإنذار / أجهزة التنبيه', sourceFieldDisplay(reportSource.aggregates.total_alarm_bells)],
            ['مواقع لوحات الإنذار', alarmPanelLocations.join('، ') || NOT_ENTERED_AR],
            ['الإنذار الصوتي', formatDisplayOrNotEntered(design.fire_alarm.voice_alarm)],
            ['الربط مع الأنظمة الأخرى', formatDisplayOrNotEntered(design.fire_alarm.integration)],
          ],
        },
        ...(design.fire_alarm.notes?.trim()
          ? [{ kind: 'p' as const, text: design.fire_alarm.notes.trim() }]
          : []),
        ...selectedNotes(report.alarm_items).map((text) => ({ kind: 'p' as const, text })),
      ],
    },
    {
      id: 'supporting',
      number: 9,
      title: 'أنظمة السلامة المساندة',
      blocks: [
        { kind: 'h2', text: 'أنظمة السلامة المساندة' },
        {
          kind: 'table',
          headers: ['العنصر', 'الحالة / الكمية', 'الملاحظة', 'التوصية'],
          rows: [
            ['إنارة الطوارئ — الكمية حسب المساحات', sourceFieldDisplay(reportSource.aggregates.total_emergency_lights), 'توزيع حسب الدور والمساحة من مركز التصاميم', '—'],
            ['لوحات مخارج الطوارئ — الكمية حسب المساحات', sourceFieldDisplay(reportSource.aggregates.total_signs), 'توزيع حسب الدور والمساحة من مركز التصاميم', '—'],
            ['التأريض', formatDisplayOrNotEntered(engineeringData?.building_plan?.electrical_grounding), 'بيانات المخطط', '—'],
            ['مانع الصواعق', formatDisplayOrNotEntered(engineeringData?.building_plan?.lightning_protection), 'بيانات المخطط', '—'],
            ['المولد الاحتياطي', formatDisplayOrNotEntered(engineeringData?.building_plan?.backup_generator), 'بيانات المخطط', '—'],
            ...((
            [
              ['إنارة الطوارئ — الحالة الفنية', design.supporting_systems.emergency_lighting],
              ['لوحات مخارج الطوارئ', design.supporting_systems.exit_signs],
              ['التحكم بالدخان', design.supporting_systems.smoke_control],
              ['التهوية', design.supporting_systems.ventilation],
              ['السلامة الكهربائية', design.supporting_systems.electrical_safety],
              ['مصدر الطاقة الاحتياطية', design.supporting_systems.emergency_power],
            ] as const
          ).map(([label, s]) => [
            label,
            supportingStatusLabel(s.status),
            s.note?.trim() || '—',
            s.recommendation?.trim() || '—',
          ])),
          ],
        },
        ...ventilationNotes.map((text) => ({ kind: 'p' as const, text })),
        ...(report.overview_text?.trim() ? [{ kind: 'p' as const, text: report.overview_text.trim() }] : []),
      ],
    },
    {
      id: 'review',
      number: 10,
      title: 'مراجعة المتطلبات والتوصيات',
      blocks: [
        { kind: 'h2', text: 'جدول المراجعة' },
        {
          kind: 'table',
          headers: ['البند', 'الحالة', 'الملاحظة', 'الإجراء المطلوب'],
          rows: (design.review_rows.length
            ? design.review_rows
            : buildDefaultReviewRows(design)
          ).map((r) => [r.item, r.status, r.note || '—', r.action || '—']),
        },
      ],
    },
    {
      id: 'summary',
      number: 11,
      title: 'الملخص والخلاصة',
      blocks: [
        { kind: 'h2', text: 'ملخص الدراسة' },
        {
          kind: 'p',
          text:
            design.summary_text?.trim() || report.overview_text?.trim() ||
            `خلصت الدراسة إلى تحديد المدخلات التصميمية الأساسية لأنظمة السلامة في المبنى الإداري تحت الإنشاء، بما في ذلك مضخة الحريق وخزان مياه الإطفاء، مع التأكيد على ضرورة مطابقتها بالحسابات الهيدروليكية والمخططات التنفيذية المعتمدة قبل التنفيذ.`,
        },
        { kind: 'h2', text: 'أهم التوصيات' },
        {
          kind: 'ol',
          items: (design.recommendations.length
            ? design.recommendations
            : [
                'استكمال مخططات المخارج ومسالك الهروب واعتمادها قبل التنفيذ.',
                'مطابقة سعة وضغط مضخة الحريق المدخلة مع الحسابات الهيدروليكية المعتمدة.',
                'مراجعة سعة خزان الإطفاء مقابل الطلب المائي ومدة التشغيل التصميمية.',
                'استكمال تصميم نظام الرش والإنذار وفق الأكواد المعتمدة للمشروع.',
                'توفير متطلبات وصول آليات الدفاع المدني ضمن المخطط التنفيذي.',
              ]
          ).slice(0, 8),
        },
        { kind: 'h2', text: 'حدود الدراسة' },
        {
          kind: 'p',
          text:
            design.study_limits_text?.trim() ||
            `أُعد هذا التقرير استناداً إلى البيانات والمخططات المتاحة وقت إعداد الدراسة. وتتم مراجعة التنفيذ الفعلي أثناء مراحل الإشراف والتفتيش. ولا تُعتبر القيم المدخلة في هذه الدراسة اعتماداً نهائياً ما لم تكن مدعومة بالحسابات والمخططات التنفيذية المعتمدة.`,
        },
      ],
    },
  ];

  // Renumber chapters 1..n for TOC (cover is separate page 1 in print)
  const toc = CORE_TOC;

  return {
    template_id: 'admin_uc',
    title_ar: 'التقرير الفني — دراسة هندسية لأنظمة السلامة والوقاية من الحريق — المبنى الإداري تحت الإنشاء',
    project_name: projectName,
    owner_name: owner,
    location,
    report_number: report.outgoing_number || NOT_AVAILABLE_AR,
    report_date: report.report_date || new Date().toISOString().slice(0, 10),
    consultant: brand,
    building_type_label: 'مبنى إداري',
    project_status_label: 'تحت الإنشاء',
    lifecycle_mode: lifecycle,
    design,
    toc,
    chapters,
    attachments: collectAttachments(design, engineeringData),
    acceptance: {
      pump_capacity: formatMeasured(design.pump.capacity),
      pump_pressure: formatMeasured(design.pump.pressure),
      tank_capacity: formatMeasured(design.water_tank.capacity_m3),
      water_demand: formatMeasured(design.water_tank.water_demand_lpm),
      duration: formatMeasured(design.water_tank.duration_min),
      theoretical_volume:
        design.water_tank.calculated_required_volume_m3 != null
          ? `${design.water_tank.calculated_required_volume_m3} m³`
          : NOT_ENTERED_AR,
      tank_check_label: tankCheck.label_ar,
    },
  };
}
