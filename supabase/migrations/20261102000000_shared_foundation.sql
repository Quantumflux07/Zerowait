-- ==============================================================================
-- ZERO WAIT — SHARED DATABASE FOUNDATION MIGRATION
-- Branch: develop
-- Architecture: PostgreSQL on Supabase with Row Level Security (RLS)
-- Currency Standard: Integer paise (1 INR = 100 paise)
-- ==============================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==============================================================================
-- 1. STORES
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.stores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    address TEXT NOT NULL,
    city TEXT NOT NULL,
    state TEXT NOT NULL,
    postal_code TEXT NOT NULL,
    currency TEXT NOT NULL DEFAULT 'INR',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- ==============================================================================
-- 2. USER PROFILES
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    store_id UUID REFERENCES public.stores(id) ON DELETE SET NULL,
    email TEXT NOT NULL UNIQUE,
    full_name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('ADMIN', 'STAFF', 'CUSTOMER')),
    phone_number TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- ==============================================================================
-- 3. PRODUCTS
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    barcode TEXT NOT NULL,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    description TEXT,
    image_url TEXT,
    price_paise INTEGER NOT NULL CHECK (price_paise >= 0),
    tax_rate_basis_points INTEGER NOT NULL DEFAULT 1800 CHECK (tax_rate_basis_points >= 0), -- e.g. 1800 = 18.00% GST
    stock_quantity INTEGER NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0),
    unit TEXT NOT NULL DEFAULT 'unit',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT uq_product_store_barcode UNIQUE (store_id, barcode)
);

-- ==============================================================================
-- 4. CARTS (Physical Shopping Carts with Permanent QR identity)
-- Note: QR code is an asset identifier, NOT an authentication credential
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.carts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    qr_code TEXT NOT NULL UNIQUE,
    cart_label TEXT NOT NULL,
    battery_level INTEGER DEFAULT 100 CHECK (battery_level >= 0 AND battery_level <= 100),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- ==============================================================================
-- 5. LANES (Checkout Counters)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.lanes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    lane_number INTEGER NOT NULL,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('EXPRESS', 'REGULAR', 'SELF_CHECKOUT')),
    status TEXT NOT NULL DEFAULT 'CLOSED' CHECK (status IN ('OPEN', 'PAUSED', 'CLOSED')),
    max_items_limit INTEGER, -- NULL for no limit, or e.g. 10 for express lane
    assigned_staff_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT uq_lane_store_number UNIQUE (store_id, lane_number)
);

-- ==============================================================================
-- 6. CART SESSIONS (Active/Historical Shopping Journeys)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.cart_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cart_id UUID NOT NULL REFERENCES public.carts(id) ON DELETE RESTRICT,
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    customer_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    guest_session_token TEXT, -- Nonce/token for anonymous customer device verification
    status TEXT NOT NULL DEFAULT 'SHOPPING' CHECK (
        status IN ('SHOPPING', 'ASSIGNED_LOCKED', 'AT_CHECKOUT', 'PAYMENT_PENDING', 'PAID', 'CLOSED', 'EXCEPTION')
    ),
    total_items INTEGER NOT NULL DEFAULT 0 CHECK (total_items >= 0),
    subtotal_paise INTEGER NOT NULL DEFAULT 0 CHECK (subtotal_paise >= 0),
    discount_paise INTEGER NOT NULL DEFAULT 0 CHECK (discount_paise >= 0),
    tax_paise INTEGER NOT NULL DEFAULT 0 CHECK (tax_paise >= 0),
    grand_total_paise INTEGER NOT NULL DEFAULT 0 CHECK (grand_total_paise >= 0),
    assigned_lane_id UUID REFERENCES public.lanes(id) ON DELETE SET NULL,
    locked_at TIMESTAMPTZ,
    started_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    ended_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- ==============================================================================
-- 7. CART ITEMS (Snapshot of product data at scan time)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.cart_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES public.cart_sessions(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    unit_price_paise INTEGER NOT NULL CHECK (unit_price_paise >= 0),
    tax_rate_basis_points INTEGER NOT NULL CHECK (tax_rate_basis_points >= 0),
    total_price_paise INTEGER NOT NULL CHECK (total_price_paise >= 0),
    barcode_snapshot TEXT NOT NULL,
    product_name_snapshot TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT uq_session_product UNIQUE (session_id, product_id)
);

