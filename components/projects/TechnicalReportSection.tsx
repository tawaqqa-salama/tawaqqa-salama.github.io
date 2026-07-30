'use client';

import { useMemo, useState } from 'react';
import {
  BUILDING_STATUS_OPTIONS,
  STRUCTURE_OPTIONS,
  STRUCTURAL_CLASS_OPTIONS,
  TECH_REPORT_CHAPTERS,
  TECH_REPORT_GENERAL_RECOMMENDATIONS,
  TECH_REPORT_ITEMS,
} from '@/lib/constants/technical-report';
import { ZONE_USE_OPTIONS, getZoneUse } from '@/lib/constants/zone-uses';
import { getTechnicalReportFacilitySnapshot } from '@/lib/projects/technical-report';
import {
  applyAutoClassification,
  buildCodeProofCards,
  createZone,
  enrichZone,
  floorAreaBalance,
} from '@/lib/projects/sbc-classification';
import type { ClientRecord } from '@/lib/types/client';
import type {
  TechnicalReport,
  TechnicalReportFloorUse,
  TechnicalReportPhoto,
  TechnicalReportSectionItem,
  TechnicalReportZone,
} from '@/lib/types/project-reports';

const REPORT_STATUSES = ['مسودة', 'قيد الإعداد', 'مكتمل', 'معتمد'] as const;

type Props = {
  client: ClientRecord;
  report: TechnicalReport;
  onChange: (next: TechnicalReport) => void;
  onSave: () => void;
  onPrint: () => void;
  saving: boolean;
};

