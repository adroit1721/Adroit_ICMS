import {
  Subject,
  Student,
  MarkEntry,
  ExamResultRecord,
  ResultCustomComponentBreakdown,
  ResultSubjectBreakdown,
  Exam,
} from './types';
import {
  calcConvertedMark,
  computeSubjectMarksTotals,
  getActiveSubjectCustomComponents,
  getEffectiveConversionPercent,
  isSubjectComponentEnabled,
  resolveSubjectCTConfig,
  sortSubjectsByOrder,
  subjectAppliesToStudent,
} from './academic-helpers';

export function calcNctbPassMark(fullMarks: number): number {
  if (fullMarks <= 0) return 0;
  return Math.round(fullMarks * 0.33);
}

export function marksToGrade(
  marks: number,
  fullMarks: number = 100
): { letter: string; gradePoint: number } {
  const percentage = fullMarks > 0 ? (marks / fullMarks) * 100 : 0;
  const rounded = Math.round(percentage * 100) / 100;

  if (rounded >= 80) return { letter: 'A+', gradePoint: 5.0 };
  if (rounded >= 70) return { letter: 'A', gradePoint: 4.0 };
  if (rounded >= 60) return { letter: 'A-', gradePoint: 3.5 };
  if (rounded >= 50) return { letter: 'B', gradePoint: 3.0 };
  if (rounded >= 40) return { letter: 'C', gradePoint: 2.0 };
  if (rounded >= 33) return { letter: 'D', gradePoint: 1.0 };
  return { letter: 'F', gradePoint: 0.0 };
}

export function gpaToLetter(gpa: number): string {
  if (gpa >= 5.0) return 'A+';
  if (gpa >= 4.0) return 'A';
  if (gpa >= 3.5) return 'A-';
  if (gpa >= 3.0) return 'B';
  if (gpa >= 2.0) return 'C';
  if (gpa >= 1.0) return 'D';
  return 'F';
}

export type ExamCTPolicy = Pick<Exam, 'enableCT' | 'ctMaxMarks' | 'writtenRatioPercent'>;

function resolveEffectiveSubjectFullPass(subject: Subject): {
  totalFullMarks: number;
  totalPassMarks: number;
} {
  const computed = computeSubjectMarksTotals(subject.components, subject.customComponents);
  if (computed.totalFullMarks > 0) {
    return computed;
  }
  return {
    totalFullMarks: subject.totalFullMarks,
    totalPassMarks: subject.totalPassMarks,
  };
}

