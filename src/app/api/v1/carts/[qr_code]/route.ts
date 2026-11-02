import { NextRequest, NextResponse } from 'next/server';
import { cartRetrievalSchema } from '@/lib/validations/cart';
import { MOCK_CARTS, MOCK_ACTIVE_SESSION } from '@/lib/services/mockData';
import { CartRetrievalResponse } from '@/types/api';

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ qr_code: string }> }
) {
  try {
    const params = await context.params;
    const validation = cartRetrievalSchema.safeParse(params);

    if (!validation.success) {
      return NextResponse.json<CartRetrievalResponse>(
        {
          success: false,
          error: {
            code: 'INVALID_QR_CODE',
            message: 'Cart QR code identifier is malformed.',
            details: validation.error.format(),
          },
        },
        { status: 400 }
      );
    }

    const cart = MOCK_CARTS.find(
      (c) => c.qr_code.toUpperCase() === validation.data.qr_code.toUpperCase() && c.is_active
    );

    if (!cart) {
      return NextResponse.json<CartRetrievalResponse>(
        {
          success: false,
          error: {
            code: 'CART_NOT_FOUND',
            message: `Physical cart with QR code '${validation.data.qr_code}' does not exist or is inactive.`,
          },
        },
        { status: 404 }
      );
    }

    // Return cart metadata along with active session if any
    const activeSession =
      MOCK_ACTIVE_SESSION.cart_id === cart.id && MOCK_ACTIVE_SESSION.status === 'SHOPPING'
        ? MOCK_ACTIVE_SESSION
        : null;

    return NextResponse.json<CartRetrievalResponse>({
      success: true,
      data: {
        cart,
        active_session: activeSession,
      },
      meta: {
        timestamp: new Date().toISOString(),
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json<CartRetrievalResponse>(
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
