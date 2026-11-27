'use client';

import { useState, useEffect, useRef } from 'react';
import {
  CMSConfig,
  Exam,
  ExamResultRecord,
  MarkEntry,
  MarksheetCustomField,
  MarksheetCustomTextBlock,
  MarksheetFontId,
  MarksheetLabelsConfig,
  MarksheetLabelStyle,
  MarksheetSectionId,
  MarksheetTemplate,
  Signatory,
  Student,
  StudentMarksheetMeta,
  Subject,
  Teacher,
} from '@/lib/types';
import { compileStudentExamRecord } from '@/lib/grading-engine';
import { generateQrDataUrl } from '@/lib/qr';
import { downloadMarksheetAsPdf, printMarksheetDocument } from '@/lib/marksheet-pdf';
import { MARKSHEET_FONT_OPTIONS } from '@/lib/marksheet-fonts';
import MediaUploadInput from '@/components/admin/MediaUploadInput';
import MarksheetDocument, {
  DEFAULT_MARKSHEET_LABELS,
  DEFAULT_MARKSHEET_SECTION_ORDER,
  resolveMarksheetTemplate,
  ResolvedMarksheetTemplate,
} from '@/components/common/MarksheetDocument';
import {
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  CopyCheck,
  Download,
  Eye,
  FileText,
  Layers,
  MousePointerClick,
  Palette,
  Plus,
  Printer,
  RectangleHorizontal,
  RectangleVertical,
  RotateCcw,
  Save,
  Sparkles,
  Stamp,
  Trash2,
  Type,
  UserCheck,
} from 'lucide-react';

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

const SECTION_DISPLAY_NAMES: Record<MarksheetSectionId, string> = {
  header: 'Institution Crest & Exam Header',
  bio: 'Candidate Bio & Grading Scale',
  table: 'Subject Marks & Grades Table',
  summary: 'Total Score, GPA & Merit Summary',
  attendance: 'Attendance, Conduct & Teacher Remark',
  'custom-blocks': 'Bottom Custom Notes / Blocks',
  signatures: 'QR Verification & Signatories',
};

