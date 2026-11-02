'use client';

import React, { useEffect } from 'react';
import { cn } from '@/lib/utils';
import { X } from 'lucide-react';
import { Button } from './Button';

export interface DrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  children: React.ReactNode;
  position?: 'left' | 'right';
  className?: string;
}

export const Drawer: React.FC<DrawerProps> = ({
  isOpen,
  onClose,
  title,
  children,
  position = 'right',
  className,
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) onClose();
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex bg-black/60 backdrop-blur-xs animate-fade-in"
      onClick={onClose}
    >
      <div
        className={cn(
          'fixed inset-y-0 w-[88vw] sm:w-full sm:max-w-sm bg-gcs-sidebar border-gcs-border shadow-2xl flex flex-col transition-transform duration-200 safe-bottom',
          position === 'right' ? 'right-0 border-l' : 'left-0 border-r',
          className
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-3.5 sm:p-4 border-b border-gcs-border/60 shrink-0">
          <h3 className="text-sm font-semibold text-gcs-text truncate">{title}</h3>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="h-8.5 w-8.5 text-gcs-muted hover:text-gcs-text rounded-full shrink-0"
            aria-label="Close drawer"
          >
            <X className="w-4.5 h-4.5" />
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto p-3.5 sm:p-4 scroll-touch">{children}</div>
      </div>
    </div>
  );
};
