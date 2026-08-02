import type { ClientRecord } from '@/lib/types/client';
import type {
  FinalInspectionReport,
  FinalReportObservation,
  FinalReportSystemRow,
  ProjectEngineeringData,
  TechnicalReportPhoto,
} from '@/lib/types/project-reports';
import { formatGregorianDate, formatHijriDate } from '@/lib/projects/safety-delivery-letter';

export const FINAL_REPORT_SYSTEMS: FinalReportSystemRow[] = [
  { id: 'firefighting', label: 'نظام الإطفاء', percent: 100, verified: true },
  { id: 'alarm', label: 'نظام الإنذار', percent: 100, verified: true },
  { id: 'emergency_exits', label: 'مخارج الطوارئ', percent: 100, verified: true },
  { id: 'insulation', label: 'العزل / العزل الحراري والغرف الخاصة', percent: 100, verified: true },
];

const SECTION_LABELS: Record<string, { system_id: string; prefix: string }> = {
  firefighting: { system_id: 'firefighting', prefix: 'نظام الإطفاء' },
  alarm: { system_id: 'alarm', prefix: 'نظام الإنذار' },
  exits: { system_id: 'emergency_exits', prefix: 'مخارج الطوارئ' },
  ventilation: { system_id: 'insulation', prefix: 'التهوية / العزل' },
};

