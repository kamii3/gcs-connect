import React from 'react';
import { cn, formatChatTime } from '@/lib/utils';
import { Check, CheckCheck, Clock, Lock } from 'lucide-react';

export interface MessageProps {
  id: string;
  senderName?: string;
  content: string;
  timestamp: string | Date | number;
  isSentByMe: boolean;
  status?: 'sending' | 'sent' | 'delivered' | 'read';
  isEncrypted?: boolean;
  replyTo?: {
    senderName: string;
    content: string;
  };
  reactions?: Array<{
    emoji: string;
    count: number;
    hasReacted: boolean;
  }>;
}

export const MessageBubble: React.FC<MessageProps> = ({
  content,
  timestamp,
  isSentByMe,
  status = 'sent',
  isEncrypted = true,
  replyTo,
  reactions = [],
}) => {
  const statusIcons = {
    sending: <Clock className="w-3 h-3 text-gcs-muted animate-spin" />,
    sent: <Check className="w-3.5 h-3.5 text-gcs-muted" />,
    delivered: <CheckCheck className="w-3.5 h-3.5 text-gcs-muted" />,
    read: <CheckCheck className="w-3.5 h-3.5 text-gcs-mint" />,
  };

  return (
    <div
      className={cn(
        'flex w-full my-1 animate-fade-in group',
        isSentByMe ? 'justify-end' : 'justify-start'
      )}
    >
      <div
        className={cn(
          'relative max-w-[85%] sm:max-w-[70%] px-3.5 py-2 rounded-2xl shadow-sm text-sm border',
          isSentByMe
            ? 'bg-gcs-sent text-gcs-text border-[#287156] rounded-tr-xs'
            : 'bg-gcs-received text-gcs-text border-[#2d4237] rounded-tl-xs'
        )}
      >
        {/* Reply Preview */}
        {replyTo && (
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
          {content}
        </p>

        {/* Metadata Footer */}
        <div className="flex items-center justify-end gap-1 mt-1 text-[10.5px] text-gcs-muted select-none">
          {isEncrypted && (
            <Lock
              className="w-2.5 h-2.5 text-gcs-emerald/70 inline"
              aria-label="End-to-End Encrypted"
            />
          )}
          <span>{formatChatTime(timestamp)}</span>
          {isSentByMe && <span>{statusIcons[status]}</span>}
        </div>

        {/* Reactions */}
        {reactions.length > 0 && (
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
