'use client';

/**
 * CartLandingScreen
 * Entry point for the Cart module: lets the user load a cart by QR code.
 * Supports camera QR scanning (reuses QrCameraScanner) and manual entry.
 */

import React, { useState } from 'react';
import { QrCode, ArrowRight, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';
import { BrandLogo } from '@/components/zerowait/BrandLogo';
import { QrCameraScanner } from '@/components/queue/QrCameraScanner';

export interface CartLandingScreenProps {
  onLoadCart: (qrCode: string) => void;
  isLoading?: boolean;
  error?: string | null;
}

const DEMO_CARTS = [
  { qr: 'ZW-CART-001', label: 'Smart Cart #1', desc: '4 items · Shopping' },
  { qr: 'ZW-CART-002', label: 'Smart Cart #2', desc: '18 items · Large Trolley' },
  { qr: 'ZW-CART-003', label: 'Smart Cart #3', desc: '2 items · Quick Basket' },
  { qr: 'ZW-CART-004', label: 'Smart Cart #4', desc: '0 items · Empty' },
  { qr: 'ZW-CART-005', label: 'Smart Cart #5', desc: 'ASSIGNED_LOCKED' },
];

export const CartLandingScreen: React.FC<CartLandingScreenProps> = ({
  onLoadCart,
  isLoading = false,
  error,
}) => {
  const [manualQr, setManualQr] = useState('');
  const [cameraOpen, setCameraOpen] = useState(false);

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const val = manualQr.trim();
    if (val) onLoadCart(val);
  };

  return (
    <div className="min-h-screen bg-[#EAF4FF] flex flex-col items-center justify-center p-4">
      <QrCameraScanner
        isOpen={cameraOpen}
        onClose={() => setCameraOpen(false)}
        onScanSuccess={(code) => {
          setCameraOpen(false);
          onLoadCart(code);
        }}
      />

      <div className="w-full max-w-sm space-y-6">
        {/* Brand Hero */}
        <div className="text-center space-y-2">
          <BrandLogo size="lg" className="justify-center" />
          <p className="text-xs text-[#7B8BA0] font-medium">
            Intelligent Supermarket Checkout
          </p>
        </div>

        {/* Main Card */}
        <Card className="space-y-5">
          <div className="text-center space-y-1">
            <div className="w-14 h-14 mx-auto rounded-[22px] bg-[#EAF4FF] border border-[#BAE6FD] flex items-center justify-center text-[#4DB3E6]">
              <QrCode className="w-7 h-7" />
            </div>
            <h2 className="text-base font-bold text-[#0F2A43] mt-3">Scan Your Cart</h2>
            <p className="text-xs text-[#7B8BA0] leading-relaxed">
              Scan the QR code on your shopping cart or enter its ID below.
            </p>
          </div>

          {/* Camera Scan Button */}
          <Button
            variant="primary"
            fullWidth
            size="lg"
            icon={<QrCode className="w-5 h-5" />}
            onClick={() => setCameraOpen(true)}
            disabled={isLoading}
          >
            Scan Cart QR Code
          </Button>

          {/* Divider */}
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-[#E2EDF8]" />
            <span className="text-[11px] font-semibold text-[#7B8BA0]">or enter manually</span>
            <div className="flex-1 h-px bg-[#E2EDF8]" />
          </div>

          {/* Manual Entry */}
          <form onSubmit={handleManualSubmit} className="space-y-3">
            <Input
              placeholder="e.g. ZW-CART-001"
              value={manualQr}
              onChange={(e) => setManualQr(e.target.value)}
              leftIcon={<QrCode className="w-4 h-4" />}
              disabled={isLoading}
              error={error ?? undefined}
              autoCapitalize="characters"
              autoComplete="off"
            />
            <Button
              type="submit"
              variant="outline"
              fullWidth
              disabled={isLoading || manualQr.trim().length < 3}
              icon={<ArrowRight className="w-4 h-4" />}
            >
              {isLoading ? 'Loading cart…' : 'Open Cart'}
            </Button>
          </form>
        </Card>

        {/* Quick Test Presets */}
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 text-[11px] font-bold text-[#7B8BA0] uppercase tracking-wider">
            <Sparkles className="w-3.5 h-3.5 text-[#4DB3E6]" />
            Demo Carts
          </div>
          <div className="grid grid-cols-1 gap-2">
            {DEMO_CARTS.map((c) => (
              <button
                key={c.qr}
                onClick={() => onLoadCart(c.qr)}
                disabled={isLoading}
                className="flex items-center justify-between w-full p-3 bg-white hover:bg-[#F0F9FF] border border-[#E2EDF8] hover:border-[#BAE6FD] rounded-2xl text-left transition-all group disabled:opacity-50"
              >
                <div>
                  <p className="text-xs font-bold text-[#0F2A43] group-hover:text-[#0369A1]">{c.label}</p>
                  <p className="text-[11px] text-[#7B8BA0] mt-0.5">{c.desc}</p>
                </div>
                <span className="font-mono text-[10px] text-[#7B8BA0] bg-[#F1F5F9] px-2 py-0.5 rounded-md font-semibold">
                  {c.qr}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
