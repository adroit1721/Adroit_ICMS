'use client';

import { useState, useEffect } from 'react';
import {
  CMSConfig,
  Exam,
  ExamResultRecord,
  MarksheetCustomField,
  MarksheetTemplate,
  Signatory,
  Student,
  StudentMarksheetMeta,
  Teacher,
} from '@/lib/types';
import { compileStudentExamRecord } from '@/lib/grading-engine';
import { generateQrDataUrl } from '@/lib/qr';
import MediaUploadInput from '@/components/admin/MediaUploadInput';
import MarksheetDocument, {
  resolveMarksheetTemplate,
  ResolvedMarksheetTemplate,
} from '@/components/common/MarksheetDocument';
import {
  CheckCircle2,
  CopyCheck,
  FileText,
  Layers,
  Palette,
  Plus,
  Printer,
  Save,
  Sparkles,
  Trash2,
  UserCheck,
} from 'lucide-react';
import type { Subject, MarkEntry } from '@/lib/types';

interface MarksheetDesignerPanelProps {
  currentExam: Exam;
  allExams: Exam[];
  students: Student[];
  subjects: Subject[];
  markEntries: MarkEntry[];
  teachers: Teacher[];
  cmsConfig: CMSConfig;
  combinePairedPapers: boolean;
  rankedMap: Map<string, ExamResultRecord>;
  selectedStudentId: string;
  onChangeStudentId: (studentId: string) => void;
  onUpdateExam: (id: string, updates: Partial<Exam>) => void;
  onToast: (msg: string) => void;
}

const ACCENT_PRESETS = [
  { label: 'Crimson Board', hex: '#9a3412' },
  { label: 'Royal Navy', hex: '#004f7b' },
  { label: 'Emerald Seal', hex: '#005236' },
  { label: 'Slate Classic', hex: '#1e293b' },
  { label: 'Gold & Burgundy', hex: '#781f00' },
];

