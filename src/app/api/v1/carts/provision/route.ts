import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { provisionPhysicalCart } from '@/lib/services/cartProvisioningService';

const provisionCartSchema = z.object({
  qr_code: z.string().min(3).max(32),
  cart_label: z.string().min(2).max(64),
  store_id: z.string().uuid().optional(),
  battery_level: z.number().int().min(0).max(100).optional().default(100),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validation = provisionCartSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid cart provisioning payload.',
            details: validation.error.format(),
          },
        },
        { status: 400 }
      );
    }

    const result = await provisionPhysicalCart(validation.data);

    if (!result.success || !result.cart) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'PROVISIONING_FAILED',
            message: result.error || 'Failed to provision physical cart.',
          },
        },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        data: {
          cart: result.cart,
          qr_data_url: result.qr_data_url,
          active_session: result.active_session,
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
