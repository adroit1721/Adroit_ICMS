import { Db, MongoClient } from 'mongodb';
import { getLocalDb } from './local-db';

export const COLLECTIONS = {
  SETTINGS: 'institute_settings',
  ADMIN_USERS: 'admin_users',
  ACADEMIC_CLASSES: 'academic_classes',
  SUBJECTS: 'subjects',
  CLASS_ROUTINES: 'class_routines',
  TEACHERS: 'teachers',
  STUDENTS: 'students',
  ADMISSIONS: 'admissions',
  EXAMS: 'exams',
  MARK_ENTRIES: 'mark_entries',
  PUBLISHED_RESULTS: 'published_results',
  INVOICES: 'invoices',
  NOTICES: 'notices',
  EVENTS: 'events',
  SMS_LOGS: 'sms_logs',
  SYNC_META: 'sync_meta',
} as const;

export type CollectionKey = (typeof COLLECTIONS)[keyof typeof COLLECTIONS];

declare global {
  var __mongoClientPromise: Promise<MongoClient> | undefined;
  var __mongoIndexesPromise: Promise<void> | undefined;
}

export function isMongoConfigured(): boolean {
  return Boolean(process.env.MONGODB_URI?.trim());
}

export function getStorageMode(): 'mongodb' | 'local' {
  return isMongoConfigured() ? 'mongodb' : 'local';
}

export function getMongoDbName(): string {
  const configured = process.env.MONGODB_DB_NAME?.trim();
  if (configured) return configured;

  const uri = process.env.MONGODB_URI?.trim() || '';
  const match = uri.match(/mongodb(?:\+srv)?:\/\/[^/]+\/([^?]+)/i);
  if (match && match[1]) {
    return decodeURIComponent(match[1]);
  }
  return isMongoConfigured() ? 'school_erp_prod' : 'local_workspace_db';
}

export function formatMongoConnectionError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err || 'MongoDB connection failed');
  const lower = raw.toLowerCase();

  if (
    lower.includes('tlsv1 alert internal error') ||
    lower.includes('ssl alert number 80') ||
    lower.includes('mongoserverselectionerror') ||
    lower.includes('timed out') ||
    lower.includes('econnrefused')
  ) {
    return 'MongoDB Atlas rejected or timed out the TLS connection (SSL Alert 80). In MongoDB Atlas, go to Security → Network Access → Add IP Address → "Allow Access from Anywhere" (0.0.0.0/0) so dynamic cloud servers (AI Studio / Vercel) can connect.';
  }

  if (lower.includes('authentication failed') || lower.includes('bad auth')) {
    return 'MongoDB Atlas authentication failed. Check the database username and password in MONGODB_URI (URL-encode special characters like @, #, %, :).';
  }

  if (lower.includes('enotfound') || lower.includes('querysrv')) {
    return 'MongoDB Atlas cluster hostname could not be resolved. Verify the cluster address in MONGODB_URI.';
  }

  return raw;
}

async function getMongoClient(): Promise<MongoClient> {
  const uri = process.env.MONGODB_URI?.trim();
  if (!uri) {
    throw new Error('MONGODB_URI environment variable is not configured.');
  }

  if (!globalThis.__mongoClientPromise) {
    const client = new MongoClient(uri, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 4500,
      connectTimeoutMS: 4500,
    });
    globalThis.__mongoClientPromise = client.connect().catch((err) => {
      globalThis.__mongoClientPromise = undefined;
      throw err;
    });
  }

  return globalThis.__mongoClientPromise;
}

