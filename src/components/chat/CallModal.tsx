'use client';

import React, { useState, useEffect } from 'react';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Phone, PhoneOff, Mic, MicOff, Video, VideoOff, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface CallModalProps {
  isOpen: boolean;
  callType: 'voice' | 'video';
  status: 'incoming' | 'outgoing' | 'connected';
  contactName: string;
  avatarSrc?: string | null;
  onAccept?: () => void;
  onReject?: () => void;
  onEndCall?: () => void;
  onToggleMute?: (muted: boolean) => void;
  onToggleVideo?: (videoOff: boolean) => void;
  localVideoRef?: React.RefObject<HTMLVideoElement>;
  remoteVideoRef?: React.RefObject<HTMLVideoElement>;
}

export const CallModal: React.FC<CallModalProps> = ({
  isOpen,
  callType,
  status,
  contactName,
  avatarSrc,
  onAccept,
  onReject,
  onEndCall,
  onToggleMute,
  onToggleVideo,
  localVideoRef,
  remoteVideoRef,
}) => {
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [seconds, setSeconds] = useState(0);

  const handleToggleMute = () => {
    const nextState = !isMuted;
    setIsMuted(nextState);
    onToggleMute?.(nextState);
  };

  const handleToggleVideo = () => {
    const nextState = !isVideoOff;
    setIsVideoOff(nextState);
    onToggleVideo?.(nextState);
  };

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (status === 'connected') {
      interval = setInterval(() => setSeconds((s) => s + 1), 1000);
    } else {
      setSeconds(0);
    }
    return () => clearInterval(interval);
  }, [status]);

  if (!isOpen) return null;

  const formatDuration = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60)
      .toString()
      .padStart(2, '0');
    const secs = (totalSeconds % 60).toString().padStart(2, '0');
    return `${mins}:${secs}`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md animate-fade-in safe-bottom">
      <div className="relative w-full max-w-lg h-[88dvh] sm:h-[520px] bg-gcs-card border border-gcs-border rounded-3xl shadow-2xl overflow-hidden flex flex-col justify-between p-4 sm:p-6">
        {/* Video Canvases */}
        {callType === 'video' && status === 'connected' && (
          <div className="absolute inset-0 bg-black flex items-center justify-center">
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              className="w-full h-full object-cover"
            />
            <div className="absolute top-4 right-4 w-32 h-44 bg-gcs-sidebar rounded-xl border border-gcs-border/80 overflow-hidden shadow-lg">
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
              />
            </div>
          </div>
        )}

        {/* Top Header */}
        <div className="relative z-10 flex items-center justify-between text-xs text-gcs-muted">
          <div className="flex items-center gap-1.5 bg-gcs-bg/70 px-2.5 py-1 rounded-full border border-gcs-border/60 backdrop-blur-xs">
            <ShieldCheck className="w-3.5 h-3.5 text-gcs-emerald" />
            <span className="font-mono text-[10px] text-gcs-mint">
              DTLS-SRTP ENCRYPTED
            </span>
          </div>
          {status === 'connected' && (
            <span className="font-mono text-sm text-gcs-text font-bold bg-gcs-bg/70 px-2.5 py-1 rounded-full border border-gcs-border/60">
              {formatDuration(seconds)}
            </span>
          )}
        </div>

        {/* Center Contact Summary (Visible when voice or connecting) */}
        {!(callType === 'video' && status === 'connected') && (
          <div className="relative z-10 flex flex-col items-center justify-center gap-4 my-auto">
            <div className="relative">
              <Avatar src={avatarSrc} name={contactName} size="xl" className="h-24 w-24 text-2xl" />
              {status !== 'connected' && (
                <div className="absolute inset-0 rounded-full border-2 border-gcs-emerald/50 animate-ping" />
              )}
            </div>

            <div className="text-center">
              <h2 className="text-xl font-bold text-gcs-text">{contactName}</h2>
              <p className="text-sm text-gcs-muted mt-1 capitalize font-medium">
                {status === 'incoming' && 'Incoming Call...'}
                {status === 'outgoing' && 'Calling...'}
                {status === 'connected' && `${callType} Call Connected`}
              </p>
            </div>
          </div>
        )}

        {/* Bottom Control Bar */}
        <div className="relative z-10 flex items-center justify-center gap-4 pt-4 border-t border-gcs-border/40 bg-gcs-card/75 backdrop-blur-sm -mx-6 -mb-6 p-6">
          {status === 'incoming' ? (
            <div className="flex items-center gap-10">
              <Button
                variant="danger"
                size="icon"
                onClick={onReject}
                className="h-14 w-14 rounded-full shadow-lg"
                aria-label="Decline Call"
              >
                <PhoneOff className="w-6 h-6 text-white" />
              </Button>
              <Button
                variant="primary"
                size="icon"
                onClick={onAccept}
                className="h-14 w-14 rounded-full shadow-lg bg-gcs-emerald hover:bg-[#00c28c]"
                aria-label="Accept Call"
              >
                <Phone className="w-6 h-6 text-gcs-bg" />
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-4">
              <Button
                variant="secondary"
                size="icon"
                onClick={handleToggleMute}
                className={cn(
                  'h-12 w-12 rounded-full',
                  isMuted && 'bg-gcs-error/20 border-gcs-error text-gcs-error'
                )}
                aria-label={isMuted ? 'Unmute Microphone' : 'Mute Microphone'}
              >
                {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
              </Button>

              {callType === 'video' && (
                <Button
                  variant="secondary"
                  size="icon"
                  onClick={handleToggleVideo}
                  className={cn(
                    'h-12 w-12 rounded-full',
                    isVideoOff && 'bg-gcs-error/20 border-gcs-error text-gcs-error'
                  )}
                  aria-label={isVideoOff ? 'Enable Camera' : 'Disable Camera'}
                >
                  {isVideoOff ? <VideoOff className="w-5 h-5" /> : <Video className="w-5 h-5" />}
                </Button>
              )}

              <Button
                variant="danger"
                size="icon"
                onClick={onEndCall}
                className="h-12 w-12 rounded-full shadow-lg ml-2"
                aria-label="Hang Up"
              >
                <PhoneOff className="w-5 h-5 text-white" />
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
