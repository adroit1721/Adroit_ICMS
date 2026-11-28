import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/server/mongodb';
import {
  assertTrustedOrigin,
  getSessionFromRequest,
  isAdminSession,
  sanitizeMongoInput,
} from '@/lib/server/security';
import { promoteStudentsBetweenAcademicYears } from '@/lib/server/promotion-service';
import { PromotionPayload } from '@/lib/types';

export async function POST(req: NextRequest) {
  if (!assertTrustedOrigin(req)) {
    return NextResponse.json({ error: 'Untrusted request origin' }, { status: 403 });
  }

  const session = getSessionFromRequest(req);
  if (!isAdminSession(session)) {
    return NextResponse.json({ error: 'Admin authentication required.' }, { status: 401 });
  }

  try {
    const raw = await req.json();
    const p = sanitizeMongoInput(raw) as Partial<PromotionPayload>;
    const db = await getDb();
    const result = await promoteStudentsBetweenAcademicYears(db, p);

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error || 'Student promotion failed' },
        { status: result.status || 400 }
      );
    }

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Student promotion failed' },
      { status: 500 }
    );
  }
}
