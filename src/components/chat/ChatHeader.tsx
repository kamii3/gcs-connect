'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { formatLastSeen } from '@/lib/utils';
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
  VolumeX,
  Lock,
  Download,
} from 'lucide-react';

export interface ChatHeaderProps {
  contactName: string;
  avatarSrc?: string | null;
  status: 'online' | 'offline' | 'away';
  statusText?: string;
  isTyping?: boolean;
  lastSeenAt?: Date | number | string | null;
  onBack?: () => void;
  onVoiceCall?: () => void;
  onVideoCall?: () => void;
  onSearch?: () => void;
  onExportChat?: () => void;
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
  isTyping,
  lastSeenAt,
  onBack,
  onVoiceCall,
  onVideoCall,
  onSearch,
  onExportChat,
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
    <div className="h-14 sm:h-16 px-2 sm:px-4 bg-[#202c33] border-b border-gcs-border/40 flex items-center justify-between select-none relative z-20 shrink-0 safe-top">
      {/* Left Section: WhatsApp Back Arrow + Avatar + Contact Status */}
      <div className="flex items-center gap-1 sm:gap-2.5 min-w-0 flex-1 mr-2">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="md:hidden p-1.5 -ml-1 text-[#aebac1] hover:text-white active:scale-90 rounded-full transition-all shrink-0 flex items-center justify-center min-w-[38px] min-h-[38px]"
            aria-label="Back to chats"
            title="Back to chats"
          >
            <ArrowLeft className="w-5 h-5 text-[#00a884]" />
          </button>
        )}

        <div
          className="flex items-center gap-2.5 cursor-pointer group min-w-0 flex-1"
          onClick={onOpenDetails}
        >
          <Avatar
            src={avatarSrc}
            name={contactName}
            size="md"
            status={status}
            className="group-hover:opacity-90 shrink-0 border border-gcs-border/40"
          />
          <div className="flex flex-col text-left min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="text-[14.5px] font-semibold text-white leading-tight group-hover:text-gcs-mint transition-colors truncate">
                {contactName}
              </span>
              <ShieldCheck
                className="w-3.5 h-3.5 text-[#00a884] shrink-0"
                aria-label="End-to-End Encrypted"
              />
            </div>
            <span className="text-[11px] text-[#8696a0] truncate flex items-center gap-1.5">
              {isTyping ? (
                <span className="text-[#00a884] font-medium animate-pulse">typing...</span>
              ) : status === 'online' ? (
                <>
                  <span className="h-1.5 w-1.5 rounded-full bg-[#00a884] shrink-0" />
                  <span className="text-[#00a884] font-medium">online</span>
                </>
              ) : (
                <span className="text-[#8696a0]">
                  {statusText || (lastSeenAt ? formatLastSeen(lastSeenAt) : 'last seen recently')}
                </span>
              )}
            </span>
          </div>
        </div>
      </div>

      {/* Right Section: WhatsApp Calling & Menu Icons */}
      <div className="flex items-center gap-0.5 sm:gap-1 shrink-0 relative" ref={dropdownRef}>
        {onVideoCall && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onVideoCall}
            className="h-9 w-9 text-[#aebac1] hover:text-[#00a884] hover:bg-[#111b21] rounded-full active:scale-90 transition-all"
            aria-label="Start Video Call"
            title="Start Video Call"
          >
            <Video className="w-5 h-5" />
          </Button>
        )}

        {onVoiceCall && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onVoiceCall}
            className="h-9 w-9 text-[#aebac1] hover:text-[#00a884] hover:bg-[#111b21] rounded-full active:scale-90 transition-all"
            aria-label="Start Voice Call"
            title="Start Voice Call"
          >
            <Phone className="w-4.5 h-4.5" />
          </Button>
        )}

        {onSearch && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onSearch}
            className="hidden sm:flex h-9 w-9 text-[#aebac1] hover:text-white hover:bg-[#111b21] rounded-full active:scale-90 transition-all"
            aria-label="Search Messages"
            title="Search Messages"
          >
            <Search className="w-4.5 h-4.5" />
          </Button>
        )}

        <Button
          variant="ghost"
          size="icon"
          onClick={() => setIsDropdownOpen(!isDropdownOpen)}
          className="h-9 w-9 text-[#aebac1] hover:text-white hover:bg-[#111b21] rounded-full active:scale-90 transition-all"
          aria-label="More Options"
          title="More Options"
        >
          <MoreVertical className="w-4.5 h-4.5" />
        </Button>

        {/* WhatsApp 3-Dots Dropdown Menu */}
        {isDropdownOpen && (
          <div className="absolute right-0 top-full mt-1.5 w-52 bg-[#233138] border border-gcs-border rounded-2xl shadow-2xl py-1.5 z-50 text-xs text-white backdrop-blur-xl animate-fade-in divide-y divide-gcs-border/30">
            <div className="py-1">
              {onOpenDetails && (
                <button
                  type="button"
                  onClick={() => {
                    setIsDropdownOpen(false);
                    onOpenDetails();
                  }}
                  className="w-full px-3.5 py-2.5 text-left hover:bg-[#182229] flex items-center gap-2.5 transition-colors"
                >
                  <Info className="w-4 h-4 text-gcs-muted" />
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
                  className="w-full px-3.5 py-2.5 text-left hover:bg-[#182229] flex items-center gap-2.5 transition-colors"
                >
                  <Search className="w-4 h-4 text-gcs-muted" />
                  <span>Search</span>
                </button>
              )}
            </div>

            <div className="py-1">
              {onExportChat && (
                <button
                  type="button"
                  onClick={() => {
                    setIsDropdownOpen(false);
                    onExportChat();
                  }}
                  className="w-full px-3.5 py-2.5 text-left hover:bg-[#182229] flex items-center gap-2.5 text-gcs-muted hover:text-white transition-colors"
                >
                  <Download className="w-4 h-4 text-[#00a884]" />
                  <span>Export chat</span>
                </button>
              )}

              {onClearHistory && (
                <button
                  type="button"
                  onClick={() => {
                    setIsDropdownOpen(false);
                    onClearHistory();
                  }}
                  className="w-full px-3.5 py-2.5 text-left hover:bg-[#182229] flex items-center gap-2.5 text-gcs-muted hover:text-white transition-colors"
                >
                  <Eraser className="w-4 h-4 text-gcs-muted" />
                  <span>Clear chat history</span>
                </button>
              )}

              {onDeleteChat && (
                <button
                  type="button"
                  onClick={() => {
                    setIsDropdownOpen(false);
                    onDeleteChat();
                  }}
                  className="w-full px-3.5 py-2.5 text-left hover:bg-red-500/20 text-red-300 hover:text-red-200 flex items-center gap-2.5 transition-colors"
                >
                  <Trash2 className="w-4 h-4 text-red-400" />
                  <span>Delete conversation</span>
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
