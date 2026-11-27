'use client';

import { useState } from 'react';
import { useERPStore } from '@/lib/store';
import { Notice } from '@/lib/types';
import PublicShell from '@/components/public/PublicShell';
import { formatDateDDMMYYYY } from '@/lib/academic-helpers';

function NoticesContent() {
  const { state } = useERPStore();
  const { notices, cmsConfig } = state;

  const [category, setCategory] = useState<'all' | 'academic' | 'admissions' | 'examinations'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedNotice, setSelectedNotice] = useState<Notice | null>(null);
  const [downloadedFile, setDownloadedFile] = useState<string | null>(null);

  const filtered = notices.filter((n) => {
    const catMatch = category === 'all' || n.category === category;
    const q = searchQuery.trim().toLowerCase();
    const textMatch =
      !q ||
      n.title.toLowerCase().includes(q) ||
      n.description.toLowerCase().includes(q) ||
      (n.fileName || '').toLowerCase().includes(q);
    return catMatch && textMatch;
  });

  const handleDownload = (fileName?: string) => {
    const resolved = fileName || 'circular.pdf';
    setDownloadedFile(resolved);
    setTimeout(() => setDownloadedFile(null), 3500);
  };

  return (
    <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 py-10 space-y-8">
      {/* Header Card */}
      <section className="rounded-[2rem] bg-white/80 backdrop-blur-2xl border border-outline-variant/25 shadow-[0_16px_40px_-8px_rgba(19,27,46,0.05)] p-8 sm:p-10 space-y-6">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div className="space-y-1.5">
            <span className="inline-block px-3 py-1 rounded-full bg-primary-fixed/60 text-primary-container text-xs font-semibold uppercase tracking-widest">
              Official Bulletin Archive
            </span>
            <h1 className="font-display-lg text-3xl sm:text-4xl font-bold text-on-surface tracking-tight">
              Notices &amp; Academic Circulars
            </h1>
            <p className="text-sm text-on-surface-variant">
              All official announcements published by {cmsConfig.schoolName} administration.
            </p>
          </div>
          <span className="px-4 py-1.5 rounded-full bg-surface-container-low border border-outline-variant/30 text-xs font-mono font-semibold text-on-surface">
            {filtered.length} Circular{filtered.length === 1 ? '' : 's'} Found
          </span>
        </div>

        {/* Search & Category Controls */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 pt-2 border-t border-outline-variant/20">
          <div className="flex flex-wrap items-center gap-2">
            {(['all', 'academic', 'admissions', 'examinations'] as const).map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setCategory(cat)}
                className={`px-4 py-1.5 rounded-full text-xs capitalize transition-all cursor-pointer ${
                  category === cat
                    ? 'bg-primary-container text-on-primary font-semibold shadow-xs'
                    : 'bg-surface-container-low text-on-surface-variant hover:text-on-surface'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          <div className="relative w-full sm:w-72">
            <span className="material-symbols-outlined text-[18px] text-on-surface-variant absolute left-3 top-1/2 -translate-y-1/2">
              search
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search notices or circulars..."
              className="w-full pl-9 pr-4 py-2 rounded-full border border-outline-variant/50 bg-surface-container-lowest text-xs focus:outline-hidden focus:ring-2 focus:ring-primary-container"
            />
          </div>
        </div>
      </section>

      {/* Circular List */}
      <section className="space-y-4">
        {filtered.length === 0 ? (
          <div className="rounded-[2rem] bg-white/80 p-12 text-center border border-outline-variant/25 space-y-2">
            <span className="material-symbols-outlined text-[36px] text-on-surface-variant">
              notifications_off
            </span>
            <h2 className="text-base font-bold text-on-surface">No Matching Circulars</h2>
            <p className="text-xs text-on-surface-variant">
              Try clearing your search filter or switching categories.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filtered.map((notice) => (
              <div
                key={notice.id}
                onClick={() => setSelectedNotice(notice)}
                className="group p-6 rounded-3xl bg-white/80 backdrop-blur-xl border border-outline-variant/25 hover:border-primary-container/40 shadow-xs hover:shadow-md transition-all flex flex-col justify-between gap-4 cursor-pointer"
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${
                          notice.badge === 'New'
                            ? 'bg-emerald-100 text-emerald-900'
                            : notice.badge === 'Exam'
                            ? 'bg-primary-fixed text-primary'
                            : notice.badge === 'Results'
                            ? 'bg-secondary-fixed text-on-secondary-container'
                            : 'bg-surface-container-high text-on-surface'
                        }`}
                      >
                        {notice.badge}
                      </span>
                      <span className="text-[11px] uppercase tracking-wider font-semibold text-on-surface-variant">
                        {notice.category}
                      </span>
                    </div>
                    <span className="text-xs font-mono text-on-surface-variant">
                      {formatDateDDMMYYYY(notice.publishDate)}
                    </span>
                  </div>

                  <h3 className="text-base font-bold text-on-surface group-hover:text-primary-container transition-colors">
                    {notice.title}
                  </h3>
                  <p className="text-xs text-on-surface-variant leading-relaxed">
                    {notice.description}
                  </p>
                </div>

                <div className="pt-3 border-t border-outline-variant/20 flex items-center justify-between text-xs">
                  <span className="font-mono text-on-surface-variant truncate pr-2">
                    {notice.fileName || 'official_circular.pdf'}
                  </span>
                  <span className="inline-flex items-center gap-1 text-primary-container font-semibold shrink-0">
                    Read Circular
                    <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Notice Lightbox Modal */}
      {selectedNotice && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="relative w-full max-w-xl bg-white rounded-3xl shadow-2xl p-6 sm:p-8 space-y-4">
            <div className="flex justify-between items-start border-b border-outline-variant/30 pb-3">
              <div>
                <span className="text-xs uppercase font-semibold text-primary-container">
                  {selectedNotice.category} Circular
                </span>
                <h3 className="text-lg text-on-surface font-bold mt-1">{selectedNotice.title}</h3>
                <span className="text-xs text-on-surface-variant font-mono">
                  Published: {formatDateDDMMYYYY(selectedNotice.publishDate)}
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSelectedNotice(null);
                  setDownloadedFile(null);
                }}
                className="w-8 h-8 rounded-full bg-surface-container flex items-center justify-center cursor-pointer"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            <p className="text-sm text-on-surface leading-relaxed">{selectedNotice.description}</p>

            {downloadedFile && (
              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-medium flex items-center gap-2">
                <span className="material-symbols-outlined text-[16px]">check_circle</span>
                <span>Circular packet downloaded: {downloadedFile}</span>
              </div>
            )}

            <div className="pt-3 border-t border-outline-variant/30 flex justify-between items-center text-xs text-on-surface-variant font-mono">
              <span className="truncate pr-2">
                Attachment: {selectedNotice.fileName || 'circular.pdf'}
              </span>
              <button
                type="button"
                onClick={() => handleDownload(selectedNotice.fileName)}
                className="px-4 py-2 rounded-full bg-primary-container hover:bg-primary text-on-primary font-semibold shrink-0 cursor-pointer"
              >
                Download PDF
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function NoticesPage() {
  return (
    <PublicShell activePath="/notices">
      <NoticesContent />
    </PublicShell>
  );
}
