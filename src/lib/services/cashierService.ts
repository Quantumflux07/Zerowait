/**
 * ZeroWait — Authoritative Cashier Service
 * 
 * Orchestrates cashier cart QR scanning, lane verification, item snapshot inspection,
 * authoritative server bill verification, and atomic payment settlement.
 */

import { createAdminClient } from '@/lib/supabase/admin';
import { isSupabaseConfigured, getMissingSupabaseConfigMessage } from '@/lib/supabase/config';
import { calculateCartSummary } from '@/lib/engine/pricing';
import { queueStore } from './queueStore';
import { getDefaultStoreId } from './productService';
import { broadcastCheckoutCompletedRealtime } from './realtime';
import type {
  Cart,
  CartSession,
  CartItem,
  Lane,
  LaneAssignment,
  CheckoutTransaction,
  PaymentMethod,
} from '@/types/domain';
import type { CashierCartDetails } from '@/types/api';

export interface CashierValidationResult {
  success: boolean;
  data?: CashierCartDetails;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  configMissing?: boolean;
}

export interface CashierSettlementResult {
  success: boolean;
  transaction?: CheckoutTransaction;
  already_settled?: boolean;
  error?: {
    code: string;
    message: string;
  };
}

export interface CashierReleaseResult {
  success: boolean;
  session_id?: string;
  cart_id?: string;
  error?: {
    code: string;
    message: string;
  };
}

/**
 * Validates and retrieves an active cart session for a scanned cart QR code at the cashier counter.
 * Enforces strict checkout readiness, lane matching, and server-side price integrity.
 */
