'use client';

import React, { useState, useRef } from 'react';
import { Download, Printer } from 'lucide-react';
import { useERPStore } from '@/lib/store';
import {
  classMatchesEnabledWings,
  formatDateDDMMYYYY,
  formatGroupSectionDisplay,
  formatSubjectGroupsLabel,
  getActiveSubjectCustomComponents,
  getAutoRoutedSubjectsForStudent,
  getEffectiveConversionPercent,
  getEffectiveSectionsForClassGroup,
  getStudentEffectiveExaminer,
  isSingleBatchCohort,
  isStudentGenderEligibleForSubject,
  isSubjectComponentEnabled,
  resolveSubjectCTConfig,
  sortSubjectsByOrder,
  subjectAppliesToGroup,
  subjectAppliesToStudent,
} from '@/lib/academic-helpers';
import { AcademicGroup, ExamRoutineItem, MarkEntry, SavedTabulationRecord } from '@/lib/types';
import {
  evaluateSubjectResult,
  compileStudentExamRecord,
  compileJoinedExamRecord,
  computeClassAndSectionMeritRanks,
} from '@/lib/grading-engine';
import { generateQrDataUrl } from '@/lib/qr';
import { downloadMarksheetAsPdf, printMarksheetDocument } from '@/lib/marksheet-pdf';
import { isTeachingStaff } from '@/lib/teacher-helpers';
import MarksheetDesignerPanel from '@/components/admin/MarksheetDesignerPanel';
import MarksheetDocument from '@/components/common/MarksheetDocument';

type ExamSubTab =
  | 'announcements'
  | 'registration-examiners'
  | 'mark-entry'
  | 'tabulation-joined'
  | 'stationery-signatories'
  | 'preview-marksheet';

export default function ExaminationsTab() {
  const { isHydrated } = useERPStore();
  return <ExaminationsTabInner key={isHydrated ? 'hydrated' : 'ssr'} />;
}

