/**
 * Shared API Contract Types
 * Branch: develop
 * 
 * Used by 'cart' branch (customer shopping interface)
 * and 'queue_engine' branch (checkout queue allocation system).
 */

import {
  Product,
  Cart,
  CartSession,
  CartItem,
  Lane,
  LaneAssignment,
  CheckoutEstimate,
  CartStatus,
  PaymentMethod,
} from './domain';

// Standard Unified API Response
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

// -----------------------------------------------------------------------------
// 1. Barcode-to-Product Lookup Contract
// -----------------------------------------------------------------------------
export interface ProductLookupRequest {
  barcode: string;
  store_id?: string;
}

export type ProductLookupResponse = ApiResponse<{
  product: Product;
  formatted_price: string; // e.g. "₹65.00"
}>;

// -----------------------------------------------------------------------------
// 2. Cart Retrieval Contract (QR Asset identification)
// -----------------------------------------------------------------------------
export interface CartRetrievalRequest {
  qr_code: string;
}

export type CartRetrievalResponse = ApiResponse<{
  cart: Cart;
  active_session: CartSession | null;
}>;

// -----------------------------------------------------------------------------
// 3. Product Scanning Contract
// -----------------------------------------------------------------------------
export interface ScanProductRequest {
  session_id: string;
  barcode: string;
  quantity?: number; // defaults to 1
}

export type ScanProductResponse = ApiResponse<{
  session: CartSession;
  scanned_item: CartItem;
}>;

// -----------------------------------------------------------------------------
// 4. Cart Item Updates Contract
// -----------------------------------------------------------------------------
export interface UpdateCartItemRequest {
  session_id: string;
  item_id: string;
  quantity: number; // 0 to remove item
}

export type UpdateCartItemResponse = ApiResponse<{
  session: CartSession;
  updated_item: CartItem | null;
}>;

// -----------------------------------------------------------------------------
// 5. Queue Assignment Contract (Queue Engine Allocation)
// -----------------------------------------------------------------------------
export interface QueueAssignmentRequest {
  session_id: string;
  preferred_type?: 'EXPRESS' | 'REGULAR' | 'SELF_CHECKOUT';
}

export type QueueAssignmentResponse = ApiResponse<{
  assignment: LaneAssignment;
  estimate: CheckoutEstimate;
  session_status: CartStatus; // Locked to 'ASSIGNED_LOCKED'
}>;

// -----------------------------------------------------------------------------
// 6. Lane Workload Retrieval Contract
// -----------------------------------------------------------------------------
export interface LaneWorkloadRequest {
  store_id: string;
}

export type LaneWorkloadResponse = ApiResponse<{
  lanes: (Lane & {
    queue_count: number;
    estimated_wait_seconds: number;
    serving_token: string | null;
  })[];
  total_active_lanes: number;
  total_waiting_customers: number;
}>;

// -----------------------------------------------------------------------------
// 7. Real-Time Cart Updates Contract (Event Payloads)
// -----------------------------------------------------------------------------
export type CartRealtimeEventType =
  | 'CART_ITEM_ADDED'
  | 'CART_ITEM_UPDATED'
  | 'CART_ITEM_REMOVED'
  | 'CART_LOCKED'
  | 'CART_LANE_ASSIGNED'
  | 'CART_CALLED_TO_LANE'
  | 'CART_CHECKOUT_COMPLETED';

export interface CartRealtimePayload {
  event: CartRealtimeEventType;
  session_id: string;
  cart_id: string;
  timestamp: string;
  payload: {
    item?: CartItem;
    session?: Partial<CartSession>;
    assignment?: Partial<LaneAssignment>;
  };
}

// -----------------------------------------------------------------------------
// 8. Checkout & Payment State Updates Contract
// -----------------------------------------------------------------------------
export interface CheckoutStateUpdateRequest {
  session_id: string;
  next_status: CartStatus;
  payment_info?: {
    method: PaymentMethod;
    reference?: string;
    amount_paise: number;
  };
}

export type CheckoutStateUpdateResponse = ApiResponse<{
  session: CartSession;
  previous_status: CartStatus;
  new_status: CartStatus;
  invoice_number?: string;
}>;
