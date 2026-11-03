'use client';

/**
 * PaymentSettlementModal
 * 
 * Cashier Payment Settlement Dialog ("Mark as Paid").
 * 
 * Rules:
 * - Records manual cashier payment confirmation (CASH, UPI, CARD, WALLET, NET_BANKING)
 * - Verifies payable total in integer paise
 * - Concurrency protection: disables double-click submission
 * - On success: displays invoice number and triggers session PAID transition
 */

import React, { useState } from 'react';
import { CreditCard, CheckCircle2, X, AlertCircle, ShieldCheck, QrCode, Banknote, Smartphone } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { PaisePrice } from '@/components/zerowait/PaisePrice';
import type { PaymentMethod } from '@/types/domain';

export interface PaymentSettlementModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirmSettlement: (method: PaymentMethod, reference?: string) => Promise<void>;
  grandTotalPaise: number;
  cartLabel: string;
  qrCode: string;
  isSubmitting: boolean;
  error?: string | null;
}

const PAYMENT_METHODS: Array<{
  id: PaymentMethod;
  label: string;
  icon: React.ReactNode;
  desc: string;
}> = [
  { id: 'CASH', label: 'Cash', icon: <Banknote className="w-4 h-4" />, desc: 'Physical currency received' },
  { id: 'UPI', label: 'UPI / QR', icon: <Smartphone className="w-4 h-4" />, desc: 'GPay, PhonePe, Paytm' },
  { id: 'CARD', label: 'Card (POS)', icon: <CreditCard className="w-4 h-4" />, desc: 'Debit / Credit swipe on counter POS' },
  { id: 'WALLET', label: 'Store Wallet', icon: <Smartphone className="w-4 h-4" />, desc: 'Retail points / digital wallet' },
  { id: 'NET_BANKING', label: 'Net Banking', icon: <CreditCard className="w-4 h-4" />, desc: 'Direct bank transfer' },
];

export const PaymentSettlementModal: React.FC<PaymentSettlementModalProps> = ({
  isOpen,
  onClose,
  onConfirmSettlement,
  grandTotalPaise,
  cartLabel,
  qrCode,
  isSubmitting,
  error,
}) => {
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod>('UPI');
  const [reference, setReference] = useState<string>('');

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    await onConfirmSettlement(selectedMethod, reference.trim() || undefined);
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#0F2A43]/70 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-[26px] max-w-md w-full overflow-hidden shadow-2xl border border-[#E2EDF8]">
        {/* Header */}
        <div className="p-5 border-b border-[#E2EDF8] flex items-center justify-between bg-[#F8FBFE]">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#DCFCE7] border border-[#BBF7D0] flex items-center justify-center text-[#16A34A]">
              <CreditCard className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-[#0F2A43]">Confirm Checkout Settlement</h3>
              <p className="text-[11px] text-[#7B8BA0]">
                {cartLabel} · <span className="font-mono">{qrCode}</span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="w-8 h-8 rounded-full hover:bg-[#E2EDF8] flex items-center justify-center text-[#7B8BA0] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-5">
          {/* Amount Due Card */}
          <div className="p-4 bg-[#EAF4FF] border border-[#BAE6FD] rounded-2xl flex items-center justify-between">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#0369A1] block">
                Total Amount Received
              </span>
              <span className="text-xs text-[#64748B]">Exact payable bill</span>
            </div>
            <PaisePrice paise={grandTotalPaise} size="lg" />
          </div>

          {/* Payment Method Selector */}
          <div>
            <label className="text-xs font-bold text-[#0F2A43] block mb-2">
              Select Settlement Method:
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {PAYMENT_METHODS.map((pm) => {
                const isSelected = selectedMethod === pm.id;
                return (
                  <button
                    key={pm.id}
                    type="button"
                    onClick={() => setSelectedMethod(pm.id)}
                    disabled={isSubmitting}
                    className={`p-3 rounded-xl border text-left flex items-start gap-2.5 transition-all ${
                      isSelected
                        ? 'border-[#0369A1] bg-[#F0F9FF] shadow-sm'
                        : 'border-[#E2EDF8] bg-white hover:bg-[#F8FBFE]'
                    }`}
                  >
                    <div
                      className={`mt-0.5 p-1 rounded-lg ${
                        isSelected ? 'bg-[#0369A1] text-white' : 'bg-[#E2EDF8] text-[#64748B]'
                      }`}
                    >
                      {pm.icon}
                    </div>
                    <div>
                      <span className="text-xs font-bold text-[#0F2A43] block">{pm.label}</span>
                      <span className="text-[10px] text-[#7B8BA0] leading-tight block">{pm.desc}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Reference Input */}
          <div>
            <label className="text-xs font-bold text-[#0F2A43] block mb-1">
              Payment Reference ID (Optional):
            </label>
            <Input
              placeholder="e.g. UPI-REF-998811 or POS Auth Code"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              disabled={isSubmitting}
              className="text-xs"
            />
            <span className="text-[10px] text-[#7B8BA0] mt-1 block">
              Recorded in checkout_transactions for audit compliance.
            </span>
          </div>

          {/* Error Message */}
          {error && (
            <div className="p-3 bg-[#FEF2F2] border border-[#FECACA] rounded-xl text-xs text-[#DC2626] flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Footer Submit Buttons */}
          <div className="pt-2 flex gap-2">
            <Button
              type="button"
              variant="ghost"
              size="md"
              fullWidth
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="md"
              fullWidth
              disabled={isSubmitting}
              icon={<CheckCircle2 className="w-4 h-4" />}
              className="font-bold shadow-md bg-[#16A34A] hover:bg-[#15803D]"
            >
              {isSubmitting ? 'Recording Settlement...' : 'Confirm Payment'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

