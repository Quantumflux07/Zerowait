import React from 'react';
import { formatPaiseToInr } from '@/lib/engine/pricing';
import { clsx } from 'clsx';

export interface PaisePriceProps {
  paise: number;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  label?: string;
  className?: string;
}

export const PaisePrice: React.FC<PaisePriceProps> = ({
  paise,
  size = 'md',
  label,
  className,
}) => {
  const formatted = formatPaiseToInr(paise);

  const sizeClasses = {
    sm: 'text-xs font-semibold',
    md: 'text-sm font-bold',
    lg: 'text-lg font-extrabold',
    xl: 'text-2xl md:text-3xl font-black',
  };

  return (
    <div className={clsx('inline-flex flex-col', className)}>
      {label && (
        <span className="text-[10px] uppercase tracking-wider font-semibold text-[#7B8BA0]">
          {label}
        </span>
      )}
      <span className={clsx('text-[#0F2A43] tracking-tight', sizeClasses[size])}>
        {formatted}
      </span>
    </div>
  );
};
