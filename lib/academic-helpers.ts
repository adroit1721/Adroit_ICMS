import {
  AcademicClass,
  AcademicGroup,
  ClassRoutineDay,
  ClassRoutinePeriod,
  CustomSubjectComponent,
  Exam,
  InstituteRules,
  ParallelRoutineSession,
  ShiftType,
  Student,
  Subject,
  SubjectComponent,
  Teacher,
  GenderType,
} from './types';

export function sortSubjectsByOrder<T extends Pick<Subject, 'order' | 'code' | 'name'>>(
  list: T[]
): T[] {
  return [...list].sort((a, b) => {
    const orderA = typeof a.order === 'number' && Number.isFinite(a.order) ? a.order : 9999;
    const orderB = typeof b.order === 'number' && Number.isFinite(b.order) ? b.order : 9999;
    if (orderA !== orderB) return orderA - orderB;
    const codeCmp = (a.code || '').localeCompare(b.code || '', undefined, {
      numeric: true,
      sensitivity: 'base',
    });
    if (codeCmp !== 0) return codeCmp;
    return (a.name || '').localeCompare(b.name || '');
  });
}

export function isSubjectComponentEnabled(
  comp?: Pick<SubjectComponent, 'enabled' | 'fullMarks'>
): boolean {
  if (!comp) return false;
  if (typeof comp.enabled === 'boolean') {
    return comp.enabled && comp.fullMarks > 0;
  }
  return comp.fullMarks > 0;
}

export function getEffectiveConversionPercent(conversionPercent?: number): number {
  if (typeof conversionPercent === 'number' && Number.isFinite(conversionPercent)) {
    return Math.min(100, Math.max(1, conversionPercent));
  }
  return 100;
}

export function calcConvertedMark(rawMarks: number, conversionPercent?: number): number {
  const pct = getEffectiveConversionPercent(conversionPercent);
  const safeRaw = Math.max(0, Number(rawMarks) || 0);
  if (pct === 100) return Math.round(safeRaw);
  return Math.round((safeRaw * pct) / 100);
}

export interface ResolvedSubjectCTConfig {
  enabled: boolean;
  mode: 'subject' | 'legacy-exam' | 'off';
  fullMarks: number;
  passMarks: number;
  conversionPercent: number;
  effectiveFullMarks: number;
  effectivePassMarks: number;
  writtenRatioPercent: number;
}

export function resolveSubjectCTConfig(
  subject: Pick<Subject, 'components'>,
  exam?: Pick<Exam, 'enableCT' | 'ctMaxMarks' | 'writtenRatioPercent'>
): ResolvedSubjectCTConfig {
  const subCt = subject.components.ct;
  if (subCt !== undefined) {
    if (subCt.enabled && subCt.fullMarks > 0) {
      const conv = getEffectiveConversionPercent(subCt.conversionPercent);
      return {
        enabled: true,
        mode: 'subject',
        fullMarks: subCt.fullMarks,
        passMarks: subCt.passMarks,
        conversionPercent: conv,
        effectiveFullMarks: calcConvertedMark(subCt.fullMarks, conv),
        effectivePassMarks: calcConvertedMark(subCt.passMarks, conv),
        writtenRatioPercent: 100,
      };
    }
    return {
      enabled: false,
      mode: 'off',
      fullMarks: 0,
      passMarks: 0,
      conversionPercent: 100,
      effectiveFullMarks: 0,
      effectivePassMarks: 0,
      writtenRatioPercent: 100,
    };
  }

  // Backward compatibility for subjects created before Subject-level CT checkbox existed
  if (exam?.enableCT) {
    const writtenRatio = Math.min(100, Math.max(0, exam.writtenRatioPercent ?? 80));
    return {
      enabled: true,
      mode: 'legacy-exam',
      fullMarks: exam.ctMaxMarks || 20,
      passMarks: 0,
      conversionPercent: Math.max(0, 100 - writtenRatio),
      effectiveFullMarks: 0,
      effectivePassMarks: 0,
      writtenRatioPercent: writtenRatio,
    };
  }

  return {
    enabled: false,
    mode: 'off',
    fullMarks: 0,
    passMarks: 0,
    conversionPercent: 100,
    effectiveFullMarks: 0,
    effectivePassMarks: 0,
    writtenRatioPercent: 100,
  };
}

