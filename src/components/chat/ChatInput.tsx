'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/Button';
import {
  Paperclip,
  Smile,
  Mic,
  Send,
  Image,
  FileText,
  Music,
  Lock,
  Square,
  Trash2,
  Radio,
  ExternalLink,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ChatInputProps {
  onSendMessage: (content: string) => void;
  onSendVoiceNote?: () => void;
  onAttachFile?: (type: 'image' | 'video' | 'document' | 'audio') => void;
  onSendFile?: (file: File) => void;
  isSending?: boolean;
  disabled?: boolean;
  placeholder?: string;
}

export const ChatInput: React.FC<ChatInputProps> = ({
  onSendMessage,
  onAttachFile,
  onSendFile,
  isSending = false,
  disabled = false,
  placeholder = 'Type an end-to-end encrypted message...',
}) => {
  const [text, setText] = useState('');
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const attachMenuRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Close attachment menu on outside click or touch
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      if (attachMenuRef.current && !attachMenuRef.current.contains(event.target as Node)) {
        setShowAttachMenu(false);
      }
    };
    if (showAttachMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [showAttachMenu]);

  const handleSend = () => {
    if (!text.trim() || isSending || disabled) return;
    onSendMessage(text.trim());
    setText('');
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onSendFile?.(file);
      e.target.value = '';
    }
  };

  // Start Voice Note Recording via Web Audio API MediaRecorder
  const startRecording = async () => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      alert('Microphone access is not supported by your browser.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      audioChunksRef.current = [];
      const recorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : MediaRecorder.isTypeSupported('audio/ogg')
          ? 'audio/ogg'
          : '',
      });

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        if (audioChunksRef.current.length > 0) {
          const mime = recorder.mimeType || 'audio/webm';
          const ext = mime.includes('ogg') ? 'ogg' : 'webm';
          const audioBlob = new Blob(audioChunksRef.current, { type: mime });
          const audioFile = new File([audioBlob], `Voice-Note-${Date.now()}.${ext}`, {
            type: mime,
          });
          onSendFile?.(audioFile);
        }
      };

      recorder.start(250);
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
      setRecordingSeconds(0);

      recordingTimerRef.current = setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);
    } catch (err: any) {
      console.error('Microphone error:', err);
      alert('Microphone permission required for voice notes. Please grant permission in your browser.');
    }
  };

  // Stop Recording and Dispatch Audio File
  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
      }
    }
  };

  // Cancel Recording
  const cancelRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      audioChunksRef.current = [];
      mediaRecorderRef.current.stream.getTracks().forEach((track) => track.stop());
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
      }
    }
  };

  const formatRecordingTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const remaining = secs % 60;
    return `${mins}:${remaining.toString().padStart(2, '0')}`;
  };

  return (
    <div className="relative p-2 sm:p-3 bg-gcs-sidebar/95 border-t border-gcs-border/80 flex flex-col gap-1 select-none shrink-0 safe-bottom backdrop-blur-md">
      {/* Hidden Native File Pickers */}
      <input
        type="file"
        ref={imageInputRef}
        accept="image/*,video/*"
        onChange={handleFileSelect}
        className="hidden"
      />
      <input
        type="file"
        ref={audioInputRef}
        accept="audio/*,.mp3,.wav,.ogg,.m4a"
        onChange={handleFileSelect}
        className="hidden"
      />
      <input
        type="file"
        ref={docInputRef}
        accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip,.tar,.gz,*/*"
        onChange={handleFileSelect}
        className="hidden"
      />

      {/* Attachment Menu Popup */}
      {showAttachMenu && (
        <div
          ref={attachMenuRef}
          className="absolute bottom-16 sm:bottom-18 left-2 sm:left-4 z-40 bg-gcs-card/95 border border-gcs-border rounded-2xl p-2 shadow-2xl flex flex-col gap-1 animate-slide-up w-56 backdrop-blur-2xl"
        >
          <button
            type="button"
            onClick={() => {
              setShowAttachMenu(false);
              onAttachFile?.('image');
              imageInputRef.current?.click();
            }}
            className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-semibold text-gcs-text hover:bg-gcs-emerald/20 hover:text-gcs-mint transition-colors text-left active:scale-98 cursor-pointer"
          >
            <div className="h-7 w-7 rounded-lg bg-gcs-emerald/20 text-gcs-emerald flex items-center justify-center shrink-0">
              <Image className="w-4 h-4" />
            </div>
            <span>Photos & Videos</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setShowAttachMenu(false);
              onAttachFile?.('audio');
              audioInputRef.current?.click();
            }}
            className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-semibold text-gcs-text hover:bg-gcs-emerald/20 hover:text-gcs-mint transition-colors text-left active:scale-98 cursor-pointer"
          >
            <div className="h-7 w-7 rounded-lg bg-cyan-500/20 text-[#00F0FF] flex items-center justify-center shrink-0">
              <Music className="w-4 h-4" />
            </div>
            <span>Music & Audio Files</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setShowAttachMenu(false);
              onAttachFile?.('document');
              docInputRef.current?.click();
            }}
            className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-semibold text-gcs-text hover:bg-gcs-emerald/20 hover:text-gcs-mint transition-colors text-left active:scale-98 cursor-pointer"
          >
            <div className="h-7 w-7 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0">
              <FileText className="w-4 h-4" />
            </div>
            <span>Encrypted Document</span>
          </button>
        </div>
      )}

      {/* Main Input Row or Active Voice Recording Bar */}
      {isRecording ? (
        <div className="flex items-center justify-between gap-3 bg-gcs-card border border-red-500/40 rounded-2xl p-2 animate-pulse">
          <div className="flex items-center gap-2 text-red-400">
            <Radio className="w-4 h-4 animate-ping" />
            <span className="text-xs font-bold font-mono tracking-wider">
              REC {formatRecordingTime(recordingSeconds)}
            </span>
          </div>

          <span className="text-[11px] text-gcs-muted truncate">Recording encrypted voice note...</span>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={cancelRecording}
              className="p-2 rounded-full hover:bg-red-500/20 text-gcs-muted hover:text-red-400 transition-colors"
              title="Cancel"
            >
              <Trash2 className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={stopRecording}
              className="h-8 px-3 rounded-full bg-gcs-emerald hover:bg-[#00c28c] text-white font-bold text-xs flex items-center gap-1.5 shadow-md active:scale-95 transition-all"
              title="Send Voice Note"
            >
              <Send className="w-3.5 h-3.5 fill-current" />
              <span>Send</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-end gap-1.5 sm:gap-2 bg-gcs-card/90 border border-gcs-border focus-within:border-gcs-emerald focus-within:ring-1 focus-within:ring-gcs-emerald/30 rounded-2xl p-1 sm:p-1.5 transition-all shadow-inner">
          {/* Attachment Trigger */}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => setShowAttachMenu(!showAttachMenu)}
            className={cn(
              'h-9 w-9 text-gcs-muted hover:text-gcs-mint hover:bg-gcs-card/60 shrink-0 rounded-full transition-all',
              showAttachMenu && 'text-gcs-mint bg-gcs-emerald/20 rotate-45'
            )}
            aria-label="Attach File"
          >
            <Paperclip className="w-4 h-4" />
          </Button>

          {/* Text Input Area */}
          <textarea
            ref={inputRef}
            rows={1}
            value={text}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            disabled={disabled || isSending}
            placeholder={placeholder}
            className="flex-1 bg-transparent text-gcs-text placeholder:text-gcs-muted/60 text-base sm:text-sm focus:outline-none resize-none max-h-32 py-2 px-1.5 leading-relaxed select-text min-h-[38px]"
          />

          {/* Send or Voice Note Button */}
          {text.trim().length > 0 ? (
            <Button
              type="button"
              variant="primary"
              size="icon"
              onClick={handleSend}
              isLoading={isSending}
              disabled={disabled}
              className="h-9 w-9 shrink-0 rounded-full bg-gcs-emerald hover:bg-[#00c28c] text-white shadow-emerald-md transition-all active:scale-95"
              aria-label="Send Encrypted Message"
            >
              <Send className="w-4 h-4 text-white fill-current" />
            </Button>
          ) : (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={startRecording}
              disabled={disabled}
              className="h-9 w-9 text-gcs-muted hover:text-gcs-mint hover:bg-gcs-emerald/15 shrink-0 rounded-full transition-all active:scale-90"
              aria-label="Record Voice Note"
              title="Record Voice Note"
            >
              <Mic className="w-4 h-4" />
            </Button>
          )}
        </div>
      )}

      {/* Security Footer Banner */}
      <div className="flex items-center justify-center gap-1.5 text-[10px] sm:text-[11px] text-gcs-muted/70 pt-0.5 truncate">
        <Lock className="w-3 h-3 text-gcs-emerald shrink-0" />
        <span className="truncate">GCS Cyber-Shield • AES-256-GCM Zero-Plaintext Security</span>
      </div>
    </div>
  );
};
