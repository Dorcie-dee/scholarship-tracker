import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/server/lib/db';

export const dynamic = 'force-dynamic';

/** Readiness — a real ping against the DB; 503 on failure, no driver-detail leak. */
export async function GET() {
  try {
    const mongoose = await connectToDatabase();
    await mongoose.connection.db?.admin().ping();
    return NextResponse.json({ status: 'ok', timestamp: new Date().toISOString() });
  } catch {
    return NextResponse.json(
      { status: 'error', timestamp: new Date().toISOString() },
      { status: 503 },
    );
  }
}
