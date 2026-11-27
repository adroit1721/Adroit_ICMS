'use client';

import { useState } from 'react';
import { useERPStore } from '@/lib/store';
import { AdminTab } from './AdminSidebar';

interface AdminHeaderProps {
  principalName: string;
  principalPhotoUrl: string;
  isAdmissionOpen: boolean;
  isResultsPublished: boolean;
  onToggleMobileSidebar?: () => void;
  onNavigateTab?: (tab: AdminTab) => void;
}

export default function AdminHeader({
  principalName,
  principalPhotoUrl,
  isAdmissionOpen,
  isResultsPublished,
  onToggleMobileSidebar,
  onNavigateTab,
}: AdminHeaderProps) {
  const { state } = useERPStore();
  const [showNotif, setShowNotif] = useState(false);

  const pendingAdmissions = state.admissions.filter((a) => a.status !== 'Admitted').length;
  const pendingUpdates = state.students.filter((s) => s.updateRequestStatus === 'Pending').length;
  const unpaidInvoices = state.invoices.filter((i) => i.status !== 'Paid').length;

  return (
    <header className="fixed top-0 left-0 lg:left-64 right-0 h-16 bg-white/80 backdrop-blur-2xl z-40 px-4 sm:px-8 flex items-center justify-between gap-4 shadow-[0_4px_24px_-4px_rgba(19,27,46,0.03)] no-print">
      {/* Mobile Drawer Button + Institutional Header Title */}
      <div className="flex items-center gap-3 min-w-0">
        {onToggleMobileSidebar && (
          <button
            type="button"
            onClick={onToggleMobileSidebar}
            aria-label="Open Menu"
            className="lg:hidden p-2 rounded-xl bg-surface-container-low text-on-surface shrink-0 cursor-pointer"
          >
            <span className="material-symbols-outlined text-[20px]">menu</span>
          </button>
        )}
        <div className="min-w-0">
          <h2 className="font-headline-sm text-sm sm:text-base font-bold text-on-surface truncate">
            {state.cmsConfig.schoolName || 'Institutional ERP'}
          </h2>
          <p className="text-[11px] text-on-surface-variant hidden sm:block truncate">
            Administration &amp; Academic Command Center
          </p>
        </div>
      </div>

      {/* Right Controls */}
      <div className="flex items-center gap-3 sm:gap-4 shrink-0 relative">
        {/* Live Broadcast Status Badge */}
        <div className="hidden xl:flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 text-emerald-800 font-label-sm text-label-sm font-semibold">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span>CMS Live</span>
          <span className="text-emerald-700/60 font-normal">
            ({isAdmissionOpen ? 'Admissions Open' : 'Closed'} &bull; {isResultsPublished ? 'Results Live' : 'Draft'})
          </span>
        </div>


        {/* Notification Bell */}
        <div className="relative">
          <button
            onClick={() => setShowNotif((prev) => !prev)}
            className="p-2 rounded-xl bg-surface-container-low hover:bg-surface-container text-on-surface-variant hover:text-on-surface transition-all relative cursor-pointer"
            type="button"
            aria-label="Notifications"
          >
            <span className="material-symbols-outlined text-[20px]">notifications</span>
            {(pendingAdmissions > 0 || pendingUpdates > 0) && (
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-primary-container rounded-full" />
            )}
          </button>

          {showNotif && (
            <div className="absolute right-0 top-12 w-72 bg-white rounded-2xl shadow-xl border border-outline-variant/30 p-3 z-50 space-y-2 text-xs">
              <div className="font-bold text-on-surface pb-1 border-b border-outline-variant/20">
                Action Alerts
              </div>
              <button
                type="button"
                onClick={() => {
                  onNavigateTab?.('admissions');
                  setShowNotif(false);
                }}
                className="w-full text-left p-2 rounded-xl hover:bg-surface-container-low flex justify-between cursor-pointer"
              >
                <span>Pending Admissions</span>
                <strong className="text-primary-container">{pendingAdmissions}</strong>
              </button>
              <button
                type="button"
                onClick={() => {
                  onNavigateTab?.('students');
                  setShowNotif(false);
                }}
                className="w-full text-left p-2 rounded-xl hover:bg-surface-container-low flex justify-between cursor-pointer"
              >
                <span>Profile Update Requests</span>
                <strong className="text-amber-700">{pendingUpdates}</strong>
              </button>
              <button
                type="button"
                onClick={() => {
                  onNavigateTab?.('billing');
                  setShowNotif(false);
                }}
                className="w-full text-left p-2 rounded-xl hover:bg-surface-container-low flex justify-between cursor-pointer"
              >
                <span>Unpaid Fee Invoices</span>
                <strong className="text-red-700">{unpaidInvoices}</strong>
              </button>
            </div>
          )}
        </div>

        {/* Profile Card */}
        <div className="flex items-center gap-2.5 pl-2 border-l border-outline-variant/30">
          {principalPhotoUrl ? (
            <img
              alt={principalName}
              className="w-8 h-8 rounded-full object-cover ring-2 ring-white/90 shadow-sm"
              src={principalPhotoUrl}
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="w-8 h-8 rounded-full bg-primary-fixed/60 text-primary-container font-bold text-xs flex items-center justify-center ring-2 ring-white/90 shadow-sm shrink-0">
              {(state.currentUser.username || principalName || 'AD').slice(0, 2).toUpperCase()}
            </div>
          )}
          <div className="hidden md:flex flex-col text-left">
            <span className="font-title-md text-title-md text-on-surface leading-tight text-sm font-semibold">
              {state.currentUser.username || principalName}
            </span>
            <span className="font-label-sm text-label-sm text-on-surface-variant font-medium leading-tight text-[11px]">
              {state.currentUser.role || 'Administrator'}
            </span>
          </div>
        </div>
      </div>
    </header>
  );
}
