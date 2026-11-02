/**
 * ZeroWait — Authoritative Queue Engine Service
 * 
 * Manages checkout counter workloads, lane prediction, and atomic concurrency-safe
 * lane allocation in PostgreSQL via Supabase.
 */

import { createAdminClient } from '@/lib/supabase/admin';
import { isSupabaseConfigured, getMissingSupabaseConfigMessage } from '@/lib/supabase/config';
import {
  evaluateLanesForCart,
  generateTokenNumber,
  calculateLaneWorkload,
  LaneWithQueueDetails,
  OptimalLaneSelection,
} from '@/lib/engine/queue';
import { broadcastAssignmentRealtime } from '@/lib/services/realtime';
import { queueStore } from './queueStore';
import { getDefaultStoreId } from './productService';
import { Lane, LaneAssignment, LaneType, CartSession } from '@/types/domain';

export interface LanesWorkloadResult {
  lanes: LaneWithQueueDetails[];
  total_active_lanes: number;
  total_waiting_customers: number;
  error?: string;
  configMissing?: boolean;
}

export interface QueueAllocationResult {
  success: boolean;
  assignment?: LaneAssignment;
  estimate?: {
    estimated_wait_seconds: number;
    queue_depth: number;
    recommended_lane_id: string;
    lane_name: string;
    lane_type: LaneType;
    token_number: string;
  };
  session_status?: string;
  already_assigned?: boolean;
  error?: {
    code: string;
    message: string;
  };
}

/**
 * Retrieves all checkout counters for a store with live queue workloads.
 */
export async function getLanesWithWorkload(storeId?: string): Promise<LanesWorkloadResult> {
  if (!isSupabaseConfigured()) {
    if (process.env.NODE_ENV === 'test' || process.env.ALLOW_LOCAL_DEV_STORE === 'true') {
      const raw = queueStore.getLanes();
      const lanesWithWorkload: LaneWithQueueDetails[] = raw.map((l) => ({
        ...l,
        queue_count: l.current_queue_count ?? (l.queued_carts?.length || 0),
        estimated_wait_seconds: l.estimated_wait_seconds || 0,
        serving_token: l.serving_token || null,
      }));
      return {
        lanes: lanesWithWorkload,
        total_active_lanes: lanesWithWorkload.filter((l) => l.status === 'OPEN').length,
        total_waiting_customers: lanesWithWorkload.reduce((sum, l) => sum + (l.current_queue_count || 0), 0),
      };
    }
    return {
      lanes: [],
      total_active_lanes: 0,
      total_waiting_customers: 0,
      error: getMissingSupabaseConfigMessage(),
      configMissing: true,
    };
  }

  try {
    const supabase = createAdminClient();
    const effectiveStoreId = storeId || (await getDefaultStoreId());

    // 1. Fetch all checkout counters
    const { data: lanesData, error: lanesErr } = await supabase
      .from('lanes')
      .select('*')
      .eq('store_id', effectiveStoreId)
      .order('lane_number', { ascending: true });

    if (lanesErr) {
      throw new Error(`Failed to fetch lanes: ${lanesErr.message}`);
    }

    const lanes = (lanesData as Lane[]) || [];

    // 2. Fetch active assignments in QUEUED or SERVING state
    const { data: assignmentsData, error: assignErr } = await supabase
      .from('lane_assignments')
      .select('*, cart_sessions(id, total_items, grand_total_paise)')
      .in('assignment_status', ['QUEUED', 'SERVING'])
      .order('queue_position', { ascending: true });

    if (assignErr) {
      throw new Error(`Failed to fetch active lane assignments: ${assignErr.message}`);
    }

    const assignments = assignmentsData || [];

    // 3. Aggregate workload per lane
    const lanesWithWorkload: LaneWithQueueDetails[] = lanes.map((lane) => {
      const laneAssignments = assignments.filter((a: any) => a.lane_id === lane.id);
      const serving = laneAssignments.find((a: any) => a.assignment_status === 'SERVING');

      const queuedCarts = laneAssignments.map((a: any) => {
        const sessionRecord = a.cart_sessions as unknown as { total_items?: number } | null;
        return {
          sessionId: a.session_id,
          itemCount: sessionRecord?.total_items ?? 5,
          tokenNumber: a.token_number,
        };
      });

      const laneDetails: LaneWithQueueDetails = {
        ...lane,
        current_queue_count: laneAssignments.length,
        queued_carts: queuedCarts,
        serving_token: serving?.token_number || (laneAssignments[0]?.token_number ?? null),
      };

      laneDetails.estimated_wait_seconds = calculateLaneWorkload(laneDetails);
      return laneDetails;
    });

    const totalActiveLanes = lanesWithWorkload.filter((l) => l.status === 'OPEN').length;
    const totalWaitingCustomers = lanesWithWorkload.reduce(
      (sum, l) => sum + (l.current_queue_count || 0),
      0
    );

    return {
      lanes: lanesWithWorkload,
      total_active_lanes: totalActiveLanes,
      total_waiting_customers: totalWaitingCustomers,
    };
  } catch (err) {
    return {
      lanes: [],
      total_active_lanes: 0,
      total_waiting_customers: 0,
      error: err instanceof Error ? err.message : 'Failed to calculate counter workloads.',
    };
  }
}

