import { NextRequest, NextResponse } from 'next/server';
import { COLLECTIONS, getDb } from '@/lib/server/mongodb';
import { Exam, ExamResultRecord, MarkEntry, Subject } from '@/lib/types';
import { StoredStudent, ensureSettingsDoc, stripMongoDoc } from '@/lib/server/erp-repository';
import { compileStudentExamRecord, computeClassAndSectionMeritRanks } from '@/lib/grading-engine';
import { sanitizeMongoInput } from '@/lib/server/security';

export async function POST(req: NextRequest) {

  try {
    const raw = await req.json();
    const body = sanitizeMongoInput(raw) as {
      examId?: unknown;
      rollNumber?: unknown;
      className?: unknown;
      sectionName?: unknown;
      group?: unknown;
    };

    const examId = typeof body.examId === 'string' ? body.examId.trim() : '';
    const className = typeof body.className === 'string' ? body.className.trim() : '';
    const sectionName = typeof body.sectionName === 'string' ? body.sectionName.trim() : 'Any';
    const group = typeof body.group === 'string' ? body.group.trim() : 'Any';
    const rollNum =
      typeof body.rollNumber === 'number'
        ? body.rollNumber
        : typeof body.rollNumber === 'string'
        ? parseInt(body.rollNumber.trim(), 10)
        : NaN;

    if (!examId || Number.isNaN(rollNum) || rollNum <= 0) {
      return NextResponse.json(
        { error: 'Exam ID and a valid numeric Roll Number are required.' },
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

    const query: Record<string, unknown> = { rollNumber: rollNum };
    if (className) query.className = className;
    if (sectionName && sectionName !== 'Any') query.sectionName = sectionName;
    if (group && group !== 'Any') query.group = group;

    const studentDoc = await db.collection<StoredStudent>(COLLECTIONS.STUDENTS).findOne(query);
    if (!studentDoc) {
      return NextResponse.json(
        { error: 'No matching examinee found for the provided Class / Roll criteria.' },
        { status: 404 }
      );
    }

    // Prefer saved official tabulation snapshot on the Exam if present
    const savedRecords = examDoc.savedTabulation?.records;
    if (savedRecords && savedRecords.length > 0) {
      const savedRecord = savedRecords.find(
        (r) => r.studentId === studentDoc.id || r.systemId === studentDoc.systemId
      );
      if (savedRecord) {
        return NextResponse.json({
          exam: stripMongoDoc(examDoc as unknown as Record<string, unknown>),
          result: savedRecord,
        });
      }
      return NextResponse.json(
        { error: 'No saved tabulation record found for this student in the published examination.' },
        { status: 404 }
      );
    }

    // Fallback to immutable published snapshot collection if compiled at publish time
    const snapshot = await db
      .collection<ExamResultRecord>(COLLECTIONS.PUBLISHED_RESULTS)
      .findOne({ examId: examDoc.id, studentId: studentDoc.id });

    if (snapshot) {
      return NextResponse.json({
        exam: stripMongoDoc(examDoc as unknown as Record<string, unknown>),
        result: stripMongoDoc(snapshot as unknown as Record<string, unknown>),
      });
    }

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

    const peerPool = classStudents.some((s) => s.id === studentDoc.id)
      ? classStudents
      : [...classStudents, studentDoc];
    const compiledPool = peerPool.map((stu) =>
      compileStudentExamRecord(stu, examDoc, cleanSubjects, cleanMarks, {
        combinePairedPapers,
      })
    );
    const rankedPool = computeClassAndSectionMeritRanks(compiledPool);

    const compiled =
      rankedPool.find((r) => r.studentId === studentDoc.id) ||
      compileStudentExamRecord(studentDoc, examDoc, cleanSubjects, cleanMarks, {
        combinePairedPapers,
      });

    return NextResponse.json({
      exam: stripMongoDoc(examDoc as unknown as Record<string, unknown>),
      result: compiled,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Result lookup failed' },
      { status: 500 }
    );
  }
}
