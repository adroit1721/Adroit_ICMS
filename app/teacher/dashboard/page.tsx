'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useERPStore } from '@/lib/store';
import { GenderType, MarkEntry, ShiftType, Teacher } from '@/lib/types';
import { evaluateSubjectResult } from '@/lib/grading-engine';
import {
  formatDateDDMMYYYY,
  formatInstituteSessionBanner,
  formatSubjectGroupsLabel,
  getActiveSubjectCustomComponents,
  getEffectiveConversionPercent,
  isSubjectComponentEnabled,
  resolveSubjectCTConfig,
  sortSubjectsByOrder,
  subjectAppliesToStudent,
} from '@/lib/academic-helpers';
import { normalizeTeacherCategory } from '@/lib/teacher-helpers';
import ImageCropUpload from '@/components/admin/ImageCropUpload';

type TeacherPortalTab = 'marks' | 'routine' | 'notices' | 'profile';

interface TeacherProfilePanelProps {
  teacher: Teacher;
  onSaveProfile: (updates: Partial<Teacher>) => Promise<{ ok: boolean; error?: string }>;
  onOpenPasswordModal: () => void;
}

function TeacherProfilePanel({
  teacher,
  onSaveProfile,
  onOpenPasswordModal,
}: TeacherProfilePanelProps) {
  const [name, setName] = useState(teacher.name || '');
  const [banglaName, setBanglaName] = useState(teacher.banglaName || '');
  const [phone, setPhone] = useState(teacher.phone || '');
  const [email, setEmail] = useState(teacher.email || '');
  const [qualification, setQualification] = useState(teacher.qualification || '');
  const [bloodGroup, setBloodGroup] = useState(teacher.bloodGroup || 'B+');
  const [dateOfBirth, setDateOfBirth] = useState(teacher.dateOfBirth || '');
  const [gender, setGender] = useState<GenderType>(teacher.gender || 'Male');
  const [nidNumber, setNidNumber] = useState(teacher.nidNumber || '');
  const [emergencyContact, setEmergencyContact] = useState(teacher.emergencyContact || '');
  const [presentAddress, setPresentAddress] = useState(teacher.presentAddress || '');
  const [permanentAddress, setPermanentAddress] = useState(teacher.permanentAddress || '');
  const [avatarUrl, setAvatarUrl] = useState(teacher.avatarUrl || '');
  const [avatarPublicId, setAvatarPublicId] = useState(teacher.avatarPublicId || '');
  const [signatureUrl, setSignatureUrl] = useState(teacher.signatureUrl || '');
  const [signaturePublicId, setSignaturePublicId] = useState(teacher.signaturePublicId || '');
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setStatus({ type: 'error', text: 'English full name is required.' });
      return;
    }
    setSaving(true);
    setStatus(null);
    const res = await onSaveProfile({
      name: name.trim(),
      banglaName: banglaName.trim() || undefined,
      phone: phone.trim(),
      email: email.trim(),
      qualification: qualification.trim() || undefined,
      bloodGroup: bloodGroup.trim() || undefined,
      dateOfBirth: dateOfBirth || undefined,
      gender,
      nidNumber: nidNumber.trim() || undefined,
      emergencyContact: emergencyContact.trim() || undefined,
      presentAddress: presentAddress.trim() || undefined,
      permanentAddress: permanentAddress.trim() || undefined,
      avatarUrl: avatarUrl.trim(),
      avatarPublicId: avatarUrl.trim() ? avatarPublicId || undefined : '',
      signatureUrl: signatureUrl.trim(),
      signaturePublicId: signatureUrl.trim() ? signaturePublicId || undefined : '',
    });
    setSaving(false);
    if (res.ok) {
      setStatus({ type: 'success', text: 'Profile and media updated successfully!' });
    } else {
      setStatus({ type: 'error', text: res.error || 'Could not update profile.' });
    }
  };

  return (
    <div className="space-y-6">
      {/* Institutional Summary & App Card */}
      <div className="rounded-3xl bg-surface-container-lowest border border-outline-variant/25 p-5 sm:p-6 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xs">
        <div className="flex items-center gap-4 min-w-0">
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt={teacher.name}
              referrerPolicy="no-referrer"
              className="w-16 h-16 rounded-2xl object-cover border border-outline-variant/30 shrink-0"
            />
          ) : (
            <div className="w-16 h-16 rounded-2xl bg-secondary/15 text-secondary font-bold text-xl flex items-center justify-center border border-outline-variant/30 shrink-0">
              {(name || teacher.name).slice(0, 2).toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono font-bold">
              <span className="px-2 py-0.5 rounded-md bg-secondary/10 text-secondary">
                {teacher.employeeId || teacher.id}
              </span>
              <span className="px-2 py-0.5 rounded-md bg-primary-fixed/50 text-primary-container">
                {normalizeTeacherCategory(teacher.staffCategory)}
                {teacher.rankOrder ? ` · Rank #${teacher.rankOrder}` : ''}
              </span>
            </div>
            <h2 className="text-lg font-bold text-on-surface truncate mt-1">
              {name || teacher.name}
            </h2>
            {banglaName && (
              <p className="text-xs font-medium text-on-surface-variant truncate">{banglaName}</p>
            )}
            <p className="text-xs text-primary-container font-semibold truncate">
              {teacher.designation}
              {teacher.department ? ` · ${teacher.department}` : ''}
              {teacher.shift ? ` · ${teacher.shift} Shift` : ''}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onOpenPasswordModal}
            className="px-4 py-2 rounded-xl bg-surface-container-low hover:bg-surface-container border border-outline-variant/40 text-xs font-bold text-on-surface flex items-center gap-1.5 cursor-pointer"
          >
            <span className="material-symbols-outlined text-[16px]">key</span>
            <span>Change Login PIN</span>
          </button>
        </div>
      </div>

      {status && (
        <div
          className={`p-3.5 rounded-2xl text-xs font-semibold flex items-center gap-2 border ${
            status.type === 'success'
              ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
              : 'bg-error-container/50 text-on-error-container border-error/20'
          }`}
        >
          <span className="material-symbols-outlined text-[18px]">
            {status.type === 'success' ? 'check_circle' : 'error'}
          </span>
          <span>{status.text}</span>
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-6 text-xs">
        <div className="rounded-3xl bg-surface-container-lowest border border-outline-variant/25 p-5 sm:p-6 space-y-5">
          <h3 className="text-sm font-bold text-on-surface border-b border-outline-variant/15 pb-2.5">
            Portrait Photo &amp; Specimen Signature (Auto-Crop)
          </h3>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <ImageCropUpload
              mode="passport"
              label="My Portrait Photo"
              value={avatarUrl}
              publicId={avatarPublicId}
              folder="erp/teachers/avatars"
              onChangeMedia={({ url, publicId }) => {
                setAvatarUrl(url);
                setAvatarPublicId(publicId ?? (url.trim() ? avatarPublicId : ''));
              }}
              buttonLabel="Crop & Update Photo"
              helperText="Locked 35:45 passport portrait crop (420×540 px)."
            />
            <ImageCropUpload
              mode="signature"
              label="My Specimen Signature"
              value={signatureUrl}
              publicId={signaturePublicId}
              folder="erp/teachers/signatures"
              onChangeMedia={({ url, publicId }) => {
                setSignatureUrl(url);
                setSignaturePublicId(publicId ?? (url.trim() ? signaturePublicId : ''));
              }}
              buttonLabel="Crop & Update Signature"
              helperText="Locked 3:1 wide signature crop (480×160 px)."
            />
          </div>
        </div>

        <div className="rounded-3xl bg-surface-container-lowest border border-outline-variant/25 p-5 sm:p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-outline-variant/15 pb-2.5">
            <h3 className="text-sm font-bold text-on-surface">
              Personal, Contact &amp; Academic Credentials
            </h3>
            <span className="text-[11px] text-on-surface-variant">
              MPO: <strong className="font-mono">{teacher.mpoIndexNo || '—'}</strong>
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block font-semibold text-on-surface-variant uppercase mb-1">
                Name in English *
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-surface-container-low border border-outline-variant/30 text-sm font-medium"
              />
            </div>
            <div>
              <label className="block font-semibold text-on-surface-variant uppercase mb-1">
                Name in Bangla (বাংলায় নাম)
              </label>
              <input
                type="text"
                value={banglaName}
                onChange={(e) => setBanglaName(e.target.value)}
                placeholder="বাংলা নাম"
                className="w-full px-3.5 py-2.5 rounded-xl bg-surface-container-low border border-outline-variant/30 text-sm font-medium"
              />
            </div>
            <div>
              <label className="block font-semibold text-on-surface-variant uppercase mb-1">
                Mobile Phone *
              </label>
              <input
                type="text"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-surface-container-low border border-outline-variant/30 text-sm font-mono tabular-nums"
              />
            </div>
            <div>
              <label className="block font-semibold text-on-surface-variant uppercase mb-1">
                Email Address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-surface-container-low border border-outline-variant/30 text-sm"
              />
            </div>
            <div>
              <label className="block font-semibold text-on-surface-variant uppercase mb-1">
                Highest Qualification
              </label>
              <input
                type="text"
                value={qualification}
                onChange={(e) => setQualification(e.target.value)}
                placeholder="e.g. M.Sc., B.Ed."
                className="w-full px-3.5 py-2.5 rounded-xl bg-surface-container-low border border-outline-variant/30 text-sm"
              />
            </div>
            <div>
              <label className="block font-semibold text-on-surface-variant uppercase mb-1">
                National ID (NID) No.
              </label>
              <input
                type="text"
                value={nidNumber}
                onChange={(e) => setNidNumber(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-surface-container-low border border-outline-variant/30 text-sm font-mono"
              />
            </div>
            <div>
              <label className="block font-semibold text-on-surface-variant uppercase mb-1">
                Gender
              </label>
              <select
                value={gender}
                onChange={(e) => setGender(e.target.value as GenderType)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-surface-container-low border border-outline-variant/30 text-sm"
              >
                <option value="Male">Male</option>
                <option value="Female">Female</option>
              </select>
            </div>
            <div>
              <label className="block font-semibold text-on-surface-variant uppercase mb-1">
                Date of Birth
              </label>
              <input
                type="date"
                value={dateOfBirth}
                onChange={(e) => setDateOfBirth(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-surface-container-low border border-outline-variant/30 text-sm font-mono"
              />
            </div>
            <div>
              <label className="block font-semibold text-on-surface-variant uppercase mb-1">
                Blood Group
              </label>
              <select
                value={bloodGroup}
                onChange={(e) => setBloodGroup(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-surface-container-low border border-outline-variant/30 text-sm"
              >
                {['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'].map((bg) => (
                  <option key={bg} value={bg}>
                    {bg}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-semibold text-on-surface-variant uppercase mb-1">
                Emergency Contact
              </label>
              <input
                type="text"
                value={emergencyContact}
                onChange={(e) => setEmergencyContact(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-surface-container-low border border-outline-variant/30 text-sm"
              />
            </div>
            <div>
              <label className="block font-semibold text-on-surface-variant uppercase mb-1">
                Present Address
              </label>
              <input
                type="text"
                value={presentAddress}
                onChange={(e) => setPresentAddress(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-surface-container-low border border-outline-variant/30 text-sm"
              />
            </div>
            <div>
              <label className="block font-semibold text-on-surface-variant uppercase mb-1">
                Permanent Address
              </label>
              <input
                type="text"
                value={permanentAddress}
                onChange={(e) => setPermanentAddress(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-surface-container-low border border-outline-variant/30 text-sm"
              />
            </div>
          </div>

          <div className="pt-2 flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-3 rounded-xl bg-secondary hover:bg-secondary/90 disabled:opacity-60 text-on-secondary font-bold text-xs shadow-sm cursor-pointer inline-flex items-center gap-2"
            >
              <span className="material-symbols-outlined text-[16px]">
                {saving ? 'sync' : 'save'}
              </span>
              <span>{saving ? 'Saving Profile...' : 'Save My Profile Updates'}</span>
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

export default function TeacherDashboardPage() {
  const router = useRouter();
  const {
    state,
    isHydrated,
    authSession,
    saveMarkEntries,
    lockExamRoster,
    updateOwnTeacherProfile,
    logout,
  } = useERPStore();
  const {
    teachers,
    subjects,
    students,
    markEntries,
    exams,
    cmsConfig,
    events,
    notices,
    classRoutines,
    academicClasses,
    instituteRules,
  } = state;

  const sessionTeacherId =
    authSession && authSession.portal === 'teacher' ? authSession.userId : null;

  const currentTeacher =
    isHydrated && sessionTeacherId
      ? teachers.find((t) => t.id === sessionTeacherId) || null
      : null;

  const [portalView, setPortalView] = useState<TeacherPortalTab>('marks');
  const [selectedClassIdx, setSelectedClassIdx] = useState(0);
  const [selectedExamId, setSelectedExamId] = useState<string>('');
  const [selectedTeacherSection, setSelectedTeacherSection] = useState<string>('ALL');
  const [selectedTeacherGroup, setSelectedTeacherGroup] = useState<'ALL' | AcademicGroup>('ALL');
  const [studentSearch, setStudentSearch] = useState('');

  // Routine filters
  const [routineScope, setRoutineScope] = useState<'my' | 'all'>('my');
  const [routineClassFilter, setRoutineClassFilter] = useState<string>('ALL');
  const [routineShiftFilter, setRoutineShiftFilter] = useState<'ALL' | ShiftType>('ALL');

  const [localMarks, setLocalMarks] = useState<
    Record<
      string,
      {
        cq: number | '';
        mcq: number | '';
        practical: number | '';
        ct?: number | '';
        customMarks?: Record<string, number | ''>;
        isAbsent?: boolean;
      }
    >
  >({});
  const [feedback, setFeedback] = useState<string | null>(null);

  // Change Password Modal State
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [curPass, setCurPass] = useState('');
  const [newPass, setNewPass] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [passMsg, setPassMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (isHydrated && !currentTeacher) {
      router.replace('/teacher/login');
    }
  }, [isHydrated, currentTeacher, router]);

  if (!isHydrated) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-8 text-center">
        <div className="text-xs font-semibold text-on-surface-variant">
          Verifying faculty session...
        </div>
      </div>
    );
  }

  if (!currentTeacher) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-8 text-center">
        <div className="max-w-sm w-full bg-white rounded-3xl p-8 shadow-lg border border-outline-variant/30 space-y-4">
          <span className="material-symbols-outlined text-[36px] text-secondary">lock</span>
          <h1 className="text-lg font-bold text-on-surface">Faculty Authentication Required</h1>
          <p className="text-xs text-on-surface-variant">
            Mark entry and examination rosters are protected. Sign in with your Teacher ID and PIN.
          </p>
          <Link
            href="/teacher/login"
            className="inline-block px-5 py-2.5 bg-secondary text-on-secondary rounded-xl font-bold text-xs"
          >
            Sign In to Teacher Portal
          </Link>
        </div>
      </div>
    );
  }

  const currentExam = exams.find((e) => e.id === selectedExamId) || exams[0];
  const isCourseAllowedInExam = (className: string, subjectId: string) => {
    if (!currentExam) return true;
    if (currentExam.targetClasses?.length && !currentExam.targetClasses.includes(className)) {
      return false;
    }
    if (currentExam.excludedSubjectIds?.includes(subjectId)) {
      return false;
    }
    return true;
  };

  const examAssignedCourses = (currentExam?.examinerAssignments || [])
    .filter((a) => a.teacherId === currentTeacher.id && isCourseAllowedInExam(a.className, a.subjectId))
    .map((a) => ({
      className: a.className,
      sectionName: a.sectionName,
      subjectId: a.subjectId,
      subjectName: subjects.find((s) => s.id === a.subjectId)?.name || 'Subject',
      deadline: a.deadline,
    }));
  const rawEffectiveAssigned = examAssignedCourses;
  const effectiveAssignedClasses = [...rawEffectiveAssigned].sort((a, b) => {
    const subA = subjects.find((s) => s.id === a.subjectId);
    const subB = subjects.find((s) => s.id === b.subjectId);
    const ordA = typeof subA?.order === 'number' ? subA.order : 9999;
    const ordB = typeof subB?.order === 'number' ? subB.order : 9999;
    if (ordA !== ordB) return ordA - ordB;
    return (subA?.code || '').localeCompare(subB?.code || '', undefined, { numeric: true });
  });

  const hasAssignedCourses = effectiveAssignedClasses.length > 0;
  const assignedClassInfo = effectiveAssignedClasses[selectedClassIdx] || effectiveAssignedClasses[0];

  const currentSubject = subjects.find((s) => s.id === assignedClassInfo?.subjectId);
  const assignedClassObj = academicClasses.find((c) => c.name === assignedClassInfo?.className);
  const assignedClassSections = assignedClassObj
    ? getEffectiveSectionsForClassGroup(assignedClassObj, 'All')
    : [];
  const assignedClassGroups = (assignedClassObj?.groups || []).filter(
    (g): g is AcademicGroup => g !== 'General'
  );

  // Check if another examiner has exclusive lock over the selected paper
  const matchingPaperExaminers =
    currentExam && assignedClassInfo && currentSubject
      ? (currentExam.examinerAssignments || []).filter(
          (a) =>
            a.subjectId === currentSubject.id &&
            a.className === assignedClassInfo.className &&
            (a.sectionName === 'Common' ||
              !a.sectionName ||
              assignedClassInfo.sectionName === 'Common' ||
              a.sectionName === assignedClassInfo.sectionName)
        )
      : [];
  const isAssignedToOtherExaminer =
    matchingPaperExaminers.length > 0 &&
    !matchingPaperExaminers.some((a) => a.teacherId === currentTeacher.id);

  const eligibleStudents =
    assignedClassInfo && currentSubject
      ? students
          .filter((s) => {
            const hasExistingMark = currentExam
              ? markEntries.some(
                  (m) =>
                    m.examId === currentExam.id &&
                    m.studentId === s.id &&
                    m.subjectId === currentSubject.id
                )
              : false;
            if (s.status !== 'Active' && !hasExistingMark) return false;
            if (s.className !== assignedClassInfo.className) return false;
            if (
              assignedClassInfo.sectionName !== 'Common' &&
              s.sectionName !== assignedClassInfo.sectionName
            ) {
              return false;
            }
            if (
              selectedTeacherSection !== 'ALL' &&
              selectedTeacherSection !== 'Common' &&
              s.sectionName !== selectedTeacherSection
            ) {
              return false;
            }
            if (
              selectedTeacherGroup !== 'ALL' &&
              s.group !== selectedTeacherGroup
            ) {
              return false;
            }
            return subjectAppliesToStudent(currentSubject, s, { hasExistingMark });
          })
          .sort((a, b) => a.rollNumber - b.rollNumber)
      : [];

  const q = studentSearch.trim().toLowerCase();
  const visibleStudents = q
    ? eligibleStudents.filter(
        (s) =>
          s.fullName.toLowerCase().includes(q) ||
          (s.systemId || '').toLowerCase().includes(q) ||
          String(s.rollNumber).includes(q)
      )
    : eligibleStudents;

  const isRosterLocked =
    currentExam && currentSubject
      ? eligibleStudents.some((stu) =>
          markEntries.some(
            (m) =>
              m.examId === currentExam.id &&
              m.studentId === stu.id &&
              m.subjectId === currentSubject.id &&
              m.isLocked
          )
        )
      : false;

  const isEditingDisabled = isRosterLocked || isAssignedToOtherExaminer;

  const makeMarkKey = (studentId: string) =>
    `${currentExam?.id || 'noexam'}:${currentSubject?.id || 'nosub'}:${studentId}`;

  const getExistingMark = (studentId: string) => {
    if (!currentExam || !currentSubject) return undefined;
    return markEntries.find(
      (m) =>
        m.examId === currentExam.id &&
        m.studentId === studentId &&
        m.subjectId === currentSubject.id
    );
  };

  const cqActive = currentSubject ? isSubjectComponentEnabled(currentSubject.components.cq) : false;
  const mcqActive = currentSubject ? isSubjectComponentEnabled(currentSubject.components.mcq) : false;
  const pracActive = currentSubject
    ? isSubjectComponentEnabled(currentSubject.components.practical)
    : false;
  const ctConfig = currentSubject ? resolveSubjectCTConfig(currentSubject, currentExam) : null;
  const ctActive = Boolean(ctConfig?.enabled);
  const activeCustomHeads = currentSubject
    ? getActiveSubjectCustomComponents(currentSubject)
    : [];

  const getStudentMarkState = (studentId: string) => {
    const key = makeMarkKey(studentId);
    const existing = getExistingMark(studentId);
    const cached = localMarks[key];
    if (cached) {
      const hasCustomTyped = activeCustomHeads.some(
        (c) => cached.customMarks?.[c.id] !== undefined && cached.customMarks[c.id] !== ''
      );
      const hasAnyTyped =
        Boolean(cached.isAbsent) ||
        (cqActive && cached.cq !== '') ||
        (mcqActive && cached.mcq !== '') ||
        (pracActive && cached.practical !== '') ||
        (ctActive && cached.ct !== undefined && cached.ct !== '') ||
        hasCustomTyped;

      const customNums: Record<string, number> = {};
      for (const c of activeCustomHeads) {
        const val = cached.customMarks?.[c.id];
        customNums[c.id] = typeof val === 'number' ? val : 0;
      }

      return {
        draft: cached,
        isPending: !existing && !hasAnyTyped,
        evalNums: {
          cq: cqActive && typeof cached.cq === 'number' ? cached.cq : 0,
          mcq: mcqActive && typeof cached.mcq === 'number' ? cached.mcq : 0,
          practical: pracActive && typeof cached.practical === 'number' ? cached.practical : 0,
          ct: ctActive && typeof cached.ct === 'number' ? cached.ct : 0,
          customMarks: customNums,
          isAbsent: Boolean(cached.isAbsent),
        },
        existing,
      };
    }
    if (existing) {
      const customDraft: Record<string, number | ''> = {};
      const customNums: Record<string, number> = {};
      for (const c of activeCustomHeads) {
        const val = existing.customMarks?.[c.id];
        customDraft[c.id] = typeof val === 'number' ? val : '';
        customNums[c.id] = typeof val === 'number' ? val : 0;
      }
      return {
        draft: {
          cq: cqActive ? existing.cqMarks : ('' as const),
          mcq: mcqActive ? existing.mcqMarks : ('' as const),
          practical: pracActive ? existing.practicalMarks : ('' as const),
          ct: ctActive ? existing.ctMarks ?? 0 : undefined,
          customMarks: customDraft,
          isAbsent: Boolean(existing.isAbsent),
        },
        isPending: false,
        evalNums: {
          cq: cqActive ? existing.cqMarks : 0,
          mcq: mcqActive ? existing.mcqMarks : 0,
          practical: pracActive ? existing.practicalMarks : 0,
          ct: ctActive ? existing.ctMarks ?? 0 : 0,
          customMarks: customNums,
          isAbsent: Boolean(existing.isAbsent),
        },
        existing,
      };
    }
    return {
      draft: {
        cq: '' as const,
        mcq: '' as const,
        practical: '' as const,
        ct: ctActive ? ('' as const) : undefined,
        customMarks: {} as Record<string, number | ''>,
        isAbsent: false,
      },
      isPending: true,
      evalNums: { cq: 0, mcq: 0, practical: 0, ct: 0, customMarks: {}, isAbsent: false },
      existing: undefined,
    };
  };

  const handleScoreChange = (
    studentId: string,
    field: 'cq' | 'mcq' | 'practical' | 'ct',
    rawVal: string
  ) => {
    if (!currentSubject || isEditingDisabled) return;
    const maxMap = {
      cq: currentSubject.components.cq.fullMarks,
      mcq: currentSubject.components.mcq.fullMarks,
      practical: currentSubject.components.practical.fullMarks,
      ct: ctConfig?.fullMarks || 20,
    };
    const { draft } = getStudentMarkState(studentId);
    let nextFieldVal: number | '' = '';
    if (rawVal.trim() !== '') {
      const parsed = parseInt(rawVal, 10);
      nextFieldVal = Number.isNaN(parsed) ? '' : Math.min(maxMap[field], Math.max(0, parsed));
    }
    const key = makeMarkKey(studentId);
    setLocalMarks((prev) => ({
      ...prev,
      [key]: {
        ...draft,
        [field]: nextFieldVal,
      },
    }));
  };

  const handleCustomScoreChange = (
    studentId: string,
    customId: string,
    maxMarks: number,
    rawVal: string
  ) => {
    if (!currentSubject || isEditingDisabled) return;
    const { draft } = getStudentMarkState(studentId);
    let nextFieldVal: number | '' = '';
    if (rawVal.trim() !== '') {
      const parsed = parseInt(rawVal, 10);
      nextFieldVal = Number.isNaN(parsed) ? '' : Math.min(maxMarks, Math.max(0, parsed));
    }
    const key = makeMarkKey(studentId);
    setLocalMarks((prev) => ({
      ...prev,
      [key]: {
        ...draft,
        customMarks: {
          ...(draft.customMarks || {}),
          [customId]: nextFieldVal,
        },
      },
    }));
  };

  const handleToggleAbsent = (studentId: string, isAbsent: boolean) => {
    if (!currentSubject || isEditingDisabled) return;
    const { draft } = getStudentMarkState(studentId);
    const key = makeMarkKey(studentId);
    setLocalMarks((prev) => ({
      ...prev,
      [key]: {
        ...draft,
        isAbsent,
      },
    }));
  };

  const handleMarkPendingAbsent = () => {
    if (!currentSubject || isEditingDisabled) return;
    let marked = 0;
    const updates: typeof localMarks = {};
    for (const stu of eligibleStudents) {
      const st = getStudentMarkState(stu.id);
      if (st.isPending) {
        updates[makeMarkKey(stu.id)] = { ...st.draft, isAbsent: true };
        marked++;
      }
    }
    if (marked === 0) {
      setFeedback('No pending candidates left in this roster.');
      setTimeout(() => setFeedback(null), 2500);
      return;
    }
    setLocalMarks((prev) => ({ ...prev, ...updates }));
    setFeedback(
      `Marked ${marked} pending candidate(s) as Absent (AB). Tap Save Entered Scores to commit.`
    );
    setTimeout(() => setFeedback(null), 3000);
  };

  const handleMarkKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    rowIdx: number,
    col: string
  ) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const target = document.querySelector<HTMLInputElement>(
        `input[data-mark-cell="teacher-${col}-${rowIdx + 1}"]`
      );
      if (target) {
        target.focus();
        target.select();
      }
    }
  };

  const handleSaveMarks = () => {
    if (!currentExam || !currentSubject || isEditingDisabled) return;
    const entries: Partial<MarkEntry>[] = [];
    for (const stu of eligibleStudents) {
      const st = getStudentMarkState(stu.id);
      if (st.isPending) continue;
      const isFourth = stu.optionalFourthSubjectId === currentSubject.id;
      const evalRes = evaluateSubjectResult(currentSubject, st.evalNums, isFourth, currentExam);
      entries.push({
        examId: currentExam.id,
        studentId: stu.id,
        subjectId: currentSubject.id,
        isAbsent: st.evalNums.isAbsent,
        ctMarks: st.evalNums.isAbsent || !ctActive ? 0 : st.evalNums.ct,
        cqMarks: st.evalNums.isAbsent || !cqActive ? 0 : st.evalNums.cq,
        mcqMarks: st.evalNums.isAbsent || !mcqActive ? 0 : st.evalNums.mcq,
        practicalMarks: st.evalNums.isAbsent || !pracActive ? 0 : st.evalNums.practical,
        customMarks: st.evalNums.isAbsent ? {} : st.evalNums.customMarks,
        totalMarks: evalRes.total,
        gradePoint: evalRes.gradePoint,
        letterGrade: evalRes.letterGrade,
        isPassed: evalRes.isPassed,
        isOptionalFourth: isFourth,
      });
    }

    if (entries.length === 0) {
      setFeedback('No entered marks or AB flags to save yet.');
      setTimeout(() => setFeedback(null), 3000);
      return;
    }

    saveMarkEntries(entries);
    setFeedback(`Saved ${entries.length} score record(s)! Admin & tabulation views updated.`);
    setTimeout(() => setFeedback(null), 3000);
  };

  const handleLockMarks = () => {
    if (!currentExam || !currentSubject || isEditingDisabled) return;
    const hasEntered = eligibleStudents.some((s) => !getStudentMarkState(s.id).isPending);
    if (hasEntered) {
      handleSaveMarks();
    }
    lockExamRoster(currentExam.id, currentSubject.id);
    setFeedback('Marks roster locked and verified. Contact Exam Controller/Admin to unlock.');
    setTimeout(() => setFeedback(null), 3500);
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPassMsg(null);
    if (!curPass) {
      setPassMsg({ type: 'error', text: 'Current PIN/password is required.' });
      return;
    }
    if (newPass.length < 6) {
      setPassMsg({ type: 'error', text: 'New PIN/password must be at least 6 characters.' });
      return;
    }
    if (newPass !== confirmPass) {
      setPassMsg({ type: 'error', text: 'Confirmation does not match.' });
      return;
    }

    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'erp-client',
        },
        body: JSON.stringify({ currentPassword: curPass, newPassword: newPass }),
      });
      const rawText = await res.text();
      let data: Record<string, unknown> = {};
      if (rawText && !rawText.trim().startsWith('<')) {
        try {
          data = JSON.parse(rawText) as Record<string, unknown>;
        } catch {
          data = {};
        }
      }
      if (!res.ok) {
        setPassMsg({
          type: 'error',
          text: (typeof data.error === 'string' && data.error) || 'Could not update password.',
        });
        return;
      }
      setCurPass('');
      setNewPass('');
      setConfirmPass('');
      setPassMsg({ type: 'success', text: 'Login PIN / Password updated successfully!' });
    } catch {
      setPassMsg({ type: 'error', text: 'Network error while updating password.' });
    }
  };

  const handleSignOut = async () => {
    await logout();
    router.push('/teacher/login');
  };

  // Routine helpers for Teacher view
  const teacherNameNorm = currentTeacher.name.trim().toLowerCase();
  const periodMatchesTeacher = (p: (typeof classRoutines)[number]['periods'][number]) => {
    if (p.isBreak) return false;
    if ((p.teacherName || '').trim().toLowerCase() === teacherNameNorm) return true;
    if (
      p.parallelSessions?.some(
        (ps) => (ps.teacherName || '').trim().toLowerCase() === teacherNameNorm
      )
    ) {
      return true;
    }
    if (
      p.groupSplits &&
      Object.values(p.groupSplits).some(
        (gs) => (gs?.teacherName || '').trim().toLowerCase() === teacherNameNorm
      )
    ) {
      return true;
    }
    return false;
  };

  const filteredRoutines = classRoutines.filter((r) => {
    if (routineClassFilter !== 'ALL' && r.className !== routineClassFilter) return false;
    if (routineShiftFilter !== 'ALL' && r.shift !== routineShiftFilter) return false;
    if (routineScope === 'my') {
      return r.periods.some((p) => periodMatchesTeacher(p));
    }
    return true;
  });

  const navItems: Array<{ id: TeacherPortalTab; label: string; icon: string }> = [
    { id: 'marks', label: 'Marks', icon: 'edit_note' },
    { id: 'routine', label: 'Routine', icon: 'schedule' },
    { id: 'notices', label: 'Notices', icon: 'campaign' },
    { id: 'profile', label: 'Profile', icon: 'person' },
  ];

  return (
    <div className="bg-background font-body-md text-on-surface min-h-screen flex flex-col antialiased">
      {/* Top Navbar */}
      <header className="sticky top-0 z-30 w-full bg-white/90 backdrop-blur-2xl border-b border-outline-variant/20 px-4 sm:px-8 py-3.5 flex items-center justify-between shadow-xs">
        <div className="flex items-center gap-3 min-w-0">
          {cmsConfig.crestUrl && (
            <img
              src={cmsConfig.crestUrl}
              alt="Crest"
              className="h-8 w-auto object-contain shrink-0"
              referrerPolicy="no-referrer"
            />
          )}
          <div className="flex flex-col min-w-0">
            <span className="font-headline-sm text-sm font-bold leading-none truncate">
              {cmsConfig.schoolName}
            </span>
            <span className="text-[11px] text-secondary font-semibold uppercase tracking-wider mt-0.5 truncate">
              {currentTeacher.name}
              {currentTeacher.employeeId ? ` · ${currentTeacher.employeeId}` : ''}
            </span>
          </div>
        </div>

        {/* Desktop Nav Tabs */}
        <nav className="hidden md:flex items-center gap-1 p-1 rounded-xl bg-surface-container-low border border-outline-variant/30">
          {navItems.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setPortalView(item.id)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer transition-colors ${
                portalView === item.id
                  ? 'bg-secondary text-on-secondary shadow-xs'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              <span className="material-symbols-outlined text-[16px]">{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => {
              setPassMsg(null);
              setShowPasswordModal(true);
            }}
            className="px-3 py-1.5 rounded-xl bg-surface-container-low hover:bg-surface-container text-on-surface text-xs font-semibold flex items-center gap-1 border border-outline-variant/40 cursor-pointer"
            title="Change Login PIN"
          >
            <span className="material-symbols-outlined text-[16px]">key</span>
            <span className="hidden lg:inline">PIN</span>
          </button>

          <button
            type="button"
            onClick={handleSignOut}
            className="px-3 py-1.5 rounded-xl bg-red-50 hover:bg-red-100 text-red-700 text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer"
            title="Sign Out"
          >
            <span className="material-symbols-outlined text-[16px]">logout</span>
            <span className="hidden sm:inline">Sign Out</span>
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="w-full max-w-7xl mx-auto px-4 sm:px-6 pt-5 pb-28 md:pb-10 flex-1 space-y-5">
        {feedback && (
          <div className="p-3.5 rounded-2xl bg-emerald-500/10 text-emerald-900 font-semibold text-xs flex items-center gap-2 border border-emerald-500/20">
            <span className="material-symbols-outlined text-[18px]">check_circle</span>
            <span>{feedback}</span>
          </div>
        )}

        {/* TAB 1: MARK ENTRY */}
        {portalView === 'marks' && (
          <div className="space-y-5">
            <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
              <div>
                <span className="font-label-sm text-label-sm uppercase tracking-wider text-secondary font-semibold">
                  Examination Score Entry
                </span>
                <h1 className="font-headline-lg text-xl sm:text-2xl text-on-surface tracking-tight font-bold">
                  Mark Input &amp; Subject Roster
                </h1>
                <p className="text-xs text-on-surface-variant mt-0.5">
                  Select an exam, class, section, and subject to enter CT, CQ, MCQ, or Practical marks seamlessly from phone or desktop.
                </p>
              </div>
            </div>

            {/* Filter Bar */}
            <div className="rounded-2xl bg-surface-container-lowest border border-outline-variant/25 p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 text-xs">
              <div>
                <label className="block text-[10px] font-bold uppercase text-on-surface-variant mb-1">
                  Examination
                </label>
                <select
                  value={currentExam?.id || ''}
                  onChange={(e) => {
                    setSelectedExamId(e.target.value);
                    setSelectedClassIdx(0);
                    setSelectedTeacherSection('ALL');
                    setSelectedTeacherGroup('ALL');
                  }}
                  className="w-full px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 font-bold text-on-surface"
                >
                  {exams.map((ex) => (
                    <option key={ex.id} value={ex.id}>
                      {ex.title} ({ex.academicYear})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase text-on-surface-variant mb-1">
                  Assigned Subject Paper ({effectiveAssignedClasses.length})
                </label>
                {effectiveAssignedClasses.length === 0 ? (
                  <div className="px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 text-on-surface-variant font-medium text-xs">
                    No assigned subjects
                  </div>
                ) : (
                  <select
                    value={selectedClassIdx}
                    onChange={(e) => {
                      setSelectedClassIdx(parseInt(e.target.value, 10));
                      setSelectedTeacherSection('ALL');
                      setSelectedTeacherGroup('ALL');
                    }}
                    className="w-full px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 font-bold text-secondary"
                  >
                    {effectiveAssignedClasses.map((ac, idx) => (
                      <option key={idx} value={idx}>
                        {ac.className} ({ac.sectionName === 'Common' ? 'Combined' : ac.sectionName}) —{' '}
                        {ac.subjectName}
                        {ac.deadline ? ` · Due ${ac.deadline}` : ''}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase text-on-surface-variant mb-1">
                  Section Filter
                </label>
                <select
                  value={selectedTeacherSection}
                  onChange={(e) => setSelectedTeacherSection(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 font-semibold text-on-surface"
                >
                  <option value="ALL">All Sections ({assignedClassSections.length})</option>
                  {assignedClassSections.map((sec) => (
                    <option key={sec} value={sec}>
                      {sec === 'Common' ? 'Combined' : `Section ${sec}`}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase text-on-surface-variant mb-1">
                  Group Track
                </label>
                <select
                  value={selectedTeacherGroup}
                  onChange={(e) => setSelectedTeacherGroup(e.target.value as 'ALL' | AcademicGroup)}
                  className="w-full px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 font-semibold text-on-surface"
                >
                  <option value="ALL">All Groups / Tracks</option>
                  {assignedClassGroups.map((grp) => (
                    <option key={grp} value={grp}>
                      {grp}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase text-on-surface-variant mb-1">
                  Find Student
                </label>
                <div className="relative flex items-center">
                  <span className="material-symbols-outlined absolute left-2.5 text-[16px] text-on-surface-variant">
                    search
                  </span>
                  <input
                    type="text"
                    placeholder="Roll #, Name or ID..."
                    value={studentSearch}
                    onChange={(e) => setStudentSearch(e.target.value)}
                    className="w-full pl-8 pr-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 text-xs"
                  />
                </div>
              </div>
            </div>

            {!hasAssignedCourses ? (
              <div className="rounded-3xl bg-white p-8 text-center border border-outline-variant/25 space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-secondary/10 text-secondary flex items-center justify-center mx-auto">
                  <span className="material-symbols-outlined text-[26px]">assignment_late</span>
                </div>
                <h2 className="text-base font-bold text-on-surface">No Examiner Assignments Found</h2>
                <p className="text-xs text-on-surface-variant max-w-md mx-auto">
                  You have not been assigned as an examiner for any subjects in &quot;{currentExam?.title || 'Selected Examination'}&quot;.
                  Please contact the Institution Administrator or Exam Controller to assign your subject papers.
                </p>
              </div>
            ) : !currentExam || !currentSubject || !assignedClassInfo ? (
              <div className="rounded-3xl bg-white p-8 text-center text-xs text-on-surface-variant border border-outline-variant/20">
                Select an assigned course above to begin entering marks.
              </div>
            ) : (
              (() => {
                const rosterStates = visibleStudents.map((stu) => ({
                  stu,
                  state: getStudentMarkState(stu.id),
                }));
                const allRosterStates = eligibleStudents.map((stu) => ({
                  stu,
                  state: getStudentMarkState(stu.id),
                }));
                const enteredCount = allRosterStates.filter(
                  (r) => !r.state.isPending && !r.state.evalNums.isAbsent
                ).length;
                const absentCount = allRosterStates.filter(
                  (r) => r.state.evalNums.isAbsent
                ).length;
                const pendingCount = allRosterStates.filter((r) => r.state.isPending).length;

                return (
                  <>
                    {/* Subject Meta + Actions */}
                    <div className="p-4 sm:p-5 rounded-3xl bg-surface-container-lowest/90 shadow-xs border border-outline-variant/20 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="font-title-lg text-base sm:text-lg font-bold text-on-surface">
                            {currentSubject.name} (Code: {currentSubject.code})
                          </h2>
                          {isRosterLocked && (
                            <span className="px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-900 text-[11px] font-bold">
                              Roster Locked
                            </span>
                          )}
                          {isAssignedToOtherExaminer && (
                            <span className="px-2.5 py-0.5 rounded-full bg-red-100 text-red-800 text-[11px] font-bold">
                              View Only (Assigned to Another Examiner)
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] sm:text-xs text-on-surface-variant font-mono mt-0.5">
                          {currentExam.title} &bull; {assignedClassInfo.className} (
                          {assignedClassInfo.sectionName === 'Common'
                            ? 'All Sections'
                            : assignedClassInfo.sectionName}
                          ) &bull; {formatSubjectGroupsLabel(currentSubject)} &bull; Full:{' '}
                          {currentSubject.totalFullMarks} &bull; Pass:{' '}
                          {currentSubject.totalPassMarks}
                          {[
                            cqActive
                              ? `CQ: ${currentSubject.components.cq.fullMarks}/${currentSubject.components.cq.passMarks}`
                              : null,
                            mcqActive
                              ? `MCQ: ${currentSubject.components.mcq.fullMarks}/${currentSubject.components.mcq.passMarks}`
                              : null,
                            pracActive
                              ? `Practical: ${currentSubject.components.practical.fullMarks}/${currentSubject.components.practical.passMarks}`
                              : null,
                            ctActive && ctConfig
                              ? `CT: ${ctConfig.fullMarks}/${ctConfig.passMarks}${
                                  ctConfig.conversionPercent < 100
                                    ? ` (${ctConfig.conversionPercent}%)`
                                    : ''
                                }`
                              : null,
                            ...activeCustomHeads.map(
                              (c) =>
                                `${c.label}: ${c.fullMarks}/${c.passMarks}${
                                  getEffectiveConversionPercent(c.conversionPercent) < 100
                                    ? ` (${getEffectiveConversionPercent(c.conversionPercent)}%)`
                                    : ''
                                }`
                            ),
                          ]
                            .filter(Boolean)
                            .map((part) => ` • ${part}`)
                            .join('')}
                        </p>
                        <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono mt-2">
                          <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 font-bold">
                            Entered: {enteredCount}
                          </span>
                          <span className="px-2 py-0.5 rounded bg-red-50 text-red-800 font-bold">
                            Absent: {absentCount}
                          </span>
                          <span className="px-2 py-0.5 rounded bg-surface-container text-on-surface-variant font-bold">
                            Pending: {pendingCount}
                          </span>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
                        {pendingCount > 0 && !isEditingDisabled && (
                          <button
                            type="button"
                            onClick={handleMarkPendingAbsent}
                            className="px-3 py-2 rounded-xl bg-red-50 text-red-800 border border-red-200 font-bold text-xs hover:bg-red-100 cursor-pointer"
                          >
                            Mark Pending AB
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={isEditingDisabled}
                          onClick={handleSaveMarks}
                          className="flex-1 md:flex-none px-4 py-2.5 rounded-xl bg-secondary disabled:opacity-50 text-on-secondary font-bold text-xs shadow-sm hover:bg-secondary/90 transition-all cursor-pointer disabled:cursor-not-allowed inline-flex items-center justify-center gap-1.5"
                        >
                          <span className="material-symbols-outlined text-[16px]">save</span>
                          <span>Save Scores</span>
                        </button>
                        <button
                          type="button"
                          disabled={isEditingDisabled}
                          onClick={handleLockMarks}
                          className="px-3.5 py-2.5 rounded-xl bg-surface-container disabled:opacity-50 text-on-surface font-bold text-xs hover:bg-surface-container-high transition-all cursor-pointer disabled:cursor-not-allowed inline-flex items-center gap-1.5"
                        >
                          <span className="material-symbols-outlined text-[16px]">lock</span>
                          <span>{isRosterLocked ? 'Locked' : 'Lock'}</span>
                        </button>
                      </div>
                    </div>

                    {rosterStates.length === 0 ? (
                      <div className="rounded-3xl bg-white p-8 text-center text-xs text-on-surface-variant border border-outline-variant/20">
                        No eligible students found for this selection.
                      </div>
                    ) : (
                      <>
                        {/* MOBILE MARK INPUT CARDS (< md) */}
                        <div className="md:hidden space-y-3">
                          {rosterStates.map(({ stu, state: st }) => {
                            const { draft, isPending, evalNums } = st;
                            const isFourth = stu.optionalFourthSubjectId === currentSubject.id;
                            const evalRes = evaluateSubjectResult(
                              currentSubject,
                              evalNums,
                              isFourth,
                              currentExam
                            );

                            return (
                              <div
                                key={stu.id}
                                className={`rounded-2xl p-4 border space-y-3 transition-colors ${
                                  draft.isAbsent
                                    ? 'bg-red-50/70 border-red-200'
                                    : isPending
                                    ? 'bg-surface-container-lowest border-outline-variant/25'
                                    : 'bg-emerald-50/30 border-emerald-200'
                                }`}
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-2">
                                      <span className="px-2 py-0.5 rounded-lg bg-secondary/10 text-secondary font-mono font-bold text-xs">
                                        Roll #{stu.rollNumber}
                                      </span>
                                      <span className="text-[11px] font-mono text-on-surface-variant truncate">
                                        {stu.systemId}
                                      </span>
                                      {isFourth && (
                                        <span className="text-[10px] font-bold text-primary-container">
                                          · 4th
                                        </span>
                                      )}
                                    </div>
                                    <div className="font-bold text-sm text-on-surface truncate mt-1">
                                      {stu.fullName}
                                    </div>
                                  </div>

                                  <label className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-white border border-red-200 text-red-700 font-bold text-xs shrink-0 cursor-pointer">
                                    <input
                                      type="checkbox"
                                      disabled={isEditingDisabled}
                                      checked={Boolean(draft.isAbsent)}
                                      onChange={(e) => handleToggleAbsent(stu.id, e.target.checked)}
                                      className="w-4 h-4 rounded text-red-600"
                                    />
                                    <span>AB</span>
                                  </label>
                                </div>

                                {!draft.isAbsent ? (
                                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                    {ctActive && ctConfig && (
                                      <div>
                                        <label className="block text-[10px] font-bold uppercase text-amber-900 mb-1">
                                          CT ({ctConfig.fullMarks}
                                          {ctConfig.mode === 'subject' &&
                                          ctConfig.conversionPercent < 100
                                            ? ` · ${ctConfig.conversionPercent}%`
                                            : ''}
                                          )
                                        </label>
                                        <input
                                          type="number"
                                          inputMode="numeric"
                                          min="0"
                                          max={ctConfig.fullMarks}
                                          disabled={isEditingDisabled}
                                          placeholder="—"
                                          value={draft.ct === undefined ? '' : draft.ct}
                                          onChange={(e) =>
                                            handleScoreChange(stu.id, 'ct', e.target.value)
                                          }
                                          className="w-full py-2.5 text-center font-bold font-mono text-sm rounded-xl border border-amber-300 bg-amber-50/40"
                                        />
                                      </div>
                                    )}
                                    {cqActive && (
                                      <div>
                                        <label className="block text-[10px] font-bold uppercase text-on-surface-variant mb-1">
                                          CQ ({currentSubject.components.cq.fullMarks})
                                        </label>
                                        <input
                                          type="number"
                                          inputMode="numeric"
                                          min="0"
                                          max={currentSubject.components.cq.fullMarks}
                                          disabled={isEditingDisabled}
                                          placeholder="—"
                                          value={draft.cq}
                                          onChange={(e) =>
                                            handleScoreChange(stu.id, 'cq', e.target.value)
                                          }
                                          className="w-full py-2.5 text-center font-bold font-mono text-sm rounded-xl border border-outline-variant/40 bg-white"
                                        />
                                      </div>
                                    )}
                                    {mcqActive && (
                                      <div>
                                        <label className="block text-[10px] font-bold uppercase text-on-surface-variant mb-1">
                                          MCQ ({currentSubject.components.mcq.fullMarks})
                                        </label>
                                        <input
                                          type="number"
                                          inputMode="numeric"
                                          min="0"
                                          max={currentSubject.components.mcq.fullMarks}
                                          disabled={isEditingDisabled}
                                          placeholder="—"
                                          value={draft.mcq}
                                          onChange={(e) =>
                                            handleScoreChange(stu.id, 'mcq', e.target.value)
                                          }
                                          className="w-full py-2.5 text-center font-bold font-mono text-sm rounded-xl border border-outline-variant/40 bg-white"
                                        />
                                      </div>
                                    )}
                                    {pracActive && (
                                      <div>
                                        <label className="block text-[10px] font-bold uppercase text-on-surface-variant mb-1">
                                          Prac ({currentSubject.components.practical.fullMarks})
                                        </label>
                                        <input
                                          type="number"
                                          inputMode="numeric"
                                          min="0"
                                          max={currentSubject.components.practical.fullMarks}
                                          disabled={isEditingDisabled}
                                          placeholder="—"
                                          value={draft.practical}
                                          onChange={(e) =>
                                            handleScoreChange(stu.id, 'practical', e.target.value)
                                          }
                                          className="w-full py-2.5 text-center font-bold font-mono text-sm rounded-xl border border-outline-variant/40 bg-white"
                                        />
                                      </div>
                                    )}
                                    {activeCustomHeads.map((c) => (
                                      <div key={c.id}>
                                        <label className="block text-[10px] font-bold uppercase text-indigo-950 mb-1 truncate">
                                          {c.label} ({c.fullMarks})
                                        </label>
                                        <input
                                          type="number"
                                          inputMode="numeric"
                                          min="0"
                                          max={c.fullMarks}
                                          disabled={isEditingDisabled}
                                          placeholder="—"
                                          value={draft.customMarks?.[c.id] ?? ''}
                                          onChange={(e) =>
                                            handleCustomScoreChange(
                                              stu.id,
                                              c.id,
                                              c.fullMarks,
                                              e.target.value
                                            )
                                          }
                                          className="w-full py-2.5 text-center font-bold font-mono text-sm rounded-xl border border-indigo-300 bg-white"
                                        />
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <div className="text-xs font-bold text-red-700 py-1">
                                    Marked Absent (AB)
                                  </div>
                                )}

                                <div className="flex items-center justify-between pt-2 border-t border-outline-variant/15 text-xs">
                                  <span className="font-mono font-bold text-on-surface">
                                    Total:{' '}
                                    {draft.isAbsent ? 'AB' : isPending ? '—' : evalRes.total}
                                  </span>
                                  <div className="flex items-center gap-2">
                                    <span className="font-bold">
                                      {isPending ? '—' : evalRes.letterGrade}
                                    </span>
                                    <span
                                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                        draft.isAbsent
                                          ? 'bg-red-100 text-red-800'
                                          : isPending
                                          ? 'bg-surface-container text-on-surface-variant'
                                          : evalRes.isPassed
                                          ? 'bg-emerald-100 text-emerald-800'
                                          : 'bg-red-100 text-red-800'
                                      }`}
                                    >
                                      {draft.isAbsent
                                        ? 'Absent'
                                        : isPending
                                        ? 'Pending'
                                        : evalRes.isPassed
                                        ? 'Passed'
                                        : 'Failed'}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        {/* DESKTOP SPREADSHEET TABLE (md+) */}
                        <div className="hidden md:block rounded-3xl bg-surface-container-lowest/80 backdrop-blur-2xl shadow-sm p-6 overflow-hidden border border-outline-variant/15">
                          <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse text-xs">
                              <thead>
                                <tr className="bg-surface-container-low text-on-surface-variant">
                                  <th className="py-3 px-3 rounded-l-xl font-semibold">Roll</th>
                                  <th className="py-3 px-3 font-semibold">Candidate Name</th>
                                  <th className="py-3 px-3 font-semibold text-center">Absent?</th>
                                  {ctActive && ctConfig && (
                                    <th className="py-3 px-3 font-semibold text-center bg-amber-500/10 text-amber-900">
                                      CT (Max {ctConfig.fullMarks}
                                      {ctConfig.mode === 'subject' &&
                                      ctConfig.conversionPercent < 100
                                        ? ` · ${ctConfig.conversionPercent}%`
                                        : ''}
                                      )
                                    </th>
                                  )}
                                  {cqActive && (
                                    <th className="py-3 px-3 font-semibold text-center">
                                      CQ (Max {currentSubject.components.cq.fullMarks})
                                    </th>
                                  )}
                                  {mcqActive && (
                                    <th className="py-3 px-3 font-semibold text-center">
                                      MCQ (Max {currentSubject.components.mcq.fullMarks})
                                    </th>
                                  )}
                                  {pracActive && (
                                    <th className="py-3 px-3 font-semibold text-center">
                                      Practical (Max {currentSubject.components.practical.fullMarks})
                                    </th>
                                  )}
                                  {activeCustomHeads.map((c) => {
                                    const conv = getEffectiveConversionPercent(c.conversionPercent);
                                    return (
                                      <th
                                        key={c.id}
                                        className="py-3 px-3 font-semibold text-center bg-indigo-500/10 text-indigo-950"
                                      >
                                        {c.label} (Max {c.fullMarks}
                                        {conv < 100 ? ` · ${conv}%` : ''})
                                      </th>
                                    );
                                  })}
                                  <th className="py-3 px-3 font-semibold text-center">Total</th>
                                  <th className="py-3 px-3 font-semibold text-center">Grade</th>
                                  <th className="py-3 px-3 rounded-r-xl font-semibold text-center">
                                    Status
                                  </th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-outline-variant/10 text-on-surface">
                                {rosterStates.map(({ stu, state: st }, rowIdx) => {
                                  const { draft, isPending, evalNums } = st;
                                  const isFourth =
                                    stu.optionalFourthSubjectId === currentSubject.id;
                                  const evalRes = evaluateSubjectResult(
                                    currentSubject,
                                    evalNums,
                                    isFourth,
                                    currentExam
                                  );

                                  return (
                                    <tr
                                      key={stu.id}
                                      className={`transition-colors ${
                                        draft.isAbsent
                                          ? 'bg-red-50/50 hover:bg-red-50'
                                          : isPending
                                          ? 'hover:bg-surface-container-low/40'
                                          : 'bg-emerald-50/20 hover:bg-emerald-50/40'
                                      }`}
                                    >
                                      <td className="py-3 px-3 font-bold font-mono tabular-nums">
                                        #{stu.rollNumber}
                                      </td>
                                      <td className="py-3 px-3">
                                        <span className="font-semibold block">{stu.fullName}</span>
                                        <span className="text-[10px] text-on-surface-variant font-mono">
                                          {stu.systemId}
                                          {isFourth && (
                                            <span className="ml-1 text-primary font-bold">
                                              · 4th Sub
                                            </span>
                                          )}
                                        </span>
                                      </td>
                                      <td className="py-3 px-3 text-center">
                                        <label className="inline-flex items-center gap-1 cursor-pointer font-bold text-[11px] text-red-700">
                                          <input
                                            type="checkbox"
                                            disabled={isEditingDisabled}
                                            checked={Boolean(draft.isAbsent)}
                                            onChange={(e) =>
                                              handleToggleAbsent(stu.id, e.target.checked)
                                            }
                                            className="w-4 h-4 rounded text-red-600 focus:ring-red-500 cursor-pointer"
                                          />
                                          <span>AB</span>
                                        </label>
                                      </td>

                                      {ctActive && ctConfig && (
                                        <td className="py-2 px-3 text-center bg-amber-500/5">
                                          {draft.isAbsent ? (
                                            <span className="font-bold font-mono text-red-600 text-xs">
                                              AB
                                            </span>
                                          ) : (
                                            <input
                                              type="number"
                                              data-mark-cell={`teacher-ct-${rowIdx}`}
                                              min="0"
                                              max={ctConfig.fullMarks}
                                              disabled={isEditingDisabled}
                                              placeholder="—"
                                              value={draft.ct === undefined ? '' : draft.ct}
                                              onChange={(e) =>
                                                handleScoreChange(stu.id, 'ct', e.target.value)
                                              }
                                              onKeyDown={(e) => handleMarkKeyDown(e, rowIdx, 'ct')}
                                              className="w-16 px-2 py-1.5 text-center font-bold font-mono rounded-lg border border-amber-300 bg-amber-50/50 text-xs placeholder:text-slate-400"
                                            />
                                          )}
                                        </td>
                                      )}

                                      {cqActive && (
                                        <td className="py-2 px-3 text-center">
                                          {draft.isAbsent ? (
                                            <span className="font-bold font-mono text-red-600 text-xs">
                                              AB
                                            </span>
                                          ) : (
                                            <input
                                              type="number"
                                              data-mark-cell={`teacher-cq-${rowIdx}`}
                                              min="0"
                                              max={currentSubject.components.cq.fullMarks}
                                              disabled={isEditingDisabled}
                                              placeholder="—"
                                              value={draft.cq}
                                              onChange={(e) =>
                                                handleScoreChange(stu.id, 'cq', e.target.value)
                                              }
                                              onKeyDown={(e) => handleMarkKeyDown(e, rowIdx, 'cq')}
                                              className="w-16 px-2 py-1.5 text-center font-bold font-mono rounded-lg border border-outline-variant/30 bg-white disabled:bg-surface-container-low text-xs placeholder:text-slate-400"
                                            />
                                          )}
                                        </td>
                                      )}

                                      {mcqActive && (
                                        <td className="py-2 px-3 text-center">
                                          {draft.isAbsent ? (
                                            <span className="font-bold font-mono text-red-600 text-xs">
                                              AB
                                            </span>
                                          ) : (
                                            <input
                                              type="number"
                                              data-mark-cell={`teacher-mcq-${rowIdx}`}
                                              min="0"
                                              max={currentSubject.components.mcq.fullMarks}
                                              disabled={isEditingDisabled}
                                              placeholder="—"
                                              value={draft.mcq}
                                              onChange={(e) =>
                                                handleScoreChange(stu.id, 'mcq', e.target.value)
                                              }
                                              onKeyDown={(e) => handleMarkKeyDown(e, rowIdx, 'mcq')}
                                              className="w-16 px-2 py-1.5 text-center font-bold font-mono rounded-lg border border-outline-variant/30 bg-white disabled:bg-surface-container-low text-xs placeholder:text-slate-400"
                                            />
                                          )}
                                        </td>
                                      )}

                                      {pracActive && (
                                        <td className="py-2 px-3 text-center">
                                          {draft.isAbsent ? (
                                            <span className="font-bold font-mono text-red-600 text-xs">
                                              AB
                                            </span>
                                          ) : (
                                            <input
                                              type="number"
                                              data-mark-cell={`teacher-practical-${rowIdx}`}
                                              min="0"
                                              max={currentSubject.components.practical.fullMarks}
                                              disabled={isEditingDisabled}
                                              placeholder="—"
                                              value={draft.practical}
                                              onChange={(e) =>
                                                handleScoreChange(stu.id, 'practical', e.target.value)
                                              }
                                              onKeyDown={(e) =>
                                                handleMarkKeyDown(e, rowIdx, 'practical')
                                              }
                                              className="w-16 px-2 py-1.5 text-center font-bold font-mono rounded-lg border border-outline-variant/30 bg-white disabled:bg-surface-container-low text-xs placeholder:text-slate-400"
                                            />
                                          )}
                                        </td>
                                      )}

                                      {activeCustomHeads.map((c) => (
                                        <td key={c.id} className="py-2 px-3 text-center bg-indigo-500/5">
                                          {draft.isAbsent ? (
                                            <span className="font-bold font-mono text-red-600 text-xs">
                                              AB
                                            </span>
                                          ) : (
                                            <input
                                              type="number"
                                              data-mark-cell={`teacher-custom-${c.id}-${rowIdx}`}
                                              min="0"
                                              max={c.fullMarks}
                                              disabled={isEditingDisabled}
                                              placeholder="—"
                                              value={draft.customMarks?.[c.id] ?? ''}
                                              onChange={(e) =>
                                                handleCustomScoreChange(
                                                  stu.id,
                                                  c.id,
                                                  c.fullMarks,
                                                  e.target.value
                                                )
                                              }
                                              onKeyDown={(e) =>
                                                handleMarkKeyDown(e, rowIdx, `custom-${c.id}`)
                                              }
                                              className="w-16 px-2 py-1.5 text-center font-bold font-mono rounded-lg border border-indigo-300 bg-white disabled:bg-surface-container-low text-xs placeholder:text-slate-400"
                                            />
                                          )}
                                        </td>
                                      ))}

                                      <td className="py-3 px-3 text-center font-bold font-mono text-sm">
                                        {draft.isAbsent ? (
                                          <span className="text-red-700 font-bold">AB</span>
                                        ) : isPending ? (
                                          <span className="text-on-surface-variant">—</span>
                                        ) : (
                                          evalRes.total
                                        )}
                                      </td>
                                      <td className="py-3 px-3 text-center font-bold">
                                        {isPending ? (
                                          <span className="text-on-surface-variant">—</span>
                                        ) : (
                                          <span
                                            className={
                                              draft.isAbsent ? 'text-red-700 font-extrabold' : ''
                                            }
                                          >
                                            {evalRes.letterGrade}
                                          </span>
                                        )}
                                      </td>
                                      <td className="py-3 px-3 text-center">
                                        <span
                                          className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                                            draft.isAbsent
                                              ? 'bg-red-100 text-red-800'
                                              : isPending
                                              ? 'bg-surface-container text-on-surface-variant'
                                              : evalRes.isPassed
                                              ? 'bg-emerald-50 text-emerald-800'
                                              : 'bg-red-50 text-red-800'
                                          }`}
                                        >
                                          {draft.isAbsent
                                            ? 'Absent (AB)'
                                            : isPending
                                            ? 'Pending'
                                            : evalRes.isPassed
                                            ? 'Passed'
                                            : 'Failed'}
                                        </span>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </>
                    )}
                  </>
                );
              })()
            )}
          </div>
        )}

        {/* TAB 2: CLASS ROUTINE */}
        {portalView === 'routine' && (
          <div className="space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
              <div>
                <span className="font-label-sm text-label-sm uppercase tracking-wider text-secondary font-semibold">
                  Weekly Schedule
                </span>
                <h1 className="font-headline-lg text-xl sm:text-2xl text-on-surface font-bold">
                  Class Routine &amp; My Periods
                </h1>
              </div>

              <div className="flex flex-wrap items-center gap-2 text-xs">
                <div className="inline-flex p-1 rounded-xl bg-surface-container-low border border-outline-variant/30">
                  <button
                    type="button"
                    onClick={() => setRoutineScope('my')}
                    className={`px-3 py-1.5 rounded-lg font-bold cursor-pointer ${
                      routineScope === 'my'
                        ? 'bg-secondary text-on-secondary shadow-xs'
                        : 'text-on-surface-variant'
                    }`}
                  >
                    My Periods
                  </button>
                  <button
                    type="button"
                    onClick={() => setRoutineScope('all')}
                    className={`px-3 py-1.5 rounded-lg font-bold cursor-pointer ${
                      routineScope === 'all'
                        ? 'bg-secondary text-on-secondary shadow-xs'
                        : 'text-on-surface-variant'
                    }`}
                  >
                    Full Routine
                  </button>
                </div>

                <select
                  value={routineClassFilter}
                  onChange={(e) => setRoutineClassFilter(e.target.value)}
                  className="px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 font-semibold"
                >
                  <option value="ALL">All Classes</option>
                  {academicClasses.map((c) => (
                    <option key={c.id} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                </select>

                <select
                  value={routineShiftFilter}
                  onChange={(e) =>
                    setRoutineShiftFilter(e.target.value as 'ALL' | ShiftType)
                  }
                  className="px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 font-semibold"
                >
                  <option value="ALL">All Shifts</option>
                  <option value="Morning">Morning</option>
                  <option value="Day">Day</option>
                </select>
              </div>
            </div>

            {filteredRoutines.length === 0 ? (
              <div className="rounded-3xl bg-white p-8 text-center text-xs text-on-surface-variant border border-outline-variant/25">
                {routineScope === 'my'
                  ? 'No routine periods match your name yet. Switch to "Full Routine" to inspect all class timetables.'
                  : 'No class routines published yet.'}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredRoutines.map((r) => (
                  <div
                    key={r.id}
                    className="rounded-3xl bg-surface-container-lowest border border-outline-variant/25 p-5 space-y-3"
                  >
                    <div className="flex items-center justify-between gap-2 pb-2 border-b border-outline-variant/15">
                      <div>
                        <span className="text-xs font-bold text-secondary uppercase tracking-wider">
                          {r.day}
                        </span>
                        <h3 className="text-sm font-bold text-on-surface">
                          {r.className} · {r.sectionName} ({r.shift} Shift)
                        </h3>
                      </div>
                      {r.group && r.group !== 'All' && (
                        <span className="px-2 py-0.5 rounded-md bg-primary-fixed/50 text-primary-container text-[10px] font-bold">
                          {r.group}
                        </span>
                      )}
                    </div>

                    <div className="space-y-2 text-xs">
                      {r.periods
                        .filter((p) => (routineScope === 'my' ? periodMatchesTeacher(p) : true))
                        .map((p, idx) => {
                          const isMine = periodMatchesTeacher(p);
                          return (
                            <div
                              key={`${p.period}-${idx}`}
                              className={`p-3 rounded-2xl border flex items-center justify-between gap-3 ${
                                p.isBreak
                                  ? 'bg-surface-container-low/50 border-outline-variant/15 text-on-surface-variant'
                                  : isMine
                                  ? 'bg-secondary/10 border-secondary/30'
                                  : 'bg-white border-outline-variant/20'
                              }`}
                            >
                              <div className="min-w-0">
                                <div className="font-bold text-on-surface truncate">
                                  {p.isBreak ? 'Tiffin / Break' : p.subjectName}
                                </div>
                                <div className="text-[11px] text-on-surface-variant truncate">
                                  {p.teacherName}
                                  {p.room ? ` · Room ${p.room}` : ''}
                                </div>
                              </div>
                              <div className="text-right shrink-0 font-mono">
                                <span className="block font-bold text-on-surface">
                                  {p.period}
                                </span>
                                <span className="text-[10px] text-on-surface-variant">
                                  {p.time}
                                  {p.endTime ? `–${p.endTime}` : ''}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Examination Routine & Paper Inspector Duties */}
            {currentExam && (currentExam.examRoutine || []).length > 0 && (
              <div className="rounded-3xl bg-surface-container-lowest border border-outline-variant/25 p-5 sm:p-6 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-outline-variant/15">
                  <div>
                    <span className="text-[11px] font-bold uppercase tracking-wider text-primary-container">
                      Official Examination Schedule
                    </span>
                    <h2 className="text-base font-bold text-on-surface">
                      {currentExam.title} — Routine &amp; Assigned Examiners
                    </h2>
                  </div>
                  <select
                    value={currentExam.id}
                    onChange={(e) => {
                      setSelectedExamId(e.target.value);
                      setSelectedClassIdx(0);
                    }}
                    className="px-3 py-1.5 rounded-xl bg-surface-container-low border border-outline-variant/30 text-xs font-bold"
                  >
                    {exams.map((ex) => (
                      <option key={ex.id} value={ex.id}>
                        {ex.title} ({ex.academicYear})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="overflow-x-auto rounded-2xl border border-outline-variant/20">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-surface-container-low text-on-surface-variant border-b border-outline-variant/20">
                        <th className="py-2.5 px-3 font-semibold">Exam Date &amp; Time</th>
                        <th className="py-2.5 px-3 font-semibold">Class · Section</th>
                        <th className="py-2.5 px-3 font-semibold">Subject</th>
                        <th className="py-2.5 px-3 font-semibold">Room</th>
                        <th className="py-2.5 px-3 font-semibold">Assigned Inspector</th>
                        <th className="py-2.5 px-3 font-semibold">Entry Deadline</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-outline-variant/15">
                      {(currentExam.examRoutine || []).map((slot) => {
                        const inspector = teachers.find((t) => t.id === slot.inspectorTeacherId);
                        const isMine = slot.inspectorTeacherId === currentTeacher.id;
                        return (
                          <tr
                            key={slot.id}
                            className={isMine ? 'bg-secondary/10 font-semibold' : 'bg-white'}
                          >
                            <td className="py-2.5 px-3 font-mono tabular-nums">
                              <div className="font-bold text-on-surface">{formatDateDDMMYYYY(slot.date)}</div>
                              <div className="text-[10px] text-on-surface-variant">{slot.time}</div>
                            </td>
                            <td className="py-2.5 px-3">
                              {slot.className}
                              {slot.sectionName ? ` · ${slot.sectionName === 'Common' ? 'All Sections' : `Sec ${slot.sectionName}`}` : ''}
                            </td>
                            <td className="py-2.5 px-3 font-bold text-on-surface">
                              {slot.subjectName}
                            </td>
                            <td className="py-2.5 px-3 text-on-surface-variant">
                              {slot.room || '—'}
                            </td>
                            <td className="py-2.5 px-3">
                              <span className={isMine ? 'text-secondary font-bold' : 'text-on-surface'}>
                                {inspector?.name || 'Assigned Faculty'}
                                {isMine ? ' (You)' : ''}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 font-mono font-bold text-primary-container">
                              {formatDateDDMMYYYY(slot.entryDeadline)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 3: NOTICES & CALENDAR */}
        {portalView === 'notices' && (
          <div className="space-y-6">
            <div className="rounded-3xl bg-surface-container-lowest/90 border border-outline-variant/25 p-5 sm:p-6 space-y-4">
              <div>
                <h2 className="font-title-lg text-base font-bold text-on-surface">
                  Institutional Notice Board
                </h2>
                <p className="text-xs text-on-surface-variant">
                  Latest official announcements, examination circulars, and administrative notices.
                </p>
              </div>
              {notices.length === 0 ? (
                <p className="text-xs text-on-surface-variant">No notices posted yet.</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {notices.map((n) => (
                    <div
                      key={n.id}
                      className="p-4 rounded-2xl bg-white border border-outline-variant/25 space-y-1.5"
                    >
                      <div className="flex items-center justify-between gap-2 text-[10px] font-bold uppercase">
                        <span
                          className={`px-2 py-0.5 rounded-full ${
                            n.badge === 'Exam' || n.badge === 'New'
                              ? 'bg-red-100 text-red-800'
                              : 'bg-secondary/10 text-secondary'
                          }`}
                        >
                          {n.badge || n.category || 'Notice'}
                        </span>
                        <span className="font-mono text-on-surface-variant">{n.publishDate}</span>
                      </div>
                      <h3 className="font-bold text-xs text-on-surface">{n.title}</h3>
                      {n.description && (
                        <p className="text-[11px] text-on-surface-variant">{n.description}</p>
                      )}
                      {n.attachmentUrl && (
                        <a
                          href={n.attachmentUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[11px] font-bold text-primary-container hover:underline pt-1"
                        >
                          <span className="material-symbols-outlined text-[14px]">
                            attach_file
                          </span>
                          <span>View Attachment</span>
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-3xl bg-surface-container-lowest/85 border border-outline-variant/20 p-5 sm:p-6 space-y-4">
              <div>
                <h2 className="font-title-lg text-base font-bold text-on-surface">
                  Whole-Year Academic Calendar ({formatInstituteSessionBanner(instituteRules)})
                </h2>
                <p className="text-xs text-on-surface-variant">
                  Working days:{' '}
                  {(
                    instituteRules?.workingDays || [
                      'Sunday',
                      'Monday',
                      'Tuesday',
                      'Wednesday',
                      'Thursday',
                    ]
                  ).join(', ')}{' '}
                  &bull; Min attendance: {instituteRules?.minAttendancePercent ?? 75}%
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {events
                  .filter((ev) => ev.visibility !== 'Admin Only')
                  .sort((a, b) => (a.startDate || a.id).localeCompare(b.startDate || b.id))
                  .map((ev) => (
                    <div
                      key={ev.id}
                      className="p-4 rounded-2xl bg-white border border-outline-variant/25 space-y-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="px-2.5 py-1 rounded-xl bg-secondary/10 text-secondary text-xs font-bold">
                          {ev.day} {ev.month}
                        </span>
                        <span className="px-2 py-0.5 rounded-full bg-surface-container text-[10px] font-bold uppercase text-on-surface-variant">
                          {ev.category || ev.type}
                        </span>
                      </div>
                      <div className="font-bold text-xs text-on-surface">{ev.title}</div>
                      {ev.description && (
                        <p className="text-[11px] text-on-surface-variant">{ev.description}</p>
                      )}
                      <div className="text-[10px] font-mono text-on-surface-variant pt-1">
                        {ev.startDate && ev.endDate && ev.startDate !== ev.endDate
                          ? `${formatDateDDMMYYYY(ev.startDate)} to ${formatDateDDMMYYYY(ev.endDate)}`
                          : ev.startDate
                          ? formatDateDDMMYYYY(ev.startDate)
                          : ev.time}{' '}
                        &bull; {ev.location}
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: PROFILE UPDATE & CREDENTIALS */}
        {portalView === 'profile' && (
          <TeacherProfilePanel
            key={`${currentTeacher.id}:${currentTeacher.name}:${currentTeacher.avatarUrl || ''}:${currentTeacher.signatureUrl || ''}`}
            teacher={currentTeacher}
            onSaveProfile={(updates) => updateOwnTeacherProfile(currentTeacher.id, updates)}
            onOpenPasswordModal={() => {
              setPassMsg(null);
              setShowPasswordModal(true);
            }}
          />
        )}
      </main>

      {/* Mobile Bottom App Navigation Bar */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur-xl border-t border-outline-variant/25 px-2 py-1.5 grid grid-cols-4 gap-1 shadow-[0_-8px_24px_rgba(0,0,0,0.06)]">
        {navItems.map((item) => {
          const active = portalView === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setPortalView(item.id)}
              className={`flex flex-col items-center justify-center py-1.5 rounded-xl text-[10px] font-bold transition-colors cursor-pointer ${
                active
                  ? 'text-secondary bg-secondary/10'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              <span className="material-symbols-outlined text-[20px]">{item.icon}</span>
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Change Password Modal */}
      {showPasswordModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-outline-variant/20 pb-3">
              <h3 className="text-base font-bold text-on-surface">Change Login PIN / Password</h3>
              <button
                type="button"
                onClick={() => setShowPasswordModal(false)}
                className="w-8 h-8 rounded-full bg-surface-container flex items-center justify-center cursor-pointer"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            {passMsg && (
              <div
                className={`p-3 rounded-xl text-xs font-semibold ${
                  passMsg.type === 'success'
                    ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                    : 'bg-error-container/50 text-on-error-container'
                }`}
              >
                {passMsg.text}
              </div>
            )}

            <form onSubmit={handleUpdatePassword} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-on-surface-variant mb-1">
                  Current PIN / Password *
                </label>
                <input
                  type="password"
                  required
                  value={curPass}
                  onChange={(e) => setCurPass(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 text-sm"
                />
              </div>
              <div>
                <label className="block font-semibold text-on-surface-variant mb-1">
                  New PIN / Password (6 digits or min 6 characters) *
                </label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={newPass}
                  onChange={(e) => setNewPass(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 text-sm"
                />
              </div>
              <div>
                <label className="block font-semibold text-on-surface-variant mb-1">
                  Confirm New PIN / Password *
                </label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={confirmPass}
                  onChange={(e) => setConfirmPass(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 text-sm"
                />
              </div>
              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowPasswordModal(false)}
                  className="px-4 py-2 rounded-xl text-on-surface-variant hover:bg-surface-container font-semibold cursor-pointer"
                >
                  Close
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-secondary text-on-secondary font-bold cursor-pointer"
                >
                  Save PIN
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
