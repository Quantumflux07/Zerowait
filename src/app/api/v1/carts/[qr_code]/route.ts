import { NextRequest, NextResponse } from 'next/server';
import { cartRetrievalSchema } from '@/lib/validations/cart';
import { getCartAndActiveSession } from '@/lib/services/cartService';
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

    const { cart, active_session, error, configMissing } = await getCartAndActiveSession(
      validation.data.qr_code
    );

    if (configMissing) {
      return NextResponse.json<CartRetrievalResponse>(
        {
          success: false,
          error: {
            code: 'SUPABASE_NOT_CONFIGURED',
            message: error || 'Database is not configured.',
          },
        },
        { status: 503 }
      );
    }

    if (error) {
      return NextResponse.json<CartRetrievalResponse>(
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

    if (!cart) {
      return NextResponse.json<CartRetrievalResponse>(
        {
          success: false,
          error: {
            code: 'CART_NOT_FOUND',
            message: `Physical cart with QR code '${validation.data.qr_code}' does not exist or is inactive in Supabase. Provision it via the provisioning tool.`,
          },
        },
        { status: 404 }
      );
    }

    return NextResponse.json<CartRetrievalResponse>({
      success: true,
      data: {
        cart,
        active_session,
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
