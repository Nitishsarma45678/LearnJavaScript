/**
 * Sliding-Window Rate Limiter
 *
 * A closure-based rate limiter that tracks timestamps for each key.
 * It supports both synchronous `allow()` checks and a Promise-based
 * `waitForSlot()` helper that queues callers until capacity is available.
 */

function createRateLimiter(maxRequests, windowMs) {
  if (!Number.isInteger(maxRequests) || maxRequests < 1) {
    throw new TypeError("maxRequests must be a positive integer");
  }

  if (!Number.isFinite(windowMs) || windowMs <= 0) {
    throw new TypeError("windowMs must be greater than 0");
  }

  const history = new Map();
  const waiters = new Map();

  function prune(key, now) {
    const timestamps = history.get(key) || [];
    let firstValid = 0;

    while (
      firstValid < timestamps.length &&
      now - timestamps[firstValid] >= windowMs
    ) {
      firstValid++;
    }

    const active = timestamps.slice(firstValid);

    if (active.length === 0) history.delete(key);
    else history.set(key, active);

    return active;
  }

  function allow(key = "default") {
    const now = Date.now();
    const timestamps = prune(key, now);

    if (timestamps.length >= maxRequests) {
      return false;
    }

    timestamps.push(now);
    history.set(key, timestamps);
    return true;
  }

  function retryDelay(key) {
    const now = Date.now();
    const timestamps = prune(key, now);

    if (timestamps.length < maxRequests) return 0;
    return Math.max(0, windowMs - (now - timestamps[0]));
  }

  function waitForSlot(key = "default") {
    if (allow(key)) return Promise.resolve();

    return new Promise((resolve) => {
      const queue = waiters.get(key) || [];
      queue.push(resolve);
      waiters.set(key, queue);

      const schedule = () => {
        const delay = retryDelay(key);
        setTimeout(() => {
          const pending = waiters.get(key);
          if (!pending || pending.length === 0) return;

          if (!allow(key)) {
            schedule();
            return;
          }

          const next = pending.shift();
          if (pending.length === 0) waiters.delete(key);
          else waiters.set(key, pending);

          next();
        }, delay);
      };

      schedule();
    });
  }

  function reset(key) {
    if (key === undefined) {
      history.clear();
      waiters.clear();
      return;
    }

    history.delete(key);
    waiters.delete(key);
  }

  return { allow, waitForSlot, reset };
}

// Example: at most 3 requests per user every 1000 ms.
const limiter = createRateLimiter(3, 1000);

console.log(limiter.allow("user-42")); // true
console.log(limiter.allow("user-42")); // true
console.log(limiter.allow("user-42")); // true
console.log(limiter.allow("user-42")); // false

limiter.waitForSlot("user-42").then(() => {
  console.log("A request slot is now available");
});

module.exports = { createRateLimiter };
