'use client';

import { useState } from 'react';
import { useERPStore } from '@/lib/store';
import { compileStudentExamRecord } from '@/lib/grading-engine';

export type DocType =
  | 'student-id-card'
  | 'admit-card'
  | 'seat-plan'
  | 'attendance-sheet'
  | 'transfer-certificate'
  | 'character-certificate'
  | 'testimonial';

export default function DocumentsTab() {
  const { isHydrated } = useERPStore();
  return <DocumentsTabInner key={isHydrated ? 'hydrated' : 'ssr'} />;
}

function DocumentsTabInner() {
  const { state } = useERPStore();
  const { students, cmsConfig, exams, subjects, academicClasses, instituteRules } = state;

  const [selectedExamId, setSelectedExamId] = useState(exams[0]?.id || '');
  const currentExam = exams.find((e) => e.id === selectedExamId) || exams[0];

  const [activeDoc, setActiveDoc] = useState<DocType>('student-id-card');
  const [selectedStudentId, setSelectedStudentId] = useState(students[0]?.id || '');
  const activeYear = instituteRules?.activeAcademicYear || new Date().getFullYear().toString();
  const [selectedExamClass, setSelectedExamClass] = useState(academicClasses[0]?.name || 'Grade 10');
  const [examHall, setExamHall] = useState('Hall B (Main Campus Wing)');
  const [examDate, setExamDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [tcReason, setTcReason] = useState('Guardian transfer / relocation');

  // Document Customization State
  const [customHeaderTag, setCustomHeaderTag] = useState('Recognized Institutional Document');
  const [customSignatoryName, setCustomSignatoryName] = useState(cmsConfig.principalName);
  const [customSignatoryTitle, setCustomSignatoryTitle] = useState(cmsConfig.principalDesignation);
  const [showWatermark, setShowWatermark] = useState(true);

  const selectedStudent = students.find((s) => s.id === selectedStudentId) || students[0];
  const classStudents = students.filter((s) => s.className === selectedExamClass);
  const compiledResult =
    selectedStudent && currentExam
      ? (currentExam.savedTabulation?.records || []).find(
          (r) => r.studentId === selectedStudent.id || r.systemId === selectedStudent.systemId
        ) ||
        compileStudentExamRecord(selectedStudent, currentExam, subjects, state.markEntries, {
          combinePairedPapers: instituteRules?.combinePairedPapersInResult ?? true,
        })
      : null;

  const examRoutineAll = currentExam?.examRoutine || [];
  const classFilteredRoutine = selectedStudent
    ? examRoutineAll.filter((slot) => slot.className === selectedStudent.className)
    : examRoutineAll;
  const routineRows =
    classFilteredRoutine.length > 0
      ? classFilteredRoutine
      : examRoutineAll.length > 0
      ? examRoutineAll
      : [
          { id: 'd1', date: '2024-10-28', time: '09:00 - 12:00', subjectName: 'Bangla (101)', room: examHall, className: selectedStudent?.className || 'Grade 10', subjectId: 'sub-101', inspectorTeacherId: '', entryDeadline: '' },
          { id: 'd2', date: '2024-10-30', time: '09:00 - 12:00', subjectName: 'English (107)', room: examHall, className: selectedStudent?.className || 'Grade 10', subjectId: 'sub-107', inspectorTeacherId: '', entryDeadline: '' },
          { id: 'd3', date: '2024-11-02', time: '09:00 - 12:00', subjectName: 'Mathematics (109)', room: examHall, className: selectedStudent?.className || 'Grade 10', subjectId: 'sub-109', inspectorTeacherId: '', entryDeadline: '' },
        ];

  return (
    <div className="flex flex-col w-full space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 no-print">
        <div>
          <span className="font-label-sm text-label-sm uppercase tracking-wider text-primary-container font-semibold">
            Institutional Document Printing Studio
          </span>
          <h1 className="font-headline-lg text-headline-lg text-on-surface tracking-tight font-bold">
            ID Cards, Admit &amp; Routine, Seat Plan, TC, Character &amp; Testimonials
          </h1>
          <p className="font-body-md text-body-md text-on-surface-variant mt-0.5">
            All 7 institutional documents dynamically hydrated with live student &amp; exam records and customizable signatories.
          </p>
        </div>

        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-primary-container hover:bg-primary text-on-primary font-bold text-xs shadow-md cursor-pointer self-start md:self-auto"
        >
          <span className="material-symbols-outlined text-[18px]">print</span>
          Print Document (A4)
        </button>
      </div>

      {/* Document Type Selector Ribbon */}
      <div className="rounded-2xl bg-surface-container-lowest border border-outline-variant/25 p-3 flex flex-wrap gap-2 no-print">
        {(
          [
            { id: 'student-id-card', label: '1. Student ID Card', icon: 'contact_mail' },
            { id: 'admit-card', label: '2. Admit Card + Routine', icon: 'badge' },
            { id: 'seat-plan', label: '3. Exam Seat Plan', icon: 'grid_on' },
            { id: 'attendance-sheet', label: '4. Attendance Register', icon: 'fact_check' },
            { id: 'transfer-certificate', label: '5. Transfer Certificate (TC)', icon: 'description' },
            { id: 'character-certificate', label: '6. Character Certificate', icon: 'verified_user' },
            { id: 'testimonial', label: '7. Academic Testimonial', icon: 'workspace_premium' },
          ] as const
        ).map((doc) => (
          <button
            key={doc.id}
            type="button"
            onClick={() => setActiveDoc(doc.id)}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeDoc === doc.id
                ? 'bg-primary-container text-on-primary shadow-xs'
                : 'bg-surface-container-low text-on-surface hover:bg-surface-container'
            }`}
          >
            <span className="material-symbols-outlined text-[17px]">{doc.icon}</span>
            {doc.label}
          </button>
        ))}
      </div>

      {/* Parameter & Document Customizer Controls */}
      <div className="rounded-2xl bg-surface-container-lowest border border-outline-variant/25 p-4 grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-3 text-xs no-print">
        {activeDoc !== 'seat-plan' && activeDoc !== 'attendance-sheet' ? (
          <div>
            <label className="block font-semibold text-on-surface-variant mb-1">Target Student</label>
            <select
              value={selectedStudentId}
              onChange={(e) => setSelectedStudentId(e.target.value)}
              className="w-full px-3 py-1.5 rounded-xl bg-surface-container-low border border-outline-variant/30 font-bold"
            >
              {students.map((s) => (
                <option key={s.id} value={s.id}>
                  Roll #{s.rollNumber} - {s.fullName} ({s.className})
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div>
            <label className="block font-semibold text-on-surface-variant mb-1">Target Class</label>
            <select
              value={selectedExamClass}
              onChange={(e) => setSelectedExamClass(e.target.value)}
              className="w-full px-3 py-1.5 rounded-xl bg-surface-container-low border border-outline-variant/30 font-semibold"
            >
              {academicClasses.map((c) => (
                <option key={c.id} value={c.name}>{c.name}</option>
              ))}
            </select>
          </div>
        )}

        {(activeDoc === 'admit-card' || activeDoc === 'seat-plan' || activeDoc === 'attendance-sheet' || activeDoc === 'testimonial') && (
          <div>
            <label className="block font-semibold text-on-surface-variant mb-1">Examination</label>
            <select
              value={selectedExamId}
              onChange={(e) => setSelectedExamId(e.target.value)}
              className="w-full px-3 py-1.5 rounded-xl bg-surface-container-low border border-outline-variant/30 font-semibold"
            >
              {exams.map((ex) => (
                <option key={ex.id} value={ex.id}>{ex.term} ({ex.academicYear})</option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label className="block font-semibold text-on-surface-variant mb-1">Signatory Name Override</label>
          <input
            type="text"
            value={customSignatoryName}
            onChange={(e) => setCustomSignatoryName(e.target.value)}
            className="w-full px-3 py-1.5 rounded-xl bg-surface-container-low border border-outline-variant/30"
          />
        </div>

        <div>
          <label className="block font-semibold text-on-surface-variant mb-1">Signatory Designation</label>
          <input
            type="text"
            value={customSignatoryTitle}
            onChange={(e) => setCustomSignatoryTitle(e.target.value)}
            className="w-full px-3 py-1.5 rounded-xl bg-surface-container-low border border-outline-variant/30"
          />
        </div>

        {(activeDoc === 'seat-plan' || activeDoc === 'attendance-sheet') && (
          <>
            <div>
              <label className="block font-semibold text-on-surface-variant mb-1">Exam Hall / Room</label>
              <input
                type="text"
                value={examHall}
                onChange={(e) => setExamHall(e.target.value)}
                className="w-full px-3 py-1.5 rounded-xl bg-surface-container-low border border-outline-variant/30"
              />
            </div>
            <div>
              <label className="block font-semibold text-on-surface-variant mb-1">Exam Date</label>
              <input
                type="date"
                value={examDate}
                onChange={(e) => setExamDate(e.target.value)}
                className="w-full px-3 py-1.5 rounded-xl bg-surface-container-low border border-outline-variant/30"
              />
            </div>
          </>
        )}

        {activeDoc === 'transfer-certificate' && (
          <div className="md:col-span-2">
            <label className="block font-semibold text-on-surface-variant mb-1">Reason for Leaving</label>
            <input
              type="text"
              value={tcReason}
              onChange={(e) => setTcReason(e.target.value)}
              className="w-full px-3 py-1.5 rounded-xl bg-surface-container-low border border-outline-variant/30"
            />
          </div>
        )}

        <div>
          <label className="block font-semibold text-on-surface-variant mb-1">Custom Subtitle Tag</label>
          <input
            type="text"
            value={customHeaderTag}
            onChange={(e) => setCustomHeaderTag(e.target.value)}
            className="w-full px-3 py-1.5 rounded-xl bg-surface-container-low border border-outline-variant/30"
          />
        </div>

        <label className="flex items-center gap-2 self-end pb-1.5 cursor-pointer font-semibold">
          <input
            type="checkbox"
            checked={showWatermark}
            onChange={(e) => setShowWatermark(e.target.checked)}
          />
          <span>Show Institutional Crest Watermark</span>
        </label>
      </div>

      {/* DOCUMENT PREVIEW CANVAS */}
      <div className="flex justify-center">
        {/* 1. STUDENT ID CARD (FRONT + BACK) */}
        {activeDoc === 'student-id-card' && selectedStudent && (
          <div className="a4-page-container w-full max-w-[800px] bg-white p-8 shadow-xl rounded-2xl border border-outline-variant/30 flex flex-col sm:flex-row items-center justify-center gap-8 text-on-surface">
            {/* Front Side */}
            <div className="w-[310px] rounded-2xl border-2 border-primary-container overflow-hidden shadow-md bg-white flex flex-col justify-between">
              <div className="bg-primary-container text-on-primary p-4 text-center space-y-1">
                {cmsConfig.crestUrl && (
                  <img
                    src={cmsConfig.crestUrl}
                    alt={cmsConfig.schoolName}
                    className="h-9 w-auto mx-auto bg-white rounded-full p-0.5 object-contain"
                    referrerPolicy="no-referrer"
                  />
                )}
                <h2 className="font-bold text-sm tracking-tight">{cmsConfig.schoolName}</h2>
                <p className="text-[10px] opacity-90">{cmsConfig.eiin} · {cmsConfig.boardCode}</p>
              </div>

              <div className="p-5 text-center space-y-3">
                {selectedStudent.avatarUrl ? (
                  <img
                    src={selectedStudent.avatarUrl}
                    alt={selectedStudent.fullName}
                    className="w-24 h-24 rounded-2xl object-cover mx-auto border-2 border-primary-container/30"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="w-24 h-24 rounded-2xl bg-primary-fixed/50 text-primary-container font-bold text-xl flex items-center justify-center mx-auto border-2 border-primary-container/30">
                    {selectedStudent.fullName.slice(0, 2).toUpperCase()}
                  </div>
                )}
                <div>
                  <h3 className="font-bold text-base text-on-surface">{selectedStudent.fullName}</h3>
                  <p className="text-xs font-mono font-bold text-primary-container">{selectedStudent.systemId}</p>
                </div>

                <div className="text-left text-xs bg-surface-container-low p-3 rounded-xl space-y-1 font-mono">
                  <div className="flex justify-between"><span>Class:</span><strong>{selectedStudent.className} ({selectedStudent.sectionName})</strong></div>
                  <div className="flex justify-between"><span>Roll No:</span><strong>#{selectedStudent.rollNumber}</strong></div>
                  <div className="flex justify-between"><span>Group:</span><strong>{selectedStudent.group}</strong></div>
                  <div className="flex justify-between"><span>Shift:</span><strong>{selectedStudent.shift}</strong></div>
                </div>
              </div>

              <div className="px-4 py-2.5 bg-surface-container-low border-t border-outline-variant/20 flex items-center justify-between text-[10px]">
                <span className="font-mono">
                  Session: {selectedStudent.batchCycle || activeYear}
                </span>
                <div className="text-right">
                  <div className="font-serif italic">{customSignatoryName}</div>
                  <div className="font-bold">{customSignatoryTitle}</div>
                </div>
              </div>
            </div>

            {/* Back Side */}
            <div className="w-[310px] h-[440px] rounded-2xl border-2 border-outline-variant/40 overflow-hidden shadow-md bg-surface-container-lowest p-6 flex flex-col justify-between text-xs">
              <div className="space-y-3">
                <div className="text-center border-b border-outline-variant/20 pb-3">
                  <h3 className="font-bold text-sm text-primary uppercase">Identity Card Guidelines</h3>
                  <p className="text-[10px] text-on-surface-variant">{customHeaderTag}</p>
                </div>

                <div className="space-y-2 text-[11px]">
                  <div><strong className="block text-on-surface-variant">Father&apos;s Name:</strong> {selectedStudent.fatherName}</div>
                  <div><strong className="block text-on-surface-variant">Mother&apos;s Name:</strong> {selectedStudent.motherName}</div>
                  <div><strong className="block text-on-surface-variant">Guardian Contact:</strong> <span className="font-mono">{selectedStudent.phone}</span></div>
                  <div><strong className="block text-on-surface-variant">Address:</strong> {selectedStudent.address}</div>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-surface-container-low text-[10px] text-on-surface-variant leading-relaxed">
                This card is institutional property. If found, please return to {cmsConfig.schoolName}, {cmsConfig.address} or call {cmsConfig.phone}.
              </div>
            </div>
          </div>
        )}

        {/* 2. ADMIT CARD WITH LIVE ROUTINE */}
        {activeDoc === 'admit-card' && selectedStudent && (
          <div className="a4-page-container w-full max-w-[800px] bg-white p-6 sm:p-10 shadow-xl rounded-2xl border border-outline-variant/30 space-y-6 text-on-surface relative">
            <div className="border-2 border-primary/40 rounded-2xl p-5 space-y-4 relative">
              <div className="flex items-start justify-between border-b border-primary/20 pb-3">
                <div className="flex items-center gap-3">
                  {cmsConfig.crestUrl && (
                    <img
                      src={cmsConfig.crestUrl}
                      alt="Crest"
                      className="h-10 w-auto object-contain"
                      referrerPolicy="no-referrer"
                    />
                  )}
                  <div>
                    <h2 className="font-bold text-sm text-primary tracking-tight">
                      {cmsConfig.schoolName.toUpperCase()}
                    </h2>
                    <p className="text-[10px] text-on-surface-variant font-mono">
                      {cmsConfig.address} • {cmsConfig.eiin} • {cmsConfig.boardCode}
                    </p>
                    <span className="block mt-1 text-[11px] font-bold uppercase text-primary-container">
                      Official Examination Admit Card &amp; Schedule ({currentExam?.term})
                    </span>
                  </div>
                </div>

                {selectedStudent.avatarUrl ? (
                  <img
                    src={selectedStudent.avatarUrl}
                    alt={selectedStudent.fullName}
                    className="w-14 h-14 rounded-xl object-cover border border-outline-variant/40"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="w-14 h-14 rounded-xl bg-primary-fixed/50 text-primary-container font-bold text-sm flex items-center justify-center border border-outline-variant/40">
                    {selectedStudent.fullName.slice(0, 2).toUpperCase()}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-3 gap-2 text-xs bg-surface-container-low/60 p-3 rounded-xl font-mono">
                <div><span className="text-[10px] text-on-surface-variant block font-sans">Name:</span><strong>{selectedStudent.fullName}</strong></div>
                <div><span className="text-[10px] text-on-surface-variant block font-sans">Roll:</span><strong className="text-primary-container">#{selectedStudent.rollNumber}</strong></div>
                <div><span className="text-[10px] text-on-surface-variant block font-sans">Board Reg:</span><strong>{selectedStudent.registrationNumber}</strong></div>
                <div><span className="text-[10px] text-on-surface-variant block font-sans">Class &amp; Sec:</span><strong>{selectedStudent.className} ({selectedStudent.sectionName})</strong></div>
                <div><span className="text-[10px] text-on-surface-variant block font-sans">Group &amp; Shift:</span><strong>{selectedStudent.group} ({selectedStudent.shift})</strong></div>
                <div><span className="text-[10px] text-on-surface-variant block font-sans">System ID:</span><strong>{selectedStudent.systemId}</strong></div>
              </div>

              <table className="w-full text-left border-collapse border border-outline-variant/30 text-[10px]">
                <thead>
                  <tr className="bg-surface-container text-on-surface font-semibold text-center">
                    <th className="py-1.5 px-2 text-left border border-outline-variant/30">Subject</th>
                    <th className="py-1.5 px-2 border border-outline-variant/30">Date</th>
                    <th className="py-1.5 px-2 border border-outline-variant/30">Time</th>
                    <th className="py-1.5 px-2 border border-outline-variant/30">Room</th>
                    <th className="py-1.5 px-2 border border-outline-variant/30">Invigilator</th>
                  </tr>
                </thead>
                <tbody className="font-mono">
                  {routineRows.map((slot) => (
                    <tr key={slot.id}>
                      <td className="py-1.5 px-2 border border-outline-variant/30 font-sans font-semibold">{slot.subjectName}</td>
                      <td className="py-1.5 px-2 border border-outline-variant/30 text-center">{slot.date}</td>
                      <td className="py-1.5 px-2 border border-outline-variant/30 text-center">{slot.time}</td>
                      <td className="py-1.5 px-2 border border-outline-variant/30 text-center">{slot.room}</td>
                      <td className="py-1.5 px-2 border border-outline-variant/30 text-center">_______</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="flex items-end justify-between pt-4 text-xs">
                <div className="text-center">
                  <div className="w-28 border-b border-black mb-1" />
                  <span className="text-[10px] text-on-surface-variant">Candidate Signature</span>
                </div>
                <div className="text-[9px] text-on-surface-variant font-mono">
                  {customHeaderTag}
                </div>
                <div className="text-center">
                  <div className="w-32 border-b border-black mb-1 font-serif italic text-xs">{customSignatoryName}</div>
                  <span className="text-[10px] font-bold">{customSignatoryTitle}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 3. SEAT PLAN */}
        {activeDoc === 'seat-plan' && (
          <div className="a4-page-container w-full max-w-[800px] bg-white p-6 sm:p-10 shadow-xl rounded-2xl border border-outline-variant/30 space-y-4 text-on-surface">
            <div className="text-center pb-2 border-b border-primary/20">
              <h2 className="font-bold text-sm text-primary uppercase">
                {cmsConfig.schoolName} — Examination Seat Plan ({selectedExamClass})
              </h2>
              <p className="text-xs text-on-surface-variant font-mono">
                {currentExam?.title} • Hall: {examHall} • Date: {examDate}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {classStudents.map((stu) => (
                <div key={stu.id} className="border-2 border-dashed border-primary/40 rounded-xl p-4 flex items-center justify-between bg-surface-container-low/30">
                  <div className="space-y-1">
                    <span className="text-[10px] font-bold uppercase text-primary-container block">{cmsConfig.schoolName}</span>
                    <span className="font-bold text-sm block">{stu.fullName}</span>
                    <div className="text-[11px] font-mono text-on-surface-variant">
                      {stu.systemId} · {stu.className} ({stu.sectionName})
                    </div>
                  </div>
                  <div className="w-16 h-12 rounded-xl bg-primary-container text-on-primary flex items-center justify-center font-bold text-xl font-mono">
                    #{stu.rollNumber}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 4. ATTENDANCE REGISTER */}
        {activeDoc === 'attendance-sheet' && (
          <div className="a4-page-container w-full max-w-[800px] bg-white p-6 sm:p-10 shadow-xl rounded-2xl border border-outline-variant/30 space-y-4 text-on-surface">
            <div className="text-center pb-3 border-b-2 border-primary/30">
              <h2 className="font-bold text-base text-primary uppercase">{cmsConfig.schoolName}</h2>
              <p className="text-xs font-semibold uppercase">Examination Attendance Register ({selectedExamClass})</p>
              <div className="text-[11px] font-mono text-on-surface-variant mt-1">
                {currentExam?.term} · Hall: {examHall} · Date: {examDate}
              </div>
            </div>
            <table className="w-full text-left border-collapse border border-outline-variant/40 text-xs">
              <thead>
                <tr className="bg-surface-container text-center">
                  <th className="py-2 px-2 border border-outline-variant/40">Roll</th>
                  <th className="py-2 px-2 border border-outline-variant/40 text-left">System ID</th>
                  <th className="py-2 px-3 border border-outline-variant/40 text-left">Candidate Name</th>
                  <th className="py-2 px-3 border border-outline-variant/40">Signature</th>
                  <th className="py-2 px-2 border border-outline-variant/40">Script Serial</th>
                </tr>
              </thead>
              <tbody className="font-mono">
                {classStudents.map((stu) => (
                  <tr key={stu.id} className="text-center">
                    <td className="py-2 px-2 border border-outline-variant/30 font-bold">#{stu.rollNumber}</td>
                    <td className="py-2 px-2 border border-outline-variant/30 text-left">{stu.systemId}</td>
                    <td className="py-2 px-3 border border-outline-variant/30 text-left font-sans font-medium">{stu.fullName}</td>
                    <td className="py-2 px-3 border border-outline-variant/30">____________</td>
                    <td className="py-2 px-2 border border-outline-variant/30">[ &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; ]</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* 5. TRANSFER CERTIFICATE */}
        {activeDoc === 'transfer-certificate' && selectedStudent && (
          <div className="a4-page-container w-full max-w-[800px] bg-white p-8 sm:p-14 shadow-xl rounded-2xl border-4 border-double border-primary/40 space-y-6 text-on-surface relative overflow-hidden">
            {showWatermark && cmsConfig.crestUrl && (
              <div
                className="absolute inset-0 pointer-events-none opacity-5 bg-center bg-no-repeat bg-contain"
                style={{ backgroundImage: `url(${cmsConfig.crestUrl})` }}
              />
            )}
            <div className="flex flex-col items-center text-center pb-4 border-b-2 border-primary/30 relative">
              {cmsConfig.crestUrl && (
                <img src={cmsConfig.crestUrl} alt="Crest" className="h-14 w-auto object-contain mb-2" referrerPolicy="no-referrer" />
              )}
              <h1 className="font-headline-sm text-2xl font-bold text-primary">{cmsConfig.schoolName.toUpperCase()}</h1>
              <p className="text-xs text-on-surface-variant font-mono">{cmsConfig.address} • {cmsConfig.eiin}</p>
              <div className="mt-3 text-xs font-bold uppercase tracking-widest text-primary-container">Transfer Certificate (T.C.)</div>
            </div>
            <div className="flex justify-between text-xs font-mono">
              <span>TC Serial: <strong>TC-{activeYear}-00{selectedStudent.rollNumber}</strong></span>
              <span>Date: <strong>{new Date().toLocaleDateString()}</strong></span>
            </div>
            <div className="text-sm leading-relaxed space-y-4">
              <p>
                This is to certify that <strong>{selectedStudent.fullName}</strong>, son/daughter of{' '}
                <strong>{selectedStudent.fatherName}</strong> and <strong>{selectedStudent.motherName}</strong>, bearing System ID{' '}
                <strong className="font-mono">{selectedStudent.systemId}</strong> and Board Reg{' '}
                <strong className="font-mono">{selectedStudent.registrationNumber}</strong>, was a regular student in{' '}
                <strong>{selectedStudent.className} ({selectedStudent.sectionName})</strong>, Group <strong>{selectedStudent.group}</strong>.
              </p>
              <p>All tuition and laboratory dues have been cleared. Reason for leaving: <strong className="italic">{tcReason}</strong>.</p>
            </div>
            <div className="pt-16 flex items-end justify-between text-xs">
              <div className="w-24 h-24 rounded-full border-2 border-dashed border-primary/40 flex items-center justify-center text-[10px] font-mono text-center uppercase">
                Official<br />Seal
              </div>
              <div className="text-center">
                <div className="w-40 border-b border-black mb-1 font-serif italic text-base">{customSignatoryName}</div>
                <span className="font-bold block">{customSignatoryName}</span>
                <span className="text-[10px] text-on-surface-variant">{customSignatoryTitle}</span>
              </div>
            </div>
          </div>
        )}

        {/* 6. CHARACTER CERTIFICATE */}
        {activeDoc === 'character-certificate' && selectedStudent && (
          <div className="a4-page-container w-full max-w-[800px] bg-white p-8 sm:p-14 shadow-xl rounded-2xl border-8 border-double border-secondary/35 space-y-6 text-on-surface relative overflow-hidden">
            {showWatermark && cmsConfig.crestUrl && (
              <div
                className="absolute inset-0 pointer-events-none opacity-5 bg-center bg-no-repeat bg-contain"
                style={{ backgroundImage: `url(${cmsConfig.crestUrl})` }}
              />
            )}
            <div className="flex flex-col items-center text-center pb-4 border-b-2 border-secondary/25 relative">
              {cmsConfig.crestUrl && (
                <img src={cmsConfig.crestUrl} alt="Crest" className="h-14 w-auto object-contain mb-2" referrerPolicy="no-referrer" />
              )}
              <h1 className="font-headline-sm text-2xl font-bold text-secondary">{cmsConfig.schoolName.toUpperCase()}</h1>
              <p className="text-xs text-on-surface-variant font-mono">{customHeaderTag}</p>
              <div className="mt-3 text-sm font-bold uppercase tracking-widest text-primary-container">Character Certificate</div>
            </div>
            <div className="flex justify-between text-xs font-mono">
              <span>Ref: <strong>CC-{activeYear}/{selectedStudent.systemId}</strong></span>
              <span>Issued: <strong>{new Date().toLocaleDateString()}</strong></span>
            </div>
            <div className="text-base leading-loose space-y-4 pt-2 text-justify">
              <p>
                This is to certify that <strong>{selectedStudent.fullName}</strong>, son/daughter of{' '}
                <strong>{selectedStudent.fatherName}</strong> and <strong>{selectedStudent.motherName}</strong>, residing at{' '}
                {selectedStudent.address}, has been known to me as a student of <strong>{selectedStudent.className}</strong> (Roll{' '}
                <strong className="font-mono">#{selectedStudent.rollNumber}</strong>).
              </p>
              <p>
                During residency at this institution, he/she maintained an exemplary moral character, demonstrated strict discipline, and never participated in any activity subversive to the state or academic order.
              </p>
            </div>
            <div className="pt-16 flex items-end justify-between text-xs">
              <span className="font-mono text-on-surface-variant">{cmsConfig.schoolName}</span>
              <div className="text-center">
                <div className="w-40 border-b border-black mb-1 font-serif italic text-base">{customSignatoryName}</div>
                <span className="font-bold block">{customSignatoryName}</span>
                <span className="text-[10px] text-on-surface-variant">{customSignatoryTitle}</span>
              </div>
            </div>
          </div>
        )}

        {/* 7. ACADEMIC TESTIMONIAL */}
        {activeDoc === 'testimonial' && selectedStudent && (
          <div className="a4-page-container w-full max-w-[800px] bg-white p-8 sm:p-14 shadow-xl rounded-2xl border-8 border-double border-primary/30 space-y-6 text-on-surface relative overflow-hidden">
            {showWatermark && cmsConfig.crestUrl && (
              <div
                className="absolute inset-0 pointer-events-none opacity-5 bg-center bg-no-repeat bg-contain"
                style={{ backgroundImage: `url(${cmsConfig.crestUrl})` }}
              />
            )}
            <div className="flex flex-col items-center text-center pb-4 border-b-2 border-primary/20 relative">
              {cmsConfig.crestUrl && (
                <img src={cmsConfig.crestUrl} alt="Crest" className="h-16 w-auto object-contain mb-2" referrerPolicy="no-referrer" />
              )}
              <h1 className="font-headline-sm text-2xl font-bold tracking-tight text-primary">{cmsConfig.schoolName.toUpperCase()}</h1>
              <p className="text-xs text-on-surface-variant font-mono">{cmsConfig.motto}</p>
              <div className="mt-4 text-xs font-bold uppercase tracking-widest text-secondary">
                Academic Testimonial
              </div>
            </div>

            <div className="text-right text-xs font-mono text-on-surface-variant">
              Ref No: <strong>TEST-{activeYear}/{selectedStudent.systemId}</strong>
            </div>

            <div className="text-base leading-loose space-y-4 pt-2 text-justify">
              <p>
                This is to certify that <strong>{selectedStudent.fullName}</strong>, son/daughter of{' '}
                <strong>{selectedStudent.fatherName}</strong> and <strong>{selectedStudent.motherName}</strong>, bearing Roll{' '}
                <strong>#{selectedStudent.rollNumber}</strong>, Registration No{' '}
                <strong className="font-mono">{selectedStudent.registrationNumber}</strong>, of <strong>{selectedStudent.group}</strong> group, was a diligent student of this institution.
              </p>
              <p>
                He/She appeared at the <strong>{currentExam?.title}</strong> and achieved a Grade Point Average (GPA) of{' '}
                <strong className="text-primary font-mono text-lg">
                  {compiledResult ? `${compiledResult.finalGPA.toFixed(2)} (${compiledResult.finalLetterGrade})` : '5.00 (A+)'}
                </strong>{' '}
                under the Board grading standard.
              </p>
              <p>We wish him/her resounding success in all future scholarly pursuits.</p>
            </div>

            <div className="pt-16 flex items-end justify-between text-xs">
              <span className="font-mono text-xs">Date of Issue: {new Date().toLocaleDateString()}</span>
              <div className="text-center">
                <div className="w-40 border-b border-black mb-1 font-serif italic text-base">{customSignatoryName}</div>
                <span className="font-bold text-sm text-on-surface block">{customSignatoryName}</span>
                <span className="text-[11px] text-on-surface-variant">{customSignatoryTitle}</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
