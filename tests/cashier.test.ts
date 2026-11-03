import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateAndFetchCashierCart,
  checkinCashierCart,
  settleCashierCheckout,
  releaseCashierCartSession,
  getCashierLanes,
} from '../src/lib/services/cashierService.ts';
import { queueStore } from '../src/lib/services/queueStore.ts';
import { calculateCartSummary, formatPaiseToInr } from '../src/lib/engine/pricing.ts';

describe('ZeroWait Cashier Module Unit & Integration Tests', () => {

  test('1. Rejects unknown or malformed cart QR code', async () => {
    const emptyResult = await validateAndFetchCashierCart('');
    assert.equal(emptyResult.success, false);
    assert.equal(emptyResult.error?.code, 'INVALID_QR_CODE');

    const unknownResult = await validateAndFetchCashierCart('ZW-NONEXISTENT-CART');
    assert.equal(unknownResult.success, false);
    assert.equal(unknownResult.error?.code, 'CART_NOT_FOUND');
  });

  test('2. Rejects cart that is still in SHOPPING status (not yet allocated to queue)', async () => {
    // ZW-CART-001 is seeded with SHOPPING status
    const result = await validateAndFetchCashierCart('ZW-CART-001');
    assert.equal(result.success, false);
    assert.equal(result.error?.code, 'CART_NOT_IN_QUEUE');
    assert.ok(result.error?.message.includes('SHOPPING mode'));
  });

  test('3. Rejects empty cart with 0 scanned items', async () => {
    // ZW-CART-004 is empty
    const result = await validateAndFetchCashierCart('ZW-CART-004');
    assert.equal(result.success, false);
    assert.ok(
      result.error?.code === 'EMPTY_CART' || result.error?.code === 'CART_NOT_IN_QUEUE',
      'Must reject empty cart or unassigned cart'
    );
  });

  test('4. Successfully validates and fetches eligible ASSIGNED_LOCKED cart (ZW-CART-005)', async () => {
    // ZW-CART-005 is pre-seeded with ASSIGNED_LOCKED status to Counter 1 (Express)
    const result = await validateAndFetchCashierCart(
      'ZW-CART-005',
      'd1111111-1111-1111-1111-111111111111' // Matching lane
    );

    assert.equal(result.success, true);
    assert.ok(result.data, 'Cart details must be returned');
    assert.equal(result.data.cart.qr_code, 'ZW-CART-005');
    assert.equal(result.data.session.status, 'ASSIGNED_LOCKED');
    assert.equal(result.data.lane_mismatch, false);
    assert.ok(result.data.items.length > 0, 'Cart must have scanned items');
    assert.equal(result.data.authoritative_bill.total_items, 3);
    assert.equal(result.data.authoritative_bill.grand_total_paise, 32550);
  });

  test('5. Flags lane mismatch when cart is scanned at a different counter than allocated', async () => {
    // ZW-CART-005 is allocated to Counter 1 ('d1111111...'), but scanned at Counter 2 ('d2222222...')
    const result = await validateAndFetchCashierCart(
      'ZW-CART-005',
      'd2222222-2222-2222-2222-222222222222' // Counter 2 (Mismatch!)
    );

    assert.equal(result.success, true);
    assert.ok(result.data);
    assert.equal(result.data.lane_mismatch, true);
    assert.ok(result.data.lane_mismatch_message?.includes('allocated to'));
  });

  test('6. Authoritative server-side price integrity matches calculateCartSummary', async () => {
    const result = await validateAndFetchCashierCart('ZW-CART-005');
    assert.equal(result.success, true);
    assert.ok(result.data);

    const { items, authoritative_bill, session } = result.data;
    const calc = calculateCartSummary(
      items.map((i) => ({
        unitPricePaise: i.unit_price_paise,
        quantity: i.quantity,
        taxRateBasisPoints: i.tax_rate_basis_points,
      })),
      session.discount_paise
    );

    assert.equal(authoritative_bill.subtotal_paise, calc.subtotalPaise);
    assert.equal(authoritative_bill.tax_paise, calc.taxPaise);
    assert.equal(authoritative_bill.grand_total_paise, calc.grandTotalPaise);
    assert.equal(formatPaiseToInr(authoritative_bill.grand_total_paise), '₹325.50');
  });

  test('7. Counter check-in updates status to AT_CHECKOUT and assignment to SERVING', async () => {
    const cartRes = await validateAndFetchCashierCart('ZW-CART-005');
    assert.ok(cartRes.data);
    const sessionId = cartRes.data.session.id;
    const laneId = cartRes.data.session.assigned_lane_id!;

    const checkinRes = await checkinCashierCart(sessionId, laneId, 'staff-001');
    assert.equal(checkinRes.success, true);

    const recheck = await validateAndFetchCashierCart('ZW-CART-005', laneId);
    assert.equal(recheck.success, true);
    assert.equal(recheck.data?.session.status, 'AT_CHECKOUT');
    assert.equal(recheck.data?.assignment?.assignment_status, 'SERVING');
  });

  test('8. Mark as Paid atomically settles transaction in integer paise', async () => {
    const cartRes = await validateAndFetchCashierCart('ZW-CART-005');
    assert.ok(cartRes.data);
    const sessionId = cartRes.data.session.id;
    const grandTotal = cartRes.data.authoritative_bill.grand_total_paise;

    const settleRes = await settleCashierCheckout({
      sessionId,
      paymentMethod: 'UPI',
      paymentReference: 'UPI-TEST-998811',
      amountPaise: grandTotal,
      cashierId: 'staff-001',
    });

    assert.equal(settleRes.success, true);
    assert.ok(settleRes.transaction);
    assert.equal(settleRes.transaction.status, 'COMPLETED');
    assert.equal(settleRes.transaction.payment_method, 'UPI');
    assert.equal(settleRes.transaction.amount_paise, grandTotal);
    assert.ok(settleRes.transaction.invoice_number?.startsWith('INV-'));

    // Verify session status is now PAID
    const session = queueStore.getSessionById(sessionId);
    assert.equal(session?.status, 'PAID');
  });

  test('9. Idempotency: Duplicate settlement attempt returns existing transaction', async () => {
    const cartRes = queueStore.getCartByQrCode('ZW-CART-005');
    assert.ok(cartRes && cartRes.active_session);
    const sessionId = cartRes.active_session.id;

    // Settle again
    const secondSettle = await settleCashierCheckout({
      sessionId,
      paymentMethod: 'UPI',
      amountPaise: 32550,
      cashierId: 'staff-001',
    });

    assert.equal(secondSettle.success, true);
    assert.ok(secondSettle.transaction);
    assert.equal(secondSettle.transaction.status, 'COMPLETED');
  });

  test('10. Scanning already PAID cart is rejected from new checkout', async () => {
    const result = await validateAndFetchCashierCart('ZW-CART-005');
    assert.equal(result.success, false);
    assert.equal(result.error?.code, 'CART_ALREADY_PAID');
  });

  test('11. Release cart closes session and unlocks physical cart for next customer', async () => {
    const cartRes = queueStore.getCartByQrCode('ZW-CART-005');
    assert.ok(cartRes && cartRes.active_session);
    const sessionId = cartRes.active_session.id;

    const releaseRes = await releaseCashierCartSession(sessionId, 'staff-001');
    assert.equal(releaseRes.success, true);

    const session = queueStore.getSessionById(sessionId);
    assert.equal(session?.status, 'CLOSED');

    // Scanning the physical cart again now yields no active session or a fresh unallocated session
    const postRelease = await validateAndFetchCashierCart('ZW-CART-005');
    assert.equal(postRelease.success, false);
    assert.ok(
      postRelease.error?.code === 'NO_ACTIVE_SESSION' ||
        postRelease.error?.code === 'CART_NOT_IN_QUEUE',
      'Released cart cannot be checked out until a new shopping trip is queued'
    );
  });

  test('12. getCashierLanes returns active store checkout counters', async () => {
    const { lanes } = await getCashierLanes();
    assert.ok(lanes.length >= 3, 'Must have at least 3 counters');
    assert.equal(lanes[0].lane_number, 1);
    assert.equal(lanes[0].type, 'EXPRESS');
  });

});
