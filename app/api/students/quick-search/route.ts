import { NextRequest, NextResponse } from 'next/server';
import { COLLECTIONS, getDb } from '@/lib/server/mongodb';
import { StoredStudent, sanitizeStudentOut } from '@/lib/server/erp-repository';
import { getSessionFromRequest, isAdminSession } from '@/lib/server/security';

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export async function GET(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!isAdminSession(session)) {
    return NextResponse.json({ error: 'Admin authentication required.' }, { status: 401 });
  }

  try {
    const db = await getDb();
    const col = db.collection<StoredStudent>(COLLECTIONS.STUDENTS);
    const searchParams = req.nextUrl.searchParams;
    const q = (searchParams.get('q') || '').trim();
    const pendingOnly = searchParams.get('pendingApprovals') === '1';

    const pendingApprovalsCount = await col.countDocuments({
      updateRequestStatus: 'Pending',
      updateRequest: { $exists: true },
    });

    if (pendingOnly) {
      const docs = await col
        .find({
          updateRequestStatus: 'Pending',
          updateRequest: { $exists: true },
        })
        .sort({ className: 1, rollNumber: 1 })
        .limit(100)
        .toArray();
      return NextResponse.json({
        ok: true,
        students: docs.map((s) => sanitizeStudentOut(s, 'admin')),
        pendingApprovalsCount,
      });
    }

    if (!q) {
      return NextResponse.json({
        ok: true,
        students: [],
        pendingApprovalsCount,
      });
    }

    const escaped = escapeRegex(q);
    const digitsOnly = q.replace(/[\s-]/g, '');
    const normalizedPhone = digitsOnly.startsWith('+880')
      ? `0${digitsOnly.slice(4)}`
      : digitsOnly;
    const phoneRegex = escapeRegex(normalizedPhone || q);

    const docs = await col
      .find({
        status: { $nin: ['Alumni', 'Graduated'] },
        $or: [
          { systemId: { $regex: escaped, $options: 'i' } },
          { phone: { $regex: phoneRegex, $options: 'i' } },
          { fatherPhone: { $regex: phoneRegex, $options: 'i' } },
          { motherPhone: { $regex: phoneRegex, $options: 'i' } },
          { guardianPhone: { $regex: phoneRegex, $options: 'i' } },
          { fullName: { $regex: escaped, $options: 'i' } },
          { banglaName: { $regex: escaped, $options: 'i' } },
        ],
      })
      .sort({ className: 1, rollNumber: 1 })
      .limit(50)
      .toArray();

    return NextResponse.json({
      ok: true,
      students: docs.map((s) => sanitizeStudentOut(s, 'admin')),
      pendingApprovalsCount,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Quick search failed' },
      { status: 500 }
    );
  }
}
