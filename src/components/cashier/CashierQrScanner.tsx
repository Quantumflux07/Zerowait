'use client';

/**
 * CashierQrScanner
 *
 * Dedicated cashier cart QR scanning component.
 * Reuses the shared QrCameraScanner component used on the Queue Engine page
 * to ensure identical decoding behaviour.
 */

import React, { useState, useCallback } from 'react';
import { QrCameraScanner } from '@/components/queue/QrCameraScanner';
import { Camera, QrCode, X, AlertCircle, CheckCircle2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

export interface CashierQrScannerProps {
  onScan: (qrCode: string) => void;
  isProcessing: boolean;
  activeQrCode: string | null;
  error: string | null;
  onClear: () => void;
}

export const CashierQrScanner: React.FC<CashierQrScannerProps> = ({
  onScan,
  isProcessing,
  activeQrCode,
  error,
  onClear,
}) => {
  // UI state
  const [isScannerOpen, setIsScannerOpen] = useState<boolean>(false);
  const [manualInput, setManualInput] = useState<string>('');

  const handleOpenScanner = () => setIsScannerOpen(true);
  const handleCloseScanner = () => setIsScannerOpen(false);

  const handleScanSuccess = (qr: string) => {
    onScan(qr);
    setIsScannerOpen(false);
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = manualInput.trim();
    if (clean) {
      onScan(clean);
      setManualInput('');
    }
  };

  const handleQuickSelect = (qr: string) => {
    onScan(qr);
  };

  return (
    <div className="bg-white rounded-[24px] border border-[#E2EDF8] shadow-soft p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-[#E0F2FE] border border-[#BAE6FD] flex items-center justify-center text-[#0369A1]">
            <QrCode className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-[#0F2A43]">Cart QR Scanner</h3>
            <p className="text-[11px] text-[#7B8BA0]">Scan arriving customer trolley QR</p>
          </div>
        </div>
        {activeQrCode && (
          <Button variant="ghost" size="sm" onClick={onClear} className="text-xs text-[#DC2626]">
            Clear Current Cart
          </Button>
        )}
      </div>

      {/* Active Cart Banner */}
      {activeQrCode && (
        <div className="mb-4 p-3 bg-[#EAF4FF] border border-[#BAE6FD] rounded-xl flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-[#10B981]" />
            <span className="text-xs text-[#0F2A43] font-medium">
              Loaded Cart: <strong className="font-mono text-[#0369A1]">{activeQrCode}</strong>
            </span>
          </div>
          <span className="text-[10px] bg-white text-[#0369A1] font-bold px-2 py-0.5 rounded-full border border-[#BAE6FD]">Active</span>
        </div>
      )}

      {/* Scanner Controls */}
      {isScannerOpen ? (
        <QrCameraScanner isOpen={true} onClose={handleCloseScanner} onScanSuccess={handleScanSuccess} />
      ) : (
        <div className="mb-4">
          <Button
            type="button"
            variant="secondary"
            size="md"
            fullWidth
            onClick={handleOpenScanner}
            icon={<Camera className="w-4 h-4 text-[#0369A1]" />}
            disabled={isProcessing}
            className="py-3 bg-[#F8FBFE] border border-[#BAE6FD] hover:bg-[#E0F2FE] text-[#0369A1] font-bold rounded-2xl"
          >
            Open Counter Camera Scanner
          </Button>
        </div>
      )}

      {/* Manual input form */}
      <form onSubmit={handleManualSubmit} className="flex items-center gap-2 mb-3">
        <Input
          placeholder="Enter cart QR code manually"
          value={manualInput}
          onChange={(e) => setManualInput(e.target.value)}
          disabled={isProcessing}
        />
        <Button type="submit" disabled={!manualInput.trim() || isProcessing} variant="outline" size="sm">
          Submit
        </Button>
      </form>

      {/* Quick select shortcuts */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        <button onClick={() => handleQuickSelect('ZW-CART-001')} className="p-2 bg-white hover:bg-[#E0F2FE] border border-[#E2EDF8] rounded-xl text-left transition-colors">
          <div className="text-xs font-bold text-[#0F2A43]">Cart #001</div>
          <div className="text-[10px] text-[#10B981] font-semibold flex items-center gap-1">
            <CheckCircle2 className="w-2.5 h-2.5" /> 4 Items
          </div>
        </button>
        <button onClick={() => handleQuickSelect('ZW-CART-002')} className="p-2 bg-white hover:bg-[#E0F2FE] border border-[#E2EDF8] rounded-xl text-left transition-colors">
          <div className="text-xs font-bold text-[#0F2A43]">Cart #002</div>
          <div className="text-[10px] text-[#F97316] font-semibold">18 Items (Trolley)</div>
        </button>
        <button onClick={() => handleQuickSelect('ZW-CART-003')} className="p-2 bg-white hover:bg-[#E0F2FE] border border-[#E2EDF8] rounded-xl text-left transition-colors">
          <div className="text-xs font-bold text-[#0F2A43]">Cart #003</div>
          <div className="text-[10px] text-[#0369A1] font-semibold">2 Items (Basket)</div>
        </button>
      </div>

      {/* Error feedback */}
      {error && (
        <div className="mt-4 p-3.5 bg-[#FEF2F2] border border-[#FECACA] rounded-xl text-xs text-[#DC2626] flex items-start gap-2.5 animate-in fade-in">
          <AlertCircle className="w-4 h-4 text-[#DC2626] shrink-0 mt-0.5" />
          <div>{error}</div>
        </div>
      )}
    </div>
  );
};
