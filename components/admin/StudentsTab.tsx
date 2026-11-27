'use client';

import { useEffect, useRef, useState } from 'react';
import { useERPStore } from '@/lib/store';
import {
  classMatchesEnabledWings,
  formatDateDDMMYYYY,
  formatGroupSectionDisplay,
  getEffectiveSectionsForClassGroup,
  getWingVisibility,
  isCollegeClassName,
  isSingleBatchCohort,
} from '@/lib/academic-helpers';
import { AcademicClass, AcademicGroup, ShiftType, Student } from '@/lib/types';
import {
  STUDENT_SCHEMA_FIELDS,
  formatStudentSystemId,
  generateSixDigitPin,
  getEffectiveStudentSchema,
  getFieldRequirement,
  isValidSixDigitPin,
} from '@/lib/student-schema';
import BulkImportReviewModal from './BulkImportReviewModal';
import BulkCredentialSlipModal from './BulkCredentialSlipModal';
import StudentExportModal from './StudentExportModal';
import StudentFormView from './StudentFormView';
import StudentAdmissionFormPrintModal from './StudentAdmissionFormPrintModal';
import StudentPromoteModal from './StudentPromoteModal';
import { BulkImportCellError, BulkImportCredential } from '@/app/api/students/bulk-import/route';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Copy,
  Eye,
  Filter,
  Loader2,
  Pencil,
  Printer,
  RefreshCw,
  RotateCcw,
  Search,
  Trash2,
  Users,
  X,
} from 'lucide-react';

const REQUEST_FIELD_LABELS: Record<string, string> = {
  avatarUrl: 'Student Photo',
  fullName: 'Full Name (English)',
  banglaName: 'Bangla Name',
  phone: 'Primary Mobile',
  bloodGroup: 'Blood Group',
  birthRegOrNid: 'Birth Reg / NID',
  dateOfBirth: 'Date of Birth',
  fatherName: "Father's Name",
  fatherPhone: "Father's Mobile",
  motherName: "Mother's Name",
  motherPhone: "Mother's Mobile",
  guardianName: 'Local Guardian Name',
  guardianRelation: 'Guardian Relation',
  guardianPhone: 'Guardian Phone',
  presentAddress: 'Present Address',
  permanentAddress: 'Permanent Address',
  address: 'Registered Address',
};

function classSupportsGroups(clsObj: AcademicClass | undefined): boolean {
  if (!clsObj) return false;
  if (clsObj.hasGroups === false) return false;
  if (clsObj.hasGroups === true) return true;
  return (clsObj.groups || []).some((g) => g !== 'General');
}

function getActiveShiftsForClass(
  clsObj: AcademicClass | undefined,
  enabledShifts: ShiftType[] | undefined
): ShiftType[] {
  const clsShifts = clsObj?.shifts?.length ? clsObj.shifts : [];
  const ruleShifts = enabledShifts?.length ? enabledShifts : [];
  const merged = clsShifts.length > 0 ? clsShifts : ruleShifts;
  return merged.length > 0 ? merged : ['Morning'];
}

export default function StudentsTab() {
  const { isHydrated } = useERPStore();
  return <StudentsTabInner key={isHydrated ? 'hydrated' : 'ssr'} />;
}

