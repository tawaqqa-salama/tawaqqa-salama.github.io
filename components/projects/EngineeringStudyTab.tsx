import React from 'react';
import {
  type EngineeringStudyModel,
  type SystemKey,
  type SystemRequirementStatus,
  type EngineeringSourceType,
  type EvidenceModelItem,
} from '@/lib/projects/engineering-study-types';
import { computeReportReadiness, canGenerateFinalTechnicalReport } from '@/lib/projects/engineering-study-engine';

interface Props {
  study: EngineeringStudyModel;
  onChange: (next: EngineeringStudyModel) => void;
  isEngineerApproved: boolean;
  onEngineerApprovalToggle: (val: boolean) => void;
  reviewerName?: string;
  onReviewerNameChange?: (name: string) => void;
  reviewNotes?: string;
  onReviewNotesChange?: (notes: string) => void;
  approvalTimestamp?: string;
}

const SYSTEM_LABELS: Record<SystemKey, string> = {
  automatic_sprinkler: 'نظام الرش الآلي (Sprinklers)',
  fire_hose_standpipe: 'خراطيم الحريق وصواعد المياه (Standpipe)',
  fire_pump: 'مضخة الحريق (Fire Pump)',
  fire_water_tank: 'خزان مياه الحريق (Water Tank)',
  fire_extinguishers: 'طفايات الحريق اليدوية (Extinguishers)',
  fire_alarm: 'نظام إنذار الحريق (Fire Alarm)',
  emergency_exit: 'مخارج الطوارئ وطرق الهروب (Exits)',
  other: 'أنظمة أخرى تكميلية (Other)',
};

