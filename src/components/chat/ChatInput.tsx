'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/Button';
import { Paperclip, Smile, Mic, Send, Image, FileText, Video, Lock } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ChatInputProps {
  onSendMessage: (content: string) => void;
  onSendVoiceNote?: () => void;
  onAttachFile?: (type: 'image' | 'video' | 'document') => void;
  onSendFile?: (file: File) => void;
  isSending?: boolean;
  disabled?: boolean;
  placeholder?: string;
}

export const ChatInput: React.FC<ChatInputProps> = ({
  onSendMessage,
  onSendVoiceNote,
  onAttachFile,
  onSendFile,
  isSending = false,
  disabled = false,
  placeholder = 'Type an end-to-end encrypted message...',
}) => {
  const [text, setText] = useState('');
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);

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

  return (
    <div className="relative p-2 sm:p-3 bg-gcs-sidebar border-t border-gcs-border flex flex-col gap-1 select-none shrink-0 safe-bottom">
      {/* Hidden File Pickers */}
      <input
        type="file"
        ref={imageInputRef}
        accept="image/*,video/*"
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
        <div className="absolute bottom-16 sm:bottom-18 left-2 sm:left-4 z-40 bg-gcs-card border border-gcs-border rounded-xl p-2 shadow-2xl flex flex-col gap-1 animate-slide-up w-48">
          <button
            type="button"
            onClick={() => {
              setShowAttachMenu(false);
              onAttachFile?.('image');
              imageInputRef.current?.click();
            }}
            className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-xs font-medium text-gcs-text hover:bg-gcs-emerald/15 hover:text-gcs-mint transition-colors text-left active:scale-98 cursor-pointer"
          >
            <Image className="w-4 h-4 text-gcs-emerald" />
            <span>Photos & Videos</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setShowAttachMenu(false);
              onAttachFile?.('document');
              docInputRef.current?.click();
            }}
            className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-xs font-medium text-gcs-text hover:bg-gcs-emerald/15 hover:text-gcs-mint transition-colors text-left active:scale-98 cursor-pointer"
          >
            <FileText className="w-4 h-4 text-gcs-mint" />
            <span>Encrypted Document</span>
          </button>
        </div>
      )}

      {/* Main Input Row */}
      <div className="flex items-end gap-1.5 sm:gap-2 bg-gcs-card border border-gcs-border/80 focus-within:border-gcs-emerald rounded-2xl p-1 sm:p-1.5 transition-colors">
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

        {/* Text Input Area - text-base on mobile prevents iOS safari auto-zoom */}
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
            className="h-9 w-9 shrink-0 rounded-full bg-gcs-emerald hover:bg-[#00c28c]"
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
      <div className="flex items-center justify-center gap-1.5 text-[10px] sm:text-[11px] text-gcs-muted/70 pt-0.5 truncate">
        <Lock className="w-3 h-3 text-gcs-emerald/70 shrink-0" />
        <span className="truncate">End-to-End Encrypted via GCS Double Ratchet</span>
      </div>
    </div>
  );
};
