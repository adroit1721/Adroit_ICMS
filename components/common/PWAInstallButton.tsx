'use client';

import React, { useEffect, useState, useSyncExternalStore } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

const emptySubscribe = () => () => {};

function subscribeStandalone(callback: () => void) {
  const mql = window.matchMedia('(display-mode: standalone)');
  mql.addEventListener('change', callback);
  window.addEventListener('appinstalled', callback);
  return () => {
    mql.removeEventListener('change', callback);
    window.removeEventListener('appinstalled', callback);
  };
}

function getStandaloneSnapshot(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function getIOSSnapshot(): boolean {
  return /iphone|ipad|ipod/.test(window.navigator.userAgent.toLowerCase());
}

function getCanShowManualInstallSnapshot(): boolean {
  const ua = window.navigator.userAgent.toLowerCase();
  return /android|mobile|chrome|edg|crios/.test(ua);
}

export function PWAInstallButton({
  compact = false,
  className = '',
  label = 'Install App',
  schoolName = 'Aethelgard Academy',
  crestUrl,
}: {
  compact?: boolean;
  className?: string;
  label?: string;
  schoolName?: string;
  crestUrl?: string;
}) {
  const isStandalone = useSyncExternalStore(
    subscribeStandalone,
    getStandaloneSnapshot,
    () => false
  );
  const isIOS = useSyncExternalStore(emptySubscribe, getIOSSnapshot, () => false);
  const canShowInstallGuide = useSyncExternalStore(
    emptySubscribe,
    getCanShowManualInstallSnapshot,
    () => false
  );

  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installedInSession, setInstalledInSession] = useState(false);
  const [showGuideModal, setShowGuideModal] = useState(false);

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setInstalledInSession(true);
      setDeferredPrompt(null);
      setShowGuideModal(false);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setInstalledInSession(true);
        setDeferredPrompt(null);
        setShowGuideModal(false);
      }
      return;
    }
    setShowGuideModal(true);
  };

  if (isStandalone || installedInSession) return null;
  if (!deferredPrompt && !isIOS && !canShowInstallGuide) return null;

  return (
    <>
      <button
        type="button"
        onClick={handleInstallClick}
        className={
          className ||
          `inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full font-semibold text-[11px] sm:text-xs shadow-xs transition-colors whitespace-nowrap cursor-pointer ${
            deferredPrompt
              ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
              : 'bg-surface-container-low hover:bg-surface-container text-on-surface border border-outline-variant/40'
          }`
        }
        title={`Install ${schoolName || 'page'} as app`}
      >
        <span className="material-symbols-outlined text-[15px]">install_mobile</span>
        <span className={compact ? 'hidden sm:inline' : ''}>{label}</span>
      </button>

      {showGuideModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl border border-outline-variant/30 text-on-surface space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <img
                  src={crestUrl?.trim() || '/icon.svg'}
                  alt={schoolName}
                  referrerPolicy="no-referrer"
                  className="w-6 h-6 rounded-md object-contain shrink-0"
                />
                <h3 className="font-headline-sm text-sm sm:text-base font-bold truncate">
                  Install {schoolName}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowGuideModal(false)}
                className="w-8 h-8 rounded-full bg-surface-container flex items-center justify-center hover:bg-surface-container-high text-on-surface-variant cursor-pointer shrink-0"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            {deferredPrompt ? (
              <div className="space-y-3">
                <p className="text-xs text-on-surface-variant leading-relaxed">
                  Chrome is ready to install <strong className="text-on-surface">{schoolName}</strong> on your home screen or desktop.
                </p>
                <button
                  type="button"
                  onClick={handleInstallClick}
                  className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs cursor-pointer"
                >
                  Install Now
                </button>
              </div>
            ) : isIOS ? (
              <div className="text-xs text-on-surface-variant leading-relaxed space-y-2">
                <p>
                  1. Tap the <strong className="text-on-surface">Share</strong> button in Safari&apos;s toolbar.
                </p>
                <p>
                  2. Scroll down and tap <strong className="text-on-surface">Add to Home Screen</strong>.
                </p>
                <p>
                  3. Tap <strong className="text-on-surface">Add</strong> to launch directly like a native app.
                </p>
              </div>
            ) : (
              <div className="text-xs text-on-surface-variant leading-relaxed space-y-2">
                <p>
                  <strong className="text-on-surface">Mobile Chrome (Android):</strong>
                </p>
                <p>
                  1. Tap the <strong className="text-on-surface">⋮ Menu</strong> icon at the top-right corner of Chrome.
                </p>
                <p>
                  2. Tap <strong className="text-on-surface">Add to Home screen</strong> or <strong className="text-on-surface">Install app</strong>.
                </p>
                <p>
                  3. Confirm <strong className="text-on-surface">Install</strong> to run full-screen as an app.
                </p>
              </div>
            )}

            <button
              type="button"
              onClick={() => setShowGuideModal(false)}
              className="w-full py-2.5 rounded-xl bg-primary-container text-on-primary font-bold text-xs cursor-pointer"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </>
  );
}
