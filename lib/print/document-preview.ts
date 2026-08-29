export type DocumentPreviewPayload = {
  title: string;
  html: string;
  fileName?: string;
  /** PDF is the default for generated documents; HTML remains an explicit legacy-compatibility opt-out. */
  downloadFormat?: 'html' | 'pdf';
  /** Vector Chromium print-to-PDF preserves Arabic shaping; canvas rasterization is legacy fallback. */
  pdfEngine?: 'chromium' | 'canvas';
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
  type IdleCapableWindow = Window & {
    requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
  };
  const idleWindow = window as IdleCapableWindow;
  if (typeof window !== 'undefined' && typeof idleWindow.requestIdleCallback === 'function') {
    idleWindow.requestIdleCallback(run, { timeout: 1200 });
  } else {
    setTimeout(run, 0);
  }
}

function triggerDownload(file: Blob, fileName: string) {
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * يفتح معاينة المستند دون HTML→PDF — HTML خام داخل iframe معزول.
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
    // Fallback إن لم تُحمّل واجهة المعاينة بعد مهلة قصيرة
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

/** يطبع مباشرةً من HTML المعتمد في iframe مخفي؛ لا يفتح معاينة التقرير. */
export function printDocumentHtml(payload: DocumentPreviewPayload) {
  trackPrint(payload);
  const runPrint = (doc: Document, win: Window, cleanup?: () => void) => {
    try {
      doc.title = ' ';
    } catch {
      /* ignore */
    }
    const trigger = () => {
      try {
        win.focus();
      } catch {
        /* ignore */
      }
      win.print();
      cleanup?.();
    };
    if (doc.fonts?.ready) {
      void doc.fonts.ready.then(() => setTimeout(trigger, 120));
    } else {
      setTimeout(trigger, 350);
    }
  };

  try {
    const blob = new Blob([payload.html], { type: 'text/html;charset=utf-8' });
    const blobUrl = URL.createObjectURL(blob);
    const iframe = document.createElement('iframe');
    iframe.setAttribute('aria-hidden', 'true');
    iframe.style.cssText =
      'position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;pointer-events:none;';
    document.body.appendChild(iframe);

    const cleanup = () => {
      try {
        URL.revokeObjectURL(blobUrl);
      } catch {
        /* ignore */
      }
      setTimeout(() => {
        try {
          document.body.removeChild(iframe);
        } catch {
          /* ignore */
        }
      }, 60_000);
    };

    iframe.onload = () => {
      const idoc = iframe.contentDocument;
      const iwin = iframe.contentWindow;
      if (!idoc || !iwin) {
        cleanup();
        return;
      }
      runPrint(idoc, iwin, cleanup);
    };
    iframe.src = blobUrl;
  } catch {
    // Fallback: popup window (may be blocked)
    const w = window.open('about:blank', '_blank', 'noopener,noreferrer,width=900,height=700');
    if (!w) {
      alert('تعذّر فتح الطباعة. جرّب زر «تحميل PDF» ثم اطبع الملف، أو اسمح بالنوافذ المنبثقة لهذا الموقع.');
      return;
    }
    w.document.open();
    w.document.write(payload.html);
    w.document.close();
    runPrint(w.document, w);
  }
}

export function downloadHtmlDocument(html: string, fileName: string) {
  void import('@/lib/activity/logger').then(({ logActivity }) =>
    logActivity({
      actionType: 'EXPORT',
      details: `تصدير مستند HTML: ${fileName}`,
      metadata: { fileName },
    })
  );
  const safeName = fileName.endsWith('.html') ? fileName : `${fileName}.html`;
  triggerDownload(new Blob([html], { type: 'text/html;charset=utf-8' }), safeName);
}

async function downloadPdfViaChromium(html: string, fileName: string): Promise<File> {
  const response = await fetch('/api/reports/html-to-pdf', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ html, fileName }),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(payload?.error || 'تعذر إنشاء PDF عبر مسار Chromium.');
  }
  const blob = await response.blob();
  const safeName = fileName.toLowerCase().endsWith('.pdf') ? fileName : `${fileName}.pdf`;
  return new File([blob], safeName, { type: 'application/pdf' });
}

/** يحوّل HTML التقرير إلى ملف PDF حقيقي ثم ينزله من المتصفح. */
export async function downloadPdfDocument(
  html: string,
  fileName: string,
  options?: Pick<DocumentPreviewPayload, 'pdfEngine'>
) {
  const pdf = options?.pdfEngine === 'chromium'
    ? await downloadPdfViaChromium(html, fileName)
    : await (async () => {
      const { htmlDocumentToPdfFile } = await import('@/lib/print/html-to-pdf');
      return htmlDocumentToPdfFile(html, fileName);
    })();
  void import('@/lib/activity/logger').then(({ logActivity }) =>
    logActivity({
      actionType: 'EXPORT',
      details: `تصدير مستند PDF: ${pdf.name}`,
      metadata: { fileName: pdf.name, mimeType: pdf.type, pdfEngine: options?.pdfEngine || 'canvas' },
    })
  );
  triggerDownload(pdf, pdf.name);
}
