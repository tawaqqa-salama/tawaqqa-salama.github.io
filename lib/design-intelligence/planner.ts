import { explainEngineeringDecisions } from '@/lib/design-intelligence/decision-engine';
import { recommendFromRules } from '@/lib/design-intelligence/rules-engine';
import type { EngineeringSelection } from '@/lib/design-intelligence/rules-types';
import type { DiDesignTask, DiChecklistItem, EngineeringSuggestion } from '@/lib/design-intelligence/types';
import { DESIGN_PLANNER_STEPS } from '@/lib/design-intelligence/types';

function uid(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function addDays(iso: string, days: number): string {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Auto design plan after project creation — TEEM-style pipeline */
export function buildDefaultDesignPlan(opts?: {
  startDate?: string;
  ownerName?: string;
}): DiDesignTask[] {
  const start = opts?.startDate || new Date().toISOString().slice(0, 10);
  const owner = opts?.ownerName || '';
  const hours = [4, 8, 6, 4, 4, 16, 20, 12, 10, 8, 12, 8, 10, 4, 4];
  const span = [2, 3, 2, 2, 2, 5, 7, 4, 4, 3, 4, 3, 4, 2, 3];

  let cursor = start;
  const tasks: DiDesignTask[] = [];
  let prevId: string | undefined;

  DESIGN_PLANNER_STEPS.forEach((title, i) => {
    const id = uid('task');
    const end = addDays(cursor, span[i] || 2);
    tasks.push({
      id,
      workspace_id: '',
      title,
      owner_name: owner,
      start_date: cursor,
      end_date: end,
      priority: i < 3 ? 'high' : i > 12 ? 'high' : 'medium',
      depends_on: prevId ? [prevId] : [],
      progress_percent: 0,
      status: 'pending',
      estimated_hours: hours[i] || 4,
      actual_hours: 0,
      sort_order: i + 1,
      is_critical: true, // linear pipeline — all on critical path by default
    });
    prevId = id;
    cursor = end;
  });

  return markCriticalPath(tasks);
}

export function buildOccupancyChecklist(input: {
  buildingType?: string;
  occupancy?: string;
  hazard?: string;
  codes?: string[];
  selection?: EngineeringSelection;
}): { title: string; items: DiChecklistItem[] } {
  const codes = input.codes?.length ? input.codes : ['SBC 801', 'NFPA 13', 'NFPA 72'];

  // Prefer checklist items locked by Engineering Rules Engine
  const fromRules = recommendFromRules({
    building_type: input.buildingType || input.selection?.building_type || null,
    occupancy: input.occupancy || input.selection?.occupancy || null,
    risk_classification: input.hazard || input.selection?.risk_classification || null,
    applicable_codes: input.codes || input.selection?.applicable_codes || null,
    ...input.selection,
  }).recommendations.find((r) => r.field_key === 'required_checklists');

  if (fromRules?.locked_value && Array.isArray(fromRules.locked_value) && fromRules.locked_value.length) {
    return {
      title: `Design checklist — ${input.occupancy || input.buildingType || 'Project'} (rules)`,
      items: fromRules.locked_value.map((label) => ({
        id: uid('ck'),
        label,
        checked: false,
        code_ref: fromRules.code_refs[0] || codes[0],
      })),
    };
  }

  const items: DiChecklistItem[] = [
    { id: uid('ck'), label: 'Confirm occupancy classification', checked: false, code_ref: 'SBC 801' },
    { id: uid('ck'), label: 'Confirm hazard classification', checked: false, code_ref: codes[0] },
    { id: uid('ck'), label: 'Verify travel distance to exits', checked: false, code_ref: 'SBC 801' },
    { id: uid('ck'), label: 'Fire alarm system scope defined', checked: false, code_ref: 'NFPA 72' },
    { id: uid('ck'), label: 'Sprinkler / suppression scope defined', checked: false, code_ref: 'NFPA 13' },
    { id: uid('ck'), label: 'Pump room & tank requirements reviewed', checked: false, code_ref: 'NFPA 20' },
    { id: uid('ck'), label: 'Civil Defense submission package listed', checked: false, code_ref: 'Civil Defense' },
    { id: uid('ck'), label: 'BOQ aligned with design drawings', checked: false, code_ref: 'Company Standards' },
  ];
  if (/industrial|مصنع|warehouse|مستودع/i.test(`${input.buildingType} ${input.occupancy}`)) {
    items.push({
      id: uid('ck'),
      label: 'Extra-hazard / storage commodity classification',
      checked: false,
      code_ref: 'NFPA 13',
    });
  }
  if (/high.?rise|مرتفع/i.test(`${input.buildingType} ${input.hazard}`)) {
    items.push({
      id: uid('ck'),
      label: 'High-rise fire protection special requirements',
      checked: false,
      code_ref: 'SBC 801',
    });
  }
  return {
    title: `Design checklist — ${input.occupancy || input.buildingType || 'Project'}`,
    items,
  };
}

/**
 * Decision Engine feed for the Smart Assistant tab.
 * Surfaces locked / auto-selected / blocked fields with reasons — not free suggestions.
 * Densities, pump L/min, and tank m³ come only from the Rules Engine.
 */
export function suggestEngineeringSystems(input: {
  buildingType?: string;
  occupancy?: string;
  risk?: string;
  heightM?: number | null;
  areaM2?: number | null;
  floors?: number | null;
  codes?: string[];
  selection?: EngineeringSelection;
}): EngineeringSuggestion[] {
  const selection: EngineeringSelection = {
    ...(input.selection || {}),
    building_type: input.selection?.building_type ?? input.buildingType ?? null,
    occupancy: input.selection?.occupancy ?? input.occupancy ?? null,
    risk_classification: input.selection?.risk_classification ?? input.risk ?? null,
    applicable_codes: input.selection?.applicable_codes ?? input.codes ?? null,
  };

  const { decisions, assertion, note_en } = explainEngineeringDecisions(selection);
  const out: EngineeringSuggestion[] = [
    {
      id: 'decision-engine',
      title: 'Engineering Decision Engine (active controller)',
      detail: note_en,
      severity: assertion.ok ? 'info' : 'critical',
      code_refs: ['SBC 801', 'NFPA 13', 'Civil Defense', 'Company Standards'],
    },
  ];

  if (!assertion.ok) {
    out.push({
      id: 'decision-gate',
      title: 'Decision gate closed — workflow blocked',
      detail: assertion.summary_en,
      severity: 'critical',
      code_refs: assertion.blockingViolations.flatMap((v) => v.code_refs),
    });
    for (const v of assertion.blockingViolations) {
      out.push({
        id: `violation-${v.field_key}`,
        title: `Blocked: ${v.field_key}`,
        detail: v.message,
        severity: 'critical',
        code_refs: v.code_refs,
      });
    }
  }

  for (const d of decisions) {
    if (d.control_mode === 'locked' || d.control_mode === 'computed') {
      out.push({
        id: `lock-${d.field_key}`,
        title: d.label_en,
        detail: `Locked / computed: ${
          Array.isArray(d.value) ? d.value.join(', ') : d.value ?? '—'
        }. ${d.reason_en}`,
        severity: /pump|tank|density|demand/i.test(d.field_key) ? 'warn' : 'info',
        code_refs: d.code_refs,
      });
    } else if (d.control_mode === 'auto_selected') {
      out.push({
        id: `auto-${d.field_key}`,
        title: d.label_en,
        detail: `Auto-selected by Decision Engine: ${
          Array.isArray(d.value) ? d.value.join(', ') : d.value ?? '—'
        }. ${d.reason_en}`,
        severity: 'info',
        code_refs: d.code_refs,
      });
    } else if (d.valid_options.length) {
      out.push({
        id: `opt-${d.field_key}`,
        title: `${d.label_en} — compliant options only`,
        detail: `${d.valid_options.map((o) => o.label_en).join(' · ')}. ${d.reason_en}`,
        severity: 'info',
        code_refs: d.code_refs,
      });
    }
  }

  const missingMeta: string[] = [];
  if (!input.areaM2) missingMeta.push('Area (m²)');
  if (!input.floors) missingMeta.push('Number of floors');
  if (missingMeta.length) {
    out.push({
      id: 'workspace-meta',
      title: 'Workspace metadata incomplete',
      detail: `Provide in Design Workspace (does not invent engineering values): ${missingMeta.join(', ')}.`,
      severity: 'warn',
      code_refs: [],
    });
  }

  const area = Number(input.areaM2) || 0;
  const height = Number(input.heightM) || 0;
  if (area >= 1000 || height >= 18) {
    out.push({
      id: 'scale-note',
      title: 'Project scale note',
      detail:
        'Large area / height — confirm Decision Engine pump & tank locked bands against the hydraulic calculation sheet (do not invent L/min or m³).',
      severity: 'warn',
      code_refs: ['NFPA 20', 'NFPA 22'],
    });
  }

  return out;
}

export function computeChecklistProgress(items: DiChecklistItem[]): number {
  if (!items.length) return 0;
  const done = items.filter((i) => i.checked).length;
  return Math.round((done / items.length) * 100);
}

export function timelineHealth(tasks: DiDesignTask[]) {
  const today = new Date().toISOString().slice(0, 10);
  const delayed = tasks.filter(
    (t) => t.status !== 'done' && t.end_date && t.end_date < today && (t.progress_percent || 0) < 100
  );
  const upcoming = tasks
    .filter((t) => t.start_date && t.start_date >= today && t.status !== 'done')
    .slice(0, 5);
  const critical = tasks.filter(
    (t) => (t.is_critical || t.priority === 'high') && t.status !== 'done'
  );
  return { delayed, upcoming, critical };
}

/** Mark dependency chain as critical path (longest unfinished chain). */
export function markCriticalPath(tasks: DiDesignTask[]): DiDesignTask[] {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const depth = new Map<string, number>();

  const compute = (id: string, visiting = new Set<string>()): number => {
    if (depth.has(id)) return depth.get(id)!;
    if (visiting.has(id)) return 0;
    visiting.add(id);
    const task = byId.get(id);
    if (!task) return 0;
    const deps = task.depends_on || [];
    const parent = deps.reduce((max, depId) => Math.max(max, compute(depId, visiting)), 0);
    const value = parent + (task.status === 'done' ? 0 : 1);
    depth.set(id, value);
    visiting.delete(id);
    return value;
  };

  tasks.forEach((t) => compute(t.id));
  const maxDepth = Math.max(0, ...Array.from(depth.values()));
  return tasks.map((t) => ({
    ...t,
    is_critical: (depth.get(t.id) || 0) === maxDepth && maxDepth > 0,
  }));
}

/**
 * Automatic rescheduling: push dependent tasks forward when predecessors slip.
 * Returns a new task list with updated dates.
 */
export function autoRescheduleTasks(tasks: DiDesignTask[], today = new Date().toISOString().slice(0, 10)): DiDesignTask[] {
  const sorted = [...tasks].sort((a, b) => a.sort_order - b.sort_order);
  const byId = new Map(sorted.map((t) => [t.id, { ...t }]));

  for (const task of sorted) {
    const current = byId.get(task.id)!;
    if (current.status === 'done') continue;

    let minStart = current.start_date || today;
    for (const depId of current.depends_on || []) {
      const dep = byId.get(depId);
      if (dep?.end_date && dep.end_date > minStart) minStart = dep.end_date;
    }
    if (current.end_date && current.end_date < today && (current.progress_percent || 0) < 100) {
      // delayed open task — start from today
      minStart = today > minStart ? today : minStart;
    }

    const spanDays = Math.max(
      1,
      Math.round(
        (new Date(current.end_date || minStart).getTime() - new Date(current.start_date || minStart).getTime()) /
          86400000
      ) || 2
    );
    current.start_date = minStart;
    current.end_date = addDays(minStart, spanDays);
    byId.set(task.id, current);
  }

  return markCriticalPath(Array.from(byId.values()).sort((a, b) => a.sort_order - b.sort_order));
}
