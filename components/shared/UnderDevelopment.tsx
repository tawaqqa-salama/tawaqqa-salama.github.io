import { PLATFORM_NAME } from '@/lib/constants/branding';

interface UnderDevelopmentProps {
  title: string;
  description?: string;
  badge?: string;
}

export default function UnderDevelopment({
  title,
  description,
  badge = 'Under Development — قيد التطوير',
}: UnderDevelopmentProps) {
  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="text-center max-w-lg px-6">
        <div
          className="mx-auto mb-6 flex h-24 w-24 items-center justify-center rounded-3xl bg-gradient-to-br from-[var(--erp-page)] to-[#e8f0ec] text-[var(--erp-primary)] text-sm font-bold shadow-inner border border-[var(--erp-border)]"
          aria-hidden
        >
          قريباً
        </div>
        <h2 className="text-2xl font-bold text-[var(--erp-text)] mb-2">{title}</h2>
        <p className="text-[var(--erp-muted)] mb-6">
          {description || `هذا القسم قيد التطوير وسيتم إطلاقه قريباً ضمن ${PLATFORM_NAME}.`}
        </p>
        <span className="inline-flex items-center gap-2 rounded-lg bg-amber-50 border border-amber-100 px-4 py-2 text-sm font-semibold text-amber-800">
          {badge}
        </span>
      </div>
    </div>
  );
}
