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
import { PROJECT_REPORT_SECTIONS, type ProjectReportSectionId } from '@/lib/constants/modules';
import BuildingPlanReportSection from '@/components/projects/BuildingPlanReportSection';
import SafetyBlueprintsUpload from '@/components/projects/SafetyBlueprintsUpload';
import TechnicalReportSection from '@/components/projects/TechnicalReportSection';
import { printTechnicalReport } from '@/components/projects/TechnicalReportPrint';
import EngineeringDeliverySection from '@/components/projects/EngineeringDeliverySection';
import FinalInspectionSection from '@/components/projects/FinalInspectionSection';
import CompletionCertificateSection from '@/components/projects/CompletionCertificateSection';
import SupervisionReportSection from '@/components/projects/SupervisionReportSection';
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
import { EMPTY_SAFETY_BLUEPRINTS } from '@/lib/types/project-reports';
import { loadCompanyProfile, type CompanyProfile } from '@/lib/company-profile';
import { ensureCertificateNumber, ensureOutgoingNumber } from '@/lib/business/document-numbers';
import { backupEngineeringDataLocally } from '@/lib/supabase/safe-client-write';
import NumericInput from '@/components/ui/NumericInput';
import type { ClientRecord } from '@/lib/types/client';
import type { ProjectEngineeringData } from '@/lib/types/project-reports';
import type { TaxInvoice } from '@/lib/types/tax-invoice';

interface ProjectReportModalProps {
  client: ClientRecord | null;
  onClose: () => void;
  onUpdated: () => void;
}

const REPORT_STATUSES = ['مسودة', 'قيد الإعداد', 'مكتمل', 'معتمد'] as const;

