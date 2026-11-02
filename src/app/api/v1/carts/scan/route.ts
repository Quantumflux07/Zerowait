import { NextRequest, NextResponse } from 'next/server';
import { scanProductSchema } from '@/lib/validations/cart';
import { scanProductToCart } from '@/lib/services/cartService';
import { ScanProductResponse } from '@/types/api';

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

    const result = await scanProductToCart(session_id, barcode, quantity || 1);

    if (!result.success || !result.session || !result.scanned_item) {
      const statusCode =
        result.error?.code === 'SESSION_NOT_FOUND'
          ? 404
          : result.error?.code === 'PRODUCT_NOT_FOUND'
          ? 404
          : result.error?.code === 'SESSION_LOCKED'
          ? 409
          : result.error?.code === 'INSUFFICIENT_STOCK'
          ? 422
          : result.error?.code === 'SUPABASE_NOT_CONFIGURED'
          ? 503
          : 500;

      return NextResponse.json<ScanProductResponse>(
        {
          success: false,
          error: {
            code: result.error?.code || 'SCAN_FAILED',
            message: result.error?.message || 'Failed to scan product.',
          },
        },
        { status: statusCode }
      );
    }

    return NextResponse.json<ScanProductResponse>({
      success: true,
      data: {
        session: result.session,
        scanned_item: result.scanned_item,
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
