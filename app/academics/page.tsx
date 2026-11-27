'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useERPStore } from '@/lib/store';
import { AcademicGroup } from '@/lib/types';
import {
  classMatchesEnabledWings,
  formatDateDDMMYYYY,
  formatGroupSectionDisplay,
  formatInstituteSessionBanner,
  formatSubjectGroupsLabel,
  formatTime12h,
  getActiveSubjectCustomComponents,
  getEffectiveConversionPercent,
  getEffectiveSectionsForClassGroup,
  getPeriodParallelSessions,
  isSingleBatchCohort,
  isSubjectComponentEnabled,
  resolveRoutineDayRow,
  resolveRoutinePeriodForGroup,
  sortSubjectsByOrder,
  subjectAppliesToGroup,
} from '@/lib/academic-helpers';
import PublicShell, { usePublicShell } from '@/components/public/PublicShell';

const NCTB_GRADING_SCALE = [
  { range: '80 – 100', letter: 'A+', gpa: '5.00', remarks: 'Outstanding' },
  { range: '70 – 79', letter: 'A', gpa: '4.00', remarks: 'Excellent' },
  { range: '60 – 69', letter: 'A-', gpa: '3.50', remarks: 'Very Good' },
  { range: '50 – 59', letter: 'B', gpa: '3.00', remarks: 'Good' },
  { range: '40 – 49', letter: 'C', gpa: '2.00', remarks: 'Satisfactory' },
  { range: '33 – 39', letter: 'D', gpa: '1.00', remarks: 'Pass (Minimum)' },
  { range: '00 – 32', letter: 'F', gpa: '0.00', remarks: 'Fail' },
];

const DEFAULT_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday'];

const EVENT_CATEGORY_BADGE: Record<string, string> = {
  'Class Days': 'bg-emerald-100 text-emerald-900 border-emerald-200',
  Holiday: 'bg-rose-100 text-rose-900 border-rose-200',
  Exam: 'bg-amber-100 text-amber-900 border-amber-200',
  'Important Event': 'bg-indigo-100 text-indigo-900 border-indigo-200',
  Admission: 'bg-sky-100 text-sky-900 border-sky-200',
};

