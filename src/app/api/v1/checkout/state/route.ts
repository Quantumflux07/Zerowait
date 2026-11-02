import { NextRequest, NextResponse } from 'next/server';
import { checkoutStateUpdateSchema } from '@/lib/validations/cart';
import { MOCK_ACTIVE_SESSION } from '@/lib/services/mockData';
import { CheckoutStateUpdateResponse } from '@/types/api';
import { CartStatus } from '@/types/domain';

// Valid status transitions state machine
const ALLOWED_TRANSITIONS: Record<CartStatus, CartStatus[]> = {
  SHOPPING: ['ASSIGNED_LOCKED', 'EXCEPTION', 'CLOSED'],
  ASSIGNED_LOCKED: ['AT_CHECKOUT', 'SHOPPING', 'EXCEPTION', 'CLOSED'],
  AT_CHECKOUT: ['PAYMENT_PENDING', 'ASSIGNED_LOCKED', 'EXCEPTION'],
  PAYMENT_PENDING: ['PAID', 'AT_CHECKOUT', 'EXCEPTION'],
  PAID: ['CLOSED', 'EXCEPTION'],
  CLOSED: [],
  EXCEPTION: ['SHOPPING', 'CLOSED'],
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validation = checkoutStateUpdateSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json<CheckoutStateUpdateResponse>(
        {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid state transition payload.',
            details: validation.error.format(),
          },
        },
        { status: 400 }
      );
    }

    const { next_status } = validation.data;
    const currentStatus = MOCK_ACTIVE_SESSION.status;

    // Check transition validity
    const allowed = ALLOWED_TRANSITIONS[currentStatus] || [];
    if (!allowed.includes(next_status)) {
      return NextResponse.json<CheckoutStateUpdateResponse>(
        {
          success: false,
          error: {
            code: 'INVALID_STATE_TRANSITION',
            message: `Transition from '${currentStatus}' to '${next_status}' is illegal.`,
          },
        },
        { status: 409 }
      );
    }

    // Apply state change
    MOCK_ACTIVE_SESSION.status = next_status;
    let invoiceNumber: string | undefined = undefined;

    if (next_status === 'PAID') {
      invoiceNumber = `INV-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`;
      MOCK_ACTIVE_SESSION.ended_at = new Date().toISOString();
    }

    if (next_status === 'CLOSED') {
      if (!MOCK_ACTIVE_SESSION.ended_at) {
        MOCK_ACTIVE_SESSION.ended_at = new Date().toISOString();
      }
    }

    return NextResponse.json<CheckoutStateUpdateResponse>({
      success: true,
      data: {
        session: MOCK_ACTIVE_SESSION,
        previous_status: currentStatus,
        new_status: next_status,
        invoice_number: invoiceNumber,
      },
      meta: {
        timestamp: new Date().toISOString(),
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json<CheckoutStateUpdateResponse>(
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
