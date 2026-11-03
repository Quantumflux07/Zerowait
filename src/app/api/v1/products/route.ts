import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { registerProduct } from '@/lib/services/productService';

const createProductSchema = z.object({
  store_id: z.string().uuid().optional(),
  barcode: z.string().min(3).max(64),
  name: z.string().min(2).max(128),
  category: z.string().min(2).max(64),
  description: z.string().max(500).optional().nullable(),
  image_url: z.string().url().optional().nullable(),
  price_paise: z.number().int().min(0),
  tax_rate_basis_points: z.number().int().min(0).default(500),
  stock_quantity: z.number().int().min(0).default(100),
  unit: z.string().min(1).max(32).default('unit'),
  is_active: z.boolean().default(true),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validation = createProductSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid product registration payload.',
            details: validation.error.format(),
          },
        },
        { status: 400 }
      );
    }

    const result = await registerProduct(validation.data);

    if (!result.success || !result.product) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'REGISTRATION_FAILED',
            message: result.error || 'Failed to register product in catalogue.',
          },
        },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        data: {
          product: result.product,
        },
        meta: {
          timestamp: new Date().toISOString(),
        },
      },
      { status: 201 }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json(
      {
        success: false,
        error: { code: 'SERVER_ERROR', message },
      },
      { status: 500 }
    );
  }
}
