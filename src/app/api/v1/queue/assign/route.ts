import { NextRequest, NextResponse } from 'next/server';
import { queueAssignmentSchema } from '@/lib/validations/queue';
import { MOCK_ACTIVE_SESSION, MOCK_LANES } from '@/lib/services/mockData';
import { QueueAssignmentResponse } from '@/types/api';
import { LaneAssignment, CheckoutEstimate } from '@/types/domain';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validation = queueAssignmentSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json<QueueAssignmentResponse>(
        {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid queue allocation request.',
            details: validation.error.format(),
          },
        },
        { status: 400 }
      );
    }

    const { session_id, preferred_type } = validation.data;

    // Check if session has items
    if (MOCK_ACTIVE_SESSION.total_items === 0) {
      return NextResponse.json<QueueAssignmentResponse>(
        {
          success: false,
          error: {
            code: 'EMPTY_CART',
            message: 'Cannot queue an empty shopping cart. Please add items first.',
          },
        },
        { status: 422 }
      );
    }

    // Filter candidate open lanes
    let eligibleLanes = MOCK_LANES.filter((l) => l.status === 'OPEN');
    if (eligibleLanes.length === 0) {
      return NextResponse.json<QueueAssignmentResponse>(
        {
          success: false,
          error: {
            code: 'NO_OPEN_LANES',
            message: 'All checkout counters are currently closed or paused. Please alert store supervisor.',
          },
        },
        { status: 503 }
      );
    }

    // If customer has > 10 items, exclude express lanes with max limit
    if (MOCK_ACTIVE_SESSION.total_items > 10) {
      eligibleLanes = eligibleLanes.filter(
        (l) => l.max_items_limit === null || l.max_items_limit >= MOCK_ACTIVE_SESSION.total_items
      );
    }

    // Match preferred type if available
    if (preferred_type) {
      const preferredCandidates = eligibleLanes.filter((l) => l.type === preferred_type);
      if (preferredCandidates.length > 0) {
        eligibleLanes = preferredCandidates;
      }
    }

    // Sort by lowest queue workload: min(estimated_wait_seconds, queue_count)
    eligibleLanes.sort(
      (a, b) =>
        (a.estimated_wait_seconds || 0) +
        (a.current_queue_count || 0) * 30 -
        ((b.estimated_wait_seconds || 0) + (b.current_queue_count || 0) * 30)
    );

    const targetLane = eligibleLanes[0];
    const queueDepth = (targetLane.current_queue_count || 0) + 1;
    // Calculate estimated wait: base scanning time ~4 sec per item + 30 sec payment handoff
    const estimatedWait = (targetLane.estimated_wait_seconds || 0) + Math.max(45, MOCK_ACTIVE_SESSION.total_items * 4);

    const tokenPrefix = targetLane.type === 'EXPRESS' ? 'E' : 'A';
    const randomSeq = Math.floor(100 + Math.random() * 900);
    const tokenNumber = `${tokenPrefix}-${randomSeq}`;

    const assignment: LaneAssignment = {
      id: `la_${Date.now()}`,
      lane_id: targetLane.id,
      session_id,
      token_number: tokenNumber,
      queue_position: queueDepth,
      estimated_wait_seconds: estimatedWait,
      assignment_status: 'QUEUED',
      called_at: null,
      served_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      lane: targetLane,
    };

    const estimate: CheckoutEstimate = {
      estimated_wait_seconds: estimatedWait,
      queue_depth: queueDepth,
      recommended_lane_id: targetLane.id,
      lane_name: targetLane.name,
      lane_type: targetLane.type,
      token_number: tokenNumber,
    };

    // Transition session status to ASSIGNED_LOCKED
    MOCK_ACTIVE_SESSION.status = 'ASSIGNED_LOCKED';
    MOCK_ACTIVE_SESSION.assigned_lane_id = targetLane.id;
    MOCK_ACTIVE_SESSION.locked_at = new Date().toISOString();

    return NextResponse.json<QueueAssignmentResponse>({
      success: true,
      data: {
        assignment,
        estimate,
        session_status: 'ASSIGNED_LOCKED',
      },
      meta: {
        timestamp: new Date().toISOString(),
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json<QueueAssignmentResponse>(
      {
        success: false,
        error: {
          code: 'SERVER_ERROR',
          message,
        },
      },
      { status: 500 }
    );
  }
}
