'use client';

import { useEffect, useState } from 'react';
import { Printer, Scissors, X, CheckCircle2, Clock, FileText } from 'lucide-react';
import {
  AdmissionApplication,
  AdmissionFeeItem,
  CMSConfig,
  StudentInvoice,
} from '@/lib/types';
import { formatDateDDMMYYYY } from '@/lib/academic-helpers';
import { generateQrDataUrl } from '@/lib/qr';

interface DualCopyPaymentReceiptModalProps {
  cmsConfig: CMSConfig;
  invoice?: StudentInvoice | null;
  application?: AdmissionApplication | null;
  onClose: () => void;
  onViewSlip?: () => void;
}

interface ReceiptHalfProps {
  copyLabel: 'STUDENT COPY' | 'INSTITUTE COPY';
  cmsConfig: CMSConfig;
  receiptNo: string;
  paymentDate: string;
  academicYear: string;
  studentName: string;
  systemOrAppCode: string;
  classLabel: string;
  rollLabel: string;
  categoryLabel: string;
  paymentMethod: string;
  trxId: string;
  statusLabel: 'PAID' | 'PENDING VERIFICATION' | 'PAYABLE AT OFFICE';
  breakdown: AdmissionFeeItem[];
  totalPayable: number;
  paidAmount: number;
  qrDataUrl: string;
  smsNotifiedAt?: string;
}

