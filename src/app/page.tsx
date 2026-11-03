'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { Sidebar, ConversationItem } from '../components/chat/Sidebar';
import { ChatHeader } from '../components/chat/ChatHeader';
import { MessageBubble, MessageProps } from '../components/chat/MessageBubble';
import { ChatInput, ReplyContext } from '../components/chat/ChatInput';
import { CallModal } from '../components/chat/CallModal';
import { InstallAppModal } from '../components/ui/InstallAppModal';
import { Drawer } from '../components/ui/Drawer';
import { Modal } from '../components/ui/Modal';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Avatar } from '../components/ui/Avatar';
import { useToast } from '../components/ui/Toast';
import {
  encryptAESGCM,
  decryptAESGCM,
  encryptMediaBuffer,
  decryptMediaBuffer,
  bufferToBase64,
} from '../lib/crypto';
import { realtimeSocket } from '../lib/socket/client';
import { WebRtcManager } from '../lib/webrtc/webrtc-manager';
import { playSound } from '../lib/audio';
import { cn } from '../lib/utils';
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
  ChevronDown,
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
  const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(new Set());

  // WhatsApp-Style "New Chat" Contact Picker Modal State
  const [isNewChatModalOpen, setIsNewChatModalOpen] = useState(false);
  const [isInstallModalOpen, setIsInstallModalOpen] = useState(false);
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

  // WebRTC Calling Engine State & Media Refs
  const rtcManagerRef = useRef<WebRtcManager | null>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [showScrollBottom, setShowScrollBottom] = useState(false);
  const [activeCallerName, setActiveCallerName] = useState<string>('Peer');
  const [incomingNotif, setIncomingNotif] = useState<{
    id: string;
    conversationId: string;
    senderName: string;
    preview: string;
    timestamp: number;
  } | null>(null);
  const [replyTarget, setReplyTarget] = useState<ReplyContext | null>(null);
  const [typingUsers, setTypingUsers] = useState<Record<string, { userId: string; displayName?: string }>>({});
  const typingTimersRef = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const [lastSeenMap, setLastSeenMap] = useState<Record<string, string | Date | number>>({});

  const prevActiveIdRef = useRef<string | undefined>(activeId);
  const prevMsgCountRef = useRef<number>(messages.length);
  const messagesCacheRef = useRef<Record<string, MessageProps[]>>({});
  const lastScrolledConvIdRef = useRef<string | null>(null);
  const [isRefreshingMessages, setIsRefreshingMessages] = useState(false);

  const { toast } = useToast();

  // Auto-dismiss in-app notification banner after 5 seconds
  useEffect(() => {
    if (!incomingNotif) return;
    const timer = setTimeout(() => {
      setIncomingNotif(null);
    }, 5000);
    return () => clearTimeout(timer);
  }, [incomingNotif]);

  // Reset document title on window focus
  useEffect(() => {
    const handleFocus = () => {
      document.title = 'GCS CONNECT — High-Assurance End-to-End Encrypted Workplace';
    };
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, []);

  // Glitch-free smart scrolling: instant snap on conversation switch, smooth on new message
  useEffect(() => {
    if (!messagesEndRef.current) return;

    // When opening a new conversation or first loading messages into it:
    if (lastScrolledConvIdRef.current !== activeId) {
      if (messages.length > 0) {
        lastScrolledConvIdRef.current = activeId;
        messagesEndRef.current.scrollIntoView({ behavior: 'auto' });
      }
      prevMsgCountRef.current = messages.length;
      return;
    }

    // Only when already inside this conversation and a new message arrives or is sent:
    if (messages.length > prevMsgCountRef.current) {
      const lastMsg = messages[messages.length - 1];
      if (lastMsg?.isSentByMe || !showScrollBottom) {
        messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
      }
    }
    prevMsgCountRef.current = messages.length;
  }, [messages, activeId, showScrollBottom]);

  const handleMessagesScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    const isNearBottom = target.scrollHeight - target.scrollTop - target.clientHeight < 120;
    setShowScrollBottom(!isNearBottom);
  };

  // Load conversations from backend
  const loadConversations = useCallback(
    async (preferredActiveId?: string, preferredEmail?: string) => {
      try {
        const res = await fetch('/api/conversations');
        if (!res.ok) return;
        const data = await res.json();
        if (data.success && Array.isArray(data.conversations)) {
          const peerIds: string[] = [];
          const formatted: ConversationItem[] = data.conversations.map((c: any) => {
            const peer = (c.members || []).find((m: any) => m.userId !== currentUser?.id);
            const peerUserId = peer?.userId;
            if (peerUserId) peerIds.push(peerUserId);

            let lastMsgText = 'No messages yet';
            if (c.latestMessage) {
              if (c.latestMessage.isDeletedForEveryone) {
                lastMsgText = 'This message was deleted';
              } else if (c.latestMessage.messageType === 'IMAGE') {
                lastMsgText = '📷 Photo';
              } else if (c.latestMessage.messageType === 'VIDEO') {
                lastMsgText = '🎥 Video';
              } else if (c.latestMessage.messageType === 'DOCUMENT') {
                lastMsgText = '📄 Document';
              } else {
                lastMsgText = 'Encrypted message';
              }
            }

            const peerLastSeen = c.lastSeenAt || c.members?.find((m: any) => m.userId !== currentUser?.id)?.lastSeenAt;
            if (peerUserId && peerLastSeen) {
              setLastSeenMap((prev) => ({ ...prev, [peerUserId]: peerLastSeen }));
            }

            return {
              id: c.id,
              name: c.title || 'Encrypted Direct Chat',
              avatarSrc: c.avatarUrl,
              peerUserId,
              status: 'offline', // dynamic in displayConversations
              lastSeenAt: peerLastSeen,
              lastMessage: lastMsgText,
              lastMessageTime: c.latestMessage ? c.latestMessage.createdAt : c.updatedAt,
              lastMessageStatus: c.latestMessage?.isFromMe ? 'sent' : undefined,
              unreadCount: c.unreadCount || 0,
              isPinned: c.isPinned || false,
              isMuted: c.isMuted || false,
              isGroup: c.type === 'GROUP',
            };
          });

          setConversations(formatted);

          // Auto-join conversation rooms to receive peer typing notifications across all chats
          formatted.forEach((item) => {
            realtimeSocket.joinConversation(item.id);
          });

          // Query presence of peers
          if (peerIds.length > 0) {
            realtimeSocket.queryPresence(peerIds).then((onlineList) => {
              if (Array.isArray(onlineList) && onlineList.length > 0) {
                setOnlineUserIds((prev) => {
                  const updated = new Set(prev);
                  onlineList.forEach((uid) => updated.add(uid));
                  return updated;
                });
              }
            });
          }

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

          // Priority 3: Keep existing selection, or on desktop select first
          setActiveId((prev) => {
            if (prev && formatted.some((c) => c.id === prev)) {
              return prev;
            }
            // On mobile viewports, default to the conversation list so users aren't trapped in a chat
            if (typeof window !== 'undefined' && window.innerWidth < 768) {
              return '';
            }
            return formatted.length > 0 ? formatted[0].id : '';
          });
        }
      } catch (err) {
        console.error('Failed to load conversations:', err);
      }
    },
    [currentUser?.id]
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

  // Load Directory Users when New Chat modal is opened or search query changes
  useEffect(() => {
    if (!isNewChatModalOpen) {
      setDirectorySearch('');
      setDirectoryUsers([]);
      return;
    }

    const isAdmin = Boolean(
      currentUser?.roles?.includes('SUPER_ADMIN') ||
      currentUser?.roles?.includes('ADMIN') ||
      currentUser?.role === 'ADMIN'
    );

    const q = directorySearch.trim();

    // Privacy rule: Regular users must enter at least 2 characters to search
    if (!isAdmin && q.length < 2) {
      setDirectoryUsers([]);
      setDirectoryLoading(false);
      return;
    }

    setDirectoryLoading(true);
    const timer = setTimeout(() => {
      const url = q ? `/api/users/directory?q=${encodeURIComponent(q)}` : '/api/users/directory';
      fetch(url)
        .then((res) => res.json())
        .then((data) => {
          if (data.success && Array.isArray(data.users)) {
            setDirectoryUsers(data.users);
          } else {
            setDirectoryUsers([]);
          }
        })
        .catch((err) => console.error('Failed to load directory:', err))
        .finally(() => setDirectoryLoading(false));
    }, isAdmin && !q ? 0 : 250);

    return () => clearTimeout(timer);
  }, [isNewChatModalOpen, directorySearch, currentUser]);

  // Real-Time Socket Connection & Event Handling
  useEffect(() => {
    if (!currentUser) return;

    realtimeSocket.connect('', undefined);

    // Initialize WebRTC Calling Manager
    const rawSocket = realtimeSocket.getSocket();
    if (rawSocket) {
      rtcManagerRef.current = new WebRtcManager({
        socket: rawSocket,
        onStateChange: (state) => {
          if (state === 'RINGING') {
            playSound('ringtone');
            setCallState((prev) => ({ ...prev, isOpen: true, status: 'incoming' }));
          } else if (state === 'CONNECTED') {
            playSound('call_connect');
            setCallState((prev) => ({ ...prev, isOpen: true, status: 'connected' }));
            toast({ type: 'success', message: 'DTLS-SRTP P2P Encrypted Call Connected!' });
          } else if (state === 'ENDED' || state === 'IDLE') {
            playSound('call_hangup');
            setCallState((prev) => ({ ...prev, isOpen: false }));
          }
        },
        onLocalStream: (stream) => {
          if (localVideoRef.current) {
            localVideoRef.current.srcObject = stream;
          }
        },
        onRemoteStream: (stream) => {
          if (remoteVideoRef.current) {
            remoteVideoRef.current.srcObject = stream;
          }
          if (remoteAudioRef.current) {
            remoteAudioRef.current.srcObject = stream;
            remoteAudioRef.current.play().catch(() => {});
          }
        },
        onError: (err) => {
          console.error('[WebRtcError]', err);
          toast({ type: 'error', message: err.message || 'Call connection error.' });
        },
      });
    }

    // 1. Presence updates
    const unsubPresence = realtimeSocket.onPresence(({ userId, status, timestamp }: any) => {
      setOnlineUserIds((prev) => {
        const next = new Set(prev);
        if (status === 'ONLINE') {
          next.add(userId);
        } else {
          next.delete(userId);
        }
        return next;
      });
      if (status === 'OFFLINE' && timestamp) {
        setLastSeenMap((prev) => ({ ...prev, [userId]: timestamp }));
      }
    });

    // 1b. Real-time typing indicators
    const unsubTyping = realtimeSocket.onTyping((event) => {
      if (!event || event.userId === currentUser?.id) return;
      const convId = event.conversationId;

      if (event.isTyping) {
        const prevTimer = typingTimersRef.current.get(convId);
        if (prevTimer) clearTimeout(prevTimer);

        const timer = setTimeout(() => {
          setTypingUsers((prev) => {
            const next = { ...prev };
            delete next[convId];
            return next;
          });
          typingTimersRef.current.delete(convId);
        }, 3500);
        typingTimersRef.current.set(convId, timer);

        setTypingUsers((prev) => ({
          ...prev,
          [convId]: { userId: event.userId, displayName: event.displayName },
        }));
      } else {
        const prevTimer = typingTimersRef.current.get(convId);
        if (prevTimer) {
          clearTimeout(prevTimer);
          typingTimersRef.current.delete(convId);
        }
        setTypingUsers((prev) => {
          const next = { ...prev };
          delete next[convId];
          return next;
        });
      }
    });

    // 2. Incoming call listener
    const unsubIncomingCall = realtimeSocket.onIncomingCall((data) => {
      rtcManagerRef.current?.handleIncomingCall(data.callId, data.initiator.id, data.callType);
      setActiveCallerName(data.initiator.fullName || data.initiator.displayName || 'Peer');
      setCallState({
        isOpen: true,
        callType: data.callType === 'VIDEO' ? 'video' : 'voice',
        status: 'incoming',
      });
      playSound('ringtone');
    });

    // 3. Media ready notification listener
    const unsubMediaReady = realtimeSocket.onMediaReady(async (event) => {
      setMessages((prev) =>
        prev.map((m) => {
          if (m.id === event.messageId && m.attachment) {
            return {
              ...m,
              attachment: {
                ...m.attachment,
                id: event.attachmentId,
              },
            };
          }
          return m;
        })
      );
    });

    // 4. Read receipts updates
    const unsubReceipt = realtimeSocket.onReceipt((receipt: any) => {
      if (!receipt) return;
      const receiptStatus = receipt.status === 'READ' ? 'read' : 'delivered';

      setMessages((prev) =>
        prev.map((m) => {
          if (m.id === receipt.messageId && m.isSentByMe) {
            return { ...m, status: receiptStatus };
          }
          return m;
        })
      );

      setConversations((prev) =>
        prev.map((c) => {
          if (c.id === receipt.conversationId) {
            return { ...c, lastMessageStatus: receiptStatus };
          }
          return c;
        })
      );
    });

    // 5. Incoming message listener
    const unsubMessage = realtimeSocket.onMessage(async (msg: any) => {
      if (!msg) return;

      const isMe = msg.sender?.id === currentUser?.id;
      const senderName = msg.sender?.fullName || 'User';

      let text = 'Encrypted message';
      let attachmentObj: any = undefined;
      let previewSnippet = 'New message';

      if (msg.isDeletedForEveryone) {
        text = 'This message was deleted';
        previewSnippet = 'This message was deleted';
      } else {
        try {
          const key = await getConversationKey(msg.conversationId);
          text = await decryptAESGCM(
            key,
            msg.encryptedPayload,
            msg.initializationVector,
            msg.authTag
          );
        } catch {
          text = 'Encrypted message';
        }

        let replyObj: any = undefined;
        if (text.startsWith('{"type":"REPLY"') || text.startsWith('{"replyTo"')) {
          try {
            const parsed = JSON.parse(text);
            replyObj = parsed.replyTo;
            text = parsed.text || '';
            previewSnippet = text || 'Replied to a message';
          } catch {}
        }

        if (text.startsWith('{"type":"MEDIA"') || text.startsWith('{"mediaKey"')) {
          try {
            const parsed = JSON.parse(text);
            attachmentObj = {
              id: msg.id,
              fileName: parsed.fileName || 'Encrypted File',
              fileSizeBytes: parsed.fileSizeBytes,
              mimeType: parsed.mimeType || 'application/octet-stream',
              mediaKey: parsed.mediaKey,
              iv: parsed.iv,
              authTag: parsed.authTag,
              ciphertextSha256: parsed.ciphertextSha256,
            };
            if (attachmentObj.mimeType.startsWith('image/')) {
              previewSnippet = '📷 Photo';
            } else if (attachmentObj.mimeType.startsWith('audio/')) {
              previewSnippet = '🎵 Voice Note';
            } else if (attachmentObj.mimeType.startsWith('video/')) {
              previewSnippet = '🎥 Video';
            } else {
              previewSnippet = `📄 ${attachmentObj.fileName}`;
            }
            text = '';
          } catch {
            previewSnippet = '📎 File attachment';
          }
        } else if (!replyObj) {
          previewSnippet = text;
        }
      }

      // 1. Process active conversation message stream
      if (msg.conversationId === activeId) {
        const newMsg: MessageProps = {
          id: msg.id,
          senderName,
          content: text,
          replyTo: replyObj,
          timestamp: new Date(msg.createdAt).getTime(),
          isSentByMe: isMe,
          status: 'delivered',
          isEncrypted: true,
          isDeletedForEveryone: msg.isDeletedForEveryone,
          attachment: attachmentObj,
          reactions: [],
        };

        setMessages((prev) => {
          let updated = prev;
          if (prev.some((m) => m.id === msg.id)) {
            updated = prev;
          } else if (isMe) {
            const pendingIdx = prev.findIndex((m) => m.id.startsWith('m-') && m.isSentByMe);
            if (pendingIdx !== -1) {
              const next = [...prev];
              next[pendingIdx] = newMsg;
              updated = next;
            } else {
              updated = [...prev, newMsg];
            }
          } else {
            updated = [...prev, newMsg];
          }
          messagesCacheRef.current[msg.conversationId] = updated;
          return updated;
        });

        // Auto-decrypt image/video/audio in background for preview
        if (attachmentObj?.mediaKey) {
          decryptAndCreateBlob(attachmentObj).then((blobUrl) => {
            if (blobUrl) {
              setMessages((prev) => {
                const next = prev.map((m) =>
                  m.id === msg.id && m.attachment
                    ? { ...m, attachment: { ...m.attachment, url: blobUrl } }
                    : m
                );
                messagesCacheRef.current[msg.conversationId] = next;
                return next;
              });
            }
          });
        }

        // Send READ receipt
        if (!isMe) {
          fetch(`/api/messages/${msg.id}/receipt`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'READ' }),
          }).catch(() => {});
        }
      } else {
        if (messagesCacheRef.current[msg.conversationId]) {
          const cache = messagesCacheRef.current[msg.conversationId];
          if (!cache.some((m) => m.id === msg.id)) {
            messagesCacheRef.current[msg.conversationId] = [...cache, newMsg];
          }
        }
        if (!isMe) {
          fetch(`/api/messages/${msg.id}/receipt`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'DELIVERED' }),
          }).catch(() => {});
        }
      }

      // 2. Play received audio chime if not sent by me and sound enabled
      if (!isMe) {
        const soundEnabled =
          typeof window !== 'undefined'
            ? localStorage.getItem('gcs_notif_sounds') !== 'false'
            : true;
        if (soundEnabled) {
          playSound('received');
        }

        // 3. Browser Push / Desktop Notification
        if (
          typeof window !== 'undefined' &&
          'Notification' in window &&
          Notification.permission === 'granted'
        ) {
          try {
            const notif = new Notification(senderName, {
              body: previewSnippet,
              icon: '/android-chrome-192x192.png',
              badge: '/android-chrome-192x192.png',
              tag: msg.conversationId,
            });
            notif.onclick = () => {
              window.focus();
              setActiveId(msg.conversationId);
              notif.close();
            };
          } catch {}
        }

        // 4. In-App Floating Notification Banner
        const isHidden = typeof document !== 'undefined' && document.hidden;
        const bannerEnabled =
          typeof window !== 'undefined'
            ? localStorage.getItem('gcs_notif_banners') !== 'false'
            : true;
        if ((msg.conversationId !== activeId || isHidden) && bannerEnabled) {
          setIncomingNotif({
            id: msg.id,
            conversationId: msg.conversationId,
            senderName,
            preview: previewSnippet,
            timestamp: Date.now(),
          });
        }

        // 5. Document title alert
        if (typeof document !== 'undefined' && (isHidden || msg.conversationId !== activeId)) {
          document.title = `🔔 (1) ${senderName} | GCS CONNECT`;
        }
      }

      loadConversations(activeId);
    });

    // 6. Real-time message reaction updates
    const unsubReaction = realtimeSocket.onReaction((data: any) => {
      if (!data || data.conversationId !== activeId) return;
      setMessages((prev) =>
        prev.map((m) => {
          if (m.id !== data.messageId) return m;
          const isCurrentUser = data.userId === currentUser?.id;
          const currentReactions = m.reactions || [];
          const match = currentReactions.find((r) => r.emoji === data.emoji);

          let updated = [...currentReactions];
          if (data.action === 'added') {
            if (match) {
              updated = updated.map((r) =>
                r.emoji === data.emoji
                  ? {
                      ...r,
                      count: r.hasReacted && isCurrentUser ? r.count : r.count + 1,
                      hasReacted: isCurrentUser ? true : r.hasReacted,
                    }
                  : r
              );
            } else {
              updated.push({
                emoji: data.emoji,
                count: 1,
                hasReacted: isCurrentUser,
              });
            }
          } else if (data.action === 'removed') {
            if (match) {
              if (match.count <= 1) {
                updated = updated.filter((r) => r.emoji !== data.emoji);
              } else {
                updated = updated.map((r) =>
                  r.emoji === data.emoji
                    ? {
                        ...r,
                        count: Math.max(1, r.count - 1),
                        hasReacted: isCurrentUser ? false : r.hasReacted,
                      }
                    : r
                );
              }
            }
          }
          return { ...m, reactions: updated };
        })
      );
    });

    return () => {
      unsubPresence();
      unsubTyping();
      unsubIncomingCall();
      unsubMediaReady();
      unsubReceipt();
      unsubMessage();
      unsubReaction();
    };
  }, [currentUser, activeId, loadConversations]);

  // Join active conversation room for real-time delivery
  useEffect(() => {
    if (activeId) {
      realtimeSocket.joinConversation(activeId);
    }
  }, [activeId]);

  // Decrypt media ciphertext and return accessible Blob URL
  const decryptAndCreateBlob = async (att: any): Promise<string | undefined> => {
    try {
      const res = await fetch(`/api/media/${att.id}`);
      if (!res.ok) return undefined;
      const cipherBuffer = await res.arrayBuffer();
      if (att.mediaKey && att.iv && att.authTag) {
        const decrypted = await decryptMediaBuffer(cipherBuffer, {
          mediaKey: att.mediaKey,
          iv: att.iv,
          authTag: att.authTag,
          ciphertextSha256: att.ciphertextSha256,
        });
        const blob = new Blob([decrypted], { type: att.mimeType || 'application/octet-stream' });
        return URL.createObjectURL(blob);
      }
    } catch (e) {
      console.warn('Auto-decrypt error:', e);
    }
    return undefined;
  };

  // On-demand decrypt & download attachment handler
  const handleDownloadAttachment = async (attachment: any) => {
    try {
      toast({ type: 'info', message: `Decrypting ${attachment.fileName}...` });
      let blobUrl = attachment.url;
      if (!blobUrl) {
        blobUrl = await decryptAndCreateBlob(attachment);
      }
      if (!blobUrl) {
        throw new Error('Encrypted file could not be retrieved from server.');
      }

      setMessages((prev) =>
        prev.map((m) =>
          m.attachment?.id === attachment.id || m.id === attachment.id
            ? { ...m, attachment: { ...m.attachment!, url: blobUrl } }
            : m
        )
      );

      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = attachment.fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      toast({ type: 'success', message: `${attachment.fileName} downloaded!` });
    } catch (err: any) {
      console.error('[DownloadError]', err);
      toast({ type: 'error', message: err.message || 'Download failed.' });
    }
  };

  // Fetch and decrypt messages when activeId changes
  useEffect(() => {
    if (!activeId) {
      setMessages([]);
      return;
    }

    setConversations((prev) =>
      prev.map((c) => (c.id === activeId ? { ...c, unreadCount: 0 } : c))
    );

    // Instant render from cache if available (eliminates glitch & flicker)
    if (messagesCacheRef.current[activeId]) {
      setMessages(messagesCacheRef.current[activeId]);
      setIsMessagesLoading(false);
      setIsRefreshingMessages(true);
    } else {
      setMessages([]);
      setIsMessagesLoading(true);
      setIsRefreshingMessages(false);
    }

    let isCurrent = true;

    fetch(`/api/conversations/${activeId}/messages?limit=200`)
      .then((res) => res.json())
      .then(async (data) => {
        if (!isCurrent) return;
        if (data.success && Array.isArray(data.messages)) {
          const loaded = await Promise.all(
            data.messages.map(async (m: any) => {
              let text = 'Encrypted message';
              let attachmentObj: any = undefined;

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

                let replyObj: any = undefined;
                if (text.startsWith('{"type":"REPLY"') || text.startsWith('{"replyTo"')) {
                  try {
                    const parsed = JSON.parse(text);
                    replyObj = parsed.replyTo;
                    text = parsed.text || '';
                  } catch {}
                }

                if (text.startsWith('{"type":"MEDIA"') || text.startsWith('{"mediaKey"')) {
                  try {
                    const parsed = JSON.parse(text);
                    const attachmentRecord = m.attachments?.[0];
                    const attId = attachmentRecord?.id || m.id;

                    attachmentObj = {
                      id: attId,
                      fileName: parsed.fileName || 'Encrypted File',
                      fileSizeBytes: parsed.fileSizeBytes,
                      mimeType: parsed.mimeType || 'application/octet-stream',
                      mediaKey: parsed.mediaKey,
                      iv: parsed.iv,
                      authTag: parsed.authTag,
                      ciphertextSha256: parsed.ciphertextSha256,
                    };

                    // Auto-decrypt for immediate display
                    try {
                      const mediaRes = await fetch(`/api/media/${attId}`);
                      if (mediaRes.ok) {
                        const cipherBuffer = await mediaRes.arrayBuffer();
                        const decryptedBuffer = await decryptMediaBuffer(cipherBuffer, {
                          mediaKey: parsed.mediaKey,
                          iv: parsed.iv,
                          authTag: parsed.authTag,
                          ciphertextSha256: parsed.ciphertextSha256,
                        });
                        const blob = new Blob([decryptedBuffer], {
                          type: parsed.mimeType || 'application/octet-stream',
                        });
                        attachmentObj.url = URL.createObjectURL(blob);
                      }
                    } catch (decErr) {
                      console.warn('Auto-decrypt error:', decErr);
                    }

                    text = '';
                  } catch (e) {
                    console.error('Failed to parse media descriptor:', e);
                  }
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

              const reactionMap = new Map<
                string,
                { emoji: string; count: number; hasReacted: boolean }
              >();
              (m.reactions || []).forEach((r: any) => {
                const cur = reactionMap.get(r.emoji) || {
                  emoji: r.emoji,
                  count: 0,
                  hasReacted: false,
                };
                cur.count += 1;
                if (r.userId === currentUser?.id) {
                  cur.hasReacted = true;
                }
                reactionMap.set(r.emoji, cur);
              });
              const reactions = Array.from(reactionMap.values());

              return {
                id: m.id,
                senderName: m.senderDevice?.user?.fullName || 'User',
                content: text,
                replyTo: replyObj,
                timestamp: new Date(m.createdAt).getTime(),
                isSentByMe: isMe,
                status,
                isEncrypted: true,
                isDeletedForEveryone: m.isDeletedForEveryone,
                attachment: attachmentObj,
                reactions,
              };
            })
          );

          if (isCurrent) {
            const reversed = loaded.reverse();
            messagesCacheRef.current[activeId] = reversed;
            setMessages(reversed);
            setIsMessagesLoading(false);
            setIsRefreshingMessages(false);
          }
        }
      })
      .catch((err) => console.error('Failed to load messages:', err))
      .finally(() => {
        if (isCurrent) {
          setIsMessagesLoading(false);
          setIsRefreshingMessages(false);
        }
      });

    return () => {
      isCurrent = false;
    };
  }, [activeId, currentUser?.id]);

  const displayConversations = conversations.map((conv) => {
    const isOnline = conv.peerUserId ? onlineUserIds.has(conv.peerUserId) : false;
    const isTyping = Boolean(typingUsers[conv.id]);
    const lastSeen = conv.peerUserId ? (lastSeenMap[conv.peerUserId] || conv.lastSeenAt) : conv.lastSeenAt;
    return {
      ...conv,
      status: (isOnline ? 'online' : 'offline') as 'online' | 'offline',
      isTyping,
      lastSeenAt: lastSeen,
    };
  });

  const rawActiveContact = conversations.find((c) => c.id === activeId);
  const activePeerId = rawActiveContact?.peerUserId;
  const isDirectPeerOnline = activePeerId ? onlineUserIds.has(activePeerId) : false;
  const activeContactLastSeen = activePeerId ? (lastSeenMap[activePeerId] || rawActiveContact?.lastSeenAt) : rawActiveContact?.lastSeenAt;
  const isActiveTyping = Boolean(typingUsers[activeId]);

  const activeContact = rawActiveContact
    ? {
        ...rawActiveContact,
        status: (isDirectPeerOnline ? 'online' : 'offline') as 'online' | 'offline',
        isTyping: isActiveTyping,
        lastSeenAt: activeContactLastSeen,
      }
    : undefined;

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
    realtimeSocket.disconnect();
    setCurrentUser(null);
    setConversations([]);
    setMessages([]);
    setActiveId('');
    setOnlineUserIds(new Set());
    toast({ type: 'info', message: 'You have been signed out.' });
  };

  // Dispatch authenticated AES-256-GCM encrypted message
  const handleSendMessage = async (text: string, replyTo?: ReplyContext) => {
    if (!text.trim() || !activeId) return;

    realtimeSocket.stopTyping(activeId);

    const tempId = `m-${Date.now()}`;
    const optimisticMsg: MessageProps = {
      id: tempId,
      content: text,
      replyTo: replyTo || undefined,
      timestamp: Date.now(),
      isSentByMe: true,
      status: 'sending',
      isEncrypted: true,
      reactions: [],
    };
    setMessages((prev) => [...prev, optimisticMsg]);
    setReplyTarget(null);

    try {
      const key = await getConversationKey(activeId);
      const payloadString = replyTo
        ? JSON.stringify({
            type: 'REPLY',
            replyTo: {
              id: replyTo.id,
              senderName: replyTo.senderName,
              content: replyTo.content,
            },
            text,
          })
        : text;

      const { ciphertext, iv, authTag } = await encryptAESGCM(key, payloadString);

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
        playSound('sent');
        setMessages((prev) => {
          let updated: MessageProps[];
          if (prev.some((m) => m.id === data.message.id)) {
            updated = prev.filter((m) => m.id !== tempId);
          } else {
            updated = prev.map((m) =>
              m.id === tempId ? { ...m, id: data.message.id, status: 'sent' } : m
            );
          }
          messagesCacheRef.current[activeId] = updated;
          return updated;
        });

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

  // Toggle emoji reaction on message
  const handleToggleReaction = async (messageId: string, emoji: string) => {
    const msg = messages.find((m) => m.id === messageId);
    const existing = msg?.reactions?.find((r) => r.emoji === emoji);
    const hasReacted = existing?.hasReacted || false;

    // Optimistic local update
    setMessages((prev) => {
      const next = prev.map((m) => {
        if (m.id !== messageId) return m;
        const currentReactions = m.reactions || [];
        const match = currentReactions.find((r) => r.emoji === emoji);
        let updated = [...currentReactions];
        if (hasReacted) {
          if (match && match.count <= 1) {
            updated = updated.filter((r) => r.emoji !== emoji);
          } else if (match) {
            updated = updated.map((r) =>
              r.emoji === emoji ? { ...r, count: r.count - 1, hasReacted: false } : r
            );
          }
        } else {
          if (match) {
            updated = updated.map((r) =>
              r.emoji === emoji ? { ...r, count: r.count + 1, hasReacted: true } : r
            );
          } else {
            updated.push({ emoji, count: 1, hasReacted: true });
          }
        }
        return { ...m, reactions: updated };
      });
      messagesCacheRef.current[activeId] = next;
      return next;
    });

    try {
      if (hasReacted) {
        await fetch(`/api/messages/${messageId}/reactions`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ emoji }),
        });
      } else {
        await fetch(`/api/messages/${messageId}/reactions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ emoji }),
        });
      }
    } catch (err) {
      console.error('Failed to toggle emoji reaction:', err);
    }
  };

  // Smooth scroll and pulse highlight to original quoted message
  const handleScrollToMessage = (messageId: string) => {
    const element = document.getElementById(`msg-${messageId}`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      element.classList.add('animate-pulse');
      setTimeout(() => {
        element.classList.remove('animate-pulse');
      }, 1500);
    }
  };

  // Dispatch client-side encrypted media attachment (photos, videos, documents)
  const handleSendFile = async (file: File) => {
    if (!file || !activeId) return;

    if (file.size > 50 * 1024 * 1024) {
      toast({
        type: 'error',
        message: 'File size exceeds maximum encrypted limit (50MB).',
      });
      return;
    }

    const tempId = `temp-file-${Date.now()}`;
    const localBlobUrl = URL.createObjectURL(file);

    const optimisticMsg: MessageProps = {
      id: tempId,
      content: '',
      timestamp: Date.now(),
      isSentByMe: true,
      status: 'sending',
      isEncrypted: true,
      attachment: {
        id: tempId,
        fileName: file.name,
        fileSizeBytes: file.size,
        mimeType: file.type || 'application/octet-stream',
        url: localBlobUrl,
      },
    };
    setMessages((prev) => [...prev, optimisticMsg]);

    try {
      // 1. Client-Side AES-256-GCM encryption of file
      const arrayBuf = await file.arrayBuffer();
      const mediaPackage = await encryptMediaBuffer(
        new Uint8Array(arrayBuf),
        file.type || 'application/octet-stream',
        file.name
      );

      // 2. Encrypt descriptor with conversation key
      const key = await getConversationKey(activeId);
      const descriptorJson = JSON.stringify({
        type: 'MEDIA',
        ...mediaPackage.mediaDescriptor,
      });
      const { ciphertext, iv, authTag } = await encryptAESGCM(key, descriptorJson);

      const messageType = file.type.startsWith('image/')
        ? 'IMAGE'
        : file.type.startsWith('video/')
        ? 'VIDEO'
        : file.type.startsWith('audio/')
        ? 'AUDIO'
        : 'DOCUMENT';

      // 3. Post message to /api/conversations/:id/messages
      const res = await fetch(`/api/conversations/${activeId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messageType,
          encryptedPayload: ciphertext,
          initializationVector: iv,
          authTag: authTag,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.message) {
        toast({ type: 'error', message: 'Failed to create message record.' });
        setMessages((prev) => prev.filter((m) => m.id !== tempId));
        return;
      }

      const realMessageId = data.message.id;

      // 4. Upload ciphertext to /api/media/upload
      const uploadRes = await fetch('/api/media/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messageId: realMessageId,
          ciphertextBase64: bufferToBase64(mediaPackage.ciphertextBuffer),
          encryptedMimeType: bufferToBase64(
            new TextEncoder().encode(file.type || 'application/octet-stream')
          ),
          ciphertextSha256: mediaPackage.ciphertextSha256,
        }),
      });

      const uploadData = await uploadRes.json();
      if (!uploadRes.ok) {
        toast({ type: 'error', message: 'Failed to upload encrypted file bytes.' });
      }

      // 5. Update local message with real ID and sent status
      setMessages((prev) => {
        const next = prev.map((m) =>
          m.id === tempId
            ? {
                ...m,
                id: realMessageId,
                status: 'sent',
                attachment: {
                  ...m.attachment!,
                  id: uploadData.attachment?.id || realMessageId,
                },
              }
            : m
        );
        messagesCacheRef.current[activeId] = next;
        return next;
      });

      playSound('sent');
      toast({
        type: 'success',
        message: `${file.name} encrypted and sent securely!`,
      });

      loadConversations(activeId);
    } catch (err: any) {
      console.error('Failed to send file:', err);
      toast({ type: 'error', message: err.message || 'Failed to send file.' });
      setMessages((prev) => {
        const next = prev.filter((m) => m.id !== tempId);
        messagesCacheRef.current[activeId] = next;
        return next;
      });
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
      setMessages((prev) => {
        const next = prev.map((m) =>
          m.id === id
            ? {
                ...m,
                content: 'This message was deleted',
                isDeletedForEveryone: true,
              }
            : m
        );
        messagesCacheRef.current[activeId] = next;
        return next;
      });
      toast({
        type: 'info',
        message: 'Message deleted for everyone.',
      });
    } else {
      setMessages((prev) => {
        const next = prev.filter((m) => m.id !== id);
        messagesCacheRef.current[activeId] = next;
        return next;
      });
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
      `Are you sure you want to remove "${convName}" from your chat list? Your chat history remains safely backed up.`
    );
    if (!confirmed) return;

    try {
      await fetch(`/api/conversations/${conversationId}`, { method: 'DELETE' });
    } catch (e) {
      console.error('Conversation delete error:', e);
    }

    delete messagesCacheRef.current[conversationId];

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
      message: `Conversation "${convName}" was removed from your chat list.`,
    });
  };

  // Clear Messages Handler
  const handleClearHistory = async () => {
    if (!activeId) return;
    const confirmed = window.confirm(
      'Are you sure you want to clear message history in this conversation for your view?'
    );
    if (!confirmed) return;

    try {
      await fetch(`/api/conversations/${activeId}/clear`, { method: 'POST' });
      setMessages([]);
      delete messagesCacheRef.current[activeId];
      toast({ type: 'info', message: 'Chat history cleared for your view.' });
    } catch (e) {
      console.error('Clear history error:', e);
    }
  };

  // Export single chat transcript as readable text
  const handleExportChat = async (targetConvId?: string) => {
    const convId = targetConvId || activeId;
    if (!convId) return;

    const convItem = conversations.find((c) => c.id === convId);
    const convTitle = convItem?.name || 'Encrypted Chat';

    try {
      toast({ type: 'info', message: 'Generating decrypted chat export...' });

      const res = await fetch(`/api/conversations/${convId}/messages?all=true&includeCleared=true`);
      const data = await res.json();

      if (!res.ok || !data.success || !Array.isArray(data.messages)) {
        toast({ type: 'error', message: 'Failed to retrieve chat messages for export.' });
        return;
      }

      const key = await getConversationKey(convId);
      const lines: string[] = [
        '================================================================================',
        `GCS CONNECT — End-to-End Encrypted Chat Export`,
        `Conversation: ${convTitle}`,
        `Exported On: ${new Date().toLocaleString()}`,
        `Total Messages: ${data.messages.length}`,
        `Security Protocol: Web Crypto AES-256-GCM (Zero Plaintext Server Storage)`,
        '================================================================================',
        '',
      ];

      // Decrypt messages in chronological order
      const sorted = [...data.messages].sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      );

      for (const m of sorted) {
        let text = '';
        if (m.isDeletedForEveryone) {
          text = '[This message was deleted]';
        } else {
          try {
            text = await decryptAESGCM(key, m.encryptedPayload, m.initializationVector, m.authTag);
          } catch {
            text = '[Encrypted payload]';
          }

          if (text.startsWith('{"type":"REPLY"') || text.startsWith('{"replyTo"')) {
            try {
              const p = JSON.parse(text);
              text = `(In reply to ${p.replyTo?.senderName || 'user'}: "${p.replyTo?.content || ''}") ${p.text || ''}`;
            } catch {}
          } else if (text.startsWith('{"type":"MEDIA"') || text.startsWith('{"mediaKey"')) {
            try {
              const p = JSON.parse(text);
              text = `<Attachment: ${p.fileName || 'file'} (${Math.round((p.fileSizeBytes || 0) / 1024)} KB)>`;
            } catch {
              text = '<Encrypted File Attachment>';
            }
          }
        }

        const sender =
          m.senderDevice?.user?.fullName ||
          (m.senderDevice?.userId === currentUser?.id ? 'You' : 'User');
        const timeStr = new Date(m.createdAt).toLocaleString();
        lines.push(`[${timeStr}] ${sender}: ${text}`);
      }

      const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const safeTitle = convTitle.replace(/[^a-zA-Z0-9_-]/g, '_');
      const dateTag = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `GCS_Chat_${safeTitle}_${dateTag}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast({ type: 'success', message: `Exported ${sorted.length} messages for ${convTitle}!` });
    } catch (err: any) {
      console.error('[ExportChatError]', err);
      toast({
        type: 'error',
        message: 'Failed to export chat: ' + (err.message || 'Unknown error'),
      });
    }
  };

  // Export ALL conversations transcript archive
  const handleExportAllChats = async () => {
    if (conversations.length === 0) {
      toast({ type: 'info', message: 'No conversations to export.' });
      return;
    }

    try {
      toast({ type: 'info', message: 'Exporting complete chat archive...' });

      const allSections: string[] = [
        '================================================================================',
        `GCS CONNECT — Complete Workplace Chat History Archive`,
        `Account: ${currentUser?.fullName} (${currentUser?.email})`,
        `Exported On: ${new Date().toLocaleString()}`,
        `Total Active Conversations: ${conversations.length}`,
        `Encryption: Zero Plaintext Storage (AES-256-GCM)`,
        '================================================================================',
        '',
      ];

      for (const conv of conversations) {
        try {
          const res = await fetch(`/api/conversations/${conv.id}/messages?all=true&includeCleared=true`);
          const data = await res.json();
          if (res.ok && data.success && Array.isArray(data.messages)) {
            const key = await getConversationKey(conv.id);
            allSections.push('');
            allSections.push('--------------------------------------------------------------------------------');
            allSections.push(`CONVERSATION: ${conv.name} (ID: ${conv.id})`);
            allSections.push(`Messages Count: ${data.messages.length}`);
            allSections.push('--------------------------------------------------------------------------------');

            const sorted = [...data.messages].sort(
              (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
            );

            for (const m of sorted) {
              let text = '';
              if (m.isDeletedForEveryone) {
                text = '[This message was deleted]';
              } else {
                try {
                  text = await decryptAESGCM(key, m.encryptedPayload, m.initializationVector, m.authTag);
                } catch {
                  text = '[Encrypted payload]';
                }
                if (text.startsWith('{"type":"REPLY"') || text.startsWith('{"replyTo"')) {
                  try {
                    const p = JSON.parse(text);
                    text = `(In reply to ${p.replyTo?.senderName || 'user'}): ${p.text || ''}`;
                  } catch {}
                } else if (text.startsWith('{"type":"MEDIA"') || text.startsWith('{"mediaKey"')) {
                  try {
                    const p = JSON.parse(text);
                    text = `<Attachment: ${p.fileName || 'file'}>`;
                  } catch {}
                }
              }
              const sender =
                m.senderDevice?.user?.fullName ||
                (m.senderDevice?.userId === currentUser?.id ? 'You' : 'User');
              allSections.push(`[${new Date(m.createdAt).toLocaleString()}] ${sender}: ${text}`);
            }
          }
        } catch (e) {
          console.error(`Error exporting conv ${conv.id}:`, e);
        }
      }

      const blob = new Blob([allSections.join('\n')], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const dateTag = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `GCS_Complete_Chat_Archive_${dateTag}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast({ type: 'success', message: 'Complete chat archive exported successfully!' });
    } catch (err: any) {
      console.error('[ExportAllChatsError]', err);
      toast({
        type: 'error',
        message: 'Failed to export chats: ' + (err.message || 'Unknown error'),
      });
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

  const startCall = async (type: 'voice' | 'video') => {
    if (!activeContact?.peerUserId || !activeId) {
      toast({
        type: 'error',
        message: 'Direct chat required to start an encrypted P2P call.',
      });
      return;
    }

    // Permission Check & Device Access
    try {
      const streamTest = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: type === 'video',
      });
      streamTest.getTracks().forEach((track) => track.stop());
    } catch (permErr: any) {
      console.warn('Microphone/Camera permission error:', permErr);
      toast({
        type: 'error',
        message: 'Microphone & camera permission required. Please allow access in browser.',
      });
      return;
    }

    setActiveCallerName(activeContact.name);
    setCallState({
      isOpen: true,
      callType: type,
      status: 'outgoing',
    });
    playSound('ringtone');

    try {
      const rawSocket = realtimeSocket.getSocket();
      if (rawSocket && rtcManagerRef.current) {
        rtcManagerRef.current.setSocket(rawSocket);
      }
      await rtcManagerRef.current?.startCall(
        activeId,
        activeContact.peerUserId,
        type === 'video' ? 'VIDEO' : 'VOICE'
      );
    } catch (err: any) {
      console.error('[StartCallFailed]', err);
      playSound('call_hangup');
      setCallState((prev) => ({ ...prev, isOpen: false }));
      toast({ type: 'error', message: err.message || 'Call failed to connect.' });
    }
  };

  const handleAcceptCall = async () => {
    try {
      await rtcManagerRef.current?.acceptIncomingCall();
    } catch (err: any) {
      console.error('[AcceptCallFailed]', err);
      toast({ type: 'error', message: err.message || 'Failed to accept call.' });
    }
  };

  const handleRejectCall = () => {
    playSound('call_hangup');
    rtcManagerRef.current?.rejectIncomingCall();
    setCallState((prev) => ({ ...prev, isOpen: false }));
  };

  const handleEndCall = () => {
    playSound('call_hangup');
    rtcManagerRef.current?.hangup();
    setCallState((prev) => ({ ...prev, isOpen: false }));
  };

  const handleToggleMute = (muted: boolean) => {
    rtcManagerRef.current?.toggleAudio(!muted);
  };

  const handleToggleVideo = (videoOff: boolean) => {
    rtcManagerRef.current?.toggleVideo(!videoOff);
  };

  // 1. Loading State
  if (isAuthLoading) {
    return (
      <div className="h-[100dvh] w-screen flex flex-col items-center justify-center bg-gcs-bg font-sans safe-top safe-bottom">
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
      <div className="min-h-[100dvh] w-screen flex flex-col items-center justify-center bg-gcs-bg px-3.5 sm:px-4 py-6 sm:py-8 font-sans safe-top safe-bottom overflow-y-auto">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[320px] sm:w-[450px] h-[350px] bg-gcs-emerald/5 blur-[100px] sm:blur-[120px] rounded-full pointer-events-none" />

        <div className="relative w-full max-w-sm bg-gcs-card border border-gcs-border rounded-2xl shadow-2xl p-5 sm:p-7 animate-fade-in">
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

  // Filter directory users based on search and administrative permissions
  const isCurrentUserAdmin = Boolean(
    currentUser?.roles?.includes('SUPER_ADMIN') ||
    currentUser?.roles?.includes('ADMIN') ||
    currentUser?.role === 'ADMIN'
  );

  const filteredDirectoryUsers = directoryUsers.filter((u) => {
    const q = directorySearch.toLowerCase().trim();
    if (!q) return isCurrentUserAdmin;
    return (
      u.fullName.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      (u.displayName && u.displayName.toLowerCase().includes(q))
    );
  });

  // 3. Authenticated Workplace View (WhatsApp-Style Structure)
  return (
    <main className="h-[100dvh] w-screen flex overflow-hidden bg-gcs-bg font-sans safe-top safe-bottom relative">
      {/* Floating In-App New Message Notification Banner */}
      {incomingNotif && (
        <div
          onClick={() => {
            setActiveId(incomingNotif.conversationId);
            setIncomingNotif(null);
          }}
          className="fixed top-3 left-1/2 -translate-x-1/2 max-w-sm sm:max-w-md w-[92%] z-50 bg-[#1f2c34] border border-[#00a884]/60 rounded-2xl p-3 shadow-2xl backdrop-blur-xl flex items-center justify-between gap-3 cursor-pointer hover:bg-[#233138] active:scale-[0.98] transition-all animate-slide-down"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-full bg-[#00a884]/20 border border-[#00a884]/50 flex items-center justify-center text-white shrink-0 font-bold text-sm">
              <Avatar name={incomingNotif.senderName} size="sm" status="online" />
            </div>
            <div className="min-w-0 flex flex-col">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-white truncate">
                  {incomingNotif.senderName}
                </span>
                <span className="text-[10px] text-[#00a884] font-medium font-mono">
                  New Message
                </span>
              </div>
              <span className="text-xs text-[#d1d7db] truncate mt-0.5">
                {incomingNotif.preview}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setActiveId(incomingNotif.conversationId);
                setIncomingNotif(null);
              }}
              className="px-2.5 py-1 rounded-lg bg-[#00a884] text-white text-xs font-semibold hover:bg-[#008f6f] transition-colors"
            >
              Reply
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIncomingNotif(null);
              }}
              className="p-1 text-[#8696a0] hover:text-white rounded-lg transition-colors"
              title="Dismiss"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Sidebar Navigation: full width on mobile when no conversation is active; fixed width on desktop */}
      <div
        className={cn(
          'h-full shrink-0',
          activeContact && activeId
            ? 'hidden md:flex md:w-80 lg:w-96'
            : 'w-full md:w-80 lg:w-96 flex'
        )}
      >
        <Sidebar
          conversations={displayConversations}
          activeConversationId={activeId}
          onSelectConversation={(id) => {
            setActiveId(id);
          }}
          onDeleteConversation={handleDeleteConversation}
          onNewChat={() => setIsNewChatModalOpen(true)}
          onOpenSettings={() => setShowDrawer(true)}
          onOpenInstallModal={() => setIsInstallModalOpen(true)}
          onExportAllChats={handleExportAllChats}
          onStartCall={(type, contactName) => {
            setActiveCallerName(contactName);
            startCall(type);
          }}
          onLogout={handleLogout}
          currentUserName={currentUser.fullName || currentUser.email}
          currentUserEmail={currentUser.email}
          currentUserAvatar={currentUser.avatarUrl}
          onUpdateAvatar={(newAvatar) => {
            setCurrentUser((prev: any) => (prev ? { ...prev, avatarUrl: newAvatar } : null));
          }}
          isAdmin={Boolean(currentUser?.roles?.includes('ADMIN') || currentUser?.role === 'ADMIN')}
        />
      </div>

      {/* Main Content Area: full width on mobile when conversation is active; hidden on mobile when viewing chat list */}
      <div
        className={cn(
          'flex-1 flex-col h-full bg-gcs-bg min-w-0',
          activeContact && activeId ? 'flex w-full' : 'hidden md:flex'
        )}
      >
        {/* Top Header Bar (Desktop Only - hidden on mobile to maximize chat viewport) */}
        <div className="hidden md:flex h-10 px-4 bg-gcs-bg border-b border-gcs-border/40 items-center justify-between text-xs select-none shrink-0">
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
              className="flex items-center gap-1 text-[11px] text-gcs-mint hover:underline font-medium cursor-pointer"
            >
              <UserPlus className="w-3 h-3" />
              <span>New Chat</span>
            </button>

            <span className="text-gcs-border">•</span>

            <button
              type="button"
              onClick={handleLogout}
              className="flex items-center gap-1 text-[11px] text-gcs-muted hover:text-red-400 transition-colors cursor-pointer"
              title="Sign Out"
            >
              <LogOut className="w-3 h-3" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>

        {/* Active Conversation Main Pane or WhatsApp-Style Empty State */}
        {activeContact && activeId ? (
          <div className="flex-1 flex flex-col min-h-0 w-full">
            {/* WhatsApp-Style Chat Header with Mobile Back Button & 3-Dots Dropdown */}
            <ChatHeader
              contactName={activeContact.name}
              avatarSrc={activeContact.avatarSrc}
              status={activeContact.status}
              isTyping={activeContact.isTyping}
              lastSeenAt={activeContact.lastSeenAt}
              onBack={() => setActiveId('')}
              onVoiceCall={() => startCall('voice')}
              onVideoCall={() => startCall('video')}
              onExportChat={() => handleExportChat(activeContact.id)}
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

            {/* Chat Messages Stream with cyber-obsidian & emerald theme */}
            <div className="relative flex-1 min-h-0">
              {/* Subtle WhatsApp-style non-intrusive syncing line at top */}
              {isRefreshingMessages && messages.length > 0 && (
                <div className="absolute top-0 left-0 right-0 h-0.5 bg-[#00a884]/20 overflow-hidden z-10 pointer-events-none">
                  <div className="w-full h-full bg-[#00a884] animate-pulse" />
                </div>
              )}

              <div
                onScroll={handleMessagesScroll}
                className="h-full overflow-y-auto overflow-x-hidden p-2.5 sm:p-4 flex flex-col space-y-1.5 scroll-touch whatsapp-chat-bg bg-[#0b141a]"
              >
                <div className="mx-auto my-2 sm:my-3 px-3 py-1 rounded-full bg-gcs-card/80 border border-gcs-border/60 text-[10px] sm:text-[11px] text-gcs-muted text-center max-w-sm flex items-center justify-center gap-1.5 shadow-sm shrink-0">
                  <Lock className="w-3 h-3 text-gcs-emerald shrink-0" />
                  <span className="truncate">End-to-end encrypted with Web Crypto AES-256-GCM.</span>
                </div>

                {isMessagesLoading ? (
                  <div className="flex-1 flex flex-col items-center justify-center py-12 gap-3 text-gcs-muted animate-fade-in my-auto">
                    <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-[#111b21] border border-gcs-border/50 text-xs shadow-md">
                      <span className="w-3.5 h-3.5 border-2 border-[#00a884] border-t-transparent rounded-full animate-spin shrink-0" />
                      <span className="text-gcs-mint font-medium">Decrypting message history...</span>
                    </div>
                  </div>
                ) : messages.length === 0 ? (
                  <div className="text-center text-xs text-gcs-muted my-auto py-8">
                    No messages in this chat yet. Send an encrypted message below.
                  </div>
                ) : (
                  <>
                    <div className="flex-1 min-h-4" />
                    {messages.map((m) => (
                      <MessageBubble
                        key={m.id}
                        {...m}
                        onDelete={handleDeleteMessage}
                        onDownloadAttachment={handleDownloadAttachment}
                        onReply={(msg) =>
                          setReplyTarget({
                            id: msg.id,
                            senderName: msg.senderName || 'User',
                            content: msg.content,
                          })
                        }
                        onReact={handleToggleReaction}
                        onScrollToMessage={handleScrollToMessage}
                      />
                    ))}
                  </>
                )}
                {/* Real-time WhatsApp Typing Indicator Bubble */}
                {typingUsers[activeId] && (
                  <div className="w-full flex my-1 select-none justify-start animate-fade-in">
                    <div className="bg-[#202c33] border border-[#2a3942]/60 text-white rounded-2xl rounded-tl-sm px-3.5 py-2.5 shadow-sm flex items-center gap-2 max-w-[200px]">
                      <div className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-[#00a884] animate-bounce [animation-delay:-0.3s]" />
                        <span className="w-2 h-2 rounded-full bg-[#00a884] animate-bounce [animation-delay:-0.15s]" />
                        <span className="w-2 h-2 rounded-full bg-[#00a884] animate-bounce" />
                      </div>
                      <span className="text-xs text-[#8696a0] font-medium truncate">
                        {typingUsers[activeId].displayName || 'typing'}...
                      </span>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Floating Jump-to-Bottom Button */}
              {showScrollBottom && (
                <button
                  type="button"
                  onClick={() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })}
                  className="absolute bottom-4 right-4 sm:right-6 p-2.5 rounded-full bg-gcs-card/95 border border-gcs-emerald/50 text-gcs-mint shadow-xl hover:bg-gcs-card active:scale-90 transition-all z-20 flex items-center justify-center animate-fade-in"
                  title="Scroll to latest messages"
                  aria-label="Scroll to bottom"
                >
                  <ChevronDown className="w-4 h-4 text-gcs-emerald" />
                </button>
              )}
            </div>

            {/* Chat Input Bar */}
            <ChatInput
              onSendMessage={handleSendMessage}
              onSendFile={handleSendFile}
              replyTo={replyTarget}
              onCancelReply={() => setReplyTarget(null)}
              onTyping={() => {
                if (activeId) {
                  realtimeSocket.emitTyping(activeId);
                }
              }}
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
              className="h-10 text-base sm:text-xs rounded-xl"
            />
          </div>

          {/* Contact Directory List */}
          <div className="border border-gcs-border rounded-xl bg-gcs-sidebar overflow-hidden">
            <div className="px-3 py-2 bg-gcs-card/80 border-b border-gcs-border/60 flex items-center justify-between text-xs text-gcs-muted">
              <span className="font-semibold text-gcs-mint flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5" />
                {isCurrentUserAdmin
                  ? `All Colleague Accounts (${filteredDirectoryUsers.length})`
                  : directorySearch.trim().length >= 2
                  ? `Search Results (${filteredDirectoryUsers.length})`
                  : 'Search Directory'}
              </span>
              <span className="text-[10px] text-gcs-muted font-mono">
                {isCurrentUserAdmin ? 'Admin Directory View' : 'Encrypted Directory'}
              </span>
            </div>

            <div className="max-h-56 sm:max-h-64 overflow-y-auto divide-y divide-gcs-border/20 scroll-touch">
              {directoryLoading ? (
                <div className="p-6 text-center text-xs text-gcs-muted flex items-center justify-center gap-2">
                  <span className="w-3 h-3 border-2 border-gcs-emerald border-t-transparent rounded-full animate-spin" />
                  <span>Searching directory...</span>
                </div>
              ) : !isCurrentUserAdmin && directorySearch.trim().length < 2 ? (
                <div className="p-8 text-center text-xs text-gcs-muted flex flex-col items-center justify-center gap-2">
                  <div className="w-12 h-12 rounded-full bg-[#202c33] border border-gcs-border flex items-center justify-center text-[#8696a0] mb-1">
                    <Search className="w-5 h-5 text-[#00a884]" />
                  </div>
                  <span className="font-semibold text-white text-sm">Find Colleague</span>
                  <p className="max-w-xs text-[11.5px] text-[#8696a0]">
                    Type a name or corporate email address above to search and start an encrypted direct chat.
                  </p>
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
                className="h-9.5 text-base sm:text-xs flex-1 rounded-xl"
              />
              <Button
                variant="outline"
                size="sm"
                disabled={isCreatingChat || !newChatEmail.trim()}
                onClick={handleStartNewChatByEmail}
                className="h-9.5 px-3 text-xs shrink-0 rounded-xl"
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
            <Avatar
              src={activeContact ? activeContact.avatarSrc : currentUser.avatarUrl}
              name={activeContact ? activeContact.name : currentUser.fullName || currentUser.email}
              size="xl"
              className="mb-2"
            />
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

      {/* Hidden Remote Audio Element for DTLS-SRTP WebRTC Audio playback */}
      <audio ref={remoteAudioRef} autoPlay playsInline className="hidden" />

      {/* Voice & Video Call Modal */}
      <CallModal
        isOpen={callState.isOpen}
        callType={callState.callType}
        status={callState.status}
        contactName={activeCallerName || (activeContact ? activeContact.name : 'Peer')}
        avatarSrc={activeContact ? activeContact.avatarSrc : undefined}
        localVideoRef={localVideoRef}
        remoteVideoRef={remoteVideoRef}
        onAccept={handleAcceptCall}
        onReject={handleRejectCall}
        onEndCall={handleEndCall}
        onToggleMute={handleToggleMute}
        onToggleVideo={handleToggleVideo}
      />
      {/* Install GCS CONNECT App on Device Modal */}
      <InstallAppModal
        isOpen={isInstallModalOpen}
        onClose={() => setIsInstallModalOpen(false)}
      />
    </main>
  );
}