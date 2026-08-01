import type { ParsedEngineeringFile, SupportedEngineeringFormat } from '@/lib/compliance/types';

const EXT_MAP: Record<string, SupportedEngineeringFormat> = {
  dwg: 'dwg',
  rvt: 'rvt',
  ifc: 'ifc',
  pdf: 'pdf',
  xlsx: 'xlsx',
  xls: 'xlsx',
  docx: 'docx',
  doc: 'docx',
};

const MIME_HINTS: Record<SupportedEngineeringFormat, string> = {
  dwg: 'application/acad',
  rvt: 'application/octet-stream',
  ifc: 'application/x-step',
  pdf: 'application/pdf',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  unknown: 'application/octet-stream',
};

export function detectEngineeringFormat(fileName: string): SupportedEngineeringFormat {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  return EXT_MAP[ext] || 'unknown';
}

/**
 * يحلّل بيانات وصفية للملفات الهندسية المدعومة.
 * الملفات الثنائية (DWG/RVT/IFC) تُسجَّل كبيانات وصفية فقط في هذه المرحلة —
 * دون تنفيذ كود غير موثوق من الملف (سلامة المنصة).
 */
export function parseEngineeringFileMeta(input: {
  fileName: string;
  sizeBytes?: number;
  rawText?: string | null;
}): ParsedEngineeringFile {
  const format = detectEngineeringFormat(input.fileName);
  const base = {
    fileName: input.fileName,
    format,
    mimeHint: MIME_HINTS[format],
    sizeBytes: input.sizeBytes,
    metadata: {} as Record<string, unknown>,
  };

  if (format === 'unknown') {
    return {
      ...base,
      parseable: false,
      message: 'صيغة غير مدعومة. الصيغ المدعومة: DWG, RVT, IFC, PDF, XLSX, DOCX',
    };
  }

  if (format === 'pdf' || format === 'xlsx' || format === 'docx') {
    const text = (input.rawText || '').slice(0, 4000);
    const keywords = ['SBC', 'NFPA', 'sprinkler', 'مرشات', 'إنذار', 'إشغال', 'مخرج'];
    const hits = keywords.filter((k) => text.toLowerCase().includes(k.toLowerCase()));
    return {
      ...base,
      parseable: true,
      message: `تم استلام ملف ${format.toUpperCase()} واستخراج إشارات نصية أولية.`,
      metadata: {
        keywordHits: hits,
        textSampleLength: text.length,
        mode: 'text-metadata',
      },
    };
  }

  // DWG / RVT / IFC — metadata only (safe)
  return {
    ...base,
    parseable: true,
    message: `تم تسجيل ملف ${format.toUpperCase()} للمعاينة. التحليل الهندسي الكامل يتم عبر عارض BIM/CAD أو خدمة خارجية آمنة.`,
    metadata: {
      mode: 'binary-metadata-only',
      viewerHint: format === 'ifc' ? 'ifc-js-or-external' : 'cad-viewer-container',
      safeParse: true,
    },
  };
}

export const SUPPORTED_ENGINEERING_EXTENSIONS = Object.keys(EXT_MAP);
