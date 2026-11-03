/**
 * ZeroWait Queue Engine & Workload Prediction Algorithm
 * 
 * Rules & Formulas:
 * 1. Workload(Lane) = BaseWorkload(Lane) + Sum_{c in Queue} (Items(c) * t_scan + t_payment)
 * 2. Incoming Cart Service Time = Items(incoming) * t_scan + t_payment
 * 3. Predicted Completion Time = Current Lane Workload + Incoming Cart Service Time
 * 4. NEVER select a lane purely because it has fewer customers; customer item count dominates wait time.
 * 5. Exclude CLOSED and PAUSED lanes.
 * 6. Enforce Express Lane limits: baskets with items > max_items_limit are strictly excluded.
 */

import type { Lane, LaneType } from '../../types/domain.ts';

export const DEFAULT_SCAN_SPEED_SECONDS = 4; // Average cashier scanning speed per item
export const DEFAULT_PAYMENT_HANDOFF_SECONDS = 35; // Payment and packing duration per customer

export interface QueuedCartDetails {
  sessionId: string;
  itemCount: number;
  tokenNumber?: string;
}

export interface LaneWithQueueDetails extends Lane {
  queued_carts?: QueuedCartDetails[];
  cashier_speed_seconds_per_item?: number; // Optional cashier-specific scanning speed
  payment_handoff_seconds?: number;
  serving_token?: string | null;
}

export interface LanePredictionResult {
  lane: LaneWithQueueDetails;
  isEligible: boolean;
  ineligibilityReason?: string;
  currentWorkloadSeconds: number;
  incomingServiceTimeSeconds: number;
  predictedCompletionSeconds: number;
  queueDepth: number;
}

export interface OptimalLaneSelection {
  recommendedLane: LaneWithQueueDetails | null;
  estimate: {
    estimatedWaitSeconds: number;
    predictedCompletionSeconds: number;
    queueDepth: number;
    recommendedLaneId: string;
    laneName: string;
    laneType: LaneType;
  } | null;
  allEvaluations: LanePredictionResult[];
  error?: string;
}

/**
 * Calculates service time for a cart based on item count and cashier scan rate.
 */
export function calculateCartServiceTime(
  itemCount: number,
  scanSpeedSeconds: number = DEFAULT_SCAN_SPEED_SECONDS,
  paymentHandoffSeconds: number = DEFAULT_PAYMENT_HANDOFF_SECONDS
): number {
  if (itemCount < 0) return 0;
  return itemCount * scanSpeedSeconds + paymentHandoffSeconds;
}

/**
 * Calculates current workload (in seconds) for a checkout lane based on its queued carts and active service.
 */
export function calculateLaneWorkload(
  lane: LaneWithQueueDetails,
  defaultScanSpeed: number = DEFAULT_SCAN_SPEED_SECONDS,
  defaultPaymentHandoff: number = DEFAULT_PAYMENT_HANDOFF_SECONDS
): number {
  const scanSpeed = lane.cashier_speed_seconds_per_item ?? defaultScanSpeed;
  const paymentHandoff = lane.payment_handoff_seconds ?? defaultPaymentHandoff;

  // If detailed queued carts are provided, calculate exact item-based workload
  if (lane.queued_carts && lane.queued_carts.length > 0) {
    return lane.queued_carts.reduce((acc, cart) => {
      return acc + calculateCartServiceTime(cart.itemCount, scanSpeed, paymentHandoff);
    }, 0);
  }

  // Fallback to existing estimated_wait_seconds or queue_count approximation
  if (typeof lane.estimated_wait_seconds === 'number' && lane.estimated_wait_seconds > 0) {
    return lane.estimated_wait_seconds;
  }

  const queueCount = lane.current_queue_count ?? 0;
  // Assume average basket of 8 items if individual cart details are omitted
  return queueCount * (8 * scanSpeed + paymentHandoff);
}

/**
 * Evaluates all lanes and determines the optimal checkout lane for an incoming cart.
 */
