import React from 'react';
import { cn } from '@/lib/utils';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  (
    {
      className,
      label,
      error,
      helperText,
      leftIcon,
      rightIcon,
      disabled,
      id,
      ...props
    },
    ref
  ) => {
    const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

    return (
      <div className="w-full flex flex-col gap-1.5 text-left">
        {label && (
          <label
            htmlFor={inputId}
            className="text-xs font-medium text-gcs-muted tracking-wide"
          >
            {label}
          </label>
        )}
        <div className="relative flex items-center">
          {leftIcon && (
            <div className="absolute left-3 text-gcs-muted pointer-events-none flex items-center justify-center">
              {leftIcon}
            </div>
          )}
          <input
            id={inputId}
            ref={ref}
            disabled={disabled}
            className={cn(
              'w-full bg-gcs-card text-gcs-text border border-gcs-border rounded-lg text-sm transition-all duration-150',
              'placeholder:text-gcs-muted/60 focus:outline-none focus:border-gcs-emerald focus:ring-1 focus:ring-gcs-emerald',
              'disabled:opacity-50 disabled:cursor-not-allowed',
              leftIcon ? 'pl-10' : 'px-3.5',
              rightIcon ? 'pr-10' : 'px-3.5',
              'py-2 leading-normal',
              error && 'border-gcs-error focus:border-gcs-error focus:ring-gcs-error',
              className
            )}
            {...props}
          />
          {rightIcon && (
            <div className="absolute right-3 text-gcs-muted flex items-center justify-center">
              {rightIcon}
            </div>
          )}
        </div>
        {error && <span className="text-xs text-gcs-error">{error}</span>}
        {!error && helperText && (
          <span className="text-xs text-gcs-muted">{helperText}</span>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';