export function evaluateSubjectResult(
  subject: Subject,
  entry: {
    cq: number;
    mcq: number;
    practical: number;
    ct?: number;
    customMarks?: Record<string, number>;
    isAbsent?: boolean;
  },
  isFourthSubject: boolean,
  examConfig?: ExamCTPolicy
): ResultSubjectBreakdown {
  const cqEnabled = isSubjectComponentEnabled(subject.components.cq);
  const mcqEnabled = isSubjectComponentEnabled(subject.components.mcq);
  const practicalEnabled = isSubjectComponentEnabled(subject.components.practical);
  const ctConfig = resolveSubjectCTConfig(subject, examConfig);
  const activeCustom = getActiveSubjectCustomComponents(subject);

  const cqFull = cqEnabled
    ? calcConvertedMark(subject.components.cq.fullMarks, subject.components.cq.conversionPercent)
    : 0;
  const cqPass = cqEnabled
    ? calcConvertedMark(subject.components.cq.passMarks, subject.components.cq.conversionPercent)
    : 0;
  const mcqFull = mcqEnabled
    ? calcConvertedMark(subject.components.mcq.fullMarks, subject.components.mcq.conversionPercent)
    : 0;
  const mcqPass = mcqEnabled
    ? calcConvertedMark(subject.components.mcq.passMarks, subject.components.mcq.conversionPercent)
    : 0;
  const practicalFull = practicalEnabled
    ? calcConvertedMark(
        subject.components.practical.fullMarks,
        subject.components.practical.conversionPercent
      )
    : 0;
  const practicalPass = practicalEnabled
    ? calcConvertedMark(
        subject.components.practical.passMarks,
        subject.components.practical.conversionPercent
      )
    : 0;

  const { totalFullMarks, totalPassMarks } = resolveEffectiveSubjectFullPass(subject);

  const buildCustomBreakdowns = (absent: boolean): ResultCustomComponentBreakdown[] =>
    activeCustom.map((c) => {
      const conv = getEffectiveConversionPercent(c.conversionPercent);
      const raw = absent ? 0 : Math.min(c.fullMarks, Math.max(0, Number(entry.customMarks?.[c.id] ?? 0) || 0));
      return {
        id: c.id,
        label: c.label,
        rawMarks: raw,
        convertedMarks: absent ? 0 : calcConvertedMark(raw, conv),
        fullMarks: calcConvertedMark(c.fullMarks, conv),
        passMarks: calcConvertedMark(c.passMarks, conv),
        rawFullMarks: c.fullMarks,
        conversionPercent: conv,
      };
    });

  if (entry.isAbsent) {
    return {
      order: subject.order,
      subjectCode: subject.code,
      subjectName: subject.name,
      isAbsent: true,
      ct: ctConfig.enabled ? 0 : undefined,
      ctRaw: ctConfig.enabled ? 0 : undefined,
      ctEnabled: ctConfig.enabled,
      ctFull: ctConfig.mode === 'subject' ? ctConfig.effectiveFullMarks : ctConfig.fullMarks,
      ctPass: ctConfig.mode === 'subject' ? ctConfig.effectivePassMarks : 0,
      cq: 0,
      cqPass,
      cqFull,
      cqEnabled,
      mcq: 0,
      mcqPass,
      mcqFull,
      mcqEnabled,
      practical: 0,
      practicalPass,
      practicalFull,
      practicalEnabled,
      customComponents: buildCustomBreakdowns(true),
      total: 0,
      fullMarks: totalFullMarks,
      passMarks: totalPassMarks,
      gradePoint: 0.0,
      letterGrade: 'F',
      isPassed: false,
      isFourthSubject,
    };
  }

  const rawCq = cqEnabled
    ? Math.min(subject.components.cq.fullMarks, Math.max(0, Number(entry.cq) || 0))
    : 0;
  const rawMcq = mcqEnabled
    ? Math.min(subject.components.mcq.fullMarks, Math.max(0, Number(entry.mcq) || 0))
    : 0;
  const rawPrac = practicalEnabled
    ? Math.min(subject.components.practical.fullMarks, Math.max(0, Number(entry.practical) || 0))
    : 0;

  const cqScore = cqEnabled ? calcConvertedMark(rawCq, subject.components.cq.conversionPercent) : 0;
  const mcqScore = mcqEnabled ? calcConvertedMark(rawMcq, subject.components.mcq.conversionPercent) : 0;
  const pracScore = practicalEnabled
    ? calcConvertedMark(rawPrac, subject.components.practical.conversionPercent)
    : 0;

  const customBreakdowns = buildCustomBreakdowns(false);
  const customTotal = customBreakdowns.reduce((sum, c) => sum + c.convertedMarks, 0);

  let effectiveCtDisplay: number | undefined = undefined;
  let ctRaw: number | undefined = undefined;
  let isCtPassed = true;
  let total = 0;

  if (ctConfig.enabled && ctConfig.mode === 'subject') {
    const rawCt = Math.min(ctConfig.fullMarks, Math.max(0, Number(entry.ct ?? 0) || 0));
    const convertedCt = calcConvertedMark(rawCt, ctConfig.conversionPercent);
    ctRaw = rawCt;
    effectiveCtDisplay = convertedCt;
    isCtPassed = rawCt >= ctConfig.passMarks;
    total = Math.min(totalFullMarks, cqScore + mcqScore + pracScore + convertedCt + customTotal);
  } else if (ctConfig.enabled && ctConfig.mode === 'legacy-exam') {
    const rawCt = Math.min(ctConfig.fullMarks, Math.max(0, Number(entry.ct ?? 0) || 0));
    ctRaw = rawCt;
    effectiveCtDisplay = rawCt;
    const writtenTotal = cqScore + mcqScore + pracScore;
    const writtenScaled = writtenTotal * (ctConfig.writtenRatioPercent / 100);
    const ctWeightRatio = Math.max(0, 100 - ctConfig.writtenRatioPercent) / 100;
    const nonCustomBaseFull = Math.max(
      0,
      totalFullMarks - customBreakdowns.reduce((sum, c) => sum + c.fullMarks, 0)
    );
    const ctScaled = (rawCt / Math.max(1, ctConfig.fullMarks)) * ctWeightRatio * nonCustomBaseFull;
    total = Math.min(totalFullMarks, Math.round(writtenScaled + ctScaled) + customTotal);
  } else {
    total = Math.min(totalFullMarks, cqScore + mcqScore + pracScore + customTotal);
  }

  const isCqPassed = !cqEnabled || rawCq >= subject.components.cq.passMarks;
  const isMcqPassed = !mcqEnabled || rawMcq >= subject.components.mcq.passMarks;
  const isPracticalPassed = !practicalEnabled || rawPrac >= subject.components.practical.passMarks;
  const isCustomPassed = activeCustom.every((c) => {
    const raw = Math.min(c.fullMarks, Math.max(0, Number(entry.customMarks?.[c.id] ?? 0) || 0));
    return raw >= c.passMarks;
  });

  const isComponentPassed =
    isCqPassed &&
    isMcqPassed &&
    isPracticalPassed &&
    isCtPassed &&
    isCustomPassed &&
    total >= totalPassMarks;

  if (!isComponentPassed) {
    return {
      order: subject.order,
      subjectCode: subject.code,
      subjectName: subject.name,
      isAbsent: false,
      ct: effectiveCtDisplay,
      ctRaw,
      ctEnabled: ctConfig.enabled,
      ctFull: ctConfig.mode === 'subject' ? ctConfig.effectiveFullMarks : ctConfig.fullMarks,
      ctPass: ctConfig.mode === 'subject' ? ctConfig.effectivePassMarks : 0,
      cq: cqScore,
      cqPass,
      cqFull,
      cqEnabled,
      mcq: mcqScore,
      mcqPass,
      mcqFull,
      mcqEnabled,
      practical: pracScore,
      practicalPass,
      practicalFull,
      practicalEnabled,
      customComponents: customBreakdowns,
      total,
      fullMarks: totalFullMarks,
      passMarks: totalPassMarks,
      gradePoint: 0.0,
      letterGrade: 'F',
      isPassed: false,
      isFourthSubject,
    };
  }

  const { letter, gradePoint } = marksToGrade(total, totalFullMarks);

  return {
    order: subject.order,
    subjectCode: subject.code,
    subjectName: subject.name,
    isAbsent: false,
    ct: effectiveCtDisplay,
    ctRaw,
    ctEnabled: ctConfig.enabled,
    ctFull: ctConfig.mode === 'subject' ? ctConfig.effectiveFullMarks : ctConfig.fullMarks,
    ctPass: ctConfig.mode === 'subject' ? ctConfig.effectivePassMarks : 0,
    cq: cqScore,
    cqPass,
    cqFull,
    cqEnabled,
    mcq: mcqScore,
    mcqPass,
    mcqFull,
    mcqEnabled,
    practical: pracScore,
    practicalPass,
    practicalFull,
    practicalEnabled,
    customComponents: customBreakdowns,
    total,
    fullMarks: totalFullMarks,
    passMarks: totalPassMarks,
    gradePoint,
    letterGrade: letter,
    isPassed: letter !== 'F',
    isFourthSubject,
  };
}

