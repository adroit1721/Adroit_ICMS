'use client';

import { useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  BookOpen,
  Camera,
  CheckCircle2,
  CreditCard,
  GraduationCap,
  KeyRound,
  Loader2,
  MapPin,
  Smartphone,
  Trash2,
  User,
  Users,
} from 'lucide-react';
import {
  AcademicClass,
  AcademicGroup,
  AdmissionApplication,
  AdmissionFeeItem,
  AdmissionFormConfig,
  GenderType,
  InstituteRules,
  MfsGatewayConfig,
  ReligionGroup,
  ShiftType,
  StructuredAddress,
  Student,
  StudentCoreFieldKey,
  StudentInvoice,
  StudentReAdmissionState,
  Subject,
} from '@/lib/types';
import {
  EMPTY_STRUCTURED_ADDRESS,
  autoFormatDDMMYYYYInput,
  formatISOToDDMMYYYY,
  formatStructuredAddress,
  getEffectiveStudentSchema,
  getFieldRequirement,
  isValidBdBirthReg,
  isValidBdMobile,
  isValidBdNid,
  normalizeBdMobileInput,
  parseDDMMYYYYToISO,
} from '@/lib/student-schema';
import {
  getEffectiveSectionsForClassGroup,
  isSingleBatchCohort,
  isStudentGenderEligibleForSubject,
  resolveDefaultBatchCycle,
  sortSubjectsByOrder,
  subjectAppliesToGroup,
} from '@/lib/academic-helpers';
import {
  BD_DIVISIONS,
  getDistrictsByDivision,
  getUpazilasByDistrict,
} from '@/lib/bd-locations';

interface StudentSchemaAdmissionFormProps {
  mode: 'new' | 're-admission';
  actor: 'public' | 'admin';
  academicClasses: AcademicClass[];
  subjects: Subject[];
  instituteRules: InstituteRules;
  admissionFormConfig: AdmissionFormConfig;
  mfsConfig: MfsGatewayConfig;
  prefillStudent?: Partial<Student> | null;
  reAdmissionContext?: Partial<StudentReAdmissionState> | null;
  linkedStudentId?: string;
  onSuccess: (result: {
    application: AdmissionApplication;
    invoice: StudentInvoice | null;
    student: Student | null;
  }) => void;
  onCancel?: () => void;
}

const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'];

function resolveInitialAddress(
  detail: StructuredAddress | undefined,
  legacyText: string | undefined
): StructuredAddress {
  if (
    detail &&
    (detail.division ||
      detail.district ||
      detail.upazila ||
      detail.villageRoad ||
      detail.postOffice ||
      detail.postalCode)
  ) {
    return { ...EMPTY_STRUCTURED_ADDRESS, ...detail };
  }
  return {
    ...EMPTY_STRUCTURED_ADDRESS,
    villageRoad: legacyText?.trim() || '',
  };
}

function classSupportsGroups(clsObj: AcademicClass | undefined): boolean {
  if (!clsObj) return false;
  if (clsObj.hasGroups === false) return false;
  if (clsObj.hasGroups === true) return true;
  return (clsObj.groups || []).some((g) => g !== 'General');
}

function computeClientClassIntake(
  clsObj: AcademicClass | undefined,
  mode: 'new' | 're-admission',
  rules: InstituteRules
): { open: boolean; feeAmount: number; feeBreakdown: AdmissionFeeItem[]; academicYear: string } {
  const open =
    mode === 're-admission'
      ? clsObj?.openForReAdmission !== false
      : clsObj?.openForNewAdmission !== false;

  const baseBreakdown: AdmissionFeeItem[] = Array.isArray(clsObj?.admissionFeeBreakdown)
    ? clsObj.admissionFeeBreakdown
        .filter((item) => item && String(item.label || '').trim() && Number(item.amount) >= 0)
        .map((item) => ({ label: String(item.label).trim(), amount: Number(item.amount) || 0 }))
    : [];
  const breakdownSum = baseBreakdown.reduce((acc, item) => acc + item.amount, 0);

  let feeAmount =
    mode === 're-admission'
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
              mode === 're-admission'
                ? `${clsObj?.name || 'Class'} Re-Admission Fee`
                : `${clsObj?.name || 'Class'} New Admission Fee`,
            amount: feeAmount,
          },
        ]
      : [];

  const academicYear =
    String(clsObj?.intakeYear || '').trim() ||
    resolveDefaultBatchCycle(clsObj?.name || '', rules, clsObj);

  return { open, feeAmount, feeBreakdown, academicYear };
}

async function compressImageToPassportDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read selected image file.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Unsupported image format.'));
      img.onload = () => {
        const targetW = 210;
        const targetH = 270;
        const canvas = document.createElement('canvas');
        canvas.width = targetW;
        canvas.height = targetH;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas unavailable'));
          return;
        }
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, targetW, targetH);

        const srcRatio = img.width / img.height;
        const dstRatio = targetW / targetH;
        let sx = 0;
        let sy = 0;
        let sw = img.width;
        let sh = img.height;
        if (srcRatio > dstRatio) {
          sw = img.height * dstRatio;
          sx = (img.width - sw) / 2;
        } else {
          sh = img.width / dstRatio;
          sy = (img.height - sh) / 2;
        }
        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, targetW, targetH);
        resolve(canvas.toDataURL('image/jpeg', 0.82));
      };
      img.src = String(reader.result || '');
    };
    reader.readAsDataURL(file);
  });
}

