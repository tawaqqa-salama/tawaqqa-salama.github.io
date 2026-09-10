export type OcrRequestBody = {
  pageNumber?: unknown;
  languages?: unknown;
  languageHints?: unknown;
  digits?: unknown;
  imageBase64?: unknown;
  imageMimeType?: unknown;
  pdfBase64?: unknown;
};

export type OcrSuccessResponse = {
  text: string;
  engine: 'tesseract';
  languages: ['ara', 'eng'];
  pageNumber: number;
};

export type OcrErrorResponse = {
  error: string;
};

export type HealthResponse = {
  ok: true;
  service: 'saudi-code-ocr';
  ocrEngine: 'tesseract';
  languages: ['ara', 'eng'];
};

export class OcrHttpError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message?: string) {
    super(message || code);
    this.status = status;
    this.code = code;
  }
}
