import { NextRequest, NextResponse } from 'next/server';
import { cashierCartQuerySchema } from '@/lib/validations/cashier';
import { validateAndFetchCashierCart } from '@/lib/services/cashierService';
import { CashierCartValidationResponse } from '@/types/api';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ qr_code: string }> }
) {
  try {
    const params = await context.params;
    const { searchParams } = new URL(request.url);
    const laneId = searchParams.get('lane_id') || undefined;

    const validation = cashierCartQuerySchema.safeParse({
      qr_code: params.qr_code,
      lane_id: laneId,
    });

    if (!validation.success) {
      return NextResponse.json<CashierCartValidationResponse>(
        {
          success: false,
          error: {
            code: 'INVALID_QUERY',
            message: 'Cart QR code identifier is invalid or missing.',
            details: validation.error.format(),
          },
        },
        { status: 400 }
      );
    }

    const { qr_code, lane_id } = validation.data;
    const result = await validateAndFetchCashierCart(qr_code, lane_id);

    if (result.configMissing) {
      return NextResponse.json<CashierCartValidationResponse>(
        {
          success: false,
          error: {
            code: 'SUPABASE_NOT_CONFIGURED',
            message: result.error?.message || 'Database connection is not configured.',
          },
        },
        { status: 503 }
      );
    }

    if (!result.success || !result.data) {
      const code = result.error?.code || 'VALIDATION_FAILED';
      const statusCode =
        code === 'CART_NOT_FOUND' || code === 'NO_ACTIVE_SESSION'
          ? 404
          : code === 'CART_NOT_IN_QUEUE' || code === 'CART_ALREADY_PAID' || code === 'CART_SESSION_CLOSED' || code === 'EMPTY_CART'
          ? 422
          : 400;

      return NextResponse.json<CashierCartValidationResponse>(
        {
          success: false,
          error: {
            code,
            message: result.error?.message || 'Cart validation failed.',
          },
        },
        { status: statusCode }
      );
    }

    return NextResponse.json<CashierCartValidationResponse>({
      success: true,
      data: result.data,
      meta: {
        timestamp: new Date().toISOString(),
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json<CashierCartValidationResponse>(
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