export default function ProjectReportModal({ client, onClose, onUpdated }: ProjectReportModalProps) {
  const [activeSection, setActiveSection] = useState<ProjectReportSectionId>('technical_report');
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

  useEffect(() => {
    void loadCompanyProfile().then(setCompany);
  }, []);

  useEffect(() => {
    if (!client) return;
    const visitsCount = client.quotation_visits_count || 1;
    const parsed = parseProjectEngineeringData(client.project_engineering_data);
    const withPlan = {
      ...parsed,
      building_plan: seedBuildingPlanFromClient(client, parsed.building_plan),
    };
    const seeded = seedProjectEngineeringFromClient(client, withPlan);
    setData(syncProjectVisitsFromQuotation(seeded, visitsCount));
    setActiveSection('technical_report');
    setMessage(null);
  }, [client]);

  const progress = useMemo(() => (data ? getProjectReportProgress(data) : 0), [data]);

  if (!client || !data) return null;

  const save = async (
    nextData: ProjectEngineeringData,
    successText: string,
    options?: { issueOutgoing?: boolean; issueCertificate?: boolean }
  ) => {
    setSaving(true);
    setMessage(null);
    const outgoingNumber = options?.issueOutgoing
      ? await ensureOutgoingNumber(nextData.technical_report?.outgoing_number)
      : nextData.technical_report?.outgoing_number;
    const certificateNumber = options?.issueCertificate
      ? await ensureCertificateNumber(nextData.completion_certificate?.certificate_number)
      : nextData.completion_certificate?.certificate_number;
    const stamped: ProjectEngineeringData = {
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
    const { error } = await supabase
      .from('clients')
      .update({
        project_engineering_data: stamped,
        // اضمن بقاء السجل ظاهراً في إدارة المشاريع بعد أي حفظ تقرير
        pipeline_stage: client.pipeline_stage === 'completed' ? 'completed' : 'projects',
      })
      .eq('id', client.id);

    // نسخة محلية فورية (متزامنة) — لا نؤخر الإغلاق بـ dynamic import
    backupEngineeringDataLocally(client.id, stamped);
    setSaving(false);

    if (error) {
      setMessage(`تعذّر الحفظ على السيرفر — تم حفظ نسخة محلية: ${error.message}`);
      setData(stamped);
      return;
    }

    const deliveryDone = ['مكتمل', 'معتمد'].includes(stamped.engineering_delivery.status || '');
    const finalDone = ['مكتمل', 'معتمد'].includes(stamped.final_inspection.status || '');
    const completionDone = ['مكتمل', 'معتمد'].includes(stamped.completion_certificate.status || '');
    const willInvoice =
      (deliveryDone && successText.includes('تسليم')) ||
      (finalDone && successText.includes('النهائي')) ||
      (completionDone && successText.includes('شهادة'));

    if (willInvoice) {
      if (deliveryDone && successText.includes('تسليم')) {
        setPendingInvoiceEvent('engineering_delivery');
      } else if (finalDone && successText.includes('النهائي')) {
        setPendingInvoiceEvent('final_inspection');
      } else {
        setPendingInvoiceEvent('completion');
      }
      setPromptInvoice(null);
      setInvoicePromptOpen(true);
      setData(stamped);
      setMessage(successText);
    } else {
      // أقفل فوراً بعد نجاح الكتابة — قبل تحديث القائمة الثقيل
      onClose();
    }

    void import('@/lib/activity/logger').then(({ logActivity }) =>
      logActivity({
        actionType: 'UPDATE',
        module: 'projects',
        pageUrl: '/projects',
        details: `تم تحديث تقرير هندسي للعميل ${client.business_name || client.name} — ${successText}`,
        metadata: { clientId: client.id },
      })
    );
    // حدّث القائمة بعد إطار رسم حتى يظهر الإغلاق بلا تأخير
    requestAnimationFrame(() => {
      onUpdated();
    });
  };

  const patch = (partial: Partial<ProjectEngineeringData>) => setData({ ...data, ...partial });

  const handlePrintTechnical = async () => {
    let report = data.technical_report;
    if (!report.outgoing_number?.trim()) {
      const outgoingNumber = await ensureOutgoingNumber(report.outgoing_number);
      const nextData: ProjectEngineeringData = {
        ...data,
        technical_report: { ...report, outgoing_number: outgoingNumber },
      };
      await save(nextData, 'تم إصدار رقم الصادر تلقائياً.', { issueOutgoing: false });
      report = nextData.technical_report;
    }
    const company = await loadCompanyProfile();
    printTechnicalReport({ client, report, company });
  };

  return (
    <>
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-xl w-full max-w-5xl max-h-[94vh] flex flex-col overflow-hidden">
        <div className="p-5 border-b">
          <div className="flex justify-between items-start gap-4">
            <div>
              <h2 className="text-xl font-bold text-gray-900">ملف المشروع الهندسي</h2>
              <p className="text-sm text-gray-500 mt-1">{client.business_name || client.name} — {client.client_code}</p>
              <p className="text-xs text-indigo-600 mt-1">الزيارات الميدانية المتفق عليها: {client.quotation_visits_count || 1}</p>
            </div>
            <button onClick={onClose} className="text-2xl text-gray-400 leading-none">×</button>
          </div>
          <div className="mt-3 h-2 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full bg-indigo-600 transition-all" style={{ width: `${progress}%` }} />
          </div>
          <p className="text-xs text-gray-500 mt-1">اكتمال التقارير: {progress}%</p>
        </div>

        <div className="flex flex-1 min-h-0">
          <nav className="w-52 shrink-0 border-l bg-gray-50 overflow-y-auto p-2 space-y-0.5 hidden md:block">
            {PROJECT_REPORT_SECTIONS.map((section) => (
              <button
                key={section.id}
                onClick={() => setActiveSection(section.id)}
                className={`w-full text-right px-3 py-2 rounded-lg text-xs font-medium ${
                  activeSection === section.id ? 'bg-indigo-600 text-white' : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                {section.label}
              </button>
            ))}
          </nav>

          <div className="flex-1 p-5 overflow-y-auto">
            {message && (
              <div className={`mb-3 p-3 rounded-xl text-sm ${message.includes('تم') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                {message}
              </div>
            )}

            <select
              value={activeSection}
              onChange={(e) => setActiveSection(e.target.value as ProjectReportSectionId)}
              className="md:hidden w-full mb-4 p-2 border rounded-lg text-sm"
            >
              {PROJECT_REPORT_SECTIONS.map((s) => (
                <option key={s.id} value={s.id}>{s.label}</option>
              ))}
            </select>

            {activeSection === 'technical_report' && (
              <TechnicalReportSection
                client={client}
                report={data.technical_report}
                saving={saving}
                onChange={(technical_report) => patch({ technical_report })}
                onSave={() => save({ ...data }, 'تم حفظ التقرير الفني.', { issueOutgoing: true })}
                onPrint={() => void handlePrintTechnical()}
              />
            )}

            {activeSection === 'building_plan' && (
              <div className="space-y-6">
                <BuildingPlanReportSection
                  client={client}
                  report={data.building_plan}
                  saving={saving}
                  onChange={(building_plan) => patch({ building_plan })}
                  onSave={(building_plan, successText) => save({ ...data, building_plan }, successText)}
                />
                <section className="border-t pt-5">
                  <h3 className="text-sm font-bold text-gray-900 mb-3">قسم السلامة — رفع المخططات</h3>
                  <SafetyBlueprintsUpload
                    client={client}
                    buildingPlan={data.building_plan}
                    value={data.safety_blueprints || EMPTY_SAFETY_BLUEPRINTS}
                    onChange={(safety_blueprints) => patch({ safety_blueprints })}
                    onPersist={async (safety_blueprints) => {
                      await save({ ...data, safety_blueprints }, 'تم حفظ مخططات السلامة وتشغيل الفحص الآلي.');
                    }}
                  />
                </section>
              </div>
            )}

            {activeSection === 'boq' && (
              <div className="space-y-3">
                <StatusSelect value={data.boq.status} onChange={(status) => patch({ boq: { ...data.boq, status } })} />
                <textarea rows={4} placeholder="ملاحظات BOQ" value={data.boq.notes || ''} onChange={(e) => patch({ boq: { ...data.boq, notes: e.target.value } })} className="w-full p-2.5 border rounded-xl text-sm" />
                <button onClick={() => save(data, 'تم حفظ جدول الكميات.')} disabled={saving} className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm">حفظ BOQ</button>
              </div>
            )}

            {activeSection === 'timeline' && (
              <div className="space-y-3">
                <StatusSelect value={data.timeline.status} onChange={(status) => patch({ timeline: { ...data.timeline, status } })} />
                <div className="grid grid-cols-2 gap-3">
                  <Field label="بداية المشروع" type="date" value={data.timeline.project_start || ''} onChange={(v) => patch({ timeline: { ...data.timeline, project_start: v } })} />
                  <Field label="نهاية المشروع" type="date" value={data.timeline.project_end || ''} onChange={(v) => patch({ timeline: { ...data.timeline, project_end: v } })} />
                </div>
                <button onClick={() => save(data, 'تم حفظ الجدول الزمني.')} disabled={saving} className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm">حفظ الجدول</button>
              </div>
            )}

            {activeSection === 'field_visits' && (
              <div className="space-y-4">
                {data.field_visits.map((visit) => (
                  <div key={visit.visit_number} className="border rounded-xl p-4 bg-gray-50">
                    <h4 className="font-bold text-sm mb-3">تقرير الزيارة الميدانية #{visit.visit_number}</h4>
                    <StatusSelect value={visit.status} onChange={(status) => {
                      const visits = data.field_visits.map((v) => v.visit_number === visit.visit_number ? { ...v, status } : v);
                      patch({ field_visits: visits });
                    }} />
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
                      <Field label="تاريخ الزيارة" type="date" value={visit.visit_date || ''} onChange={(v) => {
                        patch({ field_visits: data.field_visits.map((x) => x.visit_number === visit.visit_number ? { ...x, visit_date: v } : x) });
                      }} />
                      <Field label="المهندس" value={visit.engineer_name || ''} onChange={(v) => {
                        patch({ field_visits: data.field_visits.map((x) => x.visit_number === visit.visit_number ? { ...x, engineer_name: v } : x) });
                      }} />
                    </div>
                    <textarea rows={3} placeholder="النتائج والملاحظات" value={visit.findings || ''} onChange={(e) => {
                      patch({ field_visits: data.field_visits.map((x) => x.visit_number === visit.visit_number ? { ...x, findings: e.target.value } : x) });
                    }} className="w-full p-2.5 border rounded-xl text-sm mt-3" />
                  </div>
                ))}
                <button onClick={() => save(data, 'تم حفظ تقارير الزيارات.')} disabled={saving} className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm">حفظ الزيارات</button>
              </div>
            )}

            {activeSection === 'supervision_report' && (
              <SupervisionReportSection
                client={client}
                data={data}
                company={company}
                saving={saving}
                onChange={(supervision_report) => patch({ supervision_report })}
                onSave={() => save(data, 'تم حفظ تقرير الإشراف.')}
              />
            )}

            {activeSection === 'technical_notes' && (
              <ReportForm
                status={data.technical_notes.status}
                onStatus={(status) => patch({ technical_notes: { ...data.technical_notes, status } })}
                fields={[
                  ['compliance_status', 'حالة المطابقة', data.technical_notes.compliance_status || ''],
                ]}
                onChange={(key, value) => patch({ technical_notes: { ...data.technical_notes, [key]: value } })}
                notes={data.technical_notes.recommendations || ''}
                onNotes={(recommendations) => patch({ technical_notes: { ...data.technical_notes, recommendations } })}
                onSave={() => save(data, 'تم حفظ الملاحظات الفنية.')}
                saving={saving}
              />
            )}

            {activeSection === 'engineering_delivery' && (
              <div className="space-y-3">
                <EngineeringDeliverySection
                  client={client}
                  data={data}
                  company={company}
                  saving={saving}
                  onChange={(engineering_delivery) => patch({ engineering_delivery })}
                  onSave={() => save(data, 'تم حفظ خطاب تسليم الدراسة.')}
                />
                <button
                  type="button"
                  disabled={invoiceBusy}
                  onClick={() => {
                    setPendingInvoiceEvent('manual');
                    setPromptInvoice(null);
                    setInvoicePromptOpen(true);
                  }}
                  className="px-4 py-2.5 rounded-xl bg-[#1f4d3a] text-white text-sm font-semibold disabled:opacity-50"
                >
                  اصدار فاتورة جديدة
                </button>
              </div>
            )}

            {activeSection === 'final_inspection' && (
              <FinalInspectionSection
                client={client}
                data={data}
                company={company}
                saving={saving}
                onChange={(final_inspection) => patch({ final_inspection })}
                onSave={() => save(data, 'تم حفظ التقرير النهائي.')}
              />
            )}

            {activeSection === 'completion_certificate' && (
              <CompletionCertificateSection
                client={client}
                data={data}
                company={company}
                saving={saving}
                onChange={(completion_certificate) => patch({ completion_certificate })}
                onSave={(opts) => save(data, 'تم حفظ الشهادة.', opts)}
                onSaveAndPrint={async (cert) => {
                  const nextData = { ...data, completion_certificate: cert };
                  await save(nextData, 'تم إصدار رقم الشهادة تلقائياً.', { issueCertificate: false });
                  const { printCompletionCertificate } = await import(
                    '@/components/projects/CompletionCertificatePrint'
                  );
                  printCompletionCertificate(client, cert, company);
                }}
              />
            )}
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
        onClose();
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

function StatusSelect({ value, onChange }: { value: string; onChange: (v: (typeof REPORT_STATUSES)[number]) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value as (typeof REPORT_STATUSES)[number])} className="p-2 border rounded-lg text-sm bg-white">
      {REPORT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
    </select>
  );
}

function Field({ label, value, onChange, type = 'text' }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <div>
      <label className="block text-xs font-semibold mb-1">{label}</label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} className="w-full p-2.5 border rounded-xl text-sm" />
    </div>
  );
}

function ReportForm({
  status, onStatus, fields, onChange, notes, onNotes, onSave, saving,
}: {
  status: string;
  onStatus: (s: (typeof REPORT_STATUSES)[number]) => void;
  fields: [string, string, string, string?][];
  onChange: (key: string, value: string) => void;
  notes: string;
  onNotes: (v: string) => void;
  onSave: () => void;
  saving: boolean;
}) {
  return (
    <div className="space-y-3">
      <StatusSelect value={status} onChange={onStatus} />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {fields.map(([key, label, value, type]) => (
          <Field key={key} label={label} value={value} type={type} onChange={(v) => onChange(key, v)} />
        ))}
      </div>
      <textarea rows={3} placeholder="ملاحظات" value={notes} onChange={(e) => onNotes(e.target.value)} className="w-full p-2.5 border rounded-xl text-sm" />
      <button onClick={onSave} disabled={saving} className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm">{saving ? 'جاري الحفظ...' : 'حفظ التقرير'}</button>
    </div>
  );
}
