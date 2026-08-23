'use client';

import { useMemo } from 'react';
import type { CompanyProfile } from '@/lib/company-profile';
import type { ClientRecord } from '@/lib/types/client';
import type { CdCoverLetterReport, ProjectEngineeringData } from '@/lib/types/project-reports';
import {
  DEFAULT_CD_ADDRESSEE,
  buildCdCoverLetterSnapshot,
  seedCdCoverLetter,
} from '@/lib/projects/cd-cover-letter';
import { formatGregorianDate, formatHijriDate } from '@/lib/projects/safety-delivery-letter';
import { printCdCoverLetter } from '@/components/projects/CdCoverLetterPrint';
import { ensureOutgoingNumber } from '@/lib/business/document-numbers';

const REPORT_STATUSES = ['مسودة', 'قيد الإعداد', 'مكتمل', 'معتمد'] as const;
const BUILDING_STATUSES = ['تحت الإنشاء', 'مبنى قائم'] as const;

type Props = {
  client: ClientRecord;
  data: ProjectEngineeringData;
  company: CompanyProfile | null;
  saving: boolean;
  onChange: (letter: CdCoverLetterReport) => void;
  onSave: (letter?: CdCoverLetterReport) => boolean | Promise<boolean>;
};

export default function CdCoverLetterSection({
  client,
  data,
  company,
  saving,
  onChange,
  onSave,
}: Props) {
  const letter = useMemo(
    () => seedCdCoverLetter(client, data, data.cd_cover_letter),
    [client, data]
  );
  const snap = useMemo(
    () => buildCdCoverLetterSnapshot({ client, data, letter }),
    [client, data, letter]
  );
  const letterDate = letter.letter_date || new Date().toISOString().slice(0, 10);

  const patch = (partial: Partial<CdCoverLetterReport>) => {
    onChange({ ...letter, ...partial });
  };

  const handleIssueOutgoingAndPrint = async () => {
    if (!company) return;
    const outgoing = await ensureOutgoingNumber(letter.outgoing_number);
    const ready = seedCdCoverLetter(client, data, {
      ...letter,
      outgoing_number: outgoing,
      letter_date: letter.letter_date || new Date().toISOString().slice(0, 10),
    });
    onChange(ready);
    const saved = await onSave(ready);
    if (!saved) return;
    printCdCoverLetter({
      client,
      data: { ...data, cd_cover_letter: ready },
      letter: ready,
      company,
    });
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm text-emerald-950">
        <p className="font-bold">خطاب تسليم الدفاع المدني (CD & Plans Submission Letter)</p>
        <p className="text-xs mt-1">
          خطاب رسمي A4 عمودي — يُسحب تلقائياً: رقم الصادر، التاريخ (ميلادي/هجري)، اسم المشروع،
          الموقع، المالك، المساحة، تصنيف الإشغال، وحالة المبنى.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <label className="text-sm">
          <span className="text-xs font-semibold text-gray-600 mb-1 block">حالة الخطاب</span>
          <select
            value={letter.status}
            onChange={(e) => patch({ status: e.target.value as CdCoverLetterReport['status'] })}
            className="w-full border rounded-xl px-3 py-2.5 text-sm"
          >
            {REPORT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="text-xs font-semibold text-gray-600 mb-1 block">رقم الصادر</span>
          <input
            value={letter.outgoing_number || ''}
            onChange={(e) => patch({ outgoing_number: e.target.value })}
            placeholder="يُصدر تلقائياً عند الطباعة (OUT-2026-XXXX)"
            className="w-full border rounded-xl px-3 py-2.5 text-sm font-mono"
            dir="ltr"
          />
        </label>
        <label className="text-sm">
          <span className="text-xs font-semibold text-gray-600 mb-1 block">تاريخ الخطاب (ميلادي)</span>
          <input
            type="date"
            value={letter.letter_date || ''}
            onChange={(e) => patch({ letter_date: e.target.value })}
            className="w-full border rounded-xl px-3 py-2.5 text-sm"
          />
        </label>
        <label className="text-sm">
          <span className="text-xs font-semibold text-gray-600 mb-1 block">عرض التاريخ</span>
          <input
            readOnly
            value={`${formatGregorianDate(letterDate)} · ${formatHijriDate(letterDate)}`}
            className="w-full border rounded-xl px-3 py-2.5 text-sm bg-gray-50"
          />
        </label>
        <label className="text-sm md:col-span-2">
          <span className="text-xs font-semibold text-gray-600 mb-1 block">جهة التوجيه</span>
          <input
            value={letter.addressee || DEFAULT_CD_ADDRESSEE}
            onChange={(e) => patch({ addressee: e.target.value })}
            className="w-full border rounded-xl px-3 py-2.5 text-sm"
          />
        </label>
        <label className="text-sm md:col-span-2">
          <span className="text-xs font-semibold text-gray-600 mb-1 block">
            صورة / مركز إقليمي (اختياري)
          </span>
          <input
            value={letter.copy_to || ''}
            onChange={(e) => patch({ copy_to: e.target.value })}
            placeholder="مثال: صورة لمركز السلامة الميدانية — جدة"
            className="w-full border rounded-xl px-3 py-2.5 text-sm"
          />
        </label>
        <label className="text-sm">
          <span className="text-xs font-semibold text-gray-600 mb-1 block">حالة المبنى</span>
          <select
            value={letter.building_status || 'تحت الإنشاء'}
            onChange={(e) => patch({ building_status: e.target.value })}
            className="w-full border rounded-xl px-3 py-2.5 text-sm"
          >
            {BUILDING_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="text-xs font-semibold text-gray-600 mb-1 block">مدير المكتب</span>
          <input
            value={letter.manager_name || ''}
            onChange={(e) => patch({ manager_name: e.target.value })}
            className="w-full border rounded-xl px-3 py-2.5 text-sm"
          />
        </label>
        <label className="text-sm">
          <span className="text-xs font-semibold text-gray-600 mb-1 block">مهندس السلامة</span>
          <input
            value={letter.safety_engineer_name || ''}
            onChange={(e) => patch({ safety_engineer_name: e.target.value })}
            className="w-full border rounded-xl px-3 py-2.5 text-sm"
          />
        </label>
        <label className="text-sm">
          <span className="text-xs font-semibold text-gray-600 mb-1 block">مسمى المهندس</span>
          <input
            value={letter.safety_engineer_title || ''}
            onChange={(e) => patch({ safety_engineer_title: e.target.value })}
            className="w-full border rounded-xl px-3 py-2.5 text-sm"
          />
        </label>
      </div>

      <div className="rounded-xl border bg-slate-50 p-4 text-sm space-y-1.5">
        <p className="font-bold text-gray-900 mb-2">معاينة البيانات المسحوبة</p>
        <p>
          <span className="text-gray-500">اسم المنشأة:</span> {snap.projectName}
        </p>
        <p>
          <span className="text-gray-500">الموقع:</span> {snap.location}
        </p>
        <p>
          <span className="text-gray-500">المالك:</span> {snap.ownerName}
        </p>
        <p>
          <span className="text-gray-500">المساحة:</span> {snap.totalAreaM2} متر مربع
        </p>
        <p>
          <span className="text-gray-500">تصنيف الإشغال:</span> {snap.occupancyCode}
        </p>
        <p>
          <span className="text-gray-500">حالة المبنى:</span> {snap.buildingStatus}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={saving}
          onClick={() => void onSave()}
          className="px-4 py-2.5 rounded-xl border text-sm font-semibold disabled:opacity-50"
        >
          {saving ? 'جاري الحفظ...' : 'حفظ بيانات الخطاب'}
        </button>
        <button
          type="button"
          disabled={saving || !company}
          onClick={() => void handleIssueOutgoingAndPrint()}
          className="px-4 py-2.5 rounded-xl bg-[#635bdb] text-white text-sm font-semibold disabled:opacity-50"
        >
          توليد وطباعة الخطاب (A4 Portrait)
        </button>
      </div>
    </div>
  );
}
