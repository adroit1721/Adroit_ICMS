'use client';

import { useState } from 'react';
import { useERPStore } from '@/lib/store';
import PublicShell from '@/components/public/PublicShell';

function AlumniContent() {
  const { state } = useERPStore();
  const { cmsConfig, students } = state;
  const alumniCfg = cmsConfig.alumniPageConfig;
  const alumniList = alumniCfg?.featuredAlumni || [];
  const archivedGraduates = students.filter(
    (s) => s.status === 'Alumni' || s.status === 'Graduated'
  );
  const showForm = alumniCfg?.showRegistrationForm !== false;

  const [fullName, setFullName] = useState('');
  const [passingYear, setPassingYear] = useState('2018');
  const [email, setEmail] = useState('');
  const [profession, setProfession] = useState('');
  const [registered, setRegistered] = useState(false);

  const handleRegister = (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim() || !email.trim()) return;
    setRegistered(true);
    setFullName('');
    setEmail('');
    setProfession('');
  };

  return (
    <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 py-10 space-y-10">
      <section className="rounded-[2rem] bg-white/80 backdrop-blur-2xl border border-outline-variant/25 shadow-[0_16px_40px_-8px_rgba(19,27,46,0.05)] p-8 sm:p-12 space-y-4">
        <span className="inline-block px-3 py-1 rounded-full bg-tertiary-fixed/70 text-on-tertiary-fixed font-label-sm text-xs uppercase tracking-widest font-semibold">
          Global Graduates Network
        </span>
        <h1 className="font-display-lg text-3xl sm:text-4xl font-bold text-on-surface tracking-tight">
          {alumniCfg?.heading || `${cmsConfig.schoolName} Alumni Association`}
        </h1>
        <p className="text-sm sm:text-base text-on-surface-variant max-w-3xl leading-relaxed">
          {alumniCfg?.subtitle ||
            `Connecting over ${cmsConfig.stats.alumniNetwork} proud graduates across academia, engineering, medicine, public service, and entrepreneurship worldwide.`}
        </p>
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        <div className={`${showForm ? 'lg:col-span-7' : 'lg:col-span-12'} space-y-4`}>
          <h2 className="text-xl font-bold text-on-surface">Distinguished Alumni Chapters</h2>
          {alumniList.length === 0 ? (
            <div className="p-8 rounded-3xl bg-white/75 border border-outline-variant/25 text-center text-xs text-on-surface-variant">
              No featured alumni chapters added yet. Manage chapters via the Website CMS &rarr; Pages Control tab.
            </div>
          ) : (
            <div className={showForm ? 'space-y-4' : 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4'}>
              {alumniList.map((alum) => (
                <div
                  key={alum.id || alum.name}
                  className="p-6 rounded-3xl bg-white/80 backdrop-blur-xl border border-outline-variant/25 shadow-xs space-y-1.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-base font-bold text-on-surface">{alum.name}</h3>
                    <span className="px-3 py-0.5 rounded-full bg-primary-fixed/60 text-primary-container text-xs font-semibold shrink-0">
                      {alum.batch}
                    </span>
                  </div>
                  <p className="text-xs text-on-surface-variant">{alum.achievement}</p>
                </div>
              ))}
            </div>
          )}

          {archivedGraduates.length > 0 && (
            <div className="pt-6 space-y-3">
              <h2 className="text-xl font-bold text-on-surface">
                Verified Graduated Cohorts ({archivedGraduates.length})
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {archivedGraduates.map((grad) => (
                  <div
                    key={grad.id}
                    className="p-4 rounded-2xl bg-white/80 border border-outline-variant/25 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-bold text-on-surface truncate">
                        {grad.fullName}
                      </div>
                      <div className="text-xs text-on-surface-variant">
                        {grad.className} &bull; {grad.group}
                      </div>
                    </div>
                    <span className="px-2.5 py-1 rounded-full bg-secondary-fixed text-on-secondary-container text-[11px] font-bold font-mono shrink-0 tabular-nums">
                      {grad.graduatedWing || 'Batch'} {grad.graduatedYear || grad.batchCycle || ''}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {showForm && (
          <form
            onSubmit={handleRegister}
            className="lg:col-span-5 rounded-[2rem] bg-white/85 backdrop-blur-2xl border border-outline-variant/25 shadow-sm p-6 sm:p-8 space-y-4"
          >
            <h2 className="text-lg font-bold text-on-surface border-b border-outline-variant/20 pb-3">
              Alumni Membership Registry
            </h2>

            {registered && (
              <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-medium flex items-center gap-2">
                <span className="material-symbols-outlined text-[18px]">check_circle</span>
                <span>Thank you! Your alumni profile has been submitted to the Association Desk.</span>
              </div>
            )}

            <div className="space-y-1">
              <label className="text-xs font-semibold text-on-surface block">Full Name *</label>
              <input
                type="text"
                required
                value={fullName}
                onChange={(e) => {
                  setFullName(e.target.value);
                  setRegistered(false);
                }}
                placeholder="Your full name"
                className="w-full px-3.5 py-2.5 rounded-xl border border-outline-variant/60 bg-surface-container-low text-sm focus:outline-hidden focus:ring-2 focus:ring-primary-container"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-on-surface block">SSC / HSC Batch *</label>
                <input
                  type="text"
                  required
                  value={passingYear}
                  onChange={(e) => setPassingYear(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-outline-variant/60 bg-surface-container-low text-sm font-mono focus:outline-hidden focus:ring-2 focus:ring-primary-container"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-on-surface block">Email *</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@domain.com"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-outline-variant/60 bg-surface-container-low text-sm focus:outline-hidden focus:ring-2 focus:ring-primary-container"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-on-surface block">
                Current Profession / Organization
              </label>
              <input
                type="text"
                value={profession}
                onChange={(e) => setProfession(e.target.value)}
                placeholder="e.g. Software Engineer, Medical Officer"
                className="w-full px-3.5 py-2.5 rounded-xl border border-outline-variant/60 bg-surface-container-low text-sm focus:outline-hidden focus:ring-2 focus:ring-primary-container"
              />
            </div>

            <button
              type="submit"
              className="w-full py-3 rounded-full bg-primary-container hover:bg-primary text-on-primary text-xs font-semibold shadow-sm cursor-pointer transition-colors"
            >
              Join Alumni Directory
            </button>
          </form>
        )}
      </section>
    </div>
  );
}

export default function AlumniPage() {
  return (
    <PublicShell activePath="/alumni">
      <AlumniContent />
    </PublicShell>
  );
}
