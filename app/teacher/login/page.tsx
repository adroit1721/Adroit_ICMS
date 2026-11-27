'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useERPStore } from '@/lib/store';

export default function TeacherLoginPage() {
  const router = useRouter();
  const { state, refreshFromServer } = useERPStore();
  const { cmsConfig } = state;

  const [teacherIdentifier, setTeacherIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleTeacherLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'erp-client',
        },
        body: JSON.stringify({
          portal: 'teacher',
          identifier: teacherIdentifier.trim(),
          password,
        }),
      });
      const rawText = await res.text();
      let data: Record<string, unknown> = {};
      if (rawText && !rawText.trim().startsWith('<')) {
        try {
          data = JSON.parse(rawText) as Record<string, unknown>;
        } catch {
          data = {};
        }
      }
      if (!res.ok) {
        setErrorMsg(
          (typeof data.error === 'string' && data.error) ||
            (rawText.trim().startsWith('<')
              ? `Server returned HTML (HTTP ${res.status}). Please retry in a moment.`
              : 'Incorrect faculty credentials.')
        );
        setLoading(false);
        return;
      }
      await refreshFromServer();
      router.push('/teacher/dashboard');
    } catch {
      setErrorMsg('Authentication request failed. Please check your connection.');
      setLoading(false);
    }
  };

  return (
    <div className="bg-background font-body-md text-on-surface antialiased selection:bg-secondary-fixed selection:text-on-secondary-fixed min-h-screen flex items-center justify-center p-6 relative overflow-hidden">
      <div className="absolute -top-32 right-1/4 w-[500px] h-[500px] bg-secondary-fixed/20 rounded-full blur-[140px] pointer-events-none" />

      <div className="w-full max-w-md bg-surface-container-lowest/90 backdrop-blur-2xl rounded-3xl p-8 shadow-xl border border-outline-variant/30 space-y-5 relative z-10">
        <div className="flex flex-col items-center text-center">
          {cmsConfig.crestUrl ? (
            <img
              src={cmsConfig.crestUrl}
              alt={cmsConfig.schoolName}
              className="h-12 w-auto object-contain mb-2"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="w-12 h-12 rounded-2xl bg-secondary/10 text-secondary flex items-center justify-center mb-2">
              <span className="material-symbols-outlined text-[26px]">badge</span>
            </div>
          )}
          <h1 className="font-headline-sm text-xl font-bold text-on-surface tracking-tight">
            Teacher &amp; Staff Portal
          </h1>
          <span className="font-label-sm text-[11px] uppercase tracking-widest text-secondary font-semibold mt-1">
            {cmsConfig.schoolName}
          </span>
          <p className="text-xs text-on-surface-variant mt-1">
            Sign in with your Teacher / Staff ID (or Email) and 6-digit system PIN.
          </p>
        </div>

        {errorMsg && (
          <div className="p-3 rounded-xl bg-error-container/50 text-on-error-container text-xs font-semibold flex items-start gap-2">
            <span className="material-symbols-outlined text-[18px] shrink-0">error</span>
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleTeacherLogin} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-1.5">
              Teacher / Staff ID or Email *
            </label>
            <div className="relative flex items-center">
              <span className="material-symbols-outlined absolute left-3.5 text-on-surface-variant text-[18px]">
                badge
              </span>
              <input
                type="text"
                required
                value={teacherIdentifier}
                onChange={(e) => {
                  setTeacherIdentifier(e.target.value);
                  setErrorMsg(null);
                }}
                className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-surface-container-low border border-outline-variant/30 text-sm font-mono font-medium text-on-surface focus:outline-none focus:ring-2 focus:ring-secondary/25 focus:bg-white transition-all"
                placeholder="e.g. RHHSTID1 or faculty@institute.edu"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-1.5">
              6-Digit PIN or Password *
            </label>
            <div className="relative flex items-center">
              <span className="material-symbols-outlined absolute left-3.5 text-on-surface-variant text-[18px]">
                lock
              </span>
              <input
                type={showPassword ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setErrorMsg(null);
                }}
                className="w-full pl-10 pr-10 py-2.5 rounded-xl bg-surface-container-low border border-outline-variant/30 text-sm font-medium text-on-surface focus:outline-none focus:ring-2 focus:ring-secondary/25 focus:bg-white transition-all"
                placeholder="Enter 6-digit PIN or password"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="absolute right-3 text-on-surface-variant hover:text-on-surface cursor-pointer p-0.5 rounded-md hover:bg-surface-container transition-colors"
                aria-label="Toggle password visibility"
              >
                <span className="material-symbols-outlined text-[18px]">
                  {showPassword ? 'visibility_off' : 'visibility'}
                </span>
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-xl bg-secondary hover:bg-secondary/90 disabled:opacity-60 text-on-secondary font-label-md text-label-md font-bold shadow-md transition-all cursor-pointer flex items-center justify-center gap-2"
          >
            {loading ? (
              <span className="material-symbols-outlined text-[18px] animate-spin">sync</span>
            ) : (
              <span className="material-symbols-outlined text-[18px]">login</span>
            )}
            <span>{loading ? 'Verifying Faculty Session...' : 'Access Examiner Workspace'}</span>
          </button>
        </form>

        <div className="flex items-center justify-between pt-2 text-xs">
          <Link
            href="/"
            className="text-on-surface-variant hover:text-secondary transition-colors font-medium inline-flex items-center gap-1"
          >
            <span className="material-symbols-outlined text-[14px]">arrow_back</span>
            Public Home
          </Link>
          <Link
            href="/student/login"
            className="text-primary-container hover:underline font-semibold"
          >
            Student Login &rarr;
          </Link>
        </div>
      </div>
    </div>
  );
}
