'use client';

/**
 * ZeroWait — Cart Module Main Page
 * Route: /cart
 *
 * This is the customer-facing smart shopping cart interface.
 * It orchestrates all cart features:
 * - Cart QR identity display
 * - Barcode scanning (camera + USB/Bluetooth + manual)
 * - Live product list with quantity controls
 * - Bill summary (subtotal, tax, discounts, total)
 * - Supabase Realtime subscription
 * - ASSIGNED_LOCKED state with lane + token display
 */

import React, { useCallback } from 'react';
import Link from 'next/link';
import { Home, RefreshCw, LogOut } from 'lucide-react';
import { AppHeader } from '@/components/layout/AppHeader';
import { Button } from '@/components/ui/Button';
import { CartHeader } from '@/components/zerowait/CartHeader';
import { BrandLogo } from '@/components/zerowait/BrandLogo';
import { CartLandingScreen } from '@/components/cart/CartLandingScreen';
import { CartQrDisplay } from '@/components/cart/CartQrDisplay';
import { BarcodeScannerInput } from '@/components/cart/BarcodeScannerInput';
import { CartItemList } from '@/components/cart/CartItemList';
import { CartBillSummary } from '@/components/cart/CartBillSummary';
import { AssignedLaneBanner } from '@/components/cart/AssignedLaneBanner';
import { useCartSession } from '@/hooks/useCartSession';

// Map product IDs to images (from mock data for display; production would come from product lookup response)
const PRODUCT_IMAGES: Record<string, string> = {
  'e1111111-1111-1111-1111-111111111111':
    'https://images.unsplash.com/photo-1550583724-b2692b85b150?w=200&auto=format&fit=crop&q=60',
  'e2222222-2222-2222-2222-222222222222':
    'https://images.unsplash.com/photo-1560806887-1e4cd0b6cbd6?w=200&auto=format&fit=crop&q=60',
  'e3333333-3333-3333-3333-333333333333':
    'https://images.unsplash.com/photo-1571771894821-ce9b6c11b08e?w=200&auto=format&fit=crop&q=60',
  'e4444444-4444-4444-4444-444444444444':
    'https://images.unsplash.com/photo-1585421514738-01798e348b17?w=200&auto=format&fit=crop&q=60',
  'e5555555-5555-5555-5555-555555555555':
    'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=200&auto=format&fit=crop&q=60',
};

export default function CartPage() {
  const {
    cart,
    session,
    assignment,
    items,
    isLoading,
    isLocked,
    scanFeedback,
    scanMessage,
    error,
    loadCart,
    scanBarcode,
    updateItemQuantity,
  } = useCartSession();

  const handleLeaveCart = useCallback(() => {
    window.location.reload();
  }, []);

  // ── Landing ───────────────────────────────────────────────────────────────────
  if (!cart || !session) {
    return (
      <CartLandingScreen
        onLoadCart={loadCart}
        isLoading={isLoading}
        error={error}
      />
    );
  }

  // ── Active Cart View ──────────────────────────────────────────────────────────
  const isAssignedLocked = session.status === 'ASSIGNED_LOCKED' || isLocked;

  return (
    <div className="min-h-screen bg-[#EAF4FF] flex flex-col">
      <AppHeader />

      {/* Page container */}
      <main className="flex-1 max-w-5xl w-full mx-auto px-3 sm:px-6 py-5 sm:py-8">

        {/* Top nav: breadcrumb + actions */}
        <div className="flex items-center justify-between gap-3 mb-5">
          <div className="flex items-center gap-2 text-xs text-[#7B8BA0]">
            <Link href="/" className="hover:text-[#0F2A43] transition-colors">
              <Home className="w-3.5 h-3.5" />
            </Link>
            <span>/</span>
            <span className="font-semibold text-[#0F2A43]">Cart · {cart.qr_code}</span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              icon={<RefreshCw className="w-3.5 h-3.5" />}
              onClick={() => loadCart(cart.qr_code)}
              disabled={isLoading}
            >
              Refresh
            </Button>
            <Button
              variant="outline"
              size="sm"
              icon={<LogOut className="w-3.5 h-3.5" />}
              onClick={handleLeaveCart}
            >
              Change Cart
            </Button>
          </div>
        </div>

        {/* Cart Identity Header */}
        <div className="mb-5">
          <CartHeader
            qrCode={cart.qr_code}
            cartLabel={cart.cart_label}
            batteryLevel={cart.battery_level}
            status={session.status}
          />
        </div>

        {/* ASSIGNED_LOCKED full banner */}
        {isAssignedLocked && (
          <div className="mb-5">
            <AssignedLaneBanner assignment={assignment} session={session} />
          </div>
        )}

        {/* Two-column layout on desktop */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-5">

          {/* LEFT: Scanner + Item List */}
          <div className="space-y-5">

            {/* Scanner section — hidden when locked */}
            {!isAssignedLocked && (
              <div className="bg-white rounded-[22px] border border-[#E2EDF8] shadow-soft p-5">
                <div className="flex items-center gap-2 mb-4">
                  <BrandLogo size="sm" />
                  <span className="text-xs font-bold text-[#0F2A43] ml-1">Barcode Scanner</span>
                </div>
                <BarcodeScannerInput
                  onBarcode={scanBarcode}
                  disabled={isAssignedLocked || isLoading}
                  scanFeedback={scanFeedback}
                  scanMessage={scanMessage}
                />
              </div>
            )}

            {/* Product List */}
            <div className="bg-white rounded-[22px] border border-[#E2EDF8] shadow-soft p-5">
              <CartItemList
                items={items}
                onQuantityChange={isAssignedLocked ? undefined : updateItemQuantity}
                disabled={isAssignedLocked}
                productImages={PRODUCT_IMAGES}
              />
            </div>
          </div>

          {/* RIGHT: QR Display + Bill */}
          <div className="space-y-5">

            {/* Cart QR Code */}
            <div className="bg-white rounded-[22px] border border-[#E2EDF8] shadow-soft p-5 flex flex-col items-center gap-4">
              <CartQrDisplay
                qrCode={cart.qr_code}
                cartLabel={cart.cart_label}
                size={140}
              />
              <p className="text-[11px] text-[#7B8BA0] text-center leading-relaxed max-w-[180px]">
                This QR identifies your physical cart hardware. Show at checkout if needed.
              </p>
            </div>

            {/* Bill Summary */}
            {session && <CartBillSummary session={session} />}
          </div>
        </div>

        {/* Footer status strip */}
        <div className="mt-6 flex items-center justify-center gap-2 text-[11px] text-[#7B8BA0]">
          <span className="w-1.5 h-1.5 rounded-full bg-[#10B981] inline-block" />
          <span>
            Supabase Realtime active · {cart.store_id.slice(0, 8)}… ·{' '}
            Session <span className="font-mono">{session.id.slice(0, 8)}…</span>
          </span>
        </div>
      </main>
    </div>
  );
}
