'use client';

import { useEffect, useState } from 'react';

type Props = { customerId: string };

export default function CustomerSocialTimeline({ customerId }: Props) {
  const [events, setEvents] = useState<
    Array<{
      id: string;
      title: string;
      body?: string | null;
      channel?: string | null;
      event_type?: string;
      occurred_at: string;
    }>
  >([]);

  useEffect(() => {
    void (async () => {
      const res = await fetch(
        `/api/integrations/marketing/timeline?customerId=${encodeURIComponent(customerId)}`
      ).then((r) => r.json());
      if (res.ok) setEvents(res.events || []);
    })();
  }, [customerId]);

  return (
    <section className="rounded-xl border bg-white p-4 space-y-3" dir="rtl">
      <h3 className="text-sm font-bold text-gray-900">Social Media Activity</h3>
      <p className="text-[11px] text-gray-500">
        WhatsApp · Instagram · Facebook · LinkedIn · Website · Campaigns — جدول زمني موحّد لرحلة العميل
      </p>
      {!events.length ? (
        <p className="text-xs text-gray-500">لا أحداث مسجّلة بعد لهذا العميل.</p>
      ) : (
        <ol className="relative border-s border-gray-200 ms-2 space-y-3">
          {events.map((e) => (
            <li key={e.id} className="ms-4">
              <span className="absolute -start-1.5 mt-1.5 h-3 w-3 rounded-full bg-teal-600" />
              <div className="flex flex-wrap justify-between gap-2 text-xs">
                <span className="font-semibold text-gray-900">{e.title}</span>
                <span className="text-gray-400 isolate-ltr">
                  {e.occurred_at ? new Date(e.occurred_at).toLocaleDateString('ar-SA') : '—'}
                </span>
              </div>
              <p className="text-[11px] text-gray-500 mt-0.5">
                {e.channel || e.event_type || '—'}
              </p>
              {e.body ? <p className="text-xs text-gray-600 mt-1">{e.body}</p> : null}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
