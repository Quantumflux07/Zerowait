import { NextRequest, NextResponse } from 'next/server';
import { queueAssignmentSchema } from '@/lib/validations/queue';
import { queueStore } from '@/lib/services/queueStore';
import { broadcastAssignmentRealtime } from '@/lib/services/realtime';
import { QueueAssignmentResponse } from '@/types/api';
import { CheckoutEstimate } from '@/types/domain';

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

    const { session_id, preferred_type, target_lane_id } = validation.data;

    const assignmentResult = queueStore.assignCartToLane(session_id, preferred_type, target_lane_id);

    if (!assignmentResult.success || !assignmentResult.assignment || !assignmentResult.estimate) {
      const statusCode =
        assignmentResult.error?.code === 'EMPTY_CART'
          ? 422
          : assignmentResult.error?.code === 'NO_OPEN_LANES'
          ? 503
          : 400;

      return NextResponse.json<QueueAssignmentResponse>(
        {
          success: false,
          error: {
            code: assignmentResult.error?.code || 'ALLOCATION_FAILED',
            message: assignmentResult.error?.message || 'Unable to allocate checkout lane.',
          },
        },
        { status: statusCode }
      );
    }

    const lane = assignmentResult.assignment.lane;
    const estimate: CheckoutEstimate = {
      estimated_wait_seconds: assignmentResult.assignment.estimated_wait_seconds,
      queue_depth: assignmentResult.assignment.queue_position,
      recommended_lane_id: assignmentResult.assignment.lane_id,
      lane_name: lane?.name || assignmentResult.estimate.laneName,
      lane_type: lane?.type || assignmentResult.estimate.laneType,
      token_number: assignmentResult.assignment.token_number,
    };

    // Broadcast confirmed assignment to Supabase Realtime
    await broadcastAssignmentRealtime({
      event: 'ASSIGNMENT_CONFIRMED',
      sessionId: session_id,
      cartId: assignmentResult.assignment.session?.cart_id || '',
      laneId: assignmentResult.assignment.lane_id,
      laneName: estimate.lane_name,
      tokenNumber: assignmentResult.assignment.token_number,
      queuePosition: assignmentResult.assignment.queue_position,
      estimatedWaitSeconds: assignmentResult.assignment.estimated_wait_seconds,
      timestamp: new Date().toISOString(),
    });

    return NextResponse.json<QueueAssignmentResponse>({
      success: true,
      data: {
        assignment: assignmentResult.assignment,
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
