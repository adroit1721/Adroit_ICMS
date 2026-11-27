'use client';

import React from 'react';
import {
  CMSConfig,
  Exam,
  ExamResultRecord,
  MarksheetTemplate,
  Signatory,
  Student,
  StudentMarksheetMeta,
} from '@/lib/types';
import { Award, CheckCircle2, QrCode, XCircle } from 'lucide-react';
import { formatDateDDMMYYYY } from '@/lib/academic-helpers';

export interface ResolvedMarksheetTemplate {
  borderStyle: 'classic-double' | 'modern-clean' | 'official-seal' | 'none';
  accentColor: string;
  fontFamily: 'sans' | 'serif';
  watermarkOpacity: number;
  boardTitle: string;
  headerSubtitle: string;
  defaultWorkingDays: number | undefined;
  showHeader: boolean;
  showStudentPhoto: boolean;
  showBanglaName: boolean;
  showFatherMother: boolean;
  showRollReg: boolean;
  showClassSectionGroup: boolean;
  showSystemId: boolean;
  showDateOfBirth: boolean;
  showGradingScale: boolean;
  showSubjectCode: boolean;
  showFullMarksCol: boolean;
  showPassMarksCol: boolean;
  showCombinedPaperDetails: boolean;
  showGradePointCol: boolean;
  showCoreGpaAndBonus: boolean;
  showMeritRank: boolean;
  showAttendanceConduct: boolean;
  showQrVerification: boolean;
  customFields: NonNullable<MarksheetTemplate['customFields']>;
}

export function resolveMarksheetTemplate(
  template?: MarksheetTemplate
): ResolvedMarksheetTemplate {
  return {
    borderStyle: template?.borderStyle || 'classic-double',
    accentColor: template?.accentColor || '#9a3412',
    fontFamily: template?.fontFamily || 'sans',
    watermarkOpacity:
      typeof template?.watermarkOpacity === 'number' ? template.watermarkOpacity : 0.1,
    boardTitle: template?.boardTitle || '',
    headerSubtitle:
      template?.headerSubtitle || 'Academic Transcript & Official Marksheet',
    defaultWorkingDays: template?.defaultWorkingDays,
    showHeader: template?.showHeader ?? true,
    showStudentPhoto: template?.showStudentPhoto ?? false,
    showBanglaName: template?.showBanglaName ?? true,
    showFatherMother: template?.showFatherMother ?? true,
    showRollReg: template?.showRollReg ?? true,
    showClassSectionGroup: template?.showClassSectionGroup ?? true,
    showSystemId: template?.showSystemId ?? true,
    showDateOfBirth: template?.showDateOfBirth ?? false,
    showGradingScale: template?.showGradingScale ?? true,
    showSubjectCode: template?.showSubjectCode ?? true,
    showFullMarksCol: template?.showFullMarksCol ?? true,
    showPassMarksCol: template?.showPassMarksCol ?? false,
    showCombinedPaperDetails: template?.showCombinedPaperDetails ?? true,
    showGradePointCol: template?.showGradePointCol ?? true,
    showCoreGpaAndBonus: template?.showCoreGpaAndBonus ?? true,
    showMeritRank: template?.showMeritRank ?? true,
    showAttendanceConduct: template?.showAttendanceConduct ?? true,
    showQrVerification: template?.showQrVerification ?? true,
    customFields: template?.customFields || [],
  };
}

interface MarksheetDocumentProps {
  result: ExamResultRecord;
  exam?: Partial<Exam> | null;
  student?: Student | null;
  cmsConfig: CMSConfig;
  qrCodeDataUrl?: string;
  templateOverride?: MarksheetTemplate;
  metaOverride?: StudentMarksheetMeta;
  bgUrlOverride?: string;
  stationeryModeOverride?: 'full-design' | 'pre-printed-overlay';
  signatoriesOverride?: Signatory[];
}

