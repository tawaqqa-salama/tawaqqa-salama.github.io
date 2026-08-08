import { NextResponse } from 'next/server';
import { listProjectShowcases, saveProjectShowcase } from '@/lib/website/service';

export const runtime = 'nodejs';

export async function GET() {
  const projects = await listProjectShowcases();
  return NextResponse.json({ ok: true, projects });
}

export async function POST(request: Request) {
  const body = await request.json();
  const project = await saveProjectShowcase(body);
  return NextResponse.json({ ok: true, project });
}
