'use client';

import { useState } from 'react';
import {
  CheckCircle,
  Copy,
  Check,
  Download,
  KeyRound,
  Printer,
  Search,
  ShieldCheck,
  X,
} from 'lucide-react';
import { BulkImportCredential } from '@/app/api/students/bulk-import/route';

interface BulkCredentialSlipModalProps {
  schoolName: string;
  credentials: BulkImportCredential[];
  onClose: () => void;
}

export default function BulkCredentialSlipModal({
  schoolName,
  credentials,
  onClose,
}: BulkCredentialSlipModalProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);

  const filtered = credentials.filter(
    (c) =>
      !searchTerm.trim() ||
      c.studentId.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.className.toLowerCase().includes(searchTerm.toLowerCase()) ||
      String(c.roll).includes(searchTerm)
  );

  const handleCopySingle = (id: string, pin: string) => {
    navigator.clipboard.writeText(`Student ID: ${id} | Initial PIN: ${pin}`);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2500);
  };

  const handleCopyAll = () => {
    const text = credentials
      .map(
        (c) =>
          `ID: ${c.studentId} | Roll: ${c.roll} | ${c.name} (${c.className} ${c.sectionName}) | PIN: ${c.plainPin}`
      )
      .join('\n');
    navigator.clipboard.writeText(text);
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 3000);
  };

  const handleExportCsv = () => {
    const headers = ['Student ID', 'Full Name', 'Class', 'Section', 'Roll', 'Initial PIN'];
    const rows = credentials.map((c) => [
      c.studentId,
      `"${c.name.replace(/"/g, '""')}"`,
      `"${c.className.replace(/"/g, '""')}"`,
      c.sectionName,
      c.roll,
      c.plainPin,
    ]);
    const csvContent =
      '\uFEFF' +
      [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n') +
      '\r\n';
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `student_credential_pins_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-4xl max-h-[92vh] flex flex-col rounded-2xl bg-surface-container-lowest border border-outline-variant/30 shadow-2xl overflow-hidden">
        {/* Header - Screen view */}
        <div className="px-6 py-4 border-b border-outline-variant/20 flex items-center justify-between bg-surface-container-low/50 no-print">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-600">
              <CheckCircle className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-on-surface">
                {credentials.length === 1
                  ? 'Student Portal Credential Slip • 6-Digit PIN Generated'
                  : 'Bulk Import Successful • Generated Credential Slips'}
              </h2>
              <p className="text-xs text-on-surface-variant">
                {credentials.length === 1
                  ? `One-time plain 6-digit PIN slip for ${credentials[0].name} (${credentials[0].studentId})`
                  : `Enrolled ${credentials.length} students with auto-generated IDs & system PINs`}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-surface-container-high text-on-surface-variant hover:text-on-surface cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Security Alert Banner */}
        <div className="p-4 bg-amber-500/10 border-b border-amber-500/20 flex items-start gap-3 no-print">
          <ShieldCheck className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div className="text-xs text-amber-900 dark:text-amber-200 leading-relaxed">
            <strong>Security Notice:</strong> All passwords have been securely hashed with{' '}
            <code className="font-mono font-bold bg-amber-500/20 px-1.5 py-0.5 rounded text-[11px]">
              bcrypt
            </code>{' '}
            in the database. This plain 6-digit PIN list is available <strong>only during this session</strong>.
            Please download the CSV or print the credential slips before closing this modal.
          </div>
        </div>

        {/* Search & Actions Bar */}
        <div className="px-6 py-3 border-b border-outline-variant/15 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-surface-container-lowest no-print">
          <div className="relative flex-1 max-w-sm">
            <Search className="w-4 h-4 text-on-surface-variant absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by student name, ID, or roll..."
              className="w-full pl-9 pr-3 py-1.5 rounded-xl bg-surface-container-low border border-outline-variant/25 text-xs text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:border-primary"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleCopyAll}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-surface-container-low hover:bg-surface-container border border-outline-variant/30 text-xs font-semibold cursor-pointer transition-colors"
            >
              {copiedAll ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Copied All</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-on-surface-variant" />
                  <span>Copy List</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleExportCsv}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold cursor-pointer transition-colors shadow-sm"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export PINs (CSV)</span>
            </button>

            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary hover:bg-primary/90 text-on-primary text-xs font-bold cursor-pointer transition-colors shadow-sm"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print Credential Slips</span>
            </button>
          </div>
        </div>

        {/* Credentials Grid / List */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {filtered.map((cred) => (
              <div
                key={cred.studentId}
                className="rounded-xl p-4 bg-surface-container-low border border-outline-variant/20 hover:border-primary/40 transition-all flex flex-col justify-between gap-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-bold text-on-surface">{cred.name}</h3>
                    <p className="text-xs text-on-surface-variant">
                      {cred.className} &bull; Section {cred.sectionName} &bull; Roll{' '}
                      <strong>{cred.roll}</strong>
                    </p>
                  </div>
                  <span className="font-mono text-xs font-bold text-primary px-2 py-0.5 rounded bg-primary/10 border border-primary/20">
                    {cred.studentId}
                  </span>
                </div>

                <div className="p-2.5 rounded-lg bg-surface-container-lowest border border-outline-variant/15 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <KeyRound className="w-4 h-4 text-amber-600" />
                    <div>
                      <div className="text-[10px] uppercase font-bold text-on-surface-variant">
                        6-Digit Initial PIN
                      </div>
                      <div className="font-mono text-base font-bold tracking-wider text-on-surface">
                        {cred.plainPin}
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleCopySingle(cred.studentId, cred.plainPin)}
                    className="p-1.5 rounded-lg hover:bg-surface-container text-on-surface-variant hover:text-on-surface cursor-pointer"
                    title="Copy student ID and PIN"
                  >
                    {copiedId === cred.studentId ? (
                      <Check className="w-4 h-4 text-emerald-600" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Printable Slips Section (Rendered on Print) */}
        <div className="hidden print:block p-8">
          <div className="text-center mb-6 border-b pb-4">
            <h1 className="text-xl font-bold">{schoolName || 'Institute Management System'}</h1>
            <h2 className="text-sm font-semibold text-gray-600">Student Portal Credential Slips</h2>
            <p className="text-xs text-gray-500">
              Hand these one-time PIN slips to students or guardians for portal access
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {credentials.map((cred) => (
              <div
                key={cred.studentId}
                className="border-2 border-dashed border-gray-400 p-4 rounded-lg break-inside-avoid space-y-2"
              >
                <div className="flex justify-between items-start border-b pb-2">
                  <div>
                    <div className="text-[11px] font-bold text-gray-500 uppercase">Student Name</div>
                    <div className="text-sm font-bold">{cred.name}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[11px] font-bold text-gray-500 uppercase">Student ID</div>
                    <div className="font-mono font-bold text-xs">{cred.studentId}</div>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 text-xs py-1">
                  <div>
                    <span className="text-gray-500">Class:</span> <strong>{cred.className}</strong>
                  </div>
                  <div>
                    <span className="text-gray-500">Section:</span> <strong>{cred.sectionName}</strong>
                  </div>
                  <div>
                    <span className="text-gray-500">Roll:</span> <strong>{cred.roll}</strong>
                  </div>
                </div>

                <div className="bg-gray-100 p-2 rounded flex justify-between items-center text-xs">
                  <span className="font-semibold text-gray-700">Initial Login PIN:</span>
                  <span className="font-mono text-base font-bold tracking-widest">{cred.plainPin}</span>
                </div>

                <div className="text-[10px] text-gray-500 text-center pt-1">
                  Portal Login: Use Student ID + 6-digit PIN. Change password after first sign in.
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-outline-variant/20 flex items-center justify-between bg-surface-container-low/50 no-print">
          <span className="text-xs text-on-surface-variant font-medium">
            Showing {filtered.length} of {credentials.length} student credentials
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl bg-primary hover:bg-primary/90 text-on-primary text-xs font-bold cursor-pointer transition-colors shadow-sm"
          >
            Done &amp; Refresh Register
          </button>
        </div>
      </div>
    </div>
  );
}
