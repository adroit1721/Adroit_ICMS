import {
  AcademicClass,
  AcademicGroup,
  Exam,
  InstituteRules,
  MarkEntry,
  PromotionMode,
  StructuredAddress,
  Student,
  StudentCoreFieldKey,
  StudentFieldRequirement,
  StudentSchemaConfig,
  Subject,
} from './types';
import { compileStudentExamRecord } from './grading-engine';
import { getEffectiveSectionsForClassGroup } from './academic-helpers';

export const EMPTY_STRUCTURED_ADDRESS: StructuredAddress = {
  division: '',
  district: '',
  upazila: '',
  villageRoad: '',
  postOffice: '',
  postalCode: '',
};

export interface StudentSchemaFieldMeta {
  key: StudentCoreFieldKey;
  label: string;
  csvHeader: string;
  section: 'photo' | 'academic' | 'personal' | 'parents' | 'address';
  defaultRequirement: StudentFieldRequirement;
  lockedRequired?: boolean;
}

export const STUDENT_SCHEMA_FIELDS: StudentSchemaFieldMeta[] = [
  // Photo
  {
    key: 'avatarUrl',
    label: 'Student Passport Picture (35:45)',
    csvHeader: 'Avatar URL',
    section: 'photo',
    defaultRequirement: 'optional',
  },

  // 1. Academic Information
  {
    key: 'className',
    label: 'Select Class',
    csvHeader: 'Class',
    section: 'academic',
    defaultRequirement: 'required',
    lockedRequired: true,
  },
  {
    key: 'group',
    label: 'Academic Group',
    csvHeader: 'Group',
    section: 'academic',
    defaultRequirement: 'required',
  },
  {
    key: 'sectionName',
    label: 'Section',
    csvHeader: 'Section',
    section: 'academic',
    defaultRequirement: 'required',
  },
  {
    key: 'shift',
    label: 'Shift',
    csvHeader: 'Shift',
    section: 'academic',
    defaultRequirement: 'required',
  },
  {
    key: 'rollNumber',
    label: 'Class Roll',
    csvHeader: 'Roll',
    section: 'academic',
    defaultRequirement: 'required',
    lockedRequired: true,
  },
  {
    key: 'registrationNumber',
    label: 'Board Registration No.',
    csvHeader: 'Board Reg No',
    section: 'academic',
    defaultRequirement: 'optional',
  },
  {
    key: 'systemId',
    label: 'Student ID (Blank = Auto)',
    csvHeader: 'Student ID',
    section: 'academic',
    defaultRequirement: 'optional',
  },
  {
    key: 'password',
    label: '6-Digit Password (Blank = Auto)',
    csvHeader: 'Password PIN',
    section: 'academic',
    defaultRequirement: 'required',
  },
  {
    key: 'phone',
    label: 'Primary Mobile (SMS & Login)',
    csvHeader: 'Primary Mobile',
    section: 'academic',
    defaultRequirement: 'required',
  },

  // 2. Personal Information
  {
    key: 'fullName',
    label: 'Student Name (English)',
    csvHeader: 'Name (English)',
    section: 'personal',
    defaultRequirement: 'required',
    lockedRequired: true,
  },
  {
    key: 'banglaName',
    label: 'Student Name (Bangla)',
    csvHeader: 'Name (Bangla)',
    section: 'personal',
    defaultRequirement: 'optional',
  },
  {
    key: 'gender',
    label: 'Gender (Male / Female / Other)',
    csvHeader: 'Gender',
    section: 'personal',
    defaultRequirement: 'required',
  },
  {
    key: 'religionGroup',
    label: 'Religion',
    csvHeader: 'Religion',
    section: 'personal',
    defaultRequirement: 'required',
  },
  {
    key: 'dateOfBirth',
    label: 'Date of Birth (DD/MM/YYYY)',
    csvHeader: 'Date of Birth (DD/MM/YYYY)',
    section: 'personal',
    defaultRequirement: 'required',
  },
  {
    key: 'birthRegOrNid',
    label: 'Birth Registration No. (17-digit)',
    csvHeader: 'Birth Reg No (17 Digit)',
    section: 'personal',
    defaultRequirement: 'optional',
  },
  {
    key: 'bloodGroup',
    label: 'Blood Group',
    csvHeader: 'Blood Group',
    section: 'personal',
    defaultRequirement: 'optional',
  },

  // 3. Parents & Guardian Information
  {
    key: 'fatherName',
    label: 'Father Name (English)',
    csvHeader: 'Father Name (English)',
    section: 'parents',
    defaultRequirement: 'required',
  },
  {
    key: 'fatherBanglaName',
    label: 'Father Name (Bangla)',
    csvHeader: 'Father Name (Bangla)',
    section: 'parents',
    defaultRequirement: 'optional',
  },
  {
    key: 'fatherNid',
    label: 'Father NID No.',
    csvHeader: 'Father NID',
    section: 'parents',
    defaultRequirement: 'optional',
  },
  {
    key: 'fatherPhone',
    label: 'Father Mobile',
    csvHeader: 'Father Mobile',
    section: 'parents',
    defaultRequirement: 'required',
  },
  {
    key: 'fatherProfession',
    label: 'Father Profession',
    csvHeader: 'Father Profession',
    section: 'parents',
    defaultRequirement: 'optional',
  },
  {
    key: 'motherName',
    label: 'Mother Name (English)',
    csvHeader: 'Mother Name (English)',
    section: 'parents',
    defaultRequirement: 'required',
  },
  {
    key: 'motherBanglaName',
    label: 'Mother Name (Bangla)',
    csvHeader: 'Mother Name (Bangla)',
    section: 'parents',
    defaultRequirement: 'optional',
  },
  {
    key: 'motherNid',
    label: 'Mother NID No.',
    csvHeader: 'Mother NID',
    section: 'parents',
    defaultRequirement: 'optional',
  },
  {
    key: 'motherPhone',
    label: 'Mother Mobile',
    csvHeader: 'Mother Mobile',
    section: 'parents',
    defaultRequirement: 'required',
  },
  {
    key: 'motherProfession',
    label: 'Mother Profession',
    csvHeader: 'Mother Profession',
    section: 'parents',
    defaultRequirement: 'optional',
  },
  {
    key: 'guardianInfo',
    label: 'Local Guardian (Fallback)',
    csvHeader: 'Local Guardian',
    section: 'parents',
    defaultRequirement: 'optional',
  },

  // 4. Address
  {
    key: 'presentAddress',
    label: 'Present Address (Bangladesh Directory)',
    csvHeader: 'Present Address',
    section: 'address',
    defaultRequirement: 'optional',
  },
  {
    key: 'permanentAddress',
    label: 'Permanent Address (Bangladesh Directory)',
    csvHeader: 'Permanent Address',
    section: 'address',
    defaultRequirement: 'optional',
  },
];