interface PaperWithMarks {
  subject: Subject;
  cq: number;
  mcq: number;
  practical: number;
  ct?: number;
  customMarks?: Record<string, number>;
  isAbsent?: boolean;
}

function evaluateCombinedPaperGroup(
  papersWithMarks: PaperWithMarks[],
  isFourthSubject: boolean,
  examConfig?: ExamCTPolicy
): ResultSubjectBreakdown {
  const sorted = [...papersWithMarks].sort(
    (a, b) =>
      (a.subject.paperNumber || 9) - (b.subject.paperNumber || 9) ||
      (a.subject.order ?? 9999) - (b.subject.order ?? 9999) ||
      a.subject.code.localeCompare(b.subject.code)
  );

  let cqFull = 0;
  let mcqFull = 0;
  let pracFull = 0;
  let ctFull = 0;
  let ctPassSum = 0;
  let totalFull = 0;

  let cqEnabled = false;
  let mcqEnabled = false;
  let pracEnabled = false;
  let ctEnabled = false;

  let cq = 0;
  let mcq = 0;
  let practical = 0;
  let ct = 0;
  let total = 0;
  let hasAnyAbsent = false;

  const customMap = new Map<string, ResultCustomComponentBreakdown>();
  const combinedPapers: NonNullable<ResultSubjectBreakdown['combinedPapers']> = [];

  for (const item of sorted) {
    const s = item.subject;
    const singleEval = evaluateSubjectResult(
      s,
      {
        cq: item.cq,
        mcq: item.mcq,
        practical: item.practical,
        ct: item.ct,
        customMarks: item.customMarks,
        isAbsent: item.isAbsent,
      },
      isFourthSubject,
      examConfig
    );

    if (singleEval.cqEnabled) cqEnabled = true;
    if (singleEval.mcqEnabled) mcqEnabled = true;
    if (singleEval.practicalEnabled) pracEnabled = true;
    if (singleEval.ctEnabled) ctEnabled = true;

    cqFull += singleEval.cqFull ?? s.components.cq.fullMarks;
    mcqFull += singleEval.mcqFull ?? s.components.mcq.fullMarks;
    pracFull += singleEval.practicalFull ?? s.components.practical.fullMarks;
    ctFull += singleEval.ctFull ?? 0;
    ctPassSum += singleEval.ctPass ?? 0;
    totalFull += singleEval.fullMarks;

    if (item.isAbsent) hasAnyAbsent = true;

    cq += singleEval.cq;
    mcq += singleEval.mcq;
    practical += singleEval.practical;
    ct += singleEval.ct || 0;
    total += singleEval.total;

    for (const c of singleEval.customComponents || []) {
      const key = c.label.trim().toLowerCase();
      const prev = customMap.get(key);
      if (prev) {
        prev.rawMarks += c.rawMarks;
        prev.convertedMarks += c.convertedMarks;
        prev.fullMarks += c.fullMarks;
        prev.passMarks += c.passMarks;
        prev.rawFullMarks += c.rawFullMarks;
      } else {
        customMap.set(key, { ...c });
      }
    }

    combinedPapers.push({
      subjectCode: s.code,
      subjectName: s.name,
      isAbsent: item.isAbsent,
      ct: singleEval.ctEnabled ? singleEval.ct : undefined,
      cq: singleEval.cq,
      mcq: singleEval.mcq,
      practical: singleEval.practical,
      customComponents: singleEval.customComponents,
      total: singleEval.total,
      fullMarks: singleEval.fullMarks,
    });
  }

  const cqPass = cqEnabled ? calcNctbPassMark(cqFull) : 0;
  const mcqPass = mcqEnabled ? calcNctbPassMark(mcqFull) : 0;
  const practicalPass = pracEnabled ? calcNctbPassMark(pracFull) : 0;
  const totalPass = calcNctbPassMark(totalFull);
  const customComponents = Array.from(customMap.values());

  const finalTotal = hasAnyAbsent ? 0 : total;
  const isCustomPassed = customComponents.every((c) => c.convertedMarks >= c.passMarks);
  const isCtPassed = ctPassSum <= 0 || ct >= ctPassSum;
  const isPassedAllComponents =
    !hasAnyAbsent &&
    (!cqEnabled || cq >= cqPass) &&
    (!mcqEnabled || mcq >= mcqPass) &&
    (!pracEnabled || practical >= practicalPass) &&
    isCtPassed &&
    isCustomPassed &&
    finalTotal >= totalPass;

  const first = sorted[0].subject;
  const minOrder = sorted.reduce(
    (min, p) =>
      typeof p.subject.order === 'number' && p.subject.order < min ? p.subject.order : min,
    9999
  );
  const displayCode = sorted.map((p) => p.subject.code).join(' + ');
  const fallbackName = first.name.replace(/\s*(1st|2nd)\s*Paper/i, '').trim();
  const displayName = first.combinedPaperTitle || `${fallbackName} (1st & 2nd Combined)`;

  if (!isPassedAllComponents) {
    return {
      order: minOrder < 9999 ? minOrder : first.order,
      subjectCode: displayCode,
      subjectName: displayName,
      isAbsent: hasAnyAbsent,
      ct: ctEnabled ? ct : undefined,
      ctEnabled,
      ctFull,
      ctPass: ctPassSum,
      cq,
      cqPass,
      cqFull,
      cqEnabled,
      mcq,
      mcqPass,
      mcqFull,
      mcqEnabled,
      practical,
      practicalPass,
      practicalFull: pracFull,
      practicalEnabled: pracEnabled,
      customComponents,
      total: finalTotal,
      fullMarks: totalFull,
      passMarks: totalPass,
      gradePoint: 0.0,
      letterGrade: 'F',
      isPassed: false,
      isFourthSubject,
      combinedPapers,
    };
  }

  const { letter, gradePoint } = marksToGrade(finalTotal, totalFull);

  return {
    order: minOrder < 9999 ? minOrder : first.order,
    subjectCode: displayCode,
    subjectName: displayName,
    isAbsent: false,
    ct: ctEnabled ? ct : undefined,
    ctEnabled,
    ctFull,
    ctPass: ctPassSum,
    cq,
    cqPass,
    cqFull,
    cqEnabled,
    mcq,
    mcqPass,
    mcqFull,
    mcqEnabled,
    practical,
    practicalPass,
    practicalFull: pracFull,
    practicalEnabled: pracEnabled,
    customComponents,
    total: finalTotal,
    fullMarks: totalFull,
    passMarks: totalPass,
    gradePoint,
    letterGrade: letter,
    isPassed: letter !== 'F',
    isFourthSubject,
    combinedPapers,
  };
}

