-- ==============================================================================
-- ZERO WAIT — QUEUE ENGINE & REALTIME INTEGRATION MIGRATION
-- Migration: 20261102000001_queue_engine_functions.sql
-- Description:
-- 1. Atomic concurrency-safe lane assignment RPC with FOR UPDATE row lock
-- 2. Partial unique index to enforce single active session per physical cart
-- 3. Enables Supabase Realtime publication on cart_sessions and lane_assignments
-- ==============================================================================

-- 1. Enforce single active shopping session per physical cart at database level
CREATE UNIQUE INDEX IF NOT EXISTS idx_active_session_per_cart 
ON public.cart_sessions(cart_id) 
WHERE status IN ('SHOPPING', 'ASSIGNED_LOCKED', 'AT_CHECKOUT', 'PAYMENT_PENDING');

-- 2. Atomic Concurrency-Safe Queue Lane Assignment Function
CREATE OR REPLACE FUNCTION public.assign_cart_to_lane(
    p_session_id UUID,
    p_lane_id UUID,
    p_token_number TEXT,
    p_estimated_wait_seconds INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_session RECORD;
    v_lane RECORD;
    v_existing_assignment RECORD;
    v_queue_position INTEGER;
    v_assignment_id UUID;
BEGIN
    -- 1. Acquire exclusive row lock on the cart session to prevent race conditions
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

    -- 2. Idempotency Check: if session is already ASSIGNED_LOCKED, return existing assignment
    IF v_session.status = 'ASSIGNED_LOCKED' THEN
        SELECT la.*, l.name as lane_name, l.type as lane_type
        INTO v_existing_assignment
        FROM public.lane_assignments la
        LEFT JOIN public.lanes l ON l.id = la.lane_id
        WHERE la.session_id = p_session_id
        ORDER BY la.created_at DESC
        LIMIT 1;

        IF FOUND THEN
            RETURN jsonb_build_object(
                'success', true,
                'already_assigned', true,
                'assignment_id', v_existing_assignment.id,
                'token_number', v_existing_assignment.token_number,
                'queue_position', v_existing_assignment.queue_position,
                'estimated_wait_seconds', v_existing_assignment.estimated_wait_seconds,
                'lane_id', v_existing_assignment.lane_id,
                'lane_name', v_existing_assignment.lane_name,
                'lane_type', v_existing_assignment.lane_type,
                'session_status', v_session.status
            );
        END IF;
    END IF;

    -- 3. Validation: Cart must be in SHOPPING status
    IF v_session.status != 'SHOPPING' THEN
        RETURN jsonb_build_object(
            'success', false,
            'error_code', 'INVALID_SESSION_STATUS',
            'message', format('Cannot allocate checkout for session with status %s', v_session.status)
        );
    END IF;

    -- 4. Validation: Cart cannot be empty
    IF v_session.total_items <= 0 THEN
        RETURN jsonb_build_object(
            'success', false,
            'error_code', 'EMPTY_CART',
            'message', 'Cannot allocate checkout for an empty shopping cart.'
        );
    END IF;

    -- 5. Validation: Target lane must exist and be OPEN
    SELECT * INTO v_lane
    FROM public.lanes
    WHERE id = p_lane_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error_code', 'LANE_NOT_FOUND',
            'message', 'Target checkout lane does not exist.'
        );
    END IF;

    IF v_lane.status != 'OPEN' THEN
        RETURN jsonb_build_object(
            'success', false,
            'error_code', 'LANE_NOT_OPEN',
            'message', format('Checkout lane %s is %s.', v_lane.name, v_lane.status)
        );
    END IF;

    -- Enforce express item limit if applicable
    IF v_lane.max_items_limit IS NOT NULL AND v_session.total_items > v_lane.max_items_limit THEN
        RETURN jsonb_build_object(
            'success', false,
            'error_code', 'EXPRESS_LIMIT_EXCEEDED',
            'message', format('Cart has %s items, which exceeds the express counter limit of %s items.', v_session.total_items, v_lane.max_items_limit)
        );
    END IF;

    -- 6. Calculate next sequential queue position for this lane
    SELECT COALESCE(COUNT(*), 0) + 1 INTO v_queue_position
    FROM public.lane_assignments
    WHERE lane_id = p_lane_id
      AND assignment_status IN ('QUEUED', 'SERVING');

    -- 7. Insert the lane assignment record
    INSERT INTO public.lane_assignments (
        lane_id,
        session_id,
        token_number,
        queue_position,
        estimated_wait_seconds,
        assignment_status
    )
    VALUES (
        p_lane_id,
        p_session_id,
        p_token_number,
        v_queue_position,
        p_estimated_wait_seconds,
        'QUEUED'
    )
    RETURNING id INTO v_assignment_id;

    -- 8. Lock the cart session atomically
    UPDATE public.cart_sessions
    SET status = 'ASSIGNED_LOCKED',
        assigned_lane_id = p_lane_id,
        locked_at = timezone('utc'::text, now()),
        updated_at = timezone('utc'::text, now())
    WHERE id = p_session_id;

    -- 9. Insert immutable audit trail entry
    INSERT INTO public.audit_logs (
        store_id,
        action,
        entity_type,
        entity_id,
        payload
    )
    VALUES (
        v_session.store_id,
        'LANE_ASSIGNED_LOCKED',
        'cart_sessions',
        p_session_id::text,
        jsonb_build_object(
            'lane_id', p_lane_id,
            'lane_name', v_lane.name,
            'lane_type', v_lane.type,
            'token_number', p_token_number,
            'queue_position', v_queue_position,
            'estimated_wait_seconds', p_estimated_wait_seconds,
            'total_items', v_session.total_items,
            'grand_total_paise', v_session.grand_total_paise
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'already_assigned', false,
        'assignment_id', v_assignment_id,
        'token_number', p_token_number,
        'queue_position', v_queue_position,
        'estimated_wait_seconds', p_estimated_wait_seconds,
        'lane_id', p_lane_id,
        'lane_name', v_lane.name,
        'lane_type', v_lane.type,
        'session_status', 'ASSIGNED_LOCKED'
    );
END;
$$;

-- 3. Enable Supabase Realtime publication on relevant tables
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        BEGIN
            ALTER PUBLICATION supabase_realtime ADD TABLE public.cart_sessions;
        EXCEPTION WHEN duplicate_object THEN
            -- Table already in publication
        END;

        BEGIN
            ALTER PUBLICATION supabase_realtime ADD TABLE public.lane_assignments;
        EXCEPTION WHEN duplicate_object THEN
            -- Table already in publication
        END;
    END IF;
END;
$$;