export const DEFAULT_STUDENT_SCHEMA_CONFIG: StudentSchemaConfig = {
  fields: STUDENT_SCHEMA_FIELDS.reduce((acc, f) => {
    acc[f.key] = f.defaultRequirement;
    return acc;
  }, {} as Record<StudentCoreFieldKey, StudentFieldRequirement>),
  customFields: [],
};

const FIELD_CONFIG_ALIASES: Record<string, StudentCoreFieldKey[]> = {
  fatherOccupation: ['fatherOccupation', 'fatherProfession'],
  fatherProfession: ['fatherProfession', 'fatherOccupation'],
  motherOccupation: ['motherOccupation', 'motherProfession'],
  motherProfession: ['motherProfession', 'motherOccupation'],
  guardianName: ['guardianName', 'guardianInfo'],
  guardianRelation: ['guardianRelation', 'guardianInfo'],
  guardianPhone: ['guardianPhone', 'guardianInfo'],
  guardianInfo: ['guardianInfo', 'guardianName'],
};

export function getEffectiveStudentSchema(
  rules?: Partial<InstituteRules>
): StudentSchemaConfig {
  const saved = rules?.studentSchemaConfig;
  const fieldCfgItems = rules?.studentFieldConfig?.fields;
  const mergedFields: Record<string, StudentFieldRequirement> = {
    ...DEFAULT_STUDENT_SCHEMA_CONFIG.fields,
  };

  if (saved?.fields) {
    for (const [k, v] of Object.entries(saved.fields)) {
      if (v === 'required' || v === 'optional' || v === 'hidden') {
        mergedFields[k] = v;
      }
    }
  }

  if (Array.isArray(fieldCfgItems)) {
    for (const item of fieldCfgItems) {
      if (
        item.key &&
        (item.visibility === 'required' ||
          item.visibility === 'optional' ||
          item.visibility === 'hidden')
      ) {
        mergedFields[item.key] = item.visibility;
      }
    }
  }

  for (const meta of STUDENT_SCHEMA_FIELDS) {
    if (meta.lockedRequired) {
      mergedFields[meta.key] = 'required';
    }
  }

  return {
    fields: mergedFields,
    customFields: Array.isArray(saved?.customFields) ? saved.customFields : [],
  };
}

