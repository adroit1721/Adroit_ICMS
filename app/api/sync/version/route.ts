import { NextResponse } from 'next/server';
import { getDb, getSyncMeta, isMongoConfigured } from '@/lib/server/mongodb';

export async function GET() {
  const mongoConfigured = isMongoConfigured();
  try {
    const db = await getDb();
    const meta = await getSyncMeta(db);
    return NextResponse.json({
      mongoConfigured,
      localDbActive: !mongoConfigured,
      version: meta.version,
      updatedAt: meta.updatedAt,
    });
  } catch {
    return NextResponse.json(
      { mongoConfigured, localDbActive: false, version: -1, updatedAt: new Date(0).toISOString() },
      { status: 503 }
    );
  }
}
