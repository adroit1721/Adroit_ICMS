'use client';

import { useEffect, useState } from 'react';
import { Printer, Receipt, X, CheckCircle2, ArrowRight } from 'lucide-react';
import {
  AdmissionApplication,
  AdmissionFormConfig,
  CMSConfig,
  StudentInvoice,
} from '@/lib/types';
import { formatDateDDMMYYYY, formatGroupSectionDisplay } from '@/lib/academic-helpers';
import { generateQrDataUrl } from '@/lib/qr';

interface AdmissionApplicationSlipModalProps {
  cmsConfig: CMSConfig;
  admissionFormConfig: AdmissionFormConfig;
  application: AdmissionApplication;
  invoice?: StudentInvoice | null;
  onClose: () => void;
  onOpenReceipt?: () => void;
}

export default function AdmissionApplicationSlipModal({
  cmsConfig,
  admissionFormConfig,
  application,
  invoice,
  onClose,
  onOpenReceipt,
}: AdmissionApplicationSlipModalProps) {
  const [qrUrl, setQrUrl] = useState('');

  useEffect(() => {
    const verifyText =
      typeof window !== 'undefined'
        ? `${window.location.origin}/admissions?code=${encodeURIComponent(application.applicationCode)}`
        : application.applicationCode;
    void generateQrDataUrl(verifyText).then(setQrUrl);
  }, [application.applicationCode]);

  const isReAdmission = application.applicationType === 're-admission';
  const feeAmount = invoice?.totalPayable ?? application.paymentSummary?.feeAmount ?? 0;
  const paidAmount = invoice?.paidAmount ?? application.paymentSummary?.paidAmount ?? 0;
  const paymentChannel =
    invoice?.paymentMethod || application.paymentSummary?.paymentChannel || 'Not Required';
  const trxId = invoice?.transactionId || application.paymentSummary?.trxId;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs overflow-y-auto p-3 sm:p-6 flex flex-col items-center">
      {/* Toolbar (No Print) */}
      <div className="w-full max-w-[198mm] bg-white rounded-2xl border border-outline-variant/30 px-4 py-3 mb-4 flex flex-wrap items-center justify-between gap-3 shadow-lg no-print">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs font-bold text-on-surface">
              {isReAdmission ? 'Re-Admission Form & Confirmation Slip' : 'Admission Application Slip'} ({application.applicationCode})
            </div>
            <div className="text-[11px] text-on-surface-variant">
              Print this A4 confirmation form or open the half-and-half Dual-Copy Fee Receipt.
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {onOpenReceipt && (feeAmount > 0 || invoice) && (
            <button
              type="button"
              onClick={onOpenReceipt}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-secondary text-on-secondary text-xs font-bold cursor-pointer"
            >
              <Receipt className="w-4 h-4" />
              Dual-Copy Payment Receipt
            </button>
          )}
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary-container hover:bg-primary text-on-primary text-xs font-bold cursor-pointer"
          >
            <Printer className="w-4 h-4" />
            Print A4 Slip
          </button>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-surface-container text-on-surface-variant cursor-pointer"
            aria-label="Close slip modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Printable A4 Application Slip */}
      <div className="a4-admission-slip-sheet w-full max-w-[198mm] bg-white text-slate-900 border border-slate-300 rounded-xl shadow-2xl p-6 space-y-5 box-border">
        {/* Letterhead */}
        <div className="flex items-start justify-between gap-4 border-b-2 border-slate-900 pb-4">
          <div className="flex items-center gap-3">
            {cmsConfig.crestUrl && (
              <img
                src={cmsConfig.crestUrl}
                alt={cmsConfig.schoolName}
                className="w-14 h-14 object-contain shrink-0"
                referrerPolicy="no-referrer"
              />
            )}
            <div>
              <h1 className="text-lg font-bold uppercase tracking-tight text-slate-950">
                {cmsConfig.schoolName}
              </h1>
              <p className="text-xs text-slate-600">
                {cmsConfig.address} &bull; EIIN: {cmsConfig.eiin} &bull; {cmsConfig.phone}
              </p>
              <div className="mt-1 inline-flex items-center gap-2">
                <span className="px-2.5 py-0.5 rounded bg-slate-900 text-white text-[10px] font-bold uppercase tracking-wider">
                  {isReAdmission ? 'RE-ADMISSION ENROLLMENT FORM' : 'NEW ADMISSION APPLICATION SLIP'}
                </span>
                <span className="font-mono font-bold text-xs text-slate-800">
                  {application.applicationCode}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {application.avatarUrl ? (
              <img
                src={application.avatarUrl}
                alt={application.applicantName}
                className="w-16 h-20 object-cover rounded border border-slate-300"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="w-16 h-20 rounded border border-dashed border-slate-400 flex items-center justify-center text-[9px] text-slate-500 text-center p-1">
                Passport Photo
              </div>
            )}
            {qrUrl && (
              <img
                src={qrUrl}
                alt="QR Verify"
                className="w-16 h-16 border border-slate-300 p-0.5"
                referrerPolicy="no-referrer"
              />
            )}
          </div>
        </div>

        {/* Promotion Summary Banner (for Re-admission) */}
        {isReAdmission && (
          <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-300 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                Academic Year Promotion Progression
              </span>
              <div className="font-bold text-slate-900 flex items-center gap-2 mt-0.5">
                <span>
                  {application.previousYear || 'Previous Year'} &bull; {application.previousClass} (Roll #{application.previousRoll})
                </span>
                <ArrowRight className="w-4 h-4 text-slate-600" />
                <span className="text-emerald-900">
                  {application.targetAcademicYear || 'New Year'} &bull; {application.assignedClass || application.grade}{' '}
                  ({formatGroupSectionDisplay(application.group || 'General', application.assignedSection || application.sectionName || 'Common')})
                  {application.assignedRoll ? ` · New Roll #${application.assignedRoll}` : ''}
                </span>
              </div>
            </div>
            {application.linkedSystemId && (
              <div className="font-mono text-xs font-bold bg-white px-2.5 py-1 rounded border border-slate-300">
                ID: {application.linkedSystemId}
              </div>
            )}
          </div>
        )}

        {/* Complete Student Schema Grid */}
        <div className="space-y-3 text-xs">
          <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-700 border-b border-slate-300 pb-1">
            1. Academic &amp; Candidate Information
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2">
            <div>
              <span className="text-[10px] text-slate-500 block">Student Name (English)</span>
              <strong className="text-slate-950">{application.applicantName}</strong>
            </div>
            <div>
              <span className="text-[10px] text-slate-500 block">Student Name (Bangla)</span>
              <strong>{application.banglaName || '—'}</strong>
            </div>
            <div>
              <span className="text-[10px] text-slate-500 block">Target Class &amp; Academic Year</span>
              <strong>
                {application.assignedClass || application.grade} ({application.targetAcademicYear || 'Current'})
              </strong>
            </div>
            <div>
              <span className="text-[10px] text-slate-500 block">Academic Group / Shift</span>
              <strong>
                {application.group || 'General'} &bull; {application.shift || 'Morning'} Shift
              </strong>
            </div>
            <div>
              <span className="text-[10px] text-slate-500 block">Date of Birth / Gender</span>
              <strong className="font-mono tabular-nums">
                {application.dateOfBirth ? formatDateDDMMYYYY(application.dateOfBirth) : '—'} &bull;{' '}
                {application.gender || '—'}
              </strong>
            </div>
            <div>
              <span className="text-[10px] text-slate-500 block">Religion / Blood Group</span>
              <strong>
                {application.religionGroup || '—'} &bull; {application.bloodGroup || '—'}
              </strong>
            </div>
            <div>
              <span className="text-[10px] text-slate-500 block">Birth Registration / NID</span>
              <strong className="font-mono tabular-nums">{application.birthRegOrNid || '—'}</strong>
            </div>
            <div>
              <span className="text-[10px] text-slate-500 block">Primary Mobile</span>
              <strong className="font-mono tabular-nums">{application.phone || '—'}</strong>
            </div>
            <div>
              <span className="text-[10px] text-slate-500 block">Application Status</span>
              <strong className="uppercase">{application.status}</strong>
            </div>
          </div>

          <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-700 border-b border-slate-300 pb-1 pt-2">
            2. Parents, Guardian &amp; Residential Details
          </h3>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2">
            <div>
              <span className="text-[10px] text-slate-500 block">Father&apos;s Name &amp; Contact</span>
              <strong>
                {application.fatherName || '—'}
                {application.fatherBanglaName ? ` (${application.fatherBanglaName})` : ''}
              </strong>
              <div className="text-[11px] font-mono text-slate-600">
                {application.fatherPhone || '—'} {application.fatherOccupation ? `· ${application.fatherOccupation}` : ''}
              </div>
            </div>
            <div>
              <span className="text-[10px] text-slate-500 block">Mother&apos;s Name &amp; Contact</span>
              <strong>
                {application.motherName || '—'}
                {application.motherBanglaName ? ` (${application.motherBanglaName})` : ''}
              </strong>
              <div className="text-[11px] font-mono text-slate-600">
                {application.motherPhone || '—'} {application.motherOccupation ? `· ${application.motherOccupation}` : ''}
              </div>
            </div>
            <div>
              <span className="text-[10px] text-slate-500 block">Present Address</span>
              <span className="font-medium">{application.presentAddress || '—'}</span>
            </div>
            <div>
              <span className="text-[10px] text-slate-500 block">Permanent Address</span>
              <span className="font-medium">
                {application.sameAsPresentAddress
                  ? application.presentAddress || 'Same as Present Address'
                  : application.permanentAddress || '—'}
              </span>
            </div>
            {(application.previousInstitute || application.previousGpa) && (
              <div className="col-span-2">
                <span className="text-[10px] text-slate-500 block">Previous Institute &amp; GPA</span>
                <strong>
                  {application.previousInstitute || '—'} {application.previousGpa ? `(GPA: ${application.previousGpa})` : ''}
                </strong>
              </div>
            )}
          </div>

          {/* Custom Fields */}
          {((application.customAnswers && Object.keys(application.customAnswers).length > 0) ||
            (application.customFields && Object.keys(application.customFields).length > 0)) && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-2 border-t border-slate-200">
              {Object.entries({ ...(application.customFields || {}), ...(application.customAnswers || {}) }).map(
                ([k, v]) =>
                  v ? (
                    <div key={k}>
                      <span className="text-[10px] text-slate-500 block">{k}</span>
                      <strong>{v}</strong>
                    </div>
                  ) : null
              )}
            </div>
          )}
        </div>

        {/* Fee & MFS Payment Summary Box */}
        <div className="p-3.5 rounded-lg border border-slate-300 bg-slate-50 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
              Fee &amp; Billing Status
            </span>
            <div className="font-semibold text-slate-900 mt-0.5">
              Fee: <span className="font-mono font-bold tabular-nums">৳{feeAmount.toLocaleString()}</span> &bull; Paid:{' '}
              <span className="font-mono font-bold tabular-nums text-emerald-800">
                ৳{paidAmount.toLocaleString()}
              </span>{' '}
              &bull; Channel: <strong>{paymentChannel}</strong>
              {trxId ? <span className="font-mono ml-1.5">(TrxID: {trxId})</span> : null}
            </div>
          </div>
          <div className="text-right font-mono">
            <span className="text-[10px] text-slate-500 block">Receipt Ref</span>
            <strong>{invoice?.invoiceNo || application.paymentSummary?.receiptNo || application.applicationCode}</strong>
          </div>
        </div>

        {/* Signatory Footer */}
        <div className="pt-8 flex items-end justify-between text-xs border-t border-slate-200">
          <div>
            <div className="w-40 border-b border-slate-700 mb-1" />
            <div className="font-semibold text-slate-800">Student / Guardian Signature</div>
            <div className="text-[10px] text-slate-500">Submitted: {application.appliedTime}</div>
          </div>
          <div className="text-right">
            <div className="w-44 border-b border-slate-700 mb-1 ml-auto" />
            <div className="font-bold text-slate-900">{admissionFormConfig.signatoryName}</div>
            <div className="text-[10px] text-slate-600">{admissionFormConfig.signatoryTitle}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
