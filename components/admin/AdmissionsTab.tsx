'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  CheckCircle2,
  CreditCard,
  Download,
  ExternalLink,
  FileText,
  GraduationCap,
  Plus,
  Printer,
  Receipt,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  Sliders,
  Trash2,
  Upload,
  UserCheck,
  UserPlus,
  X,
} from 'lucide-react';
import { useERPStore } from '@/lib/store';
import {
  formatGroupSectionDisplay,
  getEffectiveSectionsForClassGroup,
  isSingleBatchCohort,
} from '@/lib/academic-helpers';
import {
  AcademicClass,
  AcademicGroup,
  AdmissionApplication,
  AdmissionFeeItem,
  GenderType,
  ReligionGroup,
  ShiftType,
  Student,
  StudentInvoice,
} from '@/lib/types';
import {
  getNextStudentSystemIdFromStudents,
  resolveAcademicYearDigits,
} from '@/lib/student-schema';
import StudentSchemaAdmissionForm from '@/components/common/StudentSchemaAdmissionForm';
import AdmissionApplicationSlipModal from '@/components/common/AdmissionApplicationSlipModal';
import DualCopyPaymentReceiptModal from '@/components/common/DualCopyPaymentReceiptModal';

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

interface MfsCapabilitiesState {
  bkashLive: boolean;
  nagadLive: boolean;
  rocketLive: boolean;
  smsLive: boolean;
  anyLiveGateway: boolean;
}

export default function AdmissionsTab() {
  const { isHydrated } = useERPStore();
  return <AdmissionsTabInner key={isHydrated ? 'hydrated' : 'ssr'} />;
}

