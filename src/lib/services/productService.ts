/**
 * ZeroWait — Authoritative Product Service
 * 
 * Manages product barcode lookup, admin product creation, and bulk CSV import.
 * Interacts directly with PostgreSQL on Supabase via the secure admin client.
 */

import { createAdminClient } from '../supabase/admin.ts';
import { isSupabaseConfigured, getMissingSupabaseConfigMessage } from '../supabase/config.ts';
import { MOCK_PRODUCTS, MOCK_STORE_ID } from './mockData.ts';
import type { Product, DiscountRule } from '../../types/domain';
import { getBarcodeVariants } from '../engine/barcode.ts';

export interface ProductWithDiscounts extends Product {
  applicable_discounts?: DiscountRule[];
}

export interface CreateProductInput {
  store_id?: string;
  barcode: string;
  name: string;
  category: string;
  description?: string | null;
  image_url?: string | null;
  price_paise: number;
  tax_rate_basis_points: number;
  stock_quantity?: number;
  unit?: string;
  is_active?: boolean;
}

export interface CsvImportResult {
  total_processed: number;
  inserted_or_updated: number;
  failed: number;
  errors: Array<{ line: number; barcode?: string; reason: string }>;
}

/**
 * Resolves the primary store UUID from database or environment.
 */
export async function getDefaultStoreId(): Promise<string> {
  if (!isSupabaseConfigured()) {
    return MOCK_STORE_ID;
  }

  try {
    const supabase = createAdminClient();
    const storeCode = process.env.NEXT_PUBLIC_DEFAULT_STORE_CODE || 'AVENUE-001';

    const { data: store } = await supabase
      .from('stores')
      .select('id')
      .eq('code', storeCode)
      .maybeSingle();

    if (store?.id) {
      return store.id;
    }

    // Fallback: pick any active store
    const { data: fallbackStore } = await supabase
      .from('stores')
      .select('id')
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();

    return fallbackStore?.id || MOCK_STORE_ID;
  } catch {
    return MOCK_STORE_ID;
  }
}

/**
 * Look up a product by its barcode for a specific store.
 * Returns product details and applicable discount rules.
 */
export async function lookupProductByBarcode(
  barcode: string,
  storeId?: string
): Promise<{ product: ProductWithDiscounts | null; error?: string; configMissing?: boolean }> {
  const barcodeVariants = getBarcodeVariants(barcode);
  if (barcodeVariants.length === 0) {
    return { product: null, error: 'Barcode cannot be empty.' };
  }

  if (!isSupabaseConfigured()) {
    // If Supabase credentials are missing, check if in test mode or return diagnostic
    if (process.env.NODE_ENV === 'test' || process.env.ALLOW_LOCAL_DEV_STORE === 'true') {
      const mock = MOCK_PRODUCTS.find((p) => barcodeVariants.includes(p.barcode) && p.is_active);
      return { product: mock || null };
    }
    return { product: null, error: getMissingSupabaseConfigMessage(), configMissing: true };
  }

  try {
    const supabase = createAdminClient();
    const effectiveStoreId = storeId || (await getDefaultStoreId());

    // 1. Authoritative product query across barcode variants (e.g. UPC-A / EAN-13 equivalences)
    const { data: product, error: productError } = await supabase
      .from('products')
      .select('*')
      .in('barcode', barcodeVariants)
      .eq('store_id', effectiveStoreId)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();

    if (productError) {
      throw new Error(`Database error looking up barcode ${barcode}: ${productError.message}`);
    }

    if (!product) {
      return { product: null };
    }

    // 2. Fetch applicable discount rules for store
    const { data: discounts } = await supabase
      .from('discount_rules')
      .select('*')
      .eq('store_id', effectiveStoreId)
      .eq('is_active', true);

    const productWithDiscounts: ProductWithDiscounts = {
      ...product,
      applicable_discounts: (discounts as DiscountRule[]) || [],
    };

    return { product: productWithDiscounts };
  } catch (err) {
    return {
      product: null,
      error: err instanceof Error ? err.message : 'Failed to query product from database.',
    };
  }
}

/**
 * Register a new product in Supabase catalogue (authorised admin / dev operation).
 */
