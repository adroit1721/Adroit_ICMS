import { NextRequest, NextResponse } from 'next/server';
import { COLLECTIONS, getDb } from '@/lib/server/mongodb';
import { Exam, ExamResultRecord, MarkEntry, Subject } from '@/lib/types';
import { StoredStudent, ensureSettingsDoc, stripMongoDoc } from '@/lib/server/erp-repository';
import { compileStudentExamRecord, computeClassAndSectionMeritRanks } from '@/lib/grading-engine';
import { sanitizeMongoInput } from '@/lib/server/security';

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeSectionParam(raw: unknown): string {
  const s = typeof raw === 'string' ? raw.trim() : '';
  if (!s || s === 'Any' || s === 'All') return '';
  return s;
}

export async function POST(req: NextRequest) {
  try {
    const raw = await req.json();
    const body = sanitizeMongoInput(raw) as {
      examId?: unknown;
      searchMode?: unknown;
      studentIdQuery?: unknown;
      rollNumber?: unknown;
      className?: unknown;
      sectionName?: unknown;
    };

    const examId = typeof body.examId === 'string' ? body.examId.trim() : '';
    const studentIdQuery =
      typeof body.studentIdQuery === 'string' ? body.studentIdQuery.trim() : '';
    const searchMode: 'id' | 'class-roll' =
      body.searchMode === 'id' || (body.searchMode !== 'class-roll' && studentIdQuery.length > 0)
        ? 'id'
        : 'class-roll';

    const className = typeof body.className === 'string' ? body.className.trim() : '';
    const sectionName = normalizeSectionParam(body.sectionName);
    const rollNum =
      typeof body.rollNumber === 'number'
        ? body.rollNumber
        : typeof body.rollNumber === 'string'
        ? parseInt(body.rollNumber.trim(), 10)
        : NaN;

    if (!examId) {
      return NextResponse.json(
        { error: 'Please select a published examination.' },
        { status: 400 }
      );
    }

    if (searchMode === 'id' && !studentIdQuery) {
      return NextResponse.json(
        { error: 'Please enter a valid Student ID or Board Registration Number.' },
        { status: 400 }
      );
    }

    if (searchMode === 'class-roll' && (Number.isNaN(rollNum) || rollNum <= 0)) {
      return NextResponse.json(
        { error: 'Please enter a valid numeric Class Roll Number.' },
        { status: 400 }
      );
    }

    const db = await getDb();
    const examDoc = await db.collection<Exam>(COLLECTIONS.EXAMS).findOne({ id: examId });
    if (!examDoc || examDoc.status !== 'Published') {
      return NextResponse.json(
        { error: 'Results for this examination are not published yet.' },
        { status: 404 }
      );
    }

    const cleanExam = stripMongoDoc(examDoc as unknown as Record<string, unknown>);
    const savedRecords = examDoc.savedTabulation?.records || [];

    const buildStudentMeta = (stu?: StoredStudent | null) =>
      stu
        ? {
            avatarUrl: stu.avatarUrl || '',
            banglaName: stu.banglaName || '',
            dateOfBirth: stu.dateOfBirth || '',
          }
        : null;

    // 1. Prefer saved official tabulation snapshot directly (works even if student later promoted/graduated)
    if (savedRecords.length > 0) {
      let matchedSaved: ExamResultRecord | undefined;

      if (searchMode === 'id') {
        const needle = studentIdQuery.toLowerCase();
        matchedSaved = savedRecords.find(
          (r) =>
            (r.systemId || '').trim().toLowerCase() === needle ||
            (r.registrationNumber || '').trim().toLowerCase() === needle ||
            (r.studentId || '').trim().toLowerCase() === needle
        );
      } else {
        matchedSaved = savedRecords.find((r) => {
          if (r.rollNumber !== rollNum) return false;
          if (className && r.className.trim().toLowerCase() !== className.toLowerCase()) {
            return false;
          }
          if (sectionName && r.sectionName.trim().toLowerCase() !== sectionName.toLowerCase()) {
            return false;
          }
          return true;
        });
      }

      if (matchedSaved) {
        const stuDoc = await db
          .collection<StoredStudent>(COLLECTIONS.STUDENTS)
          .findOne({ id: matchedSaved.studentId });
        return NextResponse.json({
          exam: cleanExam,
          result: matchedSaved,
          studentMeta: buildStudentMeta(stuDoc),
        });
      }
    }

    // 2. Fallback: look up student record in Students collection
    let studentDoc: StoredStudent | null = null;
    if (searchMode === 'id') {
      const exactRegex = new RegExp(`^${escapeRegExp(studentIdQuery)}$`, 'i');
      studentDoc = await db.collection<StoredStudent>(COLLECTIONS.STUDENTS).findOne({
        $or: [
          { systemId: exactRegex },
          { registrationNumber: exactRegex },
          { id: studentIdQuery },
        ],
      });
    } else {
      const query: Record<string, unknown> = { rollNumber: rollNum };
      if (className) query.className = className;
      if (sectionName) query.sectionName = sectionName;
      studentDoc = await db.collection<StoredStudent>(COLLECTIONS.STUDENTS).findOne(query);
    }

    if (!studentDoc) {
      return NextResponse.json(
        {
          error:
            searchMode === 'id'
              ? `No examinee found with Student ID / Reg No. "${studentIdQuery}".`
              : `No examinee found for Roll #${rollNum}${className ? ` in ${className}` : ''}${
                  sectionName ? ` (Section ${sectionName})` : ''
                }.`,
        },
        { status: 404 }
      );
    }

    // Check savedRecords again by resolved studentId (handles e.g. archived systemId/reg lookup)
    if (savedRecords.length > 0) {
      const savedById = savedRecords.find(
        (r) => r.studentId === studentDoc!.id || r.systemId === studentDoc!.systemId
      );
      if (savedById) {
        return NextResponse.json({
          exam: cleanExam,
          result: savedById,
          studentMeta: buildStudentMeta(studentDoc),
        });
      }
      return NextResponse.json(
        { error: 'No saved tabulation record found for this student in the published examination.' },
        { status: 404 }
      );
    }

    // 3. Fallback to immutable published snapshot collection
    const snapshot = await db
      .collection<ExamResultRecord>(COLLECTIONS.PUBLISHED_RESULTS)
      .findOne({ examId: examDoc.id, studentId: studentDoc.id });

    if (snapshot) {
      return NextResponse.json({
        exam: cleanExam,
        result: stripMongoDoc(snapshot as unknown as Record<string, unknown>),
        studentMeta: buildStudentMeta(studentDoc),
      });
    }

    // 4. Legacy fallback: compile from mark entries if exam was published before snapshot persistence
    const [settings, subjects, classStudents, marks] = await Promise.all([
      ensureSettingsDoc(db),
      db.collection<Subject>(COLLECTIONS.SUBJECTS).find({}).toArray(),
      db
        .collection<StoredStudent>(COLLECTIONS.STUDENTS)
        .find({ status: 'Active', className: studentDoc.className })
        .toArray(),
      db
        .collection<MarkEntry>(COLLECTIONS.MARK_ENTRIES)
        .find({ examId: examDoc.id })
        .toArray(),
    ]);

    const cleanSubjects = subjects.map(
      (s) => stripMongoDoc(s as unknown as Record<string, unknown>) as unknown as Subject
    );
    const cleanMarks = marks.map(
      (m) => stripMongoDoc(m as unknown as Record<string, unknown>) as unknown as MarkEntry
    );
    const combinePairedPapers = settings.instituteRules.combinePairedPapersInResult ?? true;

    const peerPool = classStudents.some((s) => s.id === studentDoc!.id)
      ? classStudents
      : [...classStudents, studentDoc];
    const compiledPool = peerPool.map((stu) =>
      compileStudentExamRecord(stu, examDoc, cleanSubjects, cleanMarks, {
        combinePairedPapers,
      })
    );
    const rankedPool = computeClassAndSectionMeritRanks(compiledPool);

    const compiled =
      rankedPool.find((r) => r.studentId === studentDoc!.id) ||
      compileStudentExamRecord(studentDoc, examDoc, cleanSubjects, cleanMarks, {
        combinePairedPapers,
      });

    return NextResponse.json({
      exam: cleanExam,
      result: compiled,
      studentMeta: buildStudentMeta(studentDoc),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Result lookup failed' },
      { status: 500 }
    );
  }
}
