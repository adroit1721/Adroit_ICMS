'use client';

import React, { useEffect, useState } from 'react';
import {
  CMSConfig,
  Exam,
  ExamResultRecord,
  MarksheetCustomTextBlock,
  MarksheetFontId,
  MarksheetLabelsConfig,
  MarksheetLabelStyle,
  MarksheetSectionId,
  MarksheetTemplate,
  Signatory,
  Student,
  StudentMarksheetMeta,
} from '@/lib/types';
import {
  MARKSHEET_FONT_OPTIONS,
  resolveMarksheetFontCss,
} from '@/lib/marksheet-fonts';
import { registerGlobalMarksheetPrintCalibrator } from '@/lib/marksheet-pdf';
import { formatDateDDMMYYYY } from '@/lib/academic-helpers';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Award,
  Bold,
  CheckCircle2,
  EyeOff,
  Italic,
  Minus,
  Plus,
  QrCode,
  Trash2,
  X,
  XCircle,
} from 'lucide-react';

export const DEFAULT_MARKSHEET_SECTION_ORDER: MarksheetSectionId[] = [
  'header',
  'bio',
  'table',
  'summary',
  'attendance',
  'custom-blocks',
  'signatures',
];

export const DEFAULT_MARKSHEET_LABELS: Required<MarksheetLabelsConfig> = {
  schoolNameOverride: '',
  schoolMetaOverride: '',
  examTitleOverride: '',
  candidateNameLabel: 'Candidate Name',
  rollRegLabel: 'Class Roll & Reg No.',
  rollPrefix: 'Roll #',
  regPrefix: 'Reg:',
  fatherNameLabel: "Father's Name",
  motherNameLabel: "Mother's Name",
  classSectionLabel: 'Class & Section',
  groupShiftLabel: 'Group & Shift',
  studentIdLabel: 'Student ID',
  dobLabel: 'Date of Birth',
  gradingScaleTitle: 'Board Grading Scale',
  codeColLabel: 'Code',
  subjectColLabel: 'Subject Name',
  fullColLabel: 'Full',
  passColLabel: 'Pass',
  ctColLabel: 'CT',
  cqColLabel: 'CQ',
  mcqColLabel: 'MCQ',
  pracColLabel: 'Prac',
  totalColLabel: 'Total',
  gpColLabel: 'GP',
  gradeColLabel: 'Grade',
  fourthBadgeLabel: '4th Sub',
  aggregateTitle: 'Aggregate Performance',
  marksUnitLabel: 'Marks',
  scoreRatioLabel: 'Score Ratio:',
  gpaTitle: 'Grade Point Average (GPA)',
  gradePrefixLabel: 'Grade:',
  coreGpaLabel: 'Core GPA:',
  fourthBonusLabel: '4th Bonus:',
  meritTitle: 'Merit Standing & Outcome',
  classRankLabel: 'Class Rank:',
  sectionRankLabel: 'Sec Rank:',
  passedStatusText: 'PASSED / PROMOTED',
  failedStatusText: 'FAILED',
  workingDaysLabel: 'Working Days:',
  daysPresentLabel: 'Days Present:',
  conductLabel: 'Behavior & Conduct:',
  remarkTitle: "Class Teacher's Remark:",
  defaultPassRemark:
    'Demonstrated commendable academic diligence, discipline, and steady classroom progress.',
  defaultFailRemark:
    'Requires focused remedial practice and regular attendance in weaker subject areas.',
  qrTitle: 'Digital Verification',
  qrSubtitle: 'Scan QR code to verify official academic record.',
  footerNoteText: '',
};

export interface ResolvedMarksheetTemplate {
  orientation: 'portrait' | 'landscape';
  layoutPreset: 'nctb-classic' | 'modern-editorial' | 'compact-fit';
  headerLayout: 'centered' | 'left-crest' | 'split-banner';
  density: 'compact' | 'balanced' | 'spacious';
  pageMarginMm: number;
  fontScale: number;
  borderWidthPx: number;
  borderRadiusPx: number;
  sideBySideBioAndScale: boolean;
  autoFitSinglePage: boolean;
  sectionOrder: MarksheetSectionId[];
  borderStyle:
    | 'classic-double'
    | 'modern-clean'
    | 'official-seal'
    | 'ornate-guilloche'
    | 'diploma-crest'
    | 'corner-brackets'
    | 'none';
  accentColor: string;
  fontFamily: 'sans' | 'serif';
  headingFont: MarksheetFontId;
  bodyFont: MarksheetFontId;
  pageBackgroundUrl: string;
  pageBackgroundPublicId: string;
  pageBackgroundOpacity: number;
  watermarkLogoUrl: string;
  watermarkLogoPublicId: string;
  watermarkScalePercent: number;
  watermarkOpacity: number;
  boardTitle: string;
  headerSubtitle: string;
  defaultWorkingDays: number | undefined;
  showHeader: boolean;
  showStudentPhoto: boolean;
  showBanglaName: boolean;
  showFatherMother: boolean;
  showRollReg: boolean;
  showClassSectionGroup: boolean;
  showSystemId: boolean;
  showDateOfBirth: boolean;
  showGradingScale: boolean;
  showSubjectCode: boolean;
  showFullMarksCol: boolean;
  showPassMarksCol: boolean;
  showCombinedPaperDetails: boolean;
  showGradePointCol: boolean;
  showCoreGpaAndBonus: boolean;
  showMeritRank: boolean;
  showAttendanceConduct: boolean;
  showQrVerification: boolean;
  labels: Required<MarksheetLabelsConfig>;
  labelStyles: Record<string, MarksheetLabelStyle>;
  customTextBlocks: MarksheetCustomTextBlock[];
  customFields: NonNullable<MarksheetTemplate['customFields']>;
}

export function resolveMarksheetTemplate(
  template?: MarksheetTemplate
): ResolvedMarksheetTemplate {
  const incomingOrder = Array.isArray(template?.sectionOrder)
    ? template!.sectionOrder.filter((id): id is MarksheetSectionId =>
        DEFAULT_MARKSHEET_SECTION_ORDER.includes(id)
      )
    : [];
  const mergedOrder: MarksheetSectionId[] = [
    ...incomingOrder,
    ...DEFAULT_MARKSHEET_SECTION_ORDER.filter((id) => !incomingOrder.includes(id)),
  ];

  const legacyFont = template?.fontFamily || 'sans';
  const defaultHeadingFont: MarksheetFontId =
    legacyFont === 'serif' ? 'playfair' : 'jakarta';
  const defaultBodyFont: MarksheetFontId =
    legacyFont === 'serif' ? 'lora' : 'jakarta';

  return {
    orientation: template?.orientation === 'landscape' ? 'landscape' : 'portrait',
    layoutPreset: template?.layoutPreset || 'nctb-classic',
    headerLayout: template?.headerLayout || 'centered',
    density: template?.density || 'balanced',
    pageMarginMm:
      typeof template?.pageMarginMm === 'number'
        ? Math.min(20, Math.max(5, template.pageMarginMm))
        : 9,
    fontScale:
      typeof template?.fontScale === 'number'
        ? Math.min(1.2, Math.max(0.8, template.fontScale))
        : 1,
    borderWidthPx:
      typeof template?.borderWidthPx === 'number'
        ? Math.min(6, Math.max(0, template.borderWidthPx))
        : 3,
    borderRadiusPx:
      typeof template?.borderRadiusPx === 'number'
        ? Math.min(24, Math.max(0, template.borderRadiusPx))
        : 8,
    sideBySideBioAndScale: template?.sideBySideBioAndScale ?? true,
    autoFitSinglePage: template?.autoFitSinglePage ?? true,
    sectionOrder: mergedOrder,
    borderStyle: template?.borderStyle || 'classic-double',
    accentColor: template?.accentColor || '#9a3412',
    fontFamily: legacyFont,
    headingFont: template?.headingFont || defaultHeadingFont,
    bodyFont: template?.bodyFont || defaultBodyFont,
    pageBackgroundUrl: template?.pageBackgroundUrl || '',
    pageBackgroundPublicId: template?.pageBackgroundPublicId || '',
    pageBackgroundOpacity:
      typeof template?.pageBackgroundOpacity === 'number'
        ? Math.min(1, Math.max(0.05, template.pageBackgroundOpacity))
        : 0.95,
    watermarkLogoUrl: template?.watermarkLogoUrl || '',
    watermarkLogoPublicId: template?.watermarkLogoPublicId || '',
    watermarkScalePercent:
      typeof template?.watermarkScalePercent === 'number'
        ? Math.min(120, Math.max(20, template.watermarkScalePercent))
        : 55,
    watermarkOpacity:
      typeof template?.watermarkOpacity === 'number'
        ? Math.min(0.35, Math.max(0.04, template.watermarkOpacity))
        : 0.1,
    boardTitle: template?.boardTitle || '',
    headerSubtitle:
      template?.headerSubtitle || 'Academic Transcript & Official Marksheet',
    defaultWorkingDays: template?.defaultWorkingDays,
    showHeader: template?.showHeader ?? true,
    showStudentPhoto: template?.showStudentPhoto ?? false,
    showBanglaName: template?.showBanglaName ?? true,
    showFatherMother: template?.showFatherMother ?? true,
    showRollReg: template?.showRollReg ?? true,
    showClassSectionGroup: template?.showClassSectionGroup ?? true,
    showSystemId: template?.showSystemId ?? true,
    showDateOfBirth: template?.showDateOfBirth ?? false,
    showGradingScale: template?.showGradingScale ?? true,
    showSubjectCode: template?.showSubjectCode ?? true,
    showFullMarksCol: template?.showFullMarksCol ?? true,
    showPassMarksCol: template?.showPassMarksCol ?? false,
    showCombinedPaperDetails: template?.showCombinedPaperDetails ?? true,
    showGradePointCol: template?.showGradePointCol ?? true,
    showCoreGpaAndBonus: template?.showCoreGpaAndBonus ?? true,
    showMeritRank: template?.showMeritRank ?? true,
    showAttendanceConduct: template?.showAttendanceConduct ?? true,
    showQrVerification: template?.showQrVerification ?? true,
    labels: {
      ...DEFAULT_MARKSHEET_LABELS,
      ...(template?.labels || {}),
    },
    labelStyles: template?.labelStyles || {},
    customTextBlocks: template?.customTextBlocks || [],
    customFields: template?.customFields || [],
  };
}

