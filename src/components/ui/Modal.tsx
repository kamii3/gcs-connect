'use client';

import React, { useEffect } from 'react';
import { cn } from '@/lib/utils';
import { X } from 'lucide-react';
import { Button } from './Button';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl';
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  description,
  children,
  footer,
  className,
  maxWidth = 'md',
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.body.style.overflow = 'unset';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const maxWidths = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-sm animate-fade-in safe-bottom"
      onClick={onClose}
    >
      <div
        className={cn(
          'w-full bg-gcs-card border border-gcs-border rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-slide-up max-h-[92dvh] sm:max-h-[90dvh]',
          maxWidths[maxWidth],
          className
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Mobile Pull Handle Indicator */}
        <div className="sm:hidden w-full flex justify-center pt-2.5 pb-1">
          <div className="sheet-handle" />
        </div>

        {/* Header */}
        <div className="flex items-start justify-between p-4 sm:p-5 border-b border-gcs-border/60 shrink-0">
          <div className="pr-2">
            {title && (
              <h3 className="text-sm sm:text-base font-semibold text-gcs-text leading-tight">
                {title}
              </h3>
            )}
            {description && (
              <p className="text-[11px] sm:text-xs text-gcs-muted mt-1 leading-normal">{description}</p>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="text-gcs-muted hover:text-gcs-text -mr-1 -mt-1 h-9 w-9 rounded-full shrink-0"
            aria-label="Close dialog"
          >
            <X className="w-4.5 h-4.5" />
          </Button>
        </div>

        {/* Content Body */}
        <div className="p-4 sm:p-5 overflow-y-auto text-sm text-gcs-text scroll-touch">
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div className="flex items-center justify-end gap-2.5 p-3.5 sm:p-4 border-t border-gcs-border/60 bg-gcs-sidebar/40 shrink-0 safe-bottom">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};
