# ZeroWait Database Schema Specification

## 1. Architectural Standards

- **Database Engine**: PostgreSQL 15+ hosted on Supabase.
- **Primary Keys**: UUIDv4 (`gen_random_uuid()`).
- **Monetary Storage**: Strict integer **paise** (`price_paise`, `subtotal_paise`, `grand_total_paise`). 1 INR = 100 paise. Floating-point arithmetic is forbidden.
- **Tax Precision**: Basis points (`tax_rate_basis_points`). E.g., `1800` = 18.00% GST, `500` = 5.00% GST.
- **Cart QR Identification**: Permanent unique string (`qr_code`) affixed to the physical cart hardware. It identifies the hardware asset; it is **NOT** a secret credential or authentication token.

---

## 2. Table Specifications & ERD

### 2.1 `stores`
Represents physical supermarket branches.
- `id` (UUID, PK)
- `code` (TEXT, UNIQUE, NOT NULL) — e.g. `'AVENUE-001'`
- `name` (TEXT, NOT NULL)
- `address`, `city`, `state`, `postal_code` (TEXT, NOT NULL)
- `currency` (TEXT, NOT NULL, DEFAULT `'INR'`)
- `is_active` (BOOLEAN, NOT NULL, DEFAULT true)
- `created_at`, `updated_at` (TIMESTAMPTZ)

### 2.2 `profiles`
User profiles linked to Supabase `auth.users(id)`.
- `id` (UUID, PK, REFERENCES `auth.users(id)`)
- `store_id` (UUID, FK -> `stores(id)`)
- `email` (TEXT, UNIQUE, NOT NULL)
- `full_name` (TEXT, NOT NULL)
- `role` (TEXT, CHECK `IN ('ADMIN', 'STAFF', 'CUSTOMER')`)
- `phone_number` (TEXT)
- `created_at`, `updated_at` (TIMESTAMPTZ)

### 2.3 `products`
Store inventory master catalog.
- `id` (UUID, PK)
- `store_id` (UUID, FK -> `stores(id)`)
- `barcode` (TEXT, NOT NULL) — EAN-13, UPC-A, or internal SKU
- `name` (TEXT, NOT NULL)
- `category` (TEXT, NOT NULL)
- `description`, `image_url` (TEXT)
- `price_paise` (INTEGER, >= 0, NOT NULL)
- `tax_rate_basis_points` (INTEGER, DEFAULT 1800)
- `stock_quantity` (INTEGER, DEFAULT 0)
- `unit` (TEXT, DEFAULT 'unit')
- `is_active` (BOOLEAN, DEFAULT true)
- `CONSTRAINT uq_product_store_barcode UNIQUE (store_id, barcode)`

### 2.4 `carts`
Physical shopping cart registry.
- `id` (UUID, PK)
- `store_id` (UUID, FK -> `stores(id)`)
- `qr_code` (TEXT, UNIQUE, NOT NULL) — e.g. `'ZW-CART-001'`
- `cart_label` (TEXT, NOT NULL) — e.g. `'Smart Cart #1'`
- `battery_level` (INTEGER, 0-100)
- `is_active` (BOOLEAN, DEFAULT true)

### 2.5 `lanes`
Checkout counters / lanes.
- `id` (UUID, PK)
- `store_id` (UUID, FK -> `stores(id)`)
- `lane_number` (INTEGER, NOT NULL)
- `name` (TEXT, NOT NULL) — e.g. `'Counter 1 (Express)'`
- `type` (TEXT, CHECK `IN ('EXPRESS', 'REGULAR', 'SELF_CHECKOUT')`)
- `status` (TEXT, CHECK `IN ('OPEN', 'PAUSED', 'CLOSED')`)
- `max_items_limit` (INTEGER, NULL for unlimited, e.g. 10 for express)
- `assigned_staff_id` (UUID, FK -> `profiles(id)`)
- `CONSTRAINT uq_lane_store_number UNIQUE (store_id, lane_number)`

