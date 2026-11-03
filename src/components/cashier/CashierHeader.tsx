'use client';

import React from 'react';
import { UserCheck, Store, Layers, ShieldCheck, CheckCircle2 } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import type { Lane } from '@/types/domain';

export interface CashierHeaderProps {
  cashierName: string;
  cashierEmail: string;
  role: string;
  lanes: Lane[];
  selectedLaneId: string;
  onSelectLane: (laneId: string) => void;
  storeName?: string;
}

export const CashierHeader: React.FC<CashierHeaderProps> = ({
  cashierName,
  cashierEmail,
  role,
  lanes,
  selectedLaneId,
  onSelectLane,
  storeName = 'Avenue Store Market',
}) => {
  const currentLane = lanes.find((l) => l.id === selectedLaneId);

  return (
    <div className="bg-white rounded-[24px] border border-[#E2EDF8] shadow-soft p-5 mb-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        {/* Cashier Profile */}
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-[#E0F2FE] border border-[#BAE6FD] flex items-center justify-center text-[#0369A1]">
            <UserCheck className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-[#0F2A43]">{cashierName}</h2>
              <Badge variant="blue" className="text-[10px] uppercase font-bold">
                {role}
              </Badge>
            </div>
            <p className="text-xs text-[#7B8BA0]">{cashierEmail}</p>
          </div>
        </div>

        {/* Counter Selection */}
        <div className="flex items-center gap-3 bg-[#F8FBFE] border border-[#E2EDF8] p-2.5 rounded-2xl">
          <div className="flex items-center gap-2 px-2">
            <Layers className="w-4 h-4 text-[#4DB3E6]" />
            <span className="text-xs font-semibold text-[#0F2A43] hidden sm:inline">Operating Station:</span>
          </div>

          <select
            value={selectedLaneId}
            onChange={(e) => onSelectLane(e.target.value)}
            className="text-xs font-bold text-[#0F2A43] bg-white border border-[#E2EDF8] rounded-xl px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#4DB3E6]/30 cursor-pointer"
          >
            {lanes.map((lane) => (
              <option key={lane.id} value={lane.id}>
                Counter {lane.lane_number} ({lane.name}) — {lane.status}
              </option>
            ))}
          </select>

          {currentLane && (
            <span
              className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                currentLane.status === 'OPEN'
                  ? 'bg-[#DCFCE7] text-[#15803D] border border-[#BBF7D0]'
                  : 'bg-[#FEF3C7] text-[#B45309] border border-[#FDE68A]'
              }`}
            >
              {currentLane.status}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

