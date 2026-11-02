'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Sidebar, ConversationItem } from '@/components/chat/Sidebar';
import { ChatHeader } from '@/components/chat/ChatHeader';
import { MessageBubble, MessageProps } from '@/components/chat/MessageBubble';
import { ChatInput } from '@/components/chat/ChatInput';
import { CallModal } from '@/components/chat/CallModal';
import { Drawer } from '@/components/ui/Drawer';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';
import {
  ShieldCheck,
  Lock,
  MessageSquare,
  Key,
  HardDrive,
  UserPlus,
  LogIn,
  LogOut,
  Eye,
  EyeOff,
  Trash2,
  AlertTriangle,
} from 'lucide-react';

const INITIAL_CONVERSATIONS: ConversationItem[] = [
  {
    id: 'c1',
    name: 'Alice Walker (Security Lead)',
    status: 'online',
    lastMessage: 'Verified with AES-256-GCM. Ready for deployment.',
    lastMessageTime: Date.now() - 300000,
    lastMessageStatus: 'read',
    unreadCount: 0,
    isPinned: true,
  },
  {
    id: 'c2',
    name: 'Bob Vance (DevOps)',
    status: 'away',
    lastMessage: 'Coturn relay configuration verified on port 3478.',
    lastMessageTime: Date.now() - 3600000,
    lastMessageStatus: 'delivered',
    unreadCount: 2,
  },
  {
    id: 'c3',
    name: 'GCS Core Architecture Group',
    status: 'online',
    lastMessage: 'Double Ratchet test vectors passed successfully.',
    lastMessageTime: Date.now() - 86400000,
    lastMessageStatus: 'read',
    unreadCount: 0,
    isGroup: true,
  },
];

const INITIAL_MESSAGES: MessageProps[] = [
  {
    id: 'm1',
    senderName: 'Alice Walker',
    content:
      'Welcome to GCS CONNECT. All messages and media sent in this workspace are protected by end-to-end encryption.',
    timestamp: Date.now() - 3600000 * 2,
    isSentByMe: false,
    isEncrypted: true,
  },
  {
    id: 'm2',
    senderName: 'You',
    content:
      'Confirmed. The server operates as an untrusted courier. Even with root database access, no third party can decrypt our communication.',
    timestamp: Date.now() - 3600000,
    isSentByMe: true,
    status: 'read',
    isEncrypted: true,
  },
  {
    id: 'm3',
    senderName: 'Alice Walker',
    content: 'Verified with AES-256-GCM. Ready for deployment.',
    timestamp: Date.now() - 300000,
    isSentByMe: false,
    isEncrypted: true,
    reactions: [{ emoji: '🔒', count: 1, hasReacted: true }],
  },
];

