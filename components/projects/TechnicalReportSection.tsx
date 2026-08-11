'use client';

import { useMemo, useState } from 'react';
import {
  BUILDING_STATUS_OPTIONS,
  TECH_REPORT_CHAPTERS,
  TECH_REPORT_GENERAL_RECOMMENDATIONS,
  TECH_REPORT_ITEMS,
  type TechReportChapterId,
} from '@/lib/constants/technical-report';
import { getTechnicalReportFacilitySnapshot } from '@/lib/projects/technical-report';
import {
  applyAutoClassification,
  buildCodeProofCards,
  buildOccupantEgressRows,
  buildZoneSystemNeeds,
} from '@/lib/projects/sbc-classification';
import FloorZonesEditor from '@/components/projects/FloorZonesEditor';
import type { ClientRecord } from '@/lib/types/client';
import type {
  TechnicalReport,
  TechnicalReportFloorUse,
  TechnicalReportPhoto,
  TechnicalReportSectionItem,
} from '@/lib/types/project-reports';
import { uploadTechnicalReportPhoto } from '@/lib/projects/technical-report-photos';

const REPORT_STATUSES = ['مسودة', 'قيد الإعداد', 'مكتمل', 'معتمد'] as const;

type Props = {
  client: ClientRecord;
  report: TechnicalReport;
  onChange: (next: TechnicalReport) => void;
  onSave: () => void;
  onPrint: () => void;
  saving: boolean;
  /** Controlled chapter — when set, parent drives navigation (اعتماد وانتقال) */
  chapter?: TechReportChapterId;
  onChapterChange?: (chapter: TechReportChapterId) => void;
};

