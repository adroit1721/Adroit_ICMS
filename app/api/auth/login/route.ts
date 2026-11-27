import { NextRequest, NextResponse } from 'next/server';
import { COLLECTIONS, getDb } from '@/lib/server/mongodb';
import {
  assertTrustedOrigin,
  attachSessionCookie,
  hashPassword,
  sanitizeMongoInput,
  signSessionToken,
  verifyPassword,
} from '@/lib/server/security';
import { StoredAdminUser, StoredStudent, StoredTeacher } from '@/lib/server/erp-repository';

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export async function POST(req: NextRequest) {
  if (!assertTrustedOrigin(req)) {
    return NextResponse.json({ error: 'Untrusted request origin' }, { status: 403 });
  }

  try {
    const raw = await req.json();
    const body = sanitizeMongoInput(raw) as {
      portal?: unknown;
      username?: unknown;
      email?: unknown;
      identifier?: unknown;
      className?: unknown;
      password?: unknown;
    };

    const portal = body.portal === 'teacher' || body.portal === 'student' ? body.portal : 'admin';
    const password = typeof body.password === 'string' ? body.password : '';
    if (!password) {
      return NextResponse.json({ error: 'Password is required.' }, { status: 400 });
    }

    const db = await getDb();

    if (portal === 'admin') {
      const username = typeof body.username === 'string' ? body.username.trim() : '';
      if (!username) {
        return NextResponse.json({ error: 'Username is required.' }, { status: 400 });
      }

      const adminCol = db.collection<StoredAdminUser>(COLLECTIONS.ADMIN_USERS);
      const user = await adminCol.findOne({
        username: { $regex: `^${escapeRegex(username)}$`, $options: 'i' },
      });

      if (!user || !user.active) {
        return NextResponse.json({ error: 'Invalid credentials or inactive account.' }, { status: 401 });
      }

      const storedHash = user.passwordHash || user.password;
      if (!verifyPassword(password, storedHash)) {
        return NextResponse.json({ error: 'Invalid User ID or Password.' }, { status: 401 });
      }

      // Upgrade any legacy unhashed password automatically
      if (!user.passwordHash) {
        await adminCol.updateOne(
          { id: user.id },
          { $set: { passwordHash: hashPassword(password), password: '', updatedAt: new Date().toISOString() } }
        );
      }

      const sessionPayload = {
        portal: 'admin' as const,
        userId: user.id,
        username: user.username,
        role: user.role,
      };
      const token = signSessionToken(sessionPayload);
      const res = NextResponse.json({ ok: true, session: sessionPayload });
      attachSessionCookie(res, token);
      return res;
    }

    if (portal === 'teacher') {
      const rawIdentifier =
        typeof body.identifier === 'string'
          ? body.identifier
          : typeof body.email === 'string'
          ? body.email
          : '';
      const identifier = rawIdentifier.trim();
      if (!identifier) {
        return NextResponse.json(
          { error: 'Teacher / Staff ID or Email is required.' },
          { status: 400 }
        );
      }
      const teachersCol = db.collection<StoredTeacher>(COLLECTIONS.TEACHERS);
      const found = await teachersCol.findOne({
        $or: [
          { employeeId: { $regex: `^${escapeRegex(identifier)}$`, $options: 'i' } },
          { email: { $regex: `^${escapeRegex(identifier.toLowerCase())}$`, $options: 'i' } },
        ],
      });

      if (!found) {
        return NextResponse.json(
          { error: 'No faculty record matched that Teacher/Staff ID or Email.' },
          { status: 401 }
        );
      }

      const storedHash = found.passwordHash || found.password;
      if (!storedHash || !verifyPassword(password, storedHash)) {
        return NextResponse.json(
          { error: 'Incorrect faculty password. Contact Admin if a reset is required.' },
          { status: 401 }
        );
      }

      if (!found.passwordHash) {
        await teachersCol.updateOne(
          { id: found.id },
          { $set: { passwordHash: hashPassword(password), password: '', updatedAt: new Date().toISOString() } }
        );
      }

      const sessionPayload = {
        portal: 'teacher' as const,
        userId: found.id,
        username: found.name,
        role: 'Teacher' as const,
      };
      const token = signSessionToken(sessionPayload);
      const res = NextResponse.json({ ok: true, session: sessionPayload });
      attachSessionCookie(res, token);
      return res;
    }

    // Student portal
    const identifier = typeof body.identifier === 'string' ? body.identifier.trim() : '';
    const className = typeof body.className === 'string' ? body.className.trim() : '';
    if (!identifier) {
      return NextResponse.json({ error: 'System ID or Roll Number is required.' }, { status: 400 });
    }

    const studentsCol = db.collection<StoredStudent>(COLLECTIONS.STUDENTS);
    const numericRoll = /^\d+$/.test(identifier) ? parseInt(identifier, 10) : NaN;

    let found: StoredStudent | null = await studentsCol.findOne({
      systemId: { $regex: `^${escapeRegex(identifier)}$`, $options: 'i' },
    });

    if (!found && !Number.isNaN(numericRoll) && className) {
      found = await studentsCol.findOne({
        className,
        rollNumber: numericRoll,
      });
    }

    if (!found) {
      return NextResponse.json(
        { error: 'No student record matched that System ID or Class + Roll Number.' },
        { status: 401 }
      );
    }

    const storedHash = found.passwordHash || found.password;
    if (!storedHash || !verifyPassword(password, storedHash)) {
      return NextResponse.json(
        { error: 'Incorrect portal password. Please contact the Registrar for a reset.' },
        { status: 401 }
      );
    }

    if (!found.passwordHash) {
      await studentsCol.updateOne(
        { id: found.id },
        { $set: { passwordHash: hashPassword(password), password: '', updatedAt: new Date().toISOString() } }
      );
    }

    const sessionPayload = {
      portal: 'student' as const,
      userId: found.id,
      username: found.fullName,
      role: 'Student' as const,
    };
    const token = signSessionToken(sessionPayload);
    const res = NextResponse.json({ ok: true, session: sessionPayload });
    attachSessionCookie(res, token);
    return res;
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Authentication failed' },
      { status: 500 }
    );
  }
}
