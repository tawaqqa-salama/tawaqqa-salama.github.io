import { robotsTxt } from '@/lib/website/service';

/** Compatible with GitHub Pages `output: export`. */
export const dynamic = 'force-static';
export const revalidate = false;

export async function GET(request: Request) {
  const origin =
    process.env.NEXT_PUBLIC_SITE_URL ||
    (typeof request?.url === 'string' ? new URL(request.url).origin : null) ||
    'https://tawaqqa-salama.github.io';
  return new Response(robotsTxt(origin), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
