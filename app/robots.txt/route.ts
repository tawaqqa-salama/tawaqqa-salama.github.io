import { robotsTxt } from '@/lib/website/service';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const origin = new URL(request.url).origin;
  return new Response(robotsTxt(origin), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
