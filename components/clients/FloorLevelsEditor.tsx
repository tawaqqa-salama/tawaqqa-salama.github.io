'use client';

import { ACTIVITY_RULES, FLOOR_KIND_OPTIONS } from '@/lib/constants/clients';
import {
  calcBuildingArea,
  calcFloorsCount,
  createEmptyFloorLevel,
  createEmptyFloorUsage,
  floorUsageArea,
  labelForFloorKind,
  normalizeFloorLevels,
} from '@/lib/business/floors';
import NumericInput from '@/components/ui/NumericInput';
import type { FloorLevel, FloorLevelKind, FloorUsage } from '@/lib/types/client';
import { parseLocalizedNumber } from '@/lib/validation/numeric-input';

interface FloorLevelsEditorProps {
  levels: FloorLevel[];
  onChange: (levels: FloorLevel[]) => void;
  maxFloors?: number | null;
}

export default function FloorLevelsEditor({ levels, onChange, maxFloors }: FloorLevelsEditorProps) {
  const normalizedLevels = normalizeFloorLevels(levels);
  const floorsCount = calcFloorsCount(normalizedLevels);
  const buildingArea = calcBuildingArea(normalizedLevels);

  const updateLevel = (id: string, patch: Partial<FloorLevel>) => {
    onChange(
      normalizedLevels.map((level) => {
        if (level.id !== id) return level;
        const nextKind = (patch.kind || level.kind) as FloorLevelKind;
        return {
          ...level,
          ...patch,
          kind: nextKind,
          label: patch.label !== undefined
            ? patch.label
            : patch.kind
              ? labelForFloorKind(nextKind)
              : level.label,
          repeat_count: Math.max(1, Math.floor(Number(patch.repeat_count ?? level.repeat_count) || 1)),
          usages: level.usages?.length ? level.usages : [createEmptyFloorUsage()],
        };
      })
    );
  };

  const updateUsage = (levelId: string, usageId: string, patch: Partial<FloorUsage>) => {
    onChange(
      normalizedLevels.map((level) => {
        if (level.id !== levelId) return level;
        const usages = (level.usages?.length ? level.usages : [createEmptyFloorUsage()]).map((usage) =>
          usage.id === usageId ? { ...usage, ...patch } : usage
        );
        return {
          ...level,
          usages,
          area_m2: usages.reduce((sum, usage) => sum + Math.max(0, Number(usage.area_m2) || 0), 0),
        };
      })
    );
  };

  const removeUsage = (levelId: string, usageId: string) => {
    onChange(
      normalizedLevels.map((level) => {
        if (level.id !== levelId) return level;
        const usages = level.usages?.length ? level.usages : [createEmptyFloorUsage()];
        if (usages.length <= 1) return level;
        const nextUsages = usages.filter((usage) => usage.id !== usageId);
        return {
          ...level,
          usages: nextUsages,
          area_m2: nextUsages.reduce((sum, usage) => sum + Math.max(0, Number(usage.area_m2) || 0), 0),
        };
      })
    );
  };

  const addUsage = (levelId: string) => {
    onChange(
      normalizedLevels.map((level) =>
        level.id === levelId
          ? { ...level, usages: [...(level.usages?.length ? level.usages : [createEmptyFloorUsage()]), createEmptyFloorUsage()] }
          : level
      )
    );
  };

  const removeLevel = (id: string) => onChange(normalizedLevels.filter((level) => level.id !== id));
  const addLevel = (kind: FloorLevelKind = 'typical') => onChange([...normalizedLevels, createEmptyFloorLevel(kind)]);

  return (
    <div className="space-y-4 rounded-xl border border-gray-200 bg-white p-3 sm:p-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold text-gray-800">تفاصيل الأدوار</h3>
          <p className="text-xs text-gray-500 mt-0.5">أضف أكثر من مساحة ونشاط داخل الدور، ويُحسب الإجمالي تلقائيًا.</p>
        </div>
        <button
          type="button"
          onClick={() => addLevel(normalizedLevels.length === 0 ? 'ground' : 'typical')}
          className="w-full sm:w-auto text-xs font-semibold text-[#635bdb] bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2 hover:bg-emerald-100"
        >
          + إضافة دور
        </button>
      </div>

      {normalizedLevels.length === 0 ? (
        <p className="text-sm text-gray-500 bg-gray-50 rounded-lg p-3">لا توجد أدوار بعد. أضف دورًا أرضيًا ثم أدوارًا أخرى عند الحاجة.</p>
      ) : (
        <div className="space-y-4">
          {normalizedLevels.map((level, index) => {
            const usages = level.usages?.length ? level.usages : [createEmptyFloorUsage()];
            const floorTotal = floorUsageArea(level);
            return (
              <section key={level.id} className="border border-gray-100 rounded-xl p-3 sm:p-4 bg-gray-50 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">نوع الدور</label>
                    <select
                      value={level.kind}
                      onChange={(e) => updateLevel(level.id, { kind: e.target.value as FloorLevelKind })}
                      className="w-full p-2.5 border rounded-lg text-sm bg-white"
                    >
                      {FLOOR_KIND_OPTIONS.map((option) => <option key={option.kind} value={option.kind}>{option.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">التسمية</label>
                    <input
                      value={level.label}
                      onChange={(e) => updateLevel(level.id, { label: e.target.value })}
                      className="w-full p-2.5 border rounded-lg text-sm bg-white"
                      placeholder={`دور ${index + 1}`}
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">عدد التكرار</label>
                    <NumericInput
                      value={String(level.repeat_count || 1)}
                      onChange={(value) => updateLevel(level.id, { repeat_count: Math.max(1, Math.floor(parseLocalizedNumber(value) || 1)) })}
                      className="w-full p-2.5 border rounded-lg text-sm bg-white"
                    />
                  </div>
                </div>

                <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <h4 className="text-xs font-bold text-slate-800">المساحة والنشاط / التصنيف</h4>
                    <button type="button" onClick={() => addUsage(level.id)} className="w-full sm:w-auto text-xs font-semibold text-indigo-700 border border-indigo-200 rounded-lg px-3 py-2 hover:bg-indigo-50">
                      + إضافة مساحة / نشاط
                    </button>
                  </div>

                  <div className="space-y-2">
                    {usages.map((usage, usageIndex) => (
                      <div key={usage.id} className="grid grid-cols-1 sm:grid-cols-[1fr_1.4fr_1.4fr_auto] gap-2 items-end rounded-lg bg-slate-50 border border-slate-100 p-2">
                        <div>
                          <label className="block text-[11px] text-gray-600 mb-1">المساحة (م²)</label>
                          <NumericInput
                            mode="decimal"
                            value={usage.area_m2 ? String(usage.area_m2) : ''}
                            onChange={(value) => updateUsage(level.id, usage.id, { area_m2: parseLocalizedNumber(value) || 0 })}
                            className="w-full p-2 border rounded-lg text-sm bg-white"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] text-gray-600 mb-1">النشاط / التصنيف</label>
                          <select
                            value={usage.activity_type || ''}
                            onChange={(e) => updateUsage(level.id, usage.id, { activity_type: e.target.value || null })}
                            className="w-full p-2 border rounded-lg text-sm bg-white"
                          >
                            <option value="">اختر التصنيف</option>
                            {Object.entries(ACTIVITY_RULES).map(([key, rule]) => <option key={key} value={key}>{rule.label}</option>)}
                            <option value="other">أخرى</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-[11px] text-gray-600 mb-1">التسمية</label>
                          <input
                            value={usage.label || ''}
                            onChange={(e) => updateUsage(level.id, usage.id, { label: e.target.value || null })}
                            className="w-full p-2 border rounded-lg text-sm bg-white"
                            placeholder={`سطر ${usageIndex + 1}`}
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => removeUsage(level.id, usage.id)}
                          disabled={usages.length <= 1}
                          className="h-9 px-2 text-xs text-rose-700 rounded-lg disabled:text-gray-400 disabled:cursor-not-allowed"
                        >
                          حذف السطر
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs">
                  <p className="text-gray-600">إجمالي مساحة الدور: <strong>{floorTotal.toLocaleString('ar-SA')} م²</strong> · بعد التكرار: <strong>{(floorTotal * Math.max(1, level.repeat_count || 1)).toLocaleString('ar-SA')} م²</strong></p>
                  <button type="button" onClick={() => removeLevel(level.id)} className="text-rose-700 hover:underline self-start sm:self-auto">حذف الدور</button>
                </div>
              </section>
            );
          })}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
        <div className="rounded-lg bg-emerald-50 border border-emerald-100 p-3">
          <p className="text-xs text-emerald-800 mb-1">إجمالي عدد الأدوار</p>
          <p className="font-bold text-emerald-900">{floorsCount}</p>
          {maxFloors != null && <p className="text-[11px] text-emerald-700 mt-1">الحد الأقصى حسب النشاط: {maxFloors}</p>}
        </div>
        <div className="rounded-lg bg-emerald-50 border border-emerald-100 p-3">
          <p className="text-xs text-emerald-800 mb-1">إجمالي مساحة المبنى</p>
          <p className="font-bold text-emerald-900">{buildingArea.toLocaleString('ar-SA')} م²</p>
        </div>
      </div>
    </div>
  );
}
