import { NextRequest, NextResponse } from 'next/server';
import { COLLECTIONS, bumpSyncVersion, getDb } from '@/lib/server/mongodb';
import {
  assertTrustedOrigin,
  encryptAdminPin,
  getSessionFromRequest,
  hashPassword,
  sanitizeMongoInput,
  verifyPassword,
} from '@/lib/server/security';
import { StoredAdminUser, StoredStudent, StoredTeacher } from '@/lib/server/erp-repository';

export async function POST(req: NextRequest) {
  if (!assertTrustedOrigin(req)) {
    return NextResponse.json({ error: 'Untrusted request origin' }, { status: 403 });
  }
  const session = getSessionFromRequest(req);
  if (!session) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }

  try {
    const raw = await req.json();
    const body = sanitizeMongoInput(raw) as {
      currentPassword?: unknown;
      newPassword?: unknown;
    };
    const currentPassword = typeof body.currentPassword === 'string' ? body.currentPassword : '';
    const newPassword = typeof body.newPassword === 'string' ? body.newPassword : '';

    if (!currentPassword || newPassword.length < 6) {
      return NextResponse.json(
        { error: 'Current password and a new password (min 6 characters) are required.' },
        { status: 400 }
      );
    }

    const db = await getDb();
    const now = new Date().toISOString();

    if (session.portal === 'student') {
      const col = db.collection<StoredStudent>(COLLECTIONS.STUDENTS);
      const stu = await col.findOne({ id: session.userId });
      if (!stu || !verifyPassword(currentPassword, stu.passwordHash || stu.password)) {
        return NextResponse.json({ error: 'Current password does not match.' }, { status: 401 });
      }
      await col.updateOne(
        { id: stu.id },
        {
          $set: {
            passwordHash: hashPassword(newPassword),
            password: '',
            systemPinEnc: /^\d{6}$/.test(newPassword.trim()) ? encryptAdminPin(newPassword.trim()) : '',
            updatedAt: now,
          },
        }
      );
      await bumpSyncVersion(db, 'students');
      return NextResponse.json({ ok: true });
    }

    if (session.portal === 'teacher') {
      const col = db.collection<StoredTeacher>(COLLECTIONS.TEACHERS);
      const teacher = await col.findOne({ id: session.userId });
      if (!teacher || !verifyPassword(currentPassword, teacher.passwordHash || teacher.password)) {
        return NextResponse.json({ error: 'Current password does not match.' }, { status: 401 });
      }
      await col.updateOne(
        { id: teacher.id },
        {
          $set: {
            passwordHash: hashPassword(newPassword),
            password: '',
            systemPinEnc: /^\d{6}$/.test(newPassword.trim()) ? encryptAdminPin(newPassword.trim()) : '',
            updatedAt: now,
          },
        }
      );
      await bumpSyncVersion(db, 'teachers');
      return NextResponse.json({ ok: true });
    }

    const adminCol = db.collection<StoredAdminUser>(COLLECTIONS.ADMIN_USERS);
    const adm = await adminCol.findOne({ id: session.userId });
    if (!adm || !verifyPassword(currentPassword, adm.passwordHash || adm.password)) {
      return NextResponse.json({ error: 'Current password does not match.' }, { status: 401 });
    }
    await adminCol.updateOne(
      { id: adm.id },
      { $set: { passwordHash: hashPassword(newPassword), password: '', updatedAt: now } }
    );
    await bumpSyncVersion(db, 'admin_users');
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Password change failed' },
      { status: 500 }
    );
  }
}
