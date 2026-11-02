import React, { useState } from 'react';
import { cn, formatChatTime } from '@/lib/utils';
import {
  Check,
  CheckCheck,
  Clock,
  Lock,
  Trash2,
  Copy,
  MoreVertical,
  Ban,
  FileText,
  Download,
  Image as ImageIcon,
  Paperclip,
} from 'lucide-react';

export interface MessageAttachment {
  id: string;
  fileName: string;
  fileSizeBytes?: number;
  mimeType: string;
  url?: string;
}

export interface MessageProps {
  id: string;
  senderName?: string;
  content: string;
  timestamp: string | Date | number;
  isSentByMe: boolean;
  status?: 'sending' | 'sent' | 'delivered' | 'read';
  isEncrypted?: boolean;
  isDeletedForEveryone?: boolean;
  attachment?: MessageAttachment;
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
  attachment,
  replyTo,
  reactions = [],
  onDelete,
}) => {
  const [showMenu, setShowMenu] = useState(false);
  const [showActions, setShowActions] = useState(false);
  const [copied, setCopied] = useState(false);

  // WhatsApp-standard read receipts: single grey (sent), double grey (delivered), double bright blue (read)
  const statusIcons = {
    sending: <Clock className="w-3 h-3 text-gcs-muted animate-spin" />,
    sent: <Check className="w-3.5 h-3.5 text-gcs-muted" />,
    delivered: <CheckCheck className="w-3.5 h-3.5 text-gcs-muted" />,
    read: <CheckCheck className="w-3.5 h-3.5 text-[#34B7F1]" />,
  };

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const isImage = attachment?.mimeType.startsWith('image/');
  const isVideo = attachment?.mimeType.startsWith('video/');

  return (
    <div
      className={cn(
        'relative flex w-full my-1 animate-fade-in group select-text',
        isSentByMe ? 'justify-end' : 'justify-start'
      )}
    >
      {/* Quick Action Toolbar (appears on hover or on mobile tap) */}
      {!isDeletedForEveryone && (
        <div
          className={cn(
            'absolute top-0 -translate-y-2.5 flex items-center gap-1 z-10 px-2 py-1 rounded-full bg-gcs-card/95 border border-gcs-border shadow-lg transition-all duration-200',
            isSentByMe ? 'right-2' : 'left-2',
            showActions
              ? 'opacity-100 pointer-events-auto scale-100'
              : 'opacity-0 pointer-events-none sm:group-hover:opacity-100 sm:group-hover:pointer-events-auto'
          )}
        >
          <button
            type="button"
            onClick={handleCopy}
            className="p-1 hover:text-gcs-mint text-gcs-muted rounded transition-colors active:scale-90"
            title={copied ? 'Copied!' : 'Copy Message'}
          >
            <Copy className="w-3.5 h-3.5" />
          </button>

          {onDelete && (
            <div className="relative">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowMenu(!showMenu);
                }}
                className="p-1 hover:text-[#D94D55] text-gcs-muted rounded transition-colors active:scale-90"
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
                  onClick={(e) => e.stopPropagation()}
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

      {/* Message Bubble Container - text strictly fixed within the box */}
      <div
        onClick={() => setShowActions((prev) => !prev)}
        className={cn(
          'relative max-w-[88%] sm:max-w-[70%] px-3.5 py-2 rounded-2xl shadow-sm text-sm border cursor-pointer active:brightness-105 transition-all overflow-hidden break-words [overflow-wrap:anywhere]',
          isDeletedForEveryone
            ? 'bg-[#182229]/80 text-gcs-muted italic border-gcs-border/40'
            : isSentByMe
            ? 'bg-[#005c4b] text-[#e9edef] border-[#005c4b] rounded-tr-xs'
            : 'bg-[#202c33] text-[#e9edef] border-[#202c33] rounded-tl-xs'
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

        {/* Encrypted Media Attachment Preview */}
        {attachment && !isDeletedForEveryone && (
          <div className="mb-2 rounded-xl overflow-hidden bg-black/20 border border-gcs-border/40">
            {isImage && attachment.url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={attachment.url}
                alt={attachment.fileName}
                className="w-full max-h-64 object-cover rounded-lg"
                loading="lazy"
              />
            ) : isVideo && attachment.url ? (
              <video
                src={attachment.url}
                controls
                className="w-full max-h-64 rounded-lg bg-black"
              />
            ) : (
              <a
                href={attachment.url || '#'}
                download={attachment.fileName}
                onClick={(e) => {
                  if (!attachment.url) e.preventDefault();
                }}
                className="p-3 flex items-center justify-between gap-3 hover:bg-black/30 transition-colors text-left"
              >
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  <div className="h-9 w-9 rounded-lg bg-gcs-emerald/20 border border-gcs-emerald/30 flex items-center justify-center shrink-0 text-gcs-mint">
                    <FileText className="w-5 h-5 text-gcs-mint" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className="text-xs font-semibold text-gcs-text block truncate leading-tight">
                      {attachment.fileName}
                    </span>
                    <span className="text-[10px] text-gcs-muted block font-mono mt-0.5">
                      {formatFileSize(attachment.fileSizeBytes) || 'Encrypted File'}
                    </span>
                  </div>
                </div>
                <div className="p-1.5 rounded-lg bg-gcs-emerald/20 text-gcs-mint shrink-0">
                  <Download className="w-4 h-4" />
                </div>
              </a>
            )}
          </div>
        )}

        {/* Message Content - guaranteed to wrap and never overflow container */}
        {content && (
          <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere] leading-relaxed select-text text-[13.5px]">
            {isDeletedForEveryone ? (
              <span className="flex items-center gap-1.5 text-xs text-gcs-muted/80">
                <Ban className="w-3.5 h-3.5 text-gcs-muted inline shrink-0" />
                <span>This message was deleted</span>
              </span>
            ) : (
              content
            )}
          </p>
        )}

        {/* Metadata Footer */}
        <div className="flex items-center justify-end gap-1.5 mt-1 text-[10.5px] text-gcs-muted select-none">
          {isEncrypted && (
            <Lock
              className="w-2.5 h-2.5 text-gcs-emerald/70 inline shrink-0"
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
