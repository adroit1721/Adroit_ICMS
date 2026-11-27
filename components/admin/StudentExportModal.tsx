'use client';

import { useState } from 'react';
import {
  Download,
  FileSpreadsheet,
  FileText,
  Printer,
  X,
  Check,
  CheckSquare,
  Square,
  Users,
  CalendarCheck,
  UserCheck,
} from 'lucide-react';
import { Student } from '@/lib/types';
import { getEffectiveStudentSchema } from '@/lib/student-schema';
import { formatDateDDMMYYYY } from '@/lib/academic-helpers';

interface StudentExportModalProps {
  students: Student[];
  instituteRules: any;
  cmsConfig: any;
  defaultClassName: string;
  defaultSectionName: string;
  onClose: () => void;
  showToast: (msg: string) => void;
}

export default function StudentExportModal({
  students,
  instituteRules,
  cmsConfig,
  defaultClassName,
  defaultSectionName,
  onClose,
  showToast,
}: StudentExportModalProps) {
  const schema = getEffectiveStudentSchema(instituteRules);

  const allExportableFields = [
    { id: 'rollNumber', label: 'Class Roll', defaultSelected: true },
    { id: 'systemId', label: 'Student ID', defaultSelected: true },
    { id: 'fullName', label: 'Name (English)', defaultSelected: true },
    { id: 'banglaName', label: 'Name (Bangla)', defaultSelected: false },
    { id: 'className', label: 'Class', defaultSelected: true },
    { id: 'sectionName', label: 'Section', defaultSelected: true },
    { id: 'group', label: 'Group', defaultSelected: true },
    { id: 'shift', label: 'Shift', defaultSelected: false },
    { id: 'gender', label: 'Gender', defaultSelected: true },
    { id: 'religionGroup', label: 'Religion', defaultSelected: false },
    { id: 'dateOfBirth', label: 'Date of Birth', defaultSelected: true },
    { id: 'birthRegOrNid', label: 'Birth Registration No.', defaultSelected: false },
    { id: 'bloodGroup', label: 'Blood Group', defaultSelected: false },
    { id: 'phone', label: 'Primary Mobile', defaultSelected: true },
    { id: 'registrationNumber', label: 'Board Registration No.', defaultSelected: false },
    { id: 'fatherName', label: 'Father Name', defaultSelected: true },
    { id: 'fatherPhone', label: 'Father Mobile', defaultSelected: true },
    { id: 'fatherNid', label: 'Father NID', defaultSelected: false },
    { id: 'fatherOccupation', label: 'Father Occupation', defaultSelected: false },
    { id: 'motherName', label: 'Mother Name', defaultSelected: true },
    { id: 'motherPhone', label: 'Mother Mobile', defaultSelected: true },
    { id: 'motherNid', label: 'Mother NID', defaultSelected: false },
    { id: 'motherOccupation', label: 'Mother Occupation', defaultSelected: false },
    { id: 'guardianName', label: 'Local Guardian', defaultSelected: false },
    { id: 'presentAddress', label: 'Present Address', defaultSelected: true },
    { id: 'permanentAddress', label: 'Permanent Address', defaultSelected: false },
  ];

  const [selectedFields, setSelectedFields] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    allExportableFields.forEach((f) => {
      init[f.id] = f.defaultSelected;
    });
    return init;
  });

  const toggleField = (id: string) => {
    setSelectedFields((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const applyPreset = (preset: 'attendance' | 'guardians' | 'fullbio') => {
    const next: Record<string, boolean> = {};
    allExportableFields.forEach((f) => {
      if (preset === 'attendance') {
        next[f.id] = ['rollNumber', 'systemId', 'fullName', 'className', 'sectionName', 'gender'].includes(f.id);
      } else if (preset === 'guardians') {
        next[f.id] = ['rollNumber', 'fullName', 'phone', 'fatherName', 'fatherPhone', 'motherName', 'motherPhone', 'presentAddress'].includes(f.id);
      } else {
        next[f.id] = true; // Full bio
      }
    });
    setSelectedFields(next);
  };

  // Rule 1: Full CSV/Excel export (~30+ columns with text-string formatting for phone, birth reg, NID)
  const handleFullExcelCsvExport = () => {
    const headers = [
      'System ID',
      'Roll',
      'Full Name (English)',
      'Name (Bangla)',
      'Class',
      'Section',
      'Shift',
      'Group',
      'Gender',
      'Religion',
      'Date of Birth',
      'Birth Reg No',
      'Blood Group',
      'Primary Mobile',
      'Board Reg No',
      'Father Name',
      'Father Mobile',
      'Father NID',
      'Father Occupation',
      'Mother Name',
      'Mother Mobile',
      'Mother NID',
      'Mother Occupation',
      'Guardian Name',
      'Guardian Phone',
      'Present Address',
      'Permanent Address',
      'Batch/Session',
      'Status',
    ];

    const rows = students.map((s) => [
      s.systemId || '',
      s.rollNumber || '',
      `"${(s.fullName || '').replace(/"/g, '""')}"`,
      `"${(s.banglaName || '').replace(/"/g, '""')}"`,
      `"${(s.className || '').replace(/"/g, '""')}"`,
      s.sectionName || '',
      s.shift || '',
      s.group || '',
      s.gender || '',
      s.religionGroup || '',
      formatDateDDMMYYYY(s.dateOfBirth),
      s.birthRegOrNid ? `="${s.birthRegOrNid}"` : '', // Force text string in Excel
      s.bloodGroup || '',
      s.phone ? `="${s.phone}"` : '', // Force text string so leading 0 isn't stripped and scientific notation avoided
      s.registrationNumber ? `="${s.registrationNumber}"` : '',
      `"${(s.fatherName || '').replace(/"/g, '""')}"`,
      s.fatherPhone ? `="${s.fatherPhone}"` : '',
      s.fatherNid ? `="${s.fatherNid}"` : '',
      `"${(s.fatherOccupation || '').replace(/"/g, '""')}"`,
      `"${(s.motherName || '').replace(/"/g, '""')}"`,
      s.motherPhone ? `="${s.motherPhone}"` : '',
      s.motherNid ? `="${s.motherNid}"` : '',
      `"${(s.motherOccupation || '').replace(/"/g, '""')}"`,
      `"${(s.guardianName || '').replace(/"/g, '""')}"`,
      s.guardianPhone ? `="${s.guardianPhone}"` : '',
      `"${(s.presentAddress || s.address || '').replace(/"/g, '""')}"`,
      `"${(s.permanentAddress || '').replace(/"/g, '""')}"`,
      s.batchCycle || '',
      s.status || 'Active',
    ]);

    const csvContent =
      '\uFEFF' +
      [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n') +
      '\r\n';

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `student_register_full_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast(`Exported full CSV register for ${students.length} students.`);
    onClose();
  };

  // Rule 2: Field-Selectable Word (.doc) export
  const handleWordExport = () => {
    const activeCols = allExportableFields.filter((f) => selectedFields[f.id]);

    let html = `
      <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/1999/xlink">
      <head><meta charset="utf-8"><title>Student Register</title>
      <style>
        body { font-family: 'Calibri', Arial, sans-serif; font-size: 11pt; color: #111; }
        h1 { text-align: center; color: #1e3a8a; margin-bottom: 4px; }
        h2 { text-align: center; font-size: 13pt; color: #475569; margin-top: 0; margin-bottom: 20px; }
        table { width: 100%; border-collapse: collapse; margin-top: 10px; }
        th, td { border: 1px solid #cbd5e1; padding: 6px 8px; font-size: 10pt; text-align: left; }
        th { background-color: #f1f5f9; color: #0f172a; font-weight: bold; }
        tr:nth-child(even) { background-color: #f8fafc; }
      </style></head>
      <body>
        <h1>${cmsConfig.schoolName || 'Institute Management System'}</h1>
        <h2>Student Register Report (${students.length} Students)</h2>
        <table>
          <thead>
            <tr>
              <th>SL</th>
              ${activeCols.map((col) => `<th>${col.label}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
    `;

    students.forEach((stu, idx) => {
      html += `<tr><td>${idx + 1}</td>`;
      activeCols.forEach((col) => {
        let val = '';
        if (col.id === 'rollNumber') val = String(stu.rollNumber || '');
        else if (col.id === 'systemId') val = stu.systemId || '';
        else if (col.id === 'fullName') val = stu.fullName || '';
        else if (col.id === 'banglaName') val = stu.banglaName || '';
        else if (col.id === 'className') val = stu.className || '';
        else if (col.id === 'sectionName') val = stu.sectionName || '';
        else if (col.id === 'group') val = stu.group || '';
        else if (col.id === 'shift') val = stu.shift || '';
        else if (col.id === 'gender') val = stu.gender || '';
        else if (col.id === 'religionGroup') val = stu.religionGroup || '';
        else if (col.id === 'dateOfBirth') val = formatDateDDMMYYYY(stu.dateOfBirth);
        else if (col.id === 'birthRegOrNid') val = stu.birthRegOrNid || '';
        else if (col.id === 'bloodGroup') val = stu.bloodGroup || '';
        else if (col.id === 'phone') val = stu.phone || '';
        else if (col.id === 'registrationNumber') val = stu.registrationNumber || '';
        else if (col.id === 'fatherName') val = stu.fatherName || '';
        else if (col.id === 'fatherPhone') val = stu.fatherPhone || '';
        else if (col.id === 'fatherNid') val = stu.fatherNid || '';
        else if (col.id === 'fatherOccupation') val = stu.fatherOccupation || '';
        else if (col.id === 'motherName') val = stu.motherName || '';
        else if (col.id === 'motherPhone') val = stu.motherPhone || '';
        else if (col.id === 'motherNid') val = stu.motherNid || '';
        else if (col.id === 'motherOccupation') val = stu.motherOccupation || '';
        else if (col.id === 'guardianName') val = stu.guardianName || '';
        else if (col.id === 'presentAddress') val = stu.presentAddress || stu.address || '';
        else if (col.id === 'permanentAddress') val = stu.permanentAddress || '';

        html += `<td>${val}</td>`;
      });
      html += `</tr>`;
    });

    html += `</tbody></table></body></html>`;

    const blob = new Blob(['\ufeff' + html], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `student_register_${new Date().toISOString().slice(0, 10)}.doc`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast(`Exported Word document for ${students.length} students.`);
    onClose();
  };

  const handlePrintView = () => {
    // Open print window with active fields
    window.print();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-3xl max-h-[90vh] flex flex-col rounded-2xl bg-surface-container-lowest border border-outline-variant/30 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-outline-variant/20 flex items-center justify-between bg-surface-container-low/50">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-primary/10 text-primary">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-on-surface">
                Split Export Register ({students.length} Students Selected)
              </h2>
              <p className="text-xs text-on-surface-variant">
                Full Excel/CSV or Field-Selectable Export for Word (.doc) and Print/PDF
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

        {/* Presets & Info Bar */}
        <div className="p-5 border-b border-outline-variant/25 bg-surface-container-lowest space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <span className="text-xs font-bold text-on-surface uppercase tracking-wider">
              Quick Presets for Print / Word
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => applyPreset('attendance')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-surface-container hover:bg-surface-container-high text-xs font-semibold cursor-pointer border border-outline-variant/30"
              >
                <CalendarCheck className="w-3.5 h-3.5 text-primary" /> Attendance Sheet
              </button>
              <button
                type="button"
                onClick={() => applyPreset('guardians')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-surface-container hover:bg-surface-container-high text-xs font-semibold cursor-pointer border border-outline-variant/30"
              >
                <Users className="w-3.5 h-3.5 text-blue-600" /> Guardian Contacts
              </button>
              <button
                type="button"
                onClick={() => applyPreset('fullbio')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-surface-container hover:bg-surface-container-high text-xs font-semibold cursor-pointer border border-outline-variant/30"
              >
                <UserCheck className="w-3.5 h-3.5 text-emerald-600" /> Full Bio
              </button>
            </div>
          </div>
        </div>

        {/* Checkbox Grid */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">
              Select Fields to Include in Word / Print Export
            </span>
            <button
              type="button"
              onClick={() => {
                const all: Record<string, boolean> = {};
                allExportableFields.forEach((f) => (all[f.id] = true));
                setSelectedFields(all);
              }}
              className="text-xs text-primary font-bold hover:underline cursor-pointer"
            >
              Select All
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
            {allExportableFields.map((field) => {
              const isChecked = Boolean(selectedFields[field.id]);
              return (
                <button
                  key={field.id}
                  type="button"
                  onClick={() => toggleField(field.id)}
                  className={`flex items-center gap-2.5 p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                    isChecked
                      ? 'bg-primary/5 border-primary/30 text-on-surface font-medium'
                      : 'bg-surface-container-low border-outline-variant/20 text-on-surface-variant hover:bg-surface-container'
                  }`}
                >
                  {isChecked ? (
                    <CheckSquare className="w-4 h-4 text-primary shrink-0" />
                  ) : (
                    <Square className="w-4 h-4 text-on-surface-variant shrink-0" />
                  )}
                  <span className="text-xs">{field.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-outline-variant/20 flex flex-col sm:flex-row items-center justify-between gap-3 bg-surface-container-low/50">
          <button
            type="button"
            onClick={handleFullExcelCsvExport}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-sm cursor-pointer transition-colors"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Full Excel (.csv) with Text Formatting</span>
          </button>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={handleWordExport}
              className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-sm cursor-pointer transition-colors"
            >
              <Download className="w-4 h-4" />
              <span>Export Word (.doc)</span>
            </button>

            <button
              type="button"
              onClick={handlePrintView}
              className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-primary hover:bg-primary/90 text-on-primary text-xs font-bold shadow-sm cursor-pointer transition-colors"
            >
              <Printer className="w-4 h-4" />
              <span>Print / PDF</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