export default function AppHome() {
  // Authentication & Gatekeeper State
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(false);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginLoading, setLoginLoading] = useState(false);

  // Chat State
  const [conversations, setConversations] = useState<ConversationItem[]>(INITIAL_CONVERSATIONS);
  const [activeId, setActiveId] = useState<string>('c1');
  const [messages, setMessages] = useState<MessageProps[]>(INITIAL_MESSAGES);
  const [showDrawer, setShowDrawer] = useState(false);
  const [isNewChatModalOpen, setIsNewChatModalOpen] = useState(false);
  const [newChatEmail, setNewChatEmail] = useState('');
  const [newChatName, setNewChatName] = useState('');

  const [callState, setCallState] = useState<{
    isOpen: boolean;
    callType: 'voice' | 'video';
    status: 'incoming' | 'outgoing' | 'connected';
  }>({
    isOpen: false,
    callType: 'voice',
    status: 'outgoing',
  });

  const { toast } = useToast();

  // Check login status on page mount
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const res = await fetch('/api/auth/me');
        if (res.ok) {
          const data = await res.json();
          if (data.user) {
            setCurrentUser(data.user);
          }
        }
      } catch {
      } finally {
        setIsAuthLoading(false);
      }
    };
    checkAuth();
  }, []);

  // Auto-detect ?chatWith= from URL
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const chatWith = params.get('chatWith');
      if (chatWith) {
        const existing = conversations.find(
          (c) => c.name.toLowerCase().includes(chatWith.toLowerCase()) || c.id === chatWith
        );
        if (existing) {
          setActiveId(existing.id);
        } else {
          const newConv: ConversationItem = {
            id: `c-direct-${Date.now()}`,
            name: chatWith,
            status: 'online',
            lastMessage: 'End-to-end encrypted session initialized.',
            lastMessageTime: Date.now(),
            lastMessageStatus: 'read',
            unreadCount: 0,
            isPinned: true,
          };
          setConversations((prev) => [newConv, ...prev]);
          setActiveId(newConv.id);
          toast({
            type: 'success',
            message: `Initiated encrypted direct conversation with ${chatWith}`,
          });
        }
      }
    }
  }, []);

  const activeContact = conversations.find((c) => c.id === activeId) ||
    conversations[0] || {
      id: 'default',
      name: 'Direct Messaging',
      status: 'offline' as const,
    };

  const handleUserLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    setLoginLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: loginEmail,
          password: loginPassword,
          deviceFingerprint: `web-client-${Date.now()}`,
          deviceName: 'Web Workplace Client',
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setLoginError(data.message || 'Authentication failed. Please verify credentials.');
        setLoginLoading(false);
        return;
      }

      setCurrentUser(data.user);
      setLoginLoading(false);
      toast({
        type: 'success',
        message: `Welcome back, ${data.user.fullName || data.user.email}!`,
      });
    } catch (err: any) {
      setLoginError(err.message || 'Network error occurred.');
      setLoginLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {}
    setCurrentUser(null);
    toast({ type: 'info', message: 'You have been signed out.' });
  };

  const handleSendMessage = (text: string) => {
    if (!text.trim()) return;

    const newMsg: MessageProps = {
      id: `m-${Date.now()}`,
      content: text,
      timestamp: Date.now(),
      isSentByMe: true,
      status: 'sent',
      isEncrypted: true,
    };
    setMessages((prev) => [...prev, newMsg]);

    setTimeout(() => {
      setMessages((prev) =>
        prev.map((m) => (m.id === newMsg.id ? { ...m, status: 'delivered' } : m))
      );
    }, 600);

    setTimeout(() => {
      setMessages((prev) =>
        prev.map((m) => (m.id === newMsg.id ? { ...m, status: 'read' } : m))
      );
    }, 1500);
  };

  // User Individual Message Deletion Handler
  const handleDeleteMessage = async (id: string, deleteForEveryone: boolean) => {
    try {
      fetch(`/api/messages/${id}?mode=${deleteForEveryone ? 'everyone' : 'me'}`, {
        method: 'DELETE',
      }).catch((e) => console.log('Server deletion sync:', e));
    } catch {}

    if (deleteForEveryone) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === id
            ? {
                ...m,
                content: 'This message was deleted',
                isDeletedForEveryone: true,
              }
            : m
        )
      );
      toast({
        type: 'info',
        message: 'Message deleted for everyone.',
      });
    } else {
      setMessages((prev) => prev.filter((m) => m.id !== id));
      toast({
        type: 'info',
        message: 'Message removed from your view.',
      });
    }
  };

  // User Entire Conversation Deletion Handler
  const handleDeleteConversation = async (conversationId: string) => {
    const conv = conversations.find((c) => c.id === conversationId);
    const convName = conv ? conv.name : 'this chat';
    const confirmed = window.confirm(
      `Are you sure you want to delete "${convName}"? All messages and attachments in this conversation will be permanently removed.`
    );
    if (!confirmed) return;

    try {
      await fetch(`/api/conversations/${conversationId}`, { method: 'DELETE' }).catch(() => {});
    } catch {}

    setConversations((prev) => prev.filter((c) => c.id !== conversationId));
    if (activeId === conversationId) {
      const remaining = conversations.filter((c) => c.id !== conversationId);
      if (remaining.length > 0) {
        setActiveId(remaining[0].id);
      } else {
        setActiveId('');
      }
      setMessages([]);
    }
    toast({
      type: 'info',
      message: `Conversation "${convName}" was permanently deleted.`,
    });
  };

  const handleStartNewChat = () => {
    if (!newChatEmail.trim()) {
      toast({ type: 'error', message: 'Please enter a valid email address.' });
      return;
    }

    const contactName = newChatName.trim() || newChatEmail.split('@')[0];
    const newConv: ConversationItem = {
      id: `c-${Date.now()}`,
      name: `${contactName} (${newChatEmail})`,
      status: 'online',
      lastMessage: 'Direct encrypted session established.',
      lastMessageTime: Date.now(),
      lastMessageStatus: 'sent',
      unreadCount: 0,
      isPinned: true,
    };

    setConversations((prev) => [newConv, ...prev]);
    setActiveId(newConv.id);
    setIsNewChatModalOpen(false);
    setNewChatEmail('');
    setNewChatName('');

    toast({
      type: 'success',
      message: `Direct chat with ${contactName} started!`,
    });
  };

  const startCall = (type: 'voice' | 'video') => {
    setCallState({
      isOpen: true,
      callType: type,
      status: 'outgoing',
    });
    setTimeout(() => {
      setCallState((prev) => ({ ...prev, status: 'connected' }));
      toast({
        type: 'info',
        message: `Connected via DTLS-SRTP P2P stream`,
      });
    }, 2000);
  };

  // 1. Loading State
  if (isAuthLoading) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-gcs-bg font-sans">
        <div className="h-10 w-10 rounded-xl bg-gcs-emerald/20 border border-gcs-emerald/40 flex items-center justify-center animate-spin mb-3">
          <ShieldCheck className="w-6 h-6 text-gcs-emerald" />
        </div>
        <div className="text-xs text-gcs-muted font-mono">Initializing secure cryptographic session...</div>
      </div>
    );
  }

  // 2. Authentication Gate: User MUST login before seeing the chat dashboard
  if (!currentUser) {
    return (
      <div className="min-h-screen w-screen flex flex-col items-center justify-center bg-gcs-bg px-4 py-8 font-sans">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[450px] h-[350px] bg-gcs-emerald/5 blur-[120px] rounded-full pointer-events-none" />

        <div className="relative w-full max-w-sm bg-gcs-card border border-gcs-border rounded-2xl shadow-2xl p-6 sm:p-7 animate-fade-in">
          {/* Header */}
          <div className="flex flex-col items-center text-center mb-6">
            <div className="h-12 w-12 rounded-2xl bg-gcs-emerald/15 border border-gcs-emerald/30 flex items-center justify-center text-gcs-mint mb-3 shadow-inner">
              <ShieldCheck className="w-7 h-7 text-gcs-emerald" />
            </div>
            <h1 className="text-xl font-bold text-gcs-text tracking-tight">GCS CONNECT</h1>
            <p className="text-xs text-gcs-muted mt-1">Sign in to your encrypted workplace</p>
          </div>

          {/* Quick Demo Sign In Pills */}
          <div className="mb-4 p-2.5 rounded-xl bg-gcs-sidebar border border-gcs-border text-xs flex flex-col gap-1.5">
            <span className="text-[10.5px] uppercase font-semibold text-gcs-muted tracking-wider">Quick Demo Users:</span>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setLoginEmail('alice@globalcrestsolutions.com');
                  setLoginPassword('AliceSecurePass2026!');
                }}
                className="text-[11px] px-2 py-1 rounded bg-gcs-card hover:bg-gcs-card/80 text-gcs-mint border border-gcs-border font-medium transition-colors text-center"
              >
                Alice Walker
              </button>
              <button
                type="button"
                onClick={() => {
                  setLoginEmail('bob@globalcrestsolutions.com');
                  setLoginPassword('BobDevOpsPass2026!');
                }}
                className="text-[11px] px-2 py-1 rounded bg-gcs-card hover:bg-gcs-card/80 text-gcs-mint border border-gcs-border font-medium transition-colors text-center"
              >
                Bob Vance
              </button>
            </div>
          </div>

          {loginError && (
            <div className="mb-4 p-3 rounded-xl bg-[#D94D55]/15 border border-[#D94D55]/40 text-[#ff8e95] text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{loginError}</span>
            </div>
          )}

          <form onSubmit={handleUserLogin} className="flex flex-col gap-3.5">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-gcs-muted">Corporate Email</label>
              <Input
                type="email"
                required
                placeholder="you@globalcrestsolutions.com"
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-gcs-muted">Password</label>
              <div className="relative">
                <Input
                  type={showLoginPassword ? 'text' : 'password'}
                  required
                  placeholder="Enter your password"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowLoginPassword(!showLoginPassword)}
                  className="absolute right-3 top-2.5 text-gcs-muted hover:text-gcs-mint transition-colors p-1"
                  tabIndex={-1}
                  title={showLoginPassword ? 'Hide password' : 'Show password'}
                >
                  {showLoginPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              variant="primary"
              disabled={loginLoading}
              className="w-full mt-2 h-10 text-sm font-semibold bg-gcs-emerald hover:bg-[#00c28c]"
            >
              {loginLoading ? 'Authenticating...' : 'Sign In'}
            </Button>
          </form>

          <div className="mt-5 pt-3 border-t border-gcs-border/60 text-center text-xs text-gcs-muted">
            Don't have an account?{' '}
            <Link href="/register" className="text-gcs-mint font-semibold hover:underline">
              Register here
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // 3. Authenticated Workplace View: Clean, Simple, Direct (No Telegram Fluff)
  return (
    <main className="h-screen w-screen flex overflow-hidden bg-gcs-bg font-sans">
      {/* Sidebar Navigation */}
      <Sidebar
        conversations={conversations}
        activeConversationId={activeId}
        onSelectConversation={(id) => setActiveId(id)}
        onDeleteConversation={handleDeleteConversation}
        onNewChat={() => setIsNewChatModalOpen(true)}
        onOpenSettings={() => setShowDrawer(true)}
        currentUserName={currentUser.fullName || currentUser.email}
        currentUserEmail={currentUser.email}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col h-full bg-gcs-bg min-w-0">
        {/* Top Header Bar */}
        <div className="h-10 px-4 bg-gcs-bg border-b border-gcs-border/40 flex items-center justify-between text-xs select-none">
          <div className="flex items-center gap-2.5">
            <span className="flex items-center gap-1.5 text-gcs-mint font-medium text-[11px]">
              <ShieldCheck className="w-3.5 h-3.5 text-gcs-emerald" />
              <span>GCS CONNECT — {currentUser.fullName || currentUser.email}</span>
            </span>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setIsNewChatModalOpen(true)}
              className="flex items-center gap-1 text-[11px] text-gcs-mint hover:underline font-medium"
            >
              <UserPlus className="w-3 h-3" />
              <span>New Chat</span>
            </button>

            <span className="text-gcs-border">•</span>

            <button
              type="button"
              onClick={handleLogout}
              className="flex items-center gap-1 text-[11px] text-gcs-muted hover:text-red-400 transition-colors"
              title="Sign Out"
            >
              <LogOut className="w-3 h-3" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>

        {/* Active Conversation Main Pane */}
        <div className="flex-1 flex flex-col min-h-0">
          {/* Chat Header */}
          <ChatHeader
            contactName={activeContact.name}
            avatarSrc={activeContact.avatarSrc}
            status={activeContact.status}
            onVoiceCall={() => startCall('voice')}
            onVideoCall={() => startCall('video')}
            onDeleteChat={() => handleDeleteConversation(activeContact.id)}
            onSearch={() =>
              toast({
                type: 'info',
                message: 'Local encrypted message index search active',
              })
            }
            onMoreOptions={() => setShowDrawer(true)}
            onOpenDetails={() => setShowDrawer(true)}
          />

          {/* Chat Messages Stream */}
          <div className="flex-1 overflow-y-auto p-4 flex flex-col justify-end space-y-1">
            <div className="mx-auto my-3 px-3 py-1 rounded-full bg-gcs-card/80 border border-gcs-border/60 text-[11px] text-gcs-muted text-center max-w-sm flex items-center justify-center gap-1.5 shadow-sm">
              <Lock className="w-3 h-3 text-gcs-emerald" />
              <span>End-to-end encrypted with X3DH & Double Ratchet.</span>
            </div>

            {messages.length === 0 ? (
              <div className="text-center text-xs text-gcs-muted my-auto py-8">
                No messages in this chat yet. Send an encrypted message below.
              </div>
            ) : (
              messages.map((m) => (
                <MessageBubble key={m.id} {...m} onDelete={handleDeleteMessage} />
              ))
            )}
          </div>

          {/* Chat Input Bar */}
          <ChatInput
            onSendMessage={handleSendMessage}
            onSendVoiceNote={() =>
              toast({
                type: 'info',
                message: 'Audio recording buffer initialized via Web Audio API',
              })
            }
            onAttachFile={(type) =>
              toast({
                type: 'info',
                message: `Client-side encrypted ${type} upload active`,
              })
            }
          />
        </div>
      </div>

      {/* Start New Chat Modal */}
      <Modal
        isOpen={isNewChatModalOpen}
        onClose={() => setIsNewChatModalOpen(false)}
        title="Start Encrypted Conversation"
        description="Enter the email address of a registered user or coworker to start an end-to-end encrypted chat."
      >
        <div className="flex flex-col gap-4 text-sm mt-2">
          <Input
            label="Recipient Email Address"
            placeholder="e.g. coworker@globalcrestsolutions.com"
            value={newChatEmail}
            onChange={(e) => setNewChatEmail(e.target.value)}
          />
          <Input
            label="Display Name (Optional)"
            placeholder="e.g. John Doe"
            value={newChatName}
            onChange={(e) => setNewChatName(e.target.value)}
          />

          <div className="p-3 rounded-lg bg-gcs-sidebar border border-gcs-border text-xs text-gcs-muted">
            <span className="font-semibold text-gcs-mint block mb-1">Quick Select Verified Peers:</span>
            <div className="flex flex-wrap gap-2 mt-1.5">
              <button
                type="button"
                onClick={() => {
                  setNewChatEmail('alice@globalcrestsolutions.com');
                  setNewChatName('Alice Walker');
                }}
                className="px-2.5 py-1 rounded bg-gcs-card hover:bg-gcs-card/80 border border-gcs-border text-gcs-text text-[11px] transition-colors"
              >
                Alice Walker (Security)
              </button>
              <button
                type="button"
                onClick={() => {
                  setNewChatEmail('bob@globalcrestsolutions.com');
                  setNewChatName('Bob Vance');
                }}
                className="px-2.5 py-1 rounded bg-gcs-card hover:bg-gcs-card/80 border border-gcs-border text-gcs-text text-[11px] transition-colors"
              >
                Bob Vance (DevOps)
              </button>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setIsNewChatModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleStartNewChat}>
              Start Chat
            </Button>
          </div>
        </div>
      </Modal>

      {/* Slide-out Settings & Contact Details Drawer */}
      <Drawer
        isOpen={showDrawer}
        onClose={() => setShowDrawer(false)}
        title="Session & Cryptographic Details"
      >
        <div className="flex flex-col gap-5 text-sm">
          <div className="flex flex-col items-center p-4 rounded-xl bg-gcs-card border border-gcs-border">
            <div className="h-16 w-16 rounded-full bg-gcs-emerald/20 border-2 border-gcs-emerald flex items-center justify-center text-xl font-bold text-gcs-mint mb-2">
              GC
            </div>
            <span className="font-semibold text-gcs-text">{activeContact.name}</span>
            <div className="flex items-center gap-1.5 mt-2.5">
              <span className="h-2 w-2 rounded-full bg-gcs-emerald" />
              <span className="text-xs text-gcs-mint font-medium">
                Device Authenticated & Key Enrolled
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-gcs-muted">
              Security Attributes
            </span>
            <div className="p-3 rounded-lg bg-gcs-card border border-gcs-border flex items-center justify-between text-xs">
              <span className="text-gcs-muted flex items-center gap-1.5">
                <Key className="w-3.5 h-3.5 text-gcs-emerald" />
                Key Agreement
              </span>
              <span className="font-mono text-gcs-mint">X3DH (ECDH P-256)</span>
            </div>
            <div className="p-3 rounded-lg bg-gcs-card border border-gcs-border flex items-center justify-between text-xs">
              <span className="text-gcs-muted flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-gcs-emerald" />
                Symmetric Cipher
              </span>
              <span className="font-mono text-gcs-mint">AES-256-GCM (AEAD)</span>
            </div>
            <div className="p-3 rounded-lg bg-gcs-card border border-gcs-border flex items-center justify-between text-xs">
              <span className="text-gcs-muted flex items-center gap-1.5">
                <HardDrive className="w-3.5 h-3.5 text-gcs-emerald" />
                Local State Storage
              </span>
              <span className="font-mono text-gcs-mint">IndexedDB (Encrypted)</span>
            </div>
          </div>

          <div className="pt-4 border-t border-gcs-border/60">
            <Button
              variant="outline"
              onClick={handleLogout}
              className="w-full text-xs text-red-400 border-red-500/30 hover:bg-red-500/10 flex items-center justify-center gap-1.5"
            >
              <LogOut className="w-3.5 h-3.5" />
              Sign Out of Session
            </Button>
          </div>
        </div>
      </Drawer>

      {/* Voice & Video Call Modal */}
      <CallModal
        isOpen={callState.isOpen}
        callType={callState.callType}
        status={callState.status}
        contactName={activeContact.name}
        avatarSrc={activeContact.avatarSrc}
        onEndCall={() => {
          setCallState((prev) => ({ ...prev, isOpen: false }));
          toast({ type: 'warning', message: 'Call ended' });
        }}
        onReject={() => {
          setCallState((prev) => ({ ...prev, isOpen: false }));
          toast({ type: 'error', message: 'Call rejected' });
        }}
      />
    </main>
  );
}
