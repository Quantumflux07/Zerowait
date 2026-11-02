import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  calculateCartServiceTime,
  calculateLaneWorkload,
  evaluateLanesForCart,
  type LaneWithQueueDetails,
} from '../src/lib/engine/queue.ts';

describe('ZeroWait Queue Engine Algorithm', () => {
  it('calculates service time correctly with scan rate and payment handoff', () => {
    // 5 items * 4s + 35s = 55s
    const time = calculateCartServiceTime(5, 4, 35);
    assert.strictEqual(time, 55);

    // 0 items = 35s
    assert.strictEqual(calculateCartServiceTime(0, 4, 35), 35);
  });

  it('NEVER selects a lane purely because it has fewer customers when workload is higher', () => {
    // Lane 1 has 1 customer with a huge basket of 50 items
    // Lane 1 Workload = 50 * 4 + 35 = 235s
    const lane1: LaneWithQueueDetails = {
      id: 'lane-1',
      store_id: 'store-1',
      lane_number: 1,
      name: 'Counter 1 (Regular)',
      type: 'REGULAR',
      status: 'OPEN',
      max_items_limit: null,
      assigned_staff_id: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      current_queue_count: 1,
      queued_carts: [{ sessionId: 'sess-1', itemCount: 50 }],
    };

    // Lane 2 has 2 customers, but each has only 3 small items
    // Lane 2 Workload = (3 * 4 + 35) + (3 * 4 + 35) = 47 + 47 = 94s
    const lane2: LaneWithQueueDetails = {
      id: 'lane-2',
      store_id: 'store-1',
      lane_number: 2,
      name: 'Counter 2 (Regular)',
      type: 'REGULAR',
      status: 'OPEN',
      max_items_limit: null,
      assigned_staff_id: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      current_queue_count: 2,
      queued_carts: [
        { sessionId: 'sess-2', itemCount: 3 },
        { sessionId: 'sess-3', itemCount: 3 },
      ],
    };

    const incomingItemCount = 5;
    const result = evaluateLanesForCart([lane1, lane2], incomingItemCount);

    // Lane 2 has MORE customers (2 vs 1), but its wait time is only 94s compared to Lane 1's 235s.
    // The algorithm MUST assign to Lane 2!
    assert.strictEqual(result.recommendedLane?.id, 'lane-2');
    assert.strictEqual(result.estimate?.recommendedLaneId, 'lane-2');
    assert.ok(
      result.allEvaluations.find((e) => e.lane.id === 'lane-2')!.predictedCompletionSeconds <
        result.allEvaluations.find((e) => e.lane.id === 'lane-1')!.predictedCompletionSeconds
    );
  });

  it('excludes closed and paused lanes from assignment', () => {
    const closedLane: LaneWithQueueDetails = {
      id: 'lane-closed',
      store_id: 'store-1',
      lane_number: 1,
      name: 'Counter 1 (Closed)',
      type: 'REGULAR',
      status: 'CLOSED',
      max_items_limit: null,
      assigned_staff_id: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      current_queue_count: 0,
      estimated_wait_seconds: 0,
    };

    const pausedLane: LaneWithQueueDetails = {
      id: 'lane-paused',
      store_id: 'store-1',
      lane_number: 2,
      name: 'Counter 2 (Paused)',
      type: 'REGULAR',
      status: 'PAUSED',
      max_items_limit: null,
      assigned_staff_id: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      current_queue_count: 0,
      estimated_wait_seconds: 0,
    };

    const openLane: LaneWithQueueDetails = {
      id: 'lane-open',
      store_id: 'store-1',
      lane_number: 3,
      name: 'Counter 3 (Open)',
      type: 'REGULAR',
      status: 'OPEN',
      max_items_limit: null,
      assigned_staff_id: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      current_queue_count: 1,
      estimated_wait_seconds: 60,
    };

    const result = evaluateLanesForCart([closedLane, pausedLane, openLane], 4);
    assert.strictEqual(result.recommendedLane?.id, 'lane-open');
    assert.strictEqual(result.allEvaluations.find((e) => e.lane.id === 'lane-closed')?.isEligible, false);
    assert.strictEqual(result.allEvaluations.find((e) => e.lane.id === 'lane-paused')?.isEligible, false);
  });

  it('excludes express lanes when cart item count exceeds limit', () => {
    const expressLane: LaneWithQueueDetails = {
      id: 'lane-express',
      store_id: 'store-1',
      lane_number: 1,
      name: 'Counter 1 (Express)',
      type: 'EXPRESS',
      status: 'OPEN',
      max_items_limit: 10,
      assigned_staff_id: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      current_queue_count: 0,
      estimated_wait_seconds: 0,
    };

    const regularLane: LaneWithQueueDetails = {
      id: 'lane-reg',
      store_id: 'store-1',
      lane_number: 2,
      name: 'Counter 2 (Regular)',
      type: 'REGULAR',
      status: 'OPEN',
      max_items_limit: null,
      assigned_staff_id: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      current_queue_count: 2,
      estimated_wait_seconds: 120,
    };

    // 15 items exceeds express limit of 10
    const result = evaluateLanesForCart([expressLane, regularLane], 15);
    assert.strictEqual(result.recommendedLane?.id, 'lane-reg');
    const expressEval = result.allEvaluations.find((e) => e.lane.id === 'lane-express');
    assert.strictEqual(expressEval?.isEligible, false);
    assert.ok(expressEval?.ineligibilityReason?.includes('exceeds express limit'));
  });

  it('handles scenario when all lanes are unavailable', () => {
    const closedLane: LaneWithQueueDetails = {
      id: 'lane-closed',
      store_id: 'store-1',
      lane_number: 1,
      name: 'Counter 1',
      type: 'REGULAR',
      status: 'CLOSED',
      max_items_limit: null,
      assigned_staff_id: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      current_queue_count: 0,
    };

    const result = evaluateLanesForCart([closedLane], 3);
    assert.strictEqual(result.recommendedLane, null);
    assert.ok(result.error?.includes('No open checkout lanes'));
  });

  it('factors in cashier scan speed data when available', () => {
    // Fast cashier: 2 seconds per item
    const fastLane: LaneWithQueueDetails = {
      id: 'lane-fast',
      store_id: 'store-1',
      lane_number: 1,
      name: 'Fast Lane',
      type: 'REGULAR',
      status: 'OPEN',
      max_items_limit: null,
      assigned_staff_id: 'staff-fast',
      cashier_speed_seconds_per_item: 2,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      current_queue_count: 1,
      queued_carts: [{ sessionId: 's1', itemCount: 10 }], // 10 * 2 + 35 = 55s
    };

    // Slow/training cashier: 6 seconds per item
    const slowLane: LaneWithQueueDetails = {
      id: 'lane-slow',
      store_id: 'store-1',
      lane_number: 2,
      name: 'Standard Lane',
      type: 'REGULAR',
      status: 'OPEN',
      max_items_limit: null,
      assigned_staff_id: 'staff-slow',
      cashier_speed_seconds_per_item: 6,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      current_queue_count: 1,
      queued_carts: [{ sessionId: 's2', itemCount: 10 }], // 10 * 6 + 35 = 95s
    };

    const result = evaluateLanesForCart([fastLane, slowLane], 5);
    assert.strictEqual(result.recommendedLane?.id, 'lane-fast');
  });
});
