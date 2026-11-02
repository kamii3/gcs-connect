'use client';

import React from 'react';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Phone, Video, Search, MoreVertical, ShieldCheck, Trash2 } from 'lucide-react';

export interface ChatHeaderProps {
  contactName: string;
  avatarSrc?: string | null;
  status: 'online' | 'offline' | 'away';
  statusText?: string;
  onVoiceCall?: () => void;
  onVideoCall?: () => void;
  onSearch?: () => void;
  onDeleteChat?: () => void;
  onMoreOptions?: () => void;
  onOpenDetails?: () => void;
}

export const ChatHeader: React.FC<ChatHeaderProps> = ({
  contactName,
  avatarSrc,
  status,
  statusText,
  onVoiceCall,
  onVideoCall,
  onSearch,
  onDeleteChat,
  onMoreOptions,
  onOpenDetails,
}) => {
  return (
    <div className="h-16 px-4 bg-gcs-sidebar border-b border-gcs-border flex items-center justify-between select-none">
      {/* Contact Profile Summary */}
      <div
        className="flex items-center gap-3 cursor-pointer group"
        onClick={onOpenDetails}
      >
        <Avatar
          src={avatarSrc}
          name={contactName}
          size="md"
          status={status}
          className="group-hover:opacity-90"
        />
        <div className="flex flex-col text-left">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-semibold text-gcs-text leading-tight group-hover:text-gcs-mint transition-colors">
              {contactName}
            </span>
            <ShieldCheck
              className="w-3.5 h-3.5 text-gcs-emerald"
              aria-label="Verified E2EE Session"
            />
          </div>
          <span className="text-xs text-gcs-muted capitalize">
            {statusText || (status === 'online' ? 'Online' : 'Offline')}
          </span>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          onClick={onVoiceCall}
          className="text-gcs-muted hover:text-gcs-mint hover:bg-gcs-card"
          aria-label="Start Voice Call"
          title="Voice Call"
        >
          <Phone className="w-4 h-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={onVideoCall}
          className="text-gcs-muted hover:text-gcs-mint hover:bg-gcs-card"
          aria-label="Start Video Call"
          title="Video Call"
        >
          <Video className="w-4 h-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={onSearch}
          className="text-gcs-muted hover:text-gcs-text hover:bg-gcs-card"
          aria-label="Search Messages"
          title="Search"
        >
          <Search className="w-4 h-4" />
        </Button>
        {onDeleteChat && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onDeleteChat}
            className="text-gcs-muted hover:text-red-400 hover:bg-red-500/10 transition-colors"
            aria-label="Delete Chat"
            title="Delete Chat"
          >
            <Trash2 className="w-4 h-4 text-[#D94D55]" />
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={onMoreOptions}
          className="text-gcs-muted hover:text-gcs-text hover:bg-gcs-card"
          aria-label="More Options"
          title="Options"
        >
          <MoreVertical className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
};
