'use client';

import { useRef, useState } from 'react';
import {
  AcademicClass,
  AcademicGroup,
  GenderType,
  InstituteRules,
  ReligionGroup,
  ShiftType,
  StructuredAddress,
  Student,
  StudentCoreFieldKey,
  Subject,
} from '@/lib/types';
import {
  EMPTY_STRUCTURED_ADDRESS,
  autoFormatDDMMYYYYInput,
  formatISOToDDMMYYYY,
  formatStructuredAddress,
  generateSixDigitPin,
  getEffectiveStudentSchema,
  getFieldRequirement,
  getNextStudentSystemIdFromStudents,
  isValidBdBirthReg,
  isValidBdMobile,
  isValidBdNid,
  isValidSixDigitPin,
  normalizeBdMobileInput,
  parseDDMMYYYYToISO,
} from '@/lib/student-schema';
import {
  formatGroupSectionDisplay,
  getAutoRoutedSubjectsForStudent,
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
import {
  AlertCircle,
  ArrowLeft,
  BookOpen,
  Calendar,
  Camera,
  CheckCircle2,
  GraduationCap,
  Image as ImageIcon,
  KeyRound,
  Loader2,
  MapPin,
  RefreshCw,
  Scissors,
  Trash2,
  User,
  Users,
  X,
} from 'lucide-react';

interface StudentFormViewProps {
  initialStudent?: Student | null;
  mode: 'add' | 'edit';
  academicClasses: AcademicClass[];
  subjects: Subject[];
  instituteRules: InstituteRules;
  existingStudents: Student[];
  onSave: (
    payload: Partial<Student> & Record<string, unknown>,
    passwordPin: string
  ) => Promise<string | null> | void;
  onCancel: () => void;
}

const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'];

function resolveInitialAddressDetail(
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

function getActiveShiftsForClass(
  clsObj: AcademicClass | undefined,
  rules: InstituteRules
): ShiftType[] {
  const clsShifts = clsObj?.shifts?.length ? clsObj.shifts : [];
  const ruleShifts = rules.enabledShifts?.length ? rules.enabledShifts : [];
  const merged = clsShifts.length > 0 ? clsShifts : ruleShifts;
  return merged.length > 0 ? merged : ['Morning'];
}

function classSupportsGroups(clsObj: AcademicClass | undefined): boolean {
  if (!clsObj) return false;
  if (clsObj.hasGroups === false) return false;
  if (clsObj.hasGroups === true) return true;
  return (clsObj.groups || []).some((g) => g !== 'General');
}

function classSupportsSections(
  clsObj: AcademicClass | undefined,
  group: AcademicGroup
): boolean {
  if (!clsObj) return false;
  if (clsObj.hasSections === false) return false;
  const secs = getEffectiveSectionsForClassGroup(clsObj, group);
  return !isSingleBatchCohort(secs);
}

export default function StudentFormView({
  initialStudent,
  mode,
  academicClasses,
  subjects,
  instituteRules,
  existingStudents,
  onSave,
  onCancel,
}: StudentFormViewProps) {
  const schema = getEffectiveStudentSchema(instituteRules);
  const prefix = (instituteRules.studentIdPrefix || 'AG').trim().toUpperCase().replace(/[^A-Z0-9]/g, '') || 'AG';
  const currentYear = instituteRules.activeAcademicYear || new Date().getFullYear();

  const isReq = (key: StudentCoreFieldKey): boolean =>
    getFieldRequirement(schema, key) === 'required';
  const isHidden = (key: StudentCoreFieldKey): boolean =>
    getFieldRequirement(schema, key) === 'hidden';

  const initialClassName = initialStudent?.className || academicClasses[0]?.name || 'Class 6';
  const initialClassObj = academicClasses.find((c) => c.name === initialClassName) || academicClasses[0];
  const initialHasGroups = classSupportsGroups(initialClassObj);
  const initialGroupOptions: AcademicGroup[] = initialHasGroups
    ? initialClassObj?.groups?.length
      ? initialClassObj.groups
      : ['Science', 'Humanities', 'Business Studies']
    : ['General'];
  const initialGroup: AcademicGroup =
    initialStudent?.group && initialGroupOptions.includes(initialStudent.group)
      ? initialStudent.group
      : initialGroupOptions[0] || 'General';
  const initialSectionList = getEffectiveSectionsForClassGroup(initialClassObj, initialGroup);
  const initialSection =
    initialStudent?.sectionName && initialSectionList.includes(initialStudent.sectionName)
      ? initialStudent.sectionName
      : initialSectionList[0] || 'Common';
  const initialShifts = getActiveShiftsForClass(initialClassObj, instituteRules);
  const initialShift: ShiftType =
    initialStudent?.shift && initialShifts.includes(initialStudent.shift)
      ? initialStudent.shift
      : initialShifts[0] || 'Morning';

  const computeNextRoll = (
    clsName: string,
    grp: AcademicGroup,
    secName: string,
    shft: ShiftType
  ): number => {
    const cohort = existingStudents.filter(
      (s) =>
        s.status !== 'Alumni' &&
        s.status !== 'Graduated' &&
        s.className === clsName &&
        (s.group || 'General') === grp &&
        (s.sectionName || 'Common') === secName &&
        (s.shift || 'Morning') === shft
    );
    return cohort.reduce((max, s) => Math.max(max, s.rollNumber || 0), 0) + 1;
  };

  const getFourthPool = (clsName: string, grp: AcademicGroup, gender: GenderType) =>
    sortSubjectsByOrder(
      subjects.filter(
        (s) =>
          s.canBeFourthSubject &&
          s.classLevel === clsName &&
          subjectAppliesToGroup(s, grp) &&
          isStudentGenderEligibleForSubject(s, gender)
      )
    );

  const getMainElectivesPool = (clsName: string, grp: AcademicGroup, gender: GenderType) =>
    sortSubjectsByOrder(
      subjects.filter(
        (s) =>
          !s.isCompulsory &&
          !s.excludeFromGpa &&
          !s.religionRestriction &&
          s.classLevel === clsName &&
          subjectAppliesToGroup(s, grp) &&
          isStudentGenderEligibleForSubject(s, gender)
      )
    );

  const initialPresentDetail = resolveInitialAddressDetail(
    initialStudent?.presentAddressDetail,
    initialStudent?.presentAddress || initialStudent?.address
  );
  const initialPermanentDetail = resolveInitialAddressDetail(
    initialStudent?.permanentAddressDetail,
    initialStudent?.permanentAddress
  );

  const [formData, setFormData] = useState(() => {
    const initialGender: GenderType = initialStudent?.gender || 'Male';
    return {
      // Photo
      avatarUrl: initialStudent?.avatarUrl || '',
      avatarPublicId: initialStudent?.avatarPublicId || '',

      // Section 1: Academic Information
      className: initialClassName,
      group: initialGroup,
      sectionName: initialSection,
      shift: initialShift,
      rollNumber:
        initialStudent?.rollNumber ||
        computeNextRoll(initialClassName, initialGroup, initialSection, initialShift),
      batchCycle:
        initialStudent?.batchCycle ||
        resolveDefaultBatchCycle(initialClassName, instituteRules, initialClassObj),
      registrationNumber: initialStudent?.registrationNumber || '',
      systemId: initialStudent?.systemId || '',
      passwordPin: mode === 'add' ? generateSixDigitPin() : '',
      phone: initialStudent?.phone || '',
      status: initialStudent?.status || ('Active' as Student['status']),
      electiveSubjectIds: initialStudent?.electiveSubjectIds || ([] as string[]),
      optionalFourthSubjectId:
        initialStudent?.optionalFourthSubjectId ??
        getFourthPool(initialClassName, initialGroup, initialGender)[0]?.id ??
        '',

      // Section 2: Personal Information
      fullName: initialStudent?.fullName || '',
      banglaName: initialStudent?.banglaName || '',
      gender: initialGender,
      religionGroup: initialStudent?.religionGroup || ('Islam' as ReligionGroup),
      dateOfBirthInput: initialStudent?.dateOfBirth
        ? formatISOToDDMMYYYY(initialStudent.dateOfBirth)
        : '',
      dateOfBirthIso: initialStudent?.dateOfBirth || '',
      birthRegOrNid: initialStudent?.birthRegOrNid || '',
      bloodGroup: initialStudent?.bloodGroup || '',

      // Section 3: Parents & Local Guardian
      fatherName: initialStudent?.fatherName || '',
      fatherBanglaName: initialStudent?.fatherBanglaName || '',
      fatherNid: initialStudent?.fatherNid || '',
      fatherPhone: initialStudent?.fatherPhone || '',
      fatherOccupation: initialStudent?.fatherOccupation || '',

      motherName: initialStudent?.motherName || '',
      motherBanglaName: initialStudent?.motherBanglaName || '',
      motherNid: initialStudent?.motherNid || '',
      motherPhone: initialStudent?.motherPhone || '',
      motherOccupation: initialStudent?.motherOccupation || '',

      hasLocalGuardian: Boolean(
        initialStudent?.hasLocalGuardian ||
          initialStudent?.guardianName ||
          initialStudent?.guardianPhone
      ),
      guardianName: initialStudent?.guardianName || '',
      guardianRelation: initialStudent?.guardianRelation || '',
      guardianPhone: initialStudent?.guardianPhone || '',

      // Section 4: Present & Permanent Address
      presentAddressDetail: initialPresentDetail,
      permanentAddressDetail: initialPermanentDetail,
      sameAsPresentAddress: Boolean(initialStudent?.sameAsPresentAddress),

      // Custom fields
      customFields: initialStudent?.customFields || ({} as Record<string, string>),
    };
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [photoStatusMsg, setPhotoStatusMsg] = useState<string | null>(null);

  // Interactive 35:45 Passport Photo Cropper state
  const [showCropper, setShowCropper] = useState(false);
  const [rawImageSrc, setRawImageSrc] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [imgRenderSize, setImgRenderSize] = useState({ w: 0, h: 0 });
  const [cropScale, setCropScale] = useState(0.85);
  const [cropPos, setCropPos] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{
    active: boolean;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
  }>({ active: false, startX: 0, startY: 0, origX: 0, origY: 0 });
  const imageRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const getCropDimensions = (w: number, h: number, scale: number) => {
    if (w <= 0 || h <= 0) return { cropW: 210, cropH: 270 };
    const maxW = Math.min(w, h * (35 / 45));
    const maxH = maxW * (45 / 35);
    return {
      cropW: maxW * scale,
      cropH: maxH * scale,
    };
  };

  const clampCropPos = (
    x: number,
    y: number,
    w: number,
    h: number,
    cropW: number,
    cropH: number
  ) => ({
    x: Math.max(0, Math.min(x, Math.max(0, w - cropW))),
    y: Math.max(0, Math.min(y, Math.max(0, h - cropH))),
  });

  const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setRawImageSrc(String(reader.result));
      setCropScale(0.85);
      setShowCropper(true);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleConfirmCrop = () => {
    const img = imageRef.current;
    const canvas = canvasRef.current;
    if (!img || !canvas || imgRenderSize.w <= 0 || imgRenderSize.h <= 0) return;

    const { cropW, cropH } = getCropDimensions(imgRenderSize.w, imgRenderSize.h, cropScale);
    const { x, y } = clampCropPos(
      cropPos.x,
      cropPos.y,
      imgRenderSize.w,
      imgRenderSize.h,
      cropW,
      cropH
    );

    canvas.width = 420;
    canvas.height = 540;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 420, 540);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    const scaleX = img.naturalWidth / imgRenderSize.w;
    const scaleY = img.naturalHeight / imgRenderSize.h;
    ctx.drawImage(
      img,
      x * scaleX,
      y * scaleY,
      cropW * scaleX,
      cropH * scaleY,
      0,
      0,
      420,
      540
    );

    canvas.toBlob(
      async (blob) => {
        if (!blob) return;
        setUploadingPhoto(true);
        setShowCropper(false);
        setPhotoStatusMsg(null);
        try {
          const fd = new FormData();
          fd.append('file', blob, 'passport_35x45.jpg');
          fd.append('folder', 'erp/students');
          if (formData.avatarPublicId) {
            fd.append('discardTempPublicId', formData.avatarPublicId);
          }

          const res = await fetch('/api/media/upload', {
            method: 'POST',
            headers: { 'x-requested-with': 'erp-client' },
            credentials: 'include',
            body: fd,
          });
          const data = await res.json();
          if (res.ok && data.url) {
            setFormData((prev) => ({
              ...prev,
              avatarUrl: data.url,
              avatarPublicId: data.publicId || '',
            }));
            setPhotoStatusMsg('Cropped (35:45 · 420×540 px) & uploaded.');
          } else {
            setServerError(data.error || 'Failed to upload passport photo.');
          }
        } catch {
          setServerError('Photo upload failed. Please check network & Cloudinary settings.');
        } finally {
          setUploadingPhoto(false);
        }
      },
      'image/jpeg',
      0.92
    );
  };

  const currentClassObj =
    academicClasses.find((c) => c.name === formData.className) || academicClasses[0];
  const hasGroups = classSupportsGroups(currentClassObj);
  const availableGroups: AcademicGroup[] = hasGroups
    ? currentClassObj?.groups?.length
      ? currentClassObj.groups
      : ['Science', 'Humanities', 'Business Studies']
    : ['General'];
  const hasSections = classSupportsSections(currentClassObj, formData.group);
  const availableSections = getEffectiveSectionsForClassGroup(currentClassObj, formData.group);
  const activeShifts = getActiveShiftsForClass(currentClassObj, instituteRules);
  const hasMultipleShifts = activeShifts.length > 1;

  const autoRoutedSubs = getAutoRoutedSubjectsForStudent(subjects, {
    className: formData.className,
    group: formData.group,
    religionGroup: formData.religionGroup,
    gender: formData.gender,
  });
  const fourthPool = getFourthPool(formData.className, formData.group, formData.gender);
  const mainElectivePool = getMainElectivesPool(
    formData.className,
    formData.group,
    formData.gender
  ).filter((s) => s.id !== formData.optionalFourthSubjectId);

  const previewAutoId = getNextStudentSystemIdFromStudents(
    existingStudents,
    prefix,
    formData.batchCycle || currentYear
  );

  const updateAddressField = (
    target: 'presentAddressDetail' | 'permanentAddressDetail',
    patch: Partial<StructuredAddress>
  ) => {
    setFormData((prev) => ({
      ...prev,
      [target]: {
        ...prev[target],
        ...patch,
      },
    }));
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setServerError(null);
    const newErrors: Record<string, string> = {};

    // Academic checks
    const rollNum = Number(formData.rollNumber);
    if (!Number.isFinite(rollNum) || rollNum < 1) {
      newErrors.rollNumber = 'Enter a valid numeric Roll number (1 or greater).';
    } else {
      const rollConflict = existingStudents.some(
        (s) =>
          s.status !== 'Alumni' &&
          s.status !== 'Graduated' &&
          s.className === formData.className &&
          (s.group || 'General') === formData.group &&
          (s.sectionName || 'Common') === formData.sectionName &&
          (s.shift || 'Morning') === formData.shift &&
          s.rollNumber === rollNum &&
          (!initialStudent || s.id !== initialStudent.id)
      );
      if (rollConflict) {
        newErrors.rollNumber = 'Roll already exists in this Class / Group / Section / Shift.';
      }
    }

    const cleanManualSystemId = formData.systemId.replace(/[\s-]/g, '').trim().toUpperCase();
    if (cleanManualSystemId) {
      const idConflict = existingStudents.some(
        (s) =>
          (s.systemId || '').replace(/[\s-]/g, '').trim().toUpperCase() === cleanManualSystemId &&
          (!initialStudent || s.id !== initialStudent.id)
      );
      if (idConflict) {
        newErrors.systemId = 'This Student ID is already assigned to another student.';
      }
    }

    if (mode === 'add') {
      if (!isValidSixDigitPin(formData.passwordPin)) {
        newErrors.passwordPin = 'System password must be an exact 6-digit number.';
      }
    } else if (formData.passwordPin.trim() && !isValidSixDigitPin(formData.passwordPin)) {
      newErrors.passwordPin = 'New PIN must be an exact 6-digit number (or leave blank to keep existing).';
    }

    const phoneNorm = normalizeBdMobileInput(formData.phone);
    if (isReq('phone') && !phoneNorm) {
      newErrors.phone = 'Primary Mobile number is required for SMS & login.';
    } else if (phoneNorm && !isValidBdMobile(phoneNorm)) {
      newErrors.phone = 'Must be a valid 11-digit BD mobile (e.g. 01712345678).';
    }

    // Personal checks
    if (!formData.fullName.trim()) {
      newErrors.fullName = 'Student Name (English) is required.';
    }
    if (isReq('banglaName') && !formData.banglaName.trim()) {
      newErrors.banglaName = 'Student Name (Bangla) is required.';
    }

    const parsedDobIso = parseDDMMYYYYToISO(formData.dateOfBirthInput);
    if (isReq('dateOfBirth') && !formData.dateOfBirthInput.trim()) {
      newErrors.dateOfBirthInput = 'Date of Birth is required (DD/MM/YYYY).';
    } else if (formData.dateOfBirthInput.trim() && !parsedDobIso) {
      newErrors.dateOfBirthInput = 'Enter a valid date in DD/MM/YYYY format (e.g. 24/05/2010).';
    }

    const birthDigits = formData.birthRegOrNid.replace(/\s+/g, '').trim();
    if (isReq('birthRegOrNid') && !birthDigits) {
      newErrors.birthRegOrNid = '17-digit Birth Registration No. is required.';
    } else if (birthDigits && !isValidBdBirthReg(birthDigits)) {
      newErrors.birthRegOrNid = 'Birth Registration No. must be exactly 17 numeric digits.';
    }

    if (isReq('bloodGroup') && !formData.bloodGroup) {
      newErrors.bloodGroup = 'Blood Group is required.';
    }
    if (isReq('avatarUrl') && !formData.avatarUrl.trim()) {
      newErrors.avatarUrl = 'Passport photograph is required.';
    }

    // Parents checks
    if (isReq('fatherName') && !formData.fatherName.trim()) {
      newErrors.fatherName = 'Father Name (English) is required.';
    }
    if (isReq('fatherBanglaName') && !formData.fatherBanglaName.trim()) {
      newErrors.fatherBanglaName = 'Father Name (Bangla) is required.';
    }
    const fPhoneNorm = normalizeBdMobileInput(formData.fatherPhone);
    if (isReq('fatherPhone') && !fPhoneNorm) {
      newErrors.fatherPhone = 'Father Mobile is required.';
    } else if (fPhoneNorm && !isValidBdMobile(fPhoneNorm)) {
      newErrors.fatherPhone = 'Invalid BD mobile (01XXXXXXXXX).';
    }
    if (isReq('fatherNid') && !formData.fatherNid.trim()) {
      newErrors.fatherNid = 'Father NID is required.';
    } else if (formData.fatherNid.trim() && !isValidBdNid(formData.fatherNid)) {
      newErrors.fatherNid = 'NID must be 10, 13, or 17 digits.';
    }
    if (isReq('fatherOccupation') && !formData.fatherOccupation.trim()) {
      newErrors.fatherOccupation = 'Father Profession is required.';
    }

    if (isReq('motherName') && !formData.motherName.trim()) {
      newErrors.motherName = 'Mother Name (English) is required.';
    }
    if (isReq('motherBanglaName') && !formData.motherBanglaName.trim()) {
      newErrors.motherBanglaName = 'Mother Name (Bangla) is required.';
    }
    const mPhoneNorm = normalizeBdMobileInput(formData.motherPhone);
    if (isReq('motherPhone') && !mPhoneNorm) {
      newErrors.motherPhone = 'Mother Mobile is required.';
    } else if (mPhoneNorm && !isValidBdMobile(mPhoneNorm)) {
      newErrors.motherPhone = 'Invalid BD mobile (01XXXXXXXXX).';
    }
    if (isReq('motherNid') && !formData.motherNid.trim()) {
      newErrors.motherNid = 'Mother NID is required.';
    } else if (formData.motherNid.trim() && !isValidBdNid(formData.motherNid)) {
      newErrors.motherNid = 'NID must be 10, 13, or 17 digits.';
    }
    if (isReq('motherOccupation') && !formData.motherOccupation.trim()) {
      newErrors.motherOccupation = 'Mother Profession is required.';
    }

    if (formData.hasLocalGuardian && formData.guardianPhone.trim()) {
      const gPhoneNorm = normalizeBdMobileInput(formData.guardianPhone);
      if (!isValidBdMobile(gPhoneNorm)) {
        newErrors.guardianPhone = 'Invalid BD mobile (01XXXXXXXXX).';
      }
    }

    // Address postal code checks (4 digits if entered)
    if (
      formData.presentAddressDetail.postalCode.trim() &&
      !/^\d{4}$/.test(formData.presentAddressDetail.postalCode.trim())
    ) {
      newErrors.presentPostalCode = 'Postal code must be 4 digits.';
    }
    const effectivePermanentDetail = formData.sameAsPresentAddress
      ? formData.presentAddressDetail
      : formData.permanentAddressDetail;
    if (
      !formData.sameAsPresentAddress &&
      effectivePermanentDetail.postalCode.trim() &&
      !/^\d{4}$/.test(effectivePermanentDetail.postalCode.trim())
    ) {
      newErrors.permanentPostalCode = 'Postal code must be 4 digits.';
    }

    const formattedPresent = formatStructuredAddress(formData.presentAddressDetail);
    const formattedPermanent = formatStructuredAddress(effectivePermanentDetail);

    if (isReq('presentAddress') && !formattedPresent) {
      newErrors.presentAddress = 'Present Address is required.';
    }
    if (isReq('permanentAddress') && !formattedPermanent) {
      newErrors.permanentAddress = 'Permanent Address is required.';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      setServerError('Please fix the highlighted validation errors before saving.');
      return;
    }

    setErrors({});
    setSubmitting(true);

    const cleanElectives = formData.electiveSubjectIds.filter(
      (id) => id !== formData.optionalFourthSubjectId
    );

    const payload: Partial<Student> & Record<string, unknown> = {
      rollNumber: rollNum,
      ...(cleanManualSystemId ? { systemId: cleanManualSystemId } : {}),
      className: formData.className,
      group: hasGroups ? formData.group : 'General',
      sectionName: hasSections ? formData.sectionName : 'Common',
      shift: activeShifts.length === 1 ? activeShifts[0] : formData.shift,
      batchCycle: formData.batchCycle.trim() || undefined,
      registrationNumber: formData.registrationNumber.trim(),
      electiveSubjectIds: cleanElectives,
      optionalFourthSubjectId: formData.optionalFourthSubjectId || undefined,
      phone: phoneNorm,
      status: formData.status,

      fullName: formData.fullName.trim(),
      banglaName: formData.banglaName.trim() || undefined,
      gender: formData.gender,
      religionGroup: formData.religionGroup,
      dateOfBirth: parsedDobIso || formData.dateOfBirthIso || '2010-01-01',
      birthRegOrNid: birthDigits || undefined,
      bloodGroup: formData.bloodGroup || undefined,
      avatarUrl: formData.avatarUrl.trim(),
      avatarPublicId: formData.avatarUrl.trim() ? formData.avatarPublicId || undefined : '',

      fatherName: formData.fatherName.trim(),
      fatherBanglaName: formData.fatherBanglaName.trim() || undefined,
      fatherNid: formData.fatherNid.trim() || undefined,
      fatherPhone: fPhoneNorm || undefined,
      fatherOccupation: formData.fatherOccupation.trim() || undefined,

      motherName: formData.motherName.trim(),
      motherBanglaName: formData.motherBanglaName.trim() || undefined,
      motherNid: formData.motherNid.trim() || undefined,
      motherPhone: mPhoneNorm || undefined,
      motherOccupation: formData.motherOccupation.trim() || undefined,

      hasLocalGuardian: formData.hasLocalGuardian,
      guardianName: formData.hasLocalGuardian ? formData.guardianName.trim() || undefined : undefined,
      guardianRelation: formData.hasLocalGuardian
        ? formData.guardianRelation.trim() || undefined
        : undefined,
      guardianPhone: formData.hasLocalGuardian
        ? normalizeBdMobileInput(formData.guardianPhone) || undefined
        : undefined,

      presentAddressDetail: formData.presentAddressDetail,
      permanentAddressDetail: effectivePermanentDetail,
      sameAsPresentAddress: formData.sameAsPresentAddress,
      presentAddress: formattedPresent || undefined,
      permanentAddress: formattedPermanent || undefined,
      address: formattedPresent || formattedPermanent || 'Campus Catchment',

      customFields:
        Object.keys(formData.customFields).length > 0 ? formData.customFields : undefined,
    };

    try {
      const err = await onSave(payload, formData.passwordPin.trim());
      if (typeof err === 'string' && err.trim()) {
        setServerError(err);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const renderAddressBlock = (
    title: string,
    target: 'presentAddressDetail' | 'permanentAddressDetail',
    detail: StructuredAddress,
    disabled: boolean,
    postalErrorKey: 'presentPostalCode' | 'permanentPostalCode',
    sectionErrorKey: 'presentAddress' | 'permanentAddress'
  ) => {
    const districts = getDistrictsByDivision(detail.division);
    const upazilas = getUpazilasByDistrict(detail.division, detail.district);

    return (
      <div
        className={`p-4 rounded-xl border space-y-3 transition-opacity ${
          disabled
            ? 'bg-surface-container-low/40 border-outline-variant/20 opacity-70'
            : 'bg-surface-container-low/60 border-outline-variant/25'
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-bold text-on-surface text-xs uppercase tracking-wider">{title}</h3>
          {target === 'permanentAddressDetail' && (
            <label className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-primary-container cursor-pointer select-none">
              <input
                type="checkbox"
                checked={formData.sameAsPresentAddress}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, sameAsPresentAddress: e.target.checked }))
                }
                className="w-3.5 h-3.5 rounded"
              />
              <span>Same as Present Address</span>
            </label>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {/* i. Division */}
          <div>
            <label className="block font-semibold text-on-surface-variant uppercase mb-1">
              Division
            </label>
            <select
              disabled={disabled}
              value={detail.division}
              onChange={(e) =>
                updateAddressField(target, {
                  division: e.target.value,
                  district: '',
                  upazila: '',
                })
              }
              className="w-full px-3 py-2 rounded-xl bg-white border border-outline-variant/30 text-xs font-medium disabled:bg-surface-container-low"
            >
              <option value="">-- Select Division --</option>
              {BD_DIVISIONS.map((d) => (
                <option key={d.name} value={d.name}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>

          {/* ii. District */}
          <div>
            <label className="block font-semibold text-on-surface-variant uppercase mb-1">
              District
            </label>
            <select
              disabled={disabled || !detail.division}
              value={detail.district}
              onChange={(e) =>
                updateAddressField(target, {
                  district: e.target.value,
                  upazila: '',
                })
              }
              className="w-full px-3 py-2 rounded-xl bg-white border border-outline-variant/30 text-xs font-medium disabled:bg-surface-container-low"
            >
              <option value="">
                {detail.division ? '-- Select District --' : 'Select Division first'}
              </option>
              {districts.map((dist) => (
                <option key={dist} value={dist}>
                  {dist}
                </option>
              ))}
            </select>
          </div>

          {/* iii. Upazila / Thana */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block font-semibold text-on-surface-variant uppercase">
                Upazila / Thana
              </label>
              {!disabled && (
                <label className="inline-flex items-center gap-1 text-[10px] font-medium text-primary-container cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(detail.customUpazila)}
                    onChange={(e) =>
                      updateAddressField(target, {
                        customUpazila: e.target.checked,
                        upazila: '',
                      })
                    }
                    className="w-3 h-3 rounded"
                  />
                  <span>Custom Ward/Thana</span>
                </label>
              )}
            </div>
            {detail.customUpazila ? (
              <input
                type="text"
                disabled={disabled}
                placeholder="Type Thana / City Corp. Ward"
                value={detail.upazila}
                onChange={(e) => updateAddressField(target, { upazila: e.target.value })}
                className="w-full px-3 py-2 rounded-xl bg-white border border-outline-variant/30 text-xs disabled:bg-surface-container-low"
              />
            ) : (
              <select
                disabled={disabled || !detail.district}
                value={detail.upazila}
                onChange={(e) => updateAddressField(target, { upazila: e.target.value })}
                className="w-full px-3 py-2 rounded-xl bg-white border border-outline-variant/30 text-xs font-medium disabled:bg-surface-container-low"
              >
                <option value="">
                  {detail.district ? '-- Select Upazila / Thana --' : 'Select District first'}
                </option>
                {upazilas.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* iv. Village / House / Road */}
          <div>
            <label className="block font-semibold text-on-surface-variant uppercase mb-1">
              Village / House / Road
            </label>
            <input
              type="text"
              disabled={disabled}
              placeholder="e.g. House 14, Road 3 / Vill: Rampur"
              value={detail.villageRoad}
              onChange={(e) => updateAddressField(target, { villageRoad: e.target.value })}
              className="w-full px-3 py-2 rounded-xl bg-white border border-outline-variant/30 text-xs disabled:bg-surface-container-low"
            />
          </div>

          {/* v. Post Office */}
          <div>
            <label className="block font-semibold text-on-surface-variant uppercase mb-1">
              Post Office
            </label>
            <input
              type="text"
              disabled={disabled}
              placeholder="e.g. Uttara / Sadar"
              value={detail.postOffice}
              onChange={(e) => updateAddressField(target, { postOffice: e.target.value })}
              className="w-full px-3 py-2 rounded-xl bg-white border border-outline-variant/30 text-xs disabled:bg-surface-container-low"
            />
          </div>

          {/* vi. Postal Code */}
          <div>
            <label className="block font-semibold text-on-surface-variant uppercase mb-1">
              Postal Code (4 Digits)
            </label>
            <input
              type="text"
              inputMode="numeric"
              maxLength={4}
              disabled={disabled}
              placeholder="e.g. 1230"
              value={detail.postalCode}
              onChange={(e) =>
                updateAddressField(target, {
                  postalCode: e.target.value.replace(/\D/g, '').slice(0, 4),
                })
              }
              className={`w-full px-3 py-2 rounded-xl bg-white border ${
                errors[postalErrorKey] ? 'border-error' : 'border-outline-variant/30'
              } text-xs font-mono disabled:bg-surface-container-low`}
            />
            {errors[postalErrorKey] && (
              <p className="text-[10px] text-error mt-1">{errors[postalErrorKey]}</p>
            )}
          </div>
        </div>
        {errors[sectionErrorKey] && (
          <p className="text-[11px] text-error font-semibold">{errors[sectionErrorKey]}</p>
        )}
      </div>
    );
  };

  const { cropW, cropH } = getCropDimensions(imgRenderSize.w, imgRenderSize.h, cropScale);
  const clampedCrop = clampCropPos(
    cropPos.x,
    cropPos.y,
    imgRenderSize.w,
    imgRenderSize.h,
    cropW,
    cropH
  );

  return (
    <div className="space-y-6 text-xs pb-16">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-outline-variant/20">
        <div>
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary-container hover:underline mb-1 cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Student Register
          </button>
          <h1 className="font-headline-lg text-headline-lg text-on-surface tracking-tight font-bold">
            {mode === 'edit'
              ? `Edit Student Dossier — ${formData.fullName || initialStudent?.fullName || ''}`
              : 'New Student Admission & Bio Form'}
          </h1>
          <p className="text-xs text-on-surface-variant mt-0.5">
            Fields marked with <span className="text-error font-bold">*</span> are mandatory. Respects dynamic Student Schema controls and NCTB subject routing.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 rounded-xl bg-surface-container-low hover:bg-surface-container text-xs font-semibold cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="student-admission-form"
            disabled={submitting}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary-container hover:bg-primary text-on-primary text-xs font-bold shadow-sm cursor-pointer disabled:opacity-60"
          >
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
            <span>
              {mode === 'edit' ? 'Save Student Changes' : 'Complete Admission & Generate PIN'}
            </span>
          </button>
        </div>
      </div>

      {serverError && (
        <div className="p-3.5 rounded-xl bg-error-container/20 border border-error/30 text-error flex items-center gap-2 font-semibold">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{serverError}</span>
        </div>
      )}

      {photoStatusMsg && (
        <div className="p-3 rounded-xl bg-emerald-50 text-emerald-800 border border-emerald-200 flex items-center gap-2 font-medium">
          <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
          <span>{photoStatusMsg}</span>
        </div>
      )}

      <form id="student-admission-form" onSubmit={handleFormSubmit} className="space-y-6" noValidate>
        {/* STUDENT PASSPORT PICTURE UPLOAD (OPTIONAL / SCHEMA CONFIGURED) */}
        {!isHidden('avatarUrl') && (
          <div className="rounded-2xl bg-surface-container-lowest border border-outline-variant/25 p-6 space-y-4">
            <h2 className="text-sm font-bold text-on-surface border-b border-outline-variant/15 pb-2.5 flex items-center gap-2">
              <Camera className="w-4 h-4 text-primary-container" />
              <span>
                Student Picture Upload {isReq('avatarUrl') ? '*' : '(Optional)'} &mdash; Fixed
                Passport Size (35:45 Auto-Cropped)
              </span>
            </h2>
            <div className="flex flex-col sm:flex-row items-center gap-6">
              <div className="w-[105px] h-[135px] bg-white border border-outline-variant/40 rounded-xl overflow-hidden flex items-center justify-center shrink-0 shadow-inner">
                {formData.avatarUrl ? (
                  <img
                    src={formData.avatarUrl}
                    alt="Student Passport"
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <ImageIcon className="w-8 h-8 text-on-surface-variant/40" />
                )}
              </div>
              <div className="flex-1 space-y-3">
                <p className="text-xs text-on-surface-variant">
                  Select a portrait photo to crop cleanly in-browser to the standard{' '}
                  <strong className="text-on-surface">35:45 (7:9)</strong> passport aspect ratio
                  and resize to <strong className="text-on-surface">420 &times; 540 px</strong>{' '}
                  before uploading to Cloudinary.
                </p>
                <div className="flex flex-wrap items-center gap-3">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleFileSelected}
                    className="hidden"
                  />
                  <button
                    type="button"
                    disabled={uploadingPhoto}
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary-container hover:bg-primary text-on-primary font-semibold shadow-sm cursor-pointer disabled:opacity-60 transition-colors"
                  >
                    {uploadingPhoto ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Scissors className="w-4 h-4" />
                    )}
                    <span>
                      {uploadingPhoto ? 'Uploading 420×540...' : 'Select & Auto-Crop Passport Photo'}
                    </span>
                  </button>
                  {formData.avatarUrl && (
                    <button
                      type="button"
                      onClick={() => {
                        setFormData((prev) => ({ ...prev, avatarUrl: '', avatarPublicId: '' }));
                        setPhotoStatusMsg(null);
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-error-container/20 text-error hover:bg-error-container/30 font-semibold cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Remove
                    </button>
                  )}
                </div>
                {errors.avatarUrl && <p className="text-[11px] text-error">{errors.avatarUrl}</p>}
              </div>
            </div>
          </div>
        )}

        {/* SECTION 1: ACADEMIC INFORMATION */}
        <div className="rounded-2xl bg-surface-container-lowest border border-outline-variant/25 p-6 space-y-5">
          <h2 className="text-sm font-bold text-on-surface border-b border-outline-variant/15 pb-2.5 flex items-center gap-2">
            <GraduationCap className="w-4 h-4 text-primary-container" />
            <span>1. Academic Information</span>
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* i*. Select Class */}
            <div>
              <label className="block font-semibold text-on-surface-variant uppercase mb-1">
                i. Select Class *
              </label>
              <select
                required
                value={formData.className}
                onChange={(e) => {
                  const nextCls = e.target.value;
                  const cObj = academicClasses.find((c) => c.name === nextCls);
                  const clsHasGroups = classSupportsGroups(cObj);
                  const grps: AcademicGroup[] = clsHasGroups
                    ? cObj?.groups?.length
                      ? cObj.groups
                      : ['Science', 'Humanities', 'Business Studies']
                    : ['General'];
                  const nextGrp: AcademicGroup = grps.includes(formData.group)
                    ? formData.group
                    : grps[0] || 'General';
                  const secs = getEffectiveSectionsForClassGroup(cObj, nextGrp);
                  const nextSec = secs.includes(formData.sectionName)
                    ? formData.sectionName
                    : secs[0] || 'Common';
                  const nextShifts = getActiveShiftsForClass(cObj, instituteRules);
                  const nextShift: ShiftType = nextShifts.includes(formData.shift)
                    ? formData.shift
                    : nextShifts[0] || 'Morning';
                  const curFourth = subjects.find((s) => s.id === formData.optionalFourthSubjectId);
                  const fourthPoolNext = getFourthPool(nextCls, nextGrp, formData.gender);
                  const nextFourth =
                    curFourth && fourthPoolNext.some((s) => s.id === curFourth.id)
                      ? curFourth.id
                      : fourthPoolNext[0]?.id || '';

                  setFormData((prev) => ({
                    ...prev,
                    className: nextCls,
                    group: nextGrp,
                    sectionName: nextSec,
                    shift: nextShift,
                    rollNumber:
                      mode === 'add'
                        ? computeNextRoll(nextCls, nextGrp, nextSec, nextShift)
                        : prev.rollNumber,
                    batchCycle: resolveDefaultBatchCycle(nextCls, instituteRules, cObj),
                    electiveSubjectIds: [],
                    optionalFourthSubjectId: nextFourth,
                  }));
                }}
                className="w-full px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 font-semibold text-sm"
              >
                {academicClasses.map((c) => (
                  <option key={c.id} value={c.name}>
                    {c.name}
                  </option>
                ))}
                {!academicClasses.some((c) => c.name === formData.className) && (
                  <option value={formData.className}>{formData.className}</option>
                )}
              </select>
            </div>

            {/* ii*. Group (Appears if class has groups, otherwise default General) */}
            {!isHidden('group') && (
              <div>
                <label className="block font-semibold text-on-surface-variant uppercase mb-1">
                  ii. Group {hasGroups && isReq('group') ? '*' : '(Default)'}
                </label>
                {hasGroups ? (
                  <select
                    required={isReq('group')}
                    value={formData.group}
                    onChange={(e) => {
                      const nextGrp = e.target.value as AcademicGroup;
                      const secs = getEffectiveSectionsForClassGroup(currentClassObj, nextGrp);
                      const nextSec = secs.includes(formData.sectionName)
                        ? formData.sectionName
                        : secs[0] || 'Common';
                      const fourthPoolNext = getFourthPool(
                        formData.className,
                        nextGrp,
                        formData.gender
                      );
                      setFormData((prev) => ({
                        ...prev,
                        group: nextGrp,
                        sectionName: nextSec,
                        rollNumber:
                          mode === 'add'
                            ? computeNextRoll(
                                prev.className,
                                nextGrp,
                                nextSec,
                                prev.shift
                              )
                            : prev.rollNumber,
                        electiveSubjectIds: [],
                        optionalFourthSubjectId: fourthPoolNext[0]?.id || '',
                      }));
                    }}
                    className="w-full px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 font-semibold text-sm"
                  >
                    {availableGroups.map((g) => (
                      <option key={g} value={g}>
                        {g}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="px-3 py-2 rounded-xl bg-secondary-fixed/40 border border-outline-variant/25 font-semibold text-on-secondary-container text-sm">
                    General (No Group Split)
                  </div>
                )}
              </div>
            )}

            {/* iii*. Section (Appears only if class has sections) */}
            {hasSections && !isHidden('sectionName') && (
              <div>
                <label className="block font-semibold text-on-surface-variant uppercase mb-1">
                  iii. Section {isReq('sectionName') && '*'}
                </label>
                <select
                  required={isReq('sectionName')}
                  value={
                    availableSections.includes(formData.sectionName)
                      ? formData.sectionName
                      : availableSections[0] || 'Common'
                  }
                  onChange={(e) => {
                    const nextSec = e.target.value;
                    setFormData((prev) => ({
                      ...prev,
                      sectionName: nextSec,
                      rollNumber:
                        mode === 'add'
                          ? computeNextRoll(prev.className, prev.group, nextSec, prev.shift)
                          : prev.rollNumber,
                    }));
                  }}
                  className="w-full px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 font-semibold text-sm"
                >
                  {availableSections.map((sec) => (
                    <option key={sec} value={sec}>
                      {sec === 'Common' ? 'Combined' : `Section ${sec}`}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* iv*. Shift (Selectable if 2+ shifts active; auto-selected if 1 shift active) */}
            {!isHidden('shift') && (
              <div>
                <label className="block font-semibold text-on-surface-variant uppercase mb-1">
                  iv. Shift {isReq('shift') && '*'}
                </label>
                {hasMultipleShifts ? (
                  <select
                    required={isReq('shift')}
                    value={formData.shift}
                    onChange={(e) => {
                      const nextShift = e.target.value as ShiftType;
                      setFormData((prev) => ({
                        ...prev,
                        shift: nextShift,
                        rollNumber:
                          mode === 'add'
                            ? computeNextRoll(
                                prev.className,
                                prev.group,
                                prev.sectionName,
                                nextShift
                              )
                            : prev.rollNumber,
                      }));
                    }}
                    className="w-full px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 font-semibold text-sm"
                  >
                    {activeShifts.map((sh) => (
                      <option key={sh} value={sh}>
                        {sh} Shift
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="px-3 py-2 rounded-xl bg-secondary-fixed/40 border border-outline-variant/25 font-semibold text-on-secondary-container text-sm">
                    {activeShifts[0] || 'Morning'} Shift (Auto)
                  </div>
                )}
              </div>
            )}

            {/* v*. Roll */}
            <div>
              <label className="block font-semibold text-on-surface-variant uppercase mb-1">
                v. Roll *
              </label>
              <input
                type="number"
                required
                min={1}
                value={formData.rollNumber}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, rollNumber: Number(e.target.value) }))
                }
                className={`w-full px-3 py-2 rounded-xl bg-surface-container-low border ${
                  errors.rollNumber ? 'border-error ring-1 ring-error' : 'border-outline-variant/30'
                } font-mono font-bold text-sm tabular-nums`}
              />
              {errors.rollNumber && (
                <p className="text-[10px] text-error mt-1">{errors.rollNumber}</p>
              )}
            </div>

            {/* vi. Board Registration No. (Optional) */}
            {!isHidden('registrationNumber') && (
              <div>
                <label className="block font-semibold text-on-surface-variant uppercase mb-1">
                  vi. Board Registration No.{isReq('registrationNumber') ? ' *' : ' (Optional)'}
                </label>
                <input
                  type="text"
                  required={isReq('registrationNumber')}
                  placeholder="Optional board reg. no."
                  value={formData.registrationNumber}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, registrationNumber: e.target.value }))
                  }
                  className="w-full px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 font-mono text-sm tabular-nums"
                />
              </div>
            )}

            {/* vii*. Student ID */}
            {!isHidden('systemId') && (
              <div>
                <label className="block font-semibold text-on-surface-variant uppercase mb-1">
                  vii. Student ID * (Blank = Auto)
                </label>
                <input
                  type="text"
                  placeholder={`Auto: ${previewAutoId}`}
                  value={formData.systemId}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      systemId: e.target.value.replace(/[\s-]/g, '').toUpperCase(),
                    }))
                  }
                  className={`w-full px-3 py-2 rounded-xl bg-surface-container-low border ${
                    errors.systemId ? 'border-error ring-1 ring-error' : 'border-outline-variant/30'
                  } font-mono text-sm`}
                />
                {errors.systemId ? (
                  <p className="text-[10px] text-error mt-1">{errors.systemId}</p>
                ) : (
                  <p className="text-[10px] text-on-surface-variant mt-1">
                    Leave blank for auto ID (<strong className="font-mono text-primary-container">{previewAutoId}</strong>) or enter a custom ID.
                  </p>
                )}
              </div>
            )}

            {/* viii*. Password (6-Digit Numeric PIN) */}
            {!isHidden('password') && (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block font-semibold text-on-surface-variant uppercase">
                    viii. Password (6-Digit PIN) {mode === 'add' ? '*' : ''}
                  </label>
                  <button
                    type="button"
                    onClick={() =>
                      setFormData((prev) => ({ ...prev, passwordPin: generateSixDigitPin() }))
                    }
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary-container hover:underline cursor-pointer"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>Regenerate</span>
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    inputMode="numeric"
                    required={mode === 'add'}
                    maxLength={6}
                    placeholder={mode === 'edit' ? 'Blank = Keep current PIN' : '6-digit PIN'}
                    value={formData.passwordPin}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        passwordPin: e.target.value.replace(/\D/g, '').slice(0, 6),
                      }))
                    }
                    className={`w-full px-3 py-2 rounded-xl bg-surface-container-low border ${
                      errors.passwordPin ? 'border-error' : 'border-outline-variant/30'
                    } font-mono font-bold tracking-widest text-center text-sm`}
                  />
                  <KeyRound className="w-4 h-4 text-primary-container shrink-0" />
                </div>
                {errors.passwordPin ? (
                  <p className="text-[10px] text-error mt-1">{errors.passwordPin}</p>
                ) : (
                  <p className="text-[10px] text-on-surface-variant mt-1">
                    Hashed with bcrypt; shown once in Credential Slip modal.
                  </p>
                )}
              </div>
            )}

            {/* ix*. Primary Mobile Number */}
            {!isHidden('phone') && (
              <div>
                <label className="block font-semibold text-on-surface-variant uppercase mb-1">
                  ix. Mobile Number (SMS &amp; Login){isReq('phone') ? ' *' : ''}
                </label>
                <input
                  type="text"
                  inputMode="tel"
                  required={isReq('phone')}
                  placeholder="01712345678"
                  value={formData.phone}
                  onChange={(e) => setFormData((prev) => ({ ...prev, phone: e.target.value }))}
                  className={`w-full px-3 py-2 rounded-xl bg-surface-container-low border ${
                    errors.phone ? 'border-error ring-1 ring-error' : 'border-outline-variant/30'
                  } font-mono text-sm tabular-nums`}
                />
                {errors.phone ? (
                  <p className="text-[10px] text-error mt-1">{errors.phone}</p>
                ) : (
                  <p className="text-[10px] text-on-surface-variant mt-1">
                    Used for result SMS, payment dues &amp; student portal login.
                  </p>
                )}
              </div>
            )}

            {mode === 'edit' && (
              <div>
                <label className="block font-semibold text-on-surface-variant uppercase mb-1">
                  Enrollment Status
                </label>
                <select
                  value={formData.status}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      status: e.target.value as Student['status'],
                    }))
                  }
                  className="w-full px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 font-semibold text-sm"
                >
                  <option value="Active">Active</option>
                  <option value="Transferred">Transferred</option>
                  <option value="Graduated">Graduated</option>
                  <option value="Alumni">Alumni (Archived)</option>
                </select>
              </div>
            )}
          </div>

          {/* NCTB Compulsory Auto-Routing & Elective/4th Subject Panel */}
          <div className="p-4 rounded-xl bg-surface-container-low/80 border border-outline-variant/25 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 font-bold text-on-surface uppercase tracking-wider text-[11px]">
                <BookOpen className="w-3.5 h-3.5 text-primary-container" />
                Auto-Routed NCTB Subjects ({autoRoutedSubs.length})
              </span>
              <span className="text-[11px] text-on-surface-variant">
                Class: <strong>{formData.className}</strong> &middot; Group:{' '}
                <strong>{formData.group}</strong> &middot; Faith:{' '}
                <strong>{formData.religionGroup}</strong>
              </span>
            </div>

            {autoRoutedSubs.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {autoRoutedSubs.map((sub) => (
                  <span
                    key={sub.id}
                    className="px-2.5 py-1 rounded-lg bg-white border border-outline-variant/25 text-[11px] font-medium text-on-surface"
                  >
                    <span className="font-mono font-bold text-primary-container mr-1">
                      {sub.code}
                    </span>
                    {sub.name}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-[11px] text-amber-800 font-medium">
                No compulsory subjects configured for {formData.className} yet.
              </p>
            )}

            {(fourthPool.length > 0 || mainElectivePool.length > 0) && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-2 border-t border-outline-variant/15">
                {fourthPool.length > 0 && (
                  <div>
                    <label className="block font-semibold text-on-surface-variant uppercase mb-1">
                      Optional 4th Subject (NCTB)
                    </label>
                    <select
                      value={formData.optionalFourthSubjectId}
                      onChange={(e) => {
                        const nextFourth = e.target.value;
                        setFormData((prev) => ({
                          ...prev,
                          optionalFourthSubjectId: nextFourth,
                          electiveSubjectIds: prev.electiveSubjectIds.filter(
                            (id) => id !== nextFourth
                          ),
                        }));
                      }}
                      className="w-full px-3 py-2 rounded-xl bg-white border border-outline-variant/30 text-xs font-semibold"
                    >
                      <option value="">Assign later in Examinations (None)</option>
                      {fourthPool.map((sub) => (
                        <option key={sub.id} value={sub.id}>
                          {sub.name} ({sub.code})
                          {sub.genderRestriction === 'Female' ? ' · Female Only' : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {mainElectivePool.length > 0 && (
                  <div>
                    <label className="block font-semibold text-on-surface-variant uppercase mb-1">
                      Main Group Elective Subject(s) ({formData.group})
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      {mainElectivePool.map((sub) => {
                        const checked = formData.electiveSubjectIds.includes(sub.id);
                        return (
                          <label
                            key={sub.id}
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[11px] font-semibold cursor-pointer ${
                              checked
                                ? 'bg-primary-container text-on-primary border-primary-container'
                                : 'bg-white text-on-surface border-outline-variant/30'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) =>
                                setFormData((prev) => ({
                                  ...prev,
                                  electiveSubjectIds: e.target.checked
                                    ? [...prev.electiveSubjectIds, sub.id]
                                    : prev.electiveSubjectIds.filter((id) => id !== sub.id),
                                }))
                              }
                            />
                            <span>
                              {sub.name} ({sub.code})
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* SECTION 2: STUDENT PERSONAL INFORMATION */}
        <div className="rounded-2xl bg-surface-container-lowest border border-outline-variant/25 p-6 space-y-5">
          <h2 className="text-sm font-bold text-on-surface border-b border-outline-variant/15 pb-2.5 flex items-center gap-2">
            <User className="w-4 h-4 text-primary-container" />
            <span>2. Student Personal Information</span>
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* i. Name In English* */}
            <div className="sm:col-span-2">
              <label className="block font-semibold text-on-surface-variant uppercase mb-1">
                i. Name In English *
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Farhan Sadik"
                value={formData.fullName}
                onChange={(e) => setFormData((prev) => ({ ...prev, fullName: e.target.value }))}
                className={`w-full px-3 py-2 rounded-xl bg-surface-container-low border ${
                  errors.fullName ? 'border-error' : 'border-outline-variant/30'
                } font-medium text-sm`}
              />
              {errors.fullName && <p className="text-[10px] text-error mt-1">{errors.fullName}</p>}
            </div>

            {/* ii. Name In Bangla */}
            {!isHidden('banglaName') && (
              <div className="sm:col-span-2">
                <label className="block font-semibold text-on-surface-variant uppercase mb-1">
                  ii. Name In Bangla {isReq('banglaName') && '*'}
                </label>
                <input
                  type="text"
                  required={isReq('banglaName')}
                  placeholder="e.g. ফারহান সাদিক"
                  value={formData.banglaName}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, banglaName: e.target.value }))
                  }
                  className={`w-full px-3 py-2 rounded-xl bg-surface-container-low border ${
                    errors.banglaName ? 'border-error' : 'border-outline-variant/30'
                  } text-sm`}
                />
                {errors.banglaName && (
                  <p className="text-[10px] text-error mt-1">{errors.banglaName}</p>
                )}
              </div>
            )}

            {/* iii. Gender* */}
            {!isHidden('gender') && (
              <div>
                <label className="block font-semibold text-on-surface-variant uppercase mb-1">
                  iii. Gender {isReq('gender') && '*'}
                </label>
                <select
                  required={isReq('gender')}
                  value={formData.gender}
                  onChange={(e) => {
                    const nextGender = e.target.value as GenderType;
                    const fourthNext = getFourthPool(
                      formData.className,
                      formData.group,
                      nextGender
                    );
                    const curFourthOk = fourthNext.some(
                      (s) => s.id === formData.optionalFourthSubjectId
                    );
                    const validFourth = curFourthOk
                      ? formData.optionalFourthSubjectId
                      : fourthNext[0]?.id || '';
                    const cleanElectives = formData.electiveSubjectIds.filter((id) => {
                      const sub = subjects.find((s) => s.id === id);
                      return (
                        id !== validFourth &&
                        (!sub || isStudentGenderEligibleForSubject(sub, nextGender))
                      );
                    });
                    setFormData((prev) => ({
                      ...prev,
                      gender: nextGender,
                      electiveSubjectIds: cleanElectives,
                      optionalFourthSubjectId: validFourth,
                    }));
                  }}
                  className="w-full px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 font-semibold text-sm"
                >
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Other">Other</option>
                </select>
              </div>
            )}

            {/* iv. Religion* */}
            {!isHidden('religionGroup') && (
              <div>
                <label className="block font-semibold text-on-surface-variant uppercase mb-1">
                  iv. Religion {isReq('religionGroup') && '*'}
                </label>
                <select
                  required={isReq('religionGroup')}
                  value={formData.religionGroup}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      religionGroup: e.target.value as ReligionGroup,
                    }))
                  }
                  className="w-full px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 font-semibold text-sm"
                >
                  <option value="Islam">Islam</option>
                  <option value="Hinduism">Hinduism (Hindu)</option>
                  <option value="Christianity">Christianity (Christian)</option>
                  <option value="Buddhism">Buddhism</option>
                  <option value="Other">Other</option>
                </select>
              </div>
            )}

            {/* v. Date of Birth* (Dual: fast typing DD/MM/YYYY + calendar date picker) */}
            {!isHidden('dateOfBirth') && (
              <div>
                <label className="block font-semibold text-on-surface-variant uppercase mb-1">
                  v. Date of Birth (DD/MM/YYYY) {isReq('dateOfBirth') && '*'}
                </label>
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    inputMode="numeric"
                    required={isReq('dateOfBirth')}
                    placeholder="DD/MM/YYYY (e.g. 24052010)"
                    value={formData.dateOfBirthInput}
                    onChange={(e) => {
                      const formatted = autoFormatDDMMYYYYInput(e.target.value);
                      const iso = parseDDMMYYYYToISO(formatted);
                      setFormData((prev) => ({
                        ...prev,
                        dateOfBirthInput: formatted,
                        dateOfBirthIso: iso || '',
                      }));
                    }}
                    className={`flex-1 min-w-0 px-3 py-2 rounded-xl bg-surface-container-low border ${
                      errors.dateOfBirthInput ? 'border-error' : 'border-outline-variant/30'
                    } font-mono text-sm`}
                  />
                  <label
                    className="relative shrink-0 p-2 rounded-xl bg-surface-container-low border border-outline-variant/30 hover:bg-surface-container cursor-pointer flex items-center justify-center"
                    title="Pick date from calendar"
                  >
                    <Calendar className="w-4 h-4 text-primary-container" />
                    <input
                      type="date"
                      value={formData.dateOfBirthIso}
                      onChange={(e) => {
                        const iso = e.target.value;
                        setFormData((prev) => ({
                          ...prev,
                          dateOfBirthIso: iso,
                          dateOfBirthInput: formatISOToDDMMYYYY(iso),
                        }));
                      }}
                      className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
                    />
                  </label>
                </div>
                {errors.dateOfBirthInput && (
                  <p className="text-[10px] text-error mt-1">{errors.dateOfBirthInput}</p>
                )}
              </div>
            )}

            {/* vi. Birth Registration No. (17-digit with live counter) */}
            {!isHidden('birthRegOrNid') && (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block font-semibold text-on-surface-variant uppercase">
                    vi. Birth Reg. No. {isReq('birthRegOrNid') && '*'}
                  </label>
                  <span
                    className={`text-[10px] font-mono font-bold ${
                      formData.birthRegOrNid.replace(/\D/g, '').length === 17
                        ? 'text-emerald-700'
                        : 'text-on-surface-variant'
                    }`}
                  >
                    {formData.birthRegOrNid.replace(/\D/g, '').length} / 17 digits
                  </span>
                </div>
                <input
                  type="text"
                  inputMode="numeric"
                  required={isReq('birthRegOrNid')}
                  maxLength={17}
                  placeholder="17-digit Digital Birth Reg"
                  value={formData.birthRegOrNid}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      birthRegOrNid: e.target.value.replace(/\D/g, '').slice(0, 17),
                    }))
                  }
                  className={`w-full px-3 py-2 rounded-xl bg-surface-container-low border ${
                    errors.birthRegOrNid ? 'border-error' : 'border-outline-variant/30'
                  } font-mono text-sm tabular-nums`}
                />
                {errors.birthRegOrNid && (
                  <p className="text-[10px] text-error mt-1">{errors.birthRegOrNid}</p>
                )}
              </div>
            )}

            {/* vii. Blood Group */}
            {!isHidden('bloodGroup') && (
              <div>
                <label className="block font-semibold text-on-surface-variant uppercase mb-1">
                  vii. Blood Group {isReq('bloodGroup') && '*'}
                </label>
                <select
                  required={isReq('bloodGroup')}
                  value={formData.bloodGroup}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, bloodGroup: e.target.value }))
                  }
                  className={`w-full px-3 py-2 rounded-xl bg-surface-container-low border ${
                    errors.bloodGroup ? 'border-error' : 'border-outline-variant/30'
                  } font-semibold text-sm`}
                >
                  <option value="">-- Select Blood Group --</option>
                  {BLOOD_GROUPS.map((bg) => (
                    <option key={bg} value={bg}>
                      {bg}
                    </option>
                  ))}
                </select>
                {errors.bloodGroup && (
                  <p className="text-[10px] text-error mt-1">{errors.bloodGroup}</p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* SECTION 3: PARENTS & LOCAL GUARDIAN INFORMATION */}
        <div className="rounded-2xl bg-surface-container-lowest border border-outline-variant/25 p-6 space-y-5">
          <h2 className="text-sm font-bold text-on-surface border-b border-outline-variant/15 pb-2.5 flex items-center gap-2">
            <Users className="w-4 h-4 text-primary-container" />
            <span>3. Parents &amp; Local Guardian Information</span>
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Father Particulars */}
            <div className="p-4 rounded-xl bg-surface-container-low/50 border border-outline-variant/20 space-y-3">
              <h3 className="font-bold text-primary-container text-xs uppercase tracking-wider">
                Father&apos;s Information
              </h3>
              <div className="space-y-3">
                {!isHidden('fatherName') && (
                  <div>
                    <label className="block font-semibold text-on-surface-variant uppercase mb-1">
                      i. Father Name English {isReq('fatherName') && '*'}
                    </label>
                    <input
                      type="text"
                      required={isReq('fatherName')}
                      placeholder="e.g. Md. Jahangir Alam"
                      value={formData.fatherName}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, fatherName: e.target.value }))
                      }
                      className={`w-full px-3 py-2 rounded-xl bg-white border ${
                        errors.fatherName ? 'border-error' : 'border-outline-variant/30'
                      } font-medium`}
                    />
                    {errors.fatherName && (
                      <p className="text-[10px] text-error mt-1">{errors.fatherName}</p>
                    )}
                  </div>
                )}

                {!isHidden('fatherBanglaName') && (
                  <div>
                    <label className="block font-semibold text-on-surface-variant uppercase mb-1">
                      ii. Father Name Bangla {isReq('fatherBanglaName') && '*'}
                    </label>
                    <input
                      type="text"
                      required={isReq('fatherBanglaName')}
                      placeholder="e.g. মো: জাহাঙ্গীর আলম"
                      value={formData.fatherBanglaName}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, fatherBanglaName: e.target.value }))
                      }
                      className="w-full px-3 py-2 rounded-xl bg-white border border-outline-variant/30"
                    />
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {!isHidden('fatherNid') && (
                    <div>
                      <label className="block font-semibold text-on-surface-variant uppercase mb-1">
                        iii. NID No. (10/13/17){isReq('fatherNid') && ' *'}
                      </label>
                      <input
                        type="text"
                        inputMode="numeric"
                        required={isReq('fatherNid')}
                        maxLength={17}
                        placeholder="10, 13, or 17 digits"
                        value={formData.fatherNid}
                        onChange={(e) =>
                          setFormData((prev) => ({
                            ...prev,
                            fatherNid: e.target.value.replace(/\D/g, '').slice(0, 17),
                          }))
                        }
                        className={`w-full px-3 py-2 rounded-xl bg-white border ${
                          errors.fatherNid ? 'border-error' : 'border-outline-variant/30'
                        } font-mono`}
                      />
                      {errors.fatherNid && (
                        <p className="text-[10px] text-error mt-1">{errors.fatherNid}</p>
                      )}
                    </div>
                  )}

                  {!isHidden('fatherPhone') && (
                    <div>
                      <label className="block font-semibold text-on-surface-variant uppercase mb-1">
                        iv. Mobile {isReq('fatherPhone') && '*'}
                      </label>
                      <input
                        type="text"
                        inputMode="tel"
                        required={isReq('fatherPhone')}
                        placeholder="01812345678"
                        value={formData.fatherPhone}
                        onChange={(e) =>
                          setFormData((prev) => ({ ...prev, fatherPhone: e.target.value }))
                        }
                        className={`w-full px-3 py-2 rounded-xl bg-white border ${
                          errors.fatherPhone ? 'border-error' : 'border-outline-variant/30'
                        } font-mono`}
                      />
                      {errors.fatherPhone && (
                        <p className="text-[10px] text-error mt-1">{errors.fatherPhone}</p>
                      )}
                    </div>
                  )}
                </div>

                {!isHidden('fatherOccupation') && (
                  <div>
                    <label className="block font-semibold text-on-surface-variant uppercase mb-1">
                      v. Profession {isReq('fatherOccupation') && '*'}
                    </label>
                    <input
                      type="text"
                      required={isReq('fatherOccupation')}
                      placeholder="Government Service / Businessman / Teacher"
                      value={formData.fatherOccupation}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, fatherOccupation: e.target.value }))
                      }
                      className="w-full px-3 py-2 rounded-xl bg-white border border-outline-variant/30"
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Mother Particulars */}
            <div className="p-4 rounded-xl bg-surface-container-low/50 border border-outline-variant/20 space-y-3">
              <h3 className="font-bold text-primary-container text-xs uppercase tracking-wider">
                Mother&apos;s Information
              </h3>
              <div className="space-y-3">
                {!isHidden('motherName') && (
                  <div>
                    <label className="block font-semibold text-on-surface-variant uppercase mb-1">
                      vi. Mother Name English {isReq('motherName') && '*'}
                    </label>
                    <input
                      type="text"
                      required={isReq('motherName')}
                      placeholder="e.g. Shahnaz Begum"
                      value={formData.motherName}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, motherName: e.target.value }))
                      }
                      className={`w-full px-3 py-2 rounded-xl bg-white border ${
                        errors.motherName ? 'border-error' : 'border-outline-variant/30'
                      } font-medium`}
                    />
                    {errors.motherName && (
                      <p className="text-[10px] text-error mt-1">{errors.motherName}</p>
                    )}
                  </div>
                )}

                {!isHidden('motherBanglaName') && (
                  <div>
                    <label className="block font-semibold text-on-surface-variant uppercase mb-1">
                      vii. Mother Name Bangla {isReq('motherBanglaName') && '*'}
                    </label>
                    <input
                      type="text"
                      required={isReq('motherBanglaName')}
                      placeholder="e.g. শাহনাজ বেগম"
                      value={formData.motherBanglaName}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, motherBanglaName: e.target.value }))
                      }
                      className="w-full px-3 py-2 rounded-xl bg-white border border-outline-variant/30"
                    />
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {!isHidden('motherNid') && (
                    <div>
                      <label className="block font-semibold text-on-surface-variant uppercase mb-1">
                        viii. NID No. (10/13/17){isReq('motherNid') && ' *'}
                      </label>
                      <input
                        type="text"
                        inputMode="numeric"
                        required={isReq('motherNid')}
                        maxLength={17}
                        placeholder="10, 13, or 17 digits"
                        value={formData.motherNid}
                        onChange={(e) =>
                          setFormData((prev) => ({
                            ...prev,
                            motherNid: e.target.value.replace(/\D/g, '').slice(0, 17),
                          }))
                        }
                        className={`w-full px-3 py-2 rounded-xl bg-white border ${
                          errors.motherNid ? 'border-error' : 'border-outline-variant/30'
                        } font-mono`}
                      />
                      {errors.motherNid && (
                        <p className="text-[10px] text-error mt-1">{errors.motherNid}</p>
                      )}
                    </div>
                  )}

                  {!isHidden('motherPhone') && (
                    <div>
                      <label className="block font-semibold text-on-surface-variant uppercase mb-1">
                        ix. Mobile {isReq('motherPhone') && '*'}
                      </label>
                      <input
                        type="text"
                        inputMode="tel"
                        required={isReq('motherPhone')}
                        placeholder="01912345678"
                        value={formData.motherPhone}
                        onChange={(e) =>
                          setFormData((prev) => ({ ...prev, motherPhone: e.target.value }))
                        }
                        className={`w-full px-3 py-2 rounded-xl bg-white border ${
                          errors.motherPhone ? 'border-error' : 'border-outline-variant/30'
                        } font-mono`}
                      />
                      {errors.motherPhone && (
                        <p className="text-[10px] text-error mt-1">{errors.motherPhone}</p>
                      )}
                    </div>
                  )}
                </div>

                {!isHidden('motherOccupation') && (
                  <div>
                    <label className="block font-semibold text-on-surface-variant uppercase mb-1">
                      x. Profession {isReq('motherOccupation') && '*'}
                    </label>
                    <input
                      type="text"
                      required={isReq('motherOccupation')}
                      placeholder="Homemaker / Teacher / Doctor"
                      value={formData.motherOccupation}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, motherOccupation: e.target.value }))
                      }
                      className="w-full px-3 py-2 rounded-xl bg-white border border-outline-variant/30"
                    />
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Optional Local Guardian Collapsible Toggle */}
          {!isHidden('guardianInfo') && (
            <div className="pt-2 border-t border-outline-variant/15">
              <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={formData.hasLocalGuardian}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, hasLocalGuardian: e.target.checked }))
                  }
                  className="w-4 h-4 rounded"
                />
                <span className="font-bold text-on-surface">
                  Add Optional Local Guardian (if student lives away from parents)
                </span>
              </label>

              {formData.hasLocalGuardian && (
                <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 rounded-xl bg-surface-container-low/70 border border-outline-variant/20">
                  <div>
                    <label className="block font-semibold text-on-surface-variant uppercase mb-1">
                      Guardian Name
                    </label>
                    <input
                      type="text"
                      placeholder="Md. Rafiqul Islam"
                      value={formData.guardianName}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, guardianName: e.target.value }))
                      }
                      className="w-full px-3 py-2 rounded-xl bg-white border border-outline-variant/30"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-on-surface-variant uppercase mb-1">
                      Relation
                    </label>
                    <input
                      type="text"
                      placeholder="Uncle / Aunt / Grandfather"
                      value={formData.guardianRelation}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, guardianRelation: e.target.value }))
                      }
                      className="w-full px-3 py-2 rounded-xl bg-white border border-outline-variant/30"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-on-surface-variant uppercase mb-1">
                      Guardian Mobile
                    </label>
                    <input
                      type="text"
                      inputMode="tel"
                      placeholder="01722334455"
                      value={formData.guardianPhone}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, guardianPhone: e.target.value }))
                      }
                      className={`w-full px-3 py-2 rounded-xl bg-white border ${
                        errors.guardianPhone ? 'border-error' : 'border-outline-variant/30'
                      } font-mono`}
                    />
                    {errors.guardianPhone && (
                      <p className="text-[10px] text-error mt-1">{errors.guardianPhone}</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* SECTION 4: PRESENT & PERMANENT ADDRESS (BANGLADESH GEO-DATA) */}
        {(!isHidden('presentAddress') || !isHidden('permanentAddress')) && (
          <div className="rounded-2xl bg-surface-container-lowest border border-outline-variant/25 p-6 space-y-5">
            <h2 className="text-sm font-bold text-on-surface border-b border-outline-variant/15 pb-2.5 flex items-center gap-2">
              <MapPin className="w-4 h-4 text-primary-container" />
              <span>4. Present &amp; Permanent Address (Bangladesh Directory)</span>
            </h2>

            {!isHidden('presentAddress') &&
              renderAddressBlock(
                `Present Address${isReq('presentAddress') ? ' *' : ''}`,
                'presentAddressDetail',
                formData.presentAddressDetail,
                false,
                'presentPostalCode',
                'presentAddress'
              )}

            {!isHidden('permanentAddress') &&
              renderAddressBlock(
                `Permanent Address${isReq('permanentAddress') ? ' *' : ''}`,
                'permanentAddressDetail',
                formData.sameAsPresentAddress
                  ? formData.presentAddressDetail
                  : formData.permanentAddressDetail,
                formData.sameAsPresentAddress,
                'permanentPostalCode',
                'permanentAddress'
              )}
          </div>
        )}

        {/* CUSTOM INSTITUTIONAL FIELDS (if configured by Admin in Schema Controls) */}
        {schema.customFields &&
          schema.customFields.some((cf) => cf.requirement !== 'hidden') && (
            <div className="rounded-2xl bg-surface-container-lowest border border-outline-variant/25 p-6 space-y-4">
              <h2 className="text-sm font-bold text-on-surface border-b border-outline-variant/15 pb-2.5">
                Additional Institutional Fields
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {schema.customFields
                  .filter((cf) => cf.requirement !== 'hidden')
                  .map((cf) => {
                    const required = cf.required || cf.requirement === 'required';
                    return (
                      <div key={cf.id}>
                        <label className="block font-semibold text-on-surface-variant uppercase mb-1">
                          {cf.label} {required && '*'}
                        </label>
                        {cf.type === 'select' && cf.options?.length ? (
                          <select
                            required={required}
                            value={formData.customFields[cf.id] || ''}
                            onChange={(e) =>
                              setFormData((prev) => ({
                                ...prev,
                                customFields: { ...prev.customFields, [cf.id]: e.target.value },
                              }))
                            }
                            className="w-full px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 text-sm"
                          >
                            <option value="">-- Select --</option>
                            {cf.options.map((opt) => (
                              <option key={opt} value={opt}>
                                {opt}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <input
                            type={cf.type === 'number' ? 'number' : 'text'}
                            required={required}
                            value={formData.customFields[cf.id] || ''}
                            onChange={(e) =>
                              setFormData((prev) => ({
                                ...prev,
                                customFields: { ...prev.customFields, [cf.id]: e.target.value },
                              }))
                            }
                            className="w-full px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 text-sm"
                          />
                        )}
                      </div>
                    );
                  })}
              </div>
            </div>
          )}

        {/* Bottom Action Bar */}
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="px-5 py-2.5 rounded-xl bg-surface-container hover:bg-surface-container-high text-xs font-semibold cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-primary-container hover:bg-primary text-on-primary text-xs font-bold shadow-sm cursor-pointer disabled:opacity-60"
          >
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
            <span>
              {mode === 'edit' ? 'Save Student Changes' : 'Complete Admission & Generate PIN'}
            </span>
          </button>
        </div>
      </form>

      {/* INTERACTIVE 35:45 PASSPORT CROPPER MODAL */}
      {showCropper && rawImageSrc && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
          <div className="bg-surface-container-lowest rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl border border-outline-variant/30">
            <div className="flex items-center justify-between border-b border-outline-variant/20 pb-3">
              <h3 className="text-sm font-bold text-on-surface flex items-center gap-2">
                <Scissors className="w-4 h-4 text-primary-container" />
                <span>Crop Passport Photo (Locked 35:45 &rarr; 420&times;540 px)</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowCropper(false)}
                className="p-1.5 rounded-lg hover:bg-surface-container text-on-surface-variant cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex flex-col items-center justify-center bg-surface-container-low rounded-xl p-4 overflow-hidden select-none">
              <div className="relative inline-block overflow-hidden rounded-lg">
                <img
                  ref={imageRef}
                  src={rawImageSrc}
                  alt="Crop source"
                  draggable={false}
                  className="max-h-[320px] max-w-full object-contain block pointer-events-none"
                  onLoad={(e) => {
                    const el = e.currentTarget;
                    const w = el.clientWidth;
                    const h = el.clientHeight;
                    setImgRenderSize({ w, h });
                    const { cropW: cw, cropH: ch } = getCropDimensions(w, h, 0.85);
                    setCropPos({
                      x: Math.max(0, (w - cw) / 2),
                      y: Math.max(0, (h - ch) / 2),
                    });
                  }}
                />
                {imgRenderSize.w > 0 && imgRenderSize.h > 0 && (
                  <div
                    role="presentation"
                    onPointerDown={(e) => {
                      e.currentTarget.setPointerCapture(e.pointerId);
                      dragRef.current = {
                        active: true,
                        startX: e.clientX,
                        startY: e.clientY,
                        origX: clampedCrop.x,
                        origY: clampedCrop.y,
                      };
                    }}
                    onPointerMove={(e) => {
                      if (!dragRef.current.active) return;
                      const dx = e.clientX - dragRef.current.startX;
                      const dy = e.clientY - dragRef.current.startY;
                      setCropPos(
                        clampCropPos(
                          dragRef.current.origX + dx,
                          dragRef.current.origY + dy,
                          imgRenderSize.w,
                          imgRenderSize.h,
                          cropW,
                          cropH
                        )
                      );
                    }}
                    onPointerUp={() => {
                      dragRef.current.active = false;
                    }}
                    style={{
                      left: `${clampedCrop.x}px`,
                      top: `${clampedCrop.y}px`,
                      width: `${cropW}px`,
                      height: `${cropH}px`,
                      boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.55)',
                    }}
                    className="absolute border-2 border-white cursor-move"
                  >
                    <div className="absolute inset-0 border border-primary-container/60 pointer-events-none" />
                  </div>
                )}
              </div>
              <canvas ref={canvasRef} className="hidden" />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[11px] font-semibold text-on-surface-variant">
                <span>Crop Frame Size (Locked 35:45)</span>
                <span className="font-mono">{Math.round(cropScale * 100)}%</span>
              </div>
              <input
                type="range"
                min={0.4}
                max={1}
                step={0.02}
                value={cropScale}
                onChange={(e) => {
                  const nextScale = parseFloat(e.target.value);
                  setCropScale(nextScale);
                  const { cropW: nw, cropH: nh } = getCropDimensions(
                    imgRenderSize.w,
                    imgRenderSize.h,
                    nextScale
                  );
                  setCropPos((prev) =>
                    clampCropPos(prev.x, prev.y, imgRenderSize.w, imgRenderSize.h, nw, nh)
                  );
                }}
                className="w-full accent-primary-container"
              />
              <p className="text-[11px] text-on-surface-variant text-center">
                Drag the frame to center the face. Output is exported cleanly at 420 &times; 540 px.
              </p>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-outline-variant/20">
              <button
                type="button"
                onClick={() => setShowCropper(false)}
                className="px-4 py-2 rounded-xl bg-surface-container hover:bg-surface-container-high text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmCrop}
                className="px-5 py-2.5 rounded-xl bg-primary-container hover:bg-primary text-on-primary font-bold text-xs shadow cursor-pointer"
              >
                Crop &amp; Upload (420&times;540)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
