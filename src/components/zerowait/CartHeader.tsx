import React from 'react';
import { QrCode, BatteryCharging, BatteryMedium, BatteryLow } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { CartStatus } from '@/types/domain';

export interface CartHeaderProps {
  qrCode: string;
  cartLabel: string;
  batteryLevel?: number;
  status: CartStatus;
  storeName?: string;
}

export const CartHeader: React.FC<CartHeaderProps> = ({
  qrCode,
  cartLabel,
  batteryLevel = 100,
  status,
  storeName = 'Avenue Store Market',
}) => {
  const getStatusBadge = (s: CartStatus) => {
    switch (s) {
      case 'SHOPPING':
        return <Badge variant="green" dot>Active Shopping</Badge>;
      case 'ASSIGNED_LOCKED':
        return <Badge variant="blue" dot>Assigned & Locked</Badge>;
      case 'AT_CHECKOUT':
        return <Badge variant="blue">At Checkout</Badge>;
      case 'PAYMENT_PENDING':
        return <Badge variant="amber" dot>Payment Pending</Badge>;
      case 'PAID':
        return <Badge variant="green">Paid</Badge>;
      case 'CLOSED':
        return <Badge variant="slate">Closed</Badge>;
      case 'EXCEPTION':
        return <Badge variant="red" dot>Exception</Badge>;
      default:
        return <Badge variant="slate">{s}</Badge>;
    }
  };

  const getBatteryIcon = (lvl: number) => {
    if (lvl > 70) return <BatteryCharging className="w-4 h-4 text-[#10B981]" />;
    if (lvl > 25) return <BatteryMedium className="w-4 h-4 text-[#F59E0B]" />;
    return <BatteryLow className="w-4 h-4 text-[#EF4444]" />;
  };

  return (
    <div className="bg-white border border-[#E2EDF8] rounded-[22px] p-4 sm:p-5 shadow-soft flex flex-wrap items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-2xl bg-[#EAF4FF] border border-[#BAE6FD] flex items-center justify-center text-[#4DB3E6]">
          <QrCode className="w-6 h-6" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-extrabold text-[#0F2A43]">{cartLabel}</h2>
            <span className="font-mono text-xs bg-[#F1F5F9] text-[#475569] px-2 py-0.5 rounded-md font-semibold">
              {qrCode}
            </span>
          </div>
          <div className="text-xs text-[#7B8BA0] mt-0.5">{storeName}</div>
        </div>
      </div>

      <div className="flex items-center gap-4">
        {/* Battery Indicator */}
        <div className="flex items-center gap-1.5 bg-[#F8FBFE] border border-[#E2EDF8] px-3 py-1.5 rounded-full text-xs font-semibold text-[#0F2A43]">
          {getBatteryIcon(batteryLevel)}
          <span>{batteryLevel}%</span>
        </div>

        {/* Cart Session Status */}
        {getStatusBadge(status)}
      </div>
    </div>
  );
};
