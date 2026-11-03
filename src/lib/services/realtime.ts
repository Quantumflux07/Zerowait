/**
 * ZeroWait Supabase Realtime & Inter-Tab Broadcast Sync Service
 * 
 * Synchronizes queue assignments across devices and cart displays.
 */

import { createAdminClient } from '@/lib/supabase/admin';

export interface AssignmentRealtimeEvent {
  event: 'ASSIGNMENT_CONFIRMED';
  sessionId: string;
  cartId: string;
  laneId: string;
  laneName: string;
  tokenNumber: string;
  queuePosition: number;
  estimatedWaitSeconds: number;
  timestamp: string;
}

/**
 * Broadcasts assignment to Supabase Realtime channel.
 * Gracefully handles offline / placeholder environments without throwing errors.
 */
export async function broadcastAssignmentRealtime(eventData: AssignmentRealtimeEvent): Promise<boolean> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const isPlaceholder = supabaseUrl.includes('placeholder') || !process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (isPlaceholder) {
    // Local / dev environment with mock credentials:
    // Realtime is seamlessly emulated and communicated via browser BroadcastChannel & API polling
    return true;
  }

  try {
    const supabase = createAdminClient();
    const channel = supabase.channel(`cart:${eventData.sessionId}`);
    await channel.send({
      type: 'broadcast',
      event: 'ASSIGNMENT_CONFIRMED',
      payload: eventData,
    });
    return true;
  } catch (err) {
    console.warn('[Realtime Broadcast] Supabase broadcast skipped or failed:', err);
    return false;
  }
}


export interface CheckoutCompletedRealtimeEvent {
  event: 'CHECKOUT_COMPLETED';
  sessionId: string;
  cartId: string;
  invoiceNumber: string;
  amountPaise: number;
  timestamp: string;
}

export async function broadcastCheckoutCompletedRealtime(
  eventData: CheckoutCompletedRealtimeEvent
): Promise<boolean> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const isPlaceholder =
    supabaseUrl.includes('placeholder') || !process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (isPlaceholder) {
    return true;
  }

  try {
    const supabase = createAdminClient();
    const channel = supabase.channel(`cart:${eventData.sessionId}`);
    await channel.send({
      type: 'broadcast',
      event: 'CHECKOUT_COMPLETED',
      payload: eventData,
    });
    return true;
  } catch (err) {
    console.warn('[Realtime Broadcast] Checkout broadcast skipped or failed:', err);
    return false;
  }
}
