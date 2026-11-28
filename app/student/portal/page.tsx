'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Download, Printer, Receipt } from 'lucide-react';
import { useERPStore } from '@/lib/store';
import { ExamResultRecord, Student, StudentInvoice } from '@/lib/types';
import {
  compileStudentExamRecord,
  computeClassAndSectionMeritRanks,
} from '@/lib/grading-engine';
import {
  formatDateDDMMYYYY,
  formatGroupSectionDisplay,
  formatInstituteSessionBanner,
  formatTime12h,
  resolveRoutineDayRow,
  resolveRoutinePeriodForStudent,
} from '@/lib/academic-helpers';
import { generateQrDataUrl } from '@/lib/qr';
import { downloadMarksheetAsPdf, printMarksheetDocument } from '@/lib/marksheet-pdf';
import MediaUploadInput from '@/components/admin/MediaUploadInput';
import MarksheetDocument from '@/components/common/MarksheetDocument';
import DualCopyPaymentReceiptModal from '@/components/common/DualCopyPaymentReceiptModal';

type PaymentGateway = 'bKash' | 'Nagad' | 'Rocket' | 'Bank';

export default function StudentPortalPage() {
  const router = useRouter();
  const { state, isHydrated, authSession, submitStudentUpdateRequest, recordFeePayment, logout } =
    useERPStore();
  const { students, exams, subjects, invoices, cmsConfig, events, classRoutines, instituteRules } =
    state;

  const sessionStudentId =
    authSession && authSession.portal === 'student' ? authSession.userId : null;

  const student =
    isHydrated && sessionStudentId
      ? students.find((s) => s.id === sessionStudentId) || null
      : null;

  const [activeTab, setActiveTab] = useState<
    'transcript' | 'fees' | 'calendar' | 'update-request' | 'security'
  >('transcript');
  const [selectedExamId, setSelectedExamId] = useState<string>('');
  const [qrCodeUrl, setQrCodeUrl] = useState('');
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);
  const transcriptSheetRef = useRef<HTMLDivElement | null>(null);

  // Fee Payment Checkout State (Private inside Student Portal)
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string>('');
  const [feePurpose, setFeePurpose] = useState('November 2024 Tuition Fee');
  const [amount, setAmount] = useState('2400');
  const [gateway, setGateway] = useState<PaymentGateway>('bKash');
  const [trxId, setTrxId] = useState('');
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [receiptInvoice, setReceiptInvoice] = useState<StudentInvoice | null>(null);

  // Update Request Form State (derived defaults from student with user overrides)
  const [reqOverrides, setReqOverrides] = useState<Partial<Student>>({});
  const draftReq = {
    avatarUrl: reqOverrides.avatarUrl ?? student?.avatarUrl ?? '',
    phone: reqOverrides.phone ?? student?.phone ?? '',
    bloodGroup: reqOverrides.bloodGroup ?? student?.bloodGroup ?? '',
    birthRegOrNid: reqOverrides.birthRegOrNid ?? student?.birthRegOrNid ?? '',
    fatherName: reqOverrides.fatherName ?? student?.fatherName ?? '',
    fatherPhone: reqOverrides.fatherPhone ?? student?.fatherPhone ?? '',
    motherName: reqOverrides.motherName ?? student?.motherName ?? '',
    motherPhone: reqOverrides.motherPhone ?? student?.motherPhone ?? '',
    guardianName: reqOverrides.guardianName ?? student?.guardianName ?? '',
    guardianRelation: reqOverrides.guardianRelation ?? student?.guardianRelation ?? '',
    guardianPhone: reqOverrides.guardianPhone ?? student?.guardianPhone ?? '',
    presentAddress:
      reqOverrides.presentAddress ?? student?.presentAddress ?? student?.address ?? '',
    permanentAddress:
      reqOverrides.permanentAddress ?? student?.permanentAddress ?? student?.address ?? '',
  };
  const [requestSuccess, setRequestSuccess] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);

  // Password Change State
  const [currentPasswordInput, setCurrentPasswordInput] = useState('');
  const [newPasswordInput, setNewPasswordInput] = useState('');
  const [confirmPasswordInput, setConfirmPasswordInput] = useState('');
  const [passwordFeedback, setPasswordFeedback] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const publishedExams = exams.filter((e) => e.status === 'Published');
  const availableExams = publishedExams;
  const currentExam =
    availableExams.find((e) => e.id === selectedExamId) || availableExams[0] || null;
  const compiledResult: ExamResultRecord | null = (() => {
    if (!student || !currentExam) return null;
    const savedRecords = currentExam.savedTabulation?.records;
    if (savedRecords && savedRecords.length > 0) {
      return (
        savedRecords.find(
          (r) => r.studentId === student.id || r.systemId === student.systemId
        ) || null
      );
    }

    const combinePairedPapers = instituteRules?.combinePairedPapersInResult ?? true;
    const classPeers = state.students.filter(
      (s) => s.status === 'Active' && s.className === student.className
    );
    if (classPeers.length > 0) {
      const compiledPeers = classPeers.map((peer) =>
        compileStudentExamRecord(peer, currentExam, subjects, state.markEntries, {
          combinePairedPapers,
        })
      );
      const rankedPeers = computeClassAndSectionMeritRanks(compiledPeers);
      const matched = rankedPeers.find((r) => r.studentId === student.id);
      if (matched) return matched;
    }
    return compileStudentExamRecord(student, currentExam, subjects, state.markEntries, {
      combinePairedPapers,
    });
  })();

  useEffect(() => {
    if (isHydrated && !student) {
      router.replace('/student/login');
    }
  }, [isHydrated, student, router]);

  useEffect(() => {
    if (compiledResult && typeof window !== 'undefined') {
      generateQrDataUrl(
        `${window.location.origin}/academics?verify=${compiledResult.id}&sysId=${compiledResult.systemId}`
      ).then(setQrCodeUrl);
    }
  }, [compiledResult?.id, compiledResult?.systemId]);

  if (!isHydrated) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-8 text-center">
        <div className="text-xs font-semibold text-on-surface-variant">
          Verifying student portal session...
        </div>
      </div>
    );
  }

  if (!student) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-8 text-center">
        <div className="max-w-sm w-full bg-white rounded-3xl p-8 shadow-lg border border-outline-variant/30 space-y-4">
          <span className="material-symbols-outlined text-[36px] text-primary-container">lock</span>
          <h1 className="text-lg font-bold text-on-surface">Student Authentication Required</h1>
          <p className="text-xs text-on-surface-variant">
            Fee ledgers, payment receipts, transcripts, and profile updates require an authenticated student session.
          </p>
          <Link
            href="/student/login"
            className="inline-block px-5 py-2.5 bg-primary-container text-on-primary rounded-xl font-bold text-xs"
          >
            Sign In to Student Portal
          </Link>
        </div>
      </div>
    );
  }

  const studentInvoices = invoices.filter((inv) => inv.studentId === student.id);

  const handleSelectUnpaidInvoice = (inv: StudentInvoice) => {
    setSelectedInvoiceId(inv.id);
    setFeePurpose(inv.month);
    const remaining = Math.max(0, inv.totalPayable - inv.paidAmount);
    setAmount(String(remaining > 0 ? remaining : inv.totalPayable));
    setPaymentError(null);
  };

  const handleGenerateDemoTrx = () => {
    const prefix =
      gateway === 'bKash'
        ? 'BK'
        : gateway === 'Nagad'
        ? 'NG'
        : gateway === 'Rocket'
        ? 'RK'
        : 'BNK';
    const randomNum = Math.floor(1000000000 + Math.random() * 9000000000);
    setTrxId(`${prefix}-${randomNum}`);
    setPaymentError(null);
  };

  const handleCompletePayment = (e: React.FormEvent) => {
    e.preventDefault();
    setPaymentError(null);

    const parsedAmount = Number(amount);
    if (Number.isNaN(parsedAmount) || parsedAmount <= 0) {
      setPaymentError('Enter a valid payment amount in BDT.');
      return;
    }
    if (!trxId.trim()) {
      setPaymentError('Please enter your MFS Transaction ID (TrxID) or generate a demo TrxID.');
      return;
    }

    const paidInvoice = recordFeePayment({
      invoiceId: selectedInvoiceId || undefined,
      studentId: student.id,
      month: feePurpose.trim() || 'Tuition Fee',
      amount: parsedAmount,
      method: gateway,
      transactionId: trxId.trim(),
    });

    if (paidInvoice) {
      setReceiptInvoice(paidInvoice);
      setSelectedInvoiceId('');
      setTrxId('');
    }
  };

  const handleUpdateRequestSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setRequestError(null);
    const changes: Partial<Student> = {};
    const checkField = <K extends keyof typeof draftReq>(key: K, currentVal: string | undefined) => {
      const nextVal = (draftReq[key] || '').trim();
      const prevVal = (currentVal || '').trim();
      if (nextVal !== prevVal) {
        (changes as Record<string, string>)[key] = nextVal;
      }
    };

    checkField('avatarUrl', student.avatarUrl);
    checkField('phone', student.phone);
    checkField('bloodGroup', student.bloodGroup);
    checkField('birthRegOrNid', student.birthRegOrNid);
    checkField('fatherName', student.fatherName);
    checkField('fatherPhone', student.fatherPhone);
    checkField('motherName', student.motherName);
    checkField('motherPhone', student.motherPhone);
    checkField('guardianName', student.guardianName);
    checkField('guardianRelation', student.guardianRelation);
    checkField('guardianPhone', student.guardianPhone);
    checkField('presentAddress', student.presentAddress || student.address);
    checkField('permanentAddress', student.permanentAddress || student.address);

    if (changes.avatarUrl && reqOverrides.avatarPublicId) {
      changes.avatarPublicId = reqOverrides.avatarPublicId;
    }

    if (changes.presentAddress) {
      changes.address = changes.presentAddress;
    }

    if (Object.keys(changes).length === 0) {
      setRequestError('Modify at least one field above before submitting an update request.');
      return;
    }

    submitStudentUpdateRequest(student.id, changes);
    setReqOverrides({});
    setRequestSuccess(true);
    setTimeout(() => setRequestSuccess(false), 4000);
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordFeedback(null);

    if (!currentPasswordInput) {
      setPasswordFeedback({ type: 'error', text: 'Current password is required.' });
      return;
    }
    if (newPasswordInput.length < 6) {
      setPasswordFeedback({
        type: 'error',
        text: 'New password must be at least 6 characters long.',
      });
      return;
    }
    if (newPasswordInput !== confirmPasswordInput) {
      setPasswordFeedback({ type: 'error', text: 'New password and confirmation do not match.' });
      return;
    }

    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'erp-client',
        },
        body: JSON.stringify({
          currentPassword: currentPasswordInput,
          newPassword: newPasswordInput,
        }),
      });
      const rawText = await res.text();
      let data: Record<string, unknown> = {};
      if (rawText && !rawText.trim().startsWith('<')) {
        try {
          data = JSON.parse(rawText) as Record<string, unknown>;
        } catch {
          data = {};
        }
      }
      if (!res.ok) {
        setPasswordFeedback({
          type: 'error',
          text: (typeof data.error === 'string' && data.error) || 'Could not update password.',
        });
        return;
      }
      setCurrentPasswordInput('');
      setNewPasswordInput('');
      setConfirmPasswordInput('');
      setPasswordFeedback({
        type: 'success',
        text: 'Portal password updated successfully. Use your new password next sign-in.',
      });
    } catch {
      setPasswordFeedback({ type: 'error', text: 'Network error while updating password.' });
    }
  };

  const handleSignOut = async () => {
    await logout();
    router.push('/student/login');
  };

  return (
    <div className="bg-background font-body-md text-on-surface min-h-screen flex flex-col antialiased">
      {/* Top Navbar */}
      <header className="w-full bg-white/85 backdrop-blur-2xl border-b border-outline-variant/20 px-4 sm:px-8 py-4 flex items-center justify-between shadow-xs no-print">
        <div className="flex items-center gap-3 min-w-0">
          <img
            src={cmsConfig.crestUrl}
            alt="Crest"
            className="h-8 w-auto object-contain shrink-0"
            referrerPolicy="no-referrer"
          />
          <div className="flex flex-col min-w-0">
            <span className="font-headline-sm text-sm font-bold leading-none truncate">
              {cmsConfig.schoolName}
            </span>
            <span className="text-[11px] text-primary-container font-semibold uppercase tracking-wider mt-0.5">
              Private Student Portal
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3 sm:gap-4 shrink-0">
          <div className="flex items-center gap-2.5">
            <img
              src={student.avatarUrl}
              alt={student.fullName}
              className="w-8 h-8 rounded-full object-cover"
              referrerPolicy="no-referrer"
            />
            <div className="hidden sm:flex flex-col text-right">
              <span className="text-xs font-bold leading-tight">{student.fullName}</span>
              <span className="text-[10px] text-on-surface-variant font-mono">
                {student.systemId} &bull;{' '}
                {student.status === 'Alumni' || student.status === 'Graduated'
                  ? `${student.graduatedWing || 'Graduated'} Alumni ${student.graduatedYear || ''}`
                  : `Roll #${student.rollNumber}`}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={handleSignOut}
            className="px-3 py-1.5 rounded-xl bg-red-50 hover:bg-red-100 text-red-700 text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer"
          >
            <span className="material-symbols-outlined text-[16px]">logout</span>
            <span className="hidden sm:inline">Sign Out</span>
          </button>
        </div>
      </header>

      {/* Navigation Sub-bar */}
      <div className="max-w-7xl mx-auto w-full px-4 sm:px-8 pt-6 no-print">
        <div className="flex flex-wrap items-center gap-2 p-1.5 rounded-2xl bg-surface-container-low border border-outline-variant/30 w-fit">
          <button
            type="button"
            onClick={() => setActiveTab('transcript')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'transcript'
                ? 'bg-primary-container text-on-primary shadow-xs'
                : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            Academic Transcript
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('fees')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'fees'
                ? 'bg-primary-container text-on-primary shadow-xs'
                : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            Fee Ledger &amp; Payment Receipt
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('calendar')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'calendar'
                ? 'bg-primary-container text-on-primary shadow-xs'
                : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            Routine &amp; Calendar
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('update-request')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'update-request'
                ? 'bg-primary-container text-on-primary shadow-xs'
                : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            Profile Update
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('security')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'security'
                ? 'bg-primary-container text-on-primary shadow-xs'
                : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            Change Password
          </button>
        </div>
      </div>

      {/* Main Workspace */}
      <main
        className={`max-w-7xl mx-auto w-full px-4 sm:px-8 py-6 flex-1 space-y-6 ${
          activeTab === 'transcript' ? 'marksheet-print-scroll' : ''
        }`}
      >
        {/* TAB 1: ACADEMIC TRANSCRIPT */}
        {activeTab === 'transcript' && !compiledResult && (
          <div className="rounded-3xl bg-white/80 p-8 text-center border border-outline-variant/20 text-xs text-on-surface-variant">
            No examination transcript available yet for {student.fullName}.
          </div>
        )}

        {activeTab === 'transcript' && compiledResult && currentExam && (
          <div className="space-y-6 marksheet-print-host">
            <div className="flex flex-wrap items-center justify-between gap-3 no-print">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-on-surface-variant">Examination:</span>
                <select
                  value={currentExam.id}
                  onChange={(e) => setSelectedExamId(e.target.value)}
                  className="px-3.5 py-2 rounded-xl bg-white border border-outline-variant/40 text-xs font-bold text-on-surface"
                >
                  {availableExams.map((ex) => (
                    <option key={ex.id} value={ex.id}>
                      {ex.title} ({ex.academicYear})
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={isDownloadingPdf}
                  onClick={async () => {
                    if (!transcriptSheetRef.current) return;
                    setIsDownloadingPdf(true);
                    try {
                      await downloadMarksheetAsPdf(
                        transcriptSheetRef.current,
                        `Marksheet_${compiledResult.systemId}_${compiledResult.examTitle}`
                      );
                    } finally {
                      setIsDownloadingPdf(false);
                    }
                  }}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary-container text-on-primary text-xs font-bold shadow-md hover:bg-primary disabled:opacity-60 cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  <span>{isDownloadingPdf ? 'Generating PDF...' : 'Download A4 PDF'}</span>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    printMarksheetDocument(
                      `Marksheet - ${compiledResult.studentName} (${compiledResult.systemId})`
                    )
                  }
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-surface-container-lowest border border-outline-variant/40 text-on-surface hover:bg-surface-container-low text-xs font-bold shadow-xs cursor-pointer"
                >
                  <Printer className="w-4 h-4" />
                  <span>Print Official Marksheet</span>
                </button>
              </div>
            </div>

            <div className="flex justify-center overflow-x-auto pb-2 marksheet-print-scroll">
              <MarksheetDocument
                sheetRef={transcriptSheetRef}
                result={compiledResult}
                exam={currentExam}
                student={student}
                cmsConfig={cmsConfig}
                qrCodeDataUrl={qrCodeUrl}
              />
            </div>
          </div>
        )}

        {/* TAB 2: PRIVATE FEE LEDGER, MFS CHECKOUT & PAYMENT RECEIPT */}
        {activeTab === 'fees' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Personal Invoices Table */}
            <div className="lg:col-span-7 rounded-3xl bg-surface-container-lowest/85 backdrop-blur-2xl p-6 shadow-sm space-y-5 border border-outline-variant/20 no-print">
              <div>
                <h2 className="font-title-lg text-lg font-bold text-on-surface">
                  Personal Fee Ledger &amp; Receipts
                </h2>
                <p className="text-xs text-on-surface-variant">
                  Confidential account ledger for {student.fullName} ({student.systemId}).
                </p>
              </div>

              {studentInvoices.length === 0 ? (
                <div className="p-6 rounded-2xl bg-surface-container-low text-xs text-on-surface-variant">
                  No fee invoices generated yet. Use the MFS payment panel to settle advance tuition or exam fees.
                </div>
              ) : (
                <div className="space-y-3">
                  {studentInvoices.map((inv) => (
                    <div
                      key={inv.id}
                      className="p-4 rounded-2xl bg-surface-container-low/60 border border-outline-variant/25 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-xs text-primary-container">
                            {inv.invoiceNo}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                              inv.status === 'Paid'
                                ? 'bg-emerald-100 text-emerald-900'
                                : inv.status === 'Partial'
                                ? 'bg-amber-100 text-amber-900'
                                : 'bg-red-100 text-red-900'
                            }`}
                          >
                            {inv.status}
                          </span>
                        </div>
                        <div className="text-sm font-semibold text-on-surface">{inv.month}</div>
                        {inv.transactionId && (
                          <div className="text-[11px] font-mono text-on-surface-variant">
                            {inv.paymentMethod} &bull; TrxID: {inv.transactionId} ({formatDateDDMMYYYY(inv.paymentDate)})
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        <div className="text-right font-mono">
                          <div className="text-sm font-bold text-on-surface">
                            BDT {inv.totalPayable.toLocaleString()}
                          </div>
                          <div className="text-[11px] text-emerald-800">
                            Paid: BDT {inv.paidAmount.toLocaleString()}
                          </div>
                        </div>

                        {inv.status === 'Paid' ? (
                          <button
                            type="button"
                            onClick={() => setReceiptInvoice(inv)}
                            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-white hover:bg-surface-container text-on-surface text-xs font-semibold border border-outline-variant/40 cursor-pointer"
                          >
                            <Receipt className="w-3.5 h-3.5" />
                            Dual Receipt
                          </button>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => setReceiptInvoice(inv)}
                              className="px-2.5 py-1.5 rounded-full bg-white hover:bg-surface-container text-on-surface text-xs font-semibold border border-outline-variant/40 cursor-pointer"
                            >
                              Slip
                            </button>
                            <button
                              type="button"
                              onClick={() => handleSelectUnpaidInvoice(inv)}
                              className="px-4 py-1.5 rounded-full bg-primary-container hover:bg-primary text-on-primary text-xs font-semibold cursor-pointer"
                            >
                              Pay Now
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* MFS Fee Checkout Form */}
            <form
              onSubmit={handleCompletePayment}
              className="lg:col-span-5 rounded-3xl bg-surface-container-lowest/90 backdrop-blur-2xl p-6 shadow-sm space-y-4 border border-outline-variant/20 no-print"
            >
              <div className="flex items-center justify-between border-b border-outline-variant/20 pb-3">
                <div>
                  <h3 className="text-base font-bold text-on-surface">Pay Fees (bKash / Nagad / Rocket)</h3>
                  <p className="text-[11px] text-on-surface-variant">
                    {selectedInvoiceId
                      ? 'Settling selected pending invoice'
                      : 'Pay monthly tuition or examination fee'}
                  </p>
                </div>
                {selectedInvoiceId && (
                  <button
                    type="button"
                    onClick={() => setSelectedInvoiceId('')}
                    className="text-xs text-primary-container font-semibold hover:underline cursor-pointer"
                  >
                    Clear
                  </button>
                )}
              </div>

              {paymentError && (
                <div className="p-3 rounded-xl bg-error-container text-on-error-container text-xs font-medium">
                  {paymentError}
                </div>
              )}

              <div className="space-y-1">
                <label className="text-xs font-semibold text-on-surface block">Fee Purpose / Month *</label>
                <input
                  type="text"
                  required
                  value={feePurpose}
                  onChange={(e) => setFeePurpose(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-outline-variant/40 bg-surface-container-low text-xs font-medium"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-on-surface block">Amount (BDT) *</label>
                <input
                  type="number"
                  min={1}
                  required
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-outline-variant/40 bg-surface-container-low text-sm font-mono font-bold"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-on-surface block">Payment Method *</label>
                <div className="grid grid-cols-4 gap-2">
                  {(['bKash', 'Nagad', 'Rocket', 'Bank'] as const).map((method) => (
                    <button
                      key={method}
                      type="button"
                      onClick={() => setGateway(method)}
                      className={`py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                        gateway === method
                          ? 'bg-primary-container text-on-primary border-primary-container'
                          : 'bg-surface-container-low text-on-surface border-outline-variant/40'
                      }`}
                    >
                      {method}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-on-surface">
                    {gateway} Transaction ID (TrxID) *
                  </label>
                  <button
                    type="button"
                    onClick={handleGenerateDemoTrx}
                    className="text-[11px] text-primary-container font-semibold hover:underline cursor-pointer"
                  >
                    Generate Demo TrxID
                  </button>
                </div>
                <input
                  type="text"
                  required
                  value={trxId}
                  onChange={(e) => setTrxId(e.target.value)}
                  placeholder="e.g. BK-9920194821"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-outline-variant/40 bg-surface-container-low text-xs font-mono"
                />
              </div>

              <button
                type="submit"
                className="w-full py-3 rounded-xl bg-primary-container hover:bg-primary text-on-primary text-xs font-bold shadow-sm transition-colors cursor-pointer"
              >
                Confirm Payment &amp; Issue Receipt
              </button>
            </form>
          </div>
        )}

        {/* TAB 2B: MY WEEKLY ROUTINE & ACADEMIC CALENDAR */}
        {activeTab === 'calendar' && (
          <div className="space-y-6">
            <div className="rounded-3xl bg-surface-container-lowest/85 backdrop-blur-2xl p-6 shadow-sm space-y-4 border border-outline-variant/20">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="font-title-lg text-lg font-bold text-on-surface">
                    My Weekly Class Routine ({student.className} &bull;{' '}
                    {formatGroupSectionDisplay(student.group, student.sectionName)} &bull;{' '}
                    {student.shift} Shift)
                  </h2>
                  <p className="text-xs text-on-surface-variant">
                    Working days: {(instituteRules?.workingDays || ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday']).join(', ')}
                  </p>
                </div>
              </div>

              <div className="overflow-x-auto rounded-2xl border border-outline-variant/25">
                <table className="w-full text-left border-collapse text-xs bg-white">
                  <thead>
                    <tr className="bg-surface-container-low text-on-surface font-bold border-b border-outline-variant/25">
                      <th className="p-3">Day</th>
                      {(instituteRules?.shiftPeriodTemplates?.[student.shift] || []).map((slot) => (
                        <th key={slot.id} className="p-3">
                          <div>{slot.isBreak ? slot.label || 'Tiffin' : slot.period}</div>
                          <div className="text-[10px] font-mono font-normal text-on-surface-variant tabular-nums">
                            {formatTime12h(slot.startTime)}–{formatTime12h(slot.endTime)}
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant/15">
                    {(instituteRules?.workingDays || ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday']).map(
                      (dayName) => {
                        const dayRow = resolveRoutineDayRow(
                          classRoutines,
                          student.className,
                          student.group,
                          student.sectionName,
                          student.shift,
                          dayName
                        );
                        const slots = instituteRules?.shiftPeriodTemplates?.[student.shift] || [];
                        return (
                          <tr key={dayName}>
                            <td className="p-3 font-bold text-primary-container">{dayName}</td>
                            {slots.map((slot, idx) => {
                              const rawPeriod = dayRow?.periods[idx];
                              if (slot.isBreak || rawPeriod?.isBreak) {
                                return (
                                  <td
                                    key={slot.id}
                                    className="p-3 bg-amber-50/50 text-amber-900 font-semibold text-center"
                                  >
                                    {slot.label || rawPeriod?.subjectName || 'Break'}
                                  </td>
                                );
                              }
                              const period = resolveRoutinePeriodForStudent(
                                rawPeriod,
                                student,
                                subjects
                              );
                              return (
                                <td key={slot.id} className="p-3">
                                  {period ? (
                                    <div>
                                      <div className="font-semibold text-on-surface">
                                        {period.subjectName}
                                      </div>
                                      {period.teacherName && (
                                        <div className="text-[11px] text-on-surface-variant">
                                          {period.teacherName}
                                        </div>
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
                      }
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Examination Schedule & Routine for Student's Class */}
            {exams.some((ex) =>
              (ex.examRoutine || []).some(
                (slot) =>
                  slot.className === student.className &&
                  (!slot.sectionName ||
                    slot.sectionName === 'Common' ||
                    slot.sectionName === student.sectionName)
              )
            ) && (
              <div className="rounded-3xl bg-surface-container-lowest/85 backdrop-blur-2xl p-6 shadow-sm space-y-4 border border-outline-variant/20">
                <div>
                  <h2 className="font-title-lg text-lg font-bold text-on-surface">
                    Examination Routine ({student.className} &bull;{' '}
                    {formatGroupSectionDisplay(student.group, student.sectionName)})
                  </h2>
                  <p className="text-xs text-on-surface-variant">
                    Live examination schedule, exam dates, rooms, and assigned paper details.
                  </p>
                </div>
                <div className="space-y-4">
                  {exams
                    .filter((ex) =>
                      (ex.examRoutine || []).some(
                        (slot) =>
                          slot.className === student.className &&
                          (!slot.sectionName ||
                            slot.sectionName === 'Common' ||
                            slot.sectionName === student.sectionName)
                      )
                    )
                    .map((ex) => {
                      const matchingSlots = (ex.examRoutine || []).filter(
                        (slot) =>
                          slot.className === student.className &&
                          (!slot.sectionName ||
                            slot.sectionName === 'Common' ||
                            slot.sectionName === student.sectionName)
                      );
                      return (
                        <div key={ex.id} className="space-y-2">
                          <div className="text-xs font-bold text-primary-container">{ex.title}</div>
                          <div className="overflow-x-auto rounded-2xl border border-outline-variant/25">
                            <table className="w-full text-left border-collapse text-xs bg-white">
                              <thead>
                                <tr className="bg-surface-container-low text-on-surface-variant border-b border-outline-variant/20">
                                  <th className="p-2.5 font-semibold">Date &amp; Time</th>
                                  <th className="p-2.5 font-semibold">Subject</th>
                                  <th className="p-2.5 font-semibold">Section</th>
                                  <th className="p-2.5 font-semibold">Room</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-outline-variant/15">
                                {matchingSlots.map((slot) => (
                                  <tr key={slot.id}>
                                    <td className="p-2.5 font-mono tabular-nums">
                                      <span className="font-bold text-on-surface block">
                                        {formatDateDDMMYYYY(slot.date)}
                                      </span>
                                      <span className="text-[10px] text-on-surface-variant">{slot.time}</span>
                                    </td>
                                    <td className="p-2.5 font-semibold text-on-surface">
                                      {slot.subjectName}
                                    </td>
                                    <td className="p-2.5 text-on-surface-variant">
                                      {slot.sectionName && slot.sectionName !== 'Common'
                                        ? `Section ${slot.sectionName}`
                                        : 'All Sections'}
                                    </td>
                                    <td className="p-2.5 text-on-surface-variant">{slot.room || '—'}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            )}

            <div className="rounded-3xl bg-surface-container-lowest/85 backdrop-blur-2xl p-6 shadow-sm space-y-4 border border-outline-variant/20">
              <div>
                <h2 className="font-title-lg text-lg font-bold text-on-surface">
                  Institute Academic Calendar ({formatInstituteSessionBanner(instituteRules)})
                </h2>
                <p className="text-xs text-on-surface-variant">
                  Holidays, examination dates, class schedules, and student notices.
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {events
                  .filter((ev) => ev.visibility !== 'Admin Only')
                  .sort((a, b) => (a.startDate || a.id).localeCompare(b.startDate || b.id))
                  .map((ev) => (
                    <div
                      key={ev.id}
                      className="p-4 rounded-2xl bg-white border border-outline-variant/25 space-y-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="px-2.5 py-1 rounded-xl bg-primary-container/10 text-primary-container text-xs font-bold">
                          {ev.day} {ev.month}
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <span className="px-2 py-0.5 rounded-full bg-surface-container text-[10px] font-bold uppercase text-on-surface-variant">
                            {ev.category || ev.type}
                          </span>
                          {ev.targetWing && ev.targetWing !== 'All' && (
                            <span className="px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-900 border border-indigo-200 text-[10px] font-bold">
                              {ev.targetWing}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="font-bold text-xs text-on-surface">{ev.title}</div>
                      {ev.description && (
                        <p className="text-[11px] text-on-surface-variant">{ev.description}</p>
                      )}
                      <div className="text-[10px] font-mono text-on-surface-variant pt-1">
                        {ev.startDate && ev.endDate && ev.startDate !== ev.endDate
                          ? `${formatDateDDMMYYYY(ev.startDate)} to ${formatDateDDMMYYYY(ev.endDate)}`
                          : ev.startDate
                          ? formatDateDDMMYYYY(ev.startDate)
                          : ev.time}{' '}
                        &bull; {ev.location}
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: PROFILE UPDATE REQUEST */}
        {activeTab === 'update-request' && (
          <div className="rounded-3xl bg-surface-container-lowest/85 backdrop-blur-2xl p-6 sm:p-8 shadow-sm space-y-6 max-w-3xl mx-auto border border-outline-variant/20">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-outline-variant/15 pb-4">
              <div>
                <h2 className="font-title-lg text-lg font-bold text-on-surface">
                  Student Profile Update Request
                </h2>
                <p className="text-xs text-on-surface-variant">
                  Propose updates to your photo, mobile phone, blood group, parent/guardian details, or residential addresses. Changes apply to the register after Admin verification.
                </p>
              </div>
              {student.updateRequestStatus && (
                <span
                  className={`px-3 py-1 rounded-full text-[11px] font-bold w-fit shrink-0 ${
                    student.updateRequestStatus === 'Pending'
                      ? 'bg-amber-100 text-amber-900'
                      : student.updateRequestStatus === 'Approved'
                      ? 'bg-emerald-100 text-emerald-900'
                      : 'bg-red-100 text-red-900'
                  }`}
                >
                  Last Request: {student.updateRequestStatus}
                </span>
              )}
            </div>

            {student.updateRequestStatus === 'Rejected' && student.updateRequestRejectionReason && (
              <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-900 text-xs flex items-start gap-2">
                <span className="material-symbols-outlined text-[18px] shrink-0">info</span>
                <div>
                  <strong>Admin Rejection Note:</strong> {student.updateRequestRejectionReason}
                </div>
              </div>
            )}

            {requestSuccess && (
              <div className="p-3.5 rounded-xl bg-emerald-500/10 text-emerald-800 border border-emerald-500/20 text-xs font-semibold flex items-center gap-2">
                <span className="material-symbols-outlined text-[18px]">verified</span>
                <span>Profile update request submitted! Waiting for Admin review in Student Register.</span>
              </div>
            )}

            {requestError && (
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs font-semibold">
                {requestError}
              </div>
            )}

            {/* Read-only Locked Registrar Fields */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 rounded-2xl bg-surface-container-low/70 border border-outline-variant/20 text-xs">
              <div>
                <span className="text-on-surface-variant block text-[10px]">Student Name</span>
                <strong className="text-on-surface">{student.fullName}</strong>
              </div>
              <div>
                <span className="text-on-surface-variant block text-[10px]">System ID · Roll</span>
                <strong className="font-mono text-on-surface">{student.systemId} · #{student.rollNumber}</strong>
              </div>
              <div>
                <span className="text-on-surface-variant block text-[10px]">Class &amp; Group</span>
                <strong className="text-on-surface">{student.className} ({student.group})</strong>
              </div>
              <div>
                <span className="text-on-surface-variant block text-[10px]">Board Reg No.</span>
                <strong className="font-mono text-on-surface">{student.registrationNumber}</strong>
              </div>
            </div>

            <form onSubmit={handleUpdateRequestSubmit} className="space-y-5 text-xs">
              <MediaUploadInput
                label="Passport Photograph"
                value={draftReq.avatarUrl}
                onChange={(url) => setReqOverrides({ ...reqOverrides, avatarUrl: url })}
                onChangeMedia={({ url, publicId }) =>
                  setReqOverrides({ ...reqOverrides, avatarUrl: url, avatarPublicId: publicId })
                }
                folder="erp/students-pending"
                previewShape="square"
                buttonLabel="Upload New Photo"
              />

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block font-semibold text-on-surface-variant uppercase mb-1">
                    Primary Mobile Phone
                  </label>
                  <input
                    type="text"
                    value={draftReq.phone}
                    onChange={(e) => setReqOverrides({ ...reqOverrides, phone: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 text-sm font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-on-surface-variant uppercase mb-1">
                    Blood Group
                  </label>
                  <select
                    value={draftReq.bloodGroup}
                    onChange={(e) => setReqOverrides({ ...reqOverrides, bloodGroup: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 text-sm"
                  >
                    <option value="">Select...</option>
                    {['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'].map((bg) => (
                      <option key={bg} value={bg}>{bg}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-on-surface-variant uppercase mb-1">
                    Birth Reg / NID No.
                  </label>
                  <input
                    type="text"
                    value={draftReq.birthRegOrNid}
                    onChange={(e) =>
                      setReqOverrides({ ...reqOverrides, birthRegOrNid: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 text-sm font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-semibold text-on-surface-variant uppercase mb-1">
                    Father&apos;s Name
                  </label>
                  <input
                    type="text"
                    value={draftReq.fatherName}
                    onChange={(e) =>
                      setReqOverrides({ ...reqOverrides, fatherName: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 text-sm"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-on-surface-variant uppercase mb-1">
                    Father&apos;s Mobile
                  </label>
                  <input
                    type="text"
                    value={draftReq.fatherPhone}
                    onChange={(e) =>
                      setReqOverrides({ ...reqOverrides, fatherPhone: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 text-sm font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-on-surface-variant uppercase mb-1">
                    Mother&apos;s Name
                  </label>
                  <input
                    type="text"
                    value={draftReq.motherName}
                    onChange={(e) =>
                      setReqOverrides({ ...reqOverrides, motherName: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 text-sm"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-on-surface-variant uppercase mb-1">
                    Mother&apos;s Mobile
                  </label>
                  <input
                    type="text"
                    value={draftReq.motherPhone}
                    onChange={(e) =>
                      setReqOverrides({ ...reqOverrides, motherPhone: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 text-sm font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block font-semibold text-on-surface-variant uppercase mb-1">
                    Local Guardian Name
                  </label>
                  <input
                    type="text"
                    value={draftReq.guardianName}
                    onChange={(e) =>
                      setReqOverrides({ ...reqOverrides, guardianName: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 text-sm"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-on-surface-variant uppercase mb-1">
                    Relation
                  </label>
                  <input
                    type="text"
                    value={draftReq.guardianRelation}
                    onChange={(e) =>
                      setReqOverrides({ ...reqOverrides, guardianRelation: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 text-sm"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-on-surface-variant uppercase mb-1">
                    Guardian Phone
                  </label>
                  <input
                    type="text"
                    value={draftReq.guardianPhone}
                    onChange={(e) =>
                      setReqOverrides({ ...reqOverrides, guardianPhone: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 text-sm font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-semibold text-on-surface-variant uppercase mb-1">
                    Present Residential Address
                  </label>
                  <textarea
                    rows={2}
                    value={draftReq.presentAddress}
                    onChange={(e) =>
                      setReqOverrides({ ...reqOverrides, presentAddress: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 text-sm"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-on-surface-variant uppercase mb-1">
                    Permanent Address
                  </label>
                  <textarea
                    rows={2}
                    value={draftReq.permanentAddress}
                    onChange={(e) =>
                      setReqOverrides({ ...reqOverrides, permanentAddress: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 text-sm"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-3 rounded-xl bg-primary-container hover:bg-primary text-on-primary font-bold text-xs shadow-md transition-all cursor-pointer"
              >
                Submit Update Request for Admin Approval
              </button>
            </form>
          </div>
        )}

        {/* TAB 4: CHANGE PORTAL PASSWORD */}
        {activeTab === 'security' && (
          <div className="rounded-3xl bg-surface-container-lowest/85 backdrop-blur-2xl p-8 shadow-sm space-y-6 max-w-xl mx-auto border border-outline-variant/20">
            <div>
              <h2 className="font-title-lg text-lg font-bold text-on-surface">
                Student Portal Security &amp; Password
              </h2>
              <p className="text-xs text-on-surface-variant">
                Protect your private marksheets, fee ledgers, and profile update requests.
              </p>
            </div>

            {passwordFeedback && (
              <div
                className={`p-3 rounded-xl text-xs font-semibold flex items-center gap-2 ${
                  passwordFeedback.type === 'success'
                    ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                    : 'bg-error-container/50 text-on-error-container'
                }`}
              >
                <span className="material-symbols-outlined text-[18px]">
                  {passwordFeedback.type === 'success' ? 'verified' : 'error'}
                </span>
                <span>{passwordFeedback.text}</span>
              </div>
            )}

            <form onSubmit={handleChangePassword} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-on-surface-variant uppercase mb-1">
                  Current Password *
                </label>
                <input
                  type="password"
                  required
                  value={currentPasswordInput}
                  onChange={(e) => setCurrentPasswordInput(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-surface-container-low border border-outline-variant/30 text-sm"
                />
              </div>

              <div>
                <label className="block font-semibold text-on-surface-variant uppercase mb-1">
                  New Password (min 6 characters) *
                </label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={newPasswordInput}
                  onChange={(e) => setNewPasswordInput(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-surface-container-low border border-outline-variant/30 text-sm"
                />
              </div>

              <div>
                <label className="block font-semibold text-on-surface-variant uppercase mb-1">
                  Confirm New Password *
                </label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={confirmPasswordInput}
                  onChange={(e) => setConfirmPasswordInput(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-surface-container-low border border-outline-variant/30 text-sm"
                />
              </div>

              <button
                type="submit"
                className="w-full py-3 rounded-xl bg-primary-container hover:bg-primary text-on-primary font-bold text-xs shadow-md transition-all cursor-pointer"
              >
                Update Portal Password
              </button>
            </form>
          </div>
        )}
      </main>

      {/* SINGLE-PAGE A4 DUAL-COPY MONEY RECEIPT MODAL */}
      {receiptInvoice && (
        <DualCopyPaymentReceiptModal
          cmsConfig={cmsConfig}
          invoice={receiptInvoice}
          onClose={() => setReceiptInvoice(null)}
        />
      )}
    </div>
  );
}
