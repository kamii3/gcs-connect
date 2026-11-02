'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/Button';
import { Paperclip, Smile, Mic, Send, Image, FileText, Video, Lock } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ChatInputProps {
  onSendMessage: (content: string) => void;
  onSendVoiceNote?: () => void;
  onAttachFile?: (type: 'image' | 'video' | 'document') => void;
  isSending?: boolean;
  disabled?: boolean;
  placeholder?: string;
}

export const ChatInput: React.FC<ChatInputProps> = ({
  onSendMessage,
  onSendVoiceNote,
  onAttachFile,
  isSending = false,
  disabled = false,
  placeholder = 'Type an end-to-end encrypted message...',
}) => {
  const [text, setText] = useState('');
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

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

  return (
    <div className="relative p-3 bg-gcs-sidebar border-t border-gcs-border flex flex-col gap-1 select-none">
      {/* Attachment Menu Popup */}
      {showAttachMenu && (
        <div className="absolute bottom-18 left-4 z-40 bg-gcs-card border border-gcs-border rounded-xl p-2 shadow-card flex flex-col gap-1 animate-slide-up w-44">
          <button
            onClick={() => {
              onAttachFile?.('image');
              setShowAttachMenu(false);
            }}
            className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-gcs-text hover:bg-gcs-emerald/15 hover:text-gcs-mint transition-colors text-left"
          >
            <Image className="w-4 h-4 text-gcs-emerald" />
            <span>Photos & Videos</span>
          </button>
          <button
            onClick={() => {
              onAttachFile?.('document');
              setShowAttachMenu(false);
            }}
            className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-gcs-text hover:bg-gcs-emerald/15 hover:text-gcs-mint transition-colors text-left"
          >
            <FileText className="w-4 h-4 text-gcs-mint" />
            <span>Encrypted Document</span>
          </button>
        </div>
      )}

      {/* Main Input Row */}
      <div className="flex items-end gap-2 bg-gcs-card border border-gcs-border/80 focus-within:border-gcs-emerald rounded-2xl p-1.5 transition-colors">
        {/* Emoji Button */}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-9 w-9 text-gcs-muted hover:text-gcs-text shrink-0 rounded-full"
          aria-label="Insert Emoji"
        >
          <Smile className="w-5 h-5" />
        </Button>

        {/* Attachment Trigger */}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => setShowAttachMenu(!showAttachMenu)}
          className={cn(
            'h-9 w-9 text-gcs-muted hover:text-gcs-text shrink-0 rounded-full',
            showAttachMenu && 'text-gcs-mint bg-gcs-emerald/15'
          )}
          aria-label="Attach File"
        >
          <Paperclip className="w-5 h-5" />
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
          className="flex-1 bg-transparent text-gcs-text placeholder:text-gcs-muted/60 text-sm focus:outline-none resize-none max-h-30 py-2 px-1 leading-relaxed select-text"
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
            className="h-9 w-9 shrink-0 rounded-full"
            aria-label="Send Encrypted Message"
          >
            <Send className="w-4 h-4 text-gcs-bg" />
          </Button>
        ) : (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onSendVoiceNote}
            disabled={disabled}
            className="h-9 w-9 text-gcs-muted hover:text-gcs-mint hover:bg-gcs-emerald/15 shrink-0 rounded-full"
            aria-label="Record Voice Message"
          >
            <Mic className="w-5 h-5" />
          </Button>
        )}
      </div>

      {/* Security Footer Banner */}
      <div className="flex items-center justify-center gap-1.5 text-[11px] text-gcs-muted/70 pt-0.5">
        <Lock className="w-3 h-3 text-gcs-emerald/70" />
        <span>End-to-End Encrypted via GCS Double Ratchet</span>
      </div>
    </div>
  );
};
