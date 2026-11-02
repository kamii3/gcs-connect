import React from 'react';
import { cn } from '@/lib/utils';

export interface AvatarProps {
  src?: string | null;
  name: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  status?: 'online' | 'offline' | 'away' | 'busy' | 'none';
  className?: string;
}

export const Avatar: React.FC<AvatarProps> = ({
  src,
  name,
  size = 'md',
  status = 'none',
  className,
}) => {
  const [imageError, setImageError] = React.useState(false);

  const getInitials = (str: string): string => {
    if (!str) return 'U';
    const parts = str.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  const sizes = {
    xs: 'h-6 w-6 text-[10px]',
    sm: 'h-8 w-8 text-xs',
    md: 'h-10 w-10 text-sm',
    lg: 'h-12 w-12 text-base',
    xl: 'h-16 w-16 text-lg',
  };

  const badgeSizes = {
    xs: 'h-2 w-2 border',
    sm: 'h-2.5 w-2.5 border-[1.5px]',
    md: 'h-3 w-3 border-2',
    lg: 'h-3.5 w-3.5 border-2',
    xl: 'h-4 w-4 border-2',
  };

  const statusColors = {
    online: 'bg-gcs-emerald',
    offline: 'bg-gcs-border',
    away: 'bg-gcs-warning',
    busy: 'bg-gcs-error',
    none: '',
  };

  return (
    <div className={cn('relative inline-flex shrink-0', className)}>
      <div
        className={cn(
          'rounded-full flex items-center justify-center font-semibold overflow-hidden border border-gcs-border/60 bg-gcs-card text-gcs-mint shadow-inner select-none',
          sizes[size]
        )}
      >
        {src && !imageError ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt={name}
            onError={() => setImageError(true)}
            className="h-full w-full object-cover"
          />
        ) : (
          <span>{getInitials(name)}</span>
        )}
      </div>

      {status !== 'none' && (
        <span
          className={cn(
            'absolute bottom-0 right-0 rounded-full border-gcs-bg',
            badgeSizes[size],
            statusColors[status]
          )}
          aria-label={`Status: ${status}`}
        />
      )}
    </div>
  );
};
