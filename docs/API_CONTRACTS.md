# ZeroWait API Contracts

## Overview
This document defines the formal request and response contracts established on the `develop` branch. Both the `cart` branch and the `queue_engine` branch must conform to these interfaces.

All endpoints adhere to the unified response envelope:

```typescript
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  meta?: {
    timestamp: string;
    requestId?: string;
  };
}
```

---

## 1. Barcode-to-Product Lookup
Retrieves product details and pricing snapshot for scanner input.

- **Method**: `GET`
- **Path**: `/api/v1/products/lookup?barcode={barcode}&store_id={store_id}`
- **Query Parameters**:
  - `barcode` (string, required): Scanned barcode string (min 3 chars).
  - `store_id` (UUID, optional): Store identifier (defaults to active store).

### Response (200 OK):
```json
{
  "success": true,
  "data": {
    "product": {
      "id": "e1111111-1111-1111-1111-111111111111",
      "store_id": "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
      "barcode": "8901030383123",
      "name": "Fresh Milk (1L)",
      "category": "Dairy & Eggs",
      "price_paise": 6500,
      "tax_rate_basis_points": 500,
      "stock_quantity": 120,
      "unit": "bottle",
      "is_active": true
    },
    "formatted_price": "₹65.00"
  },
  "meta": { "timestamp": "2026-11-02T10:00:00.000Z" }
}
```

---

## 2. Cart Retrieval (QR Asset Identity)
Resolves physical cart metadata and active shopping session from QR scan.

- **Method**: `GET`
- **Path**: `/api/v1/carts/:qr_code`

### Response (200 OK):
```json
{
  "success": true,
  "data": {
    "cart": {
      "id": "c1111111-1111-1111-1111-111111111111",
      "store_id": "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
      "qr_code": "ZW-CART-001",
      "cart_label": "Smart Cart #1",
      "battery_level": 95,
      "is_active": true
    },
    "active_session": {
      "id": "b1111111-1111-1111-1111-111111111111",
      "status": "SHOPPING",
      "total_items": 4,
      "subtotal_paise": 37000,
      "tax_paise": 2750,
      "grand_total_paise": 39750
    }
  }
}
```

---

## 3. Product Scanning
Adds a scanned item to an active cart session with server-calculated price snapshots.

- **Method**: `POST`
- **Path**: `/api/v1/carts/scan`
- **Body**:
```json
{
  "session_id": "b1111111-1111-1111-1111-111111111111",
  "barcode": "8901030383124",
  "quantity": 1
}
```

### Response (200 OK):
```json
{
  "success": true,
  "data": {
    "session": {
      "id": "b1111111-1111-1111-1111-111111111111",
      "status": "SHOPPING",
      "total_items": 5,
      "subtotal_paise": 55000,
      "grand_total_paise": 58650
    },
    "scanned_item": {
      "product_id": "e2222222-2222-2222-2222-222222222222",
      "quantity": 1,
      "unit_price_paise": 18000,
      "total_price_paise": 18000,
      "product_name_snapshot": "Red Apples (1kg)"
    }
  }
}
```

---

## 4. Cart Item Updates
Updates item quantity or removes item (when `quantity: 0`). Recomputes financial summary.

- **Method**: `PATCH`
- **Path**: `/api/v1/carts/items`
- **Body**:
```json
{
  "session_id": "b1111111-1111-1111-1111-111111111111",
  "item_id": "i2222222-2222-2222-2222-222222222222",
  "quantity": 2
}
```

---

## 5. Queue Assignment (Queue Engine)
Allocates an optimal checkout counter based on item count, counter type, and current queue depth. Locks the cart to `ASSIGNED_LOCKED`.

- **Method**: `POST`
- **Path**: `/api/v1/queue/assign`
- **Body**:
```json
{
  "session_id": "b1111111-1111-1111-1111-111111111111",
  "preferred_type": "EXPRESS"
}
```

### Response (200 OK):
```json
{
  "success": true,
  "data": {
    "assignment": {
      "id": "la_1730548123456",
      "lane_id": "d1111111-1111-1111-1111-111111111111",
      "token_number": "E-482",
      "queue_position": 2,
      "estimated_wait_seconds": 61,
      "assignment_status": "QUEUED"
    },
    "estimate": {
      "estimated_wait_seconds": 61,
      "queue_depth": 2,
      "recommended_lane_id": "d1111111-1111-1111-1111-111111111111",
      "lane_name": "Counter 1 (Express)",
      "lane_type": "EXPRESS",
      "token_number": "E-482"
    },
    "session_status": "ASSIGNED_LOCKED"
  }
}
```

---

## 6. Lane Workload Retrieval
Returns real-time queue depth and wait times across all store counters.

- **Method**: `GET`
- **Path**: `/api/v1/queue/lanes?store_id={store_id}`

### Response (200 OK):
```json
{
  "success": true,
  "data": {
    "lanes": [
      {
        "id": "d1111111-1111-1111-1111-111111111111",
        "lane_number": 1,
        "name": "Counter 1 (Express)",
        "type": "EXPRESS",
        "status": "OPEN",
        "queue_count": 1,
        "estimated_wait_seconds": 45,
        "serving_token": "A-045"
      }
    ],
    "total_active_lanes": 3,
    "total_waiting_customers": 6
  }
}
```

---

## 7. Real-Time Cart Updates
WebSocket / Supabase Realtime channel topic: `store:{store_id}:cart:{cart_id}`.

### Payload Schema:
```typescript
export interface CartRealtimePayload {
  event: 'CART_ITEM_ADDED' | 'CART_ITEM_UPDATED' | 'CART_ITEM_REMOVED' | 'CART_LOCKED' | 'CART_LANE_ASSIGNED' | 'CART_CALLED_TO_LANE' | 'CART_CHECKOUT_COMPLETED';
  session_id: string;
  cart_id: string;
  timestamp: string;
  payload: {
    item?: CartItem;
    session?: Partial<CartSession>;
    assignment?: Partial<LaneAssignment>;
  };
}
```

---

## 8. Checkout & Payment State Updates
Transitions the cart session through its payment lifecycle.

- **Method**: `POST`
- **Path**: `/api/v1/checkout/state`
- **Body**:
```json
{
  "session_id": "b1111111-1111-1111-1111-111111111111",
  "next_status": "PAYMENT_PENDING",
  "payment_info": {
    "method": "UPI",
    "amount_paise": 39750
  }
}
```

### Valid State Transitions:
- `SHOPPING` -> `ASSIGNED_LOCKED` -> `AT_CHECKOUT` -> `PAYMENT_PENDING` -> `PAID` -> `CLOSED`
- Any state can transition to `EXCEPTION`.
