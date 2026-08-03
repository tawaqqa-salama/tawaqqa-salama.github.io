'use client';

import { useMemo, useState } from 'react';
import { validateCompliance } from '@/lib/compliance/engine';
import { getEkbTopic } from '@/lib/compliance/ekb-catalog';
import {
  buildComplianceReportHtml,
  buildComplianceReportDocHtml,
  downloadTextFile,
} from '@/lib/export/compliance-report';
import { openDocumentPreview } from '@/lib/print/document-preview';
import { openWhatsAppChat } from '@/lib/notifications/whatsapp-link';
import { useLanguage } from '@/lib/i18n/LanguageProvider';
import type { ClientRecord } from '@/lib/types/client';
import type { ComplianceValidationResult } from '@/lib/compliance/types';

type ComplianceEnginePanelProps = {
  clients: ClientRecord[];
};

export default function ComplianceEnginePanel({ clients }: ComplianceEnginePanelProps) {
  const { t } = useLanguage();
  const [clientId, setClientId] = useState(clients[0]?.id || '');
  const [occupants, setOccupants] = useState('');
  const [travelDistanceM, setTravelDistanceM] = useState('');
  const [hasSprinklers, setHasSprinklers] = useState(false);
  const [hasFireAlarm, setHasFireAlarm] = useState(false);
  const [hasDetection, setHasDetection] = useState(false);
  const [fileName, setFileName] = useState('');
  const [result, setResult] = useState<ComplianceValidationResult | null>(null);
  const [whatsappTo, setWhatsappTo] = useState('');
  const [notifyMsg, setNotifyMsg] = useState<string | null>(null);

  const selected = useMemo(
    () => clients.find((c) => c.id === clientId) || null,
    [clients, clientId]
  );

  const runValidate = () => {
    if (!selected) return;
    const next = validateCompliance({
      activityType: selected.activity_type,
      floorsCount: selected.floors_count,
      buildingArea: selected.building_area,
      landArea: selected.land_area,
      occupants: occupants ? Number(occupants) : null,
      travelDistanceM: travelDistanceM ? Number(travelDistanceM) : null,
      hasSprinklers,
      hasFireAlarm,
      hasDetection,
      fileName: fileName || null,
    });
    setResult(next);
  };

  const exportPdfPreview = () => {
    if (!result || !selected) return;
    const html = buildComplianceReportHtml(result, {
      projectName: selected.business_name || selected.name,
      preparedBy: t('compliance.report.preparedBy'),
    });
    openDocumentPreview({
      title: t('compliance.report.title', { name: selected.business_name || selected.name || '' }),
      html,
      fileName: `compliance-${selected.client_code || selected.id}`,
    });
  };

  const exportDocx = () => {
    if (!result || !selected) return;
    const html = buildComplianceReportDocHtml(result, {
      projectName: selected.business_name || selected.name,
      preparedBy: t('compliance.report.preparedBy'),
    });
    downloadTextFile(html, `compliance-${selected.client_code || 'report'}.doc`, 'application/msword;charset=utf-8');
  };

  const notifyWhatsApp = async () => {
    if (!result || !whatsappTo.trim()) {
      setNotifyMsg(t('compliance.whatsapp.needPhone'));
      return;
    }
    setNotifyMsg(null);

    const message = [
      'تقرير امتثال SBC/NFPA',
      `المشروع: ${selected?.business_name || selected?.name || '—'}`,
      `النتيجة: ${result.summary}`,
      `الدرجة: ${result.score}/100`,
      result.ok ? 'الحالة: مطابق نسبياً' : 'الحالة: يوجد ملاحظات تحتاج مراجعة',
    ].join('\n');

    const direct = openWhatsAppChat(whatsappTo, message);
    if (!direct.ok) {
      setNotifyMsg(direct.error || t('compliance.whatsapp.failed'));
      return;
    }
    setNotifyMsg(t('compliance.whatsapp.opened'));

    try {
      await fetch('/api/notifications/whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: whatsappTo,
          message,
          metadata: { score: result.score, ok: result.ok },
        }),
      });
    } catch {
      // تجاهل — النشر الثابت غالباً بلا /api
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-[var(--erp-border)] bg-white p-4">
        <h2 className="text-lg font-bold text-[var(--erp-text)]">{t('compliance.engine.title')}</h2>
        <p className="text-sm text-[var(--erp-muted)] mt-1">{t('compliance.engine.subtitle')}</p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
          <label className="text-sm">
            <span className="text-xs font-semibold text-gray-600 mb-1 block">
              {t('compliance.field.project')}
            </span>
            <select
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              className="w-full border rounded-xl px-3 py-2.5 text-sm"
            >
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.business_name || c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="text-xs font-semibold text-gray-600 mb-1 block">
              {t('compliance.field.fileName')}
            </span>
            <input
              value={fileName}
              onChange={(e) => setFileName(e.target.value)}
              placeholder="plan.ifc / drawing.dwg"
              className="w-full border rounded-xl px-3 py-2.5 text-sm"
              dir="ltr"
            />
          </label>
          <label className="text-sm">
            <span className="text-xs font-semibold text-gray-600 mb-1 block">
              {t('compliance.field.occupants')}
            </span>
            <input
              value={occupants}
              onChange={(e) => setOccupants(e.target.value)}
              className="w-full border rounded-xl px-3 py-2.5 text-sm"
              dir="ltr"
            />
          </label>
          <label className="text-sm">
            <span className="text-xs font-semibold text-gray-600 mb-1 block">
              {t('compliance.field.travelDistance')}
            </span>
            <input
              value={travelDistanceM}
              onChange={(e) => setTravelDistanceM(e.target.value)}
              className="w-full border rounded-xl px-3 py-2.5 text-sm"
              dir="ltr"
            />
          </label>
        </div>

        <div className="flex flex-wrap gap-4 mt-3 text-sm">
          <label className="inline-flex items-center gap-2">
            <input type="checkbox" checked={hasSprinklers} onChange={(e) => setHasSprinklers(e.target.checked)} />
            {t('compliance.field.sprinklers')}
          </label>
          <label className="inline-flex items-center gap-2">
            <input type="checkbox" checked={hasFireAlarm} onChange={(e) => setHasFireAlarm(e.target.checked)} />
            {t('compliance.field.fireAlarm')}
          </label>
          <label className="inline-flex items-center gap-2">
            <input type="checkbox" checked={hasDetection} onChange={(e) => setHasDetection(e.target.checked)} />
            {t('compliance.field.detection')}
          </label>
        </div>

        <div className="flex flex-wrap gap-2 mt-4">
          <button
            type="button"
            onClick={runValidate}
            disabled={!selected}
            className="px-4 py-2.5 rounded-xl bg-[var(--erp-primary)] text-white text-sm font-semibold disabled:opacity-50"
          >
            {t('compliance.action.run')}
          </button>
          <button
            type="button"
            onClick={exportPdfPreview}
            disabled={!result}
            className="px-4 py-2.5 rounded-xl border text-sm font-semibold disabled:opacity-50"
          >
            {t('compliance.action.pdf')}
          </button>
          <button
            type="button"
            onClick={exportDocx}
            disabled={!result}
            className="px-4 py-2.5 rounded-xl border text-sm font-semibold disabled:opacity-50"
          >
            {t('compliance.action.docx')}
          </button>
        </div>
      </div>

      {result ? (
        <div className="rounded-xl border bg-white p-4 space-y-3">
          {!result.ok ? (
            <p className="text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-100 rounded-lg px-3 py-2">
              {t('compliance.result.warnings')}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2 text-[11px]">
            <span className="px-2 py-1 rounded-md bg-slate-100 text-slate-700">
              {t('compliance.result.occupancy')}
            </span>
            <span className="px-2 py-1 rounded-md bg-slate-100 text-slate-700">
              {t('compliance.result.activityLimits')}
            </span>
            <span className="px-2 py-1 rounded-md bg-slate-100 text-slate-700">
              {t('compliance.result.mandatorySprinklers')}
            </span>
            <span className="px-2 py-1 rounded-md bg-slate-100 text-slate-700">
              {t('compliance.result.mandatoryAlarm')}
            </span>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-bold text-gray-800">{result.summary}</p>
            <span
              className={`text-xs font-bold px-2.5 py-1 rounded-lg ${
                result.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-800'
              }`}
            >
              {t('compliance.score', { score: result.score })}
            </span>
          </div>

          <div className="space-y-2">
            {result.findings.map((f) => (
              <div key={f.id} className="rounded-lg border px-3 py-2">
                <div className="flex flex-wrap gap-2 items-center justify-between">
                  <p className="font-semibold text-sm">{f.title}</p>
                  <span className="text-[11px] font-semibold text-gray-500">
                    {f.standard} · {f.code} · {f.severity}
                  </span>
                </div>
                <p className="text-xs text-gray-600 mt-1">{f.detail}</p>
              </div>
            ))}
          </div>

          <div>
            <p className="text-sm font-bold mb-2">{t('compliance.ekb.title')}</p>
            <ul className="space-y-1">
              {result.ekbHints.map((id) => {
                const topic = getEkbTopic(id);
                if (!topic) return null;
                return (
                  <li key={id} className="text-xs text-gray-600">
                    <strong>{topic.title}</strong> — {topic.summary}
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="border-t pt-3 flex flex-col sm:flex-row gap-2 sm:items-end">
            <label className="text-sm flex-1">
              <span className="text-xs font-semibold text-gray-600 mb-1 block">
                {t('compliance.whatsapp.label')}
              </span>
              <input
                value={whatsappTo}
                onChange={(e) => setWhatsappTo(e.target.value)}
                placeholder="05xxxxxxxx"
                className="w-full border rounded-xl px-3 py-2 text-sm"
                dir="ltr"
                inputMode="tel"
              />
            </label>
            <button
              type="button"
              onClick={() => void notifyWhatsApp()}
              className="px-4 py-2.5 rounded-xl bg-emerald-700 text-white text-sm font-semibold"
            >
              {t('compliance.whatsapp.send')}
            </button>
          </div>
          {notifyMsg ? (
            <p
              className={`text-xs ${
                notifyMsg === t('compliance.whatsapp.failed') ||
                notifyMsg === t('compliance.whatsapp.needPhone') ||
                notifyMsg.includes('تعذر') ||
                notifyMsg.includes('غير صالح')
                  ? 'text-rose-600'
                  : 'text-emerald-700'
              }`}
            >
              {notifyMsg}
            </p>
          ) : (
            <p className="text-[11px] text-gray-500">{t('compliance.whatsapp.hint')}</p>
          )}
        </div>
      ) : null}
    </div>
  );
}