async function ensureIndexes(db: Db): Promise<void> {
  if (!globalThis.__mongoIndexesPromise) {
    globalThis.__mongoIndexesPromise = (async () => {
      await Promise.all([
        db.collection(COLLECTIONS.ADMIN_USERS).createIndex({ username: 1 }, { unique: true }),
        db.collection(COLLECTIONS.ADMIN_USERS).createIndex({ id: 1 }, { unique: true }),
        db.collection(COLLECTIONS.ACADEMIC_CLASSES).createIndex({ id: 1 }, { unique: true }),
        db.collection(COLLECTIONS.ACADEMIC_CLASSES).createIndex({ name: 1 }, { unique: true }),
        db.collection(COLLECTIONS.SUBJECTS).createIndex({ id: 1 }, { unique: true }),
        db.collection(COLLECTIONS.SUBJECTS).createIndex({ classLevel: 1, code: 1 }),
        db.collection(COLLECTIONS.CLASS_ROUTINES).createIndex({ id: 1 }, { unique: true }),
        db.collection(COLLECTIONS.CLASS_ROUTINES).createIndex({ className: 1, shift: 1, sectionName: 1, day: 1 }),
        db.collection(COLLECTIONS.TEACHERS).createIndex({ id: 1 }, { unique: true }),
        db.collection(COLLECTIONS.TEACHERS).createIndex({ email: 1 }, { sparse: true }),
        db.collection(COLLECTIONS.STUDENTS).createIndex({ id: 1 }, { unique: true }),
        db.collection(COLLECTIONS.STUDENTS).createIndex({ systemId: 1 }, { unique: true }),
        db.collection(COLLECTIONS.STUDENTS).createIndex({ registrationNumber: 1 }, { sparse: true }),
        db.collection(COLLECTIONS.STUDENTS).createIndex({ status: 1, className: 1, sectionName: 1, rollNumber: 1 }),
        db.collection(COLLECTIONS.ADMISSIONS).createIndex({ id: 1 }, { unique: true }),
        db.collection(COLLECTIONS.ADMISSIONS).createIndex({ applicationCode: 1 }, { unique: true }),
        db.collection(COLLECTIONS.EXAMS).createIndex({ id: 1 }, { unique: true }),
        db.collection(COLLECTIONS.MARK_ENTRIES).createIndex({ id: 1 }, { unique: true }),
        db
          .collection(COLLECTIONS.MARK_ENTRIES)
          .createIndex({ examId: 1, studentId: 1, subjectId: 1 }, { unique: true }),
        db
          .collection(COLLECTIONS.PUBLISHED_RESULTS)
          .createIndex({ examId: 1, studentId: 1 }, { unique: true }),
        db.collection(COLLECTIONS.PUBLISHED_RESULTS).createIndex({ systemId: 1 }),
        db.collection(COLLECTIONS.INVOICES).createIndex({ id: 1 }, { unique: true }),
        db.collection(COLLECTIONS.INVOICES).createIndex({ invoiceNo: 1 }, { unique: true }),
        db.collection(COLLECTIONS.NOTICES).createIndex({ id: 1 }, { unique: true }),
        db.collection(COLLECTIONS.EVENTS).createIndex({ id: 1 }, { unique: true }),
        db.collection(COLLECTIONS.SMS_LOGS).createIndex({ id: 1 }, { unique: true }),
      ]);
    })().catch((err) => {
      globalThis.__mongoIndexesPromise = undefined;
      console.error('MongoDB index setup error:', err);
    });
  }
  await globalThis.__mongoIndexesPromise;
}

export async function getDb(): Promise<Db> {
  if (!isMongoConfigured()) {
    return getLocalDb();
  }
  const client = await getMongoClient();
  const db = client.db(getMongoDbName());
  await ensureIndexes(db);
  return db;
}

export async function bumpSyncVersion(db: Db, area: string): Promise<number> {
  const now = new Date().toISOString();
  const res = await db.collection<{ _id: string; version: number; updatedAt: string; areas: Record<string, string> }>(
    COLLECTIONS.SYNC_META
  ).findOneAndUpdate(
    { _id: 'global' },
    {
      $inc: { version: 1 },
      $set: {
        updatedAt: now,
        [`areas.${area}`]: now,
      },
    },
    { upsert: true, returnDocument: 'after' }
  );
  return res?.version ?? 1;
}

export async function getSyncMeta(db: Db): Promise<{ version: number; updatedAt: string }> {
  const doc = await db
    .collection<{ _id: string; version?: number; updatedAt?: string }>(COLLECTIONS.SYNC_META)
    .findOne({ _id: 'global' });
  return {
    version: doc?.version ?? 0,
    updatedAt: doc?.updatedAt ?? new Date(0).toISOString(),
  };
}
