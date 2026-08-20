'use client';

import { useMemo, useState } from 'react';
import { TECHNICAL_RECOMMENDATION_LIBRARY } from '@/lib/constants/technical-report-recommendations';
import { TECH_REPORT_GENERAL_RECOMMENDATIONS } from '@/lib/constants/technical-report';
import {
  addManualRecommendation,
  approveRecommendation,
  buildRecommendationReviewModel,
  editRecommendation,
  isEvidenceLinkValid,
  recommendationState,
  reconsiderRecommendation,
  refreshTechnicalRecommendationState,
  rejectRecommendation,
  reorderApprovedRecommendations,
  setRecommendationEvidenceLinks,
  updateRecommendationState,
  type RecommendationReviewGroup,
  type RecommendationReviewItem,
} from '@/lib/projects/technical-report-recommendation-review';
import type { TechnicalReportSourceData } from '@/lib/projects/technical-report-source-data';
import type {
  TechnicalEvidenceItem,
  TechnicalRecommendationAffectedScope,
  TechnicalReport,
} from '@/lib/types/project-reports';
import type { ClientRecord } from '@/lib/types/client';

type Props = {
  client: ClientRecord;
  report: TechnicalReport;
  source: TechnicalReportSourceData;
  saving: boolean;
  onChange: (next: TechnicalReport) => void;
};

type ManualDraft = {
  text: string;
  domain: string;
  scope_type: TechnicalRecommendationAffectedScope['scope_type'];
  floor_id: string;
  space_id: string;
  evidence_ids: string[];
  code_evidence_ids: string[];
};

const GROUP_LABELS: Record<RecommendationReviewGroup, string> = {
  suggested: 'مقترحة',
  approved: 'معتمدة',
  edited: 'معدلة',
  rejected: 'مرفوضة',
};

const SOURCE_LABELS: Record<string, string> = {
  office_template: 'قالب مكتب معتمد',
  approved_reference_report: 'تقرير مرجعي معتمد',
  engineer_manual: 'توصية يدوية للمهندس',
  code_backed: 'مرجع كودي مرتبط',
  system_suggestion: 'اقتراح نظام',
};

const CONDITION_LABELS: Record<string, string> = {
  obstructed: 'عائق موثق',
  maintenance_required: 'حاجة صيانة موثقة',
  inaccessible: 'تعذّر وصول موثق',
  incorrect_location: 'موقع غير مناسب موثق',
  insufficient: 'قصور موثق',
  unverified: 'حالة غير متحققة موثقة',
  random_storage: 'تخزين عشوائي موثق',
  signage_missing: 'غياب لوحات موثق',
  fire_resistance_review: 'تحتاج مراجعة مقاومة الحريق',
  special_suppression_review: 'تحتاج مراجعة نظام إطفاء خاص',
};

const SYSTEM_LABELS: Record<string, string> = {
  sprinkler: 'الرش الآلي',
  fire_alarm: 'إنذار الحريق',
  fire_extinguisher: 'الطفايات اليدوية',
  fm200: 'عامل نظيف FM-200',
  co2: 'ثاني أكسيد الكربون',
  kitchen_hood: 'إطفاء غطاء المطبخ',
  clean_agent: 'عامل نظيف',
};

const DEFAULT_MANUAL: ManualDraft = {
  text: '',
  domain: '',
  scope_type: 'project',
  floor_id: '',
  space_id: '',
  evidence_ids: [],
  code_evidence_ids: [],
};

