-- ==============================================================================
-- ZERO WAIT — SEED DATA
-- Matches design reference supermarket ("Avenue Store Market")
-- ==============================================================================

-- 1. Insert Default Store
INSERT INTO public.stores (id, code, name, address, city, state, postal_code, currency, is_active)
VALUES (
    'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    'AVENUE-001',
    'Avenue Store Market',
    '45 St. South Urban, LA, USA',
    'Los Angeles',
    'California',
    '90001',
    'INR',
    true
) ON CONFLICT (code) DO NOTHING;

-- 2. Insert Physical Shopping Carts (Permanent QR identity)
INSERT INTO public.carts (id, store_id, qr_code, cart_label, battery_level, is_active)
VALUES
    ('c1111111-1111-1111-1111-111111111111', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'ZW-CART-001', 'Smart Cart #1', 95, true),
    ('c2222222-2222-2222-2222-222222222222', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'ZW-CART-002', 'Smart Cart #2', 88, true),
    ('c3333333-3333-3333-3333-333333333333', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'ZW-CART-003', 'Smart Cart #3', 42, true),
    ('c4444444-4444-4444-4444-444444444444', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'ZW-CART-004', 'Smart Cart #4', 100, true),
    ('c5555555-5555-5555-5555-555555555555', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'ZW-CART-005', 'Smart Cart #5', 73, true)
ON CONFLICT (qr_code) DO NOTHING;

-- 3. Insert Checkout Counters / Lanes
INSERT INTO public.lanes (id, store_id, lane_number, name, type, status, max_items_limit)
VALUES
    ('d1111111-1111-1111-1111-111111111111', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 1, 'Counter 1 (Express)', 'EXPRESS', 'OPEN', 10),
    ('d2222222-2222-2222-2222-222222222222', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 2, 'Counter 2 (Regular)', 'REGULAR', 'OPEN', NULL),
    ('d3333333-3333-3333-3333-333333333333', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 3, 'Counter 3 (Regular)', 'REGULAR', 'OPEN', NULL),
    ('d4444444-4444-4444-4444-444444444444', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 4, 'Counter 4 (Self-Checkout)', 'SELF_CHECKOUT', 'PAUSED', NULL),
    ('d5555555-5555-5555-5555-555555555555', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 5, 'Counter 5 (Self-Checkout)', 'SELF_CHECKOUT', 'CLOSED', NULL)
ON CONFLICT (store_id, lane_number) DO NOTHING;

-- 4. Insert Supermarket Products (Values in paise: ₹65.00 = 6500 paise)
INSERT INTO public.products (id, store_id, barcode, name, category, description, price_paise, tax_rate_basis_points, stock_quantity, unit, is_active)
VALUES
    ('e1111111-1111-1111-1111-111111111111', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', '8901030383123', 'Fresh Milk (1L)', 'Dairy & Eggs', 'Pasteurized homogenized full cream milk', 6500, 500, 120, 'bottle', true),
    ('e2222222-2222-2222-2222-222222222222', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', '8901030383124', 'Red Apples (1kg)', 'Fruits', 'Crisp fresh Royal Gala apples', 18000, 500, 15, 'kg', true),
    ('e3333333-3333-3333-3333-333333333333', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', '8901030383125', 'Bananas (1 Dozen)', 'Fruits', 'Farm fresh Robusta bananas', 6000, 500, 45, 'dozen', true),
    ('e4444444-4444-4444-4444-444444444444', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', '8901030383126', 'Dishwashing Liquid (500ml)', 'Household', 'Lemon degreasing formula', 11500, 1800, 200, 'bottle', true),
    ('e5555555-5555-5555-5555-555555555555', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', '8901030383127', 'Whole Wheat Bread (400g)', 'Bakery', '100% whole grain brown bread', 4500, 500, 10, 'loaf', true),
    ('e6666666-6666-6666-6666-666666666666', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', '8901030383128', 'Organic Carrots (500g)', 'Vegetables', 'Sweet crunchy local organic carrots', 3500, 500, 30, 'pack', true),
    ('e7777777-7777-7777-7777-777777777777', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', '8901030383129', 'Orange Juice (1L)', 'Beverages', '100% pure squeezed Valencia oranges', 14000, 1200, 25, 'bottle', true),
    ('e8888888-8888-8888-8888-888888888888', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', '8901030383130', 'Cheddar Cheese (200g)', 'Dairy & Eggs', 'Aged block cheddar cheese', 21000, 1200, 8, 'block', true),
    ('e9999999-9999-9999-9999-999999999999', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', '8901030383131', 'Toilet Paper (4 Rolls)', 'Household', '2-ply soft recycled embossed rolls', 16000, 1800, 100, 'pack', true)
ON CONFLICT (store_id, barcode) DO UPDATE SET
    price_paise = EXCLUDED.price_paise,
    stock_quantity = EXCLUDED.stock_quantity;

-- 5. Insert Discount Rules
INSERT INTO public.discount_rules (id, store_id, code, description, discount_type, discount_value, min_cart_value_paise, is_active)
VALUES
    ('f1111111-1111-1111-1111-111111111111', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'WELCOME10', '10% off for first time zero-wait shoppers', 'PERCENTAGE', 1000, 50000, true),
    ('f2222222-2222-2222-2222-222222222222', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'FLAT50', 'Flat Rs. 50 off on carts above Rs. 999', 'FLAT_AMOUNT', 5000, 99900, true)
ON CONFLICT (store_id, code) DO NOTHING;

-- 6. Insert Sample Active Shopping Cart Session & Items
INSERT INTO public.cart_sessions (id, cart_id, store_id, status, total_items, subtotal_paise, discount_paise, tax_paise, grand_total_paise)
VALUES (
    'b1111111-1111-1111-1111-111111111111',
    'c1111111-1111-1111-1111-111111111111',
    'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    'SHOPPING',
    4,
    37000,
    0,
    2750,
    39750
) ON CONFLICT (id) DO NOTHING;

INSERT INTO public.cart_items (session_id, product_id, quantity, unit_price_paise, tax_rate_basis_points, total_price_paise, barcode_snapshot, product_name_snapshot)
VALUES
    ('b1111111-1111-1111-1111-111111111111', 'e1111111-1111-1111-1111-111111111111', 2, 6500, 500, 13000, '8901030383123', 'Fresh Milk (1L)'),
    ('b1111111-1111-1111-1111-111111111111', 'e2222222-2222-2222-2222-222222222222', 1, 18000, 500, 18000, '8901030383124', 'Red Apples (1kg)'),
    ('b1111111-1111-1111-1111-111111111111', 'e3333333-3333-3333-3333-333333333333', 1, 6000, 500, 6000, '8901030383125', 'Bananas (1 Dozen)')
ON CONFLICT (session_id, product_id) DO NOTHING;

-- 7. Insert Sample Active Lane Assignments (Queue Board tokens)
INSERT INTO public.lane_assignments (lane_id, session_id, token_number, queue_position, estimated_wait_seconds, assignment_status)
VALUES
    ('d1111111-1111-1111-1111-111111111111', 'b1111111-1111-1111-1111-111111111111', 'A-045', 1, 45, 'SERVING')
ON CONFLICT DO NOTHING;
