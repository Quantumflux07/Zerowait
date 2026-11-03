import { NextResponse } from 'next/server';
import { getCashierLanes } from '@/lib/services/cashierService';
import { LaneWorkloadResponse } from '@/types/api';

export async function GET() {
  try {
    const { lanes, error } = await getCashierLanes();

    if (error) {
      return NextResponse.json<LaneWorkloadResponse>(
        {
          success: false,
          error: {
            code: 'DATABASE_ERROR',
            message: error,
          },
        },
        { status: 500 }
      );
    }

    const formattedLanes = lanes.map((l) => ({
      ...l,
      queue_count: l.current_queue_count || 0,
      estimated_wait_seconds: l.estimated_wait_seconds || 0,
      serving_token: null,
    }));

    return NextResponse.json<LaneWorkloadResponse>({
      success: true,
      data: {
        lanes: formattedLanes,
        total_active_lanes: lanes.filter((l) => l.status === 'OPEN').length,
        total_waiting_customers: lanes.reduce((sum, l) => sum + (l.current_queue_count || 0), 0),
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

