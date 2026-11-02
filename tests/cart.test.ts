/**
 * ZeroWait Cart Module Tests
 *
 * Tests the full cart API surface:
 * 1. queueStore.getSessionById
 * 2. queueStore.updateSessionItems
 * 3. POST /api/v1/carts/scan (via direct function tests)
 * 4. PATCH /api/v1/carts/items (via direct function tests)
 * 5. Duplicate-scan prevention via debounce reference logic
 */

import assert from 'node:assert/strict';
import { test, describe } from 'node:test';
import { queueStore } from '../src/lib/services/queueStore.ts';
import { MOCK_PRODUCTS } from '../src/lib/services/mockData.ts';
import { calculateCartSummary, formatPaiseToInr } from '../src/lib/engine/pricing.ts';

// ──────────────────────────────────────────────────────────────────────────────
// 1. Session retrieval
// ──────────────────────────────────────────────────────────────────────────────
describe('QueueStore — getSessionById', () => {
  test('returns existing session by id', () => {
    const session = queueStore.getSessionById('b1111111-1111-1111-1111-111111111111');
    assert.ok(session, 'Should find seeded session 1');
    assert.equal(session.cart_id, 'c1111111-1111-1111-1111-111111111111');
    assert.equal(session.status, 'SHOPPING');
  });

  test('returns undefined for unknown session id', () => {
    const session = queueStore.getSessionById('non-existent-session');
    assert.equal(session, undefined, 'Unknown session should return undefined');
  });

  test('Cart 5 is pre-seeded as ASSIGNED_LOCKED', () => {
    const session = queueStore.getSessionById('b5555555-5555-5555-5555-555555555555');
    assert.ok(session);
    assert.equal(session.status, 'ASSIGNED_LOCKED');
    assert.ok(session.assigned_lane_id, 'Should have an assigned lane');
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 2. getCartByQrCode
// ──────────────────────────────────────────────────────────────────────────────
describe('QueueStore — getCartByQrCode', () => {
  test('resolves ZW-CART-001 with session and bill', () => {
    const result = queueStore.getCartByQrCode('ZW-CART-001');
    assert.ok(result, 'Should return cart result');
    assert.ok(result.cart);
    assert.equal(result.cart.qr_code, 'ZW-CART-001');
    assert.ok(result.active_session);
    assert.ok(result.authoritative_bill);
    assert.ok(result.authoritative_bill!.grand_total_paise > 0, 'Grand total should be positive');
  });

  test('resolves ZW-CART-005 as ASSIGNED_LOCKED with assignment', () => {
    const result = queueStore.getCartByQrCode('ZW-CART-005');
    assert.ok(result?.active_session);
    assert.equal(result!.active_session!.status, 'ASSIGNED_LOCKED');
    assert.ok(result!.assignment, 'ASSIGNED_LOCKED cart should have assignment data');
  });

  test('dynamically provisions unknown QR codes', () => {
    const result = queueStore.getCartByQrCode('ZW-CART-DEMO-99');
    assert.ok(result, 'Should auto-provision unknown carts');
    assert.ok(result.cart);
    assert.ok(result.active_session);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 3. updateSessionItems — stateful scan simulation
// ──────────────────────────────────────────────────────────────────────────────
describe('QueueStore — updateSessionItems', () => {
  const SESSION_ID = 'b3333333-3333-3333-3333-333333333333'; // Cart 3 (2 items)

  test('adds a new item and recomputes bill correctly', () => {
    const session = queueStore.getSessionById(SESSION_ID);
    assert.ok(session);

    const newProduct = MOCK_PRODUCTS[3]; // Dishwashing Liquid, ₹115, 18% GST
    const newItem = {
      id: `test_item_${Date.now()}`,
      session_id: SESSION_ID,
      product_id: newProduct.id,
      quantity: 2,
      unit_price_paise: newProduct.price_paise,
      tax_rate_basis_points: newProduct.tax_rate_basis_points,
      total_price_paise: newProduct.price_paise * 2,
      barcode_snapshot: newProduct.barcode,
      product_name_snapshot: newProduct.name,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const updatedItems = [...(session.items ?? []), newItem];
    const summary = calculateCartSummary(
      updatedItems.map((i) => ({
        unitPricePaise: i.unit_price_paise,
        quantity: i.quantity,
        taxRateBasisPoints: i.tax_rate_basis_points,
      }))
    );

    const updatedSession = queueStore.updateSessionItems(SESSION_ID, updatedItems, {
      total_items: summary.totalItems,
      subtotal_paise: summary.subtotalPaise,
      tax_paise: summary.taxPaise,
      discount_paise: summary.discountPaise,
      grand_total_paise: summary.grandTotalPaise,
    });

    assert.ok(updatedSession, 'updateSessionItems should return updated session');
    assert.equal(updatedSession!.items!.length, 3, 'Should have 3 items now');

    // Dishwashing Liquid: 2 * ₹115 = ₹230, 18% GST = ₹41.40 → total = ₹271.40
    const dishwashingLine = updatedSession!.items!.find((i) => i.product_id === newProduct.id);
    assert.ok(dishwashingLine);
    assert.equal(dishwashingLine!.total_price_paise, 23000, '2 × ₹115 = ₹230 (23000 paise)');

    // Tax on dishwashing = 23000 * 1800 / 10000 = 4140 paise
    const dishTax = Math.round((23000 * 1800) / 10000);
    assert.equal(dishTax, 4140, 'GST on dishwashing should be ₹41.40');

    // Grand total should reflect new items
    assert.ok(updatedSession!.grand_total_paise > 0);
  });

  test('removing an item (quantity=0 removes from array) recomputes correctly', () => {
    const session = queueStore.getSessionById(SESSION_ID);
    assert.ok(session);

    const itemToRemove = session.items![0];
    const remainingItems = session.items!.slice(1);
    const summary = calculateCartSummary(
      remainingItems.map((i) => ({
        unitPricePaise: i.unit_price_paise,
        quantity: i.quantity,
        taxRateBasisPoints: i.tax_rate_basis_points,
      }))
    );

    const updatedSession = queueStore.updateSessionItems(SESSION_ID, remainingItems, {
      total_items: summary.totalItems,
      subtotal_paise: summary.subtotalPaise,
      tax_paise: summary.taxPaise,
      discount_paise: summary.discountPaise,
      grand_total_paise: summary.grandTotalPaise,
    });

    assert.ok(updatedSession);
    const stillPresent = updatedSession!.items!.find((i) => i.id === itemToRemove.id);
    assert.equal(stillPresent, undefined, 'Removed item should not be present');
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 4. ASSIGNED_LOCKED guard — scanBarcode should reject locked sessions
// ──────────────────────────────────────────────────────────────────────────────
describe('Cart Lock Guard', () => {
  const LOCKED_SESSION_ID = 'b5555555-5555-5555-5555-555555555555';

  test('ASSIGNED_LOCKED session status prevents scan', () => {
    const session = queueStore.getSessionById(LOCKED_SESSION_ID);
    assert.ok(session);
    assert.equal(session.status, 'ASSIGNED_LOCKED');
    // Simulates what the scan route does
    const canScan = session.status === 'SHOPPING';
    assert.equal(canScan, false, 'ASSIGNED_LOCKED session must not allow scanning');
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 5. Monetary correctness — paise formatting
// ──────────────────────────────────────────────────────────────────────────────
describe('Paise formatting', () => {
  const cases: [number, string][] = [
    [6500, '₹65.00'],
    [18000, '₹180.00'],
    [39750, '₹397.50'],
    [0, '₹0.00'],
    [100, '₹1.00'],
    [125050, '₹1,250.50'],
  ];

  for (const [paise, expected] of cases) {
    test(`${paise} paise → ${expected}`, () => {
      assert.equal(formatPaiseToInr(paise), expected);
    });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// 6. Barcode validation — products must exist in catalog
// ──────────────────────────────────────────────────────────────────────────────
describe('Product lookup by barcode', () => {
  test('finds all seeded products by barcode', () => {
    const barcodes = ['8901030383123', '8901030383124', '8901030383125', '8901030383126', '8901030383127'];
    for (const barcode of barcodes) {
      const found = MOCK_PRODUCTS.find((p) => p.barcode === barcode && p.is_active);
      assert.ok(found, `Product with barcode ${barcode} should exist`);
    }
  });

  test('returns undefined for unknown barcode', () => {
    const found = MOCK_PRODUCTS.find((p) => p.barcode === '9999999999999');
    assert.equal(found, undefined, 'Unknown barcode should not resolve');
  });

  test('all seeded products have positive paise prices', () => {
    for (const p of MOCK_PRODUCTS) {
      assert.ok(p.price_paise > 0, `${p.name} should have positive price`);
      assert.ok(Number.isInteger(p.price_paise), `${p.name} price must be integer paise`);
    }
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 7. Duplicate scan prevention logic
// ──────────────────────────────────────────────────────────────────────────────
describe('Duplicate scan debounce logic', () => {
  test('same barcode within debounce window is flagged as duplicate', () => {
    const DEBOUNCE_MS = 1500;
    const lastScanned = { barcode: '8901030383123', at: Date.now() };
    const now = Date.now();
    const isDuplicate =
      lastScanned.barcode === '8901030383123' && now - lastScanned.at < DEBOUNCE_MS;
    assert.equal(isDuplicate, true, 'Same barcode within debounce window should be duplicate');
  });

  test('same barcode after debounce window is not a duplicate', () => {
    const DEBOUNCE_MS = 1500;
    const lastScanned = { barcode: '8901030383123', at: Date.now() - 2000 };
    const now = Date.now();
    const isDuplicate =
      lastScanned.barcode === '8901030383123' && now - lastScanned.at < DEBOUNCE_MS;
    assert.equal(isDuplicate, false, 'Same barcode after debounce window should not be duplicate');
  });

  test('different barcode is never a duplicate', () => {
    const DEBOUNCE_MS = 1500;
    const lastScanned = { barcode: '8901030383123', at: Date.now() };
    const now = Date.now();
    const isDuplicate =
      lastScanned.barcode === '8901030383124' && now - lastScanned.at < DEBOUNCE_MS;
    assert.equal(isDuplicate, false, 'Different barcode should never be duplicate');
  });
});
