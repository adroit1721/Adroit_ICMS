'use client';

import { useCallback, useEffect, useState } from 'react';
import { useERPStore } from '@/lib/store';
import { AdminUserAccount, InstituteRules } from '@/lib/types';
import { formatStudentSystemId } from '@/lib/student-schema';
import StudentSchemaManagerModal from './StudentSchemaManagerModal';

interface HealthDiagnostics {
  mongoConfigured: boolean;
  mongoConnected: boolean;
  localDbActive?: boolean;
  storageMode?: 'mongodb' | 'local';
  cloudinaryConfigured: boolean;
  needsInitialSetup: boolean;
  dbName: string;
  latencyMs: number | null;
  syncVersion?: number;
  lastUpdatedAt?: string;
  counts?: Record<string, number> | null;
  error?: string;
}

const VERCEL_ENV_KEYS = [
  { key: 'MONGODB_URI', desc: 'MongoDB Atlas SRV connection string' },
  { key: 'MONGODB_DB_NAME', desc: 'Database name (e.g. aethelgard_erp)' },
  { key: 'CLOUDINARY_CLOUD_NAME', desc: 'Cloudinary Cloud Name' },
  { key: 'CLOUDINARY_API_KEY', desc: 'Cloudinary Server API Key' },
  { key: 'CLOUDINARY_API_SECRET', desc: 'Cloudinary Server API Secret (server-only)' },
  { key: 'SESSION_SECRET', desc: '32+ char random secret for signing auth cookies' },
];

