'use client';

import { useMemo, useState, type DragEvent, type ReactNode } from 'react';
import {
  buildLegacyTechnicalEvidenceView,
  deleteTechnicalEvidenceSafely,
  emptyTechnicalEvidenceState,
  normalizeTechnicalEvidenceState,
  resolveTechnicalEvidenceFileSrc,
  uploadTechnicalEvidenceFile,
  validateTechnicalEvidenceUpload,
  type TechnicalEvidenceViewItem,
} from '@/lib/projects/technical-report-evidence';
import type { DesignSpaceSafetyFloor } from '@/lib/projects/design-center/types';
import type {
  CivilDefenseLocationEvidence,
  ProjectEngineeringData,
  TechnicalEvidenceItem,
  TechnicalEvidenceKind,
  TechnicalEvidenceState,
  TechnicalReport,
} from '@/lib/types/project-reports';

type Props = {
  clientId: string;
  data: ProjectEngineeringData;
  report: TechnicalReport;
  saving: boolean;
  onChange: (next: TechnicalReport) => void;
  /** Persists the metadata snapshot before the Phase 4A bridge is permitted to remove Storage. */
  onPersistEvidenceMetadata: (next: TechnicalEvidenceState) => Promise<void>;
};

type EvidenceGroupId = 'site' | 'existing' | 'systems' | 'code';
type UploadFailure = { id: string; file: File; kind: TechnicalEvidenceKind; category: string; error: string };

const GROUPS: Array<{ id: EvidenceGroupId; title: string; description: string; kinds: TechnicalEvidenceKind[]; empty: string }> = [
  {
    id: 'site',
    title: 'الموقع والدفاع المدني',
    description: 'صور الموقع والمراجع المرفقة وبيانات الدفاع المدني التي أدخلها أو أكدها المهندس يدويًا.',
    kinds: ['site_general', 'satellite_image', 'civil_defense_map', 'civil_defense_route'],
    empty: 'لا توجد مراجع مضافة للموقع أو الدفاع المدني.',
  },
  {
    id: 'existing',
    title: 'صور الوضع الراهن',
    description: 'توثيق مرئي للحالة القائمة مع وصف مستقل وملاحظة هندسية اختيارية.',
    kinds: ['existing_condition'],
    empty: 'لا توجد صور مضافة للوضع الراهن.',
  },
  {
    id: 'systems',
    title: 'صور أنظمة السلامة',
    description: 'صور توثيقية فقط. ارتباط الصورة بالنظام لا يغير الكميات أو درجة الخطورة أو بيانات المساحات.',
    kinds: ['safety_system'],
    empty: 'لا توجد صور مضافة لأنظمة السلامة.',
  },
  {
    id: 'code',
    title: 'مقتطفات الكود والمراجع',
    description: 'يرفع المهندس المرجع الحقيقي ويعرّف بياناته يدويًا؛ لا يولد النظام أي نص أو بند أو ادعاء مطابقة.',
    kinds: ['code_excerpt'],
    empty: 'لا توجد مقتطفات كود أو مراجع مرفوعة.',
  },
];

const SITE_CATEGORIES = [
  ['site_general', 'صورة الموقع العام'],
  ['satellite_image', 'صورة جوية / أقمار صناعية'],
  ['civil_defense_map', 'خريطة الوصول'],
  ['civil_defense_route', 'مسار إلى مركز الدفاع المدني'],
  ['site_general', 'مرجع إضافي للموقع'],
] as const;

const EXISTING_CATEGORIES = [
  'الموقع العام', 'الواجهات', 'المداخل', 'المخارج', 'الممرات', 'السلالم', 'غرف الخدمات',
  'غرف الكهرباء', 'غرف المضخات', 'خزانات المياه', 'المستودعات', 'مناطق الإنتاج', 'مناطق التجمع',
  'الأسقف', 'غرف المولدات', 'المناطق الخارجية', 'أخرى',
];