function uid(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function clonePhoto(photo: TechnicalReportPhoto | null | undefined): TechnicalReportPhoto | null {
  if (!photo?.dataUrl) return null;
  return { id: photo.id || uid('ph'), caption: photo.caption, dataUrl: photo.dataUrl };
}

/**
 * يجمع ملاحظات «قبل» تلقائياً من الزيارات والملاحظات والتقرير الفني.
 * يحافظ على صور «بعد» وحالة الإصلاح من النسخة المحفوظة عند إعادة المزامنة.
 */
export function collectFinalReportObservations(
  data: ProjectEngineeringData,
  existing?: FinalReportObservation[] | null
): FinalReportObservation[] {
  const previous = new Map((existing || []).map((row) => [row.id, row]));
  const bySource = new Map((existing || []).map((row) => [`${row.source}:${row.source_ref || row.title}`, row]));
  const collected: FinalReportObservation[] = [];

  const push = (draft: Omit<FinalReportObservation, 'completion_percent'> & { completion_percent?: number }) => {
    const key = `${draft.source}:${draft.source_ref || draft.title}`;
    const prev = previous.get(draft.id) || bySource.get(key);
    const after = prev?.after_photo || draft.after_photo || null;
    const status = prev?.status === 'fixed' || draft.status === 'fixed' || Boolean(after?.dataUrl)
      ? 'fixed'
      : draft.status;
    const completion_percent = status === 'fixed' ? 100 : 0;
    collected.push({
      ...draft,
      before_photo: draft.before_photo || prev?.before_photo || null,
      after_photo: after,
      status,
      completion_percent,
      title: prev?.title || draft.title,
      description: draft.description || prev?.description,
    });
  };

  // زيارات ميدانية
  for (const visit of data.field_visits || []) {
    const finding = (visit.findings || '').trim();
    if (!finding && !(visit.checklist || []).some((c) => !c.checked)) continue;

    if (finding) {
      push({
        id: `visit-${visit.visit_number}-findings`,
        title: finding.slice(0, 80) || `ملاحظة زيارة ${visit.visit_number}`,
        description: [
          visit.recommendations ? `التوصية: ${visit.recommendations}` : '',
          visit.photos_note ? `ملاحظات صور: ${visit.photos_note}` : '',
          `زيارة رقم ${visit.visit_number}${visit.visit_date ? ` — ${visit.visit_date}` : ''}`,
        ]
          .filter(Boolean)
          .join('\n'),
        source: 'field_visit',
        source_ref: `visit-${visit.visit_number}`,
        before_photo: null,
        after_photo: null,
        status: 'pending',
      });
    }

    for (const item of visit.checklist || []) {
      if (item.checked) continue;
      push({
        id: `visit-${visit.visit_number}-check-${item.id}`,
        title: item.label || 'بند قائمة تحقق',
        description: `غير مكتمل في زيارة رقم ${visit.visit_number}`,
        source: 'checklist',
        source_ref: `${visit.visit_number}:${item.id}`,
        before_photo: null,
        after_photo: null,
        status: 'pending',
      });
    }
  }

  // ملاحظات فنية / نواقص
  for (const def of data.technical_notes?.deficiencies || []) {
    push({
      id: `note-${def.id}`,
      title: def.description || 'نقص فني',
      description: `الخطورة: ${def.severity || '—'}`,
      source: 'technical_notes',
      source_ref: def.id,
      before_photo: null,
      after_photo: null,
      status: def.resolved ? 'fixed' : 'pending',
      completion_percent: def.resolved ? 100 : 0,
    });
  }

  // صور بنود التقرير الفني → قبل
  const tech = data.technical_report;
  const bundles: Array<{ key: keyof typeof SECTION_LABELS; items: typeof tech.firefighting_items }> = [
    { key: 'firefighting', items: tech.firefighting_items || [] },
    { key: 'alarm', items: tech.alarm_items || [] },
    { key: 'exits', items: tech.exits_items || [] },
    { key: 'ventilation', items: tech.ventilation_items || [] },
  ];

  for (const bundle of bundles) {
    const meta = SECTION_LABELS[bundle.key];
    for (const item of bundle.items) {
      if (!item.enabled && !(item.photos || []).length) continue;
      const firstPhoto = (item.photos || []).find((p) => p.dataUrl) || null;
      const optionText = (item.selectedOptions || []).join('، ');
      push({
        id: `tech-${bundle.key}-${item.id}`,
        title: optionText
          ? `${meta.prefix}: ${optionText.slice(0, 60)}`
          : `${meta.prefix} — بند ${item.id}`,
        description: item.notes || undefined,
        system_id: meta.system_id,
        source: 'technical_report',
        source_ref: `${bundle.key}:${item.id}`,
        before_photo: clonePhoto(firstPhoto),
        after_photo: null,
        status: 'pending',
      });
    }
  }

  // صور موقع عامة كمرجعية قبل
  if (tech.site_photo?.dataUrl) {
    push({
      id: 'tech-site-photo',
      title: 'صورة عامة من الموقع (قبل)',
      description: 'مستخرجة من التقرير الفني',
      source: 'technical_report',
      source_ref: 'site_photo',
      before_photo: clonePhoto(tech.site_photo),
      after_photo: null,
      status: 'pending',
    });
  }
  if (tech.facade_photo?.dataUrl) {
    push({
      id: 'tech-facade-photo',
      title: 'واجهة المشروع (قبل)',
      description: 'مستخرجة من التقرير الفني',
      source: 'technical_report',
      source_ref: 'facade_photo',
      before_photo: clonePhoto(tech.facade_photo),
      after_photo: null,
      status: 'pending',
    });
  }

  // إن لم يُجمع شيء — قوالب باندا الشائعة ليبدأ المهندس منها
  if (collected.length === 0) {
    const defaults = [
      { id: 'tpl-exits', title: 'إزالة العوائق من أمام مخارج الطوارئ', system_id: 'emergency_exits' },
      { id: 'tpl-compressors', title: 'عزل غرفة الضواغط', system_id: 'insulation' },
      { id: 'tpl-extinguishers', title: 'تركيب وصيانة طفايات الحريق', system_id: 'firefighting' },
      { id: 'tpl-alarm', title: 'اختبار أجهزة الإنذار والكواشف', system_id: 'alarm' },
    ];
    for (const row of defaults) {
      const prev = previous.get(row.id);
      push({
        id: row.id,
        title: row.title,
        system_id: row.system_id,
        source: 'manual',
        source_ref: row.id,
        before_photo: prev?.before_photo || null,
        after_photo: prev?.after_photo || null,
        status: prev?.status || 'pending',
      });
    }
  }

  // أضف ملاحظات يدوية سابقة غير المُعاد توليدها
  for (const prev of existing || []) {
    if (prev.source === 'manual' && !collected.some((c) => c.id === prev.id)) {
      collected.push({
        ...prev,
        completion_percent: prev.status === 'fixed' || prev.after_photo?.dataUrl ? 100 : 0,
        status: prev.after_photo?.dataUrl ? 'fixed' : prev.status,
      });
    }
  }

  return collected;
}

export function mergeSystemCompletion(
  existing?: FinalReportSystemRow[] | null,
  observations?: FinalReportObservation[] | null
): FinalReportSystemRow[] {
  const base = FINAL_REPORT_SYSTEMS.map((row) => {
    const found = existing?.find((item) => item.id === row.id);
    return found ? { ...row, ...found, label: row.label } : { ...row };
  });

  if (!observations?.length) return base;

  return base.map((row) => {
    const related = observations.filter((o) => o.system_id === row.id);
    if (!related.length) return row;
    const fixed = related.filter((o) => o.status === 'fixed' || o.completion_percent >= 100).length;
    const percent = Math.round((fixed / related.length) * 100);
    return {
      ...row,
      percent,
      verified: percent === 100,
    };
  });
}

export function seedFinalInspectionReport(
  client: ClientRecord,
  data: ProjectEngineeringData,
  existing?: FinalInspectionReport | null
): FinalInspectionReport {
  const today = new Date().toISOString().slice(0, 10);
  const observations = collectFinalReportObservations(data, existing?.observations);
  const system_completion = mergeSystemCompletion(existing?.system_completion, observations);
  const allFixed = observations.length > 0 && observations.every((o) => o.status === 'fixed');

  return {
    status: existing?.status || 'مسودة',
    inspection_date: existing?.inspection_date || today,
    inspector_name:
      existing?.inspector_name ||
      data.technical_report.safety_engineer_name ||
      client.assigned_engineer ||
      '',
    overall_result: existing?.overall_result || (allFixed ? 'مطابق — جاهز للتسليم' : 'قيد الاستكمال'),
    compliance_summary: existing?.compliance_summary || existing?.executive_summary || '',
    executive_summary:
      existing?.executive_summary ||
      existing?.compliance_summary ||
      'يلخص هذا التقرير أعمال السلامة المنفذة والملاحظات الميدانية مع إثبات التصحيح (قبل / بعد) وفق نموذج باندا المعتمد.',
    license_recommendation: existing?.license_recommendation || '',
    branch_name:
      existing?.branch_name ||
      [client.city, client.district].filter(Boolean).join(' — ') ||
      client.business_name ||
      '',
    system_completion,
    observations,
    updated_at: existing?.updated_at || null,
  };
}

export function markObservationFixed(
  observation: FinalReportObservation,
  afterPhoto: TechnicalReportPhoto | null
): FinalReportObservation {
  const hasAfter = Boolean(afterPhoto?.dataUrl);
  return {
    ...observation,
    after_photo: afterPhoto,
    status: hasAfter ? 'fixed' : observation.status,
    completion_percent: hasAfter ? 100 : observation.completion_percent,
  };
}

export function finalReportDates(isoDate?: string | null) {
  const day = isoDate || new Date().toISOString().slice(0, 10);
  return {
    gregorian: formatGregorianDate(day),
    hijri: formatHijriDate(day),
  };
}

export function overallSystemsPercent(rows?: FinalReportSystemRow[] | null): number {
  if (!rows?.length) return 0;
  const sum = rows.reduce((acc, row) => acc + Number(row.percent || 0), 0);
  return Math.round(sum / rows.length);
}
