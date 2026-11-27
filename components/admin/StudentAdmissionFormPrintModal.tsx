'use client';

import { useState } from 'react';
import {
  CMSConfig,
  InstituteRules,
  StructuredAddress,
  Student,
  Subject,
} from '@/lib/types';
import {
  formatDateDDMMYYYY,
  formatGroupSectionDisplay,
  getAutoRoutedSubjectsForStudent,
  resolveDefaultBatchCycle,
} from '@/lib/academic-helpers';
import { formatStructuredAddress } from '@/lib/student-schema';
import { Printer, X } from 'lucide-react';

interface StudentAdmissionFormPrintModalProps {
  student: Student;
  cmsConfig: CMSConfig;
  instituteRules: InstituteRules;
  subjects: Subject[];
  onClose: () => void;
}

function renderAddressSummary(
  detail: StructuredAddress | undefined,
  fallbackText: string | undefined
): string {
  const formatted = formatStructuredAddress(detail);
  return formatted || fallbackText?.trim() || '—';
}

export default function StudentAdmissionFormPrintModal({
  student,
  cmsConfig,
  instituteRules,
  subjects,
  onClose,
}: StudentAdmissionFormPrintModalProps) {
  const [includePinBox, setIncludePinBox] = useState(Boolean(student.systemPin));

  const sessionLabel =
    student.batchCycle ||
    resolveDefaultBatchCycle(student.className, instituteRules);

  const compulsorySubjects = getAutoRoutedSubjectsForStudent(subjects, {
    className: student.className,
    group: student.group || 'General',
    religionGroup: student.religionGroup,
    gender: student.gender,
  });

  const electiveSubjects = (student.electiveSubjectIds || [])
    .map((id) => subjects.find((s) => s.id === id))
    .filter((s): s is Subject => Boolean(s));

  const fourthSubject = subjects.find((s) => s.id === student.optionalFourthSubjectId);

  const presentAddrText = renderAddressSummary(
    student.presentAddressDetail,
    student.presentAddress || student.address
  );
  const permanentAddrText = student.sameAsPresentAddress
    ? `Same as Present Address (${presentAddrText})`
    : renderAddressSummary(student.permanentAddressDetail, student.permanentAddress);

  const schoolMonogram = (cmsConfig.schoolName || 'IN')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() || '')
    .join('');

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs overflow-y-auto p-3 sm:p-6 print:static print:inset-auto print:bg-white print:p-0 print:overflow-visible">
      {/* Screen-only Action Toolbar */}
      <div className="max-w-[210mm] mx-auto mb-3 bg-white rounded-2xl border border-outline-variant/30 px-4 py-3 flex flex-wrap items-center justify-between gap-3 shadow-lg no-print">
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-on-surface truncate">
            Student Admission &amp; Information Form — {student.fullName}
          </h3>
          <p className="text-[11px] text-on-surface-variant font-mono tabular-nums">
            ID: {student.systemId} &bull; Roll #{student.rollNumber} &bull; {student.className}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {student.systemPin && (
            <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-on-surface cursor-pointer select-none">
              <input
                type="checkbox"
                checked={includePinBox}
                onChange={(e) => setIncludePinBox(e.target.checked)}
                className="w-3.5 h-3.5 rounded"
              />
              <span>Include Portal 6-Digit PIN</span>
            </label>
          )}
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary-container hover:bg-primary text-on-primary text-xs font-bold shadow-sm cursor-pointer whitespace-nowrap"
          >
            <Printer className="w-4 h-4" />
            <span>Print / Save as PDF</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-1 px-3 py-2 rounded-xl bg-surface-container-low hover:bg-surface-container text-xs font-semibold text-on-surface cursor-pointer"
          >
            <X className="w-4 h-4" />
            <span>Close</span>
          </button>
        </div>
      </div>

      {/* Printable A4 Sheet */}
      <div className="a4-page-container mx-auto w-full max-w-[210mm] bg-white text-slate-900 shadow-2xl border border-slate-200 print:border-none print:shadow-none px-7 py-6 text-[11px] leading-snug">
        {/* Institutional Letterhead + 35:45 Portrait */}
        <div className="flex items-start justify-between gap-4 pb-3.5 border-b-2 border-slate-800">
          <div className="flex items-start gap-3.5 min-w-0 flex-1">
            {cmsConfig.crestUrl ? (
              <img
                src={cmsConfig.crestUrl}
                alt={cmsConfig.schoolName}
                referrerPolicy="no-referrer"
                className="w-16 h-16 object-contain shrink-0"
              />
            ) : (
              <div className="w-16 h-16 rounded-lg border-2 border-slate-800 bg-slate-50 flex items-center justify-center font-bold text-lg text-slate-800 shrink-0">
                {schoolMonogram || 'ERP'}
              </div>
            )}
            <div className="min-w-0">
              <h1 className="text-lg font-extrabold tracking-tight text-slate-950 uppercase leading-tight">
                {cmsConfig.schoolName || 'Institutional Academy'}
              </h1>
              {cmsConfig.motto && (
                <p className="text-[10px] italic text-slate-600 font-medium mt-0.5">
                  &ldquo;{cmsConfig.motto}&rdquo;
                </p>
              )}
              <p className="text-[10px] text-slate-700 mt-1">
                {cmsConfig.address}
              </p>
              <p className="text-[10px] text-slate-700 font-mono tabular-nums mt-0.5">
                {[
                  cmsConfig.eiin,
                  cmsConfig.boardCode,
                  cmsConfig.phone ? `Tel: ${cmsConfig.phone}` : '',
                  cmsConfig.email,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            </div>
          </div>

          {/* 35:45 Passport Size Photo Box */}
          <div className="w-[92px] h-[118px] border border-slate-400 bg-slate-50 flex flex-col items-center justify-center overflow-hidden shrink-0">
            {student.avatarUrl ? (
              <img
                src={student.avatarUrl}
                alt={student.fullName}
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="text-center px-2 text-[9px] text-slate-500 font-medium">
                Passport Photo
                <span className="block text-[8px] text-slate-400 mt-0.5">(35 &times; 45 mm)</span>
              </div>
            )}
          </div>
        </div>

        {/* Form Banner & Quick Identity Strip */}
        <div className="mt-3 mb-3.5 flex flex-wrap items-center justify-between gap-2 bg-slate-900 text-white px-4 py-2 rounded-sm">
          <div className="text-xs font-extrabold uppercase tracking-wider">
            Student Admission &amp; Information Form
          </div>
          <div className="flex items-center gap-4 text-[10px] font-mono tabular-nums">
            <span>
              Student ID: <strong>{student.systemId}</strong>
            </span>
            <span>
              Roll No: <strong>{student.rollNumber}</strong>
            </span>
            <span>
              Session/Year: <strong>{sessionLabel}</strong>
            </span>
          </div>
        </div>

        {/* Section 1: Academic Information */}
        <div className="mb-3">
          <h2 className="text-[11px] font-bold uppercase tracking-wide text-slate-900 bg-slate-100 border border-slate-300 px-2.5 py-1">
            1. Academic Information
          </h2>
          <table className="w-full border-collapse border border-slate-300 border-t-0">
            <tbody>
              <tr>
                <td className="border border-slate-300 px-2.5 py-1.5 font-semibold text-slate-700 w-[18%] bg-slate-50/70">
                  Student ID
                </td>
                <td className="border border-slate-300 px-2.5 py-1.5 font-mono font-bold tabular-nums w-[32%]">
                  {student.systemId}
                </td>
                <td className="border border-slate-300 px-2.5 py-1.5 font-semibold text-slate-700 w-[18%] bg-slate-50/70">
                  Class Roll No.
                </td>
                <td className="border border-slate-300 px-2.5 py-1.5 font-mono font-bold tabular-nums w-[32%]">
                  {student.rollNumber}
                </td>
              </tr>
              <tr>
                <td className="border border-slate-300 px-2.5 py-1.5 font-semibold text-slate-700 bg-slate-50/70">
                  Class
                </td>
                <td className="border border-slate-300 px-2.5 py-1.5 font-semibold">
                  {student.className}
                </td>
                <td className="border border-slate-300 px-2.5 py-1.5 font-semibold text-slate-700 bg-slate-50/70">
                  Session / Year
                </td>
                <td className="border border-slate-300 px-2.5 py-1.5 font-mono tabular-nums">
                  {sessionLabel}
                </td>
              </tr>
              <tr>
                <td className="border border-slate-300 px-2.5 py-1.5 font-semibold text-slate-700 bg-slate-50/70">
                  Group
                </td>
                <td className="border border-slate-300 px-2.5 py-1.5">
                  {student.group || 'General'}
                </td>
                <td className="border border-slate-300 px-2.5 py-1.5 font-semibold text-slate-700 bg-slate-50/70">
                  Section &amp; Shift
                </td>
                <td className="border border-slate-300 px-2.5 py-1.5">
                  {student.sectionName === 'Common' ? 'Combined' : `Section ${student.sectionName}`}{' '}
                  · {student.shift} Shift
                </td>
              </tr>
              <tr>
                <td className="border border-slate-300 px-2.5 py-1.5 font-semibold text-slate-700 bg-slate-50/70">
                  Board Reg. No.
                </td>
                <td className="border border-slate-300 px-2.5 py-1.5 font-mono tabular-nums">
                  {student.registrationNumber || '—'}
                </td>
                <td className="border border-slate-300 px-2.5 py-1.5 font-semibold text-slate-700 bg-slate-50/70">
                  Status
                </td>
                <td className="border border-slate-300 px-2.5 py-1.5 font-semibold">
                  {student.status} ({formatGroupSectionDisplay(student.group, student.sectionName)})
                </td>
              </tr>
              {(compulsorySubjects.length > 0 || electiveSubjects.length > 0 || fourthSubject) && (
                <tr>
                  <td className="border border-slate-300 px-2.5 py-1.5 font-semibold text-slate-700 bg-slate-50/70 align-top">
                    Enrolled Subjects
                  </td>
                  <td colSpan={3} className="border border-slate-300 px-2.5 py-1.5 text-[10px]">
                    {compulsorySubjects.length > 0 && (
                      <div>
                        <span className="font-semibold">Compulsory:</span>{' '}
                        {compulsorySubjects.map((s) => `${s.name} (${s.code})`).join(', ')}
                      </div>
                    )}
                    {electiveSubjects.length > 0 && (
                      <div className="mt-0.5">
                        <span className="font-semibold">Group Electives:</span>{' '}
                        {electiveSubjects.map((s) => `${s.name} (${s.code})`).join(', ')}
                      </div>
                    )}
                    {fourthSubject && (
                      <div className="mt-0.5">
                        <span className="font-semibold">Optional (4th Subject):</span>{' '}
                        {fourthSubject.name} ({fourthSubject.code})
                      </div>
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Section 2: Personal Information */}
        <div className="mb-3">
          <h2 className="text-[11px] font-bold uppercase tracking-wide text-slate-900 bg-slate-100 border border-slate-300 px-2.5 py-1">
            2. Student Personal Information
          </h2>
          <table className="w-full border-collapse border border-slate-300 border-t-0">
            <tbody>
              <tr>
                <td className="border border-slate-300 px-2.5 py-1.5 font-semibold text-slate-700 w-[18%] bg-slate-50/70">
                  Name (English)
                </td>
                <td className="border border-slate-300 px-2.5 py-1.5 font-bold w-[32%]">
                  {student.fullName}
                </td>
                <td className="border border-slate-300 px-2.5 py-1.5 font-semibold text-slate-700 w-[18%] bg-slate-50/70">
                  Name (Bangla)
                </td>
                <td className="border border-slate-300 px-2.5 py-1.5 w-[32%]">
                  {student.banglaName || '—'}
                </td>
              </tr>
              <tr>
                <td className="border border-slate-300 px-2.5 py-1.5 font-semibold text-slate-700 bg-slate-50/70">
                  Date of Birth
                </td>
                <td className="border border-slate-300 px-2.5 py-1.5 font-mono tabular-nums">
                  {formatDateDDMMYYYY(student.dateOfBirth)}
                </td>
                <td className="border border-slate-300 px-2.5 py-1.5 font-semibold text-slate-700 bg-slate-50/70">
                  Birth Reg. No.
                </td>
                <td className="border border-slate-300 px-2.5 py-1.5 font-mono tabular-nums">
                  {student.birthRegOrNid || '—'}
                </td>
              </tr>
              <tr>
                <td className="border border-slate-300 px-2.5 py-1.5 font-semibold text-slate-700 bg-slate-50/70">
                  Gender &amp; Religion
                </td>
                <td className="border border-slate-300 px-2.5 py-1.5">
                  {student.gender || 'Male'} · {student.religionGroup}
                </td>
                <td className="border border-slate-300 px-2.5 py-1.5 font-semibold text-slate-700 bg-slate-50/70">
                  Blood Group
                </td>
                <td className="border border-slate-300 px-2.5 py-1.5 font-semibold">
                  {student.bloodGroup || '—'}
                </td>
              </tr>
              <tr>
                <td className="border border-slate-300 px-2.5 py-1.5 font-semibold text-slate-700 bg-slate-50/70">
                  Primary Mobile
                </td>
                <td colSpan={3} className="border border-slate-300 px-2.5 py-1.5 font-mono font-semibold tabular-nums">
                  {student.phone || '—'}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Section 3: Parents & Local Guardian Information */}
        <div className="mb-3">
          <h2 className="text-[11px] font-bold uppercase tracking-wide text-slate-900 bg-slate-100 border border-slate-300 px-2.5 py-1">
            3. Parents &amp; Guardian Information
          </h2>
          <table className="w-full border-collapse border border-slate-300 border-t-0">
            <tbody>
              <tr>
                <td className="border border-slate-300 px-2.5 py-1.5 font-semibold text-slate-700 w-[18%] bg-slate-50/70">
                  Father&apos;s Name
                </td>
                <td className="border border-slate-300 px-2.5 py-1.5 font-semibold w-[32%]">
                  {student.fatherName || '—'}
                  {student.fatherBanglaName ? ` (${student.fatherBanglaName})` : ''}
                </td>
                <td className="border border-slate-300 px-2.5 py-1.5 font-semibold text-slate-700 w-[18%] bg-slate-50/70">
                  Mother&apos;s Name
                </td>
                <td className="border border-slate-300 px-2.5 py-1.5 font-semibold w-[32%]">
                  {student.motherName || '—'}
                  {student.motherBanglaName ? ` (${student.motherBanglaName})` : ''}
                </td>
              </tr>
              <tr>
                <td className="border border-slate-300 px-2.5 py-1.5 font-semibold text-slate-700 bg-slate-50/70">
                  Father&apos;s Mobile
                </td>
                <td className="border border-slate-300 px-2.5 py-1.5 font-mono tabular-nums">
                  {student.fatherPhone || '—'}
                </td>
                <td className="border border-slate-300 px-2.5 py-1.5 font-semibold text-slate-700 bg-slate-50/70">
                  Mother&apos;s Mobile
                </td>
                <td className="border border-slate-300 px-2.5 py-1.5 font-mono tabular-nums">
                  {student.motherPhone || '—'}
                </td>
              </tr>
              <tr>
                <td className="border border-slate-300 px-2.5 py-1.5 font-semibold text-slate-700 bg-slate-50/70">
                  Father&apos;s NID / Job
                </td>
                <td className="border border-slate-300 px-2.5 py-1.5">
                  {[
                    student.fatherNid ? `NID: ${student.fatherNid}` : '',
                    student.fatherOccupation,
                  ]
                    .filter(Boolean)
                    .join(' · ') || '—'}
                </td>
                <td className="border border-slate-300 px-2.5 py-1.5 font-semibold text-slate-700 bg-slate-50/70">
                  Mother&apos;s NID / Job
                </td>
                <td className="border border-slate-300 px-2.5 py-1.5">
                  {[
                    student.motherNid ? `NID: ${student.motherNid}` : '',
                    student.motherOccupation,
                  ]
                    .filter(Boolean)
                    .join(' · ') || '—'}
                </td>
              </tr>
              {student.guardianName && (
                <tr>
                  <td className="border border-slate-300 px-2.5 py-1.5 font-semibold text-slate-700 bg-slate-50/70">
                    Local Guardian
                  </td>
                  <td colSpan={3} className="border border-slate-300 px-2.5 py-1.5">
                    {student.guardianName}
                    {student.guardianRelation ? ` (${student.guardianRelation})` : ''}
                    {student.guardianPhone ? ` · Mobile: ${student.guardianPhone}` : ''}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Section 4: Present & Permanent Address */}
        <div className="mb-3">
          <h2 className="text-[11px] font-bold uppercase tracking-wide text-slate-900 bg-slate-100 border border-slate-300 px-2.5 py-1">
            4. Address Details
          </h2>
          <table className="w-full border-collapse border border-slate-300 border-t-0">
            <tbody>
              <tr>
                <td className="border border-slate-300 px-2.5 py-1.5 font-semibold text-slate-700 w-[18%] bg-slate-50/70">
                  Present Address
                </td>
                <td className="border border-slate-300 px-2.5 py-1.5">
                  {presentAddrText}
                </td>
              </tr>
              <tr>
                <td className="border border-slate-300 px-2.5 py-1.5 font-semibold text-slate-700 bg-slate-50/70">
                  Permanent Address
                </td>
                <td className="border border-slate-300 px-2.5 py-1.5">
                  {permanentAddrText}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Optional Portal Access Box */}
        {includePinBox && student.systemPin && (
          <div className="mb-3.5 px-3 py-2 border border-dashed border-slate-500 bg-slate-50 flex flex-wrap items-center justify-between gap-2 text-[10px]">
            <span className="font-bold uppercase tracking-wide text-slate-800">
              Student Portal Credentials (Keep Confidential)
            </span>
            <span className="font-mono tabular-nums text-slate-900">
              Student ID: <strong>{student.systemId}</strong> &nbsp;|&nbsp; 6-Digit PIN:{' '}
              <strong className="tracking-widest">{student.systemPin}</strong>
            </span>
          </div>
        )}

        {/* Declaration & Signature Block */}
        <div className="mt-4 pt-2 border-t border-slate-300">
          <p className="text-[10px] text-slate-600 italic">
            Declaration: I hereby affirm that the academic, personal, and guardian particulars recorded in this form are true and accurate to the best of my knowledge, and the student agrees to abide by the institutional rules and code of conduct.
          </p>

          <div className="grid grid-cols-3 gap-6 mt-10 pt-2 text-center text-[10px]">
            <div>
              <div className="border-t border-slate-500 pt-1 font-semibold text-slate-800">
                Student&apos;s Signature &amp; Date
              </div>
            </div>
            <div>
              <div className="border-t border-slate-500 pt-1 font-semibold text-slate-800">
                Parent / Guardian Signature
              </div>
            </div>
            <div>
              <div className="border-t border-slate-500 pt-1 font-semibold text-slate-800">
                {cmsConfig.principalName || 'Head of Institution'}
                <span className="block text-[9px] font-normal text-slate-600">
                  {cmsConfig.principalDesignation || 'Principal'} &amp; Official Seal
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
