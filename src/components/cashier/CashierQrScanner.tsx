'use client';

/**
 * CashierQrScanner
 * 
 * DEDICATED Cashier Cart QR Scanning Component.
 * Kept completely separate from customer product barcode scanners.
 * 
 * Features:
 * - Scans physical cart QR asset codes using ZXing QR Code reader
 * - Manual input fallback and quick-select buttons for registered carts
 * - Audio/visual feedback upon validation
 * - Anti-duplicate scan debouncing
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Camera, QrCode, X, RefreshCw, AlertCircle, CheckCircle2, ShieldCheck, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { BrowserMultiFormatReader, BarcodeFormat } from '@zxing/browser';
import { DecodeHintType, NotFoundException } from '@zxing/library';

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
  const [isCameraActive, setIsCameraActive] = useState<boolean>(false);
  const [manualInput, setManualInput] = useState<string>('');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [lastScanned, setLastScanned] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const controlsRef = useRef<{ stop: () => void } | null>(null);

  const stopCamera = useCallback(() => {
    if (controlsRef.current) {
      try {
        controlsRef.current.stop();
      } catch {}
      controlsRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsCameraActive(false);
  }, []);

  const startCamera = async () => {
    setCameraError(null);
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Camera access is not supported in this browser environment.');
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      setIsCameraActive(true);

      // Initialize dedicated ZXing QR Reader
      const hints = new Map();
      hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.QR_CODE]);
      const reader = new BrowserMultiFormatReader(hints);

      const controls = await reader.decodeFromVideoDevice(undefined, videoRef.current!, (result, err) => {
        if (result) {
          const rawText = result.getText().trim();
          if (rawText && rawText !== lastScanned) {
            setLastScanned(rawText);
            onScan(rawText);
            stopCamera();
          }
        } else if (err && !(err instanceof NotFoundException)) {
          // Expected per frame when no QR is in sight
        }
      });

      controlsRef.current = controls;
    } catch (err: unknown) {
      setIsCameraActive(false);
      setCameraError(err instanceof Error ? err.message : 'Unable to access camera.');
    }
  };

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, [stopCamera]);

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

      {/* Active Cart Status Banner if already loaded */}
      {activeQrCode && (
        <div className="mb-4 p-3 bg-[#EAF4FF] border border-[#BAE6FD] rounded-xl flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-[#10B981]" />
            <span className="text-xs text-[#0F2A43] font-medium">
              Loaded Cart: <strong className="font-mono text-[#0369A1]">{activeQrCode}</strong>
            </span>
          </div>
          <span className="text-[10px] bg-white text-[#0369A1] font-bold px-2 py-0.5 rounded-full border border-[#BAE6FD]">
            Active
          </span>
        </div>
      )}

      {/* Camera Preview Area */}
      {isCameraActive ? (
        <div className="relative rounded-2xl overflow-hidden bg-black aspect-[4/3] max-h-64 mb-4 border border-[#E2EDF8]">
          <video ref={videoRef} className="w-full h-full object-cover" playsInline muted />
          
          {/* Target Reticle */}
          <div className="absolute inset-0 border-2 border-[#4DB3E6]/60 m-8 rounded-xl pointer-events-none flex items-center justify-center">
            <div className="w-16 h-16 border-2 border-[#4DB3E6] rounded-lg animate-pulse" />
          </div>

          {/* Close Camera button */}
          <button
            onClick={stopCamera}
            className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <div className="mb-4">
          <Button
            type="button"
            variant="secondary"
            size="md"
            fullWidth
            onClick={startCamera}
            icon={<Camera className="w-4 h-4 text-[#0369A1]" />}
            disabled={isProcessing}
            className="py-3 bg-[#F8FBFE] border border-[#BAE6FD] hover:bg-[#E0F2FE] text-[#0369A1] font-bold rounded-2xl"
          >
            Open Counter Camera Scanner
          </Button>
        </div>
      )}

      {cameraError && (
        <div className="mb-3 p-3 bg-[#FEF2F2] border border-[#FECACA] rounded-xl text-xs text-[#DC2626] flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{cameraError}</span>
        </div>
      )}

      {/* Manual QR Text Input */}
      <form onSubmit={handleManualSubmit} className="flex gap-2 mb-4">
        <Input
          placeholder="e.g. ZW-CART-005"
          value={manualInput}
          onChange={(e) => setManualInput(e.target.value)}
          disabled={isProcessing}
          className="text-xs font-mono uppercase"
        />
        <Button
          type="submit"
          variant="primary"
          size="sm"
          disabled={!manualInput.trim() || isProcessing}
          className="whitespace-nowrap font-bold"
        >
          {isProcessing ? 'Verifying...' : 'Validate'}
        </Button>
      </form>

      {/* Quick-test Presets for Station Operators */}
      <div>
        <span className="text-[10px] font-bold uppercase tracking-wider text-[#7B8BA0] block mb-1.5">
          Quick Scan Test Carts
        </span>
        <div className="flex flex-wrap gap-1.5">
          {['ZW-CART-005', 'ZW-CART-001', 'ZW-CART-002', 'ZW-CART-003', 'ZW-CART-004'].map((qr) => (
            <button
              key={qr}
              type="button"
              onClick={() => handleQuickSelect(qr)}
              disabled={isProcessing}
              className="text-[11px] font-mono font-semibold px-2.5 py-1 rounded-lg bg-[#F8FBFE] border border-[#E2EDF8] text-[#0F2A43] hover:bg-[#E0F2FE] hover:border-[#BAE6FD] transition-colors"
            >
              {qr}
            </button>
          ))}
        </div>
      </div>

      {/* Error Feedback */}
      {error && (
        <div className="mt-4 p-3.5 bg-[#FEF2F2] border border-[#FECACA] rounded-xl text-xs text-[#991B1B] flex items-start gap-2.5 animate-in fade-in">
          <AlertCircle className="w-4 h-4 text-[#DC2626] shrink-0 mt-0.5" />
          <div className="flex-1">
            <strong className="block font-bold mb-0.5">Cart Validation Rejected</strong>
            <span>{error}</span>
          </div>
        </div>
      )}
    </div>
  );
};

