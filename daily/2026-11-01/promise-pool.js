const assert = require('node:assert/strict');

async function promisePool(items, limit, worker) {
  if (!Number.isInteger(limit) || limit < 1) throw new RangeError('limit must be positive');
  const results = new Array(items.length);
  let next = 0;
  async function run() {
    while (true) {
      const index = next++;
      if (index >= items.length) return;
      results[index] = await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({length: Math.min(limit, items.length)}, run));
  return results;
}
(async () => {
  let active = 0, peak = 0;
  const out = await promisePool([3,1,2,4], 2, async (n) => {
    active++; peak = Math.max(peak, active);
    await new Promise(r => setTimeout(r, n));
    active--; return n * 2;
  });
  assert.deepEqual(out, [6,2,4,8]);
  assert.equal(peak, 2);
  await assert.rejects(() => promisePool([1], 0, async x => x), RangeError);
  await assert.rejects(() => promisePool([1,2], 1, async x => { if (x===2) throw Error('boom'); return x; }), /boom/);
  console.log('Promise pool tests passed');
})().catch(err => { console.error(err); process.exitCode = 1; });