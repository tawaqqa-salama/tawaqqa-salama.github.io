import { ACTIVITY_RULES } from '@/lib/constants/clients';
import { DEFAULT_COMPANY_PROFILE, type CompanyProfile } from '@/lib/company-profile';
import type { ClientRecord } from '@/lib/types/client';
import type {
  ProjectEngineeringData,
  SupervisionMonthColumn,
  SupervisionProgressCell,
  SupervisionReport,
  SupervisionTaskRow,
  SupervisionWorkType,
} from '@/lib/types/project-reports';
import { EMPTY_SUPERVISION_REPORT } from '@/lib/types/project-reports';

function pick(existing: string | undefined | null, fallback: string): string {
  const text = String(existing ?? '').trim();
  return text || fallback;
}

function emptyCell(): SupervisionProgressCell {
  return { percent: null, status: '' };
}

function monthProgressFor(months: SupervisionMonthColumn[]): Record<string, SupervisionProgressCell> {
  return Object.fromEntries(months.map((m) => [m.id, emptyCell()]));
}

export const DEFAULT_SUPERVISION_MONTHS: SupervisionMonthColumn[] = [
  { id: 'm1', label: 'الشهر 1' },
  { id: 'm2', label: 'الشهر 2' },
  { id: 'm3', label: 'الشهر 3' },
];

type TaskSeed = {
  category_id: string;
  category_label: string;
  description: string;
  work_type: SupervisionWorkType;
};

/** هيكل جدول متابعة الأعمال وفق مرجع TEEM */
export const DEFAULT_SUPERVISION_TASK_SEEDS: TaskSeed[] = [
  {
    category_id: 'structural',
    category_label: 'الملاحظات الإنشائية',
    description: 'توريد وتركيب أبواب الحريق',
    work_type: 'توريد وتركيب',
  },
  {
    category_id: 'structural',
    category_label: 'الملاحظات الإنشائية',
    description: 'مخارج الطوارئ ومسارات الإخلاء',
    work_type: 'تركيب',
  },
  {
    category_id: 'structural',
    category_label: 'الملاحظات الإنشائية',
    description: 'العزل الإنشائي المقاوم للحريق',
    work_type: 'تركيب',
  },
  {
    category_id: 'firefighting',
    category_label: 'أنظمة الإطفاء',
    description: 'شبكة الأنابيب',
    work_type: 'توريد وتركيب',
  },
  {
    category_id: 'firefighting',
    category_label: 'أنظمة الإطفاء',
    description: 'المضخات',
    work_type: 'توريد وتركيب',
  },
  {
    category_id: 'firefighting',
    category_label: 'أنظمة الإطفاء',
    description: 'الرشاشات',
    work_type: 'توريد وتركيب',
  },
  {
    category_id: 'firefighting',
    category_label: 'أنظمة الإطفاء',
    description: 'خزائن الخراطيم',
    work_type: 'توريد وتركيب',
  },
  {
    category_id: 'firefighting',
    category_label: 'أنظمة الإطفاء',
    description: 'الطفايات',
    work_type: 'توريد',
  },
  {
    category_id: 'firefighting',
    category_label: 'أنظمة الإطفاء',
    description: 'الرايزر الجاف',
    work_type: 'توريد وتركيب',
  },
  {
    category_id: 'alarm',
    category_label: 'أنظمة الإنذار',
    description: 'لوحات التحكم والإنذار',
    work_type: 'توريد وتركيب',
  },
  {
    category_id: 'alarm',
    category_label: 'أنظمة الإنذار',
    description: 'تمديدات EMT ومجاري الأسلاك',
    work_type: 'توريد وتركيب',
  },
  {
    category_id: 'alarm',
    category_label: 'أنظمة الإنذار',
    description: 'كواشف الدخان / الحرارة',
    work_type: 'توريد وتركيب',
  },
  {
    category_id: 'alarm',
    category_label: 'أنظمة الإنذار',
    description: 'نقاط الإنذار اليدوية',
    work_type: 'توريد وتركيب',
  },
  {
    category_id: 'alarm',
    category_label: 'أنظمة الإنذار',
    description: 'أجهزة التنبيه / السماعات',
    work_type: 'توريد وتركيب',
  },
  {
    category_id: 'alarm',
    category_label: 'أنظمة الإنذار',
    description: 'إنارة الطوارئ',
    work_type: 'توريد وتركيب',
  },
  {
    category_id: 'alarm',
    category_label: 'أنظمة الإنذار',
    description: 'نظام الإذاعة العامة وتكامل الأنظمة',
    work_type: 'توريد وتركيب',
  },
  {
    category_id: 'smoke',
    category_label: 'أنظمة التحكم بالدخان',
    description: 'مراوح سحب الدخان',
    work_type: 'توريد وتركيب',
  },
  {
    category_id: 'smoke',
    category_label: 'أنظمة التحكم بالدخان',
    description: 'الدمبرز / الشبكات',
    work_type: 'توريد وتركيب',
  },
  {
    category_id: 'restoration',
    category_label: 'أعمال الترميم والنظافة العامة',
    description: 'أعمال الترميم والتنظيف العام',
    work_type: 'تركيب',
  },
];

