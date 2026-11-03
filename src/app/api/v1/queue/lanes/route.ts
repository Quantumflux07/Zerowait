import { NextRequest, NextResponse } from 'next/server';
import { laneWorkloadSchema } from '@/lib/validations/queue';
import { getLanesWithWorkload } from '@/lib/services/queueService';
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

    const result = await getLanesWithWorkload(validation.data.store_id);

    if (result.configMissing) {
      return NextResponse.json<LaneWorkloadResponse>(
        {
          success: false,
          error: {
            code: 'SUPABASE_NOT_CONFIGURED',
            message: result.error || 'Database is not configured.',
          },
        },
        { status: 503 }
      );
    }

    if (result.error) {
      return NextResponse.json<LaneWorkloadResponse>(
        {
          success: false,
          error: {
            code: 'DATABASE_ERROR',
            message: result.error,
          },
        },
        { status: 500 }
      );
    }

    return NextResponse.json<LaneWorkloadResponse>({
      success: true,
      data: {
        lanes: result.lanes.map((l) => ({
          ...l,
          queue_count: l.current_queue_count ?? (l.queued_carts?.length || 0),
          estimated_wait_seconds: l.estimated_wait_seconds || 0,
          serving_token: l.serving_token || null,
        })),
        total_active_lanes: result.total_active_lanes,
        total_waiting_customers: result.total_waiting_customers,
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
