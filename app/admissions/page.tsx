'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  ArrowRight,
  CalendarX2,
  CheckCircle2,
  FileSearch,
  FileText,
  GraduationCap,
  Printer,
  Receipt,
  Search,
  UserCheck,
  UserPlus,
} from 'lucide-react';
import { useERPStore } from '@/lib/store';
import {
  AdmissionApplication,
  AdmissionFeeItem,
  Student,
  StudentInvoice,
  StudentReAdmissionState,
} from '@/lib/types';
import {
  classMatchesEnabledWings,
  formatGroupSectionDisplay,
  formatInstituteSessionBanner,
} from '@/lib/academic-helpers';
import { autoFormatDDMMYYYYInput, parseDDMMYYYYToISO } from '@/lib/student-schema';
import PublicShell from '@/components/public/PublicShell';
import StudentSchemaAdmissionForm from '@/components/common/StudentSchemaAdmissionForm';
import AdmissionApplicationSlipModal from '@/components/common/AdmissionApplicationSlipModal';
import DualCopyPaymentReceiptModal from '@/components/common/DualCopyPaymentReceiptModal';

interface ReAdmissionLookupResponse {
  eligible: boolean;
  error?: string;
  studentSummary?: {
    fullName: string;
    className: string;
    rollNumber: number;
    academicYear: string;
  };
  reAdmissionState?: StudentReAdmissionState;
  prefill?: Partial<Student> & { id: string; systemId: string };
  intake?: {
    open: boolean;
    feeAmount: number;
    feeBreakdown: AdmissionFeeItem[];
    academicYear: string;
  };
  existingApplication?: AdmissionApplication | null;
  existingInvoice?: StudentInvoice | null;
}

