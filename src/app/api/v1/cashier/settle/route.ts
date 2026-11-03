import { NextRequest, NextResponse } from 'next/server';
import { cashierSettleSchema } from '@/lib/validations/cashier';
import { settleCashierCheckout } from '@/lib/services/cashierService';
import { CashierSettleResponse } from '@/types/api';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validation = cashierSettleSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json<CashierSettleResponse>(
        {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid settlement payload.',
            details: validation.error.format(),
          },
        },
        { status: 400 }
      );
    }

    const { session_id, payment_method, payment_reference, amount_paise, cashier_lane_id } =
      validation.data;

    const result = await settleCashierCheckout({
      sessionId: session_id,
      paymentMethod: payment_method,
      paymentReference: payment_reference,
      amountPaise: amount_paise,
      cashierLaneId: cashier_lane_id,
    });

    if (!result.success || !result.transaction) {
      return NextResponse.json<CashierSettleResponse>(
        {
          success: false,
          error: {
            code: result.error?.code || 'SETTLEMENT_FAILED',
            message: result.error?.message || 'Settlement failed.',
          },
        },
        { status: 422 }
      );
    }

    const tx = result.transaction;

    return NextResponse.json<CashierSettleResponse>({
      success: true,
      data: {
        transaction_id: tx.id,
        invoice_number: tx.invoice_number || '',
        amount_paise: tx.amount_paise,
        payment_method: tx.payment_method,
        status: tx.status,
        completed_at: tx.completed_at || new Date().toISOString(),
        already_settled: result.already_settled,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json<CashierSettleResponse>(
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

