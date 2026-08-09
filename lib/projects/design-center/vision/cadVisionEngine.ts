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
import type {
  CADAnalysisResult,
  CadVisionAnalyzeOptions,
  CadVisionSourceKind,
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

async function rasterizePdf(
  data: ArrayBuffer,
  dpi: number,
  maxEdge: number,
  onProgress?: CadVisionAnalyzeOptions['onProgress']
): Promise<{
  imageData: ImageData;
  text: string;
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
  const base = page.getViewport({ scale: 1 });
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
  try {
    const content = await page.getTextContent();
    text = (content.items || [])
      .map((it) => ('str' in it ? String((it as { str?: string }).str || '') : ''))
      .filter(Boolean)
      .join('\n');
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
    let width = 0;
    let height = 0;
    let effectiveDpi = dpi;

    if (kind === 'pdf') {
      const buf = await blob.arrayBuffer();
      try {
        const raster = await rasterizePdf(buf, dpi, maxEdge, onProgress);
        imageData = raster.imageData;
        pdfText = raster.text;
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
      'كشف الغرف والجدران (معالجة Canvas محلية)...',
      'Detecting rooms & walls (local Canvas)...'
    );
    const gray = toGrayscale(imageData);
    const ink = dilateBinary(thresholdBinary(gray), width, height, 1);
    const zones = detectRoomZones(ink, width, height, scale.meters_per_pixel);
    const walls = detectWallSegments(ink, width, height, scale.meters_per_pixel);
    const egress = countEgressMentions(combinedText);

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

    const hasGeometry = zones.length > 0 || walls.length > 0;
    const status =
      hasGeometry || gross_floor_area_m2 != null || occupancy || scale.meters_per_pixel
        ? zones.length || gross_floor_area_m2 != null
          ? 'completed'
          : 'partial'
        : 'partial';

    // Release large buffers
    // (imageData will be GC'd; gray/ink are local)

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
      gross_floor_area_m2,
      exits_count: egress.exits_count,
      doors_count: egress.doors_count,
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
