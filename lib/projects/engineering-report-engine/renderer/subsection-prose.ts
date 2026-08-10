/**
 * Topic-level engineering prose for technical-report items.
 * Describes the engineering review scope — never invents project quantities.
 */

export type ItemProse = {
  /** What the study reviews for this subsystem (code-aligned, non-numeric). */
  scope_ar: string;
  scope_en: string;
  /** Clear gap statement when notes/options/plans are missing. */
  missing_ar: string;
  missing_en: string;
};

const DEFAULT_PROSE: ItemProse = {
  scope_ar:
    'تُراجع متطلبات هذا البند وفق طبيعة الإشغال وخصائص المبنى والكودات المعتمدة، مع توثيق الحالة القائمة من بيانات الملف دون افتراض تجهيزات غير موثّقة.',
  scope_en:
    'Requirements for this item are reviewed against occupancy, building attributes, and adopted codes, documenting the as-built condition from file data without assuming undocumented equipment.',
  missing_ar:
    'البيانات المتاحة حاليًا لا تكفي لإجراء تحقق تفصيلي لهذا البند. ولا يتم افتراض أي قيمة أو تجهيز غير موثق في ملف المشروع.',
  missing_en:
    'Available data are insufficient for a detailed verification of this item. Undocumented values or equipment are not assumed.',
};

