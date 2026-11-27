'use client';

import { useState } from 'react';
import { useERPStore } from '@/lib/store';
import { GenderType, InstituteRules, ShiftType, Teacher } from '@/lib/types';
import {
  cleanTeacherIdPrefix,
  formatTeacherOrStaffId,
  generateSixDigitPinValue,
  getNextUniqueTeacherOrStaffId,
  isTeachingStaff,
  normalizeTeacherCategory,
  sortTeachersBySeniority,
} from '@/lib/teacher-helpers';
import ImageCropUpload from './ImageCropUpload';

interface StaffFormState {
  staffCategory: 'Teacher' | 'Staff';
  rankOrder: number;
  employeeId: string;
  name: string;
  banglaName: string;
  designation: string;
  department: string;
  mpoIndexNo: string;
  qualification: string;
  joiningDate: string;
  employmentType: 'Permanent' | 'Contractual' | 'Guest';
  shift: ShiftType;
  gender: GenderType;
  dateOfBirth: string;
  bloodGroup: string;
  nidNumber: string;
  email: string;
  phone: string;
  emergencyContact: string;
  presentAddress: string;
  permanentAddress: string;
  password: string;
  avatarUrl: string;
  avatarPublicId: string;
  signatureUrl: string;
  signaturePublicId: string;
}

const createEmptyStaffForm = (
  teachers: Teacher[],
  rules?: Pick<InstituteRules, 'teacherIdPrefix' | 'staffIdPrefix'>,
  category: 'Teacher' | 'Staff' = 'Teacher'
): StaffFormState => {
  const { employeeId, rankOrder } = getNextUniqueTeacherOrStaffId(
    teachers,
    category,
    undefined,
    rules
  );
  return {
    staffCategory: category,
    rankOrder,
    employeeId,
    name: '',
    banglaName: '',
    designation: category === 'Teacher' ? 'Lecturer' : 'Office Staff',
    department: '',
    mpoIndexNo: '',
    qualification: '',
    joiningDate: new Date().toISOString().slice(0, 10),
    employmentType: 'Permanent',
    shift: 'Morning',
    gender: 'Male',
    dateOfBirth: '1988-01-01',
    bloodGroup: 'B+',
    nidNumber: '',
    email: '',
    phone: '+880 1711-000000',
    emergencyContact: '',
    presentAddress: '',
    permanentAddress: '',
    password: generateSixDigitPinValue(),
    avatarUrl: '',
    avatarPublicId: '',
    signatureUrl: '',
    signaturePublicId: '',
  };
};

const teacherToForm = (
  t: Teacher,
  teachers: Teacher[],
  rules?: Pick<InstituteRules, 'teacherIdPrefix' | 'staffIdPrefix'>
): StaffFormState => {
  const cat = normalizeTeacherCategory(t.staffCategory);
  const rank =
    typeof t.rankOrder === 'number' && t.rankOrder > 0
      ? t.rankOrder
      : getNextUniqueTeacherOrStaffId(teachers, cat, undefined, rules, t.id).rankOrder;

  return {
    staffCategory: cat,
    rankOrder: rank,
    employeeId: t.employeeId || formatTeacherOrStaffId(cat, rank, rules),
    name: t.name,
    banglaName: t.banglaName || '',
    designation: t.designation,
    department: t.department || '',
    mpoIndexNo: t.mpoIndexNo || '',
    qualification: t.qualification || '',
    joiningDate: t.joiningDate || '',
    employmentType: t.employmentType || 'Permanent',
    shift: t.shift || 'Morning',
    gender: t.gender || 'Male',
    dateOfBirth: t.dateOfBirth || '',
    bloodGroup: t.bloodGroup || 'B+',
    nidNumber: t.nidNumber || '',
    email: t.email || '',
    phone: t.phone || '',
    emergencyContact: t.emergencyContact || '',
    presentAddress: t.presentAddress || '',
    permanentAddress: t.permanentAddress || '',
    password: '',
    avatarUrl: t.avatarUrl || '',
    avatarPublicId: t.avatarPublicId || '',
    signatureUrl: t.signatureUrl || '',
    signaturePublicId: t.signaturePublicId || '',
  };
};

export default function TeachersTab() {
  const { isHydrated } = useERPStore();
  return <TeachersTabInner key={isHydrated ? 'hydrated' : 'ssr'} />;
}

