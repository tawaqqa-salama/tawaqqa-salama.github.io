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
import { printCompletionCertificate } from '@/components/projects/CompletionCertificatePrint';
import BuildingPlanReportSection from '@/components/projects/BuildingPlanReportSection';
import TechnicalReportSection from '@/components/projects/TechnicalReportSection';
import { printTechnicalReport } from '@/components/projects/TechnicalReportPrint';
import { loadCompanyProfile } from '@/lib/company-profile';
import { ensureCertificateNumber, ensureOutgoingNumber } from '@/lib/business/document-numbers';
import NumericInput from '@/components/ui/NumericInput';
import type { ClientRecord } from '@/lib/types/client';
import type { ProjectEngineeringData } from '@/lib/types/project-reports';

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
      .update({ project_engineering_data: stamped })
      .eq('id', client.id);
    setSaving(false);
    if (error) {
      setMessage(error.message);
      return;
    }
    setData(stamped);
    setMessage(successText);
    onUpdated();
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
              <BuildingPlanReportSection
                client={client}
                report={data.building_plan}
                saving={saving}
                onChange={(building_plan) => patch({ building_plan })}
                onSave={(building_plan, successText) => save({ ...data, building_plan }, successText)}
              />
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
              <ReportForm
                status={data.engineering_delivery.status}
                onStatus={(status) => patch({ engineering_delivery: { ...data.engineering_delivery, status } })}
                fields={[
                  ['delivery_date', 'تاريخ التسليم', data.engineering_delivery.delivery_date || '', 'date'],
                  ['delivered_to', 'تم التسليم إلى', data.engineering_delivery.delivered_to || ''],
                ]}
                onChange={(key, value) => patch({ engineering_delivery: { ...data.engineering_delivery, [key]: value } })}
                notes={data.engineering_delivery.study_summary || ''}
                onNotes={(study_summary) => patch({ engineering_delivery: { ...data.engineering_delivery, study_summary } })}
                onSave={() => save(data, 'تم حفظ تقرير التسليم.')}
                saving={saving}
              />
            )}

            {activeSection === 'final_inspection' && (
              <ReportForm
                status={data.final_inspection.status}
                onStatus={(status) => patch({ final_inspection: { ...data.final_inspection, status } })}
                fields={[
                  ['inspection_date', 'تاريخ المعاينة', data.final_inspection.inspection_date || '', 'date'],
                  ['inspector_name', 'المفتش', data.final_inspection.inspector_name || ''],
                  ['overall_result', 'النتيجة العامة', data.final_inspection.overall_result || ''],
                ]}
                onChange={(key, value) => patch({ final_inspection: { ...data.final_inspection, [key]: value } })}
                notes={data.final_inspection.compliance_summary || ''}
                onNotes={(compliance_summary) => patch({ final_inspection: { ...data.final_inspection, compliance_summary } })}
                onSave={() => save(data, 'تم حفظ التقرير النهائي.')}
                saving={saving}
              />
            )}

            {activeSection === 'completion_certificate' && (
              <div className="space-y-3">
                <StatusSelect value={data.completion_certificate.status} onChange={(status) => patch({ completion_certificate: { ...data.completion_certificate, status } })} />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold mb-1">رقم الشهادة</label>
                    <input
                      readOnly
                      value={data.completion_certificate.certificate_number || 'يُصدر تلقائياً عند الحفظ'}
                      className="w-full p-2.5 border rounded-xl text-sm bg-gray-50 text-gray-700"
                    />
                    <p className="text-[11px] text-gray-400 mt-1">تسلسل سنوي تلقائي بصيغة CERT-YYYY-NNN</p>
                  </div>
                  <Field label="تاريخ الإصدار" type="date" value={data.completion_certificate.issue_date || ''} onChange={(v) => patch({ completion_certificate: { ...data.completion_certificate, issue_date: v } })} />
                  <Field label="تاريخ الإنجاز" type="date" value={data.completion_certificate.completion_date || ''} onChange={(v) => patch({ completion_certificate: { ...data.completion_certificate, completion_date: v } })} />
                  <Field label="المهندس" value={data.completion_certificate.engineer_name || client.assigned_engineer || ''} onChange={(v) => patch({ completion_certificate: { ...data.completion_certificate, engineer_name: v } })} />
                </div>
                <textarea rows={3} placeholder="نطاق الأعمال" value={data.completion_certificate.scope_of_work || ''} onChange={(e) => patch({ completion_certificate: { ...data.completion_certificate, scope_of_work: e.target.value } })} className="w-full p-2.5 border rounded-xl text-sm" />
                <div className="flex gap-2">
                  <button onClick={() => save(data, 'تم حفظ الشهادة.', { issueCertificate: true })} disabled={saving} className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm">حفظ</button>
                  <button
                    onClick={async () => {
                      let cert = data.completion_certificate;
                      if (!cert.certificate_number?.trim()) {
                        const certificateNumber = await ensureCertificateNumber(cert.certificate_number);
                        const nextData = {
                          ...data,
                          completion_certificate: { ...cert, certificate_number: certificateNumber },
                        };
                        await save(nextData, 'تم إصدار رقم الشهادة تلقائياً.', { issueCertificate: false });
                        cert = nextData.completion_certificate;
                      }
                      printCompletionCertificate(client, cert);
                    }}
                    className="px-4 py-2 bg-[#1f4d3a] text-white rounded-xl text-sm"
                  >
                    طباعة / تصدير
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
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
