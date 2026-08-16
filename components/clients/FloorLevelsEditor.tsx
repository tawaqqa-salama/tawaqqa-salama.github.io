'use client';

import { ACTIVITY_RULES, FLOOR_KIND_OPTIONS } from '@/lib/constants/clients';
import {
  calcBuildingArea,
  calcFloorsCount,
  createEmptyFloorLevel,
  labelForFloorKind,
} from '@/lib/business/floors';
import NumericInput from '@/components/ui/NumericInput';
import type { FloorLevel, FloorLevelKind } from '@/lib/types/client';
import { parseLocalizedNumber } from '@/lib/validation/numeric-input';

interface FloorLevelsEditorProps {
  levels: FloorLevel[];
  onChange: (levels: FloorLevel[]) => void;
  maxFloors?: number | null;
}

export default function FloorLevelsEditor({ levels, onChange, maxFloors }: FloorLevelsEditorProps) {
  const floorsCount = calcFloorsCount(levels);
  const buildingArea = calcBuildingArea(levels);

  const updateLevel = (id: string, patch: Partial<FloorLevel>) => {
    onChange(
      levels.map((level) => {
        if (level.id !== id) return level;
        const nextKind = (patch.kind || level.kind) as FloorLevelKind;
        const next: FloorLevel = {
          ...level,
          ...patch,
          kind: nextKind,
          label:
            patch.label !== undefined
              ? patch.label
              : patch.kind
                ? labelForFloorKind(nextKind)
                : level.label,
          area_m2:
            patch.area_m2 !== undefined
              ? patch.area_m2
              : level.area_m2,
          repeat_count:
            patch.repeat_count !== undefined
              ? Math.max(1, patch.repeat_count)
              : nextKind === 'typical'
                ? Math.max(1, level.repeat_count)
                : 1,
        };
        if (nextKind !== 'typical') next.repeat_count = 1;
        return next;
      })
    );
  };

  const removeLevel = (id: string) => {
    onChange(levels.filter((level) => level.id !== id));
  };

  const addLevel = (kind: FloorLevelKind = 'typical') => {
    onChange([...levels, createEmptyFloorLevel(kind)]);
  };

  return (
    <div className="space-y-3 rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold text-gray-800">تفصيل الأدوار</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            لكل دور مساحة خاصة. الدور المتكرر يُدخل مرة واحدة مع عدد التكرار.
          </p>
        </div>
        <button
          type="button"
          onClick={() => addLevel(levels.length === 0 ? 'ground' : 'typical')}
          className="text-xs font-semibold text-[#635bdb] bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-1.5 hover:bg-emerald-100"
        >
          + إضافة دور
        </button>
      </div>

      {levels.length === 0 ? (
        <p className="text-sm text-gray-500 bg-gray-50 rounded-lg p-3">
          لا توجد أدوار بعد. أضف دوراً أرضياً ثم متكرراً إن لزم.
        </p>
      ) : (
        <div className="space-y-3">
          {levels.map((level, index) => (
            <div
              key={level.id}
              className="grid grid-cols-1 md:grid-cols-14 gap-2 items-end border border-gray-100 rounded-xl p-3 bg-gray-50"
            >
              <div className="md:col-span-3">
                <label className="block text-xs text-gray-600 mb-1">نوع الدور</label>
                <select
                  value={level.kind}
                  onChange={(e) =>
                    updateLevel(level.id, { kind: e.target.value as FloorLevelKind })
                  }
                  className="w-full p-2 border rounded-lg text-sm bg-white"
                >
                  {FLOOR_KIND_OPTIONS.map((option) => (
                    <option key={option.kind} value={option.kind}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="md:col-span-3">
                <label className="block text-xs text-gray-600 mb-1">التسمية</label>
                <input
                  type="text"
                  value={level.label}
                  onChange={(e) => updateLevel(level.id, { label: e.target.value })}
                  className="w-full p-2 border rounded-lg text-sm bg-white"
                  placeholder={`دور ${index + 1}`}
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs text-gray-600 mb-1">مساحة الدور (م²)</label>
                <NumericInput
                  mode="decimal"
                  value={level.area_m2 ? String(level.area_m2) : ''}
                  onChange={(value) =>
                    updateLevel(level.id, { area_m2: parseLocalizedNumber(value) || 0 })
                  }
                  className="w-full p-2 border rounded-lg text-sm bg-white"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs text-gray-600 mb-1">
                  {level.kind === 'typical' ? 'عدد التكرار' : 'التكرار'}
                </label>
                <NumericInput
                  disabled={level.kind !== 'typical'}
                  value={String(level.repeat_count || 1)}
                  onChange={(value) =>
                    updateLevel(level.id, {
                      repeat_count: Math.max(1, Math.floor(parseLocalizedNumber(value) || 1)),
                    })
                  }
                  className={`w-full p-2 border rounded-lg text-sm ${
                    level.kind === 'typical' ? 'bg-white' : 'bg-gray-100 text-gray-500'
                  }`}
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs text-gray-600 mb-1">نشاط الدور</label>
                <select
                  value={level.activity_type || ''}
                  onChange={(e) => updateLevel(level.id, { activity_type: e.target.value || null })}
                  className="w-full p-2 border rounded-lg text-sm bg-white"
                >
                  <option value="">اختر النشاط</option>
                  {Object.entries(ACTIVITY_RULES).map(([key, rule]) => (
                    <option key={key} value={key}>{rule.label}</option>
                  ))}
                  <option value="other">أخرى</option>
                </select>
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs text-gray-600 mb-1">استخدام الدور عند الحاجة</label>
                <input
                  value={level.floor_use || ''}
                  onChange={(e) => updateLevel(level.id, { floor_use: e.target.value || null })}
                  className="w-full p-2 border rounded-lg text-sm bg-white"
                  placeholder="اختياري"
                />
              </div>

              <div className="md:col-span-2 flex items-center justify-between gap-2">
                <p className="text-xs text-gray-500">
                  المجموع: {(level.area_m2 * level.repeat_count).toLocaleString('ar-SA')} م²
                </p>
                <button
                  type="button"
                  onClick={() => removeLevel(level.id)}
                  className="text-xs text-rose-700 hover:underline"
                >
                  حذف
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-lg bg-emerald-50 border border-emerald-100 p-3">
          <p className="text-xs text-emerald-800 mb-1">إجمالي عدد الأدوار</p>
          <p className="font-bold text-emerald-900">{floorsCount}</p>
          {maxFloors != null && (
            <p className="text-[11px] text-emerald-700 mt-1">الحد الأقصى حسب النشاط: {maxFloors}</p>
          )}
        </div>
        <div className="rounded-lg bg-emerald-50 border border-emerald-100 p-3">
          <p className="text-xs text-emerald-800 mb-1">إجمالي مساحة المبنى</p>
          <p className="font-bold text-emerald-900">{buildingArea.toLocaleString('ar-SA')} م²</p>
        </div>
      </div>
    </div>
  );
}
