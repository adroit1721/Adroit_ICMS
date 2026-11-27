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
import { StoredStudent } from '@/lib/server/erp-repository';
import { AcademicClass } from '@/lib/types';

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
      studentId?: unknown;
      identifier?: unknown;
      classId?: unknown;
      className?: unknown;
      sectionId?: unknown;
      sectionName?: unknown;
      roll?: unknown;
      rollNumber?: unknown;
      pin?: unknown;
      password?: unknown;
    };

    const password =
      typeof body.password === 'string' && body.password
        ? body.password
        : typeof body.pin === 'string'
        ? body.pin
        : '';

    if (!password) {
      return NextResponse.json({ error: '6-digit password is required.' }, { status: 400 });
    }

    const studentIdInput =
      typeof body.studentId === 'string' && body.studentId.trim()
        ? body.studentId.trim()
        : typeof body.identifier === 'string'
        ? body.identifier.trim()
        : '';

    const classInput =
      typeof body.className === 'string' && body.className.trim()
        ? body.className.trim()
        : typeof body.classId === 'string'
        ? body.classId.trim()
        : '';

    const sectionInput =
      typeof body.sectionName === 'string' && body.sectionName.trim()
        ? body.sectionName.trim()
        : typeof body.sectionId === 'string'
        ? body.sectionId.trim()
        : '';

    const rollRaw =
      body.roll !== undefined
        ? body.roll
        : body.rollNumber !== undefined
        ? body.rollNumber
        : typeof body.identifier === 'string' && /^\d+$/.test(body.identifier.trim())
        ? body.identifier.trim()
        : '';
    const numericRoll =
      typeof rollRaw === 'number'
        ? rollRaw
        : typeof rollRaw === 'string' && /^\d+$/.test(rollRaw.trim())
        ? parseInt(rollRaw.trim(), 10)
        : NaN;

    const db = await getDb();
    const studentsCol = db.collection<StoredStudent>(COLLECTIONS.STUDENTS);
    let found: StoredStudent | null = null;

    // Option A: Student ID lookup (when not using Class + Roll)
    if (studentIdInput && !classInput) {
      found = await studentsCol.findOne({
        systemId: { $regex: `^${escapeRegex(studentIdInput)}$`, $options: 'i' },
      });
    }

    // Option B: Class + Section + Roll lookup
    if (!found && classInput && !Number.isNaN(numericRoll)) {
      const clsObj = await db.collection<AcademicClass>(COLLECTIONS.ACADEMIC_CLASSES).findOne({
        $or: [{ name: classInput }, { id: classInput }],
      });
      const resolvedClassName = clsObj?.name || classInput;

      if (clsObj?.hasSections !== false && clsObj && clsObj.sections.length > 1 && !sectionInput) {
        return NextResponse.json(
          { error: 'Section is required for this class.' },
          { status: 400 }
        );
      }

      const matches = await studentsCol
        .find({
          className: resolvedClassName,
          rollNumber: numericRoll,
          status: { $nin: ['Alumni', 'Graduated', 'Transferred'] },
          ...(sectionInput ? { sectionName: sectionInput } : {}),
        })
        .toArray();

      if (matches.length === 1) {
        found = matches[0];
      } else if (matches.length > 1) {
        return NextResponse.json(
          { error: 'Multiple sections have this Roll Number. Please select your Section.' },
          { status: 400 }
        );
      }
    }

    // Fallback: if user passed studentId even alongside className
    if (!found && studentIdInput) {
      found = await studentsCol.findOne({
        systemId: { $regex: `^${escapeRegex(studentIdInput)}$`, $options: 'i' },
      });
    }

    if (!found) {
      return NextResponse.json(
        { error: 'No student record matched that Student ID or Class + Section + Roll.' },
        { status: 401 }
      );
    }

    const storedHash = found.passwordHash || found.password;
    if (!storedHash || !verifyPassword(password, storedHash)) {
      return NextResponse.json(
        { error: 'Incorrect 6-digit password. Please contact the Registrar for a reset.' },
        { status: 401 }
      );
    }

    if (!found.passwordHash || !found.passwordHash.startsWith('$2')) {
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
    const res = NextResponse.json({
      ok: true,
      session: sessionPayload,
      student: {
        id: found.id,
        systemId: found.systemId,
        fullName: found.fullName,
        className: found.className,
        sectionName: found.sectionName,
        rollNumber: found.rollNumber,
      },
    });
    attachSessionCookie(res, token);
    return res;
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Student authentication failed' },
      { status: 500 }
    );
  }
}