function ReceiptHalf({
  copyLabel,
  cmsConfig,
  receiptNo,
  paymentDate,
  academicYear,
  studentName,
  systemOrAppCode,
  classLabel,
  rollLabel,
  categoryLabel,
  paymentMethod,
  trxId,
  statusLabel,
  breakdown,
  totalPayable,
  paidAmount,
  qrDataUrl,
  smsNotifiedAt,
}: ReceiptHalfProps) {
  const dueAmount = Math.max(0, totalPayable - paidAmount);
  const isPaid = statusLabel === 'PAID';

  return (
    <div className="border-2 border-slate-900 rounded-lg p-3.5 bg-white text-slate-900 flex flex-col justify-between h-[136mm] box-border">
      {/* Top Institutional Header */}
      <div className="space-y-2">
        <div className="flex items-start justify-between gap-3 border-b border-slate-300 pb-2">
          <div className="flex items-center gap-2.5 min-w-0">
            {cmsConfig.crestUrl ? (
              <img
                src={cmsConfig.crestUrl}
                alt={cmsConfig.schoolName}
                className="w-10 h-10 object-contain shrink-0"
                referrerPolicy="no-referrer"
              />
            ) : null}
            <div className="min-w-0">
              <h2 className="text-sm font-bold uppercase tracking-tight text-slate-950 truncate">
                {cmsConfig.schoolName}
              </h2>
              <p className="text-[10px] text-slate-600 truncate">
                {cmsConfig.address} &bull; EIIN: {cmsConfig.eiin} &bull; {cmsConfig.phone}
              </p>
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-800 mt-0.5">
                Official Fee Money Receipt &mdash; {categoryLabel}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <div className="text-right space-y-1">
              <span
                className={`inline-block px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider border ${
                  copyLabel === 'STUDENT COPY'
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-slate-100 text-slate-900 border-slate-700'
                }`}
              >
                {copyLabel}
              </span>
              <div>
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider border ${
                    isPaid
                      ? 'bg-emerald-50 text-emerald-900 border-emerald-700'
                      : 'bg-amber-50 text-amber-900 border-amber-700'
                  }`}
                >
                  {isPaid ? <CheckCircle2 className="w-2.5 h-2.5" /> : <Clock className="w-2.5 h-2.5" />}
                  {statusLabel}
                </span>
              </div>
            </div>
            {qrDataUrl && (
              <img
                src={qrDataUrl}
                alt="Verify Receipt"
                className="w-12 h-12 border border-slate-300 p-0.5 bg-white shrink-0"
                referrerPolicy="no-referrer"
              />
            )}
          </div>
        </div>

        {/* Receipt & Student Info Grid */}
        <div className="grid grid-cols-3 gap-x-3 gap-y-1 text-[10px] bg-slate-50 border border-slate-200 rounded px-2.5 py-1.5">
          <div>
            <span className="text-slate-500">Receipt No: </span>
            <strong className="font-mono tabular-nums text-slate-950">{receiptNo}</strong>
          </div>
          <div>
            <span className="text-slate-500">Date: </span>
            <strong className="font-mono tabular-nums text-slate-950">{paymentDate}</strong>
          </div>
          <div className="text-right">
            <span className="text-slate-500">Session / Year: </span>
            <strong className="font-mono tabular-nums text-slate-950">{academicYear}</strong>
          </div>
          <div className="col-span-2">
            <span className="text-slate-500">Student Name: </span>
            <strong className="text-slate-950">{studentName}</strong>
            {systemOrAppCode ? (
              <span className="ml-1.5 font-mono text-[9px] text-slate-600">({systemOrAppCode})</span>
            ) : null}
          </div>
          <div className="text-right">
            <span className="text-slate-500">Class / Roll: </span>
            <strong className="font-mono tabular-nums text-slate-950">
              {classLabel} &bull; {rollLabel}
            </strong>
          </div>
        </div>

        {/* Fee Breakdown Table */}
        <table className="w-full border-collapse text-[10px]">
          <thead>
            <tr className="bg-slate-100 border-y border-slate-400 text-slate-800">
              <th className="py-1 px-2 text-left font-bold w-10">SL</th>
              <th className="py-1 px-2 text-left font-bold">Fee Particulars / Description</th>
              <th className="py-1 px-2 text-right font-bold w-28">Amount (BDT)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {breakdown.map((item, idx) => (
              <tr key={`${item.label}-${idx}`}>
                <td className="py-1 px-2 font-mono tabular-nums text-slate-600">{idx + 1}</td>
                <td className="py-1 px-2 font-medium text-slate-900">{item.label}</td>
                <td className="py-1 px-2 text-right font-mono tabular-nums font-semibold">
                  ৳{Number(item.amount || 0).toLocaleString()}.00
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-slate-800 bg-slate-50 font-bold">
              <td colSpan={2} className="py-1.5 px-2 text-right uppercase text-[9.5px] text-slate-700">
                Total Fee Payable
              </td>
              <td className="py-1.5 px-2 text-right font-mono tabular-nums text-xs text-slate-950">
                ৳{totalPayable.toLocaleString()}.00
              </td>
            </tr>
          </tfoot>
        </table>

        {/* Payment Summary Strip */}
        <div className="grid grid-cols-3 gap-2 border border-slate-300 rounded px-2.5 py-1.5 text-[10px]">
          <div>
            <span className="text-slate-500 block text-[9px] uppercase">Method &amp; Reference</span>
            <span className="font-bold font-mono text-slate-950">
              {paymentMethod} {trxId ? `· ${trxId}` : ''}
            </span>
          </div>
          <div className="text-center">
            <span className="text-slate-500 block text-[9px] uppercase">Amount Paid</span>
            <span className="font-bold font-mono tabular-nums text-emerald-900 text-xs">
              ৳{paidAmount.toLocaleString()}.00
            </span>
          </div>
          <div className="text-right">
            <span className="text-slate-500 block text-[9px] uppercase">Balance Due</span>
            <span
              className={`font-bold font-mono tabular-nums text-xs ${
                dueAmount > 0 ? 'text-red-700' : 'text-slate-700'
              }`}
            >
              ৳{dueAmount.toLocaleString()}.00
            </span>
          </div>
        </div>
      </div>

      {/* Signatures & SMS Stamp Footer */}
      <div className="flex items-end justify-between gap-4 pt-3 text-[9.5px] text-slate-700">
        <div>
          <div className="font-semibold text-slate-800">
            {smsNotifiedAt
              ? `SMS Receipt Logged (${smsNotifiedAt.slice(0, 10)})`
              : isPaid
              ? 'Recorded in Automated Student Billing Ledger'
              : 'Present this copy at Accounts Office or verify MFS TrxID'}
          </div>
          <div className="text-[9px] text-slate-500 mt-0.5">
            Computer-generated receipt &bull; Verify via QR code
          </div>
        </div>
        <div className="flex items-end gap-8 shrink-0">
          <div className="text-center">
            <div className="w-24 border-b border-slate-700 mb-0.5" />
            <span className="font-semibold">Student / Guardian</span>
          </div>
          <div className="text-center">
            <div className="w-28 border-b border-slate-700 mb-0.5" />
            <span className="font-semibold">Authorized Cashier</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function DualCopyPaymentReceiptModal({
  cmsConfig,
  invoice,
  application,
  onClose,
  onViewSlip,
}: DualCopyPaymentReceiptModalProps) {
  const [qrUrl, setQrUrl] = useState('');

  const receiptNo =
    invoice?.invoiceNo ||
    application?.paymentSummary?.receiptNo ||
    (application ? `REC-${application.applicationCode}` : 'REC-0001');

  const paymentDate =
    formatDateDDMMYYYY(
      invoice?.paymentDate ||
        application?.paymentSummary?.paidAt?.slice(0, 10) ||
        application?.appliedTime ||
        new Date().toISOString().slice(0, 10)
    ) || new Date().toISOString().slice(0, 10);

  const academicYear =
    invoice?.academicYear || application?.targetAcademicYear || String(new Date().getFullYear());
  const studentName = invoice?.studentName || application?.applicantName || 'Student';
  const systemOrAppCode = [
    application?.linkedSystemId,
    application?.applicationCode,
  ]
    .filter(Boolean)
    .join(' · ');

  const classLabel = invoice?.className || application?.assignedClass || application?.grade || '';
  const sec = invoice?.sectionName || application?.assignedSection || application?.sectionName || 'Common';
  const rollNum = invoice?.rollNumber || application?.assignedRoll || application?.previousRoll;
  const rollLabel = rollNum ? `Roll #${rollNum}${sec && sec !== 'Common' ? ` (${sec})` : ''}` : sec === 'Common' ? 'Combined' : `Sec ${sec}`;

  const categoryLabel =
    invoice?.feeCategory === 'Re-admission' || application?.applicationType === 're-admission'
      ? 'Re-Admission Fee'
      : invoice?.feeCategory === 'Admission' || application?.applicationType === 'new'
      ? 'New Admission Fee'
      : invoice?.month || 'Tuition & Academic Fee';

  const totalPayable =
    invoice?.totalPayable ?? application?.paymentSummary?.feeAmount ?? 0;
  const paidAmount =
    invoice?.paidAmount ?? application?.paymentSummary?.paidAmount ?? 0;

  const breakdown: AdmissionFeeItem[] =
    invoice?.feeBreakdown?.length
      ? invoice.feeBreakdown
      : application?.paymentSummary?.feeBreakdown?.length
      ? application.paymentSummary.feeBreakdown
      : [{ label: invoice?.month || categoryLabel, amount: totalPayable }];

  const paymentMethod =
    invoice?.paymentMethod || application?.paymentSummary?.paymentChannel || 'Cash';
  const trxId = invoice?.transactionId || application?.paymentSummary?.trxId || '';

  const isPaid =
    invoice?.status === 'Paid' ||
    application?.paymentSummary?.paymentStatus === 'Paid' ||
    (totalPayable > 0 && paidAmount >= totalPayable);

  const statusLabel: ReceiptHalfProps['statusLabel'] = isPaid
    ? 'PAID'
    : paymentMethod === 'bKash' || paymentMethod === 'Nagad' || paymentMethod === 'Rocket'
    ? 'PENDING VERIFICATION'
    : 'PAYABLE AT OFFICE';

  const smsNotifiedAt = invoice?.smsNotifiedAt || application?.paymentSummary?.smsNotifiedAt;

  useEffect(() => {
    const verifyText =
      typeof window !== 'undefined'
        ? `${window.location.origin}/admissions?receipt=${encodeURIComponent(receiptNo)}&amt=${paidAmount}`
        : receiptNo;
    void generateQrDataUrl(verifyText).then(setQrUrl);
  }, [receiptNo, paidAmount]);

  const sharedHalfProps = {
    cmsConfig,
    receiptNo,
    paymentDate,
    academicYear,
    studentName,
    systemOrAppCode,
    classLabel,
    rollLabel,
    categoryLabel,
    paymentMethod,
    trxId,
    statusLabel,
    breakdown,
    totalPayable,
    paidAmount,
    qrDataUrl: qrUrl,
    smsNotifiedAt,
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs overflow-y-auto p-3 sm:p-6 flex flex-col items-center">
      {/* Control Toolbar (Hidden when Printing) */}
      <div className="w-full max-w-[210mm] bg-white rounded-2xl border border-outline-variant/30 px-4 py-3 mb-4 flex flex-wrap items-center justify-between gap-3 shadow-lg no-print">
        <div>
          <div className="text-xs font-bold text-on-surface uppercase tracking-wider">
            Dual-Copy A4 Portrait Payment Receipt
          </div>
          <div className="text-[11px] text-on-surface-variant">
            Top half: Student Copy &bull; Bottom half: Institute Copy (fits on a single A4 page)
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {onViewSlip && (
            <button
              type="button"
              onClick={onViewSlip}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-surface-container hover:bg-surface-container-high text-on-surface text-xs font-semibold cursor-pointer"
            >
              <FileText className="w-4 h-4" />
              Application Slip
            </button>
          )}
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary-container hover:bg-primary text-on-primary text-xs font-bold shadow-sm cursor-pointer"
          >
            <Printer className="w-4 h-4" />
            Print A4 Dual Receipt
          </button>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-surface-container text-on-surface-variant cursor-pointer"
            aria-label="Close receipt modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Single A4 Portrait Dual-Copy Sheet */}
      <div className="a4-dual-receipt-sheet w-[210mm] min-h-[297mm] bg-white p-[6mm] shadow-2xl rounded-xl flex flex-col justify-between box-border">
        <ReceiptHalf copyLabel="STUDENT COPY" {...sharedHalfProps} />

        {/* Perforated Tear Line */}
        <div className="relative flex items-center justify-center my-1.5">
          <div className="w-full border-t-2 border-dashed border-slate-400" />
          <span className="absolute bg-white px-2.5 text-[9px] font-mono uppercase tracking-widest text-slate-500 inline-flex items-center gap-1">
            <Scissors className="w-3 h-3" />
            Cut Along Dotted Line
          </span>
        </div>

        <ReceiptHalf copyLabel="INSTITUTE COPY" {...sharedHalfProps} />
      </div>
    </div>
  );
}
