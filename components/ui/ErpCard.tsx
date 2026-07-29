interface ErpCardProps {
  title?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  padding?: boolean;
}

export default function ErpCard({ title, action, children, className = '', padding = true }: ErpCardProps) {
  return (
    <div className={`bg-white rounded-xl border border-gray-200 shadow-sm ${className}`}>
      {(title || action) && (
        <div className={`flex items-center justify-between border-b border-gray-100 ${padding ? 'px-5 py-4' : 'px-5 py-3'}`}>
          {title && <h3 className="font-bold text-gray-800 text-sm">{title}</h3>}
          {action}
        </div>
      )}
      <div className={padding ? 'p-5' : ''}>{children}</div>
    </div>
  );
}
