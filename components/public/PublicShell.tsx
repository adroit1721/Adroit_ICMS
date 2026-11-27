'use client';

import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useERPStore } from '@/lib/store';
import { Exam, ExamResultRecord, NavbarMenuItem } from '@/lib/types';
import { generateQrDataUrl } from '@/lib/qr';
import { RenderCmsIcon } from '@/lib/cms-icons';
import { getEffectiveSectionsForClassGroup } from '@/lib/academic-helpers';
import { downloadMarksheetAsPdf, printMarksheetDocument } from '@/lib/marksheet-pdf';
import MarksheetDocument from '@/components/common/MarksheetDocument';
import {
  AlertCircle,
  ArrowLeft,
  Award,
  Download,
  Hash,
  IdCard,
  Printer,
  RefreshCw,
  Search,
  X,
} from 'lucide-react';

export type PublicRoutePath =
  | '/'
  | '/about'
  | '/academics'
  | '/admissions'
  | '/alumni'
  | '/notices'
  | '/contact';

interface PublicShellContextValue {
  openResultPortal: () => void;
}

const PublicShellContext = createContext<PublicShellContextValue>({
  openResultPortal: () => {},
});

export function usePublicShell() {
  return useContext(PublicShellContext);
}

interface PublicShellProps {
  children: React.ReactNode;
  activePath?: PublicRoutePath;
}

interface NavSubItem {
  href: string;
  label: string;
  description: string;
  icon: string;
}

interface NavItem {
  id: string;
  href: PublicRoutePath;
  label: string;
  icon?: string;
  matchPaths: PublicRoutePath[];
  children?: NavSubItem[];
}

const NAV_ITEMS: NavItem[] = [
  {
    id: 'home',
    href: '/',
    label: 'Home',
    icon: 'Home',
    matchPaths: ['/'],
  },
  {
    id: 'about',
    href: '/about',
    label: 'About Us',
    icon: 'Building2',
    matchPaths: ['/about'],
    children: [
      {
        href: '/about#details',
        label: 'School Details and History',
        description: 'Institutional heritage & leadership',
        icon: 'BookOpen',
      },
      {
        href: '/about#at-a-glance',
        label: 'At a Glance',
        description: 'Live campus facts, EIIN & metrics',
        icon: 'BarChart3',
      },
      {
        href: '/about#teachers-staff',
        label: "Teachers & Staffs",
        description: 'Certified academic faculty directory',
        icon: 'Users',
      },
      {
        href: '/about#smc',
        label: 'School Managing Committee (SMC)',
        description: 'Board of governors & oversight',
        icon: 'ShieldCheck',
      },
    ],
  },
  {
    id: 'academics',
    href: '/academics',
    label: 'Academics',
    icon: 'GraduationCap',
    matchPaths: ['/academics', '/admissions'],
    children: [
      {
        href: '/academics#class-routine',
        label: 'Classes Routine',
        description: 'Daily shift & grade timetable',
        icon: 'Calendar',
      },
      {
        href: '/academics#exam-results',
        label: 'Examination & Results',
        description: 'NCTB grading, subjects & results',
        icon: 'Award',
      },
      {
        href: '/admissions',
        label: 'Admission',
        description: 'Online application & intake rules',
        icon: 'ClipboardList',
      },
    ],
  },
  {
    id: 'alumni',
    href: '/alumni',
    label: 'Alumni',
    icon: 'Users',
    matchPaths: ['/alumni'],
  },
  {
    id: 'notices',
    href: '/notices',
    label: 'Notice',
    icon: 'Megaphone',
    matchPaths: ['/notices'],
  },
  {
    id: 'contact',
    href: '/contact',
    label: 'Contact',
    icon: 'Phone',
    matchPaths: ['/contact'],
  },
];

