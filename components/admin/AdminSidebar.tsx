'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useERPStore } from '@/lib/store';

export type AdminTab =
  | 'dashboard'
  | 'cms'
  | 'academics'
  | 'students'
  | 'teachers'
  | 'examinations'
  | 'documents'
  | 'billing'
  | 'admissions'
  | 'sms'
  | 'system';

interface AdminSidebarProps {
  activeTab: AdminTab;
  setActiveTab: (tab: AdminTab) => void;
  crestUrl: string;
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
}

export default function AdminSidebar({
  activeTab,
  setActiveTab,
  crestUrl,
  mobileOpen = false,
  onCloseMobile,
}: AdminSidebarProps) {
  const router = useRouter();
  const { state, logout } = useERPStore();
  const pendingAdmissions = state.admissions.filter((a) => a.status !== 'Admitted').length;

  const navItems: Array<{
    id: AdminTab;
    label: string;
    icon: string;
    badge?: string;
  }> = [
    { id: 'dashboard', label: 'Dashboard', icon: 'grid_view' },
    { id: 'cms', label: 'Website CMS', icon: 'web' },
    { id: 'academics', label: 'Institute', icon: 'account_tree' },
    { id: 'students', label: 'Student Management', icon: 'group' },
    { id: 'teachers', label: 'Teachers & staff', icon: 'badge' },
    {
      id: 'admissions',
      label: 'Admission',
      icon: 'how_to_reg',
      badge: pendingAdmissions > 0 ? `${pendingAdmissions}` : undefined,
    },
    { id: 'examinations', label: 'Examination', icon: 'assignment_turned_in' },
    { id: 'documents', label: 'Document Studio', icon: 'print', badge: '7 Docs' },
    { id: 'billing', label: 'Billing & MFS API', icon: 'payments' },
    { id: 'sms', label: 'SMS Management', icon: 'sms' },
    { id: 'system', label: 'Settings & Users', icon: 'manage_accounts' },
  ];

  return (
    <>
      {mobileOpen && (
        <div
          onClick={onCloseMobile}
          className="fixed inset-0 bg-slate-950/50 backdrop-blur-xs z-40 lg:hidden no-print"
        />
      )}
      <aside
        className={`fixed left-0 top-0 h-full w-64 bg-white/95 lg:bg-white/85 backdrop-blur-2xl z-50 flex flex-col justify-between py-5 shadow-[4px_0_24px_-4px_rgba(19,27,46,0.04)] no-print overflow-y-auto transition-transform duration-200 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        } lg:translate-x-0`}
      >
        <div className="flex flex-col">
          {/* Header Institution Crest & Brand */}
          <div className="px-6 mb-6 flex items-center justify-between gap-2">
            <div className="flex items-center gap-3 min-w-0">
              {crestUrl ? (
                <img
                  alt={state.cmsConfig.schoolName}
                  className="h-8 w-auto object-contain shrink-0"
                  src={crestUrl}
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="w-8 h-8 rounded-lg bg-primary-fixed/50 text-primary-container flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-[18px]">school</span>
                </div>
              )}
              <div className="flex flex-col min-w-0">
                <span className="font-headline-sm text-sm text-on-surface tracking-tight leading-none font-bold truncate">
                  {state.cmsConfig.schoolName}
                </span>
                <span className="font-label-sm text-label-sm uppercase tracking-wider text-primary-container font-semibold mt-1">
                  ERP Suite
                </span>
              </div>
            </div>
            {onCloseMobile && (
              <button
                type="button"
                onClick={onCloseMobile}
                aria-label="Close Sidebar"
                className="lg:hidden p-1 rounded-lg hover:bg-surface-container cursor-pointer"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            )}
          </div>

          {/* Navigation Links */}
          <nav className="px-3 space-y-1 flex flex-col">
            {navItems.map((item) => {
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setActiveTab(item.id);
                    onCloseMobile?.();
                  }}
                  className={`flex items-center justify-between px-3.5 py-2 rounded-xl text-xs transition-all text-left cursor-pointer ${
                    isActive
                      ? 'bg-primary-container text-on-primary shadow-[0_4px_16px_rgba(154,52,18,0.22)] font-semibold'
                      : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface font-medium'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="material-symbols-outlined text-[18px] shrink-0">
                      {item.icon}
                    </span>
                    <span className="truncate">{item.label}</span>
                  </div>
                  {item.badge && (
                    <span
                      className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md shrink-0 ${
                        isActive
                          ? 'bg-white/20 text-white'
                          : 'bg-primary-fixed text-on-primary-fixed-variant'
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Sidebar Footer Actions */}
        <div className="px-4 pt-4 space-y-2 border-t border-outline-variant/15 mt-4">
          <Link
            href="/"
            className="flex items-center justify-center gap-2 w-full py-2 px-3 rounded-xl bg-surface-container-low hover:bg-surface-container text-on-surface font-label-sm text-xs font-semibold transition-colors"
          >
            <span className="material-symbols-outlined text-[16px]">home</span>
            <span>View Public Website</span>
          </Link>
          <button
            type="button"
            onClick={async () => {
              await logout();
              router.push('/custom/admin/login');
            }}
            className="flex items-center justify-center gap-2 w-full py-2 px-3 rounded-xl bg-red-50 hover:bg-red-100 text-red-700 font-label-sm text-xs font-semibold transition-colors cursor-pointer"
          >
            <span className="material-symbols-outlined text-[16px]">logout</span>
            <span>Sign Out</span>
          </button>
        </div>
      </aside>
    </>
  );
}

