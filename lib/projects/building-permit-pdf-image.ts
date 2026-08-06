/**
 * Turn a scanned building-permit PDF into an image Blob for client OCR.
 * 1) Fast path: find embedded JPEG/PNG by magic bytes (most reliable)
 * 2) Parse image XObject streams (DCTDecode / Flate+DCT)
 * 3) Browser path: render page 1 with pdf.js → canvas → JPEG
 */

function isPdfFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return file.type === 'application/pdf' || name.endsWith('.pdf');
}

/** Largest JPEG (SOI…EOI) embedded in the PDF binary — works for plain DCTDecode scans. */
export function findLargestJpegInPdf(buf: Uint8Array): Uint8Array | null {
  let best: Uint8Array | null = null;
  for (let i = 0; i < buf.length - 2; i += 1) {
    if (buf[i] !== 0xff || buf[i + 1] !== 0xd8) continue;
    // Prefer JFIF/Adobe APP markers right after SOI (real images, not coincidences)
    const b2 = buf[i + 2];
    if (b2 !== 0xff) continue;
    let end = -1;
    for (let j = i + 3; j < buf.length - 1; j += 1) {
      if (buf[j] === 0xff && buf[j + 1] === 0xd9) {
        end = j + 2;
        break;
      }
    }
    if (end < 0) continue;
    const slice = buf.subarray(i, end);
    // Scanned A4 permits are typically > 50KB
    if (slice.length < 20_000) continue;
    if (!best || slice.length > best.length) best = slice;
    i = end - 1;
  }
  return best;
}

function findPdfImageStreams(raw: string): Array<{ dict: string; data: Uint8Array }> {
  const out: Array<{ dict: string; data: Uint8Array }> = [];
  // Bind dict to the same object: do not allow another "n 0 obj" between dict and stream
  const re =
    /(\d+)\s+0\s+obj\s*<<([\s\S]*?)>>\s*stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw))) {
    const dict = m[2];
    if (!/\/Subtype\s*\/Image/.test(dict)) continue;
    const bytes = new Uint8Array(m[3].length);
    for (let i = 0; i < m[3].length; i += 1) bytes[i] = m[3].charCodeAt(i) & 0xff;
    out.push({ dict, data: bytes });
  }
  return out;
}

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === 'undefined') {
    try {
      const zlib = await import('zlib');
      return zlib.inflateSync(Buffer.from(data));
    } catch {
      return data;
    }
  }
  const ds = new DecompressionStream('deflate');
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(ds);
  const ab = await new Response(stream).arrayBuffer();
  return new Uint8Array(ab);
}

/**
 * Extract the largest embedded raster image from a PDF when it is a
 * single-page scanned permit (Balady: DCTDecode JPEG, or Flate+DCT).
 */
export async function extractEmbeddedPdfImage(file: File): Promise<Blob | null> {
  if (!isPdfFile(file)) return null;
  const buf = new Uint8Array(await file.arrayBuffer());

  // 1) Magic-byte JPEG (handles DCTDecode-only PDFs where object regex can miss)
  const magicJpeg = findLargestJpegInPdf(buf);
  if (magicJpeg) {
    return new Blob([magicJpeg.slice() as BlobPart], { type: 'image/jpeg' });
  }

  let raw = '';
  const chunk = 0x8000;
  for (let i = 0; i < buf.length; i += chunk) {
    raw += String.fromCharCode(...buf.subarray(i, i + chunk));
  }

  const images = findPdfImageStreams(raw);
  if (!images.length) return null;

  images.sort((a, b) => b.data.length - a.data.length);
  const img = images[0];
  const filter = img.dict.match(/\/Filter\s*(\/[A-Za-z0-9]+|\[[^\]]+\])/)?.[1] || '';

  let bytes = img.data;
  if (/FlateDecode/.test(filter)) {
    try {
      bytes = await inflateRaw(bytes);
    } catch {
      return null;
    }
  }

  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    return new Blob([bytes as BlobPart], { type: 'image/jpeg' });
  }
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return new Blob([bytes as BlobPart], { type: 'image/png' });
  }

  return null;
}

/** Render first PDF page to JPEG via pdf.js (browser only). */
export async function renderPdfFirstPageToJpeg(
  file: File,
  onProgress?: (message: string) => void
): Promise<Blob | null> {
  if (typeof document === 'undefined') return null;
  try {
    onProgress?.('جاري تحويل صفحة الرخصة إلى صورة...');
    const pdfjs = await import('pdfjs-dist');
    const version = (pdfjs as { version?: string }).version || '4.10.38';
    pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${version}/build/pdf.worker.min.mjs`;

    const data = new Uint8Array(await file.arrayBuffer());
    const doc = await pdfjs.getDocument({ data }).promise;
    const page = await doc.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const scale = Math.min(2, 2000 / base.width);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport }).promise;
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.92)
    );
    return blob;
  } catch {
    return null;
  }
}

export async function pdfFileToOcrImage(
  file: File,
  onProgress?: (message: string) => void
): Promise<Blob | null> {
  if (!isPdfFile(file)) return null;
  onProgress?.('جاري استخراج صورة الرخصة من ملف PDF...');
  const embedded = await extractEmbeddedPdfImage(file);
  if (embedded) return embedded;
  return renderPdfFirstPageToJpeg(file, onProgress);
}

export function isPdfPermitFile(file: File): boolean {
  return isPdfFile(file);
}
