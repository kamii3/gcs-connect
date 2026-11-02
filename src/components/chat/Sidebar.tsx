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
  Trash2,
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
  peerUserId?: string;
}

export interface SidebarProps {
  conversations: ConversationItem[];
  activeConversationId?: string;
  onSelectConversation: (id: string) => void;
  onDeleteConversation?: (id: string, e: React.MouseEvent) => void;
  onNewChat?: () => void;
  onOpenSettings?: () => void;
  currentUserName: string;
  currentUserEmail: string;
}

export const Sidebar: React.FC<SidebarProps> = ({
  conversations,
  activeConversationId,
  onSelectConversation,
  onDeleteConversation,
  onNewChat,
  onOpenSettings,
  currentUserName,
  currentUserEmail,
}) => {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'unread' | 'direct' | 'groups'>('all');

  const unreadTotal = conversations.reduce((acc, c) => acc + (c.unreadCount || 0), 0);

  const filtered = conversations.filter((c) => {
    const matchesSearch = c.name.toLowerCase().includes(search.toLowerCase());
    if (!matchesSearch) return false;
    if (filter === 'unread') return (c.unreadCount || 0) > 0;
    if (filter === 'direct') return !c.isGroup;
    if (filter === 'groups') return Boolean(c.isGroup);
    return true;
  });

  return (
    <div className="w-full md:w-80 lg:w-96 h-full bg-gcs-sidebar md:border-r border-gcs-border flex flex-col select-none">
      {/* App Brand Header */}
      <div className="p-3.5 sm:p-4 border-b border-gcs-border/60 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="h-8.5 w-8.5 rounded-xl bg-gcs-emerald/20 border border-gcs-emerald/40 flex items-center justify-center text-gcs-emerald font-bold text-sm shadow-emerald-sm shrink-0">
            <Shield className="w-4.5 h-4.5 text-gcs-emerald" />
          </div>
          <div className="min-w-0">
            <h1 className="text-sm font-bold tracking-tight text-gcs-text flex items-center gap-1.5">
              <span>GCS CONNECT</span>
              <span className="text-[10px] font-mono font-medium px-1.5 py-0.2 bg-gcs-emerald/20 text-gcs-mint rounded border border-gcs-emerald/30">
                E2EE
              </span>
            </h1>
            <p className="text-[10.5px] text-gcs-muted truncate">
              Connect Freely. Communicate Securely.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={onNewChat}
            className="h-9 w-9 text-gcs-muted hover:text-gcs-mint hover:bg-gcs-card rounded-full"
            aria-label="Start New Chat"
            title="Start New Chat"
          >
            <MessageSquarePlus className="w-4.5 h-4.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={onOpenSettings}
            className="h-9 w-9 text-gcs-muted hover:text-gcs-text hover:bg-gcs-card rounded-full"
            aria-label="Settings"
            title="Settings"
          >
            <Settings className="w-4.5 h-4.5" />
          </Button>
        </div>
      </div>

      {/* Search & Filters */}
      <div className="p-2.5 sm:p-3 border-b border-gcs-border/40 flex flex-col gap-2 shrink-0">
        <Input
          placeholder="Search chats or messages..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          leftIcon={<Search className="w-4 h-4 text-gcs-muted" />}
          className="h-9 bg-gcs-card/80 text-base sm:text-xs rounded-xl"
        />

        <div className="flex items-center gap-1.5 pt-0.5 overflow-x-auto pb-0.5 no-scrollbar scroll-touch">
          {(['all', 'unread', 'direct', 'groups'] as const).map((tab) => {
            const count = tab === 'unread' ? unreadTotal : undefined;
            return (
              <button
                key={tab}
                onClick={() => setFilter(tab)}
                className={cn(
                  'text-xs px-3 py-1.5 rounded-full font-medium capitalize transition-colors flex items-center gap-1 shrink-0 active:scale-95',
                  filter === tab
                    ? 'bg-gcs-emerald/20 text-gcs-mint border border-gcs-emerald/40'
                    : 'text-gcs-muted hover:text-gcs-text hover:bg-gcs-card'
                )}
              >
                <span>{tab}</span>
                {count !== undefined && count > 0 && (
                  <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-gcs-emerald text-white font-bold leading-none">
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Conversation List */}
      <div className="flex-1 overflow-y-auto divide-y divide-gcs-border/20">
        {filtered.length === 0 ? (
          <div className="p-8 text-center text-xs text-gcs-muted flex flex-col items-center gap-3 justify-center h-full">
            <Lock className="w-8 h-8 text-gcs-border" />
            <div className="space-y-1">
              <span className="block font-medium text-gcs-text">No conversations found</span>
              <span className="block text-[11px] text-gcs-muted">
                {conversations.length === 0
                  ? 'Your chat list is empty. Start a new encrypted conversation.'
                  : 'No chats match the selected filter.'}
              </span>
            </div>
            {conversations.length === 0 && onNewChat && (
              <Button
                variant="primary"
                size="sm"
                onClick={onNewChat}
                className="mt-2 text-xs h-8 px-3 bg-gcs-emerald hover:bg-[#00c28c]"
              >
                <MessageSquarePlus className="w-3.5 h-3.5 mr-1.5" />
                <span>Start New Chat</span>
              </Button>
            )}
          </div>
        ) : (
          filtered.map((item) => {
            const isActive = item.id === activeConversationId;
            return (
              <div
                key={item.id}
                onClick={() => onSelectConversation(item.id)}
                className={cn(
                  'flex items-center gap-3 p-3.5 cursor-pointer transition-colors text-left relative group active:bg-gcs-card/80',
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
                        <CheckCheck className="w-3.5 h-3.5 text-[#34B7F1] shrink-0" />
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
                      {onDeleteConversation && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteConversation(item.id, e);
                          }}
                          className="opacity-60 sm:opacity-0 sm:group-hover:opacity-100 p-1.5 rounded-lg hover:bg-red-500/20 text-gcs-muted hover:text-red-400 active:scale-95 transition-all"
                          title="Delete Chat"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
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
