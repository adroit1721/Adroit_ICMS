import { NextRequest, NextResponse } from 'next/server';
import { COLLECTIONS, getDb } from '@/lib/server/mongodb';
import { StoredStudent, ensureSettingsDoc, stripMongoDoc } from '@/lib/server/erp-repository';
import { assertTrustedOrigin, sanitizeMongoInput } from '@/lib/server/security';
import { resolveClassIntakeFees, normalizeDobToIso } from '@/lib/server/admission-billing-service';
import { normalizeAcademicCycle } from '@/lib/server/promotion-service';
import { AcademicClass, AdmissionApplication, StudentInvoice } from '@/lib/types';

export async function POST(req: NextRequest) {
  if (!assertTrustedOrigin(req)) {
    return NextResponse.json({ error: 'Untrusted request origin' }, { status: 403 });
  }

  try {
    const raw = await req.json();
    const body = sanitizeMongoInput(raw) as {
      previousYear?: string;
      previousClass?: string;
      previousRoll?: number | string;
      dateOfBirth?: string;
      systemId?: string;
    };

    const previousYear = String(body.previousYear || '').trim();
    const previousClass = String(body.previousClass || '').trim();
    const previousRoll = Number(body.previousRoll || 0);
    const dobNormalized = normalizeDobToIso(body.dateOfBirth);
    const sysIdNormalized = String(body.systemId || '')
      .replace(/[\s-]/g, '')
      .trim()
      .toUpperCase();

    if (!previousClass || !previousRoll || Number.isNaN(previousRoll) || previousRoll <= 0) {
      return NextResponse.json(
        { error: 'Previous Class and Previous Roll Number are required.' },
        { status: 400 }
      );
    }

    if (!dobNormalized && !sysIdNormalized) {
      return NextResponse.json(
        { error: 'Please provide Date of Birth OR Student System ID for verification.' },
        { status: 400 }
      );
    }

    const db = await getDb();
    const studentsCol = db.collection<StoredStudent>(COLLECTIONS.STUDENTS);
    const [candidates, settings, classes] = await Promise.all([
      studentsCol
        .find({
          status: 'Active',
          $or: [
            { className: previousClass, rollNumber: previousRoll },
            {
              'reAdmissionState.sourceClassName': previousClass,
              'reAdmissionState.sourceRollNumber': previousRoll,
            },
          ],
        })
        .toArray(),
      ensureSettingsDoc(db),
      db.collection<AcademicClass>(COLLECTIONS.ACADEMIC_CLASSES).find({}).toArray(),
    ]);

    const normYear = normalizeAcademicCycle(previousYear);

    const matched = candidates.find((stu) => {
      const stuYear = normalizeAcademicCycle(
        stu.reAdmissionState?.sourceAcademicYear || stu.batchCycle
      );
      if (normYear && stuYear && stuYear !== normYear) {
        return false;
      }

      const rollMatch =
        (stu.className === previousClass && stu.rollNumber === previousRoll) ||
        (stu.reAdmissionState?.sourceClassName === previousClass &&
          stu.reAdmissionState?.sourceRollNumber === previousRoll);
      if (!rollMatch) return false;

      if (sysIdNormalized) {
        const cleanStuSys = (stu.systemId || '').replace(/[\s-]/g, '').trim().toUpperCase();
        if (cleanStuSys === sysIdNormalized) return true;
      }

      if (dobNormalized) {
        const stuDob = normalizeDobToIso(stu.dateOfBirth);
        if (stuDob && stuDob === dobNormalized) return true;
      }

      return false;
    });

    if (!matched) {
      return NextResponse.json(
        {
          error:
            'No matching student record found. Check your Previous Class, Roll Number, and Date of Birth / Student ID.',
        },
        { status: 404 }
      );
    }

    const cleanStu = stripMongoDoc(
      matched as unknown as Record<string, unknown>
    ) as unknown as StoredStudent;

    if (!cleanStu.reAdmissionState || cleanStu.reAdmissionState.status === 'None') {
      return NextResponse.json(
        {
          eligible: false,
          error:
            'Promotion status is not marked for Re-admission yet. Please contact the Institute Office.',
          studentSummary: {
            fullName: cleanStu.fullName,
            className: cleanStu.className,
            rollNumber: cleanStu.rollNumber,
            academicYear: cleanStu.batchCycle || settings.instituteRules.activeAcademicYear,
          },
        },
        { status: 200 }
      );
    }

    const targetClassObj = classes.find(
      (c) => c.name === cleanStu.reAdmissionState?.targetClassName
    );
    const intake = resolveClassIntakeFees(targetClassObj, 're-admission', settings.instituteRules);

    let existingApplication: AdmissionApplication | null = null;
    let existingInvoice: StudentInvoice | null = null;

    if (cleanStu.reAdmissionState.applicationId) {
      const rawApp = await db
        .collection<AdmissionApplication>(COLLECTIONS.ADMISSIONS)
        .findOne({ id: cleanStu.reAdmissionState.applicationId });
      if (rawApp) {
        existingApplication = stripMongoDoc(
          rawApp as unknown as Record<string, unknown>
        ) as unknown as AdmissionApplication;
        if (existingApplication.paymentSummary?.invoiceId) {
          const rawInv = await db
            .collection<StudentInvoice>(COLLECTIONS.INVOICES)
            .findOne({ id: existingApplication.paymentSummary.invoiceId });
          if (rawInv) {
            existingInvoice = stripMongoDoc(
              rawInv as unknown as Record<string, unknown>
            ) as unknown as StudentInvoice;
          }
        }
      }
    }

    // Return sanitized pre-fill data (never credentials or PINs)
    const prefill = {
      id: cleanStu.id,
      systemId: cleanStu.systemId,
      fullName: cleanStu.fullName,
      banglaName: cleanStu.banglaName || '',
      gender: cleanStu.gender || 'Male',
      religionGroup: cleanStu.religionGroup || 'Islam',
      dateOfBirth: cleanStu.dateOfBirth || '',
      birthRegOrNid: cleanStu.birthRegOrNid || '',
      bloodGroup: cleanStu.bloodGroup || '',
      phone: cleanStu.phone || '',
      avatarUrl: cleanStu.avatarUrl || '',
      avatarPublicId: cleanStu.avatarPublicId || '',
      fatherName: cleanStu.fatherName || '',
      fatherBanglaName: cleanStu.fatherBanglaName || '',
      fatherNid: cleanStu.fatherNid || '',
      fatherPhone: cleanStu.fatherPhone || '',
      fatherOccupation: cleanStu.fatherOccupation || '',
      motherName: cleanStu.motherName || '',
      motherBanglaName: cleanStu.motherBanglaName || '',
      motherNid: cleanStu.motherNid || '',
      motherPhone: cleanStu.motherPhone || '',
      motherOccupation: cleanStu.motherOccupation || '',
      hasLocalGuardian: Boolean(cleanStu.hasLocalGuardian),
      guardianName: cleanStu.guardianName || '',
      guardianRelation: cleanStu.guardianRelation || '',
      guardianPhone: cleanStu.guardianPhone || '',
      presentAddress: cleanStu.presentAddress || cleanStu.address || '',
      permanentAddress: cleanStu.permanentAddress || '',
      presentAddressDetail: cleanStu.presentAddressDetail,
      permanentAddressDetail: cleanStu.permanentAddressDetail,
      sameAsPresentAddress: Boolean(cleanStu.sameAsPresentAddress),
      previousInstitute: cleanStu.previousInstitute || '',
      previousGpa:
        cleanStu.reAdmissionState.gpa !== undefined
          ? String(cleanStu.reAdmissionState.gpa.toFixed(2))
          : cleanStu.previousGpa || '',
      electiveSubjectIds: cleanStu.electiveSubjectIds || [],
      optionalFourthSubjectId: cleanStu.optionalFourthSubjectId || '',
      customFields: cleanStu.customFields || {},
    };

    return NextResponse.json({
      eligible: true,
      reAdmissionState: cleanStu.reAdmissionState,
      prefill,
      intake: {
        open: intake.open,
        feeAmount: intake.feeAmount,
        feeBreakdown: intake.feeBreakdown,
        academicYear: cleanStu.reAdmissionState.targetAcademicYear || intake.academicYear,
      },
      existingApplication,
      existingInvoice,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Re-admission lookup failed' },
      { status: 500 }
    );
  }
}
