/**
 * ZeroWait Monetary & Pricing Engine
 * 
 * Rules:
 * - All calculations are strictly executed in integer paise (1 INR = 100 paise).
 * - No floating-point financial arithmetic errors.
 * - Tax rates are basis points (e.g. 1800 bps = 18.00% GST, 500 bps = 5.00%).
 * - Client prices are NEVER trusted; always recomputed server-side from product snapshots.
 */

export interface ItemCalculationInput {
  unitPricePaise: number;
  quantity: number;
  taxRateBasisPoints: number;
}

export interface CartCalculationResult {
  totalItems: number;
  subtotalPaise: number;
  taxPaise: number;
  discountPaise: number;
  grandTotalPaise: number;
}

/**
 * Calculates item subtotal in paise.
 */
export function calculateItemSubtotal(unitPricePaise: number, quantity: number): number {
  if (unitPricePaise < 0 || quantity < 0) {
    throw new Error('Unit price and quantity must be non-negative integers.');
  }
  return Math.round(unitPricePaise * quantity);
}

/**
 * Calculates tax in paise based on basis points (10000 bps = 100%).
 */
export function calculateItemTax(itemTotalPaise: number, taxRateBasisPoints: number): number {
  if (itemTotalPaise < 0 || taxRateBasisPoints < 0) {
    throw new Error('Item total and tax rate must be non-negative.');
  }
  return Math.round((itemTotalPaise * taxRateBasisPoints) / 10000);
}

/**
 * Computes verified cart summary totals securely on the server.
 */
export function calculateCartSummary(
  items: ItemCalculationInput[],
  discountPaise: number = 0
): CartCalculationResult {
  let totalItems = 0;
  let subtotalPaise = 0;
  let taxPaise = 0;

  for (const item of items) {
    const itemSubtotal = calculateItemSubtotal(item.unitPricePaise, item.quantity);
    const itemTax = calculateItemTax(itemSubtotal, item.taxRateBasisPoints);

    totalItems += item.quantity;
    subtotalPaise += itemSubtotal;
    taxPaise += itemTax;
  }

  const validDiscount = Math.max(0, Math.min(discountPaise, subtotalPaise));
  const grandTotalPaise = Math.max(0, subtotalPaise + taxPaise - validDiscount);

  return {
    totalItems,
    subtotalPaise,
    taxPaise,
    discountPaise: validDiscount,
    grandTotalPaise,
  };
}

/**
 * Formats integer paise into INR currency display string (e.g. 6500 -> "₹65.00", 125000 -> "₹1,250.00").
 */
export function formatPaiseToInr(paise: number): string {
  const rupees = paise / 100;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(rupees);
}