export default function SystemTab() {
  const {
    state,
    dbStatus,
    addAdminUser,
    updateAdminUser,
    deleteAdminUser,
    seedNctbPresets,
    resetOperationalData,
    refreshFromServer,
    updateInstituteRules,
  } = useERPStore();
  const { adminUsers, instituteRules } = state;

  const [showSchemaModal, setShowSchemaModal] = useState(false);
  const [prefixInput, setPrefixInput] = useState(instituteRules.studentIdPrefix || 'AG');
  const [teacherPrefixInput, setTeacherPrefixInput] = useState(
    instituteRules.teacherIdPrefix || 'RHHSTID'
  );
  const [staffPrefixInput, setStaffPrefixInput] = useState(
    instituteRules.staffIdPrefix || 'RHHSSID'
  );

  const [showAddUser, setShowAddUser] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newFullName, setNewFullName] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<AdminUserAccount['role']>('Institute Manager');
  const [editingPassId, setEditingPassId] = useState<string | null>(null);
  const [tempPass, setTempPass] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);

  const [health, setHealth] = useState<HealthDiagnostics | null>(null);
  const [checkingHealth, setCheckingHealth] = useState(false);
  const [seedingNctb, setSeedingNctb] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetIncludeStructure, setResetIncludeStructure] = useState(false);
  const [resettingDb, setResettingDb] = useState(false);
  const [copiedEnvTemplate, setCopiedEnvTemplate] = useState(false);

  const showNotice = (msg: string) => {
    setFeedback(msg);
    setTimeout(() => setFeedback(null), 4000);
  };

  const fetchHealth = useCallback(async () => {
    setCheckingHealth(true);
    try {
      const res = await fetch('/api/health', { cache: 'no-store', credentials: 'include' });
      const text = await res.text();
      if (text && !text.trim().startsWith('<')) {
        setHealth(JSON.parse(text));
      } else {
        setHealth(null);
      }
    } catch {
      setHealth(null);
    } finally {
      setCheckingHealth(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    fetch('/api/health', { cache: 'no-store', credentials: 'include' })
      .then((res) => res.text())
      .then((text) => {
        if (!active) return;
        if (text && !text.trim().startsWith('<')) {
          setHealth(JSON.parse(text));
        } else {
          setHealth(null);
        }
      })
      .catch(() => {
        if (active) setHealth(null);
      });
    return () => {
      active = false;
    };
  }, []);

  const activeAdminCount = adminUsers.filter((u) => u.role === 'Admin' && u.active).length;

  const handleCreateUser = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanUser = newUsername.trim();
    if (!cleanUser || !newPassword.trim()) return;
    if (adminUsers.some((u) => u.username.toLowerCase() === cleanUser.toLowerCase())) {
      showNotice(`Username "${cleanUser}" already exists. Choose a unique Login User ID.`);
      return;
    }
    addAdminUser({
      username: cleanUser,
      fullName: newFullName.trim() || cleanUser,
      password: newPassword.trim(),
      role: newRole,
      active: true,
    });
    setNewUsername('');
    setNewFullName('');
    setNewPassword('');
    setShowAddUser(false);
    showNotice(`Created ${newRole} login account (${cleanUser}).`);
  };

  const handleSeedNctb = async () => {
    setSeedingNctb(true);
    try {
      const res = await seedNctbPresets();
      await fetchHealth();
      if (res.ok) {
        const d = (res.data || {}) as { insertedClasses?: number; insertedSubjects?: number };
        showNotice(
          `Seeded ${d.insertedClasses ?? 0} NCTB classes and ${d.insertedSubjects ?? 0} board subjects.`
        );
      } else {
        showNotice(res.error || 'Could not seed NCTB presets.');
      }
    } finally {
      setSeedingNctb(false);
    }
  };

  const handleExportBackup = () => {
    const backup = {
      exportedAt: new Date().toISOString(),
      dbName: health?.dbName || 'mongodb',
      syncVersion: dbStatus.syncVersion,
      data: {
        cmsConfig: state.cmsConfig,
        instituteRules: state.instituteRules,
        admissionFormConfig: state.admissionFormConfig,
        mfsConfig: state.mfsConfig,
        smsConfig: state.smsConfig,
        academicClasses: state.academicClasses,
        subjects: state.subjects,
        classRoutines: state.classRoutines,
        teachers: state.teachers,
        students: state.students,
        admissions: state.admissions,
        exams: state.exams,
        markEntries: state.markEntries,
        publishedResults: state.publishedResults,
        invoices: state.invoices,
        notices: state.notices,
        events: state.events,
      },
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `institute-erp-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showNotice('Exported full JSON backup from live database state.');
  };

  const handleConfirmReset = async () => {
    setResettingDb(true);
    try {
      const res = await resetOperationalData(resetIncludeStructure);
      await fetchHealth();
      setShowResetModal(false);
      if (res.ok) {
        showNotice(
          resetIncludeStructure
            ? 'Reset all operational records and academic structure (RBAC accounts retained).'
            : 'Reset all operational student, staff, exam, and billing records.'
        );
      } else {
        showNotice(res.error || 'Failed to reset database.');
      }
    } finally {
      setResettingDb(false);
    }
  };

  const handleCopyEnvKeys = async () => {
    const template = VERCEL_ENV_KEYS.map((item) => `${item.key}=`).join('\n');
    try {
      await navigator.clipboard.writeText(template);
      setCopiedEnvTemplate(true);
      setTimeout(() => setCopiedEnvTemplate(false), 2500);
    } catch {
      // ignore clipboard errors
    }
  };

  const mongoConnected = health ? health.mongoConnected : dbStatus.mongoConnected;
  const localDbActive = health ? Boolean(health.localDbActive) : Boolean(dbStatus.localDbActive);
  const cloudinaryReady = health ? health.cloudinaryConfigured : dbStatus.cloudinaryConfigured;

  return (
    <div className="flex flex-col w-full space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <span className="font-label-sm text-label-sm uppercase tracking-wider text-primary-container font-semibold">
            Settings · MongoDB Atlas, Cloudinary CDN &amp; RBAC
          </span>
          <h1 className="font-headline-lg text-headline-lg text-on-surface tracking-tight font-bold">
            Cloud Database, Media Storage &amp; Access Control
          </h1>
          <p className="font-body-md text-body-md text-on-surface-variant mt-0.5">
            Monitor live MongoDB Atlas &amp; Cloudinary health, seed official NCTB board curriculum presets, back up or reset records, and manage RBAC staff logins.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowAddUser(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary-container hover:bg-primary text-on-primary text-xs font-bold shadow-sm cursor-pointer self-start md:self-auto"
        >
          <span className="material-symbols-outlined text-[18px]">person_add</span>
          Add RBAC User
        </button>
      </div>

      {feedback && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-semibold flex items-center gap-2">
          <span className="material-symbols-outlined text-[18px]">check_circle</span>
          <span>{feedback}</span>
        </div>
      )}

      {/* Live MongoDB Atlas & Cloudinary Diagnostics */}
      <div className="rounded-2xl bg-surface-container-lowest border border-outline-variant/25 p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-outline-variant/20">
          <div>
            <h2 className="text-base font-bold text-on-surface">
              MongoDB Atlas &amp; Cloudinary Live Diagnostics
            </h2>
            <p className="text-xs text-on-surface-variant">
              Real-time state syncs across Admin, Teacher, Student, and Public portals via version{' '}
              <code className="font-mono font-bold text-primary-container">v{health?.syncVersion ?? dbStatus.syncVersion}</code>.
            </p>
          </div>
          <button
            type="button"
            disabled={checkingHealth}
            onClick={() => {
              void fetchHealth();
              void refreshFromServer();
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-surface-container-low hover:bg-surface-container border border-outline-variant/30 text-xs font-semibold cursor-pointer disabled:opacity-60 self-start sm:self-auto"
          >
            <span className="material-symbols-outlined text-[16px]">refresh</span>
            <span>{checkingHealth ? 'Checking...' : 'Test Connection & Sync'}</span>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* MongoDB Status Card */}
          <div className="p-4 rounded-2xl bg-surface-container-low/70 border border-outline-variant/20 space-y-2.5 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-bold text-sm text-on-surface">
                {mongoConnected ? 'MongoDB Atlas Cluster' : localDbActive ? 'Local Workspace Storage' : 'MongoDB Atlas Cluster'}
              </span>
              <span
                className={`px-2.5 py-0.5 rounded-md font-bold text-[11px] ${
                  mongoConnected
                    ? 'bg-emerald-100 text-emerald-800'
                    : localDbActive
                    ? 'bg-amber-100 text-amber-900'
                    : 'bg-red-100 text-red-800'
                }`}
              >
                {mongoConnected
                  ? 'Connected'
                  : localDbActive
                  ? 'Local DB Active (MONGODB_URI Unset)'
                  : health?.mongoConfigured === false
                  ? 'Missing MONGODB_URI'
                  : 'Disconnected'}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 font-mono text-[11px] text-on-surface-variant">
              <div>
                <span className="block font-sans text-[10px] uppercase">Database Name</span>
                <strong className="text-on-surface">{health?.dbName || 'local_workspace_db'}</strong>
              </div>
              <div>
                <span className="block font-sans text-[10px] uppercase">Ping Latency</span>
                <strong className="text-on-surface">
                  {health?.latencyMs != null ? `${health.latencyMs} ms` : '—'}
                </strong>
              </div>
            </div>
            {localDbActive && (
              <p className="text-[11px] text-amber-900 bg-amber-50/90 border border-amber-200 rounded-lg p-2 leading-relaxed">
                Persisting to <code className="font-mono font-semibold">data/erp-db.json</code>. To restore/use MongoDB Atlas persistently across container restarts, set <code className="font-mono font-semibold">MONGODB_URI</code> in AI Studio Secrets rather than <code className="font-mono">.env.local</code>.
              </p>
            )}
            {health?.error && (
              <p className="text-[11px] text-error font-medium">{health.error}</p>
            )}
          </div>

          {/* Cloudinary Status Card */}
          <div className="p-4 rounded-2xl bg-surface-container-low/70 border border-outline-variant/20 space-y-2.5 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-bold text-sm text-on-surface">Cloudinary Signed Media CDN</span>
              <span
                className={`px-2.5 py-0.5 rounded-md font-bold text-[11px] ${
                  cloudinaryReady
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-amber-100 text-amber-900'
                }`}
              >
                {cloudinaryReady ? 'Configured (Auto-Lifecycle ON)' : 'Env Vars Missing'}
              </span>
            </div>
            <p className="text-[11px] text-on-surface-variant leading-relaxed">
              Uploads bypass browser base64 and stream directly to Cloudinary folders. Replaced portraits, signatures, slides, or deleted student/teacher photos are destroyed automatically on Cloudinary.
            </p>
          </div>
        </div>

        {/* Live Collection Document Counts */}
        {health?.counts && (
          <div className="space-y-2">
            <div className="text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">
              Live MongoDB Collection Document Counts
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5">
              {Object.entries(health.counts).map(([name, count]) => (
                <div
                  key={name}
                  className="p-2.5 rounded-xl bg-surface-container-low border border-outline-variant/20 text-center"
                >
                  <div className="text-base font-bold font-mono tabular-nums text-primary-container">
                    {count}
                  </div>
                  <div className="text-[10px] font-semibold text-on-surface-variant capitalize truncate">
                    {name.replace(/([A-Z])/g, ' $1')}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Database Maintenance & Onboarding Tools */}
        <div className="pt-3 border-t border-outline-variant/20 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              disabled={seedingNctb}
              onClick={handleSeedNctb}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-secondary text-on-secondary text-xs font-bold cursor-pointer disabled:opacity-60"
            >
              <span className="material-symbols-outlined text-[16px]">auto_fix_high</span>
              <span>
                {seedingNctb ? 'Seeding...' : 'Seed NCTB Classes & Subject Presets'}
              </span>
            </button>

            <button
              type="button"
              onClick={handleExportBackup}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-surface-container-low hover:bg-surface-container border border-outline-variant/30 text-xs font-semibold cursor-pointer"
            >
              <span className="material-symbols-outlined text-[16px]">download</span>
              <span>Export JSON Backup</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => setShowResetModal(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-error-container/30 hover:bg-error-container/50 text-error text-xs font-bold cursor-pointer"
          >
            <span className="material-symbols-outlined text-[16px]">delete_sweep</span>
            <span>Reset Operational Data</span>
          </button>
        </div>
        {/* Student ID Prefix & Data Format Controls */}
        <div className="pt-4 border-t border-outline-variant/20 space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-bold text-on-surface">
                Student ID Prefix &amp; Data Format Controls
              </h3>
              <p className="text-xs text-on-surface-variant">
                Configure the default Student ID prefix used when blank on admission, and customize mandatory (*) student fields.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2.5 text-xs">
              <input
                type="text"
                maxLength={12}
                value={prefixInput}
                onChange={(e) =>
                  setPrefixInput(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))
                }
                placeholder="AG"
                className="w-24 px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 font-mono font-bold text-center"
              />
              <span className="px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/20 font-mono text-on-surface-variant">
                Sample:{' '}
                <strong className="text-primary-container">
                  {formatStudentSystemId(
                    prefixInput,
                    instituteRules.activeAcademicYear || new Date().getFullYear(),
                    1
                  )}
                </strong>
              </span>
              <button
                type="button"
                onClick={() => {
                  const clean = prefixInput.replace(/[\s-]/g, '').trim().toUpperCase() || 'AG';
                  setPrefixInput(clean);
                  updateInstituteRules({ studentIdPrefix: clean });
                  showNotice(`Saved Student ID prefix "${clean}".`);
                }}
                className="px-3.5 py-2 rounded-xl bg-primary-container hover:bg-primary text-on-primary font-bold cursor-pointer"
              >
                Save Prefix
              </button>
              <button
                type="button"
                onClick={() => setShowSchemaModal(true)}
                className="px-3.5 py-2 rounded-xl bg-surface-container hover:bg-surface-container-high border border-outline-variant/30 font-bold cursor-pointer"
              >
                Manage Mandatory Fields (*)
              </button>
            </div>
          </div>

          <div className="pt-3 border-t border-outline-variant/15 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-bold text-on-surface">
                Teacher &amp; Staff ID Prefix Controls
              </h3>
              <p className="text-xs text-on-surface-variant">
                Set separate hyphen-free ID prefixes for seniority-based Teacher IDs and Staff IDs.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2.5 text-xs">
              <div className="flex items-center gap-1.5">
                <span className="font-semibold text-on-surface-variant">Teacher:</span>
                <input
                  type="text"
                  maxLength={16}
                  value={teacherPrefixInput}
                  onChange={(e) =>
                    setTeacherPrefixInput(
                      e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '')
                    )
                  }
                  placeholder="RHHSTID"
                  className="w-28 px-2.5 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 font-mono font-bold text-center"
                />
                <span className="text-[11px] font-mono text-primary-container font-bold">
                  ({(teacherPrefixInput || 'RHHSTID') + '1'})
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="font-semibold text-on-surface-variant">Staff:</span>
                <input
                  type="text"
                  maxLength={16}
                  value={staffPrefixInput}
                  onChange={(e) =>
                    setStaffPrefixInput(
                      e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '')
                    )
                  }
                  placeholder="RHHSSID"
                  className="w-28 px-2.5 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 font-mono font-bold text-center"
                />
                <span className="text-[11px] font-mono text-secondary font-bold">
                  ({(staffPrefixInput || 'RHHSSID') + '001'})
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  const cleanTeacher =
                    teacherPrefixInput.replace(/[\s-]/g, '').trim().toUpperCase() || 'RHHSTID';
                  const cleanStaff =
                    staffPrefixInput.replace(/[\s-]/g, '').trim().toUpperCase() || 'RHHSSID';
                  setTeacherPrefixInput(cleanTeacher);
                  setStaffPrefixInput(cleanStaff);
                  updateInstituteRules({
                    teacherIdPrefix: cleanTeacher,
                    staffIdPrefix: cleanStaff,
                  });
                  showNotice(
                    `Saved Teacher (${cleanTeacher}1) & Staff (${cleanStaff}001) ID prefixes.`
                  );
                }}
                className="px-3.5 py-2 rounded-xl bg-primary-container hover:bg-primary text-on-primary font-bold cursor-pointer"
              >
                Save Staff Prefixes
              </button>
            </div>
          </div>
        </div>
      </div>

      {showSchemaModal && (
        <StudentSchemaManagerModal
          rules={instituteRules}
          onSave={(updates: Partial<InstituteRules>) => {
            updateInstituteRules(updates);
            if (updates.studentIdPrefix) setPrefixInput(updates.studentIdPrefix);
            showNotice('Updated Student ID Prefix & Mandatory (*) field controls.');
          }}
          onClose={() => setShowSchemaModal(false)}
        />
      )}

      {/* Host-Portability & Vercel Environment Checklist */}
      <div className="rounded-2xl bg-surface-container-lowest border border-outline-variant/25 p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-on-surface">
              Host Portability &amp; Vercel Environment Checklist
            </h2>
            <p className="text-xs text-on-surface-variant">
              All database records reside in MongoDB Atlas and all images reside on Cloudinary — redeploying to any new domain or host preserves 100% of your data without loss.
            </p>
          </div>
          <button
            type="button"
            onClick={handleCopyEnvKeys}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-surface-container-low hover:bg-surface-container border border-outline-variant/30 text-xs font-semibold cursor-pointer shrink-0"
          >
            <span className="material-symbols-outlined text-[16px]">content_copy</span>
            <span>{copiedEnvTemplate ? 'Copied Key Names!' : 'Copy .env Key Names'}</span>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
          {VERCEL_ENV_KEYS.map((item) => (
            <div
              key={item.key}
              className="p-3 rounded-xl bg-surface-container-low/70 border border-outline-variant/20 space-y-1"
            >
              <code className="font-mono font-bold text-primary-container block">{item.key}</code>
              <span className="text-[11px] text-on-surface-variant block">{item.desc}</span>
            </div>
          ))}
        </div>
      </div>

      {/* RBAC Administrative Users Table */}
      <div className="rounded-2xl bg-surface-container-lowest border border-outline-variant/25 overflow-hidden">
        <div className="px-6 py-4 border-b border-outline-variant/20 flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-on-surface">
              ERP Administrative Staff &amp; Role Credentials
            </h2>
            <p className="text-xs text-on-surface-variant">
              Teachers log in separately at <code className="font-mono">/teacher/login</code> and students at <code className="font-mono">/student/login</code>.
            </p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-surface-container-low text-on-surface-variant">
                <th className="py-3 px-4 font-semibold">User ID</th>
                <th className="py-3 px-4 font-semibold">Staff Name</th>
                <th className="py-3 px-4 font-semibold">Assigned Role</th>
                <th className="py-3 px-4 font-semibold">Password</th>
                <th className="py-3 px-4 font-semibold">Status</th>
                <th className="py-3 px-4 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/15">
              {adminUsers.map((u) => {
                const isLastActiveAdmin = u.role === 'Admin' && u.active && activeAdminCount <= 1;
                return (
                  <tr key={u.id} className="hover:bg-surface-container-low/40">
                    <td className="py-3.5 px-4 font-mono font-bold text-primary-container">{u.username}</td>
                    <td className="py-3.5 px-4 font-semibold text-on-surface">{u.fullName}</td>
                    <td className="py-3.5 px-4 font-medium">{u.role}</td>
                    <td className="py-3.5 px-4 font-mono">
                      {editingPassId === u.id ? (
                        <div className="flex items-center gap-1.5">
                          <input
                            type="text"
                            value={tempPass}
                            onChange={(e) => setTempPass(e.target.value)}
                            placeholder="New password"
                            className="w-28 px-2 py-1 rounded border border-outline-variant/40 text-xs"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              if (tempPass.trim()) {
                                updateAdminUser(u.id, { password: tempPass.trim() });
                                showNotice(`Updated password for "${u.username}".`);
                              }
                              setEditingPassId(null);
                              setTempPass('');
                            }}
                            className="px-2 py-1 rounded bg-emerald-600 text-white font-bold cursor-pointer"
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingPassId(null);
                              setTempPass('');
                            }}
                            className="px-2 py-1 rounded bg-surface-container text-on-surface-variant font-semibold cursor-pointer"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <span className="text-on-surface-variant">••••••••</span>
                      )}
                    </td>
                    <td className="py-3.5 px-4">
                      <button
                        type="button"
                        disabled={isLastActiveAdmin}
                        title={
                          isLastActiveAdmin
                            ? 'At least one active Administrator must remain.'
                            : 'Toggle status'
                        }
                        onClick={() => {
                          if (isLastActiveAdmin) return;
                          updateAdminUser(u.id, { active: !u.active });
                        }}
                        className={`font-semibold cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed ${
                          u.active ? 'text-emerald-800' : 'text-red-700'
                        }`}
                      >
                        {u.active ? 'Active' : 'Suspended'}
                      </button>
                    </td>
                    <td className="py-3.5 px-4 text-right space-x-2">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingPassId(u.id);
                          setTempPass('');
                        }}
                        className="px-2.5 py-1 rounded-lg bg-surface-container hover:bg-surface-container-high font-semibold cursor-pointer"
                      >
                        Change Password
                      </button>
                      {!isLastActiveAdmin && (
                        <button
                          type="button"
                          onClick={() => deleteAdminUser(u.id)}
                          className="px-2.5 py-1 rounded-lg text-error hover:bg-error-container/20 font-semibold cursor-pointer"
                        >
                          Remove
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Admin RBAC User Modal */}
      {showAddUser && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-surface-container-lowest rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-outline-variant/20 pb-3">
              <h3 className="text-base font-bold">Add ERP Administrative User</h3>
              <button type="button" onClick={() => setShowAddUser(false)} className="p-1 cursor-pointer">
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>
            <form onSubmit={handleCreateUser} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold mb-1">Full Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Tariqul Islam"
                  value={newFullName}
                  onChange={(e) => setNewFullName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30"
                />
              </div>
              <div>
                <label className="block font-semibold mb-1">Login User ID *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. accounts_desk"
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 font-mono"
                />
              </div>
              <div>
                <label className="block font-semibold mb-1">Role *</label>
                <select
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value as AdminUserAccount['role'])}
                  className="w-full px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 font-semibold"
                >
                  <option value="Institute Manager">Institute Manager (SIS &amp; Exams)</option>
                  <option value="Accountant">Accountant (Billing &amp; MFS)</option>
                  <option value="Admin">Administrator (Full Access)</option>
                </select>
              </div>
              <div>
                <label className="block font-semibold mb-1">Password *</label>
                <input
                  type="text"
                  required
                  minLength={6}
                  placeholder="Minimum 6 characters"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 font-mono"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowAddUser(false)} className="px-4 py-2 rounded-xl cursor-pointer">
                  Cancel
                </button>
                <button type="submit" className="px-5 py-2 rounded-xl bg-primary-container text-on-primary font-bold cursor-pointer">
                  Create Account
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reset Operational Data Confirmation Modal */}
      {showResetModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-surface-container-lowest rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-outline-variant/20 pb-3">
              <h3 className="text-base font-bold text-error">Reset Operational Database</h3>
              <button
                type="button"
                onClick={() => setShowResetModal(false)}
                className="p-1 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>
            <p className="text-xs text-on-surface-variant leading-relaxed">
              This will permanently erase students, teachers/staff, admissions, exams, mark entries, fee invoices, notices, events, and their uploaded Cloudinary portraits/attachments from MongoDB. Admin RBAC accounts remain active.
            </p>
            <label className="flex items-center gap-2 p-3 rounded-xl bg-surface-container-low border border-outline-variant/25 text-xs font-semibold cursor-pointer">
              <input
                type="checkbox"
                checked={resetIncludeStructure}
                onChange={(e) => setResetIncludeStructure(e.target.checked)}
              />
              <span>Also wipe Classes, Subjects &amp; Class Routines</span>
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowResetModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={resettingDb}
                onClick={handleConfirmReset}
                className="px-5 py-2 rounded-xl bg-error text-on-error text-xs font-bold cursor-pointer disabled:opacity-60"
              >
                {resettingDb ? 'Wiping...' : 'Confirm Wipe'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

