/*
 * Sliding-window median with two heaps and lazy deletion.
 * Time: O(n log k); auxiliary space: O(k).
 */
class Heap {
  constructor(compare) { this.a = []; this.compare = compare; }
  get size() { return this.a.length; }
  peek() { return this.a[0]; }
  push(value) {
    const a = this.a;
    a.push(value);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.compare(a[i], a[p]) >= 0) break;
      [a[i], a[p]] = [a[p], a[i]];
      i = p;
    }
  }
  pop() {
    const a = this.a;
    if (!a.length) return undefined;
    const root = a[0], last = a.pop();
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1, r = l + 1;
        let best = i;
        if (l < a.length && this.compare(a[l], a[best]) < 0) best = l;
        if (r < a.length && this.compare(a[r], a[best]) < 0) best = r;
        if (best === i) break;
        [a[i], a[best]] = [a[best], a[i]];
        i = best;
      }
    }
    return root;
  }
}
const cmp = (a, b) => a < b ? -1 : a > b ? 1 : 0;

function slidingWindowMedian(values, k) {
  if (!Array.isArray(values)) throw new TypeError("values must be an array");
  if (!Number.isInteger(k) || k < 1 || k > values.length) {
    throw new RangeError("k must be between 1 and values.length");
  }
  if (values.some(v => typeof v !== "number" || !Number.isFinite(v))) {
    throw new TypeError("values must contain only finite numbers");
  }

  const lower = new Heap((a, b) => cmp(b.value, a.value) || cmp(b.index, a.index));
  const upper = new Heap((a, b) => cmp(a.value, b.value) || cmp(a.index, b.index));
  const delayed = new Set();
  const side = new Map();
  let lowerCount = 0, upperCount = 0;

  function prune(heap) {
    while (heap.size && delayed.has(heap.peek().index)) {
      delayed.delete(heap.pop().index);
    }
  }
  function rebalance() {
    prune(lower); prune(upper);
    while (lowerCount > upperCount + 1) {
      const item = lower.pop();
      upper.push(item); side.set(item.index, "upper");
      lowerCount--; upperCount++;
      prune(lower);
    }
    while (lowerCount < upperCount) {
      const item = upper.pop();
      lower.push(item); side.set(item.index, "lower");
      upperCount--; lowerCount++;
      prune(upper);
    }
  }
  function add(value, index) {
    prune(lower);
    const item = { value, index };
    if (!lowerCount || value <= lower.peek().value) {
      lower.push(item); side.set(index, "lower"); lowerCount++;
    } else {
      upper.push(item); side.set(index, "upper"); upperCount++;
    }
    rebalance();
  }
  function remove(index) {
    const where = side.get(index);
    if (!where) throw new Error("missing heap membership");
    side.delete(index); delayed.add(index);
    if (where === "lower") lowerCount--;
    else upperCount--;
    prune(lower); prune(upper); rebalance();
  }
  function median() {
    prune(lower); prune(upper);
    return lowerCount > upperCount
      ? lower.peek().value
      : lower.peek().value / 2 + upper.peek().value / 2;
  }

  const result = [];
  for (let i = 0; i < values.length; i++) {
    if (i >= k) remove(i - k);
    add(values[i], i);
    if (i >= k - 1) result.push(median());
  }
  return result;
}

function assert(ok, message) { if (!ok) throw new Error(message || "assertion failed"); }
function same(actual, expected) {
  assert(actual.length === expected.length, "length mismatch");
  expected.forEach((v, i) => assert(Object.is(actual[i], v), "mismatch at " + i));
}
async function runTests() {
  same(slidingWindowMedian([1, 3, -1, -3, 5, 3, 6, 7], 3), [1, -1, -1, 3, 5, 6]);
  same(slidingWindowMedian([1, 2, 3, 4], 2), [1.5, 2.5, 3.5]);
  same(slidingWindowMedian([5, 5, 5, 5, 5], 3), [5, 5, 5]);
  same(slidingWindowMedian([-10, 0, 10], 1), [-10, 0, 10]);
  same(slidingWindowMedian([Number.MAX_VALUE, Number.MAX_VALUE], 2), [Number.MAX_VALUE]);
  let threw = false;
  try { slidingWindowMedian([1, NaN], 1); } catch (e) { threw = e instanceof TypeError; }
  assert(threw, "non-finite input must be rejected");
}
if (typeof module !== "undefined" && require.main === module) {
  runTests().then(() => console.log("sliding-window-median: tests passed"))
    .catch(e => { console.error(e); process.exitCode = 1; });
}