export function buildDefaultSupervisionTasks(
  months: SupervisionMonthColumn[] = DEFAULT_SUPERVISION_MONTHS
): SupervisionTaskRow[] {
  return DEFAULT_SUPERVISION_TASK_SEEDS.map((seed, index) => ({
    id: `task-${seed.category_id}-${index + 1}`,
    category_id: seed.category_id,
    category_label: seed.category_label,
    description: seed.description,
    work_type: seed.work_type,
    month_progress: monthProgressFor(months),
    total_percent: null,
  }));
}

/** ترقية الهيكل الافتراضي القديم دون طمس النسب المحفوظة يدوياً */
function shouldUpgradeDefaultTasks(tasks: SupervisionTaskRow[]): boolean {
  if (!tasks.length) return true;
  if (tasks.length >= DEFAULT_SUPERVISION_TASK_SEEDS.length) return false;
  const onlyDefaults = tasks.every(
    (t) => t.id.startsWith('task-') && !t.id.includes('manual')
  );
  return onlyDefaults;
}

function mergeDefaultTasksPreservingProgress(
  existing: SupervisionTaskRow[],
  months: SupervisionMonthColumn[]
): SupervisionTaskRow[] {
  const byDescription = new Map(
    existing.map((t) => [t.description.trim(), t] as const)
  );
  return DEFAULT_SUPERVISION_TASK_SEEDS.map((seed, index) => {
    const prev = byDescription.get(seed.description);
    const base: SupervisionTaskRow = {
      id: prev?.id || `task-${seed.category_id}-${index + 1}`,
      category_id: seed.category_id,
      category_label: seed.category_label,
      description: seed.description,
      work_type: prev?.work_type || seed.work_type,
      month_progress: monthProgressFor(months),
      total_percent: prev?.total_percent ?? null,
    };
    if (prev?.month_progress) {
      for (const month of months) {
        if (prev.month_progress[month.id]) {
          base.month_progress[month.id] = { ...prev.month_progress[month.id] };
        }
      }
    }
    return base;
  });
}

export function ensureTaskMonths(
  task: SupervisionTaskRow,
  months: SupervisionMonthColumn[]
): SupervisionTaskRow {
  const next: Record<string, SupervisionProgressCell> = {};
  for (const month of months) {
    next[month.id] = task.month_progress?.[month.id] || emptyCell();
  }
  return { ...task, month_progress: next };
}

/** متوسط نسب الأشهر غير الفارغة — أو القيمة اليدوية إن وُجدت */
export function calcTaskTotalPercent(task: SupervisionTaskRow): number | null {
  if (task.total_percent != null && !Number.isNaN(task.total_percent)) {
    return Math.max(0, Math.min(100, Math.round(task.total_percent)));
  }
  const values = Object.values(task.month_progress || {})
    .map((c) => c.percent)
    .filter((p): p is number => p != null && !Number.isNaN(p));
  if (!values.length) return null;
  return Math.round(values.reduce((a, b) => a + b, 0) / values.length);
}

export function calcOverallProgress(tasks: SupervisionTaskRow[]): number | null {
  const totals = tasks
    .map((t) => calcTaskTotalPercent(t))
    .filter((p): p is number => p != null);
  if (!totals.length) return null;
  return Math.round(totals.reduce((a, b) => a + b, 0) / totals.length);
}

export function resolveOverallProgress(report: SupervisionReport): number | null {
  if (report.overall_progress_manual && report.overall_progress_percent != null) {
    return Math.max(0, Math.min(100, Math.round(report.overall_progress_percent)));
  }
  return calcOverallProgress(report.tasks || []);
}

export function isSupervisionReportIncomplete(report?: SupervisionReport | null): boolean {
  if (!report) return true;
  return (
    !(report.months?.length) ||
    !(report.tasks?.length) ||
    !String(report.owner_name || '').trim() ||
    !String(report.project_name || '').trim() ||
    !String(report.supervising_office || '').trim()
  );
}