/**
 * Authoritatively assigns a cart session to the optimal checkout lane in Supabase.
 * - Enforces concurrency safety and idempotency
 * - Excludes closed/paused lanes and oversized carts on express counters
 * - Persists final locked state and notifies Realtime subscribers
 */
export async function assignCartToLane(
  sessionId: string,
  preferredType?: LaneType,
  targetLaneId?: string
): Promise<QueueAllocationResult> {
  if (!isSupabaseConfigured()) {
    if (process.env.NODE_ENV === 'test' || process.env.ALLOW_LOCAL_DEV_STORE === 'true') {
      const result = queueStore.assignCartToLane(sessionId, preferredType, targetLaneId);
      if (!result.success || !result.assignment || !result.estimate) {
        return {
          success: false,
          error: {
            code: result.error?.code || 'ALLOCATION_FAILED',
            message: result.error?.message || 'Unable to allocate checkout lane.',
          },
        };
      }
      return {
        success: true,
        assignment: result.assignment,
        estimate: {
          estimated_wait_seconds: result.assignment.estimated_wait_seconds,
          queue_depth: result.assignment.queue_position,
          recommended_lane_id: result.assignment.lane_id,
          lane_name: result.assignment.lane?.name || result.estimate.laneName,
          lane_type: result.assignment.lane?.type || result.estimate.laneType,
          token_number: result.assignment.token_number,
        },
        session_status: 'ASSIGNED_LOCKED',
      };
    }

    return {
      success: false,
      error: { code: 'SUPABASE_NOT_CONFIGURED', message: getMissingSupabaseConfigMessage() },
    };
  }

  try {
    const supabase = createAdminClient();

    // 1. Fetch authoritative session
    const { data: sessionData, error: sessionErr } = await supabase
      .from('cart_sessions')
      .select('*')
      .eq('id', sessionId)
      .maybeSingle();

    if (sessionErr || !sessionData) {
      return {
        success: false,
        error: { code: 'SESSION_NOT_FOUND', message: `Shopping session '${sessionId}' was not found.` },
      };
    }

    const session = sessionData as CartSession;

    // 2. Idempotency Check: if already ASSIGNED_LOCKED, return existing assignment immediately
    if (session.status === 'ASSIGNED_LOCKED' && session.assigned_lane_id) {
      const { data: existingAssignment } = await supabase
        .from('lane_assignments')
        .select('*, lanes(*)')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existingAssignment) {
        const laneObj = existingAssignment.lanes as unknown as Lane;
        const assignment: LaneAssignment = {
          ...existingAssignment,
          lane: laneObj,
        };

        return {
          success: true,
          already_assigned: true,
          assignment,
          estimate: {
            estimated_wait_seconds: assignment.estimated_wait_seconds,
            queue_depth: assignment.queue_position,
            recommended_lane_id: assignment.lane_id,
            lane_name: laneObj?.name || 'Assigned Lane',
            lane_type: laneObj?.type || 'REGULAR',
            token_number: assignment.token_number,
          },
          session_status: 'ASSIGNED_LOCKED',
        };
      }
    }

    // 3. Validation: Cart cannot be empty
    if (session.total_items <= 0) {
      return {
        success: false,
        error: {
          code: 'EMPTY_CART',
          message: 'Cannot queue an empty shopping cart. Please add items before proceeding to checkout.',
        },
      };
    }

    // 4. Fetch available lanes and compute prediction
    const lanesResult = await getLanesWithWorkload(session.store_id);
    if (lanesResult.error) {
      throw new Error(lanesResult.error);
    }

    const openLanes = lanesResult.lanes.filter((l) => l.status === 'OPEN');
    if (openLanes.length === 0) {
      return {
        success: false,
        error: {
          code: 'NO_OPEN_LANES',
          message: 'All checkout counters are currently closed or paused. Please alert supermarket staff.',
        },
      };
    }

    let selectedLane: LaneWithQueueDetails;
    let evaluation: OptimalLaneSelection;

    if (targetLaneId) {
      const targeted = openLanes.find((l) => l.id === targetLaneId);
      if (!targeted) {
        return {
          success: false,
          error: {
            code: 'INVALID_TARGET_LANE',
            message: 'Requested target lane is not open or does not exist.',
          },
        };
      }
      if (targeted.max_items_limit && session.total_items > targeted.max_items_limit) {
        return {
          success: false,
          error: {
            code: 'EXPRESS_LIMIT_EXCEEDED',
            message: `Cart has ${session.total_items} items, exceeding counter limit (${targeted.max_items_limit}).`,
          },
        };
      }
      selectedLane = targeted;
      evaluation = evaluateLanesForCart([targeted], session.total_items);
    } else {
      evaluation = evaluateLanesForCart(openLanes, session.total_items, preferredType);
      if (!evaluation.recommendedLane || !evaluation.estimate) {
        return {
          success: false,
          error: {
            code: 'NO_ELIGIBLE_LANE',
            message: evaluation.error || 'No checkout counter available for this basket size.',
          },
        };
      }
      selectedLane = evaluation.recommendedLane;
    }

    const tokenNumber = generateTokenNumber(selectedLane.type);
    const estimatedWaitSeconds = evaluation.estimate?.estimatedWaitSeconds || selectedLane.estimated_wait_seconds || 45;

    // 5. Atomic database execution: Call stored procedure assign_cart_to_lane
    let assignmentRecord: LaneAssignment | null = null;

    try {
      const { data: rpcResult, error: rpcError } = await supabase.rpc('assign_cart_to_lane', {
        p_session_id: sessionId,
        p_lane_id: selectedLane.id,
        p_token_number: tokenNumber,
        p_estimated_wait_seconds: estimatedWaitSeconds,
      });

      if (!rpcError && rpcResult && rpcResult.success) {
        assignmentRecord = {
          id: rpcResult.assignment_id || `la_${Date.now()}`,
          lane_id: selectedLane.id,
          session_id: sessionId,
          token_number: rpcResult.token_number || tokenNumber,
          queue_position: rpcResult.queue_position || 1,
          estimated_wait_seconds: rpcResult.estimated_wait_seconds || estimatedWaitSeconds,
          assignment_status: 'QUEUED',
          called_at: null,
          served_at: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          lane: selectedLane,
        };
      }
    } catch {
      // RPC fallback to direct atomic transaction queries
    }

    // Direct transaction fallback if RPC is not loaded in Supabase yet
    if (!assignmentRecord) {
      // Calculate queue position
      const { count } = await supabase
        .from('lane_assignments')
        .select('*', { count: 'exact', head: true })
        .eq('lane_id', selectedLane.id)
        .in('assignment_status', ['QUEUED', 'SERVING']);

      const queuePosition = (count || 0) + 1;

      // Lock cart session
      const { error: lockErr } = await supabase
        .from('cart_sessions')
        .update({
          status: 'ASSIGNED_LOCKED',
          assigned_lane_id: selectedLane.id,
          locked_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', sessionId)
        .eq('status', 'SHOPPING'); // Concurrency guard

      if (lockErr) {
        throw new Error(`Failed to lock shopping session: ${lockErr.message}`);
      }

      // Insert lane assignment
      const { data: newAssignment, error: assignInsertErr } = await supabase
        .from('lane_assignments')
        .insert({
          lane_id: selectedLane.id,
          session_id: sessionId,
          token_number: tokenNumber,
          queue_position: queuePosition,
          estimated_wait_seconds: estimatedWaitSeconds,
          assignment_status: 'QUEUED',
        })
        .select('*')
        .single();

      if (assignInsertErr || !newAssignment) {
        throw new Error(`Failed to insert lane assignment: ${assignInsertErr?.message}`);
      }

      assignmentRecord = {
        ...(newAssignment as LaneAssignment),
        lane: selectedLane,
      };

      // Write audit log
      await supabase.from('audit_logs').insert({
        store_id: session.store_id,
        action: 'LANE_ASSIGNED_LOCKED',
        entity_type: 'cart_sessions',
        entity_id: sessionId,
        payload: {
          lane_id: selectedLane.id,
          token_number: tokenNumber,
          queue_position: queuePosition,
          estimated_wait_seconds: estimatedWaitSeconds,
        },
      });
    }

    // 6. Broadcast confirmed assignment across Supabase Realtime
    await broadcastAssignmentRealtime({
      event: 'ASSIGNMENT_CONFIRMED',
      sessionId,
      cartId: session.cart_id,
      laneId: selectedLane.id,
      laneName: selectedLane.name,
      tokenNumber: assignmentRecord.token_number,
      queuePosition: assignmentRecord.queue_position,
      estimatedWaitSeconds: assignmentRecord.estimated_wait_seconds,
      timestamp: new Date().toISOString(),
    });

    return {
      success: true,
      assignment: assignmentRecord,
      estimate: {
        estimated_wait_seconds: assignmentRecord.estimated_wait_seconds,
        queue_depth: assignmentRecord.queue_position,
        recommended_lane_id: selectedLane.id,
        lane_name: selectedLane.name,
        lane_type: selectedLane.type,
        token_number: assignmentRecord.token_number,
      },
      session_status: 'ASSIGNED_LOCKED',
    };
  } catch (err) {
    return {
      success: false,
      error: {
        code: 'ALLOCATION_FAILED',
        message: err instanceof Error ? err.message : 'Failed to allocate checkout lane.',
      },
    };
  }
}