interface FloatingBoxToolbarProps {
  fontFamily?: MarksheetFontId;
  fontSizePx?: number;
  bold?: boolean;
  italic?: boolean;
  align?: 'left' | 'center' | 'right';
  supportsAlign?: boolean;
  isCustomBlock?: boolean;
  onChangeFontFamily: (font?: MarksheetFontId) => void;
  onChangeFontSize: (size: number) => void;
  onToggleBold: () => void;
  onToggleItalic: () => void;
  onChangeAlign?: (align: 'left' | 'center' | 'right') => void;
  onDeleteOrHide: () => void;
  onClose: () => void;
}

function FloatingBoxToolbar({
  fontFamily,
  fontSizePx,
  bold,
  italic,
  align,
  supportsAlign,
  isCustomBlock,
  onChangeFontFamily,
  onChangeFontSize,
  onToggleBold,
  onToggleItalic,
  onChangeAlign,
  onDeleteOrHide,
  onClose,
}: FloatingBoxToolbarProps) {
  const currentSize = fontSizePx || 12;

  return (
    <div
      data-ms-floating-toolbar="true"
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      className="no-print studio-edit-indicator absolute bottom-full left-0 mb-1.5 z-50 bg-slate-900 text-white rounded-xl shadow-2xl border border-slate-700 px-2 py-1 flex items-center gap-1 text-[11px] font-sans whitespace-nowrap"
    >
      <select
        value={fontFamily || ''}
        onChange={(e) =>
          onChangeFontFamily((e.target.value || undefined) as MarksheetFontId | undefined)
        }
        title="Box Font Family"
        className="bg-slate-800 text-white border border-slate-700 rounded-lg px-1.5 py-0.5 text-[10px] font-semibold focus:outline-hidden max-w-[130px] cursor-pointer"
      >
        <option value="">Sheet Font</option>
        {MARKSHEET_FONT_OPTIONS.map((f) => (
          <option key={f.id} value={f.id}>
            {f.label.split(' (')[0]}
          </option>
        ))}
      </select>

      <div className="flex items-center bg-slate-800 border border-slate-700 rounded-lg overflow-hidden">
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onChangeFontSize(Math.max(8, currentSize - 1))}
          className="px-1 py-0.5 hover:bg-slate-700 cursor-pointer"
          title="Decrease font size"
        >
          <Minus className="w-3 h-3" />
        </button>
        <span className="px-1.5 font-mono text-[10px] font-bold tabular-nums min-w-[28px] text-center">
          {fontSizePx ? `${fontSizePx}px` : 'Auto'}
        </span>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onChangeFontSize(Math.min(28, currentSize + 1))}
          className="px-1 py-0.5 hover:bg-slate-700 cursor-pointer"
          title="Increase font size"
        >
          <Plus className="w-3 h-3" />
        </button>
      </div>

      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={onToggleBold}
        className={`p-1 rounded-md cursor-pointer ${
          bold ? 'bg-amber-500 text-slate-950' : 'hover:bg-slate-800 text-slate-200'
        }`}
        title="Toggle Bold"
      >
        <Bold className="w-3 h-3" />
      </button>
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={onToggleItalic}
        className={`p-1 rounded-md cursor-pointer ${
          italic ? 'bg-amber-500 text-slate-950' : 'hover:bg-slate-800 text-slate-200'
        }`}
        title="Toggle Italic"
      >
        <Italic className="w-3 h-3" />
      </button>

      {supportsAlign && onChangeAlign && (
        <div className="flex items-center border-l border-slate-700 pl-1 gap-0.5">
          {(
            [
              { val: 'left', Icon: AlignLeft },
              { val: 'center', Icon: AlignCenter },
              { val: 'right', Icon: AlignRight },
            ] as const
          ).map(({ val, Icon }) => (
            <button
              key={val}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onChangeAlign(val)}
              className={`p-1 rounded-md cursor-pointer ${
                (align || 'left') === val
                  ? 'bg-amber-500 text-slate-950'
                  : 'hover:bg-slate-800 text-slate-200'
              }`}
              title={`Align ${val}`}
            >
              <Icon className="w-3 h-3" />
            </button>
          ))}
        </div>
      )}

      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={onDeleteOrHide}
        className="p-1 rounded-md hover:bg-red-600 text-red-300 hover:text-white border-l border-slate-700 pl-1.5 ml-0.5 cursor-pointer"
        title={isCustomBlock ? 'Delete custom block' : 'Hide this text box'}
      >
        {isCustomBlock ? <Trash2 className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
      </button>

      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={onClose}
        className="p-1 rounded-md hover:bg-slate-800 text-slate-400 hover:text-white cursor-pointer"
        title="Close toolbar"
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  );
}

interface InlineEditableProps {
  boxKey?: string;
  value: string;
  placeholder?: string;
  isEditMode?: boolean;
  multiline?: boolean;
  onCommit?: (next: string) => void;
  className?: string;
  style?: React.CSSProperties;
  labelStyle?: MarksheetLabelStyle;
  activeBoxId?: string | null;
  onActivateBox?: (boxId: string | null) => void;
  onUpdateLabelStyle?: (boxKey: string, patch: Partial<MarksheetLabelStyle>) => void;
}

function InlineEditable({
  boxKey,
  value,
  placeholder,
  isEditMode,
  multiline,
  onCommit,
  className = '',
  style,
  labelStyle,
  activeBoxId,
  onActivateBox,
  onUpdateLabelStyle,
}: InlineEditableProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  if (labelStyle?.hidden) {
    return null;
  }

  const boxId = boxKey ? `label:${boxKey}` : undefined;
  const isSelected = Boolean(isEditMode && boxId && activeBoxId === boxId);

  const mergedStyle: React.CSSProperties = {
    ...style,
    ...(labelStyle?.fontFamily
      ? { fontFamily: resolveMarksheetFontCss(labelStyle.fontFamily) }
      : {}),
    ...(labelStyle?.fontSizePx ? { fontSize: `${labelStyle.fontSizePx}px` } : {}),
    ...(labelStyle?.bold !== undefined
      ? { fontWeight: labelStyle.bold ? 700 : 400 }
      : {}),
    ...(labelStyle?.italic !== undefined
      ? { fontStyle: labelStyle.italic ? 'italic' : 'normal' }
      : {}),
  };

  if (!isEditMode || !onCommit) {
    return (
      <span className={className} style={mergedStyle}>
        {value || placeholder || ''}
      </span>
    );
  }

  const renderToolbar = () =>
    isSelected && boxKey && onUpdateLabelStyle ? (
      <FloatingBoxToolbar
        fontFamily={labelStyle?.fontFamily}
        fontSizePx={labelStyle?.fontSizePx}
        bold={labelStyle?.bold}
        italic={labelStyle?.italic}
        onChangeFontFamily={(font) => onUpdateLabelStyle(boxKey, { fontFamily: font })}
        onChangeFontSize={(size) => onUpdateLabelStyle(boxKey, { fontSizePx: size })}
        onToggleBold={() => onUpdateLabelStyle(boxKey, { bold: !labelStyle?.bold })}
        onToggleItalic={() =>
          onUpdateLabelStyle(boxKey, { italic: !labelStyle?.italic })
        }
        onDeleteOrHide={() => {
          onUpdateLabelStyle(boxKey, { hidden: true });
          onActivateBox?.(null);
        }}
        onClose={() => onActivateBox?.(null)}
      />
    ) : null;

  if (editing) {
    return (
      <span
        data-ms-editable-box={boxId}
        className="relative inline-block max-w-full align-baseline"
        onClick={(e) => e.stopPropagation()}
      >
        {renderToolbar()}
        {multiline ? (
          <textarea
            autoFocus
            rows={2}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => {
              setEditing(false);
              onCommit(draft);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setEditing(false);
                setDraft(value);
                onActivateBox?.(null);
              }
            }}
            style={mergedStyle}
            className="w-full min-w-[160px] px-1.5 py-0.5 rounded bg-amber-50 text-slate-900 border border-primary-container focus:outline-hidden leading-snug"
          />
        ) : (
          <input
            type="text"
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => {
              setEditing(false);
              onCommit(draft);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                setEditing(false);
                onCommit(draft);
              } else if (e.key === 'Escape') {
                setEditing(false);
                setDraft(value);
                onActivateBox?.(null);
              }
            }}
            style={mergedStyle}
            className="px-1.5 py-0.5 rounded bg-amber-50 text-slate-900 border border-primary-container focus:outline-hidden min-w-[70px] max-w-full"
          />
        )}
      </span>
    );
  }

  return (
    <span
      data-ms-editable-box={boxId}
      role="button"
      tabIndex={0}
      title="Click to edit text, font, size, or hide"
      onClick={(e) => {
        e.stopPropagation();
        if (boxId && onActivateBox) {
          onActivateBox(boxId);
        }
        setDraft(value);
        setEditing(true);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          if (boxId && onActivateBox) {
            onActivateBox(boxId);
          }
          setDraft(value);
          setEditing(true);
        }
      }}
      style={mergedStyle}
      className={`${className} relative inline-block cursor-text rounded px-0.5 -mx-0.5 border border-dashed transition-colors ${
        isSelected
          ? 'border-amber-500 bg-amber-50/80 ring-1 ring-amber-400/50'
          : 'border-transparent hover:border-amber-500/80 hover:bg-amber-50/60'
      }`}
    >
      {renderToolbar()}
      {value || <span className="opacity-50 italic">{placeholder || 'Click to edit'}</span>}
    </span>
  );
}

