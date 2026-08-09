/**
 * In-house local client-side CAD/PDF Vision Engine.
 * Rasterizes drawings via pdf.js / ImageDecode, processes on Canvas in memory.
 * No external vision API — privacy: local_only.
 */

import {
  buildScaleCalibration,
  countEgressMentions,
  cropImageData,
  detectRoomZones,
  detectWallSegments,
  dilateBinary,
  parseTitleBlockText,
  thresholdBinary,
  toGrayscale,
} from '@/lib/projects/design-center/vision/drawingSanitizer';
import { buildComplianceReport } from '@/lib/projects/design-center/vision/complianceReport';
import { runCoverageAudit } from '@/lib/projects/design-center/vision/coverageAuditor';
import { runEgressAnalysis } from '@/lib/projects/design-center/vision/egressEngine';
import { runPreCalculations } from '@/lib/projects/design-center/vision/preCalculations';
import {
  collectZoneSystemRequirements,
  enrichZonesWithLabels,
} from '@/lib/projects/design-center/vision/zoneAnalyzer';
import type {
  CADAnalysisResult,
  CadVisionAnalyzeOptions,
  CadVisionSourceKind,
  TextAnchor,
  TitleBlockMetadata,
} from '@/lib/projects/design-center/vision/types';

const DEFAULT_DPI = 300;
const DEFAULT_MAX_EDGE = 4200;

function emptyResult(
  partial: Partial<CADAnalysisResult> & Pick<CADAnalysisResult, 'status' | 'source_kind'>
): CADAnalysisResult {
  return {
    engine: 'local_client',
    file_name: null,
    processed_at: new Date().toISOString(),
    width_px: 0,
    height_px: 0,
    dpi: DEFAULT_DPI,
    scale: {
      ratio_text: null,
      scale_denominator: null,
      meters_per_pixel: null,
      source: 'unknown',
      dpi: DEFAULT_DPI,
    },
    title_block: {
      project_name: null,
      sheet_number: null,
      drawing_title: null,
      occupancy: null,
      area_m2: null,
      scale_text: null,
      revision: null,
      raw_text: '',
      source: 'none',
    },
    zones: [],
    walls: [],
    text_anchors: [],
    preview_data_url: null,
    egress: null,
    zone_system_requirements: [],
    coverage: null,
    pre_calculations: null,
    compliance_report: null,
    gross_floor_area_m2: null,
    exits_count: null,
    doors_count: null,
    occupancy: null,
    extracted_text: '',
    warnings_ar: [],
    warnings_en: [],
    error: null,
    error_code: null,
    privacy: 'local_only',
    ...partial,
  };
}

function sourceKindOf(fileName: string, mime?: string | null): CadVisionSourceKind {
  const n = fileName.toLowerCase();
  const m = String(mime || '').toLowerCase();
  if (n.endsWith('.pdf') || m.includes('pdf')) return 'pdf';
  if (
    /\.(png|jpe?g|webp|gif|bmp)$/i.test(n) ||
    m.startsWith('image/')
  ) {
    return 'image';
  }
  return 'unsupported';
}

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}

async function blobFromDataUrl(dataUrl: string): Promise<Blob> {
  const res = await fetch(dataUrl);
  return res.blob();
}

async function loadImageBitmap(blob: Blob): Promise<ImageBitmap> {
  return createImageBitmap(blob);
}

async function makePreviewDataUrl(imageData: ImageData, maxEdge = 1200): Promise<string | null> {
  try {
    const scale = Math.min(1, maxEdge / Math.max(imageData.width, imageData.height));
    const w = Math.max(1, Math.floor(imageData.width * scale));
    const h = Math.max(1, Math.floor(imageData.height * scale));
    const src = document.createElement('canvas');
    src.width = imageData.width;
    src.height = imageData.height;
    const sctx = src.getContext('2d');
    if (!sctx) return null;
    sctx.putImageData(imageData, 0, 0);
    const dst = document.createElement('canvas');
    dst.width = w;
    dst.height = h;
    const dctx = dst.getContext('2d');
    if (!dctx) return null;
    dctx.drawImage(src, 0, 0, w, h);
    const url = dst.toDataURL('image/jpeg', 0.72);
    src.width = 0;
    src.height = 0;
    dst.width = 0;
    dst.height = 0;
    return url;
  } catch {
    return null;
  }
}

