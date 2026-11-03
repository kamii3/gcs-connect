'use client';

import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import {
  Key,
  Shield,
  ShieldCheck,
  Lock,
  Smartphone,
  Download,
  Bell,
  Palette,
  HelpCircle,
  LogOut,
  ExternalLink,
  ChevronRight,
  HardDrive,
  QrCode,
  Check,
  Eye,
  Trash2,
  Camera,
  Upload,
  Loader2,
} from 'lucide-react';

export interface WhatsAppSettingsViewProps {
  currentUserName: string;
  currentUserEmail: string;
  currentUserAvatar?: string | null;
  onUpdateAvatar?: (url: string) => void;
  onLogout: () => void;
  onOpenInstallModal: () => void;
  onClearAllChats?: () => void;
  isAdmin?: boolean;
}

export const WhatsAppSettingsView: React.FC<WhatsAppSettingsViewProps> = ({
  currentUserName,
  currentUserEmail,
  currentUserAvatar,
  onUpdateAvatar,
  onLogout,
  onOpenInstallModal,
  onClearAllChats,
  isAdmin = false,
}) => {
  const [aboutText, setAboutText] = useState('Connect Freely. Communicate Securely. 🔐');
  const [avatarUrl, setAvatarUrl] = useState<string | null | undefined>(currentUserAvatar);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setAvatarUrl(currentUserAvatar);
  }, [currentUserAvatar]);

  const handleAvatarFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Please select a valid image file (JPG, PNG, WebP).');
      return;
    }

    if (file.size > 8 * 1024 * 1024) {
      alert('File size exceeds 8MB limit.');
      return;
    }

    setIsUploadingAvatar(true);

    try {
      // Compress and resize client-side to 256x256 square WebP/JPEG for fast load and optimal storage
      const reader = new FileReader();
      reader.onload = (readerEvent) => {
        const img = new (window as any).Image();
        img.onload = async () => {
          const canvas = document.createElement('canvas');
          const size = 256;
          canvas.width = size;
          canvas.height = size;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            const minDim = Math.min(img.width, img.height);
            const sx = (img.width - minDim) / 2;
            const sy = (img.height - minDim) / 2;
            ctx.drawImage(img, sx, sy, minDim, minDim, 0, 0, size, size);
            const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.88);

            const res = await fetch('/api/users/profile', {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ avatarUrl: compressedDataUrl }),
            });

            if (res.ok) {
              setAvatarUrl(compressedDataUrl);
              onUpdateAvatar?.(compressedDataUrl);
            } else {
              alert('Failed to update profile picture. Please try again.');
            }
          }
          setIsUploadingAvatar(false);
        };
        img.onerror = () => {
          setIsUploadingAvatar(false);
          alert('Could not process selected image.');
        };
        img.src = readerEvent.target?.result as string;
      };
      reader.readAsDataURL(file);
    } catch {
      setIsUploadingAvatar(false);
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleRemoveAvatar = async () => {
    setIsUploadingAvatar(true);
    try {
      const res = await fetch('/api/users/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ avatarUrl: null }),
      });
      if (res.ok) {
        setAvatarUrl(null);
        onUpdateAvatar?.('');
      }
    } finally {
      setIsUploadingAvatar(false);
    }
  };
  const [isEditAboutModal, setIsEditAboutModal] = useState(false);
  const [newAboutInput, setNewAboutInput] = useState(aboutText);
  const [isSecurityModal, setIsSecurityModal] = useState(false);
  const [isPrivacyModal, setIsPrivacyModal] = useState(false);
  const [isNotificationsModal, setIsNotificationsModal] = useState(false);
  const [notifSound, setNotifSound] = useState(true);
  const [notifBanner, setNotifBanner] = useState(true);
  const [browserNotifStatus, setBrowserNotifStatus] = useState<string>('default');
  const [readReceipts, setReadReceipts] = useState(true);
  const [isClearChatsConfirm, setIsClearChatsConfirm] = useState(false);

  React.useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setBrowserNotifStatus(Notification.permission);
    }
  }, [isNotificationsModal]);

  const requestBrowserNotif = async () => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      const perm = await Notification.requestPermission();
      setBrowserNotifStatus(perm);
    }
  };

  const handleSaveAbout = () => {
    if (newAboutInput.trim()) {
      setAboutText(newAboutInput.trim());
    }
    setIsEditAboutModal(false);
  };

  return (
    <div className="flex-1 overflow-y-auto flex flex-col divide-y divide-gcs-border/20 select-none pb-20 md:pb-6">
      {/* Hidden file input for uploading profile picture */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        onChange={handleAvatarFileChange}
        className="hidden"
      />

      {/* Profile Card */}
      <div className="p-4 hover:bg-gcs-card/40 transition-colors flex items-center justify-between">
        <div
          onClick={() => {
            setNewAboutInput(aboutText);
            setIsEditAboutModal(true);
          }}
          className="flex items-center gap-3.5 min-w-0 flex-1 cursor-pointer"
        >
          {/* Avatar with Camera badge */}
          <div className="relative group shrink-0">
            <Avatar src={avatarUrl || currentUserAvatar} name={currentUserName} size="lg" status="online" />
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                fileInputRef.current?.click();
              }}
              disabled={isUploadingAvatar}
              className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-[#00a884] hover:bg-[#029070] text-white flex items-center justify-center shadow-md active:scale-90 transition-transform"
              title="Change Profile Picture"
            >
              {isUploadingAvatar ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Camera className="w-3.5 h-3.5" />
              )}
            </button>
          </div>

          <div className="flex flex-col min-w-0 flex-1">
            <span className="text-base font-bold text-gcs-text truncate leading-tight">
              {currentUserName}
            </span>
            <span className="text-xs text-gcs-muted truncate mt-0.5 font-mono">
              {currentUserEmail}
            </span>
            <span className="text-[11.5px] text-gcs-mint truncate mt-1">
              {aboutText}
            </span>
          </div>
        </div>

        <div className="p-2 rounded-xl text-gcs-muted hover:text-gcs-mint hover:bg-gcs-card transition-colors shrink-0">
          <QrCode className="w-5 h-5 text-gcs-emerald" />
        </div>
      </div>

      {/* Settings Navigation List */}
      <div className="flex flex-col py-2">
        {/* Account & Security */}
        <div
          onClick={() => setIsSecurityModal(true)}
          className="p-3.5 px-4 flex items-center justify-between hover:bg-gcs-card/50 cursor-pointer transition-colors"
        >
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="w-9 h-9 rounded-full bg-gcs-card border border-gcs-border flex items-center justify-center text-gcs-emerald shrink-0">
              <Key className="w-4.5 h-4.5" />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-sm font-semibold text-gcs-text">
                Account & Security Keys
              </span>
              <span className="text-xs text-gcs-muted truncate">
                Identity keys, X3DH prekeys, double ratchet state
              </span>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-gcs-muted shrink-0" />
        </div>

        {/* Privacy */}
        <div
          onClick={() => setIsPrivacyModal(true)}
          className="p-3.5 px-4 flex items-center justify-between hover:bg-gcs-card/50 cursor-pointer transition-colors"
        >
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="w-9 h-9 rounded-full bg-gcs-card border border-gcs-border flex items-center justify-center text-gcs-emerald shrink-0">
              <Lock className="w-4.5 h-4.5" />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-sm font-semibold text-gcs-text">
                Privacy
              </span>
              <span className="text-xs text-gcs-muted truncate">
                Read receipts, last seen, end-to-end status
              </span>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-gcs-muted shrink-0" />
        </div>

        {/* Notifications */}
        <div
          onClick={() => setIsNotificationsModal(true)}
          className="p-3.5 px-4 flex items-center justify-between hover:bg-gcs-card/50 cursor-pointer transition-colors"
        >
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="w-9 h-9 rounded-full bg-gcs-card border border-gcs-border flex items-center justify-center text-gcs-emerald shrink-0">
              <Bell className="w-4.5 h-4.5" />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-sm font-semibold text-gcs-text">
                Notifications
              </span>
              <span className="text-xs text-gcs-muted truncate">
                Message tones, push alerts, in-app banners
              </span>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-gcs-muted shrink-0" />
        </div>

        {/* Install App on Device (PWA) */}
        <div
          onClick={onOpenInstallModal}
          className="p-3.5 px-4 flex items-center justify-between hover:bg-gcs-emerald/10 cursor-pointer transition-colors border-y border-gcs-emerald/20 bg-gcs-emerald/5"
        >
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="w-9 h-9 rounded-full bg-gcs-emerald/20 border border-gcs-emerald/40 flex items-center justify-center text-gcs-mint shrink-0 shadow-emerald-sm">
              <Smartphone className="w-4.5 h-4.5 text-gcs-emerald" />
            </div>
            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-bold text-gcs-mint">
                  Install App on Device
                </span>
                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-gcs-emerald text-white font-bold">
                  NEW
                </span>
              </div>
              <span className="text-xs text-gcs-muted truncate">
                Add GCS CONNECT to your phone or desktop home screen
              </span>
            </div>
          </div>
          <Download className="w-4 h-4 text-gcs-emerald shrink-0" />
        </div>

        {/* Admin Console (If Admin) */}
        {isAdmin && (
          <Link
            href="/admin"
            className="p-3.5 px-4 flex items-center justify-between hover:bg-gcs-card/50 cursor-pointer transition-colors"
          >
            <div className="flex items-center gap-3.5 min-w-0">
              <div className="w-9 h-9 rounded-full bg-gcs-card border border-gcs-emerald/40 flex items-center justify-center text-gcs-emerald shrink-0">
                <ShieldCheck className="w-4.5 h-4.5" />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-sm font-semibold text-gcs-text">
                  Admin Console
                </span>
                <span className="text-xs text-gcs-muted truncate">
                  User accounts, audit logs, and security controls
                </span>
              </div>
            </div>
            <ExternalLink className="w-4 h-4 text-gcs-emerald shrink-0" />
          </Link>
        )}

        {/* Chats & Wallpaper */}
        <div
          onClick={() => setIsClearChatsConfirm(true)}
          className="p-3.5 px-4 flex items-center justify-between hover:bg-gcs-card/50 cursor-pointer transition-colors"
        >
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="w-9 h-9 rounded-full bg-gcs-card border border-gcs-border flex items-center justify-center text-gcs-emerald shrink-0">
              <Palette className="w-4.5 h-4.5" />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-sm font-semibold text-gcs-text">
                Chats & Wallpaper
              </span>
              <span className="text-xs text-gcs-muted truncate">
                Theme: Clean Obsidian Dark • Zero Distraction
              </span>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-gcs-muted shrink-0" />
        </div>

        {/* Help & About */}
        <div className="p-3.5 px-4 flex items-center justify-between hover:bg-gcs-card/50 cursor-pointer transition-colors">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="w-9 h-9 rounded-full bg-gcs-card border border-gcs-border flex items-center justify-center text-gcs-emerald shrink-0">
              <HelpCircle className="w-4.5 h-4.5" />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-sm font-semibold text-gcs-text">
                Help & About
              </span>
              <span className="text-xs text-gcs-muted truncate">
                GCS CONNECT v2.4.0 • Global Crest Solutions
              </span>
            </div>
          </div>
          <span className="text-xs font-mono text-gcs-muted">v2.4</span>
        </div>

        {/* Sign Out */}
        <div
          onClick={onLogout}
          className="p-3.5 px-4 flex items-center justify-between hover:bg-red-500/10 cursor-pointer transition-colors text-red-400"
        >
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="w-9 h-9 rounded-full bg-red-500/15 border border-red-500/30 flex items-center justify-center text-red-400 shrink-0">
              <LogOut className="w-4.5 h-4.5" />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-sm font-semibold">
                Sign Out
              </span>
              <span className="text-xs text-red-400/70 truncate">
                Terminates encrypted session from this device
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Edit Profile & Avatar Modal */}
      <Modal
        isOpen={isEditAboutModal}
        onClose={() => setIsEditAboutModal(false)}
        title="Profile & Picture"
        description="Manage your profile photo, display name, and about status."
      >
        <div className="flex flex-col gap-4 text-sm mt-1">
          {/* Centered Avatar with Camera button */}
          <div className="flex flex-col items-center justify-center py-2 gap-2.5">
            <div className="relative group">
              <Avatar
                src={avatarUrl || currentUserAvatar}
                name={currentUserName}
                size="xl"
                className="w-24 h-24 text-2xl border-2 border-[#00a884]"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploadingAvatar}
                className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-[#00a884] hover:bg-[#029070] text-white flex items-center justify-center shadow-lg active:scale-95 transition-transform"
                title="Upload Photo"
              >
                {isUploadingAvatar ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Camera className="w-4 h-4" />
                )}
              </button>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploadingAvatar}
                className="text-xs h-8 flex items-center gap-1.5"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Upload Photo</span>
              </Button>

              {(avatarUrl || currentUserAvatar) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleRemoveAvatar}
                  disabled={isUploadingAvatar}
                  className="text-xs h-8 text-red-400 hover:text-red-300 hover:bg-red-500/10 flex items-center gap-1.5"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Remove</span>
                </Button>
              )}
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-gcs-muted block mb-1.5">
              Your Name
            </label>
            <div className="p-3 bg-gcs-card/60 text-white border border-gcs-border rounded-xl text-sm font-medium">
              {currentUserName}
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-gcs-muted block mb-1.5">
              About & Status
            </label>
            <input
              type="text"
              value={newAboutInput}
              onChange={(e) => setNewAboutInput(e.target.value)}
              maxLength={100}
              className="w-full p-3 bg-gcs-card text-gcs-text border border-gcs-border rounded-xl text-sm focus:outline-none focus:border-gcs-emerald"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" size="sm" onClick={() => setIsEditAboutModal(false)}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={handleSaveAbout} className="bg-gcs-emerald">
              Save
            </Button>
          </div>
        </div>
      </Modal>

      {/* Security Keys Modal */}
      <Modal
        isOpen={isSecurityModal}
        onClose={() => setIsSecurityModal(false)}
        title="Cryptographic Key Inventory"
        description="Client-side end-to-end cryptographic attributes active for this device."
      >
        <div className="flex flex-col gap-3 text-xs mt-1">
          <div className="p-3 rounded-xl bg-gcs-sidebar border border-gcs-border space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-gcs-muted">Identity Key (IK):</span>
              <span className="font-mono text-gcs-mint">Curve25519 Verified</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gcs-muted">Symmetric Cipher:</span>
              <span className="font-mono text-gcs-mint">AES-256-GCM (AEAD)</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gcs-muted">Media Encryption:</span>
              <span className="font-mono text-gcs-mint">AES-CTR + HMAC-SHA256</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gcs-muted">Calling Stream:</span>
              <span className="font-mono text-gcs-mint">DTLS-SRTP P2P</span>
            </div>
          </div>
          <div className="p-3 rounded-xl bg-gcs-emerald/10 border border-gcs-emerald/30 text-gcs-mint">
            🔒 Private keys are strictly stored in browser IndexedDB and never transmitted to the Hostinger server.
          </div>
          <div className="flex justify-end pt-2">
            <Button variant="ghost" size="sm" onClick={() => setIsSecurityModal(false)}>
              Close
            </Button>
          </div>
        </div>
      </Modal>

      {/* Privacy Settings Modal */}
      <Modal
        isOpen={isPrivacyModal}
        onClose={() => setIsPrivacyModal(false)}
        title="Privacy Settings"
        description="Manage your read receipts, online presence, and security indicators."
      >
        <div className="flex flex-col gap-4 text-xs mt-1">
          <div className="flex items-center justify-between p-3 rounded-xl bg-gcs-sidebar border border-gcs-border">
            <div>
              <span className="text-sm font-semibold text-gcs-text block">
                Read Receipts (Blue Ticks)
              </span>
              <span className="text-gcs-muted text-[11px] block mt-0.5">
                If turned off, you won't send or receive read receipts.
              </span>
            </div>
            <button
              type="button"
              onClick={() => setReadReceipts(!readReceipts)}
              className={`w-11 h-6 flex items-center rounded-full p-1 cursor-pointer transition-colors ${
                readReceipts ? 'bg-gcs-emerald' : 'bg-gcs-border'
              }`}
            >
              <div
                className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${
                  readReceipts ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          <div className="flex justify-end pt-2">
            <Button variant="ghost" size="sm" onClick={() => setIsPrivacyModal(false)}>
              Done
            </Button>
          </div>
        </div>
      </Modal>

      {/* Clear All Chats Confirmation Modal */}
      <Modal
        isOpen={isClearChatsConfirm}
        onClose={() => setIsClearChatsConfirm(false)}
        title="Chat & Wallpaper Options"
        description="Customize your chat display and manage conversation data."
      >
        <div className="flex flex-col gap-3 text-xs mt-1">
          <div className="p-3 rounded-xl bg-gcs-sidebar border border-gcs-border space-y-1">
            <span className="font-semibold text-gcs-text block">Chat Wallpaper</span>
            <p className="text-gcs-muted text-[11px]">
              Chat background is set to the default clean Obsidian Dark mode with zero background image.
            </p>
          </div>

          {onClearAllChats && (
            <Button
              variant="danger"
              size="sm"
              onClick={() => {
                setIsClearChatsConfirm(false);
                onClearAllChats();
              }}
              className="w-full text-xs h-9 bg-red-500/20 hover:bg-red-500 text-red-300 hover:text-white flex items-center justify-center gap-2"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Clear All Chat History</span>
            </Button>
          )}

          <div className="flex justify-end pt-2">
            <Button variant="ghost" size="sm" onClick={() => setIsClearChatsConfirm(false)}>
              Close
            </Button>
          </div>
        </div>
      </Modal>

      {/* Notifications Preferences Modal */}
      <Modal
        isOpen={isNotificationsModal}
        onClose={() => setIsNotificationsModal(false)}
        title="Notification Settings"
        description="Manage how and when you receive message alerts."
      >
        <div className="flex flex-col gap-4 text-xs mt-1">
          {/* Browser / Push Notifications */}
          <div className="p-3 rounded-xl bg-gcs-sidebar border border-gcs-border flex items-center justify-between">
            <div className="flex flex-col gap-0.5 min-w-0 pr-3">
              <span className="font-semibold text-gcs-text">Browser Push Alerts</span>
              <span className="text-gcs-muted text-[11px]">
                {browserNotifStatus === 'granted'
                  ? 'Notifications are allowed and active on this browser.'
                  : browserNotifStatus === 'denied'
                  ? 'Notifications are blocked in your browser settings.'
                  : 'Receive system alerts even when the tab is in the background.'}
              </span>
            </div>
            {browserNotifStatus === 'granted' ? (
              <span className="px-2.5 py-1 bg-gcs-emerald/20 text-gcs-mint border border-gcs-emerald/40 rounded-lg text-[10px] font-bold uppercase shrink-0">
                Enabled
              </span>
            ) : (
              <Button
                variant="primary"
                size="sm"
                onClick={requestBrowserNotif}
                className="shrink-0 text-xs px-3 py-1.5 h-8 bg-[#00a884] hover:bg-[#008f6f]"
              >
                Allow
              </Button>
            )}
          </div>

          {/* In-App Notification Banners */}
          <div className="p-3 rounded-xl bg-gcs-sidebar border border-gcs-border flex items-center justify-between">
            <div className="flex flex-col gap-0.5 min-w-0 pr-3">
              <span className="font-semibold text-gcs-text">In-App Floating Banners</span>
              <span className="text-gcs-muted text-[11px]">
                Show a floating preview card when a message arrives while in another chat.
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                const next = !notifBanner;
                setNotifBanner(next);
                if (typeof window !== 'undefined') {
                  localStorage.setItem('gcs_notif_banners', next ? 'true' : 'false');
                }
              }}
              className={cn(
                'w-11 h-6 rounded-full transition-colors relative shrink-0',
                notifBanner ? 'bg-[#00a884]' : 'bg-[#374248]'
              )}
            >
              <div
                className={cn(
                  'w-5 h-5 rounded-full bg-white transition-transform absolute top-0.5',
                  notifBanner ? 'right-0.5' : 'left-0.5'
                )}
              />
            </button>
          </div>

          {/* Sound Tones */}
          <div className="p-3 rounded-xl bg-gcs-sidebar border border-gcs-border flex items-center justify-between">
            <div className="flex flex-col gap-0.5 min-w-0 pr-3">
              <span className="font-semibold text-gcs-text">Message Sound Chimes</span>
              <span className="text-gcs-muted text-[11px]">
                Play audio chimes when messages are sent or received.
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                const next = !notifSound;
                setNotifSound(next);
                if (typeof window !== 'undefined') {
                  localStorage.setItem('gcs_notif_sounds', next ? 'true' : 'false');
                }
              }}
              className={cn(
                'w-11 h-6 rounded-full transition-colors relative shrink-0',
                notifSound ? 'bg-[#00a884]' : 'bg-[#374248]'
              )}
            >
              <div
                className={cn(
                  'w-5 h-5 rounded-full bg-white transition-transform absolute top-0.5',
                  notifSound ? 'right-0.5' : 'left-0.5'
                )}
              />
            </button>
          </div>

          <div className="flex justify-end pt-1">
            <Button variant="ghost" size="sm" onClick={() => setIsNotificationsModal(false)}>
              Done
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
