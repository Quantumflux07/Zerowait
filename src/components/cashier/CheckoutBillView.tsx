'use client';

/**
 * CheckoutBillView
 * 
 * Displays verified cashier checkout details:
 * - Scanned cart asset & active session info
 * - Assigned queue token & counter details
 * - Lane mismatch alert (blocks payment if station unauthorized)
 * - Itemized scanned product list with spot-check verification toggles
 * - Server-authoritative bill breakdown in integer paise
 * - Generate Bill & Mark as Paid actions
 */

import React, { useState } from 'react';
import {
  ShoppingCart,
  Receipt,
  CheckCircle2,
  AlertTriangle,
  CreditCard,
  Printer,
  ShieldCheck,
  CheckSquare,
  Square,
  Sparkles,
  ArrowRight,
  Battery,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { PaisePrice } from '@/components/zerowait/PaisePrice';
import { formatPaiseToInr } from '@/lib/engine/pricing';
import type { Cart, CartSession, CartItem, LaneAssignment, CheckoutTransaction } from '@/types/domain';

export interface CheckoutBillViewProps {
  cart: Cart;
  session: CartSession;
  assignment: LaneAssignment | null;
  items: CartItem[];
  authoritativeBill: {
    total_items: number;
    subtotal_paise: number;
    tax_paise: number;
    discount_paise: number;
    grand_total_paise: number;
  };
  laneMismatch: boolean;
  laneMismatchMessage?: string;
  transaction?: CheckoutTransaction | null;
  onGenerateBill: () => void;
  onOpenSettlement: () => void;
  onReleaseCart: () => void;
  isProcessing: boolean;
}

export const CheckoutBillView: React.FC<CheckoutBillViewProps> = ({
  cart,
  session,
  assignment,
  items,
  authoritativeBill,
  laneMismatch,
  laneMismatchMessage,
  transaction,
  onGenerateBill,
  onOpenSettlement,
  onReleaseCart,
  isProcessing,
}) => {
  const [verifiedItemIds, setVerifiedItemIds] = useState<Set<string>>(new Set());

  const toggleItemVerified = (itemId: string) => {
    setVerifiedItemIds((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }
      return next;
    });
  };

  const verifyAllItems = () => {
    const all = new Set(items.map((i) => i.id));
    setVerifiedItemIds(all);
  };

  const isPaid = !!transaction || session.status === 'PAID';
  const isClosed = session.status === 'CLOSED';
  const allVerified = items.length > 0 && verifiedItemIds.size === items.length;

  return (
    <div className="space-y-6">
      {/* 1. Header Card: Cart & Queue Info */}
      <div className="bg-white rounded-[24px] border border-[#E2EDF8] shadow-soft p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#E2EDF8]">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-[#E0F2FE] border border-[#BAE6FD] flex items-center justify-center text-[#0369A1]">
              <ShoppingCart className="w-6 h-6 stroke-[2.2]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-[#0F2A43]">{cart.cart_label}</h3>
                <span className="font-mono text-xs font-bold bg-[#F8FBFE] border border-[#E2EDF8] px-2 py-0.5 rounded text-[#0369A1]">
                  {cart.qr_code}
                </span>
                <span className="flex items-center gap-1 text-[11px] text-[#7B8BA0]">
                  <Battery className="w-3.5 h-3.5 text-[#10B981]" />
                  {cart.battery_level}%
                </span>
              </div>
              <p className="text-xs text-[#7B8BA0]">
                Session ID: <span className="font-mono">{session.id.slice(0, 13)}…</span>
              </p>
            </div>
          </div>

          {/* Queue Token Badge */}
          <div className="flex items-center gap-2">
            <div className="bg-[#0F2A43] text-white px-4 py-2 rounded-2xl text-center">
              <span className="text-[10px] uppercase font-bold text-[#94A3B8] block">Token</span>
              <span className="text-lg font-black tracking-wider">
                {assignment?.token_number || 'A-000'}
              </span>
            </div>

            <div className="text-right">
              <Badge
                variant={isPaid ? 'green' : 'blue'}
                className="text-[10px] uppercase font-bold"
              >
                {session.status}
              </Badge>
              <span className="text-[11px] text-[#7B8BA0] block mt-1">
                {assignment?.lane?.name || 'Assigned Counter'}
              </span>
            </div>
          </div>
        </div>

        {/* Lane Mismatch Warning */}
        {laneMismatch && (
          <div className="mt-4 p-4 bg-[#FEF2F2] border border-[#FECACA] rounded-2xl text-xs text-[#991B1B] flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-[#DC2626] shrink-0 mt-0.5" />
            <div>
              <strong className="block font-bold text-sm mb-0.5">Counter Allocation Mismatch</strong>
              <p className="leading-relaxed">{laneMismatchMessage}</p>
              <p className="text-[11px] text-[#B91C1C] mt-1 font-semibold">
                Customer should be redirected to their designated counter, or you can switch your operating station to verify.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* 2. Items List & Spot-Check Verification */}
      <div className="bg-white rounded-[24px] border border-[#E2EDF8] shadow-soft p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h4 className="text-sm font-bold text-[#0F2A43]">Physical Cart Spot-Check</h4>
            <p className="text-xs text-[#7B8BA0]">
              Verify scanned items against physical cart bag ({verifiedItemIds.size}/{items.length} verified)
            </p>
          </div>

          <button
            type="button"
            onClick={verifyAllItems}
            className="text-xs font-bold text-[#0369A1] hover:text-[#0284C7] bg-[#E0F2FE] hover:bg-[#BAE6FD] px-3 py-1.5 rounded-xl border border-[#BAE6FD] transition-colors"
          >
            Mark All Verified
          </button>
        </div>

        {/* Item Rows */}
        <div className="divide-y divide-[#E2EDF8] border border-[#E2EDF8] rounded-2xl overflow-hidden">
          {items.map((item) => {
            const isVerified = verifiedItemIds.has(item.id);
            return (
              <div
                key={item.id}
                onClick={() => toggleItemVerified(item.id)}
                className={`p-3.5 flex items-center justify-between gap-3 cursor-pointer transition-colors ${
                  isVerified ? 'bg-[#F0FDF4]' : 'bg-white hover:bg-[#F8FBFE]'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="text-[#0369A1]">
                    {isVerified ? (
                      <CheckSquare className="w-5 h-5 text-[#16A34A]" />
                    ) : (
                      <Square className="w-5 h-5 text-[#CBD5E1]" />
                    )}
                  </div>
                  <div>
                    <h5 className="text-xs font-bold text-[#0F2A43]">{item.product_name_snapshot}</h5>
                    <div className="flex items-center gap-2 text-[11px] text-[#7B8BA0]">
                      <span className="font-mono">Barcode: {item.barcode_snapshot}</span>
                      <span>·</span>
                      <span>Qty: <strong>{item.quantity}</strong></span>
                      <span>·</span>
                      <span>Tax: {(item.tax_rate_basis_points / 100).toFixed(0)}% GST</span>
                    </div>
                  </div>
                </div>

                <div className="text-right">
                  <span className="text-xs font-bold text-[#0F2A43] block">
                    {formatPaiseToInr(item.total_price_paise)}
                  </span>
                  <span className="text-[10px] text-[#7B8BA0]">
                    {formatPaiseToInr(item.unit_price_paise)} ea
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 3. Server-Authoritative Bill Summary */}
      <div className="bg-white rounded-[24px] border border-[#E2EDF8] shadow-soft p-5">
        <h4 className="text-sm font-bold text-[#0F2A43] mb-3">Authoritative Server Bill</h4>

        <div className="space-y-2.5 text-xs text-[#0F2A43] pb-4 border-b border-[#E2EDF8]">
          <div className="flex justify-between">
            <span className="text-[#7B8BA0]">Total Items Count:</span>
            <span className="font-bold">{authoritativeBill.total_items}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[#7B8BA0]">Subtotal:</span>
            <PaisePrice paise={authoritativeBill.subtotal_paise} size="sm" />
          </div>
          <div className="flex justify-between">
            <span className="text-[#7B8BA0]">Estimated Taxes (GST):</span>
            <PaisePrice paise={authoritativeBill.tax_paise} size="sm" />
          </div>
          {authoritativeBill.discount_paise > 0 && (
            <div className="flex justify-between text-[#16A34A]">
              <span>Applied Discounts / Promos:</span>
              <span className="font-bold">- {formatPaiseToInr(authoritativeBill.discount_paise)}</span>
            </div>
          )}
        </div>

        {/* Grand Total */}
        <div className="pt-4 flex items-center justify-between mb-6">
          <div>
            <span className="text-xs uppercase tracking-wider font-bold text-[#7B8BA0] block">
              Payable Grand Total
            </span>
            <span className="text-xs text-[#10B981] font-semibold flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5" />
              Verified in Integer Paise
            </span>
          </div>
          <PaisePrice paise={authoritativeBill.grand_total_paise} size="xl" />
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-3">
          <Button
            type="button"
            variant="secondary"
            size="md"
            onClick={onGenerateBill}
            icon={<Printer className="w-4 h-4 text-[#0369A1]" />}
            className="flex-1 font-bold py-3 bg-[#F8FBFE] border border-[#BAE6FD] text-[#0369A1]"
          >
            Generate & Print Bill
          </Button>

          {!isPaid ? (
            <Button
              type="button"
              variant="primary"
              size="md"
              onClick={onOpenSettlement}
              disabled={isProcessing || laneMismatch}
              icon={<CreditCard className="w-4 h-4" />}
              className="flex-1 font-bold py-3 shadow-md"
            >
              Mark as Paid
            </Button>
          ) : !isClosed ? (
            <Button
              type="button"
              variant="primary"
              size="md"
              onClick={onReleaseCart}
              disabled={isProcessing}
              icon={<CheckCircle2 className="w-4 h-4" />}
              className="flex-1 font-bold py-3 bg-[#16A34A] hover:bg-[#15803D]"
            >
              Release Cart for Next Customer
            </Button>
          ) : (
            <div className="flex-1 p-3 bg-[#F0FDF4] border border-[#BBF7D0] rounded-xl text-center text-xs font-bold text-[#16A34A] flex items-center justify-center gap-2">
              <CheckCircle2 className="w-4 h-4" />
              Checkout Complete · Cart Unlocked
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

