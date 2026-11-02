'use client';

/**
 * BarcodeScannerInput
 *
 * Supports three input modes simultaneously:
 * 1. Camera-based barcode scanning using a hybrid engine:
 *    - Native BarcodeDetector API (fastest, hardware accelerated where available)
 *    - ZXing MultiFormatReader fallback (high-accuracy software decoding for desktop browsers,
 *      supporting EAN-13, UPC-A, UPC-E, EAN-8, Code 128, Code 39, QR Code, etc.)
 *    - Desktop-friendly camera constraints (avoids strict mobile `facingMode: environment` failures)
 *    - Barcode normalization (handles leading zeros / UPC-A vs EAN-13 conversions)
 * 2. USB/Bluetooth HID barcode scanners (emit keystrokes ending in Enter)
 * 3. Manual barcode text entry with auto-trimming and normalization
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { ScanLine, Keyboard, Camera, X, RefreshCw, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import type { ScanFeedbackState } from '@/hooks/useCartSession';
import { cleanBarcodeString, getBarcodeVariants } from '@/lib/engine/barcode';

export interface BarcodeScannerInputProps {
  onBarcode: (barcode: string) => void;
  disabled?: boolean;
  scanFeedback?: ScanFeedbackState;
  scanMessage?: string | null;
}

type InputMode = 'camera' | 'manual';

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
  const isDecodingRef = useRef<boolean>(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraStarting, setCameraStarting] = useState(false);
  const [engineInfo, setEngineInfo] = useState<string>('Initializing…');

  // ZXing reader reference
  const zxingReaderRef = useRef<any>(null);

  // USB scanner accumulator
  const usbBufferRef = useRef<string>('');
  const usbTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── USB / Bluetooth HID scanner ───────────────────────────────────────────────
  useEffect(() => {
    if (disabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      if (e.key === 'Enter') {
        const barcode = cleanBarcodeString(usbBufferRef.current);
        if (barcode.length >= 3) {
          console.log('[Scanner:USB] Captured barcode:', barcode);
          onBarcode(barcode);
        }
        usbBufferRef.current = '';
        if (usbTimerRef.current) clearTimeout(usbTimerRef.current);
        return;
      }

      if (e.key.length === 1) {
        usbBufferRef.current += e.key;
        if (usbTimerRef.current) clearTimeout(usbTimerRef.current);
        usbTimerRef.current = setTimeout(() => {
          usbBufferRef.current = '';
        }, USB_SCANNER_TIMEOUT_MS * 20);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [disabled, onBarcode]);

  // ── Camera Scanner ────────────────────────────────────────────────────────────
  const startCamera = useCallback(async () => {
    if (disabled) return;
    setCameraError(null);
    setCameraStarting(true);
    setEngineInfo('Connecting camera…');

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Camera access is not supported by this browser. HTTPS or localhost is required.');
      }

      // Constraints: Try 1080p/720p without strict facingMode so MacBook built-in FaceTime camera works smoothly
      let stream: MediaStream | null = null;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 1920, min: 640 },
            height: { ideal: 1080, min: 480 },
          },
          audio: false,
        });
      } catch (err) {
        // Fallback to basic video constraint if resolution constraint failed
        console.warn('[Scanner:Camera] Specific constraints failed, falling back to any video stream', err);
        stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });
      }

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      setCameraReady(true);
      startDetectionLoop();
    } catch (err: unknown) {
      console.error('[Scanner:Camera] Camera access failed:', err);
      let friendlyError = 'Camera unavailable. Please check browser camera permissions.';
      if (err instanceof DOMException) {
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          friendlyError = 'Camera permission was denied. Please allow camera access in your browser settings.';
        } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
          friendlyError = 'No camera found on this device.';
        } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
          friendlyError = 'Camera is in use by another application or FaceTime.';
        }
      } else if (err instanceof Error) {
        friendlyError = err.message;
      }
      setCameraError(friendlyError);
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
    isDecodingRef.current = false;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraReady(false);
  }, []);

  // ── Hybrid Detection Loop (BarcodeDetector + ZXing Fallback) ───────────────────
  const startDetectionLoop = useCallback(async () => {
    if (typeof window === 'undefined') return;

    let nativeDetector: any = null;

    // 1. Check if native BarcodeDetector is available and supports retail 1D formats
    if ('BarcodeDetector' in window) {
      try {
        // @ts-expect-error Native BarcodeDetector API
        const formats: string[] = await window.BarcodeDetector.getSupportedFormats();
        console.log('[Scanner:Engine] Supported native formats on this platform:', formats);
        const wantedFormats = [
          'ean_13',
          'ean_8',
          'upc_a',
          'upc_e',
          'code_128',
          'code_39',
          'code_93',
          'itf',
          'qr_code',
        ].filter((f) => formats.includes(f));

        if (wantedFormats.length > 0) {
          // @ts-expect-error Native BarcodeDetector API
          nativeDetector = new window.BarcodeDetector({ formats: wantedFormats });
          setEngineInfo(`Native Engine (${wantedFormats.length} formats)`);
        }
      } catch (e) {
        console.warn('[Scanner:Engine] Native BarcodeDetector init failed, using ZXing:', e);
      }
    }

    // 2. Initialize ZXing library as robust fallback / complementary decoder
    if (!zxingReaderRef.current) {
      try {
        const { BrowserMultiFormatReader } = await import('@zxing/browser');
        const { DecodeHintType, BarcodeFormat } = await import('@zxing/library');

        const hints = new Map();
        const formats = [
          BarcodeFormat.EAN_13,
          BarcodeFormat.UPC_A,
          BarcodeFormat.UPC_E,
          BarcodeFormat.EAN_8,
          BarcodeFormat.CODE_128,
          BarcodeFormat.CODE_39,
          BarcodeFormat.ITF,
          BarcodeFormat.QR_CODE,
        ];
        hints.set(DecodeHintType.POSSIBLE_FORMATS, formats);
        hints.set(DecodeHintType.TRY_HARDER, true);

        const reader = new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 250 });
        zxingReaderRef.current = reader;
        if (!nativeDetector) {
          setEngineInfo('ZXing High-Precision Engine');
        }
      } catch (err) {
        console.warn('[Scanner:Engine] Failed to load ZXing:', err);
      }
    }

    const processFrame = async () => {
      const video = videoRef.current;
      if (!video || !streamRef.current || video.readyState !== video.HAVE_ENOUGH_DATA) {
        scanLoopRef.current = requestAnimationFrame(processFrame);
        return;
      }

      if (isDecodingRef.current) {
        scanLoopRef.current = requestAnimationFrame(processFrame);
        return;
      }

      isDecodingRef.current = true;
      let detectedBarcode: string | null = null;
      let detectedFormat: string | null = null;

      try {
        // Step A: Attempt Native BarcodeDetector
        if (nativeDetector) {
          try {
            const results = await nativeDetector.detect(video);
            if (results && results.length > 0 && results[0].rawValue) {
              detectedBarcode = cleanBarcodeString(results[0].rawValue);
              detectedFormat = results[0].format || 'native';
            }
          } catch {
            // Ignore native frame decode error
          }
        }

        // Step B: If not detected by native, run ZXing fallback decoder
        if (!detectedBarcode && zxingReaderRef.current) {
          try {
            const zxingResult = zxingReaderRef.current.decode(video);
            if (zxingResult && zxingResult.getText()) {
              detectedBarcode = cleanBarcodeString(zxingResult.getText());
              detectedFormat = zxingResult.getBarcodeFormat()?.toString() || 'zxing';
            }
          } catch {
            // NotFoundException on empty frames is normal
          }
        }

        // Step C: If barcode found, log and emit
        if (detectedBarcode && detectedBarcode.length >= 3) {
          console.log(`[Scanner:Camera] Successfully decoded barcode: "${detectedBarcode}" (format: ${detectedFormat})`);
          onBarcode(detectedBarcode);
          isDecodingRef.current = false;
          return; // pause loop; restarts after feedback clears
        }
      } catch (loopErr) {
        console.warn('[Scanner:Camera] Error in decode frame:', loopErr);
      } finally {
        isDecodingRef.current = false;
      }

      scanLoopRef.current = requestAnimationFrame(processFrame);
    };

    scanLoopRef.current = requestAnimationFrame(processFrame);
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

  // Restart detection loop after scan feedback clears back to idle
  useEffect(() => {
    if (mode === 'camera' && cameraReady && scanFeedback === 'idle' && !scanLoopRef.current) {
      startDetectionLoop();
    }
    if (scanFeedback === 'scanning' || scanFeedback === 'success' || scanFeedback === 'error') {
      if (scanLoopRef.current) {
        cancelAnimationFrame(scanLoopRef.current);
        scanLoopRef.current = null;
      }
    }
  }, [scanFeedback, cameraReady, mode, startDetectionLoop]);

  // ── Manual entry ──────────────────────────────────────────────────────────────
  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const val = cleanBarcodeString(manualValue);
    if (val.length >= 3) {
      console.log('[Scanner:Manual] Submitting manual barcode:', val);
      onBarcode(val);
      setManualValue('');
    }
  };

  // ── Feedback styling ──────────────────────────────────────────────────────────
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
      <div className="flex items-center justify-between">
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

        {mode === 'camera' && cameraReady && (
          <span className="text-[10px] font-medium text-[#7B8BA0] bg-white/80 px-2.5 py-1 rounded-full border border-[#E2EDF8]">
            {engineInfo}
          </span>
        )}
      </div>

      {/* Camera Viewfinder */}
      {mode === 'camera' && (
        <div className="relative bg-slate-950 rounded-[22px] overflow-hidden aspect-[4/3] shadow-inner">
          <video
            ref={videoRef}
            playsInline
            muted
            className={`w-full h-full object-cover transition-opacity duration-300 ${cameraReady ? 'opacity-100' : 'opacity-0'}`}
          />

          {/* Scanning Reticle */}
          {cameraReady && (
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
              <div className="relative w-56 h-36 sm:w-68 sm:h-44 border border-white/40 rounded-2xl shadow-[0_0_20px_rgba(0,0,0,0.5)]">
                <div className="absolute -top-0.5 -left-0.5 w-6 h-6 border-t-4 border-l-4 border-[#4DB3E6] rounded-tl-lg" />
                <div className="absolute -top-0.5 -right-0.5 w-6 h-6 border-t-4 border-r-4 border-[#4DB3E6] rounded-tr-lg" />
                <div className="absolute -bottom-0.5 -left-0.5 w-6 h-6 border-b-4 border-l-4 border-[#4DB3E6] rounded-bl-lg" />
                <div className="absolute -bottom-0.5 -right-0.5 w-6 h-6 border-b-4 border-r-4 border-[#4DB3E6] rounded-br-lg" />
                <div className="absolute left-4 right-4 top-1/2 -translate-y-1/2 h-0.5 bg-gradient-to-r from-transparent via-[#4DB3E6] to-transparent shadow-[0_0_12px_#4DB3E6] animate-pulse" />
              </div>
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-center">
                <span className="text-[11px] font-semibold text-white/90 bg-black/50 backdrop-blur-sm px-3.5 py-1.5 rounded-full border border-white/10 shadow-sm">
                  {scanFeedback === 'scanning'
                    ? 'Looking up barcode…'
                    : scanFeedback === 'success'
                    ? 'Barcode detected!'
                    : 'Center barcode inside frame (keep still ~15-20cm away)'}
                </span>
              </div>
            </div>
          )}

          {/* Camera Starting Indicator */}
          {cameraStarting && (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-950">
              <div className="text-center text-white space-y-2">
                <Camera className="w-8 h-8 mx-auto text-[#4DB3E6] animate-pulse" />
                <p className="text-xs font-semibold">Starting MacBook camera…</p>
              </div>
            </div>
          )}

          {/* Camera Error */}
          {cameraError && (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-950 p-4">
              <div className="text-center text-white space-y-3 max-w-xs">
                <AlertCircle className="w-8 h-8 mx-auto text-[#F59E0B]" />
                <p className="text-xs font-semibold">Camera Unavailable</p>
                <p className="text-[11px] text-slate-300 leading-relaxed">{cameraError}</p>
                <p className="text-[10px] text-slate-400">
                  Tip: You can switch to &ldquo;Manual / USB&rdquo; mode to type or paste the code.
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-white border-white/30 hover:bg-white/10"
                  icon={<RefreshCw className="w-3.5 h-3.5" />}
                  onClick={() => { setCameraError(null); startCamera(); }}
                >
                  Retry Camera
                </Button>
              </div>
            </div>
          )}

          {/* Close overlay */}
          {cameraReady && (
            <button
              onClick={stopCamera}
              aria-label="Stop camera"
              className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/50 hover:bg-black/70 flex items-center justify-center text-white/80 hover:text-white transition-colors"
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
            placeholder="Type or paste barcode (e.g. 8901030383123) and press Enter…"
            disabled={disabled}
            leftIcon={<ScanLine className="w-4 h-4" />}
            autoFocus
            autoComplete="off"
            inputMode="numeric"
          />
          <p className="text-[11px] text-[#7B8BA0] pl-3">
            Supports EAN-13, UPC-A, EAN-8, Code 128 and USB/Bluetooth hardware scanners.
          </p>
          <Button type="submit" variant="primary" size="sm" disabled={disabled || manualValue.trim().length < 3}>
            Add to Cart
          </Button>
        </form>
      )}

      {/* Scan Feedback Strip */}
      {scanFeedback !== 'idle' && (
        <div className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl border text-xs font-semibold ${fb.bg} ${fb.color} ${fb.border} transition-all duration-200`}>
          {scanFeedback === 'success' ? (
            <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-[#0F766E]" />
          ) : (
            <ScanLine className="w-4 h-4 flex-shrink-0" />
          )}
          <span>{scanMessage ?? scanFeedback}</span>
        </div>
      )}
    </div>
  );
};
