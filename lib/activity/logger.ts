import { loadSession } from '@/lib/auth/session';
import { moduleFromPath } from '@/lib/activity/labels';
import type { ActivityLog, LogActivityInput } from '@/lib/activity/types';
import { isDemoMode, supabase } from '@/lib/supabase';

const LOCAL_KEY = 'tawaqqa_activity_logs_v1';
const MAX_LOCAL = 500;

let cachedIp: string | null | undefined;
let ipPromise: Promise<string | null> | null = null;
// The production schema does not expose activity_logs. Local audit remains the
// durable UI fallback; a deployment may opt in only after the relation exists.
const REMOTE_ACTIVITY_LOGS_ENABLED = process.env.NEXT_PUBLIC_ACTIVITY_LOGS_REMOTE === 'true';
// Production can intentionally omit the optional activity_logs table. Once the
// endpoint is confirmed unavailable, retain the local audit fallback and avoid
// adding repeat 404s to every initial page load.
let remoteActivityUnavailable = false;

function readLocalLogs(): ActivityLog[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    return raw ? (JSON.parse(raw) as ActivityLog[]) : [];
  } catch {
    return [];
  }
}

function writeLocalLogs(logs: ActivityLog[]) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(LOCAL_KEY, JSON.stringify(logs.slice(0, MAX_LOCAL)));
}

async function resolveIp(): Promise<string | null> {
  if (typeof window === 'undefined') return null;
  if (cachedIp !== undefined) return cachedIp;
  if (ipPromise) return ipPromise;

  ipPromise = (async () => {
    try {
      const controller = new AbortController();
      const timer = window.setTimeout(() => controller.abort(), 1500);
      const res = await fetch('https://api.ipify.org?format=json', {
        signal: controller.signal,
      });
      window.clearTimeout(timer);
      if (!res.ok) {
        cachedIp = null;
        return null;
      }
      const data = (await res.json()) as { ip?: string };
      cachedIp = data.ip || null;
      return cachedIp;
    } catch {
      cachedIp = null;
      return null;
    } finally {
      ipPromise = null;
    }
  })();

  return ipPromise;
}

function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `act-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * يسجّل نشاط مستخدم — فشل الكتابة لا يعطّل واجهة المستخدم.
 */
export async function logActivity(input: LogActivityInput): Promise<void> {
  if (typeof window === 'undefined') return;

  const session = loadSession();
  const actor = input.actor;
  const userId = actor?.userId ?? session?.userId ?? null;
  const userName = (actor?.userName ?? session?.fullName ?? session?.username ?? 'زائر').trim();
  const userRole = (actor?.userRole ?? session?.roleCode ?? '').trim();

  const pageUrl =
    input.pageUrl ??
    (typeof window !== 'undefined' ? `${window.location.pathname}${window.location.search}` : null);
  const moduleName = input.module ?? (pageUrl ? moduleFromPath(pageUrl.split('?')[0] || '/') : null);

  // Never wait for an external IP service before writing local audit state or
  // returning control to the page. A later event can reuse the cached value.
  const ip = cachedIp === undefined ? null : cachedIp;
  void resolveIp();
  const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : null;
  const createdAt = new Date().toISOString();

  const row = {
    id: newId(),
    user_id: userId,
    user_name: userName || 'زائر',
    user_role: userRole,
    action_type: input.actionType,
    page_url: pageUrl,
    module: moduleName,
    details: input.details.trim() || input.actionType,
    ip_address: ip,
    user_agent: userAgent,
    metadata: input.metadata || {},
    created_at: createdAt,
  };

  // نسخة محلية دائماً (عرض تجريبي / احتياطي)
  const local = readLocalLogs();
  local.unshift(row as ActivityLog);
  writeLocalLogs(local);

  if (isDemoMode) {
    try {
      await supabase.from('activity_logs').insert([row]);
    } catch {
      /* ignore */
    }
    return;
  }

  if (!REMOTE_ACTIVITY_LOGS_ENABLED || remoteActivityUnavailable) return;

  try {
    const { error } = await supabase.from('activity_logs').insert([
      {
        user_id: row.user_id,
        user_name: row.user_name,
        user_role: row.user_role,
        action_type: row.action_type,
        page_url: row.page_url,
        module: row.module,
        details: row.details,
        ip_address: row.ip_address,
        user_agent: row.user_agent,
        metadata: row.metadata,
        created_at: row.created_at,
      },
    ]);
    if (error) {
      // PostgREST uses 404 when the optional relation is absent from its schema.
      // Preserve the local copy and avoid repeatedly retrying an unavailable path.
      if (/404|relation .*activity_logs|schema cache/i.test(error.message)) {
        remoteActivityUnavailable = true;
        return;
      }
      console.warn('[activity_logs]', error.message);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error || '');
    if (/404|relation .*activity_logs|schema cache/i.test(message)) {
      remoteActivityUnavailable = true;
      return;
    }
    console.warn('[activity_logs]', error);
  }
}

export async function fetchActivityLogs(limit = 300): Promise<ActivityLog[]> {
  const local = readLocalLogs();

  if (isDemoMode) {
    const { data } = await supabase
      .from('activity_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);
    const remote = (data as ActivityLog[]) || [];
    const merged = new Map<string, ActivityLog>();
    for (const row of [...remote, ...local]) {
      if (row?.id) merged.set(row.id, row);
    }
    return Array.from(merged.values())
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
      .slice(0, limit);
  }

  const { data, error } = await supabase
    .from('activity_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error || !data) {
    return local.slice(0, limit);
  }

  return data as ActivityLog[];
}
