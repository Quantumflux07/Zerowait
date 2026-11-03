'use client';

/**
 * CartQrDisplay — renders the cart's permanent QR code as an SVG/canvas
 * and shows the ZeroWait branding + Cart ID identity.
 */

import React, { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { QrCode } from 'lucide-react';

export interface CartQrDisplayProps {
  qrCode: string; // e.g. "ZW-CART-001"
  cartLabel: string;
  size?: number;
  className?: string;
}

export const CartQrDisplay: React.FC<CartQrDisplayProps> = ({
  qrCode,
  cartLabel,
  size = 128,
  className,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [rendered, setRendered] = useState(false);

  useEffect(() => {
    if (!canvasRef.current || !qrCode) return;
    QRCode.toCanvas(canvasRef.current, qrCode, {
      width: size,
      margin: 1,
      color: { dark: '#0F2A43', light: '#FFFFFF' },
      errorCorrectionLevel: 'M',
    })
      .then(() => setRendered(true))
      .catch(() => setRendered(false));
  }, [qrCode, size]);

  return (
    <div className={`flex flex-col items-center gap-2 ${className ?? ''}`}>
      <div
        className="rounded-[18px] bg-white border-2 border-[#E2EDF8] shadow-soft p-2 flex items-center justify-center"
        style={{ width: size + 16, height: size + 16 }}
      >
        {!rendered && (
          <div
            className="flex items-center justify-center bg-[#EAF4FF] rounded-xl"
            style={{ width: size, height: size }}
          >
            <QrCode className="w-10 h-10 text-[#4DB3E6] animate-pulse" />
          </div>
        )}
        <canvas
          ref={canvasRef}
          className={`rounded-xl transition-opacity duration-300 ${rendered ? 'opacity-100' : 'opacity-0 absolute'}`}
        />
      </div>
      <div className="text-center">
        <p className="text-[10px] uppercase tracking-widest font-bold text-[#7B8BA0]">Cart ID</p>
        <p className="font-mono text-xs font-black text-[#0F2A43] tracking-tight mt-0.5">{qrCode}</p>
        <p className="text-[10px] text-[#7B8BA0] mt-0.5">{cartLabel}</p>
      </div>
    </div>
  );
};