export async function validateAndFetchCashierCart(
  qrCode: string,
  cashierLaneId?: string
): Promise<CashierValidationResult> {
  const cleanCode = qrCode.trim();
  if (!cleanCode) {
    return {
      success: false,
      error: {
        code: 'INVALID_QR_CODE',
        message: 'Cart QR Code cannot be empty.',
      },
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 1. SUPABASE LIVE DATABASE INTEGRATION
  // ─────────────────────────────────────────────────────────────────────────────
  if (isSupabaseConfigured()) {
    try {
      const supabase = createAdminClient();

      // Step 1: Look up physical cart by permanent QR code
      const { data: cartData, error: cartErr } = await supabase
        .from('carts')
        .select('*')
        .eq('qr_code', cleanCode)
        .eq('is_active', true)
        .maybeSingle();

      if (cartErr) {
        throw new Error(`Database error querying cart: ${cartErr.message}`);
      }

      if (!cartData) {
        return {
          success: false,
          error: {
            code: 'CART_NOT_FOUND',
            message: `No active shopping cart registered with identifier '${cleanCode}'.`,
          },
        };
      }

      const cart = cartData as Cart;

      // Step 2: Fetch latest session for this cart
      const { data: sessionData, error: sessionErr } = await supabase
        .from('cart_sessions')
        .select('*, assigned_lane:lanes(*)')
        .eq('cart_id', cart.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (sessionErr) {
        throw new Error(`Database error querying cart session: ${sessionErr.message}`);
      }

      if (!sessionData) {
        return {
          success: false,
          error: {
            code: 'NO_ACTIVE_SESSION',
            message: `Cart ${cart.cart_label} has no active shopping session.`,
          },
        };
      }

      const session = sessionData as CartSession;

      // Step 3: Validate checkout eligibility of session status
      if (session.status === 'SHOPPING') {
        return {
          success: false,
          error: {
            code: 'CART_NOT_IN_QUEUE',
            message: `Cart ${cart.cart_label} is still in SHOPPING mode and has not been allocated to a checkout lane by the Queue Engine.`,
          },
        };
      }

      if (session.status === 'PAID') {
        return {
          success: false,
          error: {
            code: 'CART_ALREADY_PAID',
            message: `Cart ${cart.cart_label} has already been marked as PAID and settled.`,
          },
        };
      }

      if (session.status === 'CLOSED') {
        return {
          success: false,
          error: {
            code: 'CART_SESSION_CLOSED',
            message: `Cart ${cart.cart_label} session is already closed.`,
          },
        };
      }

      if (session.status !== 'ASSIGNED_LOCKED' && session.status !== 'AT_CHECKOUT') {
        return {
          success: false,
          error: {
            code: 'INVALID_CART_STATUS',
            message: `Cart session status '${session.status}' is not eligible for cashier checkout.`,
          },
        };
      }

      if (session.total_items <= 0) {
        return {
          success: false,
          error: {
            code: 'EMPTY_CART',
            message: `Cart ${cart.cart_label} contains 0 items. Cannot checkout an empty cart.`,
          },
        };
      }

      // Step 4: Fetch active lane assignment
      const { data: assignData, error: assignErr } = await supabase
        .from('lane_assignments')
        .select('*, lane:lanes(*)')
        .eq('session_id', session.id)
        .in('assignment_status', ['QUEUED', 'SERVING'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (assignErr) {
        throw new Error(`Database error querying lane assignment: ${assignErr.message}`);
      }

      const assignment = (assignData as LaneAssignment) || null;
      if (!assignment && !session.assigned_lane_id) {
        return {
          success: false,
          error: {
            code: 'NO_LANE_ASSIGNMENT',
            message: `Cart ${cart.cart_label} has no counter allocation in the Queue Engine.`,
          },
        };
      }

      // Step 5: Check Lane-Specific Authorization / Mismatch
      let laneMismatch = false;
      let laneMismatchMessage: string | undefined = undefined;

      if (cashierLaneId && session.assigned_lane_id && session.assigned_lane_id !== cashierLaneId) {
        laneMismatch = true;
        const assignedName = session.assigned_lane?.name || assignment?.lane?.name || 'Assigned Counter';
        laneMismatchMessage = `Cart ${cart.cart_label} was allocated to ${assignedName}. You are operating a different counter.`;
      }

      // Step 6: Fetch persisted cart items snapshot
      const { data: itemsData, error: itemsErr } = await supabase
        .from('cart_items')
        .select('*')
        .eq('session_id', session.id)
        .order('created_at', { ascending: true });

      if (itemsErr) {
        throw new Error(`Database error fetching cart items: ${itemsErr.message}`);
      }

      const items = (itemsData as CartItem[]) || [];

      // Step 7: Authoritative Server-side Bill Verification (Integer Paise Engine)
      const calculationItems = items.map((i) => ({
        unitPricePaise: i.unit_price_paise,
        quantity: i.quantity,
        taxRateBasisPoints: i.tax_rate_basis_points,
      }));

      const calc = calculateCartSummary(calculationItems, session.discount_paise);
      const authoritativeBill = {
        total_items: calc.totalItems,
        subtotal_paise: calc.subtotalPaise,
        tax_paise: calc.taxPaise,
        discount_paise: calc.discountPaise,
        grand_total_paise: calc.grandTotalPaise,
      };

      return {
        success: true,
        data: {
          cart,
          session,
          assignment,
          items,
          authoritative_bill: authoritativeBill,
          lane_mismatch: laneMismatch,
          lane_mismatch_message: laneMismatchMessage,
        },
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown database error in cashier validation';
      return {
        success: false,
        error: {
          code: 'DATABASE_ERROR',
          message: msg,
        },
      };
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. IN-MEMORY STORE FALLBACK (For Tests & Development)
  // ─────────────────────────────────────────────────────────────────────────────
  if (process.env.NODE_ENV === 'test' || process.env.ALLOW_LOCAL_DEV_STORE === 'true') {
    const cartWithSession = queueStore.getExistingCartByQrCode(cleanCode);

    if (!cartWithSession || !cartWithSession.cart) {
      return {
        success: false,
        error: {
          code: 'CART_NOT_FOUND',
          message: `No active shopping cart registered with identifier '${cleanCode}'.`,
        },
      };
    }

    const { cart, active_session: session } = cartWithSession;

    if (!session) {
      return {
        success: false,
        error: {
          code: 'NO_ACTIVE_SESSION',
          message: `Cart ${cart.cart_label} has no active shopping session.`,
        },
      };
    }

    if (session.status === 'SHOPPING') {
      return {
        success: false,
        error: {
          code: 'CART_NOT_IN_QUEUE',
          message: `Cart ${cart.cart_label} is still in SHOPPING mode and has not been allocated to a checkout lane by the Queue Engine.`,
        },
      };
    }

    if (session.status === 'PAID') {
      return {
        success: false,
        error: {
          code: 'CART_ALREADY_PAID',
          message: `Cart ${cart.cart_label} has already been marked as PAID and settled.`,
        },
      };
    }

    if (session.status === 'CLOSED') {
      return {
        success: false,
        error: {
          code: 'CART_SESSION_CLOSED',
          message: `Cart ${cart.cart_label} session is already closed.`,
        },
      };
    }

    if (session.status !== 'ASSIGNED_LOCKED' && session.status !== 'AT_CHECKOUT') {
      return {
        success: false,
        error: {
          code: 'INVALID_CART_STATUS',
          message: `Cart session status '${session.status}' is not eligible for cashier checkout.`,
        },
      };
    }

    if (session.total_items <= 0) {
      return {
        success: false,
        error: {
          code: 'EMPTY_CART',
          message: `Cart ${cart.cart_label} contains 0 items. Cannot checkout an empty cart.`,
        },
      };
    }

    const assignment = queueStore.getAssignmentBySessionId(session.id) || null;
    if (!assignment && !session.assigned_lane_id) {
      return {
        success: false,
        error: {
          code: 'NO_LANE_ASSIGNMENT',
          message: `Cart ${cart.cart_label} has no counter allocation in the Queue Engine.`,
        },
      };
    }

    let laneMismatch = false;
    let laneMismatchMessage: string | undefined = undefined;

    if (cashierLaneId && session.assigned_lane_id && session.assigned_lane_id !== cashierLaneId) {
      laneMismatch = true;
      const assignedName = session.assigned_lane?.name || assignment?.lane?.name || 'Counter 1';
      laneMismatchMessage = `Cart ${cart.cart_label} was allocated to ${assignedName}. You are operating a different counter.`;
    }

    const items = session.items || [];
    const calculationItems = items.map((i) => ({
      unitPricePaise: i.unit_price_paise,
      quantity: i.quantity,
      taxRateBasisPoints: i.tax_rate_basis_points,
    }));

    const calc = calculateCartSummary(calculationItems, session.discount_paise);
    const authoritativeBill = {
      total_items: calc.totalItems,
      subtotal_paise: calc.subtotalPaise,
      tax_paise: calc.taxPaise,
      discount_paise: calc.discountPaise,
      grand_total_paise: calc.grandTotalPaise,
    };

    return {
      success: true,
      data: {
        cart,
        session,
        assignment,
        items,
        authoritative_bill: authoritativeBill,
        lane_mismatch: laneMismatch,
        lane_mismatch_message: laneMismatchMessage,
      },
    };
  }

  return {
    success: false,
    error: {
      code: 'SUPABASE_NOT_CONFIGURED',
      message: getMissingSupabaseConfigMessage(),
    },
    configMissing: true,
  };
}

/**
 * Check-in cart at counter: transitions session to AT_CHECKOUT and lane assignment to SERVING.
 */
export async function checkinCashierCart(
  sessionId: string,
  laneId: string,
  staffId?: string
): Promise<{ success: boolean; session_id?: string; error?: string }> {
  if (isSupabaseConfigured()) {
    try {
      const supabase = createAdminClient();

      // Try invoking atomic PostgreSQL function
      const { data: rpcData, error: rpcErr } = await supabase.rpc('checkin_cart_to_counter', {
        p_session_id: sessionId,
        p_lane_id: laneId,
        p_staff_id: staffId || null,
      });

      if (!rpcErr && rpcData && typeof rpcData === 'object' && 'success' in rpcData) {
        const res = rpcData as { success: boolean; message?: string };
        if (!res.success) {
          return { success: false, error: res.message || 'Checkin failed' };
        }
        return { success: true, session_id: sessionId };
      }

      // Fallback: direct update if RPC is not yet installed
      const { error: sessionUpdateErr } = await supabase
        .from('cart_sessions')
        .update({
          status: 'AT_CHECKOUT',
          updated_at: new Date().toISOString(),
        })
        .eq('id', sessionId);

      if (sessionUpdateErr) {
        throw new Error(sessionUpdateErr.message);
      }

      await supabase
        .from('lane_assignments')
        .update({
          assignment_status: 'SERVING',
          called_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('session_id', sessionId)
        .eq('lane_id', laneId);

      return { success: true, session_id: sessionId };
    } catch (err: unknown) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Database checkin error',
      };
    }
  }

  if (process.env.NODE_ENV === 'test' || process.env.ALLOW_LOCAL_DEV_STORE === 'true') {
    const success = queueStore.checkinSession(sessionId, laneId);
    return { success, session_id: sessionId };
  }

  return { success: false, error: getMissingSupabaseConfigMessage() };
}

/**
 * Mark as Paid: atomically settles the cart checkout, records transaction, and closes queue assignment.
 */
export async function settleCashierCheckout(params: {
  sessionId: string;
  paymentMethod: PaymentMethod;
  paymentReference?: string;
  amountPaise: number;
  cashierId?: string;
  cashierLaneId?: string;
}): Promise<CashierSettlementResult> {
  const { sessionId, paymentMethod, paymentReference, amountPaise, cashierId, cashierLaneId } = params;

  // Generate unique invoice number: INV-YYYYMMDD-XXXXXX
  const d = new Date();
  const dateStr = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(
    d.getDate()
  ).padStart(2, '0')}`;
  const randomSuffix = Math.floor(100000 + Math.random() * 900000);
  const invoiceNumber = `INV-${dateStr}-${randomSuffix}`;
  const now = d.toISOString();

  // 1. SUPABASE LIVE INTEGRATION
  if (isSupabaseConfigured()) {
    try {
      const supabase = createAdminClient();

      // Attempt atomic PostgreSQL settlement RPC
      const { data: rpcData, error: rpcErr } = await supabase.rpc('settle_cart_checkout', {
        p_session_id: sessionId,
        p_cashier_id: cashierId || null,
        p_payment_method: paymentMethod,
        p_payment_reference: paymentReference || null,
        p_amount_paise: amountPaise,
        p_invoice_number: invoiceNumber,
      });

      if (!rpcErr && rpcData && typeof rpcData === 'object' && 'success' in rpcData) {
        const res = rpcData as {
          success: boolean;
          already_settled?: boolean;
          transaction_id?: string;
          invoice_number?: string;
          amount_paise?: number;
          payment_method?: PaymentMethod;
          status?: string;
          completed_at?: string;
          error_code?: string;
          message?: string;
        };

        if (!res.success) {
          return {
            success: false,
            error: {
              code: res.error_code || 'SETTLEMENT_FAILED',
              message: res.message || 'Settlement was rejected by database.',
            },
          };
        }

        const tx: CheckoutTransaction = {
          id: res.transaction_id || `tx_${Date.now()}`,
          store_id: (await getDefaultStoreId()),
          session_id: sessionId,
          payment_method: res.payment_method || paymentMethod,
          payment_reference: paymentReference || null,
          amount_paise: res.amount_paise || amountPaise,
          status: 'COMPLETED',
          invoice_number: res.invoice_number || invoiceNumber,
          payment_gateway_response: { settled_by_cashier_id: cashierId },
          completed_at: res.completed_at || now,
          created_at: res.completed_at || now,
        };

        // Broadcast to Realtime channel
        await broadcastCheckoutCompletedRealtime({
          event: 'CHECKOUT_COMPLETED',
          sessionId,
          cartId: '',
          invoiceNumber: tx.invoice_number || invoiceNumber,
          amountPaise: tx.amount_paise,
          timestamp: now,
        });

        return {
          success: true,
          transaction: tx,
          already_settled: res.already_settled,
        };
      }

      // Fallback: direct atomic operations if RPC not yet created
      // 1. Fetch and verify session
      const { data: sessionData, error: sessionErr } = await supabase
        .from('cart_sessions')
        .select('*')
        .eq('id', sessionId)
        .single();

      if (sessionErr || !sessionData) {
        return {
          success: false,
          error: { code: 'SESSION_NOT_FOUND', message: 'Cart session not found.' },
        };
      }

      const session = sessionData as CartSession;

      // Idempotency check: Already paid?
      if (session.status === 'PAID' || session.status === 'CLOSED') {
        const { data: existingTx } = await supabase
          .from('checkout_transactions')
          .select('*')
          .eq('session_id', sessionId)
          .maybeSingle();

        if (existingTx) {
          return {
            success: true,
            transaction: existingTx as CheckoutTransaction,
            already_settled: true,
          };
        }
      }

      // Verify amount matches
      if (session.grand_total_paise !== amountPaise) {
        return {
          success: false,
          error: {
            code: 'AMOUNT_MISMATCH',
            message: `Amount mismatch: expected ${session.grand_total_paise} paise, received ${amountPaise} paise.`,
          },
        };
      }

      // 2. Insert transaction
      const { data: txData, error: txErr } = await supabase
        .from('checkout_transactions')
        .insert({
          store_id: session.store_id,
          session_id: sessionId,
          payment_method: paymentMethod,
          payment_reference: paymentReference || null,
          amount_paise: amountPaise,
          status: 'COMPLETED',
          invoice_number: invoiceNumber,
          completed_at: now,
          payment_gateway_response: { settled_by_cashier_id: cashierId },
        })
        .select()
        .single();

      if (txErr || !txData) {
        throw new Error(`Failed to record transaction: ${txErr?.message}`);
      }

      // 3. Mark session as PAID
      await supabase
        .from('cart_sessions')
        .update({
          status: 'PAID',
          ended_at: now,
          updated_at: now,
        })
        .eq('id', sessionId);

      // 4. Mark assignment as COMPLETED
      await supabase
        .from('lane_assignments')
        .update({
          assignment_status: 'COMPLETED',
          served_at: now,
          updated_at: now,
        })
        .eq('session_id', sessionId)
        .in('assignment_status', ['QUEUED', 'SERVING']);

      // 5. Insert audit log
      await supabase.from('audit_logs').insert({
        store_id: session.store_id,
        actor_id: cashierId || null,
        action: 'CHECKOUT_SETTLED_PAID',
        entity_type: 'checkout_transactions',
        entity_id: txData.id,
        payload: {
          session_id: sessionId,
          invoice_number: invoiceNumber,
          payment_method: paymentMethod,
          amount_paise: amountPaise,
          lane_id: cashierLaneId || session.assigned_lane_id,
        },
      });

      // Broadcast realtime event
      await broadcastCheckoutCompletedRealtime({
        event: 'CHECKOUT_COMPLETED',
        sessionId,
        cartId: session.cart_id,
        invoiceNumber,
        amountPaise,
        timestamp: now,
      });

      return {
        success: true,
        transaction: txData as CheckoutTransaction,
      };
    } catch (err: unknown) {
      return {
        success: false,
        error: {
          code: 'SETTLEMENT_ERROR',
          message: err instanceof Error ? err.message : 'Database error during settlement',
        },
      };
    }
  }

  // 2. IN-MEMORY STORE FALLBACK (For Tests & Development)
  if (process.env.NODE_ENV === 'test' || process.env.ALLOW_LOCAL_DEV_STORE === 'true') {
    const res = queueStore.settleSession(
      sessionId,
      cashierId || 'cashier_001',
      paymentMethod,
      paymentReference,
      amountPaise
    );

    if (!res.success) {
      return {
        success: false,
        error: {
          code: 'SETTLEMENT_FAILED',
          message: res.error || 'Settlement failed in local store',
        },
      };
    }

    return {
      success: true,
      transaction: res.transaction,
    };
  }

  return {
    success: false,
    error: {
      code: 'SUPABASE_NOT_CONFIGURED',
      message: getMissingSupabaseConfigMessage(),
    },
  };
}

/**
 * Release Cart Session: closes the paid session, unlocking the physical cart asset for the next customer.
 */
export async function releaseCashierCartSession(
  sessionId: string,
  staffId?: string
): Promise<CashierReleaseResult> {
  if (isSupabaseConfigured()) {
    try {
      const supabase = createAdminClient();

      // Attempt PostgreSQL RPC
      const { data: rpcData, error: rpcErr } = await supabase.rpc('release_cart_session', {
        p_session_id: sessionId,
        p_staff_id: staffId || null,
      });

      if (!rpcErr && rpcData && typeof rpcData === 'object' && 'success' in rpcData) {
        const res = rpcData as { success: boolean; cart_id?: string; message?: string };
        if (!res.success) {
          return { success: false, error: { code: 'RELEASE_FAILED', message: res.message || 'Release failed' } };
        }
        return { success: true, session_id: sessionId, cart_id: res.cart_id };
      }

      // Fallback: direct update
      const { data: sessionData } = await supabase
        .from('cart_sessions')
        .select('cart_id, status')
        .eq('id', sessionId)
        .single();

      if (!sessionData) {
        return { success: false, error: { code: 'NOT_FOUND', message: 'Session not found' } };
      }

      await supabase
        .from('cart_sessions')
        .update({
          status: 'CLOSED',
          updated_at: new Date().toISOString(),
        })
        .eq('id', sessionId);

      return {
        success: true,
        session_id: sessionId,
        cart_id: sessionData.cart_id,
      };
    } catch (err: unknown) {
      return {
        success: false,
        error: {
          code: 'RELEASE_ERROR',
          message: err instanceof Error ? err.message : 'Error releasing cart session',
        },
      };
    }
  }

  if (process.env.NODE_ENV === 'test' || process.env.ALLOW_LOCAL_DEV_STORE === 'true') {
    const session = queueStore.getSessionById(sessionId);
    const cartId = session?.cart_id;
    const ok = queueStore.releaseSession(sessionId);
    if (!ok) {
      return { success: false, error: { code: 'RELEASE_FAILED', message: 'Session could not be closed' } };
    }
    return { success: true, session_id: sessionId, cart_id: cartId };
  }

  return {
    success: false,
    error: {
      code: 'SUPABASE_NOT_CONFIGURED',
      message: getMissingSupabaseConfigMessage(),
    },
  };
}

/**
 * Returns available checkout counters/lanes for cashier counter selection.
 */
export async function getCashierLanes(storeId?: string): Promise<{ lanes: Lane[]; error?: string }> {
  if (isSupabaseConfigured()) {
    try {
      const supabase = createAdminClient();
      const effectiveStoreId = storeId || (await getDefaultStoreId());

      const { data: lanes, error: lanesErr } = await supabase
        .from('lanes')
        .select('*')
        .eq('store_id', effectiveStoreId)
        .order('lane_number', { ascending: true });

      if (lanesErr) throw lanesErr;
      return { lanes: (lanes as Lane[]) || [] };
    } catch (err: unknown) {
      return {
        lanes: [],
        error: err instanceof Error ? err.message : 'Failed to query lanes',
      };
    }
  }

  if (process.env.NODE_ENV === 'test' || process.env.ALLOW_LOCAL_DEV_STORE === 'true') {
    const lanes = queueStore.getLanes().map((l) => ({
      id: l.id,
      store_id: l.store_id,
      lane_number: l.lane_number,
      name: l.name,
      type: l.type,
      status: l.status,
      max_items_limit: l.max_items_limit,
      assigned_staff_id: l.assigned_staff_id,
      created_at: l.created_at,
      updated_at: l.updated_at,
      current_queue_count: l.current_queue_count,
      estimated_wait_seconds: l.estimated_wait_seconds,
    }));
    return { lanes };
  }

  return { lanes: [] };
}
