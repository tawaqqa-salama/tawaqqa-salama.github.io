export const ACTIVITY_ACTION_TYPES = [
  'LOGIN',
  'LOGOUT',
  'VIEW_PAGE',
  'CREATE',
  'UPDATE',
  'DELETE',
  'PRINT',
  'EXPORT',
  'ARCHIVE',
] as const;

export type ActivityActionType = (typeof ACTIVITY_ACTION_TYPES)[number];

export type ActivityLog = {
  id: string;
  user_id: string | null;
  user_name: string;
  user_role: string;
  action_type: ActivityActionType;
  page_url: string | null;
  module: string | null;
  details: string;
  ip_address: string | null;
  user_agent: string | null;
  metadata?: Record<string, unknown> | null;
  created_at: string;
};

export type LogActivityInput = {
  actionType: ActivityActionType;
  details: string;
  pageUrl?: string | null;
  module?: string | null;
  metadata?: Record<string, unknown>;
  /** يتجاوز جلسة التخزين المحلي عند الحاجة (مثل تسجيل الخروج) */
  actor?: {
    userId?: string | null;
    userName?: string | null;
    userRole?: string | null;
  } | null;
};
