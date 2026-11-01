const assert = require('node:assert/strict');

class TTLRUCache {
  constructor(capacity, now = () => Date.now()) {
    if (!Number.isInteger(capacity) || capacity < 1) throw new RangeError('capacity must be positive');
    this.capacity = capacity; this.now = now; this.map = new Map();
  }
  get(key) {
    const entry = this.map.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= this.now()) { this.map.delete(key); return undefined; }
    this.map.delete(key); this.map.set(key, entry);
    return entry.value;
  }
  set(key, value, ttlMs = Infinity) {
    if (ttlMs <= 0) { this.map.delete(key); return; }
    this.map.delete(key);
    this.map.set(key, {value, expiresAt: ttlMs === Infinity ? Infinity : this.now()+ttlMs});
    for (const [k,e] of this.map) if (e.expiresAt <= this.now()) this.map.delete(k);
    while (this.map.size > this.capacity) this.map.delete(this.map.keys().next().value);
  }
  get size() { return this.map.size; }
}
let clock = 100;
const c = new TTLRUCache(2, () => clock);
c.set('a',1,10); c.set('b',2); assert.equal(c.get('a'),1);
c.set('c',3); assert.equal(c.get('b'),undefined); assert.equal(c.get('a'),1);
clock = 111; assert.equal(c.get('a'),undefined);
assert.equal(c.get('c'),3);
console.log('TTL LRU tests passed');