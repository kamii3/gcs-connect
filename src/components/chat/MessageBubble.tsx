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
}

// URL extraction regex
const URL_REGEX = /(https?:\/\/[^\s]+)/g;

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
  onDownloadAttachment,
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

  // Modern GCS neon status ticks
  const statusIcons = {
    sending: <Clock className="w-3 h-3 text-gcs-emerald/70 animate-spin" />,
    sent: <Check className="w-3.5 h-3.5 text-gcs-muted" />,
    delivered: <CheckCheck className="w-3.5 h-3.5 text-gcs-muted" />,
    read: <CheckCheck className="w-3.5 h-3.5 text-[#00F0FF]" />,
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
        // Direct download using blob URL
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

  const getDocumentIcon = (fileName: string, mime: string) => {
    const ext = fileName.split('.').pop()?.toLowerCase();
    if (ext === 'zip' || ext === 'tar' || ext === 'gz' || ext === 'rar') {
      return <FileArchive className="w-5 h-5 text-amber-400" />;
    }
    if (ext === 'json' || ext === 'js' || ext === 'ts' || ext === 'html' || ext === 'py') {
      return <FileCode className="w-5 h-5 text-blue-400" />;
    }
    if (ext === 'xls' || ext === 'xlsx' || ext === 'csv') {
      return <FileSpreadsheet className="w-5 h-5 text-emerald-400" />;
    }
    return <FileText className="w-5 h-5 text-emerald-300" />;
  };

  return (
    <>
      <div
        ref={bubbleContainerRef}
        className={cn(
          'relative flex w-full my-1 animate-fade-in group select-text',
          isSentByMe ? 'justify-end' : 'justify-start'
        )}
      >
        {/* Quick Action Toolbar */}
        {!isDeletedForEveryone && (
          <div
            className={cn(
              'absolute top-0 -translate-y-3 flex items-center gap-1 z-10 px-2 py-1 rounded-full bg-gcs-card/95 border border-gcs-border shadow-xl transition-all duration-200 backdrop-blur-md',
              isSentByMe ? 'right-2' : 'left-2',
              showActions
                ? 'opacity-100 pointer-events-auto scale-100'
                : 'opacity-0 pointer-events-none sm:group-hover:opacity-100 sm:group-hover:pointer-events-auto'
            )}
          >
            <button
              type="button"
              onClick={handleCopy}
              className="p-1 hover:text-gcs-mint hover:bg-gcs-emerald/10 text-gcs-muted rounded transition-colors active:scale-90"
              title={copied ? 'Copied!' : 'Copy Text'}
            >
              <Copy className="w-3.5 h-3.5" />
            </button>

            {attachment && (
              <button
                type="button"
                onClick={handleDownloadClick}
                className="p-1 hover:text-gcs-mint hover:bg-gcs-emerald/10 text-gcs-muted rounded transition-colors active:scale-90"
                title="Download Attachment"
              >
                <Download className="w-3.5 h-3.5" />
              </button>
            )}

            {onDelete && (
              <div className="relative">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowMenu(!showMenu);
                  }}
                  className="p-1 hover:text-red-400 hover:bg-red-500/10 text-gcs-muted rounded transition-colors active:scale-90"
                  title="Delete Message"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>

                {showMenu && (
                  <div
                    className={cn(
                      'absolute bottom-full mb-1 w-44 bg-gcs-card/95 border border-gcs-border rounded-xl shadow-2xl py-1 text-xs z-50 flex flex-col backdrop-blur-xl',
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

        {/* Distinct GCS Cyber-Emerald Message Bubble */}
        <div
          onClick={() => setShowActions((prev) => !prev)}
          className={cn(
            'relative max-w-[88%] sm:max-w-[72%] px-3.5 py-2.5 rounded-2xl shadow-md text-sm border cursor-pointer active:brightness-105 transition-all overflow-hidden break-words [overflow-wrap:anywhere]',
            isDeletedForEveryone
              ? 'bg-gcs-card/60 text-gcs-muted italic border-gcs-border/40'
              : isSentByMe
              ? 'bg-gradient-to-br from-[#00A879] to-[#007D5A] text-white border-emerald-400/30 rounded-tr-xs shadow-[0_2px_14px_rgba(0,168,121,0.22)]'
              : 'bg-[#1C2520] text-gcs-text border border-gcs-border/80 rounded-tl-xs shadow-[0_2px_12px_rgba(0,0,0,0.35)] backdrop-blur-xs'
          )}
        >
          {/* Reply Context */}
          {replyTo && !isDeletedForEveryone && (
            <div className="mb-2 p-2 rounded-lg bg-black/30 border-l-2 border-[#00F0FF] text-xs">
              <span className="font-semibold text-emerald-300 block leading-tight">
                {replyTo.senderName}
              </span>
              <span className="text-slate-300 truncate block mt-0.5">
                {replyTo.content}
              </span>
            </div>
          )}

          {/* Encrypted Media Attachments */}
          {attachment && !isDeletedForEveryone && (
            <div className="mb-2 rounded-xl overflow-hidden bg-black/25 border border-emerald-500/20">
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
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsLightboxOpen(true);
                      }}
                      className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/60 text-white opacity-0 group-hover/img:opacity-100 transition-opacity hover:bg-black/80"
                      title="Enlarge Photo"
                    >
                      <Maximize2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <div
                    onClick={handleDownloadClick}
                    className="p-6 flex flex-col items-center justify-center gap-2 cursor-pointer hover:bg-black/40 transition-colors"
                  >
                    <div className="h-10 w-10 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center animate-pulse">
                      <ImageIcon className="w-5 h-5" />
                    </div>
                    <span className="text-xs font-semibold text-slate-200">
                      Tap to Decrypt & View Photo
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">
                      {formatFileSize(attachment.fileSizeBytes) || 'Encrypted Image'}
                    </span>
                  </div>
                )
              ) : isVideo ? (
                attachment.url ? (
                  <video
                    src={attachment.url}
                    controls
                    className="w-full max-h-72 rounded-lg bg-black"
                  />
                ) : (
                  <div
                    onClick={handleDownloadClick}
                    className="p-6 flex flex-col items-center justify-center gap-2 cursor-pointer hover:bg-black/40 transition-colors"
                  >
                    <div className="h-10 w-10 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center animate-pulse">
                      <Download className="w-5 h-5" />
                    </div>
                    <span className="text-xs font-semibold text-slate-200">
                      Tap to Decrypt & Stream Video
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">
                      {formatFileSize(attachment.fileSizeBytes) || 'Encrypted Video'}
                    </span>
                  </div>
                )
              ) : isAudio ? (
                <AudioPlayer
                  url={attachment.url}
                  fileName={attachment.fileName}
                  fileSizeBytes={attachment.fileSizeBytes}
                  onDownload={() => handleDownloadClick({ stopPropagation: () => {} } as React.MouseEvent)}
                />
              ) : (
                /* Document File Card */
                <div
                  onClick={handleDownloadClick}
                  className="p-3 flex items-center justify-between gap-3 hover:bg-black/40 transition-colors cursor-pointer rounded-xl bg-black/20 border border-gcs-border/40"
                >
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <div className="h-10 w-10 rounded-xl bg-gcs-emerald/20 border border-gcs-emerald/30 flex items-center justify-center shrink-0">
                      {getDocumentIcon(attachment.fileName, attachment.mimeType)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <span className="text-xs font-semibold text-gcs-text block truncate leading-tight">
                        {attachment.fileName}
                      </span>
                      <span className="text-[10px] text-gcs-muted block font-mono mt-0.5">
                        {formatFileSize(attachment.fileSizeBytes) || 'Encrypted Document'}
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleDownloadClick}
                    className="p-2 rounded-lg bg-gcs-emerald/20 text-gcs-mint hover:bg-gcs-emerald hover:text-white transition-colors shrink-0"
                    title="Download File"
                  >
                    <Download className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Text Message Content */}
          {content && (
            <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere] leading-relaxed select-text text-[13.5px]">
              {isDeletedForEveryone ? (
                <span className="flex items-center gap-1.5 text-xs text-slate-400">
                  <Ban className="w-3.5 h-3.5 text-slate-400 inline shrink-0" />
                  <span>This message was deleted</span>
                </span>
              ) : (
                content.split(URL_REGEX).map((part, index) => {
                  if (part.match(URL_REGEX)) {
                    return (
                      <a
                        key={index}
                        href={part}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[#00F0FF] underline hover:text-white transition-colors"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {part}
                      </a>
                    );
                  }
                  return part;
                })
              )}
            </p>
          )}

          {/* Rich Link Preview Card */}
          {firstUrl && !isDeletedForEveryone && (
            <div className="mt-2 p-2.5 rounded-xl bg-black/30 border border-emerald-500/20 flex flex-col gap-1 text-xs">
              <div className="flex items-center justify-between text-[11px] text-[#00F0FF]">
                <span className="font-semibold truncate">
                  {new URL(firstUrl).hostname.replace('www.', '')}
                </span>
                <ExternalLink className="w-3.5 h-3.5 shrink-0" />
              </div>
              <span className="text-[11px] text-slate-300 truncate font-mono">
                {firstUrl}
              </span>
            </div>
          )}

          {/* Metadata Footer */}
          <div className="flex items-center justify-end gap-1.5 mt-1 text-[10px] text-slate-400 select-none">
            {isEncrypted && (
              <Lock
                className="w-2.5 h-2.5 text-emerald-400/80 inline shrink-0"
                aria-label="AES-256-GCM End-to-End Encrypted"
              />
            )}
            <span>{formatChatTime(timestamp)}</span>
            {isSentByMe && !isDeletedForEveryone && <span>{statusIcons[status]}</span>}
          </div>

          {/* Reactions */}
          {!isDeletedForEveryone && reactions.length > 0 && (
            <div className="absolute -bottom-2.5 right-2 flex items-center gap-1 bg-slate-900 border border-emerald-500/30 px-1.5 py-0.5 rounded-full text-xs shadow-md">
              {reactions.map((r, i) => (
                <span
                  key={i}
                  className={cn(
                    'flex items-center gap-0.5 px-1 rounded-full',
                    r.hasReacted && 'bg-emerald-500/20 text-emerald-300'
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

      {/* Photo Lightbox Modal */}
      {isLightboxOpen && attachment?.url && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md p-4 animate-fade-in"
          onClick={() => setIsLightboxOpen(false)}
        >
          <div
            className="relative max-w-4xl max-h-[90dvh] flex flex-col items-center"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Top Toolbar */}
            <div className="w-full flex items-center justify-between pb-3 text-white">
              <span className="text-sm font-semibold truncate max-w-xs sm:max-w-md">
                {attachment.fileName}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleDownloadClick}
                  className="p-2 rounded-xl bg-slate-800 hover:bg-emerald-500 hover:text-slate-950 transition-colors"
                  title="Download Photo"
                >
                  <Download className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setIsLightboxOpen(false)}
                  className="p-2 rounded-xl bg-slate-800 hover:bg-red-500 hover:text-white transition-colors"
                  title="Close"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Enlarge Photo */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={attachment.url}
              alt={attachment.fileName}
              className="max-h-[80dvh] max-w-full rounded-2xl object-contain shadow-2xl border border-emerald-500/20"
            />
          </div>
        </div>
      )}
    </>
  );
};