export function getActiveSubjectCustomComponents(
  subject: Pick<Subject, 'customComponents'>
): CustomSubjectComponent[] {
  return (subject.customComponents || []).filter(
    (c) => c.enabled && c.fullMarks > 0 && c.label.trim().length > 0
  );
}

export function computeSubjectMarksTotals(
  components: Subject['components'],
  customComponents: CustomSubjectComponent[] = []
): { totalFullMarks: number; totalPassMarks: number } {
  const fixedList = [components.cq, components.mcq, components.practical, components.ct];
  let totalFullMarks = 0;
  let totalPassMarks = 0;

  for (const comp of fixedList) {
    if (!comp || !isSubjectComponentEnabled(comp)) continue;
    const conv = getEffectiveConversionPercent(comp.conversionPercent);
    totalFullMarks += calcConvertedMark(comp.fullMarks, conv);
    totalPassMarks += calcConvertedMark(comp.passMarks, conv);
  }

  for (const custom of customComponents) {
    if (!custom.enabled || custom.fullMarks <= 0 || !custom.label.trim()) continue;
    const conv = getEffectiveConversionPercent(custom.conversionPercent);
    totalFullMarks += calcConvertedMark(custom.fullMarks, conv);
    totalPassMarks += calcConvertedMark(custom.passMarks, conv);
  }

  return { totalFullMarks, totalPassMarks };
}

/**
 * Returns the canonical list of academic groups that a subject applies to.
 * Supports multi-group subjects (e.g. General Science 127 for Business Studies + Humanities,
 * or Agriculture 134 / Home Science 151 across Science + Business Studies + Humanities).
 */
export function getSubjectGroups(
  sub: Pick<Subject, 'applicableGroups' | 'group'>
): AcademicGroup[] {
  if (sub.applicableGroups && sub.applicableGroups.length > 0) {
    return sub.applicableGroups;
  }
  return [sub.group || 'General'];
}

export function subjectAppliesToGroup(
  sub: Pick<Subject, 'applicableGroups' | 'group'>,
  group: AcademicGroup | 'All' | undefined
): boolean {
  if (!group || group === 'All') return true;
  const groups = getSubjectGroups(sub);
  if (groups.includes('General')) return true;
  return groups.includes(group);
}

export function formatSubjectGroupsLabel(
  sub: Pick<Subject, 'applicableGroups' | 'group'>
): string {
  const groups = getSubjectGroups(sub);
  if (groups.includes('General')) return 'General (All)';
  return groups.join(' + ');
}

export function isStudentGenderEligibleForSubject(
  sub: Subject,
  gender?: Student['gender']
): boolean {
  if (sub.genderRestriction === 'Female' && gender === 'Male') {
    return false;
  }
  return true;
}

/**
 * Checks whether a Subject applies to a given Student based on:
 * class, multi-group routing, religion restriction, gender restriction (e.g. Female-only Home Science),
 * and student's chosen main electives (`electiveSubjectIds`) + optional 4th subject (`optionalFourthSubjectId`).
 */