const SYSTEM_OPTIONS = [
  ['fire_pump', 'مضخة الحريق'], ['fire_water_tank', 'خزان مياه الحريق'], ['sprinkler', 'شبكة الرش الآلي'],
  ['hose_reel', 'صناديق الحريق'], ['fire_hydrant', 'حنفيات الحريق'], ['fdc', 'وصلة الدفاع المدني'],
  ['fire_extinguisher', 'الطفايات اليدوية'], ['fire_alarm_panel', 'لوحة إنذار الحريق'],
  ['smoke_detector', 'كواشف الدخان'], ['heat_detector', 'كواشف الحرارة'], ['manual_call_point', 'نقاط النداء اليدوية'],
  ['alarm_bell', 'الأجراس / أجهزة التنبيه'], ['emergency_light', 'كشافات الطوارئ'], ['signage', 'اللوحات الإرشادية'],
  ['emergency_exit', 'مخارج الطوارئ'], ['fire_door', 'أبواب الحريق'], ['emergency_stairs', 'سلالم الطوارئ'],
  ['smoke_control', 'التحكم بالدخان'], ['mechanical_ventilation', 'التهوية الميكانيكية'], ['generator', 'المولد'],
  ['electrical_safety', 'السلامة الكهربائية'], ['grounding', 'التأريض'], ['lightning_protection', 'الحماية من الصواعق'],
  ['special_suppression', 'أنظمة الإطفاء الخاصة'], ['other', 'أخرى'],
] as const;

const REPORT_SECTION_OPTIONS = [
  ['project_summary', 'ملخص المشروع'], ['egress', 'الإخلاء والمخارج'], ['firefighting', 'أنظمة مكافحة الحريق'],
  ['alarm', 'الإنذار والإخلاء'], ['electrical', 'السلامة الكهربائية'], ['mechanical', 'السلامة الميكانيكية'],
] as const;

const STANDARD_OPTIONS = ['SBC 801', 'NFPA 13', 'NFPA 14', 'NFPA 20', 'NFPA 22', 'NFPA 25', 'NFPA 72', 'NFPA 101', 'أخرى'];
const CONTROL = 'w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm text-slate-800 disabled:cursor-not-allowed disabled:bg-slate-100';

function evidenceId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return `evidence-${crypto.randomUUID()}`;
  return `evidence-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function now() {
  return new Date().toISOString();
}

function formatSize(value?: number | null) {
  if (value == null) return 'الحجم غير متاح';
  return value < 1024 * 1024 ? `${Math.max(1, Math.round(value / 1024))} KB` : `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function isImage(item: Pick<TechnicalEvidenceViewItem, 'file'>) {
  return Boolean(item.file.mimeType && /^image\/(jpeg|png)$/i.test(item.file.mimeType));
}

export function groupForTechnicalEvidenceKind(kind: TechnicalEvidenceKind): EvidenceGroupId {
  if (kind === 'existing_condition') return 'existing';
  if (kind === 'safety_system') return 'systems';
  if (kind === 'code_excerpt') return 'code';
  return 'site';
}

export function reorderTechnicalEvidenceItems(items: TechnicalEvidenceItem[], id: string, direction: -1 | 1): TechnicalEvidenceItem[] {
  const ordered = [...items].sort((a, b) => a.display_order - b.display_order || a.id.localeCompare(b.id));
  const index = ordered.findIndex((item) => item.id === id);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= ordered.length) return ordered;
  [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
  return normalizeOrders(ordered);
}

function defaultKind(group: EvidenceGroupId): TechnicalEvidenceKind {
  if (group === 'existing') return 'existing_condition';
  if (group === 'systems') return 'safety_system';
  if (group === 'code') return 'code_excerpt';
  return 'site_general';
}

function defaultCategory(group: EvidenceGroupId) {
  if (group === 'site') return 'site_general';
  if (group === 'existing') return EXISTING_CATEGORIES[0];
  if (group === 'systems') return SYSTEM_OPTIONS[0][0];
  return 'code_reference';
}

function normalizeOrders(items: TechnicalEvidenceItem[]) {
  return items.map((item, index) => ({ ...item, display_order: index + 1, updated_at: now() }));
}

function cloneEvidenceState(report: TechnicalReport) {
  return normalizeTechnicalEvidenceState(report.evidence || emptyTechnicalEvidenceState());
}

function asNullable(value: string) {
  return value.trim() || null;
}

