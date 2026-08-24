'use client';

import type {
  FireProtectionDesign,
  SupportingSystemState,
} from '@/lib/types/fire-protection-design';

type Props = {
  design: FireProtectionDesign;
  onChange: (next: FireProtectionDesign) => void;
};

type SupportingSystemKey = keyof FireProtectionDesign['supporting_systems'];

const SUPPORTING_SYSTEMS: Array<{
  key: SupportingSystemKey;
  label: string;
  description: string;
}> = [
  {
    key: 'emergency_lighting',
    label: 'إنارة الطوارئ',
    description: 'حالة النظام وملاحظته وتوصيته. أما الكميات حسب المساحات فتُدار من مركز التصاميم.',
  },
  {
    key: 'exit_signs',
    label: 'اللوحات الإرشادية',
    description: 'حالة النظام وملاحظته وتوصيته. أما الكميات حسب المساحات فتُدار من مركز التصاميم.',
  },
  {
    key: 'smoke_control',
    label: 'التحكم بالدخان',
    description: 'وصف الحالة الفنية أو متطلب التصميم دون إضافة حسابات ميكانيكية جديدة.',
  },
  {
    key: 'ventilation',
    label: 'التهوية',
    description: 'حالة النظام الداعم وملاحظته الهندسية.',
  },
  {
    key: 'electrical_safety',
    label: 'السلامة الكهربائية',
    description: 'حالة السلامة المرتبطة بالأنظمة دون تغيير بيانات المخطط الأساسية.',
  },
  {
    key: 'emergency_power',
    label: 'القدرة الاحتياطية',
    description: 'حالة التغذية الاحتياطية وملاحظتها، وهي منفصلة عن كميات أجهزة الإنذار.',
  },
];

function Field({
  label,
  value,
  onChange,
  multiline = false,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  multiline?: boolean;
  placeholder?: string;
}) {
  return (
    <label className="block text-xs font-semibold text-gray-700">
      <span className="mb-1 block">{label}</span>
      {multiline ? (
        <textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          className="min-h-20 w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm font-normal"
        />
      ) : (
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm font-normal"
        />
      )}
    </label>
  );
}

function SupportingSystemCard({
  label,
  description,
  value,
  onChange,
}: {
  label: string;
  description: string;
  value: SupportingSystemState;
  onChange: (partial: Partial<SupportingSystemState>) => void;
}) {
  return (
    <article className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
      <h4 className="text-sm font-bold text-slate-900">{label}</h4>
      <p className="mt-1 text-[11px] leading-relaxed text-slate-600">{description}</p>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block text-xs font-semibold text-gray-700">
          <span className="mb-1 block">الحالة الفنية</span>
          <select
            value={value.status}
            onChange={(event) =>
              onChange({
                status: event.target.value as SupportingSystemState['status'],
                source: 'engineer_input',
              })
            }
            className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm font-normal"
          >
            <option value="unknown">لم يُحدَّد بعد</option>
            <option value="required">مطلوب</option>
            <option value="not_required">غير مطلوب</option>
            <option value="by_design">حسب التصميم</option>
          </select>
        </label>
        <Field
          label="التوصية / الإجراء"
          value={value.recommendation || ''}
          onChange={(recommendation) => onChange({ recommendation, source: 'engineer_input' })}
          placeholder="إجراء أو توصية هندسية عند الحاجة"
        />
      </div>
      <div className="mt-3">
        <Field
          label="ملاحظة هندسية"
          value={value.note || ''}
          onChange={(note) => onChange({ note, source: 'engineer_input' })}
          multiline
          placeholder="ملاحظة فنية مرتبطة بالنظام"
        />
      </div>
    </article>
  );
}

export default function FireAlarmAndSupportingSystemsSection({ design, onChange }: Props) {
  const patchAlarm = (partial: Partial<FireProtectionDesign['fire_alarm']>) => {
    onChange({
      ...design,
      fire_alarm: {
        ...design.fire_alarm,
        ...partial,
        source: 'engineer_input',
      },
    });
  };

  const patchSupporting = (
    key: SupportingSystemKey,
    partial: Partial<SupportingSystemState>
  ) => {
    onChange({
      ...design,
      supporting_systems: {
        ...design.supporting_systems,
        [key]: {
          ...design.supporting_systems[key],
          ...partial,
          source: 'engineer_input',
        },
      },
    });
  };

  return (
    <div className="space-y-5" dir="rtl">
      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <div>
          <h3 className="text-base font-bold text-slate-900">مواصفات نظام إنذار الحريق</h3>
          <p className="mt-1 text-xs leading-relaxed text-slate-600">
            تحفظ هذه المواصفات في `fire_protection_design.fire_alarm`. أعداد كواشف الدخان والحرارة وأجهزة التنبيه ولوحات الإنذار وتوزيعها تبقى في مركز التصاميم حسب الدور والمساحة ولا تُكرر هنا.
          </p>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          <Field
            label="لوحة التحكم"
            value={design.fire_alarm.control_panel}
            onChange={(control_panel) => patchAlarm({ control_panel })}
            placeholder="نوع اللوحة أو وصفها الفني"
          />
          <Field
            label="نقاط النداء اليدوي"
            value={design.fire_alarm.manual_call_points}
            onChange={(manual_call_points) => patchAlarm({ manual_call_points })}
            placeholder="الوصف أو متطلب التوزيع"
          />
          <Field
            label="نظام الإخلاء الصوتي"
            value={design.fire_alarm.voice_alarm}
            onChange={(voice_alarm) => patchAlarm({ voice_alarm })}
            placeholder="وصف النظام عند وجوده"
          />
          <Field
            label="تكامل الأنظمة"
            value={design.fire_alarm.integration}
            onChange={(integration) => patchAlarm({ integration })}
            placeholder="الربط مع الأنظمة الأخرى"
          />
        </div>
        <div className="mt-3">
          <Field
            label="ملاحظات فنية لنظام الإنذار"
            value={design.fire_alarm.notes}
            onChange={(notes) => patchAlarm({ notes })}
            multiline
            placeholder="ملاحظات هندسية مرتبطة بنظام الإنذار والكشف"
          />
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <div>
          <h3 className="text-base font-bold text-slate-900">أنظمة الطوارئ والأنظمة المساندة</h3>
          <p className="mt-1 text-xs leading-relaxed text-slate-600">
            هذه الحقول تصف حالة الأنظمة وملاحظاتها وتوصياتها. لا تنشئ أو تنسخ كميات إنارة الطوارئ أو اللوحات الإرشادية المسجلة حسب المساحات.
          </p>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
          {SUPPORTING_SYSTEMS.map((system) => (
            <SupportingSystemCard
              key={system.key}
              label={system.label}
              description={system.description}
              value={design.supporting_systems[system.key]}
              onChange={(partial) => patchSupporting(system.key, partial)}
            />
          ))}
        </div>
      </section>
    </div>
  );
}