function AcademicsContent() {
  const { state } = useERPStore();
  const { cmsConfig, subjects, academicClasses, classRoutines, instituteRules, events } = state;
  const wingClasses = academicClasses.filter((c) => classMatchesEnabledWings(c, instituteRules));
  const visibleClasses = wingClasses.length > 0 ? wingClasses : academicClasses;
  const { openResultPortal } = usePublicShell();
  const academicsCfg = cmsConfig.academicsPageConfig;

  const [selectedSubjectClass, setSelectedSubjectClass] = useState<string>('All');
  const [selectedGroup, setSelectedGroup] = useState<string>('All');
  const [selectedClass, setSelectedClass] = useState<string>(
    visibleClasses.find((c) => c.name === 'Grade 10')?.name || visibleClasses[0]?.name || 'Grade 10'
  );
  const [routineGroup, setRoutineGroup] = useState<AcademicGroup | 'All'>('All');
  const [selectedSection, setSelectedSection] = useState<string>('A');
  const [selectedShift, setSelectedShift] = useState<'Morning' | 'Day'>('Morning');
  const [calendarCategory, setCalendarCategory] = useState<string>('All');

  const workingDays = instituteRules?.workingDays?.length
    ? instituteRules.workingDays
    : DEFAULT_DAYS;
  const enabledShifts = instituteRules?.enabledShifts?.length
    ? instituteRules.enabledShifts
    : (['Morning', 'Day'] as const);
  const effectiveShift = enabledShifts.includes(selectedShift)
    ? selectedShift
    : enabledShifts[0];

  const activeClassObj = academicClasses.find((c) => c.name === selectedClass);
  const activeClassGroups: AcademicGroup[] = (activeClassObj?.groups || []).filter(
    (g): g is AcademicGroup => g !== 'General'
  );
  const classHasGroups =
    activeClassObj?.hasGroups !== false && activeClassGroups.length > 0;
  const effectiveRoutineGroup: AcademicGroup | 'All' =
    classHasGroups && routineGroup !== 'All' && activeClassGroups.includes(routineGroup)
      ? routineGroup
      : 'All';

  const classShifts = activeClassObj?.shifts?.length
    ? activeClassObj.shifts.filter((sh) => enabledShifts.includes(sh))
    : enabledShifts;
  const resolvedShift = classShifts.includes(effectiveShift)
    ? effectiveShift
    : classShifts[0] || effectiveShift;

  const availableSections = getEffectiveSectionsForClassGroup(
    activeClassObj,
    effectiveRoutineGroup
  );
  const isSingleBatch = isSingleBatchCohort(availableSections);
  const effectiveSection = availableSections.includes(selectedSection)
    ? selectedSection
    : availableSections[0] || 'Common';

  const cohortDisplayLabel =
    effectiveRoutineGroup === 'All' && classHasGroups
      ? `Combined (All Groups)${isSingleBatch ? '' : ` · Section ${effectiveSection}`}`
      : formatGroupSectionDisplay(effectiveRoutineGroup, effectiveSection);

  const periodSlots = instituteRules?.shiftPeriodTemplates?.[resolvedShift] || [];

  const routineDays = workingDays
    .map((dayName) =>
      resolveRoutineDayRow(
        classRoutines,
        selectedClass,
        effectiveRoutineGroup,
        effectiveSection,
        resolvedShift,
        dayName
      )
    )
    .filter((item): item is NonNullable<typeof item> => Boolean(item));

  const groups = ['All', 'General', 'Science', 'Business Studies', 'Humanities'];
  const filteredSubjects = sortSubjectsByOrder(
    subjects.filter((sub) => {
      const matchClass = selectedSubjectClass === 'All' ? true : sub.classLevel === selectedSubjectClass;
      const matchGroup =
        selectedGroup === 'All' ? true : subjectAppliesToGroup(sub, selectedGroup as AcademicGroup);
      return matchClass && matchGroup;
    })
  );

  const publicEvents = events
    .filter((ev) => ev.visibility !== 'Admin Only')
    .filter((ev) =>
      calendarCategory === 'All'
        ? true
        : (ev.category || 'Important Event') === calendarCategory
    )
    .sort((a, b) => (a.startDate || a.id).localeCompare(b.startDate || b.id));

  const handlePrintRoutine = () => {
    const prevTitle = document.title;
    const grpPart =
      effectiveRoutineGroup !== 'All'
        ? `${effectiveRoutineGroup}-${effectiveSection === 'Common' ? 'Combined' : effectiveSection}`
        : effectiveSection === 'Common'
        ? 'Combined'
        : `Sec-${effectiveSection}`;
    document.title = `${selectedClass}-${grpPart}-${resolvedShift}-Routine`;
    window.print();
    setTimeout(() => {
      document.title = prevTitle;
    }, 300);
  };

  return (
    <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 py-10 space-y-12 print:max-w-none print:p-8 print:space-y-0">
      {/* Curriculum Overview Hero */}
      <section className="no-print rounded-[2rem] bg-white/80 backdrop-blur-2xl border border-outline-variant/25 shadow-[0_16px_40px_-8px_rgba(19,27,46,0.05)] p-8 sm:p-12 space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-2 max-w-3xl">
            <span className="inline-block px-3 py-1 rounded-full bg-secondary-fixed/70 text-on-secondary-container font-label-sm text-xs uppercase tracking-widest font-semibold">
              NCTB &amp; Board Curriculum &bull; {formatInstituteSessionBanner(instituteRules)}
            </span>
            <h1 className="font-display-lg text-3xl sm:text-4xl font-bold text-on-surface tracking-tight">
              {academicsCfg?.heading || 'Academics, Routines & Examinations'}
            </h1>
            <p className="text-sm sm:text-base text-on-surface-variant leading-relaxed whitespace-pre-line">
              {cmsConfig.academicsContent}
            </p>
          </div>
          <div className="flex flex-wrap gap-3 shrink-0">
            <button
              type="button"
              onClick={openResultPortal}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-primary-container hover:bg-primary text-on-primary text-xs font-semibold shadow-sm cursor-pointer transition-colors"
            >
              <span className="material-symbols-outlined text-[18px]">workspace_premium</span>
              Check Published Results
            </button>
            <a
              href="#academic-calendar"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-surface-container-low hover:bg-surface-container text-on-surface text-xs font-semibold border border-outline-variant/40 transition-colors"
            >
              <span className="material-symbols-outlined text-[18px]">calendar_month</span>
              Academic Calendar
            </a>
            <Link
              href="/admissions"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-surface-container-low hover:bg-surface-container text-on-surface text-xs font-semibold border border-outline-variant/40 transition-colors"
            >
              Apply for Admission
            </Link>
          </div>
        </div>
      </section>

      {/* 1. CLASSES ROUTINE SECTION */}
      {(academicsCfg?.showRoutine ?? true) && (
        <section
          id="class-routine"
          className="scroll-mt-36 rounded-[2rem] bg-white/80 backdrop-blur-2xl border border-outline-variant/25 shadow-[0_16px_40px_-8px_rgba(19,27,46,0.05)] p-6 sm:p-10 space-y-6 print:rounded-none print:border-0 print:shadow-none print:bg-white print:p-0 print:space-y-4"
        >
          {/* Print-only Official Routine Letterhead */}
          <div className="hidden print:block border-b-2 border-slate-800 pb-4 mb-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                {cmsConfig.crestUrl && (
                  <img
                    src={cmsConfig.crestUrl}
                    alt={`${cmsConfig.schoolName} Crest`}
                    className="w-12 h-12 object-contain rounded-lg border border-slate-200 p-0.5 bg-white shrink-0"
                    referrerPolicy="no-referrer"
                  />
                )}
                <div>
                  <h1 className="text-xl font-bold text-slate-900 leading-tight">
                    {cmsConfig.schoolName || 'Institute Academic Timetable'}
                  </h1>
                  {cmsConfig.motto && (
                    <p className="text-[11px] font-medium italic text-slate-600 mt-0.5">
                      {cmsConfig.motto}
                    </p>
                  )}
                  <p className="text-[11px] text-slate-600 mt-1">
                    {cmsConfig.address}
                    {cmsConfig.eiin ? ` • EIIN: ${cmsConfig.eiin}` : ''}
                    {cmsConfig.boardCode ? ` • Board Code: ${cmsConfig.boardCode}` : ''}
                  </p>
                  {(cmsConfig.phone || cmsConfig.email) && (
                    <p className="text-[10px] text-slate-500 mt-0.5 font-mono">
                      {[cmsConfig.phone, cmsConfig.email].filter(Boolean).join(' • ')}
                    </p>
                  )}
                </div>
              </div>
              <div className="text-right text-xs text-slate-700 shrink-0">
                <div className="font-bold uppercase tracking-wider text-slate-900">
                  Official Class Routine
                </div>
                <div className="font-mono mt-0.5">
                  {activeClassObj?.cycleType || 'Academic Year'}:{' '}
                  {activeClassObj?.activeCycle || instituteRules?.activeAcademicYear || '2025'}
                </div>
              </div>
            </div>
            <div className="mt-3 pt-2 border-t border-slate-200 flex flex-wrap items-center gap-3 text-xs font-semibold text-slate-800">
              <span>Class: {selectedClass}</span>
              <span>&bull;</span>
              <span>{cohortDisplayLabel}</span>
              <span>&bull;</span>
              <span>{resolvedShift} Shift</span>
              <span>&bull;</span>
              <span>Working Days: {workingDays.join(', ')}</span>
            </div>
          </div>

          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 no-print">
            <div>
              <span className="text-[11px] uppercase tracking-widest font-semibold text-primary-container">
                Weekly Academic Timetable &bull; Working Days: {workingDays.join(', ')}
                {activeClassObj?.activeCycle
                  ? ` • ${activeClassObj.cycleType || 'Academic Year'}: ${activeClassObj.activeCycle}`
                  : ''}
              </span>
              <h2 className="text-2xl font-display-lg font-bold text-on-surface">
                Classes Routine ({selectedClass} &bull; {cohortDisplayLabel})
              </h2>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <select
                aria-label="Select Class"
                value={selectedClass}
                onChange={(e) => {
                  setSelectedClass(e.target.value);
                  setRoutineGroup('All');
                }}
                className="px-3.5 py-2 rounded-full bg-surface-container-low border border-outline-variant/40 text-xs font-semibold text-on-surface focus:outline-hidden"
              >
                {visibleClasses.map((cls) => (
                  <option key={cls.id} value={cls.name}>
                    {cls.name}
                  </option>
                ))}
              </select>

              {classHasGroups && (
                <select
                  aria-label="Select Group"
                  value={effectiveRoutineGroup}
                  onChange={(e) => setRoutineGroup(e.target.value as AcademicGroup | 'All')}
                  className="px-3.5 py-2 rounded-full bg-surface-container-low border border-outline-variant/40 text-xs font-semibold text-on-surface focus:outline-hidden"
                >
                  <option value="All">Combined (All Groups)</option>
                  {activeClassGroups.map((grp) => (
                    <option key={grp} value={grp}>
                      {grp}
                    </option>
                  ))}
                </select>
              )}

              {!isSingleBatch ? (
                <select
                  aria-label="Select Section"
                  value={effectiveSection}
                  onChange={(e) => setSelectedSection(e.target.value)}
                  className="px-3.5 py-2 rounded-full bg-surface-container-low border border-outline-variant/40 text-xs font-semibold text-on-surface focus:outline-hidden"
                >
                  {availableSections.map((sec) => (
                    <option key={sec} value={sec}>
                      {effectiveRoutineGroup !== 'All'
                        ? formatGroupSectionDisplay(effectiveRoutineGroup, sec)
                        : sec === 'Common'
                        ? 'Combined'
                        : `Section ${sec}`}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="px-3.5 py-2 rounded-full bg-secondary-fixed/60 text-on-secondary-container text-xs font-semibold border border-outline-variant/25">
                  {effectiveRoutineGroup !== 'All'
                    ? formatGroupSectionDisplay(effectiveRoutineGroup, effectiveSection)
                    : 'Combined'}
                </span>
              )}

              <div className="inline-flex p-1 rounded-full bg-surface-container-low border border-outline-variant/30 w-fit">
                {classShifts.map((shift) => (
                  <button
                    key={shift}
                    type="button"
                    onClick={() => setSelectedShift(shift)}
                    className={`px-4 py-1.5 rounded-full text-xs font-semibold cursor-pointer transition-colors ${
                      resolvedShift === shift
                        ? 'bg-primary-container text-on-primary shadow-xs'
                        : 'text-on-surface-variant hover:text-on-surface'
                    }`}
                  >
                    {shift} Shift
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={handlePrintRoutine}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-surface-container-low hover:bg-surface-container text-on-surface border border-outline-variant/40 text-xs font-semibold cursor-pointer transition-colors"
              >
                <span className="material-symbols-outlined text-[16px]">print</span>
                Print Routine
              </button>

              <button
                type="button"
                onClick={handlePrintRoutine}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-primary-container hover:bg-primary text-on-primary text-xs font-semibold shadow-xs cursor-pointer transition-colors"
              >
                <span className="material-symbols-outlined text-[16px]">picture_as_pdf</span>
                Download PDF
              </button>
            </div>
          </div>

          <div className="overflow-x-auto print:overflow-visible rounded-2xl border border-outline-variant/30 print:rounded-lg print:border-slate-300">
            <table className="w-full text-left text-xs border-collapse bg-white/95">
              <thead>
                <tr className="bg-surface-container-low text-on-surface font-bold border-b border-outline-variant/30">
                  <th className="p-3.5">Day</th>
                  {periodSlots.length > 0 ? (
                    periodSlots.map((slot) => (
                      <th
                        key={slot.id}
                        className={`p-3.5 ${slot.isBreak ? 'bg-amber-50/70 text-amber-900' : ''}`}
                      >
                        <div>{slot.isBreak ? slot.label || 'Tiffin Break' : slot.period}</div>
                        <div className="text-[10px] font-mono font-normal text-on-surface-variant tabular-nums">
                          {formatTime12h(slot.startTime)}–{formatTime12h(slot.endTime)}
                        </div>
                      </th>
                    ))
                  ) : (
                    <>
                      <th className="p-3.5">1st Period</th>
                      <th className="p-3.5">2nd Period</th>
                      <th className="p-3.5">3rd Period</th>
                      <th className="p-3.5">4th Period</th>
                      <th className="p-3.5">5th Period</th>
                      <th className="p-3.5">6th Period</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/20">
                {routineDays.length === 0 ? (
                  <tr>
                    <td
                      colSpan={Math.max(7, periodSlots.length + 1)}
                      className="p-8 text-center text-on-surface-variant"
                    >
                      No weekly timetable published yet for {selectedClass} ({cohortDisplayLabel} &bull;{' '}
                      {resolvedShift} Shift).
                    </td>
                  </tr>
                ) : (
                  routineDays.map((row) => {
                    const colCount = periodSlots.length > 0 ? periodSlots.length : 6;
                    return (
                      <tr key={row.id} className="hover:bg-surface-container-lowest">
                        <td className="p-3.5 font-bold text-primary-container">{row.day}</td>
                        {Array.from({ length: colCount }).map((_, idx) => {
                          const slot = periodSlots[idx];
                          const rawPeriod = row.periods[idx];
                          if (slot?.isBreak || rawPeriod?.isBreak) {
                            return (
                              <td
                                key={idx}
                                className="p-3.5 bg-amber-50/40 text-amber-900 font-semibold text-center"
                              >
                                {slot?.label || rawPeriod?.subjectName || 'Break'}
                              </td>
                            );
                          }

                          const parallelBlocks = getPeriodParallelSessions(rawPeriod);
                          if (effectiveRoutineGroup === 'All' && parallelBlocks.length > 0) {
                            return (
                              <td key={idx} className="p-2.5 align-top space-y-1.5 min-w-[155px]">
                                {parallelBlocks.map((ps) => {
                                  const audienceLabel =
                                    ps.targetGroups.length === 0 || ps.targetGroups.includes('General')
                                      ? 'All Groups'
                                      : ps.targetGroups
                                          .map((g) => (g === 'Business Studies' ? 'Business' : g))
                                          .join(' + ');
                                  return (
                                    <div
                                      key={ps.id}
                                      className="p-1.5 rounded-lg bg-surface-container-low/70 border border-outline-variant/20"
                                    >
                                      <div className="flex flex-wrap items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-secondary">
                                        <span>{audienceLabel}</span>
                                        {ps.religionFilter && (
                                          <span className="px-1 rounded bg-emerald-100 text-emerald-900 normal-case">
                                            {ps.religionFilter}
                                          </span>
                                        )}
                                        {ps.onlyEnrolledStudents && (
                                          <span className="px-1 rounded bg-amber-100 text-amber-900 normal-case">
                                            Elective
                                          </span>
                                        )}
                                      </div>
                                      <div className="font-semibold text-[11px] text-on-surface leading-tight mt-0.5">
                                        {ps.subjectName}
                                      </div>
                                      {(ps.teacherName || ps.room) && (
                                        <div className="text-[10px] text-on-surface-variant truncate">
                                          {[ps.teacherName, ps.room].filter(Boolean).join(' · ')}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </td>
                            );
                          }

                          const period = resolveRoutinePeriodForGroup(
                            rawPeriod,
                            effectiveRoutineGroup
                          );
                          const groupMatchingParallels =
                            period?.parallelSessions && period.parallelSessions.length > 1
                              ? period.parallelSessions
                              : null;

                          return (
                            <td key={idx} className="p-3.5 align-top">
                              {groupMatchingParallels ? (
                                <div className="space-y-1.5 min-w-[130px]">
                                  {groupMatchingParallels.map((ps) => (
                                    <div
                                      key={ps.id}
                                      className="p-1.5 rounded-lg bg-surface-container-low/70 border border-outline-variant/20"
                                    >
                                      {(ps.religionFilter || ps.onlyEnrolledStudents) && (
                                        <div className="text-[9px] font-bold text-secondary">
                                          {ps.religionFilter || 'Elective / 4th'}
                                        </div>
                                      )}
                                      <div className="font-semibold text-[11px] text-on-surface leading-tight">
                                        {ps.subjectName}
                                      </div>
                                      {(ps.teacherName || ps.room) && (
                                        <div className="text-[10px] text-on-surface-variant truncate">
                                          {[ps.teacherName, ps.room].filter(Boolean).join(' · ')}
                                        </div>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              ) : period ? (
                                <div>
                                  <div className="font-semibold text-on-surface">{period.subjectName}</div>
                                  {period.teacherName && (
                                    <div className="text-[11px] text-on-surface-variant">{period.teacherName}</div>
                                  )}
                                  {period.room && (
                                    <div className="text-[10px] font-mono text-primary-container">
                                      {period.room}
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <span className="text-on-surface-variant/60">—</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* 2. WHOLE-YEAR ACADEMIC CALENDAR SECTION */}
      <section
        id="academic-calendar"
        className="no-print scroll-mt-36 rounded-[2rem] bg-white/80 backdrop-blur-2xl border border-outline-variant/25 shadow-[0_16px_40px_-8px_rgba(19,27,46,0.05)] p-6 sm:p-10 space-y-6"
      >
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <span className="text-[11px] uppercase tracking-widest font-semibold text-primary-container">
              {formatInstituteSessionBanner(instituteRules)}
            </span>
            <h2 className="text-2xl font-display-lg font-bold text-on-surface">
              Whole-Year Academic Calendar
            </h2>
            <p className="text-xs text-on-surface-variant mt-1">
              Class start dates, vacation holidays, terminal exam windows, and institutional programs.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {['All', 'Class Days', 'Holiday', 'Exam', 'Important Event', 'Admission'].map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setCalendarCategory(cat)}
                className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                  calendarCategory === cat
                    ? 'bg-primary-container text-on-primary shadow-xs'
                    : 'bg-surface-container-low text-on-surface-variant hover:text-on-surface'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {publicEvents.length === 0 ? (
          <div className="p-8 rounded-2xl bg-surface-container-low text-center text-xs text-on-surface-variant">
            No calendar entries published under this category yet.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {publicEvents.map((ev) => {
              const cat = ev.category || 'Important Event';
              const badgeCls =
                EVENT_CATEGORY_BADGE[cat] || 'bg-slate-100 text-slate-900 border-slate-200';
              return (
                <div
                  key={ev.id}
                  className="p-5 rounded-2xl bg-surface-container-lowest border border-outline-variant/25 flex flex-col justify-between gap-3 hover:border-primary/40 transition-colors"
                >
                  <div className="space-y-2.5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="w-14 h-14 rounded-2xl bg-primary-container/10 text-primary-container flex flex-col items-center justify-center shrink-0">
                        <span className="text-lg font-black leading-none">{ev.day}</span>
                        <span className="text-[10px] font-bold uppercase tracking-wider mt-0.5">
                          {ev.month}
                        </span>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <span
                          className={`px-2.5 py-0.5 rounded-full border text-[10px] font-bold uppercase tracking-wider ${badgeCls}`}
                        >
                          {cat}
                        </span>
                        {ev.targetWing && ev.targetWing !== 'All' && (
                          <span className="px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-900 border border-indigo-200 text-[10px] font-bold">
                            {ev.targetWing}
                          </span>
                        )}
                      </div>
                    </div>

                    <h3 className="font-bold text-sm text-on-surface leading-snug">{ev.title}</h3>
                    {ev.description && (
                      <p className="text-xs text-on-surface-variant leading-relaxed">
                        {ev.description}
                      </p>
                    )}
                  </div>

                  <div className="pt-3 border-t border-outline-variant/15 flex flex-wrap items-center justify-between gap-2 text-[11px] text-on-surface-variant font-mono">
                    <span className="inline-flex items-center gap-1">
                      <span className="material-symbols-outlined text-[14px]">schedule</span>
                      {ev.startDate && ev.endDate && ev.startDate !== ev.endDate
                        ? `${formatDateDDMMYYYY(ev.startDate)} to ${formatDateDDMMYYYY(ev.endDate)}`
                        : ev.startDate
                        ? formatDateDDMMYYYY(ev.startDate)
                        : ev.time || 'Scheduled'}
                    </span>
                    <span className="inline-flex items-center gap-1 truncate max-w-[160px]">
                      <span className="material-symbols-outlined text-[14px]">location_on</span>
                      {ev.location}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* 3. EXAMINATION & RESULTS SECTION */}
      <section
        id="exam-results"
        className="no-print scroll-mt-36 rounded-[2rem] bg-white/80 backdrop-blur-2xl border border-outline-variant/25 shadow-[0_16px_40px_-8px_rgba(19,27,46,0.05)] p-6 sm:p-10 space-y-8"
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <span className="text-[11px] uppercase tracking-widest font-semibold text-primary-container">
              Assessment &amp; Marksheet Portal
            </span>
            <h2 className="text-2xl font-display-lg font-bold text-on-surface">
              Examination &amp; Results Framework
            </h2>
          </div>

          <button
            type="button"
            onClick={openResultPortal}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-primary-container hover:bg-primary text-on-primary text-xs font-semibold shadow-sm cursor-pointer w-fit"
          >
            <span className="material-symbols-outlined text-[18px]">search</span>
            Lookup Student Marksheet
          </button>
        </div>

        {/* Grading Scale */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
          {NCTB_GRADING_SCALE.map((row) => (
            <div
              key={row.letter}
              className={`p-4 rounded-2xl border text-center space-y-1 ${
                row.letter === 'F'
                  ? 'bg-error-container/40 border-error/20 text-on-error-container'
                  : row.letter === 'A+'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  : 'bg-surface-container-lowest border-outline-variant/30 text-on-surface'
              }`}
            >
              <div className="text-2xl font-black font-display-lg">{row.letter}</div>
              <div className="text-xs font-mono font-bold">GPA {row.gpa}</div>
              <div className="text-[11px] opacity-80 font-mono">{row.range}%</div>
              <div className="text-[10px] font-semibold uppercase tracking-wider pt-1">
                {row.remarks}
              </div>
            </div>
          ))}
        </div>

        {/* Subject Distribution */}
        {(academicsCfg?.showFourthSubjectGuide ?? true) && (
          <div className="space-y-4 pt-2 border-t border-outline-variant/20">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <h3 className="text-lg font-bold text-on-surface">
                Class &amp; Group Subject Distribution (Compulsory &amp; 4th Subject Guide)
              </h3>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  aria-label="Filter Subjects by Class"
                  value={selectedSubjectClass}
                  onChange={(e) => setSelectedSubjectClass(e.target.value)}
                  className="px-3.5 py-1.5 rounded-full bg-surface-container-low border border-outline-variant/40 text-xs font-semibold text-on-surface"
                >
                  <option value="All">All Classes</option>
                  {visibleClasses.map((cls) => (
                    <option key={cls.id} value={cls.name}>
                      {cls.name}
                    </option>
                  ))}
                </select>

                {groups.map((grp) => (
                  <button
                    key={grp}
                    type="button"
                    onClick={() => setSelectedGroup(grp)}
                    className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                      selectedGroup === grp
                        ? 'bg-primary-container text-on-primary shadow-xs'
                        : 'bg-surface-container-low text-on-surface-variant hover:text-on-surface'
                    }`}
                  >
                    {grp}
                  </button>
                ))}
              </div>
            </div>

            <div className="overflow-x-auto rounded-2xl border border-outline-variant/30">
              <table className="w-full text-left text-xs border-collapse bg-white/90">
                <thead>
                  <tr className="bg-surface-container-low text-on-surface font-bold border-b border-outline-variant/30">
                    <th className="p-3.5">Code</th>
                    <th className="p-3.5">Subject Title</th>
                    <th className="p-3.5">Class &amp; Group</th>
                    <th className="p-3.5 text-center">CQ (Full/Pass)</th>
                    <th className="p-3.5 text-center">MCQ (Full/Pass)</th>
                    <th className="p-3.5 text-center">Practical</th>
                    <th className="p-3.5 text-center">CT / Custom</th>
                    <th className="p-3.5 text-center">Total Marks</th>
                    <th className="p-3.5 text-center">Designation</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/20">
                  {filteredSubjects.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="p-8 text-center text-on-surface-variant">
                        No subjects currently configured for {selectedSubjectClass} ({selectedGroup} track).
                      </td>
                    </tr>
                  ) : (
                    filteredSubjects.map((sub) => {
                      const cqOn = isSubjectComponentEnabled(sub.components.cq);
                      const mcqOn = isSubjectComponentEnabled(sub.components.mcq);
                      const pracOn = isSubjectComponentEnabled(sub.components.practical);
                      const ctOn = Boolean(
                        sub.components.ct &&
                          sub.components.ct.enabled !== false &&
                          sub.components.ct.fullMarks > 0
                      );
                      const customList = getActiveSubjectCustomComponents(sub);
                      const extraParts: string[] = [];
                      if (ctOn && sub.components.ct) {
                        const conv = getEffectiveConversionPercent(
                          sub.components.ct.conversionPercent
                        );
                        extraParts.push(
                          `CT ${sub.components.ct.fullMarks}${conv < 100 ? `@${conv}%` : ''}`
                        );
                      }
                      customList.forEach((c) => {
                        const conv = getEffectiveConversionPercent(c.conversionPercent);
                        extraParts.push(
                          `${c.label} ${c.fullMarks}${conv < 100 ? `@${conv}%` : ''}`
                        );
                      });

                      return (
                        <tr key={sub.id} className="hover:bg-surface-container-lowest/70 transition-colors">
                          <td className="p-3.5 font-mono font-bold text-primary-container">{sub.code}</td>
                          <td className="p-3.5">
                            <div className="font-semibold text-on-surface">{sub.name}</div>
                            {sub.banglaName && (
                              <div className="text-[11px] text-on-surface-variant">{sub.banglaName}</div>
                            )}
                            {(sub.genderRestriction === 'Female' || sub.combinedPaperKey) && (
                              <div className="flex flex-wrap gap-1 mt-1">
                                {sub.genderRestriction === 'Female' && (
                                  <span className="px-1.5 py-0.5 rounded bg-rose-100 text-rose-900 text-[10px] font-bold">
                                    Female Only
                                  </span>
                                )}
                                {sub.combinedPaperKey && (
                                  <span className="px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-900 text-[10px] font-bold">
                                    Paired 1st/2nd
                                  </span>
                                )}
                              </div>
                            )}
                          </td>
                          <td className="p-3.5">
                            <span className="font-medium text-on-surface">{sub.classLevel}</span>
                            <span className="block text-[11px] text-on-surface-variant">
                              {formatSubjectGroupsLabel(sub)}
                            </span>
                          </td>
                          <td className="p-3.5 text-center font-mono tabular-nums">
                            {cqOn
                              ? `${sub.components.cq.fullMarks} / ${sub.components.cq.passMarks}`
                              : '—'}
                          </td>
                          <td className="p-3.5 text-center font-mono tabular-nums">
                            {mcqOn
                              ? `${sub.components.mcq.fullMarks} / ${sub.components.mcq.passMarks}`
                              : '—'}
                          </td>
                          <td className="p-3.5 text-center font-mono tabular-nums">
                            {pracOn
                              ? `${sub.components.practical.fullMarks} / ${sub.components.practical.passMarks}`
                              : '—'}
                          </td>
                          <td className="p-3.5 text-center font-mono text-[11px] text-on-surface-variant">
                            {extraParts.length > 0 ? extraParts.join(' · ') : '—'}
                          </td>
                          <td className="p-3.5 text-center font-mono tabular-nums font-bold text-on-surface">
                            {sub.totalFullMarks}
                          </td>
                          <td className="p-3.5 text-center">
                            {sub.excludeFromGpa ? (
                              <span className="px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 text-[11px] font-semibold">
                                Non-GPA Activity
                              </span>
                            ) : sub.canBeFourthSubject ? (
                              <span className="px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-900 text-[11px] font-semibold">
                                Optional / 4th Sub
                              </span>
                            ) : !sub.isCompulsory ? (
                              <span className="px-2.5 py-0.5 rounded-full bg-sky-100 text-sky-900 text-[11px] font-semibold">
                                Group Elective
                              </span>
                            ) : (
                              <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-900 text-[11px] font-semibold">
                                Compulsory
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
          </div>
        )}
      </section>
    </div>
  );
}

export default function AcademicsPage() {
  return (
    <PublicShell activePath="/academics">
      <AcademicsContent />
    </PublicShell>
  );
}