interface EvaluationUnit {
  breakdownsKey: string;
  breakdown: ResultSubjectBreakdown;
  excludeFromGpa: boolean;
  isFourthSubject: boolean;
  subjectCodeForFail: string;
}

function groupAndEvaluateSubjects(
  student: Student,
  applicableSubjects: Subject[],
  examIds: Set<string>,
  allMarkEntries: MarkEntry[],
  combinePairedPapers: boolean,
  averageDivisor: number,
  examConfig?: ExamCTPolicy
): EvaluationUnit[] {
  const orderedSubjects = sortSubjectsByOrder(applicableSubjects);
  const units: EvaluationUnit[] = [];

  const extractSubjectMarks = (sub: Subject) => {
    let sumCq = 0;
    let sumMcq = 0;
    let sumPrac = 0;
    let sumCt = 0;
    const sumCustom: Record<string, number> = {};
    let isAbsent = false;
    const ctConfig = resolveSubjectCTConfig(sub, examConfig);
    const activeCustom = getActiveSubjectCustomComponents(sub);

    for (const exId of examIds) {
      const entry = allMarkEntries.find(
        (m) => m.examId === exId && m.studentId === student.id && m.subjectId === sub.id
      );
      if (entry) {
        if (entry.isAbsent) isAbsent = true;
        sumCq += entry.cqMarks;
        sumMcq += entry.mcqMarks;
        sumPrac += entry.practicalMarks;
        sumCt += entry.isAbsent ? 0 : entry.ctMarks || 0;
        for (const c of activeCustom) {
          const val = entry.isAbsent ? 0 : Number(entry.customMarks?.[c.id] ?? 0) || 0;
          sumCustom[c.id] = (sumCustom[c.id] || 0) + val;
        }
      }
    }

    const avgCustom: Record<string, number> = {};
    for (const c of activeCustom) {
      avgCustom[c.id] = Math.round((sumCustom[c.id] || 0) / averageDivisor);
    }

    return {
      cq: Math.round(sumCq / averageDivisor),
      mcq: Math.round(sumMcq / averageDivisor),
      practical: Math.round(sumPrac / averageDivisor),
      ct: ctConfig.enabled ? Math.round(sumCt / averageDivisor) : undefined,
      customMarks: avgCustom,
      isAbsent,
    };
  };

  if (!combinePairedPapers) {
    for (const subject of orderedSubjects) {
      const avgMarks = extractSubjectMarks(subject);
      const isFourth = student.optionalFourthSubjectId === subject.id;
      units.push({
        breakdownsKey: subject.id,
        breakdown: evaluateSubjectResult(subject, avgMarks, isFourth, examConfig),
        excludeFromGpa: Boolean(subject.excludeFromGpa),
        isFourthSubject: isFourth,
        subjectCodeForFail: subject.code,
      });
    }
    return units;
  }

  // Group paired papers by combinedPaperKey while preserving order of first appearance
  const pairBuckets = new Map<string, Subject[]>();
  const orderedTokens: Array<{ kind: 'pair'; key: string } | { kind: 'single'; subject: Subject }> = [];

  for (const sub of orderedSubjects) {
    if (sub.combinedPaperKey) {
      const bucket = pairBuckets.get(sub.combinedPaperKey);
      if (bucket) {
        bucket.push(sub);
      } else {
        pairBuckets.set(sub.combinedPaperKey, [sub]);
        orderedTokens.push({ kind: 'pair', key: sub.combinedPaperKey });
      }
    } else {
      orderedTokens.push({ kind: 'single', subject: sub });
    }
  }

  for (const token of orderedTokens) {
    if (token.kind === 'single') {
      const subject = token.subject;
      const avgMarks = extractSubjectMarks(subject);
      const isFourth = student.optionalFourthSubjectId === subject.id;
      units.push({
        breakdownsKey: subject.id,
        breakdown: evaluateSubjectResult(subject, avgMarks, isFourth, examConfig),
        excludeFromGpa: Boolean(subject.excludeFromGpa),
        isFourthSubject: isFourth,
        subjectCodeForFail: subject.code,
      });
      continue;
    }

    const papers = pairBuckets.get(token.key) || [];
    const papersWithExamMarks = papers.filter((p) =>
      allMarkEntries.some((m) => examIds.has(m.examId) && m.subjectId === p.id)
    );
    const shouldCombine =
      papers.length >= 2 &&
      (papersWithExamMarks.length === 0 || papersWithExamMarks.length >= 2);

    if (!shouldCombine) {
      for (const subject of papers) {
        const avgMarks = extractSubjectMarks(subject);
        const isFourth = student.optionalFourthSubjectId === subject.id;
        units.push({
          breakdownsKey: subject.id,
          breakdown: evaluateSubjectResult(subject, avgMarks, isFourth, examConfig),
          excludeFromGpa: Boolean(subject.excludeFromGpa),
          isFourthSubject: isFourth,
          subjectCodeForFail: subject.code,
        });
      }
      continue;
    }

    const papersWithMarks: PaperWithMarks[] = papers.map((subject) => {
      const marks = extractSubjectMarks(subject);
      return {
        subject,
        cq: marks.cq,
        mcq: marks.mcq,
        practical: marks.practical,
        ct: marks.ct,
        customMarks: marks.customMarks,
        isAbsent: marks.isAbsent,
      };
    });

    const isFourth = papers.some((p) => student.optionalFourthSubjectId === p.id);
    const excludeFromGpa = papers.every((p) => Boolean(p.excludeFromGpa));
    const breakdown = evaluateCombinedPaperGroup(papersWithMarks, isFourth, examConfig);

    units.push({
      breakdownsKey: `pair-${token.key}`,
      breakdown,
      excludeFromGpa,
      isFourthSubject: isFourth,
      subjectCodeForFail: breakdown.subjectCode,
    });
  }

  return units;
}