export function getFieldRequirement(
  schema: StudentSchemaConfig,
  key: StudentCoreFieldKey
): StudentFieldRequirement {
  const meta = STUDENT_SCHEMA_FIELDS.find((f) => f.key === key);
  if (meta?.lockedRequired) return 'required';
  const candidates = FIELD_CONFIG_ALIASES[key] || [key];
  for (const candidate of candidates) {
    const val = schema.fields[candidate];
    if (val === 'required' || val === 'optional' || val === 'hidden') {
      return val;
    }
  }
  return meta?.defaultRequirement ?? 'optional';
}

export function isValidSixDigitPin(raw: string): boolean {
  return /^\d{6}$/.test(raw.trim());
}

export function resolveAcademicYearDigits(yearOrCycle?: string | number): string {
  const str = String(yearOrCycle ?? '').trim();
  const fourDigitMatch = str.match(/\b(19\d{2}|20\d{2})\b/);
  if (fourDigitMatch) {
    return fourDigitMatch[0];
  }
  const twoDigitMatch = str.match(/^\d{2}$/);
  if (twoDigitMatch) {
    return `20${twoDigitMatch[0]}`;
  }
  return String(new Date().getFullYear());
}

export function resolveAcademicYearTwoDigits(yearOrCycle?: string | number): string {
  const str = String(yearOrCycle ?? '').trim();
  const fourDigitMatch = str.match(/\d{4}/);
  if (fourDigitMatch) {
    return fourDigitMatch[0].slice(-2);
  }
  const twoDigitMatch = str.match(/^\d{2}$/);
  if (twoDigitMatch) {
    return twoDigitMatch[0];
  }
  return String(new Date().getFullYear()).slice(-2);
}

export function formatStudentSystemId(
  prefixInput: string | undefined,
  year: number | string,
  seqNum: number
): string {
  // Strip all hyphens, spaces, and special characters: strictly prefix+year+4digit
  const cleanPrefix =
    (prefixInput || 'AG')
      .replace(/[\s-]/g, '')
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '') || 'AG';
  const yr = resolveAcademicYearDigits(year);
  const numStr = String(Math.max(1, seqNum)).padStart(4, '0');
  if (cleanPrefix.endsWith(yr)) {
    return `${cleanPrefix}${numStr}`;
  }
  return `${cleanPrefix}${yr}${numStr}`;
}