export function subjectAppliesToStudent(
  sub: Subject,
  student: Student,
  options?: { hasExistingMark?: boolean }
): boolean {
  if (sub.classLevel !== student.className) return false;
  if (!subjectAppliesToGroup(sub, student.group)) return false;
  if (!isStudentGenderEligibleForSubject(sub, student.gender)) {
    return false;
  }
  // Compulsory subjects with no religion restriction apply to every religion including "Other"
  if (sub.isCompulsory && !sub.religionRestriction) {
    return true;
  }
  if (sub.religionRestriction && sub.religionRestriction !== student.religionGroup) {
    return false;
  }
  if (sub.isCompulsory || sub.religionRestriction) {
    return true;
  }
  // Elective / 4th subject pool
  const hasConfiguredElectives = Array.isArray(student.electiveSubjectIds);
  if (hasConfiguredElectives) {
    return (
      student.electiveSubjectIds!.includes(sub.id) ||
      student.optionalFourthSubjectId === sub.id ||
      Boolean(options?.hasExistingMark)
    );
  }
  // Legacy fallback if student record predates electiveSubjectIds
  if (student.optionalFourthSubjectId === sub.id || options?.hasExistingMark) {
    return true;
  }
  return !sub.canBeFourthSubject;
}

/**
 * Returns valid sections for a class and optional academic group.
 */
export function getEffectiveSectionsForClassGroup(
  cls: AcademicClass | undefined,
  group?: AcademicGroup | 'All'
): string[] {
  if (!cls) return ['A', 'B'];
  if (cls.hasGroups === false) {
    if (cls.hasSections === false) return ['Common'];
    return cls.sections.length ? cls.sections : ['Common'];
  }

  if (cls.sectionMode === 'per-group') {
    if (group && group !== 'All' && group !== 'General') {
      const grpSecs = cls.groupSections?.[group];
      return grpSecs && grpSecs.length ? grpSecs : ['Common'];
    }
    const merged = new Set<string>();
    const targetGroups = cls.groups.filter((g) => g !== 'General');
    for (const g of targetGroups) {
      const secs = cls.groupSections?.[g];
      if (secs && secs.length) {
        secs.forEach((s) => merged.add(s));
      } else {
        merged.add('Common');
      }
    }
    return merged.size > 0 ? Array.from(merged) : ['Common'];
  }

  if (cls.hasSections === false) return ['Common'];
  return cls.sections.length ? cls.sections : ['Common'];
}

export function isSingleBatchCohort(sections: string[]): boolean {
  return sections.length <= 1 && (sections[0] === 'Common' || !sections[0]);
}

export function formatGroupSectionDisplay(
  group: string | undefined,
  section: string | undefined
): string {
  const sec = section || 'Common';
  if (!group || group === 'General' || group === 'All') {
    return sec === 'Common' ? 'Combined' : `Section ${sec}`;
  }
  return sec === 'Common' ? `${group} (Combined)` : `${group} (${sec})`;
}

export function resolveRoutineDayRow(
  classRoutines: ClassRoutineDay[],
  className: string,
  group: AcademicGroup | 'All' | undefined,
  sectionName: string,
  shift: ShiftType,
  day: string
): ClassRoutineDay | undefined {
  const sameSlot = (r: ClassRoutineDay) =>
    r.className === className && r.shift === shift && r.day === day;

  if (group && group !== 'All' && group !== 'General') {
    const exactGrpSec = classRoutines.find(
      (r) => sameSlot(r) && r.group === group && r.sectionName === sectionName
    );
    if (exactGrpSec) return exactGrpSec;

    const grpCommon = classRoutines.find(
      (r) => sameSlot(r) && r.group === group && r.sectionName === 'Common'
    );
    if (grpCommon) return grpCommon;
  }

  const isCombined = (r: ClassRoutineDay) => !r.group || r.group === 'All';

  const combinedSec = classRoutines.find(
    (r) => sameSlot(r) && isCombined(r) && r.sectionName === sectionName
  );
  if (combinedSec) return combinedSec;

  return classRoutines.find(
    (r) => sameSlot(r) && isCombined(r) && r.sectionName === 'Common'
  );
}

/**
 * Normalizes a period's parallel sessions (supporting both modern `parallelSessions` and legacy `groupSplits`).
 */
