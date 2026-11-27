'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useERPStore } from '@/lib/store';
import { sortTeachersBySeniority } from '@/lib/teacher-helpers';
import PublicShell from '@/components/public/PublicShell';

function AboutContent() {
  const { state } = useERPStore();
  const { cmsConfig, teachers, students } = state;
  const [smcSearch, setSmcSearch] = useState('');

  const smcMembers = (cmsConfig.smcMembers || []).filter(
    (m) =>
      m.name.toLowerCase().includes(smcSearch.toLowerCase()) ||
      m.designation.toLowerCase().includes(smcSearch.toLowerCase())
  );
  const customSections = (cmsConfig.customAboutSections || []).filter((s) => s.visible);

  return (
    <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 py-10 space-y-12">
      {/* 1. SCHOOL DETAILS AND HISTORY */}
      <section
        id="details"
        className="scroll-mt-36 rounded-[2rem] bg-white/80 backdrop-blur-2xl border border-outline-variant/25 shadow-[0_16px_40px_-8px_rgba(19,27,46,0.05)] p-8 sm:p-12 space-y-8"
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2 max-w-3xl">
            <div className="text-xs uppercase tracking-widest text-primary-container font-semibold">
              School Details &amp; History
            </div>
            <h1 className="font-display-lg text-3xl sm:text-4xl font-bold text-on-surface tracking-tight">
              About {cmsConfig.schoolName}
            </h1>
            <p className="text-sm sm:text-base text-on-surface-variant leading-relaxed whitespace-pre-line">
              {cmsConfig.aboutContent}
            </p>
          </div>
          <div className="text-xs font-mono font-semibold text-on-surface-variant space-y-1 shrink-0 text-right">
            <div>{cmsConfig.eiin}</div>
            <div>{cmsConfig.boardCode}</div>
          </div>
        </div>

        {/* Principal's Leadership Profile */}
        <div className="pt-6 border-t border-outline-variant/20 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          <div className="lg:col-span-4 flex flex-col items-center text-center space-y-3">
            <div className="w-40 h-40 rounded-3xl overflow-hidden shadow-lg bg-white p-1.5 border border-outline-variant/30 flex items-center justify-center">
              {cmsConfig.principalPhotoUrl ? (
                <img
                  src={cmsConfig.principalPhotoUrl}
                  alt={cmsConfig.principalName}
                  className="w-full h-full object-cover rounded-2xl"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="w-full h-full rounded-2xl bg-primary-fixed/40 text-primary-container flex items-center justify-center font-bold text-3xl">
                  {(cmsConfig.principalName || 'HT').slice(0, 2).toUpperCase()}
                </div>
              )}
            </div>
            <div>
              <h2 className="text-lg font-bold text-on-surface">{cmsConfig.principalName}</h2>
              <p className="text-xs font-semibold text-primary-container">{cmsConfig.principalDesignation}</p>
              {cmsConfig.principalSubDesignation && (
                <p className="text-[11px] text-on-surface-variant mt-0.5">{cmsConfig.principalSubDesignation}</p>
              )}
            </div>
          </div>

          <div className="lg:col-span-8 space-y-4">
            <blockquote className="p-4 rounded-2xl bg-surface-container-low/80 border border-outline-variant/30 text-sm italic text-on-surface">
              &ldquo;{cmsConfig.principalQuote}&rdquo;
            </blockquote>
            <p className="text-sm text-on-surface-variant leading-relaxed whitespace-pre-line">
              {cmsConfig.principalNarrative}
            </p>
          </div>
        </div>
      </section>

      {/* 2. AT A GLANCE */}
      <section
        id="at-a-glance"
        className="scroll-mt-36 rounded-[2rem] bg-white/80 backdrop-blur-2xl border border-outline-variant/25 shadow-[0_16px_40px_-8px_rgba(19,27,46,0.05)] p-8 sm:p-10 space-y-6"
      >
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
          <div>
            <span className="text-[11px] uppercase tracking-widest font-semibold text-primary-container">
              Institutional Factsheet
            </span>
            <h2 className="text-2xl font-display-lg font-bold text-on-surface">
              {cmsConfig.schoolName} At a Glance
            </h2>
          </div>
          <Link
            href="/admissions"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-primary-container hover:bg-primary text-on-primary text-xs font-semibold transition-colors w-fit"
          >
            Apply for Admission
            <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
          </Link>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-5 rounded-2xl bg-surface-container-lowest border border-outline-variant/25 space-y-1">
            <div className="text-2xl font-bold font-mono tabular-nums text-primary-container">
              {students.length}
            </div>
            <div className="text-xs font-bold text-on-surface">Active Enrolled Scholars</div>
            <div className="text-[11px] text-on-surface-variant">Live Database Registry</div>
          </div>

          <div className="p-5 rounded-2xl bg-surface-container-lowest border border-outline-variant/25 space-y-1">
            <div className="text-2xl font-bold font-mono tabular-nums text-secondary">
              {teachers.length}
            </div>
            <div className="text-xs font-bold text-on-surface">Teachers &amp; Staff</div>
            <div className="text-[11px] text-on-surface-variant">Board Certified Faculty</div>
          </div>

          <div className="p-5 rounded-2xl bg-surface-container-lowest border border-outline-variant/25 space-y-1">
            <div className="text-2xl font-bold font-mono tabular-nums text-tertiary">
              {cmsConfig.stats.alumniNetwork}
            </div>
            <div className="text-xs font-bold text-on-surface">Alumni Worldwide</div>
            <div className="text-[11px] text-on-surface-variant">Established 1984</div>
          </div>

          {(cmsConfig.atAGlanceHighlights || []).map((hl) => (
            <div
              key={hl.id}
              className="p-5 rounded-2xl bg-surface-container-lowest border border-outline-variant/25 space-y-1"
            >
              <div className="text-lg font-bold font-mono text-on-surface">{hl.value}</div>
              <div className="text-xs font-bold text-on-surface">{hl.label}</div>
              <div className="text-[11px] text-on-surface-variant">{hl.subtitle}</div>
            </div>
          ))}
        </div>
      </section>

      {/* 3. TEACHERS & STAFFS (Live DB Cards: Avatar, Name Below, Designation, Mobile, Email) */}
      <section id="teachers-staff" className="scroll-mt-36 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
          <div>
            <span className="text-[11px] uppercase tracking-widest font-semibold text-primary-container">
              Academic Leadership
            </span>
            <h2 className="text-2xl font-display-lg font-bold text-on-surface">
              Teachers &amp; Staffs Directory ({teachers.length})
            </h2>
          </div>
          <p className="text-xs text-on-surface-variant">
            Synchronized directly with the institutional faculty database.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {sortTeachersBySeniority(teachers).map((teacher) => (
            <div
              key={teacher.id}
              className="rounded-3xl bg-white/80 backdrop-blur-xl border border-outline-variant/25 p-6 shadow-xs hover:shadow-md transition-all flex flex-col items-center text-center gap-3"
            >
              {teacher.avatarUrl ? (
                <img
                  src={teacher.avatarUrl}
                  alt={teacher.name}
                  className="w-24 h-24 rounded-2xl object-cover border border-outline-variant/30 bg-surface-container-low"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="w-24 h-24 rounded-2xl bg-primary-fixed/50 text-primary-container font-bold text-xl flex items-center justify-center border border-outline-variant/30">
                  {teacher.name.slice(0, 2).toUpperCase()}
                </div>
              )}
              <div className="space-y-0.5 min-w-0 w-full">
                <h3 className="text-base font-bold text-on-surface truncate">{teacher.name}</h3>
                {teacher.banglaName && (
                  <p className="text-xs font-medium text-on-surface-variant truncate">
                    {teacher.banglaName}
                  </p>
                )}
                <p className="text-xs font-semibold text-primary-container">{teacher.designation}</p>
                {teacher.department && (
                  <p className="text-[11px] text-on-surface-variant">{teacher.department}</p>
                )}
              </div>

              <div className="w-full pt-3 border-t border-outline-variant/20 space-y-1 text-xs text-on-surface-variant">
                <div className="font-mono tabular-nums text-on-surface font-medium">
                  Mobile: {teacher.phone || '—'}
                </div>
                <div className="truncate">Email: {teacher.email || '—'}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 4. SCHOOL MANAGING COMMITTEE (SMC) DATA TABLE */}
      <section
        id="smc"
        className="scroll-mt-36 rounded-[2rem] bg-white/80 backdrop-blur-2xl border border-outline-variant/25 shadow-[0_16px_40px_-8px_rgba(19,27,46,0.05)] p-8 sm:p-10 space-y-6"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <span className="text-[11px] uppercase tracking-widest font-semibold text-primary-container">
              Institutional Governance
            </span>
            <h2 className="text-2xl font-display-lg font-bold text-on-surface">
              School Managing Committee (SMC)
            </h2>
            <p className="text-xs text-on-surface-variant mt-1">
              Statutory governing board overseeing academic policy, fiduciary transparency, and campus development.
            </p>
          </div>
          <input
            type="text"
            value={smcSearch}
            onChange={(e) => setSmcSearch(e.target.value)}
            placeholder="Filter SMC members..."
            className="px-4 py-2 rounded-xl bg-surface-container-low border border-outline-variant/40 text-xs w-full sm:w-64 focus:outline-hidden"
          />
        </div>

        <div className="overflow-x-auto rounded-2xl border border-outline-variant/30">
          <table className="w-full text-left text-xs border-collapse bg-white/95">
            <thead>
              <tr className="bg-surface-container-low text-on-surface font-bold border-b border-outline-variant/30">
                <th className="p-3.5 w-12 text-center">#</th>
                <th className="p-3.5">Member Name</th>
                <th className="p-3.5">Designation</th>
                <th className="p-3.5">Mobile</th>
                <th className="p-3.5">Email</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/20">
              {smcMembers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-on-surface-variant">
                    No matching SMC members found.
                  </td>
                </tr>
              ) : (
                smcMembers.map((member, idx) => (
                  <tr key={member.id} className="hover:bg-surface-container-lowest">
                    <td className="p-3.5 text-center font-mono tabular-nums text-on-surface-variant">
                      {idx + 1}
                    </td>
                    <td className="p-3.5 font-bold text-on-surface">{member.name}</td>
                    <td className="p-3.5 text-primary-container font-semibold">
                      {member.designation}
                    </td>
                    <td className="p-3.5 font-mono tabular-nums text-on-surface">
                      {member.mobile}
                    </td>
                    <td className="p-3.5 text-on-surface-variant">{member.email}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* 5. EXTRA CUSTOM COMMITTEE SECTIONS (e.g. PTA Committee) */}
      {customSections.map((sec) => (
        <section
          key={sec.id}
          id={sec.id}
          className="scroll-mt-36 rounded-[2rem] bg-white/80 backdrop-blur-2xl border border-outline-variant/25 shadow-[0_16px_40px_-8px_rgba(19,27,46,0.05)] p-8 sm:p-10 space-y-6"
        >
          <div>
            <span className="text-[11px] uppercase tracking-widest font-semibold text-primary-container">
              {sec.subtitle || 'Institutional Committee'}
            </span>
            <h2 className="text-2xl font-display-lg font-bold text-on-surface">{sec.title}</h2>
            {sec.description && (
              <p className="text-xs sm:text-sm text-on-surface-variant mt-1">{sec.description}</p>
            )}
          </div>

          {sec.members.length > 0 && (
            <div className="overflow-x-auto rounded-2xl border border-outline-variant/30">
              <table className="w-full text-left text-xs border-collapse bg-white/95">
                <thead>
                  <tr className="bg-surface-container-low text-on-surface font-bold border-b border-outline-variant/30">
                    <th className="p-3.5 w-12 text-center">#</th>
                    <th className="p-3.5">Member Name</th>
                    <th className="p-3.5">Designation</th>
                    <th className="p-3.5">Mobile</th>
                    <th className="p-3.5">Email</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/20">
                  {sec.members.map((m, idx) => (
                    <tr key={m.id} className="hover:bg-surface-container-lowest">
                      <td className="p-3.5 text-center font-mono tabular-nums text-on-surface-variant">
                        {idx + 1}
                      </td>
                      <td className="p-3.5 font-bold text-on-surface">{m.name}</td>
                      <td className="p-3.5 text-primary-container font-semibold">
                        {m.designation}
                      </td>
                      <td className="p-3.5 font-mono tabular-nums text-on-surface">{m.mobile}</td>
                      <td className="p-3.5 text-on-surface-variant">{m.email}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ))}
    </div>
  );
}

export default function AboutPage() {
  return (
    <PublicShell activePath="/about">
      <AboutContent />
    </PublicShell>
  );
}