export async function registerProduct(
  input: CreateProductInput
): Promise<{ success: boolean; product?: Product; error?: string }> {
  if (!isSupabaseConfigured()) {
    return { success: false, error: getMissingSupabaseConfigMessage() };
  }

  try {
    const supabase = createAdminClient();
    const effectiveStoreId = input.store_id || (await getDefaultStoreId());

    const { data, error } = await supabase
      .from('products')
      .upsert(
        {
          store_id: effectiveStoreId,
          barcode: input.barcode.trim(),
          name: input.name.trim(),
          category: input.category.trim(),
          description: input.description?.trim() || null,
          image_url: input.image_url?.trim() || null,
          price_paise: Math.round(input.price_paise),
          tax_rate_basis_points: Math.round(input.tax_rate_basis_points),
          stock_quantity: input.stock_quantity ?? 100,
          unit: input.unit?.trim() || 'unit',
          is_active: input.is_active ?? true,
        },
        { onConflict: 'store_id,barcode' }
      )
      .select('*')
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, product: data as Product };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to register product in database.',
    };
  }
}

/**
 * Import a CSV catalogue into Supabase products table.
 * Supports standard CSV format with headers:
 * barcode,name,category,price_paise,tax_rate_basis_points,stock_quantity,unit,description
 */
export async function importProductsFromCsv(
  csvContent: string,
  storeId?: string
): Promise<CsvImportResult> {
  const result: CsvImportResult = {
    total_processed: 0,
    inserted_or_updated: 0,
    failed: 0,
    errors: [],
  };

  if (!isSupabaseConfigured()) {
    result.errors.push({
      line: 0,
      reason: getMissingSupabaseConfigMessage(),
    });
    return result;
  }

  const lines = csvContent
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length <= 1) {
    result.errors.push({ line: 0, reason: 'CSV is empty or missing data rows.' });
    return result;
  }

  const headerLine = lines[0];
  const headers = headerLine.split(',').map((h) => h.trim().toLowerCase().replace(/['"]/g, ''));

  const barcodeIdx = headers.indexOf('barcode');
  const nameIdx = headers.indexOf('name');
  const categoryIdx = headers.indexOf('category');
  const priceIdx = headers.indexOf('price_paise') !== -1 ? headers.indexOf('price_paise') : headers.indexOf('price');
  const taxIdx =
    headers.indexOf('tax_rate_basis_points') !== -1
      ? headers.indexOf('tax_rate_basis_points')
      : headers.indexOf('tax_bps');
  const stockIdx = headers.indexOf('stock_quantity') !== -1 ? headers.indexOf('stock_quantity') : headers.indexOf('stock');
  const unitIdx = headers.indexOf('unit');
  const descIdx = headers.indexOf('description');

  if (barcodeIdx === -1 || nameIdx === -1 || categoryIdx === -1 || priceIdx === -1) {
    result.errors.push({
      line: 1,
      reason: 'Missing required CSV headers. Required: barcode, name, category, price_paise',
    });
    return result;
  }

  const effectiveStoreId = storeId || (await getDefaultStoreId());
  const supabase = createAdminClient();

  for (let i = 1; i < lines.length; i++) {
    result.total_processed++;
    const row = parseCsvRow(lines[i]);

    if (row.length <= Math.max(barcodeIdx, nameIdx, categoryIdx, priceIdx)) {
      result.failed++;
      result.errors.push({ line: i + 1, reason: 'Row has fewer columns than required.' });
      continue;
    }

    const barcode = row[barcodeIdx]?.trim();
    const name = row[nameIdx]?.trim();
    const category = row[categoryIdx]?.trim();
    const rawPrice = row[priceIdx]?.trim();

    if (!barcode || !name || !category || !rawPrice) {
      result.failed++;
      result.errors.push({ line: i + 1, barcode, reason: 'Missing mandatory values in row.' });
      continue;
    }

    const pricePaise = parseInt(rawPrice, 10);
    if (isNaN(pricePaise) || pricePaise < 0) {
      result.failed++;
      result.errors.push({ line: i + 1, barcode, reason: `Invalid price_paise: ${rawPrice}` });
      continue;
    }

    const taxBps = taxIdx !== -1 && row[taxIdx] ? parseInt(row[taxIdx].trim(), 10) : 500;
    const stock = stockIdx !== -1 && row[stockIdx] ? parseInt(row[stockIdx].trim(), 10) : 100;
    const unit = unitIdx !== -1 && row[unitIdx] ? row[unitIdx].trim() : 'unit';
    const description = descIdx !== -1 && row[descIdx] ? row[descIdx].trim() : null;

    try {
      const { error } = await supabase.from('products').upsert(
        {
          store_id: effectiveStoreId,
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

      if (error) {
        result.failed++;
        result.errors.push({ line: i + 1, barcode, reason: error.message });
      } else {
        result.inserted_or_updated++;
      }
    } catch (err) {
      result.failed++;
      result.errors.push({
        line: i + 1,
        barcode,
        reason: err instanceof Error ? err.message : 'Database error',
      });
    }
  }

  return result;
}

/**
 * Basic RFC 4180-compliant CSV line parser handling commas within quotes.
 */
function parseCsvRow(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"' || char === "'") {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}
