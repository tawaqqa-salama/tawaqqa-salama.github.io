'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { seedBuildingPlanFromClient } from '@/lib/projects/building-plan';
import {
  parseProjectEngineeringData,
  syncProjectVisitsFromQuotation,
  getProjectReportProgress,
  seedProjectEngineeringFromClient,
} from '@/lib/business/project-reports';
import TechnicalReportSection from '@/components/projects/TechnicalReportSection';
import { printTechnicalReport } from '@/components/projects/TechnicalReportPrint';
import EngineeringDeliverySection from '@/components/projects/EngineeringDeliverySection';
import CdCoverLetterSection from '@/components/projects/CdCoverLetterSection';
import FinalInspectionSection from '@/components/projects/FinalInspectionSection';
import CompletionCertificateSection from '@/components/projects/CompletionCertificateSection';
import SupervisionReportSection from '@/components/projects/SupervisionReportSection';
import ContractOnboardingSection from '@/components/projects/ContractOnboardingSection';
import DesignCenterSection from '@/components/projects/DesignCenterSection';
import WorkflowStageRail from '@/components/projects/WorkflowStageRail';
import { useProjectStagesDrawer } from '@/components/layout/ProjectStagesDrawerContext';
import InvoicePromptModal from '@/components/invoices/InvoicePromptModal';
import {
  downloadTaxInvoice,
  printTaxInvoice,
  shareTaxInvoiceWhatsApp,
} from '@/components/invoices/TaxInvoiceTemplate';
import {
  generateInvoiceForEngineeringEvent,
  generateTaxInvoiceFromMilestone,
} from '@/lib/invoices/tax-invoice-service';
import { loadCompanyProfile, loadLocalCompanyProfile, type CompanyProfile } from '@/lib/company-profile';
import { seedSupervisionReport } from '@/lib/projects/supervision-report';
import { ensureCertificateNumber, ensureOutgoingNumber } from '@/lib/business/document-numbers';
import { backupEngineeringDataLocally, updateClientSafe } from '@/lib/supabase/safe-client-write';
import { humanizeFetchError } from '@/lib/api/safe-json';
import {
  WORKFLOW_STAGES,
  approveWorkflowStage,
  canUnlockStage,
  resolveActiveStage,
  stageApprovalBlockers,
  type WorkflowStageId,
} from '@/lib/projects/gated-pipeline';
import { sanitizeEngineeringDataForPersist } from '@/lib/projects/sanitize-engineering-files';
import type { ClientRecord } from '@/lib/types/client';
import type { ProjectEngineeringData } from '@/lib/types/project-reports';
import type { TaxInvoice } from '@/lib/types/tax-invoice';

interface ProjectReportModalProps {
  client: ClientRecord | null;
  onClose: () => void;
  onUpdated: () => void;
  /** Prefer opening this stage when unlocked (e.g. designs / Design Center) */
  preferredStage?: WorkflowStageId | null;
}

const REPORT_STATUSES = ['مسودة', 'قيد الإعداد', 'مكتمل', 'معتمد'] as const;

