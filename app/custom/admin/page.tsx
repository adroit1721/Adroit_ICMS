'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useERPStore } from '@/lib/store';
import AdminSidebar, { AdminTab } from '@/components/admin/AdminSidebar';
import AdminHeader from '@/components/admin/AdminHeader';
import DashboardTab from '@/components/admin/DashboardTab';
import CMSTab from '@/components/admin/CMSTab';
import AcademicsSetupTab from '@/components/admin/AcademicsSetupTab';
import StudentsTab from '@/components/admin/StudentsTab';
import TeachersTab from '@/components/admin/TeachersTab';
import AdmissionsTab from '@/components/admin/AdmissionsTab';
import ExaminationsTab from '@/components/admin/ExaminationsTab';
import DocumentsTab from '@/components/admin/DocumentsTab';
import BillingTab from '@/components/admin/BillingTab';
import SmsTab from '@/components/admin/SmsTab';
import SystemTab from '@/components/admin/SystemTab';

export default function CustomAdminPage() {
  const router = useRouter();
  const { state, isHydrated, dbStatus, clearDbError } = useERPStore();
  const { cmsConfig, currentUser } = state;

  const [activeTab, setActiveTab] = useState<AdminTab>('dashboard');
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  useEffect(() => {
    if (isHydrated && (!currentUser || !currentUser.isLoggedIn)) {
      router.push('/custom/admin/login');
    }
  }, [isHydrated, currentUser, router]);

  if (!isHydrated) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-8 text-xs font-semibold text-on-surface-variant">
        Loading ERP Command Center...
      </div>
    );
  }

  return (
    <div className="bg-background font-body-md text-on-surface antialiased selection:bg-primary-fixed selection:text-on-primary-fixed min-h-screen relative">
      {/* Dynamic Atmospheric Blurred Glow Underlay */}
      <div className="fixed inset-0 pointer-events-none -z-10 overflow-hidden no-print">
        <div className="absolute -top-32 left-1/3 w-[550px] h-[550px] bg-secondary-fixed/20 rounded-full blur-[140px]" />
        <div className="absolute bottom-10 right-10 w-[450px] h-[450px] bg-primary-fixed/20 rounded-full blur-[120px]" />
      </div>

      {/* Responsive Fixed Aside / Sidebar */}
      <AdminSidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        crestUrl={cmsConfig.crestUrl}
        mobileOpen={mobileSidebarOpen}
        onCloseMobile={() => setMobileSidebarOpen(false)}
      />

      {/* Main Administrative Layout Container */}
      <div className="lg:pl-64 print:pl-0 flex flex-col min-h-screen">
        {/* Responsive Fixed Administrative Header */}
        <AdminHeader
          principalName={cmsConfig.principalName}
          principalPhotoUrl={cmsConfig.principalPhotoUrl}
          isAdmissionOpen={cmsConfig.isAdmissionOpen}
          isResultsPublished={cmsConfig.isResultsPublished}
          onToggleMobileSidebar={() => setMobileSidebarOpen((p) => !p)}
          onNavigateTab={setActiveTab}
        />

        {/* Dynamic Main Workspace Area */}
        <main className="w-full flex-1 pt-20 px-4 sm:px-8 py-8 print:pt-0 print:px-0 print:py-0 bg-transparent">
          {dbStatus.lastMutationError && (
            <div className="mb-5 p-3.5 rounded-2xl bg-error-container/35 border border-error/30 text-error text-xs font-semibold flex items-center justify-between gap-3 no-print">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[18px] shrink-0">error</span>
                <span>Save failed: {dbStatus.lastMutationError}</span>
              </div>
              <button
                type="button"
                onClick={clearDbError}
                className="px-2.5 py-1 rounded-lg bg-white/80 hover:bg-white text-error border border-error/25 text-[11px] font-bold cursor-pointer shrink-0"
              >
                Dismiss
              </button>
            </div>
          )}
          {activeTab === 'dashboard' && <DashboardTab setActiveTab={setActiveTab} />}
          {activeTab === 'cms' && <CMSTab />}
          {activeTab === 'academics' && <AcademicsSetupTab />}
          {activeTab === 'students' && <StudentsTab />}
          {activeTab === 'teachers' && <TeachersTab />}
          {activeTab === 'admissions' && <AdmissionsTab />}
          {activeTab === 'examinations' && <ExaminationsTab />}
          {activeTab === 'documents' && <DocumentsTab />}
          {activeTab === 'billing' && <BillingTab />}
          {activeTab === 'sms' && <SmsTab />}
          {activeTab === 'system' && <SystemTab />}
        </main>
      </div>
    </div>
  );
}
