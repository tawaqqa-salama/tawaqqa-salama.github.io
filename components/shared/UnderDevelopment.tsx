import { PLATFORM_NAME } from '@/lib/constants/branding';

interface UnderDevelopmentProps {
  title: string;
  description?: string;
}

export default function UnderDevelopment({ title, description }: UnderDevelopmentProps) {
  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="text-center max-w-lg px-6">
        <div className="mx-auto mb-6 flex h-24 w-24 items-center justify-center rounded-3xl bg-gradient-to-br from-slate-100 to-blue-50 text-4xl shadow-inner">
          🚧
        </div>
        <h2 className="text-2xl font-bold text-gray-800 mb-2">{title}</h2>
        <p className="text-gray-500 mb-6">
          {description || `هذا القسم قيد التطوير وسيتم إطلاقه قريباً ضمن ${PLATFORM_NAME}.`}
        </p>
        <span className="inline-flex items-center gap-2 rounded-full bg-amber-100 px-4 py-2 text-sm font-semibold text-amber-800">
          Under Development — قيد التطوير
        </span>
      </div>
    </div>
  );
}
