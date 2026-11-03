import { NextRequest, NextResponse } from 'next/server';
import { cashierCheckinSchema } from '@/lib/validations/cashier';
import { checkinCashierCart } from '@/lib/services/cashierService';
import { CashierCheckinResponse } from '@/types/api';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validation = cashierCheckinSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json<CashierCheckinResponse>(
        {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid checkin parameters.',
            details: validation.error.format(),
          },
        },
        { status: 400 }
      );
    }

    const { session_id, lane_id } = validation.data;
    const result = await checkinCashierCart(session_id, lane_id);

    if (!result.success) {
      return NextResponse.json<CashierCheckinResponse>(
        {
          success: false,
          error: {
            code: 'CHECKIN_FAILED',
            message: result.error || 'Failed to check in cart session.',
          },
        },
        { status: 422 }
      );
    }

    return NextResponse.json<CashierCheckinResponse>({
      success: true,
      data: {
        session_id,
        status: 'AT_CHECKOUT',
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json<CashierCheckinResponse>(
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