export function getPeriodParallelSessions(
  period: ClassRoutinePeriod | undefined
): ParallelRoutineSession[] {
  if (!period) return [];
  if (period.parallelSessions && period.parallelSessions.length > 0) {
    return period.parallelSessions;
  }
  if (period.isGroupSplit && period.groupSplits) {
    return Object.entries(period.groupSplits)
      .filter(([, v]) => Boolean(v?.subjectName))
      .map(([grp, v]) => ({
        id: `legacy-${grp}`,
        subjectName: v!.subjectName,
        teacherName: v!.teacherName,
        room: v!.room,
        targetGroups: [grp as AcademicGroup],
      }));
  }
  return [];
}

/**
 * Resolves a single period for a specific academic group.
 * Handles both `parallelSessions` (e.g. Science gets BGS, Bus+Hum share Gen. Science 127)
 * and legacy `isGroupSplit` / `groupSplits`.
 */
export function resolveRoutinePeriodForGroup(
  period: ClassRoutinePeriod | undefined,
  group: AcademicGroup | 'All' | undefined
): ClassRoutinePeriod | undefined {
  if (!period) return undefined;
  const parallels = getPeriodParallelSessions(period);
  if (parallels.length > 0 && group && group !== 'All' && group !== 'General') {
    const matching = parallels.filter(
      (ps) =>
        ps.targetGroups.length === 0 ||
        ps.targetGroups.includes('General') ||
        ps.targetGroups.includes(group)
    );
    if (matching.length === 1) {
      const m = matching[0];
      return {
        ...period,
        subjectName: m.subjectName,
        teacherName: m.teacherName,
        room: m.room || period.room,
        isGroupSplit: false,
      };
    }
    if (matching.length > 1) {
      return {
        ...period,
        parallelSessions: matching,
      };
    }
  }

  if (
    period.isGroupSplit &&
    group &&
    group !== 'All' &&
    group !== 'General' &&
    period.groupSplits?.[group]
  ) {
    const split = period.groupSplits[group]!;
    return {
      ...period,
      subjectName: split.subjectName,
      teacherName: split.teacherName,
      room: split.room || period.room,
      isGroupSplit: false,
    };
  }
  return period;
}

/**
 * Resolves a routine period specifically for an individual student (group + religion + enrolled elective/4th subjects).
 */
export function resolveRoutinePeriodForStudent(
  period: ClassRoutinePeriod | undefined,
  student: Student,
  allSubjects: Subject[]
): ClassRoutinePeriod | undefined {
  if (!period) return undefined;
  const parallels = getPeriodParallelSessions(period);
  if (parallels.length === 0) {
    return resolveRoutinePeriodForGroup(period, student.group);
  }

  const classSubjects = allSubjects.filter((s) => s.classLevel === student.className);

  const candidates = parallels.filter((ps) => {
    const groupMatch =
      ps.targetGroups.length === 0 ||
      ps.targetGroups.includes('General') ||
      ps.targetGroups.includes(student.group);
    if (!groupMatch) return false;
    if (ps.religionFilter && ps.religionFilter !== student.religionGroup) return false;
    if (ps.onlyEnrolledStudents) {
      const normalized = ps.subjectName.toLowerCase();
      const matchedSub = classSubjects.find(
        (sub) =>
          normalized.includes(`(${sub.code.toLowerCase()})`) ||
          normalized.includes(sub.name.toLowerCase())
      );
      if (matchedSub && !subjectAppliesToStudent(matchedSub, student)) {
        return false;
      }
    }
    return true;
  });

  if (candidates.length === 0) {
    return resolveRoutinePeriodForGroup(period, student.group);
  }

  // Prefer religion-matched or enrolled-subject-specific block over generic combined
  const best =
    candidates.find((c) => c.religionFilter === student.religionGroup) ||
    candidates.find((c) => c.onlyEnrolledStudents) ||
    candidates[0];

  return {
    ...period,
    subjectName: best.subjectName,
    teacherName: best.teacherName,
    room: best.room || period.room,
    isGroupSplit: false,
    parallelSessions: undefined,
  };
}

/**
 * Formats 24h ("13:30", "07:45") or 12h ("7:45 AM", "01:30 pm") strings into canonical "hh:mm AM/PM".
 */
