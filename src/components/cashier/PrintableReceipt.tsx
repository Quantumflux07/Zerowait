'use client';

/**
 * PrintableReceipt
 * 
 * Professional, print-ready supermarket tax invoice receipt.
 * Optimized for standard desktop printers, print-to-PDF, and 80mm thermal receipt formats.
 * 
 * Rules:
 * - When printing (via window.print() or Ctrl+P), all app layout, buttons, and navigation
 *   are hidden, leaving only the receipt content cleanly formatted.
 * - Shows clear "PENDING / UNPAID" status prior to settlement, and "PAID" with transaction ref after settlement.
 * - Generating or printing does NOT mutate payment state.
 */

import React from 'react';
import { Printer, X, ShieldCheck, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { formatPaiseToInr } from '@/lib/engine/pricing';
import type { Cart, CartSession, CartItem, Lane, LaneAssignment, CheckoutTransaction } from '@/types/domain';

export interface PrintableReceiptProps {
  isOpen: boolean;
  onClose: () => void;
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
  transaction?: CheckoutTransaction | null;
  cashierName?: string;
  storeName?: string;
  storeAddress?: string;
  storeCode?: string;
}

export const PrintableReceipt: React.FC<PrintableReceiptProps> = ({
  isOpen,
  onClose,
  cart,
  session,
  assignment,
  items,
  authoritativeBill,
  transaction,
  cashierName = 'Counter Staff #1',
  storeName = 'Avenue Store Market',
  storeAddress = '45 St. South Urban, Los Angeles, CA 90001',
  storeCode = 'AVENUE-001',
}) => {
  if (!isOpen) return null;

  const isPaid = !!transaction || session.status === 'PAID';
  const billNumber = transaction?.invoice_number || `BILL-PRE-${session.id.slice(0, 8).toUpperCase()}`;
  const printDate = transaction?.completed_at
    ? new Date(transaction.completed_at).toLocaleString('en-IN')
    : new Date().toLocaleString('en-IN');

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#0F2A43]/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto print:p-0 print:bg-white print:static print:z-auto">
      {/* CSS print-specific isolation */}
      <style jsx global>{`
        @media print {
          body * {
            visibility: hidden;
          }
          #zerowait-printable-receipt,
          #zerowait-printable-receipt * {
            visibility: visible;
          }
          #zerowait-printable-receipt {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            margin: 0;
            padding: 1.5rem;
            box-shadow: none !important;
            border: none !important;
            border-radius: 0 !important;
          }
          .no-print {
            display: none !important;
          }
        }
      `}</style>

      <div className="bg-white rounded-[26px] max-w-lg w-full overflow-hidden shadow-2xl border border-[#E2EDF8] my-8 print:my-0 print:border-none print:shadow-none">
        {/* Top Control Bar (Hidden on print) */}
        <div className="no-print p-4 bg-[#F8FBFE] border-b border-[#E2EDF8] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Printer className="w-4 h-4 text-[#0369A1]" />
            <span className="text-xs font-bold text-[#0F2A43]">Tax Invoice Preview</span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={handlePrint}
              icon={<Printer className="w-3.5 h-3.5" />}
              className="font-bold text-xs"
            >
              Print Receipt
            </Button>
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-full hover:bg-[#E2EDF8] flex items-center justify-center text-[#7B8BA0] transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Printable Receipt Paper Container */}
        <div
          id="zerowait-printable-receipt"
          className="p-6 sm:p-8 font-mono text-[12px] text-[#0F2A43] leading-tight space-y-4 bg-white"
        >
          {/* Header */}
          <div className="text-center space-y-1 pb-4 border-b border-dashed border-[#CBD5E1]">
            <h1 className="text-base font-black tracking-wider uppercase">{storeName}</h1>
            <p className="text-[11px] text-[#64748B]">{storeAddress}</p>
            <p className="text-[10px] text-[#64748B]">GSTIN: 06AAACA1234A1Z5 · Branch: {storeCode}</p>
            <div className="pt-2">
              <span
                className={`inline-block text-[11px] font-bold px-3 py-0.5 rounded-full uppercase border ${
                  isPaid
                    ? 'bg-[#DCFCE7] text-[#15803D] border-[#BBF7D0]'
                    : 'bg-[#FEF3C7] text-[#B45309] border-[#FDE68A]'
                }`}
              >
                {isPaid ? '✔ OFFICIAL TAX INVOICE (PAID)' : '⚠ PROVISIONAL BILL (PENDING PAYMENT)'}
              </span>
            </div>
          </div>

          {/* Meta Info */}
          <div className="grid grid-cols-2 gap-2 text-[11px] py-1 border-b border-dashed border-[#CBD5E1]">
            <div>
              <span className="text-[#64748B] block">Invoice / Bill No:</span>
              <strong className="font-bold">{billNumber}</strong>
            </div>
            <div className="text-right">
              <span className="text-[#64748B] block">Date & Time:</span>
              <span>{printDate}</span>
            </div>
            <div>
              <span className="text-[#64748B] block">Cart Asset:</span>
              <strong>{cart.qr_code} ({cart.cart_label})</strong>
            </div>
            <div className="text-right">
              <span className="text-[#64748B] block">Counter & Token:</span>
              <strong>
                {assignment?.token_number || 'A-000'} · {assignment?.lane?.name || 'Lane 1'}
              </strong>
            </div>
            <div>
              <span className="text-[#64748B] block">Cashier Staff:</span>
              <span>{cashierName}</span>
            </div>
            <div className="text-right">
              <span className="text-[#64748B] block">Payment Mode:</span>
              <strong className="uppercase">{transaction?.payment_method || 'PENDING'}</strong>
            </div>
          </div>

          {/* Line Items Table */}
          <div className="py-2">
            <div className="flex font-bold text-[11px] border-b border-[#0F2A43] pb-1 mb-2">
              <span className="w-1/2">Item Description</span>
              <span className="w-1/6 text-center">Qty</span>
              <span className="w-1/6 text-right">Price</span>
              <span className="w-1/6 text-right">Total</span>
            </div>

            <div className="space-y-2">
              {items.map((item, idx) => (
                <div key={item.id || idx} className="flex text-[11px] leading-snug">
                  <div className="w-1/2 pr-2">
                    <span className="font-semibold block">{item.product_name_snapshot}</span>
                    <span className="text-[10px] text-[#64748B] block">
                      Tax: {(item.tax_rate_basis_points / 100).toFixed(1)}% GST
                    </span>
                  </div>
                  <span className="w-1/6 text-center">{item.quantity}</span>
                  <span className="w-1/6 text-right">{formatPaiseToInr(item.unit_price_paise)}</span>
                  <span className="w-1/6 text-right font-bold">
                    {formatPaiseToInr(item.total_price_paise)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Financial Calculation Totals */}
          <div className="pt-2 border-t border-dashed border-[#CBD5E1] space-y-1.5 text-[12px]">
            <div className="flex justify-between">
              <span className="text-[#64748B]">Total Items:</span>
              <span>{authoritativeBill.total_items}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#64748B]">Subtotal (Excl. Tax):</span>
              <span>{formatPaiseToInr(authoritativeBill.subtotal_paise)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#64748B]">Total Taxes (GST):</span>
              <span>{formatPaiseToInr(authoritativeBill.tax_paise)}</span>
            </div>
            {authoritativeBill.discount_paise > 0 && (
              <div className="flex justify-between text-[#16A34A]">
                <span>Store Promotions / Discount:</span>
                <span>- {formatPaiseToInr(authoritativeBill.discount_paise)}</span>
              </div>
            )}
            <div className="flex justify-between font-black text-sm pt-2 border-t border-[#0F2A43]">
              <span>GRAND TOTAL PAYABLE:</span>
              <span>{formatPaiseToInr(authoritativeBill.grand_total_paise)}</span>
            </div>
          </div>

          {/* Settlement Details if Paid */}
          {isPaid && (
            <div className="p-3 bg-[#F0FDF4] border border-[#BBF7D0] rounded-xl text-[11px] space-y-1">
              <div className="flex justify-between">
                <span className="text-[#166534]">Payment Status:</span>
                <strong className="text-[#166534]">PAID & RECONCILED</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-[#166534]">Payment Method:</span>
                <span className="font-bold">{transaction?.payment_method || 'CASH'}</span>
              </div>
              {transaction?.payment_reference && (
                <div className="flex justify-between">
                  <span className="text-[#166534]">Txn Reference:</span>
                  <span className="font-mono text-[10px]">{transaction.payment_reference}</span>
                </div>
              )}
            </div>
          )}

          {/* Footer / Barcode decoration */}
          <div className="text-center pt-4 border-t border-dashed border-[#CBD5E1] space-y-1.5">
            <p className="text-[11px] font-bold">Thank you for shopping with ZeroWait!</p>
            <p className="text-[10px] text-[#64748B]">Instant Verification · No Queues · Smooth Checkouts</p>
            <div className="font-mono text-[9px] tracking-widest text-[#94A3B8] pt-1">
              *{billNumber}*
            </div>
          </div>
        </div>

        {/* Modal Bottom Actions (Hidden on print) */}
        <div className="no-print p-4 bg-[#F8FBFE] border-t border-[#E2EDF8] flex items-center justify-between">
          <span className="text-xs text-[#7B8BA0]">Press Print or Ctrl+P to output receipt</span>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={onClose}>
              Close Preview
            </Button>
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={handlePrint}
              icon={<Printer className="w-3.5 h-3.5" />}
              className="font-bold"
            >
              Print Receipt
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

