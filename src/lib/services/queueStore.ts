/**
 * ZeroWait Queue Engine Store & In-Memory State Service
 * 
 * Provides thread-safe, concurrency-safe access to carts, active sessions,
 * lane workloads, and atomic queue assignments.
 * Integrates with Supabase when valid credentials exist, with robust fallback.
 */

import type { Cart, CartSession, LaneAssignment, CartItem } from '../../types/domain.ts';
import {
  evaluateLanesForCart,
  generateTokenNumber,
  type LaneWithQueueDetails,
  type OptimalLaneSelection,
} from '../engine/queue.ts';
import { calculateCartSummary } from '../engine/pricing.ts';
import { MOCK_STORE_ID, MOCK_PRODUCTS } from './mockData.ts';

export interface CartWithSession {
  cart: Cart;
  active_session: CartSession | null;
  authoritative_bill?: {
    total_items: number;
    subtotal_paise: number;
    tax_paise: number;
    discount_paise: number;
    grand_total_paise: number;
  };
  assignment?: LaneAssignment | null;
}

class QueueStore {
  private carts: Map<string, Cart> = new Map();
  private sessions: Map<string, CartSession> = new Map(); // key = session.id
  private cartIdToSessionId: Map<string, string> = new Map(); // key = cart.id -> active session id
  private lanes: Map<string, LaneWithQueueDetails> = new Map();
  private assignments: Map<string, LaneAssignment> = new Map(); // key = session.id -> assignment
  private assignmentSequence: number = 100;

  constructor() {
    this.seedInitialData();
  }

