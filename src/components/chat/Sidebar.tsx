'use client';

import React, { useState, useRef, useEffect } from 'react';
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
  Smartphone,
  Phone,
  CircleDashed,
  MoreVertical,
  ExternalLink,
  MessageSquare,
  LogOut,
  Camera,
  ArrowLeft,
  X,
} from 'lucide-react';
import { cn, formatChatTime } from '@/lib/utils';
import { WhatsAppStatusView } from './WhatsAppStatusView';
import { WhatsAppCallsView } from './WhatsAppCallsView';
import { WhatsAppSettingsView } from './WhatsAppSettingsView';

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
  onOpenInstallModal?: () => void;
  onStartCall?: (type: 'voice' | 'video', contactName: string) => void;
  onLogout?: () => void;
  currentUserName: string;
  currentUserEmail: string;
  isAdmin?: boolean;
}

export const Sidebar: React.FC<SidebarProps> = ({
  conversations,
  activeConversationId,
  onSelectConversation,
  onDeleteConversation,
  onNewChat,
  onOpenSettings,
  onOpenInstallModal,
  onStartCall,
  onLogout,
  currentUserName,
  currentUserEmail,
  isAdmin = false,
}) => {
  const [activeTab, setActiveTab] = useState<'chats' | 'status' | 'calls' | 'settings'>('chats');
  const [search, setSearch] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [filter, setFilter] = useState<'all' | 'unread' | 'direct' | 'groups'>('all');
  const [isTopMenuOpen, setIsTopMenuOpen] = useState(false);
  const topMenuRef = useRef<HTMLDivElement>(null);

  // Close 3-dots top menu on click outside
  useEffect(() => {
    const handleOutside = (e: MouseEvent | TouchEvent) => {
      if (topMenuRef.current && !topMenuRef.current.contains(e.target as Node)) {
        setIsTopMenuOpen(false);
      }
    };
    if (isTopMenuOpen) {
      document.addEventListener('mousedown', handleOutside);
      document.addEventListener('touchstart', handleOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('touchstart', handleOutside);
    };
  }, [isTopMenuOpen]);

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
    <div className="w-full md:w-80 lg:w-96 h-full bg-gcs-sidebar md:border-r border-gcs-border flex flex-col select-none relative overflow-hidden">
      {/* Top App Bar */}
      <div className="px-3 sm:px-4 py-2.5 sm:py-3 bg-[#111b21] border-b border-gcs-border/60 flex items-center justify-between shrink-0 safe-top z-20">
        {isSearchOpen ? (
          <div className="w-full flex items-center gap-2 animate-fade-in">
            <button
              type="button"
              onClick={() => {
                setIsSearchOpen(false);
                setSearch('');
              }}
              className="p-1.5 text-gcs-muted hover:text-white rounded-full hover:bg-gcs-card transition-colors active:scale-90"
              title="Close search"
            >
              <ArrowLeft className="w-5 h-5 text-gcs-emerald" />
            </button>
            <div className="flex-1 relative flex items-center">
              <input
                autoFocus
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search chats, contacts, or messages..."
                className="w-full bg-[#202c33] text-white text-sm rounded-xl pl-3 pr-8 py-1.5 border-none outline-none placeholder:text-[#8696a0]"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="absolute right-2.5 p-1 text-[#8696a0] hover:text-white rounded-full transition-colors"
                  title="Clear"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2.5">
              <div className="h-8.5 w-8.5 rounded-xl bg-gcs-emerald/20 border border-gcs-emerald/40 flex items-center justify-center text-gcs-emerald font-bold text-sm shadow-emerald-sm shrink-0">
                <Shield className="w-4.5 h-4.5 text-gcs-emerald" />
              </div>
              <div className="min-w-0">
                <h1 className="text-base font-bold tracking-tight text-white flex items-center gap-1.5">
                  <span>GCS CONNECT</span>
                  <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 bg-gcs-emerald/20 text-gcs-mint rounded border border-gcs-emerald/30 uppercase tracking-wider">
                    E2EE
                  </span>
                </h1>
              </div>
            </div>

            {/* Header Action Icons */}
            <div className="flex items-center gap-0.5 relative" ref={topMenuRef}>
              {/* Quick Search Toggle on Mobile */}
              <button
                type="button"
                onClick={() => setIsSearchOpen(true)}
                className="p-2 text-gcs-muted hover:text-white rounded-full hover:bg-gcs-card transition-colors active:scale-90"
                title="Search"
              >
                <Search className="w-4.5 h-4.5" />
              </button>

              {/* Install App on Device shortcut */}
              {onOpenInstallModal && (
                <button
                  type="button"
                  onClick={onOpenInstallModal}
                  className="p-2 text-gcs-emerald hover:text-gcs-mint rounded-full hover:bg-gcs-card transition-colors active:scale-90"
                  title="Install App on Device"
                >
                  <Smartphone className="w-4.5 h-4.5" />
                </button>
              )}

              {/* 3-Dots Menu Dropdown */}
              <button
                type="button"
                onClick={() => setIsTopMenuOpen(!isTopMenuOpen)}
                className="p-2 text-gcs-muted hover:text-white rounded-full hover:bg-gcs-card transition-colors active:scale-90"
                title="Menu"
              >
                <MoreVertical className="w-4.5 h-4.5" />
              </button>

          {isTopMenuOpen && (
            <div className="absolute right-0 top-full mt-1.5 w-52 bg-[#233138] border border-gcs-border rounded-2xl shadow-2xl py-1.5 z-50 text-xs backdrop-blur-xl animate-fade-in divide-y divide-gcs-border/30">
              <div className="py-1">
                <button
                  type="button"
                  onClick={() => {
                    setIsTopMenuOpen(false);
                    onNewChat?.();
                  }}
                  className="w-full px-3.5 py-2.5 text-left text-white hover:bg-[#182229] flex items-center gap-2.5 transition-colors"
                >
                  <MessageSquarePlus className="w-4 h-4 text-gcs-emerald" />
                  <span>New Chat</span>
                </button>

                {onOpenInstallModal && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsTopMenuOpen(false);
                      onOpenInstallModal();
                    }}
                    className="w-full px-3.5 py-2.5 text-left text-gcs-mint hover:bg-[#182229] flex items-center gap-2.5 transition-colors font-medium"
                  >
                    <Smartphone className="w-4 h-4 text-gcs-emerald" />
                    <span>Install App on Device</span>
                  </button>
                )}
              </div>

              {isAdmin && (
                <div className="py-1">
                  <a
                    href="/admin"
                    className="w-full px-3.5 py-2.5 text-left text-white hover:bg-[#182229] flex items-center gap-2.5 transition-colors"
                  >
                    <Shield className="w-4 h-4 text-gcs-emerald" />
                    <span>Admin Console</span>
                  </a>
                </div>
              )}

              <div className="py-1">
                <button
                  type="button"
                  onClick={() => {
                    setIsTopMenuOpen(false);
                    setActiveTab('settings');
                  }}
                  className="w-full px-3.5 py-2.5 text-left text-white hover:bg-[#182229] flex items-center gap-2.5 transition-colors"
                >
                  <Settings className="w-4 h-4 text-gcs-muted" />
                  <span>Settings</span>
                </button>

                {onLogout && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsTopMenuOpen(false);
                      onLogout();
                    }}
                    className="w-full px-3.5 py-2.5 text-left text-red-400 hover:bg-red-500/10 flex items-center gap-2.5 transition-colors"
                  >
                    <LogOut className="w-4 h-4 text-red-400" />
                    <span>Sign Out</span>
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
        </>
      )}
      </div>

      {/* Desktop Navigation Top Tabs (Chats, Status, Calls, Settings) */}
      <div className="hidden md:flex border-b border-gcs-border/60 bg-[#111b21] px-2 py-1.5 gap-1 shrink-0">
        <button
          type="button"
          onClick={() => setActiveTab('chats')}
          className={cn(
            'flex-1 py-1.5 text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition-colors',
            activeTab === 'chats'
              ? 'bg-gcs-emerald/20 text-gcs-mint border border-gcs-emerald/30'
              : 'text-gcs-muted hover:text-white hover:bg-gcs-card/50'
          )}
        >
          <MessageSquare className="w-3.5 h-3.5" />
          <span>Chats</span>
          {unreadTotal > 0 && (
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-gcs-emerald text-white font-bold leading-none">
              {unreadTotal}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('status')}
          className={cn(
            'flex-1 py-1.5 text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition-colors',
            activeTab === 'status'
              ? 'bg-gcs-emerald/20 text-gcs-mint border border-gcs-emerald/30'
              : 'text-gcs-muted hover:text-white hover:bg-gcs-card/50'
          )}
        >
          <CircleDashed className="w-3.5 h-3.5" />
          <span>Status</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('calls')}
          className={cn(
            'flex-1 py-1.5 text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition-colors',
            activeTab === 'calls'
              ? 'bg-gcs-emerald/20 text-gcs-mint border border-gcs-emerald/30'
              : 'text-gcs-muted hover:text-white hover:bg-gcs-card/50'
          )}
        >
          <Phone className="w-3.5 h-3.5" />
          <span>Calls</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('settings')}
          className={cn(
            'flex-1 py-1.5 text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition-colors',
            activeTab === 'settings'
              ? 'bg-gcs-emerald/20 text-gcs-mint border border-gcs-emerald/30'
              : 'text-gcs-muted hover:text-white hover:bg-gcs-card/50'
          )}
        >
          <Settings className="w-3.5 h-3.5" />
          <span>Settings</span>
        </button>
      </div>

      {/* ===================================================================== */}
      {/* TAB 1: CHATS VIEW */}
      {/* ===================================================================== */}
      {activeTab === 'chats' && (
        <div className="flex-1 flex flex-col min-h-0 relative">
          {/* Search & Filter Bar */}
          <div className="p-2 sm:p-2.5 bg-[#111b21] border-b border-gcs-border/40 flex flex-col gap-2 shrink-0">
            <div className="relative flex items-center">
              <Search className="w-4 h-4 text-[#8696a0] absolute left-3 pointer-events-none" />
              <input
                type="text"
                placeholder="Search or start new chat"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full h-9 bg-[#202c33] text-sm text-white rounded-xl pl-9 pr-8 py-1.5 border-none outline-none placeholder:text-[#8696a0] placeholder:text-xs focus:ring-1 focus:ring-gcs-emerald transition-all"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="absolute right-2.5 p-1 text-[#8696a0] hover:text-white rounded-full transition-colors"
                  title="Clear search"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Filter Pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 no-scrollbar scroll-touch">
              {(['all', 'unread', 'direct', 'groups'] as const).map((tab) => {
                const count = tab === 'unread' ? unreadTotal : undefined;
                return (
                  <button
                    key={tab}
                    onClick={() => setFilter(tab)}
                    className={cn(
                      'text-xs px-3 py-1 rounded-full font-medium capitalize transition-colors flex items-center gap-1 shrink-0 active:scale-95',
                      filter === tab
                        ? 'bg-[#00a884] text-white font-semibold'
                        : 'bg-[#202c33] text-gcs-muted hover:text-white'
                    )}
                  >
                    <span>{tab}</span>
                    {count !== undefined && count > 0 && (
                      <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-white text-[#00a884] font-bold leading-none">
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* WhatsApp Authentic Conversation List */}
          <div className="flex-1 overflow-y-auto divide-y divide-gcs-border/10 pb-20 md:pb-4 scroll-touch">
            {filtered.length === 0 ? (
              <div className="p-8 text-center text-xs text-gcs-muted flex flex-col items-center gap-3 justify-center h-full">
                <Lock className="w-8 h-8 text-gcs-border" />
                <div className="space-y-1">
                  <span className="block font-medium text-gcs-text">No chats found</span>
                  <span className="block text-[11px] text-gcs-muted">
                    {conversations.length === 0
                      ? 'No conversations yet. Tap the button below to start chatting.'
                      : 'No conversations match the current filter.'}
                  </span>
                </div>
                {conversations.length === 0 && onNewChat && (
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={onNewChat}
                    className="mt-2 text-xs h-9 px-4 bg-[#00a884] hover:bg-[#008f6f] text-white rounded-xl shadow-lg"
                  >
                    <MessageSquarePlus className="w-4 h-4 mr-1.5" />
                    <span>New Encrypted Chat</span>
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
                      'flex items-center gap-3 p-3.5 cursor-pointer transition-colors text-left relative group active:bg-[#202c33]',
                      isActive
                        ? 'bg-[#2a3942] border-l-4 border-[#00a884]'
                        : 'hover:bg-[#202c33]/60'
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
                            'text-[14.5px] font-semibold truncate',
                            isActive ? 'text-gcs-mint' : 'text-white'
                          )}
                        >
                          {item.name}
                        </span>
                        <span className="text-[11px] text-gcs-muted shrink-0 ml-2 font-mono">
                          {formatChatTime(item.lastMessageTime)}
                        </span>
                      </div>

                      <div className="flex items-center justify-between gap-1">
                        <div className="flex items-center gap-1 text-xs text-gcs-muted truncate">
                          {item.lastMessageStatus === 'read' && (
                            <CheckCheck className="w-3.5 h-3.5 text-[#53bdeb] shrink-0" />
                          )}
                          {item.lastMessageStatus === 'delivered' && (
                            <CheckCheck className="w-3.5 h-3.5 text-gcs-muted shrink-0" />
                          )}
                          {item.lastMessageStatus === 'sent' && (
                            <Check className="w-3.5 h-3.5 text-gcs-muted shrink-0" />
                          )}
                          <span className="truncate">{item.lastMessage || 'End-to-end encrypted'}</span>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0 ml-2">
                          {item.isMuted && (
                            <VolumeX className="w-3.5 h-3.5 text-gcs-muted" />
                          )}
                          {item.isPinned && (
                            <Pin className="w-3.5 h-3.5 text-[#00a884]" />
                          )}
                          {(item.unreadCount || 0) > 0 && (
                            <span className="h-5 min-w-[20px] px-1.5 rounded-full bg-[#00a884] text-white text-[10.5px] font-bold flex items-center justify-center">
                              {item.unreadCount}
                            </span>
                          )}
                          {onDeleteConversation && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onDeleteConversation(item.id, e);
                              }}
                              className="opacity-40 sm:opacity-0 sm:group-hover:opacity-100 p-1.5 rounded-lg hover:bg-red-500/20 text-gcs-muted hover:text-red-400 active:scale-90 transition-all"
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

          {/* WhatsApp Floating Action Button (FAB) for New Chat */}
          {onNewChat && (
            <button
              type="button"
              onClick={onNewChat}
              className="absolute right-4 bottom-20 md:bottom-6 w-13 h-13 rounded-2xl bg-[#00a884] hover:bg-[#008f6f] text-white flex items-center justify-center shadow-2xl shadow-[#00a884]/40 active:scale-95 transition-all z-20 group"
              title="Start New Chat"
            >
              <MessageSquarePlus className="w-6 h-6 group-hover:rotate-6 transition-transform" />
            </button>
          )}
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 2: STATUS VIEW */}
      {/* ===================================================================== */}
      {activeTab === 'status' && (
        <WhatsAppStatusView
          currentUserName={currentUserName}
          currentUserEmail={currentUserEmail}
        />
      )}

      {/* ===================================================================== */}
      {/* TAB 3: CALLS VIEW */}
      {/* ===================================================================== */}
      {activeTab === 'calls' && (
        <WhatsAppCallsView
          onStartCall={(type, contactName) => onStartCall?.(type, contactName)}
          onNewCall={() => onNewChat?.()}
        />
      )}

      {/* ===================================================================== */}
      {/* TAB 4: SETTINGS VIEW */}
      {/* ===================================================================== */}
      {activeTab === 'settings' && (
        <WhatsAppSettingsView
          currentUserName={currentUserName}
          currentUserEmail={currentUserEmail}
          onLogout={() => onLogout?.()}
          onOpenInstallModal={() => onOpenInstallModal?.()}
          isAdmin={isAdmin}
        />
      )}

      {/* ===================================================================== */}
      {/* MOBILE BOTTOM NAVIGATION BAR (WhatsApp Style) */}
      {/* ===================================================================== */}
      <div className="flex md:hidden fixed bottom-0 left-0 right-0 h-16 bg-[#111b21] border-t border-gcs-border/60 z-30 px-3 items-center justify-around safe-bottom">
        <button
          type="button"
          onClick={() => setActiveTab('chats')}
          className={cn(
            'flex flex-col items-center justify-center gap-1 py-1 px-3 rounded-xl transition-all relative',
            activeTab === 'chats' ? 'text-[#00a884]' : 'text-gcs-muted hover:text-white'
          )}
        >
          <div className="relative">
            <MessageSquare className="w-5 h-5" />
            {unreadTotal > 0 && (
              <span className="absolute -top-1 -right-2.5 h-4 min-w-[16px] px-1 rounded-full bg-[#00a884] text-white text-[9px] font-bold flex items-center justify-center">
                {unreadTotal}
              </span>
            )}
          </div>
          <span className="text-[10px] font-semibold tracking-tight">Chats</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('status')}
          className={cn(
            'flex flex-col items-center justify-center gap-1 py-1 px-3 rounded-xl transition-all',
            activeTab === 'status' ? 'text-[#00a884]' : 'text-gcs-muted hover:text-white'
          )}
        >
          <CircleDashed className="w-5 h-5" />
          <span className="text-[10px] font-semibold tracking-tight">Updates</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('calls')}
          className={cn(
            'flex flex-col items-center justify-center gap-1 py-1 px-3 rounded-xl transition-all',
            activeTab === 'calls' ? 'text-[#00a884]' : 'text-gcs-muted hover:text-white'
          )}
        >
          <Phone className="w-5 h-5" />
          <span className="text-[10px] font-semibold tracking-tight">Calls</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('settings')}
          className={cn(
            'flex flex-col items-center justify-center gap-1 py-1 px-3 rounded-xl transition-all',
            activeTab === 'settings' ? 'text-[#00a884]' : 'text-gcs-muted hover:text-white'
          )}
        >
          <Settings className="w-5 h-5" />
          <span className="text-[10px] font-semibold tracking-tight">Settings</span>
        </button>
      </div>
    </div>
  );
};
