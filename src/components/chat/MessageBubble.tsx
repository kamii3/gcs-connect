import React, { useState } from 'react';
import { cn, formatChatTime } from '@/lib/utils';
import { Check, CheckCheck, Clock, Lock, Trash2, Copy, MoreVertical, Ban } from 'lucide-react';

export interface MessageProps {
  id: string;
  senderName?: string;
  content: string;
  timestamp: string | Date | number;
  isSentByMe: boolean;
  status?: 'sending' | 'sent' | 'delivered' | 'read';
  isEncrypted?: boolean;
  isDeletedForEveryone?: boolean;
  replyTo?: {
    senderName: string;
    content: string;
  };
  reactions?: Array<{
    emoji: string;
    count: number;
    hasReacted: boolean;
  }>;
  onDelete?: (id: string, deleteForEveryone: boolean) => void;
}

export const MessageBubble: React.FC<MessageProps> = ({
  id,
  content,
  timestamp,
  isSentByMe,
  status = 'sent',
  isEncrypted = true,
  isDeletedForEveryone = false,
  replyTo,
  reactions = [],
  onDelete,
}) => {
  const [showMenu, setShowMenu] = useState(false);
  const [copied, setCopied] = useState(false);

  const statusIcons = {
    sending: <Clock className="w-3 h-3 text-gcs-muted animate-spin" />,
    sent: <Check className="w-3.5 h-3.5 text-gcs-muted" />,
    delivered: <CheckCheck className="w-3.5 h-3.5 text-gcs-muted" />,
    read: <CheckCheck className="w-3.5 h-3.5 text-gcs-mint" />,
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div
      className={cn(
        'relative flex w-full my-1 animate-fade-in group select-text',
        isSentByMe ? 'justify-end' : 'justify-start'
      )}
    >
      {/* Quick Action Toolbar (appears on hover) */}
      {!isDeletedForEveryone && (
        <div
          className={cn(
            'absolute top-0 -translate-y-2 flex items-center gap-1 z-10 px-2 py-1 rounded-full bg-gcs-card/95 border border-gcs-border shadow-lg opacity-0 group-hover:opacity-100 transition-all duration-200',
            isSentByMe ? 'right-2' : 'left-2'
          )}
        >
          <button
            type="button"
            onClick={handleCopy}
            className="p-1 hover:text-gcs-mint text-gcs-muted rounded transition-colors"
            title={copied ? 'Copied!' : 'Copy Message'}
          >
            <Copy className="w-3.5 h-3.5" />
          </button>

          {onDelete && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowMenu(!showMenu)}
                className="p-1 hover:text-[#D94D55] text-gcs-muted rounded transition-colors"
                title="Delete Message"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>

              {showMenu && (
                <div
                  className={cn(
                    'absolute bottom-full mb-1 w-44 bg-gcs-card border border-gcs-border rounded-xl shadow-2xl py-1 text-xs z-50 flex flex-col',
                    isSentByMe ? 'right-0' : 'left-0'
                  )}
                >
                  {isSentByMe && (
                    <button
                      type="button"
                      onClick={() => {
                        setShowMenu(false);
                        onDelete(id, true);
                      }}
                      className="px-3 py-2 text-left hover:bg-gcs-sidebar text-[#D94D55] flex items-center gap-2 transition-colors"
                    >
                      <Ban className="w-3.5 h-3.5" />
                      <span>Delete for everyone</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setShowMenu(false);
                      onDelete(id, false);
                    }}
                    className="px-3 py-2 text-left hover:bg-gcs-sidebar text-gcs-text flex items-center gap-2 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-gcs-muted" />
                    <span>Delete for me</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Message Bubble Container */}
      <div
        className={cn(
          'relative max-w-[85%] sm:max-w-[70%] px-3.5 py-2 rounded-2xl shadow-sm text-sm border',
          isDeletedForEveryone
            ? 'bg-gcs-card/60 text-gcs-muted italic border-gcs-border/40'
            : isSentByMe
            ? 'bg-gcs-sent text-gcs-text border-[#287156] rounded-tr-xs'
            : 'bg-gcs-received text-gcs-text border-[#2d4237] rounded-tl-xs'
        )}
      >
        {/* Reply Preview */}
        {replyTo && !isDeletedForEveryone && (
          <div className="mb-1.5 p-2 rounded-lg bg-black/25 border-l-2 border-gcs-emerald text-xs">
            <span className="font-semibold text-gcs-mint block leading-tight">
              {replyTo.senderName}
            </span>
            <span className="text-gcs-muted truncate block mt-0.5">
              {replyTo.content}
            </span>
          </div>
        )}

        {/* Message Content */}
        <p className="whitespace-pre-wrap break-words leading-relaxed select-text text-[13.5px]">
          {isDeletedForEveryone ? (
            <span className="flex items-center gap-1.5 text-xs text-gcs-muted/80">
              <Ban className="w-3.5 h-3.5 text-gcs-muted inline" />
              <span>This message was deleted</span>
            </span>
          ) : (
            content
          )}
        </p>

        {/* Metadata Footer */}
        <div className="flex items-center justify-end gap-1.5 mt-1 text-[10.5px] text-gcs-muted select-none">
          {isEncrypted && (
            <Lock
              className="w-2.5 h-2.5 text-gcs-emerald/70 inline"
              aria-label="End-to-End Encrypted"
            />
          )}
          <span>{formatChatTime(timestamp)}</span>
          {isSentByMe && !isDeletedForEveryone && <span>{statusIcons[status]}</span>}
        </div>

        {/* Reactions */}
        {!isDeletedForEveryone && reactions.length > 0 && (
          <div className="absolute -bottom-2.5 right-2 flex items-center gap-1 bg-gcs-card/90 border border-gcs-border px-1.5 py-0.5 rounded-full text-xs shadow-sm">
            {reactions.map((r, i) => (
              <span
                key={i}
                className={cn(
                  'flex items-center gap-0.5 px-1 rounded-full',
                  r.hasReacted && 'bg-gcs-emerald/20 text-gcs-mint'
                )}
              >
                <span>{r.emoji}</span>
                {r.count > 1 && <span className="text-[10px]">{r.count}</span>}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