async function rasterizePdf(
  data: ArrayBuffer,
  dpi: number,
  maxEdge: number,
  onProgress?: CadVisionAnalyzeOptions['onProgress']
): Promise<{
  imageData: ImageData;
  text: string;
  anchors: TextAnchor[];
  width: number;
  height: number;
  effectiveDpi: number;
}> {
  onProgress?.(
    'جاري تحويل صفحة PDF إلى صورة (محليًا)...',
    'Rasterizing PDF page locally...'
  );
  const pdfjs = await import('pdfjs-dist');
  const version = (pdfjs as { version?: string }).version || '4.10.38';
  // Worker from same package CDN — processing still runs in-browser
  pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${version}/build/pdf.worker.min.mjs`;

  const doc = await pdfjs.getDocument({ data: new Uint8Array(data) }).promise;
  const page = await doc.getPage(1);
  // PDF user units ≈ 72 DPI
  let scale = dpi / 72;
  let viewport = page.getViewport({ scale });
  const maxDim = Math.max(viewport.width, viewport.height);
  if (maxDim > maxEdge) {
    scale *= maxEdge / maxDim;
    viewport = page.getViewport({ scale });
  }
  const effectiveDpi = Math.round(72 * scale);

  const canvas = document.createElement('canvas');
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('CANVAS_UNAVAILABLE');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  // pdfjs-dist v4 render signature
  await (
    page.render({
      canvasContext: ctx,
      viewport,
    } as unknown as Parameters<typeof page.render>[0])
  ).promise;

  let text = '';
  const anchors: TextAnchor[] = [];
  try {
    const content = await page.getTextContent();
    const lines: string[] = [];
    for (const it of content.items || []) {
      if (!it || typeof it !== 'object' || !('str' in it)) continue;
      const str = String((it as { str?: string }).str || '').trim();
      if (!str) continue;
      lines.push(str);
      const tr = (it as { transform?: number[] }).transform;
      if (Array.isArray(tr) && tr.length >= 6) {
        // PDF text transform → viewport scale already applied via scale factor on e,f? 
        // transform is in unscaled PDF space; multiply by viewport scale
        anchors.push({
          text: str,
          x: tr[4] * scale,
          y: canvas.height - tr[5] * scale,
          w: Number((it as { width?: number }).width || 0) * scale,
          h: Math.abs(tr[3] || 0) * scale || 10,
        });
      }
    }
    text = lines.join('\n');
  } catch {
    text = '';
  }

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  // Drop canvas pixels from DOM ASAP (privacy / memory)
  canvas.width = 0;
  canvas.height = 0;

  return {
    imageData,
    text,
    anchors,
    width: imageData.width,
    height: imageData.height,
    effectiveDpi,
  };
}

async function rasterizeImage(
  blob: Blob,
  dpi: number,
  maxEdge: number,
  onProgress?: CadVisionAnalyzeOptions['onProgress']
): Promise<{ imageData: ImageData; width: number; height: number; effectiveDpi: number }> {
  onProgress?.('جاري تحميل صورة المخطط...', 'Loading drawing image...');
  const bmp = await loadImageBitmap(blob);
  let w = bmp.width;
  let h = bmp.height;
  const maxDim = Math.max(w, h);
  if (maxDim > maxEdge) {
    const s = maxEdge / maxDim;
    w = Math.floor(w * s);
    h = Math.floor(h * s);
  }
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    bmp.close();
    throw new Error('CANVAS_UNAVAILABLE');
  }
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  const imageData = ctx.getImageData(0, 0, w, h);
  canvas.width = 0;
  canvas.height = 0;
  return { imageData, width: w, height: h, effectiveDpi: dpi };
}

async function ocrTitleBlock(
  imageData: ImageData,
  onProgress?: CadVisionAnalyzeOptions['onProgress']
): Promise<string> {
  if (!isBrowser()) return '';
  try {
    onProgress?.(
      'OCR لكتلة العنوان (محلي — Tesseract)...',
      'Local title-block OCR (Tesseract)...'
    );
    // Bottom-right ~28% × 22% — typical title block
    const tw = Math.floor(imageData.width * 0.32);
    const th = Math.floor(imageData.height * 0.24);
    const crop = cropImageData(
      imageData,
      imageData.width - tw,
      imageData.height - th,
      tw,
      th
    );
    const canvas = document.createElement('canvas');
    canvas.width = crop.width;
    canvas.height = crop.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';
    ctx.putImageData(crop, 0, 0);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), 'image/png')
    );
    canvas.width = 0;
    canvas.height = 0;
    if (!blob) return '';

    const Tesseract = await import('tesseract.js');
    const result = await Tesseract.recognize(blob, 'eng+ara', {
      logger: () => undefined,
    });
    return String(result.data?.text || '').trim();
  } catch {
    return '';
  }
}

/**
 * Analyze an uploaded drawing File / Blob / data URL entirely in local memory.
 */
export async function analyzeCadDrawing(
  source: File | Blob | string,
  options: CadVisionAnalyzeOptions = {}
): Promise<CADAnalysisResult> {
  if (!isBrowser()) {
    return emptyResult({
      status: 'failed',
      source_kind: 'unsupported',
      error: 'CAD vision runs in the browser only',
      error_code: 'BROWSER_ONLY',
      warnings_ar: ['محرك الرؤية يعمل داخل المتصفح فقط'],
      warnings_en: ['Vision engine runs in the browser only'],
    });
  }

  const dpi = options.dpi ?? DEFAULT_DPI;
  const maxEdge = options.maxEdgePx ?? DEFAULT_MAX_EDGE;
  const onProgress = options.onProgress;

  let fileName: string | null = null;
  let mime: string | null = null;
  let blob: Blob;

  try {
    if (typeof source === 'string') {
      blob = await blobFromDataUrl(source);
      fileName = 'drawing';
      mime = blob.type || null;
    } else if (source instanceof File) {
      blob = source;
      fileName = source.name;
      mime = source.type || null;
    } else {
      blob = source;
      fileName = 'drawing';
      mime = source.type || null;
    }
  } catch {
    return emptyResult({
      status: 'failed',
      source_kind: 'unsupported',
      error: 'Unreadable drawing source',
      error_code: 'UNREADABLE_SOURCE',
      warnings_ar: ['تعذر قراءة مصدر المخطط — أكمل الحقول يدويًا'],
      warnings_en: ['Could not read drawing source — complete fields manually'],
    });
  }

  const kind = sourceKindOf(fileName || '', mime);
  if (kind === 'unsupported') {
    return emptyResult({
      status: 'unsupported',
      source_kind: 'unsupported',
      file_name: fileName,
      error: 'DWG/DXF/BIM require conversion to PDF or image for local vision',
      error_code: 'FORMAT_UNSUPPORTED',
      warnings_ar: [
        'صيغة DWG/DXF/BIM غير مدعومة مباشرة — صدّر PDF أو صورة ثم أعد التحليل',
      ],
      warnings_en: [
        'DWG/DXF/BIM not supported directly — export PDF/image and re-analyze',
      ],
    });
  }

  try {
    onProgress?.('بدء التحليل المحلي للمخطط...', 'Starting local drawing analysis...');
    let imageData: ImageData;
    let pdfText = '';
    let textAnchors: TextAnchor[] = [];
    let width = 0;
    let height = 0;
    let effectiveDpi = dpi;

    if (kind === 'pdf') {
      const buf = await blob.arrayBuffer();
      try {
        const raster = await rasterizePdf(buf, dpi, maxEdge, onProgress);
        imageData = raster.imageData;
        pdfText = raster.text;
        textAnchors = raster.anchors;
        width = raster.width;
        height = raster.height;
        effectiveDpi = raster.effectiveDpi;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (/password|encrypted/i.test(msg)) {
          return emptyResult({
            status: 'password_protected',
            source_kind: 'pdf',
            file_name: fileName,
            error: 'Password-protected PDF',
            error_code: 'PDF_PASSWORD_PROTECTED',
            warnings_ar: [
              'ملف PDF محمي بكلمة مرور — أزل الحماية أو أكمل الإدخال اليدوي',
            ],
            warnings_en: [
              'Password-protected PDF — remove protection or enter fields manually',
            ],
          });
        }
        throw e;
      }
    } else {
      const raster = await rasterizeImage(blob, dpi, maxEdge, onProgress);
      imageData = raster.imageData;
      width = raster.width;
      height = raster.height;
      effectiveDpi = raster.effectiveDpi;
    }

    onProgress?.('استخراج المقياس وكتلة العنوان...', 'Extracting scale & title block...');
    let ocrText = '';
    if (options.enableOcr !== false && (!pdfText || pdfText.length < 40)) {
      ocrText = await ocrTitleBlock(imageData, onProgress);
    }

    const combinedText = [pdfText, ocrText].filter(Boolean).join('\n');
    const scale = buildScaleCalibration({
      text: combinedText,
      dpi: effectiveDpi,
      manualMetersPerPixel: options.manualMetersPerPixel,
    });

    let title_block: TitleBlockMetadata = parseTitleBlockText(
      ocrText || combinedText.slice(-2500)
    );
    if (ocrText && title_block.source !== 'none') {
      title_block = { ...title_block, source: pdfText ? 'mixed' : 'ocr' };
    } else if (pdfText) {
      title_block = { ...parseTitleBlockText(pdfText), source: 'pdf_text' };
    }

    onProgress?.(
      'تقسيم الفراغات وتصنيف الغرف...',
      'Segmenting zones & classifying rooms...'
    );
    const gray = toGrayscale(imageData);
    const ink = dilateBinary(thresholdBinary(gray), width, height, 1);
    const rawZones = detectRoomZones(ink, width, height, scale.meters_per_pixel);
    const walls = detectWallSegments(ink, width, height, scale.meters_per_pixel);
    const egressMentions = countEgressMentions(combinedText);

    let zones = enrichZonesWithLabels(rawZones, textAnchors, scale.meters_per_pixel);

    onProgress?.(
      'حساب مسافات الإخلاء (SBC 801)...',
      'Computing egress travel distances (SBC 801)...'
    );
    const egress = runEgressAnalysis({
      zones,
      textAnchors,
      width_px: width,
      height_px: height,
      metersPerPixel: scale.meters_per_pixel,
      hasSprinkler: Boolean(options.hasSprinkler),
      occupancy: title_block.occupancy,
    });

    zones = zones.map((z) => {
      const a = egress.assessments.find((x) => x.zone_id === z.id);
      return {
        ...z,
        travel_distance_m: a?.travel_distance_m ?? null,
        egress_status: a?.status ?? null,
      };
    });

    const zone_system_requirements = collectZoneSystemRequirements(zones);

    onProgress?.(
      'تدقيق تغطية الأجهزة والحسابات الأولية...',
      'Auditing device coverage & pre-calculations...'
    );
    const coverage = runCoverageAudit({
      zones,
      textAnchors,
      metersPerPixel: scale.meters_per_pixel,
      occupancy: title_block.occupancy,
    });
    const pre_calculations = runPreCalculations({
      zones,
      hazard: coverage.hazard_class,
      zoneRequirements: zone_system_requirements,
      coverage,
      hasSprinklerDeclared: Boolean(options.hasSprinkler),
    });
    const compliance_report = buildComplianceReport({
      egress,
      coverage,
      zoneRequirements: zone_system_requirements,
      preCalculations: pre_calculations,
      hasSprinklerDeclared: Boolean(options.hasSprinkler),
      hasFireAlarmDeclared: Boolean(options.hasFireAlarm),
      scaleKnown: scale.meters_per_pixel != null,
    });

    const preview_data_url = await makePreviewDataUrl(imageData);

    const zoneAreaSum = zones.reduce((s, z) => s + (z.area_m2 || 0), 0);
    const gross_floor_area_m2 =
      title_block.area_m2 != null && title_block.area_m2 > 0
        ? title_block.area_m2
        : zoneAreaSum > 0
          ? Math.round(zoneAreaSum * 100) / 100
          : null;

    const occupancy = title_block.occupancy;

    const warnings_ar: string[] = [];
    const warnings_en: string[] = [];
    if (!scale.meters_per_pixel) {
      warnings_ar.push(
        'لم يُكتشف مقياس الرسم (مثل 1:100) — المساحات بالمتر غير محسوبة؛ أدخل المقياس أو المساحة يدويًا'
      );
      warnings_en.push(
        'Drawing scale (e.g. 1:100) not detected — m² areas not computed; enter scale or area manually'
      );
    }
    if (!zones.length) {
      warnings_ar.push('لم تُكتشف حدود غرف مغلقة بثقة كافية — راجع المخطط أو أكمل الفراغات يدويًا');
      warnings_en.push(
        'No confident closed room perimeters detected — review drawing or enter spaces manually'
      );
    }
    if (!occupancy) {
      warnings_ar.push('تصنيف الإشغال غير مستخرج من كتلة العنوان — Needs Engineer Input');
      warnings_en.push('Occupancy not extracted from title block — Needs Engineer Input');
    }
    const unlabeled = zones.filter((z) => z.needs_engineer_label).length;
    if (unlabeled) {
      warnings_ar.push(
        `${unlabeled} فراغ بدون تسمية واضحة — انقر على الفراغ لتعيين التسمية يدويًا`
      );
      warnings_en.push(
        `${unlabeled} zone(s) lack clear labels — click a zone to assign a label manually`
      );
    }
    if (egress.overall_status === 'exceeds_limit') {
      warnings_ar.push(
        `مسافة انتقال تقديرية تتجاوز حد SBC 801 (${egress.limit.applied_max_m} م) — مراجعة المهندس`
      );
      warnings_en.push(
        `Estimated travel distance exceeds SBC 801 cap (${egress.limit.applied_max_m} m) — engineer review`
      );
    }
    for (const req of zone_system_requirements) {
      warnings_ar.push(req.note_ar);
      warnings_en.push(req.note_en);
    }
    if (coverage.issues.length) {
      warnings_ar.push(coverage.summary_ar);
      warnings_en.push(coverage.summary_en);
    }
    if (compliance_report.overall_status === 'CRITICAL_NON_COMPLIANCE') {
      warnings_ar.push('وُجدت حالات عدم مطابقة حرجة — راجع تبويب تفريغ الحسابات والمطابقة');
      warnings_en.push('Critical non-compliance found — review Pre-Design Audit tab');
    }

    const hasGeometry = zones.length > 0 || walls.length > 0;
    const status =
      hasGeometry || gross_floor_area_m2 != null || occupancy || scale.meters_per_pixel
        ? zones.length || gross_floor_area_m2 != null
          ? 'completed'
          : 'partial'
        : 'partial';

    return {
      status,
      engine: 'local_client',
      source_kind: kind,
      file_name: fileName,
      processed_at: new Date().toISOString(),
      width_px: width,
      height_px: height,
      dpi: effectiveDpi,
      scale,
      title_block,
      zones,
      walls,
      text_anchors: textAnchors.slice(0, 400),
      preview_data_url,
      egress,
      zone_system_requirements,
      coverage,
      pre_calculations,
      compliance_report,
      gross_floor_area_m2,
      exits_count: egressMentions.exits_count ?? (egress.exits.length || null),
      doors_count: egressMentions.doors_count,
      occupancy,
      extracted_text: combinedText.slice(0, 8000),
      warnings_ar,
      warnings_en,
      error: null,
      error_code: null,
      privacy: 'local_only',
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return emptyResult({
      status: 'failed',
      source_kind: kind,
      file_name: fileName,
      error: msg,
      error_code: 'VISION_FAILED',
      warnings_ar: [
        'فشل التحليل المحلي للمخطط — أكمل الحقول الهندسية يدويًا',
      ],
      warnings_en: [
        'Local drawing analysis failed — complete engineering fields manually',
      ],
    });
  }
}

/** Convenience alias matching the feature brief */
export const cadVisionEngine = {
  analyze: analyzeCadDrawing,
};

export async function resolveDrawingBlobForVision(params: {
  dataUrl?: string | null;
  remoteUrl?: string | null;
  fileName?: string | null;
}): Promise<{ blob: Blob; fileName: string } | null> {
  if (params.dataUrl && params.dataUrl.startsWith('data:')) {
    const blob = await blobFromDataUrl(params.dataUrl);
    return { blob, fileName: params.fileName || 'drawing' };
  }
  if (params.remoteUrl) {
    try {
      const res = await fetch(params.remoteUrl);
      if (!res.ok) return null;
      const blob = await res.blob();
      return { blob, fileName: params.fileName || 'drawing' };
    } catch {
      return null;
    }
  }
  return null;
}
