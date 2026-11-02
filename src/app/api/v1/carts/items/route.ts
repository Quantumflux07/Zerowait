import { NextRequest, NextResponse } from 'next/server';
import { updateCartItemSchema } from '@/lib/validations/cart';
import { updateCartItemQuantity } from '@/lib/services/cartService';
import { UpdateCartItemResponse } from '@/types/api';

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const validation = updateCartItemSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json<UpdateCartItemResponse>(
        {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid item update payload.',
            details: validation.error.format(),
          },
        },
        { status: 400 }
      );
    }

    const { session_id, item_id, quantity } = validation.data;

    const result = await updateCartItemQuantity(session_id, item_id, quantity);

    if (!result.success || !result.session) {
      const statusCode =
        result.error?.code === 'SESSION_NOT_FOUND'
          ? 404
          : result.error?.code === 'ITEM_NOT_FOUND'
          ? 404
          : result.error?.code === 'SESSION_LOCKED'
          ? 409
          : result.error?.code === 'SUPABASE_NOT_CONFIGURED'
          ? 503
          : 500;

      return NextResponse.json<UpdateCartItemResponse>(
        {
          success: false,
          error: {
            code: result.error?.code || 'UPDATE_FAILED',
            message: result.error?.message || 'Failed to update item quantity.',
          },
        },
        { status: statusCode }
      );
    }

    return NextResponse.json<UpdateCartItemResponse>({
      success: true,
      data: {
        session: result.session,
        updated_item: result.updated_item ?? null,
      },
      meta: {
        timestamp: new Date().toISOString(),
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json<UpdateCartItemResponse>(
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
