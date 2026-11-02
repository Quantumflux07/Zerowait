'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Camera, X, RefreshCw, AlertCircle, Sparkles, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';

export interface QrCameraScannerProps {
  isOpen: boolean;
  onClose: () => void;
  onScanSuccess: (qrCode: string) => void;
}

export const QrCameraScanner: React.FC<QrCameraScannerProps> = ({
  isOpen,
  onClose,
  onScanSuccess,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const scanningLoopRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isOpen) {
      stopCamera();
      return;
    }

    startCamera();

    return () => {
      stopCamera();
    };
  }, [isOpen]);

  const startCamera = async () => {
    setErrorMessage(null);
    setHasPermission(null);

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
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

      setHasPermission(true);
      setIsScanning(true);
      startBarcodeDetection();
    } catch (err) {
      console.warn('Camera initialization error:', err);
      setHasPermission(false);
      setErrorMessage(
        err instanceof Error
          ? err.message
          : 'Unable to access camera. Please allow camera permissions or enter Cart ID manually.'
      );
    }
  };

  const stopCamera = () => {
    if (scanningLoopRef.current) {
      cancelAnimationFrame(scanningLoopRef.current);
      scanningLoopRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    setIsScanning(false);
  };

  const startBarcodeDetection = () => {
    // If BarcodeDetector API is natively supported (Chrome/Chromium/Safari iOS 17+)
    if (typeof window !== 'undefined' && 'BarcodeDetector' in window) {
      try {
        // @ts-expect-error BarcodeDetector is a modern browser API
        const barcodeDetector = new window.BarcodeDetector({ formats: ['qr_code'] });

        const detectFrame = async () => {
          if (!videoRef.current || !isScanning) return;
          if (videoRef.current.readyState === videoRef.current.HAVE_ENOUGH_DATA) {
            try {
              const barcodes = await barcodeDetector.detect(videoRef.current);
              if (barcodes.length > 0 && barcodes[0].rawValue) {
                const detected = barcodes[0].rawValue.trim();
                stopCamera();
                onScanSuccess(detected);
                onClose();
                return;
              }
            } catch {
              // Ignore frame detection failures
            }
          }
          scanningLoopRef.current = requestAnimationFrame(detectFrame);
        };

        scanningLoopRef.current = requestAnimationFrame(detectFrame);
      } catch {
        // Fallback gracefully
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-[#0F2A43]/70 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-[26px] max-w-md w-full overflow-hidden shadow-2xl border border-[#E2EDF8]">
        {/* Scanner Header */}
        <div className="px-5 py-4 bg-white border-b border-[#E2EDF8] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-[#E0F2FE] flex items-center justify-center text-[#4DB3E6]">
              <Camera className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-[#0F2A43]">Live Cart QR Scanner</h3>
              <p className="text-[11px] text-[#7B8BA0]">Point camera at shopping cart QR code</p>
            </div>
          </div>
          <button
            onClick={() => {
              stopCamera();
              onClose();
            }}
            className="w-8 h-8 rounded-full hover:bg-[#F1F5F9] text-[#7B8BA0] hover:text-[#0F2A43] flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Viewfinder Area */}
        <div className="relative bg-slate-950 aspect-[4/3] flex items-center justify-center overflow-hidden">
          {hasPermission !== false && (
            <video
              ref={videoRef}
              playsInline
              muted
              className="w-full h-full object-cover"
            />
          )}

          {/* Viewfinder Target Overlays */}
          {hasPermission && (
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
              <div className="relative w-56 h-56 border-2 border-white/50 rounded-2xl">
                {/* Corner reticles */}
                <div className="absolute -top-1 -left-1 w-6 h-6 border-t-4 border-l-4 border-[#4DB3E6] rounded-tl-lg" />
                <div className="absolute -top-1 -right-1 w-6 h-6 border-t-4 border-r-4 border-[#4DB3E6] rounded-tr-lg" />
                <div className="absolute -bottom-1 -left-1 w-6 h-6 border-b-4 border-l-4 border-[#4DB3E6] rounded-bl-lg" />
                <div className="absolute -bottom-1 -right-1 w-6 h-6 border-b-4 border-r-4 border-[#4DB3E6] rounded-br-lg" />

                {/* Animated Scanning Laser */}
                <div className="absolute left-2 right-2 h-0.5 bg-gradient-to-r from-transparent via-[#4DB3E6] to-transparent shadow-[0_0_12px_#4DB3E6] animate-pulse" />
              </div>
            </div>
          )}

          {/* Fallback or Camera Disabled Message */}
          {hasPermission === false && (
            <div className="p-6 text-center text-white space-y-3">
              <div className="w-12 h-12 rounded-full bg-white/10 mx-auto flex items-center justify-center text-[#F59E0B]">
                <AlertCircle className="w-6 h-6" />
              </div>
              <div className="text-sm font-semibold text-white">Camera Offline or Restricted</div>
              <p className="text-xs text-slate-300 max-w-xs mx-auto leading-relaxed">
                {errorMessage || 'Camera access is not permitted. You can use the Quick Cart Presets or manual entry below.'}
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={startCamera}
                icon={<RefreshCw className="w-3.5 h-3.5" />}
                className="text-white border-white/40 hover:bg-white/10"
              >
                Retry Camera
              </Button>
            </div>
          )}
        </div>

        {/* Quick Test Simulation Shortcuts in Scanner */}
        <div className="p-4 bg-[#F8FBFE] border-t border-[#E2EDF8]">
          <div className="flex items-center gap-1.5 text-[11px] font-bold text-[#7B8BA0] mb-2 uppercase tracking-wider">
            <Sparkles className="w-3.5 h-3.5 text-[#4DB3E6]" />
            <span>Simulate Physical Cart Scan</span>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={() => {
                stopCamera();
                onScanSuccess('ZW-CART-001');
                onClose();
              }}
              className="p-2 bg-white hover:bg-[#E0F2FE] border border-[#E2EDF8] rounded-xl text-left transition-colors"
            >
              <div className="text-xs font-bold text-[#0F2A43]">Cart #001</div>
              <div className="text-[10px] text-[#10B981] font-semibold flex items-center gap-1">
                <CheckCircle2 className="w-2.5 h-2.5" /> 4 Items
              </div>
            </button>

            <button
              onClick={() => {
                stopCamera();
                onScanSuccess('ZW-CART-002');
                onClose();
              }}
              className="p-2 bg-white hover:bg-[#E0F2FE] border border-[#E2EDF8] rounded-xl text-left transition-colors"
            >
              <div className="text-xs font-bold text-[#0F2A43]">Cart #002</div>
              <div className="text-[10px] text-[#F97316] font-semibold">18 Items (Trolley)</div>
            </button>

            <button
              onClick={() => {
                stopCamera();
                onScanSuccess('ZW-CART-003');
                onClose();
              }}
              className="p-2 bg-white hover:bg-[#E0F2FE] border border-[#E2EDF8] rounded-xl text-left transition-colors"
            >
              <div className="text-xs font-bold text-[#0F2A43]">Cart #003</div>
              <div className="text-[10px] text-[#0369A1] font-semibold">2 Items (Basket)</div>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