### 2.6 `cart_sessions`
Active shopping trips for a cart.
- `id` (UUID, PK)
- `cart_id` (UUID, FK -> `carts(id)`)
- `store_id` (UUID, FK -> `stores(id)`)
- `customer_user_id` (UUID, FK -> `profiles(id)`, NULL for anonymous walk-ins)
- `guest_session_token` (TEXT)
- `status` (TEXT, CHECK `IN ('SHOPPING', 'ASSIGNED_LOCKED', 'AT_CHECKOUT', 'PAYMENT_PENDING', 'PAID', 'CLOSED', 'EXCEPTION')`)
- `total_items` (INTEGER, DEFAULT 0)
- `subtotal_paise` (INTEGER, DEFAULT 0)
- `discount_paise` (INTEGER, DEFAULT 0)
- `tax_paise` (INTEGER, DEFAULT 0)
- `grand_total_paise` (INTEGER, DEFAULT 0)
- `assigned_lane_id` (UUID, FK -> `lanes(id)`)
- `locked_at` (TIMESTAMPTZ)
- `started_at`, `ended_at` (TIMESTAMPTZ)

### 2.7 `cart_items`
Snapshot of products scanned into a cart session.
- `id` (UUID, PK)
- `session_id` (UUID, FK -> `cart_sessions(id)` ON DELETE CASCADE)
- `product_id` (UUID, FK -> `products(id)`)
- `quantity` (INTEGER, > 0)
- `unit_price_paise` (INTEGER, price snapshot at scan time)
- `tax_rate_basis_points` (INTEGER, tax rate snapshot)
- `total_price_paise` (INTEGER, unit_price_paise * quantity)
- `barcode_snapshot` (TEXT)
- `product_name_snapshot` (TEXT)
- `CONSTRAINT uq_session_product UNIQUE (session_id, product_id)`

### 2.8 `discount_rules`
Store promotion and coupon definitions.
- `id` (UUID, PK)
- `store_id` (UUID, FK -> `stores(id)`)
- `code` (TEXT, NOT NULL)
- `description` (TEXT)
- `discount_type` (TEXT, CHECK `IN ('PERCENTAGE', 'FLAT_AMOUNT', 'BUNDLE')`)
- `discount_value` (INTEGER, bps or paise)
- `min_cart_value_paise` (INTEGER, DEFAULT 0)
- `max_discount_paise` (INTEGER)
- `is_active` (BOOLEAN, DEFAULT true)

### 2.9 `lane_assignments`
Checkout queue allocations managed by the Queue Engine.
- `id` (UUID, PK)
- `lane_id` (UUID, FK -> `lanes(id)`)
- `session_id` (UUID, FK -> `cart_sessions(id)`)
- `token_number` (TEXT, e.g. `'A-045'`)
- `queue_position` (INTEGER)
- `estimated_wait_seconds` (INTEGER)
- `assignment_status` (TEXT, CHECK `IN ('QUEUED', 'SERVING', 'COMPLETED', 'SKIPPED', 'CANCELLED')`)
- `called_at`, `served_at` (TIMESTAMPTZ)

### 2.10 `checkout_transactions`
Payment audit and invoice logs.
- `id` (UUID, PK)
- `store_id` (UUID, FK -> `stores(id)`)
- `session_id` (UUID, FK -> `cart_sessions(id)`)
- `payment_method` (TEXT, CHECK `IN ('UPI', 'CARD', 'CASH', 'NET_BANKING', 'WALLET')`)
- `payment_reference` (TEXT)
- `amount_paise` (INTEGER)
- `status` (TEXT, CHECK `IN ('PENDING', 'COMPLETED', 'FAILED', 'REFUNDED')`)
- `invoice_number` (TEXT, UNIQUE)
- `payment_gateway_response` (JSONB)
- `completed_at` (TIMESTAMPTZ)

### 2.11 `audit_logs`
Security, state transition, and fraud audit events.
- `id` (UUID, PK)
- `store_id` (UUID, FK -> `stores(id)`)
- `actor_id` (UUID)
- `action` (TEXT, e.g. `'CART_LOCKED'`, `'PRICE_OVERRIDE_REJECTED'`)
- `entity_type` (TEXT)
- `entity_id` (TEXT)
- `payload` (JSONB)
- `ip_address` (TEXT)
- `created_at` (TIMESTAMPTZ)

---

## 3. Row Level Security (RLS) Summary

1. **Isolation by Store**: Products, lanes, and transactions are indexed and scoped to `store_id`.
2. **Customer Security**: Shoppers can read and update items only within their active `cart_session`. They cannot query other shoppers' carts or modify price snapshots.
3. **Price Integrity**: All item prices, taxes, and totals are computed strictly on the backend; client writes to price fields are rejected.
4. **Token Screen**: Public lane token displays read from `lane_assignments` with sanitized customer details (only token number and lane number visible).