export function formatTime12h(raw: string | undefined): string {
  const val = (raw || '').trim();
  if (!val) return '';
  const ampmMatch = val.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (ampmMatch) {
    let h = parseInt(ampmMatch[1], 10);
    const m = ampmMatch[2];
    const period = ampmMatch[3].toUpperCase();
    if (h === 0) h = 12;
    if (h > 12) h = ((h - 1) % 12) + 1;
    return `${String(h).padStart(2, '0')}:${m} ${period}`;
  }
  const h24Match = val.match(/^(\d{1,2}):(\d{2})$/);
  if (h24Match) {
    const h24 = parseInt(h24Match[1], 10);
    const m = h24Match[2];
    if (Number.isNaN(h24)) return val;
    const period = h24 >= 12 ? 'PM' : 'AM';
    const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
    return `${String(h12).padStart(2, '0')}:${m} ${period}`;
  }
  return val;
}

/**
 * Converts "01:30 PM" or "07:45 AM" or "13:30" into "HH:mm" (24h) for HTML <input type="time" />.
 */
export function toTimeInput24h(raw: string | undefined): string {
  const val = (raw || '').trim();
  if (!val) return '';
  const ampmMatch = val.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (ampmMatch) {
    let h = parseInt(ampmMatch[1], 10);
    const m = ampmMatch[2];
    const isPm = ampmMatch[3].toUpperCase() === 'PM';
    if (isPm && h < 12) h += 12;
    if (!isPm && h === 12) h = 0;
    return `${String(h).padStart(2, '0')}:${m}`;
  }
  const h24Match = val.match(/^(\d{1,2}):(\d{2})$/);
  if (h24Match) {
    const h = Math.min(23, Math.max(0, parseInt(h24Match[1], 10)));
    return `${String(h).padStart(2, '0')}:${h24Match[2]}`;
  }
  return '';
}

export function isCollegeClassName(className: string): boolean {
  return /(class\s*1[12]\b|grade\s*1[12]\b|\bhsc\b)/i.test(className || '');
}

export function isHscYear2ClassName(className: string): boolean {
  return /(class\s*12\b|grade\s*12\b|hsc\s*(2nd|ii|year\s*2))/i.test(className || '');
}

export function getWingVisibility(rules?: Pick<InstituteRules, 'enabledWings'>): {
  showSchool: boolean;
  showCollege: boolean;
} {
  return {
    showSchool: rules?.enabledWings?.school ?? true,
    showCollege: rules?.enabledWings?.college ?? true,
  };
}

export function classMatchesEnabledWings(
  cls: Pick<AcademicClass, 'name' | 'cycleType' | 'order'>,
  rules?: Pick<InstituteRules, 'enabledWings'>
): boolean {
  const { showSchool, showCollege } = getWingVisibility(rules);
  const isCollege =
    cls.cycleType === 'Academic Session' ||
    isCollegeClassName(cls.name) ||
    (typeof cls.order === 'number' && cls.order >= 11);
  return isCollege ? showCollege : showSchool;
}

export function formatInstituteSessionBanner(
  rules?: Pick<
    InstituteRules,
    'enabledWings' | 'activeAcademicYear' | 'activeCollegeSession' | 'hscYear1Session' | 'hscYear2Session'
  >
): string {
  const { showSchool, showCollege } = getWingVisibility(rules);
  const schoolYr = rules?.activeAcademicYear || '2025';
  const hsc1 = rules?.hscYear1Session || rules?.activeCollegeSession || '2025–2026';
  const hsc2 = rules?.hscYear2Session || '2024–2025';
  const parts: string[] = [];
  if (showSchool) parts.push(`School ${schoolYr}`);
  if (showCollege) parts.push(`HSC XI ${hsc1} • HSC XII ${hsc2}`);
  return parts.join(' • ') || `Academic Year ${schoolYr}`;
}