const QUICK_TOKENS = [
  '{{studentName}}',
  '{{rollNumber}}',
  '{{className}}',
  '{{gpa}}',
  '{{grade}}',
  '{{examTitle}}',
  '{{publishDate}}',
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
    'design' | 'labels' | 'columns' | 'custom-fields' | 'signatories'
  >('design');
  const [isInlineEditMode, setIsInlineEditMode] = useState<boolean>(true);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState<boolean>(false);
  const studioSheetRef = useRef<HTMLDivElement | null>(null);

  const [stationeryMode, setStationeryMode] = useState<'full-design' | 'pre-printed-overlay'>(
    currentExam.stationeryMode || 'full-design'
  );
  const [bgUrl, setBgUrl] = useState(currentExam.marksheetBgUrl || '');
  const [bgPublicId, setBgPublicId] = useState(currentExam.marksheetBgPublicId || '');
  const [signatories, setSignatories] = useState<Signatory[]>(currentExam.signatories || []);
  const [template, setTemplate] = useState<ResolvedMarksheetTemplate>(() => {
    const resolved = resolveMarksheetTemplate(currentExam.marksheetTemplate);
    if (!resolved.watermarkLogoUrl && !resolved.pageBackgroundUrl && currentExam.marksheetBgUrl) {
      return {
        ...resolved,
        watermarkLogoUrl: currentExam.marksheetBgUrl,
        watermarkLogoPublicId: currentExam.marksheetBgPublicId || '',
      };
    }
    return resolved;
  });
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

  // Custom rich text block creator state
  const [newBlockTitle, setNewBlockTitle] = useState('');
  const [newBlockContent, setNewBlockContent] = useState('');
  const [newBlockPlacement, setNewBlockPlacement] = useState<
    MarksheetCustomTextBlock['placement']
  >('above-signatures');
  const [newBlockAlign, setNewBlockAlign] = useState<'left' | 'center' | 'right'>('left');
  const [newBlockBordered, setNewBlockBordered] = useState<boolean>(true);

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

  const updateLabel = (key: keyof MarksheetLabelsConfig, value: string) => {
    setTemplate((prev) => ({
      ...prev,
      labels: {
        ...prev.labels,
        [key]: value,
      },
    }));
  };

  const updateLabelStyle = (boxKey: string, patch: Partial<MarksheetLabelStyle>) => {
    setTemplate((prev) => ({
      ...prev,
      labelStyles: {
        ...prev.labelStyles,
        [boxKey]: {
          ...(prev.labelStyles[boxKey] || {}),
          ...patch,
        },
      },
    }));
  };

  const restoreHiddenBox = (boxKey: string) => {
    setTemplate((prev) => {
      const next = { ...prev.labelStyles };
      if (next[boxKey]) {
        next[boxKey] = { ...next[boxKey], hidden: false };
      }
      return { ...prev, labelStyles: next };
    });
  };

  const restoreAllHiddenBoxes = () => {
    setTemplate((prev) => {
      const next: Record<string, MarksheetLabelStyle> = {};
      for (const [k, v] of Object.entries(prev.labelStyles || {})) {
        next[k] = { ...v, hidden: false };
      }
      return { ...prev, labelStyles: next };
    });
    onToast('Restored all hidden marksheet text boxes.');
  };

  const updateTemplateField = (patch: Partial<MarksheetTemplate>) => {
    setTemplate((prev) => ({
      ...prev,
      ...patch,
      labels: patch.labels ? { ...prev.labels, ...patch.labels } : prev.labels,
    }));
  };

  const applyPreset = (preset: 'nctb-classic' | 'modern-editorial' | 'compact-fit') => {
    if (preset === 'nctb-classic') {
      setTemplate((prev) => ({
        ...prev,
        layoutPreset: 'nctb-classic',
        headerLayout: 'centered',
        density: 'balanced',
        pageMarginMm: 9,
        fontScale: 1,
        borderStyle: 'classic-double',
        borderWidthPx: 3,
        borderRadiusPx: 6,
        fontFamily: 'serif',
        headingFont: 'playfair',
        bodyFont: 'lora',
        sideBySideBioAndScale: true,
      }));
    } else if (preset === 'modern-editorial') {
      setTemplate((prev) => ({
        ...prev,
        layoutPreset: 'modern-editorial',
        headerLayout: 'split-banner',
        density: 'balanced',
        pageMarginMm: 10,
        fontScale: 1,
        borderStyle: 'modern-clean',
        borderWidthPx: 2,
        borderRadiusPx: 14,
        fontFamily: 'sans',
        headingFont: 'jakarta',
        bodyFont: 'manrope',
        sideBySideBioAndScale: true,
      }));
    } else {
      setTemplate((prev) => ({
        ...prev,
        layoutPreset: 'compact-fit',
        headerLayout: 'left-crest',
        density: 'compact',
        pageMarginMm: 7,
        fontScale: 0.92,
        borderStyle: 'official-seal',
        borderWidthPx: 2,
        borderRadiusPx: 8,
        fontFamily: 'sans',
        headingFont: 'dm-sans',
        bodyFont: 'dm-sans',
        sideBySideBioAndScale: true,
      }));
    }
    onToast(`Applied "${preset}" marksheet layout preset.`);
  };

  const moveSectionOrder = (index: number, direction: -1 | 1) => {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= template.sectionOrder.length) return;
    setTemplate((prev) => {
      const next = [...prev.sectionOrder];
      const [moved] = next.splice(index, 1);
      next.splice(nextIndex, 0, moved);
      return { ...prev, sectionOrder: next };
    });
  };

  const buildCleanTemplatePayload = (): MarksheetTemplate => ({
    orientation: template.orientation,
    layoutPreset: template.layoutPreset,
    headerLayout: template.headerLayout,
    density: template.density,
    pageMarginMm: template.pageMarginMm,
    fontScale: template.fontScale,
    borderWidthPx: template.borderWidthPx,
    borderRadiusPx: template.borderRadiusPx,
    sideBySideBioAndScale: template.sideBySideBioAndScale,
    autoFitSinglePage: template.autoFitSinglePage,
    sectionOrder: template.sectionOrder,
    borderStyle: template.borderStyle,
    accentColor: template.accentColor,
    fontFamily: template.fontFamily,
    headingFont: template.headingFont,
    bodyFont: template.bodyFont,
    pageBackgroundUrl: template.pageBackgroundUrl,
    pageBackgroundPublicId: template.pageBackgroundPublicId,
    pageBackgroundOpacity: template.pageBackgroundOpacity,
    watermarkLogoUrl: template.watermarkLogoUrl,
    watermarkLogoPublicId: template.watermarkLogoPublicId,
    watermarkScalePercent: template.watermarkScalePercent,
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
    labels: template.labels,
    labelStyles: template.labelStyles,
    customTextBlocks: template.customTextBlocks,
    customFields: template.customFields,
  });

  const handleSaveToCurrentExam = () => {
    const syncedLegacyBgUrl = template.watermarkLogoUrl || bgUrl || '';
    const syncedLegacyBgPid = template.watermarkLogoPublicId || bgPublicId || '';
    onUpdateExam(currentExam.id, {
      stationeryMode,
      marksheetBgUrl: syncedLegacyBgUrl,
      marksheetBgPublicId: syncedLegacyBgPid,
      signatories,
      marksheetTemplate: buildCleanTemplatePayload(),
      studentMarksheetMeta: metaMap,
    });
    onToast(`Custom marksheet design & copy saved for "${currentExam.title}".`);
  };

  const handleApplyToAllExams = () => {
    const cleanTpl = buildCleanTemplatePayload();
    const syncedLegacyBgUrl = template.watermarkLogoUrl || bgUrl || '';
    const syncedLegacyBgPid = template.watermarkLogoPublicId || bgPublicId || '';
    for (const ex of allExams) {
      onUpdateExam(ex.id, {
        stationeryMode,
        marksheetBgUrl: syncedLegacyBgUrl,
        marksheetBgPublicId: syncedLegacyBgPid,
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

  const handleAddCustomTextBlock = (e: React.FormEvent) => {
    e.preventDefault();
    const content = newBlockContent.trim();
    if (!content) return;
    const block: MarksheetCustomTextBlock = {
      id: `blk-${Date.now().toString(36)}`,
      title: newBlockTitle.trim() || undefined,
      content,
      placement: newBlockPlacement,
      align: newBlockAlign,
      fontSizePx: 11,
      bordered: newBlockBordered,
    };
    setTemplate((prev) => ({
      ...prev,
      customTextBlocks: [...prev.customTextBlocks, block],
    }));
    setNewBlockTitle('');
    setNewBlockContent('');
  };

  const handleUpdateCustomBlock = (blockId: string, content: string) => {
    setTemplate((prev) => ({
      ...prev,
      customTextBlocks: prev.customTextBlocks.map((b) =>
        b.id === blockId ? { ...b, content } : b
      ),
    }));
  };

  const handleUpdateCustomBlockStyle = (
    blockId: string,
    patch: Partial<MarksheetCustomTextBlock>
  ) => {
    setTemplate((prev) => ({
      ...prev,
      customTextBlocks: prev.customTextBlocks.map((b) =>
        b.id === blockId ? { ...b, ...patch } : b
      ),
    }));
  };

  const handleRemoveCustomBlock = (blockId: string) => {
    setTemplate((prev) => ({
      ...prev,
      customTextBlocks: prev.customTextBlocks.filter((b) => b.id !== blockId),
    }));
  };

  const handleDownloadStudioPdf = async () => {
    if (!studioSheetRef.current || !activeResult) return;
    setIsDownloadingPdf(true);
    try {
      await downloadMarksheetAsPdf(
        studioSheetRef.current,
        `Marksheet-${activeResult.studentName}-Roll-${activeResult.rollNumber}`,
        template.orientation
      );
    } finally {
      setIsDownloadingPdf(false);
    }
  };

  const handlePrintStudio = () => {
    if (!activeResult) return;
    printMarksheetDocument(
      `Marksheet-${activeResult.studentName}-Roll-${activeResult.rollNumber}`
    );
  };

  const perStudentCustomFields = template.customFields.filter((f) => f.scope === 'per-student');
  const hiddenBoxKeys = Object.entries(template.labelStyles || {})
    .filter(([, style]) => style?.hidden)
    .map(([key]) => key);

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start marksheet-print-host">
      {/* LEFT CONTROLS: MARKSHEET STUDIO PRO */}
      <div className="xl:col-span-5 rounded-2xl bg-surface-container-lowest border border-outline-variant/25 p-5 space-y-4 no-print">
        <div className="border-b border-outline-variant/20 pb-3 flex items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-2 text-primary-container text-[11px] font-bold uppercase tracking-wider">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Full-Editable Marksheet Studio</span>
            </div>
            <h2 className="text-base font-bold text-on-surface mt-0.5">
              Customize Layout, Copy &amp; Fields
            </h2>
            <p className="text-xs text-on-surface-variant mt-0.5">
              Edit text directly on the A4 preview or via controls below, then save to sync everywhere.
            </p>
          </div>
        </div>

        {/* Studio Section Tabs */}
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-1 p-1 rounded-xl bg-surface-container-low border border-outline-variant/25 text-[11px]">
          {(
            [
              { id: 'design', label: 'Design', icon: Palette },
              { id: 'labels', label: 'Text', icon: Type },
              { id: 'columns', label: 'Sections', icon: Layers },
              { id: 'custom-fields', label: 'Blocks', icon: Plus },
              { id: 'signatories', label: 'Signers', icon: FileText },
            ] as const
          ).map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setStudioSection(tab.id)}
                className={`py-2 px-1.5 rounded-lg font-bold inline-flex items-center justify-center gap-1 cursor-pointer transition-colors whitespace-nowrap ${
                  studioSection === tab.id
                    ? 'bg-primary-container text-on-primary shadow-xs'
                    : 'text-on-surface-variant hover:text-on-surface'
                }`}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* SECTION 1: DESIGN, ORIENTATION, TYPOGRAPHY & IMAGE LAYERS */}
        {studioSection === 'design' && (
          <div className="space-y-4 text-xs max-h-[620px] overflow-y-auto pr-1">
            {/* Orientation Switcher */}
            <div className="space-y-1.5">
              <label className="block font-bold text-on-surface-variant uppercase text-[10px] tracking-wider">
                A4 Page Orientation
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setTemplate((prev) => ({ ...prev, orientation: 'portrait' }))
                  }
                  className={`p-2.5 rounded-xl border text-left cursor-pointer transition-colors flex items-center gap-2.5 ${
                    template.orientation === 'portrait'
                      ? 'border-primary-container bg-primary-fixed/25 text-primary-container'
                      : 'border-outline-variant/30 bg-surface-container-low text-on-surface'
                  }`}
                >
                  <RectangleVertical className="w-4 h-4 shrink-0" />
                  <div>
                    <div className="font-bold">Portrait A4</div>
                    <div className="text-[10px] opacity-80">210 × 297 mm Classic</div>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setTemplate((prev) => ({
                      ...prev,
                      orientation: 'landscape',
                      density: 'compact',
                    }))
                  }
                  className={`p-2.5 rounded-xl border text-left cursor-pointer transition-colors flex items-center gap-2.5 ${
                    template.orientation === 'landscape'
                      ? 'border-primary-container bg-primary-fixed/25 text-primary-container'
                      : 'border-outline-variant/30 bg-surface-container-low text-on-surface'
                  }`}
                >
                  <RectangleHorizontal className="w-4 h-4 shrink-0" />
                  <div>
                    <div className="font-bold">Landscape A4</div>
                    <div className="text-[10px] opacity-80">297 × 210 mm 2-Column</div>
                  </div>
                </button>
              </div>
            </div>

            {/* Quick Presets */}
            <div className="space-y-1.5">
              <label className="block font-bold text-on-surface-variant uppercase text-[10px] tracking-wider">
                Quick Layout Presets
              </label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => applyPreset('nctb-classic')}
                  className={`p-2 rounded-xl border text-center font-semibold cursor-pointer transition-colors ${
                    template.layoutPreset === 'nctb-classic'
                      ? 'border-primary-container bg-primary-fixed/25 text-primary-container'
                      : 'border-outline-variant/30 bg-surface-container-low text-on-surface'
                  }`}
                >
                  NCTB Classic
                </button>
                <button
                  type="button"
                  onClick={() => applyPreset('modern-editorial')}
                  className={`p-2 rounded-xl border text-center font-semibold cursor-pointer transition-colors ${
                    template.layoutPreset === 'modern-editorial'
                      ? 'border-primary-container bg-primary-fixed/25 text-primary-container'
                      : 'border-outline-variant/30 bg-surface-container-low text-on-surface'
                  }`}
                >
                  Modern Split
                </button>
                <button
                  type="button"
                  onClick={() => applyPreset('compact-fit')}
                  className={`p-2 rounded-xl border text-center font-semibold cursor-pointer transition-colors ${
                    template.layoutPreset === 'compact-fit'
                      ? 'border-primary-container bg-primary-fixed/25 text-primary-container'
                      : 'border-outline-variant/30 bg-surface-container-low text-on-surface'
                  }`}
                >
                  Compact Fit
                </button>
              </div>
            </div>

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
                  Header Layout
                </label>
                <select
                  value={template.headerLayout}
                  onChange={(e) =>
                    setTemplate((prev) => ({
                      ...prev,
                      headerLayout: e.target.value as ResolvedMarksheetTemplate['headerLayout'],
                    }))
                  }
                  className="w-full px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 font-semibold"
                >
                  <option value="centered">Centered Crest</option>
                  <option value="left-crest">Left-Logo Letterhead</option>
                  <option value="split-banner">Split Color Banner</option>
                </select>
              </div>
              <div>
                <label className="block font-semibold text-on-surface-variant mb-1">
                  Spacing Density
                </label>
                <select
                  value={template.density}
                  onChange={(e) =>
                    setTemplate((prev) => ({
                      ...prev,
                      density: e.target.value as ResolvedMarksheetTemplate['density'],
                    }))
                  }
                  className="w-full px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 font-semibold"
                >
                  <option value="compact">Compact (12+ Subjects)</option>
                  <option value="balanced">Balanced Standard</option>
                  <option value="spacious">Spacious Formal</option>
                </select>
              </div>
            </div>

            {/* Dual Font Pairing */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-on-surface-variant mb-1">
                  Heading / Display Font
                </label>
                <select
                  value={template.headingFont}
                  onChange={(e) =>
                    setTemplate((prev) => ({
                      ...prev,
                      headingFont: e.target.value as MarksheetFontId,
                    }))
                  }
                  className="w-full px-2.5 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 font-semibold"
                >
                  {MARKSHEET_FONT_OPTIONS.map((font) => (
                    <option key={font.id} value={font.id}>
                      {font.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-semibold text-on-surface-variant mb-1">
                  Body &amp; Table Font
                </label>
                <select
                  value={template.bodyFont}
                  onChange={(e) =>
                    setTemplate((prev) => ({
                      ...prev,
                      bodyFont: e.target.value as MarksheetFontId,
                    }))
                  }
                  className="w-full px-2.5 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 font-semibold"
                >
                  {MARKSHEET_FONT_OPTIONS.map((font) => (
                    <option key={font.id} value={font.id}>
                      {font.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block font-semibold text-on-surface-variant mb-1">
                Decorative Border Frame
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
                <option value="ornate-guilloche">Ornate Guilloché Crest Frame</option>
                <option value="diploma-crest">Royal Diploma Pinstripe</option>
                <option value="corner-brackets">Architectural Corner Brackets</option>
                <option value="none">Borderless / Minimal</option>
              </select>
            </div>

            {/* Sliders for Geometry */}
            <div className="grid grid-cols-2 gap-3 p-3 rounded-xl bg-surface-container-low/70 border border-outline-variant/25">
              <div>
                <div className="flex justify-between text-[11px] font-semibold text-on-surface-variant mb-1">
                  <span>Page Margin</span>
                  <span className="font-mono">{template.pageMarginMm} mm</span>
                </div>
                <input
                  type="range"
                  min={5}
                  max={18}
                  step={1}
                  value={template.pageMarginMm}
                  onChange={(e) =>
                    setTemplate((prev) => ({ ...prev, pageMarginMm: Number(e.target.value) }))
                  }
                  className="w-full accent-primary-container cursor-pointer"
                />
              </div>
              <div>
                <div className="flex justify-between text-[11px] font-semibold text-on-surface-variant mb-1">
                  <span>Text Scale</span>
                  <span className="font-mono">{Math.round(template.fontScale * 100)}%</span>
                </div>
                <input
                  type="range"
                  min={0.85}
                  max={1.15}
                  step={0.05}
                  value={template.fontScale}
                  onChange={(e) =>
                    setTemplate((prev) => ({ ...prev, fontScale: Number(e.target.value) }))
                  }
                  className="w-full accent-primary-container cursor-pointer"
                />
              </div>
              <div>
                <div className="flex justify-between text-[11px] font-semibold text-on-surface-variant mb-1">
                  <span>Border Width</span>
                  <span className="font-mono">{template.borderWidthPx} px</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={5}
                  step={1}
                  value={template.borderWidthPx}
                  onChange={(e) =>
                    setTemplate((prev) => ({ ...prev, borderWidthPx: Number(e.target.value) }))
                  }
                  className="w-full accent-primary-container cursor-pointer"
                />
              </div>
              <div>
                <div className="flex justify-between text-[11px] font-semibold text-on-surface-variant mb-1">
                  <span>Corner Radius</span>
                  <span className="font-mono">{template.borderRadiusPx} px</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={20}
                  step={2}
                  value={template.borderRadiusPx}
                  onChange={(e) =>
                    setTemplate((prev) => ({ ...prev, borderRadiusPx: Number(e.target.value) }))
                  }
                  className="w-full accent-primary-container cursor-pointer"
                />
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

            {/* Layer 1: Full-Page Sheet Background */}
            <div className="p-3.5 rounded-xl bg-surface-container-low/70 border border-outline-variant/25 space-y-2.5">
              <MediaUploadInput
                label="Full-Page Sheet Background (Edge-to-Edge)"
                value={template.pageBackgroundUrl}
                onChange={(url) =>
                  setTemplate((prev) => ({ ...prev, pageBackgroundUrl: url }))
                }
                onChangeMedia={({ url, publicId }) =>
                  setTemplate((prev) => ({
                    ...prev,
                    pageBackgroundUrl: url,
                    pageBackgroundPublicId:
                      publicId !== undefined ? publicId : prev.pageBackgroundPublicId,
                  }))
                }
                folder="erp/exams"
                previewShape="wide"
                buttonLabel="Upload Background"
                helperText="Full A4 stationery texture, border frame image, or parchment backdrop."
              />
              <div>
                <div className="flex items-center justify-between text-[11px] font-semibold text-on-surface-variant mb-1">
                  <span>Background Opacity</span>
                  <span className="font-mono">
                    {Math.round(template.pageBackgroundOpacity * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min={0.05}
                  max={1}
                  step={0.05}
                  value={template.pageBackgroundOpacity}
                  onChange={(e) =>
                    setTemplate((prev) => ({
                      ...prev,
                      pageBackgroundOpacity: Number(e.target.value),
                    }))
                  }
                  className="w-full accent-primary-container cursor-pointer"
                />
              </div>
            </div>

            {/* Layer 2: Independent Centered Watermark Crest Logo */}
            <div className="p-3.5 rounded-xl bg-surface-container-low/70 border border-outline-variant/25 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold text-on-surface flex items-center gap-1.5">
                  <Stamp className="w-3.5 h-3.5 text-primary-container" />
                  <span>Centered Watermark Crest Logo</span>
                </span>
                {cmsConfig.crestUrl && (
                  <button
                    type="button"
                    onClick={() => {
                      setTemplate((prev) => ({
                        ...prev,
                        watermarkLogoUrl: cmsConfig.crestUrl || '',
                        watermarkLogoPublicId: '',
                      }));
                      setBgUrl(cmsConfig.crestUrl || '');
                    }}
                    className="px-2 py-1 rounded-lg bg-white border border-outline-variant/40 text-[10px] font-bold text-primary-container hover:bg-primary-fixed/25 cursor-pointer"
                  >
                    Copy School Crest
                  </button>
                )}
              </div>
              <MediaUploadInput
                label="Watermark Logo Image"
                value={template.watermarkLogoUrl}
                onChange={(url) => {
                  setTemplate((prev) => ({ ...prev, watermarkLogoUrl: url }));
                  setBgUrl(url);
                }}
                onChangeMedia={({ url, publicId }) => {
                  setTemplate((prev) => ({
                    ...prev,
                    watermarkLogoUrl: url,
                    watermarkLogoPublicId:
                      publicId !== undefined ? publicId : prev.watermarkLogoPublicId,
                  }));
                  setBgUrl(url);
                  if (publicId !== undefined) setBgPublicId(publicId);
                }}
                folder="erp/exams"
                previewShape="square"
                buttonLabel="Upload Watermark"
                helperText="Centered transparent crest emblem rendered behind transcript marks."
              />
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="flex items-center justify-between text-[11px] font-semibold text-on-surface-variant mb-1">
                    <span>Logo Scale</span>
                    <span className="font-mono">{template.watermarkScalePercent}%</span>
                  </div>
                  <input
                    type="range"
                    min={20}
                    max={120}
                    step={5}
                    value={template.watermarkScalePercent}
                    onChange={(e) =>
                      setTemplate((prev) => ({
                        ...prev,
                        watermarkScalePercent: Number(e.target.value),
                      }))
                    }
                    className="w-full accent-primary-container cursor-pointer"
                  />
                </div>
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
          </div>
        )}

        {/* SECTION 2: FULL TEXT & LABELS EDITOR */}
        {studioSection === 'labels' && (
          <div className="space-y-4 text-xs max-h-[540px] overflow-y-auto pr-1">
            <div className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900">
              <span className="text-[11px] font-medium">
                Tip: Turn on <strong>Click-to-Edit</strong> above the preview to click any text box for inline typing, font, size, or hiding.
              </span>
              <button
                type="button"
                onClick={() => {
                  setTemplate((prev) => ({
                    ...prev,
                    labels: { ...DEFAULT_MARKSHEET_LABELS },
                  }));
                  onToast('Reset all marksheet labels to default copy.');
                }}
                className="px-2.5 py-1 rounded-lg bg-white border border-amber-300 text-[10px] font-bold shrink-0 cursor-pointer inline-flex items-center gap-1"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Reset</span>
              </button>
            </div>

            {hiddenBoxKeys.length > 0 && (
              <div className="p-2.5 rounded-xl bg-slate-100 border border-slate-300 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-700">
                    Hidden Elements ({hiddenBoxKeys.length})
                  </span>
                  <button
                    type="button"
                    onClick={restoreAllHiddenBoxes}
                    className="text-[10px] font-bold text-primary-container hover:underline cursor-pointer"
                  >
                    Restore All
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {hiddenBoxKeys.map((key) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => restoreHiddenBox(key)}
                      className="px-2 py-1 rounded-lg bg-white border border-slate-300 text-[10px] font-semibold text-slate-800 hover:border-primary-container inline-flex items-center gap-1 cursor-pointer"
                    >
                      <Eye className="w-3 h-3 text-primary-container" />
                      <span>{key.replace(/Override$|Label$|Title$/, '')}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Header Overrides */}
            <div className="space-y-2">
              <div className="font-bold text-on-surface-variant uppercase text-[10px] tracking-wider">
                Institution &amp; Exam Header Text
              </div>
              <input
                type="text"
                value={template.labels.schoolNameOverride}
                onChange={(e) => updateLabel('schoolNameOverride', e.target.value)}
                placeholder={`School Name Override (Default: ${cmsConfig.schoolName})`}
                className="w-full px-3 py-2 rounded-lg bg-surface-container-low border border-outline-variant/30"
              />
              <input
                type="text"
                value={template.labels.schoolMetaOverride}
                onChange={(e) => updateLabel('schoolMetaOverride', e.target.value)}
                placeholder="Address / EIIN / Board Code Override"
                className="w-full px-3 py-2 rounded-lg bg-surface-container-low border border-outline-variant/30"
              />
              <input
                type="text"
                value={template.boardTitle}
                onChange={(e) => updateTemplateField({ boardTitle: e.target.value })}
                placeholder="Optional Board / Trust Banner Line"
                className="w-full px-3 py-2 rounded-lg bg-surface-container-low border border-outline-variant/30"
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  value={template.headerSubtitle}
                  onChange={(e) => updateTemplateField({ headerSubtitle: e.target.value })}
                  placeholder="Transcript Badge Title"
                  className="px-3 py-2 rounded-lg bg-surface-container-low border border-outline-variant/30"
                />
                <input
                  type="text"
                  value={template.labels.examTitleOverride}
                  onChange={(e) => updateLabel('examTitleOverride', e.target.value)}
                  placeholder="Exam Title Override"
                  className="px-3 py-2 rounded-lg bg-surface-container-low border border-outline-variant/30"
                />
              </div>
              <div>
                <label className="block font-semibold text-on-surface-variant mb-1">
                  Default Term Working Days
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
                  className="w-full px-3 py-2 rounded-lg bg-surface-container-low border border-outline-variant/30 font-mono"
                />
              </div>
            </div>

            {/* Bio Grid Labels */}
            <div className="space-y-2 pt-2 border-t border-outline-variant/20">
              <div className="font-bold text-on-surface-variant uppercase text-[10px] tracking-wider">
                Candidate Bio &amp; Grading Labels
              </div>
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    ['candidateNameLabel', 'Candidate Name'],
                    ['rollRegLabel', 'Roll & Reg Label'],
                    ['fatherNameLabel', "Father's Name"],
                    ['motherNameLabel', "Mother's Name"],
                    ['classSectionLabel', 'Class & Section'],
                    ['groupShiftLabel', 'Group & Shift'],
                    ['studentIdLabel', 'Student ID'],
                    ['dobLabel', 'Date of Birth'],
                    ['gradingScaleTitle', 'Grading Scale Title'],
                  ] as const
                ).map(([key, label]) => (
                  <div key={key}>
                    <label className="text-[10px] text-on-surface-variant block mb-0.5">
                      {label}
                    </label>
                    <input
                      type="text"
                      value={template.labels[key]}
                      onChange={(e) => updateLabel(key, e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-lg bg-surface-container-low border border-outline-variant/30"
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Table Headers */}
            <div className="space-y-2 pt-2 border-t border-outline-variant/20">
              <div className="font-bold text-on-surface-variant uppercase text-[10px] tracking-wider">
                Marks Table Column Headers
              </div>
              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    ['codeColLabel', 'Code'],
                    ['subjectColLabel', 'Subject'],
                    ['fullColLabel', 'Full'],
                    ['passColLabel', 'Pass'],
                    ['ctColLabel', 'CT'],
                    ['cqColLabel', 'CQ'],
                    ['mcqColLabel', 'MCQ'],
                    ['pracColLabel', 'Practical'],
                    ['totalColLabel', 'Total'],
                    ['gpColLabel', 'GP'],
                    ['gradeColLabel', 'Grade'],
                    ['fourthBadgeLabel', '4th Tag'],
                  ] as const
                ).map(([key, label]) => (
                  <div key={key}>
                    <label className="text-[10px] text-on-surface-variant block mb-0.5">
                      {label}
                    </label>
                    <input
                      type="text"
                      value={template.labels[key]}
                      onChange={(e) => updateLabel(key, e.target.value)}
                      className="w-full px-2 py-1.5 rounded-lg bg-surface-container-low border border-outline-variant/30"
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Summary, Remarks & Footer */}
            <div className="space-y-2 pt-2 border-t border-outline-variant/20">
              <div className="font-bold text-on-surface-variant uppercase text-[10px] tracking-wider">
                Summary, Remarks &amp; Footer Copy
              </div>
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    ['aggregateTitle', 'Aggregate Header'],
                    ['gpaTitle', 'GPA Header'],
                    ['meritTitle', 'Merit Header'],
                    ['passedStatusText', 'Passed Status'],
                    ['failedStatusText', 'Failed Status'],
                    ['qrTitle', 'QR Heading'],
                  ] as const
                ).map(([key, label]) => (
                  <div key={key}>
                    <label className="text-[10px] text-on-surface-variant block mb-0.5">
                      {label}
                    </label>
                    <input
                      type="text"
                      value={template.labels[key]}
                      onChange={(e) => updateLabel(key, e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-lg bg-surface-container-low border border-outline-variant/30"
                    />
                  </div>
                ))}
              </div>
              <div>
                <label className="text-[10px] text-on-surface-variant block mb-0.5">
                  Default Passed Remark
                </label>
                <textarea
                  rows={2}
                  value={template.labels.defaultPassRemark}
                  onChange={(e) => updateLabel('defaultPassRemark', e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-lg bg-surface-container-low border border-outline-variant/30"
                />
              </div>
              <div>
                <label className="text-[10px] text-on-surface-variant block mb-0.5">
                  Default Failed Remark
                </label>
                <textarea
                  rows={2}
                  value={template.labels.defaultFailRemark}
                  onChange={(e) => updateLabel('defaultFailRemark', e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-lg bg-surface-container-low border border-outline-variant/30"
                />
              </div>
              <div>
                <label className="text-[10px] text-on-surface-variant block mb-0.5">
                  Bottom Footer Disclaimer / Note
                </label>
                <input
                  type="text"
                  value={template.labels.footerNoteText}
                  onChange={(e) => updateLabel('footerNoteText', e.target.value)}
                  placeholder="e.g. This computer-generated transcript is verified via QR."
                  className="w-full px-2.5 py-1.5 rounded-lg bg-surface-container-low border border-outline-variant/30"
                />
              </div>
            </div>
          </div>
        )}

        {/* SECTION 3: SECTIONS ORDER & VISIBILITY */}
        {studioSection === 'columns' && (
          <div className="space-y-4 text-xs max-h-[540px] overflow-y-auto pr-1">
            {/* Reorder Sections */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-on-surface-variant uppercase text-[10px] tracking-wider">
                  Section Order on A4 Page
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setTemplate((prev) => ({
                      ...prev,
                      sectionOrder: [...DEFAULT_MARKSHEET_SECTION_ORDER],
                    }))
                  }
                  className="text-[10px] font-bold text-primary-container hover:underline cursor-pointer"
                >
                  Reset Order
                </button>
              </div>
              <div className="space-y-1.5">
                {template.sectionOrder.map((secId, idx) => (
                  <div
                    key={secId}
                    className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/20"
                  >
                    <span className="font-medium text-on-surface truncate">
                      {idx + 1}. {SECTION_DISPLAY_NAMES[secId]}
                    </span>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        disabled={idx === 0}
                        onClick={() => moveSectionOrder(idx, -1)}
                        className="p-1 rounded bg-white border border-outline-variant/30 disabled:opacity-35 cursor-pointer"
                        title="Move Up"
                      >
                        <ArrowUp className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        disabled={idx === template.sectionOrder.length - 1}
                        onClick={() => moveSectionOrder(idx, 1)}
                        className="p-1 rounded bg-white border border-outline-variant/30 disabled:opacity-35 cursor-pointer"
                        title="Move Down"
                      >
                        <ArrowDown className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <label className="flex items-center gap-2 p-2.5 rounded-xl bg-surface-container-low/70 border border-outline-variant/20 cursor-pointer font-medium">
                <input
                  type="checkbox"
                  checked={template.sideBySideBioAndScale}
                  onChange={(e) =>
                    setTemplate((prev) => ({
                      ...prev,
                      sideBySideBioAndScale: e.target.checked,
                    }))
                  }
                  className="w-4 h-4 rounded text-primary-container"
                />
                <span>Place Bio &amp; Grading Scale Side-by-Side</span>
              </label>
            </div>

            <div className="space-y-2 pt-2 border-t border-outline-variant/20">
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

            <div className="space-y-2 pt-2 border-t border-outline-variant/20">
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

        {/* SECTION 4: CUSTOM TEXT BLOCKS & CUSTOM FIELDS */}
        {studioSection === 'custom-fields' && (
          <div className="space-y-5 text-xs max-h-[540px] overflow-y-auto pr-1">
            {/* Rich Text / Token Blocks */}
            <form
              onSubmit={handleAddCustomTextBlock}
              className="p-4 rounded-xl bg-surface-container-low border border-outline-variant/25 space-y-3"
            >
              <div className="font-bold text-on-surface">
                Add Rich Text / Notice Block
              </div>
              <input
                type="text"
                value={newBlockTitle}
                onChange={(e) => setNewBlockTitle(e.target.value)}
                placeholder="Optional Block Heading (e.g. Controller's Note)"
                className="w-full px-3 py-2 rounded-lg bg-white border border-outline-variant/30"
              />
              <textarea
                required
                rows={3}
                value={newBlockContent}
                onChange={(e) => setNewBlockContent(e.target.value)}
                placeholder="Write custom text... Supports tokens like {{studentName}}, {{gpa}}, {{grade}}, {{publishDate}}"
                className="w-full px-3 py-2 rounded-lg bg-white border border-outline-variant/30"
              />
              <div className="flex flex-wrap gap-1">
                {QUICK_TOKENS.map((tok) => (
                  <button
                    key={tok}
                    type="button"
                    onClick={() =>
                      setNewBlockContent((prev) => (prev ? `${prev} ${tok}` : tok))
                    }
                    className="px-2 py-0.5 rounded bg-white border border-outline-variant/40 text-[10px] font-mono text-primary-container hover:bg-primary-fixed/30 cursor-pointer"
                  >
                    +{tok}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={newBlockPlacement}
                  onChange={(e) =>
                    setNewBlockPlacement(
                      e.target.value as MarksheetCustomTextBlock['placement']
                    )
                  }
                  className="px-2.5 py-2 rounded-lg bg-white border border-outline-variant/30 font-semibold"
                >
                  <option value="below-header">Below Header</option>
                  <option value="above-table">Above Marks Table</option>
                  <option value="below-summary">Below Summary</option>
                  <option value="above-signatures">Above Signatories</option>
                </select>
                <select
                  value={newBlockAlign}
                  onChange={(e) =>
                    setNewBlockAlign(e.target.value as 'left' | 'center' | 'right')
                  }
                  className="px-2.5 py-2 rounded-lg bg-white border border-outline-variant/30 font-semibold"
                >
                  <option value="left">Align Left</option>
                  <option value="center">Align Center</option>
                  <option value="right">Align Right</option>
                </select>
              </div>
              <label className="flex items-center gap-2 cursor-pointer font-medium">
                <input
                  type="checkbox"
                  checked={newBlockBordered}
                  onChange={(e) => setNewBlockBordered(e.target.checked)}
                />
                <span>Render inside bordered card box</span>
              </label>
              <button
                type="submit"
                className="w-full py-2 rounded-lg bg-primary-container text-on-primary font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Add Rich Text Block</span>
              </button>
            </form>

            {template.customTextBlocks.length > 0 && (
              <div className="space-y-2">
                <div className="font-bold text-on-surface-variant uppercase text-[10px] tracking-wider">
                  Active Text Blocks ({template.customTextBlocks.length})
                </div>
                {template.customTextBlocks.map((blk) => (
                  <div
                    key={blk.id}
                    className="p-3 rounded-xl bg-surface-container-low/70 border border-outline-variant/25 flex items-start justify-between gap-2"
                  >
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="font-bold text-on-surface text-[11px]">
                        {blk.title || 'Custom Text Block'} ·{' '}
                        <span className="font-mono text-on-surface-variant">{blk.placement}</span>
                      </div>
                      <p className="text-[11px] text-on-surface-variant line-clamp-2">
                        {blk.content}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveCustomBlock(blk.id)}
                      className="p-1.5 text-error hover:bg-error-container/20 rounded-lg cursor-pointer shrink-0"
                      title="Remove Text Block"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Existing Custom Key-Value Fields Builder */}
            <form
              onSubmit={handleAddCustomField}
              className="p-4 rounded-xl bg-surface-container-low border border-outline-variant/25 space-y-3"
            >
              <div className="font-bold text-on-surface">Add Custom Field to Bio / Footer</div>
              <div>
                <label className="block font-semibold text-on-surface-variant mb-1">
                  Field Label *
                </label>
                <input
                  type="text"
                  required
                  value={newFieldLabel}
                  onChange={(e) => setNewFieldLabel(e.target.value)}
                  placeholder="e.g. Result Publish Date, House Name, Next Term Starts"
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
                <span>Add Custom Bio / Footer Field</span>
              </button>
            </form>

            {template.customFields.length > 0 && (
              <div className="space-y-2">
                <div className="font-bold text-on-surface-variant uppercase text-[10px] tracking-wider">
                  Active Custom Fields ({template.customFields.length})
                </div>
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
              </div>
            )}
          </div>
        )}

        {/* SECTION 5: SIGNATORIES */}
        {studioSection === 'signatories' && (
          <div className="space-y-3 text-xs max-h-[540px] overflow-y-auto pr-1">
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
                  {signatories.length > 1 && (
                    <button
                      type="button"
                      onClick={() =>
                        setSignatories((prev) => prev.filter((_, i) => i !== idx))
                      }
                      className="p-1 text-error hover:bg-error-container/20 rounded cursor-pointer"
                      title="Remove Signatory"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
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

            <button
              type="button"
              onClick={() =>
                setSignatories((prev) => [
                  ...prev,
                  {
                    id: `sig-${Date.now().toString(36)}`,
                    title: 'Exam Controller',
                    name: 'Controller Name',
                    designation: 'Controller of Examinations',
                    enabled: true,
                  },
                ])
              }
              className="w-full py-2 rounded-xl border border-dashed border-outline-variant/50 text-on-surface-variant hover:text-primary-container hover:border-primary-container font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Signatory Slot</span>
            </button>
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

      {/* RIGHT COLUMN: CANDIDATE DATA OVERRIDE + LIVE CLICK-TO-EDIT A4 MARKSHEET */}
      <div className="xl:col-span-7 space-y-4">
        {/* Candidate & Action Toolbar */}
        <div className="rounded-2xl bg-surface-container-lowest border border-outline-variant/25 p-4 flex flex-wrap items-center justify-between gap-3 no-print">
          <div className="flex items-center gap-2.5 flex-1 min-w-[200px]">
            <span className="text-xs font-semibold text-on-surface-variant shrink-0">
              Candidate:
            </span>
            <select
              value={activeStudent?.id || ''}
              onChange={(e) => onChangeStudentId(e.target.value)}
              className="flex-1 px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 text-xs font-bold text-on-surface"
            >
              {eligibleCandidates.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.className} ({s.sectionName}) · Roll #{s.rollNumber} - {s.fullName}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {/* Compact Instant Orientation Toggle */}
            <div className="inline-flex rounded-xl bg-surface-container-low border border-outline-variant/40 p-0.5 text-[11px]">
              <button
                type="button"
                onClick={() => setTemplate((prev) => ({ ...prev, orientation: 'portrait' }))}
                className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg font-bold cursor-pointer transition-colors ${
                  template.orientation === 'portrait'
                    ? 'bg-primary-container text-on-primary shadow-2xs'
                    : 'text-on-surface-variant hover:text-on-surface'
                }`}
                title="Portrait A4 (210x297mm)"
              >
                <RectangleVertical className="w-3.5 h-3.5" />
                <span>Portrait</span>
              </button>
              <button
                type="button"
                onClick={() =>
                  setTemplate((prev) => ({
                    ...prev,
                    orientation: 'landscape',
                    density: 'compact',
                  }))
                }
                className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg font-bold cursor-pointer transition-colors ${
                  template.orientation === 'landscape'
                    ? 'bg-primary-container text-on-primary shadow-2xs'
                    : 'text-on-surface-variant hover:text-on-surface'
                }`}
                title="Smart 2-Column Landscape A4 (297x210mm)"
              >
                <RectangleHorizontal className="w-3.5 h-3.5" />
                <span>Landscape</span>
              </button>
            </div>

            <button
              type="button"
              onClick={() => setIsInlineEditMode((prev) => !prev)}
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border cursor-pointer transition-colors whitespace-nowrap ${
                isInlineEditMode
                  ? 'bg-amber-50 border-amber-400 text-amber-900'
                  : 'bg-surface-container-low border-outline-variant/40 text-on-surface-variant'
              }`}
            >
              <MousePointerClick className="w-3.5 h-3.5" />
              <span>{isInlineEditMode ? 'Click-to-Edit: ON' : 'Click-to-Edit: OFF'}</span>
            </button>
            <button
              type="button"
              disabled={!activeResult || isDownloadingPdf}
              onClick={handleDownloadStudioPdf}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-primary-container hover:bg-primary disabled:opacity-50 text-on-primary font-bold text-xs shadow-sm cursor-pointer whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{isDownloadingPdf ? 'Generating...' : 'Download A4 PDF'}</span>
            </button>
            <button
              type="button"
              disabled={!activeResult}
              onClick={handlePrintStudio}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-surface-container-low hover:bg-surface-container border border-outline-variant/40 text-on-surface font-bold text-xs cursor-pointer whitespace-nowrap"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print A4</span>
            </button>
          </div>
        </div>

        {hiddenBoxKeys.length > 0 && (
          <div className="rounded-xl bg-amber-50/80 border border-amber-200 px-3.5 py-2 flex flex-wrap items-center justify-between gap-2 text-xs no-print">
            <span className="font-semibold text-amber-950">
              {hiddenBoxKeys.length} text box{hiddenBoxKeys.length > 1 ? 'es' : ''} hidden on canvas
            </span>
            <button
              type="button"
              onClick={restoreAllHiddenBoxes}
              className="px-2.5 py-1 rounded-lg bg-white border border-amber-300 text-[11px] font-bold text-amber-950 hover:bg-amber-100 inline-flex items-center gap-1 cursor-pointer"
            >
              <Eye className="w-3.5 h-3.5" />
              <span>Restore All Hidden Boxes</span>
            </button>
          </div>
        )}

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

        {/* Live Click-to-Edit A4 Marksheet Canvas */}
        {activeResult ? (
          <div className="flex justify-center overflow-x-auto pb-2 print:overflow-visible print:pb-0">
            <MarksheetDocument
              sheetRef={studioSheetRef}
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
              isInlineEditMode={isInlineEditMode}
              onUpdateLabel={updateLabel}
              onUpdateLabelStyle={updateLabelStyle}
              onUpdateTemplateField={updateTemplateField}
              onUpdateCustomBlock={handleUpdateCustomBlock}
              onUpdateCustomBlockStyle={handleUpdateCustomBlockStyle}
              onRemoveCustomBlock={handleRemoveCustomBlock}
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
