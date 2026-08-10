/**
 * Render a complete HTML document string to a fixed PDF File (A4 pages).
 * Uses html2canvas rasterization so Arabic/RTL layout from the print HTML is preserved.
 */

export async function htmlDocumentToPdfFile(
  html: string,
  fileName: string
): Promise<File> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    throw new Error('توليد PDF متاح من المتصفح فقط');
  }

  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import('html2canvas'),
    import('jspdf'),
  ]);

  const host = document.createElement('div');
  host.setAttribute('data-pdf-capture', '1');
  host.style.cssText =
    'position:fixed;left:-10000px;top:0;width:794px;background:#fff;opacity:1;pointer-events:none;z-index:-1;';
  document.body.appendChild(host);

  const iframe = document.createElement('iframe');
  iframe.setAttribute('title', 'pdf-capture');
  iframe.style.cssText = 'border:0;width:794px;height:1123px;background:#fff;';
  host.appendChild(iframe);

  const doc = iframe.contentDocument;
  if (!doc) {
    host.remove();
    throw new Error('تعذر تهيئة إطار توليد PDF');
  }

  doc.open();
  doc.write(html);
  doc.close();

  await waitForIframeReady(iframe);

  const body = doc.body;
  const canvas = await html2canvas(body, {
    scale: 1.5,
    useCORS: true,
    allowTaint: true,
    backgroundColor: '#ffffff',
    windowWidth: 794,
    scrollX: 0,
    scrollY: 0,
  });

  host.remove();

  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();

  const imgWidth = pageWidth;
  const imgHeight = (canvas.height * imgWidth) / canvas.width;
  const pageCanvasHeight = (canvas.width * pageHeight) / pageWidth;

  let rendered = 0;
  let pageIndex = 0;
  while (rendered < canvas.height) {
    const sliceHeight = Math.min(pageCanvasHeight, canvas.height - rendered);
    const pageCanvas = document.createElement('canvas');
    pageCanvas.width = canvas.width;
    pageCanvas.height = Math.max(1, Math.ceil(sliceHeight));
    const ctx = pageCanvas.getContext('2d');
    if (!ctx) break;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
    ctx.drawImage(
      canvas,
      0,
      rendered,
      canvas.width,
      sliceHeight,
      0,
      0,
      canvas.width,
      sliceHeight
    );

    const imgData = pageCanvas.toDataURL('image/jpeg', 0.92);
    if (pageIndex > 0) pdf.addPage();
    const sliceMm = (sliceHeight * imgWidth) / canvas.width;
    pdf.addImage(imgData, 'JPEG', 0, 0, imgWidth, sliceMm, undefined, 'FAST');

    rendered += sliceHeight;
    pageIndex += 1;
    // Safety against infinite loops on tiny remainders
    if (sliceHeight < 2) break;
    if (pageIndex > 80) break;
  }

  // Ensure at least one page even for empty content
  if (pageIndex === 0) {
    pdf.text('Empty report', 10, 10);
  }

  void imgHeight;

  const blob = pdf.output('blob');
  const safeName = fileName.toLowerCase().endsWith('.pdf') ? fileName : `${fileName}.pdf`;
  return new File([blob], safeName, { type: 'application/pdf' });
}

function waitForIframeReady(iframe: HTMLIFrameElement): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      // Allow fonts/layout to settle
      requestAnimationFrame(() => setTimeout(resolve, 80));
    };
    if (iframe.contentDocument?.readyState === 'complete') {
      done();
      return;
    }
    iframe.addEventListener('load', () => done(), { once: true });
    setTimeout(done, 400);
  });
}