export default function StudentSchemaAdmissionForm({
  mode,
  actor,
  academicClasses,
  subjects,
  instituteRules,
  admissionFormConfig,
  mfsConfig,
  prefillStudent,
  reAdmissionContext,
  linkedStudentId,
  onSuccess,
  onCancel,
}: StudentSchemaAdmissionFormProps) {
  const schema = getEffectiveStudentSchema(instituteRules);
  const isReq = (key: StudentCoreFieldKey) => getFieldRequirement(schema, key) === 'required';
  const isHidden = (key: StudentCoreFieldKey) => getFieldRequirement(schema, key) === 'hidden';

  const selectableClasses = useMemo(() => {
    if (actor === 'public' && mode === 'new') {
      const openList = academicClasses.filter((c) => c.openForNewAdmission !== false);
      return openList.length > 0 ? openList : academicClasses;
    }
    return academicClasses;
  }, [academicClasses, actor, mode]);

  const initialClassName =
    reAdmissionContext?.targetClassName ||
    prefillStudent?.className ||
    selectableClasses[0]?.name ||
    'Class 6';
  const initialClassObj =
    academicClasses.find((c) => c.name === initialClassName) || selectableClasses[0];
  const initialHasGroups = classSupportsGroups(initialClassObj);
  const initialGroupOptions: AcademicGroup[] = initialHasGroups
    ? initialClassObj?.groups?.length
      ? initialClassObj.groups
      : ['Science', 'Business Studies', 'Humanities']
    : ['General'];
  const rawInitialGroup = reAdmissionContext?.targetGroup || prefillStudent?.group;
  const initialGroup: AcademicGroup =
    rawInitialGroup && initialGroupOptions.includes(rawInitialGroup)
      ? rawInitialGroup
      : initialGroupOptions[0] || 'General';
  const initialSectionList = getEffectiveSectionsForClassGroup(initialClassObj, initialGroup);
  const rawInitialSec = reAdmissionContext?.targetSectionName || prefillStudent?.sectionName;
  const initialSection =
    rawInitialSec && initialSectionList.includes(rawInitialSec)
      ? rawInitialSec
      : initialSectionList[0] || 'Common';

  const initialPresentDetail = resolveInitialAddress(
    prefillStudent?.presentAddressDetail,
    prefillStudent?.presentAddress || prefillStudent?.address
  );
  const initialPermanentDetail = resolveInitialAddress(
    prefillStudent?.permanentAddressDetail,
    prefillStudent?.permanentAddress
  );

  const [avatarUrl, setAvatarUrl] = useState(prefillStudent?.avatarUrl || '');
  const [avatarPublicId, setAvatarPublicId] = useState(prefillStudent?.avatarPublicId || '');
  const [photoUploading, setPhotoUploading] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const [grade, setGrade] = useState(initialClassName);
  const [group, setGroup] = useState<AcademicGroup>(initialGroup);
  const [sectionName, setSectionName] = useState(initialSection);
  const [shift, setShift] = useState<ShiftType>(
    reAdmissionContext?.targetShift || prefillStudent?.shift || 'Morning'
  );
  const [targetAcademicYear, setTargetAcademicYear] = useState(
    reAdmissionContext?.targetAcademicYear ||
      resolveDefaultBatchCycle(initialClassName, instituteRules, initialClassObj)
  );
  const [assignedRoll, setAssignedRoll] = useState<number>(
    reAdmissionContext?.targetRollNumber || prefillStudent?.rollNumber || 1
  );

  const [fullName, setFullName] = useState(prefillStudent?.fullName || '');
  const [banglaName, setBanglaName] = useState(prefillStudent?.banglaName || '');
  const [gender, setGender] = useState<GenderType>(prefillStudent?.gender || 'Male');
  const [religionGroup, setReligionGroup] = useState<ReligionGroup>(
    prefillStudent?.religionGroup || 'Islam'
  );
  const [dobInput, setDobInput] = useState(
    formatISOToDDMMYYYY(prefillStudent?.dateOfBirth || '') || ''
  );
  const [birthRegOrNid, setBirthRegOrNid] = useState(prefillStudent?.birthRegOrNid || '');
  const [bloodGroup, setBloodGroup] = useState(prefillStudent?.bloodGroup || '');
  const [phone, setPhone] = useState(prefillStudent?.phone || '');

  const [fatherName, setFatherName] = useState(prefillStudent?.fatherName || '');
  const [fatherBanglaName, setFatherBanglaName] = useState(prefillStudent?.fatherBanglaName || '');
  const [fatherNid, setFatherNid] = useState(prefillStudent?.fatherNid || '');
  const [fatherPhone, setFatherPhone] = useState(prefillStudent?.fatherPhone || '');
  const [fatherOccupation, setFatherOccupation] = useState(prefillStudent?.fatherOccupation || '');

  const [motherName, setMotherName] = useState(prefillStudent?.motherName || '');
  const [motherBanglaName, setMotherBanglaName] = useState(prefillStudent?.motherBanglaName || '');
  const [motherNid, setMotherNid] = useState(prefillStudent?.motherNid || '');
  const [motherPhone, setMotherPhone] = useState(prefillStudent?.motherPhone || '');
  const [motherOccupation, setMotherOccupation] = useState(prefillStudent?.motherOccupation || '');

  const [hasLocalGuardian, setHasLocalGuardian] = useState(Boolean(prefillStudent?.hasLocalGuardian));
  const [guardianName, setGuardianName] = useState(prefillStudent?.guardianName || '');
  const [guardianRelation, setGuardianRelation] = useState(prefillStudent?.guardianRelation || '');
  const [guardianPhone, setGuardianPhone] = useState(prefillStudent?.guardianPhone || '');

  const [presentDetail, setPresentDetail] = useState<StructuredAddress>(initialPresentDetail);
  const [permanentDetail, setPermanentDetail] = useState<StructuredAddress>(initialPermanentDetail);
  const [sameAsPresent, setSameAsPresent] = useState(Boolean(prefillStudent?.sameAsPresentAddress));

  const [previousInstitute, setPreviousInstitute] = useState(prefillStudent?.previousInstitute || '');
  const [previousGpa, setPreviousGpa] = useState(
    reAdmissionContext?.gpa !== undefined
      ? reAdmissionContext.gpa.toFixed(2)
      : prefillStudent?.previousGpa || ''
  );

  const [electiveSubjectIds, setElectiveSubjectIds] = useState<string[]>(
    prefillStudent?.electiveSubjectIds || []
  );
  const [optionalFourthSubjectId, setOptionalFourthSubjectId] = useState(
    prefillStudent?.optionalFourthSubjectId || ''
  );

  const [customFields, setCustomFields] = useState<Record<string, string>>(
    prefillStudent?.customFields || {}
  );
  const [customAnswers, setCustomAnswers] = useState<Record<string, string>>({});

  // Fee & MFS payment controls
  const selectedClassObj = academicClasses.find((c) => c.name === grade);
  const intake = computeClientClassIntake(selectedClassObj, mode, instituteRules);

  const enabledMfsChannels = useMemo(() => {
    const list: Array<{ id: 'bKash' | 'Nagad' | 'Rocket'; label: string; merchantNumber: string }> = [];
    if (mfsConfig.bkash.enabled) {
      list.push({ id: 'bKash', label: 'bKash', merchantNumber: mfsConfig.bkash.merchantNumber });
    }
    if (mfsConfig.nagad.enabled) {
      list.push({ id: 'Nagad', label: 'Nagad', merchantNumber: mfsConfig.nagad.merchantNumber });
    }
    if (mfsConfig.rocket.enabled) {
      list.push({ id: 'Rocket', label: 'Rocket', merchantNumber: mfsConfig.rocket.merchantNumber });
    }
    return list;
  }, [mfsConfig]);

  const [paymentChannel, setPaymentChannel] = useState<
    'Cash' | 'bKash' | 'Nagad' | 'Rocket' | 'Waived'
  >(
    intake.feeAmount <= 0
      ? 'Waived'
      : enabledMfsChannels[0]?.id || 'Cash'
  );
  const [trxId, setTrxId] = useState('');
  const [senderPhone, setSenderPhone] = useState('');
  const [adminMarkPaidNow, setAdminMarkPaidNow] = useState(actor === 'admin');
  const [adminCompleteReAdmissionNow, setAdminCompleteReAdmissionNow] = useState(
    actor === 'admin' && mode === 're-admission'
  );

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const hasGroups = classSupportsGroups(selectedClassObj);
  const groupOptions: AcademicGroup[] = hasGroups
    ? selectedClassObj?.groups?.length
      ? selectedClassObj.groups
      : ['Science', 'Business Studies', 'Humanities']
    : ['General'];
  const effectiveGroup = groupOptions.includes(group) ? group : groupOptions[0];
  const sectionOptions = getEffectiveSectionsForClassGroup(selectedClassObj, effectiveGroup);
  const effectiveSection = sectionOptions.includes(sectionName)
    ? sectionName
    : sectionOptions[0] || 'Common';
  const shiftOptions: ShiftType[] = selectedClassObj?.shifts?.length
    ? selectedClassObj.shifts
    : ['Morning', 'Day'];

  const fourthSubjectPool = sortSubjectsByOrder(
    subjects.filter(
      (s) =>
        s.canBeFourthSubject &&
        s.classLevel === grade &&
        subjectAppliesToGroup(s, effectiveGroup) &&
        isStudentGenderEligibleForSubject(s, gender)
    )
  );

  const electivePool = sortSubjectsByOrder(
    subjects.filter(
      (s) =>
        !s.isCompulsory &&
        !s.excludeFromGpa &&
        !s.religionRestriction &&
        s.classLevel === grade &&
        subjectAppliesToGroup(s, effectiveGroup) &&
        isStudentGenderEligibleForSubject(s, gender)
    )
  );

  const handleClassChange = (nextClassName: string) => {
    setGrade(nextClassName);
    const nextClsObj = academicClasses.find((c) => c.name === nextClassName);
    const nextHasGrp = classSupportsGroups(nextClsObj);
    const nextGrps: AcademicGroup[] = nextHasGrp
      ? nextClsObj?.groups?.length
        ? nextClsObj.groups
        : ['Science', 'Business Studies', 'Humanities']
      : ['General'];
    const nextGrp = nextGrps.includes(group) ? group : nextGrps[0] || 'General';
    setGroup(nextGrp);
    const nextSecs = getEffectiveSectionsForClassGroup(nextClsObj, nextGrp);
    setSectionName(nextSecs[0] || 'Common');
    if (nextClsObj?.shifts?.length && !nextClsObj.shifts.includes(shift)) {
      setShift(nextClsObj.shifts[0]);
    }
    setTargetAcademicYear(
      reAdmissionContext?.targetAcademicYear ||
        resolveDefaultBatchCycle(nextClassName, instituteRules, nextClsObj)
    );
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoUploading(true);
    setErrorMsg(null);
    try {
      if (actor === 'admin') {
        const body = new FormData();
        body.append('file', file);
        body.append('folder', 'erp/students');
        const res = await fetch('/api/media/upload', {
          method: 'POST',
          credentials: 'include',
          headers: { 'X-Requested-With': 'erp-client' },
          body,
        });
        if (res.ok) {
          const json = (await res.json()) as { url?: string; publicId?: string };
          if (json.url) {
            setAvatarUrl(json.url);
            setAvatarPublicId(json.publicId || '');
            return;
          }
        }
      }
      // Fallback / public mode: crop & compress cleanly to 35:45 passport JPEG
      const compressed = await compressImageToPassportDataUrl(file);
      setAvatarUrl(compressed);
      setAvatarPublicId('');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to process passport photo.');
    } finally {
      setPhotoUploading(false);
      if (photoInputRef.current) photoInputRef.current.value = '';
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!fullName.trim()) {
      setErrorMsg('Student Full Name (English) is required.');
      return;
    }

    const dobIso = dobInput.trim() ? parseDDMMYYYYToISO(dobInput) : '';
    if (dobInput.trim() && !dobIso) {
      setErrorMsg('Enter Date of Birth in DD/MM/YYYY format (e.g. 15/08/2012).');
      return;
    }
    if (isReq('dateOfBirth') && !dobIso) {
      setErrorMsg('Date of Birth is required.');
      return;
    }

    const phoneNorm = phone.trim() ? normalizeBdMobileInput(phone) : '';
    if (isReq('phone') && !phoneNorm) {
      setErrorMsg('Primary Mobile number is required.');
      return;
    }
    if (phoneNorm && !isValidBdMobile(phoneNorm)) {
      setErrorMsg('Primary Mobile must be a valid Bangladesh 11-digit number (01XXXXXXXXX).');
      return;
    }
    if (fatherPhone.trim() && !isValidBdMobile(fatherPhone)) {
      setErrorMsg('Father Mobile must be a valid 11-digit BD mobile number.');
      return;
    }
    if (motherPhone.trim() && !isValidBdMobile(motherPhone)) {
      setErrorMsg('Mother Mobile must be a valid 11-digit BD mobile number.');
      return;
    }
    if (hasLocalGuardian && guardianPhone.trim() && !isValidBdMobile(guardianPhone)) {
      setErrorMsg('Guardian Mobile must be a valid 11-digit BD mobile number.');
      return;
    }
    if (birthRegOrNid.trim() && !isValidBdBirthReg(birthRegOrNid)) {
      setErrorMsg('Birth Registration Number must be 17 digits.');
      return;
    }
    if (fatherNid.trim() && !isValidBdNid(fatherNid)) {
      setErrorMsg('Father NID must be 10, 13, or 17 digits.');
      return;
    }
    if (motherNid.trim() && !isValidBdNid(motherNid)) {
      setErrorMsg('Mother NID must be 10, 13, or 17 digits.');
      return;
    }

    const presentFormatted = formatStructuredAddress(presentDetail);
    const permanentFormatted = sameAsPresent
      ? presentFormatted
      : formatStructuredAddress(permanentDetail);

    if (isReq('presentAddress') && !presentFormatted) {
      setErrorMsg('Please complete Present Address details.');
      return;
    }

    for (const f of admissionFormConfig.customFields) {
      if (f.required && !(customAnswers[f.label] || '').trim()) {
        setErrorMsg(`Please complete required field: ${f.label}`);
        return;
      }
    }

    const activeChannel = intake.feeAmount <= 0 ? 'Waived' : paymentChannel;
    if (
      intake.feeAmount > 0 &&
      (activeChannel === 'bKash' || activeChannel === 'Nagad' || activeChannel === 'Rocket') &&
      !trxId.trim() &&
      !(actor === 'admin' && adminMarkPaidNow)
    ) {
      setErrorMsg(`Enter the ${activeChannel} Transaction ID (TrxID) or select Pay at Office.`);
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/admissions/submit', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'erp-client',
        },
        body: JSON.stringify({
          applicationType: mode,
          linkedStudentId: mode === 're-admission' ? linkedStudentId || prefillStudent?.id : undefined,
          previousYear: reAdmissionContext?.sourceAcademicYear,
          previousClass: reAdmissionContext?.sourceClassName,
          previousRoll: reAdmissionContext?.sourceRollNumber,
          targetAcademicYear,
          assignedRoll: mode === 're-admission' ? assignedRoll : undefined,
          grade,
          group: effectiveGroup,
          sectionName: effectiveSection,
          shift,
          applicantName: fullName.trim(),
          banglaName: banglaName.trim() || undefined,
          gender,
          religionGroup,
          dateOfBirth: dobIso || undefined,
          birthRegOrNid: birthRegOrNid.trim() || undefined,
          bloodGroup: bloodGroup || undefined,
          phone: phoneNorm,
          avatarUrl: avatarUrl || undefined,
          avatarPublicId: avatarPublicId || undefined,
          fatherName: fatherName.trim() || undefined,
          fatherBanglaName: fatherBanglaName.trim() || undefined,
          fatherNid: fatherNid.trim() || undefined,
          fatherPhone: fatherPhone.trim() ? normalizeBdMobileInput(fatherPhone) : undefined,
          fatherOccupation: fatherOccupation.trim() || undefined,
          motherName: motherName.trim() || undefined,
          motherBanglaName: motherBanglaName.trim() || undefined,
          motherNid: motherNid.trim() || undefined,
          motherPhone: motherPhone.trim() ? normalizeBdMobileInput(motherPhone) : undefined,
          motherOccupation: motherOccupation.trim() || undefined,
          hasLocalGuardian,
          guardianName: hasLocalGuardian ? guardianName.trim() : undefined,
          guardianRelation: hasLocalGuardian ? guardianRelation.trim() : undefined,
          guardianPhone:
            hasLocalGuardian && guardianPhone.trim()
              ? normalizeBdMobileInput(guardianPhone)
              : undefined,
          presentAddress: presentFormatted || undefined,
          permanentAddress: permanentFormatted || undefined,
          presentAddressDetail: presentDetail,
          permanentAddressDetail: sameAsPresent ? presentDetail : permanentDetail,
          sameAsPresentAddress: sameAsPresent,
          previousInstitute: previousInstitute.trim() || undefined,
          previousGpa: previousGpa.trim() || undefined,
          electiveSubjectIds,
          optionalFourthSubjectId: optionalFourthSubjectId || undefined,
          customFields,
          customAnswers,
          paymentChannel: activeChannel,
          trxId: trxId.trim() || undefined,
          senderPhone: senderPhone.trim() ? normalizeBdMobileInput(senderPhone) : undefined,
          markPaidNow: actor === 'admin' ? adminMarkPaidNow : false,
          completeImmediately: actor === 'admin' && mode === 're-admission' ? adminCompleteReAdmissionNow : false,
        }),
      });

      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        application?: AdmissionApplication;
        invoice?: StudentInvoice | null;
        student?: Student | null;
      };

      if (!res.ok || !json.ok || !json.application) {
        setErrorMsg(json.error || 'Unable to submit application. Please verify all fields.');
        return;
      }

      onSuccess({
        application: json.application,
        invoice: json.invoice || null,
        student: json.student || null,
      });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Network error submitting admission form.');
    } finally {
      setSubmitting(false);
    }
  };

  const presentDistricts = getDistrictsByDivision(presentDetail.division);
  const presentUpazilas = getUpazilasByDistrict(presentDetail.division, presentDetail.district);
  const permanentDistricts = getDistrictsByDivision(permanentDetail.division);
  const permanentUpazilas = getUpazilasByDistrict(permanentDetail.division, permanentDetail.district);

  return (
    <form onSubmit={handleSubmit} className="space-y-6 text-xs">
      {errorMsg && (
        <div className="p-3.5 rounded-xl bg-error-container border border-error/30 text-on-error-container font-semibold flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* SECTION 0: PHOTO & RE-ADMISSION SUMMARY */}
      {(!isHidden('avatarUrl') || mode === 're-admission') && (
        <div className="p-4 sm:p-5 rounded-2xl bg-surface-container-low/70 border border-outline-variant/25 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          {!isHidden('avatarUrl') && (
            <div className="flex items-center gap-4">
              <div className="w-16 h-20 rounded-xl bg-white border border-outline-variant/40 overflow-hidden flex items-center justify-center shrink-0">
                {avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt="Candidate"
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <Camera className="w-5 h-5 text-on-surface-variant" />
                )}
              </div>
              <div className="space-y-1.5">
                <div className="font-bold text-on-surface">
                  Passport Size Photo (35:45) {isReq('avatarUrl') ? '*' : '(Optional)'}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={photoUploading}
                    onClick={() => photoInputRef.current?.click()}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-outline-variant/40 hover:bg-surface-container font-semibold cursor-pointer"
                  >
                    {photoUploading ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Camera className="w-3.5 h-3.5" />
                    )}
                    <span>{avatarUrl ? 'Replace Photo' : 'Upload Photo'}</span>
                  </button>
                  {avatarUrl && (
                    <button
                      type="button"
                      onClick={() => {
                        setAvatarUrl('');
                        setAvatarPublicId('');
                      }}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-error hover:bg-error-container/30 font-semibold cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Remove
                    </button>
                  )}
                  <input
                    ref={photoInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handlePhotoUpload}
                    className="hidden"
                  />
                </div>
              </div>
            </div>
          )}

          {mode === 're-admission' && reAdmissionContext && (
            <div className="p-3 rounded-xl bg-white border border-emerald-200 space-y-0.5 text-[11px]">
              <div className="font-bold text-emerald-900 uppercase tracking-wider">
                Promoted Re-Admission Record Verified
              </div>
              <div className="text-on-surface-variant">
                Previous: <strong>{reAdmissionContext.sourceClassName}</strong> (Roll #
                <span className="font-mono font-bold tabular-nums">
                  {reAdmissionContext.sourceRollNumber}
                </span>
                , {reAdmissionContext.sourceAcademicYear})
              </div>
              <div className="text-on-surface">
                Target Promotion: <strong>{grade}</strong> &bull; Year{' '}
                <strong className="font-mono tabular-nums">{targetAcademicYear}</strong> &bull;
                New Roll #<strong className="font-mono tabular-nums">{assignedRoll}</strong>
              </div>
            </div>
          )}
        </div>
      )}

      {/* SECTION 1: ACADEMIC PLACEMENT */}
      <div className="p-4 sm:p-5 rounded-2xl bg-white border border-outline-variant/25 space-y-4">
        <div className="flex items-center gap-2 border-b border-outline-variant/20 pb-2.5">
          <GraduationCap className="w-4 h-4 text-primary-container" />
          <h3 className="text-sm font-bold text-on-surface">
            1. Academic Class, Cohort &amp; Year Placement
          </h3>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          <div>
            <label className="block font-semibold text-on-surface mb-1">
              {mode === 're-admission' ? 'Promoted Target Class *' : 'Applying Class *'}
            </label>
            {mode === 're-admission' && actor === 'public' ? (
              <div className="px-3 py-2.5 rounded-xl bg-surface-container-low border border-outline-variant/30 font-bold text-on-surface">
                {grade}
              </div>
            ) : (
              <select
                value={grade}
                onChange={(e) => handleClassChange(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl bg-surface-container-low border border-outline-variant/40 text-sm font-semibold"
              >
                {selectableClasses.map((c) => (
                  <option key={c.id} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div>
            <label className="block font-semibold text-on-surface mb-1">Academic Year / Session</label>
            <input
              type="text"
              value={targetAcademicYear}
              readOnly={mode === 're-admission' && actor === 'public'}
              onChange={(e) => setTargetAcademicYear(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl bg-surface-container-low border border-outline-variant/40 text-sm font-mono font-bold tabular-nums"
            />
          </div>

          <div>
            <label className="block font-semibold text-on-surface mb-1">Academic Group</label>
            {!hasGroups ? (
              <div className="px-3 py-2.5 rounded-xl bg-surface-container text-sm font-medium text-on-surface-variant">
                General (Single Track)
              </div>
            ) : (
              <select
                value={effectiveGroup}
                onChange={(e) => {
                  const nextGrp = e.target.value as AcademicGroup;
                  setGroup(nextGrp);
                  const secs = getEffectiveSectionsForClassGroup(selectedClassObj, nextGrp);
                  setSectionName(secs[0] || 'Common');
                }}
                className="w-full px-3 py-2.5 rounded-xl bg-surface-container-low border border-outline-variant/40 text-sm font-semibold"
              >
                {groupOptions.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div>
            <label className="block font-semibold text-on-surface mb-1">Shift</label>
            <select
              value={shift}
              onChange={(e) => setShift(e.target.value as ShiftType)}
              className="w-full px-3 py-2.5 rounded-xl bg-surface-container-low border border-outline-variant/40 text-sm font-semibold"
            >
              {shiftOptions.map((sh) => (
                <option key={sh} value={sh}>
                  {sh} Shift
                </option>
              ))}
            </select>
          </div>

          {!isSingleBatchCohort(sectionOptions) && (
            <div>
              <label className="block font-semibold text-on-surface mb-1">Preferred Section</label>
              <select
                value={effectiveSection}
                onChange={(e) => setSectionName(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl bg-surface-container-low border border-outline-variant/40 text-sm font-semibold"
              >
                {sectionOptions.map((sec) => (
                  <option key={sec} value={sec}>
                    {sec === 'Common' ? 'Combined Cohort' : `Section ${sec}`}
                  </option>
                ))}
              </select>
            </div>
          )}

          {mode === 're-admission' && (
            <div>
              <label className="block font-semibold text-on-surface mb-1">Assigned New Roll</label>
              <input
                type="number"
                min={1}
                readOnly={actor === 'public'}
                value={assignedRoll}
                onChange={(e) => setAssignedRoll(Math.max(1, Number(e.target.value) || 1))}
                className="w-full px-3 py-2.5 rounded-xl bg-surface-container-low border border-outline-variant/40 text-sm font-mono font-bold tabular-nums"
              />
            </div>
          )}
        </div>

        {/* Elective & 4th Subject Selection if class has electives */}
        {(fourthSubjectPool.length > 0 || electivePool.length > 0) && (
          <div className="pt-2 border-t border-outline-variant/15 grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            {fourthSubjectPool.length > 0 && (
              <div>
                <label className="block font-semibold text-on-surface mb-1 flex items-center gap-1.5">
                  <BookOpen className="w-3.5 h-3.5 text-primary-container" />
                  Optional 4th Subject (Optional)
                </label>
                <select
                  value={optionalFourthSubjectId}
                  onChange={(e) => setOptionalFourthSubjectId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/40 text-xs font-semibold"
                >
                  <option value="">-- Select Later --</option>
                  {fourthSubjectPool.map((sub) => (
                    <option key={sub.id} value={sub.id}>
                      {sub.code} — {sub.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {electivePool.length > 0 && (
              <div>
                <label className="block font-semibold text-on-surface mb-1">
                  Group Elective Subjects (Optional)
                </label>
                <div className="flex flex-wrap gap-2">
                  {electivePool.slice(0, 6).map((sub) => {
                    const checked = electiveSubjectIds.includes(sub.id);
                    return (
                      <label
                        key={sub.id}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[11px] font-medium cursor-pointer ${
                          checked
                            ? 'bg-primary-container/10 border-primary-container text-primary-container'
                            : 'bg-surface-container-low border-outline-variant/30 text-on-surface'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) =>
                            setElectiveSubjectIds((prev) =>
                              e.target.checked
                                ? [...prev, sub.id]
                                : prev.filter((x) => x !== sub.id)
                            )
                          }
                        />
                        <span>{sub.name}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* SECTION 2: PERSONAL INFORMATION */}
      <div className="p-4 sm:p-5 rounded-2xl bg-white border border-outline-variant/25 space-y-4">
        <div className="flex items-center gap-2 border-b border-outline-variant/20 pb-2.5">
          <User className="w-4 h-4 text-primary-container" />
          <h3 className="text-sm font-bold text-on-surface">2. Student Personal Information</h3>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
          <div>
            <label className="block font-semibold text-on-surface mb-1">
              Student Name (English) *
            </label>
            <input
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="e.g. Arian Hasan"
              className="w-full px-3 py-2.5 rounded-xl bg-surface-container-low border border-outline-variant/40 text-sm"
            />
          </div>

          {!isHidden('banglaName') && (
            <div>
              <label className="block font-semibold text-on-surface mb-1">
                Student Name (Bangla) {isReq('banglaName') ? '*' : '(Optional)'}
              </label>
              <input
                type="text"
                required={isReq('banglaName')}
                value={banglaName}
                onChange={(e) => setBanglaName(e.target.value)}
                placeholder="যেমন: আরিয়ান হাসান"
                className="w-full px-3 py-2.5 rounded-xl bg-surface-container-low border border-outline-variant/40 text-sm"
              />
            </div>
          )}

          {!isHidden('phone') && (
            <div>
              <label className="block font-semibold text-on-surface mb-1">
                Primary Mobile (SMS &amp; Portal) {isReq('phone') ? '*' : '(Optional)'}
              </label>
              <input
                type="tel"
                required={isReq('phone')}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="017XXXXXXXX"
                className="w-full px-3 py-2.5 rounded-xl bg-surface-container-low border border-outline-variant/40 text-sm font-mono tabular-nums"
              />
            </div>
          )}

          {!isHidden('dateOfBirth') && (
            <div>
              <label className="block font-semibold text-on-surface mb-1">
                Date of Birth (DD/MM/YYYY) {isReq('dateOfBirth') ? '*' : '(Optional)'}
              </label>
              <input
                type="text"
                required={isReq('dateOfBirth')}
                value={dobInput}
                onChange={(e) => setDobInput(autoFormatDDMMYYYYInput(e.target.value))}
                placeholder="DD/MM/YYYY"
                className="w-full px-3 py-2.5 rounded-xl bg-surface-container-low border border-outline-variant/40 text-sm font-mono tabular-nums"
              />
            </div>
          )}

          {!isHidden('gender') && (
            <div>
              <label className="block font-semibold text-on-surface mb-1">
                Gender {isReq('gender') ? '*' : ''}
              </label>
              <select
                value={gender}
                onChange={(e) => setGender(e.target.value as GenderType)}
                className="w-full px-3 py-2.5 rounded-xl bg-surface-container-low border border-outline-variant/40 text-sm font-semibold"
              >
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Other">Other</option>
              </select>
            </div>
          )}

          {!isHidden('religionGroup') && (
            <div>
              <label className="block font-semibold text-on-surface mb-1">
                Religion {isReq('religionGroup') ? '*' : ''}
              </label>
              <select
                value={religionGroup}
                onChange={(e) => setReligionGroup(e.target.value as ReligionGroup)}
                className="w-full px-3 py-2.5 rounded-xl bg-surface-container-low border border-outline-variant/40 text-sm font-semibold"
              >
                <option value="Islam">Islam</option>
                <option value="Hinduism">Hinduism</option>
                <option value="Buddhism">Buddhism</option>
                <option value="Christianity">Christianity</option>
                <option value="Other">Other</option>
              </select>
            </div>
          )}

          {!isHidden('birthRegOrNid') && (
            <div>
              <label className="block font-semibold text-on-surface mb-1">
                Birth Reg No. (17-Digit) {isReq('birthRegOrNid') ? '*' : '(Optional)'}
              </label>
              <input
                type="text"
                required={isReq('birthRegOrNid')}
                value={birthRegOrNid}
                onChange={(e) => setBirthRegOrNid(e.target.value)}
                placeholder="17-digit Birth Certificate No."
                className="w-full px-3 py-2.5 rounded-xl bg-surface-container-low border border-outline-variant/40 text-sm font-mono tabular-nums"
              />
            </div>
          )}

          {!isHidden('bloodGroup') && (
            <div>
              <label className="block font-semibold text-on-surface mb-1">
                Blood Group {isReq('bloodGroup') ? '*' : '(Optional)'}
              </label>
              <select
                value={bloodGroup}
                required={isReq('bloodGroup')}
                onChange={(e) => setBloodGroup(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl bg-surface-container-low border border-outline-variant/40 text-sm font-semibold"
              >
                <option value="">-- Select --</option>
                {BLOOD_GROUPS.map((bg) => (
                  <option key={bg} value={bg}>
                    {bg}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block font-semibold text-on-surface mb-1">
              Previous School / Institute (Optional)
            </label>
            <input
              type="text"
              value={previousInstitute}
              onChange={(e) => setPreviousInstitute(e.target.value)}
              placeholder="Previous institute name"
              className="w-full px-3 py-2.5 rounded-xl bg-surface-container-low border border-outline-variant/40 text-sm"
            />
          </div>

          <div>
            <label className="block font-semibold text-on-surface mb-1">
              Previous Exam GPA / Score (Optional)
            </label>
            <input
              type="text"
              value={previousGpa}
              onChange={(e) => setPreviousGpa(e.target.value)}
              placeholder="e.g. 5.00"
              className="w-full px-3 py-2.5 rounded-xl bg-surface-container-low border border-outline-variant/40 text-sm font-mono tabular-nums"
            />
          </div>
        </div>
      </div>

      {/* SECTION 3: PARENTS & LOCAL GUARDIAN */}
      <div className="p-4 sm:p-5 rounded-2xl bg-white border border-outline-variant/25 space-y-4">
        <div className="flex items-center justify-between gap-2 border-b border-outline-variant/20 pb-2.5">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-primary-container" />
            <h3 className="text-sm font-bold text-on-surface">3. Parents &amp; Guardian Information</h3>
          </div>
          <label className="inline-flex items-center gap-1.5 font-semibold text-on-surface-variant cursor-pointer">
            <input
              type="checkbox"
              checked={hasLocalGuardian}
              onChange={(e) => setHasLocalGuardian(e.target.checked)}
            />
            <span>Add Local Guardian</span>
          </label>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {!isHidden('fatherName') && (
            <div>
              <label className="block font-semibold text-on-surface mb-1">
                Father Name (English) {isReq('fatherName') ? '*' : ''}
              </label>
              <input
                type="text"
                required={isReq('fatherName')}
                value={fatherName}
                onChange={(e) => setFatherName(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl bg-surface-container-low border border-outline-variant/40 text-sm"
              />
            </div>
          )}

          {!isHidden('fatherBanglaName') && (
            <div>
              <label className="block font-semibold text-on-surface mb-1">
                Father Name (Bangla) {isReq('fatherBanglaName') ? '*' : '(Optional)'}
              </label>
              <input
                type="text"
                required={isReq('fatherBanglaName')}
                value={fatherBanglaName}
                onChange={(e) => setFatherBanglaName(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl bg-surface-container-low border border-outline-variant/40 text-sm"
              />
            </div>
          )}

          {!isHidden('fatherPhone') && (
            <div>
              <label className="block font-semibold text-on-surface mb-1">
                Father Mobile {isReq('fatherPhone') ? '*' : '(Optional)'}
              </label>
              <input
                type="tel"
                required={isReq('fatherPhone')}
                value={fatherPhone}
                onChange={(e) => setFatherPhone(e.target.value)}
                placeholder="017XXXXXXXX"
                className="w-full px-3 py-2.5 rounded-xl bg-surface-container-low border border-outline-variant/40 text-sm font-mono tabular-nums"
              />
            </div>
          )}

          {!isHidden('fatherNid') && (
            <div>
              <label className="block font-semibold text-on-surface mb-1">
                Father NID No. {isReq('fatherNid') ? '*' : '(Optional)'}
              </label>
              <input
                type="text"
                required={isReq('fatherNid')}
                value={fatherNid}
                onChange={(e) => setFatherNid(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl bg-surface-container-low border border-outline-variant/40 text-sm font-mono tabular-nums"
              />
            </div>
          )}

          {!isHidden('fatherProfession') && (
            <div>
              <label className="block font-semibold text-on-surface mb-1">
                Father Profession {isReq('fatherProfession') ? '*' : '(Optional)'}
              </label>
              <input
                type="text"
                required={isReq('fatherProfession')}
                value={fatherOccupation}
                onChange={(e) => setFatherOccupation(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl bg-surface-container-low border border-outline-variant/40 text-sm"
              />
            </div>
          )}

          {!isHidden('motherName') && (
            <div>
              <label className="block font-semibold text-on-surface mb-1">
                Mother Name (English) {isReq('motherName') ? '*' : ''}
              </label>
              <input
                type="text"
                required={isReq('motherName')}
                value={motherName}
                onChange={(e) => setMotherName(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl bg-surface-container-low border border-outline-variant/40 text-sm"
              />
            </div>
          )}

          {!isHidden('motherBanglaName') && (
            <div>
              <label className="block font-semibold text-on-surface mb-1">
                Mother Name (Bangla) {isReq('motherBanglaName') ? '*' : '(Optional)'}
              </label>
              <input
                type="text"
                required={isReq('motherBanglaName')}
                value={motherBanglaName}
                onChange={(e) => setMotherBanglaName(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl bg-surface-container-low border border-outline-variant/40 text-sm"
              />
            </div>
          )}

          {!isHidden('motherPhone') && (
            <div>
              <label className="block font-semibold text-on-surface mb-1">
                Mother Mobile {isReq('motherPhone') ? '*' : '(Optional)'}
              </label>
              <input
                type="tel"
                required={isReq('motherPhone')}
                value={motherPhone}
                onChange={(e) => setMotherPhone(e.target.value)}
                placeholder="018XXXXXXXX"
                className="w-full px-3 py-2.5 rounded-xl bg-surface-container-low border border-outline-variant/40 text-sm font-mono tabular-nums"
              />
            </div>
          )}

          {!isHidden('motherNid') && (
            <div>
              <label className="block font-semibold text-on-surface mb-1">
                Mother NID No. {isReq('motherNid') ? '*' : '(Optional)'}
              </label>
              <input
                type="text"
                required={isReq('motherNid')}
                value={motherNid}
                onChange={(e) => setMotherNid(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl bg-surface-container-low border border-outline-variant/40 text-sm font-mono tabular-nums"
              />
            </div>
          )}

          {!isHidden('motherProfession') && (
            <div>
              <label className="block font-semibold text-on-surface mb-1">
                Mother Profession {isReq('motherProfession') ? '*' : '(Optional)'}
              </label>
              <input
                type="text"
                required={isReq('motherProfession')}
                value={motherOccupation}
                onChange={(e) => setMotherOccupation(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl bg-surface-container-low border border-outline-variant/40 text-sm"
              />
            </div>
          )}

          {hasLocalGuardian && (
            <>
              <div>
                <label className="block font-semibold text-on-surface mb-1">Local Guardian Name</label>
                <input
                  type="text"
                  value={guardianName}
                  onChange={(e) => setGuardianName(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl bg-surface-container-low border border-outline-variant/40 text-sm"
                />
              </div>
              <div>
                <label className="block font-semibold text-on-surface mb-1">Relationship</label>
                <input
                  type="text"
                  value={guardianRelation}
                  onChange={(e) => setGuardianRelation(e.target.value)}
                  placeholder="e.g. Uncle / Brother"
                  className="w-full px-3 py-2.5 rounded-xl bg-surface-container-low border border-outline-variant/40 text-sm"
                />
              </div>
              <div>
                <label className="block font-semibold text-on-surface mb-1">Guardian Mobile</label>
                <input
                  type="tel"
                  value={guardianPhone}
                  onChange={(e) => setGuardianPhone(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl bg-surface-container-low border border-outline-variant/40 text-sm font-mono tabular-nums"
                />
              </div>
            </>
          )}
        </div>
      </div>

      {/* SECTION 4: STRUCTURED BANGLADESH ADDRESS */}
      {(!isHidden('presentAddress') || !isHidden('permanentAddress')) && (
        <div className="p-4 sm:p-5 rounded-2xl bg-white border border-outline-variant/25 space-y-4">
          <div className="flex items-center justify-between gap-2 border-b border-outline-variant/20 pb-2.5">
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-primary-container" />
              <h3 className="text-sm font-bold text-on-surface">4. Address Information</h3>
            </div>
            {!isHidden('permanentAddress') && (
              <label className="inline-flex items-center gap-1.5 font-semibold text-on-surface-variant cursor-pointer">
                <input
                  type="checkbox"
                  checked={sameAsPresent}
                  onChange={(e) => setSameAsPresent(e.target.checked)}
                />
                <span>Permanent Address same as Present</span>
              </label>
            )}
          </div>

          {!isHidden('presentAddress') && (
            <div className="space-y-2">
              <div className="font-semibold text-on-surface">
                Present Address {isReq('presentAddress') ? '*' : ''}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                <select
                  value={presentDetail.division}
                  onChange={(e) =>
                    setPresentDetail({
                      ...presentDetail,
                      division: e.target.value,
                      district: '',
                      upazila: '',
                    })
                  }
                  className="px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/40 text-xs font-semibold"
                >
                  <option value="">Division</option>
                  {BD_DIVISIONS.map((d) => (
                    <option key={d.name} value={d.name}>
                      {d.name}
                    </option>
                  ))}
                </select>
                <select
                  value={presentDetail.district}
                  onChange={(e) =>
                    setPresentDetail({ ...presentDetail, district: e.target.value, upazila: '' })
                  }
                  className="px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/40 text-xs font-semibold"
                >
                  <option value="">District</option>
                  {presentDistricts.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
                <select
                  value={presentDetail.upazila}
                  onChange={(e) => setPresentDetail({ ...presentDetail, upazila: e.target.value })}
                  className="px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/40 text-xs font-semibold"
                >
                  <option value="">Upazila / Thana</option>
                  {presentUpazilas.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  placeholder="Village / House / Road"
                  value={presentDetail.villageRoad}
                  onChange={(e) =>
                    setPresentDetail({ ...presentDetail, villageRoad: e.target.value })
                  }
                  className="px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/40 text-xs"
                />
                <input
                  type="text"
                  placeholder="Post Office & Code"
                  value={presentDetail.postOffice}
                  onChange={(e) =>
                    setPresentDetail({ ...presentDetail, postOffice: e.target.value })
                  }
                  className="px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/40 text-xs"
                />
              </div>
            </div>
          )}

          {!isHidden('permanentAddress') && !sameAsPresent && (
            <div className="space-y-2 pt-2 border-t border-outline-variant/15">
              <div className="font-semibold text-on-surface">
                Permanent Address {isReq('permanentAddress') ? '*' : ''}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                <select
                  value={permanentDetail.division}
                  onChange={(e) =>
                    setPermanentDetail({
                      ...permanentDetail,
                      division: e.target.value,
                      district: '',
                      upazila: '',
                    })
                  }
                  className="px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/40 text-xs font-semibold"
                >
                  <option value="">Division</option>
                  {BD_DIVISIONS.map((d) => (
                    <option key={d.name} value={d.name}>
                      {d.name}
                    </option>
                  ))}
                </select>
                <select
                  value={permanentDetail.district}
                  onChange={(e) =>
                    setPermanentDetail({ ...permanentDetail, district: e.target.value, upazila: '' })
                  }
                  className="px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/40 text-xs font-semibold"
                >
                  <option value="">District</option>
                  {permanentDistricts.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
                <select
                  value={permanentDetail.upazila}
                  onChange={(e) =>
                    setPermanentDetail({ ...permanentDetail, upazila: e.target.value })
                  }
                  className="px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/40 text-xs font-semibold"
                >
                  <option value="">Upazila / Thana</option>
                  {permanentUpazilas.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  placeholder="Village / House / Road"
                  value={permanentDetail.villageRoad}
                  onChange={(e) =>
                    setPermanentDetail({ ...permanentDetail, villageRoad: e.target.value })
                  }
                  className="px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/40 text-xs"
                />
                <input
                  type="text"
                  placeholder="Post Office & Code"
                  value={permanentDetail.postOffice}
                  onChange={(e) =>
                    setPermanentDetail({ ...permanentDetail, postOffice: e.target.value })
                  }
                  className="px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/40 text-xs"
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* CUSTOM FORM FIELDS */}
      {((admissionFormConfig.customFields?.length || 0) > 0 ||
        (schema.customFields?.filter((c) => c.requirement !== 'hidden').length || 0) > 0) && (
        <div className="p-4 sm:p-5 rounded-2xl bg-white border border-outline-variant/25 space-y-3">
          <h3 className="text-sm font-bold text-on-surface border-b border-outline-variant/20 pb-2">
            5. Additional Institutional Questions
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            {schema.customFields
              ?.filter((c) => c.requirement !== 'hidden')
              .map((cf) => (
                <div key={cf.id}>
                  <label className="block font-semibold text-on-surface mb-1">
                    {cf.label} {cf.requirement === 'required' || cf.required ? '*' : ''}
                  </label>
                  <input
                    type={cf.type === 'number' ? 'number' : 'text'}
                    required={cf.requirement === 'required' || cf.required}
                    value={customFields[cf.label] || ''}
                    onChange={(e) =>
                      setCustomFields((prev) => ({ ...prev, [cf.label]: e.target.value }))
                    }
                    className="w-full px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/40 text-sm"
                  />
                </div>
              ))}
            {admissionFormConfig.customFields.map((field) => (
              <div key={field.id}>
                <label className="block font-semibold text-on-surface mb-1">
                  {field.label} {field.required ? '*' : '(Optional)'}
                </label>
                <input
                  type="text"
                  required={field.required}
                  value={customAnswers[field.label] || ''}
                  onChange={(e) =>
                    setCustomAnswers((prev) => ({ ...prev, [field.label]: e.target.value }))
                  }
                  className="w-full px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/40 text-sm"
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SECTION 6: ADMIN-SET FEE & MFS GATEWAY PAYMENT */}
      <div className="p-4 sm:p-5 rounded-2xl bg-surface-container-low/80 border border-outline-variant/30 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-outline-variant/20 pb-2.5">
          <div className="flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-primary-container" />
            <h3 className="text-sm font-bold text-on-surface">
              Fee Summary &amp; MFS Payment ({grade} &mdash;{' '}
              {mode === 're-admission' ? 'Re-Admission' : 'New Admission'})
            </h3>
          </div>
          <div className="font-mono font-bold text-base tabular-nums text-primary-container">
            Total Payable: ৳{intake.feeAmount.toLocaleString()}.00
          </div>
        </div>

        {intake.feeAmount <= 0 ? (
          <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 font-semibold flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>No admission fee is required for {grade}. Submit directly to generate your slip.</span>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Breakdown */}
            {intake.feeBreakdown.length > 0 && (
              <div className="bg-white rounded-xl border border-outline-variant/25 divide-y divide-outline-variant/15">
                {intake.feeBreakdown.map((item, idx) => (
                  <div
                    key={`${item.label}-${idx}`}
                    className="px-3.5 py-2 flex items-center justify-between text-xs"
                  >
                    <span className="font-medium text-on-surface">{item.label}</span>
                    <span className="font-mono font-bold tabular-nums">
                      ৳{item.amount.toLocaleString()}.00
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Payment Channel Selector */}
            <div className="space-y-2">
              <label className="block font-semibold text-on-surface">Select Payment Method *</label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {enabledMfsChannels.map((ch) => (
                  <button
                    key={ch.id}
                    type="button"
                    onClick={() => setPaymentChannel(ch.id)}
                    className={`p-2.5 rounded-xl border text-left cursor-pointer transition-colors ${
                      paymentChannel === ch.id
                        ? 'bg-primary-container text-on-primary border-primary-container'
                        : 'bg-white text-on-surface border-outline-variant/40 hover:bg-surface-container-low'
                    }`}
                  >
                    <div className="font-bold text-xs flex items-center gap-1.5">
                      <Smartphone className="w-3.5 h-3.5" />
                      {ch.label}
                    </div>
                    <div
                      className={`text-[10px] font-mono mt-0.5 ${
                        paymentChannel === ch.id ? 'text-on-primary/90' : 'text-on-surface-variant'
                      }`}
                    >
                      {ch.merchantNumber || 'Merchant Active'}
                    </div>
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setPaymentChannel('Cash')}
                  className={`p-2.5 rounded-xl border text-left cursor-pointer transition-colors ${
                    paymentChannel === 'Cash'
                      ? 'bg-primary-container text-on-primary border-primary-container'
                      : 'bg-white text-on-surface border-outline-variant/40 hover:bg-surface-container-low'
                  }`}
                >
                  <div className="font-bold text-xs">
                    {actor === 'admin' ? 'Cash at Counter' : 'Pay at Office'}
                  </div>
                  <div
                    className={`text-[10px] mt-0.5 ${
                      paymentChannel === 'Cash' ? 'text-on-primary/90' : 'text-on-surface-variant'
                    }`}
                  >
                    Generates Unpaid Slip
                  </div>
                </button>
              </div>
            </div>

            {(paymentChannel === 'bKash' ||
              paymentChannel === 'Nagad' ||
              paymentChannel === 'Rocket') && (
              <div className="p-3.5 rounded-xl bg-white border border-outline-variant/30 space-y-3">
                <div className="text-[11px] text-on-surface-variant">
                  Send exact{' '}
                  <strong className="font-mono text-on-surface">
                    ৳{intake.feeAmount.toLocaleString()}
                  </strong>{' '}
                  via <strong>{paymentChannel}</strong> to{' '}
                  <strong className="font-mono text-primary-container">
                    {enabledMfsChannels.find((c) => c.id === paymentChannel)?.merchantNumber ||
                      'Institute Merchant Wallet'}
                  </strong>
                  , then enter your Transaction ID below.
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-on-surface mb-1">
                      {paymentChannel} Transaction ID (TrxID){' '}
                      {actor === 'admin' && adminMarkPaidNow ? '(Optional)' : '*'}
                    </label>
                    <input
                      type="text"
                      required={!(actor === 'admin' && adminMarkPaidNow)}
                      value={trxId}
                      onChange={(e) => setTrxId(e.target.value.toUpperCase())}
                      placeholder="e.g. BL9K20X7PQ"
                      className="w-full px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/40 font-mono font-bold text-xs uppercase"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-on-surface mb-1">
                      Sender Wallet Number (Optional)
                    </label>
                    <input
                      type="tel"
                      value={senderPhone}
                      onChange={(e) => setSenderPhone(e.target.value)}
                      placeholder="01XXXXXXXXX"
                      className="w-full px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/40 font-mono text-xs tabular-nums"
                    />
                  </div>
                </div>
              </div>
            )}

            {actor === 'admin' && (
              <div className="p-3 rounded-xl bg-white border border-emerald-200 flex flex-wrap items-center gap-4 text-xs">
                <label className="inline-flex items-center gap-2 font-semibold text-emerald-900 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={adminMarkPaidNow}
                    onChange={(e) => setAdminMarkPaidNow(e.target.checked)}
                  />
                  <span>Mark Fee Paid Now &amp; Sync Billing Ledger + SMS Log</span>
                </label>
                {mode === 're-admission' && (
                  <label className="inline-flex items-center gap-2 font-semibold text-on-surface cursor-pointer">
                    <input
                      type="checkbox"
                      checked={adminCompleteReAdmissionNow}
                      onChange={(e) => setAdminCompleteReAdmissionNow(e.target.checked)}
                    />
                    <span>Complete Re-admission Promotion Immediately</span>
                  </label>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Submit Actions */}
      <div className="flex flex-wrap items-center justify-end gap-3 pt-2">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="px-5 py-2.5 rounded-xl bg-surface-container hover:bg-surface-container-high font-semibold text-on-surface cursor-pointer min-h-[42px]"
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          disabled={submitting}
          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-primary-container hover:bg-primary disabled:opacity-50 text-on-primary text-xs font-bold shadow-sm cursor-pointer min-h-[42px]"
        >
          {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
          <KeyRound className="w-4 h-4" />
          <span>
            {mode === 're-admission'
              ? actor === 'admin'
                ? 'Save Re-Admission & Print Slip / Receipt'
                : 'Submit Re-Admission Form & Generate Slip'
              : 'Submit Admission Form & Generate Slip'}
          </span>
        </button>
      </div>
    </form>
  );
}
