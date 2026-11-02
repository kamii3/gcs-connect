'use client';

import React, { createContext, useContext, useState, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { CheckCircle2, AlertTriangle, AlertCircle, Info, X } from 'lucide-react';

export interface ToastItem {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  message: string;
  duration?: number;
}

interface ToastContextType {
  toast: (item: Omit<ToastItem, 'id'>) => void;
  removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    ({ type, message, duration = 4000 }: Omit<ToastItem, 'id'>) => {
      const id = Math.random().toString(36).substring(2, 9);
      setToasts((prev) => [...prev, { id, type, message, duration }]);
      if (duration > 0) {
        setTimeout(() => removeToast(id), duration);
      }
    },
    [removeToast]
  );

  const icons = {
    success: <CheckCircle2 className="w-4 h-4 text-gcs-emerald shrink-0" />,
    error: <AlertCircle className="w-4 h-4 text-gcs-error shrink-0" />,
    warning: <AlertTriangle className="w-4 h-4 text-gcs-warning shrink-0" />,
    info: <Info className="w-4 h-4 text-gcs-mint shrink-0" />,
  };

  const borders = {
    success: 'border-gcs-emerald/40',
    error: 'border-gcs-error/40',
    warning: 'border-gcs-warning/40',
    info: 'border-gcs-mint/40',
  };

  return (
    <ToastContext.Provider value={{ toast, removeToast }}>
      {children}
      <div
        aria-live="polite"
        className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cn(
              'pointer-events-auto flex items-center justify-between p-3.5 rounded-xl bg-gcs-card/95 border backdrop-blur-md shadow-card text-sm text-gcs-text animate-slide-up',
              borders[t.type]
            )}
          >
            <div className="flex items-center gap-2.5">
              {icons[t.type]}
              <span className="leading-snug">{t.message}</span>
            </div>
            <button
              onClick={() => removeToast(t.id)}
              className="text-gcs-muted hover:text-gcs-text ml-3 p-1 rounded-md"
              aria-label="Dismiss toast"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};