export default function TechnicalReportSection({
  client,
  report,
  onChange,
  onSave,
  onPrint,
  saving,
  chapter: chapterProp,
  onChapterChange,
}: Props) {
  const [internalChapter, setInternalChapter] = useState<TechReportChapterId>('facility');
  const chapter = chapterProp ?? internalChapter;
  const setChapter = (next: TechReportChapterId) => {
    if (onChapterChange) onChapterChange(next);
    else setInternalChapter(next);
  };
  const facility = useMemo(() => getTechnicalReportFacilitySnapshot(client), [client]);
  const proofCards = useMemo(() => buildCodeProofCards(report, client), [report, client]);
  const zoneNeeds = useMemo(() => buildZoneSystemNeeds(report.floor_uses || []), [report.floor_uses]);
  const egressRows = useMemo(() => buildOccupantEgressRows(report.floor_uses || []), [report.floor_uses]);

  const patch = (partial: Partial<TechnicalReport>) => onChange({ ...report, ...partial });

  const addProofPhoto = (key: string, photo: TechnicalReportPhoto) => {
    const current = report.code_proofs_by_key || {};
    patch({
      code_proofs_by_key: {
        ...current,
        [key]: [...(current[key] || []), photo],
      },
    });
  };

  const removeProofPhoto = (key: string, photoId: string) => {
    const current = report.code_proofs_by_key || {};
    patch({
      code_proofs_by_key: {
        ...current,
        [key]: (current[key] || []).filter((p) => p.id !== photoId),
      },
    });
  };

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
    try {
      const photo = await uploadTechnicalReportPhoto({
        clientId: client.id,
        file,
        caption: file.name,
      });
      apply(photo);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'تعذر رفع الصورة');
    }
  };

  const itemsForChapter = (chapterId: string) => {
    if (chapterId === 'firefighting') return { key: 'firefighting_items' as const, items: report.firefighting_items };
    if (chapterId === 'ventilation') return { key: 'ventilation_items' as const, items: report.ventilation_items };
    if (chapterId === 'alarm') return { key: 'alarm_items' as const, items: report.alarm_items };
    if (chapterId === 'exits') return { key: 'exits_items' as const, items: report.exits_items };
    return null;
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

      <div className="flex flex-wrap gap-2" id="technical-report-chapters">
        {TECH_REPORT_CHAPTERS.map((item, index) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setChapter(item.id)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${
              chapter === item.id ? 'bg-[#1f4d3a] text-white border-[#1f4d3a]' : 'bg-white text-gray-700'
            }`}
          >
            {index + 1}. {item.title}
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
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">رقم الصادر</label>
                <input
                  readOnly
                  value={report.outgoing_number || 'يُصدر تلقائياً عند الحفظ'}
                  className="w-full border rounded-xl px-3 py-2.5 bg-gray-50 text-gray-700"
                />
                <p className="text-[11px] text-gray-400 mt-1">تسلسل سنوي تلقائي بصيغة OUT-YYYY-NNNN</p>
              </div>
              <Field label="قسم الدفاع المدني المختص" value={report.civil_defense_branch || ''} onChange={(v) => patch({ civil_defense_branch: v })} />
              <SelectField label="حالة المبنى" value={report.building_status || ''} onChange={(v) => patch({ building_status: v })} options={BUILDING_STATUS_OPTIONS} />
              <Field label="رقم الصك" value={report.deed_number || ''} onChange={(v) => patch({ deed_number: v })} />
              <Field label="تاريخ الصك" value={report.deed_date || ''} onChange={(v) => patch({ deed_date: v })} />
              <ReadOnly label="رقم رخصة البناء (من المبيعات)" value={report.building_permit_number || '—'} />
              <ReadOnly label="تاريخ رخصة البناء (من المبيعات)" value={report.building_permit_date || '—'} />
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
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field
                label="خط العرض (Latitude)"
                value={report.gps_lat || ''}
                onChange={(v) => patch({ gps_lat: v })}
              />
              <Field
                label="خط الطول (Longitude)"
                value={report.gps_lng || ''}
                onChange={(v) => patch({ gps_lng: v })}
              />
            </div>
            <p className="text-xs text-gray-500">
              صورة الواجهة تظهر في صفحة الغلاف، وصورة Google Earth مع الإحداثيات في صفحة بيانات الموقع
              (الصفحة 5 من التقرير المطبوع).
            </p>
          </section>

          <section className="bg-white border rounded-xl p-4 space-y-3">
            <h4 className="font-bold text-gray-800">صور الزيارة / الموقع</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <PhotoBox title="صورة واجهة المشروع (الغلاف)" photo={report.facade_photo} onUpload={(file) => void uploadPhoto(file, (photo) => patch({ facade_photo: photo }))} onClear={() => patch({ facade_photo: null })} />
              <PhotoBox title="صورة الموقع من الخريطة (Google Earth)" photo={report.earth_photo} onUpload={(file) => void uploadPhoto(file, (photo) => patch({ earth_photo: photo }))} onClear={() => patch({ earth_photo: null })} />
              <PhotoBox title="صورة عامة من الموقع" photo={report.site_photo} onUpload={(file) => void uploadPhoto(file, (photo) => patch({ site_photo: photo }))} onClear={() => patch({ site_photo: null })} />
            </div>
          </section>

          <FloorZonesEditor
            floors={report.floor_uses || []}
            onChange={setFloorsAndClassify}
            onUploadPhoto={(file, apply) => void uploadPhoto(file, apply)}
          />

          <section className="bg-white border rounded-xl p-4 space-y-3">
            <h4 className="font-bold text-gray-800">إثباتات من الكود السعودي</h4>
            <p className="text-xs text-gray-500">تحت كل معلومة مصدرها الكود أرفق صورة مقصوصة حقيقية من جداول/بنود SBC.</p>
            <div className="space-y-3">
              {proofCards.map((card) => {
                const photos = (report.code_proofs_by_key || {})[card.id] || [];
                return (
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
                    <div className="px-3 py-2 border-t bg-white space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold text-gray-700">صورة مقطع الكود تحت هذا الإثبات</p>
                        <label className="text-xs font-semibold text-[#1f4d3a] cursor-pointer">
                          + صورة مقصوصة
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) =>
                              void uploadPhoto(e.target.files?.[0] || null, (photo) => addProofPhoto(card.id, photo))
                            }
                          />
                        </label>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                        {photos.map((photo) => (
                          <div key={photo.id} className="relative border rounded-lg overflow-hidden bg-gray-50">
                            {photo.dataUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={photo.dataUrl} alt={photo.caption || 'كود'} className="w-full h-28 object-cover" />
                            ) : null}
                            <button
                              type="button"
                              className="absolute top-1 left-1 bg-white/90 text-rose-600 text-[10px] px-1.5 py-0.5 rounded"
                              onClick={() => removeProofPhoto(card.id, photo.id)}
                            >
                              حذف
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

        </div>
      )}

      {['firefighting', 'ventilation', 'alarm', 'exits'].includes(chapter) && (
        <div className="space-y-3">
          {chapter === 'firefighting' && zoneNeeds.length > 0 && (
            <section className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-4 space-y-2">
              <h4 className="font-bold text-[#1f4d3a] text-sm">توزيع أنظمة الإطفاء حسب الأدوار والمناطق</h4>
              <div className="overflow-x-auto">
                <table className="w-full text-xs bg-white rounded-lg overflow-hidden">
                  <thead className="bg-emerald-100 text-[#1f4d3a]">
                    <tr>
                      <th className="p-2 text-right">الدور</th>
                      <th className="p-2 text-right">المنطقة</th>
                      <th className="p-2 text-right">النظام</th>
                      <th className="p-2 text-right">المساحة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {zoneNeeds.map((n, i) => (
                      <tr key={`${n.floor_name}-${n.zone_label}-${i}`} className="border-t">
                        <td className="p-2">{n.floor_name}</td>
                        <td className="p-2">
                          {n.zone_label}
                          {n.subtype_label ? ` (${n.subtype_label})` : ''}
                        </td>
                        <td className="p-2">{n.suppression_label}</td>
                        <td className="p-2">{n.area_m2 ? `${n.area_m2} م²` : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {chapter === 'exits' && egressRows.length > 0 && (
            <section className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-2">
              <h4 className="font-bold text-slate-800 text-sm">حصر الشاغلين والأبواب المطلوبة</h4>
              <div className="overflow-x-auto">
                <table className="w-full text-xs bg-white rounded-lg overflow-hidden">
                  <thead className="bg-slate-200 text-slate-800">
                    <tr>
                      <th className="p-2 text-right">الدور</th>
                      <th className="p-2 text-right">المنطقة</th>
                      <th className="p-2 text-right">الشاغلون</th>
                      <th className="p-2 text-right">أبواب مطلوبة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {egressRows.map((row, i) => (
                      <tr key={`${row.floor_name}-${row.zone_label}-${i}`} className="border-t">
                        <td className="p-2">{row.floor_name}</td>
                        <td className="p-2">{row.zone_label}</td>
                        <td className="p-2">{row.occupants ?? '—'}</td>
                        <td className="p-2">{row.required_exits ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

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
                          <span className="text-sm text-gray-600">نقاط فنية ومواصفات (مختصرة)</span>
                          <button
                            type="button"
                            className="text-xs font-semibold text-[#1f4d3a] border border-[#1f4d3a]/20 rounded-lg px-2 py-1"
                            onClick={() => {
                              const draft = buildSpecBullets(item.selectedOptions);
                              updateItemList(bundle.key, item.id, (row) => ({
                                ...row,
                                notes: draft,
                              }));
                            }}
                          >
                            توليد نقاط من الاختيارات
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

function buildSpecBullets(selectedOptions: string[]) {
  if (!selectedOptions.length) return '';
  return selectedOptions.map((opt) => `• ${opt}`).join('\n');
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
  const src = photo?.dataUrl || null;
  const hasCloudOnly = Boolean(photo?.storagePath && !src);
  return (
    <div className="border rounded-xl p-3 bg-gray-50">
      <p className="text-sm font-semibold text-gray-700 mb-2">{title}</p>
      {src ? (
        <div className="relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt={title} className="w-full h-36 object-cover rounded-lg" />
          <button type="button" onClick={onClear} className="absolute top-2 left-2 bg-white text-rose-600 text-xs px-2 py-1 rounded">
            حذف
          </button>
        </div>
      ) : hasCloudOnly ? (
        <div className="relative h-36 border rounded-lg flex flex-col items-center justify-center gap-2 bg-white text-xs text-emerald-800">
          <span>الصورة محفوظة في السحابة — ستظهر بعد إعادة فتح الملف أو الطباعة</span>
          <button type="button" onClick={onClear} className="text-rose-600 font-semibold">
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
