import { NextRequest, NextResponse } from 'next/server';
import { COLLECTIONS, bumpSyncVersion, getDb } from '@/lib/server/mongodb';
import { StoredStudent, ensureSettingsDoc, stripMongoDoc } from '@/lib/server/erp-repository';
import {
  assertTrustedOrigin,
  getSessionFromRequest,
  isAdminSession,
  sanitizeMongoInput,
} from '@/lib/server/security';
import {
  dispatchAdmissionPaymentSms,
  finalizeAdmissionOrReAdmission,
  normalizeDobToIso,
  resolveClassIntakeFees,
  sanitizeStudentPhotoUrl,
  syncAdmissionInvoice,
  uidSuffix,
} from '@/lib/server/admission-billing-service';
import {
  getEffectiveStudentSchema,
  getFieldRequirement,
  isValidBdBirthReg,
  isValidBdMobile,
  isValidBdNid,
  normalizeBdMobileInput,
} from '@/lib/student-schema';
import {
  AcademicClass,
  AcademicGroup,
  AdmissionApplication,
  AdmissionPaymentSummary,
  GenderType,
  ReligionGroup,
  ShiftType,
  StructuredAddress,
} from '@/lib/types';

export async function POST(req: NextRequest) {
  if (!assertTrustedOrigin(req)) {
    return NextResponse.json({ error: 'Untrusted request origin' }, { status: 403 });
  }

  try {
    const raw = await req.json();
    const p = sanitizeMongoInput(raw) as Record<string, unknown>;
    const session = getSessionFromRequest(req);
    const isAdmin = isAdminSession(session);
    const db = await getDb();

    const applicationType: 'new' | 're-admission' =
      p.applicationType === 're-admission' ? 're-admission' : 'new';
    const grade = String(p.grade || p.className || '').trim();
    const applicantName = String(p.applicantName || p.fullName || '').trim();

    if (!applicantName || !grade) {
      return NextResponse.json(
        { error: 'Student Full Name and Target Class are required.' },
        { status: 400 }
      );
    }

    const [settings, clsObj] = await Promise.all([
      ensureSettingsDoc(db),
      db.collection<AcademicClass>(COLLECTIONS.ACADEMIC_CLASSES).findOne({ name: grade }),
    ]);

    if (!isAdmin && applicationType === 'new' && !settings.cmsConfig.isAdmissionOpen) {
      return NextResponse.json(
        { error: 'Online New Admission portal is currently paused by administration.' },
        { status: 403 }
      );
    }

    const intake = resolveClassIntakeFees(clsObj, applicationType, settings.instituteRules);
    if (!isAdmin && !intake.open) {
      return NextResponse.json(
        {
          error:
            applicationType === 're-admission'
              ? `Re-admission for ${grade} is currently closed.`
              : `New admission for ${grade} is currently closed.`,
        },
        { status: 403 }
      );
    }

    // Validate phone & NID formats cleanly against BD standards
    const phoneRaw = String(p.phone || '').trim();
    const fatherPhoneRaw = String(p.fatherPhone || '').trim();
    const motherPhoneRaw = String(p.motherPhone || '').trim();
    const guardianPhoneRaw = String(p.guardianPhone || '').trim();
    const phone = phoneRaw ? normalizeBdMobileInput(phoneRaw) : '';
    const fatherPhone = fatherPhoneRaw ? normalizeBdMobileInput(fatherPhoneRaw) : '';
    const motherPhone = motherPhoneRaw ? normalizeBdMobileInput(motherPhoneRaw) : '';
    const guardianPhone = guardianPhoneRaw ? normalizeBdMobileInput(guardianPhoneRaw) : '';

    if (phone && !isValidBdMobile(phone)) {
      return NextResponse.json(
        { error: 'Invalid Primary Mobile format (expected 01[3-9]XXXXXXXX).' },
        { status: 400 }
      );
    }
    if (fatherPhone && !isValidBdMobile(fatherPhone)) {
      return NextResponse.json({ error: 'Invalid Father Mobile format.' }, { status: 400 });
    }
    if (motherPhone && !isValidBdMobile(motherPhone)) {
      return NextResponse.json({ error: 'Invalid Mother Mobile format.' }, { status: 400 });
    }
    if (guardianPhone && !isValidBdMobile(guardianPhone)) {
      return NextResponse.json({ error: 'Invalid Local Guardian Mobile format.' }, { status: 400 });
    }

    const birthRegOrNid = String(p.birthRegOrNid || '').trim();
    const fatherNid = String(p.fatherNid || '').trim();
    const motherNid = String(p.motherNid || '').trim();
    if (birthRegOrNid && !isValidBdBirthReg(birthRegOrNid)) {
      return NextResponse.json(
        { error: 'Birth Registration number must be 17 digits.' },
        { status: 400 }
      );
    }
    if (fatherNid && !isValidBdNid(fatherNid)) {
      return NextResponse.json(
        { error: 'Father NID must be 10, 13, or 17 digits.' },
        { status: 400 }
      );
    }
    if (motherNid && !isValidBdNid(motherNid)) {
      return NextResponse.json(
        { error: 'Mother NID must be 10, 13, or 17 digits.' },
        { status: 400 }
      );
    }

    // Dynamic StudentSchema validation
    const schema = getEffectiveStudentSchema(settings.instituteRules);
    const schemaCheck: Array<{ key: Parameters<typeof getFieldRequirement>[1]; label: string; value: string }> = [
      { key: 'phone', label: 'Primary Mobile', value: phone },
      { key: 'dateOfBirth', label: 'Date of Birth', value: String(p.dateOfBirth || '').trim() },
      { key: 'fatherName', label: 'Father Name (English)', value: String(p.fatherName || '').trim() },
      { key: 'motherName', label: 'Mother Name (English)', value: String(p.motherName || '').trim() },
      { key: 'fatherPhone', label: 'Father Mobile', value: fatherPhone },
      { key: 'motherPhone', label: 'Mother Mobile', value: motherPhone },
      { key: 'presentAddress', label: 'Present Address', value: String(p.presentAddress || '').trim() },
    ];
    for (const item of schemaCheck) {
      if (getFieldRequirement(schema, item.key) === 'required' && !item.value) {
        return NextResponse.json({ error: `${item.label} is required.` }, { status: 400 });
      }
    }

    // Re-admission student lookup & eligibility guard
    const linkedStudentId = String(p.linkedStudentId || '').trim();
    let linkedStudent: StoredStudent | null = null;
    const studentsCol = db.collection<StoredStudent>(COLLECTIONS.STUDENTS);

    if (applicationType === 're-admission') {
      if (!linkedStudentId) {
        return NextResponse.json(
          { error: 'Re-admission requires a verified promoted student record.' },
          { status: 400 }
        );
      }
      const found = await studentsCol.findOne({ id: linkedStudentId });
      if (!found || found.status !== 'Active') {
        return NextResponse.json(
          { error: 'Promoted active student record not found.' },
          { status: 404 }
        );
      }
      linkedStudent = stripMongoDoc(
        found as unknown as Record<string, unknown>
      ) as unknown as StoredStudent;

      if (!isAdmin && (!linkedStudent.reAdmissionState || linkedStudent.reAdmissionState.status === 'None')) {
        return NextResponse.json(
          { error: 'This student is not marked as Pending Re-admission.' },
          { status: 403 }
        );
      }
    }

    // Payment normalization
    const rawChannel = String(p.paymentChannel || '').trim();
    const allowedChannels: AdmissionPaymentSummary['paymentChannel'][] = [
      'Cash',
      'bKash',
      'Nagad',
      'Rocket',
      'Online MFS',
      'Waived',
    ];
    let paymentChannel: AdmissionPaymentSummary['paymentChannel'] = allowedChannels.includes(
      rawChannel as AdmissionPaymentSummary['paymentChannel']
    )
      ? (rawChannel as AdmissionPaymentSummary['paymentChannel'])
      : intake.feeAmount > 0
      ? 'Cash'
      : 'Waived';

    if (!isAdmin && paymentChannel === 'Waived' && intake.feeAmount > 0) {
      paymentChannel = 'Cash';
    }

    const trxId = String(p.trxId || '').trim();
    const senderPhoneRaw = String(p.senderPhone || '').trim();
    const senderPhone = senderPhoneRaw ? normalizeBdMobileInput(senderPhoneRaw) : '';
    const adminCollectPaidNow = Boolean(isAdmin && p.markPaidNow !== false && intake.feeAmount > 0);
    const completeReAdmissionNow = Boolean(
      isAdmin && applicationType === 're-admission' && p.completeImmediately !== false
    );

    if (
      intake.feeAmount > 0 &&
      (paymentChannel === 'bKash' || paymentChannel === 'Nagad' || paymentChannel === 'Rocket') &&
      !trxId &&
      !adminCollectPaidNow
    ) {
      return NextResponse.json(
        { error: `Please enter the ${paymentChannel} Transaction ID (TrxID) or select Pay at Office.` },
        { status: 400 }
      );
    }

    const appCol = db.collection<AdmissionApplication>(COLLECTIONS.ADMISSIONS);
    const existingCount = await appCol.countDocuments();
    const parts = applicantName.split(/\s+/);
    const initials = parts.slice(0, 2).map((x) => x[0]?.toUpperCase() || '').join('') || 'NA';
    const nowIso = new Date().toISOString();
    const todayIso = nowIso.slice(0, 10);

    const targetYear =
      String(p.targetAcademicYear || '').trim() ||
      linkedStudent?.reAdmissionState?.targetAcademicYear ||
      intake.academicYear;

    const customAnswers =
      p.customAnswers && typeof p.customAnswers === 'object'
        ? (p.customAnswers as Record<string, string>)
        : {};
    const customFields =
      p.customFields && typeof p.customFields === 'object'
        ? (p.customFields as Record<string, string>)
        : {};

    const appId = `app-${uidSuffix()}`;
    const applicationCode = `APP-${8901 + existingCount}`;

    const initialPaymentSummary: AdmissionPaymentSummary = {
      feeAmount: intake.feeAmount,
      paidAmount: intake.feeAmount <= 0 ? 0 : adminCollectPaidNow ? intake.feeAmount : 0,
      feeBreakdown: intake.feeBreakdown,
      paymentChannel: intake.feeAmount <= 0 ? 'Waived' : paymentChannel,
      ...(trxId ? { trxId } : {}),
      ...(senderPhone ? { senderPhone } : {}),
      paymentStatus:
        intake.feeAmount <= 0
          ? 'Not Required'
          : adminCollectPaidNow
          ? 'Paid'
          : 'Pending Verification',
      ...(adminCollectPaidNow ? { paidAt: nowIso, verifiedBy: session?.username || 'Admin' } : {}),
    };

    const newApp: AdmissionApplication = {
      id: appId,
      applicantName,
      applicantInitials: initials,
      applicationCode,
      applicationType,
      targetAcademicYear: targetYear,
      ...(linkedStudent
        ? {
            linkedStudentId: linkedStudent.id,
            linkedSystemId: linkedStudent.systemId,
            previousYear:
              String(p.previousYear || '').trim() ||
              linkedStudent.reAdmissionState?.sourceAcademicYear ||
              linkedStudent.batchCycle,
            previousClass:
              String(p.previousClass || '').trim() ||
              linkedStudent.reAdmissionState?.sourceClassName ||
              linkedStudent.className,
            previousSection:
              linkedStudent.reAdmissionState?.sourceSectionName || linkedStudent.sectionName,
            previousRoll:
              Number(p.previousRoll || 0) ||
              linkedStudent.reAdmissionState?.sourceRollNumber ||
              linkedStudent.rollNumber,
            assignedClass: linkedStudent.reAdmissionState?.targetClassName || grade,
            assignedSection:
              String(p.sectionName || '').trim() ||
              linkedStudent.reAdmissionState?.targetSectionName ||
              'Common',
            assignedRoll:
              Number(p.assignedRoll || 0) ||
              linkedStudent.reAdmissionState?.targetRollNumber ||
              linkedStudent.rollNumber,
          }
        : {}),
      grade,
      appliedTime: todayIso,
      score:
        String(p.score || '').trim() ||
        (String(p.previousGpa || '').trim() ? `GPA ${p.previousGpa}` : applicationType === 're-admission' ? 'Promoted Cohort' : 'Awaiting Assessment'),
      status: applicationType === 're-admission' ? 'Under Review' : 'Pending',
      gender: (p.gender === 'Female' || p.gender === 'Other' ? p.gender : 'Male') as GenderType,
      banglaName: String(p.banglaName || '').trim() || undefined,
      dateOfBirth: normalizeDobToIso(p.dateOfBirth) || undefined,
      bloodGroup: String(p.bloodGroup || '').trim() || undefined,
      birthRegOrNid: birthRegOrNid || undefined,
      shift: (p.shift === 'Day' ? 'Day' : 'Morning') as ShiftType,
      sectionName: String(p.sectionName || '').trim() || undefined,
      avatarUrl: p.avatarUrl ? sanitizeStudentPhotoUrl(String(p.avatarUrl)) || undefined : undefined,
      avatarPublicId: String(p.avatarPublicId || '').trim() || undefined,
      fatherName: String(p.fatherName || '').trim() || undefined,
      fatherBanglaName: String(p.fatherBanglaName || '').trim() || undefined,
      fatherNid: fatherNid || undefined,
      fatherPhone: fatherPhone || undefined,
      fatherOccupation: String(p.fatherOccupation || '').trim() || undefined,
      motherName: String(p.motherName || '').trim() || undefined,
      motherBanglaName: String(p.motherBanglaName || '').trim() || undefined,
      motherNid: motherNid || undefined,
      motherPhone: motherPhone || undefined,
      motherOccupation: String(p.motherOccupation || '').trim() || undefined,
      hasLocalGuardian: Boolean(p.hasLocalGuardian),
      guardianName: String(p.guardianName || '').trim() || undefined,
      guardianRelation: String(p.guardianRelation || '').trim() || undefined,
      guardianPhone: guardianPhone || undefined,
      phone,
      presentAddress: String(p.presentAddress || '').trim() || undefined,
      permanentAddress: String(p.permanentAddress || '').trim() || undefined,
      presentAddressDetail: p.presentAddressDetail as StructuredAddress | undefined,
      permanentAddressDetail: p.permanentAddressDetail as StructuredAddress | undefined,
      sameAsPresentAddress: Boolean(p.sameAsPresentAddress),
      previousInstitute: String(p.previousInstitute || '').trim() || undefined,
      previousGpa: String(p.previousGpa || '').trim() || undefined,
      religionGroup: (String(p.religionGroup || 'Islam') as ReligionGroup) || 'Islam',
      group: (String(p.group || 'General') as AcademicGroup) || 'General',
      electiveSubjectIds: Array.isArray(p.electiveSubjectIds)
        ? (p.electiveSubjectIds as string[])
        : undefined,
      optionalFourthSubjectId: String(p.optionalFourthSubjectId || '').trim() || undefined,
      customFields,
      customAnswers,
      paymentSummary: initialPaymentSummary,
    };

    await appCol.insertOne(newApp);

    // For Re-admission pending online payment verification, keep student state as 'Submitted' with application link
    if (applicationType === 're-admission' && linkedStudent && !completeReAdmissionNow) {
      await studentsCol.updateOne(
        { id: linkedStudent.id },
        {
          $set: {
            'reAdmissionState.status': 'Submitted',
            'reAdmissionState.applicationId': newApp.id,
            updatedAt: nowIso,
          },
        }
      );
      await bumpSyncVersion(db, 'students');
    }

    // If Admin is completing Re-admission directly or marking payment paid now, run finalizer
    if (completeReAdmissionNow || adminCollectPaidNow) {
      const finalized = await finalizeAdmissionOrReAdmission(db, {
        applicationId: newApp.id,
        verifiedBy: session?.username || 'Admin',
        markPaid: adminCollectPaidNow || intake.feeAmount <= 0,
        paymentChannel,
        trxId: trxId || (paymentChannel === 'Cash' ? `CASH-${Date.now().toString().slice(-6)}` : undefined),
        assignedClass: grade,
        assignedSection: newApp.assignedSection || newApp.sectionName,
        assignedGroup: newApp.group,
        assignedShift: newApp.shift,
        assignedRoll: newApp.assignedRoll,
      });

      const syncVersion = await bumpSyncVersion(db, 'admissions');
      return NextResponse.json({
        ok: true,
        application: finalized.application || newApp,
        invoice: finalized.invoice || null,
        student: finalized.student || null,
        syncVersion,
      });
    }

    // Standard submission: create/sync invoice (Unpaid until verified) and return slip + invoice
    const { invoice, receiptNo } = await syncAdmissionInvoice(db, {
      app: newApp,
      student: linkedStudent,
      feeAmount: intake.feeAmount,
      feeBreakdown: intake.feeBreakdown,
      paymentChannel,
      trxId: trxId || undefined,
      markPaidNow: false,
    });

    if (invoice) {
      const updatedSummary: AdmissionPaymentSummary = {
        ...initialPaymentSummary,
        invoiceId: invoice.id,
        receiptNo: invoice.invoiceNo,
      };
      await appCol.updateOne({ id: newApp.id }, { $set: { paymentSummary: updatedSummary } });
      newApp.paymentSummary = updatedSummary;
    } else {
      newApp.paymentSummary = { ...initialPaymentSummary, receiptNo };
    }

    // Notify SMS log if free/waived or payment confirmation recorded
    if (intake.feeAmount <= 0 && phone) {
      await dispatchAdmissionPaymentSms(db, {
        recipientName: applicantName,
        phone,
        receiptNo,
        amount: 0,
        className: grade,
        academicYear: targetYear,
        channel: 'Waived',
        type: applicationType,
      });
    }

    const syncVersion = await bumpSyncVersion(db, 'admissions');
    return NextResponse.json({
      ok: true,
      application: newApp,
      invoice,
      student: null,
      syncVersion,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to submit admission application' },
      { status: 500 }
    );
  }
}
