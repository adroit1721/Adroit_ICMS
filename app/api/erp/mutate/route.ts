import { NextRequest, NextResponse } from 'next/server';
import { COLLECTIONS, bumpSyncVersion, getDb } from '@/lib/server/mongodb';
import {
  assertTrustedOrigin,
  encryptAdminPin,
  getSessionFromRequest,
  hashPassword,
  isAdminSession,
  sanitizeMongoInput,
  sanitizeSafeUrl,
} from '@/lib/server/security';
import {
  SettingsDocument,
  StoredAdminUser,
  StoredStudent,
  StoredTeacher,
  cleanupCmsRemovedMedia,
  cleanupExamRemovedMedia,
  ensureSettingsDoc,
  resetOperationalDataInDb,
  sanitizeAdminUserOut,
  sanitizeStudentOut,
  sanitizeTeacherOut,
  seedNctbPresetsToDb,
  stripMongoDoc,
} from '@/lib/server/erp-repository';
import {
  collectNoticeMediaEntries,
  collectStudentMediaEntries,
  collectTeacherMediaEntries,
  destroyCloudinaryAsset,
  destroyManyCloudinaryAssets,
  extractCloudinaryPublicId,
} from '@/lib/server/cloudinary';
import {
  AcademicClass,
  AcademicEvent,
  AcademicGroup,
  AdminUserAccount,
  AdmissionApplication,
  AdmissionFormConfig,
  CMSConfig,
  ClassRoutineDay,
  Exam,
  ExamResultRecord,
  ExaminerAssignment,
  ExamRoutineItem,
  InstituteRules,
  MarkEntry,
  MfsGatewayConfig,
  Notice,
  SavedTabulationRecord,
  ShiftType,
  SmsGatewayConfig,
  SmsLog,
  Student,
  StudentInvoice,
  Subject,
  Teacher,
} from '@/lib/types';
import { evaluateSubjectResult } from '@/lib/grading-engine';
import {
  formatTime12h,
  getActiveSubjectCustomComponents,
  isCollegeClassName,
  isHscYear2ClassName,
  isStudentGenderEligibleForSubject,
  isSubjectComponentEnabled,
  resolveDefaultBatchCycle,
  resolveSubjectCTConfig,
  subjectAppliesToGroup,
} from '@/lib/academic-helpers';
import {
  generateSixDigitPin,
  getNextStudentSystemIdFromStudents,
  isValidBdBirthReg,
  isValidBdMobile,
  isValidBdNid,
  normalizeBdMobileInput,
  parseDDMMYYYYToISO,
} from '@/lib/student-schema';
import {
  generateSixDigitPinValue,
  getNextRankOrderForCategory,
  getNextUniqueTeacherOrStaffId,
  normalizeTeacherCategory,
} from '@/lib/teacher-helpers';

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function uidSuffix(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function resolveClientOrGeneratedId(rawId: unknown, prefix: string): string {
  if (typeof rawId === 'string') {
    const trimmed = rawId.trim();
    if (/^[a-zA-Z0-9_-]{3,90}$/.test(trimmed)) {
      return trimmed;
    }
  }
  return `${prefix}-${uidSuffix()}`;
}

function getNextStudentSystemIdFromList(
  students: Array<{ systemId?: string }>,
  prefixInput = 'AG',
  academicYear: number | string = new Date().getFullYear(),
  offset = 0
): string {
  return getNextStudentSystemIdFromStudents(students, prefixInput, academicYear, offset);
}

function normalizeStudentDobToIso(rawDob: unknown): string {
  if (typeof rawDob !== 'string') return '';
  const trimmed = rawDob.trim();
  if (!trimmed) return '';
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed.slice(0, 10);
  const parsed = parseDDMMYYYYToISO(trimmed);
  return parsed || trimmed;
}

function getNextInvoiceNoFromList(invoices: Array<{ invoiceNo?: string }>, offset = 0): string {
  const year = new Date().getFullYear();
  let maxNum = 0;
  for (const inv of invoices) {
    const m = String(inv.invoiceNo || '').match(/(\d+)$/);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n > maxNum) maxNum = n;
    }
  }
  return `INV-${year}-${String(maxNum + 1 + offset).padStart(3, '0')}`;
}

