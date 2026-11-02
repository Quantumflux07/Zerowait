'use client';

/**
 * ZeroWait Cart Session Hook
 * Manages the full lifecycle of an active cart session:
 * - Loads cart + session state from the API
 * - Handles barcode scanning (camera + USB/HID/Bluetooth + manual)
 * - Manages item quantity updates
 * - Subscribes to Supabase Realtime for live updates
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
  scanBarcode: (barcode: string) => Promise<void>;
  updateItemQuantity: (itemId: string, newQuantity: number) => Promise<void>;
  clearScanFeedback: () => void;
  setScanFeedback: (state: ScanFeedbackState, message?: string) => void;
}

// Debounce window to prevent accidental duplicate scans (ms)
const SCAN_DEBOUNCE_MS = 1500;

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
      const channelName = `store:${storeId}:cart:${cartId}`;
      const channel = supabase.channel(channelName);

      channel.on('broadcast', { event: '*' }, (msg) => {
        const payload = msg.payload as CartRealtimePayload;
        if (!payload || payload.session_id !== sessionId) return;

        const event = payload.event;

        if (event === 'CART_ITEM_ADDED' || event === 'CART_ITEM_UPDATED' || event === 'CART_ITEM_REMOVED') {
          // Partial session update from server
          if (payload.payload.session) {
            setState((prev) => {
              const updatedSession = { ...prev.session, ...payload.payload.session } as CartSession;
              return {
                ...prev,
                session: updatedSession,
                items: updatedSession.items ?? prev.items,
              };
            });
          }
        }

        if (event === 'CART_LOCKED' || event === 'CART_LANE_ASSIGNED') {
          setState((prev) => ({
            ...prev,
            isLocked: true,
            session: prev.session
              ? {
                  ...prev.session,
                  status: 'ASSIGNED_LOCKED',
                  ...payload.payload.session,
                }
              : prev.session,
            assignment: payload.payload.assignment
              ? ({ ...prev.assignment, ...payload.payload.assignment } as LaneAssignment)
              : prev.assignment,
          }));
        }
      });

      // Also listen on the broadcast channel the Queue Engine uses
      supabase.channel(`cart:${sessionId}`).on('broadcast', { event: 'ASSIGNMENT_CONFIRMED' }, (msg) => {
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
          session: prev.session ? { ...prev.session, status: 'ASSIGNED_LOCKED', assigned_lane_id: data.laneId } : prev.session,
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
            lane: prev.assignment?.lane ?? undefined,
          },
        }));
      });

      channel.subscribe();
      realtimeChannelRef.current = channel;
    },
    []
  );

  // ── Load cart by QR code ─────────────────────────────────────────────────────

  const loadCart = useCallback(
    async (qrCode: string) => {
      setState((prev) => ({ ...prev, isLoading: true, error: null }));
      try {
        const res = await fetch(`/api/v1/carts/${encodeURIComponent(qrCode)}`);
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

        // Derive assignment from session if locked (re-fetch if necessary)
        let assignment: LaneAssignment | null = null;
        if (active_session?.status === 'ASSIGNED_LOCKED' && active_session.assigned_lane_id) {
          // Build a synthetic assignment from session data
          assignment = {
            id: `sa_${active_session.id}`,
            lane_id: active_session.assigned_lane_id,
            session_id: active_session.id,
            token_number: '—',
            queue_position: 1,
            estimated_wait_seconds: 0,
            assignment_status: 'QUEUED',
            called_at: null,
            served_at: null,
            created_at: active_session.locked_at ?? new Date().toISOString(),
            updated_at: active_session.updated_at,
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

  // ── Scan barcode ─────────────────────────────────────────────────────────────

  const scanBarcode = useCallback(
    async (barcode: string) => {
      const trimmed = barcode.trim();
      if (!trimmed || trimmed.length < 3) return;

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

      // Optimistic UI
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
    };
  }, []);

  return {
    ...state,
    loadCart,
    scanBarcode,
    updateItemQuantity,
    clearScanFeedback,
    setScanFeedback,
  };
}
