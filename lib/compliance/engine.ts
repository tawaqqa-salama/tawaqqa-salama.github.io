import { deriveActivityRequirements } from '@/lib/business/sbc-requirements';
import { findEkbTopicsByTags } from '@/lib/compliance/ekb-catalog';
import { parseEngineeringFileMeta } from '@/lib/compliance/file-parser';
import type {
  ComplianceFinding,
  ComplianceValidateInput,
  ComplianceValidationResult,
} from '@/lib/compliance/types';

/** حدود استرشادية NFPA 101 لمسافة السفر (م) — مبسّطة للمنصة */
const NFPA_TRAVEL_LIMITS = {
  withSprinkler: 76,
  withoutSprinkler: 61,
};

function pushUnique(findings: ComplianceFinding[], item: ComplianceFinding) {
  if (!findings.some((f) => f.id === item.id)) findings.push(item);
}

/**
 * Dynamic Compliance Engine — يدمج اشتقاقات SBC الحالية مع قواعد NFPA استرشادية
 * وربط مواضيع EKB لسجل المخاطر والقرارات.
 */
export function validateCompliance(input: ComplianceValidateInput): ComplianceValidationResult {
  const findings: ComplianceFinding[] = [];
  const ekbHints: string[] = [];

  const sbc = deriveActivityRequirements({
    activity_type: input.activityType,
    floors_count: input.floorsCount,
    building_area: input.buildingArea,
    land_area: input.landArea,
  });

  if (sbc) {
    for (const req of sbc.requirements) {
      const severity =
        req.severity === 'required'
          ? 'fail'
          : req.severity === 'warning'
            ? 'warning'
            : 'info';
      pushUnique(findings, {
        id: `sbc-${req.id}`,
        standard: 'SBC',
        code: req.refs[0] || 'SBC-801',
        severity: severity === 'fail' && input.hasSprinklers && req.id.includes('sprinkler') ? 'pass' : severity,
        title: req.title,
        detail: req.detail,
        refs: req.refs,
        ekbTopicIds: req.id.includes('sprinkler')
          ? ['ekb-sprinklers']
          : req.id.includes('alarm') || req.id.includes('detect')
            ? ['ekb-alarm']
            : ['ekb-occupancy'],
      });
    }

    // مرشات: إن كانت مطلوبة ومفعّلة → pass
    const sprinklerRequired = sbc.requirements.some(
      (r) => r.severity === 'required' && r.id.includes('sprinkler')
    );
    if (sprinklerRequired) {
      pushUnique(findings, {
        id: 'nfpa-sprinkler-presence',
        standard: 'NFPA',
        code: 'NFPA-13',
        severity: input.hasSprinklers ? 'pass' : 'fail',
        title: input.hasSprinklers ? 'نظام مرشات موجود' : 'نظام مرشات غير مؤكد',
        detail: input.hasSprinklers
          ? 'تم تسجيل وجود مرشات تلقائية بما يتوافق مع NFPA 13 / SBC.'
          : 'يجب تأكيد تصميم وتركيب مرشات وفق NFPA 13 وSBC 801.',
        refs: ['NFPA-13', 'SBC-801-SPR'],
        ekbTopicIds: ['ekb-sprinklers'],
      });
    }

    const alarmRequired = sbc.requirements.some(
      (r) => r.severity === 'required' && (r.id.includes('alarm') || r.id.includes('detect'))
    );
    if (alarmRequired || (input.occupants != null && input.occupants >= 300)) {
      pushUnique(findings, {
        id: 'nfpa-alarm-presence',
        standard: 'NFPA',
        code: 'NFPA-72',
        severity: input.hasFireAlarm || input.hasDetection ? 'pass' : 'warning',
        title: 'نظام إنذار / كشف',
        detail: 'تحقق من توافق نظام الإنذار مع NFPA 72 وعتبات SBC للشاغلين.',
        refs: ['NFPA-72', 'SBC-801-ALM'],
        ekbTopicIds: ['ekb-alarm'],
      });
    }
  } else {
    pushUnique(findings, {
      id: 'sbc-activity-missing',
      standard: 'SBC',
      code: 'PLATFORM-ACTIVITY',
      severity: 'warning',
      title: 'نوع النشاط غير محدد',
      detail: 'حدد نوع النشاط لتشغيل اشتقاقات SBC 801 وربطه بقاعدة المعرفة.',
      refs: ['PLATFORM-ACTIVITY-RULES'],
      ekbTopicIds: ['ekb-occupancy'],
    });
  }

  // NFPA 101 — مسافة السفر
  if (input.travelDistanceM != null && input.travelDistanceM > 0) {
    const limit = input.hasSprinklers
      ? NFPA_TRAVEL_LIMITS.withSprinkler
      : NFPA_TRAVEL_LIMITS.withoutSprinkler;
    const over = input.travelDistanceM > limit;
    pushUnique(findings, {
      id: 'nfpa-travel-distance',
      standard: 'NFPA',
      code: 'NFPA-101',
      severity: over ? 'fail' : 'pass',
      title: 'مسافة السفر إلى المخرج',
      detail: over
        ? `المسافة المسجّلة ${input.travelDistanceM}م تتجاوز الحد الاسترشادي ${limit}م.`
        : `المسافة ${input.travelDistanceM}م ضمن الحد الاسترشادي ${limit}م.`,
      refs: ['NFPA-101', 'SBC-201-EGRESS'],
      ekbTopicIds: ['ekb-egress'],
    });
  }

  let parsedFile = null;
  if (input.fileName) {
    parsedFile = parseEngineeringFileMeta({
      fileName: input.fileName,
      rawText: input.notes || null,
    });
    if (!parsedFile.parseable) {
      pushUnique(findings, {
        id: 'file-unsupported',
        standard: 'SBC',
        code: 'FILE-FORMAT',
        severity: 'warning',
        title: 'صيغة ملف غير مدعومة',
        detail: parsedFile.message,
        refs: ['PLATFORM-FILE-PARSER'],
      });
    } else {
      pushUnique(findings, {
        id: 'file-registered',
        standard: 'SBC',
        code: 'FILE-PARSER',
        severity: 'info',
        title: `ملف هندسي: ${parsedFile.format.toUpperCase()}`,
        detail: parsedFile.message,
        refs: ['PLATFORM-FILE-PARSER'],
      });
    }
  }

  const fails = findings.filter((f) => f.severity === 'fail').length;
  const warnings = findings.filter((f) => f.severity === 'warning').length;
  const passes = findings.filter((f) => f.severity === 'pass').length;
  const total = Math.max(1, fails + warnings + passes);
  const score = Math.round(((passes + warnings * 0.4) / total) * 100);

  for (const finding of findings) {
    for (const topicId of finding.ekbTopicIds || []) {
      if (!ekbHints.includes(topicId)) ekbHints.push(topicId);
    }
  }

  const related = findEkbTopicsByTags(['sprinkler', 'alarm', 'egress', 'occupancy']);
  for (const topic of related) {
    if (!ekbHints.includes(topic.id)) ekbHints.push(topic.id);
  }

  const ok = fails === 0;
  return {
    ok,
    score,
    summary: ok
      ? `التحقق ناجح نسبياً (درجة ${score}). تحذيرات: ${warnings}.`
      : `يوجد ${fails} بند غير مطابق و${warnings} تحذير (درجة ${score}).`,
    findings,
    standards: ['SBC', 'NFPA'],
    ekbHints,
    parsedFile,
  };
}
