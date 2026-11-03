'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  QrCode,
  Search,
  Camera,
  RefreshCw,
  Clock,
  Users,
  CheckCircle2,
  AlertCircle,
  Zap,
  ArrowRight,
  Sparkles,
  Lock,
  Radio,
  Printer,
  ChevronRight,
  ShieldCheck,
  Package,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { PaisePrice } from '@/components/zerowait/PaisePrice';
import { CartHeader } from '@/components/zerowait/CartHeader';
import { TokenDisplay } from '@/components/zerowait/TokenDisplay';
import { QrCameraScanner } from '@/components/queue/QrCameraScanner';
import { evaluateLanesForCart, LaneWithQueueDetails, OptimalLaneSelection } from '@/lib/engine/queue';
import { Cart, CartSession, LaneAssignment } from '@/types/domain';
import { CartRetrievalResponse, LaneWorkloadResponse, QueueAssignmentResponse } from '@/types/api';

export const QueueEngineView: React.FC = () => {
  // Search & Scanner State
  const [cartSearchInput, setCartSearchInput] = useState<string>('ZW-CART-001');
  const [isScannerOpen, setIsScannerOpen] = useState<boolean>(false);
  const [isLoadingCart, setIsLoadingCart] = useState<boolean>(false);
  const [cartError, setCartError] = useState<string | null>(null);

  // Active Cart Data
  const [currentCart, setCurrentCart] = useState<Cart | null>(null);
  const [activeSession, setActiveSession] = useState<CartSession | null>(null);
  const [authoritativeBill, setAuthoritativeBill] = useState<{
    total_items: number;
    subtotal_paise: number;
    tax_paise: number;
    discount_paise: number;
    grand_total_paise: number;
  } | null>(null);

  // Lanes & Workloads
  const [lanes, setLanes] = useState<LaneWithQueueDetails[]>([]);
  const [isLoadingLanes, setIsLoadingLanes] = useState<boolean>(false);
  const [lanesError, setLanesError] = useState<string | null>(null);
  const [evaluation, setEvaluation] = useState<OptimalLaneSelection | null>(null);

  // Assignment State
  const [isAssigning, setIsAssigning] = useState<boolean>(false);
  const [assignmentError, setAssignmentError] = useState<string | null>(null);
  const [activeAssignment, setActiveAssignment] = useState<LaneAssignment | null>(null);
  const [realtimeBroadcastAt, setRealtimeBroadcastAt] = useState<string | null>(null);

  // Fetch Lanes Workloads
  const fetchLanes = useCallback(async () => {
    setIsLoadingLanes(true);
    setLanesError(null);
    try {
      const res = await fetch('/api/v1/queue/lanes');
      const json: LaneWorkloadResponse = await res.json();
      if (!res.ok || !json.success || !json.data) {
        throw new Error(json.error?.message || 'Failed to fetch counter workloads.');
      }
      setLanes(json.data.lanes as LaneWithQueueDetails[]);
    } catch (err) {
      setLanesError(err instanceof Error ? err.message : 'Counter workloads could not be loaded.');
    } finally {
      setIsLoadingLanes(false);
    }
  }, []);

  // Fetch Cart & Authoritative Session by QR Code
  const fetchCart = useCallback(
    async (codeToSearch: string) => {
      const cleanCode = codeToSearch.trim();
      if (!cleanCode) return;

      setIsLoadingCart(true);
      setCartError(null);
      setAssignmentError(null);

      try {
        const res = await fetch(`/api/v1/carts/${encodeURIComponent(cleanCode)}`);
        const json: CartRetrievalResponse = await res.json();

        if (!res.ok || !json.success || !json.data) {
          throw new Error(json.error?.message || `Cart '${cleanCode}' was not found.`);
        }

        const { cart, active_session } = json.data;
        setCurrentCart(cart);
        setActiveSession(active_session);

        if (active_session) {
          // Authoritative bill from session
          setAuthoritativeBill({
            total_items: active_session.total_items,
            subtotal_paise: active_session.subtotal_paise,
            tax_paise: active_session.tax_paise,
            discount_paise: active_session.discount_paise,
            grand_total_paise: active_session.grand_total_paise,
          });

          // Check if cart is already assigned
          if (active_session.status === 'ASSIGNED_LOCKED' && active_session.assigned_lane_id) {
            // Find assigned lane
            const assignedLane = lanes.find((l) => l.id === active_session.assigned_lane_id);
            setActiveAssignment({
              id: `la_existing_${active_session.id}`,
              lane_id: active_session.assigned_lane_id,
              session_id: active_session.id,
              token_number: assignedLane?.type === 'EXPRESS' ? 'E-099' : 'A-105',
              queue_position: 1,
              estimated_wait_seconds: assignedLane?.estimated_wait_seconds || 45,
              assignment_status: 'QUEUED',
              called_at: null,
              served_at: null,
              created_at: active_session.locked_at || new Date().toISOString(),
              updated_at: new Date().toISOString(),
              lane: assignedLane,
            });
            setRealtimeBroadcastAt(active_session.locked_at || new Date().toISOString());
          } else {
            setActiveAssignment(null);
          }
        } else {
          setAuthoritativeBill(null);
          setActiveAssignment(null);
        }
      } catch (err) {
        setCartError(err instanceof Error ? err.message : 'Cart retrieval failed.');
        setCurrentCart(null);
        setActiveSession(null);
        setAuthoritativeBill(null);
        setActiveAssignment(null);
      } finally {
        setIsLoadingCart(false);
      }
    },
    [lanes]
  );

  // Initial Load
  useEffect(() => {
    fetchLanes();
  }, [fetchLanes]);

  // Once lanes are fetched, load default cart
  useEffect(() => {
    if (lanes.length > 0 && !currentCart && !isLoadingCart) {
      fetchCart('ZW-CART-001');
    }
  }, [lanes, currentCart, isLoadingCart, fetchCart]);

  // Re-run Queue Engine Algorithm whenever lanes or cart item count change
  useEffect(() => {
    if (lanes.length > 0 && activeSession) {
      const result = evaluateLanesForCart(lanes, activeSession.total_items);
      setEvaluation(result);
    } else {
      setEvaluation(null);
    }
  }, [lanes, activeSession]);

  // Execute Atomic Concurrency-Safe Queue Assignment
  const handleAssignToLane = async (targetLaneId?: string) => {
    if (!activeSession) return;

    if (activeSession.total_items === 0) {
      setAssignmentError('Cannot queue an empty shopping cart. Please add items first.');
      return;
    }

    setIsAssigning(true);
    setAssignmentError(null);

    try {
      const res = await fetch('/api/v1/queue/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: activeSession.id,
          target_lane_id: targetLaneId,
        }),
      });

      const json: QueueAssignmentResponse = await res.json();

      if (!res.ok || !json.success || !json.data) {
        throw new Error(json.error?.message || 'Failed to assign checkout lane.');
      }

      // Update state with confirmed assignment
      setActiveAssignment(json.data.assignment);
      setActiveSession((prev) =>
        prev
          ? {
              ...prev,
              status: 'ASSIGNED_LOCKED',
              assigned_lane_id: json.data?.assignment.lane_id || null,
              locked_at: new Date().toISOString(),
            }
          : null
      );

      const timestamp = new Date().toLocaleTimeString();
      setRealtimeBroadcastAt(timestamp);

      // Broadcast to native browser BroadcastChannel for multi-window / customer cart sync
      try {
        if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
          const bc = new BroadcastChannel('zerowait_cart_sync');
          bc.postMessage({
            event: 'ASSIGNMENT_CONFIRMED',
            type: 'LANE_ASSIGNED',
            sessionId: activeSession.id,
            cartId: currentCart?.id,
            qrCode: currentCart?.qr_code,
            laneId: json.data.assignment.lane_id,
            laneName: json.data.estimate?.lane_name || json.data.assignment.lane?.name || 'Counter',
            laneType: json.data.estimate?.lane_type || json.data.assignment.lane?.type || 'REGULAR',
            tokenNumber: json.data.assignment.token_number,
            queuePosition: json.data.assignment.queue_position,
            estimatedWaitSeconds: json.data.assignment.estimated_wait_seconds,
            assignment: json.data.assignment,
            estimate: json.data.estimate,
            timestamp: new Date().toISOString(),
          });
          bc.close();
        }
      } catch {
        // Fallback gracefully
      }

      // Refresh lane workloads
      fetchLanes();
    } catch (err) {
      setAssignmentError(err instanceof Error ? err.message : 'Queue assignment failed.');
    } finally {
      setIsAssigning(false);
    }
  };

  const formatSecondsToMinutes = (seconds?: number) => {
    if (!seconds || seconds <= 0) return 'Immediate';
    const mins = Math.ceil(seconds / 60);
    return `~${mins} min${mins > 1 ? 's' : ''}`;
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto px-4 sm:px-6 py-6 pb-20">
      {/* Top Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white border border-[#E2EDF8] rounded-[24px] p-5 shadow-soft">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-[#E0F2FE] border border-[#BAE6FD] flex items-center justify-center text-[#4DB3E6]">
            <Zap className="w-6 h-6 stroke-[2.3]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-black text-[#0F2A43] tracking-tight">
                Checkout Queue Engine
              </h1>
              <Badge variant="blue">Dynamic Balancing</Badge>
            </div>
            <p className="text-xs sm:text-sm text-[#7B8BA0] mt-0.5">
              Workload-predicted lane allocation, express basket segregation, and realtime cart locking.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchLanes}
            disabled={isLoadingLanes}
            icon={<RefreshCw className={`w-3.5 h-3.5 ${isLoadingLanes ? 'animate-spin' : ''}`} />}
          >
            Refresh Workloads
          </Button>
          <div className="flex items-center gap-1.5 bg-[#F0FDF4] border border-[#BBF7D0] text-[#166534] px-3 py-1.5 rounded-full text-xs font-bold">
            <Radio className="w-3.5 h-3.5 text-[#10B981] animate-pulse" />
            <span>Realtime Engine Ready</span>
          </div>
        </div>
      </div>

      {/* Main Grid: Left Scanner & Cart, Right Lane Workload & Allocation */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* =================================================================== */}
        {/* LEFT COLUMN: SCANNER, CART IDENTIFICATION & AUTHORITATIVE BILL (5 cols) */}
        {/* =================================================================== */}
        <div className="lg:col-span-5 space-y-6">
          {/* Cart Ingestion & QR Scanner Card */}
          <Card className="border-[#E2EDF8] bg-white">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-[#E2EDF8]">
              <div className="flex items-center gap-2">
                <QrCode className="w-4 h-4 text-[#4DB3E6]" />
                <h2 className="text-sm font-bold text-[#0F2A43]">Cart QR Code Ingestion</h2>
              </div>
              <span className="text-[11px] font-semibold text-[#7B8BA0]">Step 1 of 2</span>
            </div>

            {/* Input & Camera Action Row */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                fetchCart(cartSearchInput);
              }}
              className="space-y-3"
            >
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input
                    placeholder="Enter Cart ID (e.g. ZW-CART-001)"
                    value={cartSearchInput}
                    onChange={(e) => setCartSearchInput(e.target.value)}
                    leftIcon={<Search className="w-4 h-4 text-[#7B8BA0]" />}
                    className="pr-10"
                  />
                  {cartSearchInput && (
                    <button
                      type="button"
                      onClick={() => setCartSearchInput('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[#7B8BA0] hover:text-[#0F2A43]"
                    >
                      ×
                    </button>
                  )}
                </div>

                <Button
                  type="submit"
                  variant="primary"
                  size="md"
                  disabled={isLoadingCart || !cartSearchInput.trim()}
                  icon={<ArrowRight className="w-4 h-4" />}
                >
                  Lookup
                </Button>
              </div>

              <div className="flex items-center justify-between pt-1">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  fullWidth
                  onClick={() => setIsScannerOpen(true)}
                  icon={<Camera className="w-4 h-4 text-[#4DB3E6]" />}
                >
                  Open Live Camera Scanner
                </Button>
              </div>
            </form>

            {/* Quick Test Presets Selector */}
            <div className="mt-4 pt-4 border-t border-[#E2EDF8]">
              <div className="flex items-center gap-1.5 text-[11px] font-bold text-[#7B8BA0] mb-2 uppercase tracking-wider">
                <Sparkles className="w-3.5 h-3.5 text-[#4DB3E6]" />
                <span>Test Preset Carts:</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {[
                  { id: 'ZW-CART-001', label: 'Cart #001 (4 items)' },
                  { id: 'ZW-CART-002', label: 'Cart #002 (18 items - Trolley)' },
                  { id: 'ZW-CART-003', label: 'Cart #003 (2 items - Basket)' },
                  { id: 'ZW-CART-004', label: 'Cart #004 (Empty)' },
                  { id: 'ZW-CART-005', label: 'Cart #005 (Already Locked)' },
                ].map((preset) => (
                  <button
                    key={preset.id}
                    onClick={() => {
                      setCartSearchInput(preset.id);
                      fetchCart(preset.id);
                    }}
                    className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                      currentCart?.qr_code === preset.id
                        ? 'bg-[#E0F2FE] border-[#4DB3E6] text-[#0369A1] font-bold'
                        : 'bg-[#F8FBFE] border-[#E2EDF8] text-[#0F2A43] hover:bg-[#EAF4FF]'
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Error Message */}
            {cartError && (
              <div className="mt-3 p-3 rounded-xl bg-[#FEF2F2] border border-[#FEE2E2] flex items-center gap-2 text-xs text-[#DC2626]">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{cartError}</span>
              </div>
            )}
          </Card>

          {/* Cart Inspection & Authoritative Bill */}
          {currentCart && activeSession && (
            <div className="space-y-4 animate-in fade-in duration-200">
              {/* Cart Identity Header */}
              <CartHeader
                qrCode={currentCart.qr_code}
                cartLabel={currentCart.cart_label}
                batteryLevel={currentCart.battery_level}
                status={activeSession.status}
              />

              {/* Duplicate Assignment Banner if already locked */}
              {activeSession.status === 'ASSIGNED_LOCKED' && (
                <div className="p-3.5 rounded-2xl bg-[#F0FDF4] border border-[#86EFAC] flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-[#16A34A] mt-0.5 flex-shrink-0" />
                  <div className="text-xs text-[#166534]">
                    <div className="font-bold">Cart is Already Locked for Checkout</div>
                    <div className="text-[11px] text-[#15803D] mt-0.5">
                      Assigned to Counter {lanes.find((l) => l.id === activeSession.assigned_lane_id)?.lane_number || 1}.
                      Duplicate queue allocations are blocked to protect queue integrity.
                    </div>
                  </div>
                </div>
              )}

              {/* Authoritative Scanned Items List */}
              <Card className="border-[#E2EDF8] bg-white">
                <div className="flex items-center justify-between pb-3 mb-3 border-b border-[#E2EDF8]">
                  <div className="flex items-center gap-2">
                    <Package className="w-4 h-4 text-[#4DB3E6]" />
                    <h3 className="text-sm font-bold text-[#0F2A43]">
                      Scanned Cart Items ({activeSession.total_items})
                    </h3>
                  </div>
                  <Badge variant={activeSession.total_items <= 10 ? 'blue' : 'amber'}>
                    {activeSession.total_items <= 10
                      ? 'Express Eligible (≤10)'
                      : 'Regular Basket (>10)'}
                  </Badge>
                </div>

                {activeSession.items && activeSession.items.length > 0 ? (
                  <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                    {activeSession.items.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-center justify-between p-2.5 bg-[#F8FBFE] rounded-xl border border-[#E2EDF8] text-xs"
                      >
                        <div className="min-w-0 pr-2">
                          <div className="font-bold text-[#0F2A43] truncate">
                            {item.product_name_snapshot}
                          </div>
                          <div className="text-[10px] text-[#7B8BA0] font-mono mt-0.5">
                            {item.barcode_snapshot} • Qty: {item.quantity}
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <PaisePrice paise={item.total_price_paise} size="sm" />
                          <div className="text-[10px] text-[#7B8BA0]">
                            {item.quantity} × <PaisePrice paise={item.unit_price_paise} size="sm" />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="py-6 text-center text-xs text-[#7B8BA0]">
                    <AlertCircle className="w-6 h-6 mx-auto mb-1 text-[#F59E0B]" />
                    <span>Cart is empty. Items must be scanned before queueing.</span>
                  </div>
                )}

                {/* Authoritative Server Bill Summary */}
                {authoritativeBill && (
                  <div className="mt-4 pt-3 border-t border-[#E2EDF8] space-y-1.5 bg-[#F0F9FF]/60 p-3 rounded-xl border">
                    <div className="flex items-center justify-between text-xs text-[#64748B]">
                      <span>Subtotal</span>
                      <PaisePrice paise={authoritativeBill.subtotal_paise} size="sm" />
                    </div>
                    <div className="flex items-center justify-between text-xs text-[#64748B]">
                      <span>GST Tax (Server Computed)</span>
                      <PaisePrice paise={authoritativeBill.tax_paise} size="sm" />
                    </div>
                    {authoritativeBill.discount_paise > 0 && (
                      <div className="flex items-center justify-between text-xs text-[#16A34A]">
                        <span>Applied Discount</span>
                        <span>- <PaisePrice paise={authoritativeBill.discount_paise} size="sm" /></span>
                      </div>
                    )}
                    <div className="flex items-center justify-between text-sm font-black text-[#0F2A43] pt-2 border-t border-[#BAE6FD]">
                      <span className="flex items-center gap-1.5">
                        <ShieldCheck className="w-4 h-4 text-[#10B981]" />
                        Authoritative Bill
                      </span>
                      <PaisePrice paise={authoritativeBill.grand_total_paise} size="lg" />
                    </div>
                  </div>
                )}
              </Card>
            </div>
          )}
        </div>

        {/* =================================================================== */}
        {/* RIGHT COLUMN: WORKLOAD ANALYSIS, OPTIMAL ALLOCATION & REALTIME CONFIRMATION (7 cols) */}
        {/* =================================================================== */}
        <div className="lg:col-span-7 space-y-6">
          {/* Confirmation & Token Display Panel if Assigned */}
          {activeAssignment && (
            <div className="space-y-4 animate-in fade-in duration-300">
              <TokenDisplay
                tokenNumber={activeAssignment.token_number}
                laneName={
                  activeAssignment.lane?.name ||
                  lanes.find((l) => l.id === activeAssignment.lane_id)?.name ||
                  'Checkout Counter'
                }
                queuePosition={activeAssignment.queue_position}
                estimatedWaitSeconds={activeAssignment.estimated_wait_seconds}
                status="Assigned & Locked for Checkout"
              />

              {/* Realtime Broadcast Status */}
              <div className="p-4 bg-white rounded-[22px] border border-[#E2EDF8] shadow-soft flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-3 h-3 rounded-full bg-[#10B981] animate-ping" />
                  <div>
                    <div className="text-xs font-bold text-[#0F2A43] flex items-center gap-1.5">
                      <span>Confirmed via Supabase Realtime</span>
                      <Badge variant="green">Synced</Badge>
                    </div>
                    <div className="text-[11px] text-[#7B8BA0]">
                      Cart screen locked. Physical trolley directed to assigned counter.
                      {realtimeBroadcastAt && ` Broadcasted at ${realtimeBroadcastAt}`}
                    </div>
                  </div>
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    // Reset to test another cart
                    setCartSearchInput('ZW-CART-002');
                    fetchCart('ZW-CART-002');
                  }}
                  icon={<ChevronRight className="w-3.5 h-3.5" />}
                >
                  Scan Next Cart
                </Button>
              </div>
            </div>
          )}

          {/* Allocation Action Card if not yet assigned */}
          {activeSession && activeSession.status === 'SHOPPING' && (
            <Card className="border-[#4DB3E6] bg-gradient-to-br from-white via-white to-[#F0F9FF] shadow-soft">
              <div className="flex items-start justify-between gap-3 mb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <Zap className="w-5 h-5 text-[#4DB3E6]" />
                    <h3 className="text-base font-black text-[#0F2A43]">
                      Dynamic Lane Allocation
                    </h3>
                  </div>
                  <p className="text-xs text-[#7B8BA0] mt-1">
                    Workload evaluation determines optimal counter. Cart will transition to{' '}
                    <span className="font-mono font-bold text-[#0369A1]">ASSIGNED_LOCKED</span> to prevent
                    unauthorized item changes.
                  </p>
                </div>

                {evaluation?.recommendedLane && (
                  <Badge variant="green" dot>
                    Optimal Lane Found
                  </Badge>
                )}
              </div>

              {/* Best Lane Callout */}
              {evaluation?.recommendedLane && (
                <div className="p-4 rounded-2xl bg-white border border-[#BAE6FD] shadow-sm mb-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[#0369A1]">
                        Recommended Counter
                      </span>
                      <div className="text-base font-black text-[#0F2A43]">
                        {evaluation.recommendedLane.name}
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] text-[#7B8BA0] font-semibold block uppercase">
                        Predicted Wait
                      </span>
                      <span className="text-base font-black text-[#10B981]">
                        {formatSecondsToMinutes(evaluation.estimate?.estimatedWaitSeconds)}
                      </span>
                    </div>
                  </div>

                  <div className="text-xs text-[#64748B] pt-2 border-t border-[#E2EDF8] flex items-center justify-between">
                    <span>
                      Queue Depth: <strong className="text-[#0F2A43]">#{evaluation.estimate?.queueDepth} in line</strong>
                    </span>
                    <span className="text-[11px] text-[#0369A1] font-semibold">
                      Lowest completion time factoring items & cashier speed
                    </span>
                  </div>
                </div>
              )}

              {/* Primary Confirm Button */}
              {assignmentError && (
                <div className="mb-3 p-3 rounded-xl bg-[#FEF2F2] border border-[#FEE2E2] flex items-center gap-2 text-xs text-[#DC2626]">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{assignmentError}</span>
                </div>
              )}

              <Button
                variant="primary"
                size="lg"
                fullWidth
                disabled={isAssigning || !evaluation?.recommendedLane}
                onClick={() => handleAssignToLane(evaluation?.recommendedLane?.id)}
                icon={<Lock className="w-4 h-4" />}
                className="shadow-md"
              >
                {isAssigning
                  ? 'Computing & Locking Cart Session...'
                  : `Assign to ${evaluation?.recommendedLane?.name || 'Optimal Counter'}`}
              </Button>
            </Card>
          )}

          {/* Real-Time Lane Workloads Board */}
          <Card className="border-[#E2EDF8] bg-white">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-[#E2EDF8]">
              <div>
                <h3 className="text-sm font-bold text-[#0F2A43] flex items-center gap-2">
                  <Users className="w-4 h-4 text-[#4DB3E6]" />
                  Checkout Counters & Workload Breakdown
                </h3>
                <p className="text-[11px] text-[#7B8BA0] mt-0.5">
                  Algorithm selects counter by predicted completion time, never raw customer count.
                </p>
              </div>

              <div className="flex items-center gap-1.5 text-xs text-[#7B8BA0]">
                <Clock className="w-3.5 h-3.5 text-[#F59E0B]" />
                <span>
                  {lanes.filter((l) => l.status === 'OPEN').length} of {lanes.length} Counters Open
                </span>
              </div>
            </div>

            {lanesError && (
              <div className="p-3 mb-4 rounded-xl bg-[#FEF2F2] border border-[#FEE2E2] text-xs text-[#DC2626]">
                {lanesError}
              </div>
            )}

            {/* Counters List */}
            <div className="space-y-3">
              {lanes.map((lane) => {
                const laneEval = evaluation?.allEvaluations.find((e) => e.lane.id === lane.id);
                const isRecommended = evaluation?.recommendedLane?.id === lane.id;
                const isEligible = laneEval ? laneEval.isEligible : lane.status === 'OPEN';

                return (
                  <div
                    key={lane.id}
                    className={`p-4 rounded-2xl border transition-all ${
                      isRecommended
                        ? 'border-[#4DB3E6] bg-[#F0F9FF]/80 ring-2 ring-[#4DB3E6]/30'
                        : isEligible
                        ? 'border-[#E2EDF8] bg-white hover:border-[#CBD5E1]'
                        : 'border-[#E2EDF8] bg-[#F8FAFC] opacity-60'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="text-sm font-bold text-[#0F2A43]">{lane.name}</h4>
                          {lane.status === 'OPEN' && <Badge variant="green" dot>Open</Badge>}
                          {lane.status === 'PAUSED' && <Badge variant="amber" dot>Paused</Badge>}
                          {lane.status === 'CLOSED' && <Badge variant="red" dot>Closed</Badge>}
                          {isRecommended && (
                            <span className="bg-[#4DB3E6] text-white text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full">
                              Best Match
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-2 mt-1 text-xs text-[#7B8BA0]">
                          <span className="font-semibold text-[#0F2A43]">
                            {lane.type === 'EXPRESS'
                              ? 'Express Counter (≤10 items)'
                              : lane.type === 'SELF_CHECKOUT'
                              ? 'Self-Checkout'
                              : 'Regular Counter'}
                          </span>
                          {lane.serving_token && (
                            <span>• Serving: <strong className="text-[#4DB3E6] font-mono">{lane.serving_token}</strong></span>
                          )}
                        </div>
                      </div>

                      {/* Predicted Wait Time Pill */}
                      <div className="text-right flex-shrink-0">
                        <div className="text-[10px] text-[#7B8BA0] uppercase font-bold">
                          Predicted Wait
                        </div>
                        <div className="text-sm font-black text-[#0F2A43]">
                          {lane.status === 'OPEN'
                            ? formatSecondsToMinutes(
                                laneEval?.currentWorkloadSeconds ?? lane.estimated_wait_seconds
                              )
                            : 'Unavailable'}
                        </div>
                      </div>
                    </div>

                    {/* Metrics Row */}
                    <div className="mt-3 pt-3 border-t border-[#E2EDF8] flex flex-wrap items-center justify-between gap-2 text-xs">
                      <div className="flex items-center gap-4 text-[#64748B]">
                        <span className="flex items-center gap-1">
                          <Users className="w-3.5 h-3.5 text-[#4DB3E6]" />
                          <span>Queue: <strong>{lane.current_queue_count ?? (lane.queued_carts?.length || 0)} carts</strong></span>
                        </span>
                        {lane.cashier_speed_seconds_per_item && (
                          <span className="text-[11px] text-[#7B8BA0]">
                            Speed: {lane.cashier_speed_seconds_per_item}s/item
                          </span>
                        )}
                      </div>

                      {/* Ineligibility Reason or Manual Override */}
                      {laneEval && !laneEval.isEligible && (
                        <span className="text-[11px] text-[#DC2626] font-medium">
                          {laneEval.ineligibilityReason}
                        </span>
                      )}

                      {/* Manual Assignment Option for eligible lanes */}
                      {activeSession?.status === 'SHOPPING' && isEligible && !isRecommended && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleAssignToLane(lane.id)}
                          disabled={isAssigning}
                        >
                          Assign Here
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      </div>

      {/* Live Camera Scanner Modal */}
      <QrCameraScanner
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onScanSuccess={(detectedCode) => {
          setCartSearchInput(detectedCode);
          fetchCart(detectedCode);
        }}
      />
    </div>
  );
};
