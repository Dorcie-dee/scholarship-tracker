import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/** Liveness — process is up, no DB dependency. */
export async function GET() {
  return NextResponse.json({ status: 'ok', timestamp: new Date().toISOString() });
}
