import { describe, it } from 'node:test';
import assert from 'node:assert';
import { queueStore } from '../src/lib/services/queueStore.ts';

describe('ZeroWait Queue Store & Assignment Service', () => {
  it('retrieves cart and computes authoritative server bill in paise', () => {
    const result = queueStore.getCartByQrCode('ZW-CART-001');
    assert.ok(result);
    assert.strictEqual(result.cart.qr_code, 'ZW-CART-001');
    assert.ok(result.active_session);
    assert.strictEqual(result.active_session.status, 'SHOPPING');
    assert.strictEqual(result.active_session.total_items, 4);

    // Verify authoritative bill computed on server
    assert.ok(result.authoritative_bill);
    assert.strictEqual(result.authoritative_bill.total_items, 4);
    assert.strictEqual(result.authoritative_bill.subtotal_paise, 37000); // ₹370.00
    assert.strictEqual(result.authoritative_bill.tax_paise, 1850); // ₹18.50
    assert.strictEqual(result.authoritative_bill.grand_total_paise, 38850); // ₹388.50
  });

  it('rejects allocation for an empty cart without locking session', () => {
    const emptyCart = queueStore.getCartByQrCode('ZW-CART-004');
    assert.ok(emptyCart?.active_session);
    assert.strictEqual(emptyCart.active_session.total_items, 0);

    const assignResult = queueStore.assignCartToLane(emptyCart.active_session.id);
    assert.strictEqual(assignResult.success, false);
    assert.strictEqual(assignResult.error?.code, 'EMPTY_CART');

    // Confirm session status was NOT locked
    const refetched = queueStore.getCartByQrCode('ZW-CART-004');
    assert.strictEqual(refetched?.active_session?.status, 'SHOPPING');
  });

  it('excludes express lanes for large trolley with > 10 items', () => {
    const largeCart = queueStore.getCartByQrCode('ZW-CART-002');
    assert.ok(largeCart?.active_session);
    assert.strictEqual(largeCart.active_session.total_items, 18);

    const assignResult = queueStore.assignCartToLane(largeCart.active_session.id);
    assert.strictEqual(assignResult.success, true);
    assert.ok(assignResult.assignment);

    // Express counter has id d1111111-1111-1111-1111-111111111111 with limit 10
    // Large cart MUST NOT be assigned to Express counter!
    assert.notStrictEqual(assignResult.assignment.lane_id, 'd1111111-1111-1111-1111-111111111111');
    assert.strictEqual(assignResult.session_status, 'ASSIGNED_LOCKED');
  });

  it('assigns cart to optimal lane and locks session atomically', () => {
    const cart3 = queueStore.getCartByQrCode('ZW-CART-003');
    assert.ok(cart3?.active_session);

    const assignResult = queueStore.assignCartToLane(cart3.active_session.id);
    assert.strictEqual(assignResult.success, true);
    assert.ok(assignResult.assignment);
    assert.strictEqual(assignResult.session_status, 'ASSIGNED_LOCKED');

    // Check refetched cart is now ASSIGNED_LOCKED
    const refetched = queueStore.getCartByQrCode('ZW-CART-003');
    assert.strictEqual(refetched?.active_session?.status, 'ASSIGNED_LOCKED');
    assert.ok(refetched?.active_session?.locked_at);
  });

  it('prevents duplicate assignment on repeated scans (Idempotency)', () => {
    // Cart 5 is already assigned and locked
    const cart5 = queueStore.getCartByQrCode('ZW-CART-005');
    assert.ok(cart5?.active_session);
    assert.strictEqual(cart5.active_session.status, 'ASSIGNED_LOCKED');

    const firstToken = cart5.assignment?.token_number;
    assert.ok(firstToken);

    // Attempting to assign again must return existing assignment without duplicating
    const reassignResult = queueStore.assignCartToLane(cart5.active_session.id);
    assert.strictEqual(reassignResult.success, true);
    assert.strictEqual(reassignResult.assignment?.token_number, firstToken);
  });
});
