'use strict';
/**
 * GCS CONNECT — Encrypted Media Renderer
 * Coordinates client-side decryption of images, videos, audio notes, and documents.
 * Adheres strictly to the Black & Emerald Design System (#00A879, #121816, #205B45).
 */

import React, { useState, useEffect } from 'react';
import { FileText, Download, Lock, AlertCircle, Loader2 } from 'lucide-react';
import { decryptMediaBuffer, EncryptedMediaDescriptor } from '@/lib/crypto/media-crypto';
import { VoiceNotePlayer } from './VoiceNotePlayer';
import { MediaLightbox } from './MediaLightbox';

interface EncryptedMediaRendererProps {
  attachmentId: string;
  descriptor: EncryptedMediaDescriptor;
  fetchEncryptedBytes: (attachmentId: string, isThumbnail?: boolean) => Promise<ArrayBuffer>;
  isSent?: boolean;
}

export const EncryptedMediaRenderer: React.FC<EncryptedMediaRendererProps> = ({
  attachmentId,
  descriptor,
  fetchEncryptedBytes,
  isSent = false,
}) => {
  const [decryptedUrl, setDecryptedUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);

  const isAudio = descriptor.mimeType.startsWith('audio/');
  const isImage = descriptor.mimeType.startsWith('image/');
  const isVideo = descriptor.mimeType.startsWith('video/');

  // For audio notes, automatically load and decrypt
  useEffect(() => {
    let active = true;

    if (isAudio && !decryptedUrl && !isLoading && !error) {
      loadAndDecrypt();
    }

    return () => {
      active = false;
      if (decryptedUrl) {
        URL.revokeObjectURL(decryptedUrl);
      }
    };
  }, [isAudio, attachmentId]);

  const loadAndDecrypt = async () => {
    if (isLoading || decryptedUrl) return;

    try {
      setIsLoading(true);
      setError(null);

      // 1. Fetch ciphertext bytes from server
      const ciphertext = await fetchEncryptedBytes(attachmentId);

      // 2. Decrypt in browser memory using Web Crypto AES-256-GCM
      const decryptedBuffer = await decryptMediaBuffer(ciphertext, descriptor);

      // 3. Create ephemeral in-memory Blob URL
      const blob = new Blob([decryptedBuffer], { type: descriptor.mimeType });
      const objectUrl = URL.createObjectURL(blob);
      setDecryptedUrl(objectUrl);
    } catch (err: any) {
      console.error('[MediaDecryptionError]', err);
      setError(err.message || 'Decryption failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleMediaClick = async () => {
    if (!decryptedUrl) {
      await loadAndDecrypt();
    }
    setIsLightboxOpen(true);
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // 1. Voice Note / Audio Player
  if (isAudio) {
    if (isLoading) {
      return (
        <div className="flex items-center gap-2 p-3 bg-[#151D19] rounded-xl border border-[#31463A] text-xs text-[#A4B5AA]">
          <Loader2 className="w-4 h-4 animate-spin text-[#00A879]" />
          <span>Decrypting voice note...</span>
        </div>
      );
    }

    if (error) {
      return (
        <div className="flex items-center gap-2 p-3 bg-[#D94D55]/10 rounded-xl border border-[#D94D55]/30 text-xs text-[#D94D55]">
          <AlertCircle className="w-4 h-4" />
          <span>Failed to decrypt audio</span>
        </div>
      );
    }

    return decryptedUrl ? (
      <VoiceNotePlayer audioBlobUrl={decryptedUrl} isSent={isSent} />
    ) : null;
  }

  // 2. Images & Videos
  if (isImage || isVideo) {
    return (
      <div className="relative group max-w-sm rounded-xl overflow-hidden border border-[#31463A] bg-[#151D19]">
        {decryptedUrl ? (
          <div onClick={handleMediaClick} className="cursor-pointer relative overflow-hidden">
            {isImage && (
              <img
                src={decryptedUrl}
                alt={descriptor.fileName}
                className="max-h-64 w-full object-cover rounded-xl hover:scale-105 transition-transform duration-300"
              />
            )}
            {isVideo && (
              <video
                src={decryptedUrl}
                className="max-h-64 w-full object-cover rounded-xl bg-black"
              />
            )}
            <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <span className="px-3 py-1 bg-[#121816]/80 text-[#B6F1D9] text-xs rounded-full font-medium">
                Click to expand
              </span>
            </div>
          </div>
        ) : (
          <div
            onClick={loadAndDecrypt}
            className="flex flex-col items-center justify-center p-8 bg-[#1C2420] text-center cursor-pointer hover:bg-[#25372E] transition-colors"
          >
            {isLoading ? (
              <div className="flex flex-col items-center gap-2">
                <Loader2 className="w-8 h-8 animate-spin text-[#00A879]" />
                <span className="text-xs text-[#A4B5AA]">Decrypting media in memory...</span>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <div className="w-12 h-12 rounded-full bg-[#151D19] border border-[#31463A] flex items-center justify-center text-[#00A879]">
                  <Lock className="w-5 h-5" />
                </div>
                <span className="text-xs font-semibold text-[#F0F5F1]">{descriptor.fileName}</span>
                <span className="text-[10px] text-[#A4B5AA]">{formatSize(descriptor.fileSizeBytes)} • Click to decrypt</span>
              </div>
            )}
          </div>
        )}

        {/* Lightbox Modal */}
        {decryptedUrl && (
          <MediaLightbox
            isOpen={isLightboxOpen}
            onClose={() => setIsLightboxOpen(false)}
            mediaBlobUrl={decryptedUrl}
            mimeType={descriptor.mimeType}
            fileName={descriptor.fileName}
            fileSizeBytes={descriptor.fileSizeBytes}
          />
        )}
      </div>
    );
  }

  // 3. Document / File Card
  return (
    <div
      onClick={loadAndDecrypt}
      className={`flex items-center gap-3 p-3 rounded-xl border max-w-sm cursor-pointer transition-all ${
        isSent
          ? 'bg-[#205B45] hover:bg-[#1b4e3b] border-[#31463A]'
          : 'bg-[#25372E] hover:bg-[#1f2e27] border-[#31463A]'
      }`}
    >
      <div className="w-10 h-10 rounded-lg bg-[#151D19] flex items-center justify-center text-[#00A879] flex-shrink-0">
        <FileText className="w-5 h-5" />
      </div>

      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium text-[#F0F5F1] truncate">{descriptor.fileName}</div>
        <div className="text-[10px] text-[#A4B5AA]">{formatSize(descriptor.fileSizeBytes)} • End-to-End Encrypted</div>
      </div>

      <button
        className="w-8 h-8 rounded-full bg-[#151D19] border border-[#31463A] hover:border-[#00A879] flex items-center justify-center text-[#00A879] transition-colors flex-shrink-0"
        title="Download & Decrypt"
      >
        {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
      </button>
    </div>
  );
};