export default function TechnicalEvidenceManager({
  clientId,
  data,
  report,
  saving,
  onChange,
  onPersistEvidenceMetadata,
}: Props) {
  const [activeGroup, setActiveGroup] = useState<EvidenceGroupId>('site');
  const [uploading, setUploading] = useState<Record<string, boolean>>({});
  const [failures, setFailures] = useState<Record<string, UploadFailure>>({});
  const [previews, setPreviews] = useState<Record<string, string | null>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [viewer, setViewer] = useState<TechnicalEvidenceViewItem | null>(null);

  const state = useMemo(() => cloneEvidenceState(report), [report]);
  const legacy = useMemo(() => buildLegacyTechnicalEvidenceView(report), [report]);
  const floors = data.design_center.space_safety?.floors || [];

  const replaceState = (next: TechnicalEvidenceState) => {
    onChange({ ...report, evidence: next });
  };

  const updateCivilDefense = (partial: Partial<CivilDefenseLocationEvidence>) => {
    replaceState({
      ...state,
      civil_defense: { ...(state.civil_defense || {}), ...partial },
    });
  };

  const updateItem = (id: string, updater: (item: TechnicalEvidenceItem) => TechnicalEvidenceItem) => {
    const items = state.items.map((item) => (item.id === id ? { ...updater(item), updated_at: now() } : item));
    replaceState({ ...state, items });
  };

  const uploadFiles = async (group: EvidenceGroupId, files: FileList | File[]) => {
    const selected = Array.from(files || []);
    if (!selected.length) return;
    setError(null);
    setNotice(null);
    const baseItems = state.items;
    const uploaded: TechnicalEvidenceItem[] = [];
    let cloudCount = 0;
    for (const file of selected) {
      const validation = validateTechnicalEvidenceUpload(file);
      const kind = defaultKind(group);
      const category = defaultCategory(group);
      const retryId = evidenceId();
      if (!validation.ok) {
        setFailures((current) => ({
          ...current,
          [retryId]: { id: retryId, file, kind, category, error: validation.error },
        }));
        setError(`${file.name}: ${validation.error}`);
        continue;
      }
      setUploading((current) => ({ ...current, [retryId]: true }));
      try {
        const outcome = await uploadTechnicalEvidenceFile({ clientId, evidenceId: retryId, kind, file });
        uploaded.push({
          id: retryId,
          kind,
          category,
          title: file.name,
          caption: null,
          engineering_observation: null,
          display_order: baseItems.length + uploaded.length + 1,
          include_in_report: false,
          association: null,
          file: outcome.file,
          code_reference: kind === 'code_excerpt' ? {} : null,
          created_at: now(),
        });
        if (outcome.cloudPersisted) cloudCount += 1;
        else setNotice(outcome.warning || 'تم الاحتفاظ بمرفق محلي مؤقتًا؛ أعد المحاولة قبل الحفظ النهائي.');
      } catch (caught) {
        const message = caught instanceof Error ? caught.message : 'تعذر رفع المرفق.';
        setFailures((current) => ({ ...current, [retryId]: { id: retryId, file, kind, category, error: message } }));
        setError(`${file.name}: ${message}`);
      } finally {
        setUploading((current) => ({ ...current, [retryId]: false }));
      }
    }
    if (uploaded.length) {
      replaceState({ ...state, items: normalizeOrders([...baseItems, ...uploaded]) });
      if (cloudCount) setNotice(`تم رفع ${cloudCount} مرفق/مرفقات. عدّل البيانات ثم اضغط «حفظ التقرير» لتثبيت البيانات الوصفية.`);
    }
  };

  const uploadOne = async (entry: { id: string; file: File; kind: TechnicalEvidenceKind; category: string }) => {
    setUploading((current) => ({ ...current, [entry.id]: true }));
    setError(null);
    try {
      const outcome = await uploadTechnicalEvidenceFile({
        clientId,
        evidenceId: entry.id,
        kind: entry.kind,
        file: entry.file,
      });
      const nextItem: TechnicalEvidenceItem = {
        id: entry.id,
        kind: entry.kind,
        category: entry.category,
        title: entry.file.name,
        caption: null,
        engineering_observation: null,
        display_order: state.items.length + 1,
        include_in_report: false,
        association: null,
        file: outcome.file,
        code_reference: entry.kind === 'code_excerpt' ? {} : null,
        created_at: now(),
      };
      replaceState({ ...state, items: normalizeOrders([...state.items, nextItem]) });
      setFailures((current) => {
        const next = { ...current };
        delete next[entry.id];
        return next;
      });
      setNotice(outcome.cloudPersisted ? 'تم رفع المرفق. عدّل بياناته ثم اضغط «حفظ التقرير» لتثبيت البيانات الوصفية.' : (outcome.warning || 'تم الاحتفاظ بالمرفق محليًا مؤقتًا؛ أعد المحاولة قبل الحفظ النهائي.'));
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'تعذر رفع المرفق.';
      setFailures((current) => ({ ...current, [entry.id]: { ...entry, error: message } }));
      setError(`${entry.file.name}: ${message}`);
    } finally {
      setUploading((current) => ({ ...current, [entry.id]: false }));
    }
  };

  const retryUpload = async (failure: UploadFailure) => {
    await uploadOne(failure);
  };

  const move = (id: string, direction: -1 | 1) => {
    replaceState({ ...state, items: reorderTechnicalEvidenceItems(state.items, id, direction) });
  };

  const requestDelete = async (item: TechnicalEvidenceItem) => {
    if (!window.confirm('هل تريد حذف هذا المرفق؟')) return;
    setDeleting(item.id);
    setError(null);
    try {
      const result = await deleteTechnicalEvidenceSafely({
        clientId,
        raw: state,
        evidenceId: item.id,
        persistMetadata: async (next) => onPersistEvidenceMetadata(next),
      });
      replaceState(result.state);
      setNotice(result.cleanupPending ? 'حُذفت بيانات المرفق. سيُعاد تنظيف الملف السحابي بأمان لاحقًا.' : 'تم حذف المرفق بأمان.');
      if (result.error && !result.cleanupPending) setError(result.error);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'تعذر حذف المرفق.');
    } finally {
      setDeleting(null);
    }
  };

  const loadPreview = async (item: TechnicalEvidenceItem) => {
    if (item.file.dataUrl?.startsWith('data:') || item.file.dataUrl?.startsWith('http')) {
      setPreviews((current) => ({ ...current, [item.id]: item.file.dataUrl || null }));
      return;
    }
    const src = await resolveTechnicalEvidenceFileSrc({ clientId, item });
    if (!src) {
      setError('تعذر تحميل معاينة آمنة لهذا المرفق.');
      return;
    }
    setPreviews((current) => ({ ...current, [item.id]: src }));
  };

  const visibleNew = state.items.filter((item) => groupForTechnicalEvidenceKind(item.kind) === activeGroup).sort((a, b) => a.display_order - b.display_order || a.id.localeCompare(b.id));
  const visibleLegacy = legacy.filter((item) => groupForTechnicalEvidenceKind(item.kind) === activeGroup);
  const visibleFailures = Object.values(failures).filter((item) => groupForTechnicalEvidenceKind(item.kind) === activeGroup);
  const active = GROUPS.find((group) => group.id === activeGroup)!;

  return (
    <div className="space-y-4" dir="rtl">
      <div className="rounded-xl border border-indigo-100 bg-indigo-50/70 p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h4 className="font-bold text-slate-900">التوثيق والمراجع الفنية</h4>
            <p className="mt-1 text-xs leading-5 text-slate-600">هذه المرفقات توثيقية فقط. لا تظهر في PDF الحالي ولا تغير الكميات أو التصنيف أو بوابات سير العمل.</p>
          </div>
          <span className="shrink-0 rounded-full border border-indigo-200 bg-white px-2 py-1 text-[10px] font-bold text-indigo-700">بيانات التقرير · حفظ يدوي</span>
        </div>
      </div>

      {error ? <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs leading-5 text-rose-900">{error}</div> : null}
      {notice ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs leading-5 text-emerald-900">{notice}</div> : null}

      <div role="tablist" aria-label="أقسام التوثيق والمراجع الفنية" className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {GROUPS.map((group) => (
          <button
            key={group.id}
            type="button"
            role="tab"
            aria-selected={activeGroup === group.id}
            onClick={() => setActiveGroup(group.id)}
            className={`min-h-12 rounded-xl border px-3 py-2 text-right text-xs font-bold transition-colors ${activeGroup === group.id ? 'border-[#635bdb] bg-indigo-50 text-indigo-800' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`}
          >
            {group.title}
          </button>
        ))}
      </div>

      {activeGroup === 'site' ? <CivilDefenseEditor value={state.civil_defense} onChange={updateCivilDefense} /> : null}

      <UploadSurface
        group={activeGroup}
        uploading={Object.values(uploading).some(Boolean)}
        onFiles={(files) => void uploadFiles(activeGroup, files)}
      />

      {visibleFailures.map((failure) => (
        <article key={failure.id} className="rounded-xl border border-rose-200 bg-rose-50 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div><strong className="text-sm text-rose-900">{failure.file.name}</strong><p className="mt-1 text-xs text-rose-800">فشل الرفع — ظل الملف متاحًا لإعادة المحاولة ولم يُنشأ مرفق مكرر.</p></div>
            <button type="button" disabled={Boolean(uploading[failure.id]) || saving} onClick={() => void retryUpload(failure)} className="rounded-lg border border-rose-300 bg-white px-3 py-2 text-xs font-bold text-rose-800 disabled:opacity-60">{uploading[failure.id] ? 'جاري إعادة الرفع...' : 'إعادة المحاولة'}</button>
          </div>
        </article>
      ))}

      {!visibleNew.length && !visibleLegacy.length && !visibleFailures.length ? <EmptyState text={active.empty} /> : null}

      <div className="space-y-3">
        {visibleNew.map((item) => (
          <EvidenceCard
            key={item.id}
            item={item}
            source="evidence"
            floors={floors}
            preview={previews[item.id] || item.file.dataUrl || null}
            canMoveUp={state.items.some((other) => other.display_order < item.display_order)}
            canMoveDown={state.items.some((other) => other.display_order > item.display_order)}
            busy={saving || deleting === item.id}
            onUpdate={(updater) => updateItem(item.id, updater)}
            onMove={(direction) => move(item.id, direction)}
            onPreview={() => void loadPreview(item)}
            onOpenViewer={() => setViewer({ ...item, source: 'evidence' })}
            onDelete={() => void requestDelete(item)}
          />
        ))}
        {visibleLegacy.map((item) => <EvidenceCard key={item.id} item={item} source="legacy" floors={floors} preview={item.file.dataUrl || null} busy onPreview={() => {}} onOpenViewer={() => setViewer(item)} />)}
      </div>

      <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-[11px] leading-5 text-slate-600">«إدراج في التقرير» يحفظ تفضيلًا مستقبليًا فقط. لن يتغير ملف PDF أو الفهرس في هذه المرحلة. تظهر روابط العرض الموقعة مؤقتًا في الواجهة ولا تُحفظ داخل بيانات المشروع.</p>

      {viewer ? <ImageViewer item={viewer} src={previews[viewer.id] || viewer.file.dataUrl || null} onClose={() => setViewer(null)} /> : null}
    </div>
  );
}

function UploadSurface({ group, uploading, onFiles }: { group: EvidenceGroupId; uploading: boolean; onFiles: (files: FileList | File[]) => void }) {
  const onDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    if (!uploading) onFiles(event.dataTransfer.files);
  };
  const description = group === 'code' ? 'JPEG أو PNG أو PDF للمراجع التي يرفعها المهندس' : 'JPEG أو PNG أو PDF';
  return (
    <label
      onDragOver={(event) => event.preventDefault()}
      onDrop={onDrop}
      className={`flex min-h-32 flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-6 text-center ${uploading ? 'cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400' : 'cursor-pointer border-indigo-200 bg-indigo-50/30 text-indigo-800 hover:border-[#635bdb]'}`}
    >
      <span className="text-sm font-bold">{uploading ? 'جاري الرفع...' : 'اسحب الملفات هنا أو اختر للرفع'}</span>
      <span className="text-xs text-slate-600">{description} · SVG وHTML والملفات غير المعروفة غير مقبولة.</span>
      <input
        type="file"
        accept=".jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf"
        multiple
        disabled={uploading}
        aria-label="رفع أدلة فنية"
        className="hidden"
        onChange={(event) => {
          onFiles(event.target.files || []);
          event.target.value = '';
        }}
      />
    </label>
  );
}

