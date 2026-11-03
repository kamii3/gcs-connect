'use client';

import React, { useState } from 'react';
import { cn, formatChatTime } from '@/lib/utils';
import { AudioPlayer } from './AudioPlayer';
import {
  Check,
  CheckCheck,
  Clock,
  Lock,
  Trash2,
  Copy,
  Ban,
  FileText,
  Download,
  Image as ImageIcon,
  ExternalLink,
  X,
  Maximize2,
  FileArchive,
  FileCode,
  FileSpreadsheet,
  Reply,
  Smile,
} from 'lucide-react';

export interface MessageAttachment {
  id: string;
  fileName: string;
  fileSizeBytes?: number;
  mimeType: string;
  url?: string;
  ciphertextSha256?: string;
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
    id?: string;
    senderName: string;
    content: string;
  };
  reactions?: Array<{
    emoji: string;
    count: number;
    hasReacted: boolean;
  }>;
  onDelete?: (id: string, deleteForEveryone: boolean) => void;
  onDownloadAttachment?: (attachment: MessageAttachment) => void;
  onReply?: (message: MessageProps) => void;
  onReact?: (messageId: string, emoji: string) => void;
  onScrollToMessage?: (messageId: string) => void;
}

// URL extraction regex
const URL_REGEX = /(https?:\/\/[^\s]+)/g;