export function compileStudentExamRecord(
  student: Student,
  exam: Exam,
  allSubjects: Subject[],
  allMarkEntries: MarkEntry[],
  options?: { combinePairedPapers?: boolean }
): ExamResultRecord {
  const combinePairedPapers = options?.combinePairedPapers ?? true;
  const examIds = new Set([exam.id]);

  const applicableSubjects = sortSubjectsByOrder(
    allSubjects.filter((sub) => {
      if (exam.excludedSubjectIds && exam.excludedSubjectIds.includes(sub.id)) {
        return false;
      }
      const hasExistingMark = allMarkEntries.some(
        (m) => m.examId === exam.id && m.studentId === student.id && m.subjectId === sub.id
      );
      return subjectAppliesToStudent(sub, student, { hasExistingMark });
    })
  );

  const units = groupAndEvaluateSubjects(
    student,
    applicableSubjects,
    examIds,
    allMarkEntries,
    combinePairedPapers,
    1,
    exam
  );

  const breakdowns: ResultSubjectBreakdown[] = [];
  let totalMainGradePoints = 0;
  let mainSubjectCount = 0;
  let fourthSubjectBonus = 0;
  let hasMainSubjectFailed = false;
  let totalMarksObtained = 0;
  let totalFullMarks = 0;
  const failedSubjectCodes: string[] = [];

  for (const unit of units) {
    breakdowns.push(unit.breakdown);
    totalMarksObtained += unit.breakdown.total;
    totalFullMarks += unit.breakdown.fullMarks;

    if (unit.excludeFromGpa) continue;

    if (unit.isFourthSubject) {
      fourthSubjectBonus = Math.max(0, unit.breakdown.gradePoint - 2.0);
    } else {
      mainSubjectCount++;
      totalMainGradePoints += unit.breakdown.gradePoint;
      if (!unit.breakdown.isPassed) {
        hasMainSubjectFailed = true;
        failedSubjectCodes.push(unit.subjectCodeForFail);
      }
    }
  }

  const gpaWithoutFourth =
    mainSubjectCount > 0
      ? Number((totalMainGradePoints / mainSubjectCount).toFixed(2))
      : 0.0;

  let finalGPA = 0.0;
  let finalLetterGrade = 'F';
  let isPassed = false;

  if (!hasMainSubjectFailed && mainSubjectCount > 0) {
    const rawGPA = (totalMainGradePoints + fourthSubjectBonus) / mainSubjectCount;
    finalGPA = Math.min(5.0, Number(rawGPA.toFixed(2)));
    finalLetterGrade = gpaToLetter(finalGPA);
    isPassed = finalLetterGrade !== 'F';
  }

  return {
    id: `res-${exam.id}-${student.id}`,
    examId: exam.id,
    examTitle: exam.title,
    academicYear: exam.academicYear,
    studentId: student.id,
    systemId: student.systemId,
    rollNumber: student.rollNumber,
    studentName: student.fullName,
    fatherName: student.fatherName,
    motherName: student.motherName,
    className: student.className,
    sectionName: student.sectionName,
    group: student.group,
    shift: student.shift,
    registrationNumber: student.registrationNumber,
    subjects: breakdowns,
    totalMarksObtained,
    totalFullMarks,
    gpaWithoutFourth,
    fourthSubjectBonus,
    finalGPA,
    finalLetterGrade,
    isPassed,
    failedSubjectCodes,
    publishedAt: exam.publishedAt || new Date().toISOString(),
  };
}

