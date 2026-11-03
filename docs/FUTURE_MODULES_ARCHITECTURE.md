# ZeroWait — Future Modules Architecture & Contracts
**Modules:** Store Manager & Cashier Counter  
**Target Database:** PostgreSQL on Supabase (Integer Paise Standard)

---

## 1. Architectural Philosophy
ZeroWait uses Supabase PostgreSQL as its single source of truth. The Cart and Queue Engine modules write authoritative session states and line items. The future **Manager** and **Cashier** modules build directly on top of these database tables without rewriting existing functionality:

```
[Customer Smart Cart] ───┐
                         ▼
             [Supabase PostgreSQL] ◄───► [Queue Engine]
                         ▲
       ┌─────────────────┴─────────────────┐
       ▼                                   ▼
[Store Manager Module]             [Cashier Counter Module]
(Catalog, Carts, Lanes, Audits)   (QR Scan, Verify, Settlement)
```

---

## 2. Store Manager Module Architecture

### Responsibilities:
1. **Product Catalogue Management**: Create, update, toggle active status, and batch import via CSV.
2. **Physical Cart Provisioning**: Register physical shopping carts and generate asset QR codes.
3. **Lane Management**: Open, pause, close checkout lanes; assign counter staff.
4. **Store & Queue Monitoring**: View live customer queues, average wait times, bottleneck counters.
5. **Audit Logs & Analytics**: Review system events, locked carts, and checkout velocities.

### Database Relationships Used:
- `products`: CRUD operations keyed by `(store_id, barcode)`.
- `carts`: Registration of permanent `qr_code` identities and battery telemetry.
- `lanes`: Real-time status toggling (`status IN ('OPEN', 'PAUSED', 'CLOSED')`).
- `discount_rules`: Definition of store promotions (`PERCENTAGE`, `FLAT_AMOUNT`).
- `audit_logs`: Querying event logs for security and performance audits.

### Future Manager API Contracts:

#### 1. Product Management
- `POST /api/v1/manager/products` (Register individual product)
- `PUT /api/v1/manager/products/:id` (Update price, tax rate, or stock)
- `POST /api/v1/manager/products/import` (Upload CSV catalog)

#### 2. Lane Operations
- `PATCH /api/v1/manager/lanes/:id/status`
  ```json
  { "status": "OPEN" | "PAUSED" | "CLOSED", "assigned_staff_id": "UUID" }
  ```

#### 3. Cart Provisioning
- `POST /api/v1/manager/carts/provision`
  ```json
  { "qr_code": "ZW-CART-006", "cart_label": "Smart Cart #6" }
  ```

---

## 3. Cashier Counter Module Architecture

### Responsibilities:
1. **Cart QR Scanning**: Cashier scans the customer's physical cart QR upon arrival at the counter.
2. **Authoritative Cart Retrieval**: Fetches the exact locked session, line items, and server-calculated bill.
3. **Assigned Lane Verification**: Ensures the cart is at its correct allocated counter.
4. **Physical Checkout Verification**: Cashier spot-checks high-value items or bags against the snapshot.
5. **Payment Settlement**: Records payment transaction in `checkout_transactions` table and transitions session to `PAID` / `CLOSED`.

### Database Relationships Used:
- `cart_sessions`: Transition status `ASSIGNED_LOCKED` ➔ `AT_CHECKOUT` ➔ `PAID` ➔ `CLOSED`.
- `cart_items`: Verified line items and snapshots.
- `lane_assignments`: Update status to `SERVING` upon arrival, and `COMPLETED` after payment.
- `checkout_transactions`: Record payment method (`UPI`, `CARD`, `CASH`), amount in paise, status, and invoice reference.

### Future Cashier API Contracts:

#### 1. Cashier Cart Retrieval
- `GET /api/v1/cashier/carts/:qr_code`
  - Validates `active_session.status === 'ASSIGNED_LOCKED'` or `'AT_CHECKOUT'`.
  - Verifies `active_session.assigned_lane_id === cashier.current_lane_id`.
  - Returns locked items and final bill in integer paise.

#### 2. Arrival Check-In
- `POST /api/v1/cashier/sessions/:session_id/checkin`
  - Updates `cart_sessions.status = 'AT_CHECKOUT'`.
  - Updates `lane_assignments.assignment_status = 'SERVING'`, sets `called_at = now()`.

#### 3. Payment Settlement
- `POST /api/v1/cashier/transactions/settle`
  ```json
  {
    "session_id": "UUID",
    "payment_method": "UPI" | "CARD" | "CASH",
    "payment_reference": "UPI-REF-99281726",
    "amount_paise": 39750
  }
  ```
  - Inserts row in `checkout_transactions` with `status: 'COMPLETED'`.
  - Updates `cart_sessions.status = 'PAID'`.
  - Updates `lane_assignments.assignment_status = 'COMPLETED'`, sets `served_at = now()`.
  - Generates tax invoice.

---

## 4. Security & Role Isolation (RLS)

All cashier and manager operations execute under authenticated profiles:
- Cashier: Profile role `STAFF`. Allowed to view and complete sessions assigned to their lane.
- Manager: Profile role `ADMIN`. Full store-level access across inventory, lanes, and telemetry.
- Customers & Anonymous Cart Kiosks: Restricted to their active session; cannot tamper with bills or lane assignments.
