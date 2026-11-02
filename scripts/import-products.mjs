#!/usr/bin/env node
/**
 * ZeroWait — Product Catalogue CSV Import CLI Script
 * 
 * Usage:
 *   node scripts/import-products.mjs
 *   node scripts/import-products.mjs data/sample_products.csv
 */

import { createClient } from '@supabase/supabase-js';
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
  console.error('Please configure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to import products to the live database.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const DEFAULT_STORE_CODE = process.env.NEXT_PUBLIC_DEFAULT_STORE_CODE || 'AVENUE-001';

async function importCsv(filePath) {
  const resolvedPath = path.resolve(process.cwd(), filePath);
  if (!fs.existsSync(resolvedPath)) {
    console.error(`File not found: ${resolvedPath}`);
    process.exit(1);
  }

  const csvContent = fs.readFileSync(resolvedPath, 'utf8');
  console.log(`\nImporting catalogue from: ${resolvedPath}`);

  // Resolve store
  const { data: store, error: storeErr } = await supabase
    .from('stores')
    .select('id, name')
    .eq('code', DEFAULT_STORE_CODE)
    .single();

  if (storeErr || !store) {
    console.error(`Store '${DEFAULT_STORE_CODE}' not found. Ensure migrations and seed.sql are executed.`);
    process.exit(1);
  }

  console.log(`Target Store: ${store.name} (${store.id})`);

  const lines = csvContent
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length <= 1) {
    console.error('CSV contains no data rows.');
    process.exit(1);
  }

  const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
  const barcodeIdx = headers.indexOf('barcode');
  const nameIdx = headers.indexOf('name');
  const categoryIdx = headers.indexOf('category');
  const priceIdx = headers.indexOf('price_paise') !== -1 ? headers.indexOf('price_paise') : headers.indexOf('price');
  const taxIdx = headers.indexOf('tax_rate_basis_points') !== -1 ? headers.indexOf('tax_rate_basis_points') : headers.indexOf('tax_bps');
  const stockIdx = headers.indexOf('stock_quantity') !== -1 ? headers.indexOf('stock_quantity') : headers.indexOf('stock');
  const unitIdx = headers.indexOf('unit');
  const descIdx = headers.indexOf('description');

  let successCount = 0;
  let failCount = 0;

  for (let i = 1; i < lines.length; i++) {
    const row = lines[i].split(',').map((c) => c.trim().replace(/^["']|["']$/g, ''));
    const barcode = row[barcodeIdx];
    const name = row[nameIdx];
    const category = row[categoryIdx];
    const pricePaise = parseInt(row[priceIdx], 10);
    const taxBps = taxIdx !== -1 && row[taxIdx] ? parseInt(row[taxIdx], 10) : 500;
    const stock = stockIdx !== -1 && row[stockIdx] ? parseInt(row[stockIdx], 10) : 100;
    const unit = unitIdx !== -1 && row[unitIdx] ? row[unitIdx] : 'unit';
    const description = descIdx !== -1 && row[descIdx] ? row[descIdx] : null;

    if (!barcode || !name || isNaN(pricePaise)) {
      console.warn(`Line ${i + 1}: Skipping invalid row (${lines[i]})`);
      failCount++;
      continue;
    }

    const { error: upsertErr } = await supabase.from('products').upsert(
      {
        store_id: store.id,
        barcode,
        name,
        category,
        price_paise: pricePaise,
        tax_rate_basis_points: isNaN(taxBps) ? 500 : taxBps,
        stock_quantity: isNaN(stock) ? 100 : stock,
        unit,
        description,
        is_active: true,
      },
      { onConflict: 'store_id,barcode' }
    );

    if (upsertErr) {
      console.error(`Line ${i + 1} (${barcode}): Failed - ${upsertErr.message}`);
      failCount++;
    } else {
      console.log(`\x1b[32m✔\x1b[0m Line ${i + 1}: ${name} (${barcode}) → ₹${(pricePaise / 100).toFixed(2)}`);
      successCount++;
    }
  }

  console.log(`\nImport complete: ${successCount} upserted, ${failCount} failed.`);
}

const fileArg = process.argv[2] || 'data/sample_products.csv';
importCsv(fileArg).catch((err) => {
  console.error('Fatal import error:', err);
  process.exit(1);
});
