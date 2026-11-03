'use client';

/**
 * ZeroWait — Cashier Counter Module Main Page
 * Route: /cashier
 *
 * Dedicated Cashier Station Interface:
 * - Counter staff identification & lane assignment
 * - Dedicated cart QR scanner (separate from product barcode scanner)
 * - Server-side cart validation & queue lane verification
 * - Spot-check item inspection against physical bags
 * - Server-authoritative bill breakdown in integer paise
 * - Printable tax receipt generation
 * - Atomic "Mark as Paid" checkout completion and cart release
 */

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  Home,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Printer,
  CreditCard,
  Layers,
  Sparkles,
  ArrowRight,
  LogOut,
} from 'lucide-react';
import { AppHeader } from '@/components/layout/AppHeader';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { CashierHeader } from '@/components/cashier/CashierHeader';
import { CashierQrScanner } from '@/components/cashier/CashierQrScanner';
import { CheckoutBillView } from '@/components/cashier/CheckoutBillView';
import { PrintableReceipt } from '@/components/cashier/PrintableReceipt';
import { PaymentSettlementModal } from '@/components/cashier/PaymentSettlementModal';
import type {
  Cart,
  CartSession,
  CartItem,
  Lane,
  LaneAssignment,
  CheckoutTransaction,
  PaymentMethod,
} from '@/types/domain';
import type { CashierCartDetails, CashierCartValidationResponse, CashierSettleResponse } from '@/types/api';

