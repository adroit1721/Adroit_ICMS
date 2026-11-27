'use client';

import { useState } from 'react';
import {
  AlertTriangle,
  CheckCircle,
  FileSpreadsheet,
  X,
  AlertCircle,
  Check,
  ChevronRight,
  Filter,
} from 'lucide-react';
import { BulkImportCellError } from '@/app/api/students/bulk-import/route';

interface BulkImportReviewModalProps {
  fileName: string;
  totalRows: number;
  validRowsCount: number;
  errorCount: number;
  errors: BulkImportCellError[];
  preview: Array<{
    row: number;
    isValid: boolean;
    data: Record<string, string>;
    errors: BulkImportCellError[];
  }>;
  onCommit: (commitValidOnly: boolean) => void;
  onClose: () => void;
  isCommitting: boolean;
}

export default function BulkImportReviewModal({
  fileName,
  totalRows,
  validRowsCount,
  errorCount,
  errors,
  preview,
  onCommit,
  onClose,
  isCommitting,
}: BulkImportReviewModalProps) {
  const [activeTab, setActiveTab] = useState<'errors' | 'all'>(
    errorCount > 0 ? 'errors' : 'all'
  );
  const [searchFilter, setSearchFilter] = useState('');

  const filteredErrors = errors.filter(
    (e) =>
      !searchFilter.trim() ||
      String(e.row).includes(searchFilter) ||
      e.column.toLowerCase().includes(searchFilter.toLowerCase()) ||
      e.reason.toLowerCase().includes(searchFilter.toLowerCase()) ||
      e.value.toLowerCase().includes(searchFilter.toLowerCase())
  );

  const filteredPreview = preview.filter((p) => {
    if (activeTab === 'errors' && p.isValid) return false;
    if (!searchFilter.trim()) return true;
    const term = searchFilter.toLowerCase();
    return (
      String(p.row).includes(term) ||
      (p.data['fullName'] || '').toLowerCase().includes(term) ||
      (p.data['className'] || '').toLowerCase().includes(term) ||
      (p.data['rollNumber'] || '').toLowerCase().includes(term) ||
      (p.data['phone'] || '').toLowerCase().includes(term)
    );
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-5xl max-h-[92vh] flex flex-col rounded-2xl bg-surface-container-lowest border border-outline-variant/30 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-outline-variant/20 flex items-center justify-between bg-surface-container-low/50">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-primary/10 text-primary">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-on-surface">
                  Bulk CSV Import Validation
                </h2>
                <span className="font-mono text-xs px-2 py-0.5 rounded-md bg-surface-container text-on-surface-variant font-medium">
                  {fileName}
                </span>
              </div>
              <p className="text-xs text-on-surface-variant">
                Pre-commit dry-run analysis checking active schema, duplicate rolls, mobile formats, and NCTB rules
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isCommitting}
            className="p-2 rounded-xl hover:bg-surface-container-high text-on-surface-variant hover:text-on-surface cursor-pointer disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Status Metrics Bar */}
        <div className="p-4 border-b border-outline-variant/15 bg-surface-container-lowest grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="rounded-xl p-3 bg-surface-container-low/60 border border-outline-variant/20 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-surface-container flex items-center justify-center font-bold text-on-surface">
              {totalRows}
            </div>
            <div>
              <div className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider">
                Total Rows
              </div>
              <div className="text-xs text-on-surface-variant/80">Analyzed from CSV</div>
            </div>
          </div>

          <div className="rounded-xl p-3 bg-emerald-500/10 border border-emerald-500/20 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold">
              <CheckCircle className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider">
                {validRowsCount} Valid Rows
              </div>
              <div className="text-xs text-emerald-800/70 dark:text-emerald-400/70">
                Ready to commit to database
              </div>
            </div>
          </div>

          <div
            className={`rounded-xl p-3 border flex items-center gap-3 ${
              errorCount > 0
                ? 'bg-rose-500/10 border-rose-500/20'
                : 'bg-surface-container-low/60 border-outline-variant/20'
            }`}
          >
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold ${
                errorCount > 0
                  ? 'bg-rose-500/20 text-rose-600 dark:text-rose-400'
                  : 'bg-surface-container text-on-surface-variant'
              }`}
            >
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <div
                className={`text-xs font-semibold uppercase tracking-wider ${
                  errorCount > 0
                    ? 'text-rose-700 dark:text-rose-400'
                    : 'text-on-surface-variant'
                }`}
              >
                {errorCount} {errorCount === 1 ? 'Error Cell' : 'Error Cells'}
              </div>
              <div className="text-xs text-on-surface-variant/80">
                {errorCount > 0 ? 'Failing cell validations' : 'No errors found'}
              </div>
            </div>
          </div>
        </div>

        {/* View Toggle & Search */}
        <div className="px-6 py-2.5 border-b border-outline-variant/15 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-surface-container-lowest">
          <div className="flex items-center gap-1.5 p-1 rounded-xl bg-surface-container-low border border-outline-variant/20">
            <button
              type="button"
              onClick={() => setActiveTab('errors')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'errors'
                  ? 'bg-rose-600 text-white shadow-sm'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              Failing Cells ({errorCount})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'all'
                  ? 'bg-primary text-on-primary shadow-sm'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              All Rows ({totalRows})
            </button>
          </div>

          <div className="relative w-full sm:w-64">
            <Filter className="w-3.5 h-3.5 text-on-surface-variant absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              placeholder="Search by row, name, or reason..."
              className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-surface-container-low border border-outline-variant/20 text-xs text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:border-primary"
            />
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {activeTab === 'errors' ? (
            errorCount === 0 ? (
              <div className="py-12 flex flex-col items-center justify-center text-center space-y-2">
                <div className="w-12 h-12 rounded-2xl bg-emerald-500/15 text-emerald-600 flex items-center justify-center">
                  <CheckCircle className="w-6 h-6" />
                </div>
                <h3 className="text-sm font-bold text-on-surface">All Rows are 100% Valid!</h3>
                <p className="text-xs text-on-surface-variant max-w-sm">
                  Every column satisfied active mandatory schema requirements, roll uniqueness, and format checks.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-3 flex items-start gap-2.5 text-xs text-rose-800 dark:text-rose-300">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>
                    Validation found <strong>{errorCount} failing cell(s)</strong>. Review each failing row below. You can choose to <strong>Commit Valid Rows Only</strong> or cancel to edit your CSV.
                  </span>
                </div>

                <div className="rounded-xl border border-outline-variant/25 overflow-hidden">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-surface-container-low text-on-surface-variant font-semibold border-b border-outline-variant/20">
                      <tr>
                        <th className="py-2.5 px-3 w-16">Row #</th>
                        <th className="py-2.5 px-3 w-40">Column / Field</th>
                        <th className="py-2.5 px-3 w-44">Provided Value</th>
                        <th className="py-2.5 px-3">Validation Reason</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-outline-variant/15">
                      {filteredErrors.map((err, i) => (
                        <tr key={i} className="hover:bg-rose-500/5 transition-colors">
                          <td className="py-2.5 px-3 font-mono font-bold text-on-surface">
                            #{err.row}
                          </td>
                          <td className="py-2.5 px-3 font-semibold text-rose-700 dark:text-rose-400">
                            {err.column}
                          </td>
                          <td className="py-2.5 px-3">
                            {err.value ? (
                              <code className="px-2 py-0.5 rounded bg-rose-500/10 text-rose-600 font-mono text-[11px] font-semibold">
                                {err.value}
                              </code>
                            ) : (
                              <span className="italic text-rose-500 text-[11px]">(Empty / Missing)</span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-on-surface">{err.reason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          ) : (
            /* All Rows Preview Table */
            <div className="rounded-xl border border-outline-variant/25 overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse min-w-[700px]">
                <thead className="bg-surface-container-low text-on-surface-variant font-semibold border-b border-outline-variant/20">
                  <tr>
                    <th className="py-2.5 px-3 w-16">Status</th>
                    <th className="py-2.5 px-3 w-16">Row #</th>
                    <th className="py-2.5 px-3">Name</th>
                    <th className="py-2.5 px-3">Class &amp; Sec</th>
                    <th className="py-2.5 px-3">Roll</th>
                    <th className="py-2.5 px-3">Primary Mobile</th>
                    <th className="py-2.5 px-3">DOB</th>
                    <th className="py-2.5 px-3">Issues</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/15">
                  {filteredPreview.map((item) => (
                    <tr
                      key={item.row}
                      className={item.isValid ? 'hover:bg-surface-container-low/50' : 'bg-rose-500/5'}
                    >
                      <td className="py-2 px-3">
                        {item.isValid ? (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 font-bold text-[10px]">
                            <Check className="w-3 h-3" /> Valid
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-600 font-bold text-[10px]">
                            <AlertTriangle className="w-3 h-3" /> Invalid
                          </span>
                        )}
                      </td>
                      <td className="py-2 px-3 font-mono font-medium text-on-surface-variant">
                        #{item.row}
                      </td>
                      <td className="py-2 px-3 font-semibold text-on-surface">
                        {item.data['fullName'] || '—'}
                      </td>
                      <td className="py-2 px-3 text-on-surface-variant">
                        {item.data['className'] || '—'}{' '}
                        {item.data['sectionName'] ? `(${item.data['sectionName']})` : ''}
                      </td>
                      <td className="py-2 px-3 font-mono text-on-surface">
                        {item.data['rollNumber'] || '—'}
                      </td>
                      <td className="py-2 px-3 font-mono text-on-surface-variant">
                        {item.data['phone'] || '—'}
                      </td>
                      <td className="py-2 px-3 font-mono text-on-surface-variant">
                        {item.data['dateOfBirth'] || '—'}
                      </td>
                      <td className="py-2 px-3 text-xs text-rose-600">
                        {item.errors.length > 0 ? (
                          <span>{item.errors.map((e) => `${e.column}: ${e.reason}`).join('; ')}</span>
                        ) : (
                          <span className="text-emerald-600">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-outline-variant/20 flex flex-col sm:flex-row items-center justify-between gap-3 bg-surface-container-low/50">
          <button
            type="button"
            onClick={onClose}
            disabled={isCommitting}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-on-surface-variant hover:bg-surface-container cursor-pointer transition-colors"
          >
            Cancel &amp; Re-upload
          </button>

          <div className="flex items-center gap-2.5 w-full sm:w-auto">
            {errorCount > 0 && validRowsCount > 0 && (
              <button
                type="button"
                onClick={() => onCommit(true)}
                disabled={isCommitting}
                className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold cursor-pointer transition-colors shadow-sm disabled:opacity-50"
              >
                <span>Commit Valid Rows Only ({validRowsCount})</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            )}

            <button
              type="button"
              onClick={() => onCommit(false)}
              disabled={errorCount > 0 || isCommitting || totalRows === 0}
              className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold transition-all shadow-sm ${
                errorCount === 0
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer'
                  : 'bg-surface-container text-on-surface-variant/40 cursor-not-allowed'
              }`}
            >
              {isCommitting ? (
                <span>Generating IDs &amp; PINs...</span>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  <span>
                    {errorCount === 0
                      ? `Confirm & Commit All (${totalRows} Students)`
                      : 'Fix Errors to Commit All'}
                  </span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
