// Exercise: Implement a token bucket with an injectable clock.
// Tokens refill continuously at refillPerSecond; failed requests do not consume tokens.
// Run: node daily/2026-11-20/08-token-bucket-rate-limiter.js
"use strict";
const assert = require("node:assert/strict");
function createTokenBucket({ capacity, refillPerSecond, now = () => Date.now() }) {
  if (!Number.isFinite(capacity) || capacity <= 0) throw new RangeError("capacity must be positive");
  if (!Number.isFinite(refillPerSecond) || refillPerSecond < 0) throw new RangeError("refillPerSecond must be non-negative");
  if (typeof now !== "function") throw new TypeError("now must be a function");
  let tokens = capacity;
  let lastTime = now();
  function refill() {
    const current = now();
    if (!Number.isFinite(current)) throw new TypeError("clock must return a finite number");
    const elapsed = Math.max(0, current - lastTime);
    tokens = Math.min(capacity, tokens + elapsed * refillPerSecond / 1000);
    lastTime = Math.max(lastTime, current);
  }
  function validateCost(cost) {
    if (!Number.isFinite(cost) || cost <= 0 || cost > capacity) throw new RangeError("cost must be in (0, capacity]");
  }
  return Object.freeze({
    tryRemove(cost = 1) {
      validateCost(cost); refill();
      if (tokens + Number.EPSILON < cost) return false;
      tokens -= cost;
      return true;
    },
    timeUntilAvailable(cost = 1) {
      validateCost(cost); refill();
      return Math.max(0, (cost - tokens) / refillPerSecond * 1000);
    },
    get availableTokens() { refill(); return tokens; }
  });
}
let clock = 0;
const bucket = createTokenBucket({ capacity: 5, refillPerSecond: 2, now: () => clock });
assert.equal(bucket.tryRemove(4), true);
assert.equal(bucket.availableTokens, 1);
assert.equal(bucket.tryRemove(2), false);
assert.equal(bucket.timeUntilAvailable(2), 500);
clock += 250;
assert.equal(bucket.availableTokens, 1.5);
clock += 250;
assert.equal(bucket.tryRemove(2), true);
assert.equal(bucket.availableTokens, 0);
clock += 5000;
assert.equal(bucket.availableTokens, 5, "refill must be capped at capacity");
assert.equal(bucket.tryRemove(5), true);
assert.throws(() => bucket.tryRemove(0), /cost/);
assert.throws(() => createTokenBucket({ capacity: 0, refillPerSecond: 1 }), /capacity/);
console.log("token bucket rate limiter: all tests passed");