export function extractStudentIdSequence(
  systemId: string | undefined,
  prefixInput: string | undefined,
  year: number | string
): number {
  if (!systemId) return 0;
  // Clean input by removing hyphens and spaces
  const cleanId = systemId.replace(/[\s-]/g, '').trim().toUpperCase();
  if (!cleanId) return 0;

  const cleanPrefix =
    (prefixInput || 'AG')
      .replace(/[\s-]/g, '')
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '') || 'AG';
  const yr4 = resolveAcademicYearDigits(year);
  const yr2 = yr4.slice(-2);
  const esc = (v: string) => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // If cleanPrefix already ends with 4-digit year (e.g. AG2025)
  if (cleanPrefix.endsWith(yr4)) {
    const m = cleanId.match(new RegExp(`^${esc(cleanPrefix)}(\\d{4,})$`, 'i'));
    if (m) {
      const n = parseInt(m[1], 10);
      return Number.isNaN(n) ? 0 : n;
    }
  }

  // 1. Primary: Match prefix + 4-digit year + 4+ digits (e.g. AG20250001, AG20241001)
  const matchFullYear = cleanId.match(
    new RegExp(`^${esc(cleanPrefix)}${esc(yr4)}(\\d{4,})$`, 'i')
  );
  if (matchFullYear) {
    const n = parseInt(matchFullYear[1], 10);
    return Number.isNaN(n) ? 0 : n;
  }

  // 2. Compact 2-digit year format: <PREFIX><YY><4+ digits> (e.g. AG250001, AG260001)
  const matchTwoDigitYear = cleanId.match(
    new RegExp(`^${esc(cleanPrefix)}${esc(yr2)}(\\d{4,})$`, 'i')
  );
  if (matchTwoDigitYear) {
    const n = parseInt(matchTwoDigitYear[1], 10);
    return Number.isNaN(n) ? 0 : n;
  }

  // 3. Backward-compatible match for unstripped raw string with hyphens/spaces: e.g. AG-2025-0001 or AG-2024-1001
  const rawId = systemId.trim().toUpperCase();
  const matchRaw = rawId.match(
    new RegExp(`^${esc(cleanPrefix)}[- ]*(?:${esc(yr4)}|${esc(yr2)})[- ]*(\\d{4,})$`, 'i')
  );
  if (matchRaw) {
    const n = parseInt(matchRaw[1], 10);
    return Number.isNaN(n) ? 0 : n;
  }

  return 0;
}

export function getNextStudentSystemIdFromStudents(
  students: Array<{ systemId?: string }>,
  prefixInput: string | undefined,
  year: number | string,
  offset = 0
): string {
  // Existing IDs normalized without hyphens or spaces
  const existingNormalizedIds = new Set(
    students
      .map((s) => (s.systemId || '').replace(/[\s-]/g, '').trim().toUpperCase())
      .filter(Boolean)
  );
  let maxNum = 0;
  for (const s of students) {
    const seq = extractStudentIdSequence(s.systemId, prefixInput, year);
    if (seq > maxNum) maxNum = seq;
  }
  let candidateSeq = maxNum + 1 + offset;
  let candidate = formatStudentSystemId(prefixInput, year, candidateSeq);
  // Ensure strict uniqueness: increment until an unassigned candidate is found
  while (existingNormalizedIds.has(candidate.replace(/[\s-]/g, '').toUpperCase())) {
    candidateSeq += 1;
    candidate = formatStudentSystemId(prefixInput, year, candidateSeq);
  }
  return candidate;
}

export function normalizeBdMobileInput(raw: string): string {
  const stripped = raw.replace(/[\s-]/g, '').trim();
  if (stripped.startsWith('+880')) return `0${stripped.slice(4)}`;
  if (stripped.startsWith('880') && stripped.length >= 13) return `0${stripped.slice(3)}`;
  return stripped;
}

export function isValidBdMobile(raw: string): boolean {
  if (!raw.trim()) return true;
  const normalized = normalizeBdMobileInput(raw);
  return /^01[3-9]\d{8}$/.test(normalized);
}

export function isValidBdBirthReg(raw: string): boolean {
  const clean = raw.replace(/\s+/g, '').trim();
  if (!clean) return true;
  return /^\d{17}$/.test(clean);
}

export function isValidBdNid(raw: string): boolean {
  const clean = raw.replace(/\s+/g, '').trim();
  if (!clean) return true;
  return /^(\d{10}|\d{13}|\d{17})$/.test(clean);
}

export function generateSixDigitPin(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export function autoFormatDDMMYYYYInput(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

export function formatISOToDDMMYYYY(iso?: string): string {
  if (!iso || !iso.trim()) return '';
  const trimmed = iso.trim();
  const m = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(trimmed)) return trimmed;
  return '';
}

export function parseDDMMYYYYToISO(ddmmyyyy: string): string | null {
  const m = ddmmyyyy.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const day = parseInt(m[1], 10);
  const month = parseInt(m[2], 10);
  const year = parseInt(m[3], 10);
  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 1950 || year > 2100) {
    return null;
  }
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    return null;
  }
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function formatStructuredAddress(detail?: StructuredAddress): string {
  if (!detail) return '';
  const postPart = detail.postOffice?.trim()
    ? `${detail.postOffice.trim()}${detail.postalCode?.trim() ? `-${detail.postalCode.trim()}` : ''}`
    : detail.postalCode?.trim()
    ? `Postal: ${detail.postalCode.trim()}`
    : '';
  const parts = [
    detail.villageRoad?.trim(),
    postPart,
    detail.upazila?.trim(),
    detail.district?.trim(),
    detail.division?.trim(),
  ].filter(Boolean);
  return parts.join(', ');
}