export function seedSupervisionReport(
  client: ClientRecord,
  data: ProjectEngineeringData,
  company: CompanyProfile | null | undefined,
  existing?: SupervisionReport | null
): SupervisionReport {
  const activity = ACTIVITY_RULES[client.activity_type || ''];
  const tech = data.technical_report;
  const delivery = data.engineering_delivery;
  const cert = data.completion_certificate;
  const timeline = data.timeline;
  const today = new Date().toISOString().slice(0, 10);
  const officeFallback =
    company?.legal_name ||
    company?.name ||
    cert.study_office_name ||
    DEFAULT_COMPANY_PROFILE.legal_name ||
    DEFAULT_COMPANY_PROFILE.name;

  const months =
    existing?.months?.length ? existing.months : [...DEFAULT_SUPERVISION_MONTHS];

  let tasks: SupervisionTaskRow[];
  if (existing?.tasks?.length && !shouldUpgradeDefaultTasks(existing.tasks)) {
    tasks = existing.tasks.map((t) => ensureTaskMonths(t, months));
  } else if (existing?.tasks?.length) {
    tasks = mergeDefaultTasksPreservingProgress(existing.tasks, months);
  } else {
    tasks = buildDefaultSupervisionTasks(months);
  }

  const area =
    client.building_area != null
      ? String(client.building_area)
      : client.land_area != null
        ? String(client.land_area)
        : cert.land_area || '';

  const projectLabel = [
    client.business_name || client.name || '',
    activity?.label || client.activity_type || '',
  ]
    .filter(Boolean)
    .join(' — ');

  const base: SupervisionReport = {
    ...EMPTY_SUPERVISION_REPORT,
    ...existing,
    status: existing?.status || 'مسودة',
    months,
    tasks,
    owner_name: pick(existing?.owner_name, client.owner_name || client.name || ''),
    project_name: pick(existing?.project_name, projectLabel),
    building_type: pick(
      existing?.building_type,
      activity?.label || client.activity_type || tech.building_classification || ''
    ),
    area_m2: pick(existing?.area_m2, area),
    contractor_name: pick(existing?.contractor_name, cert.contractor_name || ''),
    inspection_form_number: pick(
      existing?.inspection_form_number,
      tech.outgoing_number || delivery?.outgoing_number || ''
    ),
    study_number: pick(
      existing?.study_number,
      cert.study_report_number || tech.outgoing_number || delivery?.outgoing_number || ''
    ),
    supervising_office: pick(existing?.supervising_office, officeFallback),
    branch_manager_name: pick(
      existing?.branch_manager_name,
      delivery?.manager_name || tech.executive_director_name || ''
    ),
    safety_engineer_name: pick(
      existing?.safety_engineer_name,
      tech.safety_engineer_name ||
        delivery?.safety_engineer_name ||
        client.assigned_engineer ||
        ''
    ),
    report_date: pick(existing?.report_date, today),
    total_duration: pick(existing?.total_duration, ''),
    start_date: pick(existing?.start_date, timeline.project_start || ''),
    overall_progress_manual: existing?.overall_progress_manual ?? false,
    notes: existing?.notes || '',
    updated_at: existing?.updated_at || null,
  };

  if (!base.overall_progress_manual) {
    base.overall_progress_percent = calcOverallProgress(base.tasks);
  } else if (base.overall_progress_percent == null) {
    base.overall_progress_percent = calcOverallProgress(base.tasks);
  }

  return base;
}

export function addSupervisionMonth(report: SupervisionReport): SupervisionReport {
  const n = (report.months?.length || 0) + 1;
  const month: SupervisionMonthColumn = {
    id: `m${Date.now()}`,
    label: `الشهر ${n}`,
  };
  const months = [...(report.months || []), month];
  const tasks = (report.tasks || []).map((t) => ensureTaskMonths(t, months));
  const next = { ...report, months, tasks };
  if (!next.overall_progress_manual) {
    next.overall_progress_percent = calcOverallProgress(tasks);
  }
  return next;
}

export function removeSupervisionMonth(
  report: SupervisionReport,
  monthId: string
): SupervisionReport {
  if ((report.months?.length || 0) <= 1) return report;
  const months = (report.months || []).filter((m) => m.id !== monthId);
  const tasks = (report.tasks || []).map((t) => ensureTaskMonths(t, months));
  const next = { ...report, months, tasks };
  if (!next.overall_progress_manual) {
    next.overall_progress_percent = calcOverallProgress(tasks);
  }
  return next;
}

export const SUPERVISION_LEGEND = [
  {
    status: 'late' as const,
    color: '#fca5a5',
    label: 'اعمال لم تنفذ في الوقت المحدد حسب الجدول الزمني',
  },
  {
    status: 'on_time' as const,
    color: '#86efac',
    label: 'اعمال تم تنفيذها في الوقت المحدد حسب الجدول الزمني',
  },
  {
    status: 'not_due' as const,
    color: '#fde68a',
    label: 'اعمال لم يحين موعد تنفيذها حسب الجدول الزمني',
  },
];

export function statusCellColor(status: SupervisionProgressCell['status']): string {
  if (status === 'late') return '#fca5a5';
  if (status === 'on_time') return '#86efac';
  if (status === 'not_due') return '#fde68a';
  return 'transparent';
}