function StudentsTabInner() {
  const {
    state,
    addStudentAsync,
    updateStudentAsync,
    deleteStudent,
    graduateStudents,
    approveStudentUpdate,
    rejectStudentUpdate,
    refreshFromServer,
  } = useERPStore();
  const { students, subjects, academicClasses, cmsConfig, instituteRules, exams, markEntries } = state;

  const { showSchool, showCollege } = getWingVisibility(instituteRules);
  const visibleClasses = academicClasses.filter((c) =>
    classMatchesEnabledWings(c, instituteRules)
  );
  const effectiveClasses = visibleClasses.length > 0 ? visibleClasses : academicClasses;

  const [registerView, setRegisterView] = useState<'active' | 'alumni' | 'approvals'>('active');
  const [formMode, setFormMode] = useState<'list' | 'add' | 'edit'>('list');
  const [editingStudentId, setEditingStudentId] = useState<string | null>(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [quickSearchInput, setQuickSearchInput] = useState('');
  const [activeQuickQuery, setActiveQuickQuery] = useState('');
  const [filterSession, setFilterSession] = useState<string>('');
  const [filterClass, setFilterClass] = useState<string>('');
  const [filterGroup, setFilterGroup] = useState<string>('');
  const [filterSection, setFilterSection] = useState<string>('');
  const [filterShift, setFilterShift] = useState<string>('');
  const [filterReligion, setFilterReligion] = useState<string>('all');
  const [filterGender, setFilterGender] = useState<string>('all');
  const [filterGradYear, setFilterGradYear] = useState<string>('all');

  const [queriedStudents, setQueriedStudents] = useState<Student[]>([]);
  const [loadingDirectory, setLoadingDirectory] = useState(false);
  const [directoryError, setDirectoryError] = useState<string | null>(null);
  const [queryNonce, setQueryNonce] = useState(0);
  const [pendingApprovalsBadgeCount, setPendingApprovalsBadgeCount] = useState<number | null>(null);
  const requestSeqRef = useRef(0);

  const [showPromoteModal, setShowPromoteModal] = useState(false);
  const [showGraduateModal, setShowGraduateModal] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [printAdmissionStudent, setPrintAdmissionStudent] = useState<Student | null>(null);
  const [confirmDeleteStudent, setConfirmDeleteStudent] = useState<Student | null>(null);
  const [copiedPinId, setCopiedPinId] = useState<string | null>(null);
  const [generatingPinForId, setGeneratingPinForId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  // Batch selection for promotion / graduation
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [gradYear, setGradYear] = useState(instituteRules.activeAcademicYear || String(new Date().getFullYear()));
  const [gradWing, setGradWing] = useState<'SSC' | 'HSC'>(
    showSchool ? 'SSC' : 'HSC'
  );

  // Approval Queue states
  const [selectedApprovalFields, setSelectedApprovalFields] = useState<
    Record<string, Array<keyof Student>>
  >({});
  const [rejectionReasons, setRejectionReasons] = useState<Record<string, string>>({});

  const defaultClassObj = effectiveClasses[0] || academicClasses[0];
  const defaultClassName = defaultClassObj?.name || 'Grade 10';
  const defaultGroupName: AcademicGroup = defaultClassObj?.groups?.[0] || 'Science';
  const defaultSectionName =
    getEffectiveSectionsForClassGroup(defaultClassObj, defaultGroupName)[0] || 'Common';

  const [resetStudentPass, setResetStudentPass] = useState('');
  const [passErrorMsg, setPassErrorMsg] = useState<string | null>(null);
  const [resettingPin, setResettingPin] = useState(false);
  const [downloadingTemplate, setDownloadingTemplate] = useState(false);
  const [validatingCsv, setValidatingCsv] = useState(false);
  const [importReviewData, setImportReviewData] = useState<{
    fileName: string;
    csvText: string;
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
  } | null>(null);
  const [isCommittingImport, setIsCommittingImport] = useState(false);
  const [credentialSlips, setCredentialSlips] = useState<BulkImportCredential[] | null>(null);
  const [showExportModal, setShowExportModal] = useState(false);

  const showToast = (msg: string) => {
    setFeedback(msg);
    setTimeout(() => setFeedback(null), 3500);
  };

  const pendingApprovals = students.filter(
    (s) => s.updateRequestStatus === 'Pending' && s.updateRequest
  );
  const alumniStudents = students.filter(
    (s) => s.status === 'Alumni' || s.status === 'Graduated'
  );
  const activeStudents = students.filter(
    (s) => s.status !== 'Alumni' && s.status !== 'Graduated'
  );

  const gradYearOptions = Array.from(
    new Set(alumniStudents.map((s) => s.graduatedYear).filter((y): y is string => Boolean(y)))
  ).sort((a, b) => b.localeCompare(a));

  // Build Institute Session/Year Options (School Year + College HSC Sessions)
  const sessionOptions = (() => {
    const map = new Map<string, { value: string; label: string; isCollege: boolean }>();
    const pushOpt = (rawVal: string | undefined, label: string, isCollege: boolean) => {
      const val = (rawVal || '').trim();
      if (!val) return;
      const norm = val.replace(/[–—]/g, '-');
      if (!map.has(norm)) {
        map.set(norm, { value: val, label, isCollege });
      }
    };
    if (showSchool) {
      const yr = instituteRules.activeAcademicYear || String(new Date().getFullYear());
      pushOpt(yr, `${yr} · School Academic Year`, false);
    }
    if (showCollege) {
      const h1 = instituteRules.hscYear1Session || instituteRules.activeCollegeSession;
      const h2 = instituteRules.hscYear2Session;
      if (h1) pushOpt(h1, `${h1} · College Session (HSC 1st Yr)`, true);
      if (h2) pushOpt(h2, `${h2} · College Session (HSC 2nd Yr)`, true);
    }
    for (const c of effectiveClasses) {
      if (c.activeCycle) {
        const isCol = c.cycleType === 'Academic Session' || isCollegeClassName(c.name);
        pushOpt(
          c.activeCycle,
          `${c.activeCycle} · ${isCol ? 'College Session' : 'School Year'}`,
          isCol
        );
      }
    }
    for (const s of activeStudents) {
      if (s.batchCycle) {
        const isCol = isCollegeClassName(s.className) || /[–-]/.test(s.batchCycle);
        pushOpt(
          s.batchCycle,
          `${s.batchCycle} · ${isCol ? 'College Session' : 'School Year'}`,
          isCol
        );
      }
    }
    return Array.from(map.values());
  })();

  const selectedSessionOption = sessionOptions.find((o) => o.value === filterSession);
  const sessionFilteredClasses = (() => {
    if (!filterSession) return [];
    const normSel = filterSession.replace(/[–—]/g, '-');
    const exactOrWing = effectiveClasses.filter((c) => {
      const normClsCycle = (c.activeCycle || '').replace(/[–—]/g, '-');
      if (normClsCycle && normClsCycle === normSel) return true;
      const clsIsCollege = c.cycleType === 'Academic Session' || isCollegeClassName(c.name);
      if (selectedSessionOption) {
        return clsIsCollege === selectedSessionOption.isCollege;
      }
      return true;
    });
    return exactOrWing.length > 0 ? exactOrWing : effectiveClasses;
  })();

  // Query-First Cascading Selectors for Active Register (Session/Year -> Class -> Group -> Section -> Shift)
  const selectedClassObj = sessionFilteredClasses.find((c) => c.name === filterClass);
  const classHasGroups = classSupportsGroups(selectedClassObj);
  const availableGroups: AcademicGroup[] = selectedClassObj
    ? classHasGroups
      ? selectedClassObj.groups?.length
        ? selectedClassObj.groups
        : ['Science', 'Humanities', 'Business Studies']
      : ['General']
    : [];
  const effectiveGroupForSections: AcademicGroup | 'All' =
    filterGroup && filterGroup !== 'all'
      ? (filterGroup as AcademicGroup)
      : availableGroups[0] || 'General';
  const availableSections = selectedClassObj
    ? getEffectiveSectionsForClassGroup(selectedClassObj, effectiveGroupForSections)
    : [];
  const classHasSections = selectedClassObj
    ? selectedClassObj.hasSections !== false && !isSingleBatchCohort(availableSections)
    : false;
  const activeShifts = getActiveShiftsForClass(selectedClassObj, instituteRules.enabledShifts);
  const autoShift = activeShifts[0] || '';
  const hasMultipleShifts = activeShifts.length > 1;

  const isCohortQueryReady = Boolean(
    filterSession &&
      filterClass &&
      (!classHasGroups || filterGroup) &&
      (!classHasSections || filterSection) &&
      (!hasMultipleShifts || filterShift)
  );

  const runQuickSearch = async (rawQuery: string) => {
    const trimmed = rawQuery.trim();
    if (!trimmed) {
      setActiveQuickQuery('');
      setQueriedStudents([]);
      setDirectoryError(null);
      return;
    }
    const seq = ++requestSeqRef.current;
    setActiveQuickQuery(trimmed);
    setLoadingDirectory(true);
    setDirectoryError(null);
    setSelectedIds([]);
    try {
      const res = await fetch(
        `/api/students/quick-search?q=${encodeURIComponent(trimmed)}`,
        {
          credentials: 'include',
          cache: 'no-store',
        }
      );
      const data = await res.json();
      if (seq !== requestSeqRef.current) return;
      if (!res.ok) {
        throw new Error(data.error || 'Quick search failed');
      }
      setQueriedStudents(Array.isArray(data.students) ? data.students : []);
      if (typeof data.pendingApprovalsCount === 'number') {
        setPendingApprovalsBadgeCount(data.pendingApprovalsCount);
      }
    } catch (err) {
      if (seq !== requestSeqRef.current) return;
      setDirectoryError(err instanceof Error ? err.message : 'Quick search failed');
      setQueriedStudents([]);
    } finally {
      if (seq === requestSeqRef.current) {
        setLoadingDirectory(false);
      }
    }
  };

  // Live debounced search inside Student Management when typing >= 2 chars
  useEffect(() => {
    if (registerView !== 'active') return;
    const trimmed = quickSearchInput.trim();
    if (trimmed.length < 2 || trimmed === activeQuickQuery) return;

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      const seq = ++requestSeqRef.current;
      setActiveQuickQuery(trimmed);
      setLoadingDirectory(true);
      setDirectoryError(null);
      setSelectedIds([]);
      try {
        const res = await fetch(
          `/api/students/quick-search?q=${encodeURIComponent(trimmed)}`,
          {
            credentials: 'include',
            cache: 'no-store',
            signal: controller.signal,
          }
        );
        const data = await res.json();
        if (seq !== requestSeqRef.current) return;
        if (!res.ok) {
          throw new Error(data.error || 'Quick search failed');
        }
        setQueriedStudents(Array.isArray(data.students) ? data.students : []);
        if (typeof data.pendingApprovalsCount === 'number') {
          setPendingApprovalsBadgeCount(data.pendingApprovalsCount);
        }
      } catch (err) {
        if (controller.signal.aborted || seq !== requestSeqRef.current) return;
        setDirectoryError(err instanceof Error ? err.message : 'Quick search failed');
        setQueriedStudents([]);
      } finally {
        if (seq === requestSeqRef.current) {
          setLoadingDirectory(false);
        }
      }
    }, 350);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [quickSearchInput, registerView, activeQuickQuery]);

  useEffect(() => {
    if (registerView === 'approvals') {
      return;
    }

    if (registerView === 'active' && activeQuickQuery) {
      return;
    }

    if (registerView === 'active' && !isCohortQueryReady) {
      requestSeqRef.current += 1;
      return;
    }

    const seq = ++requestSeqRef.current;
    const controller = new AbortController();

    const params = new URLSearchParams();
    params.set('view', registerView);
    if (registerView === 'active') {
      if (filterSession) {
        params.set('batchCycle', filterSession);
      }
      params.set('className', filterClass);
      if (classHasGroups && filterGroup) {
        params.set('group', filterGroup);
      }
      if (classHasSections && filterSection) {
        params.set('sectionName', filterSection);
      }
      const resolvedShift = hasMultipleShifts ? filterShift : autoShift;
      if (resolvedShift) {
        params.set('shift', resolvedShift);
      }
    } else if (registerView === 'alumni') {
      if (filterGroup && filterGroup !== 'all') {
        params.set('group', filterGroup);
      }
      if (filterGradYear && filterGradYear !== 'all') {
        params.set('graduatedYear', filterGradYear);
      }
    }

    void (async () => {
      await Promise.resolve();
      if (controller.signal.aborted || seq !== requestSeqRef.current) return;
      setLoadingDirectory(true);
      setDirectoryError(null);
      try {
        const res = await fetch(`/api/students/register?${params.toString()}`, {
          credentials: 'include',
          cache: 'no-store',
          signal: controller.signal,
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'Failed to load student directory');
        }
        if (seq !== requestSeqRef.current) return;
        setQueriedStudents(Array.isArray(data.students) ? data.students : []);
        setSelectedIds([]);
      } catch (err) {
        if (controller.signal.aborted || seq !== requestSeqRef.current) return;
        setDirectoryError(
          err instanceof Error ? err.message : 'Could not query student directory.'
        );
        setQueriedStudents([]);
      } finally {
        if (seq === requestSeqRef.current) {
          setLoadingDirectory(false);
        }
      }
    })();

    return () => {
      controller.abort();
    };
  }, [
    registerView,
    isCohortQueryReady,
    filterSession,
    filterClass,
    filterGroup,
    filterSection,
    filterShift,
    classHasGroups,
    classHasSections,
    hasMultipleShifts,
    autoShift,
    activeQuickQuery,
    queryNonce,
    filterGradYear,
  ]);

  const handleSessionFilterChange = (nextSession: string) => {
    setActiveQuickQuery('');
    setQuickSearchInput('');
    setSearchTerm('');
    setSelectedIds([]);
    setFilterSession(nextSession);
    setFilterClass('');
    setFilterGroup('');
    setFilterSection('');
    setFilterShift('');
    setQueriedStudents([]);
  };

  const handleClassFilterChange = (nextCls: string) => {
    setActiveQuickQuery('');
    setQuickSearchInput('');
    setSearchTerm('');
    setSelectedIds([]);
    setFilterClass(nextCls);

    if (!nextCls) {
      setFilterGroup('');
      setFilterSection('');
      setFilterShift('');
      return;
    }

    const cObj = sessionFilteredClasses.find((c) => c.name === nextCls);
    const nextHasGroups = classSupportsGroups(cObj);
    const nextShifts = getActiveShiftsForClass(cObj, instituteRules.enabledShifts);

    if (nextHasGroups) {
      setFilterGroup('');
      setFilterSection('');
    } else {
      setFilterGroup('General');
      const secs = getEffectiveSectionsForClassGroup(cObj, 'General');
      const nextHasSections = cObj?.hasSections !== false && !isSingleBatchCohort(secs);
      setFilterSection(nextHasSections ? '' : secs[0] || 'Common');
    }

    setFilterShift(nextShifts.length === 1 ? nextShifts[0] : '');
  };

  const handleGroupFilterChange = (nextGrp: string) => {
    setActiveQuickQuery('');
    setSelectedIds([]);
    setFilterGroup(nextGrp);

    if (!selectedClassObj || !nextGrp) {
      setFilterSection('');
      return;
    }

    const secs = getEffectiveSectionsForClassGroup(
      selectedClassObj,
      (nextGrp === 'all' ? 'All' : nextGrp) as AcademicGroup | 'All'
    );
    const nextHasSections =
      selectedClassObj.hasSections !== false && !isSingleBatchCohort(secs);
    if (!nextHasSections) {
      setFilterSection(secs[0] || 'Common');
    } else if (filterSection && filterSection !== 'all' && !secs.includes(filterSection)) {
      setFilterSection('');
    }
  };

  const handleResetDirectoryQuery = () => {
    setActiveQuickQuery('');
    setQuickSearchInput('');
    setSearchTerm('');
    setFilterSession('');
    setFilterClass('');
    setFilterGroup('');
    setFilterSection('');
    setFilterShift('');
    setFilterReligion('all');
    setFilterGender('all');
    setSelectedIds([]);
    setQueriedStudents([]);
    setDirectoryError(null);
  };

  const hasLoadedActiveDirectory =
    registerView === 'active' && (Boolean(activeQuickQuery) || isCohortQueryReady);

  const filteredStudents =
    registerView === 'active' && !hasLoadedActiveDirectory
      ? []
      : queriedStudents.filter((s) => {
          const q = searchTerm.trim().toLowerCase();
          const matchesSearch =
            !q ||
            s.fullName.toLowerCase().includes(q) ||
            (s.banglaName || '').toLowerCase().includes(q) ||
            s.systemId.toLowerCase().includes(q) ||
            s.rollNumber.toString() === q ||
            (s.phone || '').toLowerCase().includes(q) ||
            (s.fatherName || '').toLowerCase().includes(q) ||
            (s.registrationNumber || '').toLowerCase().includes(q);
          if (registerView === 'alumni') {
            const matchesGradYear =
              filterGradYear === 'all' || s.graduatedYear === filterGradYear;
            const matchesGroup =
              !filterGroup || filterGroup === 'all' || s.group === filterGroup;
            return matchesSearch && matchesGradYear && matchesGroup;
          }
          const matchesReligion =
            filterReligion === 'all' || s.religionGroup === filterReligion;
          const matchesGender =
            filterGender === 'all' || (s.gender || 'Male') === filterGender;
          return matchesSearch && matchesReligion && matchesGender;
        });

  const openAddForm = () => {
    setEditingStudentId(null);
    setFormMode('add');
  };

  const openEditForm = (stu: Student) => {
    setEditingStudentId(stu.id);
    setFormMode('edit');
  };

  const handleSaveStudentForm = async (
    payload: Partial<Student> & Record<string, unknown>,
    passwordPin: string
  ): Promise<string | null> => {
    if (formMode === 'edit' && editingStudentId) {
      const updates: Partial<Student> = {
        ...payload,
        ...(passwordPin.trim() ? { password: passwordPin.trim() } : {}),
      };
      const res = await updateStudentAsync(editingStudentId, updates);
      if (!res.ok) {
        return res.error || 'Failed to update student record.';
      }
      setFormMode('list');
      setEditingStudentId(null);
      setQueryNonce((n) => n + 1);
      if (passwordPin.trim() && res.student) {
        setCredentialSlips([
          {
            studentId: res.student.systemId,
            name: res.student.fullName,
            className: res.student.className,
            sectionName: res.student.sectionName,
            roll: res.student.rollNumber,
            plainPin: passwordPin.trim(),
          },
        ]);
      } else {
        showToast(`Updated student record for ${String(payload.fullName || 'student')}.`);
      }
      return null;
    }

    const res = await addStudentAsync({
      ...(payload as Omit<Student, 'id' | 'systemId'>),
      password: passwordPin.trim(),
    });
    if (!res.ok || !res.student) {
      return res.error || 'Failed to enroll student.';
    }
    setFormMode('list');
    setEditingStudentId(null);
    setQueryNonce((n) => n + 1);
    setCredentialSlips([
      {
        studentId: res.student.systemId,
        name: res.student.fullName,
        className: res.student.className,
        sectionName: res.student.sectionName,
        roll: res.student.rollNumber,
        plainPin: passwordPin.trim(),
      },
    ]);
    showToast(`Enrolled ${res.student.fullName} (${res.student.systemId}) into ${res.student.className}.`);
    return null;
  };

  const handleDownloadCsvTemplate = async () => {
    setDownloadingTemplate(true);
    try {
      const res = await fetch('/api/students/csv-template', {
        credentials: 'include',
        headers: {
          'x-requested-with': 'erp-client',
        },
      });
      if (!res.ok) {
        throw new Error(`Server returned status ${res.status}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'student_import_template.csv';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast('Downloaded dynamic CSV template synced with active fields.');
    } catch {
      // Client-side fallback respecting active StudentFieldConfig
      const effective = getEffectiveStudentSchema(instituteRules);
      const headers: string[] = [];
      const sampleRow: string[] = [];

      const prefix = (instituteRules.studentIdPrefix || 'AG').trim().toUpperCase() || 'AG';
      const currentYear = instituteRules.activeAcademicYear || new Date().getFullYear();

      for (const meta of STUDENT_SCHEMA_FIELDS) {
        const req = getFieldRequirement(effective, meta.key);
        if (req === 'hidden') continue;
        headers.push(req === 'required' ? `${meta.csvHeader}*` : meta.csvHeader);

        if (meta.key === 'rollNumber') sampleRow.push('1');
        else if (meta.key === 'fullName') sampleRow.push('Farhan Sadik');
        else if (meta.key === 'banglaName') sampleRow.push('ফারহান সাদিক');
        else if (meta.key === 'gender') sampleRow.push('Male');
        else if (meta.key === 'religionGroup') sampleRow.push('Islam');
        else if (meta.key === 'dateOfBirth') sampleRow.push('15/03/2010');
        else if (meta.key === 'birthRegOrNid') sampleRow.push('20101234567890123');
        else if (meta.key === 'bloodGroup') sampleRow.push('B+');
        else if (meta.key === 'className') sampleRow.push(defaultClassName);
        else if (meta.key === 'sectionName') sampleRow.push(defaultSectionName);
        else if (meta.key === 'group') sampleRow.push('Science');
        else if (meta.key === 'shift') sampleRow.push('Morning');
        else if (meta.key === 'registrationNumber') sampleRow.push('2110823401');
        else if (meta.key === 'systemId') sampleRow.push(formatStudentSystemId(prefix, currentYear, 1));
        else if (meta.key === 'password') sampleRow.push('654321');
        else if (meta.key === 'phone') sampleRow.push('01712345678');
        else if (meta.key === 'fatherName') sampleRow.push('Md. Jahangir Alam');
        else if (meta.key === 'fatherBanglaName') sampleRow.push('মো: জাহাঙ্গীর আলম');
        else if (meta.key === 'fatherPhone') sampleRow.push('01812345678');
        else if (meta.key === 'fatherNid') sampleRow.push('19821234567890123');
        else if (meta.key === 'fatherOccupation') sampleRow.push('Government Service');
        else if (meta.key === 'motherName') sampleRow.push('Shahnaz Begum');
        else if (meta.key === 'motherBanglaName') sampleRow.push('শাহনাজ বেগম');
        else if (meta.key === 'motherPhone') sampleRow.push('01912345678');
        else if (meta.key === 'motherNid') sampleRow.push('19851234567890123');
        else if (meta.key === 'motherOccupation') sampleRow.push('Homemaker');
        else if (meta.key === 'guardianInfo') sampleRow.push('Md. Rafiqul Islam (Uncle, 01722334455)');
        else if (meta.key === 'presentAddress') sampleRow.push('House 12, Road 4, Sector 3, Uttara, Dhaka-1230');
        else if (meta.key === 'permanentAddress') sampleRow.push('Village: Rampur, Post: Chandpur-3600, Sadar, Chandpur');
        else sampleRow.push('');
      }

      const csvContent = '\uFEFF' + [headers.join(','), sampleRow.map((v) => (v.includes(',') ? `"${v}"` : v)).join(',')].join('\r\n') + '\r\n';
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'student_import_template.csv';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast('Downloaded dynamic CSV template.');
    } finally {
      setDownloadingTemplate(false);
    }
  };

  const handleBulkCsvUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setValidatingCsv(true);
    const reader = new FileReader();
    reader.onload = async () => {
      const text = String(reader.result || '');
      try {
        const res = await fetch('/api/students/bulk-import', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-requested-with': 'erp-client',
          },
          credentials: 'include',
          body: JSON.stringify({ action: 'validate', csvText: text }),
        });

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'Dry-run validation failed');
        }

        setImportReviewData({
          fileName: file.name,
          csvText: text,
          totalRows: data.totalRows,
          validRowsCount: data.validRowsCount,
          errorCount: data.errorCount,
          errors: data.errors,
          preview: data.preview,
        });
      } catch (err) {
        showToast(err instanceof Error ? err.message : 'Could not validate CSV file.');
      } finally {
        setValidatingCsv(false);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleCommitBulkImport = async (commitValidOnly: boolean) => {
    if (!importReviewData) return;
    setIsCommittingImport(true);
    try {
      const res = await fetch('/api/students/bulk-import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-requested-with': 'erp-client',
        },
        credentials: 'include',
        body: JSON.stringify({
          action: 'commit',
          csvText: importReviewData.csvText,
          commitValidOnly,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Commit failed');
      }

      setImportReviewData(null);
      if (Array.isArray(data.credentials) && data.credentials.length > 0) {
        setCredentialSlips(data.credentials);
      }
      refreshFromServer();
      setQueryNonce((n) => n + 1);
      showToast(`Successfully enrolled ${data.committedCount} student(s) with bcrypt hashed PINs.`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to commit students.');
    } finally {
      setIsCommittingImport(false);
    }
  };

  const handleConfirmGraduate = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedIds.length === 0) return;
    graduateStudents(selectedIds, gradYear, gradWing);
    setQueriedStudents((prev) => prev.filter((s) => !selectedIds.includes(s.id)));
    showToast(
      `Archived ${selectedIds.length} student(s) as ${gradWing} Batch ${gradYear} Alumni.`
    );
    setSelectedIds([]);
    setShowGraduateModal(false);
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === filteredStudents.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredStudents.map((s) => s.id));
    }
  };

  // --- FULL-PAGE STUDENT ENROLLMENT / EDIT FORM ---
  if (formMode === 'add' || formMode === 'edit') {
    const editingStudent =
      formMode === 'edit' && editingStudentId
        ? students.find((s) => s.id === editingStudentId) || null
        : null;

    return (
      <>
        <StudentFormView
          key={editingStudent?.id || 'add-student'}
          mode={formMode}
          initialStudent={editingStudent}
          academicClasses={effectiveClasses}
          subjects={subjects}
          instituteRules={instituteRules}
          existingStudents={students}
          onSave={handleSaveStudentForm}
          onCancel={() => {
            setFormMode('list');
            setEditingStudentId(null);
          }}
        />
        {credentialSlips && (
          <BulkCredentialSlipModal
            schoolName={cmsConfig.schoolName}
            credentials={credentialSlips}
            onClose={() => {
              setCredentialSlips(null);
              refreshFromServer();
            }}
          />
        )}
      </>
    );
  }

  return (
    <>
    <div className={`flex flex-col w-full space-y-6 ${printAdmissionStudent ? 'no-print' : ''}`}>
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 no-print">
        <div>
          <span className="font-label-sm text-label-sm uppercase tracking-wider text-primary-container font-semibold">
            Institutional Student Information System (SIS)
          </span>
          <h1 className="font-headline-lg text-headline-lg text-on-surface tracking-tight font-bold">
            Student Register, Alumni Archive &amp; Update Approvals
          </h1>
          <p className="font-body-md text-body-md text-on-surface-variant mt-0.5">
            Full-page student enrollment, class promotion, alumni batch archiving, bulk CSV operations, and field-level portal update approvals.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={academicClasses.length === 0}
            onClick={openAddForm}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary-container hover:bg-primary disabled:opacity-50 text-on-primary font-bold text-xs shadow-sm transition-all cursor-pointer"
          >
            <span className="material-symbols-outlined text-[18px]">person_add</span>
            Enroll Student
          </button>
          {selectedIds.length > 0 && registerView === 'active' && (
            <>
              <button
                type="button"
                onClick={() => setShowPromoteModal(true)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-secondary text-on-secondary font-bold text-xs shadow-sm cursor-pointer"
              >
                <span className="material-symbols-outlined text-[16px]">upgrade</span>
                Promote Selected Students ({selectedIds.length})
              </button>
              <button
                type="button"
                onClick={() => {
                  const firstSelected = students.find((s) => selectedIds.includes(s.id));
                  if (firstSelected && isCollegeClassName(firstSelected.className)) {
                    setGradWing('HSC');
                  } else if (showSchool) {
                    setGradWing('SSC');
                  } else if (showCollege) {
                    setGradWing('HSC');
                  }
                  setShowGraduateModal(true);
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-surface-container-high text-on-surface border border-outline-variant/30 font-bold text-xs cursor-pointer"
              >
                <span className="material-symbols-outlined text-[16px]">school</span>
                Archive as Alumni ({selectedIds.length})
              </button>
            </>
          )}
          {selectedIds.length === 0 && filteredStudents.length > 0 && registerView === 'active' && (
            <button
              type="button"
              onClick={() => {
                setSelectedIds(filteredStudents.map((s) => s.id));
                setShowPromoteModal(true);
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-secondary/15 hover:bg-secondary/25 text-secondary border border-secondary/30 font-bold text-xs cursor-pointer transition-all"
              title="Select all students in this cohort and launch the Result-Based Promotion Engine"
            >
              <span className="material-symbols-outlined text-[16px]">upgrade</span>
              Promote Cohort ({filteredStudents.length})
            </button>
          )}
        </div>
      </div>

      {/* View Switcher: Active Students | Archived Batches & Alumni | Pending Approvals */}
      <div className="flex flex-wrap items-center gap-1 p-1 rounded-2xl bg-surface-container-low border border-outline-variant/25 w-fit no-print">
        <button
          type="button"
          onClick={() => {
            setRegisterView('active');
            setSelectedIds([]);
          }}
          className={`px-3.5 py-2 rounded-xl text-xs font-semibold cursor-pointer tabular-nums ${
            registerView === 'active'
              ? 'bg-primary-container text-on-primary shadow-2xs'
              : 'text-on-surface-variant hover:text-on-surface'
          }`}
        >
          Active Register ({activeStudents.length})
        </button>
        <button
          type="button"
          onClick={() => {
            setRegisterView('alumni');
            setSelectedIds([]);
          }}
          className={`px-3.5 py-2 rounded-xl text-xs font-semibold cursor-pointer tabular-nums ${
            registerView === 'alumni'
              ? 'bg-primary-container text-on-primary shadow-2xs'
              : 'text-on-surface-variant hover:text-on-surface'
          }`}
        >
          Archived Batches &amp; Alumni ({alumniStudents.length})
        </button>
        <button
          type="button"
          onClick={() => {
            setRegisterView('approvals');
            setSelectedIds([]);
          }}
          className={`px-3.5 py-2 rounded-xl text-xs font-semibold cursor-pointer inline-flex items-center gap-1.5 tabular-nums ${
            registerView === 'approvals'
              ? 'bg-primary-container text-on-primary shadow-2xs'
              : 'text-on-surface-variant hover:text-on-surface'
          }`}
        >
          <span>Pending Profile Approvals</span>
          <span
            className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold ${
              (pendingApprovalsBadgeCount ?? pendingApprovals.length) > 0
                ? 'bg-amber-200 text-amber-950'
                : 'bg-surface-container text-on-surface-variant'
            }`}
          >
            {pendingApprovalsBadgeCount ?? pendingApprovals.length}
          </span>
        </button>
      </div>

      {academicClasses.length === 0 && (
        <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs font-semibold flex items-center gap-2">
          <span className="material-symbols-outlined text-[20px]">warning</span>
          <span>
            No classes defined yet. Create at least one Class in Institute Setup before enrolling students.
          </span>
        </div>
      )}

      {feedback && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-semibold flex items-center gap-2 no-print">
          <span className="material-symbols-outlined text-[18px]">check_circle</span>
          <span>{feedback}</span>
        </div>
      )}

      {/* VIEW 3: PENDING PROFILE APPROVALS QUEUE */}
      {registerView === 'approvals' ? (
        <div className="space-y-4">
          {pendingApprovals.length === 0 ? (
            <div className="rounded-2xl bg-surface-container-lowest border border-outline-variant/25 p-10 text-center space-y-2">
              <span className="material-symbols-outlined text-[32px] text-emerald-700">task_alt</span>
              <div className="text-sm font-bold text-on-surface">No Pending Profile Update Requests</div>
              <p className="text-xs text-on-surface-variant">
                Requests submitted by students from the Student Portal will appear here for field-by-field verification and approval.
              </p>
            </div>
          ) : (
            pendingApprovals.map((stu) => {
              const req = stu.updateRequest || {};
              const changedKeys = (Object.keys(req) as Array<keyof Student>).filter((k) => {
                const newVal = req[k];
                const oldVal = stu[k];
                return newVal !== undefined && String(newVal) !== String(oldVal ?? '');
              });
              const checkedKeys =
                selectedApprovalFields[stu.id] || changedKeys;

              return (
                <div
                  key={stu.id}
                  className="rounded-2xl bg-surface-container-lowest border border-outline-variant/25 p-6 space-y-4 text-xs"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-outline-variant/15 pb-3">
                    <div className="flex items-center gap-3">
                      {stu.avatarUrl ? (
                        <img
                          src={stu.avatarUrl}
                          alt={stu.fullName}
                          referrerPolicy="no-referrer"
                          className="w-11 h-11 rounded-xl object-cover border border-outline-variant/30 shrink-0"
                        />
                      ) : (
                        <div className="w-11 h-11 rounded-xl bg-primary-fixed/50 text-primary-container font-bold text-xs flex items-center justify-center border border-outline-variant/30 shrink-0">
                          {stu.fullName.slice(0, 2).toUpperCase()}
                        </div>
                      )}
                      <div>
                        <h3 className="text-sm font-bold text-on-surface">{stu.fullName}</h3>
                        <div className="text-[11px] font-mono text-on-surface-variant tabular-nums">
                          {stu.systemId} &bull; Roll #{stu.rollNumber} &bull; {stu.className} (
                          {formatGroupSectionDisplay(stu.group, stu.sectionName)})
                        </div>
                      </div>
                    </div>
                    <span className="px-2.5 py-1 rounded-lg bg-amber-100 text-amber-900 font-bold text-[11px] w-fit">
                      Pending Admin Verification ({changedKeys.length} changed fields)
                    </span>
                  </div>

                  {changedKeys.length === 0 ? (
                    <p className="text-on-surface-variant italic">No differing fields found in request.</p>
                  ) : (
                    <div className="overflow-x-auto rounded-xl border border-outline-variant/20">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-surface-container-low text-on-surface-variant border-b border-outline-variant/20">
                            <th className="py-2 px-3 w-10">Apply</th>
                            <th className="py-2 px-3 font-semibold">Field</th>
                            <th className="py-2 px-3 font-semibold">Current Value on Register</th>
                            <th className="py-2 px-3 font-semibold">Requested New Value</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-outline-variant/15">
                          {changedKeys.map((key) => {
                            const isChecked = checkedKeys.includes(key);
                            const oldVal = stu[key] ? String(stu[key]) : '—';
                            const newVal = req[key] ? String(req[key]) : '—';
                            return (
                              <tr key={String(key)}>
                                <td className="py-2.5 px-3">
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={(e) => {
                                      const next = e.target.checked
                                        ? Array.from(new Set([...checkedKeys, key]))
                                        : checkedKeys.filter((k) => k !== key);
                                      setSelectedApprovalFields({
                                        ...selectedApprovalFields,
                                        [stu.id]: next,
                                      });
                                    }}
                                  />
                                </td>
                                <td className="py-2.5 px-3 font-semibold text-on-surface">
                                  {REQUEST_FIELD_LABELS[String(key)] || String(key)}
                                </td>
                                <td className="py-2.5 px-3 text-on-surface-variant">
                                  {key === 'avatarUrl' && stu.avatarUrl ? (
                                    <img
                                      src={stu.avatarUrl}
                                      alt="Current"
                                      referrerPolicy="no-referrer"
                                      className="w-10 h-10 rounded-lg object-cover border border-outline-variant/25"
                                    />
                                  ) : (
                                    <span className="font-mono">{oldVal}</span>
                                  )}
                                </td>
                                <td className="py-2.5 px-3 font-semibold text-primary-container">
                                  {key === 'avatarUrl' && req.avatarUrl ? (
                                    <img
                                      src={String(req.avatarUrl)}
                                      alt="Requested"
                                      referrerPolicy="no-referrer"
                                      className="w-10 h-10 rounded-lg object-cover border-2 border-primary-container"
                                    />
                                  ) : (
                                    <span className="font-mono">{newVal}</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}

                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pt-2">
                    <div className="flex-1 flex items-center gap-2">
                      <input
                        type="text"
                        placeholder="Optional rejection reason (shown to student)..."
                        value={rejectionReasons[stu.id] || ''}
                        onChange={(e) =>
                          setRejectionReasons({ ...rejectionReasons, [stu.id]: e.target.value })
                        }
                        className="flex-1 px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 text-xs"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          rejectStudentUpdate(stu.id, rejectionReasons[stu.id]);
                          showToast(`Rejected profile update request for ${stu.fullName}.`);
                        }}
                        className="px-3.5 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold cursor-pointer shrink-0"
                      >
                        Reject Request
                      </button>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {checkedKeys.length > 0 && checkedKeys.length < changedKeys.length && (
                        <button
                          type="button"
                          onClick={() => {
                            approveStudentUpdate(stu.id, checkedKeys);
                            showToast(
                              `Approved ${checkedKeys.length} selected field(s) for ${stu.fullName}.`
                            );
                          }}
                          className="px-4 py-2 rounded-xl bg-secondary text-on-secondary font-bold cursor-pointer"
                        >
                          Approve Selected ({checkedKeys.length})
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          approveStudentUpdate(stu.id);
                          showToast(`Approved all profile updates for ${stu.fullName}.`);
                        }}
                        className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold cursor-pointer"
                      >
                        Approve All &amp; Update Register
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      ) : (
        <>
          {/* Bulk CSV Import & Multi-Format Export Toolbar */}
          <div className="rounded-2xl bg-surface-container-lowest border border-outline-variant/25 p-4 flex flex-wrap items-center justify-between gap-3 no-print">
            {registerView === 'active' ? (
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="font-bold text-on-surface-variant mr-1">Bulk Operations:</span>
                <button
                  type="button"
                  onClick={handleDownloadCsvTemplate}
                  disabled={downloadingTemplate}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-surface-container-low hover:bg-surface-container border border-outline-variant/30 font-semibold cursor-pointer disabled:opacity-50"
                  title="Download CSV template synced with active mandatory fields (*)"
                >
                  <span className="material-symbols-outlined text-[16px]">download</span>
                  {downloadingTemplate ? 'Generating...' : 'CSV Template'}
                </button>
                <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-secondary/10 text-secondary hover:bg-secondary/20 border border-secondary/20 font-bold cursor-pointer disabled:opacity-50">
                  <span className="material-symbols-outlined text-[16px]">
                    {validatingCsv ? 'hourglass_top' : 'upload_file'}
                  </span>
                  {validatingCsv ? 'Validating CSV...' : 'Bulk Import CSV'}
                  <input
                    type="file"
                    accept=".csv"
                    onChange={handleBulkCsvUpload}
                    disabled={validatingCsv}
                    className="hidden"
                  />
                </label>
              </div>
            ) : (
              <div className="text-xs font-semibold text-on-surface-variant">
                Historical alumni records retain all examination marksheets and transcript verification IDs.
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-bold text-on-surface-variant mr-1">Export Register:</span>
              <button
                type="button"
                disabled={filteredStudents.length === 0}
                onClick={() => setShowExportModal(true)}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-primary hover:bg-primary/90 disabled:opacity-45 disabled:cursor-not-allowed text-on-primary font-bold cursor-pointer shadow-sm"
                title={
                  filteredStudents.length === 0
                    ? 'Query a class cohort first to export students'
                    : 'Export currently queried students'
                }
              >
                <span className="material-symbols-outlined text-[16px]">download</span>
                Split Export Register ({filteredStudents.length})
              </button>
            </div>
          </div>

          {/* Query-First Cascading Filter & Quick Search Bar */}
          {registerView === 'active' ? (
            <div className="rounded-2xl bg-surface-container-lowest border border-outline-variant/25 p-4 space-y-3.5 no-print">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                {/* Student Management Instant Quick Search (Name, Mobile, Student ID) */}
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void runQuickSearch(quickSearchInput);
                  }}
                  className="flex items-center gap-2 w-full lg:w-[430px]"
                >
                  <div className="relative flex-1">
                    <Search className="w-4 h-4 absolute left-3 top-2.5 text-on-surface-variant" />
                    <input
                      type="text"
                      placeholder="Find student by Name, Mobile, or Student ID..."
                      value={quickSearchInput}
                      onChange={(e) => {
                        const val = e.target.value;
                        setQuickSearchInput(val);
                        if (!val.trim() && activeQuickQuery) {
                          setActiveQuickQuery('');
                          setQueriedStudents([]);
                          setDirectoryError(null);
                        }
                      }}
                      className="w-full pl-9 pr-8 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 text-xs text-on-surface focus:outline-none focus:border-primary-container"
                    />
                    {(quickSearchInput || activeQuickQuery) && (
                      <button
                        type="button"
                        onClick={() => {
                          setQuickSearchInput('');
                          setActiveQuickQuery('');
                          setQueriedStudents([]);
                          setDirectoryError(null);
                        }}
                        className="absolute right-2.5 top-2 text-on-surface-variant hover:text-on-surface cursor-pointer"
                        title="Clear quick search"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  <button
                    type="submit"
                    disabled={!quickSearchInput.trim() || loadingDirectory}
                    className="px-3.5 py-2 rounded-xl bg-secondary hover:bg-secondary/90 disabled:opacity-45 text-on-secondary text-xs font-bold cursor-pointer shrink-0 whitespace-nowrap"
                  >
                    Find Student
                  </button>
                </form>

                {/* Loaded Cohort Narrowing: Text + Religion + Gender + Refresh */}
                <div className="flex items-center gap-2 flex-wrap text-xs">
                  {hasLoadedActiveDirectory && (
                    <>
                      <input
                        type="text"
                        placeholder="Filter loaded rows..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-40 px-3 py-1.5 rounded-xl bg-surface-container-low border border-outline-variant/30 text-xs"
                      />
                      <select
                        aria-label="Filter by Religion"
                        value={filterReligion}
                        onChange={(e) => setFilterReligion(e.target.value)}
                        className="px-2.5 py-1.5 rounded-xl bg-surface-container-low border border-outline-variant/30 text-xs font-medium"
                      >
                        <option value="all">All Religions</option>
                        <option value="Islam">Islam</option>
                        <option value="Hinduism">Hinduism</option>
                        <option value="Christianity">Christianity</option>
                        <option value="Buddhism">Buddhism</option>
                        <option value="Other">Other</option>
                      </select>
                      <select
                        aria-label="Filter by Gender"
                        value={filterGender}
                        onChange={(e) => setFilterGender(e.target.value)}
                        className="px-2.5 py-1.5 rounded-xl bg-surface-container-low border border-outline-variant/30 text-xs font-medium"
                      >
                        <option value="all">All Genders</option>
                        <option value="Male">Male</option>
                        <option value="Female">Female</option>
                        <option value="Other">Other</option>
                      </select>
                      <button
                        type="button"
                        onClick={() => {
                          if (activeQuickQuery) {
                            void runQuickSearch(activeQuickQuery);
                          } else {
                            setQueryNonce((n) => n + 1);
                          }
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-surface-container-low hover:bg-surface-container border border-outline-variant/30 font-semibold cursor-pointer"
                        title="Refresh directory query"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${loadingDirectory ? 'animate-spin' : ''}`} />
                        Refresh
                      </button>
                    </>
                  )}
                  {(filterSession || filterClass || activeQuickQuery) && (
                    <button
                      type="button"
                      onClick={handleResetDirectoryQuery}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-surface-container-low hover:bg-surface-container text-on-surface-variant border border-outline-variant/30 font-semibold cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      Reset
                    </button>
                  )}
                  <span className="text-on-surface-variant font-mono tabular-nums font-semibold px-2">
                    {hasLoadedActiveDirectory
                      ? `${filteredStudents.length} shown`
                      : `0 shown (${activeStudents.length} total)`}
                  </span>
                </div>
              </div>

              {/* Cascading 1. Session/Year -> 2. Class -> 3. Group -> 4. Section -> 5. Shift */}
              <div className="pt-2.5 border-t border-outline-variant/15 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 text-xs">
                {/* 1. Session / Academic Year */}
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-on-surface-variant mb-1">
                    1. Session / Year *
                  </label>
                  <select
                    value={filterSession}
                    onChange={(e) => handleSessionFilterChange(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 text-xs font-semibold"
                  >
                    <option value="">-- Select Session / Year --</option>
                    {sessionOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* 2. Class */}
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-on-surface-variant mb-1">
                    2. Class *
                  </label>
                  {!filterSession ? (
                    <div className="px-3 py-2 rounded-xl bg-surface-container-low/60 border border-outline-variant/20 text-on-surface-variant/70">
                      Select Session / Year first
                    </div>
                  ) : (
                    <select
                      value={filterClass}
                      onChange={(e) => handleClassFilterChange(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 text-xs font-semibold"
                    >
                      <option value="">-- Select Class --</option>
                      {sessionFilteredClasses.map((c) => (
                        <option key={c.id} value={c.name}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                {/* 3. Group (Conditional on class.hasGroups) */}
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-on-surface-variant mb-1">
                    3. Group {filterClass && classHasGroups ? '*' : ''}
                  </label>
                  {!filterClass ? (
                    <div className="px-3 py-2 rounded-xl bg-surface-container-low/60 border border-outline-variant/20 text-on-surface-variant/70">
                      Select Class first
                    </div>
                  ) : classHasGroups ? (
                    <select
                      value={filterGroup}
                      onChange={(e) => handleGroupFilterChange(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 text-xs font-semibold"
                    >
                      <option value="">-- Select Group --</option>
                      {availableGroups.map((g) => (
                        <option key={g} value={g}>
                          {g}
                        </option>
                      ))}
                      <option value="all">All Groups</option>
                    </select>
                  ) : (
                    <div className="px-3 py-2 rounded-xl bg-secondary-fixed/40 border border-outline-variant/25 font-semibold text-on-secondary-container">
                      General (Default)
                    </div>
                  )}
                </div>

                {/* 4. Section (Conditional on class.hasSections) */}
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-on-surface-variant mb-1">
                    4. Section {filterClass && classHasSections ? '*' : ''}
                  </label>
                  {!filterClass ? (
                    <div className="px-3 py-2 rounded-xl bg-surface-container-low/60 border border-outline-variant/20 text-on-surface-variant/70">
                      Select Class first
                    </div>
                  ) : classHasGroups && !filterGroup ? (
                    <div className="px-3 py-2 rounded-xl bg-surface-container-low/60 border border-outline-variant/20 text-on-surface-variant/70">
                      Select Group first
                    </div>
                  ) : classHasSections ? (
                    <select
                      value={filterSection}
                      onChange={(e) => {
                        setActiveQuickQuery('');
                        setSelectedIds([]);
                        setFilterSection(e.target.value);
                      }}
                      className="w-full px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 text-xs font-semibold"
                    >
                      <option value="">-- Select Section --</option>
                      {availableSections.map((sec) => (
                        <option key={sec} value={sec}>
                          {sec === 'Common' ? 'Combined' : `Section ${sec}`}
                        </option>
                      ))}
                      <option value="all">All Sections</option>
                    </select>
                  ) : (
                    <div className="px-3 py-2 rounded-xl bg-secondary-fixed/40 border border-outline-variant/25 font-semibold text-on-secondary-container">
                      Combined (No Sections)
                    </div>
                  )}
                </div>

                {/* 5. Shift (Auto-selected if 1 active shift) */}
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-on-surface-variant mb-1">
                    5. Shift {filterClass && hasMultipleShifts ? '*' : ''}
                  </label>
                  {!filterClass ? (
                    <div className="px-3 py-2 rounded-xl bg-surface-container-low/60 border border-outline-variant/20 text-on-surface-variant/70">
                      Select Class first
                    </div>
                  ) : hasMultipleShifts ? (
                    <select
                      value={filterShift}
                      onChange={(e) => {
                        setActiveQuickQuery('');
                        setSelectedIds([]);
                        setFilterShift(e.target.value);
                      }}
                      className="w-full px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 text-xs font-semibold"
                    >
                      <option value="">-- Select Shift --</option>
                      {activeShifts.map((sh) => (
                        <option key={sh} value={sh}>
                          {sh} Shift
                        </option>
                      ))}
                      <option value="all">All Shifts</option>
                    </select>
                  ) : (
                    <div className="px-3 py-2 rounded-xl bg-secondary-fixed/40 border border-outline-variant/25 font-semibold text-on-secondary-container">
                      {activeShifts[0] || 'Morning'} Shift (Auto)
                    </div>
                  )}
                </div>
              </div>

              {activeQuickQuery && (
                <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-secondary-fixed/40 border border-secondary/20 text-xs">
                  <span className="font-semibold text-on-surface">
                    Showing school-wide search results for{' '}
                    <span className="font-mono font-bold">&ldquo;{activeQuickQuery}&rdquo;</span> (
                    {filteredStudents.length} found)
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setQuickSearchInput('');
                      setActiveQuickQuery('');
                      setQueriedStudents([]);
                    }}
                    className="text-primary-container font-bold hover:underline cursor-pointer"
                  >
                    Exit Search
                  </button>
                </div>
              )}

              {directoryError && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-error-container/20 border border-error/30 text-error text-xs font-semibold">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{directoryError}</span>
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-2xl bg-surface-container-lowest border border-outline-variant/25 p-4 flex flex-col md:flex-row items-center justify-between gap-4 no-print">
              <div className="relative w-full md:w-72">
                <Search className="w-4 h-4 absolute left-3.5 top-2.5 text-on-surface-variant" />
                <input
                  type="text"
                  placeholder="Search alumni name, roll, or ID..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 text-xs text-on-surface focus:outline-none"
                />
              </div>

              <div className="flex items-center gap-3 w-full md:w-auto flex-wrap text-xs">
                <select
                  value={filterGradYear}
                  onChange={(e) => setFilterGradYear(e.target.value)}
                  className="px-3 py-1.5 rounded-xl bg-surface-container-low border border-outline-variant/30 text-xs font-semibold"
                >
                  <option value="all">All Passing Years</option>
                  {gradYearOptions.map((yr) => (
                    <option key={yr} value={yr}>
                      Passing Year {yr}
                    </option>
                  ))}
                </select>

                <select
                  value={filterGroup || 'all'}
                  onChange={(e) => setFilterGroup(e.target.value)}
                  className="px-3 py-1.5 rounded-xl bg-surface-container-low border border-outline-variant/30 text-xs"
                >
                  <option value="all">All Groups</option>
                  <option value="Science">Science</option>
                  <option value="Humanities">Humanities</option>
                  <option value="Business Studies">Business Studies</option>
                  <option value="General">General</option>
                </select>

                <span className="text-on-surface-variant font-mono tabular-nums">
                  {filteredStudents.length} alumni
                </span>
              </div>
            </div>
          )}

          {/* Students Table or Query-First Prompt */}
          {registerView === 'active' && !hasLoadedActiveDirectory ? (
            <div className="rounded-2xl bg-surface-container-lowest border border-dashed border-outline-variant/40 p-10 text-center space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-primary-fixed/50 text-primary-container flex items-center justify-center mx-auto">
                <Filter className="w-6 h-6" />
              </div>
              <div className="space-y-1 max-w-lg mx-auto">
                <h3 className="text-base font-bold text-on-surface">
                  {!filterSession
                    ? 'Select Session / Year, Class, Group & Section to Load Student Directory'
                    : !filterClass
                      ? `Select Class for ${filterSession}`
                      : classHasGroups && !filterGroup
                        ? `Select Group for ${filterClass}`
                        : classHasSections && !filterSection
                          ? `Select Section for ${filterClass}${
                              classHasGroups ? ` (${filterGroup})` : ''
                            }`
                          : `Select Shift for ${filterClass}`}
                </h3>
                <p className="text-xs text-on-surface-variant">
                  Start by choosing the Institute Session / Year (School or College), then Class, Group, and Section—or use Find Student above to locate any student immediately by Name, Mobile, or Student ID.
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-2 text-[11px] font-semibold">
                <span
                  className={`inline-flex items-center gap-1 px-3 py-1 rounded-lg border ${
                    filterSession
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                      : 'bg-surface-container-low text-on-surface-variant border-outline-variant/30'
                  }`}
                >
                  {filterSession && <CheckCircle2 className="w-3.5 h-3.5" />}
                  1. Session / Year {filterSession ? `(${filterSession})` : ''}
                </span>
                <span
                  className={`inline-flex items-center gap-1 px-3 py-1 rounded-lg border ${
                    filterClass
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                      : 'bg-surface-container-low text-on-surface-variant border-outline-variant/30'
                  }`}
                >
                  {filterClass && <CheckCircle2 className="w-3.5 h-3.5" />}
                  2. Class {filterClass ? `(${filterClass})` : ''}
                </span>
                {(!filterClass || classHasGroups) && (
                  <span
                    className={`inline-flex items-center gap-1 px-3 py-1 rounded-lg border ${
                      filterClass && filterGroup
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                        : 'bg-surface-container-low text-on-surface-variant border-outline-variant/30'
                    }`}
                  >
                    {filterClass && filterGroup && <CheckCircle2 className="w-3.5 h-3.5" />}
                    3. Group {filterGroup ? `(${filterGroup})` : ''}
                  </span>
                )}
                {(!filterClass || classHasSections) && (
                  <span
                    className={`inline-flex items-center gap-1 px-3 py-1 rounded-lg border ${
                      filterClass && filterSection
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                        : 'bg-surface-container-low text-on-surface-variant border-outline-variant/30'
                    }`}
                  >
                    {filterClass && filterSection && <CheckCircle2 className="w-3.5 h-3.5" />}
                    4. Section {filterSection ? `(${filterSection})` : ''}
                  </span>
                )}
                {filterClass && hasMultipleShifts && (
                  <span
                    className={`inline-flex items-center gap-1 px-3 py-1 rounded-lg border ${
                      filterShift
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                        : 'bg-surface-container-low text-on-surface-variant border-outline-variant/30'
                    }`}
                  >
                    {filterShift && <CheckCircle2 className="w-3.5 h-3.5" />}
                    5. Shift {filterShift ? `(${filterShift})` : ''}
                  </span>
                )}
              </div>
            </div>
          ) : (
            <div className="rounded-2xl bg-surface-container-lowest border border-outline-variant/25 overflow-hidden">
              <div className="overflow-x-auto w-full">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-surface-container-low/70 text-on-surface-variant text-[11px] border-b border-outline-variant/20 whitespace-nowrap">
                      {registerView === 'active' && (
                        <th className="py-3 px-3 no-print w-9">
                          <input
                            type="checkbox"
                            checked={
                              filteredStudents.length > 0 &&
                              selectedIds.length === filteredStudents.length
                            }
                            onChange={toggleSelectAll}
                          />
                        </th>
                      )}
                      <th className="py-3 px-3 font-semibold">Student ID</th>
                      <th className="py-3 px-3 font-semibold">Password (PIN)</th>
                      <th className="py-3 px-3 font-semibold">Roll No.</th>
                      <th className="py-3 px-3 font-semibold">Name</th>
                      <th className="py-3 px-3 font-semibold">Class</th>
                      <th className="py-3 px-3 font-semibold">Section</th>
                      <th className="py-3 px-3 font-semibold">Group</th>
                      <th className="py-3 px-3 font-semibold">Gender</th>
                      <th className="py-3 px-3 font-semibold">Father Name</th>
                      <th className="py-3 px-3 font-semibold">Mobile Number</th>
                      <th className="py-3 px-3 font-semibold text-right no-print">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant/10 text-on-surface text-xs">
                    {loadingDirectory ? (
                      <tr>
                        <td
                          colSpan={registerView === 'active' ? 12 : 11}
                          className="p-10 text-center text-on-surface-variant"
                        >
                          <div className="inline-flex items-center gap-2 font-semibold">
                            <Loader2 className="w-4 h-4 animate-spin text-primary-container" />
                            <span>Querying student directory...</span>
                          </div>
                        </td>
                      </tr>
                    ) : filteredStudents.length === 0 ? (
                      <tr>
                        <td
                          colSpan={registerView === 'active' ? 12 : 11}
                          className="p-8 text-center text-on-surface-variant"
                        >
                          <div className="inline-flex flex-col items-center gap-1.5">
                            <Users className="w-5 h-5 text-on-surface-variant/60" />
                            <span>
                              {registerView === 'alumni'
                                ? 'No archived alumni batches yet. Select graduating students from Active Register and click "Archive as Alumni".'
                                : activeQuickQuery
                                  ? `No students matched "${activeQuickQuery}".`
                                  : 'No students found matching the selected Session, Class, Group, Section, Religion & Gender.'}
                            </span>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      filteredStudents.map((s) => (
                        <tr key={s.id} className="hover:bg-surface-container-low/40 transition-colors">
                          {registerView === 'active' && (
                            <td className="py-2.5 px-3 no-print">
                              <input
                                type="checkbox"
                                checked={selectedIds.includes(s.id)}
                                onChange={(e) => {
                                  if (e.target.checked) setSelectedIds([...selectedIds, s.id]);
                                  else setSelectedIds(selectedIds.filter((id) => id !== s.id));
                                }}
                              />
                            </td>
                          )}
                          <td className="py-2.5 px-3 font-mono font-bold tabular-nums whitespace-nowrap text-on-surface">
                            {s.systemId}
                          </td>
                          <td className="py-2.5 px-3 font-mono tabular-nums whitespace-nowrap">
                            {s.systemPin ? (
                              <div className="inline-flex items-center gap-1.5">
                                <span className="font-bold tracking-wider text-primary-container">
                                  {s.systemPin}
                                </span>
                                <button
                                  type="button"
                                  title="Copy 6-digit PIN"
                                  onClick={() => {
                                    void navigator.clipboard?.writeText(s.systemPin || '');
                                    setCopiedPinId(s.id);
                                    setTimeout(() => setCopiedPinId(null), 1500);
                                  }}
                                  className="p-1 rounded hover:bg-surface-container text-on-surface-variant cursor-pointer"
                                >
                                  {copiedPinId === s.id ? (
                                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                                  ) : (
                                    <Copy className="w-3.5 h-3.5" />
                                  )}
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                disabled={generatingPinForId === s.id}
                                onClick={async () => {
                                  const nextPin = generateSixDigitPin();
                                  setGeneratingPinForId(s.id);
                                  try {
                                    const res = await updateStudentAsync(s.id, { password: nextPin });
                                    if (res.ok) {
                                      setQueriedStudents((prev) =>
                                        prev.map((item) =>
                                          item.id === s.id ? { ...item, systemPin: nextPin } : item
                                        )
                                      );
                                      showToast(`Generated 6-digit PIN (${nextPin}) for ${s.fullName}.`);
                                    } else {
                                      showToast(res.error || 'Could not generate PIN.');
                                    }
                                  } finally {
                                    setGeneratingPinForId(null);
                                  }
                                }}
                                className="px-2 py-1 rounded-lg bg-surface-container hover:bg-surface-container-high border border-outline-variant/30 text-[11px] font-semibold text-primary-container cursor-pointer disabled:opacity-50"
                                title="Generate & store a 6-digit portal PIN"
                              >
                                {generatingPinForId === s.id ? 'Saving...' : 'Generate PIN'}
                              </button>
                            )}
                          </td>
                          <td className="py-2.5 px-3 font-mono font-bold tabular-nums whitespace-nowrap">
                            {s.rollNumber}
                          </td>
                          <td className="py-2.5 px-3 min-w-[180px]">
                            <div className="flex items-center gap-2.5">
                              {s.avatarUrl ? (
                                <img
                                  src={s.avatarUrl}
                                  alt={s.fullName}
                                  referrerPolicy="no-referrer"
                                  className="w-8 h-8 rounded-full object-cover ring-1 ring-outline-variant/30 shrink-0"
                                />
                              ) : (
                                <div className="w-8 h-8 rounded-full bg-primary-fixed/50 text-primary-container font-bold text-[10px] flex items-center justify-center ring-1 ring-outline-variant/30 shrink-0">
                                  {s.fullName.slice(0, 2).toUpperCase()}
                                </div>
                              )}
                              <div className="min-w-0">
                                <div className="font-semibold text-on-surface truncate">
                                  {s.fullName}
                                </div>
                                {s.banglaName && (
                                  <div className="text-[10px] text-on-surface-variant truncate">
                                    {s.banglaName}
                                  </div>
                                )}
                                {s.updateRequestStatus === 'Pending' && (
                                  <button
                                    type="button"
                                    onClick={() => setRegisterView('approvals')}
                                    className="block text-[10px] font-bold text-amber-800 hover:underline cursor-pointer"
                                  >
                                    Pending Approval &rarr;
                                  </button>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="py-2.5 px-3 whitespace-nowrap font-medium">
                            {s.className}
                          </td>
                          <td className="py-2.5 px-3 whitespace-nowrap">
                            {s.sectionName === 'Common' ? 'Combined' : s.sectionName}
                          </td>
                          <td className="py-2.5 px-3 whitespace-nowrap">
                            {s.group || 'General'}
                          </td>
                          <td className="py-2.5 px-3 whitespace-nowrap">
                            {s.gender || 'Male'}
                          </td>
                          <td className="py-2.5 px-3 min-w-[140px] text-on-surface">
                            {s.fatherName || '—'}
                          </td>
                          <td className="py-2.5 px-3 font-mono tabular-nums whitespace-nowrap">
                            {s.phone || '—'}
                          </td>
                          <td className="py-2.5 px-3 text-right no-print whitespace-nowrap">
                            <div className="inline-flex items-center justify-end gap-1">
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedStudent(s);
                                  setResetStudentPass('');
                                  setPassErrorMsg(null);
                                }}
                                className="p-1.5 rounded-lg text-primary-container hover:bg-surface-container cursor-pointer"
                                title="View Student Bio & PIN"
                                aria-label="View student details"
                              >
                                <Eye className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => openEditForm(s)}
                                className="p-1.5 rounded-lg text-secondary hover:bg-surface-container cursor-pointer"
                                title="Edit Student Information"
                                aria-label="Edit student"
                              >
                                <Pencil className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setPrintAdmissionStudent(s)}
                                className="p-1.5 rounded-lg text-emerald-700 hover:bg-emerald-50 cursor-pointer"
                                title="Print Admission / Information Form PDF"
                                aria-label="Print admission form"
                              >
                                <Printer className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteStudent(s)}
                                className="p-1.5 rounded-lg text-error hover:bg-error-container/20 cursor-pointer"
                                title="Delete Student"
                                aria-label="Delete student"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* Result-Wise & Simple Next-Class Promotion Modal */}
      {showPromoteModal && (
        <StudentPromoteModal
          selectedStudents={
            selectedIds.length > 0
              ? filteredStudents.filter((s) => selectedIds.includes(s.id))
              : filteredStudents
          }
          allStudents={students}
          academicClasses={effectiveClasses}
          exams={exams}
          subjects={subjects}
          markEntries={markEntries}
          instituteRules={instituteRules}
          onPromoted={(count, targetCls, promotedIds) => {
            setQueriedStudents((prev) => prev.filter((s) => !promotedIds.includes(s.id)));
            setSelectedIds([]);
            setShowPromoteModal(false);
            refreshFromServer();
            setQueryNonce((n) => n + 1);
            showToast(`Successfully promoted ${count} student(s) to ${targetCls}.`);
          }}
          onClose={() => setShowPromoteModal(false)}
        />
      )}

      {/* Archive / Graduate Cohort to Alumni Modal */}
      {showGraduateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="bg-surface-container-lowest rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-outline-variant/20 pb-3">
              <h3 className="text-base font-bold">Archive Graduating Cohort to Alumni</h3>
              <button
                type="button"
                onClick={() => setShowGraduateModal(false)}
                className="p-1 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>
            <p className="text-xs text-on-surface-variant">
              Archive <strong>{selectedIds.length}</strong> selected student(s) into the permanent Alumni directory while preserving all historical marksheets and results.
            </p>
            <form onSubmit={handleConfirmGraduate} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold mb-1">Passing / Graduation Year *</label>
                <input
                  type="text"
                  required
                  value={gradYear}
                  onChange={(e) => setGradYear(e.target.value)}
                  placeholder="e.g. 2025"
                  className="w-full px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 font-mono"
                />
              </div>
              <div>
                <label className="block font-semibold mb-1">Graduating Examination Wing</label>
                <select
                  value={gradWing}
                  onChange={(e) => setGradWing(e.target.value as 'SSC' | 'HSC')}
                  className="w-full px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 font-semibold"
                >
                  {showSchool && <option value="SSC">SSC / School Wing</option>}
                  {showCollege && <option value="HSC">HSC / College Wing</option>}
                </select>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowGraduateModal(false)}
                  className="px-4 py-2 rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-primary-container text-on-primary font-bold cursor-pointer"
                >
                  Archive as Alumni
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* View Student Bio Modal */}
      {selectedStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="bg-surface-container-lowest rounded-3xl p-6 sm:p-8 max-w-lg w-full shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-outline-variant/15">
              <h3 className="font-title-lg text-title-lg font-bold text-on-surface">
                Student Bio Profile
              </h3>
              <button
                type="button"
                onClick={() => setSelectedStudent(null)}
                className="p-2 rounded-full text-on-surface-variant hover:bg-surface-container cursor-pointer"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            <div className="flex items-center gap-4">
              {selectedStudent.avatarUrl ? (
                <img
                  src={selectedStudent.avatarUrl}
                  alt={selectedStudent.fullName}
                  referrerPolicy="no-referrer"
                  className="w-16 h-16 rounded-2xl object-cover ring-2 ring-primary-container/20"
                />
              ) : (
                <div className="w-16 h-16 rounded-2xl bg-primary-fixed/50 text-primary-container font-bold text-lg flex items-center justify-center ring-2 ring-primary-container/20 shrink-0">
                  {selectedStudent.fullName.slice(0, 2).toUpperCase()}
                </div>
              )}
              <div>
                <h4 className="font-headline-sm text-headline-sm font-bold text-on-surface">
                  {selectedStudent.fullName}
                </h4>
                {selectedStudent.banglaName && (
                  <p className="text-xs text-on-surface-variant font-medium">
                    {selectedStudent.banglaName}
                  </p>
                )}
                <p className="text-xs text-on-surface-variant font-mono">
                  {selectedStudent.systemId} &bull; Roll #{selectedStudent.rollNumber}
                </p>
                <p className="text-xs text-primary-container font-semibold mt-0.5">
                  {selectedStudent.className} (
                  {formatGroupSectionDisplay(selectedStudent.group, selectedStudent.sectionName)}) &bull;{' '}
                  {selectedStudent.shift} Shift &bull; {selectedStudent.status}
                  {selectedStudent.graduatedYear ? ` (${selectedStudent.graduatedYear})` : ''}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs bg-surface-container-low p-4 rounded-2xl">
              <div>
                <span className="text-on-surface-variant block font-medium">Father&apos;s Name</span>
                <span className="font-semibold text-on-surface">{selectedStudent.fatherName}</span>
                {selectedStudent.fatherBanglaName && (
                  <span className="block text-[11px] text-on-surface-variant">
                    {selectedStudent.fatherBanglaName}
                  </span>
                )}
                {selectedStudent.fatherPhone && (
                  <span className="block text-[11px] font-mono text-on-surface-variant">
                    {selectedStudent.fatherPhone}
                  </span>
                )}
                {(selectedStudent.fatherOccupation || selectedStudent.fatherNid) && (
                  <span className="block text-[10px] text-on-surface-variant/80">
                    {[
                      selectedStudent.fatherOccupation,
                      selectedStudent.fatherNid ? `NID: ${selectedStudent.fatherNid}` : '',
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                )}
              </div>
              <div>
                <span className="text-on-surface-variant block font-medium">Mother&apos;s Name</span>
                <span className="font-semibold text-on-surface">{selectedStudent.motherName}</span>
                {selectedStudent.motherBanglaName && (
                  <span className="block text-[11px] text-on-surface-variant">
                    {selectedStudent.motherBanglaName}
                  </span>
                )}
                {selectedStudent.motherPhone && (
                  <span className="block text-[11px] font-mono text-on-surface-variant">
                    {selectedStudent.motherPhone}
                  </span>
                )}
                {(selectedStudent.motherOccupation || selectedStudent.motherNid) && (
                  <span className="block text-[10px] text-on-surface-variant/80">
                    {[
                      selectedStudent.motherOccupation,
                      selectedStudent.motherNid ? `NID: ${selectedStudent.motherNid}` : '',
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                )}
              </div>
              <div>
                <span className="text-on-surface-variant block font-medium">DOB / Blood</span>
                <span className="font-semibold text-on-surface font-mono">
                  {formatDateDDMMYYYY(selectedStudent.dateOfBirth)} · {selectedStudent.bloodGroup || '—'}
                </span>
              </div>
              <div>
                <span className="text-on-surface-variant block font-medium">Gender / Faith</span>
                <span className="font-semibold text-on-surface">
                  {selectedStudent.gender || 'Male'} · {selectedStudent.religionGroup}
                </span>
              </div>
              <div>
                <span className="text-on-surface-variant block font-medium">Birth Reg / Board Reg</span>
                <span className="font-semibold text-on-surface font-mono">
                  {selectedStudent.birthRegOrNid || '—'}
                  {selectedStudent.registrationNumber
                    ? ` · Reg: ${selectedStudent.registrationNumber}`
                    : ''}
                </span>
              </div>
              <div>
                <span className="text-on-surface-variant block font-medium">Primary Mobile</span>
                <span className="font-semibold text-on-surface font-mono">
                  {selectedStudent.phone || '—'}
                </span>
              </div>
              {selectedStudent.guardianName && (
                <div className="col-span-2">
                  <span className="text-on-surface-variant block font-medium">Local Guardian</span>
                  <span className="font-semibold text-on-surface">
                    {selectedStudent.guardianName}
                    {selectedStudent.guardianRelation ? ` (${selectedStudent.guardianRelation})` : ''}
                    {selectedStudent.guardianPhone ? ` · ${selectedStudent.guardianPhone}` : ''}
                  </span>
                </div>
              )}
              <div className="col-span-2">
                <span className="text-on-surface-variant block font-medium">Present Address</span>
                <span className="font-semibold text-on-surface">
                  {selectedStudent.presentAddress || selectedStudent.address || '—'}
                </span>
              </div>
              {selectedStudent.permanentAddress && (
                <div className="col-span-2">
                  <span className="text-on-surface-variant block font-medium">Permanent Address</span>
                  <span className="font-semibold text-on-surface">
                    {selectedStudent.permanentAddress}
                  </span>
                </div>
              )}
            </div>

            {/* Admin Student Portal 6-Digit PIN Display & Reset */}
            <div className="p-4 rounded-2xl bg-surface-container-low border border-outline-variant/30 space-y-3 text-xs">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <span className="font-bold text-on-surface block">
                    Student Portal 6-Digit PIN{' '}
                    {selectedStudent.systemPin && (
                      <span className="ml-1.5 font-mono text-primary-container tracking-widest">
                        {selectedStudent.systemPin}
                      </span>
                    )}
                  </span>
                  <span className="text-[11px] text-on-surface-variant">
                    {selectedStudent.systemPin
                      ? 'System-generated 6-digit PIN visible to Admin; you can also regenerate or set a custom PIN.'
                      : 'No stored admin PIN yet; regenerate to create a new 6-digit PIN.'}
                  </span>
                </div>
                <button
                  type="button"
                  disabled={resettingPin}
                  onClick={async () => {
                    const target = selectedStudent;
                    const nextPin = generateSixDigitPin();
                    setResettingPin(true);
                    setPassErrorMsg(null);
                    try {
                      const res = await updateStudentAsync(target.id, { password: nextPin });
                      if (!res.ok) {
                        setPassErrorMsg(res.error || 'Failed to reset 6-digit PIN.');
                        return;
                      }
                      setQueriedStudents((prev) =>
                        prev.map((item) =>
                          item.id === target.id ? { ...item, systemPin: nextPin } : item
                        )
                      );
                      setSelectedStudent(null);
                      setCredentialSlips([
                        {
                          studentId: target.systemId,
                          name: target.fullName,
                          className: target.className,
                          sectionName: target.sectionName,
                          roll: target.rollNumber,
                          plainPin: nextPin,
                        },
                      ]);
                      showToast(`Generated new 6-digit PIN for ${target.fullName}.`);
                    } finally {
                      setResettingPin(false);
                    }
                  }}
                  className="px-3.5 py-2 rounded-xl bg-primary-container hover:bg-primary text-on-primary font-bold cursor-pointer disabled:opacity-50 shrink-0"
                >
                  {resettingPin ? 'Regenerating...' : 'Reset / Regenerate 6-Digit PIN'}
                </button>
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="Or set custom 6-digit numeric PIN"
                  value={resetStudentPass}
                  onChange={(e) => {
                    setResetStudentPass(e.target.value.replace(/\D/g, '').slice(0, 6));
                    setPassErrorMsg(null);
                  }}
                  className="flex-1 px-3 py-1.5 rounded-xl bg-white border border-outline-variant/40 font-mono text-xs tracking-widest"
                />
                <button
                  type="button"
                  disabled={resettingPin}
                  onClick={async () => {
                    const customPin = resetStudentPass.trim();
                    if (!isValidSixDigitPin(customPin)) {
                      setPassErrorMsg('Enter an exact 6-digit numeric PIN.');
                      return;
                    }
                    const target = selectedStudent;
                    setResettingPin(true);
                    setPassErrorMsg(null);
                    try {
                      const res = await updateStudentAsync(target.id, { password: customPin });
                      if (!res.ok) {
                        setPassErrorMsg(res.error || 'Failed to update PIN.');
                        return;
                      }
                      setQueriedStudents((prev) =>
                        prev.map((item) =>
                          item.id === target.id ? { ...item, systemPin: customPin } : item
                        )
                      );
                      setResetStudentPass('');
                      setSelectedStudent(null);
                      setCredentialSlips([
                        {
                          studentId: target.systemId,
                          name: target.fullName,
                          className: target.className,
                          sectionName: target.sectionName,
                          roll: target.rollNumber,
                          plainPin: customPin,
                        },
                      ]);
                      showToast(`Updated 6-digit PIN for ${target.fullName}.`);
                    } finally {
                      setResettingPin(false);
                    }
                  }}
                  className="px-3.5 py-1.5 rounded-xl bg-secondary text-on-secondary font-bold cursor-pointer disabled:opacity-50"
                >
                  Save Custom PIN
                </button>
              </div>
              {passErrorMsg && (
                <p className="text-[11px] text-error font-semibold">{passErrorMsg}</p>
              )}
            </div>

            {selectedStudent.updateRequestStatus === 'Pending' && selectedStudent.updateRequest && (
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-between gap-2 text-xs">
                <span className="font-semibold text-amber-900">
                  This student has a pending profile update request.
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedStudent(null);
                    setRegisterView('approvals');
                  }}
                  className="px-3 py-1.5 rounded-lg bg-amber-900 text-white font-bold cursor-pointer shrink-0"
                >
                  Open Diff Queue
                </button>
              </div>
            )}

            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  const target = selectedStudent;
                  setSelectedStudent(null);
                  setPrintAdmissionStudent(target);
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5" />
                Print Admission Form PDF
              </button>
              <button
                type="button"
                onClick={() => {
                  const target = selectedStudent;
                  setSelectedStudent(null);
                  openEditForm(target);
                }}
                className="px-4 py-2 rounded-xl bg-surface-container hover:bg-surface-container-high text-xs font-semibold cursor-pointer"
              >
                Open Full Edit Page
              </button>
              <button
                type="button"
                onClick={() => setSelectedStudent(null)}
                className="px-5 py-2 rounded-xl bg-primary-container text-on-primary text-xs font-bold cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Student Confirmation Modal */}
      {confirmDeleteStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="bg-surface-container-lowest rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4 border border-outline-variant/25">
            <div className="flex items-center justify-between border-b border-outline-variant/15 pb-3">
              <h3 className="text-base font-bold text-on-surface">Confirm Student Deletion</h3>
              <button
                type="button"
                onClick={() => setConfirmDeleteStudent(null)}
                className="p-1.5 rounded-full hover:bg-surface-container cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-on-surface-variant leading-relaxed">
              Are you sure you want to permanently remove{' '}
              <strong className="text-on-surface">{confirmDeleteStudent.fullName}</strong> (
              <span className="font-mono">{confirmDeleteStudent.systemId}</span>,{' '}
              {confirmDeleteStudent.className} Roll #{confirmDeleteStudent.rollNumber})? This action cannot be undone.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmDeleteStudent(null)}
                className="px-4 py-2 rounded-xl bg-surface-container-low hover:bg-surface-container text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const target = confirmDeleteStudent;
                  deleteStudent(target.id);
                  setQueriedStudents((prev) => prev.filter((item) => item.id !== target.id));
                  setSelectedIds((prev) => prev.filter((id) => id !== target.id));
                  setConfirmDeleteStudent(null);
                  showToast(`Deleted student record for ${target.fullName}.`);
                }}
                className="px-4 py-2 rounded-xl bg-error hover:bg-error/90 text-on-error text-xs font-bold cursor-pointer"
              >
                Delete Student
              </button>
            </div>
          </div>
        </div>
      )}

      {importReviewData && (
        <BulkImportReviewModal
          fileName={importReviewData.fileName}
          totalRows={importReviewData.totalRows}
          validRowsCount={importReviewData.validRowsCount}
          errorCount={importReviewData.errorCount}
          errors={importReviewData.errors}
          preview={importReviewData.preview}
          onCommit={handleCommitBulkImport}
          onClose={() => setImportReviewData(null)}
          isCommitting={isCommittingImport}
        />
      )}

      {credentialSlips && (
        <BulkCredentialSlipModal
          schoolName={cmsConfig.schoolName}
          credentials={credentialSlips}
          onClose={() => {
            setCredentialSlips(null);
            refreshFromServer();
          }}
        />
      )}

      {showExportModal && (
        <StudentExportModal
          students={filteredStudents}
          instituteRules={instituteRules}
          cmsConfig={cmsConfig}
          defaultClassName={defaultClassName}
          defaultSectionName={defaultSectionName}
          onClose={() => setShowExportModal(false)}
          showToast={showToast}
        />
      )}
    </div>

    {printAdmissionStudent && (
      <StudentAdmissionFormPrintModal
        student={printAdmissionStudent}
        cmsConfig={cmsConfig}
        instituteRules={instituteRules}
        subjects={subjects}
        onClose={() => setPrintAdmissionStudent(null)}
      />
    )}
    </>
  );
}
