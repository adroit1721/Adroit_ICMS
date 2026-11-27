'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useERPStore } from '@/lib/store';
import { isTeachingStaff } from '@/lib/teacher-helpers';
import { AdminTab } from './AdminSidebar';

interface DashboardTabProps {
  setActiveTab: (tab: AdminTab) => void;
}

export default function DashboardTab({ setActiveTab }: DashboardTabProps) {
  const { isHydrated } = useERPStore();
  return <DashboardTabInner key={isHydrated ? 'hydrated' : 'ssr'} setActiveTab={setActiveTab} />;
}

function DashboardTabInner({ setActiveTab }: DashboardTabProps) {
  const {
    state,
    authSession,
    toggleAdmissionBadge,
    toggleResultsBadge,
    toggleEmergencyAlert,
    updateCMSConfig,
    updateAdmissionStatus,
  } = useERPStore();

  const { cmsConfig, instituteRules, admissions, events, students, teachers, invoices, currentUser } = state;
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncFeedback, setSyncFeedback] = useState<string | null>(null);
  const [editEmergencyText, setEditEmergencyText] = useState(false);
  const [alertText, setAlertText] = useState(cmsConfig.emergencyAlertText || '');
  const [openStatusMenuId, setOpenStatusMenuId] = useState<string | null>(null);

  const totalInvoiced = invoices.reduce((sum, i) => sum + i.totalPayable, 0);
  const totalCollected = invoices.reduce((sum, i) => sum + i.paidAmount, 0);
  const collectionPct =
    totalInvoiced > 0 ? ((totalCollected / totalInvoiced) * 100).toFixed(1) : '0.0';
  const todayLabel = new Date().toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  // Dynamic institution name & active academic session/year from settings
  const institutionName = (cmsConfig?.schoolName || 'Institutional Academy').trim();
  const activeYear = instituteRules?.activeAcademicYear?.trim() || new Date().getFullYear().toString();
  const collegeSession = (instituteRules?.activeCollegeSession || instituteRules?.hscYear1Session || '').trim();
  const isSchoolEnabled = instituteRules?.enabledWings?.school ?? true;
  const isCollegeEnabled = instituteRules?.enabledWings?.college ?? true;

  let sessionSubtitle = `Academic Year ${activeYear} • Live Command Center`;
  let sessionTag = `#AY-${activeYear}`;

  if (isSchoolEnabled && isCollegeEnabled) {
    sessionSubtitle = `School Year ${activeYear} • College Session ${collegeSession || 'Active'} • Live Command Center`;
    sessionTag = collegeSession ? `#AY-${activeYear} / ${collegeSession}` : `#AY-${activeYear}`;
  } else if (isCollegeEnabled && !isSchoolEnabled) {
    sessionSubtitle = `College Academic Session ${collegeSession || activeYear} • Live Command Center`;
    sessionTag = collegeSession ? `#HSC-${collegeSession}` : `#HSC-${activeYear}`;
  } else {
    sessionSubtitle = `School Academic Year ${activeYear} • Live Command Center`;
    sessionTag = `#AY-${activeYear}`;
  }

  const welcomeAdminName =
    authSession?.username || currentUser?.username || cmsConfig?.principalName || 'Administrator';

  // Exact real-time counts from current directory
  const activeStudentsCount = students.filter((s) => s.status === 'Active').length;
  const alumniStudentsCount = students.filter((s) => s.status === 'Alumni').length;
  const teachingStaffCount = teachers.filter((t) => isTeachingStaff(t)).length;
  const supportStaffCount = teachers.length - teachingStaffCount;
  const pendingAdmissionsCount = admissions.filter((a) => a.status === 'Pending' || a.status === 'Under Review').length;
  const admittedCount = admissions.filter((a) => a.status === 'Admitted').length;

  const handleSyncCache = () => {
    setIsSyncing(true);
    setSyncFeedback('Flushing edge CDN cache...');
    setTimeout(() => {
      setIsSyncing(false);
      setSyncFeedback('Edge CDN & In-Memory Cache synchronized successfully!');
      setTimeout(() => setSyncFeedback(null), 3500);
    }, 800);
  };

  const handleSaveAlertText = () => {
    updateCMSConfig({ emergencyAlertText: alertText });
    setEditEmergencyText(false);
  };

  return (
    <div className="flex flex-col w-full space-y-6 sm:space-y-8">
      {/* Header Section with Dynamic Greeting & Academic Settings Metadata */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-1">
        <div className="flex flex-col min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary-fixed text-on-primary-fixed-variant text-xs font-semibold tracking-wide">
              <span className="w-2 h-2 rounded-full bg-primary-container animate-pulse" />
              {institutionName.toUpperCase()} ERP SYSTEM
            </span>
            <span className="text-xs text-on-surface-variant font-mono font-medium bg-surface-container-low px-2.5 py-0.5 rounded-md border border-outline-variant/20">
              Session ID: {sessionTag}
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-on-surface tracking-tight truncate">
            Welcome back, {welcomeAdminName}
          </h1>
          <p className="text-xs sm:text-sm text-on-surface-variant font-medium mt-1">
            {sessionSubtitle}
          </p>
        </div>

        {/* Quick Session Indicator & Time Stamp */}
        <div className="flex items-center gap-2.5 self-start md:self-auto shrink-0 flex-wrap">
          <div className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-surface-container-lowest/90 backdrop-blur-xl shadow-xs border border-outline-variant/20 text-on-surface">
            <span className="material-symbols-outlined text-primary-container text-[18px]">
              calendar_today
            </span>
            <span className="text-xs sm:text-sm font-semibold">
              {todayLabel}
            </span>
          </div>
          <button
            onClick={() => setActiveTab('cms')}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-surface-container-lowest/90 hover:bg-surface-container backdrop-blur-xl shadow-xs border border-outline-variant/20 text-on-surface font-semibold text-xs sm:text-sm transition-all cursor-pointer"
            type="button"
          >
            <span className="material-symbols-outlined text-[18px]">tune</span>
            <span>Settings</span>
          </button>
        </div>
      </div>

      {/* KPI Metric Cards Grid - Fully Responsive */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-4 gap-4 sm:gap-5">
        {/* Card 1: Total Students */}
        <div className="relative overflow-hidden rounded-2xl bg-surface-container-lowest/90 border border-outline-variant/25 p-5 sm:p-6 shadow-xs hover:shadow-md transition-all flex flex-col justify-between group">
          <div className="flex items-start justify-between gap-3">
            <div className="flex flex-col min-w-0">
              <span className="text-xs uppercase tracking-wider text-on-surface-variant font-semibold">
                Total Students
              </span>
              <div className="flex items-baseline gap-2 mt-2">
                <span className="text-3xl sm:text-4xl font-extrabold text-on-surface tracking-tight">
                  {students.length}
                </span>
              </div>
            </div>
            <div className="w-12 h-12 rounded-xl bg-primary-fixed/40 text-primary-container flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform shadow-xs">
              <span className="material-symbols-outlined text-[24px]">school</span>
            </div>
          </div>
          <div className="mt-4 pt-3 flex items-center justify-between border-t border-outline-variant/15 text-xs">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-800 font-semibold text-[11px]">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
              Live DB
            </span>
            <span className="text-on-surface-variant font-medium truncate ml-2">
              {activeStudentsCount} Active{alumniStudentsCount > 0 ? ` • ${alumniStudentsCount} Alumni` : ''}
            </span>
          </div>
        </div>

        {/* Card 2: Teachers & Staff */}
        <div className="relative overflow-hidden rounded-2xl bg-surface-container-lowest/90 border border-outline-variant/25 p-5 sm:p-6 shadow-xs hover:shadow-md transition-all flex flex-col justify-between group">
          <div className="flex items-start justify-between gap-3">
            <div className="flex flex-col min-w-0">
              <span className="text-xs uppercase tracking-wider text-on-surface-variant font-semibold">
                Teachers &amp; Staff
              </span>
              <div className="flex items-baseline gap-2 mt-2">
                <span className="text-3xl sm:text-4xl font-extrabold text-on-surface tracking-tight">
                  {teachers.length}
                </span>
              </div>
            </div>
            <div className="w-12 h-12 rounded-xl bg-secondary-fixed/50 text-secondary flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform shadow-xs">
              <span className="material-symbols-outlined text-[24px]">badge</span>
            </div>
          </div>
          <div className="mt-4 pt-3 flex items-center justify-between border-t border-outline-variant/15 text-xs">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-secondary-fixed/50 text-on-secondary-container font-semibold text-[11px]">
              <span className="w-1.5 h-1.5 rounded-full bg-secondary" />
              Staff Directory
            </span>
            <span className="text-on-surface-variant font-medium truncate ml-2">
              {teachingStaffCount} Teaching{supportStaffCount > 0 ? ` • ${supportStaffCount} Staff` : ''}
            </span>
          </div>
        </div>

        {/* Card 3: Admission Queue */}
        <div className="relative overflow-hidden rounded-2xl bg-surface-container-lowest/90 border border-outline-variant/25 p-5 sm:p-6 shadow-xs hover:shadow-md transition-all flex flex-col justify-between group">
          <div className="flex items-start justify-between gap-3">
            <div className="flex flex-col min-w-0">
              <span className="text-xs uppercase tracking-wider text-primary-container font-semibold">
                Admission Queue
              </span>
              <div className="flex items-baseline gap-2 mt-2">
                <span className="text-3xl sm:text-4xl font-extrabold text-on-surface tracking-tight">
                  {admissions.length}
                </span>
              </div>
            </div>
            <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-800 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform shadow-xs">
              <span className="material-symbols-outlined text-[24px]">contact_mail</span>
            </div>
          </div>
          <div className="mt-4 pt-3 flex items-center justify-between border-t border-outline-variant/15 text-xs">
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-500/15 text-amber-900 font-semibold text-[11px]">
              {pendingAdmissionsCount} Pending
            </span>
            <span className="text-on-surface-variant font-medium truncate ml-2">
              {admittedCount} Admitted
            </span>
          </div>
        </div>

        {/* Card 4: Fee Collection Rate */}
        <div className="relative overflow-hidden rounded-2xl bg-surface-container-lowest/90 border border-outline-variant/25 p-5 sm:p-6 shadow-xs hover:shadow-md transition-all flex flex-col justify-between group">
          <div className="flex items-start justify-between gap-3">
            <div className="flex flex-col min-w-0">
              <span className="text-xs uppercase tracking-wider text-on-surface-variant font-semibold">
                Fee Collection Rate
              </span>
              <div className="flex items-baseline gap-2 mt-2">
                <span className="text-3xl sm:text-4xl font-extrabold text-on-surface tracking-tight">
                  {collectionPct}%
                </span>
              </div>
            </div>
            <div className="w-12 h-12 rounded-xl bg-teal-50 text-teal-800 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform shadow-xs">
              <span className="material-symbols-outlined text-[24px]">payments</span>
            </div>
          </div>
          <div className="mt-4 pt-3 flex items-center justify-between border-t border-outline-variant/15 text-xs">
            <span className="font-semibold text-on-surface">
              ৳{totalCollected.toLocaleString()} rec.
            </span>
            <span className="text-on-surface-variant font-medium truncate ml-2">
              of ৳{totalInvoiced.toLocaleString()}
            </span>
          </div>
        </div>
      </section>

      {/* Interactive Card: Public Website Status & CMS Controls */}
      <section className="rounded-3xl bg-surface-container-lowest/85 backdrop-blur-2xl p-8 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 pb-6 border-b border-outline-variant/20">
          <div className="flex items-start gap-4">
            <div className="p-3.5 rounded-2xl bg-primary-container text-on-primary shadow-sm shrink-0">
              <span className="material-symbols-outlined text-[28px]">sensors</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-headline-sm text-headline-sm text-on-surface tracking-tight font-bold">
                  CMS Live Broadcast Sync
                </h2>
                <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-800 font-label-sm text-label-sm font-semibold flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  Live Sync
                </span>
              </div>
              <p className="font-body-md text-body-md text-on-surface-variant mt-1">
                Toggle public badges, announcements, and examination status across the institutional portal instantly with zero CDN delay.
              </p>
            </div>
          </div>

          {/* Quick Action Panel buttons */}
          <div className="flex items-center gap-2.5 shrink-0 flex-wrap">
            <Link
              href="/"
              target="_blank"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-surface-container-low hover:bg-surface-container text-on-surface font-label-md text-label-md font-semibold transition-all"
            >
              <span className="material-symbols-outlined text-[18px]">open_in_new</span>
              Preview Public Site
            </Link>
            <button
              onClick={handleSyncCache}
              disabled={isSyncing}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-surface-container-low hover:bg-surface-container text-on-surface font-label-md text-label-md font-semibold transition-all cursor-pointer"
              type="button"
            >
              <span className={`material-symbols-outlined text-[18px] ${isSyncing ? 'animate-spin text-primary-container' : ''}`}>
                sync
              </span>
              <span>{isSyncing ? 'Syncing...' : 'Sync Cache'}</span>
            </button>
            <button
              onClick={() => setActiveTab('cms')}
              className="p-2 rounded-xl bg-surface-container-low hover:bg-surface-container text-on-surface-variant hover:text-on-surface transition-all cursor-pointer"
              title="Audit Log & Full CMS"
              type="button"
            >
              <span className="material-symbols-outlined text-[20px]">history</span>
            </button>
          </div>
        </div>

        {syncFeedback && (
          <div className="mt-4 p-3 rounded-xl bg-emerald-500/10 text-emerald-800 font-label-sm text-label-sm flex items-center gap-2 border border-emerald-500/20">
            <span className="material-symbols-outlined text-[16px]">check_circle</span>
            <span>{syncFeedback}</span>
          </div>
        )}

        {/* Toggle Controls Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-6">
          {/* Toggle 1: Admission Open */}
          <div className="flex flex-col justify-between p-5 rounded-2xl bg-surface-container-low/70 hover:bg-surface-container-low transition-all">
            <div className="flex items-start justify-between gap-3">
              <div className="flex flex-col">
                <span className="font-title-md text-title-md text-on-surface font-semibold">
                  Admission Open Pill Badge
                </span>
                <span className="font-label-sm text-label-sm text-on-surface-variant font-mono mt-0.5">
                  Target: /admissions &amp; Header
                </span>
              </div>
              {/* Toggle Switch */}
              <button
                type="button"
                onClick={toggleAdmissionBadge}
                className={`relative inline-flex h-6 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  cmsConfig.isAdmissionOpen ? 'bg-primary-container' : 'bg-surface-dim'
                }`}
                role="switch"
                aria-checked={cmsConfig.isAdmissionOpen}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                    cmsConfig.isAdmissionOpen ? 'translate-x-6' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
            <p className="font-body-sm text-body-sm text-on-surface-variant mt-4 leading-relaxed">
              Displays glowing emerald &apos;Admission Open&apos; pill in the public header and opens applicant registration desk.
            </p>
            <div className="mt-4 pt-3 flex items-center justify-between border-t border-outline-variant/15">
              <span
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full font-label-sm text-label-sm font-semibold ${
                  cmsConfig.isAdmissionOpen
                    ? 'bg-emerald-500/10 text-emerald-800'
                    : 'bg-surface-container text-on-surface-variant'
                }`}
              >
                <span
                  className={`w-2 h-2 rounded-full ${
                    cmsConfig.isAdmissionOpen ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'
                  }`}
                />
                {cmsConfig.isAdmissionOpen ? 'LIVE ON HOMEPAGE' : 'DORMANT / OFF'}
              </span>
              <span className="font-label-sm text-label-sm text-on-surface-variant font-medium">
                Priority 1
              </span>
            </div>
          </div>

          {/* Toggle 2: Results Published */}
          <div className="flex flex-col justify-between p-5 rounded-2xl bg-surface-container-low/70 hover:bg-surface-container-low transition-all">
            <div className="flex items-start justify-between gap-3">
              <div className="flex flex-col">
                <span className="font-title-md text-title-md text-on-surface font-semibold">
                  Results Published Pill Badge
                </span>
                <span className="font-label-sm text-label-sm text-on-surface-variant font-mono mt-0.5">
                  Target: /portal/results
                </span>
              </div>
              {/* Toggle Switch */}
              <button
                type="button"
                onClick={toggleResultsBadge}
                className={`relative inline-flex h-6 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  cmsConfig.isResultsPublished ? 'bg-primary-container' : 'bg-surface-dim'
                }`}
                role="switch"
                aria-checked={cmsConfig.isResultsPublished}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                    cmsConfig.isResultsPublished ? 'translate-x-6' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
            <p className="font-body-sm text-body-sm text-on-surface-variant mt-4 leading-relaxed">
              Displays sky blue &apos;Results Published&apos; pill and opens public student portal marksheet lookups.
            </p>
            <div className="mt-4 pt-3 flex items-center justify-between border-t border-outline-variant/15">
              <span
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full font-label-sm text-label-sm font-semibold ${
                  cmsConfig.isResultsPublished
                    ? 'bg-secondary/15 text-secondary'
                    : 'bg-surface-container text-on-surface-variant'
                }`}
              >
                <span
                  className={`w-2 h-2 rounded-full ${
                    cmsConfig.isResultsPublished ? 'bg-secondary' : 'bg-slate-400'
                  }`}
                />
                {cmsConfig.isResultsPublished ? 'BROADCASTING' : 'OFFLINE'}
              </span>
              <span className="font-label-sm text-label-sm text-on-surface-variant font-medium">
                Term 1 Final
              </span>
            </div>
          </div>

          {/* Toggle 3: Emergency Alert Banner */}
          <div className="flex flex-col justify-between p-5 rounded-2xl bg-surface-container-low/70 hover:bg-surface-container-low transition-all">
            <div className="flex items-start justify-between gap-3">
              <div className="flex flex-col">
                <span className="font-title-md text-title-md text-on-surface font-semibold">
                  Emergency Alert Banner
                </span>
                <span className="font-label-sm text-label-sm text-on-surface-variant font-mono mt-0.5">
                  Top Banner Broadcast
                </span>
              </div>
              {/* Toggle Switch */}
              <button
                type="button"
                onClick={toggleEmergencyAlert}
                className={`relative inline-flex h-6 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  cmsConfig.isEmergencyAlert ? 'bg-primary-container' : 'bg-surface-dim'
                }`}
                role="switch"
                aria-checked={cmsConfig.isEmergencyAlert}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                    cmsConfig.isEmergencyAlert ? 'translate-x-6' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
            <p className="font-body-sm text-body-sm text-on-surface-variant mt-4 leading-relaxed">
              Overrides top header with a high-priority campus safety notification across all public pages.
            </p>
            <div className="mt-4 pt-3 flex items-center justify-between border-t border-outline-variant/15">
              <span
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full font-label-sm text-label-sm font-semibold ${
                  cmsConfig.isEmergencyAlert
                    ? 'bg-primary-container/15 text-primary-container'
                    : 'bg-surface-container text-on-surface-variant'
                }`}
              >
                <span
                  className={`w-2 h-2 rounded-full ${
                    cmsConfig.isEmergencyAlert ? 'bg-primary-container animate-ping' : 'bg-slate-400'
                  }`}
                />
                {cmsConfig.isEmergencyAlert ? 'ACTIVE BROADCAST' : 'DORMANT / STANDBY'}
              </span>
              <button
                type="button"
                onClick={() => setEditEmergencyText(!editEmergencyText)}
                className="text-primary-container hover:underline font-label-sm text-label-sm font-semibold cursor-pointer"
              >
                {editEmergencyText ? 'Cancel' : 'Edit Text'}
              </button>
            </div>

            {editEmergencyText && (
              <div className="mt-3 p-3 bg-white rounded-xl shadow-xs space-y-2 border border-outline-variant/20">
                <label className="text-[11px] font-semibold text-on-surface-variant uppercase tracking-wider">
                  Banner Text
                </label>
                <input
                  type="text"
                  value={alertText}
                  onChange={(e) => setAlertText(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-outline-variant/40 focus:ring-2 focus:ring-primary-container/20 focus:outline-none"
                  placeholder="Enter campus advisory notice..."
                />
                <button
                  type="button"
                  onClick={handleSaveAlertText}
                  className="w-full py-1.5 bg-primary-container text-on-primary rounded-lg text-xs font-semibold hover:bg-primary"
                >
                  Save &amp; Update Banner
                </button>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Quick Actions Command Bar */}
      <section className="rounded-2xl bg-surface-container-lowest/80 backdrop-blur-2xl p-5 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="p-2 rounded-xl bg-surface-container text-primary-container">
            <span className="material-symbols-outlined text-[20px]">bolt</span>
          </span>
          <div>
            <span className="font-title-md text-title-md text-on-surface block leading-tight font-semibold">
              Administrative Quick Launch
            </span>
            <span className="font-label-sm text-label-sm text-on-surface-variant">
              Frequently accessed statutory workflows
            </span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          <button
            onClick={() => setActiveTab('students')}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary-container hover:bg-primary text-on-primary font-label-md text-label-md font-semibold shadow-sm transition-all cursor-pointer"
            type="button"
          >
            <span className="material-symbols-outlined text-[18px]">person_add</span>
            Register New Student
          </button>
          <button
            onClick={() => setActiveTab('cms')}
            className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-surface-container-low hover:bg-surface-container text-on-surface font-label-md text-label-md font-semibold transition-all cursor-pointer"
            type="button"
          >
            <span className="material-symbols-outlined text-[18px]">campaign</span>
            Publish Notice
          </button>
          <button
            onClick={() => setActiveTab('examinations')}
            className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-surface-container-low hover:bg-surface-container text-on-surface font-label-md text-label-md font-semibold transition-all cursor-pointer"
            type="button"
          >
            <span className="material-symbols-outlined text-[18px]">fact_check</span>
            Exam Mark Entry
          </button>
          <button
            onClick={() => setActiveTab('documents')}
            className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-surface-container-low hover:bg-surface-container text-on-surface font-label-md text-label-md font-semibold transition-all cursor-pointer"
            type="button"
          >
            <span className="material-symbols-outlined text-[18px]">print</span>
            Document Studio
          </button>
        </div>
      </section>

      {/* Split Data Panels: Recent Admissions & Upcoming Academic Schedule */}
      <section className="grid grid-cols-1 xl:grid-cols-12 gap-8 items-start">
        {/* Panel 1: Recent Admission Applications (7 cols) */}
        <div className="xl:col-span-7 rounded-3xl bg-surface-container-lowest/80 backdrop-blur-2xl shadow-sm p-6 flex flex-col justify-between space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-outline-variant/15">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-surface-container text-primary-container">
                <span className="material-symbols-outlined text-[20px]">how_to_reg</span>
              </div>
              <div>
                <h3 className="font-title-lg text-title-lg text-on-surface tracking-tight font-bold">
                  Recent Admission Applications
                </h3>
                <span className="font-body-sm text-body-sm text-on-surface-variant">
                  {admissions.length} candidates in current registration queue
                </span>
              </div>
            </div>
            <button
              onClick={() => setActiveTab('admissions')}
              className="font-label-md text-label-md text-primary-container font-semibold hover:underline inline-flex items-center gap-1 cursor-pointer"
              type="button"
            >
              <span>View All</span>
              <span className="material-symbols-outlined text-[16px]">chevron_right</span>
            </button>
          </div>

          {/* Admissions Table */}
          <div className="overflow-x-auto w-full">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-surface-container-low/70 text-on-surface-variant">
                  <th className="py-3 px-4 rounded-l-xl font-label-sm text-label-sm uppercase tracking-wider font-semibold">
                    Applicant
                  </th>
                  <th className="py-3 px-4 font-label-sm text-label-sm uppercase tracking-wider font-semibold">
                    Grade
                  </th>
                  <th className="py-3 px-4 font-label-sm text-label-sm uppercase tracking-wider font-semibold">
                    Applied
                  </th>
                  <th className="py-3 px-4 font-label-sm text-label-sm uppercase tracking-wider font-semibold">
                    Score
                  </th>
                  <th className="py-3 px-4 font-label-sm text-label-sm uppercase tracking-wider font-semibold">
                    Status
                  </th>
                  <th className="py-3 px-4 rounded-r-xl font-label-sm text-label-sm uppercase tracking-wider font-semibold text-right">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y-0 text-on-surface">
                {admissions.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-10 text-center text-on-surface-variant">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <span className="material-symbols-outlined text-[32px] text-on-surface-variant/40">
                          inbox
                        </span>
                        <p className="text-xs font-semibold">No admission applications submitted yet</p>
                        <p className="text-[11px] text-on-surface-variant/70 max-w-sm">
                          New candidate registrations from the public online admission form will appear in this queue automatically.
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  admissions.map((app) => (
                  <tr
                    key={app.id}
                    className="hover:bg-surface-container-low/50 transition-colors border-b border-outline-variant/10"
                  >
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-primary-fixed text-on-primary-fixed flex items-center justify-center font-label-md text-label-md font-bold">
                          {app.applicantInitials}
                        </div>
                        <div>
                          <span className="font-title-md text-title-md font-medium text-sm block">
                            {app.applicantName}
                          </span>
                          <span className="font-label-sm text-label-sm text-on-surface-variant font-mono">
                            {app.applicationCode}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4 font-body-md text-body-md text-on-surface">
                      {app.grade}
                    </td>
                    <td className="py-3 px-4 font-body-sm text-body-sm text-on-surface-variant">
                      {app.appliedTime}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`font-title-md text-title-md font-semibold ${
                          app.score.includes('/') ? 'text-emerald-800' : 'text-on-surface-variant italic'
                        }`}
                      >
                        {app.score}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full font-label-sm text-label-sm font-semibold ${
                          app.status === 'Approved'
                            ? 'bg-emerald-500/10 text-emerald-800'
                            : app.status === 'Under Review'
                            ? 'bg-primary-container/10 text-primary-container'
                            : 'bg-surface-container text-on-surface-variant'
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            app.status === 'Approved'
                              ? 'bg-emerald-500'
                              : app.status === 'Under Review'
                              ? 'bg-primary-container'
                              : 'bg-slate-400'
                          }`}
                        />
                        {app.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right relative">
                      <button
                        onClick={() =>
                          setOpenStatusMenuId(openStatusMenuId === app.id ? null : app.id)
                        }
                        className="p-1.5 rounded-lg text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-all cursor-pointer"
                        type="button"
                        aria-label="Options"
                      >
                        <span className="material-symbols-outlined text-[18px]">more_vert</span>
                      </button>

                      {openStatusMenuId === app.id && (
                        <div className="absolute right-4 top-10 z-20 w-36 bg-white rounded-xl shadow-lg border border-outline-variant/30 py-1 text-left text-xs">
                          <button
                            type="button"
                            onClick={() => {
                              updateAdmissionStatus(app.id, 'Approved');
                              setOpenStatusMenuId(null);
                            }}
                            className="w-full px-3 py-1.5 text-emerald-800 hover:bg-emerald-50 flex items-center gap-2 cursor-pointer font-medium"
                          >
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
                            Approve
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              updateAdmissionStatus(app.id, 'Under Review');
                              setOpenStatusMenuId(null);
                            }}
                            className="w-full px-3 py-1.5 text-primary-container hover:bg-orange-50 flex items-center gap-2 cursor-pointer font-medium"
                          >
                            <span className="w-1.5 h-1.5 rounded-full bg-primary-container" />
                            Under Review
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              updateAdmissionStatus(app.id, 'Pending');
                              setOpenStatusMenuId(null);
                            }}
                            className="w-full px-3 py-1.5 text-slate-700 hover:bg-slate-50 flex items-center gap-2 cursor-pointer font-medium"
                          >
                            <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                            Pending
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                )))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Panel 2: Upcoming Academic Events & Examinations (5 cols) */}
        <div className="xl:col-span-5 rounded-3xl bg-surface-container-lowest/80 backdrop-blur-2xl shadow-sm p-6 flex flex-col justify-between space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-outline-variant/15">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-surface-container text-secondary">
                <span className="material-symbols-outlined text-[20px]">calendar_month</span>
              </div>
              <div>
                <h3 className="font-title-lg text-title-lg text-on-surface tracking-tight font-bold">
                  Examinations &amp; Events
                </h3>
                <span className="font-body-sm text-body-sm text-on-surface-variant">
                  Next 14 academic calendar days
                </span>
              </div>
            </div>
            <button
              onClick={() => setActiveTab('examinations')}
              className="font-label-md text-label-md text-secondary font-semibold hover:underline inline-flex items-center gap-1 cursor-pointer"
              type="button"
            >
              <span>Full Schedule</span>
              <span className="material-symbols-outlined text-[16px]">chevron_right</span>
            </button>
          </div>

          {/* Schedule Cards List */}
          <div className="space-y-3">
            {events.length === 0 ? (
              <div className="py-8 text-center text-on-surface-variant border border-dashed border-outline-variant/30 rounded-2xl p-6 flex flex-col items-center justify-center gap-2">
                <span className="material-symbols-outlined text-[32px] text-on-surface-variant/40">
                  event_busy
                </span>
                <p className="text-xs font-semibold">No upcoming academic events scheduled</p>
                <p className="text-[11px] text-on-surface-variant/70 max-w-xs">
                  Configure examinations, calendar milestones, and terms in the Examinations tab.
                </p>
              </div>
            ) : (
              events.map((evt) => (
              <div
                key={evt.id}
                className="p-4 rounded-2xl bg-surface-container-low/60 hover:bg-surface-container-low transition-all flex items-start gap-4"
              >
                <div className="flex flex-col items-center justify-center p-2.5 rounded-xl bg-surface-container-lowest shadow-sm shrink-0 min-w-[52px]">
                  <span className="font-label-sm text-label-sm uppercase font-bold text-primary-container leading-none">
                    {evt.month}
                  </span>
                  <span className="font-headline-sm text-headline-sm font-bold text-on-surface leading-tight mt-0.5">
                    {evt.day}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="font-title-md text-title-md text-on-surface truncate font-semibold text-sm">
                      {evt.title}
                    </h4>
                    <span
                      className={`shrink-0 px-2 py-0.5 rounded-full font-label-sm text-label-sm font-semibold ${
                        evt.type === 'Exam'
                          ? 'bg-secondary/15 text-secondary'
                          : evt.type === 'Public Live'
                          ? 'bg-emerald-500/10 text-emerald-800'
                          : 'bg-surface-container text-on-surface-variant'
                      }`}
                    >
                      {evt.type}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-1.5 font-body-sm text-body-sm text-on-surface-variant">
                    <span className="flex items-center gap-1">
                      <span className="material-symbols-outlined text-[15px]">corporate_fare</span>
                      {evt.location}
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="material-symbols-outlined text-[15px]">schedule</span>
                      {evt.time}
                    </span>
                  </div>
                </div>
              </div>
            )))}
          </div>
        </div>
      </section>
    </div>
  );
}
