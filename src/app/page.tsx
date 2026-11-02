'use client';

import React, { useState } from 'react';
import { Sidebar, ConversationItem } from '@/components/chat/Sidebar';
import { ChatHeader } from '@/components/chat/ChatHeader';
import { MessageBubble, MessageProps } from '@/components/chat/MessageBubble';
import { ChatInput } from '@/components/chat/ChatInput';
import { CallModal } from '@/components/chat/CallModal';
import { Drawer } from '@/components/ui/Drawer';
import { Button } from '@/components/ui/Button';
import { DesignSystemShowcase } from '@/components/design-system/DesignSystemShowcase';
import { useToast } from '@/components/ui/Toast';
import { ShieldCheck, Lock, Palette, MessageSquare, Key, HardDrive } from 'lucide-react';

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
    content:
      'Verified with AES-256-GCM. Ready for deployment.',
    timestamp: Date.now() - 300000,
    isSentByMe: false,
    isEncrypted: true,
    reactions: [{ emoji: '🔒', count: 1, hasReacted: true }],
  },
];

export default function AppHome() {
  const [conversations] = useState<ConversationItem[]>(INITIAL_CONVERSATIONS);
  const [activeId, setActiveId] = useState<string>('c1');
  const [messages, setMessages] = useState<MessageProps[]>(INITIAL_MESSAGES);
  const [showDesignSystem, setShowDesignSystem] = useState(false);
  const [showDrawer, setShowDrawer] = useState(false);
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

  const activeContact =
    conversations.find((c) => c.id === activeId) || conversations[0];

  const handleSendMessage = (text: string) => {
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

  return (
    <main className="h-screen w-screen flex overflow-hidden bg-gcs-bg font-sans">
      {/* Sidebar Navigation */}
      <Sidebar
        conversations={conversations}
        activeConversationId={activeId}
        onSelectConversation={(id) => {
          setActiveId(id);
          setShowDesignSystem(false);
        }}
        onNewChat={() =>
          toast({ type: 'info', message: 'Admin account creation active in Phase 3' })
        }
        onOpenSettings={() => setShowDrawer(true)}
        currentUserName="Ikram Ul Haq"
        currentUserEmail="ikram@globalcrestsolutions.com"
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col h-full bg-gcs-bg min-w-0">
        {/* Top Control Bar: Mode Toggle */}
        <div className="h-10 px-4 bg-gcs-bg border-b border-gcs-border/40 flex items-center justify-between text-xs select-none">
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1.5 text-gcs-mint font-medium text-[11px]">
              <ShieldCheck className="w-3.5 h-3.5 text-gcs-emerald" />
              <span>GCS CONNECT Production Sandbox</span>
            </span>
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowDesignSystem(!showDesignSystem)}
            className="h-7 text-xs gap-1.5 text-gcs-mint hover:bg-gcs-card"
          >
            {showDesignSystem ? (
              <>
                <MessageSquare className="w-3.5 h-3.5" />
                <span>Return to Live Chat</span>
              </>
            ) : (
              <>
                <Palette className="w-3.5 h-3.5 text-gcs-emerald" />
                <span>Design System Showcase</span>
              </>
            )}
          </Button>
        </div>

        {/* View Switcher: Live Chat vs Design System Showcase */}
        {showDesignSystem ? (
          <div className="flex-1 overflow-y-auto">
            <DesignSystemShowcase />
          </div>
        ) : (
          <div className="flex-1 flex flex-col min-h-0">
            {/* Chat Header */}
            <ChatHeader
              contactName={activeContact.name}
              avatarSrc={activeContact.avatarSrc}
              status={activeContact.status}
              onVoiceCall={() => startCall('voice')}
              onVideoCall={() => startCall('video')}
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
                <span>Messages are end-to-end encrypted with X3DH and Double Ratchet.</span>
              </div>

              {messages.map((m) => (
                <MessageBubble key={m.id} {...m} />
              ))}
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
        )}
      </div>

      {/* Slide-out Settings & Contact Details Drawer */}
      <Drawer
        isOpen={showDrawer}
        onClose={() => setShowDrawer(false)}
        title="Session & Cryptographic Details"
      >
        <div className="flex flex-col gap-5 text-sm">
          <div className="flex flex-col items-center p-4 rounded-xl bg-gcs-card border border-gcs-border">
            <div className="h-16 w-16 rounded-full bg-gcs-emerald/20 border-2 border-gcs-emerald flex items-center justify-center text-xl font-bold text-gcs-mint mb-2">
              IU
            </div>
            <span className="font-semibold text-gcs-text">Ikram Ul Haq</span>
            <span className="text-xs text-gcs-muted font-mono mt-0.5">
              ikram@globalcrestsolutions.com
            </span>
            <div className="flex items-center gap-1.5 mt-2.5">
              <span className="h-2 w-2 rounded-full bg-gcs-emerald" />
              <span className="text-xs text-gcs-mint font-medium">
                Device Authenticated
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
                Identity Key Algorithm
              </span>
              <span className="font-mono text-gcs-mint">Curve25519 (ECDH)</span>
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
