/**
 * ZeroWait — Authoritative Cart Service
 * 
 * Manages shopping sessions, cart items, server-calculated authoritative bills,
 * and lock state in PostgreSQL via Supabase.
 */

import { createAdminClient } from '../supabase/admin.ts';
import { isSupabaseConfigured, getMissingSupabaseConfigMessage } from '../supabase/config.ts';
import { calculateCartSummary } from '../engine/pricing.ts';
import { queueStore } from './queueStore.ts';
import type { Cart, CartSession, CartItem, LaneAssignment, Lane } from '../../types/domain';
import { getBarcodeVariants } from '../engine/barcode.ts';

export interface CartRetrievalResult {
  cart: Cart | null;
  active_session: CartSession | null;
  error?: string;
  configMissing?: boolean;
}

export interface ScanProductResult {
  success: boolean;
  session?: CartSession;
  scanned_item?: CartItem;
  error?: {
    code: string;
    message: string;
  };
}

export interface UpdateItemResult {
  success: boolean;
  session?: CartSession;
  updated_item?: CartItem | null;
  error?: {
    code: string;
    message: string;
  };
}

/**
 * Retrieves physical cart and its active shopping session from Supabase.
 * If the physical cart is active but has no open session, creates a new SHOPPING session.
 */
export async function getCartAndActiveSession(qrCode: string): Promise<CartRetrievalResult> {
  const cleanCode = qrCode.trim();
  if (!cleanCode) {
    return { cart: null, active_session: null, error: 'QR Code cannot be empty.' };
  }

  if (!isSupabaseConfigured()) {
    if (process.env.NODE_ENV === 'test' || process.env.ALLOW_LOCAL_DEV_STORE === 'true') {
      const mockResult = queueStore.getCartByQrCode(cleanCode);
      return { cart: mockResult?.cart || null, active_session: mockResult?.active_session || null };
    }
    return {
      cart: null,
      active_session: null,
      error: getMissingSupabaseConfigMessage(),
      configMissing: true,
    };
  }

  try {
    const supabase = createAdminClient();

    // 1. Retrieve registered physical cart by permanent QR identifier
    const { data: cartData, error: cartError } = await supabase
      .from('carts')
      .select('*')
      .eq('qr_code', cleanCode)
      .eq('is_active', true)
      .maybeSingle();

    if (cartError) {
      throw new Error(`Database error querying cart '${cleanCode}': ${cartError.message}`);
    }

    if (!cartData) {
      return { cart: null, active_session: null };
    }

    const cart = cartData as Cart;

    // 2. Retrieve or resume active shopping session
    const { data: sessionData, error: sessionError } = await supabase
      .from('cart_sessions')
      .select('*')
      .eq('cart_id', cart.id)
      .in('status', ['SHOPPING', 'ASSIGNED_LOCKED', 'AT_CHECKOUT', 'PAYMENT_PENDING'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (sessionError) {
      throw new Error(`Database error querying session for cart '${cleanCode}': ${sessionError.message}`);
    }

    let activeSession = sessionData as CartSession | null;

    // If no active session exists, start a new shopping session for this cart
    if (!activeSession) {
      const { data: newSession, error: createError } = await supabase
        .from('cart_sessions')
        .insert({
          cart_id: cart.id,
          store_id: cart.store_id,
          status: 'SHOPPING',
          total_items: 0,
          subtotal_paise: 0,
          discount_paise: 0,
          tax_paise: 0,
          grand_total_paise: 0,
        })
        .select('*')
        .single();

      if (createError) {
        throw new Error(`Failed to initialize shopping session: ${createError.message}`);
      }

      activeSession = newSession as CartSession;
      activeSession.items = [];
    } else {
      // 3. Fetch cart items for active session
      const { data: itemsData, error: itemsError } = await supabase
        .from('cart_items')
        .select('*')
        .eq('session_id', activeSession.id)
        .order('created_at', { ascending: true });

      if (itemsError) {
        throw new Error(`Failed to fetch cart items: ${itemsError.message}`);
      }

      activeSession.items = (itemsData as CartItem[]) || [];

      // 4. If assigned/locked, fetch assigned lane information
      if (activeSession.assigned_lane_id) {
        const { data: laneData } = await supabase
          .from('lanes')
          .select('*')
          .eq('id', activeSession.assigned_lane_id)
          .maybeSingle();

        if (laneData) {
          activeSession.assigned_lane = laneData as Lane;
        }
      }
    }

    return { cart, active_session: activeSession };
  } catch (err) {
    return {
      cart: null,
      active_session: null,
      error: err instanceof Error ? err.message : 'Unknown cart retrieval error.',
    };
  }
}

/**
 * Authoritatively scans a barcode into a cart session in Supabase.
 * - Searches products table
 * - Validates stock
 * - Upserts cart_items
 * - Recalculates authoritative bill on server
 * - Updates cart_sessions
 */
export async function scanProductToCart(
  sessionId: string,
  barcode: string,
  quantity: number = 1
): Promise<ScanProductResult> {
  const barcodeVariants = getBarcodeVariants(barcode);

  if (!isSupabaseConfigured()) {
    if (process.env.NODE_ENV === 'test' || process.env.ALLOW_LOCAL_DEV_STORE === 'true') {
      const session = queueStore.getSessionById(sessionId);
      if (!session) {
        return { success: false, error: { code: 'SESSION_NOT_FOUND', message: 'Session not found.' } };
      }
      if (session.status !== 'SHOPPING') {
        return {
          success: false,
          error: { code: 'SESSION_LOCKED', message: `Cannot scan items while session status is '${session.status}'.` },
        };
      }
      const product = (await import('./mockData')).MOCK_PRODUCTS.find(
        (p) => barcodeVariants.includes(p.barcode) && p.is_active
      );
      if (!product) {
        return {
          success: false,
          error: { code: 'PRODUCT_NOT_FOUND', message: `No active product found for barcode: ${barcode}` },
        };
      }
      const existingItems = [...(session.items || [])];
      const idx = existingItems.findIndex((i) => i.product_id === product.id);
      let scannedItem: CartItem;
      if (idx >= 0) {
        const prev = existingItems[idx];
        const newQty = prev.quantity + quantity;
        scannedItem = {
          ...prev,
          quantity: newQty,
          total_price_paise: prev.unit_price_paise * newQty,
          updated_at: new Date().toISOString(),
        };
        existingItems[idx] = scannedItem;
      } else {
        scannedItem = {
          id: `item_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          session_id: sessionId,
          product_id: product.id,
          quantity,
          unit_price_paise: product.price_paise,
          tax_rate_basis_points: product.tax_rate_basis_points,
          total_price_paise: product.price_paise * quantity,
          barcode_snapshot: product.barcode,
          product_name_snapshot: product.name,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        existingItems.push(scannedItem);
      }
      const calc = calculateCartSummary(
        existingItems.map((i) => ({
          unitPricePaise: i.unit_price_paise,
          quantity: i.quantity,
          taxRateBasisPoints: i.tax_rate_basis_points,
        })),
        session.discount_paise
      );
      const updated = queueStore.updateSessionItems(sessionId, existingItems, {
        total_items: calc.totalItems,
        subtotal_paise: calc.subtotalPaise,
        tax_paise: calc.taxPaise,
        discount_paise: calc.discountPaise,
        grand_total_paise: calc.grandTotalPaise,
      });
      return { success: true, session: updated, scanned_item: scannedItem };
    }

    return {
      success: false,
      error: { code: 'SUPABASE_NOT_CONFIGURED', message: getMissingSupabaseConfigMessage() },
    };
  }

  try {
    const supabase = createAdminClient();

    // 1. Fetch live session
    const { data: sessionData, error: sessionErr } = await supabase
      .from('cart_sessions')
      .select('*')
      .eq('id', sessionId)
      .maybeSingle();

    if (sessionErr || !sessionData) {
      return {
        success: false,
        error: { code: 'SESSION_NOT_FOUND', message: `Shopping session '${sessionId}' was not found.` },
      };
    }

    const session = sessionData as CartSession;

    // 2. Guard: Cannot scan if cart is ASSIGNED_LOCKED or beyond SHOPPING
    if (session.status !== 'SHOPPING') {
      return {
        success: false,
        error: {
          code: 'SESSION_LOCKED',
          message: `Cannot scan items while session status is '${session.status}'. Cart is locked for checkout.`,
        },
      };
    }

    // 3. Authoritative product lookup in store catalogue across barcode variants
    const { data: productData, error: prodErr } = await supabase
      .from('products')
      .select('*')
      .in('barcode', barcodeVariants)
      .eq('store_id', session.store_id)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();

    if (prodErr || !productData) {
      return {
        success: false,
        error: {
          code: 'PRODUCT_NOT_FOUND',
          message: `Product with barcode '${barcode}' is not registered in the store catalogue.`,
        },
      };
    }

    const product = productData as {
      id: string;
      barcode: string;
      name: string;
      price_paise: number;
      tax_rate_basis_points: number;
      stock_quantity: number;
    };

    if (product.stock_quantity < quantity) {
      return {
        success: false,
        error: {
          code: 'INSUFFICIENT_STOCK',
          message: `Requested quantity exceeds available stock (${product.stock_quantity} available).`,
        },
      };
    }

    // 4. Check for existing line item in cart_items
    const { data: existingItemData } = await supabase
      .from('cart_items')
      .select('*')
      .eq('session_id', sessionId)
      .eq('product_id', product.id)
      .maybeSingle();

    let scannedItem: CartItem;

    if (existingItemData) {
      const existing = existingItemData as CartItem;
      const newQty = existing.quantity + quantity;
      const newTotal = existing.unit_price_paise * newQty;

      const { data: updatedItem, error: updateErr } = await supabase
        .from('cart_items')
        .update({
          quantity: newQty,
          total_price_paise: newTotal,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
        .select('*')
        .single();

      if (updateErr || !updatedItem) {
        throw new Error(`Failed to update item quantity: ${updateErr?.message}`);
      }
      scannedItem = updatedItem as CartItem;
    } else {
      const itemSubtotal = product.price_paise * quantity;
      const { data: newItem, error: insertErr } = await supabase
        .from('cart_items')
        .insert({
          session_id: sessionId,
          product_id: product.id,
          quantity,
          unit_price_paise: product.price_paise,
          tax_rate_basis_points: product.tax_rate_basis_points,
          total_price_paise: itemSubtotal,
          barcode_snapshot: product.barcode,
          product_name_snapshot: product.name,
        })
        .select('*')
        .single();

      if (insertErr || !newItem) {
        throw new Error(`Failed to add item to cart: ${insertErr?.message}`);
      }
      scannedItem = newItem as CartItem;
    }

    // 5. Query all cart items to compute authoritative server bill
    const { data: allItemsData, error: fetchAllErr } = await supabase
      .from('cart_items')
      .select('*')
      .eq('session_id', sessionId);

    if (fetchAllErr) {
      throw new Error(`Failed to fetch cart items for bill calculation: ${fetchAllErr.message}`);
    }

    const allItems = (allItemsData as CartItem[]) || [];

    // 6. Check applicable discount rules
    const { data: discountRules } = await supabase
      .from('discount_rules')
      .select('*')
      .eq('store_id', session.store_id)
      .eq('is_active', true);

    let calculatedDiscountPaise = 0;
    const subtotalRaw = allItems.reduce((sum, item) => sum + item.total_price_paise, 0);

    if (discountRules && discountRules.length > 0) {
      for (const rule of discountRules) {
        if (subtotalRaw >= rule.min_cart_value_paise) {
          if (rule.discount_type === 'FLAT_AMOUNT') {
            calculatedDiscountPaise = Math.max(calculatedDiscountPaise, rule.discount_value);
          } else if (rule.discount_type === 'PERCENTAGE') {
            const disc = Math.round((subtotalRaw * rule.discount_value) / 10000);
            const capped = rule.max_discount_paise ? Math.min(disc, rule.max_discount_paise) : disc;
            calculatedDiscountPaise = Math.max(calculatedDiscountPaise, capped);
          }
        }
      }
    }

    const billSummary = calculateCartSummary(
      allItems.map((i) => ({
        unitPricePaise: i.unit_price_paise,
        quantity: i.quantity,
        taxRateBasisPoints: i.tax_rate_basis_points,
      })),
      calculatedDiscountPaise
    );

    // 7. Update cart_sessions with authoritative totals
    const { data: updatedSessionData, error: updateSessionErr } = await supabase
      .from('cart_sessions')
      .update({
        total_items: billSummary.totalItems,
        subtotal_paise: billSummary.subtotalPaise,
        tax_paise: billSummary.taxPaise,
        discount_paise: billSummary.discountPaise,
        grand_total_paise: billSummary.grandTotalPaise,
        updated_at: new Date().toISOString(),
      })
      .eq('id', sessionId)
      .select('*')
      .single();

    if (updateSessionErr || !updatedSessionData) {
      throw new Error(`Failed to update session totals: ${updateSessionErr?.message}`);
    }

    const updatedSession = updatedSessionData as CartSession;
    updatedSession.items = allItems;

    return {
      success: true,
      session: updatedSession,
      scanned_item: scannedItem,
    };
  } catch (err) {
    return {
      success: false,
      error: {
        code: 'SCAN_FAILED',
        message: err instanceof Error ? err.message : 'Product scan operation failed.',
      },
    };
  }
}

/**
 * Updates item quantity or removes item (quantity=0) in Supabase.
 */
export async function updateCartItemQuantity(
  sessionId: string,
  itemId: string,
  quantity: number
): Promise<UpdateItemResult> {
  if (!isSupabaseConfigured()) {
    if (process.env.NODE_ENV === 'test' || process.env.ALLOW_LOCAL_DEV_STORE === 'true') {
      const session = queueStore.getSessionById(sessionId);
      if (!session) {
        return { success: false, error: { code: 'SESSION_NOT_FOUND', message: 'Session not found.' } };
      }
      if (session.status !== 'SHOPPING') {
        return { success: false, error: { code: 'SESSION_LOCKED', message: 'Session is locked.' } };
      }
      const existingItems = [...(session.items || [])];
      const idx = existingItems.findIndex((i) => i.id === itemId);
      if (idx === -1) {
        return { success: false, error: { code: 'ITEM_NOT_FOUND', message: 'Item not found in session.' } };
      }
      let updatedItem: CartItem | null = null;
      if (quantity === 0) {
        existingItems.splice(idx, 1);
      } else {
        const target = existingItems[idx];
        updatedItem = {
          ...target,
          quantity,
          total_price_paise: target.unit_price_paise * quantity,
          updated_at: new Date().toISOString(),
        };
        existingItems[idx] = updatedItem;
      }
      const calc = calculateCartSummary(
        existingItems.map((i) => ({
          unitPricePaise: i.unit_price_paise,
          quantity: i.quantity,
          taxRateBasisPoints: i.tax_rate_basis_points,
        })),
        session.discount_paise
      );
      const updated = queueStore.updateSessionItems(sessionId, existingItems, {
        total_items: calc.totalItems,
        subtotal_paise: calc.subtotalPaise,
        tax_paise: calc.taxPaise,
        discount_paise: calc.discountPaise,
        grand_total_paise: calc.grandTotalPaise,
      });
      return { success: true, session: updated, updated_item: updatedItem };
    }

    return {
      success: false,
      error: { code: 'SUPABASE_NOT_CONFIGURED', message: getMissingSupabaseConfigMessage() },
    };
  }

  try {
    const supabase = createAdminClient();

    // 1. Fetch session
    const { data: sessionData, error: sessionErr } = await supabase
      .from('cart_sessions')
      .select('*')
      .eq('id', sessionId)
      .maybeSingle();

    if (sessionErr || !sessionData) {
      return { success: false, error: { code: 'SESSION_NOT_FOUND', message: 'Session not found.' } };
    }

    const session = sessionData as CartSession;
    if (session.status !== 'SHOPPING') {
      return {
        success: false,
        error: { code: 'SESSION_LOCKED', message: `Cannot modify cart items while status is '${session.status}'.` },
      };
    }

    // 2. Fetch the target item
    const { data: targetItemData, error: targetErr } = await supabase
      .from('cart_items')
      .select('*')
      .eq('id', itemId)
      .eq('session_id', sessionId)
      .maybeSingle();

    if (targetErr || !targetItemData) {
      return { success: false, error: { code: 'ITEM_NOT_FOUND', message: 'Cart item not found in this session.' } };
    }

    const targetItem = targetItemData as CartItem;
    let updatedItem: CartItem | null = null;

    if (quantity === 0) {
      const { error: deleteErr } = await supabase.from('cart_items').delete().eq('id', itemId);
      if (deleteErr) throw new Error(`Failed to remove item: ${deleteErr.message}`);
    } else {
      const newTotal = targetItem.unit_price_paise * quantity;
      const { data: updated, error: updateErr } = await supabase
        .from('cart_items')
        .update({
          quantity,
          total_price_paise: newTotal,
          updated_at: new Date().toISOString(),
        })
        .eq('id', itemId)
        .select('*')
        .single();

      if (updateErr || !updated) throw new Error(`Failed to update item: ${updateErr?.message}`);
      updatedItem = updated as CartItem;
    }

    // 3. Re-fetch all items for bill calculation
    const { data: remainingItemsData } = await supabase
      .from('cart_items')
      .select('*')
      .eq('session_id', sessionId);

    const remainingItems = (remainingItemsData as CartItem[]) || [];

    const billSummary = calculateCartSummary(
      remainingItems.map((i) => ({
        unitPricePaise: i.unit_price_paise,
        quantity: i.quantity,
        taxRateBasisPoints: i.tax_rate_basis_points,
      })),
      session.discount_paise
    );

    // 4. Persist updated totals to session
    const { data: updatedSessionData, error: updateSessionErr } = await supabase
      .from('cart_sessions')
      .update({
        total_items: billSummary.totalItems,
        subtotal_paise: billSummary.subtotalPaise,
        tax_paise: billSummary.taxPaise,
        discount_paise: billSummary.discountPaise,
        grand_total_paise: billSummary.grandTotalPaise,
        updated_at: new Date().toISOString(),
      })
      .eq('id', sessionId)
      .select('*')
      .single();

    if (updateSessionErr || !updatedSessionData) {
      throw new Error(`Failed to persist bill recalculation: ${updateSessionErr?.message}`);
    }

    const updatedSession = updatedSessionData as CartSession;
    updatedSession.items = remainingItems;

    return {
      success: true,
      session: updatedSession,
      updated_item: updatedItem,
    };
  } catch (err) {
    return {
      success: false,
      error: {
        code: 'UPDATE_FAILED',
        message: err instanceof Error ? err.message : 'Item update failed.',
      },
    };
  }
}
