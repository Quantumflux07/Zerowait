/**
 * ZeroWait — Physical Cart Provisioning Service
 * 
 * Registers physical shopping carts, persists them to Supabase,
 * and generates QR codes for cart asset identification.
 */

import QRCode from 'qrcode';
import { createAdminClient } from '@/lib/supabase/admin';
import { isSupabaseConfigured, getMissingSupabaseConfigMessage } from '@/lib/supabase/config';
import { getDefaultStoreId } from './productService';
import { Cart, CartSession } from '@/types/domain';

export interface ProvisionCartInput {
  qr_code: string;
  cart_label: string;
  store_id?: string;
  battery_level?: number;
}

export interface ProvisionCartResult {
  success: boolean;
  cart?: Cart;
  qr_data_url?: string;
  active_session?: CartSession;
  error?: string;
}

/**
 * Provisions a physical shopping cart and generates its unique QR image.
 */
export async function provisionPhysicalCart(
  input: ProvisionCartInput
): Promise<ProvisionCartResult> {
  const cleanCode = input.qr_code.trim().toUpperCase();
  const cleanLabel = input.cart_label.trim();

  if (!cleanCode || !cleanLabel) {
    return { success: false, error: 'qr_code and cart_label are required.' };
  }

  try {
    // Generate QR code Data URL (PNG)
    const qrDataUrl = await QRCode.toDataURL(cleanCode, {
      errorCorrectionLevel: 'H',
      margin: 2,
      width: 400,
      color: {
        dark: '#0F2A43', // Deep navy
        light: '#FFFFFF',
      },
    });

    if (!isSupabaseConfigured()) {
      return {
        success: false,
        qr_data_url: qrDataUrl,
        error: getMissingSupabaseConfigMessage(),
      };
    }

    const supabase = createAdminClient();
    const effectiveStoreId = input.store_id || (await getDefaultStoreId());

    // 1. Upsert cart in carts table
    const { data: cartData, error: cartErr } = await supabase
      .from('carts')
      .upsert(
        {
          qr_code: cleanCode,
          cart_label: cleanLabel,
          store_id: effectiveStoreId,
          battery_level: input.battery_level ?? 100,
          is_active: true,
        },
        { onConflict: 'qr_code' }
      )
      .select('*')
      .single();

    if (cartErr || !cartData) {
      throw new Error(`Failed to persist cart record: ${cartErr?.message}`);
    }

    const cart = cartData as Cart;

    // 2. Ensure an active shopping session exists or initialize one
    const { data: existingSession } = await supabase
      .from('cart_sessions')
      .select('*')
      .eq('cart_id', cart.id)
      .in('status', ['SHOPPING', 'ASSIGNED_LOCKED'])
      .maybeSingle();

    let activeSession = existingSession as CartSession | null;

    if (!activeSession) {
      const { data: newSession, error: sessionErr } = await supabase
        .from('cart_sessions')
        .insert({
          cart_id: cart.id,
          store_id: effectiveStoreId,
          status: 'SHOPPING',
          total_items: 0,
          subtotal_paise: 0,
          discount_paise: 0,
          tax_paise: 0,
          grand_total_paise: 0,
        })
        .select('*')
        .single();

      if (!sessionErr && newSession) {
        activeSession = newSession as CartSession;
      }
    }

    return {
      success: true,
      cart,
      qr_data_url: qrDataUrl,
      active_session: activeSession || undefined,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Cart provisioning failed.',
    };
  }
}