function newPhotoId() {
  return `ph-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('تعذر قراءة الملف'));
    reader.readAsDataURL(file);
  });
}

export default function TechnicalReportSection({
  client,
  report,
  onChange,
  onSave,
  onPrint,
  saving,
}: Props) {
  const [chapter, setChapter] = useState<(typeof TECH_REPORT_CHAPTERS)[number]['id']>('facility');
  const facility = useMemo(() => getTechnicalReportFacilitySnapshot(client), [client]);
  const proofCards = useMemo(() => buildCodeProofCards(report, client), [report, client]);

  const patch = (partial: Partial<TechnicalReport>) => onChange({ ...report, ...partial });

  const setFloorsAndClassify = (floor_uses: TechnicalReportFloorUse[]) => {
    onChange(applyAutoClassification({ ...report, floor_uses }, client));
  };

  const updateItemList = (
    key: 'firefighting_items' | 'ventilation_items' | 'alarm_items' | 'exits_items',
    itemId: string,
    updater: (item: TechnicalReportSectionItem) => TechnicalReportSectionItem
  ) => {
    patch({
      [key]: report[key].map((item) => (item.id === itemId ? updater(item) : item)),
    });
  };

  const uploadPhoto = async (file: File | null, apply: (photo: TechnicalReportPhoto) => void) => {
    if (!file) return;
    if (file.size > 2.5 * 1024 * 1024) {
      alert('حجم الصورة كبير. اختر صورة أصغر من 2.5MB');
      return;
    }
    const dataUrl = await fileToDataUrl(file);
    apply({ id: newPhotoId(), dataUrl, caption: file.name });
  };

  const itemsForChapter = (chapterId: string) => {
    if (chapterId === 'firefighting') return { key: 'firefighting_items' as const, items: report.firefighting_items };
    if (chapterId === 'ventilation') return { key: 'ventilation_items' as const, items: report.ventilation_items };
    if (chapterId === 'alarm') return { key: 'alarm_items' as const, items: report.alarm_items };
    if (chapterId === 'exits') return { key: 'exits_items' as const, items: report.exits_items };
    return null;
  };

  const updateFloor = (floorId: string, updater: (floor: TechnicalReportFloorUse) => TechnicalReportFloorUse) => {
    setFloorsAndClassify(report.floor_uses.map((f) => (f.id === floorId ? updater(f) : f)));
  };

  const updateZone = (
    floorId: string,
    zoneId: string,
    updater: (zone: TechnicalReportZone) => TechnicalReportZone
  ) => {
    updateFloor(floorId, (floor) => ({
      ...floor,
      zones: floor.zones.map((z) => (z.id === zoneId ? enrichZone(updater(z)) : z)),
    }));
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-bold text-gray-900">التقرير الفني لأنظمة السلامة والوقاية من الحريق</h3>
          <p className="text-xs text-gray-500 mt-1">
            تصنيف المبنى والخطورة تلقائي من الكود السعودي · مناطق لكل دور · إثباتات الكود · PDF عمودي A4
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <select
            value={report.status}
            onChange={(e) => patch({ status: e.target.value as TechnicalReport['status'] })}
            className="border rounded-lg px-3 py-2 text-sm"
          >
            {REPORT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <button type="button" onClick={onPrint} className="px-3 py-2 rounded-lg border text-sm font-semibold text-gray-700">
            معاينة PDF / طباعة A4
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={onSave}
            className="px-3 py-2 rounded-lg bg-[#1f4d3a] text-white text-sm font-semibold disabled:opacity-60"
          >
            {saving ? 'جاري الحفظ...' : 'حفظ التقرير'}
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {TECH_REPORT_CHAPTERS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setChapter(item.id)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${
              chapter === item.id ? 'bg-[#1f4d3a] text-white border-[#1f4d3a]' : 'bg-white text-gray-700'
            }`}
          >
            {item.title}
          </button>
        ))}
      </div>

      {chapter === 'facility' && (
        <div className="space-y-4">
          <section className="bg-emerald-50/60 border border-emerald-100 rounded-xl p-4">
            <h4 className="font-bold text-[#1f4d3a] mb-3">بيانات المنشأة العامة (تلقائي من التسويق/المبيعات)</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
              <ReadOnly label="اسم المنشأة" value={facility.business_name} />
              <ReadOnly label="النشاط" value={facility.activity_label} />
              <ReadOnly label="المالك / المستثمر" value={facility.owner_name} />
              <ReadOnly label="الموقع" value={facility.location_summary} />
              <ReadOnly label="مساحة الموقع" value={facility.land_area ? `${facility.land_area} م²` : '—'} />
              <ReadOnly label="مساحة البناء" value={facility.building_area ? `${facility.building_area} م²` : '—'} />
              <ReadOnly label="عدد الأدوار" value={facility.floors_count || '—'} />
              <ReadOnly label="العنوان الوطني" value={facility.national_address || '—'} />
            </div>
          </section>

          <section className="bg-white border rounded-xl p-4 space-y-3">
            <h4 className="font-bold text-gray-800">حقول يغطيها المهندس</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="تاريخ التقرير" type="date" value={report.report_date || ''} onChange={(v) => patch({ report_date: v })} />
              <Field label="رقم الصادر" value={report.outgoing_number || ''} onChange={(v) => patch({ outgoing_number: v })} />
              <Field label="قسم الدفاع المدني المختص" value={report.civil_defense_branch || ''} onChange={(v) => patch({ civil_defense_branch: v })} />
              <SelectField label="حالة المبنى" value={report.building_status || ''} onChange={(v) => patch({ building_status: v })} options={BUILDING_STATUS_OPTIONS} />
              <Field label="رقم الصك" value={report.deed_number || ''} onChange={(v) => patch({ deed_number: v })} />
              <Field label="تاريخ الصك" value={report.deed_date || ''} onChange={(v) => patch({ deed_date: v })} />
              <Field label="رقم رخصة البناء" value={report.building_permit_number || ''} onChange={(v) => patch({ building_permit_number: v })} />
              <Field label="تاريخ رخصة البناء" value={report.building_permit_date || ''} onChange={(v) => patch({ building_permit_date: v })} />
              <Field label="مهندس السلامة" value={report.safety_engineer_name || ''} onChange={(v) => patch({ safety_engineer_name: v })} />
              <Field label="المدير التنفيذي" value={report.executive_director_name || ''} onChange={(v) => patch({ executive_director_name: v })} />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <ReadOnly label="تصنيف المبنى (تلقائي من SBC حسب المناطق)" value={report.building_classification || '—'} />
              <ReadOnly label="تصنيف الخطورة (تلقائي من المناطق)" value={report.risk_class || '—'} />
            </div>
            <button type="button" className="text-xs font-semibold text-[#1f4d3a]" onClick={() => onChange(applyAutoClassification(report, client))}>
              إعادة حساب التصنيف من المناطق
            </button>
            <label className="block text-sm">
              <span className="text-gray-600 mb-1 block">نبذة التقرير</span>
              <textarea value={report.overview_text || ''} onChange={(e) => patch({ overview_text: e.target.value })} className="w-full border rounded-xl px-3 py-2.5 min-h-28 text-sm" />
            </label>
            <label className="block text-sm">
              <span className="text-gray-600 mb-1 block">وصف الموقع</span>
              <textarea value={report.location_description || ''} onChange={(e) => patch({ location_description: e.target.value })} className="w-full border rounded-xl px-3 py-2.5 min-h-20 text-sm" />
            </label>
          </section>

          <section className="bg-white border rounded-xl p-4 space-y-3">
            <h4 className="font-bold text-gray-800">صور الزيارة / الموقع</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <PhotoBox title="صورة Google Earth" photo={report.earth_photo} onUpload={(file) => void uploadPhoto(file, (photo) => patch({ earth_photo: photo }))} onClear={() => patch({ earth_photo: null })} />
              <PhotoBox title="صورة واجهة المشروع" photo={report.facade_photo} onUpload={(file) => void uploadPhoto(file, (photo) => patch({ facade_photo: photo }))} onClear={() => patch({ facade_photo: null })} />
              <PhotoBox title="صورة عامة من الموقع" photo={report.site_photo} onUpload={(file) => void uploadPhoto(file, (photo) => patch({ site_photo: photo }))} onClear={() => patch({ site_photo: null })} />
            </div>
          </section>

          <section className="bg-white border rounded-xl p-4 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h4 className="font-bold text-gray-800">الأدوار والمناطق</h4>
                <p className="text-xs text-gray-500 mt-1">مثال: بدروم = مواقف + غرفة كهرباء · الدور الأول = مخزن + منطقة جلوس. مجموع مساحات المناطق = مساحة الدور.</p>
              </div>
              <button
                type="button"
                className="text-xs font-semibold text-[#1f4d3a]"
                onClick={() =>
                  setFloorsAndClassify([
                    ...report.floor_uses,
                    {
                      id: newPhotoId(),
                      floor_name: `دور ${report.floor_uses.length + 1}`,
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

            {report.floor_uses.map((floor) => {
              const balance = floorAreaBalance(floor);
              return (
                <article key={floor.id} className="border rounded-xl p-3 bg-gray-50 space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                    <input className="border rounded-lg px-2 py-2 text-sm bg-white" value={floor.floor_name} placeholder="اسم الدور" onChange={(e) => updateFloor(floor.id, (f) => ({ ...f, floor_name: e.target.value }))} />
                    <input className="border rounded-lg px-2 py-2 text-sm bg-white" value={floor.floor_area_m2} placeholder="مساحة الدور م²" onChange={(e) => updateFloor(floor.id, (f) => ({ ...f, floor_area_m2: e.target.value }))} />
                    <select className="border rounded-lg px-2 py-2 text-sm bg-white" value={floor.structure} onChange={(e) => updateFloor(floor.id, (f) => ({ ...f, structure: e.target.value }))}>
                      {STRUCTURE_OPTIONS.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                    <select className="border rounded-lg px-2 py-2 text-sm bg-white" value={floor.classification} onChange={(e) => updateFloor(floor.id, (f) => ({ ...f, classification: e.target.value }))}>
                      {STRUCTURAL_CLASS_OPTIONS.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className={`text-xs font-semibold px-2 py-1.5 rounded-lg ${balance.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'}`}>
                    مجموع المناطق: {balance.zonesSum || 0} م² · مساحة الدور: {balance.floorArea || 0} م²
                    {!balance.ok ? ` · الفرق ${balance.diff > 0 ? '+' : ''}${balance.diff}` : ' · متطابق'}
                  </div>
                  <div className="space-y-2">
                    {floor.zones.map((zone) => (
                      <div key={zone.id} className="grid grid-cols-1 md:grid-cols-12 gap-2 items-start bg-white border rounded-lg p-2">
                        <div className="md:col-span-4">
                          <select
                            className="w-full border rounded-lg px-2 py-2 text-sm"
                            value={zone.use_code}
                            onChange={(e) => {
                              const use = getZoneUse(e.target.value);
                              updateZone(floor.id, zone.id, (z) => createZone({ ...z, use_code: use.id, label: use.label, area_m2: z.area_m2 }));
                            }}
                          >
                            {ZONE_USE_OPTIONS.map((opt) => (
                              <option key={opt.id} value={opt.id}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="md:col-span-3">
                          <input className="w-full border rounded-lg px-2 py-2 text-sm" value={zone.label} onChange={(e) => updateZone(floor.id, zone.id, (z) => ({ ...z, label: e.target.value }))} placeholder="وصف المنطقة" />
                        </div>
                        <div className="md:col-span-2">
                          <input className="w-full border rounded-lg px-2 py-2 text-sm" value={zone.area_m2} onChange={(e) => updateZone(floor.id, zone.id, (z) => ({ ...z, area_m2: e.target.value }))} placeholder="م²" />
                        </div>
                        <div className="md:col-span-2 text-[11px] text-gray-600 pt-2">
                          GROUP {zone.group_letter || '—'} · {zone.risk_label || '—'}
                        </div>
                        <div className="md:col-span-1 text-left">
                          <button type="button" className="text-rose-600 text-xs" onClick={() => updateFloor(floor.id, (f) => ({ ...f, zones: f.zones.filter((z) => z.id !== zone.id) }))}>
                            حذف
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <button type="button" className="text-xs font-semibold text-[#1f4d3a]" onClick={() => updateFloor(floor.id, (f) => ({ ...f, zones: [...f.zones, createZone({ area_m2: '' })] }))}>
                      + منطقة
                    </button>
                    <button type="button" className="text-xs text-rose-600" onClick={() => setFloorsAndClassify(report.floor_uses.filter((f) => f.id !== floor.id))}>
                      حذف الدور
                    </button>
                  </div>
                </article>
              );
            })}
          </section>

          <section className="bg-white border rounded-xl p-4 space-y-3">
            <h4 className="font-bold text-gray-800">إثباتات من الكود السعودي</h4>
            <p className="text-xs text-gray-500">جداول مستنتجة تلقائياً لتصنيف المبنى والخطورة واشتراط الإطفاء بالماء وغيرها. يمكن إرفاق صورة مقطع من الكود.</p>
            <div className="space-y-3">
              {proofCards.map((card) => (
                <div key={card.id} className="border rounded-xl overflow-hidden">
                  <div className="bg-[#1f4d3a] text-white px-3 py-2 text-sm font-bold">{card.title}</div>
                  <div className="px-3 py-2 text-sm font-semibold text-[#c0392b] bg-rose-50">{card.subtitle}</div>
                  <table className="w-full text-sm">
                    <tbody>
                      {card.rows.map((row, idx) => (
                        <tr key={`${card.id}-${idx}`} className="border-t">
                          <th className="text-right p-2 bg-slate-50 w-[38%] font-semibold text-gray-700">{row.label}</th>
                          <td className="p-2 text-gray-800">{row.value}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {card.highlight ? <p className="px-3 py-2 text-xs text-amber-800 bg-amber-50 border-t">{card.highlight}</p> : null}
                  <p className="px-3 py-1.5 text-[10px] text-gray-400 border-t">مراجع: {card.refs.join(' · ')}</p>
                </div>
              ))}
            </div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-semibold text-gray-700">صور مقاطع من الكود</p>
                <label className="text-xs font-semibold text-[#1f4d3a] cursor-pointer">
                  + صورة كود
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => void uploadPhoto(e.target.files?.[0] || null, (photo) => patch({ code_proof_photos: [...(report.code_proof_photos || []), photo] }))} />
                </label>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {(report.code_proof_photos || []).map((photo) => (
                  <div key={photo.id} className="relative border rounded-lg overflow-hidden bg-gray-50">
                    {photo.dataUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={photo.dataUrl} alt={photo.caption || 'كود'} className="w-full h-28 object-cover" />
                    ) : null}
                    <button type="button" className="absolute top-1 left-1 bg-white/90 text-rose-600 text-[10px] px-1.5 py-0.5 rounded" onClick={() => patch({ code_proof_photos: (report.code_proof_photos || []).filter((p) => p.id !== photo.id) })}>
                      حذف
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </div>
      )}

      {['firefighting', 'ventilation', 'alarm', 'exits'].includes(chapter) && (
        <div className="space-y-3">
          {(() => {
            const bundle = itemsForChapter(chapter);
            if (!bundle) return null;
            return bundle.items.map((item, index) => {
              const catalog = TECH_REPORT_ITEMS.find((c) => c.id === item.id);
              if (!catalog) return null;
              return (
                <article key={item.id} className="bg-white border rounded-xl p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <label className="flex items-center gap-2 font-bold text-gray-800">
                      <input type="checkbox" checked={item.enabled} onChange={(e) => updateItemList(bundle.key, item.id, (row) => ({ ...row, enabled: e.target.checked }))} />
                      <span>
                        {index + 1}. {catalog.title}
                      </span>
                    </label>
                    <span className="text-[10px] text-gray-400">عنوان رئيسي ثابت</span>
                  </div>
                  {item.enabled && (
                    <>
                      <div>
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className="text-sm text-gray-600">ملاحظات فنية (بمساعدة المسودة الذكية)</span>
                          <button
                            type="button"
                            className="text-xs font-semibold text-[#1f4d3a] border border-[#1f4d3a]/20 rounded-lg px-2 py-1"
                            onClick={() => {
                              const draft = buildAiDraftNotes(catalog.title, item.selectedOptions, facility.business_name);
                              updateItemList(bundle.key, item.id, (row) => ({
                                ...row,
                                notes: row.notes?.trim() ? `${row.notes.trim()}\n\n${draft}` : draft,
                              }));
                            }}
                          >
                            مساعدة AI
                          </button>
                        </div>
                        <textarea value={item.notes} onChange={(e) => updateItemList(bundle.key, item.id, (row) => ({ ...row, notes: e.target.value }))} className="w-full border rounded-xl px-3 py-2 min-h-20 text-sm" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-gray-700 mb-2">اختيارات فرعية للمهندس</p>
                        <div className="space-y-2">
                          {catalog.optionChoices.map((choice) => {
                            const checked = item.selectedOptions.includes(choice);
                            return (
                              <label key={choice} className="flex items-start gap-2 text-sm text-gray-700">
                                <input
                                  type="checkbox"
                                  className="mt-1"
                                  checked={checked}
                                  onChange={() =>
                                    updateItemList(bundle.key, item.id, (row) => ({
                                      ...row,
                                      selectedOptions: checked ? row.selectedOptions.filter((x) => x !== choice) : [...row.selectedOptions, choice],
                                    }))
                                  }
                                />
                                <span>{choice}</span>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-sm font-semibold text-gray-700">صور البند / الملاحظة</p>
                          <label className="text-xs font-semibold text-[#1f4d3a] cursor-pointer">
                            + صورة
                            <input type="file" accept="image/*" className="hidden" onChange={(e) => void uploadPhoto(e.target.files?.[0] || null, (photo) => updateItemList(bundle.key, item.id, (row) => ({ ...row, photos: [...row.photos, photo] })))} />
                          </label>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                          {item.photos.map((photo) => (
                            <div key={photo.id} className="relative border rounded-lg overflow-hidden bg-gray-50">
                              {photo.dataUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={photo.dataUrl} alt={photo.caption || 'صورة'} className="w-full h-24 object-cover" />
                              ) : (
                                <div className="h-24 flex items-center justify-center text-xs text-gray-400">لا صورة</div>
                              )}
                              <button type="button" className="absolute top-1 left-1 bg-white/90 text-rose-600 text-[10px] px-1.5 py-0.5 rounded" onClick={() => updateItemList(bundle.key, item.id, (row) => ({ ...row, photos: row.photos.filter((p) => p.id !== photo.id) }))}>
                                حذف
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    </>
                  )}
                </article>
              );
            });
          })()}
        </div>
      )}

      {chapter === 'recommendations' && (
        <section className="bg-white border rounded-xl p-4 space-y-3">
          <h4 className="font-bold text-gray-800">التوصيات العامة (اختيارات فقط — بدون كتابة حرة)</h4>
          <div className="space-y-2">
            {TECH_REPORT_GENERAL_RECOMMENDATIONS.map((item, index) => {
              const current = report.general_recommendations.find((r) => r.id === item.id);
              const checked = Boolean(current?.checked);
              return (
                <label key={item.id} className="flex items-start gap-2 text-sm text-gray-800 border rounded-xl px-3 py-2.5">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={checked}
                    onChange={() => {
                      const general_recommendations = TECH_REPORT_GENERAL_RECOMMENDATIONS.map((rec) => {
                        const existing = report.general_recommendations.find((r) => r.id === rec.id);
                        if (rec.id === item.id) return { id: rec.id, checked: !checked };
                        return existing || { id: rec.id, checked: false };
                      });
                      patch({ general_recommendations });
                    }}
                  />
                  <span>
                    <strong className="ml-1">{index + 1}.</strong>
                    {item.label}
                  </span>
                </label>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

function buildAiDraftNotes(title: string, selectedOptions: string[], projectName: string) {
  const optionsText =
    selectedOptions.length > 0 ? selectedOptions.map((opt, i) => `${i + 1}) ${opt}`).join('؛ ') : 'وفق الاشتراطات المعتمدة والمخططات الهندسية';
  return `بالنسبة لبند (${title}) في مشروع (${projectName || 'المنشأة'}): يُوصى ${optionsText}. مع الالتزام بمتطلبات كود البناء السعودي والدفاع المدني، والتنفيذ عبر جهة معتمدة وبمواد مطابقة للمواصفات.`;
}

function ReadOnly({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white border rounded-lg px-3 py-2">
      <p className="text-[11px] text-gray-500">{label}</p>
      <p className="font-semibold text-gray-800">{value || '—'}</p>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <label className="block text-sm">
      <span className="text-gray-600 mb-1 block">{label}</span>
      <input type={type} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className="w-full border rounded-xl px-3 py-2.5" />
    </label>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly string[];
}) {
  return (
    <label className="block text-sm">
      <span className="text-gray-600 mb-1 block">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="w-full border rounded-xl px-3 py-2.5">
        <option value="">—</option>
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    </label>
  );
}

function PhotoBox({
  title,
  photo,
  onUpload,
  onClear,
}: {
  title: string;
  photo?: TechnicalReportPhoto | null;
  onUpload: (file: File | null) => void;
  onClear: () => void;
}) {
  return (
    <div className="border rounded-xl p-3 bg-gray-50">
      <p className="text-sm font-semibold text-gray-700 mb-2">{title}</p>
      {photo?.dataUrl ? (
        <div className="relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photo.dataUrl} alt={title} className="w-full h-36 object-cover rounded-lg" />
          <button type="button" onClick={onClear} className="absolute top-2 left-2 bg-white text-rose-600 text-xs px-2 py-1 rounded">
            حذف
          </button>
        </div>
      ) : (
        <label className="h-36 border border-dashed rounded-lg flex items-center justify-center text-xs text-gray-500 cursor-pointer bg-white">
          اضغط لرفع صورة
          <input type="file" accept="image/*" className="hidden" onChange={(e) => onUpload(e.target.files?.[0] || null)} />
        </label>
      )}
    </div>
  );
}
