import type {
  DiDesignTask,
  DiDesignWorkspace,
  DiLessonLearned,
  DiNotification,
  DiDesignChecklist,
} from '@/lib/design-intelligence/types';
import { buildDefaultDesignPlan, buildOccupancyChecklist, computeChecklistProgress } from '@/lib/design-intelligence/planner';

const WS_KEY = 'tawaqqa_di_workspaces_v1';
const TASKS_KEY = 'tawaqqa_di_tasks_v1';
const CHECK_KEY = 'tawaqqa_di_checklists_v1';
const LESSONS_KEY = 'tawaqqa_di_lessons_v1';
const NOTIF_KEY = 'tawaqqa_di_notifications_v1';

function read<T>(key: string): T[] {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem(key) || '[]') as T[];
  } catch {
    return [];
  }
}

function write<T>(key: string, rows: T[]) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(key, JSON.stringify(rows.slice(0, 500)));
}

function uid(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function listWorkspaces(): DiDesignWorkspace[] {
  return read<DiDesignWorkspace>(WS_KEY);
}

export function listTasks(workspaceId?: string): DiDesignTask[] {
  const all = read<DiDesignTask>(TASKS_KEY);
  return workspaceId ? all.filter((t) => t.workspace_id === workspaceId) : all;
}

export function listChecklists(workspaceId?: string): DiDesignChecklist[] {
  const all = read<DiDesignChecklist>(CHECK_KEY);
  return workspaceId ? all.filter((c) => c.workspace_id === workspaceId) : all;
}

export function listLessons(): DiLessonLearned[] {
  return read<DiLessonLearned>(LESSONS_KEY);
}

export function listNotifications(): DiNotification[] {
  return read<DiNotification>(NOTIF_KEY).sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export function createWorkspaceFromClient(input: {
  clientId?: string;
  projectName: string;
  occupancy?: string;
  areaM2?: number | null;
  floors?: number | null;
  buildingType?: string;
  ownerName?: string;
}): { workspace: DiDesignWorkspace; tasks: DiDesignTask[]; checklist: DiDesignChecklist } {
  const id = uid('ws');
  const now = new Date().toISOString();
  const workspace: DiDesignWorkspace = {
    id,
    client_id: input.clientId || null,
    project_name: input.projectName,
    summary: `Design workspace for ${input.projectName}`,
    requirements: '',
    building_info: {
      building_type: input.buildingType || '',
    },
    risk_classification: '',
    occupancy: input.occupancy || '',
    building_height_m: null,
    floors_count: input.floors ?? null,
    area_m2: input.areaM2 ?? null,
    fire_protection_scope: 'Alarm + Suppression + Life Safety',
    applicable_codes: ['SBC 801', 'NFPA 13', 'NFPA 72'],
    engineering_notes: '',
    status: 'active',
    created_at: now,
    updated_at: now,
  };

  const tasks = buildDefaultDesignPlan({ ownerName: input.ownerName }).map((t) => ({
    ...t,
    workspace_id: id,
  }));

  const built = buildOccupancyChecklist({
    buildingType: input.buildingType,
    occupancy: input.occupancy,
    codes: workspace.applicable_codes,
  });
  const checklist: DiDesignChecklist = {
    id: uid('cl'),
    workspace_id: id,
    title: built.title,
    items: built.items,
    completion_percent: 0,
  };

  write(WS_KEY, [workspace, ...listWorkspaces()]);
  write(TASKS_KEY, [...tasks, ...listTasks()]);
  write(CHECK_KEY, [checklist, ...listChecklists()]);

  pushNotification({
    kind: 'project_created',
    title: 'Project design workspace created',
    body: `${workspace.project_name} — design plan generated (${tasks.length} tasks).`,
    severity: 'info',
    workspace_id: id,
  });

  return { workspace, tasks, checklist };
}

export function updateTask(task: DiDesignTask) {
  const all = listTasks().map((t) => (t.id === task.id ? task : t));
  write(TASKS_KEY, all);
  if (task.end_date && task.progress_percent < 100) {
    const today = new Date().toISOString().slice(0, 10);
    if (task.end_date < today) {
      pushNotification({
        kind: 'project_delayed',
        title: 'Project delayed',
        body: `Task «${task.title}» is past due.`,
        severity: 'warn',
        workspace_id: task.workspace_id,
      });
    }
  }
}

export function saveChecklist(checklist: DiDesignChecklist) {
  const next = {
    ...checklist,
    completion_percent: computeChecklistProgress(checklist.items),
  };
  write(
    CHECK_KEY,
    listChecklists().map((c) => (c.id === next.id ? next : c))
  );
  return next;
}

export function addLesson(lesson: Omit<DiLessonLearned, 'id' | 'created_at'>) {
  const row: DiLessonLearned = {
    ...lesson,
    id: uid('lesson'),
    created_at: new Date().toISOString(),
  };
  write(LESSONS_KEY, [row, ...listLessons()]);
  return row;
}

export function pushNotification(input: {
  kind: string;
  title: string;
  body?: string;
  severity?: string;
  workspace_id?: string;
}) {
  const row: DiNotification = {
    id: uid('ntf'),
    workspace_id: input.workspace_id || null,
    kind: input.kind,
    title: input.title,
    body: input.body || null,
    severity: input.severity || 'info',
    is_read: false,
    created_at: new Date().toISOString(),
  };
  write(NOTIF_KEY, [row, ...listNotifications()].slice(0, 100));
  return row;
}

export function markNotificationRead(id: string) {
  write(
    NOTIF_KEY,
    listNotifications().map((n) => (n.id === id ? { ...n, is_read: true } : n))
  );
}

export function analyticsSnapshot() {
  const workspaces = listWorkspaces();
  const tasks = listTasks();
  const lessons = listLessons();
  const doneTasks = tasks.filter((t) => t.status === 'done' || t.progress_percent >= 100);
  const est = tasks.reduce((s, t) => s + (Number(t.estimated_hours) || 0), 0);
  const act = tasks.reduce((s, t) => s + (Number(t.actual_hours) || 0), 0);
  return {
    workspaceCount: workspaces.length,
    taskCount: tasks.length,
    completionRate: tasks.length ? Math.round((doneTasks.length / tasks.length) * 100) : 0,
    avgDesignHours: workspaces.length ? Math.round(est / Math.max(workspaces.length, 1)) : 0,
    actualHours: act,
    lessonsCount: lessons.length,
    unreadNotifications: listNotifications().filter((n) => !n.is_read).length,
  };
}
