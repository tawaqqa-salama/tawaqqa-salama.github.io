'use client';

import { useEffect, useState } from 'react';

type Stats = {
  newLeads: number;
  openConversations: number;
  unreadMessages: number;
  avgResponseMinutes: number | null;
  conversionRate: number;
  quotesGenerated: number;
  projectsWon: number;
};

export default function WhatsAppDashboardCards() {
  const [range, setRange] = useState<'today' | '7d' | '30d'>('30d');
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    void fetch(`/api/integrations/whatsapp/stats?range=${range}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) setStats(d.stats);
      });
  }, [range]);

  const cards = [
    { label: 'عملاء واتساب جدد', value: stats?.newLeads ?? '—' },
    { label: 'محادثات مفتوحة', value: stats?.openConversations ?? '—' },
    { label: 'رسائل غير مقروءة', value: stats?.unreadMessages ?? '—' },
    {
      label: 'زمن الاستجابة (د)',
      value: stats?.avgResponseMinutes == null ? '—' : stats.avgResponseMinutes,
    },
    { label: 'معدل التحويل %', value: stats?.conversionRate ?? '—' },
    { label: 'عروض أسعار', value: stats?.quotesGenerated ?? '—' },
    { label: 'مشاريع مكتسبة', value: stats?.projectsWon ?? '—' },
  ];

  return (
    <div className="space-y-3" dir="rtl">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-gray-900">واتساب</h3>
        <div className="flex gap-1">
          {(
            [
              ['today', 'اليوم'],
              ['7d', '7 أيام'],
              ['30d', '30 يوم'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setRange(id)}
              className={`text-[11px] px-2 py-1 rounded-lg border ${
                range === id ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2">
        {cards.map((c) => (
          <div key={c.label} className="rounded-xl border bg-white p-3">
            <p className="text-[10px] text-gray-500">{c.label}</p>
            <p className="text-xl font-bold text-gray-900 mt-1">{c.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