function CivilDefenseEditor({ value, onChange }: { value: CivilDefenseLocationEvidence | null; onChange: (partial: Partial<CivilDefenseLocationEvidence>) => void }) {
  const current = value || {};
  const field = (label: string, key: keyof CivilDefenseLocationEvidence, type: 'text' | 'number' = 'text') => (
    <label className="block rounded-xl border border-slate-200 bg-slate-50/60 p-3">
      <span className="mb-1 block text-xs font-semibold text-slate-700">{label}</span>
      <input
        type={type}
        value={current[key] == null ? '' : String(current[key])}
        onChange={(event) => onChange({ [key]: type === 'number' ? (event.target.value === '' ? null : Number(event.target.value)) : asNullable(event.target.value) })}
        className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm"
      />
    </label>
  );
  return (
    <div className="space-y-3 rounded-xl border border-sky-100 bg-sky-50/60 p-4">
      <div><p className="font-bold text-slate-900">بيانات مركز الدفاع المدني</p><p className="mt-1 text-xs leading-5 text-slate-600">البيانات مدخلة أو مؤكدة من المهندس، ولا يتم تحديد أقرب مركز أو المسار أو المسافة تلقائيًا.</p></div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {field('اسم مركز الدفاع المدني', 'center_name')}
        {field('المسافة', 'distance_value', 'number')}
        <label className="block rounded-xl border border-slate-200 bg-slate-50/60 p-3"><span className="mb-1 block text-xs font-semibold text-slate-700">وحدة المسافة</span><select value={current.distance_unit || ''} onChange={(event) => onChange({ distance_unit: (event.target.value || null) as CivilDefenseLocationEvidence['distance_unit'] })} className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm"><option value="">— اختر —</option><option value="km">كم</option><option value="m">م</option></select></label>
        {field('زمن الوصول (دقيقة)', 'travel_time_minutes', 'number')}
        {field('إحداثيات المشروع', 'project_lat')}
        {field('خط طول المشروع', 'project_lng')}
        {field('إحداثيات المركز', 'center_lat')}
        {field('خط طول المركز', 'center_lng')}
        {field('مصدر المعلومة', 'source_label')}
      </div>
    </div>
  );
}

