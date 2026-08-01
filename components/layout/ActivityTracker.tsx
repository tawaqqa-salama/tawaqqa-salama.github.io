'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth/AuthProvider';
import { logActivity } from '@/lib/activity/logger';
import { moduleFromPath, pageTitleFromPath } from '@/lib/activity/labels';

/** يتتبع تنقّل الصفحات ويسجّل VIEW_PAGE */
export default function ActivityTracker() {
  const pathname = usePathname();
  const { session, loading } = useAuth();
  const lastPath = useRef<string | null>(null);

  useEffect(() => {
    if (loading || !session) return;
    if (!pathname || pathname.startsWith('/login')) return;
    if (lastPath.current === pathname) return;
    lastPath.current = pathname;

    const title = pageTitleFromPath(pathname);
    void logActivity({
      actionType: 'VIEW_PAGE',
      pageUrl: pathname,
      module: moduleFromPath(pathname),
      details: `قام بفتح صفحة ${title}`,
      metadata: { title },
    });
  }, [pathname, session, loading]);

  return null;
}