export const MessageBubble: React.FC<MessageProps> = ({
  id,
  senderName = 'User',
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
  onDownloadAttachment,
  onReply,
  onReact,
  onScrollToMessage,
}) => {
  const [showMenu, setShowMenu] = useState(false);
  const [showActions, setShowActions] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
  const bubbleContainerRef = React.useRef<HTMLDivElement>(null);

  // Close actions and dropdown on outside click/tap
  React.useEffect(() => {
    const handleOutsideClick = (event: MouseEvent | TouchEvent) => {
      if (
        bubbleContainerRef.current &&
        !bubbleContainerRef.current.contains(event.target as Node)
      ) {
        setShowActions(false);
        setShowMenu(false);
      }
    };
    if (showActions || showMenu) {
      document.addEventListener('mousedown', handleOutsideClick);
      document.addEventListener('touchstart', handleOutsideClick);
    }
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('touchstart', handleOutsideClick);
    };
  }, [showActions, showMenu]);

  // Authentic WhatsApp ticks
  const statusIcons = {
    sending: <Clock className="w-3 h-3 text-[#8696a0] animate-spin" />,
    sent: <Check className="w-3.5 h-3.5 text-[#8696a0]" />,
    delivered: <CheckCheck className="w-3.5 h-3.5 text-[#8696a0]" />,
    read: <CheckCheck className="w-3.5 h-3.5 text-[#53bdeb]" />,
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
  const isAudio = attachment?.mimeType.startsWith('audio/');

  // Parse links inside content
  const detectedUrls = content ? content.match(URL_REGEX) : null;
  const firstUrl = detectedUrls ? detectedUrls[0] : null;

  const handleDownloadClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (attachment) {
      if (attachment.url) {
        const a = document.createElement('a');
        a.href = attachment.url;
        a.download = attachment.fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      } else if (onDownloadAttachment) {
        onDownloadAttachment(attachment);
      }
    }
  };

  const getDocIcon = (filename: string) => {
    const ext = filename.split('.').pop()?.toLowerCase();
    if (['zip', 'rar', 'tar', 'gz', '7z'].includes(ext || '')) {
      return <FileArchive className="w-5 h-5 text-amber-400" />;
    }
    if (['js', 'ts', 'jsx', 'tsx', 'py', 'json', 'html', 'css'].includes(ext || '')) {
      return <FileCode className="w-5 h-5 text-emerald-400" />;
    }
    if (['xls', 'xlsx', 'csv'].includes(ext || '')) {
      return <FileSpreadsheet className="w-5 h-5 text-green-400" />;
    }
    return <FileText className="w-5 h-5 text-[#34B7F1]" />;
  };

  return (
    <div
      id={`msg-${id}`}
      ref={bubbleContainerRef}
      className={cn(
        'w-full flex my-1 select-text transition-all duration-150',
        reactions && reactions.length > 0 ? 'mb-4' : 'mb-1',
        isSentByMe ? 'justify-end' : 'justify-start'
      )}
    >
      <div
        className={cn(
          'relative flex items-end gap-1.5 max-w-[85%] sm:max-w-[72%] md:max-w-[65%]',
          isSentByMe ? 'flex-row' : 'flex-row-reverse'
        )}
      >
        {/* Quick Actions Hover/Tap Menu */}
        {showActions && (
          <div
            className={cn(
              'flex items-center gap-1 bg-[#233138] border border-gcs-border/80 rounded-full px-2 py-1 shadow-2xl backdrop-blur-xl animate-fade-in z-30 mb-1',
              isSentByMe ? 'order-first' : 'order-last'
            )}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Quick Reactions Bar: 👍 ❤️ 😂 😮 😢 🙏 */}
            <div className="flex items-center gap-0.5 border-r border-[#374248] pr-1.5 mr-0.5">
              {['👍', '❤️', '😂', '😮', '😢', '🙏'].map((em) => (
                <button
                  key={em}
                  type="button"
                  onClick={() => {
                    onReact?.(id, em);
                    setShowActions(false);
                  }}
                  className="w-7 h-7 hover:bg-white/10 rounded-full flex items-center justify-center text-sm active:scale-125 transition-transform"
                  title={`React with ${em}`}
                >
                  {em}
                </button>
              ))}
            </div>

            {/* Reply Button */}
            {onReply && !isDeletedForEveryone && (
              <button
                type="button"
                onClick={() => {
                  setShowActions(false);
                  onReply({
                    id,
                    senderName,
                    content,
                    timestamp,
                    isSentByMe,
                    attachment,
                    replyTo,
                  });
                }}
                className="p-1 hover:text-white text-[#8696a0] rounded transition-colors active:scale-90"
                title="Reply"
              >
                <Reply className="w-3.5 h-3.5" />
              </button>
            )}

            {/* Copy Button */}
            <button
              type="button"
              onClick={handleCopy}
              className="p-1 hover:text-white text-[#8696a0] rounded transition-colors active:scale-90"
              title="Copy message"
            >
              <Copy className="w-3.5 h-3.5" />
            </button>

            {copied && (
              <span className="text-[10px] text-[#00a884] font-semibold px-1">
                Copied!
              </span>
            )}

            {onDelete && (
              <div className="relative">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowMenu(!showMenu);
                  }}
                  className="p-1 hover:text-red-400 text-[#8696a0] rounded transition-colors active:scale-90"
                  title="Delete Message"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>

                {showMenu && (
                  <div
                    className={cn(
                      'absolute bottom-full mb-1 w-44 bg-[#233138] border border-gcs-border rounded-xl shadow-2xl py-1 text-xs z-50 flex flex-col backdrop-blur-xl',
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
                        className="px-3 py-2 text-left hover:bg-red-500/20 text-red-300 flex items-center gap-2 transition-colors border-b border-gcs-border/40"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-red-400" />
                        <span>Delete for everyone</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setShowMenu(false);
                        onDelete(id, false);
                      }}
                      className="px-3 py-2 text-left hover:bg-[#182229] text-white flex items-center gap-2 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-[#8696a0]" />
                      <span>Delete for me</span>
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Encrypted Dark Mode Message Bubble */}
        <div
          onClick={() => setShowActions((prev) => !prev)}
          className={cn(
            'relative w-fit max-w-full px-3 py-2 rounded-2xl shadow-sm text-sm cursor-pointer active:brightness-105 transition-all min-w-[76px]',
            isDeletedForEveryone
              ? 'bg-[#202c33] text-[#8696a0] italic border border-gcs-border/40'
              : isSentByMe
              ? 'bg-[#005c4b] text-white rounded-tr-none shadow-[0_1px_2px_rgba(0,0,0,0.3)] bubble-tail-sent'
              : 'bg-[#202c33] text-white rounded-tl-none shadow-[0_1px_2px_rgba(0,0,0,0.3)] bubble-tail-received'
          )}
        >
          {/* Reply Context */}
          {replyTo && !isDeletedForEveryone && (
            <div
              onClick={(e) => {
                e.stopPropagation();
                if (replyTo.id && onScrollToMessage) {
                  onScrollToMessage(replyTo.id);
                }
              }}
              className="mb-1.5 p-2 rounded-lg bg-black/25 border-l-4 border-[#00a884] text-xs cursor-pointer hover:bg-black/35 transition-colors"
              title={replyTo.id ? 'Jump to original message' : undefined}
            >
              <span className="font-semibold text-[#00a884] block leading-tight">
                {replyTo.senderName}
              </span>
              <span className="text-[#d1d7db] truncate block mt-0.5">
                {replyTo.content || 'Encrypted Attachment'}
              </span>
            </div>
          )}

          {/* Encrypted Media Attachments */}
          {attachment && !isDeletedForEveryone && (
            <div className="mb-2 rounded-xl overflow-hidden bg-black/20">
              {isImage ? (
                attachment.url ? (
                  <div className="relative group/img">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={attachment.url}
                      alt={attachment.fileName}
                      className="w-full max-h-72 object-cover rounded-lg cursor-pointer transition-transform duration-200 group-hover/img:scale-[1.01]"
                      loading="lazy"
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsLightboxOpen(true);
                      }}
                    />
                  </div>
                ) : (
                  <div className="p-4 flex items-center justify-center gap-2 text-xs text-[#8696a0]">
                    <span className="w-3 h-3 border-2 border-[#00a884] border-t-transparent rounded-full animate-spin" />
                    <span>Decrypting secure image...</span>
                  </div>
                )
              ) : isAudio ? (
                <div className="p-2">
                  <AudioPlayer
                    url={attachment.url || ''}
                    fileName={attachment.fileName}
                    onDownload={() => handleDownloadClick({ stopPropagation: () => {} } as any)}
                  />
                </div>
              ) : (
                /* Document Card */
                <div
                  onClick={handleDownloadClick}
                  className="p-3 flex items-center justify-between gap-3 bg-black/20 hover:bg-black/30 cursor-pointer rounded-xl transition-colors"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center shrink-0">
                      {getDocIcon(attachment.fileName)}
                    </div>
                    <div className="min-w-0">
                      <span className="text-xs font-semibold text-white block truncate leading-tight">
                        {attachment.fileName}
                      </span>
                      <span className="text-[11px] text-[#8696a0] block font-mono">
                        {formatFileSize(attachment.fileSizeBytes)}
                      </span>
                    </div>
                  </div>
                  <Download className="w-4 h-4 text-[#00a884] shrink-0" />
                </div>
              )}
            </div>
          )}

          {/* Message Content Text */}
          {isDeletedForEveryone ? (
            <div className="flex items-center gap-1.5 py-0.5 text-xs text-[#8696a0]">
              <Ban className="w-3.5 h-3.5 text-red-400" />
              <span>This message was deleted</span>
            </div>
          ) : (
            <div className="text-[14.5px] leading-relaxed text-[#e9edef] select-text">
              <span className="whitespace-pre-wrap break-words">{content}</span>
              {/* Spacer ensuring text doesn't collide with the bottom-right timestamp */}
              <span className="inline-block w-16 h-3.5 align-middle pointer-events-none" />
            </div>
          )}

          {/* Bottom-Right Inline Timestamp & Status Ticks */}
          <div className="absolute right-2.5 bottom-1.5 flex items-center gap-1 text-[11px] text-[#8696a0] select-none pointer-events-none">
            <span className="leading-none text-[10.5px]">
              {formatChatTime(timestamp)}
            </span>
            {isSentByMe && !isDeletedForEveryone && (
              <span className="leading-none ml-0.5">
                {statusIcons[status]}
              </span>
            )}
          </div>

          {/* Reactions Floating Badge Pill */}
          {reactions && reactions.length > 0 && (
            <div
              className={cn(
                'absolute -bottom-2.5 flex items-center gap-1 z-20 select-none',
                isSentByMe ? 'right-2' : 'left-2'
              )}
            >
              <div className="flex items-center gap-1 bg-[#1f2c34] border border-[#2a3942] rounded-full px-1.5 py-0.5 shadow-md backdrop-blur-md">
                {reactions.map((r) => (
                  <button
                    key={r.emoji}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onReact?.(id, r.emoji);
                    }}
                    className={cn(
                      'flex items-center gap-0.5 px-1 py-0.2 rounded-full transition-all active:scale-90',
                      r.hasReacted ? 'bg-[#005c4b] text-white font-bold' : 'hover:bg-white/10'
                    )}
                    title={r.hasReacted ? 'You reacted (click to remove)' : `${r.count} reacted`}
                  >
                    <span className="text-xs leading-none">{r.emoji}</span>
                    {r.count > 1 && (
                      <span className="text-[10px] text-[#8696a0] leading-none">{r.count}</span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