export default function MarksheetDesignerPanel({
  currentExam,
  allExams,
  students,
  subjects,
  markEntries,
  teachers,
  cmsConfig,
  combinePairedPapers,
  rankedMap,
  selectedStudentId,
  onChangeStudentId,
  onUpdateExam,
  onToast,
}: MarksheetDesignerPanelProps) {
  const [studioSection, setStudioSection] = useState<
    'design' | 'columns' | 'custom-fields' | 'signatories'
  >('design');

  const [stationeryMode, setStationeryMode] = useState<'full-design' | 'pre-printed-overlay'>(
    currentExam.stationeryMode || 'full-design'
  );
  const [bgUrl, setBgUrl] = useState(currentExam.marksheetBgUrl || '');
  const [bgPublicId, setBgPublicId] = useState(currentExam.marksheetBgPublicId || '');
  const [signatories, setSignatories] = useState<Signatory[]>(currentExam.signatories || []);
  const [template, setTemplate] = useState<ResolvedMarksheetTemplate>(() =>
    resolveMarksheetTemplate(currentExam.marksheetTemplate)
  );
  const [metaMap, setMetaMap] = useState<Record<string, StudentMarksheetMeta>>(
    () => currentExam.studentMarksheetMeta || {}
  );
  const [qrDataUrl, setQrDataUrl] = useState('');

  // Custom field creator state
  const [newFieldLabel, setNewFieldLabel] = useState('');
  const [newFieldScope, setNewFieldScope] = useState<'exam-wide' | 'per-student'>('per-student');
  const [newFieldPlacement, setNewFieldPlacement] = useState<'student-grid' | 'footer-notes'>(
    'student-grid'
  );
  const [newFieldDefault, setNewFieldDefault] = useState('');

  // Candidates filtered by targetClasses when set
  const eligibleCandidates =
    currentExam.targetClasses && currentExam.targetClasses.length > 0
      ? students.filter((s) => currentExam.targetClasses!.includes(s.className))
      : students;
  const activeStudent =
    eligibleCandidates.find((s) => s.id === selectedStudentId) ||
    eligibleCandidates[0] ||
    students[0] ||
    null;

  const activeResult = activeStudent
    ? (currentExam.savedTabulation?.records || []).find(
        (r) => r.studentId === activeStudent.id || r.systemId === activeStudent.systemId
      ) ||
      rankedMap.get(activeStudent.id) ||
      compileStudentExamRecord(activeStudent, currentExam, subjects, markEntries, {
        combinePairedPapers,
      })
    : null;

  const activeResultId = activeResult?.id;
  const activeResultSystemId = activeResult?.systemId;

  useEffect(() => {
    if (!activeResultId || !activeResultSystemId) return;
    const origin =
      typeof window !== 'undefined' ? window.location.origin : 'https://portal.institute.edu';
    generateQrDataUrl(
      `${origin}/academics?verify=${activeResultId}&sysId=${activeResultSystemId}`
    ).then(setQrDataUrl);
  }, [activeResultId, activeResultSystemId]);

  const activeStudentMeta: StudentMarksheetMeta =
    (activeStudent && metaMap[activeStudent.id]) || {};

  const updateActiveStudentMeta = (patch: Partial<StudentMarksheetMeta>) => {
    if (!activeStudent) return;
    setMetaMap((prev) => ({
      ...prev,
      [activeStudent.id]: {
        ...(prev[activeStudent.id] || {}),
        ...patch,
      },
    }));
  };

  const updateActiveStudentCustomVal = (fieldId: string, val: string) => {
    if (!activeStudent) return;
    setMetaMap((prev) => ({
      ...prev,
      [activeStudent.id]: {
        ...(prev[activeStudent.id] || {}),
        customValues: {
          ...(prev[activeStudent.id]?.customValues || {}),
          [fieldId]: val,
        },
      },
    }));
  };

  const buildCleanTemplatePayload = (): MarksheetTemplate => ({
    borderStyle: template.borderStyle,
    accentColor: template.accentColor,
    fontFamily: template.fontFamily,
    watermarkOpacity: template.watermarkOpacity,
    boardTitle: template.boardTitle,
    headerSubtitle: template.headerSubtitle,
    defaultWorkingDays: template.defaultWorkingDays,
    showHeader: template.showHeader,
    showStudentPhoto: template.showStudentPhoto,
    showBanglaName: template.showBanglaName,
    showFatherMother: template.showFatherMother,
    showRollReg: template.showRollReg,
    showClassSectionGroup: template.showClassSectionGroup,
    showSystemId: template.showSystemId,
    showDateOfBirth: template.showDateOfBirth,
    showGradingScale: template.showGradingScale,
    showSubjectCode: template.showSubjectCode,
    showFullMarksCol: template.showFullMarksCol,
    showPassMarksCol: template.showPassMarksCol,
    showCombinedPaperDetails: template.showCombinedPaperDetails,
    showGradePointCol: template.showGradePointCol,
    showCoreGpaAndBonus: template.showCoreGpaAndBonus,
    showMeritRank: template.showMeritRank,
    showAttendanceConduct: template.showAttendanceConduct,
    showQrVerification: template.showQrVerification,
    customFields: template.customFields,
  });

  const handleSaveToCurrentExam = () => {
    onUpdateExam(currentExam.id, {
      stationeryMode,
      marksheetBgUrl: bgUrl,
      marksheetBgPublicId: bgPublicId,
      signatories,
      marksheetTemplate: buildCleanTemplatePayload(),
      studentMarksheetMeta: metaMap,
    });
    onToast(`Custom marksheet design & transcript data saved for "${currentExam.title}".`);
  };

  const handleApplyToAllExams = () => {
    const cleanTpl = buildCleanTemplatePayload();
    for (const ex of allExams) {
      onUpdateExam(ex.id, {
        stationeryMode,
        marksheetBgUrl: bgUrl,
        marksheetBgPublicId: bgPublicId,
        signatories,
        marksheetTemplate: cleanTpl,
      });
    }
    onToast(`Applied marksheet template & signatories across ${allExams.length} examination(s).`);
  };

  const handleSaveStudentMeta = () => {
    onUpdateExam(currentExam.id, {
      studentMarksheetMeta: metaMap,
    });
    onToast(
      `Saved attendance, conduct, remark & custom values for ${activeStudent?.fullName || 'student'}.`
    );
  };

  const handleAddCustomField = (e: React.FormEvent) => {
    e.preventDefault();
    const label = newFieldLabel.trim();
    if (!label) return;
    const field: MarksheetCustomField = {
      id: `cf-${Date.now().toString(36)}`,
      label,
      scope: newFieldScope,
      placement: newFieldPlacement,
      defaultValue: newFieldDefault.trim() || undefined,
    };
    setTemplate((prev) => ({
      ...prev,
      customFields: [...prev.customFields, field],
    }));
    setNewFieldLabel('');
    setNewFieldDefault('');
  };

  const handleRemoveCustomField = (id: string) => {
    setTemplate((prev) => ({
      ...prev,
      customFields: prev.customFields.filter((f) => f.id !== id),
    }));
  };

  const perStudentCustomFields = template.customFields.filter((f) => f.scope === 'per-student');

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
      {/* LEFT CONTROLS: MARKSHEET DESIGNER STUDIO */}
      <div className="xl:col-span-5 rounded-2xl bg-surface-container-lowest border border-outline-variant/25 p-5 space-y-5 no-print">
        <div className="border-b border-outline-variant/20 pb-3">
          <div className="flex items-center gap-2 text-primary-container text-[11px] font-bold uppercase tracking-wider">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Custom Marksheet Studio</span>
          </div>
          <h2 className="text-base font-bold text-on-surface mt-0.5">
            Design Transcript Layout &amp; Custom Fields
          </h2>
          <p className="text-xs text-on-surface-variant mt-0.5">
            Changes update the live marksheet preview immediately and sync to Student Portal &amp; Public Results on save.
          </p>
        </div>

        {/* Studio Section Tabs */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 p-1 rounded-xl bg-surface-container-low border border-outline-variant/25 text-[11px]">
          {(
            [
              { id: 'design', label: 'Design', icon: Palette },
              { id: 'columns', label: 'Sections', icon: Layers },
              { id: 'custom-fields', label: 'Custom Data', icon: Plus },
              { id: 'signatories', label: 'Signatories', icon: FileText },
            ] as const
          ).map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setStudioSection(tab.id)}
                className={`py-2 px-2 rounded-lg font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
                  studioSection === tab.id
                    ? 'bg-primary-container text-on-primary shadow-xs'
                    : 'text-on-surface-variant hover:text-on-surface'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* SECTION 1: DESIGN & STATIONERY */}
        {studioSection === 'design' && (
          <div className="space-y-4 text-xs">
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => setStationeryMode('full-design')}
                className={`p-3 rounded-xl border text-left cursor-pointer transition-colors ${
                  stationeryMode === 'full-design'
                    ? 'border-primary-container bg-primary-fixed/25'
                    : 'border-outline-variant/30 bg-surface-container-low'
                }`}
              >
                <div className="font-bold text-on-surface">Full Digital Design</div>
                <div className="text-[10px] text-on-surface-variant mt-0.5">
                  Renders header, frame &amp; crest on plain A4
                </div>
              </button>
              <button
                type="button"
                onClick={() => setStationeryMode('pre-printed-overlay')}
                className={`p-3 rounded-xl border text-left cursor-pointer transition-colors ${
                  stationeryMode === 'pre-printed-overlay'
                    ? 'border-secondary bg-secondary-fixed/25'
                    : 'border-outline-variant/30 bg-surface-container-low'
                }`}
              >
                <div className="font-bold text-on-surface">Pre-Printed Pad</div>
                <div className="text-[10px] text-on-surface-variant mt-0.5">
                  Hides header &amp; border for letterhead paper
                </div>
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-on-surface-variant mb-1">
                  Border Frame Style
                </label>
                <select
                  value={template.borderStyle}
                  onChange={(e) =>
                    setTemplate((prev) => ({
                      ...prev,
                      borderStyle: e.target.value as ResolvedMarksheetTemplate['borderStyle'],
                    }))
                  }
                  className="w-full px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 font-semibold"
                >
                  <option value="classic-double">Classic Double Border</option>
                  <option value="modern-clean">Modern Clean Rounded</option>
                  <option value="official-seal">Official Certificate Box</option>
                  <option value="none">Minimal / Borderless</option>
                </select>
              </div>
              <div>
                <label className="block font-semibold text-on-surface-variant mb-1">
                  Typography Font
                </label>
                <select
                  value={template.fontFamily}
                  onChange={(e) =>
                    setTemplate((prev) => ({
                      ...prev,
                      fontFamily: e.target.value as 'sans' | 'serif',
                    }))
                  }
                  className="w-full px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 font-semibold"
                >
                  <option value="sans">Modern Sans (Clean)</option>
                  <option value="serif">Academic Serif (Formal)</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block font-semibold text-on-surface-variant mb-1.5">
                Accent Seal Color
              </label>
              <div className="flex flex-wrap items-center gap-2">
                {ACCENT_PRESETS.map((preset) => (
                  <button
                    key={preset.hex}
                    type="button"
                    onClick={() => setTemplate((prev) => ({ ...prev, accentColor: preset.hex }))}
                    className={`px-2.5 py-1.5 rounded-lg border text-[11px] font-semibold inline-flex items-center gap-1.5 cursor-pointer ${
                      template.accentColor.toLowerCase() === preset.hex.toLowerCase()
                        ? 'border-on-surface bg-surface-container'
                        : 'border-outline-variant/30 bg-white'
                    }`}
                  >
                    <span
                      className="w-3 h-3 rounded-full inline-block"
                      style={{ backgroundColor: preset.hex }}
                    />
                    <span>{preset.label}</span>
                  </button>
                ))}
                <input
                  type="color"
                  value={template.accentColor}
                  onChange={(e) =>
                    setTemplate((prev) => ({ ...prev, accentColor: e.target.value }))
                  }
                  className="w-8 h-8 rounded-lg border border-outline-variant/40 cursor-pointer"
                  title="Pick custom color"
                />
              </div>
            </div>

            <div className="space-y-2.5">
              <div>
                <label className="block font-semibold text-on-surface-variant mb-1">
                  Optional Education Board / Banner Line
                </label>
                <input
                  type="text"
                  value={template.boardTitle}
                  onChange={(e) =>
                    setTemplate((prev) => ({ ...prev, boardTitle: e.target.value }))
                  }
                  placeholder="e.g. Board of Intermediate & Secondary Education"
                  className="w-full px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div className="sm:col-span-2">
                  <label className="block font-semibold text-on-surface-variant mb-1">
                    Transcript Badge Title
                  </label>
                  <input
                    type="text"
                    value={template.headerSubtitle}
                    onChange={(e) =>
                      setTemplate((prev) => ({ ...prev, headerSubtitle: e.target.value }))
                    }
                    placeholder="Academic Transcript & Official Marksheet"
                    className="w-full px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-on-surface-variant mb-1">
                    Term Working Days
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={365}
                    value={template.defaultWorkingDays ?? ''}
                    placeholder="e.g. 120"
                    onChange={(e) =>
                      setTemplate((prev) => ({
                        ...prev,
                        defaultWorkingDays: e.target.value ? Number(e.target.value) : undefined,
                      }))
                    }
                    className="w-full px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 font-mono"
                  />
                </div>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-surface-container-low/70 border border-outline-variant/25 space-y-3">
              <MediaUploadInput
                label="Watermark / Crest Background Image"
                value={bgUrl}
                onChange={setBgUrl}
                onChangeMedia={({ url, publicId }) => {
                  setBgUrl(url);
                  if (publicId !== undefined) setBgPublicId(publicId);
                }}
                folder="erp/exams"
                previewShape="square"
                buttonLabel="Upload Watermark"
                helperText="Optional background watermark image rendered behind the transcript."
              />
              <div>
                <div className="flex items-center justify-between text-[11px] font-semibold text-on-surface-variant mb-1">
                  <span>Watermark Opacity</span>
                  <span className="font-mono">{Math.round(template.watermarkOpacity * 100)}%</span>
                </div>
                <input
                  type="range"
                  min={0.04}
                  max={0.35}
                  step={0.01}
                  value={template.watermarkOpacity}
                  onChange={(e) =>
                    setTemplate((prev) => ({
                      ...prev,
                      watermarkOpacity: Number(e.target.value),
                    }))
                  }
                  className="w-full accent-primary-container cursor-pointer"
                />
              </div>
            </div>
          </div>
        )}

        {/* SECTION 2: SECTIONS & COLUMNS VISIBILITY */}
        {studioSection === 'columns' && (
          <div className="space-y-4 text-xs">
            <div className="space-y-2">
              <div className="font-bold text-on-surface-variant uppercase text-[10px] tracking-wider">
                Student Profile Fields
              </div>
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    { key: 'showStudentPhoto', label: 'Student Photo' },
                    { key: 'showBanglaName', label: 'Bangla Name' },
                    { key: 'showFatherMother', label: 'Parents Names' },
                    { key: 'showRollReg', label: 'Roll & Board Reg' },
                    { key: 'showClassSectionGroup', label: 'Class / Section / Group' },
                    { key: 'showSystemId', label: 'Student System ID' },
                    { key: 'showDateOfBirth', label: 'Date of Birth' },
                    { key: 'showGradingScale', label: 'Board Grading Chart' },
                  ] as const
                ).map((item) => (
                  <label
                    key={item.key}
                    className="flex items-center gap-2 p-2.5 rounded-xl bg-surface-container-low/70 border border-outline-variant/20 cursor-pointer font-medium"
                  >
                    <input
                      type="checkbox"
                      checked={Boolean(template[item.key])}
                      onChange={(e) =>
                        setTemplate((prev) => ({ ...prev, [item.key]: e.target.checked }))
                      }
                      className="w-4 h-4 rounded text-primary-container"
                    />
                    <span>{item.label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <div className="font-bold text-on-surface-variant uppercase text-[10px] tracking-wider">
                Marks Table &amp; Result Blocks
              </div>
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    { key: 'showHeader', label: 'School Crest & Header' },
                    { key: 'showSubjectCode', label: 'Subject Code Col' },
                    { key: 'showFullMarksCol', label: 'Full Marks Col' },
                    { key: 'showPassMarksCol', label: 'Pass Marks Col' },
                    { key: 'showCombinedPaperDetails', label: '1st/2nd Paper Sub-line' },
                    { key: 'showGradePointCol', label: 'Grade Point (GP) Col' },
                    { key: 'showCoreGpaAndBonus', label: 'Core GPA & 4th Bonus' },
                    { key: 'showMeritRank', label: 'Class & Sec Merit Rank' },
                    { key: 'showAttendanceConduct', label: 'Attendance & Remarks' },
                    { key: 'showQrVerification', label: 'QR Verification Code' },
                  ] as const
                ).map((item) => (
                  <label
                    key={item.key}
                    className="flex items-center gap-2 p-2.5 rounded-xl bg-surface-container-low/70 border border-outline-variant/20 cursor-pointer font-medium"
                  >
                    <input
                      type="checkbox"
                      checked={Boolean(template[item.key])}
                      onChange={(e) =>
                        setTemplate((prev) => ({ ...prev, [item.key]: e.target.checked }))
                      }
                      className="w-4 h-4 rounded text-primary-container"
                    />
                    <span>{item.label}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* SECTION 3: CUSTOM FIELDS BUILDER */}
        {studioSection === 'custom-fields' && (
          <div className="space-y-4 text-xs">
            <form
              onSubmit={handleAddCustomField}
              className="p-4 rounded-xl bg-surface-container-low border border-outline-variant/25 space-y-3"
            >
              <div className="font-bold text-on-surface">Add Custom Field to Marksheet</div>
              <div>
                <label className="block font-semibold text-on-surface-variant mb-1">
                  Field Label *
                </label>
                <input
                  type="text"
                  required
                  value={newFieldLabel}
                  onChange={(e) => setNewFieldLabel(e.target.value)}
                  placeholder="e.g. Result Publish Date, Guardian Phone, Next Term Starts"
                  className="w-full px-3 py-2 rounded-lg bg-white border border-outline-variant/30"
                />
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block font-semibold text-on-surface-variant mb-1">
                    Data Scope
                  </label>
                  <select
                    value={newFieldScope}
                    onChange={(e) =>
                      setNewFieldScope(e.target.value as 'exam-wide' | 'per-student')
                    }
                    className="w-full px-2.5 py-2 rounded-lg bg-white border border-outline-variant/30 font-semibold"
                  >
                    <option value="per-student">Per-Student Value</option>
                    <option value="exam-wide">Same For All Students</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-on-surface-variant mb-1">
                    Placement
                  </label>
                  <select
                    value={newFieldPlacement}
                    onChange={(e) =>
                      setNewFieldPlacement(e.target.value as 'student-grid' | 'footer-notes')
                    }
                    className="w-full px-2.5 py-2 rounded-lg bg-white border border-outline-variant/30 font-semibold"
                  >
                    <option value="student-grid">Top Candidate Bio Grid</option>
                    <option value="footer-notes">Bottom Remarks Card</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block font-semibold text-on-surface-variant mb-1">
                  {newFieldScope === 'exam-wide' ? 'Value *' : 'Default Value (Optional)'}
                </label>
                <input
                  type="text"
                  value={newFieldDefault}
                  onChange={(e) => setNewFieldDefault(e.target.value)}
                  placeholder={
                    newFieldScope === 'exam-wide'
                      ? 'e.g. 25 March 2025'
                      : 'Optional fallback if not set per student'
                  }
                  className="w-full px-3 py-2 rounded-lg bg-white border border-outline-variant/30"
                />
              </div>
              <button
                type="submit"
                className="w-full py-2 rounded-lg bg-secondary text-on-secondary font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Add Custom Marksheet Field</span>
              </button>
            </form>

            <div className="space-y-2">
              <div className="font-bold text-on-surface-variant uppercase text-[10px] tracking-wider">
                Active Custom Fields ({template.customFields.length})
              </div>
              {template.customFields.length === 0 ? (
                <div className="p-4 rounded-xl bg-surface-container-low/50 text-center text-on-surface-variant">
                  No custom fields added yet. Add fields like &ldquo;Result Date&rdquo;, &ldquo;Scholarship Note&rdquo;, or &ldquo;House Name&rdquo;.
                </div>
              ) : (
                <div className="space-y-2">
                  {template.customFields.map((field) => (
                    <div
                      key={field.id}
                      className="p-3 rounded-xl bg-surface-container-low/70 border border-outline-variant/25 flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <div className="font-bold text-on-surface truncate">{field.label}</div>
                        <div className="text-[10px] text-on-surface-variant font-mono">
                          {field.scope === 'exam-wide' ? 'Exam-Wide' : 'Per-Student'} &bull;{' '}
                          {field.placement === 'student-grid' ? 'Bio Grid' : 'Footer Box'}
                          {field.defaultValue ? ` • "${field.defaultValue}"` : ''}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveCustomField(field.id)}
                        className="p-1.5 text-error hover:bg-error-container/20 rounded-lg cursor-pointer shrink-0"
                        title="Remove Field"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* SECTION 4: SIGNATORIES */}
        {studioSection === 'signatories' && (
          <div className="space-y-3 text-xs">
            {signatories.map((sig, idx) => (
              <div
                key={sig.id}
                className="p-3.5 rounded-xl bg-surface-container-low border border-outline-variant/25 space-y-2.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <input
                    type="text"
                    value={sig.title}
                    onChange={(e) => {
                      const next = [...signatories];
                      next[idx] = { ...next[idx], title: e.target.value };
                      setSignatories(next);
                    }}
                    className="font-bold text-primary-container bg-white px-2.5 py-1 rounded-lg border border-outline-variant/30 flex-1"
                  />
                  <label className="flex items-center gap-1.5 cursor-pointer font-semibold">
                    <input
                      type="checkbox"
                      checked={sig.enabled}
                      onChange={(e) => {
                        const next = [...signatories];
                        next[idx] = { ...next[idx], enabled: e.target.checked };
                        setSignatories(next);
                      }}
                    />
                    <span>Show</span>
                  </label>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    value={sig.name}
                    onChange={(e) => {
                      const next = [...signatories];
                      next[idx] = { ...next[idx], name: e.target.value };
                      setSignatories(next);
                    }}
                    placeholder="Signatory Name"
                    className="px-2.5 py-1.5 rounded-lg bg-white border border-outline-variant/30 font-medium"
                  />
                  <select
                    value=""
                    onChange={(e) => {
                      const picked = teachers.find((t) => t.id === e.target.value);
                      if (!picked) return;
                      const next = [...signatories];
                      next[idx] = {
                        ...next[idx],
                        name: picked.name,
                        designation: picked.designation,
                        signatureImgUrl: picked.signatureUrl || next[idx].signatureImgUrl || '',
                      };
                      setSignatories(next);
                    }}
                    className="px-2.5 py-1.5 rounded-lg bg-white border border-outline-variant/30 font-medium"
                  >
                    <option value="">Pick HR Staff...</option>
                    {teachers.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </div>
                <MediaUploadInput
                  label="Signature Scan (PNG/Transparent)"
                  value={sig.signatureImgUrl || ''}
                  onChange={(url) => {
                    const next = [...signatories];
                    next[idx] = { ...next[idx], signatureImgUrl: url };
                    setSignatories(next);
                  }}
                  folder="erp/teachers/signatures"
                  previewShape="wide"
                  buttonLabel="Upload"
                />
              </div>
            ))}
          </div>
        )}

        {/* Save Buttons */}
        <div className="pt-3 border-t border-outline-variant/20 space-y-2">
          <button
            type="button"
            onClick={handleSaveToCurrentExam}
            className="w-full py-2.5 rounded-xl bg-primary-container hover:bg-primary text-on-primary font-bold text-xs shadow-sm cursor-pointer inline-flex items-center justify-center gap-2"
          >
            <Save className="w-4 h-4" />
            <span>Save Design to Current Exam</span>
          </button>
          {allExams.length > 1 && (
            <button
              type="button"
              onClick={handleApplyToAllExams}
              className="w-full py-2 rounded-xl bg-surface-container hover:bg-surface-container-high text-on-surface font-semibold text-xs cursor-pointer inline-flex items-center justify-center gap-1.5"
            >
              <CopyCheck className="w-3.5 h-3.5" />
              <span>Apply Design Template to All Exams</span>
            </button>
          )}
        </div>
      </div>

      {/* RIGHT COLUMN: CANDIDATE DATA OVERRIDE + LIVE A4 MARKSHEET */}
      <div className="xl:col-span-7 space-y-5">
        {/* Candidate Toolbar */}
        <div className="rounded-2xl bg-surface-container-lowest border border-outline-variant/25 p-4 flex flex-col sm:flex-row items-center justify-between gap-3 no-print">
          <div className="flex items-center gap-2.5 w-full sm:w-auto">
            <span className="text-xs font-semibold text-on-surface-variant shrink-0">
              Candidate:
            </span>
            <select
              value={activeStudent?.id || ''}
              onChange={(e) => onChangeStudentId(e.target.value)}
              className="flex-1 sm:flex-none px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 text-xs font-bold text-on-surface"
            >
              {eligibleCandidates.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.className} ({s.sectionName}) · Roll #{s.rollNumber} - {s.fullName}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary-container hover:bg-primary text-on-primary font-bold text-xs shadow-sm cursor-pointer shrink-0"
          >
            <Printer className="w-4 h-4" />
            <span>Print Official A4</span>
          </button>
        </div>

        {/* Per-Student Attendance, Conduct, Remark & Custom Field Values */}
        {activeStudent && (
          <div className="rounded-2xl bg-surface-container-lowest border border-outline-variant/25 p-4 space-y-3 text-xs no-print">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-outline-variant/15 pb-2.5">
              <div className="flex items-center gap-2 font-bold text-on-surface">
                <UserCheck className="w-4 h-4 text-secondary" />
                <span>
                  Per-Student Transcript Entry — {activeStudent.fullName} (Roll #
                  {activeStudent.rollNumber})
                </span>
              </div>
              <button
                type="button"
                onClick={handleSaveStudentMeta}
                className="px-3 py-1.5 rounded-lg bg-secondary text-on-secondary font-bold inline-flex items-center gap-1 cursor-pointer"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Save Student Data</span>
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div>
                <label className="block text-[10px] font-semibold text-on-surface-variant mb-1">
                  Working Days
                </label>
                <input
                  type="number"
                  min={0}
                  max={365}
                  value={activeStudentMeta.workingDays ?? ''}
                  placeholder={
                    template.defaultWorkingDays !== undefined
                      ? String(template.defaultWorkingDays)
                      : 'e.g. 120'
                  }
                  onChange={(e) =>
                    updateActiveStudentMeta({
                      workingDays: e.target.value ? Number(e.target.value) : undefined,
                    })
                  }
                  className="w-full px-2.5 py-1.5 rounded-lg bg-surface-container-low border border-outline-variant/30 font-mono"
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-on-surface-variant mb-1">
                  Days Present
                </label>
                <input
                  type="number"
                  min={0}
                  max={365}
                  value={activeStudentMeta.daysPresent ?? ''}
                  placeholder="e.g. 114"
                  onChange={(e) =>
                    updateActiveStudentMeta({
                      daysPresent: e.target.value ? Number(e.target.value) : undefined,
                    })
                  }
                  className="w-full px-2.5 py-1.5 rounded-lg bg-surface-container-low border border-outline-variant/30 font-mono"
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-on-surface-variant mb-1">
                  Conduct / Behavior
                </label>
                <input
                  type="text"
                  value={activeStudentMeta.conduct ?? ''}
                  placeholder="e.g. Outstanding"
                  onChange={(e) => updateActiveStudentMeta({ conduct: e.target.value })}
                  className="w-full px-2.5 py-1.5 rounded-lg bg-surface-container-low border border-outline-variant/30"
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-on-surface-variant mb-1">
                  Promotion Note
                </label>
                <input
                  type="text"
                  value={activeStudentMeta.promotionStatus ?? ''}
                  placeholder="Auto from result"
                  onChange={(e) => updateActiveStudentMeta({ promotionStatus: e.target.value })}
                  className="w-full px-2.5 py-1.5 rounded-lg bg-surface-container-low border border-outline-variant/30"
                />
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-semibold text-on-surface-variant mb-1">
                Class Teacher&apos;s Remark (Optional Override)
              </label>
              <input
                type="text"
                value={activeStudentMeta.teacherRemark ?? ''}
                placeholder="Leave blank for automatic result-based remark..."
                onChange={(e) => updateActiveStudentMeta({ teacherRemark: e.target.value })}
                className="w-full px-2.5 py-1.5 rounded-lg bg-surface-container-low border border-outline-variant/30"
              />
            </div>

            {perStudentCustomFields.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2 border-t border-outline-variant/15">
                {perStudentCustomFields.map((field) => (
                  <div key={field.id}>
                    <label className="block text-[10px] font-semibold text-primary-container mb-1">
                      {field.label}
                    </label>
                    <input
                      type="text"
                      value={activeStudentMeta.customValues?.[field.id] ?? ''}
                      placeholder={field.defaultValue || `Enter ${field.label}`}
                      onChange={(e) => updateActiveStudentCustomVal(field.id, e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-lg bg-white border border-outline-variant/30"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Live A4 Marksheet Canvas */}
        {activeResult ? (
          <div className="flex justify-center">
            <MarksheetDocument
              result={activeResult}
              exam={currentExam}
              student={activeStudent}
              cmsConfig={cmsConfig}
              qrCodeDataUrl={qrDataUrl}
              templateOverride={buildCleanTemplatePayload()}
              metaOverride={activeStudentMeta}
              bgUrlOverride={bgUrl}
              stationeryModeOverride={stationeryMode}
              signatoriesOverride={signatories}
            />
          </div>
        ) : (
          <div className="rounded-2xl bg-surface-container-lowest border border-outline-variant/25 p-8 text-center text-xs text-on-surface-variant">
            No candidates found for this examination target scope yet.
          </div>
        )}
      </div>
    </div>
  );
}
