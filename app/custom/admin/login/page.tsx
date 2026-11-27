'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useERPStore } from '@/lib/store';

export default function AdminLoginPage() {
  const router = useRouter();
  const { state, isHydrated, dbStatus, refreshFromServer } = useERPStore();
  const { cmsConfig } = state;

  const [userId, setUserId] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [setupFullName, setSetupFullName] = useState('');
  const [setupConfirmPassword, setSetupConfirmPassword] = useState('');
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [retryingConnection, setRetryingConnection] = useState(false);

  const safeJson = async (res: Response): Promise<Record<string, unknown>> => {
    const text = await res.text();
    if (!text) return {};
    if (text.trim().startsWith('<')) {
      return {
        error: `Server returned HTML (HTTP ${res.status}) instead of JSON. Please retry in a moment.`,
      };
    }
    try {
      return JSON.parse(text) as Record<string, unknown>;
    } catch {
      return { error: `Unexpected server response (HTTP ${res.status}).` };
    }
  };

  const handleRetryConnection = async () => {
    setRetryingConnection(true);
    try {
      await refreshFromServer();
    } finally {
      setRetryingConnection(false);
    }
  };

  const dbReady =
    isHydrated &&
    ((dbStatus.mongoConfigured && dbStatus.mongoConnected) || Boolean(dbStatus.localDbActive));
  const needsSetup = dbReady && dbStatus.needsInitialSetup;

  const handleBootstrapAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (password.length < 6) {
      setErrorMsg('Super Admin password must be at least 6 characters.');
      return;
    }
    if (password !== setupConfirmPassword) {
      setErrorMsg('Password confirmation does not match.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/bootstrap-admin', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'erp-client',
        },
        body: JSON.stringify({
          username: userId.trim() || 'Admin',
          fullName: setupFullName.trim() || 'Super Administrator',
          password,
        }),
      });
      const data = await safeJson(res);
      if (!res.ok) {
        setErrorMsg((typeof data.error === 'string' && data.error) || 'Could not initialize Super Admin.');
        setLoading(false);
        return;
      }
      await refreshFromServer();
      router.push('/custom/admin');
    } catch {
      setErrorMsg('Network error during initial setup.');
      setLoading(false);
    }
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
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
          portal: 'admin',
          username: userId.trim(),
          password,
        }),
      });
      const data = await safeJson(res);
      if (!res.ok) {
        setErrorMsg((typeof data.error === 'string' && data.error) || 'Invalid User ID or Password.');
        setLoading(false);
        return;
      }
      await refreshFromServer();
      router.push('/custom/admin');
    } catch {
      setErrorMsg('Authentication request failed. Check network or database status.');
      setLoading(false);
    }
  };

  return (
    <div className="bg-background font-body-md text-on-surface antialiased selection:bg-primary-fixed selection:text-on-primary-fixed min-h-screen flex items-center justify-center p-6 relative overflow-hidden">
      <div className="absolute -top-32 left-1/4 w-[500px] h-[500px] bg-secondary-fixed/20 rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute bottom-10 right-10 w-[450px] h-[450px] bg-primary-fixed/25 rounded-full blur-[120px] pointer-events-none" />

      <div className="w-full max-w-md bg-surface-container-lowest/90 backdrop-blur-2xl rounded-3xl p-8 shadow-xl border border-outline-variant/30 space-y-6 relative z-10">
        <div className="flex flex-col items-center text-center">
          {cmsConfig.crestUrl ? (
            <img
              src={cmsConfig.crestUrl}
              alt={cmsConfig.schoolName}
              className="h-12 w-auto object-contain mb-2"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="w-12 h-12 rounded-2xl bg-primary-container/10 text-primary-container flex items-center justify-center mb-2">
              <span className="material-symbols-outlined text-[26px]">admin_panel_settings</span>
            </div>
          )}
          <h1 className="font-headline-sm text-headline-sm font-bold text-on-surface tracking-tight">
            {cmsConfig.schoolName}
          </h1>
          <span className="font-label-sm text-label-sm uppercase tracking-widest text-primary-container font-semibold mt-1">
            {needsSetup ? 'First-Run Super Admin Setup' : 'ERP & CMS Command Center'}
          </span>
        </div>

        {isHydrated && !dbStatus.mongoConfigured && (
          <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs space-y-1">
            <div className="font-bold">
              {dbStatus.localDbActive
                ? 'Local Persistent Storage Active (MONGODB_URI Not Set)'
                : 'Database Environment Variable Required'}
            </div>
            <p className="leading-relaxed">
              {dbStatus.localDbActive ? (
                <>
                  Changes are saved to local workspace storage (<code className="font-mono font-semibold">data/erp-db.json</code>). If you already have records in MongoDB Atlas, add <code className="font-mono font-semibold">MONGODB_URI</code> in <strong>AI Studio Secrets</strong> (not <code className="font-mono">.env.local</code>, which resets on container restarts) to restore your Atlas cluster.
                </>
              ) : (
                <>
                  Set <code className="font-mono font-semibold">MONGODB_URI</code> in <strong>AI Studio Secrets</strong> or your hosting Environment Variables to connect MongoDB Atlas.
                </>
              )}
            </p>
          </div>
        )}

        {isHydrated && dbStatus.mongoConfigured && !dbStatus.mongoConnected && (
          <div className="p-4 rounded-2xl bg-error-container/30 border border-error/25 text-error text-xs space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="font-bold">MongoDB Connection Unavailable</div>
              <button
                type="button"
                onClick={handleRetryConnection}
                disabled={retryingConnection}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/80 hover:bg-white text-error border border-error/30 font-semibold text-[11px] cursor-pointer disabled:opacity-60"
              >
                <span className={`material-symbols-outlined text-[14px] ${retryingConnection ? 'animate-spin' : ''}`}>
                  sync
                </span>
                {retryingConnection ? 'Checking...' : 'Retry'}
              </button>
            </div>
            <p className="leading-relaxed">
              {dbStatus.error || 'Could not reach the configured MongoDB Atlas cluster.'}
            </p>
            <div className="pt-1.5 border-t border-error/15 text-[11px] text-on-surface-variant space-y-0.5">
              <div className="font-semibold text-on-surface">Quick Fix for MongoDB Atlas:</div>
              <div>1. Open MongoDB Atlas &rarr; <strong>Security &rarr; Network Access</strong></div>
              <div>2. Click <strong>Add IP Address</strong> &rarr; <strong>Allow Access from Anywhere</strong> (<code className="font-mono">0.0.0.0/0</code>)</div>
            </div>
          </div>
        )}

        {needsSetup && (
          <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs space-y-1">
            <div className="font-bold">Clean Database Ready</div>
            <p>
              No administrator account exists in the active database yet. Create your primary Super Admin account below to claim this workspace.
            </p>
          </div>
        )}

        {errorMsg && (
          <div className="p-3 rounded-xl bg-error-container/40 text-error text-xs font-semibold flex items-center gap-2 border border-error/20">
            <span className="material-symbols-outlined text-[18px] shrink-0">error</span>
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={needsSetup ? handleBootstrapAdmin : handleLoginSubmit} className="space-y-4">
          {needsSetup && (
            <div>
              <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-1.5">
                Full Name *
              </label>
              <input
                type="text"
                required
                value={setupFullName}
                onChange={(e) => setSetupFullName(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl bg-surface-container-low border border-outline-variant/30 text-sm font-medium text-on-surface focus:outline-none focus:ring-2 focus:ring-primary-container/20 focus:bg-white transition-all"
                placeholder="e.g. Principal / System Admin"
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-1.5">
              {needsSetup ? 'Choose Admin Username *' : 'User ID / Username'}
            </label>
            <div className="relative flex items-center">
              <span className="material-symbols-outlined absolute left-3.5 text-on-surface-variant text-[18px]">
                person
              </span>
              <input
                type="text"
                required
                value={userId}
                onChange={(e) => {
                  setUserId(e.target.value);
                  setErrorMsg(null);
                }}
                className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-surface-container-low border border-outline-variant/30 text-sm font-medium text-on-surface focus:outline-none focus:ring-2 focus:ring-primary-container/20 focus:bg-white transition-all"
                placeholder={needsSetup ? 'e.g. Admin' : 'Enter User ID...'}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-1.5">
              {needsSetup ? 'Choose Secure Password (min 6 chars) *' : 'Secure Password'}
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
                className="w-full pl-10 pr-10 py-2.5 rounded-xl bg-surface-container-low border border-outline-variant/30 text-sm font-medium text-on-surface focus:outline-none focus:ring-2 focus:ring-primary-container/20 focus:bg-white transition-all"
                placeholder="••••••••••"
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

          {needsSetup && (
            <div>
              <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-1.5">
                Confirm Password *
              </label>
              <div className="relative flex items-center">
                <span className="material-symbols-outlined absolute left-3.5 text-on-surface-variant text-[18px]">
                  verified_user
                </span>
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  required
                  value={setupConfirmPassword}
                  onChange={(e) => {
                    setSetupConfirmPassword(e.target.value);
                    setErrorMsg(null);
                  }}
                  className="w-full pl-10 pr-10 py-2.5 rounded-xl bg-surface-container-low border border-outline-variant/30 text-sm font-medium text-on-surface focus:outline-none focus:ring-2 focus:ring-primary-container/20 focus:bg-white transition-all"
                  placeholder="••••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword((prev) => !prev)}
                  className="absolute right-3 text-on-surface-variant hover:text-on-surface cursor-pointer p-0.5 rounded-md hover:bg-surface-container transition-colors"
                  aria-label="Toggle confirm password visibility"
                >
                  <span className="material-symbols-outlined text-[18px]">
                    {showConfirmPassword ? 'visibility_off' : 'visibility'}
                  </span>
                </button>
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !dbReady}
            className="w-full py-3 rounded-xl bg-primary-container hover:bg-primary disabled:opacity-50 text-on-primary font-label-md text-label-md font-bold shadow-md transition-all cursor-pointer flex items-center justify-center gap-2 mt-2"
          >
            {loading ? (
              <span className="material-symbols-outlined text-[18px] animate-spin">sync</span>
            ) : (
              <span className="material-symbols-outlined text-[18px]">
                {needsSetup ? 'verified_user' : 'login'}
              </span>
            )}
            <span>
              {loading
                ? needsSetup
                  ? 'Initializing Super Admin...'
                  : 'Authenticating Session...'
                : needsSetup
                ? 'Create Super Admin & Enter ERP'
                : 'Secure ERP Login'}
            </span>
          </button>
        </form>

        <div className="text-center pt-2">
          <Link
            href="/"
            className="text-xs text-on-surface-variant hover:text-primary-container transition-colors font-medium inline-flex items-center gap-1"
          >
            <span className="material-symbols-outlined text-[14px]">arrow_back</span>
            Return to Public School Portal
          </Link>
        </div>
      </div>
    </div>
  );
}