export default function EngineeringStudyTab({
  study,
  onChange,
  isEngineerApproved,
  onEngineerApprovalToggle,
  reviewerName = '',
  onReviewerNameChange,
  reviewNotes = '',
  onReviewNotesChange,
  approvalTimestamp,
}: Props) {
  const readiness = computeReportReadiness(study);
  const finalGate = canGenerateFinalTechnicalReport({
    study,
    isEngineerApproved,
    isDraft: false,
  });

  const updateBuilding = (field: string, val: string) => {
    onChange({
      ...study,
      building_information: {
        ...study.building_information,
        [field]: val,
      },
    });
  };

  const updateSystemMatrix = (sysKey: SystemKey, field: string, val: any) => {
    onChange({
      ...study,
      systems_matrix: {
        ...study.systems_matrix,
        [sysKey]: {
          ...study.systems_matrix[sysKey],
          [field]: val,
        },
      },
    });
  };

  const updatePump = (field: string, val: any) => {
    onChange({
      ...study,
      fire_pump: {
        ...study.fire_pump,
        [field]: val,
      },
    });
  };

  const updateTank = (field: string, val: any) => {
    onChange({
      ...study,
      fire_water_tank: {
        ...study.fire_water_tank,
        [field]: val,
      },
    });
  };

  const addEvidenceItem = () => {
    const newItem: EvidenceModelItem = {
      source_type: 'VERIFIED_RULE',
      rule_id: `RULE-${Date.now()}`,
      code: 'NFPA 13',
      edition: '2025',
      document_id: '',
      page: null,
      section: '',
      table_reference: '',
      figure_reference: '',
      evidence_snippet: '',
      engineer_note: '',
    };
    onChange({
      ...study,
      evidence_list: [...(study.evidence_list || []), newItem],
    });
  };

  const updateEvidenceItem = (index: number, field: keyof EvidenceModelItem, val: any) => {
    const updated = [...study.evidence_list];
    updated[index] = {
      ...updated[index],
      [field]: val,
    };
    onChange({
      ...study,
      evidence_list: updated,
    });
  };

  const removeEvidenceItem = (index: number) => {
    onChange({
      ...study,
      evidence_list: study.evidence_list.filter((_, i) => i !== index),
    });
  };

  return (
    <div className="space-y-8 bg-card text-card-foreground p-6 rounded-lg border shadow-sm">
      {/* 1. قسم حالة الجاهزية وبوابات الإعتماد */}
      <div className="p-4 rounded-md border bg-background space-y-3">
        <h3 className="font-bold text-lg text-primary flex items-center justify-between">
          <span>حالة الجاهزية وبوابات التقرير النهائي (Readiness & Final Gates)</span>
          <span className={`px-3 py-1 rounded text-xs font-bold ${readiness.status === 'READY' ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'}`}>
            جاهزية: {readiness.status}
          </span>
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-3 bg-muted rounded border">
            <span className="text-xs text-muted-foreground block mb-1">حالة الجاهزية الحالية:</span>
            <span className="font-bold text-sm text-foreground">{readiness.status}</span>
            {readiness.reasons.length > 0 && (
              <p className="text-xs text-amber-600 mt-1">أسباب النقص: {readiness.reasons.join(', ')}</p>
            )}
          </div>

          <div className="p-3 bg-muted rounded border space-y-2">
            <span className="text-xs text-muted-foreground block">اعتماد المهندس (Engineer Review & Approval):</span>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={isEngineerApproved}
                onChange={(e) => onEngineerApprovalToggle(e.target.checked)}
                className="rounded border-input text-primary focus:ring-primary h-4 w-4"
              />
              <span className="text-sm font-bold">{isEngineerApproved ? 'معتمد رسمياً (Approved)' : 'غير معتمد'}</span>
            </label>
            {approvalTimestamp && (
              <span className="text-[10px] text-muted-foreground block">تاريخ الاعتماد: {approvalTimestamp}</span>
            )}
          </div>

          <div className="p-3 bg-muted rounded border">
            <span className="text-xs text-muted-foreground block mb-1">بوابة التقرير النهائي (Final Action Gate):</span>
            <span className={`font-bold text-sm block ${finalGate.allowed ? 'text-green-600' : 'text-red-600'}`}>
              {finalGate.allowed ? 'مسموح بإصدار التقرير النهائي' : 'محظور الإصدار النهائي'}
            </span>
            {!finalGate.allowed && (
              <p className="text-[11px] text-red-500 mt-1">الموانع: {finalGate.reasons.join(', ')}</p>
            )}
          </div>
        </div>

        {/* حقول مراجعة المهندس */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t">
          <div>
            <label className="text-xs font-medium block mb-1">اسم المهندس المراجع (Reviewer Name):</label>
            <input
              type="text"
              value={reviewerName}
              onChange={(e) => onReviewerNameChange?.(e.target.value)}
              placeholder="اسم المهندس المسؤول..."
              className="w-full p-2 rounded border bg-background text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-medium block mb-1">ملاحظات المراجعة الهندسية (Review Notes):</label>
            <input
              type="text"
              value={reviewNotes}
              onChange={(e) => onReviewNotesChange?.(e.target.value)}
              placeholder="ملاحظات الاعتماد والتدقيق..."
              className="w-full p-2 rounded border bg-background text-sm"
            />
          </div>
        </div>
      </div>

      {/* أ. معلومات المبنى (Building Information) */}
      <div className="space-y-4">
        <h3 className="font-bold text-md border-b pb-2">أ. بيانات المبنى والدراسة (Building Information)</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="text-sm font-medium block mb-1">نوع الإشغال (Occupancy):</label>
            <input
              type="text"
              value={study.building_information.occupancy}
              onChange={(e) => updateBuilding('occupancy', e.target.value)}
              placeholder="مثال: تجاري / إداري"
              className="w-full p-2 rounded border bg-background text-sm"
            />
          </div>
          <div>
            <label className="text-sm font-medium block mb-1">طبيعة الاستخدام (Use):</label>
            <input
              type="text"
              value={study.building_information.use}
              onChange={(e) => updateBuilding('use', e.target.value)}
              placeholder="مثال: مكاتب إدارية"
              className="w-full p-2 rounded border bg-background text-sm"
            />
          </div>
          <div>
            <label className="text-sm font-medium block mb-1">حالة الإنشاء (Construction Status):</label>
            <input
              type="text"
              value={study.building_information.construction_status}
              onChange={(e) => updateBuilding('construction_status', e.target.value)}
              className="w-full p-2 rounded border bg-background text-sm"
            />
          </div>
          <div>
            <label className="text-sm font-medium block mb-1">المساحة الإجمالية (m²):</label>
            <input
              type="text"
              value={study.building_information.area_m2}
              onChange={(e) => updateBuilding('area_m2', e.target.value)}
              placeholder="مثال: 1200"
              className="w-full p-2 rounded border bg-background text-sm"
            />
          </div>
          <div>
            <label className="text-sm font-medium block mb-1">عدد الأدوار (Floors):</label>
            <input
              type="text"
              value={study.building_information.floors}
              onChange={(e) => updateBuilding('floors', e.target.value)}
              placeholder="مثال: 3 أدوار"
              className="w-full p-2 rounded border bg-background text-sm"
            />
          </div>
          <div>
            <label className="text-sm font-medium block mb-1">ارتفاع المبنى (متر):</label>
            <input
              type="text"
              value={study.building_information.height_m}
              onChange={(e) => updateBuilding('height_m', e.target.value)}
              placeholder="مثال: 14.5"
              className="w-full p-2 rounded border bg-background text-sm"
            />
          </div>
        </div>
      </div>

      {/* ب. مصفوفة الأنظمة (Systems Matrix) */}
      <div className="space-y-4">
        <h3 className="font-bold text-md border-b pb-2">ب. مصفوفة أنظمة السلامة (Systems Matrix)</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-right text-sm border-collapse">
            <thead>
              <tr className="bg-muted text-muted-foreground border-b">
                <th className="p-2">النظام</th>
                <th className="p-2">الحالة (Status)</th>
                <th className="p-2">مصدر البيانات (Source)</th>
                <th className="p-2">مرجع الكود والمرجع</th>
                <th className="p-2">ملاحظات المهندس</th>
              </tr>
            </thead>
            <tbody>
              {(Object.keys(SYSTEM_LABELS) as SystemKey[]).map((sysKey) => {
                const entry = study.systems_matrix[sysKey] || {
                  status: 'NOT_CONFIGURED',
                  source_type: 'NOT_CONFIGURED',
                };
                return (
                  <tr key={sysKey} className="border-b">
                    <td className="p-2 font-medium">{SYSTEM_LABELS[sysKey]}</td>
                    <td className="p-2">
                      <select
                        value={entry.status}
                        onChange={(e) => updateSystemMatrix(sysKey, 'status', e.target.value as SystemRequirementStatus)}
                        className="p-1 rounded border bg-background text-xs"
                      >
                        <option value="REQUIRED">مطلوب (REQUIRED)</option>
                        <option value="NOT_REQUIRED">غير مطلوب (NOT_REQUIRED)</option>
                        <option value="NEEDS_REVIEW">يحتاج مراجعة (NEEDS_REVIEW)</option>
                        <option value="NOT_CONFIGURED">غير مكوّن (NOT_CONFIGURED)</option>
                      </select>
                    </td>
                    <td className="p-2">
                      <select
                        value={entry.source_type}
                        onChange={(e) => updateSystemMatrix(sysKey, 'source_type', e.target.value as EngineeringSourceType)}
                        className="p-1 rounded border bg-background text-xs"
                      >
                        <option value="VERIFIED_RULE">قاعدة معتمدة (VERIFIED_RULE)</option>
                        <option value="ENGINEER_INPUT">مدخل مهندس (ENGINEER_INPUT)</option>
                        <option value="PROJECT_DOCUMENT">مستند مشروع (PROJECT_DOCUMENT)</option>
                        <option value="CALCULATION">حسابات هندسية (CALCULATION)</option>
                        <option value="NOT_CONFIGURED">غير محدد (NOT_CONFIGURED)</option>
                      </select>
                    </td>
                    <td className="p-2">
                      <input
                        type="text"
                        value={entry.source_reference || ''}
                        onChange={(e) => updateSystemMatrix(sysKey, 'source_reference', e.target.value)}
                        placeholder="مرجع NFPA / SBC"
                        className="p-1 w-full rounded border bg-background text-xs"
                      />
                    </td>
                    <td className="p-2">
                      <input
                        type="text"
                        value={entry.engineer_notes || ''}
                        onChange={(e) => updateSystemMatrix(sysKey, 'engineer_notes', e.target.value)}
                        placeholder="ملاحظات..."
                        className="p-1 w-full rounded border bg-background text-xs"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ج. مضخة الحريق (Fire Pump) */}
      <div className="space-y-4">
        <h3 className="font-bold text-md border-b pb-2">ج. مدخلات مضخة الحريق (Fire Pump Inputs)</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="flex items-center gap-2 pt-6">
            <input
              type="checkbox"
              checked={study.fire_pump.required}
              onChange={(e) => updatePump('required', e.target.checked)}
              className="rounded border-input text-primary focus:ring-primary h-4 w-4"
            />
            <label className="text-sm font-medium">مضخة الحريق مطلوبة؟</label>
          </div>
          <div>
            <label className="text-sm font-medium block mb-1">السعة التدفقية (Flow Capacity):</label>
            <input
              type="number"
              value={study.fire_pump.flow_capacity ?? ''}
              onChange={(e) => updatePump('flow_capacity', e.target.value ? Number(e.target.value) : null)}
              placeholder="مثال: 500"
              className="w-full p-2 rounded border bg-background text-sm"
            />
          </div>
          <div>
            <label className="text-sm font-medium block mb-1">وحدة التدفق:</label>
            <select
              value={study.fire_pump.flow_unit}
              onChange={(e) => updatePump('flow_unit', e.target.value)}
              className="w-full p-2 rounded border bg-background text-sm"
            >
              <option value="GPM">GPM</option>
              <option value="L/min">L/min</option>
            </select>
          </div>
          <div>
            <label className="text-sm font-medium block mb-1">الضغط المطلوب (Pressure):</label>
            <input
              type="number"
              value={study.fire_pump.pressure ?? ''}
              onChange={(e) => updatePump('pressure', e.target.value ? Number(e.target.value) : null)}
              placeholder="مثال: 8.5"
              className="w-full p-2 rounded border bg-background text-sm"
            />
          </div>
          <div>
            <label className="text-sm font-medium block mb-1">وحدة الضغط:</label>
            <select
              value={study.fire_pump.pressure_unit}
              onChange={(e) => updatePump('pressure_unit', e.target.value)}
              className="w-full p-2 rounded border bg-background text-sm"
            >
              <option value="bar">bar</option>
              <option value="psi">psi</option>
            </select>
          </div>
          <div>
            <label className="text-sm font-medium block mb-1">نوع المضخة (Pump Type):</label>
            <input
              type="text"
              value={study.fire_pump.pump_type}
              onChange={(e) => updatePump('pump_type', e.target.value)}
              placeholder="مثال: Electric Centrifugal"
              className="w-full p-2 rounded border bg-background text-sm"
            />
          </div>
          <div>
            <label className="text-sm font-medium block mb-1">مرجع الكود (Code Reference):</label>
            <input
              type="text"
              value={study.fire_pump.code_reference || ''}
              onChange={(e) => updatePump('code_reference', e.target.value)}
              placeholder="NFPA 20-2025"
              className="w-full p-2 rounded border bg-background text-sm"
            />
          </div>
          <div>
            <label className="text-sm font-medium block mb-1">ملاحظات المهندس:</label>
            <input
              type="text"
              value={study.fire_pump.engineer_notes || ''}
              onChange={(e) => updatePump('engineer_notes', e.target.value)}
              className="w-full p-2 rounded border bg-background text-sm"
            />
          </div>
        </div>
      </div>

      {/* د. خزان مياه الحريق (Fire Water Tank) */}
      <div className="space-y-4">
        <h3 className="font-bold text-md border-b pb-2">د. مدخلات خزان المياه (Fire Water Tank Inputs)</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="flex items-center gap-2 pt-6">
            <input
              type="checkbox"
              checked={study.fire_water_tank.required}
              onChange={(e) => updateTank('required', e.target.checked)}
              className="rounded border-input text-primary focus:ring-primary h-4 w-4"
            />
            <label className="text-sm font-medium">الخزان مطلوب؟</label>
          </div>
          <div>
            <label className="text-sm font-medium block mb-1">السعة (Capacity):</label>
            <input
              type="number"
              value={study.fire_water_tank.capacity ?? ''}
              onChange={(e) => updateTank('capacity', e.target.value ? Number(e.target.value) : null)}
              placeholder="مثال: 100"
              className="w-full p-2 rounded border bg-background text-sm"
            />
          </div>
          <div>
            <label className="text-sm font-medium block mb-1">وحدة السعة:</label>
            <select
              value={study.fire_water_tank.capacity_unit}
              onChange={(e) => updateTank('capacity_unit', e.target.value)}
              className="w-full p-2 rounded border bg-background text-sm"
            >
              <option value="m3">متر مكعب (m³)</option>
              <option value="gallons">جالون (Gallons)</option>
              <option value="liters">لتر (Liters)</option>
            </select>
          </div>
          <div>
            <label className="text-sm font-medium block mb-1">مدة التصميم (Design Duration):</label>
            <input
              type="number"
              value={study.fire_water_tank.design_duration ?? ''}
              onChange={(e) => updateTank('design_duration', e.target.value ? Number(e.target.value) : null)}
              placeholder="مثال: 2"
              className="w-full p-2 rounded border bg-background text-sm"
            />
          </div>
          <div>
            <label className="text-sm font-medium block mb-1">وحدة المدة:</label>
            <select
              value={study.fire_water_tank.duration_unit}
              onChange={(e) => updateTank('duration_unit', e.target.value)}
              className="w-full p-2 rounded border bg-background text-sm"
            >
              <option value="hours">ساعات (Hours)</option>
              <option value="minutes">دقائق (Minutes)</option>
            </select>
          </div>
          <div>
            <label className="text-sm font-medium block mb-1">مرجع الكود:</label>
            <input
              type="text"
              value={study.fire_water_tank.code_reference || ''}
              onChange={(e) => updateTank('code_reference', e.target.value)}
              placeholder="NFPA 22-2025"
              className="w-full p-2 rounded border bg-background text-sm"
            />
          </div>
          <div className="md:col-span-2">
            <label className="text-sm font-medium block mb-1">ملاحظات المهندس:</label>
            <input
              type="text"
              value={study.fire_water_tank.engineer_notes || ''}
              onChange={(e) => updateTank('engineer_notes', e.target.value)}
              className="w-full p-2 rounded border bg-background text-sm"
            />
          </div>
        </div>
      </div>

      {/* هـ. الأدلة والمراجع (Evidence / References UI) */}
      <div className="space-y-4">
        <div className="flex items-center justify-between border-b pb-2">
          <h3 className="font-bold text-md">هـ. الأدلة والمراجع الهندسية (Evidence & Code References)</h3>
          <button
            type="button"
            onClick={addEvidenceItem}
            className="px-3 py-1 bg-primary text-primary-foreground text-xs rounded shadow hover:opacity-90"
          >
            + إضافة دليل هندسي (Add Evidence)
          </button>
        </div>

        {(!study.evidence_list || study.evidence_list.length === 0) ? (
          <p className="text-xs text-muted-foreground italic">لا توجد أدلة مضافة حالياً. انقر على إضافة دليل هندسي لربط القيم بمراجع الكود.</p>
        ) : (
          <div className="space-y-4">
            {study.evidence_list.map((ev, index) => (
              <div key={index} className="p-4 rounded-lg border bg-background space-y-3 relative">
                <button
                  type="button"
                  onClick={() => removeEvidenceItem(index)}
                  className="absolute top-3 left-3 text-red-500 hover:text-red-700 text-xs font-bold"
                >
                  حذف الدليل
                </button>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="text-xs font-medium block mb-1">نوع المصدر (Source Type):</label>
                    <select
                      value={ev.source_type}
                      onChange={(e) => updateEvidenceItem(index, 'source_type', e.target.value as EngineeringSourceType)}
                      className="w-full p-1.5 rounded border bg-background text-xs"
                    >
                      <option value="VERIFIED_RULE">قاعدة معتمدة (VERIFIED_RULE)</option>
                      <option value="ENGINEER_INPUT">مدخل مهندس (ENGINEER_INPUT)</option>
                      <option value="PROJECT_DOCUMENT">مستند مشروع (PROJECT_DOCUMENT)</option>
                      <option value="CALCULATION">حسابات هندسية (CALCULATION)</option>
                      <option value="NOT_CONFIGURED">غير محدد (NOT_CONFIGURED)</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-medium block mb-1">معرف القاعدة (Rule ID):</label>
                    <input
                      type="text"
                      value={ev.rule_id}
                      onChange={(e) => updateEvidenceItem(index, 'rule_id', e.target.value)}
                      className="w-full p-1.5 rounded border bg-background text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium block mb-1">الكود (Code):</label>
                    <input
                      type="text"
                      value={ev.code}
                      onChange={(e) => updateEvidenceItem(index, 'code', e.target.value)}
                      placeholder="مثال: NFPA 13"
                      className="w-full p-1.5 rounded border bg-background text-xs"
                    />
                  </div>
                </div>

                {/* Conditional rendering based on source_type */}
                {ev.source_type === 'VERIFIED_RULE' && (
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-3 pt-2 border-t text-xs">
                    <div>
                      <label className="block mb-1 text-muted-foreground">الإصدار (Edition):</label>
                      <input
                        type="text"
                        value={ev.edition}
                        onChange={(e) => updateEvidenceItem(index, 'edition', e.target.value)}
                        placeholder="2025"
                        className="w-full p-1 rounded border bg-background"
                      />
                    </div>
                    <div>
                      <label className="block mb-1 text-muted-foreground">رقم الصفحة (Page):</label>
                      <input
                        type="number"
                        value={ev.page ?? ''}
                        onChange={(e) => updateEvidenceItem(index, 'page', e.target.value ? Number(e.target.value) : null)}
                        placeholder="45"
                        className="w-full p-1 rounded border bg-background"
                      />
                    </div>
                    <div>
                      <label className="block mb-1 text-muted-foreground">القسم (Section):</label>
                      <input
                        type="text"
                        value={ev.section || ''}
                        onChange={(e) => updateEvidenceItem(index, 'section', e.target.value)}
                        placeholder="8.2.1"
                        className="w-full p-1 rounded border bg-background"
                      />
                    </div>
                    <div>
                      <label className="block mb-1 text-muted-foreground">الجدول (Table):</label>
                      <input
                        type="text"
                        value={ev.table_reference || ''}
                        onChange={(e) => updateEvidenceItem(index, 'table_reference', e.target.value)}
                        placeholder="Table 11.2.2"
                        className="w-full p-1 rounded border bg-background"
                      />
                    </div>
                    <div>
                      <label className="block mb-1 text-muted-foreground">الشكل (Figure):</label>
                      <input
                        type="text"
                        value={ev.figure_reference || ''}
                        onChange={(e) => updateEvidenceItem(index, 'figure_reference', e.target.value)}
                        placeholder="Fig. 1"
                        className="w-full p-1 rounded border bg-background"
                      />
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2 border-t">
                  <div>
                    <label className="text-xs font-medium block mb-1">مقتطف النص الأصلي (Evidence Snippet):</label>
                    <textarea
                      value={ev.evidence_snippet || ''}
                      onChange={(e) => updateEvidenceItem(index, 'evidence_snippet', e.target.value)}
                      rows={2}
                      placeholder="النص المستخرج من الكود..."
                      className="w-full p-1.5 rounded border bg-background text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium block mb-1">ملاحظة المهندس (Engineer Note):</label>
                    <textarea
                      value={ev.engineer_note || ''}
                      onChange={(e) => updateEvidenceItem(index, 'engineer_note', e.target.value)}
                      rows={2}
                      placeholder="تعليق المهندس على الدليل..."
                      className="w-full p-1.5 rounded border bg-background text-xs"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
