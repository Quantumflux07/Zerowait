import { NextRequest, NextResponse } from 'next/server';
import { scanProductSchema } from '@/lib/validations/cart';
import { queueStore } from '@/lib/services/queueStore';
import { MOCK_PRODUCTS } from '@/lib/services/mockData';
import { calculateCartSummary } from '@/lib/engine/pricing';
import { ScanProductResponse } from '@/types/api';
import { CartItem } from '@/types/domain';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validation = scanProductSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json<ScanProductResponse>(
        {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid scan payload.',
            details: validation.error.format(),
          },
        },
        { status: 400 }
      );
    }

    const { session_id, barcode, quantity } = validation.data;

    // Fetch live session from stateful store
    const sessionData = queueStore.getSessionById(session_id);
    if (!sessionData) {
      return NextResponse.json<ScanProductResponse>(
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

    // Verify session status is 'SHOPPING' (cannot scan if ASSIGNED_LOCKED or at checkout)
    if (sessionData.status !== 'SHOPPING') {
      return NextResponse.json<ScanProductResponse>(
        {
          success: false,
          error: {
            code: 'SESSION_LOCKED',
            message: `Cannot scan items while session status is '${sessionData.status}'. Cart is locked for checkout.`,
          },
        },
        { status: 409 }
      );
    }

    // Lookup product in catalog
    const product = MOCK_PRODUCTS.find((p) => p.barcode === barcode && p.is_active);
    if (!product) {
      return NextResponse.json<ScanProductResponse>(
        {
          success: false,
          error: {
            code: 'PRODUCT_NOT_FOUND',
            message: `No active product found for barcode ${barcode}.`,
          },
        },
        { status: 404 }
      );
    }

    if (product.stock_quantity < quantity) {
      return NextResponse.json<ScanProductResponse>(
        {
          success: false,
          error: {
            code: 'INSUFFICIENT_STOCK',
            message: `Requested quantity exceeds available stock (${product.stock_quantity} available).`,
          },
        },
        { status: 422 }
      );
    }

    // Snapshot item, update session
    const existingItems = [...(sessionData.items || [])];
    const itemIndex = existingItems.findIndex((i) => i.product_id === product.id);

    let scannedItem: CartItem;

    if (itemIndex >= 0) {
      const existing = existingItems[itemIndex];
      const newQty = existing.quantity + quantity;
      scannedItem = {
        ...existing,
        quantity: newQty,
        total_price_paise: existing.unit_price_paise * newQty,
        updated_at: new Date().toISOString(),
      };
      existingItems[itemIndex] = scannedItem;
    } else {
      scannedItem = {
        id: `i_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
        session_id,
        product_id: product.id,
        quantity,
        unit_price_paise: product.price_paise,
        tax_rate_basis_points: product.tax_rate_basis_points,
        total_price_paise: product.price_paise * quantity,
        barcode_snapshot: product.barcode,
        product_name_snapshot: product.name,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      existingItems.push(scannedItem);
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

    return NextResponse.json<ScanProductResponse>({
      success: true,
      data: {
        session: updatedSession!,
        scanned_item: scannedItem,
      },
      meta: {
        timestamp: new Date().toISOString(),
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json<ScanProductResponse>(
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
