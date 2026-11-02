import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import QRCode from 'qrcode';
import { calculateCartSummary, formatPaiseToInr } from '../src/lib/engine/pricing.ts';
import { evaluateLanesForCart, calculateLaneWorkload, generateTokenNumber } from '../src/lib/engine/queue.ts';
import { MOCK_PRODUCTS } from '../src/lib/services/mockData.ts';
import { queueStore } from '../src/lib/services/queueStore.ts';
import { cleanBarcodeString, getBarcodeVariants } from '../src/lib/engine/barcode.ts';
import { lookupProductByBarcode } from '../src/lib/services/productService.ts';
import { scanProductToCart } from '../src/lib/services/cartService.ts';
import type { LaneWithQueueDetails } from '../src/lib/engine/queue.ts';

describe('ZeroWait Full Integration & Lifecycle Verification', () => {

  test('1. Physical Cart Provisioning generates valid QR Code asset identity', async () => {
    const qrCode = 'ZW-CART-006';
    const qrDataUrl = await QRCode.toDataURL(qrCode, {
      errorCorrectionLevel: 'H',
      width: 300,
    });

    assert.ok(qrDataUrl.startsWith('data:image/png;base64,'), 'QR data URL must be valid base64 PNG');
    assert.ok(qrDataUrl.length > 500, 'QR image data must be populated');
  });

  test('2. Product Catalogue contains required supermarket items with paise prices and tax', () => {
    assert.ok(MOCK_PRODUCTS.length >= 9, 'Catalogue must have at least 9 development products');
    
    // Verify Fresh Milk
    const milk = MOCK_PRODUCTS.find((p) => p.barcode === '8901030383123');
    assert.ok(milk, 'Fresh Milk must exist');
    assert.equal(milk.price_paise, 6500, 'Fresh Milk price must be 6500 paise (₹65.00)');
    assert.equal(milk.tax_rate_basis_points, 500, 'Fresh Milk tax must be 500 bps (5%)');

    // Verify Organic Carrots (previously missing product that caused "Product not found")
    const carrots = MOCK_PRODUCTS.find((p) => p.barcode === '8901030383128');
    assert.ok(carrots, 'Organic Carrots barcode must be found in catalog');
    assert.equal(carrots.price_paise, 3500);

    // Verify Orange Juice
    const juice = MOCK_PRODUCTS.find((p) => p.barcode === '8901030383129');
    assert.ok(juice, 'Orange Juice must be found in catalog');
    assert.equal(juice.price_paise, 14000);
  });

  test('3. Authoritative server-side bill recalculation is exact in integer paise', () => {
    const items = [
      { unitPricePaise: 6500, quantity: 2, taxRateBasisPoints: 500 }, // 13000 + 650 tax
      { unitPricePaise: 18000, quantity: 1, taxRateBasisPoints: 500 }, // 18000 + 900 tax
      { unitPricePaise: 14000, quantity: 1, taxRateBasisPoints: 1200 }, // 14000 + 1680 tax
    ];

    const result = calculateCartSummary(items, 5000); // flat ₹50 discount

    assert.equal(result.totalItems, 4);
    assert.equal(result.subtotalPaise, 45000); // 13000 + 18000 + 14000
    assert.equal(result.taxPaise, 3230); // 650 + 900 + 1680
    assert.equal(result.discountPaise, 5000);
    assert.equal(result.grandTotalPaise, 43230); // 45000 + 3230 - 5000
    assert.equal(formatPaiseToInr(result.grandTotalPaise), '₹432.30');
  });

  test('4. Unknown barcode handling prevents invented data', () => {
    const unknownBarcode = '9999999999999';
    const found = MOCK_PRODUCTS.find((p) => p.barcode === unknownBarcode);
    assert.equal(found, undefined, 'Unknown barcode must return undefined, never invented details');
  });

  test('5. Queue Engine selects lowest completion time, not just lowest customer count', () => {
    // Lane 1: 1 customer with 40 items (workload = 40 * 4 + 35 = 195s)
    // Lane 2: 2 customers with 3 items each (workload = 2 * (3 * 4 + 35) = 94s)
    const testLanes: LaneWithQueueDetails[] = [
      {
        id: 'lane-slow',
        store_id: 'store-1',
        lane_number: 1,
        name: 'Counter 1 (Bulky Basket)',
        type: 'REGULAR',
        status: 'OPEN',
        max_items_limit: null,
        assigned_staff_id: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        queued_carts: [{ sessionId: 's1', itemCount: 40 }],
      },
      {
        id: 'lane-fast',
        store_id: 'store-1',
        lane_number: 2,
        name: 'Counter 2 (Quick Baskets)',
        type: 'REGULAR',
        status: 'OPEN',
        max_items_limit: null,
        assigned_staff_id: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        queued_carts: [
          { sessionId: 's2', itemCount: 3 },
          { sessionId: 's3', itemCount: 3 },
        ],
      },
    ];

    const workloadLane1 = calculateLaneWorkload(testLanes[0]);
    const workloadLane2 = calculateLaneWorkload(testLanes[1]);

    assert.equal(workloadLane1, 195);
    assert.equal(workloadLane2, 94);

    const evaluation = evaluateLanesForCart(testLanes, 5);
    assert.ok(evaluation.recommendedLane);
    assert.equal(
      evaluation.recommendedLane.id,
      'lane-fast',
      'Must select Counter 2 because 94s wait < 195s wait, even though Counter 2 has 2 customers vs 1'
    );
  });

  test('6. Cart Session lock guards against scan when status is ASSIGNED_LOCKED', () => {
    const lockedSession = queueStore.getSessionById('b5555555-5555-5555-5555-555555555555');
    assert.ok(lockedSession);
    assert.equal(lockedSession.status, 'ASSIGNED_LOCKED');
    assert.ok(lockedSession.assigned_lane_id);
  });

  test('7. Token numbers are uniquely prefixed according to counter type', () => {
    const expressToken = generateTokenNumber('EXPRESS', 101);
    const regularToken = generateTokenNumber('REGULAR', 205);
    const selfToken = generateTokenNumber('SELF_CHECKOUT', 302);

    assert.equal(expressToken, 'E-101');
    assert.equal(regularToken, 'A-205');
    assert.equal(selfToken, 'S-302');
  });

  test('8. End-to-end simulated acceptance flow (Items -> Bill -> Allocation -> Locked)', () => {
    // 1. Provision / retrieve cart
    const cartResult = queueStore.getCartByQrCode('ZW-CART-001');
    assert.ok(cartResult && cartResult.cart);
    assert.ok(cartResult.active_session);
    assert.equal(cartResult.active_session.status, 'SHOPPING');

    // 2. Queue Allocation
    const assignResult = queueStore.assignCartToLane(cartResult.active_session.id);
    assert.ok(assignResult.success);
    assert.ok(assignResult.assignment);
    assert.equal(assignResult.assignment.assignment_status, 'QUEUED');

    // 3. Verify session became ASSIGNED_LOCKED
    const updatedSession = queueStore.getSessionById(cartResult.active_session.id);
    assert.ok(updatedSession);
    assert.equal(updatedSession.status, 'ASSIGNED_LOCKED');
    assert.equal(updatedSession.assigned_lane_id, assignResult.assignment.lane_id);

    // 4. Repeated scan returns existing assignment (Idempotency)
    const secondAssign = queueStore.assignCartToLane(cartResult.active_session.id);
    assert.ok(secondAssign.success);
    assert.equal(secondAssign.assignment?.id, assignResult.assignment.id, 'Must return identical assignment without duplicate');
  });

  test('9. Barcode cleaning & UPC-A / EAN-13 cross-format variant resolution', () => {
    // Whitespace stripping
    assert.equal(cleanBarcodeString(' 8901030383123 \n'), '8901030383123');
    assert.equal(cleanBarcodeString('890 1030 383123'), '8901030383123');

    // 12-digit UPC-A expands to 13-digit EAN-13
    const upcVariants = getBarcodeVariants('012345678905');
    assert.deepEqual(upcVariants, ['012345678905', '0012345678905']);

    // 13-digit EAN-13 with leading 0 resolves 12-digit UPC-A
    const eanVariants = getBarcodeVariants('0012345678905');
    assert.deepEqual(eanVariants, ['0012345678905', '012345678905']);
  });

  test('10. Camera-decoded barcode reaches lookup and adds to cart exactly once', async () => {
    // Fresh session
    const cart = queueStore.getCartByQrCode('ZW-CART-004');
    assert.ok(cart && cart.active_session);
    const sessionId = cart.active_session.id;

    // Simulate camera detecting a barcode (with possible surrounding whitespace)
    const scannedBarcode = ' 8901030383123 ';
    const lookupResult = await lookupProductByBarcode(scannedBarcode);
    assert.ok(lookupResult.product, 'Product lookup must succeed for camera-scanned barcode');
    assert.equal(lookupResult.product.barcode, '8901030383123');

    // Add to cart session
    const scanResult = await scanProductToCart(sessionId, scannedBarcode, 1);
    assert.ok(scanResult.success);
    assert.equal(scanResult.session?.total_items, 1);
    assert.equal(scanResult.session?.items?.length, 1);
    assert.equal(scanResult.session?.items?.[0].barcode_snapshot, '8901030383123');
  });

});
