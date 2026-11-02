import React from 'react';
import Link from 'next/link';
import { BrandLogo } from '@/components/zerowait/BrandLogo';
import { Store, GitBranch, ShoppingCart, Users } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';

export interface AppHeaderProps {
  storeName?: string;
  storeCode?: string;
}

export const AppHeader: React.FC<AppHeaderProps> = ({
  storeName = 'Avenue Store Market',
  storeCode = 'AVENUE-001',
}) => {
  return (
    <header className="h-[70px] bg-white/85 backdrop-blur-md border-b border-[#E2EDF8] sticky top-0 z-30 px-4 sm:px-8 flex items-center justify-between">
      <div className="flex items-center gap-6">
        <BrandLogo size="md" />

        {/* Store Identifier Badge */}
        <div className="hidden sm:flex items-center gap-2 bg-[#F8FBFE] border border-[#E2EDF8] px-3.5 py-1.5 rounded-full text-xs">
          <Store className="w-3.5 h-3.5 text-[#4DB3E6]" />
          <span className="font-semibold text-[#0F2A43]">{storeName}</span>
          <span className="font-mono text-[10px] text-[#7B8BA0] bg-white px-1.5 py-0.5 rounded border border-[#E2EDF8]">
            {storeCode}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-3">
        {/* Module Nav */}
        <nav className="hidden sm:flex items-center gap-1">
          <Link
            href="/cart"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold text-[#7B8BA0] hover:text-[#0F2A43] hover:bg-[#EAF4FF] transition-colors"
          >
            <ShoppingCart className="w-3.5 h-3.5" />
            Cart
          </Link>
          <Link
            href="/queue"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold text-[#7B8BA0] hover:text-[#0F2A43] hover:bg-[#EAF4FF] transition-colors"
          >
            <Users className="w-3.5 h-3.5" />
            Queue
          </Link>
        </nav>

        {/* Branch Scope Indicator */}
        <div className="flex items-center gap-1.5 bg-[#E0F2FE] border border-[#BAE6FD] text-[#0369A1] px-3 py-1 rounded-full text-xs font-bold">
          <GitBranch className="w-3.5 h-3.5 text-[#4DB3E6]" />
          <span>develop</span>
        </div>

        <Badge variant="green" dot className="hidden md:inline-flex">
          Foundation Active
        </Badge>
      </div>
    </header>
  );
};