export default function CashierPage() {
  // Cashier State & Station Identity
  const [cashierProfile] = useState({
    id: 'staff-001',
    name: 'Sarah Jenkins',
    email: 'sarah.cashier@avenue.store',
    role: 'STAFF',
  });

  const [lanes, setLanes] = useState<Lane[]>([]);
  const [selectedLaneId, setSelectedLaneId] = useState<string>('d1111111-1111-1111-1111-111111111111'); // Default: Counter 1 Express

  // Active Scanned Cart State
  const [activeQr, setActiveQr] = useState<string | null>(null);
  const [cartDetails, setCartDetails] = useState<CashierCartDetails | null>(null);
  const [transaction, setTransaction] = useState<CheckoutTransaction | null>(null);

  // Status & Feedback
  const [isLoadingLanes, setIsLoadingLanes] = useState<boolean>(true);
  const [isValidatingCart, setIsValidatingCart] = useState<boolean>(false);
  const [isSubmittingSettlement, setIsSubmittingSettlement] = useState<boolean>(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [settlementError, setSettlementError] = useState<string | null>(null);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);

  // Modals
  const [isReceiptOpen, setIsReceiptOpen] = useState<boolean>(false);
  const [isSettlementOpen, setIsSettlementOpen] = useState<boolean>(false);

  // 1. Fetch available checkout lanes on mount
  useEffect(() => {
    async function fetchLanes() {
      try {
        const res = await fetch('/api/v1/cashier/lanes');
        const json = await res.json();
        if (json.success && json.data?.lanes) {
          setLanes(json.data.lanes);
          if (json.data.lanes.length > 0 && !selectedLaneId) {
            setSelectedLaneId(json.data.lanes[0].id);
          }
        }
      } catch (err) {
        console.warn('Failed to load lanes:', err);
      } finally {
        setIsLoadingLanes(false);
      }
    }
    fetchLanes();
  }, [selectedLaneId]);

  // 2. Validate Scanned Cart QR Code
  const handleScanCart = useCallback(
    async (qrCode: string) => {
      setScanError(null);
      setSuccessBanner(null);
      setIsValidatingCart(true);

      try {
        const url = `/api/v1/cashier/carts/${encodeURIComponent(qrCode)}?lane_id=${encodeURIComponent(
          selectedLaneId
        )}`;
        const res = await fetch(url);
        const json: CashierCartValidationResponse = await res.json();

        if (!json.success || !json.data) {
          setScanError(json.error?.message || 'Cart validation failed.');
          setCartDetails(null);
          setActiveQr(null);
          return;
        }

        const data = json.data;
        setActiveQr(qrCode);
        setCartDetails(data);
        setTransaction(null);

        // Auto trigger counter check-in (marks status AT_CHECKOUT and assignment SERVING)
        if (data.session.status === 'ASSIGNED_LOCKED' && !data.lane_mismatch) {
          fetch('/api/v1/cashier/checkin', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              session_id: data.session.id,
              lane_id: selectedLaneId,
            }),
          }).catch((e) => console.warn('Checkin non-blocking error:', e));
        }
      } catch (err: unknown) {
        setScanError(err instanceof Error ? err.message : 'Network error during cart validation.');
        setCartDetails(null);
        setActiveQr(null);
      } finally {
        setIsValidatingCart(false);
      }
    },
    [selectedLaneId]
  );

  // 3. Mark as Paid Settlement Confirmation
  const handleConfirmSettlement = async (method: PaymentMethod, reference?: string) => {
    if (!cartDetails) return;

    setIsSubmittingSettlement(true);
    setSettlementError(null);

    try {
      const res = await fetch('/api/v1/cashier/settle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: cartDetails.session.id,
          payment_method: method,
          payment_reference: reference,
          amount_paise: cartDetails.authoritative_bill.grand_total_paise,
          cashier_lane_id: selectedLaneId,
        }),
      });

      const json: CashierSettleResponse = await res.json();

      if (!json.success || !json.data) {
        setSettlementError(json.error?.message || 'Settlement failed.');
        return;
      }

      const txData = json.data;
      const completedTx: CheckoutTransaction = {
        id: txData.transaction_id,
        store_id: cartDetails.cart.store_id,
        session_id: cartDetails.session.id,
        payment_method: txData.payment_method,
        payment_reference: reference || null,
        amount_paise: txData.amount_paise,
        status: 'COMPLETED',
        invoice_number: txData.invoice_number,
        payment_gateway_response: null,
        completed_at: txData.completed_at,
        created_at: txData.completed_at,
      };

      setTransaction(completedTx);
      setCartDetails((prev) =>
        prev
          ? {
              ...prev,
              session: { ...prev.session, status: 'PAID' },
              assignment: prev.assignment
                ? { ...prev.assignment, assignment_status: 'COMPLETED' }
                : null,
            }
          : null
      );

      setIsSettlementOpen(false);
      setSuccessBanner(
        `Payment confirmed successfully! Invoice: ${txData.invoice_number}. Receipt generated.`
      );
    } catch (err: unknown) {
      setSettlementError(err instanceof Error ? err.message : 'Error processing settlement.');
    } finally {
      setIsSubmittingSettlement(false);
    }
  };

  // 4. Release Cart Session (Frees the physical cart for a new customer)
  const handleReleaseCart = async () => {
    if (!cartDetails) return;
    try {
      await fetch('/api/v1/cashier/release', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: cartDetails.session.id }),
      });

      setSuccessBanner(
        `Cart ${cartDetails.cart.cart_label} (${cartDetails.cart.qr_code}) is now released and ready for a new customer!`
      );
      setCartDetails(null);
      setActiveQr(null);
      setTransaction(null);
    } catch (err) {
      console.warn('Error releasing cart:', err);
    }
  };

  const handleClearCurrentCart = () => {
    setActiveQr(null);
    setCartDetails(null);
    setTransaction(null);
    setScanError(null);
    setSuccessBanner(null);
  };

  return (
    <div className="min-h-screen bg-[#EAF4FF] text-[#0F2A43] flex flex-col">
      <AppHeader />

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-6 sm:py-10">
        {/* Breadcrumb Navigation */}
        <div className="flex items-center justify-between gap-3 mb-6">
          <div className="flex items-center gap-2 text-xs text-[#7B8BA0]">
            <Link href="/" className="hover:text-[#0F2A43] transition-colors">
              <Home className="w-3.5 h-3.5" />
            </Link>
            <span>/</span>
            <span className="font-semibold text-[#0F2A43]">Cashier Counter Station</span>
          </div>

          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#10B981] animate-pulse" />
            <span className="text-xs font-bold text-[#0F2A43]">Cashier Console Active</span>
          </div>
        </div>

        {/* Cashier Station Profile & Lane Selector */}
        <CashierHeader
          cashierName={cashierProfile.name}
          cashierEmail={cashierProfile.email}
          role={cashierProfile.role}
          lanes={lanes}
          selectedLaneId={selectedLaneId}
          onSelectLane={(id) => {
            setSelectedLaneId(id);
            // Re-validate if cart is loaded
            if (activeQr) {
              handleScanCart(activeQr);
            }
          }}
        />

        {/* Global Success Banner */}
        {successBanner && (
          <div className="mb-6 p-4 bg-[#F0FDF4] border border-[#BBF7D0] rounded-2xl flex items-center justify-between gap-3 animate-in fade-in">
            <div className="flex items-center gap-2.5">
              <CheckCircle2 className="w-5 h-5 text-[#16A34A] shrink-0" />
              <span className="text-xs font-bold text-[#166534]">{successBanner}</span>
            </div>
            <button
              onClick={() => setSuccessBanner(null)}
              className="text-xs text-[#166534] hover:underline font-semibold"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Two-Column Cashier Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column: QR Scanner & Cart Identification (4 cols) */}
          <div className="lg:col-span-4 space-y-5">
            <CashierQrScanner
              onScan={handleScanCart}
              isProcessing={isValidatingCart}
              activeQrCode={activeQr}
              error={scanError}
              onClear={handleClearCurrentCart}
            />

            {/* Cashier Instructions Card */}
            <div className="bg-white rounded-[24px] border border-[#E2EDF8] shadow-soft p-5 text-xs text-[#64748B] space-y-2.5">
              <h4 className="font-bold text-[#0F2A43] flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-[#4DB3E6]" />
                Cashier Protocol
              </h4>
              <p className="leading-relaxed">
                1. Customer arrives at counter with locked cart.
              </p>
              <p className="leading-relaxed">
                2. Scan cart QR to verify token, lane match, and authoritative bill.
              </p>
              <p className="leading-relaxed">
                3. Perform bag spot-check against item list.
              </p>
              <p className="leading-relaxed">
                4. Print provisional receipt if requested by customer.
              </p>
              <p className="leading-relaxed">
                5. Receive payment and click <strong>Mark as Paid</strong> to finalize.
              </p>
            </div>
          </div>

          {/* Right Column: Checkout Verification & Bill View (8 cols) */}
          <div className="lg:col-span-8">
            {cartDetails ? (
              <CheckoutBillView
                cart={cartDetails.cart}
                session={cartDetails.session}
                assignment={cartDetails.assignment}
                items={cartDetails.items}
                authoritativeBill={cartDetails.authoritative_bill}
                laneMismatch={cartDetails.lane_mismatch}
                laneMismatchMessage={cartDetails.lane_mismatch_message}
                transaction={transaction}
                onGenerateBill={() => setIsReceiptOpen(true)}
                onOpenSettlement={() => setIsSettlementOpen(true)}
                onReleaseCart={handleReleaseCart}
                isProcessing={isSubmittingSettlement}
              />
            ) : (
              <div className="bg-white rounded-[24px] border border-[#E2EDF8] shadow-soft p-12 text-center flex flex-col items-center justify-center min-h-[380px]">
                <div className="w-16 h-16 rounded-3xl bg-[#F8FBFE] border border-[#E2EDF8] flex items-center justify-center text-[#7B8BA0] mb-4">
                  <CreditCard className="w-8 h-8 stroke-[1.5]" />
                </div>
                <h3 className="text-base font-bold text-[#0F2A43] mb-1">
                  Ready for Next Customer
                </h3>
                <p className="text-xs text-[#7B8BA0] max-w-sm leading-relaxed mb-6">
                  Scan a customer’s shopping cart QR code using the counter camera or select one of the registered carts.
                </p>
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#E0F2FE] text-[#0369A1] text-xs font-semibold">
                  <Sparkles className="w-3.5 h-3.5" />
                  Try scanning <span className="font-mono font-bold">ZW-CART-005</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Printable Receipt Modal */}
      {cartDetails && (
        <PrintableReceipt
          isOpen={isReceiptOpen}
          onClose={() => setIsReceiptOpen(false)}
          cart={cartDetails.cart}
          session={cartDetails.session}
          assignment={cartDetails.assignment}
          items={cartDetails.items}
          authoritativeBill={cartDetails.authoritative_bill}
          transaction={transaction}
          cashierName={cashierProfile.name}
        />
      )}

      {/* Payment Settlement Modal */}
      {cartDetails && (
        <PaymentSettlementModal
          isOpen={isSettlementOpen}
          onClose={() => setIsSettlementOpen(false)}
          onConfirmSettlement={handleConfirmSettlement}
          grandTotalPaise={cartDetails.authoritative_bill.grand_total_paise}
          cartLabel={cartDetails.cart.cart_label}
          qrCode={cartDetails.cart.qr_code}
          isSubmitting={isSubmittingSettlement}
          error={settlementError}
        />
      )}
    </div>
  );
}

