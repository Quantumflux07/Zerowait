/**
 * ZeroWait Domain Types
 * Branch: develop (Shared Foundation)
 * 
 * Standards:
 * - All monetary values are strictly represented in integer paise (1 INR = 100 paise)
 * - All tax rates are represented in basis points (100 bps = 1.00%, 1800 bps = 18.00% GST)
 * - Physical carts are identified by permanent unique QR codes (Asset ID, not auth credential)
 */

export type UserRole = 'ADMIN' | 'STAFF' | 'CUSTOMER';

export type CartStatus =
  | 'SHOPPING'
  | 'ASSIGNED_LOCKED'
  | 'AT_CHECKOUT'
  | 'PAYMENT_PENDING'
  | 'PAID'
  | 'CLOSED'
  | 'EXCEPTION';

export type LaneStatus = 'OPEN' | 'PAUSED' | 'CLOSED';

export type LaneType = 'EXPRESS' | 'REGULAR' | 'SELF_CHECKOUT';

export type AssignmentStatus =
  | 'QUEUED'
  | 'SERVING'
  | 'COMPLETED'
  | 'SKIPPED'
  | 'CANCELLED';

export type PaymentMethod = 'UPI' | 'CARD' | 'CASH' | 'NET_BANKING' | 'WALLET';

export type PaymentStatus = 'PENDING' | 'COMPLETED' | 'FAILED' | 'REFUNDED';

export type DiscountType = 'PERCENTAGE' | 'FLAT_AMOUNT' | 'BUNDLE';

export interface Store {
  id: string;
  code: string;
  name: string;
  address: string;
  city: string;
  state: string;
  postal_code: string;
  currency: string; // 'INR'
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Profile {
  id: string;
  store_id: string | null;
  email: string;
  full_name: string;
  role: UserRole;
  phone_number: string | null;
  created_at: string;
  updated_at: string;
}

export interface Product {
  id: string;
  store_id: string;
  barcode: string;
  name: string;
  category: string;
  description: string | null;
  image_url: string | null;
  price_paise: number; // Integer paise
  tax_rate_basis_points: number; // e.g. 1800 for 18% GST
  stock_quantity: number;
  unit: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Cart {
  id: string;
  store_id: string;
  qr_code: string; // Permanent unique QR identity
  cart_label: string;
  battery_level: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CartItem {
  id: string;
  session_id: string;
  product_id: string;
  quantity: number;
  unit_price_paise: number; // Snapshot of unit price at scan
  tax_rate_basis_points: number; // Snapshot of tax rate at scan
  total_price_paise: number; // unit_price_paise * quantity
  barcode_snapshot: string;
  product_name_snapshot: string;
  created_at: string;
  updated_at: string;
}

export interface CartSession {
  id: string;
  cart_id: string;
  store_id: string;
  customer_user_id: string | null;
  guest_session_token: string | null;
  status: CartStatus;
  total_items: number;
  subtotal_paise: number;
  discount_paise: number;
  tax_paise: number;
  grand_total_paise: number;
  assigned_lane_id: string | null;
  locked_at: string | null;
  started_at: string;
  ended_at: string | null;
  created_at: string;
  updated_at: string;
  items?: CartItem[];
  cart?: Cart;
  assigned_lane?: Lane | null;
}

export interface Lane {
  id: string;
  store_id: string;
  lane_number: number;
  name: string;
  type: LaneType;
  status: LaneStatus;
  max_items_limit: number | null; // e.g. 10 for express
  assigned_staff_id: string | null;
  created_at: string;
  updated_at: string;
  current_queue_count?: number;
  estimated_wait_seconds?: number;
}

export interface LaneAssignment {
  id: string;
  lane_id: string;
  session_id: string;
  token_number: string; // e.g. "A-045"
  queue_position: number;
  estimated_wait_seconds: number;
  assignment_status: AssignmentStatus;
  called_at: string | null;
  served_at: string | null;
  created_at: string;
  updated_at: string;
  lane?: Lane;
  session?: CartSession;
}

export interface CheckoutEstimate {
  estimated_wait_seconds: number;
  queue_depth: number;
  recommended_lane_id: string;
  lane_name: string;
  lane_type: LaneType;
  token_number: string;
}

export interface DiscountRule {
  id: string;
  store_id: string;
  code: string;
  description: string | null;
  discount_type: DiscountType;
  discount_value: number;
  min_cart_value_paise: number;
  max_discount_paise: number | null;
  is_active: boolean;
  starts_at: string | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CheckoutTransaction {
  id: string;
  store_id: string;
  session_id: string;
  payment_method: PaymentMethod;
  payment_reference: string | null;
  amount_paise: number;
  status: PaymentStatus;
  invoice_number: string | null;
  payment_gateway_response: Record<string, unknown> | null;
  completed_at: string | null;
  created_at: string;
}

export interface AuditLog {
  id: string;
  store_id: string | null;
  actor_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string;
  payload: Record<string, unknown> | null;
  ip_address: string | null;
  created_at: string;
}
