import { assertPdfMagic, decodeBase64Payload, parsePageNumber, sniffImageExtension } from './decode.js';
import { rasterizePdfPageToPng, type PdfRasterDeps } from './pdf-raster.js';
import { runTesseractAraEng, type TesseractDeps } from './tesseract.js';
import { OcrHttpError, type OcrRequestBody, type OcrSuccessResponse } from './types.js';

export type ProcessOcrDeps = {
  pdf?: PdfRasterDeps;
  tesseract?: TesseractDeps;
};

export async function processOcrRequest(
  body: OcrRequestBody,
  deps: ProcessOcrDeps = {}
): Promise<OcrSuccessResponse> {
  const pageNumber = parsePageNumber(body.pageNumber);

  const hasImage = typeof body.imageBase64 === 'string' && body.imageBase64.trim().length > 0;
  const hasPdf = typeof body.pdfBase64 === 'string' && body.pdfBase64.trim().length > 0;

  if (!hasImage && !hasPdf) {
    throw new OcrHttpError(400, 'missing_image_or_pdf');
  }

  let imageBytes: Buffer;
  let extension = 'png';

  if (hasImage) {
    imageBytes = decodeBase64Payload(body.imageBase64, 'image');
    extension = sniffImageExtension(
      imageBytes,
      typeof body.imageMimeType === 'string' ? body.imageMimeType : null
    );
  } else {
    const pdfBytes = decodeBase64Payload(body.pdfBase64, 'pdf');
    assertPdfMagic(pdfBytes);
    const raster = await rasterizePdfPageToPng(pdfBytes, pageNumber, deps.pdf);
    imageBytes = raster.pngBytes;
    extension = 'png';
  }

  const text = await runTesseractAraEng(imageBytes, extension, deps.tesseract);
  if (!text) {
    throw new OcrHttpError(422, 'ocr_empty_text');
  }

  return {
    text,
    engine: 'tesseract',
    languages: ['ara', 'eng'],
    pageNumber,
  };
}

export function detectInputType(body: OcrRequestBody): 'image' | 'pdf' | 'none' {
  const hasImage = typeof body.imageBase64 === 'string' && body.imageBase64.trim().length > 0;
  if (hasImage) return 'image';
  const hasPdf = typeof body.pdfBase64 === 'string' && body.pdfBase64.trim().length > 0;
  if (hasPdf) return 'pdf';
  return 'none';
}