function ExaminationsTabInner() {
  const {
    state,
    createExam,
    updateExam,
    deleteExam,
    updateExamRoutineItem,
    saveMarkEntries,
    lockExamRoster,
    unlockExamRoster,
    sendMarksToTabulation,
    bulkSendMarksToTabulation,
    recallMarksFromTabulation,
    saveExamTabulation,
    updateCMSConfig,
    bulkUpdateStudentSubjects,
    setExaminerAssignment,
    removeExaminerAssignment,
  } = useERPStore();
  const { exams, subjects, students, markEntries, teachers, cmsConfig, academicClasses, instituteRules } = state;
  const combinePairedPapers = instituteRules?.combinePairedPapersInResult ?? true;
  const wingClasses = academicClasses.filter((c) => classMatchesEnabledWings(c, instituteRules));
  const visibleClasses = wingClasses.length > 0 ? wingClasses : academicClasses;
  const teachingStaff = teachers.filter((t) => isTeachingStaff(t));

  const defaultSignatories = [
    {
      id: 'sig-1',
      title: 'Class Teacher',
      name: 'Class Teacher',
      designation: 'Class Teacher',
      signatureImgUrl: '',
      enabled: true,
    },
    {
      id: 'sig-2',
      title: 'Controller of Examinations',
      name: 'Exam Controller',
      designation: 'Controller of Examinations',
      signatureImgUrl: '',
      enabled: true,
    },
    {
      id: 'sig-3',
      title: cmsConfig.principalDesignation || 'Head of Institution',
      name: cmsConfig.principalName || 'Head of Institution',
      designation: cmsConfig.principalDesignation || 'Principal',
      signatureImgUrl: '',
      enabled: true,
    },
  ];

  const [subTab, setSubTab] = useState<ExamSubTab>('announcements');
  const [selectedExamId, setSelectedExamId] = useState(exams[0]?.id || '');
  const currentExam = exams.find((e) => e.id === selectedExamId) || exams[0];
  const [isDownloadingPreviewPdf, setIsDownloadingPreviewPdf] = useState(false);
  const previewSheetRef = useRef<HTMLDivElement | null>(null);

  const [saveFeedback, setSaveFeedback] = useState<string | null>(null);
  const showToast = (msg: string) => {
    setSaveFeedback(msg);
    setTimeout(() => setSaveFeedback(null), 3500);
  };

  // --- SUB-TAB: SUBJECT REGISTRATION & EXAMINERS ---
  const [regClass, setRegClass] = useState(visibleClasses[0]?.name || academicClasses[0]?.name || 'Grade 10');
  const [regGroup, setRegGroup] = useState<'All' | AcademicGroup>('All');
  const [regSection, setRegSection] = useState<string>('ALL');
  const [regGender, setRegGender] = useState<'All' | 'Male' | 'Female'>('All');
  const [bulkFourthSubId, setBulkFourthSubId] = useState<string>('');
  const [draftSelections, setDraftSelections] = useState<
    Record<string, { electiveSubjectIds: string[]; optionalFourthSubjectId: string }>
  >({});
  const getTodayDateStr = () => {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };
  const [examinerClass, setExaminerClass] = useState(
    visibleClasses[0]?.name || academicClasses[0]?.name || 'Grade 10'
  );
  const [examinerSection, setExaminerSection] = useState<string>('Common');
  const [examinerDeadlineDrafts, setExaminerDeadlineDrafts] = useState<Record<string, string>>({});

  // --- TAB 1: EXAM ANNOUNCEMENT & ROUTINE ---
  const [newExamTitle, setNewExamTitle] = useState('');
  const [newExamTerm, setNewExamTerm] = useState('Term 2 Final');
  const [newExamYear, setNewExamYear] = useState(instituteRules?.activeAcademicYear || '2025');
  const [newExamEnableCT, setNewExamEnableCT] = useState(false);
  const [newExamCtMax, setNewExamCtMax] = useState(20);
  const [newExamWrittenRatio, setNewExamWrittenRatio] = useState(80);
  const [newExamTargetClasses, setNewExamTargetClasses] = useState<string[]>([]);
  const [confirmDeleteExamId, setConfirmDeleteExamId] = useState<string | null>(null);
  const [scheduleInput, setScheduleInput] = useState(currentExam?.scheduledPublishAt || '');

  const [rDate, setRDate] = useState(getTodayDateStr);
  const [rTime, setRTime] = useState('09:00 AM - 12:00 PM');
  const [rClass, setRClass] = useState(academicClasses[0]?.name || 'Grade 10');
  const [rGroup, setRGroup] = useState<'All' | AcademicGroup>('All');
  const [routineViewGroup, setRoutineViewGroup] = useState<'All' | AcademicGroup>('All');
  const routineSubjectsForClass = sortSubjectsByOrder(
    subjects.filter(
      (s) =>
        s.classLevel === rClass &&
        (rGroup === 'All' || subjectAppliesToGroup(s, rGroup)) &&
        !(currentExam?.excludedSubjectIds || []).includes(s.id)
    )
  );
  const [rSubjectId, setRSubjectId] = useState(
    () => subjects.find((s) => s.classLevel === (academicClasses[0]?.name || 'Grade 10'))?.id || ''
  );
  const effectiveRSubjectId = routineSubjectsForClass.some((s) => s.id === rSubjectId)
    ? rSubjectId
    : routineSubjectsForClass[0]?.id || '';
  const [rRoom, setRRoom] = useState('');
  const [rSection, setRSection] = useState('Common');
  const [rollRangeInput, setRollRangeInput] = useState('');
  const [rTeacherId, setRTeacherId] = useState(teachers[0]?.id || '');
  const [rDeadline, setRDeadline] = useState(getTodayDateStr);
  const [editingRoutineItem, setEditingRoutineItem] = useState<ExamRoutineItem | null>(null);
  const [editingRoutineOriginalSlot, setEditingRoutineOriginalSlot] = useState<{
    className: string;
    sectionName: string;
    subjectId: string;
  } | null>(null);
  const [editingRoutineGroup, setEditingRoutineGroup] = useState<'All' | AcademicGroup>('All');

  // --- TAB 2: MARK ENTRY ---
  const examTargetedClasses =
    currentExam?.targetClasses && currentExam.targetClasses.length > 0
      ? visibleClasses.filter((c) => currentExam.targetClasses!.includes(c.name))
      : visibleClasses;
  const markEntryClasses = examTargetedClasses.length > 0 ? examTargetedClasses : visibleClasses;
  const [selectedClass, setSelectedClass] = useState(academicClasses[0]?.name || 'Grade 10');
  const effectiveMarkClass = markEntryClasses.some((c) => c.name === selectedClass)
    ? selectedClass
    : markEntryClasses[0]?.name || selectedClass;
  const [selectedMarkGroup, setSelectedMarkGroup] = useState<'All' | AcademicGroup>('All');
  const markClassObj = academicClasses.find((c) => c.name === effectiveMarkClass);
  const markEntryGroups = (markClassObj?.groups || []).filter(
    (g): g is AcademicGroup => g !== 'General'
  );
  const effectiveMarkGroup: 'All' | AcademicGroup =
    selectedMarkGroup !== 'All' && markEntryGroups.includes(selectedMarkGroup)
      ? selectedMarkGroup
      : 'All';
  const markEntrySections = getEffectiveSectionsForClassGroup(markClassObj, effectiveMarkGroup);
  const [selectedSection, setSelectedSection] = useState(
    getEffectiveSectionsForClassGroup(academicClasses[0])[0] || 'A'
  );
  const effectiveMarkSection =
    selectedSection === 'ALL' || markEntrySections.includes(selectedSection)
      ? selectedSection
      : markEntrySections[0] || 'Common';

  const classSubjectsForMarkEntry = sortSubjectsByOrder(
    subjects.filter(
      (s) =>
        s.classLevel === effectiveMarkClass &&
        (effectiveMarkGroup === 'All' || subjectAppliesToGroup(s, effectiveMarkGroup)) &&
        !(currentExam?.excludedSubjectIds || []).includes(s.id)
    )
  );
  const [selectedSubjectId, setSelectedSubjectId] = useState(
    () =>
      sortSubjectsByOrder(
        subjects.filter((s) => s.classLevel === (academicClasses[0]?.name || 'Grade 10'))
      )[0]?.id || ''
  );
  const currentSubject =
    classSubjectsForMarkEntry.find((s) => s.id === selectedSubjectId) || classSubjectsForMarkEntry[0];
  const [localMarks, setLocalMarks] = useState<
    Record<
      string,
      {
        cq: number | '';
        mcq: number | '';
        practical: number | '';
        ct?: number | '';
        customMarks?: Record<string, number | ''>;
        isAbsent?: boolean;
      }
    >
  >({});

  // --- TAB 3: TABULATION & JOINED RESULTS ---
  const [tabClass, setTabClass] = useState(academicClasses[0]?.name || 'Grade 10');
  const [tabGroup, setTabGroup] = useState<'ALL' | AcademicGroup>('ALL');
  const [tabSection, setTabSection] = useState<string>('ALL');
  const [joinedMode, setJoinedMode] = useState<'single' | 'subject-average' | 'term-average'>('single');
  const [selectedJoinedExamIds, setSelectedJoinedExamIds] = useState<string[]>(() =>
    exams.map((e) => e.id)
  );

  // --- TAB 4: STATIONERY & SIGNATORIES ---
  const [stationeryMode, setStationeryMode] = useState<'full-design' | 'pre-printed-overlay'>(
    currentExam?.stationeryMode || 'full-design'
  );
  const [customBgUrl, setCustomBgUrl] = useState(currentExam?.marksheetBgUrl || '');
  const [signatories, setSignatories] = useState(currentExam?.signatories || []);

  // --- ACTIVE EXAM ASSESSMENT, TARGET CLASSES & EXCLUSIONS ---
  const [activeExamEnableCT, setActiveExamEnableCT] = useState(currentExam?.enableCT ?? false);
  const [activeExamCtMax, setActiveExamCtMax] = useState(currentExam?.ctMaxMarks ?? 20);
  const [activeExamWrittenRatio, setActiveExamWrittenRatio] = useState(currentExam?.writtenRatioPercent ?? 80);
  const [activeExamTargetClasses, setActiveExamTargetClasses] = useState<string[]>(
    currentExam?.targetClasses ?? []
  );

  // --- LEGAL / A3 TABULATION (TR) PRINT CONTROLS ---
  const [showPrintableTrSheet, setShowPrintableTrSheet] = useState(false);
  const [trPaperSize, setTrPaperSize] = useState<'legal' | 'a3' | 'a4'>('legal');

  // --- TAB 5: MARKSHEET PREVIEW ---
  const [previewStudentId, setPreviewStudentId] = useState(students[0]?.id || '');
  const [previewQr, setPreviewQr] = useState('');

  const handleCreateExam = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newExamTitle.trim()) return;
    const baseSignatories =
      currentExam?.signatories && currentExam.signatories.length > 0
        ? currentExam.signatories
        : defaultSignatories;
    const created = createExam({
      title: newExamTitle.trim(),
      academicYear: newExamYear.trim() || instituteRules?.activeAcademicYear || '2025',
      term: newExamTerm.trim() || 'Term Examination',
      enableCT: newExamEnableCT,
      ctMaxMarks: newExamEnableCT ? newExamCtMax : undefined,
      writtenRatioPercent: newExamEnableCT ? newExamWrittenRatio : undefined,
      targetClasses: newExamTargetClasses.length > 0 ? newExamTargetClasses : undefined,
      stationeryMode: 'full-design',
      marksheetBgUrl: '',
      signatories: baseSignatories,
      status: 'MarksEntry',
      examRoutine: [],
    });
    setSelectedExamId(created.id);
    setStationeryMode(created.stationeryMode);
    setCustomBgUrl(created.marksheetBgUrl || '');
    setSignatories(created.signatories);
    setScheduleInput(created.scheduledPublishAt || '');
    setActiveExamEnableCT(Boolean(created.enableCT));
    setActiveExamCtMax(created.ctMaxMarks ?? 20);
    setActiveExamWrittenRatio(created.writtenRatioPercent ?? 80);
    setActiveExamTargetClasses(created.targetClasses ?? []);
    setSelectedJoinedExamIds((prev) => (prev.includes(created.id) ? prev : [...prev, created.id]));
    setNewExamTitle('');
    setNewExamTargetClasses([]);
    showToast(`Announced new examination: "${created.title}".`);
  };

  if (!currentExam) {
    return (
      <div className="flex flex-col w-full space-y-6">
        <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-4">
          <div>
            <span className="font-label-sm text-label-sm uppercase tracking-wider text-primary-container font-semibold">
              NCTB Examination Engine &amp; Publication Console
            </span>
            <h1 className="font-headline-lg text-headline-lg text-on-surface tracking-tight font-bold">
              Examinations, Routine, Tabulation &amp; Official Marksheets
            </h1>
            <p className="font-body-md text-body-md text-on-surface-variant mt-0.5">
              Create your first examination to unlock Exam Routine scheduling, Paper Examiner assignment, Mark Entry, TR Sheets, and A4 Transcripts.
            </p>
          </div>
        </div>

        {saveFeedback && (
          <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-semibold flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px]">check_circle</span>
            <span>{saveFeedback}</span>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <form
            onSubmit={handleCreateExam}
            className="lg:col-span-7 rounded-2xl bg-surface-container-lowest border border-outline-variant/25 p-6 space-y-4 text-xs shadow-xs"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-outline-variant/20 pb-3">
              <div>
                <h2 className="text-base font-bold text-on-surface">Announce First Examination</h2>
                <p className="text-[11px] text-on-surface-variant">
                  Configure exam title, academic session, target classes, and optional Class Test (CT) marks.
                </p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {[
                  { label: 'Half-Yearly', term: 'Half-Yearly Examination' },
                  { label: 'Annual Exam', term: 'Annual Examination' },
                  { label: 'Test Exam', term: 'Test / Pre-Board Examination' },
                ].map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => {
                      setNewExamTerm(preset.label);
                      setNewExamTitle(`Academic Session ${newExamYear} • ${preset.term}`);
                    }}
                    className="px-2.5 py-1 rounded-lg bg-surface-container-low hover:bg-surface-container border border-outline-variant/30 text-[11px] font-semibold text-primary-container cursor-pointer"
                  >
                    + {preset.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block font-semibold text-on-surface-variant mb-1">
                Examination Title *
              </label>
              <input
                type="text"
                required
                placeholder={`e.g. Academic Session ${newExamYear} • Half-Yearly Examination`}
                value={newExamTitle}
                onChange={(e) => setNewExamTitle(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-surface-container-low border border-outline-variant/30 text-sm"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-on-surface-variant mb-1">Term Name *</label>
                <input
                  type="text"
                  required
                  value={newExamTerm}
                  onChange={(e) => setNewExamTerm(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30"
                />
              </div>
              <div>
                <label className="block font-semibold text-on-surface-variant mb-1">Academic Year *</label>
                <input
                  type="text"
                  required
                  value={newExamYear}
                  onChange={(e) => setNewExamYear(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 font-mono"
                />
              </div>
            </div>

            {visibleClasses.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="font-semibold text-on-surface-variant">
                    Target Classes (Leave all unchecked for All Classes)
                  </label>
                  {newExamTargetClasses.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setNewExamTargetClasses([])}
                      className="text-[11px] font-semibold text-primary-container hover:underline cursor-pointer"
                    >
                      Reset to All Classes
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {visibleClasses.map((cls) => {
                    const checked = newExamTargetClasses.includes(cls.name);
                    return (
                      <label
                        key={cls.id}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border cursor-pointer font-semibold transition-colors ${
                          checked
                            ? 'bg-primary-container text-on-primary border-primary-container'
                            : 'bg-surface-container-low border-outline-variant/30 text-on-surface'
                        }`}
                      >
                        <input
                          type="checkbox"
                          className="sr-only"
                          checked={checked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setNewExamTargetClasses([...newExamTargetClasses, cls.name]);
                            } else {
                              setNewExamTargetClasses(newExamTargetClasses.filter((c) => c !== cls.name));
                            }
                          }}
                        />
                        <span>{cls.name}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="p-3.5 rounded-xl bg-surface-container-low/70 border border-outline-variant/20 space-y-2">
              <div className="flex items-center justify-between">
                <label className="font-semibold text-on-surface flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newExamEnableCT}
                    onChange={(e) => setNewExamEnableCT(e.target.checked)}
                    className="w-4 h-4 rounded text-primary focus:ring-primary cursor-pointer"
                  />
                  <span>Include Class Test (CT) Marks</span>
                </label>
                <span className="text-[10px] font-mono text-on-surface-variant">
                  {newExamEnableCT ? 'Optional CT Active' : 'CT Hidden Everywhere'}
                </span>
              </div>
              {newExamEnableCT && (
                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-outline-variant/15">
                  <div>
                    <label className="block text-[10px] text-on-surface-variant font-medium">CT Max Marks</label>
                    <input
                      type="number"
                      min={5}
                      max={50}
                      value={newExamCtMax}
                      onChange={(e) => setNewExamCtMax(parseInt(e.target.value, 10) || 20)}
                      className="w-full px-2.5 py-1.5 rounded-lg bg-white border border-outline-variant/30 font-mono text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-on-surface-variant font-medium">Written Weight %</label>
                    <input
                      type="number"
                      min={50}
                      max={100}
                      value={newExamWrittenRatio}
                      onChange={(e) => setNewExamWrittenRatio(parseInt(e.target.value, 10) || 80)}
                      className="w-full px-2.5 py-1.5 rounded-lg bg-white border border-outline-variant/30 font-mono text-xs"
                    />
                  </div>
                </div>
              )}
            </div>

            <button
              type="submit"
              className="w-full py-3 rounded-xl bg-primary-container hover:bg-primary text-on-primary font-bold cursor-pointer inline-flex items-center justify-center gap-2"
            >
              <span className="material-symbols-outlined text-[18px]">add_circle</span>
              <span>Announce Examination &amp; Open Console</span>
            </button>
          </form>

          <div className="lg:col-span-5 rounded-2xl bg-surface-container-lowest border border-outline-variant/25 p-6 space-y-4 text-xs">
            <h3 className="text-sm font-bold text-on-surface border-b border-outline-variant/20 pb-2.5">
              NCTB Examination Workflow
            </h3>
            <ol className="space-y-3 text-on-surface-variant">
              <li className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-primary-container text-on-primary text-[11px] font-bold flex items-center justify-center shrink-0">1</span>
                <span><strong className="text-on-surface">Announce Exam:</strong> Set term name, year, target classes, and optional Class Test (CT) policy.</span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-surface-container text-on-surface text-[11px] font-bold flex items-center justify-center shrink-0">2</span>
                <span><strong className="text-on-surface">Routine &amp; Paper Inspectors:</strong> Schedule exam dates/rooms and assign subject examiners for Teacher Portal mark entry.</span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-surface-container text-on-surface text-[11px] font-bold flex items-center justify-center shrink-0">3</span>
                <span><strong className="text-on-surface">Bulk 4th Subject &amp; Marks:</strong> Allocate group/optional 4th subjects and enter CQ, MCQ, Practical, or Absent (AB).</span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-surface-container text-on-surface text-[11px] font-bold flex items-center justify-center shrink-0">4</span>
                <span><strong className="text-on-surface">TR Sheet &amp; Marksheet:</strong> Review NCTB Merit Ranking, Joined Term Averages, Legal/A3 TR Sheet, and A4 QR Transcripts.</span>
              </li>
            </ol>
          </div>
        </div>
      </div>
    );
  }

  const assignedTeacher = currentSubject
    ? getStudentEffectiveExaminer(
        currentExam,
        teachers,
        effectiveMarkClass,
        effectiveMarkSection,
        currentSubject.id
      )
    : undefined;

  const eligibleStudents = currentSubject
    ? students.filter((s) => {
        if (s.className !== effectiveMarkClass) return false;
        if (
          effectiveMarkSection !== 'ALL' &&
          effectiveMarkSection !== 'Common' &&
          s.sectionName !== effectiveMarkSection
        ) {
          return false;
        }
        if (
          effectiveMarkGroup !== 'All' &&
          effectiveMarkGroup !== 'General' &&
          s.group !== effectiveMarkGroup
        ) {
          return false;
        }
        const hasExistingMark = markEntries.some(
          (m) =>
            m.examId === currentExam.id &&
            m.studentId === s.id &&
            m.subjectId === currentSubject.id
        );
        return subjectAppliesToStudent(currentSubject, s, { hasExistingMark });
      })
    : [];

  const scopeKey = (studentId: string) =>
    `${currentExam.id}:${currentSubject?.id || 'none'}:${studentId}`;

  const isRosterLocked = currentSubject
    ? markEntries.some(
        (m) =>
          m.examId === currentExam.id &&
          m.subjectId === currentSubject.id &&
          eligibleStudents.some((s) => s.id === m.studentId) &&
          m.isLocked
      )
    : false;

  const getExistingMark = (studentId: string) => {
    if (!currentSubject) return undefined;
    return markEntries.find(
      (m) =>
        m.examId === currentExam.id &&
        m.studentId === studentId &&
        m.subjectId === currentSubject.id
    );
  };

  const cqActive = currentSubject ? isSubjectComponentEnabled(currentSubject.components.cq) : false;
  const mcqActive = currentSubject ? isSubjectComponentEnabled(currentSubject.components.mcq) : false;
  const pracActive = currentSubject
    ? isSubjectComponentEnabled(currentSubject.components.practical)
    : false;
  const ctConfig = currentSubject ? resolveSubjectCTConfig(currentSubject, currentExam) : null;
  const ctActive = Boolean(ctConfig?.enabled);
  const activeCustomHeads = currentSubject
    ? getActiveSubjectCustomComponents(currentSubject)
    : [];

  const getStudentMarkState = (studentId: string) => {
    const key = scopeKey(studentId);
    const existing = getExistingMark(studentId);
    const cached = localMarks[key];
    if (cached) {
      const hasCustomTyped = activeCustomHeads.some(
        (c) => cached.customMarks?.[c.id] !== undefined && cached.customMarks[c.id] !== ''
      );
      const hasAnyTyped =
        Boolean(cached.isAbsent) ||
        (cqActive && cached.cq !== '') ||
        (mcqActive && cached.mcq !== '') ||
        (pracActive && cached.practical !== '') ||
        (ctActive && cached.ct !== undefined && cached.ct !== '') ||
        hasCustomTyped;

      const customNums: Record<string, number> = {};
      for (const c of activeCustomHeads) {
        const val = cached.customMarks?.[c.id];
        customNums[c.id] = typeof val === 'number' ? val : 0;
      }

      return {
        draft: cached,
        isPending: !existing && !hasAnyTyped,
        evalNums: {
          cq: cqActive && typeof cached.cq === 'number' ? cached.cq : 0,
          mcq: mcqActive && typeof cached.mcq === 'number' ? cached.mcq : 0,
          practical: pracActive && typeof cached.practical === 'number' ? cached.practical : 0,
          ct: ctActive && typeof cached.ct === 'number' ? cached.ct : 0,
          customMarks: customNums,
          isAbsent: Boolean(cached.isAbsent),
        },
        existing,
      };
    }
    if (existing) {
      const customDraft: Record<string, number | ''> = {};
      const customNums: Record<string, number> = {};
      for (const c of activeCustomHeads) {
        const val = existing.customMarks?.[c.id];
        customDraft[c.id] = typeof val === 'number' ? val : '';
        customNums[c.id] = typeof val === 'number' ? val : 0;
      }
      return {
        draft: {
          cq: cqActive ? existing.cqMarks : ('' as const),
          mcq: mcqActive ? existing.mcqMarks : ('' as const),
          practical: pracActive ? existing.practicalMarks : ('' as const),
          ct: ctActive ? existing.ctMarks ?? 0 : undefined,
          customMarks: customDraft,
          isAbsent: Boolean(existing.isAbsent),
        },
        isPending: false,
        evalNums: {
          cq: cqActive ? existing.cqMarks : 0,
          mcq: mcqActive ? existing.mcqMarks : 0,
          practical: pracActive ? existing.practicalMarks : 0,
          ct: ctActive ? existing.ctMarks ?? 0 : 0,
          customMarks: customNums,
          isAbsent: Boolean(existing.isAbsent),
        },
        existing,
      };
    }
    return {
      draft: {
        cq: '' as const,
        mcq: '' as const,
        practical: '' as const,
        ct: ctActive ? ('' as const) : undefined,
        customMarks: {} as Record<string, number | ''>,
        isAbsent: false,
      },
      isPending: true,
      evalNums: { cq: 0, mcq: 0, practical: 0, ct: 0, customMarks: {}, isAbsent: false },
      existing: undefined,
    };
  };

  const handleScoreChange = (
    studentId: string,
    field: 'cq' | 'mcq' | 'practical' | 'ct',
    rawVal: string
  ) => {
    if (!currentSubject || isRosterLocked) return;
    const maxMarks =
      field === 'ct'
        ? ctConfig?.fullMarks || 20
        : currentSubject.components[field].fullMarks;
    const { draft } = getStudentMarkState(studentId);
    let nextFieldVal: number | '' = '';
    if (rawVal.trim() !== '') {
      const parsed = parseInt(rawVal, 10);
      nextFieldVal = Number.isNaN(parsed) ? '' : Math.min(maxMarks, Math.max(0, parsed));
    }
    setLocalMarks((prev) => ({
      ...prev,
      [scopeKey(studentId)]: {
        ...draft,
        [field]: nextFieldVal,
      },
    }));
  };

  const handleCustomScoreChange = (
    studentId: string,
    customId: string,
    maxMarks: number,
    rawVal: string
  ) => {
    if (!currentSubject || isRosterLocked) return;
    const { draft } = getStudentMarkState(studentId);
    let nextFieldVal: number | '' = '';
    if (rawVal.trim() !== '') {
      const parsed = parseInt(rawVal, 10);
      nextFieldVal = Number.isNaN(parsed) ? '' : Math.min(maxMarks, Math.max(0, parsed));
    }
    setLocalMarks((prev) => ({
      ...prev,
      [scopeKey(studentId)]: {
        ...draft,
        customMarks: {
          ...(draft.customMarks || {}),
          [customId]: nextFieldVal,
        },
      },
    }));
  };

  const handleToggleAbsent = (studentId: string, isAbsent: boolean) => {
    if (!currentSubject || isRosterLocked) return;
    const { draft } = getStudentMarkState(studentId);
    setLocalMarks((prev) => ({
      ...prev,
      [scopeKey(studentId)]: {
        ...draft,
        isAbsent,
      },
    }));
  };

  const handleMarkPendingAbsent = () => {
    if (!currentSubject || isRosterLocked) return;
    let marked = 0;
    const updates: typeof localMarks = {};
    for (const stu of eligibleStudents) {
      const st = getStudentMarkState(stu.id);
      if (st.isPending) {
        updates[scopeKey(stu.id)] = { ...st.draft, isAbsent: true };
        marked++;
      }
    }
    if (marked === 0) {
      showToast('No pending students left in this roster.');
      return;
    }
    setLocalMarks((prev) => ({ ...prev, ...updates }));
    showToast(`Marked ${marked} pending candidate(s) as Absent (AB). Click Save Marks to commit.`);
  };

  const handleMarkKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    rowIdx: number,
    col: string
  ) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const target = document.querySelector<HTMLInputElement>(
        `input[data-mark-cell="admin-${col}-${rowIdx + 1}"]`
      );
      if (target) {
        target.focus();
        target.select();
      }
    }
  };

  const handleSaveCurrentMarks = () => {
    if (!currentSubject || isRosterLocked) return;
    const entriesToSave: Partial<MarkEntry>[] = [];
    for (const stu of eligibleStudents) {
      const st = getStudentMarkState(stu.id);
      if (st.isPending) continue;
      const isFourth = stu.optionalFourthSubjectId === currentSubject.id;
      const evalRes = evaluateSubjectResult(currentSubject, st.evalNums, isFourth, currentExam);
      entriesToSave.push({
        examId: currentExam.id,
        studentId: stu.id,
        subjectId: currentSubject.id,
        isAbsent: st.evalNums.isAbsent,
        ctMarks: st.evalNums.isAbsent || !ctActive ? 0 : st.evalNums.ct,
        cqMarks: st.evalNums.isAbsent || !cqActive ? 0 : st.evalNums.cq,
        mcqMarks: st.evalNums.isAbsent || !mcqActive ? 0 : st.evalNums.mcq,
        practicalMarks: st.evalNums.isAbsent || !pracActive ? 0 : st.evalNums.practical,
        customMarks: st.evalNums.isAbsent ? {} : st.evalNums.customMarks,
        totalMarks: evalRes.total,
        gradePoint: evalRes.gradePoint,
        letterGrade: evalRes.letterGrade,
        isPassed: evalRes.isPassed,
        isOptionalFourth: isFourth,
      });
    }

    if (entriesToSave.length === 0) {
      showToast('No entered scores or AB flags to save yet. Type marks or mark AB first.');
      return;
    }

    saveMarkEntries(entriesToSave);
    showToast(`Saved ${entriesToSave.length} mark entry record(s) to examination ledger.`);
  };

  const handleLockCurrentRoster = () => {
    if (!currentSubject) return;
    const hasEntered = eligibleStudents.some((s) => !getStudentMarkState(s.id).isPending);
    if (hasEntered) {
      handleSaveCurrentMarks();
    }
    lockExamRoster(currentExam.id, currentSubject.id);
    showToast('Roster locked! Scores verified and archived.');
  };

  const handleUnlockCurrentRoster = () => {
    if (!currentSubject) return;
    unlockExamRoster(currentExam.id, currentSubject.id);
    showToast('Roster unlocked. Examination marks can now be edited.');
  };

  const handleAddRoutineItem = (e: React.FormEvent) => {
    e.preventDefault();
    const sub = routineSubjectsForClass.find((s) => s.id === effectiveRSubjectId);
    if (!sub) {
      showToast(`No subjects configured for ${rClass}. Add subjects in Institute → Class-Wise Subjects first.`);
      return;
    }
    const item: ExamRoutineItem = {
      id: `er-${sub.code}-${(currentExam.examRoutine || []).length + 1}`,
      date: rDate,
      time: rTime,
      subjectId: sub.id,
      subjectName: sub.name,
      className: rClass,
      group: sub.group,
      sectionName: rSection,
      room: rRoom.trim(),
      inspectorTeacherId: rTeacherId,
      entryDeadline: rDeadline,
    };
    updateExam(currentExam.id, {
      examRoutine: [...(currentExam.examRoutine || []), item],
    });
    setExaminerAssignment({
      examId: currentExam.id,
      className: rClass,
      sectionName: rSection,
      subjectId: sub.id,
      teacherId: rTeacherId,
      deadline: rDeadline,
    });
    showToast(`Added ${sub.name} (${rClass} · Sec ${rSection}) to routine & auto-assigned examiner.`);
  };

  const handleRemoveRoutineItem = (itemId: string) => {
    updateExam(currentExam.id, {
      examRoutine: (currentExam.examRoutine || []).filter((r) => r.id !== itemId),
    });
  };

  const handleSaveEditedRoutineItem = () => {
    if (!editingRoutineItem) return;
    updateExamRoutineItem({
      examId: currentExam.id,
      routineItem: editingRoutineItem,
      previousSlot: editingRoutineOriginalSlot || undefined,
      syncExaminerAssignment: true,
    });
    setEditingRoutineItem(null);
    setEditingRoutineOriginalSlot(null);
    showToast(`Updated routine & examiner assignment for ${editingRoutineItem.subjectName}.`);
  };

  const handleSaveTabulationSnapshot = () => {
    if (rankedExamResults.length === 0) {
      showToast('No candidates with sent marks in tabulation to save.');
      return;
    }
    const enrichedRecords = rankedExamResults.map((rec) => {
      const meta = currentExam.studentMarksheetMeta?.[rec.studentId];
      return {
        ...rec,
        attendanceTotalDays: meta?.workingDays ?? rec.attendanceTotalDays,
        attendancePresent: meta?.daysPresent ?? rec.attendancePresent,
        conductGrade: meta?.conduct ?? rec.conductGrade,
        teacherRemarks: meta?.teacherRemark ?? rec.teacherRemarks,
      };
    });
    const snapshotPassedCount = enrichedRecords.filter((r) => r.isPassed).length;
    const snapshotAPlusCount = enrichedRecords.filter((r) => r.finalLetterGrade === 'A+').length;

    const snapshot: SavedTabulationRecord = {
      savedAt: new Date().toISOString(),
      savedBy: cmsConfig.principalName || 'Exam Controller',
      academicYear: currentExam.academicYear,
      term: currentExam.term,
      records: enrichedRecords,
      summary: {
        totalCandidates: enrichedRecords.length,
        passedCount: snapshotPassedCount,
        failedCount: enrichedRecords.length - snapshotPassedCount,
        aPlusCount: snapshotAPlusCount,
      },
    };
    saveExamTabulation({ examId: currentExam.id, savedTabulation: snapshot });
    showToast(
      `Official Tabulation Snapshot saved (${enrichedRecords.length} ranked candidates). Results will publish strictly from this snapshot.`
    );
  };

  const handlePublishExamNow = () => {
    if (!currentExam.savedTabulation || currentExam.savedTabulation.records.length === 0) {
      showToast('Please Save the Official Tabulation Snapshot first before publishing results.');
      return;
    }
    updateExam(currentExam.id, {
      status: 'Published',
      publishedAt: new Date().toISOString(),
    });
    updateCMSConfig({ isResultsPublished: true });
    showToast(`"${currentExam.title}" is now Published live from the saved official tabulation.`);
  };

  const handleSchedulePublish = () => {
    if (!scheduleInput) return;
    updateExam(currentExam.id, {
      scheduledPublishAt: scheduleInput,
    });
    showToast(`Publication scheduled for ${scheduleInput.replace('T', ' ')}.`);
  };

  const handleSaveActiveExamAssessment = () => {
    updateExam(currentExam.id, {
      enableCT: activeExamEnableCT,
      ctMaxMarks: activeExamCtMax,
      writtenRatioPercent: activeExamWrittenRatio,
      targetClasses: activeExamTargetClasses.length > 0 ? activeExamTargetClasses : undefined,
    });
    showToast(
      `Saved "${currentExam.title}": CT ${activeExamEnableCT ? 'ENABLED' : 'DISABLED'}, ${
        activeExamTargetClasses.length > 0
          ? `${activeExamTargetClasses.length} target classes`
          : 'All Classes'
      }.`
    );
  };

  // Tabulation & Joined Calculation
  const tabClassOptions =
    joinedMode === 'single' ? markEntryClasses : visibleClasses;
  const effectiveTabClass =
    tabClass === 'ALL' || tabClassOptions.some((c) => c.name === tabClass)
      ? tabClass
      : tabClassOptions[0]?.name || 'ALL';
  const tabClassObj =
    effectiveTabClass === 'ALL'
      ? undefined
      : academicClasses.find((c) => c.name === effectiveTabClass);
  const tabClassGroups = (tabClassObj?.groups || []).filter(
    (g): g is AcademicGroup => g !== 'General'
  );
  const effectiveTabGroup: 'ALL' | AcademicGroup =
    effectiveTabClass === 'ALL' || tabGroup === 'ALL' || tabClassGroups.includes(tabGroup)
      ? tabGroup
      : 'ALL';
  const tabSections = tabClassObj
    ? getEffectiveSectionsForClassGroup(
        tabClassObj,
        effectiveTabGroup === 'ALL' ? 'All' : effectiveTabGroup
      )
    : [];
  const effectiveTabSection =
    tabSection === 'ALL' || tabSections.includes(tabSection) ? tabSection : 'ALL';

  const selectedJoinedExams = exams.filter((e) => selectedJoinedExamIds.includes(e.id));

  // Tabulation marks filter: only include marks that have been explicitly sent to Tabulation!
  const sentExamMarks = markEntries.filter(
    (m) => m.examId === currentExam.id && m.isSentToTabulation
  );
  const sentJoinedMarks = markEntries.filter(
    (m) =>
      selectedJoinedExams.some((ex) => ex.id === m.examId) &&
      m.isSentToTabulation
  );
  const sentStudentIds = new Set(sentExamMarks.map((m) => m.studentId));
  const sentJoinedStudentIds = new Set(sentJoinedMarks.map((m) => m.studentId));
  const hasAnySentMarks =
    joinedMode === 'single' ? sentExamMarks.length > 0 : sentJoinedMarks.length > 0;

  const isSnapshotStale = Boolean(
    currentExam.savedTabulation &&
      (sentExamMarks.some(
        (m) => m.sentToTabulationAt && m.sentToTabulationAt > currentExam.savedTabulation!.savedAt
      ) ||
        sentStudentIds.size !== currentExam.savedTabulation.records.length)
  );

  const tabStudents = students.filter((s) => {
    if (joinedMode === 'single') {
      if (!sentStudentIds.has(s.id)) return false;
      if (currentExam.targetClasses?.length && !currentExam.targetClasses.includes(s.className)) {
        return false;
      }
    } else if (!sentJoinedStudentIds.has(s.id)) {
      return false;
    }
    if (effectiveTabClass !== 'ALL' && s.className !== effectiveTabClass) return false;
    if (effectiveTabGroup !== 'ALL' && s.group !== effectiveTabGroup) return false;
    if (effectiveTabSection !== 'ALL' && s.sectionName !== effectiveTabSection) return false;
    return true;
  });

  // Compute NCTB Class and Section Merit Ranks across active candidates with sent marks
  const allActiveCandidates = students.filter(
    (s) =>
      s.status === 'Active' &&
      sentStudentIds.has(s.id) &&
      (!currentExam.targetClasses?.length || currentExam.targetClasses.includes(s.className))
  );
  const allCompiledCandidates = allActiveCandidates.map((stu) =>
    compileStudentExamRecord(stu, currentExam, subjects, sentExamMarks, {
      combinePairedPapers,
    })
  );
  const rankedExamResults = computeClassAndSectionMeritRanks(allCompiledCandidates);
  const rankedMap = new Map(rankedExamResults.map((r) => [r.studentId, r]));

  // Compute ranks for joined exams if joinedMode !== 'single'
  const allJoinedActiveCandidates = students.filter(
    (s) => s.status === 'Active' && sentJoinedStudentIds.has(s.id)
  );
  const allJoinedCandidates =
    joinedMode === 'single'
      ? []
      : allJoinedActiveCandidates.map((stu) => {
          const joined = compileJoinedExamRecord(
            stu,
            selectedJoinedExams.length ? selectedJoinedExams : [currentExam],
            subjects,
            sentJoinedMarks,
            joinedMode,
            { combinePairedPapers }
          );
          return {
            id: `joined-${stu.id}`,
            examId: 'joined',
            examTitle: 'Combined Terms',
            term: 'Combined',
            academicYear: currentExam.academicYear,
            studentId: stu.id,
            studentName: stu.fullName,
            rollNumber: stu.rollNumber,
            registrationNumber: stu.registrationNumber || stu.systemId,
            systemId: stu.systemId,
            className: stu.className,
            sectionName: stu.sectionName,
            group: stu.group,
            shift: stu.shift,
            fatherName: stu.fatherName,
            motherName: stu.motherName,
            totalMarksObtained: joined.joinedTotalMarks,
            totalFullMarks: joined.joinedFullMarks,
            gpaWithoutFourth: joined.joinedGPA,
            fourthSubjectBonus: 0,
            finalGPA: joined.joinedGPA,
            finalLetterGrade: joined.joinedLetterGrade,
            isPassed: joined.isPassed,
            failedSubjectCodes: [],
            subjects: joined.joinedSubjects,
            publishedAt: new Date().toISOString(),
          };
        });
  const rankedJoinedResults =
    joinedMode === 'single' ? [] : computeClassAndSectionMeritRanks(allJoinedCandidates);
  const rankedJoinedMap = new Map(rankedJoinedResults.map((r) => [r.studentId, r]));

  const tabulationRows = tabStudents.map((stu) => {
    if (joinedMode === 'single') {
      const rec =
        rankedMap.get(stu.id) ||
        compileStudentExamRecord(stu, currentExam, subjects, sentExamMarks, {
          combinePairedPapers,
        });
      return {
        student: stu,
        classRank: rec.classRank || 1,
        sectionRank: rec.sectionRank || 1,
        totalObtained: rec.totalMarksObtained,
        totalFull: rec.totalFullMarks,
        gpaWithoutFourth: rec.gpaWithoutFourth,
        fourthBonus: rec.fourthSubjectBonus,
        finalGPA: rec.finalGPA,
        finalGrade: rec.finalLetterGrade,
        isPassed: rec.isPassed,
        failedSubjects: rec.failedSubjectCodes,
        subjects: rec.subjects,
      };
    }
    const joinedRec = rankedJoinedMap.get(stu.id);
    const joined = compileJoinedExamRecord(
      stu,
      selectedJoinedExams.length ? selectedJoinedExams : [currentExam],
      subjects,
      sentJoinedMarks,
      joinedMode,
      { combinePairedPapers }
    );
    return {
      student: stu,
      classRank: joinedRec?.classRank || 1,
      sectionRank: joinedRec?.sectionRank || 1,
      totalObtained: joined.joinedTotalMarks,
      totalFull: joined.joinedFullMarks,
      gpaWithoutFourth: joined.joinedGPA,
      fourthBonus: 0,
      finalGPA: joined.joinedGPA,
      finalGrade: joined.joinedLetterGrade,
      isPassed: joined.isPassed,
      failedSubjects: [],
      subjects: joined.joinedSubjects,
    };
  });

  // Collect distinct subjects and components across the tabulation cohort
  const cohortSubjectCodes = Array.from(
    new Set(tabulationRows.flatMap((r) => r.subjects.map((s) => s.subjectCode)))
  );
  const cohortSubjectsList = sortSubjectsByOrder(
    cohortSubjectCodes.map((code) => {
      const subObj =
        subjects.find(
          (s) =>
            s.code === code &&
            (effectiveTabClass === 'ALL' || s.classLevel === effectiveTabClass)
        ) || subjects.find((s) => s.code === code);
      const anySubInCohort = tabulationRows
        .flatMap((r) => r.subjects)
        .find((s) => s.subjectCode === code);
      const hasCt =
        currentExam.enableCT || Boolean(anySubInCohort?.ctEnabled || anySubInCohort?.ct !== undefined);
      const hasCq = subObj ? isSubjectComponentEnabled(subObj.components.cq) : true;
      const hasMcq = subObj ? isSubjectComponentEnabled(subObj.components.mcq) : false;
      const hasPrac = subObj ? isSubjectComponentEnabled(subObj.components.practical) : false;
      const activeCustom = subObj ? getActiveSubjectCustomComponents(subObj) : [];
      const colSpan =
        (hasCt ? 1 : 0) +
        (hasCq ? 1 : 0) +
        (hasMcq ? 1 : 0) +
        (hasPrac ? 1 : 0) +
        activeCustom.length +
        2; // + Total + Grade
      return {
        code,
        name: subObj?.name || anySubInCohort?.subjectName || code,
        order: subObj?.order ?? anySubInCohort?.order,
        hasCt,
        hasCq,
        hasMcq,
        hasPrac,
        activeCustom,
        colSpan,
      };
    })
  );

  const passedCount = tabulationRows.filter((r) => r.isPassed).length;
  const aPlusCount = tabulationRows.filter((r) => r.finalGrade === 'A+').length;

  const handleExportTabulationCsv = () => {
    const subjectHeaders = cohortSubjectsList.flatMap((sub) => {
      const cols: string[] = [];
      if (sub.hasCt) cols.push(`"${sub.code} CT"`);
      if (sub.hasCq) cols.push(`"${sub.code} CQ"`);
      if (sub.hasMcq) cols.push(`"${sub.code} MCQ"`);
      if (sub.hasPrac) cols.push(`"${sub.code} Prac"`);
      for (const c of sub.activeCustom) {
        cols.push(`"${sub.code} ${c.label}"`);
      }
      cols.push(`"${sub.code} Total"`);
      cols.push(`"${sub.code} Grade"`);
      return cols;
    });

    const headers = [
      'Roll',
      'System ID',
      'Student Name',
      'Class',
      'Section',
      'Group',
      ...subjectHeaders,
      'Total Obtained',
      'Full Marks',
      'Core GPA',
      '4th Bonus',
      'Final GPA',
      'Grade',
      'Status',
      'Class Rank',
      'Section Rank',
    ].join(',');

    const rows = tabulationRows.map((r) => {
      const subjectCells = cohortSubjectsList.flatMap((colSub) => {
        const stuSub = r.subjects.find((s) => s.subjectCode === colSub.code);
        const cells: Array<string | number> = [];
        if (!stuSub) {
          for (let i = 0; i < colSub.colSpan; i++) cells.push('');
          return cells;
        }
        if (stuSub.isAbsent) {
          if (colSub.hasCt) cells.push('AB');
          if (colSub.hasCq) cells.push('AB');
          if (colSub.hasMcq) cells.push('AB');
          if (colSub.hasPrac) cells.push('AB');
          for (const _c of colSub.activeCustom) cells.push('AB');
          cells.push(0);
          cells.push('F');
          return cells;
        }
        if (colSub.hasCt) cells.push(stuSub.ct ?? '');
        if (colSub.hasCq) cells.push(stuSub.cq);
        if (colSub.hasMcq) cells.push(stuSub.mcq);
        if (colSub.hasPrac) cells.push(stuSub.practical);
        for (const c of colSub.activeCustom) {
          const customMatch = (stuSub.customComponents || []).find((cc) => cc.id === c.id);
          cells.push(customMatch ? customMatch.convertedMarks : '');
        }
        cells.push(stuSub.total);
        cells.push(stuSub.letterGrade);
        return cells;
      });

      return [
        r.student.rollNumber,
        r.student.systemId,
        `"${r.student.fullName.replace(/"/g, '""')}"`,
        `"${r.student.className}"`,
        `"${r.student.sectionName}"`,
        `"${r.student.group}"`,
        ...subjectCells,
        r.totalObtained,
        r.totalFull,
        r.gpaWithoutFourth.toFixed(2),
        r.fourthBonus.toFixed(2),
        r.finalGPA.toFixed(2),
        r.finalGrade,
        r.isPassed ? 'Passed' : 'Failed',
        r.classRank,
        r.sectionRank,
      ].join(',');
    });
    const blob = new Blob([[headers, ...rows].join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tabulation_${currentExam.term.replace(/\s+/g, '_')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Marksheet Preview (prefers Official Saved Tabulation Snapshot when available)
  const selectedStudentForPreview =
    students.find((s) => s.id === previewStudentId) || students[0];
  const getPreviewCompiledResult = (stu: (typeof students)[number]) => {
    const savedRec = currentExam.savedTabulation?.records.find((r) => r.studentId === stu.id);
    if (savedRec) return savedRec;
    return (
      rankedMap.get(stu.id) ||
      compileStudentExamRecord(
        stu,
        currentExam,
        subjects,
        sentExamMarks.length > 0 ? sentExamMarks : markEntries,
        { combinePairedPapers }
      )
    );
  };
  const compiledResult = selectedStudentForPreview
    ? getPreviewCompiledResult(selectedStudentForPreview)
    : null;

  const handleGeneratePreviewQr = (targetResult = compiledResult) => {
    if (!targetResult) return;
    generateQrDataUrl(
      `https://aethelgard.edu/verify?res=${targetResult.id}&sysId=${targetResult.systemId}`
    ).then(setPreviewQr);
  };

  return (
    <div className="flex flex-col w-full space-y-6">
      {/* Header & Exam Selector */}
      <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-4 no-print">
        <div>
          <span className="font-label-sm text-label-sm uppercase tracking-wider text-primary-container font-semibold">
            NCTB Examination Engine &amp; Publication Console
          </span>
          <h1 className="font-headline-lg text-headline-lg text-on-surface tracking-tight font-bold">
            Examinations, Routine, Tabulation &amp; Joined Results
          </h1>
          <p className="font-body-md text-body-md text-on-surface-variant mt-0.5">
            Announce exams, assign paper inspectors, compile subject/term joined results, and publish official A4 marksheets.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={currentExam.id}
            onChange={(e) => {
              const nextId = e.target.value;
              setSelectedExamId(nextId);
              setConfirmDeleteExamId(null);
              const nextExam = exams.find((x) => x.id === nextId);
              if (nextExam) {
                setStationeryMode(nextExam.stationeryMode);
                setCustomBgUrl(nextExam.marksheetBgUrl || '');
                setSignatories(nextExam.signatories);
                setScheduleInput(nextExam.scheduledPublishAt || '');
                setActiveExamEnableCT(Boolean(nextExam.enableCT));
                setActiveExamCtMax(nextExam.ctMaxMarks ?? 20);
                setActiveExamWrittenRatio(nextExam.writtenRatioPercent ?? 80);
                setActiveExamTargetClasses(nextExam.targetClasses ?? []);
              }
            }}
            className="px-3.5 py-2 rounded-xl bg-surface-container-lowest border border-outline-variant/40 text-xs font-bold text-primary-container max-w-xs"
          >
            {exams.map((ex) => (
              <option key={ex.id} value={ex.id}>
                [{ex.status}] {ex.term} ({ex.academicYear})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Sub-tab Switcher */}
      <div className="flex flex-wrap items-center gap-1 p-1 rounded-2xl bg-surface-container-low border border-outline-variant/30 w-fit no-print">
        {(
          [
            { id: 'announcements', label: '1. Announcements, Subjects & Routine' },
            { id: 'registration-examiners', label: '2. Bulk Elective & 4th Subject Reg' },
            { id: 'mark-entry', label: '3. Mark Entry Roster' },
            { id: 'tabulation-joined', label: '4. Tabulation & Joined Results' },
            { id: 'stationery-signatories', label: '5. Custom Marksheet Studio' },
            { id: 'preview-marksheet', label: '6. A4 Marksheet Preview' },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => {
              setSubTab(tab.id);
              if (tab.id === 'preview-marksheet') handleGeneratePreviewQr();
            }}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
              subTab === tab.id
                ? 'bg-primary-container text-on-primary shadow-xs'
                : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {saveFeedback && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-semibold flex items-center gap-2 no-print">
          <span className="material-symbols-outlined text-[18px]">check_circle</span>
          <span>{saveFeedback}</span>
        </div>
      )}

      {/* SUB-TAB 1: EXAM ANNOUNCEMENT, PUBLICATION & ROUTINE */}
      {subTab === 'announcements' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left: Announce Exam & Publish Control */}
          <div className="lg:col-span-5 space-y-6">
            <form
              onSubmit={handleCreateExam}
              className="rounded-2xl bg-surface-container-lowest border border-outline-variant/25 p-6 space-y-4 text-xs"
            >
              <h2 className="text-base font-bold text-on-surface border-b border-outline-variant/20 pb-3">
                Announce New Examination
              </h2>
              <div>
                <label className="block font-semibold text-on-surface-variant mb-1">Examination Title *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Academic Session 2024–2025 • Term 2 Final Examination"
                  value={newExamTitle}
                  onChange={(e) => setNewExamTitle(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 text-sm"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-on-surface-variant mb-1">Term Name</label>
                  <input
                    type="text"
                    value={newExamTerm}
                    onChange={(e) => setNewExamTerm(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-on-surface-variant mb-1">Academic Year</label>
                  <input
                    type="text"
                    value={newExamYear}
                    onChange={(e) => setNewExamYear(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 font-mono"
                  />
                </div>
              </div>

              {visibleClasses.length > 0 && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="font-semibold text-on-surface-variant">
                      Target Classes (Unchecked = All Classes)
                    </label>
                    {newExamTargetClasses.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setNewExamTargetClasses([])}
                        className="text-[11px] font-semibold text-primary-container hover:underline cursor-pointer"
                      >
                        Reset to All
                      </button>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {visibleClasses.map((cls) => {
                      const checked = newExamTargetClasses.includes(cls.name);
                      return (
                        <button
                          key={cls.id}
                          type="button"
                          onClick={() =>
                            setNewExamTargetClasses((prev) =>
                              prev.includes(cls.name)
                                ? prev.filter((c) => c !== cls.name)
                                : [...prev, cls.name]
                            )
                          }
                          className={`px-2.5 py-1 rounded-lg border text-[11px] font-semibold cursor-pointer transition-colors ${
                            checked
                              ? 'bg-primary-container text-on-primary border-primary-container'
                              : 'bg-surface-container-low border-outline-variant/30 text-on-surface'
                          }`}
                        >
                          {cls.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Assessment Scheme: Class Test (CT) */}
              <div className="p-3 rounded-xl bg-surface-container-low/70 border border-outline-variant/20 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="font-semibold text-on-surface flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={newExamEnableCT}
                      onChange={(e) => setNewExamEnableCT(e.target.checked)}
                      className="w-4 h-4 rounded text-primary focus:ring-primary cursor-pointer"
                    />
                    <span>Include Class Test (CT) Marks</span>
                  </label>
                  <span className="text-[10px] font-mono text-on-surface-variant">
                    {newExamEnableCT ? 'Optional CT Active' : 'CT Hidden'}
                  </span>
                </div>
                {newExamEnableCT && (
                  <div className="grid grid-cols-2 gap-2 pt-1 border-t border-outline-variant/15">
                    <div>
                      <label className="block text-[10px] text-on-surface-variant font-medium">CT Max Marks</label>
                      <input
                        type="number"
                        min={5}
                        max={50}
                        value={newExamCtMax}
                        onChange={(e) => setNewExamCtMax(parseInt(e.target.value, 10) || 20)}
                        className="w-full px-2.5 py-1 rounded-lg bg-white border border-outline-variant/30 font-mono text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-on-surface-variant font-medium">Written Weight %</label>
                      <input
                        type="number"
                        min={50}
                        max={100}
                        value={newExamWrittenRatio}
                        onChange={(e) => setNewExamWrittenRatio(parseInt(e.target.value, 10) || 80)}
                        className="w-full px-2.5 py-1 rounded-lg bg-white border border-outline-variant/30 font-mono text-xs"
                      />
                    </div>
                  </div>
                )}
              </div>

              <button
                type="submit"
                className="w-full py-2.5 rounded-xl bg-primary-container hover:bg-primary text-on-primary font-bold cursor-pointer"
              >
                Announce &amp; Open Marks Entry
              </button>
            </form>

            {/* Publication, Assessment Scheme & Delete Control Card */}
            <div className="rounded-2xl bg-surface-container-lowest border border-outline-variant/25 p-6 space-y-4 text-xs">
              <div className="flex items-center justify-between border-b border-outline-variant/20 pb-3">
                <h3 className="text-base font-bold text-on-surface">Active Exam Controls</h3>
                <span className="font-mono font-bold text-primary-container">{currentExam.status}</span>
              </div>
              <p className="text-on-surface-variant leading-relaxed">
                Selected Exam: <strong className="text-on-surface">{currentExam.title}</strong>
              </p>

              {/* Active Exam CT & Excluded Subjects Toggle */}
              <div className="p-3.5 rounded-xl bg-surface-container-low/70 border border-outline-variant/25 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="font-semibold text-on-surface flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={activeExamEnableCT}
                      onChange={(e) => setActiveExamEnableCT(e.target.checked)}
                      className="w-4 h-4 rounded text-primary focus:ring-primary cursor-pointer"
                    />
                    <span>Enable Class Test (CT) Column</span>
                  </label>
                  <span className="text-[10px] font-mono text-on-surface-variant">
                    {activeExamEnableCT ? 'CT Active' : 'CT Hidden'}
                  </span>
                </div>

                {activeExamEnableCT && (
                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-outline-variant/15">
                    <div>
                      <label className="block text-[10px] text-on-surface-variant font-medium">CT Max Marks</label>
                      <input
                        type="number"
                        min={5}
                        max={50}
                        value={activeExamCtMax}
                        onChange={(e) => setActiveExamCtMax(parseInt(e.target.value, 10) || 20)}
                        className="w-full px-2.5 py-1 rounded-lg bg-white border border-outline-variant/30 font-mono text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-on-surface-variant font-medium">Written Weight %</label>
                      <input
                        type="number"
                        min={50}
                        max={100}
                        value={activeExamWrittenRatio}
                        onChange={(e) => setActiveExamWrittenRatio(parseInt(e.target.value, 10) || 80)}
                        className="w-full px-2.5 py-1 rounded-lg bg-white border border-outline-variant/30 font-mono text-xs"
                      />
                    </div>
                  </div>
                )}

                {visibleClasses.length > 0 && (
                  <div className="pt-2 border-t border-outline-variant/15 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="block text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant">
                        Target Classes ({activeExamTargetClasses.length === 0 ? 'All Classes' : `${activeExamTargetClasses.length} selected`})
                      </label>
                      {activeExamTargetClasses.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setActiveExamTargetClasses([])}
                          className="text-[10px] font-semibold text-primary-container hover:underline cursor-pointer"
                        >
                          Reset All
                        </button>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {visibleClasses.map((cls) => {
                        const selected = activeExamTargetClasses.includes(cls.name);
                        return (
                          <button
                            key={cls.id}
                            type="button"
                            onClick={() =>
                              setActiveExamTargetClasses((prev) =>
                                prev.includes(cls.name)
                                  ? prev.filter((c) => c !== cls.name)
                                  : [...prev, cls.name]
                              )
                            }
                            className={`px-2 py-0.5 rounded-md text-[10px] font-semibold border cursor-pointer transition-colors ${
                              selected
                                ? 'bg-primary-container text-on-primary border-primary-container'
                                : 'bg-white text-on-surface border-outline-variant/30 hover:bg-surface-container'
                            }`}
                          >
                            {cls.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="pt-2 border-t border-outline-variant/15 flex items-center justify-between text-[11px] text-on-surface-variant">
                  <span>
                    Excluded Subjects: <strong className="text-on-surface">{(currentExam.excludedSubjectIds || []).length}</strong>
                  </span>
                  <span className="text-primary-container font-semibold">
                    Customize per class on right &rarr;
                  </span>
                </div>

                <button
                  type="button"
                  onClick={handleSaveActiveExamAssessment}
                  className="w-full py-2 rounded-xl bg-surface-container hover:bg-surface-container-high text-on-surface font-bold cursor-pointer"
                >
                  Save CT Policy &amp; Target Classes
                </button>
              </div>

              <div className="space-y-2">
                <label className="block font-semibold text-on-surface-variant">
                  Schedule Auto-Publication Date &amp; Time
                </label>
                <div className="flex gap-2">
                  <input
                    type="datetime-local"
                    value={scheduleInput}
                    onChange={(e) => setScheduleInput(e.target.value)}
                    className="flex-1 px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 font-mono"
                  />
                  <button
                    type="button"
                    onClick={handleSchedulePublish}
                    className="px-4 py-2 rounded-xl bg-surface-container hover:bg-surface-container-high font-bold cursor-pointer"
                  >
                    Schedule
                  </button>
                </div>
              </div>

              <button
                type="button"
                onClick={handlePublishExamNow}
                className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold cursor-pointer inline-flex items-center justify-center gap-2"
              >
                <span className="material-symbols-outlined text-[18px]">campaign</span>
                Publish Results Live Now
              </button>

              <div className="pt-2 border-t border-outline-variant/20 flex items-center justify-between gap-2">
                {confirmDeleteExamId === currentExam.id ? (
                  <div className="flex items-center justify-between w-full gap-2">
                    <span className="text-[11px] font-semibold text-error">Delete exam &amp; marks?</span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          const toDeleteId = currentExam.id;
                          const remaining = exams.filter((x) => x.id !== toDeleteId);
                          deleteExam(toDeleteId);
                          setSelectedExamId(remaining[0]?.id || '');
                          setConfirmDeleteExamId(null);
                          showToast(`Deleted examination "${currentExam.title}".`);
                        }}
                        className="px-3 py-1.5 rounded-lg bg-error text-on-error font-bold cursor-pointer"
                      >
                        Confirm Delete
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteExamId(null)}
                        className="px-3 py-1.5 rounded-lg bg-surface-container font-semibold cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteExamId(currentExam.id)}
                    className="text-[11px] font-semibold text-error hover:underline cursor-pointer"
                  >
                    Delete This Examination
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Right: Step 2A Per-Class Subject Enrollment + Step 2B Routine & Inspector */}
          <div className="lg:col-span-7 space-y-6">
            {/* Step 2A: Per-Class Subject Inclusion Checklist */}
            <div className="rounded-2xl bg-surface-container-lowest border border-outline-variant/25 p-6 space-y-4 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-outline-variant/20 pb-3">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-primary-container">
                    Step 2A &bull; Exam Subject Customization
                  </span>
                  <h2 className="text-base font-bold text-on-surface">
                    Included Subjects for {rClass}
                  </h2>
                  <p className="text-on-surface-variant text-[11px] mt-0.5">
                    Uncheck any board/seasonal skipped subject (e.g. Agriculture). Unchecked subjects are skipped in Routine, Mark Entry, GPA divisor, Tabulation &amp; Marksheets for this exam only.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={rClass}
                    onChange={(e) => {
                      const nextCls = e.target.value;
                      setRClass(nextCls);
                      setRGroup('All');
                      const firstSub = subjects.find((s) => s.classLevel === nextCls);
                      setRSubjectId(firstSub?.id || '');
                    }}
                    className="px-3 py-1.5 rounded-xl bg-surface-container-low border border-outline-variant/30 font-bold text-on-surface"
                  >
                    {markEntryClasses.map((c) => (
                      <option key={c.id} value={c.name}>{c.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {(() => {
                const classSubjects = sortSubjectsByOrder(
                  subjects.filter((s) => s.classLevel === rClass)
                );
                const currentExcluded = currentExam.excludedSubjectIds || [];
                const includedCount = classSubjects.filter((s) => !currentExcluded.includes(s.id)).length;

                const toggleClassSubject = (subjectId: string, include: boolean) => {
                  const nextExcluded = include
                    ? currentExcluded.filter((id) => id !== subjectId)
                    : Array.from(new Set([...currentExcluded, subjectId]));
                  updateExam(currentExam.id, { excludedSubjectIds: nextExcluded });
                };

                const setAllClassSubjects = (includeAll: boolean) => {
                  const classSubIds = new Set(classSubjects.map((s) => s.id));
                  const nextExcluded = includeAll
                    ? currentExcluded.filter((id) => !classSubIds.has(id))
                    : Array.from(new Set([...currentExcluded, ...classSubjects.map((s) => s.id)]));
                  updateExam(currentExam.id, { excludedSubjectIds: nextExcluded });
                  showToast(
                    includeAll
                      ? `Included all ${classSubjects.length} subjects for ${rClass}.`
                      : `Excluded all subjects for ${rClass}.`
                  );
                };

                if (classSubjects.length === 0) {
                  return (
                    <div className="p-4 rounded-xl bg-surface-container-low text-on-surface-variant text-center">
                      No curriculum subjects configured for {rClass} yet.
                    </div>
                  );
                }

                return (
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                      <span className="font-semibold text-on-surface-variant">
                        Active for Exam: <strong className="text-primary-container">{includedCount} / {classSubjects.length}</strong> subjects
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setAllClassSubjects(true)}
                          className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200 font-semibold hover:bg-emerald-100 cursor-pointer"
                        >
                          Include All
                        </button>
                        <button
                          type="button"
                          onClick={() => setAllClassSubjects(false)}
                          className="px-2.5 py-1 rounded-lg bg-red-50 text-red-800 border border-red-200 font-semibold hover:bg-red-100 cursor-pointer"
                        >
                          Exclude All
                        </button>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                      {classSubjects.map((sub) => {
                        const isIncluded = !currentExcluded.includes(sub.id);
                        return (
                          <label
                            key={sub.id}
                            className={`flex items-start gap-2.5 p-2.5 rounded-xl border cursor-pointer transition-colors ${
                              isIncluded
                                ? 'bg-emerald-50/40 border-emerald-300/60 text-on-surface'
                                : 'bg-red-50/40 border-red-200 text-on-surface-variant opacity-80'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isIncluded}
                              onChange={(e) => toggleClassSubject(sub.id, e.target.checked)}
                              className="w-4 h-4 rounded mt-0.5 text-emerald-700 cursor-pointer"
                            />
                            <div className="min-w-0">
                              <div className={`font-bold truncate ${!isIncluded ? 'line-through text-red-800' : ''}`}>
                                {sub.name}
                              </div>
                              <div className="text-[10px] font-mono text-on-surface-variant">
                                Code {sub.code} &bull; {formatSubjectGroupsLabel(sub)}
                              </div>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Step 2B: Exam Routine & Paper Inspector Assignment */}
            <div className="rounded-2xl bg-surface-container-lowest border border-outline-variant/25 p-6 space-y-5 text-xs">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-secondary">
                  Step 2B &bull; Routine Schedule &amp; Examiners
                </span>
                <h2 className="text-base font-bold text-on-surface">
                  Examination Routine &amp; Paper Inspector Assignment
                </h2>
                <p className="text-on-surface-variant mt-0.5">
                  Schedule dates and rooms for included subjects, and assign the responsible Teacher who will enter marks.
                </p>
              </div>

            <form
              onSubmit={handleAddRoutineItem}
              className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-4 rounded-xl bg-surface-container-low border border-outline-variant/20"
            >
              <div>
                <label className="block font-semibold mb-1">Exam Date</label>
                <input type="date" value={rDate} onChange={(e) => setRDate(e.target.value)} className="w-full px-2.5 py-1.5 rounded-lg bg-white border border-outline-variant/30 font-mono" />
              </div>
              <div>
                <label className="block font-semibold mb-1">Time Slot</label>
                <input type="text" value={rTime} onChange={(e) => setRTime(e.target.value)} className="w-full px-2.5 py-1.5 rounded-lg bg-white border border-outline-variant/30 font-mono" />
              </div>
              <div>
                <label className="block font-semibold mb-1">Class</label>
                <select
                  value={rClass}
                  onChange={(e) => {
                    const nextCls = e.target.value;
                    setRClass(nextCls);
                    setRGroup('All');
                    const firstSub = subjects.find((s) => s.classLevel === nextCls);
                    setRSubjectId(firstSub?.id || '');
                  }}
                  className="w-full px-2.5 py-1.5 rounded-lg bg-white border border-outline-variant/30"
                >
                  {markEntryClasses.map((c) => (
                    <option key={c.id} value={c.name}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-semibold mb-1">Group Scope</label>
                <select
                  value={rGroup}
                    onChange={(e) => {
                      const nextGrp = e.target.value as 'All' | AcademicGroup;
                      setRGroup(nextGrp);
                      const firstSub = subjects.find(
                        (s) => s.classLevel === rClass && (nextGrp === 'All' || subjectAppliesToGroup(s, nextGrp))
                      );
                      setRSubjectId(firstSub?.id || '');
                    }}
                  className="w-full px-2.5 py-1.5 rounded-lg bg-white border border-outline-variant/30 font-semibold"
                >
                  <option value="All">All Groups &amp; Combined</option>
                  <option value="General">General (Combined All Groups)</option>
                  <option value="Science">Science</option>
                  <option value="Business Studies">Business Studies</option>
                  <option value="Humanities">Humanities</option>
                </select>
              </div>
              <div>
                <label className="block font-semibold mb-1">Section Scope</label>
                <select
                  value={rSection}
                  onChange={(e) => setRSection(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-lg bg-white border border-outline-variant/30 font-semibold"
                >
                  {(() => {
                    const clsObj = academicClasses.find((c) => c.name === rClass);
                    const secs = getEffectiveSectionsForClassGroup(clsObj, rGroup === 'All' ? 'All' : rGroup);
                    return secs.map((sec) => (
                      <option key={sec} value={sec}>
                        {sec === 'Common' ? 'Combined (All Sections)' : `Section ${sec}`}
                      </option>
                    ));
                  })()}
                </select>
              </div>
              <div>
                <label className="block font-semibold mb-1">Subject ({rClass})</label>
                <select
                  value={effectiveRSubjectId}
                  onChange={(e) => setRSubjectId(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-lg bg-white border border-outline-variant/30 font-semibold"
                >
                  {routineSubjectsForClass.length === 0 ? (
                    <option value="">No subjects match filter</option>
                  ) : (
                    routineSubjectsForClass.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.code}) • {formatSubjectGroupsLabel(s)}
                      </option>
                    ))
                  )}
                </select>
              </div>
              <div>
                <label className="block font-semibold mb-1">Assigned Inspector Teacher</label>
                <select value={rTeacherId} onChange={(e) => setRTeacherId(e.target.value)} className="w-full px-2.5 py-1.5 rounded-lg bg-white border border-outline-variant/30 font-semibold text-secondary">
                  {(teachingStaff.length > 0 ? teachingStaff : teachers).map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-semibold mb-1">Marks Entry Deadline</label>
                <input type="date" value={rDeadline} onChange={(e) => setRDeadline(e.target.value)} className="w-full px-2.5 py-1.5 rounded-lg bg-white border border-outline-variant/30 font-mono" />
              </div>
              <div>
                <label className="block font-semibold mb-1">Room / Hall (Optional)</label>
                <input type="text" placeholder="e.g. Hall 2 (Optional)" value={rRoom} onChange={(e) => setRRoom(e.target.value)} className="w-full px-2.5 py-1.5 rounded-lg bg-white border border-outline-variant/30" />
              </div>
              <div className="flex items-end">
                <button type="submit" className="w-full py-2 rounded-lg bg-secondary text-on-secondary font-bold cursor-pointer">
                  + Add Exam Slot
                </button>
              </div>
            </form>

            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="font-semibold text-on-surface-variant">Filter Routine View by Group:</span>
              <div className="flex flex-wrap gap-1.5">
                {(['All', 'General', 'Science', 'Business Studies', 'Humanities'] as const).map((grp) => (
                  <button
                    key={grp}
                    type="button"
                    onClick={() => setRoutineViewGroup(grp)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold cursor-pointer border ${
                      routineViewGroup === grp
                        ? 'bg-secondary text-on-secondary border-secondary'
                        : 'bg-surface-container-low text-on-surface-variant border-outline-variant/25 hover:text-on-surface'
                    }`}
                  >
                    {grp === 'All' ? 'All Tracks' : grp === 'General' ? 'Combined (General)' : grp}
                  </button>
                ))}
              </div>
            </div>

            <div className="overflow-x-auto border border-outline-variant/20 rounded-xl">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-surface-container-low text-on-surface-variant">
                    <th className="py-2.5 px-3 font-semibold">Date &amp; Time</th>
                    <th className="py-2.5 px-3 font-semibold">Subject, Class &amp; Group</th>
                    <th className="py-2.5 px-3 font-semibold">Room</th>
                    <th className="py-2.5 px-3 font-semibold">Inspector Teacher</th>
                    <th className="py-2.5 px-3 font-semibold">Entry Deadline</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Remove</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/15">
                  {(() => {
                    const visibleRoutine = (currentExam.examRoutine || []).filter((slot) => {
                      if (routineViewGroup === 'All') return true;
                      const slotSub = subjects.find((s) => s.id === slot.subjectId);
                      if (slotSub) return subjectAppliesToGroup(slotSub, routineViewGroup);
                      const effectiveSlotGroup = slot.group || 'General';
                      return effectiveSlotGroup === routineViewGroup || effectiveSlotGroup === 'General';
                    });
                    if (visibleRoutine.length === 0) {
                      return (
                        <tr>
                          <td colSpan={6} className="p-6 text-center text-on-surface-variant">
                            No routine slots match this filter yet.
                          </td>
                        </tr>
                      );
                    }
                    return visibleRoutine.map((slot) => {
                      const inspector = teachers.find((t) => t.id === slot.inspectorTeacherId);
                      const slotSub = subjects.find((s) => s.id === slot.subjectId);
                      const slotGroupLabel = slotSub
                        ? formatSubjectGroupsLabel(slotSub)
                        : slot.group === 'General' || !slot.group
                        ? 'Combined (General)'
                        : slot.group;
                      return (
                        <tr key={slot.id} className="hover:bg-surface-container-low/40">
                          <td className="py-2.5 px-3 font-mono tabular-nums">
                            <div className="font-bold">{formatDateDDMMYYYY(slot.date)}</div>
                            <div className="text-[10px] text-on-surface-variant">{slot.time}</div>
                          </td>
                          <td className="py-2.5 px-3">
                            <div className="font-semibold flex flex-wrap items-center gap-1.5">
                              <span>{slot.subjectName}</span>
                              <span className="px-1.5 py-0.5 rounded bg-secondary/10 text-secondary text-[10px] font-bold">
                                {slotGroupLabel}
                              </span>
                              {slot.sectionName && slot.sectionName !== 'Common' && (
                                <span className="px-1.5 py-0.5 rounded bg-primary-fixed/40 text-primary-container text-[10px] font-bold">
                                  Sec {slot.sectionName}
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] text-on-surface-variant">{slot.className}</div>
                          </td>
                          <td className="py-2.5 px-3">
                            {slot.room?.trim() ? slot.room : <span className="text-on-surface-variant italic">—</span>}
                          </td>
                          <td className="py-2.5 px-3 font-semibold text-secondary">
                            {inspector?.name || 'Assigned Faculty'}
                          </td>
                          <td className="py-2.5 px-3 font-mono text-primary-container font-semibold">
                            {formatDateDDMMYYYY(slot.entryDeadline)}
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingRoutineItem({
                                  ...slot,
                                  sectionName: slot.sectionName || 'Common',
                                });
                                setEditingRoutineOriginalSlot({
                                  className: slot.className,
                                  sectionName: slot.sectionName || 'Common',
                                  subjectId: slot.subjectId,
                                });
                                setEditingRoutineGroup(slot.group || 'All');
                              }}
                              className="p-1 text-secondary hover:bg-secondary/10 rounded cursor-pointer mr-1"
                              title="Edit Routine Item & Paper Inspector"
                            >
                              <span className="material-symbols-outlined text-[16px]">edit</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRemoveRoutineItem(slot.id)}
                              className="p-1 text-error hover:bg-error-container/20 rounded cursor-pointer"
                              title="Delete Routine Item"
                            >
                              <span className="material-symbols-outlined text-[16px]">delete</span>
                            </button>
                          </td>
                        </tr>
                      );
                    });
                  })()}
                </tbody>
              </table>
            </div>
            </div>
          </div>

          {editingRoutineItem && (
            <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
              <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-outline-variant/30 space-y-4 text-xs">
                <div className="flex items-center justify-between pb-3 border-b border-outline-variant/20">
                  <div>
                    <h3 className="text-sm font-bold text-on-surface">
                      Edit Examination Routine &amp; Inspector Assignment
                    </h3>
                    <p className="text-[11px] text-on-surface-variant">
                      Changes sync across Admin, Teacher, and Student portals immediately.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingRoutineItem(null);
                      setEditingRoutineOriginalSlot(null);
                    }}
                    className="p-1 rounded-lg hover:bg-surface-container text-on-surface-variant cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[18px]">close</span>
                  </button>
                </div>

                {(() => {
                  const editClsObj = academicClasses.find(
                    (c) => c.name === editingRoutineItem.className
                  );
                  const editSections = getEffectiveSectionsForClassGroup(
                    editClsObj,
                    editingRoutineGroup === 'All' ? 'All' : editingRoutineGroup
                  );
                  const editSectionOptions = Array.from(
                    new Set([
                      'Common',
                      ...editSections,
                      ...(editingRoutineItem.sectionName ? [editingRoutineItem.sectionName] : []),
                    ])
                  );
                  const editFilteredSubjects = sortSubjectsByOrder(
                    subjects.filter(
                      (s) =>
                        s.classLevel === editingRoutineItem.className &&
                        (editingRoutineGroup === 'All' ||
                          subjectAppliesToGroup(s, editingRoutineGroup))
                    )
                  );
                  const staffPool = teachingStaff.length > 0 ? teachingStaff : teachers;

                  return (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block font-semibold text-on-surface-variant mb-1">
                          Class Level
                        </label>
                        <select
                          value={editingRoutineItem.className}
                          onChange={(e) => {
                            const nextCls = e.target.value;
                            const classSubs = sortSubjectsByOrder(
                              subjects.filter((s) => s.classLevel === nextCls)
                            );
                            const nextSub = classSubs[0];
                            setEditingRoutineGroup('All');
                            setEditingRoutineItem({
                              ...editingRoutineItem,
                              className: nextCls,
                              sectionName: 'Common',
                              subjectId: nextSub?.id || editingRoutineItem.subjectId,
                              subjectName: nextSub?.name || editingRoutineItem.subjectName,
                              group: nextSub?.group,
                            });
                          }}
                          className="w-full px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 font-semibold"
                        >
                          {visibleClasses.map((c) => (
                            <option key={c.id} value={c.name}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block font-semibold text-on-surface-variant mb-1">
                          Group Filter
                        </label>
                        <select
                          value={editingRoutineGroup}
                          onChange={(e) => {
                            const nextGrp = e.target.value as 'All' | AcademicGroup;
                            setEditingRoutineGroup(nextGrp);
                            const matchingSubs = sortSubjectsByOrder(
                              subjects.filter(
                                (s) =>
                                  s.classLevel === editingRoutineItem.className &&
                                  (nextGrp === 'All' || subjectAppliesToGroup(s, nextGrp))
                              )
                            );
                            if (
                              matchingSubs.length > 0 &&
                              !matchingSubs.some((s) => s.id === editingRoutineItem.subjectId)
                            ) {
                              setEditingRoutineItem({
                                ...editingRoutineItem,
                                subjectId: matchingSubs[0].id,
                                subjectName: matchingSubs[0].name,
                                group: matchingSubs[0].group,
                              });
                            }
                          }}
                          className="w-full px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 font-semibold"
                        >
                          <option value="All">All Groups / Combined</option>
                          <option value="General">General (Combined All Groups)</option>
                          <option value="Science">Science</option>
                          <option value="Business Studies">Business Studies</option>
                          <option value="Humanities">Humanities</option>
                        </select>
                      </div>

                      <div>
                        <label className="block font-semibold text-on-surface-variant mb-1">
                          Section Scope
                        </label>
                        <select
                          value={editingRoutineItem.sectionName || 'Common'}
                          onChange={(e) =>
                            setEditingRoutineItem({
                              ...editingRoutineItem,
                              sectionName: e.target.value,
                            })
                          }
                          className="w-full px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 font-semibold"
                        >
                          {editSectionOptions.map((sec) => (
                            <option key={sec} value={sec}>
                              {sec === 'Common' ? 'Combined (All Sections)' : `Section ${sec}`}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block font-semibold text-on-surface-variant mb-1">
                          Subject
                        </label>
                        <select
                          value={editingRoutineItem.subjectId}
                          onChange={(e) => {
                            const subObj = subjects.find((s) => s.id === e.target.value);
                            setEditingRoutineItem({
                              ...editingRoutineItem,
                              subjectId: e.target.value,
                              subjectName: subObj?.name || editingRoutineItem.subjectName,
                              group: subObj?.group,
                            });
                          }}
                          className="w-full px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 font-bold text-primary-container"
                        >
                          {editFilteredSubjects.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name} ({s.code})
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block font-semibold text-on-surface-variant mb-1">
                          Exam Date
                        </label>
                        <input
                          type="date"
                          value={editingRoutineItem.date}
                          onChange={(e) =>
                            setEditingRoutineItem({ ...editingRoutineItem, date: e.target.value })
                          }
                          className="w-full px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 font-semibold font-mono"
                        />
                      </div>

                      <div>
                        <label className="block font-semibold text-on-surface-variant mb-1">
                          Exam Time
                        </label>
                        <input
                          type="text"
                          value={editingRoutineItem.time}
                          onChange={(e) =>
                            setEditingRoutineItem({ ...editingRoutineItem, time: e.target.value })
                          }
                          placeholder="09:00 AM - 12:00 PM"
                          className="w-full px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 font-semibold"
                        />
                      </div>

                      <div>
                        <label className="block font-semibold text-on-surface-variant mb-1">
                          Room No
                        </label>
                        <input
                          type="text"
                          value={editingRoutineItem.room || ''}
                          onChange={(e) =>
                            setEditingRoutineItem({ ...editingRoutineItem, room: e.target.value })
                          }
                          placeholder="e.g. Room 204"
                          className="w-full px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 font-semibold"
                        />
                      </div>

                      <div>
                        <label className="block font-semibold text-on-surface-variant mb-1">
                          Marks Entry Deadline
                        </label>
                        <input
                          type="date"
                          value={editingRoutineItem.entryDeadline}
                          onChange={(e) =>
                            setEditingRoutineItem({
                              ...editingRoutineItem,
                              entryDeadline: e.target.value,
                            })
                          }
                          className="w-full px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 font-mono text-primary-container font-bold"
                        />
                      </div>

                      <div className="sm:col-span-2">
                        <label className="block font-semibold text-on-surface-variant mb-1">
                          Paper Inspector / Examiner
                        </label>
                        <select
                          value={editingRoutineItem.inspectorTeacherId}
                          onChange={(e) =>
                            setEditingRoutineItem({
                              ...editingRoutineItem,
                              inspectorTeacherId: e.target.value,
                            })
                          }
                          className="w-full px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 font-bold text-secondary"
                        >
                          {staffPool.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.name} ({t.designation || 'Teacher'})
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  );
                })()}

                <div className="flex items-center justify-end gap-2 pt-3 border-t border-outline-variant/20">
                  <button
                    type="button"
                    onClick={() => {
                      setEditingRoutineItem(null);
                      setEditingRoutineOriginalSlot(null);
                    }}
                    className="px-4 py-2 rounded-xl bg-surface-container hover:bg-surface-container-high font-bold cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveEditedRoutineItem}
                    className="px-4 py-2 rounded-xl bg-secondary text-on-secondary font-bold hover:bg-secondary/90 cursor-pointer shadow-xs"
                  >
                    Save Changes
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* SUB-TAB 2: SUBJECT REGISTRATION & EXAMINER MAPPING */}
      {subTab === 'registration-examiners' && (
        <div className="space-y-6">
          {/* Panel A: Bulk Elective & 4th Subject Roster */}
          {(() => {
            const regClsObj = academicClasses.find((c) => c.name === regClass) || visibleClasses[0];
            const regClassGroups = (regClsObj?.groups || []).filter(
              (g): g is AcademicGroup => g !== 'General'
            );
            const effRegGroup: 'All' | AcademicGroup =
              regGroup !== 'All' && regClassGroups.includes(regGroup) ? regGroup : 'All';
            const regSections = getEffectiveSectionsForClassGroup(regClsObj, effRegGroup);
            const effRegSection =
              regSection === 'ALL' || regSections.includes(regSection)
                ? regSection
                : 'ALL';

            const cohortStudents = students.filter((s) => {
              if (s.status !== 'Active') return false;
              if (s.className !== regClass) return false;
              if (effRegGroup !== 'All' && s.group !== effRegGroup) return false;
              if (effRegSection !== 'ALL' && s.sectionName !== effRegSection) return false;
              if (regGender !== 'All' && (s.gender || 'Male') !== regGender) return false;
              return true;
            });

            const bulkFourthCandidates = sortSubjectsByOrder(
              subjects.filter(
                (s) =>
                  s.classLevel === regClass &&
                  s.canBeFourthSubject &&
                  (effRegGroup === 'All' || subjectAppliesToGroup(s, effRegGroup)) &&
                  (regGender !== 'Male' || s.genderRestriction !== 'Female')
              )
            );

            const getRowSelection = (stu: (typeof students)[number]) =>
              draftSelections[stu.id] || {
                electiveSubjectIds: stu.electiveSubjectIds || [],
                optionalFourthSubjectId: stu.optionalFourthSubjectId || '',
              };

            const handleApplyBulkFourth = () => {
              if (!bulkFourthSubId) return;
              const targetSub = subjects.find((s) => s.id === bulkFourthSubId);
              if (!targetSub) return;
              const nextDrafts = { ...draftSelections };
              let appliedCount = 0;
              for (const stu of cohortStudents) {
                if (
                  subjectAppliesToGroup(targetSub, stu.group) &&
                  isStudentGenderEligibleForSubject(targetSub, stu.gender)
                ) {
                  const cur = nextDrafts[stu.id] || {
                    electiveSubjectIds: stu.electiveSubjectIds || [],
                    optionalFourthSubjectId: stu.optionalFourthSubjectId || '',
                  };
                  nextDrafts[stu.id] = {
                    electiveSubjectIds: cur.electiveSubjectIds.filter((id) => id !== bulkFourthSubId),
                    optionalFourthSubjectId: bulkFourthSubId,
                  };
                  appliedCount++;
                }
              }
              setDraftSelections(nextDrafts);
              showToast(`Staged "${targetSub.name}" as 4th Subject for ${appliedCount} eligible candidate(s). Click Save Subject Registrations to commit.`);
            };

            const handleSaveBulkSubjects = () => {
              const payload = cohortStudents.map((stu) => {
                const sel = getRowSelection(stu);
                return {
                  studentId: stu.id,
                  electiveSubjectIds: sel.electiveSubjectIds,
                  optionalFourthSubjectId: sel.optionalFourthSubjectId,
                };
              });
              bulkUpdateStudentSubjects(payload);
              showToast(`Saved elective & 4th subject registrations for ${payload.length} student(s).`);
            };

            return (
              <div className="rounded-2xl bg-surface-container-lowest border border-outline-variant/25 p-6 space-y-5 text-xs">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-outline-variant/15 pb-4">
                  <div>
                    <h2 className="text-base font-bold text-on-surface">
                      Bulk Elective &amp; 4th Subject Registration ({regClass})
                    </h2>
                    <p className="text-on-surface-variant mt-0.5">
                      Compulsory &amp; faith subjects route automatically by Class, Group, and Religion. Assign or batch-update optional 4th subjects and group electives here.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleSaveBulkSubjects}
                    disabled={cohortStudents.length === 0}
                    className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-primary-container hover:bg-primary disabled:opacity-50 text-on-primary font-bold cursor-pointer shrink-0"
                  >
                    <span className="material-symbols-outlined text-[16px]">save</span>
                    Save Subject Registrations
                  </button>
                </div>

                {/* Filters + Bulk Action */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 items-end">
                  <div>
                    <label className="block font-semibold text-on-surface-variant uppercase mb-1">Class</label>
                    <select
                      value={regClass}
                      onChange={(e) => {
                        setRegClass(e.target.value);
                        setRegGroup('All');
                        setRegSection('ALL');
                      }}
                      className="w-full px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 font-semibold"
                    >
                      {visibleClasses.map((c) => (
                        <option key={c.id} value={c.name}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                  {regClassGroups.length > 0 && (
                    <div>
                      <label className="block font-semibold text-on-surface-variant uppercase mb-1">Group</label>
                      <select
                        value={effRegGroup}
                        onChange={(e) => {
                          setRegGroup(e.target.value as 'All' | AcademicGroup);
                          setRegSection('ALL');
                        }}
                        className="w-full px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 font-semibold"
                      >
                        <option value="All">All Groups</option>
                        {regClassGroups.map((grp) => (
                          <option key={grp} value={grp}>{grp}</option>
                        ))}
                      </select>
                    </div>
                  )}
                  <div>
                    <label className="block font-semibold text-on-surface-variant uppercase mb-1">Section</label>
                    <select
                      value={effRegSection}
                      onChange={(e) => setRegSection(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 font-semibold"
                    >
                      <option value="ALL">All Sections</option>
                      {regSections.map((sec) => (
                        <option key={sec} value={sec}>
                          {sec === 'Common' ? 'Combined' : `Section ${sec}`}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block font-semibold text-on-surface-variant uppercase mb-1">Gender Filter</label>
                    <select
                      value={regGender}
                      onChange={(e) => setRegGender(e.target.value as 'All' | 'Male' | 'Female')}
                      className="w-full px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 font-semibold"
                    >
                      <option value="All">All Students</option>
                      <option value="Female">Female Only</option>
                      <option value="Male">Male Only</option>
                    </select>
                  </div>
                  <div className={regClassGroups.length > 0 ? 'lg:col-span-2' : 'lg:col-span-3'}>
                    <label className="block font-semibold text-on-surface-variant uppercase mb-1">
                      Batch-Assign Optional 4th Subject
                    </label>
                    <div className="flex gap-2">
                      <select
                        value={bulkFourthSubId}
                        onChange={(e) => setBulkFourthSubId(e.target.value)}
                        className="flex-1 px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 font-semibold"
                      >
                        <option value="">Choose 4th subject...</option>
                        {bulkFourthCandidates.map((sub) => (
                          <option key={sub.id} value={sub.id}>
                            {sub.name} ({sub.code}){sub.genderRestriction === 'Female' ? ' · Female Only' : ''}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        disabled={!bulkFourthSubId || cohortStudents.length === 0}
                        onClick={handleApplyBulkFourth}
                        className="px-3.5 py-2 rounded-xl bg-secondary text-on-secondary font-bold disabled:opacity-50 cursor-pointer shrink-0"
                      >
                        Apply All
                      </button>
                    </div>
                  </div>
                </div>

                {/* Roll-Range / Comma-Roll Quick Assignment Bar */}
                <div className="p-3.5 rounded-xl bg-surface-container-low/70 border border-outline-variant/25 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-on-surface">Quick Roll-Range 4th Subject Assignment:</span>
                    <input
                      type="text"
                      placeholder="e.g. 1-25 or 2, 7, 14"
                      value={rollRangeInput}
                      onChange={(e) => setRollRangeInput(e.target.value)}
                      className="px-3 py-1.5 rounded-lg bg-white border border-outline-variant/30 text-xs font-mono w-44"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={!bulkFourthSubId || !rollRangeInput.trim()}
                      onClick={() => {
                        if (!bulkFourthSubId || !rollRangeInput.trim()) return;
                        const targetSub = subjects.find((s) => s.id === bulkFourthSubId);
                        if (!targetSub) return;
                        const matchedRolls = new Set<number>();
                        const parts = rollRangeInput.split(',');
                        for (const p of parts) {
                          const trimmed = p.trim();
                          if (trimmed.includes('-')) {
                            const [startStr, endStr] = trimmed.split('-');
                            const start = parseInt(startStr, 10);
                            const end = parseInt(endStr, 10);
                            if (!Number.isNaN(start) && !Number.isNaN(end)) {
                              for (let r = Math.min(start, end); r <= Math.max(start, end); r++) {
                                matchedRolls.add(r);
                              }
                            }
                          } else {
                            const r = parseInt(trimmed, 10);
                            if (!Number.isNaN(r)) matchedRolls.add(r);
                          }
                        }
                        const nextDrafts = { ...draftSelections };
                        let count = 0;
                        for (const stu of cohortStudents) {
                          if (matchedRolls.has(stu.rollNumber)) {
                            if (
                              subjectAppliesToGroup(targetSub, stu.group) &&
                              isStudentGenderEligibleForSubject(targetSub, stu.gender)
                            ) {
                              const cur = nextDrafts[stu.id] || {
                                electiveSubjectIds: stu.electiveSubjectIds || [],
                                optionalFourthSubjectId: stu.optionalFourthSubjectId || '',
                              };
                              nextDrafts[stu.id] = {
                                electiveSubjectIds: cur.electiveSubjectIds.filter((id) => id !== bulkFourthSubId),
                                optionalFourthSubjectId: bulkFourthSubId,
                              };
                              count++;
                            }
                          }
                        }
                        setDraftSelections(nextDrafts);
                        showToast(`Assigned 4th subject "${targetSub.name}" to ${count} student(s) by roll range. Click Save Subject Registrations.`);
                      }}
                      className="px-3.5 py-1.5 rounded-lg bg-secondary text-on-secondary font-bold disabled:opacity-50 cursor-pointer"
                    >
                      Assign by Roll Range
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const nextDrafts = { ...draftSelections };
                        for (const stu of cohortStudents) {
                          const cur = nextDrafts[stu.id] || {
                            electiveSubjectIds: stu.electiveSubjectIds || [],
                            optionalFourthSubjectId: stu.optionalFourthSubjectId || '',
                          };
                          nextDrafts[stu.id] = { ...cur, optionalFourthSubjectId: '' };
                        }
                        setDraftSelections(nextDrafts);
                        showToast('Cleared 4th subject for filtered cohort. Click Save Subject Registrations.');
                      }}
                      className="px-3 py-1.5 rounded-lg bg-surface-container text-on-surface hover:bg-surface-container-high font-semibold cursor-pointer"
                    >
                      Clear 4th Subject
                    </button>
                  </div>
                </div>

                {/* Registration Matrix Table */}
                <div className="overflow-x-auto rounded-xl border border-outline-variant/20">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-surface-container-low text-on-surface-variant border-b border-outline-variant/20">
                        <th className="py-2.5 px-3 font-semibold">Roll / Student</th>
                        <th className="py-2.5 px-3 font-semibold">Group · Faith · Gender</th>
                        <th className="py-2.5 px-3 font-semibold">Auto-Routed Compulsory</th>
                        <th className="py-2.5 px-3 font-semibold">Main Group Electives</th>
                        <th className="py-2.5 px-3 font-semibold">Optional 4th Subject</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-outline-variant/15">
                      {cohortStudents.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="p-6 text-center text-on-surface-variant">
                            No active students found in this Class / Filter.
                          </td>
                        </tr>
                      ) : (
                        cohortStudents.map((stu) => {
                          const rowSel = getRowSelection(stu);
                          const autoSubs = sortSubjectsByOrder(
                            getAutoRoutedSubjectsForStudent(subjects, stu)
                          );
                          const mainPool = sortSubjectsByOrder(
                            subjects.filter(
                              (s) =>
                                s.classLevel === stu.className &&
                                !s.isCompulsory &&
                                !s.excludeFromGpa &&
                                !s.religionRestriction &&
                                subjectAppliesToGroup(s, stu.group) &&
                                isStudentGenderEligibleForSubject(s, stu.gender) &&
                                s.id !== rowSel.optionalFourthSubjectId
                            )
                          );
                          const fourthPool = sortSubjectsByOrder(
                            subjects.filter(
                              (s) =>
                                s.classLevel === stu.className &&
                                s.canBeFourthSubject &&
                                subjectAppliesToGroup(s, stu.group) &&
                                isStudentGenderEligibleForSubject(s, stu.gender)
                            )
                          );

                          return (
                            <tr key={stu.id} className="hover:bg-surface-container-low/40 align-top">
                              <td className="py-2.5 px-3">
                                <div className="font-mono font-bold text-on-surface tabular-nums">
                                  #{stu.rollNumber} · {stu.fullName}
                                </div>
                                <div className="text-[10px] font-mono text-on-surface-variant">{stu.systemId}</div>
                              </td>
                              <td className="py-2.5 px-3">
                                <div className="font-semibold text-on-surface">{stu.group}</div>
                                <div className="text-[10px] text-on-surface-variant">
                                  {stu.religionGroup} · {stu.gender || 'Male'}
                                </div>
                              </td>
                              <td className="py-2.5 px-3">
                                <span className="font-mono font-semibold text-emerald-800">
                                  {autoSubs.length} auto-routed
                                </span>
                                <div className="text-[10px] text-on-surface-variant truncate max-w-[190px]">
                                  {autoSubs.map((a) => a.code).join(', ')}
                                </div>
                              </td>
                              <td className="py-2.5 px-3">
                                {mainPool.length === 0 ? (
                                  <span className="text-on-surface-variant italic">None</span>
                                ) : (
                                  <div className="flex flex-wrap gap-1.5 max-w-[280px]">
                                    {mainPool.map((sub) => {
                                      const checked = rowSel.electiveSubjectIds.includes(sub.id);
                                      return (
                                        <label
                                          key={sub.id}
                                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-[10px] font-semibold cursor-pointer ${
                                            checked
                                              ? 'bg-primary-container text-on-primary border-primary-container'
                                              : 'bg-white text-on-surface border-outline-variant/30'
                                          }`}
                                        >
                                          <input
                                            type="checkbox"
                                            checked={checked}
                                            onChange={(e) => {
                                              const nextElec = e.target.checked
                                                ? Array.from(new Set([...rowSel.electiveSubjectIds, sub.id]))
                                                : rowSel.electiveSubjectIds.filter((id) => id !== sub.id);
                                              setDraftSelections({
                                                ...draftSelections,
                                                [stu.id]: {
                                                  ...rowSel,
                                                  electiveSubjectIds: nextElec,
                                                },
                                              });
                                            }}
                                          />
                                          <span>{sub.name} ({sub.code})</span>
                                        </label>
                                      );
                                    })}
                                  </div>
                                )}
                              </td>
                              <td className="py-2.5 px-3">
                                <select
                                  value={rowSel.optionalFourthSubjectId}
                                  onChange={(e) => {
                                    const nextFourth = e.target.value;
                                    setDraftSelections({
                                      ...draftSelections,
                                      [stu.id]: {
                                        electiveSubjectIds: rowSel.electiveSubjectIds.filter(
                                          (id) => id !== nextFourth
                                        ),
                                        optionalFourthSubjectId: nextFourth,
                                      },
                                    });
                                  }}
                                  className="w-full min-w-[180px] px-2.5 py-1.5 rounded-lg bg-white border border-outline-variant/30 text-xs font-semibold"
                                >
                                  <option value="">None</option>
                                  {fourthPool.map((sub) => (
                                    <option key={sub.id} value={sub.id}>
                                      {sub.name} ({sub.code})
                                      {sub.genderRestriction === 'Female' ? ' · Female Only' : ''}
                                    </option>
                                  ))}
                                </select>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })()}

          {/* Panel B: Subject-Wise Examiner & Paper Inspector Assignment */}
          {(() => {
            const exClsObj =
              academicClasses.find((c) => c.name === examinerClass) || visibleClasses[0];
            const exSections = Array.from(
              new Set(['Common', ...getEffectiveSectionsForClassGroup(exClsObj, 'All')])
            );
            const effExSection = exSections.includes(examinerSection)
              ? examinerSection
              : 'Common';
            const exSubjects = sortSubjectsByOrder(
              subjects.filter(
                (s) =>
                  s.classLevel === examinerClass &&
                  !(currentExam.excludedSubjectIds || []).includes(s.id)
              )
            );
            const staffPool = teachingStaff.length > 0 ? teachingStaff : teachers;
            const currentAssignments = currentExam.examinerAssignments || [];

            return (
              <div className="rounded-2xl bg-surface-container-lowest border border-outline-variant/25 p-6 space-y-5 text-xs">
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-outline-variant/20 pb-3">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-primary-container">
                      Panel B &bull; Strict Faculty Access Control
                    </span>
                    <h2 className="text-base font-bold text-on-surface">
                      Subject-Wise Paper Inspector &amp; Examiner Assignment
                    </h2>
                    <p className="text-on-surface-variant mt-0.5">
                      Teachers only see subjects and mark entry rosters explicitly assigned to them here or in the Routine table.
                    </p>
                  </div>
                  <span className="px-3 py-1.5 rounded-xl bg-surface-container-low border border-outline-variant/25 font-mono font-bold text-on-surface">
                    Active Assignments: {currentAssignments.length}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 p-4 rounded-xl bg-surface-container-low border border-outline-variant/20">
                  <div>
                    <label className="block font-semibold text-on-surface-variant mb-1">
                      Class Level
                    </label>
                    <select
                      value={examinerClass}
                      onChange={(e) => {
                        setExaminerClass(e.target.value);
                        setExaminerSection('Common');
                      }}
                      className="w-full px-3 py-2 rounded-lg bg-white border border-outline-variant/30 font-semibold"
                    >
                      {markEntryClasses.map((c) => (
                        <option key={c.id} value={c.name}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block font-semibold text-on-surface-variant mb-1">
                      Section Scope
                    </label>
                    <select
                      value={effExSection}
                      onChange={(e) => setExaminerSection(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-white border border-outline-variant/30 font-semibold"
                    >
                      {exSections.map((sec) => (
                        <option key={sec} value={sec}>
                          {sec === 'Common' ? 'All Sections (Combined)' : `Section ${sec}`}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="overflow-x-auto rounded-xl border border-outline-variant/20">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-surface-container-low text-on-surface-variant border-b border-outline-variant/20">
                        <th className="py-2.5 px-3 font-semibold">Subject &amp; Group</th>
                        <th className="py-2.5 px-3 font-semibold">Scope</th>
                        <th className="py-2.5 px-3 font-semibold">Assigned Teacher</th>
                        <th className="py-2.5 px-3 font-semibold">Entry Deadline</th>
                        <th className="py-2.5 px-3 font-semibold text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-outline-variant/15">
                      {exSubjects.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="p-6 text-center text-on-surface-variant">
                            No active subjects configured for {examinerClass}.
                          </td>
                        </tr>
                      ) : (
                        exSubjects.map((sub) => {
                          const existingAssign = currentAssignments.find(
                            (a) =>
                              a.className === examinerClass &&
                              a.sectionName === effExSection &&
                              a.subjectId === sub.id
                          );
                          const inheritedAllAssign =
                            effExSection !== 'Common'
                              ? currentAssignments.find(
                                  (a) =>
                                    a.className === examinerClass &&
                                    a.sectionName === 'Common' &&
                                    a.subjectId === sub.id
                                )
                              : undefined;
                          const draftKey = `${examinerClass}:${effExSection}:${sub.id}`;
                          const selectedTeacherId =
                            existingAssign?.teacherId || '';
                          const deadlineVal =
                            examinerDeadlineDrafts[draftKey] ??
                            existingAssign?.deadline ??
                            getTodayDateStr();

                          return (
                            <tr key={sub.id} className="hover:bg-surface-container-low/40">
                              <td className="py-2.5 px-3">
                                <div className="font-bold text-on-surface">
                                  {sub.name} <span className="font-mono text-on-surface-variant">({sub.code})</span>
                                </div>
                                <div className="text-[10px] text-on-surface-variant">
                                  {formatSubjectGroupsLabel(sub)}
                                </div>
                              </td>
                              <td className="py-2.5 px-3">
                                <span className="font-semibold text-on-surface">
                                  {effExSection === 'Common'
                                    ? 'All Sections'
                                    : `Section ${effExSection}`}
                                </span>
                                {inheritedAllAssign && !existingAssign && (
                                  <div className="text-[10px] text-secondary font-medium">
                                    Inherits All-Sections examiner
                                  </div>
                                )}
                              </td>
                              <td className="py-2.5 px-3">
                                <select
                                  value={selectedTeacherId}
                                  onChange={(e) => {
                                    const nextTeacherId = e.target.value;
                                    if (!nextTeacherId) {
                                      if (existingAssign) {
                                        removeExaminerAssignment(currentExam.id, existingAssign.id);
                                        showToast(`Removed examiner assignment for ${sub.name}.`);
                                      }
                                      return;
                                    }
                                    setExaminerAssignment({
                                      examId: currentExam.id,
                                      className: examinerClass,
                                      sectionName: effExSection,
                                      subjectId: sub.id,
                                      teacherId: nextTeacherId,
                                      deadline: deadlineVal,
                                    });
                                    const tName =
                                      staffPool.find((t) => t.id === nextTeacherId)?.name ||
                                      'Teacher';
                                    showToast(
                                      `Assigned ${tName} to ${sub.name} (${examinerClass} · ${
                                        effExSection === 'Common' ? 'All Sections' : `Sec ${effExSection}`
                                      }).`
                                    );
                                  }}
                                  className="w-full min-w-[200px] px-2.5 py-1.5 rounded-lg bg-white border border-outline-variant/30 font-semibold text-secondary"
                                >
                                  <option value="">-- Unassigned (No Teacher Access) --</option>
                                  {staffPool.map((t) => (
                                    <option key={t.id} value={t.id}>
                                      {t.name} ({t.designation || 'Teacher'})
                                    </option>
                                  ))}
                                </select>
                              </td>
                              <td className="py-2.5 px-3">
                                <input
                                  type="date"
                                  value={deadlineVal}
                                  onChange={(e) => {
                                    const nextDate = e.target.value;
                                    setExaminerDeadlineDrafts((prev) => ({
                                      ...prev,
                                      [draftKey]: nextDate,
                                    }));
                                    if (existingAssign) {
                                      setExaminerAssignment({
                                        examId: currentExam.id,
                                        className: examinerClass,
                                        sectionName: effExSection,
                                        subjectId: sub.id,
                                        teacherId: existingAssign.teacherId,
                                        deadline: nextDate,
                                      });
                                      showToast(`Updated entry deadline for ${sub.name}.`);
                                    }
                                  }}
                                  className="px-2.5 py-1.5 rounded-lg bg-white border border-outline-variant/30 font-mono text-xs"
                                />
                              </td>
                              <td className="py-2.5 px-3 text-right">
                                {existingAssign ? (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      removeExaminerAssignment(currentExam.id, existingAssign.id);
                                      showToast(`Unassigned examiner for ${sub.name}.`);
                                    }}
                                    className="px-2.5 py-1 rounded-lg bg-red-50 text-red-700 border border-red-200 font-semibold hover:bg-red-100 cursor-pointer"
                                  >
                                    Unassign
                                  </button>
                                ) : (
                                  <span className="text-[11px] text-on-surface-variant italic">
                                    Select teacher to assign
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>

                {currentAssignments.length > 0 && (
                  <div className="pt-2 space-y-2">
                    <h3 className="text-xs font-bold text-on-surface">
                      All Configured Examiner Assignments ({currentAssignments.length})
                    </h3>
                    <div className="overflow-x-auto rounded-xl border border-outline-variant/20">
                      <table className="w-full text-left border-collapse text-[11px]">
                        <thead>
                          <tr className="bg-surface-container-low text-on-surface-variant border-b border-outline-variant/20">
                            <th className="py-2 px-3 font-semibold">Class &amp; Section</th>
                            <th className="py-2 px-3 font-semibold">Subject</th>
                            <th className="py-2 px-3 font-semibold">Assigned Faculty</th>
                            <th className="py-2 px-3 font-semibold">Deadline</th>
                            <th className="py-2 px-3 font-semibold text-right">Manage</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-outline-variant/15">
                          {currentAssignments.map((assign) => {
                            const subObj = subjects.find((s) => s.id === assign.subjectId);
                            const tObj = teachers.find((t) => t.id === assign.teacherId);
                            return (
                              <tr key={assign.id} className="hover:bg-surface-container-low/30">
                                <td className="py-2 px-3 font-semibold">
                                  {assign.className} &middot;{' '}
                                  {assign.sectionName === 'Common'
                                    ? 'All Sections'
                                    : `Sec ${assign.sectionName}`}
                                </td>
                                <td className="py-2 px-3 font-bold text-primary-container">
                                  {subObj ? `${subObj.name} (${subObj.code})` : assign.subjectId}
                                </td>
                                <td className="py-2 px-3 font-semibold text-secondary">
                                  {tObj?.name || 'Faculty'}
                                </td>
                                <td className="py-2 px-3 font-mono">
                                  {formatDateDDMMYYYY(assign.deadline)}
                                </td>
                                <td className="py-2 px-3 text-right space-x-2">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setExaminerClass(assign.className);
                                      setExaminerSection(assign.sectionName || 'Common');
                                    }}
                                    className="px-2 py-0.5 rounded bg-surface-container hover:bg-surface-container-high font-semibold cursor-pointer"
                                  >
                                    Edit
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      removeExaminerAssignment(currentExam.id, assign.id);
                                      showToast('Removed examiner assignment.');
                                    }}
                                    className="px-2 py-0.5 rounded bg-red-50 text-red-700 hover:bg-red-100 font-semibold cursor-pointer"
                                  >
                                    Remove
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      )}

      {/* SUB-TAB 3: MARK ENTRY ROSTER */}
      {subTab === 'mark-entry' && (
        <div className="space-y-6">
          <div className="rounded-2xl bg-surface-container-lowest border border-outline-variant/25 p-6 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-1">
                  Class
                </label>
                <select
                  value={effectiveMarkClass}
                  onChange={(e) => {
                    const nextCls = e.target.value;
                    const clsObj = academicClasses.find((c) => c.name === nextCls);
                    setSelectedClass(nextCls);
                    setSelectedMarkGroup('All');
                    const clsSections = getEffectiveSectionsForClassGroup(clsObj, 'All');
                    setSelectedSection(clsSections[0] || 'Common');
                    const firstSub = subjects.find(
                      (s) =>
                        s.classLevel === nextCls &&
                        !(currentExam?.excludedSubjectIds || []).includes(s.id)
                    );
                    setSelectedSubjectId(firstSub?.id || '');
                  }}
                  className="w-full px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 text-xs font-semibold"
                >
                  {markEntryClasses.map((c) => (
                    <option key={c.id} value={c.name}>{c.name}</option>
                  ))}
                </select>
              </div>

              {markEntryGroups.length > 0 && (
                <div className="md:col-span-3">
                  <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-1">
                    Group Track
                  </label>
                  <select
                    value={effectiveMarkGroup}
                    onChange={(e) => {
                      const nextGrp = e.target.value as 'All' | AcademicGroup;
                      setSelectedMarkGroup(nextGrp);
                      const grpSecs = getEffectiveSectionsForClassGroup(markClassObj, nextGrp);
                      setSelectedSection(grpSecs[0] || 'Common');
                      const firstSub = subjects.find(
                        (s) =>
                          s.classLevel === effectiveMarkClass &&
                          (nextGrp === 'All' || subjectAppliesToGroup(s, nextGrp)) &&
                          !(currentExam?.excludedSubjectIds || []).includes(s.id)
                      );
                      setSelectedSubjectId(firstSub?.id || '');
                    }}
                    className="w-full px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 text-xs font-semibold"
                  >
                    <option value="All">All Groups / Combined</option>
                    {markEntryGroups.map((grp) => (
                      <option key={grp} value={grp}>
                        {grp}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className={markEntryGroups.length > 0 ? 'md:col-span-3' : 'md:col-span-4'}>
                <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-1">
                  Cohort / Section
                </label>
                {isSingleBatchCohort(markEntrySections) ? (
                  <div className="px-3.5 py-2 rounded-xl bg-secondary-fixed/50 border border-outline-variant/25 text-xs font-bold text-on-secondary-container">
                    {formatGroupSectionDisplay(
                      effectiveMarkGroup === 'All' ? currentSubject?.group : effectiveMarkGroup,
                      markEntrySections[0] || 'Common'
                    )}
                  </div>
                ) : (
                  <select
                    value={effectiveMarkSection}
                    onChange={(e) => setSelectedSection(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 text-xs font-semibold"
                  >
                    <option value="ALL">Combined (All Sections)</option>
                    {markEntrySections.map((sec) => (
                      <option key={sec} value={sec}>
                        {effectiveMarkGroup !== 'All'
                          ? formatGroupSectionDisplay(effectiveMarkGroup, sec)
                          : sec === 'Common'
                          ? 'Combined'
                          : `Section ${sec}`}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div className={markEntryGroups.length > 0 ? 'md:col-span-4' : 'md:col-span-6'}>
                <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-1">
                  Subject for {effectiveMarkClass} ({classSubjectsForMarkEntry.length} active)
                </label>
                <select
                  value={currentSubject?.id || ''}
                  onChange={(e) => setSelectedSubjectId(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 text-xs font-bold text-primary-container"
                >
                  {classSubjectsForMarkEntry.length === 0 ? (
                    <option value="">No subjects configured for {effectiveMarkClass}</option>
                  ) : (
                    classSubjectsForMarkEntry.map((sub) => (
                      <option key={sub.id} value={sub.id}>
                        {sub.name} (Code: {sub.code}) • {formatSubjectGroupsLabel(sub)}
                        {sub.religionRestriction ? ` [${sub.religionRestriction} Only]` : ''}
                        {sub.genderRestriction === 'Female' ? ' [Female Only]' : ''}
                        {sub.canBeFourthSubject ? ' [Elective / 4th]' : ''}
                      </option>
                    ))
                  )}
                </select>
              </div>
            </div>
          </div>

          {!currentSubject ? (
            <div className="p-6 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs font-semibold text-center">
              No subjects are configured for <strong>{effectiveMarkClass}</strong> yet. Add subjects in{' '}
              <strong>Institute &rarr; 2. Class-Wise Subjects</strong> first.
            </div>
          ) : (
            <>
              <div className="p-4 rounded-2xl bg-surface-container-lowest border border-outline-variant/25 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 text-xs">
                <div>
                  <span className="font-bold text-on-surface">
                    {currentSubject.name} (Code: {currentSubject.code}) · Total: {currentSubject.totalFullMarks} (Pass: {currentSubject.totalPassMarks})
                  </span>
                  <div className="text-on-surface-variant font-mono mt-0.5 text-[11px] flex flex-wrap gap-x-2">
                    {[
                      cqActive
                        ? `CQ: ${currentSubject.components.cq.fullMarks}/${currentSubject.components.cq.passMarks}`
                        : null,
                      mcqActive
                        ? `MCQ: ${currentSubject.components.mcq.fullMarks}/${currentSubject.components.mcq.passMarks}`
                        : null,
                      pracActive
                        ? `Practical: ${currentSubject.components.practical.fullMarks}/${currentSubject.components.practical.passMarks}`
                        : null,
                      ctActive && ctConfig
                        ? ctConfig.mode === 'subject'
                          ? `CT: ${ctConfig.fullMarks}/${ctConfig.passMarks}${
                              ctConfig.conversionPercent < 100
                                ? ` (${ctConfig.conversionPercent}%)`
                                : ''
                            }`
                          : `CT Weighted ${100 - ctConfig.writtenRatioPercent}%`
                        : null,
                      ...activeCustomHeads.map((c) => {
                        const conv = getEffectiveConversionPercent(c.conversionPercent);
                        return `${c.label}: ${c.fullMarks}/${c.passMarks}${
                          conv < 100 ? ` (${conv}%)` : ''
                        }`;
                      }),
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </div>
                </div>
                <div className="flex items-center gap-3 text-[11px] font-semibold">
                  {isRosterLocked && (
                    <span className="px-2.5 py-1 rounded-lg bg-amber-100 text-amber-900 font-bold">
                      LOCKED ROSTER
                    </span>
                  )}
                  <span className="text-secondary">
                    Inspector: {assignedTeacher ? assignedTeacher.name : 'Assigned Faculty'}
                  </span>
                </div>
              </div>

              {/* Subject Dispatch Status Strip */}
              <div className="rounded-2xl bg-surface-container-lowest border border-outline-variant/25 p-4 space-y-2 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-bold text-on-surface">
                    {effectiveMarkClass} {effectiveMarkSection === 'ALL' ? '' : `(Sec ${effectiveMarkSection})`} · Tabulation Dispatch Tracker
                  </span>
                  <span className="text-[11px] text-on-surface-variant">
                    Click any subject to open its roster &amp; send marks to Tabulation
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
                  {classSubjectsForMarkEntry.map((sub) => {
                    const subMarks = markEntries.filter((m) => {
                      if (m.examId !== currentExam.id || m.subjectId !== sub.id) return false;
                      const stu = students.find((s) => s.id === m.studentId);
                      if (!stu || stu.className !== effectiveMarkClass) return false;
                      if (
                        effectiveMarkSection !== 'ALL' &&
                        effectiveMarkSection !== 'Common' &&
                        stu.sectionName !== effectiveMarkSection
                      ) {
                        return false;
                      }
                      return true;
                    });
                    const subSentCount = subMarks.filter((m) => m.isSentToTabulation).length;
                    const isActive = sub.id === currentSubject.id;
                    return (
                      <button
                        key={sub.id}
                        type="button"
                        onClick={() => setSelectedSubjectId(sub.id)}
                        className={`p-2.5 rounded-xl border text-left transition-colors cursor-pointer ${
                          isActive
                            ? 'bg-primary-container/10 border-primary-container ring-1 ring-primary-container'
                            : 'bg-surface-container-low/60 border-outline-variant/25 hover:bg-surface-container-low'
                        }`}
                      >
                        <div className="font-bold text-on-surface truncate">{sub.name}</div>
                        <div className="flex items-center justify-between text-[10px] font-mono mt-1">
                          <span className="text-on-surface-variant">Entered: {subMarks.length}</span>
                          <span
                            className={`font-bold ${
                              subSentCount > 0 ? 'text-emerald-700' : 'text-amber-700'
                            }`}
                          >
                            {subSentCount > 0 ? `Sent (${subSentCount})` : 'Not Sent'}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {(() => {
                const rosterStates = eligibleStudents.map((stu) => ({
                  stu,
                  state: getStudentMarkState(stu.id),
                }));
                const enteredCount = rosterStates.filter(
                  (r) => !r.state.isPending && !r.state.draft.isAbsent
                ).length;
                const absentCount = rosterStates.filter((r) =>
                  Boolean(r.state.draft.isAbsent)
                ).length;
                const pendingCount = rosterStates.filter((r) => r.state.isPending).length;

                const isSubjectSentToTabulation =
                  eligibleStudents.length > 0 &&
                  eligibleStudents.some((stu) => {
                    const mark = markEntries.find(
                      (m) =>
                        m.examId === currentExam.id &&
                        m.studentId === stu.id &&
                        m.subjectId === currentSubject.id
                    );
                    return mark?.isSentToTabulation;
                  });

                const handleSendCurrentPaperToTabulation = () => {
                  const hasUnsavedDrafts = rosterStates.some(
                    (r) => Boolean(localMarks[scopeKey(r.stu.id)]) && !r.state.isPending
                  );
                  if (hasUnsavedDrafts && !isRosterLocked) {
                    handleSaveCurrentMarks();
                  }
                  sendMarksToTabulation({
                    examId: currentExam.id,
                    subjectId: currentSubject.id,
                    className: effectiveMarkClass,
                    sectionName: effectiveMarkSection,
                  });
                  showToast(`Sent ${currentSubject.name} marks to Tabulation.`);
                };

                const handleBulkSendAllToTabulation = () => {
                  const hasUnsavedDrafts = rosterStates.some(
                    (r) => Boolean(localMarks[scopeKey(r.stu.id)]) && !r.state.isPending
                  );
                  if (hasUnsavedDrafts && !isRosterLocked) {
                    handleSaveCurrentMarks();
                  }
                  bulkSendMarksToTabulation({ examId: currentExam.id });
                  showToast('All roster marks for this examination have been sent to Tabulation.');
                };

                return (
                  <div className="rounded-2xl bg-surface-container-lowest border border-outline-variant/25 p-6 space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <h3 className="font-bold text-sm text-on-surface">
                          Student Roster ({eligibleStudents.length} candidates)
                        </h3>
                        <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono mt-1">
                          <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 font-bold">
                            Entered: {enteredCount}
                          </span>
                          <span className="px-2 py-0.5 rounded bg-red-50 text-red-800 font-bold">
                            Absent (AB): {absentCount}
                          </span>
                          <span className="px-2 py-0.5 rounded bg-surface-container text-on-surface-variant font-bold">
                            Pending: {pendingCount}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded font-bold ${
                              isSubjectSentToTabulation
                                ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                                : 'bg-amber-100 text-amber-900 border border-amber-300'
                            }`}
                          >
                            {isSubjectSentToTabulation ? 'Tabulation: Sent' : 'Tabulation: Not Sent'}
                          </span>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {pendingCount > 0 && !isRosterLocked && (
                          <button
                            type="button"
                            onClick={handleMarkPendingAbsent}
                            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-red-50 text-red-800 border border-red-200 text-xs font-bold hover:bg-red-100 cursor-pointer"
                          >
                            Mark Pending as AB
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={isRosterLocked}
                          onClick={handleSaveCurrentMarks}
                          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary-container text-on-primary text-xs font-bold hover:bg-primary disabled:opacity-50 cursor-pointer"
                        >
                          <span className="material-symbols-outlined text-[16px]">save</span>
                          Save Entered Marks
                        </button>
                        {isSubjectSentToTabulation ? (
                          <button
                            type="button"
                            onClick={() => {
                              recallMarksFromTabulation({
                                examId: currentExam.id,
                                subjectId: currentSubject.id,
                                className: effectiveMarkClass,
                                sectionName: effectiveMarkSection,
                              });
                              showToast(`Recalled ${currentSubject.name} marks from Tabulation.`);
                            }}
                            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 text-xs font-bold hover:bg-amber-100 cursor-pointer"
                            title="Recall marks for this subject from Tabulation"
                          >
                            <span className="material-symbols-outlined text-[16px]">undo</span>
                            Recall from Tabulation
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={handleSendCurrentPaperToTabulation}
                            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold cursor-pointer"
                            title="Save & send entered marks for this paper to Tabulation"
                          >
                            <span className="material-symbols-outlined text-[16px]">send</span>
                            Send to Tabulation
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={handleBulkSendAllToTabulation}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold cursor-pointer"
                          title="Send all entered marks across all classes to Tabulation"
                        >
                          <span className="material-symbols-outlined text-[16px]">all_inbox</span>
                          Bulk Send All to Tabulation
                        </button>
                        {isRosterLocked ? (
                          <button
                            type="button"
                            onClick={handleUnlockCurrentRoster}
                            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-100 text-amber-900 text-xs font-bold hover:bg-amber-200 cursor-pointer"
                          >
                            <span className="material-symbols-outlined text-[16px]">lock_open</span>
                            Unlock Roster
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={handleLockCurrentRoster}
                            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-surface-container text-on-surface text-xs font-bold hover:bg-surface-container-high cursor-pointer"
                          >
                            <span className="material-symbols-outlined text-[16px]">lock</span>
                            Lock Roster
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="bg-surface-container-low text-on-surface-variant">
                            <th className="py-3 px-3 font-semibold">Roll</th>
                            <th className="py-3 px-3 font-semibold">Student Name</th>
                            <th className="py-3 px-3 font-semibold text-center">Absent?</th>
                            {ctActive && ctConfig && (
                              <th className="py-3 px-3 font-semibold text-center bg-amber-500/10 text-amber-900">
                                CT (Max {ctConfig.fullMarks}
                                {ctConfig.mode === 'subject' && ctConfig.conversionPercent < 100
                                  ? ` · ${ctConfig.conversionPercent}%`
                                  : ''}
                                )
                              </th>
                            )}
                            {cqActive && (
                              <th className="py-3 px-3 font-semibold text-center">
                                CQ (Max {currentSubject.components.cq.fullMarks})
                              </th>
                            )}
                            {mcqActive && (
                              <th className="py-3 px-3 font-semibold text-center">
                                MCQ (Max {currentSubject.components.mcq.fullMarks})
                              </th>
                            )}
                            {pracActive && (
                              <th className="py-3 px-3 font-semibold text-center">
                                Practical (Max {currentSubject.components.practical.fullMarks})
                              </th>
                            )}
                            {activeCustomHeads.map((c) => {
                              const conv = getEffectiveConversionPercent(c.conversionPercent);
                              return (
                                <th
                                  key={c.id}
                                  className="py-3 px-3 font-semibold text-center bg-indigo-500/10 text-indigo-950"
                                >
                                  {c.label} (Max {c.fullMarks}
                                  {conv < 100 ? ` · ${conv}%` : ''})
                                </th>
                              );
                            })}
                            <th className="py-3 px-3 font-semibold text-center">Total</th>
                            <th className="py-3 px-3 font-semibold text-center">Grade</th>
                            <th className="py-3 px-3 font-semibold text-center">GP</th>
                            <th className="py-3 px-3 font-semibold text-center">Result</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-outline-variant/10">
                          {rosterStates.map(({ stu, state: st }, rowIdx) => {
                            const { draft, isPending, evalNums } = st;
                            const isFourth = stu.optionalFourthSubjectId === currentSubject.id;
                            const evalRes = evaluateSubjectResult(
                              currentSubject,
                              evalNums,
                              isFourth,
                              currentExam
                            );

                            return (
                              <tr
                                key={stu.id}
                                className={`transition-colors ${
                                  draft.isAbsent
                                    ? 'bg-red-50/50 hover:bg-red-50'
                                    : isPending
                                    ? 'hover:bg-surface-container-low/40'
                                    : 'bg-emerald-50/20 hover:bg-emerald-50/40'
                                }`}
                              >
                                <td className="py-3 px-3 font-bold font-mono tabular-nums">
                                  #{stu.rollNumber}
                                </td>
                                <td className="py-3 px-3">
                                  <span className="font-semibold block">{stu.fullName}</span>
                                  <span className="text-[10px] text-on-surface-variant font-mono">
                                    {stu.systemId} &bull; {formatGroupSectionDisplay(stu.group, stu.sectionName)}
                                    {isFourth && (
                                      <span className="ml-1 text-primary-container font-bold">
                                        · 4th Sub
                                      </span>
                                    )}
                                  </span>
                                </td>
                                <td className="py-3 px-3 text-center">
                                  <label className="inline-flex items-center gap-1 cursor-pointer font-bold text-[11px] text-red-700">
                                    <input
                                      type="checkbox"
                                      disabled={isRosterLocked}
                                      checked={Boolean(draft.isAbsent)}
                                      onChange={(e) => handleToggleAbsent(stu.id, e.target.checked)}
                                      className="w-4 h-4 rounded text-red-600 focus:ring-red-500 cursor-pointer"
                                    />
                                    <span>AB</span>
                                  </label>
                                </td>

                                {ctActive && ctConfig && (
                                  <td className="py-2 px-3 text-center bg-amber-500/5">
                                    {draft.isAbsent ? (
                                      <span className="font-bold font-mono text-red-600 text-xs">AB</span>
                                    ) : (
                                      <input
                                        type="number"
                                        data-mark-cell={`admin-ct-${rowIdx}`}
                                        disabled={isRosterLocked}
                                        min={0}
                                        max={ctConfig.fullMarks}
                                        placeholder="—"
                                        value={draft.ct === undefined ? '' : draft.ct}
                                        onChange={(e) =>
                                          handleScoreChange(stu.id, 'ct', e.target.value)
                                        }
                                        onKeyDown={(e) => handleMarkKeyDown(e, rowIdx, 'ct')}
                                        className="w-16 px-2 py-1.5 text-center font-bold font-mono rounded-lg border border-amber-300 bg-amber-50/50 text-xs placeholder:text-slate-400"
                                      />
                                    )}
                                  </td>
                                )}

                                {cqActive && (
                                  <td className="py-2 px-3 text-center">
                                    {draft.isAbsent ? (
                                      <span className="font-bold font-mono text-red-600 text-xs">AB</span>
                                    ) : (
                                      <input
                                        type="number"
                                        data-mark-cell={`admin-cq-${rowIdx}`}
                                        disabled={isRosterLocked}
                                        min={0}
                                        max={currentSubject.components.cq.fullMarks}
                                        placeholder="—"
                                        value={draft.cq}
                                        onChange={(e) =>
                                          handleScoreChange(stu.id, 'cq', e.target.value)
                                        }
                                        onKeyDown={(e) => handleMarkKeyDown(e, rowIdx, 'cq')}
                                        className="w-16 px-2 py-1.5 text-center font-bold font-mono rounded-lg border border-outline-variant/30 bg-white disabled:bg-surface-container-low disabled:opacity-70 text-xs placeholder:text-slate-400"
                                      />
                                    )}
                                  </td>
                                )}

                                {mcqActive && (
                                  <td className="py-2 px-3 text-center">
                                    {draft.isAbsent ? (
                                      <span className="font-bold font-mono text-red-600 text-xs">AB</span>
                                    ) : (
                                      <input
                                        type="number"
                                        data-mark-cell={`admin-mcq-${rowIdx}`}
                                        disabled={isRosterLocked}
                                        min={0}
                                        max={currentSubject.components.mcq.fullMarks}
                                        placeholder="—"
                                        value={draft.mcq}
                                        onChange={(e) =>
                                          handleScoreChange(stu.id, 'mcq', e.target.value)
                                        }
                                        onKeyDown={(e) => handleMarkKeyDown(e, rowIdx, 'mcq')}
                                        className="w-16 px-2 py-1.5 text-center font-bold font-mono rounded-lg border border-outline-variant/30 bg-white disabled:bg-surface-container-low disabled:opacity-70 text-xs placeholder:text-slate-400"
                                      />
                                    )}
                                  </td>
                                )}

                                {pracActive && (
                                  <td className="py-2 px-3 text-center">
                                    {draft.isAbsent ? (
                                      <span className="font-bold font-mono text-red-600 text-xs">AB</span>
                                    ) : (
                                      <input
                                        type="number"
                                        data-mark-cell={`admin-practical-${rowIdx}`}
                                        disabled={isRosterLocked}
                                        min={0}
                                        max={currentSubject.components.practical.fullMarks}
                                        placeholder="—"
                                        value={draft.practical}
                                        onChange={(e) =>
                                          handleScoreChange(stu.id, 'practical', e.target.value)
                                        }
                                        onKeyDown={(e) => handleMarkKeyDown(e, rowIdx, 'practical')}
                                        className="w-16 px-2 py-1.5 text-center font-bold font-mono rounded-lg border border-outline-variant/30 bg-white disabled:bg-surface-container-low disabled:opacity-70 text-xs placeholder:text-slate-400"
                                      />
                                    )}
                                  </td>
                                )}

                                {activeCustomHeads.map((c) => (
                                  <td key={c.id} className="py-2 px-3 text-center bg-indigo-500/5">
                                    {draft.isAbsent ? (
                                      <span className="font-bold font-mono text-red-600 text-xs">AB</span>
                                    ) : (
                                      <input
                                        type="number"
                                        data-mark-cell={`admin-custom-${c.id}-${rowIdx}`}
                                        disabled={isRosterLocked}
                                        min={0}
                                        max={c.fullMarks}
                                        placeholder="—"
                                        value={draft.customMarks?.[c.id] ?? ''}
                                        onChange={(e) =>
                                          handleCustomScoreChange(
                                            stu.id,
                                            c.id,
                                            c.fullMarks,
                                            e.target.value
                                          )
                                        }
                                        onKeyDown={(e) =>
                                          handleMarkKeyDown(e, rowIdx, `custom-${c.id}`)
                                        }
                                        className="w-16 px-2 py-1.5 text-center font-bold font-mono rounded-lg border border-indigo-300 bg-white disabled:bg-surface-container-low disabled:opacity-70 text-xs placeholder:text-slate-400"
                                      />
                                    )}
                                  </td>
                                ))}
                                <td className="py-3 px-3 text-center font-bold font-mono tabular-nums">
                                  {draft.isAbsent ? (
                                    <span className="text-red-700 font-bold">AB</span>
                                  ) : isPending ? (
                                    <span className="text-on-surface-variant">—</span>
                                  ) : (
                                    evalRes.total
                                  )}
                                </td>
                                <td className="py-3 px-3 text-center font-bold">
                                  {isPending ? (
                                    <span className="text-on-surface-variant">—</span>
                                  ) : (
                                    <span className={draft.isAbsent ? 'text-red-700 font-extrabold' : ''}>
                                      {evalRes.letterGrade}
                                    </span>
                                  )}
                                </td>
                                <td className="py-3 px-3 text-center font-mono font-bold tabular-nums">
                                  {isPending ? (
                                    <span className="text-on-surface-variant">—</span>
                                  ) : draft.isAbsent ? (
                                    '0.0'
                                  ) : (
                                    evalRes.gradePoint.toFixed(1)
                                  )}
                                </td>
                                <td className="py-3 px-3 text-center font-semibold">
                                  <span
                                    className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                                      draft.isAbsent
                                        ? 'bg-red-100 text-red-800'
                                        : isPending
                                        ? 'bg-surface-container text-on-surface-variant'
                                        : evalRes.isPassed
                                        ? 'bg-emerald-50 text-emerald-800'
                                        : 'bg-red-50 text-red-800'
                                    }`}
                                  >
                                    {draft.isAbsent
                                      ? 'Absent (AB)'
                                      : isPending
                                      ? 'Pending'
                                      : evalRes.isPassed
                                      ? 'Passed'
                                      : 'Failed'}
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })()}
            </>
          )}
        </div>
      )}

      {/* SUB-TAB 3: TABULATION SHEET, SUMMARY REPORT & JOINED RESULTS */}
      {subTab === 'tabulation-joined' && (
        <div className="space-y-6">
          {/* Controls & Joined Term Selector */}
          <div className="rounded-2xl bg-surface-container-lowest border border-outline-variant/25 p-6 space-y-4 text-xs no-print">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-outline-variant/20 pb-4">
              <div className="flex flex-wrap items-center gap-3">
                <div>
                  <label className="block font-semibold text-on-surface-variant mb-1">Filter Class</label>
                  <select
                    value={effectiveTabClass}
                    onChange={(e) => {
                      setTabClass(e.target.value);
                      setTabGroup('ALL');
                      setTabSection('ALL');
                    }}
                    className="px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 font-semibold"
                  >
                    <option value="ALL">All Classes</option>
                    {tabClassOptions.map((c) => (
                      <option key={c.id} value={c.name}>{c.name}</option>
                    ))}
                  </select>
                </div>

                {tabClassGroups.length > 0 && (
                  <div>
                    <label className="block font-semibold text-on-surface-variant mb-1">Filter Group</label>
                    <select
                      value={effectiveTabGroup}
                      onChange={(e) => {
                        setTabGroup(e.target.value as 'ALL' | AcademicGroup);
                        setTabSection('ALL');
                      }}
                      className="px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 font-semibold"
                    >
                      <option value="ALL">All Groups</option>
                      {tabClassGroups.map((grp) => (
                        <option key={grp} value={grp}>
                          {grp}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {effectiveTabClass !== 'ALL' && !isSingleBatchCohort(tabSections) && (
                  <div>
                    <label className="block font-semibold text-on-surface-variant mb-1">Filter Section</label>
                    <select
                      value={effectiveTabSection}
                      onChange={(e) => setTabSection(e.target.value)}
                      className="px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 font-semibold"
                    >
                      <option value="ALL">All Sections</option>
                      {tabSections.map((sec) => (
                        <option key={sec} value={sec}>
                          {effectiveTabGroup !== 'ALL'
                            ? formatGroupSectionDisplay(effectiveTabGroup, sec)
                            : sec === 'Common'
                            ? 'Combined'
                            : `Section ${sec}`}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div>
                  <label className="block font-semibold text-on-surface-variant mb-1">Result Compilation Mode</label>
                  <select
                    value={joinedMode}
                    onChange={(e) =>
                      setJoinedMode(e.target.value as 'single' | 'subject-average' | 'term-average')
                    }
                    className="px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 font-bold text-primary-container"
                  >
                    <option value="single">Single Exam Tabulation ({currentExam.term})</option>
                    <option value="subject-average">Joined Result: Subject-Wise Average</option>
                    <option value="term-average">Joined Result: Term Total / GPA Average</option>
                  </select>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <select
                  aria-label="Tabulation Paper Size"
                  value={trPaperSize}
                  onChange={(e) => setTrPaperSize(e.target.value as 'legal' | 'a3' | 'a4')}
                  className="px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 font-semibold"
                >
                  <option value="legal">Legal Landscape TR</option>
                  <option value="a3">A3 Landscape TR</option>
                  <option value="a4">A4 Landscape</option>
                </select>
                <button
                  type="button"
                  onClick={() => setShowPrintableTrSheet((p) => !p)}
                  className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl font-bold cursor-pointer border ${
                    showPrintableTrSheet
                      ? 'bg-primary-container text-on-primary border-primary-container'
                      : 'bg-surface-container hover:bg-surface-container-high border-transparent'
                  }`}
                >
                  <span className="material-symbols-outlined text-[16px]">table_view</span>
                  {showPrintableTrSheet ? 'Exit TR Sheet Print View' : 'TR Sheet Print View'}
                </button>
                <button
                  type="button"
                  onClick={handleExportTabulationCsv}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-surface-container hover:bg-surface-container-high font-bold cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[16px]">download</span>
                  Export Tabulation CSV
                </button>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-surface-container hover:bg-surface-container-high font-bold cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[16px]">print</span>
                  Print TR Sheet ({trPaperSize.toUpperCase()})
                </button>
                <button
                  type="button"
                  disabled={!hasAnySentMarks}
                  onClick={handleSaveTabulationSnapshot}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-secondary text-on-secondary font-bold cursor-pointer shadow-xs hover:bg-secondary/90 disabled:opacity-50"
                >
                  <span className="material-symbols-outlined text-[16px]">save</span>
                  Save Tabulation Snapshot
                </button>
                <button
                  type="button"
                  disabled={!currentExam.savedTabulation || currentExam.savedTabulation.records.length === 0}
                  onClick={handlePublishExamNow}
                  title={
                    !currentExam.savedTabulation
                      ? 'Save the Official Tabulation Snapshot first to enable publication'
                      : 'Publish exam results strictly from the saved Official Tabulation Snapshot'
                  }
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed"
                >
                  <span className="material-symbols-outlined text-[16px]">publish</span>
                  Send to Result Publication
                </button>
              </div>
            </div>

            {hasAnySentMarks && !currentExam.savedTabulation && (
              <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200 text-amber-950 flex flex-wrap items-center justify-between gap-3 text-xs no-print">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[18px] text-amber-700">pending_actions</span>
                  <span>
                    <strong>Temporary Draft Tabulation:</strong> These figures are live calculations from sent marks and are <strong>not yet saved</strong> to the school database. Save the Tabulation Snapshot to enable Result Publication &amp; official marksheet downloads.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleSaveTabulationSnapshot}
                  className="px-3.5 py-1.5 rounded-xl bg-amber-900 hover:bg-amber-800 text-white font-bold cursor-pointer"
                >
                  Save Official Tabulation Now
                </button>
              </div>
            )}

            {currentExam.savedTabulation && (
              <div
                className={`p-3.5 rounded-2xl border flex flex-wrap items-center justify-between gap-3 text-xs no-print ${
                  isSnapshotStale
                    ? 'bg-amber-50 border-amber-300 text-amber-950'
                    : 'bg-emerald-50 border-emerald-200 text-emerald-950'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`material-symbols-outlined text-[18px] ${
                      isSnapshotStale ? 'text-amber-700' : 'text-emerald-700'
                    }`}
                  >
                    {isSnapshotStale ? 'update' : 'verified'}
                  </span>
                  <span>
                    <strong>Official Tabulation Snapshot Saved:</strong>{' '}
                    {formatDateDDMMYYYY(currentExam.savedTabulation.savedAt.slice(0, 10))} &bull;{' '}
                    {currentExam.savedTabulation.records.length} candidates stored in database.
                    {isSnapshotStale
                      ? ' Newer marks have been dispatched to Tabulation since this snapshot was saved — click Update Saved Snapshot to refresh official transcripts.'
                      : ' Student transcripts, public search, and marksheets are generated strictly from this saved tabulation.'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleSaveTabulationSnapshot}
                  className={`px-3 py-1.5 rounded-xl text-white font-bold cursor-pointer ${
                    isSnapshotStale
                      ? 'bg-amber-800 hover:bg-amber-900'
                      : 'bg-emerald-700 hover:bg-emerald-800'
                  }`}
                >
                  Update Saved Snapshot
                </button>
              </div>
            )}

            {showPrintableTrSheet && (
              <div className="p-4 rounded-xl bg-amber-50/80 border border-amber-200 text-amber-950 flex flex-wrap items-center justify-between gap-3 no-print">
                <span className="font-semibold">
                  TR Print Layout Active ({trPaperSize.toUpperCase()} Landscape) — Use browser Print → Landscape &amp; Paper Size &quot;{trPaperSize.toUpperCase()}&quot; to save PDF.
                </span>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="px-3.5 py-1.5 rounded-lg bg-amber-900 text-white font-bold cursor-pointer"
                >
                  Print Now
                </button>
              </div>
            )}

            {joinedMode !== 'single' && (
              <div className="space-y-2">
                <span className="font-bold text-on-surface block">
                  Select Terms to Combine ({joinedMode === 'subject-average' ? 'Averaging each subject across selected terms' : 'Averaging term totals & GPAs'}):
                </span>
                <div className="flex flex-wrap gap-3">
                  {exams.map((ex) => (
                    <label
                      key={ex.id}
                      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-surface-container-low border border-outline-variant/25 cursor-pointer font-semibold"
                    >
                      <input
                        type="checkbox"
                        checked={selectedJoinedExamIds.includes(ex.id)}
                        onChange={(e) => {
                          if (e.target.checked) setSelectedJoinedExamIds([...selectedJoinedExamIds, ex.id]);
                          else setSelectedJoinedExamIds(selectedJoinedExamIds.filter((id) => id !== ex.id));
                        }}
                      />
                      <span>{ex.term} ({ex.academicYear})</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Summary KPI Strip */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-2 no-print">
              <div className="p-3.5 rounded-xl bg-surface-container-low border border-outline-variant/20">
                <span className="text-on-surface-variant block">Total Candidates</span>
                <span className="text-xl font-bold font-mono tabular-nums">{tabulationRows.length}</span>
              </div>
              <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200">
                <span className="text-emerald-800 block">Total Passed</span>
                <span className="text-xl font-bold font-mono tabular-nums text-emerald-900">
                  {passedCount} ({tabulationRows.length ? Math.round((passedCount / tabulationRows.length) * 100) : 0}%)
                </span>
              </div>
              <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200">
                <span className="text-amber-900 block">GPA 5.00 / A+</span>
                <span className="text-xl font-bold font-mono tabular-nums text-amber-900">{aPlusCount}</span>
              </div>
              <div className="p-3.5 rounded-xl bg-red-50 border border-red-200">
                <span className="text-red-800 block">Failed / Unsuccessful</span>
                <span className="text-xl font-bold font-mono tabular-nums text-red-800">
                  {tabulationRows.length - passedCount}
                </span>
              </div>
            </div>
          </div>

          {/* Full Tabulation Sheet (TR Sheet) */}
          <div
            className={`rounded-2xl bg-white border border-outline-variant/25 overflow-hidden ${
              showPrintableTrSheet ? `tr-sheet-print-container tr-${trPaperSize} p-6 shadow-md` : ''
            }`}
          >
            {showPrintableTrSheet && (
              <div className="border-b-2 border-primary/30 pb-4 mb-4 flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left">
                <div className="flex items-center gap-3">
                  {cmsConfig.crestUrl && (
                    <img
                      src={cmsConfig.crestUrl}
                      alt={cmsConfig.schoolName}
                      className="h-12 w-auto object-contain"
                      referrerPolicy="no-referrer"
                    />
                  )}
                  <div>
                    <h2 className="text-lg font-bold text-primary tracking-tight">
                      {cmsConfig.schoolName.toUpperCase()}
                    </h2>
                    <p className="text-[11px] font-mono text-on-surface-variant">
                      {cmsConfig.address} • {cmsConfig.eiin} • {cmsConfig.boardCode}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs font-extrabold uppercase tracking-wider text-primary-container">
                    Tabulation Register (TR Sheet) — {trPaperSize.toUpperCase()}
                  </div>
                  <div className="text-xs font-semibold text-on-surface">
                    {joinedMode === 'single'
                      ? currentExam.title
                      : `Combined Result (${joinedMode === 'subject-average' ? 'Subject Average' : 'Term Average'})`}
                  </div>
                  <div className="text-[11px] font-mono text-on-surface-variant">
                    Class: {effectiveTabClass} • Group: {effectiveTabGroup} • Section: {effectiveTabSection} • Candidates: {tabulationRows.length}
                  </div>
                </div>
              </div>
            )}

            {!hasAnySentMarks ? (
              <div className="p-8 rounded-3xl bg-amber-50 border border-amber-200 text-center space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-900 flex items-center justify-center mx-auto">
                  <span className="material-symbols-outlined text-[26px]">inbox</span>
                </div>
                <h3 className="text-base font-bold text-amber-950">Tabulation is Empty</h3>
                <p className="text-xs text-amber-800 max-w-md mx-auto">
                  No marks have been sent to the Tabulation Register yet for &quot;{currentExam.title}&quot;.
                  Please open <strong>3. Mark Entry Roster</strong> and click <strong>&quot;Send to Tabulation&quot;</strong> on each subject, or click <strong>&quot;Bulk Send All to Tabulation&quot;</strong>.
                </p>
                <button
                  type="button"
                  onClick={() => setSubTab('mark-entry')}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-900 text-white font-bold text-xs cursor-pointer hover:bg-amber-800"
                >
                  <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
                  Go to Mark Entry Roster
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs border border-outline-variant/30">
                  <thead>
                    <tr className="bg-surface-container-low text-on-surface border-b border-outline-variant/30">
                      <th rowSpan={2} className="py-2 px-2 text-center border border-outline-variant/30 font-bold w-12">
                        Roll
                      </th>
                      <th rowSpan={2} className="py-2 px-3 border border-outline-variant/30 font-bold min-w-[150px]">
                        Student Name &amp; System ID
                      </th>
                      <th rowSpan={2} className="py-2 px-2.5 border border-outline-variant/30 font-bold min-w-[110px]">
                        Class · Section
                      </th>
                      {cohortSubjectsList.map((sub) => (
                        <th
                          key={sub.code}
                          colSpan={sub.colSpan}
                          className="py-1.5 px-2 text-center border border-outline-variant/30 font-bold bg-surface-container/60 truncate"
                          title={`${sub.name} (${sub.code})`}
                        >
                          <span className="block truncate max-w-[180px] mx-auto">{sub.name}</span>
                          <span className="text-[10px] font-mono font-normal text-on-surface-variant">({sub.code})</span>
                        </th>
                      ))}
                      <th colSpan={7} className="py-1.5 px-2 text-center border border-outline-variant/30 font-bold bg-secondary/10 text-secondary">
                        Overall Result Summary
                      </th>
                    </tr>
                    <tr className="bg-surface-container-lowest text-on-surface-variant border-b border-outline-variant/30 text-[10px] font-semibold">
                      {cohortSubjectsList.map((sub) => (
                        <React.Fragment key={sub.code}>
                          {sub.hasCt && (
                            <th className="py-1 px-1.5 text-center border border-outline-variant/30 font-mono">CT</th>
                          )}
                          {sub.hasCq && (
                            <th className="py-1 px-1.5 text-center border border-outline-variant/30 font-mono">CQ</th>
                          )}
                          {sub.hasMcq && (
                            <th className="py-1 px-1.5 text-center border border-outline-variant/30 font-mono">MCQ</th>
                          )}
                          {sub.hasPrac && (
                            <th className="py-1 px-1.5 text-center border border-outline-variant/30 font-mono">Prac</th>
                          )}
                          {sub.activeCustom.map((c) => (
                            <th key={c.id} className="py-1 px-1.5 text-center border border-outline-variant/30 font-mono" title={c.label}>
                              {c.label.slice(0, 4)}
                            </th>
                          ))}
                          <th className="py-1 px-1.5 text-center border border-outline-variant/30 font-mono font-bold bg-slate-100 text-slate-900">
                            Tot
                          </th>
                          <th className="py-1 px-1.5 text-center border border-outline-variant/30 font-mono font-bold">
                            GP/Gr
                          </th>
                        </React.Fragment>
                      ))}
                      <th className="py-1 px-2 text-center border border-outline-variant/30 font-mono font-bold">Total</th>
                      <th className="py-1 px-2 text-center border border-outline-variant/30 font-mono">Core GPA</th>
                      <th className="py-1 px-2 text-center border border-outline-variant/30 font-mono">4th Bonus</th>
                      <th className="py-1 px-2 text-center border border-outline-variant/30 font-mono font-bold text-primary">Final GPA</th>
                      <th className="py-1 px-2 text-center border border-outline-variant/30 font-mono font-bold">Grade</th>
                      <th className="py-1 px-2 text-center border border-outline-variant/30 font-mono font-bold">Status</th>
                      <th className="py-1 px-2 text-center border border-outline-variant/30 font-mono font-bold">Merit Rank</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant/20">
                    {tabulationRows.map((row) => (
                      <tr key={row.student.id} className="hover:bg-surface-container-low/40">
                        <td className="py-2 px-2 text-center font-mono font-bold tabular-nums border border-outline-variant/20">
                          #{row.student.rollNumber}
                        </td>
                        <td className="py-2 px-3 border border-outline-variant/20">
                          <div className="font-bold text-on-surface truncate max-w-[160px]">{row.student.fullName}</div>
                          <div className="text-[10px] font-mono text-on-surface-variant">{row.student.systemId}</div>
                        </td>
                        <td className="py-2 px-2.5 border border-outline-variant/20 text-[11px]">
                          <div>{row.student.className}</div>
                          <div className="text-[10px] text-on-surface-variant">
                            {formatGroupSectionDisplay(row.student.group, row.student.sectionName)}
                          </div>
                        </td>
                        {cohortSubjectsList.map((colSub) => {
                          const stuSub = row.subjects.find((s) => s.subjectCode === colSub.code);
                          if (!stuSub) {
                            return (
                              <td
                                key={colSub.code}
                                colSpan={colSub.colSpan}
                                className="py-2 px-1 text-center font-mono text-[10px] text-on-surface-variant/50 border border-outline-variant/20 bg-surface-container-low/20"
                              >
                                —
                              </td>
                            );
                          }
                          if (stuSub.isAbsent) {
                            return (
                              <React.Fragment key={colSub.code}>
                                {colSub.hasCt && (
                                  <td className="py-2 px-1 text-center font-mono text-[10px] font-bold text-red-600 border border-outline-variant/20">AB</td>
                                )}
                                {colSub.hasCq && (
                                  <td className="py-2 px-1 text-center font-mono text-[10px] font-bold text-red-600 border border-outline-variant/20">AB</td>
                                )}
                                {colSub.hasMcq && (
                                  <td className="py-2 px-1 text-center font-mono text-[10px] font-bold text-red-600 border border-outline-variant/20">AB</td>
                                )}
                                {colSub.hasPrac && (
                                  <td className="py-2 px-1 text-center font-mono text-[10px] font-bold text-red-600 border border-outline-variant/20">AB</td>
                                )}
                                {colSub.activeCustom.map((c) => (
                                  <td key={c.id} className="py-2 px-1 text-center font-mono text-[10px] font-bold text-red-600 border border-outline-variant/20">AB</td>
                                ))}
                                <td className="py-2 px-1 text-center font-mono text-[10px] font-bold text-red-600 border border-outline-variant/20 bg-red-50/50">0</td>
                                <td className="py-2 px-1 text-center font-mono text-[10px] font-bold text-red-700 border border-outline-variant/20">F</td>
                              </React.Fragment>
                            );
                          }
                          return (
                            <React.Fragment key={colSub.code}>
                              {colSub.hasCt && (
                                <td className="py-2 px-1 text-center font-mono text-[10px] tabular-nums border border-outline-variant/20">
                                  {stuSub.ct ?? '—'}
                                </td>
                              )}
                              {colSub.hasCq && (
                                <td className="py-2 px-1 text-center font-mono text-[10px] tabular-nums border border-outline-variant/20">
                                  {stuSub.cq}
                                </td>
                              )}
                              {colSub.hasMcq && (
                                <td className="py-2 px-1 text-center font-mono text-[10px] tabular-nums border border-outline-variant/20">
                                  {stuSub.mcq}
                                </td>
                              )}
                              {colSub.hasPrac && (
                                <td className="py-2 px-1 text-center font-mono text-[10px] tabular-nums border border-outline-variant/20">
                                  {stuSub.practical}
                                </td>
                              )}
                              {colSub.activeCustom.map((c) => {
                                const customMatch = (stuSub.customComponents || []).find((cc) => cc.id === c.id);
                                return (
                                  <td key={c.id} className="py-2 px-1 text-center font-mono text-[10px] tabular-nums border border-outline-variant/20">
                                    {customMatch ? customMatch.convertedMarks : '—'}
                                  </td>
                                );
                              })}
                              <td className="py-2 px-1 text-center font-mono text-[10px] font-bold tabular-nums border border-outline-variant/20 bg-slate-50">
                                {stuSub.total}
                              </td>
                              <td
                                className={`py-2 px-1 text-center font-mono text-[10px] font-bold border border-outline-variant/20 ${
                                  stuSub.isPassed ? 'text-emerald-700' : 'text-red-700'
                                }`}
                              >
                                {stuSub.letterGrade}
                              </td>
                            </React.Fragment>
                          );
                        })}
                        <td className="py-2 px-2 text-center font-mono font-bold tabular-nums border border-outline-variant/20">
                          {row.totalObtained}/{row.totalFull}
                        </td>
                        <td className="py-2 px-2 text-center font-mono tabular-nums text-on-surface-variant border border-outline-variant/20">
                          {row.gpaWithoutFourth.toFixed(2)}
                        </td>
                        <td className="py-2 px-2 text-center font-mono tabular-nums text-emerald-800 font-semibold border border-outline-variant/20">
                          {row.fourthBonus > 0 ? `+${row.fourthBonus.toFixed(2)}` : '0.00'}
                        </td>
                        <td className="py-2 px-2 text-center font-mono font-bold text-primary-container tabular-nums text-xs border border-outline-variant/20">
                          {row.finalGPA.toFixed(2)}
                        </td>
                        <td className="py-2 px-2 text-center font-bold border border-outline-variant/20">
                          <span className={row.finalGrade === 'F' ? 'text-red-700 font-extrabold' : ''}>
                            {row.finalGrade}
                          </span>
                        </td>
                        <td className="py-2 px-2 text-center border border-outline-variant/20">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                              row.isPassed ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-800'
                            }`}
                          >
                            {row.isPassed ? 'Passed' : 'Failed'}
                          </span>
                        </td>
                        <td className="py-2 px-2 text-center border border-outline-variant/20 font-mono text-[11px] whitespace-nowrap">
                          <span className="font-bold text-primary">#{row.classRank}</span>
                          <span className="text-[10px] text-on-surface-variant ml-1">(Sec #{row.sectionRank})</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {showPrintableTrSheet && (
              <div className="pt-10 pb-2 px-4 flex flex-wrap justify-around items-end gap-6 border-t border-outline-variant/25 mt-6 text-xs">
                {signatories
                  .filter((s) => s.enabled)
                  .map((sig) => (
                    <div key={sig.id} className="text-center">
                      <div className="w-36 border-b border-black mb-1 h-8 flex items-end justify-center">
                        <span className="font-serif italic text-[11px] text-slate-700">{sig.name}</span>
                      </div>
                      <span className="font-bold text-[10px] block">{sig.title}</span>
                    </div>
                  ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* SUB-TAB 5: CUSTOM MARKSHEET STUDIO */}
      {subTab === 'stationery-signatories' && (
        <MarksheetDesignerPanel
          key={currentExam.id}
          currentExam={currentExam}
          allExams={exams}
          students={students}
          subjects={subjects}
          markEntries={markEntries}
          teachers={teachers}
          cmsConfig={cmsConfig}
          combinePairedPapers={combinePairedPapers}
          rankedMap={rankedMap}
          selectedStudentId={previewStudentId}
          onChangeStudentId={setPreviewStudentId}
          onUpdateExam={(id, updates) => {
            updateExam(id, updates);
            if (id === currentExam.id) {
              if (updates.stationeryMode) setStationeryMode(updates.stationeryMode);
              if (updates.marksheetBgUrl !== undefined) setCustomBgUrl(updates.marksheetBgUrl || '');
              if (updates.signatories) setSignatories(updates.signatories);
            }
          }}
          onToast={showToast}
        />
      )}

      {/* SUB-TAB 6: A4 MARKSHEET LIVE PREVIEW */}
      {subTab === 'preview-marksheet' && compiledResult && (
        <div className="space-y-6 marksheet-print-host">
          <div className="rounded-2xl bg-surface-container-lowest border border-outline-variant/25 p-4 flex flex-col sm:flex-row items-center justify-between gap-4 no-print">
            <div className="flex items-center gap-3">
              <span className="text-xs font-semibold text-on-surface-variant">Candidate:</span>
              <select
                value={previewStudentId}
                onChange={(e) => {
                  const nextStuId = e.target.value;
                  setPreviewStudentId(nextStuId);
                  const nextStu = students.find((s) => s.id === nextStuId);
                  if (nextStu) {
                    handleGeneratePreviewQr(getPreviewCompiledResult(nextStu));
                  }
                }}
                className="px-3 py-1.5 rounded-xl bg-surface-container-low border border-outline-variant/30 text-xs font-bold text-on-surface"
              >
                {students.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.className} ({s.sectionName}) · Roll #{s.rollNumber} - {s.fullName} ({s.group})
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={isDownloadingPreviewPdf}
                onClick={async () => {
                  if (!previewSheetRef.current) return;
                  setIsDownloadingPreviewPdf(true);
                  try {
                    await downloadMarksheetAsPdf(
                      previewSheetRef.current,
                      `Marksheet_${compiledResult.systemId}_${compiledResult.examTitle}`
                    );
                  } finally {
                    setIsDownloadingPreviewPdf(false);
                  }
                }}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary-container hover:bg-primary text-on-primary font-bold text-xs shadow-md disabled:opacity-60 cursor-pointer"
              >
                <Download className="w-4 h-4" />
                <span>{isDownloadingPreviewPdf ? 'Generating PDF...' : 'Download A4 PDF'}</span>
              </button>
              <button
                type="button"
                onClick={() =>
                  printMarksheetDocument(
                    `Marksheet - ${compiledResult.studentName} (${compiledResult.systemId})`
                  )
                }
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-surface-container-low hover:bg-surface-container border border-outline-variant/40 text-on-surface font-bold text-xs shadow-xs cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                <span>Print Official Marksheet (A4)</span>
              </button>
            </div>
          </div>

          <div className="flex justify-center overflow-x-auto pb-2 marksheet-print-scroll">
            <MarksheetDocument
              sheetRef={previewSheetRef}
              result={compiledResult}
              exam={currentExam}
              student={selectedStudentForPreview}
              cmsConfig={cmsConfig}
              qrCodeDataUrl={previewQr}
              bgUrlOverride={customBgUrl}
              stationeryModeOverride={stationeryMode}
              signatoriesOverride={signatories}
            />
          </div>
        </div>
      )}
    </div>
  );
}
