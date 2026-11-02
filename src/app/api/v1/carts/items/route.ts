import { NextRequest, NextResponse } from 'next/server';
import { updateCartItemSchema } from '@/lib/validations/cart';
import { queueStore } from '@/lib/services/queueStore';
import { calculateCartSummary } from '@/lib/engine/pricing';
import { UpdateCartItemResponse } from '@/types/api';
import { CartItem } from '@/types/domain';

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

    const sessionData = queueStore.getSessionById(session_id);
    if (!sessionData) {
      return NextResponse.json<UpdateCartItemResponse>(
        {
          success: false,
          error: {
            code: 'SESSION_NOT_FOUND',
            message: `Session '${session_id}' not found.`,
          },
        },
        { status: 404 }
      );
    }

    // Verify session status is 'SHOPPING'
    if (sessionData.status !== 'SHOPPING') {
      return NextResponse.json<UpdateCartItemResponse>(
        {
          success: false,
          error: {
            code: 'SESSION_LOCKED',
            message: `Cannot modify cart items while status is '${sessionData.status}'.`,
          },
        },
        { status: 409 }
      );
    }

    const existingItems = [...(sessionData.items || [])];
    const itemIndex = existingItems.findIndex((i) => i.id === item_id);

    if (itemIndex === -1) {
      return NextResponse.json<UpdateCartItemResponse>(
        {
          success: false,
          error: {
            code: 'ITEM_NOT_FOUND',
            message: `Cart item ${item_id} not found in this session.`,
          },
        },
        { status: 404 }
      );
    }

    let updatedItem: CartItem | null = null;

    if (quantity === 0) {
      // Remove item
      existingItems.splice(itemIndex, 1);
    } else {
      const target = existingItems[itemIndex];
      updatedItem = {
        ...target,
        quantity,
        total_price_paise: target.unit_price_paise * quantity,
        updated_at: new Date().toISOString(),
      };
      existingItems[itemIndex] = updatedItem;
    }

    // Server-side recalculation
    const calculation = calculateCartSummary(
      existingItems.map((i) => ({
        unitPricePaise: i.unit_price_paise,
        quantity: i.quantity,
        taxRateBasisPoints: i.tax_rate_basis_points,
      })),
      sessionData.discount_paise
    );

    const updatedSession = queueStore.updateSessionItems(session_id, existingItems, {
      total_items: calculation.totalItems,
      subtotal_paise: calculation.subtotalPaise,
      tax_paise: calculation.taxPaise,
      discount_paise: calculation.discountPaise,
      grand_total_paise: calculation.grandTotalPaise,
    });

    return NextResponse.json<UpdateCartItemResponse>({
      success: true,
      data: {
        session: updatedSession!,
        updated_item: updatedItem,
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
