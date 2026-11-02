'use client';

import React, { useState } from 'react';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import {
  Search,
  MessageSquarePlus,
  Shield,
  Settings,
  Pin,
  VolumeX,
  CheckCheck,
  Check,
  Lock,
} from 'lucide-react';
import { cn, formatChatTime } from '@/lib/utils';

export interface ConversationItem {
  id: string;
  name: string;
  avatarSrc?: string | null;
  status: 'online' | 'offline' | 'away';
  lastMessage?: string;
  lastMessageTime: string | Date | number;
  lastMessageStatus?: 'sent' | 'delivered' | 'read';
  unreadCount?: number;
  isPinned?: boolean;
  isMuted?: boolean;
  isGroup?: boolean;
}

export interface SidebarProps {
  conversations: ConversationItem[];
  activeConversationId?: string;
  onSelectConversation: (id: string) => void;
  onNewChat?: () => void;
  onOpenSettings?: () => void;
  currentUserName: string;
  currentUserEmail: string;
}

export const Sidebar: React.FC<SidebarProps> = ({
  conversations,
  activeConversationId,
  onSelectConversation,
  onNewChat,
  onOpenSettings,
  currentUserName,
  currentUserEmail,
}) => {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'unread' | 'direct'>('all');

  const filtered = conversations.filter((c) => {
    const matchesSearch = c.name.toLowerCase().includes(search.toLowerCase());
    if (!matchesSearch) return false;
    if (filter === 'unread') return (c.unreadCount || 0) > 0;
    if (filter === 'direct') return !c.isGroup;
    return true;
  });

  return (
    <div className="w-full sm:w-80 md:w-96 h-full bg-gcs-sidebar border-r border-gcs-border flex flex-col select-none">
      {/* App Brand Header */}
      <div className="p-4 border-b border-gcs-border/60 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-lg bg-gcs-emerald/20 border border-gcs-emerald/40 flex items-center justify-center text-gcs-emerald font-bold text-sm shadow-emerald-sm">
            <Shield className="w-4 h-4 text-gcs-emerald" />
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-tight text-gcs-text flex items-center gap-1.5">
              <span>GCS CONNECT</span>
              <span className="text-[10px] font-mono font-medium px-1.5 py-0.2 bg-gcs-emerald/20 text-gcs-mint rounded border border-gcs-emerald/30">
                E2EE
              </span>
            </h1>
            <p className="text-[10px] text-gcs-muted truncate">
              Connect Freely. Communicate Securely.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={onNewChat}
            className="h-8 w-8 text-gcs-muted hover:text-gcs-mint hover:bg-gcs-card"
            aria-label="Start New Chat"
          >
            <MessageSquarePlus className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={onOpenSettings}
            className="h-8 w-8 text-gcs-muted hover:text-gcs-text hover:bg-gcs-card"
            aria-label="Settings"
          >
            <Settings className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Search & Filters */}
      <div className="p-3 border-b border-gcs-border/40 flex flex-col gap-2">
        <Input
          placeholder="Search chats or messages..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          leftIcon={<Search className="w-4 h-4 text-gcs-muted" />}
          className="h-8.5 bg-gcs-card/80 text-xs rounded-xl"
        />

        <div className="flex items-center gap-1.5 pt-0.5">
          {(['all', 'unread', 'direct'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setFilter(tab)}
              className={cn(
                'text-xs px-2.5 py-1 rounded-full font-medium capitalize transition-colors',
                filter === tab
                  ? 'bg-gcs-emerald/20 text-gcs-mint border border-gcs-emerald/40'
                  : 'text-gcs-muted hover:text-gcs-text hover:bg-gcs-card'
              )}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* Conversation List */}
      <div className="flex-1 overflow-y-auto divide-y divide-gcs-border/20">
        {filtered.length === 0 ? (
          <div className="p-8 text-center text-xs text-gcs-muted flex flex-col items-center gap-2">
            <Lock className="w-8 h-8 text-gcs-border" />
            <span>No conversations found</span>
          </div>
        ) : (
          filtered.map((item) => {
            const isActive = item.id === activeConversationId;
            return (
              <div
                key={item.id}
                onClick={() => onSelectConversation(item.id)}
                className={cn(
                  'flex items-center gap-3 p-3.5 cursor-pointer transition-colors text-left relative group',
                  isActive
                    ? 'bg-gcs-card/90 border-l-3 border-gcs-emerald'
                    : 'hover:bg-gcs-card/50'
                )}
              >
                <Avatar
                  src={item.avatarSrc}
                  name={item.name}
                  size="md"
                  status={item.status}
                />

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-0.5">
                    <span
                      className={cn(
                        'text-sm font-semibold truncate',
                        isActive ? 'text-gcs-mint' : 'text-gcs-text'
                      )}
                    >
                      {item.name}
                    </span>
                    <span className="text-[11px] text-gcs-muted shrink-0 ml-2">
                      {formatChatTime(item.lastMessageTime)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-1">
                    <div className="flex items-center gap-1 text-xs text-gcs-muted truncate">
                      {item.lastMessageStatus === 'read' && (
                        <CheckCheck className="w-3.5 h-3.5 text-gcs-mint shrink-0" />
                      )}
                      {item.lastMessageStatus === 'delivered' && (
                        <CheckCheck className="w-3.5 h-3.5 text-gcs-muted shrink-0" />
                      )}
                      {item.lastMessageStatus === 'sent' && (
                        <Check className="w-3.5 h-3.5 text-gcs-muted shrink-0" />
                      )}
                      <span className="truncate">{item.lastMessage || 'No messages yet'}</span>
                    </div>

                    <div className="flex items-center gap-1 shrink-0 ml-2">
                      {item.isMuted && (
                        <VolumeX className="w-3 h-3 text-gcs-muted" />
                      )}
                      {item.isPinned && (
                        <Pin className="w-3 h-3 text-gcs-emerald" />
                      )}
                      {(item.unreadCount || 0) > 0 && (
                        <Badge variant="emerald" size="sm">
                          {item.unreadCount}
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* User Footer Bar */}
      <div className="p-3 border-t border-gcs-border/60 bg-gcs-bg flex items-center justify-between">
        <div className="flex items-center gap-2.5 min-w-0">
          <Avatar name={currentUserName} size="sm" status="online" />
          <div className="min-w-0">
            <span className="text-xs font-semibold text-gcs-text block truncate leading-tight">
              {currentUserName}
            </span>
            <span className="text-[10px] text-gcs-muted block truncate font-mono">
              {currentUserEmail}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-gcs-emerald animate-pulse" />
          <span className="text-[10.5px] font-mono text-gcs-emerald font-semibold uppercase">
            SECURE
          </span>
        </div>
      </div>
    </div>
  );
};
