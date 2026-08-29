import { NextResponse } from 'next/server';
import { renderHtmlToPdfBuffer } from '@/lib/print/chromium-html-to-pdf.server';

export const runtime = 'nodejs';
export const maxDuration = 120;

type PdfRequestBody = {
  html?: string;
  fileName?: string;
};

export async function POST(request: Request) {
  let body: PdfRequestBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'طلب PDF غير صالح.' }, { status: 400 });
  }

  const html = body.html?.trim();
  if (!html) {
    return NextResponse.json({ error: 'HTML مطلوب لإنشاء PDF.' }, { status: 400 });
  }
  if (html.length > 12_000_000) {
    return NextResponse.json({ error: 'حجم HTML يتجاوز الحد المسموح.' }, { status: 413 });
  }

  try {
    const pdf = renderHtmlToPdfBuffer(html);
    const safeName = (body.fileName || 'technical-report').replace(/[^\w\u0600-\u06FF.-]+/g, '-');
    const fileName = safeName.toLowerCase().endsWith('.pdf') ? safeName : `${safeName}.pdf`;
    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(fileName)}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'تعذر إنشاء PDF.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
