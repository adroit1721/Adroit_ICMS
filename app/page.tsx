'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useERPStore } from '@/lib/store';
import { Notice } from '@/lib/types';
import PublicShell, { usePublicShell } from '@/components/public/PublicShell';
import { formatDateDDMMYYYY } from '@/lib/academic-helpers';

function HomePageContent() {
  const { state } = useERPStore();
  const { cmsConfig, notices, students, teachers } = state;
  const { openResultPortal } = usePublicShell();

  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [currentSlide, setCurrentSlide] = useState(0);
  const slides = cmsConfig.heroSlides;

  const [selectedNotice, setSelectedNotice] = useState<Notice | null>(null);
  const [downloadedNoticeFile, setDownloadedNoticeFile] = useState<string | null>(null);
  const [showPrincipalModal, setShowPrincipalModal] = useState(false);

  useEffect(() => {
    if (slides.length <= 1) return;
    const timer = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % slides.length);
    }, 6500);
    return () => clearInterval(timer);
  }, [slides.length]);

  const safeSlideIndex = slides.length > 0 ? currentSlide % slides.length : 0;

  const filteredNotices = notices
    .filter((n) => (activeCategory === 'all' ? true : n.category === activeCategory))
    .slice(0, 4);

  const handleDownloadCircular = (notice: Notice) => {
    const resolved = notice.fileName || `${notice.id}-circular.txt`;
    try {
      const content = [
        cmsConfig.schoolName.toUpperCase(),
        `${cmsConfig.eiin} | ${cmsConfig.boardCode}`,
        '==================================================',
        `NOTICE CIRCULAR: ${notice.title}`,
        `Category: ${notice.category.toUpperCase()} (${notice.badge})`,
        `Published: ${formatDateDDMMYYYY(notice.publishDate)}`,
        '--------------------------------------------------',
        notice.description,
        '--------------------------------------------------',
        `Attachment Ref: ${resolved}`,
      ].join('\n');
      const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = resolved.endsWith('.pdf') ? resolved.replace(/\.pdf$/i, '.txt') : resolved;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      // ignore download error
    }
    setDownloadedNoticeFile(resolved);
    setTimeout(() => setDownloadedNoticeFile(null), 3500);
  };

  return (
    <div className="flex flex-col w-full">
      {/* 1. INTERACTIVE ARCHITECTURAL PANORAMA SLIDER */}
      <section className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 pt-8 pb-12">
        <div className="relative w-full aspect-[16/10] sm:aspect-[16/9] lg:aspect-[21/9] rounded-[2rem] overflow-hidden shadow-[0_16px_40px_-12px_rgba(19,27,46,0.08)] group bg-surface-container-low">
          <div className="relative w-full h-full" id="hero-slider">
            {slides.length === 0 ? (
              <div className="absolute inset-0 bg-gradient-to-br from-primary-container via-primary to-slate-900 flex flex-col justify-end p-8 sm:p-12 text-white">
                <span className="inline-block w-fit px-3 py-1 rounded-full bg-white/20 backdrop-blur-md text-[11px] uppercase tracking-wider mb-2">
                  {cmsConfig.motto}
                </span>
                <h1 className="text-2xl sm:text-4xl font-bold font-display-lg">
                  {cmsConfig.schoolName}
                </h1>
                <p className="text-xs sm:text-sm text-white/85 mt-1">{cmsConfig.address}</p>
              </div>
            ) : (
              slides.map((slide, idx) => (
                <div
                  key={slide.id}
                  className={`slide absolute inset-0 transition-opacity duration-700 ease-out ${
                    idx === safeSlideIndex ? 'opacity-100' : 'opacity-0 pointer-events-none'
                  }`}
                >
                  {slide.imageUrl ? (
                    <img
                      alt={slide.title}
                      className="w-full h-full object-cover"
                      src={slide.imageUrl}
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-primary-container via-primary to-slate-900" />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/15 to-transparent pointer-events-none" />

                  <div className="absolute bottom-10 sm:bottom-12 left-6 sm:left-10 right-6 max-w-2xl text-white">
                    <span className="inline-block px-3 py-1 rounded-full bg-white/20 backdrop-blur-md font-label-sm text-[11px] uppercase tracking-wider mb-2">
                      {slide.badgeText}
                    </span>
                    <h1 className="font-headline-md text-xl sm:text-3xl lg:text-4xl font-bold leading-tight drop-shadow-sm font-display-lg">
                      {slide.title}
                    </h1>
                    <p className="font-body-sm text-xs sm:text-sm text-white/90 mt-1.5 drop-shadow-sm hidden sm:block">
                      {slide.subtitle}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>

          {slides.length > 1 && (
            <>
              <div className="absolute inset-y-0 left-3 sm:left-6 right-3 sm:right-6 flex items-center justify-between pointer-events-none">
                <button
                  type="button"
                  aria-label="Previous Slide"
                  onClick={() =>
                    setCurrentSlide((prev) => (prev - 1 + slides.length) % slides.length)
                  }
                  className="pointer-events-auto w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-white/75 hover:bg-white text-on-surface backdrop-blur-xl shadow-lg flex items-center justify-center transition-all sm:-translate-x-2 sm:group-hover:translate-x-0 active:scale-95 cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[20px]">chevron_left</span>
                </button>
                <button
                  type="button"
                  aria-label="Next Slide"
                  onClick={() => setCurrentSlide((prev) => (prev + 1) % slides.length)}
                  className="pointer-events-auto w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-white/75 hover:bg-white text-on-surface backdrop-blur-xl shadow-lg flex items-center justify-center transition-all sm:translate-x-2 sm:group-hover:translate-x-0 active:scale-95 cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[20px]">chevron_right</span>
                </button>
              </div>

              <div className="absolute bottom-4 sm:bottom-6 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-full bg-white/60 backdrop-blur-xl shadow-md flex items-center gap-2">
                {slides.map((_, idx) => (
                  <button
                    key={idx}
                    type="button"
                    aria-label={`Slide ${idx + 1}`}
                    onClick={() => setCurrentSlide(idx)}
                    className={`slider-dot transition-all cursor-pointer ${
                      idx === safeSlideIndex
                        ? 'w-7 h-2 rounded-full bg-primary-container'
                        : 'w-2 h-2 rounded-full bg-on-surface/30 hover:bg-on-surface/60'
                    }`}
                  />
                ))}
              </div>
            </>
          )}

          <div className="absolute top-5 left-5 hidden sm:inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/80 backdrop-blur-md shadow-sm">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="font-label-sm text-xs tracking-wider uppercase text-on-surface font-semibold">
              {slides[safeSlideIndex]?.badgeText || 'Highspire Academic Park'}
            </span>
          </div>
        </div>
      </section>

      {/* 2. QUICK STATS RIBBON (Live DB Counters for Students & Teachers) */}
      <section className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 -mt-4 mb-12">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 p-4 lg:p-6 rounded-[2rem] bg-white/75 backdrop-blur-2xl shadow-[0_12px_36px_-6px_rgba(19,27,46,0.05)] border border-outline-variant/20">
          <Link
            href="/admissions"
            className="flex items-center gap-4 p-5 rounded-2xl bg-surface-container-lowest/70 hover:bg-white transition-all shadow-xs group"
          >
            <div className="w-12 h-12 rounded-xl bg-primary-fixed/60 text-primary-container flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-[24px]">school</span>
            </div>
            <div className="min-w-0">
              <div className="font-headline-md text-3xl text-on-surface tracking-tight font-display-lg font-bold">
                {students.length}
              </div>
              <div className="font-title-md text-sm text-on-surface font-semibold group-hover:text-primary-container transition-colors">
                Enrolled Scholars
              </div>
              <div className="font-label-sm text-xs text-on-surface-variant truncate">
                Live Institutional Registry
              </div>
            </div>
          </Link>

          <Link
            href="/about"
            className="flex items-center gap-4 p-5 rounded-2xl bg-surface-container-lowest/70 hover:bg-white transition-all shadow-xs group"
          >
            <div className="w-12 h-12 rounded-xl bg-secondary-fixed/60 text-secondary flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-[24px]">groups</span>
            </div>
            <div className="min-w-0">
              <div className="font-headline-md text-3xl text-on-surface tracking-tight font-display-lg font-bold">
                {teachers.length}
              </div>
              <div className="font-title-md text-sm text-on-surface font-semibold group-hover:text-secondary transition-colors">
                Certified Faculty
              </div>
              <div className="font-label-sm text-xs text-on-surface-variant truncate">
                Active Academic Instructors
              </div>
            </div>
          </Link>

          <div className="flex items-center gap-4 p-5 rounded-2xl bg-surface-container-lowest/70 hover:bg-white transition-all shadow-xs">
            <div className="w-12 h-12 rounded-xl bg-tertiary-fixed/60 text-tertiary flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-[24px]">workspace_premium</span>
            </div>
            <div className="min-w-0">
              <div className="font-headline-md text-3xl text-on-surface tracking-tight font-display-lg font-bold">
                {cmsConfig.stats.alumniNetwork}
              </div>
              <div className="font-title-md text-sm text-on-surface font-semibold">Alumni</div>
              <div className="font-label-sm text-xs text-on-surface-variant truncate">
                Worldwide Network
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* QUICK DIGITAL SERVICE PORTAL STRIP */}
      <section className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 mb-14">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Link
            href="/admissions"
            className="p-5 rounded-2xl bg-white/75 backdrop-blur-xl border border-outline-variant/25 hover:border-primary-container/40 shadow-xs hover:shadow-md transition-all flex items-center gap-3.5 group"
          >
            <div className="w-11 h-11 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-[22px]">how_to_reg</span>
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-on-surface group-hover:text-primary-container transition-colors">
                Online Admission
              </h3>
              <p className="text-xs text-on-surface-variant truncate">Apply for 2025&ndash;26 intake</p>
            </div>
          </Link>

          <Link
            href="/notices"
            className="p-5 rounded-2xl bg-white/75 backdrop-blur-xl border border-outline-variant/25 hover:border-primary-container/40 shadow-xs hover:shadow-md transition-all flex items-center gap-3.5 group"
          >
            <div className="w-11 h-11 rounded-xl bg-rose-100 text-rose-800 flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-[22px]">campaign</span>
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-on-surface group-hover:text-primary-container transition-colors">
                Notice &amp; Circulars
              </h3>
              <p className="text-xs text-on-surface-variant truncate">Latest exam &amp; campus updates</p>
            </div>
          </Link>

          <button
            type="button"
            onClick={openResultPortal}
            className="p-5 rounded-2xl bg-white/75 backdrop-blur-xl border border-outline-variant/25 hover:border-primary-container/40 shadow-xs hover:shadow-md transition-all flex items-center gap-3.5 group text-left cursor-pointer"
          >
            <div className="w-11 h-11 rounded-xl bg-sky-100 text-sky-800 flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-[22px]">verified</span>
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-on-surface group-hover:text-primary-container transition-colors">
                Result &amp; Marksheet
              </h3>
              <p className="text-xs text-on-surface-variant truncate">Download NCTB A4 transcript</p>
            </div>
          </button>

          <Link
            href="/academics"
            className="p-5 rounded-2xl bg-white/75 backdrop-blur-xl border border-outline-variant/25 hover:border-primary-container/40 shadow-xs hover:shadow-md transition-all flex items-center gap-3.5 group"
          >
            <div className="w-11 h-11 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-[22px]">menu_book</span>
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-on-surface group-hover:text-primary-container transition-colors">
                Curriculum &amp; Syllabi
              </h3>
              <p className="text-xs text-on-surface-variant truncate">NCTB subjects &amp; marks map</p>
            </div>
          </Link>
        </div>
      </section>

      {/* 3. SPLIT SECTION: NOTICE BOARD & PRINCIPAL'S ADDRESS */}
      <section id="notices-section" className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 pb-16">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left Column: Frosted Glass Notice Board */}
          <div
            className={`${
              cmsConfig.showPrincipalCard !== false ? 'lg:col-span-6' : 'lg:col-span-12'
            } rounded-[2rem] bg-white/75 backdrop-blur-2xl shadow-[0_16px_40px_-8px_rgba(19,27,46,0.05)] border border-outline-variant/20 p-6 sm:p-8 flex flex-col justify-between h-full`}
          >
            <div>
              <div className="flex items-center justify-between pb-6 gap-2">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="relative flex h-3 w-3 shrink-0">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary-container opacity-75" />
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-primary-container" />
                  </span>
                  <h2 className="font-headline-sm text-xl text-on-surface tracking-tight font-display-lg font-bold truncate">
                    Academy Notices &amp; Circulars
                  </h2>
                </div>
                <Link
                  href="/notices"
                  className="group flex items-center gap-1 font-label-md text-xs font-semibold text-primary-container hover:text-primary transition-colors shrink-0"
                >
                  <span>View All</span>
                  <span className="material-symbols-outlined text-[16px] group-hover:translate-x-0.5 transition-transform">
                    arrow_forward
                  </span>
                </Link>
              </div>

              <div className="flex items-center gap-2 pb-6 overflow-x-auto" id="circular-tabs">
                {(['all', 'academic', 'admissions', 'examinations'] as const).map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setActiveCategory(cat)}
                    className={`circular-tab px-4 py-1.5 rounded-full font-label-sm text-xs transition-all cursor-pointer capitalize shrink-0 ${
                      activeCategory === cat
                        ? 'bg-primary-container text-on-primary shadow-sm font-semibold'
                        : 'bg-surface-container-lowest text-on-surface-variant hover:text-on-surface hover:bg-white'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>

              <div className="space-y-3" id="notices-container">
                {filteredNotices.map((notice) => (
                  <div
                    key={notice.id}
                    onClick={() => setSelectedNotice(notice)}
                    className="notice-row group p-4 rounded-2xl bg-surface-container-lowest/80 hover:bg-white transition-all flex items-center justify-between gap-4 cursor-pointer border border-outline-variant/15"
                  >
                    <div className="flex items-start gap-3 min-w-0">
                      <div
                        className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
                          notice.badge === 'New'
                            ? 'bg-emerald-50 text-emerald-700'
                            : notice.badge === 'Exam'
                            ? 'bg-primary-fixed/40 text-primary-container'
                            : notice.badge === 'Results'
                            ? 'bg-sky-50 text-sky-800'
                            : 'bg-surface-container text-on-surface'
                        }`}
                      >
                        <span className="material-symbols-outlined text-[20px]">
                          {notice.badge === 'New'
                            ? 'workspace_premium'
                            : notice.badge === 'Exam'
                            ? 'edit_calendar'
                            : notice.badge === 'Results'
                            ? 'trophy'
                            : 'handshake'}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span
                            className={`px-2 py-0.5 rounded-full font-label-sm text-[11px] font-semibold ${
                              notice.badge === 'New'
                                ? 'bg-emerald-100/70 text-emerald-900'
                                : notice.badge === 'Exam'
                                ? 'bg-primary-fixed text-primary'
                                : notice.badge === 'Results'
                                ? 'bg-secondary-fixed text-on-secondary-container'
                                : 'bg-surface-container-high text-on-surface'
                            }`}
                          >
                            {notice.badge}
                          </span>
                          <span className="font-body-sm text-xs text-on-surface-variant font-mono">
                            {formatDateDDMMYYYY(notice.publishDate)}
                          </span>
                        </div>
                        <h3 className="font-title-md text-sm text-on-surface group-hover:text-primary-container transition-colors truncate font-semibold">
                          {notice.title}
                        </h3>
                        <p className="font-body-sm text-xs text-on-surface-variant truncate">
                          {notice.description}
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      aria-label="Open Circular"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedNotice(notice);
                      }}
                      className="w-9 h-9 rounded-full bg-surface-container-low hover:bg-primary-fixed text-on-surface hover:text-on-primary-fixed flex items-center justify-center shrink-0 transition-colors cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-[18px]">download</span>
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="pt-4 mt-6 flex items-center justify-between bg-surface-container-lowest/60 rounded-xl px-4 py-2.5 border border-outline-variant/20">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[16px] text-on-surface-variant">sync</span>
                <span className="font-label-sm text-xs text-on-surface-variant">
                  Synchronized with Central Academic Registry
                </span>
              </div>
              <span className="font-label-sm text-xs text-on-surface font-semibold font-mono">
                Live
              </span>
            </div>
          </div>

          {/* Right Column: Principal's Leadership Address Card (Controlled via CMS Toggle) */}
          {cmsConfig.showPrincipalCard !== false && (
            <div
              id="about-section"
              className="lg:col-span-6 rounded-[2rem] bg-white/75 backdrop-blur-2xl shadow-[0_16px_40px_-8px_rgba(19,27,46,0.05)] border border-outline-variant/20 p-6 sm:p-8 flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between pb-6">
                  <div className="flex flex-col">
                    <span className="font-label-sm text-[11px] uppercase tracking-widest text-primary-container font-semibold">
                      {cmsConfig.principalBadge || 'Leadership Address'}
                    </span>
                    <h2 className="font-headline-sm text-xl text-on-surface tracking-tight mt-0.5 font-display-lg font-bold">
                      Message from the Head of Institution
                    </h2>
                  </div>
                  <div className="w-10 h-10 rounded-full bg-primary-fixed/50 text-primary-container flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-[20px]">format_quote</span>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6 pb-6">
                  <div className="relative shrink-0">
                    <div className="w-28 h-28 sm:w-32 sm:h-32 rounded-2xl overflow-hidden shadow-md bg-white p-1 flex items-center justify-center">
                      {cmsConfig.principalPhotoUrl ? (
                        <img
                          alt={cmsConfig.principalName}
                          className="w-full h-full object-cover rounded-xl"
                          src={cmsConfig.principalPhotoUrl}
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div className="w-full h-full rounded-xl bg-primary-fixed/40 text-primary-container flex items-center justify-center font-bold text-2xl">
                          {(cmsConfig.principalName || 'HT').slice(0, 2).toUpperCase()}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col text-center sm:text-left min-w-0">
                    <h3 className="font-title-lg text-lg text-on-surface font-bold">
                      {cmsConfig.principalName}
                    </h3>
                    <p className="font-label-md text-xs text-primary-container font-semibold mt-0.5">
                      {cmsConfig.principalDesignation}
                    </p>
                    {cmsConfig.principalSubDesignation && (
                      <p className="text-[11px] text-on-surface-variant mt-0.5">
                        {cmsConfig.principalSubDesignation}
                      </p>
                    )}
                    <div className="mt-3 p-3 rounded-xl bg-surface-container-lowest/80 text-on-surface-variant font-body-sm text-xs italic border border-outline-variant/20">
                      &ldquo;{cmsConfig.principalQuote}&rdquo;
                    </div>
                  </div>
                </div>

                <div className="space-y-3 font-body-md text-sm text-on-surface-variant whitespace-pre-line leading-relaxed">
                  <p>{cmsConfig.principalNarrative}</p>
                </div>
              </div>

              <div className="pt-6 mt-6 flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-outline-variant/20">
                <Link
                  href="/about"
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-on-surface-variant hover:text-primary-container transition-colors"
                >
                  <span className="material-symbols-outlined text-[16px]">apartment</span>
                  Explore Academy Heritage &amp; Faculty
                </Link>

                <button
                  type="button"
                  onClick={() => setShowPrincipalModal(true)}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-primary-container hover:bg-primary text-on-primary font-label-md text-xs shadow-sm transition-all active:scale-98 cursor-pointer font-semibold"
                >
                  <span>Read Full Address</span>
                  <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Additional Leadership Cards Below (e.g. Vice Principal, SMC President) */}
        {(cmsConfig.extraLeadershipCards || []).some((c) => c.visible) && (
          <div className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-6">
            {(cmsConfig.extraLeadershipCards || [])
              .filter((c) => c.visible)
              .map((card) => (
                <div
                  key={card.id}
                  className="rounded-[2rem] bg-white/75 backdrop-blur-2xl shadow-[0_12px_32px_-8px_rgba(19,27,46,0.05)] border border-outline-variant/20 p-6 sm:p-8 space-y-5"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <span className="text-[11px] uppercase tracking-widest text-primary-container font-semibold">
                        {card.honoraryBadge}
                      </span>
                      <h3 className="text-lg font-display-lg font-bold text-on-surface">
                        {card.sectionTitle}
                      </h3>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5">
                    <div className="w-24 h-24 rounded-2xl overflow-hidden shadow-sm bg-white p-1 shrink-0 flex items-center justify-center">
                      {card.photoUrl ? (
                        <img
                          src={card.photoUrl}
                          alt={card.name}
                          className="w-full h-full object-cover rounded-xl"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div className="w-full h-full rounded-xl bg-primary-fixed/40 text-primary-container flex items-center justify-center font-bold text-xl">
                          {card.name.slice(0, 2).toUpperCase()}
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 text-center sm:text-left">
                      <h4 className="text-base font-bold text-on-surface">{card.name}</h4>
                      <p className="text-xs font-semibold text-primary-container">{card.designation}</p>
                      {card.subDesignation && (
                        <p className="text-[11px] text-on-surface-variant">{card.subDesignation}</p>
                      )}
                      {card.quote && (
                        <p className="mt-2.5 text-xs italic text-on-surface-variant">
                          &ldquo;{card.quote}&rdquo;
                        </p>
                      )}
                    </div>
                  </div>

                  <p className="text-xs sm:text-sm text-on-surface-variant leading-relaxed whitespace-pre-line">
                    {card.speech}
                  </p>
                </div>
              ))}
          </div>
        )}
      </section>

      {/* 4. NCTB CURRICULUM & 4TH SUBJECT OVERVIEW SECTION */}
      <section id="academics-section" className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 pb-20">
        <div className="rounded-[2rem] bg-white/75 backdrop-blur-2xl shadow-[0_16px_40px_-8px_rgba(19,27,46,0.05)] border border-outline-variant/20 p-6 sm:p-10 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div className="max-w-2xl space-y-2">
              <span className="font-label-sm text-[11px] uppercase tracking-widest text-primary-container font-semibold">
                Board Academic Framework
              </span>
              <h2 className="font-headline-sm text-2xl text-on-surface tracking-tight font-display-lg font-bold">
                Bangladeshi Board (NCTB) Standard &amp; 4th Subject Evaluation
              </h2>
              <p className="font-body-md text-sm text-on-surface-variant">
                Our examination assessment system is strictly aligned with secondary education board statutory rules.
              </p>
            </div>
            <Link
              href="/academics"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-surface-container-low hover:bg-surface-container text-on-surface text-xs font-semibold border border-outline-variant/40 shrink-0 transition-colors"
            >
              View Full Curriculum &amp; Grading Scale
              <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-2">
            <div className="p-5 rounded-2xl bg-surface-container-lowest/80 border border-outline-variant/30 space-y-2">
              <div className="w-9 h-9 rounded-xl bg-primary-fixed/50 text-primary-container flex items-center justify-center font-bold text-sm">
                4th
              </div>
              <h4 className="font-title-md text-sm text-on-surface font-semibold">
                4th Subject Bonus Rule
              </h4>
              <p className="font-body-sm text-xs text-on-surface-variant leading-relaxed">
                Points scored above 2.00 (GP - 2.00) are credited as bonus points to the total grade points. The 4th subject is omitted from the GPA denominator.
              </p>
            </div>

            <div className="p-5 rounded-2xl bg-surface-container-lowest/80 border border-outline-variant/30 space-y-2">
              <div className="w-9 h-9 rounded-xl bg-secondary-fixed/50 text-secondary flex items-center justify-center font-bold text-sm">
                <span className="material-symbols-outlined text-[20px]">filter_alt</span>
              </div>
              <h4 className="font-title-md text-sm text-on-surface font-semibold">
                Religious Routing
              </h4>
              <p className="font-body-sm text-xs text-on-surface-variant leading-relaxed">
                Students are auto-routed to Islam or Hinduism moral education rosters based on registration group. GPA calculations reflect only valid subjects.
              </p>
            </div>

            <div className="p-5 rounded-2xl bg-surface-container-lowest/80 border border-outline-variant/30 space-y-2">
              <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold text-sm">
                <span className="material-symbols-outlined text-[20px]">verified</span>
              </div>
              <h4 className="font-title-md text-sm text-on-surface font-semibold">
                Component-Wise Pass
              </h4>
              <p className="font-body-sm text-xs text-on-surface-variant leading-relaxed">
                CQ (70/50), MCQ (30/25), and Practical (25) must each be independently passed with &ge; 33% marks to secure a passing subject grade.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* NOTICE DETAIL LIGHTBOX MODAL */}
      {selectedNotice && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="relative w-full max-w-xl bg-white rounded-3xl shadow-2xl p-6 sm:p-8 space-y-4">
            <div className="flex justify-between items-start border-b border-outline-variant/30 pb-3">
              <div>
                <span className="font-label-sm text-xs uppercase font-semibold text-primary-container">
                  {selectedNotice.category} Circular
                </span>
                <h3 className="font-title-lg text-lg text-on-surface font-bold mt-1">
                  {selectedNotice.title}
                </h3>
                <span className="font-body-sm text-xs text-on-surface-variant font-mono">
                  Published: {formatDateDDMMYYYY(selectedNotice.publishDate)}
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSelectedNotice(null);
                  setDownloadedNoticeFile(null);
                }}
                className="w-8 h-8 rounded-full bg-surface-container flex items-center justify-center cursor-pointer"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            <p className="font-body-md text-sm text-on-surface leading-relaxed">
              {selectedNotice.description}
            </p>

            {downloadedNoticeFile && (
              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-medium flex items-center gap-2">
                <span className="material-symbols-outlined text-[16px]">check_circle</span>
                <span>Circular packet prepared: {downloadedNoticeFile}</span>
              </div>
            )}

            <div className="pt-3 border-t border-outline-variant/30 flex justify-between items-center text-xs text-on-surface-variant font-mono">
              <span className="truncate pr-2">
                Attachment: {selectedNotice.fileName || 'circular.pdf'}
              </span>
              <button
                type="button"
                onClick={() => handleDownloadCircular(selectedNotice)}
                className="px-4 py-2 rounded-full bg-primary-container hover:bg-primary text-on-primary font-semibold shrink-0 cursor-pointer transition-colors"
              >
                Download Circular
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PRINCIPAL EXTENDED ADDRESS MODAL */}
      {showPrincipalModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="relative w-full max-w-2xl bg-white rounded-3xl shadow-2xl p-6 sm:p-8 space-y-5">
            <div className="flex justify-between items-start border-b border-outline-variant/30 pb-4">
              <div className="flex items-center gap-3">
                {cmsConfig.principalPhotoUrl && (
                  <img
                    src={cmsConfig.principalPhotoUrl}
                    alt={cmsConfig.principalName}
                    className="w-12 h-12 rounded-xl object-cover"
                    referrerPolicy="no-referrer"
                  />
                )}
                <div>
                  <h3 className="font-title-lg text-lg text-on-surface font-bold">
                    {cmsConfig.principalName}
                  </h3>
                  <span className="font-label-sm text-xs text-primary-container font-semibold">
                    {cmsConfig.principalDesignation}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowPrincipalModal(false)}
                className="w-8 h-8 rounded-full bg-surface-container flex items-center justify-center cursor-pointer"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>
            <div className="space-y-3 font-body-md text-sm text-on-surface-variant leading-relaxed">
              <p className="italic font-serif text-base text-on-surface">
                &ldquo;{cmsConfig.principalQuote}&rdquo;
              </p>
              <p className="whitespace-pre-line">{cmsConfig.principalNarrative}</p>
              <p>
                Our students continually achieve top honors across secondary board examinations, national science symposiums, and international olympiads. We welcome you to experience our vibrant community of scholarship and moral purpose.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function HomePage() {
  return (
    <PublicShell activePath="/">
      <HomePageContent />
    </PublicShell>
  );
}
