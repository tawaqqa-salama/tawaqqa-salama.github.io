import React from 'react';
import {
  type EngineeringStudyModel,
  type SystemKey,
  type SystemRequirementStatus,
  type EngineeringSourceType,
} from '@/lib/projects/engineering-study-types';
import { computeReportReadiness, canGenerateFinalTechnicalReport } from '@/lib/projects/engineering-study-engine';

interface Props {
  study: EngineeringStudyModel;
  onChange: (next: EngineeringStudyModel) => void;
  isEngineerApproved: boolean;
  onEngineerApprovalToggle: (val: boolean) => void;
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

  return (
    <div className="space-y-8 bg-card text-card-foreground p-6 rounded-lg border shadow-sm">
      {/* قسم حالة الجاهزية والبوابات */}
      <div className="p-4 rounded-md border bg-background space-y-3">
        <h3 className="font-bold text-lg text-primary flex items-center gap-2">
          <span>حالة الجاهزية وبوابات التقرير (Readiness & Gates)</span>
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-3 bg-muted rounded border">
            <span className="text-xs text-muted-foreground block">حالة الجاهزية (Readiness):</span>
            <span className={`font-bold text-sm ${readiness.status === 'READY' ? 'text-green-600' : 'text-amber-600'}`}>
              {readiness.status}
            </span>
          </div>
          <div className="p-3 bg-muted rounded border">
            <span className="text-xs text-muted-foreground block">اعتماد المهندس (Engineer Approval):</span>
            <label className="flex items-center gap-2 mt-1 cursor-pointer">
              <input
                type="checkbox"
                checked={isEngineerApproved}
                onChange={(e) => onEngineerApprovalToggle(e.target.checked)}
                className="rounded border-input text-primary focus:ring-primary h-4 w-4"
              />
              <span className="text-sm font-medium">{isEngineerApproved ? 'معتمد رسمياً' : 'غير معتمد'}</span>
            </label>
          </div>
          <div className="p-3 bg-muted rounded border">
            <span className="text-xs text-muted-foreground block">إصدار التقرير النهائي (Final Gate):</span>
            <span className={`font-bold text-sm ${finalGate.allowed ? 'text-green-600' : 'text-red-600'}`}>
              {finalGate.allowed ? 'مسموح بالإصدار النهائي' : 'محظور (مستندات ناقصة أو غير معتمد)'}
            </span>
          </div>
        </div>
        {readiness.reasons.length > 0 && (
          <div className="text-xs text-amber-600 bg-amber-50 dark:bg-amber-950/30 p-2 rounded border border-amber-200">
            <strong>أسباب المراجعة / النقص:</strong> {readiness.reasons.join(', ')}
          </div>
        )}
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
              placeholder="مثال: تجاري / إداري / صناعي"
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
    </div>
  );
}