function BorderFrameDecorations({
  borderStyle,
  accentColor,
  borderRadiusPx,
}: {
  borderStyle: ResolvedMarksheetTemplate['borderStyle'];
  accentColor: string;
  borderRadiusPx: number;
}) {
  if (borderStyle === 'official-seal') {
    return (
      <div
        className="pointer-events-none absolute inset-1.5 border"
        style={{
          borderColor: `${accentColor}40`,
          borderRadius: `${Math.max(0, borderRadiusPx - 4)}px`,
        }}
      />
    );
  }

  if (borderStyle === 'ornate-guilloche') {
    return (
      <>
        <div
          className="pointer-events-none absolute inset-1.5 border"
          style={{
            borderColor: `${accentColor}45`,
            borderRadius: `${Math.max(0, borderRadiusPx - 4)}px`,
          }}
        />
        <div
          className="pointer-events-none absolute inset-2.5 border border-dashed"
          style={{
            borderColor: `${accentColor}30`,
            borderRadius: `${Math.max(0, borderRadiusPx - 6)}px`,
          }}
        />
        {(['tl', 'tr', 'bl', 'br'] as const).map((corner) => {
          const pos =
            corner === 'tl'
              ? 'top-1 left-1'
              : corner === 'tr'
              ? 'top-1 right-1 -scale-x-100'
              : corner === 'bl'
              ? 'bottom-1 left-1 -scale-y-100'
              : 'bottom-1 right-1 -scale-x-100 -scale-y-100';
          return (
            <svg
              key={corner}
              viewBox="0 0 48 48"
              className={`pointer-events-none absolute w-9 h-9 ${pos}`}
              fill="none"
              style={{ color: accentColor }}
            >
              <path
                d="M4 40V14C4 8.477 8.477 4 14 4H40"
                stroke="currentColor"
                strokeWidth="2"
                strokeOpacity="0.8"
              />
              <path
                d="M10 34V16C10 12.686 12.686 10 16 10H34"
                stroke="currentColor"
                strokeWidth="1.2"
                strokeOpacity="0.55"
              />
              <circle cx="10" cy="10" r="3.2" fill="currentColor" fillOpacity="0.75" />
            </svg>
          );
        })}
      </>
    );
  }

  if (borderStyle === 'diploma-crest') {
    return (
      <>
        <div
          className="pointer-events-none absolute inset-1 border-2"
          style={{
            borderColor: `${accentColor}35`,
            borderRadius: `${Math.max(0, borderRadiusPx - 3)}px`,
          }}
        />
        <div
          className="pointer-events-none absolute inset-2.5 border"
          style={{
            borderColor: `${accentColor}55`,
            borderRadius: `${Math.max(0, borderRadiusPx - 6)}px`,
          }}
        />
        {(['tl', 'tr', 'bl', 'br'] as const).map((corner) => {
          const pos =
            corner === 'tl'
              ? 'top-1.5 left-1.5'
              : corner === 'tr'
              ? 'top-1.5 right-1.5'
              : corner === 'bl'
              ? 'bottom-1.5 left-1.5'
              : 'bottom-1.5 right-1.5';
          return (
            <div
              key={corner}
              className={`pointer-events-none absolute w-3.5 h-3.5 rounded-full border-2 bg-white ${pos}`}
              style={{ borderColor: accentColor }}
            >
              <div
                className="w-1.5 h-1.5 rounded-full m-auto mt-[2px]"
                style={{ backgroundColor: accentColor }}
              />
            </div>
          );
        })}
      </>
    );
  }

  if (borderStyle === 'corner-brackets') {
    return (
      <>
        {(['tl', 'tr', 'bl', 'br'] as const).map((corner) => {
          const borderPos =
            corner === 'tl'
              ? 'top-0 left-0 border-t-[3px] border-l-[3px]'
              : corner === 'tr'
              ? 'top-0 right-0 border-t-[3px] border-r-[3px]'
              : corner === 'bl'
              ? 'bottom-0 left-0 border-b-[3px] border-l-[3px]'
              : 'bottom-0 right-0 border-b-[3px] border-r-[3px]';
          return (
            <div
              key={corner}
              className={`pointer-events-none absolute w-7 h-7 ${borderPos}`}
              style={{ borderColor: accentColor }}
            />
          );
        })}
      </>
    );
  }

  return null;
}

interface MarksheetDocumentProps {
  result: ExamResultRecord;
  exam?: Partial<Exam> | null;
  student?: Student | null;
  studentMetaOverride?: {
    avatarUrl?: string;
    banglaName?: string;
    dateOfBirth?: string;
  } | null;
  cmsConfig: CMSConfig;
  qrCodeDataUrl?: string;
  templateOverride?: MarksheetTemplate;
  metaOverride?: StudentMarksheetMeta;
  bgUrlOverride?: string;
  stationeryModeOverride?: 'full-design' | 'pre-printed-overlay';
  signatoriesOverride?: Signatory[];
  sheetRef?: React.Ref<HTMLDivElement>;
  isInlineEditMode?: boolean;
  onUpdateLabel?: (key: keyof MarksheetLabelsConfig, value: string) => void;
  onUpdateLabelStyle?: (key: string, patch: Partial<MarksheetLabelStyle>) => void;
  onUpdateTemplateField?: (patch: Partial<MarksheetTemplate>) => void;
  onUpdateCustomBlock?: (blockId: string, content: string) => void;
  onUpdateCustomBlockStyle?: (
    blockId: string,
    patch: Partial<MarksheetCustomTextBlock>
  ) => void;
  onRemoveCustomBlock?: (blockId: string) => void;
}

