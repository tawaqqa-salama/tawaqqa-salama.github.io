'use client';

import { useEffect, useState } from 'react';

export default function MarketingCrmFunnel() {
  const [data, setData] = useState<{
    leads_by_source?: Record<string, number>;
    funnel?: Record<string, number>;
  } | null>(null);

  useEffect(() => {
    void fetch('/api/integrations/marketing/funnel')
      .then((r) => r.json())
      .then((j) => {
        if (j.ok) setData(j);
      });
  }, []);

  if (!data) return null;

  const sources = Object.entries(data.leads_by_source || {}).filter(([, n]) => n > 0);

  return (
    <div className="rounded-xl border bg-white p-4 space-y-3" dir="rtl">
      <div>
        <h2 className="text-sm font-bold text-gray-900">Marketing → CRM</h2>
        <p className="text-xs text-gray-500 mt-1">عدد العملاء حسب المصدر حتى المشروع والإيراد</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {sources.length ? (
          sources.map(([source, n]) => (
            <div key={source} className="rounded-lg border px-3 py-2 text-xs">
              <span className="text-gray-500">{source}</span>
              <span className="font-bold ms-2">{n}</span>
            </div>
          ))
        ) : (
          <p className="text-xs text-gray-400">لا بيانات مصادر بعد.</p>
        )}
      </div>
      {data.funnel ? (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-center text-xs">
          {[
            ['Leads', data.funnel.leads],
            ['Opportunities', data.funnel.opportunities],
            ['Quotes', data.funnel.quotes],
            ['Won Projects', data.funnel.won_projects],
            ['Revenue', data.funnel.revenue],
          ].map(([label, value]) => (
            <div key={String(label)} className="rounded-lg bg-purple-50 p-2">
              <p className="text-purple-900/70">{label}</p>
              <p className="font-bold text-base text-purple-950">{value}</p>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
