import { NextRequest, NextResponse } from 'next/server';
import { queueAssignmentSchema } from '@/lib/validations/queue';
import { assignCartToLane } from '@/lib/services/queueService';
import { QueueAssignmentResponse } from '@/types/api';

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

    const result = await assignCartToLane(session_id, preferred_type, target_lane_id);

    if (!result.success || !result.assignment || !result.estimate) {
      const statusCode =
        result.error?.code === 'EMPTY_CART'
          ? 422
          : result.error?.code === 'NO_OPEN_LANES'
          ? 503
          : result.error?.code === 'SUPABASE_NOT_CONFIGURED'
          ? 503
          : 400;

      return NextResponse.json<QueueAssignmentResponse>(
        {
          success: false,
          error: {
            code: result.error?.code || 'ALLOCATION_FAILED',
            message: result.error?.message || 'Unable to allocate checkout lane.',
          },
        },
        { status: statusCode }
      );
    }

    return NextResponse.json<QueueAssignmentResponse>({
      success: true,
      data: {
        assignment: result.assignment,
        estimate: result.estimate,
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