-- ==============================================================================
-- 8. DISCOUNT RULES
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.discount_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    code TEXT NOT NULL,
    description TEXT,
    discount_type TEXT NOT NULL CHECK (discount_type IN ('PERCENTAGE', 'FLAT_AMOUNT', 'BUNDLE')),
    discount_value INTEGER NOT NULL CHECK (discount_value > 0), -- bps for PERCENTAGE, paise for FLAT_AMOUNT
    min_cart_value_paise INTEGER NOT NULL DEFAULT 0 CHECK (min_cart_value_paise >= 0),
    max_discount_paise INTEGER,
    is_active BOOLEAN NOT NULL DEFAULT true,
    starts_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT uq_store_discount_code UNIQUE (store_id, code)
);

-- ==============================================================================
-- 9. LANE ASSIGNMENTS (Queue allocations managed by Queue Engine)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.lane_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lane_id UUID NOT NULL REFERENCES public.lanes(id) ON DELETE CASCADE,
    session_id UUID NOT NULL REFERENCES public.cart_sessions(id) ON DELETE CASCADE,
    token_number TEXT NOT NULL,
    queue_position INTEGER NOT NULL CHECK (queue_position >= 0),
    estimated_wait_seconds INTEGER NOT NULL DEFAULT 0 CHECK (estimated_wait_seconds >= 0),
    assignment_status TEXT NOT NULL DEFAULT 'QUEUED' CHECK (
        assignment_status IN ('QUEUED', 'SERVING', 'COMPLETED', 'SKIPPED', 'CANCELLED')
    ),
    called_at TIMESTAMPTZ,
    served_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- ==============================================================================
-- 10. CHECKOUT TRANSACTIONS
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.checkout_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    session_id UUID NOT NULL REFERENCES public.cart_sessions(id) ON DELETE RESTRICT,
    payment_method TEXT NOT NULL CHECK (payment_method IN ('UPI', 'CARD', 'CASH', 'NET_BANKING', 'WALLET')),
    payment_reference TEXT,
    amount_paise INTEGER NOT NULL CHECK (amount_paise >= 0),
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'COMPLETED', 'FAILED', 'REFUNDED')),
    invoice_number TEXT UNIQUE,
    payment_gateway_response JSONB,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- ==============================================================================
-- 11. AUDIT LOGS
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID REFERENCES public.stores(id) ON DELETE SET NULL,
    actor_id UUID,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    payload JSONB,
    ip_address TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- ==============================================================================
