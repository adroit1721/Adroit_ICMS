import { Db } from 'mongodb';
import { COLLECTIONS, bumpSyncVersion } from './mongodb';
import { StoredStudent, ensureSettingsDoc, sanitizeStudentOut } from './erp-repository';
import {
  AcademicClass,
  AcademicGroup,
  PromotionHistoryRecord,
  PromotionMode,
  PromotionPayload,
  Student,
  StudentReAdmissionState,
} from '@/lib/types';
import { resolveDefaultBatchCycle } from '@/lib/academic-helpers';

export function normalizeAcademicCycle(value?: string): string {
  return String(value || '')
    .trim()
    .replace(/[–—]/g, '-')
    .toLowerCase();
}

export function normalizePromotionMode(raw: unknown): PromotionMode {
  if (raw === 'merit') return 'merit';
  if (raw === 'keep-roll' || raw === 'keep_roll') return 'keep-roll';
  return 'direct';
}

export interface PromotionServiceResult {
  ok: boolean;
  status?: number;
  error?: string;
  promotedCount?: number;
  requireReAdmission?: boolean;
  sourceAcademicYear?: string;
  targetAcademicYear?: string;
  students?: Student[];
  syncVersion?: number;
}

/**
 * Manages student promotion across academic years (e.g. 2026 -> 2027).
 * - Verifies each student is Active in the previous/source academic year.
 * - Supports bulk promotion into a specific target class, section, group, and roll.
 * - By default generates a `Pending Re-admission` state triggering the re-enrollment flow,
 *   or completes direct promotion when `requireReAdmission === false`.
 */
