'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/Button';
import {
  Paperclip,
  Smile,
  Mic,
  Send,
  Image as ImageIcon,
  FileText,
  Music,
  Lock,
  Square,
  Trash2,
  Radio,
  Camera,
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
  placeholder = 'Type a message',
}) => {
  const [text, setText] = useState('');
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const attachMenuRef = useRef<HTMLDivElement>(null);
  const emojiPickerRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);

  const QUICK_EMOJIS = ['👍', '❤️', '😂', '🔥', '🎉', '🙏', '👏', '💯', '🤝', '🚀', '🔐', '☕', '✨', '🤩', '🫡', '👀'];

  // Close menus on outside click or touch
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      if (attachMenuRef.current && !attachMenuRef.current.contains(event.target as Node)) {
        setShowAttachMenu(false);
      }
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(event.target as Node)) {
        setShowEmojiPicker(false);
      }
    };
    if (showAttachMenu || showEmojiPicker) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [showAttachMenu, showEmojiPicker]);

  const handleEmojiClick = (emoji: string) => {
    setText((prev) => prev + emoji);
    if (inputRef.current) {
      inputRef.current.focus();
    }
  };

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

      mediaRecorderRef.current = recorder;
      recorder.start(100);
      setIsRecording(true);
      setRecordingSeconds(0);

      recordingTimerRef.current = setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);
    } catch (err) {
      console.error('Failed to access microphone:', err);
      alert('Microphone permission was denied or not available.');
    }
  };

  const stopRecording = (discard = false) => {
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }

    if (discard) {
      audioChunksRef.current = [];
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
  };

  const formatRecordingTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const remaining = secs % 60;
    return `${mins}:${remaining < 10 ? '0' : ''}${remaining}`;
  };

  return (
    <div className="p-2 sm:p-3 bg-[#202c33] border-t border-gcs-border/40 select-none relative z-20 shrink-0 safe-bottom">
      {/* Hidden native file pickers */}
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*,video/*"
        className="hidden"
        onChange={handleFileSelect}
      />
      <input
        ref={docInputRef}
        type="file"
        accept=".pdf,.doc,.docx,.txt,.zip,.tar,.gz,.xls,.xlsx"
        className="hidden"
        onChange={handleFileSelect}
      />
      <input
        ref={audioInputRef}
        type="file"
        accept="audio/*"
        className="hidden"
        onChange={handleFileSelect}
      />

      {/* WhatsApp Floating Attachment Drawer Menu */}
      {showAttachMenu && (
        <div
          ref={attachMenuRef}
          className="absolute bottom-full mb-3 left-4 bg-[#233138] border border-gcs-border/60 rounded-3xl p-3 shadow-2xl z-50 flex items-center gap-3 backdrop-blur-xl animate-fade-in"
        >
          {/* Document Button */}
          <button
            type="button"
            onClick={() => {
              setShowAttachMenu(false);
              docInputRef.current?.click();
            }}
            className="flex flex-col items-center gap-1.5 p-2 rounded-2xl hover:bg-[#182229] transition-all group"
          >
            <div className="w-11 h-11 rounded-full bg-[#7f66ff] flex items-center justify-center text-white shadow-md group-hover:scale-105 transition-transform">
              <FileText className="w-5 h-5" />
            </div>
            <span className="text-[11px] text-[#8696a0] group-hover:text-white">Document</span>
          </button>

          {/* Photos & Videos Button */}
          <button
            type="button"
            onClick={() => {
              setShowAttachMenu(false);
              imageInputRef.current?.click();
            }}
            className="flex flex-col items-center gap-1.5 p-2 rounded-2xl hover:bg-[#182229] transition-all group"
          >
            <div className="w-11 h-11 rounded-full bg-[#007bfc] flex items-center justify-center text-white shadow-md group-hover:scale-105 transition-transform">
              <ImageIcon className="w-5 h-5" />
            </div>
            <span className="text-[11px] text-[#8696a0] group-hover:text-white">Gallery</span>
          </button>

          {/* Camera Button */}
          <button
            type="button"
            onClick={() => {
              setShowAttachMenu(false);
              imageInputRef.current?.click();
            }}
            className="flex flex-col items-center gap-1.5 p-2 rounded-2xl hover:bg-[#182229] transition-all group"
          >
            <div className="w-11 h-11 rounded-full bg-[#d3396d] flex items-center justify-center text-white shadow-md group-hover:scale-105 transition-transform">
              <Camera className="w-5 h-5" />
            </div>
            <span className="text-[11px] text-[#8696a0] group-hover:text-white">Camera</span>
          </button>

          {/* Audio Button */}
          <button
            type="button"
            onClick={() => {
              setShowAttachMenu(false);
              audioInputRef.current?.click();
            }}
            className="flex flex-col items-center gap-1.5 p-2 rounded-2xl hover:bg-[#182229] transition-all group"
          >
            <div className="w-11 h-11 rounded-full bg-[#e86638] flex items-center justify-center text-white shadow-md group-hover:scale-105 transition-transform">
              <Music className="w-5 h-5" />
            </div>
            <span className="text-[11px] text-[#8696a0] group-hover:text-white">Audio</span>
          </button>
        </div>
      )}

      {/* Main WhatsApp Compose Bar */}
      <div className="flex items-end gap-2 max-w-5xl mx-auto">
        {isRecording ? (
          /* WhatsApp Voice Recording UI */
          <div className="flex-1 h-12 bg-[#2a3942] rounded-3xl px-4 flex items-center justify-between shadow-inner">
            <div className="flex items-center gap-3">
              <span className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
              <span className="text-sm font-mono text-white font-semibold">
                {formatRecordingTime(recordingSeconds)}
              </span>
              <span className="text-xs text-[#8696a0] hidden xs:inline">
                Recording encrypted audio...
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => stopRecording(true)}
                className="p-2 text-[#8696a0] hover:text-red-400 hover:bg-[#202c33] rounded-full transition-colors"
                title="Discard Recording"
              >
                <Trash2 className="w-5 h-5" />
              </button>
              <button
                type="button"
                onClick={() => stopRecording(false)}
                className="w-9 h-9 rounded-full bg-[#00a884] text-white flex items-center justify-center hover:bg-[#008f6f] shadow-md transition-all active:scale-95"
                title="Send Voice Note"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        ) : (
          /* Text Input Pill */
          <div className="flex-1 bg-[#2a3942] rounded-3xl px-3 py-1.5 flex items-end gap-1.5 shadow-inner relative">
            {/* Quick Emoji Picker Popover */}
            {showEmojiPicker && (
              <div
                ref={emojiPickerRef}
                className="absolute bottom-full mb-3 left-0 bg-[#233138] border border-gcs-border/60 rounded-2xl p-2.5 shadow-2xl z-50 grid grid-cols-8 gap-2 backdrop-blur-xl animate-fade-in"
              >
                {QUICK_EMOJIS.map((em) => (
                  <button
                    key={em}
                    type="button"
                    onClick={() => handleEmojiClick(em)}
                    className="w-8 h-8 rounded-xl hover:bg-white/10 flex items-center justify-center text-lg active:scale-125 transition-transform"
                  >
                    {em}
                  </button>
                ))}
              </div>
            )}

            <button
              type="button"
              onClick={() => setShowEmojiPicker(!showEmojiPicker)}
              className={cn(
                'p-1.5 rounded-full transition-colors shrink-0',
                showEmojiPicker ? 'text-[#00a884]' : 'text-[#8696a0] hover:text-white'
              )}
              title="Emoji"
            >
              <Smile className="w-5 h-5" />
            </button>

            <button
              type="button"
              onClick={() => setShowAttachMenu(!showAttachMenu)}
              className={cn(
                'p-1.5 rounded-full transition-colors shrink-0',
                showAttachMenu ? 'text-[#00a884]' : 'text-[#8696a0] hover:text-white'
              )}
              title="Attach File"
            >
              <Paperclip className="w-5 h-5 -rotate-45" />
            </button>

            <textarea
              ref={inputRef}
              rows={1}
              value={text}
              disabled={disabled}
              placeholder={placeholder}
              onChange={handleInput}
              onKeyDown={handleKeyDown}
              className="flex-1 bg-transparent text-white placeholder-[#8696a0] text-base sm:text-[15px] outline-none resize-none max-h-32 min-h-[28px] py-1 leading-relaxed"
            />
          </div>
        )}

        {/* WhatsApp Right Action: Mic or Send Button */}
        {!isRecording && (
          <div>
            {text.trim().length > 0 ? (
              <button
                type="button"
                onClick={handleSend}
                disabled={disabled || isSending}
                className="w-12 h-12 rounded-full bg-[#00a884] hover:bg-[#008f6f] text-white flex items-center justify-center shadow-lg shadow-[#00a884]/30 active:scale-90 transition-all shrink-0"
                title="Send Message"
              >
                <Send className="w-5 h-5 ml-0.5" />
              </button>
            ) : (
              <button
                type="button"
                onClick={startRecording}
                disabled={disabled}
                className="w-12 h-12 rounded-full bg-[#00a884] hover:bg-[#008f6f] text-white flex items-center justify-center shadow-lg shadow-[#00a884]/30 active:scale-90 transition-all shrink-0"
                title="Hold or tap to record voice note"
              >
                <Mic className="w-5 h-5" />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
