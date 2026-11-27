import { NextRequest, NextResponse } from 'next/server';
import { formatMongoConnectionError, getDb } from '@/lib/server/mongodb';
import { isCloudinaryConfigured } from '@/lib/server/cloudinary';
import { getSessionFromRequest } from '@/lib/server/security';
import { buildBootstrapPayload } from '@/lib/server/erp-repository';

export async function GET(req: NextRequest) {
  const session = getSessionFromRequest(req);

  try {
    const db = await getDb();
    const payload = await buildBootstrapPayload(db, session);
    return NextResponse.json(payload);
  } catch (err) {
    const friendlyError = formatMongoConnectionError(err);
    return NextResponse.json(
      {
        error: friendlyError,
        dbStatus: {
          mongoConfigured: true,
          mongoConnected: false,
          localDbActive: false,
          storageMode: 'mongodb',
          cloudinaryConfigured: isCloudinaryConfigured(),
          needsInitialSetup: false,
          syncVersion: 0,
          lastUpdatedAt: new Date(0).toISOString(),
          error: friendlyError,
        },
      },
      { status: 503 }
    );
  }
}