-- INDEXES FOR HIGH-THROUGHPUT LOOKUPS & REALTIME
-- ==============================================================================
CREATE INDEX IF NOT EXISTS idx_products_store_barcode ON public.products(store_id, barcode);
CREATE INDEX IF NOT EXISTS idx_products_category ON public.products(store_id, category);
CREATE INDEX IF NOT EXISTS idx_carts_qr_code ON public.carts(qr_code);
CREATE INDEX IF NOT EXISTS idx_cart_sessions_cart_status ON public.cart_sessions(cart_id, status);
CREATE INDEX IF NOT EXISTS idx_cart_sessions_store_status ON public.cart_sessions(store_id, status);
CREATE INDEX IF NOT EXISTS idx_cart_items_session ON public.cart_items(session_id);
CREATE INDEX IF NOT EXISTS idx_lanes_store_status ON public.lanes(store_id, status);
CREATE INDEX IF NOT EXISTS idx_lane_assignments_lane_status ON public.lane_assignments(lane_id, assignment_status);
CREATE INDEX IF NOT EXISTS idx_lane_assignments_session ON public.lane_assignments(session_id);
CREATE INDEX IF NOT EXISTS idx_checkout_transactions_session ON public.checkout_transactions(session_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_store_created ON public.audit_logs(store_id, created_at DESC);

-- ==============================================================================
-- AUTOMATED UPDATED_AT TRIGGER
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
    tbl text;
BEGIN
    FOR tbl IN
        SELECT unnest(ARRAY[
            'stores', 'profiles', 'products', 'carts', 'lanes',
            'cart_sessions', 'cart_items', 'discount_rules', 'lane_assignments'
        ])
    LOOP
        EXECUTE format('
            DROP TRIGGER IF EXISTS trg_set_updated_at_%1$I ON public.%1$I;
            CREATE TRIGGER trg_set_updated_at_%1$I
            BEFORE UPDATE ON public.%1$I
            FOR EACH ROW
            EXECUTE FUNCTION public.handle_updated_at();
        ', tbl);
    END LOOP;
END;
$$;

-- ==============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- Strict Isolation: Never trust client data; enforce role and store boundaries
-- ==============================================================================
ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.carts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lanes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cart_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cart_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.discount_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lane_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checkout_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- 1. STORES: Publicly readable for active stores
CREATE POLICY "Stores are viewable by all active users"
ON public.stores FOR SELECT
USING (is_active = true);

-- 2. PROFILES: Users read their own profile; staff view profiles in their store
CREATE POLICY "Users can view own profile"
ON public.profiles FOR SELECT
USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
ON public.profiles FOR UPDATE
USING (auth.uid() = id);

-- 3. PRODUCTS: Anyone can read active products for store shopping & scanner
CREATE POLICY "Products are viewable by store customers and staff"
ON public.products FOR SELECT
USING (is_active = true);

-- 4. CARTS: Carts metadata readable by store users & kiosk scanner
CREATE POLICY "Carts are viewable by store staff and customers"
ON public.carts FOR SELECT
USING (is_active = true);

-- 5. LANES: Lanes readable by customers and staff
CREATE POLICY "Lanes are viewable by all store users"
ON public.lanes FOR SELECT
USING (true);

-- 6. CART SESSIONS: Customers can read/update their active session
CREATE POLICY "Customers view own cart session"
ON public.cart_sessions FOR SELECT
USING (
    customer_user_id = auth.uid()
    OR auth.role() = 'service_role'
    OR EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid() AND profiles.role IN ('ADMIN', 'STAFF')
    )
);

CREATE POLICY "Customers create cart session"
ON public.cart_sessions FOR INSERT
WITH CHECK (
    customer_user_id = auth.uid()
    OR auth.role() = 'service_role'
);

CREATE POLICY "Customers update own cart session"
ON public.cart_sessions FOR UPDATE
USING (
    customer_user_id = auth.uid()
    OR auth.role() = 'service_role'
);

-- 7. CART ITEMS: Readable and manageable within user session
CREATE POLICY "Cart items viewable by session owner"
ON public.cart_items FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.cart_sessions
        WHERE cart_sessions.id = cart_items.session_id
        AND (
            cart_sessions.customer_user_id = auth.uid()
            OR auth.role() = 'service_role'
            OR EXISTS (
                SELECT 1 FROM public.profiles
                WHERE profiles.id = auth.uid() AND profiles.role IN ('ADMIN', 'STAFF')
            )
        )
    )
);

-- 8. DISCOUNT RULES: Read-only for customers
CREATE POLICY "Active discounts viewable by all"
ON public.discount_rules FOR SELECT
USING (is_active = true AND (expires_at IS NULL OR expires_at > now()));

-- 9. LANE ASSIGNMENTS: Public token display screen and customer tracking
CREATE POLICY "Lane assignments viewable by all for token board"
ON public.lane_assignments FOR SELECT
USING (true);

-- 10. CHECKOUT TRANSACTIONS: Viewable by session owner or staff
CREATE POLICY "Transactions viewable by session owner"
ON public.checkout_transactions FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.cart_sessions
        WHERE cart_sessions.id = checkout_transactions.session_id
        AND (cart_sessions.customer_user_id = auth.uid() OR auth.role() = 'service_role')
    )
);

-- 11. AUDIT LOGS: Staff and Admin only
CREATE POLICY "Audit logs viewable by staff and admin only"
ON public.audit_logs FOR SELECT
USING (
    auth.role() = 'service_role'
    OR EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid() AND profiles.role IN ('ADMIN', 'STAFF')
    )
);