function AdmissionsContent() {
  const { state, refreshFromServer } = useERPStore();
  const {
    cmsConfig,
    admissionFormConfig,
    academicClasses,
    subjects,
    instituteRules,
    mfsConfig,
  } = state;

  const wingFilteredClasses = academicClasses.filter((c) =>
    classMatchesEnabledWings(c, instituteRules)
  );
  const effectiveClasses = wingFilteredClasses.length > 0 ? wingFilteredClasses : academicClasses;
  const openNewClasses = effectiveClasses.filter((c) => c.openForNewAdmission !== false);

  const [portalMode, setPortalMode] = useState<'new' | 're-admission' | 'track'>('new');

  // Re-admission lookup state
  const [prevYear, setPrevYear] = useState(
    instituteRules?.activeAcademicYear || String(new Date().getFullYear())
  );
  const [prevClass, setPrevClass] = useState(effectiveClasses[0]?.name || 'Class 6');
  const [prevRoll, setPrevRoll] = useState('');
  const [verifyBy, setVerifyBy] = useState<'dob' | 'systemId'>('dob');
  const [verifyDob, setVerifyDob] = useState('');
  const [verifySystemId, setVerifySystemId] = useState('');
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [lookupResult, setLookupResult] = useState<ReAdmissionLookupResponse | null>(null);
  const [showReAdmissionForm, setShowReAdmissionForm] = useState(false);

  // Track application lookup state
  const [trackCode, setTrackCode] = useState('');
  const [trackPhone, setTrackPhone] = useState('');
  const [trackDob, setTrackDob] = useState('');
  const [trackLoading, setTrackLoading] = useState(false);
  const [trackError, setTrackError] = useState<string | null>(null);
  const [trackedResult, setTrackedResult] = useState<{
    application: AdmissionApplication;
    invoice: StudentInvoice | null;
  } | null>(null);

  // Slip & Dual Receipt print modals
  const [slipModal, setSlipModal] = useState<{
    application: AdmissionApplication;
    invoice: StudentInvoice | null;
  } | null>(null);
  const [receiptModal, setReceiptModal] = useState<{
    application: AdmissionApplication;
    invoice: StudentInvoice | null;
  } | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (typeof window === 'undefined') return;
      const params = new URLSearchParams(window.location.search);
      const code = params.get('code');
      const mode = params.get('mode');
      if (code) {
        setPortalMode('track');
        setTrackCode(code.toUpperCase());
      } else if (mode === 're-admission') {
        setPortalMode('re-admission');
      }
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  const handleReAdmissionLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLookupError(null);
    setLookupResult(null);
    setShowReAdmissionForm(false);

    if (!prevClass || !prevRoll.trim()) {
      setLookupError('Enter your Previous Class and Previous Roll Number.');
      return;
    }

    let dobIso = '';
    if (verifyBy === 'dob') {
      dobIso = parseDDMMYYYYToISO(verifyDob) || verifyDob.trim();
      if (!dobIso) {
        setLookupError('Enter Date of Birth in DD/MM/YYYY format.');
        return;
      }
    } else if (!verifySystemId.trim()) {
      setLookupError('Enter your Student System ID.');
      return;
    }

    setLookupLoading(true);
    try {
      const res = await fetch('/api/admissions/re-admission-lookup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'erp-client',
        },
        body: JSON.stringify({
          previousYear: prevYear.trim(),
          previousClass: prevClass,
          previousRoll: Number(prevRoll),
          ...(verifyBy === 'dob' ? { dateOfBirth: dobIso } : { systemId: verifySystemId.trim() }),
        }),
      });
      const json = (await res.json()) as ReAdmissionLookupResponse;
      if (!res.ok) {
        setLookupError(json.error || 'Unable to verify student record.');
        return;
      }
      setLookupResult(json);
    } catch (err) {
      setLookupError(err instanceof Error ? err.message : 'Lookup network error.');
    } finally {
      setLookupLoading(false);
    }
  };

  const handleTrackLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    setTrackError(null);
    setTrackedResult(null);

    if (!trackCode.trim()) {
      setTrackError('Enter your Application Code (e.g. APP-8901).');
      return;
    }
    if (!trackPhone.trim() && !trackDob.trim()) {
      setTrackError('Provide either your Registered Mobile Number OR Date of Birth.');
      return;
    }

    const dobIso = trackDob.trim() ? parseDDMMYYYYToISO(trackDob) || trackDob.trim() : '';

    setTrackLoading(true);
    try {
      const res = await fetch('/api/admissions/track', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'erp-client',
        },
        body: JSON.stringify({
          applicationCode: trackCode.trim().toUpperCase(),
          phone: trackPhone.trim() || undefined,
          dateOfBirth: dobIso || undefined,
        }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        application?: AdmissionApplication;
        invoice?: StudentInvoice | null;
      };
      if (!res.ok || !json.ok || !json.application) {
        setTrackError(json.error || 'Could not locate matching admission record.');
        return;
      }
      setTrackedResult({
        application: json.application,
        invoice: json.invoice || null,
      });
    } catch (err) {
      setTrackError(err instanceof Error ? err.message : 'Unable to track application.');
    } finally {
      setTrackLoading(false);
    }
  };

  return (
    <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 py-8 sm:py-10 space-y-8">
      {/* Portal Hero Banner */}
      <section className="rounded-3xl bg-white/85 backdrop-blur-2xl border border-outline-variant/25 shadow-sm p-6 sm:p-8 no-print">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-2.5 max-w-2xl">
            <span
              className={`inline-flex items-center gap-2 px-3 py-1 rounded-lg text-xs font-bold border ${
                cmsConfig.isAdmissionOpen
                  ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
                  : 'bg-amber-50 text-amber-900 border-amber-200'
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  cmsConfig.isAdmissionOpen ? 'bg-emerald-600' : 'bg-amber-600'
                }`}
              />
              {cmsConfig.isAdmissionOpen
                ? `${formatInstituteSessionBanner(instituteRules)} — Admissions & Re-Admissions Live`
                : 'New Intake Window Paused · Re-Admission & Slip Lookup Available'}
            </span>

            <h1 className="font-display-lg text-2xl sm:text-4xl font-bold text-on-surface tracking-tight">
              {admissionFormConfig.heading || 'Online Admission & Re-Admission Portal'}
            </h1>
            <p className="text-xs sm:text-sm text-on-surface-variant leading-relaxed">
              {admissionFormConfig.instructions}
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-surface-container-low border border-outline-variant/25 text-xs space-y-1 shrink-0 min-w-[230px]">
            <div className="font-bold text-on-surface">Admissions &amp; Accounts Desk</div>
            <div className="font-mono text-on-surface-variant">{cmsConfig.phone}</div>
            <div className="text-on-surface-variant">{cmsConfig.email}</div>
            <div className="pt-1.5 border-t border-outline-variant/20 text-[11px] text-on-surface-variant">
              Signatory: <strong className="text-on-surface">{admissionFormConfig.signatoryName}</strong>
            </div>
          </div>
        </div>

        {/* 3-Mode Selector */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-6 pt-5 border-t border-outline-variant/20">
          <button
            type="button"
            onClick={() => setPortalMode('new')}
            className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer flex items-center gap-3 ${
              portalMode === 'new'
                ? 'bg-primary-container text-on-primary border-primary-container shadow-xs'
                : 'bg-surface-container-low/70 border-outline-variant/30 text-on-surface hover:bg-surface-container-low'
            }`}
          >
            <UserPlus className="w-5 h-5 shrink-0" />
            <div>
              <div className="text-xs font-bold">New Admission</div>
              <div className={`text-[11px] ${portalMode === 'new' ? 'text-on-primary/80' : 'text-on-surface-variant'}`}>
                Apply to any open class with full form
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setPortalMode('re-admission')}
            className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer flex items-center gap-3 ${
              portalMode === 're-admission'
                ? 'bg-primary-container text-on-primary border-primary-container shadow-xs'
                : 'bg-surface-container-low/70 border-outline-variant/30 text-on-surface hover:bg-surface-container-low'
            }`}
          >
            <UserCheck className="w-5 h-5 shrink-0" />
            <div>
              <div className="text-xs font-bold">Re-admission (Promoted)</div>
              <div className={`text-[11px] ${portalMode === 're-admission' ? 'text-on-primary/80' : 'text-on-surface-variant'}`}>
                Previous roll lookup &amp; upper class enroll
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setPortalMode('track')}
            className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer flex items-center gap-3 ${
              portalMode === 'track'
                ? 'bg-primary-container text-on-primary border-primary-container shadow-xs'
                : 'bg-surface-container-low/70 border-outline-variant/30 text-on-surface hover:bg-surface-container-low'
            }`}
          >
            <FileSearch className="w-5 h-5 shrink-0" />
            <div>
              <div className="text-xs font-bold">Track &amp; Print Slip / Receipt</div>
              <div className={`text-[11px] ${portalMode === 'track' ? 'text-on-primary/80' : 'text-on-surface-variant'}`}>
                Reprint A4 form &amp; Dual-Copy receipt
              </div>
            </div>
          </button>
        </div>
      </section>

      {/* MODE 1: NEW ADMISSION */}
      {portalMode === 'new' && (
        <section className="space-y-6 no-print">
          {!cmsConfig.isAdmissionOpen ? (
            <div className="rounded-3xl bg-white border border-outline-variant/25 p-10 text-center space-y-4">
              <div className="w-14 h-14 rounded-2xl bg-amber-100 text-amber-800 flex items-center justify-center mx-auto">
                <CalendarX2 className="w-7 h-7" />
              </div>
              <h2 className="text-xl font-bold text-on-surface">
                New Student Admission Intake Is Currently Paused
              </h2>
              <p className="text-sm text-on-surface-variant max-w-xl mx-auto">
                Online new admission applications are currently paused between academic intake windows. Existing promoted students may use the{' '}
                <strong>Re-admission (Promoted)</strong> tab above.
              </p>
              <div className="pt-2">
                <Link
                  href="/notices"
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary-container text-on-primary text-xs font-bold"
                >
                  View Admission Circulars
                </Link>
              </div>
            </div>
          ) : (
            <>
              {/* Class Availability & Fee Strip */}
              <div className="rounded-2xl bg-white border border-outline-variant/25 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-bold text-on-surface flex items-center gap-2">
                    <GraduationCap className="w-4 h-4 text-primary-container" />
                    Open Classes &amp; Admission Fee Schedule
                  </div>
                  <span className="text-[11px] font-semibold text-on-surface-variant">
                    {openNewClasses.length} / {effectiveClasses.length} classes open
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 text-xs">
                  {effectiveClasses.map((cls) => {
                    const isOpen = cls.openForNewAdmission !== false;
                    const fee = cls.newAdmissionFee ?? cls.admissionFee ?? 0;
                    return (
                      <div
                        key={cls.id}
                        className={`p-2.5 rounded-xl border ${
                          isOpen
                            ? 'bg-surface-container-low border-outline-variant/25'
                            : 'bg-surface-container/50 border-outline-variant/20 opacity-60'
                        }`}
                      >
                        <div className="font-bold text-on-surface truncate">{cls.name}</div>
                        <div className="flex items-center justify-between mt-1 text-[11px]">
                          <span className={isOpen ? 'text-emerald-800 font-semibold' : 'text-on-surface-variant'}>
                            {isOpen ? 'Open' : 'Closed'}
                          </span>
                          <span className="font-mono font-bold tabular-nums">
                            {fee > 0 ? `৳${fee.toLocaleString()}` : '৳0'}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Unified Full Student Schema Form */}
              <StudentSchemaAdmissionForm
                mode="new"
                actor="public"
                academicClasses={effectiveClasses}
                subjects={subjects}
                instituteRules={instituteRules}
                admissionFormConfig={admissionFormConfig}
                mfsConfig={mfsConfig}
                onSuccess={(res) => {
                  void refreshFromServer();
                  setSlipModal({
                    application: res.application,
                    invoice: res.invoice,
                  });
                }}
              />
            </>
          )}
        </section>
      )}

      {/* MODE 2: RE-ADMISSION (PROMOTED STUDENTS) */}
      {portalMode === 're-admission' && (
        <section className="space-y-6 no-print">
          {/* Step 1: Verified Promoted Student Lookup */}
          <form
            onSubmit={handleReAdmissionLookup}
            className="rounded-3xl bg-white border border-outline-variant/25 p-6 sm:p-8 space-y-5 shadow-xs"
          >
            <div className="border-b border-outline-variant/20 pb-3">
              <h2 className="text-lg font-bold text-on-surface flex items-center gap-2">
                <UserCheck className="w-5 h-5 text-primary-container" />
                Promoted Student Verification &amp; Re-Admission Lookup
              </h2>
              <p className="text-xs text-on-surface-variant mt-0.5">
                Enter your previous Academic Year, Previous Class, and Previous Roll Number along with Date of Birth or Student ID to check promotion eligibility and load your pre-filled Re-admission form.
              </p>
            </div>

            {lookupError && (
              <div className="p-3.5 rounded-xl bg-error-container border border-error/30 text-on-error-container text-xs font-semibold flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{lookupError}</span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5 text-xs items-end">
              <div>
                <label className="block font-semibold text-on-surface mb-1">
                  Previous Academic Year *
                </label>
                <input
                  type="text"
                  required
                  value={prevYear}
                  onChange={(e) => setPrevYear(e.target.value)}
                  placeholder="e.g. 2026"
                  className="w-full px-3 py-2.5 rounded-xl bg-surface-container-low border border-outline-variant/40 text-sm font-mono font-bold tabular-nums"
                />
              </div>

              <div>
                <label className="block font-semibold text-on-surface mb-1">Previous Class *</label>
                <select
                  value={prevClass}
                  onChange={(e) => setPrevClass(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl bg-surface-container-low border border-outline-variant/40 text-sm font-semibold"
                >
                  {effectiveClasses.map((c) => (
                    <option key={c.id} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-on-surface mb-1">Previous Roll No. *</label>
                <input
                  type="number"
                  min={1}
                  required
                  value={prevRoll}
                  onChange={(e) => setPrevRoll(e.target.value)}
                  placeholder="e.g. 1"
                  className="w-full px-3 py-2.5 rounded-xl bg-surface-container-low border border-outline-variant/40 text-sm font-mono font-bold tabular-nums"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="font-semibold text-on-surface">
                    {verifyBy === 'dob' ? 'Date of Birth *' : 'Student System ID *'}
                  </label>
                  <button
                    type="button"
                    onClick={() => setVerifyBy(verifyBy === 'dob' ? 'systemId' : 'dob')}
                    className="text-[11px] font-bold text-primary-container hover:underline cursor-pointer"
                  >
                    Use {verifyBy === 'dob' ? 'Student ID' : 'DOB'}
                  </button>
                </div>
                {verifyBy === 'dob' ? (
                  <input
                    type="text"
                    required
                    value={verifyDob}
                    onChange={(e) => setVerifyDob(autoFormatDDMMYYYYInput(e.target.value))}
                    placeholder="DD/MM/YYYY"
                    className="w-full px-3 py-2.5 rounded-xl bg-surface-container-low border border-outline-variant/40 text-sm font-mono tabular-nums"
                  />
                ) : (
                  <input
                    type="text"
                    required
                    value={verifySystemId}
                    onChange={(e) => setVerifySystemId(e.target.value.toUpperCase())}
                    placeholder="e.g. AG260001"
                    className="w-full px-3 py-2.5 rounded-xl bg-surface-container-low border border-outline-variant/40 text-sm font-mono uppercase"
                  />
                )}
              </div>

              <div>
                <button
                  type="submit"
                  disabled={lookupLoading}
                  className="w-full py-2.5 px-4 rounded-xl bg-primary-container hover:bg-primary disabled:opacity-50 text-on-primary text-xs font-bold inline-flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Search className="w-4 h-4" />
                  {lookupLoading ? 'Checking...' : 'Check Promotion'}
                </button>
              </div>
            </div>
          </form>

          {/* Lookup Result Panel */}
          {lookupResult && !lookupResult.eligible && (
            <div className="rounded-2xl bg-amber-50 border border-amber-200 p-6 space-y-2 text-xs text-amber-950">
              <div className="font-bold text-sm">
                Promotion Not Queued for Re-Admission Yet
              </div>
              <p>
                Student <strong>{lookupResult.studentSummary?.fullName}</strong> (Class{' '}
                <strong>{lookupResult.studentSummary?.className}</strong>, Roll{' '}
                <strong className="font-mono">#{lookupResult.studentSummary?.rollNumber}</strong>) is not currently marked as{' '}
                <strong>Pending Re-admission</strong>. {lookupResult.error}
              </p>
            </div>
          )}

          {lookupResult?.eligible && lookupResult.reAdmissionState && lookupResult.prefill && (
            <div className="rounded-3xl bg-white border border-emerald-200 p-6 space-y-4 shadow-xs text-xs">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg bg-emerald-100 text-emerald-900 font-bold text-[11px]">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    {lookupResult.reAdmissionState.status}
                  </span>
                  <h3 className="text-lg font-bold text-on-surface">
                    {lookupResult.prefill.fullName}{' '}
                    <span className="font-mono text-xs text-on-surface-variant">
                      ({lookupResult.prefill.systemId})
                    </span>
                  </h3>
                  <div className="flex flex-wrap items-center gap-2 text-on-surface-variant">
                    <span>
                      {lookupResult.reAdmissionState.sourceAcademicYear} &bull;{' '}
                      <strong>{lookupResult.reAdmissionState.sourceClassName}</strong> (Roll #
                      {lookupResult.reAdmissionState.sourceRollNumber})
                    </span>
                    <ArrowRight className="w-4 h-4 text-emerald-700" />
                    <span className="text-emerald-900 font-bold">
                      {lookupResult.reAdmissionState.targetAcademicYear} &bull;{' '}
                      {lookupResult.reAdmissionState.targetClassName} (
                      {formatGroupSectionDisplay(
                        lookupResult.reAdmissionState.targetGroup,
                        lookupResult.reAdmissionState.targetSectionName
                      )}
                      ) &bull; New Roll #{lookupResult.reAdmissionState.targetRollNumber}
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                  <div className="px-4 py-2 rounded-xl bg-surface-container-low border border-outline-variant/25 text-right">
                    <span className="text-[10px] uppercase tracking-wider text-on-surface-variant block">
                      Re-admission Fee
                    </span>
                    <span className="text-base font-bold font-mono tabular-nums text-primary-container">
                      {lookupResult.intake && lookupResult.intake.feeAmount > 0
                        ? `৳${lookupResult.intake.feeAmount.toLocaleString()}`
                        : 'Waived / Free'}
                    </span>
                  </div>

                  {lookupResult.reAdmissionState.status === 'Pending Re-admission' &&
                    lookupResult.intake?.open !== false && (
                      <button
                        type="button"
                        onClick={() => setShowReAdmissionForm(true)}
                        className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-primary-container hover:bg-primary text-on-primary text-xs font-bold shadow-sm cursor-pointer"
                      >
                        <UserCheck className="w-4 h-4" />
                        Re-admission to {lookupResult.reAdmissionState.targetClassName}
                      </button>
                    )}

                  {lookupResult.existingApplication && (
                    <>
                      <button
                        type="button"
                        onClick={() =>
                          setSlipModal({
                            application: lookupResult.existingApplication!,
                            invoice: lookupResult.existingInvoice || null,
                          })
                        }
                        className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-secondary text-on-secondary text-xs font-bold cursor-pointer"
                      >
                        <Printer className="w-4 h-4" />
                        Print Re-admission Slip
                      </button>
                      {(lookupResult.existingInvoice ||
                        (lookupResult.existingApplication.paymentSummary?.feeAmount || 0) > 0) && (
                        <button
                          type="button"
                          onClick={() =>
                            setReceiptModal({
                              application: lookupResult.existingApplication!,
                              invoice: lookupResult.existingInvoice || null,
                            })
                          }
                          className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-surface-container hover:bg-surface-container-high text-on-surface text-xs font-bold cursor-pointer"
                        >
                          <Receipt className="w-4 h-4" />
                          Dual-Copy Receipt
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>

              {lookupResult.intake?.open === false && (
                <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 font-semibold">
                  Online Re-admission window for {lookupResult.reAdmissionState.targetClassName} is currently closed. Please visit the Institute Office.
                </div>
              )}
            </div>
          )}

          {/* Step 2: Pre-Filled Unified Re-Admission Form */}
          {showReAdmissionForm &&
            lookupResult?.eligible &&
            lookupResult.prefill &&
            lookupResult.reAdmissionState && (
              <div className="space-y-3">
                <div className="flex items-center justify-between px-2">
                  <h3 className="text-base font-bold text-on-surface">
                    Complete Re-Admission Form ({lookupResult.reAdmissionState.targetAcademicYear})
                  </h3>
                  <button
                    type="button"
                    onClick={() => setShowReAdmissionForm(false)}
                    className="text-xs font-semibold text-on-surface-variant hover:text-on-surface cursor-pointer"
                  >
                    Hide Form
                  </button>
                </div>

                <StudentSchemaAdmissionForm
                  mode="re-admission"
                  actor="public"
                  academicClasses={effectiveClasses}
                  subjects={subjects}
                  instituteRules={instituteRules}
                  admissionFormConfig={admissionFormConfig}
                  mfsConfig={mfsConfig}
                  prefillStudent={lookupResult.prefill}
                  reAdmissionContext={lookupResult.reAdmissionState}
                  linkedStudentId={lookupResult.prefill.id}
                  onSuccess={(res) => {
                    void refreshFromServer();
                    setShowReAdmissionForm(false);
                    setLookupResult((prev) =>
                      prev
                        ? {
                            ...prev,
                            reAdmissionState: {
                              ...prev.reAdmissionState!,
                              status: 'Submitted',
                              applicationId: res.application.id,
                            },
                            existingApplication: res.application,
                            existingInvoice: res.invoice,
                          }
                        : null
                    );
                    setSlipModal({
                      application: res.application,
                      invoice: res.invoice,
                    });
                  }}
                />
              </div>
            )}
        </section>
      )}

      {/* MODE 3: TRACK & PRINT SLIP / DUAL RECEIPT */}
      {portalMode === 'track' && (
        <section className="space-y-6 no-print">
          <form
            onSubmit={handleTrackLookup}
            className="rounded-3xl bg-white border border-outline-variant/25 p-6 sm:p-8 space-y-5 shadow-xs"
          >
            <div className="border-b border-outline-variant/20 pb-3">
              <h2 className="text-lg font-bold text-on-surface flex items-center gap-2">
                <FileSearch className="w-5 h-5 text-primary-container" />
                Track Application &amp; Reprint Official Slips
              </h2>
              <p className="text-xs text-on-surface-variant mt-0.5">
                Enter your Application Code (e.g. APP-8901) along with your registered Mobile Number or Date of Birth to print your Application Form or Half-and-Half Dual-Copy Money Receipt.
              </p>
            </div>

            {trackError && (
              <div className="p-3.5 rounded-xl bg-error-container border border-error/30 text-on-error-container text-xs font-semibold flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{trackError}</span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 text-xs items-end">
              <div>
                <label className="block font-semibold text-on-surface mb-1">
                  Application Code *
                </label>
                <input
                  type="text"
                  required
                  value={trackCode}
                  onChange={(e) => setTrackCode(e.target.value.toUpperCase())}
                  placeholder="e.g. APP-8901"
                  className="w-full px-3 py-2.5 rounded-xl bg-surface-container-low border border-outline-variant/40 text-sm font-mono font-bold uppercase"
                />
              </div>

              <div>
                <label className="block font-semibold text-on-surface mb-1">
                  Registered Mobile
                </label>
                <input
                  type="tel"
                  value={trackPhone}
                  onChange={(e) => setTrackPhone(e.target.value)}
                  placeholder="01XXXXXXXXX"
                  className="w-full px-3 py-2.5 rounded-xl bg-surface-container-low border border-outline-variant/40 text-sm font-mono tabular-nums"
                />
              </div>

              <div>
                <label className="block font-semibold text-on-surface mb-1">
                  Or Date of Birth
                </label>
                <input
                  type="text"
                  value={trackDob}
                  onChange={(e) => setTrackDob(autoFormatDDMMYYYYInput(e.target.value))}
                  placeholder="DD/MM/YYYY"
                  className="w-full px-3 py-2.5 rounded-xl bg-surface-container-low border border-outline-variant/40 text-sm font-mono tabular-nums"
                />
              </div>

              <div>
                <button
                  type="submit"
                  disabled={trackLoading}
                  className="w-full py-2.5 px-4 rounded-xl bg-primary-container hover:bg-primary disabled:opacity-50 text-on-primary text-xs font-bold inline-flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Search className="w-4 h-4" />
                  {trackLoading ? 'Locating...' : 'Find Application'}
                </button>
              </div>
            </div>
          </form>

          {trackedResult && (
            <div className="rounded-3xl bg-white border border-outline-variant/25 p-6 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xs text-xs">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono font-bold text-primary-container text-sm">
                    {trackedResult.application.applicationCode}
                  </span>
                  <span className="px-2 py-0.5 rounded bg-surface-container font-bold">
                    {trackedResult.application.applicationType === 're-admission'
                      ? 'Re-admission'
                      : 'New Admission'}
                  </span>
                  <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-900 font-bold border border-emerald-200">
                    {trackedResult.application.status}
                  </span>
                </div>
                <h3 className="text-base font-bold text-on-surface">
                  {trackedResult.application.applicantName}
                </h3>
                <p className="text-on-surface-variant">
                  Class: <strong>{trackedResult.application.assignedClass || trackedResult.application.grade}</strong>{' '}
                  &bull; Year:{' '}
                  <strong className="font-mono">
                    {trackedResult.application.targetAcademicYear || 'Current'}
                  </strong>{' '}
                  &bull; Payment:{' '}
                  <strong>
                    {trackedResult.invoice?.status ||
                      trackedResult.application.paymentSummary?.paymentStatus ||
                      'Recorded'}
                  </strong>
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setSlipModal(trackedResult)}
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-primary-container hover:bg-primary text-on-primary text-xs font-bold cursor-pointer"
                >
                  <FileText className="w-4 h-4" />
                  Print A4 Slip
                </button>
                {(trackedResult.invoice ||
                  (trackedResult.application.paymentSummary?.feeAmount || 0) > 0) && (
                  <button
                    type="button"
                    onClick={() => setReceiptModal(trackedResult)}
                    className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-secondary hover:bg-secondary/90 text-on-secondary text-xs font-bold cursor-pointer"
                  >
                    <Receipt className="w-4 h-4" />
                    Print Dual-Copy Receipt
                  </button>
                )}
              </div>
            </div>
          )}
        </section>
      )}

      {/* A4 APPLICATION SLIP MODAL */}
      {slipModal && (
        <AdmissionApplicationSlipModal
          cmsConfig={cmsConfig}
          admissionFormConfig={admissionFormConfig}
          application={slipModal.application}
          invoice={slipModal.invoice}
          onClose={() => setSlipModal(null)}
          onOpenReceipt={() => {
            setReceiptModal(slipModal);
            setSlipModal(null);
          }}
        />
      )}

      {/* DUAL-COPY A4 RECEIPT MODAL */}
      {receiptModal && (
        <DualCopyPaymentReceiptModal
          cmsConfig={cmsConfig}
          invoice={receiptModal.invoice}
          application={receiptModal.application}
          onClose={() => setReceiptModal(null)}
          onViewSlip={() => {
            setSlipModal(receiptModal);
            setReceiptModal(null);
          }}
        />
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
