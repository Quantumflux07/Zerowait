import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateItemSubtotal,
  calculateItemTax,
  calculateCartSummary,
  formatPaiseToInr,
} from '../src/lib/engine/pricing.ts';

describe('ZeroWait Monetary Engine (Integer Paise Standard)', () => {
  test('calculateItemSubtotal correctly computes paise without floats', () => {
    // 2 bottles of Fresh Milk @ ₹65.00 (6500 paise) = 13000 paise
    const subtotal = calculateItemSubtotal(6500, 2);
    assert.equal(subtotal, 13000);
  });

  test('calculateItemTax computes exact paise using basis points', () => {
    // ₹130.00 (13000 paise) @ 5.00% GST (500 bps) = 650 paise (₹6.50)
    const tax = calculateItemTax(13000, 500);
    assert.equal(tax, 650);

    // ₹115.00 (11500 paise) @ 18.00% GST (1800 bps) = 2070 paise (₹20.70)
    const tax18 = calculateItemTax(11500, 1800);
    assert.equal(tax18, 2070);
  });

  test('calculateCartSummary aggregates subtotals, tax, and discount correctly', () => {
    const items = [
      { unitPricePaise: 6500, quantity: 2, taxRateBasisPoints: 500 }, // subtotal 13000, tax 650
      { unitPricePaise: 18000, quantity: 1, taxRateBasisPoints: 500 }, // subtotal 18000, tax 900
      { unitPricePaise: 6000, quantity: 1, taxRateBasisPoints: 500 }, // subtotal 6000, tax 300
    ];

    const result = calculateCartSummary(items, 5000); // ₹50.00 discount (5000 paise)
    assert.equal(result.totalItems, 4);
    assert.equal(result.subtotalPaise, 37000); // ₹370.00
    assert.equal(result.taxPaise, 1850); // ₹18.50
    assert.equal(result.discountPaise, 5000); // ₹50.00
    assert.equal(result.grandTotalPaise, 33850); // ₹338.50
  });

  test('formatPaiseToInr formats properly for INR locale', () => {
    const formatted = formatPaiseToInr(6500);
    assert.ok(formatted.includes('65.00'));
  });
});
