'use client';

interface DonutChartProps {
  title: string;
  items: { label: string; value: number; color?: string }[];
}

const FALLBACK_COLORS = ['#1f4d3a', '#b8e986', '#6366f1', '#f59e0b', '#ec4899', '#14b8a6'];

export default function DonutChart({ title, items }: DonutChartProps) {
  const total = items.reduce((sum, item) => sum + item.value, 0) || 1;
  let cumulative = 0;

  const segments = items.map((item, index) => {
    const start = (cumulative / total) * 360;
    cumulative += item.value;
    const end = (cumulative / total) * 360;
    const color = item.color || FALLBACK_COLORS[index % FALLBACK_COLORS.length];
    return `${color} ${start}deg ${end}deg`;
  });

  const gradient = segments.length > 0 ? `conic-gradient(${segments.join(', ')})` : 'conic-gradient(#e5e7eb 0deg 360deg)';

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 h-full">
      <h3 className="font-bold text-gray-800 text-sm mb-4">{title}</h3>
      {items.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-12">لا توجد بيانات</p>
      ) : (
        <div className="flex flex-col sm:flex-row items-center gap-6">
          <div
            className="relative h-36 w-36 rounded-full shrink-0"
            style={{ background: gradient }}
          >
            <div className="absolute inset-5 bg-white rounded-full flex items-center justify-center">
              <div className="text-center">
                <p className="text-lg font-bold text-gray-800">{total}</p>
                <p className="text-[10px] text-gray-400">قيد</p>
              </div>
            </div>
          </div>
          <div className="flex-1 space-y-2 w-full">
            {items.map((item, index) => (
              <div key={item.label} className="flex items-center justify-between text-xs gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="h-2.5 w-2.5 rounded-full shrink-0"
                    style={{ background: item.color || FALLBACK_COLORS[index % FALLBACK_COLORS.length] }}
                  />
                  <span className="text-gray-600 truncate">{item.label}</span>
                </div>
                <span className="font-semibold text-gray-800 shrink-0">{item.value}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
