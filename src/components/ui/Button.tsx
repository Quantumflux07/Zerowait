import React from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'icon';
  size?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
  icon?: React.ReactNode;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      children,
      className,
      variant = 'primary',
      size = 'md',
      fullWidth = false,
      icon,
      disabled,
      ...props
    },
    ref
  ) => {
    const baseStyles =
      'inline-flex items-center justify-center font-medium transition-all duration-200 select-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed';

    const pillRadius = 'rounded-full';

    const sizeStyles = {
      sm: 'text-xs px-3.5 py-1.5 min-h-[36px] gap-1.5',
      md: 'text-sm px-5 py-2.5 min-h-[44px] gap-2 font-medium',
      lg: 'text-base px-7 py-3 min-h-[50px] gap-2.5 font-semibold',
    };

    const variantStyles = {
      primary:
        'bg-[#4DB3E6] hover:bg-[#3AA3D8] active:bg-[#2A93C8] text-white shadow-sm hover:shadow-md focus:ring-[#4DB3E6]/40',
      secondary:
        'bg-[#E0F2FE] hover:bg-[#BAE6FD] text-[#0284C7] active:bg-[#7DD3FC] focus:ring-[#7DD3FC]/40',
      outline:
        'border border-[#E2EDF8] bg-white hover:bg-[#F0F9FF] text-[#0F2A43] focus:ring-[#4DB3E6]/30',
      ghost:
        'text-[#7B8BA0] hover:text-[#0F2A43] hover:bg-[#EAF4FF] active:bg-[#E0F2FE]',
      danger:
        'bg-[#EF4444] hover:bg-[#DC2626] text-white focus:ring-[#EF4444]/40',
      icon:
        'p-2.5 min-h-[44px] min-w-[44px] rounded-full text-[#7B8BA0] hover:text-[#0F2A43] hover:bg-white border border-[#E2EDF8]',
    };

    return (
      <button
        ref={ref}
        disabled={disabled}
        className={twMerge(
          clsx(
            baseStyles,
            pillRadius,
            variant !== 'icon' && sizeStyles[size],
            variantStyles[variant],
            fullWidth && 'w-full',
            className
          )
        )}
        {...props}
      >
        {icon && <span className="flex-shrink-0">{icon}</span>}
        {children}
      </button>
    );
  }
);

Button.displayName = 'Button';
