/**
 * Turn a scanned building-permit PDF into an image Blob for client OCR.
 * 1) Fast path: extract embedded JPEG/PNG stream from simple image PDFs
 * 2) Browser path: render page 1 with pdf.js → canvas → JPEG
 */

function isPdfFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return file.type === 'application/pdf' || name.endsWith('.pdf');
}

function findPdfImageStreams(raw: string): Array<{ dict: string; data: Uint8Array }> {
  const out: Array<{ dict: string; data: Uint8Array }> = [];
  const re = /(\d+)\s+0\s+obj[\s\S]*?<<([\s\S]*?)>>[\s\S]*?stream\r?\n([\s\S]*?)\r?\nendstream/g;
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
    // Node / older browsers — dynamic zlib when available
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
 * single-page scanned permit (common Balady export: FlateDecode + DCTDecode).
 */
export async function extractEmbeddedPdfImage(file: File): Promise<Blob | null> {
  if (!isPdfFile(file)) return null;
  const buf = new Uint8Array(await file.arrayBuffer());
  let raw = '';
  const chunk = 0x8000;
  for (let i = 0; i < buf.length; i += chunk) {
    raw += String.fromCharCode(...buf.subarray(i, i + chunk));
  }

  const images = findPdfImageStreams(raw);
  if (!images.length) return null;

  // Prefer the largest stream (the scanned page)
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

  // JPEG
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    return new Blob([bytes as BlobPart], { type: 'image/jpeg' });
  }
  // PNG
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
    // Use CDN worker compatible with the installed pdfjs major
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
