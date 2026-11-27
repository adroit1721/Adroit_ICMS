import { NextRequest, NextResponse } from 'next/server';
import {
  COLLECTIONS,
  formatMongoConnectionError,
  getDb,
  getMongoDbName,
  getSyncMeta,
  isMongoConfigured,
} from '@/lib/server/mongodb';
import { isCloudinaryConfigured } from '@/lib/server/cloudinary';
import { getSessionFromRequest, isAdminSession } from '@/lib/server/security';
import { getNeedsInitialAdminSetup } from '@/lib/server/erp-repository';

export async function GET(req: NextRequest) {
  const mongoConfigured = isMongoConfigured();
  const cloudinaryConfigured = isCloudinaryConfigured();

  const startedAt = Date.now();
  try {
    const db = await getDb();
    await db.command({ ping: 1 });
    const latencyMs = Date.now() - startedAt;
    const [syncMeta, needsInitialSetup] = await Promise.all([
      getSyncMeta(db),
      getNeedsInitialAdminSetup(db),
    ]);

    const session = getSessionFromRequest(req);
    let counts: Record<string, number> | null = null;

    if (isAdminSession(session)) {
      const [
        classes,
        subjects,
        routines,
        teachers,
        students,
        admissions,
        exams,
        marks,
        publishedResults,
        invoices,
        notices,
        events,
        adminUsers,
      ] = await Promise.all([
        db.collection(COLLECTIONS.ACADEMIC_CLASSES).countDocuments(),
        db.collection(COLLECTIONS.SUBJECTS).countDocuments(),
        db.collection(COLLECTIONS.CLASS_ROUTINES).countDocuments(),
        db.collection(COLLECTIONS.TEACHERS).countDocuments(),
        db.collection(COLLECTIONS.STUDENTS).countDocuments(),
        db.collection(COLLECTIONS.ADMISSIONS).countDocuments(),
        db.collection(COLLECTIONS.EXAMS).countDocuments(),
        db.collection(COLLECTIONS.MARK_ENTRIES).countDocuments(),
        db.collection(COLLECTIONS.PUBLISHED_RESULTS).countDocuments(),
        db.collection(COLLECTIONS.INVOICES).countDocuments(),
        db.collection(COLLECTIONS.NOTICES).countDocuments(),
        db.collection(COLLECTIONS.EVENTS).countDocuments(),
        db.collection(COLLECTIONS.ADMIN_USERS).countDocuments(),
      ]);

      counts = {
        classes,
        subjects,
        routines,
        teachers,
        students,
        admissions,
        exams,
        marks,
        publishedResults,
        invoices,
        notices,
        events,
        adminUsers,
      };
    }

    return NextResponse.json({
      mongoConfigured,
      mongoConnected: mongoConfigured,
      localDbActive: !mongoConfigured,
      storageMode: mongoConfigured ? 'mongodb' : 'local',
      cloudinaryConfigured,
      needsInitialSetup,
      dbName: getMongoDbName(),
      latencyMs,
      syncVersion: syncMeta.version,
      lastUpdatedAt: syncMeta.updatedAt,
      counts,
    });
  } catch (err) {
    return NextResponse.json(
      {
        mongoConfigured,
        mongoConnected: false,
        localDbActive: false,
        storageMode: mongoConfigured ? 'mongodb' : 'local',
        cloudinaryConfigured,
        needsInitialSetup: false,
        dbName: getMongoDbName(),
        latencyMs: Date.now() - startedAt,
        error: formatMongoConnectionError(err),
      },
      { status: 503 }
    );
  }
}
