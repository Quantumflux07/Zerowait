import { NextRequest, NextResponse } from 'next/server';
import { cashierReleaseSchema } from '@/lib/validations/cashier';
import { releaseCashierCartSession } from '@/lib/services/cashierService';
import { CashierReleaseResponse } from '@/types/api';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validation = cashierReleaseSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json<CashierReleaseResponse>(
        {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid release payload.',
            details: validation.error.format(),
          },
        },
        { status: 400 }
      );
    }

    const { session_id } = validation.data;
    const result = await releaseCashierCartSession(session_id);

    if (!result.success || !result.cart_id) {
      return NextResponse.json<CashierReleaseResponse>(
        {
          success: false,
          error: {
            code: result.error?.code || 'RELEASE_FAILED',
            message: result.error?.message || 'Failed to release cart session.',
          },
        },
        { status: 422 }
      );
    }

    return NextResponse.json<CashierReleaseResponse>({
      success: true,
      data: {
        session_id,
        cart_id: result.cart_id,
        status: 'CLOSED',
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json<CashierReleaseResponse>(
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

