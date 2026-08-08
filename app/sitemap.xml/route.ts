import { buildSitemapXml } from '@/lib/website/service';

/** Compatible with GitHub Pages `output: export`. */
export const dynamic = 'force-static';
export const revalidate = false;

export async function GET(request: Request) {
  const origin =
    process.env.NEXT_PUBLIC_SITE_URL ||
    (typeof request?.url === 'string' ? new URL(request.url).origin : null) ||
    'https://tawaqqa-salama.github.io';
  const xml = await buildSitemapXml(origin);
  return new Response(xml, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
}
