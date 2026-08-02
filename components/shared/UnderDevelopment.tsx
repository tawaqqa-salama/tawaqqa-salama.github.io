import Link from 'next/link';
import { PLATFORM_NAME } from '@/lib/constants/branding';

interface UnderDevelopmentProps {
  title: string;
  description?: string;
  /** مسار بديل للانتقال بدل شاشة الانتظار */
  href?: string;
  linkLabel?: string;
}

/**
 * مكوّن احتياطي قديم — المنصة لم تعد تعرض شاشات «قيد التطوير».
 * إن وُجد مسار، يوجّه المستخدم مباشرة للواجهة التشغيلية.
 */
export default function UnderDevelopment({
  title,
  description,
  href = '/',
  linkLabel = 'العودة إلى لوحة الأنظمة',
}: UnderDevelopmentProps) {
  return (
    <div className="min-h-[40vh] flex items-center justify-center">
      <div className="text-center max-w-lg px-6">
        <h2 className="text-2xl font-bold text-[var(--erp-text)] mb-2">{title}</h2>
        <p className="text-[var(--erp-muted)] mb-6">
          {description || `هذا القسم مفعّل ضمن ${PLATFORM_NAME}. استخدم الرابط أدناه للوصول إليه.`}
        </p>
        <Link
          href={href}
          className="inline-flex items-center rounded-xl bg-[#1f4d3a] px-4 py-2.5 text-sm font-semibold text-white"
        >
          {linkLabel}
        </Link>
      </div>
    </div>
  );
}