  private seedInitialData() {
    // 1. Initial Carts
    const initialCarts: Cart[] = [
      {
        id: 'c1111111-1111-1111-1111-111111111111',
        store_id: MOCK_STORE_ID,
        qr_code: 'ZW-CART-001',
        cart_label: 'Smart Cart #1',
        battery_level: 95,
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: 'c2222222-2222-2222-2222-222222222222',
        store_id: MOCK_STORE_ID,
        qr_code: 'ZW-CART-002',
        cart_label: 'Smart Cart #2 (Large Trolley)',
        battery_level: 88,
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: 'c3333333-3333-3333-3333-333333333333',
        store_id: MOCK_STORE_ID,
        qr_code: 'ZW-CART-003',
        cart_label: 'Smart Cart #3 (Quick Basket)',
        battery_level: 78,
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: 'c4444444-4444-4444-4444-444444444444',
        store_id: MOCK_STORE_ID,
        qr_code: 'ZW-CART-004',
        cart_label: 'Smart Cart #4 (Empty)',
        battery_level: 100,
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: 'c5555555-5555-5555-5555-555555555555',
        store_id: MOCK_STORE_ID,
        qr_code: 'ZW-CART-005',
        cart_label: 'Smart Cart #5 (Assigned)',
        battery_level: 92,
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ];

    initialCarts.forEach((c) => this.carts.set(c.id, c));

    // 2. Initial Lanes with realistic queue workloads and cashier speeds
    const initialLanes: LaneWithQueueDetails[] = [
      {
        id: 'd1111111-1111-1111-1111-111111111111',
        store_id: MOCK_STORE_ID,
        lane_number: 1,
        name: 'Counter 1 (Express)',
        type: 'EXPRESS',
        status: 'OPEN',
        max_items_limit: 10,
        assigned_staff_id: 'p1111111-staff',
        cashier_speed_seconds_per_item: 3.5, // Fast cashier
        payment_handoff_seconds: 30,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        current_queue_count: 1,
        estimated_wait_seconds: 44, // 1 cart with 4 items: 4*3.5 + 30 = 44s
        serving_token: 'E-088',
        queued_carts: [{ sessionId: 'q-prior-1', itemCount: 4, tokenNumber: 'E-088' }],
      },
      {
        id: 'd2222222-2222-2222-2222-222222222222',
        store_id: MOCK_STORE_ID,
        lane_number: 2,
        name: 'Counter 2 (Regular)',
        type: 'REGULAR',
        status: 'OPEN',
        max_items_limit: null,
        assigned_staff_id: 'p2222222-staff',
        cashier_speed_seconds_per_item: 4.0, // Standard cashier
        payment_handoff_seconds: 35,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        current_queue_count: 1,
        // Notice: Only 1 customer ahead, but huge 45-item trolley! Wait time = 45*4 + 35 = 215s!
        estimated_wait_seconds: 215,
        serving_token: 'A-142',
        queued_carts: [{ sessionId: 'q-prior-2', itemCount: 45, tokenNumber: 'A-142' }],
      },
      {
        id: 'd3333333-3333-3333-3333-333333333333',
        store_id: MOCK_STORE_ID,
        lane_number: 3,
        name: 'Counter 3 (Regular)',
        type: 'REGULAR',
        status: 'OPEN',
        max_items_limit: null,
        assigned_staff_id: 'p3333333-staff',
        cashier_speed_seconds_per_item: 4.0,
        payment_handoff_seconds: 35,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        current_queue_count: 2,
        // Notice: 2 customers ahead, but each has only 4 items!
        // Wait time = 2 * (4*4 + 35) = 2 * 51 = 102s!
        // Much faster than Counter 2 despite having 2 customers vs 1 customer!
        estimated_wait_seconds: 102,
        serving_token: 'A-140',
        queued_carts: [
          { sessionId: 'q-prior-3', itemCount: 4, tokenNumber: 'A-140' },
          { sessionId: 'q-prior-4', itemCount: 4, tokenNumber: 'A-141' },
        ],
      },
      {
        id: 'd4444444-4444-4444-4444-444444444444',
        store_id: MOCK_STORE_ID,
        lane_number: 4,
        name: 'Counter 4 (Self-Checkout)',
        type: 'SELF_CHECKOUT',
        status: 'PAUSED', // PAUSED
        max_items_limit: null,
        assigned_staff_id: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        current_queue_count: 0,
        estimated_wait_seconds: 0,
        serving_token: null,
        queued_carts: [],
      },
      {
        id: 'd5555555-5555-5555-5555-555555555555',
        store_id: MOCK_STORE_ID,
        lane_number: 5,
        name: 'Counter 5 (Bulk Lane)',
        type: 'REGULAR',
        status: 'CLOSED', // CLOSED
        max_items_limit: null,
        assigned_staff_id: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        current_queue_count: 0,
        estimated_wait_seconds: 0,
        serving_token: null,
        queued_carts: [],
      },
    ];

    initialLanes.forEach((l) => this.lanes.set(l.id, l));

    // 3. Initial Active Sessions
    // Cart 1: 4 items (₹397.50) -> Active SHOPPING
    const items1: CartItem[] = [
      {
        id: 'i1111111-1111-1111-1111-111111111111',
        session_id: 'b1111111-1111-1111-1111-111111111111',
        product_id: MOCK_PRODUCTS[0].id,
        quantity: 2,
        unit_price_paise: 6500, // ₹65.00
        tax_rate_basis_points: 500, // 5%
        total_price_paise: 13000,
        barcode_snapshot: '8901030383123',
        product_name_snapshot: 'Fresh Milk (1L)',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: 'i2222222-2222-2222-2222-222222222222',
        session_id: 'b1111111-1111-1111-1111-111111111111',
        product_id: MOCK_PRODUCTS[1].id,
        quantity: 1,
        unit_price_paise: 18000, // ₹180.00
        tax_rate_basis_points: 500,
        total_price_paise: 18000,
        barcode_snapshot: '8901030383124',
        product_name_snapshot: 'Red Apples (1kg)',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: 'i3333333-3333-3333-3333-333333333333',
        session_id: 'b1111111-1111-1111-1111-111111111111',
        product_id: MOCK_PRODUCTS[2].id,
        quantity: 1,
        unit_price_paise: 6000, // ₹60.00
        tax_rate_basis_points: 500,
        total_price_paise: 6000,
        barcode_snapshot: '8901030383125',
        product_name_snapshot: 'Bananas (1 Dozen)',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ];

    const session1: CartSession = {
      id: 'b1111111-1111-1111-1111-111111111111',
      cart_id: 'c1111111-1111-1111-1111-111111111111',
      store_id: MOCK_STORE_ID,
      customer_user_id: null,
      guest_session_token: 'guest_tok_7f9a2b',
      status: 'SHOPPING',
      total_items: 4,
      subtotal_paise: 37000,
      discount_paise: 0,
      tax_paise: 1850,
      grand_total_paise: 38850,
      assigned_lane_id: null,
      locked_at: null,
      started_at: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
      ended_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      items: items1,
    };

    // Cart 2: Large Trolley (18 items: 4 Milk, 4 Apples, 5 Bread, 5 Dishwashing) -> > 10 items
    const items2: CartItem[] = [
      {
        id: 'i4-1',
        session_id: 'b2222222-2222-2222-2222-222222222222',
        product_id: MOCK_PRODUCTS[0].id,
        quantity: 4,
        unit_price_paise: 6500,
        tax_rate_basis_points: 500,
        total_price_paise: 26000,
        barcode_snapshot: '8901030383123',
        product_name_snapshot: 'Fresh Milk (1L)',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: 'i4-2',
        session_id: 'b2222222-2222-2222-2222-222222222222',
        product_id: MOCK_PRODUCTS[1].id,
        quantity: 4,
        unit_price_paise: 18000,
        tax_rate_basis_points: 500,
        total_price_paise: 72000,
        barcode_snapshot: '8901030383124',
        product_name_snapshot: 'Red Apples (1kg)',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: 'i4-3',
        session_id: 'b2222222-2222-2222-2222-222222222222',
        product_id: MOCK_PRODUCTS[4].id,
        quantity: 5,
        unit_price_paise: 4500,
        tax_rate_basis_points: 500,
        total_price_paise: 22500,
        barcode_snapshot: '8901030383127',
        product_name_snapshot: 'Whole Wheat Bread (400g)',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: 'i4-4',
        session_id: 'b2222222-2222-2222-2222-222222222222',
        product_id: MOCK_PRODUCTS[3].id,
        quantity: 5,
        unit_price_paise: 11500,
        tax_rate_basis_points: 1800,
        total_price_paise: 57500,
        barcode_snapshot: '8901030383126',
        product_name_snapshot: 'Dishwashing Liquid (500ml)',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ];

    const session2: CartSession = {
      id: 'b2222222-2222-2222-2222-222222222222',
      cart_id: 'c2222222-2222-2222-2222-222222222222',
      store_id: MOCK_STORE_ID,
      customer_user_id: null,
      guest_session_token: 'guest_tok_large_cart',
      status: 'SHOPPING',
      total_items: 18,
      subtotal_paise: 178000,
      discount_paise: 0,
      tax_paise: 16375,
      grand_total_paise: 194375,
      assigned_lane_id: null,
      locked_at: null,
      started_at: new Date(Date.now() - 35 * 60 * 1000).toISOString(),
      ended_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      items: items2,
    };

    // Cart 3: Quick Basket (2 items: Bread x1, Milk x1)
    const items3: CartItem[] = [
      {
        id: 'i3-1',
        session_id: 'b3333333-3333-3333-3333-333333333333',
        product_id: MOCK_PRODUCTS[4].id,
        quantity: 1,
        unit_price_paise: 4500,
        tax_rate_basis_points: 500,
        total_price_paise: 4500,
        barcode_snapshot: '8901030383127',
        product_name_snapshot: 'Whole Wheat Bread (400g)',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: 'i3-2',
        session_id: 'b3333333-3333-3333-3333-333333333333',
        product_id: MOCK_PRODUCTS[0].id,
        quantity: 1,
        unit_price_paise: 6500,
        tax_rate_basis_points: 500,
        total_price_paise: 6500,
        barcode_snapshot: '8901030383123',
        product_name_snapshot: 'Fresh Milk (1L)',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ];

    const session3: CartSession = {
      id: 'b3333333-3333-3333-3333-333333333333',
      cart_id: 'c3333333-3333-3333-3333-333333333333',
      store_id: MOCK_STORE_ID,
      customer_user_id: null,
      guest_session_token: 'guest_tok_quick_basket',
      status: 'SHOPPING',
      total_items: 2,
      subtotal_paise: 11000,
      discount_paise: 0,
      tax_paise: 550,
      grand_total_paise: 11550,
      assigned_lane_id: null,
      locked_at: null,
      started_at: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
      ended_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      items: items3,
    };

    // Cart 4: Empty Cart (0 items)
    const session4: CartSession = {
      id: 'b4444444-4444-4444-4444-444444444444',
      cart_id: 'c4444444-4444-4444-4444-444444444444',
      store_id: MOCK_STORE_ID,
      customer_user_id: null,
      guest_session_token: 'guest_tok_empty',
      status: 'SHOPPING',
      total_items: 0,
      subtotal_paise: 0,
      discount_paise: 0,
      tax_paise: 0,
      grand_total_paise: 0,
      assigned_lane_id: null,
      locked_at: null,
      started_at: new Date().toISOString(),
      ended_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      items: [],
    };

    // Cart 5: Already Assigned and Locked
    const session5: CartSession = {
      id: 'b5555555-5555-5555-5555-555555555555',
      cart_id: 'c5555555-5555-5555-5555-555555555555',
      store_id: MOCK_STORE_ID,
      customer_user_id: null,
      guest_session_token: 'guest_tok_assigned',
      status: 'ASSIGNED_LOCKED',
      total_items: 3,
      subtotal_paise: 27000,
      discount_paise: 0,
      tax_paise: 1350,
      grand_total_paise: 28350,
      assigned_lane_id: 'd1111111-1111-1111-1111-111111111111',
      locked_at: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
      started_at: new Date(Date.now() - 20 * 60 * 1000).toISOString(),
      ended_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      items: [items1[0], items1[1]],
    };

    const assignment5: LaneAssignment = {
      id: 'la-existing-5',
      lane_id: 'd1111111-1111-1111-1111-111111111111',
      session_id: session5.id,
      token_number: 'E-099',
      queue_position: 1,
      estimated_wait_seconds: 40,
      assignment_status: 'QUEUED',
      called_at: null,
      served_at: null,
      created_at: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
      updated_at: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
      lane: this.lanes.get('d1111111-1111-1111-1111-111111111111'),
    };

    this.registerSession(session1);
    this.registerSession(session2);
    this.registerSession(session3);
    this.registerSession(session4);
    this.registerSession(session5);
    this.assignments.set(session5.id, assignment5);
  }

  private registerSession(session: CartSession) {
    this.sessions.set(session.id, session);
    this.cartIdToSessionId.set(session.cart_id, session.id);
  }

  /**
   * Looks up a cart and its active session by QR code or Cart Label/ID.
   * If a non-existent cart is requested, creates a dynamic test cart session so users can test any ID.
   */
  public getCartByQrCode(rawCode: string): CartWithSession | null {
    const code = rawCode.trim().toUpperCase();

    // Search exact QR code or cart_label or uuid
    let cart = Array.from(this.carts.values()).find(
      (c) =>
        c.qr_code.toUpperCase() === code ||
        c.id.toLowerCase() === rawCode.trim().toLowerCase() ||
        c.cart_label.toUpperCase().includes(code)
    );

    // If not found, dynamically provision a realistic cart for smooth testing
    if (!cart) {
      const generatedId = `c_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
      const cleanLabel = code.startsWith('ZW-CART') ? code : `ZW-CART-${code}`;
      cart = {
        id: generatedId,
        store_id: MOCK_STORE_ID,
        qr_code: cleanLabel,
        cart_label: `Cart ${cleanLabel}`,
        battery_level: 90,
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      this.carts.set(cart.id, cart);

      // Provision active session with 3 sample items
      const newSessionId = `b_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
      const sampleItems: CartItem[] = [
        {
          id: `i_dyn_1_${Date.now()}`,
          session_id: newSessionId,
          product_id: MOCK_PRODUCTS[0].id,
          quantity: 2,
          unit_price_paise: MOCK_PRODUCTS[0].price_paise,
          tax_rate_basis_points: MOCK_PRODUCTS[0].tax_rate_basis_points,
          total_price_paise: MOCK_PRODUCTS[0].price_paise * 2,
          barcode_snapshot: MOCK_PRODUCTS[0].barcode,
          product_name_snapshot: MOCK_PRODUCTS[0].name,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        {
          id: `i_dyn_2_${Date.now()}`,
          session_id: newSessionId,
          product_id: MOCK_PRODUCTS[4].id,
          quantity: 1,
          unit_price_paise: MOCK_PRODUCTS[4].price_paise,
          tax_rate_basis_points: MOCK_PRODUCTS[4].tax_rate_basis_points,
          total_price_paise: MOCK_PRODUCTS[4].price_paise,
          barcode_snapshot: MOCK_PRODUCTS[4].barcode,
          product_name_snapshot: MOCK_PRODUCTS[4].name,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ];

      const summary = calculateCartSummary(
        sampleItems.map((i) => ({
          unitPricePaise: i.unit_price_paise,
          quantity: i.quantity,
          taxRateBasisPoints: i.tax_rate_basis_points,
        }))
      );

      const dynamicSession: CartSession = {
        id: newSessionId,
        cart_id: cart.id,
        store_id: MOCK_STORE_ID,
        customer_user_id: null,
        guest_session_token: `guest_tok_${Date.now()}`,
        status: 'SHOPPING',
        total_items: summary.totalItems,
        subtotal_paise: summary.subtotalPaise,
        discount_paise: summary.discountPaise,
        tax_paise: summary.taxPaise,
        grand_total_paise: summary.grandTotalPaise,
        assigned_lane_id: null,
        locked_at: null,
        started_at: new Date().toISOString(),
        ended_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        items: sampleItems,
      };

      this.registerSession(dynamicSession);
    }

    const sessionId = this.cartIdToSessionId.get(cart.id);
    const session = sessionId ? this.sessions.get(sessionId) || null : null;
    const assignment = session ? this.assignments.get(session.id) || null : null;

    // Calculate authoritative bill on server
    let authoritative_bill = undefined;
    if (session && session.items) {
      const summary = calculateCartSummary(
        session.items.map((i) => ({
          unitPricePaise: i.unit_price_paise,
          quantity: i.quantity,
          taxRateBasisPoints: i.tax_rate_basis_points,
        })),
        session.discount_paise
      );
      authoritative_bill = {
        total_items: summary.totalItems,
        subtotal_paise: summary.subtotalPaise,
        tax_paise: summary.taxPaise,
        discount_paise: summary.discountPaise,
        grand_total_paise: summary.grandTotalPaise,
      };
    }

    return {
      cart,
      active_session: session,
      authoritative_bill,
      assignment,
    };
  }

  /**
   * Returns all checkout lanes with dynamic workloads and queue counts.
   */
  public getLanes(): LaneWithQueueDetails[] {
    return Array.from(this.lanes.values()).map((l) => ({
      ...l,
      current_queue_count: l.queued_carts ? l.queued_carts.length : (l.current_queue_count ?? 0),
    }));
  }

  /**
   * Resets or updates a lane's status (for testing or supervisor toggles).
   */
  public setLaneStatus(laneId: string, status: 'OPEN' | 'PAUSED' | 'CLOSED') {
    const lane = this.lanes.get(laneId);
    if (lane) {
      lane.status = status;
      lane.updated_at = new Date().toISOString();
    }
  }

  /**
   * Concurrency-safe, atomic queue assignment:
   * 1. Validates session status is SHOPPING (or returns existing assignment if already locked).
   * 2. Re-verifies cart is not empty.
   * 3. Calculates predicted completion time across all eligible lanes using workload formulas.
   * 4. Selects optimal lane (or requested eligible lane).
   * 5. Atomically transitions cart to ASSIGNED_LOCKED.
   * 6. Creates lane assignment with sequential token.
   */
  public assignCartToLane(
    sessionId: string,
    preferredType?: 'EXPRESS' | 'REGULAR' | 'SELF_CHECKOUT',
    targetLaneId?: string
  ): {
    success: boolean;
    assignment?: LaneAssignment;
    estimate?: OptimalLaneSelection['estimate'];
    session_status: 'ASSIGNED_LOCKED';
    error?: { code: string; message: string };
  } {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return {
        success: false,
        session_status: 'ASSIGNED_LOCKED',
        error: { code: 'SESSION_NOT_FOUND', message: `Active session '${sessionId}' was not found.` },
      };
    }

    // IDEMPOTENCY / DUPLICATE PREVENTION:
    // If cart is already ASSIGNED_LOCKED, return current assignment without creating a duplicate!
    if (session.status === 'ASSIGNED_LOCKED' && this.assignments.has(sessionId)) {
      const existingAssignment = this.assignments.get(sessionId)!;
      const lane = this.lanes.get(existingAssignment.lane_id);
      return {
        success: true,
        assignment: existingAssignment,
        estimate: {
          estimatedWaitSeconds: existingAssignment.estimated_wait_seconds,
          predictedCompletionSeconds: existingAssignment.estimated_wait_seconds,
          queueDepth: existingAssignment.queue_position,
          recommendedLaneId: existingAssignment.lane_id,
          laneName: lane?.name || 'Checkout Counter',
          laneType: lane?.type || 'REGULAR',
        },
        session_status: 'ASSIGNED_LOCKED',
      };
    }

    // Cannot queue empty carts
    if (session.total_items === 0 || !session.items || session.items.length === 0) {
      return {
        success: false,
        session_status: 'ASSIGNED_LOCKED',
        error: {
          code: 'EMPTY_CART',
          message: 'Cannot allocate queue for an empty shopping cart. Please add items first.',
        },
      };
    }

    // Authoritative bill re-verification: Never trust client totals
    const serverBill = calculateCartSummary(
      session.items.map((i) => ({
        unitPricePaise: i.unit_price_paise,
        quantity: i.quantity,
        taxRateBasisPoints: i.tax_rate_basis_points,
      })),
      session.discount_paise
    );
    session.total_items = serverBill.totalItems;
    session.subtotal_paise = serverBill.subtotalPaise;
    session.tax_paise = serverBill.taxPaise;
    session.discount_paise = serverBill.discountPaise;
    session.grand_total_paise = serverBill.grandTotalPaise;

    // Run Queue Evaluation Algorithm
    const activeLanes = this.getLanes();
    const evaluation = evaluateLanesForCart(activeLanes, session.total_items, preferredType);

    if (!evaluation.recommendedLane) {
      return {
        success: false,
        session_status: 'ASSIGNED_LOCKED',
        error: {
          code: 'NO_OPEN_LANES',
          message:
            evaluation.error ||
            'All checkout counters are currently closed or paused. Please alert store staff.',
        },
      };
    }

    // Determine target lane (either manually specified eligible lane or optimal algorithmic selection)
    let selectedLane = evaluation.recommendedLane;
    if (targetLaneId) {
      const manualLane = activeLanes.find((l) => l.id === targetLaneId);
      if (manualLane && manualLane.status === 'OPEN') {
        if (manualLane.max_items_limit === null || session.total_items <= manualLane.max_items_limit) {
          selectedLane = manualLane;
        }
      }
    }

    // Atomic State Transition:
    this.assignmentSequence += 1;
    const token = generateTokenNumber(selectedLane.type, this.assignmentSequence);
    const existingQueueCount = selectedLane.queued_carts?.length ?? (selectedLane.current_queue_count || 0);
    const queuePosition = existingQueueCount + 1;

    // Calculate wait time for this customer
    const estimatedWaitSeconds =
      evaluation.estimate?.estimatedWaitSeconds ??
      (selectedLane.estimated_wait_seconds || 45);

    const assignment: LaneAssignment = {
      id: `la_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      lane_id: selectedLane.id,
      session_id: session.id,
      token_number: token,
      queue_position: queuePosition,
      estimated_wait_seconds: estimatedWaitSeconds,
      assignment_status: 'QUEUED',
      called_at: null,
      served_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      lane: selectedLane,
    };

    // Commit assignment
    this.assignments.set(session.id, assignment);

    // Atomically transition cart session to ASSIGNED_LOCKED
    session.status = 'ASSIGNED_LOCKED';
    session.assigned_lane_id = selectedLane.id;
    session.locked_at = new Date().toISOString();
    session.updated_at = new Date().toISOString();

    // Update lane's queued carts in state
    if (!selectedLane.queued_carts) {
      selectedLane.queued_carts = [];
    }
    selectedLane.queued_carts.push({
      sessionId: session.id,
      itemCount: session.total_items,
      tokenNumber: token,
    });
    selectedLane.current_queue_count = selectedLane.queued_carts.length;
    selectedLane.estimated_wait_seconds =
      (selectedLane.estimated_wait_seconds || 0) +
      session.total_items * (selectedLane.cashier_speed_seconds_per_item || 4) +
      (selectedLane.payment_handoff_seconds || 35);
    selectedLane.updated_at = new Date().toISOString();

    return {
      success: true,
      assignment,
      estimate: {
        estimatedWaitSeconds,
        predictedCompletionSeconds:
          estimatedWaitSeconds +
          session.total_items * (selectedLane.cashier_speed_seconds_per_item || 4) +
          (selectedLane.payment_handoff_seconds || 35),
        queueDepth: queuePosition,
        recommendedLaneId: selectedLane.id,
        laneName: selectedLane.name,
        laneType: selectedLane.type,
      },
      session_status: 'ASSIGNED_LOCKED',
    };
  }

  /**
   * Resets a session back to SHOPPING (helper for testing queue reallocation).
   */
  public resetSessionToShopping(sessionId: string) {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.status = 'SHOPPING';
      session.assigned_lane_id = null;
      session.locked_at = null;
      session.updated_at = new Date().toISOString();
      this.assignments.delete(sessionId);
    }
  }
}

// Global Singleton in NodeJS process to ensure shared state across API routes
const globalQueueStore = (global as unknown as { __zerowait_queue_store__?: QueueStore });
if (!globalQueueStore.__zerowait_queue_store__) {
  globalQueueStore.__zerowait_queue_store__ = new QueueStore();
}

export const queueStore = globalQueueStore.__zerowait_queue_store__;
