'use strict';
/**
 * GCS CONNECT — Encrypted Media Lightbox Modal
 * Black & Emerald Theme (#121816 Dark Backdrop, #00A879 Accents)
 * In-memory preview and download of decrypted media files.
 */

import React, { useState, useEffect } from 'react';
import { X, Download, ZoomIn, ZoomOut, RotateCw } from 'lucide-react';

interface MediaLightboxProps {
  isOpen: boolean;
  onClose: () => void;
  mediaBlobUrl: string;
  mimeType: string;
  fileName: string;
  fileSizeBytes?: number;
}

export const MediaLightbox: React.FC<MediaLightboxProps> = ({
  isOpen,
  onClose,
  mediaBlobUrl,
  mimeType,
  fileName,
  fileSizeBytes,
}) => {
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    }

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'auto';
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const isVideo = mimeType.startsWith('video/');
  const isImage = mimeType.startsWith('image/');

  const handleZoomIn = () => setZoom((prev) => Math.min(prev + 0.25, 3));
  const handleZoomOut = () => setZoom((prev) => Math.max(prev - 0.25, 0.5));
  const handleRotate = () => setRotation((prev) => (prev + 90) % 360);

  const handleDownload = () => {
    const a = document.createElement('a');
    a.href = mediaBlobUrl;
    a.download = fileName || 'download';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#121816]/95 backdrop-blur-md animate-fade-in select-none">
      {/* Lightbox Header Bar */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-[#31463A] bg-[#151D19]/80">
        <div className="flex flex-col">
          <span className="text-[#F0F5F1] font-medium text-sm truncate max-w-md">{fileName}</span>
          {fileSizeBytes && (
            <span className="text-xs text-[#A4B5AA]">{formatFileSize(fileSizeBytes)}</span>
          )}
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          {isImage && (
            <>
              <button
                onClick={handleZoomIn}
                className="p-2 text-[#A4B5AA] hover:text-[#00A879] hover:bg-[#1C2420] rounded-lg transition-colors"
                title="Zoom In"
              >
                <ZoomIn className="w-5 h-5" />
              </button>
              <button
                onClick={handleZoomOut}
                className="p-2 text-[#A4B5AA] hover:text-[#00A879] hover:bg-[#1C2420] rounded-lg transition-colors"
                title="Zoom Out"
              >
                <ZoomOut className="w-5 h-5" />
              </button>
              <button
                onClick={handleRotate}
                className="p-2 text-[#A4B5AA] hover:text-[#00A879] hover:bg-[#1C2420] rounded-lg transition-colors"
                title="Rotate"
              >
                <RotateCw className="w-5 h-5" />
              </button>
            </>
          )}

          <button
            onClick={handleDownload}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#00A879] hover:bg-[#008f66] text-[#121816] font-semibold text-xs rounded-lg transition-colors shadow-sm ml-2"
          >
            <Download className="w-4 h-4" />
            <span>Save</span>
          </button>

          <button
            onClick={onClose}
            className="p-2 text-[#A4B5AA] hover:text-[#D94D55] hover:bg-[#1C2420] rounded-lg transition-colors ml-2"
            title="Close (Esc)"
          >
            <X className="w-6 h-6" />
          </button>
        </div>
      </div>

      {/* Main Display Area */}
      <div className="flex-1 flex items-center justify-center p-6 overflow-hidden">
        {isImage && (
          <img
            src={mediaBlobUrl}
            alt={fileName}
            style={{
              transform: `scale(${zoom}) rotate(${rotation}deg)`,
              transition: 'transform 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
            }}
            className="max-h-[85vh] max-w-[90vw] object-contain rounded-lg shadow-2xl"
          />
        )}

        {isVideo && (
          <video
            src={mediaBlobUrl}
            controls
            autoPlay
            className="max-h-[85vh] max-w-[90vw] rounded-lg shadow-2xl bg-black"
          />
        )}
      </div>
    </div>
  );
};
