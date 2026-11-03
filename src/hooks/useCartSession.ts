'use client';

/**
 * ZeroWait Cart Session Hook
 * Manages the full lifecycle of an active cart session:
 * - Loads cart + session state from Supabase API
 * - Recovers state automatically on browser refresh/reopen
 * - Handles barcode scanning (camera + USB/HID/Bluetooth + manual)
 * - Manages item quantity updates and server recalculation
 * - Subscribes to Supabase Realtime & BroadcastChannel for live cross-tab updates
 * - Handles ASSIGNED_LOCKED state from Queue Engine
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Cart, CartSession, CartItem, LaneAssignment } from '@/types/domain';
import type {
  CartRetrievalResponse,
  ScanProductResponse,
  UpdateCartItemResponse,
  CartRealtimePayload,
} from '@/types/api';
import { cleanBarcodeString } from '@/lib/engine/barcode';

export type ScanFeedbackState = 'idle' | 'scanning' | 'success' | 'error' | 'duplicate' | 'locked';

export interface CartState {
  cart: Cart | null;
  session: CartSession | null;
  assignment: LaneAssignment | null;
  items: CartItem[];
  isLoading: boolean;
  isScanning: boolean;
  scanFeedback: ScanFeedbackState;
  scanMessage: string | null;
  error: string | null;
  isLocked: boolean;
}

export interface UseCartSessionReturn extends CartState {
  loadCart: (qrCode: string) => Promise<void>;
  leaveCart: () => void;
  scanBarcode: (barcode: string) => Promise<void>;
  updateItemQuantity: (itemId: string, newQuantity: number) => Promise<void>;
  clearScanFeedback: () => void;
  setScanFeedback: (state: ScanFeedbackState, message?: string) => void;
}

// Debounce window to prevent accidental duplicate scans (ms)
const SCAN_DEBOUNCE_MS = 1500;
const STORAGE_CART_KEY = 'zerowait_active_cart_qr';

export function useCartSession(): UseCartSessionReturn {
  const [state, setState] = useState<CartState>({
    cart: null,
    session: null,
    assignment: null,
    items: [],
    isLoading: false,
    isScanning: false,
    scanFeedback: 'idle',
    scanMessage: null,
    error: null,
    isLocked: false,
  });

  const lastScannedRef = useRef<{ barcode: string; at: number } | null>(null);
  const realtimeChannelRef = useRef<ReturnType<ReturnType<typeof createClient>['channel']> | null>(null);
  const broadcastChannelRef = useRef<BroadcastChannel | null>(null);

  // ── Helpers ──────────────────────────────────────────────────────────────────

  const setScanFeedback = useCallback((feedback: ScanFeedbackState, message?: string) => {
    setState((prev) => ({ ...prev, scanFeedback: feedback, scanMessage: message ?? null }));
  }, []);

  const clearScanFeedback = useCallback(() => {
    setState((prev) => ({ ...prev, scanFeedback: 'idle', scanMessage: null }));
  }, []);

  // ── Realtime subscription ────────────────────────────────────────────────────

  const subscribeToCart = useCallback(
    (storeId: string, cartId: string, sessionId: string) => {
      if (realtimeChannelRef.current) {
        realtimeChannelRef.current.unsubscribe();
      }

      const supabase = createClient();
      const channelName = `cart:${sessionId}`;
      const channel = supabase.channel(channelName);

      // Listen for broadcast events from Queue Engine
      channel.on('broadcast', { event: 'ASSIGNMENT_CONFIRMED' }, (msg) => {
        const data = msg.payload as {
          laneId: string;
          laneName: string;
          tokenNumber: string;
          queuePosition: number;
          estimatedWaitSeconds: number;
        };

        setState((prev) => ({
          ...prev,
          isLocked: true,
          session: prev.session
            ? { ...prev.session, status: 'ASSIGNED_LOCKED', assigned_lane_id: data.laneId }
            : prev.session,
          assignment: {
            id: `rt_${Date.now()}`,
            lane_id: data.laneId,
            session_id: sessionId,
            token_number: data.tokenNumber,
            queue_position: data.queuePosition,
            estimated_wait_seconds: data.estimatedWaitSeconds,
            assignment_status: 'QUEUED',
            called_at: null,
            served_at: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            lane: {
              id: data.laneId,
              store_id: storeId,
              lane_number: 1,
              name: data.laneName,
              type: data.tokenNumber.startsWith('E') ? 'EXPRESS' : 'REGULAR',
              status: 'OPEN',
              max_items_limit: null,
              assigned_staff_id: null,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
          },
        }));
      });

      // Listen for postgres database level changes on cart_sessions
      channel.on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'cart_sessions',
          filter: `id=eq.${sessionId}`,
        },
        (payload) => {
          const newRow = payload.new as CartSession;
          if (newRow && newRow.status === 'ASSIGNED_LOCKED') {
            setState((prev) => ({
              ...prev,
              isLocked: true,
              session: { ...prev.session, ...newRow },
            }));
          }
        }
      );

      channel.subscribe();
      realtimeChannelRef.current = channel;

      // Local Tab-to-Tab sync via Web BroadcastChannel
      if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
        if (broadcastChannelRef.current) {
          broadcastChannelRef.current.close();
        }
        const bc = new BroadcastChannel('zerowait_cart_sync');
        bc.onmessage = (event) => {
          if (
            (event.data?.type === 'LANE_ASSIGNED' || event.data?.event === 'ASSIGNMENT_CONFIRMED') &&
            event.data?.sessionId === sessionId
          ) {
            const data = event.data;
            setState((prev) => ({
              ...prev,
              isLocked: true,
              session: prev.session
                ? { ...prev.session, status: 'ASSIGNED_LOCKED', assigned_lane_id: data.laneId }
                : prev.session,
              assignment: {
                id: `bc_${Date.now()}`,
                lane_id: data.laneId,
                session_id: sessionId,
                token_number: data.tokenNumber,
                queue_position: data.queuePosition,
                estimated_wait_seconds: data.estimatedWaitSeconds,
                assignment_status: 'QUEUED',
                called_at: null,
                served_at: null,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                lane: {
                  id: data.laneId,
                  store_id: storeId,
                  lane_number: 1,
                  name: data.laneName,
                  type: data.laneType || 'REGULAR',
                  status: 'OPEN',
                  max_items_limit: null,
                  assigned_staff_id: null,
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                },
              },
            }));
          }
        };
        broadcastChannelRef.current = bc;
      }
    },
    []
  );

  // ── Load cart by QR code ─────────────────────────────────────────────────────

  const loadCart = useCallback(
    async (qrCode: string) => {
      const trimmed = qrCode.trim();
      if (!trimmed) return;

      setState((prev) => ({ ...prev, isLoading: true, error: null }));
      try {
        const res = await fetch(`/api/v1/carts/${encodeURIComponent(trimmed)}`);
        const json: CartRetrievalResponse = await res.json();

        if (!json.success || !json.data) {
          setState((prev) => ({
            ...prev,
            isLoading: false,
            error: json.error?.message ?? 'Cart not found.',
          }));
          return;
        }

        const { cart, active_session } = json.data;
        const isLocked =
          active_session?.status === 'ASSIGNED_LOCKED' ||
          active_session?.status === 'AT_CHECKOUT' ||
          active_session?.status === 'PAYMENT_PENDING' ||
          active_session?.status === 'PAID';

        // Derive assignment from session if locked
        let assignment: LaneAssignment | null = null;
        if (active_session?.status === 'ASSIGNED_LOCKED' && active_session.assigned_lane_id) {
          assignment = {
            id: `sa_${active_session.id}`,
            lane_id: active_session.assigned_lane_id,
            session_id: active_session.id,
            token_number: active_session.assigned_lane?.type === 'EXPRESS' ? 'E-101' : 'A-201',
            queue_position: 1,
            estimated_wait_seconds: 45,
            assignment_status: 'QUEUED',
            called_at: null,
            served_at: null,
            created_at: active_session.locked_at ?? new Date().toISOString(),
            updated_at: active_session.updated_at,
            lane: active_session.assigned_lane ?? undefined,
          };
        }

        setState((prev) => ({
          ...prev,
          cart,
          session: active_session,
          items: active_session?.items ?? [],
          assignment,
          isLocked,
          isLoading: false,
          error: null,
        }));

        // Persist to localStorage for seamless refresh recovery
        if (typeof window !== 'undefined') {
          try {
            localStorage.setItem(STORAGE_CART_KEY, cart.qr_code);
          } catch {
            // Storage quota / privacy mode guard
          }
        }

        // Subscribe to realtime
        if (active_session) {
          subscribeToCart(cart.store_id, cart.id, active_session.id);
        }
      } catch (err) {
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: err instanceof Error ? err.message : 'Failed to load cart.',
        }));
      }
    },
    [subscribeToCart]
  );

  const leaveCart = useCallback(() => {
    if (typeof window !== 'undefined') {
      try {
        localStorage.removeItem(STORAGE_CART_KEY);
      } catch {
        // Storage guard
      }
    }
    if (realtimeChannelRef.current) {
      realtimeChannelRef.current.unsubscribe();
      realtimeChannelRef.current = null;
    }
    if (broadcastChannelRef.current) {
      broadcastChannelRef.current.close();
      broadcastChannelRef.current = null;
    }
    setState({
      cart: null,
      session: null,
      assignment: null,
      items: [],
      isLoading: false,
      isScanning: false,
      scanFeedback: 'idle',
      scanMessage: null,
      error: null,
      isLocked: false,
    });
  }, []);

  // ── Auto-recovery on initial page load / refresh ──────────────────────────────
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // 1. Check URL query params for ?cart=...
    const urlParams = new URLSearchParams(window.location.search);
    const cartParam = urlParams.get('cart');

    if (cartParam) {
      loadCart(cartParam);
      return;
    }

    // 2. Check localStorage for remembered cart session
    const savedQr = localStorage.getItem(STORAGE_CART_KEY);
    if (savedQr) {
      loadCart(savedQr);
    }
  }, [loadCart]);

  // ── Scan barcode ─────────────────────────────────────────────────────────────

  const scanBarcode = useCallback(
    async (barcode: string) => {
      const trimmed = cleanBarcodeString(barcode);
      if (!trimmed || trimmed.length < 3) return;

      console.log('[useCartSession] Initiating scan for barcode:', trimmed);

      // Guard: cart locked
      if (state.isLocked || state.session?.status !== 'SHOPPING') {
        setScanFeedback('locked', 'Cart is locked — scanning disabled.');
        return;
      }

      if (!state.session) {
        setScanFeedback('error', 'No active session. Load a cart first.');
        return;
      }

      // Debounce duplicate scans
      const now = Date.now();
      if (
        lastScannedRef.current &&
        lastScannedRef.current.barcode === trimmed &&
        now - lastScannedRef.current.at < SCAN_DEBOUNCE_MS
      ) {
        setScanFeedback('duplicate', `Already scanned ${trimmed}. Wait a moment.`);
        setTimeout(clearScanFeedback, 2000);
        return;
      }

      lastScannedRef.current = { barcode: trimmed, at: now };
      setState((prev) => ({ ...prev, isScanning: true }));
      setScanFeedback('scanning', `Looking up ${trimmed}…`);

      try {
        const res = await fetch('/api/v1/carts/scan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ session_id: state.session.id, barcode: trimmed, quantity: 1 }),
        });
        const json: ScanProductResponse = await res.json();

        if (!json.success || !json.data) {
          const code = json.error?.code;
          if (code === 'PRODUCT_NOT_FOUND') {
            setScanFeedback('error', `Barcode ${trimmed} not found in store catalog.`);
          } else if (code === 'SESSION_LOCKED') {
            setScanFeedback('locked', 'Cart is locked for checkout.');
          } else if (code === 'INSUFFICIENT_STOCK') {
            setScanFeedback('error', json.error?.message ?? 'Insufficient stock.');
          } else {
            setScanFeedback('error', json.error?.message ?? 'Scan failed.');
          }
          setTimeout(clearScanFeedback, 3000);
        } else {
          const { session: updatedSession } = json.data;
          setState((prev) => ({
            ...prev,
            session: updatedSession,
            items: updatedSession.items ?? prev.items,
          }));
          setScanFeedback('success', `${json.data.scanned_item.product_name_snapshot} added!`);
          setTimeout(clearScanFeedback, 2000);
        }
      } catch (err) {
        setScanFeedback('error', err instanceof Error ? err.message : 'Network error.');
        setTimeout(clearScanFeedback, 3000);
      } finally {
        setState((prev) => ({ ...prev, isScanning: false }));
      }
    },
    [state.isLocked, state.session, setScanFeedback, clearScanFeedback]
  );

  // ── Update item quantity ──────────────────────────────────────────────────────

  const updateItemQuantity = useCallback(
    async (itemId: string, newQuantity: number) => {
      if (state.isLocked || state.session?.status !== 'SHOPPING') return;
      if (!state.session) return;

      // Optimistic UI update
      setState((prev) => {
        const newItems =
          newQuantity === 0
            ? prev.items.filter((i) => i.id !== itemId)
            : prev.items.map((i) =>
                i.id === itemId
                  ? { ...i, quantity: newQuantity, total_price_paise: i.unit_price_paise * newQuantity }
                  : i
              );
        return { ...prev, items: newItems };
      });

      try {
        const res = await fetch('/api/v1/carts/items', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            session_id: state.session.id,
            item_id: itemId,
            quantity: newQuantity,
          }),
        });
        const json: UpdateCartItemResponse = await res.json();
        if (json.success && json.data) {
          setState((prev) => ({
            ...prev,
            session: json.data!.session,
            items: json.data!.session.items ?? prev.items,
          }));
        } else {
          // Revert on error
          if (state.cart) loadCart(state.cart.qr_code);
        }
      } catch {
        // Revert optimistic update on network failure by re-loading
        if (state.cart) loadCart(state.cart.qr_code);
      }
    },
    [state.isLocked, state.session, state.cart, loadCart]
  );

  // ── Cleanup on unmount ───────────────────────────────────────────────────────

  useEffect(() => {
    return () => {
      if (realtimeChannelRef.current) {
        realtimeChannelRef.current.unsubscribe();
      }
      if (broadcastChannelRef.current) {
        broadcastChannelRef.current.close();
      }
    };
  }, []);

  return {
    ...state,
    loadCart,
    leaveCart,
    scanBarcode,
    updateItemQuantity,
    clearScanFeedback,
    setScanFeedback,
  };
}
