'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { MessageBubble } from '@/components/chat/MessageBubble';
import { Shield, Lock, Phone, Video, Send, Check } from 'lucide-react';

export const DesignSystemShowcase: React.FC = () => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [inputText, setInputText] = useState('');
  const { toast } = useToast();

  const colors = [
    { name: 'Primary Background', hex: '#121816', bgClass: 'bg-gcs-bg' },
    { name: 'Emerald Accent', hex: '#00A879', bgClass: 'bg-gcs-emerald' },
    { name: 'Pale Mint', hex: '#B6F1D9', bgClass: 'bg-gcs-mint' },
    { name: 'Card Background', hex: '#1C2420', bgClass: 'bg-gcs-card' },
    { name: 'Sidebar Background', hex: '#151D19', bgClass: 'bg-gcs-sidebar' },
    { name: 'Message Sent', hex: '#205B45', bgClass: 'bg-gcs-sent' },
    { name: 'Message Received', hex: '#25372E', bgClass: 'bg-gcs-received' },
    { name: 'Border Emerald', hex: '#31463A', bgClass: 'bg-gcs-border' },
    { name: 'Status Error', hex: '#D94D55', bgClass: 'bg-gcs-error' },
    { name: 'Status Warning', hex: '#D99B31', bgClass: 'bg-gcs-warning' },
  ];

  return (
    <div className="w-full max-w-5xl mx-auto p-6 flex flex-col gap-8 text-gcs-text">
      {/* Header Banner */}
      <div className="p-6 rounded-2xl bg-gcs-card border border-gcs-border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="h-6 w-6 rounded-lg bg-gcs-emerald/20 border border-gcs-emerald/40 flex items-center justify-center text-gcs-emerald">
              <Shield className="w-3.5 h-3.5" />
            </span>
            <h1 className="text-xl font-bold tracking-tight text-gcs-text">
              GCS CONNECT Design System
            </h1>
          </div>
          <p className="text-xs text-gcs-muted">
            Official Black & Emerald Component Architecture & Visual Guidelines
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="e2ee">Double Ratchet E2EE</Badge>
          <Badge variant="emerald">v1.0.0</Badge>
        </div>
      </div>

      {/* Palette Tokens */}
      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold tracking-wider uppercase text-gcs-mint">
          1. Color Palette Tokens
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
          {colors.map((c) => (
            <div
              key={c.hex}
              className="p-3 rounded-xl bg-gcs-card border border-gcs-border flex flex-col gap-2"
            >
              <div
                className={`h-12 w-full rounded-lg ${c.bgClass} border border-white/10 shadow-inner`}
              />
              <div>
                <span className="text-xs font-semibold block text-gcs-text truncate">
                  {c.name}
                </span>
                <span className="text-[11px] font-mono text-gcs-muted block">
                  {c.hex}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Buttons */}
      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold tracking-wider uppercase text-gcs-mint">
          2. Action Buttons & Micro-Interactions
        </h2>
        <div className="p-5 rounded-2xl bg-gcs-card border border-gcs-border flex flex-wrap items-center gap-3">
          <Button variant="primary">Primary Emerald</Button>
          <Button variant="secondary">Secondary Card</Button>
          <Button variant="outline">Outline Border</Button>
          <Button variant="ghost">Ghost Muted</Button>
          <Button variant="danger">Danger Hangup</Button>
          <Button variant="primary" isLoading>
            Encrypting...
          </Button>
          <Button
            variant="primary"
            size="icon"
            onClick={() =>
              toast({
                type: 'success',
                message: 'Encrypted Double Ratchet session active',
              })
            }
          >
            <Send className="w-4 h-4 text-gcs-bg" />
          </Button>
          <Button
            variant="secondary"
            size="icon"
            onClick={() => setIsModalOpen(true)}
          >
            <Lock className="w-4 h-4 text-gcs-mint" />
          </Button>
        </div>
      </div>

      {/* Interactive Inputs */}
      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold tracking-wider uppercase text-gcs-mint">
          3. Input Components
        </h2>
        <div className="p-5 rounded-2xl bg-gcs-card border border-gcs-border grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label="Recipient Identity Key or Email"
            placeholder="alice@globalcrestsolutions.com"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            helperText="Enter a registered GCS CONNECT user account."
          />
          <Input
            label="One-Time Prekey Token"
            placeholder="OPK-92819-ABC"
            error={inputText.length > 20 ? 'Prekey length exceeded' : undefined}
            helperText="Validated via Curve25519 public key parameters."
          />
        </div>
      </div>

      {/* Avatars & Badges */}
      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold tracking-wider uppercase text-gcs-mint">
          4. Avatars & Presence Indicators
        </h2>
        <div className="p-5 rounded-2xl bg-gcs-card border border-gcs-border flex flex-wrap items-center gap-6">
          <Avatar name="Alice Walker" size="xl" status="online" />
          <Avatar name="Bob Vance" size="lg" status="away" />
          <Avatar name="Charlie Tech" size="md" status="offline" />
          <Avatar name="Dan GCS" size="sm" status="busy" />
          <Avatar name="Eve Secret" size="xs" status="none" />
        </div>
      </div>

      {/* Message Bubbles Preview */}
      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold tracking-wider uppercase text-gcs-mint">
          5. WhatsApp-Inspired Encrypted Chat Bubbles
        </h2>
        <div className="p-5 rounded-2xl bg-gcs-sidebar border border-gcs-border flex flex-col gap-1 max-w-xl">
          <MessageBubble
            id="msg-1"
            content="Hello! Have you initialized the Double Ratchet session for GCS CONNECT?"
            timestamp={Date.now() - 3600000}
            isSentByMe={false}
          />
          <MessageBubble
            id="msg-2"
            content="Yes, verified with AES-256-GCM. All plaintext is encrypted client-side before leaving our browsers."
            timestamp={Date.now() - 1800000}
            isSentByMe={true}
            status="read"
            replyTo={{
              senderName: 'Alice Walker',
              content: 'Hello! Have you initialized the Double Ratchet session...',
            }}
            reactions={[{ emoji: '🔒', count: 1, hasReacted: true }]}
          />
        </div>
      </div>

      {/* Test Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Security & Verification Matrix"
        description="Verify cryptographic safety numbers and device fingerprint."
        footer={
          <>
            <Button variant="ghost" onClick={() => setIsModalOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                setIsModalOpen(false);
                toast({
                  type: 'success',
                  message: 'Device identity fingerprint verified successfully',
                });
              }}
            >
              Verify Safety Numbers
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3 font-mono text-xs">
          <p className="text-gcs-muted font-sans text-xs">
            To ensure zero-knowledge privacy between your device and your contact,
            verify that these 60 numbers match their screen:
          </p>
          <div className="p-3 rounded-lg bg-gcs-bg border border-gcs-border text-gcs-mint tracking-widest text-center leading-loose">
            91823 48102 93810 49102 38192<br />
            10482 93810 48192 01928 38192
          </div>
        </div>
      </Modal>
    </div>
  );
};
