import { NextRequest, NextResponse } from 'next/server';
import { productLookupSchema } from '@/lib/validations/cart';
import { lookupProductByBarcode } from '@/lib/services/productService';
import { formatPaiseToInr } from '@/lib/engine/pricing';
import { ProductLookupResponse } from '@/types/api';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const barcode = searchParams.get('barcode');
    const store_id = searchParams.get('store_id') || undefined;

    const validation = productLookupSchema.safeParse({ barcode, store_id });
    if (!validation.success) {
      return NextResponse.json<ProductLookupResponse>(
        {
          success: false,
          error: {
            code: 'INVALID_BARCODE',
            message: 'Barcode parameter is missing or invalid.',
            details: validation.error.format(),
          },
        },
        { status: 400 }
      );
    }

    const { product, error, configMissing } = await lookupProductByBarcode(
      validation.data.barcode,
      validation.data.store_id
    );

    if (configMissing) {
      return NextResponse.json<ProductLookupResponse>(
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
      return NextResponse.json<ProductLookupResponse>(
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

    if (!product) {
      return NextResponse.json<ProductLookupResponse>(
        {
          success: false,
          error: {
            code: 'PRODUCT_NOT_FOUND',
            message: `No active product found for barcode: ${validation.data.barcode}. Use the product registration or CSV import tool to register it.`,
          },
        },
        { status: 404 }
      );
    }

    return NextResponse.json<ProductLookupResponse>({
      success: true,
      data: {
        product,
        formatted_price: formatPaiseToInr(product.price_paise),
      },
      meta: {
        timestamp: new Date().toISOString(),
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json<ProductLookupResponse>(
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
