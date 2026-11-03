'use client';

/**
 * CartBillSummary
 * Displays subtotal, discount, tax, and grand total from the active session.
 * Uses only server-authoritative paise values.
 */

import React from 'react';
import { PaisePrice } from '@/components/zerowait/PaisePrice';
import type { CartSession } from '@/types/domain';
import { Receipt } from 'lucide-react';

export interface CartBillSummaryProps {
  session: CartSession;
  className?: string;
}

export const CartBillSummary: React.FC<CartBillSummaryProps> = ({ session, className }) => {
  const hasDiscount = session.discount_paise > 0;

  return (
    <div className={`bg-white rounded-[22px] border border-[#E2EDF8] shadow-soft overflow-hidden ${className ?? ''}`}>
      {/* Header */}
      <div className="px-5 py-3.5 border-b border-[#E2EDF8] flex items-center gap-2">
        <div className="w-7 h-7 rounded-xl bg-[#EAF4FF] flex items-center justify-center text-[#4DB3E6]">
          <Receipt className="w-3.5 h-3.5" />
        </div>
        <h3 className="text-sm font-bold text-[#0F2A43]">Bill Summary</h3>
        <span className="ml-auto text-[11px] font-semibold text-[#7B8BA0]">
          {session.total_items} item{session.total_items !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Rows */}
      <div className="px-5 py-4 space-y-2.5">
        <BillRow label="Subtotal" paise={session.subtotal_paise} />

        {hasDiscount && (
          <BillRow
            label="Discount"
            paise={-session.discount_paise}
            className="text-[#10B981]"
          />
        )}

        <BillRow label="GST / Tax" paise={session.tax_paise} muted />

        {/* Divider */}
        <div className="border-t border-[#E2EDF8] pt-2.5">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-[#0F2A43]">Total</span>
            <PaisePrice paise={session.grand_total_paise} size="lg" />
          </div>
        </div>
      </div>
    </div>
  );
};

interface BillRowProps {
  label: string;
  paise: number;
  muted?: boolean;
  className?: string;
}

const BillRow: React.FC<BillRowProps> = ({ label, paise, muted, className }) => (
  <div className={`flex items-center justify-between text-xs ${className ?? ''}`}>
    <span className={muted ? 'text-[#7B8BA0]' : 'text-[#475569] font-medium'}>{label}</span>
    <PaisePrice paise={Math.abs(paise)} size="sm" className={paise < 0 ? 'text-[#10B981]' : ''} />
  </div>
);
