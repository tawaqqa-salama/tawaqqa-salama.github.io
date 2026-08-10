import { ENGINEERING_STUDY_SECTIONS } from '@/lib/projects/engineering-report-engine/sections';
import {
  type EngineeringReportContext,
  collectSectionPhotos,
  getItemNarrative,
  lockedRuleValue,
  ruleReason,
} from '@/lib/projects/engineering-report-engine/context';
import type {
  EngineeringStudyDocument,
  EngineeringStudyImage,
  EngineeringStudyParagraph,
  EngineeringStudySection,
  EngineeringStudySectionId,
  ReportLocale,
} from '@/lib/projects/engineering-report-engine/types';
import {
  MISSING_SECTION_AR,
  MISSING_SECTION_EN,
} from '@/lib/projects/engineering-report-engine/types';
import { TECH_REPORT_GENERAL_RECOMMENDATIONS } from '@/lib/constants/technical-report';
import { buildEngineeringReportContext } from '@/lib/projects/engineering-report-engine/context';
import type { ClientRecord } from '@/lib/types/client';
import type { ProjectEngineeringData, TechnicalReport } from '@/lib/types/project-reports';

function missing(locale: ReportLocale): EngineeringStudyParagraph {
  return {
    text: locale === 'ar' ? MISSING_SECTION_AR : MISSING_SECTION_EN,
    citations: [],
    incomplete: true,
  };
}

function p(
  text: string,
  citations: string[],
  allowed: Set<string>
): EngineeringStudyParagraph {
  const valid = citations.filter((c) => {
    if (allowed.has(c)) return true;
    // allow partial match e.g. "NFPA 13" when set has "NFPA"
    for (const a of allowed) {
      if (c.includes(a) || a.includes(c)) return true;
    }
    return false;
  });
  return { text, citations: valid };
}

function fmtArea(n: number | null, locale: ReportLocale): string {
  if (n == null) return locale === 'ar' ? 'غير محددة' : 'not specified';
  return locale === 'ar' ? `${n} م²` : `${n} m²`;
}

function fmtNum(n: number | null, locale: ReportLocale, unitAr: string, unitEn: string): string {
  if (n == null) return locale === 'ar' ? 'غير محدد' : 'not specified';
  return locale === 'ar' ? `${n} ${unitAr}` : `${n} ${unitEn}`;
}

function displayVal(v: string | string[] | null | undefined, locale: ReportLocale): string {
  if (v == null || v === '') return locale === 'ar' ? 'غير محدد' : 'not specified';
  if (Array.isArray(v)) return v.join(locale === 'ar' ? '، ' : ', ');
  return String(v);
}

type Gen = (ctx: EngineeringReportContext) => Omit<EngineeringStudySection, 'id' | 'number' | 'title_ar' | 'title_en'>;