export async function POST(req: NextRequest) {
  if (!assertTrustedOrigin(req)) {
    return NextResponse.json({ error: 'Untrusted request origin' }, { status: 403 });
  }

  try {
    const raw = await req.json();
    const sanitized = sanitizeMongoInput(raw) as { action?: unknown; payload?: Record<string, unknown> };
    const action = typeof sanitized.action === 'string' ? sanitized.action.trim() : '';
    const payload = (sanitized.payload && typeof sanitized.payload === 'object' ? sanitized.payload : {}) as Record<string, unknown>;

    if (!action) {
      return NextResponse.json({ error: 'Missing mutation action.' }, { status: 400 });
    }

    const session = getSessionFromRequest(req);
    const db = await getDb();

    // Public action: Submit admission application
    if (action === 'addAdmissionApplication') {
      const applicantName = typeof payload.applicantName === 'string' ? payload.applicantName.trim() : '';
      if (!applicantName) {
        return NextResponse.json({ error: 'Applicant name is required.' }, { status: 400 });
      }
      const existingCount = await db.collection(COLLECTIONS.ADMISSIONS).countDocuments();
      const parts = applicantName.split(/\s+/);
      const initials = parts.slice(0, 2).map((p) => p[0]?.toUpperCase() || '').join('') || 'NA';
      const newApp: AdmissionApplication = {
        id: `app-${uidSuffix()}`,
        applicantName,
        applicantInitials: initials,
        applicationCode: `APP-${8901 + existingCount}`,
        grade: String(payload.grade || 'Class 6'),
        appliedTime: new Date().toISOString().slice(0, 10),
        score: typeof payload.score === 'string' && payload.score.trim() ? payload.score.trim() : 'Awaiting Assessment',
        status: 'Pending',
        gender: payload.gender === 'Female' ? 'Female' : 'Male',
        fatherName: typeof payload.fatherName === 'string' ? payload.fatherName.trim() : '',
        motherName: typeof payload.motherName === 'string' ? payload.motherName.trim() : '',
        phone: typeof payload.phone === 'string' ? payload.phone.trim() : '',
        religionGroup: (payload.religionGroup as AdmissionApplication['religionGroup']) || 'Islam',
        group: (payload.group as AcademicGroup) || 'General',
        customAnswers:
          payload.customAnswers && typeof payload.customAnswers === 'object'
            ? (payload.customAnswers as Record<string, string>)
            : {},
      };
      await db.collection<AdmissionApplication>(COLLECTIONS.ADMISSIONS).insertOne(newApp);
      const syncVersion = await bumpSyncVersion(db, 'admissions');
      return NextResponse.json({ ok: true, data: newApp, syncVersion });
    }

    // Student portal profile update request (verified Student self OR Admin)
    if (action === 'submitStudentUpdateRequest') {
      const id = typeof payload.id === 'string' ? payload.id.trim() : '';
      const updates = (payload.updates && typeof payload.updates === 'object' ? payload.updates : {}) as Partial<Student>;
      const allowedByStudent = session?.portal === 'student' && session.userId === id;
      if (!allowedByStudent && !isAdminSession(session)) {
        return NextResponse.json({ error: 'Unauthorized profile update request.' }, { status: 403 });
      }
      const studentsCol = db.collection<StoredStudent>(COLLECTIONS.STUDENTS);
      const existing = await studentsCol.findOne({ id });
      if (!existing) {
        return NextResponse.json({ error: 'Student not found.' }, { status: 404 });
      }

      // Only allow editable profile fields from student portal
      const safeReq: Partial<Student> = {};
      const editableKeys: Array<keyof Student> = [
        'avatarUrl',
        'avatarPublicId',
        'phone',
        'bloodGroup',
        'birthRegOrNid',
        'fatherName',
        'fatherPhone',
        'motherName',
        'motherPhone',
        'guardianName',
        'guardianRelation',
        'guardianPhone',
        'presentAddress',
        'permanentAddress',
      ];
      for (const k of editableKeys) {
        if (k in updates && updates[k] !== undefined) {
          (safeReq as Record<string, unknown>)[k] =
            k === 'avatarUrl' ? sanitizeSafeUrl(String(updates[k] || '')) : updates[k];
        }
      }

      const oldPendingPid =
        existing.updateRequest?.avatarPublicId ||
        extractCloudinaryPublicId(existing.updateRequest?.avatarUrl);
      const nextPendingPid =
        safeReq.avatarPublicId || extractCloudinaryPublicId(safeReq.avatarUrl);

      await studentsCol.updateOne(
        { id },
        {
          $set: {
            updateRequest: safeReq,
            updateRequestStatus: 'Pending',
            updatedAt: new Date().toISOString(),
          },
          $unset: { updateRequestRejectionReason: '' },
        }
      );

      // Destroy previous replaced pending photo (only if distinct from current active photo)
      const activePid = existing.avatarPublicId || extractCloudinaryPublicId(existing.avatarUrl);
      if (oldPendingPid && oldPendingPid !== nextPendingPid && oldPendingPid !== activePid) {
        await destroyCloudinaryAsset(oldPendingPid);
      }

      const syncVersion = await bumpSyncVersion(db, 'students');
      return NextResponse.json({ ok: true, syncVersion });
    }

    // Fee payment recording (Admin OR Student paying their own fee)
    if (action === 'recordFeePayment') {
      const studentId = typeof payload.studentId === 'string' ? payload.studentId.trim() : '';
      const allowedByStudent = session?.portal === 'student' && session.userId === studentId;
      if (!allowedByStudent && !isAdminSession(session)) {
        return NextResponse.json({ error: 'Authentication required.' }, { status: 403 });
      }

      const invoiceId = typeof payload.invoiceId === 'string' ? payload.invoiceId.trim() : undefined;
      const month = typeof payload.month === 'string' ? payload.month.trim() : 'Current Month';
      const amount = Number(payload.amount || 0);
      const method = (payload.method as StudentInvoice['paymentMethod']) || 'bKash';
      const transactionId = typeof payload.transactionId === 'string' ? payload.transactionId.trim() : `TXN-${Date.now()}`;

      if (!studentId || Number.isNaN(amount) || amount <= 0) {
        return NextResponse.json({ error: 'Valid student ID and positive amount required.' }, { status: 400 });
      }

      const student = await db.collection<StoredStudent>(COLLECTIONS.STUDENTS).findOne({ id: studentId });
      if (!student) {
        return NextResponse.json({ error: 'Student not found.' }, { status: 404 });
      }

      const invoicesCol = db.collection<StudentInvoice>(COLLECTIONS.INVOICES);
      const today = new Date().toISOString().split('T')[0];

      if (invoiceId) {
        const existingInv = await invoicesCol.findOne({ id: invoiceId, studentId });
        if (!existingInv) {
          return NextResponse.json({ error: 'Invoice not found.' }, { status: 404 });
        }
        const nextPaid = Math.min(existingInv.totalPayable, (existingInv.paidAmount || 0) + amount);
        const updated: StudentInvoice = {
          ...stripMongoDoc(existingInv as unknown as Record<string, unknown>) as unknown as StudentInvoice,
          paidAmount: nextPaid,
          status: nextPaid >= existingInv.totalPayable ? 'Paid' : 'Partial',
          paymentMethod: method,
          transactionId,
          paymentDate: today,
        };
        await invoicesCol.updateOne({ id: invoiceId }, { $set: updated });
        const syncVersion = await bumpSyncVersion(db, 'invoices');
        return NextResponse.json({ ok: true, data: updated, syncVersion });
      }

      const allInvoices = await invoicesCol.find({}, { projection: { invoiceNo: 1 } }).toArray();
      const settings = await ensureSettingsDoc(db);
      const clsObj = await db.collection<AcademicClass>(COLLECTIONS.ACADEMIC_CLASSES).findOne({ name: student.className });
      const newInv: StudentInvoice = {
        id: `inv-${uidSuffix()}`,
        invoiceNo: getNextInvoiceNoFromList(allInvoices),
        studentId: student.id,
        studentName: student.fullName,
        rollNumber: student.rollNumber,
        className: student.className,
        sectionName: student.sectionName,
        month,
        academicYear: resolveDefaultBatchCycle(student.className, settings.instituteRules, clsObj || undefined),
        totalPayable: amount,
        paidAmount: amount,
        status: 'Paid',
        paymentMethod: method,
        transactionId,
        paymentDate: today,
      };
      await invoicesCol.insertOne(newInv);
      const syncVersion = await bumpSyncVersion(db, 'invoices');
      return NextResponse.json({ ok: true, data: newInv, syncVersion });
    }

    // Teacher self-service profile update (verified Teacher session only)
    if (action === 'updateOwnTeacherProfile') {
      if (session?.portal !== 'teacher' || !session.userId) {
        return NextResponse.json({ error: 'Teacher login required.' }, { status: 403 });
      }
      const updates = (payload.updates && typeof payload.updates === 'object' ? payload.updates : {}) as Partial<Teacher>;
      const col = db.collection<StoredTeacher>(COLLECTIONS.TEACHERS);
      const existing = await col.findOne({ id: session.userId });
      if (!existing) {
        return NextResponse.json({ error: 'Teacher profile not found.' }, { status: 404 });
      }

      const safePatch: Partial<StoredTeacher> = {
        updatedAt: new Date().toISOString(),
      };
      const selfEditableKeys: Array<keyof Teacher> = [
        'name',
        'banglaName',
        'phone',
        'email',
        'emergencyContact',
        'presentAddress',
        'permanentAddress',
        'qualification',
        'bloodGroup',
        'dateOfBirth',
        'gender',
        'nidNumber',
        'avatarUrl',
        'avatarPublicId',
        'signatureUrl',
        'signaturePublicId',
      ];
      for (const k of selfEditableKeys) {
        if (!(k in updates) || updates[k] === undefined) continue;
        if (k === 'avatarUrl' || k === 'signatureUrl') {
          (safePatch as Record<string, unknown>)[k] = sanitizeSafeUrl(String(updates[k] || ''));
        } else if (typeof updates[k] === 'string') {
          (safePatch as Record<string, unknown>)[k] = (updates[k] as string).trim();
        } else {
          (safePatch as Record<string, unknown>)[k] = updates[k];
        }
      }
      if ('name' in safePatch && !safePatch.name) {
        return NextResponse.json({ error: 'Name in English cannot be empty.' }, { status: 400 });
      }
      if ('banglaName' in safePatch && !safePatch.banglaName) {
        safePatch.banglaName = undefined;
      }

      await col.updateOne({ id: existing.id }, { $set: safePatch });

      const toDestroy: Array<{ publicId?: string | null; url?: string | null }> = [];
      const oldAvatarPid = existing.avatarPublicId || extractCloudinaryPublicId(existing.avatarUrl);
      const nextAvatarUrl = 'avatarUrl' in safePatch ? safePatch.avatarUrl : existing.avatarUrl;
      const nextAvatarPid =
        'avatarPublicId' in safePatch
          ? safePatch.avatarPublicId
          : extractCloudinaryPublicId(nextAvatarUrl);
      if (oldAvatarPid && oldAvatarPid !== nextAvatarPid) {
        toDestroy.push({ publicId: oldAvatarPid });
      }

      const oldSigPid = existing.signaturePublicId || extractCloudinaryPublicId(existing.signatureUrl);
      const nextSigUrl = 'signatureUrl' in safePatch ? safePatch.signatureUrl : existing.signatureUrl;
      const nextSigPid =
        'signaturePublicId' in safePatch
          ? safePatch.signaturePublicId
          : extractCloudinaryPublicId(nextSigUrl);
      if (oldSigPid && oldSigPid !== nextSigPid) {
        toDestroy.push({ publicId: oldSigPid });
      }
      if (toDestroy.length > 0) await destroyManyCloudinaryAssets(toDestroy);

      const updatedDoc: StoredTeacher = { ...existing, ...safePatch };
      const syncVersion = await bumpSyncVersion(db, 'teachers');
      return NextResponse.json({
        ok: true,
        data: sanitizeTeacherOut(updatedDoc, 'self'),
        syncVersion,
      });
    }

    // Teacher or Admin: saveMarkEntries
    if (action === 'saveMarkEntries') {
      const isTeacher = session?.portal === 'teacher';
      const isAdmin = isAdminSession(session);
      if (!isTeacher && !isAdmin) {
        return NextResponse.json({ error: 'Faculty or Admin login required.' }, { status: 403 });
      }

      const entries = Array.isArray(payload.entries) ? (payload.entries as Array<Partial<MarkEntry>>) : [];
      if (entries.length === 0) {
        return NextResponse.json({ ok: true, syncVersion: await bumpSyncVersion(db, 'mark_entries') });
      }

      const marksCol = db.collection<MarkEntry>(COLLECTIONS.MARK_ENTRIES);
      const examsCol = db.collection<Exam>(COLLECTIONS.EXAMS);
      const studentsCol = db.collection<StoredStudent>(COLLECTIONS.STUDENTS);
      const subjectsCol = db.collection<Subject>(COLLECTIONS.SUBJECTS);
      const teacherDoc =
        isTeacher && session
          ? await db.collection<StoredTeacher>(COLLECTIONS.TEACHERS).findOne({ id: session.userId })
          : null;
      if (isTeacher && !teacherDoc) {
        return NextResponse.json({ error: 'Teacher account not found.' }, { status: 403 });
      }

      for (const item of entries) {
        if (!item.examId || !item.studentId || !item.subjectId) continue;
        const [exam, existingMark, student, subject] = await Promise.all([
          examsCol.findOne({ id: item.examId }),
          marksCol.findOne({ examId: item.examId, studentId: item.studentId, subjectId: item.subjectId }),
          studentsCol.findOne({ id: item.studentId }),
          subjectsCol.findOne({ id: item.subjectId }),
        ]);

        if (!exam || !student || !subject) continue;
        if (existingMark?.isLocked && !isAdmin) continue;
        if (exam.targetClasses?.length && !exam.targetClasses.includes(student.className)) continue;
        if (exam.excludedSubjectIds?.includes(subject.id)) continue;

        // Strictly enforce examiner assignment: Teacher must be explicitly assigned to this subject/class in the Exam
        if (isTeacher && session) {
          const matchingPaperAssignments = (exam.examinerAssignments || []).filter(
            (a) =>
              a.subjectId === item.subjectId &&
              a.className === student.className &&
              (a.sectionName === 'Common' || !a.sectionName || a.sectionName === student.sectionName)
          );
          const isAssignedInExam = matchingPaperAssignments.some(
            (a) => a.teacherId === session.userId
          );

          if (!isAssignedInExam) {
            return NextResponse.json(
              { error: 'You are not assigned as examiner for this subject, class, and section.' },
              { status: 403 }
            );
          }
        }

        const cleanSubject = stripMongoDoc(subject as unknown as Record<string, unknown>) as unknown as Subject;
        const isAbsent = Boolean(item.isAbsent);
        const ctConfig = resolveSubjectCTConfig(cleanSubject, exam);
        const cqEnabled = isSubjectComponentEnabled(cleanSubject.components.cq);
        const mcqEnabled = isSubjectComponentEnabled(cleanSubject.components.mcq);
        const pracEnabled = isSubjectComponentEnabled(cleanSubject.components.practical);
        const activeCustom = getActiveSubjectCustomComponents(cleanSubject);

        const ctMarks =
          isAbsent || !ctConfig.enabled
            ? 0
            : Math.min(ctConfig.fullMarks, Math.max(0, Number(item.ctMarks ?? 0) || 0));
        const cqMarks =
          isAbsent || !cqEnabled
            ? 0
            : Math.min(cleanSubject.components.cq.fullMarks, Math.max(0, Number(item.cqMarks ?? 0) || 0));
        const mcqMarks =
          isAbsent || !mcqEnabled
            ? 0
            : Math.min(cleanSubject.components.mcq.fullMarks, Math.max(0, Number(item.mcqMarks ?? 0) || 0));
        const practicalMarks =
          isAbsent || !pracEnabled
            ? 0
            : Math.min(
                cleanSubject.components.practical.fullMarks,
                Math.max(0, Number(item.practicalMarks ?? 0) || 0)
              );

        const customMarks: Record<string, number> = {};
        if (!isAbsent && activeCustom.length > 0) {
          for (const c of activeCustom) {
            const rawVal = Number(item.customMarks?.[c.id] ?? 0) || 0;
            customMarks[c.id] = Math.min(c.fullMarks, Math.max(0, rawVal));
          }
        }

        const isFourth = student.optionalFourthSubjectId === subject.id;
        const evalRes = evaluateSubjectResult(
          cleanSubject,
          { cq: cqMarks, mcq: mcqMarks, practical: practicalMarks, ct: ctMarks, customMarks, isAbsent },
          isFourth,
          exam
        );

        const doc: MarkEntry = {
          id: existingMark?.id || item.id || `m-${uidSuffix()}`,
          examId: item.examId,
          studentId: item.studentId,
          subjectId: item.subjectId,
          isAbsent,
          ctMarks,
          cqMarks,
          mcqMarks,
          practicalMarks,
          customMarks,
          totalMarks: evalRes.total,
          gradePoint: evalRes.gradePoint,
          letterGrade: evalRes.letterGrade,
          isPassed: evalRes.isPassed,
          isOptionalFourth: isFourth,
          isLocked: isAdmin ? Boolean(item.isLocked) : Boolean(existingMark?.isLocked),
          ...(existingMark?.isSentToTabulation !== undefined
            ? { isSentToTabulation: existingMark.isSentToTabulation }
            : {}),
          ...(existingMark?.sentToTabulationAt
            ? { sentToTabulationAt: existingMark.sentToTabulationAt }
            : {}),
        };

        await marksCol.updateOne(
          { examId: doc.examId, studentId: doc.studentId, subjectId: doc.subjectId },
          { $set: doc },
          { upsert: true }
        );
      }

      const syncVersion = await bumpSyncVersion(db, 'mark_entries');
      return NextResponse.json({ ok: true, syncVersion });
    }

    // Teacher (lock submitted roster) or Admin (lock/unlock roster)
    if (action === 'lockExamRoster') {
      const isTeacher = session?.portal === 'teacher';
      const isAdmin = isAdminSession(session);
      if (!isTeacher && !isAdmin) {
        return NextResponse.json({ error: 'Faculty or Admin login required.' }, { status: 403 });
      }
      const examId = String(payload.examId || '');
      const subjectId = String(payload.subjectId || '');
      if (isTeacher && session) {
        const exam = await db.collection<Exam>(COLLECTIONS.EXAMS).findOne({ id: examId });
        const matchingAssignments = (exam?.examinerAssignments || []).filter(
          (a) => a.subjectId === subjectId
        );
        const isAssignedInExam = matchingAssignments.some((a) => a.teacherId === session.userId);
        if (!isAssignedInExam) {
          return NextResponse.json(
            { error: 'Only an assigned examiner or Admin can lock this subject roster.' },
            { status: 403 }
          );
        }
      }
      await db.collection<MarkEntry>(COLLECTIONS.MARK_ENTRIES).updateMany(
        { examId, subjectId },
        { $set: { isLocked: true } }
      );
      const syncVersion = await bumpSyncVersion(db, 'mark_entries');
      return NextResponse.json({ ok: true, syncVersion });
    }

    // All remaining actions require Admin / Manager / Accountant session
    if (!isAdminSession(session)) {
      return NextResponse.json({ error: 'Administrative authorization required.' }, { status: 403 });
    }

    const settingsCol = db.collection<SettingsDocument>(COLLECTIONS.SETTINGS);

    switch (action) {
      case 'updateCMSConfig': {
        const currentSettings = await ensureSettingsDoc(db);
        const updates = (payload.updates || {}) as Partial<CMSConfig>;
        const nextCms: CMSConfig = {
          ...currentSettings.cmsConfig,
          ...updates,
          crestUrl: sanitizeSafeUrl(updates.crestUrl ?? currentSettings.cmsConfig.crestUrl),
          faviconUrl: sanitizeSafeUrl(updates.faviconUrl ?? currentSettings.cmsConfig.faviconUrl),
          principalPhotoUrl: sanitizeSafeUrl(updates.principalPhotoUrl ?? currentSettings.cmsConfig.principalPhotoUrl),
          ...(Array.isArray(updates.heroSlides)
            ? {
                heroSlides: updates.heroSlides.map((s) => ({
                  ...s,
                  imageUrl: sanitizeSafeUrl(s.imageUrl),
                })),
              }
            : {}),
          ...(Array.isArray(updates.extraLeadershipCards)
            ? {
                extraLeadershipCards: updates.extraLeadershipCards.map((c) => ({
                  ...c,
                  photoUrl: sanitizeSafeUrl(c.photoUrl),
                })),
              }
            : {}),
        };
        await settingsCol.updateOne(
          { _id: 'primary' },
          { $set: { cmsConfig: nextCms, updatedAt: new Date().toISOString() } },
          { upsert: true }
        );
        await cleanupCmsRemovedMedia(currentSettings.cmsConfig, nextCms);
        const syncVersion = await bumpSyncVersion(db, 'cms');
        return NextResponse.json({ ok: true, syncVersion });
      }

      case 'updateExamRoutineItem': {
        const params = payload as unknown as {
          examId: string;
          routineItem: ExamRoutineItem;
          previousSlot?: { className: string; sectionName?: string; subjectId: string };
          syncExaminerAssignment?: boolean;
        };
        const examsCol = db.collection<Exam>(COLLECTIONS.EXAMS);
        const exam = await examsCol.findOne({ id: params.examId });
        if (!exam) return NextResponse.json({ error: 'Exam not found.' }, { status: 404 });

        const currentRoutine = exam.examRoutine || [];
        const existingRoutine = currentRoutine.find((r) => r.id === params.routineItem.id);
        const updatedRoutine = existingRoutine
          ? currentRoutine.map((r) => (r.id === params.routineItem.id ? params.routineItem : r))
          : [...currentRoutine, params.routineItem];

        let updatedExaminers = exam.examinerAssignments || [];
        if (params.syncExaminerAssignment !== false) {
          const prev = params.previousSlot || existingRoutine;
          if (
            prev &&
            (prev.className !== params.routineItem.className ||
              (prev.sectionName || 'Common') !== (params.routineItem.sectionName || 'Common') ||
              prev.subjectId !== params.routineItem.subjectId)
          ) {
            const prevSec = prev.sectionName || 'Common';
            updatedExaminers = updatedExaminers.filter(
              (a) =>
                !(
                  a.className === prev.className &&
                  a.sectionName === prevSec &&
                  a.subjectId === prev.subjectId
                )
            );
          }

          if (params.routineItem.inspectorTeacherId) {
            const sec = params.routineItem.sectionName || 'Common';
            const existingExamIdx = updatedExaminers.findIndex(
              (a) =>
                a.className === params.routineItem.className &&
                a.sectionName === sec &&
                a.subjectId === params.routineItem.subjectId
            );
            const nextAssignment: ExaminerAssignment = {
              id: existingExamIdx >= 0 ? updatedExaminers[existingExamIdx].id : `exm-${uidSuffix()}`,
              examId: params.examId,
              className: params.routineItem.className,
              sectionName: sec,
              subjectId: params.routineItem.subjectId,
              teacherId: params.routineItem.inspectorTeacherId,
              deadline: params.routineItem.entryDeadline,
              assignedAt: new Date().toISOString().slice(0, 10),
            };
            updatedExaminers =
              existingExamIdx >= 0
                ? updatedExaminers.map((a, i) => (i === existingExamIdx ? nextAssignment : a))
                : [...updatedExaminers, nextAssignment];
          }
        }

        await examsCol.updateOne(
          { id: params.examId },
          { $set: { examRoutine: updatedRoutine, examinerAssignments: updatedExaminers } }
        );
        const syncVersion = await bumpSyncVersion(db, 'exams');
        return NextResponse.json({ ok: true, syncVersion });
      }

      case 'sendMarksToTabulation': {
        const examId = String(payload.examId || '');
        const subjectId = payload.subjectId ? String(payload.subjectId) : undefined;
        const className = payload.className ? String(payload.className) : undefined;
        const sectionName = payload.sectionName ? String(payload.sectionName) : undefined;

        const query: Record<string, unknown> = { examId };
        if (subjectId) query.subjectId = subjectId;

        if (className || (sectionName && sectionName !== 'ALL' && sectionName !== 'Common')) {
          const stuQuery: Record<string, unknown> = {};
          if (className) stuQuery.className = className;
          if (sectionName && sectionName !== 'ALL' && sectionName !== 'Common') {
            stuQuery.sectionName = sectionName;
          }
          const matchingStudents = await db
            .collection<StoredStudent>(COLLECTIONS.STUDENTS)
            .find(stuQuery, { projection: { id: 1 } })
            .toArray();
          query.studentId = { $in: matchingStudents.map((s) => s.id) };
        }

        const now = new Date().toISOString();
        await db.collection<MarkEntry>(COLLECTIONS.MARK_ENTRIES).updateMany(query, {
          $set: { isSentToTabulation: true, sentToTabulationAt: now },
        });
        const syncVersion = await bumpSyncVersion(db, 'mark_entries');
        return NextResponse.json({ ok: true, syncVersion });
      }

      case 'bulkSendMarksToTabulation': {
        const examId = String(payload.examId || '');
        const now = new Date().toISOString();
        await db.collection<MarkEntry>(COLLECTIONS.MARK_ENTRIES).updateMany(
          { examId },
          { $set: { isSentToTabulation: true, sentToTabulationAt: now } }
        );
        const syncVersion = await bumpSyncVersion(db, 'mark_entries');
        return NextResponse.json({ ok: true, syncVersion });
      }

      case 'recallMarksFromTabulation': {
        const examId = String(payload.examId || '');
        const subjectId = payload.subjectId ? String(payload.subjectId) : undefined;
        const className = payload.className ? String(payload.className) : undefined;
        const sectionName = payload.sectionName ? String(payload.sectionName) : undefined;

        const query: Record<string, unknown> = { examId };
        if (subjectId) query.subjectId = subjectId;

        if (className || (sectionName && sectionName !== 'ALL' && sectionName !== 'Common')) {
          const stuQuery: Record<string, unknown> = {};
          if (className) stuQuery.className = className;
          if (sectionName && sectionName !== 'ALL' && sectionName !== 'Common') {
            stuQuery.sectionName = sectionName;
          }
          const matchingStudents = await db
            .collection<StoredStudent>(COLLECTIONS.STUDENTS)
            .find(stuQuery, { projection: { id: 1 } })
            .toArray();
          query.studentId = { $in: matchingStudents.map((s) => s.id) };
        }

        await db.collection<MarkEntry>(COLLECTIONS.MARK_ENTRIES).updateMany(query, {
          $set: { isSentToTabulation: false },
        });
        const syncVersion = await bumpSyncVersion(db, 'mark_entries');
        return NextResponse.json({ ok: true, syncVersion });
      }

      case 'saveExamTabulation': {
        const examId = String(payload.examId || '');
        const savedTabulation = payload.savedTabulation as SavedTabulationRecord;
        if (!examId || !savedTabulation || !Array.isArray(savedTabulation.records)) {
          return NextResponse.json({ error: 'Missing examId or savedTabulation data.' }, { status: 400 });
        }
        const examsCol = db.collection<Exam>(COLLECTIONS.EXAMS);
        const existingExam = await examsCol.findOne({ id: examId });
        if (!existingExam) return NextResponse.json({ error: 'Exam not found.' }, { status: 404 });

        await examsCol.updateOne(
          { id: examId },
          { $set: { savedTabulation } }
        );

        if (existingExam.status === 'Published') {
          const pubCol = db.collection<ExamResultRecord>(COLLECTIONS.PUBLISHED_RESULTS);
          await pubCol.deleteMany({ examId });
          if (savedTabulation.records.length > 0) {
            await pubCol.insertMany(savedTabulation.records);
          }
        }

        const syncVersion = await bumpSyncVersion(db, 'exams');
        return NextResponse.json({ ok: true, syncVersion });
      }

      case 'toggleAdmissionBadge':
      case 'toggleResultsBadge':
      case 'toggleEmergencyAlert': {
        const currentSettings = await ensureSettingsDoc(db);
        const nextCms = { ...currentSettings.cmsConfig };
        if (action === 'toggleAdmissionBadge') nextCms.isAdmissionOpen = !nextCms.isAdmissionOpen;
        if (action === 'toggleResultsBadge') nextCms.isResultsPublished = !nextCms.isResultsPublished;
        if (action === 'toggleEmergencyAlert') nextCms.isEmergencyAlert = !nextCms.isEmergencyAlert;
        await settingsCol.updateOne(
          { _id: 'primary' },
          { $set: { cmsConfig: nextCms, updatedAt: new Date().toISOString() } }
        );
        const syncVersion = await bumpSyncVersion(db, 'cms');
        return NextResponse.json({ ok: true, syncVersion });
      }

      case 'updateInstituteRules': {
        const currentSettings = await ensureSettingsDoc(db);
        const updates = (payload.updates || {}) as Partial<InstituteRules>;
        const nextRules: InstituteRules = {
          ...currentSettings.instituteRules,
          ...updates,
        };
        if (updates.shiftPeriodTemplates) {
          (['Morning', 'Day'] as ShiftType[]).forEach((sh) => {
            if (nextRules.shiftPeriodTemplates[sh]) {
              nextRules.shiftPeriodTemplates[sh] = nextRules.shiftPeriodTemplates[sh].map((slot) => ({
                ...slot,
                startTime: formatTime12h(slot.startTime),
                endTime: formatTime12h(slot.endTime),
              }));
            }
          });
        }
        await settingsCol.updateOne(
          { _id: 'primary' },
          { $set: { instituteRules: nextRules, updatedAt: new Date().toISOString() } }
        );
        const syncVersion = await bumpSyncVersion(db, 'rules');
        return NextResponse.json({ ok: true, syncVersion });
      }

      case 'syncSchoolAcademicYearToClasses': {
        const activeYear = String(payload.activeYear || '').trim();
        const currentSettings = await ensureSettingsDoc(db);
        const nextYear = activeYear || currentSettings.instituteRules.activeAcademicYear;
        await settingsCol.updateOne(
          { _id: 'primary' },
          { $set: { 'instituteRules.activeAcademicYear': nextYear, updatedAt: new Date().toISOString() } }
        );
        const classes = await db.collection<AcademicClass>(COLLECTIONS.ACADEMIC_CLASSES).find({}).toArray();
        for (const cls of classes) {
          if (!isCollegeClassName(cls.name)) {
            await db.collection(COLLECTIONS.ACADEMIC_CLASSES).updateOne(
              { id: cls.id },
              { $set: { activeCycle: nextYear, cycleType: 'Academic Year' } }
            );
          }
        }
        const syncVersion = await bumpSyncVersion(db, 'academics');
        return NextResponse.json({ ok: true, syncVersion });
      }

      case 'syncCollegeSessionsToClasses': {
        const hscYear1Session = String(payload.hscYear1Session || '').trim();
        const hscYear2Session = String(payload.hscYear2Session || '').trim();
        const currentSettings = await ensureSettingsDoc(db);
        const y1 = hscYear1Session || currentSettings.instituteRules.hscYear1Session || currentSettings.instituteRules.activeCollegeSession;
        const y2 = hscYear2Session || currentSettings.instituteRules.hscYear2Session || y1;
        await settingsCol.updateOne(
          { _id: 'primary' },
          {
            $set: {
              'instituteRules.hscYear1Session': y1,
              'instituteRules.hscYear2Session': y2,
              'instituteRules.activeCollegeSession': y1,
              updatedAt: new Date().toISOString(),
            },
          }
        );
        const classes = await db.collection<AcademicClass>(COLLECTIONS.ACADEMIC_CLASSES).find({}).toArray();
        for (const cls of classes) {
          if (isCollegeClassName(cls.name)) {
            await db.collection(COLLECTIONS.ACADEMIC_CLASSES).updateOne(
              { id: cls.id },
              { $set: { activeCycle: isHscYear2ClassName(cls.name) ? y2 : y1, cycleType: 'Academic Session' } }
            );
          }
        }
        const syncVersion = await bumpSyncVersion(db, 'academics');
        return NextResponse.json({ ok: true, syncVersion });
      }

      case 'updateAdmissionFormConfig': {
        const currentSettings = await ensureSettingsDoc(db);
        const nextCfg = { ...currentSettings.admissionFormConfig, ...(payload.updates as Partial<AdmissionFormConfig>) };
        await settingsCol.updateOne(
          { _id: 'primary' },
          { $set: { admissionFormConfig: nextCfg, updatedAt: new Date().toISOString() } }
        );
        const syncVersion = await bumpSyncVersion(db, 'admissions');
        return NextResponse.json({ ok: true, syncVersion });
      }

      case 'updateMfsConfig': {
        const currentSettings = await ensureSettingsDoc(db);
        const nextCfg = { ...currentSettings.mfsConfig, ...(payload.updates as Partial<MfsGatewayConfig>) };
        await settingsCol.updateOne(
          { _id: 'primary' },
          { $set: { mfsConfig: nextCfg, updatedAt: new Date().toISOString() } }
        );
        const syncVersion = await bumpSyncVersion(db, 'settings');
        return NextResponse.json({ ok: true, syncVersion });
      }

      case 'updateSmsConfig': {
        const currentSettings = await ensureSettingsDoc(db);
        const nextCfg = { ...currentSettings.smsConfig, ...(payload.updates as Partial<SmsGatewayConfig>) };
        await settingsCol.updateOne(
          { _id: 'primary' },
          { $set: { smsConfig: nextCfg, updatedAt: new Date().toISOString() } }
        );
        const syncVersion = await bumpSyncVersion(db, 'settings');
        return NextResponse.json({ ok: true, syncVersion });
      }

      case 'addNotice': {
        const n = (payload.notice || {}) as Partial<Notice> & Omit<Notice, 'id' | 'publishDate'>;
        const created: Notice = {
          ...n,
          id: resolveClientOrGeneratedId(n.id, 'not'),
          attachmentUrl: sanitizeSafeUrl(n.attachmentUrl),
          publishDate: new Date().toLocaleDateString('en-US', {
            month: 'short',
            day: '2-digit',
            year: 'numeric',
          }),
        };
        await db.collection<Notice>(COLLECTIONS.NOTICES).insertOne(created);
        const syncVersion = await bumpSyncVersion(db, 'notices');
        return NextResponse.json({ ok: true, data: created, syncVersion });
      }

      case 'deleteNotice': {
        const id = String(payload.id || '').trim();
        const existing = await db.collection<Notice>(COLLECTIONS.NOTICES).findOne({ id });
        await db.collection(COLLECTIONS.NOTICES).deleteOne({ id });
        if (existing) {
          await destroyManyCloudinaryAssets(collectNoticeMediaEntries(existing));
        }
        const syncVersion = await bumpSyncVersion(db, 'notices');
        return NextResponse.json({ ok: true, syncVersion });
      }

      case 'addAcademicEvent': {
        const ev = (payload.event || {}) as Partial<AcademicEvent> & Omit<AcademicEvent, 'id'>;
        const created: AcademicEvent = {
          ...ev,
          id: resolveClientOrGeneratedId(ev.id, 'evt'),
        };
        await db.collection<AcademicEvent>(COLLECTIONS.EVENTS).insertOne(created);
        const syncVersion = await bumpSyncVersion(db, 'events');
        return NextResponse.json({ ok: true, data: created, syncVersion });
      }

      case 'updateAcademicEvent': {
        const id = String(payload.id || '').trim();
        await db.collection(COLLECTIONS.EVENTS).updateOne({ id }, { $set: payload.updates as Partial<AcademicEvent> });
        const syncVersion = await bumpSyncVersion(db, 'events');
        return NextResponse.json({ ok: true, syncVersion });
      }

      case 'deleteAcademicEvent': {
        const id = String(payload.id || '').trim();
        await db.collection(COLLECTIONS.EVENTS).deleteOne({ id });
        const syncVersion = await bumpSyncVersion(db, 'events');
        return NextResponse.json({ ok: true, syncVersion });
      }

      case 'addAcademicClass': {
        const clsData = payload.cls as Partial<AcademicClass> & Omit<AcademicClass, 'id'>;
        const cleanName = String(clsData?.name || '').trim();
        if (!cleanName) return NextResponse.json({ error: 'Class name is required.' }, { status: 400 });
        const classesCol = db.collection<AcademicClass>(COLLECTIONS.ACADEMIC_CLASSES);
        const existing = await classesCol.find({}).toArray();
        if (existing.some((c) => c.name.trim().toLowerCase() === cleanName.toLowerCase())) {
          return NextResponse.json({ ok: false, data: null, error: 'Class already exists.' });
        }
        const newCls: AcademicClass = {
          ...clsData,
          name: cleanName,
          id: resolveClientOrGeneratedId(clsData.id, 'cls'),
        };
        await classesCol.insertOne(newCls);
        const syncVersion = await bumpSyncVersion(db, 'academics');
        return NextResponse.json({ ok: true, data: newCls, syncVersion });
      }

      case 'updateAcademicClass': {
        const id = String(payload.id || '').trim();
        const updates = (payload.updates || {}) as Partial<AcademicClass>;
        const classesCol = db.collection<AcademicClass>(COLLECTIONS.ACADEMIC_CLASSES);
        const existing = await classesCol.findOne({ id });
        if (!existing) return NextResponse.json({ ok: false, data: false });
        const nextName = (updates.name ?? existing.name).trim();
        const all = await classesCol.find({}).toArray();
        if (all.some((c) => c.id !== id && c.name.trim().toLowerCase() === nextName.toLowerCase())) {
          return NextResponse.json({ ok: false, data: false, error: 'Class name already exists.' });
        }
        const oldName = existing.name;
        await classesCol.updateOne({ id }, { $set: { ...updates, name: nextName } });
        if (oldName !== nextName) {
          await Promise.all([
            db.collection(COLLECTIONS.STUDENTS).updateMany({ className: oldName }, { $set: { className: nextName } }),
            db.collection(COLLECTIONS.SUBJECTS).updateMany({ classLevel: oldName }, { $set: { classLevel: nextName } }),
            db.collection(COLLECTIONS.CLASS_ROUTINES).updateMany({ className: oldName }, { $set: { className: nextName } }),
            db.collection(COLLECTIONS.INVOICES).updateMany({ className: oldName }, { $set: { className: nextName } }),
            db.collection(COLLECTIONS.ADMISSIONS).updateMany({ grade: oldName }, { $set: { grade: nextName } }),
            db.collection(COLLECTIONS.ADMISSIONS).updateMany({ assignedClass: oldName }, { $set: { assignedClass: nextName } }),
          ]);
        }
        const syncVersion = await bumpSyncVersion(db, 'academics');
        return NextResponse.json({ ok: true, data: true, syncVersion });
      }

      case 'deleteAcademicClass': {
        const id = String(payload.id || '').trim();
        await db.collection(COLLECTIONS.ACADEMIC_CLASSES).deleteOne({ id });
        const syncVersion = await bumpSyncVersion(db, 'academics');
        return NextResponse.json({ ok: true, syncVersion });
      }

      case 'addSubject': {
        const sub = payload.subject as Partial<Subject> & Omit<Subject, 'id'>;
        const subjectsCol = db.collection<Subject>(COLLECTIONS.SUBJECTS);
        const existing = await subjectsCol.find({ classLevel: sub.classLevel }).toArray();
        if (existing.some((s) => s.code.trim().toLowerCase() === sub.code.trim().toLowerCase())) {
          return NextResponse.json({ ok: false, data: null });
        }
        const maxOrder = existing.reduce(
          (max, s) => (typeof s.order === 'number' && s.order > max ? s.order : max),
          0
        );
        const created: Subject = {
          ...sub,
          order: typeof sub.order === 'number' && Number.isFinite(sub.order) ? sub.order : maxOrder + 1,
          id: resolveClientOrGeneratedId(sub.id, `sub-${sub.code}`),
        };
        await subjectsCol.insertOne(created);
        const syncVersion = await bumpSyncVersion(db, 'subjects');
        return NextResponse.json({ ok: true, data: created, syncVersion });
      }

      case 'updateSubject': {
        const id = String(payload.id || '').trim();
        const updates = (payload.updates || {}) as Partial<Subject>;
        const subjectsCol = db.collection<Subject>(COLLECTIONS.SUBJECTS);
        const existing = await subjectsCol.findOne({ id });
        if (!existing) return NextResponse.json({ ok: false, data: false });
        const nextClass = updates.classLevel ?? existing.classLevel;
        const nextCode = (updates.code ?? existing.code).trim().toLowerCase();
        const classSubs = await subjectsCol.find({ classLevel: nextClass }).toArray();
        if (classSubs.some((s) => s.id !== id && s.code.trim().toLowerCase() === nextCode)) {
          return NextResponse.json({ ok: false, data: false });
        }
        await subjectsCol.updateOne({ id }, { $set: updates });
        const syncVersion = await bumpSyncVersion(db, 'subjects');
        return NextResponse.json({ ok: true, data: true, syncVersion });
      }

      case 'cloneSubjectsToClass': {
        const sourceClass = String(payload.sourceClass || '');
        const targetClass = String(payload.targetClass || '');
        if (!sourceClass || !targetClass || sourceClass === targetClass) {
          return NextResponse.json({ ok: true, data: 0 });
        }
        const subjectsCol = db.collection<Subject>(COLLECTIONS.SUBJECTS);
        const [sourceSubs, targetSubs, targetClsObj] = await Promise.all([
          subjectsCol.find({ classLevel: sourceClass }).toArray(),
          subjectsCol.find({ classLevel: targetClass }).toArray(),
          db.collection<AcademicClass>(COLLECTIONS.ACADEMIC_CLASSES).findOne({ name: targetClass }),
        ]);
        const existingCodes = new Set(targetSubs.map((s) => s.code.trim().toLowerCase()));
        const toInsert: Subject[] = [];
        sourceSubs.forEach((sub, idx) => {
          if (existingCodes.has(sub.code.trim().toLowerCase())) return;
          const cleanSub = stripMongoDoc(sub as unknown as Record<string, unknown>) as unknown as Subject;
          const isNoGroup = targetClsObj && targetClsObj.hasGroups === false;
          const validGroup = isNoGroup ? 'General' : cleanSub.group;
          toInsert.push({
            ...cleanSub,
            id: `sub-${cleanSub.code}-${uidSuffix()}-${idx}`,
            classLevel: targetClass,
            group: validGroup,
            applicableGroups: isNoGroup ? ['General'] : cleanSub.applicableGroups?.length ? [...cleanSub.applicableGroups] : [validGroup],
          });
        });
        if (toInsert.length > 0) await subjectsCol.insertMany(toInsert);
        const syncVersion = await bumpSyncVersion(db, 'subjects');
        return NextResponse.json({ ok: true, data: toInsert.length, syncVersion });
      }

      case 'bulkAddSubjects': {
        const classLevel = String(payload.classLevel || '');
        const items = Array.isArray(payload.items) ? (payload.items as Array<Omit<Subject, 'id' | 'classLevel'>>) : [];
        if (!classLevel || items.length === 0) return NextResponse.json({ ok: true, data: 0 });
        const subjectsCol = db.collection<Subject>(COLLECTIONS.SUBJECTS);
        const [targetSubs, targetClsObj] = await Promise.all([
          subjectsCol.find({ classLevel }).toArray(),
          db.collection<AcademicClass>(COLLECTIONS.ACADEMIC_CLASSES).findOne({ name: classLevel }),
        ]);
        const existingCodes = new Set(targetSubs.map((s) => s.code.trim().toLowerCase()));
        let nextOrder = targetSubs.reduce(
          (max, s) => (typeof s.order === 'number' && s.order > max ? s.order : max),
          0
        );
        const toInsert: Subject[] = [];
        items.forEach((sub, idx) => {
          const ck = sub.code.trim().toLowerCase();
          if (!ck || existingCodes.has(ck)) return;
          existingCodes.add(ck);
          nextOrder += 1;
          const isNoGroup = targetClsObj && targetClsObj.hasGroups === false;
          const validGroup = isNoGroup ? 'General' : sub.group;
          toInsert.push({
            ...sub,
            order: typeof sub.order === 'number' && Number.isFinite(sub.order) ? sub.order : nextOrder,
            id: `sub-${sub.code}-${uidSuffix()}-${idx}`,
            classLevel,
            group: validGroup,
            applicableGroups: isNoGroup ? ['General'] : sub.applicableGroups?.length ? [...sub.applicableGroups] : [validGroup],
          });
        });
        if (toInsert.length > 0) await subjectsCol.insertMany(toInsert);
        const syncVersion = await bumpSyncVersion(db, 'subjects');
        return NextResponse.json({ ok: true, data: toInsert.length, syncVersion });
      }

      case 'deleteSubject': {
        const id = String(payload.id || '').trim();
        await db.collection(COLLECTIONS.SUBJECTS).deleteOne({ id });
        const syncVersion = await bumpSyncVersion(db, 'subjects');
        return NextResponse.json({ ok: true, syncVersion });
      }

      case 'saveClassRoutine': {
        const r = payload.routineDay as ClassRoutineDay;
        const targetGroup = r.group || 'All';
        const normalized: ClassRoutineDay = {
          ...r,
          id: r.id || `cr-${r.className}-${targetGroup}-${r.sectionName}-${r.shift}-${r.day}`,
          group: targetGroup,
        };
        await db.collection<ClassRoutineDay>(COLLECTIONS.CLASS_ROUTINES).updateOne(
          {
            className: normalized.className,
            group: targetGroup,
            sectionName: normalized.sectionName,
            shift: normalized.shift,
            day: normalized.day,
          },
          { $set: normalized },
          { upsert: true }
        );
        const syncVersion = await bumpSyncVersion(db, 'routines');
        return NextResponse.json({ ok: true, syncVersion });
      }

      case 'copyClassRoutineDay': {
        const params = payload as unknown as {
          className: string;
          group?: AcademicGroup | 'All';
          sectionName: string;
          shift: ShiftType;
          periods: ClassRoutineDay['periods'];
          targetDays: string[];
        };
        const targetGroup = params.group || 'All';
        const col = db.collection<ClassRoutineDay>(COLLECTIONS.CLASS_ROUTINES);
        for (const day of params.targetDays || []) {
          const record: ClassRoutineDay = {
            id: `cr-${params.className}-${targetGroup}-${params.sectionName}-${params.shift}-${day}`,
            className: params.className,
            group: targetGroup,
            sectionName: params.sectionName,
            shift: params.shift,
            day,
            periods: params.periods || [],
          };
          await col.updateOne(
            {
              className: params.className,
              group: targetGroup,
              sectionName: params.sectionName,
              shift: params.shift,
              day,
            },
            { $set: record },
            { upsert: true }
          );
        }
        const syncVersion = await bumpSyncVersion(db, 'routines');
        return NextResponse.json({ ok: true, syncVersion });
      }

      case 'addTeacher': {
        const t = (payload.teacher || {}) as Partial<Teacher> & Omit<Teacher, 'id'>;
        const col = db.collection<StoredTeacher>(COLLECTIONS.TEACHERS);
        const [settings, existingTeachers] = await Promise.all([
          ensureSettingsDoc(db),
          col
            .find(
              {},
              { projection: { id: 1, employeeId: 1, rankOrder: 1, staffCategory: 1 } }
            )
            .toArray(),
        ]);

        const staffCategory = normalizeTeacherCategory(t.staffCategory);
        const requestedRank =
          typeof t.rankOrder === 'number' && Number.isFinite(t.rankOrder) && t.rankOrder >= 1
            ? Math.floor(t.rankOrder)
            : getNextRankOrderForCategory(existingTeachers, staffCategory, settings.instituteRules);

        const customId = typeof t.employeeId === 'string' ? t.employeeId.trim() : '';
        let resolvedEmployeeId = customId;
        if (resolvedEmployeeId) {
          const duplicate = existingTeachers.some(
            (item) => (item.employeeId || '').trim().toLowerCase() === resolvedEmployeeId.toLowerCase()
          );
          if (duplicate) {
            return NextResponse.json(
              { error: `Teacher / Staff ID "${resolvedEmployeeId}" is already assigned.` },
              { status: 400 }
            );
          }
        } else {
          resolvedEmployeeId = getNextUniqueTeacherOrStaffId(
            existingTeachers,
            staffCategory,
            requestedRank,
            settings.instituteRules
          ).employeeId;
        }

        const now = new Date().toISOString();
        const plainPass =
          (typeof t.password === 'string' && t.password.trim()) || generateSixDigitPinValue();
        const systemPinEnc = /^\d{6}$/.test(plainPass) ? encryptAdminPin(plainPass) : '';

        const created: StoredTeacher = {
          ...t,
          id: resolveClientOrGeneratedId(t.id, 't'),
          staffCategory,
          rankOrder: requestedRank,
          employeeId: resolvedEmployeeId,
          banglaName: typeof t.banglaName === 'string' && t.banglaName.trim() ? t.banglaName.trim() : undefined,
          department: typeof t.department === 'string' ? t.department.trim() : '',
          avatarUrl: sanitizeSafeUrl(t.avatarUrl),
          signatureUrl: sanitizeSafeUrl(t.signatureUrl),
          password: '',
          passwordHash: hashPassword(plainPass),
          systemPinEnc,
          createdAt: now,
          updatedAt: now,
        };
        delete (created as unknown as Record<string, unknown>).systemPin;

        await col.insertOne(created);
        const syncVersion = await bumpSyncVersion(db, 'teachers');
        return NextResponse.json({
          ok: true,
          data: sanitizeTeacherOut(created, 'admin'),
          syncVersion,
        });
      }

      case 'updateTeacher': {
        const id = String(payload.id || '').trim();
        const updates = (payload.updates || {}) as Partial<Teacher>;
        const col = db.collection<StoredTeacher>(COLLECTIONS.TEACHERS);
        const existing = await col.findOne({ id });
        if (!existing) return NextResponse.json({ error: 'Staff profile not found.' }, { status: 404 });

        const patch: Partial<StoredTeacher> = {
          ...updates,
          updatedAt: new Date().toISOString(),
        };
        delete patch.id;
        delete patch.createdAt;
        delete (patch as Record<string, unknown>).systemPin;
        delete (patch as Record<string, unknown>).systemPinEnc;

        if ('staffCategory' in updates && updates.staffCategory) {
          patch.staffCategory = normalizeTeacherCategory(updates.staffCategory);
        }
        if ('rankOrder' in updates) {
          patch.rankOrder =
            typeof updates.rankOrder === 'number' &&
            Number.isFinite(updates.rankOrder) &&
            updates.rankOrder >= 1
              ? Math.floor(updates.rankOrder)
              : undefined;
        }
        if ('banglaName' in updates) {
          patch.banglaName =
            typeof updates.banglaName === 'string' && updates.banglaName.trim()
              ? updates.banglaName.trim()
              : undefined;
        }
        if ('department' in updates) {
          patch.department =
            typeof updates.department === 'string' ? updates.department.trim() : '';
        }
        if ('employeeId' in updates && typeof updates.employeeId === 'string') {
          const nextEmpId = updates.employeeId.trim();
          if (nextEmpId) {
            const conflict = await col.findOne({
              id: { $ne: id },
              employeeId: { $regex: `^${escapeRegex(nextEmpId)}$`, $options: 'i' },
            });
            if (conflict) {
              return NextResponse.json(
                { error: `Teacher / Staff ID "${nextEmpId}" is already in use.` },
                { status: 400 }
              );
            }
            patch.employeeId = nextEmpId;
          } else {
            delete patch.employeeId;
          }
        }
        if ('avatarUrl' in updates) patch.avatarUrl = sanitizeSafeUrl(updates.avatarUrl);
        if ('signatureUrl' in updates) patch.signatureUrl = sanitizeSafeUrl(updates.signatureUrl);
        if (typeof updates.password === 'string' && updates.password.trim()) {
          const trimmedPass = updates.password.trim();
          patch.passwordHash = hashPassword(trimmedPass);
          patch.systemPinEnc = /^\d{6}$/.test(trimmedPass) ? encryptAdminPin(trimmedPass) : '';
        }
        delete patch.password;

        await col.updateOne({ id }, { $set: patch });

        // Cleanup old replaced/removed Cloudinary images
        const toDestroy: Array<{ publicId?: string | null; url?: string | null }> = [];
        const oldAvatarPid = existing.avatarPublicId || extractCloudinaryPublicId(existing.avatarUrl);
        const nextAvatarUrl = 'avatarUrl' in updates ? patch.avatarUrl : existing.avatarUrl;
        const nextAvatarPid = 'avatarPublicId' in updates ? patch.avatarPublicId : extractCloudinaryPublicId(nextAvatarUrl);
        if (oldAvatarPid && oldAvatarPid !== nextAvatarPid) {
          toDestroy.push({ publicId: oldAvatarPid });
        }

        const oldSigPid = existing.signaturePublicId || extractCloudinaryPublicId(existing.signatureUrl);
        const nextSigUrl = 'signatureUrl' in updates ? patch.signatureUrl : existing.signatureUrl;
        const nextSigPid = 'signaturePublicId' in updates ? patch.signaturePublicId : extractCloudinaryPublicId(nextSigUrl);
        if (oldSigPid && oldSigPid !== nextSigPid) {
          toDestroy.push({ publicId: oldSigPid });
        }

        if (toDestroy.length > 0) await destroyManyCloudinaryAssets(toDestroy);

        const syncVersion = await bumpSyncVersion(db, 'teachers');
        return NextResponse.json({ ok: true, syncVersion });
      }

      case 'deleteTeacher': {
        const id = String(payload.id || '').trim();
        const col = db.collection<StoredTeacher>(COLLECTIONS.TEACHERS);
        const existing = await col.findOne({ id });
        await col.deleteOne({ id });
        if (existing) {
          await destroyManyCloudinaryAssets(collectTeacherMediaEntries(existing));
        }
        const syncVersion = await bumpSyncVersion(db, 'teachers');
        return NextResponse.json({ ok: true, syncVersion });
      }

      case 'addStudent': {
        const s = (payload.student || {}) as Partial<Student> & Omit<Student, 'id' | 'systemId'>;
        const col = db.collection<StoredStudent>(COLLECTIONS.STUDENTS);
        const [settings, allStudents] = await Promise.all([
          ensureSettingsDoc(db),
          col
            .find(
              {},
              {
                projection: {
                  id: 1,
                  systemId: 1,
                  className: 1,
                  group: 1,
                  sectionName: 1,
                  shift: 1,
                  batchCycle: 1,
                  rollNumber: 1,
                  status: 1,
                },
              }
            )
            .toArray(),
        ]);

        const prefix = settings.instituteRules?.studentIdPrefix || 'AG';
        const manualSystemId =
          typeof s.systemId === 'string'
            ? s.systemId.replace(/[\s-]/g, '').trim().toUpperCase()
            : '';
        if (manualSystemId) {
          const duplicateId = allStudents.some(
            (x) => (x.systemId || '').replace(/[\s-]/g, '').trim().toUpperCase() === manualSystemId
          );
          if (duplicateId) {
            return NextResponse.json(
              { error: `Student ID "${manualSystemId}" already exists.` },
              { status: 400 }
            );
          }
        }

        const resolvedSection = (s.sectionName || 'Common').trim() || 'Common';
        const resolvedGroup = s.group || 'General';
        const resolvedShift = s.shift || 'Morning';
        const resolvedBatch = (s.batchCycle || '').trim();

        const cohortStudents = allStudents.filter(
          (x) =>
            x.status !== 'Alumni' &&
            x.status !== 'Graduated' &&
            x.className === s.className &&
            (x.group || 'General') === resolvedGroup &&
            (x.sectionName || 'Common') === resolvedSection &&
            (x.shift || 'Morning') === resolvedShift &&
            (!resolvedBatch || !x.batchCycle || x.batchCycle.trim() === resolvedBatch)
        );
        const maxRoll = cohortStudents.reduce((m, x) => Math.max(m, x.rollNumber), 0);
        const targetRoll = Number(s.rollNumber) > 0 ? Number(s.rollNumber) : maxRoll + 1;

        if (cohortStudents.some((x) => x.rollNumber === targetRoll)) {
          return NextResponse.json(
            {
              error: `Roll #${targetRoll} already exists in ${s.className} (${resolvedGroup}, Section ${resolvedSection}, ${resolvedShift} Shift).`,
            },
            { status: 400 }
          );
        }

        const phoneNorm = s.phone ? normalizeBdMobileInput(String(s.phone)) : '';
        const fatherPhoneNorm = s.fatherPhone ? normalizeBdMobileInput(String(s.fatherPhone)) : '';
        const motherPhoneNorm = s.motherPhone ? normalizeBdMobileInput(String(s.motherPhone)) : '';
        const guardianPhoneNorm = s.guardianPhone ? normalizeBdMobileInput(String(s.guardianPhone)) : '';

        if (phoneNorm && !isValidBdMobile(phoneNorm)) {
          return NextResponse.json({ error: 'Invalid Primary Mobile number format (expected 01[3-9]XXXXXXXX).' }, { status: 400 });
        }
        if (fatherPhoneNorm && !isValidBdMobile(fatherPhoneNorm)) {
          return NextResponse.json({ error: 'Invalid Father Mobile number format.' }, { status: 400 });
        }
        if (motherPhoneNorm && !isValidBdMobile(motherPhoneNorm)) {
          return NextResponse.json({ error: 'Invalid Mother Mobile number format.' }, { status: 400 });
        }
        if (guardianPhoneNorm && !isValidBdMobile(guardianPhoneNorm)) {
          return NextResponse.json({ error: 'Invalid Local Guardian Mobile number format.' }, { status: 400 });
        }
        if (s.birthRegOrNid && !isValidBdBirthReg(String(s.birthRegOrNid))) {
          return NextResponse.json({ error: 'Birth Registration number must be 17 digits.' }, { status: 400 });
        }
        if (s.fatherNid && !isValidBdNid(String(s.fatherNid))) {
          return NextResponse.json({ error: 'Father NID must be 10, 13, or 17 digits.' }, { status: 400 });
        }
        if (s.motherNid && !isValidBdNid(String(s.motherNid))) {
          return NextResponse.json({ error: 'Mother NID must be 10, 13, or 17 digits.' }, { status: 400 });
        }

        const now = new Date().toISOString();
        const plainPass = (s.password && s.password.trim()) || generateSixDigitPin();
        const academicYr = s.batchCycle || settings.instituteRules?.activeAcademicYear || new Date().getFullYear();
        const created: StoredStudent = {
          ...s,
          id: resolveClientOrGeneratedId(s.id, 'stu'),
          systemId: manualSystemId || getNextStudentSystemIdFromList(allStudents, prefix, academicYr),
          rollNumber: targetRoll,
          sectionName: resolvedSection,
          group: resolvedGroup,
          shift: resolvedShift,
          dateOfBirth: normalizeStudentDobToIso(s.dateOfBirth),
          phone: phoneNorm,
          fatherPhone: fatherPhoneNorm || undefined,
          motherPhone: motherPhoneNorm || undefined,
          guardianPhone: guardianPhoneNorm || undefined,
          avatarUrl: sanitizeSafeUrl(s.avatarUrl),
          password: '',
          passwordHash: hashPassword(plainPass),
          systemPinEnc: encryptAdminPin(plainPass),
          createdAt: now,
          updatedAt: now,
        };
        await col.insertOne(created);
        const syncVersion = await bumpSyncVersion(db, 'students');
        return NextResponse.json({ ok: true, data: sanitizeStudentOut(created, 'admin'), syncVersion });
      }

      case 'bulkAddStudents': {
        const rows = Array.isArray(payload.rows) ? (payload.rows as Array<Omit<Student, 'id' | 'systemId'>>) : [];
        const col = db.collection<StoredStudent>(COLLECTIONS.STUDENTS);
        const [settings, allStudents] = await Promise.all([
          ensureSettingsDoc(db),
          col.find({}, { projection: { systemId: 1 } }).toArray(),
        ]);
        const prefix = settings.instituteRules?.studentIdPrefix || 'AG';
        const academicYr = settings.instituteRules?.activeAcademicYear || new Date().getFullYear();
        const now = new Date().toISOString();
        const created: StoredStudent[] = [];
        const workingStudents: Array<{ systemId?: string }> = [...allStudents];
        for (let idx = 0; idx < rows.length; idx++) {
          const row = rows[idx];
          const pin = (row.password && row.password.trim()) || generateSixDigitPin();
          const generatedSysId = getNextStudentSystemIdFromList(workingStudents, prefix, academicYr);
          workingStudents.push({ systemId: generatedSysId });
          created.push({
            ...row,
            id: `stu-${uidSuffix()}-${idx}`,
            systemId: generatedSysId,
            rollNumber: row.rollNumber || idx + 1,
            avatarUrl: sanitizeSafeUrl(row.avatarUrl),
            password: '',
            passwordHash: hashPassword(pin),
            systemPinEnc: encryptAdminPin(pin),
            createdAt: now,
            updatedAt: now,
          });
        }
        if (created.length > 0) await col.insertMany(created);
        const syncVersion = await bumpSyncVersion(db, 'students');
        return NextResponse.json({ ok: true, data: created.length, syncVersion });
      }

      case 'updateStudent': {
        const id = String(payload.id || '').trim();
        const updates = (payload.updates || {}) as Partial<Student>;
        const col = db.collection<StoredStudent>(COLLECTIONS.STUDENTS);
        const existing = await col.findOne({ id });
        if (!existing) return NextResponse.json({ error: 'Student not found.' }, { status: 404 });

        let normalizedNextSysId: string | undefined;
        if (typeof updates.systemId === 'string' && updates.systemId.replace(/[\s-]/g, '').trim()) {
          normalizedNextSysId = updates.systemId.replace(/[\s-]/g, '').trim().toUpperCase();
          if (
            normalizedNextSysId !==
            (existing.systemId || '').replace(/[\s-]/g, '').trim().toUpperCase()
          ) {
            const otherStudents = await col
              .find({ id: { $ne: id } }, { projection: { systemId: 1 } })
              .toArray();
            const dup = otherStudents.some(
              (other) =>
                (other.systemId || '').replace(/[\s-]/g, '').trim().toUpperCase() ===
                normalizedNextSysId
            );
            if (dup) {
              return NextResponse.json(
                { error: `Student ID "${normalizedNextSysId}" already exists.` },
                { status: 400 }
              );
            }
          }
        }

        const nextClass = updates.className ?? existing.className;
        const nextGroup = updates.group ?? existing.group ?? 'General';
        const nextSection = (updates.sectionName ?? existing.sectionName ?? 'Common').trim() || 'Common';
        const nextShift = updates.shift ?? existing.shift ?? 'Morning';
        const nextRoll = updates.rollNumber !== undefined ? Number(updates.rollNumber) : existing.rollNumber;
        const nextStatus = updates.status ?? existing.status;

        if (nextStatus !== 'Alumni' && nextStatus !== 'Graduated' && nextRoll > 0) {
          const nextBatch = (updates.batchCycle ?? existing.batchCycle ?? '').trim();
          const rollCollision = await col.findOne({
            id: { $ne: id },
            status: { $nin: ['Alumni', 'Graduated'] },
            className: nextClass,
            group: nextGroup,
            sectionName: nextSection,
            shift: nextShift,
            rollNumber: nextRoll,
            ...(nextBatch ? { $or: [{ batchCycle: nextBatch }, { batchCycle: { $exists: false } }, { batchCycle: '' }] } : {}),
          });
          if (rollCollision) {
            return NextResponse.json(
              {
                error: `Roll #${nextRoll} already exists in ${nextClass} (${nextGroup}, Section ${nextSection}, ${nextShift} Shift).`,
              },
              { status: 400 }
            );
          }
        }

        if (updates.phone && !isValidBdMobile(String(updates.phone))) {
          return NextResponse.json({ error: 'Invalid Primary Mobile number format.' }, { status: 400 });
        }
        if (updates.fatherPhone && !isValidBdMobile(String(updates.fatherPhone))) {
          return NextResponse.json({ error: 'Invalid Father Mobile number format.' }, { status: 400 });
        }
        if (updates.motherPhone && !isValidBdMobile(String(updates.motherPhone))) {
          return NextResponse.json({ error: 'Invalid Mother Mobile number format.' }, { status: 400 });
        }
        if (updates.guardianPhone && !isValidBdMobile(String(updates.guardianPhone))) {
          return NextResponse.json({ error: 'Invalid Local Guardian Mobile number format.' }, { status: 400 });
        }
        if (updates.birthRegOrNid && !isValidBdBirthReg(String(updates.birthRegOrNid))) {
          return NextResponse.json({ error: 'Birth Registration number must be 17 digits.' }, { status: 400 });
        }
        if (updates.fatherNid && !isValidBdNid(String(updates.fatherNid))) {
          return NextResponse.json({ error: 'Father NID must be 10, 13, or 17 digits.' }, { status: 400 });
        }
        if (updates.motherNid && !isValidBdNid(String(updates.motherNid))) {
          return NextResponse.json({ error: 'Mother NID must be 10, 13, or 17 digits.' }, { status: 400 });
        }

        const patch: Partial<StoredStudent> = {
          ...updates,
          ...(normalizedNextSysId ? { systemId: normalizedNextSysId } : {}),
          updatedAt: new Date().toISOString(),
        };
        delete patch.id;
        delete patch.createdAt;
        if ('dateOfBirth' in updates && updates.dateOfBirth !== undefined) {
          patch.dateOfBirth = normalizeStudentDobToIso(updates.dateOfBirth);
        }
        if ('phone' in updates && typeof updates.phone === 'string') {
          patch.phone = normalizeBdMobileInput(updates.phone);
        }
        if ('fatherPhone' in updates && typeof updates.fatherPhone === 'string') {
          patch.fatherPhone = updates.fatherPhone.trim() ? normalizeBdMobileInput(updates.fatherPhone) : '';
        }
        if ('motherPhone' in updates && typeof updates.motherPhone === 'string') {
          patch.motherPhone = updates.motherPhone.trim() ? normalizeBdMobileInput(updates.motherPhone) : '';
        }
        if ('guardianPhone' in updates && typeof updates.guardianPhone === 'string') {
          patch.guardianPhone = updates.guardianPhone.trim() ? normalizeBdMobileInput(updates.guardianPhone) : '';
        }
        if ('avatarUrl' in updates) patch.avatarUrl = sanitizeSafeUrl(updates.avatarUrl);
        if (typeof updates.password === 'string' && updates.password.trim()) {
          const nextPin = updates.password.trim();
          patch.passwordHash = hashPassword(nextPin);
          patch.systemPinEnc = encryptAdminPin(nextPin);
        }
        delete patch.password;
        delete patch.systemPin;

        await col.updateOne({ id }, { $set: patch });

        // Cleanup old Cloudinary portrait if replaced or removed
        const oldPid = existing.avatarPublicId || extractCloudinaryPublicId(existing.avatarUrl);
        const nextUrl = 'avatarUrl' in updates ? patch.avatarUrl : existing.avatarUrl;
        const nextPid = 'avatarPublicId' in updates ? patch.avatarPublicId : extractCloudinaryPublicId(nextUrl);
        if (oldPid && oldPid !== nextPid) {
          await destroyCloudinaryAsset(oldPid);
        }

        const syncVersion = await bumpSyncVersion(db, 'students');
        return NextResponse.json({ ok: true, data: sanitizeStudentOut({ ...existing, ...patch } as StoredStudent, 'admin'), syncVersion });
      }

      case 'deleteStudent': {
        const id = String(payload.id || '').trim();
        const col = db.collection<StoredStudent>(COLLECTIONS.STUDENTS);
        const existing = await col.findOne({ id });
        await col.deleteOne({ id });
        if (existing) {
          await destroyManyCloudinaryAssets(collectStudentMediaEntries(existing));
        }
        const syncVersion = await bumpSyncVersion(db, 'students');
        return NextResponse.json({ ok: true, syncVersion });
      }

      case 'promoteStudents': {
        const studentIds = Array.isArray(payload.studentIds) ? (payload.studentIds as string[]) : [];
        const targetClass = String(payload.targetClass || '');
        const targetSection = String(payload.targetSection || '');
        const col = db.collection<StoredStudent>(COLLECTIONS.STUDENTS);
        const [settings, targetClsObj, allStudents] = await Promise.all([
          ensureSettingsDoc(db),
          db.collection<AcademicClass>(COLLECTIONS.ACADEMIC_CLASSES).findOne({ name: targetClass }),
          col.find({}).toArray(),
        ]);
        const nextCycle = resolveDefaultBatchCycle(targetClass, settings.instituteRules, targetClsObj || undefined);
        let maxRoll = allStudents
          .filter(
            (s) =>
              !studentIds.includes(s.id) &&
              s.status === 'Active' &&
              s.className === targetClass &&
              (!targetSection || s.sectionName === targetSection)
          )
          .reduce((m, s) => Math.max(m, s.rollNumber), 0);

        for (const sid of studentIds) {
          const s = allStudents.find((x) => x.id === sid);
          if (!s) continue;
          maxRoll += 1;
          await col.updateOne(
            { id: sid },
            {
              $set: {
                className: targetClass,
                sectionName: targetSection || s.sectionName,
                rollNumber: maxRoll,
                batchCycle: nextCycle,
                status: 'Active',
                updatedAt: new Date().toISOString(),
              },
            }
          );
        }
        const syncVersion = await bumpSyncVersion(db, 'students');
        return NextResponse.json({ ok: true, syncVersion });
      }

      case 'graduateStudents': {
        const studentIds = Array.isArray(payload.studentIds) ? (payload.studentIds as string[]) : [];
        const graduatedYear = String(payload.graduatedYear || '').trim();
        const graduatedWing = payload.graduatedWing === 'HSC' ? 'HSC' : 'SSC';
        const settings = await ensureSettingsDoc(db);
        const yearVal = graduatedYear || settings.instituteRules.activeAcademicYear || '2025';
        await db.collection<StoredStudent>(COLLECTIONS.STUDENTS).updateMany(
          { id: { $in: studentIds } },
          {
            $set: {
              status: 'Alumni',
              graduatedYear: yearVal,
              graduatedWing,
              updatedAt: new Date().toISOString(),
            },
          }
        );
        const syncVersion = await bumpSyncVersion(db, 'students');
        return NextResponse.json({ ok: true, syncVersion });
      }

      case 'bulkUpdateStudentSubjects': {
        const updates = Array.isArray(payload.updates)
          ? (payload.updates as Array<{
              studentId: string;
              electiveSubjectIds: string[];
              optionalFourthSubjectId: string;
            }>)
          : [];
        const col = db.collection<StoredStudent>(COLLECTIONS.STUDENTS);
        for (const u of updates) {
          const fourth = u.optionalFourthSubjectId || '';
          const cleanElectives = (u.electiveSubjectIds || []).filter((id) => id !== fourth);
          const updateOp: Record<string, unknown> = {
            $set: {
              electiveSubjectIds: cleanElectives,
              updatedAt: new Date().toISOString(),
              ...(fourth ? { optionalFourthSubjectId: fourth } : {}),
            },
          };
          if (!fourth) {
            updateOp.$unset = { optionalFourthSubjectId: '' };
          }
          await col.updateOne({ id: u.studentId }, updateOp);
        }
        const syncVersion = await bumpSyncVersion(db, 'students');
        return NextResponse.json({ ok: true, syncVersion });
      }

      case 'approveStudentUpdate': {
        const id = String(payload.id || '').trim();
        const selectedFields = Array.isArray(payload.selectedFields)
          ? (payload.selectedFields as Array<keyof Student>)
          : undefined;
        const col = db.collection<StoredStudent>(COLLECTIONS.STUDENTS);
        const existing = await col.findOne({ id });
        if (!existing || !existing.updateRequest) {
          return NextResponse.json({ error: 'Pending update request not found.' }, { status: 404 });
        }

        const patch: Partial<StoredStudent> = {};
        if (selectedFields && selectedFields.length > 0) {
          for (const key of selectedFields) {
            if (key in existing.updateRequest) {
              (patch as Record<string, unknown>)[key] = existing.updateRequest[key];
            }
          }
          if ('avatarUrl' in patch && existing.updateRequest.avatarPublicId) {
            patch.avatarPublicId = existing.updateRequest.avatarPublicId;
          }
        } else {
          Object.assign(patch, existing.updateRequest);
        }
        if (patch.presentAddress && !patch.address) {
          patch.address = patch.presentAddress;
        }
        delete patch.password;

        await col.updateOne(
          { id },
          {
            $set: {
              ...patch,
              updateRequestStatus: 'Approved',
              updatedAt: new Date().toISOString(),
            },
            $unset: { updateRequest: '', updateRequestRejectionReason: '' },
          }
        );

        const oldActivePid = existing.avatarPublicId || extractCloudinaryPublicId(existing.avatarUrl);
        const pendingPid =
          existing.updateRequest.avatarPublicId ||
          extractCloudinaryPublicId(existing.updateRequest.avatarUrl);

        if ('avatarUrl' in patch) {
          if (oldActivePid && oldActivePid !== (patch.avatarPublicId || extractCloudinaryPublicId(patch.avatarUrl))) {
            await destroyCloudinaryAsset(oldActivePid);
          }
        } else if (pendingPid && pendingPid !== oldActivePid) {
          // Admin unchecked the photo during selective approval -> delete unused pending Cloudinary asset
          await destroyCloudinaryAsset(pendingPid);
        }

        const syncVersion = await bumpSyncVersion(db, 'students');
        return NextResponse.json({ ok: true, syncVersion });
      }

      case 'rejectStudentUpdate': {
        const id = String(payload.id || '').trim();
        const reason = typeof payload.reason === 'string' ? payload.reason.trim() : undefined;
        const col = db.collection<StoredStudent>(COLLECTIONS.STUDENTS);
        const existing = await col.findOne({ id });
        if (!existing) return NextResponse.json({ ok: true });

        const oldActivePid = existing.avatarPublicId || extractCloudinaryPublicId(existing.avatarUrl);
        const pendingPid =
          existing.updateRequest?.avatarPublicId ||
          extractCloudinaryPublicId(existing.updateRequest?.avatarUrl);

        await col.updateOne(
          { id },
          {
            $set: {
              updateRequestStatus: 'Rejected',
              ...(reason ? { updateRequestRejectionReason: reason } : {}),
              updatedAt: new Date().toISOString(),
            },
            $unset: { updateRequest: '' },
          }
        );

        if (pendingPid && pendingPid !== oldActivePid) {
          await destroyCloudinaryAsset(pendingPid);
        }

        const syncVersion = await bumpSyncVersion(db, 'students');
        return NextResponse.json({ ok: true, syncVersion });
      }

      case 'bulkImportAdmissions': {
        const items = Array.isArray(payload.items) ? (payload.items as Array<Partial<AdmissionApplication>>) : [];
        const col = db.collection<AdmissionApplication>(COLLECTIONS.ADMISSIONS);
        const count = await col.countDocuments();
        const created: AdmissionApplication[] = items.map((data, idx) => {
          const name = String(data.applicantName || 'Candidate').trim();
          const parts = name.split(/\s+/);
          return {
            id: `app-${uidSuffix()}-${idx}`,
            applicantName: name,
            applicantInitials: parts.slice(0, 2).map((p) => p[0]?.toUpperCase() || '').join('') || 'NA',
            applicationCode: `APP-${8901 + count + idx}`,
            grade: String(data.grade || 'Class 6'),
            appliedTime: 'CSV Import',
            score: String(data.score || 'Under Review'),
            status: 'Under Review',
            gender: data.gender === 'Female' ? 'Female' : 'Male',
            fatherName: data.fatherName,
            motherName: data.motherName,
            phone: data.phone,
            religionGroup: data.religionGroup,
            group: data.group,
          };
        });
        if (created.length > 0) await col.insertMany(created);
        const syncVersion = await bumpSyncVersion(db, 'admissions');
        return NextResponse.json({ ok: true, data: created.length, syncVersion });
      }

      case 'updateAdmissionApplication': {
        const id = String(payload.id || '').trim();
        await db.collection(COLLECTIONS.ADMISSIONS).updateOne({ id }, { $set: payload.updates as Partial<AdmissionApplication> });
        const syncVersion = await bumpSyncVersion(db, 'admissions');
        return NextResponse.json({ ok: true, syncVersion });
      }

      case 'updateAdmissionStatus': {
        const id = String(payload.id || '').trim();
        const status = payload.status as AdmissionApplication['status'];
        await db.collection(COLLECTIONS.ADMISSIONS).updateOne({ id }, { $set: { status } });
        const syncVersion = await bumpSyncVersion(db, 'admissions');
        return NextResponse.json({ ok: true, syncVersion });
      }

      case 'deleteAdmissionApplication': {
        const id = String(payload.id || '').trim();
        await db.collection(COLLECTIONS.ADMISSIONS).deleteOne({ id });
        const syncVersion = await bumpSyncVersion(db, 'admissions');
        return NextResponse.json({ ok: true, syncVersion });
      }

      case 'admitApplicantToClass': {
        const params = payload as unknown as {
          applicationId: string;
          className: string;
          sectionName: string;
          shift: ShiftType;
          group: AcademicGroup;
          rollNumber: number;
          systemId?: string;
        };
        const appCol = db.collection<AdmissionApplication>(COLLECTIONS.ADMISSIONS);
        const app = await appCol.findOne({ id: params.applicationId });
        if (!app) return NextResponse.json({ error: 'Application not found.' }, { status: 404 });

        const [subjects, allStudents, settings, clsObj] = await Promise.all([
          db.collection<Subject>(COLLECTIONS.SUBJECTS).find({}).toArray(),
          db.collection<StoredStudent>(COLLECTIONS.STUDENTS).find({}, { projection: { systemId: 1, className: 1, sectionName: 1, rollNumber: 1 } }).toArray(),
          ensureSettingsDoc(db),
          db.collection<AcademicClass>(COLLECTIONS.ACADEMIC_CLASSES).findOne({ name: params.className }),
        ]);

        const studentGender = app.gender || 'Male';
        const eligiblePool = subjects.filter(
          (s) =>
            s.classLevel === params.className &&
            !s.isCompulsory &&
            !s.excludeFromGpa &&
            subjectAppliesToGroup(s, params.group) &&
            isStudentGenderEligibleForSubject(s, studentGender)
        );
        const fourthId =
          eligiblePool.find((s) => s.canBeFourthSubject)?.id ||
          subjects.find((s) => s.canBeFourthSubject && isStudentGenderEligibleForSubject(s, studentGender))?.id;
        const defaultMain = eligiblePool.find((s) => s.id !== fourthId);

        const now = new Date().toISOString();
        const admitPin = generateSixDigitPin();
        const academicYr = settings.instituteRules?.activeAcademicYear || new Date().getFullYear();
        const manualSystemId =
          typeof params.systemId === 'string'
            ? params.systemId.replace(/[\s-]/g, '').trim().toUpperCase()
            : '';
        if (manualSystemId) {
          const duplicateId = allStudents.some(
            (x) => (x.systemId || '').replace(/[\s-]/g, '').trim().toUpperCase() === manualSystemId
          );
          if (duplicateId) {
            return NextResponse.json(
              { error: `Student ID "${manualSystemId}" already exists.` },
              { status: 400 }
            );
          }
        }
        const assignedSystemId =
          manualSystemId ||
          getNextStudentSystemIdFromList(
            allStudents,
            settings.instituteRules?.studentIdPrefix || 'AG',
            academicYr
          );

        const newStudent: StoredStudent = {
          id: `stu-${uidSuffix()}`,
          systemId: assignedSystemId,
          rollNumber: params.rollNumber || 1,
          fullName: app.applicantName,
          gender: studentGender,
          fatherName: app.fatherName || 'Guardian On File',
          motherName: app.motherName || 'Guardian On File',
          dateOfBirth: '2010-01-01',
          className: params.className,
          sectionName: params.sectionName,
          group: params.group,
          shift: params.shift,
          religionGroup: app.religionGroup || 'Islam',
          batchCycle: resolveDefaultBatchCycle(params.className, settings.instituteRules, clsObj || undefined),
          electiveSubjectIds: defaultMain ? [defaultMain.id] : [],
          optionalFourthSubjectId: fourthId,
          status: 'Active',
          avatarUrl: '',
          phone: app.phone || '',
          address: '',
          registrationNumber: `REG-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 8999)}`,
          password: '',
          passwordHash: hashPassword(admitPin),
          systemPinEnc: encryptAdminPin(admitPin),
          createdAt: now,
          updatedAt: now,
        };

        await db.collection<StoredStudent>(COLLECTIONS.STUDENTS).insertOne(newStudent);
        await appCol.updateOne(
          { id: params.applicationId },
          {
            $set: {
              status: 'Admitted',
              assignedClass: params.className,
              assignedSection: params.sectionName,
              assignedRoll: params.rollNumber,
            },
          }
        );
        const syncVersion = await bumpSyncVersion(db, 'admissions');
        return NextResponse.json({ ok: true, data: sanitizeStudentOut(newStudent, 'admin'), syncVersion });
      }

      case 'createExam': {
        const exam = payload.exam as Partial<Exam> & Omit<Exam, 'id'>;
        const created: Exam = {
          ...exam,
          marksheetBgUrl:
            exam.marksheetBgUrl !== undefined ? sanitizeSafeUrl(exam.marksheetBgUrl) : '',
          signatories: Array.isArray(exam.signatories)
            ? exam.signatories.map((s) => ({
                ...s,
                signatureImgUrl: s.signatureImgUrl ? sanitizeSafeUrl(s.signatureImgUrl) : '',
              }))
            : [],
          examinerAssignments: exam.examinerAssignments || [],
          id: exam.id && String(exam.id).trim() ? String(exam.id).trim() : `exam-${uidSuffix()}`,
        };
        await db.collection<Exam>(COLLECTIONS.EXAMS).insertOne(created);
        const syncVersion = await bumpSyncVersion(db, 'exams');
        return NextResponse.json({ ok: true, data: created, syncVersion });
      }

      case 'updateExam': {
        const id = String(payload.id || '').trim();
        const rawUpdates = (payload.updates || {}) as Partial<Exam>;
        const updates: Partial<Exam> = {
          ...rawUpdates,
          ...(rawUpdates.marksheetBgUrl !== undefined
            ? { marksheetBgUrl: sanitizeSafeUrl(rawUpdates.marksheetBgUrl) }
            : {}),
          ...(Array.isArray(rawUpdates.signatories)
            ? {
                signatories: rawUpdates.signatories.map((s) => ({
                  ...s,
                  signatureImgUrl: s.signatureImgUrl ? sanitizeSafeUrl(s.signatureImgUrl) : '',
                })),
              }
            : {}),
        };
        const examsCol = db.collection<Exam>(COLLECTIONS.EXAMS);
        const existing = await examsCol.findOne({ id });
        if (!existing) return NextResponse.json({ error: 'Exam not found.' }, { status: 404 });

        const nextExam: Exam = {
          ...(stripMongoDoc(existing as unknown as Record<string, unknown>) as unknown as Exam),
          ...updates,
        };
        // Publish strictly from savedTabulation snapshot when transitioning to Published
        if (updates.status === 'Published') {
          const savedRecords = nextExam.savedTabulation?.records || [];
          if (savedRecords.length === 0) {
            return NextResponse.json(
              { error: 'Please save the Official Tabulation Snapshot first before publishing results.' },
              { status: 400 }
            );
          }
          await examsCol.updateOne({ id }, { $set: updates });
          await cleanupExamRemovedMedia(existing, nextExam);
          const pubCol = db.collection<ExamResultRecord>(COLLECTIONS.PUBLISHED_RESULTS);
          await pubCol.deleteMany({ examId: id });
          await pubCol.insertMany(savedRecords);
        } else {
          await examsCol.updateOne({ id }, { $set: updates });
          await cleanupExamRemovedMedia(existing, nextExam);
        }

        const syncVersion = await bumpSyncVersion(db, 'exams');
        return NextResponse.json({ ok: true, syncVersion });
      }

      case 'deleteExam': {
        const id = String(payload.id || '').trim();
        if (!id) return NextResponse.json({ error: 'Exam ID required.' }, { status: 400 });
        const examsCol = db.collection<Exam>(COLLECTIONS.EXAMS);
        const existing = await examsCol.findOne({ id });
        if (existing) {
          await examsCol.deleteOne({ id });
          await db.collection<MarkEntry>(COLLECTIONS.MARK_ENTRIES).deleteMany({ examId: id });
          await db.collection<ExamResultRecord>(COLLECTIONS.PUBLISHED_RESULTS).deleteMany({ examId: id });
          await cleanupExamRemovedMedia(existing, null);
        }
        const syncVersion = await bumpSyncVersion(db, 'exams');
        return NextResponse.json({ ok: true, syncVersion });
      }

      case 'setExaminerAssignment': {
        const params = payload as unknown as {
          examId: string;
          className: string;
          sectionName: string;
          subjectId: string;
          teacherId: string;
          deadline?: string;
        };
        const examsCol = db.collection<Exam>(COLLECTIONS.EXAMS);
        const exam = await examsCol.findOne({ id: params.examId });
        if (!exam) return NextResponse.json({ error: 'Exam not found.' }, { status: 404 });

        const sec = params.sectionName || 'Common';
        const current = exam.examinerAssignments || [];
        const existingIdx = current.findIndex(
          (a) => a.className === params.className && a.sectionName === sec && a.subjectId === params.subjectId
        );

        let nextList: ExaminerAssignment[];
        if (!params.teacherId) {
          nextList = existingIdx >= 0 ? current.filter((_, i) => i !== existingIdx) : current;
        } else {
          const nextItem: ExaminerAssignment = {
            id: existingIdx >= 0 ? current[existingIdx].id : `exm-${uidSuffix()}`,
            examId: params.examId,
            className: params.className,
            sectionName: sec,
            subjectId: params.subjectId,
            teacherId: params.teacherId,
            deadline: params.deadline,
            assignedAt: new Date().toISOString().slice(0, 10),
          };
          nextList =
            existingIdx >= 0
              ? current.map((a, i) => (i === existingIdx ? nextItem : a))
              : [...current, nextItem];
        }

        await examsCol.updateOne({ id: params.examId }, { $set: { examinerAssignments: nextList } });
        const syncVersion = await bumpSyncVersion(db, 'exams');
        return NextResponse.json({ ok: true, syncVersion });
      }

      case 'removeExaminerAssignment': {
        const examId = String(payload.examId || '');
        const assignmentId = String(payload.assignmentId || '');
        const examsCol = db.collection<Exam>(COLLECTIONS.EXAMS);
        const exam = await examsCol.findOne({ id: examId });
        if (exam) {
          await examsCol.updateOne(
            { id: examId },
            {
              $set: {
                examinerAssignments: (exam.examinerAssignments || []).filter((a) => a.id !== assignmentId),
              },
            }
          );
        }
        const syncVersion = await bumpSyncVersion(db, 'exams');
        return NextResponse.json({ ok: true, syncVersion });
      }

      case 'lockExamRoster':
      case 'unlockExamRoster': {
        const examId = String(payload.examId || '');
        const subjectId = String(payload.subjectId || '');
        await db.collection<MarkEntry>(COLLECTIONS.MARK_ENTRIES).updateMany(
          { examId, subjectId },
          { $set: { isLocked: action === 'lockExamRoster' } }
        );
        const syncVersion = await bumpSyncVersion(db, 'mark_entries');
        return NextResponse.json({ ok: true, syncVersion });
      }

      case 'createInvoice': {
        const params = payload as unknown as { studentId: string; month: string; totalPayable: number };
        const stu = await db.collection<StoredStudent>(COLLECTIONS.STUDENTS).findOne({ id: params.studentId });
        if (!stu) return NextResponse.json({ error: 'Student not found.' }, { status: 404 });
        const [allInvoices, settings, clsObj] = await Promise.all([
          db.collection<StudentInvoice>(COLLECTIONS.INVOICES).find({}, { projection: { invoiceNo: 1 } }).toArray(),
          ensureSettingsDoc(db),
          db.collection<AcademicClass>(COLLECTIONS.ACADEMIC_CLASSES).findOne({ name: stu.className }),
        ]);
        const newInv: StudentInvoice = {
          id: `inv-${uidSuffix()}`,
          invoiceNo: getNextInvoiceNoFromList(allInvoices),
          studentId: stu.id,
          studentName: stu.fullName,
          rollNumber: stu.rollNumber,
          className: stu.className,
          sectionName: stu.sectionName,
          month: params.month,
          academicYear: resolveDefaultBatchCycle(stu.className, settings.instituteRules, clsObj || undefined),
          totalPayable: Number(params.totalPayable || 0),
          paidAmount: 0,
          status: 'Unpaid',
        };
        await db.collection<StudentInvoice>(COLLECTIONS.INVOICES).insertOne(newInv);
        const syncVersion = await bumpSyncVersion(db, 'invoices');
        return NextResponse.json({ ok: true, data: newInv, syncVersion });
      }

      case 'generateBulkInvoices': {
        const className = String(payload.className || 'ALL');
        const month = String(payload.month || '');
        const amount = Number(payload.amount || 0);
        const filter: Record<string, unknown> = { status: 'Active' };
        if (className !== 'ALL') filter.className = className;
        const [targets, existingInvoices, settings, classes] = await Promise.all([
          db.collection<StoredStudent>(COLLECTIONS.STUDENTS).find(filter).toArray(),
          db.collection<StudentInvoice>(COLLECTIONS.INVOICES).find({}).toArray(),
          ensureSettingsDoc(db),
          db.collection<AcademicClass>(COLLECTIONS.ACADEMIC_CLASSES).find({}).toArray(),
        ]);

        const toInsert: StudentInvoice[] = [];
        for (const stu of targets) {
          const exists = existingInvoices.some(
            (i) => i.studentId === stu.id && i.month.toLowerCase() === month.toLowerCase()
          );
          if (exists) continue;
          const clsObj = classes.find((c) => c.name === stu.className);
          toInsert.push({
            id: `inv-${uidSuffix()}-${toInsert.length}`,
            invoiceNo: getNextInvoiceNoFromList(existingInvoices, toInsert.length),
            studentId: stu.id,
            studentName: stu.fullName,
            rollNumber: stu.rollNumber,
            className: stu.className,
            sectionName: stu.sectionName,
            month,
            academicYear: resolveDefaultBatchCycle(stu.className, settings.instituteRules, clsObj),
            totalPayable: amount,
            paidAmount: 0,
            status: 'Unpaid',
          });
        }
        if (toInsert.length > 0) await db.collection<StudentInvoice>(COLLECTIONS.INVOICES).insertMany(toInsert);
        const syncVersion = await bumpSyncVersion(db, 'invoices');
        return NextResponse.json({ ok: true, data: toInsert.length, syncVersion });
      }

      case 'sendSmsBroadcast': {
        const newLog: SmsLog = {
          id: `sms-${uidSuffix()}`,
          recipientGroup: String(payload.recipientGroup || ''),
          recipientCount: Number(payload.recipientCount || 0),
          message: String(payload.message || ''),
          sentAt: new Date().toISOString().replace('T', ' ').slice(0, 16),
          status: 'Delivered',
        };
        await db.collection<SmsLog>(COLLECTIONS.SMS_LOGS).insertOne(newLog);
        const syncVersion = await bumpSyncVersion(db, 'sms_logs');
        return NextResponse.json({ ok: true, data: newLog, syncVersion });
      }

      case 'addAdminUser': {
        if (session?.role !== 'Admin') {
          return NextResponse.json({ error: 'Only Super Admin may create admin users.' }, { status: 403 });
        }
        const u = (payload.user || {}) as Partial<AdminUserAccount> & Omit<AdminUserAccount, 'id'>;
        const username = String(u.username || '').trim();
        const password = String(u.password || '').trim();
        if (!username || password.length < 4) {
          return NextResponse.json({ error: 'Username and password (min 4 chars) required.' }, { status: 400 });
        }
        const now = new Date().toISOString();
        const created: StoredAdminUser = {
          id: resolveClientOrGeneratedId(u.id, 'adm'),
          username,
          fullName: String(u.fullName || username).trim(),
          role: u.role || 'Institute Manager',
          active: u.active !== false,
          password: '',
          passwordHash: hashPassword(password),
          createdAt: now,
          updatedAt: now,
        };
        await db.collection<StoredAdminUser>(COLLECTIONS.ADMIN_USERS).insertOne(created);
        const syncVersion = await bumpSyncVersion(db, 'admin_users');
        return NextResponse.json({ ok: true, data: sanitizeAdminUserOut(created), syncVersion });
      }

      case 'updateAdminUser': {
        if (session?.role !== 'Admin') {
          return NextResponse.json({ error: 'Only Super Admin may update admin users.' }, { status: 403 });
        }
        const id = String(payload.id || '').trim();
        const updates = (payload.updates || {}) as Partial<AdminUserAccount>;
        const adminCol = db.collection<StoredAdminUser>(COLLECTIONS.ADMIN_USERS);
        const targetUser = await adminCol.findOne({ id });
        if (!targetUser) {
          return NextResponse.json({ error: 'Admin account not found.' }, { status: 404 });
        }

        const isDeactivating = updates.active === false;
        const isDemoting = Boolean(updates.role && updates.role !== 'Admin');
        if (targetUser.role === 'Admin' && targetUser.active && (isDeactivating || isDemoting)) {
          const activeAdminsCount = await adminCol.countDocuments({ role: 'Admin', active: true });
          if (activeAdminsCount <= 1) {
            return NextResponse.json(
              { error: 'At least one active Super Admin account must remain enabled.' },
              { status: 400 }
            );
          }
        }

        const patch: Partial<StoredAdminUser> = {
          updatedAt: new Date().toISOString(),
        };
        if (typeof updates.fullName === 'string') patch.fullName = updates.fullName.trim();
        if (updates.role) patch.role = updates.role;
        if (typeof updates.active === 'boolean') patch.active = updates.active;
        if (typeof updates.password === 'string' && updates.password.trim()) {
          patch.passwordHash = hashPassword(updates.password.trim());
          patch.password = '';
        }
        await adminCol.updateOne({ id }, { $set: patch });
        const syncVersion = await bumpSyncVersion(db, 'admin_users');
        return NextResponse.json({ ok: true, syncVersion });
      }

      case 'deleteAdminUser': {
        if (session?.role !== 'Admin') {
          return NextResponse.json({ error: 'Only Super Admin may remove admin users.' }, { status: 403 });
        }
        const id = String(payload.id || '').trim();
        if (id === session.userId) {
          return NextResponse.json({ error: 'Cannot delete your own active session account.' }, { status: 400 });
        }
        await db.collection(COLLECTIONS.ADMIN_USERS).deleteOne({ id });
        const syncVersion = await bumpSyncVersion(db, 'admin_users');
        return NextResponse.json({ ok: true, syncVersion });
      }

      case 'seedNctbPresets': {
        const result = await seedNctbPresetsToDb(db);
        return NextResponse.json({ ok: true, data: result });
      }

      case 'resetOperationalData': {
        if (session?.role !== 'Admin') {
          return NextResponse.json({ error: 'Only Super Admin can reset operational data.' }, { status: 403 });
        }
        const includeAcademicStructure = Boolean(payload.includeAcademicStructure);
        const result = await resetOperationalDataInDb(db, includeAcademicStructure);
        return NextResponse.json({ ok: true, data: result });
      }

      default:
        return NextResponse.json({ error: `Unsupported mutation action: ${action}` }, { status: 400 });
    }
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Database mutation failed' },
      { status: 500 }
    );
  }
}