export async function promoteStudentsBetweenAcademicYears(
  db: Db,
  p: Partial<PromotionPayload>
): Promise<PromotionServiceResult> {
  const studentIds = Array.isArray(p.studentIds)
    ? p.studentIds.map((id) => String(id).trim()).filter(Boolean)
    : [];
  const targetClass = String(p.targetClass || '').trim();
  const targetSection = String(p.targetSection || '').trim();
  const mode = normalizePromotionMode(p.mode);
  const assignments = Array.isArray(p.assignments) ? p.assignments : [];
  const requireReAdmission = p.requireReAdmission !== false;

  if (!targetClass || studentIds.length === 0) {
    return {
      ok: false,
      status: 400,
      error: 'targetClass and at least one studentId are required.',
    };
  }

  const col = db.collection<StoredStudent>(COLLECTIONS.STUDENTS);
  const [settings, targetClsObj, allStudents] = await Promise.all([
    ensureSettingsDoc(db),
    db.collection<AcademicClass>(COLLECTIONS.ACADEMIC_CLASSES).findOne({ name: targetClass }),
    col.find({}).toArray(),
  ]);

  const sourceAcademicYear =
    String(p.sourceAcademicYear || '').trim() ||
    settings.instituteRules.activeAcademicYear ||
    String(new Date().getFullYear());

  const targetAcademicYear =
    String(p.targetAcademicYear || p.targetCycle || '').trim() ||
    resolveDefaultBatchCycle(targetClass, settings.instituteRules, targetClsObj || undefined);

  const normSourceCycle = normalizeAcademicCycle(sourceAcademicYear);
  const normTargetCycle = normalizeAcademicCycle(targetAcademicYear);

  const targetHasGroups =
    targetClsObj?.hasGroups !== false &&
    (targetClsObj?.groups?.some((g) => g !== 'General') ?? false);
  const assignMap = new Map(assignments.map((a) => [a.studentId, a]));

  // Detect students already in the target class & target academic year (active OR pending re-admission)
  const existingTargetOccupants = allStudents.filter((s) => {
    if (studentIds.includes(s.id)) return false;
    if (s.status !== 'Active') return false;

    const isActiveInTarget =
      s.className === targetClass &&
      (!normTargetCycle ||
        !s.batchCycle ||
        normalizeAcademicCycle(s.batchCycle) === normTargetCycle);

    const hasPendingReAdmissionInTarget =
      s.reAdmissionState &&
      (s.reAdmissionState.status === 'Pending Re-admission' ||
        s.reAdmissionState.status === 'Submitted') &&
      s.reAdmissionState.targetClassName === targetClass &&
      normalizeAcademicCycle(s.reAdmissionState.targetAcademicYear) === normTargetCycle;

    return isActiveInTarget || hasPendingReAdmissionInTarget;
  });

  const getOccupiedSectionRoll = (s: StoredStudent): { sec: string; roll: number } => {
    if (
      s.reAdmissionState &&
      (s.reAdmissionState.status === 'Pending Re-admission' ||
        s.reAdmissionState.status === 'Submitted') &&
      s.reAdmissionState.targetClassName === targetClass &&
      normalizeAcademicCycle(s.reAdmissionState.targetAcademicYear) === normTargetCycle
    ) {
      return {
        sec: s.reAdmissionState.targetSectionName || 'Common',
        roll: s.reAdmissionState.targetRollNumber,
      };
    }
    return { sec: s.sectionName || 'Common', roll: s.rollNumber };
  };

  let maxRoll = existingTargetOccupants
    .map(getOccupiedSectionRoll)
    .filter((o) => !targetSection || o.sec === targetSection)
    .reduce((m, o) => Math.max(m, o.roll), 0);

  const seenSectionRolls = new Set<string>(
    existingTargetOccupants.map((s) => {
      const occ = getOccupiedSectionRoll(s);
      return `${occ.sec}::${occ.roll}`;
    })
  );

  const plannedUpdates: Array<{
    student: StoredStudent;
    nextSec: string;
    nextGrp: AcademicGroup;
    nextRoll: number;
    gpa?: number;
  }> = [];

  for (const sid of studentIds) {
    const stu = allStudents.find((x) => x.id === sid);
    if (!stu) {
      return {
        ok: false,
        status: 404,
        error: `Student record "${sid}" was not found.`,
      };
    }

    if (stu.status !== 'Active') {
      return {
        ok: false,
        status: 400,
        error: `Student "${stu.fullName}" has status "${stu.status}". Only Active students can be promoted.`,
      };
    }

    // Verify source academic year when explicit source year is supplied and student has batchCycle
    const stuCycle = normalizeAcademicCycle(stu.batchCycle);
    if (stuCycle && normSourceCycle && stuCycle !== normSourceCycle) {
      return {
        ok: false,
        status: 400,
        error: `Student "${stu.fullName}" belongs to cycle "${stu.batchCycle}", not "${sourceAcademicYear}".`,
      };
    }

    if (
      requireReAdmission &&
      stu.reAdmissionState?.status === 'Pending Re-admission' &&
      normalizeAcademicCycle(stu.reAdmissionState.targetAcademicYear) === normTargetCycle &&
      stu.reAdmissionState.targetClassName === targetClass
    ) {
      return {
        ok: false,
        status: 400,
        error: `Student "${stu.fullName}" is already queued for Pending Re-admission to ${targetClass} (${targetAcademicYear}).`,
      };
    }

    const assigned = assignMap.get(sid);
    const nextSec = assigned?.targetSection || targetSection || stu.sectionName || 'Common';
    const nextGrp: AcademicGroup = (assigned?.targetGroup ||
      (targetHasGroups ? p.targetGroup : 'General') ||
      stu.group) as AcademicGroup;

    if (targetHasGroups && nextGrp === 'General') {
      return {
        ok: false,
        status: 400,
        error: `Student "${stu.fullName}" cannot be promoted to ${targetClass} with group "General". Assign Science, Business Studies, or Humanities.`,
      };
    }

    const nextRoll =
      assigned && typeof assigned.newRoll === 'number' && assigned.newRoll > 0
        ? assigned.newRoll
        : mode === 'keep-roll'
        ? stu.rollNumber
        : ++maxRoll;

    const rollKey = `${nextSec}::${nextRoll}`;
    if (seenSectionRolls.has(rollKey)) {
      return {
        ok: false,
        status: 400,
        error: `Roll collision detected in ${targetClass} (${targetAcademicYear}) Section ${nextSec}: Roll #${nextRoll} is already assigned.`,
      };
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
  const nowIso = new Date().toISOString();
  const updatedStudents: StoredStudent[] = [];

  for (const item of plannedUpdates) {
    const historyEntry: PromotionHistoryRecord = {
      date: todayIso,
      promotedAt: nowIso,
      academicYear: targetAcademicYear,
      fromClass: item.student.className,
      fromSection: item.student.sectionName,
      fromGroup: item.student.group,
      fromRoll: item.student.rollNumber,
      toClass: targetClass,
      toSection: item.nextSec,
      toGroup: item.nextGrp,
      toRoll: item.nextRoll,
      mode,
      ...(p.examId ? { examId: p.examId } : {}),
      ...(p.examTitle ? { examTitle: p.examTitle } : {}),
      ...(item.gpa !== undefined ? { gpa: item.gpa } : {}),
    };
    const updatedHistory = [...(item.student.promotionHistory || []), historyEntry];

    const nextReAdmissionState: StudentReAdmissionState = {
      status: requireReAdmission ? 'Pending Re-admission' : 'Completed',
      sourceAcademicYear: item.student.batchCycle || sourceAcademicYear,
      sourceClassName: item.student.className,
      sourceSectionName: item.student.sectionName || 'Common',
      sourceGroup: item.student.group || 'General',
      sourceRollNumber: item.student.rollNumber,
      targetAcademicYear,
      targetClassName: targetClass,
      targetSectionName: item.nextSec,
      targetGroup: item.nextGrp,
      targetShift: item.student.shift || 'Morning',
      targetRollNumber: item.nextRoll,
      ...(p.examId ? { examId: p.examId } : {}),
      ...(p.examTitle ? { examTitle: p.examTitle } : {}),
      ...(item.gpa !== undefined ? { gpa: item.gpa } : {}),
      promotedAt: nowIso,
      ...(requireReAdmission ? {} : { completedAt: nowIso }),
    };

    const setFields: Partial<StoredStudent> = requireReAdmission
      ? {
          batchCycle: item.student.batchCycle || sourceAcademicYear,
          reAdmissionState: nextReAdmissionState,
          promotionHistory: updatedHistory,
          updatedAt: nowIso,
        }
      : {
          className: targetClass,
          sectionName: item.nextSec,
          group: item.nextGrp,
          rollNumber: item.nextRoll,
          batchCycle: targetAcademicYear,
          status: 'Active',
          reAdmissionState: nextReAdmissionState,
          promotionHistory: updatedHistory,
          updatedAt: nowIso,
        };

    await col.updateOne({ id: item.student.id }, { $set: setFields });

    updatedStudents.push({
      ...item.student,
      ...setFields,
    });
  }

  const syncVersion = await bumpSyncVersion(db, 'students');
  return {
    ok: true,
    status: 200,
    promotedCount: updatedStudents.length,
    requireReAdmission,
    sourceAcademicYear,
    targetAcademicYear,
    students: updatedStudents.map((s) => sanitizeStudentOut(s, 'admin')),
    syncVersion,
  };
}