export const ITEM_ENGINEERING_PROSE: Record<string, ItemProse> = {
  ff_pumps: {
    scope_ar:
      'يجب توفير منظومة ضخ حريق مناسبة لطبيعة الإشغال ومتطلبات التصميم الهيدروليكي المعتمد، بما يشمل ترتيبات المضخة الرئيسية والاحتياطية وغرفة المضخات وحمايتها وربطها بأنظمة المراقبة والإنذار عند توفرها في الملف.',
    scope_en:
      'A fire-pump arrangement suited to the occupancy and the approved hydraulic design is reviewed, including main/standby pumps, pump-room protection, and monitoring/alarm interfaces when documented in the file.',
    missing_ar:
      'لا تتوفر ضمن بيانات المشروع الحالية مواصفات هيدروليكية معتمدة لقدرة/ضغط المضخات أو تفاصيل غرفة المضخات. ولا يتم افتراض هذه القيم.',
    missing_en:
      'Approved hydraulic pump capacity/pressure data and pump-room details are not available in the current project file. These values are not assumed.',
  },
  ff_water: {
    scope_ar:
      'يُراجع مصدر إمداد مياه الإطفاء من حيث كفاية السعة ومدة التشغيل وترتيب التخزين المعتمد، بما يضمن استمرارية الإمداد أثناء الطوارئ وفق الكودات المعتمدة.',
    scope_en:
      'The fire-water supply is reviewed for storage capacity, operating duration, and approved tank arrangement to sustain emergency supply under adopted codes.',
    missing_ar:
      'لا تتوفر ضمن بيانات المشروع الحالية سعة خزان معتمدة أو مدة تشغيل موثّقة. ولا يتم افتراض هذه القيم.',
    missing_en:
      'No approved tank capacity or documented operating duration is available in the current project file. These values are not assumed.',
  },
  ff_cabinets: {
    scope_ar:
      'تُراجع صناديق الحريق وبكرات الخراطيم من حيث التوزيع وإمكانية الوصول واللوحات الإرشادية وفق المخططات المعتمدة ومتطلبات الدفاع المدني.',
    scope_en:
      'Hose cabinets and reels are reviewed for distribution, accessibility, and signage against approved drawings and Civil Defense requirements.',
    missing_ar:
      'لا تتوفر مخططات توزيع صناديق الحريق ضمن بيانات المشروع الحالية. ولا يتم افتراض أعداد أو مواقع غير موثّقة.',
    missing_en:
      'Hose-cabinet distribution drawings are not available in the current project file. Undocumented counts or locations are not assumed.',
  },
  ff_piping: {
    scope_ar:
      'تُراجع شبكة الأنابيب والمرشات من حيث تغطية الفراغات المطلوبة وملاءمة الترتيب الهيدروليكي المعتمد ومواد التنفيذ الواردة في المخططات.',
    scope_en:
      'Piping and sprinklers are reviewed for required-space coverage and consistency with the approved hydraulic arrangement and drawing materials.',
    missing_ar:
      'لا تتوفر حسابات/مخططات هيدروليكية معتمدة لتغطية الرش ضمن الملف الحالي. ولا يتم افتراض كثافات أو أقطار غير موثّقة.',
    missing_en:
      'Approved hydraulic/sprinkler coverage drawings are not in the current file. Undocumented densities or pipe sizes are not assumed.',
  },
  ff_cd_connections: {
    scope_ar:
      'تُراجع وصلات الدفاع المدني من حيث سهولة الوصول وخلو المسار واللوحات الإرشادية بما يمكّن آليات الدفاع المدني من الربط السريع عند الطوارئ.',
    scope_en:
      'Fire-department connections are reviewed for access, clear approach paths, and signage to enable rapid Civil Defense hookup.',
    missing_ar:
      'لا تتوفر ضمن بيانات المشروع الحالية مواقع معتمدة لوصلات الدفاع المدني. ولا يتم افتراض مواقع غير موثّقة.',
    missing_en:
      'Approved fire-department connection locations are not available in the current project file. Undocumented locations are not assumed.',
  },
  ff_cd_parking: {
    scope_ar:
      'يُراجع موقف آليات الدفاع المدني أمام المبنى من حيث التخصيص وخلوه الدائم ولوحات منع الوقوف بما يضمن وصول آليات الإطفاء دون عوائق.',
    scope_en:
      'Civil Defense appliance parking is reviewed for dedication, permanent clearance, and no-parking signage so fire apparatus can approach unobstructed.',
    missing_ar:
      'لا تتوفر ضمن بيانات المشروع الحالية أبعاد/موقع معتمد لموقف الدفاع المدني. ولا يتم افتراض هذه البيانات.',
    missing_en:
      'No approved Civil Defense parking dimensions/location are in the current project file. These data are not assumed.',
  },
  ff_special: {
    scope_ar:
      'تُراجع أنظمة الإطفاء الخاصة للفراغات عالية الخطورة (كهرباء، بيانات، مطابخ، سوائل قابلة للاشتعال) وفق نوع النظام المحدد في الملف والمناطق المشمولة.',
    scope_en:
      'Special suppression systems for higher-hazard spaces (electrical, data, kitchens, flammable liquids) are reviewed per the system type and zones documented in the file.',
    missing_ar:
      'لا تتوفر ضمن بيانات المشروع الحالية مواصفات نظام إطفاء خاص معتمدة للمناطق المعنية. ولا يتم افتراض نوع العامل أو التغطية.',
    missing_en:
      'No approved special-suppression specification for the subject zones is in the current file. Agent type and coverage are not assumed.',
  },
  ff_extinguishers: {
    scope_ar:
      'تُختار الطفايات اليدوية بما يناسب تصنيف الخطورة ونوع المواد في المناطق، مع صيانة دورية وبطاقات متابعة وفق التوزيع المعتمد.',
    scope_en:
      'Portable extinguishers are selected for zone hazard and commodity class, with periodic maintenance and inspection tags per the approved distribution.',
    missing_ar:
      'لا يتوفر مخطط توزيع طفايات معتمد ضمن بيانات المشروع الحالية. ولا يتم افتراض الأنواع أو الكميات.',
    missing_en:
      'No approved extinguisher distribution plan is in the current project file. Types and quantities are not assumed.',
  },
  vent_main: {
    scope_ar:
      'تُراجع التهوية الميكانيكية المرتبطة بالسلامة (بما فيها شفط الدخان وتهوية الفراغات المغلقة عند لزومها) وتنسيقها مع أنظمة الإنذار والإطفاء وفق المخططات الميكانيكية.',
    scope_en:
      'Life-safety mechanical ventilation (including smoke extract and enclosed-space ventilation where required) is reviewed and coordinated with alarm/suppression per mechanical drawings.',
    missing_ar:
      'لا تتوفر مواصفات تهوية ميكانيكية معتمدة ضمن الملف الحالي. ولا يتم افتراض معدلات هواء غير محسوبة.',
    missing_en:
      'No approved mechanical ventilation specification is in the current file. Unverified air-change rates are not assumed.',
  },
  al_panel: {
    scope_ar:
      'تُراجع لوحة التحكم الرئيسية لنظام الإنذار من حيث موقعها في مكان مأهول، وربطها بالأنظمة المرتبطة، وتوفير تغذية كهربائية احتياطية بما يضمن استمرارية المراقبة والإنذار.',
    scope_en:
      'The main fire-alarm control panel is reviewed for an attended location, interfaces to related systems, and standby power so monitoring and alarm remain continuous.',
    missing_ar:
      'لا تتوفر ضمن بيانات المشروع الحالية مواصفات لوحة الإنذار أو مخطط الربط المعتمد. ولا يتم افتراض هذه التفاصيل.',
    missing_en:
      'No approved fire-alarm panel specification or interface drawing is in the current project file. These details are not assumed.',
  },
  al_detectors: {
    scope_ar:
      'يتم توزيع كواشف الحريق في الفراغات وفق طبيعة الإشغال والخصائص الهندسية للمبنى ومتطلبات الكود المعتمد، مع مراعاة تغطية الفراغات ومسافات التوزيع وإمكانية الوصول للصيانة.',
    scope_en:
      'Fire detectors are distributed per occupancy, building geometry, and the adopted code, considering coverage, spacing, and maintainability.',
    missing_ar:
      'لا تتوفر ضمن بيانات المشروع الحالية مخططات توزيع الكواشف أو بيانات المسافات اللازمة للتحقق التفصيلي من التغطية. ولا يتم افتراض هذه القيم.',
    missing_en:
      'Detector layout drawings or spacing data needed for detailed coverage verification are not in the current project file. These values are not assumed.',
  },
  al_breakglass: {
    scope_ar:
      'تُراجع نقاط الإنذار اليدوية (الكواسر الزجاجية) من حيث العدد والتوزيع والارتفاع ومواقع يسهل الوصول إليها على مسارات الحركة والهروب وفق المخططات المعتمدة.',
    scope_en:
      'Manual call points (break-glass stations) are reviewed for count, distribution, mounting height, and reachable locations on circulation/egress paths per approved drawings.',
    missing_ar:
      'لا تتوفر مخططات توزيع الكواسر الزجاجية ضمن بيانات المشروع الحالية. ولا يتم افتراض أعداد أو مواقع غير موثّقة.',
    missing_en:
      'Break-glass distribution drawings are not available in the current project file. Undocumented counts or locations are not assumed.',
  },
  al_bells: {
    scope_ar:
      'تُراجع أجراس/صافرات الإنذار من حيث كفاية التغطية الصوتية في الفراغات وضمان سماع الإنذار عند التشغيل بما يتوافق مع متطلبات نظام الإنذار المعتمد.',
    scope_en:
      'Alarm bells/sounders are reviewed for audible coverage so the alarm is heard throughout occupied spaces, consistent with the approved fire-alarm system.',
    missing_ar:
      'لا تتوفر دراسة تغطية صوتية أو مخطط توزيع لأجهزة التنبيه ضمن الملف الحالي. ولا يتم افتراض مستويات صوت غير موثّقة.',
    missing_en:
      'No audibility study or notification-appliance layout is in the current file. Undocumented sound levels are not assumed.',
  },
  al_emergency_lights: {
    scope_ar:
      'تُراجع كشافات الطوارئ على مسارات الهروب والمخارج لضمان إنارة مستقلة عن الشبكة العادية لمدة التشغيل المطلوبة عند انقطاع التيار.',
    scope_en:
      'Emergency luminaires along egress paths and exits are reviewed for illumination independent of normal power for the required duration during outage.',
    missing_ar:
      'لا تتوفر مخططات إنارة طارئة معتمدة ضمن بيانات المشروع الحالية. ولا يتم افتراض مدد تشغيل أو شدة إضاءة غير موثّقة.',
    missing_en:
      'No approved emergency-lighting drawings are in the current project file. Undocumented durations or illuminance values are not assumed.',
  },
  al_signs: {
    scope_ar:
      'تُراجع اللوحات الإرشادية ولوحات المخارج المضيئة عند المخارج المعتمدة وعلى المسارات المؤدية إليها بوضوح بصري مستمر مع الإنارة الطارئة.',
    scope_en:
      'Wayfinding and illuminated exit signs at approved exits and approach paths are reviewed for continuous visibility with emergency lighting.',
    missing_ar:
      'لا يتوفر مخطط لوحات المخارج ضمن بيانات المشروع الحالية. ولا يتم افتراض مواقع غير موثّقة.',
    missing_en:
      'No exit-sign layout is available in the current project file. Undocumented locations are not assumed.',
  },
  ex_routes: {
    scope_ar:
      'تُراجع مسالك الهروب من حيث وضوح المسار وسعة المخارج وخلوها من العوائق وتنسيقها مع أنظمة الإنذار والإنارة الطارئة.',
    scope_en:
      'Means of egress are reviewed for clear routes, exit capacity, obstruction-free paths, and coordination with alarm and emergency lighting.',
    missing_ar:
      'لا تتوفر بيانات شاغلين/مخارج كافية للتحقق التفصيلي ضمن الملف الحالي. ولا يتم افتراض أعداد غير موثّقة.',
    missing_en:
      'Insufficient occupant/exit data are in the current file for detailed verification. Undocumented counts are not assumed.',
  },
  site_map: {
    scope_ar:
      'تُعرض صورة الموقع من الخريطة لتوثيق الموضع الجغرافي للمنشأة ودعم مسارات وصول آليات الإطفاء ومتطلبات الدفاع المدني.',
    scope_en:
      'The site map image documents the facility geographic position and supports fire-appliance access routing and Civil Defense requirements.',
    missing_ar:
      'لم تُرفق صورة موقع من الخريطة ضمن بيانات المشروع الحالية. ولا يتم افتراض إحداثيات أو مسارات غير موثّقة.',
    missing_en:
      'No site-map image is attached in the current project file. Undocumented coordinates or routes are not assumed.',
  },
  site_photo: {
    scope_ar: 'يُوثَّق الموقع بالحالة القائمة من واقع الزيارة الميدانية عبر الصورة المرفقة.',
    scope_en: 'The site as-built condition is documented from the field visit via the attached photograph.',
    missing_ar: 'لا تتوفر صورة موقع عامة ضمن بيانات المشروع الحالية.',
    missing_en: 'No general site photograph is available in the current project file.',
  },
};

export function getItemProse(itemId: string | undefined | null): ItemProse {
  if (!itemId) return DEFAULT_PROSE;
  return ITEM_ENGINEERING_PROSE[itemId] || DEFAULT_PROSE;
}
