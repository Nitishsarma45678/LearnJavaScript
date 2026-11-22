/**
 * Exercise: Implement an async stale-while-revalidate cache.
 * Fresh reads return cached values. Stale reads return immediately and start
 * one background refresh per key. Expired/missing reads await the loader.
 * Failed refreshes preserve the last successful value until stale expiry.
 * Run: node 06-stale-while-revalidate-cache.js
 */
"use strict";
const assert = require("node:assert/strict");

class StaleWhileRevalidateCache {
  constructor({ ttlMs, staleMs, now = Date.now } = {}) {
    if (!(ttlMs >= 0) || !(staleMs >= 0)) throw new RangeError("invalid cache durations");
    this.ttlMs = ttlMs;
    this.staleMs = staleMs;
    this.now = now;
    this.entries = new Map();
  }
  async get(key, loader) {
    if (typeof loader !== "function") throw new TypeError("loader must be a function");
    const entry = this.entries.get(key);
    if (entry) {
      const age = this.now() - entry.storedAt;
      if (age <= this.ttlMs) return entry.value;
      if (age <= this.ttlMs + this.staleMs) {
        if (!entry.pending) void this.refresh(key, loader).catch(() => {});
        return entry.value;
      }
    }
    return this.refresh(key, loader);
  }
  refresh(key, loader) {
    const current = this.entries.get(key);
    if (current?.pending) return current.pending;

    const pending = Promise.resolve()
      .then(() => loader(key))
      .then(value => {
        this.entries.set(key, { value, storedAt: this.now(), pending: null });
        return value;
      }, error => {
        const latest = this.entries.get(key);
        if (latest) this.entries.set(key, { ...latest, pending: null });
        else this.entries.delete(key);
        throw error;
      });

    this.entries.set(key, { ...(current || {}), pending });
    return pending;
  }
  invalidate(key) { return this.entries.delete(key); }
  clear() { this.entries.clear(); }
  inspect(key) {
    const entry = this.entries.get(key);
    if (!entry) return null;
    return { value: entry.value, storedAt: entry.storedAt, refreshing: !!entry.pending };
  }
}

(async () => {
  let clock = 0, loads = 0;
  const cache = new StaleWhileRevalidateCache({ ttlMs: 10, staleMs: 100, now: () => clock });
  const loader = async () => ++loads;
  assert.equal(await cache.get("user:1", loader), 1);
  clock = 5;
  assert.equal(await cache.get("user:1", loader), 1); // fresh
  assert.equal(loads, 1);
  clock = 20;
  assert.equal(await cache.get("user:1", loader), 1); // stale, refresh in background
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(cache.inspect("user:1").value, 2);
  assert.equal(loads, 2);
  clock = 200;
  assert.equal(await cache.get("user:1", loader), 3); // expired, wait for refresh
  cache.invalidate("user:1");
  assert.equal(cache.inspect("user:1"), null);
  cache.clear();
  console.log("stale-while-revalidate cache tests passed");
})().catch(error => { console.error(error); process.exitCode = 1; });

module.exports = { StaleWhileRevalidateCache };
