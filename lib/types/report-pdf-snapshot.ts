/** Fixed PDF snapshot of a visit / supervision report — binary lives in Storage. */

export type ReportPdfKind = 'field_visit' | 'supervision';

export type ReportPdfSnapshot = {
  id: string;
  kind: ReportPdfKind;
  /** Set for field visit snapshots */
  visit_number?: number | null;
  report_date?: string | null;
  title_ar: string;
  fileName: string;
  sizeBytes: number;
  mimeType: 'application/pdf';
  storagePath?: string | null;
  storageBucket?: string | null;
  /** Tiny local fallback only — never embed large PDFs in JSONB */
  dataUrl?: string | null;
  created_at: string;
};

export const EMPTY_REPORT_PDF_ARCHIVE: ReportPdfSnapshot[] = [];
