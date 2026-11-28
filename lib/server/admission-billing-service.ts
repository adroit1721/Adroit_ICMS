import { Db } from 'mongodb';
import { COLLECTIONS, bumpSyncVersion } from './mongodb';
import { StoredStudent, ensureSettingsDoc, sanitizeStudentOut, stripMongoDoc } from './erp-repository';
import {
  AcademicClass,
  AcademicGroup,
  AdmissionApplication,
  AdmissionFeeItem,
  AdmissionPaymentSummary,
  InstituteRules,
  ShiftType,
  SmsLog,
  Student,
  StudentInvoice,
  Subject,
} from '@/lib/types';
import {
  isStudentGenderEligibleForSubject,
  resolveDefaultBatchCycle,
  subjectAppliesToGroup,
} from '@/lib/academic-helpers';
import {
  generateSixDigitPin,
  getNextStudentSystemIdFromStudents,
  normalizeBdMobileInput,
  parseDDMMYYYYToISO,
} from '@/lib/student-schema';
import { encryptAdminPin, hashPassword, sanitizeSafeUrl } from './security';

export function uidSuffix(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

const DATA_IMAGE_RE = /^data:image\/(jpeg|jpg|png|webp);base64,[A-Za-z0-9+/=]{1,180000}$/;

export function sanitizeStudentPhotoUrl(raw?: string | null): string {
  if (!raw || typeof raw !== 'string') return '';
  const trimmed = raw.trim();
  if (!trimmed) return '';
  if (DATA_IMAGE_RE.test(trimmed)) return trimmed;
  return sanitizeSafeUrl(trimmed);
}

export function getNextInvoiceNoFromList(
  invoices: Array<{ invoiceNo?: string }>,
  offset = 0
): string {
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

export function normalizeDobToIso(rawDob: unknown): string {
  if (typeof rawDob !== 'string') return '';
  const trimmed = rawDob.trim();
  if (!trimmed) return '';
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed.slice(0, 10);
  return parseDDMMYYYYToISO(trimmed) || trimmed;
}

export interface ClassIntakeConfig {
  open: boolean;
  feeAmount: number;
  feeBreakdown: AdmissionFeeItem[];
  academicYear: string;
}

export function resolveClassIntakeFees(
  clsObj: AcademicClass | null | undefined,
  type: 'new' | 're-admission',
  rules?: InstituteRules
): ClassIntakeConfig {
  const open =
    type === 're-admission'
      ? clsObj?.openForReAdmission !== false
      : clsObj?.openForNewAdmission !== false;

  const baseBreakdown: AdmissionFeeItem[] = Array.isArray(clsObj?.admissionFeeBreakdown)
    ? clsObj.admissionFeeBreakdown
        .filter((item) => item && String(item.label || '').trim() && Number(item.amount) >= 0)
        .map((item) => ({ label: String(item.label).trim(), amount: Number(item.amount) || 0 }))
    : [];

  const breakdownSum = baseBreakdown.reduce((acc, item) => acc + item.amount, 0);

  let feeAmount =
    type === 're-admission'
      ? typeof clsObj?.reAdmissionFee === 'number'
        ? clsObj.reAdmissionFee
        : typeof clsObj?.admissionFee === 'number'
        ? clsObj.admissionFee
        : 0
      : typeof clsObj?.newAdmissionFee === 'number'
      ? clsObj.newAdmissionFee
      : typeof clsObj?.admissionFee === 'number'
      ? clsObj.admissionFee
      : 0;

  if (feeAmount <= 0 && breakdownSum > 0) {
    feeAmount = breakdownSum;
  }

  const feeBreakdown: AdmissionFeeItem[] =
    baseBreakdown.length > 0 && feeAmount === breakdownSum
      ? baseBreakdown
      : feeAmount > 0
      ? [
          {
            label:
              type === 're-admission'
                ? `${clsObj?.name || 'Class'} Re-Admission Fee`
                : `${clsObj?.name || 'Class'} New Admission Fee`,
            amount: feeAmount,
          },
        ]
      : [];

  const academicYear =
    String(clsObj?.intakeYear || '').trim() ||
    resolveDefaultBatchCycle(clsObj?.name || '', rules, clsObj || undefined);

  return { open, feeAmount, feeBreakdown, academicYear };
}

export function mapChannelToInvoiceMethod(
  channel: AdmissionPaymentSummary['paymentChannel']
): StudentInvoice['paymentMethod'] | undefined {
  if (channel === 'bKash' || channel === 'Nagad' || channel === 'Rocket' || channel === 'Cash') {
    return channel;
  }
  if (channel === 'Online MFS') return 'bKash';
  return undefined;
}

export async function dispatchAdmissionPaymentSms(
  db: Db,
  params: {
    recipientName: string;
    phone?: string;
    receiptNo: string;
    amount: number;
    className: string;
    academicYear: string;
    channel: string;
    type: 'new' | 're-admission';
  }
): Promise<string | undefined> {
  const cleanPhone = params.phone ? normalizeBdMobileInput(params.phone) : '';
  if (!cleanPhone) return undefined;

  const settings = await ensureSettingsDoc(db);
  if (!settings.smsConfig.autoFeeReceiptSms) return undefined;

  const label = params.type === 're-admission' ? 'Re-admission' : 'Admission';
  const msg = `Dear ${params.recipientName}, ${label} fee BDT ${params.amount.toLocaleString()} for ${params.className} (${params.academicYear}) confirmed via ${params.channel}. Receipt: ${params.receiptNo}. - ${settings.cmsConfig.schoolName}`;

  const apiKey = process.env.SMS_GATEWAY_API_KEY?.trim();
  let status: SmsLog['status'] = 'Delivered';

  if (apiKey && settings.smsConfig.endpointUrl?.trim()) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 4000);
      await fetch(settings.smsConfig.endpointUrl.trim(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          senderId: settings.smsConfig.senderId,
          to: cleanPhone,
          message: msg,
        }),
        signal: controller.signal,
      }).catch(() => undefined);
      clearTimeout(timer);
    } catch {
      status = 'Queued';
    }
  } else {
    status = 'Queued';
  }

  const nowIso = new Date().toISOString();
  const smsLog: SmsLog = {
    id: `sms-${uidSuffix()}`,
    recipientGroup: `${cleanPhone} (${params.recipientName})`,
    recipientCount: 1,
    message: msg,
    sentAt: nowIso.replace('T', ' ').slice(0, 16),
    status,
  };

  await db.collection<SmsLog>(COLLECTIONS.SMS_LOGS).insertOne(smsLog);
  await bumpSyncVersion(db, 'sms_logs');
  return nowIso;
}

