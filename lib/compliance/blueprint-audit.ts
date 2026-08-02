import { validateCompliance } from '@/lib/compliance/engine';
import { detectEngineeringFormat, parseEngineeringFileMeta } from '@/lib/compliance/file-parser';
import type { ClientRecord } from '@/lib/types/client';
import type {
  BlueprintAiAuditResult,
  BlueprintAuditFinding,
  BuildingPlanReport,
  SafetyBlueprintKind,
} from '@/lib/types/project-reports';

export type BlueprintAuditRequest = {
  blueprintKind: SafetyBlueprintKind;
  fileName: string;
  sizeBytes?: number;
  mimeType?: string | null;
  /** عيّنة نصية اختيارية من PDF/نص */
  textSample?: string | null;
  client?: Partial<ClientRecord> | null;
  buildingPlan?: Partial<BuildingPlanReport> | null;
  occupants?: number | null;
  travelDistanceM?: number | null;
};

const KIND_LABELS: Record<SafetyBlueprintKind, string> = {
  architectural_base: 'المخطط المعماري الأساسي',
  fire_fighting_file: 'مخطط إطفاء الحريق',
  fire_alarm_file: 'مخطط إنذار الحريق',
  life_safety_file: 'مخطط سلامة الأرواح والإخلاء',
};

function pushFinding(list: BlueprintAuditFinding[], item: BlueprintAuditFinding) {
  if (!list.some((f) => f.id === item.id)) list.push(item);
}

function nameHints(fileName: string, keywords: string[]): boolean {
  const lower = fileName.toLowerCase();
  return keywords.some((k) => lower.includes(k.toLowerCase()));
}

function textHints(text: string | null | undefined, keywords: string[]): boolean {
  if (!text) return false;
  const lower = text.toLowerCase();
  return keywords.some((k) => lower.includes(k.toLowerCase()));
}

/**
 * محرك مراجعة مخططات السلامة بالذكاء الاصطناعي (قواعد SBC/NFPA + إشارات الملف).
 * يعمل محلياً دون إرسال الملف الثنائي لطرف ثالث.
 */
