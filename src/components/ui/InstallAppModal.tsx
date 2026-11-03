'use client';

import React, { useState, useEffect } from 'react';
import { Modal } from './Modal';
import { Button } from './Button';
import {
  Download,
  Share2,
  PlusSquare,
  CheckCircle2,
  Smartphone,
  ShieldCheck,
  ExternalLink,
  Laptop,
} from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export interface InstallAppModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const InstallAppModal: React.FC<InstallAppModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [installedSuccess, setInstalledSuccess] = useState(false);

  useEffect(() => {
    // Check if already in standalone display mode
    if (typeof window !== 'undefined') {
      const isStandalone =
        window.matchMedia('(display-mode: standalone)').matches ||
        (window.navigator as any).standalone === true;
      setIsInstalled(isStandalone);

      // Detect iOS Safari
      const ua = window.navigator.userAgent.toLowerCase();
      const isApple = /iphone|ipad|ipod/.test(ua);
      setIsIOS(isApple);

      const handler = (e: Event) => {
        e.preventDefault();
        setDeferredPrompt(e as BeforeInstallPromptEvent);
      };

      window.addEventListener('beforeinstallprompt', handler);
      window.addEventListener('appinstalled', () => {
        setIsInstalled(true);
        setInstalledSuccess(true);
        setDeferredPrompt(null);
      });

      return () => {
        window.removeEventListener('beforeinstallprompt', handler);
      };
    }
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === 'accepted') {
        setInstalledSuccess(true);
        setIsInstalled(true);
      }
      setDeferredPrompt(null);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Install GCS CONNECT"
      description="Install as a standalone native app on your mobile device or PC for quick access and full-screen experience."
    >
      <div className="flex flex-col gap-4 text-sm mt-1">
        {/* App Hero Badge */}
        <div className="flex items-center gap-3 p-3.5 rounded-2xl bg-gcs-sidebar border border-gcs-border">
          <div className="w-12 h-12 rounded-xl bg-gcs-emerald/20 border border-gcs-emerald/40 flex items-center justify-center shrink-0 shadow-lg shadow-gcs-emerald/10">
            <ShieldCheck className="w-7 h-7 text-gcs-emerald" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h4 className="font-bold text-gcs-text text-sm">GCS CONNECT</h4>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-gcs-emerald/20 text-gcs-mint font-semibold">
                PWA
              </span>
            </div>
            <p className="text-[11px] text-gcs-muted truncate">
              Zero-knowledge E2EE messaging & WebRTC calling
            </p>
          </div>
        </div>

        {/* Status check */}
        {isInstalled || installedSuccess ? (
          <div className="p-4 rounded-xl bg-gcs-emerald/15 border border-gcs-emerald/40 text-center space-y-2">
            <div className="w-9 h-9 rounded-full bg-gcs-emerald/20 text-gcs-mint flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-5 h-5 text-gcs-emerald" />
            </div>
            <span className="block font-semibold text-gcs-mint text-sm">
              GCS CONNECT is Installed!
            </span>
            <p className="text-xs text-gcs-muted max-w-xs mx-auto">
              You can now launch GCS CONNECT directly from your home screen or application launcher.
            </p>
          </div>
        ) : isIOS ? (
          /* iOS Safari Guide */
          <div className="space-y-3">
            <div className="p-3 rounded-xl bg-gcs-card border border-gcs-border space-y-2 text-xs text-gcs-text">
              <span className="font-semibold text-gcs-mint flex items-center gap-1.5 text-xs">
                <Smartphone className="w-4 h-4 text-gcs-emerald" />
                iOS Safari Installation Steps:
              </span>
              <ol className="list-decimal list-inside space-y-2 text-gcs-muted leading-relaxed pl-1">
                <li>
                  Tap the <strong className="text-gcs-mint font-semibold">Share button</strong> (
                  <Share2 className="w-3.5 h-3.5 inline text-gcs-emerald" />) in Safari's bottom toolbar.
                </li>
                <li>
                  Scroll down the options and select{' '}
                  <strong className="text-gcs-mint font-semibold">
                    &quot;Add to Home Screen&quot;
                  </strong>{' '}
                  (<PlusSquare className="w-3.5 h-3.5 inline text-gcs-emerald" />).
                </li>
                <li>
                  Tap <strong className="text-gcs-mint font-semibold">&quot;Add&quot;</strong> in the top-right corner.
                </li>
              </ol>
            </div>
          </div>
        ) : deferredPrompt ? (
          /* Android / Chrome 1-Click Native Install */
          <div className="space-y-3">
            <div className="p-3.5 rounded-xl bg-gcs-card border border-gcs-border text-xs text-gcs-muted leading-relaxed">
              Click the button below to prompt direct device installation on Android, Chrome, Edge, or Linux.
            </div>
            <Button
              variant="primary"
              onClick={handleInstallClick}
              className="w-full h-11 bg-gcs-emerald hover:bg-[#00c28c] text-white font-semibold flex items-center justify-center gap-2 rounded-xl shadow-lg shadow-gcs-emerald/20 text-sm active:scale-95 transition-all"
            >
              <Download className="w-4 h-4" />
              <span>Install GCS CONNECT on Device</span>
            </Button>
          </div>
        ) : (
          /* Desktop / General Browser Guide */
          <div className="p-3.5 rounded-xl bg-gcs-card border border-gcs-border space-y-2 text-xs text-gcs-muted">
            <span className="font-semibold text-gcs-mint flex items-center gap-1.5 text-xs">
              <Laptop className="w-4 h-4 text-gcs-emerald" />
              Desktop or Android Browser:
            </span>
            <p className="leading-relaxed">
              Look for the install icon (<Download className="w-3.5 h-3.5 inline text-gcs-emerald" />) in your browser&apos;s address bar, or open the browser menu (⋮) and tap <strong>&quot;Install app&quot;</strong> or <strong>&quot;Add to Home Screen&quot;</strong>.
            </p>
          </div>
        )}

        {/* Benefits list */}
        <div className="grid grid-cols-2 gap-2 text-[11px] text-gcs-muted border-t border-gcs-border/40 pt-3">
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="w-3 h-3 text-gcs-emerald shrink-0" />
            <span>Full-screen app view</span>
          </div>
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="w-3 h-3 text-gcs-emerald shrink-0" />
            <span>Instant home-screen icon</span>
          </div>
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="w-3 h-3 text-gcs-emerald shrink-0" />
            <span>Zero app store downloads</span>
          </div>
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="w-3 h-3 text-gcs-emerald shrink-0" />
            <span>Instant WebRTC calling</span>
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </Modal>
  );
};