export interface ExportFieldOption {
  id: string;
  label: string;
  defaultSelected: boolean;
}

export function getExportFieldOptions(rules?: InstituteRules): ExportFieldOption[] {
  const schema = getEffectiveStudentSchema(rules);
  const options: ExportFieldOption[] = [
    { id: 'rollNumber', label: 'Roll No.', defaultSelected: true },
    { id: 'systemId', label: 'Student ID', defaultSelected: true },
    { id: 'fullName', label: 'Name (English)', defaultSelected: true },
    { id: 'banglaName', label: 'Name (Bangla)', defaultSelected: false },
    { id: 'className', label: 'Class', defaultSelected: true },
    { id: 'group', label: 'Group', defaultSelected: true },
    { id: 'sectionName', label: 'Section', defaultSelected: true },
    { id: 'shift', label: 'Shift', defaultSelected: false },
    { id: 'registrationNumber', label: 'Board Reg No.', defaultSelected: false },
    { id: 'phone', label: 'Primary Mobile', defaultSelected: true },
    { id: 'gender', label: 'Gender', defaultSelected: false },
    { id: 'religionGroup', label: 'Religion', defaultSelected: false },
    { id: 'dateOfBirth', label: 'Date of Birth', defaultSelected: false },
    { id: 'birthRegOrNid', label: 'Birth Reg No.', defaultSelected: false },
    { id: 'bloodGroup', label: 'Blood Group', defaultSelected: false },
    { id: 'fatherName', label: 'Father Name', defaultSelected: true },
    { id: 'fatherPhone', label: 'Father Mobile', defaultSelected: false },
    { id: 'fatherNid', label: 'Father NID', defaultSelected: false },
    { id: 'fatherProfession', label: 'Father Profession', defaultSelected: false },
    { id: 'motherName', label: 'Mother Name', defaultSelected: false },
    { id: 'motherPhone', label: 'Mother Mobile', defaultSelected: false },
    { id: 'motherNid', label: 'Mother NID', defaultSelected: false },
    { id: 'motherProfession', label: 'Mother Profession', defaultSelected: false },
    { id: 'presentAddress', label: 'Present Address', defaultSelected: false },
    { id: 'permanentAddress', label: 'Permanent Address', defaultSelected: false },
  ];

  if (Array.isArray(schema.customFields)) {
    for (const cf of schema.customFields) {
      if (cf.requirement !== 'hidden') {
        options.push({
          id: `custom:${cf.id}`,
          label: cf.label,
          defaultSelected: false,
        });
      }
    }
  }
  return options;
}

export interface PromotionPreviewRow {
  student: Student;
  targetSection: string;
  targetGroup: AcademicGroup;
  newRoll: number;
  hasExamRecord: boolean;
  gpa?: number;
  totalMarks?: number;
  isPassed?: boolean;
  requiresGroupSelection: boolean;
  collisionWithExisting: boolean;
}

