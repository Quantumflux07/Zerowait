'use client';

/**
 * AssignedLaneBanner
 * Shown prominently when cart status is ASSIGNED_LOCKED.
 * Displays token, lane, estimated wait, and a locked status.
 * Disables all scanning/editing operations.
 */

import React from 'react';
import { Lock, MapPin, Clock, Hash, CheckCircle2, AlertTriangle } from 'lucide-react';
import { GlassCard } from '@/components/ui/GlassCard';
import { Badge } from '@/components/ui/Badge';
import { PaisePrice } from '@/components/zerowait/PaisePrice';
import type { LaneAssignment, CartSession } from '@/types/domain';

export interface AssignedLaneBannerProps {
  assignment: LaneAssignment | null;
  session: CartSession;
}

export const AssignedLaneBanner: React.FC<AssignedLaneBannerProps> = ({ assignment, session }) => {
  const waitMinutes = assignment
    ? Math.max(1, Math.ceil(assignment.estimated_wait_seconds / 60))
    : null;

  const laneName = assignment?.lane?.name ?? (session.assigned_lane_id ? 'Checkout Counter' : 'Checking…');
  const tokenNumber = assignment?.token_number ?? '—';
  const queuePosition = assignment?.queue_position ?? 1;

  return (
    <GlassCard intensity="high" className="border border-[#BAE6FD] shadow-card-hover">
      {/* Lock banner */}
      <div className="flex items-center gap-2 mb-4">
        <div className="w-8 h-8 rounded-full bg-[#4DB3E6] flex items-center justify-center flex-shrink-0">
          <Lock className="w-4 h-4 text-white" />
        </div>
        <div>
          <p className="text-xs font-bold text-[#0F2A43]">Cart Locked for Checkout</p>
          <p className="text-[10px] text-[#7B8BA0] leading-tight">
            Scanning &amp; editing disabled · Queue Engine assigned
          </p>
        </div>
        <Badge variant="blue" dot className="ml-auto flex-shrink-0">
          ASSIGNED_LOCKED
        </Badge>
      </div>

      {/* Token hero */}
      <div className="text-center py-3 mb-4 bg-white/70 rounded-2xl border border-[#E2EDF8]">
        <p className="text-[10px] uppercase tracking-widest font-bold text-[#7B8BA0] mb-1">
          Your Token
        </p>
        <div className="text-4xl sm:text-5xl font-black text-[#0F2A43] tracking-tight">
          {tokenNumber}
        </div>
      </div>

      {/* Details grid */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <DetailCell
          icon={<MapPin className="w-3.5 h-3.5 text-[#4DB3E6]" />}
          label="Counter"
          value={laneName}
        />
        <DetailCell
          icon={<Hash className="w-3.5 h-3.5 text-[#10B981]" />}
          label="Queue Position"
          value={`#${queuePosition} in line`}
        />
        {waitMinutes !== null && (
          <DetailCell
            icon={<Clock className="w-3.5 h-3.5 text-[#F59E0B]" />}
            label="Est. Wait"
            value={`~${waitMinutes} min${waitMinutes > 1 ? 's' : ''}`}
          />
        )}
        <DetailCell
          icon={<CheckCircle2 className="w-3.5 h-3.5 text-[#4DB3E6]" />}
          label="Status"
          value={assignment?.assignment_status ?? 'QUEUED'}
        />
      </div>

      {/* Final bill callout */}
      <div className="bg-white/80 rounded-2xl border border-[#E2EDF8] p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-wider font-bold text-[#7B8BA0]">Final Bill</p>
            <p className="text-[11px] text-[#7B8BA0] mt-0.5">{session.total_items} item(s)</p>
          </div>
          <PaisePrice paise={session.grand_total_paise} size="xl" />
        </div>
      </div>

      {/* Warning */}
      <div className="mt-3 flex items-start gap-2 bg-[#FEF3C7] border border-[#FDE68A] rounded-2xl px-3.5 py-2.5">
        <AlertTriangle className="w-4 h-4 text-[#B45309] flex-shrink-0 mt-0.5" />
        <p className="text-[11px] text-[#92400E] leading-relaxed">
          Please proceed to <strong>{laneName}</strong> and present your token to the cashier.
          Do not add more items.
        </p>
      </div>
    </GlassCard>
  );
};

interface DetailCellProps {
  icon: React.ReactNode;
  label: string;
  value: string;
}

const DetailCell: React.FC<DetailCellProps> = ({ icon, label, value }) => (
  <div className="bg-white/70 border border-[#E2EDF8] rounded-xl px-3 py-2">
    <div className="flex items-center gap-1.5 text-[10px] text-[#7B8BA0] mb-0.5">
      {icon}
      {label}
    </div>
    <p className="text-xs font-bold text-[#0F2A43] truncate">{value}</p>
  </div>
);