export default function MarksheetDocument({
  result,
  exam,
  student,
  cmsConfig,
  qrCodeDataUrl,
  templateOverride,
  metaOverride,
  bgUrlOverride,
  stationeryModeOverride,
  signatoriesOverride,
}: MarksheetDocumentProps) {
  const t = resolveMarksheetTemplate(templateOverride ?? exam?.marksheetTemplate);
  const meta: StudentMarksheetMeta =
    metaOverride ?? exam?.studentMarksheetMeta?.[result.studentId] ?? {};

  const stationeryMode =
    stationeryModeOverride ?? exam?.stationeryMode ?? 'full-design';
  const bgUrl = bgUrlOverride ?? exam?.marksheetBgUrl ?? '';
  const signatories = (signatoriesOverride ?? exam?.signatories ?? []).filter(
    (s) => s.enabled
  );

  const workingDays =
    meta.workingDays ?? t.defaultWorkingDays ?? result.attendanceTotalDays;
  const daysPresent = meta.daysPresent ?? result.attendancePresent;
  const attendancePct =
    workingDays && workingDays > 0 && typeof daysPresent === 'number'
      ? `${((daysPresent / workingDays) * 100).toFixed(1)}%`
      : null;

  const conductValue = meta.conduct || result.conductGrade || '';
  const promotionText =
    meta.promotionStatus ||
    (result.isPassed
      ? 'PASSED / PROMOTED'
      : `FAILED (${result.failedSubjectCodes.join(', ') || 'Core Subjects'})`);
  const teacherRemark =
    meta.teacherRemark ||
    result.teacherRemarks ||
    (result.isPassed
      ? 'Demonstrated commendable academic diligence, discipline, and steady classroom progress.'
      : 'Requires focused remedial practice and regular attendance in weaker subject areas.');

  const gridCustomFields = t.customFields.filter(
    (f) => f.placement === 'student-grid'
  );
  const footerCustomFields = t.customFields.filter(
    (f) => f.placement === 'footer-notes'
  );

  const borderFrameClass =
    stationeryMode === 'pre-printed-overlay' || t.borderStyle === 'none'
      ? 'p-5 sm:p-7 relative'
      : t.borderStyle === 'modern-clean'
      ? 'border-2 rounded-2xl p-6 sm:p-8 relative'
      : t.borderStyle === 'official-seal'
      ? 'border-4 border-solid p-6 sm:p-8 relative'
      : 'border-4 border-double p-6 sm:p-8 relative';

  const frameDynamicStyle: React.CSSProperties | undefined =
    stationeryMode === 'pre-printed-overlay' || t.borderStyle === 'none'
      ? undefined
      : { borderColor: `${t.accentColor}66` };

  const showTopHeader =
    stationeryMode === 'full-design' && t.showHeader;

  const hasExplicitOrder = result.subjects.some((s) => typeof s.order === 'number');
  const displaySubjects = hasExplicitOrder
    ? [...result.subjects].sort((a, b) => (a.order ?? 9999) - (b.order ?? 9999))
    : result.subjects;

  const ctActive = displaySubjects.some((s) =>
    typeof s.ctEnabled === 'boolean'
      ? s.ctEnabled
      : Boolean(exam?.enableCT) || typeof s.ct === 'number'
  );
  const showCqCol = displaySubjects.some((s) =>
    typeof s.cqEnabled === 'boolean' ? s.cqEnabled : true
  );
  const showMcqCol = displaySubjects.some((s) =>
    typeof s.mcqEnabled === 'boolean' ? s.mcqEnabled : true
  );
  const showPracCol = displaySubjects.some((s) =>
    typeof s.practicalEnabled === 'boolean' ? s.practicalEnabled : true
  );

  const customHeadersMap = new Map<string, string>();
  for (const sub of displaySubjects) {
    for (const ch of sub.customComponents || []) {
      const norm = ch.label.trim().toLowerCase();
      if (norm && !customHeadersMap.has(norm)) {
        customHeadersMap.set(norm, ch.label.trim());
      }
    }
  }
  const customColumns = Array.from(customHeadersMap.entries()).map(([key, label]) => ({
    key,
    label,
  }));

  const getCustomFieldValue = (fieldId: string, defaultValue?: string) => {
    const val = meta.customValues?.[fieldId];
    if (val && val.trim()) return val;
    return defaultValue?.trim() || '—';
  };

  return (
    <div
      className={`a4-page-container w-full max-w-[820px] bg-white text-slate-900 p-6 sm:p-10 shadow-xl rounded-2xl border border-slate-200 relative overflow-hidden ${
        t.fontFamily === 'serif' ? 'font-serif' : 'font-sans'
      }`}
    >
      {/* Background Watermark */}
      {bgUrl && (
        <div
          className="absolute inset-0 pointer-events-none bg-center bg-no-repeat bg-contain"
          style={{
            backgroundImage: `url(${bgUrl})`,
            opacity: t.watermarkOpacity,
          }}
        />
      )}

      {/* Outer Ornamental Frame */}
      <div className={borderFrameClass} style={frameDynamicStyle}>
        {t.borderStyle === 'official-seal' && stationeryMode === 'full-design' && (
          <div
            className="pointer-events-none absolute inset-1.5 border"
            style={{ borderColor: `${t.accentColor}35` }}
          />
        )}

        {/* Institutional Header */}
        {showTopHeader && (
          <div
            className="flex flex-col items-center text-center pb-4 border-b-2 relative"
            style={{ borderColor: `${t.accentColor}55` }}
          >
            {cmsConfig.crestUrl && (
              <img
                src={cmsConfig.crestUrl}
                alt={cmsConfig.schoolName}
                className="h-14 w-auto object-contain mb-1.5"
                referrerPolicy="no-referrer"
              />
            )}
            {t.boardTitle && (
              <span className="text-[10px] font-bold tracking-[0.2em] uppercase text-slate-500 mb-0.5">
                {t.boardTitle}
              </span>
            )}
            <h1
              className="text-xl sm:text-2xl font-extrabold tracking-tight"
              style={{ color: t.accentColor }}
            >
              {cmsConfig.schoolName.toUpperCase()}
            </h1>
            <p className="text-[11px] text-slate-600 font-mono mt-0.5">
              {cmsConfig.address}
              {cmsConfig.eiin ? ` • ${cmsConfig.eiin}` : ''}
              {cmsConfig.boardCode ? ` • ${cmsConfig.boardCode}` : ''}
            </p>
            <div
              className="mt-2.5 px-4 py-1 rounded-md text-[11px] font-bold uppercase tracking-wider text-white inline-flex items-center gap-1.5"
              style={{ backgroundColor: t.accentColor }}
            >
              <Award className="w-3.5 h-3.5" />
              <span>{t.headerSubtitle}</span>
            </div>
            <span className="text-xs font-semibold text-slate-800 mt-1.5">
              {exam?.title || result.examTitle} ({exam?.academicYear || result.academicYear})
            </span>
          </div>
        )}

        {/* Candidate Bio + Optional Grading Scale */}
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3.5 py-4 text-xs relative">
          <div
            className={`${
              t.showGradingScale ? 'sm:col-span-8' : 'sm:col-span-12'
            } bg-slate-50/85 p-3.5 rounded-xl border border-slate-200 flex gap-3.5 items-start`}
          >
            {t.showStudentPhoto && (
              <div className="w-16 h-20 rounded-lg border border-slate-300 bg-white overflow-hidden shrink-0 flex items-center justify-center">
                {student?.avatarUrl ? (
                  <img
                    src={student.avatarUrl}
                    alt={result.studentName}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span className="text-[10px] font-bold text-slate-400 text-center px-1">
                    Photo
                  </span>
                )}
              </div>
            )}

            <div className="grid grid-cols-2 gap-x-4 gap-y-2 flex-1">
              <div className={t.showRollReg ? '' : 'col-span-2'}>
                <span className="text-slate-500 block text-[10px] uppercase tracking-wider">
                  Candidate Name
                </span>
                <span className="font-bold text-sm text-slate-900 block leading-snug">
                  {result.studentName}
                </span>
                {t.showBanglaName && student?.banglaName && (
                  <span className="text-[11px] text-slate-600 block">
                    {student.banglaName}
                  </span>
                )}
              </div>

              {t.showRollReg && (
                <div>
                  <span className="text-slate-500 block text-[10px] uppercase tracking-wider">
                    Class Roll &amp; Reg No.
                  </span>
                  <span
                    className="font-bold font-mono text-sm block"
                    style={{ color: t.accentColor }}
                  >
                    Roll #{result.rollNumber}
                  </span>
                  <span className="text-[10px] font-mono text-slate-600 block">
                    Reg: {result.registrationNumber || '—'}
                  </span>
                </div>
              )}

              {t.showFatherMother && (
                <>
                  <div>
                    <span className="text-slate-500 block text-[10px] uppercase tracking-wider">
                      Father&apos;s Name
                    </span>
                    <span className="font-medium text-slate-800">{result.fatherName || '—'}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10px] uppercase tracking-wider">
                      Mother&apos;s Name
                    </span>
                    <span className="font-medium text-slate-800">{result.motherName || '—'}</span>
                  </div>
                </>
              )}

              {t.showClassSectionGroup && (
                <>
                  <div>
                    <span className="text-slate-500 block text-[10px] uppercase tracking-wider">
                      Class &amp; Section
                    </span>
                    <span className="font-semibold text-slate-900">
                      {result.className} —{' '}
                      {result.sectionName === 'Common' ? 'Single Cohort' : result.sectionName}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10px] uppercase tracking-wider">
                      Group &amp; Shift
                    </span>
                    <span className="font-semibold text-slate-900">
                      {result.group} ({result.shift})
                    </span>
                  </div>
                </>
              )}

              {t.showSystemId && (
                <div>
                  <span className="text-slate-500 block text-[10px] uppercase tracking-wider">
                    Student ID
                  </span>
                  <span className="font-mono font-semibold text-slate-800">
                    {result.systemId}
                  </span>
                </div>
              )}

              {t.showDateOfBirth && (
                <div>
                  <span className="text-slate-500 block text-[10px] uppercase tracking-wider">
                    Date of Birth
                  </span>
                  <span className="font-mono font-semibold text-slate-800">
                    {formatDateDDMMYYYY(student?.dateOfBirth)}
                  </span>
                </div>
              )}

              {gridCustomFields.map((field) => (
                <div key={field.id}>
                  <span className="text-slate-500 block text-[10px] uppercase tracking-wider">
                    {field.label}
                  </span>
                  <span className="font-semibold text-slate-900">
                    {getCustomFieldValue(field.id, field.defaultValue)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {t.showGradingScale && (
            <div className="sm:col-span-4 bg-slate-50/85 p-2.5 rounded-xl border border-slate-200 text-[10px]">
              <span
                className="font-bold text-center block uppercase text-[9px] mb-1.5 tracking-wider"
                style={{ color: t.accentColor }}
              >
                Board Grading Scale
              </span>
              <div className="grid grid-cols-3 gap-0.5 text-center font-mono">
                <span className="font-semibold">80–100</span><span>A+</span><span className="font-bold">5.0</span>
                <span className="font-semibold">70–79</span><span>A</span><span className="font-bold">4.0</span>
                <span className="font-semibold">60–69</span><span>A-</span><span className="font-bold">3.5</span>
                <span className="font-semibold">50–59</span><span>B</span><span className="font-bold">3.0</span>
                <span className="font-semibold">40–49</span><span>C</span><span className="font-bold">2.0</span>
                <span className="font-semibold">33–39</span><span>D</span><span className="font-bold">1.0</span>
                <span className="font-semibold text-red-600">0–32</span>
                <span className="text-red-600 font-bold">F</span>
                <span className="text-red-600 font-bold">0.0</span>
              </div>
            </div>
          )}
        </div>

        {/* Marks Table */}
        <div className="overflow-x-auto my-2 relative">
          <table className="w-full text-left border-collapse text-[11px] border border-slate-300 bg-white/95">
            <thead>
              <tr className="bg-slate-100 text-slate-900 font-bold text-center">
                {t.showSubjectCode && (
                  <th className="py-2 px-2 border border-slate-300 text-left w-16">Code</th>
                )}
                <th className="py-2 px-2 border border-slate-300 text-left">Subject Name</th>
                {t.showFullMarksCol && (
                  <th className="py-2 px-1.5 border border-slate-300">Full</th>
                )}
                {t.showPassMarksCol && (
                  <th className="py-2 px-1.5 border border-slate-300">Pass</th>
                )}
                {ctActive && (
                  <th className="py-2 px-1.5 border border-slate-300 bg-amber-50 text-amber-900">
                    CT
                  </th>
                )}
                {showCqCol && (
                  <th className="py-2 px-1.5 border border-slate-300">CQ</th>
                )}
                {showMcqCol && (
                  <th className="py-2 px-1.5 border border-slate-300">MCQ</th>
                )}
                {showPracCol && (
                  <th className="py-2 px-1.5 border border-slate-300">Prac</th>
                )}
                {customColumns.map((col) => (
                  <th
                    key={col.key}
                    className="py-2 px-1.5 border border-slate-300 bg-indigo-50/70 text-indigo-900"
                  >
                    {col.label}
                  </th>
                ))}
                <th className="py-2 px-1.5 border border-slate-300 font-bold">Total</th>
                {t.showGradePointCol && (
                  <th className="py-2 px-1.5 border border-slate-300">GP</th>
                )}
                <th className="py-2 px-1.5 border border-slate-300 font-bold">Grade</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {displaySubjects.map((sub, idx) => {
                const effectivePass =
                  sub.passMarks ??
                  (sub.fullMarks > 0 ? Math.round(sub.fullMarks * 0.33) : 0);
                const rowCtOn =
                  typeof sub.ctEnabled === 'boolean'
                    ? sub.ctEnabled
                    : ctActive;
                const rowCqOn =
                  typeof sub.cqEnabled === 'boolean' ? sub.cqEnabled : true;
                const rowMcqOn =
                  typeof sub.mcqEnabled === 'boolean'
                    ? sub.mcqEnabled
                    : sub.mcq > 0;
                const rowPracOn =
                  typeof sub.practicalEnabled === 'boolean'
                    ? sub.practicalEnabled
                    : sub.practical > 0;

                return (
                  <tr
                    key={`${sub.subjectCode}-${idx}`}
                    className={`text-center ${sub.isFourthSubject ? 'bg-amber-50/40' : ''}`}
                  >
                    {t.showSubjectCode && (
                      <td className="py-1.5 px-2 text-left font-mono border border-slate-300 text-slate-700">
                        {sub.subjectCode}
                      </td>
                    )}
                    <td className="py-1.5 px-2 text-left border border-slate-300 font-medium">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span>{sub.subjectName}</span>
                        {sub.isFourthSubject && (
                          <span
                            className="px-1.5 py-0.5 rounded font-bold text-[9px]"
                            style={{
                              backgroundColor: `${t.accentColor}15`,
                              color: t.accentColor,
                            }}
                          >
                            4th Sub
                          </span>
                        )}
                      </div>
                      {t.showCombinedPaperDetails &&
                        sub.combinedPapers &&
                        sub.combinedPapers.length > 1 && (
                          <div className="text-[9px] text-slate-500 font-mono mt-0.5">
                            {sub.combinedPapers
                              .map(
                                (p) =>
                                  `${p.subjectCode}: ${p.isAbsent ? 'AB' : p.total}/${p.fullMarks}`
                              )
                              .join(' · ')}
                          </div>
                        )}
                    </td>
                    {t.showFullMarksCol && (
                      <td className="py-1.5 px-1.5 border border-slate-300 font-mono tabular-nums">
                        {sub.fullMarks}
                      </td>
                    )}
                    {t.showPassMarksCol && (
                      <td className="py-1.5 px-1.5 border border-slate-300 font-mono tabular-nums text-slate-600">
                        {effectivePass}
                      </td>
                    )}
                    {ctActive && (
                      <td className="py-1.5 px-1.5 border border-slate-300 font-mono tabular-nums bg-amber-50/50">
                        {!rowCtOn ? (
                          '—'
                        ) : sub.isAbsent ? (
                          <span className="text-red-600 font-bold">AB</span>
                        ) : (
                          sub.ct ?? '—'
                        )}
                      </td>
                    )}
                    {showCqCol && (
                      <td className="py-1.5 px-1.5 border border-slate-300 font-mono tabular-nums">
                        {!rowCqOn ? (
                          '—'
                        ) : sub.isAbsent ? (
                          <span className="text-red-600 font-bold">AB</span>
                        ) : (
                          sub.cq
                        )}
                      </td>
                    )}
                    {showMcqCol && (
                      <td className="py-1.5 px-1.5 border border-slate-300 font-mono tabular-nums">
                        {!rowMcqOn ? (
                          '—'
                        ) : sub.isAbsent ? (
                          <span className="text-red-600 font-bold">AB</span>
                        ) : (
                          sub.mcq
                        )}
                      </td>
                    )}
                    {showPracCol && (
                      <td className="py-1.5 px-1.5 border border-slate-300 font-mono tabular-nums">
                        {!rowPracOn ? (
                          '—'
                        ) : sub.isAbsent ? (
                          <span className="text-red-600 font-bold">AB</span>
                        ) : (
                          sub.practical
                        )}
                      </td>
                    )}
                    {customColumns.map((col) => {
                      const matched = (sub.customComponents || []).find(
                        (c) => c.label.trim().toLowerCase() === col.key
                      );
                      return (
                        <td
                          key={col.key}
                          className="py-1.5 px-1.5 border border-slate-300 font-mono tabular-nums bg-indigo-50/30"
                        >
                          {!matched ? (
                            '—'
                          ) : sub.isAbsent ? (
                            <span className="text-red-600 font-bold">AB</span>
                          ) : (
                            matched.convertedMarks
                          )}
                        </td>
                      );
                    })}
                    <td className="py-1.5 px-1.5 border border-slate-300 font-mono tabular-nums font-bold">
                      {sub.isAbsent ? (
                        <span className="text-red-700 font-bold">AB</span>
                      ) : (
                        sub.total
                      )}
                    </td>
                    {t.showGradePointCol && (
                      <td className="py-1.5 px-1.5 border border-slate-300 font-mono tabular-nums">
                        {sub.isAbsent ? '0.0' : sub.gradePoint.toFixed(1)}
                      </td>
                    )}
                    <td className="py-1.5 px-1.5 border border-slate-300 font-bold">
                      <span
                        className={
                          sub.isAbsent || sub.letterGrade === 'F'
                            ? 'text-red-700 font-bold'
                            : 'text-slate-900'
                        }
                      >
                        {sub.letterGrade}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Summary Strip */}
        <div
          className={`p-3.5 bg-slate-50/90 rounded-xl border border-slate-200 text-xs grid grid-cols-1 ${
            t.showMeritRank ? 'md:grid-cols-3' : 'md:grid-cols-2'
          } gap-3 my-3 relative`}
        >
          <div className="space-y-1">
            <span className="text-[10px] text-slate-500 font-semibold uppercase block">
              Aggregate Performance
            </span>
            <div className="font-mono text-sm font-bold text-slate-900">
              {result.totalMarksObtained} / {result.totalFullMarks} Marks
            </div>
            <div className="text-[11px] text-slate-600 font-mono">
              Score Ratio:{' '}
              {result.totalFullMarks > 0
                ? `${Math.round((result.totalMarksObtained / result.totalFullMarks) * 100)}%`
                : '0%'}
            </div>
          </div>

          <div className="space-y-1 border-y md:border-y-0 md:border-l border-slate-200 md:pl-3 py-2 md:py-0">
            <span className="text-[10px] text-slate-500 font-semibold uppercase block">
              Grade Point Average (GPA)
            </span>
            <div className="flex items-center gap-2">
              <span
                className="text-xl font-extrabold font-mono"
                style={{ color: t.accentColor }}
              >
                {result.finalGPA.toFixed(2)}
              </span>
              <span
                className={`px-2 py-0.5 rounded text-xs font-bold ${
                  result.isPassed
                    ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                    : 'bg-red-100 text-red-900 border border-red-300'
                }`}
              >
                Grade: {result.finalLetterGrade}
              </span>
            </div>
            {t.showCoreGpaAndBonus && (
              <div className="text-[10px] font-mono text-slate-600">
                Core GPA: <strong>{result.gpaWithoutFourth.toFixed(2)}</strong> &bull; 4th
                Bonus: <strong>+{result.fourthSubjectBonus.toFixed(2)}</strong>
              </div>
            )}
          </div>

          {t.showMeritRank && (
            <div className="space-y-1 border-t md:border-t-0 md:border-l border-slate-200 md:pl-3 pt-2 md:pt-0">
              <span className="text-[10px] text-slate-500 font-semibold uppercase block">
                Merit Standing &amp; Outcome
              </span>
              <div className="flex flex-wrap items-center gap-1.5">
                <span
                  className="px-2 py-0.5 rounded font-bold font-mono text-[11px]"
                  style={{
                    backgroundColor: `${t.accentColor}15`,
                    color: t.accentColor,
                  }}
                >
                  Class Rank: #{result.classRank || 1}
                </span>
                <span className="px-2 py-0.5 rounded bg-slate-200/70 text-slate-700 font-bold font-mono text-[11px]">
                  Sec Rank: #{result.sectionRank || 1}
                </span>
              </div>
              <div className="pt-0.5">
                {result.isPassed ? (
                  <span className="text-emerald-800 font-bold text-[11px] uppercase tracking-wider inline-flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    {promotionText}
                  </span>
                ) : (
                  <span className="text-red-700 font-bold text-[11px] uppercase tracking-wider inline-flex items-center gap-1">
                    <XCircle className="w-3.5 h-3.5" />
                    {promotionText}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Attendance, Conduct, Remarks & Footer Custom Fields */}
        {(t.showAttendanceConduct || footerCustomFields.length > 0) && (
          <div className="p-3 bg-slate-50/75 rounded-xl border border-slate-200 text-xs space-y-2 my-3 relative">
            {t.showAttendanceConduct && (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono text-slate-600 border-b border-slate-200 pb-1.5">
                  <span>
                    Working Days:{' '}
                    <strong className="text-slate-900">
                      {workingDays !== undefined ? workingDays : '—'}
                    </strong>{' '}
                    &bull; Days Present:{' '}
                    <strong className="text-slate-900">
                      {daysPresent !== undefined ? daysPresent : '—'}
                      {attendancePct ? ` (${attendancePct})` : ''}
                    </strong>
                  </span>
                  <span>
                    Behavior &amp; Conduct:{' '}
                    <strong className="text-emerald-800 font-bold">
                      {conductValue || '—'}
                    </strong>
                  </span>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider block">
                    Class Teacher&apos;s Remark:
                  </span>
                  <p className="text-[11px] text-slate-800 italic mt-0.5">
                    {teacherRemark}
                  </p>
                </div>
              </>
            )}

            {footerCustomFields.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1.5 border-t border-slate-200/80">
                {footerCustomFields.map((field) => (
                  <div key={field.id} className="text-[11px]">
                    <span className="font-semibold text-slate-500">
                      {field.label}:{' '}
                    </span>
                    <span className="font-bold text-slate-900">
                      {getCustomFieldValue(field.id, field.defaultValue)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* QR Code & Signatories */}
        <div className="flex flex-wrap items-end justify-between gap-4 pt-6 text-xs relative">
          {t.showQrVerification && (
            <div className="flex items-center gap-2.5">
              {qrCodeDataUrl ? (
                <img
                  src={qrCodeDataUrl}
                  alt="Verification QR"
                  className="w-16 h-16 border border-slate-200 p-0.5 bg-white shadow-xs"
                />
              ) : (
                <div className="w-16 h-16 border border-slate-200 bg-slate-50 flex items-center justify-center text-slate-400">
                  <QrCode className="w-6 h-6" />
                </div>
              )}
              <div className="text-[9px] font-mono text-slate-500 max-w-[140px]">
                <span className="font-bold block text-slate-800">
                  Digital Verification
                </span>
                <span>Scan QR code to verify official academic record.</span>
              </div>
            </div>
          )}

          <div className="flex flex-1 justify-around items-end pl-2 gap-4">
            {signatories.map((sig) => (
              <div key={sig.id} className="text-center min-w-[100px]">
                <div className="w-28 mx-auto border-b border-slate-900 mb-1 h-9 flex items-end justify-center">
                  {sig.signatureImgUrl ? (
                    <img
                      src={sig.signatureImgUrl}
                      alt={sig.name}
                      referrerPolicy="no-referrer"
                      className="max-h-8 w-auto object-contain mb-0.5"
                    />
                  ) : (
                    <span className="font-serif italic text-[11px] text-slate-700 pb-0.5">
                      {sig.name}
                    </span>
                  )}
                </div>
                <span className="font-bold text-[10px] block text-slate-900">
                  {sig.title}
                </span>
                {sig.signatureImgUrl && (
                  <span className="text-[9px] text-slate-500 block">
                    {sig.name}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
