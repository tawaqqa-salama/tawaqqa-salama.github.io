'use client';

import {
  SUPPRESSION_SYSTEMS,
  ZONE_USE_OPTIONS,
  getZoneUse,
  zoneOptionChoices,
} from '@/lib/constants/zone-uses';
import {
  STRUCTURE_OPTIONS,
  STRUCTURAL_CLASS_OPTIONS,
} from '@/lib/constants/technical-report';
import { createZone, enrichZone, floorAreaBalance } from '@/lib/projects/sbc-classification';
import type {
  TechnicalReportFloorUse,
  TechnicalReportPhoto,
  TechnicalReportZone,
} from '@/lib/types/project-reports';

type Props = {
  floors: TechnicalReportFloorUse[];
  onChange: (floors: TechnicalReportFloorUse[]) => void;
  onUploadPhoto: (file: File | null, apply: (photo: TechnicalReportPhoto) => void) => void;
};

function newId() {
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export default function FloorZonesEditor({ floors, onChange, onUploadPhoto }: Props) {
  const updateFloor = (floorId: string, updater: (floor: TechnicalReportFloorUse) => TechnicalReportFloorUse) => {
    onChange(floors.map((f) => (f.id === floorId ? updater(f) : f)));
  };

  const updateZone = (
    floorId: string,
    zoneId: string,
    updater: (zone: TechnicalReportZone) => TechnicalReportZone,
    keepSuppression = false
  ) => {
    updateFloor(floorId, (floor) => ({
      ...floor,
      zones: floor.zones.map((z) =>
        z.id === zoneId ? enrichZone(updater(z), { keepSuppression }) : z
      ),
    }));
  };

  return (
    <section className="bg-white border rounded-xl p-4 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h4 className="font-bold text-gray-800">الأدوار والمناطق (متكامل مع أنظمة الإطفاء)</h4>
          <p className="text-xs text-gray-500 mt-1">
            للمخزن/المصنع/الورشة: اختر النوع الفرعي فيُقترح نظام الإطفاء تلقائياً. مجموع مساحات المناطق = مساحة الدور.
          </p>
        </div>
        <button
          type="button"
          className="text-xs font-semibold text-[#635bdb]"
          onClick={() =>
            onChange([
              ...floors,
              {
                id: newId(),
                floor_name: `دور ${floors.length + 1}`,
                floor_area_m2: '',
                structure: 'خرسانة + بلوك',
                classification: 'TYPE I A',
                zones: [createZone()],
              },
            ])
          }
        >
          + دور
        </button>
      </div>

      {floors.map((floor) => {
        const balance = floorAreaBalance(floor);
        return (
          <article key={floor.id} className="border rounded-xl p-3 bg-gray-50 space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
              <input
                className="border rounded-lg px-2 py-2 text-sm bg-white"
                value={floor.floor_name}
                placeholder="اسم الدور"
                onChange={(e) => updateFloor(floor.id, (f) => ({ ...f, floor_name: e.target.value }))}
              />
              <input
                className="border rounded-lg px-2 py-2 text-sm bg-white"
                value={floor.floor_area_m2}
                placeholder="مساحة الدور م²"
                onChange={(e) => updateFloor(floor.id, (f) => ({ ...f, floor_area_m2: e.target.value }))}
              />
              <select
                className="border rounded-lg px-2 py-2 text-sm bg-white"
                value={floor.structure}
                onChange={(e) => updateFloor(floor.id, (f) => ({ ...f, structure: e.target.value }))}
              >
                {STRUCTURE_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
              <select
                className="border rounded-lg px-2 py-2 text-sm bg-white"
                value={floor.classification}
                onChange={(e) => updateFloor(floor.id, (f) => ({ ...f, classification: e.target.value }))}
              >
                {STRUCTURAL_CLASS_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </div>

            <div
              className={`text-xs font-semibold px-2 py-1.5 rounded-lg ${
                balance.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'
              }`}
            >
              مجموع المناطق: {balance.zonesSum || 0} م² · مساحة الدور: {balance.floorArea || 0} م²
              {!balance.ok ? ` · الفرق ${balance.diff > 0 ? '+' : ''}${balance.diff}` : ' · متطابق'}
            </div>

            <div className="space-y-3">
              {floor.zones.map((zone) => {
                const use = getZoneUse(zone.use_code);
                const choices = zoneOptionChoices(zone.use_code, zone.subtype_code);
                return (
                  <div key={zone.id} className="bg-white border rounded-xl p-3 space-y-2">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      <label className="text-xs">
                        <span className="block text-gray-500 mb-1">الاستخدام الرئيسي</span>
                        <select
                          className="w-full border rounded-lg px-2 py-2 text-sm"
                          value={zone.use_code}
                          onChange={(e) => {
                            const nextUse = getZoneUse(e.target.value);
                            updateZone(floor.id, zone.id, () =>
                              createZone({
                                id: zone.id,
                                use_code: nextUse.id,
                                area_m2: zone.area_m2,
                                code_proof_photo: zone.code_proof_photo,
                              })
                            );
                          }}
                        >
                          {ZONE_USE_OPTIONS.map((opt) => (
                            <option key={opt.id} value={opt.id}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="text-xs">
                        <span className="block text-gray-500 mb-1">
                          {zone.use_code === 'storage'
                            ? 'نوع التخزين'
                            : zone.use_code === 'factory'
                              ? 'نوع المصنع'
                              : zone.use_code === 'workshop'
                                ? 'نوع الورشة'
                                : 'النوع الفرعي'}
                        </span>
                        <select
                          className="w-full border rounded-lg px-2 py-2 text-sm"
                          value={zone.subtype_code || use.subtypes[0]?.id || ''}
                          onChange={(e) =>
                            updateZone(floor.id, zone.id, (z) => ({
                              ...z,
                              subtype_code: e.target.value,
                              label: '',
                            }))
                          }
                        >
                          {use.subtypes.map((sub) => (
                            <option key={sub.id} value={sub.id}>
                              {sub.label}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="text-xs">
                        <span className="block text-gray-500 mb-1">وصف المنطقة</span>
                        <input
                          className="w-full border rounded-lg px-2 py-2 text-sm"
                          value={zone.label}
                          onChange={(e) =>
                            updateZone(floor.id, zone.id, (z) => ({ ...z, label: e.target.value }), true)
                          }
                        />
                      </label>

                      <label className="text-xs">
                        <span className="block text-gray-500 mb-1">المساحة م²</span>
                        <input
                          className="w-full border rounded-lg px-2 py-2 text-sm"
                          value={zone.area_m2}
                          onChange={(e) =>
                            updateZone(floor.id, zone.id, (z) => ({ ...z, area_m2: e.target.value }), true)
                          }
                        />
                      </label>

                      <label className="text-xs md:col-span-2">
                        <span className="block text-gray-500 mb-1">نظام الإطفاء المخصص (تلقائي — قابل للتعديل)</span>
                        <select
                          className="w-full border rounded-lg px-2 py-2 text-sm"
                          value={zone.suppression_code || ''}
                          onChange={(e) =>
                            updateZone(
                              floor.id,
                              zone.id,
                              (z) => ({ ...z, suppression_code: e.target.value }),
                              true
                            )
                          }
                        >
                          {SUPPRESSION_SYSTEMS.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>

                    <div className="text-[11px] text-gray-600 bg-slate-50 rounded-lg px-2 py-1.5">
                      GROUP {zone.group_letter || '—'} · خطورة {zone.risk_label || '—'} · {zone.suppression_label || '—'}
                    </div>

                    {choices.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-gray-700 mb-1">خيارات إضافية للمنطقة</p>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-1">
                          {choices.map((choice) => {
                            const checked = (zone.selected_options || []).includes(choice);
                            return (
                              <label key={choice} className="flex items-start gap-2 text-xs text-gray-700">
                                <input
                                  type="checkbox"
                                  className="mt-0.5"
                                  checked={checked}
                                  onChange={() =>
                                    updateZone(
                                      floor.id,
                                      zone.id,
                                      (z) => ({
                                        ...z,
                                        selected_options: checked
                                          ? (z.selected_options || []).filter((x) => x !== choice)
                                          : [...(z.selected_options || []), choice],
                                      }),
                                      true
                                    )
                                  }
                                />
                                <span>{choice}</span>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    <div className="border-t pt-2">
                      <p className="text-xs font-semibold text-gray-700 mb-1">صورة مقطع من الكود لهذه المنطقة</p>
                      {zone.code_proof_photo?.dataUrl ? (
                        <div className="relative inline-block">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={zone.code_proof_photo.dataUrl}
                            alt="إثبات كود"
                            className="h-24 rounded-lg border object-cover"
                          />
                          <button
                            type="button"
                            className="absolute top-1 left-1 bg-white text-rose-600 text-[10px] px-1.5 rounded"
                            onClick={() =>
                              updateZone(floor.id, zone.id, (z) => ({ ...z, code_proof_photo: null }), true)
                            }
                          >
                            حذف
                          </button>
                        </div>
                      ) : (
                        <label className="text-xs font-semibold text-[#635bdb] cursor-pointer">
                          + إرفاق صورة مقصوصة من الكود
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) =>
                              onUploadPhoto(e.target.files?.[0] || null, (photo) =>
                                updateZone(
                                  floor.id,
                                  zone.id,
                                  (z) => ({ ...z, code_proof_photo: photo }),
                                  true
                                )
                              )
                            }
                          />
                        </label>
                      )}
                    </div>

                    <button
                      type="button"
                      className="text-rose-600 text-xs"
                      onClick={() =>
                        updateFloor(floor.id, (f) => ({
                          ...f,
                          zones: f.zones.filter((z) => z.id !== zone.id),
                        }))
                      }
                    >
                      حذف المنطقة
                    </button>
                  </div>
                );
              })}
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                className="text-xs font-semibold text-[#635bdb]"
                onClick={() =>
                  updateFloor(floor.id, (f) => ({
                    ...f,
                    zones: [...f.zones, createZone({ area_m2: '' })],
                  }))
                }
              >
                + منطقة
              </button>
              <button
                type="button"
                className="text-xs text-rose-600"
                onClick={() => onChange(floors.filter((f) => f.id !== floor.id))}
              >
                حذف الدور
              </button>
            </div>
          </article>
        );
      })}
    </section>
  );
}