export function compileJoinedExamRecord(
  student: Student,
  exams: Exam[],
  allSubjects: Subject[],
  allMarkEntries: MarkEntry[],
  mode: 'subject-average' | 'term-average',
  options?: { combinePairedPapers?: boolean }
): {
  student: Student;
  termRecords: ExamResultRecord[];
  joinedSubjects: ResultSubjectBreakdown[];
  joinedTotalMarks: number;
  joinedFullMarks: number;
  joinedGPA: number;
  joinedLetterGrade: string;
  isPassed: boolean;
} {
  const combinePairedPapers = options?.combinePairedPapers ?? true;
  const termRecords = exams.map((ex) =>
    compileStudentExamRecord(student, ex, allSubjects, allMarkEntries, {
      combinePairedPapers,
    })
  );

  const count = Math.max(1, termRecords.length);

  if (mode === 'term-average') {
    const avgMarks = Math.round(
      termRecords.reduce((sum, r) => sum + r.totalMarksObtained, 0) / count
    );
    const fullMarks = termRecords[0]?.totalFullMarks || 0;
    const anyFailed = termRecords.some((r) => !r.isPassed);
    const avgGpa = anyFailed
      ? 0
      : Number(
          (termRecords.reduce((sum, r) => sum + r.finalGPA, 0) / count).toFixed(2)
        );
    return {
      student,
      termRecords,
      joinedSubjects: termRecords[0]?.subjects || [],
      joinedTotalMarks: avgMarks,
      joinedFullMarks: fullMarks,
      joinedGPA: avgGpa,
      joinedLetterGrade: anyFailed ? 'F' : gpaToLetter(avgGpa),
      isPassed: !anyFailed,
    };
  }

  // subject-average mode
  const examIds = new Set(exams.map((ex) => ex.id));
  const joinedCtConfig = exams.find((ex) => ex.enableCT) || exams[0];
  const applicableSubjects = sortSubjectsByOrder(
    allSubjects.filter((sub) => {
      if (exams.length > 0 && exams.every((ex) => ex.excludedSubjectIds?.includes(sub.id))) {
        return false;
      }
      const hasExistingMark = allMarkEntries.some(
        (m) => examIds.has(m.examId) && m.studentId === student.id && m.subjectId === sub.id
      );
      return subjectAppliesToStudent(sub, student, { hasExistingMark });
    })
  );

  const units = groupAndEvaluateSubjects(
    student,
    applicableSubjects,
    examIds,
    allMarkEntries,
    combinePairedPapers,
    count,
    joinedCtConfig
  );

  const joinedSubjects: ResultSubjectBreakdown[] = [];
  let mainPoints = 0;
  let mainCount = 0;
  let fourthBonus = 0;
  let hasMainFail = false;
  let joinedTotalMarks = 0;
  let joinedFullMarks = 0;

  for (const unit of units) {
    joinedSubjects.push(unit.breakdown);
    joinedTotalMarks += unit.breakdown.total;
    joinedFullMarks += unit.breakdown.fullMarks;

    if (unit.excludeFromGpa) continue;

    if (unit.isFourthSubject) {
      fourthBonus = Math.max(0, unit.breakdown.gradePoint - 2.0);
    } else {
      mainCount++;
      mainPoints += unit.breakdown.gradePoint;
      if (!unit.breakdown.isPassed) hasMainFail = true;
    }
  }

  let joinedGPA = 0;
  if (!hasMainFail && mainCount > 0) {
    joinedGPA = Math.min(5.0, Number(((mainPoints + fourthBonus) / mainCount).toFixed(2)));
  }

  return {
    student,
    termRecords,
    joinedSubjects,
    joinedTotalMarks,
    joinedFullMarks,
    joinedGPA,
    joinedLetterGrade: hasMainFail ? 'F' : gpaToLetter(joinedGPA),
    isPassed: !hasMainFail,
  };
}

