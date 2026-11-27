import { NextRequest, NextResponse } from 'next/server';
import { getDb, isMongoConfigured } from '@/lib/server/mongodb';
import { getSessionFromRequest } from '@/lib/server/security';
import { getNeedsInitialAdminSetup } from '@/lib/server/erp-repository';

export async function GET(req: NextRequest) {
  const session = getSessionFromRequest(req);
  const mongoConfigured = isMongoConfigured();

  try {
    const db = await getDb();
    const needsInitialSetup = await getNeedsInitialAdminSetup(db);
    return NextResponse.json({
      mongoConfigured,
      localDbActive: !mongoConfigured,
      needsInitialSetup,
      session,
    });
  } catch {
    return NextResponse.json(
      {
        mongoConfigured,
        localDbActive: false,
        needsInitialSetup: false,
        session,
      },
      { status: 503 }
    );
  }
}
