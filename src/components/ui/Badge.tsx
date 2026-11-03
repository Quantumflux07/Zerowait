import React from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'green' | 'amber' | 'red' | 'blue' | 'slate';
  dot?: boolean;
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  className,
  variant = 'slate',
  dot = false,
  ...props
}) => {
  const variantStyles = {
    green: 'bg-[#E8F9F1] text-[#0F766E] border-[#A7F3D0]',
    amber: 'bg-[#FEF3C7] text-[#B45309] border-[#FDE68A]',
    red: 'bg-[#FEE2E2] text-[#B91C1C] border-[#FECACA]',
    blue: 'bg-[#E0F2FE] text-[#0369A1] border-[#BAE6FD]',
    slate: 'bg-[#F1F5F9] text-[#475569] border-[#E2E8F0]',
  };

  const dotColors = {
    green: 'bg-[#10B981]',
    amber: 'bg-[#F59E0B]',
    red: 'bg-[#EF4444]',
    blue: 'bg-[#4DB3E6]',
    slate: 'bg-[#94A3B8]',
  };

  return (
    <span
      className={twMerge(
        clsx(
          'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border',
          variantStyles[variant],
          className
        )
      )}
      {...props}
    >
      {dot && <span className={clsx('w-2 h-2 rounded-full', dotColors[variant])} />}
      {children}
    </span>
  );
};
