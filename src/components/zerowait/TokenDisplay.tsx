import React from 'react';
import { GlassCard } from '@/components/ui/GlassCard';
import { Badge } from '@/components/ui/Badge';
import { CheckCircle2, Clock, MapPin } from 'lucide-react';

export interface TokenDisplayProps {
  tokenNumber: string;
  laneName: string;
  queuePosition: number;
  estimatedWaitSeconds: number;
  status?: string;
  className?: string;
}

export const TokenDisplay: React.FC<TokenDisplayProps> = ({
  tokenNumber,
  laneName,
  queuePosition,
  estimatedWaitSeconds,
  status = 'Assigned & Queued',
  className,
}) => {
  const waitMinutes = Math.max(1, Math.ceil(estimatedWaitSeconds / 60));

  return (
    <GlassCard
      intensity="high"
      className={`border border-[#BAE6FD] shadow-card-hover ${className || ''}`}
    >
      <div className="text-center space-y-3">
        <div className="inline-flex items-center gap-1.5">
          <Badge variant="blue" dot>
            {status}
          </Badge>
        </div>

        <div>
          <span className="text-xs uppercase tracking-widest font-bold text-[#7B8BA0] block">
            Your Checkout Token
          </span>
          <div className="text-4xl sm:text-5xl font-black text-[#0F2A43] tracking-tight my-1">
            {tokenNumber}
          </div>
        </div>

        <div className="p-3 rounded-2xl bg-white/90 border border-[#E2EDF8] space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-[#7B8BA0] flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-[#4DB3E6]" />
              Assigned Counter
            </span>
            <span className="font-bold text-[#0F2A43]">{laneName}</span>
          </div>

          <div className="flex items-center justify-between text-xs">
            <span className="text-[#7B8BA0] flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-[#10B981]" />
              Queue Position
            </span>
            <span className="font-bold text-[#0F2A43]">
              #{queuePosition} in line
            </span>
          </div>

          <div className="flex items-center justify-between text-xs">
            <span className="text-[#7B8BA0] flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-[#F59E0B]" />
              Estimated Wait
            </span>
            <span className="font-bold text-[#0F2A43]">
              ~{waitMinutes} min{waitMinutes > 1 ? 's' : ''}
            </span>
          </div>
        </div>
      </div>
    </GlassCard>
  );
};
