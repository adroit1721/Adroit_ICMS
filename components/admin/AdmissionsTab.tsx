'use client';

import { useState } from 'react';
import { useERPStore } from '@/lib/store';
import {
  formatGroupSectionDisplay,
  getEffectiveSectionsForClassGroup,
  isSingleBatchCohort,
} from '@/lib/academic-helpers';
import {
  AcademicGroup,
  AdmissionApplication,
  GenderType,
  ReligionGroup,
  ShiftType,
} from '@/lib/types';
import {
  getNextStudentSystemIdFromStudents,
  resolveAcademicYearDigits,
} from '@/lib/student-schema';

function parseCsvRow(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

export default function AdmissionsTab() {
  const { isHydrated } = useERPStore();
  return <AdmissionsTabInner key={isHydrated ? 'hydrated' : 'ssr'} />;
}

function AdmissionsTabInner() {
  const {
    state,
    updateAdmissionStatus,
    updateAdmissionApplication,
    deleteAdmissionApplication,
    bulkImportAdmissions,
    admitApplicantToClass,
    updateAdmissionFormConfig,
  } = useERPStore();
  const { admissions, academicClasses, admissionFormConfig, students, instituteRules } = state;

  const [subTab, setSubTab] = useState<'queue' | 'form-design'>('queue');
  const [admissionFilter, setAdmissionFilter] = useState<
    'all' | 'Approved' | 'Under Review' | 'Pending' | 'Admitted'
  >('all');
  const [feedback, setFeedback] = useState<string | null>(null);

  // Edit applicant modal
  const [editingApp, setEditingApp] = useState<AdmissionApplication | null>(null);

  // Direct admit-to-class modal
  const [admittingApp, setAdmittingApp] = useState<AdmissionApplication | null>(null);
  const [targetClass, setTargetClass] = useState(academicClasses[0]?.name || 'Grade 9');
  const [targetSection, setTargetSection] = useState(academicClasses[0]?.sections[0] || 'A');
  const [targetShift, setTargetShift] = useState<ShiftType>('Morning');
  const [targetGroup, setTargetGroup] = useState<AcademicGroup>('Science');
  const [targetRoll, setTargetRoll] = useState(students.length + 1);
  const [targetStudentId, setTargetStudentId] = useState('');
  const [admitError, setAdmitError] = useState<string | null>(null);

  const studentIdPrefix = instituteRules?.studentIdPrefix || 'AG';
  const activeAcademicYear = instituteRules?.activeAcademicYear || new Date().getFullYear();
  const previewStudentId = getNextStudentSystemIdFromStudents(
    students,
    studentIdPrefix,
    activeAcademicYear
  );

  // Custom form designer local state
  const [formHeading, setFormHeading] = useState(admissionFormConfig.heading);
  const [formInstructions, setFormInstructions] = useState(admissionFormConfig.instructions);
  const [formSignatoryName, setFormSignatoryName] = useState(admissionFormConfig.signatoryName);
  const [formSignatoryTitle, setFormSignatoryTitle] = useState(admissionFormConfig.signatoryTitle);
  const [customFields, setCustomFields] = useState(admissionFormConfig.customFields);
  const [newFieldLabel, setNewFieldLabel] = useState('');

  const getNextRollForClassSection = (clsName: string, secName: string) => {
    const rolls = students
      .filter((s) => s.className === clsName && s.sectionName === secName)
      .map((s) => s.rollNumber);
    return Math.max(0, ...rolls) + 1;
  };

  const showToast = (msg: string) => {
    setFeedback(msg);
    setTimeout(() => setFeedback(null), 3500);
  };

  const filteredAdmissions = admissions.filter((a) =>
    admissionFilter === 'all' ? true : a.status === admissionFilter
  );

  const handleDownloadApplicantTemplate = () => {
    const csv = [
      'applicantName,gender,fatherName,motherName,phone,grade,group,religionGroup,score',
      'Nafisa Tabassum,Female,Kamrul Hasan,Salma Begum,+8801711223344,Grade 9,Science,Islam,94/100',
      'Arnob Chakraborty,Male,Subir Chakraborty,Mita Chakraborty,+8801811223344,Grade 10,Science,Hinduism,91/100',
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'admission_applicants_template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportApplicantsCsv = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || '');
      const lines = text
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);
      if (lines.length < 2) return;

      const imported = lines.slice(1).map((line) => {
        const cols = parseCsvRow(line);
        const rawGender = (cols[1] || '').trim().toLowerCase();
        const gender: GenderType = rawGender === 'female' ? 'Female' : 'Male';
        return {
          applicantName: cols[0] || 'Unnamed Applicant',
          gender,
          fatherName: cols[2] || '',
          motherName: cols[3] || '',
          phone: cols[4] || '',
          grade: cols[5] || 'Grade 9',
          group: (cols[6] as AcademicGroup) || 'Science',
          religionGroup: (cols[7] as ReligionGroup) || 'Islam',
          score: cols[8] || 'Awaiting Assessment',
        };
      });
      const count = bulkImportAdmissions(imported);
      showToast(`Imported ${count} applicant record(s) from CSV/Excel sheet. You can edit any row before selection.`);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleSaveEditApplicant = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingApp) return;
    updateAdmissionApplication(editingApp.id, editingApp);
    setEditingApp(null);
    showToast(`Applicant "${editingApp.applicantName}" updated.`);
  };

  const handleConfirmAdmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!admittingApp) return;

    const trimmedCustomId = targetStudentId.replace(/[\s-]/g, '').trim().toUpperCase();
    if (trimmedCustomId) {
      const isDuplicate = students.some(
        (s) => (s.systemId || '').replace(/[\s-]/g, '').trim().toUpperCase() === trimmedCustomId
      );
      if (isDuplicate) {
        setAdmitError(
          `Student ID "${trimmedCustomId}" is already assigned to an existing student. Choose a unique ID or leave blank to auto-generate.`
        );
        return;
      }
    }

    const rollTaken = students.some(
      (s) =>
        s.className === targetClass &&
        s.sectionName === targetSection &&
        s.rollNumber === targetRoll
    );
    if (rollTaken) {
      setAdmitError(
        `Roll #${targetRoll} is already assigned in ${targetClass} (${targetSection}). Choose an unused roll number.`
      );
      return;
    }
    setAdmitError(null);
    const enrolled = admitApplicantToClass({
      applicationId: admittingApp.id,
      className: targetClass,
      sectionName: targetSection,
      shift: targetShift,
      group: targetGroup,
      rollNumber: targetRoll,
      systemId: trimmedCustomId || undefined,
    });
    setAdmittingApp(null);
    setTargetStudentId('');
    if (enrolled) {
      showToast(
        `${enrolled.fullName} admitted to ${targetClass} · ${formatGroupSectionDisplay(
          targetGroup,
          targetSection
        )} with Roll #${targetRoll} and ID ${enrolled.systemId}.`
      );
    }
  };

  const handleSaveFormDesign = (e: React.FormEvent) => {
    e.preventDefault();
    updateAdmissionFormConfig({
      heading: formHeading,
      instructions: formInstructions,
      signatoryName: formSignatoryName,
      signatoryTitle: formSignatoryTitle,
      customFields,
    });
    showToast('Admission form layout, custom fields, and signatories updated on public /admissions portal.');
  };

  return (
    <div className="flex flex-col w-full space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <span className="font-label-sm text-label-sm uppercase tracking-wider text-primary-container font-semibold">
            Admissions Desk &amp; Enrollment Pipeline
          </span>
          <h1 className="font-headline-lg text-headline-lg text-on-surface tracking-tight font-bold">
            Prospective Student Applications
          </h1>
          <p className="font-body-md text-body-md text-on-surface-variant mt-0.5">
            Import applicants via CSV/Excel, edit records, customize admission form signatories, and directly admit into Class &amp; Roll.
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 rounded-xl bg-surface-container-low border border-outline-variant/30 self-start lg:self-auto">
          <button
            type="button"
            onClick={() => setSubTab('queue')}
            className={`px-4 py-2 rounded-lg text-xs font-semibold cursor-pointer whitespace-nowrap ${
              subTab === 'queue'
                ? 'bg-primary-container text-on-primary shadow-xs'
                : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            Applicant Queue ({admissions.length})
          </button>
          <button
            type="button"
            onClick={() => setSubTab('form-design')}
            className={`px-4 py-2 rounded-lg text-xs font-semibold cursor-pointer whitespace-nowrap ${
              subTab === 'form-design'
                ? 'bg-primary-container text-on-primary shadow-xs'
                : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            Admission Form &amp; Signatories
          </button>
        </div>
      </div>

      {feedback && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-semibold flex items-center gap-2">
          <span className="material-symbols-outlined text-[18px]">check_circle</span>
          <span>{feedback}</span>
        </div>
      )}

      {subTab === 'queue' && (
        <div className="space-y-4">
          {/* Toolbar */}
          <div className="rounded-2xl bg-surface-container-lowest border border-outline-variant/25 p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleDownloadApplicantTemplate}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-surface-container-low hover:bg-surface-container text-xs font-semibold border border-outline-variant/30 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[16px]">download</span>
                CSV / Excel Template
              </button>

              <label className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-secondary text-on-secondary text-xs font-bold cursor-pointer hover:opacity-90">
                <span className="material-symbols-outlined text-[16px]">upload_file</span>
                Import Applicants (CSV)
                <input type="file" accept=".csv" onChange={handleImportApplicantsCsv} className="hidden" />
              </label>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-on-surface-variant">Filter:</span>
              <select
                value={admissionFilter}
                onChange={(e) =>
                  setAdmissionFilter(
                    e.target.value as 'all' | 'Approved' | 'Under Review' | 'Pending' | 'Admitted'
                  )
                }
                className="px-3 py-1.5 rounded-xl bg-surface-container-low border border-outline-variant/30 text-xs font-bold text-on-surface"
              >
                <option value="all">All Candidates</option>
                <option value="Pending">Pending</option>
                <option value="Under Review">Under Review</option>
                <option value="Approved">Approved</option>
                <option value="Admitted">Admitted to Class</option>
              </select>
            </div>
          </div>

          {/* Queue Table */}
          <div className="rounded-2xl bg-surface-container-lowest border border-outline-variant/25 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-surface-container-low text-on-surface-variant border-b border-outline-variant/25">
                    <th className="py-3 px-4 font-semibold">Applicant</th>
                    <th className="py-3 px-4 font-semibold">Target Class &amp; Group</th>
                    <th className="py-3 px-4 font-semibold">Guardian &amp; Phone</th>
                    <th className="py-3 px-4 font-semibold">Score</th>
                    <th className="py-3 px-4 font-semibold">Status</th>
                    <th className="py-3 px-4 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/15 text-on-surface">
                  {filteredAdmissions.map((app) => (
                    <tr key={app.id} className="hover:bg-surface-container-low/40">
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-sm flex items-center gap-1.5">
                          <span>{app.applicantName}</span>
                          {app.gender && (
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                app.gender === 'Female'
                                  ? 'bg-pink-100 text-pink-900'
                                  : 'bg-sky-100 text-sky-900'
                              }`}
                            >
                              {app.gender}
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-on-surface-variant font-mono">
                          {app.applicationCode} · {app.appliedTime}
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="font-semibold">{app.grade}</div>
                        <div className="text-[11px] text-on-surface-variant">
                          {app.group || 'General'} · {app.religionGroup || 'Islam'}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-on-surface-variant">
                        <div>{app.fatherName || '—'}</div>
                        <div className="font-mono text-[11px]">{app.phone || '—'}</div>
                      </td>
                      <td className="py-3.5 px-4 font-mono font-bold text-emerald-800 tabular-nums">
                        {app.score}
                      </td>
                      <td className="py-3.5 px-4 font-semibold">
                        {app.status === 'Admitted' ? (
                          <span className="text-emerald-800">
                            Admitted ({app.assignedClass} {app.assignedSection} · Roll #{app.assignedRoll})
                          </span>
                        ) : app.status === 'Approved' ? (
                          <span className="text-emerald-700">Approved</span>
                        ) : app.status === 'Under Review' ? (
                          <span className="text-amber-800">Under Review</span>
                        ) : (
                          <span className="text-on-surface-variant">Pending</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setEditingApp({ ...app })}
                            className="px-2.5 py-1 rounded-lg bg-surface-container text-on-surface hover:bg-surface-container-high font-semibold cursor-pointer"
                          >
                            Edit
                          </button>
                          {app.status !== 'Admitted' && (
                            <>
                              <button
                                type="button"
                                onClick={() => updateAdmissionStatus(app.id, 'Approved')}
                                className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-800 hover:bg-emerald-100 font-semibold cursor-pointer"
                              >
                                Approve
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  const resolvedClsObj =
                                    academicClasses.find((c) => c.name === app.grade) ||
                                    academicClasses[0];
                                  const nextCls = resolvedClsObj?.name || 'Grade 9';
                                  const clsGroups = resolvedClsObj?.groups || ['General'];
                                  const nextGrp =
                                    app.group && clsGroups.includes(app.group)
                                      ? app.group
                                      : clsGroups[0] || 'General';
                                  const nextSec =
                                    getEffectiveSectionsForClassGroup(resolvedClsObj, nextGrp)[0] ||
                                    'Common';
                                  setAdmittingApp(app);
                                  setTargetStudentId('');
                                  setTargetClass(nextCls);
                                  setTargetSection(nextSec);
                                  setTargetGroup(nextGrp);
                                  setTargetRoll(getNextRollForClassSection(nextCls, nextSec));
                                  setAdmitError(null);
                                }}
                                className="px-2.5 py-1 rounded-lg bg-primary-container text-on-primary hover:bg-primary font-semibold cursor-pointer"
                              >
                                Admit to Class
                              </button>
                            </>
                          )}
                          <button
                            type="button"
                            onClick={() => deleteAdmissionApplication(app.id)}
                            className="p-1 rounded-lg text-error hover:bg-error-container/20 cursor-pointer"
                            title="Delete"
                          >
                            <span className="material-symbols-outlined text-[16px]">delete</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB 2: ADMISSION FORM & SIGNATORY CUSTOMIZER */}
      {subTab === 'form-design' && (
        <form
          onSubmit={handleSaveFormDesign}
          className="rounded-2xl bg-surface-container-lowest border border-outline-variant/25 p-6 space-y-5"
        >
          <h2 className="text-base font-bold text-on-surface border-b border-outline-variant/20 pb-3">
            Customize Public Admission Form &amp; Signatories
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="block font-semibold text-on-surface-variant mb-1">Form Title</label>
              <input
                type="text"
                value={formHeading}
                onChange={(e) => setFormHeading(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 text-sm"
              />
            </div>
            <div>
              <label className="block font-semibold text-on-surface-variant mb-1">
                Admission Signatory Name
              </label>
              <input
                type="text"
                value={formSignatoryName}
                onChange={(e) => setFormSignatoryName(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 text-sm"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block font-semibold text-on-surface-variant mb-1">
                Signatory Designation / Office Title
              </label>
              <input
                type="text"
                value={formSignatoryTitle}
                onChange={(e) => setFormSignatoryTitle(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 text-sm"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block font-semibold text-on-surface-variant mb-1">
                Applicant Instructions
              </label>
              <textarea
                rows={3}
                value={formInstructions}
                onChange={(e) => setFormInstructions(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 text-sm"
              />
            </div>
          </div>

          <div className="space-y-3 pt-2 border-t border-outline-variant/20">
            <h3 className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">
              Dynamic Custom Form Fields
            </h3>
            <div className="space-y-2">
              {customFields.map((cf, idx) => (
                <div
                  key={cf.id}
                  className="flex items-center justify-between gap-3 p-3 rounded-xl bg-surface-container-low border border-outline-variant/20 text-xs"
                >
                  <span className="font-semibold text-on-surface">{cf.label}</span>
                  <div className="flex items-center gap-3">
                    <label className="inline-flex items-center gap-1 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={cf.required}
                        onChange={(e) => {
                          const next = [...customFields];
                          next[idx] = { ...next[idx], required: e.target.checked };
                          setCustomFields(next);
                        }}
                      />
                      <span>Required</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => setCustomFields(customFields.filter((x) => x.id !== cf.id))}
                      className="text-error font-semibold cursor-pointer"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                placeholder="New custom field label (e.g. Birth Certificate Number)"
                value={newFieldLabel}
                onChange={(e) => setNewFieldLabel(e.target.value)}
                className="flex-1 px-3.5 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 text-xs"
              />
              <button
                type="button"
                onClick={() => {
                  if (!newFieldLabel.trim()) return;
                  setCustomFields([
                    ...customFields,
                    { id: `cf-${Date.now()}`, label: newFieldLabel.trim(), required: false },
                  ]);
                  setNewFieldLabel('');
                }}
                className="px-4 py-2 rounded-xl bg-secondary text-on-secondary text-xs font-bold cursor-pointer"
              >
                Add Field
              </button>
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              className="px-6 py-2.5 rounded-xl bg-primary-container hover:bg-primary text-on-primary text-xs font-bold shadow-sm cursor-pointer"
            >
              Save Admission Form Design
            </button>
          </div>
        </form>
      )}

      {/* EDIT APPLICANT MODAL */}
      {editingApp && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-surface-container-lowest rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-outline-variant/20 pb-3">
              <h3 className="text-base font-bold">Edit Applicant ({editingApp.applicationCode})</h3>
              <button type="button" onClick={() => setEditingApp(null)} className="p-1 cursor-pointer">
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>
            <form onSubmit={handleSaveEditApplicant} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold mb-1">Applicant Name</label>
                  <input
                    type="text"
                    required
                    value={editingApp.applicantName}
                    onChange={(e) => setEditingApp({ ...editingApp, applicantName: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1">Gender</label>
                  <select
                    value={editingApp.gender || 'Male'}
                    onChange={(e) =>
                      setEditingApp({ ...editingApp, gender: e.target.value as GenderType })
                    }
                    className="w-full px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 font-semibold"
                  >
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold mb-1">Father&apos;s Name</label>
                  <input
                    type="text"
                    value={editingApp.fatherName || ''}
                    onChange={(e) => setEditingApp({ ...editingApp, fatherName: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1">Phone</label>
                  <input
                    type="text"
                    value={editingApp.phone || ''}
                    onChange={(e) => setEditingApp({ ...editingApp, phone: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1">Applying Class</label>
                  <input
                    type="text"
                    value={editingApp.grade}
                    onChange={(e) => setEditingApp({ ...editingApp, grade: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1">Admission Score</label>
                  <input
                    type="text"
                    value={editingApp.score}
                    onChange={(e) => setEditingApp({ ...editingApp, score: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 font-mono"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setEditingApp(null)} className="px-4 py-2 rounded-xl text-on-surface-variant cursor-pointer">
                  Cancel
                </button>
                <button type="submit" className="px-5 py-2 rounded-xl bg-primary-container text-on-primary font-bold cursor-pointer">
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ADMIT TO CLASS WITH ROLL MODAL */}
      {admittingApp && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-surface-container-lowest rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-outline-variant/20 pb-3">
              <h3 className="text-base font-bold">Admit Candidate to Class</h3>
              <button type="button" onClick={() => setAdmittingApp(null)} className="p-1 cursor-pointer">
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>
            <p className="text-xs text-on-surface-variant">
              Assign <strong>{admittingApp.applicantName}</strong> ({admittingApp.applicationCode}) directly into the official Student Register with a dedicated Roll Number.
            </p>
            <form onSubmit={handleConfirmAdmit} className="space-y-3 text-xs">
              {admitError && (
                <div className="p-2.5 rounded-xl bg-red-50 border border-red-200 text-red-800 text-xs font-semibold">
                  {admitError}
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold mb-1">Target Class</label>
                  <select
                    value={targetClass}
                    onChange={(e) => {
                      const nextCls = e.target.value;
                      const clsObj = academicClasses.find((c) => c.name === nextCls);
                      const clsGroups = clsObj?.groups || ['General'];
                      const nextGrp = clsGroups.includes(targetGroup)
                        ? targetGroup
                        : clsGroups[0] || 'General';
                      const clsSections = getEffectiveSectionsForClassGroup(clsObj, nextGrp);
                      const nextSec = clsSections.includes(targetSection)
                        ? targetSection
                        : clsSections[0] || 'Common';
                      setTargetClass(nextCls);
                      setTargetSection(nextSec);
                      setTargetGroup(nextGrp);
                      setTargetRoll(getNextRollForClassSection(nextCls, nextSec));
                      setAdmitError(null);
                    }}
                    className="w-full px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 font-semibold"
                  >
                    {academicClasses.map((c) => (
                      <option key={c.id} value={c.name}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-semibold mb-1">Cohort / Section</label>
                  {(() => {
                    const clsObj = academicClasses.find((c) => c.name === targetClass);
                    const admitSections = getEffectiveSectionsForClassGroup(clsObj, targetGroup);
                    if (isSingleBatchCohort(admitSections)) {
                      return (
                        <div className="w-full px-3 py-2 rounded-xl bg-secondary-fixed/50 border border-outline-variant/25 font-semibold text-on-secondary-container">
                          {formatGroupSectionDisplay(targetGroup, admitSections[0] || 'Common')}
                        </div>
                      );
                    }
                    return (
                      <select
                        value={
                          admitSections.includes(targetSection)
                            ? targetSection
                            : admitSections[0] || 'Common'
                        }
                        onChange={(e) => {
                          const nextSec = e.target.value;
                          setTargetSection(nextSec);
                          setTargetRoll(getNextRollForClassSection(targetClass, nextSec));
                          setAdmitError(null);
                        }}
                        className="w-full px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 font-semibold"
                      >
                        {admitSections.map((sec) => (
                          <option key={sec} value={sec}>
                            {sec === 'Common'
                              ? 'Combined'
                              : formatGroupSectionDisplay(targetGroup, sec)}
                          </option>
                        ))}
                      </select>
                    );
                  })()}
                </div>
                <div>
                  <label className="block font-semibold mb-1">Shift</label>
                  <select
                    value={targetShift}
                    onChange={(e) => setTargetShift(e.target.value as ShiftType)}
                    className="w-full px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30"
                  >
                    {(academicClasses.find((c) => c.name === targetClass)?.shifts || ['Morning', 'Day']).map((shf) => (
                      <option key={shf} value={shf}>{shf}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-semibold mb-1">Group</label>
                  <select
                    value={targetGroup}
                    onChange={(e) => {
                      const nextGrp = e.target.value as AcademicGroup;
                      const clsObj = academicClasses.find((c) => c.name === targetClass);
                      const clsSections = getEffectiveSectionsForClassGroup(clsObj, nextGrp);
                      const nextSec = clsSections.includes(targetSection)
                        ? targetSection
                        : clsSections[0] || 'Common';
                      setTargetGroup(nextGrp);
                      setTargetSection(nextSec);
                      setTargetRoll(getNextRollForClassSection(targetClass, nextSec));
                      setAdmitError(null);
                    }}
                    className="w-full px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30"
                  >
                    {(academicClasses.find((c) => c.name === targetClass)?.groups || ['General']).map((grp) => (
                      <option key={grp} value={grp}>{grp}</option>
                    ))}
                  </select>
                </div>
                <div className="col-span-2">
                  <div className="flex items-center justify-between mb-1">
                    <label className="block font-semibold">Student ID (Custom Override / Auto-Generated)</label>
                    <span className="text-[11px] font-mono font-bold text-primary-container bg-primary-container/10 px-2 py-0.5 rounded-md">
                      Auto: {previewStudentId}
                    </span>
                  </div>
                  <input
                    type="text"
                    placeholder={`Leave blank for auto ID (${previewStudentId})`}
                    value={targetStudentId}
                    onChange={(e) => {
                      setTargetStudentId(e.target.value.replace(/[\s-]/g, '').toUpperCase());
                      setAdmitError(null);
                    }}
                    className="w-full px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 font-mono font-bold tracking-wider uppercase text-on-surface placeholder:normal-case placeholder:font-normal placeholder:tracking-normal placeholder:text-on-surface-variant/50"
                  />
                  <p className="text-[11px] text-on-surface-variant mt-1">
                    System format: <span className="font-mono font-semibold">{studentIdPrefix.replace(/[\s-]/g, '').toUpperCase() || 'AG'}{resolveAcademicYearDigits(activeAcademicYear)}XXXX</span> (e.g. {previewStudentId}). Leave blank to auto-generate sequentially.
                  </p>
                </div>
                <div className="col-span-2">
                  <label className="block font-semibold mb-1">Assigned Class Roll Number *</label>
                  <input
                    type="number"
                    min={1}
                    required
                    value={targetRoll}
                    onChange={(e) => {
                      setTargetRoll(parseInt(e.target.value, 10) || 1);
                      setAdmitError(null);
                    }}
                    className="w-full px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 font-mono font-bold text-primary-container"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setAdmittingApp(null)} className="px-4 py-2 rounded-xl text-on-surface-variant cursor-pointer">
                  Cancel
                </button>
                <button type="submit" className="px-5 py-2 rounded-xl bg-primary-container text-on-primary font-bold cursor-pointer">
                  Enroll &amp; Assign Roll
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
