interface OmniStatCardProps {
  label: string;
  value: number | string;
  icon: string;
  iconBg: string;
}

export default function OmniStatCard({ label, value, icon, iconBg }: OmniStatCardProps) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex items-center justify-between gap-3">
      <div>
        <p className="text-xs text-gray-500 mb-1">{label}</p>
        <p className="text-2xl font-bold text-gray-900">{value}</p>
      </div>
      <div className={`h-12 w-12 rounded-xl flex items-center justify-center text-xl ${iconBg}`}>
        {icon}
      </div>
    </div>
  );
}
