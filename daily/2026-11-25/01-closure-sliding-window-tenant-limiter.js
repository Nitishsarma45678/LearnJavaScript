'use strict';

// Exercise: implement an exact sliding-window rate limiter with isolated tenant
// state, bounded memory, an injectable clock, and least-recently-used eviction.

function createTenantLimiter({ limit, windowMs, maxTenants = 1000, now = Date.now }) {
  if (!Number.isInteger(limit) || limit < 1) throw new RangeError('limit must be positive');
  if (!(windowMs > 0) || !(maxTenants >= 1)) throw new RangeError('invalid window or capacity');

  const tenants = new Map();

  function getState(key, time) {
    let state = tenants.get(key);
    if (!state) {
      if (tenants.size >= maxTenants) {
        const oldest = tenants.keys().next().value;
        tenants.delete(oldest);
      }
      state = { events: [], lastSeen: time };
      tenants.set(key, state);
    } else {
      // Map insertion order doubles as the LRU order.
      tenants.delete(key);
      tenants.set(key, state);
    }
    state.lastSeen = time;
    return state;
  }

  function consume(key, cost = 1) {
    if (key === undefined || key === null) throw new TypeError('tenant key is required');
    if (!Number.isInteger(cost) || cost < 1 || cost > limit) {
      throw new RangeError('cost must be an integer between 1 and limit');
    }

    const time = now();
    const state = getState(key, time);
    const cutoff = time - windowMs;
    while (state.events.length && state.events[0].time <= cutoff) state.events.shift();

    const used = state.events.reduce((sum, event) => sum + event.cost, 0);
    const allowed = used + cost <= limit;
    if (allowed) state.events.push({ time, cost });

    const remaining = Math.max(0, limit - used - (allowed ? cost : 0));
    const resetAt = state.events.length ? state.events[0].time + windowMs : time;
    return { allowed, remaining, resetAt, retryAfterMs: allowed ? 0 : Math.max(0, resetAt - time) };
  }

  function forget(key) { return tenants.delete(key); }
  function stats() { return { tenants: tenants.size, keys: [...tenants.keys()] }; }

  return Object.freeze({ consume, forget, stats });
}

if (require.main === module) {
  const assert = require('node:assert/strict');
  let clock = 1000;
  const limiter = createTenantLimiter({ limit: 5, windowMs: 1000, maxTenants: 2, now: () => clock });

  assert.deepEqual(limiter.consume('alpha', 3), {
    allowed: true, remaining: 2, resetAt: 2000, retryAfterMs: 0
  });
  assert.equal(limiter.consume('alpha', 3).allowed, false);
  assert.equal(limiter.consume('beta', 2).remaining, 3);
  limiter.consume('gamma'); // Evicts least recently used tenant: alpha.
  assert.deepEqual(limiter.stats().keys, ['beta', 'gamma']);
  assert.equal(limiter.consume('alpha').allowed, true);

  clock = 2001;
  assert.equal(limiter.consume('alpha', 5).allowed, true); // Old events expired.
  assert.equal(limiter.forget('alpha'), true);
  assert.equal(limiter.forget('missing'), false);
  assert.throws(() => limiter.consume('alpha', 0), RangeError);
  console.log('sliding-window tenant limiter: all tests passed');
}

module.exports = { createTenantLimiter };
