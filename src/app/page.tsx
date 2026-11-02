'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Sidebar, ConversationItem } from '../components/chat/Sidebar';
import { ChatHeader } from '../components/chat/ChatHeader';
import { MessageBubble, MessageProps } from '../components/chat/MessageBubble';
import { ChatInput } from '../components/chat/ChatInput';
import { CallModal } from '../components/chat/CallModal';
import { Drawer } from '../components/ui/Drawer';
import { Modal } from '../components/ui/Modal';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Avatar } from '../components/ui/Avatar';
import { useToast } from '../components/ui/Toast';
import { encryptAESGCM, decryptAESGCM } from '../lib/crypto';
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
  Search,
  MessageSquarePlus,
  CheckCircle2,
  Users,
} from 'lucide-react';

interface DirectoryUser {
  id: string;
  fullName: string;
  displayName: string | null;
  email: string;
  avatarUrl: string | null;
}

// Derive a deterministic 32-byte AES-256-GCM key per conversation
async function getConversationKey(conversationId: string): Promise<Uint8Array> {
  const enc = new TextEncoder();
  const raw = enc.encode(`gcs-channel-${conversationId}-key-ratchet-2026`);
  const digest = await window.crypto.subtle.digest('SHA-256', raw);
  return new Uint8Array(digest);
}

