import { NextRequest, NextResponse } from 'next/server';
import { COLLECTIONS, bumpSyncVersion, getDb } from '@/lib/server/mongodb';
import {
  assertTrustedOrigin,
  attachSessionCookie,
  hashPassword,
  sanitizeMongoInput,
  signSessionToken,
} from '@/lib/server/security';
import { StoredAdminUser } from '@/lib/server/erp-repository';

export async function POST(req: NextRequest) {
  if (!assertTrustedOrigin(req)) {
    return NextResponse.json({ error: 'Untrusted request origin' }, { status: 403 });
  }

  try {
    const raw = await req.json();
    const body = sanitizeMongoInput(raw) as {
      username?: unknown;
      fullName?: unknown;
      password?: unknown;
    };

    const username = typeof body.username === 'string' ? body.username.trim() : '';
    const fullName = typeof body.fullName === 'string' ? body.fullName.trim() : '';
    const password = typeof body.password === 'string' ? body.password : '';

    if (username.length < 3 || password.length < 6) {
      return NextResponse.json(
        { error: 'Username must be at least 3 characters and password at least 6 characters.' },
        { status: 400 }
      );
    }

    const db = await getDb();
    const adminCol = db.collection<StoredAdminUser>(COLLECTIONS.ADMIN_USERS);
    const existingCount = await adminCol.countDocuments();
    if (existingCount > 0) {
      return NextResponse.json(
        { error: 'Super Admin is already configured. Please log in normally.' },
        { status: 409 }
      );
    }

    const now = new Date().toISOString();
    const newAdmin: StoredAdminUser = {
      id: `adm-${Date.now()}`,
      username,
      fullName: fullName || 'Super Administrator',
      password: '',
      passwordHash: hashPassword(password),
      role: 'Admin',
      active: true,
      createdAt: now,
      updatedAt: now,
    };

    try {
      await adminCol.insertOne(newAdmin);
    } catch {
      return NextResponse.json(
        { error: 'Initial admin account already claimed.' },
        { status: 409 }
      );
    }

    await bumpSyncVersion(db, 'admin_users');

    const token = signSessionToken({
      portal: 'admin',
      userId: newAdmin.id,
      username: newAdmin.username,
      role: 'Admin',
    });

    const res = NextResponse.json({
      ok: true,
      session: {
        portal: 'admin',
        userId: newAdmin.id,
        username: newAdmin.username,
        role: 'Admin',
      },
    });
    attachSessionCookie(res, token);
    return res;
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to initialize admin account' },
      { status: 500 }
    );
  }
}
