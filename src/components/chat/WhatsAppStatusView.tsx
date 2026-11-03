'use client';

import React, { useState } from 'react';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import {
  Plus,
  Camera,
  Eye,
  Clock,
  X,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';

export interface StatusItem {
  id: string;
  userName: string;
  userEmail: string;
  avatarSrc?: string | null;
  text: string;
  timestamp: string;
  viewed: boolean;
  color?: string;
}

export interface WhatsAppStatusViewProps {
  currentUserName: string;
  currentUserEmail: string;
}

export const WhatsAppStatusView: React.FC<WhatsAppStatusViewProps> = ({
  currentUserName,
  currentUserEmail,
}) => {
  const [activeStory, setActiveStory] = useState<StatusItem | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [myStatusText, setMyStatusText] = useState('Connect Freely. Communicate Securely. 🔐');
  const [newStatusInput, setNewStatusInput] = useState('');

  // Sample real-time organization status updates
  const [statusList, setStatusList] = useState<StatusItem[]>([
    {
      id: '1',
      userName: 'Global Crest Security',
      userEmail: 'security@globalcrestsolutions.com',
      text: '🛡️ DTLS-SRTP 256-bit media and X3DH ratcheting active across all communication nodes.',
      timestamp: 'Today, 2:15 PM',
      viewed: false,
      color: '#005c4b',
    },
    {
      id: '2',
      userName: 'Lead Architect',
      userEmail: 'architect@globalcrestsolutions.com',
      text: 'Zero-knowledge browser cryptography verified with zero server-side plaintext storage.',
      timestamp: 'Today, 11:30 AM',
      viewed: false,
      color: '#0f3a2c',
    },
    {
      id: '3',
      userName: 'System Monitor',
      userEmail: 'devops@globalcrestsolutions.com',
      text: 'All WebRTC STUN/TURN relays operating with <18ms peer-to-peer latency.',
      timestamp: 'Yesterday, 8:45 PM',
      viewed: true,
      color: '#1a362b',
    },
  ]);

  const handleOpenStory = (story: StatusItem) => {
    setActiveStory(story);
    // Mark as viewed
    setStatusList((prev) =>
      prev.map((s) => (s.id === story.id ? { ...s, viewed: true } : s))
    );
  };

  const handlePostStatus = () => {
    if (!newStatusInput.trim()) return;
    setMyStatusText(newStatusInput.trim());
    setIsAddModalOpen(false);
    setNewStatusInput('');
  };

  const recentUpdates = statusList.filter((s) => !s.viewed);
  const viewedUpdates = statusList.filter((s) => s.viewed);

  return (
    <div className="flex-1 overflow-y-auto flex flex-col divide-y divide-gcs-border/20 select-none pb-20 md:pb-6">
      {/* My Status Section */}
      <div className="p-3.5 sm:p-4 hover:bg-gcs-card/40 transition-colors flex items-center justify-between">
        <div
          className="flex items-center gap-3.5 flex-1 cursor-pointer"
          onClick={() =>
            handleOpenStory({
              id: 'my-status',
              userName: currentUserName,
              userEmail: currentUserEmail,
              text: myStatusText,
              timestamp: 'Just now',
              viewed: false,
              color: '#005c4b',
            })
          }
        >
          <div className="relative">
            <Avatar name={currentUserName} size="md" status="online" />
            <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-gcs-emerald text-white flex items-center justify-center border-2 border-gcs-sidebar shadow-md">
              <Plus className="w-3.5 h-3.5 stroke-[3]" />
            </div>
          </div>
          <div className="flex flex-col text-left min-w-0">
            <span className="text-sm font-semibold text-gcs-text leading-tight">
              My Status
            </span>
            <span className="text-xs text-gcs-muted truncate mt-0.5">
              {myStatusText}
            </span>
          </div>
        </div>

        <Button
          variant="ghost"
          size="icon"
          onClick={() => setIsAddModalOpen(true)}
          className="h-9 w-9 text-gcs-muted hover:text-gcs-mint hover:bg-gcs-card rounded-full shrink-0"
          title="Add Status"
        >
          <Camera className="w-4.5 h-4.5" />
        </Button>
      </div>

      {/* Recent Updates Header */}
      {recentUpdates.length > 0 && (
        <div className="flex flex-col">
          <div className="px-4 py-2 bg-gcs-sidebar/60 text-[11px] font-semibold text-gcs-muted uppercase tracking-wider">
            Recent Updates
          </div>
          {recentUpdates.map((item) => (
            <div
              key={item.id}
              onClick={() => handleOpenStory(item)}
              className="p-3.5 px-4 flex items-center gap-3.5 hover:bg-gcs-card/50 cursor-pointer transition-colors"
            >
              <div className="relative p-0.5 rounded-full border-2 border-gcs-emerald">
                <Avatar name={item.userName} size="md" />
              </div>
              <div className="flex flex-col min-w-0 flex-1">
                <span className="text-sm font-semibold text-gcs-text truncate">
                  {item.userName}
                </span>
                <span className="text-xs text-gcs-muted flex items-center gap-1">
                  <Clock className="w-3 h-3 text-gcs-muted" />
                  {item.timestamp}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Viewed Updates Header */}
      {viewedUpdates.length > 0 && (
        <div className="flex flex-col">
          <div className="px-4 py-2 bg-gcs-sidebar/60 text-[11px] font-semibold text-gcs-muted uppercase tracking-wider">
            Viewed Updates
          </div>
          {viewedUpdates.map((item) => (
            <div
              key={item.id}
              onClick={() => handleOpenStory(item)}
              className="p-3.5 px-4 flex items-center gap-3.5 hover:bg-gcs-card/30 cursor-pointer transition-colors opacity-75 hover:opacity-100"
            >
              <div className="relative p-0.5 rounded-full border-2 border-gcs-border">
                <Avatar name={item.userName} size="md" />
              </div>
              <div className="flex flex-col min-w-0 flex-1">
                <span className="text-sm font-medium text-gcs-text truncate">
                  {item.userName}
                </span>
                <span className="text-xs text-gcs-muted flex items-center gap-1">
                  <Clock className="w-3 h-3 text-gcs-muted" />
                  {item.timestamp}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* WhatsApp Status Story Viewer Modal */}
      {activeStory && (
        <div className="fixed inset-0 z-50 bg-black/95 flex flex-col items-center justify-between p-4 sm:p-6 animate-fade-in safe-top safe-bottom">
          {/* Top Progress bar */}
          <div className="w-full max-w-md flex flex-col gap-3">
            <div className="w-full h-1 bg-white/20 rounded-full overflow-hidden">
              <div className="h-full bg-gcs-emerald animate-progress" />
            </div>

            {/* Top User Bar */}
            <div className="flex items-center justify-between text-white">
              <div className="flex items-center gap-3 min-w-0">
                <Avatar name={activeStory.userName} size="sm" />
                <div className="flex flex-col min-w-0">
                  <span className="text-sm font-bold truncate">
                    {activeStory.userName}
                  </span>
                  <span className="text-[11px] text-white/70">
                    {activeStory.timestamp}
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setActiveStory(null)}
                className="p-2 rounded-full hover:bg-white/10 text-white/80 hover:text-white"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
          </div>

          {/* Story Body */}
          <div className="w-full max-w-md flex-1 flex flex-col items-center justify-center p-6 text-center">
            <div
              className="w-full p-8 rounded-3xl shadow-2xl flex flex-col items-center justify-center text-white min-h-[300px]"
              style={{ backgroundColor: activeStory.color || '#005c4b' }}
            >
              <ShieldCheck className="w-12 h-12 text-white/80 mb-4" />
              <p className="text-lg sm:text-xl font-medium leading-relaxed max-w-xs break-words">
                {activeStory.text}
              </p>
            </div>
          </div>

          {/* Footer note */}
          <div className="w-full max-w-md text-center text-xs text-white/50 flex items-center justify-center gap-1.5 pb-2">
            <Eye className="w-3.5 h-3.5" />
            <span>End-to-End Encrypted Status Update</span>
          </div>
        </div>
      )}

      {/* Add Status Modal */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title="Add Status Update"
        description="Share a secure 24-hour status update visible to your authorized team contacts."
      >
        <div className="flex flex-col gap-4 text-sm mt-1">
          <textarea
            rows={3}
            placeholder="What's happening? Type your status..."
            value={newStatusInput}
            onChange={(e) => setNewStatusInput(e.target.value)}
            className="w-full p-3 bg-gcs-card text-gcs-text border border-gcs-border rounded-xl text-sm focus:outline-none focus:border-gcs-emerald resize-none"
          />

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" size="sm" onClick={() => setIsAddModalOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              disabled={!newStatusInput.trim()}
              onClick={handlePostStatus}
              className="bg-gcs-emerald hover:bg-[#00c28c] px-4"
            >
              Post Status
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
