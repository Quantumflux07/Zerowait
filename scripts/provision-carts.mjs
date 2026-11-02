#!/usr/bin/env node
/**
 * ZeroWait — Physical Cart Provisioning CLI Script
 * 
 * Usage:
 *   node scripts/provision-carts.mjs
 *   node scripts/provision-carts.mjs ZW-CART-006 "Smart Cart #6"
 */

import { createClient } from '@supabase/supabase-js';
import QRCode from 'qrcode';
import fs from 'fs';
import path from 'path';

// Load .env.local if present
const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const idx = trimmed.indexOf('=');
      if (idx !== -1) {
        const key = trimmed.substring(0, idx).trim();
        const val = trimmed.substring(idx + 1).trim();
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey || supabaseUrl.includes('placeholder') || serviceKey.includes('placeholder')) {
  console.error('\x1b[31m[ERROR] Supabase credentials missing or placeholder in .env.local\x1b[0m');
  console.error('Please configure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to provision carts to the live database.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const DEFAULT_STORE_CODE = process.env.NEXT_PUBLIC_DEFAULT_STORE_CODE || 'AVENUE-001';

async function provisionCart(qrCode, label) {
  console.log(`\nProvisioning physical cart: ${qrCode} ("${label}")...`);

  // 1. Resolve store
  const { data: store, error: storeErr } = await supabase
    .from('stores')
    .select('id, name')
    .eq('code', DEFAULT_STORE_CODE)
    .single();

  if (storeErr || !store) {
    console.error(`Store with code '${DEFAULT_STORE_CODE}' not found. Make sure seed.sql is applied.`);
    process.exit(1);
  }

  // 2. Generate ASCII & Data URL QR
  const qrDataUrl = await QRCode.toDataURL(qrCode, {
    errorCorrectionLevel: 'H',
    width: 300,
    color: { dark: '#0F2A43', light: '#FFFFFF' },
  });

  // 3. Upsert into Supabase
  const { data: cart, error: cartErr } = await supabase
    .from('carts')
    .upsert(
      {
        store_id: store.id,
        qr_code: qrCode,
        cart_label: label,
        battery_level: 100,
        is_active: true,
      },
      { onConflict: 'qr_code' }
    )
    .select()
    .single();

  if (cartErr) {
    console.error(`Failed to register cart in database:`, cartErr.message);
    return;
  }

  console.log(`\x1b[32m✔ Registered Cart:\x1b[0m ID: ${cart.id} | QR: ${cart.qr_code} | Store: ${store.name}`);

  // 4. Ensure active shopping session exists
  const { data: existingSession } = await supabase
    .from('cart_sessions')
    .select('id, status')
    .eq('cart_id', cart.id)
    .in('status', ['SHOPPING', 'ASSIGNED_LOCKED'])
    .maybeSingle();

  if (!existingSession) {
    const { data: newSession, error: sErr } = await supabase
      .from('cart_sessions')
      .insert({
        cart_id: cart.id,
        store_id: store.id,
        status: 'SHOPPING',
        total_items: 0,
        subtotal_paise: 0,
        discount_paise: 0,
        tax_paise: 0,
        grand_total_paise: 0,
      })
      .select('id, status')
      .single();

    if (!sErr && newSession) {
      console.log(`  Initialized active shopping session: ${newSession.id} (${newSession.status})`);
    }
  } else {
    console.log(`  Active session exists: ${existingSession.id} (${existingSession.status})`);
  }

  console.log(`  QR Code Data URL generated (length: ${qrDataUrl.length} chars)`);
}

async function run() {
  const args = process.argv.slice(2);
  if (args.length >= 2) {
    await provisionCart(args[0], args[1]);
  } else {
    const defaultCarts = [
      { qr: 'ZW-CART-001', label: 'Smart Cart #1' },
      { qr: 'ZW-CART-002', label: 'Smart Cart #2' },
      { qr: 'ZW-CART-003', label: 'Smart Cart #3' },
      { qr: 'ZW-CART-004', label: 'Smart Cart #4' },
      { qr: 'ZW-CART-005', label: 'Smart Cart #5' },
    ];
    for (const c of defaultCarts) {
      await provisionCart(c.qr, c.label);
    }
  }
}

run().catch((err) => {
  console.error('Fatal error during cart provisioning:', err);
  process.exit(1);
});
