/**
 * Render trusted report HTML to a real A4 PDF File in the browser.
 *
 * The report is first rendered as one canvas to preserve Arabic/RTL. PDF slices
 * are then selected only at semantic DOM boundaries (cover, TOC, section, table
 * wrapper, figure and approval block); never at arbitrary pixel offsets. This keeps
 * all content while preventing table, caption and approval splits.
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
  host.setAttribute('data-pdf-capture', 'safe-a4');
  host.style.cssText = 'position:fixed;left:-10000px;top:0;width:794px;background:#fff;opacity:1;pointer-events:none;z-index:-1;';
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
  await waitForDocumentFonts(doc);

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

  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const pageCanvasHeight = (canvas.width * pageHeight) / pageWidth;
  const { safeBreaks, forcedBreaks } = collectSafeBreaks(body, canvas.width, pageCanvasHeight);

  let rendered = 0;
  let pageIndex = 0;
  while (rendered < canvas.height) {
    const next = chooseNextBreak(rendered, canvas.height, pageCanvasHeight, safeBreaks, forcedBreaks);
    const sliceHeight = Math.max(1, Math.min(next - rendered, canvas.height - rendered));
    const pageCanvas = document.createElement('canvas');
    pageCanvas.width = canvas.width;
    pageCanvas.height = Math.ceil(sliceHeight);
    const context = pageCanvas.getContext('2d');
    if (!context) break;
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
    context.drawImage(canvas, 0, rendered, canvas.width, sliceHeight, 0, 0, canvas.width, sliceHeight);

    if (pageIndex > 0) pdf.addPage();
    const sliceMm = (sliceHeight * pageWidth) / canvas.width;
    pdf.addImage(pageCanvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, pageWidth, sliceMm, undefined, 'FAST');

    rendered = next;
    pageIndex += 1;
    if (pageIndex > 120) throw new Error('تعذر إنهاء تقسيم صفحات PDF بأمان');
  }

  if (pageIndex === 0) {
    pdf.text('Empty report', 10, 10);
  }

  host.remove();
  const blob = pdf.output('blob');
  const safeName = fileName.toLowerCase().endsWith('.pdf') ? fileName : `${fileName}.pdf`;
  return new File([blob], safeName, { type: 'application/pdf' });
}

function collectSafeBreaks(body: HTMLElement, canvasWidth: number, pageCanvasHeight: number): {
  safeBreaks: number[];
  forcedBreaks: number[];
} {
  const bodyRect = body.getBoundingClientRect();
  const scale = canvasWidth / Math.max(1, bodyRect.width);
  const toCanvasPoint = (value: number) => Math.round((value - bodyRect.top) * scale);
  const safeSelectors = [
    '.official-section',
    '.official-table-wrap',
    '.official-figure',
    '.official-figure-row',
    '.official-approvals',
    '.official-signature-box',
    '.cover',
    '.toc-block',
    '.chapter',
    '.tbl',
    '.attachments-section',
    '.keep',
  ].join(',');
  const safeBreaks = Array.from(body.querySelectorAll<HTMLElement>(safeSelectors))
    .flatMap((element) => {
      const rect = element.getBoundingClientRect();
      const tableGuard = element.matches('.official-table-wrap, .tbl') ? Math.round(14 * scale) : 0;
      return [toCanvasPoint(rect.top) - tableGuard, toCanvasPoint(rect.bottom)];
    })
    .filter((point) => point > 0 && point < canvasWidth * 150);
  const forcedBreaks = Array.from(
    body.querySelectorAll<HTMLElement>('.official-cover, .official-toc-page, .official-approvals, .cover, .toc-block')
  )
    .map((element) => toCanvasPoint(element.getBoundingClientRect().bottom))
    .filter((point) => point > 0 && point < canvasWidth * 150);

  const normalize = (values: number[]) => Array.from(new Set(values))
    .sort((a, b) => a - b)
    .filter((point) => point >= Math.min(80, pageCanvasHeight * 0.1));
  return { safeBreaks: normalize(safeBreaks), forcedBreaks: normalize(forcedBreaks) };
}

function chooseNextBreak(
  start: number,
  total: number,
  pageHeight: number,
  safeBreaks: readonly number[],
  forcedBreaks: readonly number[]
): number {
  const remaining = total - start;
  if (remaining <= pageHeight) return total;

  const desired = start + pageHeight;
  const forced = forcedBreaks.find((point) => point > start && point <= desired * 1.02);
  if (forced) return forced;

  // Prefer the latest preceding semantic boundary even when it leaves white
  // space. A sparse page is valid; splitting a table row is not.
  const candidates = safeBreaks.filter((point) => point > start + 24 && point <= desired);
  if (candidates.length) return candidates[candidates.length - 1];

  // No protected boundary fits. Use the nearest following semantic boundary;
  // this avoids cutting a table/figure even where it makes a taller page.
  const following = safeBreaks.find((point) => point > desired);
  return following || Math.min(desired, total);
}

async function waitForDocumentFonts(doc: Document): Promise<void> {
  const fonts = doc.fonts;
  if (!fonts?.ready) {
    await new Promise((resolve) => setTimeout(resolve, 350));
    return;
  }

  try {
    await fonts.ready;
    await Promise.all([
      fonts.load('400 16px "Noto Naskh Arabic"'),
      fonts.load('700 16px "Noto Naskh Arabic"'),
      fonts.load('900 16px "Noto Naskh Arabic"'),
    ]);
  } catch {
    // A font-load rejection must not prevent a user from receiving the PDF;
    // the renderer still has the document's declared fallback stack.
  }

  await new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 80)));
}

function waitForIframeReady(iframe: HTMLIFrameElement): Promise<void> {
  return new Promise((resolve) => {
    const done = () => requestAnimationFrame(() => setTimeout(resolve, 80));
    if (iframe.contentDocument?.readyState === 'complete') {
      done();
      return;
    }
    iframe.addEventListener('load', done, { once: true });
    setTimeout(done, 400);
  });
}
