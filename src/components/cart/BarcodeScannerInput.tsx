'use client';

/**
 * BarcodeScannerInput
 *
 * Supports three input modes simultaneously:
 * 1. Camera-based barcode scanning using BarcodeDetector API
 * 2. USB/Bluetooth HID barcode scanners (they emit keystrokes ending in Enter)
 * 3. Manual barcode text entry
 *
 * Calls onBarcode(barcode) whenever a code is committed.
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { ScanLine, Keyboard, Camera, X, RefreshCw, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import type { ScanFeedbackState } from '@/hooks/useCartSession';

export interface BarcodeScannerInputProps {
  onBarcode: (barcode: string) => void;
  disabled?: boolean;
  scanFeedback?: ScanFeedbackState;
  scanMessage?: string | null;
}

type InputMode = 'camera' | 'manual';

// USB/Bluetooth scanner: characters arrive quickly, final char is Enter
const USB_SCANNER_TIMEOUT_MS = 80;

export const BarcodeScannerInput: React.FC<BarcodeScannerInputProps> = ({
  onBarcode,
  disabled = false,
  scanFeedback = 'idle',
  scanMessage,
}) => {
  const [mode, setMode] = useState<InputMode>('camera');
  const [manualValue, setManualValue] = useState('');

  // Camera state
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanLoopRef = useRef<number | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraStarting, setCameraStarting] = useState(false);

  // USB scanner accumulator
  const usbBufferRef = useRef<string>('');
  const usbTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── USB / Bluetooth HID scanner ───────────────────────────────────────────────
  useEffect(() => {
    if (disabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is focused on an actual text field
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      if (e.key === 'Enter') {
        const barcode = usbBufferRef.current.trim();
        if (barcode.length >= 3) {
          onBarcode(barcode);
        }
        usbBufferRef.current = '';
        if (usbTimerRef.current) clearTimeout(usbTimerRef.current);
        return;
      }

      // Only accumulate printable characters
      if (e.key.length === 1) {
        usbBufferRef.current += e.key;
        if (usbTimerRef.current) clearTimeout(usbTimerRef.current);
        usbTimerRef.current = setTimeout(() => {
          usbBufferRef.current = ''; // flush stale partial input
        }, USB_SCANNER_TIMEOUT_MS * 20);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [disabled, onBarcode]);

  // ── Camera scanner ────────────────────────────────────────────────────────────
  const startCamera = useCallback(async () => {
    if (disabled) return;
    setCameraError(null);
    setCameraStarting(true);

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Camera not supported in this environment.');
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
      setCameraReady(true);
      startBarcodeLoop();
    } catch (err) {
      setCameraError(
        err instanceof Error ? err.message : 'Camera unavailable. Use manual entry or USB scanner.'
      );
      setCameraReady(false);
    } finally {
      setCameraStarting(false);
    }
  }, [disabled]); // eslint-disable-line react-hooks/exhaustive-deps

  const stopCamera = useCallback(() => {
    if (scanLoopRef.current) {
      cancelAnimationFrame(scanLoopRef.current);
      scanLoopRef.current = null;
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraReady(false);
  }, []);

  const startBarcodeLoop = useCallback(() => {
    if (typeof window === 'undefined' || !('BarcodeDetector' in window)) return;

    try {
      // @ts-expect-error BarcodeDetector is a modern browser API (Chrome, Safari iOS 17+)
      const detector = new window.BarcodeDetector({
        formats: [
          'ean_13', 'ean_8', 'upc_a', 'upc_e',
          'code_128', 'code_39', 'code_93',
          'itf', 'codabar', 'qr_code',
        ],
      });

      const detectFrame = async () => {
        if (!videoRef.current || !streamRef.current) return;
        if (videoRef.current.readyState === videoRef.current.HAVE_ENOUGH_DATA) {
          try {
            const barcodes = await detector.detect(videoRef.current);
            if (barcodes.length > 0 && barcodes[0].rawValue) {
              onBarcode(barcodes[0].rawValue.trim());
              return; // pause for debounce; loop restarts on next frame after feedback clears
            }
          } catch {
            // Ignore frame detection failures
          }
        }
        scanLoopRef.current = requestAnimationFrame(detectFrame);
      };

      scanLoopRef.current = requestAnimationFrame(detectFrame);
    } catch {
      // BarcodeDetector not available
    }
  }, [onBarcode]);

  // Auto-start camera when in camera mode
  useEffect(() => {
    if (mode === 'camera' && !disabled) {
      startCamera();
    } else {
      stopCamera();
    }
    return () => stopCamera();
  }, [mode, disabled]); // eslint-disable-line react-hooks/exhaustive-deps

  // Restart detection loop after a successful scan (feedback clears)
  useEffect(() => {
    if (mode === 'camera' && cameraReady && scanFeedback === 'idle' && !scanLoopRef.current) {
      startBarcodeLoop();
    }
    if (scanFeedback === 'scanning' || scanFeedback === 'success' || scanFeedback === 'error') {
      if (scanLoopRef.current) {
        cancelAnimationFrame(scanLoopRef.current);
        scanLoopRef.current = null;
      }
    }
  }, [scanFeedback, cameraReady, mode, startBarcodeLoop]);

  // ── Manual entry ──────────────────────────────────────────────────────────────
  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const val = manualValue.trim();
    if (val.length >= 3) {
      onBarcode(val);
      setManualValue('');
    }
  };

  // ── Feedback badge ───────────────────────────────────────────────────────────
  const feedbackConfig: Record<ScanFeedbackState, { color: string; bg: string; border: string }> = {
    idle: { color: 'text-[#7B8BA0]', bg: 'bg-[#F8FBFE]', border: 'border-[#E2EDF8]' },
    scanning: { color: 'text-[#0369A1]', bg: 'bg-[#E0F2FE]', border: 'border-[#BAE6FD]' },
    success: { color: 'text-[#0F766E]', bg: 'bg-[#E8F9F1]', border: 'border-[#A7F3D0]' },
    error: { color: 'text-[#B91C1C]', bg: 'bg-[#FEE2E2]', border: 'border-[#FECACA]' },
    duplicate: { color: 'text-[#B45309]', bg: 'bg-[#FEF3C7]', border: 'border-[#FDE68A]' },
    locked: { color: 'text-[#7B8BA0]', bg: 'bg-[#F1F5F9]', border: 'border-[#E2E8F0]' },
  };

  const fb = feedbackConfig[scanFeedback];

  return (
    <div className="space-y-3">
      {/* Mode Tabs */}
      <div className="flex items-center gap-2 p-1 bg-[#F1F5F9] rounded-full w-fit">
        <button
          onClick={() => setMode('camera')}
          className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-semibold transition-all ${
            mode === 'camera'
              ? 'bg-white text-[#0F2A43] shadow-sm border border-[#E2EDF8]'
              : 'text-[#7B8BA0] hover:text-[#0F2A43]'
          }`}
          disabled={disabled}
        >
          <Camera className="w-3.5 h-3.5" />
          Camera
        </button>
        <button
          onClick={() => setMode('manual')}
          className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-semibold transition-all ${
            mode === 'manual'
              ? 'bg-white text-[#0F2A43] shadow-sm border border-[#E2EDF8]'
              : 'text-[#7B8BA0] hover:text-[#0F2A43]'
          }`}
          disabled={disabled}
        >
          <Keyboard className="w-3.5 h-3.5" />
          Manual / USB
        </button>
      </div>

      {/* Camera Viewfinder */}
      {mode === 'camera' && (
        <div className="relative bg-slate-950 rounded-[22px] overflow-hidden aspect-[4/3]">
          <video
            ref={videoRef}
            playsInline
            muted
            className={`w-full h-full object-cover transition-opacity duration-300 ${cameraReady ? 'opacity-100' : 'opacity-0'}`}
          />

          {/* Scanning Reticle */}
          {cameraReady && (
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
              <div className="relative w-52 h-36 sm:w-64 sm:h-44 border border-white/30 rounded-2xl">
                <div className="absolute -top-0.5 -left-0.5 w-6 h-6 border-t-4 border-l-4 border-[#4DB3E6] rounded-tl-lg" />
                <div className="absolute -top-0.5 -right-0.5 w-6 h-6 border-t-4 border-r-4 border-[#4DB3E6] rounded-tr-lg" />
                <div className="absolute -bottom-0.5 -left-0.5 w-6 h-6 border-b-4 border-l-4 border-[#4DB3E6] rounded-bl-lg" />
                <div className="absolute -bottom-0.5 -right-0.5 w-6 h-6 border-b-4 border-r-4 border-[#4DB3E6] rounded-br-lg" />
                <div className="absolute left-4 right-4 top-1/2 -translate-y-1/2 h-0.5 bg-gradient-to-r from-transparent via-[#4DB3E6] to-transparent shadow-[0_0_10px_#4DB3E6] animate-pulse" />
              </div>
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2">
                <span className="text-[10px] font-semibold text-white/60 bg-black/30 px-3 py-1 rounded-full">
                  {scanFeedback === 'scanning' ? 'Looking up…' : 'Point at product barcode'}
                </span>
              </div>
            </div>
          )}

          {/* Camera Starting Indicator */}
          {cameraStarting && (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-950">
              <div className="text-center text-white space-y-2">
                <Camera className="w-8 h-8 mx-auto text-[#4DB3E6] animate-pulse" />
                <p className="text-xs font-semibold">Starting camera…</p>
              </div>
            </div>
          )}

          {/* Camera Error */}
          {cameraError && (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-950 p-4">
              <div className="text-center text-white space-y-3 max-w-xs">
                <AlertCircle className="w-8 h-8 mx-auto text-[#F59E0B]" />
                <p className="text-xs font-semibold">Camera Unavailable</p>
                <p className="text-[11px] text-slate-400 leading-relaxed">{cameraError}</p>
                <p className="text-[11px] text-slate-400">USB / Bluetooth scanners still work — plug in and scan.</p>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-white border-white/30 hover:bg-white/10"
                  icon={<RefreshCw className="w-3.5 h-3.5" />}
                  onClick={() => { setCameraError(null); startCamera(); }}
                >
                  Retry
                </Button>
              </div>
            </div>
          )}

          {/* Close overlay */}
          {cameraReady && (
            <button
              onClick={stopCamera}
              className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/40 hover:bg-black/60 flex items-center justify-center text-white/80 hover:text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      )}

      {/* Manual Entry */}
      {mode === 'manual' && (
        <form onSubmit={handleManualSubmit} className="space-y-2">
          <Input
            value={manualValue}
            onChange={(e) => setManualValue(e.target.value)}
            placeholder="Type or paste barcode and press Enter…"
            disabled={disabled}
            leftIcon={<ScanLine className="w-4 h-4" />}
            autoFocus
            autoComplete="off"
            inputMode="numeric"
          />
          <p className="text-[11px] text-[#7B8BA0] pl-3">
            USB/Bluetooth scanners: plug in and scan — keystrokes are captured automatically.
          </p>
          <Button type="submit" variant="primary" size="sm" disabled={disabled || manualValue.trim().length < 3}>
            Add to Cart
          </Button>
        </form>
      )}

      {/* Scan Feedback Strip */}
      {scanFeedback !== 'idle' && (
        <div className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl border text-xs font-semibold ${fb.bg} ${fb.color} ${fb.border} transition-all duration-200`}>
          <ScanLine className="w-3.5 h-3.5 flex-shrink-0" />
          <span>{scanMessage ?? scanFeedback}</span>
        </div>
      )}
    </div>
  );
};