export default function ProjectReportModal({
  client,
  onClose,
  onUpdated,
  preferredStage = null,
}: ProjectReportModalProps) {
  const [activeStage, setActiveStage] = useState<WorkflowStageId>('contract');
  const [data, setData] = useState<ProjectEngineeringData | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [company, setCompany] = useState<CompanyProfile | null>(null);
  const [invoicePromptOpen, setInvoicePromptOpen] = useState(false);
  const [promptInvoice, setPromptInvoice] = useState<TaxInvoice | null>(null);
  const [invoiceBusy, setInvoiceBusy] = useState(false);
  const [pendingInvoiceEvent, setPendingInvoiceEvent] = useState<
    'engineering_delivery' | 'final_inspection' | 'completion' | 'manual' | null
  >(null);
  const [boqItem, setBoqItem] = useState('');
  const {
    open: stagesOpen,
    register: registerStagesDrawer,
    unregister: unregisterStagesDrawer,
    closeDrawer: closeStagesDrawer,
  } = useProjectStagesDrawer();

  useEffect(() => {
    void loadCompanyProfile().then(setCompany);
  }, []);

  useEffect(() => {
    if (!client) {
      unregisterStagesDrawer();
      return;
    }
    registerStagesDrawer();
    return () => unregisterStagesDrawer();
  }, [client, registerStagesDrawer, unregisterStagesDrawer]);

  useEffect(() => {
    if (!stagesOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeStagesDrawer();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [stagesOpen, closeStagesDrawer]);

  useEffect(() => {
    if (!client) return;
    const visitsCount = client.quotation_visits_count || 1;
    const parsed = parseProjectEngineeringData(client.project_engineering_data);
    const withPlan = {
      ...parsed,
      building_plan: seedBuildingPlanFromClient(client, parsed.building_plan),
    };
    const seeded = seedProjectEngineeringFromClient(client, withPlan);
    const companySnapshot = company || loadLocalCompanyProfile();
    const withSupervision = {
      ...seeded,
      supervision_report: seedSupervisionReport(
        client,
        seeded,
        companySnapshot,
        seeded.supervision_report
      ),
    };
    const synced = syncProjectVisitsFromQuotation(withSupervision, visitsCount);
    setData(synced);
    const resolved = resolveActiveStage(client, synced, preferredStage);
    setActiveStage(resolved);
    if (
      preferredStage === 'designs' &&
      resolved !== 'designs' &&
      !canUnlockStage('designs', client, synced)
    ) {
      setMessage('مرحلة التصاميم مقفلة — اعتمد مرحلة «العقد» أولاً ثم افتح مركز التصاميم.');
    } else {
      setMessage(null);
    }
  }, [client, preferredStage]);

  useEffect(() => {
    if (!client || !data || !company) return;
    const current = data.supervision_report;
    if (current?.supervising_office?.trim() && current?.tasks?.length) return;
    const next = seedSupervisionReport(client, data, company, current);
    setData({ ...data, supervision_report: next });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [company?.legal_name, company?.name, client?.id]);

  const progress = useMemo(
    () => (data && client ? getProjectReportProgress(data, client) : 0),
    [data, client]
  );

  const stageMeta = WORKFLOW_STAGES.find((s) => s.id === activeStage);

  if (!client || !data) return null;

  const save = async (
    nextData: ProjectEngineeringData,
    successText: string,
    options?: { issueOutgoing?: boolean; issueCertificate?: boolean; stayOpen?: boolean }
  ): Promise<boolean> => {
    setSaving(true);
    setMessage(null);
    const outgoingNumber = options?.issueOutgoing
      ? await ensureOutgoingNumber(nextData.technical_report?.outgoing_number)
      : nextData.technical_report?.outgoing_number;
    const certificateNumber = options?.issueCertificate
      ? await ensureCertificateNumber(nextData.completion_certificate?.certificate_number)
      : nextData.completion_certificate?.certificate_number;
    const stampedRaw: ProjectEngineeringData = {
      ...nextData,
      technical_report: {
        ...nextData.technical_report,
        ...(outgoingNumber ? { outgoing_number: outgoingNumber } : {}),
        updated_at: new Date().toISOString(),
      },
      building_plan: {
        ...nextData.building_plan,
        updated_at: new Date().toISOString(),
      },
      completion_certificate: {
        ...nextData.completion_certificate,
        ...(certificateNumber ? { certificate_number: certificateNumber } : {}),
      },
    };
    // Drop bulky inline dataUrls when storagePath exists so JSONB stays lean and syncs across devices
    const stamped = sanitizeEngineeringDataForPersist(stampedRaw);
    const { error } = await supabase
      .from('clients')
      .update({
        project_engineering_data: stamped,
        pipeline_stage: client.pipeline_stage === 'completed' ? 'completed' : 'projects',
      })
      .eq('id', client.id);

    backupEngineeringDataLocally(client.id, stamped);
    setSaving(false);
    setData(stamped);

    if (error) {
      setMessage(
        `تعذّر الحفظ على السيرفر — تم حفظ نسخة محلية: ${humanizeFetchError(error.message)}`
      );
      return false;
    }

    setMessage(successText);

    const deliveryDone = ['مكتمل', 'معتمد'].includes(stamped.engineering_delivery.status || '');
    const finalDone = ['مكتمل', 'معتمد'].includes(stamped.final_inspection.status || '');
    const completionDone = ['مكتمل', 'معتمد'].includes(stamped.completion_certificate.status || '');
    const willInvoice =
      (deliveryDone && successText.includes('تسليم')) ||
      (finalDone && successText.includes('النهائي')) ||
      (completionDone && successText.includes('شهادة'));

    if (willInvoice && !options?.stayOpen) {
      if (deliveryDone && successText.includes('تسليم')) {
        setPendingInvoiceEvent('engineering_delivery');
      } else if (finalDone && successText.includes('النهائي')) {
        setPendingInvoiceEvent('final_inspection');
      } else {
        setPendingInvoiceEvent('completion');
      }
      setPromptInvoice(null);
      setInvoicePromptOpen(true);
    } else if (!options?.stayOpen && !successText.includes('اعتماد')) {
      onClose();
    }

    void import('@/lib/activity/logger').then(({ logActivity }) =>
      logActivity({
        actionType: 'UPDATE',
        module: 'projects',
        pageUrl: '/projects',
        details: `تم تحديث تقرير هندسي للعميل ${client.business_name || client.name} — ${successText}`,
        metadata: { clientId: client.id, stage: activeStage },
      })
    );
    requestAnimationFrame(() => onUpdated());
    return true;
  };

  const patch = (partial: Partial<ProjectEngineeringData>) => setData({ ...data, ...partial });

  const selectStage = (stageId: WorkflowStageId) => {
    if (!canUnlockStage(stageId, client, data)) {
      setMessage('يجب إنهاء واكتمال المرحلة السابقة أولاً');
      return;
    }
    setActiveStage(stageId);
    setMessage(null);
  };

  const handleApproveAndProceed = async () => {
    const result = approveWorkflowStage({
      stageId: activeStage,
      client,
      data,
      company,
    });
    if (!result.ok) {
      setMessage(result.blockers.join(' — ') || 'تعذّر اعتماد المرحلة');
      return;
    }
    setData(result.data);
    setActiveStage(result.nextStage);
    await save(result.data, `تم اعتماد المرحلة والانتقال إلى: ${
      WORKFLOW_STAGES.find((s) => s.id === result.nextStage)?.label_ar || result.nextStage
    }`, { stayOpen: true });
  };

  const handlePrintTechnical = async () => {
    let report = data.technical_report;
    if (!report.outgoing_number?.trim()) {
      const outgoingNumber = await ensureOutgoingNumber(report.outgoing_number);
      const nextData: ProjectEngineeringData = {
        ...data,
        technical_report: { ...report, outgoing_number: outgoingNumber },
      };
      await save(nextData, 'تم إصدار رقم الصادر تلقائياً.', { issueOutgoing: false, stayOpen: true });
      report = nextData.technical_report;
    }
    const profile = await loadCompanyProfile();
    printTechnicalReport({
      client,
      report,
      company: profile,
      engineeringData: data,
      locale: 'ar',
    });
  };

  const blockers = stageApprovalBlockers(activeStage, client, data);

  return (
    <>
      <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
        <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-xl w-full max-w-6xl max-h-[94vh] flex flex-col overflow-hidden">
          <div className="p-5 border-b">
            <div className="flex justify-between items-start gap-4">
              <div>
                <h2 className="text-xl font-bold text-gray-900">ملف المشروع الهندسي — مسار المراحل</h2>
                <p className="text-sm text-gray-500 mt-1">
                  {client.business_name || client.name} — {client.client_code}
                </p>
                <p className="text-xs text-sky-700 mt-1 font-semibold">
                  المرحلة الحالية: {stageMeta?.order}. {stageMeta?.label_ar}
                </p>
                {activeStage === 'designs' ? (
                  <p className="text-xs font-bold text-indigo-700 mt-1">
                    Design Center · مركز الذكاء التصميمي
                  </p>
                ) : null}
              </div>
              <button type="button" onClick={onClose} className="text-2xl text-gray-400 leading-none">
                ×
              </button>
            </div>
          </div>

          <div className="relative flex flex-1 min-h-0">
            {stagesOpen ? (
              <>
                <button
                  type="button"
                  aria-label="إخفاء أقسام المشروع"
                  className="absolute inset-0 z-20 bg-black/35"
                  onClick={closeStagesDrawer}
                />
                <aside
                  id="project-stages-drawer"
                  className="absolute inset-y-0 end-0 z-30 w-[min(18rem,88vw)] border-s border-gray-200 bg-gray-50 shadow-xl overflow-y-auto p-3"
                  role="dialog"
                  aria-modal="true"
                  aria-label="أقسام المشروع"
                >
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <p className="text-sm font-bold text-gray-900">أقسام المشروع</p>
                    <button
                      type="button"
                      onClick={closeStagesDrawer}
                      className="touch-target h-9 w-9 rounded-lg border border-gray-200 bg-white text-gray-500 hover:bg-gray-100"
                      aria-label="إغلاق"
                    >
                      ×
                    </button>
                  </div>
                  <WorkflowStageRail
                    client={client}
                    data={data}
                    activeStage={activeStage}
                    progressPercent={progress}
                    onSelect={(stageId) => {
                      selectStage(stageId);
                      closeStagesDrawer();
                    }}
                  />
                </aside>
              </>
            ) : null}

            <div className="flex-1 p-5 overflow-y-auto space-y-4">
              {message ? (
                <div
                  className={`p-3 rounded-xl text-sm ${
                    message.includes('تم') || message.includes('اعتماد')
                      ? 'bg-green-50 text-green-700'
                      : 'bg-amber-50 text-amber-900'
                  }`}
                >
                  {message}
                </div>
              ) : null}

              {activeStage === 'contract' && (
                <ContractOnboardingSection
                  client={client}
                  report={data.contract_onboarding}
                  onChange={(contract_onboarding) => patch({ contract_onboarding })}
                />
              )}

              {activeStage === 'designs' && (
                <div className="space-y-4">
                  <div className="rounded-xl border border-sky-100 bg-sky-50 px-3 py-2 text-xs text-sky-950 leading-relaxed">
                    مرحلة التصاميم — Design Center. الرفع يحفظ في السحابة (
                    <code className="font-mono">project-files</code>) ويظهر تحت «إدارة إصدارات
                    المخططات». إن فشل الرفع رغم وجود المجلد: راجع Policies (INSERT لـ anon /
                    authenticated) وأنواع MIME المسموحة، أو نفّذ سكربت{' '}
                    <code className="font-mono">029</code> لفتح كل الأنواع. اسم الملف في خانة
                    الاختيار ≠ حفظ ناجح.
                  </div>
                  <DesignCenterSection
                    client={client}
                    data={data}
                    saving={saving}
                    onPatch={patch}
                    onPersistDesignCenter={async (design_center, extra) => {
                      const ok = await save(
                        { ...data, design_center, ...extra },
                        'تم حفظ المخططات في المشروع (سحابة) — تظهر من أي جهاز.',
                        { stayOpen: true }
                      );
                      if (!ok) {
                        throw new Error(
                          'تعذر حفظ المخطط على السيرفر. الملف قد يظهر هنا فقط حتى ينجح الحفظ السحابي.'
                        );
                      }
                    }}
                    onSaveBuildingPlan={(building_plan, successText) =>
                      save(
                        {
                          ...data,
                          building_plan,
                          technical_report: {
                            ...data.technical_report,
                            building_permit_number:
                              building_plan.building_permit_number ||
                              data.technical_report.building_permit_number,
                            building_permit_date:
                              building_plan.building_permit_date ||
                              data.technical_report.building_permit_date,
                          },
                        },
                        successText,
                        { stayOpen: true }
                      )
                    }
                    onPersistBlueprints={async (safety_blueprints) => {
                      await save(
                        { ...data, safety_blueprints },
                        'تم حفظ مخططات السلامة وتشغيل الفحص الآلي.',
                        { stayOpen: true }
                      );
                    }}
                  />
                </div>
              )}

              {activeStage === 'boq_schedule' && (
                <div className="space-y-4">
                  <div className="rounded-xl border border-indigo-100 bg-indigo-50 px-3 py-2 text-xs text-indigo-950">
                    يرث نطاق الإشغال من مرحلة التصاميم. بنود BOQ تُمرَّر تلقائياً إلى جدول الإشراف في المرحلة 5.
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <StatusSelect
                      value={data.boq.status}
                      onChange={(status) => patch({ boq: { ...data.boq, status } })}
                    />
                    <StatusSelect
                      value={data.timeline.status}
                      onChange={(status) => patch({ timeline: { ...data.timeline, status } })}
                    />
                  </div>
                  <div className="flex gap-2">
                    <input
                      className="flex-1 border rounded-xl px-3 py-2 text-sm"
                      placeholder="بند نظام (إطفاء / إنذار / دخان…)"
                      value={boqItem}
                      onChange={(e) => setBoqItem(e.target.value)}
                    />
                    <button
                      type="button"
                      className="px-3 py-2 rounded-xl bg-slate-800 text-white text-sm"
                      onClick={() => {
                        if (!boqItem.trim()) return;
                        patch({
                          boq: {
                            ...data.boq,
                            items: [
                              ...(data.boq.items || []),
                              {
                                id: `boq-${Date.now()}`,
                                item: boqItem.trim(),
                                unit: 'وحدة',
                                quantity: 1,
                                unit_price: 0,
                              },
                            ],
                          },
                        });
                        setBoqItem('');
                      }}
                    >
                      إضافة
                    </button>
                  </div>
                  <ul className="text-sm space-y-1">
                    {(data.boq.items || []).map((item) => (
                      <li key={item.id} className="border rounded-lg px-3 py-2 bg-slate-50">
                        {item.item}
                      </li>
                    ))}
                  </ul>
                  <div className="grid grid-cols-2 gap-3">
                    <Field
                      label="بداية المشروع"
                      type="date"
                      value={data.timeline.project_start || ''}
                      onChange={(v) => patch({ timeline: { ...data.timeline, project_start: v } })}
                    />
                    <Field
                      label="نهاية المشروع"
                      type="date"
                      value={data.timeline.project_end || ''}
                      onChange={(v) => patch({ timeline: { ...data.timeline, project_end: v } })}
                    />
                  </div>
                  <textarea
                    rows={2}
                    placeholder="ملاحظات BOQ / الجدول"
                    value={data.boq.notes || ''}
                    onChange={(e) => patch({ boq: { ...data.boq, notes: e.target.value } })}
                    className="w-full p-2.5 border rounded-xl text-sm"
                  />
                </div>
              )}

              {activeStage === 'technical_report' && (
                <TechnicalReportSection
                  client={client}
                  report={data.technical_report}
                  saving={saving}
                  onChange={(technical_report) => patch({ technical_report })}
                  onSave={() =>
                    save({ ...data }, 'تم حفظ التقرير الفني.', { issueOutgoing: true, stayOpen: true })
                  }
                  onPrint={() => void handlePrintTechnical()}
                />
              )}

              {activeStage === 'inspections' && (
                <div className="space-y-6">
                  <div className="space-y-4">
                    <h3 className="text-sm font-bold">الزيارات الميدانية</h3>
                    {data.field_visits.map((visit) => (
                      <div key={visit.visit_number} className="border rounded-xl p-4 bg-gray-50">
                        <h4 className="font-bold text-sm mb-3">
                          تقرير الزيارة الميدانية #{visit.visit_number}
                        </h4>
                        <StatusSelect
                          value={visit.status}
                          onChange={(status) => {
                            patch({
                              field_visits: data.field_visits.map((v) =>
                                v.visit_number === visit.visit_number ? { ...v, status } : v
                              ),
                            });
                          }}
                        />
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
                          <Field
                            label="تاريخ الزيارة"
                            type="date"
                            value={visit.visit_date || ''}
                            onChange={(v) => {
                              patch({
                                field_visits: data.field_visits.map((x) =>
                                  x.visit_number === visit.visit_number ? { ...x, visit_date: v } : x
                                ),
                              });
                            }}
                          />
                          <Field
                            label="المهندس"
                            value={visit.engineer_name || ''}
                            onChange={(v) => {
                              patch({
                                field_visits: data.field_visits.map((x) =>
                                  x.visit_number === visit.visit_number
                                    ? { ...x, engineer_name: v }
                                    : x
                                ),
                              });
                            }}
                          />
                        </div>
                        <textarea
                          rows={3}
                          placeholder="النتائج والملاحظات"
                          value={visit.findings || ''}
                          onChange={(e) => {
                            patch({
                              field_visits: data.field_visits.map((x) =>
                                x.visit_number === visit.visit_number
                                  ? { ...x, findings: e.target.value }
                                  : x
                              ),
                            });
                          }}
                          className="w-full p-2.5 border rounded-xl text-sm mt-3"
                        />
                      </div>
                    ))}
                  </div>
                  <SupervisionReportSection
                    client={client}
                    data={data}
                    company={company}
                    saving={saving}
                    onChange={(supervision_report) => patch({ supervision_report })}
                    onSave={() => save(data, 'تم حفظ تقرير الإشراف.', { stayOpen: true })}
                  />
                </div>
              )}

              {activeStage === 'deficiencies' && (
                <div className="space-y-4">
                  <div className="rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-xs text-amber-950">
                    لا تُفتح خطابات التسليم إلا بعد حل جميع الملاحظات الحرجة.
                  </div>
                  <StatusSelect
                    value={data.technical_notes.status}
                    onChange={(status) =>
                      patch({ technical_notes: { ...data.technical_notes, status } })
                    }
                  />
                  <Field
                    label="حالة المطابقة"
                    value={data.technical_notes.compliance_status || ''}
                    onChange={(v) =>
                      patch({ technical_notes: { ...data.technical_notes, compliance_status: v } })
                    }
                  />
                  <button
                    type="button"
                    className="px-3 py-2 rounded-xl border text-sm"
                    onClick={() => {
                      patch({
                        technical_notes: {
                          ...data.technical_notes,
                          deficiencies: [
                            ...(data.technical_notes.deficiencies || []),
                            {
                              id: `def-${Date.now()}`,
                              description: 'ملاحظة موقع جديدة',
                              severity: 'medium',
                              resolved: false,
                            },
                          ],
                        },
                      });
                    }}
                  >
                    + إضافة ملاحظة
                  </button>
                  <ul className="space-y-2">
                    {(data.technical_notes.deficiencies || []).map((d) => (
                      <li key={d.id} className="border rounded-xl p-3 text-sm space-y-2">
                        <input
                          className="w-full border rounded-lg px-2 py-1.5"
                          value={d.description}
                          onChange={(e) =>
                            patch({
                              technical_notes: {
                                ...data.technical_notes,
                                deficiencies: (data.technical_notes.deficiencies || []).map((x) =>
                                  x.id === d.id ? { ...x, description: e.target.value } : x
                                ),
                              },
                            })
                          }
                        />
                        <div className="flex flex-wrap gap-2 items-center">
                          <select
                            className="border rounded-lg px-2 py-1 text-xs"
                            value={d.severity}
                            onChange={(e) =>
                              patch({
                                technical_notes: {
                                  ...data.technical_notes,
                                  deficiencies: (data.technical_notes.deficiencies || []).map((x) =>
                                    x.id === d.id ? { ...x, severity: e.target.value } : x
                                  ),
                                },
                              })
                            }
                          >
                            <option value="low">منخفض</option>
                            <option value="medium">متوسط</option>
                            <option value="high">عالي</option>
                            <option value="critical">حرج / Critical</option>
                          </select>
                          <label className="inline-flex items-center gap-1 text-xs">
                            <input
                              type="checkbox"
                              checked={!!d.resolved}
                              onChange={(e) =>
                                patch({
                                  technical_notes: {
                                    ...data.technical_notes,
                                    deficiencies: (data.technical_notes.deficiencies || []).map(
                                      (x) =>
                                        x.id === d.id ? { ...x, resolved: e.target.checked } : x
                                    ),
                                  },
                                })
                              }
                            />
                            تم الحل (Resolved)
                          </label>
                        </div>
                      </li>
                    ))}
                  </ul>
                  <textarea
                    rows={3}
                    placeholder="توصيات"
                    value={data.technical_notes.recommendations || ''}
                    onChange={(e) =>
                      patch({
                        technical_notes: {
                          ...data.technical_notes,
                          recommendations: e.target.value,
                        },
                      })
                    }
                    className="w-full p-2.5 border rounded-xl text-sm"
                  />
                </div>
              )}

              {activeStage === 'transmittals' && (
                <div className="space-y-6">
                  <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs text-emerald-950">
                    يرث رقم الدراسة، المالك، المساحة، تصنيف الإشغال، ومرفقات المخططات/الحسابات من المراحل 1 و2 و4.
                  </div>
                  <EngineeringDeliverySection
                    client={client}
                    data={data}
                    company={company}
                    saving={saving}
                    onChange={(engineering_delivery) => patch({ engineering_delivery })}
                    onSave={() => save(data, 'تم حفظ خطاب تسليم الدراسة.', { stayOpen: true })}
                  />
                  <CdCoverLetterSection
                    client={client}
                    data={data}
                    company={company}
                    saving={saving}
                    onChange={(cd_cover_letter) => patch({ cd_cover_letter })}
                    onSave={async (letter) => {
                      const next = letter ? { ...data, cd_cover_letter: letter } : data;
                      if (letter?.outgoing_number && !next.technical_report.outgoing_number) {
                        next.technical_report = {
                          ...next.technical_report,
                          outgoing_number: letter.outgoing_number,
                        };
                      }
                      await save(next, 'تم حفظ / إصدار خطاب تسليم الدفاع المدني.', {
                        stayOpen: true,
                      });
                    }}
                  />
                </div>
              )}

              {activeStage === 'final_report' && (
                <FinalInspectionSection
                  client={client}
                  data={data}
                  company={company}
                  saving={saving}
                  onChange={(final_inspection) => patch({ final_inspection })}
                  onSave={() => save(data, 'تم حفظ التقرير النهائي.', { stayOpen: true })}
                />
              )}

              {activeStage === 'completion' && (
                <CompletionCertificateSection
                  client={client}
                  data={data}
                  company={company}
                  saving={saving}
                  onChange={(completion_certificate) => patch({ completion_certificate })}
                  onSave={(opts) => save(data, 'تم حفظ الشهادة.', { ...opts, stayOpen: true })}
                  onSaveAndPrint={async (cert) => {
                    const nextData = { ...data, completion_certificate: cert };
                    await save(nextData, 'تم إصدار رقم الشهادة تلقائياً.', {
                      issueCertificate: false,
                      stayOpen: true,
                    });
                    const { printCompletionCertificate } = await import(
                      '@/components/projects/CompletionCertificatePrint'
                    );
                    printCompletionCertificate(client, cert, company);
                  }}
                />
              )}

              <div className="sticky bottom-0 bg-white/95 border-t pt-3 mt-6 space-y-2">
                {blockers.length ? (
                  <p className="text-xs text-amber-800">لاعتماد المرحلة: {blockers.join(' · ')}</p>
                ) : (
                  <p className="text-xs text-emerald-800">المرحلة جاهزة للاعتماد والانتقال.</p>
                )}
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void save(data, 'تم حفظ بيانات المرحلة.', { stayOpen: true })}
                    className="px-4 py-2.5 rounded-xl border text-sm font-semibold disabled:opacity-50"
                  >
                    {saving ? 'جاري الحفظ...' : 'حفظ المرحلة'}
                  </button>
                  <button
                    type="button"
                    disabled={saving || blockers.length > 0}
                    onClick={() => void handleApproveAndProceed()}
                    className="px-4 py-2.5 rounded-xl bg-[#1f4d3a] text-white text-sm font-bold disabled:opacity-50"
                  >
                    اعتماد وانتقال للمرحلة التالية
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <InvoicePromptModal
        open={invoicePromptOpen}
        message="تم اعتماد المرحلة. هل تريد استعراض وإصدار الفاتورة الضريبية المعتمدة؟"
        invoice={promptInvoice}
        loading={invoiceBusy}
        onClose={() => {
          setInvoicePromptOpen(false);
          setPromptInvoice(null);
          setPendingInvoiceEvent(null);
        }}
        onIssue={() => {
          void (async () => {
            setInvoiceBusy(true);
            const result =
              pendingInvoiceEvent && pendingInvoiceEvent !== 'manual'
                ? await generateInvoiceForEngineeringEvent(client, pendingInvoiceEvent)
                : await generateTaxInvoiceFromMilestone({
                    clientId: client.id,
                    triggerSource: 'manual',
                  });
            setInvoiceBusy(false);
            if (!result.ok || !result.invoice) {
              setMessage(result.error || result.messages.join(' — ') || 'تعذر إصدار الفاتورة');
              return;
            }
            setPromptInvoice(result.invoice);
            setMessage(result.messages.join(' — '));
          })();
        }}
        onPreview={() => {
          if (promptInvoice) void printTaxInvoice(promptInvoice);
        }}
        onDownload={() => {
          if (promptInvoice) void downloadTaxInvoice(promptInvoice);
        }}
        onWhatsApp={() => {
          if (promptInvoice) void shareTaxInvoiceWhatsApp(promptInvoice, client.phone);
        }}
      />
    </>
  );
}

function StatusSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: (typeof REPORT_STATUSES)[number]) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as (typeof REPORT_STATUSES)[number])}
      className="p-2 border rounded-lg text-sm bg-white w-full"
    >
      {REPORT_STATUSES.map((s) => (
        <option key={s} value={s}>
          {s}
        </option>
      ))}
    </select>
  );
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full p-2.5 border rounded-xl text-sm"
      />
    </div>
  );
}