function EvidenceCard({
  item,
  source,
  floors,
  preview,
  busy,
  canMoveUp = false,
  canMoveDown = false,
  onUpdate,
  onMove,
  onPreview,
  onOpenViewer,
  onDelete,
}: {
  item: TechnicalEvidenceViewItem | TechnicalEvidenceItem;
  source: 'evidence' | 'legacy';
  floors: DesignSpaceSafetyFloor[];
  preview: string | null;
  busy: boolean;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
  onUpdate?: (updater: (item: TechnicalEvidenceItem) => TechnicalEvidenceItem) => void;
  onMove?: (direction: -1 | 1) => void;
  onPreview: () => void;
  onOpenViewer: () => void;
  onDelete?: () => void;
}) {
  const isLegacy = source === 'legacy';
  const association = item.association || {};
  const currentFloor = floors.find((floor) => floor.id === association.floor_id);
  const spaces = currentFloor?.areas || [];
  const image = isImage(item);
  const current = item as TechnicalEvidenceItem;
  const update = (updater: (value: TechnicalEvidenceItem) => TechnicalEvidenceItem) => {
    if (!isLegacy && onUpdate) onUpdate(updater);
  };
  return (
    <article className={`rounded-xl border p-4 ${isLegacy ? 'border-slate-200 bg-slate-50/70' : 'border-slate-200 bg-white'}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h5 className="truncate text-sm font-bold text-slate-900">{item.title}</h5><span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${isLegacy ? 'bg-slate-200 text-slate-700' : item.file.storagePath ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'}`}>{isLegacy ? 'مرفق سابق' : item.file.storagePath ? 'مرفوع للسحابة · احفظ التقرير' : 'محلي / بانتظار الحفظ'}</span></div><p className="mt-1 text-xs text-slate-500">{item.file.fileName || 'اسم ملف غير متاح'} · {item.file.mimeType || 'نوع غير متاح'} · {formatSize(item.file.sizeBytes)}</p></div>
        {!isLegacy ? <div className="flex flex-wrap gap-2"><button type="button" disabled={busy || !canMoveUp} onClick={() => onMove?.(-1)} className="rounded-lg border border-slate-300 px-2 py-1 text-xs disabled:opacity-40">نقل لأعلى</button><button type="button" disabled={busy || !canMoveDown} onClick={() => onMove?.(1)} className="rounded-lg border border-slate-300 px-2 py-1 text-xs disabled:opacity-40">نقل لأسفل</button><button type="button" disabled={busy} onClick={onDelete} className="rounded-lg border border-rose-200 bg-rose-50 px-2 py-1 text-xs font-bold text-rose-700 disabled:opacity-50">{busy ? 'جارٍ الحذف...' : 'حذف'}</button></div> : <span className="text-[11px] text-slate-500">للعرض فقط</span>}
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-[180px_minmax(0,1fr)]">
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-2">
          {image && preview ? <button type="button" onClick={onOpenViewer} className="block w-full"><img src={preview} alt={item.title} loading="lazy" className="h-36 w-full rounded-lg object-contain" /></button> : image ? <button type="button" onClick={onPreview} className="flex h-36 w-full items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white px-3 text-xs font-bold text-indigo-700">تحميل معاينة آمنة</button> : <div className="flex h-36 flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white px-3 text-center text-xs text-slate-600"><span className="text-lg">PDF</span><span className="mt-1">معاينة PDF غير محولة في هذه المرحلة</span></div>}
        </div>
        <div className="space-y-3">
          {isLegacy ? <p className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs leading-5 text-slate-600">هذا مرفق محفوظ من الحقول القديمة. يظهر عبر المحول للقراءة فقط ولا يتحول تلقائيًا إلى دليل جديد ولا يمكن حذفه من هذه الواجهة.</p> : <EvidenceEditor item={current} floors={floors} onUpdate={update} disabled={busy} />}
        </div>
      </div>
    </article>
  );
}

function EvidenceEditor({ item, floors, onUpdate, disabled }: { item: TechnicalEvidenceItem; floors: DesignSpaceSafetyFloor[]; onUpdate: (updater: (item: TechnicalEvidenceItem) => TechnicalEvidenceItem) => void; disabled: boolean }) {
  const association = item.association || {};
  const selectedFloor = floors.find((floor) => floor.id === association.floor_id);
  const spaces = selectedFloor?.areas || [];
  const patch = (partial: Partial<TechnicalEvidenceItem>) => onUpdate((current) => ({ ...current, ...partial }));
  const patchAssociation = (partial: NonNullable<TechnicalEvidenceItem['association']>) => patch({ association: { ...association, ...partial } });
  const patchCode = (partial: NonNullable<TechnicalEvidenceItem['code_reference']>) => patch({ code_reference: { ...(item.code_reference || {}), ...partial } });
  return (
    <details className="group rounded-xl border border-slate-200 bg-slate-50/50 p-3">
      <summary className="cursor-pointer list-none text-sm font-bold text-slate-800">بيانات المرفق <span className="mr-1 text-xs font-normal text-slate-500">(اضغط للتعديل)</span></summary>
      <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
        <Field label="العنوان"><input disabled={disabled} value={item.title} onChange={(event) => patch({ title: event.target.value })} className={CONTROL} /></Field>
        <Field label="الفئة"><CategorySelect item={item} disabled={disabled} onUpdate={patch} /></Field>
        <Field label="الوصف"><textarea disabled={disabled} value={item.caption || ''} onChange={(event) => patch({ caption: asNullable(event.target.value) })} className={`${CONTROL} min-h-20`} /></Field>
        <Field label="الملاحظة الهندسية"><textarea disabled={disabled} value={item.engineering_observation || ''} onChange={(event) => patch({ engineering_observation: asNullable(event.target.value) })} className={`${CONTROL} min-h-20`} placeholder="اختيارية — لا تُولد تلقائيًا" /></Field>
        <Field label="الدور"><select disabled={disabled} value={association.floor_id || ''} onChange={(event) => patchAssociation({ floor_id: asNullable(event.target.value), space_id: null })} className={CONTROL}><option value="">غير مرتبط بدور</option>{floors.map((floor) => <option key={floor.id} value={floor.id}>{floor.label}</option>)}</select></Field>
        <Field label="المساحة / الفراغ"><select disabled={disabled || !selectedFloor} value={association.space_id || ''} onChange={(event) => patchAssociation({ space_id: asNullable(event.target.value) })} className={CONTROL}><option value="">غير مرتبط بمساحة</option>{spaces.map((space) => <option key={space.id} value={space.id}>{space.label}</option>)}</select></Field>
        <Field label="نظام السلامة"><select disabled={disabled} value={association.system_key || ''} onChange={(event) => patchAssociation({ system_key: asNullable(event.target.value) })} className={CONTROL}><option value="">غير مرتبط بنظام</option>{SYSTEM_OPTIONS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></Field>
        <Field label="قسم التقرير المرتبط"><select disabled={disabled} value={association.report_section_id || ''} onChange={(event) => patchAssociation({ report_section_id: asNullable(event.target.value) })} className={CONTROL}><option value="">غير مرتبط</option>{REPORT_SECTION_OPTIONS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></Field>
      </div>
      <label className="mt-3 flex items-center gap-2 rounded-lg border border-indigo-100 bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-900"><input disabled={disabled} type="checkbox" checked={item.include_in_report} onChange={(event) => patch({ include_in_report: event.target.checked })} />إدراج في التقرير (تفضيل محفوظ لمرحلة لاحقة؛ لا يغير PDF الآن)</label>
      {item.kind === 'code_excerpt' ? <CodeReferenceEditor value={item.code_reference || {}} disabled={disabled} onChange={patchCode} /> : null}
    </details>
  );
}

function CategorySelect({ item, disabled, onUpdate }: { item: TechnicalEvidenceItem; disabled: boolean; onUpdate: (partial: Partial<TechnicalEvidenceItem>) => void }) {
  const group = groupForTechnicalEvidenceKind(item.kind);
  if (group === 'site') return <select disabled={disabled} value={item.kind === 'site_general' ? item.category : item.kind} onChange={(event) => { const selected = event.target.value; const found = SITE_CATEGORIES.find(([key]) => key === selected); onUpdate({ kind: (found?.[0] || 'site_general') as TechnicalEvidenceKind, category: selected }); }} className={CONTROL}>{SITE_CATEGORIES.map(([key, label]) => <option key={`${key}-${label}`} value={key}>{label}</option>)}</select>;
  if (group === 'existing') return <select disabled={disabled} value={item.category} onChange={(event) => onUpdate({ category: event.target.value })} className={CONTROL}>{EXISTING_CATEGORIES.map((value) => <option key={value} value={value}>{value}</option>)}</select>;
  if (group === 'systems') return <select disabled={disabled} value={item.category} onChange={(event) => onUpdate({ category: event.target.value, association: { ...(item.association || {}), system_key: event.target.value === 'other' ? null : event.target.value } })} className={CONTROL}>{SYSTEM_OPTIONS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>;
  return <input disabled={disabled} value={item.category} onChange={(event) => onUpdate({ category: event.target.value })} className={CONTROL} placeholder="تصنيف المرجع" />;
}

function CodeReferenceEditor({ value, disabled, onChange }: { value: NonNullable<TechnicalEvidenceItem['code_reference']>; disabled: boolean; onChange: (partial: NonNullable<TechnicalEvidenceItem['code_reference']>) => void }) {
  const field = (label: string, key: keyof typeof value, type: 'text' | 'number' = 'text') => <Field label={label}><input disabled={disabled} type={type} value={value[key] == null ? '' : String(value[key])} onChange={(event) => onChange({ [key]: type === 'number' ? (event.target.value === '' ? null : Number(event.target.value)) : asNullable(event.target.value) })} className={CONTROL} /></Field>;
  return <div className="mt-3 rounded-xl border border-amber-100 bg-amber-50/60 p-3"><p className="mb-2 text-xs font-bold text-amber-900">بيانات مرجع يدويًا</p><div className="grid grid-cols-1 gap-3 md:grid-cols-2"><Field label="المرجع / الكود"><select disabled={disabled} value={value.source_standard || ''} onChange={(event) => onChange({ source_standard: asNullable(event.target.value) })} className={CONTROL}><option value="">— اختر أو أدخل ضمن الوصف —</option>{STANDARD_OPTIONS.map((standard) => <option key={standard} value={standard}>{standard}</option>)}</select></Field>{field('الإصدار / السنة', 'edition')}{field('الفصل', 'chapter')}{field('رقم البند', 'clause')}{field('الجدول / الشكل', 'table_or_figure')}{field('رقم الصفحة', 'page_number', 'number')}{field('القسم المرتبط في التقرير', 'related_report_section')}</div></div>;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block text-xs font-semibold text-slate-700"><span className="mb-1 block">{label}</span>{children}</label>;
}

function EmptyState({ text }: { text: string }) {
  return <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-center text-sm text-slate-500">{text}</div>;
}

function ImageViewer({ item, src, onClose }: { item: TechnicalEvidenceViewItem; src: string | null; onClose: () => void }) {
  return <div role="dialog" aria-modal="true" aria-label="معاينة المرفق" className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4"><div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-4"><div className="flex items-start justify-between gap-3"><div><h5 className="font-bold text-slate-900">{item.title}</h5><p className="mt-1 text-xs text-slate-500">{item.caption || 'لا يوجد وصف.'}</p></div><button type="button" onClick={onClose} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm">إغلاق</button></div>{src && isImage(item) ? <img src={src} alt={item.title} className="mt-4 max-h-[65vh] w-full object-contain" /> : <p className="mt-4 rounded-lg bg-slate-50 p-4 text-sm text-slate-600">المعاينة الكاملة متاحة للصور فقط في هذه المرحلة.</p>}<p className="mt-3 whitespace-pre-wrap text-sm text-slate-700">{item.engineering_observation || ''}</p></div></div>;
}
