'use strict';

/**
 * Exercise: Implement a deterministic per-key token-bucket rate limiter.
 *
 * Features:
 * - Fractional refill based on an injected millisecond clock.
 * - Weighted requests, burst capacity, retry-after estimates, and inspection.
 * - Monotonic handling of a clock that moves backwards.
 * - Per-key isolation, reset, and idle-key pruning.
 *
 * The injected clock makes tests deterministic and avoids real timers.
 */

function finitePositive(value, name) {
  if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${name} must be a finite positive number`);
  return value;
}

function createTokenBucketLimiter({ capacity, refillPerSecond, now = () => Date.now() }) {
  finitePositive(capacity, 'capacity');
  finitePositive(refillPerSecond, 'refillPerSecond');
  if (typeof now !== 'function') throw new TypeError('now must be a function');

  const buckets = new Map();
  const refillPerMs = refillPerSecond / 1000;

  function readClock() {
    const value = now();
    if (!Number.isFinite(value)) throw new TypeError('clock must return a finite millisecond timestamp');
    return value;
  }

  function getBucket(key) {
    let bucket = buckets.get(key);
    if (!bucket) {
      const time = readClock();
      bucket = { tokens: capacity, lastRefill: time, lastSeen: time };
      buckets.set(key, bucket);
    }
    const observed = readClock();
    // Clamp a backwards clock to the last effective timestamp. Otherwise a
    // later correction could accidentally count the same interval twice.
    const effective = Math.max(observed, bucket.lastRefill);
    const elapsed = effective - bucket.lastRefill;
    bucket.tokens = Math.min(capacity, bucket.tokens + elapsed * refillPerMs);
    bucket.lastRefill = effective;
    bucket.lastSeen = effective;
    return bucket;
  }

  function view(bucket) {
    const tokens = Math.max(0, Math.min(capacity, bucket.tokens));
    return Object.freeze({
      tokens,
      capacity,
      remaining: tokens,
      fullRefillMs: Math.ceil((capacity - tokens) / refillPerMs),
    });
  }

  return Object.freeze({
    tryConsume(key, cost = 1) {
      if (!Number.isFinite(cost) || cost <= 0) throw new RangeError('cost must be a finite positive number');
      if (cost > capacity) throw new RangeError('cost cannot exceed bucket capacity');
      const bucket = getBucket(key);
      if (bucket.tokens + Number.EPSILON >= cost) {
        bucket.tokens = Math.max(0, bucket.tokens - cost);
        return Object.freeze({ allowed: true, ...view(bucket), retryAfterMs: 0 });
      }
      const deficit = cost - bucket.tokens;
      return Object.freeze({
        allowed: false,
        ...view(bucket),
        retryAfterMs: Math.ceil(deficit / refillPerMs),
      });
    },

    inspect(key) {
      return view(getBucket(key));
    },

    reset(key) {
      return buckets.delete(key);
    },

    pruneIdle(maxIdleMs) {
      if (!Number.isFinite(maxIdleMs) || maxIdleMs < 0) throw new RangeError('maxIdleMs must be non-negative');
      const observed = readClock();
      let removed = 0;
      for (const [key, bucket] of buckets) {
        const effective = Math.max(observed, bucket.lastRefill);
        if (effective - bucket.lastSeen >= maxIdleMs) {
          buckets.delete(key);
          removed++;
        }
      }
      return removed;
    },

    get keyCount() { return buckets.size; },
  });
}

// ------------------------------ Tests ------------------------------------
if (require.main === module) {
  const assert = require('node:assert/strict');
  let clock = 0;
  const limiter = createTokenBucketLimiter({ capacity: 5, refillPerSecond: 2, now: () => clock });

  assert.equal(limiter.tryConsume('alice', 4).allowed, true);
  const denied = limiter.tryConsume('alice', 2);
  assert.equal(denied.allowed, false);
  assert.equal(denied.retryAfterMs, 500);
  assert.equal(denied.remaining, 1);

  clock = 500;
  assert.equal(limiter.inspect('alice').tokens, 2);
  assert.equal(limiter.tryConsume('alice', 2).allowed, true);
  assert.equal(limiter.inspect('alice').tokens, 0);

  // A different key has its own full bucket.
  assert.equal(limiter.tryConsume('bob', 5).allowed, true);
  assert.equal(limiter.keyCount, 2);

  // A backwards clock does not create or double-count refill time.
  clock = 100;
  assert.equal(limiter.inspect('alice').tokens, 0);
  clock = 1000;
  assert.equal(limiter.inspect('alice').tokens, 1);

  assert.throws(() => limiter.tryConsume('alice', 6), /exceed/);
  assert.throws(() => limiter.tryConsume('alice', 0), /positive/);
  assert.equal(limiter.reset('bob'), true);
  assert.equal(limiter.reset('bob'), false);

  // Idle pruning is based on the last successful interaction timestamp.
  clock = 2000;
  limiter.inspect('carol');
  clock = 2500;
  assert.equal(limiter.pruneIdle(500), 2); // alice and carol have both been idle for at least 500 ms
  assert.equal(limiter.keyCount, 0);

  console.log('token-bucket-rate-limiter: all tests passed');
}

module.exports = { createTokenBucketLimiter };
