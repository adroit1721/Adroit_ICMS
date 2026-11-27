import { NextRequest, NextResponse } from 'next/server';
import { COLLECTIONS, getDb } from '@/lib/server/mongodb';
import { StoredStudent, ensureSettingsDoc, sanitizeStudentOut } from '@/lib/server/erp-repository';
import { getSessionFromRequest, isAdminSession } from '@/lib/server/security';
import { AcademicClass } from '@/lib/types';
import { resolveDefaultBatchCycle } from '@/lib/academic-helpers';

function normalizeCycleDashes(val: string): string {
  return val.trim().replace(/[–—]/g, '-');
}

export async function GET(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!isAdminSession(session)) {
    return NextResponse.json({ error: 'Admin authentication required.' }, { status: 401 });
  }

  try {
    const searchParams = req.nextUrl.searchParams;
    const batchCycle = (searchParams.get('batchCycle') || '').trim();
    const className = (searchParams.get('className') || '').trim();
    const group = (searchParams.get('group') || '').trim();
    const sectionName = (searchParams.get('sectionName') || '').trim();
    const shift = (searchParams.get('shift') || '').trim();
    const religionGroup = (searchParams.get('religionGroup') || '').trim();
    const gender = (searchParams.get('gender') || '').trim();
    const graduatedYear = (searchParams.get('graduatedYear') || '').trim();
    const view = (searchParams.get('view') || 'active').trim();

    if (view !== 'alumni' && !className) {
      return NextResponse.json(
        { error: 'Class selection is required before loading the student register.' },
        { status: 400 }
      );
    }

    const db = await getDb();
    const col = db.collection<StoredStudent>(COLLECTIONS.STUDENTS);

    const query: Record<string, unknown> =
      view === 'alumni'
        ? { status: { $in: ['Alumni', 'Graduated'] } }
        : { status: { $nin: ['Alumni', 'Graduated'] }, className };

    if (group && group.toLowerCase() !== 'all') {
      query.group = group === 'General' ? { $in: ['General', ''] } : group;
    }
    if (sectionName && sectionName.toLowerCase() !== 'all') {
      query.sectionName = sectionName === 'Common' ? { $in: ['Common', ''] } : sectionName;
    }
    if (shift && shift.toLowerCase() !== 'all') {
      query.shift = shift;
    }
    if (religionGroup && religionGroup.toLowerCase() !== 'all') {
      query.religionGroup = religionGroup;
    }
    if (gender && gender.toLowerCase() !== 'all') {
      query.gender = gender;
    }
    if (view === 'alumni' && graduatedYear && graduatedYear.toLowerCase() !== 'all') {
      query.graduatedYear = graduatedYear;
    }

    if (view !== 'alumni' && batchCycle && batchCycle.toLowerCase() !== 'all') {
      const [settings, clsObj] = await Promise.all([
        ensureSettingsDoc(db),
        db.collection<AcademicClass>(COLLECTIONS.ACADEMIC_CLASSES).findOne({ name: className }),
      ]);
      const defaultCycle = resolveDefaultBatchCycle(className, settings.instituteRules, clsObj || undefined);
      const normReq = normalizeCycleDashes(batchCycle);
      const normDef = normalizeCycleDashes(defaultCycle);
      const cycleVariants = Array.from(
        new Set([batchCycle, normReq, normReq.replace(/-/g, '–')])
      );
      if (normReq === normDef) {
        query.$or = [
          { batchCycle: { $in: cycleVariants } },
          { batchCycle: { $exists: false } },
          { batchCycle: '' },
        ];
      } else {
        query.batchCycle = { $in: cycleVariants };
      }
    }

    const docs = await col.find(query).sort({ rollNumber: 1, fullName: 1 }).toArray();

    return NextResponse.json({
      ok: true,
      count: docs.length,
      students: docs.map((s) => sanitizeStudentOut(s, 'admin')),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load student register' },
      { status: 500 }
    );
  }
}
