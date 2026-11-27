'use client';

import { useMemo, useState } from 'react';
import {
  AcademicClass,
  AcademicGroup,
  Exam,
  InstituteRules,
  MarkEntry,
  PromotionMode,
  Student,
  Subject,
} from '@/lib/types';
import { getEffectiveSectionsForClassGroup } from '@/lib/academic-helpers';
import { buildPromotionPreview } from '@/lib/student-schema';
import {
  AlertCircle,
  ArrowRight,
  Award,
  CheckCircle2,
  Loader2,
  TrendingUp,
  Users,
  X,
} from 'lucide-react';

interface StudentPromoteModalProps {
  selectedStudents: Student[];
  allStudents: Student[];
  academicClasses: AcademicClass[];
  exams: Exam[];
  subjects: Subject[];
  markEntries: MarkEntry[];
  instituteRules: InstituteRules;
  onPromoted: (promotedCount: number, targetClass: string, promotedIds: string[]) => void;
  onClose: () => void;
}

interface RowOverride {
  included?: boolean;
  targetGroup?: AcademicGroup;
  targetSection?: string;
  newRoll?: number;
}

export default function StudentPromoteModal({
  selectedStudents,
  allStudents,
  academicClasses,
  exams,
  subjects,
  markEntries,
  instituteRules,
  onPromoted,
  onClose,
}: StudentPromoteModalProps) {
  const sourceClassName = selectedStudents[0]?.className || '';
  const sourceClassIndex = academicClasses.findIndex((c) => c.name === sourceClassName);
  const autoNextClass =
    (sourceClassIndex >= 0 && academicClasses[sourceClassIndex + 1]?.name) ||
    academicClasses.find((c) => c.name !== sourceClassName)?.name ||
    academicClasses[0]?.name ||
    '';

  const [promotionKind, setPromotionKind] = useState<'simple' | 'result'>('result');
  const [simpleRollStrategy, setSimpleRollStrategy] = useState<'direct' | 'keep-roll'>('direct');
  const [targetClass, setTargetClass] = useState<string>(autoNextClass);

  const targetClsObj = academicClasses.find((c) => c.name === targetClass);
  const targetHasGroups =
    targetClsObj?.hasGroups !== false &&
    (targetClsObj?.groups?.some((g) => g !== 'General') ?? false);
  const targetGroupOptions = useMemo<AcademicGroup[]>(() => {
    if (!targetHasGroups) return ['General'];
    const filtered = targetClsObj?.groups?.filter((g) => g !== 'General') || [];
    return filtered.length > 0 ? filtered : ['Science', 'Business Studies', 'Humanities'];
  }, [targetHasGroups, targetClsObj]);

  const [targetGroupOverride, setTargetGroupOverride] = useState<AcademicGroup | 'KEEP'>('KEEP');
  const initialSections = getEffectiveSectionsForClassGroup(
    targetClsObj,
    targetHasGroups ? targetGroupOptions[0] : 'General'
  );
  const [targetSection, setTargetSection] = useState<string>(initialSections[0] || 'Common');

  const classExams = useMemo(() => {
    const matching = exams.filter(
      (e) =>
        !sourceClassName ||
        !e.targetClasses?.length ||
        e.targetClasses.includes(sourceClassName)
    );
    const list = matching.length > 0 ? matching : exams;
    return [...list].sort((a, b) => {
      const aPub = a.status === 'Published' ? 1 : 0;
      const bPub = b.status === 'Published' ? 1 : 0;
      if (aPub !== bPub) return bPub - aPub;
      return b.id.localeCompare(a.id);
    });
  }, [exams, sourceClassName]);

  const [selectedExamId, setSelectedExamId] = useState<string>(classExams[0]?.id || '');
  const [skipFailedStudents, setSkipFailedStudents] = useState<boolean>(true);
  const [rowOverrides, setRowOverrides] = useState<Record<string, RowOverride>>({});
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const selectedExam = classExams.find((e) => e.id === selectedExamId);
  const effectiveMode: PromotionMode =
    promotionKind === 'result' ? 'merit' : simpleRollStrategy;

  const targetSectionOptions = useMemo(() => {
    const grp =
      targetHasGroups && targetGroupOverride !== 'KEEP'
        ? targetGroupOverride
        : targetGroupOptions[0] || 'General';
    return getEffectiveSectionsForClassGroup(targetClsObj, grp);
  }, [targetClsObj, targetHasGroups, targetGroupOverride, targetGroupOptions]);

  const previewRows = useMemo(() => {
    return buildPromotionPreview({
      selectedStudents,
      allStudents,
      targetClass,
      targetSection,
      targetGroupOverride: targetHasGroups ? targetGroupOverride : 'KEEP',
      targetClsObj,
      mode: effectiveMode,
      exam: promotionKind === 'result' ? selectedExam : undefined,
      subjects,
      markEntries,
      rules: instituteRules,
    });
  }, [
    selectedStudents,
    allStudents,
    targetClass,
    targetSection,
    targetGroupOverride,
    targetHasGroups,
    targetClsObj,
    effectiveMode,
    promotionKind,
    selectedExam,
    subjects,
    markEntries,
    instituteRules,
  ]);

  const resolvedRows = useMemo(() => {
    const existingInTarget = allStudents.filter(
      (s) =>
        s.status === 'Active' &&
        s.className === targetClass &&
        !selectedStudents.some((sel) => sel.id === s.id)
    );

    const rowsWithOverrides = previewRows.map((row) => {
      const ov = rowOverrides[row.student.id];
      const defaultIncluded =
        promotionKind === 'result' &&
        skipFailedStudents &&
        row.hasExamRecord &&
        row.isPassed === false
          ? false
          : true;

      const included = ov?.included ?? defaultIncluded;
      const finalGroup: AcademicGroup = targetHasGroups
        ? ov?.targetGroup || row.targetGroup
        : 'General';
      const finalSection = ov?.targetSection || row.targetSection;
      const finalRoll =
        typeof ov?.newRoll === 'number' && ov.newRoll > 0 ? ov.newRoll : row.newRoll;

      return {
        ...row,
        included,
        finalGroup,
        finalSection,
        finalRoll,
      };
    });

    // Re-number sequential rolls cleanly when in Result-Wise Merit mode & no manual roll override
    if (promotionKind === 'result') {
      const secCounters = new Map<string, number>();
      rowsWithOverrides.forEach((item) => {
        if (!item.included) return;
        const ov = rowOverrides[item.student.id];
        if (typeof ov?.newRoll === 'number' && ov.newRoll > 0) return;
        const secKey = item.finalSection || 'Common';
        if (!secCounters.has(secKey)) {
          const maxExisting = existingInTarget
            .filter((s) => (s.sectionName || 'Common') === secKey)
            .reduce((m, s) => Math.max(m, s.rollNumber), 0);
          secCounters.set(secKey, maxExisting);
        }
        const nextVal = (secCounters.get(secKey) || 0) + 1;
        secCounters.set(secKey, nextVal);
        item.finalRoll = nextVal;
      });
    }

    const rollCounts = new Map<string, number>();
    rowsWithOverrides.forEach((r) => {
      if (!r.included) return;
      const k = `${r.finalSection}::${r.finalRoll}`;
      rollCounts.set(k, (rollCounts.get(k) || 0) + 1);
    });

    return rowsWithOverrides.map((r) => {
      const k = `${r.finalSection}::${r.finalRoll}`;
      const existingCollision = existingInTarget.some(
        (s) => (s.sectionName || 'Common') === r.finalSection && s.rollNumber === r.finalRoll
      );
      const batchDuplicate = r.included && (rollCounts.get(k) || 0) > 1;
      return {
        ...r,
        hasCollision: r.included && (existingCollision || batchDuplicate),
      };
    });
  }, [
    previewRows,
    rowOverrides,
    promotionKind,
    skipFailedStudents,
    targetHasGroups,
    allStudents,
    targetClass,
    selectedStudents,
  ]);

  const includedRows = resolvedRows.filter((r) => r.included);
  const failedCount = previewRows.filter((r) => r.hasExamRecord && r.isPassed === false).length;
  const passedCount = previewRows.filter((r) => r.hasExamRecord && r.isPassed === true).length;
  const collisionCount = resolvedRows.filter((r) => r.hasCollision).length;
  const missingGroupCount = includedRows.filter(
    (r) => targetHasGroups && r.finalGroup === 'General'
  ).length;

  const handleConfirmSubmit = async () => {
    setErrorMsg(null);
    if (!targetClass) {
      setErrorMsg('Select a target class.');
      return;
    }
    if (includedRows.length === 0) {
      setErrorMsg('Select at least one student to promote.');
      return;
    }
    if (promotionKind === 'result' && !selectedExam) {
      setErrorMsg('Select an exam for Result-Wise promotion, or switch to Simple Next Class.');
      return;
    }
    if (missingGroupCount > 0) {
      setErrorMsg(
        `${targetClass} requires a valid Academic Group (Science / Business Studies / Humanities) for all promoted students.`
      );
      return;
    }
    if (collisionCount > 0) {
      setErrorMsg(
        'Roll collision detected in the preview table. Adjust the colliding roll numbers or choose sequential roll assignment.'
      );
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/students/promote', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-requested-with': 'erp-client',
        },
        credentials: 'include',
        body: JSON.stringify({
          studentIds: includedRows.map((r) => r.student.id),
          targetClass,
          targetSection,
          targetGroup:
            targetHasGroups && targetGroupOverride !== 'KEEP' ? targetGroupOverride : undefined,
          mode: effectiveMode,
          examId: promotionKind === 'result' ? selectedExam?.id : undefined,
          examTitle: promotionKind === 'result' ? selectedExam?.title : undefined,
          assignments: includedRows.map((r) => ({
            studentId: r.student.id,
            targetSection: r.finalSection,
            targetGroup: r.finalGroup,
            newRoll: r.finalRoll,
            gpa: r.gpa,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to promote selected students');
      }
      onPromoted(
        data.promotedCount || includedRows.length,
        targetClass,
        includedRows.map((r) => r.student.id)
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Promotion failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/60 backdrop-blur-xs">
      <div className="bg-surface-container-lowest rounded-3xl w-full max-w-5xl max-h-[92vh] flex flex-col shadow-2xl border border-outline-variant/25 overflow-hidden">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-outline-variant/20 flex items-center justify-between bg-surface-container-low/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-secondary/10 text-secondary flex items-center justify-center">
              <TrendingUp className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-on-surface">
                Student Promotion &amp; Class Progression ({selectedStudents.length} Selected)
              </h3>
              <p className="text-xs text-on-surface-variant">
                Choose <strong>Result-Wise Merit Promotion</strong> (auto-ranks by Exam GPA &amp; Marks) or{' '}
                <strong>Simple Next Class Promotion</strong>.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-surface-container text-on-surface-variant cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Configuration Controls */}
        <div className="p-5 border-b border-outline-variant/20 space-y-4 bg-surface-container-lowest text-xs">
          {/* Promotion Mode Switcher */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => {
                setPromotionKind('result');
                setRowOverrides({});
                setErrorMsg(null);
              }}
              className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer flex items-start gap-3 ${
                promotionKind === 'result'
                  ? 'bg-primary/5 border-primary-container ring-1 ring-primary-container'
                  : 'bg-surface-container-low/60 border-outline-variant/25 hover:bg-surface-container-low'
              }`}
            >
              <Award
                className={`w-5 h-5 mt-0.5 shrink-0 ${
                  promotionKind === 'result' ? 'text-primary-container' : 'text-on-surface-variant'
                }`}
              />
              <div>
                <div className="font-bold text-on-surface">Result-Wise Merit Promotion</div>
                <p className="text-[11px] text-on-surface-variant mt-0.5">
                  Uses Annual/Final Exam GPA &amp; Total Marks to rank passed students into new merit Roll #1, #2, #3... and optionally holds back failed students.
                </p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => {
                setPromotionKind('simple');
                setRowOverrides({});
                setErrorMsg(null);
              }}
              className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer flex items-start gap-3 ${
                promotionKind === 'simple'
                  ? 'bg-secondary/5 border-secondary ring-1 ring-secondary'
                  : 'bg-surface-container-low/60 border-outline-variant/25 hover:bg-surface-container-low'
              }`}
            >
              <ArrowRight
                className={`w-5 h-5 mt-0.5 shrink-0 ${
                  promotionKind === 'simple' ? 'text-secondary' : 'text-on-surface-variant'
                }`}
              />
              <div>
                <div className="font-bold text-on-surface">Simple Next Class Promotion</div>
                <p className="text-[11px] text-on-surface-variant mt-0.5">
                  Directly promotes selected students to the next class while keeping their existing Roll No. or appending sequential Roll numbers.
                </p>
              </div>
            </button>
          </div>

          {/* Target Class, Section, Group & Mode Options */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-on-surface-variant mb-1">
                Target Class *
              </label>
              <select
                value={targetClass}
                onChange={(e) => {
                  const nextCls = e.target.value;
                  setTargetClass(nextCls);
                  const clsObj = academicClasses.find((c) => c.name === nextCls);
                  const secs = getEffectiveSectionsForClassGroup(clsObj);
                  setTargetSection(secs[0] || 'Common');
                  setTargetGroupOverride('KEEP');
                  setRowOverrides({});
                }}
                className="w-full px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 font-semibold text-xs"
              >
                {academicClasses.map((c) => (
                  <option key={c.id} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-on-surface-variant mb-1">
                Default Target Section
              </label>
              <select
                value={targetSection}
                onChange={(e) => {
                  setTargetSection(e.target.value);
                  setRowOverrides({});
                }}
                className="w-full px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 font-semibold text-xs"
              >
                {targetSectionOptions.map((sec) => (
                  <option key={sec} value={sec}>
                    {sec === 'Common' ? 'Combined (Single Batch)' : `Section ${sec}`}
                  </option>
                ))}
              </select>
            </div>

            {targetHasGroups ? (
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-on-surface-variant mb-1">
                  Target Academic Group
                </label>
                <select
                  value={targetGroupOverride}
                  onChange={(e) => {
                    setTargetGroupOverride(e.target.value as AcademicGroup | 'KEEP');
                    setRowOverrides({});
                  }}
                  className="w-full px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 font-semibold text-xs"
                >
                  <option value="KEEP">Keep Current / Auto-Assign</option>
                  {targetGroupOptions.map((g) => (
                    <option key={g} value={g}>
                      All → {g}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-on-surface-variant mb-1">
                  Target Academic Group
                </label>
                <div className="px-3 py-2 rounded-xl bg-secondary-fixed/40 border border-outline-variant/25 font-semibold text-on-secondary-container">
                  General (No Group Split)
                </div>
              </div>
            )}

            {promotionKind === 'result' ? (
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-on-surface-variant mb-1">
                  Basis Examination *
                </label>
                <select
                  value={selectedExamId}
                  onChange={(e) => {
                    setSelectedExamId(e.target.value);
                    setRowOverrides({});
                  }}
                  className="w-full px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 font-semibold text-xs"
                >
                  {classExams.length === 0 ? (
                    <option value="">No exams created yet</option>
                  ) : (
                    classExams.map((ex) => (
                      <option key={ex.id} value={ex.id}>
                        {ex.title} ({ex.academicYear} · {ex.status})
                      </option>
                    ))
                  )}
                </select>
              </div>
            ) : (
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-on-surface-variant mb-1">
                  Roll Assignment Strategy
                </label>
                <select
                  value={simpleRollStrategy}
                  onChange={(e) => {
                    setSimpleRollStrategy(e.target.value as 'direct' | 'keep-roll');
                    setRowOverrides({});
                  }}
                  className="w-full px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 font-semibold text-xs"
                >
                  <option value="direct">Auto-Assign Sequential Rolls</option>
                  <option value="keep-roll">Keep Existing Roll Numbers</option>
                </select>
              </div>
            )}
          </div>

          {/* Result-Wise Summary & Detain Toggle */}
          {promotionKind === 'result' && (
            <div className="flex flex-wrap items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl bg-surface-container-low border border-outline-variant/20">
              <div className="flex flex-wrap items-center gap-3 text-[11px] font-semibold">
                <span className="inline-flex items-center gap-1 text-emerald-700">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Passed: {passedCount}
                </span>
                <span className="inline-flex items-center gap-1 text-red-700">
                  <AlertCircle className="w-3.5 h-3.5" />
                  Failed: {failedCount}
                </span>
                <span className="inline-flex items-center gap-1 text-on-surface-variant">
                  <Users className="w-3.5 h-3.5" />
                  Promoting: {includedRows.length} / {selectedStudents.length}
                </span>
              </div>

              <label className="inline-flex items-center gap-2 text-xs font-semibold text-on-surface cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={skipFailedStudents}
                  onChange={(e) => {
                    setSkipFailedStudents(e.target.checked);
                    setRowOverrides({});
                  }}
                  className="w-4 h-4 rounded"
                />
                <span>Hold Back / Exclude Failed Students</span>
              </label>
            </div>
          )}

          {errorMsg && (
            <div className="p-3 rounded-xl bg-error-container/25 border border-error/30 text-error font-semibold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}
        </div>

        {/* Live Preview Table */}
        <div className="flex-1 overflow-y-auto px-5 py-3">
          <table className="w-full text-left border-collapse text-xs">
            <thead className="sticky top-0 bg-surface-container-low z-10">
              <tr className="border-b border-outline-variant/25 text-on-surface-variant text-[11px]">
                <th className="py-2.5 px-2.5 w-9">Promote</th>
                <th className="py-2.5 px-2.5 font-semibold">Student</th>
                <th className="py-2.5 px-2.5 font-semibold">Old Roll</th>
                {promotionKind === 'result' && (
                  <>
                    <th className="py-2.5 px-2.5 font-semibold">Result</th>
                    <th className="py-2.5 px-2.5 font-semibold">GPA / Marks</th>
                  </>
                )}
                <th className="py-2.5 px-2.5 font-semibold">Target Group</th>
                <th className="py-2.5 px-2.5 font-semibold">Target Section</th>
                <th className="py-2.5 px-2.5 font-semibold">New Roll</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/15">
              {resolvedRows.map((row) => {
                const secChoices = getEffectiveSectionsForClassGroup(targetClsObj, row.finalGroup);
                return (
                  <tr
                    key={row.student.id}
                    className={`${
                      !row.included
                        ? 'opacity-50 bg-surface-container-low/30'
                        : row.hasCollision
                          ? 'bg-error-container/15'
                          : 'hover:bg-surface-container-low/40'
                    }`}
                  >
                    <td className="py-2 px-2.5">
                      <input
                        type="checkbox"
                        checked={row.included}
                        onChange={(e) =>
                          setRowOverrides((prev) => ({
                            ...prev,
                            [row.student.id]: {
                              ...prev[row.student.id],
                              included: e.target.checked,
                            },
                          }))
                        }
                      />
                    </td>
                    <td className="py-2 px-2.5">
                      <div className="font-semibold text-on-surface">{row.student.fullName}</div>
                      <div className="text-[10px] font-mono text-on-surface-variant">
                        {row.student.systemId} · {row.student.className}
                      </div>
                    </td>
                    <td className="py-2 px-2.5 font-mono font-bold tabular-nums">
                      #{row.student.rollNumber}
                    </td>

                    {promotionKind === 'result' && (
                      <>
                        <td className="py-2 px-2.5">
                          {!row.hasExamRecord ? (
                            <span className="px-2 py-0.5 rounded-md bg-amber-100 text-amber-800 text-[10px] font-bold">
                              NO MARKS
                            </span>
                          ) : row.isPassed ? (
                            <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                              PASS
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-md bg-red-100 text-red-800 text-[10px] font-bold">
                              FAIL
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-2.5 font-mono tabular-nums">
                          {row.hasExamRecord ? (
                            <span>
                              <strong>{(row.gpa ?? 0).toFixed(2)}</strong>
                              <span className="text-on-surface-variant ml-1">
                                ({row.totalMarks ?? 0})
                              </span>
                            </span>
                          ) : (
                            '—'
                          )}
                        </td>
                      </>
                    )}

                    <td className="py-2 px-2.5">
                      {targetHasGroups ? (
                        <select
                          disabled={!row.included}
                          value={row.finalGroup}
                          onChange={(e) =>
                            setRowOverrides((prev) => ({
                              ...prev,
                              [row.student.id]: {
                                ...prev[row.student.id],
                                targetGroup: e.target.value as AcademicGroup,
                              },
                            }))
                          }
                          className="px-2 py-1 rounded-lg bg-surface-container-low border border-outline-variant/30 text-xs font-medium"
                        >
                          {targetGroupOptions.map((g) => (
                            <option key={g} value={g}>
                              {g}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-on-surface-variant">General</span>
                      )}
                    </td>

                    <td className="py-2 px-2.5">
                      <select
                        disabled={!row.included}
                        value={secChoices.includes(row.finalSection) ? row.finalSection : secChoices[0] || 'Common'}
                        onChange={(e) =>
                          setRowOverrides((prev) => ({
                            ...prev,
                            [row.student.id]: {
                              ...prev[row.student.id],
                              targetSection: e.target.value,
                            },
                          }))
                        }
                        className="px-2 py-1 rounded-lg bg-surface-container-low border border-outline-variant/30 text-xs font-medium"
                      >
                        {secChoices.map((sec) => (
                          <option key={sec} value={sec}>
                            {sec === 'Common' ? 'Combined' : `Sec ${sec}`}
                          </option>
                        ))}
                      </select>
                    </td>

                    <td className="py-2 px-2.5">
                      <div className="flex items-center gap-1.5">
                        <input
                          type="number"
                          min={1}
                          disabled={!row.included}
                          value={row.finalRoll}
                          onChange={(e) =>
                            setRowOverrides((prev) => ({
                              ...prev,
                              [row.student.id]: {
                                ...prev[row.student.id],
                                newRoll: Math.max(1, Number(e.target.value) || 1),
                              },
                            }))
                          }
                          className={`w-16 px-2 py-1 rounded-lg border font-mono font-bold tabular-nums text-xs ${
                            row.hasCollision
                              ? 'border-error bg-error-container/20 text-error'
                              : 'border-outline-variant/30 bg-white'
                          }`}
                        />
                        {row.hasCollision && (
                          <span className="text-[10px] font-bold text-error">Collision</span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-outline-variant/20 bg-surface-container-low/50 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="text-on-surface-variant">
            Promoting <strong>{includedRows.length}</strong> student(s) to{' '}
            <strong className="text-on-surface">{targetClass}</strong> (
            {promotionKind === 'result' ? 'Result-Wise Merit Rank' : 'Simple Next Class'}).
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-surface-container hover:bg-surface-container-high font-semibold cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={submitting || includedRows.length === 0}
              onClick={() => void handleConfirmSubmit()}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-secondary hover:bg-secondary/90 disabled:opacity-50 text-on-secondary font-bold shadow-sm cursor-pointer"
            >
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
              <span>Promote Selected Students ({includedRows.length})</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
