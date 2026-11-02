import React from 'react';
import Link from 'next/link';
import { AppHeader } from '@/components/layout/AppHeader';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import {
  ShoppingCart,
  Users,
  Database,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  Clock,
  Layers,
} from 'lucide-react';

export default function RootPage() {
  return (
    <div className="min-h-screen bg-[#EAF4FF] text-[#0F2A43] flex flex-col">
      <AppHeader />

      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 py-10 sm:py-16 flex flex-col justify-center">
        {/* Main Brand Hero */}
        <div className="text-center max-w-2xl mx-auto mb-10 sm:mb-12">
          <div className="inline-flex items-center gap-2 bg-[#E0F2FE] text-[#0369A1] px-4 py-1.5 rounded-full text-xs font-bold mb-4 border border-[#BAE6FD]">
            <ShieldCheck className="w-3.5 h-3.5 text-[#4DB3E6]" />
            Active Integration Instance — develop branch
          </div>

          <h1 className="text-3xl sm:text-5xl font-black text-[#0F2A43] tracking-tight">
            Intelligent Supermarket Checkout & Queue Platform
          </h1>

          <p className="mt-3 text-sm sm:text-base text-[#64748B] leading-relaxed">
            Shared foundation powering customer smart shopping carts and dynamic checkout queue
            allocation.
          </p>
        </div>

        {/* Primary Functional Modules Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10">
          {/* Module 1: Shopping Cart Interface */}
          <Card className="flex flex-col justify-between hover:shadow-card-hover transition-all duration-200 border-[#E2EDF8]">
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="w-12 h-12 rounded-2xl bg-[#E0F2FE] border border-[#BAE6FD] flex items-center justify-center text-[#4DB3E6]">
                  <ShoppingCart className="w-6 h-6 stroke-[2.2]" />
                </div>
                <Badge variant="blue">Branch: cart</Badge>
              </div>

              <h2 className="text-xl font-bold text-[#0F2A43] mb-2">
                Customer Shopping Cart
              </h2>

              <p className="text-xs sm:text-sm text-[#64748B] leading-relaxed mb-6">
                Customer-facing shopping cart interface. Connects to physical cart QR identity,
                handles barcode scanning, item quantity adjustments, and locks carts upon checkout.
              </p>

              <div className="space-y-2 text-xs text-[#0F2A43] bg-[#F8FBFE] p-3.5 rounded-2xl border border-[#E2EDF8] mb-6">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-[#10B981]" />
                  <span>Permanent QR Asset Identification</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-[#10B981]" />
                  <span>Server-Side Integer Paise Calculation</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-[#10B981]" />
                  <span>Session Lock on Queue Allocation</span>
                </div>
              </div>
            </div>

            <div className="pt-2">
              <Button
                variant="primary"
                size="md"
                fullWidth
                disabled
                className="opacity-90 cursor-default"
                icon={<ArrowRight className="w-4 h-4" />}
              >
                Managed in cart branch
              </Button>
            </div>
          </Card>

          {/* Module 2: Queue Engine Interface */}
          <Card className="flex flex-col justify-between hover:shadow-card-hover transition-all duration-200 border-[#E2EDF8]">
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="w-12 h-12 rounded-2xl bg-[#E0F2FE] border border-[#BAE6FD] flex items-center justify-center text-[#4DB3E6]">
                  <Users className="w-6 h-6 stroke-[2.2]" />
                </div>
                <Badge variant="blue">Branch: queue_engine</Badge>
              </div>

              <h2 className="text-xl font-bold text-[#0F2A43] mb-2">
                Checkout Queue Engine
              </h2>

              <p className="text-xs sm:text-sm text-[#64748B] leading-relaxed mb-6">
                Intelligent checkout allocation system. Dynamically balances counter workload,
                routes small baskets to express lanes, and broadcasts tokens to public displays.
              </p>

              <div className="space-y-2 text-xs text-[#0F2A43] bg-[#F8FBFE] p-3.5 rounded-2xl border border-[#E2EDF8] mb-6">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-[#10B981]" />
                  <span>Dynamic Wait Time Workload Formulas</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-[#10B981]" />
                  <span>Express Lane Segregation (≤10 items)</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-[#10B981]" />
                  <span>Real-Time Counter Token Broadcast</span>
                </div>
              </div>
            </div>

            <div className="pt-2">
              <Button
                variant="primary"
                size="md"
                fullWidth
                disabled
                className="opacity-90 cursor-default"
                icon={<ArrowRight className="w-4 h-4" />}
              >
                Managed in queue_engine branch
              </Button>
            </div>
          </Card>
        </div>

        {/* Foundation Health & Infrastructure Card */}
        <Card className="border-[#E2EDF8] bg-white">
          <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-[#E2EDF8]">
            <div>
              <h3 className="text-sm font-bold text-[#0F2A43]">
                Shared Foundation & Infrastructure
              </h3>
              <p className="text-xs text-[#7B8BA0]">
                Reusable services and database contracts ready for integration.
              </p>
            </div>
            <Badge variant="green" dot>
              Operational
            </Badge>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-xl bg-[#F0F9FF] text-[#4DB3E6]">
                <Database className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs font-bold text-[#0F2A43]">PostgreSQL Schema</div>
                <div className="text-[11px] text-[#7B8BA0]">11 tables with RLS & indexes</div>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="p-2 rounded-xl bg-[#F0F9FF] text-[#4DB3E6]">
                <Clock className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs font-bold text-[#0F2A43]">Monetary Engine</div>
                <div className="text-[11px] text-[#7B8BA0]">Integer paise & GST basis points</div>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="p-2 rounded-xl bg-[#F0F9FF] text-[#4DB3E6]">
                <Layers className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs font-bold text-[#0F2A43]">API Contracts</div>
                <div className="text-[11px] text-[#7B8BA0]">8 validated endpoints active</div>
              </div>
            </div>
          </div>
        </Card>
      </main>
    </div>
  );
}
