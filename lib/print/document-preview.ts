export type DocumentPreviewPayload = {
  title: string;
  html: string;
  fileName?: string;
  /** Reports that must download as a real PDF rather than the printable HTML source. */
  downloadFormat?: 'html' | 'pdf';
};

type Listener = (payload: DocumentPreviewPayload | null) => void;
type IdleCallbackWindow = Window & {
  requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
};

const PREVIEW_EVENT = 'tawaqqa:document-preview';

let listener: Listener | null = null;
let pending: DocumentPreviewPayload | null = null;

export function registerDocumentPreviewListener(next: Listener) {
  listener = next;
  if (pending) {
    next(pending);
    pending = null;
  }
  return () => {
    if (listener === next) listener = null;
  };
}

/** يطلب من AppShell تحميل ورقة المعاينة عند أول طباعة فقط */
export function requestDocumentPreviewMount() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(PREVIEW_EVENT));
}

export function onDocumentPreviewMountRequest(handler: () => void) {
  if (typeof window === 'undefined') return () => undefined;
  const wrapped = () => handler();
  window.addEventListener(PREVIEW_EVENT, wrapped);
  return () => window.removeEventListener(PREVIEW_EVENT, wrapped);
}

function trackPrint(payload: DocumentPreviewPayload) {
  // مؤجّل حتى لا يزاحم بناء HTML الثقيل على الخيط الرئيسي
  const run = () => {
    void import('@/lib/activity/logger').then(({ logActivity }) =>
      logActivity({
        actionType: 'PRINT',
        details: `طباعة / معاينة مستند: ${payload.title}`,
        metadata: { fileName: payload.fileName || null, title: payload.title },
      })
    );
  };
  const idleWindow = window as IdleCallbackWindow;
  if (typeof window !== 'undefined' && typeof idleWindow.requestIdleCallback === 'function') {
    idleWindow.requestIdleCallback(run, { timeout: 1200 });
  } else {
    setTimeout(run, 0);
  }
}

/**
 * يفتح معاينة الطباعة دون html2canvas — HTML خام داخل iframe معزول.
 * يبني القالب في مهمة جزئية لتقليل تجمّد الواجهة.
 */
export function openDocumentPreview(payload: DocumentPreviewPayload) {
  trackPrint(payload);
  requestDocumentPreviewMount();

  const deliver = () => {
    if (listener) {
      listener(payload);
      return;
    }
    pending = payload;
    // Fallback إن لم تُحمَّل واجهة المعاينة بعد مهلة قصيرة
    setTimeout(() => {
      if (listener) {
        if (pending === payload) {
          listener(payload);
          pending = null;
        }
        return;
      }
      if (pending !== payload) return;
      pending = null;
      // Last-resort preview without popup: blob URL avoids stamping the project page URL into print chrome
      try {
        const blob = new Blob([payload.html], { type: 'text/html;charset=utf-8' });
        const blobUrl = URL.createObjectURL(blob);
        const iframe = document.createElement('iframe');
        iframe.style.cssText =
          'position:fixed;inset:0;width:100%;height:100%;border:0;z-index:99999;background:#fff';
        document.body.appendChild(iframe);
        iframe.onload = () => {
          const idoc = iframe.contentDocument;
          if (!idoc) return;
          const closeBtn = idoc.createElement('button');
          closeBtn.textContent = 'إغلاق';
          closeBtn.style.cssText =
            'position:fixed;top:12px;left:12px;z-index:10;padding:8px 14px;font:14px sans-serif;cursor:pointer';
          closeBtn.onclick = () => {
            try {
              URL.revokeObjectURL(blobUrl);
              document.body.removeChild(iframe);
            } catch {
              /* ignore */
            }
          };
          idoc.body.appendChild(closeBtn);
        };
        iframe.src = blobUrl;
      } catch {
        /* ignore */
      }
    }, 80);
  };

  // سلّم الحمولة بعد إطار رسم واحد حتى تبقى نقرات الواجهة سريعة
  if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
    window.requestAnimationFrame(() => {
      setTimeout(deliver, 0);
    });
  } else {
    setTimeout(deliver, 0);
  }
}

export function closeDocumentPreview() {
  listener?.(null);
}

function trackExport(fileName: string) {
  void import('@/lib/activity/logger').then(({ logActivity }) =>
    logActivity({
      actionType: 'EXPORT',
      details: `تصدير مستند: ${fileName}`,
      metadata: { fileName },
    })
  );
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function downloadHtmlDocument(html: string, fileName: string) {
  const safeName = fileName.endsWith('.html') ? fileName : `${fileName}.html`;
  trackExport(safeName);
  downloadBlob(new Blob([html], { type: 'text/html;charset=utf-8' }), safeName);
}

/** Generates and downloads a real PDF in the browser for the explicitly opted-in report. */
export async function downloadPdfDocument(html: string, fileName: string) {
  const { htmlDocumentToPdfFile } = await import('@/lib/print/html-to-pdf');
  const pdf = await htmlDocumentToPdfFile(html, fileName);
  trackExport(pdf.name);
  downloadBlob(pdf, pdf.name);
}