export function computeClassAndSectionMeritRanks(records: ExamResultRecord[]): ExamResultRecord[] {
  const compareRecords = (a: ExamResultRecord, b: ExamResultRecord) => {
    // 1. Passed candidates rank above failed candidates
    if (a.isPassed !== b.isPassed) {
      return a.isPassed ? -1 : 1;
    }

    if (a.isPassed && b.isPassed) {
      // 2. Highest final GPA
      if (Math.abs(b.finalGPA - a.finalGPA) > 0.001) {
        return b.finalGPA - a.finalGPA;
      }
      // 3. Highest Total Marks Obtained
      if (b.totalMarksObtained !== a.totalMarksObtained) {
        return b.totalMarksObtained - a.totalMarksObtained;
      }
      // 4. Priority subjects: Math (109) -> English (107) -> Bangla (101)
      const getSubjectTotal = (rec: ExamResultRecord, codePrefix: string) => {
        const sub = rec.subjects.find((s) => s.subjectCode.startsWith(codePrefix));
        return sub ? sub.total : 0;
      };
      const mathDiff = getSubjectTotal(b, '109') - getSubjectTotal(a, '109');
      if (mathDiff !== 0) return mathDiff;
      const engDiff = getSubjectTotal(b, '107') - getSubjectTotal(a, '107');
      if (engDiff !== 0) return engDiff;
      const banDiff = getSubjectTotal(b, '101') - getSubjectTotal(a, '101');
      if (banDiff !== 0) return banDiff;

      // 5. Lower Roll Number
      return a.rollNumber - b.rollNumber;
    }

    // Both failed: fewer failed subjects ranks higher
    const failDiff = (a.failedSubjectCodes?.length || 0) - (b.failedSubjectCodes?.length || 0);
    if (failDiff !== 0) return failDiff;
    if (b.totalMarksObtained !== a.totalMarksObtained) {
      return b.totalMarksObtained - a.totalMarksObtained;
    }
    return a.rollNumber - b.rollNumber;
  };

  const classMap = new Map<string, ExamResultRecord[]>();
  for (const r of records) {
    const list = classMap.get(r.className) || [];
    list.push(r);
    classMap.set(r.className, list);
  }

  const result: ExamResultRecord[] = [];

  for (const [_, classRecords] of classMap.entries()) {
    const sortedClass = [...classRecords].sort(compareRecords);
    const rankedWithClass = sortedClass.map((rec, idx) => ({
      ...rec,
      classRank: idx + 1,
    }));

    const sectionMap = new Map<string, ExamResultRecord[]>();
    for (const r of rankedWithClass) {
      const list = sectionMap.get(r.sectionName) || [];
      list.push(r);
      sectionMap.set(r.sectionName, list);
    }

    for (const [_, sectionRecords] of sectionMap.entries()) {
      const sortedSection = [...sectionRecords].sort(compareRecords);
      sortedSection.forEach((rec, sIdx) => {
        result.push({
          ...rec,
          sectionRank: sIdx + 1,
        });
      });
    }
  }

  return result;
}



