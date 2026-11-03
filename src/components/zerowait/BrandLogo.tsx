import React from 'react';
import { ShoppingCart, Zap } from 'lucide-react';
import { clsx } from 'clsx';

export interface BrandLogoProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export const BrandLogo: React.FC<BrandLogoProps> = ({ size = 'md', className }) => {
  const iconSizes = {
    sm: 'w-7 h-7 text-xs',
    md: 'w-9 h-9 text-sm',
    lg: 'w-11 h-11 text-base',
  };

  const textSizes = {
    sm: 'text-base',
    md: 'text-xl',
    lg: 'text-2xl',
  };

  return (
    <div className={clsx('flex items-center gap-2.5 select-none', className)}>
      <div
        className={clsx(
          'rounded-xl bg-[#E0F2FE] border border-[#BAE6FD] flex items-center justify-center text-[#4DB3E6] relative shadow-sm',
          iconSizes[size]
        )}
      >
        <ShoppingCart className="w-5 h-5 stroke-[2.2]" />
        <span className="absolute -top-1 -right-1 w-3 h-3 bg-[#4DB3E6] rounded-full flex items-center justify-center text-white text-[8px]">
          <Zap className="w-2 h-2 fill-white stroke-none" />
        </span>
      </div>
      <div className={clsx('font-extrabold tracking-tight', textSizes[size])}>
        <span className="text-[#0F2A43]">Zero</span>
        <span className="text-[#4DB3E6]">Wait</span>
      </div>
    </div>
  );
};
