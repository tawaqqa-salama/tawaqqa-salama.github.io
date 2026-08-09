'use client';

/**
 * Interactive Canvas overlay for Design Center Phase-2 zone segmentation & egress.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  DetectedZone,
  EgressAnalysisSummary,
  ZoneClassification,
  ZoneManualOverride,
  ZoneSystemRequirement,
} from '@/lib/projects/design-center/vision/types';

const CLASS_OPTIONS: { id: ZoneClassification; ar: string; en: string }[] = [
  { id: 'electrical_room', ar: 'غرفة كهرباء', en: 'Electrical / MDB' },
  { id: 'server_room', ar: 'غرفة خوادم', en: 'Server / IT' },
  { id: 'kitchen', ar: 'مطبخ', en: 'Kitchen' },
  { id: 'warehouse', ar: 'مستودع', en: 'Warehouse' },
  { id: 'stairwell', ar: 'بئر درج', en: 'Stairwell' },
  { id: 'corridor', ar: 'ممر', en: 'Corridor' },
  { id: 'office', ar: 'مكتب', en: 'Office' },
  { id: 'assembly', ar: 'تجمع/ردهة', en: 'Assembly' },
  { id: 'unknown', ar: 'غير معروف', en: 'Unknown' },
  { id: 'manual', ar: 'يدوي', en: 'Manual' },
];

type Props = {
  preferAr: boolean;
  dark: boolean;
  widthPx: number;
  heightPx: number;
  previewDataUrl: string | null;
  zones: DetectedZone[];
  egress: EgressAnalysisSummary | null;
  zoneRequirements: ZoneSystemRequirement[];
  onApplyOverride: (override: ZoneManualOverride) => void;
};

export default function CadZoneOverlay({
  preferAr,
  dark,
  widthPx,
  heightPx,
  previewDataUrl,
  zones,
  egress,
  zoneRequirements,
  onApplyOverride,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [labelDraft, setLabelDraft] = useState('');
  const [classDraft, setClassDraft] = useState<ZoneClassification>('unknown');
  const [dimScale, setDimScale] = useState(1);
  const [areaDraft, setAreaDraft] = useState('');

  const selected = useMemo(
    () => zones.find((z) => z.id === selectedId) || null,
    [zones, selectedId]
  );

  useEffect(() => {
    if (!selected) return;
    setLabelDraft(selected.label || '');
    setClassDraft(selected.classification || 'unknown');
    setDimScale(1);
    setAreaDraft(selected.area_m2 != null ? String(selected.area_m2) : '');
  }, [selected]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !widthPx || !heightPx) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const cssW = canvas.clientWidth || 640;
    const cssH = Math.max(220, Math.round((cssW * heightPx) / widthPx));
    canvas.width = cssW * (window.devicePixelRatio || 1);
    canvas.height = cssH * (window.devicePixelRatio || 1);
    ctx.setTransform(window.devicePixelRatio || 1, 0, 0, window.devicePixelRatio || 1, 0, 0);

    const sx = cssW / widthPx;
    const sy = cssH / heightPx;

    ctx.clearRect(0, 0, cssW, cssH);
    ctx.fillStyle = dark ? '#0f172a' : '#f8fafc';
    ctx.fillRect(0, 0, cssW, cssH);

    const draw = () => {
      ctx.lineWidth = 2;
      for (const z of zones) {
        const active = z.id === selectedId;
        ctx.beginPath();
        z.polygon.forEach((p, i) => {
          const x = p.x * sx;
          const y = p.y * sy;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.closePath();
        ctx.fillStyle = active
          ? 'rgba(14,165,233,0.28)'
          : z.needs_engineer_label
            ? 'rgba(245,158,11,0.18)'
            : 'rgba(16,185,129,0.16)';
        ctx.strokeStyle = active ? '#0284c7' : z.egress_status === 'exceeds_limit' ? '#dc2626' : '#059669';
        ctx.fill();
        ctx.stroke();

        const tx = (z.bounds.x + z.bounds.w / 2) * sx;
        const ty = (z.bounds.y + z.bounds.h / 2) * sy;
        ctx.fillStyle = dark ? '#e2e8f0' : '#0f172a';
        ctx.font = '600 11px ui-sans-serif, system-ui';
        ctx.textAlign = 'center';
        const title = z.label || (preferAr ? 'بدون تسمية' : 'Unlabeled');
        const area =
          z.area_m2 != null ? `${z.area_m2} m²` : preferAr ? 'المساحة؟' : 'Area?';
        ctx.fillText(title, tx, ty - 6);
        ctx.font = '10px ui-sans-serif, system-ui';
        ctx.fillText(area, tx, ty + 8);
        if (z.travel_distance_m != null) {
          ctx.fillText(`${z.travel_distance_m} m`, tx, ty + 20);
        }
      }

      // Travel vectors
      if (egress?.assessments?.length) {
        ctx.setLineDash([6, 4]);
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 1.5;
        for (const a of egress.assessments) {
          ctx.beginPath();
          ctx.moveTo(a.vector.from.x * sx, a.vector.from.y * sy);
          ctx.lineTo(a.vector.to.x * sx, a.vector.to.y * sy);
          ctx.stroke();
        }
        ctx.setLineDash([]);
      }
    };

    if (previewDataUrl) {
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0, cssW, cssH);
        draw();
      };
      img.onerror = () => draw();
      img.src = previewDataUrl;
    } else {
      draw();
    }
  }, [previewDataUrl, zones, egress, widthPx, heightPx, selectedId, dark, preferAr]);

  const hitTest = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas || !widthPx || !heightPx) return;
    const rect = canvas.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * widthPx;
    const y = ((clientY - rect.top) / rect.height) * heightPx;
    const hit = [...zones]
      .reverse()
      .find(
        (z) =>
          x >= z.bounds.x &&
          x <= z.bounds.x + z.bounds.w &&
          y >= z.bounds.y &&
          y <= z.bounds.y + z.bounds.h
      );
    setSelectedId(hit?.id || null);
  };

  const muted = dark ? 'text-slate-400' : 'text-slate-500';
  const panel = dark
    ? 'bg-slate-900 border border-slate-700'
    : 'bg-white border border-slate-200';

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-bold">
          {preferAr ? 'خريطة الفراغات ومسافات الإخلاء' : 'Zone map & travel distances'}
        </h3>
        <p className={`text-[11px] ${muted}`}>
          {preferAr
            ? 'انقر فراغًا لتعيين التسمية أو ضبط الأبعاد'
            : 'Click a zone to label or adjust dimensions'}
        </p>
      </div>

      <canvas
        ref={canvasRef}
        className={`w-full rounded-xl cursor-crosshair border ${
          dark ? 'border-slate-700' : 'border-slate-200'
        }`}
        style={{ maxHeight: 420 }}
        onClick={(e) => hitTest(e.clientX, e.clientY)}
      />

      {egress ? (
        <p className={`text-[11px] ${muted}`}>
          {preferAr ? 'حد SBC 801' : 'SBC 801 limit'}: {egress.limit.applied_max_m} m ·{' '}
          {preferAr ? 'أقصى انتقال تقديري' : 'Max estimated travel'}:{' '}
          {egress.max_travel_m ?? (preferAr ? 'غير معروف' : 'Unknown')} ·{' '}
          {egress.overall_status}
        </p>
      ) : null}

      {zoneRequirements.length ? (
        <ul className={`text-[11px] space-y-1 ${muted}`}>
          {zoneRequirements.map((r) => (
            <li key={r.zone_id}>
              <span className="font-semibold text-sky-700 dark:text-sky-300">
                {r.zone_label || r.zone_id}
              </span>
              {': '}
              {preferAr ? r.note_ar : r.note_en} ({r.primary_codes.join(', ')})
            </li>
          ))}
        </ul>
      ) : null}

      {selected ? (
        <div className={`rounded-xl p-3 space-y-2 ${panel}`}>
          <p className="text-xs font-bold">
            {preferAr ? 'تعديل الفراغ' : 'Edit zone'}: {selected.id}
          </p>
          <label className="block text-[11px]">
            {preferAr ? 'التسمية' : 'Label'}
            <input
              value={labelDraft}
              onChange={(e) => setLabelDraft(e.target.value)}
              className={`mt-1 w-full rounded-lg border px-2 py-1.5 text-xs ${
                dark ? 'bg-slate-950 border-slate-700' : 'bg-white border-slate-300'
              }`}
            />
          </label>
          <label className="block text-[11px]">
            {preferAr ? 'التصنيف' : 'Classification'}
            <select
              value={classDraft}
              onChange={(e) => setClassDraft(e.target.value as ZoneClassification)}
              className={`mt-1 w-full rounded-lg border px-2 py-1.5 text-xs ${
                dark ? 'bg-slate-950 border-slate-700' : 'bg-white border-slate-300'
              }`}
            >
              {CLASS_OPTIONS.map((o) => (
                <option key={o.id} value={o.id}>
                  {preferAr ? o.ar : o.en}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-[11px]">
            {preferAr ? 'مضاعف الأبعاد' : 'Dimension scale'} ({dimScale.toFixed(2)})
            <input
              type="range"
              min={0.7}
              max={1.4}
              step={0.02}
              value={dimScale}
              onChange={(e) => setDimScale(Number(e.target.value))}
              className="mt-1 w-full"
            />
          </label>
          <label className="block text-[11px]">
            {preferAr ? 'المساحة م² (اختياري)' : 'Area m² (optional)'}
            <input
              value={areaDraft}
              onChange={(e) => setAreaDraft(e.target.value)}
              className={`mt-1 w-full rounded-lg border px-2 py-1.5 text-xs ${
                dark ? 'bg-slate-950 border-slate-700' : 'bg-white border-slate-300'
              }`}
            />
          </label>
          <button
            type="button"
            className="rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold px-3 py-2"
            onClick={() => {
              const areaNum = areaDraft.trim() ? Number(areaDraft) : null;
              onApplyOverride({
                zone_id: selected.id,
                label: labelDraft.trim() || selected.label,
                classification: classDraft,
                dimensionScale: dimScale,
                area_m2: Number.isFinite(areaNum as number) ? areaNum : null,
              });
            }}
          >
            {preferAr ? 'تطبيق التعديل وإعادة حساب الإخلاء' : 'Apply & recompute egress'}
          </button>
        </div>
      ) : null}
    </div>
  );
}