function AdmissionsTabInner() {
  const {
    state,
    refreshFromServer,
    updateAdmissionStatus,
    updateAdmissionApplication,
    deleteAdmissionApplication,
    bulkImportAdmissions,
    admitApplicantToClass,
    updateAdmissionFormConfig,
    updateClassIntakeConfig,
    verifyAdmissionPaymentAndFinalize,
  } = useERPStore();
  const {
    admissions,
    academicClasses,
    admissionFormConfig,
    students,
    subjects,
    instituteRules,
    cmsConfig,
    mfsConfig,
    invoices,
  } = state;

  const [subTab, setSubTab] = useState<'re-admission' | 'queue' | 'intake' | 'form-design'>(
    're-admission'
  );
  const [admissionFilter, setAdmissionFilter] = useState<
    'all' | 'Approved' | 'Under Review' | 'Pending' | 'Admitted'
  >('all');
  const [reAdmissionFilter, setReAdmissionFilter] = useState<
    'all' | 'Pending Re-admission' | 'Submitted' | 'Completed'
  >('all');
  const [reAdmissionSearch, setReAdmissionSearch] = useState('');
  const [queueSearch, setQueueSearch] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);

  // Active modals
  const [editingApp, setEditingApp] = useState<AdmissionApplication | null>(null);
  const [reAdmissionStudent, setReAdmissionStudent] = useState<Student | null>(null);
  const [showWalkInModal, setShowWalkInModal] = useState(false);
  const [slipModal, setSlipModal] = useState<{
    application: AdmissionApplication;
    invoice?: StudentInvoice | null;
  } | null>(null);
  const [receiptModal, setReceiptModal] = useState<{
    application?: AdmissionApplication | null;
    invoice?: StudentInvoice | null;
  } | null>(null);
  const [verifyingAppId, setVerifyingAppId] = useState<string | null>(null);

  // Direct admit-to-class modal
  const [admittingApp, setAdmittingApp] = useState<AdmissionApplication | null>(null);
  const [targetClass, setTargetClass] = useState(academicClasses[0]?.name || 'Class 6');
  const [targetSection, setTargetSection] = useState(academicClasses[0]?.sections[0] || 'Common');
  const [targetShift, setTargetShift] = useState<ShiftType>('Morning');
  const [targetGroup, setTargetGroup] = useState<AcademicGroup>('General');
  const [targetRoll, setTargetRoll] = useState(students.length + 1);
  const [targetStudentId, setTargetStudentId] = useState('');
  const [admitError, setAdmitError] = useState<string | null>(null);

  // Class intake draft state
  const [intakeDrafts, setIntakeDrafts] = useState<Record<string, Partial<AcademicClass>>>({});
  const [savingIntakeId, setSavingIntakeId] = useState<string | null>(null);
  const [mfsCaps, setMfsCaps] = useState<MfsCapabilitiesState | null>(null);

  useEffect(() => {
    fetch('/api/payments/mfs', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { ok?: boolean; capabilities?: MfsCapabilitiesState } | null) => {
        if (data?.ok && data.capabilities) {
          setMfsCaps(data.capabilities);
        }
      })
      .catch(() => undefined);
  }, []);

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

  const showToast = (msg: string) => {
    setFeedback(msg);
    setTimeout(() => setFeedback(null), 4000);
  };

  const getNextRollForClassSection = (clsName: string, secName: string) => {
    const rolls = students
      .filter((s) => s.className === clsName && s.sectionName === secName)
      .map((s) => s.rollNumber);
    return Math.max(0, ...rolls) + 1;
  };

  // Promoted & Re-admission cohort detection
  const promotedCohortStudents = useMemo(() => {
    return students
      .filter((s) => Boolean(s.reAdmissionState && s.reAdmissionState.status !== 'None'))
      .sort((a, b) => {
        const order: Record<string, number> = {
          'Pending Re-admission': 0,
          Submitted: 1,
          Completed: 2,
        };
        const aRank = order[a.reAdmissionState?.status || 'Completed'] ?? 3;
        const bRank = order[b.reAdmissionState?.status || 'Completed'] ?? 3;
        if (aRank !== bRank) return aRank - bRank;
        return (a.reAdmissionState?.targetRollNumber || a.rollNumber) - (b.reAdmissionState?.targetRollNumber || b.rollNumber);
      });
  }, [students]);

  const filteredPromotedCohort = useMemo(() => {
    const q = reAdmissionSearch.trim().toLowerCase();
    return promotedCohortStudents.filter((s) => {
      const matchesStatus =
        reAdmissionFilter === 'all' ? true : s.reAdmissionState?.status === reAdmissionFilter;
      if (!matchesStatus) return false;
      if (!q) return true;
      return (
        s.fullName.toLowerCase().includes(q) ||
        s.systemId.toLowerCase().includes(q) ||
        (s.phone || '').toLowerCase().includes(q) ||
        String(s.reAdmissionState?.sourceRollNumber || s.rollNumber).includes(q) ||
        String(s.reAdmissionState?.targetClassName || '').toLowerCase().includes(q)
      );
    });
  }, [promotedCohortStudents, reAdmissionFilter, reAdmissionSearch]);

  const pendingReAdmissionCount = promotedCohortStudents.filter(
    (s) => s.reAdmissionState?.status === 'Pending Re-admission'
  ).length;
  const submittedReAdmissionCount = promotedCohortStudents.filter(
    (s) => s.reAdmissionState?.status === 'Submitted'
  ).length;
  const completedReAdmissionCount = promotedCohortStudents.filter(
    (s) => s.reAdmissionState?.status === 'Completed'
  ).length;
  const pendingVerificationCount = admissions.filter(
    (a) => a.paymentSummary?.paymentStatus === 'Pending Verification'
  ).length;

  const newAdmissions = useMemo(() => {
    const q = queueSearch.trim().toLowerCase();
    return admissions.filter((a) => {
      const matchesStatus = admissionFilter === 'all' ? true : a.status === admissionFilter;
      if (!matchesStatus) return false;
      if (!q) return true;
      return (
        a.applicantName.toLowerCase().includes(q) ||
        a.applicationCode.toLowerCase().includes(q) ||
        (a.phone || '').toLowerCase().includes(q) ||
        a.grade.toLowerCase().includes(q) ||
        (a.paymentSummary?.trxId || '').toLowerCase().includes(q)
      );
    });
  }, [admissions, admissionFilter, queueSearch]);

  const findAppAndInvoiceForStudent = (stu: Student) => {
    const app =
      (stu.reAdmissionState?.applicationId
        ? admissions.find((a) => a.id === stu.reAdmissionState?.applicationId)
        : undefined) ||
      admissions.find((a) => a.linkedStudentId === stu.id && a.applicationType === 're-admission');
    const inv = app
      ? (app.paymentSummary?.invoiceId
          ? invoices.find((i) => i.id === app.paymentSummary?.invoiceId)
          : undefined) || invoices.find((i) => i.applicationId === app.id)
      : undefined;
    return { app: app || null, inv: inv || null };
  };

  const findInvoiceForApp = (app: AdmissionApplication): StudentInvoice | null => {
    return (
      (app.paymentSummary?.invoiceId
        ? invoices.find((i) => i.id === app.paymentSummary?.invoiceId)
        : undefined) ||
      invoices.find((i) => i.applicationId === app.id) ||
      null
    );
  };

  const handleVerifyMfsAndFinalize = async (app: AdmissionApplication) => {
    setVerifyingAppId(app.id);
    try {
      const res = await verifyAdmissionPaymentAndFinalize({
        applicationId: app.id,
        markPaid: true,
        paymentChannel: app.paymentSummary?.paymentChannel || 'Cash',
        trxId: app.paymentSummary?.trxId,
      });
      if (!res.ok) {
        showToast(res.error || 'Failed to verify payment.');
        return;
      }
      const payload = res.data as
        | { application?: AdmissionApplication; invoice?: StudentInvoice | null }
        | undefined;
      showToast(
        `Verified payment & settled billing ledger for ${app.applicantName} (${app.applicationCode}).`
      );
      if (payload?.application || payload?.invoice) {
        setReceiptModal({
          application: payload.application || app,
          invoice: payload.invoice || findInvoiceForApp(app),
        });
      }
    } finally {
      setVerifyingAppId(null);
    }
  };

  const handleDownloadApplicantTemplate = () => {
    const csv = [
      'applicantName,gender,fatherName,motherName,phone,grade,group,religionGroup,score',
      'Nafisa Tabassum,Female,Kamrul Hasan,Salma Begum,01711223344,Class 9,Science,Islam,94/100',
      'Arnob Chakraborty,Male,Subir Chakraborty,Mita Chakraborty,01811223344,Class 10,Science,Hinduism,91/100',
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
          grade: cols[5] || academicClasses[0]?.name || 'Class 6',
          group: (cols[6] as AcademicGroup) || 'General',
          religionGroup: (cols[7] as ReligionGroup) || 'Islam',
          score: cols[8] || 'Awaiting Assessment',
        };
      });
      const count = bulkImportAdmissions(imported);
      showToast(`Imported ${count} applicant record(s) from CSV sheet.`);
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
          `Student ID "${trimmedCustomId}" is already assigned. Choose a unique ID or leave blank to auto-generate.`
        );
        return;
      }
    }

    const rollTaken = students.some(
      (s) =>
        s.status === 'Active' &&
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
        `${enrolled.fullName} admitted to ${targetClass} (${formatGroupSectionDisplay(
          targetGroup,
          targetSection
        )}) with Roll #${targetRoll} & ID ${enrolled.systemId}.`
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
    showToast('Admission form layout, custom fields, and signatories saved.');
  };

  const getDraftForClass = (cls: AcademicClass): AcademicClass => {
    const patch = intakeDrafts[cls.id] || {};
    return {
      ...cls,
      openForNewAdmission: patch.openForNewAdmission ?? cls.openForNewAdmission ?? true,
      openForReAdmission: patch.openForReAdmission ?? cls.openForReAdmission ?? true,
      newAdmissionFee:
        patch.newAdmissionFee ?? cls.newAdmissionFee ?? cls.admissionFee ?? 0,
      reAdmissionFee:
        patch.reAdmissionFee ?? cls.reAdmissionFee ?? cls.admissionFee ?? 0,
      admissionSeatLimit: patch.admissionSeatLimit ?? cls.admissionSeatLimit ?? 0,
      intakeYear: patch.intakeYear ?? cls.intakeYear ?? String(activeAcademicYear),
      admissionFeeBreakdown:
        patch.admissionFeeBreakdown ?? cls.admissionFeeBreakdown ?? [],
    };
  };

  const updateClassDraft = (clsId: string, updater: (prev: Partial<AcademicClass>) => Partial<AcademicClass>) => {
    setIntakeDrafts((prev) => ({
      ...prev,
      [clsId]: updater(prev[clsId] || {}),
    }));
  };

  const handleSaveClassIntake = async (cls: AcademicClass) => {
    const merged = getDraftForClass(cls);
    setSavingIntakeId(cls.id);
    try {
      const res = await updateClassIntakeConfig(cls.id, {
        openForNewAdmission: merged.openForNewAdmission,
        openForReAdmission: merged.openForReAdmission,
        newAdmissionFee: Number(merged.newAdmissionFee || 0),
        reAdmissionFee: Number(merged.reAdmissionFee || 0),
        admissionSeatLimit: Number(merged.admissionSeatLimit || 0),
        intakeYear: merged.intakeYear,
        admissionFeeBreakdown: (merged.admissionFeeBreakdown || []).filter(
          (i) => i.label.trim() !== ''
        ),
      });
      if (res.ok) {
        showToast(`Saved intake & fee rules for ${cls.name}.`);
      } else {
        showToast(res.error || `Failed to save ${cls.name} intake rules.`);
      }
    } finally {
      setSavingIntakeId(null);
    }
  };

  return (
    <div className="flex flex-col w-full space-y-6">
      {/* Header & Navigation */}
      <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-4 no-print">
        <div>
          <span className="text-[11px] uppercase tracking-wider text-primary-container font-semibold">
            Admissions Desk &amp; Academic Year Promotion Enrollment
          </span>
          <h1 className="font-headline-lg text-headline-lg text-on-surface tracking-tight font-bold">
            Admission &amp; Re-Admission Dashboard
          </h1>
          <p className="text-xs sm:text-sm text-on-surface-variant mt-0.5">
            Detect promoted students awaiting Re-admission, manage New Admission applicants, configure per-class fees &amp; MFS billing sync, and print Dual-Copy A4 receipts.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void refreshFromServer()}
            className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-surface-container-low hover:bg-surface-container border border-outline-variant/25 text-xs font-semibold cursor-pointer"
            title="Sync latest applicants and re-admissions from database"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Sync
          </button>

          <Link
            href="/admissions"
            target="_blank"
            className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-surface-container-low hover:bg-surface-container border border-outline-variant/25 text-xs font-semibold text-on-surface"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Public Portal
          </Link>

          <button
            type="button"
            onClick={() => setShowWalkInModal(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-primary-container hover:bg-primary text-on-primary text-xs font-bold shadow-xs cursor-pointer"
          >
            <UserPlus className="w-4 h-4" />
            + New Walk-in Admission
          </button>
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 no-print">
        <div className="p-4 rounded-2xl bg-surface-container-lowest border border-outline-variant/25">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant">
            Pending Re-admission
          </div>
          <div className="text-2xl font-bold font-mono tabular-nums text-emerald-800 mt-1">
            {pendingReAdmissionCount}
          </div>
          <div className="text-[11px] text-on-surface-variant mt-0.5">
            Promoted cohort awaiting enrollment
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-surface-container-lowest border border-outline-variant/25">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant">
            Re-admissions Submitted / Done
          </div>
          <div className="text-2xl font-bold font-mono tabular-nums text-primary-container mt-1">
            {submittedReAdmissionCount} / {completedReAdmissionCount}
          </div>
          <div className="text-[11px] text-on-surface-variant mt-0.5">
            {promotedCohortStudents.length} total promoted tracked
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-surface-container-lowest border border-outline-variant/25">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant">
            Applicant Queue
          </div>
          <div className="text-2xl font-bold font-mono tabular-nums text-on-surface mt-1">
            {admissions.length}
          </div>
          <div className="text-[11px] text-on-surface-variant mt-0.5">
            {admissions.filter((a) => a.status !== 'Admitted').length} active candidates
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-surface-container-lowest border border-outline-variant/25">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant">
            MFS Verification Needed
          </div>
          <div className="text-2xl font-bold font-mono tabular-nums text-amber-700 mt-1">
            {pendingVerificationCount}
          </div>
          <div className="text-[11px] text-on-surface-variant mt-0.5">
            {mfsCaps?.anyLiveGateway ? 'Live Gateway API Active' : 'Manual TrxID / Counter Ready'}
          </div>
        </div>
      </div>

      {/* Sub-Tab Bar */}
      <div className="flex flex-wrap items-center gap-1.5 p-1.5 rounded-2xl bg-surface-container-low border border-outline-variant/25 no-print">
        <button
          type="button"
          onClick={() => setSubTab('re-admission')}
          className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold cursor-pointer transition-colors ${
            subTab === 're-admission'
              ? 'bg-primary-container text-on-primary shadow-xs'
              : 'text-on-surface-variant hover:text-on-surface'
          }`}
        >
          <UserCheck className="w-4 h-4" />
          Promoted &amp; Re-admission ({promotedCohortStudents.length})
        </button>

        <button
          type="button"
          onClick={() => setSubTab('queue')}
          className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold cursor-pointer transition-colors ${
            subTab === 'queue'
              ? 'bg-primary-container text-on-primary shadow-xs'
              : 'text-on-surface-variant hover:text-on-surface'
          }`}
        >
          <GraduationCap className="w-4 h-4" />
          New &amp; All Applications ({admissions.length})
        </button>

        <button
          type="button"
          onClick={() => setSubTab('intake')}
          className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold cursor-pointer transition-colors ${
            subTab === 'intake'
              ? 'bg-primary-container text-on-primary shadow-xs'
              : 'text-on-surface-variant hover:text-on-surface'
          }`}
        >
          <Sliders className="w-4 h-4" />
          Class Intake &amp; Fee Rules
        </button>

        <button
          type="button"
          onClick={() => setSubTab('form-design')}
          className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold cursor-pointer transition-colors ${
            subTab === 'form-design'
              ? 'bg-primary-container text-on-primary shadow-xs'
              : 'text-on-surface-variant hover:text-on-surface'
          }`}
        >
          <Settings2 className="w-4 h-4" />
          Form &amp; Signatories
        </button>
      </div>

      {feedback && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-semibold flex items-center gap-2 no-print">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{feedback}</span>
        </div>
      )}

      {/* SUB-TAB 1: PROMOTED & RE-ADMISSION COHORT */}
      {subTab === 're-admission' && (
        <div className="space-y-4 no-print">
          <div className="rounded-2xl bg-surface-container-lowest border border-outline-variant/25 p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="relative w-full md:w-80">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-on-surface-variant" />
              <input
                type="text"
                placeholder="Search by Name, System ID, Old Roll, Class..."
                value={reAdmissionSearch}
                onChange={(e) => setReAdmissionSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 text-xs"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs">
              {(
                ['all', 'Pending Re-admission', 'Submitted', 'Completed'] as const
              ).map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setReAdmissionFilter(st)}
                  className={`px-3 py-2 rounded-xl font-semibold border cursor-pointer ${
                    reAdmissionFilter === st
                      ? 'bg-secondary text-on-secondary border-secondary'
                      : 'bg-surface-container-low border-outline-variant/30 text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  {st === 'all' ? 'All Promoted' : st}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-2xl bg-surface-container-lowest border border-outline-variant/25 overflow-hidden">
            {filteredPromotedCohort.length === 0 ? (
              <div className="p-10 text-center space-y-2 text-xs text-on-surface-variant">
                <UserCheck className="w-8 h-8 mx-auto text-on-surface-variant/60" />
                <div className="text-sm font-bold text-on-surface">
                  No Promoted Re-Admission Students Found
                </div>
                <p className="max-w-md mx-auto">
                  Use <strong>Student Management &rarr; Promote Selected</strong> with{' '}
                  <strong>Pending Re-admission</strong> mode to queue promoted students from an academic year (e.g. 2026 &rarr; 2027) for Re-admission here.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-surface-container-low text-on-surface-variant border-b border-outline-variant/25">
                      <th className="py-3 px-4 font-semibold">Student</th>
                      <th className="py-3 px-4 font-semibold">Previous Year &amp; Roll</th>
                      <th className="py-3 px-4 font-semibold">Promoted Target Class</th>
                      <th className="py-3 px-4 font-semibold">Re-admission Fee &amp; Payment</th>
                      <th className="py-3 px-4 font-semibold">Status</th>
                      <th className="py-3 px-4 font-semibold text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant/15 text-on-surface">
                    {filteredPromotedCohort.map((stu) => {
                      const rs = stu.reAdmissionState!;
                      const { app, inv } = findAppAndInvoiceForStudent(stu);
                      const feeAmt =
                        inv?.totalPayable ??
                        app?.paymentSummary?.feeAmount ??
                        academicClasses.find((c) => c.name === rs.targetClassName)?.reAdmissionFee ??
                        0;
                      const payStatus =
                        inv?.status || app?.paymentSummary?.paymentStatus || (feeAmt > 0 ? 'Unpaid' : 'Waived');

                      return (
                        <tr key={stu.id} className="hover:bg-surface-container-low/40">
                          <td className="py-3.5 px-4">
                            <div className="font-bold text-sm text-on-surface">{stu.fullName}</div>
                            <div className="text-[11px] font-mono text-on-surface-variant">
                              {stu.systemId} &bull; {stu.phone || 'No Phone'}
                            </div>
                          </td>

                          <td className="py-3.5 px-4 font-mono tabular-nums">
                            <div className="font-semibold text-on-surface">
                              {rs.sourceClassName} &bull; Roll #{rs.sourceRollNumber}
                            </div>
                            <div className="text-[11px] text-on-surface-variant">
                              Year {rs.sourceAcademicYear} ({rs.sourceSectionName === 'Common' ? 'Combined' : `Sec ${rs.sourceSectionName}`})
                            </div>
                          </td>

                          <td className="py-3.5 px-4">
                            <div className="font-bold text-primary-container inline-flex items-center gap-1">
                              <span>{rs.targetClassName}</span>
                              <ArrowRight className="w-3.5 h-3.5" />
                              <span className="font-mono tabular-nums">
                                Roll #{rs.targetRollNumber}
                              </span>
                            </div>
                            <div className="text-[11px] text-on-surface-variant">
                              Year <strong className="font-mono">{rs.targetAcademicYear}</strong> &bull;{' '}
                              {formatGroupSectionDisplay(rs.targetGroup, rs.targetSectionName)}
                            </div>
                          </td>

                          <td className="py-3.5 px-4">
                            <div className="font-mono font-bold tabular-nums">
                              {feeAmt > 0 ? `৳${feeAmt.toLocaleString()}` : 'Free / ৳0'}
                            </div>
                            <div className="text-[11px] text-on-surface-variant">
                              {app?.paymentSummary?.paymentChannel || inv?.paymentMethod || payStatus}
                              {app?.paymentSummary?.trxId ? ` · ${app.paymentSummary.trxId}` : ''}
                            </div>
                          </td>

                          <td className="py-3.5 px-4">
                            <span
                              className={`inline-block px-2.5 py-1 rounded-lg text-[11px] font-bold border ${
                                rs.status === 'Completed'
                                  ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
                                  : rs.status === 'Submitted'
                                  ? 'bg-amber-50 text-amber-900 border-amber-200'
                                  : 'bg-sky-50 text-sky-900 border-sky-200'
                              }`}
                            >
                              {rs.status}
                            </span>
                          </td>

                          <td className="py-3.5 px-4 text-right">
                            <div className="inline-flex flex-wrap items-center justify-end gap-1.5">
                              {rs.status !== 'Completed' && (
                                <button
                                  type="button"
                                  onClick={() => setReAdmissionStudent(stu)}
                                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-primary-container hover:bg-primary text-on-primary text-xs font-bold shadow-xs cursor-pointer"
                                >
                                  <UserCheck className="w-3.5 h-3.5" />
                                  Re-admission
                                </button>
                              )}

                              {app && app.paymentSummary?.paymentStatus === 'Pending Verification' && (
                                <button
                                  type="button"
                                  disabled={verifyingAppId === app.id}
                                  onClick={() => void handleVerifyMfsAndFinalize(app)}
                                  className="inline-flex items-center gap-1 px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold cursor-pointer"
                                >
                                  <ShieldCheck className="w-3.5 h-3.5" />
                                  {verifyingAppId === app.id ? 'Verifying...' : 'Verify MFS & Finalize'}
                                </button>
                              )}

                              {app && (
                                <button
                                  type="button"
                                  onClick={() => setSlipModal({ application: app, invoice: inv })}
                                  className="inline-flex items-center gap-1 px-2.5 py-2 rounded-xl bg-surface-container hover:bg-surface-container-high text-on-surface text-xs font-semibold cursor-pointer"
                                  title="Print A4 Re-admission Slip"
                                >
                                  <FileText className="w-3.5 h-3.5" />
                                  Slip
                                </button>
                              )}

                              {(inv || (app && feeAmt > 0)) && (
                                <button
                                  type="button"
                                  onClick={() => setReceiptModal({ application: app, invoice: inv })}
                                  className="inline-flex items-center gap-1 px-2.5 py-2 rounded-xl bg-surface-container hover:bg-surface-container-high text-on-surface text-xs font-semibold cursor-pointer"
                                  title="Print Dual-Copy A4 Money Receipt"
                                >
                                  <Receipt className="w-3.5 h-3.5" />
                                  Receipt
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* SUB-TAB 2: NEW & ALL ADMISSIONS QUEUE */}
      {subTab === 'queue' && (
        <div className="space-y-4 no-print">
          <div className="rounded-2xl bg-surface-container-lowest border border-outline-variant/25 p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleDownloadApplicantTemplate}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-surface-container-low hover:bg-surface-container text-xs font-semibold border border-outline-variant/30 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                CSV Template
              </button>

              <label className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-secondary text-on-secondary text-xs font-bold cursor-pointer hover:opacity-90">
                <Upload className="w-3.5 h-3.5" />
                Import Applicants (CSV)
                <input type="file" accept=".csv" onChange={handleImportApplicantsCsv} className="hidden" />
              </label>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-on-surface-variant" />
                <input
                  type="text"
                  placeholder="Search name, code, TrxID..."
                  value={queueSearch}
                  onChange={(e) => setQueueSearch(e.target.value)}
                  className="pl-8 pr-3 py-1.5 rounded-xl bg-surface-container-low border border-outline-variant/30 text-xs w-48"
                />
              </div>

              <select
                value={admissionFilter}
                onChange={(e) =>
                  setAdmissionFilter(
                    e.target.value as 'all' | 'Approved' | 'Under Review' | 'Pending' | 'Admitted'
                  )
                }
                className="px-3 py-1.5 rounded-xl bg-surface-container-low border border-outline-variant/30 text-xs font-bold text-on-surface"
              >
                <option value="all">All Statuses</option>
                <option value="Pending">Pending</option>
                <option value="Under Review">Under Review</option>
                <option value="Approved">Approved</option>
                <option value="Admitted">Admitted</option>
              </select>
            </div>
          </div>

          <div className="rounded-2xl bg-surface-container-lowest border border-outline-variant/25 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-surface-container-low text-on-surface-variant border-b border-outline-variant/25">
                    <th className="py-3 px-4 font-semibold">Applicant</th>
                    <th className="py-3 px-4 font-semibold">Class, Group &amp; Year</th>
                    <th className="py-3 px-4 font-semibold">Guardian &amp; Phone</th>
                    <th className="py-3 px-4 font-semibold">Fee &amp; MFS Payment</th>
                    <th className="py-3 px-4 font-semibold">Status</th>
                    <th className="py-3 px-4 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/15 text-on-surface">
                  {newAdmissions.map((app) => {
                    const matchedInv = findInvoiceForApp(app);
                    const feeAmt =
                      matchedInv?.totalPayable ?? app.paymentSummary?.feeAmount ?? 0;
                    const payStatus =
                      matchedInv?.status === 'Paid'
                        ? 'Paid'
                        : app.paymentSummary?.paymentStatus || (feeAmt > 0 ? 'Pending Verification' : 'Not Required');
                    const isMfsPending = payStatus === 'Pending Verification';

                    return (
                      <tr key={app.id} className="hover:bg-surface-container-low/40">
                        <td className="py-3.5 px-4">
                          <div className="font-bold text-sm flex flex-wrap items-center gap-1.5">
                            <span>{app.applicantName}</span>
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                app.applicationType === 're-admission'
                                  ? 'bg-emerald-100 text-emerald-900'
                                  : 'bg-sky-100 text-sky-900'
                              }`}
                            >
                              {app.applicationType === 're-admission' ? 'Re-admission' : 'New'}
                            </span>
                          </div>
                          <div className="text-[11px] text-on-surface-variant font-mono tabular-nums">
                            {app.applicationCode} &bull; {app.appliedTime}
                          </div>
                        </td>

                        <td className="py-3.5 px-4">
                          <div className="font-semibold">
                            {app.grade}{' '}
                            {app.targetAcademicYear ? (
                              <span className="font-mono text-on-surface-variant">
                                ({app.targetAcademicYear})
                              </span>
                            ) : null}
                          </div>
                          <div className="text-[11px] text-on-surface-variant">
                            {app.group || 'General'} &bull; {app.religionGroup || 'Islam'}
                          </div>
                        </td>

                        <td className="py-3.5 px-4 text-on-surface-variant">
                          <div>{app.fatherName || '—'}</div>
                          <div className="font-mono tabular-nums text-[11px]">{app.phone || '—'}</div>
                        </td>

                        <td className="py-3.5 px-4">
                          <div className="font-mono font-bold tabular-nums">
                            {feeAmt > 0 ? `৳${feeAmt.toLocaleString()}` : 'Free'}
                          </div>
                          <div className="text-[11px]">
                            <span
                              className={`font-semibold ${
                                payStatus === 'Paid'
                                  ? 'text-emerald-800'
                                  : isMfsPending
                                  ? 'text-amber-800'
                                  : 'text-on-surface-variant'
                              }`}
                            >
                              {app.paymentSummary?.paymentChannel || 'Counter'} ({payStatus})
                            </span>
                            {app.paymentSummary?.trxId ? (
                              <span className="block font-mono text-[10px] text-on-surface-variant">
                                TrxID: {app.paymentSummary.trxId}
                              </span>
                            ) : null}
                          </div>
                        </td>

                        <td className="py-3.5 px-4 font-semibold">
                          {app.status === 'Admitted' ? (
                            <span className="text-emerald-800">
                              Admitted ({app.assignedClass} {app.assignedSection} &bull; Roll #{app.assignedRoll})
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
                          <div className="inline-flex flex-wrap items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => setSlipModal({ application: app, invoice: matchedInv })}
                              className="px-2.5 py-1.5 rounded-lg bg-surface-container text-on-surface hover:bg-surface-container-high font-semibold cursor-pointer inline-flex items-center gap-1"
                              title="Print Application Slip"
                            >
                              <Printer className="w-3.5 h-3.5" />
                              Slip
                            </button>

                            {(matchedInv || feeAmt > 0) && (
                              <button
                                type="button"
                                onClick={() => setReceiptModal({ application: app, invoice: matchedInv })}
                                className="px-2.5 py-1.5 rounded-lg bg-surface-container text-on-surface hover:bg-surface-container-high font-semibold cursor-pointer inline-flex items-center gap-1"
                                title="Print Dual-Copy Payment Receipt"
                              >
                                <Receipt className="w-3.5 h-3.5" />
                                Receipt
                              </button>
                            )}

                            {isMfsPending && (
                              <button
                                type="button"
                                disabled={verifyingAppId === app.id}
                                onClick={() => void handleVerifyMfsAndFinalize(app)}
                                className="px-2.5 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 font-bold cursor-pointer inline-flex items-center gap-1"
                              >
                                <ShieldCheck className="w-3.5 h-3.5" />
                                Verify Fee
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => setEditingApp({ ...app })}
                              className="px-2.5 py-1.5 rounded-lg bg-surface-container text-on-surface hover:bg-surface-container-high font-semibold cursor-pointer"
                            >
                              Edit
                            </button>

                            {app.status !== 'Admitted' && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => updateAdmissionStatus(app.id, 'Approved')}
                                  className="px-2.5 py-1.5 rounded-lg bg-emerald-50 text-emerald-800 hover:bg-emerald-100 font-semibold cursor-pointer"
                                >
                                  Approve
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const resolvedClsObj =
                                      academicClasses.find((c) => c.name === app.grade) ||
                                      academicClasses[0];
                                    const nextCls = resolvedClsObj?.name || 'Class 6';
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
                                  className="px-2.5 py-1.5 rounded-lg bg-primary-container text-on-primary hover:bg-primary font-semibold cursor-pointer"
                                >
                                  Admit to Class
                                </button>
                              </>
                            )}

                            <button
                              type="button"
                              onClick={() => deleteAdmissionApplication(app.id)}
                              className="p-1.5 rounded-lg text-error hover:bg-error-container/20 cursor-pointer"
                              title="Delete"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB 3: CLASS INTAKE, FEES & MFS GATEWAY READINESS */}
      {subTab === 'intake' && (
        <div className="space-y-5 no-print">
          {/* MFS & Auto-Billing Readiness Strip */}
          <div className="rounded-2xl bg-surface-container-lowest border border-outline-variant/25 p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2 font-bold text-sm text-on-surface">
                <CreditCard className="w-4 h-4 text-primary-container" />
                MFS Payment Synchronization &amp; Automatic Billing Ledger
              </div>
              <p className="text-xs text-on-surface-variant max-w-3xl">
                Amounts set per class below are automatically shown on the public Admission &amp; Re-admission Portal, synced into the Student Billing Ledger, dispatched as SMS receipts when configured, and printed as a half-and-half Dual-Copy A4 Payment Receipt.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold shrink-0">
              <span
                className={`px-2.5 py-1.5 rounded-lg border ${
                  mfsConfig.bkash.enabled
                    ? 'bg-pink-50 text-pink-900 border-pink-200'
                    : 'bg-surface-container text-on-surface-variant border-outline-variant/30'
                }`}
              >
                bKash {mfsCaps?.bkashLive ? 'API Live' : mfsConfig.bkash.enabled ? `Wallet ${mfsConfig.bkash.merchantNumber || 'Ready'}` : 'Off'}
              </span>
              <span
                className={`px-2.5 py-1.5 rounded-lg border ${
                  mfsConfig.nagad.enabled
                    ? 'bg-orange-50 text-orange-900 border-orange-200'
                    : 'bg-surface-container text-on-surface-variant border-outline-variant/30'
                }`}
              >
                Nagad {mfsCaps?.nagadLive ? 'API Live' : mfsConfig.nagad.enabled ? `Wallet ${mfsConfig.nagad.merchantNumber || 'Ready'}` : 'Off'}
              </span>
              <span
                className={`px-2.5 py-1.5 rounded-lg border ${
                  mfsConfig.rocket.enabled
                    ? 'bg-purple-50 text-purple-900 border-purple-200'
                    : 'bg-surface-container text-on-surface-variant border-outline-variant/30'
                }`}
              >
                Rocket {mfsCaps?.rocketLive ? 'API Live' : mfsConfig.rocket.enabled ? `Wallet ${mfsConfig.rocket.merchantNumber || 'Ready'}` : 'Off'}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {academicClasses.map((cls) => {
              const draft = getDraftForClass(cls);
              const breakdown = draft.admissionFeeBreakdown || [];

              return (
                <div
                  key={cls.id}
                  className="rounded-2xl bg-surface-container-lowest border border-outline-variant/25 p-5 space-y-4 text-xs"
                >
                  <div className="flex items-start justify-between gap-3 border-b border-outline-variant/20 pb-3">
                    <div>
                      <h3 className="text-base font-bold text-on-surface">{cls.name}</h3>
                      <p className="text-[11px] text-on-surface-variant">
                        Active Cohort: {cls.activeCycle || activeAcademicYear} &bull;{' '}
                        {cls.groups?.join(', ') || 'General'}
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={savingIntakeId === cls.id}
                      onClick={() => void handleSaveClassIntake(cls)}
                      className="px-4 py-2 rounded-xl bg-primary-container hover:bg-primary disabled:opacity-50 text-on-primary font-bold cursor-pointer"
                    >
                      {savingIntakeId === cls.id ? 'Saving...' : 'Save Class Rules'}
                    </button>
                  </div>

                  {/* Open Toggles */}
                  <div className="grid grid-cols-2 gap-3">
                    <label className="flex items-center justify-between p-2.5 rounded-xl bg-surface-container-low border border-outline-variant/20 cursor-pointer">
                      <span className="font-semibold text-on-surface">New Admission Open</span>
                      <input
                        type="checkbox"
                        checked={draft.openForNewAdmission !== false}
                        onChange={(e) =>
                          updateClassDraft(cls.id, (p) => ({
                            ...p,
                            openForNewAdmission: e.target.checked,
                          }))
                        }
                        className="w-4 h-4"
                      />
                    </label>
                    <label className="flex items-center justify-between p-2.5 rounded-xl bg-surface-container-low border border-outline-variant/20 cursor-pointer">
                      <span className="font-semibold text-on-surface">Re-admission Open</span>
                      <input
                        type="checkbox"
                        checked={draft.openForReAdmission !== false}
                        onChange={(e) =>
                          updateClassDraft(cls.id, (p) => ({
                            ...p,
                            openForReAdmission: e.target.checked,
                          }))
                        }
                        className="w-4 h-4"
                      />
                    </label>
                  </div>

                  {/* Fee & Seat Inputs */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div>
                      <label className="block font-semibold text-on-surface-variant mb-1">
                        New Adm. Fee (৳)
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={draft.newAdmissionFee ?? 0}
                        onChange={(e) =>
                          updateClassDraft(cls.id, (p) => ({
                            ...p,
                            newAdmissionFee: Math.max(0, Number(e.target.value) || 0),
                          }))
                        }
                        className="w-full px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 font-mono font-bold tabular-nums"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-on-surface-variant mb-1">
                        Re-adm. Fee (৳)
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={draft.reAdmissionFee ?? 0}
                        onChange={(e) =>
                          updateClassDraft(cls.id, (p) => ({
                            ...p,
                            reAdmissionFee: Math.max(0, Number(e.target.value) || 0),
                          }))
                        }
                        className="w-full px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 font-mono font-bold tabular-nums"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-on-surface-variant mb-1">
                        Intake Year
                      </label>
                      <input
                        type="text"
                        value={draft.intakeYear || ''}
                        onChange={(e) =>
                          updateClassDraft(cls.id, (p) => ({
                            ...p,
                            intakeYear: e.target.value,
                          }))
                        }
                        className="w-full px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 font-mono font-bold tabular-nums"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-on-surface-variant mb-1">
                        Seat Limit
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={draft.admissionSeatLimit ?? 0}
                        onChange={(e) =>
                          updateClassDraft(cls.id, (p) => ({
                            ...p,
                            admissionSeatLimit: Math.max(0, Number(e.target.value) || 0),
                          }))
                        }
                        className="w-full px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 font-mono font-bold tabular-nums"
                      />
                    </div>
                  </div>

                  {/* Itemized Breakdown Builder */}
                  <div className="space-y-2 pt-2 border-t border-outline-variant/15">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-[11px] uppercase tracking-wider text-on-surface-variant">
                        Receipt Fee Breakdown Items
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          updateClassDraft(cls.id, (p) => ({
                            ...p,
                            admissionFeeBreakdown: [
                              ...(p.admissionFeeBreakdown ?? cls.admissionFeeBreakdown ?? []),
                              { label: 'Session / Form Fee', amount: 500 },
                            ],
                          }))
                        }
                        className="inline-flex items-center gap-1 text-primary-container font-bold cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Add Line Item
                      </button>
                    </div>

                    {breakdown.length > 0 && (
                      <div className="space-y-1.5">
                        {breakdown.map((item: AdmissionFeeItem, idx: number) => (
                          <div key={idx} className="flex items-center gap-2">
                            <input
                              type="text"
                              value={item.label}
                              placeholder="Fee head label"
                              onChange={(e) => {
                                const next = breakdown.map((row, i) =>
                                  i === idx ? { ...row, label: e.target.value } : row
                                );
                                updateClassDraft(cls.id, (p) => ({
                                  ...p,
                                  admissionFeeBreakdown: next,
                                }));
                              }}
                              className="flex-1 px-2.5 py-1.5 rounded-lg bg-surface-container-low border border-outline-variant/30"
                            />
                            <input
                              type="number"
                              min={0}
                              value={item.amount}
                              onChange={(e) => {
                                const next = breakdown.map((row, i) =>
                                  i === idx
                                    ? { ...row, amount: Math.max(0, Number(e.target.value) || 0) }
                                    : row
                                );
                                const sum = next.reduce((acc, r) => acc + r.amount, 0);
                                updateClassDraft(cls.id, (p) => ({
                                  ...p,
                                  admissionFeeBreakdown: next,
                                  newAdmissionFee: sum,
                                  reAdmissionFee: sum,
                                }));
                              }}
                              className="w-24 px-2.5 py-1.5 rounded-lg bg-surface-container-low border border-outline-variant/30 font-mono font-bold tabular-nums text-right"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                const next = breakdown.filter((_, i) => i !== idx);
                                updateClassDraft(cls.id, (p) => ({
                                  ...p,
                                  admissionFeeBreakdown: next,
                                }));
                              }}
                              className="p-1 text-error hover:bg-error-container/20 rounded cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* SUB-TAB 4: ADMISSION FORM & SIGNATORY CUSTOMIZER */}
      {subTab === 'form-design' && (
        <form
          onSubmit={handleSaveFormDesign}
          className="rounded-2xl bg-surface-container-lowest border border-outline-variant/25 p-6 space-y-5 no-print"
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

      {/* RE-ADMISSION PRE-FILLED STUDENT SCHEMA FORM MODAL */}
      {reAdmissionStudent && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs overflow-y-auto p-3 sm:p-6 flex items-start justify-center no-print">
          <div className="bg-surface-container-lowest rounded-3xl w-full max-w-4xl shadow-2xl border border-outline-variant/25 overflow-hidden my-4">
            <div className="px-6 py-4 border-b border-outline-variant/20 bg-surface-container-low/60 flex items-center justify-between">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-800">
                  Admin Counter &bull; Promoted Student Re-Admission
                </div>
                <h3 className="text-base font-bold text-on-surface">
                  Complete Re-admission: {reAdmissionStudent.fullName} ({reAdmissionStudent.systemId})
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setReAdmissionStudent(null)}
                className="p-2 rounded-xl hover:bg-surface-container cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 sm:p-6">
              <StudentSchemaAdmissionForm
                mode="re-admission"
                actor="admin"
                academicClasses={academicClasses}
                subjects={subjects}
                instituteRules={instituteRules}
                admissionFormConfig={admissionFormConfig}
                mfsConfig={mfsConfig}
                prefillStudent={reAdmissionStudent}
                reAdmissionContext={reAdmissionStudent.reAdmissionState}
                linkedStudentId={reAdmissionStudent.id}
                onSuccess={(res) => {
                  void refreshFromServer();
                  setReAdmissionStudent(null);
                  setSlipModal({ application: res.application, invoice: res.invoice });
                  showToast(
                    `Re-admission recorded for ${res.application.applicantName} (${res.application.applicationCode}).`
                  );
                }}
                onCancel={() => setReAdmissionStudent(null)}
              />
            </div>
          </div>
        </div>
      )}

      {/* NEW WALK-IN ADMISSION MODAL */}
      {showWalkInModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs overflow-y-auto p-3 sm:p-6 flex items-start justify-center no-print">
          <div className="bg-surface-container-lowest rounded-3xl w-full max-w-4xl shadow-2xl border border-outline-variant/25 overflow-hidden my-4">
            <div className="px-6 py-4 border-b border-outline-variant/20 bg-surface-container-low/60 flex items-center justify-between">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-primary-container">
                  Admin Office &bull; Walk-in / Counter Admission
                </div>
                <h3 className="text-base font-bold text-on-surface">
                  New Student Admission &amp; Fee Collection Form
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowWalkInModal(false)}
                className="p-2 rounded-xl hover:bg-surface-container cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 sm:p-6">
              <StudentSchemaAdmissionForm
                mode="new"
                actor="admin"
                academicClasses={academicClasses}
                subjects={subjects}
                instituteRules={instituteRules}
                admissionFormConfig={admissionFormConfig}
                mfsConfig={mfsConfig}
                onSuccess={(res) => {
                  void refreshFromServer();
                  setShowWalkInModal(false);
                  setSlipModal({ application: res.application, invoice: res.invoice });
                  showToast(
                    `Admission application ${res.application.applicationCode} created.`
                  );
                }}
                onCancel={() => setShowWalkInModal(false)}
              />
            </div>
          </div>
        </div>
      )}

      {/* EDIT APPLICANT MODAL */}
      {editingApp && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 no-print">
          <div className="bg-surface-container-lowest rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-outline-variant/20 pb-3">
              <h3 className="text-base font-bold">Edit Applicant ({editingApp.applicationCode})</h3>
              <button type="button" onClick={() => setEditingApp(null)} className="p-1 cursor-pointer">
                <X className="w-5 h-5" />
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
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 no-print">
          <div className="bg-surface-container-lowest rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-outline-variant/20 pb-3">
              <h3 className="text-base font-bold">Admit Candidate to Class</h3>
              <button type="button" onClick={() => setAdmittingApp(null)} className="p-1 cursor-pointer">
                <X className="w-5 h-5" />
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
                    <label className="block font-semibold">Student ID (Optional Override)</label>
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
                    className="w-full px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 font-mono font-bold tracking-wider uppercase"
                  />
                  <p className="text-[11px] text-on-surface-variant mt-1">
                    Format: <span className="font-mono font-semibold">{studentIdPrefix.replace(/[\s-]/g, '').toUpperCase() || 'AG'}{resolveAcademicYearDigits(activeAcademicYear)}XXXX</span>
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
                    className="w-full px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 font-mono font-bold text-primary-container tabular-nums"
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

      {/* PRINTABLE A4 SLIP MODAL */}
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

      {/* PRINTABLE DUAL-COPY A4 RECEIPT MODAL */}
      {receiptModal && (
        <DualCopyPaymentReceiptModal
          cmsConfig={cmsConfig}
          invoice={receiptModal.invoice}
          application={receiptModal.application}
          onClose={() => setReceiptModal(null)}
          onViewSlip={
            receiptModal.application
              ? () => {
                  setSlipModal({
                    application: receiptModal.application!,
                    invoice: receiptModal.invoice,
                  });
                  setReceiptModal(null);
                }
              : undefined
          }
        />
      )}
    </div>
  );
}
