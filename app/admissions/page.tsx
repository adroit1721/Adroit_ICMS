'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useERPStore } from '@/lib/store';
import { AcademicGroup, AdmissionApplication, GenderType, ReligionGroup } from '@/lib/types';
import { classMatchesEnabledWings, formatInstituteSessionBanner } from '@/lib/academic-helpers';
import PublicShell from '@/components/public/PublicShell';

function AdmissionsContent() {
  const { state, addAdmissionApplication } = useERPStore();
  const { cmsConfig, admissionFormConfig, academicClasses, instituteRules } = state;

  const wingFilteredClasses = academicClasses.filter((c) =>
    classMatchesEnabledWings(c, instituteRules)
  );
  const effectiveClasses = wingFilteredClasses.length > 0 ? wingFilteredClasses : academicClasses;
  const classOptions = effectiveClasses.length
    ? effectiveClasses.map((c) => c.name)
    : ['Grade 6', 'Grade 7', 'Grade 8', 'Grade 9', 'Grade 10'];

  const [applicantName, setApplicantName] = useState('');
  const [gender, setGender] = useState<GenderType>('Male');
  const [fatherName, setFatherName] = useState('');
  const [motherName, setMotherName] = useState('');
  const [phone, setPhone] = useState('');
  const [grade, setGrade] = useState(classOptions[0] || 'Grade 9');
  const [group, setGroup] = useState<AcademicGroup>('Science');
  const [religionGroup, setReligionGroup] = useState<ReligionGroup>('Islam');
  const [score, setScore] = useState('');
  const [customAnswers, setCustomAnswers] = useState<Record<string, string>>({});

  const [submittedSlip, setSubmittedSlip] = useState<AdmissionApplication | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const selectedClassName = classOptions.includes(grade) ? grade : classOptions[0];
  const selectedClassObj = academicClasses.find((c) => c.name === selectedClassName);
  const availableGroups: AcademicGroup[] =
    selectedClassObj?.hasGroups === false
      ? ['General']
      : selectedClassObj?.groups?.length
      ? selectedClassObj.groups
      : ['General', 'Science', 'Business Studies', 'Humanities'];
  const effectiveGroup: AcademicGroup = availableGroups.includes(group)
    ? group
    : availableGroups[0];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!applicantName.trim() || !fatherName.trim() || !phone.trim()) {
      setFormError('Please fill in Applicant Name, Father Name, and Guardian Phone.');
      return;
    }

    for (const field of admissionFormConfig.customFields) {
      if (field.required && !(customAnswers[field.label] || '').trim()) {
        setFormError(`Please complete required field: ${field.label}`);
        return;
      }
    }

    const created = addAdmissionApplication({
      applicantName: applicantName.trim(),
      gender,
      fatherName: fatherName.trim(),
      motherName: motherName.trim(),
      phone: phone.trim(),
      grade: selectedClassName,
      group: effectiveGroup,
      religionGroup,
      score: score.trim() || 'Awaiting Assessment',
      customAnswers,
    });

    setSubmittedSlip(created);
    setApplicantName('');
    setFatherName('');
    setMotherName('');
    setPhone('');
    setScore('');
    setCustomAnswers({});
  };

  return (
    <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 py-10 space-y-10">
      {/* Status Banner */}
      <section className="rounded-[2rem] bg-white/80 backdrop-blur-2xl border border-outline-variant/25 shadow-[0_16px_40px_-8px_rgba(19,27,46,0.05)] p-8 sm:p-10">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2 max-w-2xl">
            <span
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${
                cmsConfig.isAdmissionOpen
                  ? 'bg-emerald-100 text-emerald-900 border border-emerald-200'
                  : 'bg-amber-100 text-amber-900 border border-amber-200'
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  cmsConfig.isAdmissionOpen ? 'bg-emerald-600 animate-pulse' : 'bg-amber-600'
                }`}
              />
              {cmsConfig.isAdmissionOpen
                ? `${formatInstituteSessionBanner(instituteRules)} — Admissions Open`
                : 'Admissions Window Currently Paused'}
            </span>
            <h1 className="font-display-lg text-3xl sm:text-4xl font-bold text-on-surface tracking-tight">
              Online Admission Portal
            </h1>
            <p className="text-sm text-on-surface-variant leading-relaxed">
              {admissionFormConfig.instructions}
            </p>
          </div>
          <div className="flex flex-col gap-2 text-xs text-on-surface-variant bg-surface-container-low/80 p-4 rounded-2xl border border-outline-variant/30 shrink-0">
            <span className="font-semibold text-on-surface">Admissions Helpline</span>
            <span>{cmsConfig.phone}</span>
            <span>{cmsConfig.email}</span>
          </div>
        </div>
      </section>

      {!cmsConfig.isAdmissionOpen ? (
        <section className="rounded-[2rem] bg-white/80 backdrop-blur-2xl border border-outline-variant/25 p-10 text-center space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-amber-100 text-amber-800 flex items-center justify-center mx-auto">
            <span className="material-symbols-outlined text-[28px]">event_busy</span>
          </div>
          <h2 className="text-xl font-bold text-on-surface">
            Online Intake Is Currently Closed
          </h2>
          <p className="text-sm text-on-surface-variant max-w-xl mx-auto">
            The online admission form is temporarily closed between academic intake cycles. Please check the Notice Board for upcoming merit test dates or contact the Registrar&apos;s office.
          </p>
          <div className="pt-2">
            <Link
              href="/notices"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-primary-container text-on-primary text-xs font-semibold"
            >
              View Admission Circulars
            </Link>
          </div>
        </section>
      ) : submittedSlip ? (
        /* PRINTABLE APPLICATION SLIP */
        <section className="max-w-2xl mx-auto rounded-[2rem] bg-white border border-outline-variant/40 shadow-xl p-8 space-y-6">
          <div className="flex items-center justify-between border-b border-outline-variant/30 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center">
                <span className="material-symbols-outlined text-[24px]">check_circle</span>
              </div>
              <div>
                <h2 className="text-lg font-bold text-on-surface">
                  Application Registered Successfully
                </h2>
                <p className="text-xs text-on-surface-variant">
                  Synchronized with Registrar Admission Queue
                </p>
              </div>
            </div>
            <span className="px-3 py-1 rounded-full bg-primary-fixed text-primary-container font-mono font-bold text-xs">
              {submittedSlip.applicationCode}
            </span>
          </div>

          <div className="p-5 rounded-2xl bg-surface-container-low/70 border border-outline-variant/30 grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div>
              <span className="text-on-surface-variant block">Applicant Full Name</span>
              <span className="font-bold text-sm text-on-surface">{submittedSlip.applicantName}</span>
            </div>
            <div>
              <span className="text-on-surface-variant block">Applying Class &amp; Group</span>
              <span className="font-bold text-sm text-on-surface">
                {submittedSlip.grade} ({submittedSlip.group || 'General'})
              </span>
            </div>
            <div>
              <span className="text-on-surface-variant block">Gender</span>
              <span className="font-semibold text-on-surface">{submittedSlip.gender || '—'}</span>
            </div>
            <div>
              <span className="text-on-surface-variant block">Father&apos;s Name</span>
              <span className="font-semibold text-on-surface">{submittedSlip.fatherName || '—'}</span>
            </div>
            <div>
              <span className="text-on-surface-variant block">Guardian Contact</span>
              <span className="font-mono font-semibold text-on-surface">{submittedSlip.phone || '—'}</span>
            </div>
            <div>
              <span className="text-on-surface-variant block">Religion</span>
              <span className="font-semibold text-on-surface">{submittedSlip.religionGroup || '—'}</span>
            </div>
            <div>
              <span className="text-on-surface-variant block">Current Review Status</span>
              <span className="inline-block mt-0.5 px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-900 font-semibold">
                {submittedSlip.status}
              </span>
            </div>
            {submittedSlip.customAnswers &&
              Object.entries(submittedSlip.customAnswers).map(([label, val]) =>
                val ? (
                  <div key={label}>
                    <span className="text-on-surface-variant block">{label}</span>
                    <span className="font-semibold text-on-surface">{val}</span>
                  </div>
                ) : null
              )}
          </div>

          <div className="pt-4 border-t border-outline-variant/20 flex items-end justify-between text-xs">
            <span className="text-on-surface-variant">Official Digital Acknowledgement Slip</span>
            <div className="text-right">
              <div className="font-bold text-on-surface">{admissionFormConfig.signatoryName}</div>
              <div className="text-[11px] text-on-surface-variant">{admissionFormConfig.signatoryTitle}</div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 no-print">
            <button
              type="button"
              onClick={() => setSubmittedSlip(null)}
              className="px-5 py-2.5 rounded-full bg-surface-container-low hover:bg-surface-container text-on-surface text-xs font-semibold border border-outline-variant/40 cursor-pointer"
            >
              Submit Another Application
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-primary-container hover:bg-primary text-on-primary text-xs font-semibold shadow-sm cursor-pointer"
            >
              <span className="material-symbols-outlined text-[18px]">print</span>
              Print Application Slip
            </button>
          </div>
        </section>
      ) : (
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Application Guidelines */}
          <div className="lg:col-span-4 rounded-[2rem] bg-white/75 backdrop-blur-2xl border border-outline-variant/25 p-6 sm:p-8 space-y-5">
            <h2 className="text-lg font-bold text-on-surface">Admission Guidelines</h2>
            <ul className="space-y-3 text-xs text-on-surface-variant leading-relaxed">
              <li className="flex items-start gap-2.5">
                <span className="material-symbols-outlined text-[18px] text-primary-container shrink-0">
                  looks_one
                </span>
                <span>
                  Complete accurate candidate details matching birth certificate and previous transcript records.
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="material-symbols-outlined text-[18px] text-primary-container shrink-0">
                  looks_two
                </span>
                <span>
                  Select your intended NCTB Academic Group (Science, Humanities, Business Studies) for Grade 9–12.
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="material-symbols-outlined text-[18px] text-primary-container shrink-0">
                  looks_3
                </span>
                <span>
                  Retain your generated <span className="font-mono font-semibold text-on-surface">APP-XXXX</span> slip for admission assessment verification.
                </span>
              </li>
            </ul>
            <div className="pt-4 border-t border-outline-variant/20 text-xs">
              <span className="block text-[10px] uppercase tracking-widest text-on-surface-variant font-semibold">
                Authorized Signatory
              </span>
              <span className="font-bold text-on-surface block mt-1">{admissionFormConfig.signatoryName}</span>
              <span className="text-[11px] text-on-surface-variant">{admissionFormConfig.signatoryTitle}</span>
            </div>
          </div>

          {/* Online Application Form */}
          <form
            onSubmit={handleSubmit}
            className="lg:col-span-8 rounded-[2rem] bg-white/85 backdrop-blur-2xl border border-outline-variant/25 shadow-sm p-6 sm:p-8 space-y-5"
          >
            <h2 className="text-xl font-bold text-on-surface border-b border-outline-variant/20 pb-3">
              {admissionFormConfig.heading}
            </h2>

            {formError && (
              <div className="p-3.5 rounded-2xl bg-error-container text-on-error-container text-xs font-medium flex items-center gap-2">
                <span className="material-symbols-outlined text-[18px]">error</span>
                <span>{formError}</span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-on-surface block">
                  Applicant Full Name *
                </label>
                <input
                  type="text"
                  required
                  value={applicantName}
                  onChange={(e) => setApplicantName(e.target.value)}
                  placeholder="e.g. Nusrat Jahan"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-outline-variant/60 bg-surface-container-low text-sm focus:outline-hidden focus:ring-2 focus:ring-primary-container"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-on-surface block">
                  Gender *
                </label>
                <select
                  value={gender}
                  onChange={(e) => setGender(e.target.value as GenderType)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-outline-variant/60 bg-surface-container-low text-sm focus:outline-hidden focus:ring-2 focus:ring-primary-container"
                >
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-on-surface block">
                  Father&apos;s Name *
                </label>
                <input
                  type="text"
                  required
                  value={fatherName}
                  onChange={(e) => setFatherName(e.target.value)}
                  placeholder="Father's full name"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-outline-variant/60 bg-surface-container-low text-sm focus:outline-hidden focus:ring-2 focus:ring-primary-container"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-on-surface block">
                  Mother&apos;s Name
                </label>
                <input
                  type="text"
                  value={motherName}
                  onChange={(e) => setMotherName(e.target.value)}
                  placeholder="Mother's full name"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-outline-variant/60 bg-surface-container-low text-sm focus:outline-hidden focus:ring-2 focus:ring-primary-container"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-on-surface block">
                  Guardian Mobile Number *
                </label>
                <input
                  type="tel"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="e.g. +880 1711-000000"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-outline-variant/60 bg-surface-container-low text-sm font-mono focus:outline-hidden focus:ring-2 focus:ring-primary-container"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-on-surface block">
                  Applying Class *
                </label>
                <select
                  value={selectedClassName}
                  onChange={(e) => {
                    const nextClsName = e.target.value;
                    setGrade(nextClsName);
                    const nextClsObj = academicClasses.find((c) => c.name === nextClsName);
                    const nextGroups =
                      nextClsObj?.hasGroups === false
                        ? (['General'] as AcademicGroup[])
                        : nextClsObj?.groups?.length
                        ? nextClsObj.groups
                        : (['General', 'Science', 'Business Studies', 'Humanities'] as AcademicGroup[]);
                    if (!nextGroups.includes(group)) {
                      setGroup(nextGroups[0]);
                    }
                  }}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-outline-variant/60 bg-surface-container-low text-sm focus:outline-hidden focus:ring-2 focus:ring-primary-container"
                >
                  {classOptions.map((clsName) => (
                    <option key={clsName} value={clsName}>
                      {clsName}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-on-surface block">
                  Academic Group
                </label>
                {selectedClassObj?.hasGroups === false ? (
                  <div className="w-full px-3.5 py-2.5 rounded-xl border border-outline-variant/40 bg-surface-container text-sm font-medium text-on-surface-variant">
                    General (Single Track Class)
                  </div>
                ) : (
                  <select
                    value={effectiveGroup}
                    onChange={(e) => setGroup(e.target.value as AcademicGroup)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-outline-variant/60 bg-surface-container-low text-sm focus:outline-hidden focus:ring-2 focus:ring-primary-container"
                  >
                    {availableGroups.map((grp) => (
                      <option key={grp} value={grp}>
                        {grp}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-on-surface block">
                  Religion / Moral Education Track
                </label>
                <select
                  value={religionGroup}
                  onChange={(e) => setReligionGroup(e.target.value as ReligionGroup)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-outline-variant/60 bg-surface-container-low text-sm focus:outline-hidden focus:ring-2 focus:ring-primary-container"
                >
                  <option value="Islam">Islam</option>
                  <option value="Hinduism">Hinduism</option>
                  <option value="Buddhism">Buddhism</option>
                  <option value="Christianity">Christianity</option>
                </select>
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <label className="text-xs font-semibold text-on-surface block">
                  Previous Examination Score / GPA (Optional)
                </label>
                <input
                  type="text"
                  value={score}
                  onChange={(e) => setScore(e.target.value)}
                  placeholder="e.g. GPA 5.00 or 94/100"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-outline-variant/60 bg-surface-container-low text-sm focus:outline-hidden focus:ring-2 focus:ring-primary-container"
                />
              </div>

              {admissionFormConfig.customFields.map((field) => (
                <div key={field.id} className="space-y-1.5">
                  <label className="text-xs font-semibold text-on-surface block">
                    {field.label} {field.required ? '*' : '(Optional)'}
                  </label>
                  <input
                    type="text"
                    required={field.required}
                    value={customAnswers[field.label] || ''}
                    onChange={(e) =>
                      setCustomAnswers((prev) => ({ ...prev, [field.label]: e.target.value }))
                    }
                    className="w-full px-3.5 py-2.5 rounded-xl border border-outline-variant/60 bg-surface-container-low text-sm focus:outline-hidden focus:ring-2 focus:ring-primary-container"
                  />
                </div>
              ))}
            </div>

            <div className="pt-2">
              <button
                type="submit"
                className="w-full py-3 rounded-full bg-primary-container hover:bg-primary text-on-primary text-sm font-semibold shadow-sm transition-colors cursor-pointer"
              >
                Submit Online Admission Application
              </button>
            </div>
          </form>
        </section>
      )}
    </div>
  );
}

export default function AdmissionsPage() {
  return (
    <PublicShell activePath="/admissions">
      <AdmissionsContent />
    </PublicShell>
  );
}
