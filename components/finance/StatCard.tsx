interface StatCardProps {
  label: string;
  value: number | string;
  icon: string;
  accent?: 'blue' | 'emerald' | 'amber' | 'purple';
}

const accentClasses = {
  blue: 'from-blue-50 to-blue-100 text-blue-700 border-blue-100',
  emerald: 'from-emerald-50 to-emerald-100 text-emerald-700 border-emerald-100',
  amber: 'from-amber-50 to-amber-100 text-amber-800 border-amber-100',
  purple: 'from-purple-50 to-purple-100 text-purple-700 border-purple-100',
};

export default function StatCard({ label, value, icon, accent = 'blue' }: StatCardProps) {
  return (
    <div className={`rounded-2xl border bg-gradient-to-l p-5 ${accentClasses[accent]}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm opacity-80 mb-1">{label}</p>
          <p className="text-3xl font-bold">{value}</p>
        </div>
        <span className="text-2xl">{icon}</span>
      </div>
    </div>
  );
}
