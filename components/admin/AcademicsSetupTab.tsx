'use client';

import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { useERPStore } from '@/lib/store';
import {
  AcademicClass,
  AcademicEvent,
  AcademicEventCategory,
  AcademicGroup,
  ClassCycleType,
  ClassRoutinePeriod,
  ClassSectionMode,
  CustomSubjectComponent,
  InstituteRules,
  ParallelRoutineSession,
  ReligionGroup,
  RoutineActivity,
  RoutinePeriodSlot,
  ShiftType,
  Subject,
  SubjectGenderRestriction,
} from '@/lib/types';
import { NCTB_BOARD_PRESETS, NctbPresetTierId } from '@/lib/nctb-presets';
import {
  calcConvertedMark,
  classMatchesEnabledWings,
  computeSubjectMarksTotals,
  formatGroupSectionDisplay,
  formatInstituteSessionBanner,
  formatSubjectGroupsLabel,
  formatTime12h,
  getEffectiveConversionPercent,
  getEffectiveSectionsForClassGroup,
  getPeriodParallelSessions,
  getSubjectGroups,
  getWingVisibility,
  isHscYear2ClassName,
  isSingleBatchCohort,
  isSubjectComponentEnabled,
  sortSubjectsByOrder,
  subjectAppliesToGroup,
  toTimeInput24h,
} from '@/lib/academic-helpers';

const ALL_WEEKDAYS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

const ALL_GROUPS: AcademicGroup[] = ['General', 'Science', 'Business Studies', 'Humanities'];
const ALL_RELIGIONS: ReligionGroup[] = ['Islam', 'Hinduism', 'Buddhism', 'Christianity'];

function inferNctbTierForClass(className: string): NctbPresetTierId {
  const lower = className.toLowerCase();
  if (/(11|12|hsc)/.test(lower)) return 'hsc';
  if (/(9|10|ssc)/.test(lower)) return 'ssc';
  if (/(6|7|8)/.test(lower)) return 'junior';
  return 'primary';
}

const QUICK_START_PRESETS: Array<{
  label: string;
  classes: Array<Omit<AcademicClass, 'id'>>;
}> = [
  {
    label: 'Primary (Class 1–5)',
    classes: [1, 2, 3, 4, 5].map((n) => ({
      name: `Class ${n}`,
      order: n,
      cycleType: 'Academic Year',
      activeCycle: '2025',
      hasSections: false,
      hasGroups: false,
      shifts: ['Morning'],
      sections: ['Common'],
      groups: ['General'],
    })),
  },
  {
    label: 'Junior Secondary (Class 6–8)',
    classes: [6, 7, 8].map((n) => ({
      name: `Class ${n}`,
      order: n,
      cycleType: 'Academic Year',
      activeCycle: '2025',
      hasSections: true,
      hasGroups: false,
      shifts: ['Morning', 'Day'],
      sections: ['A', 'B'],
      groups: ['General'],
    })),
  },
  {
    label: 'Secondary (Class 9–10)',
    classes: [9, 10].map((n) => ({
      name: `Class ${n}`,
      order: n,
      cycleType: 'Academic Year',
      activeCycle: '2025',
      hasSections: true,
      hasGroups: true,
      shifts: ['Morning', 'Day'],
      sections: ['A', 'B'],
      groups: ['Science', 'Business Studies', 'Humanities'],
    })),
  },
  {
    label: 'Higher Secondary (Class 11–12)',
    classes: [11, 12].map((n) => ({
      name: `Class ${n}`,
      order: n,
      cycleType: 'Academic Session',
      activeCycle: n === 11 ? '2025–2026' : '2024–2025',
      hasSections: true,
      hasGroups: true,
      shifts: ['Morning', 'Day'],
      sections: ['A', 'B'],
      groups: ['Science', 'Business Studies', 'Humanities'],
    })),
  },
];

const MONTH_ABBR = [
  'JAN',
  'FEB',
  'MAR',
  'APR',
  'MAY',
  'JUN',
  'JUL',
  'AUG',
  'SEP',
  'OCT',
  'NOV',
  'DEC',
];

const CATEGORY_BADGE_CLASSES: Record<AcademicEventCategory, string> = {
  'Class Days': 'bg-emerald-100 text-emerald-900 border-emerald-200',
  Holiday: 'bg-rose-100 text-rose-900 border-rose-200',
  Exam: 'bg-amber-100 text-amber-900 border-amber-200',
  'Important Event': 'bg-sky-100 text-sky-900 border-sky-200',
  Admission: 'bg-purple-100 text-purple-900 border-purple-200',
};

function parseDateParts(isoDate?: string): { day: string; month: string } {
  if (!isoDate) return { day: '01', month: 'JAN' };
  const parts = isoDate.split('-');
  if (parts.length !== 3) return { day: '01', month: 'JAN' };
  const mIdx = Math.max(0, Math.min(11, parseInt(parts[1], 10) - 1));
  return {
    day: parts[2].padStart(2, '0'),
    month: MONTH_ABBR[mIdx] || 'JAN',
  };
}

function getInclusiveDaySpan(start?: string, end?: string): number {
  if (!start) return 1;
  const s = new Date(start);
  const e = end ? new Date(end) : s;
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return 1;
  const diff = Math.round((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24));
  return Math.max(1, diff + 1);
}

function mapCategoryToEventType(
  cat: AcademicEventCategory,
  visibility: AcademicEvent['visibility']
): AcademicEvent['type'] {
  if (cat === 'Exam') return 'Exam';
  if (cat === 'Holiday') return 'Holiday';
  if (cat === 'Class Days') return 'Class Days';
  if (visibility === 'Admin Only' || visibility === 'Portals Only') return 'Internal';
  return 'Public Live';
}

export default function AcademicsSetupTab() {
  const { isHydrated } = useERPStore();
  return <AcademicsSetupTabInner key={isHydrated ? 'hydrated' : 'ssr'} />;
}

