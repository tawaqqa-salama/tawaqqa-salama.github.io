import type {
  DiDesignTask,
  DiDesignWorkspace,
  DiLessonLearned,
  DiNotification,
  DiDesignChecklist,
  DiRevisionEntry,
  DiWorkspaceComment,
  DiWorkspaceAttachment,
} from '@/lib/design-intelligence/types';
import {
  buildDefaultDesignPlan,
  buildOccupancyChecklist,
  computeChecklistProgress,
  autoRescheduleTasks,
} from '@/lib/design-intelligence/planner';
import { isDemoMode, supabase } from '@/lib/supabase';

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

async function persistWorkspaceBundle(input: {
  workspace: DiDesignWorkspace;
  tasks: DiDesignTask[];
  checklist: DiDesignChecklist;
}) {
  if (isDemoMode) return;
  const { workspace, tasks, checklist } = input;
  await supabase.from('di_design_workspaces').upsert({
    id: workspace.id,
    client_id: workspace.client_id,
    project_name: workspace.project_name,
    summary: workspace.summary,
    requirements: workspace.requirements,
    building_info: workspace.building_info || {},
    risk_classification: workspace.risk_classification,
    occupancy: workspace.occupancy,
    building_height_m: workspace.building_height_m,
    floors_count: workspace.floors_count,
    area_m2: workspace.area_m2,
    fire_protection_scope: workspace.fire_protection_scope,
    applicable_codes: workspace.applicable_codes,
    engineering_notes: workspace.engineering_notes,
    uploaded_drawings: workspace.uploaded_drawings || [],
    calculation_files: workspace.calculation_files || [],
    rfis: workspace.rfis || [],
    client_comments: workspace.client_comments || [],
    revision_history: workspace.revision_history || [],
    status: workspace.status,
    updated_at: workspace.updated_at,
  });
  if (tasks.length) {
    await supabase.from('di_design_tasks').upsert(
      tasks.map((t) => ({
        id: t.id,
        workspace_id: t.workspace_id,
        title: t.title,
        owner_name: t.owner_name,
        start_date: t.start_date,
        end_date: t.end_date,
        priority: t.priority,
        depends_on: t.depends_on || [],
        progress_percent: t.progress_percent,
        status: t.status,
        estimated_hours: t.estimated_hours,
        actual_hours: t.actual_hours,
        sort_order: t.sort_order,
        is_critical: !!t.is_critical,
        updated_at: new Date().toISOString(),
      }))
    );
  }
  await supabase.from('di_design_checklists').upsert({
    id: checklist.id,
    workspace_id: checklist.workspace_id,
    title: checklist.title,
    items: checklist.items,
    completion_percent: checklist.completion_percent,
    updated_at: new Date().toISOString(),
  });
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
  heightM?: number | null;
  buildingType?: string;
  ownerName?: string;
  risk?: string;
}): { workspace: DiDesignWorkspace; tasks: DiDesignTask[]; checklist: DiDesignChecklist } {
  const id = uid('ws');
  const now = new Date().toISOString();
  const rev: DiRevisionEntry = {
    id: uid('rev'),
    revision: 'A',
    summary: 'Workspace created — design plan generated',
    author: input.ownerName || 'System',
    created_at: now,
  };
  const workspace: DiDesignWorkspace = {
    id,
    client_id: input.clientId || null,
    project_name: input.projectName,
    summary: `Design workspace for ${input.projectName}`,
    requirements: '',
    building_info: {
      building_type: input.buildingType || '',
      environment: '',
      location: '',
    },
    risk_classification: input.risk || '',
    occupancy: input.occupancy || '',
    building_height_m: input.heightM ?? null,
    floors_count: input.floors ?? null,
    area_m2: input.areaM2 ?? null,
    fire_protection_scope: 'Alarm + Suppression + Life Safety',
    applicable_codes: ['SBC 801', 'NFPA 13', 'NFPA 72', 'Civil Defense'],
    engineering_notes: '',
    uploaded_drawings: [],
    calculation_files: [],
    rfis: [],
    client_comments: [],
    revision_history: [rev],
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
    hazard: input.risk,
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

  void persistWorkspaceBundle({ workspace, tasks, checklist });
  void import('@/lib/activity/logger').then(({ logActivity }) =>
    logActivity({
      actionType: 'CREATE',
      module: 'design',
      details: `Design workspace created: ${workspace.project_name}`,
      metadata: { workspaceId: id, taskCount: tasks.length },
    })
  );

  return { workspace, tasks, checklist };
}

export function updateWorkspace(workspace: DiDesignWorkspace) {
  const next = { ...workspace, updated_at: new Date().toISOString() };
  write(
    WS_KEY,
    listWorkspaces().map((w) => (w.id === next.id ? next : w))
  );
  if (!isDemoMode) {
    void supabase.from('di_design_workspaces').upsert({
      id: next.id,
      client_id: next.client_id,
      project_name: next.project_name,
      summary: next.summary,
      requirements: next.requirements,
      building_info: next.building_info || {},
      risk_classification: next.risk_classification,
      occupancy: next.occupancy,
      building_height_m: next.building_height_m,
      floors_count: next.floors_count,
      area_m2: next.area_m2,
      fire_protection_scope: next.fire_protection_scope,
      applicable_codes: next.applicable_codes,
      engineering_notes: next.engineering_notes,
      uploaded_drawings: next.uploaded_drawings || [],
      calculation_files: next.calculation_files || [],
      rfis: next.rfis || [],
      client_comments: next.client_comments || [],
      revision_history: next.revision_history || [],
      status: next.status,
      updated_at: next.updated_at,
    });
  }
  return next;
}

export function addWorkspaceNote(
  workspaceId: string,
  kind: 'rfi' | 'client_comment' | 'drawing' | 'calculation',
  payload: { author?: string; body?: string; name?: string; note?: string }
) {
  const ws = listWorkspaces().find((w) => w.id === workspaceId);
  if (!ws) return null;
  const now = new Date().toISOString();
  if (kind === 'rfi' || kind === 'client_comment') {
    const row: DiWorkspaceComment = {
      id: uid(kind),
      author: payload.author || 'Engineer',
      body: payload.body || '',
      created_at: now,
    };
    if (kind === 'rfi') ws.rfis = [row, ...(ws.rfis || [])];
    else ws.client_comments = [row, ...(ws.client_comments || [])];
    pushNotification({
      kind: kind === 'rfi' ? 'rfi_added' : 'client_comment_added',
      title: kind === 'rfi' ? 'RFI added' : 'Client comment added',
      body: row.body.slice(0, 120),
      severity: 'info',
      workspace_id: workspaceId,
    });
  } else {
    const att: DiWorkspaceAttachment = {
      id: uid(kind),
      name: payload.name || 'file',
      kind,
      note: payload.note,
      created_at: now,
    };
    if (kind === 'drawing') ws.uploaded_drawings = [att, ...(ws.uploaded_drawings || [])];
    else ws.calculation_files = [att, ...(ws.calculation_files || [])];
    if (kind === 'calculation') {
      pushNotification({
        kind: 'calculation_uploaded',
        title: 'Calculation file added',
        body: att.name,
        severity: 'info',
        workspace_id: workspaceId,
      });
    }
  }
  return updateWorkspace(ws);
}

export function updateTask(task: DiDesignTask) {
  const all = listTasks().map((t) => (t.id === task.id ? task : t));
  write(TASKS_KEY, all);
  if (!isDemoMode) {
    void supabase.from('di_design_tasks').upsert({
      id: task.id,
      workspace_id: task.workspace_id,
      title: task.title,
      owner_name: task.owner_name,
      start_date: task.start_date,
      end_date: task.end_date,
      priority: task.priority,
      depends_on: task.depends_on || [],
      progress_percent: task.progress_percent,
      status: task.status,
      estimated_hours: task.estimated_hours,
      actual_hours: task.actual_hours,
      sort_order: task.sort_order,
      is_critical: !!task.is_critical,
      updated_at: new Date().toISOString(),
    });
  }
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
  if (task.status === 'pending' && /hydraulic|حساب/i.test(task.title) && task.end_date) {
    const today = new Date().toISOString().slice(0, 10);
    if (task.end_date < today) {
      pushNotification({
        kind: 'hydraulic_overdue',
        title: 'Hydraulic calculation overdue',
        body: task.title,
        severity: 'warn',
        workspace_id: task.workspace_id,
      });
    }
  }
}

export function rescheduleWorkspaceTasks(workspaceId: string): DiDesignTask[] {
  const scoped = listTasks(workspaceId);
  const next = autoRescheduleTasks(scoped);
  const others = listTasks().filter((t) => t.workspace_id !== workspaceId);
  write(TASKS_KEY, [...next, ...others]);
  next.forEach((t) => updateTask(t));
  pushNotification({
    kind: 'reschedule',
    title: 'Timeline auto-rescheduled',
    body: `${next.length} tasks recalculated (dependencies + delays).`,
    severity: 'info',
    workspace_id: workspaceId,
  });
  return next;
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
  if (!isDemoMode) {
    void supabase.from('di_design_checklists').upsert({
      id: next.id,
      workspace_id: next.workspace_id,
      title: next.title,
      items: next.items,
      completion_percent: next.completion_percent,
      updated_at: new Date().toISOString(),
    });
  }
  return next;
}

export function addLesson(lesson: Omit<DiLessonLearned, 'id' | 'created_at'>) {
  const row: DiLessonLearned = {
    ...lesson,
    id: uid('lesson'),
    created_at: new Date().toISOString(),
  };
  write(LESSONS_KEY, [row, ...listLessons()]);
  if (!isDemoMode) {
    void supabase.from('di_lessons_learned').insert({
      id: row.id,
      workspace_id: row.workspace_id,
      client_id: row.client_id,
      problems: row.problems,
      solutions: row.solutions,
      engineer_notes: row.engineer_notes,
      recommendations: row.recommendations,
      created_at: row.created_at,
    });
  }
  void import('@/lib/activity/logger').then(({ logActivity }) =>
    logActivity({
      actionType: 'CREATE',
      module: 'design',
      details: 'Lesson learned captured',
      metadata: { lessonId: row.id },
    })
  );
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
  if (!isDemoMode) {
    void supabase.from('di_notifications').insert({
      id: row.id,
      workspace_id: row.workspace_id,
      kind: row.kind,
      title: row.title,
      body: row.body,
      severity: row.severity,
      is_read: false,
      created_at: row.created_at,
    });
  }
  return row;
}

export function markNotificationRead(id: string) {
  write(
    NOTIF_KEY,
    listNotifications().map((n) => (n.id === id ? { ...n, is_read: true } : n))
  );
  if (!isDemoMode) {
    void supabase.from('di_notifications').update({ is_read: true }).eq('id', id);
  }
}

export function seedSmartNotifications(workspaceId?: string) {
  const samples = [
    { kind: 'nfpa_revision', title: 'NFPA revision changed', body: 'Review indexed NFPA documents for superseded revisions.', severity: 'warn' },
    { kind: 'code_updated', title: 'Code updated', body: 'SBC / Civil Defense references may need re-indexing.', severity: 'info' },
    { kind: 'drawing_pending', title: 'Drawing pending review', body: 'Uploaded drawings awaiting Drawing Review AI.', severity: 'warn' },
    { kind: 'calculation_missing', title: 'Calculation missing', body: 'Hydraulic calculation task has no attached calc file.', severity: 'warn' },
    { kind: 'submission_deadline', title: 'Submission deadline', body: 'Submit / Approval milestones approaching.', severity: 'critical' },
  ];
  samples.forEach((s) =>
    pushNotification({
      ...s,
      workspace_id: workspaceId,
    })
  );
}

export function analyticsSnapshot() {
  const workspaces = listWorkspaces();
  const tasks = listTasks();
  const lessons = listLessons();
  const docs = (() => {
    try {
      return JSON.parse(localStorage.getItem('tawaqqa_di_knowledge_docs_v1') || '[]') as { applicable_codes?: string[] }[];
    } catch {
      return [];
    }
  })();
  const doneTasks = tasks.filter((t) => t.status === 'done' || t.progress_percent >= 100);
  const est = tasks.reduce((s, t) => s + (Number(t.estimated_hours) || 0), 0);
  const act = tasks.reduce((s, t) => s + (Number(t.actual_hours) || 0), 0);
  const codeHits = new Map<string, number>();
  docs.forEach((d) => (d.applicable_codes || []).forEach((c) => codeHits.set(c, (codeHits.get(c) || 0) + 1)));
  const mostUsedCodes = Array.from(codeHits.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([code, count]) => ({ code, count }));

  return {
    workspaceCount: workspaces.length,
    taskCount: tasks.length,
    completionRate: tasks.length ? Math.round((doneTasks.length / tasks.length) * 100) : 0,
    avgDesignHours: workspaces.length ? Math.round(est / Math.max(workspaces.length, 1)) : 0,
    actualHours: act,
    lessonsCount: lessons.length,
    unreadNotifications: listNotifications().filter((n) => !n.is_read).length,
    mostUsedCodes,
    engineerProductivity: est ? Math.round((doneTasks.length / Math.max(tasks.length, 1)) * 100) : 0,
    designAccuracy: lessons.length ? Math.max(0, 100 - lessons.length * 5) : 100,
  };
}