export async function syncAdmissionInvoice(
  db: Db,
  params: {
    app: AdmissionApplication;
    student?: StoredStudent | null;
    feeAmount: number;
    feeBreakdown: AdmissionFeeItem[];
    paymentChannel: AdmissionPaymentSummary['paymentChannel'];
    trxId?: string;
    markPaidNow?: boolean;
  }
): Promise<{ invoice: StudentInvoice | null; receiptNo: string }> {
  const { app, student, feeAmount, feeBreakdown, paymentChannel, trxId, markPaidNow } = params;
  const invoicesCol = db.collection<StudentInvoice>(COLLECTIONS.INVOICES);

  if (feeAmount <= 0) {
    return { invoice: null, receiptNo: `FREE-${app.applicationCode}` };
  }

  const existingInv =
    (app.paymentSummary?.invoiceId
      ? await invoicesCol.findOne({ id: app.paymentSummary.invoiceId })
      : null) || (await invoicesCol.findOne({ applicationId: app.id }));

  const today = new Date().toISOString().slice(0, 10);
  const feeCategory: StudentInvoice['feeCategory'] =
    app.applicationType === 're-admission' ? 'Re-admission' : 'Admission';
  const monthLabel =
    app.applicationType === 're-admission'
      ? `Re-Admission Fee (${app.targetAcademicYear || new Date().getFullYear()})`
      : `New Admission Fee (${app.targetAcademicYear || new Date().getFullYear()})`;

  const resolvedPaidAmount = markPaidNow ? feeAmount : 0;
  const resolvedStatus: StudentInvoice['status'] =
    resolvedPaidAmount >= feeAmount ? 'Paid' : resolvedPaidAmount > 0 ? 'Partial' : 'Unpaid';
  const method = mapChannelToInvoiceMethod(paymentChannel);

  if (existingInv) {
    const cleanExisting = stripMongoDoc(
      existingInv as unknown as Record<string, unknown>
    ) as unknown as StudentInvoice;
    const nextPaid = markPaidNow ? feeAmount : cleanExisting.paidAmount || 0;
    const updated: StudentInvoice = {
      ...cleanExisting,
      studentId: student?.id || app.linkedStudentId || cleanExisting.studentId,
      studentName: student?.fullName || app.applicantName,
      rollNumber: student?.rollNumber || app.assignedRoll || app.previousRoll || 0,
      className: student?.className || app.assignedClass || app.grade,
      sectionName: student?.sectionName || app.assignedSection || app.sectionName || 'Common',
      academicYear: app.targetAcademicYear || cleanExisting.academicYear,
      feeCategory,
      applicationId: app.id,
      feeBreakdown,
      totalPayable: feeAmount,
      paidAmount: nextPaid,
      status: nextPaid >= feeAmount ? 'Paid' : nextPaid > 0 ? 'Partial' : 'Unpaid',
      ...(method ? { paymentMethod: method } : {}),
      ...(trxId ? { transactionId: trxId } : {}),
      ...(markPaidNow ? { paymentDate: today } : {}),
    };
    await invoicesCol.updateOne({ id: existingInv.id }, { $set: updated });
    await bumpSyncVersion(db, 'invoices');
    return { invoice: updated, receiptNo: updated.invoiceNo };
  }

  const allInvoices = await invoicesCol.find({}, { projection: { invoiceNo: 1 } }).toArray();
  const invoiceNo = getNextInvoiceNoFromList(allInvoices);
  const created: StudentInvoice = {
    id: `inv-${uidSuffix()}`,
    invoiceNo,
    studentId: student?.id || app.linkedStudentId || `PENDING-${app.applicationCode}`,
    studentName: student?.fullName || app.applicantName,
    rollNumber: student?.rollNumber || app.assignedRoll || app.previousRoll || 0,
    className: student?.className || app.assignedClass || app.grade,
    sectionName: student?.sectionName || app.assignedSection || app.sectionName || 'Common',
    month: monthLabel,
    academicYear: app.targetAcademicYear || String(new Date().getFullYear()),
    feeCategory,
    applicationId: app.id,
    feeBreakdown,
    totalPayable: feeAmount,
    paidAmount: resolvedPaidAmount,
    status: resolvedStatus,
    ...(method ? { paymentMethod: method } : {}),
    ...(trxId ? { transactionId: trxId } : {}),
    ...(markPaidNow ? { paymentDate: today } : {}),
  };

  await invoicesCol.insertOne(created);
  await bumpSyncVersion(db, 'invoices');
  return { invoice: created, receiptNo: created.invoiceNo };
}