export default function PublicShell({ children, activePath = '/' }: PublicShellProps) {
  const { state } = useERPStore();
  const { cmsConfig } = state;

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [mobileExpanded, setMobileExpanded] = useState<string | null>(null);
  const [showResultPortal, setShowResultPortal] = useState(false);
  const navRef = useRef<HTMLDivElement>(null);

  // Public Result Search Filters (strictly Published exams only)
  const publishedExams = state.exams.filter((ex) => ex.status === 'Published');
  const availableExams = publishedExams;
  const uniqueYears = Array.from(new Set(availableExams.map((ex) => ex.academicYear)));

  const [searchMode, setSearchMode] = useState<'id' | 'class-roll'>('id');
  const [selectedExamId, setSelectedExamId] = useState<string>('');
  const [selectedYear, setSelectedYear] = useState<string>('');
  const [selectedClass, setSelectedClass] = useState<string>('');
  const [selectedSection, setSelectedSection] = useState<string>('Any');
  const [studentIdQuery, setStudentIdQuery] = useState<string>('');
  const [rollQuery, setRollQuery] = useState('');
  const [activeResult, setActiveResult] = useState<ExamResultRecord | null>(null);
  const [activeExam, setActiveExam] = useState<Exam | null>(null);
  const [activeStudentMeta, setActiveStudentMeta] = useState<{
    avatarUrl?: string;
    banglaName?: string;
    dateOfBirth?: string;
  } | null>(null);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string>('');
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [isSearchingResult, setIsSearchingResult] = useState(false);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);
  const marksheetSheetRef = useRef<HTMLDivElement | null>(null);

  const resolvedExamId = availableExams.some((ex) => ex.id === selectedExamId)
    ? selectedExamId
    : availableExams[0]?.id || '';
  const activeSearchExam =
    availableExams.find((ex) => ex.id === resolvedExamId) || availableExams[0];
  const resolvedYear = uniqueYears.includes(selectedYear)
    ? selectedYear
    : activeSearchExam?.academicYear || uniqueYears[0] || new Date().getFullYear().toString();

  const examTargetClasses = activeSearchExam?.targetClasses || [];
  const allConfiguredClasses = Array.from(
    new Set([
      ...examTargetClasses,
      ...state.academicClasses.map((c) => c.name),
      ...state.students.map((s) => s.className),
      ...(activeSearchExam?.savedTabulation?.records || []).map((r) => r.className),
    ])
  ).filter(Boolean);
  const effectiveUniqueClasses =
    examTargetClasses.length > 0 ? examTargetClasses : allConfiguredClasses;
  const resolvedClass = effectiveUniqueClasses.includes(selectedClass)
    ? selectedClass
    : effectiveUniqueClasses[0] || '';

  const activeClassObj = state.academicClasses.find((c) => c.name === resolvedClass);
  const classSections = activeClassObj
    ? getEffectiveSectionsForClassGroup(activeClassObj, 'All').filter((s) => s && s !== 'Common')
    : [];
  const classHasSections = Boolean(
    activeClassObj && activeClassObj.hasSections !== false && classSections.length > 0
  );
  const resolvedSection =
    classHasSections && classSections.includes(selectedSection) ? selectedSection : 'Any';

  // Security Captcha
  const [captchaNum1, setCaptchaNum1] = useState(5);
  const [captchaNum2, setCaptchaNum2] = useState(3);
  const [captchaInput, setCaptchaInput] = useState('');
  const [captchaError, setCaptchaError] = useState(false);

  const activeNavItems: NavbarMenuItem[] = (
    cmsConfig.navMenuItems && cmsConfig.navMenuItems.length > 0
      ? cmsConfig.navMenuItems
      : NAV_ITEMS.map((item) => ({
          id: item.id,
          label: item.label,
          href: item.href,
          icon: item.icon,
          visible: true,
          children: item.children?.map((sub, i) => ({
            id: `${item.id}-sub-${i}`,
            label: sub.label,
            href: sub.href,
            description: sub.description,
            icon: sub.icon,
          })),
        }))
  ).filter((item) => item.visible !== false);

  const headerLayout = cmsConfig.headerLayout || 'classic-centered';

  useEffect(() => {
    if (!cmsConfig.faviconUrl || typeof document === 'undefined') return;
    let link = document.querySelector<HTMLLinkElement>("link[rel='icon']");
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    link.href = cmsConfig.faviconUrl;
  }, [cmsConfig.faviconUrl]);

  useEffect(() => {
    const handleOutside = (event: MouseEvent) => {
      if (navRef.current && !navRef.current.contains(event.target as Node)) {
        setOpenDropdown(null);
      }
    };
    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpenDropdown(null);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('keydown', handleEsc);
    };
  }, []);

  const resetCaptcha = () => {
    const n1 = Math.floor(Math.random() * 8) + 2;
    const n2 = Math.floor(Math.random() * 8) + 1;
    setCaptchaNum1(n1);
    setCaptchaNum2(n2);
    setCaptchaInput('');
    setCaptchaError(false);
  };

  const openResultPortal = () => {
    setLookupError(null);
    setActiveResult(null);
    setActiveExam(null);
    setActiveStudentMeta(null);
    resetCaptcha();
    setShowResultPortal(true);
    setMobileMenuOpen(false);
  };

  const handleFetchResult = async (e: React.FormEvent) => {
    e.preventDefault();
    setLookupError(null);

    if (parseInt(captchaInput, 10) !== captchaNum1 + captchaNum2) {
      setCaptchaError(true);
      return;
    }
    setCaptchaError(false);

    const exam =
      availableExams.find(
        (ex) =>
          (resolvedExamId ? ex.id === resolvedExamId : true) &&
          (resolvedYear ? ex.academicYear === resolvedYear : true)
      ) || activeSearchExam;

    if (!exam) {
      setLookupError(
        'No published examination is available yet. Results will appear here once published.'
      );
      return;
    }

    if (searchMode === 'id') {
      if (!studentIdQuery.trim()) {
        setLookupError('Please enter your Student ID or Registration Number.');
        return;
      }
    } else {
      if (!resolvedClass) {
        setLookupError('Please select your Class.');
        return;
      }
      const rollNum = parseInt(rollQuery.trim(), 10);
      if (Number.isNaN(rollNum) || rollNum <= 0) {
        setLookupError('Please enter a valid numeric Class Roll Number.');
        return;
      }
    }

    setIsSearchingResult(true);
    try {
      const payload =
        searchMode === 'id'
          ? {
              examId: exam.id,
              searchMode: 'id',
              studentIdQuery: studentIdQuery.trim(),
            }
          : {
              examId: exam.id,
              searchMode: 'class-roll',
              className: resolvedClass,
              sectionName: classHasSections ? resolvedSection : 'Any',
              rollNumber: parseInt(rollQuery.trim(), 10),
            };

      const res = await fetch('/api/public/results-lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const rawText = await res.text();
      let data: {
        error?: string;
        result?: ExamResultRecord;
        exam?: Exam;
        studentMeta?: { avatarUrl?: string; banglaName?: string; dateOfBirth?: string } | null;
      } = {};
      if (rawText && !rawText.trim().startsWith('<')) {
        try {
          data = JSON.parse(rawText);
        } catch {
          data = {};
        }
      }
      if (!res.ok || !data.result) {
        setLookupError(
          data.error ||
            (rawText.trim().startsWith('<')
              ? `Server returned HTML (HTTP ${res.status}). Please retry in a moment.`
              : 'No matching examinee found for the provided criteria.')
        );
        return;
      }

      setActiveExam(data.exam || exam);
      setActiveResult(data.result);
      setActiveStudentMeta(data.studentMeta || null);

      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      generateQrDataUrl(
        `${origin}/academics?verify=${encodeURIComponent(data.result.id)}&sysId=${encodeURIComponent(
          data.result.systemId
        )}`
      ).then(setQrCodeDataUrl);
    } catch {
      setLookupError('Unable to reach the Examination Registry server. Please try again.');
    } finally {
      setIsSearchingResult(false);
    }
  };

  const handleDownloadPublicPdf = async () => {
    if (!marksheetSheetRef.current || !activeResult) return;
    setIsDownloadingPdf(true);
    try {
      await downloadMarksheetAsPdf(
        marksheetSheetRef.current,
        `Marksheet-${activeResult.studentName}-Roll-${activeResult.rollNumber}`
      );
    } finally {
      setIsDownloadingPdf(false);
    }
  };

  const handlePrintPublicMarksheet = () => {
    if (!activeResult) return;
    printMarksheetDocument(
      `Marksheet-${activeResult.studentName}-Roll-${activeResult.rollNumber}`
    );
  };

  if (cmsConfig.isMaintenanceMode) {
    return (
      <div className="bg-background font-body-md text-on-surface min-h-screen flex items-center justify-center p-6 relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none -z-10 overflow-hidden">
          <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-primary-fixed/20 rounded-full blur-[140px]" />
          <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] bg-secondary-fixed/20 rounded-full blur-[120px]" />
        </div>
        <div className="max-w-lg w-full bg-white/85 backdrop-blur-2xl rounded-[2rem] p-8 sm:p-10 shadow-2xl text-center space-y-6 border border-outline-variant/30">
          {cmsConfig.crestUrl && (
            <img
              src={cmsConfig.crestUrl}
              alt={cmsConfig.schoolName}
              className="h-16 w-auto object-contain mx-auto"
              referrerPolicy="no-referrer"
            />
          )}
          <div className="space-y-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-100 text-amber-900 font-label-sm text-label-sm font-semibold">
              <span className="w-2 h-2 rounded-full bg-amber-600 animate-pulse" />
              Scheduled Campus Maintenance
            </span>
            <h1 className="font-headline-sm text-headline-sm font-bold text-on-surface">
              {cmsConfig.schoolName} Portal Updating
            </h1>
            <p className="text-sm text-on-surface-variant leading-relaxed">
              Our public website and digital services are currently undergoing scheduled academic registry synchronization. Public portals will resume shortly.
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-surface-container-low/80 border border-outline-variant/30 text-xs text-on-surface-variant space-y-1">
            <p className="font-semibold text-on-surface">Need urgent academic assistance?</p>
            <p>{cmsConfig.email} &bull; {cmsConfig.phone}</p>
            <p className="font-mono text-[11px]">{cmsConfig.eiin} &bull; {cmsConfig.boardCode}</p>
          </div>
        </div>
      </div>
    );
  }

  const publishedExam =
    state.exams.find((ex) => ex.status === 'Published') || state.exams[0];

  return (
    <PublicShellContext.Provider value={{ openResultPortal }}>
      <div className="bg-background font-body-md text-on-surface antialiased selection:bg-primary-fixed selection:text-on-primary-fixed min-h-screen flex flex-col relative overflow-x-hidden">
        {/* Dynamic Atmospheric Blurred Glow Underlay */}
        <div className="fixed inset-0 pointer-events-none -z-10 overflow-hidden no-print">
          <div className="absolute -top-40 left-1/4 w-[500px] h-[500px] bg-secondary-fixed/20 rounded-full blur-[120px]" />
          <div className="absolute top-1/3 -right-40 w-[600px] h-[600px] bg-primary-fixed/25 rounded-full blur-[140px]" />
        </div>

        {/* UNIFIED STICKY HEADER CONTAINER (Prevents Emergency Alert Banner overlap) */}
        <div className="sticky top-0 z-50 w-full no-print">
          {/* Emergency Alert Banner */}
          {cmsConfig.isEmergencyAlert && (
            <div className="w-full bg-primary-container text-on-primary py-2.5 px-4 text-center font-label-md text-label-md flex items-center justify-center gap-2 shadow-sm">
              <span className="material-symbols-outlined text-[18px] shrink-0">warning</span>
              <span className="text-xs sm:text-sm font-medium">{cmsConfig.emergencyAlertText}</span>
            </div>
          )}

          {/* Glassmorphic Institutional Header */}
          <header className="w-full bg-white/85 backdrop-blur-2xl shadow-[0_4px_24px_-4px_rgba(19,27,46,0.06)] border-b border-outline-variant/20">
            <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 pt-2.5 pb-3">
              {(() => {
                const isNavItemActive = (item: NavbarMenuItem) => {
                  const baseHref = item.href.split('#')[0];
                  if (baseHref === activePath) return true;
                  if (item.href === '/academics' && activePath === '/admissions') return true;
                  if (item.children?.some((sub) => sub.href.split('#')[0] === activePath)) return true;
                  return false;
                };

                const renderDesktopNav = () => (
                  <div className="hidden lg:flex justify-center" ref={navRef}>
                    <nav
                      aria-label="Primary Navigation"
                      className="flex items-center justify-center gap-1 px-3 py-1 rounded-full bg-surface-container-lowest/90 backdrop-blur-md shadow-xs border border-outline-variant/30"
                    >
                      {activeNavItems.map((item) => {
                        const isActive = isNavItemActive(item);
                        const isOpen = openDropdown === item.id;

                        if (item.children && item.children.length > 0) {
                          return (
                            <div
                              key={item.id}
                              className="relative"
                              onMouseEnter={() => setOpenDropdown(item.id)}
                              onMouseLeave={() => setOpenDropdown(null)}
                            >
                              <button
                                type="button"
                                aria-expanded={isOpen}
                                onClick={() =>
                                  setOpenDropdown((prev) => (prev === item.id ? null : item.id))
                                }
                                className={`inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full font-label-md text-xs transition-colors cursor-pointer whitespace-nowrap ${
                                  isActive
                                    ? 'bg-primary-container text-on-primary font-semibold shadow-2xs'
                                    : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low font-medium'
                                }`}
                              >
                                {item.icon && item.icon !== 'none' && (
                                  <RenderCmsIcon name={item.icon} className="w-3.5 h-3.5 shrink-0" />
                                )}
                                <span>{item.label}</span>
                                <span
                                  className={`material-symbols-outlined text-[16px] transition-transform duration-200 ${
                                    isOpen ? 'rotate-180' : ''
                                  }`}
                                >
                                  expand_more
                                </span>
                              </button>

                              {isOpen && (
                                <div className="absolute left-0 top-full pt-2 z-50">
                                  <div className="w-72 rounded-2xl bg-white/95 backdrop-blur-2xl shadow-xl border border-outline-variant/30 p-2 space-y-1">
                                    {item.children.map((sub) => (
                                      <Link
                                        key={sub.id || sub.href}
                                        href={sub.href}
                                        onClick={() => setOpenDropdown(null)}
                                        className="flex items-start gap-3 p-2.5 rounded-xl hover:bg-primary-fixed/35 transition-colors group"
                                      >
                                        <div className="w-8 h-8 rounded-lg bg-surface-container-low group-hover:bg-white text-primary-container flex items-center justify-center shrink-0 mt-0.5">
                                          <RenderCmsIcon
                                            name={sub.icon || 'FileText'}
                                            className="w-4 h-4 shrink-0"
                                          />
                                        </div>
                                        <div className="min-w-0">
                                          <div className="text-xs font-semibold text-on-surface group-hover:text-primary-container transition-colors">
                                            {sub.label}
                                          </div>
                                          {sub.description && (
                                            <div className="text-[11px] text-on-surface-variant">
                                              {sub.description}
                                            </div>
                                          )}
                                        </div>
                                      </Link>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        }

                        return (
                          <Link
                            key={item.id}
                            href={item.href || '/'}
                            onClick={() => setOpenDropdown(null)}
                            className={`inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full font-label-md text-xs transition-colors whitespace-nowrap ${
                              isActive
                                ? 'bg-primary-container text-on-primary font-semibold shadow-2xs'
                                : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low font-medium'
                            }`}
                          >
                            {item.icon && item.icon !== 'none' && (
                              <RenderCmsIcon name={item.icon} className="w-3.5 h-3.5 shrink-0" />
                            )}
                            <span>{item.label}</span>
                          </Link>
                        );
                      })}
                    </nav>
                  </div>
                );

                const renderAnnouncementBadges = () => (
                  <div className="flex flex-wrap items-center gap-2 min-h-[28px]">
                    {cmsConfig.isAdmissionOpen && (
                      <Link
                        href="/admissions"
                        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-800 font-label-sm text-[11px] sm:text-xs font-semibold border border-emerald-500/25 hover:bg-emerald-500/20 transition-colors"
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                        Admission Open
                      </Link>
                    )}

                    {cmsConfig.isResultsPublished && (
                      <button
                        type="button"
                        onClick={openResultPortal}
                        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-sky-500/10 text-sky-800 font-label-sm text-[11px] sm:text-xs font-semibold border border-sky-500/25 hover:bg-sky-500/20 transition-colors cursor-pointer"
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-sky-500" />
                        Result Published
                      </button>
                    )}
                  </div>
                );

                const renderPortalAndHamburger = () => (
                  <div className="flex items-center gap-2 ml-auto shrink-0">
                    <Link
                      href="/student/login"
                      className="hidden md:inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-surface-container-low hover:bg-surface-container text-on-surface font-label-sm text-xs font-semibold border border-outline-variant/40 transition-colors whitespace-nowrap"
                    >
                      <span className="material-symbols-outlined text-[15px] text-secondary">school</span>
                      Student Portal
                    </Link>

                    <Link
                      href="/teacher/login"
                      className="hidden md:inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-primary-container hover:bg-primary text-on-primary font-label-sm text-xs font-semibold shadow-xs transition-colors whitespace-nowrap"
                    >
                      <span className="material-symbols-outlined text-[15px]">co_present</span>
                      Teacher Portal
                    </Link>

                    <button
                      type="button"
                      aria-label="Toggle Navigation Menu"
                      aria-expanded={mobileMenuOpen}
                      onClick={() => setMobileMenuOpen((prev) => !prev)}
                      className="lg:hidden w-9 h-9 rounded-xl bg-surface-container-low hover:bg-surface-container text-on-surface flex items-center justify-center border border-outline-variant/40 cursor-pointer shrink-0"
                    >
                      <span className="material-symbols-outlined text-[20px]">
                        {mobileMenuOpen ? 'close' : 'menu'}
                      </span>
                    </button>
                  </div>
                );

                if (headerLayout === 'minimal-bar') {
                  return (
                    <div className="flex flex-wrap items-center justify-between gap-3 py-1">
                      <Link className="inline-flex items-center gap-3 group min-w-0" href="/">
                        {cmsConfig.crestUrl && (
                          <img
                            alt={cmsConfig.schoolName}
                            className="h-10 w-auto object-contain shrink-0 transition-transform group-hover:scale-105"
                            src={cmsConfig.crestUrl}
                            referrerPolicy="no-referrer"
                          />
                        )}
                        <div className="min-w-0">
                          <div className="font-display-lg text-base sm:text-lg text-on-surface tracking-tight leading-tight font-bold truncate">
                            {cmsConfig.schoolName}
                          </div>
                          <div className="font-label-sm text-[10px] uppercase tracking-[0.16em] text-on-surface-variant font-semibold truncate">
                            {cmsConfig.motto}
                          </div>
                        </div>
                      </Link>

                      {renderDesktopNav()}

                      <div className="flex items-center gap-2">
                        <div className="hidden xl:flex items-center gap-1.5">
                          {renderAnnouncementBadges()}
                        </div>
                        {renderPortalAndHamburger()}
                      </div>
                    </div>
                  );
                }

                if (headerLayout === 'compact-split') {
                  return (
                    <>
                      <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-outline-variant/20">
                        {renderAnnouncementBadges()}
                        {renderPortalAndHamburger()}
                      </div>
                      <div className="pt-2.5 flex items-center justify-between gap-4">
                        <Link className="inline-flex items-center gap-3 group min-w-0" href="/">
                          {cmsConfig.crestUrl && (
                            <img
                              alt={cmsConfig.schoolName}
                              className="h-11 sm:h-12 w-auto object-contain shrink-0 transition-transform group-hover:scale-105"
                              src={cmsConfig.crestUrl}
                              referrerPolicy="no-referrer"
                            />
                          )}
                          <div className="min-w-0">
                            <div className="font-display-lg text-lg sm:text-xl text-on-surface tracking-tight leading-tight font-bold truncate">
                              {cmsConfig.schoolName}
                            </div>
                            <div className="font-label-sm text-[10px] uppercase tracking-[0.18em] text-on-surface-variant font-semibold truncate">
                              {cmsConfig.motto}
                            </div>
                          </div>
                        </Link>
                        {renderDesktopNav()}
                      </div>
                    </>
                  );
                }

                return (
                  <>
                    {/* Tier 1: Top Left Live Announcements & Top Right Portal Buttons */}
                    <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-outline-variant/20">
                      {renderAnnouncementBadges()}
                      {renderPortalAndHamburger()}
                    </div>

                    {/* Tier 2: Centered School Crest, School Name, and Tagline */}
                    <div className="pt-3 pb-2.5 flex flex-col items-center text-center">
                      <Link className="inline-flex flex-col items-center group" href="/">
                        {cmsConfig.crestUrl && (
                          <img
                            alt={cmsConfig.schoolName}
                            className="h-12 sm:h-14 w-auto object-contain shrink-0 transition-transform group-hover:scale-105"
                            src={cmsConfig.crestUrl}
                            referrerPolicy="no-referrer"
                          />
                        )}
                        <div className="mt-1.5 font-display-lg text-xl sm:text-2xl text-on-surface tracking-tight leading-tight font-bold">
                          {cmsConfig.schoolName}
                        </div>
                        <div className="mt-0.5 font-label-sm text-[10px] sm:text-[11px] uppercase tracking-[0.2em] text-on-surface-variant font-semibold">
                          {cmsConfig.motto}
                        </div>
                      </Link>
                    </div>

                    {/* Tier 3: Centered Navigation Bar Below School Identity */}
                    <div className="pt-1">{renderDesktopNav()}</div>
                  </>
                );
              })()}

              {/* Responsive Mobile Navigation Drawer */}
              {mobileMenuOpen && (
                <div className="lg:hidden mt-2 pt-3 border-t border-outline-variant/30 space-y-3 pb-2 max-h-[75vh] overflow-y-auto">
                  <div className="space-y-1.5">
                    {activeNavItems.map((item) => {
                      const baseHref = item.href.split('#')[0];
                      const isActive =
                        baseHref === activePath ||
                        (item.href === '/academics' && activePath === '/admissions') ||
                        Boolean(item.children?.some((sub) => sub.href.split('#')[0] === activePath));
                      const isExpanded = mobileExpanded === item.id;

                      if (item.children && item.children.length > 0) {
                        return (
                          <div
                            key={item.id}
                            className="rounded-xl bg-surface-container-low/70 border border-outline-variant/30 overflow-hidden"
                          >
                            <button
                              type="button"
                              onClick={() =>
                                setMobileExpanded((prev) => (prev === item.id ? null : item.id))
                              }
                              className={`w-full flex items-center justify-between px-4 py-2.5 text-xs font-semibold cursor-pointer ${
                                isActive ? 'text-primary-container' : 'text-on-surface'
                              }`}
                            >
                              <span className="inline-flex items-center gap-2">
                                {item.icon && item.icon !== 'none' && (
                                  <RenderCmsIcon name={item.icon} className="w-4 h-4 shrink-0" />
                                )}
                                <span>{item.label}</span>
                              </span>
                              <span
                                className={`material-symbols-outlined text-[18px] transition-transform ${
                                  isExpanded ? 'rotate-180' : ''
                                }`}
                              >
                                expand_more
                              </span>
                            </button>
                            {isExpanded && (
                              <div className="px-2 pb-2 space-y-1 border-t border-outline-variant/20 pt-1.5 bg-white/60">
                                {item.children.map((sub) => (
                                  <Link
                                    key={sub.id || sub.href}
                                    href={sub.href}
                                    onClick={() => {
                                      setMobileMenuOpen(false);
                                      setMobileExpanded(null);
                                    }}
                                    className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-on-surface hover:bg-primary-fixed/30"
                                  >
                                    <RenderCmsIcon
                                      name={sub.icon || 'FileText'}
                                      className="w-4 h-4 text-primary-container shrink-0"
                                    />
                                    <span>{sub.label}</span>
                                  </Link>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      }

                      return (
                        <Link
                          key={item.id}
                          href={item.href}
                          onClick={() => setMobileMenuOpen(false)}
                          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold transition-colors ${
                            isActive
                              ? 'bg-primary-container text-on-primary shadow-xs'
                              : 'bg-surface-container-low text-on-surface hover:bg-surface-container'
                          }`}
                        >
                          {item.icon && item.icon !== 'none' && (
                            <RenderCmsIcon name={item.icon} className="w-4 h-4 shrink-0" />
                          )}
                          <span>{item.label}</span>
                        </Link>
                      );
                    })}
                  </div>

                  {/* Mobile Portal Shortcuts */}
                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-outline-variant/20">
                    <Link
                      href="/student/login"
                      onClick={() => setMobileMenuOpen(false)}
                      className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-surface-container-low text-on-surface text-xs font-semibold border border-outline-variant/40"
                    >
                      <span className="material-symbols-outlined text-[15px] text-secondary">school</span>
                      Student Portal
                    </Link>
                    <Link
                      href="/teacher/login"
                      onClick={() => setMobileMenuOpen(false)}
                      className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-primary-container text-on-primary text-xs font-semibold"
                    >
                      <span className="material-symbols-outlined text-[15px]">co_present</span>
                      Teacher Portal
                    </Link>
                  </div>
                </div>
              )}
            </div>
          </header>
        </div>

        {/* MAIN CONTENT VIEWPORT */}
        <main
          className={`w-full flex-1 bg-transparent ${
            showResultPortal && activeResult ? 'no-print' : ''
          }`}
        >
          {children}
        </main>

        {/* DYNAMIC CMS FOOTER (No exposed /custom/admin links) */}
        {(() => {
          const footerColCount = 2 + (cmsConfig.footerColumns?.length || 0);
          const footerGridCols =
            footerColCount <= 2
              ? 'lg:grid-cols-2'
              : footerColCount === 3
              ? 'lg:grid-cols-3'
              : footerColCount === 4
              ? 'lg:grid-cols-4'
              : 'lg:grid-cols-5';
          return (
        <footer className="w-full bg-white/65 backdrop-blur-2xl mt-auto shadow-[0_-4px_24px_-4px_rgba(19,27,46,0.03)] border-t border-outline-variant/20 no-print">
          <div className="max-w-7xl mx-auto px-6 lg:px-10 py-10">
            <div className={`grid grid-cols-1 md:grid-cols-2 ${footerGridCols} gap-8 mb-10`}>
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  {cmsConfig.crestUrl && (
                    <img
                      alt={cmsConfig.schoolName}
                      className="h-9 w-auto object-contain"
                      src={cmsConfig.crestUrl}
                      referrerPolicy="no-referrer"
                    />
                  )}
                  <span className="font-headline-sm text-lg text-on-surface font-bold">
                    {cmsConfig.schoolName}
                  </span>
                </div>
                <p className="font-body-sm text-xs text-on-surface-variant leading-relaxed">
                  {cmsConfig.footerTagline ||
                    'Providing luminous education, holistic character development, and scholarly excellence under the Highspire Educational Trust since 1984.'}
                </p>
              </div>

              {(cmsConfig.footerColumns || []).map((col) => (
                <div key={col.id}>
                  <h4 className="font-label-md text-xs uppercase tracking-wider text-on-surface font-semibold mb-3">
                    {col.title}
                  </h4>
                  <ul className="space-y-2 text-xs text-on-surface-variant">
                    {col.links.map((lnk) => {
                      const isExternal = lnk.href.startsWith('http');
                      return (
                        <li key={lnk.id}>
                          {isExternal ? (
                            <a
                              href={lnk.href}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-2 hover:text-primary transition-colors"
                            >
                              <RenderCmsIcon name={lnk.icon} className="w-3.5 h-3.5 text-primary-container" />
                              <span>{lnk.label}</span>
                            </a>
                          ) : (
                            <Link
                              href={lnk.href}
                              className="inline-flex items-center gap-2 hover:text-primary transition-colors"
                            >
                              <RenderCmsIcon name={lnk.icon} className="w-3.5 h-3.5 text-primary-container" />
                              <span>{lnk.label}</span>
                            </Link>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}

              <div>
                <h4 className="font-label-md text-xs uppercase tracking-wider text-on-surface font-semibold mb-3">
                  Contact &amp; Accreditation
                </h4>
                <p className="text-xs text-on-surface-variant mb-1.5">{cmsConfig.address}</p>
                <p className="text-xs text-on-surface-variant mb-3">
                  {cmsConfig.email} &bull; {cmsConfig.phone}
                </p>
                <div className="text-[11px] font-mono text-on-surface font-semibold space-y-1">
                  <div>{cmsConfig.eiin}</div>
                  <div>{cmsConfig.boardCode}</div>
                </div>
              </div>
            </div>

            <div className="pt-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-on-surface-variant border-t border-outline-variant/30">
              <p>
                {cmsConfig.copyrightText ||
                  `© 1984–2025 ${cmsConfig.schoolName} Institutional Trust. All rights reserved.`}
              </p>
              <div className="flex items-center gap-5">
                <Link className="hover:text-primary transition-colors font-semibold" href="/student/login">
                  Student Portal
                </Link>
                <Link className="hover:text-primary transition-colors font-semibold" href="/teacher/login">
                  Teacher Portal
                </Link>
              </div>
            </div>
          </div>
        </footer>
          );
        })()}

        {/* GLOBAL RESULT LOOKUP & A4 MARKSHEET MODAL */}
        {showResultPortal && (
          <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-md flex items-start sm:items-center justify-center p-2 sm:p-4 marksheet-print-host">
            <div
              className={`relative w-full ${
                activeResult
                  ? (activeExam || publishedExam)?.marksheetTemplate?.orientation === 'landscape'
                    ? 'max-w-[1200px]'
                    : 'max-w-4xl'
                  : 'max-w-xl'
              } max-h-[94vh] flex flex-col bg-white rounded-2xl sm:rounded-3xl shadow-2xl border border-slate-200 overflow-hidden`}
            >
              {/* Sticky Modal Header */}
              <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-slate-200 bg-white shrink-0 no-print">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-primary-fixed text-primary-container flex items-center justify-center shrink-0">
                    <Award className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-title-lg text-base sm:text-lg text-on-surface font-bold truncate">
                      Official Student Result &amp; Marksheet Archive
                    </h3>
                    <div className="text-xs text-on-surface-variant flex items-center gap-1.5 truncate">
                      <span className="truncate">{cmsConfig.schoolName}</span>
                      <span aria-hidden="true">·</span>
                      <span className="truncate">
                        {(activeExam || activeSearchExam || publishedExam)?.title ||
                          'Published Results'}
                      </span>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  aria-label="Close Result Modal"
                  onClick={() => {
                    setShowResultPortal(false);
                    setActiveResult(null);
                    setActiveExam(null);
                    setActiveStudentMeta(null);
                    setLookupError(null);
                  }}
                  className="w-9 h-9 rounded-full bg-surface-container hover:bg-surface-container-high flex items-center justify-center cursor-pointer shrink-0 transition-colors"
                >
                  <X className="w-4 h-4 text-on-surface" />
                </button>
              </div>

              {/* Scrollable Modal Body */}
              <div className="flex-1 overflow-y-auto p-5 sm:p-6 marksheet-print-scroll">
                {!activeResult ? (
                  <form onSubmit={handleFetchResult} className="space-y-4">
                    {/* Two Search Mode Tabs */}
                    <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-surface-container-low border border-outline-variant/30">
                      <button
                        type="button"
                        onClick={() => {
                          setSearchMode('id');
                          setLookupError(null);
                        }}
                        className={`py-2.5 px-3 rounded-lg text-xs font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap ${
                          searchMode === 'id'
                            ? 'bg-white text-primary-container shadow-xs border border-outline-variant/25'
                            : 'text-on-surface-variant hover:text-on-surface'
                        }`}
                      >
                        <IdCard className="w-4 h-4 shrink-0" />
                        <span>Search by Student ID</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setSearchMode('class-roll');
                          setLookupError(null);
                        }}
                        className={`py-2.5 px-3 rounded-lg text-xs font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap ${
                          searchMode === 'class-roll'
                            ? 'bg-white text-primary-container shadow-xs border border-outline-variant/25'
                            : 'text-on-surface-variant hover:text-on-surface'
                        }`}
                      >
                        <Hash className="w-4 h-4 shrink-0" />
                        <span>Search by Class &amp; Roll</span>
                      </button>
                    </div>

                    {lookupError && (
                      <div className="p-3.5 rounded-xl bg-error-container text-on-error-container text-xs font-medium flex items-start gap-2 border border-error/20">
                        <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                        <span>{lookupError}</span>
                      </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                      <div className={uniqueYears.length > 1 ? 'space-y-1.5' : 'space-y-1.5 sm:col-span-2'}>
                        <label className="font-label-md text-xs font-semibold text-on-surface block">
                          Examination *
                        </label>
                        <select
                          required
                          value={resolvedExamId}
                          onChange={(e) => {
                            const nextId = e.target.value;
                            setSelectedExamId(nextId);
                            const match = availableExams.find((ex) => ex.id === nextId);
                            if (match) setSelectedYear(match.academicYear);
                            setLookupError(null);
                          }}
                          className="w-full px-3.5 py-2.5 rounded-xl border border-outline-variant/60 bg-surface-container-low text-sm text-on-surface focus:outline-hidden focus:ring-2 focus:ring-primary-container"
                        >
                          {availableExams.length === 0 ? (
                            <option value="">No published examinations available yet</option>
                          ) : (
                            availableExams.map((ex) => (
                              <option key={ex.id} value={ex.id}>
                                {ex.title} ({ex.term} &bull; {ex.academicYear})
                              </option>
                            ))
                          )}
                        </select>
                      </div>

                      {uniqueYears.length > 1 && (
                        <div className="space-y-1.5">
                          <label className="font-label-md text-xs font-semibold text-on-surface block">
                            Academic Year *
                          </label>
                          <select
                            required
                            value={resolvedYear}
                            onChange={(e) => {
                              setSelectedYear(e.target.value);
                              setLookupError(null);
                            }}
                            className="w-full px-3.5 py-2.5 rounded-xl border border-outline-variant/60 bg-surface-container-low text-sm text-on-surface font-mono focus:outline-hidden focus:ring-2 focus:ring-primary-container"
                          >
                            {uniqueYears.map((yr) => (
                              <option key={yr} value={yr}>
                                {yr}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}

                      {searchMode === 'id' ? (
                        <div className="space-y-1.5 sm:col-span-2">
                          <label className="font-label-md text-xs font-semibold text-on-surface block">
                            Student ID / Board Registration Number *
                          </label>
                          <input
                            type="text"
                            required
                            value={studentIdQuery}
                            onChange={(e) => {
                              setStudentIdQuery(e.target.value);
                              setLookupError(null);
                            }}
                            placeholder="Enter Student ID (e.g. STU-2026-0001) or Reg No."
                            className="w-full px-3.5 py-2.5 rounded-xl border border-outline-variant/60 bg-surface-container-low text-sm text-on-surface font-mono font-semibold focus:outline-hidden focus:ring-2 focus:ring-primary-container"
                          />
                        </div>
                      ) : (
                        <>
                          <div
                            className={`space-y-1.5 ${
                              classHasSections ? '' : 'sm:col-span-2'
                            }`}
                          >
                            <label className="font-label-md text-xs font-semibold text-on-surface block">
                              Class *
                            </label>
                            <select
                              required
                              value={resolvedClass}
                              onChange={(e) => {
                                setSelectedClass(e.target.value);
                                setSelectedSection('Any');
                                setLookupError(null);
                              }}
                              className="w-full px-3.5 py-2.5 rounded-xl border border-outline-variant/60 bg-surface-container-low text-sm text-on-surface focus:outline-hidden focus:ring-2 focus:ring-primary-container"
                            >
                              {effectiveUniqueClasses.length === 0 ? (
                                <option value="">No classes available</option>
                              ) : (
                                effectiveUniqueClasses.map((cls) => (
                                  <option key={cls} value={cls}>
                                    {cls}
                                  </option>
                                ))
                              )}
                            </select>
                          </div>

                          {classHasSections && (
                            <div className="space-y-1.5">
                              <label className="font-label-md text-xs font-semibold text-on-surface block">
                                Section
                              </label>
                              <select
                                value={resolvedSection}
                                onChange={(e) => {
                                  setSelectedSection(e.target.value);
                                  setLookupError(null);
                                }}
                                className="w-full px-3.5 py-2.5 rounded-xl border border-outline-variant/60 bg-surface-container-low text-sm text-on-surface focus:outline-hidden focus:ring-2 focus:ring-primary-container"
                              >
                                <option value="Any">All Sections</option>
                                {classSections.map((sec) => (
                                  <option key={sec} value={sec}>
                                    Section {sec}
                                  </option>
                                ))}
                              </select>
                            </div>
                          )}

                          <div className="space-y-1.5 sm:col-span-2">
                            <label className="font-label-md text-xs font-semibold text-on-surface block">
                              Class Roll Number *
                            </label>
                            <input
                              type="number"
                              min={1}
                              required
                              value={rollQuery}
                              onChange={(e) => {
                                setRollQuery(e.target.value);
                                setLookupError(null);
                              }}
                              placeholder="Enter Roll Number (e.g. 1, 2, 15)"
                              className="w-full px-3.5 py-2.5 rounded-xl border border-outline-variant/60 bg-surface-container-low text-sm text-on-surface font-mono font-bold tabular-nums focus:outline-hidden focus:ring-2 focus:ring-primary-container"
                            />
                          </div>
                        </>
                      )}
                    </div>

                    {/* Security Captcha */}
                    <div className="p-3.5 rounded-xl bg-surface-container-low border border-outline-variant/40 space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="font-label-md text-xs font-semibold text-on-surface block">
                          Security Captcha *
                        </label>
                        <button
                          type="button"
                          onClick={resetCaptcha}
                          className="text-[11px] text-primary-container font-semibold hover:underline cursor-pointer inline-flex items-center gap-1"
                        >
                          <RefreshCw className="w-3 h-3" />
                          <span>Refresh</span>
                        </button>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="px-3.5 py-2 bg-primary-container text-on-primary font-mono font-bold rounded-xl text-sm tabular-nums shrink-0">
                          {captchaNum1} + {captchaNum2} = ?
                        </span>
                        <input
                          type="number"
                          required
                          placeholder="Answer"
                          value={captchaInput}
                          onChange={(e) => {
                            setCaptchaInput(e.target.value);
                            setCaptchaError(false);
                          }}
                          className="w-28 px-3 py-2 rounded-xl border border-outline-variant/60 font-mono text-center font-bold bg-white tabular-nums"
                        />
                      </div>
                      {captchaError && (
                        <span className="text-xs text-error font-medium block">
                          Incorrect captcha answer. Please try again.
                        </span>
                      )}
                    </div>

                    <button
                      type="submit"
                      disabled={isSearchingResult || availableExams.length === 0}
                      className="w-full py-3 rounded-xl bg-primary-container hover:bg-primary disabled:opacity-60 text-on-primary font-label-md text-sm font-semibold shadow-sm transition-all cursor-pointer inline-flex items-center justify-center gap-2"
                    >
                      <Search className="w-4 h-4" />
                      <span>
                        {isSearchingResult ? 'Searching Registry...' : 'Show Official Result'}
                      </span>
                    </button>
                  </form>
                ) : (
                  /* A4 MARKSHEET VIEW */
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-2.5 no-print">
                      <button
                        type="button"
                        onClick={() => {
                          setActiveResult(null);
                          setActiveExam(null);
                          setActiveStudentMeta(null);
                          resetCaptcha();
                        }}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-surface-container hover:bg-surface-container-high text-on-surface text-xs font-semibold cursor-pointer whitespace-nowrap"
                      >
                        <ArrowLeft className="w-3.5 h-3.5" />
                        <span>Search Another</span>
                      </button>

                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          disabled={isDownloadingPdf}
                          onClick={handleDownloadPublicPdf}
                          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary-container hover:bg-primary disabled:opacity-60 text-on-primary text-xs font-semibold shadow-sm cursor-pointer whitespace-nowrap"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>{isDownloadingPdf ? 'Generating PDF...' : 'Download A4 PDF'}</span>
                        </button>
                        <button
                          type="button"
                          onClick={handlePrintPublicMarksheet}
                          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-surface-container-low hover:bg-surface-container text-on-surface border border-outline-variant/50 text-xs font-semibold cursor-pointer whitespace-nowrap"
                        >
                          <Printer className="w-3.5 h-3.5" />
                          <span>Print A4</span>
                        </button>
                      </div>
                    </div>

                    {/* Printable A4 Canvas */}
                    <div className="flex justify-center overflow-x-auto pb-2 print:overflow-visible print:pb-0">
                      <MarksheetDocument
                        sheetRef={marksheetSheetRef}
                        result={activeResult}
                        exam={activeExam || publishedExam}
                        student={state.students.find((s) => s.id === activeResult.studentId) || null}
                        studentMetaOverride={activeStudentMeta}
                        cmsConfig={cmsConfig}
                        qrCodeDataUrl={qrCodeDataUrl}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </PublicShellContext.Provider>
  );
}
