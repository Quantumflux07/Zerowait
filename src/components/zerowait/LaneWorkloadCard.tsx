import React from 'react';
import { Users, Clock, ArrowRight, ShieldAlert } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Lane, LaneType } from '@/types/domain';

export interface LaneWorkloadCardProps {
  lane: Lane & {
    queue_count?: number;
    estimated_wait_seconds?: number;
    serving_token?: string | null;
  };
  isRecommended?: boolean;
  onAssign?: (laneId: string) => void;
  disabled?: boolean;
}

export const LaneWorkloadCard: React.FC<LaneWorkloadCardProps> = ({
  lane,
  isRecommended = false,
  onAssign,
  disabled = false,
}) => {
  const formatWaitTime = (seconds?: number) => {
    if (!seconds || seconds <= 0) return 'Immediate';
    const mins = Math.ceil(seconds / 60);
    return `~${mins} min${mins > 1 ? 's' : ''}`;
  };

  const getTypeBadge = (type: LaneType) => {
    switch (type) {
      case 'EXPRESS':
        return <Badge variant="blue">Express (≤10 items)</Badge>;
      case 'REGULAR':
        return <Badge variant="slate">Regular Counter</Badge>;
      case 'SELF_CHECKOUT':
        return <Badge variant="amber">Self-Checkout</Badge>;
    }
  };

  const getStatusBadge = () => {
    if (lane.status === 'OPEN') return <Badge variant="green" dot>Open</Badge>;
    if (lane.status === 'PAUSED') return <Badge variant="amber" dot>Paused</Badge>;
    return <Badge variant="red" dot>Closed</Badge>;
  };

  return (
    <Card
      className={`relative transition-all duration-200 ${
        isRecommended
          ? 'ring-2 ring-[#4DB3E6] border-[#4DB3E6]/40 bg-gradient-to-b from-white to-[#F0F9FF]'
          : 'bg-white'
      } ${disabled ? 'opacity-50 pointer-events-none' : ''}`}
    >
      {isRecommended && (
        <span className="absolute -top-3 left-6 bg-[#4DB3E6] text-white text-[10px] font-bold uppercase tracking-wider px-3 py-0.5 rounded-full shadow-sm">
          Recommended
        </span>
      )}

      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base font-bold text-[#0F2A43]">{lane.name}</h3>
            {getStatusBadge()}
          </div>
          <div className="mt-1">{getTypeBadge(lane.type)}</div>
        </div>

        {lane.serving_token && (
          <div className="text-right">
            <span className="text-[10px] text-[#7B8BA0] uppercase font-semibold block">
              Now Serving
            </span>
            <span className="text-sm font-black text-[#4DB3E6]">
              {lane.serving_token}
            </span>
          </div>
        )}
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 gap-2 my-4 pt-3 border-t border-[#E2EDF8]">
        <div className="flex items-center gap-2 bg-[#F8FBFE] p-2.5 rounded-xl border border-[#E2EDF8]">
          <Users className="w-4 h-4 text-[#4DB3E6]" />
          <div>
            <div className="text-[10px] text-[#7B8BA0] font-medium">Queue Depth</div>
            <div className="text-xs font-bold text-[#0F2A43]">
              {lane.queue_count ?? 0} {lane.queue_count === 1 ? 'cart' : 'carts'}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 bg-[#F8FBFE] p-2.5 rounded-xl border border-[#E2EDF8]">
          <Clock className="w-4 h-4 text-[#F59E0B]" />
          <div>
            <div className="text-[10px] text-[#7B8BA0] font-medium">Est. Wait</div>
            <div className="text-xs font-bold text-[#0F2A43]">
              {formatWaitTime(lane.estimated_wait_seconds)}
            </div>
          </div>
        </div>
      </div>

      {/* Action */}
      {onAssign && lane.status === 'OPEN' && (
        <Button
          variant={isRecommended ? 'primary' : 'outline'}
          size="sm"
          fullWidth
          onClick={() => onAssign(lane.id)}
          icon={<ArrowRight className="w-3.5 h-3.5" />}
        >
          Assign to this Lane
        </Button>
      )}

      {lane.status !== 'OPEN' && (
        <div className="flex items-center justify-center gap-1.5 text-xs text-[#7B8BA0] py-1 font-medium">
          <ShieldAlert className="w-3.5 h-3.5 text-[#EF4444]" />
          <span>Counter unavailable for new allocations</span>
        </div>
      )}
    </Card>
  );
};