export function buildPromotionPreview(params: {
  selectedStudents: Student[];
  allStudents: Student[];
  targetClass: string;
  targetSection: string;
  targetGroupOverride: AcademicGroup | 'KEEP';
  targetClsObj?: AcademicClass;
  mode: PromotionMode;
  exam?: Exam;
  subjects: Subject[];
  markEntries: MarkEntry[];
  rules: InstituteRules;
}): PromotionPreviewRow[] {
  const {
    selectedStudents,
    allStudents,
    targetClass,
    targetSection,
    targetGroupOverride,
    targetClsObj,
    mode,
    exam,
    subjects,
    markEntries,
    rules,
  } = params;

  const targetHasGroups =
    targetClsObj?.hasGroups !== false &&
    (targetClsObj?.groups?.some((g) => g !== 'General') ?? false);
  const validTargetGroups: AcademicGroup[] = targetHasGroups
    ? (targetClsObj?.groups?.filter((g) => g !== 'General').length
        ? targetClsObj.groups.filter((g) => g !== 'General')
        : ['Science', 'Business Studies', 'Humanities'])
    : ['General'];
  const combinePaired = rules.combinePairedPapersInResult ?? true;

  const scored = selectedStudents.map((stu) => {
    const hasMarksInExam = Boolean(
      exam && markEntries.some((m) => m.examId === exam.id && m.studentId === stu.id)
    );
    const compiled =
      exam && hasMarksInExam
        ? compileStudentExamRecord(stu, exam, subjects, markEntries, {
            combinePairedPapers: combinePaired,
          })
        : null;

    let resolvedGroup: AcademicGroup = stu.group;
    if (!targetHasGroups) {
      resolvedGroup = 'General';
    } else if (targetGroupOverride !== 'KEEP' && targetGroupOverride !== 'General') {
      resolvedGroup = targetGroupOverride;
    } else if (stu.group === 'General' || !validTargetGroups.includes(stu.group)) {
      resolvedGroup = validTargetGroups[0] || 'Science';
    }

    const secOptions = getEffectiveSectionsForClassGroup(targetClsObj, resolvedGroup);
    const resolvedSection =
      targetSection && secOptions.includes(targetSection)
        ? targetSection
        : secOptions[0] || 'Common';

    return {
      student: stu,
      targetSection: resolvedSection,
      targetGroup: resolvedGroup,
      requiresGroupSelection:
        targetHasGroups && (stu.group === 'General' || !validTargetGroups.includes(stu.group)),
      hasExamRecord: hasMarksInExam,
      gpa: compiled?.finalGPA,
      totalMarks: compiled?.totalMarksObtained,
      isPassed: compiled?.isPassed,
    };
  });

  const ordered = [...scored].sort((a, b) => {
    if (mode === 'merit' && exam) {
      const aHas = a.hasExamRecord ? 1 : 0;
      const bHas = b.hasExamRecord ? 1 : 0;
      if (aHas !== bHas) return bHas - aHas;
      const aPass = a.isPassed ? 1 : 0;
      const bPass = b.isPassed ? 1 : 0;
      if (aPass !== bPass) return bPass - aPass;
      if ((b.gpa ?? 0) !== (a.gpa ?? 0)) return (b.gpa ?? 0) - (a.gpa ?? 0);
      if ((b.totalMarks ?? 0) !== (a.totalMarks ?? 0)) {
        return (b.totalMarks ?? 0) - (a.totalMarks ?? 0);
      }
    }
    return a.student.rollNumber - b.student.rollNumber;
  });

  const existingInTarget = allStudents.filter(
    (s) =>
      s.status === 'Active' &&
      s.className === targetClass &&
      !selectedStudents.some((sel) => sel.id === s.id)
  );

  const sectionRollCounter = new Map<string, number>();

  return ordered.map((item) => {
    const secKey = item.targetSection || 'Common';
    const existingRollsInSec = new Set(
      existingInTarget
        .filter((s) => (s.sectionName || 'Common') === secKey)
        .map((s) => s.rollNumber)
    );

    let newRoll = item.student.rollNumber;
    if (mode === 'merit' || mode === 'direct') {
      const baseMax =
        existingRollsInSec.size > 0 ? Math.max(...Array.from(existingRollsInSec)) : 0;
      const currentCount = sectionRollCounter.get(secKey) ?? baseMax;
      newRoll = currentCount + 1;
      sectionRollCounter.set(secKey, newRoll);
    }

    return {
      student: item.student,
      targetSection: item.targetSection,
      targetGroup: item.targetGroup,
      newRoll,
      hasExamRecord: item.hasExamRecord,
      gpa: item.gpa,
      totalMarks: item.totalMarks,
      isPassed: item.isPassed,
      requiresGroupSelection: item.requiresGroupSelection,
      collisionWithExisting: existingRollsInSec.has(newRoll),
    };
  });
}
