'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import {
  Phone,
  Video,
  Search,
  MoreVertical,
  ShieldCheck,
  Trash2,
  Eraser,
  Info,
  ArrowLeft,
} from 'lucide-react';

export interface ChatHeaderProps {
  contactName: string;
  avatarSrc?: string | null;
  status: 'online' | 'offline' | 'away';
  statusText?: string;
  onBack?: () => void;
  onVoiceCall?: () => void;
  onVideoCall?: () => void;
  onSearch?: () => void;
  onClearHistory?: () => void;
  onDeleteChat?: () => void;
  onMoreOptions?: () => void;
  onOpenDetails?: () => void;
}

export const ChatHeader: React.FC<ChatHeaderProps> = ({
  contactName,
  avatarSrc,
  status,
  statusText,
  onBack,
  onVoiceCall,
  onVideoCall,
  onSearch,
  onClearHistory,
  onDeleteChat,
  onMoreOptions,
  onOpenDetails,
}) => {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    if (isDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [isDropdownOpen]);

  return (
    <div className="h-14 sm:h-16 px-2 sm:px-4 bg-gcs-sidebar border-b border-gcs-border flex items-center justify-between select-none relative z-20 shrink-0 safe-top">
      {/* Left Section: Back Button + Contact Summary */}
      <div className="flex items-center gap-1.5 sm:gap-3 min-w-0 flex-1 mr-2">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="md:hidden p-2 -ml-1 text-gcs-muted hover:text-gcs-mint hover:bg-gcs-card active:scale-90 rounded-full transition-all shrink-0 flex items-center justify-center min-w-[38px] min-h-[38px]"
            aria-label="Back to conversations"
            title="Back to conversations"
          >
            <ArrowLeft className="w-5 h-5 text-gcs-mint" />
          </button>
        )}

        <div
          className="flex items-center gap-2 sm:gap-3 cursor-pointer group min-w-0 flex-1"
          onClick={onOpenDetails}
        >
          <Avatar
            src={avatarSrc}
            name={contactName}
            size="md"
            status={status}
            className="group-hover:opacity-90 shrink-0"
          />
          <div className="flex flex-col text-left min-w-0 flex-1">
            <div className="flex items-center gap-1 sm:gap-1.5">
              <span className="text-xs sm:text-sm font-semibold text-gcs-text leading-tight group-hover:text-gcs-mint transition-colors truncate">
                {contactName}
              </span>
              <ShieldCheck
                className="w-3.5 h-3.5 text-gcs-emerald shrink-0"
                aria-label="Verified E2EE Session"
              />
            </div>
            <span className="text-[10px] sm:text-xs text-gcs-muted truncate flex items-center gap-1.5">
              {status === 'online' ? (
                <>
                  <span className="h-1.5 w-1.5 rounded-full bg-gcs-emerald shrink-0" />
                  <span className="text-gcs-mint font-medium">Online</span>
                </>
              ) : (
                <span>Offline</span>
              )}
            </span>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center gap-0.5 sm:gap-1 shrink-0">
        <Button
          variant="ghost"
          size="icon"
          onClick={onVoiceCall}
          className="h-8.5 w-8.5 sm:h-9 sm:w-9 text-gcs-muted hover:text-gcs-mint hover:bg-gcs-card"
          aria-label="Start Voice Call"
          title="Voice Call"
        >
          <Phone className="w-4 h-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={onVideoCall}
          className="h-8.5 w-8.5 sm:h-9 sm:w-9 text-gcs-muted hover:text-gcs-mint hover:bg-gcs-card"
          aria-label="Start Video Call"
          title="Video Call"
        >
          <Video className="w-4 h-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={onSearch}
          className="hidden xs:flex h-8.5 w-8.5 sm:h-9 sm:w-9 text-gcs-muted hover:text-gcs-text hover:bg-gcs-card"
          aria-label="Search Messages"
          title="Search"
        >
          <Search className="w-4 h-4" />
        </Button>

        {/* WhatsApp-Style 3-Dots Dropdown Menu */}
        <div className="relative" ref={dropdownRef}>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsDropdownOpen((prev) => !prev)}
            className="h-8.5 w-8.5 sm:h-9 sm:w-9 text-gcs-muted hover:text-gcs-text hover:bg-gcs-card"
            aria-label="More Options"
            title="Menu"
          >
            <MoreVertical className="w-4 h-4" />
          </Button>

          {isDropdownOpen && (
            <div className="absolute right-0 top-full mt-1.5 w-48 bg-gcs-card border border-gcs-border rounded-xl shadow-2xl py-1 text-xs z-50 animate-fade-in flex flex-col">
              {onOpenDetails && (
                <button
                  type="button"
                  onClick={() => {
                    setIsDropdownOpen(false);
                    onOpenDetails();
                  }}
                  className="px-3.5 py-2.5 text-left hover:bg-gcs-sidebar text-gcs-text flex items-center gap-2.5 transition-colors"
                >
                  <Info className="w-3.5 h-3.5 text-gcs-muted" />
                  <span>Contact info</span>
                </button>
              )}

              {onSearch && (
                <button
                  type="button"
                  onClick={() => {
                    setIsDropdownOpen(false);
                    onSearch();
                  }}
                  className="xs:hidden px-3.5 py-2.5 text-left hover:bg-gcs-sidebar text-gcs-text flex items-center gap-2.5 transition-colors"
                >
                  <Search className="w-3.5 h-3.5 text-gcs-muted" />
                  <span>Search messages</span>
                </button>
              )}

              {onClearHistory && (
                <button
                  type="button"
                  onClick={() => {
                    setIsDropdownOpen(false);
                    onClearHistory();
                  }}
                  className="px-3.5 py-2.5 text-left hover:bg-gcs-sidebar text-gcs-text flex items-center gap-2.5 transition-colors"
                >
                  <Eraser className="w-3.5 h-3.5 text-gcs-muted" />
                  <span>Clear messages</span>
                </button>
              )}

              {onDeleteChat && (
                <button
                  type="button"
                  onClick={() => {
                    setIsDropdownOpen(false);
                    onDeleteChat();
                  }}
                  className="px-3.5 py-2.5 text-left hover:bg-red-500/10 text-[#ff8e95] flex items-center gap-2.5 transition-colors border-t border-gcs-border/40"
                >
                  <Trash2 className="w-3.5 h-3.5 text-[#D94D55]" />
                  <span>Delete chat</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
