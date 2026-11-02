import React from 'react';
import { cn } from '@/lib/utils';
import { ShieldCheck, Lock } from 'lucide-react';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'emerald' | 'neutral' | 'warning' | 'error' | 'e2ee';
  size?: 'sm' | 'md';
}

export const Badge: React.FC<BadgeProps> = ({
  className,
  variant = 'emerald',
  size = 'md',
  children,
  ...props
}) => {
  const variants = {
    emerald: 'bg-gcs-emerald text-gcs-bg font-bold',
    neutral: 'bg-gcs-card text-gcs-muted border border-gcs-border',
    warning: 'bg-gcs-warning/20 text-gcs-warning border border-gcs-warning/30',
    error: 'bg-gcs-error/20 text-gcs-error border border-gcs-error/30',
    e2ee: 'bg-gcs-emerald/15 text-gcs-mint border border-gcs-emerald/30 font-medium',
  };

  const sizes = {
    sm: 'text-[11px] px-1.5 py-0.5 rounded-full min-w-5 h-5 inline-flex items-center justify-center',
    md: 'text-xs px-2.5 py-0.5 rounded-full gap-1 inline-flex items-center justify-center',
  };

  return (
    <span
      className={cn(
        'font-mono uppercase tracking-wider select-none shrink-0',
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    >
      {variant === 'e2ee' && <Lock className="w-3 h-3 inline mr-1 text-gcs-emerald" />}
      {children}
    </span>
  );
};
