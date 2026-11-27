import { NextRequest, NextResponse } from 'next/server';
import { COLLECTIONS, bumpSyncVersion, getDb } from '@/lib/server/mongodb';
import {
  assertTrustedOrigin,
  getSessionFromRequest,
  isAdminSession,
  sanitizeMongoInput,
} from '@/lib/server/security';
import { StoredStudent, ensureSettingsDoc, sanitizeStudentOut } from '@/lib/server/erp-repository';
import { AcademicClass, AcademicGroup, PromotionHistoryRecord, PromotionMode, PromotionPayload } from '@/lib/types';
import { resolveDefaultBatchCycle } from '@/lib/academic-helpers';

function normalizePromotionMode(raw: unknown): PromotionMode {
  if (raw === 'merit') return 'merit';
  if (raw === 'keep-roll' || raw === 'keep_roll') return 'keep-roll';
  return 'direct';
}

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
    const studentIds = Array.isArray(p.studentIds)
      ? p.studentIds.map((id) => String(id).trim()).filter(Boolean)
      : [];
    const targetClass = String(p.targetClass || '').trim();
    const targetSection = String(p.targetSection || '').trim();
    const mode = normalizePromotionMode(p.mode);
    const assignments = Array.isArray(p.assignments) ? p.assignments : [];

    if (!targetClass || studentIds.length === 0) {
      return NextResponse.json(
        { error: 'targetClass and at least one studentId are required.' },
        { status: 400 }
      );
    }

    const db = await getDb();
    const col = db.collection<StoredStudent>(COLLECTIONS.STUDENTS);
    const [settings, targetClsObj, allStudents] = await Promise.all([
      ensureSettingsDoc(db),
      db.collection<AcademicClass>(COLLECTIONS.ACADEMIC_CLASSES).findOne({ name: targetClass }),
      col.find({}).toArray(),
    ]);

    const targetHasGroups =
      targetClsObj?.hasGroups !== false &&
      (targetClsObj?.groups?.some((g) => g !== 'General') ?? false);
    const assignMap = new Map(assignments.map((a) => [a.studentId, a]));

    const nextCycle = resolveDefaultBatchCycle(
      targetClass,
      settings.instituteRules,
      targetClsObj || undefined
    );

    const normNextCycle = nextCycle.trim().replace(/[–—]/g, '-');
    const existingInTarget = allStudents.filter(
      (s) =>
        !studentIds.includes(s.id) &&
        s.status === 'Active' &&
        s.className === targetClass &&
        (!normNextCycle ||
          !s.batchCycle ||
          s.batchCycle.trim().replace(/[–—]/g, '-') === normNextCycle)
    );

    let maxRoll = existingInTarget
      .filter((s) => !targetSection || s.sectionName === targetSection)
      .reduce((m, s) => Math.max(m, s.rollNumber), 0);

    const plannedUpdates: Array<{
      student: StoredStudent;
      nextSec: string;
      nextGrp: AcademicGroup;
      nextRoll: number;
      gpa?: number;
    }> = [];

    const seenSectionRolls = new Set<string>(
      existingInTarget.map((s) => `${s.sectionName || 'Common'}::${s.rollNumber}`)
    );

    for (const sid of studentIds) {
      const stu = allStudents.find((x) => x.id === sid);
      if (!stu) continue;
      const assigned = assignMap.get(sid);
      const nextSec = assigned?.targetSection || targetSection || stu.sectionName || 'Common';
      const nextGrp: AcademicGroup = (assigned?.targetGroup ||
        (targetHasGroups ? p.targetGroup : 'General') ||
        stu.group) as AcademicGroup;

      // Enforce Class 8 -> Class 9 Group requirement
      if (targetHasGroups && nextGrp === 'General') {
        return NextResponse.json(
          {
            error: `Student "${stu.fullName}" cannot be promoted to ${targetClass} with group "General". Assign Science, Business Studies, or Humanities.`,
          },
          { status: 400 }
        );
      }

      const nextRoll =
        assigned && typeof assigned.newRoll === 'number' && assigned.newRoll > 0
          ? assigned.newRoll
          : mode === 'keep-roll'
          ? stu.rollNumber
          : ++maxRoll;

      const rollKey = `${nextSec}::${nextRoll}`;
      if (seenSectionRolls.has(rollKey)) {
        return NextResponse.json(
          {
            error: `Roll collision detected in ${targetClass} Section ${nextSec}: Roll #${nextRoll} is duplicated or already occupied.`,
          },
          { status: 400 }
        );
      }
      seenSectionRolls.add(rollKey);

      plannedUpdates.push({
        student: stu,
        nextSec,
        nextGrp,
        nextRoll,
        gpa: assigned?.gpa,
      });
    }

    const todayIso = new Date().toISOString().slice(0, 10);
    const updatedStudents: StoredStudent[] = [];

    for (const item of plannedUpdates) {
      const historyEntry: PromotionHistoryRecord = {
        date: todayIso,
        fromClass: item.student.className,
        fromSection: item.student.sectionName,
        fromRoll: item.student.rollNumber,
        toClass: targetClass,
        toSection: item.nextSec,
        toRoll: item.nextRoll,
        mode,
        ...(p.examId ? { examId: p.examId } : {}),
        ...(p.examTitle ? { examTitle: p.examTitle } : {}),
        ...(item.gpa !== undefined ? { gpa: item.gpa } : {}),
      };
      const updatedHistory = [...(item.student.promotionHistory || []), historyEntry];
      const nowIso = new Date().toISOString();

      await col.updateOne(
        { id: item.student.id },
        {
          $set: {
            className: targetClass,
            sectionName: item.nextSec,
            group: item.nextGrp,
            rollNumber: item.nextRoll,
            batchCycle: nextCycle,
            status: 'Active',
            promotionHistory: updatedHistory,
            updatedAt: nowIso,
          },
        }
      );

      updatedStudents.push({
        ...item.student,
        className: targetClass,
        sectionName: item.nextSec,
        group: item.nextGrp,
        rollNumber: item.nextRoll,
        batchCycle: nextCycle,
        status: 'Active',
        promotionHistory: updatedHistory,
      });
    }

    const syncVersion = await bumpSyncVersion(db, 'students');
    return NextResponse.json({
      ok: true,
      promotedCount: updatedStudents.length,
      students: updatedStudents.map((s) => sanitizeStudentOut(s, 'admin')),
      syncVersion,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Student promotion failed' },
      { status: 500 }
    );
  }
}