export function resolveDefaultBatchCycle(
  className: string,
  rules?: Pick<
    InstituteRules,
    'activeAcademicYear' | 'activeCollegeSession' | 'hscYear1Session' | 'hscYear2Session'
  >,
  clsObj?: Pick<AcademicClass, 'activeCycle' | 'cycleType'>
): string {
  if (clsObj?.activeCycle) return clsObj.activeCycle;
  if (isHscYear2ClassName(className)) {
    return rules?.hscYear2Session || '2024–2025';
  }
  if (isCollegeClassName(className) || clsObj?.cycleType === 'Academic Session') {
    return rules?.hscYear1Session || rules?.activeCollegeSession || '2025–2026';
  }
  return rules?.activeAcademicYear || '2025';
}

export function getAutoRoutedSubjectsForStudent(
  allSubjects: Subject[],
  student: Pick<Student, 'className' | 'group' | 'religionGroup' | 'gender'>
): Subject[] {
  return sortSubjectsByOrder(
    allSubjects.filter((s) => {
      if (s.classLevel !== student.className) return false;
      if (!subjectAppliesToGroup(s, student.group)) return false;
      if (!isStudentGenderEligibleForSubject(s, student.gender)) return false;
      if (s.isCompulsory && !s.religionRestriction) return true;
      if (s.religionRestriction) {
        return s.religionRestriction === student.religionGroup;
      }
      return false;
    })
  );
}

export function getStudentEffectiveExaminer(
  exam: Exam | undefined,
  teachers: Teacher[],
  className: string,
  sectionName: string,
  subjectId: string
): Teacher | undefined {
  if (exam?.examinerAssignments && exam.examinerAssignments.length > 0) {
    const exactMatch = exam.examinerAssignments.find(
      (a) =>
        a.className === className &&
        a.subjectId === subjectId &&
        (!a.sectionName || a.sectionName === sectionName || sectionName === 'ALL' || a.sectionName === 'Common')
    );
    if (exactMatch) {
      return teachers.find((t) => t.id === exactMatch.teacherId);
    }
  }
  return teachers.find((t) =>
    t.assignedClasses.some(
      (ac) =>
        ac.className === className &&
        (ac.sectionName === sectionName || ac.sectionName === 'Common' || sectionName === 'ALL') &&
        ac.subjectId === subjectId
    )
  );
}

export function formatDateDDMMYYYY(raw: string | undefined): string {
  if (!raw || !raw.trim()) return '—';
  const val = raw.trim();
  const isoMatch = val.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    const [, y, m, d] = isoMatch;
    return `${d}/${m}/${y}`;
  }
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(val)) {
    return val;
  }
  try {
    const dt = new Date(val);
    if (!Number.isNaN(dt.getTime())) {
      const d = String(dt.getDate()).padStart(2, '0');
      const m = String(dt.getMonth() + 1).padStart(2, '0');
      const y = dt.getFullYear();
      return `${d}/${m}/${y}`;
    }
  } catch {
    // fallback
  }
  return val;
}


export function resolveFourthSubjectId(
  className: string,
  group: AcademicGroup,
  gender: GenderType = 'Male',
  allSubjects: Subject[] = []
): string {
  const pool = sortSubjectsByOrder(
    allSubjects.filter(
      (s) =>
        s.canBeFourthSubject &&
        s.classLevel === className &&
        subjectAppliesToGroup(s, group) &&
        isStudentGenderEligibleForSubject(s, gender)
    )
  );
  return pool[0]?.id || '';
}

export function getEligibleMainElectivePool(
  className: string,
  group: AcademicGroup,
  gender: GenderType = 'Male',
  allSubjects: Subject[] = []
): Subject[] {
  return sortSubjectsByOrder(
    allSubjects.filter(
      (s) =>
        !s.isCompulsory &&
        !s.excludeFromGpa &&
        !s.religionRestriction &&
        s.classLevel === className &&
        subjectAppliesToGroup(s, group) &&
        isStudentGenderEligibleForSubject(s, gender)
    )
  );
}