const generators: Partial<Record<EngineeringStudySectionId, Gen>> = {
  introduction: (ctx) => {
    const { locale, facility, activityLabel, areaM2, floors } = ctx;
    if (!facility.business_name) return { paragraphs: [missing(locale)] };
    const text =
      locale === 'ar'
        ? `أُعدّت هذه الدراسة الهندسية بوصفها تقريراً فنياً استشارياً لأنظمة السلامة والوقاية من الحريق لمنشأة «${facility.business_name}» ذات النشاط (${activityLabel || 'غير مصنّف'}). تهدف الدراسة إلى توثيق خصائص المشروع، وتصنيف الإشغال والخطورة، ومراجعة أنظمة الحماية النشطة والسلبية، وربط الاستنتاجات بمراجع كود البناء السعودي (SBC) وكود الحريق السعودي ومتطلبات الدفاع المدني والمعايير ذات الصلة من سلسلة NFPA، وذلك بعد التحقق عبر محرك القواعد الهندسية دون افتراض قيم غير موثّقة.`
        : `This engineering study is prepared as a formal consultancy technical report on fire protection and life-safety systems for the facility “${facility.business_name}” (activity: ${activityLabel || 'unclassified'}). It documents project characteristics, occupancy and hazard classification, active and passive protection systems, and conclusions referenced to the Saudi Building Code (SBC), Saudi Fire Code, Civil Defense requirements, and applicable NFPA standards — only after validation through the Engineering Rules Engine, without inventing undocumented values.`;
    const areaNote =
      areaM2 || floors
        ? locale === 'ar'
          ? ` تعتمد الدراسة على المساحة الإجمالية للمبنى ${fmtArea(areaM2, locale)} وعدد الأدوار ${fmtNum(floors, locale, 'دور', 'floors')} حيث توفرت هذه البيانات في ملف المشروع.`
          : ` The study uses a building area of ${fmtArea(areaM2, locale)} and ${fmtNum(floors, locale, 'دور', 'floors')} where recorded in the project file.`
        : '';
    return {
      paragraphs: [
        p(text + areaNote, ['SBC 801', 'Saudi Fire Code', 'Civil Defense', 'NFPA'], ctx.allowedCitations),
      ],
    };
  },

  project_description: (ctx) => {
    const { locale, facility, report, activityLabel } = ctx;
    if (!facility.business_name) return { paragraphs: [missing(locale)] };
    const overview = report.overview_text?.trim();
    const text =
      locale === 'ar'
        ? `يقع المشروع ضمن نطاق خدمات المكتب الاستشاري لتقييم واعتماد أنظمة السلامة. اسم المنشأة: ${facility.business_name}. النشاط التشغيلي المسجّل: ${activityLabel || 'يلزم استكماله'}. الحالة الإنشائية/التشغيلية: ${report.building_status || 'غير محددة'}. ${overview || 'يُوصى باستكمال نص نظرة عامة معتمدة من المهندس المسؤول عند توفرها.'}`
        : `The project falls within the consultancy scope for evaluating and documenting fire-safety systems. Facility: ${facility.business_name}. Recorded activity: ${activityLabel || 'to be completed'}. Construction/operating status: ${report.building_status || 'not specified'}. ${overview || 'A signed engineer overview narrative should be completed when available.'}`;
    return {
      paragraphs: [p(text, ['SBC 801', 'Company Standards'], ctx.allowedCitations)],
    };
  },

  owner_information: (ctx) => {
    const { locale, facility, client } = ctx;
    if (!facility.owner_name && !client.name) return { paragraphs: [missing(locale)] };
    const text =
      locale === 'ar'
        ? `المالك / صاحب الصلاحية المسجّل في ملف المشروع: ${facility.owner_name || client.name || '—'}. يُعتمد هذا البيان لأغراض المخاطبات الرسمية مع الدفاع المدني والجهات ذات العلاقة، ولا يُستبدل ببيانات غير موثّقة في النظام.`
        : `Owner / authorized party recorded in the project file: ${facility.owner_name || client.name || '—'}. This statement is used for official correspondence with Civil Defense and related authorities and is not replaced by undocumented data.`;
    return { paragraphs: [p(text, ['Civil Defense'], ctx.allowedCitations)] };
  },

  building_information: (ctx) => {
    const { locale, facility, areaM2, floors, heightM, buildingPlan, buildingClassification } = ctx;
    if (!facility.business_name || (!areaM2 && !floors)) {
      return { paragraphs: [missing(locale)] };
    }
    const text =
      locale === 'ar'
        ? `تتكون المنشأة من مبنى بمساحة تقريبية ${fmtArea(areaM2, locale)}، وعدد أدوار ${fmtNum(floors, locale, 'دور', 'floors')}${
            heightM != null ? `، وارتفاع مسجّل ${fmtNum(heightM, locale, 'م', 'm')}` : ''
          }. التصنيف الإنشائي/الإشغالي المعتمد في الدراسة: ${buildingClassification || 'قيد الاستكمال'}. وصف الأدوار: ${
            ctx.report.floors_description || buildingPlan?.floors_description || 'يلزم استكمال وصف الأدوار.'
          }. مبنى مرتفع: ${buildingPlan?.high_rise_building || 'غير محدد'}؛ سرداب: ${buildingPlan?.underground_building || 'غير محدد'}.`
        : `The facility comprises approximately ${fmtArea(areaM2, locale)} with ${fmtNum(floors, locale, 'دور', 'floors')}${
            heightM != null ? ` and a recorded height of ${fmtNum(heightM, locale, 'م', 'm')}` : ''
          }. Occupancy/building classification used in this study: ${buildingClassification || 'pending'}. Floor description: ${
            ctx.report.floors_description || buildingPlan?.floors_description || 'Floor description must be completed.'
          }. High-rise flag: ${buildingPlan?.high_rise_building || 'n/a'}; underground: ${buildingPlan?.underground_building || 'n/a'}.`;
    return {
      paragraphs: [p(text, ['SBC 801', 'SBC 201'], ctx.allowedCitations)],
      tables: [
        {
          caption_ar: 'ملخص بيانات المبنى',
          caption_en: 'Building data summary',
          headers_ar: ['البند', 'القيمة'],
          headers_en: ['Item', 'Value'],
          rows: [
            [locale === 'ar' ? 'المساحة' : 'Area', fmtArea(areaM2, locale)],
            [locale === 'ar' ? 'الأدوار' : 'Floors', fmtNum(floors, locale, 'دور', 'floors')],
            [locale === 'ar' ? 'الارتفاع' : 'Height', fmtNum(heightM, locale, 'م', 'm')],
            [
              locale === 'ar' ? 'التصنيف' : 'Classification',
              buildingClassification || (locale === 'ar' ? '—' : '—'),
            ],
          ],
        },
      ],
    };
  },

  site_information: (ctx) => {
    const { locale, facility, report } = ctx;
    const loc = report.location_description || facility.location_summary;
    const lat = (report.gps_lat || '').trim();
    const lng = (report.gps_lng || '').trim();
    const coords =
      lat && lng
        ? locale === 'ar'
          ? `${lat} ، ${lng}`
          : `${lat}, ${lng}`
        : locale === 'ar'
          ? 'غير محددة'
          : 'not specified';

    if (!loc && !facility.city && !lat && !lng && !report.earth_photo?.dataUrl) {
      return { paragraphs: [missing(locale)] };
    }

    const text =
      locale === 'ar'
        ? `الموقع الجغرافي للمنشأة: ${loc || '—'}. تُعرض أدناه صورة الموقع من الخريطة (Google Earth / صورة القمر الصناعي إن وُجدت) مع بيانات العنوان والإحداثيات لاستخدامها في مسارات وصول آليات الإطفاء ومتطلبات الدفاع المدني.`
        : `Facility location: ${loc || '—'}. The site map / satellite image (when attached) and address/coordinates below support fire-appliance access routing and Civil Defense site requirements.`;

    const images: EngineeringStudyImage[] = [];
    if (report.earth_photo?.dataUrl) {
      images.push({
        src: report.earth_photo.dataUrl,
        caption_ar: report.earth_photo.caption || 'صورة الموقع من الخريطة (Google Earth)',
        caption_en: report.earth_photo.caption || 'Site map / Google Earth image',
      });
    }
    if (report.site_photo?.dataUrl) {
      images.push({
        src: report.site_photo.dataUrl,
        caption_ar: report.site_photo.caption || 'صورة عامة من الموقع',
        caption_en: report.site_photo.caption || 'General site photograph',
      });
    }

    const missingMapNote =
      !report.earth_photo?.dataUrl
        ? [
            p(
              locale === 'ar'
                ? 'تنبيه: لم تُرفق صورة الموقع من الخريطة في ملف التقرير — يُستكمل الرفع من قسم «صور الزيارة / الموقع» قبل الإصدار النهائي.'
                : 'Note: No site map image is attached on the technical report — upload it under Visit / Site Photos before final issue.',
              [],
              ctx.allowedCitations
            ),
          ]
        : [];

    return {
      paragraphs: [
        p(text, ['Civil Defense', 'SBC 801'], ctx.allowedCitations),
        ...missingMapNote,
      ],
      images,
      tables: [
        {
          caption_ar: 'بيانات الموقع والإحداثيات',
          caption_en: 'Site location & coordinates',
          headers_ar: ['البند', 'القيمة'],
          headers_en: ['Item', 'Value'],
          rows: [
            [locale === 'ar' ? 'وصف الموقع' : 'Location description', loc || '—'],
            [locale === 'ar' ? 'المدينة' : 'City', facility.city || '—'],
            [locale === 'ar' ? 'الحي' : 'District', facility.district || '—'],
            [locale === 'ar' ? 'المنطقة' : 'Region', facility.region || '—'],
            [locale === 'ar' ? 'الشارع' : 'Street', facility.street || '—'],
            [locale === 'ar' ? 'رقم القطعة' : 'Plot number', facility.plot_number || '—'],
            [locale === 'ar' ? 'العنوان الوطني' : 'National address', facility.national_address || '—'],
            [locale === 'ar' ? 'خط العرض (Latitude)' : 'Latitude', lat || (locale === 'ar' ? '—' : '—')],
            [locale === 'ar' ? 'خط الطول (Longitude)' : 'Longitude', lng || (locale === 'ar' ? '—' : '—')],
            [locale === 'ar' ? 'الإحداثيات' : 'Coordinates', coords],
          ],
        },
      ],
    };
  },

  applicable_codes: (ctx) => {
    const { locale, applicableCodes, rulesForm } = ctx;
    const locked = lockedRuleValue(ctx, 'applicable_codes');
    const list = locked
      ? displayVal(locked, locale)
      : applicableCodes.join(locale === 'ar' ? '، ' : ', ');
    if (!list || list === (locale === 'ar' ? 'غير محدد' : 'not specified')) {
      return { paragraphs: [missing(locale)] };
    }
    const reason = ruleReason(ctx, 'applicable_codes');
    const text =
      locale === 'ar'
        ? `المراجع الكودية المعتمدة لهذه الدراسة — وفق محرك القواعد الهندسية وقاعدة المعرفة — تشمل: ${list}. لا تُدرَج أي مرجع غير متاح في قاعدة المعرفة أو غير ناتج عن القواعد. ${reason ? `مسوّغ القواعد: ${reason}` : ''} يُعامل كود البناء السعودي وكود الحريق السعودي ومتطلبات الدفاع المدني كإطار إلزامي محلي، مع الاسترشاد بمعايير NFPA ذات الصلة (مثل NFPA 13 وNFPA 72 وNFPA 20 وNFPA 101) عند انطباقها على الأنظمة المحددة.`
        : `Code references adopted for this study — per the Engineering Rules Engine and Knowledge Base — include: ${list}. No reference outside the Knowledge Base or rules cascade is introduced. ${reason ? `Rules rationale: ${reason}` : ''} The Saudi Building Code, Saudi Fire Code, and Civil Defense requirements form the mandatory local framework, with applicable NFPA standards (e.g. NFPA 13, NFPA 72, NFPA 20, NFPA 101) cited only where they apply to the selected systems.`;
    const citations = applicableCodes.filter((c) =>
      [...ctx.allowedCitations].some((a) => c.includes(a) || a.includes(c))
    );
    void rulesForm;
    return {
      paragraphs: [p(text, citations.length ? citations : ['SBC 801', 'NFPA', 'Civil Defense'], ctx.allowedCitations)],
    };
  },

  occupancy_classification: (ctx) => {
    const { locale, occupancyLabel, selection, activityLabel } = ctx;
    const occ = selection.occupancy || occupancyLabel;
    if (!occ) return { paragraphs: [missing(locale)] };
    const reason = ruleReason(ctx, 'occupancy');
    const text =
      locale === 'ar'
        ? `تصنيف الإشغال المعتمد للدراسة: ${displayVal(occ, locale)}. النشاط التشغيلي المرتبط: ${activityLabel || '—'}. ${
            reason || 'يُشتق التصنيف من نوع المبنى والنشاط وفق SBC 801 دون اجتهاد خارج محرك القواعد.'
          } أي تغيير في النشاط التشغيلي يستوجب إعادة تقييم التصنيف وجميع الأنظمة التابعة.`
        : `Occupancy classification adopted for this study: ${displayVal(occ, locale)}. Linked activity: ${activityLabel || '—'}. ${
            reason || 'Classification is derived from building type and activity per SBC 801 via the Rules Engine only.'
          } Any change in operational use requires re-evaluation of occupancy and all dependent systems.`;
    return { paragraphs: [p(text, ['SBC 801', 'SBC Occupancy', 'occupancy'], ctx.allowedCitations)] };
  },

  hazard_classification: (ctx) => {
    const { locale, hazardLabel, selection } = ctx;
    const risk = selection.risk_classification || hazardLabel;
    if (!risk) return { paragraphs: [missing(locale)] };
    const reason = ruleReason(ctx, 'risk_classification');
    const text =
      locale === 'ar'
        ? `تصنيف الخطورة المعتمد: ${displayVal(risk, locale)}. ${
            reason || 'يُحدَّد مستوى الخطورة من قواعد الإشغال والنشاط وفق SBC/NFPA دون تقدير حر.'
          } يرتبط هذا التصنيف مباشرة بكثافة المرشات، ومتطلبات المضخات والخزانات، وفئة الإنذار.`
        : `Hazard classification adopted: ${displayVal(risk, locale)}. ${
            reason || 'Hazard level is set from occupancy/activity rules under SBC/NFPA without free estimation.'
          } This classification drives sprinkler density, pump/tank requirements, and alarm category.`;
    return { paragraphs: [p(text, ['SBC 801', 'NFPA 13', 'risk'], ctx.allowedCitations)] };
  },

  means_of_egress: (ctx) => {
    const { locale, egressRows, egressTotal, buildingPlan } = ctx;
    if (!egressRows.length && !buildingPlan?.exits_count) {
      return { paragraphs: [missing(locale)] };
    }
    const text =
      locale === 'ar'
        ? `أُجريت دراسة مسالك الهروب استناداً إلى مناطق الإشغال المسجّلة في التقرير الفني. إجمالي الشاغلين التقريبي المحسوب: ${egressTotal || 'غير مكتمل'}. عدد المخارج المسجّل في مخطط المبنى: ${buildingPlan?.exits_count || 'غير محدد'}؛ السلالم: ${buildingPlan?.stairs_count || '—'}. تُراجع مسافات السفر وعرض المخارج وفق SBC ومتطلبات NFPA 101، ولا تُفترض قيم حمل شاغلين غير مستندة إلى المساحات المسجّلة.`
        : `Means of egress were reviewed from occupancy zones recorded in the technical report. Approximate calculated occupant load: ${egressTotal || 'incomplete'}. Exits recorded on the building plan: ${buildingPlan?.exits_count || 'not specified'}; stairs: ${buildingPlan?.stairs_count || '—'}. Travel distance and exit width are checked against SBC and NFPA 101; occupant-load factors are not invented beyond recorded areas.`;
    return {
      paragraphs: [p(text, ['SBC 801', 'SBC 201', 'NFPA 101', 'egress'], ctx.allowedCitations)],
      tables: egressRows.length
        ? [
            {
              caption_ar: 'جدول حصر الشاغلين ومسالك الهروب',
              caption_en: 'Occupant load & egress table',
              headers_ar: ['الدور', 'المنطقة', 'التصنيف', 'المساحة', 'الشاغلون', 'مخارج مطلوبة'],
              headers_en: ['Floor', 'Zone', 'Class', 'Area', 'Occupants', 'Exits req.'],
              rows: egressRows.map((r) => [
                r.floor_name,
                r.zone_label,
                r.occupancy_label,
                r.area_m2 != null ? String(r.area_m2) : '—',
                r.occupants != null ? String(r.occupants) : '—',
                r.required_exits != null ? String(r.required_exits) : '—',
              ]),
            },
          ]
        : undefined,
    };
  },

  fire_truck_access: (ctx) => {
    const { locale } = ctx;
    const notes = getItemNarrative(ctx, 'ff_cd_parking');
    if (!notes && !ctx.facility.street && !ctx.facility.city) {
      return { paragraphs: [missing(locale)] };
    }
    const text =
      locale === 'ar'
        ? `يُشترط تأمين مسار وموقف لآليات الدفاع المدني أمام المنشأة مع إبقائه خالياً من العوائق ولوحات منع الوقوف حسب متطلبات الدفاع المدني. ${notes || 'يلزم استكمال توثيق موقف آليات الإطفاء ووصلة الدفاع المدني في بنود مكافحة الحريق.'} الموقع المسجّل: ${ctx.facility.location_summary || '—'}.`
        : `A clear fire-appliance access route and Civil Defense parking bay shall be maintained free of obstructions with no-parking signage per Civil Defense requirements. ${notes || 'Fire-truck parking and Civil Defense connection details must be completed in the firefighting items.'} Recorded site: ${ctx.facility.location_summary || '—'}.`;
    return { paragraphs: [p(text, ['Civil Defense', 'SBC 801'], ctx.allowedCitations)] };
  },

  fire_water_supply: (ctx) => {
    const { locale, systems } = ctx;
    const tank = lockedRuleValue(ctx, 'tank_size');
    const demand = lockedRuleValue(ctx, 'water_demand');
    const notes = getItemNarrative(ctx, 'ff_water');
    if (!systems.water && !tank && !notes) return { paragraphs: [missing(locale)] };
    const text =
      locale === 'ar'
        ? `إمداد مياه الإطفاء يُحدَّد من محرك القواعد والحسابات الهيدروليكية المعتمدة للمشروع، وليس من تقديرات حرة. سعة الخزان وفق القواعد: ${displayVal(tank, locale)}. الطلب المائي المسجّل: ${displayVal(demand, locale)}. ${notes || ''} في حال غياب ورقة الحساب الهيدروليكي المعتمدة، يُشار إلى Incomplete ولا تُختلق قيم L/min أو m³.`
        : `Fire water supply is taken from the Rules Engine and approved hydraulic calculations only — not free estimates. Rule-locked tank size: ${displayVal(tank, locale)}. Recorded water demand: ${displayVal(demand, locale)}. ${notes || ''} Where an approved hydraulic sheet is absent, the section is marked incomplete; L/min or m³ values are not invented.`;
    const incomplete = !tank && !demand;
    return {
      paragraphs: [
        incomplete && !notes
          ? missing(locale)
          : p(text, ['NFPA 22', 'NFPA 13', 'SBC 801', 'Civil Defense'], ctx.allowedCitations),
      ],
    };
  },

  fire_pump_analysis: (ctx) => {
    const { locale, systems } = ctx;
    const pump = lockedRuleValue(ctx, 'pump_requirement');
    const capacity = lockedRuleValue(ctx, 'pump_capacity');
    const notes = getItemNarrative(ctx, 'ff_pumps');
    if (!systems.pumps && !pump && !notes) return { paragraphs: [missing(locale)] };
    const reason = ruleReason(ctx, 'pump_requirement');
    const text =
      locale === 'ar'
        ? `تحليل مضخات الحريق يستند إلى القيم المقفلة/المعتمدة في محرك القواعد (NFPA 20 / SBC). متطلب المضخة: ${displayVal(pump, locale)}. السعة المسجّلة: ${displayVal(capacity, locale)}. ${reason} ${notes || 'يُستكمل جدول المضخة الرئيسية والجوكي وربطها بلوحة الإنذار عند اعتماد الحساب الهيدروليكي.'}`
        : `Fire pump analysis uses rule-locked values under NFPA 20 / SBC. Pump requirement: ${displayVal(pump, locale)}. Recorded capacity: ${displayVal(capacity, locale)}. ${reason} ${notes || 'Main/jockey pump schedule and alarm interface shall be completed once hydraulics are approved.'}`;
    return {
      paragraphs: [
        !pump && !notes ? missing(locale) : p(text, ['NFPA 20', 'SBC 801', 'Civil Defense'], ctx.allowedCitations),
      ],
    };
  },

  water_tank_analysis: (ctx) => {
    const { locale, systems } = ctx;
    const tank = lockedRuleValue(ctx, 'tank_size');
    const notes = getItemNarrative(ctx, 'ff_water');
    if (!systems.water && !tank && !notes) return { paragraphs: [missing(locale)] };
    const text =
      locale === 'ar'
        ? `تحليل خزان مياه الإطفاء يعتمد السعة المقفلة بالقواعد: ${displayVal(tank, locale)}، مع الالتزام بمتطلبات التخزين ومدة التشغيل وفق NFPA 22 وكود الحريق السعودي عند انطباقها. ${notes || ''} لا تُحسب سعات بديلة خارج ورقة الحساب أو القواعد.`
        : `Fire-water tank analysis uses the rule-locked capacity: ${displayVal(tank, locale)}, consistent with storage and duration requirements under NFPA 22 and the Saudi Fire Code where applicable. ${notes || ''} Alternative capacities outside the calculation sheet or rules are not used.`;
    return {
      paragraphs: [
        !tank && !notes ? missing(locale) : p(text, ['NFPA 22', 'Saudi Fire Code', 'SBC 801'], ctx.allowedCitations),
      ],
    };
  },

  sprinkler_system: (ctx) => {
    const { locale, systems, zoneNeeds } = ctx;
    const sprType = lockedRuleValue(ctx, 'sprinkler_type');
    const density = lockedRuleValue(ctx, 'sprinkler_density');
    const notes = getItemNarrative(ctx, 'ff_piping');
    if (!systems.sprinkler && !sprType && !notes && !zoneNeeds.length) {
      return { paragraphs: [missing(locale)] };
    }
    const text =
      locale === 'ar'
        ? `دراسة نظام المرشات التلقائية: نوع النظام وفق القواعد ${displayVal(sprType, locale)}؛ كثافة التصميم المقفلة ${displayVal(density, locale)}. ${ruleReason(ctx, 'sprinkler_type')} ${notes || ''} تُراجع تغطية المناطق من جدول توزيع الأنظمة حسب الأدوار دون اختراع كثافات خارج NFPA 13 / SBC 801.`
        : `Automatic sprinkler study: rule-selected system type ${displayVal(sprType, locale)}; locked design density ${displayVal(density, locale)}. ${ruleReason(ctx, 'sprinkler_type')} ${notes || ''} Zone coverage is taken from the floor/zone systems table; densities outside NFPA 13 / SBC 801 rules are not invented.`;
    return {
      paragraphs: [p(text, ['NFPA 13', 'SBC 801', 'sprinkler'], ctx.allowedCitations)],
      tables: zoneNeeds.length
        ? [
            {
              caption_ar: 'توزيع أنظمة الإطفاء حسب المناطق',
              caption_en: 'Suppression systems by zone',
              headers_ar: ['الدور', 'المنطقة', 'النظام', 'المساحة'],
              headers_en: ['Floor', 'Zone', 'System', 'Area'],
              rows: zoneNeeds.map((n) => [
                n.floor_name,
                n.zone_label,
                n.suppression_label,
                n.area_m2 || '—',
              ]),
            },
          ]
        : undefined,
    };
  },

  hose_reel_study: (ctx) => {
    const { locale, systems } = ctx;
    const notes = getItemNarrative(ctx, 'ff_cabinets');
    if (!systems.hose && !notes) return { paragraphs: [missing(locale)] };
    const text =
      locale === 'ar'
        ? `تُوزَّع بكرات الخراطيم / صناديق الحريق وفق المخططات المعتمدة ومتطلبات الدفاع المدني وNFPA 14 عند انطباقها. ${notes || 'يلزم استكمال مواصفات الصناديق ومواقعها من المخططات.'}`
        : `Hose reels / fire cabinets are distributed per approved drawings and Civil Defense requirements, with NFPA 14 where applicable. ${notes || 'Cabinet specifications and locations must be completed from the drawings.'}`;
    return { paragraphs: [p(text, ['NFPA 14', 'Civil Defense', 'SBC 801'], ctx.allowedCitations)] };
  },

  portable_extinguishers: (ctx) => {
    const { locale, systems } = ctx;
    const notes = getItemNarrative(ctx, 'ff_extinguishers');
    if (!systems.extinguishers && !notes) return { paragraphs: [missing(locale)] };
    const text =
      locale === 'ar'
        ? `تُختار الطفايات اليدوية بما يناسب تصنيف الخطورة ونوع المواد في المناطق، مع صيانة دورية وبطاقات متابعة. ${notes || 'يلزم تحديد أنواع وكميات الطفايات من مخطط التوزيع المعتمد.'}`
        : `Portable extinguishers are selected for the zone hazard and commodity class, with periodic maintenance and inspection tags. ${notes || 'Types and quantities must be taken from the approved distribution plan.'}`;
    return { paragraphs: [p(text, ['SBC 801', 'Civil Defense', 'NFPA'], ctx.allowedCitations)] };
  },

  fire_alarm_study: (ctx) => {
    const { locale, systems } = ctx;
    const alarm = lockedRuleValue(ctx, 'alarm_category');
    const notes = getItemNarrative(ctx, 'al_panel') || getItemNarrative(ctx, 'al_detectors');
    if (!systems.alarm && !alarm && !notes) return { paragraphs: [missing(locale)] };
    const text =
      locale === 'ar'
        ? `دراسة نظام الإنذار والكشف: فئة النظام وفق محرك القواعد ${displayVal(alarm, locale)}. ${ruleReason(ctx, 'alarm_category')} ${notes || ''} يُربط النظام بمتطلبات SBC 801 وNFPA 72 دون إضافة أجهزة غير واردة في القواعد أو المخططات.`
        : `Fire alarm and detection study: rule-selected category ${displayVal(alarm, locale)}. ${ruleReason(ctx, 'alarm_category')} ${notes || ''} Devices follow SBC 801 and NFPA 72; equipment outside rules or drawings is not added.`;
    return { paragraphs: [p(text, ['NFPA 72', 'SBC 801', 'alarm'], ctx.allowedCitations)] };
  },

  voice_evacuation: (ctx) => {
    const { locale, areaM2, floors, egressTotal, selection } = ctx;
    const highOcc = (egressTotal || 0) >= 300 || (areaM2 || 0) >= 1000 || (floors || 0) >= 5;
    const isAssembly = String(selection.occupancy || '').includes('assembly');
    if (!highOcc && !isAssembly) {
      const text =
        locale === 'ar'
          ? 'بناءً على بيانات الشاغلين/المساحة المتوفرة، لم يُستدَل على إلزام فوري لنظام إخلاء صوتي متكامل ضمن هذه الدراسة. عند ارتفاع الحمل الإشغالي أو تصنيف التجمع، يُعاد تقييم المتطلب وفق SBC وNFPA 72.'
          : 'Based on available occupant/area data, a full voice-evacuation system is not automatically mandated in this study. If occupant load or assembly occupancy increases, the requirement shall be re-evaluated under SBC and NFPA 72.';
      return { paragraphs: [p(text, ['NFPA 72', 'SBC 801'], ctx.allowedCitations)] };
    }
    if (!ctx.systems.alarm) return { paragraphs: [missing(locale)] };
    const text =
      locale === 'ar'
        ? `نظراً لحجم الإشغال/المساحة، تُراجع متطلبات الإنذار الصوتي / الإخلاء الصوتي كجزء من نظام الإنذار وفق NFPA 72 وكود الحريق السعودي، مع وضوح الرسائل ومناطق النداء المرتبطة بمسالك الهروب.`
        : `Given occupancy/area scale, voice alarm / voice-evacuation provisions are reviewed as part of the fire alarm system under NFPA 72 and the Saudi Fire Code, with intelligible messaging zones coordinated to egress routes.`;
    return { paragraphs: [p(text, ['NFPA 72', 'Saudi Fire Code', 'SBC 801'], ctx.allowedCitations)] };
  },

  emergency_lighting: (ctx) => {
    const { locale } = ctx;
    const notes = getItemNarrative(ctx, 'ex_routes') || getItemNarrative(ctx, 'al_emergency_lights');
    if (!ctx.systems.exits && !notes && !ctx.buildingPlan?.exits_count) {
      return { paragraphs: [missing(locale)] };
    }
    const text =
      locale === 'ar'
        ? `الإنارة الطارئة على مسارات الهروب والمخارج جزء من متطلبات سلامة الأرواح. تُوفَّر إنارة طارئة مستقلة عن الشبكة العادية لمدة التشغيل المطلوبة وفق الكودات المعتمدة، وتُنسَّق مع لوحات المخارج. ${notes || ''}`
        : `Emergency lighting along egress paths and exits is a life-safety requirement. Illumination independent of normal power shall cover the required duration under adopted codes and be coordinated with exit signage. ${notes || ''}`;
    return { paragraphs: [p(text, ['SBC 801', 'NFPA 101', 'Civil Defense'], ctx.allowedCitations)] };
  },

  exit_signs: (ctx) => {
    const { locale, buildingPlan } = ctx;
    if (!buildingPlan?.exits_count && !ctx.systems.exits) return { paragraphs: [missing(locale)] };
    const text =
      locale === 'ar'
        ? `تُركَّب لوحات مخارج الطوارئ المضيئة عند كل مخرج معتمد وعلى المسارات المؤدية إليها، بوضوح بصري مستمر مع الإنارة الطارئة، وفق SBC ومتطلبات الدفاع المدني.`
        : `Illuminated exit signs shall be installed at each approved exit and along approach paths, remaining visible with emergency lighting, per SBC and Civil Defense requirements.`;
    return { paragraphs: [p(text, ['SBC 801', 'NFPA 101', 'Civil Defense'], ctx.allowedCitations)] };
  },

  smoke_control: (ctx) => {
    const { locale, buildingPlan, heightM, floors } = ctx;
    const needsSmoke =
      yes(buildingPlan?.atrium_exists) ||
      yes(buildingPlan?.high_rise_building) ||
      (heightM != null && heightM >= 23) ||
      (floors != null && floors >= 8);
    if (!needsSmoke) {
      const text =
        locale === 'ar'
          ? 'لم تُسجَّل في ملف المشروع خصائص (أتريوم / ارتفاع عالٍ) تفرض تلقائياً نظام تحكم دخان متخصص ضمن هذه المرحلة. عند إضافة أتريوم أو ارتفاع يستوجب التحكم بالدخان، يُستكمل القسم بحسابات معتمدة.'
          : 'No atrium/high-rise attributes in the project file currently mandate a dedicated smoke-control system at this stage. If an atrium or height trigger is added, this section shall be completed with approved calculations.';
      return { paragraphs: [p(text, ['SBC 801', 'NFPA'], ctx.allowedCitations)] };
    }
    if (!ctx.systems.ventilation) return { paragraphs: [missing(locale)] };
    const text =
      locale === 'ar'
        ? `نظراً لخصائص المبنى (ارتفاع/أتريوم)، تُراجع استراتيجية التحكم بالدخان وتهوية مسارات الهروب كجزء من الدراسة الميكانيكية، مع الالتزام بـ SBC والمراجع ذات الصلة دون افتراض معدلات هواء غير محسوبة.`
        : `Given building attributes (height/atrium), smoke-control and egress-path ventilation strategy is reviewed within the mechanical study under SBC and related references; unverified air-change rates are not assumed.`;
    return { paragraphs: [p(text, ['SBC 801', 'Saudi Fire Code'], ctx.allowedCitations)] };
  },

  mechanical_ventilation: (ctx) => {
    const { locale, systems } = ctx;
    const notes = getItemNarrative(ctx, 'vent_main');
    if (!systems.ventilation && !notes) return { paragraphs: [missing(locale)] };
    const text =
      locale === 'ar'
        ? `التهوية الميكانيكية المرتبطة بالسلامة (بما فيها تهوية غرف المضخات/الكهرباء عند لزومها) تُوثَّق وفق بنود التقرير الفني. ${notes || 'يلزم استكمال مواصفات التهوية من المخططات الميكانيكية المعتمدة.'}`
        : `Life-safety-related mechanical ventilation (including pump/electrical room ventilation where required) is documented from the technical report items. ${notes || 'Ventilation specifications must be completed from approved mechanical drawings.'}`;
    return { paragraphs: [p(text, ['SBC 801', 'Civil Defense'], ctx.allowedCitations)] };
  },

  electrical_safety: (ctx) => {
    const { locale, systems, buildingPlan } = ctx;
    if (!systems.grounding && !systems.lightning && buildingPlan?.electrical_grounding !== 'نعم' && buildingPlan?.electrical_grounding !== 'لا') {
      return { paragraphs: [missing(locale)] };
    }
    const text =
      locale === 'ar'
        ? `السلامة الكهربائية: التأريض ${buildingPlan?.electrical_grounding || 'غير محدد'}؛ الحماية من الصواعق ${buildingPlan?.lightning_protection || 'غير محدد'}. تُراجع غرف الكهرباء/المحولات لأنظمة إطفاء خاصة عند وجودها ضمن بنود الإطفاء الخاصة، وفق الكودات المعتمدة دون افتراض معدات غير واردة.`
        : `Electrical safety: grounding ${buildingPlan?.electrical_grounding || 'n/a'}; lightning protection ${buildingPlan?.lightning_protection || 'n/a'}. Electrical/transformer rooms are reviewed for special suppression where listed in firefighting special systems, using adopted codes only.`;
    return { paragraphs: [p(text, ['SBC 801', 'Civil Defense'], ctx.allowedCitations)] };
  },

  emergency_power: (ctx) => {
    const { locale, systems, buildingPlan } = ctx;
    if (buildingPlan?.backup_generator !== 'نعم' && buildingPlan?.backup_generator !== 'لا' && !systems.emergencyPower) {
      return { paragraphs: [missing(locale)] };
    }
    const text =
      locale === 'ar'
        ? `الطاقة الاحتياطية للطوارئ: مولد احتياطي مسجّل ${buildingPlan?.backup_generator || 'غير محدد'}. تُغذى أحمال السلامة الحرجة (إنارة طارئة، إنذار، مضخات عند الاعتماد الكهربائي) من مصدر طوارئ موثوق وفق متطلبات الدفاع المدني والكودات ذات الصلة.`
        : `Emergency power: backup generator recorded as ${buildingPlan?.backup_generator || 'n/a'}. Critical life-safety loads (emergency lighting, alarm, electric fire pumps where applicable) shall be served by a reliable emergency source per Civil Defense and related codes.`;
    return { paragraphs: [p(text, ['Civil Defense', 'SBC 801', 'NFPA 20'], ctx.allowedCitations)] };
  },

  civil_defense_requirements: (ctx) => {
    const { locale, report, facility } = ctx;
    const notes = [getItemNarrative(ctx, 'ff_cd_connections'), getItemNarrative(ctx, 'ff_cd_parking')]
      .filter(Boolean)
      .join(' ');
    const text =
      locale === 'ar'
        ? `متطلبات الدفاع المدني تشمل جاهزية وصلات الإطفاء، مواقف الآليات، مسارات الوصول، والتقرير/المخططات اللازمة للرفع على الجهة المختصة. فرع الدفاع المدني المشار إليه: ${report.civil_defense_branch || 'يلزم تحديده'}. المنشأة: ${facility.business_name || '—'}. ${notes || 'يُستكمل ملف التسليم للدفاع المدني من مرحلة الخطابات والمخططات في النظام.'}`
        : `Civil Defense requirements cover fire department connections, appliance parking, access routes, and the submission package of reports/drawings. Referenced Civil Defense branch: ${report.civil_defense_branch || 'to be specified'}. Facility: ${facility.business_name || '—'}. ${notes || 'The Civil Defense delivery package is completed from the system’s letters and drawings stage.'}`;
    return { paragraphs: [p(text, ['Civil Defense', 'Saudi Fire Code', 'SBC 801'], ctx.allowedCitations)] };
  },

  engineering_compliance_review: (ctx) => {
    const { locale, rulesGateOk, rulesSummaryAr, rulesSummaryEn, missingInputs, rulesForm } = ctx;
    const violations = rulesForm.violations;
    const text =
      locale === 'ar'
        ? `مراجعة الامتثال عبر محرك القرار الهندسي: ${rulesSummaryAr}. حالة البوابة: ${rulesGateOk ? 'مفتوحة (تسلسل متوافق)' : 'مغلقة / ناقصة'}. المدخلات الناقصة: ${
            missingInputs.length ? missingInputs.join('، ') : 'لا يوجد ضمن الحد الأدنى المسجّل'
          }. عدد مخالفات القواعد الظاهرة: ${violations.length}. لا تُعتمد استنتاجات هندسية تتعارض مع القيم المقفلة أو الخيارات غير المسموحة.`
        : `Compliance review via the Engineering Decision Engine: ${rulesSummaryEn}. Gate status: ${rulesGateOk ? 'open (compliant cascade)' : 'closed / incomplete'}. Missing inputs: ${
            missingInputs.length ? missingInputs.join(', ') : 'none within recorded minimum'
          }. Visible rule violations: ${violations.length}. Engineering conclusions that conflict with locked values or disallowed options are not approved.`;
    return {
      paragraphs: [p(text, ['SBC 801', 'NFPA', 'Civil Defense', 'Company Standards'], ctx.allowedCitations)],
    };
  },

  summary: (ctx) => {
    const { locale, facility, occupancyLabel, hazardLabel, systems, areaM2, floors } = ctx;
    if (!facility.business_name) return { paragraphs: [missing(locale)] };
    const sysList =
      locale === 'ar'
        ? [
            systems.sprinkler ? 'مرشات' : null,
            systems.alarm ? 'إنذار' : null,
            systems.pumps ? 'مضخات' : null,
            systems.water ? 'خزان مياه' : null,
            systems.hose ? 'بكرات' : null,
            systems.extinguishers ? 'طفايات' : null,
          ]
            .filter(Boolean)
            .join('، ')
        : [
            systems.sprinkler ? 'sprinklers' : null,
            systems.alarm ? 'alarm' : null,
            systems.pumps ? 'pumps' : null,
            systems.water ? 'tank' : null,
            systems.hose ? 'hose reels' : null,
            systems.extinguishers ? 'extinguishers' : null,
          ]
            .filter(Boolean)
            .join(', ');
    const text =
      locale === 'ar'
        ? `ملخص الدراسة: منشأة «${facility.business_name}» — إشغال ${occupancyLabel || 'قيد الاستكمال'} — خطورة ${hazardLabel || 'قيد الاستكمال'} — مساحة ${fmtArea(areaM2, locale)} — أدوار ${fmtNum(floors, locale, '', '')}. الأنظمة الموثّقة ضمن الملف: ${sysList || 'يلزم استكمال توثيق الأنظمة'}. أُعدّ الملخص من البيانات المعتمدة ومحرك القواعد فقط.`
        : `Study summary: facility “${facility.business_name}” — occupancy ${occupancyLabel || 'pending'} — hazard ${hazardLabel || 'pending'} — area ${fmtArea(areaM2, locale)} — floors ${fmtNum(floors, locale, '', '')}. Systems documented in the file: ${sysList || 'system documentation incomplete'}. Summary uses approved data and the Rules Engine only.`;
    return { paragraphs: [p(text, ['SBC 801', 'NFPA', 'Civil Defense'], ctx.allowedCitations)] };
  },

  engineering_recommendations: (ctx) => {
    const { locale, report, missingInputs, rulesGateOk } = ctx;
    const checked = TECH_REPORT_GENERAL_RECOMMENDATIONS.filter((item) =>
      report.general_recommendations?.some((r) => r.id === item.id && r.checked)
    );
    const paragraphs: EngineeringStudyParagraph[] = [];
    if (checked.length) {
      paragraphs.push(
        p(
          locale === 'ar'
            ? `التوصيات العامة المعتمدة من المهندس في ملف التقرير: ${checked.map((c) => c.label).join('؛ ')}.`
            : `Engineer-approved general recommendations from the report file: ${checked.map((c) => c.label).join('; ')}.`,
          ['SBC 801', 'Civil Defense', 'Company Standards'],
          ctx.allowedCitations
        )
      );
    }
    if (missingInputs.length) {
      paragraphs.push(
        p(
          locale === 'ar'
            ? `يُوصى باستكمال المدخلات التالية قبل الاعتماد النهائي: ${missingInputs.join('، ')}.`
            : `Complete the following inputs before final approval: ${missingInputs.join(', ')}.`,
          ['Company Standards'],
          ctx.allowedCitations
        )
      );
    }
    if (!rulesGateOk) {
      paragraphs.push(
        p(
          locale === 'ar'
            ? 'يُوصى بإغلاق بوابة محرك القرار الهندسي (إكمال الحقول الإلزامية وإزالة المخالفات) قبل تسليم الدراسة للجهة المختصة.'
            : 'Close the Engineering Decision Engine gate (complete required fields and clear violations) before submitting the study to the authority.',
          ['Company Standards', 'Civil Defense'],
          ctx.allowedCitations
        )
      );
    }
    if (!paragraphs.length) {
      paragraphs.push(
        p(
          locale === 'ar'
            ? 'يُوصى بالالتزام بالمخططات المعتمدة، وإجراء الاختبارات والتشغيل التجريبي للأنظمة قبل التسليم النهائي للدفاع المدني، وتحديث الدراسة عند أي تعديل جوهري على الإشغال أو الأنظمة.'
            : 'Comply with approved drawings, perform testing/commissioning before final Civil Defense submission, and revise this study upon any material change to occupancy or systems.',
          ['Civil Defense', 'SBC 801', 'NFPA'],
          ctx.allowedCitations
        )
      );
    }
    return { paragraphs };
  },

  conclusion: (ctx) => {
    const { locale, facility, rulesGateOk } = ctx;
    if (!facility.business_name) return { paragraphs: [missing(locale)] };
    const text =
      locale === 'ar'
        ? `ختاماً، قُدّمت هذه الدراسة الهندسية لمنشأة «${facility.business_name}» بصيغة تقرير استشاري جاهز للمراجعة والتقديم، مع اعتماد محرك القواعد الهندسية وقاعدة المعرفة كمصدر وحيد للقيم والاستنتاجات الكودية. ${
            rulesGateOk
              ? 'التسلسل الهندسي حالياً متوافق مع بوابة القرار؛ يبقى التحقق الميداني والاختبارات شرطاً للاعتماد النهائي.'
              : 'لا تزال بعض المدخلات/المخالفات مفتوحة؛ لا يُعدّ هذا المستند اعتماداً نهائياً حتى استكمالها.'
          } والله ولي التوفيق.`
        : `In conclusion, this engineering study for “${facility.business_name}” is issued as a consultancy report suitable for review and submission, with the Engineering Rules Engine and Knowledge Base as the sole sources of coded values and conclusions. ${
            rulesGateOk
              ? 'The engineering cascade currently passes the decision gate; field verification and testing remain prerequisites for final approval.'
              : 'Some inputs/violations remain open; this document is not a final approval until they are resolved.'
          }`;
    return { paragraphs: [p(text, ['SBC 801', 'Civil Defense', 'NFPA', 'Company Standards'], ctx.allowedCitations)] };
  },
};

