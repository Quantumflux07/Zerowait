import { NextRequest, NextResponse } from 'next/server';
import { cartRetrievalSchema } from '@/lib/validations/cart';
import { queueStore } from '@/lib/services/queueStore';
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

    const cartResult = queueStore.getCartByQrCode(validation.data.qr_code);

    if (!cartResult || !cartResult.cart) {
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

    return NextResponse.json<CartRetrievalResponse>({
      success: true,
      data: {
        cart: cartResult.cart,
        active_session: cartResult.active_session,
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