function TeachersTabInner() {
  const { state, addTeacher, updateTeacher, deleteTeacher, updateInstituteRules } = useERPStore();
  const { teachers, exams, cmsConfig, instituteRules } = state;

  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'All' | 'Teacher' | 'Staff'>('All');
  const [viewMode, setViewMode] = useState<'directory' | 'add' | 'edit'>('directory');
  const [editingTeacherId, setEditingTeacherId] = useState<string | null>(null);
  const [idAutoSync, setIdAutoSync] = useState(true);
  const [formData, setFormData] = useState<StaffFormState>(() =>
    createEmptyStaffForm(teachers, instituteRules)
  );
  const [formError, setFormError] = useState<string | null>(null);

  const [viewingStaff, setViewingStaff] = useState<Teacher | null>(null);
  const [visiblePins, setVisiblePins] = useState<Record<string, boolean>>({});
  const [resetTargetId, setResetTargetId] = useState<string | null>(null);
  const [resetPasswordValue, setResetPasswordValue] = useState('');
  const [resetNotice, setResetNotice] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  // Prefix configuration modal
  const [showPrefixModal, setShowPrefixModal] = useState(false);
  const [teacherPrefixInput, setTeacherPrefixInput] = useState(
    cleanTeacherIdPrefix(instituteRules?.teacherIdPrefix, 'RHHSTID')
  );
  const [staffPrefixInput, setStaffPrefixInput] = useState(
    cleanTeacherIdPrefix(instituteRules?.staffIdPrefix, 'RHHSSID')
  );

  const showToast = (msg: string) => {
    setFeedback(msg);
    setTimeout(() => setFeedback(null), 3500);
  };

  const togglePinVisibility = (id: string) => {
    setVisiblePins((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const getExamAssignmentCount = (teacher: Teacher) => {
    const examIds = new Set<string>();
    for (const ex of exams) {
      for (const a of ex.examinerAssignments || []) {
        if (a.teacherId === teacher.id) {
          examIds.add(`${ex.id}:${a.className}:${a.sectionName}:${a.subjectId}`);
        }
      }
    }
    if (examIds.size > 0) return examIds.size;
    return teacher.assignedClasses?.length || 0;
  };

  const counts = {
    All: teachers.length,
    Teacher: teachers.filter((t) => isTeachingStaff(t)).length,
    Staff: teachers.filter((t) => !isTeachingStaff(t)).length,
  };

  const filteredTeachers = sortTeachersBySeniority(
    teachers.filter((t) => {
      const cat = normalizeTeacherCategory(t.staffCategory);
      const matchesCat = categoryFilter === 'All' || cat === categoryFilter;
      const q = searchTerm.trim().toLowerCase();
      const matchesSearch =
        !q ||
        t.name.toLowerCase().includes(q) ||
        (t.banglaName || '').toLowerCase().includes(q) ||
        (t.department || '').toLowerCase().includes(q) ||
        t.designation.toLowerCase().includes(q) ||
        (t.employeeId || '').toLowerCase().includes(q) ||
        (t.mpoIndexNo || '').toLowerCase().includes(q);
      return matchesCat && matchesSearch;
    })
  );

  const openAddPage = () => {
    setFormData(createEmptyStaffForm(teachers, instituteRules, 'Teacher'));
    setEditingTeacherId(null);
    setIdAutoSync(true);
    setFormError(null);
    setViewMode('add');
  };

  const openEditPage = (teacher: Teacher) => {
    setFormData(teacherToForm(teacher, teachers, instituteRules));
    setEditingTeacherId(teacher.id);
    setIdAutoSync(false);
    setFormError(null);
    setViewMode('edit');
  };

  const handleSaveForm = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!formData.name.trim()) {
      setFormError('Name in English is required.');
      return;
    }
    const desiredId = formData.employeeId.trim();
    if (!desiredId) {
      setFormError('Teacher / Staff ID is required.');
      return;
    }

    const duplicateId = teachers.some(
      (t) =>
        t.id !== editingTeacherId &&
        (t.employeeId || '').trim().toLowerCase() === desiredId.toLowerCase()
    );
    if (duplicateId) {
      setFormError(`Teacher / Staff ID "${desiredId}" is already assigned to another record.`);
      return;
    }

    const slug =
      formData.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '.')
        .replace(/^\.+|\.+$/g, '') || 'staff';
    const domain = cmsConfig.email?.split('@')[1] || 'aethelgard.edu';
    const numericRank = Math.max(1, Math.floor(Number(formData.rankOrder) || 1));

    const basePayload = {
      staffCategory: formData.staffCategory,
      rankOrder: numericRank,
      employeeId: desiredId,
      name: formData.name.trim(),
      banglaName: formData.banglaName.trim() || undefined,
      designation: formData.designation.trim() || (formData.staffCategory === 'Teacher' ? 'Assistant Teacher' : 'Office Staff'),
      department: formData.department.trim(),
      mpoIndexNo: formData.mpoIndexNo.trim() || undefined,
      qualification: formData.qualification.trim() || undefined,
      joiningDate: formData.joiningDate || undefined,
      employmentType: formData.employmentType,
      shift: formData.shift,
      gender: formData.gender,
      dateOfBirth: formData.dateOfBirth || undefined,
      bloodGroup: formData.bloodGroup.trim() || undefined,
      nidNumber: formData.nidNumber.trim() || undefined,
      email: formData.email.trim() || `${slug}@${domain}`,
      phone: formData.phone.trim(),
      emergencyContact: formData.emergencyContact.trim() || undefined,
      presentAddress: formData.presentAddress.trim() || undefined,
      permanentAddress: formData.permanentAddress.trim() || undefined,
      avatarUrl: formData.avatarUrl.trim(),
      avatarPublicId: formData.avatarUrl.trim() ? formData.avatarPublicId || undefined : '',
      signatureUrl: formData.signatureUrl.trim(),
      signaturePublicId: formData.signatureUrl.trim() ? formData.signaturePublicId || undefined : '',
    };

    if (viewMode === 'edit' && editingTeacherId) {
      const updatePayload: Partial<Teacher> = {
        ...basePayload,
        ...(formData.password.trim() ? { password: formData.password.trim() } : {}),
      };
      updateTeacher(editingTeacherId, updatePayload);
      showToast(`Updated HR dossier for ${basePayload.name} (${basePayload.employeeId}).`);
    } else {
      const pin = formData.password.trim() || generateSixDigitPinValue();
      addTeacher({
        ...basePayload,
        password: pin,
        assignedClasses: [],
      });
      showToast(`Added ${basePayload.name} (${basePayload.employeeId}) with Portal PIN ${pin}.`);
    }
    setViewMode('directory');
    setEditingTeacherId(null);
  };

  const editingTeacher = editingTeacherId
    ? teachers.find((t) => t.id === editingTeacherId) || null
    : null;

  // --- FULL-PAGE ADD / EDIT STAFF FORM ---
  if (viewMode === 'add' || viewMode === 'edit') {
    return (
      <div className="flex flex-col w-full space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-outline-variant/20">
          <div>
            <button
              type="button"
              onClick={() => {
                setViewMode('directory');
                setEditingTeacherId(null);
              }}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary-container hover:underline mb-1 cursor-pointer"
            >
              <span className="material-symbols-outlined text-[16px]">arrow_back</span>
              Back to Teacher &amp; Staff Directory
            </button>
            <h1 className="font-headline-lg text-headline-lg text-on-surface tracking-tight font-bold">
              {viewMode === 'edit'
                ? `Edit HR Profile — ${formData.name}`
                : 'Add New Teacher / Staff Member'}
            </h1>
            <p className="text-xs text-on-surface-variant mt-0.5">
              Auto-crop portrait photo &amp; specimen signature, assign seniority rank &amp; category ID ({cleanTeacherIdPrefix(instituteRules?.teacherIdPrefix, 'RHHSTID')}1 / {cleanTeacherIdPrefix(instituteRules?.staffIdPrefix, 'RHHSSID')}001), and generate 6-digit login PIN.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                setViewMode('directory');
                setEditingTeacherId(null);
              }}
              className="px-4 py-2 rounded-xl bg-surface-container-low hover:bg-surface-container text-xs font-semibold cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="hr-staff-form"
              className="px-5 py-2.5 rounded-xl bg-primary-container hover:bg-primary text-on-primary text-xs font-bold shadow-sm cursor-pointer"
            >
              {viewMode === 'edit' ? 'Save HR Changes' : 'Save Teacher / Staff'}
            </button>
          </div>
        </div>

        {formError && (
          <div className="p-3.5 rounded-xl bg-error-container/40 border border-error/30 text-error text-xs font-semibold flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px]">error</span>
            <span>{formError}</span>
          </div>
        )}

        <form id="hr-staff-form" onSubmit={handleSaveForm} className="space-y-6 text-xs">
          {/* Section 1: Portrait Photo Autocrop & Specimen Signature Autocrop */}
          <div className="rounded-2xl bg-surface-container-lowest border border-outline-variant/25 p-6 space-y-5">
            <div className="border-b border-outline-variant/15 pb-2.5">
              <h2 className="text-sm font-bold text-on-surface">
                1. Portrait Photo &amp; Official Signature (Auto-Crop)
              </h2>
              <p className="text-[11px] text-on-surface-variant">
                Select any photo or scanned signature to crop to exact institutional dimensions before upload.
              </p>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <ImageCropUpload
                mode="passport"
                label="Teacher / Staff Portrait Photo *"
                value={formData.avatarUrl}
                publicId={formData.avatarPublicId}
                folder="erp/teachers/avatars"
                onChangeMedia={({ url, publicId }) =>
                  setFormData((prev) => ({
                    ...prev,
                    avatarUrl: url,
                    avatarPublicId: publicId ?? (url.trim() ? prev.avatarPublicId : ''),
                  }))
                }
                buttonLabel="Upload & Auto-Crop Photo"
                helperText="Locked 35:45 passport portrait crop (420×540 px)."
              />
              <ImageCropUpload
                mode="signature"
                label="Official Specimen Signature (Optional)"
                value={formData.signatureUrl}
                publicId={formData.signaturePublicId}
                folder="erp/teachers/signatures"
                onChangeMedia={({ url, publicId }) =>
                  setFormData((prev) => ({
                    ...prev,
                    signatureUrl: url,
                    signaturePublicId: publicId ?? (url.trim() ? prev.signaturePublicId : ''),
                  }))
                }
                buttonLabel="Upload & Auto-Crop Signature"
                placeholder="https://res.cloudinary.com/... or crop scanned PNG signature"
                helperText="Locked 3:1 wide signature crop (480×160 px) for Marksheets & Certificates."
              />
            </div>
          </div>

          {/* Section 2: Category, Seniority ID, Bilingual Name, Designation & PIN */}
          <div className="rounded-2xl bg-surface-container-lowest border border-outline-variant/25 p-6 space-y-4">
            <h2 className="text-sm font-bold text-on-surface border-b border-outline-variant/15 pb-2.5">
              2. Category, Seniority ID, Designation &amp; Portal Credentials
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="block font-semibold text-on-surface-variant uppercase mb-1">
                  Category *
                </label>
                <select
                  value={formData.staffCategory}
                  onChange={(e) => {
                    const nextCat = e.target.value as 'Teacher' | 'Staff';
                    const nextAuto = getNextUniqueTeacherOrStaffId(
                      teachers,
                      nextCat,
                      undefined,
                      instituteRules,
                      editingTeacherId || undefined
                    );
                    setFormData((prev) => ({
                      ...prev,
                      staffCategory: nextCat,
                      rankOrder: viewMode === 'add' ? nextAuto.rankOrder : prev.rankOrder,
                      employeeId: idAutoSync
                        ? formatTeacherOrStaffId(
                            nextCat,
                            viewMode === 'add' ? nextAuto.rankOrder : prev.rankOrder,
                            instituteRules
                          )
                        : prev.employeeId,
                      designation:
                        nextCat === 'Staff' && prev.designation === 'Lecturer'
                          ? 'Office Staff'
                          : nextCat === 'Teacher' && prev.designation === 'Office Staff'
                          ? 'Lecturer'
                          : prev.designation,
                    }));
                  }}
                  className="w-full px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 text-sm font-semibold"
                >
                  <option value="Teacher">Teacher</option>
                  <option value="Staff">Staff</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-on-surface-variant uppercase mb-1">
                  Seniority Rank Order *
                </label>
                <input
                  type="number"
                  min={1}
                  required
                  value={formData.rankOrder}
                  onChange={(e) => {
                    const parsed = Math.max(1, parseInt(e.target.value || '1', 10) || 1);
                    setFormData((prev) => ({
                      ...prev,
                      rankOrder: parsed,
                      employeeId: idAutoSync
                        ? formatTeacherOrStaffId(prev.staffCategory, parsed, instituteRules)
                        : prev.employeeId,
                    }));
                  }}
                  className="w-full px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 text-sm font-mono tabular-nums font-bold"
                />
                <span className="text-[10px] text-on-surface-variant mt-0.5 block">
                  Seniority order (1 = most senior)
                </span>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="font-semibold text-on-surface-variant uppercase">
                    {formData.staffCategory === 'Teacher' ? 'Teacher ID *' : 'Staff ID *'}
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setIdAutoSync(true);
                      setFormData((prev) => ({
                        ...prev,
                        employeeId: formatTeacherOrStaffId(
                          prev.staffCategory,
                          prev.rankOrder,
                          instituteRules
                        ),
                      }));
                    }}
                    className="text-[10px] font-bold text-primary-container hover:underline cursor-pointer"
                  >
                    Auto Generate
                  </button>
                </div>
                <input
                  type="text"
                  required
                  placeholder={
                    formData.staffCategory === 'Teacher' ? 'e.g. RHHSTID1' : 'e.g. RHHSSID001'
                  }
                  value={formData.employeeId}
                  onChange={(e) => {
                    setIdAutoSync(false);
                    setFormData((prev) => ({ ...prev, employeeId: e.target.value }));
                  }}
                  className="w-full px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 text-sm font-mono tabular-nums font-bold"
                />
                <span className="text-[10px] text-on-surface-variant mt-0.5 block">
                  Used to log in · Custom editable
                </span>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="font-semibold text-on-surface-variant uppercase">
                    6-Digit Portal PIN {viewMode === 'add' ? '*' : '(Update)'}
                  </label>
                  <button
                    type="button"
                    onClick={() =>
                      setFormData((prev) => ({ ...prev, password: generateSixDigitPinValue() }))
                    }
                    className="text-[10px] font-bold text-primary-container hover:underline cursor-pointer"
                  >
                    Generate PIN
                  </button>
                </div>
                <input
                  type="text"
                  required={viewMode === 'add'}
                  placeholder={
                    viewMode === 'edit'
                      ? editingTeacher?.systemPin
                        ? `Current PIN: ${editingTeacher.systemPin} (blank keeps it)`
                        : 'Leave blank to keep existing'
                      : '6-digit PIN'
                  }
                  value={formData.password}
                  onChange={(e) => setFormData((prev) => ({ ...prev, password: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 text-sm font-mono font-bold tracking-wider"
                />
                {viewMode === 'edit' && editingTeacher?.systemPin && (
                  <span className="text-[10px] text-emerald-700 font-mono font-semibold mt-0.5 block">
                    Saved 6-Digit PIN: {editingTeacher.systemPin}
                  </span>
                )}
              </div>

              <div className="sm:col-span-2">
                <label className="block font-semibold text-on-surface-variant uppercase mb-1">
                  Name in English *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Md. Rafiqul Islam"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 text-sm font-medium"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block font-semibold text-on-surface-variant uppercase mb-1">
                  Name in Bangla (বাংলায় নাম)
                </label>
                <input
                  type="text"
                  placeholder="যেমন: মোঃ রফিকুল ইসলাম"
                  value={formData.banglaName}
                  onChange={(e) => setFormData({ ...formData, banglaName: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 text-sm font-medium"
                />
              </div>

              <div>
                <label className="block font-semibold text-on-surface-variant uppercase mb-1">
                  Designation *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Senior Assistant Teacher"
                  value={formData.designation}
                  onChange={(e) => setFormData({ ...formData, designation: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 text-sm"
                />
              </div>

              <div>
                <label className="block font-semibold text-on-surface-variant uppercase mb-1">
                  Department / Wing (Optional)
                </label>
                <input
                  type="text"
                  placeholder="Optional (e.g. Science / Office)"
                  value={formData.department}
                  onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 text-sm"
                />
              </div>

              <div>
                <label className="block font-semibold text-on-surface-variant uppercase mb-1">
                  MPO / Index No.
                </label>
                <input
                  type="text"
                  placeholder="e.g. MPO-1129402"
                  value={formData.mpoIndexNo}
                  onChange={(e) => setFormData({ ...formData, mpoIndexNo: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 text-sm font-mono tabular-nums"
                />
              </div>

              <div>
                <label className="block font-semibold text-on-surface-variant uppercase mb-1">
                  Highest Qualification
                </label>
                <input
                  type="text"
                  placeholder="e.g. M.Sc. in Physics, B.Ed."
                  value={formData.qualification}
                  onChange={(e) => setFormData({ ...formData, qualification: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 text-sm"
                />
              </div>

              <div>
                <label className="block font-semibold text-on-surface-variant uppercase mb-1">
                  Joining Date
                </label>
                <input
                  type="date"
                  value={formData.joiningDate}
                  onChange={(e) => setFormData({ ...formData, joiningDate: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 text-sm font-mono"
                />
              </div>

              <div>
                <label className="block font-semibold text-on-surface-variant uppercase mb-1">
                  Employment Type
                </label>
                <select
                  value={formData.employmentType}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      employmentType: e.target.value as 'Permanent' | 'Contractual' | 'Guest',
                    })
                  }
                  className="w-full px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 text-sm"
                >
                  <option value="Permanent">Permanent</option>
                  <option value="Contractual">Contractual</option>
                  <option value="Guest">Guest Lecturer</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-on-surface-variant uppercase mb-1">
                  Primary Shift
                </label>
                <select
                  value={formData.shift}
                  onChange={(e) => setFormData({ ...formData, shift: e.target.value as ShiftType })}
                  className="w-full px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 text-sm"
                >
                  <option value="Morning">Morning Shift</option>
                  <option value="Day">Day Shift</option>
                </select>
              </div>
            </div>
          </div>

          {/* Section 3: Personal & Emergency Contact */}
          <div className="rounded-2xl bg-surface-container-lowest border border-outline-variant/25 p-6 space-y-4">
            <h2 className="text-sm font-bold text-on-surface border-b border-outline-variant/15 pb-2.5">
              3. Personal, Identity &amp; Contact Information
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="block font-semibold text-on-surface-variant uppercase mb-1">
                  Gender
                </label>
                <select
                  value={formData.gender}
                  onChange={(e) => setFormData({ ...formData, gender: e.target.value as GenderType })}
                  className="w-full px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 text-sm"
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
                  value={formData.dateOfBirth}
                  onChange={(e) => setFormData({ ...formData, dateOfBirth: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 text-sm font-mono"
                />
              </div>
              <div>
                <label className="block font-semibold text-on-surface-variant uppercase mb-1">
                  Blood Group
                </label>
                <select
                  value={formData.bloodGroup}
                  onChange={(e) => setFormData({ ...formData, bloodGroup: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 text-sm"
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
                  National ID (NID) No.
                </label>
                <input
                  type="text"
                  placeholder="10 or 17-digit NID"
                  value={formData.nidNumber}
                  onChange={(e) => setFormData({ ...formData, nidNumber: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 text-sm font-mono tabular-nums"
                />
              </div>
              <div>
                <label className="block font-semibold text-on-surface-variant uppercase mb-1">
                  Official / Portal Email
                </label>
                <input
                  type="email"
                  placeholder="staff@institute.edu"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 text-sm"
                />
              </div>
              <div>
                <label className="block font-semibold text-on-surface-variant uppercase mb-1">
                  Mobile Phone *
                </label>
                <input
                  type="text"
                  required
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 text-sm font-mono tabular-nums"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block font-semibold text-on-surface-variant uppercase mb-1">
                  Emergency Contact
                </label>
                <input
                  type="text"
                  placeholder="Name & mobile number"
                  value={formData.emergencyContact}
                  onChange={(e) => setFormData({ ...formData, emergencyContact: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 text-sm"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block font-semibold text-on-surface-variant uppercase mb-1">
                  Present Address
                </label>
                <input
                  type="text"
                  value={formData.presentAddress}
                  onChange={(e) => setFormData({ ...formData, presentAddress: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 text-sm"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block font-semibold text-on-surface-variant uppercase mb-1">
                  Permanent Address
                </label>
                <input
                  type="text"
                  value={formData.permanentAddress}
                  onChange={(e) => setFormData({ ...formData, permanentAddress: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 text-sm"
                />
              </div>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-secondary-fixed/30 border border-outline-variant/25 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="text-xs text-on-surface-variant">
              <strong className="text-on-surface">Separation of Concerns:</strong> To assign teaching
              staff as Examination Paper Inspectors or Mark Entry Examiners, go to{' '}
              <span className="font-semibold text-primary-container">
                Examinations &rarr; Subject Reg &amp; Examiners
              </span>
              .
            </div>
            <button
              type="submit"
              className="px-6 py-2.5 rounded-xl bg-primary-container hover:bg-primary text-on-primary text-xs font-bold shadow-sm cursor-pointer shrink-0"
            >
              {viewMode === 'edit' ? 'Update Staff Profile' : 'Save New Staff Profile'}
            </button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="flex flex-col w-full space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <span className="font-label-sm text-label-sm uppercase tracking-wider text-primary-container font-semibold">
            Human Resources &amp; Faculty Register
          </span>
          <h1 className="font-headline-lg text-headline-lg text-on-surface tracking-tight font-bold">
            Teacher &amp; Staff Directory
          </h1>
          <p className="font-body-md text-body-md text-on-surface-variant mt-0.5">
            Maintain seniority-ranked Teacher &amp; Staff IDs, portrait photos, specimen signatures, and 6-digit login PINs.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start md:self-auto">
          <button
            type="button"
            onClick={() => {
              setTeacherPrefixInput(
                cleanTeacherIdPrefix(instituteRules?.teacherIdPrefix, 'RHHSTID')
              );
              setStaffPrefixInput(
                cleanTeacherIdPrefix(instituteRules?.staffIdPrefix, 'RHHSSID')
              );
              setShowPrefixModal(true);
            }}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-surface-container-low hover:bg-surface-container border border-outline-variant/30 text-on-surface text-xs font-bold cursor-pointer"
          >
            <span className="material-symbols-outlined text-[17px]">tune</span>
            <span>ID Prefixes</span>
          </button>

          <button
            onClick={openAddPage}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary-container hover:bg-primary text-on-primary font-label-md text-label-md font-bold shadow-sm transition-all cursor-pointer"
            type="button"
          >
            <span className="material-symbols-outlined text-[18px]">person_add</span>
            <span>Add Teacher / Staff</span>
          </button>
        </div>
      </div>

      {feedback && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-semibold flex items-center gap-2">
          <span className="material-symbols-outlined text-[18px]">check_circle</span>
          <span>{feedback}</span>
        </div>
      )}

      {/* Category Filter + Search Bar */}
      <div className="rounded-2xl bg-surface-container-lowest border border-outline-variant/25 p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-1 p-1 rounded-xl bg-surface-container-low border border-outline-variant/25 w-fit">
          {(['All', 'Teacher', 'Staff'] as const).map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setCategoryFilter(cat)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer tabular-nums ${
                categoryFilter === cat
                  ? 'bg-primary-container text-on-primary shadow-2xs'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              {cat === 'All' ? 'All Records' : cat === 'Teacher' ? 'Teachers' : 'Staff'} (
              {counts[cat]})
            </button>
          ))}
        </div>

        <div className="relative w-full lg:w-80">
          <span className="material-symbols-outlined absolute left-3.5 top-2.5 text-on-surface-variant text-[18px]">
            search
          </span>
          <input
            type="text"
            placeholder="Search English/Bangla name, ID, rank..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 text-xs text-on-surface focus:outline-none focus:ring-2 focus:ring-primary-container/20"
          />
        </div>
      </div>

      {/* Staff Cards */}
      {filteredTeachers.length === 0 ? (
        <div className="rounded-2xl bg-surface-container-lowest border border-outline-variant/25 p-10 text-center text-xs text-on-surface-variant">
          No teacher or staff members match the current filter.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredTeachers.map((teacher) => {
            const cat = normalizeTeacherCategory(teacher.staffCategory);
            const examinerDutyCount = getExamAssignmentCount(teacher);
            const isPinShown = Boolean(visiblePins[teacher.id]);
            return (
              <div
                key={teacher.id}
                className="rounded-2xl bg-surface-container-lowest p-5 border border-outline-variant/25 flex flex-col justify-between space-y-4"
              >
                <div className="flex items-start gap-3.5">
                  {teacher.avatarUrl ? (
                    <img
                      src={teacher.avatarUrl}
                      alt={teacher.name}
                      referrerPolicy="no-referrer"
                      className="w-14 h-14 rounded-2xl object-cover border border-outline-variant/30 shrink-0"
                    />
                  ) : (
                    <div className="w-14 h-14 rounded-2xl bg-primary-fixed/50 text-primary-container font-bold text-base flex items-center justify-center border border-outline-variant/30 shrink-0">
                      {teacher.name.slice(0, 2).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-mono font-bold text-on-surface-variant tabular-nums">
                        {teacher.employeeId || teacher.id.toUpperCase()}
                        {teacher.rankOrder ? ` · #${teacher.rankOrder}` : ''}
                      </span>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                          cat === 'Teacher'
                            ? 'bg-primary-fixed/50 text-primary-container'
                            : 'bg-secondary-fixed/60 text-secondary'
                        }`}
                      >
                        {cat}
                      </span>
                    </div>
                    <h3 className="font-title-md text-base font-bold text-on-surface truncate mt-0.5">
                      {teacher.name}
                    </h3>
                    {teacher.banglaName && (
                      <p className="text-xs text-on-surface-variant font-medium truncate">
                        {teacher.banglaName}
                      </p>
                    )}
                    <span className="text-xs text-primary-container font-semibold block truncate">
                      {teacher.designation}
                    </span>
                    <span className="text-[11px] text-on-surface-variant block truncate">
                      {teacher.department ? `${teacher.department} · ` : ''}
                      {teacher.shift ? `${teacher.shift} Shift` : ''}
                    </span>
                  </div>
                </div>

                {/* HR Details & Portal PIN Summary */}
                <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-[11px] pt-3 border-t border-outline-variant/15 text-on-surface-variant">
                  <div className="truncate">
                    <span className="block text-[10px] uppercase">Phone</span>
                    <span className="font-mono font-semibold text-on-surface tabular-nums">
                      {teacher.phone || '—'}
                    </span>
                  </div>
                  <div className="truncate">
                    <span className="block text-[10px] uppercase">Portal PIN</span>
                    {teacher.systemPin ? (
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono font-bold text-on-surface tabular-nums">
                          {isPinShown ? teacher.systemPin : '••••••'}
                        </span>
                        <button
                          type="button"
                          onClick={() => togglePinVisibility(teacher.id)}
                          className="text-primary-container hover:underline text-[10px] font-semibold cursor-pointer"
                        >
                          {isPinShown ? 'Hide' : 'Show'}
                        </button>
                      </div>
                    ) : (
                      <span className="text-[11px] italic text-on-surface-variant">
                        Custom / Set
                      </span>
                    )}
                  </div>
                  {teacher.qualification && (
                    <div className="col-span-2 truncate">
                      <span className="text-on-surface-variant">Qualification: </span>
                      <span className="font-medium text-on-surface">{teacher.qualification}</span>
                    </div>
                  )}
                </div>

                {/* Digital Signature & Exam Authority Row */}
                <div className="p-3 rounded-xl bg-surface-container-low/70 border border-outline-variant/20 flex items-center justify-between gap-3 text-[11px]">
                  <div>
                    <span className="text-on-surface-variant block text-[10px] uppercase font-semibold">
                      Specimen Signature
                    </span>
                    {teacher.signatureUrl ? (
                      <img
                        src={teacher.signatureUrl}
                        alt={`${teacher.name} Signature`}
                        referrerPolicy="no-referrer"
                        className="h-7 w-24 object-contain mt-1 bg-white rounded border border-outline-variant/25 px-1"
                      />
                    ) : (
                      <span className="text-on-surface-variant/80 italic">Not uploaded</span>
                    )}
                  </div>
                  {cat === 'Teacher' && (
                    <div className="text-right">
                      <span className="text-on-surface-variant block text-[10px] uppercase font-semibold">
                        Exam Duties
                      </span>
                      <span className="font-mono font-bold text-primary-container tabular-nums">
                        {examinerDutyCount} {examinerDutyCount === 1 ? 'paper' : 'papers'}
                      </span>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-outline-variant/15 gap-2">
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setViewingStaff(teacher)}
                      className="text-[11px] text-on-surface-variant hover:bg-surface-container px-2 py-1 rounded-lg font-semibold flex items-center gap-1 cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-[14px]">visibility</span>
                      <span>Dossier</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => openEditPage(teacher)}
                      className="text-[11px] text-primary-container hover:bg-primary-fixed/40 px-2 py-1 rounded-lg font-semibold flex items-center gap-1 cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-[14px]">edit</span>
                      <span>Edit</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setResetTargetId(teacher.id);
                        setResetPasswordValue(teacher.systemPin || generateSixDigitPinValue());
                        setResetNotice(null);
                      }}
                      className="text-[11px] text-secondary hover:bg-secondary-fixed/40 px-2 py-1 rounded-lg font-semibold flex items-center gap-1 cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-[14px]">key</span>
                      <span>PIN</span>
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => deleteTeacher(teacher.id)}
                    className="text-error hover:bg-error-container/20 px-2 py-1 rounded-lg text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[15px]">delete</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Prefix Configuration Modal */}
      {showPrefixModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="bg-surface-container-lowest rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-outline-variant/15">
              <h3 className="text-sm font-bold text-on-surface">
                Teacher &amp; Staff ID Prefix Settings
              </h3>
              <button
                type="button"
                onClick={() => setShowPrefixModal(false)}
                className="p-1.5 rounded-full hover:bg-surface-container cursor-pointer"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>
            <p className="text-xs text-on-surface-variant">
              Prefixes contain no hyphens or spaces. Teacher IDs append the unpadded rank (e.g. RHHSTID1) and Staff IDs append a 3-digit padded rank (e.g. RHHSSID001).
            </p>
            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-on-surface-variant uppercase mb-1">
                  Teacher ID Prefix
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    maxLength={16}
                    value={teacherPrefixInput}
                    onChange={(e) =>
                      setTeacherPrefixInput(
                        e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '')
                      )
                    }
                    className="flex-1 px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 font-mono font-bold text-sm"
                  />
                  <span className="px-3 py-2 rounded-xl bg-surface-container-low font-mono text-primary-container font-bold">
                    {(teacherPrefixInput || 'RHHSTID') + '1'}
                  </span>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-on-surface-variant uppercase mb-1">
                  Staff ID Prefix
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    maxLength={16}
                    value={staffPrefixInput}
                    onChange={(e) =>
                      setStaffPrefixInput(
                        e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '')
                      )
                    }
                    className="flex-1 px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 font-mono font-bold text-sm"
                  />
                  <span className="px-3 py-2 rounded-xl bg-surface-container-low font-mono text-secondary font-bold">
                    {(staffPrefixInput || 'RHHSSID') + '001'}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-outline-variant/15">
              <button
                type="button"
                onClick={() => setShowPrefixModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-on-surface-variant hover:bg-surface-container cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const cleanTeacher = cleanTeacherIdPrefix(teacherPrefixInput, 'RHHSTID');
                  const cleanStaff = cleanTeacherIdPrefix(staffPrefixInput, 'RHHSSID');
                  updateInstituteRules({
                    teacherIdPrefix: cleanTeacher,
                    staffIdPrefix: cleanStaff,
                  });
                  setShowPrefixModal(false);
                  showToast(
                    `Saved ID prefixes: Teacher (${cleanTeacher}1), Staff (${cleanStaff}001).`
                  );
                }}
                className="px-4 py-2 rounded-xl bg-primary-container text-on-primary text-xs font-bold cursor-pointer"
              >
                Save Prefixes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Staff HR Dossier Drawer/Modal */}
      {viewingStaff && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="bg-surface-container-lowest rounded-3xl p-6 sm:p-8 max-w-xl w-full shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-outline-variant/20">
              <h3 className="text-base font-bold text-on-surface">Staff HR Dossier</h3>
              <button
                type="button"
                onClick={() => setViewingStaff(null)}
                className="p-1.5 rounded-full hover:bg-surface-container cursor-pointer"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>
            <div className="flex items-center gap-4">
              {viewingStaff.avatarUrl ? (
                <img
                  src={viewingStaff.avatarUrl}
                  alt={viewingStaff.name}
                  referrerPolicy="no-referrer"
                  className="w-16 h-16 rounded-2xl object-cover border border-outline-variant/30"
                />
              ) : (
                <div className="w-16 h-16 rounded-2xl bg-primary-fixed/50 text-primary-container font-bold text-lg flex items-center justify-center border border-outline-variant/30 shrink-0">
                  {viewingStaff.name.slice(0, 2).toUpperCase()}
                </div>
              )}
              <div>
                <div className="text-xs font-mono font-bold text-secondary">
                  {viewingStaff.employeeId || viewingStaff.id} &bull;{' '}
                  {normalizeTeacherCategory(viewingStaff.staffCategory)}
                  {viewingStaff.rankOrder ? ` · Rank #${viewingStaff.rankOrder}` : ''}
                </div>
                <h4 className="text-lg font-bold text-on-surface">{viewingStaff.name}</h4>
                {viewingStaff.banglaName && (
                  <div className="text-xs font-medium text-on-surface-variant">
                    {viewingStaff.banglaName}
                  </div>
                )}
                <div className="text-xs text-primary-container font-semibold">
                  {viewingStaff.designation}
                  {viewingStaff.department ? ` — ${viewingStaff.department}` : ''}
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 p-4 rounded-2xl bg-surface-container-low text-xs">
              <div>
                <span className="text-on-surface-variant block">Portal 6-Digit PIN</span>
                <strong className="font-mono text-primary-container">
                  {viewingStaff.systemPin || 'Custom / Set'}
                </strong>
              </div>
              <div>
                <span className="text-on-surface-variant block">MPO / Index</span>
                <strong className="font-mono">{viewingStaff.mpoIndexNo || '—'}</strong>
              </div>
              <div>
                <span className="text-on-surface-variant block">Employment</span>
                <strong>
                  {viewingStaff.employmentType || 'Permanent'} ({viewingStaff.shift || 'Morning'})
                </strong>
              </div>
              <div>
                <span className="text-on-surface-variant block">Qualification</span>
                <strong>{viewingStaff.qualification || '—'}</strong>
              </div>
              <div>
                <span className="text-on-surface-variant block">Joining Date</span>
                <strong className="font-mono">{viewingStaff.joiningDate || '—'}</strong>
              </div>
              <div>
                <span className="text-on-surface-variant block">NID Number</span>
                <strong className="font-mono">{viewingStaff.nidNumber || '—'}</strong>
              </div>
              <div>
                <span className="text-on-surface-variant block">Email</span>
                <strong className="font-mono">{viewingStaff.email}</strong>
              </div>
              <div>
                <span className="text-on-surface-variant block">Mobile</span>
                <strong className="font-mono">{viewingStaff.phone}</strong>
              </div>
              <div className="col-span-2">
                <span className="text-on-surface-variant block">Present Address</span>
                <strong>{viewingStaff.presentAddress || '—'}</strong>
              </div>
              <div className="col-span-2">
                <span className="text-on-surface-variant block">Emergency Contact</span>
                <strong>{viewingStaff.emergencyContact || '—'}</strong>
              </div>
            </div>
            {viewingStaff.signatureUrl && (
              <div className="p-3 rounded-xl bg-white border border-outline-variant/25 flex items-center justify-between">
                <span className="text-xs font-semibold text-on-surface-variant">
                  Official Signature on File:
                </span>
                <img
                  src={viewingStaff.signatureUrl}
                  alt="Signature"
                  referrerPolicy="no-referrer"
                  className="h-9 object-contain"
                />
              </div>
            )}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  const s = viewingStaff;
                  setViewingStaff(null);
                  openEditPage(s);
                }}
                className="px-4 py-2 rounded-xl bg-surface-container hover:bg-surface-container-high text-xs font-semibold cursor-pointer"
              >
                Edit HR Profile
              </button>
              <button
                type="button"
                onClick={() => setViewingStaff(null)}
                className="px-4 py-2 rounded-xl bg-primary-container text-on-primary text-xs font-bold cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reset Teacher Password / 6-Digit PIN Modal */}
      {resetTargetId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="bg-surface-container-lowest rounded-3xl p-6 max-w-sm w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-outline-variant/15">
              <h3 className="text-sm font-bold text-on-surface">
                View / Update 6-Digit Portal PIN
              </h3>
              <button
                type="button"
                onClick={() => setResetTargetId(null)}
                className="p-1.5 rounded-full hover:bg-surface-container cursor-pointer"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>
            {resetNotice && (
              <div className="p-2.5 rounded-xl bg-emerald-50 text-emerald-800 text-xs font-semibold">
                {resetNotice}
              </div>
            )}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-semibold text-on-surface-variant">
                  6-Digit PIN or Password
                </label>
                <button
                  type="button"
                  onClick={() => setResetPasswordValue(generateSixDigitPinValue())}
                  className="text-[11px] font-bold text-primary-container hover:underline cursor-pointer"
                >
                  Generate New PIN
                </button>
              </div>
              <input
                type="text"
                placeholder="Enter 6-digit PIN or password"
                value={resetPasswordValue}
                onChange={(e) => setResetPasswordValue(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 text-sm font-mono font-bold tracking-wider"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setResetTargetId(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-on-surface-variant hover:bg-surface-container cursor-pointer"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => {
                  const val = resetPasswordValue.trim();
                  if (!val) return;
                  updateTeacher(resetTargetId, { password: val });
                  setResetNotice('Portal PIN / Password updated!');
                  setTimeout(() => setResetTargetId(null), 900);
                }}
                className="px-4 py-2 rounded-xl bg-primary-container text-on-primary text-xs font-bold cursor-pointer"
              >
                Save PIN
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
