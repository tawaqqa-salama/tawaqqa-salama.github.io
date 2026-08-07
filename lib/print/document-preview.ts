export type DocumentPreviewPayload = {
  title: string;
  html: string;
  fileName?: string;
};

type Listener = (payload: DocumentPreviewPayload | null) => void;

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
  if (typeof window !== 'undefined' && typeof (window as Window & { requestIdleCallback?: Function }).requestIdleCallback === 'function') {
    (window as Window & { requestIdleCallback: (cb: () => void, opts?: { timeout: number }) => number }).requestIdleCallback(
      run,
      { timeout: 1200 }
    );
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
      // Last-resort preview without popup: write into a temporary iframe and print
      try {
        const iframe = document.createElement('iframe');
        iframe.style.cssText =
          'position:fixed;inset:0;width:100%;height:100%;border:0;z-index:99999;background:#fff';
        document.body.appendChild(iframe);
        const idoc = iframe.contentDocument;
        const iwin = iframe.contentWindow;
        if (!idoc || !iwin) {
          document.body.removeChild(iframe);
          return;
        }
        idoc.open();
        idoc.write(payload.html);
        idoc.close();
        const closeBtn = idoc.createElement('button');
        closeBtn.textContent = 'إغلاق';
        closeBtn.style.cssText =
          'position:fixed;top:12px;left:12px;z-index:10;padding:8px 14px;font:14px sans-serif;cursor:pointer';
        closeBtn.onclick = () => {
          try {
            document.body.removeChild(iframe);
          } catch {
            /* ignore */
          }
        };
        idoc.body.appendChild(closeBtn);
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

export function downloadHtmlDocument(html: string, fileName: string) {
  void import('@/lib/activity/logger').then(({ logActivity }) =>
    logActivity({
      actionType: 'EXPORT',
      details: `تصدير مستند: ${fileName}`,
      metadata: { fileName },
    })
  );
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName.endsWith('.html') ? fileName : `${fileName}.html`;
  link.click();
  URL.revokeObjectURL(url);
}