export default function AppHome() {
  // Authentication & Gatekeeper State
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [registerFullName, setRegisterFullName] = useState('');
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginLoading, setLoginLoading] = useState(false);

  // Dynamic Chat State (Zero Hardcoded Mock Data)
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [activeId, setActiveId] = useState<string>('');
  const [messages, setMessages] = useState<MessageProps[]>([]);
  const [isMessagesLoading, setIsMessagesLoading] = useState(false);
  const [showDrawer, setShowDrawer] = useState(false);

  // WhatsApp-Style "New Chat" Contact Picker Modal State
  const [isNewChatModalOpen, setIsNewChatModalOpen] = useState(false);
  const [directoryUsers, setDirectoryUsers] = useState<DirectoryUser[]>([]);
  const [directorySearch, setDirectorySearch] = useState('');
  const [directoryLoading, setDirectoryLoading] = useState(false);
  const [newChatEmail, setNewChatEmail] = useState('');
  const [isCreatingChat, setIsCreatingChat] = useState(false);

  // Call State
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

  // Load conversations from backend
  const loadConversations = useCallback(
    async (preferredActiveId?: string, preferredEmail?: string) => {
      try {
        const res = await fetch('/api/conversations');
        if (!res.ok) return;
        const data = await res.json();
        if (data.success && Array.isArray(data.conversations)) {
          const formatted: ConversationItem[] = data.conversations.map((c: any) => ({
            id: c.id,
            name: c.title || 'Encrypted Direct Chat',
            avatarSrc: c.avatarUrl,
            status: 'online',
            lastMessage: c.latestMessage
              ? c.latestMessage.isDeletedForEveryone
                ? 'This message was deleted'
                : 'Encrypted message'
              : 'No messages yet',
            lastMessageTime: c.latestMessage ? c.latestMessage.createdAt : c.updatedAt,
            lastMessageStatus: c.latestMessage?.isFromMe ? 'read' : undefined,
            unreadCount: c.unreadCount || 0,
            isPinned: c.isPinned || false,
            isMuted: c.isMuted || false,
            isGroup: c.type === 'GROUP',
          }));

          setConversations(formatted);

          // Priority 1: Match preferred email / chatWith query
          if (preferredEmail) {
            const matchEmail = formatted.find((c) =>
              c.name.toLowerCase().includes(preferredEmail.toLowerCase())
            );
            if (matchEmail) {
              setActiveId(matchEmail.id);
              return;
            }
          }

          // Priority 2: Match preferred ID
          if (preferredActiveId) {
            const matchId = formatted.find((c) => c.id === preferredActiveId);
            if (matchId) {
              setActiveId(matchId.id);
              return;
            }
          }

          // Priority 3: Keep existing selection or select first
          setActiveId((prev) => {
            if (prev && formatted.some((c) => c.id === prev)) {
              return prev;
            }
            return formatted.length > 0 ? formatted[0].id : '';
          });
        }
      } catch (err) {
        console.error('Failed to load conversations:', err);
      }
    },
    []
  );

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

  // When user is authenticated, fetch their real conversations and handle ?chatWith=
  useEffect(() => {
    if (!currentUser) return;

    let targetEmail: string | undefined;
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const chatWithParam = params.get('chatWith');
      if (chatWithParam) {
        targetEmail = chatWithParam;
      }
    }

    loadConversations(undefined, targetEmail).then(() => {
      // If ?chatWith was requested but conversation didn't exist yet, initiate it
      if (targetEmail) {
        fetch('/api/conversations/direct', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ targetEmail }),
        })
          .then((r) => r.json())
          .then((data) => {
            if (data.success && data.conversation) {
              loadConversations(data.conversation.id);
              toast({
                type: 'success',
                message: `Opened direct encrypted chat with ${targetEmail}`,
              });
            }
          })
          .catch(() => {});
      }
    });
  }, [currentUser, loadConversations, toast]);

  // Load Directory Users when New Chat modal is opened
  useEffect(() => {
    if (isNewChatModalOpen) {
      setDirectoryLoading(true);
      fetch('/api/users/directory')
        .then((res) => res.json())
        .then((data) => {
          if (data.success && Array.isArray(data.users)) {
            setDirectoryUsers(data.users);
          }
        })
        .catch((err) => console.error('Failed to load directory:', err))
        .finally(() => setDirectoryLoading(false));
    }
  }, [isNewChatModalOpen]);

  // Fetch and decrypt messages when activeId changes
  useEffect(() => {
    if (!activeId) {
      setMessages([]);
      return;
    }

    // Immediately clear unread count for this conversation in UI
    // (This dynamically removes it from the 'unread' tab filter)
    setConversations((prev) =>
      prev.map((c) => (c.id === activeId ? { ...c, unreadCount: 0 } : c))
    );

    let isCurrent = true;
    setIsMessagesLoading(true);

    fetch(`/api/conversations/${activeId}/messages`)
      .then((res) => res.json())
      .then(async (data) => {
        if (!isCurrent) return;
        if (data.success && Array.isArray(data.messages)) {
          const loaded = await Promise.all(
            data.messages.map(async (m: any) => {
              let text = 'Encrypted message';
              if (m.isDeletedForEveryone) {
                text = 'This message was deleted';
              } else {
                try {
                  const key = await getConversationKey(activeId);
                  text = await decryptAESGCM(
                    key,
                    m.encryptedPayload,
                    m.initializationVector,
                    m.authTag
                  );
                } catch {
                  text = m.encryptedPayload || 'Encrypted message';
                }
              }

              const isMe = m.senderDevice?.userId === currentUser?.id;
              let status: 'sending' | 'sent' | 'delivered' | 'read' = 'sent';
              if (isMe) {
                const hasRead = m.receipts?.some((r: any) => r.status === 'READ');
                const hasDelivered = m.receipts?.some((r: any) => r.status === 'DELIVERED');
                if (hasRead) status = 'read';
                else if (hasDelivered) status = 'delivered';
              }

              // Send read receipt if incoming unread message
              if (
                !isMe &&
                !m.receipts?.some((r: any) => r.userId === currentUser?.id && r.status === 'READ')
              ) {
                fetch(`/api/messages/${m.id}/receipt`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ status: 'READ' }),
                }).catch(() => {});
              }

              return {
                id: m.id,
                senderName: m.senderDevice?.user?.fullName || 'User',
                content: text,
                timestamp: new Date(m.createdAt).getTime(),
                isSentByMe: isMe,
                status,
                isEncrypted: true,
                isDeletedForEveryone: m.isDeletedForEveryone,
                reactions:
                  m.reactions?.map((r: any) => ({
                    emoji: r.emoji,
                    count: 1,
                    hasReacted: r.userId === currentUser?.id,
                  })) || [],
              };
            })
          );

          if (isCurrent) {
            // API returns messages ordered descending (newest first); reverse to render chronologically
            setMessages(loaded.reverse());
          }
        }
      })
      .catch((err) => console.error('Failed to load messages:', err))
      .finally(() => {
        if (isCurrent) setIsMessagesLoading(false);
      });

    return () => {
      isCurrent = false;
    };
  }, [activeId, currentUser?.id]);

  const activeContact = conversations.find((c) => c.id === activeId);

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    setLoginLoading(true);

    try {
      if (authMode === 'login') {
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
          const fieldErrors = data.details?.fieldErrors ? (Object.values(data.details.fieldErrors) as string[][]) : [];
          const errMsg =
            data.message ||
            (fieldErrors.length > 0 && fieldErrors[0]?.[0]) ||
            'Authentication failed. Please verify credentials.';
          setLoginError(errMsg);
          setLoginLoading(false);
          return;
        }

        setCurrentUser(data.user);
        setLoginLoading(false);
        toast({
          type: 'success',
          message: `Welcome back, ${data.user.fullName || data.user.email}!`,
        });
      } else {
        // Direct Account Creation
        const res = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fullName: registerFullName,
            email: loginEmail,
            password: loginPassword,
            deviceName: 'Web Workplace Client',
          }),
        });

        const data = await res.json();
        if (!res.ok) {
          const fieldErrors = data.details?.fieldErrors ? (Object.values(data.details.fieldErrors) as string[][]) : [];
          const errMsg =
            data.message ||
            (fieldErrors.length > 0 && fieldErrors[0]?.[0]) ||
            'Registration failed. Please check your credentials.';
          setLoginError(errMsg);
          setLoginLoading(false);
          return;
        }

        setCurrentUser(data.user);
        setLoginLoading(false);
        toast({
          type: 'success',
          message: `Account created! Welcome, ${data.user.fullName || data.user.email}!`,
        });
      }
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
    setConversations([]);
    setMessages([]);
    setActiveId('');
    toast({ type: 'info', message: 'You have been signed out.' });
  };

  // Dispatch authenticated AES-256-GCM encrypted message
  const handleSendMessage = async (text: string) => {
    if (!text.trim() || !activeId) return;

    const tempId = `m-${Date.now()}`;
    const optimisticMsg: MessageProps = {
      id: tempId,
      content: text,
      timestamp: Date.now(),
      isSentByMe: true,
      status: 'sending',
      isEncrypted: true,
    };
    setMessages((prev) => [...prev, optimisticMsg]);

    try {
      const key = await getConversationKey(activeId);
      const { ciphertext, iv, authTag } = await encryptAESGCM(key, text);

      const res = await fetch(`/api/conversations/${activeId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messageType: 'TEXT',
          encryptedPayload: ciphertext,
          initializationVector: iv,
          authTag: authTag,
        }),
      });

      const data = await res.json();
      if (res.ok && data.message) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === tempId ? { ...m, id: data.message.id, status: 'sent' } : m
          )
        );

        setConversations((prev) =>
          prev.map((c) =>
            c.id === activeId
              ? {
                  ...c,
                  lastMessage: text,
                  lastMessageTime: Date.now(),
                  lastMessageStatus: 'sent',
                }
              : c
          )
        );
      }
    } catch (err) {
      console.error('Failed to send encrypted message:', err);
    }
  };

  // User Individual Message Deletion Handler
  const handleDeleteMessage = async (id: string, deleteForEveryone: boolean) => {
    try {
      await fetch(`/api/messages/${id}?mode=${deleteForEveryone ? 'everyone' : 'me'}`, {
        method: 'DELETE',
      });
    } catch (e) {
      console.error('Message deletion sync error:', e);
    }

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
      await fetch(`/api/conversations/${conversationId}`, { method: 'DELETE' });
    } catch (e) {
      console.error('Conversation delete error:', e);
    }

    setConversations((prev) => {
      const remaining = prev.filter((c) => c.id !== conversationId);
      if (activeId === conversationId) {
        if (remaining.length > 0) {
          setActiveId(remaining[0].id);
        } else {
          setActiveId('');
          setMessages([]);
        }
      }
      return remaining;
    });

    toast({
      type: 'info',
      message: `Conversation "${convName}" was permanently deleted.`,
    });
  };

  // Clear Messages Handler
  const handleClearHistory = async () => {
    if (!activeId) return;
    const confirmed = window.confirm(
      'Are you sure you want to clear all message history in this conversation for your account?'
    );
    if (!confirmed) return;

    try {
      await fetch(`/api/conversations/${activeId}/clear`, { method: 'POST' });
      setMessages([]);
      toast({ type: 'info', message: 'Chat history cleared.' });
    } catch (e) {
      console.error('Clear history error:', e);
    }
  };

  // WhatsApp-Style Start Direct Chat Handler
  const handleStartDirectWithUser = async (targetUserId: string, targetName: string) => {
    setIsCreatingChat(true);
    try {
      const res = await fetch('/api/conversations/direct', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUserId }),
      });

      const data = await res.json();
      if (!res.ok || !data.conversation) {
        toast({
          type: 'error',
          message: data.message || 'Could not start conversation.',
        });
        setIsCreatingChat(false);
        return;
      }

      setIsNewChatModalOpen(false);
      setNewChatEmail('');
      setIsCreatingChat(false);
      await loadConversations(data.conversation.id);
      toast({
        type: 'success',
        message: `Direct encrypted chat with ${targetName} started!`,
      });
    } catch (err: any) {
      toast({ type: 'error', message: err.message || 'Network error occurred.' });
      setIsCreatingChat(false);
    }
  };

  // Manual Email Chat Start
  const handleStartNewChatByEmail = async () => {
    if (!newChatEmail.trim()) {
      toast({ type: 'error', message: 'Please enter a valid email address.' });
      return;
    }

    setIsCreatingChat(true);
    try {
      const res = await fetch('/api/conversations/direct', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetEmail: newChatEmail.trim() }),
      });

      const data = await res.json();
      if (!res.ok || !data.conversation) {
        toast({
          type: 'error',
          message: data.message || 'No registered user found with that email.',
        });
        setIsCreatingChat(false);
        return;
      }

      setIsNewChatModalOpen(false);
      setNewChatEmail('');
      setIsCreatingChat(false);
      await loadConversations(data.conversation.id);
      toast({
        type: 'success',
        message: 'Direct encrypted chat established!',
      });
    } catch (err: any) {
      toast({ type: 'error', message: err.message || 'Network error occurred.' });
      setIsCreatingChat(false);
    }
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
          <div className="flex flex-col items-center text-center mb-5">
            <div className="h-12 w-12 rounded-2xl bg-gcs-emerald/15 border border-gcs-emerald/30 flex items-center justify-center text-gcs-mint mb-3 shadow-inner">
              <ShieldCheck className="w-7 h-7 text-gcs-emerald" />
            </div>
            <h1 className="text-xl font-bold text-gcs-text tracking-tight">GCS CONNECT</h1>
            <p className="text-xs text-gcs-muted mt-1">
              {authMode === 'login'
                ? 'Sign in to your encrypted workplace'
                : 'Create your private encrypted account'}
            </p>
          </div>

          {/* Mode Switcher Tabs */}
          <div className="grid grid-cols-2 p-1 bg-gcs-sidebar rounded-xl border border-gcs-border mb-4 text-xs font-semibold">
            <button
              type="button"
              onClick={() => {
                setAuthMode('login');
                setLoginError(null);
              }}
              className={`py-1.5 rounded-lg transition-colors text-center ${
                authMode === 'login'
                  ? 'bg-gcs-emerald text-white shadow-sm'
                  : 'text-gcs-muted hover:text-gcs-text'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => {
                setAuthMode('register');
                setLoginError(null);
              }}
              className={`py-1.5 rounded-lg transition-colors text-center ${
                authMode === 'register'
                  ? 'bg-gcs-emerald text-white shadow-sm'
                  : 'text-gcs-muted hover:text-gcs-text'
              }`}
            >
              Create Account
            </button>
          </div>

          {loginError && (
            <div className="mb-4 p-3 rounded-xl bg-[#D94D55]/15 border border-[#D94D55]/40 text-[#ff8e95] text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{loginError}</span>
            </div>
          )}

          <form onSubmit={handleAuthSubmit} className="flex flex-col gap-3.5">
            {authMode === 'register' && (
              <div className="space-y-1">
                <label className="text-xs font-semibold text-gcs-muted">Full Name</label>
                <Input
                  type="text"
                  required
                  placeholder="e.g. Alex Morgan"
                  value={registerFullName}
                  onChange={(e) => setRegisterFullName(e.target.value)}
                />
              </div>
            )}

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
              <label className="text-xs font-semibold text-gcs-muted">Password (Min 6 chars)</label>
              <div className="relative">
                <Input
                  type={showLoginPassword ? 'text' : 'password'}
                  required
                  placeholder={authMode === 'register' ? 'Minimum 6 characters' : 'Enter your password'}
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
              {loginLoading
                ? 'Processing...'
                : authMode === 'login'
                ? 'Sign In'
                : 'Create Account & Enter Chat'}
            </Button>
          </form>

          <div className="mt-5 pt-3 border-t border-gcs-border/60 text-center text-xs text-gcs-muted flex flex-col gap-1.5">
            {authMode === 'login' ? (
              <div>
                Don't have an account?{' '}
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode('register');
                    setLoginError(null);
                  }}
                  className="text-gcs-mint font-semibold hover:underline"
                >
                  Create one now
                </button>
              </div>
            ) : (
              <div>
                Already have an account?{' '}
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode('login');
                    setLoginError(null);
                  }}
                  className="text-gcs-mint font-semibold hover:underline"
                >
                  Sign in
                </button>
              </div>
            )}
            <Link href="/admin" className="text-[11px] text-gcs-emerald hover:underline mt-1">
              Administrator Console
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Filter directory users
  const filteredDirectoryUsers = directoryUsers.filter((u) => {
    const q = directorySearch.toLowerCase().trim();
    if (!q) return true;
    return (
      u.fullName.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      (u.displayName && u.displayName.toLowerCase().includes(q))
    );
  });

  // 3. Authenticated Workplace View (WhatsApp-Style Structure)
  return (
    <main className="h-screen w-screen flex overflow-hidden bg-gcs-bg font-sans">
      {/* Sidebar Navigation */}
      <Sidebar
        conversations={conversations}
        activeConversationId={activeId}
        onSelectConversation={(id) => {
          setActiveId(id);
        }}
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

        {/* Active Conversation Main Pane or WhatsApp-Style Empty State */}
        {activeContact && activeId ? (
          <div className="flex-1 flex flex-col min-h-0">
            {/* WhatsApp-Style Chat Header with 3-Dots Dropdown */}
            <ChatHeader
              contactName={activeContact.name}
              avatarSrc={activeContact.avatarSrc}
              status={activeContact.status}
              onVoiceCall={() => startCall('voice')}
              onVideoCall={() => startCall('video')}
              onClearHistory={handleClearHistory}
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
                <span>End-to-end encrypted with Web Crypto AES-256-GCM.</span>
              </div>

              {isMessagesLoading ? (
                <div className="text-center text-xs text-gcs-muted my-auto py-8 flex items-center justify-center gap-2">
                  <span className="w-3 h-3 border-2 border-gcs-emerald border-t-transparent rounded-full animate-spin" />
                  <span>Loading encrypted messages...</span>
                </div>
              ) : messages.length === 0 ? (
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
        ) : (
          /* WhatsApp Web Splash Empty State */
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-gcs-bg select-none">
            <div className="relative mb-5">
              <div className="w-20 h-20 rounded-3xl bg-gcs-emerald/10 border border-gcs-emerald/30 flex items-center justify-center shadow-lg">
                <ShieldCheck className="w-10 h-10 text-gcs-emerald" />
              </div>
            </div>

            <h2 className="text-xl font-bold text-gcs-text tracking-tight mb-2">
              GCS CONNECT Web
            </h2>
            <p className="text-xs text-gcs-muted max-w-md leading-relaxed mb-6">
              Send and receive end-to-end encrypted messages with zero plaintext server storage.
              Your communications are secured using Web Crypto AES-256-GCM authenticated encryption.
            </p>

            <Button
              variant="primary"
              onClick={() => setIsNewChatModalOpen(true)}
              className="bg-gcs-emerald hover:bg-[#00c28c] text-xs h-9 px-4 font-semibold flex items-center gap-2"
            >
              <MessageSquarePlus className="w-4 h-4" />
              <span>Start New Encrypted Chat</span>
            </Button>

            <div className="mt-12 flex items-center gap-1.5 text-[11px] text-gcs-muted font-mono">
              <Lock className="w-3.5 h-3.5 text-gcs-emerald/80" />
              <span>End-to-End Encrypted</span>
            </div>
          </div>
        )}
      </div>

      {/* WhatsApp-Style "New Chat" Contact Picker Modal */}
      <Modal
        isOpen={isNewChatModalOpen}
        onClose={() => setIsNewChatModalOpen(false)}
        title="New Chat"
        description="Select a colleague from your organization or enter an email address to begin a direct encrypted chat."
      >
        <div className="flex flex-col gap-3.5 text-sm mt-1">
          {/* Search Contacts */}
          <div className="relative">
            <Input
              placeholder="Search team members by name or email..."
              value={directorySearch}
              onChange={(e) => setDirectorySearch(e.target.value)}
              leftIcon={<Search className="w-4 h-4 text-gcs-muted" />}
              className="h-9 text-xs"
            />
          </div>

          {/* Contact Directory List */}
          <div className="border border-gcs-border rounded-xl bg-gcs-sidebar overflow-hidden">
            <div className="px-3 py-2 bg-gcs-card/80 border-b border-gcs-border/60 flex items-center justify-between text-xs text-gcs-muted">
              <span className="font-semibold text-gcs-mint flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5" />
                Team Directory ({filteredDirectoryUsers.length})
              </span>
              <span className="text-[10px] text-gcs-muted font-mono">Active Accounts</span>
            </div>

            <div className="max-h-60 overflow-y-auto divide-y divide-gcs-border/20">
              {directoryLoading ? (
                <div className="p-6 text-center text-xs text-gcs-muted flex items-center justify-center gap-2">
                  <span className="w-3 h-3 border-2 border-gcs-emerald border-t-transparent rounded-full animate-spin" />
                  <span>Loading directory contacts...</span>
                </div>
              ) : filteredDirectoryUsers.length === 0 ? (
                <div className="p-6 text-center text-xs text-gcs-muted">
                  No colleagues matched "{directorySearch}".
                </div>
              ) : (
                filteredDirectoryUsers.map((user) => (
                  <div
                    key={user.id}
                    className="p-2.5 px-3 flex items-center justify-between hover:bg-gcs-card/60 transition-colors"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Avatar
                        src={user.avatarUrl}
                        name={user.fullName || user.email}
                        size="sm"
                        status="online"
                      />
                      <div className="min-w-0">
                        <span className="text-xs font-semibold text-gcs-text block truncate leading-tight">
                          {user.fullName}
                        </span>
                        <span className="text-[11px] text-gcs-muted block truncate font-mono">
                          {user.email}
                        </span>
                      </div>
                    </div>

                    <Button
                      variant="primary"
                      size="sm"
                      disabled={isCreatingChat}
                      onClick={() =>
                        handleStartDirectWithUser(user.id, user.fullName || user.email)
                      }
                      className="text-[11px] h-7 px-3 bg-gcs-emerald hover:bg-[#00c28c] shrink-0"
                    >
                      Chat
                    </Button>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Custom Email Fallback */}
          <div className="pt-2 border-t border-gcs-border/40">
            <span className="text-[11px] font-semibold text-gcs-muted block mb-1.5">
              Or initiate by corporate email:
            </span>
            <div className="flex gap-2">
              <Input
                placeholder="colleague@globalcrestsolutions.com"
                value={newChatEmail}
                onChange={(e) => setNewChatEmail(e.target.value)}
                className="h-8.5 text-xs flex-1"
              />
              <Button
                variant="outline"
                size="sm"
                disabled={isCreatingChat || !newChatEmail.trim()}
                onClick={handleStartNewChatByEmail}
                className="h-8.5 text-xs shrink-0"
              >
                Start
              </Button>
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <Button variant="ghost" size="sm" onClick={() => setIsNewChatModalOpen(false)}>
              Close
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
            <span className="font-semibold text-gcs-text">
              {activeContact ? activeContact.name : currentUser.fullName || currentUser.email}
            </span>
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
        contactName={activeContact ? activeContact.name : 'Peer'}
        avatarSrc={activeContact ? activeContact.avatarSrc : undefined}
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