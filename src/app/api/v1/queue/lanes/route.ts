import { NextRequest, NextResponse } from 'next/server';
import { laneWorkloadSchema } from '@/lib/validations/queue';
import { queueStore } from '@/lib/services/queueStore';
import { LaneWorkloadResponse } from '@/types/api';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const store_id = searchParams.get('store_id') || undefined;

    const validation = laneWorkloadSchema.safeParse({ store_id });
    if (!validation.success) {
      return NextResponse.json<LaneWorkloadResponse>(
        {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid store parameters.',
            details: validation.error.format(),
          },
        },
        { status: 400 }
      );
    }

    const rawLanes = queueStore.getLanes();

    const lanesWithWorkload = rawLanes.map((l) => ({
      ...l,
      queue_count: l.current_queue_count ?? (l.queued_carts?.length || 0),
      estimated_wait_seconds: l.estimated_wait_seconds || 0,
      serving_token: l.serving_token || null,
    }));

    const totalActiveLanes = lanesWithWorkload.filter((l) => l.status === 'OPEN').length;
    const totalWaitingCustomers = lanesWithWorkload.reduce(
      (sum, l) => sum + l.queue_count,
      0
    );

    return NextResponse.json<LaneWorkloadResponse>({
      success: true,
      data: {
        lanes: lanesWithWorkload,
        total_active_lanes: totalActiveLanes,
        total_waiting_customers: totalWaitingCustomers,
      },
      meta: {
        timestamp: new Date().toISOString(),
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json<LaneWorkloadResponse>(
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