export default function MarksheetDocument({
  result,
  exam,
  student,
  studentMetaOverride,
  cmsConfig,
  qrCodeDataUrl,
  templateOverride,
  metaOverride,
  bgUrlOverride,
  stationeryModeOverride,
  signatoriesOverride,
  sheetRef,
  isInlineEditMode = false,
  onUpdateLabel,
  onUpdateLabelStyle,
  onUpdateTemplateField,
  onUpdateCustomBlock,
  onUpdateCustomBlockStyle,
  onRemoveCustomBlock,
}: MarksheetDocumentProps) {
  const [activeBoxId, setActiveBoxId] = useState<string | null>(null);
  const effectiveActiveBoxId = isInlineEditMode ? activeBoxId : null;

  useEffect(() => {
    registerGlobalMarksheetPrintCalibrator();
  }, []);

  useEffect(() => {
    if (!isInlineEditMode) {
      return;
    }
    const handleOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (
        target.closest('[data-ms-floating-toolbar="true"]') ||
        target.closest('[data-ms-editable-box]')
      ) {
        return;
      }
      setActiveBoxId(null);
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [isInlineEditMode]);

  const t = resolveMarksheetTemplate(templateOverride ?? exam?.marksheetTemplate);
  const L = t.labels;
  const meta: StudentMarksheetMeta =
    metaOverride ?? exam?.studentMarksheetMeta?.[result.studentId] ?? {};

  const isLandscape = t.orientation === 'landscape';
  const headingFontCss = resolveMarksheetFontCss(t.headingFont, 'jakarta');
  const bodyFontCss = resolveMarksheetFontCss(t.bodyFont, 'jakarta');

  const stationeryMode =
    stationeryModeOverride ?? exam?.stationeryMode ?? 'full-design';

  // Split Image Layer Resolution with seamless legacy fallback
  const pageBgUrl = t.pageBackgroundUrl || '';
  const legacyBgUrl = bgUrlOverride ?? exam?.marksheetBgUrl ?? '';
  const watermarkLogoUrl =
    t.watermarkLogoUrl || (!pageBgUrl ? legacyBgUrl : '');

  const signatories = (signatoriesOverride ?? exam?.signatories ?? []).filter(
    (s) => s.enabled
  );

  const effectivePhotoUrl = student?.avatarUrl || studentMetaOverride?.avatarUrl || '';
  const effectiveBanglaName = student?.banglaName || studentMetaOverride?.banglaName || '';
  const effectiveDob = student?.dateOfBirth || studentMetaOverride?.dateOfBirth || '';

  const workingDays =
    meta.workingDays ?? t.defaultWorkingDays ?? result.attendanceTotalDays;
  const daysPresent = meta.daysPresent ?? result.attendancePresent;
  const attendancePct =
    workingDays && workingDays > 0 && typeof daysPresent === 'number'
      ? `${((daysPresent / workingDays) * 100).toFixed(1)}%`
      : null;

  const conductValue = meta.conduct || result.conductGrade || '';
  const promotionText =
    meta.promotionStatus ||
    (result.isPassed
      ? L.passedStatusText
      : `${L.failedStatusText} (${result.failedSubjectCodes.join(', ') || 'Core Subjects'})`);
  const teacherRemark =
    meta.teacherRemark ||
    result.teacherRemarks ||
    (result.isPassed ? L.defaultPassRemark : L.defaultFailRemark);

  const gridCustomFields = t.customFields.filter(
    (f) => f.placement === 'student-grid'
  );
  const footerCustomFields = t.customFields.filter(
    (f) => f.placement === 'footer-notes'
  );

  const densityPadding =
    t.density === 'compact' || isLandscape
      ? 'p-3 sm:p-3.5'
      : t.density === 'spacious'
      ? 'p-6 sm:p-7'
      : 'p-4 sm:p-5';
  const rowPy =
    t.density === 'compact' || isLandscape
      ? 'py-1'
      : t.density === 'spacious'
      ? 'py-2'
      : 'py-1.5';
  const sectionGap =
    t.density === 'compact' || isLandscape
      ? 'space-y-2'
      : t.density === 'spacious'
      ? 'space-y-4'
      : 'space-y-3';

  const frameDynamicStyle: React.CSSProperties =
    stationeryMode === 'pre-printed-overlay' ||
    t.borderStyle === 'none' ||
    t.borderStyle === 'corner-brackets' ||
    t.borderWidthPx === 0
      ? {}
      : {
          borderColor: `${t.accentColor}75`,
          borderWidth: `${t.borderWidthPx}px`,
          borderStyle:
            t.borderStyle === 'classic-double' ||
            t.borderStyle === 'ornate-guilloche'
              ? 'double'
              : 'solid',
          borderRadius: `${t.borderRadiusPx}px`,
        };

  const showTopHeader = stationeryMode === 'full-design' && t.showHeader;

  const hasExplicitOrder = result.subjects.some((s) => typeof s.order === 'number');
  const displaySubjects = hasExplicitOrder
    ? [...result.subjects].sort((a, b) => (a.order ?? 9999) - (b.order ?? 9999))
    : result.subjects;

  const ctActive = displaySubjects.some((s) =>
    typeof s.ctEnabled === 'boolean'
      ? s.ctEnabled
      : Boolean(exam?.enableCT) || typeof s.ct === 'number'
  );
  const showCqCol = displaySubjects.some((s) =>
    typeof s.cqEnabled === 'boolean' ? s.cqEnabled : true
  );
  const showMcqCol = displaySubjects.some((s) =>
    typeof s.mcqEnabled === 'boolean' ? s.mcqEnabled : true
  );
  const showPracCol = displaySubjects.some((s) =>
    typeof s.practicalEnabled === 'boolean' ? s.practicalEnabled : true
  );

  const customHeadersMap = new Map<string, string>();
  for (const sub of displaySubjects) {
    for (const ch of sub.customComponents || []) {
      const norm = ch.label.trim().toLowerCase();
      if (norm && !customHeadersMap.has(norm)) {
        customHeadersMap.set(norm, ch.label.trim());
      }
    }
  }
  const customColumns = Array.from(customHeadersMap.entries()).map(([key, label]) => ({
    key,
    label,
  }));

  const getCustomFieldValue = (fieldId: string, defaultValue?: string) => {
    const val = meta.customValues?.[fieldId];
    if (val && val.trim()) return val;
    return defaultValue?.trim() || '—';
  };

  const interpolateBlockTokens = (raw: string): string => {
    const replacements: Record<string, string> = {
      '{{studentName}}': result.studentName || '',
      '{{rollNumber}}': String(result.rollNumber || ''),
      '{{className}}': result.className || '',
      '{{sectionName}}':
        result.sectionName === 'Common' ? 'Combined' : result.sectionName || '',
      '{{group}}': result.group || '',
      '{{systemId}}': result.systemId || '',
      '{{gpa}}': result.finalGPA.toFixed(2),
      '{{grade}}': result.finalLetterGrade || '',
      '{{examTitle}}': exam?.title || result.examTitle || '',
      '{{academicYear}}': exam?.academicYear || result.academicYear || '',
      '{{publishDate}}': formatDateDDMMYYYY(
        exam?.publishedAt || result.publishedAt || new Date().toISOString()
      ),
      '{{schoolName}}': L.schoolNameOverride || cmsConfig.schoolName || '',
    };
    let output = raw;
    for (const [token, val] of Object.entries(replacements)) {
      output = output.split(token).join(val);
    }
    return output;
  };

  const editableBindings = (boxKey: string) => ({
    boxKey,
    labelStyle: t.labelStyles[boxKey],
    activeBoxId: effectiveActiveBoxId,
    onActivateBox: setActiveBoxId,
    onUpdateLabelStyle,
  });

  const renderTextBlocksForPlacement = (
    placement: MarksheetCustomTextBlock['placement']
  ) => {
    const blocks = t.customTextBlocks.filter((b) => b.placement === placement);
    if (blocks.length === 0) return null;
    return (
      <div className="space-y-1.5 relative">
        {blocks.map((block) => {
          const blockBoxId = `block:${block.id}`;
          const isSelected = Boolean(isInlineEditMode && effectiveActiveBoxId === blockBoxId);
          const alignClass =
            block.align === 'center'
              ? 'text-center'
              : block.align === 'right'
              ? 'text-right'
              : 'text-left';
          const resolvedContent = isInlineEditMode
            ? block.content
            : interpolateBlockTokens(block.content);
          return (
            <div
              key={block.id}
              data-ms-editable-box={blockBoxId}
              onClick={(e) => {
                if (!isInlineEditMode) return;
                e.stopPropagation();
                setActiveBoxId(blockBoxId);
              }}
              className={`relative ${alignClass} ${
                block.bordered
                  ? 'p-2 rounded-lg bg-slate-50/85 border border-slate-200'
                  : 'px-1 py-0.5'
              } ${block.bold ? 'font-bold' : ''} ${block.italic ? 'italic' : ''} ${
                isInlineEditMode
                  ? isSelected
                    ? 'ring-1 ring-amber-500 border-amber-500 border border-dashed'
                    : 'hover:ring-1 hover:ring-amber-400/70'
                  : ''
              }`}
              style={{
                fontSize: `${block.fontSizePx || 11}px`,
                ...(block.fontFamily
                  ? { fontFamily: resolveMarksheetFontCss(block.fontFamily) }
                  : {}),
              }}
            >
              {isSelected && (
                <FloatingBoxToolbar
                  fontFamily={block.fontFamily}
                  fontSizePx={block.fontSizePx || 11}
                  bold={block.bold}
                  italic={block.italic}
                  align={block.align || 'left'}
                  supportsAlign
                  isCustomBlock
                  onChangeFontFamily={(font) =>
                    onUpdateCustomBlockStyle?.(block.id, { fontFamily: font })
                  }
                  onChangeFontSize={(size) =>
                    onUpdateCustomBlockStyle?.(block.id, { fontSizePx: size })
                  }
                  onToggleBold={() =>
                    onUpdateCustomBlockStyle?.(block.id, { bold: !block.bold })
                  }
                  onToggleItalic={() =>
                    onUpdateCustomBlockStyle?.(block.id, { italic: !block.italic })
                  }
                  onChangeAlign={(align) =>
                    onUpdateCustomBlockStyle?.(block.id, { align })
                  }
                  onDeleteOrHide={() => {
                    onRemoveCustomBlock?.(block.id);
                    setActiveBoxId(null);
                  }}
                  onClose={() => setActiveBoxId(null)}
                />
              )}
              {block.title && (
                <div className="text-[10px] uppercase tracking-wider font-bold text-slate-500 mb-0.5">
                  {block.title}
                </div>
              )}
              <InlineEditable
                value={resolvedContent}
                placeholder="Enter custom block content..."
                isEditMode={isInlineEditMode}
                multiline
                onCommit={
                  onUpdateCustomBlock
                    ? (next) => onUpdateCustomBlock(block.id, next)
                    : undefined
                }
                className="text-slate-800 whitespace-pre-line block"
              />
            </div>
          );
        })}
      </div>
    );
  };

  const resolvedSchoolName = (L.schoolNameOverride || cmsConfig.schoolName).toUpperCase();
  const defaultMetaLine = [
    cmsConfig.address,
    cmsConfig.eiin || '',
    cmsConfig.boardCode || '',
  ]
    .filter(Boolean)
    .join(' • ');
  const resolvedSchoolMeta = L.schoolMetaOverride || defaultMetaLine;
  const resolvedExamTitle =
    L.examTitleOverride ||
    `${exam?.title || result.examTitle} (${exam?.academicYear || result.academicYear})`;

  const renderHeaderSection = () => {
    if (!showTopHeader) return null;

    if (t.headerLayout === 'left-crest') {
      return (
        <div
          key="header"
          className={`${isLandscape ? 'pb-2' : 'pb-3'} border-b-2 relative flex items-center gap-4 text-left`}
          style={{ borderColor: `${t.accentColor}55` }}
        >
          {cmsConfig.crestUrl && (
            <img
              src={cmsConfig.crestUrl}
              alt={cmsConfig.schoolName}
              className={`${isLandscape ? 'h-11' : 'h-14'} w-auto object-contain shrink-0`}
              referrerPolicy="no-referrer"
            />
          )}
          <div className="flex-1 min-w-0">
            {(t.boardTitle || isInlineEditMode) && !t.labelStyles.boardTitle?.hidden && (
              <span className="text-[10px] font-bold tracking-[0.16em] uppercase text-slate-500 block">
                <InlineEditable
                  {...editableBindings('boardTitle')}
                  value={t.boardTitle}
                  placeholder="Optional Education Board Title"
                  isEditMode={isInlineEditMode}
                  onCommit={(v) => onUpdateTemplateField?.({ boardTitle: v })}
                />
              </span>
            )}
            <h1
              className={`${
                isLandscape ? 'text-lg sm:text-xl' : 'text-xl sm:text-2xl'
              } font-extrabold tracking-tight leading-tight`}
              style={{ color: t.accentColor, fontFamily: headingFontCss }}
            >
              <InlineEditable
                {...editableBindings('schoolNameOverride')}
                value={resolvedSchoolName}
                isEditMode={isInlineEditMode}
                onCommit={(v) => onUpdateLabel?.('schoolNameOverride', v)}
              />
            </h1>
            <p className="text-[11px] text-slate-600 font-mono mt-0.5">
              <InlineEditable
                {...editableBindings('schoolMetaOverride')}
                value={resolvedSchoolMeta}
                isEditMode={isInlineEditMode}
                onCommit={(v) => onUpdateLabel?.('schoolMetaOverride', v)}
              />
            </p>
          </div>
          <div className="text-right shrink-0 space-y-1">
            {!t.labelStyles.headerSubtitle?.hidden && (
              <div
                className="px-3 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider text-white inline-flex items-center gap-1"
                style={{ backgroundColor: t.accentColor, fontFamily: headingFontCss }}
              >
                <Award className="w-3 h-3 shrink-0" />
                <InlineEditable
                  {...editableBindings('headerSubtitle')}
                  value={t.headerSubtitle}
                  isEditMode={isInlineEditMode}
                  onCommit={(v) => onUpdateTemplateField?.({ headerSubtitle: v })}
                />
              </div>
            )}
            <span className="text-[11px] font-semibold text-slate-800 block">
              <InlineEditable
                {...editableBindings('examTitleOverride')}
                value={resolvedExamTitle}
                isEditMode={isInlineEditMode}
                onCommit={(v) => onUpdateLabel?.('examTitleOverride', v)}
              />
            </span>
          </div>
        </div>
      );
    }

    if (t.headerLayout === 'split-banner') {
      return (
        <div key="header" className="relative space-y-2">
          <div
            className={`rounded-lg px-4 ${
              isLandscape ? 'py-2' : 'py-3'
            } text-white flex items-center justify-between gap-4`}
            style={{ backgroundColor: t.accentColor }}
          >
            <div className="flex items-center gap-3 min-w-0">
              {cmsConfig.crestUrl && (
                <img
                  src={cmsConfig.crestUrl}
                  alt={cmsConfig.schoolName}
                  className={`${
                    isLandscape ? 'h-10' : 'h-12'
                  } w-auto object-contain bg-white/95 rounded-md p-1 shrink-0`}
                  referrerPolicy="no-referrer"
                />
              )}
              <div className="min-w-0">
                {(t.boardTitle || isInlineEditMode) && !t.labelStyles.boardTitle?.hidden && (
                  <div className="text-[9px] uppercase tracking-[0.18em] text-white/80 font-semibold">
                    <InlineEditable
                      {...editableBindings('boardTitle')}
                      value={t.boardTitle}
                      placeholder="Optional Board Line"
                      isEditMode={isInlineEditMode}
                      onCommit={(v) => onUpdateTemplateField?.({ boardTitle: v })}
                    />
                  </div>
                )}
                <h1
                  className={`${
                    isLandscape ? 'text-base sm:text-lg' : 'text-lg sm:text-xl'
                  } font-extrabold tracking-tight leading-tight`}
                  style={{ fontFamily: headingFontCss }}
                >
                  <InlineEditable
                    {...editableBindings('schoolNameOverride')}
                    value={resolvedSchoolName}
                    isEditMode={isInlineEditMode}
                    onCommit={(v) => onUpdateLabel?.('schoolNameOverride', v)}
                  />
                </h1>
                <p className="text-[10px] text-white/85 font-mono truncate">
                  <InlineEditable
                    {...editableBindings('schoolMetaOverride')}
                    value={resolvedSchoolMeta}
                    isEditMode={isInlineEditMode}
                    onCommit={(v) => onUpdateLabel?.('schoolMetaOverride', v)}
                  />
                </p>
              </div>
            </div>
            <div className="text-right shrink-0">
              {!t.labelStyles.headerSubtitle?.hidden && (
                <div
                  className="text-[11px] font-bold uppercase tracking-wider text-white"
                  style={{ fontFamily: headingFontCss }}
                >
                  <InlineEditable
                    {...editableBindings('headerSubtitle')}
                    value={t.headerSubtitle}
                    isEditMode={isInlineEditMode}
                    onCommit={(v) => onUpdateTemplateField?.({ headerSubtitle: v })}
                  />
                </div>
              )}
              <div className="text-xs font-semibold text-white/90 mt-0.5">
                <InlineEditable
                  {...editableBindings('examTitleOverride')}
                  value={resolvedExamTitle}
                  isEditMode={isInlineEditMode}
                  onCommit={(v) => onUpdateLabel?.('examTitleOverride', v)}
                />
              </div>
            </div>
          </div>
        </div>
      );
    }

    // Default Centered Institutional Header (compact horizontal variant in Landscape)
    if (isLandscape) {
      return (
        <div
          key="header"
          className="flex items-center justify-between gap-4 pb-2 border-b-2 relative"
          style={{ borderColor: `${t.accentColor}55` }}
        >
          <div className="flex items-center gap-3 min-w-0">
            {cmsConfig.crestUrl && (
              <img
                src={cmsConfig.crestUrl}
                alt={cmsConfig.schoolName}
                className="h-12 w-auto object-contain shrink-0"
                referrerPolicy="no-referrer"
              />
            )}
            <div className="min-w-0">
              {(t.boardTitle || isInlineEditMode) && !t.labelStyles.boardTitle?.hidden && (
                <span className="text-[9px] font-bold tracking-[0.16em] uppercase text-slate-500 block">
                  <InlineEditable
                    {...editableBindings('boardTitle')}
                    value={t.boardTitle}
                    placeholder="Optional Education Board / Trust Line"
                    isEditMode={isInlineEditMode}
                    onCommit={(v) => onUpdateTemplateField?.({ boardTitle: v })}
                  />
                </span>
              )}
              <h1
                className="text-lg sm:text-xl font-extrabold tracking-tight leading-tight"
                style={{ color: t.accentColor, fontFamily: headingFontCss }}
              >
                <InlineEditable
                  {...editableBindings('schoolNameOverride')}
                  value={resolvedSchoolName}
                  isEditMode={isInlineEditMode}
                  onCommit={(v) => onUpdateLabel?.('schoolNameOverride', v)}
                />
              </h1>
              <p className="text-[10px] text-slate-600 font-mono">
                <InlineEditable
                  {...editableBindings('schoolMetaOverride')}
                  value={resolvedSchoolMeta}
                  isEditMode={isInlineEditMode}
                  onCommit={(v) => onUpdateLabel?.('schoolMetaOverride', v)}
                />
              </p>
            </div>
          </div>

          <div className="text-right shrink-0">
            {!t.labelStyles.headerSubtitle?.hidden && (
              <div
                className="px-3.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider text-white inline-flex items-center gap-1.5"
                style={{ backgroundColor: t.accentColor, fontFamily: headingFontCss }}
              >
                <Award className="w-3.5 h-3.5 shrink-0" />
                <InlineEditable
                  {...editableBindings('headerSubtitle')}
                  value={t.headerSubtitle}
                  isEditMode={isInlineEditMode}
                  onCommit={(v) => onUpdateTemplateField?.({ headerSubtitle: v })}
                />
              </div>
            )}
            <span className="text-xs font-semibold text-slate-800 mt-1 block">
              <InlineEditable
                {...editableBindings('examTitleOverride')}
                value={resolvedExamTitle}
                isEditMode={isInlineEditMode}
                onCommit={(v) => onUpdateLabel?.('examTitleOverride', v)}
              />
            </span>
          </div>
        </div>
      );
    }

    return (
      <div
        key="header"
        className="flex flex-col items-center text-center pb-3 border-b-2 relative"
        style={{ borderColor: `${t.accentColor}55` }}
      >
        {cmsConfig.crestUrl && (
          <img
            src={cmsConfig.crestUrl}
            alt={cmsConfig.schoolName}
            className="h-12 w-auto object-contain mb-1"
            referrerPolicy="no-referrer"
          />
        )}
        {(t.boardTitle || isInlineEditMode) && !t.labelStyles.boardTitle?.hidden && (
          <span className="text-[10px] font-bold tracking-[0.18em] uppercase text-slate-500 mb-0.5">
            <InlineEditable
              {...editableBindings('boardTitle')}
              value={t.boardTitle}
              placeholder="Optional Education Board / Trust Line"
              isEditMode={isInlineEditMode}
              onCommit={(v) => onUpdateTemplateField?.({ boardTitle: v })}
            />
          </span>
        )}
        <h1
          className="text-xl sm:text-2xl font-extrabold tracking-tight"
          style={{ color: t.accentColor, fontFamily: headingFontCss }}
        >
          <InlineEditable
            {...editableBindings('schoolNameOverride')}
            value={resolvedSchoolName}
            isEditMode={isInlineEditMode}
            onCommit={(v) => onUpdateLabel?.('schoolNameOverride', v)}
          />
        </h1>
        <p className="text-[11px] text-slate-600 font-mono mt-0.5">
          <InlineEditable
            {...editableBindings('schoolMetaOverride')}
            value={resolvedSchoolMeta}
            isEditMode={isInlineEditMode}
            onCommit={(v) => onUpdateLabel?.('schoolMetaOverride', v)}
          />
        </p>
        {!t.labelStyles.headerSubtitle?.hidden && (
          <div
            className="mt-2 px-4 py-1 rounded-md text-[11px] font-bold uppercase tracking-wider text-white inline-flex items-center gap-1.5"
            style={{ backgroundColor: t.accentColor, fontFamily: headingFontCss }}
          >
            <Award className="w-3.5 h-3.5 shrink-0" />
            <InlineEditable
              {...editableBindings('headerSubtitle')}
              value={t.headerSubtitle}
              isEditMode={isInlineEditMode}
              onCommit={(v) => onUpdateTemplateField?.({ headerSubtitle: v })}
            />
          </div>
        )}
        <span className="text-xs font-semibold text-slate-800 mt-1.5">
          <InlineEditable
            {...editableBindings('examTitleOverride')}
            value={resolvedExamTitle}
            isEditMode={isInlineEditMode}
            onCommit={(v) => onUpdateLabel?.('examTitleOverride', v)}
          />
        </span>
      </div>
    );
  };

  const renderCandidateBioCard = (fullWidth = false) => (
    <div
      className={`${
        fullWidth ? 'w-full' : t.showGradingScale && t.sideBySideBioAndScale ? 'sm:col-span-8' : 'w-full'
      } bg-slate-50/85 ${isLandscape ? 'p-2.5' : 'p-3'} rounded-xl border border-slate-200 flex gap-3 items-start`}
    >
      {t.showStudentPhoto && (
        <div
          className={`${
            isLandscape ? 'w-14 h-16' : 'w-16 h-20'
          } rounded-lg border border-slate-300 bg-white overflow-hidden shrink-0 flex items-center justify-center`}
        >
          {effectivePhotoUrl ? (
            <img
              src={effectivePhotoUrl}
              alt={result.studentName}
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover"
            />
          ) : (
            <span className="text-[10px] font-bold text-slate-400 text-center px-1">
              Photo
            </span>
          )}
        </div>
      )}

      <div
        className={`grid ${
          isLandscape ? 'grid-cols-3 gap-x-3 gap-y-1' : 'grid-cols-2 gap-x-4 gap-y-1.5'
        } flex-1`}
      >
        <div className={t.showRollReg ? '' : isLandscape ? 'col-span-3' : 'col-span-2'}>
          <span className="text-slate-500 block text-[10px] uppercase tracking-wider">
            <InlineEditable
              {...editableBindings('candidateNameLabel')}
              value={L.candidateNameLabel}
              isEditMode={isInlineEditMode}
              onCommit={(v) => onUpdateLabel?.('candidateNameLabel', v)}
            />
          </span>
          <span
            className="font-bold text-sm text-slate-900 block leading-snug"
            style={{ fontFamily: headingFontCss }}
          >
            {result.studentName}
          </span>
          {t.showBanglaName && effectiveBanglaName && (
            <span className="text-[11px] text-slate-600 block">
              {effectiveBanglaName}
            </span>
          )}
        </div>

        {t.showRollReg && (
          <div>
            <span className="text-slate-500 block text-[10px] uppercase tracking-wider">
              <InlineEditable
                {...editableBindings('rollRegLabel')}
                value={L.rollRegLabel}
                isEditMode={isInlineEditMode}
                onCommit={(v) => onUpdateLabel?.('rollRegLabel', v)}
              />
            </span>
            <span
              className="font-bold font-mono text-sm block tabular-nums"
              style={{ color: t.accentColor }}
            >
              <InlineEditable
                {...editableBindings('rollPrefix')}
                value={L.rollPrefix}
                isEditMode={isInlineEditMode}
                onCommit={(v) => onUpdateLabel?.('rollPrefix', v)}
              />
              {result.rollNumber}
            </span>
            <span className="text-[10px] font-mono text-slate-600 block tabular-nums">
              <InlineEditable
                {...editableBindings('regPrefix')}
                value={L.regPrefix}
                isEditMode={isInlineEditMode}
                onCommit={(v) => onUpdateLabel?.('regPrefix', v)}
              />{' '}
              {result.registrationNumber || '—'}
            </span>
          </div>
        )}

        {t.showFatherMother && (
          <>
            <div>
              <span className="text-slate-500 block text-[10px] uppercase tracking-wider">
                <InlineEditable
                  {...editableBindings('fatherNameLabel')}
                  value={L.fatherNameLabel}
                  isEditMode={isInlineEditMode}
                  onCommit={(v) => onUpdateLabel?.('fatherNameLabel', v)}
                />
              </span>
              <span className="font-medium text-slate-800">{result.fatherName || '—'}</span>
            </div>
            <div>
              <span className="text-slate-500 block text-[10px] uppercase tracking-wider">
                <InlineEditable
                  {...editableBindings('motherNameLabel')}
                  value={L.motherNameLabel}
                  isEditMode={isInlineEditMode}
                  onCommit={(v) => onUpdateLabel?.('motherNameLabel', v)}
                />
              </span>
              <span className="font-medium text-slate-800">{result.motherName || '—'}</span>
            </div>
          </>
        )}

        {t.showClassSectionGroup && (
          <>
            <div>
              <span className="text-slate-500 block text-[10px] uppercase tracking-wider">
                <InlineEditable
                  {...editableBindings('classSectionLabel')}
                  value={L.classSectionLabel}
                  isEditMode={isInlineEditMode}
                  onCommit={(v) => onUpdateLabel?.('classSectionLabel', v)}
                />
              </span>
              <span className="font-semibold text-slate-900">
                {result.className} —{' '}
                {result.sectionName === 'Common' ? 'Combined Cohort' : result.sectionName}
              </span>
            </div>
            <div>
              <span className="text-slate-500 block text-[10px] uppercase tracking-wider">
                <InlineEditable
                  {...editableBindings('groupShiftLabel')}
                  value={L.groupShiftLabel}
                  isEditMode={isInlineEditMode}
                  onCommit={(v) => onUpdateLabel?.('groupShiftLabel', v)}
                />
              </span>
              <span className="font-semibold text-slate-900">
                {result.group} ({result.shift})
              </span>
            </div>
          </>
        )}

        {t.showSystemId && (
          <div>
            <span className="text-slate-500 block text-[10px] uppercase tracking-wider">
              <InlineEditable
                {...editableBindings('studentIdLabel')}
                value={L.studentIdLabel}
                isEditMode={isInlineEditMode}
                onCommit={(v) => onUpdateLabel?.('studentIdLabel', v)}
              />
            </span>
            <span className="font-mono font-semibold text-slate-800 tabular-nums">
              {result.systemId}
            </span>
          </div>
        )}

        {t.showDateOfBirth && (
          <div>
            <span className="text-slate-500 block text-[10px] uppercase tracking-wider">
              <InlineEditable
                {...editableBindings('dobLabel')}
                value={L.dobLabel}
                isEditMode={isInlineEditMode}
                onCommit={(v) => onUpdateLabel?.('dobLabel', v)}
              />
            </span>
            <span className="font-mono font-semibold text-slate-800 tabular-nums">
              {formatDateDDMMYYYY(effectiveDob)}
            </span>
          </div>
        )}

        {gridCustomFields.map((field) => (
          <div key={field.id}>
            <span className="text-slate-500 block text-[10px] uppercase tracking-wider">
              {field.label}
            </span>
            <span className="font-semibold text-slate-900">
              {getCustomFieldValue(field.id, field.defaultValue)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );

  const renderGradingScaleCard = (fullWidth = false) => {
    if (!t.showGradingScale) return null;
    return (
      <div
        className={`${
          fullWidth ? 'w-full' : t.sideBySideBioAndScale ? 'sm:col-span-4' : 'w-full'
        } bg-slate-50/85 p-2.5 rounded-xl border border-slate-200 text-[10px]`}
      >
        <span
          className="font-bold text-center block uppercase text-[9px] mb-1 tracking-wider"
          style={{ color: t.accentColor, fontFamily: headingFontCss }}
        >
          <InlineEditable
            {...editableBindings('gradingScaleTitle')}
            value={L.gradingScaleTitle}
            isEditMode={isInlineEditMode}
            onCommit={(v) => onUpdateLabel?.('gradingScaleTitle', v)}
          />
        </span>
        <div className="grid grid-cols-3 gap-0.5 text-center font-mono tabular-nums">
          <span className="font-semibold">80–100</span><span>A+</span><span className="font-bold">5.0</span>
          <span className="font-semibold">70–79</span><span>A</span><span className="font-bold">4.0</span>
          <span className="font-semibold">60–69</span><span>A-</span><span className="font-bold">3.5</span>
          <span className="font-semibold">50–59</span><span>B</span><span className="font-bold">3.0</span>
          <span className="font-semibold">40–49</span><span>C</span><span className="font-bold">2.0</span>
          <span className="font-semibold">33–39</span><span>D</span><span className="font-bold">1.0</span>
          <span className="font-semibold text-red-600">0–32</span>
          <span className="text-red-600 font-bold">F</span>
          <span className="text-red-600 font-bold">0.0</span>
        </div>
      </div>
    );
  };

  const renderBioSection = () => (
    <div
      key="bio"
      className={`grid grid-cols-1 ${
        t.showGradingScale && t.sideBySideBioAndScale ? 'sm:grid-cols-12' : ''
      } gap-3 text-xs relative`}
    >
      {renderCandidateBioCard(false)}
      {renderGradingScaleCard(false)}
    </div>
  );

  const renderTableSection = () => (
    <div
      key="table"
      className="ms-table-wrap overflow-x-auto md:overflow-visible print:overflow-visible relative"
    >
      <table className="w-full text-left border-collapse text-[11px] border border-slate-300 bg-white/95">
        <thead>
          <tr className="bg-slate-100 text-slate-900 font-bold text-center">
            {t.showSubjectCode && (
              <th className={`${rowPy} px-2 border border-slate-300 text-left min-w-[54px] w-[70px]`}>
                <InlineEditable
                  {...editableBindings('codeColLabel')}
                  value={L.codeColLabel}
                  isEditMode={isInlineEditMode}
                  onCommit={(v) => onUpdateLabel?.('codeColLabel', v)}
                />
              </th>
            )}
            <th className={`${rowPy} px-2 border border-slate-300 text-left`}>
              <InlineEditable
                {...editableBindings('subjectColLabel')}
                value={L.subjectColLabel}
                isEditMode={isInlineEditMode}
                onCommit={(v) => onUpdateLabel?.('subjectColLabel', v)}
              />
            </th>
            {t.showFullMarksCol && (
              <th className={`${rowPy} px-1.5 border border-slate-300`}>
                <InlineEditable
                  {...editableBindings('fullColLabel')}
                  value={L.fullColLabel}
                  isEditMode={isInlineEditMode}
                  onCommit={(v) => onUpdateLabel?.('fullColLabel', v)}
                />
              </th>
            )}
            {t.showPassMarksCol && (
              <th className={`${rowPy} px-1.5 border border-slate-300`}>
                <InlineEditable
                  {...editableBindings('passColLabel')}
                  value={L.passColLabel}
                  isEditMode={isInlineEditMode}
                  onCommit={(v) => onUpdateLabel?.('passColLabel', v)}
                />
              </th>
            )}
            {ctActive && (
              <th className={`${rowPy} px-1.5 border border-slate-300 bg-amber-50 text-amber-900`}>
                <InlineEditable
                  {...editableBindings('ctColLabel')}
                  value={L.ctColLabel}
                  isEditMode={isInlineEditMode}
                  onCommit={(v) => onUpdateLabel?.('ctColLabel', v)}
                />
              </th>
            )}
            {showCqCol && (
              <th className={`${rowPy} px-1.5 border border-slate-300`}>
                <InlineEditable
                  {...editableBindings('cqColLabel')}
                  value={L.cqColLabel}
                  isEditMode={isInlineEditMode}
                  onCommit={(v) => onUpdateLabel?.('cqColLabel', v)}
                />
              </th>
            )}
            {showMcqCol && (
              <th className={`${rowPy} px-1.5 border border-slate-300`}>
                <InlineEditable
                  {...editableBindings('mcqColLabel')}
                  value={L.mcqColLabel}
                  isEditMode={isInlineEditMode}
                  onCommit={(v) => onUpdateLabel?.('mcqColLabel', v)}
                />
              </th>
            )}
            {showPracCol && (
              <th className={`${rowPy} px-1.5 border border-slate-300`}>
                <InlineEditable
                  {...editableBindings('pracColLabel')}
                  value={L.pracColLabel}
                  isEditMode={isInlineEditMode}
                  onCommit={(v) => onUpdateLabel?.('pracColLabel', v)}
                />
              </th>
            )}
            {customColumns.map((col) => (
              <th
                key={col.key}
                className={`${rowPy} px-1.5 border border-slate-300 bg-indigo-50/70 text-indigo-900`}
              >
                {col.label}
              </th>
            ))}
            <th className={`${rowPy} px-1.5 border border-slate-300 font-bold`}>
              <InlineEditable
                {...editableBindings('totalColLabel')}
                value={L.totalColLabel}
                isEditMode={isInlineEditMode}
                onCommit={(v) => onUpdateLabel?.('totalColLabel', v)}
              />
            </th>
            {t.showGradePointCol && (
              <th className={`${rowPy} px-1.5 border border-slate-300`}>
                <InlineEditable
                  {...editableBindings('gpColLabel')}
                  value={L.gpColLabel}
                  isEditMode={isInlineEditMode}
                  onCommit={(v) => onUpdateLabel?.('gpColLabel', v)}
                />
              </th>
            )}
            <th className={`${rowPy} px-1.5 border border-slate-300 font-bold`}>
              <InlineEditable
                {...editableBindings('gradeColLabel')}
                value={L.gradeColLabel}
                isEditMode={isInlineEditMode}
                onCommit={(v) => onUpdateLabel?.('gradeColLabel', v)}
              />
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200">
          {displaySubjects.map((sub, idx) => {
            const effectivePass =
              sub.passMarks ??
              (sub.fullMarks > 0 ? Math.round(sub.fullMarks * 0.33) : 0);
            const rowCtOn =
              typeof sub.ctEnabled === 'boolean' ? sub.ctEnabled : ctActive;
            const rowCqOn =
              typeof sub.cqEnabled === 'boolean' ? sub.cqEnabled : true;
            const rowMcqOn =
              typeof sub.mcqEnabled === 'boolean' ? sub.mcqEnabled : sub.mcq > 0;
            const rowPracOn =
              typeof sub.practicalEnabled === 'boolean'
                ? sub.practicalEnabled
                : sub.practical > 0;

            return (
              <tr
                key={`${sub.subjectCode}-${idx}`}
                className={`text-center ${sub.isFourthSubject ? 'bg-amber-50/40' : ''}`}
              >
                {t.showSubjectCode && (
                  <td className={`${rowPy} px-2 text-left font-mono border border-slate-300 text-slate-700 tabular-nums`}>
                    {sub.subjectCode}
                  </td>
                )}
                <td className={`${rowPy} px-2 text-left border border-slate-300 font-medium`}>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span>{sub.subjectName}</span>
                    {sub.isFourthSubject && (
                      <span
                        className="px-1.5 py-0.5 rounded font-bold text-[9px]"
                        style={{
                          backgroundColor: `${t.accentColor}15`,
                          color: t.accentColor,
                        }}
                      >
                        <InlineEditable
                          {...editableBindings('fourthBadgeLabel')}
                          value={L.fourthBadgeLabel}
                          isEditMode={isInlineEditMode}
                          onCommit={(v) => onUpdateLabel?.('fourthBadgeLabel', v)}
                        />
                      </span>
                    )}
                  </div>
                  {t.showCombinedPaperDetails &&
                    sub.combinedPapers &&
                    sub.combinedPapers.length > 1 && (
                      <div className="text-[9px] text-slate-500 font-mono mt-0.5 tabular-nums">
                        {sub.combinedPapers
                          .map(
                            (p) =>
                              `${p.subjectCode}: ${p.isAbsent ? 'AB' : p.total}/${p.fullMarks}`
                          )
                          .join(' · ')}
                      </div>
                    )}
                </td>
                {t.showFullMarksCol && (
                  <td className={`${rowPy} px-1.5 border border-slate-300 font-mono tabular-nums`}>
                    {sub.fullMarks}
                  </td>
                )}
                {t.showPassMarksCol && (
                  <td className={`${rowPy} px-1.5 border border-slate-300 font-mono tabular-nums text-slate-600`}>
                    {effectivePass}
                  </td>
                )}
                {ctActive && (
                  <td className={`${rowPy} px-1.5 border border-slate-300 font-mono tabular-nums bg-amber-50/50`}>
                    {!rowCtOn ? (
                      '—'
                    ) : sub.isAbsent ? (
                      <span className="text-red-600 font-bold">AB</span>
                    ) : (
                      sub.ct ?? '—'
                    )}
                  </td>
                )}
                {showCqCol && (
                  <td className={`${rowPy} px-1.5 border border-slate-300 font-mono tabular-nums`}>
                    {!rowCqOn ? (
                      '—'
                    ) : sub.isAbsent ? (
                      <span className="text-red-600 font-bold">AB</span>
                    ) : (
                      sub.cq
                    )}
                  </td>
                )}
                {showMcqCol && (
                  <td className={`${rowPy} px-1.5 border border-slate-300 font-mono tabular-nums`}>
                    {!rowMcqOn ? (
                      '—'
                    ) : sub.isAbsent ? (
                      <span className="text-red-600 font-bold">AB</span>
                    ) : (
                      sub.mcq
                    )}
                  </td>
                )}
                {showPracCol && (
                  <td className={`${rowPy} px-1.5 border border-slate-300 font-mono tabular-nums`}>
                    {!rowPracOn ? (
                      '—'
                    ) : sub.isAbsent ? (
                      <span className="text-red-600 font-bold">AB</span>
                    ) : (
                      sub.practical
                    )}
                  </td>
                )}
                {customColumns.map((col) => {
                  const matched = (sub.customComponents || []).find(
                    (c) => c.label.trim().toLowerCase() === col.key
                  );
                  return (
                    <td
                      key={col.key}
                      className={`${rowPy} px-1.5 border border-slate-300 font-mono tabular-nums bg-indigo-50/30`}
                    >
                      {!matched ? (
                        '—'
                      ) : sub.isAbsent ? (
                        <span className="text-red-600 font-bold">AB</span>
                      ) : (
                        matched.convertedMarks
                      )}
                    </td>
                  );
                })}
                <td className={`${rowPy} px-1.5 border border-slate-300 font-mono tabular-nums font-bold`}>
                  {sub.isAbsent ? (
                    <span className="text-red-700 font-bold">AB</span>
                  ) : (
                    sub.total
                  )}
                </td>
                {t.showGradePointCol && (
                  <td className={`${rowPy} px-1.5 border border-slate-300 font-mono tabular-nums`}>
                    {sub.isAbsent ? '0.0' : sub.gradePoint.toFixed(1)}
                  </td>
                )}
                <td className={`${rowPy} px-1.5 border border-slate-300 font-bold`}>
                  <span
                    className={
                      sub.isAbsent || sub.letterGrade === 'F'
                        ? 'text-red-700 font-bold'
                        : 'text-slate-900'
                    }
                  >
                    {sub.letterGrade}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  const renderSummarySection = (stackedVertical = false) => (
    <div
      key="summary"
      className={`${stackedVertical ? 'p-2.5 space-y-2' : 'p-3 grid grid-cols-1 gap-3'} ${
        !stackedVertical ? (t.showMeritRank ? 'md:grid-cols-3' : 'md:grid-cols-2') : ''
      } bg-slate-50/90 rounded-xl border border-slate-200 text-xs relative`}
    >
      <div className="space-y-0.5">
        <span className="text-[10px] text-slate-500 font-semibold uppercase block">
          <InlineEditable
            {...editableBindings('aggregateTitle')}
            value={L.aggregateTitle}
            isEditMode={isInlineEditMode}
            onCommit={(v) => onUpdateLabel?.('aggregateTitle', v)}
          />
        </span>
        <div className="font-mono text-sm font-bold text-slate-900 tabular-nums">
          {result.totalMarksObtained} / {result.totalFullMarks}{' '}
          <InlineEditable
            {...editableBindings('marksUnitLabel')}
            value={L.marksUnitLabel}
            isEditMode={isInlineEditMode}
            onCommit={(v) => onUpdateLabel?.('marksUnitLabel', v)}
          />
        </div>
        <div className="text-[11px] text-slate-600 font-mono tabular-nums">
          <InlineEditable
            {...editableBindings('scoreRatioLabel')}
            value={L.scoreRatioLabel}
            isEditMode={isInlineEditMode}
            onCommit={(v) => onUpdateLabel?.('scoreRatioLabel', v)}
          />{' '}
          {result.totalFullMarks > 0
            ? `${Math.round((result.totalMarksObtained / result.totalFullMarks) * 100)}%`
            : '0%'}
        </div>
      </div>

      <div
        className={`space-y-0.5 ${
          stackedVertical
            ? 'border-t border-slate-200 pt-2'
            : 'border-y md:border-y-0 md:border-l border-slate-200 md:pl-3 py-2 md:py-0'
        }`}
      >
        <span className="text-[10px] text-slate-500 font-semibold uppercase block">
          <InlineEditable
            {...editableBindings('gpaTitle')}
            value={L.gpaTitle}
            isEditMode={isInlineEditMode}
            onCommit={(v) => onUpdateLabel?.('gpaTitle', v)}
          />
        </span>
        <div className="flex items-center gap-2">
          <span
            className="text-xl font-extrabold font-mono tabular-nums"
            style={{ color: t.accentColor }}
          >
            {result.finalGPA.toFixed(2)}
          </span>
          <span
            className={`px-2 py-0.5 rounded text-xs font-bold ${
              result.isPassed
                ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                : 'bg-red-100 text-red-900 border border-red-300'
            }`}
          >
            <InlineEditable
              {...editableBindings('gradePrefixLabel')}
              value={L.gradePrefixLabel}
              isEditMode={isInlineEditMode}
              onCommit={(v) => onUpdateLabel?.('gradePrefixLabel', v)}
            />{' '}
            {result.finalLetterGrade}
          </span>
        </div>
        {t.showCoreGpaAndBonus && (
          <div className="text-[10px] font-mono text-slate-600 tabular-nums">
            <InlineEditable
              {...editableBindings('coreGpaLabel')}
              value={L.coreGpaLabel}
              isEditMode={isInlineEditMode}
              onCommit={(v) => onUpdateLabel?.('coreGpaLabel', v)}
            />{' '}
            <strong>{result.gpaWithoutFourth.toFixed(2)}</strong> &bull;{' '}
            <InlineEditable
              {...editableBindings('fourthBonusLabel')}
              value={L.fourthBonusLabel}
              isEditMode={isInlineEditMode}
              onCommit={(v) => onUpdateLabel?.('fourthBonusLabel', v)}
            />{' '}
            <strong>+{result.fourthSubjectBonus.toFixed(2)}</strong>
          </div>
        )}
      </div>

      {t.showMeritRank && (
        <div
          className={`space-y-1 ${
            stackedVertical
              ? 'border-t border-slate-200 pt-2'
              : 'border-t md:border-t-0 md:border-l border-slate-200 md:pl-3 pt-2 md:pt-0'
          }`}
        >
          <span className="text-[10px] text-slate-500 font-semibold uppercase block">
            <InlineEditable
              {...editableBindings('meritTitle')}
              value={L.meritTitle}
              isEditMode={isInlineEditMode}
              onCommit={(v) => onUpdateLabel?.('meritTitle', v)}
            />
          </span>
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              className="px-2 py-0.5 rounded font-bold font-mono text-[11px] tabular-nums"
              style={{
                backgroundColor: `${t.accentColor}15`,
                color: t.accentColor,
              }}
            >
              <InlineEditable
                {...editableBindings('classRankLabel')}
                value={L.classRankLabel}
                isEditMode={isInlineEditMode}
                onCommit={(v) => onUpdateLabel?.('classRankLabel', v)}
              />{' '}
              #{result.classRank || 1}
            </span>
            <span className="px-2 py-0.5 rounded bg-slate-200/70 text-slate-700 font-bold font-mono text-[11px] tabular-nums">
              <InlineEditable
                {...editableBindings('sectionRankLabel')}
                value={L.sectionRankLabel}
                isEditMode={isInlineEditMode}
                onCommit={(v) => onUpdateLabel?.('sectionRankLabel', v)}
              />{' '}
              #{result.sectionRank || 1}
            </span>
          </div>
          <div className="pt-0.5">
            {result.isPassed ? (
              <span className="text-emerald-800 font-bold text-[11px] uppercase tracking-wider inline-flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                <InlineEditable
                  {...editableBindings('passedStatusText')}
                  value={meta.promotionStatus || L.passedStatusText}
                  isEditMode={isInlineEditMode && !meta.promotionStatus}
                  onCommit={(v) => onUpdateLabel?.('passedStatusText', v)}
                />
              </span>
            ) : (
              <span className="text-red-700 font-bold text-[11px] uppercase tracking-wider inline-flex items-center gap-1">
                <XCircle className="w-3.5 h-3.5 shrink-0" />
                <span>{promotionText}</span>
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );

  const renderAttendanceSection = () => {
    if (!t.showAttendanceConduct && footerCustomFields.length === 0) return null;
    return (
      <div
        key="attendance"
        className="p-2.5 bg-slate-50/75 rounded-xl border border-slate-200 text-xs space-y-1.5 relative"
      >
        {t.showAttendanceConduct && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-1.5 text-[11px] font-mono text-slate-600 border-b border-slate-200 pb-1.5 tabular-nums">
              <span>
                <InlineEditable
                  {...editableBindings('workingDaysLabel')}
                  value={L.workingDaysLabel}
                  isEditMode={isInlineEditMode}
                  onCommit={(v) => onUpdateLabel?.('workingDaysLabel', v)}
                />{' '}
                <strong className="text-slate-900">
                  {workingDays !== undefined ? workingDays : '—'}
                </strong>{' '}
                &bull;{' '}
                <InlineEditable
                  {...editableBindings('daysPresentLabel')}
                  value={L.daysPresentLabel}
                  isEditMode={isInlineEditMode}
                  onCommit={(v) => onUpdateLabel?.('daysPresentLabel', v)}
                />{' '}
                <strong className="text-slate-900">
                  {daysPresent !== undefined ? daysPresent : '—'}
                  {attendancePct ? ` (${attendancePct})` : ''}
                </strong>
              </span>
              <span>
                <InlineEditable
                  {...editableBindings('conductLabel')}
                  value={L.conductLabel}
                  isEditMode={isInlineEditMode}
                  onCommit={(v) => onUpdateLabel?.('conductLabel', v)}
                />{' '}
                <strong className="text-emerald-800 font-bold">
                  {conductValue || '—'}
                </strong>
              </span>
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider block">
                <InlineEditable
                  {...editableBindings('remarkTitle')}
                  value={L.remarkTitle}
                  isEditMode={isInlineEditMode}
                  onCommit={(v) => onUpdateLabel?.('remarkTitle', v)}
                />
              </span>
              <p className="text-[11px] text-slate-800 italic mt-0.5">
                <InlineEditable
                  {...editableBindings(
                    result.isPassed ? 'defaultPassRemark' : 'defaultFailRemark'
                  )}
                  value={teacherRemark}
                  isEditMode={
                    isInlineEditMode && !meta.teacherRemark && !result.teacherRemarks
                  }
                  multiline
                  onCommit={(v) =>
                    onUpdateLabel?.(
                      result.isPassed ? 'defaultPassRemark' : 'defaultFailRemark',
                      v
                    )
                  }
                />
              </p>
            </div>
          </>
        )}

        {footerCustomFields.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1.5 border-t border-slate-200/80">
            {footerCustomFields.map((field) => (
              <div key={field.id} className="text-[11px]">
                <span className="font-semibold text-slate-500">{field.label}: </span>
                <span className="font-bold text-slate-900">
                  {getCustomFieldValue(field.id, field.defaultValue)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  const renderSignaturesSection = () => (
    <div key="signatures" className={`space-y-2 ${isLandscape ? 'pt-2' : 'pt-3'} relative`}>
      <div className="flex flex-wrap items-end justify-between gap-4 text-xs">
        {t.showQrVerification && (
          <div className="flex items-center gap-2.5">
            {qrCodeDataUrl ? (
              <img
                src={qrCodeDataUrl}
                alt="Verification QR"
                className={`${
                  isLandscape ? 'w-12 h-12' : 'w-14 h-14'
                } border border-slate-200 p-0.5 bg-white shadow-xs`}
              />
            ) : (
              <div
                className={`${
                  isLandscape ? 'w-12 h-12' : 'w-14 h-14'
                } border border-slate-200 bg-slate-50 flex items-center justify-center text-slate-400`}
              >
                <QrCode className="w-6 h-6" />
              </div>
            )}
            <div className="text-[9px] font-mono text-slate-500 max-w-[165px]">
              <span className="font-bold block text-slate-800">
                <InlineEditable
                  {...editableBindings('qrTitle')}
                  value={L.qrTitle}
                  isEditMode={isInlineEditMode}
                  onCommit={(v) => onUpdateLabel?.('qrTitle', v)}
                />
              </span>
              <InlineEditable
                {...editableBindings('qrSubtitle')}
                value={L.qrSubtitle}
                isEditMode={isInlineEditMode}
                multiline
                onCommit={(v) => onUpdateLabel?.('qrSubtitle', v)}
              />
            </div>
          </div>
        )}

        <div className="flex flex-1 justify-around items-end pl-2 gap-4">
          {signatories.map((sig) => (
            <div key={sig.id} className="text-center min-w-[100px]">
              <div
                className={`w-28 mx-auto border-b border-slate-900 mb-1 ${
                  isLandscape ? 'h-7' : 'h-8'
                } flex items-end justify-center`}
              >
                {sig.signatureImgUrl ? (
                  <img
                    src={sig.signatureImgUrl}
                    alt={sig.name}
                    referrerPolicy="no-referrer"
                    className="max-h-7 w-auto object-contain mb-0.5"
                  />
                ) : (
                  <span className="font-serif italic text-[11px] text-slate-700 pb-0.5">
                    {sig.name}
                  </span>
                )}
              </div>
              <span className="font-bold text-[10px] block text-slate-900">
                {sig.title}
              </span>
              {sig.signatureImgUrl && (
                <span className="text-[9px] text-slate-500 block">{sig.name}</span>
              )}
            </div>
          ))}
        </div>
      </div>

      {(L.footerNoteText || isInlineEditMode) && !t.labelStyles.footerNoteText?.hidden && (
        <div className="pt-1 border-t border-slate-200/80 text-center text-[9px] text-slate-500">
          <InlineEditable
            {...editableBindings('footerNoteText')}
            value={L.footerNoteText}
            placeholder="Optional bottom footer disclaimer or institution note (click to edit)"
            isEditMode={isInlineEditMode}
            onCommit={(v) => onUpdateLabel?.('footerNoteText', v)}
          />
        </div>
      )}
    </div>
  );

  const renderSectionById = (sectionId: MarksheetSectionId) => {
    switch (sectionId) {
      case 'header':
        return (
          <React.Fragment key="header-group">
            {renderHeaderSection()}
            {renderTextBlocksForPlacement('below-header')}
          </React.Fragment>
        );
      case 'bio':
        return renderBioSection();
      case 'table':
        return (
          <React.Fragment key="table-group">
            {renderTextBlocksForPlacement('above-table')}
            {renderTableSection()}
          </React.Fragment>
        );
      case 'summary':
        return (
          <React.Fragment key="summary-group">
            {renderSummarySection(false)}
            {renderTextBlocksForPlacement('below-summary')}
          </React.Fragment>
        );
      case 'attendance':
        return renderAttendanceSection();
      case 'custom-blocks':
        return (
          <React.Fragment key="custom-blocks-group">
            {renderTextBlocksForPlacement('above-signatures')}
          </React.Fragment>
        );
      case 'signatures':
        return renderSignaturesSection();
      default:
        return null;
    }
  };

  return (
    <div
      ref={sheetRef}
      data-orientation={t.orientation}
      data-auto-fit={t.autoFitSinglePage ? 'true' : 'false'}
      style={{
        padding: `${t.pageMarginMm}mm`,
        fontSize: `${Math.round(12 * t.fontScale)}px`,
        fontFamily: bodyFontCss,
      }}
      className={`a4-page-container a4-marksheet-sheet ${
        isLandscape
          ? 'a4-landscape w-full max-w-[1123px]'
          : 'a4-portrait w-full max-w-[794px]'
      } bg-white text-slate-900 shadow-xl rounded-2xl border border-slate-200 relative overflow-hidden`}
    >
      {/* Layer 1: Independent Edge-to-Edge Full-Page Background */}
      {pageBgUrl && (
        <img
          src={pageBgUrl}
          alt=""
          referrerPolicy="no-referrer"
          className="absolute inset-0 w-full h-full object-cover pointer-events-none select-none"
          style={{ opacity: t.pageBackgroundOpacity }}
        />
      )}

      {/* Layer 2: Independent Centered Scaled Watermark Crest Logo */}
      {watermarkLogoUrl && (
        <div className="absolute inset-0 pointer-events-none select-none flex items-center justify-center overflow-hidden">
          <img
            src={watermarkLogoUrl}
            alt=""
            referrerPolicy="no-referrer"
            className="object-contain"
            style={{
              width: `${t.watermarkScalePercent}%`,
              maxHeight: `${t.watermarkScalePercent}%`,
              opacity: t.watermarkOpacity,
            }}
          />
        </div>
      )}

      {/* Outer Ornamental Frame */}
      <div
        className={`ms-frame-inner ${densityPadding} ${sectionGap} relative`}
        style={frameDynamicStyle}
      >
        {stationeryMode === 'full-design' && (
          <BorderFrameDecorations
            borderStyle={t.borderStyle}
            accentColor={t.accentColor}
            borderRadiusPx={t.borderRadiusPx}
          />
        )}

        {isLandscape ? (
          <div className="space-y-2.5">
            {/* Top Full-Span Institutional Header */}
            {renderHeaderSection()}
            {renderTextBlocksForPlacement('below-header')}

            {/* Smart 2-Column 8:4 Split Grid */}
            <div className="grid grid-cols-12 gap-3.5 items-start">
              <div className="col-span-8 space-y-2.5 min-w-0">
                {renderCandidateBioCard(true)}
                {renderTextBlocksForPlacement('above-table')}
                {renderTableSection()}
              </div>
              <div className="col-span-4 space-y-2.5 min-w-0">
                {renderGradingScaleCard(true)}
                {renderSummarySection(true)}
                {renderAttendanceSection()}
                {renderTextBlocksForPlacement('below-summary')}
              </div>
            </div>

            {/* Bottom Full-Span Footer Zone */}
            {renderTextBlocksForPlacement('above-signatures')}
            {renderSignaturesSection()}
          </div>
        ) : (
          t.sectionOrder.map((secId) => renderSectionById(secId))
        )}
      </div>
    </div>
  );
}