export function runBlueprintAiAudit(input: BlueprintAuditRequest): BlueprintAiAuditResult {
  const format = detectEngineeringFormat(input.fileName);
  const parsed = parseEngineeringFileMeta({
    fileName: input.fileName,
    sizeBytes: input.sizeBytes,
    rawText: input.textSample,
  });

  const plan = input.buildingPlan || {};
  const hasSprinklers = plan.sprinkler_system === 'نعم';
  const hasFireAlarm = plan.fire_alarm_system === 'نعم';
  const exitsCount = Number(plan.exits_count || 0);
  const buildingArea = Number(input.client?.building_area || 0);
  const floorsCount = Number(input.client?.floors_count || 0);

  const base = validateCompliance({
    activityType: input.client?.activity_type,
    floorsCount,
    buildingArea,
    landArea: Number(input.client?.land_area || 0),
    occupants: input.occupants,
    hasSprinklers,
    hasFireAlarm,
    hasDetection: hasFireAlarm,
    travelDistanceM: input.travelDistanceM,
    fileName: input.fileName,
    fileType: format,
    notes: input.textSample || null,
  });

  const findings: BlueprintAuditFinding[] = base.findings.map((f) => ({
    id: f.id,
    standard: f.standard,
    code: f.code,
    severity: f.severity,
    title: f.title,
    detail: f.detail,
    refs: f.refs,
    checkpoint: f.ekbTopicIds?.includes('ekb-egress')
      ? 'life_safety'
      : f.ekbTopicIds?.includes('ekb-alarm')
        ? 'fire_alarm'
        : f.ekbTopicIds?.includes('ekb-sprinklers')
          ? 'fire_fighting'
          : 'general',
  }));

  pushFinding(findings, {
    id: 'file-parse',
    standard: 'SBC',
    code: 'FILE-PARSER',
    severity: parsed.parseable ? 'pass' : 'fail',
    title: `استلام ${KIND_LABELS[input.blueprintKind]}`,
    detail: parsed.message,
    refs: ['PLATFORM-FILE-PARSER'],
    checkpoint: 'file',
  });

  // —— نقاط فحص حسب نوع المخطط ——
  if (input.blueprintKind === 'life_safety_file' || input.blueprintKind === 'architectural_base') {
    const egressName = nameHints(input.fileName, [
      'egress',
      'exit',
      'life',
      'اخلاء',
      'إخلاء',
      'مخرج',
      'سلامة',
    ]);
    const egressText = textHints(input.textSample, ['travel', 'exit width', 'مخرج', 'إخلاء', 'شاغل']);

    pushFinding(findings, {
      id: 'ls-occupant-load',
      standard: 'SBC',
      code: 'SBC-201',
      severity: buildingArea > 0 || (input.occupants != null && input.occupants > 0) ? 'pass' : 'warning',
      title: 'حمل الشاغلين (Occupant Load)',
      detail:
        input.occupants != null && input.occupants > 0
          ? `حُسب/سُجّل عدد شاغلين تقريبي: ${input.occupants}. راجع جداول SBC للإشغال.`
          : buildingArea > 0
            ? `مساحة المبنى ${buildingArea} م² متاحة لتقدير حمل الشاغلين — أكمل الحساب الهندسي.`
            : 'لم يُسجَّل عدد الشاغلين أو مساحة كافية لتقدير الحمل.',
      refs: ['SBC-201', 'NFPA-101'],
      checkpoint: 'life_safety',
    });

    pushFinding(findings, {
      id: 'ls-exits',
      standard: 'NFPA',
      code: 'NFPA-101',
      severity: exitsCount >= 2 || egressName || egressText ? 'pass' : 'warning',
      title: 'مخارج الطوارئ وعرض المخرج',
      detail:
        exitsCount >= 2
          ? `عدد المخارج المسجّل في المخطط: ${exitsCount}. تحقق من العرض الأدنى حسب الحمل.`
          : egressName || egressText
            ? 'إشارات إخلاء ظاهرة في اسم/محتوى الملف — راجع مسافات السفر وعرض المخارج.'
            : 'لم يُؤكد وجود مخارج كافية. الحد الأدنى عادة مخرجان مستقلان حسب الإشغال.',
      refs: ['NFPA-101', 'SBC-201-EGRESS'],
      checkpoint: 'life_safety',
    });

    if (input.travelDistanceM != null) {
      const limit = hasSprinklers ? 76 : 61;
      pushFinding(findings, {
        id: 'ls-travel',
        standard: 'NFPA',
        code: 'NFPA-101',
        severity: input.travelDistanceM > limit ? 'fail' : 'pass',
        title: 'أقصى مسافة سفر',
        detail: `المسافة ${input.travelDistanceM}م — الحد الاسترشادي ${limit}م ${hasSprinklers ? '(مع مرشات)' : '(بدون مرشات)'}.`,
        refs: ['NFPA-101'],
        checkpoint: 'life_safety',
      });
    } else {
      pushFinding(findings, {
        id: 'ls-travel-missing',
        standard: 'NFPA',
        code: 'NFPA-101',
        severity: 'warning',
        title: 'مسافة السفر غير مُدخلة',
        detail: 'أدخل أقصى مسافة سفر من أبعد نقطة إلى مخرج للطابق لمطابقة NFPA 101.',
        refs: ['NFPA-101'],
        checkpoint: 'life_safety',
      });
    }
  }

  if (input.blueprintKind === 'fire_alarm_file' || input.blueprintKind === 'architectural_base') {
    const alarmHint = nameHints(input.fileName, ['alarm', 'detect', 'إنذار', 'كشف', 'smoke']) ||
      textHints(input.textSample, ['smoke', 'pull station', 'إنذار', 'كاشف', 'يدوي']);

    pushFinding(findings, {
      id: 'fa-coverage',
      standard: 'NFPA',
      code: 'NFPA-72',
      severity: hasFireAlarm || alarmHint ? 'pass' : 'warning',
      title: 'تغطية كواشف الدخان ونقاط الإنذار اليدوي',
      detail: hasFireAlarm || alarmHint
        ? 'إشارات نظام إنذار موجودة — راجع كثافة الكواشف ونقاط السحب اليدوي حسب NFPA 72.'
        : 'لم يُؤكد مخطط إنذار/كشف. تحقق من تغطية الكواشف ونقاط الإنذار اليدوي في الممرات والمخارج.',
      refs: ['NFPA-72', 'SBC-801-ALM'],
      checkpoint: 'fire_alarm',
    });

    pushFinding(findings, {
      id: 'fa-manual-stations',
      standard: 'NFPA',
      code: 'NFPA-72',
      severity: alarmHint || hasFireAlarm ? 'pass' : 'info',
      title: 'نقاط الإنذار اليدوي عند المخارج',
      detail: 'تأكد من وجود Manual Pull Stations عند مخارج الطوارئ والمسارات الرئيسية.',
      refs: ['NFPA-72'],
      checkpoint: 'fire_alarm',
    });
  }

  if (input.blueprintKind === 'fire_fighting_file' || input.blueprintKind === 'architectural_base') {
    const ffHint = nameHints(input.fileName, [
      'sprinkler',
      'fire',
      'hydrant',
      'إطفاء',
      'مرشات',
      'حريق',
    ]) || textHints(input.textSample, ['sprinkler', 'hydrant', 'breeching', 'مرشات', 'صنبور', 'قطر']);

    pushFinding(findings, {
      id: 'ff-sprinkler-layout',
      standard: 'NFPA',
      code: 'NFPA-13',
      severity: hasSprinklers || ffHint ? 'pass' : 'warning',
      title: 'توزيع رؤوس المرشات وأقطار الأنابيب',
      detail: hasSprinklers || ffHint
        ? 'مخطط إطفاء/مرشات مُشار إليه — راجع التباعد وأقطار الأنابيب حسب خطر الإشغال (NFPA 13).'
        : 'لم يُؤكد وجود مرشات. تحقق من اشتراط المرشات حسب النشاط والمساحة في SBC/NFPA 13.',
      refs: ['NFPA-13', 'SBC-801-SPR'],
      checkpoint: 'fire_fighting',
    });

    pushFinding(findings, {
      id: 'ff-hydrant-breeching',
      standard: 'SBC',
      code: 'SBC-801',
      severity: ffHint ? 'pass' : 'info',
      title: 'حنفيات الحريق ومدخل الدفاع المدني (Breeching Inlet)',
      detail: 'تحقق من مواقع Hydrants وBreeching Inlet وسهولة وصول فرق الإطفاء.',
      refs: ['SBC-801', 'NFPA-14'],
      checkpoint: 'fire_fighting',
    });
  }

  const fails = findings.filter((f) => f.severity === 'fail').length;
  const warnings = findings.filter((f) => f.severity === 'warning').length;
  const passes = findings.filter((f) => f.severity === 'pass').length;
  const total = Math.max(1, fails + warnings + passes);
  const score = Math.round(((passes + warnings * 0.35) / total) * 100);

  let status: BlueprintAiAuditResult['status'] = 'pass';
  if (fails > 0) status = 'fail';
  else if (warnings > 0) status = 'warn';

  const summary =
    status === 'pass'
      ? `مطابق للمواصفات نسبياً — درجة ${score}. راجع البنود المعلوماتية.`
      : status === 'warn'
        ? `يوجد ملاحظات — ${warnings} تحذير ودرجة ${score}.`
        : `غير مطابق — ${fails} بند حرج و${warnings} تحذير (درجة ${score}).`;

  return {
    ok: fails === 0,
    score,
    summary,
    status,
    findings,
    standards: ['SBC', 'NFPA'],
    ekbHints: base.ekbHints,
    auditedAt: new Date().toISOString(),
    blueprintKind: input.blueprintKind,
    fileName: input.fileName,
  };
}

export { KIND_LABELS };