export interface FinalizeAdmissionResult {
  ok: boolean;
  status?: number;
  error?: string;
  application?: AdmissionApplication;
  student?: Student | null;
  invoice?: StudentInvoice | null;
}

/**
 * Verifies payment (if pending) and either:
 * - Completes a promoted student's Re-admission into their new Academic Year + Class + Roll, or
 * - Enrolls/settles an Admission application invoice & triggers SMS receipt log.
 */
export async function finalizeAdmissionOrReAdmission(
  db: Db,
  params: {
    applicationId: string;
    verifiedBy?: string;
    markPaid?: boolean;
    paymentChannel?: AdmissionPaymentSummary['paymentChannel'];
    trxId?: string;
    assignedClass?: string;
    assignedSection?: string;
    assignedGroup?: AcademicGroup;
    assignedShift?: ShiftType;
    assignedRoll?: number;
    systemId?: string;
  }
): Promise<FinalizeAdmissionResult> {
  const appCol = db.collection<AdmissionApplication>(COLLECTIONS.ADMISSIONS);
  const studentsCol = db.collection<StoredStudent>(COLLECTIONS.STUDENTS);

  const rawApp = await appCol.findOne({ id: params.applicationId });
  if (!rawApp) {
    return { ok: false, status: 404, error: 'Admission application not found.' };
  }
  const app = stripMongoDoc(
    rawApp as unknown as Record<string, unknown>
  ) as unknown as AdmissionApplication;

  const settings = await ensureSettingsDoc(db);
  const targetClassName = params.assignedClass || app.assignedClass || app.grade;
  const clsObj = await db
    .collection<AcademicClass>(COLLECTIONS.ACADEMIC_CLASSES)
    .findOne({ name: targetClassName });
  const appType: 'new' | 're-admission' =
    app.applicationType === 're-admission' ? 're-admission' : 'new';
  const intake = resolveClassIntakeFees(clsObj, appType, settings.instituteRules);

  const feeAmount =
    typeof app.paymentSummary?.feeAmount === 'number'
      ? app.paymentSummary.feeAmount
      : intake.feeAmount;
  const feeBreakdown = app.paymentSummary?.feeBreakdown?.length
    ? app.paymentSummary.feeBreakdown
    : intake.feeBreakdown;
  const channel: AdmissionPaymentSummary['paymentChannel'] =
    params.paymentChannel || app.paymentSummary?.paymentChannel || (feeAmount > 0 ? 'Cash' : 'Waived');
  const trxId = params.trxId || app.paymentSummary?.trxId;

  const nowIso = new Date().toISOString();
  const isNowPaid =
    feeAmount <= 0 || Boolean(params.markPaid) || app.paymentSummary?.paymentStatus === 'Paid';

  let linkedStudent: StoredStudent | null = null;
  if (app.linkedStudentId) {
    const existingStu = await studentsCol.findOne({ id: app.linkedStudentId });
    if (existingStu) {
      linkedStudent = stripMongoDoc(
        existingStu as unknown as Record<string, unknown>
      ) as unknown as StoredStudent;
    }
  }

  // If this is a Re-admission application for an existing student, update student record & promote
  if (appType === 're-admission' && linkedStudent) {
    const nextClass =
      params.assignedClass ||
      app.assignedClass ||
      linkedStudent.reAdmissionState?.targetClassName ||
      app.grade;
    const nextSection =
      params.assignedSection ||
      app.assignedSection ||
      app.sectionName ||
      linkedStudent.reAdmissionState?.targetSectionName ||
      linkedStudent.sectionName ||
      'Common';
    const nextGroup: AcademicGroup =
      params.assignedGroup ||
      app.group ||
      linkedStudent.reAdmissionState?.targetGroup ||
      linkedStudent.group ||
      'General';
    const nextShift: ShiftType =
      params.assignedShift ||
      app.shift ||
      linkedStudent.reAdmissionState?.targetShift ||
      linkedStudent.shift ||
      'Morning';
    const nextRoll =
      params.assignedRoll ||
      app.assignedRoll ||
      linkedStudent.reAdmissionState?.targetRollNumber ||
      linkedStudent.rollNumber;
    const nextYear =
      app.targetAcademicYear ||
      linkedStudent.reAdmissionState?.targetAcademicYear ||
      intake.academicYear;

    const studentPatch: Partial<StoredStudent> = {
      fullName: app.applicantName || linkedStudent.fullName,
      banglaName: app.banglaName ?? linkedStudent.banglaName,
      gender: app.gender || linkedStudent.gender,
      religionGroup: app.religionGroup || linkedStudent.religionGroup,
      dateOfBirth: normalizeDobToIso(app.dateOfBirth) || linkedStudent.dateOfBirth,
      birthRegOrNid: app.birthRegOrNid ?? linkedStudent.birthRegOrNid,
      bloodGroup: app.bloodGroup ?? linkedStudent.bloodGroup,
      phone: app.phone ? normalizeBdMobileInput(app.phone) : linkedStudent.phone,
      avatarUrl: app.avatarUrl ? sanitizeStudentPhotoUrl(app.avatarUrl) : linkedStudent.avatarUrl,
      avatarPublicId: app.avatarPublicId ?? linkedStudent.avatarPublicId,
      fatherName: app.fatherName ?? linkedStudent.fatherName,
      fatherBanglaName: app.fatherBanglaName ?? linkedStudent.fatherBanglaName,
      fatherNid: app.fatherNid ?? linkedStudent.fatherNid,
      fatherPhone: app.fatherPhone
        ? normalizeBdMobileInput(app.fatherPhone)
        : linkedStudent.fatherPhone,
      fatherOccupation: app.fatherOccupation ?? linkedStudent.fatherOccupation,
      motherName: app.motherName ?? linkedStudent.motherName,
      motherBanglaName: app.motherBanglaName ?? linkedStudent.motherBanglaName,
      motherNid: app.motherNid ?? linkedStudent.motherNid,
      motherPhone: app.motherPhone
        ? normalizeBdMobileInput(app.motherPhone)
        : linkedStudent.motherPhone,
      motherOccupation: app.motherOccupation ?? linkedStudent.motherOccupation,
      hasLocalGuardian: app.hasLocalGuardian ?? linkedStudent.hasLocalGuardian,
      guardianName: app.guardianName ?? linkedStudent.guardianName,
      guardianRelation: app.guardianRelation ?? linkedStudent.guardianRelation,
      guardianPhone: app.guardianPhone
        ? normalizeBdMobileInput(app.guardianPhone)
        : linkedStudent.guardianPhone,
      presentAddress: app.presentAddress ?? linkedStudent.presentAddress,
      permanentAddress: app.permanentAddress ?? linkedStudent.permanentAddress,
      presentAddressDetail: app.presentAddressDetail ?? linkedStudent.presentAddressDetail,
      permanentAddressDetail: app.permanentAddressDetail ?? linkedStudent.permanentAddressDetail,
      sameAsPresentAddress: app.sameAsPresentAddress ?? linkedStudent.sameAsPresentAddress,
      address: app.presentAddress || linkedStudent.address,
      previousInstitute: app.previousInstitute ?? linkedStudent.previousInstitute,
      previousGpa: app.previousGpa ?? linkedStudent.previousGpa,
      electiveSubjectIds: app.electiveSubjectIds?.length
        ? app.electiveSubjectIds
        : linkedStudent.electiveSubjectIds,
      optionalFourthSubjectId:
        app.optionalFourthSubjectId ?? linkedStudent.optionalFourthSubjectId,
      customFields: app.customFields ?? linkedStudent.customFields,
      className: nextClass,
      sectionName: nextSection,
      group: nextGroup,
      shift: nextShift,
      rollNumber: nextRoll,
      batchCycle: nextYear,
      status: 'Active',
      reAdmissionState: {
        ...(linkedStudent.reAdmissionState || {
          sourceAcademicYear: app.previousYear || settings.instituteRules.activeAcademicYear,
          sourceClassName: app.previousClass || linkedStudent.className,
          sourceSectionName: app.previousSection || linkedStudent.sectionName,
          sourceGroup: linkedStudent.group || 'General',
          sourceRollNumber: app.previousRoll || linkedStudent.rollNumber,
          targetAcademicYear: nextYear,
          targetClassName: nextClass,
          targetSectionName: nextSection,
          targetGroup: nextGroup,
          targetShift: nextShift,
          targetRollNumber: nextRoll,
          promotedAt: nowIso,
        }),
        status: 'Completed',
        targetAcademicYear: nextYear,
        targetClassName: nextClass,
        targetSectionName: nextSection,
        targetGroup: nextGroup,
        targetShift: nextShift,
        targetRollNumber: nextRoll,
        applicationId: app.id,
        completedAt: nowIso,
      },
      updatedAt: nowIso,
    };

    await studentsCol.updateOne({ id: linkedStudent.id }, { $set: studentPatch });
    linkedStudent = { ...linkedStudent, ...studentPatch };
    await bumpSyncVersion(db, 'students');
  } else if (appType === 'new' && !linkedStudent && params.assignedRoll && params.assignedClass) {
    // Full New Admission Enrollment into Student Register
    const [subjects, allStudents] = await Promise.all([
      db.collection<Subject>(COLLECTIONS.SUBJECTS).find({}).toArray(),
      studentsCol
        .find({}, { projection: { systemId: 1, className: 1, sectionName: 1, rollNumber: 1 } })
        .toArray(),
    ]);
    const stuGender = app.gender || 'Male';
    const nextGroup = params.assignedGroup || app.group || 'General';
    const eligiblePool = subjects.filter(
      (s) =>
        s.classLevel === params.assignedClass &&
        !s.isCompulsory &&
        !s.excludeFromGpa &&
        subjectAppliesToGroup(s, nextGroup) &&
        isStudentGenderEligibleForSubject(s, stuGender)
    );
    const fourthId =
      app.optionalFourthSubjectId ||
      eligiblePool.find((s) => s.canBeFourthSubject)?.id ||
      subjects.find((s) => s.canBeFourthSubject && isStudentGenderEligibleForSubject(s, stuGender))?.id;
    const defaultMain = eligiblePool.find((s) => s.id !== fourthId);

    const manualSysId =
      typeof params.systemId === 'string'
        ? params.systemId.replace(/[\s-]/g, '').trim().toUpperCase()
        : '';
    if (manualSysId) {
      const dup = allStudents.some(
        (x) => (x.systemId || '').replace(/[\s-]/g, '').trim().toUpperCase() === manualSysId
      );
      if (dup) {
        return {
          ok: false,
          status: 400,
          error: `Student ID "${manualSysId}" already exists.`,
        };
      }
    }

    const academicYr =
      app.targetAcademicYear || settings.instituteRules.activeAcademicYear || new Date().getFullYear();
    const assignedSystemId =
      manualSysId ||
      getNextStudentSystemIdFromStudents(
        allStudents,
        settings.instituteRules.studentIdPrefix || 'AG',
        academicYr
      );
    const admitPin = generateSixDigitPin();
    const nextShift: ShiftType = params.assignedShift || app.shift || 'Morning';
    const nextSec = params.assignedSection || app.sectionName || 'Common';

    const createdStu: StoredStudent = {
      id: `stu-${uidSuffix()}`,
      systemId: assignedSystemId,
      rollNumber: params.assignedRoll || 1,
      fullName: app.applicantName,
      banglaName: app.banglaName,
      gender: stuGender,
      fatherName: app.fatherName || 'Guardian On File',
      fatherBanglaName: app.fatherBanglaName,
      fatherNid: app.fatherNid,
      fatherPhone: app.fatherPhone,
      fatherOccupation: app.fatherOccupation,
      motherName: app.motherName || 'Guardian On File',
      motherBanglaName: app.motherBanglaName,
      motherNid: app.motherNid,
      motherPhone: app.motherPhone,
      motherOccupation: app.motherOccupation,
      hasLocalGuardian: app.hasLocalGuardian,
      guardianName: app.guardianName,
      guardianRelation: app.guardianRelation,
      guardianPhone: app.guardianPhone,
      dateOfBirth: normalizeDobToIso(app.dateOfBirth) || '2010-01-01',
      bloodGroup: app.bloodGroup,
      birthRegOrNid: app.birthRegOrNid,
      className: params.assignedClass,
      sectionName: nextSec,
      group: nextGroup,
      shift: nextShift,
      religionGroup: app.religionGroup || 'Islam',
      batchCycle:
        app.targetAcademicYear ||
        resolveDefaultBatchCycle(params.assignedClass, settings.instituteRules, clsObj || undefined),
      electiveSubjectIds: app.electiveSubjectIds?.length
        ? app.electiveSubjectIds
        : defaultMain
        ? [defaultMain.id]
        : [],
      optionalFourthSubjectId: fourthId,
      status: 'Active',
      avatarUrl: app.avatarUrl ? sanitizeStudentPhotoUrl(app.avatarUrl) : '',
      avatarPublicId: app.avatarPublicId,
      phone: app.phone ? normalizeBdMobileInput(app.phone) : '',
      address: app.presentAddress || '',
      presentAddress: app.presentAddress,
      permanentAddress: app.permanentAddress,
      presentAddressDetail: app.presentAddressDetail,
      permanentAddressDetail: app.permanentAddressDetail,
      sameAsPresentAddress: app.sameAsPresentAddress,
      previousInstitute: app.previousInstitute,
      previousGpa: app.previousGpa,
      customFields: app.customFields,
      registrationNumber: `REG-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 8999)}`,
      password: '',
      passwordHash: hashPassword(admitPin),
      systemPinEnc: encryptAdminPin(admitPin),
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    await studentsCol.insertOne(createdStu);
    linkedStudent = createdStu;
    await bumpSyncVersion(db, 'students');
  }

  const { invoice, receiptNo } = await syncAdmissionInvoice(db, {
    app: {
      ...app,
      ...(linkedStudent ? { linkedStudentId: linkedStudent.id, linkedSystemId: linkedStudent.systemId } : {}),
    },
    student: linkedStudent,
    feeAmount,
    feeBreakdown,
    paymentChannel: channel,
    trxId,
    markPaidNow: isNowPaid,
  });

  let smsNotifiedAt = app.paymentSummary?.smsNotifiedAt;
  if (isNowPaid && feeAmount > 0 && !smsNotifiedAt) {
    smsNotifiedAt = await dispatchAdmissionPaymentSms(db, {
      recipientName: linkedStudent?.fullName || app.applicantName,
      phone: app.phone || linkedStudent?.phone || app.fatherPhone,
      receiptNo: invoice?.invoiceNo || receiptNo,
      amount: feeAmount,
      className: linkedStudent?.className || app.assignedClass || app.grade,
      academicYear: app.targetAcademicYear || intake.academicYear,
      channel,
      type: appType,
    });
    if (smsNotifiedAt && invoice) {
      await db
        .collection<StudentInvoice>(COLLECTIONS.INVOICES)
        .updateOne({ id: invoice.id }, { $set: { smsNotifiedAt } });
      invoice.smsNotifiedAt = smsNotifiedAt;
    }
  }

  const nextPaymentSummary: AdmissionPaymentSummary = {
    feeAmount,
    paidAmount: isNowPaid ? feeAmount : app.paymentSummary?.paidAmount || 0,
    feeBreakdown,
    paymentChannel: channel,
    ...(trxId ? { trxId } : {}),
    ...(app.paymentSummary?.senderPhone ? { senderPhone: app.paymentSummary.senderPhone } : {}),
    paymentStatus: feeAmount <= 0 ? 'Not Required' : isNowPaid ? 'Paid' : 'Pending Verification',
    ...(invoice ? { invoiceId: invoice.id, receiptNo: invoice.invoiceNo } : { receiptNo }),
    ...(isNowPaid ? { paidAt: app.paymentSummary?.paidAt || nowIso } : {}),
    ...(params.verifiedBy ? { verifiedBy: params.verifiedBy } : {}),
    ...(smsNotifiedAt ? { smsNotifiedAt } : {}),
  };

  const updatedAppPatch: Partial<AdmissionApplication> = {
    status: linkedStudent ? 'Admitted' : app.status === 'Pending' && isNowPaid ? 'Approved' : app.status,
    ...(linkedStudent
      ? {
          linkedStudentId: linkedStudent.id,
          linkedSystemId: linkedStudent.systemId,
          assignedClass: linkedStudent.className,
          assignedSection: linkedStudent.sectionName,
          assignedRoll: linkedStudent.rollNumber,
        }
      : {}),
    paymentSummary: nextPaymentSummary,
  };

  await appCol.updateOne({ id: app.id }, { $set: updatedAppPatch });
  const finalApp: AdmissionApplication = { ...app, ...updatedAppPatch };
  await bumpSyncVersion(db, 'admissions');

  return {
    ok: true,
    status: 200,
    application: finalApp,
    student: linkedStudent ? sanitizeStudentOut(linkedStudent, 'admin') : null,
    invoice,
  };
}