function toggle(values: string[], value: string): string[] {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

function sourceDescription(item: RecommendationReviewItem): string {
  const snapshot = item.source_snapshot;
  const bits = [
    snapshot.source_document_key,
    snapshot.source_section,
    snapshot.source_page != null ? `صفحة ${snapshot.source_page}` : null,
  ].filter(Boolean);
  return bits.length ? bits.join(' · ') : 'مرجع محفوظ مع التوصية';
}

function uniqueDomains() {
  return [...new Set(TECHNICAL_RECOMMENDATION_LIBRARY.map((item) => item.domain))].sort();
}

export default function TechnicalRecommendationReview({ client, report, source, saving, onChange }: Props) {
  const [activeGroup, setActiveGroup] = useState<RecommendationReviewGroup>('suggested');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [manualOpen, setManualOpen] = useState(false);
  const [manual, setManual] = useState<ManualDraft>(DEFAULT_MANUAL);
  const [refreshNotice, setRefreshNotice] = useState<string | null>(null);

  const model = useMemo(() => buildRecommendationReviewModel({
    source_data: source,
    report,
    project_activity_id: client.activity_type || null,
  }), [client.activity_type, report, source]);
  const evidence = report.evidence?.items || [];
  const codeEvidence = evidence.filter((item) => item.kind === 'code_excerpt');
  const activeItems = model.groups[activeGroup];
  const selectedFloor = source.floors.find((floor) => floor.id === manual.floor_id);
  const selectedSpace = selectedFloor?.spaces.find((space) => space.id === manual.space_id);

  const applyState = (state: ReturnType<typeof recommendationState>) => {
    setRefreshNotice(null);
    onChange(updateRecommendationState(report, state));
  };

  const refresh = () => {
    const outcome = refreshTechnicalRecommendationState({
      source_data: source,
      report,
      project_activity_id: client.activity_type || null,
    });
    onChange(updateRecommendationState(report, outcome.state));
    setRefreshNotice(`مقترحات جديدة: ${outcome.summary.new_suggestions} · محفوظة بقرار المهندس: ${outcome.summary.preserved_engineer_decisions + outcome.summary.preserved_manual} · مرفوضة محفوظة: ${outcome.summary.preserved_rejections}`);
  };

  const submitManual = () => {
    const scope: TechnicalRecommendationAffectedScope = {
      scope_type: manual.scope_type,
      floor_id: manual.scope_type === 'project' ? null : manual.floor_id || null,
      space_id: manual.scope_type === 'space' ? manual.space_id || null : null,
      activity_id: selectedSpace?.activity_use.value || null,
      occupancy_code: selectedSpace?.occupancy.value || null,
      system_key: null,
      condition_key: null,
    };
    const state = addManualRecommendation({
      report,
      text: manual.text,
      domain: manual.domain,
      affected_scopes: [scope],
      evidence_ids: manual.evidence_ids,
      code_evidence_ids: manual.code_evidence_ids,
    });
    if (state.items.length === recommendationState(report).items.length) return;
    applyState(state);
    setManual(DEFAULT_MANUAL);
    setManualOpen(false);
    setActiveGroup('suggested');
  };

  return (
    <div className="space-y-4" dir="rtl" data-testid="technical-recommendation-review">
      <div className="rounded-xl border border-indigo-100 bg-indigo-50/70 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h4 className="font-bold text-slate-900">التوصيات الهندسية</h4>
              <span className="rounded-full border border-indigo-200 bg-white px-2 py-1 text-[10px] font-bold text-indigo-700">قرار المهندس مطلوب</span>
            </div>
            <p className="mt-1 text-xs leading-5 text-slate-600">يعرض النظام مقترحات قابلة للمراجعة فقط. الاعتماد أو التعديل أو الرفض لا يغير بيانات المراحل السابقة ولا يضيف شيئًا إلى PDF في هذه المرحلة.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={saving} onClick={refresh} className="rounded-lg border border-indigo-200 bg-white px-3 py-2 text-xs font-bold text-indigo-800 disabled:opacity-60">تحديث التوصيات المقترحة</button>
            <button type="button" disabled={saving} onClick={() => setManualOpen((value) => !value)} className="rounded-lg bg-[#635bdb] px-3 py-2 text-xs font-bold text-white disabled:opacity-60">+ توصية يدوية</button>
          </div>
        </div>
      </div>

      {model.coverage_gap ? <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-950" data-testid="recommendation-coverage-gap">لا توجد توصيات مرجعية خاصة بهذا النشاط ضمن المكتبة الحالية. تُعرض الفجوة كما هي ولا تُنشأ توصيات بديلة تلقائيًا.</div> : null}
      {refreshNotice ? <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs leading-5 text-emerald-900">{refreshNotice}</div> : null}

      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4" role="tablist" aria-label="حالات التوصيات الهندسية">
        {(Object.keys(GROUP_LABELS) as RecommendationReviewGroup[]).map((group) => (
          <button
            key={group}
            type="button"
            role="tab"
            aria-selected={activeGroup === group}
            onClick={() => setActiveGroup(group)}
            className={`min-h-12 rounded-xl border px-3 py-2 text-right text-xs font-bold ${activeGroup === group ? 'border-[#635bdb] bg-indigo-50 text-indigo-800' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`}
          >
            {GROUP_LABELS[group]} <span className="mr-1 rounded-full bg-white px-1.5 py-0.5 text-[10px]">{model.counts[group]}</span>
          </button>
        ))}
      </div>

      <div className="rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2 text-xs text-slate-700" data-testid="recommendation-status-counts">
        مقترحة: {model.counts.suggested} · معتمدة: {model.counts.approved} · معدلة: {model.counts.edited} · مرفوضة: {model.counts.rejected}
      </div>

      {manualOpen ? (
        <ManualRecommendationForm
          draft={manual}
          source={source}
          evidence={evidence}
          codeEvidence={codeEvidence}
          saving={saving}
          onChange={setManual}
          onCancel={() => { setManual(DEFAULT_MANUAL); setManualOpen(false); }}
          onSubmit={submitManual}
        />
      ) : null}

      {activeItems.length ? (
        <div className="space-y-3">
          {activeItems.map((item, index) => (
            <RecommendationCard
              key={item.id}
              item={item}
              source={source}
              evidence={evidence}
              codeEvidence={codeEvidence}
              saving={saving}
              canMoveUp={(item.status === 'approved' || item.status === 'edited') && index > 0}
              canMoveDown={(item.status === 'approved' || item.status === 'edited') && index < activeItems.length - 1}
              editing={editingId === item.id}
              editText={editingId === item.id ? editText : item.effective_text_ar}
              rejecting={rejectingId === item.id}
              rejectionReason={rejectingId === item.id ? rejectionReason : item.rejection_reason || ''}
              onStartEdit={() => { setEditingId(item.id); setEditText(item.effective_text_ar); setRejectingId(null); }}
              onCancelEdit={() => { setEditingId(null); setEditText(''); }}
              onEditText={setEditText}
              onSaveEdit={() => { applyState(editRecommendation(report, item, editText)); setEditingId(null); setEditText(''); }}
              onApprove={() => applyState(approveRecommendation(report, item))}
              onStartReject={() => { setRejectingId(item.id); setRejectionReason(item.rejection_reason || ''); setEditingId(null); }}
              onCancelReject={() => { setRejectingId(null); setRejectionReason(''); }}
              onRejectionReason={setRejectionReason}
              onReject={() => {
                if (!window.confirm('تأكيد رفض هذه التوصية؟ ستبقى محفوظة ولن تعود كمقترح مكرر عند التحديث.')) return;
                applyState(rejectRecommendation(report, item, rejectionReason));
                setRejectingId(null);
                setRejectionReason('');
              }}
              onReconsider={() => applyState(reconsiderRecommendation(report, item))}
              onMove={(direction) => applyState(reorderApprovedRecommendations(report, item.id, direction))}
              onEvidenceChange={(evidence_ids, code_evidence_ids) => applyState(setRecommendationEvidenceLinks({ report, recommendation: item, evidence, evidence_ids, code_evidence_ids }))}
            />
          ))}
        </div>
      ) : <EmptyState text={`لا توجد توصيات ${GROUP_LABELS[activeGroup]} حاليًا.`} />}

      <LegacyRecommendations recommendations={report.general_recommendations || []} />
      <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-[11px] leading-5 text-slate-600">روابط الأدلة تحفظ معرفات مرفقات المشروع فقط. إزالة الرابط لا تحذف المرفق، ولا تُعرض مسارات التخزين أو روابط موقعة قابلة للتحرير.</p>
    </div>
  );
}

function RecommendationCard({
  item,
  source,
  evidence,
  codeEvidence,
  saving,
  canMoveUp,
  canMoveDown,
  editing,
  editText,
  rejecting,
  rejectionReason,
  onStartEdit,
  onCancelEdit,
  onEditText,
  onSaveEdit,
  onApprove,
  onStartReject,
  onCancelReject,
  onRejectionReason,
  onReject,
  onReconsider,
  onMove,
  onEvidenceChange,
}: {
  item: RecommendationReviewItem;
  source: TechnicalReportSourceData;
  evidence: TechnicalEvidenceItem[];
  codeEvidence: TechnicalEvidenceItem[];
  saving: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  editing: boolean;
  editText: string;
  rejecting: boolean;
  rejectionReason: string;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onEditText: (value: string) => void;
  onSaveEdit: () => void;
  onApprove: () => void;
  onStartReject: () => void;
  onCancelReject: () => void;
  onRejectionReason: (value: string) => void;
  onReject: () => void;
  onReconsider: () => void;
  onMove: (direction: -1 | 1) => void;
  onEvidenceChange: (evidenceIds: string[], codeEvidenceIds: string[]) => void;
}) {
  const statusStyle = item.status === 'approved' ? 'bg-emerald-50 text-emerald-800' : item.status === 'edited' ? 'bg-sky-50 text-sky-800' : item.status === 'rejected' ? 'bg-rose-50 text-rose-800' : 'bg-amber-50 text-amber-800';
  const linkedEvidence = item.evidence_ids.filter((id) => isEvidenceLinkValid(evidence, id));
  const linkedCode = item.code_evidence_ids.filter((id) => isEvidenceLinkValid(evidence, id, true));
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-4" data-testid={`recommendation-card-${item.status}`}>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${statusStyle}`}>{GROUP_LABELS[item.status]}</span>
            {item.status === 'edited' ? <span className="rounded-full border border-sky-200 bg-sky-50 px-2 py-1 text-[10px] font-bold text-sky-800">تم تعديلها بواسطة المهندس</span> : null}
            {item.is_manual ? <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-bold text-slate-700">توصية يدوية</span> : null}
            {item.domain ? <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] text-slate-700">{item.domain}</span> : null}
          </div>
          {editing ? <textarea value={editText} onChange={(event) => onEditText(event.target.value)} className="mt-3 min-h-28 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm leading-6 text-slate-900" aria-label="تعديل نص التوصية" /> : <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-slate-900">{item.effective_text_ar}</p>}
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {item.status === 'suggested' ? <button type="button" disabled={saving} onClick={onApprove} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-60">اعتماد</button> : null}
          {item.status !== 'rejected' ? <button type="button" disabled={saving} onClick={onStartEdit} className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-bold text-sky-800 disabled:opacity-60">تعديل</button> : null}
          {item.status !== 'rejected' ? <button type="button" disabled={saving} onClick={onStartReject} className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700 disabled:opacity-60">رفض</button> : null}
          {item.status === 'rejected' ? <button type="button" disabled={saving} onClick={onReconsider} className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800 disabled:opacity-60">إعادة للمراجعة</button> : null}
          {(item.status === 'approved' || item.status === 'edited') ? <><button type="button" disabled={saving || !canMoveUp} onClick={() => onMove(-1)} className="rounded-lg border border-slate-300 px-2 py-1 text-xs disabled:opacity-40">نقل لأعلى</button><button type="button" disabled={saving || !canMoveDown} onClick={() => onMove(1)} className="rounded-lg border border-slate-300 px-2 py-1 text-xs disabled:opacity-40">نقل لأسفل</button></> : null}
        </div>
      </div>

      {editing ? <div className="mt-3 flex flex-wrap gap-2"><button type="button" disabled={saving || !editText.trim()} onClick={onSaveEdit} className="rounded-lg bg-[#635bdb] px-3 py-2 text-xs font-bold text-white disabled:opacity-60">حفظ التعديل</button><button type="button" disabled={saving} onClick={onCancelEdit} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-bold text-slate-700">إلغاء</button></div> : null}
      {rejecting ? <div className="mt-3 rounded-xl border border-rose-100 bg-rose-50/60 p-3"><label className="block text-xs font-semibold text-rose-900">سبب الرفض (اختياري)<textarea value={rejectionReason} onChange={(event) => onRejectionReason(event.target.value)} className="mt-2 min-h-20 w-full rounded-lg border border-rose-200 bg-white px-3 py-2 text-sm text-slate-900" /></label><div className="mt-2 flex flex-wrap gap-2"><button type="button" disabled={saving} onClick={onReject} className="rounded-lg bg-rose-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-60">تأكيد الرفض</button><button type="button" disabled={saving} onClick={onCancelReject} className="rounded-lg border border-rose-200 bg-white px-3 py-2 text-xs font-bold text-rose-800">إلغاء</button></div></div> : null}

      <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
        <InfoBlock title="سبب الاقتراح"><ul className="space-y-1 text-xs leading-5 text-slate-700">{item.reason_lines.map((line) => <li key={line}>• {humanizeReason(line)}</li>)}</ul></InfoBlock>
        <InfoBlock title="المصدر"><p className="text-xs font-semibold text-slate-800">{SOURCE_LABELS[item.source_snapshot.source_type] || item.source_snapshot.source_type}</p><p className="mt-1 break-words text-[11px] leading-5 text-slate-600"><span dir="ltr">{sourceDescription(item)}</span></p></InfoBlock>
        <InfoBlock title="ينطبق على"><ScopeList scopes={item.affected_scopes} source={source} /></InfoBlock>
        <InfoBlock title="الأدلة المرتبطة"><p className="text-xs text-slate-700">أدلة: {linkedEvidence.length} · مقتطفات كودية: {linkedCode.length}</p><EvidenceLinkEditor item={item} evidence={evidence} codeEvidence={codeEvidence} saving={saving} onChange={onEvidenceChange} /></InfoBlock>
      </div>
    </article>
  );
}

function humanizeReason(line: string): string {
  return line.replace(/(obstructed|maintenance_required|inaccessible|incorrect_location|insufficient|unverified|random_storage|signage_missing|fire_resistance_review|special_suppression_review)/g, (key) => CONDITION_LABELS[key] || key).replace(/(sprinkler|fire_alarm|fire_extinguisher|fm200|co2|kitchen_hood|clean_agent)/g, (key) => SYSTEM_LABELS[key] || key);
}

function InfoBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="rounded-xl border border-slate-100 bg-slate-50/70 p-3"><h5 className="text-xs font-bold text-slate-900">{title}</h5><div className="mt-2">{children}</div></section>;
}

function ScopeList({ scopes, source }: { scopes: TechnicalRecommendationAffectedScope[]; source: TechnicalReportSourceData }) {
  if (!scopes.length) return <p className="text-xs text-slate-600">المشروع كاملًا.</p>;
  return <ul className="space-y-1 text-xs leading-5 text-slate-700">{scopes.map((scope, index) => {
    const floor = source.floors.find((value) => value.id === scope.floor_id);
    const space = floor?.spaces.find((value) => value.id === scope.space_id);
    const labels = [
      scope.scope_type === 'project' ? 'المشروع كاملًا' : null,
      floor?.name.value || (scope.floor_id ? 'دور محدد' : null),
      space?.name.value || (scope.space_id ? 'مساحة محددة' : null),
      scope.occupancy_code ? `إشغال: ${scope.occupancy_code}` : null,
      scope.system_key ? `نظام: ${SYSTEM_LABELS[scope.system_key] || scope.system_key}` : null,
      scope.condition_key ? `ملاحظة: ${CONDITION_LABELS[scope.condition_key] || scope.condition_key}` : null,
    ].filter(Boolean);
    return <li key={`${scope.scope_type}-${scope.floor_id || ''}-${scope.space_id || ''}-${scope.system_key || ''}-${scope.condition_key || ''}-${index}`}>• {labels.join(' — ')}</li>;
  })}</ul>;
}

function EvidenceLinkEditor({ item, evidence, codeEvidence, saving, onChange }: { item: RecommendationReviewItem; evidence: TechnicalEvidenceItem[]; codeEvidence: TechnicalEvidenceItem[]; saving: boolean; onChange: (evidenceIds: string[], codeEvidenceIds: string[]) => void }) {
  const regularEvidence = evidence.filter((entry) => entry.kind !== 'code_excerpt');
  return <details className="mt-2 rounded-lg border border-slate-200 bg-white p-2"><summary className="cursor-pointer text-[11px] font-bold text-indigo-700">ربط دليل / مقتطف كودي</summary><div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2"><EvidenceChecklist title="الأدلة" items={regularEvidence} selected={item.evidence_ids} disabled={saving} onToggle={(id) => onChange(toggle(item.evidence_ids, id), item.code_evidence_ids)} /><EvidenceChecklist title="مقتطفات الكود" items={codeEvidence} selected={item.code_evidence_ids} disabled={saving} code onToggle={(id) => onChange(item.evidence_ids, toggle(item.code_evidence_ids, id))} /></div></details>;
}

function EvidenceChecklist({ title, items, selected, disabled, code = false, onToggle }: { title: string; items: TechnicalEvidenceItem[]; selected: string[]; disabled: boolean; code?: boolean; onToggle: (id: string) => void }) {
  return <div><p className="text-[11px] font-bold text-slate-700">{title}</p>{items.length ? <div className="mt-1 space-y-1">{items.map((entry) => <label key={entry.id} className="flex gap-2 rounded-md px-1 py-1 text-[11px] text-slate-700"><input type="checkbox" checked={selected.includes(entry.id)} disabled={disabled} onChange={() => onToggle(entry.id)} /><span className="min-w-0 break-words">{entry.title}{code && entry.code_reference?.clause ? <span className="mr-1 text-slate-500" dir="ltr">· {entry.code_reference.clause}</span> : null}</span></label>)}</div> : <p className="mt-1 text-[11px] text-slate-500">لا توجد عناصر متاحة.</p>}</div>;
}

function ManualRecommendationForm({ draft, source, evidence, codeEvidence, saving, onChange, onCancel, onSubmit }: { draft: ManualDraft; source: TechnicalReportSourceData; evidence: TechnicalEvidenceItem[]; codeEvidence: TechnicalEvidenceItem[]; saving: boolean; onChange: (next: ManualDraft) => void; onCancel: () => void; onSubmit: () => void }) {
  const floor = source.floors.find((entry) => entry.id === draft.floor_id);
  const regularEvidence = evidence.filter((entry) => entry.kind !== 'code_excerpt');
  const scopeChange = (scope_type: ManualDraft['scope_type']) => onChange({ ...draft, scope_type, floor_id: scope_type === 'project' ? '' : draft.floor_id, space_id: scope_type === 'space' ? draft.space_id : '' });
  return <section className="rounded-xl border border-indigo-200 bg-indigo-50/40 p-4" data-testid="manual-recommendation-form"><div className="flex flex-wrap items-center justify-between gap-2"><h5 className="font-bold text-slate-900">توصية يدوية للمهندس</h5><span className="text-[11px] text-slate-600">تُنشأ للمراجعة أولًا ولا تُعتمد تلقائيًا.</span></div><div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2"><label className="block text-xs font-semibold text-slate-700 lg:col-span-2">نص التوصية<textarea value={draft.text} onChange={(event) => onChange({ ...draft, text: event.target.value })} className="mt-1 min-h-24 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" /></label><label className="block text-xs font-semibold text-slate-700">المجال / النظام<select value={draft.domain} onChange={(event) => onChange({ ...draft, domain: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"><option value="">عام</option>{uniqueDomains().map((domain) => <option key={domain} value={domain}>{domain}</option>)}</select></label><label className="block text-xs font-semibold text-slate-700">نطاق الانطباق<select value={draft.scope_type} onChange={(event) => scopeChange(event.target.value as ManualDraft['scope_type'])} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"><option value="project">المشروع كاملًا</option><option value="floor">دور محدد</option><option value="space">مساحة محددة</option></select></label>{draft.scope_type !== 'project' ? <label className="block text-xs font-semibold text-slate-700">الدور<select value={draft.floor_id} onChange={(event) => onChange({ ...draft, floor_id: event.target.value, space_id: '' })} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"><option value="">— اختر الدور —</option>{source.floors.map((entry) => <option key={entry.id} value={entry.id}>{entry.name.value || 'دور غير مسمى'}</option>)}</select></label> : null}{draft.scope_type === 'space' ? <label className="block text-xs font-semibold text-slate-700">المساحة<select value={draft.space_id} disabled={!floor} onChange={(event) => onChange({ ...draft, space_id: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"><option value="">— اختر المساحة —</option>{floor?.spaces.map((entry) => <option key={entry.id} value={entry.id}>{entry.name.value || 'مساحة غير مسماة'}</option>)}</select></label> : null}</div><div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2"><EvidenceChecklist title="ربط أدلة اختيارية" items={regularEvidence} selected={draft.evidence_ids} disabled={saving} onToggle={(id) => onChange({ ...draft, evidence_ids: toggle(draft.evidence_ids, id) })} /><EvidenceChecklist title="ربط مقتطفات كودية اختيارية" items={codeEvidence} selected={draft.code_evidence_ids} disabled={saving} code onToggle={(id) => onChange({ ...draft, code_evidence_ids: toggle(draft.code_evidence_ids, id) })} /></div><div className="mt-4 flex flex-wrap gap-2"><button type="button" disabled={saving || !draft.text.trim()} onClick={onSubmit} className="rounded-lg bg-[#635bdb] px-3 py-2 text-xs font-bold text-white disabled:opacity-60">إنشاء للمراجعة</button><button type="button" disabled={saving} onClick={onCancel} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-bold text-slate-700">إلغاء</button></div></section>;
}

function LegacyRecommendations({ recommendations }: { recommendations: TechnicalReport['general_recommendations'] }) {
  const selected = recommendations.filter((item) => item.checked);
  const labelFor = (id: string) => TECH_REPORT_GENERAL_RECOMMENDATIONS.find((item) => item.id === id)?.label || id;
  return <details className="rounded-xl border border-slate-200 bg-slate-50/60 p-3"><summary className="cursor-pointer text-xs font-bold text-slate-800">التوصيات السابقة <span className="mr-1 rounded-full bg-white px-1.5 py-0.5 text-[10px]">{selected.length}</span></summary><p className="mt-2 text-[11px] leading-5 text-slate-600">تظل التوصيات السابقة منفصلة ومتوافقة مع مسارها الحالي؛ لا تُرحّل تلقائيًا إلى التوصيات الجديدة.</p>{selected.length ? <ul className="mt-2 space-y-1 text-xs text-slate-700">{selected.map((item) => <li key={item.id}>• <span className="rounded-full border border-slate-200 bg-white px-1.5 py-0.5 text-[10px]">توصية سابقة</span> {labelFor(item.id)}</li>)}</ul> : null}</details>;
}

function EmptyState({ text }: { text: string }) {
  return <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-center text-sm text-slate-500">{text}</div>;
}
