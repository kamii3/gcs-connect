'use client';

import React from 'react';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import {
  Phone,
  Video,
  PhoneIncoming,
  PhoneOutgoing,
  PhoneMissed,
  Link2,
  Lock,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export interface CallLogItem {
  id: string;
  name: string;
  email: string;
  avatarSrc?: string | null;
  type: 'voice' | 'video';
  direction: 'incoming' | 'outgoing' | 'missed';
  time: string;
  duration?: string;
}

export interface WhatsAppCallsViewProps {
  onStartCall: (type: 'voice' | 'video', contactName: string) => void;
  onNewCall: () => void;
}

export const WhatsAppCallsView: React.FC<WhatsAppCallsViewProps> = ({
  onStartCall,
  onNewCall,
}) => {
  const callLogs: CallLogItem[] = [
    {
      id: 'c1',
      name: 'System Security Relay',
      email: 'relay@globalcrestsolutions.com',
      type: 'voice',
      direction: 'incoming',
      time: 'Today, 3:45 PM',
      duration: '4m 12s',
    },
    {
      id: 'c2',
      name: 'DevOps Coordinator',
      email: 'devops@globalcrestsolutions.com',
      type: 'video',
      direction: 'outgoing',
      time: 'Today, 11:20 AM',
      duration: '12m 38s',
    },
    {
      id: 'c3',
      name: 'Cryptographic Lead',
      email: 'lead@globalcrestsolutions.com',
      type: 'voice',
      direction: 'missed',
      time: 'Yesterday, 6:15 PM',
    },
    {
      id: 'c4',
      name: 'Hostinger Infrastructure',
      email: 'admin@globalcrestsolutions.com',
      type: 'video',
      direction: 'incoming',
      time: 'October 30, 2:10 PM',
      duration: '8m 05s',
    },
  ];

  return (
    <div className="flex-1 overflow-y-auto flex flex-col divide-y divide-gcs-border/20 select-none pb-20 md:pb-6">
      {/* Create Call Link Section */}
      <div
        onClick={onNewCall}
        className="p-3.5 sm:p-4 hover:bg-gcs-card/40 transition-colors flex items-center justify-between cursor-pointer"
      >
        <div className="flex items-center gap-3.5 min-w-0">
          <div className="w-11 h-11 rounded-full bg-gcs-emerald flex items-center justify-center text-white shadow-emerald-sm shrink-0">
            <Link2 className="w-5 h-5 -rotate-45" />
          </div>
          <div className="flex flex-col text-left min-w-0">
            <span className="text-sm font-semibold text-gcs-text leading-tight">
              Create a call link
            </span>
            <span className="text-xs text-gcs-muted truncate mt-0.5">
              Share a link for your GCS encrypted call
            </span>
          </div>
        </div>
      </div>

      {/* Recent Calls Section */}
      <div className="flex flex-col">
        <div className="px-4 py-2 bg-gcs-sidebar/60 text-[11px] font-semibold text-gcs-muted uppercase tracking-wider">
          Recent Calls
        </div>

        {callLogs.map((log) => {
          const isMissed = log.direction === 'missed';
          return (
            <div
              key={log.id}
              className="p-3.5 px-4 flex items-center justify-between hover:bg-gcs-card/50 transition-colors"
            >
              <div className="flex items-center gap-3.5 min-w-0 flex-1">
                <Avatar name={log.name} size="md" />

                <div className="flex flex-col min-w-0 flex-1">
                  <span
                    className={cn(
                      'text-sm font-semibold truncate',
                      isMissed ? 'text-red-400' : 'text-gcs-text'
                    )}
                  >
                    {log.name}
                  </span>

                  <div className="flex items-center gap-1.5 text-xs text-gcs-muted mt-0.5">
                    {log.direction === 'incoming' && (
                      <PhoneIncoming className="w-3.5 h-3.5 text-gcs-emerald shrink-0" />
                    )}
                    {log.direction === 'outgoing' && (
                      <PhoneOutgoing className="w-3.5 h-3.5 text-[#34B7F1] shrink-0" />
                    )}
                    {log.direction === 'missed' && (
                      <PhoneMissed className="w-3.5 h-3.5 text-red-400 shrink-0" />
                    )}

                    <span className="truncate">
                      {log.time} {log.duration ? `(${log.duration})` : ''}
                    </span>
                  </div>
                </div>
              </div>

              {/* Call Action Buttons */}
              <div className="flex items-center gap-1 shrink-0 ml-2">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => onStartCall('voice', log.name)}
                  className="h-9 w-9 text-gcs-emerald hover:text-gcs-mint hover:bg-gcs-card rounded-full"
                  title="Audio Call"
                >
                  <Phone className="w-4.5 h-4.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => onStartCall('video', log.name)}
                  className="h-9 w-9 text-gcs-emerald hover:text-gcs-mint hover:bg-gcs-card rounded-full"
                  title="Video Call"
                >
                  <Video className="w-4.5 h-4.5" />
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Security Footer */}
      <div className="p-4 text-center text-xs text-gcs-muted flex items-center justify-center gap-1.5">
        <Lock className="w-3.5 h-3.5 text-gcs-emerald" />
        <span>Your personal and group calls are end-to-end encrypted</span>
      </div>
    </div>
  );
};
