/**
 * Closure-based token bucket rate limiter.
 * Tokens refill continuously based on elapsed milliseconds.
 * Inject now() to make behavior deterministic in tests.
 */
function createTokenBucket({ capacity, refillPerSecond, now = () => Date.now() }) {
  if (!Number.isFinite(capacity) || capacity <= 0) throw new RangeError("capacity must be > 0");
  if (!Number.isFinite(refillPerSecond) || refillPerSecond < 0) {
    throw new RangeError("refillPerSecond must be >= 0");
  }

  let tokens = capacity;
  let lastRefill = now();

  function refill() {
    const current = now();
    if (current < lastRefill) throw new Error("Clock must be monotonic");
    const elapsedSeconds = (current - lastRefill) / 1000;
    tokens = Math.min(capacity, tokens + elapsedSeconds * refillPerSecond);
    lastRefill = current;
  }

  return {
    tryConsume(amount = 1) {
      if (!Number.isFinite(amount) || amount <= 0) throw new RangeError("amount must be > 0");
      refill();
      if (tokens < amount) return false;
      tokens -= amount;
      return true;
    },
    timeUntilAvailable(amount = 1) {
      if (!Number.isFinite(amount) || amount <= 0 || amount > capacity) {
        throw new RangeError("amount must be > 0 and <= capacity");
      }
      refill();
      if (tokens >= amount) return 0;
      if (refillPerSecond === 0) return Infinity;
      return Math.ceil(((amount - tokens) / refillPerSecond) * 1000);
    },
    snapshot() {
      refill();
      return { tokens, capacity };
    }
  };
}

let clock = 0;
const limiter = createTokenBucket({ capacity: 3, refillPerSecond: 2, now: () => clock });
console.assert(limiter.tryConsume(2) === true);
console.assert(limiter.tryConsume(2) === false);
console.assert(limiter.timeUntilAvailable(1) === 500);
clock = 500;
console.assert(limiter.tryConsume(1) === true);
console.assert(limiter.snapshot().tokens === 1);
console.log("token bucket practice passed");
