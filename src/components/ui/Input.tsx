import React from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  variant?: 'pill' | 'rounded';
  error?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  (
    {
      className,
      leftIcon,
      rightIcon,
      variant = 'pill',
      error,
      disabled,
      ...props
    },
    ref
  ) => {
    return (
      <div className="w-full">
        <div className="relative flex items-center w-full">
          {leftIcon && (
            <div className="absolute left-4 text-[#7B8BA0] pointer-events-none flex items-center justify-center">
              {leftIcon}
            </div>
          )}
          <input
            ref={ref}
            disabled={disabled}
            className={twMerge(
              clsx(
                'w-full bg-white border text-sm text-[#0F2A43] placeholder-[#94A3B8] transition-all duration-200 outline-none min-h-[46px]',
                variant === 'pill' ? 'rounded-full' : 'rounded-[16px]',
                leftIcon ? 'pl-11' : 'pl-4',
                rightIcon ? 'pr-11' : 'pr-4',
                error
                  ? 'border-[#EF4444] focus:ring-2 focus:ring-[#EF4444]/20'
                  : 'border-[#E2EDF8] hover:border-[#CBD5E1] focus:border-[#4DB3E6] focus:ring-2 focus:ring-[#4DB3E6]/25',
                disabled && 'opacity-60 cursor-not-allowed bg-slate-50',
                className
              )
            )}
            {...props}
          />
          {rightIcon && (
            <div className="absolute right-4 text-[#7B8BA0] flex items-center justify-center">
              {rightIcon}
            </div>
          )}
        </div>
        {error && <p className="mt-1.5 text-xs text-[#EF4444] pl-3 font-medium">{error}</p>}
      </div>
    );
  }
);

Input.displayName = 'Input';