function AcademicsSetupTabInner() {
  const {
    state,
    updateInstituteRules,
    syncSchoolAcademicYearToClasses,
    syncCollegeSessionsToClasses,
    addAcademicClass,
    updateAcademicClass,
    deleteAcademicClass,
    addSubject,
    updateSubject,
    cloneSubjectsToClass,
    bulkAddSubjects,
    deleteSubject,
    saveClassRoutine,
    copyClassRoutineDay,
    addAcademicEvent,
    updateAcademicEvent,
    deleteAcademicEvent,
  } = useERPStore();

  const {
    academicClasses,
    subjects,
    classRoutines,
    teachers,
    students,
    instituteRules,
    events,
    markEntries,
  } = state;

  const { showSchool, showCollege } = getWingVisibility(instituteRules);
  const visibleClasses = academicClasses.filter((c) => classMatchesEnabledWings(c, instituteRules));

  const [subTab, setSubTab] = useState<
    'classes' | 'subjects' | 'routine' | 'calendar' | 'rules'
  >('classes');
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const showToast = (text: string, type: 'ok' | 'err' = 'ok') => {
    setFeedback({ type, text });
    setTimeout(() => setFeedback(null), 3800);
  };

  // --- HEALTH METRICS ---
  const classesMissingSubjects = academicClasses.filter(
    (c) => subjects.filter((s) => s.classLevel === c.name).length === 0
  );
  const classesMissingRoutine = academicClasses.filter(
    (c) => !classRoutines.some((r) => r.className === c.name)
  );

  // --- SUB-TAB 1: INSTITUTE RULES STATE ---
  const [rulesDraft, setRulesDraft] = useState<InstituteRules>(instituteRules);

  const toggleWorkingDay = (day: string) => {
    const isWorking = rulesDraft.workingDays.includes(day);
    const nextWorking = isWorking
      ? rulesDraft.workingDays.filter((d) => d !== day)
      : ALL_WEEKDAYS.filter((d) => d === day || rulesDraft.workingDays.includes(d));
    if (nextWorking.length === 0) return;
    const nextWeekend = ALL_WEEKDAYS.filter((d) => !nextWorking.includes(d));
    setRulesDraft({
      ...rulesDraft,
      workingDays: nextWorking,
      weekendDays: nextWeekend,
    });
  };

  const toggleEnabledShift = (shf: ShiftType) => {
    const exists = rulesDraft.enabledShifts.includes(shf);
    if (exists && rulesDraft.enabledShifts.length <= 1) return;
    setRulesDraft({
      ...rulesDraft,
      enabledShifts: exists
        ? rulesDraft.enabledShifts.filter((s) => s !== shf)
        : [...rulesDraft.enabledShifts, shf],
    });
  };

  const updateTemplateSlot = (
    shift: ShiftType,
    idx: number,
    patch: Partial<RoutinePeriodSlot>
  ) => {
    const current = rulesDraft.shiftPeriodTemplates[shift] || [];
    const next = current.map((slot, i) => (i === idx ? { ...slot, ...patch } : slot));
    setRulesDraft({
      ...rulesDraft,
      shiftPeriodTemplates: {
        ...rulesDraft.shiftPeriodTemplates,
        [shift]: next,
      },
    });
  };

  const addTemplateSlot = (shift: ShiftType, isBreak = false) => {
    const current = rulesDraft.shiftPeriodTemplates[shift] || [];
    const periodNum = current.filter((s) => !s.isBreak).length + 1;
    const slot: RoutinePeriodSlot = {
      id: `slot-${shift.toLowerCase()}-${Date.now()}`,
      period: isBreak ? 'Break' : `${periodNum}th`,
      startTime: shift === 'Morning' ? '12:35 PM' : '05:25 PM',
      endTime: shift === 'Morning' ? '01:15 PM' : '06:05 PM',
      isBreak,
      label: isBreak ? 'Break / Assembly' : `Period ${periodNum}`,
    };
    setRulesDraft({
      ...rulesDraft,
      shiftPeriodTemplates: {
        ...rulesDraft.shiftPeriodTemplates,
        [shift]: [...current, slot],
      },
    });
  };

  const removeTemplateSlot = (shift: ShiftType, idx: number) => {
    const current = rulesDraft.shiftPeriodTemplates[shift] || [];
    if (current.length <= 1) return;
    setRulesDraft({
      ...rulesDraft,
      shiftPeriodTemplates: {
        ...rulesDraft.shiftPeriodTemplates,
        [shift]: current.filter((_, i) => i !== idx),
      },
    });
  };

  const handleSaveRules = (e: React.FormEvent) => {
    e.preventDefault();
    updateInstituteRules(rulesDraft);
    showToast('Institute academic rules, cycle defaults, activities, and bell schedules saved.');
  };

  // --- ACTIVITY MANAGER HELPERS ---
  const [showActivitiesModal, setShowActivitiesModal] = useState(false);
  const [newActName, setNewActName] = useState('');
  const [newActRoom, setNewActRoom] = useState('');
  const [newActRequiresTeacher, setNewActRequiresTeacher] = useState(true);

  const routineActivities: RoutineActivity[] = instituteRules.routineActivities || [];

  const handleAddActivityToDraft = (persistImmediately = false) => {
    const trimmed = newActName.trim();
    if (!trimmed) return;
    const item: RoutineActivity = {
      id: `act-${Date.now()}`,
      name: trimmed,
      defaultRoom: newActRoom.trim(),
      requiresTeacher: newActRequiresTeacher,
    };
    const nextList = [...(rulesDraft.routineActivities || []), item];
    setRulesDraft({ ...rulesDraft, routineActivities: nextList });
    if (persistImmediately) {
      updateInstituteRules({ routineActivities: nextList });
      showToast(`Added routine activity "${trimmed}".`);
    }
    setNewActName('');
    setNewActRoom('');
    setNewActRequiresTeacher(true);
  };

  const handleRemoveActivity = (actId: string, persistImmediately = false) => {
    const nextList = (rulesDraft.routineActivities || []).filter((a) => a.id !== actId);
    setRulesDraft({ ...rulesDraft, routineActivities: nextList });
    if (persistImmediately) {
      updateInstituteRules({ routineActivities: nextList });
      showToast('Removed activity from institute routine list.');
    }
  };

  const handleToggleActivityTeacherRule = (actId: string, persistImmediately = false) => {
    const nextList = (rulesDraft.routineActivities || []).map((a) =>
      a.id === actId ? { ...a, requiresTeacher: !a.requiresTeacher } : a
    );
    setRulesDraft({ ...rulesDraft, routineActivities: nextList });
    if (persistImmediately) {
      updateInstituteRules({ routineActivities: nextList });
    }
  };

  // --- SUB-TAB 2: CLASS MODAL STATE ---
  const [editingClass, setEditingClass] = useState<AcademicClass | null>(null);
  const [showClassModal, setShowClassModal] = useState(false);
  const [clsName, setClsName] = useState('');
  const [clsOrder, setClsOrder] = useState(1);
  const [clsCycleType, setClsCycleType] = useState<ClassCycleType>('Academic Year');
  const [clsActiveCycle, setClsActiveCycle] = useState(instituteRules.activeAcademicYear || '2025');
  const [clsHasSections, setClsHasSections] = useState(true);
  const [clsHasGroups, setClsHasGroups] = useState(true);
  const [clsSectionMode, setClsSectionMode] = useState<ClassSectionMode>('shared');
  const [clsGroupSectionsText, setClsGroupSectionsText] = useState<Record<AcademicGroup, string>>({
    General: 'A, B',
    Science: 'A, B',
    'Business Studies': 'A, B',
    Humanities: '',
  });
  const [clsShifts, setClsShifts] = useState<ShiftType[]>(['Morning']);
  const [clsSectionsText, setClsSectionsText] = useState('A, B');
  const [clsGroups, setClsGroups] = useState<AcademicGroup[]>([
    'Science',
    'Business Studies',
    'Humanities',
  ]);
  const [classFormError, setClassFormError] = useState<string | null>(null);

  const duplicateClassMatch = academicClasses.find(
    (c) =>
      c.name.trim().toLowerCase() === clsName.trim().toLowerCase() &&
      c.id !== editingClass?.id
  );

  const openAddClass = () => {
    setEditingClass(null);
    setClsName('');
    setClsOrder(academicClasses.length + 1);
    setClsCycleType('Academic Year');
    setClsActiveCycle(instituteRules.activeAcademicYear || '2025');
    setClsHasSections(true);
    setClsHasGroups(false);
    setClsSectionMode('shared');
    setClsGroupSectionsText({
      General: 'A, B',
      Science: 'A, B',
      'Business Studies': 'A, B',
      Humanities: '',
    });
    setClsShifts(instituteRules.enabledShifts.length ? instituteRules.enabledShifts : ['Morning']);
    setClsSectionsText('A, B');
    setClsGroups(['General']);
    setClassFormError(null);
    setShowClassModal(true);
  };

  const openEditClass = (c: AcademicClass) => {
    setEditingClass(c);
    setClsName(c.name);
    setClsOrder(c.order ?? 1);
    const inferredType: ClassCycleType =
      c.cycleType || (/(11|12|hsc)/i.test(c.name) ? 'Academic Session' : 'Academic Year');
    setClsCycleType(inferredType);
    setClsActiveCycle(
      c.activeCycle ||
        (inferredType === 'Academic Session'
          ? isHscYear2ClassName(c.name)
            ? instituteRules.hscYear2Session || '2024–2025'
            : instituteRules.hscYear1Session || instituteRules.activeCollegeSession || '2025–2026'
          : instituteRules.activeAcademicYear || '2025')
    );
    const hasSec = c.hasSections ?? !(c.sections.length === 1 && c.sections[0] === 'Common');
    const hasGrp =
      c.hasGroups ?? c.groups.some((g) => g !== 'General');
    setClsHasSections(hasSec);
    setClsHasGroups(hasGrp);
    setClsSectionMode(c.sectionMode || 'shared');
    setClsGroupSectionsText({
      General: c.groupSections?.General?.filter((s) => s !== 'Common').join(', ') || '',
      Science: c.groupSections?.Science?.filter((s) => s !== 'Common').join(', ') || '',
      'Business Studies':
        c.groupSections?.['Business Studies']?.filter((s) => s !== 'Common').join(', ') || '',
      Humanities: c.groupSections?.Humanities?.filter((s) => s !== 'Common').join(', ') || '',
    });
    setClsShifts(c.shifts);
    setClsSectionsText(hasSec ? c.sections.join(', ') : 'A, B');
    setClsGroups(c.groups);
    setClassFormError(null);
    setShowClassModal(true);
  };

  const handleSaveClass = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = clsName.trim();
    if (!trimmed) return;

    if (duplicateClassMatch) {
      setClassFormError(
        `Class "${duplicateClassMatch.name}" already exists. Edit the existing class instead of creating a duplicate.`
      );
      return;
    }

    const parsedSections = Array.from(
      new Set(
        clsSectionsText
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      )
    );

    const activeGroups: AcademicGroup[] = clsHasGroups
      ? clsGroups.length
        ? clsGroups
        : (['Science', 'Business Studies', 'Humanities'] as AcademicGroup[])
      : (['General'] as AcademicGroup[]);

    const effectiveMode: ClassSectionMode = clsHasGroups ? clsSectionMode : 'shared';

    let builtGroupSections: Partial<Record<AcademicGroup, string[]>> | undefined;
    let resolvedFlatSections: string[] = clsHasSections
      ? parsedSections.length
        ? parsedSections
        : ['A']
      : ['Common'];

    if (effectiveMode === 'per-group') {
      builtGroupSections = {};
      const union = new Set<string>();
      for (const grp of activeGroups) {
        const raw = clsGroupSectionsText[grp] || '';
        const list = Array.from(
          new Set(
            raw
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean)
          )
        );
        const normalized = list.length > 0 ? list : ['Common'];
        builtGroupSections[grp] = normalized;
        normalized.forEach((item) => union.add(item));
      }
      resolvedFlatSections = union.size > 0 ? Array.from(union) : ['Common'];
    }

    const payload: Omit<AcademicClass, 'id'> = {
      name: trimmed,
      order: Number.isNaN(clsOrder) ? 1 : clsOrder,
      cycleType: clsCycleType,
      activeCycle:
        clsActiveCycle.trim() ||
        (clsCycleType === 'Academic Session'
          ? instituteRules.activeCollegeSession
          : instituteRules.activeAcademicYear),
      hasSections: effectiveMode === 'per-group' ? true : clsHasSections,
      hasGroups: clsHasGroups,
      sectionMode: effectiveMode,
      groupSections: builtGroupSections,
      shifts: clsShifts.length ? clsShifts : (['Morning'] as ShiftType[]),
      sections: resolvedFlatSections,
      groups: activeGroups,
    };

    if (editingClass) {
      const ok = updateAcademicClass(editingClass.id, payload);
      if (!ok) {
        setClassFormError('Another class already uses this name.');
        return;
      }
      if (editingClass.name !== payload.name) {
        if (subjectFilterClass === editingClass.name) setSubjectFilterClass(payload.name);
        if (routineClass === editingClass.name) setRoutineClass(payload.name);
      }
      showToast(
        editingClass.name !== payload.name
          ? `Renamed "${editingClass.name}" to "${payload.name}" and synced all student/subject/routine records.`
          : `Class "${payload.name}" (${payload.cycleType}: ${payload.activeCycle}) updated.`
      );
    } else {
      const created = addAcademicClass(payload);
      if (!created) {
        setClassFormError(`Class "${trimmed}" already exists.`);
        return;
      }
      setSubjectFilterClass(created.name);
      showToast(`Class "${payload.name}" created cleanly.`);
    }
    setShowClassModal(false);
  };

  const handleApplyPreset = (presetIndex: number) => {
    const preset = QUICK_START_PRESETS[presetIndex];
    if (!preset) return;
    let added = 0;
    let skipped = 0;
    for (const cls of preset.classes) {
      const res = addAcademicClass(cls);
      if (res) added++;
      else skipped++;
    }
    showToast(
      `Preset applied: ${added} new class(es) added${skipped ? `, ${skipped} existing skipped` : ''}.`
    );
  };

  const handleSafeDeleteClass = (cls: AcademicClass) => {
    const stuCount = students.filter((s) => s.className === cls.name).length;
    const subCount = subjects.filter((s) => s.classLevel === cls.name).length;
    if (stuCount > 0) {
      showToast(
        `Cannot delete "${cls.name}" while ${stuCount} student(s) are enrolled in it. Promote or transfer them first.`,
        'err'
      );
      return;
    }
    if (subCount > 0) {
      showToast(
        `Cannot delete "${cls.name}" while ${subCount} subject(s) are linked to it. Remove its subjects first.`,
        'err'
      );
      return;
    }
    deleteAcademicClass(cls.id);
    showToast(`Deleted class "${cls.name}".`);
  };

  // --- SUB-TAB 3: CLASS-WISE SUBJECTS ---
  const [subjectFilterClass, setSubjectFilterClass] = useState<string>(
    academicClasses[0]?.name || 'Grade 10'
  );
  const [subjectFilterGroup, setSubjectFilterGroup] = useState<string>('ALL');
  const activeSubjectClassObj = academicClasses.find((c) => c.name === subjectFilterClass);
  const effectiveSubjectClass = activeSubjectClassObj?.name || academicClasses[0]?.name || '';

  const [showSubjectModal, setShowSubjectModal] = useState(false);
  const [editingSubject, setEditingSubject] = useState<Subject | null>(null);
  const [subCode, setSubCode] = useState('');
  const [subName, setSubName] = useState('');
  const [subOrder, setSubOrder] = useState(1);
  const [subBangla, setSubBangla] = useState('');
  const [subClassLevel, setSubClassLevel] = useState(effectiveSubjectClass);
  const [subGroup, setSubGroup] = useState<AcademicGroup>('General');
  const [subApplicableGroups, setSubApplicableGroups] = useState<AcademicGroup[]>(['General']);
  const [subGenderRestriction, setSubGenderRestriction] =
    useState<SubjectGenderRestriction>('All');
  const [subRole, setSubRole] = useState<
    'compulsory' | 'elective-fourth' | 'elective-main' | 'religion'
  >('compulsory');
  const [subReligion, setSubReligion] = useState<ReligionGroup>('Islam');
  const [subExcludeGpa, setSubExcludeGpa] = useState(false);
  const [subCombinedPaperKey, setSubCombinedPaperKey] = useState('');
  const [subCombinedPaperTitle, setSubCombinedPaperTitle] = useState('');
  const [subPaperNumber, setSubPaperNumber] = useState<1 | 2 | ''>('');
  const [cqEnabled, setCqEnabled] = useState(true);
  const [cqFull, setCqFull] = useState(70);
  const [cqPass, setCqPass] = useState(23);
  const [cqConv, setCqConv] = useState(100);
  const [mcqEnabled, setMcqEnabled] = useState(true);
  const [mcqFull, setMcqFull] = useState(30);
  const [mcqPass, setMcqPass] = useState(10);
  const [mcqConv, setMcqConv] = useState(100);
  const [pracEnabled, setPracEnabled] = useState(false);
  const [pracFull, setPracFull] = useState(0);
  const [pracPass, setPracPass] = useState(0);
  const [pracConv, setPracConv] = useState(100);
  const [ctEnabled, setCtEnabled] = useState(false);
  const [ctFull, setCtFull] = useState(20);
  const [ctPass, setCtPass] = useState(7);
  const [ctConv, setCtConv] = useState(100);
  const [customComponents, setCustomComponents] = useState<CustomSubjectComponent[]>([]);
  const [subjectError, setSubjectError] = useState<string | null>(null);

  // Clone & NCTB Preset Import modals
  const [showCloneModal, setShowCloneModal] = useState(false);
  const [cloneSourceClass, setCloneSourceClass] = useState('');
  const [showNctbModal, setShowNctbModal] = useState(false);
  const [nctbTier, setNctbTier] = useState<NctbPresetTierId>('ssc');
  const [nctbSelectedCodes, setNctbSelectedCodes] = useState<string[]>([]);

  const openNctbPresetModal = () => {
    const inferred = inferNctbTierForClass(effectiveSubjectClass);
    setNctbTier(inferred);
    const tierObj = NCTB_BOARD_PRESETS.find((t) => t.id === inferred) || NCTB_BOARD_PRESETS[2];
    const targetCls = academicClasses.find((c) => c.name === effectiveSubjectClass);
    const allowedGroups =
      targetCls && targetCls.hasGroups !== false
        ? new Set(['General', ...targetCls.groups])
        : new Set(['General']);
    const existingCodes = new Set(
      subjects.filter((s) => s.classLevel === effectiveSubjectClass).map((s) => s.code.toLowerCase())
    );
    setNctbSelectedCodes(
      tierObj.subjects
        .filter(
          (s) =>
            getSubjectGroups(s).some((g) => allowedGroups.has(g)) &&
            !existingCodes.has(s.code.toLowerCase())
        )
        .map((s) => s.code)
    );
    setShowNctbModal(true);
  };

  const handleSelectNctbTier = (tierId: NctbPresetTierId) => {
    setNctbTier(tierId);
    const tierObj = NCTB_BOARD_PRESETS.find((t) => t.id === tierId) || NCTB_BOARD_PRESETS[2];
    const targetCls = academicClasses.find((c) => c.name === effectiveSubjectClass);
    const allowedGroups =
      targetCls && targetCls.hasGroups !== false
        ? new Set(['General', ...targetCls.groups])
        : new Set(['General']);
    const existingCodes = new Set(
      subjects.filter((s) => s.classLevel === effectiveSubjectClass).map((s) => s.code.toLowerCase())
    );
    setNctbSelectedCodes(
      tierObj.subjects
        .filter(
          (s) =>
            getSubjectGroups(s).some((g) => allowedGroups.has(g)) &&
            !existingCodes.has(s.code.toLowerCase())
        )
        .map((s) => s.code)
    );
  };

  const classSubjects = sortSubjectsByOrder(
    subjects.filter((sub) => {
      if (sub.classLevel !== effectiveSubjectClass) return false;
      if (subjectFilterGroup !== 'ALL') {
        if (subjectFilterGroup === 'General') {
          return getSubjectGroups(sub).includes('General');
        }
        return subjectAppliesToGroup(sub, subjectFilterGroup as AcademicGroup);
      }
      return true;
    })
  );

  const getNextSubjectOrderForClass = (clsName: string) => {
    const classList = subjects.filter((s) => s.classLevel === clsName);
    const maxOrder = classList.reduce(
      (max, s) => (typeof s.order === 'number' && s.order > max ? s.order : max),
      classList.length
    );
    return maxOrder + 1;
  };

  const openAddSubject = (targetClass = effectiveSubjectClass) => {
    const clsObj = academicClasses.find((c) => c.name === targetClass);
    setEditingSubject(null);
    setSubOrder(getNextSubjectOrderForClass(targetClass));
    setSubCode('');
    setSubName('');
    setSubBangla('');
    setSubClassLevel(targetClass);
    setSubGroup(clsObj?.hasGroups === false ? 'General' : 'General');
    setSubApplicableGroups(['General']);
    setSubGenderRestriction('All');
    setSubRole('compulsory');
    setSubReligion('Islam');
    setSubExcludeGpa(false);
    setSubCombinedPaperKey('');
    setSubCombinedPaperTitle('');
    setSubPaperNumber('');
    setCqEnabled(true);
    setCqFull(70);
    setCqPass(23);
    setCqConv(100);
    setMcqEnabled(true);
    setMcqFull(30);
    setMcqPass(10);
    setMcqConv(100);
    setPracEnabled(false);
    setPracFull(0);
    setPracPass(0);
    setPracConv(100);
    setCtEnabled(false);
    setCtFull(20);
    setCtPass(7);
    setCtConv(100);
    setCustomComponents([]);
    setSubjectError(null);
    setShowSubjectModal(true);
  };

  const openEditSubject = (s: Subject) => {
    const orderedInClass = sortSubjectsByOrder(
      subjects.filter((item) => item.classLevel === s.classLevel)
    );
    const fallbackOrder = Math.max(1, orderedInClass.findIndex((item) => item.id === s.id) + 1);
    const isCqOn = isSubjectComponentEnabled(s.components.cq);
    const isMcqOn = isSubjectComponentEnabled(s.components.mcq);
    const isPracOn = isSubjectComponentEnabled(s.components.practical);
    const isCtOn = Boolean(s.components.ct?.enabled && (s.components.ct?.fullMarks || 0) > 0);

    setEditingSubject(s);
    setSubOrder(typeof s.order === 'number' && Number.isFinite(s.order) ? s.order : fallbackOrder);
    setSubCode(s.code);
    setSubName(s.name);
    setSubBangla(s.banglaName || '');
    setSubClassLevel(s.classLevel);
    setSubGroup(s.group);
    setSubApplicableGroups(getSubjectGroups(s));
    setSubGenderRestriction(s.genderRestriction || 'All');
    setSubRole(
      s.religionRestriction
        ? 'religion'
        : s.canBeFourthSubject && !s.isCompulsory
        ? 'elective-fourth'
        : !s.isCompulsory
        ? 'elective-main'
        : 'compulsory'
    );
    setSubReligion(s.religionRestriction || 'Islam');
    setSubExcludeGpa(Boolean(s.excludeFromGpa));
    setSubCombinedPaperKey(s.combinedPaperKey || '');
    setSubCombinedPaperTitle(s.combinedPaperTitle || '');
    setSubPaperNumber(s.paperNumber || '');
    setCqEnabled(isCqOn);
    setCqFull(s.components.cq.fullMarks);
    setCqPass(s.components.cq.passMarks);
    setCqConv(getEffectiveConversionPercent(s.components.cq.conversionPercent));
    setMcqEnabled(isMcqOn);
    setMcqFull(s.components.mcq.fullMarks);
    setMcqPass(s.components.mcq.passMarks);
    setMcqConv(getEffectiveConversionPercent(s.components.mcq.conversionPercent));
    setPracEnabled(isPracOn);
    setPracFull(s.components.practical.fullMarks);
    setPracPass(s.components.practical.passMarks);
    setPracConv(getEffectiveConversionPercent(s.components.practical.conversionPercent));
    setCtEnabled(isCtOn);
    setCtFull(s.components.ct?.fullMarks ?? 20);
    setCtPass(s.components.ct?.passMarks ?? 7);
    setCtConv(getEffectiveConversionPercent(s.components.ct?.conversionPercent));
    setCustomComponents(
      (s.customComponents || []).map((c) => ({
        ...c,
        conversionPercent: getEffectiveConversionPercent(c.conversionPercent),
      }))
    );
    setSubjectError(null);
    setShowSubjectModal(true);
  };

  const buildDraftSubjectComponents = (): Subject['components'] => ({
    cq: {
      enabled: cqEnabled,
      fullMarks: cqEnabled ? Math.max(0, Number(cqFull) || 0) : 0,
      passMarks: cqEnabled ? Math.max(0, Number(cqPass) || 0) : 0,
      conversionPercent: cqEnabled ? getEffectiveConversionPercent(cqConv) : 100,
    },
    mcq: {
      enabled: mcqEnabled,
      fullMarks: mcqEnabled ? Math.max(0, Number(mcqFull) || 0) : 0,
      passMarks: mcqEnabled ? Math.max(0, Number(mcqPass) || 0) : 0,
      conversionPercent: mcqEnabled ? getEffectiveConversionPercent(mcqConv) : 100,
    },
    practical: {
      enabled: pracEnabled,
      fullMarks: pracEnabled ? Math.max(0, Number(pracFull) || 0) : 0,
      passMarks: pracEnabled ? Math.max(0, Number(pracPass) || 0) : 0,
      conversionPercent: pracEnabled ? getEffectiveConversionPercent(pracConv) : 100,
    },
    ct: {
      enabled: ctEnabled,
      fullMarks: ctEnabled ? Math.max(0, Number(ctFull) || 0) : 0,
      passMarks: ctEnabled ? Math.max(0, Number(ctPass) || 0) : 0,
      conversionPercent: ctEnabled ? getEffectiveConversionPercent(ctConv) : 100,
    },
  });

  const handleAddCustomComponentRow = () => {
    setCustomComponents((prev) => [
      ...prev,
      {
        id: `ch-${Date.now().toString(36)}-${prev.length}`,
        label: '',
        enabled: true,
        fullMarks: 20,
        passMarks: 7,
        conversionPercent: 100,
      },
    ]);
  };

  const handleSaveSubject = (e: React.FormEvent) => {
    e.preventDefault();
    setSubjectError(null);
    if (!subCode.trim() || !subName.trim() || !subClassLevel) return;

    const comps = buildDraftSubjectComponents();
    const cleanedCustom: CustomSubjectComponent[] = customComponents.map((c) => ({
      ...c,
      label: c.label.trim(),
      fullMarks: c.enabled ? Math.max(0, Number(c.fullMarks) || 0) : 0,
      passMarks: c.enabled ? Math.max(0, Number(c.passMarks) || 0) : 0,
      conversionPercent: getEffectiveConversionPercent(c.conversionPercent),
    }));

    if (cqEnabled && (comps.cq.fullMarks <= 0 || comps.cq.passMarks > comps.cq.fullMarks)) {
      setSubjectError('Enabled CQ Full marks must be > 0 and Pass marks cannot exceed Full marks.');
      return;
    }
    if (mcqEnabled && (comps.mcq.fullMarks <= 0 || comps.mcq.passMarks > comps.mcq.fullMarks)) {
      setSubjectError('Enabled MCQ Full marks must be > 0 and Pass marks cannot exceed Full marks.');
      return;
    }
    if (pracEnabled && (comps.practical.fullMarks <= 0 || comps.practical.passMarks > comps.practical.fullMarks)) {
      setSubjectError('Enabled Practical Full marks must be > 0 and Pass marks cannot exceed Full marks.');
      return;
    }
    if (ctEnabled && ((comps.ct?.fullMarks || 0) <= 0 || (comps.ct?.passMarks || 0) > (comps.ct?.fullMarks || 0))) {
      setSubjectError('Enabled Class Test (CT) Full marks must be > 0 and Pass marks cannot exceed Full marks.');
      return;
    }
    for (const c of cleanedCustom) {
      if (!c.enabled) continue;
      if (!c.label) {
        setSubjectError('Enter a Header Name for every enabled custom assessment row.');
        return;
      }
      if (c.fullMarks <= 0 || c.passMarks > c.fullMarks) {
        setSubjectError(`Custom header "${c.label}" Full marks must be > 0 and Pass cannot exceed Full.`);
        return;
      }
    }

    const { totalFullMarks, totalPassMarks } = computeSubjectMarksTotals(comps, cleanedCustom);
    if (totalFullMarks <= 0) {
      setSubjectError('Enable at least one assessment head so Total Full Marks is greater than 0.');
      return;
    }

    const targetClsObj = academicClasses.find((c) => c.name === subClassLevel);
    const normalizedApplicable: AcademicGroup[] =
      targetClsObj?.hasGroups === false || subApplicableGroups.includes('General') || subApplicableGroups.length === 0
        ? ['General']
        : subApplicableGroups;
    const primaryGroup: AcademicGroup = normalizedApplicable[0] || subGroup || 'General';

    const payload: Omit<Subject, 'id'> = {
      order: Math.max(1, Math.round(Number(subOrder) || 1)),
      code: subCode.trim(),
      name: subName.trim(),
      banglaName: subBangla.trim() || undefined,
      classLevel: subClassLevel,
      group: primaryGroup,
      applicableGroups: normalizedApplicable,
      genderRestriction: subGenderRestriction,
      isCompulsory: subRole === 'compulsory' || subRole === 'religion',
      canBeFourthSubject: subRole === 'elective-fourth',
      religionRestriction: subRole === 'religion' ? subReligion : null,
      excludeFromGpa: subExcludeGpa,
      combinedPaperKey: subCombinedPaperKey.trim() || undefined,
      combinedPaperTitle: subCombinedPaperTitle.trim() || undefined,
      paperNumber: subCombinedPaperKey.trim() && subPaperNumber ? (subPaperNumber as 1 | 2) : undefined,
      components: comps,
      customComponents: cleanedCustom,
      totalFullMarks,
      totalPassMarks,
    };

    if (editingSubject) {
      const ok = updateSubject(editingSubject.id, payload);
      if (!ok) {
        setSubjectError(`Subject code "${payload.code}" already exists in ${payload.classLevel}.`);
        return;
      }
      showToast(`Subject "${payload.name}" (${payload.code}) updated for ${payload.classLevel}.`);
    } else {
      const created = addSubject(payload);
      if (!created) {
        setSubjectError(`Subject code "${payload.code}" already exists in ${payload.classLevel}.`);
        return;
      }
      setSubjectFilterClass(payload.classLevel);
      showToast(`Added "${payload.name}" (${payload.code}) to ${payload.classLevel}.`);
    }
    setShowSubjectModal(false);
  };

  const handleSafeDeleteSubject = (sub: Subject) => {
    const usedMarks = markEntries.some((m) => m.subjectId === sub.id);
    if (usedMarks) {
      showToast(
        `Cannot delete "${sub.name}" because examination marks already exist for it.`,
        'err'
      );
      return;
    }
    deleteSubject(sub.id);
    showToast(`Deleted "${sub.name}" from ${sub.classLevel}.`);
  };

  // --- SUB-TAB 4: ROUTINE BUILDER ---
  const workingDays = instituteRules.workingDays.length
    ? instituteRules.workingDays
    : ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday'];

  const [routineClass, setRoutineClass] = useState(academicClasses[0]?.name || 'Grade 10');
  const activeRoutineClassObj = academicClasses.find((c) => c.name === routineClass) || academicClasses[0];
  const routineAvailableGroups: AcademicGroup[] =
    activeRoutineClassObj?.hasGroups !== false
      ? activeRoutineClassObj?.groups.filter((g) => g !== 'General') || []
      : [];
  const [routineGroup, setRoutineGroup] = useState<AcademicGroup | 'All'>('All');
  const effectiveRoutineGroup: AcademicGroup | 'All' =
    activeRoutineClassObj?.hasGroups !== false &&
    (routineGroup === 'All' || routineAvailableGroups.includes(routineGroup))
      ? routineGroup
      : 'All';

  const routineClassSections = getEffectiveSectionsForClassGroup(
    activeRoutineClassObj,
    effectiveRoutineGroup
  );
  const isSingleRoutineCohort = isSingleBatchCohort(routineClassSections);
  const [routineSection, setRoutineSection] = useState(routineClassSections[0] || 'Common');
  const effectiveRoutineSection = routineClassSections.includes(routineSection)
    ? routineSection
    : routineClassSections[0] || 'Common';

  const availableShiftsForClass = activeRoutineClassObj?.shifts.length
    ? activeRoutineClassObj.shifts
    : instituteRules.enabledShifts;
  const [routineShift, setRoutineShift] = useState<ShiftType>(availableShiftsForClass[0] || 'Morning');
  const effectiveRoutineShift = availableShiftsForClass.includes(routineShift)
    ? routineShift
    : availableShiftsForClass[0] || 'Morning';

  const [routineDay, setRoutineDay] = useState(workingDays[0] || 'Sunday');
  const effectiveRoutineDay = workingDays.includes(routineDay) ? routineDay : workingDays[0];
  const [routineViewMode, setRoutineViewMode] = useState<'editor' | 'matrix'>('editor');

  const buildPeriodsFromTemplate = (shf: ShiftType): ClassRoutinePeriod[] => {
    const tpl = instituteRules.shiftPeriodTemplates[shf] || [];
    return tpl.map((slot) => ({
      period: slot.period,
      time: slot.startTime,
      endTime: slot.endTime,
      isBreak: slot.isBreak,
      subjectName: slot.isBreak ? slot.label || 'Tiffin Break' : '',
      teacherName: slot.isBreak ? '—' : 'Faculty Desk',
      room: '',
    }));
  };

  const clonePeriodDraft = (p: ClassRoutinePeriod): ClassRoutinePeriod => ({
    ...p,
    groupSplits: p.groupSplits
      ? Object.fromEntries(Object.entries(p.groupSplits).map(([k, v]) => [k, v ? { ...v } : v]))
      : undefined,
    parallelSessions: p.parallelSessions
      ? p.parallelSessions.map((ps) => ({
          ...ps,
          targetGroups: ps.targetGroups ? [...ps.targetGroups] : ['General'],
        }))
      : undefined,
  });

  const [draftPeriods, setDraftPeriods] = useState<ClassRoutinePeriod[]>(() => {
    const firstCls = academicClasses[0]?.name || 'Grade 10';
    const firstSec = academicClasses[0]?.sections[0] || 'A';
    const existing = classRoutines.find(
      (r) =>
        r.className === firstCls &&
        (r.group || 'All') === 'All' &&
        r.sectionName === firstSec &&
        r.shift === (availableShiftsForClass[0] || 'Morning') &&
        r.day === (workingDays[0] || 'Sunday')
    );
    return existing
      ? existing.periods.map(clonePeriodDraft)
      : buildPeriodsFromTemplate(availableShiftsForClass[0] || 'Morning');
  });

  const loadRoutineSelection = (
    cName: string,
    grp: AcademicGroup | 'All',
    sec: string,
    shf: ShiftType,
    day: string
  ) => {
    const match = classRoutines.find(
      (r) =>
        r.className === cName &&
        (r.group || 'All') === grp &&
        r.sectionName === sec &&
        r.shift === shf &&
        r.day === day
    );
    setDraftPeriods(
      match ? match.periods.map(clonePeriodDraft) : buildPeriodsFromTemplate(shf)
    );
  };

  const routineClassSubjects = sortSubjectsByOrder(
    subjects.filter((s) => {
      if (s.classLevel !== routineClass) return false;
      if (effectiveRoutineGroup !== 'All' && !subjectAppliesToGroup(s, effectiveRoutineGroup)) {
        return false;
      }
      return true;
    })
  );

  // Detect teacher clash across ALL routines & sibling parallel sessions in the same period
  const findTeacherClash = (
    teacherName: string,
    periodLabel: string,
    slotSubjectName?: string,
    draftIdxForSelfSplit?: number,
    selfSessionId?: string
  ): string | null => {
    const matchedAct = routineActivities.find((a) => a.name === slotSubjectName);
    if (matchedAct && !matchedAct.requiresTeacher) return null;
    if (
      !teacherName ||
      teacherName === 'Faculty Desk' ||
      teacherName === 'Senior Faculty' ||
      teacherName === '—' ||
      teacherName === 'No Teacher Required'
    ) {
      return null;
    }

    // 1. Check sibling parallel sessions within the same Period row
    if (draftIdxForSelfSplit !== undefined && selfSessionId) {
      const currentRow = draftPeriods[draftIdxForSelfSplit];
      const siblings = getPeriodParallelSessions(currentRow);
      for (const ps of siblings) {
        if (ps.id !== selfSessionId && ps.teacherName === teacherName) {
          const scopeLabel = ps.targetGroups?.length
            ? ps.targetGroups.join('+')
            : ps.religionFilter || 'Parallel';
          return `${routineClass} (${scopeLabel} block)`;
        }
      }
    }

    // 2. Check other saved routines in same Shift + Day + Period
    const conflict = classRoutines.find((r) => {
      const isSameSlotTarget =
        r.className === routineClass &&
        (r.group || 'All') === effectiveRoutineGroup &&
        r.sectionName === effectiveRoutineSection &&
        r.shift === effectiveRoutineShift &&
        r.day === effectiveRoutineDay;
      if (isSameSlotTarget) return false;
      if (r.shift !== effectiveRoutineShift || r.day !== effectiveRoutineDay) return false;
      return r.periods.some((p) => {
        if (p.isBreak || p.period !== periodLabel) return false;
        const sessions = getPeriodParallelSessions(p);
        if (sessions.length > 0) {
          return sessions.some((ps) => ps.teacherName === teacherName);
        }
        return p.teacherName === teacherName;
      });
    });
    if (!conflict) return null;
    return `${conflict.className} (${formatGroupSectionDisplay(conflict.group, conflict.sectionName)})`;
  };

  // Detect room double-booking across sibling parallel sessions and other saved routines in same Shift + Day + Period
  const findRoomClash = (
    room: string | undefined,
    periodLabel: string,
    draftIdx?: number,
    selfSessionId?: string
  ): string | null => {
    const cleanRoom = (room || '').trim().toLowerCase();
    if (!cleanRoom) return null;

    if (draftIdx !== undefined && selfSessionId) {
      const siblings = getPeriodParallelSessions(draftPeriods[draftIdx]);
      for (const ps of siblings) {
        if (ps.id !== selfSessionId && (ps.room || '').trim().toLowerCase() === cleanRoom) {
          return `Same Period (${ps.subjectName || 'Parallel Block'})`;
        }
      }
    }

    const conflict = classRoutines.find((r) => {
      const isSameSlotTarget =
        r.className === routineClass &&
        (r.group || 'All') === effectiveRoutineGroup &&
        r.sectionName === effectiveRoutineSection &&
        r.shift === effectiveRoutineShift &&
        r.day === effectiveRoutineDay;
      if (isSameSlotTarget) return false;
      if (r.shift !== effectiveRoutineShift || r.day !== effectiveRoutineDay) return false;
      return r.periods.some((p) => {
        if (p.isBreak || p.period !== periodLabel) return false;
        const sessions = getPeriodParallelSessions(p);
        if (sessions.length > 0) {
          return sessions.some((ps) => (ps.room || '').trim().toLowerCase() === cleanRoom);
        }
        return (p.room || '').trim().toLowerCase() === cleanRoom;
      });
    });
    if (!conflict) return null;
    return `${conflict.className} (${formatGroupSectionDisplay(conflict.group, conflict.sectionName)})`;
  };

  const handleSaveRoutineDay = () => {
    saveClassRoutine({
      id: `cr-${routineClass}-${effectiveRoutineGroup}-${effectiveRoutineSection}-${effectiveRoutineShift}-${effectiveRoutineDay}`,
      className: routineClass,
      group: effectiveRoutineGroup,
      sectionName: effectiveRoutineSection,
      shift: effectiveRoutineShift,
      day: effectiveRoutineDay,
      periods: draftPeriods,
    });
    showToast(
      `Saved ${effectiveRoutineDay} routine for ${routineClass} (${formatGroupSectionDisplay(
        effectiveRoutineGroup,
        effectiveRoutineSection
      )}) • ${effectiveRoutineShift} Shift.`
    );
  };

  const handleCopyDayToOtherWeekdays = () => {
    const otherDays = workingDays.filter((d) => d !== effectiveRoutineDay);
    if (otherDays.length === 0) return;
    copyClassRoutineDay({
      className: routineClass,
      group: effectiveRoutineGroup,
      sectionName: effectiveRoutineSection,
      shift: effectiveRoutineShift,
      periods: draftPeriods,
      targetDays: [effectiveRoutineDay, ...otherDays],
    });
    showToast(
      `Copied ${effectiveRoutineDay}'s periods to all ${workingDays.length} working days for ${routineClass} (${formatGroupSectionDisplay(
        effectiveRoutineGroup,
        effectiveRoutineSection
      )}).`
    );
  };

  // --- SUB-TAB 5: ACADEMIC CALENDAR ---
  const [calendarView, setCalendarView] = useState<'list' | 'month'>('list');
  const [calendarCategoryFilter, setCalendarCategoryFilter] = useState<'ALL' | AcademicEventCategory>('ALL');
  const [calendarMonthIdx, setCalendarMonthIdx] = useState(0); // 0..11 within year
  const [calendarYear, setCalendarYear] = useState(2025);
  const [showEventModal, setShowEventModal] = useState(false);
  const [editingEvent, setEditingEvent] = useState<AcademicEvent | null>(null);

  const [evtTitle, setEvtTitle] = useState('');
  const [evtCategory, setEvtCategory] = useState<AcademicEventCategory>('Important Event');
  const [evtStartDate, setEvtStartDate] = useState('2025-03-15');
  const [evtEndDate, setEvtEndDate] = useState('2025-03-15');
  const [evtTime, setEvtTime] = useState('09:00 - 15:00');
  const [evtLocation, setEvtLocation] = useState('Main Campus');
  const [evtVisibility, setEvtVisibility] = useState<'Public & Portals' | 'Portals Only' | 'Admin Only'>(
    'Public & Portals'
  );
  const [evtTargetWing, setEvtTargetWing] = useState<'All' | 'School (Class 1–10)' | 'College (Class 11–12)'>(
    'All'
  );
  const [evtDescription, setEvtDescription] = useState('');

  const sortedEvents = [...events].sort((a, b) =>
    (a.startDate || '').localeCompare(b.startDate || '')
  );
  const filteredCalendarEvents = sortedEvents.filter((evt) =>
    calendarCategoryFilter === 'ALL'
      ? true
      : (evt.category || 'Important Event') === calendarCategoryFilter
  );

  const totalHolidayDays = events
    .filter((e) => (e.category || (e.type === 'Holiday' ? 'Holiday' : 'Important Event')) === 'Holiday')
    .reduce((sum, e) => sum + getInclusiveDaySpan(e.startDate, e.endDate), 0);
  const totalExamEvents = events.filter(
    (e) => (e.category || (e.type === 'Exam' ? 'Exam' : 'Important Event')) === 'Exam'
  ).length;
  const totalClassPlanEvents = events.filter((e) => e.category === 'Class Days').length;

  const openAddEvent = (prefillDate?: string) => {
    setEditingEvent(null);
    setEvtTitle('');
    setEvtCategory('Important Event');
    setEvtStartDate(prefillDate || '2025-03-15');
    setEvtEndDate(prefillDate || '2025-03-15');
    setEvtTime('09:00 - 14:00');
    setEvtLocation('Main Campus');
    setEvtVisibility('Public & Portals');
    setEvtTargetWing('All');
    setEvtDescription('');
    setShowEventModal(true);
  };

  const openEditEvent = (evt: AcademicEvent) => {
    setEditingEvent(evt);
    setEvtTitle(evt.title);
    setEvtCategory(
      evt.category ||
        (evt.type === 'Exam'
          ? 'Exam'
          : evt.type === 'Holiday'
          ? 'Holiday'
          : evt.type === 'Class Days'
          ? 'Class Days'
          : 'Important Event')
    );
    setEvtStartDate(evt.startDate || '2025-03-15');
    setEvtEndDate(evt.endDate || evt.startDate || '2025-03-15');
    setEvtTime(evt.time);
    setEvtLocation(evt.location);
    setEvtVisibility(evt.visibility || 'Public & Portals');
    setEvtTargetWing(evt.targetWing || 'All');
    setEvtDescription(evt.description || '');
    setShowEventModal(true);
  };

  const handleSaveEvent = (e: React.FormEvent) => {
    e.preventDefault();
    if (!evtTitle.trim() || !evtStartDate) return;
    const safeEnd = evtEndDate && evtEndDate >= evtStartDate ? evtEndDate : evtStartDate;
    const { day, month } = parseDateParts(evtStartDate);
    const payload: Omit<AcademicEvent, 'id'> = {
      title: evtTitle.trim(),
      day,
      month,
      type: mapCategoryToEventType(evtCategory, evtVisibility),
      category: evtCategory,
      startDate: evtStartDate,
      endDate: safeEnd,
      academicYear:
        evtTargetWing === 'College (Class 11–12)'
          ? instituteRules.activeCollegeSession
          : instituteRules.activeAcademicYear,
      targetWing: evtTargetWing,
      location: evtLocation.trim() || 'Campus',
      time: evtTime.trim() || 'All Day',
      description: evtDescription.trim(),
      visibility: evtVisibility,
    };

    if (editingEvent) {
      updateAcademicEvent(editingEvent.id, payload);
      showToast(`Calendar entry "${payload.title}" updated.`);
    } else {
      addAcademicEvent(payload);
      showToast(`Added "${payload.title}" to Academic Calendar.`);
    }
    setShowEventModal(false);
  };

  // Month grid calculation helper
  const daysInCalendarMonth = new Date(calendarYear, calendarMonthIdx + 1, 0).getDate();
  const firstDayOffset = new Date(calendarYear, calendarMonthIdx, 1).getDay(); // 0=Sun..6=Sat
  const monthPrefix = `${calendarYear}-${String(calendarMonthIdx + 1).padStart(2, '0')}`;

  return (
    <div className="flex flex-col w-full space-y-6">
      {/* Header & Sub-tab Bar */}
      <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-4">
        <div>
          <span className="font-label-sm text-label-sm uppercase tracking-wider text-primary-container font-semibold">
            Institute Structure, Rules &amp; Year Planner • {formatInstituteSessionBanner(instituteRules)}
          </span>
          <h1 className="font-headline-lg text-headline-lg text-on-surface tracking-tight font-bold">
            Institute Master Configuration
          </h1>
          <p className="font-body-md text-body-md text-on-surface-variant mt-0.5">
            Single source of truth for academic rules, classes, class-wise subjects, weekly routines, and the whole-year academic calendar.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1 p-1 rounded-xl bg-surface-container-low border border-outline-variant/30 self-start xl:self-auto">
          {(
            [
              { id: 'classes', label: '1. Classes & Sections' },
              { id: 'subjects', label: '2. Class-Wise Subjects' },
              { id: 'routine', label: '3. Class Routine' },
              { id: 'calendar', label: '4. Academic Calendar' },
              { id: 'rules', label: '5. Rules & Bells' },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setSubTab(t.id)}
              className={`px-3.5 py-2 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                subTab === t.id
                  ? 'bg-primary-container text-on-primary shadow-xs'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* INSTITUTE READINESS HEALTH BAR */}
      <div className="rounded-2xl bg-surface-container-lowest border border-outline-variant/25 px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-primary-fixed/40 text-primary-container font-bold">
            <span className="material-symbols-outlined text-[15px]">school</span>
            {visibleClasses.length} Active Classes
          </span>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-secondary-fixed/40 text-secondary font-bold">
            <span className="material-symbols-outlined text-[15px]">menu_book</span>
            {subjects.length} Class Subjects
          </span>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-800 font-bold">
            <span className="material-symbols-outlined text-[15px]">schedule</span>
            {classRoutines.length} Routine Days
          </span>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-sky-50 text-sky-900 font-bold">
            <span className="material-symbols-outlined text-[15px]">event</span>
            {events.length} Year Events
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {classesMissingSubjects.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setSubjectFilterClass(classesMissingSubjects[0].name);
                setSubTab('subjects');
              }}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 font-semibold hover:bg-amber-100 cursor-pointer"
            >
              <span className="material-symbols-outlined text-[14px]">warning</span>
              {classesMissingSubjects.length} class(es) need subjects ({classesMissingSubjects[0].name})
            </button>
          )}
          {classesMissingRoutine.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setRoutineClass(classesMissingRoutine[0].name);
                setSubTab('routine');
              }}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 border border-outline-variant/30 text-on-surface-variant font-semibold hover:bg-slate-200 cursor-pointer"
            >
              <span className="material-symbols-outlined text-[14px]">info</span>
              {classesMissingRoutine.length} class(es) have no routine yet
            </button>
          )}
        </div>
      </div>

      {feedback && (
        <div
          className={`p-3.5 rounded-xl border text-xs font-semibold flex items-center gap-2 ${
            feedback.type === 'err'
              ? 'bg-error-container/60 border-error/30 text-on-error-container'
              : 'bg-emerald-50 border-emerald-200 text-emerald-900'
          }`}
        >
          <span className="material-symbols-outlined text-[18px]">
            {feedback.type === 'err' ? 'error' : 'check_circle'}
          </span>
          <span>{feedback.text}</span>
        </div>
      )}

      {/* ===================================================================== */}
      {/* SUB-TAB 1: CLASSES, SHIFTS, SECTIONS & GROUPS                         */}
      {/* ===================================================================== */}
      {subTab === 'classes' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-surface-container-lowest border border-outline-variant/25 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold text-on-surface-variant mr-1">
                Quick-Add Presets:
              </span>
              {QUICK_START_PRESETS.map((preset, idx) => {
                const isHscPreset = idx === 3;
                if (isHscPreset && !showCollege) return null;
                if (!isHscPreset && !showSchool) return null;
                return (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => handleApplyPreset(idx)}
                    className="px-3 py-1.5 rounded-lg bg-surface-container-low hover:bg-surface-container border border-outline-variant/30 text-[11px] font-semibold text-on-surface cursor-pointer"
                  >
                    + {preset.label}
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              onClick={openAddClass}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary-container hover:bg-primary text-on-primary text-xs font-bold shadow-xs cursor-pointer whitespace-nowrap"
            >
              <span className="material-symbols-outlined text-[18px]">add</span>
              Create Unique Class
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {visibleClasses.map((cls) => {
              const clsStudentsCount = students.filter(
                (s) => s.status === 'Active' && s.className === cls.name
              ).length;
              const clsSubjectsCount = subjects.filter((s) => s.classLevel === cls.name).length;
              const hasSections = cls.hasSections ?? !(cls.sections.length === 1 && cls.sections[0] === 'Common');
              const hasGroups = cls.hasGroups ?? cls.groups.some((g) => g !== 'General');

              return (
                <div
                  key={cls.id}
                  className="rounded-2xl bg-surface-container-lowest border border-outline-variant/30 p-5 space-y-4 flex flex-col justify-between"
                >
                  <div className="space-y-4">
                    <div className="flex items-start justify-between border-b border-outline-variant/20 pb-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded bg-surface-container text-[10px] font-mono font-bold text-on-surface-variant">
                            #{cls.order ?? 1}
                          </span>
                          <h3 className="text-lg font-bold text-on-surface">{cls.name}</h3>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5 mt-1">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-mono font-bold ${
                              (cls.cycleType || 'Academic Year') === 'Academic Session'
                                ? 'bg-indigo-50 text-indigo-900 border border-indigo-200'
                                : 'bg-emerald-50 text-emerald-900 border border-emerald-200'
                            }`}
                          >
                            {cls.cycleType || 'Academic Year'}:{' '}
                            {cls.activeCycle ||
                              ((cls.cycleType || 'Academic Year') === 'Academic Session'
                                ? instituteRules.activeCollegeSession
                                : instituteRules.activeAcademicYear)}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => openEditClass(cls)}
                          className="p-1.5 rounded-lg text-primary-container hover:bg-surface-container cursor-pointer"
                          title="Edit Class"
                        >
                          <span className="material-symbols-outlined text-[18px]">edit</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSafeDeleteClass(cls)}
                          className="p-1.5 rounded-lg text-error hover:bg-error-container/20 cursor-pointer"
                          title="Delete Class"
                        >
                          <span className="material-symbols-outlined text-[18px]">delete</span>
                        </button>
                      </div>
                    </div>

                    <div className="space-y-2 text-xs">
                      <div className="flex justify-between">
                        <span className="text-on-surface-variant font-medium">Shifts:</span>
                        <span className="font-semibold text-on-surface">{cls.shifts.join(' · ')}</span>
                      </div>
                      <div className="flex justify-between gap-3">
                        <span className="text-on-surface-variant font-medium shrink-0">Sections:</span>
                        <span className="font-mono font-semibold text-on-surface text-right">
                          {cls.hasGroups && cls.sectionMode === 'per-group' && cls.groupSections
                            ? cls.groups
                                .filter((g) => g !== 'General')
                                .map((g) => {
                                  const gs = cls.groupSections?.[g] || ['Common'];
                                  return isSingleBatchCohort(gs)
                                    ? `${g} (Combined)`
                                    : `${g} (${gs.join(', ')})`;
                                })
                                .join(' · ')
                            : hasSections
                            ? cls.sections.join(', ')
                            : 'Combined (No Section)'}
                        </span>
                      </div>
                      <div className="flex justify-between gap-4">
                        <span className="text-on-surface-variant font-medium shrink-0">Groups:</span>
                        <span className="font-semibold text-on-surface text-right">
                          {hasGroups ? cls.groups.join(' · ') : 'General Only (No Groups)'}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-outline-variant/20 flex items-center justify-between gap-2 text-[11px]">
                    <span className="text-on-surface-variant font-mono">
                      {clsStudentsCount} student(s) · {clsSubjectsCount} subject(s)
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setSubjectFilterClass(cls.name);
                        setSubjectFilterGroup('ALL');
                        setSubTab('subjects');
                      }}
                      className="font-bold text-primary-container hover:underline cursor-pointer"
                    >
                      Manage Subjects &rarr;
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* SUB-TAB 2: CLASS-WISE SUBJECTS MANAGEMENT                             */}
      {/* ===================================================================== */}
      {subTab === 'subjects' && (
        <div className="space-y-4">
          {/* Class Selector Strip */}
          <div className="rounded-2xl bg-surface-container-lowest border border-outline-variant/25 p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-bold text-on-surface">
                  Class-Wise Subject Curriculum ({effectiveSubjectClass || 'Select Class'})
                </h2>
                <p className="text-xs text-on-surface-variant">
                  Examination mark entry, exam routines, class routines, and marksheets pull directly from each class&apos;s subjects below.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={openNctbPresetModal}
                  disabled={!effectiveSubjectClass}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-xs font-bold text-emerald-900 cursor-pointer disabled:opacity-50"
                >
                  <span className="material-symbols-outlined text-[16px]">auto_awesome</span>
                  Import NCTB Board Preset
                </button>
                {academicClasses.length > 1 && (
                  <button
                    type="button"
                    onClick={() => {
                      const other = academicClasses.find((c) => c.name !== effectiveSubjectClass);
                      setCloneSourceClass(other?.name || '');
                      setShowCloneModal(true);
                    }}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-surface-container-low hover:bg-surface-container border border-outline-variant/30 text-xs font-semibold text-on-surface cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[16px]">content_copy</span>
                    Copy Subjects From Class
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => openAddSubject(effectiveSubjectClass)}
                  disabled={!effectiveSubjectClass}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary-container hover:bg-primary text-on-primary text-xs font-bold shadow-xs cursor-pointer whitespace-nowrap disabled:opacity-50"
                >
                  <span className="material-symbols-outlined text-[18px]">library_add</span>
                  Add Subject to {effectiveSubjectClass}
                </button>
              </div>
            </div>

            {/* Class Pills */}
            <div className="flex flex-wrap gap-2 pt-2 border-t border-outline-variant/20">
              {academicClasses.map((cls) => {
                const count = subjects.filter((s) => s.classLevel === cls.name).length;
                const active = cls.name === effectiveSubjectClass;
                return (
                  <button
                    key={cls.id}
                    type="button"
                    onClick={() => {
                      setSubjectFilterClass(cls.name);
                      setSubjectFilterGroup('ALL');
                    }}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer inline-flex items-center gap-2 ${
                      active
                        ? 'bg-primary-container text-on-primary shadow-xs'
                        : 'bg-surface-container-low text-on-surface-variant hover:text-on-surface'
                    }`}
                  >
                    <span>{cls.name}</span>
                    <span
                      className={`px-1.5 py-0.2 rounded text-[10px] font-mono ${
                        active ? 'bg-white/20 text-white' : 'bg-surface-container text-on-surface'
                      }`}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Group sub-filter (shown only if active class uses groups) */}
            {activeSubjectClassObj && activeSubjectClassObj.hasGroups !== false && (
              <div className="flex flex-wrap items-center gap-1.5 pt-1 text-xs">
                <span className="text-[11px] font-semibold text-on-surface-variant mr-1">
                  Track Filter:
                </span>
                {['ALL', 'General', ...activeSubjectClassObj.groups.filter((g) => g !== 'General')].map(
                  (grp) => (
                    <button
                      key={grp}
                      type="button"
                      onClick={() => setSubjectFilterGroup(grp)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold cursor-pointer ${
                        subjectFilterGroup === grp
                          ? 'bg-secondary text-on-secondary'
                          : 'bg-surface-container-low text-on-surface-variant hover:text-on-surface'
                      }`}
                    >
                      {grp === 'ALL' ? 'All Tracks' : grp}
                    </button>
                  )
                )}
              </div>
            )}
          </div>

          <div className="rounded-2xl bg-surface-container-lowest border border-outline-variant/30 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-surface-container-low text-on-surface-variant border-b border-outline-variant/30">
                    <th className="py-3 px-3 font-semibold text-center w-14">Order</th>
                    <th className="py-3 px-4 font-semibold">Code</th>
                    <th className="py-3 px-4 font-semibold">Subject Title</th>
                    <th className="py-3 px-4 font-semibold">Group</th>
                    <th className="py-3 px-4 font-semibold text-center">CQ</th>
                    <th className="py-3 px-4 font-semibold text-center">MCQ</th>
                    <th className="py-3 px-4 font-semibold text-center">Practical</th>
                    <th className="py-3 px-4 font-semibold text-center">CT / Custom</th>
                    <th className="py-3 px-4 font-semibold text-center">Total (Pass)</th>
                    <th className="py-3 px-4 font-semibold text-center">Role / Routing</th>
                    <th className="py-3 px-4 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/15">
                  {classSubjects.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="p-8 text-center text-on-surface-variant">
                        No subjects configured for <strong>{effectiveSubjectClass}</strong> yet. Add a subject or copy from an existing class.
                      </td>
                    </tr>
                  ) : (
                    classSubjects.map((sub, idx) => {
                      const cqOn = isSubjectComponentEnabled(sub.components.cq);
                      const mcqOn = isSubjectComponentEnabled(sub.components.mcq);
                      const pracOn = isSubjectComponentEnabled(sub.components.practical);
                      const ctOn = Boolean(sub.components.ct?.enabled && (sub.components.ct?.fullMarks || 0) > 0);
                      const activeCustoms = (sub.customComponents || []).filter(
                        (c) => c.enabled && c.fullMarks > 0 && c.label.trim()
                      );
                      const extraParts: string[] = [];
                      if (ctOn && sub.components.ct) {
                        const conv = getEffectiveConversionPercent(sub.components.ct.conversionPercent);
                        extraParts.push(
                          `CT ${sub.components.ct.fullMarks}/${sub.components.ct.passMarks}${
                            conv < 100 ? ` (${conv}%)` : ''
                          }`
                        );
                      }
                      for (const c of activeCustoms) {
                        const conv = getEffectiveConversionPercent(c.conversionPercent);
                        extraParts.push(
                          `${c.label} ${c.fullMarks}/${c.passMarks}${conv < 100 ? ` (${conv}%)` : ''}`
                        );
                      }

                      return (
                      <tr key={sub.id} className="hover:bg-surface-container-low/50">
                        <td className="py-3 px-3 text-center font-mono font-semibold text-on-surface-variant tabular-nums">
                          {typeof sub.order === 'number' ? sub.order : idx + 1}
                        </td>
                        <td className="py-3 px-4 font-mono font-bold text-primary-container tabular-nums">
                          {sub.code}
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-semibold text-on-surface">{sub.name}</div>
                          {sub.banglaName && (
                            <div className="text-[11px] text-on-surface-variant">{sub.banglaName}</div>
                          )}
                        </td>
                        <td className="py-3 px-4 text-on-surface-variant font-medium">
                          <div>{formatSubjectGroupsLabel(sub)}</div>
                          {sub.genderRestriction === 'Female' && (
                            <div className="mt-0.5 text-[10px] font-semibold text-pink-800">
                              Female Only
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-4 text-center font-mono tabular-nums">
                          {cqOn
                            ? `${sub.components.cq.fullMarks}/${sub.components.cq.passMarks}`
                            : '—'}
                        </td>
                        <td className="py-3 px-4 text-center font-mono tabular-nums">
                          {mcqOn
                            ? `${sub.components.mcq.fullMarks}/${sub.components.mcq.passMarks}`
                            : '—'}
                        </td>
                        <td className="py-3 px-4 text-center font-mono tabular-nums">
                          {pracOn
                            ? `${sub.components.practical.fullMarks}/${sub.components.practical.passMarks}`
                            : '—'}
                        </td>
                        <td className="py-3 px-4 text-center font-mono tabular-nums text-[11px] text-on-surface-variant">
                          {extraParts.length > 0 ? extraParts.join(' · ') : '—'}
                        </td>
                        <td className="py-3 px-4 text-center font-mono font-bold tabular-nums">
                          {sub.totalFullMarks}{' '}
                          <span className="text-[10px] font-normal text-on-surface-variant">
                            ({sub.totalPassMarks})
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center text-[11px] font-medium text-on-surface-variant">
                          <div>
                            {sub.religionRestriction
                              ? `Religion: ${sub.religionRestriction}`
                              : sub.canBeFourthSubject && !sub.isCompulsory
                              ? 'Elective / 4th Pool'
                              : !sub.isCompulsory
                              ? 'Group Elective'
                              : 'Compulsory'}
                            {sub.combinedPaperKey ? ` · Paper ${sub.paperNumber || ''}` : ''}
                            {sub.excludeFromGpa ? ' · No-GPA' : ''}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => openEditSubject(sub)}
                              className="p-1.5 rounded-lg text-primary-container hover:bg-surface-container cursor-pointer"
                              title="Edit Subject"
                            >
                              <span className="material-symbols-outlined text-[16px]">edit</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleSafeDeleteSubject(sub)}
                              className="p-1.5 rounded-lg text-error hover:bg-error-container/20 cursor-pointer"
                              title="Delete Subject"
                            >
                              <span className="material-symbols-outlined text-[16px]">delete</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* SUB-TAB 3: CLASS ROUTINE BUILDER (WEEKLY MATRIX + CLASH GUARD)        */}
      {/* ===================================================================== */}
      {subTab === 'routine' && (
        <div className="rounded-2xl bg-surface-container-lowest border border-outline-variant/30 p-6 space-y-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 flex-1">
              <div>
                <label className="block text-[11px] font-semibold text-on-surface-variant mb-1">
                  Class
                </label>
                <select
                  value={routineClass}
                  onChange={(e) => {
                    const nextCls = e.target.value;
                    const clsObj = academicClasses.find((c) => c.name === nextCls);
                    const nextGrp: AcademicGroup | 'All' =
                      clsObj?.hasGroups !== false &&
                      routineGroup !== 'All' &&
                      clsObj?.groups.includes(routineGroup)
                        ? routineGroup
                        : 'All';
                    const clsSections = getEffectiveSectionsForClassGroup(clsObj, nextGrp);
                    const nextSec = clsSections.includes(effectiveRoutineSection)
                      ? effectiveRoutineSection
                      : clsSections[0] || 'Common';
                    const clsShifts = clsObj?.shifts.length ? clsObj.shifts : availableShiftsForClass;
                    const nextShf = clsShifts.includes(effectiveRoutineShift)
                      ? effectiveRoutineShift
                      : clsShifts[0] || 'Morning';
                    setRoutineClass(nextCls);
                    setRoutineGroup(nextGrp);
                    setRoutineSection(nextSec);
                    setRoutineShift(nextShf);
                    loadRoutineSelection(nextCls, nextGrp, nextSec, nextShf, effectiveRoutineDay);
                  }}
                  className="w-full px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 text-xs font-semibold"
                >
                  {academicClasses.map((c) => (
                    <option key={c.id} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-on-surface-variant mb-1">
                  Group Scope
                </label>
                {activeRoutineClassObj?.hasGroups === false ? (
                  <div className="px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/20 text-xs font-mono text-on-surface-variant">
                    General Only
                  </div>
                ) : (
                  <select
                    value={effectiveRoutineGroup}
                    onChange={(e) => {
                      const nextGrp = e.target.value as AcademicGroup | 'All';
                      const secs = getEffectiveSectionsForClassGroup(activeRoutineClassObj, nextGrp);
                      const nextSec = secs.includes(effectiveRoutineSection)
                        ? effectiveRoutineSection
                        : secs[0] || 'Common';
                      setRoutineGroup(nextGrp);
                      setRoutineSection(nextSec);
                      loadRoutineSelection(
                        routineClass,
                        nextGrp,
                        nextSec,
                        effectiveRoutineShift,
                        effectiveRoutineDay
                      );
                    }}
                    className="w-full px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 text-xs font-semibold"
                  >
                    <option value="All">Combined (All Groups)</option>
                    {routineAvailableGroups.map((grp) => (
                      <option key={grp} value={grp}>
                        {grp} Only
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-on-surface-variant mb-1">
                  Section / Cohort
                </label>
                {isSingleRoutineCohort ? (
                  <div className="px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/20 text-xs font-semibold text-primary-container truncate">
                    {formatGroupSectionDisplay(effectiveRoutineGroup, 'Common')}
                  </div>
                ) : (
                  <select
                    value={effectiveRoutineSection}
                    onChange={(e) => {
                      setRoutineSection(e.target.value);
                      loadRoutineSelection(
                        routineClass,
                        effectiveRoutineGroup,
                        e.target.value,
                        effectiveRoutineShift,
                        effectiveRoutineDay
                      );
                    }}
                    className="w-full px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 text-xs font-semibold"
                  >
                    {routineClassSections.map((sec) => (
                      <option key={sec} value={sec}>
                        {formatGroupSectionDisplay(effectiveRoutineGroup, sec)}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-on-surface-variant mb-1">
                  Shift
                </label>
                <select
                  value={effectiveRoutineShift}
                  onChange={(e) => {
                    const shf = e.target.value as ShiftType;
                    setRoutineShift(shf);
                    loadRoutineSelection(
                      routineClass,
                      effectiveRoutineGroup,
                      effectiveRoutineSection,
                      shf,
                      effectiveRoutineDay
                    );
                  }}
                  className="w-full px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 text-xs font-semibold"
                >
                  {availableShiftsForClass.map((shf) => (
                    <option key={shf} value={shf}>
                      {shf} Shift
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-on-surface-variant mb-1">
                  Working Day
                </label>
                <select
                  value={effectiveRoutineDay}
                  onChange={(e) => {
                    setRoutineDay(e.target.value);
                    loadRoutineSelection(
                      routineClass,
                      effectiveRoutineGroup,
                      effectiveRoutineSection,
                      effectiveRoutineShift,
                      e.target.value
                    );
                  }}
                  className="w-full px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 text-xs font-semibold"
                >
                  {workingDays.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex items-center gap-1 p-1 rounded-xl bg-surface-container-low border border-outline-variant/30">
              <button
                type="button"
                onClick={() => setRoutineViewMode('editor')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
                  routineViewMode === 'editor'
                    ? 'bg-primary-container text-on-primary'
                    : 'text-on-surface-variant'
                }`}
              >
                Day Editor
              </button>
              <button
                type="button"
                onClick={() => setRoutineViewMode('matrix')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
                  routineViewMode === 'matrix'
                    ? 'bg-primary-container text-on-primary'
                    : 'text-on-surface-variant'
                }`}
              >
                Full Week View
              </button>
            </div>
          </div>

          {routineViewMode === 'editor' ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs bg-surface-container-low/70 p-3 rounded-xl border border-outline-variant/20">
                <span className="text-on-surface-variant">
                  Editing{' '}
                  <strong>
                    {routineClass} ·{' '}
                    {formatGroupSectionDisplay(effectiveRoutineGroup, effectiveRoutineSection)}
                  </strong>{' '}
                  ({routineClassSubjects.length} subjects) + {routineActivities.length} activities.{' '}
                  Use &ldquo;Parallel Split&rdquo; on any period for cross-group merges (e.g., BGS vs General Science for BS+Hum) or simultaneous 4th subjects.
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowActivitiesModal(true)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white border border-outline-variant/30 text-[11px] font-semibold text-primary-container hover:bg-surface-container cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[14px]">tune</span>
                    Manage Activities ({routineActivities.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setDraftPeriods(buildPeriodsFromTemplate(effectiveRoutineShift))}
                    className="px-3 py-1.5 rounded-lg bg-white border border-outline-variant/30 text-[11px] font-semibold text-on-surface hover:bg-surface-container cursor-pointer"
                  >
                    Reset to {effectiveRoutineShift} Bell Template
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto border border-outline-variant/25 rounded-xl">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-surface-container-low text-on-surface-variant">
                      <th className="py-2.5 px-3 font-semibold">Period</th>
                      <th className="py-2.5 px-3 font-semibold">Time</th>
                      <th className="py-2.5 px-3 font-semibold">Subject / Activity &amp; Audience</th>
                      <th className="py-2.5 px-3 font-semibold">Assigned Teacher</th>
                      <th className="py-2.5 px-3 font-semibold">Room</th>
                      <th className="py-2.5 px-3 font-semibold text-right">Mode</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant/15">
                    {draftPeriods.map((p, idx) => {
                      const existingParallel = !p.isBreak ? getPeriodParallelSessions(p) : [];
                      const isParallelMode =
                        !p.isBreak &&
                        (Boolean(p.parallelSessions?.length) || Boolean(p.isGroupSplit));

                      const updatePeriodParallel = (sessions: ParallelRoutineSession[]) => {
                        const next = [...draftPeriods];
                        next[idx] = {
                          ...next[idx],
                          isGroupSplit: false,
                          groupSplits: undefined,
                          parallelSessions: sessions,
                        };
                        setDraftPeriods(next);
                      };

                      if (isParallelMode) {
                        const blocks =
                          existingParallel.length > 0
                            ? existingParallel
                            : [
                                {
                                  id: `ps-${idx}-1`,
                                  subjectName: p.subjectName || '',
                                  teacherName: p.teacherName || 'Faculty Desk',
                                  room: p.room || '',
                                  targetGroups:
                                    routineAvailableGroups.length > 0
                                      ? [routineAvailableGroups[0]]
                                      : ['General' as AcademicGroup],
                                },
                              ];

                        return (
                          <tr key={idx} className="bg-indigo-50/35 align-top">
                            <td className="py-3 px-3 font-mono font-bold text-primary-container whitespace-nowrap">
                              <div>{p.period}</div>
                              <span className="mt-1 inline-block px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-900 text-[9px] font-sans font-bold uppercase">
                                Parallel ({blocks.length})
                              </span>
                            </td>
                            <td className="py-3 px-3">
                              <div className="flex items-center gap-1">
                                <input
                                  type="text"
                                  value={p.time}
                                  onChange={(e) => {
                                    const next = [...draftPeriods];
                                    next[idx] = { ...next[idx], time: e.target.value };
                                    setDraftPeriods(next);
                                  }}
                                  className="w-16 px-2 py-1 rounded-lg bg-white border border-outline-variant/30 font-mono text-xs"
                                />
                                <span className="text-on-surface-variant">–</span>
                                <input
                                  type="text"
                                  value={p.endTime || ''}
                                  placeholder="End"
                                  onChange={(e) => {
                                    const next = [...draftPeriods];
                                    next[idx] = { ...next[idx], endTime: e.target.value };
                                    setDraftPeriods(next);
                                  }}
                                  className="w-16 px-2 py-1 rounded-lg bg-white border border-outline-variant/30 font-mono text-xs"
                                />
                              </div>
                            </td>
                            <td colSpan={3} className="py-2.5 px-3 space-y-2">
                              {/* Quick Parallel Templates */}
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="text-[10px] font-bold uppercase text-indigo-900 mr-1">
                                  Quick Add / Presets:
                                </span>
                                <button
                                  type="button"
                                  onClick={() =>
                                    updatePeriodParallel([
                                      ...blocks,
                                      {
                                        id: `ps-${idx}-${Date.now()}`,
                                        subjectName: '',
                                        teacherName: 'Faculty Desk',
                                        room: '',
                                        targetGroups: ['General'],
                                      },
                                    ])
                                  }
                                  className="px-2 py-0.5 rounded-md bg-white border border-indigo-200 text-indigo-900 text-[10px] font-bold hover:bg-indigo-100 cursor-pointer"
                                >
                                  + Add Parallel Block
                                </button>
                                {routineAvailableGroups.length >= 2 && (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const bgsSub = subjects.find(
                                          (s) => s.classLevel === routineClass && s.code === '150'
                                        );
                                        const genSciSub = subjects.find(
                                          (s) => s.classLevel === routineClass && s.code === '127'
                                        );
                                        updatePeriodParallel([
                                          {
                                            id: `ps-${idx}-bgs`,
                                            subjectName: bgsSub
                                              ? `${bgsSub.name} (${bgsSub.code})`
                                              : 'Bangladesh & Global Studies (150)',
                                            teacherName: 'Faculty Desk',
                                            room: '',
                                            targetGroups: ['Science'],
                                          },
                                          {
                                            id: `ps-${idx}-gs`,
                                            subjectName: genSciSub
                                              ? `${genSciSub.name} (${genSciSub.code})`
                                              : 'General Science (127)',
                                            teacherName: 'Faculty Desk',
                                            room: '',
                                            targetGroups: ['Business Studies', 'Humanities'],
                                          },
                                        ]);
                                      }}
                                      className="px-2 py-0.5 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-900 text-[10px] font-bold hover:bg-emerald-100 cursor-pointer"
                                    >
                                      BGS (Sci) + Gen. Science (BS+Hum)
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const hmSub = subjects.find(
                                          (s) => s.classLevel === routineClass && s.code === '126'
                                        );
                                        const agSub = subjects.find(
                                          (s) => s.classLevel === routineClass && s.code === '134'
                                        );
                                        const hsSub = subjects.find(
                                          (s) => s.classLevel === routineClass && s.code === '151'
                                        );
                                        updatePeriodParallel([
                                          {
                                            id: `ps-${idx}-hm`,
                                            subjectName: hmSub
                                              ? `${hmSub.name} (${hmSub.code})`
                                              : 'Higher Mathematics (126)',
                                            teacherName: 'Faculty Desk',
                                            room: '',
                                            targetGroups: ['Science'],
                                            onlyEnrolledStudents: true,
                                          },
                                          {
                                            id: `ps-${idx}-ag`,
                                            subjectName: agSub
                                              ? `${agSub.name} (${agSub.code})`
                                              : 'Agriculture Studies (134)',
                                            teacherName: 'Faculty Desk',
                                            room: '',
                                            targetGroups: [
                                              'Science',
                                              'Business Studies',
                                              'Humanities',
                                            ],
                                            onlyEnrolledStudents: true,
                                          },
                                          {
                                            id: `ps-${idx}-hs`,
                                            subjectName: hsSub
                                              ? `${hsSub.name} (${hsSub.code})`
                                              : 'Home Science (151)',
                                            teacherName: 'Faculty Desk',
                                            room: '',
                                            targetGroups: [
                                              'Science',
                                              'Business Studies',
                                              'Humanities',
                                            ],
                                            onlyEnrolledStudents: true,
                                          },
                                        ]);
                                      }}
                                      className="px-2 py-0.5 rounded-md bg-amber-50 border border-amber-200 text-amber-900 text-[10px] font-bold hover:bg-amber-100 cursor-pointer"
                                    >
                                      Elective / 4th Split (HM / Agri / Home Sci)
                                    </button>
                                  </>
                                )}
                                <button
                                  type="button"
                                  onClick={() => {
                                    const islamSub = subjects.find(
                                      (s) => s.classLevel === routineClass && s.religionRestriction === 'Islam'
                                    );
                                    const hinduSub = subjects.find(
                                      (s) =>
                                        s.classLevel === routineClass && s.religionRestriction === 'Hinduism'
                                    );
                                    updatePeriodParallel([
                                      {
                                        id: `ps-${idx}-isl`,
                                        subjectName: islamSub
                                          ? `${islamSub.name} (${islamSub.code})`
                                          : 'Islam & Moral Education',
                                        teacherName: 'Faculty Desk',
                                        room: '',
                                        targetGroups: ['General'],
                                        religionFilter: 'Islam',
                                      },
                                      {
                                        id: `ps-${idx}-hin`,
                                        subjectName: hinduSub
                                          ? `${hinduSub.name} (${hinduSub.code})`
                                          : 'Hindu Religion & Moral Education',
                                        teacherName: 'Faculty Desk',
                                        room: '',
                                        targetGroups: ['General'],
                                        religionFilter: 'Hinduism',
                                      },
                                    ]);
                                  }}
                                  className="px-2 py-0.5 rounded-md bg-sky-50 border border-sky-200 text-sky-900 text-[10px] font-bold hover:bg-sky-100 cursor-pointer"
                                >
                                  Faith Split (Islam / Hindu)
                                </button>
                              </div>

                              <div className="space-y-2">
                                {blocks.map((blk, bIdx) => {
                                  const blkAct = routineActivities.find(
                                    (a) => a.name === blk.subjectName
                                  );
                                  const blkClash = findTeacherClash(
                                    blk.teacherName,
                                    p.period,
                                    blk.subjectName,
                                    idx,
                                    blk.id
                                  );
                                  const roomClash = findRoomClash(
                                    blk.room,
                                    p.period,
                                    idx,
                                    blk.id
                                  );
                                  const selectableSubs = sortSubjectsByOrder(
                                    subjects.filter((s) => {
                                      if (s.classLevel !== routineClass) return false;
                                      if (
                                        blk.targetGroups &&
                                        blk.targetGroups.length > 0 &&
                                        !blk.targetGroups.some((g) => subjectAppliesToGroup(s, g))
                                      ) {
                                        return false;
                                      }
                                      return true;
                                    })
                                  );

                                  const patchBlock = (patch: Partial<ParallelRoutineSession>) => {
                                    const nextBlocks = blocks.map((item, k) =>
                                      k === bIdx ? { ...item, ...patch } : item
                                    );
                                    updatePeriodParallel(nextBlocks);
                                  };

                                  return (
                                    <div
                                      key={blk.id}
                                      className="p-2.5 rounded-xl bg-white border border-indigo-200/80 space-y-2"
                                    >
                                      <div className="grid grid-cols-1 md:grid-cols-12 gap-2 items-start">
                                        <div className="md:col-span-5">
                                          <select
                                            value={blk.subjectName}
                                            onChange={(e) => {
                                              const val = e.target.value;
                                              const act = routineActivities.find(
                                                (a) => a.name === val
                                              );
                                              patchBlock({
                                                subjectName: val,
                                                room:
                                                  act?.defaultRoom && !blk.room
                                                    ? act.defaultRoom
                                                    : blk.room,
                                                teacherName:
                                                  act && !act.requiresTeacher
                                                    ? 'No Teacher Required'
                                                    : blk.teacherName === 'No Teacher Required'
                                                    ? 'Faculty Desk'
                                                    : blk.teacherName,
                                              });
                                            }}
                                            className="w-full px-2 py-1.5 rounded-lg bg-surface-container-low border border-outline-variant/30 text-xs font-medium"
                                          >
                                            <option value="">— Select Subject / Activity —</option>
                                            <optgroup label={`${routineClass} Subjects`}>
                                              {selectableSubs.map((sub) => {
                                                const label = `${sub.name} (${sub.code})`;
                                                return (
                                                  <option key={sub.id} value={label}>
                                                    {label} [{formatSubjectGroupsLabel(sub)}]
                                                  </option>
                                                );
                                              })}
                                            </optgroup>
                                            <optgroup label="Campus Activities">
                                              {routineActivities.map((act) => (
                                                <option key={act.id} value={act.name}>
                                                  {act.name}
                                                </option>
                                              ))}
                                            </optgroup>
                                            {blk.subjectName &&
                                              !selectableSubs.some(
                                                (s) => `${s.name} (${s.code})` === blk.subjectName
                                              ) &&
                                              !routineActivities.some(
                                                (a) => a.name === blk.subjectName
                                              ) && (
                                                <option value={blk.subjectName}>
                                                  {blk.subjectName}
                                                </option>
                                              )}
                                          </select>
                                        </div>

                                        <div className="md:col-span-4 space-y-0.5">
                                          <select
                                            value={
                                              blkAct && !blkAct.requiresTeacher
                                                ? 'No Teacher Required'
                                                : blk.teacherName
                                            }
                                            disabled={Boolean(blkAct && !blkAct.requiresTeacher)}
                                            onChange={(e) =>
                                              patchBlock({ teacherName: e.target.value })
                                            }
                                            className={`w-full px-2 py-1.5 rounded-lg border text-xs disabled:opacity-60 ${
                                              blkClash
                                                ? 'bg-amber-50 border-amber-400 font-semibold text-amber-950'
                                                : 'bg-surface-container-low border-outline-variant/30'
                                            }`}
                                          >
                                            <option value="No Teacher Required">
                                              No Teacher Required
                                            </option>
                                            <option value="Faculty Desk">Faculty Desk</option>
                                            <option value="Senior Faculty">Senior Faculty</option>
                                            {teachers.map((t) => (
                                              <option key={t.id} value={t.name}>
                                                {t.name}
                                              </option>
                                            ))}
                                            {blk.teacherName &&
                                              blk.teacherName !== 'No Teacher Required' &&
                                              blk.teacherName !== 'Faculty Desk' &&
                                              blk.teacherName !== 'Senior Faculty' &&
                                              !teachers.some((t) => t.name === blk.teacherName) && (
                                                <option value={blk.teacherName}>
                                                  {blk.teacherName}
                                                </option>
                                              )}
                                          </select>
                                          {blkClash && (
                                            <div className="text-[10px] font-bold text-amber-800">
                                              Teacher Clash: {blkClash}
                                            </div>
                                          )}
                                        </div>

                                        <div className="md:col-span-2 space-y-0.5">
                                          <input
                                            type="text"
                                            placeholder="Room"
                                            value={blk.room || ''}
                                            onChange={(e) => patchBlock({ room: e.target.value })}
                                            className={`w-full px-2 py-1.5 rounded-lg border font-mono text-xs ${
                                              roomClash
                                                ? 'bg-rose-50 border-rose-400 text-rose-950 font-semibold'
                                                : 'bg-surface-container-low border-outline-variant/30'
                                            }`}
                                          />
                                          {roomClash && (
                                            <div className="text-[10px] font-bold text-rose-800">
                                              Room busy: {roomClash}
                                            </div>
                                          )}
                                        </div>

                                        <div className="md:col-span-1 flex justify-end">
                                          <button
                                            type="button"
                                            disabled={blocks.length <= 1}
                                            onClick={() =>
                                              updatePeriodParallel(
                                                blocks.filter((item) => item.id !== blk.id)
                                              )
                                            }
                                            className="p-1 text-error hover:bg-error-container/20 rounded disabled:opacity-30 cursor-pointer"
                                            title="Remove parallel block"
                                          >
                                            <span className="material-symbols-outlined text-[15px]">
                                              close
                                            </span>
                                          </button>
                                        </div>
                                      </div>

                                      {/* Block Audience Targeting Row */}
                                      <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-outline-variant/15 text-[11px]">
                                        {routineAvailableGroups.length > 0 && (
                                          <div className="flex flex-wrap items-center gap-1.5">
                                            <span className="text-on-surface-variant font-semibold">
                                              Groups:
                                            </span>
                                            <button
                                              type="button"
                                              onClick={() => patchBlock({ targetGroups: undefined })}
                                              className={`px-2 py-0.5 rounded font-semibold cursor-pointer ${
                                                !blk.targetGroups || blk.targetGroups.length === 0
                                                  ? 'bg-indigo-600 text-white'
                                                  : 'bg-surface-container-low text-on-surface-variant'
                                              }`}
                                            >
                                              All
                                            </button>
                                            {routineAvailableGroups.map((grp) => {
                                              const active = blk.targetGroups?.includes(grp) ?? false;
                                              return (
                                                <button
                                                  key={grp}
                                                  type="button"
                                                  onClick={() => {
                                                    const current = blk.targetGroups || [];
                                                    const nextGrps = active
                                                      ? current.filter((g) => g !== grp)
                                                      : [...current, grp];
                                                    patchBlock({
                                                      targetGroups:
                                                        nextGrps.length > 0 ? nextGrps : undefined,
                                                    });
                                                  }}
                                                  className={`px-2 py-0.5 rounded font-semibold cursor-pointer ${
                                                    active
                                                      ? 'bg-indigo-100 text-indigo-950 border border-indigo-300'
                                                      : 'bg-surface-container-low text-on-surface-variant border border-transparent'
                                                  }`}
                                                >
                                                  {grp}
                                                </button>
                                              );
                                            })}
                                          </div>
                                        )}

                                        <div className="flex flex-wrap items-center gap-3 ml-auto">
                                          <select
                                            value={blk.religionFilter || ''}
                                            onChange={(e) =>
                                              patchBlock({
                                                religionFilter: e.target.value
                                                  ? (e.target.value as ReligionGroup)
                                                  : undefined,
                                              })
                                            }
                                            className="px-2 py-0.5 rounded bg-surface-container-low border border-outline-variant/25 text-[11px]"
                                          >
                                            <option value="">All Religions</option>
                                            {ALL_RELIGIONS.map((rel) => (
                                              <option key={rel} value={rel}>
                                                {rel} Only
                                              </option>
                                            ))}
                                          </select>

                                          <label className="inline-flex items-center gap-1 cursor-pointer font-semibold text-on-surface-variant">
                                            <input
                                              type="checkbox"
                                              checked={Boolean(blk.onlyEnrolledStudents)}
                                              onChange={(e) =>
                                                patchBlock({
                                                  onlyEnrolledStudents: e.target.checked,
                                                })
                                              }
                                            />
                                            <span>Enrolled Elective / 4th Only</span>
                                          </label>
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </td>
                            <td className="py-3 px-3 text-right whitespace-nowrap">
                              <button
                                type="button"
                                onClick={() => {
                                  const firstBlk = blocks[0];
                                  const next = [...draftPeriods];
                                  next[idx] = {
                                    ...next[idx],
                                    subjectName: firstBlk?.subjectName || next[idx].subjectName || '',
                                    teacherName:
                                      firstBlk?.teacherName || next[idx].teacherName || 'Faculty Desk',
                                    room: firstBlk?.room || next[idx].room || '',
                                    isGroupSplit: false,
                                    groupSplits: undefined,
                                    parallelSessions: undefined,
                                  };
                                  setDraftPeriods(next);
                                }}
                                className="px-2.5 py-1 rounded-lg bg-white border border-outline-variant/30 text-[11px] font-semibold text-on-surface-variant hover:text-on-surface cursor-pointer"
                              >
                                Merge Combined
                              </button>
                            </td>
                          </tr>
                        );
                      }

                      const clashWith = p.isBreak
                        ? null
                        : findTeacherClash(p.teacherName, p.period, p.subjectName);
                      const singleRoomClash = p.isBreak
                        ? null
                        : findRoomClash(p.room, p.period);
                      const matchedActivity = routineActivities.find(
                        (a) => a.name === p.subjectName
                      );

                      return (
                        <tr key={idx} className={p.isBreak ? 'bg-amber-50/50' : ''}>
                          <td className="py-2.5 px-3 font-mono font-bold text-primary-container whitespace-nowrap">
                            {p.period}
                          </td>
                          <td className="py-2.5 px-3">
                            <div className="flex items-center gap-1">
                              <input
                                type="text"
                                value={p.time}
                                onChange={(e) => {
                                  const next = [...draftPeriods];
                                  next[idx] = { ...next[idx], time: e.target.value };
                                  setDraftPeriods(next);
                                }}
                                className="w-16 px-2 py-1 rounded-lg bg-surface-container-low border border-outline-variant/30 font-mono text-xs"
                              />
                              <span className="text-on-surface-variant">–</span>
                              <input
                                type="text"
                                value={p.endTime || ''}
                                placeholder="End"
                                onChange={(e) => {
                                  const next = [...draftPeriods];
                                  next[idx] = { ...next[idx], endTime: e.target.value };
                                  setDraftPeriods(next);
                                }}
                                className="w-16 px-2 py-1 rounded-lg bg-surface-container-low border border-outline-variant/30 font-mono text-xs"
                              />
                            </div>
                          </td>
                          <td className="py-2.5 px-3 min-w-[200px]">
                            {p.isBreak ? (
                              <input
                                type="text"
                                value={p.subjectName}
                                onChange={(e) => {
                                  const next = [...draftPeriods];
                                  next[idx] = { ...next[idx], subjectName: e.target.value };
                                  setDraftPeriods(next);
                                }}
                                className="w-full px-2.5 py-1.5 rounded-lg bg-white border border-amber-200 text-xs font-semibold text-amber-900"
                              />
                            ) : (
                              <select
                                value={p.subjectName}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  const act = routineActivities.find((a) => a.name === val);
                                  const next = [...draftPeriods];
                                  next[idx] = {
                                    ...next[idx],
                                    subjectName: val,
                                    room:
                                      act?.defaultRoom && !next[idx].room
                                        ? act.defaultRoom
                                        : next[idx].room,
                                    teacherName:
                                      act && !act.requiresTeacher
                                        ? 'No Teacher Required'
                                        : next[idx].teacherName === 'No Teacher Required'
                                        ? 'Faculty Desk'
                                        : next[idx].teacherName,
                                  };
                                  setDraftPeriods(next);
                                }}
                                className="w-full px-2.5 py-1.5 rounded-lg bg-surface-container-low border border-outline-variant/30 text-xs font-medium"
                              >
                                <option value="">— Select Subject / Activity —</option>
                                <optgroup label={`${routineClass} Subjects`}>
                                  {routineClassSubjects.map((sub) => {
                                    const label = `${sub.name} (${sub.code})`;
                                    return (
                                      <option key={sub.id} value={label}>
                                        {label}
                                        {sub.group !== 'General' ? ` [${formatSubjectGroupsLabel(sub)}]` : ''}
                                      </option>
                                    );
                                  })}
                                </optgroup>
                                <optgroup label="Campus Activities">
                                  {routineActivities.map((act) => (
                                    <option key={act.id} value={act.name}>
                                      {act.name}
                                      {!act.requiresTeacher ? ' (Self/Assembly)' : ''}
                                    </option>
                                  ))}
                                </optgroup>
                                {p.subjectName &&
                                  !routineClassSubjects.some(
                                    (s) => `${s.name} (${s.code})` === p.subjectName
                                  ) &&
                                  !routineActivities.some((a) => a.name === p.subjectName) && (
                                    <option value={p.subjectName}>{p.subjectName}</option>
                                  )}
                              </select>
                            )}
                          </td>
                          <td className="py-2.5 px-3 min-w-[180px]">
                            {p.isBreak ? (
                              <span className="text-on-surface-variant font-mono">—</span>
                            ) : (
                              <div className="space-y-1">
                                <select
                                  value={
                                    matchedActivity && !matchedActivity.requiresTeacher
                                      ? 'No Teacher Required'
                                      : p.teacherName
                                  }
                                  disabled={Boolean(
                                    matchedActivity && !matchedActivity.requiresTeacher
                                  )}
                                  onChange={(e) => {
                                    const next = [...draftPeriods];
                                    next[idx] = { ...next[idx], teacherName: e.target.value };
                                    setDraftPeriods(next);
                                  }}
                                  className={`w-full px-2.5 py-1.5 rounded-lg border text-xs disabled:opacity-60 ${
                                    clashWith
                                      ? 'bg-amber-50 border-amber-400 font-semibold text-amber-950'
                                      : 'bg-surface-container-low border-outline-variant/30'
                                  }`}
                                >
                                  <option value="No Teacher Required">No Teacher Required</option>
                                  <option value="Faculty Desk">Faculty Desk</option>
                                  <option value="Senior Faculty">Senior Faculty</option>
                                  {teachers.map((t) => (
                                    <option key={t.id} value={t.name}>
                                      {t.name}
                                    </option>
                                  ))}
                                  {p.teacherName &&
                                    p.teacherName !== 'No Teacher Required' &&
                                    p.teacherName !== 'Faculty Desk' &&
                                    p.teacherName !== 'Senior Faculty' &&
                                    !teachers.some((t) => t.name === p.teacherName) && (
                                      <option value={p.teacherName}>{p.teacherName}</option>
                                    )}
                                </select>
                                {clashWith && (
                                  <div className="text-[10px] font-bold text-amber-800 flex items-center gap-1">
                                    <span className="material-symbols-outlined text-[12px]">
                                      warning
                                    </span>
                                    Clash: Also in {clashWith}
                                  </div>
                                )}
                              </div>
                            )}
                          </td>
                          <td className="py-2.5 px-3">
                            <input
                              type="text"
                              disabled={Boolean(p.isBreak)}
                              placeholder="e.g. R-204"
                              value={p.room || ''}
                              onChange={(e) => {
                                const next = [...draftPeriods];
                                next[idx] = { ...next[idx], room: e.target.value };
                                setDraftPeriods(next);
                              }}
                              className={`w-24 px-2.5 py-1.5 rounded-lg border font-mono text-xs disabled:opacity-40 ${
                                singleRoomClash
                                  ? 'bg-rose-50 border-rose-400 text-rose-950 font-semibold'
                                  : 'bg-surface-container-low border-outline-variant/30'
                              }`}
                            />
                            {singleRoomClash && (
                              <div className="text-[10px] font-bold text-rose-800 mt-0.5">
                                Busy: {singleRoomClash}
                              </div>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-right whitespace-nowrap">
                            {!p.isBreak && (
                              <button
                                type="button"
                                onClick={() => {
                                  const initBlocks: ParallelRoutineSession[] =
                                    routineAvailableGroups.length > 0 && effectiveRoutineGroup === 'All'
                                      ? routineAvailableGroups.map((g, gi) => ({
                                          id: `ps-${idx}-${g}-${gi}`,
                                          subjectName: p.subjectName || '',
                                          teacherName: p.teacherName || 'Faculty Desk',
                                          room: p.room || '',
                                          targetGroups: [g],
                                        }))
                                      : [
                                          {
                                            id: `ps-${idx}-1`,
                                            subjectName: p.subjectName || '',
                                            teacherName: p.teacherName || 'Faculty Desk',
                                            room: p.room || '',
                                            targetGroups:
                                              effectiveRoutineGroup !== 'All'
                                                ? [effectiveRoutineGroup]
                                                : ['General'],
                                          },
                                          {
                                            id: `ps-${idx}-2`,
                                            subjectName: '',
                                            teacherName: 'Faculty Desk',
                                            room: '',
                                            targetGroups:
                                              effectiveRoutineGroup !== 'All'
                                                ? [effectiveRoutineGroup]
                                                : ['General'],
                                          },
                                        ];
                                  updatePeriodParallel(initBlocks);
                                }}
                                className="px-2.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-900 text-[11px] font-bold cursor-pointer"
                              >
                                Parallel Split
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={handleCopyDayToOtherWeekdays}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-surface-container-low hover:bg-surface-container border border-outline-variant/30 text-xs font-semibold text-on-surface cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[16px]">content_copy</span>
                  Copy {effectiveRoutineDay} to All {workingDays.length} Working Days
                </button>

                <button
                  type="button"
                  onClick={handleSaveRoutineDay}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary-container hover:bg-primary text-on-primary text-xs font-bold shadow-sm cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[18px]">save</span>
                  Save &amp; Publish {effectiveRoutineDay} Routine
                </button>
              </div>
            </>
          ) : (
            /* WEEKLY MATRIX OVERVIEW */
            <div className="overflow-x-auto border border-outline-variant/25 rounded-xl">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-surface-container-low text-on-surface-variant border-b border-outline-variant/25">
                    <th className="py-2.5 px-3 font-semibold">Day</th>
                    {(instituteRules.shiftPeriodTemplates[effectiveRoutineShift] || []).map((slot) => (
                      <th key={slot.id} className="py-2.5 px-3 font-semibold whitespace-nowrap">
                        <div>{slot.period}</div>
                        <div className="text-[10px] font-mono opacity-80">
                          {slot.startTime}–{slot.endTime}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/15">
                  {workingDays.map((day) => {
                    const row = classRoutines.find(
                      (r) =>
                        r.className === routineClass &&
                        (r.group || 'All') === effectiveRoutineGroup &&
                        r.sectionName === effectiveRoutineSection &&
                        r.shift === effectiveRoutineShift &&
                        r.day === day
                    );
                    const slots = instituteRules.shiftPeriodTemplates[effectiveRoutineShift] || [];
                    return (
                      <tr
                        key={day}
                        onClick={() => {
                          setRoutineDay(day);
                          loadRoutineSelection(
                            routineClass,
                            effectiveRoutineGroup,
                            effectiveRoutineSection,
                            effectiveRoutineShift,
                            day
                          );
                          setRoutineViewMode('editor');
                        }}
                        className="hover:bg-surface-container-low/60 cursor-pointer"
                      >
                        <td className="py-3 px-3 font-bold text-primary-container whitespace-nowrap">
                          {day}
                        </td>
                        {slots.map((slot, i) => {
                          const cell =
                            row?.periods.find((p) => p.period === slot.period) || row?.periods[i];
                          const parallelBlocks = cell ? getPeriodParallelSessions(cell) : [];
                          return (
                            <td key={slot.id} className="py-3 px-3 min-w-[155px] align-top">
                              {slot.isBreak ? (
                                <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-900 text-[10px] font-bold">
                                  {slot.label || 'Break'}
                                </span>
                              ) : parallelBlocks.length > 0 ? (
                                <div className="space-y-1">
                                  {parallelBlocks.map((pb) =>
                                    pb.subjectName ? (
                                      <div
                                        key={pb.id}
                                        className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-50 border border-indigo-100"
                                      >
                                        <span className="font-bold text-indigo-900">
                                          {pb.targetGroups?.length
                                            ? pb.targetGroups.map((g) => g.slice(0, 3)).join('+')
                                            : pb.religionFilter
                                            ? pb.religionFilter.slice(0, 3)
                                            : 'Opt'}
                                          :
                                        </span>{' '}
                                        <span className="font-semibold text-on-surface">
                                          {pb.subjectName}
                                        </span>
                                        {pb.room ? (
                                          <span className="text-[9px] text-on-surface-variant ml-1">
                                            ({pb.room})
                                          </span>
                                        ) : null}
                                      </div>
                                    ) : null
                                  )}
                                </div>
                              ) : cell?.subjectName ? (
                                <div>
                                  <div className="font-semibold text-on-surface">{cell.subjectName}</div>
                                  <div className="text-[10px] text-on-surface-variant">
                                    {cell.teacherName}
                                    {cell.room ? ` · ${cell.room}` : ''}
                                  </div>
                                </div>
                              ) : (
                                <span className="text-on-surface-variant/50">—</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ===================================================================== */}
      {/* SUB-TAB 4: ACADEMIC CALENDAR (WHOLE-YEAR PLANNER)                     */}
      {/* ===================================================================== */}
      {subTab === 'calendar' && (
        <div className="space-y-5">
          {/* Calendar KPI Strip */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="rounded-2xl bg-surface-container-lowest border border-outline-variant/25 p-4">
              <span className="text-[11px] uppercase font-bold text-on-surface-variant">
                Class / Term Schedules
              </span>
              <div className="text-2xl font-bold text-emerald-800 mt-1">{totalClassPlanEvents}</div>
              <span className="text-[11px] text-on-surface-variant">
                Working days: {workingDays.map((d) => d.slice(0, 3)).join(', ')}
              </span>
            </div>
            <div className="rounded-2xl bg-surface-container-lowest border border-outline-variant/25 p-4">
              <span className="text-[11px] uppercase font-bold text-on-surface-variant">
                Holiday &amp; Vacation Days
              </span>
              <div className="text-2xl font-bold text-rose-800 mt-1">{totalHolidayDays} day(s)</div>
              <span className="text-[11px] text-on-surface-variant">
                Excluding {instituteRules.weekendDays.join(' & ')}
              </span>
            </div>
            <div className="rounded-2xl bg-surface-container-lowest border border-outline-variant/25 p-4">
              <span className="text-[11px] uppercase font-bold text-on-surface-variant">
                Exam Windows
              </span>
              <div className="text-2xl font-bold text-amber-800 mt-1">{totalExamEvents}</div>
              <span className="text-[11px] text-on-surface-variant">Scheduled terms &amp; finals</span>
            </div>
            <div className="rounded-2xl bg-surface-container-lowest border border-outline-variant/25 p-4">
              <span className="text-[11px] uppercase font-bold text-on-surface-variant">
                Total Annual Plan Items
              </span>
              <div className="text-2xl font-bold text-primary-container mt-1">{events.length}</div>
              <span className="text-[11px] text-on-surface-variant">
                {formatInstituteSessionBanner(instituteRules)}
              </span>
            </div>
          </div>

          {/* Calendar Controls */}
          <div className="rounded-2xl bg-surface-container-lowest border border-outline-variant/25 p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-1.5">
              {(
                ['ALL', 'Class Days', 'Holiday', 'Exam', 'Important Event', 'Admission'] as const
              ).map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCalendarCategoryFilter(cat)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
                    calendarCategoryFilter === cat
                      ? 'bg-primary-container text-on-primary'
                      : 'bg-surface-container-low text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  {cat === 'ALL' ? 'All Events' : cat}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1 p-1 rounded-xl bg-surface-container-low border border-outline-variant/30">
                <button
                  type="button"
                  onClick={() => setCalendarView('list')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
                    calendarView === 'list' ? 'bg-white shadow-2xs text-on-surface' : 'text-on-surface-variant'
                  }`}
                >
                  Year List
                </button>
                <button
                  type="button"
                  onClick={() => setCalendarView('month')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
                    calendarView === 'month' ? 'bg-white shadow-2xs text-on-surface' : 'text-on-surface-variant'
                  }`}
                >
                  Month Grid
                </button>
              </div>

              <button
                type="button"
                onClick={() => openAddEvent()}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary-container hover:bg-primary text-on-primary text-xs font-bold shadow-xs cursor-pointer"
              >
                <span className="material-symbols-outlined text-[18px]">event_available</span>
                Add Calendar Event
              </button>
            </div>
          </div>

          {calendarView === 'list' ? (
            <div className="rounded-2xl bg-surface-container-lowest border border-outline-variant/25 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-surface-container-low text-on-surface-variant border-b border-outline-variant/25">
                      <th className="py-3 px-4 font-semibold">Date / Window</th>
                      <th className="py-3 px-4 font-semibold">Category</th>
                      <th className="py-3 px-4 font-semibold">Title &amp; Notes</th>
                      <th className="py-3 px-4 font-semibold">Location &amp; Time</th>
                      <th className="py-3 px-4 font-semibold">Visibility</th>
                      <th className="py-3 px-4 font-semibold text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant/15">
                    {filteredCalendarEvents.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="p-8 text-center text-on-surface-variant">
                          No calendar entries match this category filter.
                        </td>
                      </tr>
                    ) : (
                      filteredCalendarEvents.map((evt) => {
                        const cat: AcademicEventCategory =
                          evt.category ||
                          (evt.type === 'Exam'
                            ? 'Exam'
                            : evt.type === 'Holiday'
                            ? 'Holiday'
                            : evt.type === 'Class Days'
                            ? 'Class Days'
                            : 'Important Event');
                        const spanDays = getInclusiveDaySpan(evt.startDate, evt.endDate);
                        return (
                          <tr key={evt.id} className="hover:bg-surface-container-low/40">
                            <td className="py-3.5 px-4 whitespace-nowrap">
                              <div className="font-mono font-bold text-on-surface">
                                {evt.startDate || `${evt.day} ${evt.month}`}
                                {evt.endDate && evt.endDate !== evt.startDate
                                  ? ` → ${evt.endDate}`
                                  : ''}
                              </div>
                              <div className="text-[10px] text-on-surface-variant font-mono">
                                {spanDays} day(s)
                              </div>
                            </td>
                            <td className="py-3.5 px-4">
                              <span
                                className={`inline-block px-2.5 py-0.5 rounded-full border text-[11px] font-bold ${CATEGORY_BADGE_CLASSES[cat]}`}
                              >
                                {cat}
                              </span>
                            </td>
                            <td className="py-3.5 px-4 max-w-md">
                              <div className="font-bold text-on-surface">{evt.title}</div>
                              {evt.description && (
                                <div className="text-[11px] text-on-surface-variant line-clamp-2 mt-0.5">
                                  {evt.description}
                                </div>
                              )}
                            </td>
                            <td className="py-3.5 px-4 text-on-surface-variant">
                              <div className="font-medium text-on-surface">{evt.location}</div>
                              <div className="text-[11px] font-mono">{evt.time}</div>
                            </td>
                            <td className="py-3.5 px-4">
                              <div className="flex flex-col items-start gap-1">
                                <span className="px-2 py-0.5 rounded bg-surface-container text-[11px] font-semibold">
                                  {evt.visibility || 'Public & Portals'}
                                </span>
                                {evt.targetWing && evt.targetWing !== 'All' && (
                                  <span className="px-2 py-0.5 rounded bg-indigo-50 text-indigo-900 border border-indigo-200 text-[10px] font-bold">
                                    {evt.targetWing}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="py-3.5 px-4 text-right whitespace-nowrap">
                              <button
                                type="button"
                                onClick={() => openEditEvent(evt)}
                                className="p-1.5 rounded-lg text-primary-container hover:bg-surface-container cursor-pointer"
                                title="Edit Event"
                              >
                                <span className="material-symbols-outlined text-[16px]">edit</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  deleteAcademicEvent(evt.id);
                                  showToast(`Removed "${evt.title}" from Academic Calendar.`);
                                }}
                                className="p-1.5 rounded-lg text-error hover:bg-error-container/20 cursor-pointer"
                                title="Delete Event"
                              >
                                <span className="material-symbols-outlined text-[16px]">delete</span>
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            /* MONTH GRID CALENDAR VIEW */
            <div className="rounded-2xl bg-surface-container-lowest border border-outline-variant/25 p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (calendarMonthIdx === 0) {
                        setCalendarMonthIdx(11);
                        setCalendarYear((y) => y - 1);
                      } else {
                        setCalendarMonthIdx((m) => m - 1);
                      }
                    }}
                    className="p-2 rounded-lg bg-surface-container-low hover:bg-surface-container cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[18px]">chevron_left</span>
                  </button>
                  <h3 className="text-base font-bold text-on-surface min-w-[140px] text-center">
                    {new Date(calendarYear, calendarMonthIdx, 1).toLocaleDateString('en-US', {
                      month: 'long',
                      year: 'numeric',
                    })}
                  </h3>
                  <button
                    type="button"
                    onClick={() => {
                      if (calendarMonthIdx === 11) {
                        setCalendarMonthIdx(0);
                        setCalendarYear((y) => y + 1);
                      } else {
                        setCalendarMonthIdx((m) => m + 1);
                      }
                    }}
                    className="p-2 rounded-lg bg-surface-container-low hover:bg-surface-container cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[18px]">chevron_right</span>
                  </button>
                </div>
                <span className="text-xs text-on-surface-variant">
                  Click any day cell to add an event on that date.
                </span>
              </div>

              <div className="grid grid-cols-7 gap-2 text-xs">
                {ALL_WEEKDAYS.map((wd) => {
                  const isWeekend = instituteRules.weekendDays.includes(wd);
                  return (
                    <div
                      key={wd}
                      className={`py-2 text-center font-bold rounded-lg ${
                        isWeekend
                          ? 'bg-rose-50 text-rose-800'
                          : 'bg-surface-container-low text-on-surface-variant'
                      }`}
                    >
                      {wd.slice(0, 3)}
                      {isWeekend ? ' (Off)' : ''}
                    </div>
                  );
                })}

                {Array.from({ length: firstDayOffset }).map((_, i) => (
                  <div key={`pad-${i}`} className="min-h-[84px] rounded-xl bg-surface-container-low/30" />
                ))}

                {Array.from({ length: daysInCalendarMonth }).map((_, idx) => {
                  const dayNum = idx + 1;
                  const isoDate = `${monthPrefix}-${String(dayNum).padStart(2, '0')}`;
                  const dayName = ALL_WEEKDAYS[new Date(calendarYear, calendarMonthIdx, dayNum).getDay()];
                  const isWeekend = instituteRules.weekendDays.includes(dayName);
                  const dayEvents = filteredCalendarEvents.filter((e) => {
                    if (!e.startDate) return false;
                    const end = e.endDate || e.startDate;
                    return isoDate >= e.startDate && isoDate <= end;
                  });
                  return (
                    <div
                      key={isoDate}
                      onClick={() => openAddEvent(isoDate)}
                      className={`min-h-[88px] rounded-xl border p-2 flex flex-col gap-1 cursor-pointer transition-colors ${
                        isWeekend
                          ? 'bg-rose-50/40 border-rose-200/60 hover:bg-rose-50'
                          : 'bg-white border-outline-variant/25 hover:border-primary-container/50'
                      }`}
                    >
                      <span className="text-[11px] font-mono font-bold text-on-surface-variant">
                        {dayNum}
                      </span>
                      <div className="space-y-1">
                        {dayEvents.slice(0, 2).map((de) => {
                          const cat: AcademicEventCategory = de.category || 'Important Event';
                          return (
                            <button
                              key={de.id}
                              type="button"
                              onClick={(ev) => {
                                ev.stopPropagation();
                                openEditEvent(de);
                              }}
                              className={`w-full text-left px-1.5 py-0.5 rounded text-[10px] font-semibold truncate border cursor-pointer ${CATEGORY_BADGE_CLASSES[cat]}`}
                            >
                              {de.title}
                            </button>
                          );
                        })}
                        {dayEvents.length > 2 && (
                          <span className="text-[10px] font-bold text-primary-container block">
                            +{dayEvents.length - 2} more
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ===================================================================== */}
      {/* SUB-TAB 5: INSTITUTE RULES, WORKING DAYS & SHIFT BELL TIMINGS         */}
      {/* ===================================================================== */}
      {subTab === 'rules' && (
        <form onSubmit={handleSaveRules} className="space-y-6 text-xs">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Academic Session & Policy Rules */}
            <div className="rounded-2xl bg-surface-container-lowest border border-outline-variant/25 p-6 space-y-4">
              <h2 className="text-base font-bold text-on-surface border-b border-outline-variant/20 pb-3">
                Academic Wings, Sessions &amp; Operational Policies
              </h2>

              {/* Institute Wing Activation Checkboxes */}
              <div className="p-3.5 rounded-xl bg-surface-container-low border border-outline-variant/25 space-y-2">
                <span className="block font-bold text-on-surface">
                  Enabled Institute Wings
                </span>
                <p className="text-[11px] text-on-surface-variant">
                  Select which divisions your institution operates. Unchecked wings hide irrelevant session fields, classes, and admission options automatically.
                </p>
                <div className="flex flex-wrap gap-4 pt-1">
                  <label className="inline-flex items-center gap-2 cursor-pointer font-semibold">
                    <input
                      type="checkbox"
                      checked={rulesDraft.enabledWings?.school ?? true}
                      onChange={(e) => {
                        const nextSchool = e.target.checked;
                        const curCollege = rulesDraft.enabledWings?.college ?? true;
                        if (!nextSchool && !curCollege) return;
                        setRulesDraft({
                          ...rulesDraft,
                          enabledWings: { school: nextSchool, college: curCollege },
                        });
                      }}
                    />
                    <span>School Wing (Class 1–10 / SSC)</span>
                  </label>
                  <label className="inline-flex items-center gap-2 cursor-pointer font-semibold">
                    <input
                      type="checkbox"
                      checked={rulesDraft.enabledWings?.college ?? true}
                      onChange={(e) => {
                        const nextCollege = e.target.checked;
                        const curSchool = rulesDraft.enabledWings?.school ?? true;
                        if (!nextCollege && !curSchool) return;
                        setRulesDraft({
                          ...rulesDraft,
                          enabledWings: { school: curSchool, college: nextCollege },
                        });
                      }}
                    />
                    <span>College Wing (Class 11–12 / HSC)</span>
                  </label>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4">
                {(rulesDraft.enabledWings?.school ?? true) && (
                  <div>
                    <label className="block font-semibold text-on-surface-variant mb-1">
                      Default School Year (Class 1–10)
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={rulesDraft.activeAcademicYear}
                        onChange={(e) =>
                          setRulesDraft({ ...rulesDraft, activeAcademicYear: e.target.value })
                        }
                        placeholder="e.g. 2025"
                        className="w-full px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 font-mono font-bold text-sm"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          syncSchoolAcademicYearToClasses(rulesDraft.activeAcademicYear);
                          showToast(
                            `Synced Academic Year "${rulesDraft.activeAcademicYear}" to all school classes.`
                          );
                        }}
                        className="px-3 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-900 font-bold whitespace-nowrap cursor-pointer"
                        title="Apply to all Academic Year classes (Class 1–10)"
                      >
                        Sync 1–10
                      </button>
                    </div>
                  </div>
                )}

                {(rulesDraft.enabledWings?.college ?? true) && (
                  <div className="p-3.5 rounded-xl bg-surface-container-low border border-outline-variant/25 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-on-surface">
                        College / HSC Running Sessions (Separate Year Cohorts)
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          const y1 = rulesDraft.hscYear1Session || rulesDraft.activeCollegeSession || '2025–2026';
                          const y2 = rulesDraft.hscYear2Session || '2024–2025';
                          syncCollegeSessionsToClasses(y1, y2);
                          showToast(`Synced Class 11 (${y1}) and Class 12 (${y2}) HSC sessions.`);
                        }}
                        className="px-2.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-900 font-bold whitespace-nowrap cursor-pointer"
                      >
                        Sync XI &amp; XII
                      </button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block font-semibold text-on-surface-variant mb-1">
                          Class 11 Session (HSC 1st Year)
                        </label>
                        <input
                          type="text"
                          value={rulesDraft.hscYear1Session ?? rulesDraft.activeCollegeSession}
                          onChange={(e) =>
                            setRulesDraft({
                              ...rulesDraft,
                              hscYear1Session: e.target.value,
                              activeCollegeSession: e.target.value,
                            })
                          }
                          placeholder="e.g. 2025–2026"
                          className="w-full px-3 py-2 rounded-xl bg-white border border-outline-variant/30 font-mono font-bold text-sm"
                        />
                      </div>
                      <div>
                        <label className="block font-semibold text-on-surface-variant mb-1">
                          Class 12 Session (HSC 2nd Year)
                        </label>
                        <input
                          type="text"
                          value={rulesDraft.hscYear2Session ?? '2024–2025'}
                          onChange={(e) =>
                            setRulesDraft({
                              ...rulesDraft,
                              hscYear2Session: e.target.value,
                            })
                          }
                          placeholder="e.g. 2024–2025"
                          className="w-full px-3 py-2 rounded-xl bg-white border border-outline-variant/30 font-mono font-bold text-sm"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label className="block font-semibold text-on-surface-variant mb-1">
                  Active Campus Shifts
                </label>
                <div className="flex gap-4 pt-1">
                  {(['Morning', 'Day'] as const).map((shf) => (
                    <label key={shf} className="inline-flex items-center gap-1.5 cursor-pointer font-semibold">
                      <input
                        type="checkbox"
                        checked={rulesDraft.enabledShifts.includes(shf)}
                        onChange={() => toggleEnabledShift(shf)}
                      />
                      <span>{shf} Shift</span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="block font-semibold text-on-surface-variant mb-2">
                  Weekly Working Class Days (Unchecked = Weekend Holidays)
                </label>
                <div className="flex flex-wrap gap-2">
                  {ALL_WEEKDAYS.map((day) => {
                    const active = rulesDraft.workingDays.includes(day);
                    return (
                      <button
                        key={day}
                        type="button"
                        onClick={() => toggleWorkingDay(day)}
                        className={`px-3 py-1.5 rounded-lg font-bold border cursor-pointer transition-colors ${
                          active
                            ? 'bg-emerald-100 border-emerald-300 text-emerald-950'
                            : 'bg-rose-50 border-rose-200 text-rose-800'
                        }`}
                      >
                        {day.slice(0, 3)} {active ? '• Open' : '• Off'}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="block font-semibold text-on-surface-variant mb-1">
                    Minimum Attendance %
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={rulesDraft.minAttendancePercent}
                    onChange={(e) =>
                      setRulesDraft({
                        ...rulesDraft,
                        minAttendancePercent: Number(e.target.value),
                      })
                    }
                    className="w-full px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-on-surface-variant mb-1">
                    Standard Pass Mark %
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={rulesDraft.passThresholdPercent}
                    onChange={(e) =>
                      setRulesDraft({
                        ...rulesDraft,
                        passThresholdPercent: Number(e.target.value),
                      })
                    }
                    className="w-full px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 font-mono font-bold"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-2 pt-1">
                <label className="inline-flex items-center gap-2 cursor-pointer font-semibold">
                  <input
                    type="checkbox"
                    checked={rulesDraft.enableFourthSubjectBonus}
                    onChange={(e) =>
                      setRulesDraft({
                        ...rulesDraft,
                        enableFourthSubjectBonus: e.target.checked,
                      })
                    }
                  />
                  <span>Enable NCTB 4th Subject Bonus GPA (GP − 2.00)</span>
                </label>
                <label className="inline-flex items-center gap-2 cursor-pointer font-semibold">
                  <input
                    type="checkbox"
                    checked={rulesDraft.componentWisePassRequired}
                    onChange={(e) =>
                      setRulesDraft({
                        ...rulesDraft,
                        componentWisePassRequired: e.target.checked,
                      })
                    }
                  />
                  <span>Require Independent CQ, MCQ &amp; Practical Pass</span>
                </label>
                <label className="inline-flex items-center gap-2 cursor-pointer font-semibold">
                  <input
                    type="checkbox"
                    checked={rulesDraft.combinePairedPapersInResult ?? true}
                    onChange={(e) =>
                      setRulesDraft({
                        ...rulesDraft,
                        combinePairedPapersInResult: e.target.checked,
                      })
                    }
                  />
                  <span>
                    Combine Paired 1st &amp; 2nd Papers in Result &amp; GPA (e.g. Bangla 101+102, English 107+108 = 200 Marks)
                  </span>
                </label>
              </div>

              <div>
                <label className="block font-semibold text-on-surface-variant mb-1">
                  Promotion &amp; Code of Conduct Note
                </label>
                <textarea
                  rows={3}
                  value={rulesDraft.promotionPolicyNote}
                  onChange={(e) =>
                    setRulesDraft({ ...rulesDraft, promotionPolicyNote: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 leading-relaxed"
                />
              </div>
            </div>

            {/* Master Period & Tiffin Break Bell Templates */}
            <div className="rounded-2xl bg-surface-container-lowest border border-outline-variant/25 p-6 space-y-5">
              <div>
                <h2 className="text-base font-bold text-on-surface">
                  Master Period &amp; Break Bell Timings
                </h2>
                <p className="text-on-surface-variant mt-0.5">
                  Configure period slots once per shift. Class Routine Builder and the public Academics timetable read directly from these slots.
                </p>
              </div>

              {rulesDraft.enabledShifts.map((shf) => (
                <div
                  key={shf}
                  className="p-4 rounded-xl bg-surface-container-low border border-outline-variant/25 space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-sm text-primary-container">{shf} Shift Slots</h3>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => addTemplateSlot(shf, false)}
                        className="px-2.5 py-1 rounded-lg bg-white border border-outline-variant/30 font-semibold cursor-pointer"
                      >
                        + Period
                      </button>
                      <button
                        type="button"
                        onClick={() => addTemplateSlot(shf, true)}
                        className="px-2.5 py-1 rounded-lg bg-amber-100 text-amber-900 font-semibold cursor-pointer"
                      >
                        + Tiffin / Break
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="grid grid-cols-12 gap-2 px-2 text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant">
                      <span className="col-span-2">Period</span>
                      <span className="col-span-3">Start (AM/PM)</span>
                      <span className="col-span-3">End (AM/PM)</span>
                      <span className="col-span-3">Label</span>
                      <span className="col-span-1 text-center">Del</span>
                    </div>
                    {(rulesDraft.shiftPeriodTemplates[shf] || []).map((slot, idx) => {
                      const start24 = toTimeInput24h(slot.startTime);
                      const end24 = toTimeInput24h(slot.endTime);
                      const reversed = Boolean(start24 && end24 && end24 <= start24);
                      return (
                        <div key={slot.id} className="space-y-1">
                          <div className="grid grid-cols-12 gap-2 items-center bg-white p-2 rounded-lg border border-outline-variant/20">
                            <input
                              type="text"
                              value={slot.period}
                              onChange={(e) =>
                                updateTemplateSlot(shf, idx, { period: e.target.value })
                              }
                              className="col-span-2 px-2 py-1.5 rounded bg-surface-container-low border border-outline-variant/25 font-mono font-bold"
                              placeholder="1st"
                            />
                            <div className="col-span-3 space-y-0.5">
                              <input
                                type="time"
                                value={start24}
                                onChange={(e) =>
                                  updateTemplateSlot(shf, idx, {
                                    startTime: formatTime12h(e.target.value),
                                  })
                                }
                                className="w-full px-2 py-1 rounded bg-surface-container-low border border-outline-variant/25 font-mono text-[11px]"
                              />
                              <span className="block text-[10px] font-mono font-semibold text-primary-container px-1">
                                {formatTime12h(slot.startTime)}
                              </span>
                            </div>
                            <div className="col-span-3 space-y-0.5">
                              <input
                                type="time"
                                value={end24}
                                onChange={(e) =>
                                  updateTemplateSlot(shf, idx, {
                                    endTime: formatTime12h(e.target.value),
                                  })
                                }
                                className="w-full px-2 py-1 rounded bg-surface-container-low border border-outline-variant/25 font-mono text-[11px]"
                              />
                              <span className="block text-[10px] font-mono font-semibold text-primary-container px-1">
                                {formatTime12h(slot.endTime)}
                              </span>
                            </div>
                            <input
                              type="text"
                              value={slot.label || ''}
                              onChange={(e) =>
                                updateTemplateSlot(shf, idx, { label: e.target.value })
                              }
                              className="col-span-3 px-2 py-1.5 rounded bg-surface-container-low border border-outline-variant/25"
                              placeholder={slot.isBreak ? 'Tiffin Break' : 'Period Label'}
                            />
                            <button
                              type="button"
                              onClick={() => removeTemplateSlot(shf, idx)}
                              className="col-span-1 text-error hover:bg-error-container/20 p-1 rounded cursor-pointer flex justify-center"
                              title="Remove slot"
                            >
                              <span className="material-symbols-outlined text-[15px]">close</span>
                            </button>
                          </div>
                          {reversed && (
                            <p className="text-[10px] text-rose-700 font-semibold px-2">
                              End time ({formatTime12h(slot.endTime)}) should be after start time ({formatTime12h(slot.startTime)}).
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Campus Routine Activities & Rules Manager */}
          <div className="rounded-2xl bg-surface-container-lowest border border-outline-variant/25 p-6 space-y-4">
            <div>
              <h2 className="text-base font-bold text-on-surface">
                Campus Routine Activities &amp; Period Rules
              </h2>
              <p className="text-on-surface-variant mt-0.5">
                Configure non-subject periods available in the Class Routine Builder (e.g., Library Period, Assembly, Lab Practical, Co-Curricular Club). Activities marked &ldquo;No Teacher&rdquo; bypass teacher double-booking clash checks.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {(rulesDraft.routineActivities || []).map((act) => (
                <div
                  key={act.id}
                  className="flex items-center justify-between gap-2 p-3 rounded-xl bg-surface-container-low border border-outline-variant/25"
                >
                  <div className="min-w-0">
                    <div className="font-bold text-on-surface truncate">{act.name}</div>
                    <div className="flex flex-wrap items-center gap-1.5 mt-1">
                      {act.defaultRoom && (
                        <span className="px-1.5 py-0.5 rounded bg-white border border-outline-variant/25 font-mono text-[10px]">
                          Room: {act.defaultRoom}
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => handleToggleActivityTeacherRule(act.id, false)}
                        className={`px-1.5 py-0.5 rounded text-[10px] font-bold cursor-pointer ${
                          act.requiresTeacher
                            ? 'bg-sky-100 text-sky-900'
                            : 'bg-emerald-100 text-emerald-900'
                        }`}
                      >
                        {act.requiresTeacher ? 'Teacher Assigned' : 'No Teacher Required'}
                      </button>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemoveActivity(act.id, false)}
                    className="p-1.5 rounded-lg text-error hover:bg-error-container/20 cursor-pointer shrink-0"
                    title="Remove activity"
                  >
                    <span className="material-symbols-outlined text-[16px]">delete</span>
                  </button>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 pt-2 border-t border-outline-variant/20 items-end">
              <div className="sm:col-span-5">
                <label className="block font-semibold text-on-surface-variant mb-1">
                  New Activity Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Debate & Language Club"
                  value={newActName}
                  onChange={(e) => setNewActName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30"
                />
              </div>
              <div className="sm:col-span-3">
                <label className="block font-semibold text-on-surface-variant mb-1">
                  Default Room (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Auditorium"
                  value={newActRoom}
                  onChange={(e) => setNewActRoom(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 font-mono"
                />
              </div>
              <div className="sm:col-span-2 flex items-center pb-2">
                <label className="inline-flex items-center gap-1.5 cursor-pointer font-semibold">
                  <input
                    type="checkbox"
                    checked={newActRequiresTeacher}
                    onChange={(e) => setNewActRequiresTeacher(e.target.checked)}
                  />
                  <span>Needs Teacher</span>
                </label>
              </div>
              <div className="sm:col-span-2">
                <button
                  type="button"
                  onClick={() => handleAddActivityToDraft(false)}
                  className="w-full px-3 py-2 rounded-xl bg-secondary text-on-secondary font-bold cursor-pointer"
                >
                  + Add Activity
                </button>
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-primary-container hover:bg-primary text-on-primary font-bold shadow-sm cursor-pointer"
            >
              <span className="material-symbols-outlined text-[18px]">save</span>
              Save All Institute Rules &amp; Timings
            </button>
          </div>
        </form>
      )}

      {/* ===================================================================== */}
      {/* MODAL: CREATE / EDIT CLASS (UNIQUE GUARD + OPTIONAL SECTIONS/GROUPS)  */}
      {/* ===================================================================== */}
      {showClassModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-surface-container-lowest rounded-3xl p-6 sm:p-8 max-w-lg w-full shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-outline-variant/20 pb-3">
              <h3 className="text-base font-bold text-on-surface">
                {editingClass ? `Edit ${editingClass.name}` : 'Create Academic Class'}
              </h3>
              <button
                type="button"
                onClick={() => setShowClassModal(false)}
                className="p-1.5 rounded-full hover:bg-surface-container cursor-pointer"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            {classFormError && (
              <div className="p-3 rounded-xl bg-error-container text-on-error-container text-xs font-semibold">
                {classFormError}
              </div>
            )}

            <form onSubmit={handleSaveClass} className="space-y-4 text-xs">
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="block font-semibold text-on-surface-variant mb-1">
                    Unique Class Name *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Class 8 or Grade 10"
                    value={clsName}
                    onChange={(e) => {
                      setClsName(e.target.value);
                      setClassFormError(null);
                    }}
                    className="w-full px-3.5 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 text-sm"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-on-surface-variant mb-1">
                    Sort Order
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={clsOrder}
                    onChange={(e) => setClsOrder(parseInt(e.target.value, 10))}
                    className="w-full px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 text-sm font-mono font-bold"
                  />
                </div>
              </div>

              {duplicateClassMatch && (
                <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 flex items-center justify-between gap-2">
                  <span className="font-semibold">
                    &ldquo;{duplicateClassMatch.name}&rdquo; already exists in your institute.
                  </span>
                  <button
                    type="button"
                    onClick={() => openEditClass(duplicateClassMatch)}
                    className="px-3 py-1 rounded-lg bg-amber-900 text-white font-bold shrink-0 cursor-pointer"
                  >
                    Edit Existing
                  </button>
                </div>
              )}

              {editingClass && editingClass.name !== clsName.trim() && clsName.trim() && !duplicateClassMatch && (
                <div className="p-2.5 rounded-xl bg-sky-50 border border-sky-200 text-sky-900 font-medium">
                  Renaming will automatically update all linked students, subjects, routines, invoices, and exam records.
                </div>
              )}

              {/* Optional Groups Toggle */}
              <div className="p-3.5 rounded-xl bg-surface-container-low border border-outline-variant/25 space-y-2">
                <label className="inline-flex items-center gap-2 font-bold text-on-surface cursor-pointer">
                  <input
                    type="checkbox"
                    checked={clsHasGroups}
                    onChange={(e) => setClsHasGroups(e.target.checked)}
                  />
                  <span>This class uses Academic Groups (Science / Business / Humanities)</span>
                </label>
                {clsHasGroups ? (
                  <div className="flex flex-wrap gap-3 pt-1">
                    {(['Science', 'Business Studies', 'Humanities', 'General'] as const).map((grp) => (
                      <label key={grp} className="inline-flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={clsGroups.includes(grp)}
                          onChange={(e) => {
                            if (e.target.checked) setClsGroups([...clsGroups, grp]);
                            else setClsGroups(clsGroups.filter((x) => x !== grp));
                          }}
                        />
                        <span>{grp}</span>
                      </label>
                    ))}
                  </div>
                ) : (
                  <p className="text-[11px] text-on-surface-variant">
                    Junior/Primary class: automatically uses <strong>General</strong> track only (hides Science/Humanities clutter in Admissions &amp; Students).
                  </p>
                )}
              </div>

              {/* Section Architecture (Shared vs Per-Group Sections) */}
              <div className="p-3.5 rounded-xl bg-surface-container-low border border-outline-variant/25 space-y-3">
                {clsHasGroups ? (
                  <>
                    <div>
                      <span className="block font-bold text-on-surface mb-1.5">
                        Section Architecture for Groups
                      </span>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => setClsSectionMode('shared')}
                          className={`px-3 py-2 rounded-xl border text-left cursor-pointer ${
                            clsSectionMode === 'shared'
                              ? 'bg-primary-container text-on-primary border-primary-container font-bold'
                              : 'bg-white text-on-surface border-outline-variant/30'
                          }`}
                        >
                          <div className="font-bold">Shared Sections</div>
                          <div className="text-[10px] opacity-80">e.g. Mixed Sec A, B or None</div>
                        </button>
                        <button
                          type="button"
                          onClick={() => setClsSectionMode('per-group')}
                          className={`px-3 py-2 rounded-xl border text-left cursor-pointer ${
                            clsSectionMode === 'per-group'
                              ? 'bg-primary-container text-on-primary border-primary-container font-bold'
                              : 'bg-white text-on-surface border-outline-variant/30'
                          }`}
                        >
                          <div className="font-bold">Per-Group Sections</div>
                          <div className="text-[10px] opacity-80">e.g. Science (A, B) · Humanities (Combined)</div>
                        </button>
                      </div>
                    </div>

                    {clsSectionMode === 'per-group' ? (
                      <div className="space-y-2 pt-1">
                        <p className="text-[11px] text-on-surface-variant">
                          Enter comma-separated section names per group (or leave blank for single-batch <strong>Group (Combined)</strong>):
                        </p>
                        {(clsGroups.filter((g) => g !== 'General').length
                          ? clsGroups.filter((g) => g !== 'General')
                          : (['Science', 'Business Studies', 'Humanities'] as AcademicGroup[])
                        ).map((grp) => {
                          const raw = clsGroupSectionsText[grp] || '';
                          const previewList = raw
                            .split(',')
                            .map((s) => s.trim())
                            .filter(Boolean);
                          return (
                            <div key={grp} className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center bg-white p-2 rounded-xl border border-outline-variant/25">
                              <span className="sm:col-span-4 font-bold text-on-surface">{grp}</span>
                              <input
                                type="text"
                                value={raw}
                                onChange={(e) =>
                                  setClsGroupSectionsText({
                                    ...clsGroupSectionsText,
                                    [grp]: e.target.value,
                                  })
                                }
                                placeholder="Leave blank for Combined, or A, B"
                                className="sm:col-span-5 px-2.5 py-1.5 rounded-lg bg-surface-container-low border border-outline-variant/25 font-mono text-xs"
                              />
                              <span className="sm:col-span-3 text-[10px] font-semibold text-primary-container text-right truncate">
                                {previewList.length === 0
                                  ? `${grp} (Combined)`
                                  : previewList.map((s) => `${grp} (${s})`).join(', ')}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="space-y-2 pt-1">
                        <label className="inline-flex items-center gap-2 font-bold text-on-surface cursor-pointer">
                          <input
                            type="checkbox"
                            checked={clsHasSections}
                            onChange={(e) => setClsHasSections(e.target.checked)}
                          />
                          <span>This class uses Sections (A, B, C...)</span>
                        </label>
                        {clsHasSections ? (
                          <input
                            type="text"
                            value={clsSectionsText}
                            onChange={(e) => setClsSectionsText(e.target.value)}
                            placeholder="A, B, C"
                            className="w-full px-3 py-2 rounded-lg bg-white border border-outline-variant/30 text-sm font-mono"
                          />
                        ) : (
                          <p className="text-[11px] text-on-surface-variant">
                            Combined single batch across sections (e.g. Science (Combined)).
                          </p>
                        )}
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <label className="inline-flex items-center gap-2 font-bold text-on-surface cursor-pointer">
                      <input
                        type="checkbox"
                        checked={clsHasSections}
                        onChange={(e) => setClsHasSections(e.target.checked)}
                      />
                      <span>This class uses Sections (A, B, C...)</span>
                    </label>
                    {clsHasSections ? (
                      <input
                        type="text"
                        value={clsSectionsText}
                        onChange={(e) => setClsSectionsText(e.target.value)}
                        placeholder="A, B, C"
                        className="w-full px-3 py-2 rounded-lg bg-white border border-outline-variant/30 text-sm font-mono"
                      />
                    ) : (
                      <p className="text-[11px] text-on-surface-variant">
                        Single combined class (stored cleanly as &ldquo;Common&rdquo; without Section A/B splits).
                      </p>
                    )}
                  </>
                )}
              </div>

              <div>
                <label className="block font-semibold text-on-surface-variant mb-1.5">
                  Active Shifts for This Class
                </label>
                <div className="flex gap-4">
                  {(['Morning', 'Day'] as const).map((shf) => (
                    <label key={shf} className="inline-flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={clsShifts.includes(shf)}
                        onChange={(e) => {
                          if (e.target.checked) setClsShifts([...clsShifts, shf]);
                          else setClsShifts(clsShifts.filter((x) => x !== shf));
                        }}
                      />
                      <span>{shf}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-surface-container-low border border-outline-variant/25 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-on-surface-variant mb-1">
                      Academic Cycle Type
                    </label>
                    <select
                      value={clsCycleType}
                      onChange={(e) => {
                        const nextType = e.target.value as ClassCycleType;
                        setClsCycleType(nextType);
                        setClsActiveCycle(
                          nextType === 'Academic Session'
                            ? instituteRules.activeCollegeSession || '2025–2026'
                            : instituteRules.activeAcademicYear || '2025'
                        );
                      }}
                      className="w-full px-3 py-2 rounded-lg bg-white border border-outline-variant/30 text-xs font-semibold"
                    >
                      <option value="Academic Year">Academic Year (Class 1–10)</option>
                      <option value="Academic Session">Academic Session (Class 11–12 HSC)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block font-semibold text-on-surface-variant mb-1">
                      Active {clsCycleType === 'Academic Session' ? 'Session' : 'Year'} Label
                    </label>
                    <input
                      type="text"
                      required
                      value={clsActiveCycle}
                      onChange={(e) => setClsActiveCycle(e.target.value)}
                      placeholder={
                        clsCycleType === 'Academic Session' ? 'e.g. 2025–2026' : 'e.g. 2025'
                      }
                      className="w-full px-3 py-2 rounded-lg bg-white border border-outline-variant/30 text-xs font-mono font-bold"
                    />
                  </div>
                </div>
                <p className="text-[11px] text-on-surface-variant">
                  Classes 1–10 typically follow a calendar Academic Year (2025), while Class 11 &amp; Class 12 track two-year HSC Academic Sessions independently (e.g. 2025–2026 and 2024–2025). Tuition &amp; fee rules are managed separately in Billing.
                </p>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowClassModal(false)}
                  className="px-4 py-2 rounded-xl text-on-surface-variant hover:bg-surface-container cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={Boolean(duplicateClassMatch)}
                  className="px-5 py-2 rounded-xl bg-primary-container text-on-primary font-bold cursor-pointer disabled:opacity-50"
                >
                  {editingClass ? 'Save Changes' : 'Create Class'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL: CREATE / EDIT CLASS-WISE SUBJECT                               */}
      {/* ===================================================================== */}
      {showSubjectModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-surface-container-lowest rounded-2xl p-6 sm:p-7 max-w-2xl w-full shadow-2xl border border-outline-variant/25 space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-outline-variant/20 pb-3">
              <h3 className="text-base font-bold text-on-surface">
                {editingSubject ? `Edit ${editingSubject.name}` : `Add Subject to ${subClassLevel}`}
              </h3>
              <button
                type="button"
                onClick={() => setShowSubjectModal(false)}
                className="p-1.5 rounded-full hover:bg-surface-container cursor-pointer"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            {subjectError && (
              <div className="p-3 rounded-xl bg-error-container text-on-error-container text-xs font-semibold">
                {subjectError}
              </div>
            )}

            <form onSubmit={handleSaveSubject} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-6 gap-3">
                <div className="sm:col-span-1">
                  <label className="block font-semibold text-on-surface-variant mb-1">
                    Order *
                  </label>
                  <input
                    type="number"
                    min={1}
                    required
                    value={subOrder}
                    onChange={(e) => setSubOrder(Math.max(1, Number(e.target.value) || 1))}
                    className="w-full px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 font-mono tabular-nums text-center"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block font-semibold text-on-surface-variant mb-1">
                    Subject Code *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 154"
                    value={subCode}
                    onChange={(e) => setSubCode(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 font-mono"
                  />
                </div>
                <div className="sm:col-span-3">
                  <label className="block font-semibold text-on-surface-variant mb-1">
                    Assigned Class *
                  </label>
                  <select
                    value={subClassLevel}
                    onChange={(e) => {
                      const nextCls = e.target.value;
                      setSubClassLevel(nextCls);
                      const clsObj = academicClasses.find((c) => c.name === nextCls);
                      if (clsObj?.hasGroups === false) setSubGroup('General');
                    }}
                    className="w-full px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 font-semibold"
                  >
                    {academicClasses.map((c) => (
                      <option key={c.id} value={c.name}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="block font-semibold text-on-surface-variant mb-1">
                    Subject Name *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Information & Communication Technology"
                    value={subName}
                    onChange={(e) => setSubName(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-on-surface-variant mb-1">
                    Bangla Title (Optional)
                  </label>
                  <input
                    type="text"
                    value={subBangla}
                    onChange={(e) => setSubBangla(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-on-surface-variant mb-1">
                    Gender Eligibility
                  </label>
                  <select
                    value={subGenderRestriction}
                    onChange={(e) =>
                      setSubGenderRestriction(e.target.value as SubjectGenderRestriction)
                    }
                    className="w-full px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 font-semibold"
                  >
                    <option value="All">All Students (Male &amp; Female)</option>
                    <option value="Female">Female Only (e.g. Home Science 151/273)</option>
                  </select>
                </div>

                <div className="col-span-2 p-3 rounded-xl bg-surface-container-low border border-outline-variant/25 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="font-semibold text-on-surface-variant">
                      Applicable Academic Groups (Multi-Group Supported)
                    </label>
                    <span className="text-[10px] font-mono text-primary-container">
                      {subApplicableGroups.includes('General')
                        ? 'General (All Groups)'
                        : subApplicableGroups.join(' + ') || 'Select group'}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {ALL_GROUPS.map((g) => {
                      const checked = subApplicableGroups.includes(g);
                      return (
                        <button
                          key={g}
                          type="button"
                          onClick={() => {
                            if (g === 'General') {
                              setSubApplicableGroups(['General']);
                              setSubGroup('General');
                            } else {
                              const withoutGen = subApplicableGroups.filter(
                                (item) => item !== 'General'
                              );
                              const nextList = checked
                                ? withoutGen.filter((item) => item !== g)
                                : [...withoutGen, g];
                              const safe = nextList.length > 0 ? nextList : ['General' as AcademicGroup];
                              setSubApplicableGroups(safe);
                              setSubGroup(safe[0]);
                            }
                          }}
                          className={`px-2.5 py-1 rounded-lg border text-[11px] font-bold cursor-pointer ${
                            checked
                              ? 'bg-primary-container text-on-primary border-primary-container'
                              : 'bg-white text-on-surface-variant border-outline-variant/30'
                          }`}
                        >
                          {g === 'General' ? 'General (All)' : g}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-on-surface-variant mb-1">
                    Subject Role / Routing
                  </label>
                  <select
                    value={subRole}
                    onChange={(e) =>
                      setSubRole(
                        e.target.value as
                          | 'compulsory'
                          | 'elective-fourth'
                          | 'elective-main'
                          | 'religion'
                      )
                    }
                    className="w-full px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 font-semibold"
                  >
                    <option value="compulsory">Compulsory Subject</option>
                    <option value="elective-fourth">Group Elective &amp; 4th Subject Pool</option>
                    <option value="elective-main">Group Elective Only (Main Choice)</option>
                    <option value="religion">Religion-Specific Subject</option>
                  </select>
                </div>

                {subRole === 'religion' && (
                  <div>
                    <label className="block font-semibold text-on-surface-variant mb-1">
                      Target Religion Group
                    </label>
                    <select
                      value={subReligion}
                      onChange={(e) => setSubReligion(e.target.value as ReligionGroup)}
                      className="w-full px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 font-semibold"
                    >
                      {ALL_RELIGIONS.map((rel) => (
                        <option key={rel} value={rel}>
                          {rel}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {/* Optional Paired 1st + 2nd Board Paper Grouping */}
              <div className="p-3 rounded-xl bg-purple-50/50 border border-purple-200/70 space-y-2">
                <div className="font-bold text-purple-950">
                  Paired 1st &amp; 2nd Paper Board Result Pairing (Optional)
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <input
                    type="text"
                    placeholder="Pair Key (e.g. bangla)"
                    value={subCombinedPaperKey}
                    onChange={(e) => setSubCombinedPaperKey(e.target.value)}
                    className="px-2.5 py-1.5 rounded-lg bg-white border border-purple-200 font-mono text-[11px]"
                  />
                  <input
                    type="text"
                    placeholder="Result Title (e.g. Bangla 1st & 2nd)"
                    value={subCombinedPaperTitle}
                    onChange={(e) => setSubCombinedPaperTitle(e.target.value)}
                    className="px-2.5 py-1.5 rounded-lg bg-white border border-purple-200 text-[11px]"
                  />
                  <select
                    value={subPaperNumber}
                    onChange={(e) =>
                      setSubPaperNumber(e.target.value ? (Number(e.target.value) as 1 | 2) : '')
                    }
                    className="px-2 py-1.5 rounded-lg bg-white border border-purple-200 text-[11px] font-semibold"
                  >
                    <option value="">Standalone</option>
                    <option value="1">1st Paper</option>
                    <option value="2">2nd Paper</option>
                  </select>
                </div>
              </div>

              {/* Assessment Heads Matrix with Enable Checkboxes, CT & Custom Headers + Conversion % */}
              <div className="border-t border-outline-variant/25 pt-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="font-bold text-on-surface text-sm">
                      Examination Assessment Heads
                    </div>
                    <p className="text-[11px] text-on-surface-variant">
                      Unchecked heads are hidden from Admin &amp; Teacher mark entry rosters and marksheets.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleAddCustomComponentRow}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary-container/10 text-primary-container font-bold hover:bg-primary-container/20 cursor-pointer whitespace-nowrap"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Custom Header</span>
                  </button>
                </div>

                <div className="border border-outline-variant/25 rounded-xl overflow-hidden divide-y divide-outline-variant/15 bg-surface-container-low/40">
                  <div className="grid grid-cols-12 gap-2 px-3 py-2 bg-surface-container-low text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">
                    <div className="col-span-4">Assessment Head</div>
                    <div className="col-span-2 text-center">Full</div>
                    <div className="col-span-2 text-center">Pass</div>
                    <div className="col-span-2 text-center">Conv %</div>
                    <div className="col-span-2 text-right">Effective</div>
                  </div>

                  {[
                    {
                      key: 'cq',
                      label: 'CQ (Creative / Theory)',
                      enabled: cqEnabled,
                      setEnabled: (next: boolean) => {
                        setCqEnabled(next);
                        if (next && cqFull <= 0) {
                          setCqFull(70);
                          setCqPass(23);
                        }
                      },
                      full: cqFull,
                      setFull: setCqFull,
                      pass: cqPass,
                      setPass: setCqPass,
                      conv: cqConv,
                      setConv: setCqConv,
                    },
                    {
                      key: 'mcq',
                      label: 'MCQ (Objective)',
                      enabled: mcqEnabled,
                      setEnabled: (next: boolean) => {
                        setMcqEnabled(next);
                        if (next && mcqFull <= 0) {
                          setMcqFull(30);
                          setMcqPass(10);
                        }
                      },
                      full: mcqFull,
                      setFull: setMcqFull,
                      pass: mcqPass,
                      setPass: setMcqPass,
                      conv: mcqConv,
                      setConv: setMcqConv,
                    },
                    {
                      key: 'practical',
                      label: 'Practical / Lab',
                      enabled: pracEnabled,
                      setEnabled: (next: boolean) => {
                        setPracEnabled(next);
                        if (next && pracFull <= 0) {
                          setPracFull(25);
                          setPracPass(8);
                        }
                      },
                      full: pracFull,
                      setFull: setPracFull,
                      pass: pracPass,
                      setPass: setPracPass,
                      conv: pracConv,
                      setConv: setPracConv,
                    },
                    {
                      key: 'ct',
                      label: 'Class Test (CT)',
                      enabled: ctEnabled,
                      setEnabled: (next: boolean) => {
                        setCtEnabled(next);
                        if (next && ctFull <= 0) {
                          setCtFull(20);
                          setCtPass(7);
                        }
                      },
                      full: ctFull,
                      setFull: setCtFull,
                      pass: ctPass,
                      setPass: setCtPass,
                      conv: ctConv,
                      setConv: setCtConv,
                    },
                  ].map((row) => {
                    const effFull = row.enabled ? calcConvertedMark(row.full, row.conv) : 0;
                    const effPass = row.enabled ? calcConvertedMark(row.pass, row.conv) : 0;
                    return (
                      <div
                        key={row.key}
                        className={`grid grid-cols-12 gap-2 px-3 py-2 items-center ${
                          row.enabled ? 'bg-white' : 'bg-surface-container-low/50 opacity-70'
                        }`}
                      >
                        <label className="col-span-4 inline-flex items-center gap-2 cursor-pointer min-h-[36px]">
                          <input
                            type="checkbox"
                            checked={row.enabled}
                            onChange={(e) => row.setEnabled(e.target.checked)}
                            className="w-4 h-4 rounded accent-primary-container cursor-pointer"
                          />
                          <span className="font-semibold text-on-surface truncate">
                            {row.label}
                          </span>
                        </label>
                        <div className="col-span-2">
                          <input
                            type="number"
                            min={0}
                            disabled={!row.enabled}
                            value={row.enabled ? row.full : 0}
                            onChange={(e) => row.setFull(Math.max(0, Number(e.target.value) || 0))}
                            className="w-full px-2 py-1.5 rounded-lg bg-surface-container-low border border-outline-variant/30 font-mono tabular-nums text-center disabled:opacity-40"
                          />
                        </div>
                        <div className="col-span-2">
                          <input
                            type="number"
                            min={0}
                            disabled={!row.enabled}
                            value={row.enabled ? row.pass : 0}
                            onChange={(e) => row.setPass(Math.max(0, Number(e.target.value) || 0))}
                            className="w-full px-2 py-1.5 rounded-lg bg-surface-container-low border border-outline-variant/30 font-mono tabular-nums text-center disabled:opacity-40"
                          />
                        </div>
                        <div className="col-span-2">
                          <input
                            type="number"
                            min={1}
                            max={100}
                            disabled={!row.enabled}
                            value={row.enabled ? row.conv : 100}
                            onChange={(e) =>
                              row.setConv(Math.min(100, Math.max(1, Number(e.target.value) || 100)))
                            }
                            className="w-full px-2 py-1.5 rounded-lg bg-surface-container-low border border-outline-variant/30 font-mono tabular-nums text-center disabled:opacity-40"
                          />
                        </div>
                        <div className="col-span-2 text-right font-mono tabular-nums text-[11px] font-semibold text-on-surface-variant">
                          {row.enabled ? `${effFull} (${effPass})` : 'Hidden'}
                        </div>
                      </div>
                    );
                  })}

                  {customComponents.map((custom, idx) => {
                    const effFull = custom.enabled
                      ? calcConvertedMark(custom.fullMarks, custom.conversionPercent)
                      : 0;
                    const effPass = custom.enabled
                      ? calcConvertedMark(custom.passMarks, custom.conversionPercent)
                      : 0;
                    return (
                      <div
                        key={custom.id}
                        className={`grid grid-cols-12 gap-2 px-3 py-2 items-center ${
                          custom.enabled ? 'bg-white' : 'bg-surface-container-low/50 opacity-70'
                        }`}
                      >
                        <div className="col-span-4 flex items-center gap-1.5">
                          <input
                            type="checkbox"
                            checked={custom.enabled}
                            onChange={(e) =>
                              setCustomComponents((prev) =>
                                prev.map((item, k) =>
                                  k === idx ? { ...item, enabled: e.target.checked } : item
                                )
                              )
                            }
                            className="w-4 h-4 rounded accent-primary-container cursor-pointer shrink-0"
                          />
                          <input
                            type="text"
                            placeholder="Header (e.g. Viva)"
                            value={custom.label}
                            onChange={(e) =>
                              setCustomComponents((prev) =>
                                prev.map((item, k) =>
                                  k === idx ? { ...item, label: e.target.value } : item
                                )
                              )
                            }
                            className="w-full px-2 py-1.5 rounded-lg bg-surface-container-low border border-outline-variant/30 text-xs font-semibold"
                          />
                        </div>
                        <div className="col-span-2">
                          <input
                            type="number"
                            min={0}
                            disabled={!custom.enabled}
                            value={custom.fullMarks}
                            onChange={(e) =>
                              setCustomComponents((prev) =>
                                prev.map((item, k) =>
                                  k === idx
                                    ? { ...item, fullMarks: Math.max(0, Number(e.target.value) || 0) }
                                    : item
                                )
                              )
                            }
                            className="w-full px-2 py-1.5 rounded-lg bg-surface-container-low border border-outline-variant/30 font-mono tabular-nums text-center disabled:opacity-40"
                          />
                        </div>
                        <div className="col-span-2">
                          <input
                            type="number"
                            min={0}
                            disabled={!custom.enabled}
                            value={custom.passMarks}
                            onChange={(e) =>
                              setCustomComponents((prev) =>
                                prev.map((item, k) =>
                                  k === idx
                                    ? { ...item, passMarks: Math.max(0, Number(e.target.value) || 0) }
                                    : item
                                )
                              )
                            }
                            className="w-full px-2 py-1.5 rounded-lg bg-surface-container-low border border-outline-variant/30 font-mono tabular-nums text-center disabled:opacity-40"
                          />
                        </div>
                        <div className="col-span-2">
                          <input
                            type="number"
                            min={1}
                            max={100}
                            disabled={!custom.enabled}
                            value={custom.conversionPercent ?? 100}
                            onChange={(e) =>
                              setCustomComponents((prev) =>
                                prev.map((item, k) =>
                                  k === idx
                                    ? {
                                        ...item,
                                        conversionPercent: Math.min(
                                          100,
                                          Math.max(1, Number(e.target.value) || 100)
                                        ),
                                      }
                                    : item
                                )
                              )
                            }
                            className="w-full px-2 py-1.5 rounded-lg bg-surface-container-low border border-outline-variant/30 font-mono tabular-nums text-center disabled:opacity-40"
                          />
                        </div>
                        <div className="col-span-2 flex items-center justify-end gap-1.5 font-mono tabular-nums text-[11px] font-semibold">
                          <span>{custom.enabled ? `${effFull}(${effPass})` : 'Off'}</span>
                          <button
                            type="button"
                            onClick={() =>
                              setCustomComponents((prev) => prev.filter((_, k) => k !== idx))
                            }
                            className="p-1 rounded-md text-error hover:bg-error-container/20 cursor-pointer"
                            title="Remove Custom Header"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}

                  {(() => {
                    const liveTotals = computeSubjectMarksTotals(
                      buildDraftSubjectComponents(),
                      customComponents
                    );
                    return (
                      <div className="px-3 py-2.5 bg-surface-container-low flex items-center justify-between text-xs font-bold text-on-surface">
                        <span>Effective Subject Total (After Conversion %)</span>
                        <span className="font-mono tabular-nums text-primary-container">
                          Full: {liveTotals.totalFullMarks} · Pass: {liveTotals.totalPassMarks}
                        </span>
                      </div>
                    );
                  })()}
                </div>
              </div>

              <div className="p-3 rounded-xl bg-surface-container-low border border-outline-variant/25 space-y-1">
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={subExcludeGpa}
                    onChange={(e) => setSubExcludeGpa(e.target.checked)}
                  />
                  <span className="font-bold text-on-surface">
                    Non-GPA Assessment Subject
                  </span>
                </label>
                <p className="text-[11px] text-on-surface-variant pl-5">
                  Printed on marksheet for marks and remarks only — does not affect Final GPA or Pass/Fail (e.g. Physical Education, Arts &amp; Crafts, Continuous Assessment).
                </p>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowSubjectModal(false)}
                  className="px-4 py-2 rounded-xl text-on-surface-variant hover:bg-surface-container cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-primary-container text-on-primary font-bold cursor-pointer"
                >
                  Save Subject
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: CLONE SUBJECTS FROM ANOTHER CLASS */}
      {showCloneModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-surface-container-lowest rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-outline-variant/20 pb-3">
              <h3 className="text-base font-bold text-on-surface">
                Copy Subjects to {effectiveSubjectClass}
              </h3>
              <button
                type="button"
                onClick={() => setShowCloneModal(false)}
                className="p-1.5 rounded-full hover:bg-surface-container cursor-pointer"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            <p className="text-on-surface-variant">
              Duplicate subjects cleanly from another class into <strong>{effectiveSubjectClass}</strong>. Duplicate subject codes are automatically skipped.
            </p>

            <div>
              <label className="block font-semibold text-on-surface-variant mb-1">
                Source Class
              </label>
              <select
                value={cloneSourceClass}
                onChange={(e) => setCloneSourceClass(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 font-semibold"
              >
                {academicClasses
                  .filter((c) => c.name !== effectiveSubjectClass)
                  .map((c) => (
                    <option key={c.id} value={c.name}>
                      {c.name} ({subjects.filter((s) => s.classLevel === c.name).length} subjects)
                    </option>
                  ))}
              </select>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowCloneModal(false)}
                className="px-4 py-2 rounded-xl text-on-surface-variant hover:bg-surface-container cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const count = cloneSubjectsToClass(cloneSourceClass, effectiveSubjectClass);
                  setShowCloneModal(false);
                  showToast(
                    count > 0
                      ? `Copied ${count} subject(s) from ${cloneSourceClass} into ${effectiveSubjectClass}.`
                      : `No new subjects copied (all codes already exist in ${effectiveSubjectClass} or source is empty).`,
                    count > 0 ? 'ok' : 'err'
                  );
                }}
                className="px-5 py-2 rounded-xl bg-primary-container text-on-primary font-bold cursor-pointer"
              >
                Copy Subjects Now
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: ADD / EDIT ACADEMIC CALENDAR EVENT */}
      {showEventModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-surface-container-lowest rounded-3xl p-6 sm:p-8 max-w-lg w-full shadow-2xl space-y-4 text-xs max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-outline-variant/20 pb-3">
              <h3 className="text-base font-bold text-on-surface">
                {editingEvent ? 'Edit Academic Calendar Entry' : 'Add Academic Calendar Entry'}
              </h3>
              <button
                type="button"
                onClick={() => setShowEventModal(false)}
                className="p-1.5 rounded-full hover:bg-surface-container cursor-pointer"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            <form onSubmit={handleSaveEvent} className="space-y-4">
              <div>
                <label className="block font-semibold text-on-surface-variant mb-1">
                  Event / Schedule Title *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Eid-ul-Fitr Holiday Break or Half-Yearly Exam"
                  value={evtTitle}
                  onChange={(e) => setEvtTitle(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 text-sm"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-semibold text-on-surface-variant mb-1">
                    Category
                  </label>
                  <select
                    value={evtCategory}
                    onChange={(e) => setEvtCategory(e.target.value as AcademicEventCategory)}
                    className="w-full px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 font-semibold"
                  >
                    <option value="Class Days">Class Days / Term Plan</option>
                    <option value="Holiday">Holiday / Vacation</option>
                    <option value="Exam">Examination Window</option>
                    <option value="Important Event">Important Event</option>
                    <option value="Admission">Admission Event</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-on-surface-variant mb-1">
                    Target Wing
                  </label>
                  <select
                    value={evtTargetWing}
                    onChange={(e) =>
                      setEvtTargetWing(
                        e.target.value as 'All' | 'School (Class 1–10)' | 'College (Class 11–12)'
                      )
                    }
                    className="w-full px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 font-semibold"
                  >
                    <option value="All">All Campus Wings</option>
                    <option value="School (Class 1–10)">School (Class 1–10)</option>
                    <option value="College (Class 11–12)">College (Class 11–12)</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-on-surface-variant mb-1">
                    Visibility
                  </label>
                  <select
                    value={evtVisibility}
                    onChange={(e) =>
                      setEvtVisibility(
                        e.target.value as 'Public & Portals' | 'Portals Only' | 'Admin Only'
                      )
                    }
                    className="w-full px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 font-semibold"
                  >
                    <option value="Public & Portals">Public Website &amp; Portals</option>
                    <option value="Portals Only">Student &amp; Teacher Portals Only</option>
                    <option value="Admin Only">Admin Internal Only</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-on-surface-variant mb-1">
                    Start Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={evtStartDate}
                    onChange={(e) => setEvtStartDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-on-surface-variant mb-1">
                    End Date (Multi-day optional)
                  </label>
                  <input
                    type="date"
                    value={evtEndDate}
                    onChange={(e) => setEvtEndDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-on-surface-variant mb-1">
                    Time Window
                  </label>
                  <input
                    type="text"
                    value={evtTime}
                    onChange={(e) => setEvtTime(e.target.value)}
                    placeholder="09:00 - 15:00 or Full Day"
                    className="w-full px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-on-surface-variant mb-1">
                    Location / Venue
                  </label>
                  <input
                    type="text"
                    value={evtLocation}
                    onChange={(e) => setEvtLocation(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-on-surface-variant mb-1">
                  Description / Instructions
                </label>
                <textarea
                  rows={3}
                  value={evtDescription}
                  onChange={(e) => setEvtDescription(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowEventModal(false)}
                  className="px-4 py-2 rounded-xl text-on-surface-variant hover:bg-surface-container cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-primary-container text-on-primary font-bold cursor-pointer"
                >
                  {editingEvent ? 'Save Event' : 'Add to Calendar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: NCTB / BANGLADESH EDUCATION BOARD SUBJECT PRESET IMPORTER */}
      {showNctbModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-surface-container-lowest rounded-3xl p-6 sm:p-7 max-w-2xl w-full shadow-2xl space-y-4 text-xs max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-outline-variant/20 pb-3 shrink-0">
              <div>
                <h3 className="text-base font-bold text-on-surface">
                  Import NCTB &amp; Education Board Subjects &rarr; {effectiveSubjectClass}
                </h3>
                <p className="text-[11px] text-on-surface-variant">
                  Select a standard curriculum board tier. Existing subject codes in {effectiveSubjectClass} are automatically skipped.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowNctbModal(false)}
                className="p-1.5 rounded-full hover:bg-surface-container cursor-pointer"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            {/* Tier Tabs */}
            <div className="flex flex-wrap gap-1.5 shrink-0">
              {NCTB_BOARD_PRESETS.filter((tier) =>
                tier.id === 'hsc' ? showCollege : showSchool
              ).map((tier) => (
                <button
                  key={tier.id}
                  type="button"
                  onClick={() => handleSelectNctbTier(tier.id)}
                  className={`px-3 py-1.5 rounded-xl font-bold cursor-pointer border ${
                    nctbTier === tier.id
                      ? 'bg-primary-container text-on-primary border-primary-container'
                      : 'bg-surface-container-low text-on-surface-variant border-outline-variant/25'
                  }`}
                >
                  {tier.label}
                </button>
              ))}
            </div>

            {(() => {
              const activeTier =
                NCTB_BOARD_PRESETS.find((t) => t.id === nctbTier) || NCTB_BOARD_PRESETS[2];
              const existingCodeSet = new Set(
                subjects
                  .filter((s) => s.classLevel === effectiveSubjectClass)
                  .map((s) => s.code.toLowerCase())
              );
              const targetCls = academicClasses.find((c) => c.name === effectiveSubjectClass);
              const allowedGroups =
                targetCls && targetCls.hasGroups !== false
                  ? new Set(['General', ...targetCls.groups])
                  : new Set(['General']);

              return (
                <>
                  <div className="flex items-center justify-between bg-surface-container-low/70 px-3 py-2 rounded-xl border border-outline-variant/20 shrink-0">
                    <span className="text-on-surface-variant">{activeTier.subtitle}</span>
                    <div className="flex items-center gap-2 shrink-0 ml-2">
                      <button
                        type="button"
                        onClick={() =>
                          setNctbSelectedCodes(
                            activeTier.subjects
                              .filter(
                                (s) =>
                                  getSubjectGroups(s).some((g) => allowedGroups.has(g)) &&
                                  !existingCodeSet.has(s.code.toLowerCase())
                              )
                              .map((s) => s.code)
                          )
                        }
                        className="font-bold text-primary-container hover:underline cursor-pointer"
                      >
                        Select Matching
                      </button>
                      <button
                        type="button"
                        onClick={() => setNctbSelectedCodes([])}
                        className="font-semibold text-on-surface-variant hover:underline cursor-pointer"
                      >
                        Clear
                      </button>
                    </div>
                  </div>

                  <div className="overflow-y-auto flex-1 border border-outline-variant/25 rounded-2xl divide-y divide-outline-variant/15">
                    {activeTier.subjects.map((item) => {
                      const alreadyAdded = existingCodeSet.has(item.code.toLowerCase());
                      const checked = nctbSelectedCodes.includes(item.code);
                      return (
                        <label
                          key={item.code}
                          className={`flex items-center justify-between gap-3 px-3.5 py-2.5 ${
                            alreadyAdded
                              ? 'opacity-50 bg-surface-container-low/40 cursor-not-allowed'
                              : 'hover:bg-surface-container-low/50 cursor-pointer'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <input
                              type="checkbox"
                              disabled={alreadyAdded}
                              checked={checked}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setNctbSelectedCodes((prev) =>
                                    prev.includes(item.code) ? prev : [...prev, item.code]
                                  );
                                } else {
                                  setNctbSelectedCodes((prev) => prev.filter((c) => c !== item.code));
                                }
                              }}
                            />
                            <span className="font-mono font-bold text-primary-container shrink-0">
                              {item.code}
                            </span>
                            <div className="min-w-0">
                              <div className="font-semibold text-on-surface truncate">
                                {item.name}
                                {item.banglaName ? ` · ${item.banglaName}` : ''}
                              </div>
                              <div className="text-[10px] text-on-surface-variant">
                                Track: {formatSubjectGroupsLabel(item)}
                                {item.genderRestriction === 'Female' ? ' · Female Only' : ''}
                                {item.religionRestriction
                                  ? ` · Religion (${item.religionRestriction})`
                                  : item.canBeFourthSubject && !item.isCompulsory
                                  ? ' · Elective / 4th Pool'
                                  : !item.isCompulsory
                                  ? ' · Group Elective'
                                  : ' · Compulsory'}
                                {item.combinedPaperKey
                                  ? ` · Paired (${item.paperNumber === 1 ? '1st' : '2nd'} Paper)`
                                  : ''}
                                {item.excludeFromGpa ? ' · Non-GPA' : ''}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="font-mono text-[11px] text-on-surface-variant">
                              {item.totalFullMarks} marks
                            </span>
                            {alreadyAdded && (
                              <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-900 text-[10px] font-bold">
                                Added
                              </span>
                            )}
                          </div>
                        </label>
                      );
                    })}
                  </div>

                  <div className="flex items-center justify-between pt-2 shrink-0">
                    <span className="font-semibold text-on-surface-variant">
                      {nctbSelectedCodes.length} subject(s) selected for import
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setShowNctbModal(false)}
                        className="px-4 py-2 rounded-xl text-on-surface-variant hover:bg-surface-container cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        disabled={nctbSelectedCodes.length === 0 || !effectiveSubjectClass}
                        onClick={() => {
                          const selectedSet = new Set(nctbSelectedCodes);
                          const chosen = activeTier.subjects
                            .filter((s) => selectedSet.has(s.code))
                            .map((s) => ({ ...s }));
                          const imported = bulkAddSubjects(effectiveSubjectClass, chosen);
                          setShowNctbModal(false);
                          showToast(
                            imported > 0
                              ? `Imported ${imported} NCTB/Board subject(s) into ${effectiveSubjectClass}.`
                              : `All selected subject codes already exist in ${effectiveSubjectClass}.`,
                            imported > 0 ? 'ok' : 'err'
                          );
                        }}
                        className="px-5 py-2 rounded-xl bg-primary-container text-on-primary font-bold cursor-pointer disabled:opacity-50"
                      >
                        Import Selected Subjects
                      </button>
                    </div>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}

      {/* MODAL: MANAGE CAMPUS ROUTINE ACTIVITIES (QUICK EDIT FROM ROUTINE TAB) */}
      {showActivitiesModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-surface-container-lowest rounded-3xl p-6 max-w-lg w-full shadow-2xl space-y-4 text-xs max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-outline-variant/20 pb-3">
              <div>
                <h3 className="text-base font-bold text-on-surface">
                  Campus Routine Activities &amp; Rules
                </h3>
                <p className="text-[11px] text-on-surface-variant">
                  Control non-subject periods, default rooms, and whether teacher clash check applies.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowActivitiesModal(false)}
                className="p-1.5 rounded-full hover:bg-surface-container cursor-pointer"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            <div className="space-y-2 max-h-60 overflow-y-auto">
              {routineActivities.map((act) => (
                <div
                  key={act.id}
                  className="flex items-center justify-between gap-2 p-3 rounded-xl bg-surface-container-low border border-outline-variant/25"
                >
                  <div>
                    <div className="font-bold text-on-surface">{act.name}</div>
                    <div className="flex flex-wrap items-center gap-1.5 mt-1">
                      {act.defaultRoom && (
                        <span className="px-1.5 py-0.5 rounded bg-white border border-outline-variant/25 font-mono text-[10px]">
                          Room: {act.defaultRoom}
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => handleToggleActivityTeacherRule(act.id, true)}
                        className={`px-2 py-0.5 rounded text-[10px] font-bold cursor-pointer ${
                          act.requiresTeacher
                            ? 'bg-sky-100 text-sky-900'
                            : 'bg-emerald-100 text-emerald-900'
                        }`}
                      >
                        {act.requiresTeacher
                          ? 'Requires Teacher (Clash Checked)'
                          : 'No Teacher Needed (Clash Exempt)'}
                      </button>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemoveActivity(act.id, true)}
                    className="p-1.5 rounded-lg text-error hover:bg-error-container/20 cursor-pointer"
                    title="Delete activity"
                  >
                    <span className="material-symbols-outlined text-[16px]">delete</span>
                  </button>
                </div>
              ))}
            </div>

            <div className="p-3.5 rounded-2xl bg-surface-container-low border border-outline-variant/25 space-y-3">
              <div className="font-bold text-on-surface">Add New Routine Activity</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <input
                  type="text"
                  placeholder="Activity name (e.g. Science Club)"
                  value={newActName}
                  onChange={(e) => setNewActName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-white border border-outline-variant/30"
                />
                <input
                  type="text"
                  placeholder="Default Room (e.g. Auditorium)"
                  value={newActRoom}
                  onChange={(e) => setNewActRoom(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-white border border-outline-variant/30 font-mono"
                />
              </div>
              <div className="flex items-center justify-between gap-2">
                <label className="inline-flex items-center gap-2 cursor-pointer font-semibold">
                  <input
                    type="checkbox"
                    checked={newActRequiresTeacher}
                    onChange={(e) => setNewActRequiresTeacher(e.target.checked)}
                  />
                  <span>Requires Assigned Teacher</span>
                </label>
                <button
                  type="button"
                  onClick={() => handleAddActivityToDraft(true)}
                  className="px-4 py-2 rounded-xl bg-primary-container text-on-primary font-bold cursor-pointer"
                >
                  Add Activity
                </button>
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setShowActivitiesModal(false)}
                className="px-4 py-2 rounded-xl bg-surface-container text-on-surface font-semibold cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