export function evaluateLanesForCart(
  lanes: LaneWithQueueDetails[],
  incomingItemCount: number,
  preferredType?: LaneType
): OptimalLaneSelection {
  if (incomingItemCount <= 0) {
    return {
      recommendedLane: null,
      estimate: null,
      allEvaluations: [],
      error: 'Cannot allocate queue for an empty cart.',
    };
  }

  const evaluations: LanePredictionResult[] = lanes.map((lane) => {
    const scanSpeed = lane.cashier_speed_seconds_per_item ?? DEFAULT_SCAN_SPEED_SECONDS;
    const paymentHandoff = lane.payment_handoff_seconds ?? DEFAULT_PAYMENT_HANDOFF_SECONDS;

    // Check status
    if (lane.status !== 'OPEN') {
      return {
        lane,
        isEligible: false,
        ineligibilityReason: `Lane is currently ${lane.status.toLowerCase()}`,
        currentWorkloadSeconds: 0,
        incomingServiceTimeSeconds: 0,
        predictedCompletionSeconds: Infinity,
        queueDepth: lane.current_queue_count ?? (lane.queued_carts?.length || 0),
      };
    }

    // Check express max items limit
    if (lane.max_items_limit !== null && incomingItemCount > lane.max_items_limit) {
      return {
        lane,
        isEligible: false,
        ineligibilityReason: `Basket size (${incomingItemCount} items) exceeds express limit (${lane.max_items_limit} items)`,
        currentWorkloadSeconds: calculateLaneWorkload(lane, scanSpeed, paymentHandoff),
        incomingServiceTimeSeconds: 0,
        predictedCompletionSeconds: Infinity,
        queueDepth: lane.current_queue_count ?? (lane.queued_carts?.length || 0),
      };
    }

    const currentWorkload = calculateLaneWorkload(lane, scanSpeed, paymentHandoff);
    const incomingServiceTime = calculateCartServiceTime(incomingItemCount, scanSpeed, paymentHandoff);
    const predictedCompletion = currentWorkload + incomingServiceTime;
    const queueDepth = lane.queued_carts ? lane.queued_carts.length : (lane.current_queue_count ?? 0);

    return {
      lane,
      isEligible: true,
      currentWorkloadSeconds: currentWorkload,
      incomingServiceTimeSeconds: incomingServiceTime,
      predictedCompletionSeconds: predictedCompletion,
      queueDepth,
    };
  });

  const eligibleEvaluations = evaluations.filter((e) => e.isEligible);

  if (eligibleEvaluations.length === 0) {
    return {
      recommendedLane: null,
      estimate: null,
      allEvaluations: evaluations,
      error: 'No open checkout lanes available for this cart size.',
    };
  }

  // If a preferred lane type is requested and available among eligible, prioritize candidates of that type
  let candidates = eligibleEvaluations;
  if (preferredType) {
    const preferredCandidates = eligibleEvaluations.filter((e) => e.lane.type === preferredType);
    if (preferredCandidates.length > 0) {
      candidates = preferredCandidates;
    }
  }

  // Sort by lowest predicted completion time!
  // CRITICAL: NEVER sort by queueDepth/customer count alone.
  candidates.sort((a, b) => {
    if (a.predictedCompletionSeconds !== b.predictedCompletionSeconds) {
      return a.predictedCompletionSeconds - b.predictedCompletionSeconds;
    }
    // Secondary tie-breaker: lower queue depth
    if (a.queueDepth !== b.queueDepth) {
      return a.queueDepth - b.queueDepth;
    }
    // Express priority if item count <= 10
    if (incomingItemCount <= 10 && a.lane.type === 'EXPRESS' && b.lane.type !== 'EXPRESS') {
      return -1;
    }
    return 0;
  });

  const best = candidates[0];

  return {
    recommendedLane: best.lane,
    estimate: {
      estimatedWaitSeconds: best.currentWorkloadSeconds,
      predictedCompletionSeconds: best.predictedCompletionSeconds,
      queueDepth: best.queueDepth + 1,
      recommendedLaneId: best.lane.id,
      laneName: best.lane.name,
      laneType: best.lane.type,
    },
    allEvaluations: evaluations,
  };
}

/**
 * Generates next sequential token string for a lane (e.g. "E-104" or "A-201").
 */
export function generateTokenNumber(laneType: LaneType, sequenceNumber?: number): string {
  const prefix = laneType === 'EXPRESS' ? 'E' : laneType === 'SELF_CHECKOUT' ? 'S' : 'A';
  const seq = sequenceNumber ?? Math.floor(100 + Math.random() * 900);
  return `${prefix}-${seq}`;
}
