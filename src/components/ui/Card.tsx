import React from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'highlight' | 'flat';
  padded?: boolean;
}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ children, className, variant = 'default', padded = true, ...props }, ref) => {
    const baseStyles = 'rounded-[22px] transition-all duration-200';

    const variantStyles = {
      default: 'bg-white border border-[#E2EDF8] shadow-soft',
      highlight:
        'bg-gradient-to-br from-[#4DB3E6] to-[#2597D2] text-white shadow-md border-0',
      flat: 'bg-[#F8FBFE] border border-[#EAF2FA]',
    };

    return (
      <div
        ref={ref}
        className={twMerge(
          clsx(
            baseStyles,
            variantStyles[variant],
            padded && 'p-5 md:p-6',
            className
          )
        )}
        {...props}
      >
        {children}
      </div>
    );
  }
);

Card.displayName = 'Card';
