-- ==============================================================================
-- ZERO WAIT — CASHIER SETTLEMENT & CHECKOUT LIFECYCLE MIGRATION
-- Migration: 20261102000002_cashier_settlement.sql
-- Description:
-- 1. Atomic PostgreSQL function for checkout settlement (Mark as Paid)
-- 2. Atomic PostgreSQL function for counter check-in (status AT_CHECKOUT)
-- 3. Atomic PostgreSQL function for session release (status CLOSED)
-- 4. RLS policies for cashier staff members
-- ==============================================================================

-- 1. Counter Check-In Function (Called when cart arrives at counter)
CREATE OR REPLACE FUNCTION public.checkin_cart_to_counter(
    p_session_id UUID,
    p_lane_id UUID,
    p_staff_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_session RECORD;
    v_assignment RECORD;
BEGIN
    -- Acquire exclusive row lock on the session
    SELECT * INTO v_session
    FROM public.cart_sessions
    WHERE id = p_session_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error_code', 'SESSION_NOT_FOUND',
            'message', 'Cart session not found.'
        );
    END IF;

    IF v_session.status NOT IN ('ASSIGNED_LOCKED', 'AT_CHECKOUT') THEN
        RETURN jsonb_build_object(
            'success', false,
            'error_code', 'INVALID_SESSION_STATUS',
            'message', format('Cannot check in session with status %s. Cart must be ASSIGNED_LOCKED.', v_session.status)
        );
    END IF;

    -- Update session status to AT_CHECKOUT
    UPDATE public.cart_sessions
    SET status = 'AT_CHECKOUT',
        updated_at = timezone('utc'::text, now())
    WHERE id = p_session_id;

    -- Update lane assignment status to SERVING
    UPDATE public.lane_assignments
    SET assignment_status = 'SERVING',
        called_at = COALESCE(called_at, timezone('utc'::text, now())),
        updated_at = timezone('utc'::text, now())
    WHERE session_id = p_session_id
      AND lane_id = p_lane_id;

    -- Insert audit log
    INSERT INTO public.audit_logs (
        store_id,
        actor_id,
        action,
        entity_type,
        entity_id,
        payload
    )
    VALUES (
        v_session.store_id,
        p_staff_id,
        'CASHIER_CART_CHECKIN',
        'cart_sessions',
        p_session_id::text,
        jsonb_build_object(
            'lane_id', p_lane_id,
            'previous_status', v_session.status,
            'new_status', 'AT_CHECKOUT'
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'session_id', p_session_id,
        'status', 'AT_CHECKOUT'
    );
END;
$$;

-- 2. Atomic Concurrency-Safe Cashier Settlement Function (Mark as Paid)
CREATE OR REPLACE FUNCTION public.settle_cart_checkout(
    p_session_id UUID,
    p_cashier_id UUID,
    p_payment_method TEXT,
    p_payment_reference TEXT,
    p_amount_paise INTEGER,
    p_invoice_number TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_session RECORD;
    v_lane RECORD;
    v_existing_tx RECORD;
    v_transaction_id UUID;
    v_completed_at TIMESTAMPTZ := timezone('utc'::text, now());
BEGIN
    -- 1. Acquire exclusive row lock on the cart session to prevent concurrent double-settlement
    SELECT * INTO v_session
    FROM public.cart_sessions
    WHERE id = p_session_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error_code', 'SESSION_NOT_FOUND',
            'message', 'Cart session not found.'
        );
    END IF;

    -- 2. Concurrency / Idempotency check: Has this session already been paid?
    IF v_session.status IN ('PAID', 'CLOSED') THEN
        SELECT * INTO v_existing_tx
        FROM public.checkout_transactions
        WHERE session_id = p_session_id
        ORDER BY created_at DESC
        LIMIT 1;

        IF FOUND THEN
            RETURN jsonb_build_object(
                'success', true,
                'already_settled', true,
                'transaction_id', v_existing_tx.id,
                'invoice_number', v_existing_tx.invoice_number,
                'amount_paise', v_existing_tx.amount_paise,
                'payment_method', v_existing_tx.payment_method,
                'status', v_existing_tx.status,
                'completed_at', v_existing_tx.completed_at
            );
        END IF;
    END IF;

    -- 3. Verify session status is eligible for checkout
    IF v_session.status NOT IN ('ASSIGNED_LOCKED', 'AT_CHECKOUT', 'PAYMENT_PENDING') THEN
        RETURN jsonb_build_object(
            'success', false,
            'error_code', 'INVALID_SESSION_STATUS',
            'message', format('Cannot settle checkout for session with status %s.', v_session.status)
        );
    END IF;

    -- 4. Verify payable total matches server grand total
    IF v_session.grand_total_paise != p_amount_paise THEN
        RETURN jsonb_build_object(
            'success', false,
            'error_code', 'AMOUNT_MISMATCH',
            'message', format('Settlement amount %s paise does not match session grand total %s paise.', p_amount_paise, v_session.grand_total_paise)
        );
    END IF;

    -- 5. Insert completed transaction record
    INSERT INTO public.checkout_transactions (
        store_id,
        session_id,
        payment_method,
        payment_reference,
        amount_paise,
        status,
        invoice_number,
        completed_at,
        payment_gateway_response
    )
    VALUES (
        v_session.store_id,
        p_session_id,
        p_payment_method,
        p_payment_reference,
        p_amount_paise,
        'COMPLETED',
        p_invoice_number,
        v_completed_at,
        jsonb_build_object(
            'settled_by_cashier_id', p_cashier_id,
            'settled_at', v_completed_at
        )
    )
    RETURNING id INTO v_transaction_id;

    -- 6. Transition cart session to PAID
    UPDATE public.cart_sessions
    SET status = 'PAID',
        ended_at = v_completed_at,
        updated_at = v_completed_at
    WHERE id = p_session_id;

    -- 7. Update lane assignment status to COMPLETED
    UPDATE public.lane_assignments
    SET assignment_status = 'COMPLETED',
        served_at = v_completed_at,
        updated_at = v_completed_at
    WHERE session_id = p_session_id
      AND assignment_status IN ('QUEUED', 'SERVING');

    -- 8. Write immutable audit log
    INSERT INTO public.audit_logs (
        store_id,
        actor_id,
        action,
        entity_type,
        entity_id,
        payload
    )
    VALUES (
        v_session.store_id,
        p_cashier_id,
        'CHECKOUT_SETTLED_PAID',
        'checkout_transactions',
        v_transaction_id::text,
        jsonb_build_object(
            'session_id', p_session_id,
            'invoice_number', p_invoice_number,
            'payment_method', p_payment_method,
            'payment_reference', p_payment_reference,
            'amount_paise', p_amount_paise,
            'lane_id', v_session.assigned_lane_id
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'already_settled', false,
        'transaction_id', v_transaction_id,
        'invoice_number', p_invoice_number,
        'amount_paise', p_amount_paise,
        'payment_method', p_payment_method,
        'status', 'COMPLETED',
        'completed_at', v_completed_at
    );
END;
$$;

-- 3. Release Cart Session Function (Frees the physical cart for new shopping trips)
CREATE OR REPLACE FUNCTION public.release_cart_session(
    p_session_id UUID,
    p_staff_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_session RECORD;
BEGIN
    SELECT * INTO v_session
    FROM public.cart_sessions
    WHERE id = p_session_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error_code', 'SESSION_NOT_FOUND',
            'message', 'Cart session not found.'
        );
    END IF;

    IF v_session.status != 'PAID' THEN
        RETURN jsonb_build_object(
            'success', false,
            'error_code', 'SESSION_NOT_PAID',
            'message', format('Cannot release session with status %s. Session must be PAID first.', v_session.status)
        );
    END IF;

    -- Close the session
    UPDATE public.cart_sessions
    SET status = 'CLOSED',
        updated_at = timezone('utc'::text, now())
    WHERE id = p_session_id;

    -- Insert audit log
    INSERT INTO public.audit_logs (
        store_id,
        actor_id,
        action,
        entity_type,
        entity_id,
        payload
    )
    VALUES (
        v_session.store_id,
        p_staff_id,
        'CART_SESSION_RELEASED_CLOSED',
        'cart_sessions',
        p_session_id::text,
        jsonb_build_object(
            'cart_id', v_session.cart_id,
            'session_id', p_session_id
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'session_id', p_session_id,
        'cart_id', v_session.cart_id,
        'status', 'CLOSED'
    );
END;
$$;

-- 4. Enable Supabase Realtime publication on checkout_transactions
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        BEGIN
            ALTER PUBLICATION supabase_realtime ADD TABLE public.checkout_transactions;
        EXCEPTION WHEN duplicate_object THEN
            -- Table already in publication
        END;
    END IF;
END;
$$;