function yes(v: string | undefined | null): boolean {
  return v === 'نعم' || v === 'yes' || v === 'Yes';
}

/** Generate full engineering study document (consultancy structure). */
export function generateEngineeringStudy(params: {
  client: ClientRecord;
  report: TechnicalReport;
  engineeringData?: ProjectEngineeringData | null;
  locale?: ReportLocale;
}): EngineeringStudyDocument {
  const ctx = buildEngineeringReportContext(params);
  const locale = ctx.locale;

  const sections: EngineeringStudySection[] = ENGINEERING_STUDY_SECTIONS.map((meta) => {
    if (meta.structural) {
      return {
        id: meta.id,
        number: meta.number,
        title_ar: meta.title_ar,
        title_en: meta.title_en,
        paragraphs: [],
      };
    }
    const gen = generators[meta.id];
    const body = gen ? gen(ctx) : { paragraphs: [missing(locale)] };
    const fromItems = collectSectionPhotos(params.report, meta.id);
    const existing = body.images || [];
    const seen = new Set(existing.map((img) => img.src));
    const mergedImages = [
      ...existing,
      ...fromItems.filter((img) => img.src && !seen.has(img.src)),
    ];
    return {
      id: meta.id,
      number: meta.number,
      title_ar: meta.title_ar,
      title_en: meta.title_en,
      paragraphs: body.paragraphs,
      tables: body.tables,
      images: mergedImages.length ? mergedImages : undefined,
    };
  });

  const facadeSrc = params.report.facade_photo?.dataUrl || '';
  const cover_image: EngineeringStudyImage | null = facadeSrc
    ? {
        src: facadeSrc,
        caption_ar: params.report.facade_photo?.caption || 'صورة واجهة المشروع',
        caption_en: params.report.facade_photo?.caption || 'Project facade photograph',
      }
    : null;

  return {
    locale,
    title_ar: 'دراسة هندسية لأنظمة السلامة والوقاية من الحريق',
    title_en: 'Engineering Study — Fire Protection & Life Safety Systems',
    generated_at: new Date().toISOString(),
    report_number: params.report.outgoing_number || '—',
    report_date: params.report.report_date || new Date().toISOString().slice(0, 10),
    project_name: ctx.facility.business_name || params.client.name || '—',
    client_code: params.client.client_code || '',
    cover_image,
    sections,
    rules_gate_ok: ctx.rulesGateOk,
    rules_summary_ar: ctx.rulesSummaryAr,
    rules_summary_en: ctx.rulesSummaryEn,
    missing_inputs: ctx.missingInputs,
  };
}
